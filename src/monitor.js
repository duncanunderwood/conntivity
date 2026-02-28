/**
 * Fetch-based connectivity monitor. Polls CORS-enabled endpoints and tracks
 * RTT, success rate, and status (connected / degraded / disconnected).
 */

const DEFAULT_PING_INTERVAL_MS = 5000;
const PING_TIMEOUT_MS = 5000;
const FAILURES_FOR_OUTAGE = 3;
const DEGRADED_LATENCY_MS = 300;
const HISTORY_SIZE = 600; // ~25 min at 2.5s

const ENDPOINTS = [
  { url: 'https://api.cloudflare.com/cdn-cgi/trace', name: 'Cloudflare' },
  { url: 'https://httpbin.org/get', name: 'httpbin' },
  { url: 'https://api.ipify.org?format=json', name: 'ipify' },
];

let intervalId = null;
let consecutiveFailures = 0;
const latencyHistory = [];
const callbacks = { statusChange: [], latencyUpdate: [], outageDetected: [] };

export const STATUS = {
  CONNECTED: 'connected',
  DEGRADED: 'degraded',
  DISCONNECTED: 'disconnected',
  UNKNOWN: 'unknown',
};

function emit(event, data) {
  (callbacks[event] || []).forEach((fn) => fn(data));
}

function getResourceTiming() {
  const entries = performance.getEntriesByType('resource');
  const last = entries[entries.length - 1];
  if (!last || !('domainLookupEnd' in last)) return null;
  const dns = last.domainLookupEnd - last.domainLookupStart;
  const connect = last.connectEnd - last.connectStart;
  const ttfb = last.responseStart - last.requestStart;
  const download = last.responseEnd - last.responseStart;
  return { dns, connect, ttfb, download, total: last.responseEnd - last.requestStart };
}

async function pingOne(endpoint) {
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    await fetch(endpoint.url + (endpoint.url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const rtt = Math.round(performance.now() - start);
    return { ok: true, rtt, endpoint: endpoint.name, timing: getResourceTiming() };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, endpoint: endpoint.name };
  }
}

async function ping() {
  for (const ep of ENDPOINTS) {
    const result = await pingOne(ep);
    if (result.ok) {
      consecutiveFailures = 0;
      latencyHistory.push({ time: Date.now(), rtt: result.rtt });
      if (latencyHistory.length > HISTORY_SIZE) latencyHistory.shift();
      emit('latencyUpdate', {
        rtt: result.rtt,
        history: [...latencyHistory],
        timing: result.timing,
      });
      return;
    }
  }
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURES_FOR_OUTAGE) {
    emit('outageDetected', { consecutiveFailures });
  }
  emit('latencyUpdate', { rtt: null, history: [...latencyHistory], timing: null });
}

function computeStatus(rtt, history) {
  if (rtt == null) return STATUS.DISCONNECTED;
  const recent = history.slice(-30);
  const successRate = recent.length / 30;
  if (successRate < 0.7) return STATUS.DEGRADED;
  if (rtt >= DEGRADED_LATENCY_MS) return STATUS.DEGRADED;
  return STATUS.CONNECTED;
}

function onLatencyUpdate(data) {
  const status = computeStatus(data.rtt, data.history);
  emit('statusChange', { status, rtt: data.rtt, history: data.history });
}

export function startMonitoring(intervalMs = DEFAULT_PING_INTERVAL_MS) {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  emit('statusChange', { status: STATUS.UNKNOWN, rtt: null, history: [] });
  if (!callbacks.latencyUpdate.includes(onLatencyUpdate)) callbacks.latencyUpdate.push(onLatencyUpdate);
  ping();
  intervalId = setInterval(ping, intervalMs);
}

export function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  const idx = callbacks.latencyUpdate.indexOf(onLatencyUpdate);
  if (idx >= 0) callbacks.latencyUpdate.splice(idx, 1);
}

export function on(event, fn) {
  if (callbacks[event]) callbacks[event].push(fn);
}

export function off(event, fn) {
  if (!callbacks[event]) return;
  const i = callbacks[event].indexOf(fn);
  if (i >= 0) callbacks[event].splice(i, 1);
}

export function getLatencyHistory() {
  return [...latencyHistory];
}
