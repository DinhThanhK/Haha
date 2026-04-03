// api/zalo-token.js — Vercel Serverless Function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://diemdanh-chibo-huce.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, code_verifier } = req.body;
  if (!code) return res.status(400).json({ error: 'Thiếu code' });

  const APP_ID     = process.env.ZALO_APP_ID;
  const APP_SECRET = process.env.ZALO_APP_SECRET;

  try {
    // Bước 1: Đổi code → access_token
    const tokenRes = await fetch('https://oauth.zaloapp.com/v4/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': APP_SECRET,
      },
      body: new URLSearchParams({
        app_id:        APP_ID,
        code:          code,
        grant_type:    'authorization_code',
        code_verifier: code_verifier || '',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Không lấy được access_token', detail: tokenData });
    }

    const accessToken = tokenData.access_token;

    // Bước 2: Lấy thông tin user qua Social API
    // Thử cả 2 cách gọi — Zalo thay đổi spec nhiều lần
    let zaloId   = null;
    let zaloName = null;
    let userDebug = {};

    // Cách 1: header access_token (v2.0)
    try {
      const r1 = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
        headers: { 'access_token': accessToken },
      });
      const d1 = await r1.json();
      userDebug.v2_header = d1;
      if (d1.id) { zaloId = d1.id; zaloName = d1.name || null; }
    } catch(e) { userDebug.v2_header_err = e.message; }

    // Cách 2: Bearer token (một số version mới)
    if (!zaloId) {
      try {
        const r2 = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const d2 = await r2.json();
        userDebug.v2_bearer = d2;
        if (d2.id) { zaloId = d2.id; zaloName = d2.name || null; }
      } catch(e) { userDebug.v2_bearer_err = e.message; }
    }

    // Cách 3: OpenID userinfo endpoint
    if (!zaloId) {
      try {
        const r3 = await fetch('https://graph.zalo.me/v2.0/me/info', {
          headers: { 'access_token': accessToken },
        });
        const d3 = await r3.json();
        userDebug.v2_info = d3;
        if (d3.id) { zaloId = d3.id; zaloName = d3.name || null; }
      } catch(e) { userDebug.v2_info_err = e.message; }
    }

    // Trả về debug info để biết Zalo đang trả gì
    if (!zaloId) {
      return res.status(400).json({
        error: 'Không lấy được Zalo ID',
        debug: userDebug,
        token_type: typeof accessToken,
        token_preview: accessToken.substring(0, 30) + '...',
        has_dot: accessToken.includes('.'),
      });
    }

    return res.status(200).json({ zaloId, zaloName });

  } catch (e) {
    return res.status(500).json({ error: 'Lỗi server', detail: e.message });
  }
}