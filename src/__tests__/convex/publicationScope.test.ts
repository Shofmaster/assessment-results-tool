import { describe, expect, it } from 'vitest';
import {
  publicationAppliesToAircraft,
  publicationAppliesToAircraftType,
} from '../../../convex/publicationScope';
import type { Id } from '../../../convex/_generated/dataModel';

const tailA = 'tailA' as Id<'aircraftAssets'>;
const tailB = 'tailB' as Id<'aircraftAssets'>;
const typeG650 = 'typeG650' as Id<'aircraftTypes'>;
const typePhenom = 'typePhenom' as Id<'aircraftTypes'>;
const projectId = 'proj' as Id<'projects'>;

describe('publicationScope', () => {
  it('treats empty scope as fleet-wide', () => {
    const pub = { projectId, aircraftIds: undefined, aircraftTypeIds: undefined };
    expect(publicationAppliesToAircraft(pub, tailA, typeG650)).toBe(true);
    expect(publicationAppliesToAircraftType(pub, typeG650, [tailA])).toBe(true);
  });

  it('matches explicit tail link', () => {
    const pub = { projectId, aircraftIds: [tailA], aircraftTypeIds: undefined };
    expect(publicationAppliesToAircraft(pub, tailA, typeG650)).toBe(true);
    expect(publicationAppliesToAircraft(pub, tailB, typeG650)).toBe(false);
  });

  it('matches type-wide link for any tail of that type', () => {
    const pub = { projectId, aircraftIds: undefined, aircraftTypeIds: [typeG650] };
    expect(publicationAppliesToAircraft(pub, tailA, typeG650)).toBe(true);
    expect(publicationAppliesToAircraft(pub, tailB, typePhenom)).toBe(false);
  });

  it('union when both type and tail links are set', () => {
    const pub = { projectId, aircraftIds: [tailB], aircraftTypeIds: [typeG650] };
    expect(publicationAppliesToAircraft(pub, tailA, typeG650)).toBe(true);
    expect(publicationAppliesToAircraft(pub, tailB, typePhenom)).toBe(true);
    expect(publicationAppliesToAircraft(pub, 'other' as Id<'aircraftAssets'>, typePhenom)).toBe(false);
  });

  it('filters by type including explicitly linked tails of that type', () => {
    const pub = { aircraftIds: [tailA], aircraftTypeIds: undefined };
    expect(publicationAppliesToAircraftType(pub, typeG650, [tailA, tailB])).toBe(true);
    const pub2 = { aircraftIds: undefined, aircraftTypeIds: [typeG650] };
    expect(publicationAppliesToAircraftType(pub2, typeG650, [tailA])).toBe(true);
    expect(publicationAppliesToAircraftType(pub2, typePhenom, [tailB])).toBe(false);
  });
});
