/**
 * LimitedRatingsPanel — manage FAA §145.61 limited ratings.
 * Each limited rating is tied to a specific make/model and authorized functions.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useAddLimitedRating, useUpdateLimitedRating, useRemoveLimitedRating } from "../hooks/useConvexData";

type RatingType = "airframe" | "powerplant" | "propeller" | "radio" | "instrument" | "accessory" | "limited";

const RATING_TYPES: RatingType[] = ["airframe", "powerplant", "propeller", "radio", "instrument", "accessory", "limited"];

const FUNCTION_OPTIONS = ["Overhaul", "Repair", "Inspect", "Alteration", "Approved Return to Service", "Test & Inspection"];

interface LimitedRatingDoc {
  _id: string;
  articleDescription: string;
  make?: string;
  model?: string;
  ratingType: RatingType;
  authorizedFunctions: string[];
}

interface Props {
  entityProfileId: string;
  projectId?: string;
  companyId?: string;
  ratings: LimitedRatingDoc[];
}

const emptyForm = {
  articleDescription: "",
  make: "",
  model: "",
  ratingType: "limited" as RatingType,
  authorizedFunctions: [] as string[],
};

export default function LimitedRatingsPanel({ entityProfileId, projectId, companyId, ratings }: Props) {
  const addRating = useAddLimitedRating();
  const updateRating = useUpdateLimitedRating();
  const removeRating = useRemoveLimitedRating();

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function toggleFunction(list: string[], fn: string): string[] {
    return list.includes(fn) ? list.filter((f) => f !== fn) : [...list, fn];
  }

  async function handleAdd() {
    if (!form.articleDescription.trim()) {
      toast.error("Article description is required");
      return;
    }
    setSaving(true);
    try {
      await addRating({
        entityProfileId: entityProfileId as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
        articleDescription: form.articleDescription.trim(),
        make: form.make.trim() || undefined,
        model: form.model.trim() || undefined,
        ratingType: form.ratingType,
        authorizedFunctions: form.authorizedFunctions,
      });
      setForm(emptyForm);
      setShowAddForm(false);
      toast.success("Limited rating added");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add limited rating");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    try {
      await updateRating({
        ratingId: id as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
        articleDescription: editForm.articleDescription.trim(),
        make: editForm.make.trim() || undefined,
        model: editForm.model.trim() || undefined,
        ratingType: editForm.ratingType,
        authorizedFunctions: editForm.authorizedFunctions,
      });
      setEditingId(null);
      toast.success("Rating updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update rating");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this limited rating?")) return;
    try {
      await removeRating({
        ratingId: id as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
      });
      toast.success("Rating removed");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove");
    }
  }

  function startEdit(r: LimitedRatingDoc) {
    setEditingId(r._id);
    setEditForm({
      articleDescription: r.articleDescription,
      make: r.make ?? "",
      model: r.model ?? "",
      ratingType: r.ratingType,
      authorizedFunctions: [...r.authorizedFunctions],
    });
  }

  return (
    <div className="space-y-3">
      {ratings.length === 0 && !showAddForm && (
        <div className="text-center py-6 text-white/35 text-sm border border-dashed border-white/15 rounded-lg">
          No limited ratings. Click "+ Add Limited Rating" to add make/model-specific ratings.
        </div>
      )}

      {ratings.map((r) => (
        <div key={r._id} className="rounded-lg border border-white/10 bg-white/3 p-3">
          {editingId === r._id ? (
            <RatingForm
              form={editForm}
              setForm={setEditForm}
              saving={saving}
              onSave={() => handleUpdate(r._id)}
              onCancel={() => setEditingId(null)}
              saveLabel="Save changes"
            />
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium text-sm">{r.articleDescription}</span>
                  {r.make && (
                    <span className="text-xs text-white/50">{r.make}{r.model ? ` / ${r.model}` : ""}</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-sky/15 text-sky-300 border border-sky-400/20 capitalize">
                    {r.ratingType}
                  </span>
                </div>
                {r.authorizedFunctions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.authorizedFunctions.map((fn) => (
                      <span key={fn} className="text-xs px-1.5 py-0.5 rounded bg-white/8 text-white/60 border border-white/10">
                        {fn}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => startEdit(r)}
                  className="text-xs px-2 py-1 rounded bg-white/5 text-white/50 hover:text-white/80 border border-white/10"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleRemove(r._id)}
                  className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400/70 hover:text-red-300 border border-red-500/15"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showAddForm && (
        <div className="rounded-lg border border-sky-400/20 bg-sky/5 p-3">
          <p className="text-sm font-medium text-white mb-3">Add Limited Rating</p>
          <RatingForm
            form={form}
            setForm={setForm}
            saving={saving}
            onSave={handleAdd}
            onCancel={() => { setShowAddForm(false); setForm(emptyForm); }}
            saveLabel="Add rating"
          />
        </div>
      )}

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2 rounded-lg border border-dashed border-sky-400/25 text-sky-300/70 text-sm hover:border-sky-400/50 hover:text-sky-300 transition-colors"
        >
          + Add Limited Rating
        </button>
      )}

      <p className="text-xs text-white/35">
        Limited ratings (§145.61) are tied to specific articles. Each requires a Capability List entry (§145.215).
      </p>
    </div>
  );
}

function RatingForm({
  form,
  setForm,
  saving,
  onSave,
  onCancel,
  saveLabel,
}: {
  form: typeof emptyForm;
  setForm: (fn: (prev: typeof emptyForm) => typeof emptyForm) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={form.articleDescription}
          onChange={(e) => setForm((f) => ({ ...f, articleDescription: e.target.value }))}
          placeholder="Article description (required)"
          className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sky-400/40 col-span-full sm:col-span-2"
        />
        <input
          value={form.make}
          onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))}
          placeholder="Make / manufacturer"
          className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sky-400/40"
        />
        <input
          value={form.model}
          onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          placeholder="Model / series"
          className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sky-400/40"
        />
      </div>

      <div>
        <label className="block text-xs text-white/45 mb-1">Rating type</label>
        <select
          value={form.ratingType}
          onChange={(e) => setForm((f) => ({ ...f, ratingType: e.target.value as RatingType }))}
          className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-400/40 w-full sm:w-48"
        >
          {RATING_TYPES.map((rt) => (
            <option key={rt} value={rt} className="bg-slate-800 capitalize">
              {rt.charAt(0).toUpperCase() + rt.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-white/45 mb-1.5">Authorized maintenance functions</label>
        <div className="flex flex-wrap gap-2">
          {FUNCTION_OPTIONS.map((fn) => (
            <label key={fn} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.authorizedFunctions.includes(fn)}
                onChange={() =>
                  setForm((f) => ({
                    ...f,
                    authorizedFunctions: f.authorizedFunctions.includes(fn)
                      ? f.authorizedFunctions.filter((x) => x !== fn)
                      : [...f.authorizedFunctions, fn],
                  }))
                }
                className="w-3.5 h-3.5 rounded border border-white/30 bg-white/10 accent-sky-400"
              />
              <span className="text-xs text-white/70">{fn}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-white/15 text-white/60 text-sm hover:text-white/80"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-sky/20 border border-sky-400/30 text-sky-300 text-sm hover:bg-sky/30 disabled:opacity-50"
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
