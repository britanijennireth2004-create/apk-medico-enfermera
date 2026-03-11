/**
 * Generador de PDF para Recetas Médicas (APK)
 * Utiliza jsPDF para generar un formato profesional con firma digital.
 */

import { calculateAge } from './utils.js';

export async function generatePrescriptionPDF(data, doctor, patient) {
    const age = calculateAge(patient.birthDate);

    if (typeof window.UI !== 'undefined') {
        window.UI.showToast('Generando receta digital...', 'var(--themePrimary)');
    }

    try {
        // Cargar jsPDF si no está disponible
        if (typeof window.jspdf === 'undefined') {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            await new Promise((res, rej) => { s.onload = res; s.onerror = rej; document.head.appendChild(s); });
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a5'); // Formato A5 para recetas (más común)
        const pW = doc.internal.pageSize.getWidth();
        const pH = doc.internal.pageSize.getHeight();
        const m = 12;
        let y = 12;

        // --- ENCABEZADO ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 51, 102);
        doc.text('HOSPITAL UNIVERSITARIO MANUEL NÚÑEZ TOVAR', pW / 2, y, { align: 'center' });

        y += 5;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text('Maturín, Estado Monagas - Venezuela', pW / 2, y, { align: 'center' });

        y += 4;
        doc.setDrawColor(0, 51, 102);
        doc.setLineWidth(0.4);
        doc.line(m, y, pW - m, y);

        y += 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text('RECETA MÉDICA / INDICACIONES', pW / 2, y, { align: 'center' });

        // --- DATOS MÉDICO ---
        y += 10;
        doc.setFontSize(9);
        doc.text(doctor.name.toUpperCase(), m, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(doctor.specialty || 'Medicina General', m, y);
        if (doctor.license) {
            doc.text(`Matrícula: ${doctor.license}`, m, y + 4);
        }

        // Fecha a la derecha
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pW - m, y, { align: 'right' });

        y += 10;
        doc.setDrawColor(200);
        doc.line(m, y, pW - m, y);

        // --- DATOS PACIENTE ---
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('PACIENTE:', m, y);
        doc.setFont('helvetica', 'normal');
        doc.text(`${patient.name} (${age} años)`, m + 20, y);

        doc.text('DNI:', pW - m - 40, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`${patient.docType}-${patient.dni}`, pW - m, y, { align: 'right' });

        y += 8;
        doc.setLineWidth(0.1);
        doc.line(m, y, pW - m, y);

        // --- PRESCRIPCIONES (R/x) ---
        y += 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(0, 51, 102);
        doc.text('R/x', m, y);

        y += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0);

        let meds = data.prescriptions || 'Ver indicaciones generales';

        // Si es un arreglo (formato del store), convertir a string legible
        if (Array.isArray(meds)) {
            meds = meds.map((px, i) =>
                `${i + 1}. ${px.medication} — ${px.dosage} — ${px.frequency} — ${px.duration}`
            ).join('\n');
        } else if (typeof meds !== 'string') {
            meds = String(meds);
        }

        const medsLines = doc.splitTextToSize(meds, pW - 2 * m);
        doc.text(medsLines, m, y);

        y += medsLines.length * 5 + 6; // Reducido un poco el interlineado de 6 a 5 para optimizar espacio

        // --- INDICACIONES ---
        if (data.treatment || data.restIndications) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('INDICACIONES GENERALES:', m, y);
            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            const notes = `${data.treatment || ''}\n${data.restIndications || ''}`;
            const notesLines = doc.splitTextToSize(notes, pW - 2 * m);
            doc.text(notesLines, m, y);
            y += notesLines.length * 4 + 8;
        }

        // --- FIRMA DIGITAL ---
        const sigY = pH - 40;
        if (doctor.signature) {
            try {
                // La firma es un base64 del canvas
                doc.addImage(doctor.signature, 'PNG', pW / 2 - 25, sigY - 20, 50, 20);
            } catch (err) {
                console.error("Error al incluir firma:", err);
            }
        }

        doc.setLineWidth(0.3);
        doc.setDrawColor(0);
        doc.line(pW / 2 - 30, sigY, pW / 2 + 30, sigY);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(doctor.name, pW / 2, sigY + 5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(doctor.specialty || 'Médico Responsable', pW / 2, sigY + 9, { align: 'center' });

        // --- PIE DE PÁGINA ---
        doc.setFontSize(6);
        doc.setTextColor(150);
        doc.text('Documento generado electrónicamente - Válido como orden médica oficial', pW / 2, pH - 8, { align: 'center' });

        // Guardar y Previsualizar
        const fileName = `RECETA_${patient.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        doc.save(fileName);

        if (typeof window.UI !== 'undefined') {
            window.UI.showToast('✅ Receta descargada con éxito', 'var(--green)');
        }

    } catch (e) {
        console.error("Error PDF:", e);
        if (typeof window.UI !== 'undefined') {
            window.UI.showToast('❌ Error al generar la receta', 'var(--red)');
        }
    }
}
