/**
 * CapabilityListTable — manage FAA §145.215 Capability List items.
 * Supports inline add/edit, remove, and bulk CSV import.
 */

import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  useAddCapabilityListItem,
  useUpdateCapabilityListItem,
  useRemoveCapabilityListItem,
  useBulkInsertCapabilityList,
} from "../hooks/useConvexData";
import { parseCapabilityListCsv } from "../services/capabilityListCsvParser";
import type { CapabilityListRow } from "../services/capabilityListCsvParser";

interface ClDoc {
  _id: string;
  clNumber?: string;
  articleDescription: string;
  make?: string;
  model?: string;
  partNumber?: string;
  authorizedFunctions: string[];
  technicalDataRef?: string;
  notes?: string;
}

interface Props {
  entityProfileId: string;
  projectId?: string;
  companyId?: string;
  items: ClDoc[];
}

const PAGE_SIZE = 25;
const emptyRow = {
  clNumber: "",
  articleDescription: "",
  make: "",
  model: "",
  partNumber: "",
  authorizedFunctions: "",
  technicalDataRef: "",
  notes: "",
};

export default function CapabilityListTable({ entityProfileId, projectId, companyId, items }: Props) {
  const addItem = useAddCapabilityListItem();
  const updateItem = useUpdateCapabilityListItem();
  const removeItem = useRemoveCapabilityListItem();
  const bulkInsert = useBulkInsertCapabilityList();

  const [page, setPage] = useState(0);
  const [showAddRow, setShowAddRow] = useState(false);
  const [addForm, setAddForm] = useState(emptyRow);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyRow);
  const [saving, setSaving] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CapabilityListRow[] | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [replaceAll, setReplaceAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function parseFunctions(raw: string): string[] {
    return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  }

  function formatFunctions(fns: string[]): string {
    return fns.join("; ");
  }

  async function handleAdd() {
    if (!addForm.articleDescription.trim()) {
      toast.error("Article description is required");
      return;
    }
    setSaving(true);
    try {
      await addItem({
        entityProfileId: entityProfileId as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
        clNumber: addForm.clNumber.trim() || undefined,
        articleDescription: addForm.articleDescription.trim(),
        make: addForm.make.trim() || undefined,
        model: addForm.model.trim() || undefined,
        partNumber: addForm.partNumber.trim() || undefined,
        authorizedFunctions: parseFunctions(addForm.authorizedFunctions),
        technicalDataRef: addForm.technicalDataRef.trim() || undefined,
        notes: addForm.notes.trim() || undefined,
      });
      setAddForm(emptyRow);
      setShowAddRow(false);
      toast.success("CL item added");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add item");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    try {
      await updateItem({
        itemId: id as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
        clNumber: editForm.clNumber.trim() || undefined,
        articleDescription: editForm.articleDescription.trim(),
        make: editForm.make.trim() || undefined,
        model: editForm.model.trim() || undefined,
        partNumber: editForm.partNumber.trim() || undefined,
        authorizedFunctions: parseFunctions(editForm.authorizedFunctions),
        technicalDataRef: editForm.technicalDataRef.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      });
      setEditingId(null);
      toast.success("Item updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this capability list item?")) return;
    try {
      await removeItem({
        itemId: id as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
      });
      toast.success("Item removed");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove");
    }
  }

  function startEdit(item: ClDoc) {
    setEditingId(item._id);
    setEditForm({
      clNumber: item.clNumber ?? "",
      articleDescription: item.articleDescription,
      make: item.make ?? "",
      model: item.model ?? "",
      partNumber: item.partNumber ?? "",
      authorizedFunctions: formatFunctions(item.authorizedFunctions),
      technicalDataRef: item.technicalDataRef ?? "",
      notes: item.notes ?? "",
    });
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseCapabilityListCsv(text);
      if (result.errors.length > 0 && result.rows.length === 0) {
        setCsvErrors(result.errors);
        setCsvPreview(null);
        toast.error(`CSV parse failed: ${result.errors[0]}`);
      } else {
        setCsvPreview(result.rows);
        setCsvErrors(result.errors);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleCsvImport() {
    if (!csvPreview) return;
    setImporting(true);
    try {
      const result = await bulkInsert({
        entityProfileId: entityProfileId as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
        items: csvPreview.map((r) => ({
          clNumber: r.clNumber,
          articleDescription: r.articleDescription,
          make: r.make,
          model: r.model,
          partNumber: r.partNumber,
          authorizedFunctions: r.authorizedFunctions,
          technicalDataRef: r.technicalDataRef,
          notes: r.notes,
        })),
        replaceAll,
      });
      toast.success(`Imported ${(result as any).inserted} capability list items`);
      setCsvPreview(null);
      setCsvErrors([]);
      setPage(0);
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const inputCls = "bg-white/5 border border-white/15 rounded px-2 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-sky-400/40 w-full";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-white/60">{items.length} item{items.length !== 1 ? "s" : ""}</span>
        <div className="flex-1" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded-lg border border-white/15 text-white/60 text-xs hover:text-white/80 hover:border-white/25"
        >
          Import CSV
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFile} />
        <button
          onClick={() => { setShowAddRow(true); setEditingId(null); }}
          className="px-3 py-1.5 rounded-lg bg-sky/15 border border-sky-400/25 text-sky-300 text-xs hover:bg-sky/25"
        >
          + Add Item
        </button>
      </div>

      {/* CSV Preview */}
      {csvPreview && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-amber-300">
              CSV preview — {csvPreview.length} rows ready to import
            </p>
            <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={replaceAll}
                onChange={(e) => setReplaceAll(e.target.checked)}
                className="accent-amber-400"
              />
              Replace all existing items
            </label>
          </div>
          {csvErrors.length > 0 && (
            <div className="space-y-1">
              {csvErrors.map((e, i) => (
                <p key={i} className="text-xs text-red-400">{e}</p>
              ))}
            </div>
          )}
          <div className="overflow-x-auto max-h-40">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-white/40 border-b border-white/10">
                  <th className="text-left pb-1 pr-2">CL#</th>
                  <th className="text-left pb-1 pr-2">Article</th>
                  <th className="text-left pb-1 pr-2">Make</th>
                  <th className="text-left pb-1 pr-2">Model</th>
                  <th className="text-left pb-1">Functions</th>
                </tr>
              </thead>
              <tbody>
                {csvPreview.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="pr-2 py-0.5 text-white/50">{r.clNumber ?? "—"}</td>
                    <td className="pr-2 py-0.5 text-white/80">{r.articleDescription}</td>
                    <td className="pr-2 py-0.5 text-white/50">{r.make ?? "—"}</td>
                    <td className="pr-2 py-0.5 text-white/50">{r.model ?? "—"}</td>
                    <td className="py-0.5 text-white/50">{r.authorizedFunctions.join(", ") || "—"}</td>
                  </tr>
                ))}
                {csvPreview.length > 10 && (
                  <tr>
                    <td colSpan={5} className="text-white/30 py-1">…and {csvPreview.length - 10} more rows</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCsvImport}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs hover:bg-amber-500/30 disabled:opacity-50"
            >
              {importing ? "Importing…" : `Confirm Import (${csvPreview.length} rows)`}
            </button>
            <button
              onClick={() => { setCsvPreview(null); setCsvErrors([]); }}
              className="px-3 py-1.5 rounded-lg border border-white/15 text-white/50 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/3">
              <th className="text-left text-white/45 font-medium px-3 py-2 w-16">CL#</th>
              <th className="text-left text-white/45 font-medium px-3 py-2">Article</th>
              <th className="text-left text-white/45 font-medium px-3 py-2 hidden sm:table-cell">Make/Model</th>
              <th className="text-left text-white/45 font-medium px-3 py-2 hidden md:table-cell">Functions</th>
              <th className="text-left text-white/45 font-medium px-3 py-2 hidden lg:table-cell">Tech Data</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {showAddRow && (
              <tr className="border-b border-sky-400/20 bg-sky/5">
                <td className="px-2 py-2"><input value={addForm.clNumber} onChange={(e) => setAddForm((f) => ({ ...f, clNumber: e.target.value }))} placeholder="CL#" className={inputCls} /></td>
                <td className="px-2 py-2"><input value={addForm.articleDescription} onChange={(e) => setAddForm((f) => ({ ...f, articleDescription: e.target.value }))} placeholder="Article description*" className={inputCls} /></td>
                <td className="px-2 py-2 hidden sm:table-cell">
                  <div className="flex gap-1">
                    <input value={addForm.make} onChange={(e) => setAddForm((f) => ({ ...f, make: e.target.value }))} placeholder="Make" className={inputCls} />
                    <input value={addForm.model} onChange={(e) => setAddForm((f) => ({ ...f, model: e.target.value }))} placeholder="Model" className={inputCls} />
                  </div>
                </td>
                <td className="px-2 py-2 hidden md:table-cell"><input value={addForm.authorizedFunctions} onChange={(e) => setAddForm((f) => ({ ...f, authorizedFunctions: e.target.value }))} placeholder="Overhaul; Repair; Inspect" className={inputCls} /></td>
                <td className="px-2 py-2 hidden lg:table-cell"><input value={addForm.technicalDataRef} onChange={(e) => setAddForm((f) => ({ ...f, technicalDataRef: e.target.value }))} placeholder="CMM ref" className={inputCls} /></td>
                <td className="px-2 py-2">
                  <div className="flex gap-1">
                    <button onClick={handleAdd} disabled={saving} className="px-2 py-1 rounded bg-sky/20 text-sky-300 border border-sky-400/25 hover:bg-sky/30 disabled:opacity-50">Add</button>
                    <button onClick={() => { setShowAddRow(false); setAddForm(emptyRow); }} className="px-2 py-1 rounded border border-white/10 text-white/40 hover:text-white/60">✕</button>
                  </div>
                </td>
              </tr>
            )}

            {pageItems.length === 0 && !showAddRow && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-white/30">
                  No capability list items. Add items manually or import from CSV.
                </td>
              </tr>
            )}

            {pageItems.map((item) => (
              <tr key={item._id} className="border-b border-white/5 hover:bg-white/2">
                {editingId === item._id ? (
                  <>
                    <td className="px-2 py-2"><input value={editForm.clNumber} onChange={(e) => setEditForm((f) => ({ ...f, clNumber: e.target.value }))} className={inputCls} /></td>
                    <td className="px-2 py-2"><input value={editForm.articleDescription} onChange={(e) => setEditForm((f) => ({ ...f, articleDescription: e.target.value }))} className={inputCls} /></td>
                    <td className="px-2 py-2 hidden sm:table-cell">
                      <div className="flex gap-1">
                        <input value={editForm.make} onChange={(e) => setEditForm((f) => ({ ...f, make: e.target.value }))} placeholder="Make" className={inputCls} />
                        <input value={editForm.model} onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))} placeholder="Model" className={inputCls} />
                      </div>
                    </td>
                    <td className="px-2 py-2 hidden md:table-cell"><input value={editForm.authorizedFunctions} onChange={(e) => setEditForm((f) => ({ ...f, authorizedFunctions: e.target.value }))} className={inputCls} /></td>
                    <td className="px-2 py-2 hidden lg:table-cell"><input value={editForm.technicalDataRef} onChange={(e) => setEditForm((f) => ({ ...f, technicalDataRef: e.target.value }))} className={inputCls} /></td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => handleUpdate(item._id)} disabled={saving} className="px-2 py-1 rounded bg-sky/20 text-sky-300 border border-sky-400/25 disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded border border-white/10 text-white/40">✕</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-white/50 font-mono">{item.clNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-white/85">{item.articleDescription}</td>
                    <td className="px-3 py-2 text-white/50 hidden sm:table-cell">
                      {[item.make, item.model].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-white/50 hidden md:table-cell">
                      {item.authorizedFunctions.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-white/40 hidden lg:table-cell truncate max-w-[140px]">
                      {item.technicalDataRef ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(item)} className="text-white/40 hover:text-white/70 px-1">✎</button>
                        <button onClick={() => handleRemove(item._id)} className="text-red-400/40 hover:text-red-300 px-1">✕</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 rounded border border-white/10 disabled:opacity-30 hover:text-white/70"
          >
            ← Prev
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded border border-white/10 disabled:opacity-30 hover:text-white/70"
          >
            Next →
          </button>
        </div>
      )}

      <p className="text-xs text-white/35">
        CSV columns: <span className="font-mono text-white/45">cl_number, article_description, make, model, part_number, authorized_functions, technical_data_ref, notes</span>
      </p>
    </div>
  );
}
