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

// ============================================================
// Texto del contrato — Artículos 1–5 (creditcorner.md v2)
// Usado como fallback si config/contractText no existe en Firestore
// ============================================================
const FALLBACK_VERSION = 2;
const FALLBACK_ARTICLES = [
    {
        title: 'Artículo 1. Deudas pendientes y nuevas compras',
        body: `El cliente entiende y acepta que la existencia de una deuda pendiente podrá afectar su posibilidad de realizar nuevas compras en Happy Corner. La existencia de un saldo a favor de Happy Corner faculta al establecimiento para evaluar cada nueva solicitud de compra de manera individual, teniendo en cuenta las circunstancias particulares de cada caso.

Mientras exista una deuda activa, Happy Corner tendrá plena libertad para decidir si autoriza o no nuevas ventas al cliente, incluso cuando este manifieste su intención de pagar únicamente el valor del nuevo producto y no solicitar un crédito adicional. La decisión de aprobar o rechazar una venta corresponderá exclusivamente a Happy Corner y no requerirá motivación o justificación alguna.

Como condición para aprobar una nueva compra, Happy Corner podrá exigir que el cliente destine previamente una parte del dinero disponible al pago de la deuda existente. El valor mínimo de dicho abono será determinado exclusivamente por Happy Corner, considerando el saldo pendiente, el historial de pagos del cliente, el tiempo transcurrido desde la generación de la deuda, el valor de la nueva compra, la frecuencia con la que utiliza el servicio de crédito y cualquier otra circunstancia que resulte pertinente para una adecuada administración del riesgo.

El cliente reconoce que la negativa de Happy Corner a realizar una venta en estas circunstancias constituye una decisión comercial legítima y no representa un incumplimiento, discriminación o vulneración de derecho alguno. Del mismo modo, el hecho de que Happy Corner haya autorizado ventas anteriores en condiciones similares no generará precedente ni obligación de actuar de la misma forma en futuras ocasiones.

La realización de una compra anterior, la existencia de un historial positivo, la puntualidad en pagos anteriores o la aprobación de créditos previos no obligan a Happy Corner a conceder nuevas ventas mientras exista una deuda pendiente. Cada solicitud será evaluada de manera independiente y podrá recibir una decisión diferente según las circunstancias existentes al momento de la compra.`
    },
    {
        title: 'Artículo 2. Pagos y abonos a la deuda',
        body: `El cliente podrá realizar pagos parciales sobre su deuda en cualquier momento, siempre que Happy Corner los considere adecuados para la correcta administración del saldo pendiente. Cada pago recibido será registrado y descontado del valor total adeudado una vez sea verificado.

Happy Corner procurará aceptar cualquier abono realizado de buena fe con el propósito de reducir la deuda. No obstante, podrá rechazar pagos cuyo valor sea manifiestamente insignificante frente al saldo pendiente o que, razonablemente, no reflejen una intención real de disminuir la obligación adquirida. La determinación de si un abono resulta suficiente corresponderá exclusivamente a Happy Corner.

La aceptación de un pago parcial no extingue la deuda restante, no modifica el plazo originalmente acordado, no constituye una renegociación de la obligación ni genera el derecho automático a realizar nuevas compras a crédito o de contado mientras Happy Corner considere necesario priorizar la recuperación del saldo pendiente.

Salvo manifestación expresa de Happy Corner, ningún pago parcial implicará la condonación de intereses, obligaciones, restricciones comerciales o medidas adoptadas como consecuencia del incumplimiento del cliente. La deuda únicamente se considerará cancelada cuando Happy Corner registre el pago total del saldo pendiente.`
    },
    {
        title: 'Artículo 3. Derecho de admisión al servicio de crédito',
        body: `El servicio de compra a crédito constituye un beneficio otorgado exclusivamente por Happy Corner y no un derecho adquirido por el cliente. La posibilidad de acceder a dicho servicio dependerá de la evaluación que Happy Corner realice en cada caso y podrá variar con el tiempo según el comportamiento del cliente y las necesidades operativas del negocio.

En consecuencia, Happy Corner podrá aprobar, rechazar, suspender, limitar, modificar o cancelar el acceso al servicio de compra a crédito, de forma total o parcial, en cualquier momento y sin previo aviso, cuando lo considere conveniente para la adecuada administración del negocio.

La decisión de conceder o negar el acceso al crédito podrá fundamentarse, entre otros aspectos, en el historial de pagos del cliente, la existencia de deudas pendientes, el incumplimiento de acuerdos anteriores, el uso inadecuado del servicio de crédito, la disponibilidad operativa de Happy Corner o cualquier otro criterio comercial que resulte razonablemente pertinente. Ninguna decisión adoptada en relación con el servicio de crédito generará derecho a reclamación por parte del cliente ni constituirá obligación de mantener dicho beneficio en el futuro.`
    },
    {
        title: 'Artículo 4. HappyScore',
        body: `Con el fin de administrar de manera objetiva el servicio de compra a crédito, Happy Corner podrá asignar a cada cliente una calificación interna denominada HappyScore.

El HappyScore constituye un sistema de evaluación exclusivo de Happy Corner, con una escala comprendida entre 0 y 100 puntos. Todo cliente iniciará con una calificación base de 20 puntos, la cual podrá aumentar o disminuir de acuerdo con su comportamiento y el uso del servicio de compra a crédito.

La calificación podrá modificarse automáticamente por los sistemas de Happy Corner o manualmente por la administración cuando resulte necesario reflejar adecuadamente el comportamiento del cliente.

Entre los factores que podrán influir en el HappyScore se encuentran, entre otros:
* El cumplimiento oportuno de los pagos.
* La frecuencia y el valor de los abonos realizados.
* La antigüedad de las deudas pendientes.
* El historial general de compras a crédito.
* El incumplimiento de acuerdos de pago.
* El comportamiento del cliente frente a las obligaciones adquiridas.
* Cualquier otro criterio comercial o administrativo que Happy Corner considere razonablemente pertinente.

El HappyScore constituye una herramienta interna de gestión y evaluación de riesgo. Su valor no representa una calificación financiera oficial, una puntuación crediticia reconocida por entidades bancarias ni genera derecho alguno a la aprobación automática de futuras compras a crédito.

Happy Corner podrá utilizar el HappyScore para decidir, entre otras cosas, la aprobación o rechazo de nuevas solicitudes de crédito, el monto máximo autorizado, la exigencia de pagos anticipados, la necesidad de realizar abonos previos, el plazo concedido para el pago de una deuda o cualquier otra condición relacionada con el servicio de compra a crédito.

El cliente podrá consultar su HappyScore cuando Happy Corner habilite dicha funcionalidad. Sin perjuicio de ello, Happy Corner no estará obligado a revelar la metodología exacta utilizada para calcularlo, actualizarlo o interpretarlo, la cual podrá ser modificada en cualquier momento con el propósito de mejorar la administración del servicio.`
    },
    {
        title: 'Artículo 5. Resumen informativo',
        body: `El presente artículo tiene carácter exclusivamente informativo y busca facilitar la comprensión general de las principales condiciones del servicio de compra a crédito. En caso de existir alguna diferencia entre este resumen y los artículos anteriores, prevalecerá el contenido íntegro de dichos artículos.

En términos generales:
* Si el cliente mantiene una deuda pendiente, Happy Corner podrá decidir libremente si autoriza o no nuevas compras.
* Happy Corner podrá exigir que una parte del dinero disponible sea destinada primero al pago de la deuda antes de aprobar una nueva venta.
* Los pagos parciales ayudan a reducir el saldo pendiente, pero no garantizan la aprobación de futuras compras ni modifican automáticamente las condiciones del crédito.
* El servicio de compra a crédito constituye un beneficio otorgado por Happy Corner y podrá ser suspendido, limitado o cancelado cuando las circunstancias lo justifiquen.
* Cada cliente contará con un HappyScore, una calificación interna entre 0 y 100 puntos que podrá influir en las decisiones relacionadas con el servicio de compra a crédito.
* Las decisiones relacionadas con la aprobación de créditos, nuevos préstamos, límites de deuda, solicitudes de abonos y demás condiciones serán tomadas exclusivamente por Happy Corner con base en sus criterios comerciales y administrativos.

Si tiene alguna duda sobre el funcionamiento del servicio de compra a crédito, podrá solicitar información adicional a Happy Corner antes de aceptar el presente acuerdo.`
    }
];

// ============================================================
// PDF helpers
// ============================================================

/**
 * Word-wrap a string using real font-width measurement.
 * Returns an array of line strings.
 */
function wrapTextLines(text, font, fontSize, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
            lines.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/**
 * Draw a gradient header band on a page.
 * isFirstPage: draws logo + title. Otherwise draws a thin continuation strip.
 */
function drawPageHeader(page, { logoBuffer, pdfDoc, fontBold, fontReg, isFirstPage }) {
    const width = 595;
    const margin = 62;
    const pink = rgb(1, 0.322, 0.6);

    if (isFirstPage) {
        const numSteps = 30;
        const stepWidth = width / numSteps;
        for (let i = 0; i < numSteps; i++) {
            const t = i / (numSteps - 1);
            const r = 1.0;
            const g = 0.3215 * (1 - t) + 0.6156 * t;
            const b = 0.6 * (1 - t) + 0.3607 * t;
            page.drawRectangle({ x: i * stepWidth, y: 792, width: stepWidth + 0.5, height: 50, color: rgb(r, g, b) });
        }
        if (logoBuffer) {
            try {
                // Note: embedPng is async but we can't await in this sync helper.
                // Logo is embedded before calling this, passed as already-embedded image.
            } catch { /* skip */ }
        }
        const titleX = margin + 54;
        page.drawText('Happy Corner', { x: titleX, y: 810, size: 17, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('Contrato de Responsabilidad', { x: titleX, y: 797, size: 9, font: fontReg, color: rgb(1, 1, 1, 0.75) });
    } else {
        // Thin 20px continuation header
        const numSteps = 20;
        const stepWidth = width / numSteps;
        for (let i = 0; i < numSteps; i++) {
            const t = i / (numSteps - 1);
            const g = 0.3215 * (1 - t) + 0.6156 * t;
            const b = 0.6 * (1 - t) + 0.3607 * t;
            page.drawRectangle({ x: i * stepWidth, y: 822, width: stepWidth + 0.5, height: 20, color: rgb(1, g, b) });
        }
        page.drawText('Happy Corner — Acuerdo de Responsabilidad (continuación)', {
            x: margin, y: 826, size: 8, font: fontReg, color: rgb(1, 1, 1, 0.9)
        });
    }
}

/**
 * Draw the dark footer band on the last page.
 */
function drawPageFooter(page, { fontReg, contractVersion }) {
    const width = 595;
    const footerH = 32;
    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: rgb(0.06, 0.06, 0.06) });
    const year = new Date().getFullYear();
    const footerStr = `© ${year} Happy Corner · happycorner.top · Contrato v${contractVersion} · Generado el ${new Date().toLocaleDateString('es-CO')}`;
    const footerStrWidth = fontReg.widthOfTextAtSize(footerStr, 7.5);
    const centerFooterX = (width - footerStrWidth) / 2;
    page.drawText(footerStr, { x: centerFooterX, y: 11, size: 7.5, font: fontReg, color: rgb(0.5, 0.5, 0.5) });
}

// ============================================================
// Main PDF generator
// ============================================================
async function generarPdfContrato({ typedName, signatureImageBuffer, signedAt, ip, device, browser, location, logoBuffer, articles, contractVersion }) {
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
        console.log('Local Outfit fonts not found, attempting to fetch from CDN...');
        try {
            const resReg = await fetch('https://github.com/google/fonts/raw/main/ofl/outfit/static/Outfit-Regular.ttf');
            const resBold = await fetch('https://github.com/google/fonts/raw/main/ofl/outfit/static/Outfit-Bold.ttf');
            if (resReg.ok && resBold.ok) {
                fontReg = await pdfDoc.embedFont(await resReg.arrayBuffer());
                fontBold = await pdfDoc.embedFont(await resBold.arrayBuffer());
            } else throw new Error('CDN response not OK');
        } catch (cdnErr) {
            console.error('Failed to load Outfit fonts from CDN, falling back to Helvetica', cdnErr);
            fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
        }
    }

    // Embed logo if available (do this once before page creation)
    let logoImg = null;
    if (logoBuffer) {
        try { logoImg = await pdfDoc.embedPng(logoBuffer); } catch { /* skip */ }
    }

    const pink      = rgb(1, 0.322, 0.6);
    const darkGray  = rgb(0.1, 0.1, 0.1);
    const midGray   = rgb(0.35, 0.35, 0.35);
    const lightGray = rgb(0.88, 0.88, 0.88);
    const PAGE_WIDTH  = 595;
    const PAGE_HEIGHT = 842;
    const MARGIN = 62;
    const CONTENT_W = PAGE_WIDTH - 2 * MARGIN; // 471

    // Page-break safety: don't go below this Y before footer (footer is 32px tall, +20 padding)
    const BOTTOM_SAFE = 52;

    // ——— Page 1 setup ———
    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    // Draw gradient header
    {
        const numSteps = 30;
        const stepWidth = PAGE_WIDTH / numSteps;
        for (let i = 0; i < numSteps; i++) {
            const t = i / (numSteps - 1);
            const g = 0.3215 * (1 - t) + 0.6156 * t;
            const b = 0.6 * (1 - t) + 0.3607 * t;
            page.drawRectangle({ x: i * stepWidth, y: 792, width: stepWidth + 0.5, height: 50, color: rgb(1, g, b) });
        }
        if (logoImg) page.drawImage(logoImg, { x: MARGIN, y: 795, width: 44, height: 44 });
        const titleX = logoImg ? MARGIN + 54 : MARGIN;
        page.drawText('Happy Corner', { x: titleX, y: 810, size: 17, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('Contrato de Responsabilidad', { x: titleX, y: 797, size: 9, font: fontReg, color: rgb(1, 1, 1, 0.75) });
    }

    let y = 752;

    // ——— Document Title ———
    const titleText = 'ACUERDO DE RESPONSABILIDAD DE DEUDA';
    const titleWidth = fontBold.widthOfTextAtSize(titleText, 13);
    page.drawText(titleText, { x: (PAGE_WIDTH - titleWidth) / 2, y, size: 13, font: fontBold, color: pink });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.5, color: pink });
    y -= 20;

    // ——— Helper: add a new page and reset y ———
    const addContinuationPage = () => {
        const np = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        // Thin gradient header strip on continuation pages
        const numSteps = 20;
        const stepWidth = PAGE_WIDTH / numSteps;
        for (let i = 0; i < numSteps; i++) {
            const t = i / (numSteps - 1);
            const g = 0.3215 * (1 - t) + 0.6156 * t;
            const b = 0.6 * (1 - t) + 0.3607 * t;
            np.drawRectangle({ x: i * stepWidth, y: 822, width: stepWidth + 0.5, height: 20, color: rgb(1, g, b) });
        }
        np.drawText('Happy Corner — Acuerdo de Responsabilidad (continuación)', {
            x: MARGIN, y: 826, size: 7.5, font: fontReg, color: rgb(1, 1, 1, 0.9)
        });
        return np;
    };

    // ——— Helper: check if we need a new page; returns updated { page, y } ———
    const ensureSpace = (neededHeight) => {
        if (y - neededHeight < BOTTOM_SAFE) {
            page = addContinuationPage();
            y = 800;
        }
    };

    // ——— Draw article body line by line ———
    const drawBodyLine = (text, indentX, fontSize = 9) => {
        ensureSpace(14);
        page.drawText(text, { x: indentX, y, size: fontSize, font: fontReg, color: midGray });
        y -= 13;
    };

    // ——— Articles ———
    for (const article of articles) {
        ensureSpace(40); // guarantee title + at least 1 line

        // Article title
        page.drawText(article.title.toUpperCase(), { x: MARGIN, y, size: 9.5, font: fontBold, color: darkGray });
        y -= 15;

        // Process body: split by newline, detect bullets and paragraphs
        const rawLines = (article.body || '').split('\n');
        let paraBuffer = '';

        const flushPara = () => {
            if (!paraBuffer.trim()) { paraBuffer = ''; return; }
            const wrapped = wrapTextLines(paraBuffer.trim(), fontReg, 9, CONTENT_W - 12);
            for (const line of wrapped) drawBodyLine(line, MARGIN + 12);
            y -= 4; // paragraph spacing
            paraBuffer = '';
        };

        for (const raw of rawLines) {
            const trimmed = raw.trim();
            if (!trimmed) {
                flushPara();
                continue;
            }
            if (trimmed.startsWith('*')) {
                flushPara();
                // Bullet item
                const bulletText = trimmed.slice(1).trim();
                const bulletWrapped = wrapTextLines(bulletText, fontReg, 9, CONTENT_W - 30);
                for (let i = 0; i < bulletWrapped.length; i++) {
                    ensureSpace(14);
                    if (i === 0) {
                        page.drawText('•', { x: MARGIN + 12, y, size: 9, font: fontBold, color: pink });
                    }
                    page.drawText(bulletWrapped[i], { x: MARGIN + 24, y, size: 9, font: fontReg, color: midGray });
                    y -= 13;
                }
            } else {
                paraBuffer += (paraBuffer ? ' ' : '') + trimmed;
            }
        }
        flushPara();
        y -= 12; // space between articles
    }

    // ——— Disclaimer note ———
    ensureSpace(30);
    y -= 6;
    const disclaimerLines = wrapTextLines(
        'Este acuerdo regula las condiciones bajo las cuales Happy Corner concede compras a crédito y será aceptado por el cliente mediante su firma electrónica antes de utilizar dicho beneficio.',
        fontReg, 8, CONTENT_W
    );
    for (const dl of disclaimerLines) {
        ensureSpace(12);
        page.drawText(dl, { x: MARGIN, y, size: 8, font: fontReg, color: lightGray });
        y -= 11;
    }
    y -= 16;

    // ——— Signature Data Table — needs ~140px, ensure space ———
    ensureSpace(160);
    page.drawText('DATOS DE LA FIRMA', { x: MARGIN, y, size: 11, font: fontBold, color: pink });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: pink });
    y -= 18;

    const tableData = [
        ['Firmado por',     typedName],
        ['Fecha y hora',    new Date(signedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) + ' (COT)'],
        ['Dirección IP',    ip],
        ['Dispositivo',     device],
        ['Navegador',       browser],
        ['Ubicación aprox.', location],
    ];

    const col1 = MARGIN;
    const col2 = MARGIN + 130;
    const rowH  = 18;
    let rowY = y;

    tableData.forEach(([label, value], i) => {
        const bg = i % 2 === 0 ? rgb(0.97, 0.97, 0.97) : rgb(1, 1, 1);
        page.drawRectangle({ x: col1 - 4, y: rowY - 4, width: PAGE_WIDTH - MARGIN * 2 + 8, height: rowH, color: bg });
        page.drawText(label, { x: col1, y: rowY + 3, size: 9, font: fontBold, color: darkGray });
        page.drawText(String(value).slice(0, 68), { x: col2, y: rowY + 3, size: 9, font: fontReg, color: midGray });
        rowY -= rowH;
    });

    y = rowY - 26;

    // ——— Signature image — needs ~130px ———
    ensureSpace(130);
    page.drawText('FIRMA DEL CLIENTE', { x: MARGIN, y, size: 11, font: fontBold, color: pink });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: pink });
    y -= 95;

    page.drawRectangle({ x: MARGIN - 2, y, width: 206, height: 84, borderColor: lightGray, borderWidth: 1 });
    const pngImage = await pdfDoc.embedPng(signatureImageBuffer);
    page.drawImage(pngImage, { x: MARGIN, y: y + 2, width: 200, height: 80 });
    y -= 20;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 200, y }, thickness: 0.5, color: lightGray });
    page.drawText(typedName, { x: MARGIN, y: y - 12, size: 9, font: fontReg, color: midGray });

    // ——— Footer band (on last page only) ———
    drawPageFooter(page, { fontReg, contractVersion: contractVersion || FALLBACK_VERSION });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

// ============================================================
// Helper: load contract text from Firestore (with fallback)
// ============================================================
async function loadContractFromFirestore() {
    try {
        const snap = await db.collection('config').doc('contractText').get();
        if (snap.exists) {
            const data = snap.data();
            if (Array.isArray(data.articles) && data.articles.length > 0) {
                return { articles: data.articles, version: data.version || FALLBACK_VERSION };
            }
        }
    } catch (err) {
        console.error('Failed to load contract from Firestore, using fallback:', err.message);
    }
    return { articles: FALLBACK_ARTICLES, version: FALLBACK_VERSION };
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
        // ACCION: getContractText — devuelve el texto del contrato actual
        // Requiere usuario autenticado (cualquier rol)
        // ============================================================
        if (action === 'getContractText') {
            const token = (req.headers.authorization || '').replace('Bearer ', '');
            if (!token) return json(res, 401, { error: 'No autenticado.' });
            try { await auth.verifyIdToken(token); } catch { return json(res, 401, { error: 'Token inválido.' }); }

            const { articles, version } = await loadContractFromFirestore();
            return json(res, 200, { articles, version });
        }

        // ============================================================
        // ACCION: sendPin
        // ============================================================
        if (action === 'sendPin') {
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

            await pinRef.set({ hashedPin, expiresAt, attempts: 0, createdAt: new Date().toISOString() });

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
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff8c42);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="Happy Corner" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:900;color:#fff;">Happy Corner</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px;">Verificación de Identidad</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 12px;">Hola 👋</p>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 24px;">Has solicitado firmar tu <strong style="color:#fff;">contrato de responsabilidad</strong> en Happy Corner. Usa el siguiente PIN para continuar:</p>
            <div style="background:#0d0d0d;border:2px solid rgba(255,82,153,0.4);border-radius:16px;padding:24px;text-align:center;margin:0 0 24px;">
              <div style="font-family:'Outfit',Arial,monospace;font-size:40px;font-weight:900;color:#ff5299;letter-spacing:10px;">${pin}</div>
              <div style="font-family:'Outfit',Arial,sans-serif;color:#666;font-size:12px;margin-top:8px;">Válido por 10 minutos · No lo compartas</div>
            </div>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#555;font-size:12px;margin:0;">Si no solicitaste este PIN, ignora este correo. Nadie de Happy Corner te pedirá este código.</p>
          </td>
        </tr>
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
                console.error('Resend error:', emailResult.error);
                return json(res, 500, { error: 'Error enviando el correo.' });
            }

            return json(res, 200, { success: true });
        }

        // ============================================================
        // ACCION: sign (firma del cliente vía PIN)
        // ============================================================
        if (action === 'sign') {
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

            const ip       = getClientIp(req);
            const { device, browser } = parseUserAgent(userAgent);
            const location = await getLocationFromIp(ip);
            const timestamp = now.toISOString();

            if (!s3Client) return json(res, 500, { error: 'R2 Storage no esta configurado.' });

            // Load current contract version from Firestore
            const { articles, version: contractVersion } = await loadContractFromFirestore();

            // Upload signature to R2
            const signatureFileName = `signatures/${uid}/contract_v${contractVersion}.png`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName, Key: signatureFileName,
                Body: imageBuffer, ContentType: `image/${match[1]}`
            }));

            // Fetch logo
            let logoBuffer = null;
            try {
                const logoRes = await fetch('https://happycorner.top/happylogo.png');
                if (logoRes.ok) logoBuffer = Buffer.from(await logoRes.arrayBuffer());
            } catch (err) { console.error('Logo fetch failed:', err.message); }

            const pdfBuffer = await generarPdfContrato({
                typedName, signatureImageBuffer: imageBuffer,
                signedAt: timestamp, ip, device, browser, location,
                logoBuffer, articles, contractVersion
            });

            const pdfFileName = `contracts/${uid}/contract_v${contractVersion}.pdf`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName, Key: pdfFileName,
                Body: pdfBuffer, ContentType: 'application/pdf'
            }));
            const pdfUrl = `${publicUrl}/${pdfFileName}`;

            // Save to Firestore
            await db.collection('debtContracts').doc(uid).set({
                uid, customerUID: uid, signed: true, typedName,
                signatureUrl: `${publicUrl}/${signatureFileName}`,
                pdfUrl, version: `v${contractVersion}`,
                signedAt: timestamp, ip, device, browser, location,
                userAgent: userAgent || 'unknown',
                screenWidth: req.body.screenWidth || null,
                screenHeight: req.body.screenHeight || null,
                language: req.body.language || null
            });

            // Update user doc — clear resign flags and record new version signed
            await db.collection('users').doc(uid).update({
                contractSigned: true,
                contractVersionSigned: contractVersion,
                contractNeedsResign: false,
                contractResignDeadline: null,
                contractSignedAt: timestamp
            });

            // Email PDF to admin and client
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
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff8c42);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:900;color:#fff;">Contrato Firmado ✅</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">Happy Corner · Acuerdo de Responsabilidad v${contractVersion}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 20px;">El siguiente contrato ha sido firmado exitosamente:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#222;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;width:40%;">Firmado por</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#fff;">${typedName}</td></tr>
              <tr style="background:#1a1a1a;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Fecha</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${new Date(timestamp).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td></tr>
              <tr style="background:#222;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">IP</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${ip}</td></tr>
              <tr style="background:#1a1a1a;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Dispositivo</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${device} · ${browser}</td></tr>
              <tr style="background:#222;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Ubicación</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${location}</td></tr>
            </table>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#777;font-size:13px;margin:0;">El PDF firmado se adjunta a este correo para tus registros.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
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
        // ACCION: adminSign (firma en persona, sin PIN)
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

            const callerSnap = await db.collection('users').doc(decoded.uid).get();
            const callerData = callerSnap.data() || {};

            if (callerData.role !== 'admin') {
                return json(res, 403, { error: 'Acción permitida solo para administradores.' });
            }

            const { uid, typedName, signatureImage, userAgent, screenWidth, screenHeight, language } = req.body;
            if (!uid || !typedName || !signatureImage) {
                return json(res, 400, { error: 'Faltan campos requeridos para firmar el contrato.' });
            }

            const match = signatureImage.match(/^data:image\/(png|jpeg);base64,(.+)$/);
            if (!match) return json(res, 400, { error: 'Formato de imagen de firma no valido.' });
            const imageBuffer = Buffer.from(match[2], 'base64');

            const ip       = getClientIp(req);
            const { device, browser } = parseUserAgent(userAgent);
            const location = await getLocationFromIp(ip);
            const timestamp = new Date().toISOString();

            if (!s3Client) return json(res, 500, { error: 'R2 Storage no esta configurado.' });

            // Load current contract version from Firestore
            const { articles, version: contractVersion } = await loadContractFromFirestore();

            // Upload signature to R2
            const signatureFileName = `signatures/${uid}/contract_v${contractVersion}.png`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName, Key: signatureFileName,
                Body: imageBuffer, ContentType: `image/${match[1]}`
            }));

            // Fetch logo
            let logoBuffer = null;
            try {
                const logoRes = await fetch('https://happycorner.top/happylogo.png');
                if (logoRes.ok) logoBuffer = Buffer.from(await logoRes.arrayBuffer());
            } catch (err) { console.error('Logo fetch failed:', err.message); }

            const pdfBuffer = await generarPdfContrato({
                typedName, signatureImageBuffer: imageBuffer,
                signedAt: timestamp, ip, device, browser, location,
                logoBuffer, articles, contractVersion
            });

            const pdfFileName = `contracts/${uid}/contract_v${contractVersion}.pdf`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName, Key: pdfFileName,
                Body: pdfBuffer, ContentType: 'application/pdf'
            }));
            const pdfUrl = `${publicUrl}/${pdfFileName}`;

            // Save to Firestore
            await db.collection('debtContracts').doc(uid).set({
                uid, customerUID: uid, signed: true, typedName,
                signatureUrl: `${publicUrl}/${signatureFileName}`,
                pdfUrl, version: `v${contractVersion}`,
                signedAt: timestamp, ip, device, browser, location,
                userAgent: userAgent || 'unknown',
                screenWidth: screenWidth || null,
                screenHeight: screenHeight || null,
                language: language || null,
                signedInPerson: true,
                witnessedByAdmin: decoded.uid
            });

            // Update user doc — clear resign flags and record version signed
            await db.collection('users').doc(uid).update({
                contractSigned: true,
                contractVersionSigned: contractVersion,
                contractNeedsResign: false,
                contractResignDeadline: null,
                contractSignedAt: timestamp
            });

            // Email PDF to admin and client
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
        <tr>
          <td style="background:linear-gradient(135deg,#b01e5a,#ff5299,#ff8c42);padding:28px 32px;text-align:center;">
            <img src="https://happycorner.top/happyfavicon.png" width="48" height="48" alt="" style="border-radius:10px;display:block;margin:0 auto 10px;">
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:900;color:#fff;">Contrato Firmado en Persona ✅</div>
            <div style="font-family:'Outfit',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">Happy Corner · Testigo: ${callerData.displayName || callerData.name || 'Administrador'}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-family:'Outfit',Arial,sans-serif;color:#ccc;font-size:15px;margin:0 0 20px;">El siguiente contrato ha sido firmado exitosamente en persona con presencia del administrador:</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
              <tr style="background:#222;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;width:40%;">Firmado por</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#fff;">${typedName}</td></tr>
              <tr style="background:#1a1a1a;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Fecha</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${new Date(timestamp).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td></tr>
              <tr style="background:#222;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">IP del Servidor</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${ip}</td></tr>
              <tr style="background:#1a1a1a;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Dispositivo Admin</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${device} · ${browser}</td></tr>
              <tr style="background:#222;"><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;color:#888;">Ubicación de Firma</td><td style="padding:10px 14px;font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#eee;">${location}</td></tr>
            </table>
            <p style="font-family:'Outfit',Arial,sans-serif;color:#777;font-size:13px;margin:0;">El PDF firmado se adjunta a este correo para tus registros.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
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
        console.error('Error in contract API:', error);
        return json(res, 500, { error: 'Ha ocurrido un error interno. Por favor intenta de nuevo.' });
    }
}