import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase config (should match Happy Corner's main config)
const firebaseConfig = {
    // Note: The main app uses a config. You should inject your config here.
    // Assuming it's already initialized globally or we fetch it.
    // For now, this is a placeholder. In the real app, it will use the existing config.
};

// Initialize Firebase (Only if not already initialized)
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.warn("Firebase config not fully set in auth.js. Ensure you replace the config.");
}

// --- ENCRYPTION LOGIC (Web Crypto API) ---
const ENCRYPTION_SALT = "HappyNotasSecretSalt2026!";

async function deriveKey(uid) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(uid + ENCRYPTION_SALT),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );
    
    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(ENCRYPTION_SALT),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encryptData(dataStr, uid) {
    const key = await deriveKey(uid);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const cipher = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(dataStr)
    );
    
    // Combine IV and Ciphertext to save in Firestore
    const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
    const cipherHex = Array.from(new Uint8Array(cipher)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${ivHex}:${cipherHex}`;
}

async function decryptData(encryptedStr, uid) {
    const key = await deriveKey(uid);
    const [ivHex, cipherHex] = encryptedStr.split(':');
    
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const cipher = new Uint8Array(cipherHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const dec = new TextDecoder();
    const plainBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        cipher
    );
    return dec.decode(plainBuffer);
}

// --- CLOUD SYNC LOGIC ---
export async function syncToCloud(dataObj) {
    if (!auth || !auth.currentUser) return;
    try {
        const uid = auth.currentUser.uid;
        const dataStr = JSON.stringify(dataObj);
        const encrypted = await encryptData(dataStr, uid);
        
        await setDoc(doc(db, "grades", uid), {
            data: encrypted,
            updatedAt: new Date().toISOString()
        });
        console.log("Cloud sync successful.");
    } catch (error) {
        console.error("Error syncing to cloud:", error);
    }
}

export async function fetchFromCloud() {
    if (!auth || !auth.currentUser) return null;
    try {
        const uid = auth.currentUser.uid;
        const docSnap = await getDoc(doc(db, "grades", uid));
        
        if (docSnap.exists()) {
            const encrypted = docSnap.data().data;
            const decryptedStr = await decryptData(encrypted, uid);
            return JSON.parse(decryptedStr);
        }
        return null;
    } catch (error) {
        console.error("Error fetching from cloud:", error);
        return null;
    }
}

// Login trigger
window.loginWithGoogle = () => {
    if(auth) signInWithPopup(auth, new GoogleAuthProvider());
};
