# Siesta

Sales Engineering portfolio management platform powered by MCP (Model Context Protocol) for unified visibility into accounts, interactions, sentiment, and portfolio health.

## Tech Stack

- **Monorepo:** Turborepo with npm workspaces
- **Frontend (`apps/web`):** React 19, Vite 6, TanStack Router (file-based), TanStack Query, Tailwind CSS 4, TipTap editor
- **Backend (`apps/server`):** Fastify 5, Node.js 20+, TypeScript 5.7
- **Database:** PostgreSQL 16 with Drizzle ORM (for notes, users, sessions, settings)
- **Caching:** Redis (ioredis) with per-endpoint TTLs for MCP responses
- **Data Source:** MCP server (portfolio-analyzer) via Agent Gateway at `http://agentgateway.siesta.svc.cluster.local:3001/mcp` -- aggregates Salesforce, Gong, Zendesk, GitHub, Gmail, Calendar
- **AI:** OpenAI (gpt-4o-mini) via Agent Gateway for account overviews, email thread summaries, action item extraction, and meeting briefs, with Redis caching
- **Auth:** Keycloak OIDC (openid-client) for app login; Google OAuth for Gmail/Calendar integration
- **Observability:** OpenTelemetry auto-instrumentation (`@opentelemetry/sdk-node`) with gRPC export through Agent Gateway → OTEL Collector → Tempo → Grafana
- **Shared (`packages/shared`):** Types, Zod validation schemas, role constants

## Commands

```bash
# Development
docker-compose up -d          # Start PostgreSQL + Redis
npm install
npm run dev                   # Start all apps (frontend :5173, backend :3000)

# Build & Typecheck
npm run build                 # Build all packages and apps
npm run typecheck              # Type-check all workspaces
npm run lint                   # Lint all workspaces

# Database (Drizzle)
npm run db:generate            # Generate migrations from schema
npm run db:migrate             # Run pending migrations
npm run db:studio              # Open Drizzle Studio GUI
```

## Project Structure

```
apps/
  server/src/
    routes/          # Fastify route handlers (accounts, home, interactions, search, settings)
    instrumentation.ts # OpenTelemetry SDK init (loaded via --import before app starts)
    services/        # Business logic
      mcp-*.service.ts   # MCP tool proxies with Redis caching
      cache.service.ts   # Redis caching utility (cachedCall, invalidateCache)
      openai-summary.service.ts  # OpenAI summarization (account overviews, email thread summaries, action items, meeting briefs) with Redis caching
      meetings.service.ts  # Upcoming meetings aggregation across user's accounts with Redis caching
      google-token.service.ts  # Shared Google OAuth token management
      encryption.service.ts    # AES-256-GCM token encryption
    integrations/
      mcp/           # MCP client (auth.ts, client.ts, types.ts) -- routes through Agent Gateway
    db/schema/       # Drizzle tables: users, sessions, notes, app_settings, user_google_tokens
    auth/            # Auth plugin, guards, Keycloak OIDC, sessions
    config/          # Zod-validated environment config
  web/src/
    pages/           # Route components (lazy loaded via TanStack Router)
    components/      # UI components (layout/, common/, feature-specific/)
    api/             # API client functions (queries/, mutations/)
    hooks/           # Custom React hooks
    contexts/        # AuthContext, ThemeContext
packages/
  shared/src/        # Shared types (mcp.ts, notes.ts, auth.ts, api.ts), Zod schemas, role constants
k8s/                 # Kubernetes deployment manifests
  deploy-telemetry.sh      # Helm-based OTEL stack deploy/cleanup script
  agentgateway-telemetry.yaml  # AGW tracing config + PodMonitor
  grafana-dashboards.yaml  # Grafana dashboard ConfigMaps
  values/                  # Helm values for telemetry components
    kube-prometheus-stack.yaml  # Prometheus + Grafana
    tempo.yaml                  # Trace storage
    loki.yaml                   # Log aggregation
    otel-collector-traces.yaml  # Traces collector (gRPC 4317 -> Tempo)
    otel-collector-metrics.yaml # Metrics collector
    otel-collector-logs.yaml    # Logs collector (DaemonSet)
scripts/             # Database initialization scripts
```

## Architecture Notes

- **MCP Integration:** Backend proxies MCP tool calls through the enterprise Agent Gateway (`agentgateway.siesta.svc.cluster.local:3001`). The gateway handles routing, rate limiting, and observability. Auth uses Keycloak client_credentials for the backend token, which is passed through the gateway to the upstream MCP server. API key authentication secures external Siesta-to-gateway communication on :3000 (HTTPS).
- **Redis Caching:** All MCP service calls are wrapped with `cachedCall()` from `cache.service.ts`. TTLs: 5 min (details, interactions, issues, tasks, home), 10 min (lists, contacts, opportunities), 15 min (architecture, sentiment, portfolio stats). Search is not cached. Redis failure degrades gracefully to direct MCP calls. Frontend TanStack Query `staleTime` values are aligned with backend Redis TTLs to prevent unnecessary refetches (5 min for details, 10 min for lists, 15 min for analytics, 1 hour for AI summaries, 24 hours for email summaries and Gong call details).
- **OpenAI Integration:** `openai-summary.service.ts` provides AI features: (1) `summarizeAccount()` -- gathers account details, opportunities, interactions, issues, and tasks, then generates a structured overview via gpt-4o-mini (cached 1 hour); (2) `summarizeEmailThread()` -- summarizes grouped email threads with key points, decisions, and action items (cached 24 hours); (3) `extractActionItems()` -- extracts action items from recent interactions (cached 7 days); (4) `generateMeetingBrief()` -- creates meeting prep briefs with talking points, recent activity, open opportunities, and action items (cached 1 hour); (5) `summarizePOCs()` -- analyzes Gong call briefs and opportunity data to generate POC status summaries with a structured health rating (green/yellow/red) and reason (cached 1 hour); (6) `summarizeTechnicalDetails()` -- generates technical architecture summaries (cached 1 hour); (7) `generateGongCallBrief()` -- generates concise call briefs from Gong transcripts (cached indefinitely, immutable data). OpenAI requests route through the Agent Gateway in production (`OPENAI_BASE_URL`). Graceful fallback: returns `null` if API key is missing or OpenAI is unreachable.
- **Google Integration:** Users connect Google accounts via OAuth from Settings. Tokens stored encrypted in `user_google_tokens` table. Shared token management in `google-token.service.ts` handles refresh. Used by Calendar and Gmail routes.
- **Support MCP Integration:** The support-agent-tools MCP server (`support-agent-tools.is.solo.io`) routes through Agent Gateway on HTTP :3002. OAuth for the support MCP server (`auth-mcp.is.solo.io`) goes direct (not through AGW). The `SUPPORT_MCP_URL` env var controls the MCP fetch endpoint (defaults to the direct URL for local dev, set to AGW in production via configmap). The OAuth `resource` parameter in `support-mcp-auth.routes.ts` always uses the original URL as a token audience identifier.
- **Backend pattern:** Routes -> MCP Services (with caching) -> MCP Client -> Agent Gateway -> MCP Server. Fastify plugin architecture for modularity. PostgreSQL connection routes through Agent Gateway's TCP :5432 listener (`DATABASE_URL` host must be set to `agentgateway.siesta.svc.cluster.local` in the Kubernetes secret).
- **Frontend pattern:** File-based routing with lazy loading. TanStack Query for server state. Vite dev proxy forwards `/api` and `/auth` to backend.
- **User roles:** `se`, `se_manager`, `admin`. Level-based hierarchy in `packages/shared/src/constants/roles.ts`. Homepage filters accounts by CSE owner or interaction participation.
- **Homepage:** Shows accounts where the logged-in user is CSE owner or has participated in calls/emails/meetings. Only accounts with open non-renewal opportunities are shown. Stats include account count, total open pipeline, and open action items. Action items include issues and verbal commitments from Gong calls (no tasks, no Zendesk items).
- **Account Detail:** AI-generated account summary (structured sections with bullet points), action items extracted from interactions, opportunities list (open opps with stage/amount/close date and POC health dots), POC status card with health badge (green/yellow/red with hover tooltip), grouped email threads with inline AI summaries, expandable call items with Gong summaries, meetings timeline, and notes.
- **POC Health Rating:** `summarizePOCs()` returns a structured `{ summary, health: { rating, reason } }` object. The health rating (green/yellow/red) is determined by the AI based on POC progress, sentiment, and blockers. Displayed as a colored badge on the POC Status card header and as colored dots on opportunity cards (both on the account detail page and the Opportunities kanban board). The Opportunities page prefetches POC summaries for all unique account IDs via `useQueries()` and passes health data down as props.
- **Email Thread Grouping:** On the account detail page, emails are grouped by thread (normalized subject line -- stripping Re:/Fwd: prefixes). Each thread shows a one-line AI-generated preview when collapsed and the full summary with all bullet points when expanded. No separate thread detail page.
- **Call Expansion:** Calls on the account detail page and in search results are expandable inline. When expanded, the Gong call summary is fetched via MCP. If MCP can't find the detail, falls back to the call preview from the list endpoint.
- **Search:** Semantic search across all interactions. Call results are expandable inline to show Gong summaries. Email, meeting, and ticket results show snippets inline (not clickable, as MCP detail endpoints don't support fetching them).
- **Upcoming Meetings & Briefs:** Sidebar shows upcoming calendar meetings from the user's accounts with a "Brief" button. The meeting brief page (`/meetings/brief/$accountId?title=...`) generates an AI-powered prep brief with meeting context, talking points, recent activity, open opportunities, action items, and suggested questions. `meetings.service.ts` aggregates calendar_event interactions across accounts (cached 5 min). When MCP doesn't provide participant data, all meetings on the user's accounts are included.
- **Key pages:** Home (personal dashboard with accounts + action items), Accounts (list + detail with AI overview, action items, opportunities with POC health dots, POC status with health badge, grouped emails, calls, meetings, notes), Opportunities (kanban board with POC health dots, fiscal quarter filtering, My Accounts toggle), Meeting Brief (AI-generated meeting prep), Search (semantic search with inline call expansion), Settings (user management, integrations, AI status, cache, preferences).
- **Token encryption:** Google OAuth tokens encrypted in `user_google_tokens` table via AES-256-GCM and a 32-byte ENCRYPTION_KEY.
- **Telemetry Stack:** Deployed via `./k8s/deploy-telemetry.sh` into the `telemetry` namespace. Includes: Loki (logs), Tempo (traces), OTEL Collectors (traces on gRPC 4317, metrics, logs DaemonSet), kube-prometheus-stack (Prometheus + Grafana). Agent Gateway exports traces via `k8s/agentgateway-telemetry.yaml` (AgentgatewayParameters + PodMonitor). Grafana dashboards provisioned via `k8s/grafana-dashboards.yaml`. Access Grafana: `kubectl port-forward -n telemetry svc/kube-prometheus-stack-grafana 3001:80`. Cleanup: `./k8s/deploy-telemetry.sh --cleanup`.
- **OpenTelemetry:** `instrumentation.ts` initializes `@opentelemetry/sdk-node` with auto-instrumentations, loaded via Node.js `--import` flag before the app starts. Traces HTTP incoming (Fastify), HTTP outgoing (MCP fetch, OpenAI via undici), and Redis (ioredis). fs/dns/net instrumentations disabled (noisy, low value). Uses gRPC exporter (`@opentelemetry/exporter-trace-otlp-grpc`) to send traces through the Agent Gateway's TCP :4317 listener, which forwards to the OTEL Collector in the `telemetry` namespace via an ExternalName Service, then on to Tempo. Conditional -- no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, so local dev without a collector works unchanged. Siesta traces join Agent Gateway traces in Grafana via distributed trace context propagation.
- **Sensitive config:** MCP credentials (client ID, secret, server URL, auth URLs) have no hardcoded defaults -- they must be provided via environment variables or `.env` file. The `.env` file is in `.gitignore`.
- **Production:** Single Docker container serves static frontend + API on port 3000. Kubernetes manifests in `k8s/`.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/home` | Personal dashboard (accounts, action items, stats) |
| GET | `/api/home/my-action-items` | AI-extracted action items for current user |
| GET | `/api/home/upcoming-meetings` | Upcoming calendar meetings for current user |
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
| GET | `/api/accounts/:id/poc-summary` | POC status summary with health rating |
| GET | `/api/accounts/:id/technical-details` | AI-generated technical details |
| GET | `/api/accounts/:id/action-items` | AI-extracted action items |
| GET | `/api/accounts/:id/meeting-brief?title=...` | AI-generated meeting prep brief |
| POST | `/api/accounts/:id/email-thread-summary` | AI email thread summary |
| GET | `/api/opportunities` | All opportunities (with account info) |
| GET | `/api/interactions/search` | Semantic search |
| GET | `/api/interactions/:accountId/:sourceType/:recordId` | Interaction detail |
| GET | `/api/settings/google-status` | Google connection status |
| POST | `/api/settings/google-config` | Save Google OAuth credentials (admin) |
| DELETE | `/api/settings/google-config` | Remove Google OAuth credentials (admin) |
| POST | `/auth/google/disconnect` | Disconnect Google account |
| GET | `/api/settings/openai/status` | OpenAI integration status |

## Environment Variables

All sensitive values must be provided via `.env` (gitignored) or environment variables. No secrets have hardcoded defaults.

```
# MCP (required -- via Agent Gateway)
MCP_SERVER_URL=<mcp-server-url>
MCP_CLIENT_ID=<keycloak-client-id>
MCP_CLIENT_SECRET=<keycloak-client-secret>
MCP_AUTH_URL=<keycloak-auth-endpoint>
MCP_TOKEN_URL=<keycloak-token-endpoint>
MCP_GATEWAY_API_KEY=<agent-gateway-api-key>

# Support MCP (optional -- routes through Agent Gateway in production)
SUPPORT_MCP_URL=https://support-agent-tools.is.solo.io/mcp  # or Agent Gateway URL in production

# Redis
REDIS_URL=redis://localhost:6379

# OpenAI (optional -- enables AI overviews, email summaries, action item extraction)
OPENAI_API_KEY=<openai-api-key>
OPENAI_BASE_URL=https://api.openai.com/v1  # or Agent Gateway URL in production

# OpenTelemetry (optional -- enables distributed tracing)
OTEL_EXPORTER_OTLP_ENDPOINT=http://agentgateway.siesta.svc.cluster.local:4317
OTEL_SERVICE_NAME=siesta

# App
APP_URL=https://siesta.cjett.net
API_URL=https://siesta.cjett.net
SESSION_SECRET=<32-byte-secret>
ENCRYPTION_KEY=<32-byte-hex-key>
DATABASE_URL=postgresql://...  # use agentgateway.siesta.svc.cluster.local:5432 as host in production
```

## Deployment

GKE cluster runs `amd64` nodes. Always build the Docker image with `--platform linux/amd64`.

```bash
npm run build
docker build --platform linux/amd64 -f Dockerfile.prod -t us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest .
docker push us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest
kubectl rollout restart deployment/siesta -n siesta
kubectl rollout status deployment/siesta -n siesta
```

## Agent Gateway Setup

All Siesta outbound traffic routes through the enterprise Agent Gateway in the `siesta` namespace:

```
Siesta pod -> agentgateway.siesta.svc:3001  -> mcp.cs.solo.io:443           (MCP)
Siesta pod -> agentgateway.siesta.svc:3001  -> api.openai.com:443           (OpenAI)
Siesta pod -> agentgateway.siesta.svc:3002  -> support-agent-tools.is.solo.io:443 (Support MCP)
Siesta pod -> agentgateway.siesta.svc:4317  -> OTEL Collector (telemetry ns) (traces)
Siesta pod -> agentgateway.siesta.svc:5432  -> postgres-cnpg-rw:5432        (PostgreSQL)
Siesta pod -> agentgateway.siesta.svc:6379  -> redis:6379                   (Redis)
```

Traffic not routed through AGW:
- Keycloak OIDC auth (`MCP_AUTH_URL`, `MCP_TOKEN_URL`) -- external IdP, browser redirects
- Support MCP OAuth (`auth-mcp.is.solo.io`) -- external OAuth server

Resources in `siesta` namespace:
- `Gateway/agentgateway` -- listeners on :443 (web), :3000 (MCP external HTTPS), :3001 (MCP + OpenAI internal HTTP), :3002 (Support MCP), :4317 (OTEL), :5432 (PostgreSQL), :6379 (Redis)
- `AgentgatewayBackend/portfolio-analyzer` -- static target to `mcp.cs.solo.io:443` with TLS + passthrough auth
- `AgentgatewayBackend/support-agent-tools` -- static target to `support-agent-tools.is.solo.io:443` with TLS + passthrough auth
- `AgentgatewayBackend/openai` -- static target to `api.openai.com:443` for OpenAI API proxying
- `HTTPRoute/portfolio-analyzer` -- routes MCP traffic on :3001 to portfolio-analyzer backend
- `HTTPRoute/support-agent-tools` -- routes support MCP traffic on :3002 to support-agent-tools backend
- `HTTPRoute/openai-proxy` -- routes `/v1/*` on :3001 to OpenAI backend
- `HTTPRoute/siesta-web` -- routes web traffic on :443 to siesta Service
- `TCPRoute/otel-traces` -- routes :4317 to OTEL Collector via ExternalName Service
- `TCPRoute/postgres` -- routes :5432 to postgres-cnpg-rw
- `TCPRoute/redis` -- routes :6379 to redis
- `AgentgatewayPolicy/siesta-auth` -- API key authentication on :3000 (external MCP) via `Secret/siesta-agw-apikey`
