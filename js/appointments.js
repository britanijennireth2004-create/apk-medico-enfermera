/**
 * appointments.js — Módulo de Citas (APK / Doctor Mobile)
 * Lógica de negocio equivalente a la versión web:
 *   - Validación de jornada, capacidad diaria y conflictos de horario
 *   - Búsqueda de paciente por cédula (única vía — sin selector de lista)
 *   - Médico siempre fijo al perfil logueado
 *   - Slots de hora disponibles calculados dinámicamente
 *   - Recursos: Consultorio + Equipamiento + Insumos (descuento de stock)
 *   - Cancelación con feedback
 */

// ─── Utilidades ──────────────────────────────────────────────────────────────

function timeToMin(t) {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + (m || 0);
}

function minToTime(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function dateToStr(d) {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ─── Jornada del médico ───────────────────────────────────────────────────────

export function isDoctorWorkingAt(doctor, dateStr, timeStr = null, duration = 0) {
    if (!doctor) return false;
    if (doctor.isActive === false) return false;
    if (doctor.status === 'vacation' || doctor.status === 'license') return false;

    const dateObj = new Date(dateStr + 'T12:00:00');
    const dayIndex = dateObj.getDay();
    const engDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const esDays = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const dayEn = engDays[dayIndex];
    const dayEs = esDays[dayIndex];

    let works = false;
    let startStr = doctor.scheduleStart ||
        (doctor.workStartHour !== undefined ? `${String(doctor.workStartHour).padStart(2, '0')}:00` : '08:00');
    let endStr = doctor.scheduleEnd ||
        (doctor.workEndHour !== undefined ? `${String(doctor.workEndHour).padStart(2, '0')}:00` : '18:00');

    // Objeto schedule { monday:{start,end}, ... }
    if (doctor.schedule && typeof doctor.schedule === 'object') {
        const sk = Object.keys(doctor.schedule).reduce((a, k) => { a[k.toLowerCase()] = doctor.schedule[k]; return a; }, {});
        if (sk[dayEn]?.start && sk[dayEn]?.end) { works = true; startStr = sk[dayEn].start; endStr = sk[dayEn].end; }
    }
    // Array workDays
    if (!works && Array.isArray(doctor.workDays) && doctor.workDays.length) {
        const wd = doctor.workDays.map(d => d.toLowerCase());
        const nEs = dayEs.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (wd.includes(dayEs.toLowerCase()) || wd.includes(nEs)) works = true;
    }
    // String schedule legado
    if (!works && typeof doctor.schedule === 'string') {
        const s = doctor.schedule.toLowerCase();
        if (s.includes('lun-vie') && dayIndex >= 1 && dayIndex <= 5) works = true;
        else if (s.includes('mar-jue') && dayIndex >= 2 && dayIndex <= 4) works = true;
        else if (s.includes('lun-sab') && dayIndex >= 1 && dayIndex <= 6) works = true;
        else if (s.includes('lun-dom')) works = true;
        if (!works) {
            const abbrs = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0 };
            Object.entries(abbrs).forEach(([a, i]) => { if (s.includes(a) && dayIndex === i) works = true; });
        }
    }
    // Fallback lun-vie
    if (!works && !doctor.workDays && !doctor.schedule) {
        if (dayIndex >= 1 && dayIndex <= 5) works = true;
    }

    if (!works) return false;
    if (!timeStr) return true;

    const tv = timeToMin(timeStr);
    const sv = timeToMin(startStr);
    const ev = timeToMin(endStr);
    return tv >= sv && (tv + (duration || 0)) <= ev;
}

// ─── Citas del médico para una fecha ─────────────────────────────────────────

export function getDoctorAppointmentsForDate(store, doctorId, dateStr) {
    return store.get('appointments').filter(apt => {
        if (apt.doctorId !== doctorId) return false;
        if (apt.status === 'cancelled') return false;
        return dateToStr(new Date(apt.dateTime)) === dateStr;
    });
}

// ─── Capacidad diaria ─────────────────────────────────────────────────────────

export function hasDoctorAvailability(store, doctorId, dateStr, excludeId = null) {
    const doctor = store.find('doctors', doctorId);
    if (!doctor || !isDoctorWorkingAt(doctor, dateStr)) return false;
    const capacity = doctor.dailyCapacity || 20;
    const apts = getDoctorAppointmentsForDate(store, doctorId, dateStr);
    const relevant = excludeId ? apts.filter(a => a.id !== excludeId) : apts;
    return relevant.length < capacity;
}

export function isDoctorFullyBooked(store, doctorId, dateStr, excludeId = null) {
    return !hasDoctorAvailability(store, doctorId, dateStr, excludeId);
}

// ─── Conflicto de horario ─────────────────────────────────────────────────────

export function hasScheduleConflict(store, doctorId, dateStr, timeStr, duration, excludeId = null) {
    const newStart = new Date(`${dateStr}T${timeStr}`);
    const newEnd = new Date(newStart.getTime() + duration * 60000);

    return store.get('appointments').some(apt => {
        if (excludeId && apt.id === excludeId) return false;
        if (apt.doctorId !== doctorId) return false;
        if (apt.status === 'cancelled') return false;
        const aptDt = new Date(apt.dateTime);
        if (dateToStr(aptDt) !== dateStr) return false;
        const aptEnd = new Date(aptDt.getTime() + (apt.duration || 30) * 60000);
        return (newStart >= aptDt && newStart < aptEnd) ||
            (newEnd > aptDt && newEnd <= aptEnd) ||
            (newStart <= aptDt && newEnd >= aptEnd);
    });
}

// ─── Slots de hora disponibles ────────────────────────────────────────────────

export function getAvailableTimeSlots(store, doctorId, dateStr, duration = 30, excludeId = null) {
    const doctor = store.find('doctors', doctorId);
    if (!doctor || !isDoctorWorkingAt(doctor, dateStr)) return [];

    const dayIndex = new Date(dateStr + 'T12:00:00').getDay();
    const dayEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayIndex];

    let startMin = timeToMin(doctor.scheduleStart ||
        (doctor.workStartHour !== undefined ? `${String(doctor.workStartHour).padStart(2, '0')}:00` : '08:00'));
    let endMin = timeToMin(doctor.scheduleEnd ||
        (doctor.workEndHour !== undefined ? `${String(doctor.workEndHour).padStart(2, '0')}:00` : '18:00'));

    if (doctor.schedule && typeof doctor.schedule === 'object') {
        const sk = Object.keys(doctor.schedule).reduce((a, k) => { a[k.toLowerCase()] = doctor.schedule[k]; return a; }, {});
        if (sk[dayEn]?.start && sk[dayEn]?.end) { startMin = timeToMin(sk[dayEn].start); endMin = timeToMin(sk[dayEn].end); }
    }

    const existing = getDoctorAppointmentsForDate(store, doctorId, dateStr)
        .filter(a => !excludeId || a.id !== excludeId);

    const now = new Date();
    const todayStr = dateToStr(now);
    const isToday = dateStr === todayStr;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const slots = [];
    let cur = startMin;
    while (cur + duration <= endMin) {
        if (isToday && cur < nowMin + 15) { cur += 30; continue; }
        const endCur = cur + duration;
        const conflict = existing.some(apt => {
            const aptDt = new Date(apt.dateTime);
            const aptMin = aptDt.getHours() * 60 + aptDt.getMinutes();
            const aptEnd = aptMin + (apt.duration || 30);
            return (cur >= aptMin && cur < aptEnd) || (endCur > aptMin && endCur <= aptEnd) || (cur <= aptMin && endCur >= aptEnd);
        });
        if (!conflict) slots.push(minToTime(cur));
        cur += 30;
    }
    return slots;
}

// ─── Próximo slot libre ───────────────────────────────────────────────────────

export function findNextAvailableSlot(store, doctorId, duration = 30) {
    const doctor = store.find('doctors', doctorId);
    if (!doctor) return null;

    const now = new Date();
    const cur = new Date(now);
    if (now.getHours() >= 17) cur.setDate(cur.getDate() + 1);

    for (let i = 0; i < 15; i++) {
        const dateStr = dateToStr(cur);
        const slots = getAvailableTimeSlots(store, doctorId, dateStr, duration);
        if (slots.length > 0) {
            if (dateStr === dateToStr(now)) {
                const nowMin = now.getHours() * 60 + now.getMinutes();
                const fut = slots.find(s => timeToMin(s) > nowMin + 15);
                if (fut) return { date: dateStr, time: fut };
            } else {
                return { date: dateStr, time: slots[0] };
            }
        }
        cur.setDate(cur.getDate() + 1);
    }
    return null;
}

// ─── FORMULARIO — Nueva Cita ──────────────────────────────────────────────────
/**
 * Reglas del APK (doctor):
 *  - Paciente: solo búsqueda por cédula (sin selector de lista)
 *  - Médico: siempre el perfil logueado (campo locked / hidden)
 *  - Recursos: Consultorio + Equipamiento Médico + Insumos/Suministros
 */
export function mountNewAppointmentForm({ store, doctorRecord, user, onSave }) {
    const container = document.getElementById('new-appointment-form-container');
    if (!container) return;

    const today = dateToStr(new Date());
    const areas = store.get('areas') || [];
    const rooms = (store.get('consultorios') || []).filter(r => r.status !== 'maintenance' && r.status !== 'mantenimiento');
    const equipment = (store.get('equiposMedicos') || []).filter(e => e.status === 'available' || e.status === 'disponible');
    const supplies = (store.get('suministros') || []).filter(s => (s.stock || 0) > 0);

    const myDoctor = doctorRecord || store.get('doctors')[0];

    // Áreas a las que pertenece el médico (principal + otras)
    const doctorAreaIds = [
        myDoctor?.areaId,
        ...(Array.isArray(myDoctor?.otherAreas) ? myDoctor.otherAreas : [])
    ].filter(Boolean);
    const doctorAreas = (store.get('areas') || []).filter(a => doctorAreaIds.includes(a.id));

    container.innerHTML = `
    <form id="new-apt-form" autocomplete="off" novalidate>

        <!-- ── 1. PACIENTE (solo cédula) ──── -->
        <div class="apt-form-section">
            <div class="apt-section-header forest">
                <i class="fa-solid fa-hospital-user"></i> PACIENTE
            </div>
            <div class="form-group">
                <label>Buscar por Número de Cédula *</label>
                <div class="input-group">
                    <select id="apt-doc-type" class="select-compact">
                        <option value="V">V</option>
                        <option value="E">E</option>
                        <option value="J">J</option>
                        <option value="P">P</option>
                    </select>
                    <input id="apt-cedula" type="text" inputmode="numeric"
                           placeholder="Número de cédula...">
                </div>
                <div id="apt-patient-feedback" style="margin-top:8px;font-size:0.82rem;min-height:22px;"></div>
                <input type="hidden" id="apt-patient-id" name="patientId">
            </div>
            <div id="apt-patient-name-group" class="form-group" style="display:none;">
                <label id="apt-patient-name-label">Nombre del Paciente</label>
                <div style="position:relative;">
                    <input type="text" id="apt-patient-name" placeholder="Nombre completo..."
                           style="padding:12px 42px 12px 14px;border-radius:8px;">
                    <button type="button" id="apt-clear-patient" title="Limpiar"
                            style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--neutralSecondary);font-size:1rem;padding:0;">
                        <i class="fa-solid fa-circle-xmark"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- ── 2. MÉDICO (fijo al logueado) ─ -->
        <div class="apt-form-section">
            <div class="apt-section-header" style="background:#f0f9ff;color:#0369a1;">
                <i class="fa-solid fa-user-doctor"></i> MÉDICO Y ÁREA
            </div>
            <div class="form-group">
                <label>Médico Tratante</label>
                <div style="display:flex;align-items:center;gap:12px;background:var(--neutralLighterAlt,#f8f8f8);border:1px solid var(--neutralQuaternaryAlt);border-radius:8px;padding:12px 14px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:var(--themeLighter);display:flex;align-items:center;justify-content:center;font-size:1rem;color:var(--themePrimary);flex-shrink:0;">
                        <i class="fa-solid fa-user-doctor"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;color:var(--neutralDark);">${myDoctor?.name || 'Médico'}</div>
                    </div>
                    <i class="fa-solid fa-lock" style="color:var(--neutralTertiary);font-size:0.8rem;" title="Asignado automáticamente al médico logueado"></i>
                </div>
                <input type="hidden" name="doctorId" value="${myDoctor?.id || ''}">
            </div>
            ${doctorAreas.length ? `
            <div class="form-group">
                <label>Área / Servicio</label>
                <select id="apt-area" name="areaId">
                    <option value="">— Seleccionar área —</option>
                    ${doctorAreas.map(a => `<option value="${a.id}" ${a.id === myDoctor?.areaId ? 'selected' : ''}>${a.name}</option>`).join('')}
                </select>
            </div>` : ''}
            <div id="apt-no-avail-msg" style="display:none;background:#fff3cd;border-radius:8px;padding:12px;font-size:0.82rem;color:#856404;margin:4px 0;">
                <i class="fa-solid fa-triangle-exclamation"></i>
                El médico no tiene disponibilidad para la fecha seleccionada.
            </div>
        </div>

        <!-- ── 3. MODALIDAD ──────────────────── -->
        <div class="apt-form-section">
            <div class="apt-section-header purple">
                <i class="fa-solid fa-video"></i> MODALIDAD
            </div>
            <div class="form-group">
                <label>Tipo de Consulta *</label>
                <select id="apt-modality" name="modality">
                    <option value="presential">Presencial en Clínica</option>
                    <option value="virtual">Virtual / Telemedicina</option>
                </select>
            </div>
            <div class="form-group" id="apt-link-group" style="display:none;">
                <label>Enlace de Reunión Virtual</label>
                <input type="url" name="virtualLink" id="apt-virtual-link"
                       placeholder="https://meet.hospital-humnt.com/...">
                <div style="font-size:0.73rem;color:var(--neutralSecondary);margin-top:4px;">
                    <i class="fa-solid fa-info-circle"></i> Se genera automáticamente. Puede modificarlo.
                </div>
            </div>
        </div>

        <!-- ── 4. FECHA Y HORA ───────────────── -->
        <div class="apt-form-section">
            <div class="apt-section-header gold">
                <i class="fa-regular fa-calendar"></i> FECHA Y HORA
            </div>
            <div class="form-group">
                <label>Fecha *</label>
                <input type="date" id="apt-date" name="date" min="${today}" value="${today}" required>
            </div>
            <div class="form-group">
                <label>Horario Disponible *</label>
                <select id="apt-time" name="time" required>
                    <option value="">Cargando horarios...</option>
                </select>
                <div id="apt-time-info" style="font-size:0.73rem;color:var(--neutralSecondary);margin-top:4px;">
                    Horarios calculados según jornada y citas existentes del médico.
                </div>
            </div>
            <div class="form-group">
                <label>Duración *</label>
                <select name="duration" id="apt-duration">
                    <option value="15">15 minutos</option>
                    <option value="30" selected>30 minutos</option>
                    <option value="45">45 minutos</option>
                    <option value="60">60 minutos (1 hora)</option>
                </select>
            </div>
        </div>

        <!-- ── 5. RECURSOS ───────────────────── -->
        <div class="apt-form-section">
            <div class="apt-section-header blue">
                <i class="fa-solid fa-building-columns"></i> RECURSOS
            </div>

            <!-- Consultorio -->
            <div class="form-group">
                <label><i class="fa-solid fa-door-open" style="color:var(--teal);"></i>&nbsp; Consultorio</label>
                <select name="consultorioId" id="apt-consultorio">
                    <option value="">Sin consultorio asignado</option>
                    ${rooms.map(r => `<option value="${r.id}">${r.name}${r.area ? ' &mdash; ' + r.area : ''}${r.floor ? ' (Piso ' + r.floor + ')' : ''}</option>`).join('')}
                </select>
                <div id="apt-consultorio-info" style="font-size:0.73rem;color:var(--neutralSecondary);margin-top:4px;">
                    Seleccione el consultorio para la cita presencial.
                </div>
            </div>

            <!-- Equipamiento Médico -->
            <div class="form-group">
                <label><i class="fa-solid fa-stethoscope" style="color:var(--blue);"></i>&nbsp; Equipamiento Médico</label>
                ${equipment.length ? `
                <select name="equipmentId" id="apt-equipment">
                    <option value="">Ninguno / No requiere</option>
                    ${equipment.map(e => `<option value="${e.id}">${e.name}${e.model ? ' &mdash; ' + e.model : ''}</option>`).join('')}
                </select>` : `
                <div style="background:var(--neutralLight);border-radius:8px;padding:10px 14px;font-size:0.8rem;color:var(--neutralSecondary);">
                    <i class="fa-solid fa-circle-info"></i> No hay equipamiento médico disponible actualmente.
                </div>`}
            </div>

            <!-- Insumos / Suministros -->
            <div class="form-group">
                <label><i class="fa-solid fa-box-open" style="color:var(--tealLight);"></i>&nbsp; Insumos / Suministros</label>
                ${supplies.length ? `
                <select name="supplyId" id="apt-supply">
                    <option value="">Sin insumos adicionales</option>
                    ${supplies.map(s => `<option value="${s.id}">${s.name} &mdash; ${s.stock} ${s.unit || 'und'} disponibles</option>`).join('')}
                </select>
                <div style="font-size:0.73rem;color:var(--neutralSecondary);margin-top:4px;">
                    <i class="fa-solid fa-info-circle"></i> Se descuenta 1 unidad del stock al registrar la cita.
                </div>` : `
                <div style="background:var(--neutralLight);border-radius:8px;padding:10px 14px;font-size:0.8rem;color:var(--neutralSecondary);">
                    <i class="fa-solid fa-circle-info"></i> No hay insumos con stock disponible actualmente.
                </div>`}
            </div>
        </div>

        <!-- ── 6. INFO ADICIONAL ─────────────── -->
        <div class="apt-form-section">
            <div class="apt-section-header olive">
                <i class="fa-solid fa-clipboard-list"></i> INFORMACIÓN ADICIONAL
            </div>
            <div class="form-group">
                <label>Motivo de la Consulta</label>
                <textarea name="reason" id="apt-reason" rows="3"
                          placeholder="Describa brevemente el motivo de la consulta..."></textarea>
            </div>
            <div class="form-group">
                <label>Notas Adicionales</label>
                <textarea name="notes" id="apt-notes" rows="2"
                          placeholder="Observaciones, alergias, indicaciones previas..."></textarea>
            </div>
        </div>

        <!-- Error global -->
        <div id="apt-global-error"
             style="display:none;background:#fee2e2;color:var(--red);border-radius:8px;padding:12px;font-size:0.83rem;margin-bottom:12px;line-height:1.6;"></div>

        <div style="display:flex;justify-content:flex-end;gap:24px;margin-bottom:20px;">
            <button type="button" class="btn-cancel" id="apt-clear-btn" title="Limpiar" style="background:var(--neutralLight);color:var(--neutralPrimary);border:none;border-radius:50%;width:56px;height:56px;font-size:1.5rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-eraser"></i>
            </button>
            <button type="submit" class="btn-save" id="apt-submit-btn" title="Registrar Cita" style="margin:0;background:var(--themePrimary);color:#fff;border:none;border-radius:50%;width:56px;height:56px;font-size:1.5rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,59,105,0.25);flex-shrink:0;">
                <i class="fa-solid fa-calendar-check"></i>
            </button>
        </div>
    </form>
    `;

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const myDoctorId = myDoctor?.id || '';
    const datePicker = $('apt-date');
    const timeSel = $('apt-time');
    const durationSel = $('apt-duration');
    const modalitySel = $('apt-modality');
    const linkGroup = $('apt-link-group');
    const virtualLink = $('apt-virtual-link');
    const cedulaIn = $('apt-cedula');
    const docTypeSel = $('apt-doc-type');
    const hiddenId = $('apt-patient-id');
    const feedback = $('apt-patient-feedback');
    const nameGroup = $('apt-patient-name-group');
    const nameLabel = $('apt-patient-name-label');
    const nameInput = $('apt-patient-name');
    const clearBtn = $('apt-clear-patient');
    const timeInfo = $('apt-time-info');
    const noAvailMsg = $('apt-no-avail-msg');
    const conSel = $('apt-consultorio');
    const conInfo = $('apt-consultorio-info');
    const errBox = $('apt-global-error');

    // ── Búsqueda por cédula ──────────────────────────────────────────────────
    function searchByCedula() {
        const dni = cedulaIn.value.trim();
        const type = docTypeSel.value;
        if (!dni) { clearPatient(); return; }

        const allPats = store.get('patients');
        const p = allPats.find(x => String(x.dni).trim() === dni && (x.docType || 'V') === type);
        if (p) {
            hiddenId.value = p.id;
            nameGroup.style.display = '';
            nameLabel.textContent = 'Nombre del Paciente';
            nameInput.value = p.name;
            nameInput.readOnly = true;
            nameInput.style.cssText = 'border-color:#16a34a;background:#f0fdf4;color:#166534;';
            cedulaIn.style.cssText = 'border-color:#16a34a;background:#f0fdf4;';
            feedback.innerHTML = `<span style="color:#16a34a;"><i class="fa-solid fa-circle-check"></i> Paciente registrado.</span>`;
        } else {
            hiddenId.value = '';
            nameGroup.style.display = '';
            nameLabel.textContent = 'Nombre del Paciente Nuevo *';
            nameInput.value = '';
            nameInput.readOnly = false;
            nameInput.style.cssText = 'border-color:#f97316;background:#fff7ed;';
            cedulaIn.style.cssText = 'border-color:#f97316;background:#fff7ed;';
            feedback.innerHTML = `<span style="color:#c2410c;"><i class="fa-solid fa-triangle-exclamation"></i> No registrado. Ingrese su nombre para crearlo automáticamente.</span>`;
        }
    }

    function clearPatient() {
        hiddenId.value = '';
        cedulaIn.value = '';
        cedulaIn.style.cssText = '';
        nameGroup.style.display = 'none';
        nameInput.value = '';
        nameInput.readOnly = false;
        nameInput.style.cssText = '';
        feedback.innerHTML = '';
    }

    let _dbounce;
    cedulaIn.addEventListener('input', () => { clearTimeout(_dbounce); _dbounce = setTimeout(searchByCedula, 350); });
    docTypeSel.addEventListener('change', () => { if (cedulaIn.value.trim()) searchByCedula(); });
    clearBtn?.addEventListener('click', clearPatient);

    // ── Modalidad ─────────────────────────────────────────────────────────────
    modalitySel.addEventListener('change', () => {
        const isVirtual = modalitySel.value === 'virtual';
        linkGroup.style.display = isVirtual ? '' : 'none';
        if (isVirtual && !virtualLink.value) {
            virtualLink.value = `https://meet.hospital-humnt.com/humnt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
        }
        if (conSel) {
            conSel.disabled = isVirtual;
            if (conInfo) conInfo.innerHTML = isVirtual
                ? '<span style="color:#7c3aed;font-weight:600;"><i class="fa-solid fa-video"></i> Las citas virtuales no requieren consultorio físico.</span>'
                : 'Seleccione el consultorio para la cita presencial.';
        }
    });

    // ── Slots ─────────────────────────────────────────────────────────────────
    function refreshSlots() {
        const date = datePicker.value;
        const duration = parseInt(durationSel.value) || 30;
        if (!myDoctorId || !date) {
            timeSel.innerHTML = '<option value="">Sin información de médico</option>';
            return;
        }
        if (!isDoctorWorkingAt(myDoctor, date)) {
            timeSel.innerHTML = '<option value="">El médico no trabaja ese día</option>';
            if (timeInfo) timeInfo.innerHTML = `<span style="color:var(--orange);font-weight:600;"><i class="fa-solid fa-calendar-xmark"></i> El médico no tiene jornada para esa fecha.</span>`;
            noAvailMsg.style.display = '';
            return;
        }
        noAvailMsg.style.display = 'none';

        const slots = getAvailableTimeSlots(store, myDoctorId, date, duration);
        if (slots.length > 0) {
            timeSel.innerHTML = '<option value="">— Seleccionar horario —</option>' +
                slots.map(s => `<option value="${s}">${s}</option>`).join('');
            timeSel.value = slots[0];
            if (timeInfo) timeInfo.innerHTML = `<span style="color:var(--green);font-weight:600;"><i class="fa-solid fa-circle-check"></i> ${slots.length} horario${slots.length === 1 ? '' : 's'} disponible${slots.length === 1 ? '' : 's'}</span>`;
        } else {
            timeSel.innerHTML = '<option value="">No hay disponibilidad</option>';
            if (timeInfo) timeInfo.innerHTML = `<span style="color:var(--red);font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Sin horarios libres. Elija otra fecha.</span>`;
        }
    }

    datePicker.addEventListener('change', refreshSlots);
    durationSel.addEventListener('change', refreshSlots);

    // Inicializar con próximo slot
    if (myDoctorId) {
        const next = findNextAvailableSlot(store, myDoctorId);
        if (next) datePicker.value = next.date;
        refreshSlots();
    }

    // ── Validación ────────────────────────────────────────────────────────────
    function validateForm() {
        errBox.style.display = 'none';
        const errors = [];
        const patientId = hiddenId.value;
        const newName = nameInput.value.trim();
        const date = datePicker.value;
        const time = timeSel.value;
        const duration = parseInt(durationSel.value) || 30;

        if (!cedulaIn.value.trim()) errors.push('Ingrese el número de cédula del paciente.');
        else if (!patientId && !newName) errors.push('Ingrese el nombre del paciente nuevo.');
        if (!myDoctorId) errors.push('No se encontró el perfil del médico.');
        if (!date) errors.push('Seleccione una fecha.');
        if (!time) errors.push('Seleccione un horario disponible.');
        if (date && time && new Date(`${date}T${time}`) < new Date())
            errors.push('No puede registrar citas en fechas u horas pasadas.');
        if (myDoctor && date && time && !isDoctorWorkingAt(myDoctor, date, time, duration))
            errors.push(`El horario ${time} está fuera de la jornada laboral del médico.`);
        if (myDoctorId && date && isDoctorFullyBooked(store, myDoctorId, date))
            errors.push('El médico tiene su cupo completo para ese día.');
        if (myDoctorId && date && time && hasScheduleConflict(store, myDoctorId, date, time, duration))
            errors.push(`Conflicto: ya existe una cita a las ${time} en esa fecha.`);

        if (errors.length > 0) {
            errBox.innerHTML = errors.map(e => `<div><i class="fa-solid fa-circle-xmark"></i> ${e}</div>`).join('');
            errBox.style.display = '';
            errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return false;
        }
        return true;
    }

    $('apt-clear-btn').onclick = async () => {
        if (await hospitalConfirm('¿Desea limpiar todos los campos del formulario?')) {
            $('new-apt-form').reset();
            hiddenId.value = '';
            cedulaIn.readOnly = false;
            nameInput.readOnly = false;
            docTypeSel.disabled = false;
            virtualLink.style.display = 'none';
        }
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    $('new-apt-form').onsubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        const btn = $('apt-submit-btn');
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

        try {
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const newName = nameInput.value.trim();
            let finalPatientId = hiddenId.value;

            if (!finalPatientId && newName) {
                const newPat = {
                    id: 'pat-' + Date.now(),
                    name: newName,
                    dni: cedulaIn.value.trim(),
                    docType: docTypeSel.value,
                    isActive: true,
                    createdAt: new Date().toISOString()
                };
                store.add('patients', newPat);
                finalPatientId = newPat.id;
            }

            const newApt = {
                id: 'apt-' + Date.now(),
                patientId: finalPatientId,
                doctorId: myDoctorId,
                areaId: data.areaId || myDoctor?.areaId || '',
                dateTime: new Date(`${data.date}T${data.time}`).getTime(),
                duration: parseInt(data.duration) || 30,
                reason: data.reason || '',
                notes: data.notes || '',
                modality: data.modality || 'presential',
                virtualLink: data.modality === 'virtual' ? (data.virtualLink || '') : '',
                consultorioId: data.modality !== 'virtual' ? (data.consultorioId || '') : '',
                equipmentId: data.equipmentId || '',
                supplyId: data.supplyId || '',
                status: 'scheduled',
                createdBy: user?.id || '',
                createdAt: Date.now()
            };

            // Descontar stock del insumo seleccionado
            if (newApt.supplyId) {
                const sup = store.find('suministros', newApt.supplyId);
                if (sup && (sup.stock || 0) > 0) {
                    store.update('suministros', sup.id, { stock: sup.stock - 1 });
                }
            }

            onSave(newApt);
        } catch (err) {
            console.error('Error al registrar cita:', err);
            errBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Error inesperado. Intente de nuevo.`;
            errBox.style.display = '';
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-calendar-check"></i>`;
        }
    };
}

// ─── MIS CITAS ────────────────────────────────────────────────────────────────

export function renderMyAppointmentsView(appointments, store, currentFilter, onFilterChange) {
    const tabsEl = document.getElementById('my-appointments-tabs');
    if (tabsEl) {
        tabsEl.querySelectorAll('.appt-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === currentFilter);
            tab.onclick = () => onFilterChange(tab.dataset.filter);
        });
    }

    const statusMap = {
        'all': null,
        'scheduled': ['scheduled', 'confirmed'],
        'completed': ['completed', 'finalized'],
        'cancelled': ['cancelled']
    };
    const list = document.getElementById('my-appointments-list');
    const accepted = statusMap[currentFilter];
    const filtered = accepted
        ? appointments.filter(a => accepted.includes(a.status))
        : appointments;

    list.innerHTML = '';

    if (!filtered.length) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-calendar-xmark"></i><br>
                ${currentFilter === 'all' ? 'No hay citas registradas.' : 'No hay citas con este estado.'}<br>
                <span onclick="window._apkApp?.navigate?.('new-appointment')"
                      style="color:var(--themePrimary);font-weight:600;font-size:0.85rem;cursor:pointer;margin-top:12px;display:inline-block;">
                    <i class="fa-solid fa-circle-plus"></i> Nueva Cita
                </span>
            </div>`;
        return;
    }

    const statusLabels = {
        'scheduled': { label: 'Pendiente', cls: 'appt-status-scheduled' },
        'confirmed': { label: 'Confirmada', cls: 'appt-status-in_progress' },
        'in_progress': { label: 'En curso', cls: 'appt-status-in_progress' },
        'completed': { label: 'Atendida', cls: 'appt-status-completed' },
        'finalized': { label: 'Finalizada', cls: 'appt-status-finalized' },
        'cancelled': { label: 'Cancelada', cls: 'appt-status-cancelled' }
    };

    filtered.forEach(apt => {
        const patient = store.find('patients', apt.patientId);
        const area = apt.areaId ? store.find('areas', apt.areaId) : null;
        const consultorio = apt.consultorioId ? store.find('consultorios', apt.consultorioId) : null;
        const dt = new Date(apt.dateTime);
        const dateStr = dt.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const st = statusLabels[apt.status] || { label: apt.status, cls: 'appt-status-scheduled' };
        const canCancel = apt.status === 'scheduled' || apt.status === 'confirmed';

        const card = document.createElement('div');
        card.className = 'agenda-item';
        card.style.cssText = 'flex-direction:column;align-items:flex-start;gap:10px;padding:16px;';
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;gap:8px;">
                <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0;">
                    <div class="time-block" style="min-width:56px;text-align:center;flex-shrink:0;">
                        <span class="time">${timeStr}</span>
                        <span class="am-pm" style="font-size:0.62rem;">${dateStr}</span>
                    </div>
                    <div style="min-width:0;">
                        <div style="font-weight:700;font-size:0.95rem;color:var(--neutralDark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${patient?.name || '—'}</div>
                        <div style="font-size:0.73rem;color:var(--neutralSecondary);margin-top:2px;">
                            ${patient?.docType || '?'}-${patient?.dni || '—'}
                            &nbsp;•&nbsp;
                            ${apt.modality === 'virtual' ? '<i class="fa-solid fa-video" style="color:var(--neutralSecondary);"></i> Virtual' : '<i class="fa-solid fa-hospital" style="color:var(--neutralSecondary);"></i> Presencial'}
                            ${area ? '&nbsp;•&nbsp;' + area.name : ''}
                        </div>
                    </div>
                </div>
                <span class="appt-status-badge ${st.cls}" style="flex-shrink:0;">${st.label}</span>
            </div>
            ${apt.reason ? `
            <div style="font-size:0.8rem;color:var(--neutralSecondary);padding-left:68px;margin-top:-4px;">
                <i class="fa-solid fa-notes-medical" style="color:var(--themeTertiary);margin-right:4px;"></i>${apt.reason}
            </div>` : ''}
            ${consultorio ? `
            <div style="font-size:0.78rem;color:var(--neutralSecondary);padding-left:68px;margin-top:-4px;">
                <i class="fa-solid fa-door-open" style="color:var(--teal);margin-right:4px;"></i>${consultorio.name}
            </div>` : ''}
            <div style="display:flex;gap:10px;padding-left:68px;flex-wrap:wrap;margin-top:8px;">
                ${apt.modality === 'virtual' && apt.virtualLink ? `
                <a href="${apt.virtualLink}" target="_blank" class="apt-action-btn" title="Unirse a Telemedicina" 
                   style="background:var(--teal);color:#fff;border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 3px 6px rgba(0,0,0,0.1);">
                    <i class="fa-solid fa-video" style="font-size:1.15rem;"></i>
                </a>` : ''}
                ${canCancel ? `
                <button class="apt-action-btn apt-action-cancel" data-id="${apt.id}" title="Cancelar cita" 
                        style="background:#dc2626;color:#fff;border:none;border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 3px 6px rgba(0,0,0,0.1);">
                    <i class="fa-solid fa-ban" style="font-size:1.15rem;"></i>
                </button>` : ''}
            <button class="apt-action-btn apt-action-detail" data-id="${apt.id}" title="Ver detalle de cita" 
                    style="background:var(--themeLighterAlt);color:var(--themePrimary);border:none;border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 3px 6px rgba(0,0,0,0.05);">
                <i class="fa-solid fa-eye" style="font-size:1.15rem;"></i>
            </button>
            </div>
        `;
        list.appendChild(card);
    });

    // Cancelar
    list.querySelectorAll('.apt-action-cancel').forEach(btn => {
        btn.addEventListener('click', async () => {
            const apt = store.find('appointments', btn.dataset.id);
            if (!apt) return;
            const fecha = new Date(apt.dateTime).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
            if (!await hospitalConfirm(`¿Cancelar la cita del ${fecha}?`, 'danger')) return;
            store.update('appointments', apt.id, {
                status: 'cancelled', cancelledAt: Date.now(),
                consultorioId: '', equipmentId: '', supplyId: ''
            });
            onFilterChange(currentFilter);
        });
    });

    // Ver detalle — modal estilizado
    list.querySelectorAll('.apt-action-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            const apt = store.find('appointments', btn.dataset.id);
            if (!apt) return;
            openDetailModal(apt, store, onFilterChange, currentFilter);
        });
    });
}

// ─── MODAL DE DETALLE ──────────────────────────────────────────────────

function openDetailModal(apt, store, onFilterChange, currentFilter) {
    const patient = store.find('patients', apt.patientId);
    const doctor = store.find('doctors', apt.doctorId);
    const area = apt.areaId ? store.find('areas', apt.areaId) : null;
    const consultorio = apt.consultorioId ? store.find('consultorios', apt.consultorioId) : null;
    const equipo = apt.equipmentId ? store.find('equiposMedicos', apt.equipmentId) : null;
    const supply = apt.supplyId ? store.find('suministros', apt.supplyId) : null;

    const dt = new Date(apt.dateTime);
    const dateStr = dt.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const canCancel = apt.status === 'scheduled' || apt.status === 'confirmed';

    const statusInfo = {
        scheduled: { label: 'Pendiente', color: 'var(--blue)', icon: 'fa-clock' },
        confirmed: { label: 'Confirmada', color: 'var(--teal)', icon: 'fa-circle-check' },
        in_progress: { label: 'En curso', color: 'var(--orange)', icon: 'fa-spinner' },
        completed: { label: 'Atendida', color: 'var(--green)', icon: 'fa-circle-check' },
        finalized: { label: 'Finalizada', color: 'var(--green)', icon: 'fa-flag-checkered' },
        cancelled: { label: 'Cancelada', color: 'var(--red)', icon: 'fa-ban' }
    }[apt.status] || { label: apt.status, color: 'var(--neutralSecondary)', icon: 'fa-circle' };

    const modalId = 'apt-detail-modal';
    // Eliminar modal previo si existe
    document.getElementById(modalId)?.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.style.cssText = [
        'position:fixed;inset:0;z-index:9999;',
        'background:rgba(0,32,80,.55);backdrop-filter:blur(4px);',
        'display:flex;align-items:flex-end;justify-content:center;',
        'animation:fadeIn .2s ease;'
    ].join('');

    overlay.innerHTML = `
    <div id="apt-detail-sheet"
         style="width:100%;max-width:480px;max-height:92vh;overflow-y:auto;
                background:#fff;border-radius:20px 20px 0 0;
                box-shadow:0 -8px 40px rgba(0,0,0,.18);
                animation:slideUp .3s cubic-bezier(.4,0,.2,1);">

        <!-- Cabecera coloreada -->
        <div style="background:var(--themePrimary);padding:20px 20px 16px;border-radius:20px 20px 0 0;position:relative;">
            <!-- Pill de arrastre -->
            <div style="width:40px;height:4px;background:rgba(255,255,255,.4);border-radius:4px;margin:0 auto 16px;"></div>
            <!-- Botón cerrar -->
            <button id="apt-detail-close"
                    style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.15);
                           border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;
                           display:flex;align-items:center;justify-content:center;color:#fff;font-size:1rem;">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <!-- Estado -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <i class="fa-solid ${statusInfo.icon}"
                   style="color:#fff;background:rgba(255,255,255,.2);padding:6px;border-radius:50%;font-size:0.8rem;"></i>
                <span style="color:rgba(255,255,255,.85);font-size:0.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">${statusInfo.label}</span>
            </div>
            <!-- Fecha y hora -->
            <div style="color:#fff;font-size:1.25rem;font-weight:800;line-height:1.2;">${timeStr}</div>
            <div style="color:rgba(255,255,255,.8);font-size:0.82rem;margin-top:4px;text-transform:capitalize;">${dateStr}</div>
            <div style="color:rgba(255,255,255,.7);font-size:0.75rem;margin-top:2px;">
                <i class="fa-regular fa-clock"></i> ${apt.duration || 30} minutos
                &nbsp;&bull;&nbsp;
                ${apt.modality === 'virtual' ? '<i class="fa-solid fa-video"></i> Virtual' : '<i class="fa-solid fa-hospital"></i> Presencial'}
            </div>
        </div>

        <!-- Cuerpo -->
        <div style="padding:16px 20px 24px;display:flex;flex-direction:column;gap:0;">

            <!-- PACIENTE -->
            <div class="apt-detail-section">
                <div class="apt-detail-section-title"><i class="fa-solid fa-hospital-user"></i> Paciente</div>
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Nombre</span>
                    <span class="apt-detail-value">${patient?.name || '—'}</span>
                </div>
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Cédula</span>
                    <span class="apt-detail-value">${patient?.docType || '?'}-${patient?.dni || '—'}</span>
                </div>
                ${patient?.phone ? `
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Teléfono</span>
                    <span class="apt-detail-value">${patient.phone}</span>
                </div>` : ''}
                ${patient?.email ? `
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Email</span>
                    <span class="apt-detail-value" style="word-break:break-all;">${patient.email}</span>
                </div>` : ''}
            </div>

            <!-- MÉDICO -->
            <div class="apt-detail-section">
                <div class="apt-detail-section-title"><i class="fa-solid fa-user-doctor"></i> Médico Tratante</div>
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Médico</span>
                    <span class="apt-detail-value">${doctor?.name || '—'}</span>
                </div>
                ${area ? `
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Área</span>
                    <span class="apt-detail-value">${area.name}</span>
                </div>` : ''}
                ${consultorio ? `
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Consultorio</span>
                    <span class="apt-detail-value">${consultorio.name}</span>
                </div>` : ''}
            </div>

            <!-- MOTIVO Y NOTAS -->
            ${(apt.reason || apt.notes) ? `
            <div class="apt-detail-section">
                <div class="apt-detail-section-title"><i class="fa-solid fa-clipboard-list"></i> Información Clínica</div>
                ${apt.reason ? `
                <div class="apt-detail-row" style="align-items:flex-start;">
                    <span class="apt-detail-label" style="padding-top:2px;">Motivo</span>
                    <span class="apt-detail-value">${apt.reason}</span>
                </div>` : ''}
                ${apt.notes ? `
                <div class="apt-detail-row" style="align-items:flex-start;">
                    <span class="apt-detail-label" style="padding-top:2px;">Notas</span>
                    <span class="apt-detail-value">${apt.notes}</span>
                </div>` : ''}
            </div>` : ''}

            <!-- RECURSOS -->
            ${(equipo || supply) ? `
            <div class="apt-detail-section">
                <div class="apt-detail-section-title"><i class="fa-solid fa-building-columns"></i> Recursos Asignados</div>
                ${equipo ? `
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Equipo</span>
                    <span class="apt-detail-value">${equipo.name}</span>
                </div>` : ''}
                ${supply ? `
                <div class="apt-detail-row">
                    <span class="apt-detail-label">Insumo</span>
                    <span class="apt-detail-value">${supply.name}</span>
                </div>` : ''}
            </div>` : ''}

            <!-- ENLACE VIRTUAL -->
            ${apt.modality === 'virtual' && apt.virtualLink ? `
            <div class="apt-detail-section">
                <div class="apt-detail-section-title"><i class="fa-solid fa-video"></i> Acceso Virtual</div>
                <div class="apt-detail-row" style="align-items:flex-start;">
                    <span class="apt-detail-label">Enlace</span>
                    <a href="${apt.virtualLink}" target="_blank"
                       style="color:var(--blue);font-size:0.78rem;word-break:break-all;flex:1;">
                        ${apt.virtualLink}
                    </a>
                </div>
            </div>` : ''}

            <!-- ACCIONES -->
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
                ${apt.modality === 'virtual' && apt.virtualLink ? `
                <a href="${apt.virtualLink}" target="_blank"
                   style="display:flex;align-items:center;justify-content:center;gap:8px;
                          background:var(--teal);color:#fff;border-radius:10px;padding:14px;
                          font-weight:700;font-size:0.9rem;text-decoration:none;">
                    <i class="fa-solid fa-video"></i> Unirse a la Reunión Virtual
                </a>` : ''}
                ${canCancel ? `
                <button id="apt-detail-cancel" data-id="${apt.id}"
                        style="display:flex;align-items:center;justify-content:center;gap:8px;
                               background:#fee2e2;color:var(--red);border:1px solid #fecaca;
                               border-radius:10px;padding:13px;font-weight:600;font-size:0.87rem;
                               cursor:pointer;">
                    <i class="fa-solid fa-ban"></i> Cancelar Cita
                </button>` : ''}
                <button id="apt-detail-close-btn"
                        style="display:flex;align-items:center;justify-content:center;gap:8px;
                               background:var(--neutralLight);color:var(--neutralPrimary);
                               border:none;border-radius:10px;padding:13px;font-weight:600;
                               font-size:0.87rem;cursor:pointer;">
                    <i class="fa-solid fa-xmark"></i> Cerrar
                </button>
            </div>

        </div>
    </div>
    `;

    document.body.appendChild(overlay);

    // Cerrar modal
    function closeModal() {
        const sheet = document.getElementById('apt-detail-sheet');
        if (sheet) sheet.style.animation = 'slideDown .25s ease forwards';
        setTimeout(() => overlay.remove(), 240);
    }

    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.getElementById('apt-detail-close')?.addEventListener('click', closeModal);
    document.getElementById('apt-detail-close-btn')?.addEventListener('click', closeModal);

    // Cancelar desde modal
    document.getElementById('apt-detail-cancel')?.addEventListener('click', async () => {
        const fecha = new Date(apt.dateTime).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        if (!await hospitalConfirm(`¿Cancelar la cita del ${fecha}?`, 'danger')) return;
        store.update('appointments', apt.id, {
            status: 'cancelled', cancelledAt: Date.now(),
            consultorioId: '', equipmentId: '', supplyId: ''
        });
        closeModal();
        onFilterChange(currentFilter);
    });
}

