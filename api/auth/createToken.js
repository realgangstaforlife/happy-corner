import { auth } from '../_lib/firebaseAdmin.js';

export default async function handler(req, res) {
    // CORS configuration for the auth subdomain
    res.setHeader('Access-Control-Allow-Origin', 'https://auth.happycorner.top');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { uid } = req.body;

        if (!uid) {
            return res.status(400).json({ error: 'UID required' });
        }

        // Generate Custom Token using Firebase Admin SDK
        const customToken = await auth.createCustomToken(uid);

        return res.status(200).json({
            token: customToken,
            expires_in: 3600
        });
    } catch (error) {
        console.error('Token creation error:', error);
        return res.status(500).json({ 
            error: 'No se pudo crear el token de autenticación' 
        });
    }
}
