import CompanyAdminPanel from "./CompanyAdminPanel";

export default function TenantCompanyAdmin() {
  return (
    <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8 h-full min-h-0 overflow-auto">
      <div className="max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">Company administration</h1>
          <p className="text-sm text-white/65 mt-1">
            Manage members, delegated support, and feature policy for companies where you are an administrator.
          </p>
        </div>
        <CompanyAdminPanel mode="tenant" />
      </div>
    </div>
  );
}
