import type PDFDocument from 'pdfkit';

// Shared by every generated PDF (receita, prontuário) so the clinic's logo
// (set by the secretary/admin via /api/v1/clinic-settings) appears the same
// way everywhere. A missing or corrupt logo must never break PDF generation.
export function renderLetterhead(doc: InstanceType<typeof PDFDocument>, logoBuffer: Buffer | null, title: string): void {
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, { width: 80, align: 'center' });
      doc.moveDown(0.5);
    } catch {
      // Corrupt/unsupported stored image — fall back to text-only header.
    }
  }

  doc.fontSize(20).font('Helvetica-Bold').text('MediConsultas', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Sistema Integrado de Gestão Médica', { align: 'center' });
  doc.moveDown(1.5);

  doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(1);
}
