import { Router } from 'express';
import type { ClinicSettingsRepository } from '../repositories/clinic-settings-repository.js';

const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg']);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB decoded

export interface ClinicSettingsRouterConfig {
  repository: ClinicSettingsRepository;
}

// Mount behind requireAuth + requireRole('SECRETARY', 'ADMIN') — the logo is
// administrative branding, not clinical content, so it follows the
// secretary's usual scope rather than the doctor's.
export function clinicSettingsRouter(config: ClinicSettingsRouterConfig): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const settings = await config.repository.get();
    res.json({
      logo_base64: settings.logoBase64,
      logo_content_type: settings.logoContentType,
      updated_at: settings.updatedAt?.toISOString() ?? null,
    });
  });

  router.put('/logo', async (req, res) => {
    const { logo_base64, content_type } = req.body ?? {};
    if (typeof logo_base64 !== 'string' || !logo_base64.trim() || typeof content_type !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'logo_base64 e content_type são obrigatórios.' });
      return;
    }
    if (!ALLOWED_CONTENT_TYPES.has(content_type)) {
      res.status(400).json({ code: 'INVALID_CONTENT_TYPE', message: 'A logo deve ser PNG ou JPEG.' });
      return;
    }

    let decodedLength: number;
    try {
      decodedLength = Buffer.from(logo_base64, 'base64').length;
    } catch {
      res.status(400).json({ code: 'INVALID_IMAGE', message: 'Não foi possível decodificar a imagem enviada.' });
      return;
    }
    if (decodedLength === 0 || decodedLength > MAX_LOGO_BYTES) {
      res.status(400).json({ code: 'IMAGE_TOO_LARGE', message: 'A logo deve ter no máximo 2MB.' });
      return;
    }

    const updated = await config.repository.updateLogo(logo_base64, content_type, req.user?.sub ?? null);
    res.json({
      logo_base64: updated.logoBase64,
      logo_content_type: updated.logoContentType,
      updated_at: updated.updatedAt?.toISOString() ?? null,
    });
  });

  return router;
}
