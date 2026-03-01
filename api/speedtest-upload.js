/**
 * Vercel serverless: accepts POST body for speed test upload measurement.
 * Consumes the request body and returns 200 so the client can measure upload time.
 */
export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => res.status(200).json({ ok: true }));
  req.on('error', () => res.status(500).end());
}
