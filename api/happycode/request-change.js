import { db } from '../_lib/firebaseAdmin.js';
import { Resend } from 'resend';
import { applyCors, json, getBearerToken } from '../_lib/http.js';
import { verifyToken } from '../_lib/token.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    // Verify authenticated user
    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: 'Unauthorized' });

    let uid;
    try {
        const { adminAuth } = await import('../_lib/firebaseAdmin.js');
        const decoded = await adminAuth.verifyIdToken(token);
        uid = decoded.uid;
    } catch {
        return json(res, 401, { error: 'Invalid token' });
    }

    const { newCode } = req.body || {};
    if (!newCode || typeof newCode !== 'string') return json(res, 400, { error: 'Missing newCode' });

    const cleaned = newCode.trim().toUpperCase();
    if (cleaned.length < 4 || cleaned.length > 12) {
        return json(res, 400, { error: 'El código debe tener entre 4 y 12 caracteres' });
    }
    if (!/^[A-Z0-9_-]+$/.test(cleaned)) {
        return json(res, 400, { error: 'Solo letras, números, guiones y guiones bajos' });
    }

    try {
        // Check uniqueness
        const existing = await db.collection('users').where('customerCode', '==', cleaned).limit(1).get();
        if (!existing.empty) {
            return json(res, 409, { error: 'Ese código ya está en uso' });
        }

        // Check for existing pending request from same user
        const pendingCheck = await db.collection('happycode_requests')
            .where('uid', '==', uid)
            .where('status', '==', 'pending')
            .limit(1)
            .get();
        if (!pendingCheck.empty) {
            return json(res, 409, { error: 'Ya tienes una solicitud pendiente. Espera la respuesta antes de enviar otra.' });
        }

        // Get user info
        const userSnap = await db.collection('users').doc(uid).get();
        if (!userSnap.exists) return json(res, 404, { error: 'User not found' });
        const userData = userSnap.data();

        // Create request document
        const reqRef = await db.collection('happycode_requests').add({
            uid,
            userName: userData.displayName || userData.name || 'Usuario',
            userEmail: userData.email || '',
            currentCode: userData.customerCode || '(ninguno)',
            newCode: cleaned,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        // Notify admin via email (best-effort)
        try {
            await resend.emails.send({
                from: 'Happy Corner <alertas@happycorner.top>',
                to: 'evan.l@happycorner.lol',
                subject: `🎫 Solicitud de HappyCode: ${userData.displayName || userData.name}`,
                html: `
                    <h2>Nueva solicitud de cambio de HappyCode</h2>
                    <p><strong>Usuario:</strong> ${userData.displayName || userData.name}</p>
                    <p><strong>Email:</strong> ${userData.email || '—'}</p>
                    <p><strong>Código actual:</strong> <code>${userData.customerCode || '(ninguno)'}</code></p>
                    <p><strong>Código solicitado:</strong> <code>${cleaned}</code></p>
                    <p><a href="https://happycorner.top/admin-v2?tab=happycode" style="background:#ff6b9d;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Ver en Admin Panel →</a></p>
                `
            });
        } catch (emailErr) {
            console.warn('Admin notification email failed:', emailErr.message);
        }

        return json(res, 200, { ok: true, requestId: reqRef.id });
    } catch (err) {
        console.error('happycode/request-change error:', err);
        return json(res, 500, { error: 'Internal server error' });
    }
}
