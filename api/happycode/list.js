import { db } from '../_lib/firebaseAdmin.js';
import { Resend } from 'resend';
import { applyCors, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/adminAuth.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['GET', 'OPTIONS'] })) return;
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
        const snap = await db.collection('happycode_requests')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();

        const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return json(res, 200, { requests });
    } catch (err) {
        console.error('happycode/list error:', err);
        return json(res, 500, { error: 'Internal server error' });
    }
}
