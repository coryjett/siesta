import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { parseBugReport, type ParsedBugReport } from './bug-report-parser';
import { fetchPrices } from '../../api/queries/pricing';
import { api } from '../../api/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Config {
  customerName: string;
  cloudProvider: 'AWS' | 'Azure' | 'GCP';
  waypointReplicas: number;
  ztunnelTax: number;
  fleetRPS: number;
  discountPct: number;
}

interface ClusterRow {
  id: string;
  cluster: string;
  namespace: string;
  services: number;
  pods: number;
  containers: number;
  reqCores: number;
  reqMem: number;
  limitCores: number;
  limitMem: number;
  sidecarProxies: number;
  sidecarReqCPU: number;
  sidecarReqMem: number;
  sidecarLimitCPU: number;
  sidecarLimitMem: number;
}

interface NodeRow {
  id: string;
  cluster: string;
  name: string;
  type: string;
  region: string;
  zone: string;
  cpus: number;
  memory: number;
  k8sVersion: string;
  os: string;
  arch: string;
}

interface InstancePrice {
  key: string;
  type: string;
  region: string;
  cpus: number;
  count: number;
  monthlyPrice: number;
}

interface Results {
  totalClusters: number;
  totalNodes: number;
  totalNamespaces: number;
  totalPods: number;
  totalServices: number;
  avgCoresPerInstance: number;
  avgCostPerCoreMonthly: number;
  sidecarCoresReserved: number;
  sidecarCoresLimit: number;
  sidecarCostReserved: number;
  sidecarCostLimit: number;
  waypointCoresReserved: number;
  waypointCoresLimit: number;
  waypointCostReserved: number;
  waypointCostLimit: number;
  waypointSavingsReserved: number;
  waypointSavingsLimit: number;
  cpuReductionPctReserved: number;
  cpuReductionPctLimit: number;
  sharedCoresReserved: number;
  sharedCoresLimit: number;
  sharedCostReserved: number;
  sharedCostLimit: number;
  sharedSavingsReserved: number;
  sharedSavingsLimit: number;
  sharedReductionPctReserved: number;
  sharedReductionPctLimit: number;
  ztunnelCores: number;
  envoyReductionPct: number;
  avgPodsPerNamespace: number;
  hasSharedData: boolean;
  roiRows: {
    year: number;
    cumInvestment: number;
    cumSavings: number;
    roi: number;
  }[];
  breakevenMonths: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let _id = 0;
function uid() {
  return `row-${++_id}`;
}

function parseNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function isHeaderRow(line: string): boolean {
  const lower = line.toLowerCase();
  return lower.startsWith('cluster') && (lower.includes('namespace') || lower.includes('name'));
}

function parseClusterTSV(text: string): ClusterRow[] {
  return text
    .trim()
    .split('\n')
    .filter((line) => line.trim() && !isHeaderRow(line))
    .map((line) => {
      const c = line.split('\t');
      return {
        id: uid(),
        cluster: c[0]?.trim() ?? '',
        namespace: c[1]?.trim() ?? '',
        services: parseNum(c[2] ?? ''),
        pods: parseNum(c[3] ?? ''),
        containers: parseNum(c[4] ?? ''),
        reqCores: parseNum(c[5] ?? ''),
        reqMem: parseNum(c[6] ?? ''),
        limitCores: parseNum(c[7] ?? ''),
        limitMem: parseNum(c[8] ?? ''),
        sidecarProxies: parseNum(c[9] ?? ''),
        sidecarReqCPU: parseNum(c[10] ?? ''),
        sidecarReqMem: parseNum(c[11] ?? ''),
        sidecarLimitCPU: parseNum(c[12] ?? ''),
        sidecarLimitMem: parseNum(c[13] ?? ''),
      };
    });
}

function parseNodeTSV(text: string): NodeRow[] {
  return text
    .trim()
    .split('\n')
    .filter((line) => line.trim() && !isHeaderRow(line))
    .map((line) => {
      const c = line.split('\t');
      return {
        id: uid(),
        cluster: c[0]?.trim() ?? '',
        name: c[1]?.trim() ?? '',
        type: c[2]?.trim() ?? '',
        region: c[3]?.trim() ?? '',
        zone: c[4]?.trim() ?? '',
        cpus: parseNum(c[5] ?? ''),
        memory: parseNum(c[6] ?? ''),
        k8sVersion: c[7]?.trim() ?? '',
        os: c[8]?.trim() ?? '',
        arch: c[9]?.trim() ?? '',
      };
    });
}

function deriveInstancePrices(
  nodes: NodeRow[],
  existing: InstancePrice[],
): InstancePrice[] {
  const groups = new Map<
    string,
    { type: string; region: string; cpus: number; count: number }
  >();
  for (const n of nodes) {
    const key = `${n.type}|${n.region}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
    } else {
      groups.set(key, { type: n.type, region: n.region, cpus: n.cpus, count: 1 });
    }
  }
  const existingMap = new Map(existing.map((p) => [p.key, p.monthlyPrice]));
  return Array.from(groups.entries()).map(([key, g]) => ({
    key,
    ...g,
    monthlyPrice: existingMap.get(key) ?? 0,
  }));
}

function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return '$' + (n / 1_000_000).toFixed(1) + 'M';
  }
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

// ── PDF Generation ───────────────────────────────────────────────────────────

function generatePDF(results: Results, config: Config) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 40;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Solo.io — Ambient Ready Calculator', 40, y);
  y += 22;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const subtitle = [
    config.customerName || 'Unnamed Customer',
    config.cloudProvider,
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  ].join('  |  ');
  doc.text(subtitle, 40, y);
  y += 28;
  doc.setTextColor(0);

  // Summary stats table
  autoTable(doc, {
    startY: y,
    margin: { left: 40, right: 40 },
    head: [['Clusters', 'Nodes', 'Namespaces', 'Pods', 'Services', 'Avg Cores/Instance', 'Avg $/Core/Mo']],
    body: [[
      String(results.totalClusters),
      String(results.totalNodes),
      String(results.totalNamespaces),
      results.totalPods.toLocaleString(),
      results.totalServices.toLocaleString(),
      fmtNum(results.avgCoresPerInstance, 1),
      results.avgCostPerCoreMonthly > 0 ? '$' + fmtNum(results.avgCostPerCoreMonthly) : '--',
    ]],
    theme: 'grid',
    headStyles: { fillColor: [107, 38, 217], fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 9, halign: 'center' },
    styles: { cellPadding: 6 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  // CPU reduction highlight
  if (results.avgCostPerCoreMonthly > 0) {
    const minReduction = Math.min(results.cpuReductionPctReserved, results.cpuReductionPctLimit);
    const maxReduction = results.hasSharedData
      ? Math.max(results.sharedReductionPctReserved, results.sharedReductionPctLimit)
      : Math.max(results.cpuReductionPctReserved, results.cpuReductionPctLimit);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 160, 107);
    const reductionText = `${fmtPct(minReduction)} to ${fmtPct(maxReduction)} reduction in Istio CPU cost`;
    doc.text(reductionText, pageWidth / 2, y, { align: 'center' });
    doc.setTextColor(0);
    y += 24;
  }

  // Cost Comparison table
  autoTable(doc, {
    startY: y,
    margin: { left: 40, right: 40 },
    head: [
      [
        { content: 'Model', rowSpan: 2 },
        { content: 'Reserved (Requests)', colSpan: 3 },
        { content: 'Limit', colSpan: 3 },
      ],
      ['CPU Cores', 'Annual Cost', 'Savings', 'CPU Cores', 'Annual Cost', 'Savings'],
    ],
    body: [
      [
        'Sidecars (current)',
        fmtNum(results.sidecarCoresReserved),
        fmtCurrency(results.sidecarCostReserved),
        '--',
        fmtNum(results.sidecarCoresLimit),
        fmtCurrency(results.sidecarCostLimit),
        '--',
      ],
      [
        `Ambient: Waypoint per N/S (${fmtPct(results.cpuReductionPctReserved)} / ${fmtPct(results.cpuReductionPctLimit)})`,
        fmtNum(results.waypointCoresReserved),
        fmtCurrency(results.waypointCostReserved),
        fmtCurrency(results.waypointSavingsReserved),
        fmtNum(results.waypointCoresLimit),
        fmtCurrency(results.waypointCostLimit),
        fmtCurrency(results.waypointSavingsLimit),
      ],
      ...(results.hasSharedData
        ? [[
            `Ambient: Shared Waypoints (${fmtPct(results.sharedReductionPctReserved)} / ${fmtPct(results.sharedReductionPctLimit)})`,
            fmtNum(results.sharedCoresReserved),
            fmtCurrency(results.sharedCostReserved),
            fmtCurrency(results.sharedSavingsReserved),
            fmtNum(results.sharedCoresLimit),
            fmtCurrency(results.sharedCostLimit),
            fmtCurrency(results.sharedSavingsLimit),
          ]]
        : []),
    ],
    theme: 'grid',
    headStyles: { fillColor: [107, 38, 217], fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { halign: 'left', cellWidth: 'auto' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    styles: { cellPadding: 5 },
    didParseCell: (data) => {
      // Highlight savings columns green
      if (data.section === 'body' && (data.column.index === 3 || data.column.index === 6)) {
        const text = String(data.cell.raw);
        if (text !== '--') {
          data.cell.styles.textColor = [34, 160, 107];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  // Assumptions
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Assumptions', 40, y);
  y += 16;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const assumptions = [
    `Waypoint replicas per namespace: ${config.waypointReplicas}`,
    `Ztunnel DaemonSet tax: ${config.ztunnelTax} cores/node (${fmtNum(results.ztunnelCores)} cores total across ${results.totalNodes} nodes)`,
    `Avg pods per namespace: ${fmtNum(results.avgPodsPerNamespace, 1)}`,
    `Envoy reduction factor: ${fmtPct(results.envoyReductionPct)} (replaces ${fmtNum(results.avgPodsPerNamespace, 1)} sidecars with ${config.waypointReplicas} waypoint replicas)`,
    ...(results.hasSharedData
      ? [`Shared waypoint throughput: 3,000 RPS per core (${config.fleetRPS.toLocaleString()} fleet RPS = ${fmtNum(config.fleetRPS / 3000)} waypoint cores)`]
      : []),
    `Instance pricing discount: ${config.discountPct}%`,
    'Cost model: per-core cost derived from weighted average across all instance types',
  ];
  for (const line of assumptions) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 40;
    }
    doc.text(`•  ${line}`, 48, y);
    y += 14;
  }
  y += 10;

  // ROI table
  if (results.avgCostPerCoreMonthly > 0 && results.roiRows.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 40;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Return on Investment', 40, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    let roiSubtext = 'Based on $200K/year Solo.io Enterprise license and waypoint-per-namespace savings (reserved).';
    if (results.breakevenMonths < Infinity) {
      roiSubtext += ` Breakeven in ${fmtNum(results.breakevenMonths, 1)} months.`;
    }
    doc.text(roiSubtext, 40, y + 10);
    doc.setTextColor(0);
    y += 22;

    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40 },
      head: [['Year', 'Cumulative Investment', 'Cumulative Savings', 'ROI']],
      body: results.roiRows.map((row) => [
        `Year ${row.year}`,
        fmtCurrency(row.cumInvestment),
        fmtCurrency(row.cumSavings),
        fmtPct(row.roi),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [107, 38, 217], fontSize: 8, halign: 'center' },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
      styles: { cellPadding: 5 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const text = String(data.cell.raw);
          if (text.startsWith('+')) {
            data.cell.styles.textColor = [34, 160, 107];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
  }

  const customerSlug = (config.customerName || 'calculator').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  doc.save(`ambient-ready-${customerSlug}.pdf`);
}

// ── Calculation Engine ─────────────────────────────────────────────────────────

function compute(
  config: Config,
  clusterData: ClusterRow[],
  nodeData: NodeRow[],
  instancePrices: InstancePrice[],
): Results | null {
  if (clusterData.length === 0 || nodeData.length === 0) return null;

  const totalClusters = new Set(clusterData.map((r) => r.cluster)).size;
  const totalNodes = nodeData.length;
  const totalNamespaces = clusterData.length;
  const namespacesWithSidecars =
    clusterData.filter((r) => r.sidecarProxies > 0).length || totalNamespaces;
  const totalPods = clusterData.reduce((s, r) => s + r.pods, 0);
  const totalServices = clusterData.reduce((s, r) => s + r.services, 0);

  // Instance pricing
  const totalCPUs = instancePrices.reduce((s, p) => s + p.cpus * p.count, 0);
  const totalMonthlySpend = instancePrices.reduce(
    (s, p) => s + p.monthlyPrice * p.count,
    0,
  );
  const avgCoresPerInstance = totalCPUs / (totalNodes || 1);
  const discount = config.discountPct / 100;
  const avgCostPerCoreMonthly =
    totalCPUs > 0 ? (totalMonthlySpend / totalCPUs) * (1 - discount) : 0;
  const annualCostPerCore = avgCostPerCoreMonthly * 12;

  // Sidecar model
  const sidecarCoresReserved = clusterData.reduce(
    (s, r) => s + r.sidecarReqCPU,
    0,
  );
  const sidecarCoresLimit = clusterData.reduce(
    (s, r) => s + r.sidecarLimitCPU,
    0,
  );
  const sidecarCostReserved = sidecarCoresReserved * annualCostPerCore;
  const sidecarCostLimit = sidecarCoresLimit * annualCostPerCore;

  // Envoy reduction
  const avgPodsPerNamespace = totalPods / (namespacesWithSidecars || 1);
  const envoyReductionPct =
    avgPodsPerNamespace > 0
      ? (avgPodsPerNamespace - config.waypointReplicas) / avgPodsPerNamespace
      : 0;

  // Ambient - waypoint per namespace
  const ztunnelCores = totalNodes * config.ztunnelTax;

  const ambientReductionReserved =
    sidecarCoresReserved * envoyReductionPct - ztunnelCores;
  const waypointCoresReserved = sidecarCoresReserved - ambientReductionReserved;
  const cpuReductionPctReserved =
    sidecarCoresReserved > 0
      ? 1 - waypointCoresReserved / sidecarCoresReserved
      : 0;
  const waypointCostReserved = waypointCoresReserved * annualCostPerCore;
  const waypointSavingsReserved = sidecarCostReserved - waypointCostReserved;

  const ambientReductionLimit =
    sidecarCoresLimit * envoyReductionPct - ztunnelCores;
  const waypointCoresLimit = sidecarCoresLimit - ambientReductionLimit;
  const cpuReductionPctLimit =
    sidecarCoresLimit > 0
      ? 1 - waypointCoresLimit / sidecarCoresLimit
      : 0;
  const waypointCostLimit = waypointCoresLimit * annualCostPerCore;
  const waypointSavingsLimit = sidecarCostLimit - waypointCostLimit;

  // Shared waypoints
  const hasSharedData = config.fleetRPS > 0;
  let sharedCoresReserved = 0;
  let sharedCoresLimit = 0;
  let sharedCostReserved = 0;
  let sharedCostLimit = 0;
  let sharedSavingsReserved = 0;
  let sharedSavingsLimit = 0;
  let sharedReductionPctReserved = 0;
  let sharedReductionPctLimit = 0;

  if (hasSharedData) {
    const sharedWaypointCores = config.fleetRPS / 3000;
    const sharedTotal = ztunnelCores + sharedWaypointCores;

    sharedCoresReserved = sharedTotal;
    sharedCoresLimit = sharedTotal;
    sharedReductionPctReserved =
      sidecarCoresReserved > 0
        ? (sidecarCoresReserved - sharedCoresReserved) / sidecarCoresReserved
        : 0;
    sharedReductionPctLimit =
      sidecarCoresLimit > 0
        ? (sidecarCoresLimit - sharedCoresLimit) / sidecarCoresLimit
        : 0;
    sharedCostReserved = sharedCoresReserved * annualCostPerCore;
    sharedCostLimit = sharedCoresLimit * annualCostPerCore;
    sharedSavingsReserved = sidecarCostReserved - sharedCostReserved;
    sharedSavingsLimit = sidecarCostLimit - sharedCostLimit;
  }

  // ROI
  const annualInvestment = 200_000;
  const annualSavings = waypointSavingsReserved;
  const roiRows = [];
  for (let year = 1; year <= 3; year++) {
    const cumInvestment = annualInvestment * year;
    const cumSavings = annualSavings * year;
    roiRows.push({
      year,
      cumInvestment,
      cumSavings,
      roi: cumInvestment > 0 ? cumSavings / cumInvestment : 0,
    });
  }
  const monthlySavings = annualSavings / 12;
  const breakevenMonths =
    monthlySavings > 0 ? annualInvestment / monthlySavings : Infinity;

  return {
    totalClusters,
    totalNodes,
    totalNamespaces,
    totalPods,
    totalServices,
    avgCoresPerInstance,
    avgCostPerCoreMonthly,
    sidecarCoresReserved,
    sidecarCoresLimit,
    sidecarCostReserved,
    sidecarCostLimit,
    waypointCoresReserved,
    waypointCoresLimit,
    waypointCostReserved,
    waypointCostLimit,
    waypointSavingsReserved,
    waypointSavingsLimit,
    cpuReductionPctReserved,
    cpuReductionPctLimit,
    sharedCoresReserved,
    sharedCoresLimit,
    sharedCostReserved,
    sharedCostLimit,
    sharedSavingsReserved,
    sharedSavingsLimit,
    sharedReductionPctReserved,
    sharedReductionPctLimit,
    ztunnelCores,
    envoyReductionPct,
    avgPodsPerNamespace,
    hasSharedData,
    roiRows,
    breakevenMonths,
  };
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]';

const labelClass =
  'block text-xs font-medium text-[#6b677e] dark:text-[#858198] mb-1';

const thClass =
  'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] whitespace-nowrap';

const tdClass =
  'px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] whitespace-nowrap';

const tdNumClass =
  'px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] whitespace-nowrap tabular-nums text-right';

function PasteZone({
  placeholder,
  onParse,
}: {
  placeholder: string;
  onParse: (text: string) => void;
}) {
  const [text, setText] = useState('');

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={6}
        className={`${inputClass} font-mono text-xs`}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (text.trim()) {
              onParse(text);
              setText('');
            }
          }}
          disabled={!text.trim()}
          className="rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors disabled:opacity-40"
        >
          Import Data
        </button>
        {text.trim() && (
          <button
            type="button"
            onClick={() => setText('')}
            className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-1.5 text-sm font-medium text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-bold text-[#191726] dark:text-[#f2f2f2] tabular-nums">
        {value}
      </p>
    </div>
  );
}

// ── Tab 1: Configuration ───────────────────────────────────────────────────────

function ConfigTab({
  config,
  onChange,
}: {
  config: Config;
  onChange: (c: Config) => void;
}) {
  function set<K extends keyof Config>(key: K, value: Config[K]) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-6">
        <h3 className="font-display text-base font-semibold text-[#191726] dark:text-[#f2f2f2] mb-4">
          Customer & Environment
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Customer Name</label>
            <input
              type="text"
              value={config.customerName}
              onChange={(e) => set('customerName', e.target.value)}
              placeholder="Acme Corp"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Cloud Provider</label>
            <select
              value={config.cloudProvider}
              onChange={(e) =>
                set('cloudProvider', e.target.value as Config['cloudProvider'])
              }
              className={inputClass}
            >
              <option value="AWS">AWS</option>
              <option value="Azure">Azure</option>
              <option value="GCP">GCP</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-6">
        <h3 className="font-display text-base font-semibold text-[#191726] dark:text-[#f2f2f2] mb-4">
          Ambient Mesh Parameters
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Waypoint Replicas per Namespace</label>
            <input
              type="number"
              value={config.waypointReplicas}
              onChange={(e) => set('waypointReplicas', parseNum(e.target.value))}
              min={1}
              step={1}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[#6b677e] dark:text-[#858198]">
              Number of waypoint proxy replicas deployed per namespace
            </p>
          </div>
          <div>
            <label className={labelClass}>
              Ztunnel Tax (cores per node)
            </label>
            <input
              type="number"
              value={config.ztunnelTax}
              onChange={(e) => set('ztunnelTax', parseNum(e.target.value))}
              min={0}
              step={0.05}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[#6b677e] dark:text-[#858198]">
              CPU cores reserved for the ztunnel DaemonSet on each node
            </p>
          </div>
          <div>
            <label className={labelClass}>
              Total Fleet RPS at Peak{' '}
              <span className="text-[#6b677e] dark:text-[#858198] font-normal">
                (optional)
              </span>
            </label>
            <input
              type="number"
              value={config.fleetRPS || ''}
              onChange={(e) => set('fleetRPS', parseNum(e.target.value))}
              min={0}
              placeholder="e.g. 50000"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[#6b677e] dark:text-[#858198]">
              Required for shared waypoint calculation (assumes 3,000 RPS per
              waypoint core)
            </p>
          </div>
          <div>
            <label className={labelClass}>Instance Pricing Discount %</label>
            <input
              type="number"
              value={config.discountPct}
              onChange={(e) => set('discountPct', parseNum(e.target.value))}
              min={0}
              max={100}
              step={1}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[#6b677e] dark:text-[#858198]">
              Discount applied to on-demand instance pricing (e.g. reserved
              instances, EDP)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Cluster Data ────────────────────────────────────────────────────────

const CLUSTER_COLS = [
  'Cluster',
  'Namespace',
  'Services',
  'Pods',
  'Containers',
  'Req Cores',
  'Req Mem',
  'Limit Cores',
  'Limit Mem',
  'Sidecar Proxies',
  'Sidecar Req CPU',
  'Sidecar Req Mem',
  'Sidecar Limit CPU',
  'Sidecar Limit Mem',
];

function ClusterDataTab({
  rows,
  onImport,
  onDelete,
  onClear,
}: {
  rows: ClusterRow[];
  onImport: (text: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    return {
      services: rows.reduce((s, r) => s + r.services, 0),
      pods: rows.reduce((s, r) => s + r.pods, 0),
      containers: rows.reduce((s, r) => s + r.containers, 0),
      reqCores: rows.reduce((s, r) => s + r.reqCores, 0),
      reqMem: rows.reduce((s, r) => s + r.reqMem, 0),
      limitCores: rows.reduce((s, r) => s + r.limitCores, 0),
      limitMem: rows.reduce((s, r) => s + r.limitMem, 0),
      sidecarProxies: rows.reduce((s, r) => s + r.sidecarProxies, 0),
      sidecarReqCPU: rows.reduce((s, r) => s + r.sidecarReqCPU, 0),
      sidecarReqMem: rows.reduce((s, r) => s + r.sidecarReqMem, 0),
      sidecarLimitCPU: rows.reduce((s, r) => s + r.sidecarLimitCPU, 0),
      sidecarLimitMem: rows.reduce((s, r) => s + r.sidecarLimitMem, 0),
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <PasteZone
        placeholder={`Paste tab-separated namespace data here.\n\nExpected columns:\n${CLUSTER_COLS.join(' | ')}\n\nHeader row is auto-detected and skipped.`}
        onParse={onImport}
      />

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
              {rows.length} namespace{rows.length !== 1 ? 's' : ''} imported
            </p>
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              Clear all
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#dedde4] dark:border-[#2a2734]">
            <table className="w-full min-w-[1200px]">
              <thead>
                <tr className="border-b border-[#dedde4] dark:border-[#2a2734] bg-[#f9f9fb] dark:bg-[#0d0c12]">
                  {CLUSTER_COLS.map((col) => (
                    <th key={col} className={thClass}>
                      {col}
                    </th>
                  ))}
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-[#14131b]">
                {/* Totals row */}
                {totals && (
                  <tr className="border-b-2 border-[#6b26d9]/20 dark:border-[#8249df]/20 bg-[#6b26d9]/5 dark:bg-[#8249df]/10">
                    <td
                      className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#6b26d9] dark:text-[#8249df]"
                      colSpan={2}
                    >
                      Totals
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.services, 0)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.pods, 0)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.containers, 0)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.reqCores)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.reqMem)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.limitCores)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.limitMem)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.sidecarProxies, 0)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.sidecarReqCPU)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.sidecarReqMem)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.sidecarLimitCPU)}</strong>
                    </td>
                    <td className={tdNumClass}>
                      <strong>{fmtNum(totals.sidecarLimitMem)}</strong>
                    </td>
                    <td />
                  </tr>
                )}
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#dedde4]/60 dark:border-[#2a2734]/60 hover:bg-[#f9f9fb] dark:hover:bg-[#0d0c12]/50"
                  >
                    <td className={tdClass}>{row.cluster}</td>
                    <td className={tdClass}>{row.namespace}</td>
                    <td className={tdNumClass}>{row.services}</td>
                    <td className={tdNumClass}>{row.pods}</td>
                    <td className={tdNumClass}>{row.containers}</td>
                    <td className={tdNumClass}>{fmtNum(row.reqCores)}</td>
                    <td className={tdNumClass}>{fmtNum(row.reqMem)}</td>
                    <td className={tdNumClass}>{fmtNum(row.limitCores)}</td>
                    <td className={tdNumClass}>{fmtNum(row.limitMem)}</td>
                    <td className={tdNumClass}>{row.sidecarProxies}</td>
                    <td className={tdNumClass}>{fmtNum(row.sidecarReqCPU)}</td>
                    <td className={tdNumClass}>{fmtNum(row.sidecarReqMem)}</td>
                    <td className={tdNumClass}>
                      {fmtNum(row.sidecarLimitCPU)}
                    </td>
                    <td className={tdNumClass}>
                      {fmtNum(row.sidecarLimitMem)}
                    </td>
                    <td className="px-2">
                      <button
                        type="button"
                        onClick={() => onDelete(row.id)}
                        className="rounded p-1 text-[#6b677e] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Remove row"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Node Data & Pricing ─────────────────────────────────────────────────

const NODE_COLS = [
  'Cluster',
  'Name',
  'Type',
  'Region',
  'Zone',
  'CPUs',
  'Mem (GB)',
  'K8s Ver',
  'OS',
  'Arch',
];

function NodeDataTab({
  nodes,
  instancePrices,
  discountPct,
  cloudProvider,
  onImport,
  onDeleteNode,
  onClearNodes,
  onPriceChange,
}: {
  nodes: NodeRow[];
  instancePrices: InstancePrice[];
  discountPct: number;
  cloudProvider: 'AWS' | 'Azure' | 'GCP';
  onImport: (text: string) => void;
  onDeleteNode: (id: string) => void;
  onClearNodes: () => void;
  onPriceChange: (key: string, price: number) => void;
}) {
  const [fetchStatus, setFetchStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [fetchMessage, setFetchMessage] = useState('');

  const totalCPUs = instancePrices.reduce((s, p) => s + p.cpus * p.count, 0);
  const totalMonthly = instancePrices.reduce(
    (s, p) => s + p.monthlyPrice * p.count,
    0,
  );
  const discount = discountPct / 100;
  const avgCostPerCore =
    totalCPUs > 0 ? (totalMonthly / totalCPUs) * (1 - discount) : 0;

  const unpricedTypes = instancePrices.filter((ip) => ip.monthlyPrice === 0);

  async function handleFetchPrices() {
    const unpriced = instancePrices.filter((ip) => ip.monthlyPrice === 0);
    if (unpriced.length === 0) return;

    const types = [...new Set(unpriced.map((ip) => ip.type))];
    const regions = [...new Set(unpriced.map((ip) => ip.region))];

    setFetchStatus('loading');
    setFetchMessage('');

    try {
      const prices = await fetchPrices(cloudProvider, types, regions);
      let filled = 0;

      for (const ip of unpriced) {
        const regionPrices = prices[ip.type];
        if (regionPrices) {
          const price = regionPrices[ip.region];
          if (price !== undefined && price > 0) {
            onPriceChange(ip.key, price);
            filled++;
          }
        }
      }

      if (filled > 0) {
        setFetchStatus('success');
        setFetchMessage(`Populated ${filled} price${filled !== 1 ? 's' : ''}`);
      } else {
        setFetchStatus('error');
        setFetchMessage('No matching prices found for these instance types and regions');
      }
    } catch {
      setFetchStatus('error');
      setFetchMessage('Failed to fetch pricing data. You can still enter prices manually.');
    }
  }

  // Auto-fetch prices when new unpriced instance types appear
  useEffect(() => {
    if (unpricedTypes.length > 0 && fetchStatus === 'idle') {
      handleFetchPrices();
    }
  }, [instancePrices.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Paste zone */}
      <PasteZone
        placeholder={`Paste tab-separated node data here.\n\nExpected columns:\n${['Cluster', 'Name', 'Type', 'Region', 'Zone', 'CPUs', 'Memory (GB)', 'K8s Version', 'OS', 'Arch'].join(' | ')}\n\nHeader row is auto-detected and skipped.`}
        onParse={onImport}
      />

      {/* Node table */}
      {nodes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
              {nodes.length} node{nodes.length !== 1 ? 's' : ''} imported
            </p>
            <button
              type="button"
              onClick={onClearNodes}
              className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              Clear all
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#dedde4] dark:border-[#2a2734]">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-[#dedde4] dark:border-[#2a2734] bg-[#f9f9fb] dark:bg-[#0d0c12]">
                  {NODE_COLS.map((col) => (
                    <th key={col} className={thClass}>
                      {col}
                    </th>
                  ))}
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-[#14131b]">
                {nodes.map((node) => (
                  <tr
                    key={node.id}
                    className="border-b border-[#dedde4]/60 dark:border-[#2a2734]/60 hover:bg-[#f9f9fb] dark:hover:bg-[#0d0c12]/50"
                  >
                    <td className={tdClass}>{node.cluster}</td>
                    <td className={tdClass}>
                      <span className="max-w-[140px] truncate block">
                        {node.name}
                      </span>
                    </td>
                    <td className={tdClass}>{node.type}</td>
                    <td className={tdClass}>{node.region}</td>
                    <td className={tdClass}>{node.zone}</td>
                    <td className={tdNumClass}>{node.cpus}</td>
                    <td className={tdNumClass}>{fmtNum(node.memory, 1)}</td>
                    <td className={tdClass}>{node.k8sVersion}</td>
                    <td className={tdClass}>{node.os}</td>
                    <td className={tdClass}>{node.arch}</td>
                    <td className="px-2">
                      <button
                        type="button"
                        onClick={() => onDeleteNode(node.id)}
                        className="rounded p-1 text-[#6b677e] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Remove row"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Instance pricing */}
      {instancePrices.length > 0 && (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-display text-base font-semibold text-[#191726] dark:text-[#f2f2f2] mb-1">
                Instance Pricing
              </h3>
              <p className="text-xs text-[#6b677e] dark:text-[#858198]">
                Enter the monthly on-demand price for each instance type. Discount
                of {discountPct}% will be applied.
              </p>
            </div>
            <button
              type="button"
              onClick={handleFetchPrices}
              disabled={fetchStatus === 'loading'}
              className="flex items-center gap-2 rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors disabled:opacity-50 shrink-0 ml-4"
            >
              {fetchStatus === 'loading' ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4" /><path d="m16.2 7.8 2.9-2.9" /><path d="M18 12h4" /><path d="m16.2 16.2 2.9 2.9" /><path d="M12 18v4" /><path d="m4.9 19.1 2.9-2.9" /><path d="M2 12h4" /><path d="m4.9 4.9 2.9 2.9" />
                </svg>
              )}
              Fetch Prices
            </button>
          </div>

          {fetchMessage && (
            <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${
              fetchStatus === 'success'
                ? 'bg-[#22a06b]/10 dark:bg-[#22c380]/10 text-[#22a06b] dark:text-[#22c380]'
                : fetchStatus === 'error'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  : ''
            }`}>
              {fetchMessage}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#dedde4] dark:border-[#2a2734]">
                  <th className={thClass}>Instance Type</th>
                  <th className={thClass}>Region</th>
                  <th className={thClass}>CPUs</th>
                  <th className={thClass}>Count</th>
                  <th className={thClass}>Monthly Price ($)</th>
                  <th className={thClass}>Cost / Core / Mo</th>
                </tr>
              </thead>
              <tbody>
                {instancePrices.map((ip) => (
                  <tr
                    key={ip.key}
                    className="border-b border-[#dedde4]/60 dark:border-[#2a2734]/60"
                  >
                    <td className={tdClass}>
                      <code className="text-xs bg-[#f9f9fb] dark:bg-[#0d0c12] px-1.5 py-0.5 rounded">
                        {ip.type}
                      </code>
                    </td>
                    <td className={tdClass}>{ip.region}</td>
                    <td className={tdNumClass}>{ip.cpus}</td>
                    <td className={tdNumClass}>{ip.count}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={ip.monthlyPrice || ''}
                        onChange={(e) =>
                          onPriceChange(ip.key, parseNum(e.target.value))
                        }
                        placeholder="0.00"
                        min={0}
                        step={0.01}
                        className={`${inputClass} w-32 tabular-nums`}
                      />
                    </td>
                    <td className={tdNumClass}>
                      {ip.monthlyPrice > 0
                        ? '$' +
                          fmtNum(
                            (ip.monthlyPrice / ip.cpus) * (1 - discount),
                          )
                        : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-6 rounded-lg bg-[#6b26d9]/5 dark:bg-[#8249df]/10 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
                Avg Cost / Core / Month
              </p>
              <p className="text-lg font-bold text-[#191726] dark:text-[#f2f2f2] tabular-nums">
                {avgCostPerCore > 0 ? '$' + fmtNum(avgCostPerCore) : '--'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
                Total Monthly Spend
              </p>
              <p className="text-lg font-bold text-[#191726] dark:text-[#f2f2f2] tabular-nums">
                {totalMonthly > 0 ? fmtCurrency(totalMonthly) : '--'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
                After {discountPct}% Discount
              </p>
              <p className="text-lg font-bold text-[#191726] dark:text-[#f2f2f2] tabular-nums">
                {totalMonthly > 0
                  ? fmtCurrency(totalMonthly * (1 - discount))
                  : '--'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Results ─────────────────────────────────────────────────────────────

function ResultsTab({
  results,
  config,
}: {
  results: Results | null;
  config: Config;
}) {
  if (!results) {
    return (
      <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
        <p className="text-sm text-[#6b677e] dark:text-[#858198]">
          Import cluster data and node data with pricing to see results.
        </p>
      </div>
    );
  }

  const minReduction = Math.min(
    results.cpuReductionPctReserved,
    results.cpuReductionPctLimit,
  );
  const maxReduction = results.hasSharedData
    ? Math.max(
        results.sharedReductionPctReserved,
        results.sharedReductionPctLimit,
      )
    : Math.max(results.cpuReductionPctReserved, results.cpuReductionPctLimit);

  return (
    <div className="space-y-6">
      {/* Download PDF */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => generatePDF(results, config)}
          className="flex items-center gap-2 rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PDF
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatBox label="Clusters" value={results.totalClusters} />
        <StatBox label="Nodes" value={results.totalNodes} />
        <StatBox label="Namespaces" value={results.totalNamespaces} />
        <StatBox label="Pods" value={results.totalPods.toLocaleString()} />
        <StatBox label="Services" value={results.totalServices.toLocaleString()} />
        <StatBox
          label="Avg Cores/Instance"
          value={fmtNum(results.avgCoresPerInstance, 1)}
        />
        <StatBox
          label="Avg $/Core/Mo"
          value={
            results.avgCostPerCoreMonthly > 0
              ? '$' + fmtNum(results.avgCostPerCoreMonthly)
              : '--'
          }
        />
      </div>

      {/* CPU reduction range */}
      {results.avgCostPerCoreMonthly > 0 && (
        <div className="rounded-xl border-2 border-[#22a06b]/30 dark:border-[#22c380]/30 bg-[#22a06b]/5 dark:bg-[#22c380]/10 p-5">
          <p className="text-center text-lg font-bold text-[#22a06b] dark:text-[#22c380]">
            {fmtPct(minReduction)} to {fmtPct(maxReduction)} reduction in Istio
            CPU cost
          </p>
          <p className="text-center text-xs text-[#6b677e] dark:text-[#858198] mt-1">
            Range from waypoint-per-namespace (reserved) to{' '}
            {results.hasSharedData ? 'shared waypoints (limit)' : 'limit-based calculation'}
          </p>
        </div>
      )}

      {/* Cost comparison table */}
      <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-6">
        <h3 className="font-display text-base font-semibold text-[#191726] dark:text-[#f2f2f2] mb-4">
          Cost Comparison
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#dedde4] dark:border-[#2a2734]">
                <th className={thClass} rowSpan={2}>
                  Model
                </th>
                <th
                  className={`${thClass} text-center border-l border-[#dedde4] dark:border-[#2a2734]`}
                  colSpan={3}
                >
                  Reserved (Requests)
                </th>
                <th
                  className={`${thClass} text-center border-l border-[#dedde4] dark:border-[#2a2734]`}
                  colSpan={3}
                >
                  Limit
                </th>
              </tr>
              <tr className="border-b border-[#dedde4] dark:border-[#2a2734]">
                <th
                  className={`${thClass} border-l border-[#dedde4] dark:border-[#2a2734]`}
                >
                  CPU Cores
                </th>
                <th className={thClass}>Annual Cost</th>
                <th className={thClass}>Savings</th>
                <th
                  className={`${thClass} border-l border-[#dedde4] dark:border-[#2a2734]`}
                >
                  CPU Cores
                </th>
                <th className={thClass}>Annual Cost</th>
                <th className={thClass}>Savings</th>
              </tr>
            </thead>
            <tbody>
              {/* Sidecars */}
              <tr className="border-b border-[#dedde4]/60 dark:border-[#2a2734]/60">
                <td className={`${tdClass} font-medium`}>
                  Sidecars (current)
                </td>
                <td
                  className={`${tdNumClass} border-l border-[#dedde4] dark:border-[#2a2734]`}
                >
                  {fmtNum(results.sidecarCoresReserved)}
                </td>
                <td className={tdNumClass}>
                  {fmtCurrency(results.sidecarCostReserved)}
                </td>
                <td className={`${tdNumClass} text-[#6b677e] dark:text-[#858198]`}>
                  --
                </td>
                <td
                  className={`${tdNumClass} border-l border-[#dedde4] dark:border-[#2a2734]`}
                >
                  {fmtNum(results.sidecarCoresLimit)}
                </td>
                <td className={tdNumClass}>
                  {fmtCurrency(results.sidecarCostLimit)}
                </td>
                <td className={`${tdNumClass} text-[#6b677e] dark:text-[#858198]`}>
                  --
                </td>
              </tr>

              {/* Waypoint per Namespace */}
              <tr className="border-b border-[#dedde4]/60 dark:border-[#2a2734]/60 bg-[#22a06b]/5 dark:bg-[#22c380]/5">
                <td className={`${tdClass} font-medium`}>
                  <span>Ambient: Waypoint per N/S</span>
                  <br />
                  <span className="text-[10px] text-[#6b677e] dark:text-[#858198]">
                    {fmtPct(results.cpuReductionPctReserved)} reduction (req) /{' '}
                    {fmtPct(results.cpuReductionPctLimit)} (limit)
                  </span>
                </td>
                <td
                  className={`${tdNumClass} border-l border-[#dedde4] dark:border-[#2a2734]`}
                >
                  {fmtNum(results.waypointCoresReserved)}
                </td>
                <td className={tdNumClass}>
                  {fmtCurrency(results.waypointCostReserved)}
                </td>
                <td className={`${tdNumClass} font-semibold text-[#22a06b] dark:text-[#22c380]`}>
                  {fmtCurrency(results.waypointSavingsReserved)}
                </td>
                <td
                  className={`${tdNumClass} border-l border-[#dedde4] dark:border-[#2a2734]`}
                >
                  {fmtNum(results.waypointCoresLimit)}
                </td>
                <td className={tdNumClass}>
                  {fmtCurrency(results.waypointCostLimit)}
                </td>
                <td className={`${tdNumClass} font-semibold text-[#22a06b] dark:text-[#22c380]`}>
                  {fmtCurrency(results.waypointSavingsLimit)}
                </td>
              </tr>

              {/* Shared Waypoints */}
              {results.hasSharedData && (
                <tr className="bg-[#22a06b]/5 dark:bg-[#22c380]/5">
                  <td className={`${tdClass} font-medium`}>
                    <span>Ambient: Shared Waypoints</span>
                    <br />
                    <span className="text-[10px] text-[#6b677e] dark:text-[#858198]">
                      {fmtPct(results.sharedReductionPctReserved)} reduction
                      (req) / {fmtPct(results.sharedReductionPctLimit)} (limit)
                    </span>
                  </td>
                  <td
                    className={`${tdNumClass} border-l border-[#dedde4] dark:border-[#2a2734]`}
                  >
                    {fmtNum(results.sharedCoresReserved)}
                  </td>
                  <td className={tdNumClass}>
                    {fmtCurrency(results.sharedCostReserved)}
                  </td>
                  <td className={`${tdNumClass} font-semibold text-[#22a06b] dark:text-[#22c380]`}>
                    {fmtCurrency(results.sharedSavingsReserved)}
                  </td>
                  <td
                    className={`${tdNumClass} border-l border-[#dedde4] dark:border-[#2a2734]`}
                  >
                    {fmtNum(results.sharedCoresLimit)}
                  </td>
                  <td className={tdNumClass}>
                    {fmtCurrency(results.sharedCostLimit)}
                  </td>
                  <td className={`${tdNumClass} font-semibold text-[#22a06b] dark:text-[#22c380]`}>
                    {fmtCurrency(results.sharedSavingsLimit)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assumptions */}
      <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-6">
        <h3 className="font-display text-base font-semibold text-[#191726] dark:text-[#f2f2f2] mb-3">
          Assumptions
        </h3>
        <ul className="space-y-1.5 text-sm text-[#6b677e] dark:text-[#858198]">
          <li>
            Waypoint replicas per namespace:{' '}
            <strong className="text-[#191726] dark:text-[#f2f2f2]">
              {config.waypointReplicas}
            </strong>
          </li>
          <li>
            Ztunnel DaemonSet tax:{' '}
            <strong className="text-[#191726] dark:text-[#f2f2f2]">
              {config.ztunnelTax} cores/node
            </strong>{' '}
            ({fmtNum(results.ztunnelCores)} cores total across{' '}
            {results.totalNodes} nodes)
          </li>
          <li>
            Avg pods per namespace:{' '}
            <strong className="text-[#191726] dark:text-[#f2f2f2]">
              {fmtNum(results.avgPodsPerNamespace, 1)}
            </strong>
          </li>
          <li>
            Envoy reduction factor:{' '}
            <strong className="text-[#191726] dark:text-[#f2f2f2]">
              {fmtPct(results.envoyReductionPct)}
            </strong>{' '}
            (replaces {fmtNum(results.avgPodsPerNamespace, 1)} sidecars with{' '}
            {config.waypointReplicas} waypoint replicas)
          </li>
          {results.hasSharedData && (
            <li>
              Shared waypoint throughput:{' '}
              <strong className="text-[#191726] dark:text-[#f2f2f2]">
                3,000 RPS per core
              </strong>{' '}
              ({config.fleetRPS.toLocaleString()} fleet RPS ={' '}
              {fmtNum(config.fleetRPS / 3000)} waypoint cores)
            </li>
          )}
          <li>
            Instance pricing discount:{' '}
            <strong className="text-[#191726] dark:text-[#f2f2f2]">
              {config.discountPct}%
            </strong>
          </li>
          <li>
            Cost model: per-core cost derived from weighted average across all
            instance types
          </li>
        </ul>
      </div>

      {/* ROI table */}
      {results.avgCostPerCoreMonthly > 0 && (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-6">
          <h3 className="font-display text-base font-semibold text-[#191726] dark:text-[#f2f2f2] mb-1">
            Return on Investment
          </h3>
          <p className="text-xs text-[#6b677e] dark:text-[#858198] mb-4">
            Based on $200K/year Solo.io Enterprise license and waypoint-per-namespace
            savings (reserved).
            {results.breakevenMonths < Infinity && (
              <span>
                {' '}
                Breakeven in{' '}
                <strong className="text-[#191726] dark:text-[#f2f2f2]">
                  {fmtNum(results.breakevenMonths, 1)} months
                </strong>
                .
              </span>
            )}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#dedde4] dark:border-[#2a2734]">
                  <th className={thClass}>Year</th>
                  <th className={thClass}>Cumulative Investment</th>
                  <th className={thClass}>Cumulative Savings</th>
                  <th className={thClass}>ROI</th>
                </tr>
              </thead>
              <tbody>
                {results.roiRows.map((row) => (
                  <tr
                    key={row.year}
                    className="border-b border-[#dedde4]/60 dark:border-[#2a2734]/60"
                  >
                    <td className={`${tdClass} font-medium`}>
                      Year {row.year}
                    </td>
                    <td className={tdNumClass}>
                      {fmtCurrency(row.cumInvestment)}
                    </td>
                    <td className={tdNumClass}>
                      {fmtCurrency(row.cumSavings)}
                    </td>
                    <td
                      className={`${tdNumClass} font-semibold ${
                        row.roi >= 0
                          ? 'text-[#22a06b] dark:text-[#22c380]'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {fmtPct(row.roi)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS = ['Configuration', 'Cluster Data', 'Node Data & Pricing', 'Results'] as const;

export default function AmbientCalculatorPage() {
  const [activeTab, setActiveTab] = useState(0);

  const [config, setConfig] = useState<Config>({
    customerName: '',
    cloudProvider: 'AWS',
    waypointReplicas: 3,
    ztunnelTax: 0.3,
    fleetRPS: 0,
    discountPct: 5,
  });

  const [clusterData, setClusterData] = useState<ClusterRow[]>([]);
  const [nodeData, setNodeData] = useState<NodeRow[]>([]);
  const [instancePrices, setInstancePrices] = useState<InstancePrice[]>([]);

  // Bug report upload state
  const [uploadStatus, setUploadStatus] = useState<{
    active: boolean;
    currentFile: string;
    processed: number;
    total: number;
    results: { clusterName: string; nodes: number; namespaces: number }[];
    error: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Send-solo.io link form state
  const [linkEntries, setLinkEntries] = useState<Array<{ url: string; password: string }>>([
    { url: '', password: '' },
  ]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [jobId, setJobId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('bugreport_jobId') : null,
  );
  const [jobStatus, setJobStatus] = useState<{
    status: 'processing' | 'completed' | 'failed';
    linksTotal: number;
    linksProcessed: number;
    error?: string;
  } | null>(null);

  // Check URL search params for jobId (from chat notification link)
  const search = useSearch({ strict: false }) as { jobId?: string };
  useEffect(() => {
    if (search.jobId && search.jobId !== jobId) {
      setJobId(search.jobId);
      localStorage.setItem('bugreport_jobId', search.jobId);
    }
  }, [search.jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for job status when a jobId is active
  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const data = await api.get<{
          status: 'processing' | 'completed' | 'failed';
          results?: ParsedBugReport[];
          error?: string;
          linksTotal: number;
          linksProcessed: number;
        }>(`/bug-report/jobs/${jobId}`);

        if (cancelled) return;

        setJobStatus({
          status: data.status,
          linksTotal: data.linksTotal,
          linksProcessed: data.linksProcessed,
          error: data.error,
        });

        if (data.status === 'completed' && data.results) {
          // Merge results into calculator state
          const newClusterRows: ClusterRow[] = data.results.flatMap((r) =>
            r.namespaceRows.map((ns) => ({
              id: uid(),
              ...ns,
            })),
          );

          const newNodeRows: NodeRow[] = data.results.flatMap((r) =>
            r.nodes.map((n) => ({
              id: uid(),
              ...n,
            })),
          );

          if (newClusterRows.length > 0) {
            setClusterData((prev) => [...prev, ...newClusterRows]);
          }

          if (newNodeRows.length > 0) {
            setNodeData((prev) => {
              const next = [...prev, ...newNodeRows];
              setInstancePrices((existing) => deriveInstancePrices(next, existing));
              return next;
            });
          }

          // Clean up
          localStorage.removeItem('bugreport_jobId');
          setJobId(null);
          return;
        }

        if (data.status === 'failed') {
          localStorage.removeItem('bugreport_jobId');
          setJobId(null);
          return;
        }
      } catch {
        // Job not found or expired — clear stale state silently
        if (!cancelled) {
          localStorage.removeItem('bugreport_jobId');
          setJobId(null);
        }
        return;
      }

      // Keep polling while processing
      if (!cancelled) {
        setTimeout(poll, 3000);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLinkSubmit = useCallback(async () => {
    const validLinks = linkEntries.filter((l) => l.url.trim());
    if (validLinks.length === 0) return;

    try {
      const data = await api.post<{ jobId: string }>('/bug-report/jobs', { links: validLinks });
      setJobId(data.jobId);
      setJobStatus({ status: 'processing', linksTotal: validLinks.length, linksProcessed: 0 });
      localStorage.setItem('bugreport_jobId', data.jobId);
      setShowLinkForm(false);
      setLinkEntries([{ url: '', password: '' }]);
    } catch (err) {
      setJobStatus({
        status: 'failed',
        linksTotal: 0,
        linksProcessed: 0,
        error: err instanceof Error ? err.message : 'Failed to create job',
      });
    }
  }, [linkEntries]);

  const handleBugReportUpload = useCallback(
    async (files: FileList) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setUploadStatus({
        active: true,
        currentFile: `${fileArray.length} file${fileArray.length > 1 ? 's' : ''}`,
        processed: 0,
        total: fileArray.length,
        results: [],
        error: null,
      });

      // Process all files concurrently
      const settled = await Promise.allSettled(
        fileArray.map((file) => parseBugReport(file)),
      );

      const allResults: ParsedBugReport[] = [];
      const resultSummaries: Array<{ clusterName: string; nodes: number; namespaces: number }> = [];
      const errors: string[] = [];

      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        if (outcome.status === 'fulfilled') {
          allResults.push(...outcome.value);
          for (const p of outcome.value) {
            resultSummaries.push({
              clusterName: p.clusterName || fileArray[i].name,
              nodes: p.nodes.length,
              namespaces: p.namespaceRows.length,
            });
          }
        } else {
          const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          errors.push(`Failed to parse ${fileArray[i].name}: ${msg}`);
        }
      }

      setUploadStatus((prev) =>
        prev
          ? {
              ...prev,
              processed: fileArray.length,
              results: resultSummaries,
              error: errors.length > 0 ? errors.join('; ') : null,
            }
          : prev,
      );

      // Merge parsed data into state
      if (allResults.length > 0) {
        const newClusterRows: ClusterRow[] = allResults.flatMap((r) =>
          r.namespaceRows.map((ns) => ({
            id: uid(),
            ...ns,
          })),
        );

        const newNodeRows: NodeRow[] = allResults.flatMap((r) =>
          r.nodes.map((n) => ({
            id: uid(),
            ...n,
          })),
        );

        if (newClusterRows.length > 0) {
          setClusterData((prev) => [...prev, ...newClusterRows]);
        }

        if (newNodeRows.length > 0) {
          setNodeData((prev) => {
            const next = [...prev, ...newNodeRows];
            setInstancePrices((existing) => deriveInstancePrices(next, existing));
            return next;
          });
        }
      }

      // Mark upload as complete (keep status visible)
      setUploadStatus((prev) => (prev ? { ...prev, active: false } : prev));
    },
    [],
  );

  const results = useMemo(
    () => compute(config, clusterData, nodeData, instancePrices),
    [config, clusterData, nodeData, instancePrices],
  );

  function handleClusterImport(text: string) {
    const parsed = parseClusterTSV(text);
    if (parsed.length > 0) {
      setClusterData((prev) => [...prev, ...parsed]);
    }
  }

  function handleNodeImport(text: string) {
    const parsed = parseNodeTSV(text);
    if (parsed.length > 0) {
      setNodeData((prev) => {
        const next = [...prev, ...parsed];
        setInstancePrices((existing) => deriveInstancePrices(next, existing));
        return next;
      });
    }
  }

  function handlePriceChange(key: string, price: number) {
    setInstancePrices((prev) =>
      prev.map((p) => (p.key === key ? { ...p, monthlyPrice: price } : p)),
    );
  }

  const tabHasData = [
    true,
    clusterData.length > 0,
    nodeData.length > 0,
    results !== null,
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-[#6b677e] dark:text-[#858198] mb-2">
          <Link
            to="/tools"
            className="hover:text-[#6b26d9] dark:hover:text-[#8249df] transition-colors"
          >
            Tools
          </Link>
          <span>/</span>
          <span className="text-[#191726] dark:text-[#f2f2f2]">
            Ambient Ready Calculator
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">
              Ambient Ready Calculator
            </h1>
            {config.customerName && (
              <p className="mt-0.5 text-sm text-[#6b677e] dark:text-[#858198]">
                {config.customerName}
                {config.cloudProvider && ` \u00B7 ${config.cloudProvider}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLinkForm((v) => !v)}
              disabled={jobStatus?.status === 'processing'}
              className="flex items-center gap-2 rounded-lg border border-[#6b26d9] dark:border-[#8249df] bg-[#6b26d9]/5 dark:bg-[#8249df]/10 px-4 py-2 text-sm font-medium text-[#6b26d9] dark:text-[#a67cef] hover:bg-[#6b26d9]/10 dark:hover:bg-[#8249df]/20 transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Import via Link
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tar.gz,.tgz,.zip"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleBugReportUpload(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStatus?.active}
              className="flex items-center gap-2 rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-4 py-2 text-sm font-medium text-[#191726] dark:text-[#f2f2f2] hover:bg-[#f9f9fb] dark:hover:bg-[#0d0c12] transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload Files
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-[#f9f9fb] dark:bg-[#0d0c12] px-4 py-3">
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">
            Generate bug reports with{' '}
            <code className="rounded bg-[#dedde4] dark:bg-[#2a2734] px-1.5 py-0.5 text-xs font-mono text-[#191726] dark:text-[#f2f2f2]">
              istioctl bug-report --include &quot;-&quot;
            </code>
            {' '}on each cluster, then upload or import via link.
            The <code className="rounded bg-[#dedde4] dark:bg-[#2a2734] px-1 py-0.5 text-xs font-mono text-[#191726] dark:text-[#f2f2f2]">--include &quot;-&quot;</code> flag
            captures all namespaces, not just Istio-injected ones.
          </p>
        </div>

        {/* Send-solo.io link form */}
        {showLinkForm && (
          <div className="mt-3 rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-[#f9f9fb] dark:bg-[#0d0c12] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
                Import from send-solo.io
              </h3>
              <button
                type="button"
                onClick={() => setShowLinkForm(false)}
                className="rounded p-1 text-[#6b677e] hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[#6b677e] dark:text-[#858198] mb-3">
              Paste your send-solo.io download link(s) and password(s). Each link can have a different password.
            </p>
            <div className="space-y-2">
              {linkEntries.map((entry, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={entry.url}
                    onChange={(e) => {
                      const next = [...linkEntries];
                      next[i] = { ...next[i], url: e.target.value };
                      setLinkEntries(next);
                    }}
                    placeholder="https://send-solo.io/download/..."
                    className="flex-1 rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#b0adc0] dark:placeholder-[#4a4658] outline-none focus:border-[#6b26d9] transition-colors"
                  />
                  <input
                    type="password"
                    value={entry.password}
                    onChange={(e) => {
                      const next = [...linkEntries];
                      next[i] = { ...next[i], password: e.target.value };
                      setLinkEntries(next);
                    }}
                    placeholder="Password"
                    className="w-40 rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#b0adc0] dark:placeholder-[#4a4658] outline-none focus:border-[#6b26d9] transition-colors"
                  />
                  {linkEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLinkEntries((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded p-2 text-[#6b677e] hover:text-red-600 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={() => setLinkEntries((prev) => [...prev, { url: '', password: '' }])}
                className="text-xs text-[#6b26d9] dark:text-[#a67cef] hover:underline"
              >
                + Add another link
              </button>
              <button
                type="button"
                onClick={handleLinkSubmit}
                disabled={!linkEntries.some((l) => l.url.trim())}
                className="rounded-lg bg-[#6b26d9] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1ec0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Process Bug Reports
              </button>
            </div>
          </div>
        )}

        {/* Job status banner */}
        {jobStatus && (
          <div className={`mt-3 rounded-xl border p-4 ${
            jobStatus.status === 'failed'
              ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
              : jobStatus.status === 'processing'
                ? 'border-[#6b26d9]/30 dark:border-[#8249df]/30 bg-[#6b26d9]/5 dark:bg-[#8249df]/10'
                : 'border-[#22a06b]/30 dark:border-[#22c380]/30 bg-[#22a06b]/5 dark:bg-[#22c380]/10'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {jobStatus.status === 'processing' ? (
                  <svg className="h-4 w-4 animate-spin text-[#6b26d9] dark:text-[#8249df]" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                  </svg>
                ) : jobStatus.status === 'failed' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#22a06b] dark:text-[#22c380]">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                )}
                <div>
                  {jobStatus.status === 'processing' ? (
                    <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
                      Downloading and parsing bug reports... ({jobStatus.linksProcessed}/{jobStatus.linksTotal} links)
                    </p>
                  ) : jobStatus.status === 'failed' ? (
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{jobStatus.error}</p>
                  ) : (
                    <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
                      Bug reports processed and imported successfully.
                    </p>
                  )}
                  {jobStatus.status === 'processing' && (
                    <p className="text-xs text-[#6b677e] dark:text-[#858198] mt-0.5">
                      You can navigate away — Señor Bot will notify you when done.
                    </p>
                  )}
                </div>
              </div>
              {jobStatus.status !== 'processing' && (
                <button
                  type="button"
                  onClick={() => setJobStatus(null)}
                  className="rounded p-1 text-[#6b677e] hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Upload status banner */}
        {uploadStatus && (
          <div className={`mt-3 rounded-xl border p-4 ${
            uploadStatus.error
              ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
              : uploadStatus.active
                ? 'border-[#6b26d9]/30 dark:border-[#8249df]/30 bg-[#6b26d9]/5 dark:bg-[#8249df]/10'
                : 'border-[#22a06b]/30 dark:border-[#22c380]/30 bg-[#22a06b]/5 dark:bg-[#22c380]/10'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {uploadStatus.active ? (
                  <svg className="h-4 w-4 animate-spin text-[#6b26d9] dark:text-[#8249df]" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                  </svg>
                ) : uploadStatus.error ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#22a06b] dark:text-[#22c380]">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                )}
                <div>
                  {uploadStatus.active ? (
                    <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
                      Parsing {uploadStatus.currentFile}... ({uploadStatus.processed}/{uploadStatus.total})
                    </p>
                  ) : uploadStatus.error ? (
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{uploadStatus.error}</p>
                  ) : (
                    <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
                      Imported {uploadStatus.results.length} cluster{uploadStatus.results.length !== 1 ? 's' : ''}
                      {' \u2014 '}
                      {uploadStatus.results.map((r) => `${r.clusterName} (${r.nodes} nodes, ${r.namespaces} namespaces)`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              {!uploadStatus.active && (
                <button
                  type="button"
                  onClick={() => setUploadStatus(null)}
                  className="rounded p-1 text-[#6b677e] hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-[#f9f9fb] dark:bg-[#0d0c12] border border-[#dedde4] dark:border-[#2a2734] p-1">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(i)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === i
                ? 'bg-white dark:bg-[#14131b] text-[#191726] dark:text-[#f2f2f2] shadow-sm'
                : 'text-[#6b677e] dark:text-[#858198] hover:text-[#191726] dark:hover:text-[#f2f2f2]'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                tabHasData[i] && i > 0
                  ? 'bg-[#22a06b]/10 dark:bg-[#22c380]/20 text-[#22a06b] dark:text-[#22c380]'
                  : activeTab === i
                    ? 'bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-[#6b26d9] dark:text-[#8249df]'
                    : 'bg-[#e9e8ed] dark:bg-[#25232f] text-[#6b677e] dark:text-[#858198]'
              }`}
            >
              {tabHasData[i] && i > 0 ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className="hidden sm:inline">{tab}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 0 && <ConfigTab config={config} onChange={setConfig} />}

      {activeTab === 1 && (
        <ClusterDataTab
          rows={clusterData}
          onImport={handleClusterImport}
          onDelete={(id) =>
            setClusterData((prev) => prev.filter((r) => r.id !== id))
          }
          onClear={() => setClusterData([])}
        />
      )}

      {activeTab === 2 && (
        <NodeDataTab
          nodes={nodeData}
          instancePrices={instancePrices}
          discountPct={config.discountPct}
          cloudProvider={config.cloudProvider}
          onImport={handleNodeImport}
          onDeleteNode={(id) =>
            setNodeData((prev) => {
              const next = prev.filter((r) => r.id !== id);
              setInstancePrices((existing) =>
                deriveInstancePrices(next, existing),
              );
              return next;
            })
          }
          onClearNodes={() => {
            setNodeData([]);
            setInstancePrices([]);
          }}
          onPriceChange={handlePriceChange}
        />
      )}

      {activeTab === 3 && <ResultsTab results={results} config={config} />}

      {/* Navigation buttons */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => setActiveTab((t) => Math.max(0, t - 1))}
          disabled={activeTab === 0}
          className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-2 text-sm font-medium text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => setActiveTab((t) => Math.min(TABS.length - 1, t + 1))}
          disabled={activeTab === TABS.length - 1}
          className="rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
