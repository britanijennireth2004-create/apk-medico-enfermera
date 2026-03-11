/**
 * UI Components and Rendering logic
 */
import { calculateAge, formatTime, formatDateShort } from './utils.js';

export function renderHeader(user) {
    const nameEl = document.getElementById('header-doctor-name');
    const imgEl = document.getElementById('header-doctor-img');
    const greetingEl = document.getElementById('greeting-text');

    if (user) {
        nameEl.textContent = user.name;
        imgEl.style.backgroundImage = `url('https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=eff5f9&color=003b69')`;

        // Sidebar sync
        const sidebarName = document.getElementById('sidebar-doctor-name');
        const sidebarImg = document.getElementById('sidebar-doctor-img');
        const sidebarSpec = document.getElementById('sidebar-doctor-spec');
        if (sidebarName) sidebarName.textContent = user.name;
        if (sidebarSpec) sidebarSpec.textContent = user.specialty || 'Médico';
        if (sidebarImg) sidebarImg.style.backgroundImage = imgEl.style.backgroundImage;

        const hour = new Date().getHours();
        if (hour < 12) greetingEl.textContent = 'Buenos días,';
        else if (hour < 18) greetingEl.textContent = 'Buenas tardes,';
        else greetingEl.textContent = 'Buenas noches,';
    }
}

export function updateStatsUI(stats, unreadNotifications) {
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-pending').textContent = stats.pending;
    document.getElementById('stat-done').textContent = stats.done;

    const badge = document.getElementById('notif-badge');
    if (unreadNotifications > 0) {
        badge.classList.add('active');
        badge.style.display = 'block';
    } else {
        badge.classList.remove('active');
        badge.style.display = 'none';
    }
}

// ─── INICIO ──────────────────────────────────────────────────────────────────
export function renderHomeView(appointments, store, onOpenSheet) {
    const todayStr = new Date().toDateString();
    const sortedToday = appointments
        .filter(a => new Date(a.dateTime).toDateString() === todayStr)
        .sort((a, b) => a.dateTime - b.dateTime);

    // Próxima cita pendiente
    const next = sortedToday.find(a => a.status === 'scheduled');
    const nextSlot = document.getElementById('next-appointment-slot');

    if (next) {
        const patient = store.find('patients', next.patientId);
        const time = formatTime(next.dateTime);

        nextSlot.innerHTML = `
            <div class="next-card" id="next-apt-card">
                <div class="patient-info">
                    <div class="patient-avatar" style="background-image: url('https://ui-avatars.com/api/?name=${encodeURIComponent(patient?.name || 'P')}&background=e2e8f0&color=003b69')"></div>
                    <div class="patient-details">
                        <h3>${patient?.name || 'Paciente'}</h3>
                        <div class="patient-sub">${patient?.gender === 'F' ? 'Femenino' : 'Masculino'} • ${calculateAge(patient?.birthDate)} años</div>
                    </div>
                </div>
                <div class="appointment-time">
                    <i class="fa-regular fa-clock"></i>
                    ${time} — ${next.reason}
                </div>
                <button class="btn-primary">
                    Iniciar Consulta <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        `;
        document.getElementById('next-apt-card').onclick = () => onOpenSheet(next.id);
    } else {
        nextSlot.innerHTML = '<div class="empty-state"><i class="fa-solid fa-calendar-check"></i><br>Sin más citas pendientes hoy.</div>';
    }

    // Resumen de agenda
    const agendaList = document.getElementById('home-agenda-list');
    agendaList.innerHTML = '';

    if (sortedToday.length > 0) {
        sortedToday.forEach(apt => {
            const patient = store.find('patients', apt.patientId);
            const time = formatTime(apt.dateTime);
            const [timeVal, ampm] = time.split(' ');

            const item = document.createElement('div');
            item.className = 'agenda-item';
            item.onclick = () => onOpenSheet(apt.id);
            item.innerHTML = `
                <div class="time-block">
                    <span class="time">${timeVal}</span>
                    <span class="am-pm">${ampm || ''}</span>
                </div>
                <div class="item-details">
                    <h4>${patient?.name || '—'}</h4>
                    <p>${apt.reason}</p>
                </div>
                <div class="status-dot ${apt.status === 'scheduled' ? 'status-waiting' : 'status-done'}"></div>
            `;
            agendaList.appendChild(item);
        });
    } else {
        agendaList.innerHTML = '<div class="empty-state">Agenda vacía para hoy.</div>';
    }
}

// ─── PACIENTES ────────────────────────────────────────────────────────────────
export function renderPatientsView(patients) {
    const list = document.getElementById('patients-list');
    list.innerHTML = '';

    if (!patients.length) {
        list.innerHTML = '<div class="empty-state">No hay pacientes registrados.</div>';
        return;
    }

    patients.slice(0, 20).forEach(p => {
        const item = document.createElement('div');
        item.className = 'agenda-item';
        item.innerHTML = `
            <div class="patient-avatar" style="width:44px;height:44px;border-radius:12px;background-image:url('https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=e2e8f0&color=003b69')"></div>
            <div class="item-details">
                <h4>${p.name}</h4>
                <p>DNI: ${p.docType}-${p.dni} &nbsp;|&nbsp; ${p.phone || 'Sin teléfono'}</p>
            </div>
            <span style="font-size:0.7rem;color:var(--neutralSecondary);text-align:right;">
                ${p.bloodType || '?'}<br>
                <span style="color:${p.isActive ? 'var(--green)' : 'var(--red)'};">
                    ${p.isActive ? 'Activo' : 'Inactivo'}
                </span>
            </span>
        `;
        list.appendChild(item);
    });
}

// ─── AGENDA COMPLETA ──────────────────────────────────────────────────────────
export function renderAgendaView(appointments, store) {
    const list = document.getElementById('full-agenda-list');
    list.innerHTML = '';

    if (!appointments.length) {
        list.innerHTML = '<div class="empty-state">No hay citas en la agenda.</div>';
        return;
    }

    appointments.forEach(apt => {
        const patient = store.find('patients', apt.patientId);
        const dateStr = formatDateShort(apt.dateTime);
        const timeStr = formatTime(apt.dateTime);

        const statusColor = {
            'scheduled': 'var(--orange)',
            'completed': 'var(--green)',
            'finalized': 'var(--green)',
            'cancelled': 'var(--red)',
            'in_progress': 'var(--blue)'
        }[apt.status] || 'var(--neutralTertiary)';

        const item = document.createElement('div');
        item.className = 'agenda-item';
        item.innerHTML = `
            <div class="time-block" style="min-width:72px;">
                <span class="time">${dateStr}</span>
                <span class="am-pm">${timeStr}</span>
            </div>
            <div class="item-details">
                <h4>${patient?.name || '—'}</h4>
                <p>${apt.reason} &nbsp;•&nbsp; ${apt.modality === 'virtual' ? '🎥 Virtual' : '🏥 Presencial'}</p>
            </div>
            <div class="status-dot" style="background-color:${statusColor};"></div>
        `;
        list.appendChild(item);
    });
}

// ─── ALERTAS / MENSAJES ───────────────────────────────────────────────────────
export function renderMessagesView(messages) {
    const list = document.getElementById('messages-list');
    list.innerHTML = '';

    if (!messages.length) {
        list.innerHTML = '<div class="empty-state"><i class="fa-regular fa-bell-slash"></i><br>Sin notificaciones pendientes.</div>';
        return;
    }

    messages.forEach(m => {
        const isUnread = m.status !== 'read';
        const item = document.createElement('div');
        item.className = 'agenda-item';
        item.style.cssText = 'flex-direction:column;align-items:flex-start;' + (isUnread ? 'border-left:3px solid var(--themePrimary);' : '');
        item.innerHTML = `
            <div style="display:flex;justify-content:space-between;width:100%;margin-bottom:5px;">
                <span style="font-weight:700;color:var(--themePrimary);font-size:0.75rem;text-transform:uppercase;">${m.type}</span>
                <span style="font-size:0.72rem;color:var(--neutralSecondary);">${new Date(m.createdAt).toLocaleDateString('es-ES')}</span>
            </div>
            <h4 style="margin-bottom:5px;font-size:0.95rem;">${m.title}</h4>
            <p style="font-size:0.82rem;color:var(--neutralPrimary);line-height:1.4;">${m.content}</p>
        `;
        list.appendChild(item);
    });
}

// ─── BOTTOM SHEET ─────────────────────────────────────────────────────────────
export function updateBottomSheet(patient, appointment, medicalRecord) {
    document.getElementById('sheet-patient-name').textContent = patient.name;
    document.getElementById('sheet-patient-id').textContent = `ID: ${patient.docType}-${patient.dni} • ${patient.bloodType || '?'}`;
    document.getElementById('sheet-avatar').style.backgroundImage = `url('https://ui-avatars.com/api/?name=${encodeURIComponent(patient.name)}&background=e2e8f0&color=003b69')`;
    document.getElementById('sheet-reason').textContent = appointment.reason;

    const allergyEl = document.getElementById('sheet-allergies');
    if (patient.allergies && patient.allergies.length > 0) {
        allergyEl.innerHTML = `<span style="color:var(--red);font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Alérgico a: ${patient.allergies.join(', ')}</span>`;
    } else {
        allergyEl.textContent = 'Sin alergias conocidas.';
    }

    const vitalsEl = document.getElementById('sheet-vitals');
    if (medicalRecord && medicalRecord.vitalSigns) {
        const v = medicalRecord.vitalSigns;
        vitalsEl.innerHTML = `
            <li style="margin-bottom:6px;"><b>PA:</b> ${v.bloodPressure || '---'} mmHg</li>
            <li style="margin-bottom:6px;"><b>FC:</b> ${v.heartRate || '---'} lpm</li>
            <li style="margin-bottom:6px;"><b>Temp:</b> ${v.temperature || '---'} °C</li>
            <li><b>SPO2:</b> ${v.spo2 || '---'}%</li>
        `;
    } else {
        vitalsEl.innerHTML = '<li>No hay signos vitales registrados.</li>';
    }

    document.getElementById('overlay').classList.add('active');
    document.getElementById('bottomSheet').classList.add('active');
}

// ─── PERFIL MÉDICO ────────────────────────────────────────────────────────────
export function renderProfileView(user, doctorRecord, onSave) {
    const container = document.getElementById('profile-form-container');
    container.innerHTML = `
        <form id="profile-form">
            <div class="form-group">
                <label><i class="fa-solid fa-user" style="color:var(--themePrimary)"></i> &nbsp;Nombre Completo</label>
                <input type="text" name="name" value="${user.name}" required>
            </div>
            <div class="form-group">
                <label><i class="fa-regular fa-envelope" style="color:var(--themePrimary)"></i> &nbsp;Correo Electrónico</label>
                <input type="email" name="email" value="${user.email || ''}">
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-phone" style="color:var(--themePrimary)"></i> &nbsp;Teléfono</label>
                <input type="tel" name="phone" value="${doctorRecord?.phone || user.phone || ''}">
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-stethoscope" style="color:var(--neutralSecondary)"></i> &nbsp;Especialidad</label>
                <input type="text" value="${user.specialty || '—'}" readonly style="opacity:0.65;">
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-id-card" style="color:var(--neutralSecondary)"></i> &nbsp;Licencia / Colegiado</label>
                <input type="text" value="${doctorRecord?.license || user.license || '—'}" readonly style="opacity:0.65;">
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-hospital" style="color:var(--neutralSecondary)"></i> &nbsp;N° Sistema Salud (MPPS)</label>
                <input type="text" value="${doctorRecord?.healthSystemNumber || '—'}" readonly style="opacity:0.65;">
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-file-contract" style="color:var(--neutralSecondary)"></i> &nbsp;Tipo de Contrato</label>
                <input type="text" value="${doctorRecord?.contractType || '—'}" readonly style="opacity:0.65;">
            </div>
            <button type="submit" class="btn-save">
                <i class="fa-solid fa-floppy-disk"></i> &nbsp;Guardar Cambios
            </button>
        </form>
    `;
    document.getElementById('profile-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        onSave(Object.fromEntries(fd));
    };
}

// ─── DISPONIBILIDAD ───────────────────────────────────────────────────────────
export function renderAvailabilityView(doctor, onSave) {
    const container = document.getElementById('availability-form-container');
    container.innerHTML = `
        <form id="availability-form">
            <div class="form-group">
                <label><i class="fa-regular fa-clock" style="color:var(--themePrimary)"></i> &nbsp;Hora de Inicio</label>
                <input type="number" name="workStartHour" value="${doctor?.workStartHour ?? 8}" min="0" max="23">
            </div>
            <div class="form-group">
                <label><i class="fa-regular fa-clock" style="color:var(--orange)"></i> &nbsp;Hora de Fin</label>
                <input type="number" name="workEndHour" value="${doctor?.workEndHour ?? 17}" min="0" max="23">
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-users" style="color:var(--green)"></i> &nbsp;Cupos Diarios</label>
                <input type="number" name="dailyCapacity" value="${doctor?.dailyCapacity ?? 20}" min="1" max="100">
            </div>
            <div class="form-group">
                <label><i class="fa-regular fa-calendar" style="color:var(--themePrimary)"></i> &nbsp;Días de Consulta</label>
                <input type="text" name="schedule" value="${doctor?.schedule || 'Lun-Vie'}" placeholder="Ej: Lun, Mié, Vie">
            </div>
            <button type="submit" class="btn-save">
                <i class="fa-solid fa-rotate"></i> &nbsp;Actualizar Disponibilidad
            </button>
        </form>
    `;
    document.getElementById('availability-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        onSave(Object.fromEntries(fd));
    };
}

// ─── CONSULTA MÉDICA ──────────────────────────────────────────────────────────
export function renderConsultationView(patient, appointment, medicalRecord, onSave) {
    const container = document.getElementById('consultation-form-area');
    const lastVitals = medicalRecord?.vitalSigns;

    container.innerHTML = `
        <div class="consultation-summary">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                <div class="patient-avatar" style="width:40px;height:40px;border-radius:10px;background-image:url('https://ui-avatars.com/api/?name=${encodeURIComponent(patient.name)}&background=e2e8f0&color=003b69')"></div>
                <div>
                    <h4>${patient.name}</h4>
                    <p>${patient.docType}-${patient.dni} &nbsp;•&nbsp; ${patient.bloodType || '?'}</p>
                </div>
            </div>
            <p><b>Motivo:</b> ${appointment.reason}</p>
            ${patient.allergies?.length ? `<p style="color:var(--red);font-weight:600;margin-top:4px;"><i class="fa-solid fa-triangle-exclamation"></i> Alérgico a: ${patient.allergies.join(', ')}</p>` : ''}
        </div>

        <div class="form-container" style="margin-bottom:16px;">
            <p style="font-size:0.8rem;font-weight:600;color:var(--neutralSecondary);text-transform:uppercase;margin-bottom:12px;">Signos Vitales</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group" style="margin-bottom:0">
                    <label>PA (mmHg)</label>
                    <input type="text" id="vt-pa" value="${lastVitals?.bloodPressure || ''}" placeholder="120/80">
                </div>
                <div class="form-group" style="margin-bottom:0">
                    <label>FC (lpm)</label>
                    <input type="number" id="vt-fc" value="${lastVitals?.heartRate || ''}" placeholder="72">
                </div>
                <div class="form-group" style="margin-bottom:0">
                    <label>Temperatura (°C)</label>
                    <input type="number" step="0.1" id="vt-temp" value="${lastVitals?.temperature || ''}" placeholder="36.5">
                </div>
                <div class="form-group" style="margin-bottom:0">
                    <label>SPO2 (%)</label>
                    <input type="number" id="vt-spo2" value="${lastVitals?.spo2 || ''}" placeholder="98">
                </div>
            </div>
        </div>

        <form id="consultation-form" class="form-container">
            <div class="form-group">
                <label><i class="fa-solid fa-notes-medical" style="color:var(--themePrimary)"></i> &nbsp;Síntomas / Historia Actual</label>
                <textarea name="symptoms" rows="3" placeholder="Describa los síntomas presentados..."></textarea>
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-magnifying-glass-plus" style="color:var(--teal)"></i> &nbsp;Diagnóstico</label>
                <textarea name="diagnosis" rows="2" placeholder="Impresión diagnóstica..."></textarea>
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-clipboard-list" style="color:var(--blue)"></i> &nbsp;Tratamiento / Plan</label>
                <textarea name="treatment" rows="3" placeholder="Indicaciones, plan terapéutico..."></textarea>
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-pills" style="color:var(--orange)"></i> &nbsp;Medicamentos y Dosis</label>
                <textarea name="prescriptions" rows="2" placeholder="Medicamento, dosis, frecuencia, días..."></textarea>
            </div>
            <div class="form-group">
                <label><i class="fa-regular fa-calendar-check" style="color:var(--green)"></i> &nbsp;Próxima Cita / Seguimiento</label>
                <input type="text" name="followUp" placeholder="Ej: Control en 15 días">
            </div>
            <button type="submit" class="btn-save" style="background:var(--green);">
                <i class="fa-solid fa-circle-check"></i> &nbsp;Finalizar y Guardar Consulta
            </button>
        </form>
    `;

    document.getElementById('consultation-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const vitalSigns = {
            bloodPressure: document.getElementById('vt-pa').value,
            heartRate: parseInt(document.getElementById('vt-fc').value) || null,
            temperature: parseFloat(document.getElementById('vt-temp').value) || null,
            spo2: parseInt(document.getElementById('vt-spo2').value) || null
        };
        onSave({ ...Object.fromEntries(fd), vitalSigns });
    };
}

// ─── NUEVA CITA (completo, igual que versión web) ──────────────────────────
export function renderNewAppointmentView(patients, doctors, currentDoctor, onSave, store) {
    const container = document.getElementById('new-appointment-form-container');
    const today = new Date().toISOString().split('T')[0];
    const areas = store ? (store.get('areas') || []) : [];
    const rooms = store ? (store.get('consultorios') || []) : [];

    container.innerHTML = `
        <form id="new-apt-form" autocomplete="off">

            <!-- ── 1. INFORMACIÓN DEL PACIENTE ───────────────────── -->
            <div class="apt-form-section">
                <div class="apt-section-header forest">
                    <i class="fa-solid fa-hospital-user"></i> INFORMACIÓN DE LA CITA
                </div>
                <div class="form-group">
                    <label>Buscar Paciente por Cédula</label>
                    <div style="display:flex;gap:0;">
                        <select id="apt-doc-type" style="width:68px;border-radius:8px 0 0 8px;border-right:none;padding:12px 8px;">
                            <option value="V">V</option>
                            <option value="E">E</option>
                            <option value="J">J</option>
                            <option value="P">P</option>
                        </select>
                        <input type="text" id="apt-cedula" placeholder="Número de cédula..." style="border-radius:0 8px 8px 0; flex:1; padding:12px 14px;">
                    </div>
                    <div id="apt-patient-feedback" style="margin-top:8px;font-size:0.82rem;"></div>
                    <input type="hidden" id="apt-patient-id" name="patientId">
                </div>

                <div class="form-group" id="apt-patient-name-group" style="display:none;">
                    <label>Nombre del Paciente</label>
                    <input type="text" id="apt-patient-name" placeholder="Nombre completo..." readonly style="opacity:0.8;">
                </div>

                <!-- Selector alternativo por lista -->
                <div class="form-group">
                    <label>O seleccionar de la lista</label>
                    <select id="apt-patient-select">
                        <option value="">— Seleccionar paciente —</option>
                        ${patients.map(p => `<option value="${p.id}" data-dni="${p.docType}-${p.dni}" data-name="${p.name}">${p.name} (${p.docType}-${p.dni})</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label>Médico Tratante *</label>
                    <select id="apt-doctor" name="doctorId" required>
                        <option value="">— Seleccionar médico —</option>
                        ${doctors.map(d => `<option value="${d.id}" ${d.id === currentDoctor?.id ? 'selected' : ''}>${d.name} • ${d.specialty || ''}</option>`).join('')}
                    </select>
                </div>

                ${areas.length ? `
                <div class="form-group">
                    <label>Área / Servicio *</label>
                    <select id="apt-area" name="areaId">
                        <option value="">— Seleccionar área —</option>
                        ${areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                    </select>
                </div>` : ''}
            </div>

            <!-- ── 2. MODALIDAD ────────────────────────────────────── -->
            <div class="apt-form-section">
                <div class="apt-section-header purple">
                    <i class="fa-solid fa-video"></i> MODALIDAD DE ATENCIÓN
                </div>
                <div class="form-group">
                    <label>Tipo de Consulta *</label>
                    <select id="apt-modality" name="modality">
                        <option value="presential">🏥 Presencial</option>
                        <option value="virtual">🎥 Virtual / Telemedicina</option>
                    </select>
                </div>
                <div class="form-group" id="apt-link-group" style="display:none;">
                    <label>Enlace de Reunión Virtual</label>
                    <input type="url" name="virtualLink" id="apt-virtual-link" placeholder="https://meet.google.com/...">
                    <div style="font-size:0.75rem;color:var(--neutralSecondary);margin-top:4px;">
                        Se generará automáticamente o ingrese uno manualmente.
                    </div>
                </div>
            </div>

            <!-- ── 3. FECHA Y HORA ─────────────────────────────────── -->
            <div class="apt-form-section">
                <div class="apt-section-header gold">
                    <i class="fa-regular fa-calendar"></i> FECHA Y HORA
                </div>
                <div class="form-group">
                    <label>Fecha *</label>
                    <input type="date" id="apt-date" name="date" min="${today}" required>
                </div>
                <div class="form-group">
                    <label>Hora Disponible *</label>
                    <select id="apt-time" name="time" required>
                        <option value="">Seleccione médico y fecha primero</option>
                    </select>
                    <div id="apt-time-info" style="font-size:0.75rem;color:var(--neutralSecondary);margin-top:4px;"></div>
                </div>
                <div class="form-group">
                    <label>Duración *</label>
                    <select name="duration">
                        <option value="15">15 minutos</option>
                        <option value="30" selected>30 minutos</option>
                        <option value="45">45 minutos</option>
                        <option value="60">60 minutos (1 hora)</option>
                    </select>
                </div>
            </div>

            <!-- ── 4. RECURSOS ────────────────────────────────────── -->
            <div class="apt-form-section">
                <div class="apt-section-header blue">
                    <i class="fa-solid fa-building-columns"></i> RECURSOS ASOCIADOS
                </div>
                <div class="form-group">
                    <label>Consultorio</label>
                    <select name="consultorioId" id="apt-consultorio">
                        <option value="">Sin consultorio asignado</option>
                        ${rooms.map(r => `<option value="${r.id}">${r.name} — ${r.area || ''}</option>`).join('')}
                    </select>
                    <div id="apt-consultorio-info" style="font-size:0.75rem;color:var(--neutralSecondary);margin-top:4px;">
                        Seleccione fecha y hora para ver disponibilidad
                    </div>
                </div>
            </div>

            <!-- ── 5. INFORMACIÓN ADICIONAL ───────────────────────── -->
            <div class="apt-form-section">
                <div class="apt-section-header olive">
                    <i class="fa-solid fa-clipboard-list"></i> INFORMACIÓN ADICIONAL
                </div>
                <div class="form-group">
                    <label>Motivo de la Consulta</label>
                    <textarea name="reason" id="apt-reason" rows="3" placeholder="Describa el motivo..."></textarea>
                </div>
                <div class="form-group">
                    <label>Notas Adicionales</label>
                    <textarea name="notes" rows="2" placeholder="Observaciones, indicaciones previas..."></textarea>
                </div>
            </div>

            <button type="submit" class="btn-save" style="margin-bottom:8px;">
                <i class="fa-solid fa-calendar-check"></i> &nbsp;Registrar Cita
            </button>
        </form>
    `;

    // ----- Lógica de búsqueda por cédula -----
    const cedulaInput = document.getElementById('apt-cedula');
    const patientSelect = document.getElementById('apt-patient-select');
    const hiddenId = document.getElementById('apt-patient-id');
    const feedback = document.getElementById('apt-patient-feedback');
    const nameGroup = document.getElementById('apt-patient-name-group');
    const nameInput = document.getElementById('apt-patient-name');

    function fillPatient(p) {
        if (!p) {
            feedback.innerHTML = '<span style="color:var(--red)">Paciente no encontrado.</span>';
            nameGroup.style.display = 'none';
            hiddenId.value = '';
            return;
        }
        hiddenId.value = p.id;
        nameInput.value = p.name;
        nameGroup.style.display = '';
        feedback.innerHTML = `<span style="color:var(--green)"><i class="fa-solid fa-circle-check"></i> Paciente encontrado.</span>`;
        patientSelect.value = p.id;
    }

    cedulaInput.addEventListener('blur', () => {
        const dni = cedulaInput.value.trim();
        if (!dni) return;
        const docType = document.getElementById('apt-doc-type').value;
        const p = patients.find(x => x.dni == dni && x.docType === docType);
        fillPatient(p);
    });

    patientSelect.addEventListener('change', () => {
        const p = patients.find(x => x.id === patientSelect.value);
        if (p) {
            cedulaInput.value = p.dni;
            document.getElementById('apt-doc-type').value = p.docType;
            fillPatient(p);
        }
    });

    // ----- Mostrar/ocultar enlace virtual -----
    const modalitySelect = document.getElementById('apt-modality');
    const linkGroup = document.getElementById('apt-link-group');
    modalitySelect.addEventListener('change', () => {
        linkGroup.style.display = modalitySelect.value === 'virtual' ? '' : 'none';
    });

    // ----- Cargar slots de hora al cambiar médico o fecha -----
    const doctorSelect = document.getElementById('apt-doctor');
    const dateInput = document.getElementById('apt-date');
    const timeSelect = document.getElementById('apt-time');
    const timeInfo = document.getElementById('apt-time-info');

    function loadSlots() {
        const doctorId = doctorSelect.value;
        const date = dateInput.value;
        if (!doctorId || !date) {
            timeSelect.innerHTML = '<option value="">Seleccione médico y fecha primero</option>';
            return;
        }
        const doctor = doctors.find(d => d.id === doctorId);
        if (!doctor) return;

        const startH = doctor.workStartHour ?? 8;
        const endH = doctor.workEndHour ?? 17;
        const slots = [];
        for (let h = startH; h < endH; h++) {
            slots.push(`${String(h).padStart(2, '0')}:00`);
            slots.push(`${String(h).padStart(2, '0')}:30`);
        }

        timeSelect.innerHTML = slots.map(s => `<option value="${s}">${s}</option>`).join('');
        timeInfo.textContent = `${slots.length} horarios disponibles entre ${startH}:00 y ${endH}:00`;
    }

    doctorSelect.addEventListener('change', loadSlots);
    dateInput.addEventListener('change', loadSlots);

    // ----- Submit -----
    document.getElementById('new-apt-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
        // Asegurar que el patientId provenga del hidden
        data.patientId = data.patientId || hiddenId.value || patientSelect.value;
        if (!data.patientId) {
            feedback.innerHTML = '<span style="color:var(--red)"><i class="fa-solid fa-triangle-exclamation"></i> Seleccione un paciente.</span>';
            return;
        }
        onSave(data);
    };
}

// ─── MIS CITAS (completo, con búsqueda y acciones) ───────────────────────────
export function renderMyAppointmentsView(appointments, store, currentFilter, onFilterChange) {
    const list = document.getElementById('my-appointments-list');
    const tabsEl = document.getElementById('my-appointments-tabs');

    // Activar pestaña correcta
    if (tabsEl) {
        tabsEl.querySelectorAll('.appt-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === currentFilter);
            tab.onclick = () => onFilterChange(tab.dataset.filter);
        });
    }

    // Filtrar citas
    const filtered = currentFilter === 'all'
        ? appointments
        : appointments.filter(a => a.status === currentFilter);

    // Mapa de estados
    const statusLabels = {
        'scheduled': { label: 'Pendiente', cls: 'appt-status-scheduled' },
        'confirmed': { label: 'Confirmada', cls: 'appt-status-in_progress' },
        'in_progress': { label: 'En curso', cls: 'appt-status-in_progress' },
        'completed': { label: 'Atendida', cls: 'appt-status-completed' },
        'finalized': { label: 'Finalizada', cls: 'appt-status-finalized' },
        'cancelled': { label: 'Cancelada', cls: 'appt-status-cancelled' }
    };

    list.innerHTML = '';

    if (!filtered.length) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-calendar-xmark"></i><br>
                No hay citas ${currentFilter === 'all' ? 'registradas.' : 'con este estado.'}<br>
                <a href="#" onclick="app.navigate('new-appointment'); return false;"
                   style="color:var(--themePrimary);font-weight:600;font-size:0.85rem;text-decoration:none;margin-top:12px;display:inline-block;">
                    <i class="fa-solid fa-circle-plus"></i> Nueva Cita
                </a>
            </div>`;
        return;
    }

    filtered.forEach(apt => {
        const patient = store.find('patients', apt.patientId);
        const dt = new Date(apt.dateTime);
        const dateStr = dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const st = statusLabels[apt.status] || { label: apt.status, cls: 'appt-status-scheduled' };
        const canCancel = apt.status === 'scheduled' || apt.status === 'confirmed';

        const item = document.createElement('div');
        item.className = 'agenda-item my-apt-card';
        item.style.cssText = 'flex-direction:column;align-items:flex-start;gap:10px;';
        item.innerHTML = `
            <!-- Fila superior: fecha + estado -->
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                <div style="display:flex;gap:10px;align-items:center;">
                    <div class="time-block" style="min-width:60px;text-align:center;">
                        <span class="time">${timeStr}</span>
                        <span class="am-pm">${dateStr}</span>
                    </div>
                    <div>
                        <div style="font-weight:700;font-size:0.95rem;color:var(--neutralDark);">${patient?.name || '—'}</div>
                        <div style="font-size:0.75rem;color:var(--neutralSecondary);">
                            ${patient?.docType || ''}-${patient?.dni || '—'} 
                            &nbsp;•&nbsp; 
                            ${apt.modality === 'virtual' ? '🎥 Virtual' : '🏥 Presencial'}
                        </div>
                    </div>
                </div>
                <span class="appt-status-badge ${st.cls}">${st.label}</span>
            </div>

            <!-- Motivo -->
            ${apt.reason ? `
            <div style="font-size:0.8rem;color:var(--neutralSecondary);padding-left:70px;margin-top:-4px;">
                <i class="fa-solid fa-notes-medical" style="color:var(--themeTertiary);margin-right:4px;"></i>
                ${apt.reason}
            </div>` : ''}

            <!-- Acciones -->
            <div style="display:flex;gap:8px;padding-left:70px;flex-wrap:wrap;">
                ${apt.modality === 'virtual' && apt.virtualLink ? `
                    <a href="${apt.virtualLink}" target="_blank" class="apt-action-btn apt-action-virtual">
                        <i class="fa-solid fa-video"></i> Unirse
                    </a>` : ''}
                ${canCancel ? `
                    <button class="apt-action-btn apt-action-cancel" data-id="${apt.id}">
                        <i class="fa-solid fa-ban"></i> Cancelar
                    </button>` : ''}
                <button class="apt-action-btn apt-action-detail" data-id="${apt.id}">
                    <i class="fa-solid fa-eye"></i> Ver detalle
                </button>
            </div>
        `;
        list.appendChild(item);
    });

    // Eventos de acciones
    list.querySelectorAll('.apt-action-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('¿Desea cancelar esta cita?')) {
                store.update('appointments', btn.dataset.id, { status: 'cancelled' });
                onFilterChange(currentFilter);
            }
        });
    });

    list.querySelectorAll('.apt-action-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            const apt = store.find('appointments', btn.dataset.id);
            const patient = apt ? store.find('patients', apt.patientId) : null;
            if (!apt || !patient) return;

            const dt = new Date(apt.dateTime);
            const dateStr = dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const stLabel = {
                'scheduled': 'Pendiente', 'confirmed': 'Confirmada', 'in_progress': 'En curso',
                'completed': 'Atendida', 'finalized': 'Finalizada', 'cancelled': 'Cancelada'
            }[apt.status] || apt.status;

            alert([
                `📋 DETALLE DE CITA`,
                `———————————————`,
                `Paciente: ${patient.name}`,
                `DNI: ${patient.docType}-${patient.dni}`,
                `Fecha: ${dateStr} a las ${timeStr}`,
                `Modalidad: ${apt.modality === 'virtual' ? 'Virtual' : 'Presencial'}`,
                `Motivo: ${apt.reason || '—'}`,
                `Estado: ${stLabel}`,
                apt.notes ? `Notas: ${apt.notes}` : ''
            ].filter(Boolean).join('\n'));
        });
    });
}

