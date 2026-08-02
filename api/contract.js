import crypto from 'crypto';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { db, auth } from './_lib/firebaseAdmin.js';
import { s3Client, bucketName, publicUrl } from './_lib/r2Client.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { applyCors, json } from './_lib/http.js';

// ============================================================
// Helpers de IP, dispositivo, navegador y ubicacion
// ============================================================
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function parseUserAgent(ua) {
    if (!ua) return { device: 'Desconocido', browser: 'Desconocido' };

    let device = 'Computador';
    let osVersion = '';

    if (/iPhone/i.test(ua)) {
        device = 'iPhone';
        const m = ua.match(/iPhone OS (\d+[_.]\d+(?:[_.]\d+)?)/i);
        if (m) osVersion = ` (iOS ${m[1].replace(/_/g, '.')})`;
    } else if (/iPad/i.test(ua)) {
        device = 'iPad';
        const m = ua.match(/OS (\d+[_.]\d+(?:[_.]\d+)?)/i);
        if (m) osVersion = ` (iPadOS ${m[1].replace(/_/g, '.')})`;
    } else if (/Android/i.test(ua)) {
        device = 'Android';
        const m = ua.match(/Android\s+([^;)]+)/i);
        if (m) osVersion = ` (Android ${m[1].trim()})`;
    } else if (/Macintosh/i.test(ua)) {
        device = 'Mac';
        const m = ua.match(/Mac OS X (\d+[_.]\d+(?:[_.]\d+)?)/i);
        if (m) osVersion = ` (macOS ${m[1].replace(/_/g, '.')})`;
    } else if (/Windows/i.test(ua)) {
        device = 'Windows';
        const m = ua.match(/Windows NT (\d+\.\d+)/i);
        if (m) {
            const vmap = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
            osVersion = ` (Windows ${vmap[m[1]] || m[1]})`;
        }
    }

    device = device + osVersion;

    let browser = 'Desconocido';
    let bm;
    if (/Edg\/(\d+)/i.test(ua)) {
        bm = ua.match(/Edg\/(\d+)/i);
        browser = `Edge ${bm[1]}`;
    } else if (/Chrome\/(\d+)/i.test(ua) && !/Chromium/i.test(ua)) {
        bm = ua.match(/Chrome\/(\d+)/i);
        browser = `Chrome ${bm[1]}`;
    } else if (/Safari\/(\d+)/i.test(ua) && !/Chrome/i.test(ua)) {
        bm = ua.match(/Version\/(\d+)/i) || ua.match(/Safari\/(\d+)/i);
        browser = `Safari ${bm[1]}`;
    } else if (/Firefox\/(\d+)/i.test(ua)) {
        bm = ua.match(/Firefox\/(\d+)/i);
        browser = `Firefox ${bm[1]}`;
    }

    return { device, browser };
}

async function getLocationFromIp(ip) {
    try {
        if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('::1') || ip.startsWith('192.168.')) {
            return 'Red local / Desconocido';
        }
        const resp = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country,isp`);
        const data = await resp.json();
        const partes = [data.city, data.regionName, data.country].filter(Boolean);
        return partes.join(', ') + (data.isp ? ` (${data.isp})` : '');
    } catch {
        return 'Desconocido';
    }
}

async function generarPdfContrato({ typedName, signatureImageBuffer, signedAt, ip, device, browser, location, logoBuffer }) {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    let fontReg, fontBold;
    try {
        const { readFileSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        
        const fontRegBytes = readFileSync(join(__dirname, '_lib', 'Outfit-Regular.ttf'));
        const fontBoldBytes = readFileSync(join(__dirname, '_lib', 'Outfit-Bold.ttf'));
        
        fontReg = await pdfDoc.embedFont(fontRegBytes);
        fontBold = await pdfDoc.embedFont(fontBoldBytes);
    } catch (e) {
        console.log("Local Outfit fonts not found, attempting to fetch from CDN...");
        try {
            const resReg = await fetch("https://github.com/google/fonts/raw/main/ofl/outfit/static/Outfit-Regular.ttf");
            const resBold = await fetch("https://github.com/google/fonts/raw/main/ofl/outfit/static/Outfit-Bold.ttf");
            
            if (resReg.ok && resBold.ok) {
                const regBuffer = await resReg.arrayBuffer();
                const boldBuffer = await resBold.arrayBuffer();
                fontReg = await pdfDoc.embedFont(regBuffer);
                fontBold = await pdfDoc.embedFont(boldBuffer);
                console.log("Outfit fonts loaded successfully from CDN.");
            } else {
                throw new Error("CDN response not OK");
            }
        } catch (cdnErr) {
            console.error("Failed to load Outfit fonts from CDN, falling back to Helvetica", cdnErr);
            fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
        }
    }

    const pink = rgb(1, 0.322, 0.6);       // #ff5299
    const darkGray = rgb(0.1, 0.1, 0.1);
    const midGray = rgb(0.35, 0.35, 0.35);
    const lightGray = rgb(0.88, 0.88, 0.88);
    const width = 595;
    const margin = 62; // Increased to 62px for better symmetry and breathing room

    const page = pdfDoc.addPage([width, 842]); // A4


    // ——— Header band ———
    page.drawRectangle({ x: 0, y: 792, width, height: 50, color: pink });

    // Logo in header
    if (logoBuffer) {
        try {
            const logoImg = await pdfDoc.embedPng(logoBuffer);
            page.drawImage(logoImg, { x: margin, y: 800, width: 34, height: 34 });
        } catch { /* skip if logo embed fails */ }
    }

    // Brand name in header
    const titleX = logoBuffer ? margin + 44 : margin;
    page.drawText('Happy Corner', { x: titleX, y: 810, size: 17, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText('Contrato de Responsabilidad', { x: titleX, y: 797, size: 9, font: fontReg, color: rgb(1, 1, 1, 0.75) });

    let y = 752;

    // ——— Title ———
    const titleText = 'ACUERDO DE RESPONSABILIDAD DE DEUDA';
    const titleWidth = fontBold.widthOfTextAtSize(titleText, 13);
    const centerTitleX = (width - titleWidth) / 2;

    page.drawText(titleText, {
        x: centerTitleX, y, size: 13, font: fontBold, color: pink
    });
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: pink });
    y -= 24;

    // ——— Contract clauses ———
    const clauses = [
        { num: '1.', title: 'RECONOCIMIENTO DE DEUDA', body: 'El cliente acepta que cualquier saldo pendiente en su cuenta representa una deuda real y exigible con Happy Corner.' },
        { num: '2.', title: 'TRANSPARENCIA', body: 'Los movimientos de deuda y pagos quedan registrados en el sistema y son accesibles para el cliente en cualquier momento.' },
        { num: '3.', title: 'COMPROMISO DE PAGO', body: 'El cliente se compromete a saldar sus deudas de forma oportuna y a no acumular saldos que superen su capacidad de pago.' },
        { num: '4.', title: 'CONSECUENCIAS', body: 'En caso de incumplimiento reiterado, Happy Corner podrá negar el acceso a nuevas compras a crédito hasta que la deuda sea saldada.' },
        { num: '5.', title: 'VOLUNTARIEDAD', body: 'El cliente confirma que acepta este contrato de manera voluntaria y consciente, sin haber sido presionado.' },
    ];

    for (const cl of clauses) {
        page.drawText(`${cl.num} ${cl.title}`, { x: margin, y, size: 10, font: fontBold, color: darkGray });
        y -= 15;
        // Word-wrap body into chunks of ~76 chars
        const words = cl.body.split(' ');
        let line = '';
        for (const w of words) {
            if ((line + w).length > 76) {
                page.drawText(line.trim(), { x: margin + 12, y, size: 9, font: fontReg, color: midGray });
                y -= 14;
                line = w + ' ';
            } else { line += w + ' '; }
        }
        if (line.trim()) {
            page.drawText(line.trim(), { x: margin + 12, y, size: 9, font: fontReg, color: midGray });
            y -= 14;
        }
        y -= 10;
    }

    y -= 4;
    page.drawText('Este documento es para control interno de Happy Corner y no constituye un instrumento legal formal.', {
        x: margin, y, size: 8, font: fontReg, color: lightGray
    });
    y -= 30;

    // ——— Signature Data Table ———
    page.drawText('DATOS DE LA FIRMA', { x: margin, y, size: 11, font: fontBold, color: pink });
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: pink });
    y -= 18;

    const tableData = [
        ['Firmado por', typedName],
        ['Fecha y hora', new Date(signedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) + ' (COT)'],
        ['Dirección IP', ip],
        ['Dispositivo', device],
        ['Navegador', browser],
        ['Ubicación aprox.', location],
    ];

    const col1 = margin;
    const col2 = margin + 130;
    const rowH = 18;
    let rowY = y;

    tableData.forEach(([label, value], i) => {
        const bg = i % 2 === 0 ? rgb(0.97, 0.97, 0.97) : rgb(1, 1, 1);
        page.drawRectangle({ x: col1 - 4, y: rowY - 4, width: width - margin * 2 + 8, height: rowH, color: bg });
        page.drawText(label, { x: col1, y: rowY + 3, size: 9, font: fontBold, color: darkGray });
        page.drawText(String(value).slice(0, 68), { x: col2, y: rowY + 3, size: 9, font: fontReg, color: midGray });
        rowY -= rowH;
    });

    y = rowY - 26;

    // ——— Signature image ———
    page.drawText('FIRMA DEL CLIENTE', { x: margin, y, size: 11, font: fontBold, color: pink });
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: pink });
    y -= 95;

    page.drawRectangle({ x: margin - 2, y, width: 206, height: 84, borderColor: lightGray, borderWidth: 1 });
    const pngImage = await pdfDoc.embedPng(signatureImageBuffer);
    page.drawImage(pngImage, { x: margin, y: y + 2, width: 200, height: 80 });
    y -= 20;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + 200, y }, thickness: 0.5, color: lightGray });
    page.drawText(typedName, { x: margin, y: y - 12, size: 9, font: fontReg, color: midGray });

    // ——— Footer band ———
    const footerH = 32;
    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: rgb(0.06, 0.06, 0.06) });
    const year = new Date().getFullYear();
    const footerStr = `© ${year} Happy Corner · happycorner.top · Contrato versión v1 · Generado el ${new Date().toLocaleDateString('es-CO')}`;
    const footerStrWidth = fontReg.widthOfTextAtSize(footerStr, 7.5);
    const centerFooterX = (width - footerStrWidth) / 2;

    page.drawText(footerStr, {
        x: centerFooterX, y: 11, size: 7.5, font: fontReg, color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

// ============================================================
// Handler principal
// ============================================================
export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;

    if (req.method !== 'POST') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    try {
        const { action } = req.body;

        // ============================================================
        // ACCION: sendPin (sin cambios respecto a tu version original)
        // ============================================================
        if (action === 'sendPin') {
            // Require authenticated caller and confirm they own the UID
            const sendPinToken = (req.headers.authorization || '').replace('Bearer ', '');
            if (!sendPinToken) return json(res, 401, { error: 'No autenticado.' });

            let sendPinDecoded;
            try {
                sendPinDecoded = await auth.verifyIdToken(sendPinToken);
            } catch {
                return json(res, 401, { error: 'Token inválido.' });
            }

            const { uid, email } = req.body;
            if (!uid || !email) return json(res, 400, { error: 'Falta uid o correo electronico.' });

            // Ownership check: the caller must be the user whose PIN is being sent
            if (sendPinDecoded.uid !== uid) {
                return json(res, 403, { error: 'No autorizado para solicitar PIN de este usuario.' });
            }

            const resendKey = process.env.RESEND_API_KEY;
            if (!resendKey) return json(res, 500, { error: 'El servicio de correos no esta configurado.' });

            const pinRef = db.collection('verificationPins').doc(uid);
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

            const resend = new Resend(resendKey);
            const pin = Math.floor(100000 + Math.random() * 900000).toString();
            const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

            await pinRef.set({
                hashedPin,
                expiresAt,
                attempts: 0,
                createdAt: new Date().toISOString()
            });

            const emailResult = await resend.emails.send({
                from: 'Happy Corner <no-reply@alertas.happycorner.top>',
                to: [email],
                subject: 'Tu PIN para firmar el Contrato de Happy Corner',
                html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:520px;background:#181818;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff8c42);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="Happy Corner" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:900;color:#fff;">Happy Corner</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px;">Verificación de Identidad</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 12px;">Hola 👋</p>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 24px;">Has solicitado firmar tu <strong style="color:#fff;">contrato de responsabilidad</strong> en Happy Corner. Usa el siguiente PIN para continuar:</p>
            <!-- PIN Box -->
            <div style="background:#0d0d0d;border:2px solid rgba(255,82,153,0.4);border-radius:16px;padding:24px;text-align:center;margin:0 0 24px;">
              <div style="font-family:'Outfit',Arial,monospace;font-size:40px;font-weight:900;color:#ff5299;letter-spacing:10px;">${pin}</div>
              <div style="font-family:'Outfit',Arial,sans-serif;color:#666;font-size:12px;margin-top:8px;">Válido por 10 minutos · No lo compartas</div>
            </div>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#555;font-size:12px;margin:0;">Si no solicitaste este PIN, ignora este correo. Nadie de Happy Corner te pedirá este código.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
            <div style="font-family:'Outfit',Arial,sans-serif;color:#444;font-size:11px;">
              © ${new Date().getFullYear()} Happy Corner &nbsp;·&nbsp;
              <a href="https://happycorner.top/terminos" style="color:#ff5299;text-decoration:none;">Términos</a>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
            });

            if (emailResult.error) {
                console.error("Resend error:", emailResult.error);
                return json(res, 500, { error: 'Error enviando el correo.' });
            }

            return json(res, 200, { success: true });
        }

        // ============================================================
        // ACCION: sign (ACTUALIZADA con PDF + metadata real)
        // ============================================================
        if (action === 'sign') {
            // Require authenticated caller and confirm they own the UID
            const signToken = (req.headers.authorization || '').replace('Bearer ', '');
            if (!signToken) return json(res, 401, { error: 'No autenticado.' });

            let signDecoded;
            try {
                signDecoded = await auth.verifyIdToken(signToken);
            } catch {
                return json(res, 401, { error: 'Token inválido.' });
            }

            const { uid, typedName, signatureImage, pin, userAgent } = req.body;
            if (!uid || !typedName || !signatureImage || !pin) {
                return json(res, 400, { error: 'Faltan campos requeridos para firmar el contrato.' });
            }

            // Ownership check: caller must be the user whose contract is being signed
            if (signDecoded.uid !== uid) {
                return json(res, 403, { error: 'No autorizado para firmar el contrato de este usuario.' });
            }

            const pinRef = db.collection('verificationPins').doc(uid);
            const pinSnap = await pinRef.get();

            if (!pinSnap.exists) {
                return json(res, 400, { error: 'No se ha solicitado ningun PIN para este usuario o ya expiro.' });
            }

            const pinData = pinSnap.data();
            const now = new Date();

            if (new Date(pinData.expiresAt) < now) {
                await pinRef.delete();
                return json(res, 400, { error: 'El PIN ha expirado. Por favor solicita uno nuevo.' });
            }

            if (pinData.attempts >= 5) {
                await pinRef.delete();
                return json(res, 400, { error: 'Has excedido el numero maximo de intentos. Solicita un nuevo PIN.' });
            }

            const incomingHashed = crypto.createHash('sha256').update(pin.trim()).digest('hex');

            if (incomingHashed !== pinData.hashedPin) {
                await pinRef.update({ attempts: pinData.attempts + 1 });
                return json(res, 401, { error: `PIN incorrecto. Intento ${pinData.attempts + 1} de 5.` });
            }

            const match = signatureImage.match(/^data:image\/(png|jpeg);base64,(.+)$/);
            if (!match) return json(res, 400, { error: 'Formato de imagen de firma no valido.' });
            const imageBuffer = Buffer.from(match[2], 'base64');

            // --- Capturar datos reales del lado del servidor ---
            const ip = getClientIp(req);
            const { device, browser } = parseUserAgent(userAgent);
            const location = await getLocationFromIp(ip);
            const timestamp = now.toISOString();

            if (!s3Client) {
                return json(res, 500, { error: 'R2 Storage no esta configurado.' });
            }

            // Subir imagen de firma a R2
            const signatureFileName = `signatures/${uid}/contract_v1.png`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: signatureFileName,
                Body: imageBuffer,
                ContentType: `image/${match[1]}`
            }));

            // Generar PDF y subirlo a R2
            // Load logo for PDF embedding
            let logoBuffer = null;
            try {
                const { readFileSync } = await import('fs');
                const { join, dirname } = await import('path');
                const { fileURLToPath } = await import('url');
                const __dirname = dirname(fileURLToPath(import.meta.url));
                logoBuffer = readFileSync(join(__dirname, '..', 'loguito.png'));
            } catch { /* logo not critical */ }

            const pdfBuffer = await generarPdfContrato({
                typedName,
                signatureImageBuffer: imageBuffer,
                signedAt: timestamp,
                ip, device, browser, location,
                logoBuffer
            });
            const pdfFileName = `contracts/${uid}/contract_v1.pdf`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: pdfFileName,
                Body: pdfBuffer,
                ContentType: 'application/pdf'
            }));
            const pdfUrl = `${publicUrl}/${pdfFileName}`;

            // Guardar contrato en Firestore
            await db.collection('debtContracts').doc(uid).set({
                uid,
                customerUID: uid,
                signed: true,
                typedName,
                signatureUrl: `${publicUrl}/${signatureFileName}`,
                pdfUrl,
                version: 'v1',
                signedAt: timestamp,
                ip,
                device,
                browser,
                location,
                userAgent: userAgent || 'unknown',
                screenWidth: req.body.screenWidth || null,
                screenHeight: req.body.screenHeight || null,
                language: req.body.language || null
            });

            await db.collection('users').doc(uid).update({
                contractSigned: true,
                contractVersion: 'v1',
                contractSignedAt: timestamp
            });

            // Enviar PDF por correo (al admin y al cliente)
            const userSnap = await db.collection('users').doc(uid).get();
            const clienteEmail = userSnap.data()?.email;
            const resend = new Resend(process.env.RESEND_API_KEY);
            const pdfBase64 = pdfBuffer.toString('base64');

            const destinatarios = ['happycorner.com@gmail.com'];
            if (clienteEmail) destinatarios.push(clienteEmail);

            await resend.emails.send({
                from: 'Happy Corner <no-reply@alertas.happycorner.top>',
                to: destinatarios,
                subject: `✅ Contrato firmado · ${typedName}`,
                html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:560px;background:#181818;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff8c42);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:900;color:#fff;">Contrato Firmado ✅</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">Happy Corner · Acuerdo de Responsabilidad</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 20px;">El siguiente contrato ha sido firmado exitosamente:</p>
            <!-- Info table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#222;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;width:40%;">Firmado por</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#fff;">${typedName}</td>
              </tr>
              <tr style="background:#1a1a1a;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Fecha</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${new Date(timestamp).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
              </tr>
              <tr style="background:#222;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">IP</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${ip}</td>
              </tr>
              <tr style="background:#1a1a1a;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Dispositivo</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${device} · ${browser}</td>
              </tr>
              <tr style="background:#222;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Ubicación</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${location}</td>
              </tr>
            </table>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#777;font-size:13px;margin:0;">El PDF firmado se adjunta a este correo para tus registros.</p>
          </td>
        </tr>
        <!-- Social footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
            <div style="margin-bottom:8px;">
              <a href="https://instagram.com/happycornerof" style="color:#ff5299;text-decoration:none;font-family:'Outfit',Arial,sans-serif;font-size:12px;margin:0 8px;">📸 Instagram</a>
              <a href="https://wa.me/573000000000" style="color:#ff5299;text-decoration:none;font-family:'Outfit',Arial,sans-serif;font-size:12px;margin:0 8px;">💬 WhatsApp</a>
            </div>
            <div style="font-family:'Outfit',Arial,sans-serif;color:#444;font-size:11px;">© ${new Date().getFullYear()} Happy Corner</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
                attachments: [{ filename: `contrato_${typedName}.pdf`, content: pdfBase64 }]
            });

            await pinRef.delete();
            return json(res, 200, { success: true, message: 'Contrato firmado correctamente.', pdfUrl });
        }

        // ============================================================
        // ACCION: adminSign (Firma en persona sin PIN)
        // ============================================================
        if (action === 'adminSign') {
            const authHeader = req.headers.authorization || '';
            const idToken = authHeader.replace('Bearer ', '');
            if (!idToken) return json(res, 401, { error: 'No autenticado.' });

            let decoded;
            try {
                decoded = await auth.verifyIdToken(idToken);
            } catch (e) {
                return json(res, 401, { error: 'Token inválido.' });
            }

            // Verify caller is admin via custom claim (JWT-level — cannot be spoofed via Firestore)
            if (decoded.role !== 'admin') {
                return json(res, 403, { error: 'Acción permitida solo para administradores.' });
            }

            // Still fetch caller display name for the email body
            const callerSnap = await db.collection('users').doc(decoded.uid).get();
            const callerData = callerSnap.data() || {};

            const { uid, typedName, signatureImage, userAgent, screenWidth, screenHeight, language } = req.body;
            if (!uid || !typedName || !signatureImage) {
                return json(res, 400, { error: 'Faltan campos requeridos para firmar el contrato.' });
            }

            const match = signatureImage.match(/^data:image\/(png|jpeg);base64,(.+)$/);
            if (!match) return json(res, 400, { error: 'Formato de imagen de firma no valido.' });
            const imageBuffer = Buffer.from(match[2], 'base64');

            const ip = getClientIp(req);
            const { device, browser } = parseUserAgent(userAgent);
            const location = await getLocationFromIp(ip);
            const timestamp = new Date().toISOString();

            if (!s3Client) {
                return json(res, 500, { error: 'R2 Storage no esta configurado.' });
            }

            // Subir imagen de firma a R2
            const signatureFileName = `signatures/${uid}/contract_v1.png`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: signatureFileName,
                Body: imageBuffer,
                ContentType: `image/${match[1]}`
            }));

            // Generar PDF y subirlo a R2
            let logoBuffer = null;
            try {
                const { readFileSync } = await import('fs');
                const { join, dirname } = await import('path');
                const { fileURLToPath } = await import('url');
                const __dirname = dirname(fileURLToPath(import.meta.url));
                logoBuffer = readFileSync(join(__dirname, '..', 'loguito.png'));
            } catch { /* logo not critical */ }

            const pdfBuffer = await generarPdfContrato({
                typedName,
                signatureImageBuffer: imageBuffer,
                signedAt: timestamp,
                ip, device, browser, location,
                logoBuffer
            });
            const pdfFileName = `contracts/${uid}/contract_v1.pdf`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: pdfFileName,
                Body: pdfBuffer,
                ContentType: 'application/pdf'
            }));
            const pdfUrl = `${publicUrl}/${pdfFileName}`;

            // Guardar contrato en Firestore con metadata de firma en persona
            await db.collection('debtContracts').doc(uid).set({
                uid,
                customerUID: uid,
                signed: true,
                typedName,
                signatureUrl: `${publicUrl}/${signatureFileName}`,
                pdfUrl,
                version: 'v1',
                signedAt: timestamp,
                ip,
                device,
                browser,
                location,
                userAgent: userAgent || 'unknown',
                screenWidth: screenWidth || null,
                screenHeight: screenHeight || null,
                language: language || null,
                signedInPerson: true,
                witnessedByAdmin: decoded.uid
            });

            await db.collection('users').doc(uid).update({
                contractSigned: true,
                contractVersion: 'v1',
                contractSignedAt: timestamp
            });

            // Enviar PDF por correo (al admin y al cliente)
            const userSnap = await db.collection('users').doc(uid).get();
            const clienteEmail = userSnap.data()?.email;
            const resend = new Resend(process.env.RESEND_API_KEY);
            const pdfBase64 = pdfBuffer.toString('base64');

            const destinatarios = ['happycorner.com@gmail.com'];
            if (clienteEmail) destinatarios.push(clienteEmail);

            await resend.emails.send({
                from: 'Happy Corner <no-reply@alertas.happycorner.top>',
                to: destinatarios,
                subject: `✅ Contrato firmado en persona · ${typedName}`,
                html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Outfit',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:560px;background:#181818;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff8c42);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:900;color:#fff;">Contrato Firmado en Persona ✅</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">Happy Corner · Testigo: ${callerData.displayName || callerData.name || 'Administrador'}</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 20px;">El siguiente contrato ha sido firmado exitosamente en persona con presencia del administrador:</p>
            <!-- Info table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#222;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;width:40%;">Firmado por</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#fff;">${typedName}</td>
              </tr>
              <tr style="background:#1a1a1a;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Fecha</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${new Date(timestamp).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
              </tr>
              <tr style="background:#222;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">IP del Servidor</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${ip}</td>
              </tr>
              <tr style="background:#1a1a1a;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Dispositivo Administrador</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${device} · ${browser}</td>
              </tr>
              <tr style="background:#222;">
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Ubicación de Firma</td>
                <td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${location}</td>
              </tr>
            </table>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#777;font-size:13px;margin:0;">El PDF firmado se adjunta a este correo para tus registros.</p>
          </td>
        </tr>
        <!-- Social footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
            <div style="margin-bottom:8px;">
              <a href="https://instagram.com/happycornerof" style="color:#ff5299;text-decoration:none;font-family:'Outfit',Arial,sans-serif;font-size:12px;margin:0 8px;">📸 Instagram</a>
              <a href="https://wa.me/573000000000" style="color:#ff5299;text-decoration:none;font-family:'Outfit',Arial,sans-serif;font-size:12px;margin:0 8px;">💬 WhatsApp</a>
            </div>
            <div style="font-family:'Outfit',Arial,sans-serif;color:#444;font-size:11px;">© ${new Date().getFullYear()} Happy Corner</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
                attachments: [{ filename: `contrato_${typedName}.pdf`, content: pdfBase64 }]
            });

            return json(res, 200, { success: true, message: 'Contrato firmado en persona correctamente.', pdfUrl });
        }

        return json(res, 400, { error: 'Accion no valida.' });

    } catch (error) {
        console.error("Error in contract API:", error);
        return json(res, 500, { error: 'Ha ocurrido un error interno. Por favor intenta de nuevo.' });
    }
}