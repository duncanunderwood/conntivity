/**
 * Entry: init UI, start monitor, wire events.
 */

import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import * as monitor from './monitor.js';
import { initUI, bindMonitor, initHeaderControls } from './ui.js';

inject();
injectSpeedInsights();

initUI();
bindMonitor(monitor);
initHeaderControls(monitor);

const buildTsEl = document.getElementById('build-timestamp');
if (buildTsEl && typeof __BUILD_TIMESTAMP__ !== 'undefined') buildTsEl.textContent = __BUILD_TIMESTAMP__;
