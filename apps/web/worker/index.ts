// Single public entry point: static site (served by the assets binding) plus /api/* forwarded
// to the API through a Cloudflare Tunnel (VPC service), so the browser sees one origin: no CORS,
// and the API is not reachable from the internet at all.
interface Service {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>
}

interface Env {
  API: Service
}

// Where the API listens on the machine running the tunnel (see the VPC service).
const API_ORIGIN = 'http://localhost:8000'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const upstream = new Request(`${API_ORIGIN}${url.pathname}${url.search}`, request)
    // The API trusts these headers (TRUST_PROXY=1, GEO_TRUST_HEADER=true, GEO_COUNTRY_HEADER=x-client-country)
    // because only this Worker can reach it. Always overwrite: never pass through what a client sent.
    upstream.headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '')
    upstream.headers.set('x-forwarded-proto', 'https')
    upstream.headers.set('x-client-country', (request.cf?.country as string | undefined) ?? '')
    return env.API.fetch(upstream)
  },
}
