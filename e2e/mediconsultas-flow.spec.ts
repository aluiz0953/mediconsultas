import { test, expect, type Page } from '@playwright/test';
import { generateValidCpf, uniqueSuffix } from './helpers.js';

// Full-cycle E2E for the MediConsultas MVP:
//   1. Patient signs up and logs in (PAT-01).
//   2. Admin approves a newly registered doctor (DOC-01/ADM-06).
//   3. Secretary schedules and confirms an appointment (SEC-04/SEC-05).
//   4. Doctor starts the appointment, finalizes a clinical record (releasing
//      it to the patient) and finalizes a prescription with a PDF (DOC-04/05/06,
//      RF-09).
//   5. Patient views the released record and downloads the prescription PDF (PAT-06/07).
//
// Steps run in series (see playwright.config.ts: fullyParallel: false,
// workers: 1) because they share state through a real, persistent Postgres —
// there is no reset between runs, so every run generates fresh unique data
// (see helpers.ts) instead of relying on fixtures being wiped.
//
// Doctor registration has no UI form yet (DOC-01 only exists as a backend
// endpoint), so that one setup step goes through the API directly; every
// other step drives the real browser UI.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@mediconsultas.dev';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Senha#Forte10';
const SECRETARY_EMAIL = process.env.E2E_SECRETARY_EMAIL ?? 'secretaria@mediconsultas.dev';
const SECRETARY_PASSWORD = process.env.E2E_SECRETARY_PASSWORD ?? 'Senha#Forte10';
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://localhost:8000';
const STRONG_PASSWORD = 'Senha#Forte10';

const suffix = uniqueSuffix();
const patient = {
  fullName: `Paciente E2E ${suffix}`,
  email: `paciente.e2e.${suffix}@example.com`,
  cpf: generateValidCpf(),
};
const doctor = {
  fullName: `Dra. E2E ${suffix}`,
  email: `medico.e2e.${suffix}@example.com`,
  license: `CRM-E2E-${suffix}`,
  id: '', // filled in by the DOC-01 setup step
};

const clinicalContent = {
  assessment: 'Paciente apresenta quadro estável, sem intercorrências no atendimento.',
  instructions: 'Manter repouso relativo e retornar caso os sintomas piorem.',
};
const medicationName = `Dipirona E2E ${suffix}`;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL('/login');
}

// SchedulePage/ConsultationPage pair each field's <label> with its control as
// plain DOM siblings (no htmlFor/id), so getByLabel doesn't apply — this
// mirrors that structure instead.
function fieldByLabel(page: Page, label: string) {
  return page.locator(`div:has(> label:has-text("${label}")) :is(textarea, input, select)`);
}

test.describe.serial('MediConsultas — ciclo completo ponta a ponta', () => {
  test('1. paciente cria conta e faz login (PAT-01)', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Nome completo').fill(patient.fullName);
    await page.getByLabel('CPF').fill(patient.cpf);
    await page.getByLabel('Data de nascimento').fill('1990-01-01');
    await page.getByLabel('E-mail').fill(patient.email);
    await page.getByLabel('Telefone').fill('11999999999');
    // Filled by hand (not via the CEP lookup) so the suite never depends on ViaCEP being up.
    await page.getByLabel('CEP').fill('01310-100');
    await page.getByLabel('Rua').fill('Rua Teste E2E');
    await page.getByLabel('Número').fill('123');
    await page.getByLabel('Bairro').fill('Centro');
    await page.getByLabel('Cidade').fill('São Paulo');
    await page.getByLabel('UF', { exact: true }).fill('SP');
    await page.getByLabel('Senha').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Criar conta' }).click();
    // Contact verification: needs EXPOSE_VERIFICATION_CODE=true on the API (no real e-mail/SMS provider).
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await page.getByLabel('Código de verificação').fill(await page.getByTestId('dev-code').innerText());
    await page.getByRole('button', { name: 'Confirmar e criar conta' }).click();

    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('status')).toContainText('Conta criada com sucesso');

    await login(page, patient.email, STRONG_PASSWORD);
    await logout(page);
  });

  test('2. admin aprova o cadastro do médico (DOC-01 + ADM-06)', async ({ page, request }) => {
    // DOC-01 has no UI form yet — register through the API, then approve through the real UI.
    const sent = await request.post(`${API_BASE_URL}/api/v1/verifications`, {
      data: { channel: 'email', destination: doctor.email },
    });
    const { id: verificationId, dev_code } = await sent.json();
    await request.post(`${API_BASE_URL}/api/v1/verifications/${verificationId}/confirm`, { data: { code: dev_code } });
    const response = await request.post(`${API_BASE_URL}/api/v1/doctors/register`, {
      data: {
        verification_id: verificationId,
        full_name: doctor.fullName,
        license_number: doctor.license,
        license_state: 'SP',
        specialty: 'Clínica Geral',
        email: doctor.email,
        password: STRONG_PASSWORD,
      },
    });
    expect(response.ok()).toBeTruthy();
    doctor.id = (await response.json()).id;
    expect(doctor.id).toBeTruthy();

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/doctors');

    const pendingRow = page.locator('li', { hasText: doctor.fullName });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.locator('li', { hasText: doctor.fullName })).toHaveCount(0);

    await logout(page);
  });

  test('3. secretária agenda e confirma a consulta (SEC-04 + SEC-05)', async ({ page }) => {
    await login(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
    await page.goto('/secretary/schedule');

    await page.getByPlaceholder('Buscar paciente por nome').fill(patient.fullName);
    await page.getByRole('button', { name: patient.fullName }).click();
    // Scoped to the scheduling form itself, not just the "Médico" label: the
    // page also has a status-filter <select> below and a second "Médico"
    // field in the schedule-block form further down, both ambiguous otherwise.
    // The label isn't programmatically associated with its field (no
    // htmlFor/id, no wrapping), so getByLabel can't see it either — same
    // reason fieldByLabel() exists; this inlines that pattern pre-scoped.
    await page
      .locator('form:has(button:has-text("Agendar consulta")) div:has(> label:has-text("Médico")) select')
      .selectOption(doctor.id);
    await page.getByRole('button', { name: 'Agendar consulta' }).click();

    const appointmentRow = page.locator('li', { hasText: patient.fullName });
    await expect(appointmentRow).toBeVisible();
    await appointmentRow.getByRole('button', { name: 'Confirmar' }).click();
    await expect(appointmentRow.getByText('Confirmada')).toBeVisible();

    await logout(page);
  });

  test('4. médico atende, finaliza prontuário e emite receita em PDF (DOC-04/05/06, RF-09)', async ({ page }) => {
    await login(page, doctor.email, STRONG_PASSWORD);
    await page.goto('/doctor/queue');

    const queueRow = page.locator('li', { hasText: patient.fullName });
    await expect(queueRow).toBeVisible();
    await queueRow.getByRole('button', { name: 'Iniciar atendimento' }).click();
    await expect(page).toHaveURL(/\/doctor\/appointments\/.+/);

    // DOC-05: fill and finalize the clinical record, releasing it to the patient.
    await fieldByLabel(page, 'Avaliação clínica').fill(clinicalContent.assessment);
    await fieldByLabel(page, 'Orientações ao paciente').fill(clinicalContent.instructions);
    await page.getByRole('button', { name: 'Abrir registro' }).click();
    await page.getByLabel('Liberar ao paciente').check();
    await page.getByRole('button', { name: 'Finalizar registro' }).click();
    await expect(page.getByText('Finalizado', { exact: true })).toBeVisible();

    // DOC-06/RF-09: fill and finalize the prescription, then download its PDF.
    await page.getByPlaceholder('Medicamento *').fill(medicationName);
    await page.getByPlaceholder('Dosagem').fill('1 comprimido');
    await page.getByPlaceholder('Frequência').fill('a cada 6 horas');
    await page.getByPlaceholder('Duração').fill('5 dias');
    await page.getByRole('button', { name: 'Abrir receita' }).click();
    await page.getByRole('button', { name: 'Finalizar receita' }).click();
    await expect(page.getByText('Finalizada', { exact: true })).toBeVisible();

    // Playwright's bundled Chromium downloads a blob: PDF instead of rendering
    // it inline, so `window.open` never produces a page that reaches 'load' —
    // the documented pattern is to await the 'download' event instead.
    // Scoped to the "Receita médica" section: the clinical record above also
    // has its own "Baixar PDF" button now (RF-08), so the bare button locator
    // is ambiguous between the two once both are finalized.
    const prescriptionSection = page.locator('section', { has: page.getByRole('heading', { name: 'Receita médica' }) });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      prescriptionSection.getByRole('button', { name: 'Baixar PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    await logout(page);
  });

  test('5. paciente visualiza a orientação liberada e baixa a receita em PDF (PAT-06/07)', async ({ page }) => {
    await login(page, patient.email, STRONG_PASSWORD);
    await page.goto('/patient/records');

    await expect(page.getByText(doctor.fullName).first()).toBeVisible();
    await expect(page.getByText(clinicalContent.instructions)).toBeVisible();

    await page.getByRole('button', { name: 'Receitas' }).click();
    await expect(page.getByText(medicationName)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    await logout(page);
  });
});
