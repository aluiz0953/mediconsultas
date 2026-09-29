# Segurança em produção: DDoS, bloqueio por país e VPN, honeypots

O que a API faz sozinha e o que precisa ser feito **fora do código**.

## Limite honesto sobre DDoS
A API (Node) só consegue se defender de abuso na camada de aplicação (HTTP). Ataques volumétricos (L3/L4, milhões de pacotes/s) esgotam a banda antes de chegarem ao Node: esses precisam de um provedor na frente. Em produção:

1. Coloque um **CDN/WAF** na frente da API e do site (Cloudflare, por exemplo), com proxy ligado.
2. **Bloqueie o acesso direto à origem**: o servidor só deve aceitar conexões dos IPs do CDN (firewall do host/PaaS). Sem isso, o atacante ignora o CDN e o cabeçalho de país pode ser forjado.
3. No CDN, ative: regra por país (só Brasil), "Bot Fight"/desafio para tráfego suspeito, rate limiting por rota e "Under Attack" em emergência.
4. Configure `TRUST_PROXY=1` (número de proxies à frente) para a API enxergar o IP real.

## O que a API já faz (`apps/api/src`)
| Defesa | Onde | Padrão |
|---|---|---|
| IP banido → 403 imediato antes de qualquer trabalho | `abuse.ts` | sempre |
| Honeypot de rotas (`/.env`, `/wp-login.php`, `/api/v1/admin/backup`…) → ban de 1 h | `abuse.ts` | sempre |
| Campo honeypot oculto nos formulários públicos (`website`) → ban de 1 h + falso sucesso | `abuse.ts`, `HoneypotField.tsx` | sempre |
| 3 estouros de rate limit em 10 min → ban de 15 min | `security.ts` | sempre |
| Rate limit por IP (geral, login falho, cadastro/verificação/reset) | `security.ts` | sempre |
| Timeouts contra clientes lentos (slowloris), corpo JSON de 100 kb (4 MB só na logo) | `index.ts` | sempre |
| Teto de conexões em tempo real (5 por conta, 1000 no total) | `appointment-events-sse.ts` | sempre |
| **Só Brasil** | `geo.ts` | ligado com `NODE_ENV=production` |
| **Bloqueio de VPN** (lista pública de faixas) | `geo.ts` | ligado com `NODE_ENV=production` |

IPs privados/loopback nunca são banidos nem bloqueados (evita derrubar todo mundo quando há proxy sem `TRUST_PROXY`).

## Configurar país (escolha uma fonte)
- **GeoIP local (recomendado, sem enviar IP de paciente a terceiros):** baixe o `GeoLite2-Country.mmdb` da MaxMind (conta gratuita), guarde fora do git e defina `GEOIP_DB_PATH=/caminho/GeoLite2-Country.mmdb`.
- **Cabeçalho do CDN:** `GEO_TRUST_HEADER=true` (usa `CF-IPCountry`; mude com `GEO_COUNTRY_HEADER`). **Só** use se a origem aceitar tráfego apenas do CDN.
- Sem nenhuma das duas, o filtro de país fica desligado e a API registra `security.geo-unconfigured`.
- País desconhecido é permitido (falhar fechado derrubaria o serviço se a fonte sumir). Tor (`T1`) é bloqueado.

## VPN
`npm run update:vpn-list -w apps/api` baixa ~11 mil faixas (X4BNet/lists_vpn) para `apps/api/data/vpn-ipv4.txt`. Rode no deploy e **semanalmente**. Limites: só IPv4, só faixas conhecidas; VPN residencial, Tor e proxies novos passam. Para reputação de IP em tempo real, use o recurso equivalente do CDN.

## Riscos de bloquear (leia antes de ligar)
- Brasileiros no exterior e quem usa VPN por privacidade/corporativa ficam sem acesso, inclusive pacientes. `ACCESS_BYPASS_IPS` libera IPs específicos (ex.: a clínica).
- Redes móveis com CGNAT às vezes caem em listas de VPN/datacenter; monitore `security.access-denied` nos logs antes de confiar na lista.
- Para desligar: `GEO_ALLOWED_COUNTRIES=` (vazio) e `BLOCK_VPN=false`.

## Logs
Eventos de segurança saem em JSON no stderr (`security.ban`, `security.access-denied`, …). Encaminhe-os a um agregador e crie alerta para picos de `security.ban`.

## Variáveis
`TRUST_PROXY`, `GEO_ALLOWED_COUNTRIES`, `GEOIP_DB_PATH`, `GEO_TRUST_HEADER`, `GEO_COUNTRY_HEADER`, `BLOCK_VPN`, `VPN_LIST_PATH`, `ACCESS_BYPASS_IPS`, `RATE_LIMIT_DISABLED` e `ABUSE_GUARD_DISABLED` (as duas últimas só para testes).

## Deploy no Cloudflare: site + API no mesmo endereço, API por túnel nomeado
Um único Worker (`apps/web/worker/index.ts`) serve o site estático e repassa `/api/*` para a API por um **Cloudflare Tunnel** (serviço VPC do Workers). Resultado: um endereço fixo (`https://mediconsultas.<sua-conta>.workers.dev`), sem CORS e com a API **fora da internet** (só o Worker chega nela). O Worker é o único que preenche `X-Forwarded-For` (IP real) e `X-Client-Country` (país do Cloudflare), sempre sobrescrevendo o que o cliente enviar.

**Uma vez** (já feito): `wrangler tunnel create mediconsultas-api` e `wrangler vpc service create mediconsultas-api --type http --tunnel-id <id-do-túnel> --ipv4 127.0.0.1 --http-port 8000`; o id do serviço fica em `apps/web/wrangler.jsonc`.

**Na máquina que hospeda a API** (precisa ficar ligada):
1. API: `NODE_ENV=production HOST=127.0.0.1 TRUST_PROXY=1 GEO_TRUST_HEADER=true GEO_COUNTRY_HEADER=x-client-country EXPOSE_VERIFICATION_CODE=false CORS_ORIGINS=http://localhost node dist/index.js` (`CORS_ORIGINS` só serve ao app Android, cuja origem é `http://localhost`).
2. Túnel: `wrangler tunnel run <id-do-túnel>` (usa o `cloudflared`).

**Publicar o site**: `npm run deploy:cloudflare -w apps/web` (sem `VITE_API_URL`: as chamadas são do mesmo endereço).
**App Android**: `VITE_API_URL=https://mediconsultas.<sua-conta>.workers.dev` em `apps/web/.env.android.local` e `npm run build:android -w apps/web`.

Limites: o banco (Postgres) e a API continuam na máquina local, então ela precisa estar ligada. Sem e-mail/SMS o cadastro de paciente não conclui em produção (o código de verificação não é exibido).

## Banco de dados no Supabase (Postgres gerenciado)
Os scripts ficam em `apps/api/scripts/` e leem só variáveis de ambiente (arquivo `apps/api/.env.supabase`, ignorado pelo git; **valores com `#` precisam de aspas**). Rode `npm run build -w apps/api` antes.

1. **Projeto**: região South America (São Paulo), senha forte gerada ao acaso. Em *Connect*, copie a URL do **Session pooler** (funciona em IPv4) para `DATABASE_URL`, **sem** `?sslmode=`. Baixe o certificado em *Settings → Database → SSL Configuration*, aponte `DATABASE_SSL_CA_PATH` para ele e ligue **Enforce SSL**.
2. **Esquema**: `node --env-file=apps/api/.env.supabase apps/api/scripts/migrate.mjs` (aplica as migrations uma vez cada; recusa banco que já tem tabelas sem histórico).
3. **Primeiro administrador**: `ADMIN_EMAIL=... ADMIN_PASSWORD=... node --env-file=... apps/api/scripts/create-admin.mjs` (política de senha do app; contas ADMIN/SECRETARY só nascem por convite).
4. **Endurecimento**: `APP_DB_USER=mediconsultas_app APP_DB_PASSWORD=<24+ caracteres> node --env-file=... apps/api/scripts/harden.mjs`. Liga RLS em todas as tabelas com uma política só para o papel da API (a Data API do Supabase, com `anon`/`authenticated`, não enxerga nada mesmo que uma chave vaze), cria esse papel sem superusuário/DDL/`BYPASSRLS` (só SELECT/INSERT/UPDATE/DELETE; `audit_events` só SELECT/INSERT, então o log de auditoria não é apagável nem editável), com limite de conexões e timeouts, e revoga o acesso padrão de `PUBLIC`/`anon`/`authenticated`.
5. **A API passa a usar o papel restrito**: no pooler o usuário é `mediconsultas_app.<ref-do-projeto>`. Migrations e `harden` continuam sendo executados com o dono (`postgres`), nunca pela API.
6. **No painel**: desative a Data API se não for usada, restrinja IPs (Network Restrictions) quando o plano permitir, confira *Advisors → Security* (deve ficar sem alertas) e lembre que o plano gratuito não tem backup pontual.

Perder a `FIELD_ENCRYPTION_KEY` (criptografia de CPF e dados sensíveis) significa perder esses dados: guarde uma cópia fora do repositório.
