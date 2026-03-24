import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { FiFileText, FiSave, FiTrash2, FiRefreshCw, FiUpload, FiPrinter, FiDownload } from 'react-icons/fi';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import {
  useAddForm337Record,
  useDefaultClaudeModel,
  useForm337Records,
  useRemoveForm337Record,
  useUpdateForm337Record,
} from '../hooks/useConvexData';
import {
  generateForm337Outputs,
  buildPrintable337Html,
  downloadForm337Pdf,
  type Form337Input,
} from '../services/form337Service';
import { GlassCard, Button } from './ui';
import { getConvexErrorMessage } from '../utils/convexError';

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
  workDescription: {
    location: '',
    summaryOfWork: '',
    methodsAndData: '',
    partsAndReferences: '',
    preclosureInspection: '',
    weightAndBalanceImpact: '',
    continuedAirworthiness: '',
  },
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

export default function Form337() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const model = useDefaultClaudeModel();

  const addRecord = useAddForm337Record();
  const updateRecord = useUpdateForm337Record();
  const removeRecord = useRemoveForm337Record();
  const records = (useForm337Records(activeProjectId || undefined) || []) as any[];

  const [form, setForm] = useState<Form337Input>(EMPTY_FORM);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [fieldMappedOutput, setFieldMappedOutput] = useState<Record<string, unknown> | null>(null);
  const [narrativeDraftOutput, setNarrativeDraftOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    [records]
  );

  const canGenerate =
    !!form.title.trim() &&
    !!form.aircraft.nationalityRegistration.trim() &&
    !!form.aircraft.serialNumber.trim() &&
    !!form.owner.name.trim() &&
    !!form.workDescription.summaryOfWork.trim() &&
    !!form.workDescription.methodsAndData.trim();

  const canSave = canGenerate && !!narrativeDraftOutput && !!fieldMappedOutput;

  const resetDraft = () => {
    setForm(EMPTY_FORM);
    setRecordId(null);
    setFieldMappedOutput(null);
    setNarrativeDraftOutput('');
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error('Complete required fields before generating');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateForm337Outputs(form, model);
      setFieldMappedOutput(result.fieldMappedOutput);
      setNarrativeDraftOutput(result.narrativeDraftOutput);
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
      if (recordId) {
        await updateRecord({
          recordId: recordId as any,
          title: form.title,
          formData: form,
          fieldMappedOutput,
          narrativeDraftOutput,
          status: 'draft',
        });
        toast.success('Form 337 draft updated');
      } else {
        const insertedId = await addRecord({
          projectId: activeProjectId as any,
          title: form.title,
          formData: form,
          fieldMappedOutput,
          narrativeDraftOutput,
          status: 'draft',
        });
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

  const handleDownloadPdf = async (event?: MouseEvent<HTMLButtonElement>) => {
    if (!fieldMappedOutput || !narrativeDraftOutput) {
      toast.error('Generate outputs before downloading PDF');
      return;
    }
    try {
      const debugGrid = !!event?.altKey;
      await downloadForm337Pdf(form, { fieldMappedOutput, narrativeDraftOutput }, { debugGrid });
      if (debugGrid) {
        toast.success('PDF download started (debug grid enabled)');
        return;
      }
      toast.success('PDF download started');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF');
    }
  };

  const loadRecord = (record: any) => {
    setRecordId(record._id);
    setForm(record.formData as Form337Input);
    setFieldMappedOutput((record.fieldMappedOutput as Record<string, unknown>) || null);
    setNarrativeDraftOutput(record.narrativeDraftOutput || '');
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
          <div className="text-xs text-white/60 mt-2">Aircraft (Item 1)</div>
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="N-number / nationality registration *" value={form.aircraft.nationalityRegistration} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, nationalityRegistration: e.target.value } })} />
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Make" value={form.aircraft.make} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, make: e.target.value } })} />
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Model" value={form.aircraft.model} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, model: e.target.value } })} />
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Series" value={form.aircraft.series || ''} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, series: e.target.value } })} />
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Serial number *" value={form.aircraft.serialNumber} onChange={(e) => setForm({ ...form, aircraft: { ...form.aircraft, serialNumber: e.target.value } })} />

          <div className="text-xs text-white/60 mt-2">Owner (Item 2)</div>
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Owner name *" value={form.owner.name} onChange={(e) => setForm({ ...form, owner: { ...form.owner, name: e.target.value } })} />
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Owner address" rows={2} value={form.owner.address} onChange={(e) => setForm({ ...form, owner: { ...form.owner, address: e.target.value } })} />

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

          <div className="text-xs text-white/60 mt-2">Description of Work (Item 8)</div>
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Location on aircraft/component" value={form.workDescription.location} onChange={(e) => setForm({ ...form, workDescription: { ...form.workDescription, location: e.target.value } })} />
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Summary of work accomplished *" rows={3} value={form.workDescription.summaryOfWork} onChange={(e) => setForm({ ...form, workDescription: { ...form.workDescription, summaryOfWork: e.target.value } })} />
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Methods/data used and references *" rows={3} value={form.workDescription.methodsAndData} onChange={(e) => setForm({ ...form, workDescription: { ...form.workDescription, methodsAndData: e.target.value } })} />
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Parts and reference docs" rows={2} value={form.workDescription.partsAndReferences || ''} onChange={(e) => setForm({ ...form, workDescription: { ...form.workDescription, partsAndReferences: e.target.value } })} />
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="W&B impact / records notes" rows={2} value={form.workDescription.weightAndBalanceImpact || ''} onChange={(e) => setForm({ ...form, workDescription: { ...form.workDescription, weightAndBalanceImpact: e.target.value } })} />

          <div className="text-xs text-white/60 mt-2">Agency / Return to Service (Items 6 & 7)</div>
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Agency name and address" rows={2} value={form.agency.nameAndAddress} onChange={(e) => setForm({ ...form, agency: { ...form.agency, nameAndAddress: e.target.value } })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Agency type" value={form.agency.kindOfAgency} onChange={(e) => setForm({ ...form, agency: { ...form.agency, kindOfAgency: e.target.value } })} />
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Cert number" value={form.agency.certificateNumber} onChange={(e) => setForm({ ...form, agency: { ...form.agency, certificateNumber: e.target.value } })} />
          </div>
          <input className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Completion date (YYYY-MM-DD)" value={form.agency.completionDate} onChange={(e) => setForm({ ...form, agency: { ...form.agency, completionDate: e.target.value } })} />
          <div className="grid grid-cols-2 gap-2">
            <select className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" value={form.returnToService.decision} onChange={(e) => setForm({ ...form, returnToService: { ...form.returnToService, decision: e.target.value as 'approved' | 'rejected' } })}>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input className="px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Approver name" value={form.returnToService.approverName} onChange={(e) => setForm({ ...form, returnToService: { ...form.returnToService, approverName: e.target.value } })} />
          </div>
          <textarea className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm" placeholder="Field approval notes (optional)" rows={2} value={form.fieldApprovalNotes || ''} onChange={(e) => setForm({ ...form, fieldApprovalNotes: e.target.value })} />
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleGenerate} disabled={generating || !canGenerate}>
              {generating ? <FiRefreshCw className="mr-1 animate-spin" /> : <FiUpload className="mr-1" />} Generate
            </Button>
            <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving || !canSave}>
              <FiSave className="mr-1" /> Save Draft
            </Button>
            <Button size="sm" variant="ghost" onClick={handlePrint} disabled={!canSave}>
              <FiPrinter className="mr-1" /> Print
            </Button>
            <Button size="sm" variant="ghost" onClick={(e) => handleDownloadPdf(e)} disabled={!canSave}>
              <FiDownload className="mr-1" /> Download PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={resetDraft}>
              New
            </Button>
          </div>
        </GlassCard>

        <GlassCard padding="sm" border className="min-h-0 overflow-y-auto">
          <h2 className="text-sm text-white/80 font-medium mb-2">Generated Outputs</h2>
          <div className="text-xs text-white/60 mb-1">Narrative Draft (Item 8)</div>
          <textarea
            className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm min-h-40"
            value={narrativeDraftOutput}
            onChange={(e) => setNarrativeDraftOutput(e.target.value)}
            placeholder="Generated Item 8 draft appears here..."
          />
          <div className="text-xs text-white/60 mt-3 mb-1">Field-Mapped Output</div>
          <textarea
            className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-xs min-h-72 font-mono"
            value={fieldMappedOutput ? JSON.stringify(fieldMappedOutput, null, 2) : ''}
            onChange={(e) => {
              try {
                setFieldMappedOutput(e.target.value ? JSON.parse(e.target.value) : null);
              } catch {
                // keep text editable but do not hard-fail typing invalid JSON
              }
            }}
            placeholder="Generated block-mapped output appears here..."
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
                  <div className="text-sm text-white truncate">{record.title}</div>
                  <div className="text-[11px] text-white/50">{new Date(record.updatedAt).toLocaleString()}</div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => loadRecord(record)}>
                      Load
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
