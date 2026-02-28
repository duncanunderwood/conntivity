/**
 * Outage diagnostics: multi-endpoint probe, DNS/connect hints from Resource Timing,
 * and user-facing troubleshooting tips.
 */

const DIAG_ENDPOINTS = [
  { url: 'https://api.cloudflare.com/cdn-cgi/trace', name: 'Cloudflare' },
  { url: 'https://httpbin.org/get', name: 'httpbin' },
  { url: 'https://api.ipify.org?format=json', name: 'ipify' },
  { url: 'https://www.google.com/favicon.ico', name: 'Google (beacon)', beacon: true },
];

const DNS_SLOW_MS = 100;
const CONNECT_SLOW_MS = 200;

function getResourceTimingForUrl(url) {
  const entries = performance.getEntriesByType('resource');
  const match = entries.filter((e) => e.name && e.name.startsWith(url)).pop();
  if (!match || !('domainLookupEnd' in match)) return null;
  const dns = match.domainLookupEnd - match.domainLookupStart;
  const connect = match.connectEnd - match.connectStart;
  const ttfb = match.responseStart - match.requestStart;
  const download = match.responseEnd - match.responseStart;
  return { dns, connect, ttfb, download, total: match.responseEnd - match.requestStart };
}

function probeBeacon(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const start = performance.now();
    const u = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    img.onload = () => resolve({ ok: true, rtt: Math.round(performance.now() - start) });
    img.onerror = () => resolve({ ok: false });
    img.src = u;
  });
}

async function probeEndpoint(ep) {
  if (ep.beacon) {
    return probeBeacon(ep.url).then((r) => ({ ...r, name: ep.name }));
  }
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(ep.url + (ep.url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: true, rtt: Math.round(performance.now() - start), name: ep.name };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, name: ep.name };
  }
}

/**
 * Run full diagnostics and return structured result + suggestions.
 * @returns {Promise<{ dnsOk: boolean, endpointsReached: string[], latencyBreakdown: Object|null, suggestions: string[] }>}
 */
export async function runDiagnostics() {
  const results = await Promise.all(DIAG_ENDPOINTS.map(probeEndpoint));
  const endpointsReached = results.filter((r) => r.ok).map((r) => r.name);
  const allFailed = endpointsReached.length === 0;
  const someFailed = endpointsReached.length > 0 && endpointsReached.length < DIAG_ENDPOINTS.length;

  let latencyBreakdown = null;
  for (const ep of DIAG_ENDPOINTS) {
    if (ep.beacon) continue;
    const timing = getResourceTimingForUrl(ep.url);
    if (timing) {
      latencyBreakdown = timing;
      break;
    }
  }

  const suggestions = [];

  if (allFailed) {
    suggestions.push('Check modem and router — power cycle both and wait a minute.');
    suggestions.push('Confirm other devices on the same network — if they’re also offline, the issue is likely your ISP or equipment.');
    suggestions.push('Contact your ISP if the outage continues.');
  } else if (someFailed) {
    suggestions.push('Some services are reachable and others aren’t — specific sites or providers may be down.');
    suggestions.push('Try a different website or app to see if the problem is limited to one service.');
  }

  if (latencyBreakdown) {
    const { dns, connect } = latencyBreakdown;
    if (dns >= DNS_SLOW_MS) {
      suggestions.push('DNS is slow — try changing your DNS to 8.8.8.8 (Google) or 1.1.1.1 (Cloudflare) in your router or device settings.');
    }
    if (connect >= CONNECT_SLOW_MS) {
      suggestions.push('Connection to the server is slow — check firewall, VPN, or local network congestion.');
    }
  }

  const dnsOk = endpointsReached.length > 0;

  return {
    dnsOk,
    endpointsReached,
    latencyBreakdown,
    suggestions: [...new Set(suggestions)],
  };
}
