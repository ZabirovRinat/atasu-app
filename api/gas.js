export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const GAS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyQluQxEYnKJ0i6aLiZJ93VzEoyDsj8GYUdH_Jmjg9NIlDuFAoQaLQljH1lZQoRasaRvA/exec';

  try {
    const url = new URL(GAS_SCRIPT_URL);
    if (req.method === 'GET') {
      for (const [key, value] of Object.entries(req.query)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      method: req.method,
      headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
