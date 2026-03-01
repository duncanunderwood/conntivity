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
 * Format IANA timezone (e.g. "Australia/Sydney") as "City / Country" for display.
 */
export function getTimezoneDisplayString() {
  const tz = getTimezoneString();
  if (!tz) return '';
  const parts = tz.split('/');
  if (parts.length < 2) return tz.replace(/_/g, ' ');
  const region = parts[0].replace(/_/g, ' ');
  const city = parts[parts.length - 1].replace(/_/g, ' ');
  return `${city} / ${region}`;
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

/** RFC 1918 private IPv4: 10.x.x.x, 172.16.x.x–172.31.x.x, 192.168.x.x (LAN side of router). */
function isPrivateIPv4(ip) {
  if (!isIPv4(ip)) return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
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
 * Get local ethernet IP, wifi IP, and a single local LAN IP for display.
 * localLANIP = device's subnet address on the LAN (given by the router): 10.x.x.x, 172.16–31.x.x, or 192.168.x.x.
 * subnetMask = not available in browser (would come from ipconfig); always null.
 */
export async function getLocalEthernetAndWifiIPs() {
  const { ipv4, ipv6 } = await getLocalIPs();
  const all = [...ipv4, ...ipv6];
  const privateV4 = ipv4.filter(isPrivateIPv4);
  const localLANIP = privateV4[0] ?? ipv4[0] ?? ipv6[0] ?? null;

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
 * Get public IP (WAN side of router) and DNS resolver(s).
 * Public IP = the router's IP as seen from the internet.
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
    const { dns1 } = await getDnsResolvers();
    return { publicIP: map.ip || null, dns1: dns1 || null };
  } catch (_) {
    try {
      const res = await fetch(IPIFY_JSON + '&t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      const { dns1 } = await getDnsResolvers();
      return { publicIP: data.ip || null, dns1: dns1 || null };
    } catch (__) {
      return { publicIP: null, dns1: null };
    }
  }
}

/**
 * Get DNS resolver IP used by the browser (best-effort).
 */
async function getDnsResolvers() {
  try {
    const res = await fetch('https://edns.ip-api.com/json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return { dns1: null };
    const data = await res.json();
    const ip = data.dns?.ip;
    const dns1 = typeof ip === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : null;
    return { dns1 };
  } catch (_) {
    return { dns1: null };
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

