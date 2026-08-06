import { db, auth } from './_lib/firebaseAdmin.js';
import { applyCors, json } from './_lib/http.js';

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;

    if (req.method !== 'POST') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    try {
        const { action } = req.query;
        if (!action) {
            return json(res, 400, { error: 'Falta el parámetro action' });
        }

        // Require authentication
        const idToken = (req.headers.authorization || '').replace('Bearer ', '');
        if (!idToken) return json(res, 401, { error: 'No autenticado.' });

        let decoded;
        try {
            decoded = await auth.verifyIdToken(idToken);
        } catch {
            return json(res, 401, { error: 'Token inválido.' });
        }

        // Check if admin
        const callerSnap = await db.collection('users').doc(decoded.uid).get();
        const callerData = callerSnap.data() || {};
        if (callerData.role !== 'admin') {
            return json(res, 403, { error: 'Acción permitida solo para administradores.' });
        }

        if (action === 'updateTopProducts') {
            // Find top 3 products from orders
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

            // Sort by count descending
            const sortedProducts = Object.keys(productCounts).sort((a, b) => productCounts[b] - productCounts[a]);

            let top3 = sortedProducts.slice(0, 3);

            // If we have fewer than 3 products sold, fill the rest with random available products
            if (top3.length < 3) {
                const allProductsSnap = await db.collection('products').where('available', '!=', false).get();
                let availableIds = [];
                allProductsSnap.forEach(p => {
                    if (!top3.includes(p.id)) {
                        availableIds.push(p.id);
                    }
                });

                availableIds.sort(() => 0.5 - Math.random());
                
                const needed = 3 - top3.length;
                top3 = top3.concat(availableIds.slice(0, needed));
            }

            // Save to config
            await db.collection('config').doc('topProducts').set({
                productIds: top3,
                updatedAt: new Date().toISOString(),
                updatedBy: decoded.uid
            });

            return json(res, 200, { ok: true, top3 });
        }

        return json(res, 400, { error: 'Acción no válida' });
    } catch (e) {
        console.error("Error en config API:", e);
        return json(res, 500, { error: 'Error interno del servidor.' });
    }
}
