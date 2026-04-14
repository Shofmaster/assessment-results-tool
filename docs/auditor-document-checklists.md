# Auditor document checklists

This checklist matches the document expectations used for **coverage tracking** and acquisition guidance in the app. Source of truth: `src/config/auditorDocumentRequirements.ts` (fields `coreShared` + `requiredSpecific` + `optionalSupporting`).

**How to read it**

- **Required (baseline coverage)** — all items in *Core shared* plus *Required specific* for that agent; the app treats the union as “required” when computing completion.
- **Optional supporting** — nice-to-have for richer context; not counted toward the “required” percentage.

Use `[ ]` as your paper checklist, or copy into a spreadsheet.

---

## FAA Inspector (`faa-inspector`)

### Required (baseline coverage)

- [ ] Part 145 Repair Station Manual
- [ ] General Maintenance Manual (GMM)
- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Operations Specifications
- [ ] Inspection Procedures Manual (IPM)
- [ ] Tool Calibration Manual

### Optional supporting

- [ ] Minimum Equipment List
- [ ] Hazmat / Dangerous Goods Manual
- [ ] Part 121 Operations Manual
- [ ] Part 135 Operations Manual

---

## EASA Inspector (`easa-inspector`)

### Required (baseline coverage)

- [ ] General Maintenance Manual (GMM)
- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Part 145 Repair Station Manual
- [ ] Inspection Procedures Manual (IPM)

### Optional supporting

- [ ] Operations Specifications
- [ ] Minimum Equipment List
- [ ] SMS Manual

---

## IS-BAO Auditor (`isbao-auditor`)

### Required (baseline coverage)

- [ ] IS-BAO Standards
- [ ] SMS Manual
- [ ] Training Program Manual
- [ ] Part 91 Operations Manual

### Optional supporting

- [ ] General Maintenance Manual (GMM)
- [ ] Quality Control Manual (QCM)
- [ ] Operations Specifications

---

## AS9100 Auditor (`as9100-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] General Maintenance Manual (GMM)
- [ ] Inspection Procedures Manual (IPM)
- [ ] Tool Calibration Manual

### Optional supporting

- [ ] SMS Manual
- [ ] Operations Specifications
- [ ] Part 145 Repair Station Manual

---

## NASA Auditor (`nasa-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] SMS Manual
- [ ] Other Reference *(upload supporting material; map document type in Admin if needed)*

### Optional supporting

- [ ] General Maintenance Manual (GMM)
- [ ] Inspection Procedures Manual (IPM)
- [ ] Tool Calibration Manual

---

## SMS Consultant (`sms-consultant`)

### Required (baseline coverage)

- [ ] SMS Manual
- [ ] Training Program Manual
- [ ] Quality Control Manual (QCM)
- [ ] IS-BAO Standards

### Optional supporting

- [ ] General Maintenance Manual (GMM)
- [ ] Hazmat / Dangerous Goods Manual
- [ ] Operations Specifications

---

## Third-Party Safety Auditor (`safety-auditor`)

### Required (baseline coverage)

- [ ] SMS Manual
- [ ] Training Program Manual
- [ ] Operations Specifications
- [ ] Minimum Equipment List

### Optional supporting

- [ ] Quality Control Manual (QCM)
- [ ] General Maintenance Manual (GMM)
- [ ] Part 135 Operations Manual
- [ ] Part 91 Operations Manual

---

## Public Use Aircraft Auditor (`public-use-auditor`)

### Required (baseline coverage)

- [ ] SMS Manual
- [ ] Training Program Manual
- [ ] Other Reference *(supporting org-specific material)*
- [ ] Part 91 Operations Manual

### Optional supporting

- [ ] Operations Specifications
- [ ] General Maintenance Manual (GMM)
- [ ] Quality Control Manual (QCM)

---

## Airworthiness Certification Auditor (`airworthiness-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] General Maintenance Manual (GMM)
- [ ] Training Program Manual
- [ ] Certification Plan / Type Certification Basis
- [ ] Instructions for Continued Airworthiness (ICA)

### Optional supporting

- [ ] Operations Specifications
- [ ] Part 145 Repair Station Manual
- [ ] Inspection Procedures Manual (IPM)

---

## Shop Owner (`shop-owner`)

### Required (baseline coverage)

- [ ] Part 145 Repair Station Manual
- [ ] General Maintenance Manual (GMM)
- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual

### Optional supporting

- [ ] SMS Manual
- [ ] Tool Calibration Manual
- [ ] Inspection Procedures Manual (IPM)

---

## DOM / Maintenance Manager (`dom-maintenance-manager`)

### Required (baseline coverage)

- [ ] Part 145 Repair Station Manual
- [ ] General Maintenance Manual (GMM)
- [ ] Quality Control Manual (QCM)
- [ ] Inspection Procedures Manual (IPM)
- [ ] Tool Calibration Manual

### Optional supporting

- [ ] Training Program Manual
- [ ] Minimum Equipment List
- [ ] Operations Specifications

---

## Chief Inspector / Quality Manager (`chief-inspector-quality-manager`)

### Required (baseline coverage)

- [ ] Part 145 Repair Station Manual
- [ ] Quality Control Manual (QCM)
- [ ] General Maintenance Manual (GMM)
- [ ] Inspection Procedures Manual (IPM)
- [ ] Training Program Manual

### Optional supporting

- [ ] Operations Specifications
- [ ] Tool Calibration Manual
- [ ] Minimum Equipment List

---

## Safety Manager (`entity-safety-manager`)

### Required (baseline coverage)

- [ ] SMS Manual
- [ ] Training Program Manual
- [ ] Quality Control Manual (QCM)
- [ ] Hazmat / Dangerous Goods Manual

### Optional supporting

- [ ] General Maintenance Manual (GMM)
- [ ] IS-BAO Standards
- [ ] Operations Specifications

---

## General Manager (`general-manager`)

### Required (baseline coverage)

- [ ] Part 145 Repair Station Manual
- [ ] Quality Control Manual (QCM)
- [ ] SMS Manual
- [ ] Training Program Manual

### Optional supporting

- [ ] Operations Specifications
- [ ] General Maintenance Manual (GMM)

---

## Audit Intelligence Analyst (`audit-intelligence-analyst`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] SMS Manual
- [ ] Training Program Manual
- [ ] Other Reference *(pattern/history package or generated memory)*

### Optional supporting

- [ ] Part 145 Repair Station Manual
- [ ] General Maintenance Manual (GMM)
- [ ] IS-BAO Standards

---

## DO-178C Software Auditor (`do178c-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Plan for Software Aspects of Certification (PSAC)
- [ ] Software Lifecycle Plans (SDP / SVP / SCMP / SQAP)

### Optional supporting

- [ ] SMS Manual
- [ ] System Safety Program Plan (SSPP / FHA / PSSA / SSA)

---

## DO-254 Hardware Auditor (`do254-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Plan for Hardware Aspects of Certification (PHAC)
- [ ] Hardware Design Lifecycle Records (HAP / HAD / HVP)

### Optional supporting

- [ ] SMS Manual
- [ ] System Safety Program Plan (SSPP / FHA / PSSA / SSA)

---

## Systems Safety Auditor (`systems-safety-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] SMS Manual
- [ ] Training Program Manual
- [ ] System Safety Program Plan (SSPP / FHA / PSSA / SSA)
- [ ] Hazard Analysis Records (FTA / FMEA / FMECA)

### Optional supporting

- [ ] General Maintenance Manual (GMM)
- [ ] Plan for Software Aspects of Certification (PSAC)
- [ ] Plan for Hardware Aspects of Certification (PHAC)

---

## Environmental Testing Auditor (`do160-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Tool Calibration Manual
- [ ] Environmental Qualification Test Plan (DO-160G / MIL-STD-810H)
- [ ] Qualification Test Report / Test Data Package

### Optional supporting

- [ ] Inspection Procedures Manual (IPM)
- [ ] Certification Plan / Type Certification Basis

---

## NADCAP Auditor (`nadcap-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Inspection Procedures Manual (IPM)
- [ ] Special Process Procedure (Welding / NDT / Heat Treat / Plating)
- [ ] Process Control Plan

### Optional supporting

- [ ] General Maintenance Manual (GMM)
- [ ] Tool Calibration Manual
- [ ] Quality Management Plan (AS9100 QMP)

---

## Supply Chain / Counterfeit Parts Auditor (`supply-chain-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] General Maintenance Manual (GMM)
- [ ] Supplier Quality Assurance Plan (SQAP / ASL)
- [ ] Counterfeit / Suspect Unapproved Parts Procedure

### Optional supporting

- [ ] Tool Calibration Manual
- [ ] Inspection Procedures Manual (IPM)
- [ ] Part 145 Repair Station Manual

---

## Laboratory / Calibration Auditor (`laboratory-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Tool Calibration Manual
- [ ] Calibration Procedures Manual / Scope of Accreditation
- [ ] Measurement Uncertainty Budget

### Optional supporting

- [ ] Inspection Procedures Manual (IPM)
- [ ] Quality Management Plan (AS9100 QMP)

---

## Defense Aerospace Auditor (`defense-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] General Maintenance Manual (GMM)
- [ ] Quality Management Plan (AS9100 QMP)
- [ ] First Article Inspection Report (FAIR / AS9102)

### Optional supporting

- [ ] Tool Calibration Manual
- [ ] Operations Specifications
- [ ] Supplier Quality Assurance Plan (SQAP / ASL)

---

## Space Systems QA Auditor (`space-systems-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] SMS Manual
- [ ] Space Vehicle Quality Plan (SQAP / ECSS / MSFC)
- [ ] System Safety Program Plan (SSPP / FHA / PSSA / SSA)

### Optional supporting

- [ ] Tool Calibration Manual
- [ ] Hazard Analysis Records (FTA / FMEA / FMECA)
- [ ] Qualification Test Report / Test Data Package

---

## Cybersecurity Auditor (`cybersecurity-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Cybersecurity Management Plan / System Security Plan (SSP)

### Optional supporting

- [ ] SMS Manual
- [ ] Operations Specifications
- [ ] System Safety Program Plan (SSPP / FHA / PSSA / SSA)

---

## UAS / eVTOL Auditor (`uas-evtol-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] SMS Manual
- [ ] Concept of Operations (ConOps)
- [ ] Certification Plan / Type Certification Basis

### Optional supporting

- [ ] Operations Specifications
- [ ] General Maintenance Manual (GMM)
- [ ] System Safety Program Plan (SSPP / FHA / PSSA / SSA)

---

## Additive Manufacturing Auditor (`additive-mfg-auditor`)

### Required (baseline coverage)

- [ ] Quality Control Manual (QCM)
- [ ] Training Program Manual
- [ ] Additive Manufacturing Process Specification / Build Traveler
- [ ] AM Powder Qualification Records / Lot Certifications

### Optional supporting

- [ ] Tool Calibration Manual
- [ ] General Maintenance Manual (GMM)
- [ ] Qualification Test Report / Test Data Package

---

*Document type labels match `DOC_TYPE_LABELS` in `src/config/auditorDocumentRequirements.ts`.*
