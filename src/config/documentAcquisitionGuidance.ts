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
