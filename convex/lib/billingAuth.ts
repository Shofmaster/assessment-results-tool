import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAuth, requireCompanyRole } from "../_helpers";
import type { BillingOwnerType } from "./billingPlans";

export async function requireBillingOwnerManageAccess(
  ctx: QueryCtx | MutationCtx,
  ownerType: BillingOwnerType,
  ownerId: string,
): Promise<string> {
  const userId = await requireAuth(ctx);
  if (ownerType === "user") {
    if (ownerId !== userId) {
      throw new Error("Not authorized: can only manage your own billing.");
    }
    return userId;
  }
  await requireCompanyRole(ctx, ownerId as Id<"companies">, ["company_admin"]);
  return userId;
}
