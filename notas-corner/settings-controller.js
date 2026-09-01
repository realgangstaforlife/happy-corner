import { auth, signOut } from './modules/auth.js';
import { NotesService } from './modules/notes-service.js';
import { StorageService } from './modules/storage.js';
import { UIManager } from './modules/ui-manager.js';
import { updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUser = null;

export function initSettings(user) {
    currentUser = user;
    
    // Fill profile data
    document.getElementById('profile-name').value = user.displayName || user.email.split('@')[0];
    document.getElementById('profile-email').value = user.email;
    
    // Auth metadata
    if (user.metadata && user.metadata.creationTime) {
        const date = new Date(user.metadata.creationTime);
        document.getElementById('profile-date').textContent = date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    
    // Theme setup
    const currentTheme = localStorage.getItem('notas_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
        themeSelector.value = currentTheme;
    }
    
    // Notes stats
    loadNotesStats();
    
    // Setup Logout
    document.getElementById('menu-logout')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await signOut(auth);
            StorageService.clearCache();
        } catch (error) {
            console.error("Logout error", error);
        }
    });
    
    // Handle mobile menu
    const menuBtn = document.getElementById('menuBtn');
    const sideMenu = document.getElementById('sideMenu');
    const overlay = document.getElementById('overlay');
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            sideMenu.classList.add('active');
            overlay.classList.add('active');
        });
        overlay.addEventListener('click', () => {
            sideMenu.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // Expose functions globally
    window.notasAppSettings = {
        updateProfileName,
        resetPassword,
        changeTheme,
        clearLocalCache,
        downloadAllNotes
    };
}

async function loadNotesStats() {
    try {
        let notes = StorageService.getNotes();
        if (notes.length === 0) {
            notes = await NotesService.getUserNotes(currentUser.uid);
            StorageService.saveNotes(notes);
        }
        document.getElementById('stats-notes-count').textContent = notes.length;
    } catch (error) {
        console.error("Error loading stats", error);
    }
}

async function updateProfileName() {
    const newName = document.getElementById('profile-name').value.trim();
    if (!newName) {
        UIManager.showToast("El nombre no puede estar vacío", "error");
        return;
    }
    
    try {
        await updateProfile(currentUser, { displayName: newName });
        UIManager.showToast("Nombre actualizado exitosamente");
    } catch (error) {
        console.error("Error updating profile", error);
        UIManager.showToast("Error al actualizar perfil", "error");
    }
}

async function resetPassword() {
    try {
        await sendPasswordResetEmail(auth, currentUser.email);
        UIManager.showToast("Correo de restablecimiento enviado. Revisa tu bandeja de entrada.");
    } catch (error) {
        console.error("Error sending reset email", error);
        UIManager.showToast("Error al enviar correo", "error");
    }
}

function changeTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('notas_theme', theme);
    
    // If the app.js updateThemeIcon exists, call it to keep everything in sync
    if (window.notasApp && window.notasApp.updateThemeIcon) {
        window.notasApp.updateThemeIcon(theme);
    }
}

function clearLocalCache() {
    if (confirm("¿Estás seguro de limpiar la caché? Esto no borrará tus notas en la nube, pero requerirá conexión a internet para volver a cargarlas.")) {
        StorageService.clearCache();
        document.getElementById('stats-notes-count').textContent = '0';
        UIManager.showToast("Caché local limpiada");
    }
}

async function downloadAllNotes() {
    try {
        let notes = StorageService.getNotes();
        if (notes.length === 0) {
            notes = await NotesService.getUserNotes(currentUser.uid);
        }
        
        if (notes.length === 0) {
            UIManager.showToast("No tienes notas para descargar", "info");
            return;
        }
        
        StorageService.exportNotes(notes);
        UIManager.showToast(`Descargando ${notes.length} notas...`);
    } catch (error) {
        console.error("Error exporting notes", error);
        UIManager.showToast("Error al descargar notas", "error");
    }
}
