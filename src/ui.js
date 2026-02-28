/**
 * DOM updates: status light, latency, last-seen, diagnostics panel, chart, dashboard.
 */

import { STATUS } from './monitor.js';
import { initChart, updateChart, resizeChart } from './chart.js';
import { runDiagnostics } from './diagnostics.js';
import {
  syncTimeFromInternet,
  startClock,
  getLocalEthernetAndWifiIPs,
  getPublicIPAndInfo,
  getTimezoneString,
} from './dashboard.js';

const statusLight = document.getElementById('status-light');
const statusText = document.getElementById('status-text');
const latencyValue = document.getElementById('latency-value');
const lastSeenEl = document.getElementById('last-seen');
const diagnosticsSection = document.getElementById('diagnostics-section');
const diagnosticsBreakdown = document.getElementById('diagnostics-breakdown');
const diagnosticsTips = document.getElementById('diagnostics-tips');
const dashboardTime = document.getElementById('dashboard-time');
const dashboardLocalLanIP = document.getElementById('dashboard-local-lan-ip');
const dashboardLocalWifiIP = document.getElementById('dashboard-local-wifi-ip');
const dashboardPublicIP = document.getElementById('dashboard-public-ip');
const dashboardDnsIP = document.getElementById('dashboard-dns-ip');

let lastConnectedAt = null;
let lastMonitorUpdateAt = 0;

const GRAPH_WATCHDOG_INTERVAL_MS = 10000;
const GRAPH_STALE_MS = 25000;

function formatLastSeenTime(ms) {
  if (ms == null) return '—';
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function setStatusLight(status) {
  if (!statusLight) return;
  statusLight.className = 'status-light status-' + (status || STATUS.UNKNOWN);
  statusLight.setAttribute('aria-label', 'Connection status: ' + (status || 'unknown'));
}

function setStatusText(status) {
  if (!statusText) return;
  const labels = {
    [STATUS.CONNECTED]: 'Connected',
    [STATUS.DEGRADED]: 'Degraded',
    [STATUS.DISCONNECTED]: 'Disconnected',
    [STATUS.UNKNOWN]: 'Checking…',
  };
  statusText.textContent = labels[status] || 'Checking…';
}

function setLatency(rtt) {
  if (!latencyValue) return;
  latencyValue.textContent = rtt != null ? `${rtt} ms` : '— ms';
}

function setLastSeen(justConnected) {
  if (justConnected) lastConnectedAt = Date.now();
  if (lastSeenEl) lastSeenEl.textContent = 'Last seen: ' + formatLastSeenTime(lastConnectedAt);
}

function showDiagnostics(open) {
  if (!diagnosticsSection) return;
  if (open) diagnosticsSection.classList.remove('hidden');
  else diagnosticsSection.classList.add('hidden');
}

function renderBreakdown(breakdown) {
  if (!diagnosticsBreakdown) return;
  if (!breakdown) {
    diagnosticsBreakdown.textContent = 'No timing data available.';
    return;
  }
  const { dns, connect, ttfb, download, total } = breakdown;
  diagnosticsBreakdown.textContent = [
    `DNS: ${Math.round(dns)} ms`,
    `Connect: ${Math.round(connect)} ms`,
    `TTFB: ${Math.round(ttfb)} ms`,
    `Download: ${Math.round(download)} ms`,
    `Total: ${Math.round(total)} ms`,
  ].join('  ·  ');
}

function renderTips(suggestions) {
  if (!diagnosticsTips) return;
  diagnosticsTips.innerHTML = '';
  (suggestions || []).forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    diagnosticsTips.appendChild(li);
  });
}

const DEFAULT_DISCONNECTED_TIPS = [
  'Check modem and router — power cycle both and wait a minute.',
  'Confirm other devices on the same network. If they are also offline, the issue is likely your ISP or equipment.',
  'Check that cables are firmly connected (ethernet, power).',
  'Contact your ISP if the outage continues.',
];

function setAllIPsToDash() {
  if (dashboardLocalLanIP) dashboardLocalLanIP.textContent = '—';
  if (dashboardLocalWifiIP) dashboardLocalWifiIP.textContent = '—';
  if (dashboardPublicIP) dashboardPublicIP.textContent = '—';
  if (dashboardDnsIP) dashboardDnsIP.textContent = '—';
}

async function refreshDashboardIPs() {
  const { ethernetIP, wifiIP, localLANIP } = await getLocalEthernetAndWifiIPs();
  const info = await getPublicIPAndInfo();
  if (dashboardLocalLanIP) dashboardLocalLanIP.textContent = localLANIP || '—';
  if (dashboardLocalWifiIP) dashboardLocalWifiIP.textContent = wifiIP || '—';
  if (dashboardPublicIP) dashboardPublicIP.textContent = info.publicIP || '—';
  if (dashboardDnsIP) dashboardDnsIP.textContent = info.resolverIP || '—';
}

async function runAndShowDiagnostics() {
  showDiagnostics(true);
  diagnosticsBreakdown.textContent = 'Running diagnostics…';
  diagnosticsTips.innerHTML = '';
  try {
    const result = await runDiagnostics();
    renderBreakdown(result.latencyBreakdown);
    renderTips(result.suggestions);
  } catch (e) {
    renderBreakdown(null);
    renderTips(['Diagnostics could not be completed. Check the console for errors.']);
  }
}

export function bindMonitor(monitor) {
  lastMonitorUpdateAt = Date.now();
  monitor.on('statusChange', ({ status, rtt, history }) => {
    lastMonitorUpdateAt = Date.now();
    setStatusLight(status);
    setStatusText(status);
    setLatency(rtt);
    setLastSeen(status === STATUS.CONNECTED);
    updateChart(history || []);
    if (status === STATUS.DISCONNECTED) {
      setAllIPsToDash();
      showDiagnostics(true);
      if (diagnosticsBreakdown) diagnosticsBreakdown.textContent = 'No connection.';
      renderTips(DEFAULT_DISCONNECTED_TIPS);
    } else if (status === STATUS.CONNECTED) {
      showDiagnostics(false);
      refreshDashboardIPs();
    }
  });

  monitor.on('outageDetected', () => {
    lastMonitorUpdateAt = Date.now();
    runAndShowDiagnostics();
  });

  setInterval(() => {
    if (lastMonitorUpdateAt > 0 && Date.now() - lastMonitorUpdateAt > GRAPH_STALE_MS) {
      window.location.reload();
    }
  }, GRAPH_WATCHDOG_INTERVAL_MS);
}

async function initDashboard() {
  await syncTimeFromInternet();
  startClock(dashboardTime);
  const tz = getTimezoneString();
  if (dashboardTime && tz) dashboardTime.setAttribute('title', 'Timezone: ' + tz);

  const { ethernetIP, wifiIP, localLANIP } = await getLocalEthernetAndWifiIPs();
  if (dashboardLocalLanIP) dashboardLocalLanIP.textContent = localLANIP || '—';
  if (dashboardLocalWifiIP) dashboardLocalWifiIP.textContent = wifiIP || '—';

  const info = await getPublicIPAndInfo();
  if (dashboardPublicIP) dashboardPublicIP.textContent = info.publicIP || '—';
  if (dashboardDnsIP) dashboardDnsIP.textContent = info.resolverIP || '—';
}

const THEME_KEY = 'conntivity-theme';
const INTERVAL_KEY = 'conntivity-interval';

export function initUI() {
  const container = document.getElementById('chart-container');
  if (container) initChart(container);

  window.addEventListener('resize', resizeChart);

  setStatusLight(STATUS.UNKNOWN);
  setStatusText(STATUS.UNKNOWN);
  setLatency(null);
  setLastSeen(false);

  initDashboard();
}

export function initHeaderControls(monitor) {
  const themeToggle = document.getElementById('theme-toggle');
  const intervalSelect = document.getElementById('interval-select');
  const refreshBtn = document.getElementById('refresh-btn');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => window.location.reload());
  }

  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  if (themeToggle) {
    themeToggle.textContent = savedTheme === 'dark' ? 'Light' : 'Dark';
    themeToggle.addEventListener('click', () => {
      const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      themeToggle.textContent = next === 'dark' ? 'Light' : 'Dark';
    });
  }

  const savedInterval = localStorage.getItem(INTERVAL_KEY) || '1';
  if (intervalSelect) {
    intervalSelect.value = savedInterval;
    intervalSelect.addEventListener('change', () => {
      const sec = Number(intervalSelect.value);
      localStorage.setItem(INTERVAL_KEY, String(sec));
      monitor.startMonitoring(sec * 1000);
    });
    monitor.startMonitoring(Number(savedInterval) * 1000);
  } else {
    monitor.startMonitoring(5000);
  }
}
