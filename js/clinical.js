/**
 * clinical.js — Historia Clínica Electrónica (APK / Doctor Mobile)
 * Paridad completa con src/modules/clinical.js de la versión web:
 *   - Lista de pacientes con búsqueda, ordenamiento y paginación
 *   - KPIs: total pacientes, con HC, total registros, registros hoy
 *   - Bottom-sheet del expediente: timeline de registros con secciones coloreadas
 *   - Formulario agregar/editar registro (tipo, signos vitales, diagnóstico, recetas, seguimiento)
 *   - Exportar PDF con jsPDF (escala de grises, idéntico al web)
 *   - Accesible desde "Mis Pacientes" en el APK
 */

// ─── Tipos de registro ────────────────────────────────────────────────────────

const ENTRY_TYPES = {
    consultation: { label: 'Consulta', color: '#003b69', bg: '#eff5f9', border: '#93b7d2' },
    treatment: { label: 'Tratamiento', color: '#008272', bg: '#e6f4f3', border: '#00B294' },
    medication: { label: 'Medicación', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    observation: { label: 'Observación', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    followup: { label: 'Seguimiento', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
    emergency: { label: 'Urgencia', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    lab: { label: 'Laboratorio', color: '#0891b2', bg: '#ecfeff', border: '#67e8f9' },
    prescription: { label: 'Receta', color: '#92400e', bg: '#fff7ed', border: '#fdba74' }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(bd) {
    if (!bd) return '—';
    const b = new Date(bd), t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a;
}

function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, color = 'var(--neutralDark)') {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:20px;right:20px;max-width:calc(100vw - 40px);
        padding:1rem 1.5rem;border-radius:8px;background:${color};color:#fff;
        font-size:0.85rem;font-weight:600;z-index:999999;box-shadow:0 10px 15px -3px rgba(0,0,0,.15);
        display:flex;align-items:center;gap:0.75rem;
        transform:translateX(120%);opacity:0;transition:transform 0.3s ease, opacity 0.3s ease;`;
    el.innerHTML = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.transform = 'translateX(0)'; el.style.opacity = '1'; }, 10);
    setTimeout(() => {
        el.style.transform = 'translateX(120%)';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 2800);
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export function mountClinical(root, { store, user, onPrintPrescription }) {
    if (!root) return;

    const state = {
        search: '',
        sortBy: 'name',
        page: 1,
        perPage: 15,
        filtered: [],
        paginated: [],
        total: 0,
        totalPages: 0,
        selectedPatient: null,
        editingRecord: null
    };

    // ── Cargar y filtrar ──────────────────────────────────────────────────────
    function loadPatients() {
        const all = store.get('patients') || [];
        let list = [...all];
        if (state.search) {
            const q = state.search.toLowerCase();
            list = list.filter(p =>
                [p.name, p.dni, p.phone, p.email, p.bloodType]
                    .filter(Boolean).join(' ').toLowerCase().includes(q)
            );
        }
        list.sort((a, b) => {
            if (state.sortBy === 'name') return a.name.localeCompare(b.name);
            if (state.sortBy === 'age') return calcAge(b.birthDate) - calcAge(a.birthDate);
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
        state.filtered = list;
        state.total = list.length;
        state.totalPages = Math.ceil(list.length / state.perPage);
        if (state.page > state.totalPages && state.totalPages > 0) state.page = state.totalPages;
        const s = (state.page - 1) * state.perPage;
        state.paginated = list.slice(s, s + state.perPage);
    }

    // ── KPIs ──────────────────────────────────────────────────────────────────
    function buildKPIs() {
        const records = store.get('clinicalRecords') || [];
        const patients = store.get('patients') || [];
        const withHC = new Set(records.map(r => r.patientId)).size;
        const today = records.filter(r => new Date(r.date).toDateString() === new Date().toDateString()).length;
        return [
            { label: 'Total Pacientes', val: patients.length, icon: 'fa-hospital-user', color: 'var(--themePrimary)' },
            { label: 'Con Historia Clínica', val: withHC, icon: 'fa-file-medical', color: 'var(--teal)' },
            { label: 'Total Registros', val: records.length, icon: 'fa-notes-medical', color: 'var(--blue)' },
            { label: 'Registros Hoy', val: today, icon: 'fa-calendar-check', color: 'var(--green)' }
        ].map(k => `
            <div style="background:#fff;border-radius:12px;padding:12px 14px;border:1px solid var(--neutralLight);
                        display:flex;align-items:center;gap:10px;min-width:0;">
                <div style="width:36px;height:36px;border-radius:10px;background:${k.color}20;display:flex;
                            align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fa-solid ${k.icon}" style="color:${k.color};font-size:0.9rem;"></i>
                </div>
                <div style="min-width:0;">
                    <div style="font-size:1.1rem;font-weight:800;color:var(--neutralDark);">${k.val}</div>
                    <div style="font-size:0.65rem;color:var(--neutralSecondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${k.label}</div>
                </div>
            </div>`).join('');
    }

    // ── Render lista ──────────────────────────────────────────────────────────
    function render() {
        loadPatients();
        root.innerHTML = `
            <!-- KPIs -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
                ${buildKPIs()}
            </div>

            <!-- Buscador + orden -->
            <div style="background:#fff;border-radius:12px;border:1px solid var(--neutralLight);padding:10px 12px;margin-bottom:10px;">
                <div class="search-input-wrap" style="margin-bottom:8px;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="cl-search" type="text" placeholder="Buscar por nombre, cédula, teléfono..." value="${state.search}">
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:0.72rem;color:var(--neutralSecondary);font-weight:600;">Ordenar:</span>
                    <select id="cl-sort" class="select-compact" style="flex:1;">
                        <option value="name"   ${state.sortBy === 'name' ? 'selected' : ''}>Nombre A-Z</option>
                        <option value="age"    ${state.sortBy === 'age' ? 'selected' : ''}>Mayor edad</option>
                        <option value="recent" ${state.sortBy === 'recent' ? 'selected' : ''}>Más recientes</option>
                    </select>
                    <span style="font-size:0.7rem;color:var(--neutralSecondary);">${state.paginated.length} de ${state.total}</span>
                </div>
            </div>

            <!-- Lista de pacientes -->
            <div id="cl-patient-list" style="display:flex;flex-direction:column;gap:0;background:#fff;border-radius:12px;border:1px solid var(--neutralLight);overflow:hidden;">
                ${renderPatientRows()}
            </div>

            <!-- Paginación -->
            ${state.totalPages > 1 ? `
            <div style="display:flex;justify-content:center;gap:6px;margin-top:12px;">
                <button data-page="prev" ${state.page === 1 ? 'disabled' : ''} class="cl-page-btn"
                    style="padding:6px 12px;border-radius:8px;border:1px solid var(--neutralLight);background:#fff;font-size:0.78rem;cursor:pointer;opacity:${state.page === 1 ? '.4' : '1'};">
                    ← Ant
                </button>
                <span style="padding:6px 12px;font-size:0.78rem;color:var(--neutralSecondary);">
                    ${state.page} / ${state.totalPages}
                </span>
                <button data-page="next" ${state.page === state.totalPages ? 'disabled' : ''} class="cl-page-btn"
                    style="padding:6px 12px;border-radius:8px;border:1px solid var(--neutralLight);background:#fff;font-size:0.78rem;cursor:pointer;opacity:${state.page === state.totalPages ? '.4' : '1'};">
                    Sig →
                </button>
            </div>` : ''}
        `;
        bindListEvents();
    }

    function renderPatientRows() {
        if (!state.paginated.length) return `
            <div style="text-align:center;padding:40px 16px;color:var(--neutralSecondary);">
                <i class="fa-solid fa-hospital-user" style="font-size:2rem;opacity:.2;display:block;margin-bottom:10px;"></i>
                <div style="font-weight:600;">Sin pacientes</div>
                <div style="font-size:0.78rem;">No se encontraron resultados.</div>
            </div>`;

        return state.paginated.map(p => {
            const records = (store.get('clinicalRecords') || []).filter(r => r.patientId === p.id);
            const age = calcAge(p.birthDate);
            const init = (p.name || '?').charAt(0).toUpperCase();
            const hasAllergy = (p.allergies || []).length > 0;
            return `
            <div class="cl-patient-row" data-id="${p.id}"
                 style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                        border-bottom:1px solid var(--neutralLight);cursor:pointer;">
                <div style="width:40px;height:40px;border-radius:12px;background:var(--themePrimary);
                            display:flex;align-items:center;justify-content:center;
                            color:#fff;font-weight:800;font-size:1rem;flex-shrink:0;">${init}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:0.88rem;color:var(--neutralDark);
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px;align-items:center;">
                        <span style="font-size:0.72rem;color:var(--neutralSecondary);">
                            CI: ${p.docType || 'V'}-${p.dni || '—'} · ${age} años
                        </span>
                        ${p.bloodType ? `<span style="font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(220,38,38,.1);color:#dc2626;">${p.bloodType}</span>` : ''}
                        ${hasAllergy ? `<span style="font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(245,158,11,.1);color:#d97706;"><i class="fa-solid fa-triangle-exclamation"></i> Alergias</span>` : ''}
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.68rem;color:var(--neutralSecondary);margin-bottom:4px;">${records.length} registro${records.length !== 1 ? 's' : ''}</div>
                    <div style="width:28px;height:28px;border-radius:8px;background:var(--themeLighterAlt,#eff5f9);
                                display:flex;align-items:center;justify-content:center;">
                        <i class="fa-solid fa-file-medical" style="font-size:0.75rem;color:var(--themePrimary);"></i>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function bindListEvents() {
        // Búsqueda
        let _t;
        root.querySelector('#cl-search')?.addEventListener('input', e => {
            clearTimeout(_t);
            _t = setTimeout(() => { state.search = e.target.value; state.page = 1; render(); }, 300);
        });
        // Orden
        root.querySelector('#cl-sort')?.addEventListener('change', e => {
            state.sortBy = e.target.value; state.page = 1; render();
        });
        // Paginación
        root.querySelectorAll('.cl-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.page === 'prev' && state.page > 1) state.page--;
                else if (btn.dataset.page === 'next' && state.page < state.totalPages) state.page++;
                render();
            });
        });
        // Click en fila
        root.querySelectorAll('.cl-patient-row').forEach(row => {
            row.addEventListener('click', () => openHCSheet(row.dataset.id));
        });
    }

    // ─── BOTTOM SHEET: EXPEDIENTE ─────────────────────────────────────────────

    function openHCSheet(patientId) {
        const p = (store.get('patients') || []).find(x => x.id === patientId);
        if (!p) return;
        state.selectedPatient = p;

        document.getElementById('hc-sheet-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'hc-sheet-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,32,80,.5);backdrop-filter:blur(3px);display:flex;flex-direction:column;justify-content:flex-end;animation:fadeIn .2s ease;';

        const records = getPatientRecords(patientId);
        const age = calcAge(p.birthDate);

        overlay.innerHTML = `
        <div id="hc-sheet"
             style="background:#f8f9fa;border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;
                    box-shadow:0 -8px 40px rgba(0,0,0,.2);animation:slideUp .3s cubic-bezier(.4,0,.2,1);">

            <!-- Cabecera -->
            <div style="background:var(--themePrimary);padding:18px 18px 14px;border-radius:20px 20px 0 0;flex-shrink:0;">
                <div style="width:40px;height:4px;background:rgba(255,255,255,.3);border-radius:4px;margin:0 auto 14px;"></div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                    <div style="width:46px;height:46px;border-radius:12px;background:rgba(255,255,255,.15);
                                display:flex;align-items:center;justify-content:center;
                                color:#fff;font-weight:800;font-size:1.3rem;flex-shrink:0;">${p.name.charAt(0)}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="color:#fff;font-size:1rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
                        <div style="color:rgba(255,255,255,.75);font-size:0.75rem;margin-top:2px;">
                            CI: ${p.docType || 'V'}-${p.dni || '—'} · ${age} años
                            ${p.bloodType ? ` · Sangre: ${p.bloodType}` : ''}
                        </div>
                    </div>
                    <button id="hc-close-btn"
                        style="background:rgba(255,255,255,.15);border:none;border-radius:50%;width:32px;height:32px;
                               cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <!-- Alergias -->
                ${(p.allergies || []).length ? `
                <div style="background:rgba(255,100,50,.2);border-radius:8px;padding:6px 10px;font-size:0.72rem;color:#fff;font-weight:600;">
                    <i class="fa-solid fa-triangle-exclamation"></i> Alergias: ${(p.allergies || []).join(', ')}
                </div>` : ''}
                <!-- Stats rápidos -->
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <div style="flex:1;background:rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;text-align:center;">
                        <div style="color:#fff;font-size:1rem;font-weight:800;">${records.length}</div>
                        <div style="color:rgba(255,255,255,.7);font-size:0.65rem;">Registros</div>
                    </div>
                    <div style="flex:1;background:rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;text-align:center;">
                        <div style="color:#fff;font-size:1rem;font-weight:800;">
                            ${records.filter(r => r.type === 'consultation').length}
                        </div>
                        <div style="color:rgba(255,255,255,.7);font-size:0.65rem;">Consultas</div>
                    </div>
                    <div style="flex:1;background:rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;text-align:center;">
                        <div style="color:#fff;font-size:1rem;font-weight:800;">
                            ${records.length > 0 ? fmtDate(records[0].date) : '—'}
                        </div>
                        <div style="color:rgba(255,255,255,.7);font-size:0.65rem;">Última visita</div>
                    </div>
                </div>
            </div>

            <!-- Timeline de registros -->
            <div id="hc-timeline" style="flex:1;overflow-y:auto;padding:14px;">
                ${records.length ? renderTimeline(records) : `
                <div style="text-align:center;padding:40px 16px;color:var(--neutralSecondary);">
                    <i class="fa-solid fa-file-medical" style="font-size:2.5rem;opacity:.2;display:block;margin-bottom:12px;"></i>
                    <div style="font-weight:600;margin-bottom:4px;">Sin registros clínicos</div>
                    <div style="font-size:0.78rem;">Presiona + para agregar el primer registro.</div>
                </div>`}
            </div>

            <!-- Acciones del footer -->
            <div style="padding:12px 16px;background:#fff;border-top:1px solid var(--neutralLight);display:flex;gap:10px;flex-shrink:0;">
                ${records.length ? `
                <button id="hc-btn-pdf"
                    style="display:flex;align-items:center;gap:7px;background:var(--neutralLight);color:var(--neutralPrimary);
                           border:none;border-radius:10px;padding:11px 14px;font-size:0.82rem;font-weight:600;cursor:pointer;">
                    <i class="fa-solid fa-print"></i> PDF
                </button>` : ''}
                <button id="hc-btn-add"
                    style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;
                           background:var(--themePrimary);color:#fff;border:none;border-radius:10px;
                           padding:13px;font-size:0.87rem;font-weight:700;cursor:pointer;">
                    <i class="fa-solid fa-plus"></i> Nuevo Registro
                </button>
            </div>
        </div>`;

        document.body.appendChild(overlay);

        // Eventos
        overlay.querySelector('#hc-close-btn')?.addEventListener('click', () => closeHCSheet(overlay));
        overlay.addEventListener('click', e => { if (e.target === overlay) closeHCSheet(overlay); });
        overlay.querySelector('#hc-btn-add')?.addEventListener('click', () => openRecordForm(overlay));
        overlay.querySelector('#hc-btn-pdf')?.addEventListener('click', () => {
            generatePDF(getPatientRecords(patientId), p);
        });

        // Manejar clics en botones de receta PDF dentro del timeline
        overlay.querySelector('#hc-timeline')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-prescription-pdf');
            if (btn && typeof onPrintPrescription === 'function') {
                const recordId = btn.dataset.recordId;
                const record = store.find('clinicalRecords', recordId);
                const dr = store.find('doctors', record.doctorId);
                onPrintPrescription(record, dr, p);
            }
        });
    }

    function closeHCSheet(overlay) {
        const sheet = document.getElementById('hc-sheet');
        if (sheet) sheet.style.animation = 'slideDown .25s ease forwards';
        setTimeout(() => { overlay.remove(); state.selectedPatient = null; }, 240);
    }

    function getPatientRecords(patientId) {
        return (store.get('clinicalRecords') || [])
            .filter(r => r.patientId === patientId)
            .sort((a, b) => (b.timestamp || new Date(b.date).getTime()) - (a.timestamp || new Date(a.date).getTime()));
    }

    // ─── TIMELINE ─────────────────────────────────────────────────────────────

    function renderTimeline(records) {
        return records.map(r => {
            const cfg = ENTRY_TYPES[r.type] || ENTRY_TYPES.observation;
            const dr = store.find('doctors', r.doctorId);
            const v = r.vitalSigns || {};
            const hasVitals = v.bloodPressure || v.heartRate || v.temperature || v.spo2 || v.weight || v.height;

            const presHtml = Array.isArray(r.prescriptions) && r.prescriptions.length
                ? r.prescriptions.map((px, i) => `<div style="margin-bottom:3px;">${i + 1}. <strong>${px.medication}</strong> — ${px.dosage} — ${px.frequency} — ${px.duration}</div>`).join('')
                : (r.prescriptions ? `<div>${r.prescriptions}</div>` : `<div style="font-style:italic;color:var(--neutralSecondary);">Sin prescripciones</div>`);

            return `
            <div style="background:#fff;border-radius:12px;border:1px solid var(--neutralLight);
                        border-left:4px solid ${cfg.color};margin-bottom:12px;overflow:hidden;">
                <!-- Cabecera del registro -->
                <div style="padding:10px 14px;background:${cfg.bg};display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <span style="font-size:0.72rem;font-weight:800;color:${cfg.color};text-transform:uppercase;letter-spacing:.05em;">${cfg.label}</span>
                        <div style="font-size:0.68rem;color:var(--neutralSecondary);margin-top:2px;">
                            ${fmtDateTime(r.date)} · ${r.creatorName ? (r.creatorRole === 'doctor' ? 'Dr. ' : r.creatorRole === 'nurse' ? 'Lic. ' : '') + r.creatorName : 'Dr. ' + (dr?.name || '—')}
                        </div>
                    </div>
                    <span style="font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:8px;
                                 background:${r.status === 'finalized' ? 'rgba(16,124,16,.1)' : 'rgba(255,185,0,.1)'};
                                 color:${r.status === 'finalized' ? 'var(--green)' : 'var(--yellow)'};">
                        ${r.status === 'finalized' ? 'Finalizado' : 'Borrador'}
                    </span>
                </div>

                <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">

                    <!-- Signos vitales -->
                    ${hasVitals ? `
                    <div style="background:var(--neutralLighterAlt,#f8f8f8);border-radius:8px;padding:10px;border-left:3px solid #3b82f6;">
                        <div style="font-size:0.65rem;font-weight:800;color:#2563eb;text-transform:uppercase;margin-bottom:7px;">Signos Vitales</div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap;">
                            ${v.bloodPressure ? `<div><div style="font-size:0.6rem;font-weight:700;color:var(--neutralSecondary);">PA</div><div style="font-size:0.82rem;font-weight:600;">${v.bloodPressure}</div></div>` : ''}
                            ${v.heartRate ? `<div><div style="font-size:0.6rem;font-weight:700;color:var(--neutralSecondary);">FC</div><div style="font-size:0.82rem;font-weight:600;">${v.heartRate} lpm</div></div>` : ''}
                            ${v.temperature ? `<div><div style="font-size:0.6rem;font-weight:700;color:var(--neutralSecondary);">Temp</div><div style="font-size:0.82rem;font-weight:600;">${v.temperature} °C</div></div>` : ''}
                            ${v.spo2 ? `<div><div style="font-size:0.6rem;font-weight:700;color:var(--neutralSecondary);">SpO₂</div><div style="font-size:0.82rem;font-weight:600;">${v.spo2} %</div></div>` : ''}
                            ${v.weight ? `<div><div style="font-size:0.6rem;font-weight:700;color:var(--neutralSecondary);">Peso</div><div style="font-size:0.82rem;font-weight:600;">${v.weight} kg</div></div>` : ''}
                            ${v.height ? `<div><div style="font-size:0.6rem;font-weight:700;color:var(--neutralSecondary);">Talla</div><div style="font-size:0.82rem;font-weight:600;">${v.height} cm</div></div>` : ''}
                        </div>
                    </div>` : ''}

                    <!-- Motivo y diagnóstico -->
                    <div style="background:var(--neutralLighterAlt,#f8f8f8);border-radius:8px;padding:10px;border-left:3px solid #ea580c;">
                        ${r.reason ? `
                        <div style="margin-bottom:8px;">
                            <div style="font-size:0.63rem;font-weight:800;color:#c2410c;text-transform:uppercase;margin-bottom:3px;">Motivo de Consulta</div>
                            <div style="font-size:0.82rem;line-height:1.4;">${r.reason}</div>
                        </div>` : ''}
                        <div>
                            <div style="font-size:0.63rem;font-weight:800;color:#c2410c;text-transform:uppercase;margin-bottom:3px;">Diagnóstico</div>
                            <div style="font-size:0.85rem;font-weight:600;line-height:1.4;">${r.diagnosis || 'Pendiente'}</div>
                        </div>
                    </div>

                    <!-- Plan y recetas -->
                    <div style="background:var(--neutralLighterAlt,#f8f8f8);border-radius:8px;padding:10px;border-left:3px solid #16a34a;">
                        ${r.treatment ? `
                        <div style="margin-bottom:8px;">
                            <div style="font-size:0.63rem;font-weight:800;color:#15803d;text-transform:uppercase;margin-bottom:3px;">Plan de Tratamiento</div>
                            <div style="font-size:0.82rem;line-height:1.4;">${r.treatment}</div>
                        </div>` : ''}
                        <div style="margin-bottom:${r.followUp || r.notes ? '8px' : '0'};">
                            <div style="font-size:0.63rem;font-weight:800;color:#15803d;text-transform:uppercase;margin-bottom:3px;">Recetas Médicas</div>
                            <div style="font-size:0.82rem;line-height:1.5;">${presHtml}</div>
                        </div>
                        ${r.followUp ? `
                        <div style="padding-top:8px;border-top:1px dashed var(--neutralLight);">
                            <span style="font-size:0.63rem;font-weight:700;color:var(--neutralSecondary);text-transform:uppercase;">Próximo Control:</span>
                            <span style="font-size:0.8rem;font-weight:600;margin-left:6px;">${fmtDate(r.followUp)}</span>
                        </div>` : ''}
                        ${r.notes ? `
                        <div style="padding-top:8px;border-top:1px dashed var(--neutralLight);">
                            <div style="font-size:0.63rem;font-weight:700;color:var(--neutralSecondary);text-transform:uppercase;margin-bottom:3px;">Notas</div>
                            <div style="font-size:0.8rem;">${r.notes}</div>
                        </div>` : ''}
                    </div>
                    
                    <!-- Botones de Acción -->
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <button class="btn-prescription-pdf" data-record-id="${r.id}" style="flex:1; background:var(--themePrimary); color:#fff; border:none; border-radius:10px; padding:10px; font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
                            <i class="fa-solid fa-file-prescription"></i> Generar Receta PDF
                        </button>
                    </div>

                </div>
            </div>`;
        }).join('');
    }

    // ─── FORMULARIO NUEVO/EDITAR REGISTRO ─────────────────────────────────────

    function openRecordForm(hcOverlay) {
        const p = state.selectedPatient;
        const r = state.editingRecord || {};
        const v = r.vitalSigns || {};

        document.getElementById('hc-record-form-overlay')?.remove();
        const fOverlay = document.createElement('div');
        fOverlay.id = 'hc-record-form-overlay';
        fOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,32,80,.55);backdrop-filter:blur(4px);display:flex;flex-direction:column;justify-content:flex-end;animation:fadeIn .2s ease;';

        fOverlay.innerHTML = `
        <div id="hc-record-form-sheet"
             style="background:#fff;border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;
                    box-shadow:0 -8px 40px rgba(0,0,0,.2);animation:slideUp .3s cubic-bezier(.4,0,.2,1);">

            <!-- Cabecera del form -->
            <div style="background:var(--themeDark,#002d4f);padding:16px 18px;border-radius:20px 20px 0 0;flex-shrink:0;">
                <div style="width:40px;height:4px;background:rgba(255,255,255,.3);border-radius:4px;margin:0 auto 12px;"></div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="color:#fff;font-size:0.65rem;font-weight:700;text-transform:uppercase;opacity:.7;">HUMNT · Historia Clínica</div>
                        <div style="color:#fff;font-size:0.95rem;font-weight:800;margin-top:2px;">
                            ${state.editingRecord ? 'Editar Registro' : 'Nuevo Registro de Atención'}
                        </div>
                        <div style="color:rgba(255,255,255,.65);font-size:0.75rem;margin-top:2px;">Paciente: ${p.name}</div>
                    </div>
                    <button id="rf-close-btn"
                        style="background:rgba(255,255,255,.15);border:none;border-radius:50%;width:32px;height:32px;
                               cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>

            <!-- Cuerpo del formulario -->
            <div style="flex:1;overflow-y:auto;padding:14px;">
            <form id="cl-record-form">

                <!-- Datos de la atención -->
                <div class="hc-form-section" style="border-left-color:var(--themePrimary);">
                    <div class="hc-form-section-title" style="color:var(--themePrimary);">
                        <i class="fa-solid fa-stethoscope"></i> Datos de la Atención
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.7rem;font-weight:700;color:var(--neutralSecondary);text-transform:uppercase;display:block;margin-bottom:4px;">Fecha</label>
                            <input type="date" id="rf-date" class="hc-input"
                                   value="${r.date ? new Date(r.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}" required>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.7rem;font-weight:700;color:var(--neutralSecondary);text-transform:uppercase;display:block;margin-bottom:4px;">Tipo</label>
                            <select id="rf-type" class="hc-input">
                                ${Object.entries(ENTRY_TYPES).map(([k, val]) =>
            `<option value="${k}" ${(r.type || 'consultation') === k ? 'selected' : ''}>${val.label}</option>`
        ).join('')}
                            </select>
                        </div>
                    </div>
                    <div style="margin-top:8px;">
                        <label style="font-size:0.7rem;font-weight:700;color:var(--neutralSecondary);text-transform:uppercase;display:block;margin-bottom:4px;">Estado</label>
                        <select id="rf-status" class="hc-input">
                            <option value="draft"     ${(r.status || 'draft') === 'draft' ? 'selected' : ''}>Borrador</option>
                            <option value="finalized" ${r.status === 'finalized' ? 'selected' : ''}>Finalizado</option>
                        </select>
                    </div>
                </div>

                <!-- Signos vitales -->
                <div class="hc-form-section" style="border-left-color:#3b82f6;">
                    <div class="hc-form-section-title" style="color:#2563eb;">
                        <i class="fa-solid fa-heart-pulse"></i> Signos Vitales y Biometría
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <div><label class="hc-field-label">Presión Arterial</label><input type="text"   id="rf-bp"     class="hc-input" placeholder="120/80" value="${v.bloodPressure || ''}"></div>
                        <div><label class="hc-field-label">Frec. Cardíaca (lpm)</label><input type="number" id="rf-hr"  class="hc-input" placeholder="72"   value="${v.heartRate || ''}"></div>
                        <div><label class="hc-field-label">Temperatura (°C)</label><input type="number"  id="rf-temp"   class="hc-input" placeholder="36.5" step="0.1" value="${v.temperature || ''}"></div>
                        <div><label class="hc-field-label">Sat. O₂ (%)</label><input type="number"      id="rf-spo2"   class="hc-input" placeholder="98"   value="${v.spo2 || ''}"></div>
                        <div><label class="hc-field-label">Peso (kg)</label><input type="number"         id="rf-weight" class="hc-input" step="0.1"        value="${v.weight || ''}"></div>
                        <div><label class="hc-field-label">Talla (cm)</label><input type="number"        id="rf-height" class="hc-input"                    value="${v.height || ''}"></div>
                    </div>
                </div>

                <!-- Evaluación clínica -->
                <div class="hc-form-section" style="border-left-color:#ea580c;">
                    <div class="hc-form-section-title" style="color:#c2410c;">
                        <i class="fa-solid fa-clipboard-list"></i> Motivo y Evaluación
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <div>
                            <label class="hc-field-label">Motivo de Consulta</label>
                            <textarea id="rf-reason" class="hc-input" rows="2" placeholder="Describa el motivo...">${r.reason || ''}</textarea>
                        </div>
                        <div>
                            <label class="hc-field-label">Diagnóstico Principal *</label>
                            <textarea id="rf-diagnosis" class="hc-input" rows="2" placeholder="Impresión diagnóstica..." required>${r.diagnosis || ''}</textarea>
                        </div>
                    </div>
                </div>

                <!-- Plan y recetas -->
                <div class="hc-form-section" style="border-left-color:#16a34a;">
                    <div class="hc-form-section-title" style="color:#15803d;">
                        <i class="fa-solid fa-pills"></i> Plan y Seguimiento
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <div>
                            <label class="hc-field-label">Plan de Tratamiento</label>
                            <textarea id="rf-treatment" class="hc-input" rows="2" placeholder="Indicaciones, plan terapéutico...">${r.treatment || ''}</textarea>
                        </div>
                        <div>
                            <label class="hc-field-label">Medicación Prescrita <span style="font-weight:400;">(uno por línea: Medicamento - Dosis - Frecuencia - Duración)</span></label>
                            <textarea id="rf-prescriptions" class="hc-input" rows="3"
                                      placeholder="Ej: Amoxicilina - 500mg - Cada 8h - 7 días">${Array.isArray(r.prescriptions)
                ? r.prescriptions.map(x => `${x.medication} - ${x.dosage} - ${x.frequency} - ${x.duration}`).join('\n')
                : (r.prescriptions || '')
            }</textarea>
                        </div>
                        <div>
                            <label class="hc-field-label">Próximo Control</label>
                            <input type="date" id="rf-followup" class="hc-input"
                                   value="${r.followUp ? new Date(r.followUp).toISOString().split('T')[0] : ''}">
                        </div>
                        <div>
                            <label class="hc-field-label">Notas Adicionales</label>
                            <textarea id="rf-notes" class="hc-input" rows="2" placeholder="Observaciones...">${r.notes || ''}</textarea>
                        </div>
                    </div>
                </div>

            </form>
            </div>

            <!-- Footer -->
            <div style="padding:12px 16px;background:#fff;border-top:1px solid var(--neutralLight);display:flex;gap:10px;flex-shrink:0;">
                <button id="rf-cancel-btn"
                    style="background:var(--neutralLight);color:var(--neutralPrimary);border:none;
                           border-radius:10px;padding:12px 16px;font-size:0.85rem;font-weight:600;cursor:pointer;">
                    Cancelar
                </button>
                <button id="rf-save-btn"
                    style="flex:1;background:var(--green);color:#fff;border:none;border-radius:10px;
                           padding:13px;font-size:0.87rem;font-weight:700;cursor:pointer;display:flex;
                           align-items:center;justify-content:center;gap:8px;">
                    <i class="fa-solid fa-circle-check"></i> Guardar Registro
                </button>
            </div>
        </div>`;

        // Inyectar estilos del formulario si no existen
        injectFormStyles();

        document.body.appendChild(fOverlay);

        const closeForm = () => {
            const sheet = document.getElementById('hc-record-form-sheet');
            if (sheet) sheet.style.animation = 'slideDown .25s ease forwards';
            setTimeout(() => { fOverlay.remove(); state.editingRecord = null; }, 240);
        };

        fOverlay.querySelector('#rf-close-btn')?.addEventListener('click', closeForm);
        fOverlay.querySelector('#rf-cancel-btn')?.addEventListener('click', closeForm);
        fOverlay.addEventListener('click', e => { if (e.target === fOverlay) closeForm(); });

        fOverlay.querySelector('#rf-save-btn')?.addEventListener('click', () => {
            if (saveRecord()) {
                closeForm();
                // Refrescar el expediente abierto
                setTimeout(() => {
                    if (hcOverlay && state.selectedPatient) {
                        const timeline = hcOverlay.querySelector('#hc-timeline');
                        if (timeline) {
                            const records = getPatientRecords(state.selectedPatient.id);
                            timeline.innerHTML = records.length ? renderTimeline(records) : `
                                <div style="text-align:center;padding:40px 16px;color:var(--neutralSecondary);">
                                    <i class="fa-solid fa-file-medical" style="font-size:2.5rem;opacity:.2;display:block;margin-bottom:12px;"></i>
                                    <div style="font-weight:600;">Sin registros clínicos</div>
                                </div>`;
                        }
                    }
                }, 300);
            }
        });
    }

    // ─── GUARDAR REGISTRO ─────────────────────────────────────────────────────

    function saveRecord() {
        const p = state.selectedPatient;
        const dateEl = document.getElementById('rf-date');
        const diagEl = document.getElementById('rf-diagnosis');
        if (!dateEl?.value || !diagEl?.value.trim()) {
            showToast('<i class="fa-solid fa-triangle-exclamation"></i> Diagnóstico y fecha son obligatorios', 'var(--red)');
            return false;
        }

        const rawPres = document.getElementById('rf-prescriptions')?.value.trim() || '';
        const prescriptions = rawPres
            ? rawPres.split('\n').map(line => {
                const parts = line.split('-').map(x => x.trim());
                return { medication: parts[0] || '', dosage: parts[1] || '', frequency: parts[2] || '', duration: parts[3] || '' };
            }).filter(x => x.medication)
            : null;

        const data = {
            patientId: p.id,
            doctorId: user?.doctorId || user?.id || '',
            creatorId: user?.id || '',
            creatorName: user?.name || '',
            creatorRole: user?.role || 'doctor',
            date: new Date(dateEl.value).getTime(),
            timestamp: Date.now(),
            type: document.getElementById('rf-type')?.value || 'consultation',
            status: document.getElementById('rf-status')?.value || 'draft',
            reason: document.getElementById('rf-reason')?.value.trim() || '',
            diagnosis: diagEl.value.trim(),
            treatment: document.getElementById('rf-treatment')?.value.trim() || '',
            prescriptions,
            notes: document.getElementById('rf-notes')?.value.trim() || '',
            followUp: document.getElementById('rf-followup')?.value
                ? new Date(document.getElementById('rf-followup').value).getTime() : null,
            vitalSigns: {
                bloodPressure: document.getElementById('rf-bp')?.value || null,
                heartRate: document.getElementById('rf-hr')?.value || null,
                temperature: document.getElementById('rf-temp')?.value || null,
                spo2: document.getElementById('rf-spo2')?.value || null,
                weight: document.getElementById('rf-weight')?.value || null,
                height: document.getElementById('rf-height')?.value || null
            },
            createdBy: user?.id || ''
        };

        if (state.editingRecord) {
            store.update('clinicalRecords', state.editingRecord.id, data);
            showToast('<i class="fa-solid fa-check"></i> Registro actualizado', 'var(--green)');
        } else {
            store.add('clinicalRecords', data);
            showToast('<i class="fa-solid fa-check"></i> Registro guardado', 'var(--green)');
        }
        state.editingRecord = null;
        render(); // Actualizar KPIs de la lista
        return true;
    }

    // ─── GENERADOR PDF ────────────────────────────────────────────────────────

    async function generatePDF(records, p) {
        showToast('Generando PDF...', 'var(--themePrimary)');
        try {
            if (typeof window.jspdf === 'undefined') {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                await new Promise((res, rej) => { s.onload = res; s.onerror = rej; document.head.appendChild(s); });
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const pW = doc.internal.pageSize.getWidth();
            const margin = 15, cW = pW - 2 * margin;

            // Función para modo Gris/Profesional (0,51,102 -> Gris Institucional)
            const gs = (r, g, b) => {
                const v = Math.round(r * .299 + g * .587 + b * .114);
                return [v, v, v];
            };
            const fill = (r, g, b) => { const [a] = gs(r, g, b); doc.setFillColor(a, a, a); };
            const txt = (r, g, b) => { const [a] = gs(r, g, b); doc.setTextColor(a, a, a); };
            const line = (r, g, b) => { const [a] = gs(r, g, b); doc.setDrawColor(a, a, a); };

            records.forEach((record, idx) => {
                if (idx > 0) doc.addPage();
                const dr = store.find('doctors', record.doctorId);
                const date = new Date(record.date);
                const vt = record.vitalSigns || {};
                let y = margin;

                // --- ENCABEZADO FORMAL ---
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                txt(0, 51, 102);
                doc.text('HOSPITAL UNIVERSITARIO MANUEL NÚÑEZ TOVAR', pW / 2, y + 5, { align: 'center' });

                doc.setFontSize(10);
                txt(100, 100, 100);
                doc.text('SISTEMA DE GESTIÓN HOSPITALARIA - HISTORIA CLÍNICA ELECTRÓNICA', pW / 2, y + 12, { align: 'center' });

                line(0, 51, 102);
                doc.setLineWidth(0.6);
                doc.line(margin, y + 17, pW - margin, y + 17);
                y += 26;

                // ID y Fecha
                doc.setFontSize(8); txt(120, 120, 120); doc.setFont('helvetica', 'normal');
                doc.text(`ID REGISTRO: ${record.id?.split('_').pop().toUpperCase() || '—'}`, margin, y);
                doc.text(`FECHA DE EMISIÓN: ${date.toLocaleDateString('es-ES')} ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`, pW - margin, y, { align: 'right' });
                y += 8;

                // --- BLOQUES: PACIENTE Y MÉDICO ---
                fill(240, 240, 240);
                doc.rect(margin, y, cW, 30, 'F');
                line(200, 200, 200);
                doc.rect(margin, y, cW, 30, 'D');

                doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt(0, 51, 102);
                doc.text('DATOS DEL PACIENTE', margin + 5, y + 7);
                doc.text('MÉDICO RESPONSABLE', pW / 2 + 5, y + 7);

                doc.setFont('helvetica', 'normal'); doc.setFontSize(10); txt(0, 0, 0);
                doc.text(p.name, margin + 5, y + 14);
                doc.setFontSize(9);
                doc.text(`DNI: ${p.docType || 'V'}-${p.dni || '—'}  |  Edad: ${calcAge(p.birthDate)} años`, margin + 5, y + 20);
                doc.text(`Grupo Sanguíneo: ${p.bloodType || 'NR'}`, margin + 5, y + 26);

                const respName = record.creatorName
                    ? (record.creatorRole === 'doctor' ? 'Dr. ' : record.creatorRole === 'nurse' ? 'Lic. ' : '') + record.creatorName
                    : 'Dr. ' + (dr?.name || '—');
                doc.setFontSize(10);
                doc.text(respName, pW / 2 + 5, y + 14);
                doc.setFontSize(9);
                doc.text(dr?.specialty || 'Medicina General', pW / 2 + 5, y + 20);
                if (dr?.license) doc.text(`Matrícula Profesional: ${dr.license}`, pW / 2 + 5, y + 26);
                y += 38;

                // --- SIGNOS VITALES ---
                fill(0, 51, 102);
                doc.rect(margin, y, cW, 8, 'F');
                doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
                doc.text('SIGNOS VITALES Y EVALUACIÓN FÍSICA', margin + 5, y + 5.5);
                y += 8;

                const vData = [
                    { l: 'P. Arterial', v: vt.bloodPressure ? String(vt.bloodPressure) : '—' },
                    { l: 'F. Cardíaca', v: vt.heartRate ? String(vt.heartRate) + ' lpm' : '—' },
                    { l: 'Temp.', v: vt.temperature ? String(vt.temperature) + ' °C' : '—' },
                    { l: 'Sat. O2', v: vt.spo2 ? String(vt.spo2) + ' %' : '—' },
                    { l: 'Peso', v: vt.weight ? String(vt.weight) + ' kg' : '—' },
                    { l: 'F. Resp.', v: vt.respiratoryRate ? String(vt.respiratoryRate) + ' rpm' : '—' }
                ];

                doc.setFontSize(8); txt(0, 0, 0);
                let currentX = margin;
                const colW = cW / 6;
                vData.forEach(item => {
                    line(200, 200, 200);
                    doc.rect(currentX, y, colW, 15, 'D');
                    doc.setFont('helvetica', 'bold');
                    doc.text(item.l, currentX + (colW / 2), y + 5, { align: 'center' });
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    doc.text(item.v, currentX + (colW / 2), y + 11, { align: 'center' });
                    doc.setFontSize(8);
                    currentX += colW;
                });
                y += 23;

                // --- SECCIONES CLÍNICAS ---
                const contents = [
                    { t: 'MOTIVO DE CONSULTA / EVALUACIÓN', c: record.reason || 'Sin datos especificados' },
                    { t: 'DIAGNÓSTICO E IMPRESIÓN CLÍNICA', c: record.diagnosis || 'Pendiente de evolución' },
                    { t: 'PLAN DE TRATAMIENTO O INTERVENCIÓN', c: record.treatment || 'No aplica en este registro' }
                ];

                contents.forEach(sec => {
                    fill(245, 245, 245);
                    doc.rect(margin, y, cW, 7, 'F');
                    doc.setFont('helvetica', 'bold'); txt(0, 51, 102);
                    doc.text(sec.t, margin + 5, y + 5);
                    y += 10;

                    doc.setFont('helvetica', 'normal'); txt(20, 20, 20);
                    const lines = doc.splitTextToSize(sec.c, cW - 10);
                    doc.text(lines, margin + 5, y);
                    y += (lines.length * 5) + 8;

                    if (y > 250) { doc.addPage(); y = margin + 10; }
                });

                // --- PRESCRIPCIONES / RECETA ---
                if (record.prescriptions && record.prescriptions.length > 0) {
                    fill(235, 245, 240);
                    doc.rect(margin, y, cW, 7, 'F');
                    doc.setFont('helvetica', 'bold'); txt(10, 80, 50);
                    doc.text('PRESCRIPCIONES MÉDICAS (RECETA)', margin + 5, y + 5);
                    y += 10;
                    doc.setFont('helvetica', 'normal'); txt(0, 0, 0);
                    if (Array.isArray(record.prescriptions)) {
                        record.prescriptions.forEach((px, i) => {
                            const pText = `${i + 1}. ${px.medication} — ${px.dosage} — ${px.frequency} (${px.duration})`;
                            const pxLines = doc.splitTextToSize(pText, cW - 10);
                            doc.text(pxLines, margin + 5, y);
                            y += (pxLines.length * 5) + 3;
                        });
                    } else if (typeof record.prescriptions === 'string') {
                        const pxLines = doc.splitTextToSize(record.prescriptions, cW - 10);
                        doc.text(pxLines, margin + 5, y);
                        y += (pxLines.length * 5) + 3;
                    }
                    y += 10;
                }

                // --- FIRMA Y SELLO ---
                if (y > 230) { doc.addPage(); y = margin + 20; }
                else y = 245;

                line(0, 51, 102);
                doc.setLineWidth(0.5);
                doc.line(pW / 2 - 35, y, pW / 2 + 35, y);
                doc.setFontSize(10); doc.setFont('helvetica', 'bold'); txt(0, 0, 0);
                doc.text(respName, pW / 2, y + 6, { align: 'center' });
                doc.setFontSize(8); doc.setFont('helvetica', 'normal'); txt(100, 100, 100);
                doc.text(dr?.specialty || 'Medicina General', pW / 2, y + 11, { align: 'center' });
                if (dr?.license) {
                    const licStr = String(dr.license);
                    doc.text(`MPPS: ${licStr} / CMS: ${licStr.slice(-5)}`, pW / 2, y + 16, { align: 'center' });
                }
            });

            const fname = `HC_HUMNT_${p.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fname);
            showToast('<i class="fa-solid fa-check"></i> Historia Clínica exportada correctamente', 'var(--green)');
        } catch (e) {
            console.error(e);
            showToast('<i class="fa-solid fa-circle-xmark"></i> Error al generar PDF', 'var(--red)');
        }
    }

    // ─── Estilos inline ───────────────────────────────────────────────────────

    function injectFormStyles() {
        if (document.getElementById('hc-form-styles')) return;
        const style = document.createElement('style');
        style.id = 'hc-form-styles';
        style.textContent = `
            .hc-form-section {
                background: #fff;
                border-radius: 12px;
                border: 1px solid var(--neutralLight);
                border-left-width: 4px;
                padding: 12px 14px;
                margin-bottom: 10px;
            }
            .hc-form-section-title {
                font-size: 0.72rem;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 10px;
            }
            .hc-field-label {
                font-size: 0.68rem;
                font-weight: 700;
                color: var(--neutralSecondary);
                text-transform: uppercase;
                display: block;
                margin-bottom: 4px;
                letter-spacing: 0.04em;
            }
            .hc-input {
                width: 100%;
                border: 1px solid var(--neutralLight);
                border-radius: 8px;
                padding: 9px 10px;
                font-size: 0.83rem;
                font-family: inherit;
                background: var(--neutralLighterAlt, #f8f8f8);
                box-sizing: border-box;
                color: var(--neutralDark);
                outline: none;
                resize: vertical;
            }
            .hc-input:focus {
                border-color: var(--themePrimary);
                background: #fff;
                box-shadow: 0 0 0 3px rgba(0,59,105,.1);
            }`;
        document.head.appendChild(style);
    }

    // ─── Iniciar ──────────────────────────────────────────────────────────────
    render();

    return { refresh: render };
}
