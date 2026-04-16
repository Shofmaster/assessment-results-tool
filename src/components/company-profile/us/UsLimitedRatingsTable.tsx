import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FAA_AUTHORIZED_FUNCTIONS, FAA_LIMITED_RATING_KINDS } from "../../../config/regulatoryTaxonomy";
import {
  useAddLimitedRating,
  useLimitedRatingsByCompany,
  useRemoveLimitedRating,
} from "../../../hooks/useConvexData";
import { isEasaAuthority, isFaaAuthority } from "../authorityUtils";

const inputCls =
  "bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/35 w-full";

type Props = { companyId: string; authority?: "faa" | "easa" };

export default function UsLimitedRatingsTable({ companyId, authority = "faa" }: Props) {
  const list = (useLimitedRatingsByCompany(companyId) as any[]) ?? [];
  const filtered = useMemo(() => {
    if (authority === "easa") return list.filter((r) => isEasaAuthority(r.authority));
    return list.filter((r) => isFaaAuthority(r.authority));
  }, [list, authority]);
  const add = useAddLimitedRating();
  const remove = useRemoveLimitedRating();
  const [draft, setDraft] = useState({
    ratingKind: "limited_airframe",
    articleDescription: "",
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
        authority,
        ratingKind: draft.ratingKind,
        articleDescription: draft.articleDescription.trim(),
        make: draft.make.trim() || undefined,
        model: draft.model.trim() || undefined,
        partNumber: draft.partNumber.trim() || undefined,
        authorizedFunctions: draft.functions,
      } as any);
      setDraft({
        ratingKind: "limited_airframe",
        articleDescription: "",
        make: "",
        model: "",
        partNumber: "",
        functions: [],
      });
      toast.success("Limited rating added");
    } catch (e: any) {
      toast.error(e?.message ?? "Add failed");
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-white">
          {authority === "easa" ? "EASA — article / line limitations" : "Limited ratings — §145.61"}
        </h4>
        <p className="text-[10px] text-white/50 mt-0.5">
          {authority === "easa"
            ? "Narrow scope items (MOE) — mirror Form 3 / capability list."
            : "Make/model/article scope; pair with capability list entries."}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 border border-dashed border-white/15 rounded-lg p-3">
        <select
          className={inputCls + " sm:col-span-1"}
          value={draft.ratingKind}
          onChange={(e) => setDraft((d) => ({ ...d, ratingKind: e.target.value }))}
        >
          {FAA_LIMITED_RATING_KINDS.map((k) => (
            <option key={k.id} value={k.id} className="bg-slate-900">
              {k.label}
            </option>
          ))}
        </select>
        <input
          className={inputCls + " sm:col-span-2"}
          placeholder="Article description *"
          value={draft.articleDescription}
          onChange={(e) => setDraft((d) => ({ ...d, articleDescription: e.target.value }))}
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
        <div className="sm:col-span-3 flex flex-wrap gap-2">
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
          className="sm:col-span-3 px-3 py-2 rounded-lg bg-sky/20 border border-sky-light/30 text-xs text-sky-100"
        >
          Add limited rating
        </button>
      </div>
      <div className="max-h-52 overflow-auto space-y-1">
        {filtered.map((r) => (
          <div
            key={r._id}
            className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1.5 text-[11px]"
          >
            <div className="min-w-0">
              <span className="text-white/85 font-medium">{r.articleDescription}</span>
              <span className="text-white/45 ml-2">{r.ratingKind}</span>
              {r.make || r.model ? (
                <span className="text-white/40 block truncate">
                  {r.make} {r.model}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="text-red-300 shrink-0 text-[10px]"
              onClick={() => void remove({ companyId: companyId as any, ratingId: r._id } as any)}
            >
              Remove
            </button>
          </div>
        ))}
        {!filtered.length ? <p className="text-[10px] text-white/35">No rows yet.</p> : null}
      </div>
    </div>
  );
}
