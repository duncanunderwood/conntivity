import { defineConfig } from 'vite';

function getBuildTimestamp() {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
  const parts = formatter.formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month').padStart(2, '0');
  const day = get('day').padStart(2, '0');
  const hour = get('hour').padStart(2, '0');
  const minute = get('minute').padStart(2, '0');
  const tz = get('timeZoneName');
  return `${year}-${month}-${day} ${hour}:${minute} ${tz}`;
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(getBuildTimestamp()),
  },
});
