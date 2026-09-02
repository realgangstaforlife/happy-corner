/**
 * Módulo de Encriptación AES-256 (Client-Side)
 * Asegura que los datos viajen encriptados a Firestore y solo sean legibles localmente.
 * Utiliza CryptoJS a través del CDN (window.CryptoJS).
 */

/**
 * Derivar clave de encriptación única por usuario.
 * La clave SOLO existe en el navegador del usuario y es determinística.
 * @param {string} userUID - El UID de Firebase del usuario.
 * @returns {string} - La clave derivada.
 */
export function deriveEncryptionKey(userUID) {
    if (!window.CryptoJS) throw new Error("CryptoJS no está cargado");
    const key = CryptoJS.SHA256(userUID).toString();
    return key;
}

/**
 * Encriptar datos sensibles con AES-256.
 * @param {Object} plainData - El objeto JavaScript a encriptar.
 * @param {string} encryptionKey - La clave derivada.
 * @returns {string} - El string encriptado en Base64.
 */
export function encryptData(plainData, encryptionKey) {
    if (!window.CryptoJS) throw new Error("CryptoJS no está cargado");
    const jsonString = JSON.stringify(plainData);
    const encrypted = CryptoJS.AES.encrypt(jsonString, encryptionKey).toString();
    return encrypted;
}

/**
 * Desencriptar datos con AES-256 (solo en cliente).
 * @param {string} encryptedData - El string encriptado.
 * @param {string} encryptionKey - La clave derivada.
 * @returns {Object|null} - El objeto desencriptado o null si falla.
 */
export function decryptData(encryptedData, encryptionKey) {
    if (!window.CryptoJS) throw new Error("CryptoJS no está cargado");
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
        const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
        if (!jsonString) return null;
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("Error desencriptando datos:", e);
        return null;
    }
}
