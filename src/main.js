/**
 * Entry: init UI, start monitor, wire events.
 */

import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import * as monitor from './monitor.js';
import { initUI, bindMonitor, initHeaderControls } from './ui.js';

/** Set to your Stripe Payment Link URL (e.g. https://buy.stripe.com/...) or leave '#' to disable. */
const STRIPE_PAYMENT_LINK = '#';

inject();
injectSpeedInsights();

initUI();
bindMonitor(monitor);
initHeaderControls(monitor);

const supportBtn = document.getElementById('support-us-btn');
if (supportBtn && STRIPE_PAYMENT_LINK !== '#') supportBtn.href = STRIPE_PAYMENT_LINK;
