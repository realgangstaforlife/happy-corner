import { db } from '../_lib/firebaseAdmin.js';
import { applyCors, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/adminAuth.js';

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['GET', 'OPTIONS'] })) return;
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { filter } = req.query || {};

    try {
        let queryRef = db.collection('users');

        if (filter === 'active') {
            // Logged in last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            queryRef = queryRef.where('updatedAt', '>=', thirtyDaysAgo.toISOString());
        } else if (filter === 'high-score') {
            // HappyPoints (or score) > 100
            queryRef = queryRef.where('happyPoints', '>', 100);
        } else if (filter === 'robux-users') {
            // Users who bought robux category items. We can look for users who have ordered.
            // But to keep it efficient and simple, we'll fetch users that opt-in and filter clients.
            // Or look in their orders. Let's do a query on orders for 'robux'.
            const ordersSnap = await db.collection('orders')
                .where('status', '==', 'delivered')
                .get();
            const robuxUserIds = new Set();
            ordersSnap.forEach(doc => {
                const o = doc.data();
                if (o.resumen && o.resumen.toLowerCase().includes('robux') && o.uid) {
                    robuxUserIds.add(o.uid);
                }
            });

            if (robuxUserIds.size === 0) {
                return json(res, 200, { users: [] });
            }

            const users = [];
            // Firestore limit is 30 for "in" query. Let's chunk or do direct fetches for safety.
            const uidsArray = Array.from(robuxUserIds).slice(0, 30);
            const userSnaps = await Promise.all(uidsArray.map(uid => db.collection('users').doc(uid).get()));
            userSnaps.forEach(snap => {
                if (snap.exists) {
                    const u = snap.data();
                    users.push({
                        uid: snap.id,
                        email: u.email || '',
                        name: u.displayName || u.name || 'Cliente',
                        happyscore: u.happyPoints || 0
                    });
                }
            });
            return json(res, 200, { users });
        }

        const snap = await queryRef.limit(200).get();
        const users = [];
        snap.forEach(doc => {
            const u = doc.data();
            if (u.email) {
                users.push({
                    uid: doc.id,
                    email: u.email,
                    name: u.displayName || u.name || 'Cliente',
                    happyscore: u.happyPoints || 0
                });
            }
        });

        return json(res, 200, { users });
    } catch (err) {
        console.error('email/recipients error:', err);
        return json(res, 500, { error: 'Internal server error' });
    }
}
