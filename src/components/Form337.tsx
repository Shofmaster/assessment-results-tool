import { useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  FiFileText,
  FiSave,
  FiTrash2,
  FiRefreshCw,
  FiUpload,
  FiPrinter,
  FiDownload,
  FiPlus,
  FiMinus,
  FiCopy,
  FiCheckCircle,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import {
  useAddForm337Record,
  useAircraftAssets,
  useDefaultClaudeModel,
  useForm337Records,
  useRemoveForm337Record,
  useUpdateForm337Record,
} from '../hooks/useConvexData';
import {
  generateForm337Outputs,
  buildPrintable337Html,
  downloadForm337Pdf,
  migrateFormData,
  type Form337Input,
  type Form337Status,
  type WorkItem,
} from '../services/form337Service';
import { fillOfficialForm337Pdf } from '../services/form337OfficialPdf';
import { GlassCard, Button } from './ui';
import { getConvexErrorMessage } from '../utils/convexError';
import { validateForm337ForGenerate } from '../services/form337Validation';

interface Form337RecordDoc {
  _id: string;
  title: string;
  status?: Form337Status;
  formData: Record<string, unknown>;
  fieldMappedOutput?: Record<string, unknown> | null;
  narrativeDraftOutput?: string;
  logbookEntryOutput?: string;
  aircraftId?: string;
  updatedAt: string;
}

interface AircraftAssetDoc {
  _id: string;
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
}

function makeWorkItem(): WorkItem {
  return {
    id: crypto.randomUUID(),
    location: '',
    description: '',
    approvedData: '',
    partsUsed: '',
    weightChange: '',
    continuedAirworthiness: '',
  };
}

const EMPTY_FORM: Form337Input = {
  title: '',
  aircraft: {
    nationalityRegistration: '',
    make: '',
    model: '',
    series: '',
    serialNumber: '',
  },
  owner: {
    name: '',
    address: '',
  },
  typeOfWork: 'alteration',
  unitType: 'airframe',
  unitIdentification: {},
  workItems: [makeWorkItem()],
  agency: {
    nameAndAddress: '',
    kindOfAgency: '',
    certificateNumber: '',
    completionDate: '',
    signerName: '',
  },
  returnToService: {
    decision: 'approved',
    approverName: '',
    approverCertificateOrDesignation: '',
    approverKind: '',
    approvalDate: '',
  },
  fieldApprovalNotes: '',
};

async function copyToClipboard(label: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  } catch {
    toast.error('Clipboard unavailable — select and copy manually');
  }
}

export default function Form337() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const model = useDefaultClaudeModel();

  const addRecord = useAddForm337Record();
  const updateRecord = useUpdateForm337Record();
  const removeRecord = useRemoveForm337Record();
  const records = (useForm337Records(activeProjectId || undefined) || []) as Form337RecordDoc[];
  const aircraftAssets = (useAircraftAssets(activeProjectId || undefined) || []) as AircraftAssetDoc[];

  const [form, setForm] = useState<Form337Input>(EMPTY_FORM);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>('');
  const [fieldMappedOutput, setFieldMappedOutput] = useState<Record<string, unknown> | null>(null);
  const [fieldMappedText, setFieldMappedText] = useState('');
  const [fieldMappedTextValid, setFieldMappedTextValid] = useState(true);
  const [narrativeDraftOutput, setNarrativeDraftOutput] = useState('');
  const [logbookEntryOutput, setLogbookEntryOutput] = useState('');
  const [draftStatus, setDraftStatus] = useState<Form337Status>('draft');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingOfficial, setDownloadingOfficial] = useState(false);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    [records]
  );

  const validation = useMemo(() => validateForm337ForGenerate(form), [form]);
  const canGenerate = validation.ok;

  const canSave = canGenerate && !!narrativeDraftOutput && !!fieldMappedOutput && fieldMappedTextValid;

  const syncFieldMapped = (value: Record<string, unknown> | null) => {
    setFieldMappedOutput(value);
    setFieldMappedText(value ? JSON.stringify(value, null, 2) : '');
    setFieldMappedTextValid(true);
  };

  const resetDraft = () => {
    setForm(EMPTY_FORM);
    setRecordId(null);
    setSelectedAircraftId('');
    syncFieldMapped(null);
    setNarrativeDraftOutput('');
    setLogbookEntryOutput('');
    setDraftStatus('draft');
  };

  const applyAircraftAsset = (assetId: string) => {
    setSelectedAircraftId(assetId);
    const asset = aircraftAssets.find((a) => a._id === assetId);
    if (!asset) return;
    setForm((prev) => ({
      ...prev,
      aircraft: {
        ...prev.aircraft,
        nationalityRegistration: asset.tailNumber || prev.aircraft.nationalityRegistration,
        make: asset.make || prev.aircraft.make,
        model: asset.model || prev.aircraft.model,
        serialNumber: asset.serial || prev.aircraft.serialNumber,
      },
    }));
    toast.success(`Aircraft ${asset.tailNumber} filled into Item 1`);
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error(validation.messages[0] ?? 'Complete required fields before generating');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateForm337Outputs(form, model);
      syncFieldMapped(result.fieldMappedOutput);
      setNarrativeDraftOutput(result.narrativeDraftOutput);
      setLogbookEntryOutput(result.logbookEntryOutput || '');
      toast.success('FAA Form 337 draft outputs generated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate outputs');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!activeProjectId || !canSave) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        formData: form,
        fieldMappedOutput,
        narrativeDraftOutput,
        logbookEntryOutput,
        status: draftStatus,
        aircraftId: (selectedAircraftId || undefined) as any,
      };
      if (recordId) {
        await updateRecord({ recordId: recordId as any, ...payload });
        toast.success('Form 337 draft updated');
      } else {
        const insertedId = await addRecord({ projectId: activeProjectId as any, ...payload });
        setRecordId(insertedId as string);
        toast.success('Form 337 draft saved');
      }
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!fieldMappedOutput || !narrativeDraftOutput) {
      toast.error('Generate outputs before printing');
      return;
    }
    const html = buildPrintable337Html(form, {
      fieldMappedOutput,
      narrativeDraftOutput,
      logbookEntryOutput,
    });
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      toast.error('Popup blocked. Allow popups to print.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownloadOfficial = async () => {
    if (!fieldMappedOutput || !narrativeDraftOutput) {
      toast.error('Generate outputs before downloading the official form');
      return;
    }
    setDownloadingOfficial(true);
    try {
      await fillOfficialForm337Pdf(form, { fieldMappedOutput, narrativeDraftOutput, logbookEntryOutput });
      toast.success('Official FAA Form 337 download started');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to fill official form');
    } finally {
      setDownloadingOfficial(false);
    }
  };

  const handleDownloadWorksheet = async (event?: MouseEvent<HTMLButtonElement>) => {
    if (!fieldMappedOutput || !narrativeDraftOutput) {
      toast.error('Generate outputs before downloading PDF');
      return;
    }
    try {
      const debugGrid = !!event?.altKey;
      await downloadForm337Pdf(form, { fieldMappedOutput, narrativeDraftOutput }, { debugGrid });
      toast.success(debugGrid ? 'Worksheet PDF download started (debug grid enabled)' : 'Worksheet PDF download started');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF');
    }
  };

  const loadRecord = (record: Form337RecordDoc) => {
    setRecordId(record._id);
    setForm(migrateFormData(record.formData));
    setSelectedAircraftId(record.aircraftId || '');
    syncFieldMapped((record.fieldMappedOutput as Record<string, unknown>) || null);
    setNarrativeDraftOutput(record.narrativeDraftOutput || '');
    setLogbookEntryOutput(record.logbookEntryOutput || '');
    setDraftStatus(record.status || 'draft');
  };

  const toggleRecordStatus = async (record: Form337RecordDoc) => {
    const next: Form337Status = record.status === 'ready_for_review' ? 'draft' : 'ready_for_review';
    try {
      await updateRecord({ recordId: record._id as any, status: next });
      if (recordId === record._id) setDraftStatus(next);
      toast.success(next === 'ready_for_review' ? 'Marked ready for review' : 'Moved back to draft');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const updateWorkItem = (id: string, patch: Partial<WorkItem>) => {
    setForm((prev) => ({
      ...prev,
      workItems: prev.workItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const addWorkItem = () => {
    setForm((prev) => ({ ...prev, workItems: [...prev.workItems, makeWorkItem()] }));
  };

  const removeWorkItem = (id: string) => {
    setForm((prev) => ({
      ...prev,
      workItems: prev.workItems.length > 1 ? prev.workItems.filter((item) => item.id !== id) : prev.workItems,
    }));
  };

  const deleteRecord = async (id: string) => {
    try {
      await removeRecord({ recordId: id as any });
      if (recordId === id) resetDraft();
      toast.success('Form 337 draft removed');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const updateUnitIdentification = (patch: Partial<NonNullable<Form337Input['unitIdentification']>>) => {
    setForm((prev) => ({ ...prev, unitIdentification: { ...(prev.unitIdentification || {}), ...patch } }));
  };

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
        <h1 className="text-2xl font-display font-bold text-white mb-4">FAA Form 337</h1>
        <GlassCard padding="lg">
          <p className="text-white/70 text-center py-12">Select a project to start drafting Form 337 records.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-xl lg:text-2xl font-display font-bold text-white flex items-center gap-2">
          <FiFileText className="text-sky-lighter" /> FAA Form 337
        </h1>
        <div className="text-xs text-amber-300/80">
          Draft assistance only. Certificated/FAA review required before filing.
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[380px_1fr_320px] gap-4 overflow-y-auto">
        <GlassCard padding="sm" border className="space-y-2 overflow-y-auto">
          <h2 className="text-sm text-white/80 font-medium">Input Data</h2>
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Draft title (required)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />

          <div className="text-xs text-white/60 mt-2">Item 1 — Aircraft</div>
          {aircraftAssets.length > 0 && (
            <select
              className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm"
              value={selectedAircraftId}
              onChange={(e) => applyAircraftAsset(e.target.value)}
              aria-label="Fill aircraft from fleet"
            >
              <option value="">Fill from fleet aircraft…</option>
              {aircraftAssets.map((asset) => (
                <option key={asset._id} value={asset._id}>
                  {asset.tailNumber} — {[asset.make, asset.model].filter(Boolean).join(' ') || 'Unknown type'}
                </option>
              ))}
            </select>
          )}
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Nationality & registration mark (N-number) *" value={form.aircraft.nationalityRegistration} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, nationalityRegistration: e.target.value } })} />
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Make" value={form.aircraft.make} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, make: e.target.value } })} />
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Model" value={form.aircraft.model} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, model: e.target.value } })} />
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Series" value={form.aircraft.series || ''} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, series: e.target.value } })} />
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Serial number *" value={form.aircraft.serialNumber} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, serialNumber: e.target.value } })} />

          <div className="text-xs text-white/60 mt-2">Item 2 — Owner</div>
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Owner name (as on registration certificate) *" value={form.owner.name} onChange={(e) => setForm({ ...form, owner: { ...form.owner, name: e.target.value } })} />
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder={'Owner address — street on first line, then "City, ST 12345"'} rows={2} value={form.owner.address} onChange={(e) => setForm({ ...form, owner: { ...form.owner, address: e.target.value } })} />

          <div className="text-xs text-white/60 mt-2">Item 4 — Type / Item 5 — Unit Identification</div>
          <div className="grid grid-cols-2 gap-2">
            <select className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" value={form.typeOfWork} onChange={(e) => setForm({ ...form, typeOfWork: e.target.value as Form337Input['typeOfWork'] })}>
              <option value="repair">Repair</option>
              <option value="alteration">Alteration</option>
            </select>
            <select className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" value={form.unitType} onChange={(e) => setForm({ ...form, unitType: e.target.value as Form337Input['unitType'] })}>
              <option value="airframe">Airframe</option>
              <option value="powerplant">Powerplant</option>
              <option value="propeller">Propeller</option>
              <option value="appliance">Appliance</option>
            </select>
          </div>
          {form.unitType !== 'airframe' && (
            <div className="border border-white/15 rounded p-2 space-y-2 bg-white/[0.03]">
              <div className="text-[11px] text-sky-200">
                Item 5 — {form.unitType} identification (the airframe row only covers Item 1)
              </div>
              {form.unitType === 'appliance' && (
                <>
                  <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Appliance type (e.g. Autopilot)" value={form.unitIdentification?.applianceType || ''} onChange={(e) => updateUnitIdentification({ applianceType: e.target.value })} />
                  <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Appliance manufacturer" value={form.unitIdentification?.applianceManufacturer || ''} onChange={(e) => updateUnitIdentification({ applianceManufacturer: e.target.value })} />
                </>
              )}
              {form.unitType !== 'appliance' && (
                <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder={`${form.unitType === 'powerplant' ? 'Engine' : 'Propeller'} make (e.g. Lycoming)`} value={form.unitIdentification?.make || ''} onChange={(e) => updateUnitIdentification({ make: e.target.value })} />
              )}
              <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Unit model" value={form.unitIdentification?.model || ''} onChange={(e) => updateUnitIdentification({ model: e.target.value })} />
              <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Unit serial number" value={form.unitIdentification?.serialNumber || ''} onChange={(e) => updateUnitIdentification({ serialNumber: e.target.value })} />
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-white/60">Item 8 (Reverse) — Description of Work Accomplished</div>
            <button
              type="button"
              onClick={addWorkItem}
              className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200 transition-colors"
            >
              <FiPlus className="w-3 h-3" /> Add Work Item
            </button>
          </div>
          <div className="text-[11px] text-amber-300/70 mb-1">
            Per AC 43.9-1G &amp; 14 CFR 43.9: use active past tense (Removed, Inspected, Repaired, Replaced, Installed…). Include component P/N or S/N, measurements/tolerances, approved data citation inline (e.g. "per AMM 27-30-00 Rev 6"), parts traceability (8130-3/PMA/TSO), and W&amp;B delta.
          </div>
          {form.workItems.map((item, idx) => (
            <div key={item.id} className="border border-white/15 rounded p-2 space-y-2 bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-sky-200">Work Item {idx + 1}</span>
                {form.workItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeWorkItem(item.id)}
                    className="text-white/40 hover:text-red-400 transition-colors"
                    title="Remove this item"
                  >
                    <FiMinus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <input
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm"
                placeholder="Location on aircraft / component (e.g. Left MLG door hinge)"
                value={item.location}
                onChange={(e) => updateWorkItem(item.id, { location: e.target.value })}
              />
              <textarea
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm"
                placeholder="Description of work performed * — Active past tense. E.g.: Removed left elevator pushrod, P/N 0450166-1, S/N 12345. Inspected per AMM 27-30-00 Rev 6 para 3-4. Found elongated aft attach hole, 0.003 in. oversize. Fabricated repair doubler IAW AC 43-13-1B Fig. 4-17. Reinstalled pushrod. Checked travel per AMM 27-30-00 para 3-7. All within limits. [14 CFR 43.9(a)(1)]"
                rows={3}
                value={item.description}
                onChange={(e) => updateWorkItem(item.id, { description: e.target.value })}
              />
              <textarea
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm"
                placeholder="Approved data * — cite specific section/rev. E.g.: AMM 57-10-00 Rev 15 para 3-4 | AC 43-13-1B Ch. 4 Fig. 4-17 | STC SA01234NM Rev A Install. Instr. para 3.2 | AD 2023-14-07 para (e)(1) | OEM SB 07-57-12 Rev B [14 CFR 43.13(a)]"
                rows={2}
                value={item.approvedData}
                onChange={(e) => updateWorkItem(item.id, { approvedData: e.target.value })}
              />
              <textarea
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm"
                placeholder="Parts used — Mfr, P/N, S/N, traceability tag. E.g.: Cessna Aircraft, P/N 0450166-1, S/N A4521, FAA Form 8130-3 attached | or: PMA-approved, P/N XYZ-100 | If none: No parts installed or removed"
                rows={2}
                value={item.partsUsed || ''}
                onChange={(e) => updateWorkItem(item.id, { partsUsed: e.target.value })}
              />
              <input
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm"
                placeholder='Weight &amp; balance — state actual delta with arm (e.g. "+3.2 lb at +42.5 in. arm") or "No change to weight or balance." W&amp;B revised per [doc ref] if altered. (required on 337)'
                value={item.weightChange || ''}
                onChange={(e) => updateWorkItem(item.id, { weightChange: e.target.value })}
              />
              <textarea
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm"
                placeholder="Continued airworthiness — post-maintenance inspections or limitations, if any"
                rows={2}
                value={item.continuedAirworthiness || ''}
                onChange={(e) => updateWorkItem(item.id, { continuedAirworthiness: e.target.value })}
              />
            </div>
          ))}

          <div className="text-xs text-white/60 mt-2">Item 6 — Conformity Statement</div>
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder={'Agency name and address — name on first line, street next, then "City, ST 12345"'} rows={3} value={form.agency.nameAndAddress} onChange={(e) => setForm({ ...form, agency: { ...form.agency, nameAndAddress: e.target.value } })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Kind of agency (e.g. Certificated Repair Station)" value={form.agency.kindOfAgency} onChange={(e) => setForm({ ...form, agency: { ...form.agency, kindOfAgency: e.target.value } })} />
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Certificate no." value={form.agency.certificateNumber} onChange={(e) => setForm({ ...form, agency: { ...form.agency, certificateNumber: e.target.value } })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Date work completed (YYYY-MM-DD)" value={form.agency.completionDate} onChange={(e) => setForm({ ...form, agency: { ...form.agency, completionDate: e.target.value } })} />
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Signer name (authorized individual)" value={form.agency.signerName || ''} onChange={(e) => setForm({ ...form, agency: { ...form.agency, signerName: e.target.value } })} />
          </div>

          <div className="text-xs text-white/60 mt-2">Item 7 — Approval for Return to Service</div>
          <div className="grid grid-cols-2 gap-2">
            <select className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" value={form.returnToService.decision} onChange={(e) => setForm({ ...form, returnToService: { ...form.returnToService, decision: e.target.value as 'approved' | 'rejected' } })}>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Approver name" value={form.returnToService.approverName} onChange={(e) => setForm({ ...form, returnToService: { ...form.returnToService, approverName: e.target.value } })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Approver kind (e.g. Inspection Authorization)" value={form.returnToService.approverKind} onChange={(e) => setForm({ ...form, returnToService: { ...form.returnToService, approverKind: e.target.value } })} />
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Certificate / designation no." value={form.returnToService.approverCertificateOrDesignation} onChange={(e) => setForm({ ...form, returnToService: { ...form.returnToService, approverCertificateOrDesignation: e.target.value } })} />
          </div>
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Approval date (YYYY-MM-DD)" value={form.returnToService.approvalDate} onChange={(e) => setForm({ ...form, returnToService: { ...form.returnToService, approvalDate: e.target.value } })} />
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Field approval notes (optional)" rows={2} value={form.fieldApprovalNotes || ''} onChange={(e) => setForm({ ...form, fieldApprovalNotes: e.target.value })} />

          {!canGenerate && validation.messages.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-xs text-amber-100/90">
              {validation.messages.map((msg) => (
                <li key={msg} className="flex items-start gap-1.5">
                  <span aria-hidden className="mt-0.5">•</span>
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          )}
          {validation.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg border border-sky-300/20 bg-sky-500/10 p-3 text-xs text-sky-100/80">
              {validation.warnings.map((msg) => (
                <li key={msg} className="flex items-start gap-1.5">
                  <span aria-hidden className="mt-0.5">⚠</span>
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-center gap-2 pt-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={draftStatus === 'ready_for_review'}
              onChange={(e) => setDraftStatus(e.target.checked ? 'ready_for_review' : 'draft')}
            />
            Ready for review
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={handleGenerate} disabled={generating || !canGenerate}>
              {generating ? <FiRefreshCw className="mr-1 animate-spin" /> : <FiUpload className="mr-1" />} Generate
            </Button>
            <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving || !canSave}>
              <FiSave className="mr-1" /> Save Draft
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDownloadOfficial} disabled={!canSave || downloadingOfficial}>
              {downloadingOfficial ? <FiRefreshCw className="mr-1 animate-spin" /> : <FiDownload className="mr-1" />} Official PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={(e) => handleDownloadWorksheet(e)} disabled={!canSave}>
              <FiDownload className="mr-1" /> Worksheet
            </Button>
            <Button size="sm" variant="ghost" onClick={handlePrint} disabled={!canSave}>
              <FiPrinter className="mr-1" /> Print
            </Button>
            <Button size="sm" variant="ghost" onClick={resetDraft}>
              New
            </Button>
          </div>
        </GlassCard>

        <GlassCard padding="sm" border className="min-h-0 overflow-y-auto">
          <h2 className="text-sm text-white/80 font-medium mb-2">Generated Outputs</h2>
          <div className="flex items-center justify-between mt-1 mb-1">
            <div className="text-xs text-white/60">Item 8 — Description of Work Accomplished</div>
            {narrativeDraftOutput && (
              <button type="button" className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200" onClick={() => copyToClipboard('Item 8 narrative', narrativeDraftOutput)}>
                <FiCopy className="w-3 h-3" /> Copy
              </button>
            )}
          </div>
          <textarea
            className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm min-h-40"
            value={narrativeDraftOutput}
            onChange={(e) => setNarrativeDraftOutput(e.target.value)}
            placeholder="Generated Item 8 draft appears here..."
          />
          <div className="flex items-center justify-between mt-3 mb-1">
            <div className="text-xs text-white/60">Companion Logbook Entry (14 CFR 43.9)</div>
            {logbookEntryOutput && (
              <button type="button" className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200" onClick={() => copyToClipboard('Logbook entry', logbookEntryOutput)}>
                <FiCopy className="w-3 h-3" /> Copy
              </button>
            )}
          </div>
          <textarea
            className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm min-h-32"
            value={logbookEntryOutput}
            onChange={(e) => setLogbookEntryOutput(e.target.value)}
            placeholder="Matching maintenance-record (logbook) entry appears here..."
          />
          <div className="flex items-center justify-between mt-3 mb-1">
            <div className="text-xs text-white/60">Field-Mapped Output (Items 1–8)</div>
            {!fieldMappedTextValid && <span className="text-[11px] text-amber-300">Invalid JSON — fix to save</span>}
          </div>
          <textarea
            className={`w-full px-3 py-2 rounded bg-white/5 border text-xs min-h-72 font-mono ${fieldMappedTextValid ? 'border-white/10' : 'border-amber-400/60'}`}
            value={fieldMappedText}
            onChange={(e) => {
              const text = e.target.value;
              setFieldMappedText(text);
              if (!text.trim()) {
                setFieldMappedOutput(null);
                setFieldMappedTextValid(true);
                return;
              }
              try {
                setFieldMappedOutput(JSON.parse(text));
                setFieldMappedTextValid(true);
              } catch {
                setFieldMappedTextValid(false);
              }
            }}
            placeholder="Generated item-mapped output appears here..."
          />
          <p className="text-[11px] text-white/50 mt-2">
            Per Part 43 Appendix B, filing/disposition still requires your normal certified process and FAA submission workflow.
          </p>
        </GlassCard>

        <GlassCard padding="sm" border className="min-h-0 overflow-y-auto">
          <h2 className="text-sm text-white/80 font-medium mb-2">Saved Form 337 Drafts</h2>
          {sortedRecords.length === 0 ? (
            <p className="text-xs text-white/50">No saved drafts for this project yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedRecords.map((record) => (
                <div key={record._id} className="p-2 rounded bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-white truncate flex-1">{record.title}</div>
                    {record.status === 'ready_for_review' && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                        <FiCheckCircle className="w-3 h-3" /> Review
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-white/50">{new Date(record.updatedAt).toLocaleString()}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => loadRecord(record)}>
                      Load
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleRecordStatus(record)}>
                      {record.status === 'ready_for_review' ? 'To Draft' : 'Mark Ready'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteRecord(record._id)}>
                      <FiTrash2 className="mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
