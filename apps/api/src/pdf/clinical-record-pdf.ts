import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { renderLetterhead } from './letterhead.js';

export interface ClinicalRecordPdfContent {
  chief_complaint?: string;
  assessment?: string;
  instructions?: string;
  conduct?: string;
  medications?: string;
  recommended_exams?: string;
  notes?: string;
}

export interface ClinicalRecordPdfData {
  recordId: string;
  version: number;
  finalizedAt: Date | null;
  patientName: string;
  doctorName: string;
  doctorLicense: string;
  content: ClinicalRecordPdfContent;
  logoBuffer: Buffer | null;
}

const SECTIONS: Array<{ key: keyof ClinicalRecordPdfContent; label: string }> = [
  { key: 'chief_complaint', label: 'Queixa Principal' },
  { key: 'assessment', label: 'Avaliação Clínica' },
  { key: 'instructions', label: 'Orientações ao Paciente' },
  { key: 'conduct', label: 'Conduta' },
  { key: 'medications', label: 'Medicações em Uso' },
  { key: 'recommended_exams', label: 'Exames Recomendados' },
  { key: 'notes', label: 'Notas' },
];

// RF-08/DOC-05: printable version of a finalized clinical record, same
// letterhead and layout conventions as the prescription PDF (RF-09).
export function renderClinicalRecordPdf(res: Response, data: ClinicalRecordPdfData): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="prontuario-${data.recordId}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  renderLetterhead(doc, data.logoBuffer, 'REGISTRO CLÍNICO');

  doc.fontSize(10).font('Helvetica-Bold').text('Paciente:');
  doc.font('Helvetica').text(data.patientName);
  doc.moveDown(0.5);

  doc.fontSize(10).font('Helvetica-Bold').text('Profissional Responsável:');
  doc.font('Helvetica').text(`Dr(a). ${data.doctorName} — ${data.doctorLicense}`);
  doc.moveDown(0.5);

  const finalizedDate = (data.finalizedAt ?? new Date()).toLocaleDateString('pt-BR');
  doc.fontSize(10).font('Helvetica-Bold').text(`Data de Finalização: ${finalizedDate} (versão ${data.version})`);
  doc.moveDown(1.5);

  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();
  doc.moveDown(1.5);

  for (const section of SECTIONS) {
    const value = data.content[section.key];
    if (!value?.trim()) continue;
    doc.fontSize(11).font('Helvetica-Bold').text(`${section.label}:`);
    doc.fontSize(10).font('Helvetica').text(value);
    doc.moveDown(1);
  }

  doc.moveDown(1);
  doc.moveTo(150, doc.y).lineTo(445, doc.y).strokeColor('#000000').lineWidth(0.5).stroke();
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(`Dr(a). ${data.doctorName}`, { align: 'center' });
  doc.text('Assinatura e Carimbo do Profissional', { align: 'center' });

  doc.end();
}
