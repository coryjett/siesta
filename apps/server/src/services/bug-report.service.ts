import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';
import * as yaml from 'js-yaml';
import tar from 'tar-stream';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedNode {
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

export interface ParsedNamespaceRow {
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

export interface ParsedBugReport {
  clusterName: string;
  nodes: ParsedNode[];
  namespaceRows: ParsedNamespaceRow[];
}

// ── K8s Quantity Parsing ───────────────────────────────────────────────────────

function parseCpuCores(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  const s = String(value).trim();
  if (!s) return 0;
  if (s.endsWith('m')) return parseFloat(s.slice(0, -1)) / 1000;
  if (s.endsWith('n')) return parseFloat(s.slice(0, -1)) / 1_000_000_000;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseMemoryGB(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  const s = String(value).trim();
  if (!s) return 0;

  if (s.endsWith('Ki')) return parseFloat(s.slice(0, -2)) / (1024 * 1024);
  if (s.endsWith('Mi')) return parseFloat(s.slice(0, -2)) / 1024;
  if (s.endsWith('Gi')) return parseFloat(s.slice(0, -2));
  if (s.endsWith('Ti')) return parseFloat(s.slice(0, -2)) * 1024;

  if (s.endsWith('k')) return parseFloat(s.slice(0, -1)) / 1_000_000;
  if (s.endsWith('M')) return parseFloat(s.slice(0, -1)) / 1_000;
  if (s.endsWith('G')) return parseFloat(s.slice(0, -1));
  if (s.endsWith('T')) return parseFloat(s.slice(0, -1)) * 1_000;

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n / (1024 * 1024 * 1024);
}

// ── Tar Extraction ─────────────────────────────────────────────────────────────

interface TarEntry {
  name: string;
  data: Buffer;
}

function parseTar(data: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);

    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) { allZero = false; break; }
    }
    if (allZero) break;

    const nameBytes = header.subarray(0, 100);
    let nameEnd = nameBytes.indexOf(0);
    if (nameEnd === -1) nameEnd = 100;
    let name = nameBytes.subarray(0, nameEnd).toString('utf8');

    const ustarMagic = header.subarray(257, 263).toString('utf8');
    if (ustarMagic.startsWith('ustar')) {
      const prefixBytes = header.subarray(345, 500);
      let prefixEnd = prefixBytes.indexOf(0);
      if (prefixEnd === -1) prefixEnd = 155;
      const prefix = prefixBytes.subarray(0, prefixEnd).toString('utf8').trim();
      if (prefix) {
        name = prefix + '/' + name;
      }
    }

    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    const typeFlag = header[156];

    offset += 512;

    if (typeFlag === 48 || typeFlag === 0) {
      const fileData = data.subarray(offset, offset + size);
      entries.push({ name: name.replace(/^\.\//, ''), data: Buffer.from(fileData) });
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return entries;
}

// ── Bug Report Processing ──────────────────────────────────────────────────────

function isGzip(data: Buffer): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

function isZip(data: Buffer): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Strip `annotations:` blocks from YAML content. Annotations can contain
 * unquoted JSON values (e.g. `k8s.ovn.org/host-addresses: ["10.10.60.19"]`)
 * that break the js-yaml parser. We don't need annotations for node extraction
 * (only labels, capacity, and nodeInfo), so stripping them is safe.
 */
function stripAnnotations(yamlContent: string): string {
  const lines = yamlContent.split('\n');
  const result: string[] = [];
  let skipIndent = -1;

  for (const line of lines) {
    if (skipIndent >= 0) {
      const firstNonSpace = line.search(/\S/);
      if (firstNonSpace === -1 || firstNonSpace > skipIndent) {
        continue;
      }
      skipIndent = -1;
    }

    const m = line.match(/^(\s*)annotations:\s*(#.*)?$/);
    if (m) {
      skipIndent = m[1].length;
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Parse `kubectl describe nodes` text output. This format uses
 * `Name:`, `Labels:` (key=value), `Capacity:`, `System Info:` sections
 * instead of YAML structure.
 */
function extractNodesFromDescribe(clusterName: string, content: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  const blocks = content.split(/^(?=Name:\s)/m);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split('\n');
    let name = '';
    const labels: Record<string, string> = {};
    const capacity: Record<string, string> = {};
    const sysInfo: Record<string, string> = {};
    let section = '';

    for (const line of lines) {
      // Top-level field: starts at column 0, has a colon
      if (/^[A-Za-z]/.test(line)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();

          switch (key) {
            case 'Name':
              name = value;
              section = '';
              break;
            case 'Labels':
              section = 'labels';
              if (value) {
                const eq = value.indexOf('=');
                if (eq > 0) labels[value.slice(0, eq)] = value.slice(eq + 1);
              }
              break;
            case 'Capacity':
              section = 'capacity';
              break;
            case 'System Info':
              section = 'sysinfo';
              break;
            default:
              section = '';
              break;
          }
        }
        continue;
      }

      // Indented continuation line
      if (/^\s/.test(line) && section) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('---')) continue;

        if (section === 'labels') {
          const eq = trimmed.indexOf('=');
          if (eq > 0) labels[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
        } else if (section === 'capacity') {
          const colon = trimmed.indexOf(':');
          if (colon > 0) capacity[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
        } else if (section === 'sysinfo') {
          const colon = trimmed.indexOf(':');
          if (colon > 0) sysInfo[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
        }
      }
    }

    if (!name) continue;

    const type =
      labels['node.kubernetes.io/instance-type'] ??
      labels['beta.kubernetes.io/instance-type'] ??
      labels['kops.k8s.io/instancegroup'] ??
      '';
    const zone =
      labels['topology.kubernetes.io/zone'] ??
      labels['failure-domain.beta.kubernetes.io/zone'] ??
      '';
    const region =
      labels['topology.kubernetes.io/region'] ??
      labels['failure-domain.beta.kubernetes.io/region'] ??
      (zone ? zone.replace(/-[a-z]$/, '') : '');

    nodes.push({
      cluster: clusterName,
      name,
      type,
      region,
      zone,
      cpus: parseCpuCores(capacity.cpu),
      memory: parseMemoryGB(capacity.memory),
      k8sVersion: sysInfo['Kubelet Version'] ?? '',
      os: sysInfo['OS Image'] ?? sysInfo['Operating System'] ?? '',
      arch: sysInfo['Architecture'] ?? '',
    });
  }

  return nodes;
}

function extractNodes(clusterName: string, content: string): ParsedNode[] {
  // Detect `kubectl describe nodes` format (starts with "Name:" not "apiVersion:")
  const firstLine = content.trimStart().split('\n')[0];
  if (firstLine.startsWith('Name:')) {
    return extractNodesFromDescribe(clusterName, content);
  }

  let doc: any;

  try {
    doc = yaml.load(content) as any;
  } catch {
    // YAML parsing can fail when annotations contain unquoted JSON.
    // Strip annotations and retry since we only need labels and status.
    try {
      doc = yaml.load(stripAnnotations(content)) as any;
    } catch {
      return [];
    }
  }

  if (!doc?.items) return [];

  return doc.items.map((item: any) => {
    const labels = item?.metadata?.labels ?? {};
    const capacity = item?.status?.capacity ?? {};
    const nodeInfo = item?.status?.nodeInfo ?? {};

    const type =
      labels['node.kubernetes.io/instance-type'] ??
      labels['beta.kubernetes.io/instance-type'] ??
      labels['kops.k8s.io/instancegroup'] ??
      '';

    const zone =
      labels['topology.kubernetes.io/zone'] ??
      labels['failure-domain.beta.kubernetes.io/zone'] ??
      '';
    const region =
      labels['topology.kubernetes.io/region'] ??
      labels['failure-domain.beta.kubernetes.io/region'] ??
      (zone ? zone.replace(/-[a-z]$/, '') : '');

    return {
      cluster: clusterName,
      name: item?.metadata?.name ?? '',
      type,
      region,
      zone,
      cpus: parseCpuCores(capacity.cpu),
      memory: parseMemoryGB(capacity.memory),
      k8sVersion: nodeInfo.kubeletVersion ?? '',
      os: nodeInfo.osImage ?? nodeInfo.operatingSystem ?? '',
      arch: nodeInfo.architecture ?? '',
    };
  });
}

function extractNamespaceRows(clusterName: string, content: string): ParsedNamespaceRow[] {
  const pods: any[] = [];

  const documents = content.split(/^---$/m);
  for (const docStr of documents) {
    const trimmed = docStr.trim();
    if (!trimmed) continue;

    try {
      const doc = yaml.load(trimmed) as any;
      if (!doc) continue;

      if (doc.kind === 'Pod') {
        pods.push(doc);
      } else if (doc.kind === 'List' || doc.items) {
        const items = doc.items ?? [];
        for (const item of items) {
          if (item?.kind === 'Pod') {
            pods.push(item);
          }
        }
      }
    } catch {
      // Skip unparseable documents
    }
  }

  const namespaces = new Map<string, {
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
    serviceNames: Set<string>;
  }>();

  for (const pod of pods) {
    const ns = pod?.metadata?.namespace ?? 'default';

    if (!namespaces.has(ns)) {
      namespaces.set(ns, {
        pods: 0,
        containers: 0,
        reqCores: 0,
        reqMem: 0,
        limitCores: 0,
        limitMem: 0,
        sidecarProxies: 0,
        sidecarReqCPU: 0,
        sidecarReqMem: 0,
        sidecarLimitCPU: 0,
        sidecarLimitMem: 0,
        serviceNames: new Set(),
      });
    }

    const nsData = namespaces.get(ns)!;
    nsData.pods++;

    const containers = pod?.spec?.containers ?? [];
    nsData.containers += containers.length;

    const appLabel = pod?.metadata?.labels?.app ?? pod?.metadata?.labels?.['app.kubernetes.io/name'];
    if (appLabel) {
      nsData.serviceNames.add(appLabel);
    }

    for (const container of containers) {
      const resources = container?.resources ?? {};
      const requests = resources.requests ?? {};
      const limits = resources.limits ?? {};

      const reqCPU = parseCpuCores(requests.cpu);
      const reqMemGB = parseMemoryGB(requests.memory);
      const limCPU = parseCpuCores(limits.cpu);
      const limMemGB = parseMemoryGB(limits.memory);

      nsData.reqCores += reqCPU;
      nsData.reqMem += reqMemGB;
      nsData.limitCores += limCPU;
      nsData.limitMem += limMemGB;

      if (container.name === 'istio-proxy') {
        nsData.sidecarProxies++;
        nsData.sidecarReqCPU += reqCPU;
        nsData.sidecarReqMem += reqMemGB;
        nsData.sidecarLimitCPU += limCPU;
        nsData.sidecarLimitMem += limMemGB;
      }
    }
  }

  return Array.from(namespaces.entries()).map(([namespace, data]) => ({
    cluster: clusterName,
    namespace,
    services: data.serviceNames.size,
    pods: data.pods,
    containers: data.containers,
    reqCores: round(data.reqCores, 4),
    reqMem: round(data.reqMem, 4),
    limitCores: round(data.limitCores, 4),
    limitMem: round(data.limitMem, 4),
    sidecarProxies: data.sidecarProxies,
    sidecarReqCPU: round(data.sidecarReqCPU, 4),
    sidecarReqMem: round(data.sidecarReqMem, 4),
    sidecarLimitCPU: round(data.sidecarLimitCPU, 4),
    sidecarLimitMem: round(data.sidecarLimitMem, 4),
  }));
}

/* eslint-enable @typescript-eslint/no-explicit-any */

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function processTarArchive(tarData: Buffer): ParsedBugReport {
  const entries = parseTar(tarData);

  let clusterName = '';
  let nodesContent = '';
  let resourcesContent = '';
  let found = 0;

  for (const entry of entries) {
    const parts = entry.name.split('/');
    const fileName = parts[parts.length - 1];
    const parentDir = parts.length >= 2 ? parts[parts.length - 2] : '';

    if (parentDir === 'cluster' && fileName === 'cluster-context') {
      clusterName = entry.data.toString('utf8').trim().split('\n')[0]?.trim() ?? '';
      found++;
    } else if (parentDir === 'cluster' && fileName === 'nodes') {
      nodesContent = entry.data.toString('utf8');
      found++;
    } else if (parentDir === 'cluster' && fileName === 'k8s-resources') {
      resourcesContent = entry.data.toString('utf8');
      found++;
    }

    if (found === 3) break;
  }

  const nodes = nodesContent ? extractNodes(clusterName, nodesContent) : [];
  const namespaceRows = resourcesContent ? extractNamespaceRows(clusterName, resourcesContent) : [];

  return { clusterName, nodes, namespaceRows };
}

// ── Streaming Tar Extraction ──────────────────────────────────────────────────

const TARGET_FILES = new Set(['cluster-context', 'nodes', 'k8s-resources']);

/**
 * Stream-decompress a .tar.gz buffer and extract only the 3 target files.
 * Uses streaming decompression (zlib.createGunzip) to avoid the V8 4GB
 * Buffer limit that gunzipSync hits on large archives.
 */
async function processTarArchiveStream(tarGzData: Buffer): Promise<ParsedBugReport> {
  let clusterName = '';
  let nodesContent = '';
  let resourcesContent = '';
  let found = 0;

  const extract = tar.extract();

  const done = new Promise<void>((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      const parts = header.name.split('/');
      const fileName = parts[parts.length - 1];
      const parentDir = parts.length >= 2 ? parts[parts.length - 2] : '';

      if (parentDir === 'cluster' && TARGET_FILES.has(fileName)) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          const content = Buffer.concat(chunks).toString('utf8');

          if (fileName === 'cluster-context') {
            clusterName = content.trim().split('\n')[0]?.trim() ?? '';
          } else if (fileName === 'nodes') {
            nodesContent = content;
          } else if (fileName === 'k8s-resources') {
            resourcesContent = content;
          }

          found++;
          if (found === 3) {
            extract.destroy();
            resolve();
          } else {
            next();
          }
        });
        stream.on('error', next);
      } else {
        stream.resume();
        stream.on('end', next);
      }
    });

    extract.on('finish', resolve);
    extract.on('error', (err) => {
      // When we call extract.destroy() after finding all 3 files, the gunzip
      // pipe may emit an error as it tries to write to the destroyed stream.
      // This is expected and not a real failure.
      if (found >= 3) {
        resolve();
      } else {
        reject(err);
      }
    });
  });

  const gunzip = zlib.createGunzip();

  // Suppress errors from the gunzip stream when we destroy the extract
  // stream early — the pipe break causes an expected write-after-destroy error.
  gunzip.on('error', (err) => {
    if (found >= 3) return; // expected early termination
    extract.destroy(err);
  });

  Readable.from(tarGzData).pipe(gunzip).pipe(extract);

  await done;

  const nodes = nodesContent ? extractNodes(clusterName, nodesContent) : [];
  const namespaceRows = resourcesContent ? extractNamespaceRows(clusterName, resourcesContent) : [];

  return { clusterName, nodes, namespaceRows };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse a bug report buffer (.tar.gz or .zip containing .tar.gz files).
 * Returns one ParsedBugReport per cluster found.
 * Uses streaming decompression to handle archives that decompress to >4GB.
 */
export async function parseBugReport(buffer: Buffer): Promise<ParsedBugReport[]> {
  if (isZip(buffer)) {
    // Fix streaming zips that have incorrect CD offset in the EOCD record.
    // The Send client creates zips via streaming where the CD offset field
    // doesn't get updated. We fix it by computing the actual CD position
    // (EOCD offset - CD size) and patching the EOCD.
    const fixed = fixStreamingZipEocd(buffer);

    const zip = new AdmZip(fixed);
    const results: ParsedBugReport[] = [];

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const data = entry.getData();

      if (entry.entryName.endsWith('.tar.gz') || entry.entryName.endsWith('.tgz') || isGzip(data)) {
        results.push(await processTarArchiveStream(data));
      }
    }

    return results;
  } else if (isGzip(buffer)) {
    return [await processTarArchiveStream(buffer)];
  }

  throw new Error('Unsupported file format. Expected .tar.gz or .zip');
}

/**
 * Fix a streaming zip whose EOCD has an incorrect Central Directory offset.
 * The correct CD offset is (EOCD offset - CD size) since the CD is always
 * right before the EOCD in a streaming zip.
 */
function fixStreamingZipEocd(buffer: Buffer): Buffer {
  // Find EOCD signature (PK\x05\x06) scanning backwards from the end
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) return buffer;

  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const expectedCdOffset = eocdOffset - cdSize;

  // Check if the stored CD offset is wrong
  if (expectedCdOffset >= 0 && expectedCdOffset !== cdOffset) {
    // Verify the expected location has a valid CEN signature
    if (expectedCdOffset + 4 <= buffer.length && buffer.readUInt32LE(expectedCdOffset) === 0x02014b50) {
      // Patch the EOCD with the correct CD offset
      const patched = Buffer.from(buffer);
      patched.writeUInt32LE(expectedCdOffset, eocdOffset + 16);
      return patched;
    }
  }

  return buffer;
}
