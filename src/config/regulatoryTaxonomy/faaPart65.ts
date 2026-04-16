/**
 * 14 CFR Part 65 — certificated airmen other than pilots (subset for repair station context).
 */

export const FAA_AIRMAN_CERTS = [
  { id: "repairman", label: "Repairman (experimental / certificated)" },
  { id: "ap_mechanic", label: "Mechanic — Airframe and Powerplant (A&P)" },
  { id: "ia", label: "Inspection Authorization (IA)" },
  { id: "parachute_rigger", label: "Parachute rigger" },
  { id: "dispatcher", label: "Dispatcher (Part 65 Subpart C)" },
  { id: "flight_engineer", label: "Flight engineer (legacy)" },
] as const;

export type FaaAirmanCertId = (typeof FAA_AIRMAN_CERTS)[number]["id"];
