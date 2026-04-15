/**
 * Aggregated hook: fetches an entity's complete regulatory profile
 * (entityProfiles + class ratings + OpSpecs + limited ratings) in parallel
 * and returns a typed RegulatoryProfile ready for the DCT applicability engine.
 */

import { useMemo } from "react";
import {
  useEntityProfile,
  useEntityProfileByCompany,
  useEntityClassRatingsByProfile,
  useEntityOpSpecsByProfile,
  useEntityLimitedRatingsByProfile,
} from "./useConvexData";
import type {
  RegulatoryProfile,
  ClassRating,
  OpSpec,
  LimitedRating,
  RatingCategory,
  PeerGroup,
} from "../services/dctApplicabilityEngine";

export interface UseRegulatoryProfileResult {
  /** Fully assembled profile ready for computeApplicability(). */
  profile: RegulatoryProfile | undefined;
  /** The raw entityProfiles document. */
  entityProfileDoc: any;
  /** The raw entityClassRatings rows. */
  classRatingDocs: any[];
  /** The raw entityOpSpecs rows. */
  opSpecDocs: any[];
  /** The raw entityLimitedRatings rows. */
  limitedRatingDocs: any[];
  /** True while any of the underlying queries are still loading. */
  isLoading: boolean;
  /** True once the entity profile exists (may still have empty ratings). */
  hasProfile: boolean;
  /** True when the profile has enough data for meaningful applicability filtering. */
  isProfileComplete: boolean;
}

/** Hook for project-scoped regulatory profile. */
export function useRegulatoryProfileByProject(
  projectId: string | undefined
): UseRegulatoryProfileResult {
  const entityProfileDoc = useEntityProfile(projectId) as any;
  const entityProfileId = entityProfileDoc?._id as string | undefined;

  const classRatingDocs = useEntityClassRatingsByProfile(entityProfileId) as any[] | undefined;
  const opSpecDocs = useEntityOpSpecsByProfile(entityProfileId) as any[] | undefined;
  const limitedRatingDocs = useEntityLimitedRatingsByProfile(entityProfileId) as any[] | undefined;

  return useMemo(() => {
    const isLoading =
      entityProfileDoc === undefined ||
      classRatingDocs === undefined ||
      opSpecDocs === undefined ||
      limitedRatingDocs === undefined;

    if (isLoading || !entityProfileDoc) {
      return {
        profile: undefined,
        entityProfileDoc,
        classRatingDocs: classRatingDocs ?? [],
        opSpecDocs: opSpecDocs ?? [],
        limitedRatingDocs: limitedRatingDocs ?? [],
        isLoading,
        hasProfile: false,
        isProfileComplete: false,
      };
    }

    return buildResult(entityProfileDoc, classRatingDocs ?? [], opSpecDocs ?? [], limitedRatingDocs ?? []);
  }, [entityProfileDoc, classRatingDocs, opSpecDocs, limitedRatingDocs]);
}

/** Hook for company-scoped regulatory profile. */
export function useRegulatoryProfileByCompany(
  companyId: string | undefined
): UseRegulatoryProfileResult {
  const entityProfileDoc = useEntityProfileByCompany(companyId) as any;
  const entityProfileId = entityProfileDoc?._id as string | undefined;

  const classRatingDocs = useEntityClassRatingsByProfile(entityProfileId) as any[] | undefined;
  const opSpecDocs = useEntityOpSpecsByProfile(entityProfileId) as any[] | undefined;
  const limitedRatingDocs = useEntityLimitedRatingsByProfile(entityProfileId) as any[] | undefined;

  return useMemo(() => {
    const isLoading =
      entityProfileDoc === undefined ||
      classRatingDocs === undefined ||
      opSpecDocs === undefined ||
      limitedRatingDocs === undefined;

    if (isLoading || !entityProfileDoc) {
      return {
        profile: undefined,
        entityProfileDoc,
        classRatingDocs: classRatingDocs ?? [],
        opSpecDocs: opSpecDocs ?? [],
        limitedRatingDocs: limitedRatingDocs ?? [],
        isLoading,
        hasProfile: false,
        isProfileComplete: false,
      };
    }

    return buildResult(entityProfileDoc, classRatingDocs ?? [], opSpecDocs ?? [], limitedRatingDocs ?? []);
  }, [entityProfileDoc, classRatingDocs, opSpecDocs, limitedRatingDocs]);
}

function buildResult(
  entityProfileDoc: any,
  classRatingDocs: any[],
  opSpecDocs: any[],
  limitedRatingDocs: any[],
): UseRegulatoryProfileResult {
  const classRatings: ClassRating[] = classRatingDocs.map((r) => ({
    category: r.category as RatingCategory,
    classNumber: r.classNumber as 1 | 2 | 3 | 4,
    limitations: r.limitations,
  }));

  const opSpecs: OpSpec[] = opSpecDocs.map((s) => ({
    paragraph: s.paragraph as string,
    isActive: s.isActive as boolean,
  }));

  const limitedRatings: LimitedRating[] = limitedRatingDocs.map((r) => ({
    ratingType: r.ratingType as string,
    articleDescription: r.articleDescription as string,
    make: r.make,
    model: r.model,
    authorizedFunctions: r.authorizedFunctions ?? [],
  }));

  const profile: RegulatoryProfile = {
    peerGroup: (entityProfileDoc.peerGroup ?? "F") as PeerGroup,
    d100Authorized: entityProfileDoc.d100Authorized ?? false,
    a449Enrolled: entityProfileDoc.a449Enrolled ?? false,
    a050Authorized: entityProfileDoc.a050Authorized ?? false,
    hasLimitedRatings: entityProfileDoc.hasLimitedRatings ?? false,
    classRatings,
    opSpecs,
    limitedRatings,
  };

  const isProfileComplete = classRatings.length > 0 || opSpecs.filter((s) => s.isActive).length > 0;

  return {
    profile,
    entityProfileDoc,
    classRatingDocs,
    opSpecDocs,
    limitedRatingDocs,
    isLoading: false,
    hasProfile: true,
    isProfileComplete,
  };
}
