/**
 * Typical Part 145 repair station administrative hierarchy (FAA / industry convention).
 * Used as a reference overlay — not prescriptive for every certificate holder.
 * @see 14 CFR Part 145 — accountable manager, supervisory personnel, inspection staff
 */
export type OrgTemplateNode = {
  id: string;
  title: string;
  department?: string;
  children?: OrgTemplateNode[];
};

export const PART145_ORG_TEMPLATE: OrgTemplateNode = {
  id: "accountable-manager",
  title: "Accountable Manager",
  department: "Administration",
  children: [
    {
      id: "dom",
      title: "Director of Maintenance",
      department: "Maintenance",
      children: [
        {
          id: "production-manager",
          title: "Production / Maintenance Manager",
          department: "Maintenance",
          children: [
            {
              id: "crew-chief",
              title: "Crew Chief / Line Supervisor",
              department: "Maintenance",
              children: [
                { id: "mechanic", title: "Mechanic / Technician", department: "Maintenance" },
              ],
            },
          ],
        },
        {
          id: "avionics-lead",
          title: "Avionics Lead",
          department: "Avionics",
          children: [{ id: "avionics-tech", title: "Avionics Technician", department: "Avionics" }],
        },
      ],
    },
    {
      id: "chief-inspector",
      title: "Chief Inspector / Quality Manager",
      department: "Quality Assurance",
      children: [
        { id: "inspector", title: "Inspector / QA Auditor", department: "Quality Assurance" },
        { id: "rii", title: "RII / Inspection Authorization", department: "Quality Assurance" },
      ],
    },
    {
      id: "safety-manager",
      title: "Safety Manager (SMS)",
      department: "Safety",
    },
    {
      id: "stores-manager",
      title: "Stores / Receiving Manager",
      department: "Stores / Parts",
    },
  ],
};

export const ORG_CHART_LEGEND = [
  { style: "solid", label: "Administrative line (primary manager)" },
  { style: "dashed", label: "Functional line (aircraft / crew context)" },
] as const;
