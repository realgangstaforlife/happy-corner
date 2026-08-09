import fetch from 'node-fetch';
import { db } from './_lib/firebaseAdmin.js';
import { verifyToken } from './_lib/token.js';

import { applyCors } from './_lib/http.js';

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }


    try {
        const { orderId, nombre, resumen, status, whatsapp, token } = req.body;
        
        if (!token) return res.status(401).json({ error: 'Token missing.' });
        
        const v = verifyToken(token, process.env.ORDER_VERIFY_SECRET);
        if (!v.ok) return res.status(401).json({ error: 'Token inválido o vencido.' });
        if (v.payload.o !== orderId) return res.status(401).json({ error: 'Token no coincide con el pedido.' });

        // Confirmar contra Firestore que el orderId realmente existe en la colección orders
        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (!orderSnap.exists) {
            return res.status(404).json({ error: 'Pedido no encontrado en la base de datos.' });
        }
        
        let emoji = '✅';
        let actionStr = 'CONFIRMADO';
        let thanksMsg = `Hola ${nombre}! Gracias por confirmar tu pre-orden ${orderId}. ¡Todo está listo para mañana! Nos vemos.`;
        
        if (status === 'cancelled') {
            emoji = '❌';
            actionStr = 'CANCELADO';
            thanksMsg = `Hola ${nombre}. Entendemos, hemos cancelado tu pre-orden ${orderId}. ¡Gracias por avisarnos, esperamos verte pronto!`;
        }

        function escapeMarkdown(text) {
            if (typeof text !== 'string') return '';
            return text.replace(/([_*\[`])/g, '\\$1');
        }

        const msg = `${emoji} *PREORDEN ${actionStr}*\n\n` +
                    `👤 *Cliente:* ${escapeMarkdown(nombre)}\n` +
                    `📦 *Orden:* ${escapeMarkdown(orderId)}\n` +
                    `🛒 *Pedido:* ${escapeMarkdown(resumen)}\n\n` +
                    `*Nota:* Pedido ${actionStr.toLowerCase()} para el día de mañana.`;

        const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: msg,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `📩 WA "Gracias por ${status === 'cancelled' ? 'cancelar' : 'confirmar'}"`, url: `https://wa.me/57${whatsapp}?text=${encodeURIComponent(thanksMsg)}` }
                        ]
                    ]
                }
            })
        });

        const tgData = await tgRes.json();
        if (!tgData.ok) {
            throw new Error('Telegram error: ' + tgData.description);
        }

        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error("Error verifyPreorder:", e.message);
        res.status(500).json({ error: e.message });
    }
}
