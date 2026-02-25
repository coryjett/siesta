#!/usr/bin/env bash
set -euo pipefail

# Deploy the OTEL telemetry stack (Prometheus, Grafana, Loki, Tempo, OTEL collectors)
# into the telemetry namespace.
#
# Usage:
#   ./k8s/deploy-telemetry.sh            # Install / upgrade the full stack
#   ./k8s/deploy-telemetry.sh --cleanup   # Tear down the telemetry stack

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALUES_DIR="$SCRIPT_DIR/values"

# ================================================================
# Parse flags
# ================================================================
for arg in "$@"; do
  case "$arg" in
    --cleanup) CLEANUP=true ;;
    *) echo "Unknown flag: $arg"; echo "Usage: $0 [--cleanup]"; exit 1 ;;
  esac
done

# ================================================================
# Defaults (override via env vars or .env)
# ================================================================
TELEMETRY_NAMESPACE="${TELEMETRY_NAMESPACE:-telemetry}"
PROMETHEUS_CHART_VERSION="${PROMETHEUS_CHART_VERSION:-75.6.1}"
LOKI_CHART_VERSION="${LOKI_CHART_VERSION:-6.24.0}"
OTEL_COLLECTOR_CHART_VERSION="${OTEL_COLLECTOR_CHART_VERSION:-0.127.2}"
TEMPO_CHART_VERSION="${TEMPO_CHART_VERSION:-1.24.4}"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-P@ssw0rd1!}"

# ================================================================
# Cleanup mode
# ================================================================
if [[ "${CLEANUP:-}" == "true" ]]; then
  echo "===== Cleanup: Tearing down telemetry stack ====="
  echo ""

  echo "Uninstalling Helm releases from namespace $TELEMETRY_NAMESPACE..."
  helm uninstall kube-prometheus-stack -n "$TELEMETRY_NAMESPACE" 2>/dev/null || true
  helm uninstall opentelemetry-collector-logs -n "$TELEMETRY_NAMESPACE" 2>/dev/null || true
  helm uninstall opentelemetry-collector-metrics -n "$TELEMETRY_NAMESPACE" 2>/dev/null || true
  helm uninstall opentelemetry-collector-traces -n "$TELEMETRY_NAMESPACE" 2>/dev/null || true
  helm uninstall tempo -n "$TELEMETRY_NAMESPACE" 2>/dev/null || true
  helm uninstall loki -n "$TELEMETRY_NAMESPACE" 2>/dev/null || true

  echo "Deleting Grafana dashboard ConfigMaps..."
  kubectl delete -f "$SCRIPT_DIR/grafana-dashboards.yaml" --ignore-not-found 2>/dev/null || true

  echo "Deleting namespace $TELEMETRY_NAMESPACE..."
  kubectl delete namespace "$TELEMETRY_NAMESPACE" --ignore-not-found
  echo ""

  echo "===== Cleanup complete ====="
  exit 0
fi

# ================================================================
# Install: Add Helm repos
# ================================================================
echo "===== Deploying telemetry stack to namespace $TELEMETRY_NAMESPACE ====="
echo ""

echo "Adding Helm repos..."
helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts 2>/dev/null || true
helm repo update grafana prometheus-community open-telemetry
echo ""

# ================================================================
# Install: Loki
# ================================================================
echo "Installing Loki v${LOKI_CHART_VERSION}..."
helm upgrade -i --create-namespace \
  --namespace "$TELEMETRY_NAMESPACE" \
  --version "$LOKI_CHART_VERSION" \
  -f "$VALUES_DIR/loki.yaml" \
  loki grafana/loki
echo ""

# ================================================================
# Install: Tempo
# ================================================================
echo "Installing Tempo v${TEMPO_CHART_VERSION}..."
helm upgrade -i \
  --namespace "$TELEMETRY_NAMESPACE" \
  --version "$TEMPO_CHART_VERSION" \
  -f "$VALUES_DIR/tempo.yaml" \
  tempo grafana/tempo
echo ""

# ================================================================
# Install: OTEL Collector (traces)
# ================================================================
echo "Installing OpenTelemetry Collector (traces) v${OTEL_COLLECTOR_CHART_VERSION}..."
helm upgrade -i \
  --namespace "$TELEMETRY_NAMESPACE" \
  --version "$OTEL_COLLECTOR_CHART_VERSION" \
  -f "$VALUES_DIR/otel-collector-traces.yaml" \
  opentelemetry-collector-traces open-telemetry/opentelemetry-collector
echo ""

# ================================================================
# Install: OTEL Collector (metrics)
# ================================================================
echo "Installing OpenTelemetry Collector (metrics) v${OTEL_COLLECTOR_CHART_VERSION}..."
helm upgrade -i \
  --namespace "$TELEMETRY_NAMESPACE" \
  --version "$OTEL_COLLECTOR_CHART_VERSION" \
  -f "$VALUES_DIR/otel-collector-metrics.yaml" \
  opentelemetry-collector-metrics open-telemetry/opentelemetry-collector
echo ""

# ================================================================
# Install: OTEL Collector (logs)
# ================================================================
echo "Installing OpenTelemetry Collector (logs) v${OTEL_COLLECTOR_CHART_VERSION}..."
helm upgrade -i \
  --namespace "$TELEMETRY_NAMESPACE" \
  --version "$OTEL_COLLECTOR_CHART_VERSION" \
  -f "$VALUES_DIR/otel-collector-logs.yaml" \
  opentelemetry-collector-logs open-telemetry/opentelemetry-collector
echo ""

# ================================================================
# Install: kube-prometheus-stack (includes Grafana)
# ================================================================
echo "Installing kube-prometheus-stack v${PROMETHEUS_CHART_VERSION}..."
helm upgrade -i \
  --namespace "$TELEMETRY_NAMESPACE" \
  --version "$PROMETHEUS_CHART_VERSION" \
  -f "$VALUES_DIR/kube-prometheus-stack.yaml" \
  --set grafana.adminPassword="$GRAFANA_ADMIN_PASSWORD" \
  kube-prometheus-stack prometheus-community/kube-prometheus-stack
echo ""

# ================================================================
# Deploy: Grafana dashboard ConfigMaps
# ================================================================
echo "Deploying Grafana dashboards..."
kubectl apply -f "$SCRIPT_DIR/grafana-dashboards.yaml"
echo ""

# ================================================================
# Verify
# ================================================================
echo "===== Verifying deployment ====="
echo ""
kubectl -n "$TELEMETRY_NAMESPACE" get pods
echo ""
kubectl -n "$TELEMETRY_NAMESPACE" get svc
echo ""

echo "===== Telemetry stack deployed ====="
echo ""
echo "Grafana:      kubectl port-forward -n $TELEMETRY_NAMESPACE svc/kube-prometheus-stack-grafana 3001:80"
echo "Prometheus:   kubectl port-forward -n $TELEMETRY_NAMESPACE svc/kube-prometheus-stack-prometheus 9090:9090"
echo "Tempo:        kubectl port-forward -n $TELEMETRY_NAMESPACE svc/tempo 3200:3200"
echo "Loki:         kubectl port-forward -n $TELEMETRY_NAMESPACE svc/loki 3100:3100"
