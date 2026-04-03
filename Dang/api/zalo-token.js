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

    // Lấy thông tin user
    let zaloId   = null;
    let zaloName = null;

    try {
      const userRes  = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
        headers: { 'access_token': tokenData.access_token },
      });
      const userData = await userRes.json();
      console.log('Zalo user data:', JSON.stringify(userData));
      if (userData.id) {
        zaloId   = userData.id;
        zaloName = userData.name || null;
      }
    } catch(e) {
      console.error('Zalo user fetch error:', e.message);
    }

    // Fallback: lấy uid từ access_token nếu là JWT
    if (!zaloId) {
      try {
        const parts = tokenData.access_token.split('.');
        if (parts.length >= 2) {
          // Chuẩn hóa base64url → base64 chuẩn có padding
          const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = b64 + '=='.slice((b64.length % 4) || 4);
          const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
          console.log('JWT payload:', JSON.stringify(payload));
          zaloId = String(payload.uid || payload.sub || payload.id || '');
        }
      } catch(e) {
        console.error('JWT decode error:', e.message);
      }
    }

    if (!zaloId) {
      return res.status(400).json({ error: 'Không lấy được Zalo ID', detail: tokenData });
    }

    return res.status(200).json({ zaloId, zaloName });

  } catch (e) {
    return res.status(500).json({ error: 'Lỗi server', detail: e.message });
  }
}