import { initPromise, auth, onAuthStateChanged } from './modules/auth.js';
import { UIManager } from './modules/ui-manager.js';
import { NotesService } from './modules/notes-service.js';

// Apply theme IMMEDIATELY — zero flicker
(function() {
    const stored = localStorage.getItem('notas_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', stored);
})();

class App {
    constructor() {
        this.init();
    }
    
    async init() {
        this.setupTheme();
        try {
            await initPromise;
            this.handleRouting();
        } catch (error) {
            console.warn("Firebase not available:", error.message);
            this.handleRouting();
        }
    }
    
    setupTheme() {
        const toggleBtn = document.getElementById('theme-toggle');
        if (!toggleBtn) return;
        const stored = localStorage.getItem('notas_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', stored);
        this.updateThemeIcon(stored);
        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('notas_theme', next);
            this.updateThemeIcon(next);
        });
    }
    
    updateThemeIcon(theme) {
        const i = document.querySelector('#theme-toggle i');
        if (i) i.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }
    
    handleRouting() {
        const path = window.location.pathname;
        
        // Shared note view — no auth
        if (path.includes('/shared/')) {
            const publicId = path.split('/shared/')[1];
            if (publicId) { this.renderSharedNote(publicId); return; }
        }
        
        if (!auth) return; // Firebase not available, landing page handles its own auth UI

        onAuthStateChanged(auth, (user) => {
            const isDashboard = path.includes('dashboard');
            const isSettings  = path.includes('settings');
            const isIndex     = !isDashboard && !isSettings && !path.includes('/shared/');
            
            if (user) {
                if (isIndex)      window.location.href = '/notas-corner/dashboard';
                else if (isDashboard) import('./dashboard-controller.js').then(m => m.initDashboard(user));
                else if (isSettings)  import('./settings-controller.js').then(m => m.initSettings(user));
            } else {
                if (isDashboard || isSettings) window.location.href = '/notas-corner/';
            }
        });
    }
    
    async renderSharedNote(publicId) {
        document.body.innerHTML = `
            <div style="max-width:800px;margin:40px auto;padding:20px;font-family:'Outfit',sans-serif;">
                <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;">
                    <a href="/notas-corner/" style="text-decoration:none;color:var(--hp-pink);font-weight:900;font-size:18px;display:flex;align-items:center;gap:8px;">
                        <i class="fa-solid fa-graduation-cap"></i> Notas Corner
                    </a>
                    <span style="font-size:12px;padding:5px 12px;background:rgba(46,213,115,0.1);color:#2ed573;border:1px solid rgba(46,213,115,0.3);border-radius:999px;font-weight:700;">
                        <i class="fa-solid fa-link"></i> Vista pública
                    </span>
                </header>
                <div id="shared-area" class="card" style="padding:36px;text-align:left;">
                    <div style="text-align:center;padding:40px;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size:30px;color:var(--hp-pink);"></i>
                        <p style="margin-top:15px;color:var(--text-muted);">Cargando nota...</p>
                    </div>
                </div>
            </div>
        `;
        try {
            await initPromise;
            const note = await NotesService.getSharedNote(publicId);
            const area = document.getElementById('shared-area');
            if (note) {
                const dateStr = new Date(note.updatedAt).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
                area.innerHTML = `
                    <h1 style="font-size:28px;font-weight:900;margin-bottom:10px;color:var(--text-color);">${note.title}</h1>
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border-color);">
                        <i class="fa-regular fa-clock"></i> Actualizado: ${dateStr}
                    </p>
                    <div style="line-height:1.7;white-space:pre-wrap;font-size:16px;color:var(--text-color);">${note.content || '<em style="color:var(--text-muted)">Sin contenido</em>'}</div>
                `;
            } else {
                area.innerHTML = `
                    <div style="text-align:center;padding:40px;">
                        <i class="fa-solid fa-file-circle-xmark" style="font-size:40px;color:#ef4444;margin-bottom:15px;"></i>
                        <h2 style="font-weight:900;margin-bottom:10px;">Nota no encontrada</h2>
                        <p style="color:var(--text-muted);">El enlace puede haber expirado o la nota fue eliminada.</p>
                        <br><a href="/notas-corner/" style="color:var(--hp-pink);font-weight:700;text-decoration:none;">← Ir a Notas Corner</a>
                    </div>
                `;
            }
        } catch (err) {
            document.getElementById('shared-area').innerHTML = `
                <div style="text-align:center;padding:40px;">
                    <h2>Error de conexión</h2>
                    <p style="color:var(--text-muted)">No se pudo cargar la nota.</p>
                </div>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.notasApp = new App();
});
