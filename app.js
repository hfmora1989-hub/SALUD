/* ==========================================================================
   HEALTH ANALYTICS PLATFORM - CORE LÓGICA (app.js)
   ========================================================================== */

// Helper de formateo de valores clínicos según su métrica y precisión estándar
function formatClinicalValue(val, key) {
    if (val === undefined || val === null || isNaN(val)) return "--";
    let decimals = 1;
    if (key === 'creatinina' || key === 'colesterol_total' || key === 'glucosa' || key === 'ldl' || key === 'hdl' || key === 'trigliceridos') {
        decimals = 2;
    }
    return parseFloat(val).toFixed(decimals);
}

// 1. BASE DE RANGOS CLÍNICOS DE REFERENCIA
const CLINICAL_RANGES = {
    glucosa: {
        name: "Glucosa",
        unit: "mg/dL",
        getNormalRange: (profile) => ({ min: 70, max: 100 }),
        evaluate: (val, profile) => {
            if (val < 55) return { status: "Crítico (Bajo)", state: "critical", note: "Posible hipoglucemia severa." };
            if (val < 70) return { status: "Alterado (Bajo)", state: "altered", note: "Nivel de azúcar bajo." };
            if (val <= 100) return { status: "Normal", state: "normal" };
            if (val < 250) return { status: "Alterado (Alto)", state: "altered", note: "Criterio de prediabetes o diabetes en control." };
            return { status: "Crítico (Alto)", state: "critical", note: "Hiperglucemia severa. Requiere atención inmediata." };
        }
    },
    hba1c: {
        name: "HbA1c (Hemoglobina Glicosilada)",
        unit: "%",
        getNormalRange: (profile) => ({ min: 4.0, max: 5.6 }),
        evaluate: (val, profile) => {
            if (val < 4.0) return { status: "Alterado (Bajo)", state: "altered" };
            if (val <= 5.6) return { status: "Normal", state: "normal" };
            if (val <= 6.4) return { status: "Alterado (Prediabetes)", state: "altered", note: "Indica resistencia a la insulina." };
            if (val < 9.0) return { status: "Alterado (Diabetes)", state: "altered", note: "Nivel alto compatible con diagnóstico de diabetes." };
            return { status: "Crítico (Alto)", state: "critical", note: "Descontrol glucémico crónico grave." };
        }
    },
    colesterol_total: {
        name: "Colesterol Total",
        unit: "mg/dL",
        getNormalRange: (profile) => ({ min: 100, max: 199 }),
        evaluate: (val, profile) => {
            if (val < 100) return { status: "Alterado (Bajo)", state: "altered" };
            if (val < 200) return { status: "Normal", state: "normal" };
            if (val < 240) return { status: "Alterado (Alto)", state: "altered", note: "Hipercolesterolemia moderada." };
            return { status: "Crítico (Alto)", state: "critical", note: "Riesgo cardiovascular aumentado." };
        }
    },
    ldl: {
        name: "Colesterol LDL",
        unit: "mg/dL",
        getNormalRange: (profile) => {
            if (profile.diseases && profile.diseases.includes('diabetes')) return { min: 0, max: 70 };
            return { min: 0, max: 100 };
        },
        evaluate: (val, profile) => {
            const maxNormal = (profile.diseases && profile.diseases.includes('diabetes')) ? 70 : 100;
            if (val <= maxNormal) return { status: "Normal", state: "normal" };
            if (val < 160) return { status: "Alterado (Alto)", state: "altered", note: "Colesterol malo elevado." };
            return { status: "Crítico (Alto)", state: "critical", note: "Riesgo aterogénico alto." };
        }
    },
    hdl: {
        name: "Colesterol HDL",
        unit: "mg/dL",
        getNormalRange: (profile) => {
            return profile.sex === 'F' ? { min: 50, max: 90 } : { min: 40, max: 90 };
        },
        evaluate: (val, profile) => {
            const minNormal = profile.sex === 'F' ? 50 : 40;
            if (val < 35) return { status: "Crítico (Bajo)", state: "critical", note: "Protección cardiovascular deficiente." };
            if (val < minNormal) return { status: "Alterado (Bajo)", state: "altered", note: "Nivel subóptimo de colesterol bueno." };
            return { status: "Normal", state: "normal" };
        }
    },
    trigliceridos: {
        name: "Triglicéridos",
        unit: "mg/dL",
        getNormalRange: (profile) => ({ min: 30, max: 150 }),
        evaluate: (val, profile) => {
            if (val < 30) return { status: "Alterado (Bajo)", state: "altered" };
            if (val <= 150) return { status: "Normal", state: "normal" };
            if (val < 200) return { status: "Alterado (Alto)", state: "altered", note: "Hipertrigliceridemia moderada." };
            return { status: "Crítico (Alto)", state: "critical", note: "Riesgo aumentado de pancreatitis y eventos cardiovasculares." };
        }
    },
    creatinina: {
        name: "Creatinina",
        unit: "mg/dL",
        getNormalRange: (profile) => {
            return profile.sex === 'F' ? { min: 0.6, max: 1.1 } : { min: 0.7, max: 1.3 };
        },
        evaluate: (val, profile) => {
            const range = profile.sex === 'F' ? { min: 0.6, max: 1.1 } : { min: 0.7, max: 1.3 };
            if (val < range.min) return { status: "Alterado (Bajo)", state: "altered" };
            if (val <= range.max) return { status: "Normal", state: "normal" };
            if (val < 2.0) return { status: "Alterado (Alto)", state: "altered", note: "Posible disfunción renal leve o deshidratación." };
            return { status: "Crítico (Alto)", state: "critical", note: "Indicio de falla renal. Requiere valoración nefrológica." };
        }
    },
    tsh: {
        name: "TSH (Hormona Tiroidea)",
        unit: "mIU/L",
        getNormalRange: (profile) => {
            if (profile.pregnancy === 'S') return { min: 0.2, max: 3.0 };
            return { min: 0.4, max: 4.0 };
        },
        evaluate: (val, profile) => {
            const range = profile.pregnancy === 'S' ? { min: 0.2, max: 3.0 } : { min: 0.4, max: 4.0 };
            if (val < 0.1) return { status: "Crítico (Bajo)", state: "critical", note: "Hipertiroidismo severo." };
            if (val < range.min) return { status: "Alterado (Bajo)", state: "altered", note: "Supresión de TSH." };
            if (val <= range.max) return { status: "Normal", state: "normal" };
            if (val < 10.0) return { status: "Alterado (Alto)", state: "altered", note: "Hipotiroidismo leve o subclínico." };
            return { status: "Crítico (Alto)", state: "critical", note: "Hipotiroidismo clínico severo." };
        }
    },
    vitamina_d: {
        name: "Vitamina D (25-OH)",
        unit: "ng/mL",
        getNormalRange: (profile) => ({ min: 30, max: 100 }),
        evaluate: (val, profile) => {
            if (val < 12) return { status: "Crítico (Deficiencia Severa)", state: "critical", note: "Afecta la absorción de calcio y la inmunidad." };
            if (val < 30) return { status: "Alterado (Insuficiencia)", state: "altered", note: "Nivel subóptimo de vitamina D." };
            if (val <= 100) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Exceso)", state: "altered", note: "Nivel inusualmente elevado." };
        }
    },
    hemoglobina: {
        name: "Hemoglobina",
        unit: "g/dL",
        getNormalRange: (profile) => {
            return profile.sex === 'F' ? { min: 12.1, max: 15.1 } : { min: 13.8, max: 17.2 };
        },
        evaluate: (val, profile) => {
            const range = profile.sex === 'F' ? { min: 12.1, max: 15.1 } : { min: 13.8, max: 17.2 };
            if (val < 10.0) return { status: "Crítico (Bajo)", state: "critical", note: "Anemia severa." };
            if (val < range.min) return { status: "Alterado (Bajo)", state: "altered", note: "Anemia leve o ferropenia." };
            if (val <= range.max) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Posible policitemia o deshidratación." };
        }
    },
    ferritina: {
        name: "Ferritina",
        unit: "ng/mL",
        getNormalRange: (profile) => {
            return profile.sex === 'F' ? { min: 11, max: 307 } : { min: 24, max: 336 };
        },
        evaluate: (val, profile) => {
            const range = profile.sex === 'F' ? { min: 11, max: 307 } : { min: 24, max: 336 };
            if (val < 10) return { status: "Crítico (Bajo)", state: "critical", note: "Agotamiento total de reservas de hierro." };
            if (val < range.min) return { status: "Alterado (Bajo)", state: "altered", note: "Deficiencia de hierro." };
            if (val <= range.max) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Sobrecarga de hierro o inflamación." };
        }
    },
    peso: {
        name: "Peso Corporal",
        unit: "kg",
        getNormalRange: (profile) => {
            const hM = profile.height / 100;
            return { min: Math.round(18.5 * hM * hM), max: Math.round(24.9 * hM * hM) };
        },
        evaluate: (val, profile) => {
            const hM = profile.height / 100;
            const imc = val / (hM * hM);
            if (imc < 18.5) return { status: "Bajo Peso", state: "altered" };
            if (imc < 25.0) return { status: "Normal", state: "normal" };
            if (imc < 30.0) return { status: "Sobrepeso", state: "altered" };
            return { status: "Obesidad", state: "critical" };
        }
    },
    potasio: {
        name: "Potasio en Suero",
        unit: "mEq/L",
        getNormalRange: (profile) => ({ min: 3.3, max: 5.1 }),
        evaluate: (val, profile) => {
            if (val < 3.3) return { status: "Alterado (Bajo)", state: "altered", note: "Hipopotasemia." };
            if (val <= 5.1) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Hiperpotasemia." };
        }
    },
    sodio: {
        name: "Sodio en Suero",
        unit: "mEq/L",
        getNormalRange: (profile) => ({ min: 136.0, max: 145.0 }),
        evaluate: (val, profile) => {
            if (val < 136.0) return { status: "Alterado (Bajo)", state: "altered", note: "Hiponatremia." };
            if (val <= 145.0) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Hipernatremia." };
        }
    },
    alt_tgp: {
        name: "Alanino Amino Transferasa (ALT / TGP)",
        unit: "U/L",
        getNormalRange: (profile) => ({ min: 5, max: 41 }),
        evaluate: (val, profile) => {
            if (val <= 41) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Posible alteración hepática o enzimática." };
        }
    },
    ast_tgo: {
        name: "Aspartato Amino Transferasa (AST / TGO)",
        unit: "U/L",
        getNormalRange: (profile) => ({ min: 0, max: 40 }),
        evaluate: (val, profile) => {
            if (val <= 40) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Elevación de transaminasas." };
        }
    },
    ggt: {
        name: "Gama Glutamil Transferasa (GGT)",
        unit: "U/L",
        getNormalRange: (profile) => ({ min: 10, max: 71 }),
        evaluate: (val, profile) => {
            if (val <= 71) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Indicador de estrés biliar o hepático." };
        }
    },
    insulina: {
        name: "Insulina Basal",
        unit: "uUI/mL",
        getNormalRange: (profile) => ({ min: 2.6, max: 24.9 }),
        evaluate: (val, profile) => {
            if (val < 2.6) return { status: "Alterado (Bajo)", state: "altered" };
            if (val <= 24.9) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Posible hiperinsulinemia o resistencia a la insulina." };
        }
    },
    psa: {
        name: "Antígeno Prostático Específico (PSA)",
        unit: "ng/mL",
        getNormalRange: (profile) => ({ min: 0.0, max: 4.0 }),
        evaluate: (val, profile) => {
            if (val <= 4.0) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Requiere valoración urológica." };
        }
    },
    t4_libre: {
        name: "T4 Libre",
        unit: "ng/dL",
        getNormalRange: (profile) => ({ min: 0.92, max: 1.68 }),
        evaluate: (val, profile) => {
            if (val < 0.92) return { status: "Alterado (Bajo)", state: "altered" };
            if (val <= 1.68) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered" };
        }
    },
    acido_urico: {
        name: "Ácido Úrico en Suero",
        unit: "mg/dL",
        getNormalRange: (profile) => ({ min: 3.4, max: 7.0 }),
        evaluate: (val, profile) => {
            if (val < 3.4) return { status: "Alterado (Bajo)", state: "altered" };
            if (val <= 7.0) return { status: "Normal", state: "normal" };
            return { status: "Alterado (Alto)", state: "altered", note: "Hiperuricemia. Riesgo de gota o nefrolitiasis." };
        }
    },
    vitamina_b12: {
        name: "Vitamina B12",
        unit: "pg/mL",
        getNormalRange: (profile) => ({ min: 197, max: 771 }),
        evaluate: (val, profile) => {
            if (val < 197) return { status: "Alterado (Bajo)", state: "altered", note: "Deficiencia de vitamina B12. Riesgo de anemia o neuropatía." };
            if (val <= 771) return { status: "Normal", state: "normal" };
            return { status: "Alto", state: "normal" };
        }
    }
};

// 2. BASE DE CONOCIMIENTO CLÍNICO PARA RAG (CITAS DE GUÍAS)
const RAG_KNOWLEDGE = {
    diabetes: [
        { source: "American Diabetes Association (ADA) 2026", evidence: "Nivel de recomendación A. En pacientes con glucosa en ayunas >126 mg/dL o HbA1c >= 6.5%, se recomienda iniciar modificaciones intensivas de estilo de vida junto con terapia farmacológica. La metformina es de primera elección si no está contraindicada." },
        { source: "Guía de Práctica Clínica MinSalud Colombia", evidence: "Grado de evidencia 1A. En pacientes diabéticos, se debe priorizar el tamizaje de nefropatía diabética mediante la medición de creatinina y microalbuminuria anualmente." }
    ],
    hipertension: [
        { source: "American Heart Association (AHA) 2025", evidence: "Nivel de recomendación A. Presión arterial >= 130/80 mmHg define hipertensión etapa 1. Se prescribe restricción de sodio (< 2300 mg/día) y ejercicio aeróbico de 150 min/semana." },
        { source: "European Society of Cardiology (ESC) 2025", evidence: "Se desaconseja el ejercicio extenuante o de fuerza de alta intensidad en pacientes con presión arterial no controlada (>160/100 mmHg) hasta su estabilización farmacológica." }
    ],
    dislipidemia: [
        { source: "European Society of Cardiology (ESC) 2025 Dyslipidaemia Guidelines", evidence: "Clase I, Nivel A. En prevención primaria y según riesgo cardiovascular, el objetivo de colesterol LDL debe ser < 100 mg/dL. Para pacientes de muy alto riesgo o diabéticos tipo 2, el objetivo terapéutico de LDL es < 70 mg/dL." },
        { source: "American College of Sports Medicine (ACSM)", evidence: "El ejercicio aeróbico regular (caminata, bicicleta) a intensidad moderada aumenta significativamente las fracciones de colesterol HDL protector." }
    ],
    anemia: [
        { source: "Organización Mundial de la Salud (OMS)", evidence: "En adultos con niveles de hemoglobina < 12 g/dL (mujeres) o < 13 g/dL (hombres) se diagnostica anemia. La deficiencia de hierro (ferritina < 15 ng/mL) es la principal causa y requiere suplementación guiada." }
    ],
    renal: [
        { source: "KDIGO Clinical Practice Guideline for Diabetes and CKD", evidence: "En pacientes con creatinina sérica elevada y TFG reducida, se debe restringir el aporte excesivo de proteínas animales, evitar AINEs (como ibuprofeno) y ajustar dosis de medicamentos de excreción renal." }
    ],
    general: [
        { source: "Organización Mundial de la Salud (OMS) - Actividad Física", evidence: "Se recomiendan al menos 150 a 300 minutos de actividad física aeróbica de intensidad moderada a la semana para todos los adultos." }
    ]
};

// 3. MOCK EXAM TEMPLATES FOR QUICK TESTING
const EXAM_PRESETS = {
    healthy: {
        name: "Saludable y Estable",
        date: "2026-07-02",
        values: {
            glucosa: 88,
            hba1c: 5.2,
            colesterol_total: 175,
            ldl: 92,
            hdl: 55,
            trigliceridos: 110,
            creatinina: 0.8,
            tsh: 1.8,
            vitamina_d: 38,
            hemoglobina: 14.2,
            ferritina: 85,
            peso: 72
        }
    },
    diabetic_critical: {
        name: "Diabetes y Alerta Crítica (Glucosa >250)",
        date: "2026-07-02",
        values: {
            glucosa: 280,
            hba1c: 9.5,
            colesterol_total: 220,
            ldl: 148,
            hdl: 36,
            trigliceridos: 235,
            creatinina: 1.2,
            tsh: 2.5,
            vitamina_d: 18,
            hemoglobina: 13.5,
            ferritina: 50,
            peso: 86
        }
    },
    cholesterol_high: {
        name: "Colesterol Alto & Riesgo",
        date: "2026-07-02",
        values: {
            glucosa: 104,
            hba1c: 5.9,
            colesterol_total: 268,
            ldl: 182,
            hdl: 32,
            trigliceridos: 198,
            creatinina: 0.9,
            tsh: 1.5,
            vitamina_d: 32,
            hemoglobina: 15.0,
            ferritina: 120,
            peso: 82
        }
    },
    anemia: {
        name: "Anemia y Déficit de Vitamina D",
        date: "2026-07-02",
        values: {
            glucosa: 90,
            hba1c: 5.1,
            colesterol_total: 160,
            ldl: 85,
            hdl: 48,
            trigliceridos: 90,
            creatinina: 0.7,
            tsh: 2.1,
            vitamina_d: 11,
            hemoglobina: 9.2,
            ferritina: 8,
            peso: 60
        }
    }
};

const EMPTY_PROFILE = {
    age: "",
    sex: "",
    weight: "",
    height: "",
    pregnancy: "N",
    activity: "",
    diseases: [],
    meds: "",
    injuries: "",
    goal: "",
    diet: "",
    gym: "",
    budget: ""
};


// ==========================================================================
// BASE DE DATOS PERSISTENTE DE USUARIOS & DIRECTORIO DE DOCTORES (LOCALSTORAGE)
// ==========================================================================
function getUserDb() {
    try {
        const stored = localStorage.getItem('health_user_db');
        if (stored) return JSON.parse(stored);
    } catch (e) { console.error('Error reading user db', e); }
    return [];
}

function saveUserDb(users) {
    try {
        localStorage.setItem('health_user_db', JSON.stringify(users));
    } catch (e) { console.error('Error saving user db', e); }
}

function findUserInDb(email) {
    const db = getUserDb();
    return db.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
}

function upsertUserInDb(userData) {
    const db = getUserDb();
    const idx = db.findIndex(u => u.email && u.email.toLowerCase() === userData.email.toLowerCase());
    if (idx !== -1) {
        db[idx] = { ...db[idx], ...userData };
    } else {
        db.push(userData);
    }
    saveUserDb(db);
}

function loadDoctors() {
    if (!state.currentUser) return;
    const email = state.currentUser.email;
    const stored = localStorage.getItem(`health_doctors_${email}`);
    if (stored) {
        state.doctors = JSON.parse(stored);
    } else {
        state.doctors = [];
    }
}

function saveDoctors() {
    if (!state.currentUser) return;
    const email = state.currentUser.email;
    localStorage.setItem(`health_doctors_${email}`, JSON.stringify(state.doctors));
}

function loadAppointments() {
    if (!state.currentUser) return;
    const email = state.currentUser.email;
    const stored = localStorage.getItem(`health_appointments_${email}`);
    if (stored) {
        state.appointments = JSON.parse(stored);
    } else {
        state.appointments = [];
    }
}

function saveAppointments() {
    if (!state.currentUser) return;
    const email = state.currentUser.email;
    localStorage.setItem(`health_appointments_${email}`, JSON.stringify(state.appointments));
}

// 4. MAIN STATE DATA STRUCTURE
let state = {
    currentUser: null,
    activeRole: 'patient', // 'patient', 'doctor', 'auditor'
    profile: JSON.parse(JSON.stringify(EMPTY_PROFILE)),
    exams: [], // Historical exams
    pendingValidations: [], // Doctor's validation queue
    auditLogs: [],
    doctors: [],
    appointments: []
};

// Simulated cryptographic helper to show secure hashing in audit logs
function generateSimpleHash(content) {
    let hash = 0;
    const str = JSON.stringify(content);
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return "SHA256-" + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0') + Math.floor(Math.random() * 1000000);
}

// 5. IMMUTABLE AUDIT LOGGING SYSTEM (HU-05 / 4.4)
function logEvent(action, description) {
    const activeUser = state.currentUser ? state.currentUser.email : "Anónimo/Sistema";
    const role = state.activeRole.toUpperCase();
    const event = {
        timestamp: new Date().toLocaleString('es-CO'),
        id: "EV-" + Math.floor(Math.random() * 90000 + 10000),
        user: `${activeUser} (${role})`,
        action: action,
        description: description
    };
    event.hash = generateSimpleHash(event);
    
    state.auditLogs.unshift(event);
    
    // Save to localStorage
    localStorage.setItem('health_audit_logs', JSON.stringify(state.auditLogs.slice(0, 1000))); // Limit to 1000 logs
    
    // Render in table if visible
    renderAuditLogsTable();
}

function renderAuditLogsTable() {
    const tbody = document.getElementById('audit-table-tbody');
    if (!tbody) return;
    
    if (state.auditLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No hay eventos registrados.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = state.auditLogs.map(log => `
        <tr>
            <td>${log.timestamp}</td>
            <td>${log.id}</td>
            <td>${log.user}</td>
            <td><strong>${log.action}</strong></td>
            <td>${log.description}</td>
            <td title="${log.hash}">${log.hash}</td>
        </tr>
    `).join('');
}

// Export Audit Logs as CSV
document.getElementById('btn-export-audit').addEventListener('click', () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Timestamp,ID Evento,Usuario/Rol,Accion,Descripcion,Hash Integridad\r\n";
    
    state.auditLogs.forEach(log => {
        const row = [
            `"${log.timestamp}"`,
            `"${log.id}"`,
            `"${log.user}"`,
            `"${log.action}"`,
            `"${log.description.replace(/"/g, '""')}"`,
            `"${log.hash}"`
        ].join(",");
        csvContent += row + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `health_audit_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logEvent("Exportar Auditoría", "Se exportaron los logs de auditoría a formato CSV.");
});

// Toast notifications
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'danger') icon = '🚨';
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-body">
            <h5>${title}</h5>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 4.5s
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// 6. MOTOR DE REGLAS CLÍNICAS (DETERMINISTA - SIN IA)
function runClinicalRulesEngine(examValues, profile) {
    const alerts = [];
    const restrictions = [];
    let suggestedSpecialist = "Médico General";
    let specialistReason = "Tus niveles generales de control se encuentran dentro de la normalidad.";
    
    let penaltyScore = 0;
    let evaluatedCount = 0;

    // Evaluate each parameter in current exam
    for (const [key, val] of Object.entries(examValues)) {
        if (!CLINICAL_RANGES[key]) continue;
        evaluatedCount++;
        const evaluation = CLINICAL_RANGES[key].evaluate(val, profile);
        
        if (evaluation.state === 'altered') {
            penaltyScore += 8;
        } else if (evaluation.state === 'critical') {
            penaltyScore += 22;
            alerts.push({
                type: 'critical',
                indicator: key,
                name: CLINICAL_RANGES[key].name,
                value: val,
                unit: CLINICAL_RANGES[key].unit,
                message: evaluation.note || `Valor crítico fuera de rango.`
            });
        }
    }

    // Compute Health Score (Base 100, clamped between 10 and 100)
    let healthScore = 100 - penaltyScore;
    if (evaluatedCount === 0) healthScore = 100;
    healthScore = Math.max(10, Math.min(100, Math.round(healthScore)));

    // Specific rules and thresholds:
    // Glucosa Crítica Rule (Glucose > 250)
    if (examValues.glucosa && examValues.glucosa > 250) {
        restrictions.push("Prohibida la actividad física de alta intensidad (riesgo de cetoacidosis diabética). Se recomienda únicamente caminata ligera.");
        restrictions.push("Evitar el consumo de carbohidratos refinados y azúcares simples de forma estricta.");
        suggestedSpecialist = "Endocrinólogo";
        specialistReason = "Debido a una glucosa superior a 250 mg/dL, es vital una valoración urgente por Endocrinología.";
    } 
    // Moderate sugar alert
    else if (examValues.glucosa && examValues.glucosa > 100 && examValues.glucosa <= 250) {
        restrictions.push("Reducir la carga de carbohidratos simples y priorizar ejercicio cardiovascular moderado posterior a comidas.");
        if (suggestedSpecialist === "Médico General") {
            suggestedSpecialist = "Nutricionista / Internista";
            specialistReason = "Nivel de glucosa alterado en ayunas. Sugiere resistencia a la insulina o prediabetes.";
        }
    }

    // Cardiovascular risk & Lipids
    if (examValues.ldl && examValues.ldl >= 160) {
        restrictions.push("Restringir grasas saturadas (<7% de calorías totales) y eliminar grasas trans.");
        suggestedSpecialist = "Cardiólogo";
        specialistReason = "Tu colesterol LDL alto (>160 mg/dL) es un factor de riesgo cardiovascular crítico.";
    }

    // Kidney Health (Creatinine)
    const creatininaMax = profile.sex === 'F' ? 1.1 : 1.3;
    if (examValues.creatinina && examValues.creatinina >= 2.0) {
        restrictions.push("Restricción estricta de consumo de proteínas de origen animal (máximo 0.8g/kg).");
        restrictions.push("Evitar el uso de antiinflamatorios no esteroideos (AINEs) como Ibuprofeno o Naproxeno por nefrotoxicidad.");
        restrictions.push("Evitar la suplementación de creatina.");
        suggestedSpecialist = "Nefrólogo";
        specialistReason = "La creatinina elevada >= 2.0 mg/dL indica disfunción renal significativa.";
    }

    // TSH / Thyroid
    if (examValues.tsh && (examValues.tsh > 4.0 || examValues.tsh < 0.4)) {
        suggestedSpecialist = "Endocrinólogo";
        specialistReason = `Nivel de TSH alterado (${examValues.tsh} mIU/L). Se recomienda valoración por Endocrinología para estudio de función tiroidea.`;
    }

    // Anemia & Iron (Ferritina < 10 or Hemoglobina < 10)
    if ((examValues.hemoglobina && examValues.hemoglobina < 10) || (examValues.ferritina && examValues.ferritina < 10)) {
        restrictions.push("Evitar entrenamientos de fuerza extrema o resistencia larga hasta que los niveles de glóbulos rojos se estabilicen.");
        suggestedSpecialist = "Hematólogo";
        specialistReason = "Indicadores de anemia severa o ferropenia crítica. Requiere estudio etiológico.";
    }

    // IMC / Weight
    const hM = profile.height / 100;
    const imc = profile.weight / (hM * hM);
    if (imc >= 30.0) {
        restrictions.push("Control calórico estricto y evitar actividades de impacto articular alto (ej. saltos, correr sobre asfalto duro) para proteger articulaciones.");
        if (suggestedSpecialist === "Médico General") {
            suggestedSpecialist = "Nutricionista";
            specialistReason = "El Índice de Masa Corporal (IMC) está en rango de obesidad. Se sugiere guía nutricional personalizada.";
        }
    }

    // Antecedentes reported:
    if (profile.injuries && profile.injuries.trim() !== "" && !profile.injuries.toLowerCase().includes("ningun")) {
        restrictions.push(`Ajustar ejercicios para proteger la zona afectada: ${profile.injuries}`);
        if (suggestedSpecialist === "Médico General") {
            suggestedSpecialist = "Medicina Deportiva / Fisioterapeuta";
            specialistReason = "Se reportan lesiones o restricciones físicas activas.";
        }
    }
    
        if (profile.diseases && profile.diseases.includes('depresion')) {
        if (suggestedSpecialist === "Médico General") {
            suggestedSpecialist = "Psiquiatra / Psicólogo";
            specialistReason = "Paciente reporta diagnóstico activo de depresión o ansiedad.";
        }
    }

    return {
        healthScore,
        alerts,
        restrictions,
        suggestedSpecialist,
        specialistReason
    };
}



// ==========================================================================
// MOTOR DE ANÁLISIS MULTIVARIABLE: ENFERMEDADES DE BASE Y MEDICAMENTOS
// ==========================================================================
function analyzeDiseasesAndMeds(profile = {}, examValues = {}) {
    const diseases = Array.isArray(profile.diseases) ? profile.diseases : [];
    const medsRaw = profile.meds || '';
    const medsList = medsRaw.toLowerCase().split(/[,;\n]+/).map(m => m.trim()).filter(Boolean);

    const findings = [];
    const medInteractions = [];
    const safetyPrecautions = [];

    // 1. ANÁLISIS DE ENFERMEDADES DE BASE
    if (diseases.includes('diabetes')) {
        findings.push({
            category: 'Enfermedad de Base',
            name: 'Diabetes Mellitus',
            detail: 'Meta glucemia en ayunas: 70-130 mg/dL. Meta HbA1c: < 7.0%. Se recomienda dieta de bajo índice glucémico y monitoreo de función renal y salud podológica.'
        });
        if (examValues.glucosa > 130 || examValues.hba1c > 7.0) {
            findings.push({
                category: 'Alerta de Control',
                name: 'Descontrol Glucémico en Diabetes',
                detail: `Valores medidos (Glucosa: ${examValues.glucosa || '--'} mg/dL, HbA1c: ${examValues.hba1c || '--'}%) superan la meta terapéutica recomendada.`
            });
        }
    }

    if (diseases.includes('hipertension')) {
        findings.push({
            category: 'Enfermedad de Base',
            name: 'Hipertensión Arterial',
            detail: 'Restricción de sodio a < 2,000 mg/día (5g sal). Monitorear presión arterial pre y post-ejercicio antes de cargas pesadas.'
        });
    }

    if (diseases.includes('dislipidemia')) {
        findings.push({
            category: 'Enfermedad de Base',
            name: 'Dislipidemia (Colesterol / Triglicéridos)',
            detail: 'Meta de LDL < 100 mg/dL (o < 70 mg/dL si coexiste con diabetes). Aumentar ingesta de fibra soluble y limitar grasas saturadas.'
        });
    }

    if (diseases.includes('renal')) {
        findings.push({
            category: 'Enfermedad de Base',
            name: 'Enfermedad Renal / Disfunción Renal',
            detail: 'Monitorear niveles de Creatinina y TFG. Ajuste del aporte proteico (0.6-0.8 g/kg/día) e ingesta controlada de potasio y fósforo.'
        });
    }

    if (diseases.includes('tiroides')) {
        findings.push({
            category: 'Enfermedad de Base',
            name: 'Patología Tiroidea',
            detail: 'Monitorear TSH. El hipotiroidismo reduce la tasa metabólica basal, requiriendo estímulo muscular dinámico constante.'
        });
    }

    if (diseases.includes('depresion')) {
        findings.push({
            category: 'Enfermedad de Base',
            name: 'Depresión / Ansiedad / Estrés',
            detail: 'El estrés eleva el cortisol basal y la resistencia insulínica. Se recomiendan actividades físicas al aire libre e higiene del sueño.'
        });
    }

    // 2. ANÁLISIS DE MEDICAMENTOS E INTERACCIONES
    medsList.forEach(med => {
        if (med.includes('metformin')) {
            medInteractions.push({
                medication: 'Metformina',
                type: 'Fármaco-Nutriente',
                recommendation: 'El uso prolongado disminuye la absorción de Vitamina B12. Tomar con las comidas principales para reducir malestar gastrointestinal.'
            });
        }
        if (med.includes('enalapril') || med.includes('losartan') || med.includes('captopril') || med.includes('valsartan')) {
            medInteractions.push({
                medication: 'IECA / ARA-II (Enalapril / Losartán)',
                type: 'Fármaco-Electrolitos & Hidratación',
                recommendation: 'Evitar suplementos de potasio no indicados. Mantener abundante hidratación durante el entrenamiento para evitar hipotensión.'
            });
        }
        if (med.includes('atorvastat') || med.includes('simvastat') || med.includes('rosuvastat')) {
            medInteractions.push({
                medication: 'Estatinas (Atorvastatina / Rosuvastatina)',
                type: 'Fármaco-Ejercicio & Dieta',
                recommendation: 'Evitar el consumo simultáneo de toronja/pomelo. Si presenta dolores musculares inusuales tras ejercicio de alta intensidad, consultar al médico.'
            });
        }
        if (med.includes('levotiroxin') || med.includes('synthroid') || med.includes('euthyrox')) {
            medInteractions.push({
                medication: 'Levotiroxina',
                type: 'Pauta de Administración',
                recommendation: 'Administrar en ayunas estricta con agua, 30-60 min antes del desayuno. Espaciar al menos 4 horas de suplementos de Calcio o Hierro.'
            });
        }
        if (med.includes('insulin') || med.includes('glibenclamid') || med.includes('glimepirid')) {
            medInteractions.push({
                medication: 'Insulina / Secretagogo de Insulina',
                type: 'Seguridad en Ejercicio',
                recommendation: 'Riesgo de hipoglucemia. Portar siempre 15g de carbohidratos de rápida absorción (jugo de fruta o tabletas de glucosa) al entrenar.'
            });
            safetyPrecautions.push('Medir glucosa capilar antes de iniciar actividad física (si es < 100 mg/dL, ingerir un snack con carbohidratos).');
        }
        if (med.includes('omeprazol') || med.includes('esomeprazol') || med.includes('lansoprazol')) {
            medInteractions.push({
                medication: 'Inhibidor de Bomba de Protones (Omeprazol)',
                type: 'Fármaco-Micronutrientes',
                recommendation: 'El uso crónico reduce la absorción de Magnesio, Calcio y Vitamina B12.'
            });
        }
        if (med.includes('furosemid') || med.includes('hidroclorotiazid')) {
            medInteractions.push({
                medication: 'Diurético (Furosemida / HCTZ)',
                type: 'Hidratación & Calambres',
                recommendation: 'Vigilar la reposición de líquidos y electrolitos (Potasio, Magnesio) para prevenir deshidratación y calambres.'
            });
        }
    });

    if (medsList.length > 0 && medInteractions.length === 0) {
        medInteractions.push({
            medication: medsRaw,
            type: 'Verificación General',
            recommendation: 'Mantener administración según posología prescrita por el médico tratante e hidratación constante.'
        });
    }

    return {
        findings,
        medInteractions,
        safetyPrecautions
    };
}

function getDailyExerciseScheduleData(profile = {}, examValues = {}) {
    const isSevereGlucose = examValues.glucosa > 250;
    const isHighGlucose = examValues.glucosa > 100 || examValues.hba1c >= 5.7;
    const isHighLipids = examValues.colesterol_total > 200 || examValues.ldl > 130 || examValues.trigliceridos > 150;
    const isHypothyroid = examValues.tsh > 4.0;
    const isLowVitD = examValues.vitamina_d < 30;

    if (isSevereGlucose) {
        return [
            {
                day: "LUNES A DOMINGO",
                type: "Caminata Ligera de Seguridad",
                duration: "20-30 min",
                activities: "Caminata a ritmo suave en terreno plano. Evitar cargas anaeróbicas pesadas por riesgo de cetoacidosis.",
                note: "Glucosa > 250 mg/dL. Reanudar fuerza únicamente tras descenso de glicemia."
            }
        ];
    }

    return [
        {
            day: "LUNES",
            type: "Cardio Zona 2 + Fuerza Tren Inferior",
            duration: "45 min",
            activities: "Calentamiento 10 min. Sentadillas (3x12), Puentes de glúteo (3x15), Zancadas estáticas (3x10/pierna). Enfriamiento 10 min.",
            note: isHighGlucose ? "La activación de grandes grupos musculares de las piernas mejora la captación de glucosa vía GLUT-4." : "Estimula la síntesis de masa muscular magra."
        },
        {
            day: "MARTES",
            type: "Cardio Aeróbico Continuo",
            duration: "40 min",
            activities: "Fase Aeróbica (30 min): Caminata rápida, natación o elíptica en Zona 2. Movilidad articular (10 min).",
            note: isHighLipids ? "El ejercicio aeróbico sostenido en Zona 2 moviliza los triglicéridos y acelera el aclaramiento de LDL." : "Favorece la salud vascular y endotelial."
        },
        {
            day: "MIÉRCOLES",
            type: "Fuerza Tren Superior & Zona Core",
            duration: "45 min",
            activities: "Calentamiento 10 min. Flexiones modificadas (3x10), Remo con banda o mancuerna (3x12), Plancha frontal (3x30s). Enfriamiento 10 min.",
            note: "Previene la pérdida de masa magra y fortalece la faja abdominal."
        },
        {
            day: "JUEVES",
            type: "Caminata al Aire Libre & Exposición Solar",
            duration: "45-60 min",
            activities: "Caminata continua en parque o zona verde al aire libre (45 min). Sesión de estiramientos dinámicos (15 min).",
            note: isLowVitD ? "Exposición solar controlada de brazos y piernas (15-20 min) para estimular la síntesis de Vitamina D3." : "Promueve la reducción del estrés y cortisol."
        },
        {
            day: "VIERNES",
            type: "Circuito Funcional Metabólico",
            duration: "40 min",
            activities: "Calentamiento 10 min. Circuito 3 rondas: Peso muerto ligero (12 reps), Press de hombro (10 reps), Elevación de talones (15 reps), Plancha lateral (20s/lado). Enfriamiento 10 min.",
            note: isHypothyroid ? "Los circuitos funcionales ayudan a elevar la tasa metabólica basal en presencia de TSH alta." : "Incrementa la resistencia física general."
        },
        {
            day: "SÁBADO",
            type: "Actividad Recreativa o Deporte Preferido",
            duration: "60 min",
            activities: "Paseo en bicicleta, baile, natación recreativa o caminata en naturaleza. Hidratación abundante (2L agua).",
            note: "Favorece la adherencia a largo plazo mediante el disfrute de la actividad física."
        },
        {
            day: "DOMINGO",
            type: "Descanso Activo & Flexibilidad / Yoga",
            duration: "20-30 min",
            activities: "Sesión de Yoga suave, movilidad articular o estiramientos pasivos de cuerpo entero.",
            note: "Permite la regeneración muscular y reparación de microfibras."
        }
    ];
}

function getDailyMealScheduleData(profile = {}, examValues = {}) {
    const isHighGlucose = examValues.glucosa > 100 || examValues.hba1c >= 5.7;
    const isHighLipids = examValues.colesterol_total > 200 || examValues.ldl > 130 || examValues.trigliceridos > 150;
    const isHighUricAcid = examValues.acido_urico > 6.5;

    const dietType = profile.diet ? profile.diet.toLowerCase() : 'mediterranea';
    const isVegan = dietType.includes('vegana');
    const isVegetarian = dietType.includes('vegetariana') || isVegan;

    const protBreakfast = isVegan ? "Tofu revuelto con cúrcuma y espinacas" : "2 claras + 1 huevo entero con espinacas";
    const protLunch1 = isVegan ? "Tofu marinado a la plancha (150g)" : (isVegetarian ? "Hamburguesa de lentejas y queso magro" : "Pechuga de pollo a la plancha (150g)");
    const protDinner1 = isVegan ? "Seitán o tempeh salteado con verduras" : (isVegetarian ? "Omelette de verduras con queso bajo en grasa" : "Filete de pescado blanco al vapor");

    const protLunch2 = isVegan ? "Tazón de quinua con fríjoles negros y aguacate" : (isVegetarian ? "Guisado de lentejas con huevo duro" : "Lomo de pavo a la parrilla (130g)");
    const protDinner2 = isVegan ? "Crema de calabacín con garbanzos" : (isVegetarian ? "Ensalada completa con tofu" : "Filete de salmón a la plancha");

    return [
        {
            day: "LUNES",
            title: "Día 1: Control Glucémico y Salud Vascular",
            desayuno: `${protBreakfast}, 1/4 de aguacate y té verde sin azúcar.`,
            mediaManana: "1 manzana verde pequeña + 8 almendras naturales (magnesio y fibra).",
            almuerzo: `${protLunch1}, 1/2 taza de quinoa cocida y ensalada mixta con 1 cdta de aceite de oliva EV.`,
            mediaTarde: "Yogur griego descremado sin azúcar con 1 cdta de chía.",
            cena: `${protDinner1} con brócoli y zanahorias salteadas al ajo.`,
            note: isHighGlucose ? "Alimentos de bajo índice glucémico previenen picos de insulina postprandial." : "Equilibrio proteico y lipídico de alta calidad."
        },
        {
            day: "MARTES",
            title: "Día 2: Rico en Antioxidantes y Grasas Saludables (Omega-3)",
            desayuno: "Batido verde (espinaca, pepino, 1/2 manzana verde, 1 cda linaza molida) + 2 huevos cocidos o tofu.",
            mediaManana: "1 rodaja de papaya o melón + 4 nueces de Brasil (selenio tiroideo).",
            almuerzo: `${protLunch2}, 1/2 taza de arroz integral, ensalada de tomate y espinaca.`,
            mediaTarde: "Bastones de pepino y zanahoria con 2 cdas de hummus tradicional.",
            cena: `${protDinner2} sobre cama de espárragos a la plancha.`,
            note: isHighLipids ? "El Omega-3 de las nueces y la linaza disminuye los triglicéridos y cuida la endotelia." : "Protección antioxidante celular."
        },
        {
            day: "MIÉRCOLES",
            title: "Día 3: Depuración y Soporte Hepato-Renal",
            desayuno: "Arepa de avena integral con queso magro (o tofu), tomate en rodajas y té de manzanilla.",
            mediaManana: "1 pera mediana + puñado de semillas de calabaza.",
            almuerzo: "Guisado de lentejas con verduras (zanahoria, ahuyama, pimentón), aguacate y ensalada mixta.",
            mediaTarde: "1 taza de fresas frescas o arándanos ricos en polifenoles.",
            cena: "Sopa clara de verduras con proteína magra picada (pollo/tofu) y cilantro fresco.",
            note: isHighUricAcid ? "Estricto control de purinas: sin carnes rojas ni mariscos para favorecer la excreción de ácido úrico." : "Aporte óptimo de fibra dietaria."
        },
        {
            day: "JUEVES",
            title: "Día 4: Antiinflamatorio y Sensibilidad a la Insulina",
            desayuno: "Pancakes de avena y clara de huevo con canela + café negro sin azúcar.",
            mediaManana: "1/2 taza de kéfir o yogur probiótico + 5 nueces picadas.",
            almuerzo: "Pescado azul (salmón) o Tofu marinado al horno con romero, espárragos y puré de camote pequeño.",
            mediaTarde: "1 galleta de arroz integral con 1 cda de mantequilla de maní 100% natural.",
            cena: "Ensalada de espinacas frescas, champiñones salteados, semillas de sésamo y proteína a la plancha.",
            note: "La canela y los polifenoles modulan la microbiota intestinal y aumentan la sensibilidad insulínica."
        },
        {
            day: "VIERNES",
            title: "Día 5: Energía Sostenible y Saciedad",
            desayuno: "Huevos revueltos o tofu salteado con champiñones y tomate + 1 tostada de pan integral masa madre.",
            mediaManana: "1 durazno o kiwi + 6 avellanas tostadas.",
            almuerzo: "Pechuga de pavo/pollo o seitán al curry suave con verduras y 1/2 taza de arroz basmati.",
            mediaTarde: "Té verde o infusión de jengibre + 1/4 taza de edamames al vapor.",
            cena: "Ceviche vegetal de palmitos y champiñones con cebolla morada, limón y cilantro.",
            note: "La cebolla y el limón aportan quercetina y vitamina C para optimizar la absorción de hierro."
        },
        {
            day: "SÁBADO",
            title: "Día 6: Nutrición Celular y Digestión Óptima",
            desayuno: "Omelette de espinacas, champiñones y 1 cda de queso cottage descremado + té de frutos rojos.",
            mediaManana: "1 tajada de piña fresca (bromelina digestiva) + semillas de girasol.",
            almuerzo: "Bowl mediterráneo: quinua, garbanzos tostados, aceitunas negras, pepino, tomate y pollo/tofu a la plancha.",
            mediaTarde: "Yogur natural con canela en polvo.",
            cena: "Crema de auyama (calabaza) y jengibre sin crema de leche + 120g de proteína magra a la plancha.",
            note: "La bromelina de la piña y el jengibre favorecen la digestión proteica y reducen la inflamación."
        },
        {
            day: "DOMINGO",
            title: "Día 7: Restablecimiento y Preparación Semanal",
            desayuno: "Tostada integral con aguacate triturado, huevo pochado (o tofu) y semillas de chía.",
            mediaManana: "1/2 taza de melón picado + 5 almendras.",
            almuerzo: "Pescado al horno o medallón de lentejas con vegetales asados y 1/3 de plátano cocido.",
            mediaTarde: "Infusión relajante de toronjil + 1 manzana asada con canela.",
            cena: "Ensalada ligera de hojas verdes, palmitos, pepino, aceite de oliva virgen extra y proteína magra suave.",
            note: "Prepara el sistema digestivo para el inicio de la semana con cenas ligeras de rápida asimilación."
        }
    ];
}

// 7. ORQUESTADOR DE IA & MOTOR DINÁMICO DE INFORMES (CON FILTRADO DE SEGURIDAD)
function orchestrateAiReport(profile, latestExam, rulesResult) {
    logEvent("Orquestador IA", "Iniciando orquestación dinámica de informe clínico y plan de bienestar.");

    const examValues = (latestExam && latestExam.values) ? latestExam.values : {};
    
    // Categorizar marcadores verdaderamente presentes en el examen
    const normalItems = [];
    const alteredItems = [];
    const criticalItems = [];

    for (const [key, val] of Object.entries(examValues)) {
        if (!CLINICAL_RANGES[key]) continue;
        const config = CLINICAL_RANGES[key];
        const normal = config.getNormalRange(profile);
        const evalResult = config.evaluate(val, profile);

        const itemInfo = {
            key,
            name: config.name,
            value: val,
            unit: config.unit,
            rangeStr: `${normal.min} - ${normal.max} ${config.unit}`,
            status: evalResult.status,
            state: evalResult.state,
            note: evalResult.note || ''
        };

        if (evalResult.state === 'critical') criticalItems.push(itemInfo);
        else if (evalResult.state === 'altered') alteredItems.push(itemInfo);
        else normalItems.push(itemInfo);
    }

    // ------------------------------------------------------------------
    // MOTOR DE ANÁLISIS DE ANTECEDENTES Y MEDICAMENTOS (ENFERMEDADES DE BASE)
    // ------------------------------------------------------------------
    const multiVarAnalysis = analyzeDiseasesAndMeds(profile, examValues);

    // Generación de HTML dinámico para la pestaña "Análisis Integrado de Variables" en pantalla
    let variableAnalysisHtml = `
        <div class="multi-var-analysis-container" style="display: flex; flex-direction: column; gap: 16px;">
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 12px 16px; border-radius: 8px; font-size: 0.88rem; color: #10B981; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.3rem;">📊</span>
                <div>
                    <strong>Análisis Multivariable Integrado Ejecutado:</strong> Evaluando Biomarcadores, Diagnósticos Preexistentes, Fármacos e Interacciones Fisiológicas.
                </div>
            </div>

            <!-- BLOQUE 1: BIOMARCADORES DE EXAMEN -->
            <div class="analysis-card-block" style="background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px;">
                <h4 style="margin-top:0; color:#38BDF8; display:flex; align-items:center; gap:8px; font-size:1.05rem;">
                    🧪 1. Marcadores Cuantitativos del Examen (${normalItems.length + alteredItems.length + criticalItems.length} Analizados)
                </h4>
    `;

    if (normalItems.length === 0 && alteredItems.length === 0 && criticalItems.length === 0) {
        variableAnalysisHtml += `<p style="color:#94A3B8; font-size:0.88rem;">No se detectaron marcadores cuantitativos en este examen.</p>`;
    } else {
        variableAnalysisHtml += `<ul style="margin:0; padding-left:20px; font-size:0.88rem; line-height:1.6; color:#CBD5E1;">`;
        [...criticalItems, ...alteredItems].forEach(item => {
            const badgeColor = item.state === 'critical' ? '#EF4444' : '#F59E0B';
            variableAnalysisHtml += `<li style="margin-bottom:6px;"><strong style="color:#FFF;">${item.name}</strong>: ${item.value} ${item.unit} (Ref: ${item.rangeStr}) <span style="background:${badgeColor}; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${item.status}</span>. ${item.note}</li>`;
        });
        normalItems.forEach(item => {
            variableAnalysisHtml += `<li style="margin-bottom:6px;"><strong style="color:#A7F3D0;">${item.name}</strong>: ${item.value} ${item.unit} (Ref: ${item.rangeStr}) <span style="background:#10B981; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.75rem;">Normal</span></li>`;
        });
        variableAnalysisHtml += `</ul>`;
    }
    variableAnalysisHtml += `</div>`;

    // BLOQUE 2: ENFERMEDADES DE BASE
    variableAnalysisHtml += `
        <div class="analysis-card-block" style="background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px;">
            <h4 style="margin-top:0; color:#F59E0B; display:flex; align-items:center; gap:8px; font-size:1.05rem;">
                🏥 2. Análisis de Enfermedades de Base & Diagnósticos Preexistentes
            </h4>
    `;
    if (multiVarAnalysis.findings.length === 0) {
        variableAnalysisHtml += `<p style="color:#94A3B8; font-size:0.88rem;">No se registraron patologías preexistentes de alto riesgo en el perfil médico del usuario.</p>`;
    } else {
        variableAnalysisHtml += `<div style="display:flex; flex-direction:column; gap:10px;">`;
        multiVarAnalysis.findings.forEach(f => {
            variableAnalysisHtml += `
                <div style="background:#0F172A; border-left:3px solid #F59E0B; padding:10px 12px; border-radius:4px; font-size:0.88rem;">
                    <div style="font-weight:600; color:#FFF;">${f.name} <small style="color:#94A3B8;">(${f.category})</small></div>
                    <div style="color:#CBD5E1; margin-top:4px;">${f.detail}</div>
                </div>
            `;
        });
        variableAnalysisHtml += `</div>`;
    }
    variableAnalysisHtml += `</div>`;

    // BLOQUE 3: MEDICAMENTOS E INTERACCIONES
    variableAnalysisHtml += `
        <div class="analysis-card-block" style="background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px;">
            <h4 style="margin-top:0; color:#A7F3D0; display:flex; align-items:center; gap:8px; font-size:1.05rem;">
                💊 3. Medicamentos Registrados e Interacciones Fármaco-Nutriente
            </h4>
    `;
    if (multiVarAnalysis.medInteractions.length === 0) {
        variableAnalysisHtml += `<p style="color:#94A3B8; font-size:0.88rem;">No se registraron medicamentos habituales de prescripción activa.</p>`;
    } else {
        variableAnalysisHtml += `<div style="display:flex; flex-direction:column; gap:10px;">`;
        multiVarAnalysis.medInteractions.forEach(m => {
            variableAnalysisHtml += `
                <div style="background:#0F172A; border-left:3px solid #10B981; padding:10px 12px; border-radius:4px; font-size:0.88rem;">
                    <div style="font-weight:600; color:#34D399;">💊 ${m.medication} &nbsp;•&nbsp; <span style="color:#94A3B8; font-size:0.8rem;">${m.type}</span></div>
                    <div style="color:#CBD5E1; margin-top:4px;">${m.recommendation}</div>
                </div>
            `;
        });
        variableAnalysisHtml += `</div>`;
    }
    variableAnalysisHtml += `</div>`;

    // BLOQUE 4: ACCIÓN DIRECTA PARA EXCEL
    variableAnalysisHtml += `
        <div style="background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); border: 1px solid #10B981; border-radius: 10px; padding: 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
                <h4 style="margin:0; color:#FFF; font-size:1rem;">📥 Exportación de Rutina y Plan Alimenticio de 7 Días</h4>
                <p style="margin:4px 0 0 0; color:#94A3B8; font-size:0.83rem;">Genera el documento Excel (.xlsx) estructurado con el menú diario y cronograma de ejercicios.</p>
            </div>
            <button onclick="exportToExcel()" class="btn btn-success" style="background:#10B981; border:none; padding:10px 18px; font-weight:600; border-radius:8px; cursor:pointer; color:#fff; display:flex; align-items:center; gap:8px;">
                📊 Generar Archivo Excel (.xlsx)
            </button>
        </div>
    </div>
    `;

    // ------------------------------------------------------------------
    // 1. DYNAMIC EASY EXPLANATION (Paciente - Lenguaje Claro)
    // ------------------------------------------------------------------
    let easyExplanation = "";
    const totalCount = normalItems.length + alteredItems.length + criticalItems.length;

    if (totalCount === 0) {
        easyExplanation = "No se registraron biomarcadores cuantitativos válidos en este examen para generar una interpretación automática.";
    } else {
        const abnormalCount = alteredItems.length + criticalItems.length;
        if (abnormalCount === 0) {
            easyExplanation = `¡Excelente noticia! Todos los ${totalCount} marcadores evaluados en este examen (${normalItems.map(i => i.name).join(', ')}) se encuentran dentro de los rangos normales y saludables. Tu perfil fisiológico muestra gran estabilidad.`;
        } else {
            easyExplanation = `Se evaluaron ${totalCount} marcadores en tu reporte. Se identificaron ${abnormalCount} indicador(es) fuera del rango de referencia:\n\n`;
            
            const allAbnormal = [...criticalItems, ...alteredItems];
            allAbnormal.forEach(item => {
                easyExplanation += `• ${item.name}: Tu valor es de ${item.value} ${item.unit} (Rango de referencia: ${item.rangeStr}). Estatus: ${item.status}. ${item.note}\n`;
            });

            if (normalItems.length > 0) {
                easyExplanation += `\nEn rango normal: ${normalItems.map(i => `${i.name} (${i.value} ${i.unit})`).join(', ')}.`;
            }
        }
    }

    // ------------------------------------------------------------------
    // 2. DYNAMIC TECHNICAL EXPLANATION (Médico - Lenguaje Técnico)
    // ------------------------------------------------------------------
    let technicalExplanation = "";
    if (totalCount > 0) {
        technicalExplanation = `Panel de biomarcadores séricos (${totalCount} analitos procesados):\n`;
        technicalExplanation += Object.entries(examValues)
            .filter(([k]) => CLINICAL_RANGES[k])
            .map(([k, v]) => `- ${CLINICAL_RANGES[k].name}: ${v} ${CLINICAL_RANGES[k].unit}`)
            .join('\n') + '\n\n';

        if (criticalItems.length > 0 || alteredItems.length > 0) {
            technicalExplanation += `Hallazgos clínicos alterados/críticos: `;
            const abnormalStr = [...criticalItems, ...alteredItems].map(i => `${i.name} (${i.value} ${i.unit} vs ref ${i.rangeStr}) -> ${i.status}`).join('; ');
            technicalExplanation += abnormalStr + '.';
        } else {
            technicalExplanation += `Sin hallazgos patológicos en los biomarcadores procesados. Parámetros dentro de varianza fisiológica esperada.`;
        }
    } else {
        technicalExplanation = "Sin biomarcadores procesados.";
    }

    // ------------------------------------------------------------------
    // 3. DYNAMIC RISKS EVALUATION
    // ------------------------------------------------------------------
    let risks = "";
    const riskPoints = [];

    if (examValues.tsh && (examValues.tsh > 4.0 || examValues.tsh < 0.4)) {
        if (examValues.tsh > 4.0) {
            riskPoints.push(`• Función Tiroidea (TSH ${examValues.tsh} mIU/L): La TSH elevada es indicativa de hipotiroidismo (subclínico o clínico). Sin control endocrinológico, puede derivar en bradicardia, fatiga crónica, aumento de peso e hipercolesterolemia secundaria.`);
        } else {
            riskPoints.push(`• Función Tiroidea (TSH ${examValues.tsh} mIU/L): TSH suprimida compatible con hipertiroidismo. Riesgo de taquicardias, arritmias cardíacas y pérdida de masa ósea.`);
        }
    }

    if (examValues.glucosa && examValues.glucosa > 100) {
        if (examValues.glucosa > 250) {
            riskPoints.push(`• Salud Metabólica (Glucosa ${examValues.glucosa} mg/dL): Hiperglucemia severa. Riesgo inminente de cetoacidosis diabética o estado hiperosmolar.`);
        } else {
            riskPoints.push(`• Salud Metabólica (Glucosa ${examValues.glucosa} mg/dL): Nivel elevado en ayunas. Riesgo de progresión a resistencia a la insulina o diabetes tipo 2.`);
        }
    }

    if (examValues.colesterol_total > 200 || examValues.ldl > 100) {
        riskPoints.push(`• Riesgo Cardiovascular (Lípidos): Niveles elevados de lípidos favorecen la aterogénesis y placas de ateroma en vasos sanguíneos.`);
    }

    if (examValues.creatinina && examValues.creatinina > (profile.sex === 'F' ? 1.1 : 1.3)) {
        riskPoints.push(`• Función Renal (Creatinina ${examValues.creatinina} mg/dL): Elevación por encima del rango alto fisiológico. Riesgo de disfunción renal.`);
    }

    if (examValues.vitamina_d && examValues.vitamina_d < 30) {
        riskPoints.push(`• Insuficiencia de Vitamina D (${examValues.vitamina_d} ng/mL): Afecta la fijación de calcio óseo y la regulación inmunológica.`);
    }

    if (examValues.hemoglobina && examValues.hemoglobina < 12) {
        riskPoints.push(`• Serie Roja / Anemia (Hemoglobina ${examValues.hemoglobina} g/dL): Disminución de transporte de oxígeno, causando fatiga e intolerancia al esfuerzo.`);
    }

    if (riskPoints.length > 0) {
        risks = riskPoints.join('\n\n');
    } else {
        risks = "No se identifican factores de riesgo fisiológico elevados en los marcadores examinados. Se sugiere mantener controles médicos periódicos y hábitos de vida saludables.";
    }

    // 4. GENERATE DETAILED 7-DAY PLANS
    const exercisePlan = generateDailyExerciseSchedule(profile, examValues);
    const dietPlan = generateDailyMealSchedule(profile, examValues);
    const lifestylePlan = "Monitorear nivel de energía diaria, asegurar 7 a 8 horas de sueño reparador, hidratación abundante (2.5L de agua al día) y pausas activas cada 2 horas.";

    // 5. CITATIONS & SPECIALIST
    const citations = [];
    if (examValues.glucosa > 100 || examValues.hba1c > 5.6) {
        if (typeof RAG_KNOWLEDGE !== 'undefined' && RAG_KNOWLEDGE.diabetes) RAG_KNOWLEDGE.diabetes.forEach(c => citations.push(c));
    }
    if (examValues.colesterol_total > 200 || examValues.ldl > 100) {
        if (typeof RAG_KNOWLEDGE !== 'undefined' && RAG_KNOWLEDGE.dislipidemia) RAG_KNOWLEDGE.dislipidemia.forEach(c => citations.push(c));
    }
    if (typeof RAG_KNOWLEDGE !== 'undefined' && RAG_KNOWLEDGE.general) RAG_KNOWLEDGE.general.forEach(c => citations.push(c));

    let specialistName = (rulesResult && rulesResult.suggestedSpecialist) ? rulesResult.suggestedSpecialist : "Médico General";
    let specialistDesc = (rulesResult && rulesResult.specialistReason) ? rulesResult.specialistReason : "Tus indicadores se encuentran dentro de rangos habituales de control.";

    if (examValues.tsh && (examValues.tsh > 4.0 || examValues.tsh < 0.4)) {
        specialistName = "Endocrinólogo";
        specialistDesc = `Debido a un nivel de TSH alterado (${examValues.tsh} mIU/L), se recomienda consulta con Endocrinología.`;
    }

    return {
        easyExplanation,
        technicalExplanation,
        risks,
        exercisePlan,
        dietPlan,
        lifestylePlan,
        citations,
        safetyTriggered: false,
        specialistName,
        specialistDesc,
        variableAnalysisHtml
    };
}

// Generador de Plan de Ejercicio Semanal Detallado Día por Día

function generateDailyExerciseSchedule(profile, examValues) {
    const location = profile.gym === 'si' ? 'Gimnasio / Centro Deportivo' : 'En Casa / Al Aire Libre';
    const goalText = profile.goal ? profile.goal.toUpperCase() : 'OPTIMIZACIÓN DE SALUD GENERAL';
    const days = getDailyExerciseScheduleData(profile, examValues);

    let html = `
        <div class="daily-plan-wrapper">
            <div class="plan-header-summary" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:10px; background:#1E293B; border-radius:8px; margin-bottom:12px; font-size:0.85rem;">
                <span>🎯 <strong>Objetivo:</strong> ${goalText}</span>
                <span>📍 <strong>Lugar:</strong> ${location}</span>
                <span>⚡ <strong>Plan:</strong> 7 días estructurados</span>
            </div>
    `;

    days.forEach(d => {
        html += `
            <div class="day-plan-card" style="background:#0F172A; border:1px solid #334155; border-radius:8px; padding:12px; margin-bottom:10px;">
                <div class="day-plan-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span class="day-plan-title" style="font-weight:600; color:#38BDF8;">📆 ${d.day} &nbsp;•&nbsp; ${d.type}</span>
                    <span class="badge badge-info" style="background:#0284C7; color:#fff; padding:2px 8px; border-radius:4px; font-size:0.75rem;">⏱️ ${d.duration}</span>
                </div>
                <div class="day-plan-body" style="font-size:0.85rem; line-height:1.4;">
                    <div class="exercise-activity-item" style="margin-bottom:6px; color:#CBD5E1;">🔹 ${d.activities}</div>
                    <div class="day-clinical-note" style="color:#F59E0B; font-size:0.8rem; margin-top:6px;">💡 <em>Impacto Clínico / Precaución:</em> ${d.note}</div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    return html;
}

function generateDailyMealSchedule(profile, examValues) {
    const dietType = profile.diet ? profile.diet.toLowerCase() : 'mediterranea';
    const days = getDailyMealScheduleData(profile, examValues);

    let html = `
        <div class="daily-plan-wrapper">
            <div class="plan-header-summary" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:10px; background:#1E293B; border-radius:8px; margin-bottom:12px; font-size:0.85rem;">
                <span>🥗 <strong>Patrón:</strong> ${dietType.toUpperCase()}</span>
                <span>💧 <strong>Hidratación:</strong> 2.5 L/día</span>
                <span>📋 <strong>Pauta:</strong> 5 comidas equilibradas</span>
            </div>
    `;

    days.forEach(d => {
        html += `
            <div class="day-plan-card" style="background:#0F172A; border:1px solid #334155; border-radius:8px; padding:12px; margin-bottom:10px;">
                <div class="day-plan-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span class="day-plan-title" style="font-weight:600; color:#34D399;">📆 ${d.day} &nbsp;•&nbsp; ${d.title}</span>
                    <span class="badge badge-success" style="background:#059669; color:#fff; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Nutrición</span>
                </div>
                <div class="day-plan-body" style="font-size:0.85rem; line-height:1.4; color:#CBD5E1;">
                    <div style="margin-bottom:3px;"><strong style="color:#A7F3D0;">🌅 Desayuno:</strong> ${d.desayuno}</div>
                    <div style="margin-bottom:3px;"><strong style="color:#A7F3D0;">🍏 Media Mañana:</strong> ${d.mediaManana}</div>
                    <div style="margin-bottom:3px;"><strong style="color:#A7F3D0;">🥗 Almuerzo:</strong> ${d.almuerzo}</div>
                    <div style="margin-bottom:3px;"><strong style="color:#A7F3D0;">☕ Media Tarde:</strong> ${d.mediaTarde}</div>
                    <div style="margin-bottom:3px;"><strong style="color:#A7F3D0;">🌙 Cena:</strong> ${d.cena}</div>
                    <div class="day-clinical-note" style="color:#F59E0B; font-size:0.8rem; margin-top:6px;">🌿 <em>Tip Nutricional:</em> ${d.note}</div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    return html;
}


// Helper to load user-specific profile and exams from localStorage
function loadUserData() {
    if (!state.currentUser) return;
    const email = state.currentUser.email;
    
    // Load profile specific to user
    const savedProfile = localStorage.getItem(`health_profile_${email}`);
    if (savedProfile) {
        state.profile = JSON.parse(savedProfile);
    } else {
        // Reset to defaults if it's a new user
        state.profile = JSON.parse(JSON.stringify(EMPTY_PROFILE));
    }
    
    // Load exams specific to user
    const savedExams = localStorage.getItem(`health_exams_${email}`);
    if (savedExams) {
        let loaded = JSON.parse(savedExams);
        state.exams = sanitizeStoredExams(loaded);
        // Force chronological sorting by date
        state.exams.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Save cleaned version back
        saveExams();
    } else {
        state.exams = [];
    }
    
    loadDoctors();
    loadAppointments();
    syncProfileFormFromState();
}

function sanitizeStoredExams(exams) {
    if (!Array.isArray(exams)) return [];
    return exams.map(exam => {
        if (exam && exam.values) {
            // Check for legacy fake defaults signature
            const isLegacyColesterol = exam.values.colesterol_total === 180 && exam.values.ldl === 95 && exam.values.hdl === 50 && exam.values.trigliceridos === 120;
            const isLegacyVitD = exam.values.vitamina_d === 35;

            if (isLegacyColesterol) {
                delete exam.values.colesterol_total;
                delete exam.values.ldl;
                delete exam.values.hdl;
                delete exam.values.trigliceridos;
                if (exam.values.hba1c === 5.4) delete exam.values.hba1c;
                if (exam.values.creatinina === 0.8) delete exam.values.creatinina;
                if (exam.values.hemoglobina === 14) delete exam.values.hemoglobina;
                if (exam.values.ferritina === 80) delete exam.values.ferritina;
            }

            if (isLegacyVitD && isLegacyColesterol) {
                delete exam.values.vitamina_d;
            }

            // Re-run rules & AI report only if missing or if legacy defaults were removed
            if (!exam.rulesResult || isLegacyColesterol) {
                exam.rulesResult = runClinicalRulesEngine(exam.values, state.profile);
            }
            if (!exam.aiReport || isLegacyColesterol) {
                exam.aiReport = orchestrateAiReport(state.profile, exam, exam.rulesResult);
            }
        }
        return exam;
    });
}

function syncProfileFormFromState() {
    const prof = state.profile || EMPTY_PROFILE;
    if (document.getElementById('prof-age')) document.getElementById('prof-age').value = prof.age || '';
    if (document.getElementById('prof-sex')) document.getElementById('prof-sex').value = prof.sex || '';
    if (document.getElementById('prof-weight')) document.getElementById('prof-weight').value = prof.weight || '';
    if (document.getElementById('prof-height')) document.getElementById('prof-height').value = prof.height || '';
    if (document.getElementById('prof-pregnancy')) document.getElementById('prof-pregnancy').value = prof.pregnancy || 'N';
    if (document.getElementById('prof-activity')) document.getElementById('prof-activity').value = prof.activity || '';
    if (document.getElementById('prof-meds')) document.getElementById('prof-meds').value = prof.meds || '';
    if (document.getElementById('prof-injuries')) document.getElementById('prof-injuries').value = prof.injuries || '';
    if (document.getElementById('prof-goal')) document.getElementById('prof-goal').value = prof.goal || '';
    if (document.getElementById('prof-diet')) document.getElementById('prof-diet').value = prof.diet || '';
    if (document.getElementById('prof-gym')) document.getElementById('prof-gym').value = prof.gym || '';
    if (document.getElementById('prof-budget')) document.getElementById('prof-budget').value = prof.budget || '';

    const diseaseChecks = document.querySelectorAll('input[name="disease"]');
    diseaseChecks.forEach(cb => {
        cb.checked = Array.isArray(prof.diseases) && prof.diseases.includes(cb.value);
    });
}

function getActiveExam() {
    if (!state.exams || state.exams.length === 0) return null;
    if (state.activeExamId) {
        const found = state.exams.find(e => e.id === state.activeExamId);
        if (found) return found;
    }
    return state.exams[state.exams.length - 1];
}

function populateExamSelector() {
    const selectorIds = ['active-exam-select-dashboard', 'active-exam-select-interpretation'];
    const active = getActiveExam();

    selectorIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '';

        if (state.exams.length === 0) {
            select.innerHTML = `<option value="">Sin exámenes registrados</option>`;
            return;
        }

        state.exams.forEach((exam, idx) => {
            const opt = document.createElement('option');
            opt.value = exam.id;
            const dateStr = exam.date || `Examen #${idx + 1}`;
            const metricsCount = exam.values ? Object.keys(exam.values).length : 0;
            opt.innerText = `📅 ${dateStr} (${metricsCount} biomarcadores) - ${exam.name || 'Examen'}`;
            if (active && active.id === exam.id) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });

        select.onchange = (e) => {
            state.activeExamId = e.target.value;
            updateUI();
        };
    });
}

// 8. DATA PERSISTENCE & INITIALIZATION
function loadState() {
    const savedLogs = localStorage.getItem('health_audit_logs');
    if (savedLogs) state.auditLogs = JSON.parse(savedLogs);
    else logEvent("Inicialización del Sistema", "Base de datos de auditoría inicializada.");

    const savedPending = localStorage.getItem('health_pending_validations');
    if (savedPending) state.pendingValidations = JSON.parse(savedPending);

    // Try to restore session
    const savedUser = localStorage.getItem('health_active_user');
    if (savedUser) {
        state.currentUser = JSON.parse(savedUser);
        loadUserData(); // Load this user's profile and exams!
        
        document.getElementById('auth-view').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('user-display-email').innerText = state.currentUser.email;
        document.getElementById('user-avatar-char').innerText = state.currentUser.email.charAt(0).toUpperCase();
        
        // Sync menus and views
        switchActiveView('dashboard-view');
        updateUI();
    }
}

function saveProfile() {
    if (!state.currentUser) return;
    const email = state.currentUser.email;
    localStorage.setItem(`health_profile_${email}`, JSON.stringify(state.profile));
    logEvent("Modificación del Perfil", `Se actualizó la información del perfil médico del usuario (Edad: ${state.profile.age}, Sexo: ${state.profile.sex}, Peso: ${state.profile.weight}kg).`);
    showToast("Perfil Actualizado", "Tu información biomédica y antecedentes fueron guardados correctamente.", "success");
    updateUI();
}

function saveExams() {
    if (!state.currentUser) return;
    const email = state.currentUser.email;
    // Force chronological sorting before saving
    state.exams.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    localStorage.setItem(`health_exams_${email}`, JSON.stringify(state.exams));
    localStorage.setItem('health_pending_validations', JSON.stringify(state.pendingValidations));
}


// ==========================================================================
// RENDERIZADO DEL MÓDULO DE CITAS MÉDICAS, DIRECTORIO & MONITOREO DE TIEMPO
// ==========================================================================
function renderAppointmentsView() {
    if (!state.currentUser) return;

    // 1. ESPECIALISTA RECOMENDADO POR EXAMEN
    const recTitle = document.getElementById('rec-spec-title');
    const recReason = document.getElementById('rec-spec-reason');
    const latestExam = getActiveExam();

    let recSpec = "Médico General";
    let recDesc = "Tus marcadores cuantitativos se encuentran en rangos estables de control rutinario.";

    if (latestExam && latestExam.values) {
        const v = latestExam.values;
        if (v.glucosa > 130 || v.hba1c > 7.0 || (v.tsh && (v.tsh > 4.0 || v.tsh < 0.4))) {
            recSpec = "Endocrinólogo";
            recDesc = `Se recomienda valoración por Endocrinología debido a alteración en ${v.glucosa > 130 ? 'Glucosa/HbA1c' : 'Función Tiroidea (TSH)'}.`;
        } else if (v.ldl >= 160 || v.colesterol_total > 240) {
            recSpec = "Cardiólogo";
            recDesc = `Niveles elevados de LDL (${v.ldl} mg/dL). Se requiere evaluación de riesgo cardiovascular.`;
        } else if (v.creatinina && v.creatinina >= 1.5) {
            recSpec = "Nefrólogo";
            recDesc = `Creatinina elevada (${v.creatinina} mg/dL). Monitoreo estricto de función renal.`;
        } else if (v.hemoglobina && v.hemoglobina < 11) {
            recSpec = "Hematólogo";
            recDesc = `Indicadores de anemia/hemoglobina baja (${v.hemoglobina} g/dL).`;
        }
    } else if (state.profile.diseases && state.profile.diseases.includes('diabetes')) {
        recSpec = "Endocrinólogo";
        recDesc = "Reportas diagnóstico preexistente de Diabetes Mellitus.";
    }

    if (recTitle) recTitle.innerText = `🩺 Especialista Recomendado: ${recSpec}`;
    if (recReason) recReason.innerText = recDesc;

    // 2. MONITOREO DE TIEMPO PARA PRÓXIMO SEGUIMIENTO
    const countVal = document.getElementById('monitor-countdown-val');
    const countDetail = document.getElementById('monitor-next-detail');

    const now = new Date();
    const upcoming = state.appointments
        .filter(a => a.status === 'Programada' && new Date(a.date).getTime() >= now.getTime())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

    if (upcoming && countVal && countDetail) {
        const target = new Date(upcoming.date);
        const diffMs = target.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        countVal.innerText = `En ${diffDays} Día(s)`;
        countVal.style.color = diffDays <= 3 ? '#EF4444' : '#34D399';
        countDetail.innerText = `Próxima Cita: ${new Date(upcoming.date).toLocaleString()} - ${upcoming.doctorName} (${upcoming.specialty})`;
    } else if (countVal && countDetail) {
        countVal.innerText = "Sin Citas Futuras";
        countVal.style.color = "#94A3B8";
        countDetail.innerText = "Agenda tu próximo seguimiento con las recomendaciones del examen.";
    }

    // 3. RENDERIZAR DIRECTORIO DE DOCTORES
    renderDoctorDirectory();

    // 4. RENDERIZAR TABLA DE CITAS
    renderAppointmentsTable();
}

function renderDoctorDirectory() {
    const container = document.getElementById('doctors-directory-cards');
    const selectElem = document.getElementById('app-select-doctor');
    
    if (selectElem) {
        selectElem.innerHTML = `<option value="">-- Seleccionar Doctor del Directorio --</option>`;
        state.doctors.forEach(d => {
            selectElem.innerHTML += `<option value="${d.name}|${d.specialty}|${d.contact}">${d.name} (${d.specialty}) - ${d.institution}</option>`;
        });
        selectElem.innerHTML += `<option value="manual">-- Otro Médico (Ingreso Manual) --</option>`;
    }

    if (container) {
        container.innerHTML = '';
        if (state.doctors.length === 0) {
            container.innerHTML = `<div style="color:#94A3B8; font-size:0.88rem; grid-column:span 2;">No tienes doctores registrados en tu directorio. Haz clic en <strong>"+ Registrar Nuevo Doctor"</strong> para agregarlos.</div>`;
        } else {
            state.doctors.forEach((d, idx) => {
                const card = document.createElement('div');
                card.style.cssText = "background:#0F172A; border:1px solid #334155; border-radius:8px; padding:12px; font-size:0.85rem;";
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <strong style="color:#FFF; font-size:0.95rem;">👨‍⚕️ ${d.name}</strong>
                        <button onclick="removeDoctor(${idx})" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:0.85rem;" title="Eliminar del directorio">✕</button>
                    </div>
                    <div style="color:#38BDF8; font-weight:600; margin-top:2px;">${d.specialty}</div>
                    <div style="color:#CBD5E1; margin-top:6px;">📍 ${d.institution}</div>
                    <div style="color:#94A3B8; margin-top:4px;">📞 ${d.contact}</div>
                `;
                container.appendChild(card);
            });
        }
    }
}

function removeDoctor(idx) {
    if (confirm("¿Deseas eliminar este doctor de tu directorio personal?")) {
        state.doctors.splice(idx, 1);
        saveDoctors();
        renderDoctorDirectory();
        showToast("Doctor Eliminado", "Se quitó el médico de tu directorio personal.", "info");
    }
}

function renderAppointmentsTable() {
    const tbody = document.getElementById('appointments-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (state.appointments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:20px; color:#94A3B8;">
                    No tienes citas registradas. Agenda tu primera cita en el formulario superior.
                </td>
            </tr>
        `;
    } else {
        state.appointments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        state.appointments.forEach((a, idx) => {
            const dateStr = new Date(a.date).toLocaleString();
            const isDone = a.status === 'Completada';
            const badgeBg = isDone ? '#10B981' : '#3B82F6';

            const tr = document.createElement('tr');
            tr.style.cssText = "border-bottom:1px solid #1E293B;";
            tr.innerHTML = `
                <td style="padding:10px;"><strong style="color:#FFF;">${dateStr}</strong></td>
                <td style="padding:10px;"><strong style="color:#38BDF8;">${a.doctorName}</strong><br><small style="color:#94A3B8;">${a.specialty}</small></td>
                <td style="padding:10px;">${a.contact || 'N/A'}</td>
                <td style="padding:10px;"><div>${a.reason}</div><small style="color:#94A3B8;">${a.notes || ''}</small></td>
                <td style="padding:10px;"><span style="background:${badgeBg}; color:#fff; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">${a.status}</span></td>
                <td style="padding:10px; display:flex; gap:6px;">
                    ${!isDone ? `<button onclick="toggleAppointmentStatus(${idx})" class="btn btn-outline-success btn-sm" style="border:1px solid #10B981; color:#10B981; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;" title="Marcar como completada">✓ Completar</button>` : ''}
                    <button onclick="triggerEmailReminderForAppointment(${idx})" class="btn btn-outline-info btn-sm" style="border:1px solid #38BDF8; color:#38BDF8; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;" title="Enviar recordatorio por correo">✉️ Email</button>
                    <button onclick="removeAppointment(${idx})" class="btn btn-outline-danger btn-sm" style="border:1px solid #EF4444; color:#EF4444; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;" title="Cancelar cita">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function toggleAppointmentStatus(idx) {
    if (state.appointments[idx]) {
        state.appointments[idx].status = 'Completada';
        saveAppointments();
        renderAppointmentsView();
        showToast("Cita Completada", "La consulta fue marcada como completada.", "success");
    }
}

function removeAppointment(idx) {
    if (confirm("¿Deseas cancelar/eliminar esta cita médica?")) {
        state.appointments.splice(idx, 1);
        saveAppointments();
        renderAppointmentsView();
        showToast("Cita Eliminada", "Se canceló la cita médica del registro.", "info");
    }
}

function triggerEmailReminderForAppointment(idx) {
    const appItem = state.appointments[idx];
    if (!appItem) return;

    const email = state.currentUser ? state.currentUser.email : 'usuario@correo.com';
    document.getElementById('reminder-email-target').innerText = email;
    document.getElementById('reminder-email-subject').innerText = `Recordatorio: Cita Médica con ${appItem.doctorName} (${appItem.specialty})`;
    
    document.getElementById('reminder-email-body').innerHTML = `
        Hola <strong>${email}</strong>,<br><br>
        Te recordamos tu próxima cita médica de seguimiento:<br>
        📅 <strong>Fecha y Hora:</strong> ${new Date(appItem.date).toLocaleString()}<br>
        👨‍⚕️ <strong>Médico Especialista:</strong> ${appItem.doctorName} (${appItem.specialty})<br>
        📞 <strong>Contacto / Ubicación:</strong> ${appItem.contact || 'Consultorio'}<br>
        📋 <strong>Motivo de Consulta:</strong> ${appItem.reason}<br>
        💡 <strong>Notas del Paciente:</strong> ${appItem.notes || 'Llevar exámenes recientes en ayuno.'}<br><br>
        <em>Por favor confirma asistencia con tu especialista.</em>
    `;

    document.getElementById('email-reminder-modal').classList.remove('hidden');
    logEvent("Envío de Recordatorio por Correo", `Se notificó la cita del ${appItem.date} con ${appItem.doctorName} al correo ${email}.`);
    showToast("Recordatorio Enviado", `Correo de recordatorio enviado a ${email}.`, "success");
}

// 9. UI VIEW SWITCHER & RENDER LOGIC
function switchActiveView(viewId) {
    const views = document.querySelectorAll('.view-section');
    views.forEach(v => v.classList.remove('active'));
    
    const activeView = document.getElementById(viewId);
    if (activeView) activeView.classList.add('active');
    
    // Update sidebar navigation active style
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-view') === viewId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update Title in Topbar
    const titleMap = {
        'dashboard-view': 'Panel de Salud & Analytics',
        'upload-view': 'Cargar Examen Médico',
        'profile-view': 'Perfil y Antecedentes Médicos',
        'interpretation-view': 'Interpretación y Planes con IA',
        'doctor-view': 'Portal del Médico Specialist',
        'audit-view': 'Consola de Auditoría y Seguridad'
    };
    document.getElementById('view-title').innerText = titleMap[viewId] || 'Health Analytics';
    
    // Trigger chart refreshes or actions if switching views
    if (viewId === 'dashboard-view') {
        renderCharts();
        renderComparisonTable();
    } else if (viewId === 'interpretation-view') {
        renderAiReportView();
    } else if (viewId === 'doctor-view') {
        renderDoctorPortal();
    } else if (viewId === 'audit-view') {
        renderAuditLogsTable();
    }
}

// Attach listeners to sidebar nav
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = item.getAttribute('data-view');
        if (viewId) switchActiveView(viewId);
    });
});

// Segmented Role Switcher event
document.querySelectorAll('input[name="role"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const selectedRole = e.target.id.replace('role-', '');
        state.activeRole = selectedRole;
        
        // Show/hide sections in sidebar based on role
        const docNav = document.getElementById('nav-section-doctor');
        const patientNav = document.getElementById('nav-section-patient');
        const sidebarRoleBadge = document.getElementById('sidebar-role-badge');
        
        if (selectedRole === 'doctor') {
            docNav.classList.remove('hidden');
            patientNav.classList.add('hidden');
            sidebarRoleBadge.innerText = 'Médico';
            sidebarRoleBadge.className = 'role-badge bg-success';
            switchActiveView('doctor-view');
        } else if (selectedRole === 'auditor') {
            docNav.classList.add('hidden');
            patientNav.classList.add('hidden');
            sidebarRoleBadge.innerText = 'Auditor';
            sidebarRoleBadge.className = 'role-badge bg-warning';
            switchActiveView('audit-view');
        } else {
            docNav.classList.add('hidden');
            patientNav.classList.remove('hidden');
            sidebarRoleBadge.innerText = 'Paciente';
            sidebarRoleBadge.className = 'role-badge';
            switchActiveView('dashboard-view');
        }
        
        logEvent("Cambio de Rol", `El usuario cambió al rol de: ${selectedRole.toUpperCase()}`);
        showToast("Rol Cambiado", `Nivel de acceso ajustado a: ${selectedRole.toUpperCase()}`, "info");
    });
});


// ==========================================================================
// CONTROLADORES DE EVENTOS DE AUTENTICACIÓN, CORREO DE CONFIRMACIÓN Y CITAS
// ==========================================================================

// Pestañas de Login / Registro
const tabRegister = document.getElementById('tab-auth-register');
const tabLogin = document.getElementById('tab-auth-login');
const boxRegister = document.getElementById('auth-register-box');
const boxLogin = document.getElementById('auth-login-box');

if (tabRegister && tabLogin && boxRegister && boxLogin) {
    tabRegister.addEventListener('click', () => {
        tabRegister.className = "btn btn-sm btn-primary";
        tabLogin.className = "btn btn-sm btn-outline";
        boxRegister.classList.remove('hidden');
        boxLogin.classList.add('hidden');
    });
    tabLogin.addEventListener('click', () => {
        tabLogin.className = "btn btn-sm btn-primary";
        tabRegister.className = "btn btn-sm btn-outline";
        boxLogin.classList.remove('hidden');
        boxRegister.classList.add('hidden');
    });
}

// 1. Registro de Usuario con Confirmación por Email
document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name') ? document.getElementById('reg-name').value : 'Usuario Nuevo';
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const consent = document.getElementById('reg-consent').checked;
    
    if (!consent) {
        showToast("Error de Consentimiento", "Debes aceptar el tratamiento de datos para registrarte.", "danger");
        return;
    }

    const newUser = {
        email,
        name,
        password,
        status: 'pending_confirmation',
        termsAccepted: false,
        termsAcceptedAt: null,
        googleAuth: false,
        createdDate: new Date().toISOString()
    };

    upsertUserInDb(newUser);
    logEvent("Registro Iniciado", `Cuenta registrada para ${email}. Pendiente de confirmación por correo.`);

    // Desplegar Modal de Correo Electrónico Enviado
    document.getElementById('confirm-email-target').innerText = email;
    document.getElementById('email-confirmation-modal').classList.remove('hidden');
    showToast("Correo Enviado", `Hemos enviado las instrucciones de activación a ${email}.`, "info");
});

// 2. Acción de Confirmar Cuenta y Aceptar Términos desde el Correo Simulado
document.getElementById('btn-confirm-account-action').addEventListener('click', () => {
    const emailTarget = document.getElementById('confirm-email-target').innerText;
    const user = findUserInDb(emailTarget);
    
    if (user) {
        user.status = 'active';
        user.termsAccepted = true;
        user.termsAcceptedAt = new Date().toISOString();
        upsertUserInDb(user);
        
        state.currentUser = { email: user.email, name: user.name };
        localStorage.setItem('health_active_user', JSON.stringify(state.currentUser));
        loadUserData();
        
        logEvent("Confirmación por Email", `Usuario ${user.email} confirmó su cuenta y aceptó Términos & Condiciones por correo.`);
        logEvent("Consentimiento de Datos", "Tratamiento de datos firmado e inmutable en reposo (AES-256).");
        
        document.getElementById('email-confirmation-modal').classList.add('hidden');
        document.getElementById('auth-view').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('user-display-email').innerText = user.email;
        document.getElementById('user-avatar-char').innerText = user.email.charAt(0).toUpperCase();
        
        showToast("Cuenta Activada", `Bienvenido a HealthAnalytics, ${user.email}!`, "success");
        switchActiveView('profile-view');
        updateUI();
    }
});

document.getElementById('btn-close-email-modal').addEventListener('click', () => {
    document.getElementById('email-confirmation-modal').classList.add('hidden');
});

// 3. Autenticación Directa con Google (Fix Inicio de Sesión Google)
document.getElementById('btn-google-auth').addEventListener('click', () => {
    const googleUser = {
        email: "google.user@gmail.com",
        name: "Google Verified User",
        password: "OAuthGoogleTokenSimulated",
        status: "active",
        termsAccepted: true,
        termsAcceptedAt: new Date().toISOString(),
        googleAuth: true,
        createdDate: new Date().toISOString()
    };

    upsertUserInDb(googleUser);
    state.currentUser = { email: googleUser.email, name: googleUser.name };
    localStorage.setItem('health_active_user', JSON.stringify(state.currentUser));
    loadUserData();

    logEvent("Autenticación con Google", `Inicio de sesión exitoso mediante OAuth Google para ${googleUser.email}.`);
    
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('user-display-email').innerText = googleUser.email;
    document.getElementById('user-avatar-char').innerText = "G";

    showToast("Sesión con Google", `Ingreso exitoso con Google: ${googleUser.email}`, "success");
    switchActiveView('dashboard-view');
    updateUI();
});

// 4. Formulario de Iniciar Sesión Existente
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        const user = findUserInDb(email);
        if (!user) {
            // Auto register if user doesn't exist for seamless UX
            const newUser = {
                email,
                name: email.split('@')[0],
                password,
                status: 'active',
                termsAccepted: true,
                termsAcceptedAt: new Date().toISOString(),
                googleAuth: false,
                createdDate: new Date().toISOString()
            };
            upsertUserInDb(newUser);
            state.currentUser = { email: newUser.email, name: newUser.name };
        } else {
            if (user.status === 'pending_confirmation') {
                document.getElementById('confirm-email-target').innerText = user.email;
                document.getElementById('email-confirmation-modal').classList.remove('hidden');
                showToast("Activación Pendiente", "Por favor confirma tu cuenta en el correo enviado.", "warning");
                return;
            }
            state.currentUser = { email: user.email, name: user.name };
        }

        localStorage.setItem('health_active_user', JSON.stringify(state.currentUser));
        loadUserData();

        logEvent("Inicio de Sesión", `Usuario ${state.currentUser.email} inició sesión correctamente.`);
        
        document.getElementById('auth-view').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('user-display-email').innerText = state.currentUser.email;
        document.getElementById('user-avatar-char').innerText = state.currentUser.email.charAt(0).toUpperCase();

        showToast("Sesión Iniciada", `Bienvenido de nuevo, ${state.currentUser.email}!`, "success");
        switchActiveView('dashboard-view');
        updateUI();
    });
}

// 4.5 Cierre de Sesión (Logout)
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        
        logEvent("Cierre de Sesión", `El usuario ${state.currentUser ? state.currentUser.email : ''} cerró sesión.`);
        
        // Limpiar almacenamiento de sesión activa
        localStorage.removeItem('health_active_user');
        
        // Reiniciar memoria del estado global
        state.currentUser = null;
        state.exams = [];
        state.profile = JSON.parse(JSON.stringify(EMPTY_PROFILE));
        state.doctors = [];
        state.appointments = [];
        state.activeRole = 'patient';
        
        // Limpiar campos de formularios e inputs del DOM
        const regForm = document.getElementById('register-form');
        if (regForm) regForm.reset();
        const loginForm = document.getElementById('login-form');
        if (loginForm) loginForm.reset();
        const profForm = document.getElementById('profile-form');
        if (profForm) profForm.reset();
        
        const ocrCard = document.getElementById('ocr-result-card');
        if (ocrCard) ocrCard.classList.add('hidden');
        const ocrLoader = document.getElementById('ocr-loader');
        if (ocrLoader) ocrLoader.classList.add('hidden');
        
        // Limpiar textos y avatares de la barra lateral
        const displayEmail = document.getElementById('user-display-email');
        if (displayEmail) displayEmail.innerText = "usuario@correo.com";
        const avatarChar = document.getElementById('user-avatar-char');
        if (avatarChar) avatarChar.innerText = "U";
        
        // Reiniciar selectores de roles y menús laterales
        const rolePatient = document.getElementById('role-patient');
        if (rolePatient) rolePatient.checked = true;
        const navDoctor = document.getElementById('nav-section-doctor');
        if (navDoctor) navDoctor.classList.add('hidden');
        const navPatient = document.getElementById('nav-section-patient');
        if (navPatient) navPatient.classList.remove('hidden');
        const sidebarRoleBadge = document.getElementById('sidebar-role-badge');
        if (sidebarRoleBadge) {
            sidebarRoleBadge.innerText = 'Paciente';
            sidebarRoleBadge.className = 'role-badge';
        }
        
        // Destruir instancias de gráficos activos para liberar memoria de renderizado
        if (typeof evolutionChart !== 'undefined' && evolutionChart) { evolutionChart.destroy(); evolutionChart = null; }
        if (typeof radarChart !== 'undefined' && radarChart) { radarChart.destroy(); radarChart = null; }
        if (typeof projectionChart !== 'undefined' && projectionChart) { projectionChart.destroy(); projectionChart = null; }
        
        // Refrescar UI (volverá a mostrar marcadores vacíos)
        updateUI();
        
        // Ocultar la aplicación y mostrar pantalla de autenticación
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('auth-view').classList.remove('hidden');
        
        showToast("Sesión Cerrada", "Has cerrado sesión de forma segura.", "info");
    });
}


// 5. Formulario de Doctores Tratantes (Directorio)
const btnToggleDocForm = document.getElementById('btn-toggle-add-doctor-form');
const docFormContainer = document.getElementById('add-doctor-form-container');
const btnCancelDocForm = document.getElementById('btn-cancel-doctor-form');

if (btnToggleDocForm && docFormContainer) {
    btnToggleDocForm.addEventListener('click', () => {
        docFormContainer.classList.toggle('hidden');
    });
}
if (btnCancelDocForm && docFormContainer) {
    btnCancelDocForm.addEventListener('click', () => {
        docFormContainer.classList.add('hidden');
    });
}

document.getElementById('add-doctor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('doc-dir-name').value;
    const specialty = document.getElementById('doc-dir-specialty').value;
    const contact = document.getElementById('doc-dir-contact').value;
    const institution = document.getElementById('doc-dir-institution').value;

    const newDoc = {
        id: 'DOC-' + Date.now(),
        name,
        specialty,
        contact,
        institution
    };

    state.doctors.push(newDoc);
    saveDoctors();
    renderDoctorDirectory();

    document.getElementById('add-doctor-form').reset();
    if (docFormContainer) docFormContainer.classList.add('hidden');

    logEvent("Doctor Registrado", `Se agregó a ${name} (${specialty}) al directorio personal.`);
    showToast("Doctor Guardado", `Doctor ${name} registrado en tu directorio.`, "success");
});

// 6. Formulario de Agendamiento de Citas
document.getElementById('appointment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const docSelectVal = document.getElementById('app-select-doctor').value;
    let doctorName = "Dr. Asignado";
    let specialty = document.getElementById('app-specialty').value;
    let contact = "";

    if (docSelectVal && docSelectVal !== "manual") {
        const parts = docSelectVal.split('|');
        doctorName = parts[0] || doctorName;
        if (parts[1]) specialty = parts[1];
        if (parts[2]) contact = parts[2];
    } else {
        doctorName = "Médico Tratante";
    }

    const dateVal = document.getElementById('app-date').value;
    const reason = document.getElementById('app-reason').value;
    const notes = document.getElementById('app-notes').value;

    const newApp = {
        id: 'APP-' + Date.now(),
        date: dateVal,
        doctorName,
        specialty,
        contact,
        reason,
        notes,
        status: 'Programada'
    };

    state.appointments.push(newApp);
    saveAppointments();
    renderAppointmentsView();

    document.getElementById('appointment-form').reset();
    logEvent("Cita Agendada", `Cita médica agendada para el ${dateVal} con ${doctorName} (${specialty}).`);
    showToast("Cita Agendada", `Cita con ${doctorName} programada exitosamente.`, "success");
});

// Botón de Agendar Especialista Recomendado
const btnQuickBookRec = document.getElementById('btn-quick-book-rec');
if (btnQuickBookRec) {
    btnQuickBookRec.addEventListener('click', () => {
        const titleText = document.getElementById('rec-spec-title').innerText.replace('🩺 Especialista Recomendado: ', '');
        document.getElementById('app-specialty').value = titleText;
        document.getElementById('app-reason').value = `Consulta de seguimiento con ${titleText} según recomendación de examen.`;
        document.getElementById('appointment-form').scrollIntoView({ behavior: 'smooth' });
        showToast("Formulario Listo", `Completa la fecha y hora para tu cita con ${titleText}.`, "info");
    });
}

// Botón de Recordatorio por Correo Ahora
const btnTriggerReminder = document.getElementById('btn-trigger-email-reminder');
if (btnTriggerReminder) {
    btnTriggerReminder.addEventListener('click', () => {
        if (state.appointments.length > 0) {
            triggerEmailReminderForAppointment(0);
        } else {
            showToast("Sin Citas", "Agenda tu primera cita médica para enviar recordatorios por correo.", "warning");
        }
    });
}

const btnCloseReminderModal = document.getElementById('btn-close-reminder-modal');
if (btnCloseReminderModal) {
    btnCloseReminderModal.addEventListener('click', () => {
        document.getElementById('email-reminder-modal').classList.add('hidden');
    });
}


// Save Profile form
document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    state.profile.age = parseInt(document.getElementById('prof-age').value);
    state.profile.sex = document.getElementById('prof-sex').value;
    state.profile.weight = parseFloat(parseFloat(document.getElementById('prof-weight').value).toFixed(1));
    state.profile.height = parseInt(document.getElementById('prof-height').value);
    state.profile.pregnancy = document.getElementById('prof-pregnancy').value;
    state.profile.activity = document.getElementById('prof-activity').value;
    
    // Formatear medicamentos ingresados por el usuario
    const medsRaw = document.getElementById('prof-meds').value;
    state.profile.meds = medsRaw.split(',')
                                .map(m => m.trim())
                                .filter(m => m.length > 0)
                                .map(m => m.charAt(0).toUpperCase() + m.slice(1))
                                .join(', ');
    
    // Formatear lesiones o restricciones físicas
    const injuriesRaw = document.getElementById('prof-injuries').value;
    state.profile.injuries = injuriesRaw.split(',')
                                        .map(i => i.trim())
                                        .filter(i => i.length > 0)
                                        .map(i => i.charAt(0).toUpperCase() + i.slice(1))
                                        .join(', ');
                                        
    state.profile.goal = document.getElementById('prof-goal').value;
    state.profile.diet = document.getElementById('prof-diet').value;
    state.profile.gym = document.getElementById('prof-gym').value;
    state.profile.budget = document.getElementById('prof-budget').value;
    
    // Read diseases
    const diseaseChecks = document.querySelectorAll('input[name="disease"]:checked');
    state.profile.diseases = Array.from(diseaseChecks).map(cb => cb.value);
    
    // Reflejar de inmediato los valores formateados en los campos visuales del formulario
    document.getElementById('prof-meds').value = state.profile.meds;
    document.getElementById('prof-injuries').value = state.profile.injuries;
    document.getElementById('prof-weight').value = state.profile.weight;
    
    saveProfile();
    switchActiveView('dashboard-view');
});

// Eliminar cuenta y todos los datos clínicos asociados (HU-01 / Secc 4.6 Derecho de Supresión)
document.getElementById('btn-delete-account').addEventListener('click', () => {
    if (!state.currentUser) return;
    const email = state.currentUser.email;
    
    if (confirm(`¿Estás seguro de que deseas eliminar permanentemente todos tus datos clínicos y tu cuenta (${email})? Esta acción es definitiva y no se puede deshacer.`)) {
        logEvent("Eliminación de Datos", `El usuario solicitó la eliminación permanente de su cuenta y todos sus datos clínicos.`);
        
        // Borrar datos específicos del usuario en localStorage
        localStorage.removeItem(`health_profile_${email}`);
        localStorage.removeItem(`health_exams_${email}`);
        
        // Limpiar de la cola global de validación médica si existía
        state.pendingValidations = state.pendingValidations.filter(v => v.patientEmail !== email);
        localStorage.setItem('health_pending_validations', JSON.stringify(state.pendingValidations));
        
        // Mostrar confirmación y forzar el cierre de sesión y vaciado de memoria
        showToast("Datos Eliminados", "Tu cuenta e historial de exámenes han sido borrados permanentemente.", "success");
        document.getElementById('btn-logout').click();
    }
});

// Restablecimiento global de la base de datos local (Limpieza completa para pruebas)
document.getElementById('btn-reset-db').addEventListener('click', () => {
    if (confirm("¿Estás seguro de que deseas restablecer por completo la base de datos local del sistema? Se borrarán todos los perfiles de usuario, historias clínicas, logs de auditoría y validaciones del médico. Esta acción no se puede deshacer.")) {
        // Limpiar todas las claves de localStorage para este origen
        localStorage.clear();
        
        // Reiniciar variables en memoria del estado global
        state.currentUser = null;
        state.exams = [];
        state.profile = JSON.parse(JSON.stringify(EMPTY_PROFILE));
        state.activeRole = 'patient';
        state.pendingValidations = [];
        state.auditLogs = [];
        
        // Registrar el evento de restauración (inicializará un nuevo log)
        logEvent("Restablecimiento del Sistema", "La base de datos local fue completamente vaciada por el usuario.");
        
        // Limpiar campos de formularios en el DOM
        document.getElementById('register-form').reset();
        document.getElementById('profile-form').reset();
        document.getElementById('ocr-result-card').classList.add('hidden');
        document.getElementById('ocr-loader').classList.add('hidden');
        
        // Limpiar cabecera de la barra lateral
        document.getElementById('user-display-email').innerText = "usuario@correo.com";
        document.getElementById('user-avatar-char').innerText = "U";
        
        // Destruir instancias de gráficos activos
        if (evolutionChart) { evolutionChart.destroy(); evolutionChart = null; }
        if (radarChart) { radarChart.destroy(); radarChart = null; }
        if (projectionChart) { projectionChart.destroy(); projectionChart = null; }
        
        // Refrescar UI (vuelve al estado vacío con marcadores por defecto)
        updateUI();
        
        showToast("Sistema Restablecido", "La base de datos local se ha vaciado por completo de forma exitosa.", "success");
    }
});

// Sex change handles pregnancy dropdown visibility
document.getElementById('prof-sex').addEventListener('change', (e) => {
    const container = document.getElementById('pregnancy-container');
    if (e.target.value === 'F') {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
        document.getElementById('prof-pregnancy').value = 'N';
    }
});

// 10. OCR UPLOAD & SIMULATION PROCEDURES
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

document.getElementById('btn-browse-file').addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleExamFile(e.target.files[0]);
    }
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleExamFile(e.dataTransfer.files[0]);
    }
});

// Helper to pre-populate historical exams based on chosen preset theme for realistic chart visuals
function prepopulateHistory(presetKey) {
    const date3m = new Date();
    date3m.setMonth(date3m.getMonth() - 3);
    const str3m = date3m.toISOString().split('T')[0];
    
    const date6m = new Date();
    date6m.setMonth(date6m.getMonth() - 6);
    const str6m = date6m.toISOString().split('T')[0];
    
    let hist1 = {}, hist2 = {};
    
    if (presetKey === 'healthy') {
        hist1 = { glucosa: 95, hba1c: 5.4, colesterol_total: 190, ldl: 110, hdl: 48, trigliceridos: 130, creatinina: 0.8, tsh: 1.9, vitamina_d: 32, hemoglobina: 14.0, ferritina: 80, peso: 75 };
        hist2 = { glucosa: 90, hba1c: 5.3, colesterol_total: 180, ldl: 98, hdl: 52, trigliceridos: 120, creatinina: 0.8, tsh: 1.8, vitamina_d: 35, hemoglobina: 14.1, ferritina: 83, peso: 73 };
    } else if (presetKey === 'diabetic_critical') {
        hist1 = { glucosa: 170, hba1c: 7.9, colesterol_total: 240, ldl: 162, hdl: 34, trigliceridos: 250, creatinina: 1.0, tsh: 2.3, vitamina_d: 22, hemoglobina: 13.8, ferritina: 55, peso: 89 };
        hist2 = { glucosa: 210, hba1c: 8.5, colesterol_total: 230, ldl: 155, hdl: 35, trigliceridos: 240, creatinina: 1.1, tsh: 2.4, vitamina_d: 20, hemoglobina: 13.6, ferritina: 52, peso: 88 };
    } else if (presetKey === 'cholesterol_high') {
        hist1 = { glucosa: 110, hba1c: 6.1, colesterol_total: 285, ldl: 195, hdl: 30, trigliceridos: 210, creatinina: 0.9, tsh: 1.6, vitamina_d: 30, hemoglobina: 14.8, ferritina: 115, peso: 84 };
        hist2 = { glucosa: 108, hba1c: 6.0, colesterol_total: 275, ldl: 188, hdl: 31, trigliceridos: 205, creatinina: 0.9, tsh: 1.5, vitamina_d: 31, hemoglobina: 14.9, ferritina: 118, peso: 83 };
    } else if (presetKey === 'anemia') {
        hist1 = { glucosa: 92, hba1c: 5.2, colesterol_total: 165, ldl: 90, hdl: 45, trigliceridos: 95, creatinina: 0.7, tsh: 2.2, vitamina_d: 18, hemoglobina: 11.2, ferritina: 15, peso: 62 };
        hist2 = { glucosa: 91, hba1c: 5.1, colesterol_total: 162, ldl: 87, hdl: 46, trigliceridos: 92, creatinina: 0.7, tsh: 2.1, vitamina_d: 14, hemoglobina: 10.4, ferritina: 12, peso: 61 };
    }
    
    // Save to global state history
    const exam1 = {
        id: "EX-H1-" + Math.floor(Math.random() * 100000),
        date: str6m,
        values: hist1,
        validationStatus: "approved",
        validatedBy: "Dr. Alejandro Mendoza (Endocrinólogo - Céd. 98223)",
        validationDate: str6m,
        rulesResult: runClinicalRulesEngine(hist1, state.profile),
    };
    exam1.aiReport = orchestrateAiReport(state.profile, exam1, exam1.rulesResult);
    
    const exam2 = {
        id: "EX-H2-" + Math.floor(Math.random() * 100000),
        date: str3m,
        values: hist2,
        validationStatus: "approved",
        validatedBy: "Dr. Alejandro Mendoza (Endocrinólogo - Céd. 98223)",
        validationDate: str3m,
        rulesResult: runClinicalRulesEngine(hist2, state.profile),
    };
    exam2.aiReport = orchestrateAiReport(state.profile, exam2, exam2.rulesResult);
    
    state.exams = [exam1, exam2];
    saveExams();
}

// Preset Chips clicks
document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const presetKey = chip.getAttribute('data-preset');
        if (EXAM_PRESETS[presetKey]) {
            prepopulateHistory(presetKey);
            runOcrScanSimulation(EXAM_PRESETS[presetKey]);
        }
    });
});

// PDF.js extraction functions to parse files client-side
async function extractTextFromPdf(arrayBuffer) {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
    }
    return fullText;
}

function parseClinicalText(text) {
    const normalized = text.replace(/\s+/g, ' ');
    console.log("PDF Text Extracted (Normalized):", normalized);
    
    // START WITH EMPTY OBJECT - NEVER INVENT DEFAULT VALUES
    const values = {};
    
    const patterns = [
        { key: 'glucosa', regex: /(?:GLICEMIA|GLUCOSA)(?:\s+(?:PRE|BASAL|EN AYUNAS|SERICA))?(?!\s*2\s*HORAS)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'hba1c', regex: /(?:HEMOGLOBINA\s+GLICOSILADA|HEMOGLOBINA\s+GLICADA|HBA1C)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'colesterol_total', regex: /COLESTEROL\s+TOTAL[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'ldl', regex: /(?:COLESTEROL\s+LDL(?:[\s\-]*CALCULADO)?|LDL\s+COLESTEROL)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'hdl', regex: /(?:COLESTEROL\s+HDL|HDL\s+COLESTEROL)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'trigliceridos', regex: /TRIGLIC[EÉ]RIDOS[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'creatinina', regex: /CREATININA(?:\s+(?:EN SUERO|SERICA))?[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'tsh', regex: /(?:HORMONA\s+ESTIMULANTE\s+DE[L]?\s+TIROIDES(?:\s+ULTRASENSIBLE)?|TSH(?:\s+ULTRASENSIBLE)?)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'vitamina_d', regex: /(?:VITAMINA\s+D(?:3|2)?|25[\-\s]*OH[\-\s]*VITAMINA\s+D)(?:[\s\-\_]*25[\s\-\_]*(?:HIDROXI|OH))?[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'vitamina_b12', regex: /(?:VITAMINA\s+B12|VITAMINA\s+B\-12)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'acido_urico', regex: /(?:ACIDO\s+URICO|[ÁA]CIDO\s+[ÚU]RICO)(?:\s+(?:EN SUERO|SERICO))?[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'hemoglobina', regex: /HEMOGLOBINA(?!\s+GLIC)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'ferritina', regex: /FERRITINA(?:\s+(?:EN SUERO|SERICA))?[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'potasio', regex: /POTASIO(?:\s+(?:EN SUERO|SERICO))?[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'sodio', regex: /SODIO(?:\s+(?:EN SUERO|SERICO))?[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'alt_tgp', regex: /(?:ALANINO\s+AMINO\s+TRANSFERASA(?:\s*\([^)]*\))?|ALAT|TGP|ALT)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'ast_tgo', regex: /(?:ASPARTATO\s+AMINO\s+TRANSFERASA(?:\s*\([^)]*\))?|ASAT|TGO|AST)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'ggt', regex: /(?:GAMA\s+GLUTAMIL\s+TRANSFERASA|GAMMA\s+GLUTAMIL\s+TRANSFERASA|GGT)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'insulina', regex: /INSULINA(?:\s+BASAL)?[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 'psa', regex: /(?:ANTIGENO\s+PROSTATICO(?:\s+ESPECIFICO)?|PSA)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i },
        { key: 't4_libre', regex: /(?:T[\s\-]*4\s+LIBRE|TIROXINA\s+LIBRE)[^\d]{0,40}?(\d+(?:[\.,]\d+)?)/i }
    ];

    for (const item of patterns) {
        const match = item.regex.exec(normalized);
        if (match && match[1]) {
            const rawVal = match[1].replace(',', '.');
            const num = parseFloat(rawVal);
            if (!isNaN(num)) {
                values[item.key] = num;
                console.log(`Parsed biomarker ${item.key}: ${num}`);
            }
        }
    }
    
    return values;
}

// Extracted date from Clinica Colsanitas PDF
function parseExamDateFromPdf(text) {
    const normalized = text.replace(/\s+/g, ' ');
    // Match "Fecha Validación: 30-06-2026" or similar
    const dateMatch = /Fecha Validación:\s*(\d{2})-(\d{2})-(\d{4})/i.exec(normalized);
    if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
        return `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }
    // Match "Fecha de ingreso 30-jun.-2026" or similar
    const ingressMatch = /Fecha de ingreso\s*(\d{2})-([a-z\.]+)-(\d{4})/i.exec(normalized);
    if (ingressMatch && ingressMatch[1] && ingressMatch[2] && ingressMatch[3]) {
        const months = {
            'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
            'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
        };
        const monthClean = ingressMatch[2].replace('.', '').toLowerCase().substring(0, 3);
        const monthNum = months[monthClean] || '06';
        return `${ingressMatch[3]}-${monthNum}-${ingressMatch[1]}`;
    }
    return new Date().toISOString().split('T')[0];
}

function handleExamFile(file) {
    const reader = new FileReader();
    
    // We start the visual OCR scanning animation immediately
    const loader = document.getElementById('ocr-loader');
    const resultCard = document.getElementById('ocr-result-card');
    
    loader.classList.remove('hidden');
    resultCard.classList.add('hidden');
    
    const progressFill = document.getElementById('ocr-progress');
    const title = document.getElementById('loader-title');
    const subtitle = document.getElementById('loader-subtitle');
    
    progressFill.style.width = '10%';
    title.innerText = "Cargando archivo...";
    subtitle.innerText = `Leyendo ${file.name}...`;
    
    reader.onload = async function(event) {
        progressFill.style.width = '30%';
        title.innerText = "Procesando documento...";
        subtitle.innerText = "Preparando análisis local de texto...";
        
        try {
            let parsedValues = {};
            let examDate = new Date().toISOString().split('T')[0];
            
            if (file.name.toLowerCase().endsWith('.pdf')) {
                logEvent("Carga de Examen", `Iniciando extracción PDF.js del archivo: ${file.name}`);
                const arrayBuffer = event.target.result;
                
                // Extract text from PDF
                progressFill.style.width = '50%';
                title.innerText = "Extrayendo texto digitalizado...";
                const pdfText = await extractTextFromPdf(arrayBuffer);
                
                progressFill.style.width = '80%';
                title.innerText = "Analizando marcadores clínicos...";
                parsedValues = parseClinicalText(pdfText);
                examDate = parseExamDateFromPdf(pdfText);
                
                const detectedCount = Object.keys(parsedValues).length;
                logEvent("Extracción Completada", `PDF parseado con éxito. Marcadores extraídos: ${detectedCount}`);
            } else {
                // Image file uploaded
                logEvent("Carga de Imagen", `Archivo de imagen cargado: ${file.name}.`);
                parsedValues = {};
            }
            
            progressFill.style.width = '100%';
            setTimeout(() => {
                loader.classList.add('hidden');
                
                const simulatedExam = {
                    name: `Escaneo: ${file.name}`,
                    date: examDate,
                    values: parsedValues
                };
                
                showOcrVerificationTable(simulatedExam);
            }, 300);
            
        } catch (error) {
            console.error("Error al procesar PDF:", error);
            loader.classList.add('hidden');
            showToast("Error de OCR", "No se pudo extraer el contenido del archivo PDF. Inténtalo de nuevo.", "danger");
            logEvent("Error de OCR", `Fallo al procesar el archivo PDF: ${error.message}`);
        }
    };
    
    reader.onerror = function() {
        loader.classList.add('hidden');
        showToast("Error de Archivo", "Error al leer el archivo local.", "danger");
    };
    
    if (file.name.toLowerCase().endsWith('.pdf')) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsDataURL(file); // fallback
    }
}

function runOcrScanSimulation(examTemplate) {
    const loader = document.getElementById('ocr-loader');
    const resultCard = document.getElementById('ocr-result-card');
    
    loader.classList.remove('hidden');
    resultCard.classList.add('hidden');
    
    // Scan steps
    const progressFill = document.getElementById('ocr-progress');
    const title = document.getElementById('loader-title');
    const subtitle = document.getElementById('loader-subtitle');
    
    logEvent("Carga de Examen", `Se cargó archivo para escaneo: ${examTemplate.name}`);
    
    let progress = 0;
    progressFill.style.width = '0%';
    
    const interval = setInterval(() => {
        progress += 20;
        progressFill.style.width = `${progress}%`;
        
        if (progress === 20) {
            title.innerText = "Extrayendo Texto...";
            subtitle.innerText = "Leyendo reporte PDF / Imagen digitalizada...";
        } else if (progress === 60) {
            title.innerText = "Identificando Indicadores Médicos...";
            subtitle.innerText = "Normalizando unidades clínicas y aislando biomarcadores...";
        } else if (progress === 80) {
            title.innerText = "Validando contra base de referencia...";
            subtitle.innerText = "Cruzando rangos según antecedentes fisiológicos...";
        } else if (progress >= 100) {
            clearInterval(interval);
            loader.classList.add('hidden');
            showOcrVerificationTable(examTemplate);
        }
    }, 400);
}

function showOcrVerificationTable(examTemplate) {
    const resultCard = document.getElementById('ocr-result-card');
    resultCard.classList.remove('hidden');
    
    document.getElementById('exam-date').value = examTemplate.date;
    
    const tbody = document.getElementById('ocr-edit-tbody');
    tbody.innerHTML = '';
    
    const entries = Object.entries(examTemplate.values || {}).filter(([k, v]) => CLINICAL_RANGES[k]);
    
    if (entries.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.id = "ocr-empty-notice";
        emptyRow.innerHTML = `
            <td colspan="5" class="text-center text-muted" style="padding: 20px;">
                ℹ️ No se detectaron biomarcadores automáticos en este archivo.<br>
                <small>Puedes agregar tus indicadores manualmente usando el botón <strong>"+ Agregar Indicador Manual"</strong> de abajo.</small>
            </td>
        `;
        tbody.appendChild(emptyRow);
    } else {
        for (const [key, val] of entries) {
            appendRowToOcrTable(key, val);
        }
    }
    
    // Scroll to verification
    resultCard.scrollIntoView({ behavior: 'smooth' });
}

function appendRowToOcrTable(key, val = "") {
    const tbody = document.getElementById('ocr-edit-tbody');
    
    // Remove empty notice if present
    const notice = document.getElementById('ocr-empty-notice');
    if (notice) notice.remove();

    // Prevent duplicate row for same key
    if (tbody.querySelector(`input[data-key="${key}"]`)) return;
    
    const config = CLINICAL_RANGES[key];
    if (!config) return;
    
    const normal = config.getNormalRange(state.profile);
    const evalResult = (val !== "" && !isNaN(val)) ? config.evaluate(val, state.profile) : { status: "Por ingresar", state: "normal" };
    
    let badgeClass = "badge-success";
    if (evalResult.state === 'altered') badgeClass = "badge-warning";
    if (evalResult.state === 'critical') badgeClass = "badge-danger";
    
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>
            <strong>${config.name}</strong>
            <button type="button" class="btn-remove-row" style="background:none;border:none;color:#ef4444;cursor:pointer;margin-left:8px;" title="Quitar este indicador">✕</button>
        </td>
        <td>
            <input type="number" step="0.01" class="editable-value-input" data-key="${key}" value="${val !== "" ? formatClinicalValue(val, key) : ''}" placeholder="Ej. ${normal.min}">
        </td>
        <td>${config.unit}</td>
        <td>${normal.min} - ${normal.max}</td>
        <td><span class="badge ${badgeClass} status-badge">${evalResult.status}</span></td>
    `;
    
    // Attach listener to update badge dynamically when user edits input
    const input = row.querySelector('.editable-value-input');
    const badge = row.querySelector('.status-badge');
    input.addEventListener('input', () => {
        const num = parseFloat(input.value);
        if (!isNaN(num)) {
            const ev = config.evaluate(num, state.profile);
            badge.innerText = ev.status;
            badge.className = `badge ${ev.state === 'critical' ? 'badge-danger' : ev.state === 'altered' ? 'badge-warning' : 'badge-success'} status-badge`;
        } else {
            badge.innerText = "Por ingresar";
            badge.className = "badge status-badge";
        }
    });

    // Remove row listener
    row.querySelector('.btn-remove-row').addEventListener('click', () => {
        row.remove();
        if (tbody.querySelectorAll('tr').length === 0) {
            showOcrVerificationTable({ date: document.getElementById('exam-date').value, values: {} });
        }
    });
    
    tbody.appendChild(row);
}

// Add manual biomarker listener
document.getElementById('btn-add-biomarker').addEventListener('click', () => {
    const keys = Object.keys(CLINICAL_RANGES);
    const existingKeys = Array.from(document.querySelectorAll('.editable-value-input')).map(i => i.getAttribute('data-key'));
    const availableKeys = keys.filter(k => !existingKeys.includes(k));
    
    if (availableKeys.length === 0) {
        showToast("Límite Alcanzado", "Todos los indicadores disponibles ya han sido agregados.", "info");
        return;
    }
    
    const listText = availableKeys.map((k, idx) => `${idx + 1}. ${CLINICAL_RANGES[k].name} (${k})`).join('\n');
    const inputChoice = prompt(`Escribe el nombre o código del indicador a agregar:\n\n${listText}`, availableKeys[0]);
    
    if (inputChoice) {
        const chosenClean = inputChoice.trim().toLowerCase();
        let matchedKey = availableKeys.find(k => k.toLowerCase() === chosenClean || CLINICAL_RANGES[k].name.toLowerCase().includes(chosenClean));
        
        if (!matchedKey && !isNaN(parseInt(chosenClean))) {
            const idx = parseInt(chosenClean) - 1;
            if (availableKeys[idx]) matchedKey = availableKeys[idx];
        }
        
        if (matchedKey && CLINICAL_RANGES[matchedKey]) {
            appendRowToOcrTable(matchedKey, "");
            showToast("Indicador Agregado", `Se agregó ${CLINICAL_RANGES[matchedKey].name}. Ingresa su valor.`, "success");
        } else {
            showToast("No encontrado", "No se encontró el indicador seleccionado.", "warning");
        }
    }
});

// Cancel OCR
document.getElementById('btn-cancel-ocr').addEventListener('click', () => {
    document.getElementById('ocr-result-card').classList.add('hidden');
    showToast("Operación Cancelada", "Los datos escaneados no fueron guardados.", "warning");
    logEvent("OCR Cancelado", "El usuario descartó los resultados de la lectura de examen.");
});

// Save Exam into clinical history (HU-05)
document.getElementById('btn-save-exam').addEventListener('click', () => {
    const inputs = document.querySelectorAll('.editable-value-input');
    const examDate = document.getElementById('exam-date').value;
    
    if (!examDate) {
        showToast("Error de Fecha", "Debes seleccionar la fecha en que se tomó el examen.", "danger");
        return;
    }
    
    const finalValues = {};
    inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        const valRaw = parseFloat(input.value);
        
        // Determinar decimales según la métrica clínica
        let decimals = 1;
        if (key === 'creatinina' || key === 'colesterol_total' || key === 'glucosa' || key === 'ldl' || key === 'hdl' || key === 'trigliceridos') {
            decimals = 2;
        }
        
        finalValues[key] = parseFloat(valRaw.toFixed(decimals));
    });
    
    const newExam = {
        id: "EX-" + Date.now(),
        date: examDate,
        values: finalValues,
        validationStatus: "pending", // Pending physician approval
        validatedBy: null,
        validationDate: null,
        rulesResult: null,
        aiReport: null
    };

    // Run rules engine
    const rulesResult = runClinicalRulesEngine(finalValues, state.profile);
    newExam.rulesResult = rulesResult;
    
    // Generate AI Report
    const aiReport = orchestrateAiReport(state.profile, newExam, rulesResult);
    newExam.aiReport = aiReport;
    
    // Add to patient history
    state.exams.push(newExam);
    state.activeExamId = newExam.id;
    
    // Sort history chronologically by date ascending
    state.exams.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Add to Doctor's Queue
    state.pendingValidations.push({
        id: newExam.id,
        patientEmail: state.currentUser.email,
        patientProfile: { ...state.profile },
        exam: newExam
    });

    saveExams();
    logEvent("Examen Registrado", `Se guardó un nuevo examen con fecha ${examDate}. Estatus: Pendiente de validación médica.`);
    showToast("Examen Guardado", "Tus datos se registraron. El análisis de IA se encuentra en revisión médica.", "success");
    
    document.getElementById('ocr-result-card').classList.add('hidden');
    
    // Redirect to AI Reports
    switchActiveView('interpretation-view');
    updateUI();
});

// 11. CHARTS RENDERING CONTROLLER (CHART.JS)
let evolutionChart = null;
let radarChart = null;
let projectionChart = null;

function renderCharts() {
    try { renderEvolutionChart(); } catch (e) { console.error("Error rendering evolution chart:", e); }
    try { renderRadarChart(); } catch (e) { console.error("Error rendering radar chart:", e); }
    try { renderProjectionChart(); } catch (e) { console.error("Error rendering projection chart:", e); }
    try { updateHealthGauge(); } catch (e) { console.error("Error updating health gauge:", e); }
    try { renderAppointmentsView(); } catch (e) { console.error("Error rendering appointments view:", e); }
}

// Health Score Gauge update
function updateHealthGauge() {
    const scoreVal = document.getElementById('health-score-val');
    const scoreStatus = document.getElementById('health-score-status');
    const fill = document.getElementById('gauge-fill');
    
    if (state.exams.length === 0) {
        scoreVal.innerText = "--";
        scoreStatus.innerText = "Sin Exámenes";
        fill.style.strokeDashoffset = "125.6";
        return;
    }
    
    const latest = getActiveExam();
    if (!latest) return;
    const score = latest.rulesResult.healthScore;
    
    scoreVal.innerText = score;
    
    // Gauge status text and color
    let statusText = "Estable";
    let color = "#10B981"; // success
    if (score < 50) {
        statusText = "Crítico";
        color = "#EF4444"; // danger
    } else if (score < 75) {
        statusText = "Requiere Seguimiento";
        color = "#F59E0B"; // warning
    }
    
    scoreStatus.innerText = statusText;
    scoreStatus.style.color = color;
    
    // Arc dash offset calculation: max dasharray is 125.6 (representing the half circle arc length)
    // 100% score = 0 offset (full arc)
    // 0% score = 125.6 offset (empty arc)
    const offset = 125.6 - (125.6 * (score / 100));
    fill.style.stroke = color;
    fill.style.strokeDashoffset = offset;
}

// Line charts for history
function renderEvolutionChart() {
    const ctx = document.getElementById('evolutionChart');
    if (!ctx) return;
    
    if (evolutionChart) {
        evolutionChart.destroy();
    }
    
    if (state.exams.length === 0) {
        // Draw empty message on canvas
        const dCtx = ctx.getContext('2d');
        dCtx.clearRect(0,0, ctx.width, ctx.height);
        dCtx.fillStyle = "#6B7280";
        dCtx.font = "14px Inter";
        dCtx.textAlign = "center";
        dCtx.fillText("No hay datos históricos disponibles. Sube exámenes para activar los gráficos.", ctx.width ? ctx.width/2 : 150, ctx.height ? ctx.height/2 : 100);
        return;
    }

    const ind1 = document.getElementById('chart-indicator-select-1').value;
    const ind2 = document.getElementById('chart-indicator-select-2').value;
    const tf = document.querySelector('input[name="timeframe"]:checked')?.value || 'all';
    
    // Filter exams by timeframe
    let filteredExams = [...state.exams];
    const now = new Date();
    if (tf === '3m') {
        filteredExams = filteredExams.filter(e => (now - new Date(e.date)) / (1000*60*60*24*30) <= 3);
    } else if (tf === '6m') {
        filteredExams = filteredExams.filter(e => (now - new Date(e.date)) / (1000*60*60*24*30) <= 6);
    } else if (tf === '1y') {
        filteredExams = filteredExams.filter(e => (now - new Date(e.date)) / (1000*60*60*24*365) <= 1);
    }

    const labels = filteredExams.map(e => e.date);
    const datasets = [];

    // Dataset 1
    if (CLINICAL_RANGES[ind1]) {
        const config = CLINICAL_RANGES[ind1];
        const data = filteredExams.map(e => e.values[ind1] !== undefined ? e.values[ind1] : null);
        
        datasets.push({
            label: config.name,
            data: data,
            borderColor: '#06B6D4',
            backgroundColor: 'rgba(6, 182, 212, 0.05)',
            tension: 0.3,
            fill: false,
            yAxisID: 'y'
        });
    }

    // Dataset 2 (Optional)
    if (ind2 !== 'none' && CLINICAL_RANGES[ind2]) {
        const config = CLINICAL_RANGES[ind2];
        const data = filteredExams.map(e => e.values[ind2] !== undefined ? e.values[ind2] : null);
        
        datasets.push({
            label: config.name,
            data: data,
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            tension: 0.3,
            fill: false,
            yAxisID: 'y1'
        });
    }

    // Normal Range Reference Band Plugin configuration (Primary variable)
    const primaryConfig = CLINICAL_RANGES[ind1];
    const normalRange = primaryConfig ? primaryConfig.getNormalRange(state.profile) : null;
    
    evolutionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#F3F4F6', font: { family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        footer: (items) => {
                            // Show reference range in tooltips
                            let text = "";
                            items.forEach(item => {
                                const datasetIndex = item.datasetIndex;
                                const dsLabel = datasets[datasetIndex].label;
                                let key = ind1;
                                if (datasetIndex === 1) key = ind2;
                                
                                if (CLINICAL_RANGES[key]) {
                                    const ref = CLINICAL_RANGES[key].getNormalRange(state.profile);
                                    const unit = CLINICAL_RANGES[key].unit;
                                    text += `Rango normal (${CLINICAL_RANGES[key].name}): ${ref.min} - ${ref.max} ${unit}\n`;
                                }
                            });
                            return text;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9CA3AF' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9CA3AF' },
                    title: {
                        display: true,
                        text: primaryConfig ? `${primaryConfig.name} (${primaryConfig.unit})` : "",
                        color: '#9CA3AF'
                    }
                },
                y1: {
                    display: ind2 !== 'none',
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#9CA3AF' },
                    title: {
                        display: true,
                        text: ind2 !== 'none' && CLINICAL_RANGES[ind2] ? `${CLINICAL_RANGES[ind2].name} (${CLINICAL_RANGES[ind2].unit})` : "",
                        color: '#9CA3AF'
                    }
                }
            }
        },
        plugins: [{
            id: 'shadingPlugin',
            beforeDraw: (chart) => {
                // If only one indicator is graphed, let's shade its normal range
                if (ind2 === 'none' && normalRange) {
                    const { ctx, chartArea, scales: { y } } = chart;
                    ctx.save();
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
                    const top = y.getPixelForValue(normalRange.max);
                    const bottom = y.getPixelForValue(normalRange.min);
                    
                    // Draw a visual shaded area
                    if (top >= chartArea.top && bottom <= chartArea.bottom) {
                        ctx.fillRect(chartArea.left, top, chartArea.width, bottom - top);
                    }
                    ctx.restore();
                }
            }
        }]
    });
}

// Chart selectors listeners
document.getElementById('chart-indicator-select-1').addEventListener('change', renderEvolutionChart);
document.getElementById('chart-indicator-select-2').addEventListener('change', renderEvolutionChart);
document.querySelectorAll('input[name="timeframe"]').forEach(r => r.addEventListener('change', renderEvolutionChart));

// Radar chart of health aspects
function renderRadarChart() {
    const ctx = document.getElementById('radarChart');
    if (!ctx) return;
    
    if (radarChart) radarChart.destroy();
    
    if (state.exams.length === 0) {
        return;
    }
    
    const latest = getActiveExam();
    if (!latest) return;
    const vals = latest.values;
    
    // Calculate category scores (100 is best)
    let cardio = 100;
    if (vals.colesterol_total > 200) cardio -= 20;
    if (vals.ldl > 100) cardio -= 30;
    if (vals.trigliceridos > 150) cardio -= 20;
    if (vals.hdl < 40) cardio -= 30;
    cardio = Math.max(20, cardio);

    let metabolic = 100;
    if (vals.glucosa > 100) metabolic -= 30;
    if (vals.hba1c > 5.6) metabolic -= 40;
    metabolic = Math.max(20, metabolic);

    let renal = 100;
    const creatininaMax = state.profile.sex === 'F' ? 1.1 : 1.3;
    if (vals.creatinina > creatininaMax) renal -= 50;
    renal = Math.max(20, renal);

    let nutricional = 100;
    if (vals.vitamina_d < 30) nutricional -= 30;
    if (vals.hemoglobina < 12) nutricional -= 40;
    if (vals.ferritina < 20) nutricional -= 30;
    nutricional = Math.max(20, nutricional);

    let condFisica = 100;
    const hM = state.profile.height / 100;
    const imc = state.profile.weight / (hM * hM);
    if (imc >= 30) condFisica -= 40;
    else if (imc >= 25) condFisica -= 15;
    if (state.profile.activity === 'sedentario') condFisica -= 20;
    condFisica = Math.max(20, condFisica);

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Cardiovascular', 'Metabólica', 'Renal', 'Nutricional', 'Condición Física'],
            datasets: [{
                label: 'Mis Indicadores',
                data: [cardio, metabolic, renal, nutricional, condFisica],
                borderColor: '#06B6D4',
                backgroundColor: 'rgba(6, 182, 212, 0.2)',
                pointBackgroundColor: '#06B6D4',
                borderWidth: 2
            }, {
                label: 'Rango Saludable Optimo',
                data: [100, 100, 100, 100, 100],
                borderColor: 'rgba(16, 185, 129, 0.4)',
                backgroundColor: 'transparent',
                borderDash: [5, 5],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    pointLabels: { color: '#9CA3AF', font: { size: 10, family: 'Inter' } },
                    ticks: { display: false },
                    min: 0,
                    max: 100
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// Trend projection based on adherence
function populateProjectionIndicators() {
    const select = document.getElementById('pred-indicator');
    if (!select) return;

    const latest = getActiveExam();
    if (!latest || !latest.values) return;

    const currentSelected = select.value;
    select.innerHTML = '';

    const keys = Object.keys(latest.values);
    if (keys.length === 0) {
        select.innerHTML = '<option value="">Sin datos en examen activo</option>';
        return;
    }

    keys.forEach(key => {
        if (!CLINICAL_RANGES[key]) return;
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = CLINICAL_RANGES[key].name;
        if (key === currentSelected) opt.selected = true;
        select.appendChild(opt);
    });

    if (!select.value && select.options.length > 0) {
        select.options[0].selected = true;
    }
}

// Trend projection based on adherence
function renderProjectionChart() {
    const ctx = document.getElementById('projectionChart');
    if (!ctx) return;
    
    if (projectionChart) projectionChart.destroy();
    
    if (state.exams.length === 0) return;
    
    const latest = getActiveExam();
    if (!latest || !latest.values) return;

    populateProjectionIndicators();

    const indicatorSelect = document.getElementById('pred-indicator');
    let indicator = indicatorSelect ? indicatorSelect.value : null;

    if (!indicator || latest.values[indicator] === undefined) {
        const availableKeys = Object.keys(latest.values);
        if (availableKeys.length > 0) {
            indicator = availableKeys[0];
        }
    }
    
    if (!indicator || latest.values[indicator] === undefined) return;
    const latestVal = latest.values[indicator];
    
    // Simulate a 6-month projection with a decrease (or increase, e.g. for HDL or vitamin D)
    const labels = ["Hoy", "Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes 6"];
    const expectedData = [latestVal];
    const upperConfidence = [latestVal];
    const lowerConfidence = [latestVal];
    
    // Simulate clinical trends
    let delta = -0.05; // 5% reduction per month
    if (indicator === 'glucosa' && latestVal > 200) delta = -0.08;
    if (indicator === 'colesterol_total' && latestVal > 220) delta = -0.04;
    if (indicator === 'hdl' || indicator === 'vitamina_d') delta = 0.04; // Positive increase
    
    for (let i = 1; i <= 6; i++) {
        const factor = 1 + (delta * i / 6);
        const projected = Math.round(latestVal * factor * 10) / 10;
        expectedData.push(projected);
        
        // Confidence intervals (+/- 8% spread at month 6)
        const spread = (latestVal * 0.08) * (i / 6);
        upperConfidence.push(Math.round((projected + spread) * 10) / 10);
        lowerConfidence.push(Math.round((projected - spread) * 10) / 10);
    }
    
    projectionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Trayectoria Estimada',
                    data: expectedData,
                    borderColor: '#10B981',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Límite Superior CI (95%)',
                    data: upperConfidence,
                    borderColor: 'rgba(239, 68, 68, 0.2)',
                    borderWidth: 1,
                    borderDash: [2, 2],
                    pointStyle: 'none',
                    pointRadius: 0,
                    fill: '+1',
                    backgroundColor: 'rgba(16, 185, 129, 0.02)'
                },
                {
                    label: 'Límite Inferior CI (95%)',
                    data: lowerConfidence,
                    borderColor: 'rgba(16, 185, 129, 0.2)',
                    borderWidth: 1,
                    borderDash: [2, 2],
                    pointStyle: 'none',
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#9CA3AF' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF' } }
            }
        }
    });
}

// Bind listener safely
const predSelectEl = document.getElementById('pred-indicator');
if (predSelectEl) {
    predSelectEl.addEventListener('change', renderProjectionChart);
}

// Dynamic engine for Next Clinical Controls
function renderNextControls() {
    const infoContainer = document.getElementById('next-checkup-date-info');
    const chkFirst = document.getElementById('chk-first-exam');
    const chkDoc = document.getElementById('chk-doctor-validation');
    const chkNext = document.getElementById('chk-next-checkup');

    if (state.exams.length === 0) {
        if (chkFirst) chkFirst.checked = false;
        if (chkDoc) chkDoc.checked = false;
        if (chkNext) chkNext.checked = false;
        if (infoContainer) infoContainer.innerText = "Carga tu primer examen clínico para calcular la fecha del próximo control.";
        return;
    }

    if (chkFirst) chkFirst.checked = true;
    const latest = getActiveExam();
    if (!latest) return;

    if (chkDoc) chkDoc.checked = latest.validationStatus === 'approved';

    let monthsToNext = 12;
    let reason = "Control preventivo anual de rutina";

    if (latest.rulesResult) {
        const hasCritical = latest.rulesResult.alerts && latest.rulesResult.alerts.some(a => a.type === 'critical');
        const hasAltered = latest.rulesResult.alerts && latest.rulesResult.alerts.length > 0;

        if (hasCritical) {
            monthsToNext = 3;
            reason = "Seguimiento prioritario por biomarcadores críticos (3 meses)";
        } else if (hasAltered) {
            monthsToNext = 6;
            reason = "Seguimiento médico por parámetros fuera de rango (6 meses)";
        }
    }

    const examDate = latest.date ? new Date(latest.date) : new Date();
    const nextDate = new Date(examDate);
    nextDate.setMonth(nextDate.getMonth() + monthsToNext);

    const dateFormatted = nextDate.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    
    if (infoContainer) {
        infoContainer.innerHTML = `📅 <strong>Próximo Examen Sugerido:</strong> ${dateFormatted}<br><span style="color:#06B6D4; font-size:0.85rem; font-weight:500;">(${reason})</span>`;
    }

    if (chkNext) chkNext.checked = false;
}

// 12. HISTORICAL COMPARISONS TABLE (RF-42 & RF-43)
function renderComparisonTable() {
    const tbody = document.getElementById('comparison-table').querySelector('tbody');
    const dateLabel = document.getElementById('comparison-date-label');
    
    if (state.exams.length < 2) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Se requieren al menos dos exámenes históricos cargados para generar la analítica comparativa.</td></tr>`;
        dateLabel.innerText = "Historial insuficiente";
        return;
    }
    
    const sortedExams = [...state.exams].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const current = sortedExams[sortedExams.length - 1];
    const previous = sortedExams[sortedExams.length - 2];
    
    dateLabel.innerText = `Examen del ${previous.date} vs Examen del ${current.date}`;
    tbody.innerHTML = '';
    
    const allKeys = new Set([
        ...Object.keys(previous.values || {}),
        ...Object.keys(current.values || {})
    ]);
    
    for (const key of allKeys) {
        if (!CLINICAL_RANGES[key]) continue;
        const config = CLINICAL_RANGES[key];
        
        const valPrev = previous.values ? previous.values[key] : undefined;
        const valCurr = current.values ? current.values[key] : undefined;
        
        const prevStr = valPrev !== undefined ? `${formatClinicalValue(valPrev, key)} ${config.unit}` : '--';
        const currStr = valCurr !== undefined ? `${formatClinicalValue(valCurr, key)} ${config.unit}` : '--';
        
        let diffAbsStr = '--';
        let diffPctStr = '--';
        let stateText = "Sin comparar";
        let badgeClass = "variation-neutral";
        
        if (valPrev !== undefined && valCurr !== undefined) {
            const diffAbs = Math.round((valCurr - valPrev) * 100) / 100;
            const diffPct = Math.round((diffAbs / valPrev) * 1000) / 10;
            
            diffAbsStr = `${diffAbs > 0 ? '+' : ''}${formatClinicalValue(diffAbs, key)} ${config.unit}`;
            diffPctStr = `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%`;
            
            let isDecreaseGood = true;
            if (key === 'hdl' || key === 'vitamina_d' || key === 'hemoglobina' || key === 'ferritina' || key === 'vitamina_b12') {
                isDecreaseGood = false;
            }
            
            if (Math.abs(diffPct) > 2.0) {
                if (diffPct > 0) {
                    stateText = isDecreaseGood ? "Empeoró" : "Mejoró";
                    badgeClass = isDecreaseGood ? "variation-up" : "variation-down";
                } else {
                    stateText = isDecreaseGood ? "Mejoró" : "Empeoró";
                    badgeClass = isDecreaseGood ? "variation-down" : "variation-up";
                }
            } else {
                stateText = "Estable";
            }
        } else if (valCurr !== undefined) {
            stateText = "Nuevo Marcador";
            badgeClass = "variation-neutral";
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${config.name}</strong></td>
            <td>${prevStr}</td>
            <td>${currStr}</td>
            <td>${diffAbsStr}</td>
            <td>${diffPctStr}</td>
            <td><span class="variation-badge ${badgeClass}">${stateText}</span></td>
        `;
        tbody.appendChild(row);
    }
}

// 13. GENERATE & RENDER REPORT IN PATIENT VIEW
function renderAiReportView() {
    try {
        const placeholder = document.getElementById('ai-placeholder-card');
        const content = document.getElementById('ai-report-content');
        
        if (state.exams.length === 0) {
            if (placeholder) placeholder.classList.remove('hidden');
            if (content) content.classList.add('hidden');
            return;
        }
        
        if (placeholder) placeholder.classList.add('hidden');
        if (content) content.classList.remove('hidden');
        
        const latest = getActiveExam() || state.exams[state.exams.length - 1];
        if (!latest) return;
        
        // Guarantee rulesResult & aiReport exist
        if (!latest.rulesResult) {
            latest.rulesResult = runClinicalRulesEngine(latest.values || {}, state.profile || {});
        }
        if (!latest.aiReport) {
            latest.aiReport = orchestrateAiReport(state.profile || {}, latest, latest.rulesResult);
        }
        
        const report = latest.aiReport || orchestrateAiReport(state.profile || {}, latest, latest.rulesResult);
        const rules = latest.rulesResult || { alerts: [], evaluations: [] };
        const alerts = rules.alerts || [];
        
        // Critical alert banner
        const alertBanner = document.getElementById('ai-critical-banner');
        const alertDesc = document.getElementById('ai-critical-banner-desc');
        if (alertBanner && alertDesc) {
            if (alerts.length > 0) {
                alertBanner.classList.remove('hidden');
                alertDesc.innerHTML = alerts.map(a => `• <strong>${a.name} (${a.value} ${a.unit})</strong>: ${a.message}`).join('<br>');
            } else {
                alertBanner.classList.add('hidden');
            }
        }
        
        // Validation status banner
        const validationBanner = document.getElementById('ai-validation-banner');
        const validationIcon = document.getElementById('validation-icon');
        const validationTitle = document.getElementById('validation-title');
        const validationSubtitle = document.getElementById('validation-subtitle');
        
        if (validationBanner) {
            if (latest.validationStatus === 'pending') {
                validationBanner.className = "doctor-validation-banner pending";
                if (validationIcon) validationIcon.innerText = "⏳";
                if (validationTitle) validationTitle.innerText = "Informe en Proceso de Revisión";
                if (validationSubtitle) validationSubtitle.innerText = "Las recomendaciones de la IA están siendo validadas por un profesional de la salud antes de su entrega definitiva.";
            } else {
                validationBanner.className = "doctor-validation-banner approved";
                if (validationIcon) validationIcon.innerText = "🛡️";
                if (validationTitle) validationTitle.innerText = `Informe Validado por Especialista`;
                if (validationSubtitle) validationSubtitle.innerText = `Revisado y aprobado el ${latest.validationDate || 'recientemente'} por ${latest.validatedBy || 'Especialista'}.`;
            }
        }
        
        // Explanations
        const elVar = document.getElementById('ai-text-variables');
        if (elVar) elVar.innerHTML = report.variableAnalysisHtml || "Sin análisis multivariable registrado.";
        const elEasy = document.getElementById('ai-text-easy');
        const elTech = document.getElementById('ai-text-technical');
        const elRisks = document.getElementById('ai-text-risks');
        if (elEasy) elEasy.innerText = report.easyExplanation || "Sin desglose registrado.";
        if (elTech) elTech.innerText = report.technicalExplanation || "Sin análisis técnico registrado.";
        if (elRisks) elRisks.innerText = report.risks || "Sin factores de riesgo elevados.";
        
        // Plans
        const elEx = document.getElementById('ai-plan-exercise');
        const elDiet = document.getElementById('ai-plan-diet');
        const elLife = document.getElementById('ai-plan-lifestyle');
        if (elEx) elEx.innerHTML = report.exercisePlan || "Sin plan asignado.";
        if (elDiet) elDiet.innerHTML = report.dietPlan || "Sin plan asignado.";
        if (elLife) elLife.innerText = report.lifestylePlan || "Sin sugerencias registradas.";
        
        // Specialist Recommendation
        const elSpecName = document.getElementById('ai-specialist-name');
        const elSpecDesc = document.getElementById('ai-specialist-desc');
        if (elSpecName) elSpecName.innerText = report.specialistName || "Médico General";
        if (elSpecDesc) elSpecDesc.innerText = report.specialistDesc || "Tus indicadores se encuentran en rangos habituales.";
        
        // RAG Citations
        const citationsList = document.getElementById('ai-citations-list');
        if (citationsList && report.citations) {
            citationsList.innerHTML = report.citations.map(c => `
                <li>
                    <span class="citation-source">📚 ${c.source}</span>
                    <span class="citation-evidence">${c.evidence}</span>
                </li>
            `).join('');
        }
        
        // Dynamic explanations of variations (RF-45)
        const variationCard = document.getElementById('ai-variation-card');
        const variationText = document.getElementById('ai-variation-text');
        
        if (state.exams.length >= 2 && variationCard && variationText) {
            variationCard.classList.remove('hidden');
            
            const current = state.exams[state.exams.length - 1];
            const previous = state.exams[state.exams.length - 2];
            
            let varHtml = "";
            
            // Find variations > 10%
            for (const [key, config] of Object.entries(CLINICAL_RANGES)) {
                const valPrev = previous.values ? previous.values[key] : undefined;
                const valCurr = current.values ? current.values[key] : undefined;
                if (valPrev === undefined || valCurr === undefined) continue;
                
                const diffPct = ((valCurr - valPrev) / valPrev) * 100;
                
                if (Math.abs(diffPct) >= 10.0) {
                    let causeDesc = "";
                    let isDecrease = diffPct < 0;
                    
                    if (key === 'glucosa' || key === 'hba1c') {
                        causeDesc = isDecrease 
                            ? "Esta disminución del azúcar en sangre se asocia habitualmente con una reducción en la ingesta de carbohidratos simples, adherencia al tratamiento de control de glucemia y la incorporación de ejercicio aeróbico ligero posterior a comidas."
                            : "El incremento significativo sugiere un consumo elevado de alimentos hiperglucémicos, disminución de la actividad física aeróbica habitual o necesidad de reajustar las dosis de hipoglucemiantes.";
                    } else if (key === 'ldl' || key === 'colesterol_total') {
                        causeDesc = isDecrease
                            ? "La baja en el colesterol malo suele estar vinculada a una dieta reducida en grasas saturadas, aumento en el aporte de fibra soluble (avena, legumbres) o efectividad de estatinas."
                            : "La subida se asocia a ingestas elevadas de lácteos enteros, carnes rojas y grasas saturadas, o predisposición genética activa.";
                    } else if (key === 'vitamina_d') {
                        causeDesc = isDecrease
                            ? "La pérdida indica baja exposición solar regular y falta de aportación en alimentos fortificados."
                            : "La mejoría se asocia positivamente a una mayor exposición a radiación UVB o suplementación terapéutica oral.";
                    } else if (key === 'hemoglobina' || key === 'ferritina') {
                        causeDesc = isDecrease
                            ? "El descenso en reservas de hierro puede estar relacionado con pérdidas sanguíneas digestivas/ginecológicas, o baja absorción en dieta vegana/vegetariana sin suplementación."
                            : "El incremento indica buena respuesta a la suplementación de sulfato ferroso y alimentos ricos en hierro hemo.";
                    } else {
                        causeDesc = `Variación significativa del ${Math.round(diffPct)}% con respecto al control del examen anterior.`;
                    }
                    
                    varHtml += `
                        <div class="variation-item-box">
                            <div class="variation-item-header">
                                <span class="variation-item-title">${config.name}</span>
                                <span class="variation-badge ${isDecrease ? 'variation-down' : 'variation-up'}">${isDecrease ? '-' : '+'}${Math.round(Math.abs(diffPct))}%</span>
                            </div>
                            <p>${causeDesc}</p>
                        </div>
                    `;
                }
            }
            
            if (varHtml === "") {
                varHtml = "<p class='text-muted'>No se registraron variaciones de indicadores superiores al 10% en comparación con el control anterior.</p>";
            }
            variationText.innerHTML = varHtml;
        } else if (variationCard) {
            variationCard.classList.add('hidden');
        }
    } catch (err) {
        console.error("Error in renderAiReportView:", err);
    }
}

// Tab headers events inside AI Report
document.querySelectorAll('.tab-header').forEach(button => {
    button.addEventListener('click', () => {
        const parent = button.closest('.report-card');
        parent.querySelectorAll('.tab-header').forEach(h => h.classList.remove('active'));
        parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// 14. DOCTOR VALIDATION WORKSPACE CONTROL (HU-11)
let selectedValidationId = null;

function renderDoctorPortal() {
    const listContainer = document.getElementById('doc-patients-list');
    
    if (state.pendingValidations.length === 0) {
        listContainer.innerHTML = `<div class="empty-patients">No hay reportes pendientes de validación.</div>`;
        document.getElementById('doc-workspace-empty').classList.remove('hidden');
        document.getElementById('doc-workspace-content').classList.add('hidden');
        return;
    }
    
    listContainer.innerHTML = state.pendingValidations.map(val => {
        const config = EXAM_PRESETS.diabetic_critical;
        const examName = val.exam.name;
        const hasAlerts = val.exam.rulesResult.alerts.length > 0;
        
        return `
            <div class="patient-nav-item ${selectedValidationId === val.id ? 'active' : ''}" data-val-id="${val.id}">
                <h4>${val.patientEmail}</h4>
                <p>Fecha examen: ${val.exam.date}</p>
                ${hasAlerts ? '<span class="badge badge-danger nav-badge">Alerta Crítica</span>' : '<span class="badge badge-info nav-badge">Evaluación</span>'}
            </div>
        `;
    }).join('');

    // Add click listeners to list items
    document.querySelectorAll('.patient-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const valId = item.getAttribute('data-val-id');
            selectedValidationId = valId;
            openDoctorWorkspace(valId);
            renderDoctorPortal(); // re-render to update active styling
        });
    });
}

function openDoctorWorkspace(valId) {
    const item = state.pendingValidations.find(v => v.id === valId);
    if (!item) return;
    
    document.getElementById('doc-workspace-empty').classList.add('hidden');
    document.getElementById('doc-workspace-content').classList.remove('hidden');
    
    // Patient header & info
    document.getElementById('doc-patient-name').innerText = item.patientEmail;
    document.getElementById('doc-patient-meta').innerText = `Edad: ${item.patientProfile.age} años | Sexo: ${item.patientProfile.sex} | Peso: ${item.patientProfile.weight} kg | Estatura: ${item.patientProfile.height} cm`;
    
    document.getElementById('doc-patient-goal').innerText = item.patientProfile.goal.replace('_', ' ');
    document.getElementById('doc-patient-diseases').innerText = item.patientProfile.diseases.length > 0 ? item.patientProfile.diseases.join(', ') : "Ninguna reportada";
    document.getElementById('doc-patient-meds').innerText = item.patientProfile.meds || "Ninguno";
    document.getElementById('doc-patient-injuries').innerText = item.patientProfile.injuries || "Ninguna";
    
    // Rules Alerts Display
    const rulesList = document.getElementById('doc-rules-list');
    rulesList.innerHTML = '';
    
    if (item.exam.rulesResult.alerts.length === 0 && item.exam.rulesResult.restrictions.length === 0) {
        rulesList.innerHTML = `<div class="rule-alert-item">El Motor de Reglas no generó alertas críticas para este examen.</div>`;
    } else {
        item.exam.rulesResult.alerts.forEach(alert => {
            const itemDiv = document.createElement('div');
            itemDiv.className = "rule-alert-item critical";
            itemDiv.innerHTML = `⚠️ ALERTA CRÍTICA: <strong>${alert.name} (${alert.value} ${alert.unit})</strong>: ${alert.message}`;
            rulesList.appendChild(itemDiv);
        });
        
        item.exam.rulesResult.restrictions.forEach(rest => {
            const itemDiv = document.createElement('div');
            itemDiv.className = "rule-alert-item";
            itemDiv.innerHTML = `🚫 RESTRICCIÓN: ${rest}`;
            rulesList.appendChild(itemDiv);
        });
    }
    
    // Pre-fill text areas with AI generated proposal for edit
    document.getElementById('doc-edit-easy').value = item.exam.aiReport.easyExplanation;
    document.getElementById('doc-edit-technical').value = item.exam.aiReport.technicalExplanation;
    document.getElementById('doc-edit-risks').value = item.exam.aiReport.risks;
    document.getElementById('doc-edit-exercise').value = item.exam.aiReport.exercisePlan;
    document.getElementById('doc-edit-diet').value = item.exam.aiReport.dietPlan;
    document.getElementById('doc-edit-lifestyle').value = item.exam.aiReport.lifestylePlan;
    
    // Pre-select specialist
    document.getElementById('doc-edit-specialist').value = item.exam.aiReport.specialistName;
}

// Approve and release report to patient (HU-11)
document.getElementById('btn-doc-approve').addEventListener('click', () => {
    if (!selectedValidationId) return;
    
    const index = state.pendingValidations.findIndex(v => v.id === selectedValidationId);
    if (index === -1) return;
    
    const validationItem = state.pendingValidations[index];
    
    // Update the actual exam object in patient's history
    const examInHistory = state.exams.find(e => e.id === validationItem.id);
    if (examInHistory) {
        examInHistory.validationStatus = "approved";
        examInHistory.validatedBy = "Dr. Alejandro Mendoza (Endocrinólogo / Internista - Céd. Clin. 98223)";
        examInHistory.validationDate = new Date().toLocaleString('es-CO');
        
        // Save modifications made by doctor
        examInHistory.aiReport.easyExplanation = document.getElementById('doc-edit-easy').value;
        examInHistory.aiReport.technicalExplanation = document.getElementById('doc-edit-technical').value;
        examInHistory.aiReport.risks = document.getElementById('doc-edit-risks').value;
        examInHistory.aiReport.exercisePlan = document.getElementById('doc-edit-exercise').value;
        examInHistory.aiReport.dietPlan = document.getElementById('doc-edit-diet').value;
        examInHistory.aiReport.lifestylePlan = document.getElementById('doc-edit-lifestyle').value;
        
        examInHistory.aiReport.specialistName = document.getElementById('doc-edit-specialist').value;
    }
    
    // Remove from doctor queue
    state.pendingValidations.splice(index, 1);
    
    saveExams();
    logEvent("Validación Médica", `Doctor validó y firmó electrónicamente el examen clínico ID ${validationItem.id} de ${validationItem.patientEmail}.`);
    showToast("Informe Validado", "El reporte y plan personalizado han sido firmados y entregados al paciente.", "success");
    
    selectedValidationId = null;
    renderDoctorPortal();
});

// 15. MAIN STATE SYNC & METRIC UPDATES
function updateUI() {
    if (state.exams.length === 0) {
        document.getElementById('kpi-altered-count').innerText = "0";
        document.getElementById('kpi-normal-count').innerText = "0";
        document.getElementById('kpi-critical-count').innerText = "0";
        document.getElementById('kpi-weight').innerText = "-- kg";
        document.getElementById('kpi-imc').innerText = "--";
        
        const badge = document.getElementById('kpi-imc-badge');
        badge.innerText = "Sin Datos";
        badge.className = "badge badge-info";
        
        document.getElementById('kpi-cardio-risk').innerText = "Carga de examen pendiente";
        document.getElementById('kpi-cardio-risk').className = "text-muted";
        
        document.getElementById('chk-first-exam').checked = false;
        document.getElementById('chk-doctor-validation').checked = false;
        document.getElementById('chk-next-checkup').checked = false;
        
        // Reset bells
        document.getElementById('alerts-badge').classList.add('hidden');
        return;
    }
    
    populateExamSelector();
    const latest = getActiveExam();
    if (!latest) return;
    
    // Compute Normal vs Altered vs Critical count
    let normal = 0, altered = 0, critical = 0;
    
    for (const [key, val] of Object.entries(latest.values)) {
        if (!CLINICAL_RANGES[key]) continue;
        const res = CLINICAL_RANGES[key].evaluate(val, state.profile);
        if (res.state === 'normal') normal++;
        if (res.state === 'altered') altered++;
        if (res.state === 'critical') critical++;
    }
    
    document.getElementById('kpi-altered-count').innerText = altered + critical;
    document.getElementById('kpi-normal-count').innerText = normal;
    document.getElementById('kpi-critical-count').innerText = critical;
    
    // Update weight & IMC
    const weight = latest.values.peso || state.profile.weight;
    document.getElementById('kpi-weight').innerText = `${weight} kg`;
    
    const hM = state.profile.height / 100;
    const imc = Math.round((weight / (hM * hM)) * 10) / 10;
    document.getElementById('kpi-imc').innerText = imc;
    
    const badge = document.getElementById('kpi-imc-badge');
    if (imc < 18.5) {
        badge.innerText = "Bajo Peso";
        badge.className = "badge badge-warning";
    } else if (imc < 25.0) {
        badge.innerText = "Normal";
        badge.className = "badge badge-success";
    } else if (imc < 30.0) {
        badge.innerText = "Sobrepeso";
        badge.className = "badge badge-warning";
    } else {
        badge.innerText = "Obesidad";
        badge.className = "badge badge-danger";
    }
    
    // Cardiovascular risk evaluation (RF-44)
    const cardioRiskLabel = document.getElementById('kpi-cardio-risk');
    let ldl = latest.values.ldl || 100;
    let trig = latest.values.trigliceridos || 100;
    
    if (ldl >= 160 || trig >= 200 || (state.profile.diseases.includes('diabetes') && ldl > 100)) {
        cardioRiskLabel.innerText = "Elevado";
        cardioRiskLabel.className = "text-danger";
    } else if (ldl > 100 || trig > 150) {
        cardioRiskLabel.innerText = "Moderado";
        cardioRiskLabel.className = "text-warning";
    } else {
        cardioRiskLabel.innerText = "Bajo";
        cardioRiskLabel.className = "text-success";
    }
    
    // Checklist updates & Next Controls calculation
    renderNextControls();
    
    // Refresh all charts & Health Score Gauge
    renderCharts();

    // Refresh historical comparison table
    renderComparisonTable();

    // Alerts dropdown in top bar
    const alertsBadge = document.getElementById('alerts-badge');
    const alertsDropdownList = document.getElementById('notifications-list');
    
    if (latest.rulesResult && latest.rulesResult.alerts && latest.rulesResult.alerts.length > 0) {
        alertsBadge.classList.remove('hidden');
        alertsBadge.innerText = latest.rulesResult.alerts.length;
        
        alertsDropdownList.innerHTML = latest.rulesResult.alerts.map(a => `
            <div class="notif-item">
                <strong>🚨 ${a.name} fuera de rango</strong>
                Valor: ${a.value} ${a.unit}. ${a.message}
            </div>
        `).join('');
    } else {
        alertsBadge.classList.add('hidden');
        alertsDropdownList.innerHTML = `<div class="empty-notifications">No hay alertas críticas en tu último reporte.</div>`;
    }
}

// Notifications toggle drop
document.getElementById('btn-notifications').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notifications-dropdown').classList.toggle('hidden');
});

document.addEventListener('click', () => {
    document.getElementById('notifications-dropdown').classList.add('hidden');
});

// Setup and Load active configs
window.addEventListener('load', () => {
    if (typeof loadState === 'function') {
        loadState();
    }
    initEnvironmentAndVersion();
    setupExtraEventListeners();
});

/* ==========================================================================
   ENTORNO, CONTROL DE VERSIONES Y PIPELINES CI/CD
   ========================================================================== */
function initEnvironmentAndVersion() {
    const envBadge = document.getElementById('env-badge');
    const versionTag = document.getElementById('app-version-tag');
    
    // Detectar entorno según el host o URL
    const isProd = window.location.hostname.includes('prod') || window.location.hostname.includes('production');
    
    if (envBadge) {
        if (isProd) {
            envBadge.innerText = "PRODUCCIÓN";
            envBadge.className = "env-badge prod";
        } else {
            envBadge.innerText = "PRUEBAS";
            envBadge.className = "env-badge staging";
        }
    }
    
    if (versionTag) {
        versionTag.innerText = "v1.0.9";
    }
}

/* ==========================================================================
   CONFIGURACIÓN DE EVENTOS DE ACCIONES (EXCEL & ELIMINAR DATOS)
   ========================================================================== */
function setupExtraEventListeners() {
    // Botón de exportación a Excel
    const btnExcel = document.getElementById('btn-export-excel');
    if (btnExcel) {
        btnExcel.addEventListener('click', exportToExcel);
    }
    
    // Botón para abrir el modal de eliminación de datos
    const btnClearData = document.getElementById('btn-clear-current-data');
    const modalClear = document.getElementById('modal-clear-data');
    const btnCloseModal = document.getElementById('btn-close-clear-modal');
    const btnCancelClear = document.getElementById('btn-cancel-clear-data');
    const btnConfirmClear = document.getElementById('btn-confirm-clear-data');
    
    if (btnClearData && modalClear) {
        btnClearData.addEventListener('click', () => {
            modalClear.classList.remove('hidden');
        });
    }
    
    if (btnCloseModal && modalClear) {
        btnCloseModal.addEventListener('click', () => {
            modalClear.classList.add('hidden');
        });
    }
    
    if (btnCancelClear && modalClear) {
        btnCancelClear.addEventListener('click', () => {
            modalClear.classList.add('hidden');
        });
    }
    
    if (btnConfirmClear && modalClear) {
        btnConfirmClear.addEventListener('click', () => {
            executeClearCurrentData();
            modalClear.classList.add('hidden');
        });
    }
}

/* ==========================================================================
   ELIMINAR INFORMACIÓN ACTUAL (CARGAR DE CERO)
   ========================================================================== */
function executeClearCurrentData() {
    const userEmail = state.currentUser ? state.currentUser.email : null;
    
    if (userEmail) {
        // Borrar llaves asociadas a la cuenta en localStorage
        localStorage.removeItem(`health_profile_${userEmail}`);
        localStorage.removeItem(`health_exams_${userEmail}`);
        localStorage.removeItem(`health_doctors_${userEmail}`);
        localStorage.removeItem(`health_appointments_${userEmail}`);
    }
    state.doctors = [];
    state.appointments = [];
    
    // Limpiar cola global de validaciones pendientes para este paciente
    if (state.pendingValidations) {
        state.pendingValidations = state.pendingValidations.filter(v => v.patientEmail !== userEmail);
        localStorage.setItem('health_pending_validations', JSON.stringify(state.pendingValidations));
    }
    
    // Reiniciar arreglo de exámenes y perfil en el estado de la aplicación
    state.exams = [];
    state.profile = JSON.parse(JSON.stringify(EMPTY_PROFILE));
    syncProfileFormFromState();
    
    // Registrar evento en auditoría
    if (typeof logEvent === 'function') {
        logEvent("Eliminación de Datos", `El usuario ${userEmail || 'invitado'} vació toda su información clínica para reiniciar de cero.`);
    }
    
    // Actualizar vista y dashboards
    if (typeof updateDashboardView === 'function') {
        updateDashboardView();
    }
    
    // Mostrar confirmación mediante notificación Toast
    if (typeof showToast === 'function') {
        showToast("Información Eliminada", "Tus exámenes e historial se han borrado correctamente. Ahora puedes cargar tus datos de cero.", "success");
    }
}

/* ==========================================================================
   EXPORTACIÓN DE HISTORIAL CLÍNICO A EXCEL (.XLSX)
   ========================================================================== */
function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        if (typeof showToast === 'function') {
            showToast("Error de Exportación", "La librería de Excel no terminó de cargar. Revisa tu conexión a Internet.", "danger");
        } else {
            alert("La librería de Excel no terminó de cargar.");
        }
        return;
    }
    
    const userEmail = state.currentUser ? state.currentUser.email : "Usuario_Anonimo";
    const dateStr = new Date().toISOString().slice(0, 10);
    const activeExam = getActiveExam();
    const examValues = (activeExam && activeExam.values) ? activeExam.values : {};

    // ---------------------------------------------------------
    // HOJA 1: Plan Nutricional 7 Días (Menú Diarios y Pautas)
    // ---------------------------------------------------------
    const mealRawData = getDailyMealScheduleData(state.profile, examValues);
    const mealRows = mealRawData.map(m => ({
        "Día": m.day,
        "Enfoque Nutricional": m.title,
        "Desayuno": m.desayuno,
        "Media Mañana": m.mediaManana,
        "Almuerzo": m.almuerzo,
        "Media Tarde": m.mediaTarde,
        "Cena": m.cena,
        "Tip Nutricional & Consideraciones Fármaco-Clínicas": m.note
    }));

    // ---------------------------------------------------------
    // HOJA 2: Rutina de Ejercicios 7 Días (Cronograma)
    // ---------------------------------------------------------
    const exerciseRawData = getDailyExerciseScheduleData(state.profile, examValues);
    const exerciseRows = exerciseRawData.map(e => ({
        "Día": e.day,
        "Tipo de Ejercicio / Enfoque": e.type,
        "Duración Estimada": e.duration,
        "Actividades Recomendadas": e.activities,
        "Impacto Fisiológico & Precauciones de Seguridad": e.note
    }));

    // ---------------------------------------------------------
    // HOJA 3: Análisis de Variables, Fármacos e Interacciones
    // ---------------------------------------------------------
    const multiVar = analyzeDiseasesAndMeds(state.profile, examValues);
    const varRows = [];

    // Fila resumen perfil
    const heightM = (state.profile.height || 170) / 100;
    const weightKg = state.profile.weight || 70;
    const imcVal = (state.profile.height && state.profile.weight) ? (weightKg / (heightM * heightM)).toFixed(1) : '--';
    
    varRows.push({ "Categoría": "Perfil Físico", "Parámetro / Variable": "Índice de Masa Corporal (IMC)", "Valor / Estado": imcVal, "Unidad / Referencia": "18.5 - 24.9 kg/m²", "Evaluación e Interacciones Fármaco-Clínicas": `Edad: ${state.profile.age || '--'} años, Sexo: ${state.profile.sex || '--'}, Peso: ${weightKg}kg, Estatura: ${state.profile.height || '--'}cm` });

    // Enfermedades de base
    if (multiVar.findings.length > 0) {
        multiVar.findings.forEach(f => {
            varRows.push({
                "Categoría": "Enfermedad de Base",
                "Parámetro / Variable": f.name,
                "Valor / Estado": "Diagnóstico Activo",
                "Unidad / Referencia": f.category,
                "Evaluación e Interacciones Fármaco-Clínicas": f.detail
            });
        });
    } else {
        varRows.push({
            "Categoría": "Enfermedad de Base",
            "Parámetro / Variable": "Diagnósticos Preexistentes",
            "Valor / Estado": "Sin reporte",
            "Unidad / Referencia": "N/A",
            "Evaluación e Interacciones Fármaco-Clínicas": "Sin diagnósticos crónicos declarados."
        });
    }

    // Medicamentos e Interacciones
    if (multiVar.medInteractions.length > 0) {
        multiVar.medInteractions.forEach(m => {
            varRows.push({
                "Categoría": "Medicación Habitual",
                "Parámetro / Variable": m.medication,
                "Valor / Estado": "Prescripción Activa",
                "Unidad / Referencia": m.type,
                "Evaluación e Interacciones Fármaco-Clínicas": m.recommendation
            });
        });
    } else {
        varRows.push({
            "Categoría": "Medicación Habitual",
            "Parámetro / Variable": "Medicamentos",
            "Valor / Estado": "Sin registro",
            "Unidad / Referencia": "N/A",
            "Evaluación e Interacciones Fármaco-Clínicas": "No se registran medicamentos consumidos."
        });
    }

    // Biomarcadores del Examen
    if (activeExam && activeExam.values) {
        Object.entries(activeExam.values).forEach(([k, v]) => {
            if (CLINICAL_RANGES[k]) {
                const config = CLINICAL_RANGES[k];
                const evalRes = config.evaluate(v, state.profile);
                const norm = config.getNormalRange(state.profile);
                varRows.push({
                    "Categoría": "Biomarcador Examen",
                    "Parámetro / Variable": config.name,
                    "Valor / Estado": `${v} ${config.unit}`,
                    "Unidad / Referencia": `${norm.min} - ${norm.max} ${config.unit}`,
                    "Evaluación e Interacciones Fármaco-Clínicas": `${evalRes.status}. ${evalRes.note || ''}`
                });
            }
        });
    }

    // ---------------------------------------------------------
    // HOJA 4: Historial de Exámenes Clínicos
    // ---------------------------------------------------------
    let examRows = [];
    if (state.exams && state.exams.length > 0) {
        state.exams.forEach((exam, index) => {
            const examDate = exam.date || `Examen #${index + 1}`;
            const valStatus = exam.validationStatus === 'approved' ? 'Validado por Médico' : 'Pendiente de Validación';
            const doctorInfo = exam.validatedBy || 'N/A';
            
            if (exam.values && typeof exam.values === 'object') {
                Object.keys(exam.values).forEach(metricKey => {
                    const val = exam.values[metricKey];
                    const rangeInfo = CLINICAL_RANGES[metricKey];
                    const metricName = rangeInfo ? rangeInfo.name : metricKey.toUpperCase();
                    const unit = rangeInfo ? rangeInfo.unit : '';
                    const evalRes = rangeInfo ? rangeInfo.evaluate(val, state.profile) : { status: 'Normal' };
                    const normalRangeStr = rangeInfo ? `${rangeInfo.getNormalRange(state.profile).min} - ${rangeInfo.getNormalRange(state.profile).max} ${unit}` : 'N/A';
                    
                    examRows.push({
                        "ID Examen": exam.id || `EX-${index+1}`,
                        "Fecha Examen": examDate,
                        "Indicador Clínico": metricName,
                        "Valor Medido": val,
                        "Unidad": unit,
                        "Rango Normal de Referencia": normalRangeStr,
                        "Estado Clínico": evalRes.status,
                        "Nota / Observación": evalRes.note || '',
                        "Estatus Validación Médica": valStatus,
                        "Médico Validador": doctorInfo
                    });
                });
            }
        });
    }
    if (examRows.length === 0) {
        examRows.push({
            "ID Examen": "--",
            "Fecha Examen": "--",
            "Indicador Clínico": "Sin datos de exámenes registrados",
            "Valor Medido": "--",
            "Unidad": "--",
            "Rango Normal de Referencia": "--",
            "Estado Clínico": "--",
            "Nota / Observación": "Carga tu primer examen en la plataforma.",
            "Estatus Validación Médica": "--",
            "Médico Validador": "--"
        });
    }

    // ---------------------------------------------------------
    // HOJA 5: Trazabilidad y Auditoría
    // ---------------------------------------------------------
    let auditRows = [];
    if (state.auditLogs && state.auditLogs.length > 0) {
        state.auditLogs.forEach(log => {
            auditRows.push({
                "Fecha y Hora": log.timestamp,
                "ID Evento": log.id,
                "Usuario / Rol": log.user,
                "Acción Realizada": log.action,
                "Descripción": log.description,
                "Hash Criptográfico de Integridad": log.hash
            });
        });
    } else {
        auditRows.push({
            "Fecha y Hora": new Date().toLocaleString(),
            "ID Evento": "EV-00",
            "Usuario / Rol": userEmail,
            "Acción Realizada": "Inicio",
            "Descripción": "Sin registros de auditoría",
            "Hash Criptográfico de Integridad": "N/A"
        });
    }
    
    // Crear Libro de Trabajo XLSX
    const wb = XLSX.utils.book_new();
    
    const sheetMeal = XLSX.utils.json_to_sheet(mealRows);
    const sheetExercise = XLSX.utils.json_to_sheet(exerciseRows);
    const sheetVars = XLSX.utils.json_to_sheet(varRows);
    const sheetExams = XLSX.utils.json_to_sheet(examRows);
    const sheetAudit = XLSX.utils.json_to_sheet(auditRows);
    
    // Ajustar anchos de columnas
    sheetMeal['!cols'] = [
        { wch: 12 }, { wch: 42 }, { wch: 45 }, { wch: 40 },
        { wch: 45 }, { wch: 40 }, { wch: 45 }, { wch: 60 }
    ];
    sheetExercise['!cols'] = [
        { wch: 12 }, { wch: 38 }, { wch: 18 }, { wch: 55 }, { wch: 60 }
    ];
    sheetVars['!cols'] = [
        { wch: 22 }, { wch: 35 }, { wch: 25 }, { wch: 28 }, { wch: 65 }
    ];
    sheetExams['!cols'] = [
        { wch: 18 }, { wch: 15 }, { wch: 35 }, { wch: 14 }, 
        { wch: 10 }, { wch: 28 }, { wch: 20 }, { wch: 40 }, { wch: 24 }
    ];
    sheetAudit['!cols'] = [
        { wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 25 }, { wch: 55 }, { wch: 40 }
    ];
    
    XLSX.utils.book_append_sheet(wb, sheetMeal, "Plan Nutricional 7 Días");
    XLSX.utils.book_append_sheet(wb, sheetExercise, "Rutina Ejercicio 7 Días");
    XLSX.utils.book_append_sheet(wb, sheetVars, "Análisis Variables & Fármacos");
    XLSX.utils.book_append_sheet(wb, sheetExams, "Historial de Exámenes");
    XLSX.utils.book_append_sheet(wb, sheetAudit, "Trazabilidad y Auditoría");
    
    // Descargar archivo Excel
    const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `HealthAnalytics_Rutina_Dieta_y_Analisis_${sanitizedEmail}_${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    if (typeof showToast === 'function') {
        showToast("Excel Generado", `El archivo ${fileName} con la Rutina, Plan Alimenticio y Análisis de Variables se ha descargado correctamente.`, "success");
    }
}
