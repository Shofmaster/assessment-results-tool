/**
 * @deprecated Superseded by `CompanyProfilePanel` (company administration / regulatory profile).
 * Kept temporarily for any deep imports; safe to remove after downstream references are cleared.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  useAddCapabilityItem,
  useBulkUpsertCapabilityItems,
  useBulkUpsertClassRatings,
  useCapabilityListByCompany,
  useClassRatingsByCompany,
  useRemoveCapabilityItem,
  useRemoveClassRating,
  useUpsertClassRating,
} from "../hooks/useConvexData";
import { parseCapabilitiesCsv, parseRatingsCsv } from "../services/repairStationImportParser";

type Props = {
  companyId: string;
};

export default function RepairStationRatingsCapabilitiesPanel({ companyId }: Props) {
  const ratings = (useClassRatingsByCompany(companyId) as any[]) ?? [];
  const capabilities = (useCapabilityListByCompany(companyId) as any[]) ?? [];
  const upsertRating = useUpsertClassRating();
  const removeRating = useRemoveClassRating();
  const bulkRatings = useBulkUpsertClassRatings();
  const addCapability = useAddCapabilityItem();
  const removeCapability = useRemoveCapabilityItem();
  const bulkCapabilities = useBulkUpsertCapabilityItems();

  const [ratingCategory, setRatingCategory] = useState("airframe");
  const [ratingClass, setRatingClass] = useState(1);
  const [ratingLimitations, setRatingLimitations] = useState("");

  const [capabilityDraft, setCapabilityDraft] = useState({
    articleDescription: "",
    clNumber: "",
    make: "",
    model: "",
    partNumber: "",
    authorizedFunctions: "",
  });

  const ratingCsvRef = useRef<HTMLInputElement>(null);
  const capabilityCsvRef = useRef<HTMLInputElement>(null);

  const handleRatingCsv = async (file: File) => {
    const text = await file.text();
    const parsed = parseRatingsCsv(text);
    if (!parsed.rows.length) {
      toast.error(parsed.errors[0] ?? "No valid ratings found");
      return;
    }
    await bulkRatings({
      companyId: companyId as any,
      items: parsed.rows,
      replaceAll: false,
    });
    toast.success(`Imported ${parsed.rows.length} class rating rows`);
    if (parsed.errors.length) toast.message(`${parsed.errors.length} row(s) skipped`);
  };

  const handleCapabilityCsv = async (file: File) => {
    const text = await file.text();
    const parsed = parseCapabilitiesCsv(text);
    if (!parsed.rows.length) {
      toast.error(parsed.errors[0] ?? "No valid capability rows found");
      return;
    }
    await bulkCapabilities({
      companyId: companyId as any,
      items: parsed.rows,
      replaceAll: false,
    });
    toast.success(`Imported ${parsed.rows.length} capability rows`);
    if (parsed.errors.length) toast.message(`${parsed.errors.length} row(s) skipped`);
  };

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Repair station ratings and capabilities</h3>
          <p className="text-xs text-white/55 mt-1">
            These structured records are used by DCT applicability when structured mode is enabled.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Class ratings</p>
            <button
              type="button"
              onClick={() => ratingCsvRef.current?.click()}
              className="px-2 py-1 rounded border border-white/20 text-xs text-white/70"
            >
              Upload CSV
            </button>
            <input
              ref={ratingCsvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await handleRatingCsv(file);
                } catch (error: any) {
                  toast.error(error?.message ?? "Rating import failed");
                } finally {
                  e.target.value = "";
                }
              }}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={ratingCategory}
              onChange={(e) => setRatingCategory(e.target.value)}
              className="bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white"
            >
              {["airframe", "powerplant", "propeller", "radio", "instrument", "accessory"].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={4}
              value={ratingClass}
              onChange={(e) => setRatingClass(Number(e.target.value || 1))}
              className="bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await upsertRating({
                    companyId: companyId as any,
                    category: ratingCategory,
                    classNumber: ratingClass,
                    limitations: ratingLimitations.trim() || undefined,
                  });
                  setRatingLimitations("");
                } catch (error: any) {
                  toast.error(error?.message ?? "Failed to save class rating");
                }
              }}
              className="px-2 py-2 rounded-lg bg-sky/20 border border-sky-light/30 text-xs text-sky-100"
            >
              Add / update
            </button>
          </div>
          <input
            value={ratingLimitations}
            onChange={(e) => setRatingLimitations(e.target.value)}
            placeholder="Optional limitations"
            className="w-full bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white"
          />
          <div className="max-h-48 overflow-auto space-y-1">
            {ratings.map((row) => (
              <div key={row._id} className="flex items-center justify-between text-xs rounded bg-white/5 px-2 py-1">
                <span className="text-white/80">{row.category} class {row.classNumber}</span>
                <button
                  type="button"
                  onClick={() => void removeRating({ companyId: companyId as any, ratingId: row._id })}
                  className="text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
            {!ratings.length ? <p className="text-xs text-white/40">No class ratings yet.</p> : null}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Capability list</p>
            <button
              type="button"
              onClick={() => capabilityCsvRef.current?.click()}
              className="px-2 py-1 rounded border border-white/20 text-xs text-white/70"
            >
              Upload CSV
            </button>
            <input
              ref={capabilityCsvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await handleCapabilityCsv(file);
                } catch (error: any) {
                  toast.error(error?.message ?? "Capability import failed");
                } finally {
                  e.target.value = "";
                }
              }}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={capabilityDraft.articleDescription}
              onChange={(e) => setCapabilityDraft((s) => ({ ...s, articleDescription: e.target.value }))}
              placeholder="Article description"
              className="bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white sm:col-span-2"
            />
            <input
              value={capabilityDraft.clNumber}
              onChange={(e) => setCapabilityDraft((s) => ({ ...s, clNumber: e.target.value }))}
              placeholder="CL number"
              className="bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white"
            />
            <input
              value={capabilityDraft.authorizedFunctions}
              onChange={(e) => setCapabilityDraft((s) => ({ ...s, authorizedFunctions: e.target.value }))}
              placeholder="Functions (comma separated)"
              className="bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white"
            />
            <button
              type="button"
              onClick={async () => {
                if (!capabilityDraft.articleDescription.trim()) {
                  toast.error("Article description is required");
                  return;
                }
                try {
                  await addCapability({
                    companyId: companyId as any,
                    articleDescription: capabilityDraft.articleDescription.trim(),
                    clNumber: capabilityDraft.clNumber.trim() || undefined,
                    make: capabilityDraft.make.trim() || undefined,
                    model: capabilityDraft.model.trim() || undefined,
                    partNumber: capabilityDraft.partNumber.trim() || undefined,
                    authorizedFunctions: capabilityDraft.authorizedFunctions
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  });
                  setCapabilityDraft({
                    articleDescription: "",
                    clNumber: "",
                    make: "",
                    model: "",
                    partNumber: "",
                    authorizedFunctions: "",
                  });
                } catch (error: any) {
                  toast.error(error?.message ?? "Failed to save capability");
                }
              }}
              className="px-2 py-2 rounded-lg bg-sky/20 border border-sky-light/30 text-xs text-sky-100 sm:col-span-2"
            >
              Add capability
            </button>
          </div>
          <div className="max-h-48 overflow-auto space-y-1">
            {capabilities.map((row) => (
              <div key={row._id} className="flex items-center justify-between text-xs rounded bg-white/5 px-2 py-1 gap-2">
                <span className="text-white/80 truncate">{row.articleDescription}</span>
                <button
                  type="button"
                  onClick={() => void removeCapability({ companyId: companyId as any, capabilityId: row._id })}
                  className="text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
            {!capabilities.length ? <p className="text-xs text-white/40">No capability items yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
