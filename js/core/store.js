// Store mejorado con más datos y funcionalidades

export async function createStore(bus) {
  const STORAGE_KEY = 'hospital_prototype_v3';

  // Datos de ejemplo más completos
  const defaultData = {
    version: 'APK-1.4',
    users: [
      {
        id: 'user_daruiz',
        username: 'daruiz',
        password: 'demo123',
        role: 'doctor',
        name: 'Dra. Ana Ruiz',
        email: 'ana.ruiz@hospital.com',
        doctorId: 'd_1',
        isActive: true,
        createdAt: Date.now()
      },
      {
        id: 'user_esoler',
        username: 'esoler',
        password: 'demo123',
        role: 'nurse',
        name: 'Enf. Elena Soler',
        email: 'elena.soler@hospital.com',
        nurseId: 'n_1',
        isActive: true,
        createdAt: Date.now()
      }
    ],

    patients: [
      {
        id: 'p_1',
        docType: 'V',
        dni: '12345678',
        name: 'María Gómez',
        birthDate: '1985-03-12',
        birthPlace: 'Maturín, Monagas',
        nationality: 'Venezolana',
        civilStatus: 'Soltera',
        gender: 'F',
        phone: '555-0101',
        email: 'maria@email.com',
        address: 'Calle Principal 123',
        bloodType: 'O+',
        allergies: [],
        carnetExpiry: '2027-06-15',
        emergencyContact: {
          name: 'Pedro Gómez',
          phone: '555-0909',
          relation: 'Padre'
        },
        consent: {
          granted: true,
          date: Date.now() - 30 * 24 * 60 * 60 * 1000,
          scope: 'Tratamiento de datos sensibles y clínicos'
        },
        isActive: true,
        createdAt: Date.now()
      },
      {
        id: 'p_2',
        docType: 'V',
        dni: '87654321',
        name: 'Juan López',
        birthDate: '1990-11-02',
        birthPlace: 'Caracas, DC',
        nationality: 'Venezolana',
        civilStatus: 'Casado',
        gender: 'M',
        phone: '555-0102',
        email: 'juan@email.com',
        address: 'Avenida Central 456',
        bloodType: 'A+',
        allergies: ['Penicilina'],
        carnetExpiry: '2026-12-31',
        emergencyContact: {
          name: 'Laura de López',
          phone: '555-0808',
          relation: 'Esposa'
        },
        consent: {
          granted: true,
          date: Date.now() - 60 * 24 * 60 * 60 * 1000,
          scope: 'Tratamiento de datos sensibles y clínicos'
        },
        isActive: true,
        createdAt: Date.now()
      }
    ],

    doctors: [
      {
        id: 'd_1',
        name: 'Dra. Ana Ruiz',
        specialty: 'Medicina Interna',
        subspecialties: ['Gastroenterología'],
        healthSystemNumber: 'MPPS-12345',
        hireDate: '2018-10-01',
        contractType: 'Fijo',
        areaId: 'area_1',
        license: 'LICENSE-1234',
        email: 'ana.ruiz@hospital.com',
        phone: '555-0201',
        schedule: 'Lun-Vie 8:00-16:00',
        workStartHour: 8,
        workEndHour: 16,
        dailyCapacity: 20,
        isActive: true,
        createdAt: Date.now()
      }
    ],

    areas: [
      {
        id: 'area_1',
        name: 'Medicina General',
        description: 'Atención médica general y consultas',
        color: '#0f8d3a',
        isActive: true
      },
      {
        id: 'area_2',
        name: 'Pediatría',
        description: 'Especialidad en atención infantil',
        color: '#3b82f6',
        isActive: true
      },
      {
        id: 'area_3',
        name: 'Cardiología',
        description: 'Especialidad en enfermedades del corazón',
        color: '#ef4444',
        isActive: true
      },
      {
        id: 'area_4',
        name: 'Traumatología',
        description: 'Especialidad en lesiones óseas y musculares',
        color: '#f59e0b',
        isActive: true
      }
    ],

    nurses: [
      {
        id: 'n_1',
        name: 'Enf. Elena Soler',
        email: 'elena.soler@hospital.com',
        phone: '555-0301',
        areaId: 'area_1',
        shift: 'Mañana',
        isActive: true,
        createdAt: Date.now()
      },
      {
        id: 'n_2',
        name: 'Enf. Roberto Díaz',
        email: 'roberto.diaz@hospital.com',
        phone: '555-0302',
        areaId: 'area_3',
        shift: 'Tarde',
        isActive: true,
        createdAt: Date.now()
      }
    ],

    receptionists: [
      {
        id: 'r_1',
        name: 'Recepcionista Carla Román',
        email: 'carla.recepcion@hospital.com',
        phone: '555-0401',
        areaId: 'area_1',
        title: 'Recepcionista Principal',
        isActive: true,
        createdAt: Date.now()
      }
    ],

    appointments: [
      {
        id: 'apt_today_1',
        patientId: 'p_1',
        doctorId: 'd_1',
        areaId: 'area_1',
        dateTime: new Date().setHours(new Date().getHours() + 1, 0, 0, 0),
        duration: 30,
        status: 'scheduled',
        priority: 'rutina',
        type: 'control',
        reason: 'Fiebre persistente y malestar general',
        notes: '',
        modality: 'presencial',
        virtualLink: '',
        consultorioId: 'con_1',
        equipmentIds: [],
        arrivalDateTime: null,
        startDateTime: null,
        endDateTime: null,
        createdAt: Date.now(),
        createdBy: 'user_daruiz'
      },
      {
        id: 'apt_today_2',
        patientId: 'p_2',
        doctorId: 'd_1',
        areaId: 'area_1',
        dateTime: new Date().setHours(new Date().getHours() - 2, 0, 0, 0),
        duration: 30,
        status: 'completed',
        priority: 'rutina',
        type: 'control',
        reason: 'Hipertensión arterial - Seguimiento',
        notes: 'Paciente estable con tratamiento actual',
        modality: 'presencial',
        virtualLink: '',
        consultorioId: 'con_1',
        equipmentIds: [],
        arrivalDateTime: null,
        startDateTime: null,
        endDateTime: null,
        createdAt: Date.now(),
        createdBy: 'user_daruiz'
      },
      {
        id: 'apt_tomorrow_1',
        patientId: 'p_1',
        doctorId: 'd_1',
        areaId: 'area_1',
        dateTime: Date.now() + 24 * 60 * 60 * 1000,
        duration: 30,
        status: 'scheduled',
        priority: 'rutina',
        type: 'control',
        reason: 'Resultados de laboratorio',
        notes: '',
        modality: 'presencial',
        virtualLink: '',
        consultorioId: 'con_1',
        equipmentIds: [],
        arrivalDateTime: null,
        startDateTime: null,
        endDateTime: null,
        createdAt: Date.now(),
        createdBy: 'user_daruiz'
      }
    ],

    clinicalRecords: [
      {
        id: 'cr_1',
        patientId: 'p_1',
        doctorId: 'd_1',
        appointmentId: 'apt_3',
        date: Date.now() - 3 * 24 * 60 * 60 * 1000,
        type: 'consultation',
        vitalSigns: {
          bloodPressure: '120/80',
          heartRate: 72,
          temperature: 36.5,
          spo2: 98,
          weight: 65,
          height: 170
        },
        symptoms: 'Fiebre leve (37.8°C), dolor de cabeza, congestión nasal',
        diagnosis: 'Resfriado común (Rinofaringitis aguda)',
        treatment: 'Reposo, hidratación abundante, antitérmicos si fiebre >38°C',
        prescriptions: [
          {
            medication: 'Paracetamol',
            dosage: '500mg',
            frequency: 'Cada 8 horas',
            duration: '3 días'
          }
        ],
        notes: 'Paciente alérgico a penicilina.',
        status: 'finalized',
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        createdBy: 'doctor_1'
      }
    ],

    triaje: [
      {
        id: 'triaje_1',
        patientId: 'p_1',
        priority: 'orange',
        symptoms: 'Dolor torácico intenso',
        status: 'in_progress',
        triajeBy: 'doctor_1',
        triajeByName: 'Dra. Ana Ruiz',
        createdAt: Date.now() - 15 * 60 * 1000
      }
    ],

    // Gestión de Recursos Críticos
    consultorios: [
      {
        id: 'con_1',
        name: 'Consultorio 101',
        area: 'Consulta Externa',
        status: 'available',
        floor: '1',
        location: 'Ala Norte, Pasillo 1',
        capacity: 1,
        equipment: 'Camilla, Negatoscopio, Tensiómetro',
        managerId: 'admin_1'
      },
      {
        id: 'con_2',
        name: 'Consultorio 102',
        area: 'Consulta Externa',
        status: 'available',
        floor: '1',
        location: 'Ala Norte, Pasillo 1',
        capacity: 1,
        equipment: 'Camilla, Escritorio médico',
        managerId: 'admin_1'
      }
    ],
    equiposMedicos: [
      { id: 'eq_1', name: 'Rayos X Móvil', status: 'available', condition: 'good', lastMaintenance: '2024-01-15' },
      { id: 'eq_2', name: 'Ecógrafo 4D', status: 'maintenance', condition: 'fair', lastMaintenance: '2023-11-20' }
    ],
    suministros: [
      { id: 'sum_1', name: 'Oxígeno (Tanque)', stock: 15, unit: 'unidades', minStock: 5, category: 'Gases Medicinales' }
    ],

    // ===== MÓDULO DE SEGURIDAD =====
    auditLogs: [],
    sessions: [],

    // ===== MÓDULO DE RELEVO DE TURNO / TRATAMIENTOS =====
    // REGLA: Los registros son INMUTABLES. Los errores se corrigen con una enmienda.
    treatmentLogs: [
      {
        id: 'tlog_1',
        patientId: 'p_1',
        entryType: 'medication',
        userId: 'doctor_1',
        userName: 'Dra. Ana Ruiz',
        userRole: 'doctor',
        shift: 'Turno Mañana',
        detail: 'Se administró Paracetamol 500mg vía oral. Paciente tolera bien. Tª descendiendo: 38.1°C → 37.2°C. Sin efectos adversos observados.',
        medication: 'Paracetamol',
        dose: '500mg',
        route: 'Oral',
        timestamp: Date.now() - 8 * 60 * 60 * 1000,
        isAmendment: false,
        amendedLogId: null
      },
      {
        id: 'tlog_2',
        patientId: 'p_1',
        entryType: 'observation',
        userId: 'nurse_1',
        userName: 'Enf. Elena Soler',
        userRole: 'nurse',
        shift: 'Turno Mañana',
        detail: 'Control de enfermías 09:30h. Signos vitales estables: PA 118/76 mmHg, FC 68 lpm, Temp 36.9°C, SpO2 99%. Paciente descansando, refiere leve cefalea residual. Se orienta tiempo y espacio.',
        medication: null,
        dose: null,
        route: null,
        timestamp: Date.now() - 5 * 60 * 60 * 1000,
        isAmendment: false,
        amendedLogId: null
      },
      {
        id: 'tlog_3',
        patientId: 'p_1',
        entryType: 'treatment',
        userId: 'doctor_1',
        userName: 'Dra. Ana Ruiz',
        userRole: 'doctor',
        shift: 'Turno Tarde',
        detail: 'RELEVO TURNO TARDE: Paciente con evolución favorable. Se indica continuar hidratación oral libre. Si fiebre > 38°C, administrar segunda dosis de Paracetamol. Alta médica probable mañana si mantiene estabilidad.',
        medication: null,
        dose: null,
        route: null,
        timestamp: Date.now() - 2 * 60 * 60 * 1000,
        isAmendment: false,
        amendedLogId: null
      },
      {
        id: 'tlog_4',
        patientId: 'p_1',
        entryType: 'amendment',
        userId: 'nurse_1',
        userName: 'Enf. Elena Soler',
        userRole: 'nurse',
        shift: 'Turno Tarde',
        detail: 'ENMIENDA al registro anterior: Aclaración: la SpO2 registrada a las 09:30h fue 97% (no 99%). Error tipográfico en el reporte inicial. El valor clínico es igualmente normal.',
        medication: null,
        dose: null,
        route: null,
        timestamp: Date.now() - 90 * 60 * 1000,
        isAmendment: true,
        amendedLogId: 'tlog_2'
      },
      {
        id: 'tlog_5',
        patientId: 'p_2',
        entryType: 'observation',
        userId: 'doctor_1',
        userName: 'Dra. Ana Ruiz',
        userRole: 'doctor',
        shift: 'Turno Mañana',
        detail: 'Evaluación inicial ingreso urgencias. Paciente masculino 33a con dolor torácico 7/10. ECG: ritmo sinusal, sin cambios ST. Solicito enzimas cardíacas. Monitoreo contínuo indicado.',
        medication: null,
        dose: null,
        route: null,
        timestamp: Date.now() - 4 * 60 * 60 * 1000,
        isAmendment: false,
        amendedLogId: null
      }
    ],
    passwordPolicies: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
      expirationDays: 90,
      preventReuse: 3,
      sessionTimeoutMinutes: 480
    },

    // ===== MÓDULO DE COMUNICACIÓN Y NOTIFICACIONES =====
    messages: [
      {
        id: 'msg_1',
        recipientId: 'p_1',
        recipientName: 'María Gómez',
        title: 'Confirmación de cita médica',
        content: 'Estimada María, le confirmamos su cita de Medicina General con la Dra. Ana Ruiz. Por favor llegue 15 minutos antes de la hora programada y traiga su documento de identidad.',
        channel: 'email',
        priority: 'normal',
        status: 'delivered',
        type: 'appointment_confirmation',
        createdBy: 'admin_1',
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000
      },
      {
        id: 'msg_2',
        recipientId: 'p_2',
        recipientName: 'Juan López',
        title: 'Resultados de laboratorio disponibles',
        content: 'Sr. Juan López, sus resultados de laboratorio ya están disponibles. Puede consultarlos en su próxima visita o solicitar una copia digital a través de recepción.',
        channel: 'sms',
        priority: 'high',
        status: 'sent',
        type: 'lab_results',
        createdBy: 'doctor_1',
        createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000
      },
      {
        id: 'msg_3',
        recipientId: 'd_1',
        recipientName: 'Dra. Ana Ruiz',
        title: 'Reunión de personal médico',
        content: 'Se le informa que la reunión mensual del personal médico se realizará el próximo viernes a las 10:00 AM en la sala de conferencias. Asistencia obligatoria.',
        channel: 'internal',
        priority: 'normal',
        status: 'read',
        type: 'administrative',
        createdBy: 'admin_1',
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000
      },
      {
        id: 'msg_test_badge',
        recipientId: 'admin_1',
        recipientName: 'Administrador',
        title: 'Prueba de Notificación Pendiente',
        content: 'Este es un mensaje de prueba para verificar que el punto rojo y el contador del menú de notificaciones funcionan correctamente.',
        channel: 'internal',
        priority: 'high',
        status: 'pending',
        type: 'test',
        createdBy: 'doctor_1',
        createdAt: Date.now()
      }
    ],

    notifications: [
      {
        id: 'notif_1',
        recipientId: 'p_1',
        recipientName: 'María Gómez',
        title: 'Recordatorio: Cita mañana',
        content: 'Recuerde que tiene una cita de control con la Dra. Ana Ruiz mañana. No olvide traer sus exámenes previos.',
        channel: 'push',
        priority: 'normal',
        status: 'delivered',
        type: 'appointment_reminder',
        createdBy: 'system',
        createdAt: Date.now() - 12 * 60 * 60 * 1000
      },
      {
        id: 'notif_2',
        recipientId: 'admin_1',
        recipientName: 'Administrador',
        title: 'Alerta: Insumo con stock bajo',
        content: 'El insumo "Oxígeno (Tanque)" está por debajo del nivel mínimo de stock. Se requiere reabastecimiento urgente.',
        channel: 'system',
        priority: 'critical',
        status: 'pending',
        type: 'stock_alert',
        createdBy: 'system',
        createdAt: Date.now() - 2 * 60 * 60 * 1000
      }
    ],

    reminders: [
      {
        id: 'rem_1',
        appointmentId: 'apt_1',
        recipientId: 'p_1',
        recipientName: 'María Gómez',
        title: 'Recordatorio de cita médica',
        content: 'Tiene una cita programada con la Dra. Ana Ruiz en Medicina General. Recuerde llevar su cédula de identidad y cualquier examen reciente.',
        channel: 'internal',
        priority: 'normal',
        status: 'scheduled',
        type: 'appointment_reminder',
        scheduledAt: Date.now() + 24 * 60 * 60 * 1000,
        createdBy: 'system',
        createdAt: Date.now() - 48 * 60 * 60 * 1000
      }
    ],

    communicationLogs: [
      {
        id: 'clog_1',
        messageId: 'msg_1',
        title: 'Mensaje enviado',
        content: 'Confirmación de cita médica',
        channel: 'email',
        recipientId: 'p_1',
        recipientName: 'María Gómez',
        status: 'sent',
        type: 'log',
        priority: 'normal',
        createdBy: 'admin_1',
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000
      },
      {
        id: 'clog_2',
        messageId: 'msg_1',
        title: 'Mensaje entregado',
        content: 'Confirmación de cita médica',
        channel: 'email',
        recipientId: 'p_1',
        recipientName: 'María Gómez',
        status: 'delivered',
        type: 'log',
        priority: 'normal',
        createdBy: 'system',
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000 + 60000
      }
    ],

    loginHistory: [],

    // CONFIGURACIÓN DE PÁGINA DE BIENVENIDA
    landingConfig: {
      hero: {
        title: 'Sistema de Gestión de Citas Médicas',
        subtitle: 'Hospital Universitario Manuel Núñez Tovar',
        description: 'Plataforma integral para la administración eficiente de citas, historias clínicas y comunicaciones en el entorno hospitalario.',
        backgroundImage: 'img/hospital.jpg'
      },
      stats: [
        { label: 'Citas registradas', value: 'auto' },
        { label: 'Médicos activos', value: 'auto' },
        { label: 'Áreas médicas', value: 'auto' },
        { label: 'Pacientes atendidos', value: 'auto' }
      ],
      contact: {
        email: 'info@humnt.gob.ve',
        phone: '+58 (123) 456-7890',
        address: 'Av. Universidad, Maturín, Venezuela'
      },
      social: {
        instagram: '@humnt_oficial',
        telegram: '@humnt_citas',
        facebook: '/hospitalmanuelnunez',
        whatsapp: '+58 424-1234567'
      }
    },

    // ===== REGISTRO SIMULADO (Simulación de SAIME/CNE para precarga) =====
    simulatedRegistry: [
      {
        docType: 'V',
        dni: '20123456',
        name: 'Carlos Alberto Rodríguez',
        birthDate: '1992-05-20',
        birthPlace: 'Caracas, DC',
        nationality: 'Venezolana',
        gender: 'M',
        civilStatus: 'Soltero/a',
        carnetExpiry: '2029-08-10',
        phone: '0412-5551234',
        email: 'carlos.rod@email.com'
      },
      {
        docType: 'V',
        dni: '25987654',
        name: 'Yulimar del Valle Rojas',
        birthDate: '1995-10-21',
        birthPlace: 'Barcelona, Anzoátegui',
        nationality: 'Venezolana',
        gender: 'F',
        civilStatus: 'Casado/a',
        carnetExpiry: '2030-01-05',
        phone: '0424-9998877',
        email: 'yulirojas@email.com'
      },
      {
        docType: 'E',
        dni: '82123456',
        name: 'Jean Pierre Dupont',
        birthDate: '1978-02-14',
        birthPlace: 'París, Francia',
        nationality: 'Francesa',
        gender: 'M',
        civilStatus: 'Casado/a',
        carnetExpiry: '2025-11-30',
        phone: '0416-1112233',
        email: 'jp.dupont@email.com'
      }
    ]
  };

  // Cargar datos
  function loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migración de versiones si es necesario
        if (parsed.version !== defaultData.version) {
          console.log('Migrando datos a nueva versión');
          return migrateData(parsed, defaultData);
        }
        return parsed;
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    }
    return defaultData;
  }

  // Migración simple de datos
  function migrateData(oldData, newData) {
    // Conservar datos existentes y agregar estructura nueva
    const migrated = { ...newData };

    // Migrar todas las propiedades existentes del oldData
    Object.keys(oldData).forEach(key => {
      // El simulatedRegistry siempre usa los datos nuevos (defaults)
      if (key === 'simulatedRegistry') return;

      // Si es un array (colección), lo migramos solo si tiene datos
      if (Array.isArray(oldData[key])) {
        if (oldData[key].length > 0) {
          // Caso especial: para la colección de usuarios, queremos asegurar que los defaults existan
          if (key === 'users') {
            const existingIds = new Set(oldData[key].map(u => u.id));
            const newDefaults = newData[key].filter(u => !existingIds.has(u.id));
            migrated[key] = [...oldData[key], ...newDefaults];
          } else {
            migrated[key] = oldData[key];
          }
        }
      } else if (typeof oldData[key] === 'object' && oldData[key] !== null) {
        // Si es un objeto, lo mezclamos con el nuevo (para no perder claves nuevas)
        migrated[key] = { ...migrated[key], ...oldData[key] };
      } else {
        // Primitivos
        migrated[key] = oldData[key];
      }
    });

    return migrated;
  }

  // Guardar datos
  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (bus) {
        bus.emit('store:saved', { timestamp: Date.now() });
      }
    } catch (error) {
      console.error('Error guardando datos:', error);
      if (bus) {
        bus.emit('store:save:error', { error });
      }
    }
  }

  let data = loadData();

  // Funciones auxiliares
  function generateId(prefix) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${prefix}_${timestamp}_${random}`;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  const store = {
    // ===== GETTERS =====
    get(collection) {
      return deepClone(data[collection] || []);
    },

    find(collection, id) {
      const items = data[collection] || [];
      const item = items.find(item => item.id === id);
      return item ? deepClone(item) : null;
    },

    query(collection, query = {}) {
      const items = data[collection] || [];
      return deepClone(items.filter(item => {
        return Object.entries(query).every(([key, value]) => {
          if (value === undefined || value === null) return true;
          if (typeof value === 'function') return value(item[key]);
          if (Array.isArray(value)) return value.includes(item[key]);
          return item[key] == value;
        });
      }));
    },

    // ===== MUTACIONES =====
    add(collection, itemData) {
      if (!data[collection]) {
        data[collection] = [];
      }

      const now = Date.now();
      const item = {
        id: itemData.id || generateId(collection.slice(0, 3)),
        ...itemData,
        createdAt: itemData.createdAt || now,
        updatedAt: now,
        isActive: itemData.isActive !== false
      };

      data[collection].push(item);
      saveData(data);

      if (bus) {
        bus.emit(`store:${collection}:added`, { item });
        bus.emit('store:changed', { collection, action: 'add', item });
      }

      return deepClone(item);
    },

    update(collection, id, changes) {
      const items = data[collection] || [];
      const index = items.findIndex(item => item.id === id);

      if (index === -1) {
        return null;
      }

      const updatedItem = {
        ...items[index],
        ...changes,
        updatedAt: Date.now()
      };

      items[index] = updatedItem;
      data[collection] = items;
      saveData(data);

      if (bus) {
        bus.emit(`store:${collection}:updated`, { item: updatedItem });
        bus.emit('store:changed', { collection, action: 'update', item: updatedItem });
      }

      return deepClone(updatedItem);
    },

    remove(collection, id) {
      const items = data[collection] || [];
      const index = items.findIndex(item => item.id === id);

      if (index === -1) {
        return false;
      }

      const [removedItem] = items.splice(index, 1);
      data[collection] = items;
      saveData(data);

      if (bus) {
        bus.emit(`store:${collection}:removed`, { item: removedItem });
        bus.emit('store:changed', { collection, action: 'remove', item: removedItem });
      }

      return true;
    },

    // ===== OPERACIONES ESPECIALES =====
    getStats() {
      const stats = {};
      Object.keys(data).forEach(collection => {
        if (Array.isArray(data[collection])) {
          stats[collection] = data[collection].length;
        }
      });
      return stats;
    },

    getTodayAppointments() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return this.query('appointments', {
        dateTime: value => {
          const appointmentDate = new Date(value);
          return appointmentDate >= today && appointmentDate < tomorrow;
        }
      });
    },

    getUpcomingAppointments(days = 7) {
      const now = new Date();
      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + days);

      return this.query('appointments', {
        dateTime: value => {
          const appointmentDate = new Date(value);
          return appointmentDate >= now && appointmentDate <= futureDate;
        }
      });
    },

    // ===== UTILIDADES =====
    async reset() {
      if (await hospitalConfirm('¿Estás seguro de resetear todos los datos? Se perderá toda la información.', 'danger')) {
        data = deepClone(defaultData);
        saveData(data);

        if (bus) {
          bus.emit('store:reset');
        }

        return true;
      }
      return false;
    },

    exportData() {
      return deepClone(data);
    },

    importData(newData) {
      data = deepClone(newData);
      saveData(data);

      if (bus) {
        bus.emit('store:imported');
      }

      return true;
    },

    // ===== SUSCRIPCIONES =====
    subscribe(collection, callback) {
      if (!bus) return () => { };

      const listener = (event) => {
        if (event.detail.collection === collection) {
          callback(event.detail);
        }
      };

      bus.on('store:changed', listener);

      // Retornar función para desuscribirse
      return () => {
        bus.off('store:changed', listener);
      };
    },

    // ===== REGISTRY SIMULADO (SAIME MOCK) =====
    fetchFromRegistry(docType, dni) {
      // Siempre leer del defaultData para que actualizaciones al registro surtan efecto sin resetear localStorage
      const registry = defaultData.simulatedRegistry || [];
      const entry = registry.find(r => r.docType === docType && r.dni === dni);
      return entry ? deepClone(entry) : null;
    }
  };

  return store;
}