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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
     * Obtiene todas las notas de un usuario
     */
    async getUserNotes(userId) {
        try {
            const q = query(
                collection(db, 'notes'), 
                where('userId', '==', userId),
                orderBy('updatedAt', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching notes:", error);
            throw error;
        }
    },
    
    /**
     * Obtiene una sola nota por su ID
     */
    async getNote(noteId) {
        try {
            const docRef = doc(db, 'notes', noteId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            }
            return null;
        } catch (error) {
            console.error("Error fetching note:", error);
            throw error;
        }
    },
    
    /**
     * Crea una nueva nota
     */
    async createNote(userId, title, content, tags = []) {
        try {
            const noteRef = doc(collection(db, 'notes'));
            const newNote = {
                userId,
                title,
                content,
                isShared: false,
                publicId: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                tags
            };
            await setDoc(noteRef, newNote);
            return { id: noteRef.id, ...newNote };
        } catch (error) {
            console.error("Error creating note:", error);
            throw error;
        }
    },
    
    /**
     * Actualiza una nota existente
     */
    async updateNote(noteId, data) {
        try {
            const noteRef = doc(db, 'notes', noteId);
            const updateData = {
                ...data,
                updatedAt: Date.now()
            };
            await setDoc(noteRef, updateData, { merge: true });
            return updateData;
        } catch (error) {
            console.error("Error updating note:", error);
            throw error;
        }
    },
    
    /**
     * Elimina una nota
     */
    async deleteNote(noteId, publicId = null) {
        try {
            await deleteDoc(doc(db, 'notes', noteId));
            if (publicId) {
                // Eliminar el link compartido si existe
                await deleteDoc(doc(db, 'sharedLinks', publicId));
            }
            return true;
        } catch (error) {
            console.error("Error deleting note:", error);
            throw error;
        }
    },
    
    /**
     * Genera un enlace público para compartir
     */
    async generateShareLink(noteId, userId) {
        try {
            const publicId = generateUUID();
            const shareRef = doc(db, 'sharedLinks', publicId);
            
            await setDoc(shareRef, {
                noteId,
                ownerId: userId,
                createdAt: Date.now()
            });
            
            // Actualizar la nota con su publicId
            await this.updateNote(noteId, { 
                isShared: true, 
                publicId 
            });
            
            return publicId;
        } catch (error) {
            console.error("Error generating share link:", error);
            throw error;
        }
    },
    
    /**
     * Obtiene una nota compartida a través de su enlace público
     * No requiere autenticación
     */
    async getSharedNote(publicId) {
        try {
            const shareDoc = await getDoc(doc(db, 'sharedLinks', publicId));
            if (!shareDoc.exists()) return null;
            
            const noteId = shareDoc.data().noteId;
            const noteDoc = await getDoc(doc(db, 'notes', noteId));
            
            if (noteDoc.exists()) {
                return { id: noteDoc.id, ...noteDoc.data() };
            }
            return null;
        } catch (error) {
            console.error("Error fetching shared note:", error);
            throw error;
        }
    }
};
