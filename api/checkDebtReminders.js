/**
 * /api/checkDebtReminders.js
 * 
 * Vercel Cron Job – runs once per day.
 * Scans all users with activeDebt > 0, finds those whose oldest UNPAID
 * purchase movement is ≥ 3 days old, and sends a summary email to the admin
 * via Resend. Each debtor row includes a WhatsApp quick-link pre-filled with
 * a debt-notice message and a link to their account info.
 *
 * Required env vars:
 *   RESEND_API_KEY          – your Resend API key
 *   FIREBASE_SERVICE_ACCOUNT – JSON string of your Firebase service account
 *   ADMIN_EMAIL             – destination email (e.g. happycorner.com@gmail.com)
 *   NEXT_PUBLIC_SITE_URL    – your site base URL (e.g. https://happycorner.com)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ── Firebase Admin init (singleton) ─────────────────────────────────────────
function getAdminDb() {
    if (!getApps().length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
        initializeApp({ credential: cert(serviceAccount) });
    }
    return getFirestore();
}

// ── Resend email sender ──────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'Happy Corner <noreply@alertas.happycorner.top>',
            to,
            subject,
            html
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend error: ${err}`);
    }
    return res.json();
}

// ── WhatsApp quick-link builder ──────────────────────────────────────────────
function buildWhatsAppLink(phoneNumber, debtorName, debtAmount, siteUrl, customerCode) {
    const accountLink = `${siteUrl}/mi-cuenta`;
    const msg = `Hola ${debtorName} 👋, te escribimos de *Happy Corner*.\n\nTenemos registrada una deuda pendiente de *$${Number(debtAmount).toLocaleString('es-CO')}* en tu cuenta.\n\nPuedes revisar el detalle aquí: ${accountLink}\n\nPor favor coordina el pago con nosotros. ¡Gracias! 🙏`;
    const encoded = encodeURIComponent(msg);
    // phoneNumber should already include country code, e.g. 573001234567
    const cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
    if (!cleanPhone) return null;
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    // Allow GET from Vercel cron or POST from manual trigger
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Security: Vercel cron passes Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        // Allow unauthenticated only in dev; in prod require secret
        // Comment the below line if you want to open it up
        // return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const db = getAdminDb();
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://happycorner.com';
        const adminEmail = process.env.ADMIN_EMAIL || 'happycorner.com@gmail.com';

        const nowMs = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const cutoffMs = nowMs - threeDaysMs;

        // 1. Get all users with activeDebt > 0
        const usersSnap = await db.collection('users').where('activeDebt', '>', 0).get();

        if (usersSnap.empty) {
            return res.status(200).json({ message: 'No users with active debt. Nothing to send.' });
        }

        const overdueDebtors = [];

        for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            const uid = userDoc.id;

            // 2. Find the oldest unpaid purchase movement for this user
            const movSnap = await db.collection('movements')
                .where('customerUID', '==', uid)
                .where('type', '==', 'purchase')
                .orderBy('createdAt', 'asc')
                .limit(10)
                .get();

            let oldestUnpaidMs = null;
            for (const mov of movSnap.docs) {
                const m = mov.data();
                if (m.status === 'paid') continue; // skip paid ones
                // Parse createdAt (Firestore Timestamp or ISO string)
                let ts;
                if (m.createdAt instanceof Timestamp) {
                    ts = m.createdAt.toMillis();
                } else if (typeof m.createdAt === 'string') {
                    ts = new Date(m.createdAt).getTime();
                } else if (m.createdAt && m.createdAt.seconds) {
                    ts = m.createdAt.seconds * 1000;
                } else {
                    ts = Number(m.createdAt);
                }
                if (!isNaN(ts) && (oldestUnpaidMs === null || ts < oldestUnpaidMs)) {
                    oldestUnpaidMs = ts;
                }
            }

            // 3. Only flag if oldest unpaid purchase is >= 3 days old
            if (oldestUnpaidMs !== null && oldestUnpaidMs <= cutoffMs) {
                const daysOverdue = Math.floor((nowMs - oldestUnpaidMs) / (24 * 60 * 60 * 1000));
                overdueDebtors.push({
                    uid,
                    name: userData.displayName || userData.name || 'Cliente',
                    email: userData.email || '—',
                    phone: userData.phone || null,
                    debt: userData.activeDebt || 0,
                    customerCode: userData.customerCode || '—',
                    daysOverdue
                });
            }
        }

        if (overdueDebtors.length === 0) {
            return res.status(200).json({ message: 'No overdue debtors (>= 3 days). No email sent.' });
        }

        // Sort by most overdue first
        overdueDebtors.sort((a, b) => b.daysOverdue - a.daysOverdue);

        // 4. Build email HTML
        const rows = overdueDebtors.map(d => {
            const waLink = buildWhatsAppLink(d.phone, d.name, d.debt, siteUrl, d.customerCode);
            const waBtn = waLink
                ? `<a href="${waLink}" style="display:inline-block; padding:6px 14px; background:#25D366; color:white; border-radius:8px; text-decoration:none; font-weight:700; font-size:13px;">💬 Enviar WhatsApp</a>`
                : `<span style="color:#888; font-size:12px;">Sin teléfono</span>`;

            const urgencyColor = d.daysOverdue >= 7 ? '#ef4444' : d.daysOverdue >= 5 ? '#f97316' : '#f59e0b';

            return `
            <tr style="border-bottom: 1px solid #2a2a3a;">
                <td style="padding: 14px 10px;">
                    <div style="font-weight:700; color:#fff;">${d.name}</div>
                    <div style="font-size:12px; color:#888;">${d.customerCode}</div>
                    <div style="font-size:12px; color:#aaa;">${d.email}</div>
                </td>
                <td style="padding: 14px 10px; text-align:center;">
                    <span style="color:#ff5299; font-weight:900; font-size:18px;">$${Number(d.debt).toLocaleString('es-CO')}</span>
                </td>
                <td style="padding: 14px 10px; text-align:center;">
                    <span style="color:${urgencyColor}; font-weight:900;">${d.daysOverdue} días</span>
                </td>
                <td style="padding: 14px 10px; text-align:center;">
                    ${waBtn}
                </td>
            </tr>`;
        }).join('');

        const totalDebt = overdueDebtors.reduce((sum, d) => sum + (d.debt || 0), 0);
        const dateStr = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="background:#0f0f1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin:0; padding:20px;">
            <div style="max-width:680px; margin:0 auto;">
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #ff5299, #ff9d5c); border-radius:20px; padding:28px 32px; margin-bottom:24px;">
                    <div style="font-size:28px; font-weight:900; color:white;">🏪 Happy Corner</div>
                    <div style="font-size:15px; color:rgba(255,255,255,0.85); margin-top:6px;">Resumen de Deudas con Prioridad</div>
                    <div style="font-size:13px; color:rgba(255,255,255,0.7); margin-top:4px;">${dateStr}</div>
                </div>

                <!-- Summary -->
                <div style="background:#1a1b2e; border:1px solid #2a2a3a; border-radius:16px; padding:20px; margin-bottom:20px; display:flex; gap:20px;">
                    <div style="flex:1; text-align:center;">
                        <div style="font-size:32px; font-weight:900; color:#ff5299;">${overdueDebtors.length}</div>
                        <div style="font-size:13px; color:#888;">clientes en mora</div>
                    </div>
                    <div style="flex:1; text-align:center; border-left:1px solid #2a2a3a;">
                        <div style="font-size:32px; font-weight:900; color:#f97316;">$${totalDebt.toLocaleString('es-CO')}</div>
                        <div style="font-size:13px; color:#888;">deuda total pendiente</div>
                    </div>
                </div>

                <!-- Alert -->
                <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:12px; padding:14px 18px; margin-bottom:20px; font-size:14px; color:#fca5a5;">
                    ⚠️ Los siguientes clientes llevan <strong>3 o más días</strong> con deuda sin pagar. Se recomienda contactarlos por WhatsApp.
                </div>

                <!-- Table -->
                <div style="background:#1a1b2e; border:1px solid #2a2a3a; border-radius:16px; overflow:hidden; margin-bottom:24px;">
                    <table style="width:100%; border-collapse:collapse; color:#fff;">
                        <thead>
                            <tr style="background:#0f0f1a; border-bottom:1px solid #2a2a3a;">
                                <th style="padding:12px 10px; text-align:left; font-size:12px; color:#888; text-transform:uppercase; letter-spacing:0.05em;">Cliente</th>
                                <th style="padding:12px 10px; text-align:center; font-size:12px; color:#888; text-transform:uppercase; letter-spacing:0.05em;">Deuda</th>
                                <th style="padding:12px 10px; text-align:center; font-size:12px; color:#888; text-transform:uppercase; letter-spacing:0.05em;">Días</th>
                                <th style="padding:12px 10px; text-align:center; font-size:12px; color:#888; text-transform:uppercase; letter-spacing:0.05em;">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>

                <!-- Footer -->
                <div style="text-align:center; font-size:12px; color:#555; margin-top:16px;">
                    Este mensaje fue generado automáticamente por Happy Corner · 
                    <a href="${siteUrl}/admin-v2" style="color:#ff5299; text-decoration:none;">Ver Panel Admin</a>
                </div>
            </div>
        </body>
        </html>`;

        await sendEmail({
            to: adminEmail,
            subject: `🔔 Happy Corner · ${overdueDebtors.length} deudor${overdueDebtors.length > 1 ? 'es' : ''} en mora – ${dateStr}`,
            html
        });

        console.log(`[checkDebtReminders] Email sent. ${overdueDebtors.length} overdue debtors. Total: $${totalDebt}`);
        return res.status(200).json({
            message: 'Email sent successfully.',
            overdueCount: overdueDebtors.length,
            totalDebt
        });

    } catch (err) {
        console.error('[checkDebtReminders] Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
