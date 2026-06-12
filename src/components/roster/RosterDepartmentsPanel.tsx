import { useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { toast } from "sonner";
import { SUGGESTED_DEPARTMENTS } from "../../utils/rosterOrganization";
import { Badge, Button } from "../ui";

type DepartmentRow = {
  _id: string;
  name: string;
};

type Props = {
  departments: DepartmentRow[];
  departmentUsage: Map<string, number>;
  onAdd: (name: string) => Promise<void>;
  onRemove: (departmentId: string) => Promise<void>;
};

export function RosterDepartmentsPanel({ departments, departmentUsage, onAdd, onRemove }: Props) {
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const existingNames = new Set(departments.map((d) => d.name.trim().toLowerCase()));
  const suggestedToAdd = SUGGESTED_DEPARTMENTS.filter((name) => !existingNames.has(name.toLowerCase()));

  const handleAdd = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      setIsAdding(true);
      await onAdd(trimmed);
      setNewName("");
      toast.success(`Department "${trimmed}" added`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add department");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (department: DepartmentRow) => {
    const count = departmentUsage.get(department.name.trim().toLowerCase()) ?? 0;
    if (count > 0) {
      toast.error(`Cannot delete — ${count} team member${count !== 1 ? "s" : ""} still assigned`);
      return;
    }
    const ok = window.confirm(`Delete department "${department.name}"?`);
    if (!ok) return;
    try {
      setRemovingId(department._id);
      await onRemove(department._id);
      toast.success("Department removed");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to remove department");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Departments</h2>
        <p className="text-sm text-white/55 mt-0.5 max-w-2xl">
          Define departments for your organization. Team members pick from this list when assigned to a department.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New department name"
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd(newName);
          }}
        />
        <Button
          size="sm"
          icon={<FiPlus className="w-3.5 h-3.5" />}
          onClick={() => void handleAdd(newName)}
          disabled={!newName.trim() || isAdding}
          loading={isAdding}
        >
          Add department
        </Button>
      </div>

      {suggestedToAdd.length > 0 ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-white/45 mb-2">Quick add (common aviation)</p>
          <div className="flex flex-wrap gap-2">
            {suggestedToAdd.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => void handleAdd(name)}
                className="px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-xs text-white/70 hover:bg-sky-500/15 hover:border-sky-500/30 hover:text-sky-lighter transition-colors"
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {departments.length === 0 ? (
        <p className="text-sm text-white/45 rounded-lg border border-dashed border-white/15 px-4 py-6 text-center">
          No custom departments yet. Add one above or use a quick-add suggestion.
        </p>
      ) : (
        <ul className="space-y-2">
          {departments.map((department) => {
            const count = departmentUsage.get(department.name.trim().toLowerCase()) ?? 0;
            return (
              <li
                key={department._id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-sm text-white font-medium truncate">{department.name}</span>
                  {count > 0 ? (
                    <Badge size="sm" className="bg-sky-500/15 text-sky-lighter border-sky-500/30">
                      {count} member{count !== 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <span className="text-xs text-white/35">unused</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(department)}
                  disabled={removingId === department._id}
                  className="p-1.5 rounded-md text-white/35 hover:text-red-300 hover:bg-white/5 transition-colors disabled:opacity-40"
                  title="Delete department"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RosterDepartmentSelect(props: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  selectSize?: "sm" | "md";
  label?: string;
  allowEmpty?: boolean;
}) {
  const { value, onChange, options, selectSize = "sm", label = "Department", allowEmpty = true } = props;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`w-full rounded-lg bg-white/5 border border-white/10 text-white ${
        selectSize === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
      }`}
    >
      {allowEmpty ? <option value="">No department</option> : null}
      {options.map((department) => (
        <option key={department} value={department}>
          {department}
        </option>
      ))}
    </select>
  );
}
