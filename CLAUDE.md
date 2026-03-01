# Siesta

Sales Engineering portfolio management platform powered by MCP (Model Context Protocol) for unified visibility into accounts, interactions, sentiment, and portfolio health.

## Tech Stack

- **Monorepo:** Turborepo with npm workspaces
- **Frontend (`apps/web`):** React 19, Vite 6, TanStack Router (file-based), TanStack Query, Tailwind CSS 4, TipTap editor
- **Backend (`apps/server`):** Fastify 5, Node.js 20+, TypeScript 5.7
- **Database:** PostgreSQL 16 with Drizzle ORM (for notes, users, sessions, settings)
- **Caching:** Redis (ioredis) with per-endpoint TTLs for MCP responses
- **Data Source:** MCP server (portfolio-analyzer) via Agent Gateway at `http://agentgateway.siesta.svc.cluster.local:3001/mcp` -- aggregates Salesforce, Gong, Zendesk, GitHub, Gmail, Calendar
- **AI:** OpenAI via Agent Gateway for account overviews, email thread summaries, action item extraction, and meeting briefs, with Redis caching. Uses `OPENAI_MODEL` (default `gpt-4o-mini`) for all summarization/extraction tasks and `OPENAI_CHAT_MODEL` (default `gpt-4o`) for the Señor Bot chat agent
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
    routes/          # Fastify route handlers
      accounts.routes.ts       # Account CRUD and detail endpoints
      home.routes.ts           # Dashboard data (accounts, stats, action items, meetings)
      interactions.routes.ts   # Interaction search and detail
      chat.routes.ts           # Señor Bot AI chat with MCP tool routing
      bug-report.routes.ts     # Bug report processing jobs (send-solo.io links)
      pricing.routes.ts        # Cloud instance pricing lookup (AWS/Azure/GCP)
      resources.routes.ts      # Team-shared resources CRUD
      tools.routes.ts          # Team-shared tools CRUD
      settings.routes.ts       # App settings, integrations, cache management
      support-mcp-auth.routes.ts # Support MCP OAuth flow
    instrumentation.ts # OpenTelemetry SDK init (loaded via --import before app starts)
    services/        # Business logic
      mcp-*.service.ts   # MCP tool proxies with Redis caching
      cache.service.ts   # Redis caching utility (cachedCall, invalidateCache)
      openai-summary.service.ts  # OpenAI summarization (account overviews, email thread summaries, action items, meeting briefs) with Redis caching
      meetings.service.ts  # Upcoming meetings aggregation across user's accounts with Redis caching
      google-token.service.ts  # Shared Google OAuth token management
      encryption.service.ts    # AES-256-GCM token encryption
      bug-report.service.ts    # Bug report parsing (YAML + kubectl describe formats) with streaming decompression
      bug-report-job.service.ts # Async bug report job processing from send-solo.io links
      send-download.service.ts  # Download and decrypt send-solo.io archives
      instance-pricing.service.ts # Cloud instance pricing from AWS/Azure/GCP APIs (cached 24h in Redis)
      action-items.service.ts   # Action item completion tracking
    integrations/
      mcp/           # MCP client (auth.ts, client.ts, types.ts) -- routes through Agent Gateway
    db/schema/       # Drizzle tables: users, sessions, notes, app_settings, user_google_tokens, user_mcp_tokens, action_item_completions, team_resources, team_tools
    auth/            # Auth plugin, guards, Keycloak OIDC, sessions
    config/          # Zod-validated environment config (with production guards for secrets)
  web/src/
    pages/           # Route components (lazy loaded via TanStack Router)
      home.tsx               # Personal dashboard
      accounts/              # Account list and detail pages
      action-items/          # Action items with filter and completion tracking
      opportunities/         # Kanban board with fiscal quarter filtering
      tools/                 # Tools index + Ambient Calculator
        ambient-calculator.tsx  # Sidecar-to-ambient migration calculator with PDF export
        bug-report-parser.ts    # Client-side bug report parsing (YAML + describe formats)
      insights/              # Portfolio analytics and AI insights
      resources/             # Team-shared resources
      meetings/              # Meeting briefs
      search/                # Semantic search
      settings/              # User management, integrations, preferences
    components/      # UI components (layout/, common/ incl. company-logo, feature-specific/)
    api/             # API client functions (queries/, mutations/)
    hooks/           # Custom React hooks
    contexts/        # AuthContext, ThemeContext
packages/
  shared/src/        # Shared types (mcp.ts, notes.ts, auth.ts, api.ts), Zod schemas, role constants
k8s/                 # Kubernetes deployment manifests
  deploy-telemetry.sh      # Helm-based OTEL stack deploy/cleanup script
  agentgateway-telemetry.yaml  # AGW tracing config + PodMonitor
  grafana-dashboards.yaml  # Custom Grafana dashboard (Logs & Traces)
  grafana-dashboard-agentgateway-cp.yaml       # AGW Control Plane dashboard
  grafana-dashboard-agentgateway-dataplane.yaml # AGW Dataplane dashboard
  grafana-dashboard-agentgateway-llm.yaml      # AGW LLM metrics (TTFT, TPOT, token usage)
  grafana-dashboard-agentgateway-mcp.yaml      # AGW MCP metrics dashboard
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
- **OpenAI Integration:** `openai-summary.service.ts` provides AI features using `OPENAI_MODEL` (default: `gpt-4o-mini`): (1) `summarizeAccount()` -- gathers account details, opportunities, interactions, issues, and tasks, then generates a structured overview (cached 1 hour); (2) `summarizeEmailThread()` -- summarizes grouped email threads with key points, decisions, and action items (cached 24 hours); (3) `extractActionItems()` -- extracts action items from recent interactions (cached 7 days); (4) `generateMeetingBrief()` -- creates meeting prep briefs with talking points, recent activity, open opportunities, and action items (cached 1 hour); (5) `summarizePOCs()` -- analyzes Gong call briefs and opportunity data to generate POC status summaries with a structured health rating (green/yellow/red) and reason (cached 1 hour); (6) `summarizeTechnicalDetails()` -- generates technical architecture summaries (cached 1 hour); (7) `generateGongCallBrief()` -- generates concise call briefs from Gong transcripts (cached indefinitely, immutable data); (8) `generateContactInsights()` -- extracts personal details (location, interests, family, hobbies, background, travel) from up to 50 Gong call transcripts per account with timestamps (cached indefinitely, invalidated when new calls appear); (9) `generateCallCoaching()` -- analyzes full Gong transcripts across user's accounts for call quality (discovery depth, technical depth, next steps clarity, objection handling, competitive handling, customer engagement, value articulation, meeting productivity), returns scored metrics with suggestions and highlights (cached 24 hours); (10) `generateInsights()` -- cross-account technology patterns, conversation trends, and cross-team observations from Gong briefs and POC summaries (cached 4 hours per user); (11) `generateCompetitiveAnalysis()` -- competitive intelligence including competitor mentions, product alignment, threats, battlecards, market landscape, and strategic recommendations focused on Solo.io competitors (cached 4 hours per user); (12) `generateCompetitorDetail()` -- detailed Solo.io vs specific competitor analysis with feature comparison table, strengths/weaknesses, win strategy, common objections with responses, pricing insight, and market trend (cached 7 days per competitor, general knowledge not account-specific); (13) `generateWinLossAnalysis()` -- correlates closed opportunities with Gong call briefs to identify win/loss patterns, computes deterministic stats (win rate, amounts) plus AI-identified win factors, loss factors, and recommendations (cached 4 hours, shared across all users since it covers all accounts). Note: Gong transcripts from MCP lack speaker labels, so analysis evaluates overall conversation quality rather than individual speaker performance. OpenAI requests route through the Agent Gateway in production (`OPENAI_BASE_URL`). Graceful fallback: returns `null` if API key is missing or OpenAI is unreachable.
- **Google Integration:** Users connect Google accounts via OAuth from Settings. Tokens stored encrypted in `user_google_tokens` table. Shared token management in `google-token.service.ts` handles refresh. Used by Calendar and Gmail routes.
- **Support MCP Integration:** The support-agent-tools MCP server (`support-agent-tools.is.solo.io`) routes through Agent Gateway on HTTP :3002. OAuth for the support MCP server (`auth-mcp.is.solo.io`) goes direct (not through AGW). The `SUPPORT_MCP_URL` env var controls the MCP fetch endpoint (defaults to the direct URL for local dev, set to AGW in production via configmap). The OAuth `resource` parameter in `support-mcp-auth.routes.ts` always uses the original URL as a token audience identifier. When a user has a connected support MCP token, the Señor Bot chat agent automatically merges support tools into its available toolset.
- **Backend pattern:** Routes -> MCP Services (with caching) -> MCP Client -> Agent Gateway -> MCP Server. Fastify plugin architecture for modularity. PostgreSQL connection routes through Agent Gateway's TCP :5432 listener (`DATABASE_URL` host must be set to `agentgateway.siesta.svc.cluster.local` in the Kubernetes secret).
- **Frontend pattern:** File-based routing with lazy loading. TanStack Query for server state. Vite dev proxy forwards `/api` and `/auth` to backend.
- **User roles:** `se`, `se_manager`, `admin`. Level-based hierarchy in `packages/shared/src/constants/roles.ts`. Homepage filters accounts by CSE owner or interaction participation.
- **"My Accounts" identification:** The server-side `getHomepageData()` identifies user accounts via TWO methods: (1) `cseOwner` field matching `user.name` (case-insensitive `.includes()`), and (2) interaction participation search (searching Gong calls, emails, meetings for the user's name/email). **IMPORTANT:** The `cseOwner` field from MCP data often does NOT match `user.name` from Keycloak — they use different name formats. Most accounts are identified via interaction participation, not `cseOwner`. Never rely solely on `cseOwner` matching `user.name` for frontend "My Accounts" filtering. Always use `homeData.allUserAccountIds` (which includes both cseOwner matches AND interaction participants, before the opportunity filter) for any "My Accounts" filter outside the homepage.
- **Homepage:** Shows accounts where the logged-in user is CSE owner or has participated in calls/emails/meetings. Only accounts with open non-renewal opportunities are shown. My Accounts panel displays a table with columns: Account name, POC Health dot, Opp Stage, Opp Amount, Close Date, Last Call Date, and Staleness (days since last Gong call, color-coded green 0-7d / yellow 8-14d / red >14d). POC summaries and opportunity data are prefetched via `useQueries()`. Stats include account count, total open pipeline, and open action items. Action Items panel shows AI-extracted action items grouped by account with heatmap chips (overdue count badges), source badges, expand/collapse per account, and a collapsible completed section with uncomplete action. "Show all" link navigates to `/action-items`.
- **Action Items Page:** Dedicated `/action-items` page accessible from sidebar and homepage "Show all" link. Shows all action items across accounts with a real-time filter input. Open items listed at top with checkboxes, collapsible "Completed (N)" section at bottom (collapsed by default). Each item shows action text, account name (clickable link), source, date, and completed timestamp for done items. Uses same `useMyActionItems()` query as homepage.
- **Account Detail:** AI-generated account summary (structured sections with bullet points), action items extracted from interactions (with "View all" link to `/action-items`), opportunities list (open opps with stage/amount/close date and POC health dots), POC status card with health badge (green/yellow/red with hover tooltip), contacts with personal notes (extracted from Gong transcripts, with timestamps showing when each detail was mentioned), grouped email threads with inline AI summaries, expandable call items with Gong summaries, meetings timeline, and notes.
- **POC Health Rating:** `summarizePOCs()` returns a structured `{ summary, health: { rating, reason } }` object. The health rating (green/yellow/red) is determined by the AI based on POC progress, sentiment, and blockers. Displayed as a colored badge on the POC Status card header, as colored dots on homepage account cards (bottom-right), and as colored dots on opportunity cards (both on the account detail page and the Opportunities kanban board). The Homepage and Opportunities pages prefetch POC summaries for all relevant account IDs via `useQueries()` and pass health data down as props.
- **Email Thread Grouping:** On the account detail page, emails are grouped by thread (normalized subject line -- stripping Re:/Fwd: prefixes). Each thread shows a one-line AI-generated preview when collapsed and the full summary with all bullet points when expanded. No separate thread detail page.
- **Call Expansion:** Calls on the account detail page and in search results are expandable inline. When expanded, the Gong call summary is fetched via MCP. If MCP can't find the detail, falls back to the call preview from the list endpoint.
- **Search:** Semantic search across all interactions. Call results are expandable inline to show Gong summaries. Email, meeting, and ticket results show snippets inline (not clickable, as MCP detail endpoints don't support fetching them).
- **Upcoming Meetings & Briefs:** Sidebar shows upcoming calendar meetings from the user's accounts with a "Brief" button. The meeting brief page (`/meetings/brief/$accountId?title=...`) generates an AI-powered prep brief with meeting context, talking points, recent activity, open opportunities, action items, and suggested questions. `meetings.service.ts` aggregates calendar_event interactions across accounts (cached 5 min). When MCP doesn't provide participant data, all meetings on the user's accounts are included.
- **Company Logos:** `CompanyLogo` component (`components/common/company-logo.tsx`) renders company logos using Google Favicons API (`https://www.google.com/s2/favicons?domain={domain}&sz={size}`). Domain is derived from company name by stripping corporate suffixes (Inc, Corp, LLC, etc.) and appending `.com`. Falls back to a colored letter avatar on load error. Failed domains are tracked in a module-level `Set` so remounts skip the network request. Used on homepage account cards and accounts list table.
- **Content Security Policy:** Production CSP in `app.ts` includes `img-src 'self' data: https://www.google.com https://*.gstatic.com` to allow Google Favicons (which redirect from `www.google.com` to `t0.gstatic.com`).
- **Señor Bot (Chat Agent):** AI chat assistant available on all pages via floating widget. Uses `OPENAI_CHAT_MODEL` (default `gpt-4o`) separately from the summarization model to maintain conversational quality. System prompt includes user's account list and pre-computed POC health ratings so it can answer portfolio questions without tool calls. MCP tool calls route through the Redis-cached service layer (`cachedCallTool()`) instead of hitting MCP directly. When the user has a connected Support Agent Tools integration, support MCP tools are merged into the available toolset and routed through `callSupportTool()` via Agent Gateway on :3002. Chat history persisted in Redis (7-day TTL).
- **Ambient Calculator:** Tools page (`/tools`) includes the Ambient Calculator for estimating Istio sidecar-to-ambient mesh migration savings. Accepts bug report uploads (.tar.gz, .tgz, .zip) and parses cluster data client-side via `bug-report-parser.ts`. Supports two node file formats: YAML (`kubectl get nodes -o yaml`) and text (`kubectl describe nodes`). Streaming decompression on the server via `tar-stream` handles archives >4GB without hitting the V8 Buffer limit. Also supports async processing of send-solo.io links via background jobs. Instance pricing auto-fetched from AWS (vantage.sh), Azure (vantage.sh), and GCP (pricing YAML) APIs, cached 24h in Redis, with manual override. ROI = cumulative savings / cumulative investment (percentage ratio). Defaults: 3 waypoint replicas, 0.3 ztunnel CPU tax. Generates downloadable PDF reports.
- **Bug Report Parsing:** Two parsers exist: (1) client-side `bug-report-parser.ts` (uses `fflate` for decompression, runs in browser) for direct file uploads, and (2) server-side `bug-report.service.ts` (uses `tar-stream` for streaming decompression) for send-solo.io link processing. Both extract 3 files per cluster: `cluster/cluster-context`, `cluster/nodes`, `cluster/k8s-resources`. The node parser detects format automatically — YAML NodeList or `kubectl describe nodes` text. The describe format parser extracts Labels (key=value), Capacity, and System Info sections line-by-line. YAML parsing has a fallback that strips annotations (which can contain unquoted JSON) before retrying.
- **Instance Pricing:** `instance-pricing.service.ts` fetches on-demand pricing from cloud provider APIs. AWS and Azure use vantage.sh JSON API. GCP uses the public pricing YAML. Results cached 24h in Redis per provider+type+region key. The frontend auto-triggers pricing fetch when new unpriced instances are detected, but preserves any manual overrides.
- **Team Resources & Tools:** CRUD endpoints for team-shared bookmarks (`/api/resources`) and tools (`/api/tools`), stored in PostgreSQL (`team_resources` and `team_tools` tables). Each entry has name, URL, optional description, and creator tracking. Resources support inline editing (hover to reveal edit/delete buttons). The URL is the clickable link, not the name.
- **Insights Page:** Portfolio analytics page (`/insights`) with 5 tabs: Technology Patterns, Conversation Trends, Competitive Analysis, Call Quality, and Win/Loss. Competitive Analysis tab includes active threats, strategic recommendations, battlecards (per-competitor strengths/weaknesses/differentiators/win strategy), market landscape table (clickable rows expand into detailed Solo.io vs competitor analysis with feature comparison, objection handling, pricing insights), competitor mentions from calls, and product alignment. Market landscape competitor drill-down generates detailed analysis via `generateCompetitorDetail()` (cached 7 days per competitor). Call Quality tab shows an overall score (1-10, color-coded), 8 scored quality metrics with visual bars and improvement suggestions, and highlights split into strengths and areas for improvement with linked account names. Win/Loss tab shows win rate, stats (wins/losses/avg amounts), AI-identified win factors and loss factors with linked account names, and recommendations — analyzes closed opportunities across ALL accounts (not per-user) with Gong call briefs correlated to outcomes. Data cached 24 hours per user for coaching, 4 hours shared for win/loss, pre-warmed on login and via daily batch at 6 AM.
- **Key pages:** Home (personal dashboard with account table + action items panel + company logos + POC health dots + opp stage/amount/close/staleness), Action Items (dedicated page with filter, open/completed sections), Accounts (list with company logos + detail with AI overview, action items, opportunities with POC health dots, POC status with health badge, grouped emails, calls, meetings, notes), Opportunities (kanban board with POC health dots, fiscal quarter filtering, My Accounts toggle), Tools (ambient calculator with PDF export), Insights (technology patterns, conversation trends, competitive analysis with battlecards + market landscape drill-down, call quality, win/loss analysis), Resources (team-shared bookmarks), Meeting Brief (AI-generated meeting prep), Search (semantic search with inline call expansion), Settings (user management, integrations, AI status, cache, preferences).
- **Token encryption:** Google OAuth tokens encrypted in `user_google_tokens` table via AES-256-GCM and a 32-byte ENCRYPTION_KEY.
- **Telemetry Stack:** Deployed via `./k8s/deploy-telemetry.sh` into the `telemetry` namespace. Includes: Loki (logs), Tempo (traces), OTEL Collectors (traces on gRPC 4317, metrics, logs DaemonSet), kube-prometheus-stack (Prometheus + Grafana). Agent Gateway exports traces via `k8s/agentgateway-telemetry.yaml` (AgentgatewayParameters + PodMonitor). Grafana dashboards: custom Logs & Traces dashboard via `k8s/grafana-dashboards.yaml`, plus 4 Agent Gateway dashboards (CP, Dataplane, LLM, MCP) in `k8s/grafana-dashboard-agentgateway-*.yaml` — these use `$__rate_interval` instead of hardcoded `[5m]` to handle sparse traffic correctly. Reapply after Helm upgrades: `kubectl apply -f k8s/grafana-dashboard-agentgateway-*.yaml`. Access Grafana: `kubectl port-forward -n telemetry svc/kube-prometheus-stack-grafana 3001:80`. Cleanup: `./k8s/deploy-telemetry.sh --cleanup`.
- **OpenTelemetry:** `instrumentation.ts` initializes `@opentelemetry/sdk-node` with auto-instrumentations, loaded via Node.js `--import` flag before the app starts. Traces HTTP incoming (Fastify), HTTP outgoing (MCP fetch, OpenAI via undici), and Redis (ioredis). fs/dns/net instrumentations disabled (noisy, low value). Uses gRPC exporter (`@opentelemetry/exporter-trace-otlp-grpc`) to send traces through the Agent Gateway's TCP :4317 listener, which forwards to the OTEL Collector in the `telemetry` namespace via an ExternalName Service, then on to Tempo. Conditional -- no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, so local dev without a collector works unchanged. Siesta traces join Agent Gateway traces in Grafana via distributed trace context propagation.
- **Sensitive config:** MCP credentials (client ID, secret, server URL, auth URLs) have no hardcoded defaults -- they must be provided via environment variables or `.env` file. The `.env` file is in `.gitignore`. `SESSION_SECRET` and `ENCRYPTION_KEY` have development-only defaults that the server explicitly rejects in production (`NODE_ENV=production`) with a fatal error.
- **Database Backups:** CloudNativePG automated backups to GCS bucket `gs://siesta-db-backups/cnpg`. Uses Workload Identity (`siesta-cnpg-backup@field-engineering-us.iam.gserviceaccount.com`) — no key files. Continuous WAL archiving for point-in-time recovery. `ScheduledBackup/siesta-daily-backup` runs daily at 3:00 AM UTC. 30-day retention policy. Configured in `k8s/postgres-cnpg.yaml`. To restore from backup, change the CNPG Cluster `bootstrap` from `initdb` to `recovery` pointing at the barman object store. To trigger a manual backup: `kubectl create -f -<<<'{"apiVersion":"postgresql.cnpg.io/v1","kind":"Backup","metadata":{"name":"manual-backup","namespace":"siesta"},"spec":{"method":"barmanObjectStore","cluster":{"name":"postgres-cnpg"}}}'`. Check backup status: `kubectl get backups -n siesta`.
- **Production:** Single Docker container serves static frontend + API on port 3000. Kubernetes manifests in `k8s/`.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/home` | Personal dashboard (accounts, action items, stats) |
| GET | `/api/home/my-action-items` | AI-extracted action items for current user |
| GET | `/api/home/upcoming-meetings` | Upcoming calendar meetings for current user |
| GET | `/api/insights` | AI-generated cross-account insights (cached 4h per user) |
| GET | `/api/competitive-analysis` | AI-generated competitive intelligence (cached 4h per user) |
| GET | `/api/call-coaching` | AI-generated call quality analysis (cached 24h per user) |
| GET | `/api/win-loss-analysis` | AI-generated win/loss analysis across all accounts (cached 4h shared) |
| GET | `/api/competitive-analysis/detail?competitor=&category=` | Detailed Solo.io vs competitor analysis (cached 7 days per competitor) |
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
| GET | `/api/accounts/:id/contact-insights` | AI-extracted personal notes from Gong calls |
| GET | `/api/accounts/:id/meeting-brief?title=...` | AI-generated meeting prep brief |
| POST | `/api/accounts/:id/email-thread-summary` | AI email thread summary |
| GET | `/api/opportunities` | All opportunities (with account info) |
| GET | `/api/interactions/search` | Semantic search |
| GET | `/api/interactions/:accountId/:sourceType/:recordId` | Interaction detail |
| POST | `/api/bug-report/jobs` | Create async bug report processing job |
| GET | `/api/bug-report/jobs/:jobId` | Get bug report job status and results |
| GET | `/api/pricing?provider=&types=&regions=` | Fetch cloud instance pricing |
| GET | `/api/resources` | List team resources |
| POST | `/api/resources` | Create team resource |
| PATCH | `/api/resources/:id` | Update team resource |
| DELETE | `/api/resources/:id` | Delete team resource |
| GET | `/api/tools` | List team tools |
| POST | `/api/tools` | Create team tool |
| DELETE | `/api/tools/:id` | Delete team tool |
| GET | `/api/settings/google-status` | Google connection status |
| POST | `/api/settings/google-config` | Save Google OAuth credentials (admin) |
| DELETE | `/api/settings/google-config` | Remove Google OAuth credentials (admin) |
| POST | `/auth/google/disconnect` | Disconnect Google account |
| GET | `/api/settings/openai/status` | OpenAI integration status |

## Environment Variables

All sensitive values must be provided via `.env` (gitignored) or environment variables. `SESSION_SECRET` and `ENCRYPTION_KEY` have development-only defaults; the server refuses to start in production if they are not overridden.

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
OPENAI_MODEL=gpt-4o-mini  # model for summarization/extraction tasks (default gpt-4o-mini)
OPENAI_CHAT_MODEL=gpt-4o  # model for Señor Bot chat agent (default gpt-4o)

# OpenTelemetry (optional -- enables distributed tracing)
OTEL_EXPORTER_OTLP_ENDPOINT=http://agentgateway.siesta.svc.cluster.local:4317
OTEL_SERVICE_NAME=siesta

# App
APP_URL=https://siesta.cjett.net
API_URL=https://siesta.cjett.net
SESSION_SECRET=<32-byte-secret>
ENCRYPTION_KEY=<32-byte-hex-key>
DATABASE_URL=postgresql://...  # use postgres-cnpg-rw.siesta.svc.cluster.local:5432 as host in production
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
Siesta pod -> postgres-cnpg-rw.siesta.svc:5432                              (PostgreSQL, direct)
Siesta pod -> redis.siesta.svc:6379                                         (Redis, direct)
```

Traffic not routed through AGW:
- Keycloak OIDC auth (`MCP_AUTH_URL`, `MCP_TOKEN_URL`) -- external IdP, browser redirects
- Support MCP OAuth (`auth-mcp.is.solo.io`) -- external OAuth server

Resources in `siesta` namespace:
- `Gateway/agentgateway` -- listeners on :443 (web), :3000 (MCP external HTTPS), :3001 (MCP + OpenAI internal HTTP), :3002 (Support MCP), :4317 (OTEL)
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

## Customer360 REST API Reference

The upstream data source (customer360 at `customer360.cs.solo.io`) exposes a comprehensive REST API on port 8080 in addition to the MCP server on port 8090. The REST API provides direct access to the same data Siesta currently fetches via MCP tool calls, with lower latency (no MCP serialization overhead). Codebase at `/Users/coryjett/Documents/Workspace/Other/customer360`. Swagger docs at `/swagger/`.

**Tech stack:** Go 1.25+, PostgreSQL 17 with pgvector, sqlc, golang-migrate, Google Vertex AI (Gemini) for embeddings/sentiment.

**Auth:** JWT cookie-based with Google OAuth. Domain-restricted to `@solo.io`. API keys available via `POST /api/admin/api-keys`. Public routes (no auth): `/api/health`, `/api/auth/login`, `POST /api/auth/callback`.

### Accounts/Companies

| Method | Path | Description |
|---|---|---|
| GET | `/api/companies` | List companies (`{ companies: [], total: int }`) |
| GET | `/api/companies/{id}` | Full company object (70+ fields: name, csmOwner, csmHealthScore, website, closedWonArr, lifecyclePhase, productionStatus, customFields) |
| PATCH | `/api/companies/{id}` | Update company (partial) |
| GET | `/api/companies/{id}/activities` | Unified interaction timeline (Gong calls, emails, meetings, tickets) |
| GET | `/api/companies/{id}/tickets` | Zendesk tickets |
| GET | `/api/companies/{id}/tasks` | Company tasks |
| GET | `/api/companies/{id}/contacts` | Contact list |
| GET | `/api/companies/{id}/renewals` | Renewal opportunities |
| GET | `/api/companies/{id}/sentiment-trends` | Sentiment analytics |
| GET | `/api/companies/{id}/architecture-doc` | Architecture documentation |
| PUT | `/api/companies/{id}/architecture-doc` | Update architecture doc |

### Contacts, Opportunities, Tasks

| Method | Path | Description |
|---|---|---|
| GET | `/api/contacts/{id}` | Full contact with company reference |
| PATCH | `/api/contacts/{id}` | Update contact |
| GET | `/api/contacts/{id}/activities` | Contact activity feed |
| GET | `/api/opportunities/{id}` | Opportunity details (stage, amount, close date, ARR, line items) |
| PATCH | `/api/opportunities/{id}` | Update opportunity |
| GET | `/api/opportunities/{id}/line-items` | Product line items |
| PATCH | `/api/opportunities/line-items/{id}` | Update line item |
| GET | `/api/tasks` | List tasks with filters |
| GET | `/api/tasks/{id}` | Single task |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/{id}` | Update task |
| DELETE | `/api/tasks/{id}` | Delete task |
| POST | `/api/tasks/{id}/comments` | Add comment |

### Search & AI

| Method | Path | Description |
|---|---|---|
| GET | `/api/search?q=query` | Global search (companies, contacts, interactions) |
| POST | `/api/ai/search` | Vector similarity search (`{ companyId, message, conversationHistory }`) |
| POST | `/api/ai/chat` | AI chat for account insights |
| POST | `/api/ai/chat/stream` | Streaming AI chat |
| GET | `/api/ai/source/{type}/{id}` | Get source for AI citation |
| POST | `/api/ai/insights/stream` | Streaming portfolio insights |

### Sentiment & Analytics

| Method | Path | Description |
|---|---|---|
| GET | `/api/sentiment/portfolio` | Portfolio-wide sentiment |
| GET | `/api/sentiment/accounts` | Account sentiment list |
| GET | `/api/sentiment/accounts/{id}/negative-interactions` | Negative interactions |
| PATCH | `/api/interactions/{id}/sentiment-false-positive` | Mark sentiment false positive |

### Generic Entity Query API

Supports advanced filtering, sorting, column selection, and pagination for any entity type (`companies`, `contacts`, `opportunities`, `assets`, `tasks`).

```
GET  /api/entities/{type}              → Simple list
GET  /api/entities/{type}/{id}         → Get by ID
POST /api/entities/{type}/query        → Advanced query
GET  /api/entities/{type}/metadata     → Field metadata
```

Advanced query example:
```json
POST /api/entities/companies/query
{
  "columns": ["id", "name", "csmOwner", "csmHealthScore"],
  "filters": [{ "field": "csmHealthScore", "operator": "gte", "value": 3 }],
  "sort": { "field": "name", "direction": "asc" },
  "limit": 50
}
```

### Google Integrations

| Method | Path | Description |
|---|---|---|
| GET | `/api/integrations/google/auth-url` | OAuth URL |
| POST | `/api/integrations/google/connect` | Connect account |
| GET | `/api/integrations/google` | List integrations |
| DELETE | `/api/integrations/google/{id}` | Disconnect |
| GET | `/api/integrations/google/threads/{id}` | Email thread |

### Admin

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users` | List all users |
| PATCH | `/api/admin/users/{id}/role` | Update role |
| DELETE | `/api/admin/users/{id}` | Delete user |
| POST | `/api/admin/users/{id}/force-logout` | Force logout |
| GET | `/api/admin/api-keys` | List API keys |
| POST | `/api/admin/api-keys` | Create API key |
| DELETE | `/api/admin/api-keys/{id}` | Revoke key |
| GET | `/api/admin/field-mappings` | Salesforce field sync config |
| GET | `/api/admin/sf-available-fields?object=Account` | Discover Salesforce fields |

### MCP-to-REST Mapping

Siesta currently uses MCP tool calls. These map to direct REST endpoints:

| MCP Tool / Sub-tool | REST Equivalent | Notes |
|---|---|---|
| `get_account_details` | `GET /api/companies/{id}` | REST returns 70+ fields directly |
| `get_account_details` (contacts) | `GET /api/companies/{id}/contacts` | Direct endpoint |
| `get_account_details` (interactions) | `GET /api/companies/{id}/activities` | Unified timeline |
| `get_account_details` (opportunities) | `GET /api/opportunities/{id}` | Per-opportunity |
| `get_account_details` (tickets) | `GET /api/companies/{id}/tickets` | Direct endpoint |
| `get_account_details` (architecture) | `GET /api/companies/{id}/architecture-doc` | Direct endpoint |
| `get_account_details` (sentiment) | `GET /api/sentiment/accounts/{id}/negative-interactions` | Direct endpoint |
| `filter_accounts` | `POST /api/entities/companies/query` | Advanced filtering with operators |
| `search_portfolio_interactions` | `POST /api/ai/search` | Vector similarity search |
| `get_portfolio_stats` | `GET /api/sentiment/portfolio` + `GET /api/companies` | Combine endpoints |
| `get_negative_interactions` | `GET /api/sentiment/accounts/{id}/negative-interactions` | Direct endpoint |

### Sync Status

| Method | Path | Description |
|---|---|---|
| GET | `/api/sync/status` | Sync status across sources (Salesforce, Gong, Zendesk, Gmail) |
| GET | `/api/sync/cursors` | Incremental sync cursors |
| POST | `/api/sync/cursors/{object}/reset` | Reset sync cursor |
