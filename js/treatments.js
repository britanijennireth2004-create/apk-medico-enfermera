/**
 * treatments.js — Registro de Tratamientos y Relevo (APK / Móvil)
 * Basado en la lógica inmutable de la versión web.
 */

const SVG = {
    pill: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`,
    syringe: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/></svg>`,
    clipboard: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
    heart: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    plus: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
};

const ENTRY_TYPES = {
    treatment: { label: 'Tratamiento', color: '#059669', bg: '#f0fdf4', icon: SVG.pill },
    medication: { label: 'Medicación', color: '#2563eb', bg: '#eff6ff', icon: SVG.syringe },
    observation: { label: 'Observación', color: '#d97706', bg: '#fffbeb', icon: SVG.clipboard },
    vitals: { label: 'Signos Vitales', color: '#7c3aed', bg: '#f5f3ff', icon: SVG.heart }
};

const ROUTES = ['Oral', 'IV', 'IM', 'SC', 'Tópica', 'Inhalatoria'];

export function mountTreatments(root, { store, user }) {
    if (!root) return;

    const state = {
        selectedPatientId: null,
        filterType: 'all',
        patients: store.get('patients') || []
    };

    function render() {
        const patients = store.get('patients') || [];
        const logs = getLogs();

        root.innerHTML = `
            <div style="padding:15px; display:flex; flex-direction:column; gap:15px;">
                
                <!-- Selector de Paciente -->
                <div style="background:#fff; border-radius:15px; padding:15px; border:1px solid var(--neutralLight);">
                    <label style="font-size:0.7rem; font-weight:700; color:var(--neutralSecondary); text-transform:uppercase; display:block; margin-bottom:8px;">Paciente Seleccionado</label>
                    <select id="trx-patient-select" style="width:100%; padding:10px; border-radius:10px; border:1.5px solid var(--neutralLight); background:#f8f9fa; font-size:0.85rem;">
                        <option value="">— Seleccionar Paciente —</option>
                        ${patients.map(p => `<option value="${p.id}" ${p.id === state.selectedPatientId ? 'selected' : ''}>${p.name} (${p.dni || 'S/DNI'})</option>`).join('')}
                    </select>
                </div>

                ${state.selectedPatientId ? `
                    <!-- KPIs Rápidos del Paciente -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div style="background:#fff; padding:12px; border-radius:12px; border:1px solid var(--neutralLight); display:flex; align-items:center; gap:10px;">
                            <div style="color:var(--themePrimary);">${SVG.clipboard}</div>
                            <div>
                                <div style="font-size:1.1rem; font-weight:800;">${logs.length}</div>
                                <div style="font-size:0.65rem; color:var(--neutralSecondary);">Registros totales</div>
                            </div>
                        </div>
                        <div style="background:#fff; padding:12px; border-radius:12px; border:1px solid var(--neutralLight); display:flex; align-items:center; gap:10px;">
                            <div style="color:var(--green);">${SVG.pill}</div>
                            <div>
                                <div style="font-size:1.1rem; font-weight:800;">${logs.filter(l => l.entryType === 'treatment').length}</div>
                                <div style="font-size:0.65rem; color:var(--neutralSecondary);">Tratamientos</div>
                            </div>
                        </div>
                    </div>

                    <!-- Filtros -->
                    <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:5px;">
                        <button class="trx-filter ${state.filterType === 'all' ? 'active' : ''}" data-filter="all" style="flex-shrink:0; padding:6px 14px; border-radius:20px; border:1.5px solid var(--themePrimary); font-size:0.75rem; font-weight:700; ${state.filterType === 'all' ? 'background:var(--themePrimary); color:#fff;' : 'background:#fff; color:var(--themePrimary);'}">Todos</button>
                        ${Object.entries(ENTRY_TYPES).map(([k, v]) => `
                            <button class="trx-filter ${state.filterType === k ? 'active' : ''}" data-filter="${k}" style="flex-shrink:0; padding:6px 14px; border-radius:20px; border:1.5px solid ${v.color}; font-size:0.75rem; font-weight:700; ${state.filterType === k ? `background:${v.color}; color:#fff;` : `background:#fff; color:${v.color};`}">${v.label}</button>
                        `).join('')}
                    </div>

                    <!-- Línea de Tiempo -->
                    <div id="trx-timeline" style="display:flex; flex-direction:column; gap:12px;">
                        ${renderTimeline(logs)}
                    </div>

                    <!-- Botón Flotante / Inferior de Acción -->
                    <button id="btn-add-trx" style="background:var(--themePrimary); color:#fff; border:none; padding:15px; border-radius:12px; font-weight:800; font-size:0.9rem; display:flex; align-items:center; justify-content:center; gap:10px; box-shadow:0 4px 15px rgba(0,59,105,0.3);">
                        ${SVG.plus} Registrar Novedad / Relevo
                    </button>
                ` : `
                    <div style="text-align:center; padding:50px 20px; color:var(--neutralSecondary);">
                        <div style="font-size:3rem; opacity:0.2; margin-bottom:15px;">${SVG.clipboard}</div>
                        <p style="font-weight:600;">Seleccione un paciente para gestionar tratamientos</p>
                    </div>
                `}
            </div>
        `;

        setupListeners();
    }

    function getLogs() {
        if (!state.selectedPatientId) return [];
        let logs = store.get('treatmentLogs') || [];
        logs = logs.filter(l => l.patientId === state.selectedPatientId);
        if (state.filterType !== 'all') {
            logs = logs.filter(l => l.entryType === state.filterType);
        }
        return logs.sort((a, b) => b.timestamp - a.timestamp);
    }

    function renderTimeline(logs) {
        if (!logs.length) return `<div style="text-align:center; padding:30px; border:1px dashed var(--neutralLight); border-radius:12px; color:var(--neutralSecondary); font-size:0.8rem;">No hay registros para mostrar.</div>`;

        return logs.map(l => {
            const cfg = ENTRY_TYPES[l.entryType] || ENTRY_TYPES.observation;
            return `
                <div style="background:#fff; border-radius:12px; border:1px solid var(--neutralLight); border-left:4px solid ${cfg.color}; overflow:hidden;">
                    <div style="padding:10px 12px; background:${cfg.bg}; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.65rem; font-weight:800; color:${cfg.color}; text-transform:uppercase;">${cfg.label}</span>
                        <span style="font-size:0.65rem; color:var(--neutralSecondary);">${new Date(l.timestamp).toLocaleString()}</span>
                    </div>
                    <div style="padding:12px;">
                        <div style="font-size:0.82rem; line-height:1.5; color:var(--neutralPrimary);">${l.detail}</div>
                        <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; font-size:0.68rem; color:var(--neutralSecondary); border-top:1px solid #f0f0f0; padding-top:8px;">
                            <span><i class="fa-solid fa-user-doctor"></i> ${l.userName || 'Personal'}</span>
                            <span style="font-weight:700; color:var(--neutralDark);">${l.shift || ''}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function setupListeners() {
        root.querySelector('#trx-patient-select')?.addEventListener('change', e => {
            state.selectedPatientId = e.target.value;
            render();
        });

        root.querySelectorAll('.trx-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                state.filterType = btn.dataset.filter;
                render();
            });
        });

        root.querySelector('#btn-add-trx')?.addEventListener('click', openFormSheet);
    }

    function openFormSheet() {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); display:flex; flex-direction:column; justify-content:flex-end;';

        overlay.innerHTML = `
            <div id="trx-sheet" style="background:#fff; border-radius:20px 20px 0 0; max-height:92vh; display:flex; flex-direction:column; animation: slideUp 0.3s ease;">
                <div style="padding:15px; background:var(--themePrimary); border-radius:20px 20px 0 0; color:#fff; flex-shrink:0;">
                    <div style="width:40px; height:4px; background:rgba(255,255,255,0.3); border-radius:2px; margin:0 auto 10px;"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; font-size:1rem;">Registrar Novedad / Tratamiento</h3>
                        <button id="btn-close-sheet" style="background:none; border:none; color:#fff; font-size:1.5rem; padding:0 5px;">&times;</button>
                    </div>
                </div>
                <div style="flex:1; overflow-y:auto; padding:20px;">
                    <form id="trx-form" style="display:flex; flex-direction:column; gap:15px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <div class="form-group">
                                <label style="font-weight:700; font-size:0.7rem; color:var(--neutralSecondary); text-transform:uppercase;">Tipo *</label>
                                <select id="f-type" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--neutralLight); font-size:0.85rem;">
                                    ${Object.entries(ENTRY_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="font-weight:700; font-size:0.7rem; color:var(--neutralSecondary); text-transform:uppercase;">Turno *</label>
                                <select id="f-shift" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--neutralLight); font-size:0.85rem;">
                                    <option>Turno Mañana</option>
                                    <option>Turno Tarde</option>
                                    <option>Turno Noche</option>
                                    <option>Guardia</option>
                                </select>
                            </div>
                        </div>

                        <!-- Panel dinámico -->
                        <div id="f-dynamic-container" style="padding:15px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                            <!-- Inyectado por updateFormFields -->
                        </div>

                        <div class="form-group">
                            <label style="font-weight:700; font-size:0.7rem; color:var(--neutralSecondary); text-transform:uppercase;">Nota / Comentario Adicional</label>
                            <textarea id="f-note" rows="3" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--neutralLight); font-size:0.85rem; resize:none;" placeholder="Detalles u observaciones..."></textarea>
                        </div>

                        <div style="background:#fffbeb; border:1px solid #fcd34d; padding:10px; border-radius:8px; font-size:0.72rem; color:#92400e; display:flex; gap:10px; align-items:center;">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <span>Este registro es <b>INMUTABLE</b>. Revise bien antes de guardar.</span>
                        </div>
                    </form>
                </div>
                <div style="padding:15px; border-top:1px solid var(--neutralLight); display:flex; gap:10px; flex-shrink:0;">
                    <button id="btn-cancel-f" style="flex:1; padding:12px; border-radius:12px; border:1px solid var(--neutralLight); background:#fff; font-weight:700; font-size:0.85rem;">Cancelar</button>
                    <button id="btn-save-f" style="flex:2; padding:12px; border-radius:12px; border:none; background:var(--green); color:#fff; font-weight:800; font-size:0.9rem;">Finalizar Registro</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const typeSelect = overlay.querySelector('#f-type');
        const dynContainer = overlay.querySelector('#f-dynamic-container');

        const updateFormFields = () => {
            const type = typeSelect.value;
            if (type === 'treatment') {
                dynContainer.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <input type="text" id="f-proc" class="input" placeholder="Procedimiento (ej: Curación)" style="background:#fff;">
                        <input type="text" id="f-region" class="input" placeholder="Región (ej: Brazo Izquierdo)" style="background:#fff;">
                        <select id="f-resp" class="input" style="background:#fff;">
                            <option value="">Respuesta del Paciente</option>
                            <option>Tolerancia Buena</option>
                            <option>Tolerancia Regular</option>
                            <option>Mala Tolerancia</option>
                        </select>
                    </div>
                `;
            } else if (type === 'medication') {
                dynContainer.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <input type="text" id="f-med" class="input" placeholder="Medicamento y presentación" style="background:#fff;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <input type="text" id="f-dose" class="input" placeholder="Dosis" style="background:#fff;">
                            <select id="f-route" class="input" style="background:#fff;">
                                <option value="">Vía</option>
                                ${ROUTES.map(r => `<option>${r}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                `;
            } else if (type === 'vitals') {
                dynContainer.innerHTML = `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <label style="font-size:0.65rem; font-weight:700;">PA (mmHg)</label>
                            <input type="text" id="f-pa" class="input" placeholder="120/80" style="background:#fff;">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; font-weight:700;">FC (lpm)</label>
                            <input type="number" id="f-fc" class="input" placeholder="72" style="background:#fff;">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; font-weight:700;">Temp (°C)</label>
                            <input type="number" step="0.1" id="f-temp" class="input" placeholder="36.5" style="background:#fff;">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; font-weight:700;">SpO2 (%)</label>
                            <input type="number" id="f-spo2" class="input" placeholder="98" style="background:#fff;">
                        </div>
                    </div>
                `;
            } else {
                dynContainer.innerHTML = `<p style="font-size:0.8rem; color:var(--neutralSecondary); margin:0;">Complete el detalle en el campo inferior.</p>`;
            }
        };

        typeSelect.onchange = updateFormFields;
        updateFormFields();

        const close = () => {
            overlay.style.opacity = '0';
            overlay.querySelector('#trx-sheet').style.transform = 'translateY(100%)';
            setTimeout(() => overlay.remove(), 300);
        };

        overlay.querySelector('#btn-close-sheet').onclick = close;
        overlay.querySelector('#btn-cancel-f').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        overlay.querySelector('#btn-save-f').onclick = () => {
            const type = typeSelect.value;
            const shift = overlay.querySelector('#f-shift').value;
            const note = overlay.querySelector('#f-note').value.trim();

            let detail = '';
            if (type === 'treatment') {
                const proc = overlay.querySelector('#f-proc').value;
                const reg = overlay.querySelector('#f-region').value;
                const resp = overlay.querySelector('#f-resp').value;
                detail = `Procedimiento: ${proc || 'No especificado'} | Región: ${reg || '—'} | Respuesta: ${resp || '—'}`;
            } else if (type === 'medication') {
                const med = overlay.querySelector('#f-med').value;
                const dose = overlay.querySelector('#f-dose').value;
                const route = overlay.querySelector('#f-route').value;
                detail = `Admin: ${med || '—'} | Dosis: ${dose || '—'} | Vía: ${route || '—'}`;
            } else if (type === 'vitals') {
                const pa = overlay.querySelector('#f-pa').value;
                const fc = overlay.querySelector('#f-fc').value;
                const t = overlay.querySelector('#f-temp').value;
                const s = overlay.querySelector('#f-spo2').value;
                detail = `SV: ${pa ? 'PA:' + pa : ''} ${fc ? 'FC:' + fc : ''} ${t ? 'T:' + t : ''} ${s ? 'SpO2:' + s : ''}`.trim();
            }

            if (note) detail += (detail ? ' | Obs: ' : '') + note;

            if (!detail && !note) {
                alert('Por favor ingrese algún detalle para el registro.');
                return;
            }

            const entry = {
                id: 'tlog_' + Date.now(),
                patientId: state.selectedPatientId,
                entryType: type,
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                shift,
                detail,
                timestamp: Date.now()
            };

            const allLogs = store.get('treatmentLogs') || [];
            allLogs.push(entry);
            store.set('treatmentLogs', allLogs);

            close();
            render();
        };
    }

    render();
}
