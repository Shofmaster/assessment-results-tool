import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EASA_AUTHORIZED_FUNCTIONS } from "../../../config/regulatoryTaxonomy";
import {
  useAddCapabilityItem,
  useCapabilityListByCompany,
  useRemoveCapabilityItem,
} from "../../../hooks/useConvexData";
import { isEasaAuthority } from "../authorityUtils";

const inputCls =
  "bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/35 w-full";

type Props = { companyId: string };

export default function EasaCapabilityList({ companyId }: Props) {
  const caps = (useCapabilityListByCompany(companyId) as any[]) ?? [];
  const easaCaps = useMemo(() => caps.filter((c) => isEasaAuthority(c.authority)), [caps]);
  const add = useAddCapabilityItem();
  const remove = useRemoveCapabilityItem();
  const [draft, setDraft] = useState({
    articleDescription: "",
    clNumber: "",
    make: "",
    model: "",
    partNumber: "",
    technicalDataRef: "",
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
        authority: "easa",
        articleDescription: draft.articleDescription.trim(),
        clNumber: draft.clNumber.trim() || undefined,
        make: draft.make.trim() || undefined,
        model: draft.model.trim() || undefined,
        partNumber: draft.partNumber.trim() || undefined,
        technicalDataRef: draft.technicalDataRef.trim() || undefined,
        authorizedFunctions: draft.functions.length ? draft.functions : ["Maintenance"],
      } as any);
      setDraft({
        articleDescription: "",
        clNumber: "",
        make: "",
        model: "",
        partNumber: "",
        technicalDataRef: "",
        functions: [],
      });
      toast.success("EASA capability row added");
    } catch (e: any) {
      toast.error(e?.message ?? "Add failed");
    }
  }

  return (
    <div className="rounded-lg border border-amber-400/15 bg-amber-500/5 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-amber-100">Capability list (MOE)</h4>
        <p className="text-[10px] text-amber-100/60 mt-0.5">Part-145 capability listing with MOE / data refs.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 border border-dashed border-amber-400/20 rounded-lg p-3">
        <input
          className={inputCls + " sm:col-span-2"}
          placeholder="Article / work scope description *"
          value={draft.articleDescription}
          onChange={(e) => setDraft((d) => ({ ...d, articleDescription: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Internal ref / line no."
          value={draft.clNumber}
          onChange={(e) => setDraft((d) => ({ ...d, clNumber: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Technical data ref (IPC, CMM, …)"
          value={draft.technicalDataRef}
          onChange={(e) => setDraft((d) => ({ ...d, technicalDataRef: e.target.value }))}
        />
        <input className={inputCls} placeholder="Make" value={draft.make} onChange={(e) => setDraft((d) => ({ ...d, make: e.target.value }))} />
        <input className={inputCls} placeholder="Model" value={draft.model} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))} />
        <input
          className={inputCls}
          placeholder="Part number"
          value={draft.partNumber}
          onChange={(e) => setDraft((d) => ({ ...d, partNumber: e.target.value }))}
        />
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          {EASA_AUTHORIZED_FUNCTIONS.map((fn) => (
            <label key={fn} className="flex items-center gap-1 text-[10px] text-white/70 cursor-pointer">
              <input type="checkbox" checked={draft.functions.includes(fn)} onChange={() => toggleFn(fn)} />
              {fn}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void handleAdd()}
          className="sm:col-span-2 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/30 text-xs text-amber-100"
        >
          Add EASA capability
        </button>
      </div>
      <div className="max-h-52 overflow-auto space-y-1">
        {easaCaps.map((row) => (
          <div key={row._id} className="flex items-center justify-between gap-2 rounded bg-black/25 px-2 py-1 text-[11px]">
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
        {!easaCaps.length ? <p className="text-[10px] text-white/35">No EASA capability rows yet.</p> : null}
      </div>
    </div>
  );
}
