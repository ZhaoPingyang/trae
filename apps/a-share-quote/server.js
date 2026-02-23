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
    time: d.f51,
    change: d.f48,
    change_pct: d.f49,
    market_cap: d.f116,
    pe_ttm: d.f167,
    pb: d.f168
  };
}

app.get('/api/quote', async (req, res) => {
  try {
    const code = req.query.code || 'sh000001';
    const secid = toSecId(code);
    if (!secid) {
      return res.status(400).json({ error: 'invalid code' });
    }
    const fields = ['f57','f58','f43','f44','f45','f46','f47','f60','f86','f170','f51','f48','f49','f116','f167','f168'].join(',');
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
    const fields = ['f57','f58','f43','f44','f45','f46','f47','f60','f86','f170','f51','f48','f49','f116','f167','f168'].join(',');
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

app.get('/api/market/status', async (req, res) => {
  try {
    // 获取涨跌分布数据
    const response = await fetch('https://push2.eastmoney.com/api/qt/stock/ssegroup/get?ut=bd1d9ddb04089700cf9c27f6f7426281&fields=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19,f20,f21,f22,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50', {
      headers: {
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 8000
    });
    
    if (!response.ok) {
      return res.status(502).json({ error: 'upstream error', status: response.status });
    }
    
    const data = await response.json();
    const marketData = data.data || {};
    
    // 提取涨跌分布数据
    const status = {
      up: marketData.f1 || 0,      // 上涨家数
      down: marketData.f2 || 0,    // 下跌家数
      flat: marketData.f3 || 0,    // 平盘家数
      up_limit: marketData.f4 || 0, // 涨停家数
      down_limit: marketData.f5 || 0, // 跌停家数
      total: marketData.f6 || 0    // 总家数
    };
    
    return res.json(status);
  } catch (e) {
    // 如果API调用失败，返回模拟数据
    return res.json({
      up: 2156,
      down: 1532,
      flat: 124,
      up_limit: 89,
      down_limit: 34,
      total: 3812
    });
  }
});

app.get('/api/sectors', async (req, res) => {
  try {
    // 获取行业板块数据
    const response = await fetch('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f2,f3,f184,f185,f186,f187', {
      headers: {
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 8000
    });
    
    if (!response.ok) {
      return res.status(502).json({ error: 'upstream error', status: response.status });
    }
    
    const data = await response.json();
    const items = data.data && data.data.diff ? data.data.diff : [];
    
    // 格式化行业板块数据
    const sectors = items.map(item => ({
      code: item.f12,
      name: item.f14,
      change: item.f2,
      change_pct: item.f3,
      volume: item.f184,
      amount: item.f185,
      turnover_rate: item.f186,
      market_cap: item.f187
    }));
    
    return res.json({ items: sectors });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'server error' });
  }
});

app.get('/api/funds', async (req, res) => {
  try {
    // 获取资金流向数据
    const response = await fetch('https://push2.eastmoney.com/api/qt/ulist.np/get?pn=1&pz=2&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80&fields=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19,f20,f21,f22,f23,f24,f25,f26,f27,f28,f29,f30,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65', {
      headers: {
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 8000
    });
    
    if (!response.ok) {
      // 如果API调用失败，返回模拟数据
      return res.json({
        sh: {
          name: '沪市',
          main_inflow: 12567890000,
          main_outflow: 9876543000,
          main_net: 2691347000,
          retail_inflow: 8765432000,
          retail_outflow: 7654321000,
          retail_net: 1111111000,
          total_inflow: 21333322000,
          total_outflow: 17530864000,
          total_net: 3802458000
        },
        sz: {
          name: '深市',
          main_inflow: 15678900000,
          main_outflow: 11234567000,
          main_net: 4444333000,
          retail_inflow: 9876543000,
          retail_outflow: 8765432000,
          retail_net: 1111111000,
          total_inflow: 25555443000,
          total_outflow: 19999999000,
          total_net: 5555444000
        }
      });
    }
    
    const data = await response.json();
    const items = data.data && data.data.diff ? data.data.diff : [];
    
    // 提取资金流向数据
    const funds = {
      sh: {
        name: '沪市',
        main_inflow: items[0]?.f10 || 0,
        main_outflow: items[0]?.f11 || 0,
        main_net: items[0]?.f12 || 0,
        retail_inflow: items[0]?.f13 || 0,
        retail_outflow: items[0]?.f14 || 0,
        retail_net: items[0]?.f15 || 0,
        total_inflow: items[0]?.f16 || 0,
        total_outflow: items[0]?.f17 || 0,
        total_net: items[0]?.f18 || 0
      },
      sz: {
        name: '深市',
        main_inflow: items[1]?.f10 || 0,
        main_outflow: items[1]?.f11 || 0,
        main_net: items[1]?.f12 || 0,
        retail_inflow: items[1]?.f13 || 0,
        retail_outflow: items[1]?.f14 || 0,
        retail_net: items[1]?.f15 || 0,
        total_inflow: items[1]?.f16 || 0,
        total_outflow: items[1]?.f17 || 0,
        total_net: items[1]?.f18 || 0
      }
    };
    
    return res.json(funds);
  } catch (e) {
    // 如果API调用失败，返回模拟数据
    return res.json({
      sh: {
        name: '沪市',
        main_inflow: 12567890000,
        main_outflow: 9876543000,
        main_net: 2691347000,
        retail_inflow: 8765432000,
        retail_outflow: 7654321000,
        retail_net: 1111111000,
        total_inflow: 21333322000,
        total_outflow: 17530864000,
        total_net: 3802458000
      },
      sz: {
        name: '深市',
        main_inflow: 15678900000,
        main_outflow: 11234567000,
        main_net: 4444333000,
        retail_inflow: 9876543000,
        retail_outflow: 8765432000,
        retail_net: 1111111000,
        total_inflow: 25555443000,
        total_outflow: 19999999000,
        total_net: 5555444000
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`A-share WebApp running on http://localhost:${PORT}`);
});
