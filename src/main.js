/**
 * Entry: init UI, start monitor, wire events.
 */

import { inject } from '@vercel/analytics';
import * as monitor from './monitor.js';
import { initUI, bindMonitor, initHeaderControls } from './ui.js';

inject();

initUI();
bindMonitor(monitor);
initHeaderControls(monitor);
