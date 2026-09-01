export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. Si el proyecto tiene las variables de entorno configuradas directamente
    if (process.env.FIREBASE_API_KEY) {
        return res.status(200).json({
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID,
            siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://happycorner.top'
        });
    }

    // 2. Si no, hace proxy server-to-server hacia happycorner.top (sin problemas de CORS en navegador)
    try {
        const upstream = await fetch('https://happycorner.top/api/getConfig');
        if (!upstream.ok) throw new Error('upstream status ' + upstream.status);
        const config = await upstream.json();
        return res.status(200).json(config);
    } catch (err) {
        console.error('getConfig proxy error:', err);
        return res.status(502).json({ error: 'No se pudo obtener la configuración de Firebase' });
    }
}
