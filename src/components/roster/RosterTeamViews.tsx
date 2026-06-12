import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { Badge, Button } from "../ui";
import type { OrgChartNode, RosterPersonRow } from "../../utils/rosterOrganization";
import { groupPersonnelByDepartment } from "../../utils/rosterOrganization";

export type RosterPersonEditState = {
  fullName: string;
  roleTitle: string;
  jobDescription: string;
  department: string;
  reportsToPersonId: string;
  capabilities: string;
};

type PersonCardProps = {
  person: RosterPersonRow;
  managerName?: string;
  compact?: boolean;
  isEditing: boolean;
  editingPerson: RosterPersonEditState;
  departmentOptions: string[];
  managerOptions: RosterPersonRow[];
  onEditingChange: (patch: Partial<RosterPersonEditState>) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
};

function PersonCard({
  person,
  managerName,
  compact,
  isEditing,
  editingPerson,
  departmentOptions,
  managerOptions,
  onEditingChange,
  onSave,
  onCancelEdit,
  onStartEdit,
  onDelete,
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
        <input
          value={editingPerson.department}
          onChange={(e) => onEditingChange({ department: e.target.value })}
          placeholder="Department"
          list="roster-department-options"
          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
        />
        <select
          value={editingPerson.reportsToPersonId}
          onChange={(e) => onEditingChange({ reportsToPersonId: e.target.value })}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
        >
          <option value="">No manager (top of org chart)</option>
          {managerOptions.map((candidate) => (
            <option key={candidate._id} value={candidate._id}>
              {candidate.fullName}
              {candidate.roleTitle ? ` · ${candidate.roleTitle}` : ""}
            </option>
          ))}
        </select>
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
      className={`rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 transition-colors ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sm font-semibold text-sky-lighter">
            {(person.fullName ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className={`text-white font-medium truncate ${compact ? "text-sm" : "text-base"}`}>
              {person.fullName}
            </div>
            <div className="text-sm text-white/60 mt-0.5">{person.roleTitle || "No role title"}</div>
            {person.department ? (
              <div className="text-xs text-sky-200/75 mt-1">{person.department}</div>
            ) : null}
            {managerName ? (
              <div className="text-xs text-white/45 mt-1">Reports to {managerName}</div>
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
    </div>
  );
}

type SharedViewProps = {
  personnel: RosterPersonRow[];
  editingPersonId: string | null;
  editingPerson: RosterPersonEditState;
  departmentOptions: string[];
  peopleById: Map<string, RosterPersonRow>;
  onEditingChange: (patch: Partial<RosterPersonEditState>) => void;
  onStartPersonEdit: (person: RosterPersonRow) => void;
  onSavePersonEdit: () => void;
  onCancelPersonEdit: () => void;
  onDeletePerson: (person: RosterPersonRow) => void;
};

function renderPersonCard(props: SharedViewProps, person: RosterPersonRow, options?: { compact?: boolean }) {
  const manager = person.reportsToPersonId ? props.peopleById.get(person.reportsToPersonId) : undefined;
  return (
    <PersonCard
      key={person._id}
      person={person}
      managerName={manager?.fullName}
      compact={options?.compact}
      isEditing={props.editingPersonId === person._id}
      editingPerson={props.editingPerson}
      departmentOptions={props.departmentOptions}
      managerOptions={props.personnel.filter((p) => p._id !== person._id)}
      onEditingChange={props.onEditingChange}
      onSave={props.onSavePersonEdit}
      onCancelEdit={props.onCancelPersonEdit}
      onStartEdit={() => props.onStartPersonEdit(person)}
      onDelete={() => props.onDeletePerson(person)}
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

function OrgChartBranch({
  node,
  depth,
  ...props
}: SharedViewProps & { node: OrgChartNode; depth: number }) {
  return (
    <li className={depth > 0 ? "mt-2" : undefined}>
      {renderPersonCard(props, node.person, { compact: depth > 0 })}
      {node.children.length > 0 ? (
        <ul className={`mt-2 space-y-2 border-l border-white/15 ${depth === 0 ? "ml-5 pl-4" : "ml-4 pl-3"}`}>
          {node.children.map((child) => (
            <OrgChartBranch key={child.person._id} node={child} depth={depth + 1} {...props} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function RosterOrgChartView(
  props: SharedViewProps & { roots: OrgChartNode[]; unlinkedCount: number },
) {
  const { roots, unlinkedCount, ...viewProps } = props;

  if (roots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-10 px-6 text-center text-sm text-white/55">
        Assign a manager to each person (or leave top leaders with no manager) to build your org chart.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">
        {roots.length} top-level leader{roots.length !== 1 ? "s" : ""}
        {unlinkedCount > 0 ? ` · ${unlinkedCount} without a department` : ""}
      </p>
      <ul className="space-y-4">
        {roots.map((node) => (
          <OrgChartBranch key={node.person._id} node={node} depth={0} {...viewProps} />
        ))}
      </ul>
    </div>
  );
}

export function RosterDepartmentDatalist({ options }: { options: string[] }) {
  return (
    <datalist id="roster-department-options">
      {options.map((department) => (
        <option key={department} value={department} />
      ))}
    </datalist>
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

