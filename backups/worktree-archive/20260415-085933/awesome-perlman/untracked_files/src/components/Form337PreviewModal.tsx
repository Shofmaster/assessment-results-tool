import { FiX, FiDownload } from 'react-icons/fi';
import { toast } from 'sonner';
import { buildItem8Text, downloadOfficialForm337Pdf, type Form337Input } from '../services/form337Service';

interface Props {
  input: Form337Input;
  narrativeOverride?: string;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="text-[12px] text-gray-900 leading-snug min-h-[14px]">{value || <span className="text-gray-400 italic">—</span>}</div>
    </div>
  );
}

function Box({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-gray-400 p-2 ${className}`}>
      <div className="text-[10px] font-bold text-gray-700 border-b border-gray-300 pb-0.5 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Checkbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 mr-4 text-[11px] text-gray-800">
      <span className={`inline-block w-3 h-3 border border-gray-500 flex items-center justify-center text-[9px] font-bold ${checked ? 'bg-gray-800 text-white' : 'bg-white'}`}>
        {checked ? '✕' : ''}
      </span>
      {label}
    </span>
  );
}

export default function Form337PreviewModal({ input, narrativeOverride, onClose }: Props) {
  const item8Text = buildItem8Text(input, narrativeOverride);

  const handleDownload = async () => {
    try {
      await downloadOfficialForm337Pdf(input, narrativeOverride);
      toast.success('Official Form 337 PDF download started');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] flex flex-col rounded shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t">
          <span className="font-bold text-gray-800 text-sm">Form 337 Preview</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 text-xs bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded transition-colors"
            >
              <FiDownload className="w-3.5 h-3.5" /> Fill Official Form (PDF)
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors p-1">
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {/* Form page simulation */}
          <div className="mx-auto bg-white border border-gray-300 shadow-sm" style={{ maxWidth: 680, fontFamily: 'Arial, sans-serif' }}>
            {/* Header band */}
            <div className="border-b border-gray-400 px-3 py-2 flex justify-between items-start bg-gray-50">
              <div>
                <div className="font-bold text-[15px] text-gray-900">Major Repair and Alteration</div>
                <div className="text-[10px] text-gray-500">(As required by 14 CFR Part 43)</div>
                <div className="text-[9px] text-gray-400 mt-0.5">Instructions — Use this form to document major repairs and alterations per 14 CFR Part 43 Appendix B.</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold text-gray-800">FAA Form 337 (3-93)</div>
                <div className="text-[10px] text-gray-500">OMB No. 2120-0020</div>
              </div>
            </div>

            {/* Top section — 2 column grid */}
            <div className="grid grid-cols-[3fr_2fr] border-b border-gray-300">
              {/* Left: Items 1 & 2 */}
              <div className="border-r border-gray-300">
                <Box label="1. Aircraft Nationality and Registration Mark">
                  <Row label="N-Number / Nationality Mark" value={input.aircraft.nationalityRegistration} />
                  <Row label="Year of Manufacture" value={input.aircraft.yearOfManufacture || ''} />
                </Box>
                <Box label="2. Aircraft Make and Model" className="border-t border-gray-300">
                  <div className="grid grid-cols-2 gap-x-3">
                    <Row label="Make" value={input.aircraft.make} />
                    <Row label="Model" value={input.aircraft.model} />
                    <Row label="Series" value={input.aircraft.series || ''} />
                    <Row label="Serial Number" value={input.aircraft.serialNumber} />
                  </div>
                </Box>
              </div>
              {/* Right: Items 3, 4, 5 */}
              <div>
                <Box label="3. For FAA Use Only" className="bg-gray-100">
                  <div className="text-[10px] text-gray-400 italic py-2">Reserved — FAA or authorized designee completion only.</div>
                </Box>
                <Box label="4. Type" className="border-t border-gray-300">
                  <Checkbox checked={input.typeOfWork === 'repair'} label="Repair" />
                  <Checkbox checked={input.typeOfWork === 'alteration'} label="Alteration" />
                </Box>
                <Box label="5. Unit Identification" className="border-t border-gray-300">
                  <div className="grid grid-cols-2 mb-2">
                    <Checkbox checked={input.unitType === 'airframe'} label="Airframe" />
                    <Checkbox checked={input.unitType === 'powerplant'} label="Powerplant" />
                    <Checkbox checked={input.unitType === 'propeller'} label="Propeller" />
                    <Checkbox checked={input.unitType === 'appliance'} label="Appliance" />
                  </div>
                  <Row label="Unit Make" value={input.unit?.make || ''} />
                  <Row label="Unit Model" value={input.unit?.model || ''} />
                  <Row label="Unit Serial" value={input.unit?.serialNumber || ''} />
                </Box>
              </div>
            </div>

            {/* Middle section — Items 6 & 7 */}
            <div className="grid grid-cols-2 border-b border-gray-300">
              <Box label="6. Conformity Statement" className="border-r border-gray-300">
                <Row label="Kind of Agency" value={input.agency.kindOfAgency} />
                <Row label="Certificate No." value={input.agency.certificateNumber} />
                <Row label="Name and Address" value={input.agency.nameAndAddress} />
                <Row label="Completion Date" value={input.agency.completionDate} />
                {input.agency.signerName && <Row label="Signer" value={input.agency.signerName} />}
                <div className="mt-3 pt-1 border-t border-gray-200">
                  <div className="text-[9px] text-gray-400">Signature</div>
                  <div className="border-b border-gray-500 w-32 mt-1" />
                </div>
              </Box>
              <Box label="7. Approval for Return to Service">
                <Row label="Kind" value={input.returnToService.approverKind} />
                <Row label="Certificate / Designation" value={input.returnToService.approverCertificateOrDesignation} />
                <Row label="Name" value={input.returnToService.approverName} />
                <Row label="Approval Date" value={input.returnToService.approvalDate} />
                <div className="mt-1">
                  <Checkbox checked={input.returnToService.decision === 'approved'} label="Approved" />
                  <Checkbox checked={input.returnToService.decision === 'rejected'} label="Rejected" />
                </div>
                <div className="mt-3 pt-1 border-t border-gray-200">
                  <div className="text-[9px] text-gray-400">Signature</div>
                  <div className="border-b border-gray-500 w-32 mt-1" />
                </div>
              </Box>
            </div>

            {/* Item 8 */}
            <Box label="8. Description of Work Accomplished" className="border-b border-gray-300">
              <pre className="text-[11px] text-gray-900 whitespace-pre-wrap font-sans leading-relaxed min-h-[120px]">{item8Text || <span className="text-gray-400 italic">No work description yet.</span>}</pre>
            </Box>

            {/* DRAFT notice */}
            <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-200">
              <p className="text-[10px] text-amber-700">
                DRAFT – Review and finalize through certificated personnel before filing. Not an official FAA document.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
