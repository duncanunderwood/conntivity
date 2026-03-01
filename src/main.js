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
