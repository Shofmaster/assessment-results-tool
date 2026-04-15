/**
 * adminSeedKB.ts
 *
 * Convex action: seedDefaultKB
 * Populates sharedAgentDocuments with curated regulatory reference content for all
 * 27 audit agents.  Each document is injected into the agent's system prompt via
 * buildRegulatoryEntitySection(), giving every auditor grounded, citation-ready
 * knowledge even before any PDFs are manually uploaded.
 *
 * Usage: called from AdminPanel "Seed Default KB" button (admin-only).
 * Safe to call multiple times — existing "generated" documents are cleared first.
 */

"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentSeedDoc {
  name: string;
  content: string;
}

// ─── Curated KB Content ───────────────────────────────────────────────────────

const AGENT_KB: Record<string, AgentSeedDoc[]> = {

  // ════════════════════════════════════════════════════════════════════════════
  // FAA INSPECTOR
  // ════════════════════════════════════════════════════════════════════════════
  "faa-inspector": [
    {
      name: "FAA Part 145 — Core Requirements Reference",
      content: `FAA REPAIR STATION REGULATORY REFERENCE (14 CFR Part 145)

=== CERTIFICATION & RATINGS ===
§145.53 – Ratings issued: airframe, powerplant, propeller, radio, instrument, accessory, limited
§145.55 – Each certificate must display: station name, certificate number, rating(s), expiration date
§145.57 – Amendments: notify FSDO 30 days before change to location, housing, facilities, equipment

=== PERSONNEL ===
§145.151 – Qualified personnel sufficient to perform, supervise, inspect, and approve for return to service
§145.153 – Supervisory personnel (DOM): shall have 18 months experience in the work being supervised; shall hold appropriate A&P if work requires it
§145.155 – Inspection personnel: shall meet §65.81 or have equivalent experience
§145.157 – Facility must have enough qualified personnel that work is not passed to untrained personnel
§145.163 – Training program required: initial, recurrent, and task-specific training; records retained 24 months

=== HOUSING & FACILITIES ===
§145.101 – Separate space required for: inspection, overhaul, parts storage, record storage
§145.103 – Facilities must be clean, organized, and of suitable size for the certificate held
§145.109 – Equipment: must have all tools, equipment, and test apparatus to perform all rated work

=== QUALITY CONTROL ===
§145.211 – Quality control system: written procedures for receiving inspection, in-process inspection, final inspection, acceptance test; records retained 2 years; must cover supplier surveillance
§145.213 – Inspector responsibilities: must inspect own work prohibited; independence maintained
§145.215 – Inspection of work: final release must be made by authorized inspector per the QCS

=== MAINTENANCE RECORDS ===
§145.219 – Maintenance records: must be legible, in English, describe work done, reference data used, identify who performed, and be signed; retained 2 years; Form 337 for major repairs/alterations
§145.221 – Records transfer: when aircraft returns to owner, transfer all applicable records

=== SUPPLY CHAIN ===
§145.206 – Hazardous materials: must have FAA-accepted hazmat program per 49 CFR 172.704 if applicable
§145.109(d) – Approved / acceptable data must be used; unapproved parts must be quarantined and reported

=== RETURN TO SERVICE ===
§145.201 – Only authorized person may approve for return to service; must hold appropriate certificate
§43.9 – Maintenance record content: description, reference data, method of compliance, name and cert number, date, signature
§43.13 – Performance rules: use manufacturer's current approved data or equivalent FAA-accepted data

=== TECHNICAL DATA ===
§145.109(a) – Current manufacturer maintenance manuals, IPC, SBs, ADs, and FAA approved data required
AD compliance: verify all applicable ADs are reflected in current maintenance data; check repetitive ADs

=== COMMON DISCREPANCIES ===
• Training records missing for specific task or not current (§145.163)
• Inspector approving own work (§145.213)
• Maintenance records missing required elements — no reference data cited (§43.9)
• Out-of-date maintenance manual revision on the floor
• No documented receiving inspection procedure (§145.211)
• Parts with no traceability / missing 8130-3 tags
• AD compliance not verifiable from records
• Calibration records expired or missing interval
• Repair station certificate not displayed (§145.55)
• Subcontractor not on approved vendor list / no sub-tier surveillance evidence`,
    },
    {
      name: "FAA Inspection Focus Areas & Common Finding Patterns",
      content: `FAA INSPECTION FOCUS AREAS

=== OPENING MEETING DOCUMENT CHECKLIST ===
Request immediately:
1. Current RSM (Repair Station Manual) with revision page
2. QCM (Quality Control Manual) with revision page
3. Training records for all personnel performing work
4. Current calibration status list
5. Approved Vendor / Supplier list
6. Certificate and ratings — verify alignment with current work scope
7. Current AD compliance matrix for aircraft/components in-shop
8. Open work orders with referenced data

=== RECORDS AUDIT APPROACH ===
Pull last 10 completed work orders. For each:
- Is referenced data current and FAA-approved?
- Is work signed off by authorized inspector?
- Are entries legible and in English?
- Are discrepancies properly documented and dispositioned?
- For major repairs: is Form 337 present? FAA-approved data attached?

=== TRAINING PROGRAM AUDIT ===
Cross-reference personnel on floor vs. training records:
- Initial training completed before independent work
- Recurrent training current (typically annual)
- Any new task-specific training documented
- OJT sign-off sheet present for apprentice-level work

=== TOOLING & CALIBRATION ===
Walk the floor, check 5-10 tools:
- Calibration label present and not expired
- Cal interval matches QCM
- Out-of-tolerance procedure: is there a documented impact assessment process?

=== PARTS TRACEABILITY ===
Inspect parts storage area:
- Serviceable tags on all serviceable parts
- Quarantine area segregated and locked
- Shelf-life items checked (O-rings, sealants, composites)
- No parts with only "company" or handwritten tags (need 8130-3 or FAA Form 337 / 8110-3)

=== SUBCONTRACTOR OVERSIGHT ===
- Is sub on approved vendor list?
- Was receiving inspection done on returned work?
- Sub's certificate/approval verified at last qualification?

=== AD COMPLIANCE (Aircraft in-shop) ===
- Pull aircraft records, verify current AD list (use FAA AD website)
- Check compliance method, date, and signatures for each recurring AD
- Verify time-limited components tracked against AD intervals

=== AIRCRAFT RETURNABLE RECORDS ===
Verify aircraft record package before release:
- Airworthiness limitations complied with
- 337 submitted to FAA (if major repair/alteration)
- Log entry per §43.9: description, data reference, method, cert number, date, signature`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // EASA INSPECTOR
  // ════════════════════════════════════════════════════════════════════════════
  "easa-inspector": [
    {
      name: "EASA Part-145 Core Requirements Reference",
      content: `EASA PART-145 APPROVED MAINTENANCE ORGANISATION REFERENCE

=== SCOPE ===
Commission Regulation (EU) No 1321/2014 Annex II (Part-145) — applies to AMOs in EU member states and third-country AMOs approved by EASA.

=== APPROVAL REQUIREMENTS ===
145.A.10 – Scope: work shall not exceed ratings held (A, B, C, D, E sub-categories for aircraft/components)
145.A.25 – Facilities: separate areas for maintenance and component work; clean working environment
145.A.30 – Personnel requirements:
  • Certifying Staff holding Part-66 licence with appropriate type/group ratings
  • Support Staff sufficient to accomplish work without shortcuts
  • Accountable Manager with direct responsibility to competent authority
  • Quality Manager, Maintenance Manager(s) independent of production
145.A.35 – Certifying staff and support staff: type training, OJT, and authorization documented per AMO Procedures Manual
145.A.42 – Components: acceptance and serviceable release; EASA Form 1 required for components; quarantine for unserviceable parts
145.A.45 – Maintenance data: current approved data; operator maintenance data per contract; procedure for handling data discrepancies
145.A.47 – Production planning: adequate supervision and task allocation
145.A.50 – Return to service: CRS (Certificate of Release to Service) issued only by authorised certifying staff
145.A.55 – Maintenance records: 3-year retention; work order complete with reference to approved data
145.A.60 – Occurrence reporting: reportable occurrences must go to competent authority within 72 hours
145.A.65 – Safety and quality policy: safety objectives, hazard reporting, non-punitive reporting culture
145.A.70 – AMO Procedures Manual (AMOM): kept current, accepted by authority, distributed to all personnel

=== COMMON EASA AUDIT FINDINGS ===
• Certifying Staff authorisation not current or scope exceeds licence
• Approved data not current — superseded revision on floor
• EASA Form 1 missing or incorrectly completed for component release
• Unreported occurrences (failure to report to EASA / NAA within 72 hrs)
• Subcontractor not on approved vendor list; no Part-145 or equivalent approval verified
• Training records incomplete — Part-66 continuation training not documented
• Safety reporting system (occurrence reports) not used; chilling effect from management
• CRS signed by person not on current authorisations list

=== KEY EASA vs FAA DIFFERENCES ===
• "CRS" (Certificate of Release to Service) = equivalent of FAA return to service signoff
• Part-66 licence = equivalent of FAA A&P certificate (but more granular)
• AMOM (AMO Manual) = equivalent of RSM
• EASA Form 1 = equivalent of FAA 8130-3
• Occurrence reporting threshold lower in EASA (72 hrs vs US voluntary)
• No US-style "Form 337" — equivalent data packages required but no single standard form

=== AUDIT DOCUMENTATION CHECKLIST ===
1. Current AMOM with EASA acceptance letter
2. Personnel authorisations list (Certifying Staff + Support Staff)
3. Part-66 licences for certifying staff with type ratings
4. Approved vendor list
5. Sample work orders with CRS
6. Component records with EASA Form 1
7. Quality audit schedule and recent findings
8. Occurrence report log`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // IS-BAO AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "isbao-auditor": [
    {
      name: "IS-BAO Standards — SMS & Stage Requirements Reference",
      content: `IS-BAO (INTERNATIONAL STANDARD FOR BUSINESS AIRCRAFT OPERATIONS) REFERENCE

=== OVERVIEW ===
IS-BAO 3rd Edition administered by IBAC. Three progressive implementation stages.
Standard is based on ICAO SMS framework (Doc 9859) adapted for business aviation operators.

=== FOUR SMS PILLARS ===
1. SAFETY POLICY & OBJECTIVES
   • Senior management safety commitment documented and communicated
   • Safety accountabilities defined (Accountable Executive, Safety Manager roles)
   • Emergency response plan (ERP) current and exercised

2. SAFETY RISK MANAGEMENT
   • Hazard identification system — reporting mechanisms available to all staff
   • Risk assessment methodology documented (severity × likelihood matrix)
   • Risk controls documented and verified effective
   • Change management process for operational changes

3. SAFETY ASSURANCE
   • Safety performance monitoring — leading and lagging indicators tracked
   • Internal audit/evaluation program — schedule and records
   • Management of change reviews documented
   • Continuous improvement cycle demonstrated

4. SAFETY PROMOTION
   • Safety training — initial and recurrent; records current
   • Safety communications — toolbox talks, bulletins, safety notices
   • Non-punitive reporting culture — Just Culture policy

=== STAGE REQUIREMENTS ===
STAGE 1: Document existing practices; assign SMS roles; establish hazard reporting
STAGE 2: Risk management processes operational; safety performance indicators established; audit program running; SMS training complete for key staff
STAGE 3: Proactive safety culture demonstrated; safety data-driven decisions; integration with industry safety programs (e.g., CAST, GAIN)

=== COMMON IS-BAO AUDIT FINDINGS ===
• Safety policy signed but not distributed or understood by line staff
• Hazard reports filed but no documented follow-up or risk assessment
• Emergency Response Plan exists but not exercised in past 12 months
• Safety Manager role filled but not trained in SMS fundamentals
• No safety performance indicators tracked (reactive only, no leading indicators)
• Change management not applied before adding new route/aircraft/operation
• Corrective actions from previous audit not closed
• Safety communications one-way only (no feedback loop)

=== DOCUMENTATION CHECKLIST ===
1. SMS Manual (includes all 4 pillars, scope, accountability chart)
2. Safety policy signed by Accountable Executive (dated within 2 years)
3. Hazard register / risk log — shows open and closed items
4. Emergency Response Plan — version, exercise record
5. Safety training records for all key personnel
6. Internal audit schedule and most recent audit report
7. Safety performance indicators dashboard / trend data
8. Part 91 operations manual or equivalent operational procedures`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // AS9100 AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "as9100-auditor": [
    {
      name: "AS9100D Quality Management System — Key Clause Reference",
      content: `AS9100 REVISION D (SAE AS9100D / EN 9100:2018) AUDIT REFERENCE

=== HIGH-RISK / FREQUENTLY NON-CONFORMING CLAUSES ===

§4.1 – Context of organization: documented internal/external issues; interested party requirements identified
§4.4 – QMS processes: process map documented; interactions defined; process owners assigned
§5.1 – Leadership: top management "taking accountability" for QMS effectiveness (not just awareness)
§5.2 – Quality policy: communicated, understood, measurable objectives linked
§6.1 – Risk management: risks identified, assessed (likelihood × severity), mitigation actions tracked — not just a list
§6.2 – Quality objectives: SMART, measured, communicated, reviewed; linked to § 6.1 risks
§7.1.5 – Measuring resources: calibration records traceable to national standard; calibration status on equipment; out-of-tolerance procedure documented
§7.2 – Competence: defined by role; training completed; effectiveness evaluated (not just attendance)
§7.4 – Communication: internal communication of quality issues and customer feedback
§8.1 – Operational planning: first article, configuration control, product acceptance criteria defined before work starts
§8.3 – Design & Development: only required when org does design; if exempt, state so in QMS scope
§8.4 – External providers (supply chain):
  • Approved Supplier List (ASL) maintained
  • Supplier evaluation, re-evaluation, and monitoring criteria documented
  • Flow-down of applicable requirements to sub-tiers including key characteristics
  • Counterfeit parts prevention (AS5553 / AS6174 reference)
  • Source inspection and/or delegation documented
§8.5.1 – Production controls: documented procedures; in-process verification points; first article inspection (FAIR)
§8.5.2 – Identification and traceability: unique identifiers throughout; configuration baseline
§8.5.3 – Property belonging to customers/external providers: receipt, storage, protection, reporting if lost/damaged
§8.6 – Release of products: conformance evidence retained; authorized release; retained records per 10 years or product life
§8.7 – Nonconforming outputs: Material Review Board (MRB); use-as-is/rework/scrap disposition authorized persons; notification to customer when required; suspect/unapproved parts quarantine
§9.1 – Monitoring and measurement: on-time delivery, first pass yield, DPPM tracked and reviewed
§9.2 – Internal audit: qualified internal auditors; risk-based schedule; records; management review input
§9.3 – Management review: inputs per standard; output decisions and actions with dates/owners
§10.2 – Nonconformity and corrective action: 8D or equivalent RCCA; escapes analyzed; effectiveness verification; lessons-learned shared

=== AS9100D UNIQUE REQUIREMENTS (vs ISO 9001) ===
• Configuration management (§8.5.2 extension)
• First article inspection (§8.5.1.1) — reference AS9102
• Key characteristics identification and control
• Product/process risk management integrated into planning (§6.1 + §8.1)
• Counterfeit parts controls (§8.1.4)
• Special requirements flow-down to sub-tier

=== COMMON AUDIT FINDINGS ===
• Risk register has risks listed but no mitigation actions or owners
• Training records show attendance only — no competence evaluation
• Calibration out-of-tolerance: no impact assessment on recent work
• ASL not re-evaluated annually as required
• Customer-specific requirements not flowed down to sub-tier suppliers
• Nonconformance records closed without evidence of RCCA effectiveness verification
• Management review meeting minutes lack output decisions with actionable items`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // NASA AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "nasa-auditor": [
    {
      name: "NASA Quality & Safety Standards Reference",
      content: `NASA QUALITY MANAGEMENT AND SAFETY AUDIT REFERENCE

=== KEY NASA STANDARDS ===
NPR 8730.5G – NASA Quality Assurance Program Requirements (prime contractor/supplier QA)
NPR 7120.5 – NASA Space Flight Program and Project Management Requirements
NPR 8715.3 – NASA General Safety Program Requirements
NASA-STD-8739.8 – Software Assurance and Software Safety Standard
NASA-STD-8739.9 – Recommended Standard for Workmanship (electromechanical)
MIL-STD-1540 – Environmental test requirements (commonly called out by NASA)
MSFC-STD-3029 / NASA-STD-5009 – NDE/NDT requirements

=== PARTS & MATERIALS ===
• EEE Parts: NASA-STD-8739.1 / MIL-PRF-19500 — Grade, lot traceability, radiation tolerance class
• Prohibited materials list: cadmium, tin whiskers risk (pure tin soldering)
• Shelf-life controls for adhesives, O-rings, lubricants — stricter than commercial

=== WORKMANSHIP ===
NASA-STD-8739.3 – Soldered electrical connections
NASA-STD-8739.4 – Crimping, interconnecting cables, harnesses, wiring
NASA-STD-8739.5 – Fiber optic terminations
IPC-A-610 Class 3 – Acceptability of electronic assemblies

=== RISK CLASSIFICATION ===
NASA uses 4-tier system per NPR 7120.5:
Class A (most critical) → Class D (least critical)
Higher class → more rigorous review gates, independent verification, full traceability

=== CONFIGURATION MANAGEMENT ===
• Baseline control: drawing/spec release via formal Engineering Change Request
• As-built vs. as-designed delta tracking
• Interface control documents (ICD) for subsystem boundaries

=== TEST & VERIFICATION ===
• Verification matrix: each requirement must be mapped to test, analysis, inspection, or similarity
• Environmental qualification: thermal vacuum, vibration, shock, EMI per mission environment
• Acceptance testing: 100% acceptance test for flight hardware (sampling not acceptable for Class A)

=== COMMON NASA AUDIT FINDINGS ===
• Requirements traceability matrix has gaps (requirements not assigned verification method)
• EEE parts used without NASA Part Approval Request (NPAR) when required
• Workmanship training not to latest revision of applicable standard
• Nonconformance (NCR) system not capturing all deviations — verbal dispositions used
• FRACAS (Failure Reporting, Analysis and Corrective Action System) data not analyzed for trends
• Independent technical review (peer review) records incomplete
• Software: FMEA not updated to reflect final design
• Shelf-life items used past expiration without documented re-qualification`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // SMS CONSULTANT
  // ════════════════════════════════════════════════════════════════════════════
  "sms-consultant": [
    {
      name: "SMS Implementation Guide — ICAO / FAA Framework",
      content: `SAFETY MANAGEMENT SYSTEM (SMS) CONSULTATION REFERENCE

=== ICAO FRAMEWORK (Doc 9859, 4th Edition) ===
SMS is mandatory for ICAO Annex 6/8/11/14/19 applicants.
Four Components, 12 Elements:

COMPONENT 1 — SAFETY POLICY & OBJECTIVES
  1.1 Management commitment and responsibility
  1.2 Safety accountabilities of managers
  1.3 Appointment of key safety personnel
  1.4 Coordination of emergency response planning
  1.5 SMS documentation

COMPONENT 2 — SAFETY RISK MANAGEMENT
  2.1 Hazard identification
  2.2 Safety risk assessment and mitigation

COMPONENT 3 — SAFETY ASSURANCE
  3.1 Safety performance monitoring and measurement
  3.2 The management of change
  3.3 Continuous improvement of the SMS

COMPONENT 4 — SAFETY PROMOTION
  4.1 Training and education
  4.2 Safety communication

=== FAA AC 120-92B ===
FAA's SMS guidance for aviation service providers. Requires:
• Gap analysis against AC 120-92B Appendix 3 before rollout
• Phased implementation (Phase 1-4 per AC)
• Safety Performance Indicators (SPIs) and Safety Performance Targets (SPTs)
• Voluntary safety reporting program (ASAP preferred for air carriers)

=== RISK MATRIX (STANDARD) ===
Severity × Likelihood → Risk Index
Severity: Catastrophic (5), Hazardous (4), Major (3), Minor (2), Negligible (1)
Likelihood: Frequent (5), Occasional (4), Remote (3), Improbable (2), Extremely Improbable (1)
Risk Index ≥ 16 → Unacceptable; 10-15 → Tolerable with mitigation; <10 → Acceptable

=== SMS MATURITY LEVELS ===
Level 1 – Reactive (respond to accidents)
Level 2 – Compliant (meet minimum requirements)
Level 3 – Proactive (identify hazards before incidents)
Level 4 – Predictive (model risk, continuous improvement culture)

=== GAP ANALYSIS AREAS ===
• Is safety reporting system truly non-punitive? (track submission rate, types)
• Are hazards from reports actually risk-assessed and tracked to closure?
• Are safety performance indicators reviewed at management level regularly?
• Is ERP tested/exercised? Who is the emergency coordinator?
• Do front-line staff know how to submit a safety report?
• Are lessons learned from industry events (SDRs, ASAPs, ASRS) reviewed?

=== COMMON SMS IMPLEMENTATION FAILURES ===
• SMS manual created but not understood or used by operations personnel
• Hazard reporting exists on paper but reports sit unactioned
• Safety Manager has no authority or budget to implement corrective actions
• SPIs only track lagging indicators (accidents, incidents) — no leading indicators
• No Just Culture policy — staff fear discipline for honest reports
• ERP never tested — tabletop exercise not conducted in 12+ months
• Training compliance tracked, not knowledge retention or behavioral change
• SMS not integrated into operational decision-making (e.g., irregular ops, new routes)`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // SAFETY AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "safety-auditor": [
    {
      name: "Aviation Safety Audit Reference — Operational Safety",
      content: `AVIATION OPERATIONAL SAFETY AUDIT REFERENCE

=== KEY REGULATIONS ===
14 CFR Part 91 (General Operating and Flight Rules)
14 CFR Part 135 (Air Taxi & Commercial Operations)
14 CFR Part 121 (Air Carrier Operations)
FAA AC 120-92B (SMS for Aviation Service Providers)
FAA AC 150/5200-37 (Safety Management Systems for Airports)

=== MEL / CDL COMPLIANCE ===
• MEL based on FAA/EASA-approved MMEL — must not be less restrictive
• MEL dispatch authorization must be signed by qualified crew
• Maintenance actions required by MEL completed within time limits
• CDL items tracked and cleared at next available maintenance opportunity

=== OPERATIONAL RISK FACTORS ===
• CRM training — initial and recurrent (annual), records current
• LOSA/FOQA/ASAP safety data programs if applicable
• Fatigue Risk Management (FRMS) if operating under extended duty rules
• Weather decision-making authority and minimum weather criteria documented
• HAZMAT / Dangerous Goods training for ground/cabin staff

=== COMMON OPERATIONAL SAFETY FINDINGS ===
• MEL item dispatched past time limit without extension authorization
• Duty time limits exceeded without proper FRMS or rest documentation
• Emergency equipment not current (ELT battery expiry, life vest inspection)
• Crew not briefed on MEL restrictions in effect
• HAZMAT training lapsed for ramp/ground staff handling cargo
• No fatigue reporting mechanism or reports not reviewed by safety
• Near-miss / incident not reported to safety office within required timeframe
• Checklists being read from memory rather than printed/electronic version

=== SAFETY AUDIT CHECKLIST ===
□ MEL document — current MMEL revision, FAA-accepted, operator-specific items
□ Crew records — PIC/SIC currency, medical, training completion
□ Emergency equipment — ELT, life vests, fire extinguishers, O2, current
□ Aircraft records — weight & balance current, AFM current, AD compliance
□ Dispatch release process — who has authority, weather minima source
□ Safety reporting log — number of reports, response time, action closure
□ Occurrence report log — reports to FAA, NTSB, insurance as required
□ Drug & alcohol testing program records (random testing compliance)`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // SUPPLY CHAIN AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "supply-chain-auditor": [
    {
      name: "Supply Chain & Counterfeit Parts Audit Reference",
      content: `AVIATION SUPPLY CHAIN QUALITY AUDIT REFERENCE

=== KEY STANDARDS ===
AS9100D §8.4 – Control of Externally Provided Processes, Products and Services
AS9120B – Quality Management Systems for distributors
SAE AS5553 – Counterfeit Electronic Parts; Avoidance, Detection, Mitigation, and Disposition
SAE AS6174 – Counterfeit Materiel; Avoidance, Detection, Mitigation, and Disposition (non-electronic)
SAE AS6081 – Fraudulent/Counterfeit Electronic Parts: Avoidance, Detection, Mitigation... (distributors)
DFAR 252.246-7007 – DoD Counterfeit Prevention (US Government contracts)

=== APPROVED SUPPLIER LIST (ASL) ===
• ASL maintained and reviewed at least annually
• Supplier evaluation criteria defined: quality history, on-time delivery, financial stability, approvals
• New supplier approval process documented (survey, qualification audit, sample inspection)
• Sub-tier supplier requirements flowed down from prime
• Supplier rating system used to prioritize surveillance and re-evaluation

=== RECEIVING INSPECTION ===
• Inspection procedures cover: documentation review, physical inspection, certificate of conformance (CoC)
• Traceability check: each part lot traceable to manufacturer via unbroken chain
• Part number, revision, and quantity verification
• Certificate of Conformance content requirements: part number, quantity, specification, authorized signature
• EASA Form 1 or FAA 8130-3 required for regulated articles

=== COUNTERFEIT PARTS PREVENTION ===
• Authorized distribution channels preferred (OEM, OEM-authorized distributors)
• Independent distributors require documented risk mitigation
• Inspection methods for suspect parts: visual (AS6171), X-ray, acetone test, electrical test
• Suspected Unapproved Parts (SUP) / counterfeit — report to FAA SUSPA (888-432-7287)
• Quarantine and disposition process for identified counterfeits (destroy, return, report)

=== SPECIAL PROCESSES IN SUPPLY CHAIN ===
• NADCAP approval required for welding, NDT, heat treatment, plating, composites at many primes
• Special process procedure review — is the sub's procedure current and authorized?
• Process capability data (Cp/Cpk) reviewed for critical characteristics

=== COMMON SUPPLY CHAIN AUDIT FINDINGS ===
• ASL not updated after supplier performance issue
• Receiving inspection completed but no records retained
• CoC missing required elements (lot number, specification, signature)
• Broker/distributor used without independent verification of part authenticity
• No counterfeit detection procedure beyond visual inspection
• Shelf-life not tracked for elastomers, adhesives, composites from sub-tier
• Sub-tier supplier not required to flow down customer-specific requirements
• No process to identify and segregate suspect unapproved parts found in-shop`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // NADCAP AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "nadcap-auditor": [
    {
      name: "NADCAP Special Processes Audit Reference",
      content: `NADCAP SPECIAL PROCESSES AUDIT REFERENCE
(Performance Review Institute / SAE PRI)

=== SCOPE OF NADCAP ===
NADCAP accreditation required for aerospace special processes in most prime contractor supply chains.
Commodity codes: AC7004 (NDT), AC7108 (Heat Treat), AC7110 (Chemical Processing/Plating), AC7114 (Welding), AC7118 (Composites), AC7117 (Fluid Distribution Systems), AC7101 (Electronics), AC7004 (Non-Destructive Testing)

=== GENERAL REQUIREMENTS (all NADCAP commodities) ===
• Procedure control: procedures per customer/prime requirements; current revision; controlled distribution
• Process control: process parameters within specified limits; monitoring/recording equipment calibrated
• Personnel qualification: operators qualified per applicable standard (NAS 410 for NDT, AWS for welding, etc.)
• Equipment calibration: traceability to NIST; calibration records; out-of-tolerance impact assessment
• First Article / Process Verification: independent verification of process output before production
• Non-conformance control: NCR system; MRB authority; customer notification requirement
• Merits / Demerit system: NADCAP uses merit-based audit interval (18-24 months for good performers)

=== NDT (AC7004) SPECIFIC ===
• Operator qualification: NAS 410 Level II or III; re-qualification interval; documented
• Written practice per SNT-TC-1A or NAS 410
• Procedure qualification: technique sheets with parameters (sensitivity, coverage, equipment)
• Equipment calibration: daily/per-shift checks per procedure; film chemistry if applicable
• Reference standards: calibration blocks, wire IQIs — current and traceable
• Film/digital image storage and retrieval

=== HEAT TREATMENT (AC7108) SPECIFIC ===
• AMS 2750 pyrometry: thermocouple type, TUS (Temperature Uniformity Survey), SAT (System Accuracy Test)
• Load thermocouple placement documented
• Furnace qualification for temperature range
• Atmosphere control for non-oxidizing processes
• Quench media temperature/agitation monitoring

=== WELDING (AC7114) SPECIFIC ===
• WPS (Welding Procedure Specification) per AWS D17.1 or equivalent
• PQR (Procedure Qualification Record) on file
• Welder qualification: current certification, re-qualification if lapse >6 months
• Filler material certification: C of C, heat number, shelf-life

=== CHEMICAL PROCESSING / PLATING (AC7110) SPECIFIC ===
• Bath chemistry control: titration frequency, limits, corrective action
• Rack/barrel load documentation
• Pre-treatment process steps documented and verified
• Hydrogen embrittlement relief: bake cycle per specification

=== COMMON NADCAP FINDINGS ===
• Operator qualification expired or not per written practice
• Process parameter out of specification — no documented corrective action
• Calibration of test equipment expired
• Technique sheet references superseded specification
• Furnace TUS out of compliance — not re-surveyed after modification
• Chemical bath out of tolerance — no immediate corrective action documented`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // DEFENSE AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "defense-auditor": [
    {
      name: "Defense Aerospace Quality Audit Reference (AS9100D + DCMA)",
      content: `DEFENSE AEROSPACE QUALITY AUDIT REFERENCE

=== APPLICABLE STANDARDS ===
AS9100D – QMS requirements for aviation, space, defense
MIL-Q-9858A / MIL-I-45208 – Legacy DOD quality standards (still cited in many contracts)
DFAR 252.246-7007 – Counterfeit Electronic Parts Avoidance
DFAR 252.204-7012 – Safeguarding Covered Defense Information (cybersecurity)
DCMA-INST-201 – DCMA Quality Assurance Surveillance
ITAR (22 CFR 120-130) – International Traffic in Arms Regulations
EAR (15 CFR 730-774) – Export Administration Regulations

=== FIRST ARTICLE INSPECTION (FAI) ===
AS9102 / SAE AS9102B requirements:
• FAIR required for first production unit, after engineering change, after lapse of 2+ years
• Three documentation sections: Design Documentation Package, Material and Process Review, Functional Test Results
• FAIR sign-off by authorized quality representative
• Balloon drawing with ballooned dimensions matching FAIR report
• All dimensions and tolerances recorded (not just pass/fail)

=== QUALITY MANAGEMENT PLAN (QMP) ===
Required for most defense contracts:
• Identifies applicable QMS standard (AS9100D or MIL-Q-9858A)
• Defines inspection points: receiving, in-process, final
• Identifies key characteristics and control methods
• Corrective action response time commitments

=== GOVERNMENT PROPERTY ===
• Customer-furnished equipment (CFE/GFE) tracked separately
• Usage, maintenance, and return documented
• Lost/damaged/stolen GFE reported per contract

=== ITAR / EAR COMPLIANCE ===
• Technology control plan implemented
• Visitor access controls for restricted areas
• Export license required before sharing technical data with foreign nationals
• ITAR registration current with DDTC

=== DCMA FOCUS AREAS ===
• Deficiency notification response and closure timelines
• Corrective Action Plans (CAPs) submitted and closed on time
• Surveillance plan compliance (DCMA visits and records)
• System effectiveness reviews (SER) for recurring problems

=== COMMON DEFENSE AUDIT FINDINGS ===
• FAIR not updated after drawing revision
• Key characteristics not identified in production travelers
• Supplier not on ASL — sole source used without risk assessment
• ITAR visitor logs incomplete or not maintained
• Counterfeit prevention plan references obsolete AS5553 revision
• CAP responses to DCMA findings past due
• Government property record not current or audited annually`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // AIRWORTHINESS AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "airworthiness-auditor": [
    {
      name: "Type Certification & ICA Airworthiness Audit Reference",
      content: `AIRWORTHINESS CERTIFICATION & ICA AUDIT REFERENCE

=== TYPE CERTIFICATION (TC) PROCESS ===
14 CFR Part 21, Subpart B
• Certification Basis: FAR/EASA CS applicable at application date + special conditions
• Means of Compliance (MoC): analysis, test, inspection, similarity — documented per type
• Conformity inspections: FAA/DER witnesses first article + test articles
• TC Data Sheet: defines certification basis, limitations, TCDS amendments
• Amended TC / STC: applicable for derivative designs / major modifications

=== INSTRUCTIONS FOR CONTINUED AIRWORTHINESS (ICA) ===
14 CFR §21.50 / Appendix H to Parts 23/25/27/29
• ICAs are part of the TC — mandatory for products requiring TC
• Must include: airworthiness limitations, scheduled maintenance, servicing info, troubleshooting, repair procedures
• Airworthiness Limitations Section (ALS): FAA-approved content; cannot be deviated without FAA approval
• ICA must be available to operators before first delivery
• Amendments to ICA require FAA approval if ALS content changes

=== DESIGNATED ENGINEERING REPRESENTATIVE (DER) ===
• DER authority defined in DER appointment letter
• Data approved by DER has same authority as FAA-approved data
• ACO oversight — DER findings go to respective Aircraft Certification Office
• DER authorization function codes must match data being approved

=== FAA FORM 8110-3 ===
• Used when DER approves data on behalf of FAA
• Specifies: type design, certification basis, method of compliance, any limitations
• Field approvals (Form 337) not appropriate for type design data

=== SUPPLEMENTAL TYPE CERTIFICATE (STC) ===
14 CFR Part 21, Subpart E
• STC holder responsible for ICA for modified portion
• Compatibility with existing TC ICA must be demonstrated
• STC holder must provide all operators with current ICA

=== COMMON AIRWORTHINESS AUDIT FINDINGS ===
• ICA not current — no amendment process to incorporate service experience
• ALS life limits not reflected in maintenance tracking system
• DER-approved data used beyond DER's authorized function codes
• STC ICA not provided to all operators with installed modification
• Form 337 used for data that should be DER-approved per TC
• Certification test reports not retained in permanent TC data package
• Software: PSAC/SAS not updated to reflect final software baseline
• Hardware changes after qualification test not re-evaluated under DO-254`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // DO-178C AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "do178c-auditor": [
    {
      name: "DO-178C Software Assurance Audit Reference",
      content: `RTCA DO-178C / EUROCAE ED-12C AIRBORNE SOFTWARE ASSURANCE REFERENCE

=== DAL LEVELS & OBJECTIVES ===
DAL A (Catastrophic failure effect): 71 objectives — 43 with Independence
DAL B (Hazardous failure effect): 69 objectives — 26 with Independence
DAL C (Major failure effect): 62 objectives — 5 with Independence
DAL D (Minor failure effect): 26 objectives — 0 with Independence
DAL E: No software assurance required

=== PLAN FOR SOFTWARE ASPECTS OF CERTIFICATION (PSAC) ===
PSAC submitted to ACO/EASA before significant software development begins.
Required content per §11.1:
• System overview and software overview
• Certification basis (certification basis docs cited)
• Software level (DAL) for each function
• Software lifecycle overview (waterfall, agile, etc.)
• Software environment (tool qualification per §12)
• PSAC revision with each major plan update

=== KEY LIFECYCLE DATA ===
Software Development Plan (SDP) – §11.2: development standards, build environment
Software Verification Plan (SVP) – §11.3: test levels, independence requirements
Software Configuration Management Plan (SCMP) – §11.4: baseline, change control, archival
Software Quality Assurance Plan (SQAP) – §11.5: QA activities, non-compliance authority
Software Requirements Standards – §11.6
Software Design Standards – §11.7
Software Coding Standards – §11.8

=== VERIFICATION OBJECTIVES (critical §6 objectives) ===
§6.4.3.1 – Test coverage: statement coverage (DAL C), decision coverage (DAL B), MC/DC (DAL A)
§6.4.4 – Independence: reviewer different from developer for DAL A/B
§6.4.2.4 – Robustness testing: including boundary conditions, invalid inputs
§6.4.3 – Structural coverage analysis: demonstrate test adequacy

=== TOOL QUALIFICATION (§12) ===
• TQL-1 to TQL-5 based on failure category and usage
• Tool Qualification Plan (TQP), Tool Operational Requirements (TOR), Tool Accomplishment Summary (TAS)
• Compiler, linker: qualify as TQL-4 or use qualified tool list (QTL)

=== CONFIGURATION MANAGEMENT ===
• Software Problem Reports (SPRs) for all discovered defects — traceability to resolution
• Software Configuration Index (SCI) / Software Accomplishment Summary (SAS) for final baseline
• All lifecycle data under CM before completion

=== SUPPLEMENTS ===
DO-330 (Tool Qualification), DO-331 (Model-Based Development), DO-332 (OOT), DO-333 (Formal Methods)

=== COMMON DO-178C AUDIT FINDINGS ===
• PSAC not updated to reflect actual development lifecycle used
• Test cases not traced to software requirements (gaps in coverage matrix)
• MC/DC coverage not achieved for DAL A — missing pair analysis
• Tool used in development without TQP or documented qualification rationale
• Independence not maintained — developer reviewing own verification results
• SPRs not linked to test case re-execution after fix
• Compiler/linker outputs not baseline-controlled
• SAS missing required sections (especially §11.9 field: problem reports status)`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // DO-254 AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "do254-auditor": [
    {
      name: "DO-254 Hardware Design Assurance Audit Reference",
      content: `RTCA DO-254 / EUROCAE ED-80 AIRBORNE ELECTRONIC HARDWARE ASSURANCE REFERENCE

=== DESIGN ASSURANCE LEVELS ===
DAL A (Catastrophic): independent verification required for all design processes
DAL B (Hazardous): independent verification required for most design processes
DAL C (Major): independent verification for specific processes
DAL D (Minor): basic design assurance processes; independence not required
Level E: No hardware design assurance required

=== PLAN FOR HARDWARE ASPECTS OF CERTIFICATION (PHAC) ===
Required content (§10.1):
• System overview and hardware function identification
• Hardware level (DAL) assignments with FHA traceability
• Development and validation standards
• Additional considerations (COTS, previously developed hardware)
• PHAC updated as design matures

=== HARDWARE DESIGN LIFECYCLE DATA ===
Hardware Accomplishment Summary (HAS) – §10.6: final compliance evidence summary
Hardware Design Plan (HAP) – §10.2: development lifecycle, standards
Hardware Verification Plan (HVP) – §10.3: verification activities and independence
Hardware Configuration Management Plan (HCMP) – §10.4
Hardware Process Assurance Plan (HPAP) – §10.5: QA activities

=== REQUIREMENTS CAPTURE & VALIDATION ===
§4.0 – Hardware requirements development: derived requirements identified and fed back to system safety
§5.0 – Conceptual design: alternate design considerations documented
§6.0 – Detailed design: HDL (VHDL/Verilog) for programmable devices; design traceability

=== PROGRAMMABLE LOGIC (CPLD/FPGA) ===
Additional guidance per AC 20-152A:
• Intellectual property (IP) core qualification
• HDL coding standards and metrics
• Design coverage analysis (functional, toggle, statement)
• Back-annotation simulation required for timing analysis

=== VERIFICATION ===
§6.1 – Validation of requirements (correct and testable?)
§7.0 – Testing: bench test, functional test, environmental test (DO-160G)
§7.0 – Coverage: functional verification coverage mapped to requirements
Independence: reviewer ≠ designer for DAL A/B

=== COTS HARDWARE USAGE ===
AC 20-152A provides guidance:
• Safety assessment of COTS failures
• COTS vendor support agreement / obsolescence risk
• Acceptance test criteria

=== COMMON DO-254 AUDIT FINDINGS ===
• PHAC DAL assignment not traceable to system FHA
• Derived requirements from hardware not fed back to system safety assessment
• FPGA design coverage analysis missing for DAL A functions
• IP cores used without qualification or safety assessment
• Verification plan shows no independence for DAL B design reviews
• HAS not updated to reflect design changes after initial approval
• Environmental qualification tests (DO-160G) not tied to PHAC requirements
• COTS components used in DAL A/B function without failure mode assessment`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // SYSTEMS SAFETY AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "systems-safety-auditor": [
    {
      name: "ARP4761 Systems Safety Process Audit Reference",
      content: `SAE ARP4761A GUIDELINES FOR CONDUCTING SAFETY ASSESSMENT PROCESS REFERENCE

=== SAFETY ASSESSMENT HIERARCHY ===
FHA (Functional Hazard Assessment)
  └→ Assigns failure condition classifications to aircraft-level functions
  └→ Classifications: Catastrophic, Hazardous, Major, Minor, No Safety Effect

PSSA (Preliminary System Safety Assessment)
  └→ Identifies how system failures can cause FHA failure conditions
  └→ Establishes safety requirements / allocation to systems and items
  └→ Develops preliminary FTA and FMEA

SSA (System Safety Assessment)
  └→ Verifies that implemented design satisfies safety requirements from PSSA
  └→ Includes final FTA, FMEA, CCA
  └→ Combined assurance summary showing closure of all FHA items

=== FAULT TREE ANALYSIS (FTA) ===
• Top event = failure condition from FHA (e.g., "loss of thrust control")
• Quantitative targets per §25.1309: Catastrophic ≤ 10⁻⁹/FH, Hazardous ≤ 10⁻⁷/FH
• AND gates require all inputs to be independent (verified by CCA)
• Common cause analysis (CCA): zonal analysis, particular risk analysis, CMA
• Generic failure rates: NPRD-16 (non-electronic) / MIL-HDBK-217 (electronic)
• Exposure time assumptions documented and consistent

=== FMEA / FMECAS ===
• Each failure mode identified with failure rate, mission phase, effect (local/system/aircraft)
• Independence assumed between items must be verified by CCA
• Latent failure exposure time analysis for hidden failures
• Maintenance intervals derived from latent failure analysis

=== COMMON CAUSE ANALYSIS (CCA) ===
• Zonal Safety Analysis (ZSA): installation proximity, shared services
• Particular Risk Analysis (PRA): bird strike, engine burst, lightning, HIRF, fire
• Common Mode Analysis (CMA): single design error affecting multiple independent paths

=== AIRWORTHINESS CRITERIA ===
§25.1309 / CS 25.1309 — failure condition classifications and quantitative targets
AC 25.1309-1A — Acceptable means of compliance
AMC 25.1309 — EASA guidance

=== COMMON SYSTEMS SAFETY AUDIT FINDINGS ===
• FHA failure condition classifications not justified with system context
• PSSA safety requirements not traceable to FHA failure conditions
• FTA assumes independence that CCA does not verify
• Generic failure rate data source not cited (which edition of NPRD/MIL-HDBK?)
• Latent failure exposure time longer than maintenance check interval allows
• Common cause event (e.g., lightning strike) not included in PRA
• SSA not updated after design changes — stale analysis presented
• Safety requirements not traced to implementation (no Requirements Verification Matrix)`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // DO-160 AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "do160-auditor": [
    {
      name: "RTCA DO-160G Environmental Qualification Test Audit Reference",
      content: `RTCA DO-160G / EUROCAE ED-14G ENVIRONMENTAL CONDITIONS AND TEST PROCEDURES REFERENCE

=== OVERVIEW ===
DO-160G provides standardized test conditions for airborne equipment.
Equipment is assigned categories (A, B, C, etc.) per section based on installation environment.

=== KEY TEST CATEGORIES ===
Section 4  – Temperature & Altitude
  Cat A1: Ground survival -55°C to +70°C, operating -15°C to +55°C
  Cat D2: Severe high altitude, operating to 55,000 ft

Section 5  – Temperature Variation (thermal shock, 5°C/min rate)
Section 6  – Humidity (condensing, Category A: 95% RH, 48 hrs)
Section 7  – Operational Shocks and Crash Safety (15g/50ms half-sine for crash)
Section 8  – Vibration
  Cat S (sine): 5-2000 Hz sweep; Cat R (random): PSD spectrum per installation zone
  Cat U: Helicopter vibration (bimodal random)
Section 9  – Explosion Proofness (for fuel tank areas)
Section 10 – Waterproofness (drip, rain, splash)
Section 11 – Fluids Susceptibility (hydraulic, fuel, oils — immersion/spray)
Section 12 – Sand and Dust
Section 13 – Fungus Resistance
Section 14 – Salt Spray (corrosion)
Section 15 – Magnetic Effect (< 0.3° deviation at compass location)
Section 16 – Power Input (voltage/frequency range, transients, interruptions)
Section 17 – Voltage Spike (±600V transients)
Section 18 – Audio Frequency Conducted Susceptibility (power leads)
Section 19 – Induced Signal Susceptibility (crosstalk)
Section 20 – Radio Frequency Susceptibility (RS/CS per level A-Y)
Section 21 – Emission of Radio Frequency Energy (RE, CE)
Section 22 – Lightning Induced Transient Susceptibility (waveform set 1, 2, 3, 4, 5A, 5B)
Section 23 – Lightning Direct Effects (zone 1A–3 attachment per AC 20-136)
Section 24 – Icing (1 mm ice at −10°C)
Section 25 – Electrostatic Discharge (ESD), IEC 61000-4-2 levels
Section 26 – Fire, Flammability (VBF-1, not all equipment required)
Section 27 – Freezing Rain

=== TEST QUALIFICATION BASIS ===
• Equipment Qualification Test Plan (EQTP) defines: category selections, test sequence, sample sizes, acceptance criteria
• Test Procedure compliance report (per section)
• EMC — HIRF categories per DO-160 Table 20-1; equipment must withstand 100 V/m (external HIRF envelope)
• Lightning: equipment in zones 1A/1B/2A/2B requires DO-160 Section 22/23 testing

=== AUDIT FOCUS AREAS ===
• EQTP approved before testing begins?
• Category selections justified by aircraft installation environment analysis
• Same article tested as production configuration? Part number / revision locked
• Test anomalies documented and dispositional; re-test after design change
• EMC test lab accredited (ANSI/NCSL Z540 or ISO/IEC 17025)?
• Report includes equipment operating status during environmental exposure

=== COMMON DO-160 AUDIT FINDINGS ===
• Category selected too benign for actual installation zone
• EQTP not revision-controlled — categories changed after testing began
• Anomalies during test not documented as Problem Reports
• Equipment configuration changed after qualification — new test not performed
• EMC test data missing for selected Level (e.g., Cat M requires Section 20 Level M)
• Lightning strike zone analysis absent — zone assumed rather than analyzed
• Test lab not ISO 17025 accredited for all test categories performed`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // SPACE SYSTEMS AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "space-systems-auditor": [
    {
      name: "Space Vehicle Quality Assurance Audit Reference",
      content: `SPACE SYSTEMS QUALITY ASSURANCE AUDIT REFERENCE

=== KEY STANDARDS ===
AS9100D + Space Additions (SQA clauses per IAQG 9100 Space)
ECSS-Q-ST-10C – Quality Assurance (ESA/European framework)
ECSS-Q-ST-20C – Parts, materials, and processes
NASA-STD-8730.5G – NASA Quality Assurance Program Requirements
MIL-STD-1540 – Product Verification Requirements for Launch, Upper Stage, and Space Vehicles
MIL-HDBK-17 – Composite Materials Handbook (often called out for space structure)

=== PRODUCT ASSURANCE CLASSIFICATIONS ===
NASA Class A (mission success critical) → highest assurance, 100% acceptance testing, full traceability
NASA Class B → significant design margins, detailed verification
NASA Class C → cost-effective missions; some risk accepted
Class D → rapid development, high tolerance for failure

=== EEE PARTS ===
• MIL-PRF-19500 (transistors), MIL-PRF-38535 (ICs) — grade Q or S for Class A/B
• Upscreening of COTS parts documented; test data retained
• Radiation hardness assurance: TID, SEE, TNID levels per mission
• Derating requirements: voltage, current, temperature derate factors per design rules
• Prohibited materials: pure tin (tin whisker), cadmium (outgassing), halogenated compounds

=== FRACAS (Failure Reporting, Analysis & Corrective Action System) ===
• All failures from component level through system test captured in FRACAS
• Root cause analysis (RCA) for every anomaly
• Corrective action tracked to closure with effectiveness verification
• Trend analysis: Pareto of failure modes reviewed at program milestones

=== CONFIGURATION MANAGEMENT ===
• Engineering Development Model (EDM) → Structural Model (SM) → Protoflight Model (PFM) → Flight Model (FM) baseline control
• Drawing release authority: first use of each drawing requires formal approval
• Flight vs. ground support equipment (GSE) configuration separation

=== MATERIALS & PROCESSES ===
• Materials and Process specification per ECSS-Q-ST-70 series or JPL D-5703
• Outgassing qualification (ASTM E595): TML ≤ 1.0%, CVCM ≤ 0.1%
• Cleanliness: ISO 14644 cleanroom class per assembly criticality

=== COMMON SPACE AUDIT FINDINGS ===
• EEE parts procured without lot testing or upscreening documentation
• Radiation environment not analyzed — total ionizing dose not budgeted
• FRACAS anomaly closed without root cause — "no reoccurrence observed"
• Prototype-to-flight configuration delta not tracked
• Outgassing test results missing for non-metallic materials in sealed cavity
• Configuration audit (FCA/PCA) not completed before launch
• Derating analysis references superseded design rules document`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // CYBERSECURITY AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "cybersecurity-auditor": [
    {
      name: "Aviation Cybersecurity Audit Reference",
      content: `AVIATION CYBERSECURITY AUDIT REFERENCE

=== KEY STANDARDS ===
RTCA DO-326A / EUROCAE ED-202A – Airworthiness Security Process Specification
RTCA DO-356A / EUROCAE ED-203A – Airworthiness Security Methods and Considerations
FAA AC 119-1 – Airworthiness and Operational Approval of Aircraft Network Systems (ANS)
NIST SP 800-171 Rev 2 – Protecting CUI in Non-Federal Systems (DoD contracts)
CMMC 2.0 – Cybersecurity Maturity Model Certification (Level 1, 2, or 3)
DFAR 252.204-7012 – Safeguarding Covered Defense Information

=== AVIATION CYBERSECURITY FRAMEWORK (DO-326A) ===
• ASSAP (Airworthiness Security Scope Assessment Plan)
• ASAP (Airworthiness Security Assessment Plan)
• Security evaluation / penetration testing
• SRPP (Security Risk Profile Plan)
• Security testing per DO-356A test categories

=== THREAT & RISK ANALYSIS ===
• TARA (Threat Analysis and Risk Assessment)
• Attack paths: external network, supply chain, maintenance laptop, USB
• Cybersecurity risk index: threat likelihood × impact (ARP4754A-aligned)
• ADAS (Authorized Data Access Scheme) for each aircraft network interface

=== NETWORK SEGREGATION ===
• Operational Technology (OT) vs. Information Technology (IT) separation
• Aircraft network domains: safety-critical, airline operational, passenger entertainment
• Firewall rules: deny-by-default; whitelist approach
• Remote access: authenticated, logged, time-limited sessions

=== INCIDENT RESPONSE ===
• Cybersecurity incident response plan (CIRP) documented and exercised
• ISAO/ISAC membership (e.g., A-ISAC for aviation)
• CISA reporting obligations for critical infrastructure incidents
• Supply chain incident notification requirements

=== CMMC 2.0 (FOR DEFENSE CONTRACTORS) ===
Level 1 (Foundational): 17 practices (NIST SP 800-171 subset)
Level 2 (Advanced): 110 practices per NIST SP 800-171 Rev 2
Level 3 (Expert): 110 + 24 NIST SP 800-172 practices
• Assessment scope: System Security Plan (SSP) + Plan of Actions & Milestones (POA&M)

=== COMMON CYBERSECURITY AUDIT FINDINGS ===
• No Threat Analysis and Risk Assessment (TARA) for aircraft network
• USB ports on avionics maintenance laptop not controlled
• Remote access to aircraft systems without MFA or session logging
• Software update verification — no code signing or integrity check
• Supplier software delivery without vulnerability disclosure process
• Incident response plan exists but not exercised in 12 months
• CMMC: missing multi-factor authentication for privileged accounts (AC.L2-3.5.3)
• CMMC: media sanitization procedure not documented (MP.L2-3.8.3)`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // UAS / eVTOL AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "uas-evtol-auditor": [
    {
      name: "UAS & eVTOL Certification & Operations Audit Reference",
      content: `UAS AND eVTOL CERTIFICATION & OPERATIONS AUDIT REFERENCE

=== REGULATORY FRAMEWORK ===
14 CFR Part 107 – Small Unmanned Aircraft Systems (sUAS < 55 lbs)
14 CFR Part 135 – Air Carrier (for commercial UAS delivery operations)
FAA Special Class §21.17(b) – Basis for most UAS type certificates
FAA AC 21-50A – Certification of Unmanned Aircraft Systems
FAA AC 90-137A – Expanded Operations (BVLOS)
ASTM F3002-14a, F3196-18 – UAS design standard and safety risk management
ASTM F3322-18 – Small UAS Parachute Systems
EASA SC-VTOL – Special Condition for Small-Category VTOL Aircraft
EASA Easy Access Rules for UAS (Regulation (EU) 2019/947)

=== eVTOL CERTIFICATION (FAA) ===
FAA G-1 issue papers per §21.17(b) define certification basis case-by-case:
• Powered-Lift category under 14 CFR Part 21 §21.17(b) or §21.17(c)
• Means of Compliance (MoC) proposed via Project Specific Certification Plan (PSCP)
• Fault-tolerant propulsion: failure of single motor/prop must not be catastrophic
• Battery safety: thermal runaway containment per SAE J2464 / UN 38.3

=== CONCEPT OF OPERATIONS (CONOPS) ===
Required for BVLOS (Beyond Visual Line of Sight) waiver applications:
• Operations concept: airspace class, altitudes, corridors
• Detect and Avoid (DAA): technology and performance requirements
• Contingency procedures: lost link, geofencing breach, emergency landing
• Emergency Contact / operator responsibilities

=== REMOTE ID ===
14 CFR Part 89 – Standard Remote ID required for most operations since September 2023
• Standard Remote ID module or broadcast-only module
• Net-RID not yet finalized for all applications

=== BVLOS WAIVER (PART 107) ===
107.205 – Waiver authority. Applicant must demonstrate:
• Equivalent level of safety to line-of-sight ops
• Ground observer, ATC coordination, or DAA system
• Emergency procedures including auto-return/land
• Weather monitoring and wind/turbulence limits

=== COMMON UAS / eVTOL AUDIT FINDINGS ===
• ConOps document lacks emergency/contingency procedures with specific triggers
• Battery records: charge cycles not tracked; capacity degradation limit not defined
• Remote ID not installed or not transmitting correctly
• BVLOS operations without waiver or waiver conditions exceeded
• Maintenance records: no inspection log for propellers/motors at required intervals
• No risk assessment for operations over people (Category 3/4 requires Declaration of Compliance)
• eVTOL design: DAL assignment not traceable to failure condition classification
• Ground crew training records missing for new UAS model type`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // LABORATORY AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "laboratory-auditor": [
    {
      name: "ISO/IEC 17025 Calibration Laboratory Audit Reference",
      content: `ISO/IEC 17025:2017 TESTING AND CALIBRATION LABORATORY AUDIT REFERENCE

=== SCOPE ===
ISO/IEC 17025:2017 replaces 2005 edition. Risk-based approach added. ILAC accreditation body oversight.
Applicable to: calibration labs, testing labs, metrology labs, environmental testing labs.

=== MANAGEMENT REQUIREMENTS ===
§4.1 – Impartiality: no commercial pressure compromising technical integrity; impartiality policy documented
§4.2 – Confidentiality: customer data protection; breach notification procedure
§5.1 – Organizational structure: technical manager and quality manager roles defined
§5.5 – Risk and opportunities: documented risk assessment; corrective action process
§5.6 – Improvement: management review, internal audit, proficiency testing participation
§5.8 – Management system documentation: controlled; annual review

=== TECHNICAL REQUIREMENTS ===
§6.2 – Personnel: competence criteria per activity; training records; authorization list
§6.3 – Facilities and environmental conditions: temperature, humidity, vibration, cleanliness — monitored and recorded
§6.4 – Equipment: unique ID; calibration status; out-of-tolerance procedure; maintenance log
§6.5 – Metrological traceability: unbroken chain to SI units via NIST (US) or PTB (Germany); calibration certificates with measurement uncertainty
§6.6 – Externally provided products and services: supplier evaluation for calibration sub-contracts
§7.1 – Review of requests, tenders, contracts: method validation before quoting new work
§7.3 – Selection/verification of methods: use of standards methods (ANSI, ASTM, IEC); document deviations
§7.4 – Sampling: sampling plan documented if sampling performed
§7.6 – Measurement uncertainty: expanded uncertainty (U, k=2 per JCGM 100:2008 GUM) reported on all calibration certificates
§7.7 – Ensuring validity of results: proficiency testing participation; use of reference standards
§7.8 – Reporting results: calibration certificate content requirements per §7.8.4

=== MEASUREMENT UNCERTAINTY ===
GUM (JCGM 100:2008 Guide to the Expression of Uncertainty in Measurement):
• Identify all uncertainty sources (Type A: statistical; Type B: non-statistical)
• Combine in quadrature (root-sum-square)
• Apply coverage factor k=2 for ~95% confidence interval
• Report as: U = k × uc where uc is combined standard uncertainty
• All calibration certificates must include U and k

=== PROFICIENCY TESTING ===
• PT program participation demonstrates competence
• Failed PT: non-conforming work investigation, customer notification if applicable
• Inter-lab comparison acceptable when PT not available

=== COMMON LAB AUDIT FINDINGS ===
• Calibration certificate missing measurement uncertainty (§7.6 non-compliance)
• Traceability chain broken — intermediate calibration by unaccredited lab
• Environmental monitoring data (temperature, humidity) not recorded at time of calibration
• Reference standard certificate expired — calibration performed with out-of-date reference
• Proficiency test failure not investigated; no customer notification
• Personnel authorization list not updated after training — expired authorization
• Out-of-tolerance equipment — impact on previous calibrations not assessed (§6.4)
• Scope of accreditation not displayed; work performed outside accredited scope`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // ADDITIVE MANUFACTURING AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "additive-mfg-auditor": [
    {
      name: "Additive Manufacturing Quality Audit Reference",
      content: `ADDITIVE MANUFACTURING (AM) QUALITY AUDIT REFERENCE FOR AEROSPACE

=== KEY STANDARDS ===
SAE AMS7003 – Laser Powder Bed Fusion (LPBF) of Metal Parts
SAE AS9100D – QMS (applies to all AM operations)
ASTM F3049-14 – Standard Guide for Characterizing Properties of Metal Powders
ASTM F3001-14 – Ti-6Al-4V powder for SLM/EBM
ASTM F3213-17 – Lattice structures in AM (design guidelines)
NASA-STD-6030 – Additive Manufacturing Requirements for Spaceflight Systems
AMSC (Additive Manufacturing Standards Consortium) – AMS7000, AMS7001, AMS7002

=== AM PROCESS QUALIFICATION ===
Process qualification must be completed for each:
• Material / powder lot (alloy + particle size distribution)
• Machine (serial number specific)
• Parameters (laser power, scan speed, hatch spacing, layer thickness)
• Post-processing (HIP, heat treatment, machining, surface finish)

Evidence required:
1. Process Qualification Plan (PQP)
2. Witness coupons / test specimens built with production build
3. Mechanical test results: tensile, fatigue, hardness, porosity (Archimedes/CT)
4. Metallographic analysis: microstructure, lack-of-fusion, porosity count
5. Design Allowables (statistical basis): use B-basis or A-basis values

=== POWDER QUALIFICATION ===
Per ASTM F3049 / AMS7003:
• Chemical composition (ICP-OES or equivalent): verify to alloy specification
• Particle size distribution (PSD): D10, D50, D90 by laser diffraction
• Flowability: Hall flowmeter or Carney funnel per ASTM B213
• Apparent density: ASTM B212
• Morphology: SEM for sphericity and satellite particles
• Moisture content: Karl Fischer or gravimetric
• Re-used powder: blend ratio, maximum re-use cycles, sieve before each use
• Lot certificates retained: heat number, supplier, date, test results

=== BUILD TRAVELER / BUILD LOG ===
Required for each build:
• Machine ID, operator ID, date/time
• Build file checksum / version
• Parameter set reference (revision controlled)
• Environmental data: inert atmosphere purity (O₂ ppm), temperature
• Anomaly log: recoater blade replacements, layer restarts, deformation
• Witness coupon location in build plate

=== POST-PROCESSING CONTROLS ===
• Heat treatment (HIP, stress relief, aging): per AMS specification; furnace qualified per AMS 2750
• Machining: qualified machine tools; toolpath qualified; surface finish verified
• Non-destructive evaluation (NDE): CT scan for internal defects; FPI/MPI as applicable

=== COMMON AM AUDIT FINDINGS ===
• Powder lot used without incoming inspection per ASTM F3049
• Re-used powder with no documented sieve inspection or blend ratio record
• Build parameter file not version-controlled — no mechanism to prevent parameter drift
• Build traveler missing environmental data (O₂ ppm during build)
• Post-build HIP not per qualified cycle — time or temperature deviated without NCR
• Witness coupons tested but results not traced to specific build
• Design allowables using mean value only — no statistical basis (A- or B-basis required)
• CT scan threshold for defect acceptance not defined in procedure`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // ENTITY PERSPECTIVES (shop-owner, DOM, chief inspector, safety manager, general manager)
  // ════════════════════════════════════════════════════════════════════════════
  "shop-owner": [
    {
      name: "Repair Station Owner — Regulatory & Business Compliance Reference",
      content: `REPAIR STATION OWNER — COMPLIANCE & BUSINESS REFERENCE

=== OWNER REGULATORY OBLIGATIONS ===
§145.5 – Certificate required before performing regulated maintenance for compensation
§145.151 – Owner is accountable for having qualified personnel; cannot compromise by understaffing
§145.53 – Ratings must cover all work performed; working outside rating = violation
§145.57 – 30-day advance notice to FSDO for changes: location, facilities, housing, equipment, key personnel
§145.55 – Certificate must be displayed; accessible to customers and FAA
§145.219 – Record retention: work order records 2 years; owner must ensure continuity

=== OPERATIONAL CONSIDERATIONS ===
• Subcontracting: sub-tier work must be on approved vendor list; sub must hold appropriate cert
• Insurance: liability insurance requirement may be in leases or prime contracts
• Hangar lease / FAA location requirement: certificate is location-specific
• Return to service authority: only authorized inspectors can sign off — cannot delegate to mechanics without authorization per QCM

=== COMMON OWNER COMPLIANCE GAPS ===
• Work performed beyond rating (e.g., accessories work without accessory rating)
• DOM role filled by owner who doesn't meet §145.153 experience requirements
• Unauthorized personnel (no authorization per QCM) approving for return to service
• Certificate not amended after adding new location or work scope
• Business growth: brought on new aircraft type without updating equipment list and RSM

=== FINANCIAL / QUALITY TRADE-OFFS ===
Owner perspective to watch for:
• Pressure to cut inspection steps to meet customer deadline — QCM must prevail
• Using cheaper non-approved parts to reduce cost — must be traceable, approved
• Deferred maintenance of calibration equipment — calibration overdue on tools in use
• Not investing in training — training records missing for new hires

=== KEY QUESTIONS FOR OWNER DURING AUDIT ===
• Who is your DOM and what is their experience? Show DOM authorization letter.
• Who has return-to-service authority? Show authorization list in QCM.
• What training have you provided in the last 12 months? Show records.
• Have you notified FSDO of any facility or personnel changes?
• Show your last 5 work orders — are they all within your rating?`,
    },
  ],

  "dom-maintenance-manager": [
    {
      name: "Director of Maintenance — 14 CFR Part 145 Role Reference",
      content: `DIRECTOR OF MAINTENANCE (DOM) — REGULATORY ROLE REFERENCE

=== REGULATORY AUTHORITY ===
§145.153 – DOM shall:
• Have 18 months of experience maintaining aircraft or aircraft components in the previous 3 years
• Hold appropriate mechanic certificate (A&P) when supervising airframe or powerplant work
• Be available during normal business hours
• Be responsible for the work being done

=== DOM CORE RESPONSIBILITIES ===
1. Supervise all maintenance work performed by the station
2. Ensure work is performed per current approved maintenance data
3. Manage the maintenance personnel roster and their qualifications
4. Maintain technical library — current revisions of all referenced manuals
5. Coordinate with Quality Control on discrepancy resolution
6. Manage squawks / open maintenance items
7. Coordinate with customers on work scope and discrepancy disposition
8. Interface with FAA on certificate amendments and oversight activities

=== TECHNICAL DATA MANAGEMENT ===
• Maintain master list of all current manufacturer manuals (with current revision)
• Process for receiving and distributing revision updates (SBs, ADs, manual revisions)
• Ensure floor personnel use current revision — never work from photocopies without date
• Subscription management: Boeing BIDB, Airbus Technical AIRnav, etc.

=== WORK ORDER OVERSIGHT ===
• Review all work orders before release for completeness
• Verify referenced data is appropriate and current
• Ensure discrepancies are properly documented and dispositioned
• For major repairs/alterations: verify Form 337 data prepared and submitted

=== DOM AUDIT FOCUS ===
• DOM's own qualifications: A&P certificate, experience documentation
• Technical library management: process for updating revisions
• Evidence of supervision: sign-offs, work order reviews, floor presence
• AD tracking system: who is responsible, how is compliance verified
• Personnel management: training records for all technicians current

=== COMMON DOM-RELATED FINDINGS ===
• DOM unavailable during normal business hours (§145.153 requirement)
• DOM supervising work outside their mechanic certificate authority
• Technical library with outdated revisions — no systematic update process
• Open discrepancies not tracked — no master squawk log
• Subcontract work sent without technical data package (work scope undefined)`,
    },
  ],

  "chief-inspector-quality-manager": [
    {
      name: "Chief Inspector / Quality Manager — QCS Reference",
      content: `CHIEF INSPECTOR / QUALITY CONTROL MANAGER — REGULATORY REFERENCE

=== REGULATORY AUTHORITY ===
§145.211 – Quality control system (QCS) requirements:
• Separate, independent quality control function
• Written description of QCS in QCM/RSM
• Chief Inspector responsible for QCS implementation

§145.213 – Inspector independence:
• Inspectors may not inspect their own work
• Independence maintained organizationally

§145.155 – Inspector qualifications:
• Must hold appropriate mechanic certificate OR have equivalent experience per §65.81 equivalency

=== QCS REQUIRED ELEMENTS ===
Per §145.211, QCS must include written procedures for:
1. Receiving inspection of incoming parts, materials, and components
2. In-process inspection at defined checkpoints
3. Final inspection before return to service
4. Acceptance testing (functional/operational checks as required)
5. Supplier evaluation and approval (vendor qualification process)
6. Records: work order completion, certificate of conformance, inspection stamps

=== INSPECTOR AUTHORIZATION ===
• Authorization list maintained in QCM — identifies each authorized inspector
• Inspector stamp or signature identifier assigned and controlled
• Scope of authorization specified (e.g., "airframe only" or "all ratings")
• Revocation process documented

=== CALIBRATION PROGRAM ===
• Master list of all calibration-required tools and equipment
• Calibration intervals defined (tool-specific per manufacturer or history)
• Calibration records: due date visible on tool; certificate on file
• Out-of-tolerance procedure: impact assessment on recent work, FSDO notification if airworthiness impacted
• Traceability to NIST standards

=== NONCONFORMING PARTS ===
• Quarantine area for rejected/unserviceable items
• Disposition process: scrap, rework, return to supplier, or use-as-is (with proper authority)
• Suspect Unapproved Parts (SUP): documented reporting procedure to FAA
• Parts released in error: recall/trace process

=== COMMON CHIEF INSPECTOR FINDINGS ===
• Inspector approving own work (§145.213 violation)
• Authorization list not current — departed employees still listed
• Calibration due date on tool not matching certificate date + interval
• No impact assessment after out-of-tolerance tool discovery
• Quarantine area not locked or clearly marked
• Receiving inspection records not retained (2-year requirement)
• Final inspection sign-off missing from work order before release`,
    },
  ],

  "entity-safety-manager": [
    {
      name: "Entity Safety Manager — SMS & Hazmat Reference",
      content: `ENTITY SAFETY MANAGER — SMS & HAZMAT COMPLIANCE REFERENCE

=== SAFETY MANAGER ROLE ===
Per AC 120-92B and IS-BAO standards, Safety Manager responsibilities:
• Develop and implement the SMS
• Maintain the hazard register
• Coordinate safety investigations
• Report to Accountable Executive on safety performance
• Facilitate safety communications and training
• Serve as liaison with regulatory authorities on safety matters

=== OSHA REQUIREMENTS (Aviation MRO Context) ===
29 CFR 1910.132 – PPE assessment and provision
29 CFR 1910.1200 – Hazard Communication (GHS/SDSs)
29 CFR 1910.147 – Lockout/Tagout (LOTO) for energy control
29 CFR 1910.94 – Ventilation (spray booths, solvent use)
29 CFR 1910.303 – Electrical safety in workplace
29 CFR 1910.178 – Powered industrial trucks (forklifts)

=== HAZMAT PROGRAM (14 CFR Part 121 Appendix O / 49 CFR Part 172) ===
• Hazmat training: initial (8 hrs) + recurrent (every 3 years) for all employees handling DG
• Training records: contain employee name, date, function-specific training topics, trainer
• SDSs (Safety Data Sheets): current, accessible for all chemicals in use
• Chemical inventory: tracked for quantities that trigger EPA Tier II reporting thresholds
• Spill kit: appropriate for materials on site; staff trained in spill response

=== SMS PERFORMANCE INDICATORS ===
Lagging indicators: accident rate, injury rate, lost workday rate
Leading indicators: hazard report submission rate, safety training completion %, safety audit finding closure rate, near-miss report rate
• Both types should be tracked and reviewed at management level monthly
• Trending: year-over-year comparison; seasonal anomalies investigated

=== EMERGENCY RESPONSE PLAN (ERP) ===
Required for operators under IS-BAO and most Part 145 large stations:
• Emergency contact list: fire, police, EMS, FAA, NTSB, insurance
• First responder interface: hangar layout map at entrance
• Media spokesperson designated
• Exercise: at minimum annual tabletop; full exercise every 2 years
• Post-exercise debrief and ERP updates documented

=== COMMON SAFETY MANAGER FINDINGS ===
• Hazard reports submitted but not logged or actioned within defined timeframe
• Safety training records missing for seasonal or contract employees
• PPE assessment not document — PPE selected without hazard analysis
• LOTO program: no equipment-specific lockout procedures for major equipment
• ERP not updated after personnel changes in key roles
• Leading indicators: only lagging metrics tracked at management review
• SMS not integrated with operations — new contracts added without safety risk assessment`,
    },
  ],

  "general-manager": [
    {
      name: "General Manager — Integrated Quality & Business Reference",
      content: `GENERAL MANAGER — QUALITY MANAGEMENT & BUSINESS COMPLIANCE REFERENCE

=== GM ROLE IN QUALITY SYSTEM ===
The General Manager is typically the "Accountable Executive" in IS-BAO / SMS structures and often the certificate holder under Part 145. Responsibilities:
• Ensure adequate resources for quality and safety programs
• Final authority on strategic decisions affecting quality/compliance
• Management review leadership (AS9100D §9.3)
• Customer interface for quality complaints and significant escapes

=== MANAGEMENT REVIEW (AS9100D §9.3) ===
Required inputs to management review:
• Status of previous review actions
• Customer feedback and complaints
• Quality objectives performance data (KPIs)
• Process performance and product conformity
• Audit results (internal and customer/registrar)
• Supplier performance
• Risk and opportunity status
• Adequacy of resources

Required outputs (with owners and dates):
• Improvement opportunities
• QMS changes needed
• Resource decisions

=== BUSINESS CONTINUITY & REGULATORY COMPLIANCE ===
• Certificate amendments: GM ensures FSDO/NAA notified of facility, personnel, scope changes
• Customer-specific requirements: GM ensures customer requirements flow to operations (SOW, purchase orders)
• Third-party certifications (AS9100, NADCAP): GM commitment to audit schedule and corrective actions
• ITAR/EAR compliance: GM responsible for Technology Control Plan; facility access controls
• Contractual flow-downs: GM ensures prime contractor requirements are mapped to internal procedures

=== KPI DASHBOARD (typical) ===
• On-time delivery (OTD) — target: ≥95%
• Escape rate / defects-escaped-to-customer — target: <0.1% of deliveries
• First-pass yield (FPY) — target: ≥97%
• Customer returns/warranty — target: trending down
• Internal nonconformance rate — trending down
• Corrective action closure rate — ≥95% on time

=== COMMON GM AUDIT FINDINGS ===
• Management review records missing required inputs or outputs
• Quality objectives set but not measured or reviewed
• Resource decisions from previous management review not actioned
• Customer complaint response time exceeding contractual commitment
• No management visibility of safety performance metrics
• AS9100 certificate scope not updated after new product lines added`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // AUDIT INTELLIGENCE ANALYST
  // ════════════════════════════════════════════════════════════════════════════
  "audit-intelligence-analyst": [
    {
      name: "Audit Pattern Analysis Framework Reference",
      content: `AUDIT INTELLIGENCE ANALYST — CROSS-AUDIT PATTERN REFERENCE FRAMEWORK

=== ANALYTICAL METHODOLOGY ===
The Audit Intelligence Analyst synthesizes findings across all audit agents to identify:
1. Systemic root causes (vs. isolated incidents)
2. High-frequency finding categories
3. Correlations between different audit domains
4. Predictive risk indicators based on historical patterns

=== COMMON SYSTEMIC ROOT CAUSES ===

ROOT CAUSE: Training System Deficiency
Signals: Multiple agents find training records missing/incomplete across different domains
Correlation: Training deficiency predicts quality escape risk, safety event risk
Recommendation: Training program redesign + competency verification, not just attendance tracking

ROOT CAUSE: Document Control Breakdown
Signals: Outdated procedures found in multiple areas (floor, lab, maintenance, supply chain)
Correlation: Document control gaps correlate with unauthorized deviations and NCs
Recommendation: Audit entire document control system; assess revision distribution mechanism

ROOT CAUSE: Resource Inadequacy
Signals: Inspection independence failures, overtime on records, deferred calibration
Correlation: Understaffing → corner-cutting → systemic quality risk
Recommendation: Workload vs. headcount analysis; escalate to management review

ROOT CAUSE: Quality Culture Deficit
Signals: Verbal authorizations, incomplete records, closed NCs without RCCA
Correlation: Culture issues predict future audit failure and customer escapes
Recommendation: Management engagement; Just Culture policy; measurable quality objectives

=== CROSS-DOMAIN RISK CORRELATIONS ===
• FAA compliance gaps + AS9100 gaps → likely shared documentation/training root cause
• Supply chain weakness + NADCAP compliance issues → process control systemic issue
• SMS deficiency + safety auditor findings → leadership commitment question
• Software/hardware assurance gaps + systems safety gaps → program-level integration failure

=== FINDING SEVERITY WEIGHTING ===
Critical (immediate risk): Return-to-service unauthorized; counterfeit parts shipped; AD non-compliance
Major (systemic risk): QCS independence failure; training program breakdown; record falsification
Minor (corrective action): Individual record gap; single calibration overdue; procedure revision lag

=== AUDIT TREND METRICS TO TRACK ===
• Finding rate per audit (findings / question): higher = systemic issues
• Repeat finding rate: same finding in successive audits = RCCA ineffective
• Finding-to-closure time: open CARs >90 days = systemic resolution failure
• Customer-defined CAR: customer-initiated corrective actions = escalated risk

=== PATTERN RECOGNITION QUESTIONS ===
• Are findings concentrated in one shift / one supervisor? (supervision problem)
• Are findings always in the same process step? (procedure problem)
• Are findings only found in one product line? (product-specific training issue)
• Are findings only found by external auditors? (internal audit effectiveness problem)`,
    },
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // PUBLIC USE AUDITOR
  // ════════════════════════════════════════════════════════════════════════════
  "public-use-auditor": [
    {
      name: "General Aviation Public Use — Key Regulatory Reference",
      content: `GENERAL AVIATION PUBLIC USE OPERATIONS — AUDIT REFERENCE

=== SCOPE ===
Public use aircraft operations include government-owned aircraft (Part 91 Subpart F),
public aircraft operations under 49 U.S.C. §40125, and general aviation operators.

=== 14 CFR PART 91 — KEY REQUIREMENTS ===
§91.409 – Inspection requirements: annual inspection; 100-hour inspection if used for hire
§91.411 – Altimeter/pitot-static: required every 24 calendar months
§91.413 – ATC transponder: required every 24 calendar months
§91.407 – Flight after maintenance: aircraft not airworthy until signed off per §43.9
§91.171 – VOR check: required within 30 days before IFR flight
§91.417 – Maintenance records: retain AD compliance records, major repair/alteration records

=== AIRWORTHINESS DIRECTIVES ===
• 14 CFR §39.7 – Unless exempted, no person may operate an aircraft to which an AD applies except in accordance with the requirements of that AD
• Recurring ADs: tracked with last compliance date and next due date/interval
• Life-limited components: AD may require retirement at specific hours/cycles

=== PILOT CURRENCY (§61) ===
• Flight Review (§61.56): required every 24 calendar months
• Instrument Currency (§61.57(c)): 6 approaches + holding + intercepting/tracking in previous 6 months
• Medical Certificate: Class 3 valid 60 months (under age 40) / 24 months (40 and over); BasicMed alternative

=== AIRCRAFT RECORDS ===
• Airframe: total time, major repairs/alterations, AD compliance
• Engine: total time, time since major overhaul, engine log entries
• Propeller: total time, applicable SBs/ADs
• Weight and balance: current after any modification

=== COMMON FINDINGS FOR GENERAL AVIATION ===
• Annual inspection overdue — aircraft operated past due date
• Recurring AD not tracked — no compliance record for applicable recurring AD
• Transponder or pitot-static out of 24-month test
• Pilot not current (flight review lapsed, medical expired)
• Engine logbook missing entries for recent work
• Weight and balance not updated after avionics installation
• ELT: battery expiry not tracked; ELT annual inspection not current (§91.207)`,
    },
  ],
};

// ─── Admin Action ─────────────────────────────────────────────────────────────

export const seedDefaultKB = action({
  args: {
    overwrite: v.optional(v.boolean()), // if true, clears existing "generated" docs first
  },
  handler: async (ctx, args): Promise<{ seeded: number; skipped: number; agents: string[] }> => {
    await requireAdmin(ctx);

    let seeded = 0;
    let skipped = 0;
    const seededAgents: string[] = [];

    for (const [agentId, docs] of Object.entries(AGENT_KB)) {
      for (const doc of docs) {
        try {
          await ctx.runMutation(internal.sharedAgentDocuments.addSeedDoc, {
            agentId,
            name: doc.name,
            content: doc.content,
            overwrite: args.overwrite ?? false,
          });
          seeded++;
          if (!seededAgents.includes(agentId)) seededAgents.push(agentId);
        } catch {
          skipped++;
        }
      }
    }

    return { seeded, skipped, agents: seededAgents };
  },
});
