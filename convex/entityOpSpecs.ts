import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAerogapEmployee, requireCompanyRole, requireProjectOwner } from "./_helpers";

/**
 * Validator reused by multiple mutations. Kept local to avoid pulling in the UI
 * catalog (which lives under `src/config/`) — this list is the server-side
 * source of truth and must stay in sync with `FaaCertPart` over in
 * [src/config/regulatoryTaxonomy/faaOpSpecs.ts].
 */
const certPartValidator = v.union(
  v.literal("145"),
  v.literal("121"),
  v.literal("125"),
  v.literal("129"),
  v.literal("133"),
  v.literal("135"),
  v.literal("137"),
  v.literal("141"),
  v.literal("142"),
  v.literal("147"),
  v.literal("91K"),
  v.literal("91LOA"),
);

const docTypeValidator = v.union(
  v.literal("opspec"),
  v.literal("mspec"),
  v.literal("tspec"),
  v.literal("loa"),
);

type FaaCertPart =
  | "145" | "121" | "125" | "129" | "133" | "135"
  | "137" | "141" | "142" | "147" | "91K" | "91LOA";

type FaaDocType = "opspec" | "mspec" | "tspec" | "loa";

/** Default doc type for each certificate part. */
const DOC_TYPE_FOR_CERT_PART: Record<FaaCertPart, FaaDocType> = {
  "145": "opspec",
  "121": "opspec",
  "125": "opspec",
  "129": "opspec",
  "133": "opspec",
  "135": "opspec",
  "137": "opspec",
  "141": "opspec",
  "142": "tspec",
  "147": "tspec",
  "91K": "mspec",
  "91LOA": "loa",
};

/**
 * Authoritative per-cert paragraph title catalog. Mirrored from
 * src/config/regulatoryTaxonomy/faaOpSpecs.ts — keep in sync on edits.
 * Stamped onto rows by `addOrUpdate` when the client does not pass a title.
 */
const TITLE_BY_CERT_AND_PARAGRAPH: Record<FaaCertPart, Record<string, string>> = {
  "145": {
    A001: "Issuance and applicability",
    A002: "Definitions and abbreviations",
    A003: "Ratings and limitations",
    A004: "Summary of special authorizations and limitations",
    A005: "Exemptions, deviations, and waivers",
    A007: "Designated persons",
    A015: "Aviation Safety Action Program (ASAP)",
    A025: "Electronic/digital recordkeeping system, electronic/digital signature, and electronic media",
    A049: "Hazardous materials training program",
    A060: "Ratings for repair stations located outside the United States under a BASA with maintenance provisions",
    A061: "Approved procedures for repair stations located outside the United States",
    A064: "Authorization to use a maintenance management software program",
    A100: "Additional business names (d/b/a)",
    A101: "Additional fixed locations",
    A103: "Continuous operations at locations other than the primary fixed location",
    A110: "Geographic authorization (foreign repair station)",
    A449: "Antidrug and alcohol misuse prevention program",
    D070: "Continuing Analysis and Surveillance System (CASS) coordination",
    D091: "RVSM maintenance authorization",
    D100: "Maintenance for certificate holders away from fixed location",
    D107: "Line maintenance authorization for 14 CFR Part 121, 129, and 135 air carriers",
    D301: "Teardown / restricted-purpose maintenance authorization",
    D431: "Special flight permit — continuous authorization",
  },
  "121": {
    A001: "Issuance and applicability",
    A002: "Definitions and abbreviations",
    A003: "Airplane authorizations, airman authorizations, and airworthiness information",
    A004: "Summary of special authorizations and limitations",
    A005: "Exemptions, deviations, and waivers",
    A006: "Management personnel",
    A007: "Designated persons",
    A008: "Operational control",
    A009: "Airplane authorizations",
    A010: "Aviation weather information",
    A011: "Airman qualification programs",
    A012: "Airplane flight manual, pilot's operating handbook, or equivalent",
    A015: "Aviation Safety Action Program (ASAP)",
    A021: "Flight Operational Quality Assurance (FOQA) program",
    A025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    A031: "Authorization for a SMS",
    A039: "Extended-range operations with two-engine airplanes (ETOPS)",
    A049: "Carriage of hazardous materials (will carry / will not carry)",
    A201: "Cabin safety and cabin-crew training",
    A206: "Aging airplane program",
    A449: "Antidrug and alcohol misuse prevention program",
    B031: "IFR class I navigation using area or long-range navigation systems",
    B034: "IFR class II navigation using GNSS (e.g. RNP-10, RNP-4)",
    B036: "Operations in North Atlantic High Level Airspace (NAT-HLA / MNPS)",
    B037: "Operations in RNP-10 airspace",
    B039: "Operations in areas of magnetic unreliability",
    B040: "Oceanic and remote continental airspace — data-link position reporting",
    B046: "Reduced vertical separation minimums (RVSM)",
    B050: "Special airports — pilot qualifications",
    C052: "Straight-in instrument approach — higher than standard minimums",
    C055: "Alternate airport IFR weather minimums",
    C060: "Takeoff minimums — standard and lower than standard",
    C070: "Airport authorizations and limitations",
    C078: "CAT II/III instrument approach and landing operations",
    C079: "CAT II instrument approach and landing — general",
    D070: "Continuing Analysis and Surveillance System (CASS)",
    D072: "Aircraft maintenance program",
    D082: "Short-term escalation of maintenance tasks",
    D085: "Aircraft inspection program",
    D091: "RVSM maintenance program",
    D095: "Minimum Equipment List (MEL) authorization",
    D100: "Maintenance performed at line stations / away from main base",
    D107: "Contract maintenance — line maintenance providers",
    E095: "Weight and balance control program",
    E096: "Use of average passenger and bag weights",
    H101: "Training program — FAA-approved curricula",
    H110: "Advanced qualification program (AQP)",
    N410: "Airplane-specific exemptions and deviations",
  },
  "125": {
    A001: "Issuance and applicability",
    A002: "Definitions and abbreviations",
    A003: "Airplane authorizations",
    A004: "Summary of special authorizations and limitations",
    A005: "Exemptions, deviations, and waivers",
    A006: "Management personnel",
    A007: "Designated persons",
    A008: "Operational control",
    A025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    A031: "Authorization for a SMS",
    A049: "Carriage of hazardous materials",
    A449: "Antidrug and alcohol misuse prevention program",
    B031: "Area navigation (RNAV) / long-range navigation authorization",
    B046: "Reduced vertical separation minimums (RVSM)",
    C060: "Takeoff minimums",
    C070: "Airport authorizations and limitations",
    D072: "Aircraft maintenance program",
    D091: "RVSM maintenance program",
    D095: "Minimum Equipment List (MEL) authorization",
    D100: "Maintenance performed away from main base",
    E095: "Weight and balance control program",
    H101: "Training program — FAA-approved curricula",
  },
  "129": {
    A001: "Issuance and applicability",
    A002: "Definitions and abbreviations",
    A003: "Airplane authorizations",
    A004: "Summary of special authorizations and limitations",
    A005: "Exemptions, deviations, and waivers",
    A008: "Operational control",
    A025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    A031: "Safety Management System (SMS)",
    A049: "Carriage of hazardous materials",
    A060: "Ratings under a BASA with maintenance provisions",
    A449: "Antidrug and alcohol misuse prevention program",
    B031: "IFR area / long-range navigation authorization",
    B036: "NAT-HLA / MNPS authorization",
    B046: "RVSM authorization",
    C070: "Airport authorizations and limitations",
    D091: "RVSM maintenance requirements",
    D095: "Minimum Equipment List (MEL) recognition",
  },
  "133": {
    A001: "Issuance and applicability",
    A002: "Definitions and abbreviations",
    A003: "Rotorcraft authorizations and external-load classes",
    A004: "Summary of special authorizations and limitations",
    A005: "Exemptions, deviations, and waivers",
    A006: "Management personnel",
    A025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    A035: "Human external cargo (HEC) / personnel carrying device system (PCDS)",
    A036: "Night external-load operations",
    A037: "Congested-area plan",
    A449: "Antidrug and alcohol misuse prevention program",
    B050: "Special-use airspace and areas of operation",
  },
  "135": {
    A001: "Issuance and applicability",
    A002: "Definitions and abbreviations",
    A003: "Aircraft authorizations and airman authorizations",
    A004: "Summary of special authorizations and limitations",
    A005: "Exemptions, deviations, and waivers",
    A006: "Management personnel",
    A007: "Designated persons",
    A008: "Operational control",
    A015: "Aviation Safety Action Program (ASAP)",
    A021: "Flight Operational Quality Assurance (FOQA) program",
    A024: "Helicopter air ambulance (HAA) operations",
    A025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    A031: "Safety Management System (SMS)",
    A039: "ETOPS / long-range over-water authorization",
    A049: "Carriage of hazardous materials (will carry / will not carry)",
    A449: "Antidrug and alcohol misuse prevention program",
    B031: "IFR area or long-range navigation authorization",
    B034: "IFR class II navigation using GNSS",
    B036: "NAT-HLA / MNPS authorization",
    B046: "Reduced vertical separation minimums (RVSM)",
    B050: "Special airports — pilot qualifications",
    C052: "Straight-in instrument approach — higher than standard minimums",
    C055: "IFR alternate-airport minimums",
    C070: "Airport authorizations and limitations",
    C078: "CAT II/III operations",
    D070: "Continuing Analysis and Surveillance System (CASS)",
    D072: "Aircraft maintenance program",
    D085: "Aircraft inspection program (AAIP / progressive / manufacturer's)",
    D091: "RVSM maintenance program",
    D095: "Minimum Equipment List (MEL) authorization",
    D100: "Maintenance performed away from main base",
    D107: "Contract maintenance — line maintenance providers",
    E095: "Weight and balance control program",
    H101: "Training program — FAA-approved curricula",
    N410: "Airplane-specific exemptions and deviations",
  },
  "137": {
    A001: "Issuance and applicability",
    A002: "Definitions and abbreviations",
    A003: "Aircraft authorizations",
    A004: "Summary of special authorizations and limitations",
    A005: "Exemptions, deviations, and waivers",
    A025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    A033: "Dispensing of economic poisons (restricted-category dispensing)",
    A034: "Night agricultural operations",
    A037: "Operations over congested areas",
    A449: "Antidrug and alcohol misuse prevention program",
  },
  "141": {
    A001: "Issuance and applicability",
    A002: "Definitions and abbreviations",
    A003: "Approved courses of training",
    A004: "Summary of special authorizations and limitations",
    A005: "Exemptions, deviations, and waivers",
    A006: "Management personnel (Chief Instructor / Assistant Chief)",
    A007: "Designated persons",
    A025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    A081: "Examining authority",
    A101: "Additional fixed-base locations / satellite operations",
  },
  "142": {
    T001: "Issuance and applicability",
    T002: "Definitions and abbreviations",
    T003: "Authorized training courses (core / specialty / test)",
    T004: "Summary of special authorizations and limitations",
    T005: "Exemptions, deviations, and waivers",
    T007: "Designated persons",
    T025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    T040: "Approved training curricula",
    T050: "Flight simulation training device (FSTD) qualification",
    T060: "Training center satellite locations",
    T080: "Advanced Qualification Program (AQP) training-center authorization",
  },
  "147": {
    T001: "Issuance and applicability",
    T002: "Definitions and abbreviations",
    T003: "Authorized ratings (Airframe / Powerplant)",
    T004: "Summary of special authorizations and limitations",
    T025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    T040: "Approved curriculum subjects and hours",
    T060: "Satellite campus authorization",
    T070: "Distance learning / online training authorization",
  },
  "91K": {
    MA001: "Issuance and applicability",
    MA002: "Definitions and abbreviations",
    MA003: "Program manager authorizations",
    MA004: "Summary of special authorizations and limitations",
    MA005: "Exemptions, deviations, and waivers",
    MA006: "Management personnel",
    MA007: "Designated persons",
    MA025: "Electronic/digital recordkeeping, electronic signature, and electronic media",
    MA031: "Safety Management System (SMS)",
    MA039: "ETOPS / long-range over-water authorization",
    MA049: "Carriage of hazardous materials",
    MA449: "Antidrug and alcohol misuse prevention program",
    MB031: "IFR area / long-range navigation authorization",
    MB036: "NAT-HLA / MNPS authorization",
    MB046: "Reduced vertical separation minimums (RVSM)",
    MC070: "Airport authorizations and limitations",
    MD072: "Aircraft inspection program",
    MD091: "RVSM maintenance program",
    MD095: "Minimum Equipment List (MEL) authorization",
    ME095: "Weight and balance control program",
    MH101: "Training program — FAA-approved curricula",
  },
  "91LOA": {
    A056: "Data-link Mandate (FANS-1/A or CPDLC) authorization",
    A061: "Use of Electronic Flight Bag (EFB) — Part 91 operator",
    B034: "Oceanic RNP-10 authorization",
    B036: "NAT-HLA / MNPS authorization",
    B039: "RNP-4 oceanic authorization",
    B040: "CPDLC / ADS-C in oceanic airspace",
    B046: "RVSM authorization",
    B054: "Polar operations authorization",
    C052: "Special authorization — Category I, II, III (SA CAT)",
    C063: "IFR flight using Localizer Performance with Vertical (LPV)",
    C384: "RNP-AR (RNP authorization required) approach operations",
    H110: "Alternative helicopter training — night vision imaging systems",
    B345: "Data-link communications (FANS / CPDLC) — domestic",
    "ADSB-OUT": "ADS-B Out deviation / authorization",
  },
};

function normalizedCertPart(certPart?: string): FaaCertPart {
  const valid: FaaCertPart[] = [
    "145", "121", "125", "129", "133", "135",
    "137", "141", "142", "147", "91K", "91LOA",
  ];
  if (certPart && (valid as string[]).includes(certPart)) return certPart as FaaCertPart;
  return "145";
}

function titleForParagraph(certPart: string, paragraph: string, explicit?: string): string | undefined {
  if (explicit && explicit.trim()) return explicit.trim();
  const cp = normalizedCertPart(certPart);
  return TITLE_BY_CERT_AND_PARAGRAPH[cp]?.[paragraph.trim()];
}

async function resolveProfileForProject(ctx: any, projectId: string) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  if (project.companyId) {
    const byCompany = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", project.companyId))
      .first();
    if (!byCompany) throw new Error("Organization profile not found");
    return byCompany;
  }
  const byProject = await ctx.db
    .query("entityProfiles")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .first();
  if (!byProject) throw new Error("Entity profile not found");
  return byProject;
}

async function resolveProfileForCompany(ctx: any, companyId: string) {
  const profile = await ctx.db
    .query("entityProfiles")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
    .first();
  if (!profile) throw new Error("Organization profile not found");
  return profile;
}

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectOwner(ctx, projectId);
    const profile = await resolveProfileForProject(ctx, projectId);
    const rows = await ctx.db
      .query("entityOpSpecs")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort(sortRows);
    return rows;
  },
});

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await requireCompanyRole(ctx, companyId, ["company_admin", "company_manager", "company_user"]);
    const profile = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .first();
    if (!profile) return [];
    const rows = await ctx.db
      .query("entityOpSpecs")
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", profile._id))
      .collect();
    rows.sort(sortRows);
    return rows;
  },
});

function sortRows(a: any, b: any): number {
  const cpa = String(a.certPart ?? "145");
  const cpb = String(b.certPart ?? "145");
  if (cpa !== cpb) return cpa.localeCompare(cpb);
  return String(a.paragraph ?? "").localeCompare(String(b.paragraph ?? ""));
}

export const addOrUpdate = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    authority: v.optional(v.union(v.literal("faa"), v.literal("easa"), v.literal("other"))),
    certPart: v.optional(certPartValidator),
    docType: v.optional(docTypeValidator),
    paragraph: v.string(),
    title: v.optional(v.string()),
    acceptedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required");
    }
    let profile: any;
    if (args.projectId) {
      await requireProjectOwner(ctx, args.projectId);
      profile = await resolveProfileForProject(ctx, args.projectId);
    } else {
      await requireCompanyRole(ctx, args.companyId!, ["company_admin", "company_manager"]);
      profile = await resolveProfileForCompany(ctx, args.companyId!);
    }
    const now = new Date().toISOString();
    const paragraph = args.paragraph.trim();
    const certPart = normalizedCertPart(args.certPart);
    const docType = args.docType ?? DOC_TYPE_FOR_CERT_PART[certPart];

    // Prefer the new composite index; we need an identity key that is unique
    // per (entityProfile, certPart, paragraph).
    const candidates = await ctx.db
      .query("entityOpSpecs")
      .withIndex("by_entityProfileId_certPart_paragraph", (q: any) =>
        q.eq("entityProfileId", profile._id).eq("certPart", certPart).eq("paragraph", paragraph),
      )
      .collect();
    // Fallback: older rows (pre-migration) may have missing certPart but same paragraph.
    // Only consider them a match when the intended certPart is "145" (legacy default).
    let existing = candidates[0];
    if (!existing && certPart === "145") {
      existing = await ctx.db
        .query("entityOpSpecs")
        .withIndex("by_entityProfileId_paragraph", (q: any) =>
          q.eq("entityProfileId", profile._id).eq("paragraph", paragraph),
        )
        .filter((q: any) => q.eq(q.field("certPart"), undefined))
        .first();
    }

    const patch = {
      authority: args.authority ?? "faa",
      certPart,
      docType,
      title: titleForParagraph(certPart, paragraph, args.title),
      acceptedDate: args.acceptedDate,
      expiryDate: args.expiryDate,
      notes: args.notes,
      isActive: args.isActive,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("entityOpSpecs", {
      entityProfileId: profile._id,
      projectId: profile.projectId,
      companyId: profile.companyId,
      paragraph,
      ...patch,
      createdAt: now,
    });
  },
});

export const remove = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    opSpecId: v.id("entityOpSpecs"),
  },
  handler: async (ctx, { projectId, companyId, opSpecId }) => {
    if (!projectId && !companyId) {
      throw new Error("projectId or companyId is required");
    }
    let profile: any;
    if (projectId) {
      await requireProjectOwner(ctx, projectId);
      profile = await resolveProfileForProject(ctx, projectId);
    } else {
      await requireCompanyRole(ctx, companyId!, ["company_admin", "company_manager"]);
      profile = await resolveProfileForCompany(ctx, companyId!);
    }
    const row = await ctx.db.get(opSpecId);
    if (!row) return;
    if (String(row.entityProfileId) !== String(profile._id)) {
      throw new Error("OpSpec does not belong to this profile");
    }
    await ctx.db.delete(opSpecId);
  },
});

/**
 * One-off, idempotent migration:
 *   1. Stamps `certPart = "145"` + `docType = "opspec"` on every legacy
 *      FAA row that lacks a certPart and whose paragraph starts with A/D.
 *   2. Renames paragraph "D101" to "D107" (rename shipped with the
 *      comprehensive catalog refresh).
 *   3. Deletes placeholder "Series X" rows left over from the prior coarse
 *      121/135 letter-series checklist; the per-paragraph 121/135 catalogs
 *      supersede them.
 *
 * Restricted to AeroGap staff. Safe to run multiple times.
 */
export const migrateCertParts = internalMutation({
  args: {},
  handler: async (ctx) => {
    await requireAerogapEmployee(ctx);
    const all = await ctx.db.query("entityOpSpecs").collect();
    const now = new Date().toISOString();
    let stamped = 0;
    let renamed = 0;
    let deleted = 0;
    for (const row of all as any[]) {
      const paragraph: string = row.paragraph ?? "";
      if (paragraph.startsWith("Series ")) {
        await ctx.db.delete(row._id);
        deleted += 1;
        continue;
      }
      const needsStamp = !row.certPart;
      const isLegacy145 = /^[AD]\d/.test(paragraph);
      if (needsStamp && isLegacy145) {
        await ctx.db.patch(row._id, {
          certPart: "145",
          docType: "opspec",
          updatedAt: now,
        });
        stamped += 1;
      }
      if (paragraph === "D101") {
        await ctx.db.patch(row._id, {
          paragraph: "D107",
          certPart: "145",
          docType: "opspec",
          title: TITLE_BY_CERT_AND_PARAGRAPH["145"]["D107"],
          updatedAt: now,
        });
        renamed += 1;
      }
    }
    return { stamped, renamed, deleted, total: all.length };
  },
});
