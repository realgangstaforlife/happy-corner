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

                            // Send delivery email
                            let customerEmail = oData.email;
                            if (!customerEmail && oData.customerUID) {
                                const uSnap = await db.collection('users').doc(oData.customerUID).get();
                                if (uSnap.exists) {
                                    customerEmail = uSnap.data().email;
                                }
                            }

                            if (customerEmail) {
                                const customerName = oData.nombre || 'Cliente';
                                const resendKey = process.env.RESEND_API_KEY;
                                if (resendKey) {
                                    const { Resend } = await import('resend');
                                    const resend = new Resend(resendKey);

                                    const getEmailTemplate = (content, title = 'Happy Corner') => {
                                        return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:520px;background:#181818;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff9d5c);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="Happy Corner" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.02em;">Happy Corner</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">${title}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;line-height:1.7;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:rgba(255,255,255,0.03);padding:16px 32px;text-align:center;">
            <div style="font-family:'Outfit',Arial,sans-serif;color:#555;font-size:11px;">Happy Corner · Cali, Valle del Cauca · <a href="https://happycorner.top" style="color:#ff5299;text-decoration:none;">happycorner.top</a></div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
                                    };

                                    const emailContent = `
                                        <p style="margin:0 0 20px;">Hola <strong>${customerName}</strong>,</p>
                                        <p style="margin:0 0 16px;">Tu pedido con codigo <strong>${orderId}</strong> ha sido marcado como entregado. Esperamos que lo disfrutes.</p>
                                        
                                        <div style="background:rgba(255,82,153,0.08); border:1px solid rgba(255,82,153,0.2); padding:15px; border-radius:12px; margin:20px 0; text-align:center;">
                                            <p style="margin:0; color:#888; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">Estado del Pedido</p>
                                            <p style="margin:5px 0 0 0; color:#2ecc71; font-size:22px; font-weight:900;">Entregado</p>
                                        </div>
                                        
                                        <p style="margin:20px 0 16px; line-height:1.6;">Tu opinion es muy valiosa para nosotros. Te invitamos a dejarnos una resena sobre tu experiencia de compra en la seccion Mi Cuenta.</p>
                                        
                                        <div style="text-align:center; margin:30px 0 10px;">
                                          <a href="https://happycorner.top/mi-cuenta" style="display:inline-block; background:linear-gradient(135deg,#b01e5a,#ff5299,#ff9d5c); color:#fff; padding:14px 32px; border-radius:14px; text-decoration:none; font-weight:800; font-size:14px;">Dejar una resena</a>
                                        </div>
                                    `;

                                    await resend.emails.send({
                                        from: 'Happy Corner <noreply@alertas.happycorner.top>',
                                        to: customerEmail,
                                        subject: `Pedido entregado ${orderId} - ${customerName}`,
                                        html: getEmailTemplate(emailContent, 'Entrega de Pedido')
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Error updating activeOrders or sending delivery email on order completion:', err);
                    }
                }

                await db.collection('orders').doc(orderId).update(updateData);
                return res.status(200).json({ ok: true });
            }

            // Otherwise, it's a new order submission
            const pedidoData = body;

            // Extract IP and UA
            const forwarded = req.headers['x-forwarded-for'];
            const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
            const clientDevice = req.headers['user-agent'] || 'unknown';

            // Check if banned
            const bansRef = db.collection('banned_entities');
            const ipQuery = await bansRef.where('ip', '==', clientIp).limit(1).get();
            if (!ipQuery.empty) return res.status(403).json({ error: 'Acceso denegado.' });
            
            if (clientDevice !== 'unknown') {
                const deviceQuery = await bansRef.where('device', '==', clientDevice).limit(1).get();
                if (!deviceQuery.empty) return res.status(403).json({ error: 'Acceso denegado.' });
            }

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
                    email: pedidoData.email || null,
                    whatsapp: cleanNumber,
                    resumen: pedidoData.resumen,
                    total: totalDisplay,
                    paymentMethod: pedidoData.metodo_pago,
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    completedAt: null,
                    clientIp: clientIp,
                    clientDevice: clientDevice
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
                    customerUID: data.customerUID || null,
                    clientIp: data.clientIp || 'Desconocida',
                    clientDevice: data.clientDevice || 'Desconocido'
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
