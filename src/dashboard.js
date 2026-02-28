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

const IPv4_REGEX = /^\d+\.\d+\.\d+\.\d+$/;
const IPv6_REGEX = /^[0-9a-fA-F:]+$/;

function isIPv4(ip) {
  return IPv4_REGEX.test(ip);
}
function isIPv6(ip) {
  return IPv6_REGEX.test(ip) && !isIPv4(ip) && ip.length > 0;
}
function isLoopback(ip) {
  if (ip === '::1' || ip.startsWith('127.') || ip === '0.0.0.0') return true;
  if (ip.toLowerCase() === '::1') return true;
  return false;
}

/**
 * Get all local IPv4 and IPv6 addresses via WebRTC (best-effort).
 * ICE candidate format: "candidate:... priority ADDRESS port typ ..." — address is 5th token.
 */
export function getLocalIPs() {
  return new Promise((resolve) => {
    const seen = new Set();
    const ipv4 = [];
    const ipv6 = [];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const done = () => {
      pc.close();
      resolve({ ipv4, ipv6 });
    };
    pc.createDataChannel('');
    pc.createOffer().then((offer) => pc.setLocalDescription(offer));
    pc.onicecandidate = (e) => {
      const cand = e.candidate?.candidate;
      if (!cand) return;
      const parts = cand.trim().split(/\s+/);
      const address = parts[4];
      if (!address || isLoopback(address) || seen.has(address)) return;
      seen.add(address);
      if (isIPv4(address)) ipv4.push(address);
      else if (isIPv6(address)) ipv6.push(address);
    };
    setTimeout(done, 3000);
  });
}

/**
 * Get local ethernet IP, wifi IP, and a single local LAN IP (IPv4 or IPv6) for display.
 * Local LAN IP shows the machine's primary local address (prefer IPv4, else IPv6).
 */
export async function getLocalEthernetAndWifiIPs() {
  const { ipv4, ipv6 } = await getLocalIPs();
  const all = [...ipv4, ...ipv6];
  const localLANIP = ipv4[0] ?? ipv6[0] ?? null;

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const type = conn && conn.type !== undefined ? String(conn.type).toLowerCase() : null;

  let ethernetIP = null;
  let wifiIP = null;

  if (all.length >= 2) {
    ethernetIP = all[0];
    wifiIP = all[1];
  } else if (all.length === 1) {
    if (type === 'ethernet' || type === 'wired') ethernetIP = all[0];
    else if (type === 'wifi' || type === 'wifi-direct') wifiIP = all[0];
    else {
      ethernetIP = all[0];
      wifiIP = null;
    }
  }

  return { ethernetIP, wifiIP, localLANIP };
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

