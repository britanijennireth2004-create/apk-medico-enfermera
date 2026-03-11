/**
 * APK Main Module - Doctor View
 * Logic for mobile application specifically for doctors
 */

import { createBus } from './js/core/bus.js';
import { createStore } from './js/core/store.js';

class DoctorApp {
    constructor() {
        this.bus = null;
        this.store = null;
        this.user = null;
        this.currentPatient = null;
        this.currentView = 'home';
    }

    async init() {
        // 1. Initialize Core
        this.bus = createBus();
        this.store = await createStore(this.bus);

        // 2. Auto-login as Doctor (Dra. Ana Ruiz by default for this prototype)
        const users = this.store.get('users');
        this.user = users.find(u => u.role === 'doctor') || users[0];

        // 3. Setup Navigation
        this.setupNavigation();

        // 4. Initial Render
        await this.refreshAll();

        // Hide loading
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
        }, 500);

        // Periodically refresh stats
        setInterval(() => this.updateStats(), 30000);
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                this.navigate(view);
            });
        });

        document.getElementById('overlay').onclick = () => this.closeSheet();
    }

    navigate(viewId) {
        this.currentView = viewId;

        // Update Nav UI
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewId);
        });

        // Update View Display
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${viewId}`);
        });

        // Specific View Logic
        if (viewId === 'home') this.renderHome();
        if (viewId === 'patients') this.renderPatients();
        if (viewId === 'agenda') this.renderAgenda();
        if (viewId === 'messages') this.renderMessages();
    }

    async refreshAll() {
        this.updateHeader();
        this.updateStats();
        this.renderHome();
    }

    updateHeader() {
        const nameEl = document.getElementById('header-doctor-name');
        const imgEl = document.getElementById('header-doctor-img');
        const greetingEl = document.getElementById('greeting-text');

        if (this.user) {
            nameEl.textContent = this.user.name;
            imgEl.style.backgroundImage = `url('https://ui-avatars.com/api/?name=${encodeURIComponent(this.user.name)}&background=f1f5f9&color=0078b4')`;

            const hour = new Date().getHours();
            if (hour < 12) greetingEl.textContent = 'Buenos días,';
            else if (hour < 18) greetingEl.textContent = 'Buenas tardes,';
            else greetingEl.textContent = 'Buenas noches,';
        }
    }

    updateStats() {
        const appointments = this.store.get('appointments');
        const doctorAppointments = appointments.filter(a => a.doctorId === this.user.doctorId);

        const todayStr = new Date().toDateString();
        const todayApts = doctorAppointments.filter(a => new Date(a.dateTime).toDateString() === todayStr);

        const total = todayApts.length;
        const pending = todayApts.filter(a => a.status === 'scheduled').length;
        const done = todayApts.filter(a => a.status === 'completed' || a.status === 'finalized').length;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-done').textContent = done;

        // Notification Badge Logic
        const messages = this.store.get('messages') || [];
        const unreadCount = messages.filter(m =>
            (m.recipientId === this.user.doctorId || m.recipientId === this.user.id) &&
            m.status !== 'read'
        ).length;

        const badge = document.getElementById('notif-badge');
        if (unreadCount > 0) {
            badge.classList.add('active');
            badge.style.display = 'block';
        } else {
            badge.classList.remove('active');
            badge.style.display = 'none';
        }
    }

    renderHome() {
        const appointments = this.store.get('appointments');
        const doctorAppointments = appointments.filter(a => a.doctorId === this.user.doctorId);

        const todayStr = new Date().toDateString();
        const sortedToday = doctorAppointments
            .filter(a => new Date(a.dateTime).toDateString() === todayStr)
            .sort((a, b) => a.dateTime - b.dateTime);

        // 1. Next Appointment
        const next = sortedToday.find(a => a.status === 'scheduled');
        const nextSlot = document.getElementById('next-appointment-slot');

        if (next) {
            const patient = this.store.find('patients', next.patientId);
            const time = new Date(next.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            nextSlot.innerHTML = `
                <div class="next-card" onclick="app.openSheet('${next.id}')">
                    <div class="patient-info">
                        <div class="patient-avatar" style="background-image: url('https://ui-avatars.com/api/?name=${encodeURIComponent(patient?.name || 'P')}&background=e2e8f0&color=0078b4')"></div>
                        <div class="patient-details">
                            <h3>${patient?.name || 'Paciente'}</h3>
                            <div class="patient-sub">${patient?.gender === 'F' ? 'Femenino' : 'Masculino'} • ${this.calculateAge(patient?.birthDate)} años</div>
                        </div>
                    </div>
                    <div class="appointment-time">
                        <i class="fa-regular fa-clock"></i>
                        ${time} - ${next.reason}
                    </div>
                    <button class="btn-primary">
                        Iniciar Consulta <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
            `;
        } else {
            nextSlot.innerHTML = '<div class="empty-state">No hay más citas asignadas para hoy.</div>';
        }

        // 2. Agenda Summary
        const agendaList = document.getElementById('home-agenda-list');
        agendaList.innerHTML = '';

        if (sortedToday.length > 0) {
            sortedToday.forEach(apt => {
                const patient = this.store.find('patients', apt.patientId);
                const time = new Date(apt.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const [timeVal, ampm] = time.split(' ');

                const item = document.createElement('div');
                item.className = 'agenda-item';
                item.onclick = () => this.openSheet(apt.id);
                item.innerHTML = `
                    <div class="time-block">
                        <span class="time">${timeVal}</span>
                        <span class="am-pm">${ampm || ''}</span>
                    </div>
                    <div class="item-details">
                        <h4>${patient?.name}</h4>
                        <p>${apt.reason}</p>
                    </div>
                    <div class="status-dot ${apt.status === 'scheduled' ? 'status-waiting' : 'status-done'}"></div>
                `;
                agendaList.appendChild(item);
            });
        } else {
            agendaList.innerHTML = '<div class="empty-state">Agenda vacía</div>';
        }
    }

    renderPatients() {
        const patients = this.store.get('patients');
        const list = document.getElementById('patients-list');
        list.innerHTML = '';

        patients.slice(0, 15).forEach(p => {
            const item = document.createElement('div');
            item.className = 'agenda-item';
            item.innerHTML = `
                <div class="patient-avatar" style="width: 40px; height: 40px; background-image: url('https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=e2e8f0&color=0078b4')"></div>
                <div class="item-details">
                    <h4>${p.name}</h4>
                    <p>DNI: ${p.dni} • ${p.phone}</p>
                </div>
                <div class="status-dot status-pending" style="background-color: var(--primary)"></div>
            `;
            list.appendChild(item);
        });
    }

    renderAgenda() {
        const appointments = this.store.get('appointments');
        const doctorAppointments = appointments
            .filter(a => a.doctorId === this.user.doctorId)
            .sort((a, b) => a.dateTime - b.dateTime);

        const list = document.getElementById('full-agenda-list');
        list.innerHTML = '';

        doctorAppointments.forEach(apt => {
            const patient = this.store.find('patients', apt.patientId);
            const date = new Date(apt.dateTime);
            const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const item = document.createElement('div');
            item.className = 'agenda-item';
            item.innerHTML = `
                <div class="time-block" style="min-width: 80px;">
                    <span class="time">${dateStr}</span>
                    <span class="am-pm">${timeStr}</span>
                </div>
                <div class="item-details">
                    <h4>${patient?.name}</h4>
                    <p>${apt.reason}</p>
                </div>
                <div class="status-dot ${apt.status === 'scheduled' ? 'status-waiting' : 'status-done'}"></div>
            `;
            list.appendChild(item);
        });
    }

    renderMessages() {
        const messages = this.store.get('messages').filter(m => m.recipientId === this.user.doctorId || m.recipientId === this.user.id);
        const list = document.getElementById('messages-list');
        list.innerHTML = '';

        if (messages.length > 0) {
            messages.forEach(m => {
                const item = document.createElement('div');
                item.className = 'agenda-item';
                item.style.flexDirection = 'column';
                item.style.alignItems = 'flex-start';
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 5px;">
                        <span style="font-weight: 700; color: var(--primary); font-size: 0.8rem;">${m.type}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(m.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h4 style="margin-bottom: 5px;">${m.title}</h4>
                    <p style="font-size: 0.85rem; color: var(--text-main); line-height: 1.4;">${m.content}</p>
                `;
                list.appendChild(item);
            });
        } else {
            list.innerHTML = '<div class="empty-state">No hay alertas.</div>';
        }
    }

    openSheet(appointmentId) {
        const appointment = this.store.find('appointments', appointmentId);
        const patient = this.store.find('patients', appointment.patientId);
        const medicalRecord = (this.store.get('clinicalRecords') || []).find(r => r.patientId === patient.id);

        this.currentPatient = patient;

        document.getElementById('sheet-patient-name').textContent = patient.name;
        document.getElementById('sheet-patient-id').textContent = `ID: ${patient.dni} • ${patient.bloodType || '?'}`;
        document.getElementById('sheet-avatar').style.backgroundImage = `url('https://ui-avatars.com/api/?name=${encodeURIComponent(patient.name)}&background=e2e8f0&color=0078b4')`;

        document.getElementById('sheet-reason').textContent = appointment.reason;

        const allergyEl = document.getElementById('sheet-allergies');
        if (patient.allergies && patient.allergies.length > 0) {
            allergyEl.innerHTML = `<span style="color:var(--danger); font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Alérgico a: ${patient.allergies.join(', ')}</span>`;
        } else {
            allergyEl.textContent = 'Sin alergias conocidas.';
        }

        const vitalsEl = document.getElementById('sheet-vitals');
        if (medicalRecord && medicalRecord.vitalSigns) {
            const v = medicalRecord.vitalSigns;
            vitalsEl.innerHTML = `
                <li style="margin-bottom: 6px;"><b>PA:</b> ${v.bloodPressure || '---'} mmHg</li>
                <li style="margin-bottom: 6px;"><b>FC:</b> ${v.heartRate || '---'} lpm</li>
                <li style="margin-bottom: 6px;"><b>Temp:</b> ${v.temperature || '---'} °C</li>
                <li><b>SPO2:</b> ${v.spo2 || '---'}%</li>
            `;
        } else {
            vitalsEl.innerHTML = '<li>No hay registros recientes de triage.</li>';
        }

        document.getElementById('overlay').classList.add('active');
        document.getElementById('bottomSheet').classList.add('active');
    }

    closeSheet() {
        document.getElementById('overlay').classList.remove('active');
        document.getElementById('bottomSheet').classList.remove('active');
    }

    startConsultation() {
        alert(`Iniciando consulta para ${this.currentPatient?.name}. (Funcionalidad disponible en sistema de escritorio para carga de diagnóstico completo)`);
        this.closeSheet();
    }

    calculateAge(birthDate) {
        if (!birthDate) return '--';
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age;
    }
}

// Global instance for onclick events
window.app = new DoctorApp();
document.addEventListener('DOMContentLoaded', () => window.app.init());
