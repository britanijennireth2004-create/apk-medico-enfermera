/**
 * Main Application Orchestrator for Doctor APK
 */
import { createBus } from './core/bus.js';
import { createStore } from './core/store.js';
import * as UI from './ui.js';
import { mountNewAppointmentForm, renderMyAppointmentsView } from './appointments.js';
import { mountNotifications } from './notifications.js';
import { mountClinical } from './clinical.js';
import { mountTriaje } from './triaje.js';
import { mountTreatments } from './treatments.js';

class DoctorApp {
    constructor() {
        this.bus = null;
        this.store = null;
        this.user = null;   // user record
        this.doctorRecord = null;   // doctors[] record
        this.currentView = 'login';
        this.currentAppointmentId = null;
        this.currentPatient = null;
    }

    // ── INIT ────────────────────────────────────────────────────────────────
    async init() {
        this.bus = createBus();
        this.store = await createStore(this.bus);

        // Auto-login como médico
        const users = this.store.get('users');
        this.user = users.find(u => u.role === 'doctor') || users[0];
        const doctors = this.store.get('doctors');
        this.doctorRecord = doctors.find(d => d.id === this.user.doctorId) || doctors[0];

        // Mostrar App Container pero ocultar Header/BottomNav inicialmente si estamos en login
        document.querySelector('.app-container').style.display = 'flex';
        this.updateChromeVisibility();

        // Esperar 3 segundos (según requerimiento del usuario)
        await new Promise(res => setTimeout(res, 3000));

        // Ocultar splash
        const loader = document.getElementById('loading-screen');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 800);
        }

        this.navigate('login');
        setInterval(() => this.updateStats(), 30000);
    }

    updateChromeVisibility() {
        const isLogin = this.currentView === 'login';
        const header = document.querySelector('.header');
        const bottomNav = document.querySelector('.bottom-nav');
        if (header) header.style.display = isLogin ? 'none' : 'flex';
        if (bottomNav) bottomNav.style.display = isLogin ? 'none' : 'flex';
    }

    // ── NAVIGATION ──────────────────────────────────────────────────────────
    setupNavigation() {
        // Bottom nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => this.navigate(item.dataset.view));
        });

        // Botón de notificaciones (campana)
        document.getElementById('notif-btn')?.addEventListener('click', () => {
            this.navigate('messages');
        });

        // Overlay cierra el bottom sheet
        document.getElementById('overlay').onclick = () => this.closeSheet();

        // "Ver todas" links
        document.querySelectorAll('[data-view-target]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigate(el.dataset.viewTarget);
            });
        });
    }

    setupSidebar() {
        const toggle = document.getElementById('menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        toggle.onclick = () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        };

        // Items de navegación directa
        document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigate(item.dataset.view);
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            });
        });

        // Acordeón de Citas
        const accBtn = document.getElementById('accordion-citas-btn');
        const accContent = document.getElementById('accordion-citas-content');
        const accContainer = document.getElementById('accordion-citas');

        if (accBtn) {
            accBtn.addEventListener('click', () => {
                const isOpen = accContainer.classList.toggle('open');
                // Si se abre, asegurarnos de que la vista de Mis Citas se precargue
                if (isOpen && this.currentView !== 'new-appointment' && this.currentView !== 'my-appointments') {
                    // No navegamos, solo abrimos el sub-menú
                }
            });
        }
    }

    navigate(viewId) {
        this.currentView = viewId;

        // Bottom nav highlight
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewId);
        });

        // Sidebar highlight (mismo comportamiento que .nav-btn.active en la web)
        document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewId);
        });

        // Si se navega a una sub-vista de Citas, mantener el acordeón abierto
        const citasViews = ['new-appointment', 'my-appointments'];
        const accContainer = document.getElementById('accordion-citas');
        if (accContainer) {
            accContainer.classList.toggle('open', citasViews.includes(viewId));
        }

        // Mostrar / ocultar vistas
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${viewId}`);
        });

        // Ocultar stats bar en vistas de formulario
        const hidStats = ['profile', 'availability', 'consultation', 'new-appointment', 'my-appointments', 'patients', 'triaje', 'treatments', 'login'];
        document.getElementById('global-stats').style.display =
            hidStats.includes(viewId) ? 'none' : '';

        this.updateChromeVisibility();
        this.renderCurrentView();
    }

    renderCurrentView() {
        switch (this.currentView) {
            case 'login': this.renderLogin(); break;
            case 'home': this.renderHome(); break;
            case 'patients': this.renderPatients(); break;
            case 'agenda': this.renderAgenda(); break;
            case 'messages': this.renderMessages(); break;
            case 'profile': this.renderProfile(); break;
            case 'availability': this.renderAvailability(); break;
            case 'consultation': this.renderConsultation(); break;
            case 'new-appointment': this.renderNewAppointment(); break;
            case 'my-appointments': this.renderMyAppointments(); break;
            case 'triaje': this.renderTriaje(); break;
            case 'treatments': this.renderTreatments(); break;
        }
    }

    async refreshAll() {
        UI.renderHeader(this.user);
        this.updateStats();
        this.renderHome();
    }

    // ── STATS ───────────────────────────────────────────────────────────────
    updateStats() {
        const appointments = this.store.get('appointments');
        const mine = appointments.filter(a => a.doctorId === this.doctorRecord?.id);
        const todayStr = new Date().toDateString();
        const today = mine.filter(a => new Date(a.dateTime).toDateString() === todayStr);

        UI.updateStatsUI({
            total: today.length,
            pending: today.filter(a => a.status === 'scheduled').length,
            done: today.filter(a => ['completed', 'finalized'].includes(a.status)).length
        }, this._countUnread());
    }

    _countUnread() {
        const uid = this.user?.id;
        const did = this.doctorRecord?.id;
        const role = this.user?.role || 'doctor';

        const isForMe = item =>
            item.recipientId === uid || item.recipientId === did ||
            item.recipientRole === role;

        const msgs = (this.store.get('messages') || []).filter(m => isForMe(m) && m.createdBy !== uid && m.status !== 'read').length;
        const notifs = (this.store.get('notifications') || []).filter(n => isForMe(n) && n.status !== 'read').length;
        const reminders = (this.store.get('reminders') || []).filter(r => isForMe(r) && r.status !== 'read').length;
        return msgs + notifs + reminders;
    }


    // ── RENDER VIEWS ────────────────────────────────────────────────────────
    renderHome() {
        const all = this.store.get('appointments');
        const mine = all.filter(a => a.doctorId === this.doctorRecord?.id);
        UI.renderHomeView(mine, this.store, (id) => this.openSheet(id));
    }

    renderLogin() {
        const btn = document.getElementById('btn-login-submit');
        if (!btn) return;

        const eyeBtn = document.getElementById('eye-login');
        if (eyeBtn) {
            eyeBtn.onclick = () => {
                const passInput = document.getElementById('login-password');
                const isPassword = passInput.type === 'password';
                passInput.type = isPassword ? 'text' : 'password';
                const eyeOffSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
                const eyeSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
                eyeBtn.innerHTML = isPassword ? eyeOffSVG : eyeSVG;
            };
        }

        const recoverLink = document.getElementById('recover-link');
        const modalOverlay = document.getElementById('recover-modal-overlay');
        const modalClose = document.getElementById('recover-modal-close');
        const modalBody = document.getElementById('recover-modal-body');

        // Íconos SVG para el modal
        const icons = {
            mail: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
            shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
            key: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
            check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
        };

        if (recoverLink && modalOverlay) {
            recoverLink.onclick = (e) => {
                e.preventDefault();
                modalOverlay.style.display = 'flex';
                this.renderRecoverStep('email', modalBody, icons);
            };

            modalClose.onclick = () => {
                modalOverlay.style.display = 'none';
            };
        }

        btn.onclick = () => {
            const userIn = document.getElementById('login-username').value;
            const passIn = document.getElementById('login-password').value;

            // Validación básica para prototipo
            if (userIn && passIn) {
                // Simular carga
                btn.innerHTML = 'Validando...';
                btn.disabled = true;

                setTimeout(async () => {
                    const users = this.store.get('users');
                    const found = users.find(u => u.username === userIn && u.password === passIn);

                    if (found) {
                        this.user = found;
                        const doctors = this.store.get('doctors');
                        this.doctorRecord = doctors.find(d => d.id === this.user.doctorId) || doctors[0];

                        this.setupNavigation();
                        this.setupSidebar();
                        await this.refreshAll();
                        this.navigate('home');
                    } else {
                        alert('Credenciales inválidas. Intente con daruiz / demo123');
                        btn.innerText = 'INGRESAR AL SISTEMA';
                        btn.disabled = false;
                    }
                }, 1000);
            }
        };
    }

    renderPatients() {
        const root = document.getElementById('clinical-root');
        if (!root) return;
        mountClinical(root, {
            store: this.store,
            user: this.user
        });
    }

    renderAgenda() {
        const all = this.store.get('appointments');
        const mine = all
            .filter(a => a.doctorId === this.doctorRecord?.id)
            .sort((a, b) => a.dateTime - b.dateTime);
        UI.renderAgendaView(mine, this.store);
    }

    renderMessages() {
        const root = document.getElementById('messages-list');
        if (!root) return;
        mountNotifications(root, {
            store: this.store,
            user: this.user
        });
    }

    renderTriaje() {
        const root = document.getElementById('triaje-root');
        if (!root) return;
        mountTriaje(root, {
            store: this.store,
            user: this.user
        });
    }

    renderTreatments() {
        const root = document.getElementById('treatments-root');
        if (!root) return;
        mountTreatments(root, {
            store: this.store,
            user: this.user
        });
    }

    renderProfile() {
        UI.renderProfileView(this.user, this.doctorRecord, (data) => {
            alert(`✅ Perfil actualizado:\n• Nombre: ${data.name}\n• Email: ${data.email}\n• Teléfono: ${data.phone}`);
        });
    }

    renderAvailability() {
        UI.renderAvailabilityView(this.doctorRecord, (data) => {
            alert(`✅ Disponibilidad actualizada:\n• Jornada: ${data.workStartHour}:00 – ${data.workEndHour}:00\n• Cupos: ${data.dailyCapacity} por día`);
        });
    }

    renderConsultation() {
        if (!this.currentPatient || !this.currentAppointmentId) {
            document.getElementById('consultation-form-area').innerHTML =
                '<div class="empty-state">Selecciona primero una cita desde la agenda.</div>';
            return;
        }
        const appointment = this.store.find('appointments', this.currentAppointmentId);
        const medicalRecord = (this.store.get('clinicalRecords') || [])
            .find(r => r.patientId === this.currentPatient.id);

        UI.renderConsultationView(this.currentPatient, appointment, medicalRecord, (data) => {
            // Guardar registro clínico en el store
            this.store.add('clinicalRecords', {
                patientId: this.currentPatient.id,
                doctorId: this.doctorRecord.id,
                appointmentId: this.currentAppointmentId,
                date: Date.now(),
                type: 'consultation',
                vitalSigns: data.vitalSigns,
                symptoms: data.symptoms,
                diagnosis: data.diagnosis,
                treatment: data.treatment,
                prescriptions: [{ medication: data.prescriptions }],
                followUp: data.followUp,
                status: 'finalized',
                createdAt: Date.now(),
                createdBy: this.user.id
            });
            // Marcar la cita como finalizada
            this.store.update('appointments', this.currentAppointmentId, { status: 'finalized' });
            alert(`\u2705 Consulta guardada exitosamente para ${this.currentPatient.name}.`);
            this.navigate('home');
        });
    }

    // ── NUEVA CITA ───────────────────────────────────────────────────────────
    renderNewAppointment() {
        // Usa mountNewAppointmentForm del módulo de citas (misma lógica que la versión web)
        mountNewAppointmentForm({
            store: this.store,
            doctorRecord: this.doctorRecord,
            user: this.user,
            onSave: (newApt) => {
                this.store.add('appointments', newApt);
                const dt = new Date(newApt.dateTime);
                const dateStr = dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
                const timeStr = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                alert(`✅ Cita registrada para el ${dateStr} a las ${timeStr}.`);
                this.navigate('my-appointments');
            }
        });
    }

    // ── MIS CITAS ────────────────────────────────────────────────────────────
    renderMyAppointments(filter = 'all') {
        const all = this.store.get('appointments');
        const mine = all
            .filter(a => a.doctorId === this.doctorRecord?.id)
            .sort((a, b) => b.dateTime - a.dateTime);

        // Usa renderMyAppointmentsView del módulo de citas
        renderMyAppointmentsView(mine, this.store, filter, (newFilter) => {
            this.renderMyAppointments(newFilter);
        });
    }

    // ── BOTTOM SHEET ────────────────────────────────────────────────────────
    openSheet(appointmentId) {
        const appointment = this.store.find('appointments', appointmentId);
        const patient = this.store.find('patients', appointment.patientId);
        const medicalRecord = (this.store.get('clinicalRecords') || [])
            .find(r => r.patientId === patient.id);

        this.currentPatient = patient;
        this.currentAppointmentId = appointmentId;

        UI.updateBottomSheet(patient, appointment, medicalRecord);
    }

    closeSheet() {
        document.getElementById('overlay').classList.remove('active');
        document.getElementById('bottomSheet').classList.remove('active');
        // También cierra el sidebar si estaba abierto
        document.getElementById('sidebar').classList.remove('active');
    }

    startConsultation() {
        this.closeSheet();
        this.navigate('consultation');
    }

    renderRecoverStep(step, bodyEl, icons) {
        if (!bodyEl) return;

        if (step === 'email') {
            bodyEl.innerHTML = `
              <div class="auth-rec">
                <div class="auth-rec-head">
                  <span class="auth-rec-ico">${icons.mail}</span>
                  <h3>Recuperar Acceso</h3>
                  <p>Ingrese el correo electrónico asociado a su cuenta para buscarla en el sistema</p>
                </div>
                <form id="rec-email-form">
                  <div class="login-field">
                    <label class="login-label" for="rec-email">Correo electrónico</label>
                    <input class="login-input" type="email" id="rec-email" placeholder="ejemplo@hospital.com" required />
                  </div>
                  <div id="rec-error" class="auth-msg auth-err" style="display:none;"></div>
                  <button type="submit" class="login-submit-btn" style="width:100%; margin-top:20px;">BUSCAR CUENTA</button>
                </form>
              </div>`;
            document.getElementById('rec-email-form').onsubmit = (e) => {
                e.preventDefault();
                const mail = document.getElementById('rec-email').value;
                const users = this.store.get('users');
                const p = this.store.get('patients');
                const matchedUser = [...users, ...p].find(u => u.email === mail);
                if (matchedUser) {
                    this.recoveryUser = matchedUser;
                    this.renderRecoverStep('verify', bodyEl, icons);
                } else {
                    const err = document.getElementById('rec-error');
                    err.innerHTML = 'No se encontró ninguna cuenta con ese correo.';
                    err.style.display = 'flex';
                }
            };
        } else if (step === 'verify') {
            bodyEl.innerHTML = `
              <div class="auth-rec">
                <div class="auth-rec-head">
                  <span class="auth-rec-ico">${icons.shield}</span>
                  <h3>Verificación de Identidad</h3>
                  <p>Cuenta encontrada: <strong>${this.recoveryUser.name || 'Usuario'}</strong><br>Para verificar su identidad, ingrese su nombre de usuario registrado</p>
                </div>
                <form id="rec-verify-form">
                  <div class="login-field">
                    <label class="login-label" for="verify-user">Nombre de usuario</label>
                    <input class="login-input" type="text" id="verify-user" placeholder="Ingrese su nombre de usuario" required />
                  </div>
                  <div id="verify-error" class="auth-msg auth-err" style="display:none;"></div>
                  <button type="submit" class="login-submit-btn" style="width:100%; margin-top:20px;">VERIFICAR IDENTIDAD</button>
                </form>
              </div>`;
            document.getElementById('rec-verify-form').onsubmit = (e) => {
                e.preventDefault();
                const userIn = document.getElementById('verify-user').value;
                if (userIn === this.recoveryUser.username || userIn === this.recoveryUser.id) {
                    this.renderRecoverStep('reset', bodyEl, icons);
                } else {
                    const err = document.getElementById('verify-error');
                    err.innerHTML = 'El nombre de usuario no coincide.';
                    err.style.display = 'flex';
                }
            };
        } else if (step === 'reset') {
            bodyEl.innerHTML = `
              <div class="auth-rec">
                <div class="auth-rec-head">
                  <span class="auth-rec-ico">${icons.key}</span>
                  <h3>Nueva Contraseña</h3>
                  <p>Establezca una nueva contraseña para la cuenta de <strong>${this.recoveryUser.name || 'Usuario'}</strong></p>
                </div>
                <form id="rec-reset-form">
                  <div class="login-field">
                    <label class="login-label" for="new-pass">Nueva contraseña</label>
                    <div class="auth-pw-wrap">
                      <input class="login-input" type="password" id="new-pass" placeholder="Mínimo 6 caracteres" required minlength="6" style="padding-right:2.5rem;" />
                    </div>
                  </div>
                  <div class="login-field">
                    <label class="login-label" for="confirm-pass">Confirmar contraseña</label>
                    <div class="auth-pw-wrap">
                      <input class="login-input" type="password" id="confirm-pass" placeholder="Repita la contraseña" required minlength="6" style="padding-right:2.5rem;" />
                    </div>
                  </div>
                  <div id="reset-error" class="auth-msg auth-err" style="display:none;"></div>
                  <button type="submit" class="login-submit-btn" style="width:100%; margin-top:20px;">CAMBIAR CONTRASEÑA</button>
                </form>
              </div>`;
            document.getElementById('rec-reset-form').onsubmit = (e) => {
                e.preventDefault();
                const v1 = document.getElementById('new-pass').value;
                const v2 = document.getElementById('confirm-pass').value;
                const err = document.getElementById('reset-error');
                if (v1 !== v2) {
                    err.innerHTML = 'Las contraseñas no coinciden.';
                    err.style.display = 'flex';
                } else {
                    this.renderRecoverStep('success', bodyEl, icons);
                }
            };
        } else if (step === 'success') {
            bodyEl.innerHTML = `
              <div class="auth-rec">
                <div class="auth-rec-head">
                  <span class="auth-rec-ico auth-ico-ok">${icons.check}</span>
                  <h3>¡Contraseña Actualizada!</h3>
                  <p>Su contraseña ha sido cambiada exitosamente.<br>Ya puede iniciar sesión con su nueva contraseña.</p>
                </div>
                <button class="login-submit-btn" id="close-success-btn" style="width:100%; margin-top:20px;">VOLVER AL LOGIN</button>
              </div>`;
            document.getElementById('close-success-btn').onclick = () => {
                document.getElementById('recover-modal-overlay').style.display = 'none';
            };
        }
    }
}

// Instancia global para eventos inline
window.app = new DoctorApp();
window._apkApp = window.app;   // alias usado desde el módulo de citas
document.addEventListener('DOMContentLoaded', () => window.app.init());
