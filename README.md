# Siesta

Sales Engineering portfolio management platform powered by MCP (Model Context Protocol). Provides unified visibility into accounts, interactions, sentiment, and portfolio health with an AI-powered chat assistant (Señor Bot).

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

## Architecture

```
                                                                                          telemetry namespace
              ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  ┌────────────────────────┐
                         external services                                                │                        │
              │  ┌──────────────────────┐  ┌──────────────┐  ┌──────────────────┐   │     │  ┌──────────────────┐  │
                 │  Portfolio-Analyzer   │  │  OpenAI API  │  │ Support Agent    │         │  │     Grafana      │  │
              │  │     MCP Server        │  │              │  │ Tools MCP Server │   │     │  │ Dashboards       │  │
                 │                       │  └──────────────┘  └──────────────────┘         │  └──┬─────────┬────┘  │
              │  │ Salesforce / Gong     │                                            │     │     │         │      │
                 │ Zendesk / GitHub      │   ▲                 ▲                            │  ┌──▼──┐  ┌──▼───┐  │
              │  │ Gmail / Calendar      │   │                 │                      │     │  │Tempo│  │Prom. │  │
                 └──────────▲───────────┘   │                 │                            │  └──▲──┘  └──────┘  │
              └ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ┼─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘     │     │               │
                            │ MCP           │ /v1/*           │ MCP                        │  ┌──┴────────────┐  │
                            │               │                 │                            │  │OTEL Collector │  │
                  siesta namespace          │                 │                            │  │(traces, gRPC) │  │
 ┌──────────┐  ┌────────────┼───────────────┼─────────────────┼───────────────────────┐     │  └──▲────────▲───┘  │
 │          │  │  ┌─────────┴───────────────┴─────────────────┴───────────────────┐   │     │     │        │      │
 │          │  │  │              Agent Gateway (Gateway API)                      │   │     └─────┼────────┼──────┘
 │  Browser ├──┼──┤                                                              │   │           │        │
 │          │  │  │  :443  HTTPS ── TLS termination, web traffic                 │   │    traces │ traces │
 └──────────┘  │  │  :3001 HTTP ─── MCP + OpenAI routing                         │   │           │        │
               │  │  :3002 HTTP ─── Support MCP routing                          ├───┼───────────┘        │
               │  │  :4317 TCP ──── OTEL traces passthrough                      │   │                    │
               │  │                                                              ├───┼────────────────────┘
               │  └──┬───────────────────────────────────────────────────────────┘   │
               │     │ :443                                                          │
               │     ▼                                                               │
               │  ┌────────────────────┐                                             │
               │  │                    │                                             │
               │  │  Siesta Server     ├──────────────┐                              │
               │  │  (Fastify + React) │              │                              │
               │  │                    │              │                              │
               │  │  ┌──────────────┐  │              │                              │
               │  │  │ OTEL SDK     │  │              │                              │
               │  │  │ (auto-instr.)│  │              │                              │
               │  │  └──────────────┘  │              │                              │
               │  └───┬────────────┬───┘              │                              │
               │      │            │                  │                              │
               │      ▼            ▼                  │                              │
               │  ┌────────────────┐  ┌────────┐      │                              │
               │  │  PostgreSQL    │  │ Redis  │      │                              │
               │  │ (CloudNativePG)│  │ Cache  │      │  (direct, not via AGW)       │
               │  └────────────────┘  └────────┘      │                              │
               │                                                                     │
               └─────────────────────────────────────────────────────────────────────┘
```

## Key Features

- **Portfolio Dashboard** -- Personal view of accounts with POC health indicators, action items, and open pipeline stats
- **Account Detail** -- AI-generated summaries, POC status with health ratings, grouped email threads, Gong call briefs, meetings, notes
- **Ambient Calculator** -- Upload Kubernetes bug reports (.tar.gz, .tgz, .zip) to calculate sidecar-to-ambient mesh migration savings with PDF export. Supports both YAML and `kubectl describe nodes` formats. Auto-fetches cloud instance pricing (AWS, Azure, GCP) with manual override. ROI calculated as cumulative savings / cumulative investment ratio.
- **Action Items** -- AI-extracted action items from Gong calls and interactions with completion tracking. Incremental extraction avoids re-analyzing previously processed calls.
- **Opportunities** -- Kanban board with fiscal quarter filtering and POC health dots
- **Meeting Briefs** -- AI-generated prep briefs with talking points and context
- **Team Resources & Tools** -- Shared bookmarks and tool links for the SE team
- **Insights** -- Portfolio analytics and AI-generated insights including competitive analysis (competitor mentions, product alignment, competitive threats)
- **Señor Bot** -- AI chat assistant with MCP tool access and support integration
- **Semantic Search** -- Full-text search across all interactions with inline expansion

## Environment Variables

All sensitive values must be provided via `.env` file (gitignored) or environment variables. Development defaults exist for `SESSION_SECRET` and `ENCRYPTION_KEY` but the server will refuse to start in production if they are not overridden.

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
| `OPENAI_MODEL` | OpenAI model for summarization/extraction | No (default: `gpt-4o-mini`) |
| `OPENAI_CHAT_MODEL` | OpenAI model for Señor Bot chat agent | No (default: `gpt-4o`) |
| `SUPPORT_MCP_URL` | Support MCP server endpoint | No (default: `https://support-agent-tools.is.solo.io/mcp`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP gRPC endpoint for traces (enables tracing) | No |
| `OTEL_SERVICE_NAME` | Service name for traces | No (default: `siesta`) |

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

The `siesta-secret` must contain (see `k8s/secret.yaml.tpl` for the template):
- `DATABASE_URL` -- PostgreSQL connection string (use `postgres-cnpg-rw.siesta.svc.cluster.local:5432` as host in production)
- `SESSION_SECRET` -- Random 64-char hex string
- `ENCRYPTION_KEY` -- Random 64-char hex string (32 bytes)
- `MCP_CLIENT_ID`, `MCP_CLIENT_SECRET`, `MCP_TOKEN_URL`, `MCP_AUTH_URL` -- Keycloak OIDC credentials
- `MCP_GATEWAY_API_KEY` -- Must match the agent gateway API key secret
- `OPENAI_API_KEY` -- OpenAI API key (optional -- enables AI features)

### 2. Set up GCS backup bucket (one-time)

Before deploying PostgreSQL, create the GCP resources for automated backups:

```bash
# Create the GCS bucket
gcloud storage buckets create gs://siesta-db-backups \
  --location=us-central1 --uniform-bucket-level-access

# Create the GCP service account
gcloud iam service-accounts create siesta-cnpg-backup \
  --project=field-engineering-us \
  --display-name="CNPG Backup SA"

# Grant the SA access to the bucket
gcloud storage buckets add-iam-policy-binding gs://siesta-db-backups \
  --member="serviceAccount:siesta-cnpg-backup@field-engineering-us.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Bind Workload Identity (KSA -> GSA)
gcloud iam service-accounts add-iam-policy-binding \
  siesta-cnpg-backup@field-engineering-us.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:field-engineering-us.svc.id.goog[siesta/postgres-cnpg]"
```

### 3. Deploy PostgreSQL (CloudNativePG)

```bash
kubectl apply -f k8s/postgres-cnpg.yaml
```

This creates a 3-instance PostgreSQL 16 cluster with:
- **Automated backups** to GCS (`gs://siesta-db-backups/cnpg`) via Barman
- **Daily scheduled backups** at 3 AM UTC with 30-day retention
- **Continuous WAL archiving** for point-in-time recovery
- **GKE Workload Identity** for keyless GCS authentication (service account: `siesta-cnpg-backup@field-engineering-us.iam.gserviceaccount.com`)

Manual backup:
```bash
kubectl apply -f - <<EOF
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: siesta-manual-$(date +%Y%m%d-%H%M%S)
  namespace: siesta
spec:
  cluster:
    name: postgres-cnpg
  method: barmanObjectStore
EOF
```

Recovery from backup (create a new cluster with `recovery` bootstrap):
```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: postgres-cnpg-restored
  namespace: siesta
spec:
  instances: 3
  imageName: ghcr.io/cloudnative-pg/postgresql:16
  bootstrap:
    recovery:
      source: postgres-cnpg-backup
      recoveryTarget:
        targetTime: "2026-02-27T10:00:00Z"  # optional point-in-time
  externalClusters:
    - name: postgres-cnpg-backup
      barmanObjectStore:
        destinationPath: gs://siesta-db-backups/cnpg
        googleCredentials:
          gkeEnvironment: true
  # ... same postgresql, resources, storage, affinity config as original
```

After recovery, update `DATABASE_URL` in `siesta-secret` to point to `postgres-cnpg-restored-rw` and restart the app.

### 4. Deploy Redis

```bash
kubectl apply -f k8s/redis.yaml
```

### 5. Install cert-manager

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

### 6. Deploy Agent Gateway

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
- **Gateway** with listeners: HTTPS/443 (web), HTTPS/3000 (MCP external), HTTP/3001 (MCP internal), HTTP/3002 (Support MCP), TCP/4317 (OTEL traces)
- **AgentgatewayBackend** for portfolio-analyzer MCP server
- **AgentgatewayBackend** for support-agent-tools MCP server
- **AgentgatewayBackend** for OpenAI API proxying
- **HTTPRoute** `siesta-web` routing web traffic to siesta Service
- **HTTPRoute** `portfolio-analyzer` routing MCP traffic to the backend
- **HTTPRoute** `support-agent-tools` routing support MCP traffic to the backend
- **HTTPRoute** `openai-proxy` routing `/v1/*` to OpenAI
- **TCPRoute** `otel-traces` routing gRPC traces to OTEL Collector in telemetry namespace
- **ExternalName Service** `otel-collector-traces` bridging to telemetry namespace
- **AgentgatewayPolicy** with API key auth on MCP listeners only

### 7. Deploy Telemetry Stack (OTEL, Tempo, Grafana)

```bash
./k8s/deploy-telemetry.sh
```

This deploys into the `telemetry` namespace:
- **Loki** -- log aggregation
- **Tempo** -- distributed trace storage
- **OpenTelemetry Collectors** -- traces (gRPC on 4317), metrics, and logs (DaemonSet)
- **kube-prometheus-stack** -- Prometheus + Grafana (with Tempo/Loki datasources pre-configured)
- **Grafana dashboards** -- Agent Gateway logs, traces, and metrics

After deployment, configure Agent Gateway to export traces:
```bash
kubectl apply -f k8s/agentgateway-telemetry.yaml
```

Access Grafana:
```bash
kubectl port-forward -n telemetry svc/kube-prometheus-stack-grafana 3001:80
```

To tear down: `./k8s/deploy-telemetry.sh --cleanup`

### 8. Deploy Siesta

```bash
npm run build
docker build --platform linux/amd64 -f Dockerfile.prod \
  -t us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest .
docker push us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest
kubectl apply -f k8s/app.yaml
```

### 9. Configure DNS

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

See [CLAUDE.md](./CLAUDE.md) for detailed architecture notes and full configuration reference.
