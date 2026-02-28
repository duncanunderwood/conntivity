/**
 * Entry: init UI, start monitor, wire events.
 */

import * as monitor from './monitor.js';
import { initUI, bindMonitor, initHeaderControls } from './ui.js';

initUI();
bindMonitor(monitor);
initHeaderControls(monitor);
