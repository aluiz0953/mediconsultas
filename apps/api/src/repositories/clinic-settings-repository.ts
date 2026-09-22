import type { Pool } from 'pg';

export interface ClinicSettings {
  logoBase64: string | null;
  logoContentType: string | null;
  updatedAt: Date | null;
}

const EMPTY_SETTINGS: ClinicSettings = { logoBase64: null, logoContentType: null, updatedAt: null };

export interface ClinicSettingsRepository {
  get(): Promise<ClinicSettings>;
  updateLogo(logoBase64: string, contentType: string, updatedBy: string | null): Promise<ClinicSettings>;
}

export class InMemoryClinicSettingsRepository implements ClinicSettingsRepository {
  private settings: ClinicSettings = EMPTY_SETTINGS;

  async get(): Promise<ClinicSettings> {
    return this.settings;
  }

  async updateLogo(logoBase64: string, contentType: string): Promise<ClinicSettings> {
    this.settings = { logoBase64, logoContentType: contentType, updatedAt: new Date() };
    return this.settings;
  }
}

export class PgClinicSettingsRepository implements ClinicSettingsRepository {
  constructor(private readonly pool: Pool) {}

  async get(): Promise<ClinicSettings> {
    const result = await this.pool.query(
      `SELECT logo_base64, logo_content_type, updated_at FROM clinic_settings WHERE id = TRUE`,
    );
    const row = result.rows[0];
    if (!row) return EMPTY_SETTINGS;
    return {
      logoBase64: row.logo_base64 ?? null,
      logoContentType: row.logo_content_type ?? null,
      updatedAt: row.updated_at ?? null,
    };
  }

  async updateLogo(logoBase64: string, contentType: string, updatedBy: string | null): Promise<ClinicSettings> {
    const result = await this.pool.query(
      `INSERT INTO clinic_settings (id, logo_base64, logo_content_type, updated_by)
       VALUES (TRUE, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET logo_base64 = $1, logo_content_type = $2, updated_by = $3, updated_at = NOW()
       RETURNING logo_base64, logo_content_type, updated_at`,
      [logoBase64, contentType, updatedBy],
    );
    const row = result.rows[0];
    return { logoBase64: row.logo_base64, logoContentType: row.logo_content_type, updatedAt: row.updated_at };
  }
}
