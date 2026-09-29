# Desempenho: o que está no código e o que é infraestrutura

## Já no código
| Item | Onde |
|---|---|
| Payloads comprimidos (gzip > 1 kB; SSE excluído) | `apps/api/src/security.ts` |
| Consultas em lote, sem N+1 (`findByIds`) e INSERT multi-linha | repositórios de paciente/médico/receita |
| Índices no banco | `apps/api/migrations/003_performance_indexes.sql` e demais migrations |
| Pool de conexões (`DB_POOL_MAX`, timeout de conexão e de consulta, handler de erro) | `apps/api/src/db.ts` |
| Cache no servidor (configuração da clínica/logo, invalidado na atualização) | `CachedClinicSettingsRepository` |
| Divisão de código por rota (lazy) e fundo 3D só em desktop capaz | `apps/web/src/App.tsx`, `LoginPage.tsx` |
| Fontes locais (sem requisição bloqueante) | `apps/web/src/main.tsx` |
| Skeletons nos carregamentos | `apps/web/src/components/Skeleton.tsx` |
| UI otimista (confirmar/cancelar consulta) | `SchedulePage.tsx` |
| Compressão de imagem antes do upload da logo (máx. 512 px) | `apps/web/src/lib/image.ts` |
| Debounce nas buscas (300 ms) | agenda, busca de paciente |
| Minificação de JS/CSS | Vite (build de produção) |

## Não é código: precisa de infraestrutura
- **CDN**: coloque Cloudflare (ou equivalente) na frente do site e da API; os arquivos `assets/*` têm hash e podem ter cache longo (`immutable`). Não faça cache de respostas da API: contêm dados de pacientes (`Cache-Control: no-store` é proposital).
- **Balanceador de carga / várias instâncias**: só depois de medir a necessidade. Antes, mova para redis os estados que hoje ficam em memória de um processo: banimentos e contadores de rate limit (`abuse.ts`, `express-rate-limit`), tickets/conexões SSE e o cache da clínica (o TTL de 5 min limita a defasagem). O pool de banco multiplica por instância.
- **Região do servidor**: mantenha API e banco na mesma região e perto dos usuários (Brasil).

## Não feito de propósito
- **Cache HTTP de listas com dados clínicos**: risco de mostrar dado de outro paciente/desatualizado.
- **Paginação das listas de agenda**: o recorte já é por dia; listas administrativas têm limite (`limit`).
