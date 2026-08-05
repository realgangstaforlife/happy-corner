import { s3Client, bucketName, publicUrl } from './_lib/r2Client.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { applyCors, json } from './_lib/http.js';
import { db, auth } from './_lib/firebaseAdmin.js';

export default async function handler(req, res) {
    if (applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) return;

    if (req.method !== 'POST') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    try {
        const idToken = (req.headers.authorization || '').replace('Bearer ', '');
        if (!idToken) return json(res, 401, { error: 'No autenticado.' });

        let decoded;
        try {
            decoded = await auth.verifyIdToken(idToken);
        } catch {
            return json(res, 401, { error: 'Token inválido.' });
        }

        // Verify admin privilege
        const callerSnap = await db.collection('users').doc(decoded.uid).get();
        if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
            return json(res, 403, { error: 'Acción permitida solo para administradores.' });
        }

        const { productId, imageData } = req.body;
        if (!productId || !imageData) {
            return json(res, 400, { error: 'Missing productId or imageData' });
        }

        const match = imageData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
        if (!match) return json(res, 400, { error: 'Invalid image format.' });
        
        const imageBuffer = Buffer.from(match[2], 'base64');
        if (imageBuffer.length > 5 * 1024 * 1024) {
            return json(res, 400, { error: 'Image size exceeds 5MB limit.' });
        }

        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const fileName = `products/${productId}.${ext}`;
        
        if (!s3Client) {
            return json(res, 500, { error: 'R2 Storage not configured.' });
        }

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: fileName,
            Body: imageBuffer,
            ContentType: `image/${match[1]}`
        });
        await s3Client.send(command);

        const productImageUrl = `${publicUrl}/${fileName}`;
        return json(res, 200, { success: true, url: productImageUrl });

    } catch (error) {
        console.error("Error uploading product image to R2:", error);
        return json(res, 500, { error: 'Internal Server Error' });
    }
}
