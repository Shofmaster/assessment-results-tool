import { mutation } from "./_generated/server";
import { requireAdmin } from "./_helpers";

export const backfillCompaniesForProjects = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = new Date().toISOString();
    const projects = await ctx.db.query("projects").collect();

    const projectsWithoutCompany = projects.filter((project) => !project.companyId);
    if (projectsWithoutCompany.length === 0) {
      return {
        companiesCreated: 0,
        membershipsCreated: 0,
        projectsUpdated: 0,
      };
    }

    const allCompanies = await ctx.db.query("companies").collect();
    const allMemberships = await ctx.db.query("companyMemberships").collect();
    const users = await ctx.db.query("users").collect();
    const userByClerkId = new Map(users.map((u) => [u.clerkUserId, u]));

    let companiesCreated = 0;
    let membershipsCreated = 0;
    let projectsUpdated = 0;

    const companyByOwner = new Map<string, string>();
    for (const company of allCompanies) {
      if (company.slug?.startsWith("legacy-")) {
        companyByOwner.set(company.slug.replace("legacy-", ""), company._id);
      }
    }

    for (const project of projectsWithoutCompany) {
      let companyId = companyByOwner.get(project.userId);
      if (!companyId) {
        const owner = userByClerkId.get(project.userId);
        const displayName = owner?.name || owner?.email || project.userId;
        companyId = await ctx.db.insert("companies", {
          name: `${displayName} Company`,
          slug: `legacy-${project.userId}`,
          isActive: true,
          createdBy: project.userId,
          createdAt: now,
          updatedAt: now,
        });
        companyByOwner.set(project.userId, companyId);
        companiesCreated += 1;
      }

      const existingMembership = allMemberships.find(
        (membership) => membership.companyId === companyId && membership.userId === project.userId
      );
      if (!existingMembership) {
        await ctx.db.insert("companyMemberships", {
          companyId: companyId as any,
          userId: project.userId,
          role: "company_admin",
          status: "active",
          addedBy: project.userId,
          createdAt: now,
          updatedAt: now,
        });
        membershipsCreated += 1;
      }

      await ctx.db.patch(project._id, {
        companyId: companyId as any,
        updatedAt: now,
      });
      projectsUpdated += 1;
    }

    return {
      companiesCreated,
      membershipsCreated,
      projectsUpdated,
    };
  },
});
