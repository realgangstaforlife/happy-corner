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
            const rawId = path.split('/shared/')[1];
            const publicId = rawId ? rawId.split('?')[0].replace(/\/$/, '') : null;
            if (publicId) { this.renderSharedNote(publicId); return; }
        }
        
        if (!auth) return;

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
            <div style="max-width:850px;margin:30px auto;padding:0 20px;font-family:'Outfit',-apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased;">
                <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:25px;padding:15px 24px;background:var(--header-bg);border-radius:18px;border:1px solid var(--border-color);">
                    <a href="https://notas.happycorner.top" style="text-decoration:none;color:var(--text-color);font-weight:900;font-size:18px;display:flex;align-items:center;gap:10px;">
                        <img src="https://happycorner.top/happylogo.png" alt="HappyNotas" style="height:28px;width:auto;">
                        <span>Happy<span style="color:var(--hp-pink);">Notas</span></span>
                    </a>
                    <span style="font-size:12px;padding:5px 14px;background:rgba(46,204,113,0.12);color:#2ecc71;border:1px solid rgba(46,204,113,0.3);border-radius:20px;font-weight:800;">
                        <i class="fa-solid fa-link"></i> Transcripción Oficial
                    </span>
                </header>
                <div id="shared-area" style="background:var(--surface-color);border-radius:20px;border:1px solid var(--border-color);padding:30px;box-shadow:var(--shadow-sm);">
                    <div style="text-align:center;padding:50px 20px;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size:32px;color:var(--hp-pink);"></i>
                        <p style="margin-top:16px;color:var(--text-muted);font-weight:600;">Cargando transcripción académica...</p>
                    </div>
                </div>
            </div>
        `;
        try {
            await initPromise;
            const transcript = await NotesService.getSharedTranscript(publicId);
            const area = document.getElementById('shared-area');
            if (transcript) {
                const dateStr = transcript.createdAt 
                    ? new Date(transcript.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
                    : new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
                
                const finalScore = Number(transcript.finalAverage || transcript.gpa || 0).toFixed(2);
                const isPassed = Number(finalScore) >= 3.4;
                const statusBadge = isPassed 
                    ? '<span style="color:#2ecc71; background:rgba(46,204,113,0.12); padding:4px 12px; border-radius:12px; font-weight:800; font-size:12px;">✓ APROBADO</span>' 
                    : '<span style="color:#ff5252; background:rgba(255,82,82,0.12); padding:4px 12px; border-radius:12px; font-weight:800; font-size:12px;">⚠️ POR MEJORAR</span>';
                
                const acadAvg = Number(transcript.averages?.academic || transcript.averages?.cognitive || transcript.performances?.academic || transcript.performances?.cognitive || 0).toFixed(2);
                const classAvg = Number(transcript.averages?.classwork || transcript.averages?.procedural || transcript.performances?.classwork || transcript.performances?.procedural || 0).toFixed(2);
                const examAvg = Number(transcript.averages?.final_exam || transcript.averages?.evaluation || transcript.performances?.final_exam || transcript.performances?.evaluation || 0).toFixed(2);
                const selfAvg = Number(transcript.averages?.self_assessment || transcript.averages?.attitudinal || transcript.performances?.self_assessment || transcript.performances?.attitudinal || 0).toFixed(2);
                const coAvg = Number(transcript.averages?.co_assessment || transcript.performances?.co_assessment || 0).toFixed(2);
                
                area.innerHTML = `
                    <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 20px; margin-bottom: 24px;">
                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                            <div style="font-size:32px; width:52px; height:52px; border-radius:14px; background:var(--input-bg); display:flex; align-items:center; justify-content:center; border:1px solid var(--border-color);">
                                ${transcript.emoji || '📚'}
                            </div>
                            <div>
                                <h1 style="font-size:24px; font-weight:900; color:var(--text-color); margin:0;">${transcript.subject || 'Asignatura'}</h1>
                                <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">
                                    <span><i class="fa-solid fa-user-tie"></i> ${transcript.teacher || 'Docente'}</span>
                                    <span style="margin:0 6px;">•</span>
                                    <span>Periodo ${transcript.period || '1'}</span>
                                </div>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; background:var(--input-bg); padding:14px 18px; border-radius:14px; border:1px solid var(--border-color); font-size:13px;">
                            <div><strong style="color:var(--text-muted);">Estudiante:</strong> <span style="font-weight:800;">${transcript.studentName}</span></div>
                            <div><strong style="color:var(--text-muted);">Fecha de Emisión:</strong> <span>${dateStr}</span></div>
                        </div>
                    </div>
                    
                    <!-- CALIFICACIÓN FINAL -->
                    <div style="background: var(--input-bg); padding: 22px; border-radius: 16px; text-align: center; margin-bottom: 28px; border: 1px solid var(--border-color);">
                        <div style="font-size: 12px; color: var(--text-muted); font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 6px;">PROMEDIO FINAL DE LA ASIGNATURA</div>
                        <div style="font-size: 44px; font-weight: 900; color: ${isPassed ? '#2ecc71' : '#ff5252'}; line-height: 1.1;">${finalScore}</div>
                        <div style="margin-top: 8px;">${statusBadge}</div>
                    </div>
                    
                    <!-- DESGLOSE POR DESEMPEÑOS OFICIALES -->
                    <div style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); margin-bottom: 14px;">
                        Desglose Oficial de Desempeños
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--input-bg); border-radius: 14px; border: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 800; font-size: 14px;">📚 Rendimiento Académico</div>
                                <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Peso: 40%</div>
                            </div>
                            <strong style="font-size: 20px; font-weight: 900; color: var(--hp-pink);">${acadAvg}</strong>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--input-bg); border-radius: 14px; border: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 800; font-size: 14px;">🔧 Trabajo en Clase</div>
                                <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Peso: 20%</div>
                            </div>
                            <strong style="font-size: 20px; font-weight: 900; color: var(--hp-pink);">${classAvg}</strong>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--input-bg); border-radius: 14px; border: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 800; font-size: 14px;">📝 Examen Final</div>
                                <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Peso: 30%</div>
                            </div>
                            <strong style="font-size: 20px; font-weight: 900; color: var(--hp-pink);">${examAvg}</strong>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--input-bg); border-radius: 14px; border: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 800; font-size: 14px;">🎯 Autoevaluación</div>
                                <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Peso: 5%</div>
                            </div>
                            <strong style="font-size: 20px; font-weight: 900; color: var(--hp-pink);">${selfAvg}</strong>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--input-bg); border-radius: 14px; border: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 800; font-size: 14px;">👥 Coevaluación</div>
                                <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Peso: 5%</div>
                            </div>
                            <strong style="font-size: 20px; font-weight: 900; color: var(--hp-pink);">${coAvg}</strong>
                        </div>
                    </div>

                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                        <a href="https://notas.happycorner.top" style="display: inline-flex; align-items: center; gap: 8px; color: var(--hp-pink); font-weight: 800; text-decoration: none; font-size: 14px;">
                            🚀 Organiza tus notas en HappyNotas
                        </a>
                    </div>
                `;
            } else {
                area.innerHTML = `
                    <div style="text-align:center;padding:50px 20px;">
                        <i class="fa-solid fa-file-circle-xmark" style="font-size:44px;color:#ff5252;margin-bottom:16px;"></i>
                        <h2 style="font-weight:900;font-size:22px;margin-bottom:8px;">Transcripción no encontrada</h2>
                        <p style="color:var(--text-muted);font-size:14px;max-width:400px;margin:0 auto 20px;">El enlace puede haber expirado o la calificación fue eliminada por el estudiante.</p>
                        <a href="https://notas.happycorner.top" style="display:inline-block;padding:10px 24px;background:var(--hp-gradient);color:white;border-radius:14px;font-weight:800;text-decoration:none;font-size:14px;">← Ir a HappyNotas</a>
                    </div>
                `;
            }
        } catch (err) {
            console.error("Error loading shared transcript:", err);
            const area = document.getElementById('shared-area');
            if (area) {
                area.innerHTML = `
                    <div style="text-align:center;padding:50px 20px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:44px;color:#ff5252;margin-bottom:16px;"></i>
                        <h2 style="font-weight:900;margin-bottom:8px;">Error de conexión</h2>
                        <p style="color:var(--text-muted)">No se pudo cargar la transcripción académica. Por favor recarga la página.</p>
                    </div>
                `;
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.notasApp = new App();
});
