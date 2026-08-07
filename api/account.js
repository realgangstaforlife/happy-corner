import { db, auth } from './_lib/firebaseAdmin.js';
import { applyCors, json } from './_lib/http.js';
import { s3Client, bucketName, publicUrl } from './_lib/r2Client.js';
import { DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';

// Rate limiting
const requestCounts = new Map();
function checkRateLimit(ip, limit = 10, windowMs = 60000) {
    const now = Date.now();
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }
    const requests = requestCounts.get(ip);
    const recentRequests = requests.filter(t => now - t < windowMs);
    if (recentRequests.length >= limit) return false;
    recentRequests.push(now);
    requestCounts.set(ip, recentRequests);
    return true;
}
async function deleteR2Prefix(prefix) {
    if (!s3Client || !bucketName) return;
    try {
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix
        });
        const listData = await s3Client.send(listCommand);
        if (!listData.Contents || listData.Contents.length === 0) return;

        const deleteParams = {
            Bucket: bucketName,
            Delete: {
                Objects: listData.Contents.map(item => ({ Key: item.Key }))
            }
        };
        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await s3Client.send(deleteCommand);
        console.log(`Deleted prefix: ${prefix} (${listData.Contents.length} files)`);
    } catch (e) {
        console.error(`Error deleting prefix ${prefix}:`, e.message);
    }
}


export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;
    export default async function handler(req, res) {
        if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;

        // Rate limit check
        const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
        if (!checkRateLimit(ip, 20, 60000)) {
            return json(res, 429, { error: 'Demasiadas solicitudes. Intenta en 1 minuto.' });
        }

        if (req.method !== 'POST') {
            return json(res, 405, { error: 'Method not allowed' });
        }

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

            // --- 6. ACCIÓN: sendPasswordReset (PÚBLICA — no requiere estar autenticado) ---
            if (action === 'sendPasswordReset') {
                const { email } = req.body || {};
                if (!email || !email.includes('@')) {
                    return json(res, 400, { error: 'Correo electrónico no válido.' });
                }

                const cleanEmail = email.trim().toLowerCase();

                try {
                    const userRecord = await auth.getUserByEmail(cleanEmail);
                    const providers = userRecord.providerData.map(p => p.providerId);

                    if (providers.includes('google.com') && !providers.includes('password')) {
                        return json(res, 200, { ok: true, isGoogleOnly: true });
                    }

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

                    return json(res, 200, { ok: true, isGoogleOnly: false });
                } catch (err) {
                    console.log("sendPasswordReset handled silently or user not found:", err.message);
                    return json(res, 200, { ok: true, isGoogleOnly: false });
                }
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
            // Admin check consultando el rol del documento de Firestore
            const isCallerAdmin = callerData.role === 'admin';

            // --- 2.5. ACCIÓN: sendDeletePin (ACCESIBLE POR EL PROPIO USUARIO) ---
            if (action === 'sendDeletePin') {
                const { uid } = req.body;
                if (!uid) return json(res, 400, { error: 'Falta el uid.' });
                if (uid !== decoded.uid) {
                    return json(res, 403, { error: 'No autorizado para solicitar PIN de esta cuenta.' });
                }

                const targetUserSnap = await db.collection('users').doc(uid).get();
                if (!targetUserSnap.exists) {
                    return json(res, 404, { error: 'El usuario no existe.' });
                }
                const userData = targetUserSnap.data();
                const email = userData.email;
                if (!email) return json(res, 400, { error: 'La cuenta no tiene correo registrado.' });

                const resendKey = process.env.RESEND_API_KEY;
                if (!resendKey) return json(res, 500, { error: 'El servicio de correos no está configurado.' });

                // check rate limit of 3 minutes
                const pinRef = db.collection('verificationPins').doc(`delete_${uid}`);
                const existingPin = await pinRef.get();
                if (existingPin.exists) {
                    const data = existingPin.data();
                    if (data.createdAt) {
                        const createdTime = new Date(data.createdAt).getTime();
                        if (Date.now() - createdTime < 3 * 60 * 1000) {
                            return json(res, 429, { error: 'Por favor espera 3 minutos antes de solicitar un nuevo PIN.' });
                        }
                    }
                }

                const { Resend } = await import('resend');
                const resend = new Resend(resendKey);
                const pin = Math.floor(100000 + Math.random() * 900000).toString();
                const crypto = await import('crypto');
                const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

                await pinRef.set({ hashedPin, expiresAt, attempts: 0, createdAt: new Date().toISOString() });

                await resend.emails.send({
                    from: 'Happy Corner <no-reply@alertas.happycorner.top>',
                    to: [email],
                    subject: '⚠️ PIN para eliminar tu cuenta en Happy Corner',
                    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:520px;background:#181818;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
        <tr>
          <td style="background:linear-gradient(135deg,#e11d48,#ff5252,#ff8c42);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="Happy Corner" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:900;color:#fff;">Eliminación de Cuenta</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px;">Confirmación de Seguridad</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 12px;">Hola 👋</p>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 24px;">Has solicitado eliminar permanentemente tu cuenta en Happy Corner. Esta acción borrará todo tu historial, score y datos de firma. Usa el siguiente PIN para confirmar:</p>
            <div style="background:#0d0d0d;border:2px solid rgba(255,82,82,0.4);border-radius:16px;padding:24px;text-align:center;margin:0 0 24px;">
              <div style="font-family:'Outfit',Arial,monospace;font-size:40px;font-weight:900;color:#ff5252;letter-spacing:10px;">${pin}</div>
              <div style="font-family:'Outfit',Arial,sans-serif;color:#666;font-size:12px;margin-top:8px;">Válido por 10 minutos · No lo compartas</div>
            </div>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#888;font-size:12px;margin:0;">Si no solicitaste esta eliminación, cambia la contraseña de tu cuenta inmediatamente.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
                });

                return json(res, 200, { success: true });
            }

            // --- 3. ACCIÓN: deleteAccount (ACCESIBLE POR EL PROPIO USUARIO O POR ADMIN) ---
            if (action === 'deleteAccount') {
                const { uid, pin } = req.body;
                const targetUid = uid || decoded.uid;

                // Si intenta borrar a otro usuario, debe ser admin
                if (targetUid !== decoded.uid && !isCallerAdmin) {
                    return json(res, 403, { error: 'No autorizado.' });
                }

                // Si no es admin (el usuario se está borrando a sí mismo), verificar PIN
                if (!isCallerAdmin) {
                    if (!pin) return json(res, 400, { error: 'Se requiere el PIN de verificación.' });

                    const pinRef = db.collection('verificationPins').doc(`delete_${targetUid}`);
                    const pinSnap = await pinRef.get();
                    if (!pinSnap.exists) {
                        return json(res, 400, { error: 'No se ha solicitado ningún PIN o ya expiró.' });
                    }

                    const pinData = pinSnap.data();
                    if (new Date(pinData.expiresAt) < new Date()) {
                        await pinRef.delete();
                        return json(res, 400, { error: 'El PIN ha expirado. Solicita uno nuevo.' });
                    }

                    if (pinData.attempts >= 5) {
                        await pinRef.delete();
                        return json(res, 400, { error: 'Has excedido el número máximo de intentos. Solicita un nuevo PIN.' });
                    }

                    const crypto = await import('crypto');
                    const incomingHashed = crypto.createHash('sha256').update(pin.trim()).digest('hex');
                    if (incomingHashed !== pinData.hashedPin) {
                        await pinRef.update({ attempts: pinData.attempts + 1 });
                        return json(res, 401, { error: `PIN incorrecto. Intento ${pinData.attempts + 1} de 5.` });
                    }

                    // Delete PIN code
                    await pinRef.delete();
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

                // 5. Eliminar Pedidos (completamente, como se aprobó en el plan)
                const ordersSnap = await db.collection('orders').where('customerUID', '==', targetUid).get();
                const ordersBatch = db.batch();
                ordersSnap.forEach(doc => {
                    ordersBatch.delete(doc.ref);
                });
                await ordersBatch.commit();

                // 6. Eliminar firma y PDF de R2 usando borrado de carpetas por prefijo
                await deleteR2Prefix(`signatures/${targetUid}/`);
                await deleteR2Prefix(`contracts/${targetUid}/`);

                // 7. Eliminar en Firestore
                await targetUserRef.delete();

                // 8. Eliminar en Firebase Auth
                await auth.deleteUser(targetUid);

                if (isCallerAdmin && targetData.email) {
                    const resendKey = process.env.RESEND_API_KEY;
                    if (resendKey) {
                        try {
                            const { Resend } = await import('resend');
                            const resend = new Resend(resendKey);
                            const userName = targetData.name || targetData.displayName || 'Cliente';
                            await resend.emails.send({
                                from: 'Happy Corner <no-reply@alertas.happycorner.top>',
                                to: [targetData.email],
                                subject: 'Tu cuenta en Happy Corner ha sido eliminada',
                                html: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:520px;background:#181818;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff9d5c);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="Happy Corner" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:900;color:#fff;">Happy Corner 🩷</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">Hasta pronto</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 12px;">Hola ${userName} 👋</p>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 20px;line-height:1.6;">
              Tu cuenta en <strong style="color:#ff5299;">Happy Corner</strong> ha sido eliminada por el administrador.
            </p>
            <div style="background:rgba(255,82,153,0.08);border:1px solid rgba(255,82,153,0.2);border-radius:14px;padding:18px 20px;margin-bottom:24px;">
              <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:13px;margin:0 0 10px;line-height:1.6;">
                📂 <strong>Ya no almacenamos ningún dato tuyo</strong> — tu perfil, historial de pedidos, puntos, contrato y firma han sido eliminados permanentemente de nuestros sistemas.
              </p>
              <p style="font-family:'Outfit',Arial,sans-serif;color:#888;font-size:12px;margin:0;line-height:1.6;">
                ⚠️ Esta acción es irreversible. No es posible recuperar tu información ni tu historial previo.
              </p>
            </div>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:14px;margin:0 0 24px;line-height:1.6;">
              Fue un placer tenerte con nosotros. ¡Te extrañaremos! Si tienes alguna pregunta, puedes escribirnos por WhatsApp.
            </p>
            <div style="text-align:center;">
              <a href="https://wa.me/573112871046" style="display:inline-block;background:linear-gradient(135deg,#b01e5a,#ff5299);color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:800;font-size:13px;">Contactar por WhatsApp</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:rgba(255,255,255,0.03);padding:16px 32px;text-align:center;">
            <div style="font-family:'Outfit',Arial,sans-serif;color:#555;font-size:11px;">Happy Corner · Cali, Valle del Cauca · happycorner.top</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
                            });
                        } catch (err) {
                            console.error("Error sending delete notification email:", err.message);
                        }
                    }
                }

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

            // --- 6. ACCIÓN: updateContractText (SOLO ADMIN) ---
            if (action === 'updateContractText') {
                const { articles } = req.body || {};
                if (!Array.isArray(articles) || articles.length === 0) {
                    return json(res, 400, { error: 'Falta el contenido del contrato (articles).' });
                }
                for (const art of articles) {
                    if (!art.title || !art.body) {
                        return json(res, 400, { error: 'Todos los artículos deben tener título y cuerpo.' });
                    }
                }

                const docRef = db.collection('config').doc('contractText');
                const docSnap = await docRef.get();
                let oldVersion = 1;
                let oldData = null;
                if (docSnap.exists) {
                    oldData = docSnap.data();
                    oldVersion = oldData.version || 1;
                }

                const newVersion = oldVersion + 1;
                const now = new Date();
                const timestamp = now.toISOString();

                // Guardar versión anterior en historial
                if (oldData) {
                    await docRef.collection('history').doc(`v${oldVersion}`).set({
                        ...oldData,
                        archivedAt: timestamp
                    });
                }

                // Guardar nueva versión
                const newContractData = {
                    articles,
                    version: newVersion,
                    lastUpdated: timestamp,
                    updatedBy: decoded.uid
                };
                await docRef.set(newContractData);

                // Consultar todos los usuarios con contractSigned: true
                const usersSnap = await db.collection('users').where('contractSigned', '==', true).get();
                const deadlineDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                const deadlineIso = deadlineDate.toISOString();
                const deadlineFormatted = deadlineDate.toLocaleDateString('es-CO', {
                    timeZone: 'America/Bogota',
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                const batch = db.batch();
                const emailPromises = [];
                const resendKey = process.env.RESEND_API_KEY;

                if (resendKey) {
                    const { Resend } = await import('resend');
                    usersSnap.forEach(userDoc => {
                        const userData = userDoc.data();
                        const userRef = db.collection('users').doc(userDoc.id);

                        batch.update(userRef, {
                            contractNeedsResign: true,
                            contractResignDeadline: deadlineIso
                        });

                        if (userData.email) {
                            const cleanEmail = userData.email.trim().toLowerCase();
                            const userName = userData.name || userData.displayName || 'Cliente';

                            const resend = new Resend(resendKey);
                            const emailPromise = resend.emails.send({
                                from: 'Happy Corner <no-reply@alertas.happycorner.top>',
                                to: [cleanEmail],
                                subject: '⚠️ Actualización Obligatoria: Acuerdo de Responsabilidad',
                                html: `
                            <!DOCTYPE html>
                            <html>
                            <head><meta charset="utf-8"></head>
                            <body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
                              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 20px;">
                                <tr><td align="center">
                                  <table width="100%" style="max-width:520px;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:32px;text-align:left;">
                                    <tr><td style="text-align:center;padding-bottom:24px;">
                                      <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="Happy Corner" style="border-radius:10px;display:block;margin:0 auto 10px;">
                                      <div style="font-size:18px;font-weight:900;color:#ff5299;letter-spacing:-0.02em;">Happy Corner</div>
                                      <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px;">Actualización de Términos</div>
                                    </td></tr>
                                    <tr><td>
                                      <p style="color:#ccc;font-size:15px;margin:0 0 12px;">Hola ${userName} 👋</p>
                                      <p style="color:#ccc;font-size:15px;margin:0 0 20px;line-height:1.5;">Hemos actualizado nuestro <strong>Acuerdo de Responsabilidad de Deuda</strong> para reflejar los nuevos lineamientos de HappyScore y políticas de abonos.</p>
                                      <p style="color:#ff5299;font-size:15px;font-weight:700;margin:0 0 24px;line-height:1.5;">⚠️ Tenés hasta el <strong>${deadlineFormatted}</strong> para firmarlo nuevamente, de lo contrario tu acceso a compras a crédito podría verse afectado.</p>
                                      <div style="text-align:center;margin:0 0 28px;">
                                        <a href="https://happycorner.top/mi-cuenta" target="_blank" style="background:linear-gradient(135deg, #b01e5a, #ff5299, #ff8c42);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:14px;display:inline-block;">✍️ Revisar y Firmar Contrato</a>
                                      </div>
                                      <p style="color:#666;font-size:12px;margin:0;line-height:1.4;">Si tienes alguna duda sobre las nuevas condiciones, puedes comunicarte con el administrador.</p>
                                    </td></tr>
                                  </table>
                                </td></tr>
                              </table>
                            </body>
                            </html>
                            `
                            }).catch(err => {
                                console.error(`Error enviando correo a ${cleanEmail}:`, err.message);
                            });
                            emailPromises.push(emailPromise);
                        }
                    });
                } else {
                    usersSnap.forEach(userDoc => {
                        const userRef = db.collection('users').doc(userDoc.id);
                        batch.update(userRef, {
                            contractNeedsResign: true,
                            contractResignDeadline: deadlineIso
                        });
                    });
                }

                await batch.commit();
                if (emailPromises.length > 0) {
                    await Promise.all(emailPromises);
                }

                return json(res, 200, { ok: true, version: newVersion, usersNotified: usersSnap.size });
            }

            // --- 6.5 ACCIÓN: uploadMarketingImage (SOLO ADMIN) ---
            if (action === 'uploadMarketingImage') {
                const callerSnap = await db.collection('users').doc(decoded.uid).get();
                const callerData = callerSnap.data() || {};
                if (callerData.role !== 'admin') {
                    return json(res, 403, { error: 'Acción permitida solo para administradores.' });
                }

                const { imageData } = req.body;
                if (!imageData) return json(res, 400, { error: 'Falta la imagen.' });

                const match = imageData.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
                if (!match) return json(res, 400, { error: 'Formato de imagen no válido.' });

                const imageBuffer = Buffer.from(match[2], 'base64');
                if (imageBuffer.length > 5 * 1024 * 1024) {
                    return json(res, 400, { error: 'La imagen supera el límite de 5MB.' });
                }

                if (!s3Client) return json(res, 500, { error: 'R2 Storage no está configurado.' });

                const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
                const fileName = `marketing/${Date.now()}.${ext}`;

                await s3Client.send(new PutObjectCommand({
                    Bucket: bucketName,
                    Key: fileName,
                    Body: imageBuffer,
                    ContentType: `image/${match[1]}`
                }));

                return json(res, 200, { ok: true, url: `${publicUrl}/${fileName}` });
            }

            // --- 7. ACCIÓN: sendMarketingEmail (SOLO ADMIN) ---
            if (action === 'sendMarketingEmail') {
                const { subject, body, imageUrls } = req.body || {};
                if (!subject || !body) return json(res, 400, { error: 'Falta el asunto o el cuerpo.' });

                const resendKey = process.env.RESEND_API_KEY;
                if (!resendKey) return json(res, 500, { error: 'El servicio de correos no está configurado.' });

                // Get all marketing opt-in users
                const usersSnap = await db.collection('users').where('marketingOptIn', '==', true).get();
                if (usersSnap.empty) return json(res, 200, { ok: true, sent: 0 });

                const { Resend } = await import('resend');
                const resend = new Resend(resendKey);

                const imagesHtml = (imageUrls && imageUrls.length > 0)
                    ? imageUrls.map(url => `<img src="${url}" alt="" style="width:100%;max-width:460px;border-radius:12px;margin:12px 0;display:block;">`).join('')
                    : '';

                const bodyHtml = body.replace(/\n/g, '<br>');

                const htmlTemplate = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:520px;background:#181818;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff9d5c);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="Happy Corner" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:24px;font-weight:900;color:#fff;">Happy Corner 🩷</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${imagesHtml}
            <div style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;line-height:1.7;">${bodyHtml}</div>
            <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
              <a href="https://happycorner.top" style="display:inline-block;background:linear-gradient(135deg,#b01e5a,#ff5299);color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:800;font-size:13px;">Visitar Happy Corner</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:rgba(255,255,255,0.03);padding:16px 32px;text-align:center;">
            <div style="font-family:'Outfit',Arial,sans-serif;color:#555;font-size:11px;">Recibiste este correo porque optaste por recibir novedades de Happy Corner.<br>Para darte de baja, visita tu perfil en <a href="https://happycorner.top/mi-cuenta" style="color:#ff5299;">Mi Cuenta</a>.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

                // Send in batches of 50 (Resend limit per call is 1 recipient per call but we fire concurrent promises in groups)
                const emails = [];
                usersSnap.forEach(userDoc => {
                    const userData = userDoc.data();
                    if (userData.email) emails.push(userData.email.trim().toLowerCase());
                });

                const BATCH_SIZE = 10;
                let sent = 0;
                for (let i = 0; i < emails.length; i += BATCH_SIZE) {
                    const batch = emails.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(to =>
                        resend.emails.send({ from: 'Happy Corner <no-reply@alertas.happycorner.top>', to: [to], subject, html: htmlTemplate })
                            .catch(err => console.error(`Error sending to ${to}:`, err.message))
                    ));
                    sent += batch.length;
                }

                return json(res, 200, { ok: true, sent, total: emails.length });
            }

            return json(res, 400, { error: 'Acción no válida' });

        } catch (e) {
            console.error("Error en handler de cuenta:", e.message);
            return json(res, 500, { error: 'Error interno del servidor.' });
        }
    }