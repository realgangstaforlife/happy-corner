import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}
const db = admin.firestore();
const auth = admin.auth();

function json(res, status, data) {
    res.status(status).json(data);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const orderId = url.searchParams.get('orderId');

        if (!orderId) {
            return json(res, 400, { error: 'Missing orderId' });
        }

        let isOwnerOrAdmin = false;
        const authHeader = req.headers.authorization || req.headers.Authorization;
        let callerUid = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split('Bearer ')[1];
            try {
                const decoded = await auth.verifyIdToken(token);
                callerUid = decoded.uid;
                
                const userDoc = await db.collection('users').doc(callerUid).get();
                if (userDoc.exists && userDoc.data().role === 'admin') {
                    isOwnerOrAdmin = true;
                }
            } catch (e) {
                // Ignore invalid token
            }
        }

        const docSnap = await db.collection('orders').doc(orderId).get();
        
        if (!docSnap.exists) {
            return json(res, 404, { error: 'Order not found' });
        }
        
        const data = docSnap.data();

        if (callerUid && (data.customerUID === callerUid || (data.customer && data.customer.uid === callerUid))) {
            isOwnerOrAdmin = true;
        }

        if (!isOwnerOrAdmin) {
            const rawName = data.nombre || data.customerName || '';
            const firstLetter = rawName.charAt(0) || 'N';
            
            const redactedData = {
                id: orderId,
                status: data.status,
                total: data.total,
                resumen: data.resumen,
                paymentMethod: data.paymentMethod,
                createdAt: data.createdAt,
                timestamp: data.timestamp,
                nameLength: rawName.length > 1 ? rawName.length : 5,
                firstLetter: firstLetter,
                isRedacted: true
            };
            return json(res, 200, redactedData);
        } else {
            return json(res, 200, {
                id: orderId,
                ...data,
                isRedacted: false
            });
        }
    } catch (err) {
        console.error("verifyOrder error:", err);
        return json(res, 500, { error: 'Internal server error' });
    }
}
