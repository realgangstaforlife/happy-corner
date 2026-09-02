import { auth, signOut } from './modules/auth.js';
import { NotesService } from './modules/notes-service.js';
import { StorageService } from './modules/storage.js';
import { UIManager } from './modules/ui-manager.js';

let currentUser = null;
let academicsList = [];
let filteredAcademics = [];
let currentAcademicId = null;

export function initDashboard(user) {
    currentUser = user;
    
    const title = document.getElementById('welcome-title');
    if (title) {
        title.innerHTML = `Hola, <span style="color: var(--hp-pink);">${user.displayName || user.email.split('@')[0]}</span> 👋`;
    }
    
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

    loadAcademics();
    
    // Exponer funciones globales
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

function calculateSubjectAverage(performances) {
    if (!performances) return 0.00;
    
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const [key, category] of Object.entries(performances)) {
        if (!category.categories || category.categories.length === 0) continue;
        
        let catScore = 0;
        let catWeight = 0;
        
        category.categories.forEach(grade => {
            catScore += (grade.grade * (grade.weight / 100));
            catWeight += grade.weight;
        });
        
        // Promedio de esta categoría
        const catAvg = catWeight > 0 ? (catScore / (catWeight / 100)) : 0;
        
        // Ponderarlo al peso global de la categoría (ej: 45%)
        totalScore += (catAvg * (category.weight / 100));
        totalWeight += category.weight;
    }
    
    return totalWeight > 0 ? (totalScore / (totalWeight / 100)) : 0.00;
}

function updateSummaryCard() {
    document.getElementById('total-subjects').textContent = academicsList.length;
    
    if (academicsList.length === 0) {
        document.getElementById('gpa-score').textContent = "0.00";
        document.getElementById('best-subject').textContent = "--";
        document.getElementById('worst-subject').textContent = "--";
        return;
    }
    
    let totalGPA = 0;
    let best = { name: "--", score: -1 };
    let worst = { name: "--", score: 6 };
    
    academicsList.forEach(subject => {
        const avg = subject.averages?.final || 0;
        totalGPA += avg;
        
        if (avg > best.score) best = { name: subject.name, score: avg };
        if (avg < worst.score) worst = { name: subject.name, score: avg };
    });
    
    const finalGPA = (totalGPA / academicsList.length).toFixed(2);
    document.getElementById('gpa-score').textContent = finalGPA;
    document.getElementById('best-subject').textContent = `${best.score.toFixed(1)} (${best.name})`;
    document.getElementById('worst-subject').textContent = worst.score === 6 ? "--" : `${worst.score.toFixed(1)} (${worst.name})`;
}

function renderAcademics(academics) {
    const grid = document.getElementById('notes-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (academics.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-graduation-cap" style="font-size: 40px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>No tienes asignaturas registradas. ¡Crea la primera!</p>
            </div>
        `;
        return;
    }

    academics.forEach(item => {
        const finalScore = (item.averages?.final || 0).toFixed(2);
        const color = finalScore >= 3.4 ? 'var(--hp-pink)' : 'var(--error)';
        
        const card = document.createElement('div');
        card.className = 'note-card';
        card.innerHTML = `
            <div class="note-header" style="justify-content: flex-start; gap: 10px;">
                <div style="font-size: 24px;">${item.emoji || '📚'}</div>
                <h3 class="note-title" style="margin-bottom: 0;">${item.name}</h3>
            </div>
            <div class="note-content" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <div>
                    <div style="font-size: 12px; color: var(--text-muted);">${item.teacher || 'Sin profesor'}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${item.period || '-'}</div>
                </div>
                <div style="font-size: 24px; font-weight: 700; color: ${color};">
                    ${finalScore}
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => openAcademicDetail(item.id));
        grid.appendChild(card);
    });
}

function openAcademicEditor() {
    document.getElementById('academic-id').value = '';
    document.getElementById('academic-emoji').value = '📚';
    document.getElementById('academic-name').value = '';
    document.getElementById('academic-teacher').value = '';
    document.getElementById('academic-period').value = '2024-2';
    
    const modal = document.getElementById('academic-editor-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeAcademicEditor() {
    const modal = document.getElementById('academic-editor-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 300);
}

async function saveAcademic() {
    const id = document.getElementById('academic-id').value;
    const emoji = document.getElementById('academic-emoji').value;
    const name = document.getElementById('academic-name').value.trim();
    const teacher = document.getElementById('academic-teacher').value.trim();
    const period = document.getElementById('academic-period').value.trim();
    
    if (!name) {
        UIManager.showToast('El nombre de la asignatura es requerido', 'error');
        return;
    }

    const btn = document.getElementById('save-academic-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
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
            // Create new
            const defaultPerformances = {
                cognitive: { name: "Saber (Cognitivo)", weight: 45, categories: [] },
                procedural: { name: "Hacer (Procedimental)", weight: 35, categories: [] },
                attitudinal: { name: "Ser (Actitudinal)", weight: 20, categories: [] }
            };
            
            const newData = {
                name, emoji, teacher, period,
                performances: defaultPerformances,
                averages: { cognitive: 0, procedural: 0, attitudinal: 0, final: 0 }
            };
            
            const created = await NotesService.createAcademic(currentUser.uid, newData);
            academicsList.unshift(created);
            UIManager.showToast('Asignatura creada', 'success');
        }
        
        closeAcademicEditor();
        filterAcademics(); // Re-render and update summary
        
        if (id) {
            // Si estábamos en detalle, actualizarlo
            closeAcademicDetail();
            setTimeout(() => openAcademicDetail(id), 300);
        }
    } catch (error) {
        UIManager.showToast('Error al guardar', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function openAcademicDetail(id) {
    currentAcademicId = id;
    const academic = academicsList.find(a => a.id === id);
    if (!academic) return;
    
    document.getElementById('detail-title').textContent = `${academic.emoji} ${academic.name}`;
    document.getElementById('detail-subtitle').textContent = `${academic.teacher} | ${academic.period}`;
    
    const finalScore = (academic.averages?.final || 0).toFixed(2);
    const scoreEl = document.getElementById('detail-final-score');
    scoreEl.textContent = finalScore;
    scoreEl.style.color = finalScore >= 3.4 ? 'var(--hp-pink)' : 'var(--error)';
    
    const perfList = document.getElementById('detail-performances-list');
    perfList.innerHTML = '';
    
    // Renderizar cada desempeño
    if (academic.performances) {
        for (const [key, category] of Object.entries(academic.performances)) {
            const catAvg = (academic.averages && academic.averages[key]) ? academic.averages[key].toFixed(2) : "0.00";
            
            let html = `
                <div style="margin-bottom: 15px; background: var(--input-bg); padding: 15px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 10px;">
                        <span>${category.name} (${category.weight}%)</span>
                        <span>${catAvg}</span>
                    </div>
            `;
            
            if (category.categories && category.categories.length > 0) {
                category.categories.forEach(grade => {
                    html += `
                        <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-muted); padding: 4px 0; border-top: 1px solid var(--border-color);">
                            <span>${grade.desc || 'Actividad'} (${grade.weight}%)</span>
                            <span>${grade.grade.toFixed(1)}</span>
                        </div>
                    `;
                });
            } else {
                html += `<div style="font-size: 13px; color: var(--text-muted); font-style: italic;">Sin calificaciones</div>`;
            }
            
            html += `</div>`;
            perfList.innerHTML += html;
        }
    }
    
    const modal = document.getElementById('academic-detail-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeAcademicDetail() {
    currentAcademicId = null;
    const modal = document.getElementById('academic-detail-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 300);
}

function editAcademic() {
    const academic = academicsList.find(a => a.id === currentAcademicId);
    if (!academic) return;
    
    document.getElementById('academic-id').value = academic.id;
    document.getElementById('academic-emoji').value = academic.emoji || '📚';
    document.getElementById('academic-name').value = academic.name;
    document.getElementById('academic-teacher').value = academic.teacher || '';
    document.getElementById('academic-period').value = academic.period || '';
    
    const modal = document.getElementById('academic-editor-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function openGradeEditor() {
    document.getElementById('grade-desc').value = '';
    document.getElementById('grade-value').value = '';
    document.getElementById('grade-weight').value = '';
    
    const modal = document.getElementById('grade-editor-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeGradeEditor() {
    const modal = document.getElementById('grade-editor-modal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 300);
}

async function saveGrade() {
    if (!currentAcademicId) return;
    
    const catId = document.getElementById('grade-category').value;
    const desc = document.getElementById('grade-desc').value.trim();
    const value = parseFloat(document.getElementById('grade-value').value);
    const weight = parseInt(document.getElementById('grade-weight').value);
    
    if (isNaN(value) || value < 0 || value > 5.0) {
        UIManager.showToast('La calificación debe estar entre 0 y 5.0', 'error');
        return;
    }
    if (isNaN(weight) || weight <= 0 || weight > 100) {
        UIManager.showToast('El peso debe estar entre 1 y 100', 'error');
        return;
    }

    const academic = academicsList.find(a => a.id === currentAcademicId);
    if (!academic) return;

    const btn = document.getElementById('save-grade-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        // Deep copy of performances
        const perfs = JSON.parse(JSON.stringify(academic.performances));
        perfs[catId].categories.push({
            desc: desc,
            grade: value,
            weight: weight
        });
        
        // Recalcular promedios
        const finalAvg = calculateSubjectAverage(perfs);
        
        // Calcular promedio de la categoría específica
        let catScore = 0;
        let catWeight = 0;
        perfs[catId].categories.forEach(g => {
            catScore += (g.grade * (g.weight / 100));
            catWeight += g.weight;
        });
        const catAvg = catWeight > 0 ? (catScore / (catWeight / 100)) : 0;
        
        const newAverages = {
            ...academic.averages,
            [catId]: catAvg,
            final: finalAvg
        };
        
        const updates = { performances: perfs, averages: newAverages };
        
        const updated = await NotesService.updateAcademic(currentUser.uid, currentAcademicId, updates, academic);
        
        academicsList = academicsList.map(n => n.id === currentAcademicId ? updated : n);
        
        UIManager.showToast('Calificación registrada', 'success');
        closeGradeEditor();
        filterAcademics();
        
        // Refrescar detalle
        closeAcademicDetail();
        setTimeout(() => openAcademicDetail(currentAcademicId), 300);
        
    } catch (error) {
        console.error(error);
        UIManager.showToast('Error al registrar calificación', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function deleteAcademic() {
    if (!currentAcademicId) return;
    if (!confirm('¿Estás seguro de que deseas eliminar esta asignatura y todas sus calificaciones?')) return;
    
    const academic = academicsList.find(a => a.id === currentAcademicId);
    
    try {
        await NotesService.deleteAcademic(currentAcademicId, academic.publicId);
        academicsList = academicsList.filter(n => n.id !== currentAcademicId);
        
        UIManager.showToast('Asignatura eliminada', 'success');
        closeAcademicDetail();
        filterAcademics();
    } catch (error) {
        UIManager.showToast('Error al eliminar', 'error');
    }
}

function filterAcademics() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    if (searchTerm) {
        filteredAcademics = academicsList.filter(n => 
            n.name.toLowerCase().includes(searchTerm) || 
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
    setTimeout(() => modal.style.display = 'none', 300);
    
    document.getElementById('share-link-container').style.display = 'none';
    document.getElementById('generate-link-btn').style.display = 'block';
}

async function generateShareLink() {
    if (!currentAcademicId) return;
    
    const academic = academicsList.find(n => n.id === currentAcademicId);
    if (academic.shared && academic.publicId) {
        showShareLink(academic.publicId);
        return;
    }
    
    const btn = document.getElementById('generate-link-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;
    
    try {
        // Preparar "Transcript" público (sin datos supersensibles)
        const publicData = {
            studentName: currentUser.displayName || currentUser.email.split('@')[0],
            subject: academic.name,
            period: academic.period,
            gpa: academic.averages?.final || 0,
            performances: {
                cognitive: academic.averages?.cognitive || 0,
                procedural: academic.averages?.procedural || 0,
                attitudinal: academic.averages?.attitudinal || 0
            }
        };

        const publicId = await NotesService.generateShareLink(currentAcademicId, currentUser.uid, publicData);
        academic.shared = true;
        academic.publicId = publicId;
        
        showShareLink(publicId);
        UIManager.showToast("¡Enlace generado exitosamente!", "success");
    } catch (error) {
        UIManager.showToast("Error al generar enlace", "error");
        btn.innerHTML = 'Generar enlace público';
        btn.disabled = false;
    }
}

function showShareLink(publicId) {
    const linkContainer = document.getElementById('share-link-container');
    const linkInput = document.getElementById('share-link-input');
    const generateBtn = document.getElementById('generate-link-btn');
    
    const shareUrl = `${window.location.origin}/notas-corner/shared/${publicId}`;
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
    // Implementación stubbed para .happyc import
    UIManager.showToast('Importación .happyc será implementada pronto', 'info');
}

function switchTab(tabId) {
    // Only one tab in MVP
}
