/**
 * FAA Operations Specifications — Part 145 repair station paragraphs (8900.1 Vol 2 Ch 3)
 * and high-level Part 121/135 series groupings for air carrier context.
 */

export type FaaOpSpecEntry = {
  paragraph: string;
  title: string;
  helpText?: string;
};

/** Core Part 145 OpSpec paragraphs commonly referenced for maintenance / DCT scoping. */
export const FAA_PART145_OPSPECS: FaaOpSpecEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability", helpText: "General certificate information." },
  { paragraph: "A002", title: "Definitions and abbreviations", helpText: "OpSpec definitions." },
  { paragraph: "A003", title: "Ratings and limitations", helpText: "Aligns with certificate ratings." },
  { paragraph: "A004", title: "Summary of authorizations", helpText: "Summary maintenance authorizations." },
  { paragraph: "A025", title: "Specific maintenance authorizations", helpText: "Detailed function / article authorizations." },
  { paragraph: "A049", title: "Hazardous materials authorization", helpText: "HAZMAT handling / shipping." },
  { paragraph: "A050", title: "Contract maintenance information", helpText: "Contract maintenance program coordination." },
  { paragraph: "A060", title: "Special maintenance authorizations", helpText: "Special procedures / approvals." },
  { paragraph: "A100", title: "Exemptions / deviations", helpText: "Exemption references where issued." },
  { paragraph: "A449", title: "Antidrug and alcohol misuse prevention program", helpText: "DOT/FAA drug & alcohol program." },
  { paragraph: "D100", title: "Maintenance performed for certificate holders away from fixed location", helpText: "Line / away-from-base maintenance." },
  { paragraph: "D101", title: "Line maintenance", helpText: "Line maintenance authorizations." },
];

/** Part 121 / 135 — grouped by letter series (not exhaustive paragraph list; track by series + notes). */
export const FAA_PART121_135_OPSPEC_SERIES: FaaOpSpecEntry[] = [
  { paragraph: "Series A", title: "General (121/135)", helpText: "Certificate, definitions, operational control." },
  { paragraph: "Series B", title: "En route (121/135)", helpText: "En route authorizations." },
  { paragraph: "Series C", title: "Airports / heliports (121/135)", helpText: "Airport-specific ops." },
  { paragraph: "Series D", title: "Maintenance (121/135)", helpText: "Maintenance program / CAMP / contract maint." },
  { paragraph: "Series E", title: "Weight and balance (121/135)", helpText: "W&B control." },
  { paragraph: "Series H", title: "Training (121/135)", helpText: "Training program approvals." },
  { paragraph: "Series N", title: "Airplane exemptions (121/135)", helpText: "Aircraft-specific exemptions." },
];
