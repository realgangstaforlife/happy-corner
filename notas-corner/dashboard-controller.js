import { auth, signOut } from './modules/auth.js';
import { NotesService } from './modules/notes-service.js';
import { StorageService } from './modules/storage.js';
import { UIManager } from './modules/ui-manager.js';

let currentUser = null;
let academicsList = [];
let filteredAcademics = [];
let currentAcademicId = null;

// Categorías por defecto con los pesos oficiales (40%, 30%, 20%, 10%)
export const DEFAULT_PERFORMANCES = {
    cognitive: { name: "Saber (Cognitivo)", emoji: "📚", weight: 40, categories: [] },
    procedural: { name: "Hacer (Procedimental)", emoji: "🔧", weight: 30, categories: [] },
    attitudinal: { name: "Ser (Actitudinal)", emoji: "🎯", weight: 20, categories: [] },
    evaluation: { name: "Evaluación / Auto", emoji: "📝", weight: 10, categories: [] }
};

export function initDashboard(user) {
    currentUser = user;
    
    // 1. Render Greeting
    const title = document.getElementById('welcome-title');
    if (title) {
        const userName = user.displayName || (user.email ? user.email.split('@')[0] : 'Estudiante');
        title.innerHTML = `Hola, <span style="color: var(--hp-pink);">${userName}</span> 👋`;
    }

    // 2. Render Profile Picture (PFP)
    const avatarEl = document.getElementById('header-avatar');
    if (avatarEl) {
        if (user.photoURL) {
            avatarEl.innerHTML = `<img src="${user.photoURL}" alt="PFP" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid var(--hp-pink);display:block;">`;
        } else {
            const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
            avatarEl.innerHTML = `<div style="width:34px;height:34px;border-radius:50%;background:var(--hp-gradient);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;box-shadow:0 2px 8px rgba(255,82,153,0.3);">${initial}</div>`;
        }
        avatarEl.onclick = () => {
            window.location.href = '/notas-corner/settings';
        };
    }
    
    // 3. Logout handler
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

    // 4. Mobile side menu
    const menuBtn = document.getElementById('menuBtn');
    const sideMenu = document.getElementById('sideMenu');
    const overlay = document.getElementById('overlay');
    if (menuBtn && sideMenu && overlay) {
        menuBtn.addEventListener('click', () => {
            sideMenu.classList.add('active');
            overlay.classList.add('active');
        });
        overlay.addEventListener('click', () => {
            sideMenu.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    loadAcademics();
    
    // Exponer funciones al scope global
    window.notasAppDashboard = {
        openAcademicEditor,
        closeAcademicEditor,
        saveAcademic,
        editAcademic,
        deleteAcademic,
        openAcademicDetail,
        closeAcademicDetail,
        openGradeEditor,
        closeGradeEditor,
        saveGrade,
        deleteGrade,
        openShareModal,
        closeShareModal,
        generateShareLink,
        copyShareLink,
        importAcademics,
        filterAcademics,
        switchTab
    };
}

async function loadAcademics() {
    UIManager.showSpinner();
    try {
        academicsList = await NotesService.getAcademics(currentUser.uid);
        filteredAcademics = [...academicsList];
        renderAcademics(filteredAcademics);
        updateSummaryCard();
    } catch (error) {
        console.error("Error loading academics", error);
        UIManager.showToast("Error al cargar calificaciones", "error");
    } finally {
        UIManager.hideSpinner();
    }
}

/**
 * Calcula el promedio ponderado de la asignatura en base a las 4 categorías:
 * Saber (40%), Hacer (30%), Ser (20%), Evaluación (10%)
 */
function calculateSubjectAverage(performances) {
    if (!performances) return 0.00;
    
    let totalWeightedScore = 0;
    let totalWeightCounted = 0;
    
    for (const [key, category] of Object.entries(performances)) {
        if (!category.categories || category.categories.length === 0) continue;
        
        let catScore = 0;
        let catWeight = 0;
        
        category.categories.forEach(gradeItem => {
            const w = Number(gradeItem.weight) || 0;
            const g = Number(gradeItem.grade) || 0;
            catScore += (g * (w / 100));
            catWeight += w;
        });
        
        const catAvg = catWeight > 0 ? (catScore / (catWeight / 100)) : 0;
        const mainWeight = Number(category.weight) || 0;
        
        totalWeightedScore += (catAvg * (mainWeight / 100));
        totalWeightCounted += mainWeight;
    }
    
    if (totalWeightCounted === 0) return 0.00;
    return totalWeightedScore / (totalWeightCounted / 100);
}

function updateSummaryCard() {
    const totalEl = document.getElementById('total-subjects');
    const gpaEl = document.getElementById('gpa-score');
    const bestEl = document.getElementById('best-subject');
    const worstEl = document.getElementById('worst-subject');
    const statusPill = document.getElementById('gpa-status-pill');
    
    if (totalEl) totalEl.textContent = academicsList.length;
    
    if (academicsList.length === 0) {
        if (gpaEl) gpaEl.textContent = "0.00";
        if (bestEl) bestEl.textContent = "--";
        if (worstEl) worstEl.textContent = "--";
        if (statusPill) {
            statusPill.textContent = "Sin calificaciones";
            statusPill.style.color = "var(--text-muted)";
        }
        return;
    }
    
    let sumGrades = 0;
    let best = { name: "--", score: -1 };
    let worst = { name: "--", score: 6 };
    
    academicsList.forEach(subject => {
        const avg = Number(subject.averages?.final || 0);
        sumGrades += avg;
        
        if (avg > best.score) best = { name: subject.name, score: avg };
        if (avg < worst.score) worst = { name: subject.name, score: avg };
    });
    
    const overallAvg = (sumGrades / academicsList.length).toFixed(2);
    const isOverallPassed = Number(overallAvg) >= 3.4;
    
    if (gpaEl) {
        gpaEl.textContent = overallAvg;
        gpaEl.style.color = isOverallPassed ? 'var(--hp-pink)' : '#ff5252';
    }
    if (bestEl) bestEl.textContent = best.score >= 0 ? `${best.score.toFixed(2)} (${best.name})` : "--";
    if (worstEl) worstEl.textContent = worst.score <= 5.0 ? `${worst.score.toFixed(2)} (${worst.name})` : "--";
    if (statusPill) {
        statusPill.textContent = isOverallPassed ? "✓ Rendimiento Excelente" : "⚠️ Requiere Atención";
        statusPill.style.color = isOverallPassed ? "#2ecc71" : "#ff5252";
    }
}

function renderAcademics(academics) {
    const grid = document.getElementById('notes-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (academics.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-muted); background: var(--surface-color); border-radius: 20px; border: 1.5px dashed var(--border-color);">
                <i class="fa-solid fa-graduation-cap" style="font-size: 44px; margin-bottom: 14px; color: var(--hp-pink); opacity: 0.85;"></i>
                <h3 style="font-size: 18px; font-weight: 800; color: var(--text-color); margin-bottom: 6px;">No tienes asignaturas registradas</h3>
                <p style="font-size: 14px;">Haz clic en <strong>"+ Nueva Asignatura"</strong> para comenzar a organizar tus notas.</p>
            </div>
        `;
        return;
    }

    academics.forEach(item => {
        const finalScore = Number(item.averages?.final || 0).toFixed(2);
        const isPassed = finalScore >= 3.4;
        const scoreClass = isPassed ? 'passed' : 'failed';
        const periodText = item.period ? `Periodo ${item.period}` : 'Periodo 1';
        
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.innerHTML = `
            <div class="subject-card-top">
                <div class="subject-emoji-title">
                    <div class="subject-emoji">${item.emoji || '📚'}</div>
                    <div>
                        <h3 class="subject-name">${item.name}</h3>
                        <div class="subject-teacher">
                            <i class="fa-solid fa-user-tie" style="font-size: 11px; opacity: 0.7;"></i>
                            ${item.teacher || 'Sin profesor'}
                        </div>
                    </div>
                </div>
                <span class="subject-period-badge">${periodText}</span>
            </div>
            
            <div class="subject-card-divider"></div>
            
            <div class="subject-card-bottom">
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">
                    ${isPassed ? '✓ Aprobando' : '⚠️ Por mejorar'}
                </div>
                <div class="subject-score-pill ${scoreClass}">
                    ${finalScore}
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => openAcademicDetail(item.id));
        grid.appendChild(card);
    });
}

function openAcademicEditor() {
    document.getElementById('academic-modal-title').textContent = 'Nueva Asignatura';
    document.getElementById('academic-id').value = '';
    document.getElementById('academic-emoji').value = '📚';
    document.getElementById('academic-name').value = '';
    document.getElementById('academic-teacher').value = '';
    document.getElementById('academic-period').value = '1';
    
    const modal = document.getElementById('academic-editor-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeAcademicEditor() {
    const modal = document.getElementById('academic-editor-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 200);
}

async function saveAcademic() {
    const id = document.getElementById('academic-id').value;
    const emoji = document.getElementById('academic-emoji').value || '📚';
    const name = document.getElementById('academic-name').value.trim();
    const teacher = document.getElementById('academic-teacher').value.trim();
    const period = document.getElementById('academic-period').value || '1';
    
    if (!name) {
        UIManager.showToast('El nombre de la asignatura es requerido', 'error');
        return;
    }

    const btn = document.getElementById('save-academic-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        if (id) {
            // Edit existing
            const existing = academicsList.find(n => n.id === id);
            const updates = { name, emoji, teacher, period };
            const updated = await NotesService.updateAcademic(currentUser.uid, id, updates, existing);
            
            academicsList = academicsList.map(n => n.id === id ? updated : n);
            UIManager.showToast('Asignatura actualizada', 'success');
        } else {
            // Create new with default 40/30/20/10 structure
            const defaultPerformances = JSON.parse(JSON.stringify(DEFAULT_PERFORMANCES));
            
            const newData = {
                name, emoji, teacher, period,
                performances: defaultPerformances,
                averages: { cognitive: 0, procedural: 0, attitudinal: 0, evaluation: 0, final: 0 }
            };
            
            const created = await NotesService.createAcademic(currentUser.uid, newData);
            academicsList.unshift(created);
            UIManager.showToast('Asignatura creada', 'success');
        }
        
        closeAcademicEditor();
        filterAcademics();
        
        if (id && currentAcademicId === id) {
            renderSubjectDetail(id);
        }
    } catch (error) {
        console.error(error);
        UIManager.showToast('Error al guardar asignatura', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function openAcademicDetail(id) {
    currentAcademicId = id;
    
    document.getElementById('main-dashboard-view').style.display = 'none';
    const detailView = document.getElementById('subject-detail-view');
    detailView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    renderSubjectDetail(id);
}

function closeAcademicDetail() {
    currentAcademicId = null;
    document.getElementById('subject-detail-view').style.display = 'none';
    document.getElementById('main-dashboard-view').style.display = 'block';
    filterAcademics();
}

function renderSubjectDetail(id) {
    const academic = academicsList.find(a => a.id === id);
    if (!academic) return;
    
    if (!academic.performances) {
        academic.performances = JSON.parse(JSON.stringify(DEFAULT_PERFORMANCES));
    } else {
        if (!academic.performances.cognitive) academic.performances.cognitive = { name: "Saber (Cognitivo)", emoji: "📚", weight: 40, categories: [] };
        if (!academic.performances.procedural) academic.performances.procedural = { name: "Hacer (Procedimental)", emoji: "🔧", weight: 30, categories: [] };
        if (!academic.performances.attitudinal) academic.performances.attitudinal = { name: "Ser (Actitudinal)", emoji: "🎯", weight: 20, categories: [] };
        if (!academic.performances.evaluation) academic.performances.evaluation = { name: "Evaluación / Auto", emoji: "📝", weight: 10, categories: [] };
    }
    
    // Header
    document.getElementById('detail-emoji').textContent = academic.emoji || '📚';
    document.getElementById('detail-title').textContent = academic.name;
    document.getElementById('detail-teacher').innerHTML = `<i class="fa-solid fa-user-tie"></i> ${academic.teacher || 'Sin profesor'}`;
    document.getElementById('detail-period').textContent = `Periodo ${academic.period || '1'}`;
    
    const finalScore = Number(academic.averages?.final || 0).toFixed(2);
    const isPassed = finalScore >= 3.4;
    const scoreEl = document.getElementById('detail-final-score');
    const statusPill = document.getElementById('detail-status-pill');
    
    scoreEl.textContent = finalScore;
    scoreEl.style.color = isPassed ? '#2ecc71' : '#ff5252';
    statusPill.textContent = isPassed ? '✓ APROBADO' : '⚠️ POR MEJORAR';
    statusPill.style.color = isPassed ? '#2ecc71' : '#ff5252';
    
    // Performances list
    const perfList = document.getElementById('detail-performances-list');
    perfList.innerHTML = '';
    
    const categoryConfigs = [
        { key: 'cognitive', defaultName: 'Saber (Cognitivo)', defaultWeight: 40, emoji: '📚' },
        { key: 'procedural', defaultName: 'Hacer (Procedimental)', defaultWeight: 30, emoji: '🔧' },
        { key: 'attitudinal', defaultName: 'Ser (Actitudinal)', defaultWeight: 20, emoji: '🎯' },
        { key: 'evaluation', defaultName: 'Evaluación / Auto', defaultWeight: 10, emoji: '📝' }
    ];
    
    categoryConfigs.forEach(cfg => {
        const cat = academic.performances[cfg.key] || { name: cfg.defaultName, weight: cfg.defaultWeight, categories: [] };
        const catAvg = (academic.averages && academic.averages[cfg.key]) ? Number(academic.averages[cfg.key]).toFixed(2) : "0.00";
        const progressPct = Math.min(100, (Number(catAvg) / 5.0) * 100);
        
        let activitiesHtml = '';
        if (cat.categories && cat.categories.length > 0) {
            cat.categories.forEach((act, idx) => {
                const actGrade = Number(act.grade || 0).toFixed(1);
                const actPassed = actGrade >= 3.4;
                activitiesHtml += `
                    <div class="activity-row">
                        <div class="activity-label-wrap">
                            <span class="activity-title">${act.desc || 'Actividad #' + (idx + 1)}</span>
                            <span class="activity-meta">Peso: ${act.weight}% en la categoría</span>
                        </div>
                        <div class="activity-score-wrap">
                            <span class="activity-score-num" style="color: ${actPassed ? 'var(--text-color)' : '#ff5252'};">${actGrade}</span>
                            <button class="activity-del-btn" onclick="window.notasAppDashboard.deleteGrade('${cfg.key}', ${idx})" title="Eliminar calificación">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            activitiesHtml = `<div style="font-size: 12px; color: var(--text-muted); font-style: italic; text-align: center; padding: 10px 0;">Sin notas registradas en esta categoría</div>`;
        }
        
        const catCard = document.createElement('div');
        catCard.className = 'category-card';
        catCard.innerHTML = `
            <div>
                <div class="category-card-top">
                    <div class="category-title-group">
                        <span style="font-size: 16px;">${cfg.emoji}</span>
                        <span class="category-card-title">${cat.name || cfg.defaultName}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="category-weight-badge">${cat.weight || cfg.defaultWeight}%</span>
                        <span class="category-score-num">${catAvg}</span>
                    </div>
                </div>
                
                <div class="progress-track" style="margin: 8px 0 10px;">
                    <div class="progress-fill" style="width: ${progressPct}%;"></div>
                </div>
                
                <div class="activities-container">
                    ${activitiesHtml}
                </div>
            </div>
            
            <button class="btn-add-grade-inline" onclick="window.notasAppDashboard.openGradeEditor('${cfg.key}')">
                <i class="fa-solid fa-plus"></i> Agregar nota
            </button>
        `;
        
        perfList.appendChild(catCard);
    });
}

function editAcademic() {
    const academic = academicsList.find(a => a.id === currentAcademicId);
    if (!academic) return;
    
    document.getElementById('academic-modal-title').textContent = 'Editar Asignatura';
    document.getElementById('academic-id').value = academic.id;
    document.getElementById('academic-emoji').value = academic.emoji || '📚';
    document.getElementById('academic-name').value = academic.name;
    document.getElementById('academic-teacher').value = academic.teacher || '';
    document.getElementById('academic-period').value = academic.period || '1';
    
    const modal = document.getElementById('academic-editor-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function openGradeEditor(defaultCategory = 'cognitive') {
    document.getElementById('grade-category').value = defaultCategory;
    document.getElementById('grade-desc').value = '';
    document.getElementById('grade-value').value = '';
    document.getElementById('grade-weight').value = '50';
    
    const modal = document.getElementById('grade-editor-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeGradeEditor() {
    const modal = document.getElementById('grade-editor-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 250);
}

async function saveGrade() {
    if (!currentAcademicId) return;
    
    const catId = document.getElementById('grade-category').value;
    const desc = document.getElementById('grade-desc').value.trim();
    const value = parseFloat(document.getElementById('grade-value').value);
    const weight = parseInt(document.getElementById('grade-weight').value);
    
    if (isNaN(value) || value < 0 || value > 5.0) {
        UIManager.showToast('La calificación debe estar entre 0.0 y 5.0', 'error');
        return;
    }
    if (isNaN(weight) || weight <= 0 || weight > 100) {
        UIManager.showToast('El peso debe estar entre 1% y 100%', 'error');
        return;
    }

    const academic = academicsList.find(a => a.id === currentAcademicId);
    if (!academic) return;

    const btn = document.getElementById('save-grade-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';
    btn.disabled = true;

    try {
        const perfs = JSON.parse(JSON.stringify(academic.performances || DEFAULT_PERFORMANCES));
        if (!perfs[catId]) {
            perfs[catId] = { name: catId, weight: 25, categories: [] };
        }
        if (!perfs[catId].categories) {
            perfs[catId].categories = [];
        }
        
        perfs[catId].categories.push({
            desc: desc || `Actividad #${perfs[catId].categories.length + 1}`,
            grade: value,
            weight: weight,
            date: Date.now()
        });
        
        // Recalcular promedios
        const finalAvg = calculateSubjectAverage(perfs);
        
        // Calcular promedio de la categoría
        let catScore = 0;
        let catWeight = 0;
        perfs[catId].categories.forEach(g => {
            const w = Number(g.weight) || 0;
            const gr = Number(g.grade) || 0;
            catScore += (gr * (w / 100));
            catWeight += w;
        });
        const catAvg = catWeight > 0 ? (catScore / (catWeight / 100)) : 0;
        
        const newAverages = {
            ...(academic.averages || {}),
            [catId]: catAvg,
            final: finalAvg
        };
        
        const updates = { performances: perfs, averages: newAverages };
        const updated = await NotesService.updateAcademic(currentUser.uid, currentAcademicId, updates, academic);
        
        academicsList = academicsList.map(n => n.id === currentAcademicId ? updated : n);
        
        UIManager.showToast('Calificación registrada', 'success');
        closeGradeEditor();
        renderSubjectDetail(currentAcademicId);
        updateSummaryCard();
    } catch (error) {
        console.error(error);
        UIManager.showToast('Error al registrar calificación', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function deleteGrade(categoryKey, index) {
    if (!currentAcademicId) return;
    if (!confirm('¿Deseas eliminar esta calificación?')) return;
    
    const academic = academicsList.find(a => a.id === currentAcademicId);
    if (!academic || !academic.performances || !academic.performances[categoryKey]) return;
    
    try {
        const perfs = JSON.parse(JSON.stringify(academic.performances));
        perfs[categoryKey].categories.splice(index, 1);
        
        const finalAvg = calculateSubjectAverage(perfs);
        
        let catScore = 0;
        let catWeight = 0;
        perfs[categoryKey].categories.forEach(g => {
            const w = Number(g.weight) || 0;
            const gr = Number(g.grade) || 0;
            catScore += (gr * (w / 100));
            catWeight += w;
        });
        const catAvg = catWeight > 0 ? (catScore / (catWeight / 100)) : 0;
        
        const newAverages = {
            ...(academic.averages || {}),
            [categoryKey]: catAvg,
            final: finalAvg
        };
        
        const updates = { performances: perfs, averages: newAverages };
        const updated = await NotesService.updateAcademic(currentUser.uid, currentAcademicId, updates, academic);
        
        academicsList = academicsList.map(n => n.id === currentAcademicId ? updated : n);
        
        UIManager.showToast('Calificación eliminada', 'info');
        renderSubjectDetail(currentAcademicId);
        updateSummaryCard();
    } catch (error) {
        console.error(error);
        UIManager.showToast('Error al eliminar calificación', 'error');
    }
}

async function deleteAcademic() {
    if (!currentAcademicId) return;
    const academic = academicsList.find(a => a.id === currentAcademicId);
    if (!academic) return;
    
    if (!confirm(`¿Estás seguro de eliminar "${academic.name}" y todas sus calificaciones? Esta acción no se puede deshacer.`)) return;
    
    try {
        await NotesService.deleteAcademic(currentAcademicId, academic.publicId);
        academicsList = academicsList.filter(n => n.id !== currentAcademicId);
        
        UIManager.showToast('Asignatura eliminada', 'success');
        closeAcademicDetail();
    } catch (error) {
        UIManager.showToast('Error al eliminar', 'error');
    }
}

function filterAcademics() {
    const searchEl = document.getElementById('search-input');
    const searchTerm = searchEl ? searchEl.value.toLowerCase().trim() : '';
    
    if (searchTerm) {
        filteredAcademics = academicsList.filter(n => 
            (n.name && n.name.toLowerCase().includes(searchTerm)) || 
            (n.teacher && n.teacher.toLowerCase().includes(searchTerm))
        );
    } else {
        filteredAcademics = [...academicsList];
    }
    
    renderAcademics(filteredAcademics);
    updateSummaryCard();
}

function openShareModal() {
    const modal = document.getElementById('share-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeShareModal() {
    const modal = document.getElementById('share-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 250);
    
    document.getElementById('share-link-container').style.display = 'none';
    document.getElementById('generate-link-btn').style.display = 'block';
}

async function generateShareLink() {
    if (!currentAcademicId) return;
    
    const academic = academicsList.find(n => n.id === currentAcademicId);
    if (!academic) return;

    if (academic.shared && academic.publicId) {
        showShareLink(academic.publicId);
        return;
    }
    
    const btn = document.getElementById('generate-link-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
    btn.disabled = true;
    
    try {
        // Snapshot público del boletín de calificaciones
        const publicData = {
            studentName: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Estudiante'),
            subject: academic.name,
            emoji: academic.emoji || '📚',
            teacher: academic.teacher || 'Sin profesor asignado',
            period: academic.period || '1',
            finalAverage: Number(academic.averages?.final || 0),
            performances: academic.performances || DEFAULT_PERFORMANCES,
            averages: academic.averages || {},
            createdAt: Date.now()
        };

        const publicId = await NotesService.generateShareLink(currentAcademicId, currentUser.uid, publicData);
        academic.shared = true;
        academic.publicId = publicId;
        
        showShareLink(publicId);
        UIManager.showToast("¡Enlace generado exitosamente!", "success");
    } catch (error) {
        console.error(error);
        UIManager.showToast("Error al generar enlace", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function showShareLink(publicId) {
    const linkContainer = document.getElementById('share-link-container');
    const linkInput = document.getElementById('share-link-input');
    const generateBtn = document.getElementById('generate-link-btn');
    
    const isNotasHost = window.location.host.includes('notas.happycorner.top');
    const shareUrl = isNotasHost
        ? `https://notas.happycorner.top/shared/${publicId}`
        : `${window.location.origin}/notas-corner/shared/${publicId}`;
        
    linkInput.value = shareUrl;
    generateBtn.style.display = 'none';
    linkContainer.style.display = 'block';
}

function copyShareLink() {
    const linkInput = document.getElementById('share-link-input');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(linkInput.value);
    UIManager.showToast("Enlace copiado al portapapeles", "success");
}

function importAcademics(event) {
    UIManager.showToast('Importación .happyc disponible próximamente', 'info');
}

function switchTab(tabId) {
    // Tab selector
}
