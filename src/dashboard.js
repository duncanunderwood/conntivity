/**
 * Dashboard: current time (network-synced), local IP, public IP, DNS, gateway.
 * Browser cannot read gateway or DNS server; we show what we can get.
 */

const WORLD_TIME_API = 'https://worldtimeapi.org/api/ip';
const CLOUDFLARE_TRACE = 'https://api.cloudflare.com/cdn-cgi/trace';
const IPIFY_JSON = 'https://api.ipify.org?format=json';

let networkTimeOffsetMs = 0; // offset from system time to "internet" time (0 = use system)
let clockIntervalId = null;

/**
 * Fetch network time and timezone from internet; sets offset for display.
 */
export async function syncTimeFromInternet() {
  try {
    const res = await fetch(WORLD_TIME_API + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const serverMs = new Date(data.datetime).getTime();
    const localMs = Date.now();
    networkTimeOffsetMs = serverMs - localMs;
  } catch (_) {
    networkTimeOffsetMs = 0;
  }
}

/**
 * Current time string (local region), optionally synced from internet.
 */
export function getCurrentTimeString() {
  const now = new Date(Date.now() + networkTimeOffsetMs);
  return now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function getTimezoneString() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (_) {
    return '';
  }
}

/**
 * Get all local IPv4 addresses via WebRTC (best-effort). May return multiple (e.g. ethernet + wifi).
 * Browser does not indicate which IP is ethernet vs wifi.
 */
export function getLocalIPs() {
  return new Promise((resolve) => {
    const seen = new Set();
    const ips = [];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const done = () => {
      pc.close();
      resolve(ips);
    };
    pc.createDataChannel('');
    pc.createOffer().then((offer) => pc.setLocalDescription(offer));
    pc.onicecandidate = (e) => {
      const cand = e.candidate?.candidate;
      if (!cand) return;
      const m = cand.match(/^candidate:\d+ \d+ udp \d+ (\d+\.\d+\.\d+\.\d+)/);
      if (m && /^\d+\.\d+\.\d+\.\d+$/.test(m[1])) {
        const ip = m[1];
        if (ip !== '0.0.0.0' && !ip.startsWith('127.') && !seen.has(ip)) {
          seen.add(ip);
          ips.push(ip);
        }
      }
    };
    setTimeout(done, 3000);
  });
}

/**
 * Get local ethernet IP and local wifi IP for display.
 * When multiple IPs are found, first is shown as Ethernet and second as Wi‑Fi (browser cannot distinguish).
 * When one IP is found, it is shown under the current connection type (ethernet or wifi) when known.
 */
export async function getLocalEthernetAndWifiIPs() {
  const ips = await getLocalIPs();
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const type = conn && conn.type !== undefined ? String(conn.type).toLowerCase() : null;

  let ethernetIP = null;
  let wifiIP = null;

  if (ips.length >= 2) {
    ethernetIP = ips[0];
    wifiIP = ips[1];
  } else if (ips.length === 1) {
    if (type === 'ethernet' || type === 'wired') ethernetIP = ips[0];
    else if (type === 'wifi' || type === 'wifi-direct') wifiIP = ips[0];
    else {
      ethernetIP = ips[0];
      wifiIP = null;
    }
  }

  return { ethernetIP, wifiIP };
}

/**
 * Get public IP and optional extra info (e.g. from Cloudflare trace).
 */
export async function getPublicIPAndInfo() {
  try {
    const res = await fetch(CLOUDFLARE_TRACE + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Not ok');
    const text = await res.text();
    const map = {};
    text.split('\n').forEach((line) => {
      const i = line.indexOf('=');
      if (i > 0) map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    const resolverIP = await getResolverIP();
    return {
      publicIP: map.ip || null,
      resolverIP: resolverIP || null,
      gateway: null,
    };
  } catch (_) {
    try {
      const res = await fetch(IPIFY_JSON + '&t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      const resolverIP = await getResolverIP();
      return { publicIP: data.ip || null, resolverIP: resolverIP || null, gateway: null };
    } catch (__) {
      return { publicIP: null, resolverIP: null, gateway: null };
    }
  }
}

/**
 * Try to get the DNS resolver IP (best-effort; many environments don't expose this via CORS APIs).
 */
async function getResolverIP() {
  try {
    const res = await fetch('https://edns.ip-api.com/json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const ip = data.dns?.ip;
    if (typeof ip === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Start clock tick that updates the given element every second.
 */
export function startClock(element) {
  if (!element) return;
  function tick() {
    element.textContent = getCurrentTimeString();
      const tz = getTimezoneString();
      if (tz && element.dataset.tz) element.dataset.tz = tz;
  }
  tick();
  clockIntervalId = setInterval(tick, 1000);
}

export function stopClock() {
  if (clockIntervalId) clearInterval(clockIntervalId);
  clockIntervalId = null;
}

/**
 * Get connection type (Ethernet vs Wi‑Fi) when the Network Information API is available.
 * Returns user-facing label to confirm wired ethernet or wifi.
 */
export function getConnectionType() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn || conn.type === undefined) return null;
  const t = String(conn.type).toLowerCase();
  if (t === 'ethernet' || t === 'wired') return 'Wired (Ethernet)';
  if (t === 'wifi' || t === 'wifi-direct') return 'Wi‑Fi';
  if (t === 'cellular') return 'Cellular';
  return 'Unknown';
}

const REACHABILITY_TIMEOUT_MS = 8000;
const REACHABILITY_SITES = [
  { label: 'google.com.au', url: 'https://www.google.com.au/' },
  { label: 'microsoft.com.au', url: 'https://www.microsoft.com/en-au' },
  { label: 'abc.net.au', url: 'https://www.abc.net.au/' },
];

async function checkOneReachable(site) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
  try {
    await fetch(site.url + (site.url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { label: site.label, reachable: true };
  } catch (_) {
    clearTimeout(timeout);
    return { label: site.label, reachable: false };
  }
}

/**
 * Check whether google.com.au, microsoft.com.au and abc.net.au can be reached.
 */
export async function checkSiteReachability() {
  const results = await Promise.all(REACHABILITY_SITES.map(checkOneReachable));
  return results;
}
