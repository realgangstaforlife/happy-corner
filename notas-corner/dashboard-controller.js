import { auth, signOut } from './modules/auth.js';
import { NotesService } from './modules/notes-service.js';
import { StorageService } from './modules/storage.js';
import { UIManager } from './modules/ui-manager.js';

let currentUser = null;
let notesList = [];
let filteredNotes = [];

export function initDashboard(user) {
    currentUser = user;
    
    const title = document.getElementById('welcome-title');
    if (title) {
        title.innerHTML = `Hola, <span style="color: var(--hp-pink);">${user.displayName || user.email.split('@')[0]}</span> 👋`;
    }
    
    // Set up logout handler
    document.getElementById('menu-logout')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await signOut(auth);
            StorageService.clearCache();
            window.location.href = 'https://auth.happycorner.top/logout';
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

    loadNotes();
    
    // Expose dashboard functions globally
    window.notasAppDashboard = {
        openNoteEditor,
        closeNoteEditor,
        saveNote,
        editNote,
        deleteNote,
        openShareModal,
        closeShareModal,
        generateShareLink,
        copyShareLink,
        importNotes,
        exportNote,
        filterNotes,
        switchTab
    };
}

async function loadNotes() {
    UIManager.showSpinner();
    try {
        notesList = await NotesService.getUserNotes(currentUser.uid);
        StorageService.saveNotes(notesList);
        filteredNotes = [...notesList];
        renderNotes(filteredNotes);
    } catch (error) {
        console.error("Error loading notes", error);
        // Fallback to cache
        notesList = StorageService.getNotes();
        filteredNotes = [...notesList];
        renderNotes(filteredNotes);
        if (notesList.length > 0) {
            UIManager.showToast("Mostrando notas guardadas sin conexión", "info");
        }
    } finally {
        UIManager.hideSpinner();
    }
}

function renderNotes(notes) {
    const grid = document.getElementById('notes-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (notes.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-note-sticky" style="font-size: 40px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>No tienes notas aún. ¡Crea la primera!</p>
            </div>
        `;
        return;
    }
    
    notes.forEach(note => {
        const dateStr = new Date(note.updatedAt).toLocaleDateString('es-ES', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        
        const card = document.createElement('div');
        card.className = 'card note-card';
        card.onclick = (e) => {
            // Prevent opening editor if clicking action buttons
            if (e.target.closest('.action-icon')) return;
            editNote(note.id);
        };
        
        card.innerHTML = `
            <div class="note-title">${note.title}</div>
            <div class="note-date"><i class="fa-regular fa-clock"></i> ${dateStr}</div>
            <div class="note-excerpt">${note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}</div>
            
            ${note.isShared ? '<div style="margin-bottom:10px;"><span class="trust-badge confiable"><i class="fa-solid fa-link"></i> Compartida</span></div>' : ''}
            
            <div class="note-actions">
                <div class="action-icon" title="Editar" onclick="window.notasAppDashboard.editNote('${note.id}')"><i class="fa-solid fa-pen"></i></div>
                <div class="action-icon" title="Compartir" onclick="window.notasAppDashboard.openShareModal('${note.id}', '${note.publicId || ''}')"><i class="fa-solid fa-share-nodes"></i></div>
                <div class="action-icon" title="Descargar PDF" onclick="window.notasAppDashboard.exportNote('${note.id}')"><i class="fa-solid fa-download"></i></div>
                <div style="flex:1;"></div>
                <div class="action-icon delete" title="Eliminar" onclick="window.notasAppDashboard.deleteNote('${note.id}', '${note.publicId || ''}')"><i class="fa-solid fa-trash"></i></div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function filterNotes() {
    const query = document.getElementById('search-input').value.toLowerCase();
    if (!query) {
        filteredNotes = [...notesList];
    } else {
        filteredNotes = notesList.filter(note => 
            note.title.toLowerCase().includes(query) || 
            note.content.toLowerCase().includes(query)
        );
    }
    renderNotes(filteredNotes);
}

function switchTab(tabId) {
    // Basic search setup, Sprint 1 only focuses on "Mine"
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

// --- Note Editor ---
function openNoteEditor() {
    document.getElementById('note-id').value = '';
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    UIManager.openModal('editor-modal');
}

function closeNoteEditor() {
    UIManager.closeModal('editor-modal');
}

function editNote(noteId) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    
    document.getElementById('note-id').value = note.id;
    document.getElementById('note-title').value = note.title;
    document.getElementById('note-content').value = note.content;
    
    UIManager.openModal('editor-modal');
}

async function saveNote() {
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    const noteId = document.getElementById('note-id').value;
    
    if (!title) {
        UIManager.showToast("El título es obligatorio", "error");
        return;
    }
    
    UIManager.showSpinner('save-note-btn');
    
    try {
        if (noteId) {
            // Update
            await NotesService.updateNote(noteId, { title, content });
            
            // Update local list
            const index = notesList.findIndex(n => n.id === noteId);
            if (index > -1) {
                notesList[index].title = title;
                notesList[index].content = content;
                notesList[index].updatedAt = Date.now();
            }
            UIManager.showToast("Nota actualizada");
        } else {
            // Create
            const newNote = await NotesService.createNote(currentUser.uid, title, content);
            notesList.unshift(newNote);
            UIManager.showToast("Nota creada");
        }
        
        StorageService.saveNotes(notesList);
        filterNotes();
        closeNoteEditor();
    } catch (error) {
        console.error("Error saving note", error);
        UIManager.showToast("Error al guardar la nota", "error");
    } finally {
        UIManager.hideSpinner('save-note-btn');
    }
}

async function deleteNote(noteId, publicId) {
    if (!confirm("¿Estás seguro de eliminar esta nota? Esta acción no se puede deshacer.")) return;
    
    try {
        await NotesService.deleteNote(noteId, publicId);
        notesList = notesList.filter(n => n.id !== noteId);
        StorageService.saveNotes(notesList);
        filterNotes();
        UIManager.showToast("Nota eliminada");
    } catch (error) {
        console.error("Error deleting note", error);
        UIManager.showToast("Error al eliminar", "error");
    }
}

// --- Sharing ---
let currentShareNoteId = null;

function openShareModal(noteId, publicId) {
    currentShareNoteId = noteId;
    const container = document.getElementById('share-link-container');
    const input = document.getElementById('share-link-input');
    const generateBtn = document.getElementById('generate-link-btn');
    
    if (publicId && publicId !== 'undefined') {
        generateBtn.style.display = 'none';
        container.style.display = 'block';
        input.value = `${window.location.origin}/notas-corner/shared/${publicId}`;
    } else {
        generateBtn.style.display = 'block';
        container.style.display = 'none';
        input.value = '';
    }
    
    UIManager.openModal('share-modal');
}

function closeShareModal() {
    UIManager.closeModal('share-modal');
}

async function generateShareLink() {
    UIManager.showSpinner('generate-link-btn');
    try {
        const publicId = await NotesService.generateShareLink(currentShareNoteId, currentUser.uid);
        
        // Update local list
        const note = notesList.find(n => n.id === currentShareNoteId);
        if (note) {
            note.isShared = true;
            note.publicId = publicId;
            StorageService.saveNotes(notesList);
            filterNotes(); // refresh UI to show badge
        }
        
        // Update Modal UI
        document.getElementById('generate-link-btn').style.display = 'none';
        document.getElementById('share-link-container').style.display = 'block';
        document.getElementById('share-link-input').value = `${window.location.origin}/notas-corner/shared/${publicId}`;
        
        UIManager.showToast("Enlace generado correctamente");
    } catch (error) {
        console.error("Error generating link", error);
        UIManager.showToast("Error al generar enlace", "error");
    } finally {
        UIManager.hideSpinner('generate-link-btn');
    }
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    input.setSelectionRange(0, 99999); // For mobile
    navigator.clipboard.writeText(input.value)
        .then(() => UIManager.showToast("Enlace copiado al portapapeles"))
        .catch(() => UIManager.showToast("Error al copiar", "error"));
}

// --- Import / Export ---
async function importNotes(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const importedNotes = await StorageService.readNotesFile(file);
        if (!Array.isArray(importedNotes)) throw new Error("Formato inválido");
        
        let importCount = 0;
        UIManager.showSpinner();
        
        for (const noteData of importedNotes) {
            const newNote = await NotesService.createNote(
                currentUser.uid, 
                noteData.title || 'Nota Importada', 
                noteData.content || ''
            );
            notesList.unshift(newNote);
            importCount++;
        }
        
        StorageService.saveNotes(notesList);
        filterNotes();
        UIManager.showToast(`${importCount} notas importadas exitosamente`);
    } catch (error) {
        UIManager.showToast("Error importando notas: " + error.message, "error");
    } finally {
        event.target.value = ''; // reset input
        UIManager.hideSpinner();
    }
}

async function exportNote(noteId) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    
    // Fallback to JSON if html2pdf is not loaded yet (Sprint 3 feature, basic implementation)
    if (typeof html2pdf === 'undefined') {
        StorageService.exportNotes([note]);
        UIManager.showToast("Nota exportada como JSON (.happyc)");
        return;
    }
    
    // If html2pdf exists, generate PDF
    const element = document.createElement('div');
    element.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 40px; color: #333;">
            <h1 style="color: #ff5299;">${note.title}</h1>
            <p style="color: #666; font-size: 12px;">Fecha: ${new Date(note.updatedAt).toLocaleString()}</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <div style="white-space: pre-wrap; line-height: 1.6;">${note.content}</div>
            <div style="margin-top: 50px; font-size: 10px; color: #999; text-align: center;">
                Generado desde Happy Notas Corner
            </div>
        </div>
    `;
    
    try {
        UIManager.showToast("Generando PDF...");
        await html2pdf().from(element).save(`${note.title.substring(0, 20)}.pdf`);
    } catch (error) {
        console.error("PDF Export error", error);
        UIManager.showToast("Error exportando a PDF", "error");
    }
}
