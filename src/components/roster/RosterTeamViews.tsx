import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { Badge, Button } from "../ui";
import type { OrgChartNode, RosterPersonRow } from "../../utils/rosterOrganization";
import { groupPersonnelByDepartment } from "../../utils/rosterOrganization";
import { RosterDepartmentSelect } from "./RosterDepartmentsPanel";
import { RosterCardColorPicker } from "./RosterCardColorPicker";
import { RosterManagementLevelSelect } from "./RosterCardColorsPanel";
import { RosterOrgChartCanvas, type FunctionalReportingLine } from "./RosterOrgChartCanvas";
import { RosterReportingEditor } from "./RosterReportingEditor";
import { rosterCardAvatarStyle, rosterCardSurfaceStyle } from "../../utils/rosterCardColors";

export type RosterPersonEditState = {
  fullName: string;
  roleTitle: string;
  jobDescription: string;
  department: string;
  managementLevel: string;
  reportsToPersonId: string;
  capabilities: string;
};

type PersonCardProps = {
  person: RosterPersonRow;
  managerName?: string;
  functionalLines?: FunctionalReportingLine[];
  peopleById?: Map<string, RosterPersonRow>;
  compact?: boolean;
  isEditing: boolean;
  editingPerson: RosterPersonEditState;
  departmentOptions: string[];
  managementLevelOptions: string[];
  managerOptions: RosterPersonRow[];
  allPersonnel: RosterPersonRow[];
  cardColor?: string;
  onCardColorChange: (color: string | null) => Promise<void>;
  onEditingChange: (patch: Partial<RosterPersonEditState>) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onAddFunctionalLine: (supervisorPersonId: string, contextLabel: string) => Promise<void>;
  onRemoveFunctionalLine: (lineId: string) => Promise<void>;
};

function PersonCard({
  person,
  managerName,
  functionalLines = [],
  peopleById,
  compact,
  isEditing,
  editingPerson,
  departmentOptions,
  managementLevelOptions,
  managerOptions,
  allPersonnel,
  cardColor,
  onCardColorChange,
  onEditingChange,
  onSave,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onAddFunctionalLine,
  onRemoveFunctionalLine,
}: PersonCardProps) {
  if (isEditing) {
    return (
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-2">
        <input
          value={editingPerson.fullName}
          onChange={(e) => onEditingChange({ fullName: e.target.value })}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
        />
        <input
          value={editingPerson.roleTitle}
          onChange={(e) => onEditingChange({ roleTitle: e.target.value })}
          placeholder="Role title"
          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
        />
        <RosterDepartmentSelect
          value={editingPerson.department}
          onChange={(department) => onEditingChange({ department })}
          options={departmentOptions}
          selectSize="sm"
        />
        <RosterManagementLevelSelect
          value={editingPerson.managementLevel}
          onChange={(managementLevel) => onEditingChange({ managementLevel })}
          options={managementLevelOptions}
          selectSize="sm"
        />
        <RosterCardColorPicker
          compact
          value={person.cardColor}
          onChange={(next) => void onCardColorChange(next)}
        />
        <RosterReportingEditor
          personId={person._id}
          primaryManagerId={editingPerson.reportsToPersonId}
          onPrimaryManagerChange={(managerId) => onEditingChange({ reportsToPersonId: managerId })}
          additionalLines={functionalLines}
          personnel={allPersonnel}
          compact
          onAddAdditional={onAddFunctionalLine}
          onRemoveAdditional={onRemoveFunctionalLine}
        />
        <input
          value={editingPerson.jobDescription}
          onChange={(e) => onEditingChange({ jobDescription: e.target.value })}
          placeholder="Job description"
          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
        />
        <input
          value={editingPerson.capabilities}
          onChange={(e) => onEditingChange({ capabilities: e.target.value })}
          placeholder="Capabilities comma separated"
          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={onSave}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border hover:border-white/20 transition-colors ${
        compact ? "p-3" : "p-4"
      } ${cardColor ? "" : "border-white/10 bg-white/[0.04]"}`}
      style={rosterCardSurfaceStyle(cardColor)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
              cardColor ? "" : "bg-sky-500/20 border border-sky-500/30 text-sky-lighter"
            }`}
            style={rosterCardAvatarStyle(cardColor)}
          >
            {(person.fullName ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className={`text-white font-medium truncate ${compact ? "text-sm" : "text-base"}`}>
              {person.fullName}
            </div>
            <div className="text-sm text-white/60 mt-0.5">{person.roleTitle || "No role title"}</div>
            {person.managementLevel ? (
              <div className="text-xs text-white/45 mt-1">{person.managementLevel}</div>
            ) : null}
            {person.department ? (
              <div className="text-xs text-sky-200/75 mt-1">{person.department}</div>
            ) : null}
            {managerName ? (
              <div className="text-xs text-white/45 mt-1">Primary: {managerName}</div>
            ) : null}
            {functionalLines.length > 0 ? (
              <div className="mt-1.5 space-y-0.5">
                {functionalLines.map((line) => {
                  const supervisor = peopleById?.get(line.supervisorPersonId);
                  return (
                    <div key={line._id} className="text-[11px] text-amber-200/80">
                      Also → {supervisor?.fullName ?? "Lead"} ({line.contextLabel})
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={onStartEdit}
            className="p-1.5 rounded-md text-white/40 hover:text-sky-200 hover:bg-white/5 transition-colors"
            title="Edit person"
          >
            <FiEdit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-md text-white/35 hover:text-red-300 hover:bg-white/5 transition-colors"
            title="Delete person"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {!compact && person.jobDescription ? (
        <p className="text-xs text-white/50 mt-3 line-clamp-2">{person.jobDescription}</p>
      ) : null}
      {!compact && (person.capabilities ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(person.capabilities ?? []).map((capability) => (
            <Badge key={capability} size="sm">
              {capability}
            </Badge>
          ))}
        </div>
      ) : !compact ? (
        <p className="text-xs text-white/35 mt-3 italic">No capabilities listed</p>
      ) : null}
      <div className={`${compact ? "mt-2 pt-2" : "mt-3 pt-3"} border-t border-white/10`}>
        <RosterCardColorPicker
          compact
          value={person.cardColor ?? cardColor}
          onChange={(next) => void onCardColorChange(next)}
        />
      </div>
    </div>
  );
}

type SharedViewProps = {
  personnel: RosterPersonRow[];
  editingPersonId: string | null;
  editingPerson: RosterPersonEditState;
  departmentOptions: string[];
  managementLevelOptions: string[];
  peopleById: Map<string, RosterPersonRow>;
  getPersonCardColor: (person: RosterPersonRow) => string | undefined;
  onCardColorChange: (personId: string, color: string | null) => Promise<void>;
  functionalLinesBySubordinate?: Map<string, FunctionalReportingLine[]>;
  onEditingChange: (patch: Partial<RosterPersonEditState>) => void;
  onStartPersonEdit: (person: RosterPersonRow) => void;
  onSavePersonEdit: () => void;
  onCancelPersonEdit: () => void;
  onDeletePerson: (person: RosterPersonRow) => void;
  onAddFunctionalLine: (subordinatePersonId: string, supervisorPersonId: string, contextLabel: string) => Promise<void>;
  onRemoveFunctionalLine: (lineId: string) => Promise<void>;
};

function renderPersonCard(props: SharedViewProps, person: RosterPersonRow, options?: { compact?: boolean }) {
  const manager = person.reportsToPersonId ? props.peopleById.get(person.reportsToPersonId) : undefined;
  const functionalLines = props.functionalLinesBySubordinate?.get(person._id) ?? [];
  return (
    <PersonCard
      key={person._id}
      person={person}
      managerName={manager?.fullName}
      functionalLines={functionalLines}
      peopleById={props.peopleById}
      compact={options?.compact}
      isEditing={props.editingPersonId === person._id}
      editingPerson={props.editingPerson}
      departmentOptions={props.departmentOptions}
      managementLevelOptions={props.managementLevelOptions}
      managerOptions={props.personnel.filter((p) => p._id !== person._id)}
      allPersonnel={props.personnel}
      cardColor={props.getPersonCardColor(person)}
      onCardColorChange={(color) => props.onCardColorChange(person._id, color)}
      onEditingChange={props.onEditingChange}
      onSave={props.onSavePersonEdit}
      onCancelEdit={props.onCancelPersonEdit}
      onStartEdit={() => props.onStartPersonEdit(person)}
      onDelete={() => props.onDeletePerson(person)}
      onAddFunctionalLine={(supervisorId, contextLabel) =>
        props.onAddFunctionalLine(person._id, supervisorId, contextLabel)
      }
      onRemoveFunctionalLine={props.onRemoveFunctionalLine}
    />
  );
}

export function RosterGridView(props: SharedViewProps) {
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {props.personnel.map((person) => (
        <li key={person._id}>{renderPersonCard(props, person)}</li>
      ))}
    </ul>
  );
}

export function RosterDepartmentView(props: SharedViewProps) {
  const groups = groupPersonnelByDepartment(props.personnel);
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.department}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold text-white">{group.department}</h3>
            <span className="text-xs text-white/45">
              {group.people.length} member{group.people.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.people.map((person) => (
              <li key={person._id}>{renderPersonCard(props, person)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function RosterOrgChartView(
  props: SharedViewProps & {
    roots: OrgChartNode[];
    reportingLines: FunctionalReportingLine[];
    savedLayouts: { personId: string; x: number; y: number }[];
    onReparent: (personId: string, newManagerId: string | null) => Promise<void>;
    onSaveLayout: (personId: string, x: number, y: number) => Promise<void>;
    onResetLayout: () => Promise<void>;
    onAddFunctionalLine: (subordinatePersonId: string, supervisorPersonId: string, contextLabel: string) => Promise<void>;
    onRemoveFunctionalLine: (lineId: string) => Promise<void>;
    getPersonCardColor: (person: RosterPersonRow) => string | undefined;
    onCardColorChange: (personId: string, color: string | null) => Promise<void>;
  },
) {
  const { roots, reportingLines, savedLayouts, onReparent, onSaveLayout, onResetLayout, onAddFunctionalLine, onRemoveFunctionalLine, personnel, getPersonCardColor, onCardColorChange } = props;

  return (
    <RosterOrgChartCanvas
      roots={roots}
      personnel={personnel}
      reportingLines={reportingLines}
      savedLayouts={savedLayouts}
      getPersonCardColor={getPersonCardColor}
      onCardColorChange={onCardColorChange}
      onReparent={onReparent}
      onSaveLayout={onSaveLayout}
      onResetLayout={onResetLayout}
      onAddFunctionalLine={onAddFunctionalLine}
      onRemoveFunctionalLine={onRemoveFunctionalLine}
    />
  );
}

export function RosterViewModeToggle(props: {
  viewMode: "grid" | "department" | "org-chart";
  onChange: (mode: "grid" | "department" | "org-chart") => void;
}) {
  const tabs: { id: "grid" | "department" | "org-chart"; label: string }[] = [
    { id: "grid", label: "All" },
    { id: "department", label: "By department" },
    { id: "org-chart", label: "Org chart" },
  ];

  return (
    <div className="flex gap-1 rounded-lg p-1 bg-white/5 border border-white/10 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => props.onChange(tab.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            props.viewMode === tab.id
              ? "bg-sky-500/20 text-sky-lighter border border-sky-500/30"
              : "text-white/55 hover:text-white hover:bg-white/5"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

