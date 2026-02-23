const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

function toSecId(codeRaw) {
  if (!codeRaw) return null;
  const code = codeRaw.trim().toLowerCase();
  let digits = code.replace(/^sh|sz/, '');
  let market = null;
  if (code.startsWith('sh')) market = '1';
  if (code.startsWith('sz')) market = '0';
  if (!market) {
    if (/^[036]\d{5}$/.test(code)) {
      market = code.startsWith('6') ? '1' : '0';
      digits = code;
    }
  }
  if (!market || !/^\d{6}$/.test(digits)) return null;
  return `${market}.${digits}`;
}

function normalizeQuote(data) {
  const d = data && data.data ? data.data : null;
  if (!d) return null;
  return {
    code: d.f57,
    name: d.f58,
    price: d.f43,
    high: d.f44,
    low: d.f45,
    open: d.f46,
    prev_close: d.f47,
    volume: d.f86,
    amount: d.f60,
    turnover_rate: d.f170,
    time: d.f51
  };
}

app.get('/api/quote', async (req, res) => {
  try {
    const code = req.query.code || 'sh000001';
    const secid = toSecId(code);
    if (!secid) {
      return res.status(400).json({ error: 'invalid code' });
    }
    const fields = ['f57','f58','f43','f44','f45','f46','f47','f60','f86','f170','f51'].join(',');
    const url = `https://push2.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&fields=${fields}&secid=${encodeURIComponent(secid)}`;
    const r = await fetch(url, {
      headers: { 'Referer': 'https://quote.eastmoney.com', 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });
    if (!r.ok) return res.status(502).json({ error: 'upstream error', status: r.status });
    const json = await r.json();
    const result = normalizeQuote(json);
    if (!result) return res.status(404).json({ error: 'no data' });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'server error' });
  }
});

app.get('/api/market', async (req, res) => {
  try {
    const list = ['sh000001','sz399001','sz399006','sh000688'];
    const fields = ['f57','f58','f43','f44','f45','f46','f47','f60','f86','f170','f51'].join(',');
    const urls = list.map(c => {
      const secid = toSecId(c);
      return `https://push2.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&fields=${fields}&secid=${encodeURIComponent(secid)}`;
    });
    const rs = await Promise.all(urls.map(u => fetch(u, { headers: { 'Referer': 'https://quote.eastmoney.com','User-Agent': 'Mozilla/5.0' }, timeout: 8000 })));
    const js = await Promise.all(rs.map(r => r.ok ? r.json() : null));
    const data = js.map(j => normalizeQuote(j)).filter(Boolean).map(d => {
      const pc = Number(d.prev_close) || 0;
      const p = Number(d.price) || 0;
      const chg = pc ? p - pc : null;
      const pct = pc ? (chg / pc) * 100 : null;
      return Object.assign({}, d, { change: chg, change_pct: pct });
    });
    return res.json({ items: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'server error' });
  }
});

app.listen(PORT, () => {
  console.log(`A-share WebApp running on http://localhost:${PORT}`);
});
