// api/zalo-token.js — Vercel Serverless Function
// Đổi Zalo authorization code → access_token → user info

export default async function handler(req, res) {
  // Cho phép CORS từ domain của bạn
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
    // Bước 1: Đổi code lấy access_token
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

    // Bước 2: Lấy thông tin user (id + name)
    const userRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
      headers: { 'access_token': tokenData.access_token },
    });
    const userData = await userRes.json();

    if (!userData.id) {
      return res.status(400).json({ error: 'Không lấy được thông tin user', detail: userData });
    }

    // Chỉ trả về những gì frontend cần — KHÔNG trả access_token
    return res.status(200).json({
      zaloId:   userData.id,
      zaloName: userData.name,
    });

  } catch (e) {
    return res.status(500).json({ error: 'Lỗi server', detail: e.message });
  }
}