// Global error listeners for Safari debugging
window.addEventListener('error', (event) => {
    console.error('Global error caught:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        stack: event.error?.stack
    });
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, initializeFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let app, auth, db, provider;

/**
 * Safe JSON response parser that handles Safari DOMException 12
 * @param {Response} response - Fetch API Response object
 * @returns {Promise<Object>} Parsed JSON or throws error
 */
export async function parseJsonResponse(response) {
    try {
        const text = await response.text();
        if (!text) {
            throw new Error('Empty response from server');
        }
        return JSON.parse(text);
    } catch (e) {
        console.error('parseJsonResponse failed:', {
            status: response.status,
            statusText: response.statusText,
            error: e.message
        });
        throw new Error(`Invalid server response: ${e.message}`);
    }
}

// Promesa global de inicialización
const initPromise = fetch('/api/getConfig')
    .then(async res => {
        if (!res.ok) throw new Error("No se pudo obtener la configuración de Firebase");
        return parseJsonResponse(res);
    })
    .then(async (config) => {
        if (!config.apiKey) throw new Error("API Key no definida en variables de entorno");
        
        app = initializeApp(config);
        auth = getAuth(app);
        db = initializeFirestore(app, { experimentalForceLongPolling: true });
        provider = new GoogleAuthProvider();
        
        // Configurar persistencia local explícitamente
        await setPersistence(auth, browserLocalPersistence);
    });

// --- 🛡️ SISTEMA DE SEGURIDAD GLOBAL ---
if (window.location.pathname !== '/banned' && window.location.pathname !== '/catalogo') {
    (async function runSecurityCheck() {
        if (localStorage.getItem('hc_blacklist') || document.cookie.includes('hc_banned')) {
            window.location.href = '/banned';
            return;
        }
        try {
            const res = await fetch('/api/account?action=checkBan');
            const data = await res.json();
            if (data.banned) {
                localStorage.setItem('hc_blacklist', 'true');
                window.location.href = '/banned?reason=' + encodeURIComponent(data.reason);
            }
        } catch (e) {
            console.error("Error validando seguridad.");
        }
    })();
}

export { initPromise, auth, db, provider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot };

