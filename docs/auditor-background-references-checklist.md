# Auditor background reference checklist

Use this list for **framework and authority material** each persona should lean on when judging audits or paperwork (regs, standards, ACs, orders) — distinct from **organization evidence** uploads (manuals, plans, records) in `auditor-document-checklists.md`.

Derived from `getPaperworkReviewSystemPrompt` and related prompts in `src/services/auditAgents.ts`.

---

## FAA Inspector (`faa-inspector`)

- [ ] 14 CFR Part 145 (Repair Stations)
- [ ] 14 CFR Part 43 (Maintenance / RTS)
- [ ] 14 CFR Parts 121 / 135 (as applicable to the operation)
- [ ] FAA Advisory Circulars (topic-relevant)
- [ ] FAA Order 8900.1 (Flight Standards Information)

---

## EASA Inspector (`easa-inspector`)

- [ ] EASA Part-145
- [ ] EASA Part-M
- [ ] EASA Part-CAMO
- [ ] AMC and GM (Associated Means of Compliance / Guidance Material)

---

## IS-BAO Auditor (`isbao-auditor`)

- [ ] IS-BAO Standard (current edition held by org / IBAC)
- [ ] ICAO Annex 6 (Operation of Aircraft)
- [ ] ICAO Annex 8 (Airworthiness of Aircraft)

---

## AS9100 Auditor (`as9100-auditor`)

- [ ] AS9100D
- [ ] AS9110 (when maintenance org QMS scope applies)
- [ ] ISO 9001:2015 (clauses 4–10 as applicable)

---

## NASA Auditor (`nasa-auditor`)

- [ ] NASA-STD-7919.1 (Commercial Aviation Services; incl. Change 1 per program)
- [ ] NPR 7900.3 (NASA quality / SMA policy context per prompt)
- [ ] Applicable NASA / contract / program requirements (as provided)

---

## SMS Consultant (`sms-consultant`)

- [ ] ICAO Doc 9859 (Safety Management Manual)
- [ ] FAA AC 120-92B (SMS)
- [ ] SMS framework reference: four pillars (policy, risk management, assurance, promotion)

---

## Third-Party Safety Auditor (`safety-auditor`)

- [ ] ARGUS CHEQ (current programme documentation)
- [ ] Wyvern PASS / Wingman criteria (current programme documentation)

---

## Public Use Aircraft Auditor (`public-use-auditor`)

- [ ] 49 U.S.C. § 40102(a)(41) (definitions)
- [ ] 49 U.S.C. § 40125 (public aircraft)
- [ ] FAA AC 00-1.1A
- [ ] 49 CFR Part 830 (NTSB reporting)

---

## Supply Chain / Counterfeit Parts Auditor (`supply-chain-auditor`)

- [ ] AS9120B (aerospace distributor QMS)
- [ ] AS5553B (counterfeit electronic parts)
- [ ] AS6174 (counterfeit materiel — authentic/conforming materiel)
- [ ] DFARS 252.246-7008 (Sources of Electronic Parts)
- [ ] DFARS 252.246-7007 (when electronic parts detection/avoidance invoked)

---

## NADCAP Auditor (`nadcap-auditor`)

- [ ] NADCAP AC711x / AC7xxx checklists (per special process)
- [ ] Applicable SAE AMS specifications (process/material)
- [ ] PRI / Nadcap programme requirements (as published for subscribers)

---

## Defense Aerospace Auditor (`defense-auditor`)

- [ ] AS9100D
- [ ] AS9110C (maintenance org QMS where applicable)
- [ ] AS9102B (First Article Inspection)
- [ ] MIL-STD-882E (system safety practice)
- [ ] FAR / DFARS (quality and counterfeit clauses, e.g. 252.246-7007, -7008, flowdown)

---

## Airworthiness Certification Auditor (`airworthiness-auditor`)

- [ ] 14 CFR Part 21 (Subparts B, E, F, G, K, O as applicable)
- [ ] EASA Part-21 (when dual-cert / comparison path)
- [ ] MSG-3 (maintenance program philosophy where invoked)
- [ ] FAA AC 21-40
- [ ] FAA AC 21-43
- [ ] FAA AC 25.1309-1A (civil transport safety objectives / guidance)

---

## DO-178C Software Auditor (`do178c-auditor`)

- [ ] RTCA DO-178C
- [ ] DO-330 (Tool Qualification)
- [ ] DO-331 (Model-Based Development)
- [ ] DO-332 (Object-Oriented Technology)
- [ ] DO-333 (Formal Methods)

---

## DO-254 Hardware Auditor (`do254-auditor`)

- [ ] RTCA DO-254
- [ ] FAA AC 20-152A

---

## Systems Safety Auditor (`systems-safety-auditor`)

- [ ] SAE ARP4754A
- [ ] SAE ARP4761 / ARP4761A
- [ ] MIL-STD-882E
- [ ] 14 CFR §25.1309 / §23.2510 (failure condition categories)

---

## Environmental Testing Auditor (`do160-auditor`)

- [ ] RTCA DO-160G
- [ ] MIL-STD-810H
- [ ] MIL-STD-461G (defence EMI/EMC when applicable)

---

## Space Systems QA Auditor (`space-systems-auditor`)

- [ ] AS9100D
- [ ] MSFC-STD-3716A (AM spaceflight hardware — plus other NASA quality standards as applicable)
- [ ] ECSS-Q-ST-10 series (space product assurance)
- [ ] NASA NPR 7120.5 (program/project management)

---

## Cybersecurity Auditor (`cybersecurity-auditor`)

- [ ] NIST SP 800-171 Rev 2
- [ ] CMMC 2.0 (programme documentation)
- [ ] RTCA DO-326A / DO-356A (airworthiness security)
- [ ] DFARS 252.204-7012 (CUI safeguarding)

---

## UAS / eVTOL Auditor (`uas-evtol-auditor`)

- [ ] 14 CFR Part 107
- [ ] FAA Special Conditions / §21.17(b) pathways (VTOL / novel certification)
- [ ] EASA SC-VTOL-01
- [ ] JARUS SORA
- [ ] ASTM F3548 (Remote ID)
- [ ] ASTM F3298 (Light UAS — as applicable)

---

## Laboratory / Calibration Auditor (`laboratory-auditor`)

- [ ] ISO/IEC 17025:2017
- [ ] ANSI/NCSL Z540.3

---

## Additive Manufacturing Auditor (`additive-mfg-auditor`)

- [ ] SAE AMS7000–7004 (material families as applicable)
- [ ] MSFC-STD-3716A
- [ ] ASTM F3055, F3301, F3302, F3122 (as applicable)
- [ ] FAA / EASA published guidance on AM part certification (as applicable)

---

## Entity perspectives (background, not single “primary standard”)

### Shop Owner (`shop-owner`)

- [ ] Applicable 14 CFR (e.g. 145, 43, 121/135/91 by operation)
- [ ] Organization certificate + limitations
- [ ] Organization manuals (practical ground truth)

### DOM / Maintenance Manager (`dom-maintenance-manager`)

- [ ] Applicable maintenance / airworthiness rules for the operation
- [ ] Work instructions, capability list, maintenance programme docs

### Chief Inspector / Quality Manager (`chief-inspector-quality-manager`)

- [ ] Applicable inspection / quality regulations for the certificate
- [ ] QC manual, procedures, NCR / CAP processes

### Entity Safety Manager (`entity-safety-manager`)

- [ ] Organization SMS manual + safety data
- [ ] ICAO SMS documentation (9859) as alignment reference

### General Manager (`general-manager`)

- [ ] High-level regulatory obligations for the certificate(s) held
- [ ] Management accountability / resources evidence

---

## Audit Intelligence Analyst (`audit-intelligence-analyst`)

- [ ] Historical findings / pattern knowledge base (app-generated or curated)
- [ ] *(Does not cite regulations as binding requirements — empirical patterns only per system prompt.)*

---

*Org evidence checklists: `docs/auditor-document-checklists.md`*
