import type { OrgChartNode, RosterPersonRow } from "./rosterOrganization";
import { groupPersonnelByDepartment } from "./rosterOrganization";
import {
  ORG_GRID_PADDING,
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  ORG_SLOT_HEIGHT,
  ORG_SLOT_WIDTH,
  buildBranchPath,
  buildFunctionalEdges,
  buildFunctionalQuadraticPath,
  buildPrimaryEdges,
  computeGridOrgLayout,
  getNodeCenter,
  getOrgCanvasBounds,
  mergeOrgLayoutWithSaved,
  resolveFunctionalControlPoint,
  snapPointToOrgGrid,
  type PlacedOrgNode,
} from "./orgChartLayout";
import { csvEscape } from "./dueListCsv";

export type RosterReportingLineExport = {
  _id?: string;
  subordinatePersonId: string;
  supervisorPersonId: string;
  contextLabel: string;
  pathControlX?: number;
  pathControlY?: number;
};

export type OrgChartExportInput = {
  projectName: string;
  roots: OrgChartNode[];
  personnel: RosterPersonRow[];
  reportingLines: RosterReportingLineExport[];
  savedLayouts: { personId: string; x: number; y: number }[];
  getPersonCardColor: (person: RosterPersonRow) => string | undefined;
};

type FunctionalLineGeometry = {
  path: string;
  label?: string;
  control: { x: number; y: number };
};

type OrgChartRenderData = {
  placedNodes: PlacedOrgNode[];
  bounds: { width: number; height: number };
  primaryPaths: string[];
  functionalPaths: FunctionalLineGeometry[];
  personById: Map<string, RosterPersonRow>;
  getPersonCardColor: (person: RosterPersonRow) => string | undefined;
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rosterExportBasename(projectName: string): string {
  const slug = (projectName || "roster").replace(/[^\w-]+/g, "_").slice(0, 60);
  return `${slug}_roster_${new Date().toISOString().slice(0, 10)}`;
}

function personNameById(peopleById: Map<string, RosterPersonRow>, personId?: string): string {
  if (!personId) return "";
  return peopleById.get(personId)?.fullName ?? "";
}

function formatAdditionalSupervisors(
  personId: string,
  reportingLines: RosterReportingLineExport[],
  peopleById: Map<string, RosterPersonRow>,
): string {
  return reportingLines
    .filter((line) => line.subordinatePersonId === personId)
    .map((line) => {
      const supervisor = personNameById(peopleById, line.supervisorPersonId) || "Unknown";
      const label = line.contextLabel?.trim();
      return label ? `${supervisor} (${label})` : supervisor;
    })
    .join("; ");
}

export function rosterPersonnelToCsv(
  personnel: RosterPersonRow[],
  reportingLines: RosterReportingLineExport[],
  peopleById: Map<string, RosterPersonRow>,
): string {
  const header = [
    "Full name",
    "Role title",
    "Department",
    "Management level",
    "Primary manager",
    "Additional supervisors",
    "Capabilities",
    "Job description",
  ];
  const rows = personnel
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((person) =>
      [
        csvEscape(person.fullName),
        csvEscape(person.roleTitle ?? ""),
        csvEscape(person.department ?? ""),
        csvEscape(person.managementLevel ?? ""),
        csvEscape(personNameById(peopleById, person.reportsToPersonId)),
        csvEscape(formatAdditionalSupervisors(person._id, reportingLines, peopleById)),
        csvEscape((person.capabilities ?? []).join("; ")),
        csvEscape(person.jobDescription ?? ""),
      ].join(","),
    );
  return [header.join(","), ...rows].join("\r\n");
}

export function downloadRosterCsv(
  projectName: string,
  personnel: RosterPersonRow[],
  reportingLines: RosterReportingLineExport[],
  peopleById: Map<string, RosterPersonRow>,
): void {
  const csv = rosterPersonnelToCsv(personnel, reportingLines, peopleById);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${rosterExportBasename(projectName)}.csv`);
}

function buildOrgChartRenderData(input: OrgChartExportInput): OrgChartRenderData {
  const savedByPersonId = new Map<string, { x: number; y: number }>();
  for (const layout of input.savedLayouts) {
    savedByPersonId.set(layout.personId, snapPointToOrgGrid(layout.x, layout.y));
  }

  const autoLayout = computeGridOrgLayout(input.personnel, input.roots);
  const placedNodes = mergeOrgLayoutWithSaved(autoLayout, savedByPersonId);
  const nodeById = new Map(placedNodes.map((node) => [node.id, node]));
  const bounds = getOrgCanvasBounds(placedNodes);
  const personById = new Map(input.personnel.map((person) => [person._id, person]));

  const primaryPaths = buildPrimaryEdges(input.roots, nodeById)
    .map((edge) => {
      const fromNode = nodeById.get(edge.fromId);
      const toNode = nodeById.get(edge.toId);
      if (!fromNode || !toNode) return null;
      const from = getNodeCenter(fromNode);
      const to = getNodeCenter(toNode);
      from.y += ORG_NODE_HEIGHT / 2;
      to.y -= ORG_NODE_HEIGHT / 2;
      return buildBranchPath(from, to);
    })
    .filter((path): path is string => Boolean(path));

  const functionalPaths: FunctionalLineGeometry[] = [];
  for (const [index, edge] of buildFunctionalEdges(input.reportingLines, nodeById).entries()) {
    const fromNode = nodeById.get(edge.fromId);
    const toNode = nodeById.get(edge.toId);
    if (!fromNode || !toNode) continue;
    const from = getNodeCenter(fromNode);
    const to = getNodeCenter(toNode);
    const control = resolveFunctionalControlPoint(from, to, edge, index);
    functionalPaths.push({
      path: buildFunctionalQuadraticPath(from, to, control),
      label: edge.label,
      control,
    });
  }

  return {
    placedNodes,
    bounds,
    primaryPaths,
    functionalPaths,
    personById,
    getPersonCardColor: input.getPersonCardColor,
  };
}

function cardSvgStyles(color: string | undefined): { fill: string; stroke: string } {
  if (!color) {
    return { fill: "rgba(12, 20, 32, 0.95)", stroke: "rgba(255, 255, 255, 0.18)" };
  }
  return { fill: `${color}1a`, stroke: `${color}66` };
}

export function buildOrgChartSvg(input: OrgChartExportInput): string {
  const data = buildOrgChartRenderData(input);
  const { bounds, placedNodes, primaryPaths, functionalPaths, personById, getPersonCardColor } = data;

  const gridPattern = `
    <pattern id="orgGrid" width="${ORG_SLOT_WIDTH}" height="${ORG_SLOT_HEIGHT}" patternUnits="userSpaceOnUse" x="${ORG_GRID_PADDING}" y="${ORG_GRID_PADDING}">
      <path d="M ${ORG_SLOT_WIDTH} 0 L 0 0 0 ${ORG_SLOT_HEIGHT}" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="1"/>
    </pattern>`;

  const cards = placedNodes
    .map((node) => {
      const person = personById.get(node.personId);
      const styles = cardSvgStyles(person ? getPersonCardColor(person) : undefined);
      const department = node.department
        ? `<text x="${node.x + 10}" y="${node.y + 58}" fill="rgba(125,211,252,0.85)" font-size="10" font-family="system-ui, sans-serif">${escapeHtml(node.department)}</text>`
        : "";
      return `
        <g>
          <rect x="${node.x}" y="${node.y}" width="${ORG_NODE_WIDTH}" height="${ORG_NODE_HEIGHT}" rx="8" fill="${styles.fill}" stroke="${styles.stroke}" stroke-width="1.5"/>
          <text x="${node.x + 10}" y="${node.y + 22}" fill="#ffffff" font-size="13" font-weight="600" font-family="system-ui, sans-serif">${escapeHtml(node.fullName)}</text>
          <text x="${node.x + 10}" y="${node.y + 40}" fill="rgba(255,255,255,0.55)" font-size="11" font-family="system-ui, sans-serif">${escapeHtml(node.roleTitle || "No title")}</text>
          ${department}
        </g>`;
    })
    .join("");

  const primaryLines = primaryPaths
    .map(
      (path) =>
        `<path d="${path}" fill="none" stroke="rgba(56,189,248,0.55)" stroke-width="1.75"/>`,
    )
    .join("");

  const functionalLines = functionalPaths
    .map(({ path, label, control }) => {
      const labelMarkup = label
        ? `<text x="${control.x}" y="${control.y - 8}" fill="rgba(251,191,36,0.9)" font-size="9" text-anchor="middle" font-family="system-ui, sans-serif">${escapeHtml(label)}</text>`
        : "";
      return `<path d="${path}" fill="none" stroke="rgba(251,191,36,0.6)" stroke-width="1.75" stroke-dasharray="5 4"/>${labelMarkup}`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">
  <defs>${gridPattern}</defs>
  <rect width="100%" height="100%" fill="#060b12"/>
  <rect width="100%" height="100%" fill="url(#orgGrid)"/>
  ${primaryLines}
  ${functionalLines}
  ${cards}
</svg>`;
}

export function downloadOrgChartSvg(input: OrgChartExportInput): void {
  const svg = buildOrgChartSvg(input);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, `${rosterExportBasename(input.projectName)}_org_chart.svg`);
}

export async function downloadOrgChartPng(input: OrgChartExportInput): Promise<void> {
  const svg = buildOrgChartSvg(input);
  const data = buildOrgChartRenderData(input);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = data.bounds.width * scale;
        canvas.height = data.bounds.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Unable to create canvas"));
          return;
        }
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0);
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error("PNG export failed"));
            return;
          }
          downloadBlob(pngBlob, `${rosterExportBasename(input.projectName)}_org_chart.png`);
          resolve();
        }, "image/png");
      };
      image.onerror = () => reject(new Error("Unable to render org chart image"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function openPrintWindow(title: string, bodyHtml: string): void {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=900");
  if (!printWindow) {
    throw new Error("Popup blocked. Allow popups to print.");
  }
  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 16mm; color: #111; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #555; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .dept-heading { font-size: 14px; font-weight: 600; margin: 18px 0 8px; page-break-after: avoid; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #444; margin-top: 12px; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend .line { width: 28px; border-top: 2px solid #38bdf8; }
    .legend .line.dashed { border-top-style: dashed; border-top-color: #f59e0b; }
    .chart-wrap { overflow: visible; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function rosterTableRows(
  people: RosterPersonRow[],
  reportingLines: RosterReportingLineExport[],
  peopleById: Map<string, RosterPersonRow>,
): string {
  return people
    .map((person) => {
      return `<tr>
        <td>${escapeHtml(person.fullName)}</td>
        <td>${escapeHtml(person.roleTitle ?? "")}</td>
        <td>${escapeHtml(person.department ?? "")}</td>
        <td>${escapeHtml(person.managementLevel ?? "")}</td>
        <td>${escapeHtml(personNameById(peopleById, person.reportsToPersonId))}</td>
        <td>${escapeHtml(formatAdditionalSupervisors(person._id, reportingLines, peopleById))}</td>
        <td>${escapeHtml((person.capabilities ?? []).join("; "))}</td>
      </tr>`;
    })
    .join("");
}

const ROSTER_TABLE_HEAD = `<thead><tr>
  <th>Name</th><th>Role</th><th>Department</th><th>Management level</th><th>Primary manager</th><th>Additional supervisors</th><th>Capabilities</th>
</tr></thead>`;

export function printRosterList(params: {
  projectName: string;
  viewMode: "grid" | "department";
  personnel: RosterPersonRow[];
  reportingLines: RosterReportingLineExport[];
  peopleById: Map<string, RosterPersonRow>;
}): void {
  const { projectName, viewMode, personnel, reportingLines, peopleById } = params;
  const title = `${projectName || "Personnel"} roster`;
  const meta = `Exported ${new Date().toLocaleString()} · ${personnel.length} team member${personnel.length === 1 ? "" : "s"}`;

  let body = `<h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(meta)}</div>`;

  if (viewMode === "department") {
    for (const group of groupPersonnelByDepartment(personnel)) {
      body += `<div class="dept-heading">${escapeHtml(group.department)} (${group.people.length})</div>`;
      body += `<table>${ROSTER_TABLE_HEAD}<tbody>${rosterTableRows(group.people, reportingLines, peopleById)}</tbody></table>`;
    }
  } else {
    const sorted = personnel.slice().sort((a, b) => a.fullName.localeCompare(b.fullName));
    body += `<table>${ROSTER_TABLE_HEAD}<tbody>${rosterTableRows(sorted, reportingLines, peopleById)}</tbody></table>`;
  }

  openPrintWindow(title, body);
}

export function printOrgChart(input: OrgChartExportInput): void {
  const svg = buildOrgChartSvg(input);
  const title = `${input.projectName || "Personnel"} org chart`;
  const meta = `Printed ${new Date().toLocaleString()} · ${input.personnel.length} team member${input.personnel.length === 1 ? "" : "s"}`;
  const body = `
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(meta)}</div>
    <div class="chart-wrap">${svg}</div>
    <div class="legend">
      <span><span class="line"></span> Primary reporting line</span>
      <span><span class="line dashed"></span> Additional supervisor line</span>
    </div>`;
  openPrintWindow(title, body);
}
