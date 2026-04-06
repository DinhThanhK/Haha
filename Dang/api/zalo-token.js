// api/zalo-token.js
module.exports = async function handler(req, res) {
res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, code_verifier } = req.body;
  if (!code) return res.status(400).json({ error: 'Thiếu code' });

  const APP_ID     = process.env.ZALO_APP_ID;
  const APP_SECRET = process.env.ZALO_APP_SECRET;

  try {
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

    

// Thêm đoạn này để debug
    const rawText = await tokenRes.text();
    console.log('Zalo raw response:', rawText);

    let tokenData;
    try {
      tokenData = JSON.parse(rawText);
    } catch(e) {
      return res.status(500).json({ error: 'Zalo trả về không phải JSON', raw: rawText });
    }
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Không lấy được access_token', detail: tokenData });
    }

    return res.status(200).json({ access_token: tokenData.access_token });

  } catch (e) {
    return res.status(500).json({ error: 'Lỗi server', detail: e.message });
  }
}