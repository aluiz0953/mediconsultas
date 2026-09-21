import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import type { PrescriptionItem } from '../repositories/prescription-repository.js';

export interface PrescriptionPdfData {
  prescriptionId: string;
  issuedAt: Date | null;
  items: PrescriptionItem[];
  noMedicationNeeded: boolean;
  doctorName: string;
  doctorLicense: string;
}

// RF-09: same PDF shape for both the doctor's and the patient's download endpoints.
export function renderPrescriptionPdf(res: Response, data: PrescriptionPdfData): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receita-${data.prescriptionId}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).font('Helvetica-Bold').text('MediConsultas', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Sistema Integrado de Gestão Médica', { align: 'center' });
  doc.moveDown(1.5);

  doc.fontSize(14).font('Helvetica-Bold').text('RECEITUÁRIO MÉDICO', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10).font('Helvetica-Bold').text('Profissional Responsável:');
  doc.font('Helvetica').text(`Dr(a). ${data.doctorName} — ${data.doctorLicense}`);
  doc.moveDown(0.5);

  const issuedDate = (data.issuedAt ?? new Date()).toLocaleDateString('pt-BR');
  doc.fontSize(10).font('Helvetica-Bold').text(`Data de Emissão: ${issuedDate}`);
  doc.moveDown(1.5);

  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();
  doc.moveDown(1.5);

  doc.fontSize(12).font('Helvetica-Bold').text('Prescrição de Medicamentos:', { underline: true });
  doc.moveDown(1);

  if (data.noMedicationNeeded) {
    doc.fontSize(11).font('Helvetica-Oblique').text('Conduta sem necessidade de prescrição medicamentosa nesta consulta.');
  } else {
    data.items.forEach((item, index) => {
      doc.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${item.medicationName}`);
      doc.fontSize(10).font('Helvetica');
      if (item.strength) doc.text(`   Concentração / Apresentação: ${item.strength}`);
      if (item.dosage) doc.text(`   Posologia / Dosagem: ${item.dosage}`);
      if (item.frequency) doc.text(`   Frequência: ${item.frequency}`);
      if (item.duration) doc.text(`   Duração: ${item.duration}`);
      if (item.instructions) doc.text(`   Instruções Especiais: ${item.instructions}`);
      doc.moveDown(0.8);
    });
  }

  doc.moveDown(2);
  doc.moveTo(150, doc.y).lineTo(445, doc.y).strokeColor('#000000').lineWidth(0.5).stroke();
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(`Dr(a). ${data.doctorName}`, { align: 'center' });
  doc.text('Assinatura e Carimbo do Profissional', { align: 'center' });

  doc.end();
}
