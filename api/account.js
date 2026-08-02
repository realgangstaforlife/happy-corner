import { db, auth } from './_lib/firebaseAdmin.js';
import { applyCors, json } from './_lib/http.js';
import { s3Client, bucketName } from './_lib/r2Client.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';

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

        // --- 1. ACCIÓN: logLogin (PÚBLICA PARA USUARIOS AUTENTICADOS) ---
        if (action === 'logLogin') {
            const idToken = (req.headers.authorization || '').replace('Bearer ', '');
            if (!idToken) return json(res, 401, { error: 'No autenticado.' });

            let decoded;
            try {
                decoded = await auth.verifyIdToken(idToken);
            } catch {
                return json(res, 401, { error: 'Token inválido.' });
            }

            const forwarded = req.headers['x-forwarded-for'];
            const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';

            let location = 'Red local / Desconocido';
            try {
                if (ip && ip !== 'unknown' && !ip.startsWith('127.') && !ip.startsWith('::1') && !ip.startsWith('192.168.')) {
                    const ipRes = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country,isp`);
                    const ipData = await ipRes.json();
                    const parts = [ipData.city, ipData.regionName, ipData.country].filter(Boolean);
                    location = parts.join(', ') + (ipData.isp ? ` (${ipData.isp})` : '');
                }
            } catch (err) {
                console.error("Error fetching location from IP:", err.message);
            }

            await db.collection('loginHistory').add({
                uid: decoded.uid,
                ip,
                userAgent: req.headers['user-agent'] || 'unknown',
                timestamp: new Date().toISOString(),
                location
            });

            return json(res, 200, { ok: true });
        }

        // --- 2. ACCIÓN: verifyOnboardingCode (PÚBLICA PARA USUARIOS AUTENTICADOS) ---
        if (action === 'verifyOnboardingCode') {
            const idToken = (req.headers.authorization || '').replace('Bearer ', '');
            if (!idToken) return json(res, 401, { error: 'No autenticado.' });

            let decoded;
            try {
                decoded = await auth.verifyIdToken(idToken);
            } catch {
                return json(res, 401, { error: 'Token inválido.' });
            }

            const { customerUID, customerCode } = req.body;
            if (!customerUID || !customerCode) {
                return json(res, 400, { error: 'Falta customerUID o customerCode' });
            }

            if (decoded.uid !== customerUID) {
                return json(res, 403, { error: 'No autorizado para esta cuenta.' });
            }

            const cleanCode = customerCode.trim().toUpperCase();

            // Rate limit check
            const limitRef = db.collection('rateLimits').doc(`onboarding_${customerUID}`);
            const limitSnap = await limitRef.get();
            if (limitSnap.exists) {
                const limitData = limitSnap.data();
                if (limitData.attempts >= 10 && (Date.now() - limitData.lastAttempt < 60 * 60 * 1000)) {
                    return json(res, 429, { error: 'Demasiados intentos. Por favor espera 1 hora.' });
                }
            }
            await limitRef.set({
                attempts: limitSnap.exists && (Date.now() - limitSnap.data().lastAttempt < 60 * 60 * 1000) ? limitSnap.data().attempts + 1 : 1,
                lastAttempt: Date.now()
            }, { merge: true });

            const codeRegex = /^HC[A-Z0-9]{4,6}$/;
            if (!codeRegex.test(cleanCode)) {
                return json(res, 400, { error: 'Formato de código inválido. Debe empezar con "HC" seguido de 4 a 6 caracteres alfanuméricos.' });
            }

            const lookupRef = db.collection('customerCodes').doc(cleanCode);
            const userRef = db.collection('users').doc(customerUID);

            const result = await db.runTransaction(async (transaction) => {
                const lookupSnap = await transaction.get(lookupRef);
                if (lookupSnap.exists) {
                    return { ok: false, error: 'code_taken' };
                }

                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists) {
                    return { ok: false, error: 'user_not_found' };
                }

                const userData = userSnap.data();
                if (userData.customerCode) {
                    return { ok: false, error: 'already_has_code' };
                }

                transaction.set(lookupRef, { uid: customerUID });
                transaction.update(userRef, {
                    customerCode: cleanCode,
                    updatedAt: new Date().toISOString()
                });

                return { ok: true };
            });

            if (!result.ok) {
                if (result.error === 'code_taken') {
                    return json(res, 400, { error: 'Ese código ya existe, prueba otro.' });
                }
                if (result.error === 'user_not_found') {
                    return json(res, 404, { error: 'El usuario no existe.' });
                }
                if (result.error === 'already_has_code') {
                    return json(res, 400, { error: 'Este usuario ya tiene un código asignado.' });
                }
            }

            return json(res, 200, { ok: true });
        }

        // --- ACCIONES REQUERIDAS DE AUTENTICACIÓN PARA OTROS CASOS ---
        const idToken = (req.headers.authorization || '').replace('Bearer ', '');
        if (!idToken) return json(res, 401, { error: 'No autenticado.' });

        let decoded;
        try {
            decoded = await auth.verifyIdToken(idToken);
        } catch {
            return json(res, 401, { error: 'Token inválido.' });
        }

        // Obtener datos del llamador (solo para email bodies donde se necesite el nombre)
        const callerSnap = await db.collection('users').doc(decoded.uid).get();
        const callerData = callerSnap.data() || {};
        // Admin check via JWT custom claim — not via Firestore field (cannot be spoofed)
        const isCallerAdmin = decoded.role === 'admin';

        // --- 3. ACCIÓN: deleteAccount (ACCESIBLE POR EL PROPIO USUARIO O POR ADMIN) ---
        if (action === 'deleteAccount') {
            const { uid } = req.body;
            const targetUid = uid || decoded.uid;

            // Si intenta borrar a otro usuario, debe ser admin
            if (targetUid !== decoded.uid && !isCallerAdmin) {
                return json(res, 403, { error: 'No autorizado.' });
            }

            // Consultar datos del usuario objetivo
            const targetUserRef = db.collection('users').doc(targetUid);
            const targetUserSnap = await targetUserRef.get();
            if (!targetUserSnap.exists) {
                return json(res, 404, { error: 'El usuario no existe.' });
            }

            const targetData = targetUserSnap.data();

            // Bloquear si tiene deudas activas
            if (targetData.activeDebt && targetData.activeDebt > 0) {
                return json(res, 400, { error: 'No puedes eliminar la cuenta mientras tengas una deuda activa. Contacta al administrador.' });
            }

            // 1. Eliminar HappyCódigo si existe
            if (targetData.customerCode) {
                await db.collection('customerCodes').doc(targetData.customerCode).delete();
            }

            // 2. Eliminar Contrato en Firestore
            await db.collection('debtContracts').doc(targetUid).delete();

            // 3. Eliminar Score Crediticio
            await db.collection('creditScores').doc(targetUid).delete();

            // 4. Eliminar Movimientos
            const movementsSnap = await db.collection('movements').where('customerUID', '==', targetUid).get();
            const movementsBatch = db.batch();
            movementsSnap.forEach(doc => {
                movementsBatch.delete(doc.ref);
            });
            await movementsBatch.commit();

            // 5. Anonimizar Pedidos
            const userFullName = (targetData.displayName || targetData.name || '').trim();
            const firstSpace = userFullName.indexOf(' ');
            const firstName = firstSpace !== -1 ? userFullName.substring(0, firstSpace) : userFullName;

            const ordersSnap = await db.collection('orders').where('customerUID', '==', targetUid).get();
            const ordersBatch = db.batch();
            ordersSnap.forEach(doc => {
                ordersBatch.update(doc.ref, {
                    nombre: firstName || 'Cliente',
                    whatsapp: null,
                    email: null,
                    customerCode: null,
                    accountDeleted: true,
                    updatedAt: new Date().toISOString()
                });
            });
            await ordersBatch.commit();

            // 6. Eliminar firma y PDF de R2
            if (s3Client && bucketName) {
                try {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: bucketName,
                        Key: `signatures/${targetUid}/contract_v1.png`
                    }));
                } catch (e) {
                    console.error("Error al borrar firma de R2:", e.message);
                }
                try {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: bucketName,
                        Key: `contracts/${targetUid}/contract_v1.pdf`
                    }));
                } catch (e) {
                    console.error("Error al borrar PDF de R2:", e.message);
                }
            }

            // 7. Eliminar en Firestore
            await targetUserRef.delete();

            // 8. Eliminar en Firebase Auth
            await auth.deleteUser(targetUid);

            return json(res, 200, { ok: true });
        }

        // --- ACCIONES EXCLUSIVAS DE ADMINISTRADOR ---
        if (!isCallerAdmin) {
            return json(res, 403, { error: 'Acción permitida solo para administradores.' });
        }

        // --- 4. ACCIÓN: adminCreateClient (SOLO ADMIN) ---
        if (action === 'adminCreateClient') {
            const { nombre, email, telefono, customerCode, password } = req.body;
            if (!nombre || !email || !telefono) {
                return json(res, 400, { error: 'Nombre, correo y teléfono son obligatorios.' });
            }

            const cleanEmail = email.trim().toLowerCase();
            const cleanPhone = telefono.replace(/\D/g, '');
            const cleanCode = customerCode ? customerCode.trim().toUpperCase() : null;

            // Validar código si se provee
            if (cleanCode) {
                const codeRegex = /^HC[A-Z0-9]{4,6}$/;
                if (!codeRegex.test(cleanCode)) {
                    return json(res, 400, { error: 'Formato de código inválido. Debe empezar con "HC" seguido de 4 a 6 caracteres alfanuméricos.' });
                }
                const lookupSnap = await db.collection('customerCodes').doc(cleanCode).get();
                if (lookupSnap.exists) {
                    return json(res, 400, { error: 'Ese HappyCódigo ya está tomado.' });
                }
            }

            // Crear en Firebase Auth
            const userParams = {
                email: cleanEmail,
                displayName: nombre
            };

            const isManualPassword = !!password;
            if (isManualPassword) {
                userParams.password = password;
            } else {
                userParams.password = Math.random().toString(36).substring(2, 10) + 'Ab1!';
            }

            let userRecord;
            try {
                userRecord = await auth.createUser(userParams);
            } catch (err) {
                console.error("Error al crear usuario en Firebase Auth:", err.message);
                return json(res, 400, { error: 'Error al registrar en Auth: ' + err.message });
            }

            const uid = userRecord.uid;

            // Guardar en Firestore
            try {
                if (cleanCode) {
                    await db.collection('customerCodes').doc(cleanCode).set({ uid });
                }

                await db.collection('users').doc(uid).set({
                    uid,
                    name: nombre,
                    email: cleanEmail,
                    phone: cleanPhone,
                    role: 'user',
                    activeDebt: 0,
                    happyPoints: 0,
                    customerCode: cleanCode || null,
                    createdInPerson: true,
                    createdBy: decoded.uid,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            } catch (err) {
                console.error("Error al inicializar Firestore del usuario:", err.message);
                // Intento de rollback en Auth
                await auth.deleteUser(uid);
                return json(res, 500, { error: 'Error al guardar datos de usuario.' });
            }

            // Obtener link de restablecimiento si se elige esa opción
            let resetLink = null;
            if (!isManualPassword) {
                try {
                    resetLink = await auth.generatePasswordResetLink(cleanEmail);
                } catch (err) {
                    console.error("Error generando reset link:", err.message);
                }
            }

            return json(res, 200, { ok: true, uid, resetLink });
        }

        // --- 5. ACCIÓN: adminSendPasswordReset (SOLO ADMIN) ---
        if (action === 'adminSendPasswordReset') {
            const { uid } = req.body;
            if (!uid) return json(res, 400, { error: 'Falta el uid del cliente.' });

            const targetUserSnap = await db.collection('users').doc(uid).get();
            if (!targetUserSnap.exists) {
                return json(res, 404, { error: 'El usuario no existe.' });
            }

            const email = targetUserSnap.data().email;
            if (!email) {
                return json(res, 400, { error: 'El usuario no tiene correo registrado.' });
            }

            let resetLink = null;
            try {
                resetLink = await auth.generatePasswordResetLink(email);
            } catch (err) {
                console.error("Error generando reset link:", err.message);
                return json(res, 500, { error: 'Error generando el link de restablecimiento: ' + err.message });
            }

            return json(res, 200, { ok: true, resetLink });
        }

        // --- 6. ACCIÓN: sendPasswordReset (PÚBLICA PARA USUARIOS) ---
        if (action === 'sendPasswordReset') {
            const { email } = req.body || {};
            if (!email || !email.includes('@')) {
                return json(res, 400, { error: 'Correo electrónico no válido.' });
            }

            const cleanEmail = email.trim().toLowerCase();

            try {
                // Generate link via Firebase Admin SDK
                const actionCodeSettings = {
                    url: 'https://happycorner.top/auth/action'
                };
                const resetLink = await auth.generatePasswordResetLink(cleanEmail, actionCodeSettings);

                // Send custom branded email via Resend
                const resendKey = process.env.RESEND_API_KEY;
                if (resendKey) {
                    const { Resend } = await import('resend');
                    const resend = new Resend(resendKey);

                    const emailHtml = `
                    <!DOCTYPE html>
                    <html>
                    <head><meta charset="utf-8"></head>
                    <body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 20px;">
                        <tr><td align="center">
                          <table width="100%" maxWidth="500" cellpadding="0" cellspacing="0" style="max-width:500px;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:32px;text-align:left;">
                            <tr><td style="text-align:center;padding-bottom:24px;">
                              <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="Happy Corner" style="border-radius:10px;display:block;margin:0 auto 10px;">
                              <div style="font-size:18px;font-weight:900;color:#ff5299;letter-spacing:-0.02em;">Happy Corner</div>
                              <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px;">Recuperación de Contraseña</div>
                            </td></tr>
                            <tr><td>
                              <p style="color:#ccc;font-size:15px;margin:0 0 12px;">Hola 👋</p>
                              <p style="color:#ccc;font-size:15px;margin:0 0 24px;line-height:1.5;">Has solicitado restablecer la contraseña de tu cuenta en Happy Corner. Haz clic en el botón de abajo para crear una nueva contraseña:</p>
                              <div style="text-align:center;margin:0 0 28px;">
                                <a href="${resetLink}" target="_blank" style="background:linear-gradient(135deg, #b01e5a, #ff5299, #ff8c42);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:14px;display:inline-block;">Restablecer Contraseña</a>
                              </div>
                              <p style="color:#666;font-size:12px;margin:0;line-height:1.4;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu contraseña actual seguirá siendo la misma.</p>
                            </td></tr>
                          </table>
                        </td></tr>
                      </table>
                    </body>
                    </html>
                    `;

                    await resend.emails.send({
                        from: 'Seguridad Happy Corner <seguridad@alertas.happycorner.top>',
                        to: [cleanEmail],
                        subject: '🔒 Restablecer tu contraseña en Happy Corner',
                        html: emailHtml
                    });
                }
            } catch (err) {
                console.log("sendPasswordReset handled silently or user not found:", err.message);
            }

            // Always respond with success to prevent account enumeration
            return json(res, 200, { ok: true, message: 'Si el correo existe, recibirás instrucciones de recuperación.' });
        }

        return json(res, 400, { error: 'Acción no válida' });

    } catch (e) {
        console.error("Error en handler de cuenta:", e.message);
        return json(res, 500, { error: 'Error interno del servidor.' });
    }
}
