# Siesta

Sales Engineering portfolio management platform powered by MCP (Model Context Protocol). Provides unified visibility into accounts, interactions, and portfolio health.

## Features

- **Personal Dashboard** -- Accounts with open opportunities, pipeline totals, action items (issues + verbal commitments from Gong calls)
- **Account Management** -- AI-generated account summaries, action items, opportunities, grouped email threads, expandable Gong call summaries, meetings, and notes
- **AI-Powered Insights** -- OpenAI-generated account overviews, email thread summaries, and action item extraction (gpt-4o-mini, Redis-cached)
- **Email Thread Grouping** -- Emails grouped by thread with expandable inline AI summaries (one-line preview collapsed, full summary expanded)
- **Gong Call Summaries** -- Calls expandable inline to show full Gong summaries on both account detail and search pages
- **Semantic Search** -- Full-text search across all account interactions with inline call expansion
- **Google Integration** -- Calendar and Gmail integration via OAuth (configurable through Settings UI)
- **MCP-Powered** -- All data aggregated from Salesforce, Gong, Zendesk, GitHub, Gmail, and Calendar via portfolio-analyzer MCP server
- **Redis Caching** -- Per-endpoint TTL caching to reduce MCP server load
- **Agent Gateway** -- Enterprise Agent Gateway for MCP traffic routing, TLS termination, API key auth, and web app serving
- **Keycloak OIDC** -- Enterprise SSO with PKCE authorization code flow

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, TanStack Router + Query, Tailwind CSS 4, TipTap |
| Backend | Fastify 5, Node.js 20+, TypeScript 5.7 |
| Database | PostgreSQL 16 (CloudNativePG, Drizzle ORM) |
| Cache | Redis 7 (ioredis) |
| AI | OpenAI (gpt-4o-mini) via Agent Gateway |
| Data | MCP (portfolio-analyzer) via Enterprise Agent Gateway |
| Auth | Keycloak OIDC + Google OAuth |
| TLS | cert-manager + Let's Encrypt (Cloudflare DNS-01) |
| Gateway | Enterprise Agent Gateway (Gateway API) |
| Monorepo | Turborepo, npm workspaces |
| Infra | GKE Autopilot, Docker, Kubernetes |

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker and Docker Compose (for local PostgreSQL and Redis)

## Getting Started

1. **Start infrastructure**
   ```bash
   docker-compose up -d
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MCP, OpenAI, and other credentials
   ```

4. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

5. **Start development servers**
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start all apps in development mode |
| `npm run build` | Build all packages and apps |
| `npm run typecheck` | Type-check all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run db:generate` | Generate Drizzle migrations from schema |
| `npm run db:migrate` | Run pending database migrations |
| `npm run db:studio` | Open Drizzle Studio GUI |

## Project Structure

```
apps/
  server/src/
    routes/              # Fastify route handlers
    services/            # Business logic (mcp-*.service.ts, cache.service.ts, openai-summary.service.ts)
    integrations/mcp/    # MCP client (auth.ts, client.ts, types.ts)
    db/schema/           # Drizzle tables
    auth/                # Keycloak OIDC, Google OAuth, sessions
    config/              # Zod-validated environment config
  web/src/
    pages/               # Route components (TanStack Router)
    components/          # UI components
    api/                 # API client (queries/, mutations/)
    contexts/            # AuthContext, ThemeContext
packages/
  shared/src/            # Shared types, Zod schemas, role constants
k8s/                     # Kubernetes manifests
scripts/                 # Database init scripts
```

## Architecture

```
Browser --HTTPS--> Agent Gateway (TLS termination, port 443)
                         |
                         +--> Siesta (Fastify + React SPA, ClusterIP)
                         |         |
                         |         +--> Redis Cache (per-endpoint TTLs)
                         |         |
                         |         +--> Agent Gateway (MCP, port 3001 internal)
                         |                    |
                         |                    +--> Portfolio-Analyzer MCP Server
                         |                    |         |
                         |                    |         +--> Salesforce / Gong / Zendesk / GitHub
                         |                    |
                         |                    +--> OpenAI API (gpt-4o-mini)
                         |
                         +--> PostgreSQL (CloudNativePG HA)
```

- **Agent Gateway** -- All traffic (web + MCP) routes through the enterprise-agentgateway. HTTPS listener on port 443 terminates TLS with a cert-manager Let's Encrypt certificate and proxies to the siesta ClusterIP service. MCP listeners on ports 3000 (HTTPS) and 3001 (HTTP internal) route to the portfolio-analyzer MCP server with API key authentication.
- **MCP Integration** -- Backend proxies MCP tool calls through the agent gateway. Keycloak client_credentials token is passed through to the upstream MCP server.
- **Redis Caching** -- MCP responses cached with TTLs: 5 min (details), 10 min (lists), 15 min (analytics). OpenAI summaries cached: 1 hour (account overviews, action items), 24 hours (email thread summaries). Graceful fallback on Redis failure.
- **OpenAI Integration** -- `openai-summary.service.ts` generates AI account overviews, email thread summaries, and action item extraction. Uses gpt-4o-mini via Agent Gateway. Graceful fallback if unconfigured or unreachable.
- **Google Integration** -- OAuth credentials configurable through Settings UI (stored encrypted in `app_settings` table) or via environment variables. User tokens encrypted (AES-256-GCM) in `user_google_tokens` table.
- **User Roles** -- `se`, `se_manager`, `admin`. Homepage filters accounts by CSE owner or interaction participation.

## Environment Variables

All sensitive values must be provided via `.env` file (gitignored) or environment variables. No secrets have hardcoded defaults in source code.

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SESSION_SECRET` | Session cookie signing secret | Yes |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM token encryption | Yes |
| `MCP_SERVER_URL` | MCP endpoint URL | Yes |
| `MCP_CLIENT_ID` | Keycloak client ID for MCP auth | Yes |
| `MCP_CLIENT_SECRET` | Keycloak client secret for MCP auth | Yes |
| `MCP_AUTH_URL` | Keycloak authorization endpoint | Yes |
| `MCP_TOKEN_URL` | Keycloak token endpoint | Yes |
| `MCP_GATEWAY_API_KEY` | Agent Gateway API key | No |
| `REDIS_URL` | Redis connection string | No (default: `redis://localhost:6379`) |
| `APP_URL` | Frontend URL | No (default: `http://localhost:5173`) |
| `API_URL` | Backend URL | No (default: `http://localhost:3000`) |
| `COOKIE_SECURE` | Force secure cookies | No (auto in production) |
| `OPENAI_API_KEY` | OpenAI API key (enables AI features) | No |
| `OPENAI_BASE_URL` | OpenAI API base URL | No (default: `https://api.openai.com/v1`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | No |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URL | No |

## Kubernetes Deployment

### Prerequisites

- GKE Autopilot cluster with `amd64` nodes
- `kubectl` configured for the cluster
- `helm` v3+
- Cloudflare account with API token (Zone:DNS:Edit, Zone:Zone:Read)
- Enterprise Agent Gateway operator installed (`enterprise-agentgateway` GatewayClass)
- CloudNativePG operator installed

### 1. Create namespace and base resources

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
```

The `siesta-secret` must contain:
- `DATABASE_URL` -- PostgreSQL connection string
- `SESSION_SECRET` -- Random 64-char hex string
- `ENCRYPTION_KEY` -- Random 64-char hex string (32 bytes)
- `MCP_CLIENT_ID`, `MCP_CLIENT_SECRET`, `MCP_TOKEN_URL`, `MCP_AUTH_URL`, `MCP_SERVER_URL` -- Keycloak OIDC credentials
- `MCP_GATEWAY_API_KEY` -- Must match the agent gateway API key secret
- `OPENAI_API_KEY` -- OpenAI API key (optional -- enables AI features)

### 2. Deploy PostgreSQL (CloudNativePG)

```bash
kubectl apply -f k8s/postgres-cnpg.yaml
```

### 3. Deploy Redis

```bash
kubectl apply -f k8s/redis.yaml
```

### 4. Install cert-manager

```bash
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true \
  --set startupapicheck.enabled=false \
  --set global.leaderElection.namespace=cert-manager
```

Create the Cloudflare API token secret:
```bash
kubectl create secret generic cloudflare-api-token \
  -n cert-manager \
  --from-literal=api-token=<YOUR_CLOUDFLARE_API_TOKEN>
```

Apply the ClusterIssuer and Certificate:
```bash
kubectl apply -f k8s/cert-manager.yaml
```

### 5. Deploy Agent Gateway

Create the API key secret:
```bash
API_KEY=$(openssl rand -hex 32)
kubectl create secret generic siesta-agw-apikey \
  -n siesta \
  --from-literal=api-key="$API_KEY"
```

Add the same key to `siesta-secret` as `MCP_GATEWAY_API_KEY`.

Apply the gateway resources:
```bash
kubectl apply -f k8s/agentgateway.yaml
```

This creates:
- **Gateway** with 3 listeners: HTTPS/443 (web), HTTPS/3000 (MCP external), HTTP/3001 (MCP internal)
- **AgentgatewayBackend** for portfolio-analyzer MCP server
- **AgentgatewayBackend** for OpenAI API proxying
- **HTTPRoute** `siesta-web` routing web traffic to siesta Service
- **HTTPRoute** `portfolio-analyzer` routing MCP traffic to the backend
- **HTTPRoute** `openai-proxy` routing `/v1/*` to OpenAI
- **AgentgatewayPolicy** with API key auth on MCP listeners only

### 6. Deploy Siesta

```bash
npm run build
docker build --platform linux/amd64 -f Dockerfile.prod \
  -t us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest .
docker push us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest
kubectl apply -f k8s/app.yaml
```

### 7. Configure DNS

Point your domain to the agent gateway LoadBalancer IP:
```bash
kubectl get svc agentgateway -n siesta -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Create an A record for `siesta.cjett.net` pointing to this IP.

### Redeployment

```bash
npm run build
docker build --platform linux/amd64 -f Dockerfile.prod \
  -t us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest .
docker push us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest
kubectl rollout restart deployment/siesta -n siesta
kubectl rollout status deployment/siesta -n siesta
```

## API Overview

| Method | Path | Description |
|---|---|---|
| GET | `/api/home` | Personal dashboard (accounts, action items, stats) |
| GET | `/api/accounts` | List accounts (filterable) |
| GET | `/api/accounts/:id` | Account detail |
| GET | `/api/accounts/:id/contacts` | Account contacts |
| GET | `/api/accounts/:id/interactions` | Account interactions |
| GET | `/api/accounts/:id/opportunities` | Account opportunities |
| GET | `/api/accounts/:id/issues` | Account issues |
| GET | `/api/accounts/:id/tasks` | Account tasks |
| GET | `/api/accounts/:id/architecture` | Architecture doc |
| GET | `/api/accounts/:id/sentiment` | Sentiment analysis |
| GET | `/api/accounts/:id/overview` | AI-generated account overview |
| GET | `/api/accounts/:id/action-items` | AI-extracted action items |
| POST | `/api/accounts/:id/email-thread-summary` | AI email thread summary |
| GET | `/api/interactions/search` | Semantic search |
| GET | `/api/interactions/:accountId/:sourceType/:recordId` | Interaction detail |
| GET | `/api/settings/google-status` | Google connection status |
| POST | `/api/settings/google-config` | Save Google OAuth credentials (admin) |
| DELETE | `/api/settings/google-config` | Remove Google OAuth credentials (admin) |
| POST | `/auth/google/disconnect` | Disconnect Google account |
| GET | `/api/settings/openai/status` | OpenAI integration status |

See [CLAUDE.md](./CLAUDE.md) for detailed architecture notes and full configuration reference.
