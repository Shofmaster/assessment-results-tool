import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FAA_AUTHORIZED_FUNCTIONS } from "../../../config/regulatoryTaxonomy";
import {
  useAddCapabilityItem,
  useCapabilityListByCompany,
  useRemoveCapabilityItem,
} from "../../../hooks/useConvexData";
import { isFaaAuthority } from "../authorityUtils";

const inputCls =
  "bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/35 w-full";

type Props = { companyId: string };

export default function UsCapabilityListTable({ companyId }: Props) {
  const caps = (useCapabilityListByCompany(companyId) as any[]) ?? [];
  const faaCaps = useMemo(() => caps.filter((c) => isFaaAuthority(c.authority)), [caps]);
  const add = useAddCapabilityItem();
  const remove = useRemoveCapabilityItem();
  const [draft, setDraft] = useState({
    articleDescription: "",
    clNumber: "",
    make: "",
    model: "",
    partNumber: "",
    functions: [] as string[],
  });

  function toggleFn(fn: string) {
    setDraft((d) => ({
      ...d,
      functions: d.functions.includes(fn) ? d.functions.filter((x) => x !== fn) : [...d.functions, fn],
    }));
  }

  async function handleAdd() {
    if (!draft.articleDescription.trim()) {
      toast.error("Article description is required");
      return;
    }
    try {
      await add({
        companyId: companyId as any,
        authority: "faa",
        articleDescription: draft.articleDescription.trim(),
        clNumber: draft.clNumber.trim() || undefined,
        make: draft.make.trim() || undefined,
        model: draft.model.trim() || undefined,
        partNumber: draft.partNumber.trim() || undefined,
        authorizedFunctions: draft.functions.length ? draft.functions : ["Repair"],
      } as any);
      setDraft({
        articleDescription: "",
        clNumber: "",
        make: "",
        model: "",
        partNumber: "",
        functions: [],
      });
      toast.success("Capability added");
    } catch (e: any) {
      toast.error(e?.message ?? "Add failed");
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-white">Capability list — §145.215</h4>
        <p className="text-[10px] text-white/50 mt-0.5">Articles, CL #, and authorized functions (US / FAA).</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 border border-dashed border-white/15 rounded-lg p-3">
        <input
          className={inputCls + " sm:col-span-2"}
          placeholder="Article description *"
          value={draft.articleDescription}
          onChange={(e) => setDraft((d) => ({ ...d, articleDescription: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="CL number"
          value={draft.clNumber}
          onChange={(e) => setDraft((d) => ({ ...d, clNumber: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Make"
          value={draft.make}
          onChange={(e) => setDraft((d) => ({ ...d, make: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Model"
          value={draft.model}
          onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Part number"
          value={draft.partNumber}
          onChange={(e) => setDraft((d) => ({ ...d, partNumber: e.target.value }))}
        />
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          {FAA_AUTHORIZED_FUNCTIONS.map((fn) => (
            <label key={fn} className="flex items-center gap-1 text-[10px] text-white/70 cursor-pointer">
              <input type="checkbox" checked={draft.functions.includes(fn)} onChange={() => toggleFn(fn)} />
              {fn}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void handleAdd()}
          className="sm:col-span-2 px-3 py-2 rounded-lg bg-sky/20 border border-sky-light/30 text-xs text-sky-100"
        >
          Add capability
        </button>
      </div>
      <div className="max-h-52 overflow-auto space-y-1">
        {faaCaps.map((row) => (
          <div key={row._id} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-[11px]">
            <span className="text-white/80 truncate">{row.articleDescription}</span>
            <button
              type="button"
              className="text-red-300 shrink-0 text-[10px]"
              onClick={() => void remove({ companyId: companyId as any, capabilityId: row._id } as any)}
            >
              Remove
            </button>
          </div>
        ))}
        {!faaCaps.length ? <p className="text-[10px] text-white/35">No capability rows yet.</p> : null}
      </div>
    </div>
  );
}
