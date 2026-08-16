import fetch from 'node-fetch';
import admin, { db } from './_lib/firebaseAdmin.js';
import { requireAdmin } from './_lib/adminAuth.js';
import { signToken } from './_lib/token.js';

import { applyCors } from './_lib/http.js';

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['GET', 'POST', 'OPTIONS'] })) return;


    const { method, body, query } = req;

    try {
        if (method === 'POST') {
            // Check if it's an admin status update (query has id and estado)
            if (query.id && query.estado) {
                const adminPayload = requireAdmin(req, res);
                if (!adminPayload) return; // Response is already handled by requireAdmin

                const orderId = query.id;
                const estado = query.estado; // 'Entregado' | 'Cancelado' | 'Confirmado'

                const statusMap = {
                    'Entregado': 'completed',
                    'Cancelado': 'cancelled',
                    'Confirmado': 'preparing'
                };

                const status = statusMap[estado] || 'pending';
                const now = new Date().toISOString();

                const updateData = {
                    status,
                    updatedAt: now
                };

                if (status === 'completed') {
                    updateData.completedAt = now;
                    try {
                        const orderSnap = await db.collection('orders').doc(orderId).get();
                        if (orderSnap.exists) {
                            const oData = orderSnap.data();
                            if (oData.customerUID) {
                                await db.collection('users').doc(oData.customerUID).update({
                                    activeOrders: admin.firestore.FieldValue.increment(1)
                                });
                            }
                        }
                    } catch (err) {
                        console.error('Error updating activeOrders on order completion:', err);
                    }
                }

                await db.collection('orders').doc(orderId).update(updateData);
                return res.status(200).json({ ok: true });
            }

            // Otherwise, it's a new order submission
            const pedidoData = body;

            // Generate order code h-xxxxx
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let orderCodeId = '';
            for (let i = 0; i < 5; i++) {
                orderCodeId += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const orderCode = `h-${orderCodeId}`;

            // Clean whatsapp number
            const cleanNumber = (pedidoData.whatsapp || '').replace(/\D/g, '');
            const waLink = `https://wa.me/57${cleanNumber}`;

            // Check for custom Robux
            const hasCustomRobux = typeof pedidoData.resumen === 'string' && pedidoData.resumen.includes('Robux Personalizado');
            let totalDisplay = pedidoData.total;
            let note = '';
            if (hasCustomRobux) {
                note = '\n\n⚠️ *Sera necesario contactarse con el cliente para acordar el precio de los robux.*';
                totalDisplay = 'Por definir';
            }

            function escapeMarkdown(text) {
                if (typeof text !== 'string') return '';
                return text.replace(/([_*\[`])/g, '\\$1');
            }

            const msg = `🍭 *NUEVO PEDIDO: ${escapeMarkdown(orderCode)}* 🍭\n\n` +
                `👤 *Cliente:* ${escapeMarkdown(pedidoData.nombre)}\n` +
                `📱 *WhatsApp:* [${escapeMarkdown(pedidoData.whatsapp)}](${waLink})\n` +
                `🎟️ *Loyalty:* \`${escapeMarkdown(pedidoData.happycodigo || "No registrado")}\`\n` +
                `📍 *Entrega:* ${escapeMarkdown(pedidoData.tipo_entrega || "No especificada")}\n` +
                `💳 *Pago:* ${escapeMarkdown(pedidoData.metodo_pago || "No especificado")}\n` +
                `🛒 *Pedido:* ${escapeMarkdown(pedidoData.resumen)}\n` +
                `💖 *Propina:* ${escapeMarkdown(pedidoData.propina || "Sin propina")}\n` +
                `💰 *TOTAL FINAL:* ${escapeMarkdown(totalDisplay)}${note}`;

            // Preparar mensajes para WhatsApp
            const waApproval = `Hola ${pedidoData.nombre}! 🎉 Tu pedido de Happy Corner está confirmado.\n\n📦 Orden: ${orderCode}\n🛍️ Resumen: ${pedidoData.resumen}\n💰 Total: ${totalDisplay}\n\n¡Gracias por preferirnos!`;
            const waPending = `Hola ${pedidoData.nombre}, tu pedido ${orderCode} por ${totalDisplay} está pendiente de pago. ⏳\n\n🛍️ Resumen: ${pedidoData.resumen}\n\nPor favor envía tu comprobante aquí para procesarlo rápido!`;
            const waCancel = `Hola ${pedidoData.nombre}. Lamentablemente tu pedido ${orderCode} ha sido cancelado por el siguiente motivo: `;

            const payloadObj = {
                n: pedidoData.nombre, o: orderCode, p: totalDisplay, w: cleanNumber, res: pedidoData.resumen
            };
            const tokenBase64 = signToken(payloadObj, process.env.ORDER_VERIFY_SECRET, { expiresInSeconds: 60 * 60 * 24 });
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://happycorner.top';
            const verifyLinkRaw = `${siteUrl}/verify?auth=${encodeURIComponent(tokenBase64)}`;
            // Crear link corto bajo el dominio de Happy Corner
            const shortCode = Math.random().toString(36).substring(2, 8); // 6 caracteres random
            await db.collection('shortlinks').doc(shortCode).set({
                target: verifyLinkRaw,
                createdAt: new Date().toISOString()
            });
            const verifyLink = `${siteUrl}/s/${shortCode}`;

    

            // Save to Firestore
            try {
                await db.collection('orders').doc(orderCode).set({
                    orderId: orderCode,
                    customerUID: pedidoData.customerUID || null,
                    customerCode: pedidoData.customerCode || pedidoData.happycodigo || null,
                    nombre: pedidoData.nombre,
                    whatsapp: cleanNumber,
                    resumen: pedidoData.resumen,
                    total: totalDisplay,
                    paymentMethod: pedidoData.metodo_pago,
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    completedAt: null
                });

                if (pedidoData.customerUID) {
                    await db.collection('users').doc(pedidoData.customerUID).update({
                        activeOrders: admin.firestore.FieldValue.increment(1)
                    }).catch(err => console.error('Error updating activeOrders on order creation:', err));
                }
            } catch (e) {
                console.error('Firestore orders save failed:', e);
            }

            const waPreorder = `¡Hola ${pedidoData.nombre}! 👋\n\n` +
                `📝 Registramos tu pre-orden de:\n*${pedidoData.resumen}*\n\n` +
                `💰 *Total a pagar:* ${totalDisplay}\n\n` +
                `👉 Por favor ingresa a este enlace seguro para *CONFIRMAR* tu pedido para el día de mañana:\n${verifyLink}\n\n` +
                `¡Mil gracias por ser parte de Happy Corner! ✨ Recuerda tener tu dinero físico o transferencia listos.`;

            // ENVIAR SOLO A TELEGRAM
            const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: process.env.TELEGRAM_CHAT_ID,
                    text: msg,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Aprobar Pedido", url: `https://wa.me/57${cleanNumber}?text=${encodeURIComponent(waApproval)}` }
                            ],
                            [
                                { text: "⏳ Pago Pendiente", url: `https://wa.me/57${cleanNumber}?text=${encodeURIComponent(waPending)}` }
                            ],
                            [
                                { text: "❌ Cancelar Pedido", url: `https://wa.me/57${cleanNumber}?text=${encodeURIComponent(waCancel)}` }
                            ],
                            [
                                { text: "📩 Enviar WA Pre-Orden", url: `https://wa.me/57${cleanNumber}?text=${encodeURIComponent(waPreorder)}` }
                            ]
                        ]
                    }
                })
            });

            const tgData = await tgRes.json();

            if (!tgData.ok) {
                throw new Error('Error en Telegram: ' + tgData.description);
            }

            return res.status(200).json({ ok: true, orderId: orderCode, message: "Telegram enviado" });
        }

        // GET method (Admin view)
        if (method === 'GET') {
            const adminPayload = requireAdmin(req, res);
            if (!adminPayload) return; // Response is already handled by requireAdmin

            // If phone is passed, return user's total points (compat with admin.html modal load)
            if (query.phone) {
                const cleanPhone = query.phone.replace(/\D/g, '');
                const usersSnap = await db.collection('users')
                    .where('phone', '==', cleanPhone)
                    .limit(1)
                    .get();

                let points = 0;
                if (!usersSnap.empty) {
                    points = usersSnap.docs[0].data().happyPoints || 0;
                }
                return res.status(200).json({ total_points: points });
            }

            let ordersQuery = db.collection('orders');

            if (query.date) {
                // Filter by date prefix: YYYY-MM-DD
                const searchDate = query.date; // e.g. "2026-07-06"
                ordersQuery = ordersQuery
                    .where('createdAt', '>=', `${searchDate}T00:00:00`)
                    .where('createdAt', '<=', `${searchDate}T23:59:59`);
            } else if (query.range === 'year') {
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                ordersQuery = ordersQuery.where('createdAt', '>=', oneYearAgo.toISOString());
            } else if (query.view === 'active') {
                // Return non-completed and non-cancelled orders
                // Firestore doesn't easily support multiple "not in" or != on fields without complex queries.
                // We'll just fetch all orders from the last 7 days and filter in memory to keep it simple and robust.
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                ordersQuery = ordersQuery.where('createdAt', '>=', oneWeekAgo.toISOString());
            }

            const snapshot = await ordersQuery.get();
            const orders = [];

            snapshot.forEach(doc => {
                const data = doc.data();

                // Map status to Spanish display status
                let estado = 'pendiente';
                if (data.status === 'completed') estado = 'Entregado';
                else if (data.status === 'cancelled') estado = 'Cancelado';
                else if (data.status === 'preparing') estado = 'Confirmado';

                // Filter in memory for active view
                if (query.view === 'active' && (data.status === 'completed' || data.status === 'cancelled')) {
                    return;
                }

                orders.push({
                    id: doc.id,
                    nombre: data.nombre,
                    whatsapp: data.whatsapp,
                    total: data.total,
                    estado,
                    status: data.status || 'pending',
                    resumen: data.resumen,
                    createdAt: data.createdAt || new Date().toISOString(),
                    customerUID: data.customerUID || null
                });
            });

            // Sort orders descending by creation date
            orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            return res.status(200).json(orders);
        }

    } catch (e) {
        console.error("Error getOrders API:", e.message);
        res.status(500).json({ error: e.message });
    }
}
