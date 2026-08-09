import { db } from '../_lib/firebaseAdmin.js';
import { applyCors, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/adminAuth.js';

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['GET', 'OPTIONS'] })) return;
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
        const snap = await db.collection('users')
            .orderBy('displayName', 'asc')
            .limit(300)
            .get();

        const users = [];
        snap.forEach(doc => {
            const u = doc.data();
            if (u.email) {
                users.push({
                    uid: doc.id,
                    email: u.email,
                    name: u.displayName || u.name || 'Cliente'
                });
            }
        });

        return json(res, 200, { users });
    } catch (err) {
        console.error('email/users-list error:', err);
        return json(res, 500, { error: 'Internal server error' });
    }
}
