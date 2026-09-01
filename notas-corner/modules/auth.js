import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    setPersistence, 
    browserLocalPersistence,
    updateProfile,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Mutable references — filled once initPromise resolves
export let auth = null;
export let db = null;
export let provider = null;

async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) throw new Error('Empty response');
    return JSON.parse(text);
}

// ⚠️ URL absoluta — la API vive en happycorner.top sin importar desde qué subdominio se sirva esta página
const CONFIG_URL = window.location.hostname.includes('localhost')
    ? '/api/getConfig'
    : 'https://happycorner.top/api/getConfig';

export const initPromise = (async () => {
    const res = await fetch(CONFIG_URL);

    if (!res.ok) throw new Error('No se pudo obtener la configuración de Firebase');
    const config = await parseJsonResponse(res);
    if (!config.apiKey) throw new Error('API Key no definida');

    const app = initializeApp(config);
    auth = getAuth(app);
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
    provider = new GoogleAuthProvider();
    await setPersistence(auth, browserLocalPersistence);
    return { auth, db, provider };
})();

// Re-export Firebase Auth functions for convenience
export {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendPasswordResetEmail
};
