/**
 * Latency-over-time chart using Lightweight Charts.
 * X-axis shows local time. Values ≤50ms = cyan, >50ms = red.
 */

import { createChart } from 'lightweight-charts';

let chart = null;
let seriesLow = null;
let seriesHigh = null;

const CHART_MAX_POINTS = 600;
const LATENCY_RED_THRESHOLD_MS = 50;

/** Format Unix timestamp (seconds) as local time for the chart axis */
function formatLocalTime(utcSeconds, tickMarkType) {
  const date = new Date(utcSeconds * 1000);
  if (tickMarkType === 0 || tickMarkType === 1) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (tickMarkType === 2) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function initChart(container) {
  if (!container) return;

  chart = createChart(container, {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#8b8f99',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.04)' },
      horzLines: { color: 'rgba(255,255,255,0.04)' },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: { top: 0.1, bottom: 0.1 },
      textColor: '#8b8f99',
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: (time, tickMarkType) => {
        let sec = null;
        if (typeof time === 'number') sec = time;
        else if (typeof time === 'string') sec = new Date(time).getTime() / 1000;
        else if (time && typeof time === 'object' && 'year' in time && 'month' in time && 'day' in time)
          sec = new Date(time.year, time.month - 1, time.day).getTime() / 1000;
        if (sec == null) return null;
        return formatLocalTime(sec, tickMarkType);
      },
    },
    crosshair: {
      vertLine: { labelVisible: true },
      horzLine: { labelVisible: true },
    },
    width: container.clientWidth,
    height: container.clientHeight,
  });

  seriesLow = chart.addLineSeries({
    color: '#22d3ee',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    lastValueVisible: true,
    priceLineVisible: true,
  });

  seriesHigh = chart.addLineSeries({
    color: '#f87171',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    lastValueVisible: true,
    priceLineVisible: true,
  });

  return chart;
}

export function updateChart(history) {
  if (!seriesLow || !seriesHigh || !history || history.length === 0) return;

  const slice = history.slice(-CHART_MAX_POINTS);
  const dataLow = [];
  const dataHigh = [];

  slice.forEach(({ time, rtt }) => {
    const t = Math.floor(time / 1000);
    if (rtt <= LATENCY_RED_THRESHOLD_MS) {
      dataLow.push({ time: t, value: rtt });
      dataHigh.push({ time: t }); // whitespace
    } else {
      dataLow.push({ time: t }); // whitespace
      dataHigh.push({ time: t, value: rtt });
    }
  });

  seriesLow.setData(dataLow);
  seriesHigh.setData(dataHigh);
  chart.timeScale().fitContent();
}

export function resizeChart() {
  const container = document.querySelector('.chart-container');
  if (chart && container) chart.resize(container.clientWidth, container.clientHeight);
}
