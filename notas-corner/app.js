// ==========================================
// ESTADO GLOBAL
// ==========================================
let appData = {
    settings: {
        saber: 50,
        hacer: 40,
        ser: 10
    },
    subjects: []
};

// Cargar de LocalStorage (temporal, antes de Firebase)
const savedData = localStorage.getItem('happyNotasData');
if (savedData) {
    try {
        appData = JSON.parse(savedData);
    } catch (e) {
        console.error("Error parsing saved data");
    }
}

function saveData() {
    localStorage.setItem('happyNotasData', JSON.stringify(appData));
}

// ==========================================
// ROUTER BÁSICO (Detectar página actual)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    if (path.includes('dashboard')) {
        initDashboard();
    } else if (path.includes('subject')) {
        initSubject();
    } else {
        // Default to index if not on dashboard or subject
        initIndex();
    }
});

// ==========================================
// INICIO (index.html)
// ==========================================
function initIndex() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    // Aquí iría el desencriptado, por ahora parseamos JSON
                    const data = JSON.parse(event.target.result);
                    if (data.settings && data.subjects) {
                        localStorage.setItem('happyNotasData', JSON.stringify(data));
                        window.location.href = 'dashboard.html';
                    } else {
                        alert("Archivo inválido.");
                    }
                } catch (e) {
                    alert("Error leyendo el archivo.");
                }
            };
            reader.readAsText(file);
        });
        
        const btnUpload = document.getElementById('btnUpload');
        if (btnUpload) {
            btnUpload.addEventListener('click', () => {
                fileInput.click();
            });
        }
    }
    
    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            window.location.href = 'https://happycorner.top/login.html?returnUrl=https://notas.happycorner.top/dashboard.html';
        });
    }

    const btnRegister = document.getElementById('btnRegister');
    if (btnRegister) {
        btnRegister.addEventListener('click', () => {
            window.location.href = 'https://happycorner.top/login.html?mode=register&returnUrl=https://notas.happycorner.top/dashboard.html';
        });
    }
}

// ==========================================
// DASHBOARD (dashboard.html)
// ==========================================
function initDashboard() {
    renderSubjects();
    
    // Configuración
    const btnSettings = document.getElementById('btnSettings');
    const settingsModal = document.getElementById('settingsModal');
    const btnCancelSettings = document.getElementById('btnCancelSettings');
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    
    const inpSaber = document.getElementById('percSaber');
    const inpHacer = document.getElementById('percHacer');
    const inpSer = document.getElementById('percSer');
    const totalPercentageBox = document.getElementById('totalPercentage');
    const warningMsg = document.getElementById('warningMsg');
    const timerCount = document.getElementById('timerCount');
    
    let timerInterval = null;
    let canSaveUnbalanced = false;

    btnSettings.addEventListener('click', () => {
        inpSaber.value = appData.settings.saber;
        inpHacer.value = appData.settings.hacer;
        inpSer.value = appData.settings.ser;
        updateTotal();
        settingsModal.classList.add('active');
    });
    
    btnCancelSettings.addEventListener('click', () => {
        settingsModal.classList.remove('active');
        clearInterval(timerInterval);
    });
    
    function updateTotal() {
        const s = parseInt(inpSaber.value) || 0;
        const h = parseInt(inpHacer.value) || 0;
        const r = parseInt(inpSer.value) || 0;
        const total = s + h + r;
        totalPercentageBox.innerText = total;
        
        if (total !== 100) {
            warningMsg.style.display = 'block';
            btnSaveSettings.disabled = true;
            btnSaveSettings.style.opacity = '0.5';
            canSaveUnbalanced = false;
            
            let time = 10;
            timerCount.innerText = time;
            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                time--;
                timerCount.innerText = time;
                if (time <= 0) {
                    clearInterval(timerInterval);
                    btnSaveSettings.disabled = false;
                    btnSaveSettings.style.opacity = '1';
                    canSaveUnbalanced = true;
                    timerCount.innerText = '0';
                }
            }, 1000);
        } else {
            warningMsg.style.display = 'none';
            clearInterval(timerInterval);
            btnSaveSettings.disabled = false;
            btnSaveSettings.style.opacity = '1';
            canSaveUnbalanced = true;
        }
    }
    
    inpSaber.addEventListener('input', updateTotal);
    inpHacer.addEventListener('input', updateTotal);
    inpSer.addEventListener('input', updateTotal);
    
    btnSaveSettings.addEventListener('click', () => {
        if (!canSaveUnbalanced && parseInt(totalPercentageBox.innerText) !== 100) return;
        appData.settings.saber = parseInt(inpSaber.value) || 0;
        appData.settings.hacer = parseInt(inpHacer.value) || 0;
        appData.settings.ser = parseInt(inpSer.value) || 0;
        saveData();
        settingsModal.classList.remove('active');
    });

    // Añadir Materia
    const btnAddSubject = document.getElementById('btnAddSubject');
    const subjectModal = document.getElementById('subjectModal');
    const btnCancelSub = document.getElementById('btnCancelSub');
    const btnSaveSub = document.getElementById('btnSaveSub');
    const subEmoji = document.getElementById('subEmoji');
    const subName = document.getElementById('subName');
    
    btnAddSubject.addEventListener('click', () => {
        subEmoji.value = '📚';
        subName.value = '';
        subjectModal.classList.add('active');
    });
    
    btnCancelSub.addEventListener('click', () => subjectModal.classList.remove('active'));
    
    btnSaveSub.addEventListener('click', () => {
        if (!subName.value.trim()) return alert("El nombre es requerido");
        const newSub = {
            id: Date.now().toString(),
            name: subName.value.trim(),
            emoji: subEmoji.value || '📚',
            grades: { saber: [], hacer: [], ser: [] }
        };
        appData.subjects.push(newSub);
        saveData();
        renderSubjects();
        subjectModal.classList.remove('active');
    });
    
    // Exportar
    const btnExport = document.getElementById('btnExport');
    btnExport.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData));
        const anchor = document.createElement('a');
        anchor.href = dataStr;
        anchor.download = "mis_notas.happyc";
        anchor.click();
    });
}

function renderSubjects() {
    const container = document.getElementById('subjectsContainer');
    if (!container) return;
    container.innerHTML = '';
    
    appData.subjects.forEach(sub => {
        const div = document.createElement('div');
        div.className = 'card subject-card';
        div.innerHTML = `
            <div class="emoji">${sub.emoji}</div>
            <h4 style="font-size: 18px;">${sub.name}</h4>
            <div class="delete-btn" onclick="deleteSubject(event, '${sub.id}')"><i class="fa-solid fa-trash"></i></div>
        `;
        div.onclick = () => {
            window.location.href = `subject.html?id=${sub.id}`;
        };
        container.appendChild(div);
    });
}

window.deleteSubject = function(event, id) {
    event.stopPropagation();
    if(confirm("¿Seguro que deseas eliminar esta materia?")) {
        appData.subjects = appData.subjects.filter(s => s.id !== id);
        saveData();
        renderSubjects();
    }
};

// ==========================================
// MATERIA (subject.html)
// ==========================================
let currentSubId = null;
let currentSubIndex = -1;

function initSubject() {
    const urlParams = new URLSearchParams(window.location.search);
    currentSubId = urlParams.get('id');
    currentSubIndex = appData.subjects.findIndex(s => s.id === currentSubId);
    
    if (currentSubIndex === -1) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    const sub = appData.subjects[currentSubIndex];
    document.getElementById('subjectTitle').innerText = sub.emoji + ' ' + sub.name;
    
    document.getElementById('percSaberLabel').innerText = `(${appData.settings.saber}%)`;
    document.getElementById('percHacerLabel').innerText = `(${appData.settings.hacer}%)`;
    document.getElementById('percSerLabel').innerText = `(${appData.settings.ser}%)`;
    
    renderGrades();
}

window.addGrade = function(category) {
    const sub = appData.subjects[currentSubIndex];
    sub.grades[category].push({
        id: Date.now().toString(),
        label: `Nota ${sub.grades[category].length + 1}`,
        value: 0
    });
    saveData();
    renderGrades();
};

window.updateGradeLabel = function(category, gradeId, val) {
    const sub = appData.subjects[currentSubIndex];
    const grade = sub.grades[category].find(g => g.id === gradeId);
    if(grade) grade.label = val;
    saveData();
};

window.updateGradeValue = function(category, gradeId, val) {
    const sub = appData.subjects[currentSubIndex];
    const grade = sub.grades[category].find(g => g.id === gradeId);
    if(grade) {
        let num = parseFloat(val);
        if(isNaN(num)) num = 0;
        if(num > 5) num = 5; // Asumiendo escala de 1 a 5. Se puede configurar después.
        grade.value = num;
    }
    saveData();
    renderGrades(true); // true para no perder focus
};

window.deleteGrade = function(category, gradeId) {
    const sub = appData.subjects[currentSubIndex];
    sub.grades[category] = sub.grades[category].filter(g => g.id !== gradeId);
    saveData();
    renderGrades();
};

function renderGrades(skipFocusLoss = false) {
    const sub = appData.subjects[currentSubIndex];
    let avgs = { saber: 0, hacer: 0, ser: 0 };
    
    ['saber', 'hacer', 'ser'].forEach(cat => {
        const listDiv = document.getElementById(`list${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
        
        if (!skipFocusLoss) {
            listDiv.innerHTML = '';
            let sum = 0;
            
            sub.grades[cat].forEach(grade => {
                sum += parseFloat(grade.value) || 0;
                
                const item = document.createElement('div');
                item.className = 'grade-item';
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; width: 60%;">
                        <button onclick="deleteGrade('${cat}', '${grade.id}')" style="background: transparent; color: #ff4d4d; border-radius: 5px; padding: 5px;"><i class="fa-solid fa-trash"></i></button>
                        <input type="text" value="${grade.label}" onchange="updateGradeLabel('${cat}', '${grade.id}', this.value)" style="background: transparent; border: none; font-size: 14px; font-weight: bold; width: 100%; color: var(--text-color);">
                    </div>
                    <input type="number" class="grade-input" step="0.1" max="5" value="${grade.value}" onchange="updateGradeValue('${cat}', '${grade.id}', this.value)">
                `;
                listDiv.appendChild(item);
            });
            
            avgs[cat] = sub.grades[cat].length ? (sum / sub.grades[cat].length) : 0;
            document.getElementById(`avg${cat.charAt(0).toUpperCase() + cat.slice(1)}`).innerText = avgs[cat].toFixed(1);
        } else {
            // Only update averages if skipping focus loss
            let sum = 0;
            sub.grades[cat].forEach(grade => sum += parseFloat(grade.value) || 0);
            avgs[cat] = sub.grades[cat].length ? (sum / sub.grades[cat].length) : 0;
            document.getElementById(`avg${cat.charAt(0).toUpperCase() + cat.slice(1)}`).innerText = avgs[cat].toFixed(1);
        }
    });
    
    // Calcular nota final
    const s = appData.settings;
    const final = (avgs.saber * (s.saber/100)) + (avgs.hacer * (s.hacer/100)) + (avgs.ser * (s.ser/100));
    document.getElementById('finalGrade').innerText = final.toFixed(1);
}
