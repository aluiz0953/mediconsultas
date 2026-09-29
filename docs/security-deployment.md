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
