import { db } from '../_lib/firebaseAdmin.js';
import { Resend } from 'resend';
import { applyCors, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/adminAuth.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { requestId, reason } = req.body || {};
    if (!requestId) return json(res, 400, { error: 'Missing requestId' });

    try {
        const reqSnap = await db.collection('happycode_requests').doc(requestId).get();
        if (!reqSnap.exists) return json(res, 404, { error: 'Request not found' });

        const reqData = reqSnap.data();
        if (reqData.status !== 'pending') {
            return json(res, 409, { error: `Request already ${reqData.status}` });
        }

        await db.collection('happycode_requests').doc(requestId).update({
            status: 'rejected',
            rejectedReason: reason || 'No especificado',
            resolvedAt: new Date().toISOString()
        });

        // Email the user
        if (reqData.userEmail) {
            try {
                await resend.emails.send({
                    from: 'Happy Corner <noreply@happycorner.top>',
                    to: reqData.userEmail,
                    subject: '❌ Tu solicitud de HappyCode no fue aprobada',
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
                            <h2 style="color:#888;">Solicitud no aprobada</h2>
                            <p>Hola <strong>${reqData.userName}</strong>,</p>
                            <p>Revisamos tu solicitud de cambio de HappyCode a <strong>${reqData.newCode}</strong> y lamentablemente no pudimos procesarla en este momento.</p>
                            ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
                            <p>Si tienes dudas, puedes escribirnos por WhatsApp.</p>
                            <hr style="margin-top:32px;border:none;border-top:1px solid #eee;">
                            <p style="font-size:12px;color:#999;">Happy Corner 🍭 · happycorner.top</p>
                        </div>
                    `
                });
            } catch (emailErr) {
                console.warn('Rejection email failed:', emailErr.message);
            }
        }

        return json(res, 200, { ok: true });
    } catch (err) {
        console.error('happycode/reject error:', err);
        return json(res, 500, { error: 'Internal server error' });
    }
}
