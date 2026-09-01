import { initPromise, auth, onAuthStateChanged } from './modules/auth.js';
import { UIManager } from './modules/ui-manager.js';
import { NotesService } from './modules/notes-service.js';

class App {
    constructor() {
        this.init();
    }
    
    async init() {
        try {
            await initPromise; // Wait for Firebase config to load
            this.handleRouting();
            this.setupTheme();
        } catch (error) {
            console.error("App initialization failed", error);
            UIManager.showToast("Error de conexión. Trabajando offline.", "error");
        }
    }
    
    setupTheme() {
        const toggleBtn = document.getElementById('theme-toggle');
        if (!toggleBtn) return;
        
        // 1. Check local storage
        let theme = localStorage.getItem('notas_theme');
        if (!theme) {
            // 2. Check OS preference
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        
        document.documentElement.setAttribute('data-theme', theme);
        this.updateThemeIcon(theme);
        
        toggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('notas_theme', newTheme);
            this.updateThemeIcon(newTheme);
        });
    }
    
    updateThemeIcon(theme) {
        const icon = document.querySelector('#theme-toggle i') || document.querySelector('#theme-toggle');
        if (icon && icon.tagName === 'I') {
            icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        } else if (icon) {
            icon.textContent = theme === 'dark' ? '🌙' : '☀️';
        }
    }
    
    handleRouting() {
        const path = window.location.pathname;
        
        // Handle Shared links (e.g. /notas-corner/shared/1234-abcd)
        if (path.includes('/shared/')) {
            const publicId = path.split('/shared/')[1];
            if (publicId) {
                this.renderSharedNote(publicId);
                return;
            }
        }
        
        // Normal Auth routing
        onAuthStateChanged(auth, (user) => {
            const isDashboard = path.includes('dashboard');
            const isSettings = path.includes('settings');
            const isIndex = path.endsWith('notas-corner/') || path.endsWith('index.html');
            
            if (user) {
                // Logged in
                if (isIndex) {
                    window.location.href = '/notas-corner/dashboard';
                } else if (isDashboard) {
                    import('./dashboard-controller.js').then(module => module.initDashboard(user));
                } else if (isSettings) {
                    import('./settings-controller.js').then(module => module.initSettings(user));
                }
            } else {
                // Not logged in
                if (isDashboard || isSettings) {
                    window.location.href = '/notas-corner/';
                } else if (isIndex) {
                    import('./auth-controller.js').then(module => module.initAuth());
                }
            }
        });
    }
    
    async renderSharedNote(publicId) {
        // Change body to simple read-only view
        document.body.innerHTML = `
            <div class="shared-container" style="max-width: 800px; margin: 40px auto; padding: 20px;">
                <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                    <a href="/notas-corner/" style="text-decoration:none; color:var(--hp-pink); font-weight:bold; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-graduation-cap"></i> Notas Corner
                    </a>
                    <span class="trust-badge confiable"><i class="fa-solid fa-link"></i> Nota Compartida Pública</span>
                </header>
                <div id="shared-content-area" class="card" style="text-align:left; padding: 30px;">
                    <div style="text-align:center; padding: 50px;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size: 30px; color: var(--hp-pink);"></i>
                        <p style="margin-top:15px; color: var(--text-muted);">Cargando nota...</p>
                    </div>
                </div>
            </div>
        `;
        
        try {
            const note = await NotesService.getSharedNote(publicId);
            const container = document.getElementById('shared-content-area');
            
            if (note) {
                const dateStr = new Date(note.updatedAt).toLocaleDateString('es-ES', {
                    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                
                container.innerHTML = `
                    <h1 style="margin-bottom:10px; font-size:28px;">${note.title}</h1>
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:25px; border-bottom:1px solid var(--border-color); padding-bottom:15px;">
                        <i class="fa-regular fa-clock"></i> Última actualización: ${dateStr}
                    </div>
                    <div style="line-height:1.6; white-space:pre-wrap; font-size: 16px;">${note.content || '<em>Sin contenido</em>'}</div>
                `;
            } else {
                container.innerHTML = `
                    <div style="text-align:center; padding: 40px 20px;">
                        <i class="fa-solid fa-file-circle-xmark" style="font-size:40px; color:var(--error); margin-bottom:15px;"></i>
                        <h2>Nota no encontrada</h2>
                        <p style="color:var(--text-muted); margin-top:10px;">El enlace puede haber expirado o la nota fue eliminada por su propietario.</p>
                        <br>
                        <a href="/notas-corner/" class="btn-primary" style="display:inline-block; text-decoration:none;">Crear mi propia nota</a>
                    </div>
                `;
            }
        } catch (error) {
            document.getElementById('shared-content-area').innerHTML = `
                <div style="text-align:center; padding: 40px 20px;">
                    <h2>Error de conexión</h2>
                    <p>No pudimos cargar la nota. Revisa tu conexión a internet.</p>
                </div>
            `;
        }
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    window.notasApp = new App();
});
