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

// 4. MAIN STATE DATA STRUCTURE
let state = {
    currentUser: null,
    activeRole: 'patient', // 'patient', 'doctor', 'auditor'
    profile: {
        age: 42,
        sex: "M",
        weight: 78,
        height: 175,
        pregnancy: "N",
        activity: "moderado",
        diseases: [],
        meds: "",
        injuries: "",
        goal: "perder_peso",
        diet: "ninguna",
        gym: "mancuernas",
        budget: "moderado"
    },
    exams: [], // Historical exams
    pendingValidations: [], // Doctor's validation queue
    auditLogs: []
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
    if (examValues.tsh && (examValues.tsh > 10.0 || examValues.tsh < 0.1)) {
        suggestedSpecialist = "Endocrinólogo";
        specialistReason = "Valores de TSH críticamente alterados indicativos de disfunción tiroidea clínica.";
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

// 7. ORQUESTADOR DE IA & MOCK LLM (CON FILTRADO DE SEGURIDAD)
function orchestrateAiReport(profile, latestExam, rulesResult) {
    logEvent("Orquestador IA", "Iniciando orquestación de informe clínico y plan de bienestar.");

    // Retrieve citations from clinical guidelines based on patient's altered values
    const citations = [];
    const addedCitationsKeys = new Set();

    if (latestExam.values.glucosa > 100 || latestExam.values.hba1c > 5.6) {
        RAG_KNOWLEDGE.diabetes.forEach(c => citations.push(c));
        addedCitationsKeys.add('diabetes');
    }
    if (profile.diseases.includes('hipertension') || latestExam.values.peso > 85) {
        RAG_KNOWLEDGE.hipertension.forEach(c => citations.push(c));
        addedCitationsKeys.add('hipertension');
    }
    if (latestExam.values.colesterol_total > 200 || latestExam.values.ldl > 100) {
        RAG_KNOWLEDGE.dislipidemia.forEach(c => citations.push(c));
        addedCitationsKeys.add('dislipidemia');
    }
    if (latestExam.values.hemoglobina < 12 || latestExam.values.ferritina < 20) {
        RAG_KNOWLEDGE.anemia.forEach(c => citations.push(c));
        addedCitationsKeys.add('anemia');
    }
    if (latestExam.values.creatinina > 1.2) {
        RAG_KNOWLEDGE.renal.forEach(c => citations.push(c));
        addedCitationsKeys.add('renal');
    }
    
    // General health citation
    RAG_KNOWLEDGE.general.forEach(c => citations.push(c));

    // SIMULATED MOCK LLM GENERATION:
    // The LLM generates a draft response based on the patient variables.
    
    // We mock the first draft, which might contain unsafe guidelines (e.g. CrossFit for a hypertensive patient with Glucose 280)
    let rawLlmProposal = {
        easyExplanation: `Tus resultados muestran que tu glucosa está bastante elevada en ${latestExam.values.glucosa} mg/dL, lo cual requiere atención. Adicionalmente, los niveles de colesterol LDL están en ${latestExam.values.ldl} mg/dL. Esto significa que hay exceso de azúcares y grasas circulando en tu torrente sanguíneo. Lo positivo es que tu hemoglobina está estable y tus riñones se mantienen en un rango aceptable.`,
        technicalExplanation: `El análisis sérico revela hiperglucemia franca en ayunas de ${latestExam.values.glucosa} mg/dL, correlacionado con una hemoglobina glicosilada (HbA1c) de ${latestExam.values.hba1c}%, indicativo de una baja sensibilidad periférica a la insulina o secreción insuficiente de células beta pancreáticas. Se observa dislipidemia aterogénica leve dada por LDL elevado y HDL disminuido en ${latestExam.values.hdl} mg/dL.`,
        risks: `El descontrol glucémico crónico aumenta el riesgo de micro y macroangiopatías, incluyendo retinopatía y nefropatía. El LDL elevado acelera la formación de placas de ateroma en las arterias, elevando el riesgo de cardiopatía isquémica o infartos a mediano plazo.`,
        
        // UNSAFE PLAN PROPOSED BY LLM (Contains CrossFit and heavy weights despite glucose >250/hypertension)
        exercisePlan: `Se recomienda iniciar de inmediato rutinas intensivas de acondicionamiento físico. Lo ideal es realizar CrossFit cinco veces por semana o sesiones de levantamiento de pesas de alta intensidad para quemar glucosa rápidamente y forzar al cuerpo a usar grasas. También puedes hacer sprints rápidos de velocidad.`,
        
        dietPlan: `Dieta hipocalórica. Desayuno: huevos revueltos con aguacate. Almuerzo: pechuga de pollo con ensalada verde y aceite de oliva. Cena: salmón a la plancha. Evitar jugos de frutas y pan blanco. Priorizar proteínas y grasas saludables.`,
        lifestylePlan: `Tomar 2.5 litros de agua al día. Asegurar un ciclo de sueño regular de 7-8 horas. Meditar 10 minutos para reducir cortisol.`
    };

    // SAFETY ORCHESTRATOR GUARD:
    // The orchestrator analyzes the LLM's draft and checks it against clinical rules/restrictions.
    // If the rules restricted heavy exercise, and the LLM suggests CrossFit/sprints/high intensity, the Orchestrator REJECTS it and rewrites.
    
    let safetyTriggered = false;
    let exerciseFinal = rawLlmProposal.exercisePlan;
    
    const containsHeavyKeywords = /crossfit|pesos pesados| sprints|alta intensidad|intensiva|pesas de alta/i.test(rawLlmProposal.exercisePlan);
    
    if (rulesResult.restrictions.some(r => r.includes("Prohibida la actividad física de alta intensidad") || r.includes("proteger articulaciones")) && containsHeavyKeywords) {
        safetyTriggered = true;
        logEvent("Filtro de Seguridad IA", "CRÍTICO: El borrador del LLM proponía ejercicio de alta intensidad que viola las restricciones médicas del paciente. Reescribiendo plan deportivo de forma segura.");
        
        // Rewrite exercise plan to be safe:
        if (latestExam.values.glucosa > 250) {
            exerciseFinal = `⚠️ PLAN AJUSTADO POR SEGURIDAD MÉDICA:
Debido a tus niveles de glucosa críticamente elevados (superiores a 250 mg/dL), se contraindican temporalmente los ejercicios intensivos de fuerza y entrenamientos metabólicos (como CrossFit o pesas pesadas), ya que pueden inducir cetoacidosis.
Recomendación aprobada: Caminata a paso moderado durante 30 a 45 minutos al día, controlando que la frecuencia cardíaca no supere las 120 pulsaciones por minuto. Una vez que tu glucosa descienda a niveles seguros (<200 mg/dL), se evaluará la incorporación progresiva de fuerza leve.`;
        } else if (profile.weight / ((profile.height/100)**2) >= 30) {
            exerciseFinal = `⚠️ PLAN AJUSTADO POR SEGURIDAD ARTICULAR:
Dado que tu IMC indica obesidad, se ajusta el plan deportivo para proteger tus rodillas y columna. Se eliminan los ejercicios con impacto (saltos, correr rápido).
Recomendación aprobada: Natación, bicicleta estática o elíptica por 30-40 minutos, de 3 a 4 veces por semana. Combina esto con ejercicios de fuerza de tren superior sentados.`;
        } else {
            exerciseFinal = `Recomendación aprobada: Actividad aeróbica moderada como caminata rápida o ciclismo recreativo por 30 minutos al día, 5 veces por semana. Evita esfuerzos máximos hasta valoración médica presencial.`;
        }
    }

    return {
        easyExplanation: rawLlmProposal.easyExplanation,
        technicalExplanation: rawLlmProposal.technicalExplanation,
        risks: rawLlmProposal.risks,
        exercisePlan: exerciseFinal,
        dietPlan: rawLlmProposal.dietPlan,
        lifestylePlan: rawLlmProposal.lifestylePlan,
        citations: citations,
        safetyTriggered: safetyTriggered,
        specialistName: rulesResult.suggestedSpecialist,
        specialistDesc: rulesResult.specialistReason
    };
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
        state.profile = {
            age: 42,
            sex: "M",
            weight: 78,
            height: 175,
            pregnancy: "N",
            activity: "moderado",
            diseases: [],
            meds: "",
            injuries: "",
            goal: "perder_peso",
            diet: "ninguna",
            gym: "mancuernas",
            budget: "moderado"
        };
    }
    
    // Load exams specific to user
    const savedExams = localStorage.getItem(`health_exams_${email}`);
    if (savedExams) {
        state.exams = JSON.parse(savedExams);
        // Force chronological sorting by date
        state.exams.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } else {
        state.exams = [];
    }
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

// Registration Form Submission (Habeas data required)
document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const consent = document.getElementById('reg-consent').checked;
    
    if (!consent) {
        showToast("Error de Consentimiento", "Debes aceptar el tratamiento de datos clínicos para registrarte.", "danger");
        return;
    }
    
    // Simulate user creation
    state.currentUser = { email: email };
    localStorage.setItem('health_active_user', JSON.stringify(state.currentUser));
    
    // Load data specific to this user email
    loadUserData();
    
    // Initial logs
    logEvent("Creación de Cuenta", `Nuevo registro creado con el correo: ${email}. Aceptación de consentimiento firmada.`);
    logEvent("Consentimiento de Datos", "Usuario firmó el consentimiento de tratamiento de datos clínicos de forma inmutable.");
    
    // Transition to App
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('user-display-email').innerText = email;
    document.getElementById('user-avatar-char').innerText = email.charAt(0).toUpperCase();
    
    // Fill profile values and show toast
    document.getElementById('prof-age').value = state.profile.age;
    document.getElementById('prof-sex').value = state.profile.sex;
    document.getElementById('prof-weight').value = state.profile.weight;
    document.getElementById('prof-height').value = state.profile.height;
    
    showToast("Cuenta Creada", `Bienvenido a HealthAnalytics, ${email}!`, "success");
    
    switchActiveView('profile-view');
    updateUI();
});

// Switch back and forth on login/register view
document.getElementById('switch-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    // Pre-fill simulation data
    document.getElementById('reg-email').value = "paciente.ejemplo@salud.org";
    document.getElementById('reg-password').value = "Paciente123*";
    document.getElementById('reg-consent').checked = true;
    showToast("Acceso Simulado", "Credenciales de demostración cargadas. Haz clic en 'Registrarse' para ingresar.", "info");
});

// Oauth Simulation buttons
document.getElementById('btn-google-auth').addEventListener('click', () => {
    document.getElementById('reg-email').value = "google.user@gmail.com";
    document.getElementById('reg-password').value = "GoogleOAuthSim";
    document.getElementById('reg-consent').checked = true;
    showToast("Google Auth", "Simulación de firma por Google. Haz clic en 'Registrarse' para ingresar.", "info");
});

document.getElementById('btn-apple-auth').addEventListener('click', () => {
    document.getElementById('reg-email').value = "apple.user@icloud.com";
    document.getElementById('reg-password').value = "AppleOAuthSim";
    document.getElementById('reg-consent').checked = true;
    showToast("Apple Auth", "Simulación de firma por Apple. Haz clic en 'Registrarse' para ingresar.", "info");
});

// Consent modal terms triggers
document.getElementById('consent-terms-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('consent-modal').classList.remove('hidden');
});

document.getElementById('btn-accept-consent-modal').addEventListener('click', () => {
    document.getElementById('consent-modal').classList.add('hidden');
    document.getElementById('reg-consent').checked = true;
});

// Logout
document.getElementById('btn-logout').addEventListener('click', (e) => {
    e.preventDefault();
    logEvent("Cierre de Sesión", `Usuario cerró sesión.`);
    
    // Limpiar almacenamiento de sesión activa
    localStorage.removeItem('health_active_user');
    
    // Reiniciar memoria del estado global
    state.currentUser = null;
    state.exams = [];
    state.profile = {
        age: 42,
        sex: "M",
        weight: 78,
        height: 175,
        pregnancy: "N",
        activity: "moderado",
        diseases: [],
        meds: "",
        injuries: "",
        goal: "perder_peso",
        diet: "ninguna",
        gym: "mancuernas",
        budget: "moderado"
    };
    state.activeRole = 'patient';
    
    // Limpiar campos de formularios e inputs del DOM
    document.getElementById('register-form').reset();
    document.getElementById('profile-form').reset();
    document.getElementById('ocr-result-card').classList.add('hidden');
    document.getElementById('ocr-loader').classList.add('hidden');
    
    // Limpiar textos y avatares de la barra lateral
    document.getElementById('user-display-email').innerText = "usuario@correo.com";
    document.getElementById('user-avatar-char').innerText = "U";
    
    // Reiniciar selectores de roles y menús laterales
    document.getElementById('role-patient').checked = true;
    document.getElementById('nav-section-doctor').classList.add('hidden');
    document.getElementById('nav-section-patient').classList.remove('hidden');
    const sidebarRoleBadge = document.getElementById('sidebar-role-badge');
    sidebarRoleBadge.innerText = 'Paciente';
    sidebarRoleBadge.className = 'role-badge';
    
    // Destruir instancias de gráficos activos para liberar memoria de renderizado
    if (evolutionChart) { evolutionChart.destroy(); evolutionChart = null; }
    if (radarChart) { radarChart.destroy(); radarChart = null; }
    if (projectionChart) { projectionChart.destroy(); projectionChart = null; }
    
    // Refrescar UI (volverá a mostrar marcadores vacíos)
    updateUI();
    
    // Ocultar la aplicación y mostrar pantalla de registro
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('auth-view').classList.remove('hidden');
});

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
        state.profile = {
            age: 42,
            sex: "M",
            weight: 78,
            height: 175,
            pregnancy: "N",
            activity: "moderado",
            diseases: [],
            meds: "",
            injuries: "",
            goal: "perder_peso",
            diet: "ninguna",
            gym: "mancuernas",
            budget: "moderado"
        };
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

// Parses text using regex to find ColSanitas specific variables
function parseClinicalText(text) {
    // Normal defaults matching a standard healthy status, but we will overwrite whatever we find
    const defaultValues = {
        glucosa: 85,
        hba1c: 5.4,
        colesterol_total: 180,
        ldl: 95,
        hdl: 50,
        trigliceridos: 120,
        creatinina: 0.8,
        tsh: 1.8,
        vitamina_d: 35,
        hemoglobina: 14.0,
        ferritina: 80,
        peso: state.profile.weight || 75
    };
    
    // Normalize spaces for simpler matching
    const normalized = text.replace(/\s+/g, ' ');
    console.log("PDF Text Extracted (Normalized):", normalized);
    
    const values = { ...defaultValues };
    
    // Exact ColSanitas matching regex rules
    const matches = {
        glucosa: /GLICEMIA\s+(\d+(?:\.\d+)?)/i.exec(normalized),
        hba1c: /HEMOGLOBINA GLICOSILADA\s*(?:\*|)\s*(\d+(?:\.\d+)?)/i.exec(normalized),
        colesterol_total: /COLESTEROL TOTAL\s+(\d+(?:\.\d+)?)/i.exec(normalized),
        ldl: /COLESTEROL LDL\s*-\s*CALCULADO\s+(\d+(?:\.\d+)?)/i.exec(normalized),
        hdl: /COLESTEROL HDL\s+(\d+(?:\.\d+)?)/i.exec(normalized),
        trigliceridos: /TRIGLICERIDOS\s+(\d+(?:\.\d+)?)/i.exec(normalized),
        creatinina: /CREATININA EN SUERO\s+(\d+(?:\.\d+)?)/i.exec(normalized),
        hemoglobina: /HEMOGLOBINA\s+(\d+(?:\.\d+)?)\s*g\/dl/i.exec(normalized),
        ferritina: /FERRITINA\s+(\d+(?:\.\d+)?)/i.exec(normalized),
        tsh: /TSH\s+(\d+(?:\.\d+)?)/i.exec(normalized),
        vitamina_d: /VITAMINA D\s+(\d+(?:\.\d+)?)/i.exec(normalized)
    };
    
    let foundAny = false;
    for (const [key, match] of Object.entries(matches)) {
        if (match && match[1]) {
            values[key] = parseFloat(match[1]);
            foundAny = true;
            console.log(`Parsed biomarker ${key}: ${values[key]}`);
        }
    }
    
    // If we could not extract any specific clinical marker, we fall back to a random preset
    if (!foundAny) {
        console.warn("No se detectaron marcadores clínicos conocidos. Usando plantilla aleatoria.");
        const keys = Object.keys(EXAM_PRESETS);
        const randomPreset = EXAM_PRESETS[keys[Math.floor(Math.random() * keys.length)]];
        return { ...randomPreset.values };
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
                
                logEvent("Extracción Completada", `PDF parseado con éxito. Colesterol: ${parsedValues.colesterol_total || 'N/A'}, HbA1c: ${parsedValues.hba1c || 'N/A'}`);
            } else {
                // If it's an image, fall back to a random preset
                logEvent("Carga de Imagen (Simulada)", `Archivo de imagen cargado: ${file.name}. Usando plantilla simulada.`);
                const keys = Object.keys(EXAM_PRESETS);
                const randomPreset = EXAM_PRESETS[keys[Math.floor(Math.random() * keys.length)]];
                parsedValues = { ...randomPreset.values };
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
    
    for (const [key, val] of Object.entries(examTemplate.values)) {
        if (!CLINICAL_RANGES[key]) continue;
        
        const config = CLINICAL_RANGES[key];
        const normal = config.getNormalRange(state.profile);
        const evalResult = config.evaluate(val, state.profile);
        
        let badgeClass = "badge-success";
        if (evalResult.state === 'altered') badgeClass = "badge-warning";
        if (evalResult.state === 'critical') badgeClass = "badge-danger";
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${config.name}</strong></td>
            <td>
                <input type="number" step="0.01" class="editable-value-input" data-key="${key}" value="${formatClinicalValue(val, key)}">
            </td>
            <td>${config.unit}</td>
            <td>${normal.min} - ${normal.max}</td>
            <td><span class="badge ${badgeClass}">${evalResult.status}</span></td>
        `;
        tbody.appendChild(row);
    }
    
    // Scroll to verification
    resultCard.scrollIntoView({ behavior: 'smooth' });
}

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
    renderEvolutionChart();
    renderRadarChart();
    renderProjectionChart();
    updateHealthGauge();
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
    
    const latest = state.exams[state.exams.length - 1];
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
    
    const latest = state.exams[state.exams.length - 1];
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
function renderProjectionChart() {
    const ctx = document.getElementById('projectionChart');
    if (!ctx) return;
    
    if (projectionChart) projectionChart.destroy();
    
    if (state.exams.length === 0) return;
    
    const indicator = document.getElementById('pred-indicator').value;
    const latestVal = state.exams[state.exams.length - 1].values[indicator];
    
    if (latestVal === undefined) return;
    
    // Simulate a 6-month projection with a decrease (or increase, e.g. for HDL or vitamin D)
    const labels = ["Hoy", "Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes 6"];
    const expectedData = [latestVal];
    const upperConfidence = [latestVal];
    const lowerConfidence = [latestVal];
    
    // Simulate clinical trends
    let delta = -0.05; // 5% reduction per month
    if (indicator === 'glucosa' && latestVal > 200) delta = -0.08;
    if (indicator === 'colesterol_total' && latestVal > 220) delta = -0.04;
    
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

document.getElementById('pred-indicator').addEventListener('change', renderProjectionChart);

// 12. HISTORICAL COMPARISONS TABLE (RF-42 & RF-43)
function renderComparisonTable() {
    const tbody = document.getElementById('comparison-table').querySelector('tbody');
    const dateLabel = document.getElementById('comparison-date-label');
    
    if (state.exams.length < 2) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Se requieren al menos dos exámenes históricos cargados para generar la analítica comparativa.</td></tr>`;
        dateLabel.innerText = "Historial insuficiente";
        return;
    }
    
    const current = state.exams[state.exams.length - 1];
    const previous = state.exams[state.exams.length - 2];
    
    dateLabel.innerText = `Examen del ${previous.date} vs Examen del ${current.date}`;
    tbody.innerHTML = '';
    
    for (const [key, config] of Object.entries(CLINICAL_RANGES)) {
        const valPrev = previous.values[key];
        const valCurr = current.values[key];
        
        if (valPrev === undefined || valCurr === undefined) continue;
        
        const diffAbs = Math.round((valCurr - valPrev) * 100) / 100;
        const diffPct = Math.round((diffAbs / valPrev) * 1000) / 10;
        
        let stateText = "Estable";
        let badgeClass = "variation-neutral";
        
        // Define if change is good or bad clinical trend (RF-43)
        let isDecreaseGood = true; // For glucose, ldl, weight, decrease is positive.
        if (key === 'hdl' || key === 'vitamina_d' || key === 'hemoglobina' || key === 'ferritina') {
            isDecreaseGood = false; // For these, increase is positive.
        }
        
        if (Math.abs(diffPct) > 2.0) { // changes > 2% matter
            if (diffPct > 0) {
                stateText = isDecreaseGood ? "Empeoró" : "Mejoró";
                badgeClass = isDecreaseGood ? "variation-up" : "variation-down"; // if decrease is good, then increase is red (variation-up)
            } else {
                stateText = isDecreaseGood ? "Mejoró" : "Empeoró";
                badgeClass = isDecreaseGood ? "variation-down" : "variation-up"; // decrease is good = green (variation-down)
            }
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${config.name}</strong></td>
            <td>${formatClinicalValue(valPrev, key)} ${config.unit}</td>
            <td>${formatClinicalValue(valCurr, key)} ${config.unit}</td>
            <td>${diffAbs > 0 ? '+' : ''}${formatClinicalValue(diffAbs, key)} ${config.unit}</td>
            <td>${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%</td>
            <td><span class="variation-badge ${badgeClass}">${stateText}</span></td>
        `;
        tbody.appendChild(row);
    }
}

// 13. GENERATE & RENDER REPORT IN PATIENT VIEW
function renderAiReportView() {
    const placeholder = document.getElementById('ai-placeholder-card');
    const content = document.getElementById('ai-report-content');
    
    if (state.exams.length === 0) {
        placeholder.classList.remove('hidden');
        content.classList.add('hidden');
        return;
    }
    
    placeholder.classList.add('hidden');
    content.classList.remove('hidden');
    
    const latest = state.exams[state.exams.length - 1];
    const report = latest.aiReport;
    const rules = latest.rulesResult;
    
    // Critical alert banner
    const alertBanner = document.getElementById('ai-critical-banner');
    const alertDesc = document.getElementById('ai-critical-banner-desc');
    if (rules.alerts.length > 0) {
        alertBanner.classList.remove('hidden');
        alertDesc.innerHTML = rules.alerts.map(a => `• <strong>${a.name} (${a.value} ${a.unit})</strong>: ${a.message}`).join('<br>');
    } else {
        alertBanner.classList.add('hidden');
    }
    
    // Validation status banner
    const validationBanner = document.getElementById('ai-validation-banner');
    const validationIcon = document.getElementById('validation-icon');
    const validationTitle = document.getElementById('validation-title');
    const validationSubtitle = document.getElementById('validation-subtitle');
    
    if (latest.validationStatus === 'pending') {
        validationBanner.className = "doctor-validation-banner pending";
        validationIcon.innerText = "⏳";
        validationTitle.innerText = "Informe en Proceso de Revisión";
        validationSubtitle.innerText = "Las recomendaciones de la IA están siendo validadas por un profesional de la salud antes de su entrega definitiva.";
    } else {
        validationBanner.className = "doctor-validation-banner approved";
        validationIcon.innerText = "🛡️";
        validationTitle.innerText = `Informe Validado por Especialista`;
        validationSubtitle.innerText = `Revisado y aprobado el ${latest.validationDate} por ${latest.validatedBy}.`;
    }
    
    // Explanations
    document.getElementById('ai-text-easy').innerText = report.easyExplanation;
    document.getElementById('ai-text-technical').innerText = report.technicalExplanation;
    document.getElementById('ai-text-risks').innerText = report.risks;
    
    // Plans
    document.getElementById('ai-plan-exercise').innerText = report.exercisePlan;
    document.getElementById('ai-plan-diet').innerText = report.dietPlan;
    document.getElementById('ai-plan-lifestyle').innerText = report.lifestylePlan;
    
    // Specialist Recommendation
    document.getElementById('ai-specialist-name').innerText = report.specialistName;
    document.getElementById('ai-specialist-desc').innerText = report.specialistDesc;
    
    // RAG Citations
    const citationsList = document.getElementById('ai-citations-list');
    citationsList.innerHTML = report.citations.map(c => `
        <li>
            <span class="citation-source">📚 ${c.source}</span>
            <span class="citation-evidence">${c.evidence}</span>
        </li>
    `).join('');
    
    // Dynamic explanations of variations (RF-45)
    const variationCard = document.getElementById('ai-variation-card');
    const variationText = document.getElementById('ai-variation-text');
    
    if (state.exams.length >= 2) {
        variationCard.classList.remove('hidden');
        
        const current = state.exams[state.exams.length - 1];
        const previous = state.exams[state.exams.length - 2];
        
        let varHtml = "";
        
        // Find variations > 10%
        for (const [key, config] of Object.entries(CLINICAL_RANGES)) {
            const valPrev = previous.values[key];
            const valCurr = current.values[key];
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
    } else {
        variationCard.classList.add('hidden');
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
    
    const latest = state.exams[state.exams.length - 1];
    
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
    
    // Checklist updates
    document.getElementById('chk-first-exam').checked = true;
    document.getElementById('chk-doctor-validation').checked = latest.validationStatus === 'approved';
    document.getElementById('chk-next-checkup').checked = false; // requires future actions
    
    // Alerts dropdown in top bar
    const alertsBadge = document.getElementById('alerts-badge');
    const alertsDropdownList = document.getElementById('notifications-list');
    
    if (latest.rulesResult.alerts.length > 0) {
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
        versionTag.innerText = "v1.0.0";
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
    }
    
    // Limpiar cola global de validaciones pendientes para este paciente
    if (state.pendingValidations) {
        state.pendingValidations = state.pendingValidations.filter(v => v.patientEmail !== userEmail);
        localStorage.setItem('health_pending_validations', JSON.stringify(state.pendingValidations));
    }
    
    // Reiniciar arreglo de exámenes y perfil en el estado de la aplicación
    state.exams = [];
    state.profile = {
        age: 35,
        sex: "M",
        weight: 70,
        height: 170,
        activity: "moderado",
        diseases: [],
        meds: "",
        injuries: "",
        goal: "mantener_salud"
    };
    
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
            showToast("Error de Exportación", "La librería de Excel no terminó de cargar. Revisa tu conexión a Internet.", "error");
        } else {
            alert("La librería de Excel no terminó de cargar.");
        }
        return;
    }
    
    const userEmail = state.currentUser ? state.currentUser.email : "Usuario_Anonimo";
    const dateStr = new Date().toISOString().slice(0, 10);
    
    // ---------------------------------------------------------
    // HOJA 1: Perfil del Paciente
    // ---------------------------------------------------------
    const heightM = (state.profile.height || 170) / 100;
    const weightKg = state.profile.weight || 70;
    const imcVal = (weightKg / (heightM * heightM)).toFixed(1);
    
    const profileRows = [
        { "Campo / Parámetro": "Correo Electrónico", "Valor": userEmail },
        { "Campo / Parámetro": "Edad", "Valor": `${state.profile.age || '--'} años` },
        { "Campo / Parámetro": "Sexo Biológico", "Valor": state.profile.sex === 'F' ? 'Femenino' : 'Masculino' },
        { "Campo / Parámetro": "Peso Corporal", "Valor": `${weightKg} kg` },
        { "Campo / Parámetro": "Estatura", "Valor": `${state.profile.height || '--'} cm` },
        { "Campo / Parámetro": "Índice de Masa Corporal (IMC)", "Valor": imcVal },
        { "Campo / Parámetro": "Nivel de Actividad Física", "Valor": state.profile.activity || "Moderado" },
        { "Campo / Parámetro": "Diagnósticos Preexistentes", "Valor": Array.isArray(state.profile.diseases) && state.profile.diseases.length > 0 ? state.profile.diseases.join(', ') : 'Ninguno' },
        { "Campo / Parámetro": "Medicación Habitual", "Valor": state.profile.meds || 'Ninguna registrada' },
        { "Campo / Parámetro": "Objetivo de Salud", "Valor": state.profile.goal || 'Mantener Salud' },
        { "Campo / Parámetro": "Fecha de Exportación", "Valor": new Date().toLocaleString() }
    ];
    
    // ---------------------------------------------------------
    // HOJA 2: Historial de Exámenes Clínicos
    // ---------------------------------------------------------
    let examRows = [];
    
    if (state.exams && state.exams.length > 0) {
        state.exams.forEach((exam, index) => {
            const examDate = exam.date || `Examen #${index + 1}`;
            const examCategory = exam.category || "General";
            const valStatus = exam.validationStatus === 'approved' ? 'Validado por Médico' : 'Pendiente de Validación';
            
            if (exam.values && typeof exam.values === 'object') {
                Object.keys(exam.values).forEach(metricKey => {
                    const val = exam.values[metricKey];
                    const rangeInfo = CLINICAL_RANGES[metricKey];
                    const metricName = rangeInfo ? rangeInfo.name : metricKey.toUpperCase();
                    const unit = rangeInfo ? rangeInfo.unit : '';
                    const evalRes = rangeInfo ? rangeInfo.evaluate(val, state.profile) : { status: 'Normal' };
                    const normalRangeStr = rangeInfo ? `${rangeInfo.getNormalRange(state.profile).min} - ${rangeInfo.getNormalRange(state.profile).max} ${unit}` : 'N/A';
                    
                    examRows.push({
                        "Fecha Examen": examDate,
                        "Categoría": examCategory,
                        "Indicador Clínico": metricName,
                        "Valor Medido": val,
                        "Unidad": unit,
                        "Rango Normal de Referencia": normalRangeStr,
                        "Estado Clínico": evalRes.status,
                        "Observación / Nota": evalRes.note || '',
                        "Estado Validación Médica": valStatus
                    });
                });
            }
        });
    }
    
    if (examRows.length === 0) {
        examRows.push({
            "Fecha Examen": "--",
            "Categoría": "--",
            "Indicador Clínico": "Sin datos de exámenes cargados",
            "Valor Medido": "--",
            "Unidad": "--",
            "Rango Normal de Referencia": "--",
            "Estado Clínico": "Pendiente",
            "Observación / Nota": "Carga tu primer examen clínico para ver el detalle",
            "Estado Validación Médica": "--"
        });
    }
    
    // ---------------------------------------------------------
    // HOJA 3: Resumen de Riesgos y Evaluación
    // ---------------------------------------------------------
    let alteredCount = 0;
    let criticalCount = 0;
    let normalCount = 0;
    
    if (state.exams && state.exams.length > 0) {
        const latest = state.exams[state.exams.length - 1];
        if (latest.rulesResult && latest.rulesResult.evaluations) {
            latest.rulesResult.evaluations.forEach(ev => {
                if (ev.state === 'critical') criticalCount++;
                else if (ev.state === 'altered') alteredCount++;
                else normalCount++;
            });
        }
    }
    
    const summaryRows = [
        { "Métrica de Resumen": "Total de Exámenes Registrados", "Valor": state.exams ? state.exams.length : 0 },
        { "Métrica de Resumen": "Indicadores en Estado Normal", "Valor": normalCount },
        { "Métrica de Resumen": "Indicadores Alterados", "Valor": alteredCount },
        { "Métrica de Resumen": "Indicadores Críticos", "Valor": criticalCount },
        { "Métrica de Resumen": "Score de Salud General", "Valor": document.getElementById('health-score-val')?.innerText || '--' },
        { "Métrica de Resumen": "Estado Cardiovascular Evaluado", "Valor": document.getElementById('kpi-cardio-risk')?.innerText || 'Pendiente' }
    ];
    
    // Crear Libro de Trabajo XLSX
    const wb = XLSX.utils.book_new();
    
    const sheetProfile = XLSX.utils.json_to_sheet(profileRows);
    const sheetExams = XLSX.utils.json_to_sheet(examRows);
    const sheetSummary = XLSX.utils.json_to_sheet(summaryRows);
    
    // Ajustar anchos de columnas para mejor presentación
    sheetProfile['!cols'] = [{ wch: 30 }, { wch: 35 }];
    sheetExams['!cols'] = [
        { wch: 15 }, { wch: 18 }, { wch: 30 }, { wch: 14 }, 
        { wch: 10 }, { wch: 28 }, { wch: 20 }, { wch: 40 }, { wch: 24 }
    ];
    sheetSummary['!cols'] = [{ wch: 35 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(wb, sheetProfile, "Perfil Paciente");
    XLSX.utils.book_append_sheet(wb, sheetExams, "Historial de Exámenes");
    XLSX.utils.book_append_sheet(wb, sheetSummary, "Resumen de Riesgos");
    
    // Descargar archivo Excel
    const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `HealthAnalytics_Historial_${sanitizedEmail}_${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    if (typeof showToast === 'function') {
        showToast("Excel Generado", `El archivo ${fileName} se ha descargado correctamente.`, "success");
    }
}

