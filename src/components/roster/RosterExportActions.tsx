import { useState } from "react";
import { FiDownload, FiImage, FiPrinter } from "react-icons/fi";
import { toast } from "sonner";
import type { OrgChartNode, RosterPersonRow } from "../../utils/rosterOrganization";
import {
  downloadOrgChartPng,
  downloadOrgChartSvg,
  downloadRosterCsv,
  printOrgChart,
  printRosterList,
  type RosterReportingLineExport,
} from "../../utils/rosterExport";
import { Button } from "../ui";

type Props = {
  projectName: string;
  viewMode: "grid" | "department" | "org-chart";
  personnel: RosterPersonRow[];
  reportingLines: RosterReportingLineExport[];
  peopleById: Map<string, RosterPersonRow>;
  roots: OrgChartNode[];
  savedLayouts: { personId: string; x: number; y: number }[];
  getPersonCardColor: (person: RosterPersonRow) => string | undefined;
};

export function RosterExportActions({
  projectName,
  viewMode,
  personnel,
  reportingLines,
  peopleById,
  roots,
  savedLayouts,
  getPersonCardColor,
}: Props) {
  const [isExportingChart, setIsExportingChart] = useState(false);

  const orgChartInput = {
    projectName,
    roots,
    personnel,
    reportingLines,
    savedLayouts,
    getPersonCardColor,
  };

  const handleExportCsv = () => {
    try {
      downloadRosterCsv(projectName, personnel, reportingLines, peopleById);
      toast.success("Roster CSV downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV export failed");
    }
  };

  const handleExportChartPng = async () => {
    setIsExportingChart(true);
    try {
      await downloadOrgChartPng(orgChartInput);
      toast.success("Org chart PNG downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chart export failed");
    } finally {
      setIsExportingChart(false);
    }
  };

  const handleExportChartSvg = () => {
    try {
      downloadOrgChartSvg(orgChartInput);
      toast.success("Org chart SVG downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chart export failed");
    }
  };

  const handlePrint = () => {
    try {
      if (viewMode === "org-chart") {
        printOrgChart(orgChartInput);
        return;
      }
      printRosterList({
        projectName,
        viewMode,
        personnel,
        reportingLines,
        peopleById,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Print failed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" icon={<FiDownload className="w-3.5 h-3.5" />} onClick={handleExportCsv}>
        Export CSV
      </Button>
      {viewMode === "org-chart" ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            icon={<FiImage className="w-3.5 h-3.5" />}
            loading={isExportingChart}
            onClick={handleExportChartPng}
          >
            Export PNG
          </Button>
          <Button size="sm" variant="secondary" icon={<FiDownload className="w-3.5 h-3.5" />} onClick={handleExportChartSvg}>
            Export SVG
          </Button>
        </>
      ) : null}
      <Button size="sm" variant="secondary" icon={<FiPrinter className="w-3.5 h-3.5" />} onClick={handlePrint}>
        Print
      </Button>
    </div>
  );
}
