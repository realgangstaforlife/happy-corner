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
        
        const params = new URLSearchParams(window.location.search);
        const ssoToken = params.get('token');

        try {
            await initPromise;
            
            if (ssoToken) {
                const { signInWithCustomTokenSSO } = await import('./modules/auth.js');
                const success = await signInWithCustomTokenSSO(ssoToken);
                if (success) {
                    window.history.replaceState({}, '', window.location.pathname);
                }
            }
            
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
                if (isIndex) {
                    window.location.href = '/notas-corner/dashboard';
                }
                else if (isDashboard) import('./dashboard-controller.js').then(m => m.initDashboard(user));
                else if (isSettings)  import('./settings-controller.js').then(m => m.initSettings(user));
            } else {
                // Not logged in -> ALWAYS redirect to auth unless shared
                if (!path.includes('/shared/')) {
                    const targetUrl = window.location.href === window.location.origin + '/' 
                        ? window.location.origin + '/notas-corner/dashboard' 
                        : window.location.href;
                        
                    const redirectUrl = `https://auth.happycorner.top?client_id=notas&redirect_uri=${encodeURIComponent(targetUrl)}`;
                    window.location.href = redirectUrl;
                }
            }
        });
    }
    
    async renderSharedNote(publicId) {
        document.body.innerHTML = `
            <div style="max-width:800px;margin:40px auto;padding:20px;font-family:'Outfit',sans-serif;">
                <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;">
                    <a href="/" style="text-decoration:none;color:var(--hp-pink);font-weight:900;font-size:18px;display:flex;align-items:center;gap:8px;">
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
            const transcript = await NotesService.getSharedTranscript(publicId);
            const area = document.getElementById('shared-area');
            if (transcript) {
                const dateStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
                
                const finalGpa = transcript.gpa || 0;
                const statusStr = finalGpa >= 3.4 ? '<span style="color:var(--hp-pink); font-weight:bold;">✓ Aprobado</span>' : '<span style="color:var(--error); font-weight:bold;">⚠️ Reprobado</span>';
                
                area.innerHTML = `
                    <div style="border-bottom: 2px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px;">
                        <h1 style="font-size:24px; font-weight:900; margin-bottom:10px; color:var(--text-color);">📋 TRANSCRIPCIÓN ACADÉMICA</h1>
                        <div style="font-size:14px; color:var(--text-muted); display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div><strong>Estudiante:</strong> ${transcript.studentName}</div>
                            <div><strong>Periodo:</strong> ${transcript.period || '-'}</div>
                            <div><strong>Asignatura:</strong> ${transcript.subject}</div>
                            <div><strong>Fecha Emisión:</strong> ${dateStr}</div>
                        </div>
                    </div>
                    
                    <div style="background: var(--input-bg); padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 25px; border: 1px solid var(--border-color);">
                        <div style="font-size: 14px; color: var(--text-muted); font-weight: 600; margin-bottom: 10px;">CALIFICACIÓN FINAL</div>
                        <div style="font-size: 40px; font-weight: 900; color: ${finalGpa >= 3.4 ? 'var(--hp-pink)' : 'var(--error)'};">${finalGpa.toFixed(2)}</div>
                        <div style="margin-top: 5px;">${statusStr}</div>
                    </div>
                    
                    <h3 style="font-size: 16px; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">DESGLOSE POR DESEMPEÑOS</h3>
                    <div style="display: grid; gap: 15px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
                            <span>📚 Saber (Cognitivo)</span>
                            <strong style="color: var(--hp-pink);">${(transcript.performances?.cognitive || 0).toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
                            <span>🔧 Hacer (Procedimental)</span>
                            <strong style="color: var(--hp-pink);">${(transcript.performances?.procedural || 0).toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
                            <span>🎯 Ser (Actitudinal)</span>
                            <strong style="color: var(--hp-pink);">${(transcript.performances?.attitudinal || 0).toFixed(2)}</strong>
                        </div>
                    </div>
                `;
            } else {
                area.innerHTML = `
                    <div style="text-align:center;padding:40px;">
                        <i class="fa-solid fa-file-circle-xmark" style="font-size:40px;color:#ef4444;margin-bottom:15px;"></i>
                        <h2 style="font-weight:900;margin-bottom:10px;">Transcripción no encontrada</h2>
                        <p style="color:var(--text-muted);">El enlace puede haber expirado o la calificación fue eliminada.</p>
                        <br><a href="/notas-corner/dashboard" style="color:var(--hp-pink);font-weight:700;text-decoration:none;">← Ir a Inicio</a>
                    </div>
                `;
            }
        } catch (err) {
            document.getElementById('shared-area').innerHTML = `
                <div style="text-align:center;padding:40px;">
                    <h2>Error de conexión</h2>
                    <p style="color:var(--text-muted)">No se pudo cargar la transcripción académica.</p>
                </div>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.notasApp = new App();
});
