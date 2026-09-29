import { useParams } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { ClinicalRecordSection } from './ClinicalRecordSection'
import { PrescriptionSection } from './PrescriptionSection'

export function ConsultationPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>()

  return (
    <div className="space-y-8">
      <PageHeader title="Atendimento em andamento" subtitle="Registro clínico e receita desta consulta." />
      <ClinicalRecordSection appointmentId={appointmentId} />
      <PrescriptionSection appointmentId={appointmentId} />
    </div>
  )
}
