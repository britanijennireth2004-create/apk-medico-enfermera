/**
 * triaje.js — Módulo de Triaje (APK / Doctor Mobile)
 * Propuesta base con paridad funcional respecto a src/modules/triaje.js:
 *   - Cola de pacientes priorizados por nivel de triaje (Rojo/Naranja/Amarillo/Verde/Azul)
 *   - KPIs: total, en espera, en atención, completados + tiempo promedio de espera
 *   - Filtros: estado + búsqueda rápida
 *   - Protocolo de clasificación con contadores por nivel
 *   - Registro de triaje: búsqueda por cédula, signos vitales, síntomas, prioridad sugerida
 *   - Atender / Completar paciente desde la cola
 *   - Alerta de emergencia (CÓDIGO ROJO)
 *   - Exportar reporte PDF con jsPDF
 */

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const LEVELS = {
    red: { name: 'Rojo — Inmediato', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', time: '0-10 min', icon: 'fa-circle-exclamation' },
    orange: { name: 'Naranja — Muy urgente', color: '#ea580c', bg: '#fff7ed', border: '#fdba74', time: '10-60 min', icon: 'fa-triangle-exclamation' },
    yellow: { name: 'Amarillo — Urgente', color: '#d97706', bg: '#fffbeb', border: '#fde047', time: '1-2 horas', icon: 'fa-circle-exclamation' },
    green: { name: 'Verde — Poco urgente', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', time: '2-4 horas', icon: 'fa-circle-check' },
    blue: { name: 'Azul — No urgente', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', time: '4+ horas', icon: 'fa-circle-info' }
};

const PRIORITY_ORDER = { red: 0, orange: 1, yellow: 2, green: 3, blue: 4 };

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function calcAge(bd) {
    if (!bd) return '?';
    const b = new Date(bd), t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a;
}

function waitStr(ms) {
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
    return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function showToast(msg, color = '#003b69') {
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

/**
 * Sugerir prioridad según síntomas + signos vitales
 * (misma lógica que la versión web, simplificada para mobile)
 */
function suggestPriority(symptoms = '', vitals = {}) {
    const s = symptoms.toLowerCase();
    const spo2 = +vitals.spo2 || 0, hr = +vitals.heartRate || 0,
        temp = +vitals.temperature || 0, pain = +vitals.painLevel || 0,
        rr = +vitals.respiratoryRate || 0;
    let bp = 0;
    if (vitals.bloodPressure) { const p = vitals.bloodPressure.split('/'); bp = parseInt(p[0]) || 0; }

    if ([s.includes('paro'), s.includes('convulsio'), s.includes('hemorragia masiva'),
    s.includes('shock'), s.includes('inconsciente'), s.includes('coma'),
    (spo2 > 0 && spo2 < 90), (rr > 0 && (rr > 30 || rr < 10)), pain === 10, (bp > 0 && bp < 90), (hr > 150 || hr < 40)]
        .some(Boolean)) return 'red';

    if ([s.includes('dolor torácico'), s.includes('disnea'), s.includes('trauma severo'),
    s.includes('confusión'), s.includes('hemorragia activa'),
    (spo2 >= 90 && spo2 <= 94), (rr >= 25 && rr <= 30), (pain >= 8 && pain <= 9), (bp >= 90 && bp <= 100), (hr >= 130 && hr <= 150)]
        .some(Boolean)) return 'orange';

    if ([temp > 39, s.includes('dolor abdominal'), s.includes('vómito'), s.includes('fiebre alta'),
    s.includes('infección'), (spo2 >= 95 && spo2 <= 97), (pain >= 5 && pain <= 7), (temp >= 38 && temp <= 39), (hr >= 100 && hr < 130)]
        .some(Boolean)) return 'yellow';

    if ([s.includes('resfriado'), s.includes('gripe'), s.includes('consulta'), s.includes('control'),
    spo2 > 97, (pain <= 4 && pain > 0), (hr >= 60 && hr <= 100 && temp < 38)].some(Boolean)) return 'green';

    return 'blue';
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export function mountTriaje(root, { store, user }) {
    if (!root) return;

    const state = {
        filterStatus: 'waiting',
        filterPriority: 'all',
        search: '',
        interval: null
    };

    // ── Obtener cola ──────────────────────────────────────────────────────────
    function injectStyles() {
        if (!document.getElementById('tj-module-styles')) {
            const s = document.createElement('style');
            s.id = 'tj-module-styles';
            s.textContent = `
                @keyframes pulse-red {
                    0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); transform: scale(1); }
                    50% { box-shadow: 0 0 0 15px rgba(220, 38, 38, 0); transform: scale(1.05); }
                    100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); transform: scale(1); }
                }
                @keyframes emergency-flash { 0%,100%{background:#dc2626} 50%{background:#ef4444} }
                .pulse-red-anim { animation: pulse-red 2s infinite; }
            `;
            document.head.appendChild(s);
        }
    }
    injectStyles();
    function getQueue() {
        const records = store.get('triaje') || [];
        const patients = store.get('patients') || [];
        return records.map(r => {
            const p = patients.find(x => x.id === r.patientId);
            return {
                ...r,
                patient: p || null,
                fullName: p?.name || 'Desconocido',
                age: p ? calcAge(p.birthDate) : '?',
                bloodType: p?.bloodType || '?',
                allergies: p?.allergies || [],
                waiting: Date.now() - (r.createdAt || Date.now())
            };
        });
    }

    function filtered() {
        let q = getQueue();
        if (state.filterStatus !== 'all') q = q.filter(r => r.status === state.filterStatus);
        if (state.filterPriority !== 'all') q = q.filter(r => r.priority === state.filterPriority);
        if (state.search) {
            const s = state.search.toLowerCase();
            q = q.filter(r => r.fullName.toLowerCase().includes(s) || (r.symptoms || '').toLowerCase().includes(s));
        }
        return q.sort((a, b) => {
            const pd = (PRIORITY_ORDER[a.priority] || 4) - (PRIORITY_ORDER[b.priority] || 4);
            return pd !== 0 ? pd : a.waiting - b.waiting;
        });
    }

    // ── KPIs ──────────────────────────────────────────────────────────────────
    function buildKPIs() {
        const all = store.get('triaje') || [];
        const waiting = all.filter(r => r.status === 'waiting');
        const avgWait = waiting.length
            ? Math.floor(waiting.reduce((s, r) => s + (Date.now() - (r.createdAt || Date.now())), 0) / waiting.length / 60000)
            : 0;
        const kpis = [
            { label: 'Total', val: all.length, icon: 'fa-users', color: 'var(--themePrimary)' },
            { label: 'En Espera', val: waiting.length, icon: 'fa-hourglass-half', color: '#d97706' },
            { label: 'En Atención', val: all.filter(r => r.status === 'in_progress').length, icon: 'fa-stethoscope', color: 'var(--teal)' },
            { label: 'Completados', val: all.filter(r => r.status === 'completed').length, icon: 'fa-circle-check', color: 'var(--green)' },
            { label: 'Espera Prom.', val: `${avgWait}m`, icon: 'fa-clock', color: 'var(--neutralSecondary)' },
            { label: 'Críticos', val: waiting.filter(r => r.priority === 'red').length, icon: 'fa-circle-exclamation', color: '#dc2626' }
        ];
        return kpis.map(k => `
            <div style="background:#fff;border-radius:10px;padding:10px 12px;border:1px solid var(--neutralLight);
                        display:flex;align-items:center;gap:8px;">
                <div style="width:32px;height:32px;border-radius:8px;background:${k.color}15;display:flex;
                            align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fa-solid ${k.icon}" style="color:${k.color};font-size:0.8rem;"></i>
                </div>
                <div>
                    <div style="font-size:1rem;font-weight:800;color:var(--neutralDark);line-height:1;">${k.val}</div>
                    <div style="font-size:0.62rem;color:var(--neutralSecondary);margin-top:1px;">${k.label}</div>
                </div>
            </div>`).join('');
    }

    // ── Protocolo clasificación ───────────────────────────────────────────────


    // ── Fila de paciente ──────────────────────────────────────────────────────
    function buildRow(r) {
        const lv = LEVELS[r.priority] || LEVELS.blue;
        const wait = waitStr(r.waiting);
        const statusMap = { waiting: 'En Espera', in_progress: 'En Atención', completed: 'Completado', cancelled: 'Cancelado' };
        // Color de espera crítico
        const waitColor = r.waiting > 3600000 ? '#dc2626' : r.waiting > 1800000 ? '#ea580c' : r.status === 'waiting' ? '#d97706' : r.status === 'in_progress' ? 'var(--teal)' : 'var(--green)';

        return `
        <div style="background:#fff;border-radius:10px;border:1px solid var(--neutralLight);
                    border-left:4px solid ${lv.color};padding:12px 14px;margin-bottom:8px;">
            <!-- Cabecera -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <div style="width:36px;height:36px;border-radius:10px;background:${lv.color}20;
                            display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fa-solid ${lv.icon}" style="color:${lv.color};font-size:0.85rem;"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:0.88rem;color:var(--neutralDark);
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.fullName}</div>
                    <div style="font-size:0.68rem;color:var(--neutralSecondary);">
                        ${r.age} años · ${r.bloodType}
                        ${r.allergies.length ? `<span style="color:#d97706;"> · <i class="fa-solid fa-triangle-exclamation"></i> Alergias</span>` : ''}
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.65rem;font-weight:700;padding:2px 7px;border-radius:10px;
                                background:${lv.bg};color:${lv.color};white-space:nowrap;margin-bottom:3px;">${lv.name.split('—')[0].trim()}</div>
                    <div style="font-size:0.62rem;color:${waitColor};font-weight:${r.waiting > 3600000 ? '800' : '600'};">
                        ${statusMap[r.status] || r.status} · <i class="fa-solid fa-clock"></i> ${wait}${r.waiting > 3600000 ? ' <i class="fa-solid fa-triangle-exclamation" style="color:#dc2626;"></i>' : ''}
                    </div>
                </div>
            </div>
            <!-- Síntomas -->
            ${r.symptoms ? `
            <div style="font-size:0.75rem;color:var(--neutralSecondary);margin-bottom:8px;
                        padding:6px 8px;background:var(--neutralLighterAlt,#f8f8f8);border-radius:6px;">
                <i class="fa-solid fa-notes-medical" style="color:var(--themePrimary);margin-right:5px;font-size:0.68rem;"></i>
                ${r.symptoms.length > 80 ? r.symptoms.slice(0, 80) + '…' : r.symptoms}
            </div>` : ''}
            <!-- Signos vitales rápidos -->
            ${r.vitalSigns && Object.values(r.vitalSigns).some(Boolean) ? `
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                ${r.vitalSigns.bloodPressure ? `<div style="font-size:0.65rem;"><b>PA</b> ${r.vitalSigns.bloodPressure}</div>` : ''}
                ${r.vitalSigns.heartRate ? `<div style="font-size:0.65rem;"><b>FC</b> ${r.vitalSigns.heartRate}lpm</div>` : ''}
                ${r.vitalSigns.temperature ? `<div style="font-size:0.65rem;"><b>T°</b> ${r.vitalSigns.temperature}°C</div>` : ''}
                ${r.vitalSigns.spo2 ? `<div style="font-size:0.65rem;"><b>SpO₂</b> ${r.vitalSigns.spo2}%</div>` : ''}
                ${r.vitalSigns.respiratoryRate ? `<div style="font-size:0.65rem;"><b>FR</b> ${r.vitalSigns.respiratoryRate}</div>` : ''}
                ${r.vitalSigns.painLevel ? `<div style="font-size:0.65rem;"><b>Dolor</b> ${r.vitalSigns.painLevel}/10</div>` : ''}
            </div>` : ''}
            <!-- Acciones -->
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
                ${r.status === 'waiting' ? `
                <button class="tj-btn-attend" data-id="${r.id}" title="Atender"
                    style="background:var(--teal);color:#fff;border:none;border-radius:50%;
                           width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;cursor:pointer;box-shadow:0 3px 6px rgba(0,0,0,0.1);">
                    <i class="fa-solid fa-stethoscope"></i>
                </button>` : ''}
                ${r.status === 'in_progress' ? `
                <button class="tj-btn-complete" data-id="${r.id}" title="Completar"
                    style="background:var(--green);color:#fff;border:none;border-radius:50%;
                           width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;cursor:pointer;box-shadow:0 3px 6px rgba(0,0,0,0.1);">
                    <i class="fa-solid fa-circle-check"></i>
                </button>` : ''}
                <button class="tj-btn-view" data-id="${r.id}" title="Ver Detalle"
                    style="background:var(--themeLighterAlt);color:var(--themePrimary);border:none;border-radius:50%;
                           width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.15rem;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button class="tj-btn-print-ind" data-id="${r.id}" title="Imprimir PDF"
                    style="background:#f8fafc;color:var(--neutralSecondary);border:1.5px solid var(--neutralLight);border-radius:50%;
                           width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;cursor:pointer;">
                    <i class="fa-solid fa-file-pdf"></i>
                </button>
                ${r.status !== 'completed' ? `
                <button class="tj-btn-cancel" data-id="${r.id}" title="Cancelar"
                    style="background:#fee2e2;color:#dc2626;border:1.5px solid #fecaca;
                           border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;cursor:pointer;">
                    <i class="fa-solid fa-ban"></i>
                </button>` : ''}
            </div>
        </div>`;
    }

    // ── Render principal ──────────────────────────────────────────────────────
    function render() {
        const rows = filtered();
        root.innerHTML = `
        <!-- KPIs -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
            ${buildKPIs()}
        </div>

        <!-- Barra de acciones -->
        <div style="display:flex;gap:15px;margin-bottom:15px;justify-content:center;padding:5px 0;">
            <button id="tj-btn-new" title="Nuevo Registro de Triaje"
                style="background:var(--themePrimary);color:#fff;border:none;border-radius:50%;
                       width:56px;height:56px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,59,105,0.3);flex-shrink:0;">
                <i class="fa-solid fa-plus"></i>
            </button>
            <button id="tj-btn-emergency" title="Alerta de Emergencia" class="pulse-red-anim"
                style="background:#dc2626;color:#fff;border:none;border-radius:50%;
                       width:56px;height:56px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;cursor:pointer;box-shadow:0 6px 15px rgba(220,38,38,0.4);flex-shrink:0;">
                <i class="fa-solid fa-bullhorn"></i>
            </button>
            <button id="tj-btn-refresh" title="Refrescar datos"
                style="background:#fff;color:var(--themePrimary);border:2px solid var(--themePrimary);border-radius:50%;
                       width:56px;height:56px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.05);flex-shrink:0;">
                <i class="fa-solid fa-rotate"></i>
            </button>
             <button id="tj-btn-clear" title="Limpiar completados"
                style="background:#f1f5f9;color:var(--neutralSecondary);border:2px solid var(--neutralLight);border-radius:50%;
                       width:56px;height:56px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.05);flex-shrink:0;">
                <i class="fa-solid fa-broom"></i>
            </button>
            <button id="tj-btn-pdf" title="Reporte General PDF"
                style="background:#0369a1;color:#fff;border:none;border-radius:50%;
                       width:56px;height:56px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;cursor:pointer;box-shadow:0 4px 10px rgba(3,105,161,0.25);flex-shrink:0;">
                <i class="fa-solid fa-file-pdf"></i>
            </button>
        </div>

        <!-- Buscador -->
        <div style="position:relative;margin-bottom:10px;">
            <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);
               color:var(--neutralSecondary);font-size:0.75rem;"></i>
            <input id="tj-search" type="text" value="${state.search}"
                   placeholder="Buscar por nombre o síntomas..."
                   style="width:100%;padding:9px 12px 9px 30px;border-radius:20px;border:1px solid var(--neutralLight);
                          font-size:0.82rem;box-sizing:border-box;background:#f8f8f8;">
        </div>

        <!-- Cola de pacientes -->
        <div style="width:100%;">
            <!-- Tabs estado -->
            <div style="display:flex;gap:4px;margin-bottom:12px;background:var(--neutralLighter,#f4f4f4);
                        border-radius:12px;padding:4px;">
                ${['all', 'waiting', 'in_progress', 'completed'].map(st => {
            const labels = { all: 'Todos', waiting: 'Espera', in_progress: 'Atención', completed: 'Listos' };
            return `<button class="tj-tab" data-status="${st}"
                            style="flex:1;border:none;border-radius:8px;padding:10px 4px;font-size:0.75rem;font-weight:700;cursor:pointer;
                                   background:${state.filterStatus === st ? '#fff' : 'transparent'};
                                   color:${state.filterStatus === st ? 'var(--themePrimary)' : 'var(--neutralSecondary)'};
                                   box-shadow:${state.filterStatus === st ? '0 2px 5px rgba(0,0,0,.08)' : 'none'};">
                            ${labels[st]}
                        </button>`;
        }).join('')}
            </div>

            <!-- Lista de pacientes -->
            ${rows.length ? rows.map(buildRow).join('') : `
            <div style="text-align:center;padding:40px 16px;background:#fff;border-radius:10px;
                        border:1px solid var(--neutralLight);color:var(--neutralSecondary);">
                <i class="fa-solid fa-hourglass-end" style="font-size:2rem;opacity:.2;display:block;margin-bottom:10px;"></i>
                <div style="font-weight:600;">Cola vacía</div>
                <div style="font-size:0.78rem;margin-top:4px;">No hay pacientes${state.filterStatus !== 'all' ? ' con este estado' : ''}</div>
            </div>`}
        </div>
        </div>`;

        bindEvents();
    }

    // ── Eventos ───────────────────────────────────────────────────────────────
    function bindEvents() {
        // Búsqueda
        let _t;
        root.querySelector('#tj-search')?.addEventListener('input', e => {
            clearTimeout(_t);
            _t = setTimeout(() => { state.search = e.target.value; render(); }, 300);
        });

        // Tabs estado
        root.querySelectorAll('.tj-tab').forEach(btn => {
            btn.addEventListener('click', () => { state.filterStatus = btn.dataset.status; render(); });
        });

        // Nuevo triaje
        root.querySelector('#tj-btn-new')?.addEventListener('click', () => openTriajeForm());

        // Código Rojo
        root.querySelector('#tj-btn-emergency')?.addEventListener('click', openEmergencyForm);

        // Actualizar manual
        root.querySelector('#tj-btn-refresh')?.addEventListener('click', () => {
            showToast('Actualizando datos...', 'var(--themePrimary)');
            render();
        });

        // PDF
        root.querySelector('#tj-btn-pdf')?.addEventListener('click', () => exportPDF());

        // Limpiar completados
        root.querySelector('#tj-btn-clear')?.addEventListener('click', async () => {
            const all = store.get('triaje') || [];
            const toKeep = all.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
            // recargar store sin completados
            const completed = all.filter(r => r.status === 'completed' || r.status === 'cancelled');
            if (!completed.length) { showToast('No hay registros para limpiar', '#64748b'); return; }
            if (await hospitalConfirm(`¿Eliminar ${completed.length} registro(s) completado(s)/cancelado(s)?`, 'danger')) {
                completed.forEach(r => store.remove?.('triaje', r.id));
                showToast(`<i class="fa-solid fa-check"></i> ${completed.length} registro(s) eliminado(s)`, 'var(--green)');
                render();
            }
        });

        // Acciones de fila
        root.querySelectorAll('.tj-btn-attend').forEach(btn => {
            btn.addEventListener('click', () => {
                store.update('triaje', btn.dataset.id, { status: 'in_progress', startedAt: Date.now() });
                showToast('<i class="fa-solid fa-play"></i> Paciente en atención', 'var(--teal)');
                render();
            });
        });
        root.querySelectorAll('.tj-btn-complete').forEach(btn => {
            btn.addEventListener('click', () => {
                store.update('triaje', btn.dataset.id, { status: 'completed', completedAt: Date.now() });
                showToast('<i class="fa-solid fa-check"></i> Atención completada', 'var(--green)');
                render();
            });
        });
        root.querySelectorAll('.tj-btn-cancel').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (await hospitalConfirm('¿Cancelar este registro de triaje?', 'danger')) {
                    store.update('triaje', btn.dataset.id, { status: 'cancelled' });
                    showToast('Registro cancelado', '#64748b');
                    render();
                }
            });
        });
        root.querySelectorAll('.tj-btn-view').forEach(btn => {
            btn.addEventListener('click', () => {
                const rec = (store.get('triaje') || []).find(r => r.id === btn.dataset.id);
                if (rec) openDetailSheet(rec);
            });
        });
        root.querySelectorAll('.tj-btn-print-ind').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const rec = (store.get('triaje') || []).find(r => r.id === btn.dataset.id);
                if (rec) exportIndividualPDF(rec);
            });
        });
    }

    // ── FORMULARIO NUEVO TRIAJE ───────────────────────────────────────────────
    function openTriajeForm() {
        document.getElementById('tj-form-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'tj-form-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,32,80,.55);backdrop-filter:blur(3px);display:flex;flex-direction:column;justify-content:flex-end;animation:fadeIn .2s ease;';

        const patients = store.get('patients') || [];
        let isNewPatient = false; // Estado local para el modal

        overlay.innerHTML = `
        <div id="tj-form-sheet"
             style="background:#fff;border-radius:20px 20px 0 0;max-height:94vh;display:flex;flex-direction:column;
                    box-shadow:0 -8px 40px rgba(0,0,0,.2);animation:slideUp .3s cubic-bezier(.4,0,.2,1);">

            <div style="background:var(--themePrimary);padding:16px 18px;border-radius:20px 20px 0 0;flex-shrink:0;">
                <div style="width:40px;height:4px;background:rgba(255,255,255,.3);border-radius:4px;margin:0 auto 12px;"></div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="color:rgba(255,255,255,.7);font-size:0.65rem;font-weight:700;text-transform:uppercase;">HUMNT · Triaje</div>
                        <div style="color:#fff;font-size:0.95rem;font-weight:800;margin-top:2px;">Nuevo Registro de Triaje</div>
                    </div>
                    <button id="tj-form-close"
                        style="background:rgba(255,255,255,.15);border:none;border-radius:50%;width:32px;height:32px;
                               cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>

            <!-- Tabs de navegación -->
            <div style="display:flex;background:var(--neutralLighter);padding:4px;gap:4px;flex-shrink:0;">
                <button id="tj-tab-existing" style="flex:2;padding:10px;border:none;border-radius:12px;font-size:0.8rem;font-weight:700;cursor:pointer;background:#fff;color:var(--themePrimary);box-shadow:0 2px 4px rgba(0,0,0,.05);">
                    <i class="fa-solid fa-search"></i> Paciente Existente
                </button>
                <button id="tj-tab-new" style="flex:1;display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;width:44px;height:44px;font-size:1.2rem;font-weight:700;cursor:pointer;background:transparent;color:var(--neutralSecondary);" title="Nuevo Paciente">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>

            <div style="flex:1;overflow-y:auto;padding:14px;" id="tj-form-scroll-body">

                <!-- SECCIÓN: PACIENTE EXISTENTE -->
                <div id="tj-sec-existing">
                    <div style="background:#fff;border-radius:12px;border:1px solid var(--neutralLight);
                                border-left:4px solid var(--themePrimary);padding:12px 14px;margin-bottom:10px;">
                        <div style="font-size:0.70rem;font-weight:800;color:var(--themePrimary);text-transform:uppercase;
                                    display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                            <i class="fa-solid fa-id-card"></i> Identificación
                        </div>
                        <div class="input-group">
                            <select id="tj-doc-type" class="select-compact">
                                <option>V</option><option>E</option><option>J</option><option>P</option>
                            </select>
                            <input id="tj-cedula" type="text" placeholder="Número de cédula...">
                        </div>
                        <div id="tj-patient-feedback" style="font-size:0.78rem;margin-bottom:6px;"></div>
                        <input type="hidden" id="tj-patient-id">
                        <div id="tj-patient-name-box" style="display:none;padding:8px 10px;border-radius:8px;
                             background:#f0fdf4;border:1px solid #86efac;font-size:0.82rem;font-weight:600;color:#15803d;">
                            <i class="fa-solid fa-circle-check"></i> <span id="tj-patient-name-display"></span>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN: REGISTRO RÁPIDO (NUEVO) -->
                <div id="tj-sec-new" style="display:none;">
                    <div style="background:#fff;border-radius:12px;border:1px solid var(--neutralLight);
                                border-left:4px solid var(--green);padding:12px 14px;margin-bottom:10px;">
                        <div style="font-size:0.70rem;font-weight:800;color:var(--green);text-transform:uppercase;
                                    margin-bottom:10px;">Datos del Nuevo Paciente</div>
                        
                        <div class="input-group" style="margin-bottom:10px;">
                             <select id="tj-new-doc-type" class="select-compact">
                                <option>V</option><option>E</option><option>P</option>
                             </select>
                             <input id="tj-new-dni" type="text" placeholder="DNI / Cédula *">
                        </div>
                        <div style="margin-bottom:10px;">
                            <input id="tj-new-name" type="text" class="tj-in" placeholder="Nombre completo *">
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                            <div><label class="tj-lbl">F. Nacimiento *</label><input type="date" id="tj-new-birth" class="tj-in"></div>
                            <div><label class="tj-lbl">Género *</label>
                                <select id="tj-new-gender" class="tj-in">
                                    <option value="M">Masculino</option>
                                    <option value="F">Femenino</option>
                                    <option value="O">Otro</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-bottom:10px;">
                            <input id="tj-new-phone" type="tel" class="tj-in" placeholder="Teléfono de contacto *">
                        </div>

                        <div style="margin-bottom:10px;">
                            <textarea id="tj-new-antecedents" class="tj-in" rows="2" placeholder="Antecedentes médicos (Diabetes, HTA...)"></textarea>
                        </div>

                        <div style="background:var(--neutralLighter);padding:8px;border-radius:8px;">
                            <div style="font-size:0.65rem;font-weight:800;color:var(--neutralSecondary);margin-bottom:5px;">CONTACTO DE EMERGENCIA</div>
                            <input id="tj-new-ec-name" type="text" class="tj-in" placeholder="Nombre contacto" style="margin-bottom:5px;font-size:0.75rem;">
                            <input id="tj-new-ec-phone" type="tel" class="tj-in" placeholder="Teléfono contacto" style="font-size:0.75rem;">
                        </div>

                        <!-- Mini Alergias -->
                        <div style="margin-top:5px;border-top:1px solid var(--neutralLight);padding-top:10px;">
                            <label class="tj-lbl">Alergias</label>
                            <div id="tj-new-allergies-container"></div>
                            <button type="button" id="tj-btn-add-allergy" 
                                    style="margin-top:5px;background:none;border:1px dashed var(--neutralLight);
                                           border-radius:6px;padding:5px;font-size:0.65rem;width:100%;color:var(--neutralSecondary);">
                                + Agregar Alergia
                            </button>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN COMÚN: SIGNOS Y EVALUACIÓN -->
                <div id="tj-sec-common">
                    <!-- Signos vitales -->
                    <div style="background:#fff;border-radius:12px;border:1px solid var(--neutralLight);
                                border-left:4px solid #3b82f6;padding:12px 14px;margin-bottom:10px;">
                        <div style="font-size:0.72rem;font-weight:800;color:#2563eb;text-transform:uppercase;
                                    display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                            <i class="fa-solid fa-heart-pulse"></i> Signos Vitales
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <div><label class="tj-lbl">Presión Arterial</label><input type="text"   id="tj-bp"     class="tj-in" placeholder="120/80"></div>
                            <div><label class="tj-lbl">FC (lpm)</label><input type="number"         id="tj-hr"     class="tj-in" placeholder="72"></div>
                            <div><label class="tj-lbl">Temperatura (°C)</label><input type="number" id="tj-temp"   class="tj-in" placeholder="36.5" step="0.1"></div>
                            <div><label class="tj-lbl">SpO₂ (%)</label><input type="number"         id="tj-spo2"   class="tj-in" placeholder="98"></div>
                            <div><label class="tj-lbl">F. Respiratoria</label><input type="number"  id="tj-rr"     class="tj-in" placeholder="16"></div>
                            <div><label class="tj-lbl">Dolor (0-10)</label><input type="number"     id="tj-pain"   class="tj-in" placeholder="0" min="0" max="10"></div>
                        </div>
                    </div>

                    <!-- Síntomas y prioridad -->
                    <div style="background:#fff;border-radius:12px;border:1px solid var(--neutralLight);
                                border-left:4px solid #ea580c;padding:12px 14px;margin-bottom:10px;">
                        <div style="font-size:0.72rem;font-weight:800;color:#c2410c;text-transform:uppercase;
                                    display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                            <i class="fa-solid fa-clipboard-list"></i> Evaluación
                        </div>
                        <div style="margin-bottom:8px;">
                            <label class="tj-lbl">Síntomas Principales *</label>
                            <textarea id="tj-symptoms" class="tj-in" rows="2"
                                      placeholder="Describa los síntomas principales..."></textarea>
                        </div>
                        <div style="margin-bottom:8px;">
                            <label class="tj-lbl">Observaciones</label>
                            <textarea id="tj-observations" class="tj-in" rows="2"
                                      placeholder="Notas adicionales..."></textarea>
                        </div>

                        <!-- Prioridad sugerida -->
                        <div id="tj-suggestion-box" style="display:none;padding:8px 10px;border-radius:8px;
                             margin-bottom:8px;font-size:0.78rem;font-weight:600;"></div>

                        <div>
                            <label class="tj-lbl">Prioridad Final *</label>
                            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
                                ${Object.entries(LEVELS).map(([k, lv]) => `
                                <button type="button" class="tj-priority-btn" data-priority="${k}"
                                    style="border:2px solid ${lv.border};background:${lv.bg};color:${lv.color};
                                           border-radius:8px;padding:6px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;">
                                    ${lv.name.split('—')[0].trim()}
                                </button>`).join('')}
                            </div>
                            <input type="hidden" id="tj-priority-selected" value="">
                        </div>
                    </div>
                </div> <!-- /#tj-sec-common -->
            </div> <!-- /#tj-form-scroll-body -->


            </div>

            <!-- Footer -->
            <div style="padding:15px 16px;background:#fff;border-top:1px solid var(--neutralLight);display:flex;justify-content:center;gap:30px;flex-shrink:0;">
                <button id="tj-form-cancel" class="btn-cancel" title="Cancelar y Salir"
                    style="background:#f1f5f9;color:var(--neutralSecondary);border:2px solid var(--neutralLight);
                           border-radius:50%;width:60px;height:60px;font-size:1.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <button id="tj-btn-form-clear" title="Limpiar todos los campos"
                    style="background:#fff7ed;color:#ea580c;border:2px solid #fdba74;
                           border-radius:50%;width:60px;height:60px;font-size:1.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">
                    <i class="fa-solid fa-eraser"></i>
                </button>
                <button id="tj-form-save" title="Guardar Registro de Triaje"
                    style="background:var(--themePrimary);color:#fff;border:none;
                           border-radius:50%;width:60px;height:60px;font-size:1.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,59,105,0.3);transition:all 0.2s;">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>
        </div>`;

        // Inyectar estilos del form
        injectStyles();
        document.body.appendChild(overlay);

        const closeForm = () => {
            const s = document.getElementById('tj-form-sheet');
            if (s) s.style.animation = 'slideDown .25s ease forwards';
            setTimeout(() => overlay.remove(), 240);
        };

        overlay.querySelector('#tj-form-close')?.addEventListener('click', closeForm);
        overlay.querySelector('#tj-form-cancel')?.addEventListener('click', closeForm);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeForm(); });

        // Cambio de pestañas
        const tabExisting = overlay.querySelector('#tj-tab-existing');
        const tabNew = overlay.querySelector('#tj-tab-new');
        const secExisting = overlay.querySelector('#tj-sec-existing');
        const secNew = overlay.querySelector('#tj-sec-new');

        tabExisting.addEventListener('click', () => {
            isNewPatient = false;
            tabExisting.style.background = '#fff'; tabExisting.style.color = 'var(--themePrimary)'; tabExisting.style.boxShadow = '0 2px 4px rgba(0,0,0,.05)';
            tabNew.style.background = 'transparent'; tabNew.style.color = 'var(--neutralSecondary)'; tabNew.style.boxShadow = 'none';
            secExisting.style.display = 'block'; secNew.style.display = 'none';
        });

        overlay.querySelector('#tj-btn-form-clear')?.addEventListener('click', async () => {
            if (await hospitalConfirm('¿Desea limpiar todos los campos del formulario de triaje?')) {
                // Limpiar inputs
                overlay.querySelectorAll('input, textarea, select').forEach(i => {
                    if (i.id === 'tj-new-doc-type' || i.id === 'tj-doc-type' || i.id === 'tj-new-gender') return;
                    i.value = '';
                });
                overlay.querySelector('#tj-patient-feedback').innerHTML = '';
                overlay.querySelector('#tj-patient-name-box').style.display = 'none';
                overlay.querySelector('#tj-patient-id').value = '';
                overlay.querySelector('#tj-new-allergies-container').innerHTML = '';
                addQuickAllergyField(overlay);
                overlay.querySelector('#tj-suggestion-box').style.display = 'none';
                // Reset prioridad
                overlay.querySelector('#tj-priority-selected').value = '';
                overlay.querySelectorAll('.tj-priority-btn').forEach(btn => {
                    const bl = LEVELS[btn.dataset.priority];
                    btn.style.background = bl.bg;
                    btn.style.color = bl.color;
                    btn.style.border = `2px solid ${bl.border}`;
                    btn.style.transform = '';
                });
                showToast('Formulario limpiado', 'var(--neutralSecondary)');
            }
        });

        tabNew.addEventListener('click', () => {
            isNewPatient = true;
            tabNew.style.background = '#fff'; tabNew.style.color = 'var(--green)'; tabNew.style.boxShadow = '0 2px 4px rgba(0,0,0,.05)';
            tabExisting.style.background = 'transparent'; tabExisting.style.color = 'var(--neutralSecondary)'; tabNew.style.boxShadow = 'none';
            secNew.style.display = 'block'; secExisting.style.display = 'none';
            // Iniciar con una fila de alergia si está vacío
            if (overlay.querySelector('#tj-new-allergies-container').children.length === 0) {
                addQuickAllergyField(overlay);
            }
        });

        overlay.querySelector('#tj-btn-add-allergy')?.addEventListener('click', () => addQuickAllergyField(overlay));

        // Búsqueda por cédula (Existing)
        overlay.querySelector('#tj-cedula')?.addEventListener('blur', () => {
            const docType = overlay.querySelector('#tj-doc-type')?.value || 'V';
            const dni = overlay.querySelector('#tj-cedula')?.value.trim();
            const fb = overlay.querySelector('#tj-patient-feedback');
            const nm = overlay.querySelector('#tj-patient-name-box');
            const hid = overlay.querySelector('#tj-patient-id');
            if (!dni) return;
            const p = patients.find(x => x.dni == dni && x.docType === docType);
            if (p) {
                hid.value = p.id;
                overlay.querySelector('#tj-patient-name-display').textContent = p.name;
                nm.style.display = 'block';
                fb.innerHTML = '';
            } else {
                hid.value = '';
                nm.style.display = 'none';
                fb.innerHTML = `<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Paciente no encontrado</span>`;
            }
        });

        // Sugerencia de prioridad al escribir síntomas
        overlay.querySelector('#tj-symptoms')?.addEventListener('input', () => {
            const symptoms = overlay.querySelector('#tj-symptoms')?.value || '';
            const vitals = {
                bloodPressure: overlay.querySelector('#tj-bp')?.value,
                heartRate: overlay.querySelector('#tj-hr')?.value,
                temperature: overlay.querySelector('#tj-temp')?.value,
                spo2: overlay.querySelector('#tj-spo2')?.value,
                respiratoryRate: overlay.querySelector('#tj-rr')?.value,
                painLevel: overlay.querySelector('#tj-pain')?.value
            };
            if (!symptoms.trim()) return;
            const suggestion = suggestPriority(symptoms, vitals);
            const lv = LEVELS[suggestion];
            const box = overlay.querySelector('#tj-suggestion-box');
            box.style.display = 'block';
            box.style.background = lv.bg;
            box.style.border = `1px solid ${lv.border}`;
            box.style.color = lv.color;
            box.innerHTML = `<i class="fa-solid ${lv.icon}"></i> Prioridad sugerida: <strong>${lv.name}</strong>
                <button type="button" style="margin-left:8px;font-size:0.7rem;background:${lv.color};color:#fff;
                border:none;border-radius:6px;padding:2px 8px;cursor:pointer;" id="tj-apply-suggestion"
                data-suggestion="${suggestion}">Aplicar</button>`;
            overlay.querySelector('#tj-apply-suggestion')?.addEventListener('click', e => {
                const sugg = e.target.dataset.suggestion;
                selectPriority(overlay, sugg);
                // Efecto visual
                const box = overlay.querySelector('#tj-suggestion-box');
                box.style.transform = 'scale(0.95)';
                setTimeout(() => box.style.transform = 'scale(1)', 100);
            });
        });

        // Botones de prioridad
        overlay.querySelectorAll('.tj-priority-btn').forEach(btn => {
            btn.addEventListener('click', () => selectPriority(overlay, btn.dataset.priority));
        });

        // Guardar
        overlay.querySelector('#tj-form-save')?.addEventListener('click', async () => {
            if (await saveTriajeFull(overlay, isNewPatient)) closeForm();
        });
    }

    function addQuickAllergyField(overlay) {
        const container = overlay.querySelector('#tj-new-allergies-container');
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.gap = '5px'; row.style.marginBottom = '5px';
        row.innerHTML = `
            <input type="text" class="tj-in tj-allergy-input" placeholder="Nombre alergia..." style="font-size:0.75rem;">
            <button type="button" class="tj-remove-allergy" style="border:none;background:rgba(220,38,38,.1);color:#dc2626;border-radius:6px;width:30px;flex-shrink:0;">✕</button>
        `;
        row.querySelector('.tj-remove-allergy').onclick = () => row.remove();
        container.appendChild(row);
    }

    async function saveTriajeFull(overlay, isNewPatient) {
        let patientId = null;

        if (isNewPatient) {
            // Validar campos nuevo paciente
            const name = overlay.querySelector('#tj-new-name').value.trim();
            const dni = overlay.querySelector('#tj-new-dni').value.trim();
            const birth = overlay.querySelector('#tj-new-birth').value;
            const gender = overlay.querySelector('#tj-new-gender').value;
            const phone = overlay.querySelector('#tj-new-phone').value.trim();
            const docType = overlay.querySelector('#tj-new-doc-type').value;

            if (!name || !dni || !birth || !phone) {
                showToast('<i class="fa-solid fa-triangle-exclamation"></i> Complete los campos obligatorios del paciente (*)', '#dc2626');
                return false;
            }

            // Alergias
            const allergies = [];
            overlay.querySelectorAll('.tj-allergy-input').forEach(i => { if (i.value.trim()) allergies.push(i.value.trim()); });

            // Crear el paciente en el store
            const newP = await store.add('patients', {
                name, docType, dni, birthDate: birth, gender, phone,
                antecedents: overlay.querySelector('#tj-new-antecedents')?.value.trim() || '',
                emergencyContact: {
                    name: overlay.querySelector('#tj-new-ec-name')?.value.trim() || '',
                    phone: overlay.querySelector('#tj-new-ec-phone')?.value.trim() || ''
                },
                allergies, createdAt: Date.now(), createdBy: user?.id
            });
            patientId = newP.id;
        } else {
            patientId = overlay.querySelector('#tj-patient-id')?.value;
        }

        if (!patientId) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Identifique al paciente', '#dc2626'); return false; }

        // Verificar si ya está en cola (status waiting/in_progress) - Lógica unificada para evitar duplicados
        const allTriaje = store.get('triaje') || [];
        const existing = allTriaje.find(r =>
            r.patientId === patientId && ['waiting', 'in_progress'].includes(r.status)
        );
        if (existing) {
            showToast('<i class="fa-solid fa-triangle-exclamation"></i> El paciente ya se encuentra en la cola de triaje', '#d97706');
            return false;
        }

        const symptoms = overlay.querySelector('#tj-symptoms')?.value.trim();
        const priority = overlay.querySelector('#tj-priority-selected')?.value;

        if (!symptoms) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Ingrese los síntomas', '#dc2626'); return false; }
        if (!priority) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Seleccione una prioridad', '#dc2626'); return false; }

        store.add('triaje', {
            patientId, priority, symptoms,
            observations: overlay.querySelector('#tj-observations')?.value.trim() || '',
            vitalSigns: {
                bloodPressure: overlay.querySelector('#tj-bp')?.value || null,
                heartRate: overlay.querySelector('#tj-hr')?.value || null,
                temperature: overlay.querySelector('#tj-temp')?.value || null,
                spo2: overlay.querySelector('#tj-spo2')?.value || null,
                respiratoryRate: overlay.querySelector('#tj-rr')?.value || null,
                painLevel: overlay.querySelector('#tj-pain')?.value || null
            },
            status: 'waiting',
            createdAt: Date.now(),
            createdBy: user?.id || '',
            creatorName: user?.name || ''
        });

        showToast('<i class="fa-solid fa-check"></i> Triaje registrado', LEVELS[priority].color);
        render();
        return true;
    }

    function selectPriority(overlay, priority) {
        overlay.querySelector('#tj-priority-selected').value = priority;
        const lv = LEVELS[priority];
        overlay.querySelectorAll('.tj-priority-btn').forEach(btn => {
            const bl = LEVELS[btn.dataset.priority];
            const active = btn.dataset.priority === priority;
            btn.style.background = active ? lv.color : bl.bg;
            btn.style.color = active ? '#fff' : bl.color;
            btn.style.border = `2px solid ${active ? lv.color : bl.border}`;
            btn.style.transform = active ? 'scale(1.05)' : '';
        });
    }

    // ── SHEET: VER DETALLE ────────────────────────────────────────────────────
    function openDetailSheet(rec) {
        const p = (store.get('patients') || []).find(x => x.id === rec.patientId);
        const lv = LEVELS[rec.priority] || LEVELS.blue;
        const wms = Date.now() - (rec.createdAt || Date.now());
        const waitColor = wms > 3600000 ? '#dc2626' : wms > 1800000 ? '#ea580c' : '#d97706';

        document.getElementById('tj-detail-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'tj-detail-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,32,80,.5);backdrop-filter:blur(3px);display:flex;flex-direction:column;justify-content:flex-end;animation:fadeIn .2s ease;';

        const v = rec.vitalSigns || {};
        const statusMap = { waiting: 'En Espera', in_progress: 'En Atención', completed: 'Completado', cancelled: 'Cancelado' };

        overlay.innerHTML = `
        <div id="tj-detail-sheet"
             style="background:#f8f9fa;border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;
                    box-shadow:0 -8px 40px rgba(0,0,0,.2);animation:slideUp .3s cubic-bezier(.4,0,.2,1);">

            <!-- Cabecera con nivel de prioridad -->
            <div style="background:${lv.color};padding:16px 18px;border-radius:20px 20px 0 0;flex-shrink:0;">
                <div style="width:40px;height:4px;background:rgba(255,255,255,.3);border-radius:4px;margin:0 auto 12px;"></div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div style="flex:1;min-width:0;">
                        <div style="color:rgba(255,255,255,.7);font-size:0.65rem;font-weight:700;text-transform:uppercase;">${lv.name} · ${lv.time}</div>
                        <div style="color:#fff;font-size:1rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p?.name || 'Desconocido'}</div>
                        <div style="color:rgba(255,255,255,.75);font-size:0.72rem;margin-top:2px;">
                            ${p ? `CI: ${p.docType || 'V'}-${p.dni} · ${calcAge(p.birthDate)} años` + (p.bloodType ? ` · ${p.bloodType}` : '') : ''}
                        </div>
                    </div>
                    <button id="tj-detail-close"
                        style="background:rgba(255,255,255,.15);border:none;border-radius:50%;width:32px;height:32px;
                               cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;margin-left:10px;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <!-- Mini stats -->
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <div style="flex:1;background:rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;text-align:center;">
                        <div style="color:#fff;font-size:0.85rem;font-weight:800;">${waitStr(wms)}</div>
                        <div style="color:rgba(255,255,255,.65);font-size:0.6rem;">Tiempo espera</div>
                    </div>
                    <div style="flex:1;background:rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;text-align:center;">
                        <div style="color:#fff;font-size:0.85rem;font-weight:800;">${statusMap[rec.status] || rec.status}</div>
                        <div style="color:rgba(255,255,255,.65);font-size:0.6rem;">Estado</div>
                    </div>
                    <div style="flex:1;background:rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;text-align:center;">
                        <div style="color:#fff;font-size:0.85rem;font-weight:800;">${new Date(rec.createdAt || Date.now()).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
                        <div style="color:rgba(255,255,255,.65);font-size:0.6rem;">Ingreso</div>
                    </div>
                </div>
            </div>

            <div style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;">

                <!-- Alergias -->
                ${(p?.allergies || []).length ? `
                <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:8px 12px;
                            font-size:0.78rem;color:#dc2626;font-weight:600;">
                    <i class="fa-solid fa-triangle-exclamation"></i> Alergias: ${p.allergies.join(', ')}
                </div>` : ''}

                <!-- Cambiar prioridad -->
                ${rec.status !== 'completed' && rec.status !== 'cancelled' ? `
                <div style="background:#fff;border-radius:10px;border:1px solid var(--neutralLight);padding:12px 14px;">
                    <div style="font-size:0.65rem;font-weight:800;color:var(--neutralSecondary);text-transform:uppercase;margin-bottom:8px;">Cambiar Prioridad</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${Object.entries(LEVELS).map(([k, lev]) => `
                        <button class="tj-change-priority" data-rec-id="${rec.id}" data-priority="${k}"
                            style="border:2px solid ${lev.border};background:${rec.priority === k ? lev.color : lev.bg};
                                   color:${rec.priority === k ? '#fff' : lev.color};
                                   border-radius:8px;padding:5px 8px;font-size:0.68rem;font-weight:700;cursor:pointer;">
                            ${lev.name.split('—')[0].trim()}
                        </button>`).join('')}
                    </div>
                </div>` : ''}

                <!-- Signos vitales -->
                ${Object.values(v).some(Boolean) ? `
                <div style="background:#fff;border-radius:10px;border:1px solid var(--neutralLight);
                            border-left:4px solid #3b82f6;padding:12px 14px;">
                    <div style="font-size:0.65rem;font-weight:800;color:#2563eb;text-transform:uppercase;margin-bottom:8px;">Signos Vitales</div>
                    <div style="display:flex;gap:14px;flex-wrap:wrap;">
                        ${v.bloodPressure ? `<div><div style="font-size:0.6rem;color:var(--neutralSecondary);">PA</div><div style="font-weight:700;">${v.bloodPressure}</div></div>` : ''}
                        ${v.heartRate ? `<div><div style="font-size:0.6rem;color:var(--neutralSecondary);">FC</div><div style="font-weight:700;">${v.heartRate} lpm</div></div>` : ''}
                        ${v.temperature ? `<div><div style="font-size:0.6rem;color:var(--neutralSecondary);">T°</div><div style="font-weight:700;">${v.temperature} °C</div></div>` : ''}
                        ${v.spo2 ? `<div><div style="font-size:0.6rem;color:var(--neutralSecondary);">SpO₂</div><div style="font-weight:700;">${v.spo2} %</div></div>` : ''}
                        ${v.respiratoryRate ? `<div><div style="font-size:0.6rem;color:var(--neutralSecondary);">FR</div><div style="font-weight:700;">${v.respiratoryRate}/min</div></div>` : ''}
                        ${v.painLevel ? `<div style="${+v.painLevel >= 8 ? 'color:#dc2626' : ''}"><div style="font-size:0.6rem;color:var(--neutralSecondary);">Dolor</div><div style="font-weight:700;">${v.painLevel}/10</div></div>` : ''}
                    </div>
                </div>` : ''}

                <!-- Síntomas -->
                <div style="background:#fff;border-radius:10px;border:1px solid var(--neutralLight);
                            border-left:4px solid #ea580c;padding:12px 14px;">
                    <div style="font-size:0.65rem;font-weight:800;color:#c2410c;text-transform:uppercase;margin-bottom:6px;">Síntomas</div>
                    <div style="font-size:0.85rem;line-height:1.5;">${rec.symptoms || '—'}</div>
                    ${rec.observations ? `
                    <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--neutralLight);">
                        <div style="font-size:0.6rem;font-weight:700;color:var(--neutralSecondary);text-transform:uppercase;margin-bottom:3px;">Observaciones</div>
                        <div style="font-size:0.82rem;">${rec.observations}</div>
                    </div>` : ''}
                </div>

                <!-- Registro médico -->
                <div style="background:#fff;border-radius:10px;border:1px solid var(--neutralLight);padding:12px 14px;
                            font-size:0.72rem;color:var(--neutralSecondary);">
                    <div><i class="fa-solid fa-user-doctor" style="color:var(--themePrimary);margin-right:5px;"></i>
                        Registrado por: <strong>${rec.creatorName || '—'}</strong></div>
                    <div style="margin-top:4px;">
                        <i class="fa-regular fa-clock" style="color:var(--themePrimary);margin-right:5px;"></i>
                        Hora ingreso: <strong>${new Date(rec.createdAt || Date.now()).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong>
                        ${rec.startedAt ? `· Atendido: <strong>${new Date(rec.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong>` : ''}
                        ${rec.completedAt ? `· Completado: <strong>${new Date(rec.completedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong>` : ''}
                    </div>
                </div>

            </div>

            <!-- Footer de acciones -->
            <div style="padding:12px 16px;background:#fff;border-top:1px solid var(--neutralLight);display:flex;gap:8px;flex-shrink:0;">
                ${rec.status === 'waiting' ? `
                <button id="tj-detail-attend" data-id="${rec.id}"
                    style="flex:1;background:var(--teal);color:#fff;border:none;border-radius:10px;
                           padding:12px;font-size:0.85rem;font-weight:700;cursor:pointer;">
                    <i class="fa-solid fa-stethoscope"></i> Atender
                </button>` : ''}
                ${rec.status === 'in_progress' ? `
                <button id="tj-detail-complete" data-id="${rec.id}"
                    style="flex:1;background:var(--green);color:#fff;border:none;border-radius:10px;
                           padding:12px;font-size:0.85rem;font-weight:700;cursor:pointer;">
                    <i class="fa-solid fa-circle-check"></i> Completar
                </button>
                <button id="tj-detail-transfer" data-id="${rec.id}" data-patient-id="${rec.patientId}"
                    style="flex:1;background:var(--themePrimary);color:#fff;border:none;border-radius:10px;
                           padding:12px;font-size:0.85rem;font-weight:700;cursor:pointer;">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i> Transferir a Consulta
                </button>` : ''}
                <button id="tj-detail-print" data-id="${rec.id}"
                    style="background:var(--neutralLight);color:var(--neutralPrimary);border:none;border-radius:10px;
                           padding:12px 18px;font-size:0.85rem;font-weight:700;cursor:pointer;">
                    <i class="fa-solid fa-print"></i>
                </button>
                ${rec.status === 'completed' || rec.status === 'cancelled' ? `
                <div style="text-align:center;width:100%;font-size:0.8rem;color:var(--neutralSecondary);padding:8px;">
                    <i class="fa-solid fa-circle-check" style="color:var(--green);"></i>
                    Atención ${statusMap[rec.status]?.toLowerCase()}
                </div>` : ''}
            </div>
        </div>`;

        document.body.appendChild(overlay);
        const closeDetail = () => {
            const s = document.getElementById('tj-detail-sheet');
            if (s) s.style.animation = 'slideDown .25s ease forwards';
            setTimeout(() => overlay.remove(), 240);
        };
        overlay.querySelector('#tj-detail-close')?.addEventListener('click', closeDetail);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeDetail(); });

        // Cambiar prioridad
        overlay.querySelectorAll('.tj-change-priority').forEach(btn => {
            btn.addEventListener('click', () => {
                const newPriority = btn.dataset.priority;
                if (newPriority === rec.priority) return;
                store.update('triaje', btn.dataset.recId, { priority: newPriority });
                showToast(`<i class="fa-solid fa-rotate"></i> Prioridad cambiada a ${LEVELS[newPriority].name}`, LEVELS[newPriority].color);
                closeDetail();
                render();
            });
        });

        overlay.querySelector('#tj-detail-attend')?.addEventListener('click', e => {
            store.update('triaje', e.target.closest('button').dataset.id, { status: 'in_progress', startedAt: Date.now() });
            showToast('<i class="fa-solid fa-play"></i> Paciente en atención', 'var(--teal)');
            closeDetail();
            render();
        });

        // Completar desde detalle
        overlay.querySelector('#tj-detail-complete')?.addEventListener('click', e => {
            store.update('triaje', e.target.closest('button').dataset.id, { status: 'completed', completedAt: Date.now() });
            showToast('<i class="fa-solid fa-check"></i> Atención completada', 'var(--green)');
            closeDetail();
            render();
        });

        overlay.querySelector('#tj-detail-transfer')?.addEventListener('click', e => {
            const btn = e.target.closest('button');
            store.update('triaje', btn.dataset.id, { status: 'completed', completedAt: Date.now(), transferredToConsultation: true });
            showToast('<i class="fa-solid fa-share"></i> Transferido a consulta médica', 'var(--themePrimary)');
            closeDetail();
            render();
            // Navegar a consulta si app está disponible
            if (window.app?.navigate) window.app.navigate('consultation');
        });

        // Imprimir desde detalle
        overlay.querySelector('#tj-detail-print')?.addEventListener('click', () => {
            exportIndividualPDF(rec);
        });
    }

    // ── FORMULARIO DE EMERGENCIA (con tipo, ubicación, descripción) ────────────
    function openEmergencyForm() {
        document.getElementById('tj-emg-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'tj-emg-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);display:flex;flex-direction:column;justify-content:flex-end;animation:fadeIn .2s ease;';

        overlay.innerHTML = `
        <div id="tj-emg-sheet"
             style="background:#fff;border-radius:20px 20px 0 0;max-height:88vh;display:flex;flex-direction:column;
                    box-shadow:0 -8px 40px rgba(220,38,38,.4);animation:slideUp .3s ease;">
            <div style="background:#dc2626;padding:16px 18px;border-radius:20px 20px 0 0;flex-shrink:0;">
                <div style="width:40px;height:4px;background:rgba(255,255,255,.3);border-radius:4px;margin:0 auto 12px;"></div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="color:rgba(255,255,255,.8);font-size:0.65rem;font-weight:700;text-transform:uppercase;">
                            HUMNT · Triaje — Emergencia Crítica
                        </div>
                        <div style="color:#fff;font-size:1rem;font-weight:800;margin-top:2px;">
                            <i class="fa-solid fa-bell"></i> ALERTA DE EMERGENCIA
                        </div>
                    </div>
                    <button id="tj-emg-close"
                        style="background:rgba(255,255,255,.2);border:none;border-radius:50%;width:32px;height:32px;
                               cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>

            <div style="flex:1;overflow-y:auto;padding:16px;">
                <!-- Aviso -->
                <div style="background:#fef2f2;border:1px solid #fca5a5;border-left:4px solid #dc2626;border-radius:8px;
                            padding:10px 12px;margin-bottom:14px;font-size:0.8rem;color:#dc2626;font-weight:600;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <strong>ATENCIÓN:</strong> Esta acción notificará a todo el personal de guardia inmediatamente.
                </div>

                <!-- Tipo de emergencia -->
                <div style="margin-bottom:12px;">
                    <label class="tj-lbl" style="color:#dc2626;">Tipo de Emergencia *</label>
                    <select id="tj-emg-type" class="tj-in" style="border-color:#fca5a5;">
                        <option value="code_blue">Código Azul — Paro cardiorrespiratorio</option>
                        <option value="code_red">Código Rojo — Incendio</option>
                        <option value="code_black">Código Negro — Amenaza violenta</option>
                        <option value="mass_casualty">Múltiples víctimas / Triaje masivo</option>
                        <option value="evacuation">Evacuación inmediata</option>
                        <option value="other">Otra emergencia crítica</option>
                    </select>
                </div>

                <!-- Ubicación -->
                <div style="margin-bottom:12px;">
                    <label class="tj-lbl" style="color:#dc2626;">Ubicación Exacta *</label>
                    <input id="tj-emg-location" type="text" class="tj-in" style="border-color:#fca5a5;"
                           placeholder="Ej: Pasillo B, Urgencias, Sala de Espera...">
                </div>

                <!-- Descripción -->
                <div style="margin-bottom:12px;">
                    <label class="tj-lbl" style="color:#dc2626;">Descripción de la Situación</label>
                    <textarea id="tj-emg-desc" class="tj-in" rows="3" style="border-color:#fca5a5;"
                              placeholder="Indique detalles relevantes..."></textarea>
                </div>
            </div>

            <div style="padding:15px 16px;background:#fff;border-top:1px solid #fca5a5;display:flex;justify-content:center;gap:30px;flex-shrink:0;">
                <button id="tj-emg-cancel" title="Cancelar"
                    style="background:#f1f5f9;color:var(--neutralSecondary);border:2px solid var(--neutralLight);
                           border-radius:50%;width:60px;height:60px;font-size:1.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <button id="tj-emg-confirm" title="¡ACTIVAR ALERTA AHORA!"
                    style="background:#dc2626;color:#fff;border:none;
                           border-radius:50%;width:60px;height:60px;font-size:1.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(220,38,38,0.4);animation:emergency-flash 1s infinite;">
                    <i class="fa-solid fa-bullhorn"></i>
                </button>
            </div>
        </div>`;

        injectStyles();
        document.body.appendChild(overlay);

        const closeEmg = () => {
            const s = document.getElementById('tj-emg-sheet');
            if (s) s.style.animation = 'slideDown .25s ease forwards';
            setTimeout(() => overlay.remove(), 240);
        };
        overlay.querySelector('#tj-emg-close')?.addEventListener('click', closeEmg);
        overlay.querySelector('#tj-emg-cancel')?.addEventListener('click', closeEmg);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeEmg(); });

        overlay.querySelector('#tj-emg-confirm')?.addEventListener('click', async () => {
            const type = overlay.querySelector('#tj-emg-type')?.value;
            const location = overlay.querySelector('#tj-emg-location')?.value.trim();
            const desc = overlay.querySelector('#tj-emg-desc')?.value.trim();
            if (!location) { showToast('<i class="fa-solid fa-triangle-exclamation"></i> Indique la ubicación', '#dc2626'); return; }

            const labelForConfirm = {
                code_blue: 'Código Azul', code_red: 'Código Rojo', code_black: 'Código Negro',
                mass_casualty: 'Múltiples víctimas', evacuation: 'Evacuación', other: 'Emergencia'
            }[type] || type;

            if (!await hospitalConfirm(`¿Está seguro de activar una alerta de ${labelForConfirm} en ${location}?`, 'danger')) return;

            // Registrar la emergencia en el store
            const typeLabels = {
                code_blue: 'Código Azul — Paro cardiorrespiratorio',
                code_red: 'Código Rojo — Incendio',
                code_black: 'Código Negro — Amenaza violenta',
                mass_casualty: 'Múltiples víctimas / Triaje masivo',
                evacuation: 'Evacuación inmediata',
                other: 'Otra emergencia crítica'
            };
            store.add?.('notifications', {
                type: 'emergency',
                title: `<i class="fa-solid fa-bell" style="color:#dc2626"></i> ALERTA DE EMERGENCIA — ` + (typeLabels[type] || type),
                body: `Ubicación: ${location}` + (desc ? `\n${desc}` : ''),
                from: user?.id || '',
                fromName: user?.name || 'Sistema',
                date: Date.now(),
                read: false,
                priority: 'critical'
            });

            // Mostrar banner parpadeante
            document.getElementById('tj-emergency-banner')?.remove();
            if (!document.getElementById('tj-emergency-style')) {
                const st = document.createElement('style');
                st.id = 'tj-emergency-style';
                st.textContent = `@keyframes emergency-flash { 0%,100%{opacity:1}50%{opacity:.8} }`;
                document.head.appendChild(st);
            }
            const banner = document.createElement('div');
            banner.id = 'tj-emergency-banner';
            banner.style.cssText = `position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;
                padding:14px 20px;z-index:99999;text-align:center;font-weight:700;font-size:0.9rem;
                box-shadow:0 4px 20px rgba(220,38,38,.5);display:flex;align-items:center;
                justify-content:center;gap:10px;animation:emergency-flash 1s infinite;`;
            banner.innerHTML = `
                <i class="fa-solid fa-bell" style="font-size:1.1rem;"></i>
                <i class="fa-solid fa-triangle-exclamation"></i> ${typeLabels[type] || type} — ${location}
                <button onclick="this.parentElement.remove()"
                    style="margin-left:12px;background:rgba(255,255,255,.2);border:none;border-radius:8px;
                           color:#fff;padding:4px 12px;cursor:pointer;font-size:0.78rem;">Desactivar</button>`;
            document.body.prepend(banner);

            showToast('<i class="fa-solid fa-circle"></i> Alerta de emergencia activada', '#dc2626');
            closeEmg();
        });
    }

    // ── EXPORTAR PDF INDIVIDUAL ───────────────────────────────────────────────
    async function exportIndividualPDF(rec) {
        showToast('Generando informe oficial...', 'var(--themePrimary)');
        const p = (store.get('patients') || []).find(x => x.id === rec.patientId);
        const lv = LEVELS[rec.priority] || LEVELS.blue;

        try {
            if (typeof window.jspdf === 'undefined') {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                await new Promise((res, rej) => { s.onload = res; s.onerror = rej; document.head.appendChild(s); });
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const pW = doc.internal.pageSize.getWidth();
            const m = 20;
            let y = 15;

            // --- ENCABEZADO (Estilo Tradicional Web) ---
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text('HOSPITAL UNIVERSITARIO MANUEL NUÑEZ TOVAR', pW / 2, y, { align: 'center' });
            doc.setFontSize(10);
            doc.text('DEPARTAMENTO DE EMERGENCIAS Y SERVICIO DE TRIAJE', pW / 2, y + 6, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text('Maturín, Estado Monagas - Venezuela', pW / 2, y + 11, { align: 'center' });

            doc.setLineWidth(0.5);
            doc.line(m, y + 15, pW - m, y + 15);
            doc.setLineWidth(0.2);
            doc.line(m, y + 16.5, pW - m, y + 16.5);

            y += 28;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('INFORME INDIVIDUAL DE CLASIFICACIÓN CLÍNICA', pW / 2, y, { align: 'center' });

            // --- DATOS DEL REGISTRO ---
            y += 10;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(`NRO. REGISTRO: #${(rec.id || '').substring(0, 8).toUpperCase()}`, m, y);
            doc.text(`FECHA/HORA: ${new Date(rec.createdAt).toLocaleString()}`, pW - m, y, { align: 'right' });

            // --- SECCIÓN I: INFORMACIÓN DEL PACIENTE ---
            y += 8;
            doc.setFillColor(240, 240, 240);
            doc.rect(m, y, pW - 2 * m, 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.text('I. INFORMACIÓN DEL PACIENTE', m + 5, y + 5);

            y += 12;
            doc.setFont('helvetica', 'normal');
            doc.text('Nombre Completo:', m, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${p?.name || 'N/A'}`, m + 35, y);

            doc.setFont('helvetica', 'normal');
            doc.text('Edad:', pW / 2 + 10, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${calcAge(p?.birthDate)} años`, pW / 2 + 35, y);

            y += 7;
            doc.setFont('helvetica', 'normal');
            doc.text('Cédula / ID:', m, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${p?.docType || 'V'}-${p?.dni || 'N/A'}`, m + 35, y);

            doc.setFont('helvetica', 'normal');
            doc.text('Género:', pW / 2 + 10, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${p?.gender === 'M' ? 'Masculino' : 'Femenino'}`, pW / 2 + 35, y);

            // --- SECCIÓN II: NIVEL DE PRIORIDAD ---
            y += 12;
            doc.setFillColor(240, 240, 240);
            doc.rect(m, y, pW - 2 * m, 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.text('II. NIVEL DE PRIORIDAD ASIGNADO', m + 5, y + 5);

            y += 10;
            doc.setDrawColor(lv.color);
            doc.setLineWidth(0.5);
            doc.rect(m, y, pW - 2 * m, 12);
            doc.setFontSize(12);
            doc.setTextColor(lv.color);
            doc.text(`${lv.name.toUpperCase()}`, pW / 2, y + 8, { align: 'center' });
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(`Tiempo de respuesta esperado: ${lv.time}`, pW / 2, y + 17, { align: 'center' });

            // --- SECCIÓN III: VALORACIÓN DE SIGNOS VITALES ---
            y += 25;
            doc.setTextColor(0);
            doc.setFillColor(240, 240, 240);
            doc.rect(m, y, pW - 2 * m, 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.text('III. VALORACIÓN DE SIGNOS VITALES', m + 5, y + 5);

            y += 10;
            const vs = rec.vitalSigns || {};
            const vsRows = [
                ['PARÁMETRO', 'VALOR REGISTRADO', 'RANGO NORMAL'],
                ['Presión Arterial', vs.bloodPressure || '—', '120/80 mmHg'],
                ['Frecuencia Cardíaca', vs.heartRate ? `${vs.heartRate} LPM` : '—', '60-100 LPM'],
                ['Temperatura Corp.', vs.temperature ? `${vs.temperature} °C` : '—', '36.5 - 37.5 °C'],
                ['Saturación O2', vs.spo2 ? `${vs.spo2} %` : '—', '95 - 100 %'],
                ['Frec. Respiratoria', vs.respiratoryRate ? `${vs.respiratoryRate} RPM` : '—', '12 - 20 RPM'],
                ['Escala de Dolor', vs.painLevel !== undefined ? `${vs.painLevel} / 10` : '—', '0 / 10']
            ];

            const cellH = 7;
            const colW = (pW - 2 * m) / 3;
            // Header tabla
            doc.setFillColor(0, 0, 0);
            doc.rect(m, y, pW - 2 * m, cellH, 'F');
            doc.setTextColor(255);
            doc.setFontSize(8);
            vsRows[0].forEach((txt, i) => doc.text(txt, m + (i * colW) + 2, y + 5));

            y += cellH;
            doc.setTextColor(0);
            doc.setFont('helvetica', 'normal');
            vsRows.slice(1).forEach((row, ri) => {
                if (ri % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(m, y, pW - 2 * m, cellH, 'F'); }
                row.forEach((txt, ci) => doc.text(txt, m + (ci * colW) + 2, y + 5));
                y += cellH;
            });

            // --- SECCIÓN IV: EVALUACIÓN ---
            y += 10;
            doc.setFillColor(240, 240, 240);
            doc.rect(m, y, pW - 2 * m, 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.text('IV. EVALUACIÓN Y MOTIVO DE CONSULTA', m + 5, y + 5);

            y += 12;
            doc.setFont('helvetica', 'normal');
            const symText = doc.splitTextToSize(`SÍNTOMAS REPORTADOS: ${rec.symptoms || 'No descritos'}`, pW - 2 * m);
            doc.text(symText, m, y);
            y += symText.length * 5 + 5;

            if (rec.observations) {
                const obsText = doc.splitTextToSize(`OBSERVACIONES ADICIONALES: ${rec.observations}`, pW - 2 * m);
                doc.text(obsText, m, y);
            }

            // Pie y Firmas
            const sigY = 260;
            doc.setLineWidth(0.2);
            doc.line(m + 10, sigY, m + 70, sigY);
            doc.line(pW - m - 70, sigY, pW - m - 10, sigY);
            doc.setFontSize(8);
            doc.text('PERSONAL RESPONSABLE DE TRIAJE', m + 40, sigY + 5, { align: 'center' });
            doc.text(rec.creatorName || 'Médico de Guardia', m + 40, sigY + 9, { align: 'center' });
            doc.text('FIRMA DEL PACIENTE / REPRE.', pW - m - 40, sigY + 5, { align: 'center' });

            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text('Este documento es una valoración inicial de urgencias y no sustituye el diagnóstico médico final.', pW / 2, 285, { align: 'center' });
            doc.text('Sistema de Gestión Hospitalaria HUMNT - 2026', pW / 2, 290, { align: 'center' });

            doc.save(`INFORME_TRIAJE_${(p?.name || 'PACIENTE').replace(/\s+/g, '_').toUpperCase()}.pdf`);
            showToast('<i class="fa-solid fa-check"></i> Reporte generado', 'var(--green)');
        } catch (e) {
            console.error(e);
            showToast('<i class="fa-solid fa-circle-xmark"></i> Error al generar reporte', '#dc2626');
        }
    }


    // ── EXPORTAR PDF ──────────────────────────────────────────────────────────
    async function exportPDF() {
        showToast('Generando reporte consolidado...', 'var(--themePrimary)');
        try {
            if (typeof window.jspdf === 'undefined') {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                await new Promise((res, rej) => { s.onload = res; s.onerror = rej; document.head.appendChild(s); });
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const pW = doc.internal.pageSize.getWidth();
            const m = 15;
            let y = 15;

            // --- ENCABEZADO FORMAL ---
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(0, 51, 102);
            doc.text('HOSPITAL UNIVERSITARIO MANUEL NUÑEZ TOVAR', pW / 2, y, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.setFont('helvetica', 'normal');
            doc.text('SERVICIO DE URGENCIAS - SISTEMA DE TRIAJE', pW / 2, y + 6, { align: 'center' });
            doc.text('Reporte Consolidado de Guardia', pW / 2, y + 11, { align: 'center' });

            doc.setDrawColor(0, 51, 102);
            doc.setLineWidth(0.5);
            doc.line(m, y + 15, pW - m, y + 15);

            y += 25;
            // --- RESUMEN ESTADÍSTICO ---
            const allTriajes = store.get('triaje') || [];
            const stats = {
                total: allTriajes.length,
                waiting: allTriajes.filter(r => r.status === 'waiting').length,
                in_progress: allTriajes.filter(r => r.status === 'in_progress').length,
                completed: allTriajes.filter(r => r.status === 'completed').length
            };

            doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
            doc.text('RESUMEN ESTADÍSTICO DE LA GUARDIA', m, y);
            y += 8;

            const statsRows = [
                ['MÉTRICA', 'VALOR', 'ESTADO'],
                ['Pacientes totales', stats.total.toString(), 'Carga Total'],
                ['En espera', stats.waiting.toString(), 'Pendientes'],
                ['En atención', stats.in_progress.toString(), 'Atención Activa'],
                ['Atendidos', stats.completed.toString(), 'Finalizados']
            ];

            const colW = (pW - 2 * m) / 3;
            doc.setFillColor(0, 51, 102);
            doc.rect(m, y - 4, pW - 2 * m, 7, 'F');
            doc.setTextColor(255);
            statsRows[0].forEach((h, i) => doc.text(h, m + i * colW + 2, y + 1));

            y += 7;
            doc.setTextColor(0); doc.setFont('helvetica', 'normal');
            statsRows.slice(1).forEach((row, ri) => {
                if (ri % 2 === 0) { doc.setFillColor(245, 245, 245); doc.rect(m, y - 4, pW - 2 * m, 7, 'F'); }
                row.forEach((txt, ci) => doc.text(txt, m + ci * colW + 2, y + 1));
                y += 7;
            });

            y += 12;
            doc.setFont('helvetica', 'bold');
            doc.text('DISTRIBUCIÓN POR NIVEL DE PRIORIDAD', m, y);
            y += 8;

            doc.setFillColor(80, 80, 80);
            doc.rect(m, y - 4, pW - 2 * m, 7, 'F');
            doc.setTextColor(255);
            const prHeaders = ['NIVEL', 'DESCRIPCIÓN', 'PACIENTES', 'TIEMPO OBJ.'];
            const prWidths = [25, 55, 40, 40];
            let prX = m;
            prHeaders.forEach((h, i) => { doc.text(h, prX + 2, y + 1); prX += prWidths[i]; });

            y += 7;
            doc.setTextColor(0); doc.setFont('helvetica', 'normal');
            Object.entries(LEVELS).forEach(([key, lv], ri) => {
                const count = allTriajes.filter(r => r.priority === key).length;
                if (ri % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(m, y - 4, pW - 2 * m, 7, 'F'); }
                let cx = m;
                [key.toUpperCase(), lv.name.split('—')[0].trim(), count.toString(), lv.time].forEach((txt, i) => {
                    doc.text(txt, cx + 2, y + 1);
                    cx += prWidths[i];
                });
                y += 7;
            });

            y += 15;
            doc.setFont('helvetica', 'bold');
            doc.text('PACIENTES EN COLA DE ESPERA', m, y);
            y += 8;

            const waiting = filtered().filter(r => r.status === 'waiting');
            if (waiting.length) {
                doc.setFillColor(0, 0, 0); doc.rect(m, y - 4, pW - 2 * m, 6, 'F');
                doc.setTextColor(255); doc.setFontSize(7);
                const h = ['PACIENTE', 'EDAD', 'PRIORIDAD', 'SÍNTOMAS PRINCIPALES', 'ESPERA'];
                const tw = [55, 15, 30, 60, 20];
                let px = m;
                h.forEach((txt, i) => { doc.text(txt, px + 2, y); px += tw[i]; });

                y += 6;
                doc.setTextColor(0); doc.setFont('helvetica', 'normal');
                waiting.forEach((r, ri) => {
                    if (y > 270) { doc.addPage(); y = 20; }
                    if (ri % 2 === 0) { doc.setFillColor(245, 245, 245); doc.rect(m, y - 4, pW - 2 * m, 6, 'F'); }
                    let cx = m;
                    const lv = LEVELS[r.priority] || LEVELS.blue;
                    [
                        r.fullName,
                        `${r.age}a`,
                        lv.name.split('—')[0].trim(),
                        (r.symptoms || '').substring(0, 45),
                        waitStr(r.waiting)
                    ].forEach((txt, i) => {
                        doc.text(txt.toString(), cx + 2, y);
                        cx += tw[i];
                    });
                    y += 6;
                });
            } else {
                doc.text('No hay pacientes en espera actualmente.', m, y);
            }

            doc.save(`REPORTE_TRIAJE_CONSOLIDADO_${new Date().toISOString().split('T')[0]}.pdf`);
            showToast('<i class="fa-solid fa-check"></i> Reporte consolidado generado', 'var(--green)');
        } catch (e) {
            console.error(e);
            showToast('<i class="fa-solid fa-circle-xmark"></i> Error al generar PDF', '#dc2626');
        }
    }


    // ── Estilos del formulario ────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('tj-styles')) return;
        const s = document.createElement('style');
        s.id = 'tj-styles';
        s.textContent = `
            .tj-lbl {
                font-size: 0.68rem;
                font-weight: 700;
                color: var(--neutralSecondary);
                text-transform: uppercase;
                display: block;
                margin-bottom: 4px;
                letter-spacing: 0.04em;
            }
            .tj-in {
                width: 100%;
                border: 1.5px solid #e2e8f0;
                border-radius: 12px;
                padding: 12px 14px;
                font-size: 0.88rem;
                font-family: inherit;
                background: #ffffff;
                box-sizing: border-box;
                outline: none;
                transition: all 0.2s ease;
                resize: vertical;
            }
            .tj-in:focus {
                border-color: var(--themePrimary);
                background: #fff;
                box-shadow: 0 0 0 4px rgba(0,59,105,.1);
            }`;
        document.head.appendChild(s);
    }

    // ── Auto-refresh cada 60s ─────────────────────────────────────────────────
    state.interval = setInterval(render, 60000);

    render();

    return {
        refresh: render,
        destroy: () => { clearInterval(state.interval); }
    };
}
