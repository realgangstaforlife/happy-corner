import { db, auth } from './_lib/firebaseAdmin.js';
import { applyCors } from './_lib/http.js';

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['GET', 'POST', 'OPTIONS'] })) return;

    // ── GET: retorna la configuración pública de Firebase ─────────────────────
    if (req.method === 'GET') {
        // Firebase client config is intentionally public — security is enforced by Firestore Rules
        // Allow any origin so notas.happycorner.top (and any future subdomain) can fetch it
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        if (req.method === 'OPTIONS') { return res.status(200).end(); }

        return res.status(200).json({
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID,
            siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://happycorner.top'
        });
    }

    // ── POST: acciones de configuración (solo admin) ───────────────────────────
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action } = req.query;
    if (!action) return res.status(400).json({ error: 'Falta el parámetro action' });

    // Verificar autenticación
    const idToken = (req.headers.authorization || '').replace('Bearer ', '');
    if (!idToken) return res.status(401).json({ error: 'No autenticado.' });

    let decoded;
    try {
        decoded = await auth.verifyIdToken(idToken);
    } catch {
        return res.status(401).json({ error: 'Token inválido.' });
    }

    // Verificar que sea admin
    const callerSnap = await db.collection('users').doc(decoded.uid).get();
    const callerData = callerSnap.data() || {};
    if (callerData.role !== 'admin') {
        return res.status(403).json({ error: 'Acción permitida solo para administradores.' });
    }

    // ── action: updateTopProducts ──────────────────────────────────────────────
    if (action === 'updateTopProducts') {
        try {
            // Contar cuántas veces aparece cada producto en las órdenes
            const ordersSnap = await db.collection('orders').get();
            const productCounts = {};

            ordersSnap.forEach(docSnap => {
                const orderData = docSnap.data();
                if (orderData.items && Array.isArray(orderData.items)) {
                    for (const item of orderData.items) {
                        if (item.id) {
                            productCounts[item.id] = (productCounts[item.id] || 0) + (item.qty || 1);
                        }
                    }
                }
            });

            // Ordenar por ventas descendente y tomar los top 3
            const sortedProducts = Object.keys(productCounts).sort(
                (a, b) => productCounts[b] - productCounts[a]
            );
            let top3 = sortedProducts.slice(0, 3);

            // Si hay menos de 3 productos vendidos, rellenar con aleatorios disponibles
            if (top3.length < 3) {
                const allProductsSnap = await db.collection('products').get();
                let availableIds = [];
                allProductsSnap.forEach(p => {
                    if (!top3.includes(p.id) && p.data().available !== false) {
                        availableIds.push(p.id);
                    }
                });
                availableIds.sort(() => 0.5 - Math.random());
                top3 = top3.concat(availableIds.slice(0, 3 - top3.length));
            }

            await db.collection('config').doc('topProducts').set({
                productIds: top3,
                updatedAt: new Date().toISOString(),
                updatedBy: decoded.uid
            });

            return res.status(200).json({ ok: true, top3 });
        } catch (e) {
            console.error('updateTopProducts error:', e);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }

    return res.status(400).json({ error: 'Acción no válida' });
}
