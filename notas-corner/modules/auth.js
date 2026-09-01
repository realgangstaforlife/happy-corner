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
    browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, initializeFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let app, auth, db, provider;

// Helper to safely parse JSON
async function parseJsonResponse(response) {
    try {
        const text = await response.text();
        if (!text) throw new Error('Empty response from server');
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`Invalid server response: ${e.message}`);
    }
}

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
        
        return { app, auth, db, provider };
    })
    .catch(err => {
        console.error("Firebase init error:", err);
        throw err;
    });

export { 
    initPromise, 
    auth, 
    db, 
    provider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signOut,
    onAuthStateChanged
};
