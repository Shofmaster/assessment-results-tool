import { v } from "convex/values";

export const dctQuestionInValidator = v.object({
  questionId: v.string(),
  questionDetailsId: v.optional(v.string()),
  qVersionNumber: v.optional(v.string()),
  qVersionDate: v.optional(v.string()),
  displayOrder: v.optional(v.number()),
  text: v.string(),
  safetyAttribute: v.optional(v.string()),
  questionType: v.optional(v.string()),
  scopingAttribute: v.optional(v.string()),
  noteToUser: v.optional(v.string()),
  references: v.array(
    v.object({
      srcId: v.optional(v.string()),
      label: v.string(),
    }),
  ),
  responses: v.array(v.string()),
});

/** Full parsed DCT tool document shape (matches client ParsedDctToolDocument). */
export const dctParsedToolDocumentInValidator = v.object({
  fileName: v.string(),
  contentHash: v.string(),
  standardDctId: v.optional(v.string()),
  standardDctDetailId: v.optional(v.string()),
  dctVersionNumber: v.optional(v.string()),
  dctVersionDate: v.optional(v.string()),
  dctStatus: v.optional(v.string()),
  mlfId: v.optional(v.string()),
  mlfLabel: v.optional(v.string()),
  mlfName: v.optional(v.string()),
  assessmentTypeLabel: v.optional(v.string()),
  specialtyLabel: v.optional(v.string()),
  peerGroupLabel: v.optional(v.string()),
  purpose: v.optional(v.string()),
  objective: v.optional(v.string()),
  questions: v.array(dctQuestionInValidator),
});
