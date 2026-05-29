import type { Doc, Id } from "./_generated/dataModel";

/**
 * Publication scope resolution:
 * - empty aircraftTypeIds + empty aircraftIds → fleet-wide for company
 * - aircraftTypeIds only → all tails of those types in the publication project
 * - aircraftIds only → specific tail(s)
 * - both set → union (type-wide OR explicitly listed tails)
 */
export function publicationAppliesToAircraft(
  pub: Pick<Doc<"technicalPublications">, "aircraftIds" | "aircraftTypeIds" | "projectId">,
  aircraftId: Id<"aircraftAssets">,
  aircraftTypeId: Id<"aircraftTypes"> | undefined,
): boolean {
  const typeIds = pub.aircraftTypeIds ?? [];
  const tailIds = pub.aircraftIds ?? [];
  if (typeIds.length === 0 && tailIds.length === 0) return true;
  if (tailIds.includes(aircraftId)) return true;
  if (aircraftTypeId && typeIds.includes(aircraftTypeId)) return true;
  return false;
}

export function publicationAppliesToAircraftType(
  pub: Pick<Doc<"technicalPublications">, "aircraftIds" | "aircraftTypeIds">,
  aircraftTypeId: Id<"aircraftTypes">,
  tailIdsOfType: Id<"aircraftAssets">[],
): boolean {
  const typeIds = pub.aircraftTypeIds ?? [];
  const linkedTails = pub.aircraftIds ?? [];
  if (typeIds.length === 0 && linkedTails.length === 0) return true;
  if (typeIds.includes(aircraftTypeId)) return true;
  return tailIdsOfType.some((tid) => linkedTails.includes(tid));
}
