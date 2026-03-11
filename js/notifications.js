/**
 * notifications.js — Panel de Notificaciones (APK / Doctor Mobile)
 * Adapta el módulo de comunicaciones de la versión web a móvil:
 *   - Carpetas: Bandeja, Enviados, Recordatorios, Alertas, Borradores, Papelera
 *   - Vistas: lista → detalle → redactar/responder
 *   - Guardar borrador, enviar, marcar leído, eliminar, destacar
 *   - Auto-recordatorios de citas próximas (< 48h)
 */

// ─── helpers de fecha ─────────────────────────────────────────────────────────

function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    if (d.getFullYear() === now.getFullYear())
        return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
    return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fmtFull(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('es-VE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }) + ' ' + new Date(ts).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

function avatarColor(name) {
    const colors = ['#0f8d3a', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#004b50'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
}

function chBadge(ch) {
    const m = {
        email: { l: 'Email', c: '#3b82f6', b: '#dbeafe' },
        sms: { l: 'SMS', c: '#8b5cf6', b: '#ede9fe' },
        push: { l: 'Push', c: '#f59e0b', b: '#fef3c7' },
        internal: { l: 'Interna', c: '#10b981', b: '#d1fae5' },
        system: { l: 'Sistema', c: '#6b7280', b: '#f3f4f6' }
    };
    const v = m[ch] || m.system;
    return `<span style="font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:10px;color:${v.c};background:${v.b};">${v.l}</span>`;
}

function prBadge(p) {
    const m = {
        critical: { l: 'Urgente', c: '#dc2626', b: '#fee2e2' },
        high: { l: 'Alta', c: '#ea580c', b: '#ffedd5' },
        normal: { l: 'Normal', c: '#3b82f6', b: '#dbeafe' },
        low: { l: 'Baja', c: '#6b7280', b: '#f3f4f6' }
    };
    const v = m[p] || m.normal;
    return `<span style="font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:10px;color:${v.c};background:${v.b};">${v.l}</span>`;
}

const FOLDERS = [
    { id: 'inbox', icon: 'fa-inbox', label: 'Bandeja' },
    { id: 'alerts', icon: 'fa-triangle-exclamation', label: 'Alertas' },
    { id: 'reminders', icon: 'fa-clock', label: 'Recordatorios' },
    { id: 'sent', icon: 'fa-paper-plane', label: 'Enviados' },
    { id: 'drafts', icon: 'fa-file-lines', label: 'Borradores' },
    { id: 'trash', icon: 'fa-trash', label: 'Papelera' }
];

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export function mountNotifications(root, { store, user }) {
    if (!root) return;

    const role = user?.role || 'doctor';

    const state = {
        folder: 'inbox',
        search: '',
        view: 'list',   // 'list' | 'detail' | 'compose'
        viewingId: null,
        replyTo: null,
        editingDraftId: null
    };

    let allData = { messages: [], notifications: [], reminders: [], drafts: [] };

    // ── Cargar datos ──────────────────────────────────────────────────────────
    function loadData() {
        allData.messages = store.get('messages') || [];
        allData.notifications = store.get('notifications') || [];
        allData.reminders = store.get('reminders') || [];
        allData.drafts = store.get('drafts') || [];
        generateAutoReminders();
    }

    function generateAutoReminders() {
        const apts = store.get('appointments') || [];
        const now = Date.now();
        const in48 = now + 48 * 3600000;
        const existing = new Set(allData.reminders.map(r => r.appointmentId));
        apts.forEach(a => {
            if (a.status !== 'scheduled' || existing.has(a.id)) return;
            const t = new Date(a.dateTime).getTime();
            if (t > now && t <= in48) {
                const p = store.find('patients', a.patientId);
                const d = store.find('doctors', a.doctorId);
                if (!p || !d) return;
                store.add('reminders', {
                    appointmentId: a.id,
                    recipientId: user?.doctorId || user?.id,
                    recipientName: d.name,
                    title: 'Recordatorio de cita próxima',
                    content: `Cita con ${p.name} el ${fmtFull(a.dateTime)}.`,
                    channel: 'internal', priority: 'normal',
                    status: 'pending', type: 'appointment_reminder',
                    createdBy: 'system', createdAt: now
                });
            }
        });
        allData.reminders = store.get('reminders') || [];
    }

    function getActorName(id) {
        if (!id || id === 'system') return 'Sistema Hospitalario';
        if (id.startsWith('role_')) {
            const roleMap = {
                role_admin: 'Alta Administración', role_doctor: 'Gremio Médico',
                role_nurse: 'Enfermería', role_receptionist: 'Recepción', role_patient: 'Pacientes'
            };
            return roleMap[id] || id;
        }
        const u = store.find('users', id); if (u) return u.name;
        const d = store.find('doctors', id); if (d) return d.name;
        const p = store.find('patients', id); if (p) return p.name;
        return id;
    }

    function getAllItems() {
        const all = [
            ...allData.messages.map(m => ({ ...m, _src: 'messages' })),
            ...allData.notifications.map(n => ({ ...n, _src: 'notifications' })),
            ...allData.reminders.map(r => ({ ...r, _src: 'reminders' })),
            ...allData.drafts.map(d => ({ ...d, _src: 'drafts' }))
        ];
        return all.filter(i => {
            if (role === 'admin') return true;
            if (i.createdBy === user?.id) return true;
            if (i.recipientId === user?.id ||
                (user?.doctorId && i.recipientId === user.doctorId) ||
                i.recipientRole === role) return true;
            if (i._src === 'notifications') return true;
            if (i._src === 'reminders' && (i.recipientId === user?.doctorId || i.recipientId === user?.id)) return true;
            return false;
        });
    }

    function getFolderItems() {
        let items = getAllItems();
        if (state.folder === 'inbox') items = items.filter(i => i.createdBy !== user?.id && !i.deleted);
        else if (state.folder === 'sent') items = items.filter(i => i.createdBy === user?.id && !i.deleted && i._src !== 'drafts');
        else if (state.folder === 'reminders') items = items.filter(i => i._src === 'reminders' && !i.deleted);
        else if (state.folder === 'alerts') items = items.filter(i => (i.priority === 'critical' || i.priority === 'high' || i._src === 'notifications') && !i.deleted);
        else if (state.folder === 'trash') items = items.filter(i => i.deleted);
        else if (state.folder === 'drafts') items = items.filter(i => i._src === 'drafts' && !i.deleted);
        if (state.search) {
            const s = state.search.toLowerCase();
            items = items.filter(i =>
                (i.title || '').toLowerCase().includes(s) ||
                (i.content || '').toLowerCase().includes(s) ||
                getActorName(i.createdBy).toLowerCase().includes(s)
            );
        }
        return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    function findItem(id) {
        return [...allData.messages, ...allData.notifications, ...allData.reminders, ...allData.drafts].find(i => i.id === id);
    }
    function findSrc(id) {
        for (const src of ['messages', 'notifications', 'reminders', 'drafts'])
            if ((allData[src] || []).find(i => i.id === id)) return src;
        return null;
    }

    function unreadCount() {
        return getAllItems().filter(i =>
            !i.deleted && i.createdBy !== user?.id &&
            (i.status === 'sent' || i.status === 'pending' || i.status === 'scheduled' || i.status === 'delivered')
        ).length;
    }

    // ── RENDER ────────────────────────────────────────────────────────────────
    function render() {
        loadData();
        const items = getFolderItems();
        const unread = unreadCount();

        // Actualizar badge del botón de notificaciones en el header
        const badge = document.getElementById('notif-badge');
        if (badge) {
            badge.textContent = unread > 0 ? (unread > 99 ? '99+' : unread) : '';
            badge.style.display = unread > 0 ? '' : 'none';
        }

        root.innerHTML = '';

        // Cabecera de la vista
        const header = document.createElement('div');
        header.style.cssText = 'padding:0 0 12px;';
        header.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="font-size:1rem;font-weight:700;color:var(--neutralDark);">
                    ${FOLDERS.find(f => f.id === state.folder)?.label || 'Bandeja'}
                    ${items.filter(i => i.status !== 'read' && i.createdBy !== user?.id).length
                ? `<span style="background:var(--themePrimary);color:#fff;font-size:0.65rem;padding:2px 7px;border-radius:10px;margin-left:6px;vertical-align:middle;">
                            ${items.filter(i => i.status !== 'read' && i.createdBy !== user?.id).length} nuevo${items.filter(i => i.status !== 'read' && i.createdBy !== user?.id).length === 1 ? '' : 's'}
                           </span>` : ''}
                </div>
                <button id="notif-compose-btn"
                    style="display:flex;align-items:center;gap:6px;background:var(--themePrimary);color:#fff;border:none;
                           border-radius:20px;padding:8px 16px;font-size:0.8rem;font-weight:600;cursor:pointer;">
                    <i class="fa-solid fa-pen-to-square"></i> Redactar
                </button>
            </div>
            <!-- Tabs de carpetas (scroll horizontal) -->
            <div id="notif-folders" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;">
                ${FOLDERS.map(f => `
                <button class="notif-folder-tab ${f.id === state.folder ? 'active' : ''}" data-folder="${f.id}"
                    style="display:flex;align-items:center;gap:5px;white-space:nowrap;
                           border:1px solid ${f.id === state.folder ? 'var(--themePrimary)' : 'var(--neutralLight)'};
                           background:${f.id === state.folder ? 'var(--themePrimary)' : '#fff'};
                           color:${f.id === state.folder ? '#fff' : 'var(--neutralSecondary)'};
                           border-radius:20px;padding:6px 12px;font-size:0.75rem;font-weight:600;cursor:pointer;">
                    <i class="fa-solid ${f.icon}" style="font-size:0.7rem;"></i> ${f.label}
                </button>`).join('')}
            </div>
            <!-- Buscador -->
            <div style="position:relative;margin-top:10px;">
                <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--neutralSecondary);font-size:0.8rem;"></i>
                <input id="notif-search-input" type="text" placeholder="Buscar mensajes..." value="${state.search}"
                       style="width:100%;padding:10px 12px 10px 36px;border-radius:20px;border:1px solid var(--neutralLight);
                              font-size:0.83rem;box-sizing:border-box;background:var(--neutralLighterAlt,#f8f8f8);">
            </div>
        `;
        root.appendChild(header);

        // Cuerpo según vista
        if (state.view === 'compose') {
            root.appendChild(buildCompose());
        } else if (state.view === 'detail' && state.viewingId) {
            root.appendChild(buildDetail());
        } else {
            root.appendChild(buildList(items));
        }

        bindEvents();
    }

    // ── LISTA ─────────────────────────────────────────────────────────────────
    function buildList(items) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:0;';

        if (!items.length) {
            wrap.innerHTML = `
                <div style="text-align:center;padding:48px 16px;color:var(--neutralSecondary);">
                    <i class="fa-solid fa-inbox" style="font-size:2.5rem;opacity:.25;display:block;margin-bottom:12px;"></i>
                    <div style="font-weight:600;margin-bottom:4px;">No hay mensajes</div>
                    <div style="font-size:0.78rem;">Los mensajes aparecerán aquí.</div>
                </div>`;
            return wrap;
        }

        items.forEach(item => {
            const isDraft = item._src === 'drafts';
            const isUnread = !isDraft &&
                item.createdBy !== user?.id &&
                (item.status === 'sent' || item.status === 'pending' || item.status === 'scheduled' || item.status === 'delivered');
            const sender = state.folder === 'sent' ? `Para: ${item.recipientName || '—'}`
                : isDraft ? 'Borrador'
                    : getActorName(item.createdBy);
            const ac = avatarColor(sender);
            const initial = (sender || 'S').charAt(0).toUpperCase();

            const row = document.createElement('div');
            row.dataset.id = item.id;
            row.style.cssText = [
                'display:flex;align-items:flex-start;gap:12px;padding:12px 0;',
                'border-bottom:1px solid var(--neutralLight);cursor:pointer;',
                isUnread ? 'background:rgba(0,59,105,.03);' : '',
                isDraft ? 'background:rgba(255,185,0,.04);' : ''
            ].join('');

            row.innerHTML = `
                <div style="width:38px;height:38px;border-radius:10px;background:${ac};display:flex;align-items:center;justify-content:center;
                            font-weight:800;font-size:1rem;color:#fff;flex-shrink:0;${isUnread ? 'box-shadow:0 2px 6px rgba(0,59,105,.2)' : ''}">${initial}</div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                        <span style="font-size:0.83rem;font-weight:${isUnread ? '700' : '500'};color:${isUnread ? 'var(--neutralDark)' : 'var(--neutralPrimary)'};
                                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${sender}</span>
                        <span style="font-size:0.68rem;color:${isUnread ? 'var(--themePrimary)' : 'var(--neutralSecondary)'};font-weight:${isUnread ? '700' : '400'};flex-shrink:0;">${fmtDate(item.createdAt)}</span>
                    </div>
                    <div style="font-size:0.82rem;font-weight:${isUnread ? '700' : '500'};color:var(--neutralDark);
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${item.title || '(sin asunto)'}</div>
                    <div style="font-size:0.75rem;color:var(--neutralSecondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">
                        ${(item.content || '').replace(/\n/g, ' ').substring(0, 80)}
                    </div>
                    <div style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap;">
                        ${chBadge(item.channel)}
                        ${item.priority && item.priority !== 'normal' ? prBadge(item.priority) : ''}
                        ${isDraft ? '<span style="font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:10px;color:#b45309;background:#fef3c7;">Borrador</span>' : ''}
                        ${isUnread ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--themePrimary);display:inline-block;margin-left:2px;flex-shrink:0;align-self:center;"></span>' : ''}
                    </div>
                </div>
            `;
            row.addEventListener('click', () => {
                markRead(item.id);
                state.viewingId = item.id;
                state.view = 'detail';
                render();
            });
            wrap.appendChild(row);
        });
        return wrap;
    }

    // ── DETALLE ───────────────────────────────────────────────────────────────
    function buildDetail() {
        const item = findItem(state.viewingId);
        const wrap = document.createElement('div');
        if (!item) {
            wrap.innerHTML = '<p style="color:var(--neutralSecondary);text-align:center;padding:32px;">Mensaje no encontrado.</p>';
            return wrap;
        }

        markRead(item.id);
        const senderName = getActorName(item.createdBy);
        const ac = avatarColor(senderName);
        const isDraft = item._src === 'drafts';

        wrap.innerHTML = `
            <!-- Toolbar detalle -->
            <div style="display:flex;align-items:center;gap:8px;padding:0 0 14px;border-bottom:1px solid var(--neutralLight);margin-bottom:14px;">
                <button id="detail-back" style="background:none;border:none;cursor:pointer;color:var(--themePrimary);font-size:1rem;padding:6px;">
                    <i class="fa-solid fa-arrow-left"></i>
                </button>
                <div style="flex:1;font-size:0.75rem;color:var(--neutralSecondary);">${fmtFull(item.createdAt)}</div>
                ${!isDraft ? `
                <button data-action="star" data-id="${item.id}"
                    style="background:none;border:none;cursor:pointer;font-size:0.9rem;color:${item.starred ? '#f59e0b' : 'var(--neutralTertiary)'};">
                    <i class="fa-${item.starred ? 'solid' : 'regular'} fa-star"></i>
                </button>` : ''}
                <button data-action="delete-detail" data-id="${item.id}"
                    style="background:none;border:none;cursor:pointer;color:var(--red);font-size:0.9rem;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>

            <!-- Cabecera del mensaje -->
            <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;">
                <div style="width:46px;height:46px;border-radius:12px;background:${ac};display:flex;align-items:center;justify-content:center;
                            font-weight:800;font-size:1.2rem;color:#fff;flex-shrink:0;">${senderName.charAt(0).toUpperCase()}</div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:4px;">
                        <span style="font-size:1rem;font-weight:700;color:var(--neutralDark);">${item.title || '(sin asunto)'}</span>
                        ${chBadge(item.channel)} ${prBadge(item.priority)}
                    </div>
                    <div style="font-size:0.78rem;color:var(--neutralSecondary);">
                        <strong style="color:var(--neutralPrimary);">${senderName}</strong>
                        <i class="fa-solid fa-arrow-right" style="font-size:0.6rem;margin:0 3px;"></i>
                        ${item.recipientName || '—'}
                    </div>
                </div>
            </div>

            <!-- Cuerpo -->
            <div style="font-size:0.88rem;color:var(--neutralDark);line-height:1.75;white-space:pre-wrap;
                        background:var(--neutralLighterAlt,#f8f8f8);border-radius:12px;padding:16px;margin-bottom:20px;">
                ${item.content || 'Sin contenido.'}
            </div>

            ${item.appointmentId ? `
            <div style="margin-bottom:16px;padding:10px 14px;background:var(--themeLighterAlt,#eff5f9);border-left:3px solid var(--themePrimary);border-radius:0 8px 8px 0;font-size:0.78rem;color:var(--themeDark);">
                <i class="fa-solid fa-calendar-check"></i> Cita vinculada: ${item.appointmentId}
            </div>` : ''}

            <!-- Acciones -->
            ${isDraft ? `
            <button id="edit-draft-btn" data-id="${item.id}"
                style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
                       background:var(--yellow);color:#fff;border:none;border-radius:10px;padding:13px;font-weight:700;cursor:pointer;">
                <i class="fa-solid fa-pen-to-square"></i> Editar borrador
            </button>` : `
            <button id="reply-btn"
                style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
                       background:var(--themePrimary);color:#fff;border:none;border-radius:10px;padding:13px;font-weight:700;cursor:pointer;">
                <i class="fa-solid fa-reply"></i> Responder
            </button>`}
        `;
        return wrap;
    }

    // ── REDACTAR ──────────────────────────────────────────────────────────────
    function buildCompose() {
        const isEditing = !!state.editingDraftId;
        const draft = isEditing ? findItem(state.editingDraftId) : null;
        const replyTo = state.replyTo;

        let initTo = '', initSubj = '', initBody = '', initCh = 'internal', initPri = 'normal';
        if (draft) {
            initTo = draft.recipientId || (draft.recipientRole ? `role_${draft.recipientRole}` : '');
            initSubj = draft.title || '';
            initBody = draft.content || '';
            initCh = draft.channel || 'internal';
            initPri = draft.priority || 'normal';
        } else if (replyTo) {
            initTo = replyTo.createdBy === user?.id
                ? (replyTo.recipientId || '')
                : (replyTo.createdBy || '');
            initSubj = 'Re: ' + (replyTo.title || '');
        }

        const patients = store.get('patients') || [];
        const doctors = store.get('doctors') || [];
        const allUsers = store.get('users') || [];
        const adminUsers = allUsers.filter(u => u.role === 'admin');

        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                <button id="compose-cancel-btn"
                    style="background:none;border:none;cursor:pointer;color:var(--themePrimary);font-size:1rem;padding:6px;">
                    <i class="fa-solid fa-arrow-left"></i>
                </button>
                <span style="font-weight:700;font-size:0.95rem;color:var(--neutralDark);">
                    ${isEditing ? 'Editar borrador' : replyTo ? 'Responder' : 'Nuevo mensaje'}
                </span>
            </div>

            <form id="compose-form" style="display:flex;flex-direction:column;gap:0;
                  background:#fff;border-radius:14px;border:1px solid var(--neutralLight);overflow:hidden;margin-bottom:16px;">

                <!-- Para -->
                <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--neutralLight);">
                    <span style="font-size:0.78rem;color:var(--neutralSecondary);font-weight:600;min-width:60px;">Para</span>
                    ${replyTo && !isEditing ? `
                    <span style="font-size:0.85rem;font-weight:600;color:var(--themePrimary);flex:1;">
                        ${getActorName(initTo)}
                        <input type="hidden" id="cmp-to" value="${initTo}">
                    </span>` : `
                    <select id="cmp-to" required
                        style="flex:1;border:none;font-size:0.85rem;background:transparent;outline:none;color:var(--neutralDark);">
                        <option value="">Seleccionar destinatario...</option>
                        <optgroup label="Por gremio">
                            <option value="role_admin"        ${initTo === 'role_admin' ? 'selected' : ''}>Alta Administración</option>
                            <option value="role_receptionist" ${initTo === 'role_receptionist' ? 'selected' : ''}>Mesa de Recepción</option>
                            <option value="role_doctor"       ${initTo === 'role_doctor' ? 'selected' : ''}>Todo el Gremio Médico</option>
                            <option value="role_nurse"        ${initTo === 'role_nurse' ? 'selected' : ''}>Personal de Enfermería</option>
                        </optgroup>
                        ${adminUsers.length ? `<optgroup label="Directivos">
                            ${adminUsers.map(a => `<option value="${a.id}" ${a.id === initTo ? 'selected' : ''}>${a.name} (Admin)</option>`).join('')}
                        </optgroup>`: ''}
                        <optgroup label="Médicos">
                            ${doctors.map(d => `<option value="${d.id}" ${d.id === initTo ? 'selected' : ''}>${d.name}</option>`).join('')}
                        </optgroup>
                        <optgroup label="Pacientes">
                            ${patients.map(p => `<option value="${p.id}" ${p.id === initTo ? 'selected' : ''}>${p.name}</option>`).join('')}
                        </optgroup>
                    </select>`}
                </div>

                <!-- Asunto -->
                <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--neutralLight);">
                    <span style="font-size:0.78rem;color:var(--neutralSecondary);font-weight:600;min-width:60px;">Asunto</span>
                    <input id="cmp-subj" type="text" required placeholder="Asunto del mensaje" value="${initSubj}"
                           style="flex:1;border:none;font-size:0.85rem;background:transparent;outline:none;color:var(--neutralDark);">
                </div>

                <!-- Canal y Prioridad en fila -->
                <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--neutralLight);">
                    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-right:1px solid var(--neutralLight);">
                        <span style="font-size:0.73rem;color:var(--neutralSecondary);font-weight:600;">Canal</span>
                        <select id="cmp-ch" style="flex:1;border:none;font-size:0.78rem;background:transparent;outline:none;color:var(--neutralDark);">
                            <option value="internal" ${initCh === 'internal' ? 'selected' : ''}>Interna</option>
                            <option value="email"    ${initCh === 'email' ? 'selected' : ''}>Email</option>
                            <option value="sms"      ${initCh === 'sms' ? 'selected' : ''}>SMS</option>
                            <option value="push"     ${initCh === 'push' ? 'selected' : ''}>Push</option>
                        </select>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;">
                        <span style="font-size:0.73rem;color:var(--neutralSecondary);font-weight:600;">Prioridad</span>
                        <select id="cmp-pri" style="flex:1;border:none;font-size:0.78rem;background:transparent;outline:none;color:var(--neutralDark);">
                            <option value="normal"   ${initPri === 'normal' ? 'selected' : ''}>Normal</option>
                            <option value="low"      ${initPri === 'low' ? 'selected' : ''}>Baja</option>
                            <option value="high"     ${initPri === 'high' ? 'selected' : ''}>Alta</option>
                            <option value="critical" ${initPri === 'critical' ? 'selected' : ''}>Urgente</option>
                        </select>
                    </div>
                </div>

                <!-- Cuerpo del mensaje -->
                <textarea id="cmp-body" required placeholder="Escriba el mensaje aquí..."
                    style="flex:1;border:none;padding:14px;font-size:0.88rem;resize:none;min-height:160px;
                           outline:none;font-family:inherit;line-height:1.7;color:var(--neutralDark);">${initBody}</textarea>

                <!-- Acciones del formulario -->
                <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--neutralLighterAlt,#f8f8f8);border-top:1px solid var(--neutralLight);">
                    <button type="submit"
                        style="display:flex;align-items:center;gap:7px;background:var(--green);color:#fff;
                               border:none;border-radius:20px;padding:9px 18px;font-size:0.83rem;font-weight:700;cursor:pointer;">
                        <i class="fa-solid fa-paper-plane"></i> Enviar
                    </button>
                    <button type="button" id="save-draft-btn"
                        style="display:flex;align-items:center;gap:7px;background:var(--yellow);color:#fff;
                               border:none;border-radius:20px;padding:9px 16px;font-size:0.83rem;font-weight:600;cursor:pointer;">
                        <i class="fa-solid fa-floppy-disk"></i> Guardar
                    </button>
                    <button type="button" id="discard-btn"
                        style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--red);font-size:0.85rem;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </form>
        `;
        return wrap;
    }

    // ── ACCIONES ──────────────────────────────────────────────────────────────
    function markRead(id) {
        const src = findSrc(id);
        const item = findItem(id);
        if (!src || !item) return;
        if (item.status !== 'read' && item.createdBy !== user?.id) {
            store.update(src, id, { status: 'read' });
        }
    }

    function toggleStar(id) {
        const src = findSrc(id);
        const item = findItem(id);
        if (src && item) store.update(src, id, { starred: !item.starred });
    }

    function deleteItem(id) {
        const src = findSrc(id);
        if (!src) return;
        if (state.folder === 'trash') {
            if (!confirm('¿Eliminar permanentemente este mensaje?')) return;
            store.remove(src, id);
        } else {
            store.update(src, id, { deleted: true });
        }
        state.view = 'list';
        state.viewingId = null;
        render();
        showToast(state.folder === 'trash' ? 'Eliminado permanentemente' : 'Movido a papelera');
    }

    function sendMessage(form) {
        const toEl = form.querySelector('#cmp-to');
        const val = toEl.value.trim();
        if (!val) { showToast('⚠️ Seleccione un destinatario'); return; }
        const subj = form.querySelector('#cmp-subj').value.trim();
        const body = form.querySelector('#cmp-body').value.trim();
        if (!subj || !body) { showToast('⚠️ Complete asunto y mensaje'); return; }

        const isRole = val.startsWith('role_');
        const name = isRole
            ? ({
                'role_admin': 'Alta Administración', 'role_doctor': 'Gremio Médico',
                'role_nurse': 'Enfermería', 'role_receptionist': 'Recepción',
                'role_patient': 'Pacientes'
            }[val] || val)
            : (toEl.tagName === 'SELECT'
                ? toEl.options[toEl.selectedIndex]?.dataset?.name || getActorName(val)
                : getActorName(val));

        store.add('messages', {
            recipientId: isRole ? null : val,
            recipientRole: isRole ? val.replace('role_', '') : null,
            recipientName: name,
            title: subj,
            content: body,
            channel: form.querySelector('#cmp-ch').value,
            priority: form.querySelector('#cmp-pri').value,
            status: 'sent',
            type: 'manual',
            createdBy: user?.id || '',
            createdAt: Date.now()
        });
        if (state.editingDraftId) store.remove('drafts', state.editingDraftId);
        state.view = 'list'; state.replyTo = null; state.editingDraftId = null;
        render();
        showToast('✅ Mensaje enviado correctamente');
    }

    function saveDraft(form) {
        const toEl = form.querySelector('#cmp-to');
        const val = toEl.value.trim();
        const isRole = val.startsWith('role_');
        const name = isRole
            ? (toEl.tagName === 'SELECT' ? toEl.options[toEl.selectedIndex]?.text : getActorName(val))
            : getActorName(val);
        const data = {
            recipientId: isRole ? null : val,
            recipientRole: isRole ? val.replace('role_', '') : null,
            recipientName: name,
            title: form.querySelector('#cmp-subj').value.trim() || '(sin asunto)',
            content: form.querySelector('#cmp-body').value.trim(),
            channel: form.querySelector('#cmp-ch').value,
            priority: form.querySelector('#cmp-pri').value,
            status: 'draft', type: 'manual',
            createdBy: user?.id || '', createdAt: Date.now()
        };
        if (state.editingDraftId) store.update('drafts', state.editingDraftId, data);
        else store.add('drafts', data);
        state.view = 'list'; state.replyTo = null; state.editingDraftId = null;
        render();
        showToast('💾 Borrador guardado');
    }

    function showToast(msg) {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
            'padding:10px 20px;border-radius:20px;background:var(--neutralDark);color:#fff;' +
            'font-size:0.8rem;z-index:99999;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.2);';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2500);
    }

    // ── BIND ──────────────────────────────────────────────────────────────────
    function bindEvents() {
        // Carpetas
        root.querySelectorAll('[data-folder]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.folder = btn.dataset.folder;
                state.view = 'list';
                state.viewingId = null;
                render();
            });
        });

        // Buscador
        const searchInput = root.querySelector('#notif-search-input');
        if (searchInput) {
            let _t;
            searchInput.addEventListener('input', () => {
                clearTimeout(_t);
                _t = setTimeout(() => { state.search = searchInput.value; render(); }, 300);
            });
        }

        // Redactar
        root.querySelector('#notif-compose-btn')?.addEventListener('click', () => {
            state.view = 'compose'; state.replyTo = null; state.editingDraftId = null; render();
        });

        // Detalle — volver
        root.querySelector('#detail-back')?.addEventListener('click', () => {
            state.view = 'list'; state.viewingId = null; render();
        });

        // Detalle — estrella
        root.querySelector('[data-action="star"]')?.addEventListener('click', e => {
            toggleStar(e.currentTarget.dataset.id); render();
        });

        // Detalle — eliminar
        root.querySelector('[data-action="delete-detail"]')?.addEventListener('click', e => {
            deleteItem(e.currentTarget.dataset.id);
        });

        // Detalle — responder
        root.querySelector('#reply-btn')?.addEventListener('click', () => {
            state.replyTo = findItem(state.viewingId);
            state.view = 'compose'; state.editingDraftId = null; render();
        });

        // Detalle — editar borrador
        root.querySelector('#edit-draft-btn')?.addEventListener('click', e => {
            state.editingDraftId = e.currentTarget.dataset.id;
            state.view = 'compose'; state.replyTo = null; render();
        });

        // Redactar — cancelar
        root.querySelector('#compose-cancel-btn')?.addEventListener('click', () => {
            state.view = 'list'; state.replyTo = null; state.editingDraftId = null; render();
        });

        // Redactar — enviar
        const composeForm = root.querySelector('#compose-form');
        if (composeForm) {
            composeForm.addEventListener('submit', e => { e.preventDefault(); sendMessage(composeForm); });
            // Guardar borrador
            root.querySelector('#save-draft-btn')?.addEventListener('click', () => saveDraft(composeForm));
            // Descartar
            root.querySelector('#discard-btn')?.addEventListener('click', () => {
                state.view = 'list'; state.replyTo = null; state.editingDraftId = null; render();
            });
        }
    }

    // ── Iniciar ───────────────────────────────────────────────────────────────
    loadData();
    render();

    // Devolver función para refrescar desde main
    return { refresh: render };
}
