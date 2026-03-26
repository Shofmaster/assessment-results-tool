import type { KnownReferenceDocType, UploadCategory } from '../services/documentTypeResolver';
import { suggestUploadCategoryForDocType } from '../services/documentTypeResolver';

export interface AcquisitionGuidance {
  docType: KnownReferenceDocType;
  guidance: string;
  sourceTypes: string[];
  templateLinks: { label: string; url: string }[];
  suggestedUploadCategory: UploadCategory;
}

const GUIDANCE_MAP: Record<KnownReferenceDocType, Omit<AcquisitionGuidance, 'docType' | 'suggestedUploadCategory'>> = {
  'part-145-manual': {
    guidance:
      'The Part 145 Repair Station Manual (RSM) is your FAA-approved authoritative document for repair station operations. Obtain the current approved copy from your quality department or the certificate holder.',
    sourceTypes: ['Certificate holder', 'Quality department', 'FAA-approved document archive'],
    templateLinks: [
      {
        label: 'FAA Part 145 info',
        url: 'https://www.faa.gov/licenses_certificates/repair_stations/part_145_repair_stations',
      },
    ],
  },
  'gmm': {
    guidance:
      'The General Maintenance Manual (GMM) documents your maintenance procedures, work standards, and general policies. Obtain from your maintenance management or quality department.',
    sourceTypes: ['Maintenance management', 'Quality department', 'Internal document control'],
    templateLinks: [],
  },
  'qcm': {
    guidance:
      'The Quality Control Manual (QCM) defines inspection procedures, acceptance criteria, and quality assurance processes. Obtain the current revision from your quality department.',
    sourceTypes: ['Quality department', 'Chief Inspector', 'Document control system'],
    templateLinks: [],
  },
  'sms-manual': {
    guidance:
      'The Safety Management System (SMS) Manual describes your safety policy, risk management process, and safety assurance program. Obtain from your safety manager.',
    sourceTypes: ['Safety Manager', 'Safety department', 'ICAO/FAA SMS guidance'],
    templateLinks: [
      {
        label: 'FAA SMS Resources',
        url: 'https://www.faa.gov/about/initiatives/sms',
      },
      {
        label: 'ICAO SMS Manual',
        url: 'https://www.icao.int/safety/SafetyManagement/Pages/GuidanceDocuments.aspx',
      },
    ],
  },
  'training-program': {
    guidance:
      'The Training Program Manual outlines initial and recurrent training requirements for all personnel. Obtain from your training department or Director of Maintenance.',
    sourceTypes: ['Training department', 'Director of Maintenance', 'HR / Personnel records'],
    templateLinks: [],
  },
  'ops-specs': {
    guidance:
      'Operations Specifications (Ops Specs) are FAA-issued authorizations that define the specific operations approved for your certificate. Obtain from the certificate holder or operations department.',
    sourceTypes: ['Certificate holder', 'Operations department', 'FAA ATOS system'],
    templateLinks: [
      {
        label: 'FAA Ops Specs info',
        url: 'https://www.faa.gov/about/office_org/headquarters_offices/avs/offices/afs/afs200/afs220',
      },
    ],
  },
  'mel': {
    guidance:
      'The Minimum Equipment List (MEL/MMEL) defines conditions under which an aircraft may be dispatched with inoperative equipment. Obtain from the operator or FAA-approved MEL database.',
    sourceTypes: ['Aircraft operator', 'FAA MMEL database', 'Aircraft manufacturer'],
    templateLinks: [
      {
        label: 'FAA MMEL Policy',
        url: 'https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgMakeModel.nsf/0/OpenDatabase&&&MMEL',
      },
    ],
  },
  'ipm': {
    guidance:
      'The Inspection Procedures Manual (IPM) details the step-by-step inspection procedures for your operations. Obtain from your Chief Inspector or quality department.',
    sourceTypes: ['Chief Inspector', 'Quality department', 'Internal document control'],
    templateLinks: [],
  },
  'tool-calibration': {
    guidance:
      'The Tool Calibration Manual describes calibration requirements, intervals, and tracking procedures for inspection and measurement tools. Obtain from your quality department or tool crib.',
    sourceTypes: ['Quality department', 'Tool crib / calibration lab', 'ISO/AS9100 calibration records'],
    templateLinks: [],
  },
  'hazmat-manual': {
    guidance:
      'The Hazmat Training Manual covers handling, storage, and shipping of hazardous materials per DOT/IATA regulations. Obtain from your safety or compliance department.',
    sourceTypes: ['Safety department', 'Compliance officer', 'DOT/IATA training providers'],
    templateLinks: [
      {
        label: 'DOT Hazmat Resources',
        url: 'https://www.phmsa.dot.gov/hazmat/training',
      },
    ],
  },
  'isbao-standards': {
    guidance:
      'IS-BAO (International Standard for Business Aircraft Operations) standards define best practices for business aviation safety and operations. Download from IBAC.',
    sourceTypes: ['IBAC (International Business Aviation Council)', 'IS-BAO auditor', 'Flight department'],
    templateLinks: [
      {
        label: 'IBAC IS-BAO',
        url: 'https://www.ibac.org/is-bao',
      },
    ],
  },
  'part-135-manual': {
    guidance:
      'The Part 135 Operations Manual covers air carrier or air taxi operations under 14 CFR Part 135. Obtain from the certificate holder\'s operations department.',
    sourceTypes: ['Operations department', 'Certificate holder', 'FAA-approved document archive'],
    templateLinks: [],
  },
  'part-121-manual': {
    guidance:
      'The Part 121 Operations Manual covers airline operations under 14 CFR Part 121. Obtain from the air carrier\'s operations or dispatch department.',
    sourceTypes: ['Air carrier operations', 'Dispatch department', 'FAA-approved document archive'],
    templateLinks: [],
  },
  'part-91-manual': {
    guidance:
      'The Part 91 Operations Manual covers general aviation operations. For IS-BAO and business aviation, obtain from the flight department or chief pilot.',
    sourceTypes: ['Flight department', 'Chief Pilot', 'IS-BAO consultant'],
    templateLinks: [],
  },
  // ── Supply chain & special processes ─────────────────────────────────
  'supplier-quality-plan': {
    guidance:
      'The Supplier Quality Assurance Plan (SQAP) defines how your organization qualifies, monitors, and audits suppliers. Include your Approved Suppliers List (ASL) and supplier audit records. Obtain from your supply chain or quality department.',
    sourceTypes: ['Supply chain / procurement', 'Quality department', 'AS9120 or AS9100 QMS'],
    templateLinks: [
      { label: 'AS9120 overview (SAE)', url: 'https://www.sae.org/standards/content/as9120/' },
    ],
  },
  'counterfeit-parts-procedure': {
    guidance:
      'The Counterfeit / Suspect Unapproved Parts (SUP) procedure documents your receiving inspection, approved source requirements, and disposition process per AS5553 and AS6174. Obtain from your quality or procurement department.',
    sourceTypes: ['Quality department', 'Procurement / supply chain', 'AS5553/AS6174 compliance program'],
    templateLinks: [
      { label: 'AS5553 overview (SAE)', url: 'https://www.sae.org/standards/content/as5553/' },
      { label: 'AS6174 overview (SAE)', url: 'https://www.sae.org/standards/content/as6174/' },
    ],
  },
  'special-process-procedure': {
    guidance:
      'Special process procedures cover welding, NDT (non-destructive testing), heat treatment, chemical processing, or other NADCAP-accredited processes. Obtain the approved procedure documents from your quality or engineering department.',
    sourceTypes: ['Quality / engineering department', 'NADCAP audit package', 'Process engineer'],
    templateLinks: [
      { label: 'NADCAP accreditation (PRI)', url: 'https://www.pri-network.org/NADCAP' },
    ],
  },
  'process-control-plan': {
    guidance:
      'The Process Control Plan (PCP) documents critical parameters, inspection gates, and control methods for manufacturing processes. Obtain from your engineering or quality department.',
    sourceTypes: ['Engineering department', 'Quality department', 'Manufacturing / production'],
    templateLinks: [],
  },
  // ── Defense & airworthiness ───────────────────────────────────────────
  'quality-management-plan': {
    guidance:
      'The Quality Management Plan (QMP) is the AS9100/AS9110 contract deliverable (CDRL) that describes your QMS implementation for a specific program. Obtain from your quality department or program management office.',
    sourceTypes: ['Quality department', 'Program management office (PMO)', 'DCMA-required CDRL'],
    templateLinks: [
      { label: 'AS9100 overview (SAE)', url: 'https://www.sae.org/standards/content/as9100/' },
    ],
  },
  'first-article-inspection': {
    guidance:
      'The First Article Inspection Report (FAIR) documents compliance of the first production part with all design and specification requirements per AS9102. Obtain from your quality or manufacturing engineering department.',
    sourceTypes: ['Quality / manufacturing engineering', 'Production control', 'DCMA FAIR records'],
    templateLinks: [
      { label: 'AS9102 overview (SAE)', url: 'https://www.sae.org/standards/content/as9102/' },
    ],
  },
  'certification-plan': {
    guidance:
      'The Certification Plan / Type Certification Basis defines the regulatory basis, means of compliance, and test and analysis program for your product certification. Obtain from your DER, ODA, or certification engineering team.',
    sourceTypes: ['DER / ODA / DAR', 'Certification engineering', 'FAA ACO project records'],
    templateLinks: [
      { label: 'FAA Certification info', url: 'https://www.faa.gov/aircraft/air_cert' },
      { label: 'FAA AC 21-40 (STC App Guide)', url: 'https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgAdvisoryCircular.nsf/0/32af4ec91e3af7d38625783600517791/$FILE/AC21-40B.pdf' },
    ],
  },
  'ica-document': {
    guidance:
      'Instructions for Continued Airworthiness (ICA) are required by 14 CFR §21.50 for type-certificated and STC\'d products. They include maintenance, inspection, and airworthiness limitation sections. Obtain from the type certificate or STC holder.',
    sourceTypes: ['TC / STC holder', 'DER / ODA', 'Aircraft manufacturer maintenance documentation'],
    templateLinks: [
      { label: '14 CFR §21.50 (eCFR)', url: 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-21/subpart-B/section-21.50' },
    ],
  },
  // ── Software & hardware assurance ─────────────────────────────────────
  'psac': {
    guidance:
      'The Plan for Software Aspects of Certification (PSAC) is the primary DO-178C planning document submitted to the FAA DER or ACO at SOI#1. It defines the software lifecycle, DAL, deviations, and additional considerations. Obtain from your software lead DER or certification team.',
    sourceTypes: ['Software DER / lead', 'Certification team', 'DAS (Design Approval Applicant)'],
    templateLinks: [
      { label: 'RTCA DO-178C info', url: 'https://www.rtca.org/products/do-178c/' },
    ],
  },
  'software-lifecycle-data': {
    guidance:
      'Software lifecycle plans include the Software Development Plan (SDP), Software Verification Plan (SVP), Software Configuration Management Plan (SCMP), and Software Quality Assurance Plan (SQAP). These define processes and environments used during development. Obtain from your software lead or configuration management team.',
    sourceTypes: ['Software lead / DER', 'Configuration management team', 'DO-178C lifecycle data package'],
    templateLinks: [],
  },
  'phac': {
    guidance:
      'The Plan for Hardware Aspects of Certification (PHAC) is the primary DO-254 planning document for complex electronic hardware (CEH). It defines the hardware lifecycle, DAL, and certification approach. Obtain from your hardware DER or certification team.',
    sourceTypes: ['Hardware DER / lead', 'Certification team', 'DAS (Design Approval Applicant)'],
    templateLinks: [
      { label: 'RTCA DO-254 info', url: 'https://www.rtca.org/products/do-254/' },
      { label: 'FAA AC 20-152A', url: 'https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgAdvisoryCircular.nsf/0/f1b7f9e6b97e09e086258755005da0f3/$FILE/AC%2020-152A.pdf' },
    ],
  },
  'hardware-design-records': {
    guidance:
      'Hardware design lifecycle records include the Hardware Accomplishment Plan (HAP), Hardware Design Document (HAD), Hardware Verification Plan (HVP), and Hardware Accomplishment Summary (HAS). Obtain from your hardware engineering or certification team.',
    sourceTypes: ['Hardware engineering', 'Certification team', 'DO-254 lifecycle data package'],
    templateLinks: [],
  },
  // ── Systems safety & environmental testing ────────────────────────────
  'system-safety-plan': {
    guidance:
      'The System Safety Program Plan (SSPP) and associated safety assessment documents (FHA, PSSA, SSA) define the safety assessment process per ARP4754A/ARP4761. For military, this is the SSPP per MIL-STD-882E. Obtain from your systems safety or certification team.',
    sourceTypes: ['Systems safety team', 'Certification team', 'DER / ODA systems safety'],
    templateLinks: [
      { label: 'ARP4754A overview (SAE)', url: 'https://www.sae.org/standards/content/arp4754a/' },
      { label: 'ARP4761 overview (SAE)', url: 'https://www.sae.org/standards/content/arp4761/' },
    ],
  },
  'hazard-analysis': {
    guidance:
      'Hazard analysis records include Fault Tree Analysis (FTA), Failure Mode and Effects Analysis (FMEA/FMECA), and Common Cause Analysis (CCA) worksheets. Obtain from your systems safety or reliability engineering team.',
    sourceTypes: ['Systems safety / reliability engineering', 'Certification team', 'FHA/PSSA/SSA package'],
    templateLinks: [],
  },
  'qualification-test-plan': {
    guidance:
      'The Environmental Qualification Test Plan defines the test categories, sequence, and acceptance criteria per DO-160G (airborne) or MIL-STD-810H (military). Obtain from your test engineering or product certification team.',
    sourceTypes: ['Test engineering', 'Product certification team', 'Test lab'],
    templateLinks: [
      { label: 'RTCA DO-160G info', url: 'https://www.rtca.org/products/do-160g/' },
    ],
  },
  'qualification-test-report': {
    guidance:
      'The Qualification Test Report documents test results, pass/fail determinations, and any anomalies for each DO-160G or MIL-STD-810H test category. Obtain from your test lab or test engineering team.',
    sourceTypes: ['Test lab (A2LA / NVLAP accredited preferred)', 'Test engineering', 'Product certification archive'],
    templateLinks: [],
  },
  // ── Space, cyber, UAS, lab, AM ────────────────────────────────────────
  'space-quality-plan': {
    guidance:
      'The Space Vehicle Quality Plan (SQAP) describes the quality assurance program for space hardware per AS9100D, ECSS-Q-ST-10, or NASA NPR 7120.5. Obtain from your program quality manager or space systems engineering team.',
    sourceTypes: ['Program quality manager', 'Space systems engineering', 'NASA / ESA customer requirements'],
    templateLinks: [
      { label: 'ECSS Standards', url: 'https://ecss.nl/standards/' },
      { label: 'NASA NPR 7120.5', url: 'https://nodis3.gsfc.nasa.gov/npg_img/N_PR_7120_005H_/N_PR_7120_005H_.pdf' },
    ],
  },
  'cybersecurity-plan': {
    guidance:
      'The Cybersecurity Management Plan or System Security Plan (SSP) documents your implementation of NIST SP 800-171 controls or CMMC practices and the safeguarding of CUI. Obtain from your IT security team or CMMC consultant.',
    sourceTypes: ['IT security / CISO', 'CMMC consultant', 'DFARS compliance program'],
    templateLinks: [
      { label: 'NIST SP 800-171', url: 'https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final' },
      { label: 'CMMC 2.0 info', url: 'https://www.acq.osd.mil/cmmc/' },
    ],
  },
  'conops-document': {
    guidance:
      'The Concept of Operations (ConOps) document describes the intended operational environment, mission profiles, and safety mitigations for UAS or eVTOL operations. For JARUS SORA, this is required for the Operational Safety Assessment. Obtain from your operations or flight certification team.',
    sourceTypes: ['Operations team', 'Flight certification engineer', 'JARUS SORA package'],
    templateLinks: [
      { label: 'JARUS SORA', url: 'http://jarus-rpas.org/publications' },
      { label: 'FAA Part 107 waivers', url: 'https://www.faa.gov/uas/commercial_operators/part_107_waivers' },
    ],
  },
  'calibration-procedures': {
    guidance:
      'Calibration procedures describe the step-by-step method for calibrating each measurement instrument type, including reference standards, environmental conditions, and acceptance criteria per ISO/IEC 17025 and ANSI Z540.3. Obtain from your calibration lab manager.',
    sourceTypes: ['Calibration lab manager', 'Quality department', 'ISO/IEC 17025 accreditation scope'],
    templateLinks: [
      { label: 'ISO/IEC 17025:2017', url: 'https://www.iso.org/standard/66912.html' },
      { label: 'ANSI Z540.3', url: 'https://webstore.ansi.org/standards/ncsl/ansiz5402006' },
    ],
  },
  'uncertainty-budget': {
    guidance:
      'The Measurement Uncertainty Budget documents the uncertainty contributors, combined standard uncertainty, and expanded uncertainty (k=2) for each measurement type per GUM (JCGM 100:2008) and ISO/IEC 17025 §7.6. Obtain from your metrology lead or calibration lab.',
    sourceTypes: ['Metrology lead', 'Calibration lab', 'ISO/IEC 17025 technical records'],
    templateLinks: [
      { label: 'JCGM 100:2008 (GUM)', url: 'https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf' },
    ],
  },
  'am-process-specification': {
    guidance:
      'The AM Process Specification or Build Traveler documents approved process parameters (laser power, scan speed, layer thickness, atmosphere), material specifications (SAE AMS), and post-processing requirements for each AM build. Obtain from your AM process engineer or materials team.',
    sourceTypes: ['AM process engineer', 'Materials / metallurgy team', 'SAE AMS7000-7004 compliance package'],
    templateLinks: [
      { label: 'SAE AMS7000 series', url: 'https://www.sae.org/standards/content/ams7000/' },
      { label: 'ASTM F3301 (AM PBF-LB metals)', url: 'https://www.astm.org/f3301-18.html' },
    ],
  },
  'powder-qualification': {
    guidance:
      'AM Powder Qualification Records include incoming lot certifications, particle size distribution (PSD) analysis, chemistry re-certification, and documented recycling limits per SAE AMS7002/7003 and MSFC-STD-3716. Obtain from your materials lab or AM quality team.',
    sourceTypes: ['Materials lab', 'AM quality team', 'Powder supplier certifications'],
    templateLinks: [
      { label: 'MSFC-STD-3716 (NASA)', url: 'https://standards.nasa.gov/standard/msfc/msfc-std-3716' },
    ],
  },
  // ── Catch-all ──────────────────────────────────────────────────────────
  'other': {
    guidance:
      'This document type is unclassified. Upload the document and use the "Ambiguous document mappings" section to assign it to the correct type.',
    sourceTypes: ['Internal document control', 'Quality department'],
    templateLinks: [],
  },
};

export function getAcquisitionGuidance(docType: KnownReferenceDocType): AcquisitionGuidance {
  const base = GUIDANCE_MAP[docType] ?? GUIDANCE_MAP['other'];
  return {
    docType,
    ...base,
    suggestedUploadCategory: suggestUploadCategoryForDocType(docType),
  };
}
