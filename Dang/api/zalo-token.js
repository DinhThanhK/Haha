// api/zalo-token.js — Vercel Serverless Function
// Đổi Zalo authorization code → access_token → Zalo user ID

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
    // Đổi code lấy access_token
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

    // Lấy thông tin user — nếu lỗi -501 (sandbox) thì vẫn dùng được uid từ token
    let zaloId   = null;
    let zaloName = null;

    try {
      const userRes  = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name', {
        headers: { 'access_token': tokenData.access_token },
      });
      const userData = await userRes.json();
      if (userData.id) {
        zaloId   = userData.id;
        zaloName = userData.name || null;
      }
    } catch(e) {}

    // Fallback: lấy uid từ access_token (base64 phần giữa)
    if (!zaloId) {
      try {
        const parts = tokenData.access_token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          zaloId = String(payload.uid || payload.sub || payload.id || '');
        }
      } catch(e) {}
    }

    if (!zaloId) {
      return res.status(400).json({ error: 'Không lấy được Zalo ID', detail: tokenData });
    }

    return res.status(200).json({ zaloId, zaloName });

  } catch (e) {
    return res.status(500).json({ error: 'Lỗi server', detail: e.message });
  }
}