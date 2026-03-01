/**
 * Client-side speed test: download then upload, results in Mbps.
 * Uses public endpoints (OVH file, httpbin) for measurement.
 */

const DOWNLOAD_URL = 'https://proof.ovh.net/files/10Mb.dat';
const UPLOAD_URL = 'https://httpbin.org/post';
const UPLOAD_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB for upload test

const stateEl = document.getElementById('speedtest-state');
const downloadValEl = document.getElementById('speedtest-download');
const uploadValEl = document.getElementById('speedtest-upload');
const downloadBarEl = document.getElementById('speedtest-download-bar');
const uploadBarEl = document.getElementById('speedtest-upload-bar');
const resultEl = document.getElementById('speedtest-result');
const btnEl = document.getElementById('speedtest-btn');

function setState(text) {
  if (stateEl) stateEl.textContent = text;
}

function setDownloadMbps(mbps, progress = 1) {
  if (downloadValEl) downloadValEl.textContent = mbps != null ? `${mbps.toFixed(2)} Mbps` : '— Mbps';
  if (downloadBarEl) {
    downloadBarEl.style.width = `${Math.min(100, progress * 100)}%`;
    downloadBarEl.classList.toggle('active', progress > 0 && progress < 1);
  }
}

function setUploadMbps(mbps, progress = 1) {
  if (uploadValEl) uploadValEl.textContent = mbps != null ? `${mbps.toFixed(2)} Mbps` : '— Mbps';
  if (uploadBarEl) {
    uploadBarEl.style.width = `${Math.min(100, progress * 100)}%`;
    uploadBarEl.classList.toggle('active', progress > 0 && progress < 1);
  }
}

function showResult(downloadMbps, uploadMbps) {
  if (!resultEl) return;
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `
    <span class="speedtest-result-label">Result</span>
    <span class="speedtest-result-download">Download <strong>${downloadMbps.toFixed(2)}</strong> Mbps</span>
    <span class="speedtest-result-upload">Upload <strong>${uploadMbps.toFixed(2)}</strong> Mbps</span>
  `;
}

function hideResult() {
  if (resultEl) {
    resultEl.classList.add('hidden');
    resultEl.innerHTML = '';
  }
}

function setRunning(running) {
  if (btnEl) {
    btnEl.disabled = running;
    btnEl.textContent = running ? 'Testing…' : 'Run speed test';
  }
}

/**
 * Run download test: fetch stream, count bytes, measure time.
 */
async function runDownloadTest() {
  const start = performance.now();
  let bytes = 0;
  const cacheBust = '?t=' + Date.now();

  const res = await fetch(DOWNLOAD_URL + cacheBust, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error('Download failed');

  const reader = res.body.getReader();
  const reportInterval = 200;
  let lastReport = start;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    const now = performance.now();
    if (now - lastReport >= reportInterval) {
      const elapsedSec = (now - start) / 1000;
      const mbps = (bytes * 8) / 1e6 / elapsedSec;
      setDownloadMbps(mbps, Math.min(1, bytes / (10 * 1024 * 1024))); // 10MB cap for progress
      lastReport = now;
    }
  }

  const elapsedSec = (performance.now() - start) / 1000;
  const mbps = (bytes * 8) / 1e6 / elapsedSec;
  setDownloadMbps(mbps, 1);
  return mbps;
}

/**
 * Run upload test: POST a 1MB blob to httpbin, measure time.
 */
async function runUploadTest() {
  const blob = new Blob([new Uint8Array(UPLOAD_SIZE_BYTES)]);
  const start = performance.now();

  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: blob,
    mode: 'cors',
    headers: { 'Content-Type': 'application/octet-stream' },
  });

  const elapsedSec = (performance.now() - start) / 1000;
  if (!res.ok) throw new Error('Upload failed');

  const mbps = (UPLOAD_SIZE_BYTES * 8) / 1e6 / elapsedSec;
  setUploadMbps(mbps, 1);
  return mbps;
}

/**
 * Run full test: download first, then upload, then show result.
 */
export async function runSpeedTest() {
  if (!stateEl || !downloadValEl || !uploadValEl) return;

  setRunning(true);
  hideResult();
  setState('Testing download…');
  setDownloadMbps(null, 0);
  setUploadMbps(null, 0);

  let downloadMbps = 0;
  let uploadMbps = 0;
  let err = null;

  try {
    downloadMbps = await runDownloadTest();
  } catch (e) {
    err = e;
    setState('Download failed');
    setDownloadMbps(null, 0);
  }

  if (!err) {
    setState('Testing upload…');
    try {
      uploadMbps = await runUploadTest();
    } catch (e) {
      err = e;
      setState('Upload failed');
      setUploadMbps(null, 0);
    }
  }

  if (err) {
    setState('Speed test failed');
    setRunning(false);
    return;
  }

  setState('Complete');
  showResult(downloadMbps, uploadMbps);
  setRunning(false);
}

export function initSpeedTest() {
  if (!btnEl) return;
  btnEl.addEventListener('click', runSpeedTest);
}
