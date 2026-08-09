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

    const { requestId } = req.body || {};
    if (!requestId) return json(res, 400, { error: 'Missing requestId' });

    try {
        const reqSnap = await db.collection('happycode_requests').doc(requestId).get();
        if (!reqSnap.exists) return json(res, 404, { error: 'Request not found' });

        const reqData = reqSnap.data();
        if (reqData.status !== 'pending') {
            return json(res, 409, { error: `Request already ${reqData.status}` });
        }

        // Final uniqueness check before applying
        const existing = await db.collection('users').where('customerCode', '==', reqData.newCode).limit(1).get();
        if (!existing.empty) {
            await db.collection('happycode_requests').doc(requestId).update({ status: 'rejected', rejectedReason: 'Code taken', resolvedAt: new Date().toISOString() });
            return json(res, 409, { error: 'Code was taken by another user — request auto-rejected' });
        }

        // Apply code change + mark approved in a batch
        const batch = db.batch();
        batch.update(db.collection('users').doc(reqData.uid), {
            customerCode: reqData.newCode,
            updatedAt: new Date().toISOString()
        });
        batch.update(db.collection('happycode_requests').doc(requestId), {
            status: 'approved',
            resolvedAt: new Date().toISOString()
        });
        await batch.commit();

        // Email the user
        if (reqData.userEmail) {
            try {
                await resend.emails.send({
                    from: 'Happy Corner <noreply@happycorner.top>',
                    to: reqData.userEmail,
                    subject: '✅ Tu nuevo HappyCode fue aprobado',
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
                            <h2 style="color:#ff6b9d;">¡Tu solicitud fue aprobada! 🎉</h2>
                            <p>Hola <strong>${reqData.userName}</strong>,</p>
                            <p>Tu solicitud de cambio de HappyCode fue revisada y aprobada.</p>
                            <p style="margin:20px 0;">
                                <strong>Tu nuevo código:</strong><br>
                                <span style="font-size:24px;font-weight:900;background:#f0e0ff;padding:8px 20px;border-radius:8px;letter-spacing:2px;">${reqData.newCode}</span>
                            </p>
                            <p>¡Ya puedes usarlo en tu próximo pedido!</p>
                            <a href="https://happycorner.top/mi-cuenta" style="display:inline-block;background:linear-gradient(135deg,#ff6b9d,#ff9d5c);color:#fff;font-weight:800;text-decoration:none;padding:12px 28px;border-radius:50px;margin-top:12px;">Ver mi cuenta →</a>
                            <hr style="margin-top:32px;border:none;border-top:1px solid #eee;">
                            <p style="font-size:12px;color:#999;">Happy Corner 🍭 · happycorner.top</p>
                        </div>
                    `
                });
            } catch (emailErr) {
                console.warn('Approval email failed:', emailErr.message);
            }
        }

        return json(res, 200, { ok: true });
    } catch (err) {
        console.error('happycode/approve error:', err);
        return json(res, 500, { error: 'Internal server error' });
    }
}
