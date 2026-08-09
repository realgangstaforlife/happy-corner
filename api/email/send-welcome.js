import { Resend } from 'resend';
import { applyCors, json } from '../_lib/http.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const { email, name } = req.body || {};
    if (!email || !name) return json(res, 400, { error: 'Missing email or name' });

    try {
        await resend.emails.send({
            from: 'Happy Corner <bienvenida@happycorner.top>',
            to: email,
            subject: '¡Bienvenido a Happy Corner! 🍭',
            html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f0f8;font-family:'Arial',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f0f8;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a0a1a;border-radius:20px;overflow:hidden;max-width:560px;width:100%;">
        <!-- Header gradient bar -->
        <tr><td style="background:linear-gradient(135deg,#ff6b9d,#ff9d5c,#ffd45e);height:6px;"></td></tr>
        <!-- Logo area -->
        <tr><td align="center" style="padding:40px 32px 20px;">
          <div style="font-size:36px;margin-bottom:8px;">🍭</div>
          <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Happy Corner</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 32px 32px;">
          <h1 style="color:#ff6b9d;font-size:22px;font-weight:800;margin:0 0 16px;">¡Hola, ${name}! 🎉</h1>
          <p style="color:#ccc;font-size:15px;line-height:1.7;margin:0 0 20px;">
            ¡Qué emoción tenerte con nosotros! Tu cuenta de Happy Corner está lista y puedes empezar a disfrutar de todos nuestros productos favoritos.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#2a1a2a;border-radius:12px;padding:20px;margin-bottom:24px;">
            <tr>
              <td style="padding:6px 0;color:#ff9d5c;font-size:14px;">🍕 Pizzas deliciosas</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#ff9d5c;font-size:14px;">🍫 Dulces y snacks frescos</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#ff9d5c;font-size:14px;">🎮 Recargas de Robux</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#ff9d5c;font-size:14px;">⭐ Puntos Happy Score con cada compra</td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="https://happycorner.top/order" style="display:inline-block;background:linear-gradient(135deg,#ff6b9d,#ff9d5c);color:#fff;font-weight:800;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:50px;">
                Hacer mi primer pedido →
              </a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #2a1a2a;text-align:center;">
          <p style="color:#666;font-size:12px;margin:0;">Happy Corner 🍭 · <a href="https://happycorner.top" style="color:#ff6b9d;text-decoration:none;">happycorner.top</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
        });

        return json(res, 200, { ok: true });
    } catch (err) {
        console.error('Welcome email error:', err);
        // Non-critical — don't block signup
        return json(res, 500, { error: 'Email send failed (non-critical)' });
    }
}
