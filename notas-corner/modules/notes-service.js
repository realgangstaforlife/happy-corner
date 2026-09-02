import { db } from './auth.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    deleteDoc,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { encryptData, decryptData, deriveEncryptionKey } from './encryption.js';

/**
 * Generates a UUID v4
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export const NotesService = {
    /**
     * Obtiene todas las asignaturas académicas (desencriptadas) de un usuario
     */
    async getAcademics(userId) {
        try {
            const q = query(
                collection(db, 'academics'), 
                where('userId', '==', userId)
            );
            const snapshot = await getDocs(q);
            
            const encryptionKey = deriveEncryptionKey(userId);
            
            const academics = snapshot.docs.map(doc => {
                const data = doc.data();
                if (!data.encryptedPayload) return null; // Saltar si está mal formateado
                
                const decryptedData = decryptData(data.encryptedPayload, encryptionKey);
                
                if (!decryptedData) return null; // Corrupción o clave incorrecta
                
                return {
                    id: doc.id,
                    ...decryptedData,
                    period: data.period, // metadata no encriptada
                    shared: data.shared || false,
                    publicId: data.publicId || null,
                    createdAt: data.createdAt,
                    lastModified: data.lastModified
                };
            }).filter(item => item !== null);
            
            // Ordenar por lastModified descendente localmente (porque no se puede ordenar por campo encriptado)
            return academics.sort((a, b) => b.lastModified - a.lastModified);
        } catch (error) {
            console.error("Error fetching academics:", error);
            return []; // Retorna vacío si falla
        }
    },
    
    /**
     * Crea un registro académico (asignatura)
     */
    async createAcademic(userId, academicData) {
        try {
            const sensitiveData = {
                name: academicData.name,
                emoji: academicData.emoji,
                teacher: academicData.teacher,
                performances: academicData.performances, // { cognitive: {...}, procedural: {...}, attitudinal: {...} }
                averages: academicData.averages
            };
            
            const encryptionKey = deriveEncryptionKey(userId);
            const encryptedPayload = encryptData(sensitiveData, encryptionKey);
            
            const docRef = doc(collection(db, 'academics'));
            const now = Date.now();
            
            await setDoc(docRef, {
                userId: userId,
                period: academicData.period,
                encryptedPayload: encryptedPayload,
                shared: false,
                publicId: null,
                createdAt: now,
                lastModified: now
            });
            
            return {
                id: docRef.id,
                ...sensitiveData,
                period: academicData.period,
                shared: false,
                createdAt: now,
                lastModified: now
            };
        } catch (error) {
            console.error("Error creating academic:", error);
            throw error;
        }
    },
    
    /**
     * Actualiza una asignatura existente (cifrando el nuevo payload)
     */
    async updateAcademic(userId, docId, updates, currentData) {
        try {
            // Unimos la info sensible existente con las actualizaciones
            const mergedSensitiveData = {
                name: updates.name !== undefined ? updates.name : currentData.name,
                emoji: updates.emoji !== undefined ? updates.emoji : currentData.emoji,
                teacher: updates.teacher !== undefined ? updates.teacher : currentData.teacher,
                performances: updates.performances !== undefined ? updates.performances : currentData.performances,
                averages: updates.averages !== undefined ? updates.averages : currentData.averages
            };
            
            const encryptionKey = deriveEncryptionKey(userId);
            const encryptedPayload = encryptData(mergedSensitiveData, encryptionKey);
            
            const now = Date.now();
            const updatePayload = {
                encryptedPayload: encryptedPayload,
                lastModified: now
            };
            
            // Si el periodo se actualiza, es metadata pública
            if (updates.period !== undefined) {
                updatePayload.period = updates.period;
            }
            
            await updateDoc(doc(db, 'academics', docId), updatePayload);
            
            return {
                ...currentData,
                ...mergedSensitiveData,
                period: updates.period !== undefined ? updates.period : currentData.period,
                lastModified: now
            };
        } catch (error) {
            console.error("Error updating academic:", error);
            throw error;
        }
    },
    
    /**
     * Elimina una asignatura
     */
    async deleteAcademic(docId, publicId = null) {
        try {
            await deleteDoc(doc(db, 'academics', docId));
            if (publicId) {
                await deleteDoc(doc(db, 'sharedLinks', publicId));
            }
            return true;
        } catch (error) {
            console.error("Error deleting academic:", error);
            throw error;
        }
    },
    
    /**
     * Genera un enlace público
     * OJO: Al generar un link público, debemos hacer una "foto" desencriptada 
     * en sharedLinks (sin nombres de profesor ni datos extra sensibles) para que el visitante pueda ver.
     */
    async generateShareLink(docId, userId, publicTranscriptData) {
        try {
            const publicId = generateUUID();
            const shareRef = doc(db, 'sharedLinks', publicId);
            
            // Guardamos el snapshot público (sin encriptar) de las calificaciones finales
            await setDoc(shareRef, {
                ownerId: userId,
                academicId: docId,
                publicData: publicTranscriptData,
                createdAt: Date.now()
            });
            
            // Marcar la asignatura como compartida
            await updateDoc(doc(db, 'academics', docId), { 
                shared: true, 
                publicId: publicId 
            });
            
            return publicId;
        } catch (error) {
            console.error("Error generating share link:", error);
            throw error;
        }
    },
    
    /**
     * Obtiene una transcripción pública sin autenticación
     */
    async getSharedTranscript(publicId) {
        try {
            const shareDoc = await getDoc(doc(db, 'sharedLinks', publicId));
            if (!shareDoc.exists()) return null;
            
            return shareDoc.data().publicData;
        } catch (error) {
            console.error("Error fetching shared transcript:", error);
            throw error;
        }
    }
};
