apiVersion: v1
kind: Secret
metadata:
  name: siesta-secret
  namespace: siesta
type: Opaque
stringData:
  # App secrets
  SESSION_SECRET: "${SESSION_SECRET}"
  ENCRYPTION_KEY: "${ENCRYPTION_KEY}"

  # PostgreSQL (CloudNativePG credentials, routed through AGW :5432)
  DB_PASSWORD: "${DB_PASSWORD}"
  username: "siesta"
  password: "${DB_PASSWORD}"
  DATABASE_URL: "postgresql://siesta:${DB_PASSWORD}@agentgateway.siesta.svc.cluster.local:5432/siesta"

  # MCP / Keycloak OIDC
  MCP_CLIENT_ID: "${MCP_CLIENT_ID}"
  MCP_CLIENT_SECRET: "${MCP_CLIENT_SECRET}"
  MCP_AUTH_URL: "${MCP_AUTH_URL}"
  MCP_TOKEN_URL: "${MCP_TOKEN_URL}"

  # Agent Gateway API key (must match siesta-agw-apikey secret)
  MCP_GATEWAY_API_KEY: "${MCP_GATEWAY_API_KEY}"

  # OpenAI (optional -- enables AI features)
  OPENAI_API_KEY: "${OPENAI_API_KEY}"
