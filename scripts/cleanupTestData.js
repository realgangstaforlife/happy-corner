/**
 * Happy Corner - Script de limpieza UNICA
 * ------------------------------------------
 * Borra TODOS los documentos de las colecciones 'orders' y 'movements'.
 * NO toca 'users', 'debtContracts', 'creditScores', 'config', ni nada mas.
 *
 * Como correrlo:
 * 1. Asegurate de tener las credenciales de Firebase Admin configuradas
 *    igual que en api/_lib/firebaseAdmin.js (mismas variables de entorno,
 *    o copia ese archivo de inicializacion aqui).
 * 2. node scripts/cleanupTestData.js
 * 3. Confirma cuando te pregunte (escribe "si" y Enter).
 *
 * ADVERTENCIA: esto es irreversible. Correr solo una vez, con cuidado.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import readline from 'readline';

// --- Misma inicializacion que ya usa el proyecto en _lib/firebaseAdmin.js ---
const app = initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
});
const db = getFirestore(app);

async function deleteCollection(collectionName) {
    const snap = await db.collection(collectionName).get();
    if (snap.empty) {
        console.log(`  '${collectionName}' ya esta vacia, nada que borrar.`);
        return 0;
    }
    const batchSize = 400; // limite seguro de Firestore por batch (max 500)
    let deleted = 0;
    let docs = snap.docs;
    while (docs.length > 0) {
        const chunk = docs.splice(0, batchSize);
        const batch = db.batch();
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += chunk.length;
        console.log(`  Borrados ${deleted}/${snap.size} de '${collectionName}'...`);
    }
    return deleted;
}

async function main() {
    console.log('=== Happy Corner - Limpieza de datos de prueba ===');
    console.log('Esto va a BORRAR PERMANENTEMENTE todos los documentos de:');
    console.log('  - orders');
    console.log('  - movements');
    console.log('NO se tocan: users, debtContracts, creditScores, config.\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
        rl.question('¿Confirmas que quieres continuar? (escribe "si"): ', resolve);
    });
    rl.close();

    if (answer.trim().toLowerCase() !== 'si') {
        console.log('Cancelado, no se borro nada.');
        process.exit(0);
    }

    console.log('\nBorrando orders...');
    const ordersDeleted = await deleteCollection('orders');

    console.log('\nBorrando movements...');
    const movementsDeleted = await deleteCollection('movements');

    console.log(`\n✅ Listo. Se borraron ${ordersDeleted} pedidos y ${movementsDeleted} movimientos.`);
    console.log('Recorda revisar manualmente si algun usuario quedo con activeDebt o happyPoints');
    console.log('desactualizados (ya que sus movimientos que los generaban ya no existen).');
    process.exit(0);
}

main().catch(err => {
    console.error('Error durante la limpieza:', err);
    process.exit(1);
});