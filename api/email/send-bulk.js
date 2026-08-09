import { Resend } from 'resend';
import { applyCors, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/adminAuth.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { recipients, subject, body } = req.body || {};
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return json(res, 400, { error: 'Missing recipients array' });
    }
    if (!subject || !body) {
        return json(res, 400, { error: 'Missing subject or body' });
    }

    try {
        let sentCount = 0;

        // Loop and send. Resend supports bulk, but formatting variables per user requires individual templates.
        for (const recipient of recipients) {
            if (!recipient.email) continue;
            try {
                // Replace template variables
                const formattedHtml = formatEmailBody(body, recipient);

                await resend.emails.send({
                    from: 'Happy Corner <noreply@happycorner.top>',
                    to: recipient.email,
                    subject: subject,
                    html: formattedHtml
                });
                sentCount++;
            } catch (err) {
                console.error(`Failed to send campaign email to ${recipient.email}:`, err.message);
            }
        }

        return json(res, 200, { sent: sentCount, total: recipients.length });
    } catch (err) {
        console.error('email/send-bulk error:', err);
        return json(res, 500, { error: 'Internal server error' });
    }
}

function formatEmailBody(body, recipient) {
    const rawHtml = body
        .replace(/{name}/g, recipient.name || 'Cliente')
        .replace(/{email}/g, recipient.email)
        .replace(/{happyscore}/g, recipient.happyscore || 0)
        .replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f0f8;font-family:'Arial',sans-serif;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f0f8;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e0d0e0;border-radius:20px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#ff6b9d,#ff9d5c,#ffd45e);height:6px;"></td></tr>
        <tr><td align="center" style="padding:32px 32px 16px;background:#1a0a1a;color:#fff;">
          <div style="font-size:28px;">🍭</div>
          <div style="font-size:20px;font-weight:900;margin-top:4px;">Happy Corner</div>
        </td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.7;">
          ${rawHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #eee;text-align:center;background:#fafafa;">
          <p style="color:#999;font-size:12px;margin:0;">Happy Corner Cali · <a href="https://happycorner.top" style="color:#ff6b9d;text-decoration:none;">happycorner.top</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
