import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import {
  useIsAdmin,
  useIsAerogapEmployee,
  useIsLogbookEnabled,
  useIsFeatureEnabled,
  useIsQualityCommandHubAvailable,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';

type Action = { label: string; path: string; keywords?: string[] };

export default function CommandPalette() {
  const { isSignedIn } = useUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isAdmin = useIsAdmin();
  const isAerogapEmployee = useIsAerogapEmployee();
  const isLogbookEnabled = useIsLogbookEnabled();
  const isQualityHub = useIsQualityCommandHubAvailable();
  const isLibrary = useIsFeatureEnabled(FEATURE_KEYS.LIBRARY);
  const isPaperwork = useIsFeatureEnabled(FEATURE_KEYS.PAPERWORK_REVIEW);
  const isRevisions = useIsFeatureEnabled(FEATURE_KEYS.REVISIONS);
  const isSchedule = useIsFeatureEnabled(FEATURE_KEYS.SCHEDULE);
  const isChecklists = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const isGuidedAudit = useIsFeatureEnabled(FEATURE_KEYS.GUIDED_AUDIT);
  const isEntityIssues = useIsFeatureEnabled(FEATURE_KEYS.ENTITY_ISSUES);
  const isAuditSim = useIsFeatureEnabled(FEATURE_KEYS.AUDIT_SIMULATION);
  const isReportBuilder = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);
  const isDct = useIsFeatureEnabled(FEATURE_KEYS.DCT_COMPLIANCE);
  const isManualWriter = useIsFeatureEnabled(FEATURE_KEYS.MANUAL_WRITER);
  const isManualMgmt = useIsFeatureEnabled(FEATURE_KEYS.MANUAL_MANAGEMENT);
  const isForm337 = useIsFeatureEnabled(FEATURE_KEYS.FORM_337);
  const isAnalytics = useIsFeatureEnabled(FEATURE_KEYS.ANALYTICS);

  // Toggle on ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!isSignedIn) return null;

  const actions: Action[] = [
    { label: 'Home', path: '/splash', keywords: ['dashboard', 'start'] },
    ...(isQualityHub ? [{ label: 'Quality & Compliance', path: '/quality-command-center' }] : []),
    ...(isLibrary ? [{ label: 'Library', path: '/library' }] : []),
    ...(isPaperwork ? [{ label: 'Paperwork Review', path: '/review' }] : []),
    ...(isRevisions ? [{ label: 'Revisions', path: '/revisions' }] : []),
    ...(isSchedule ? [{ label: 'Recurring Schedule', path: '/schedule' }] : []),
    ...(isChecklists ? [{ label: 'Checklists', path: '/checklists' }] : []),
    ...(isGuidedAudit ? [{ label: 'Guided Audit', path: '/guided-audit' }] : []),
    ...(isEntityIssues ? [{ label: 'Roster', path: '/roster' }] : []),
    ...(isEntityIssues ? [{ label: 'CARs & Issues', path: '/entity-issues' }] : []),
    ...(isAuditSim ? [{ label: 'Audit Simulation', path: '/audit' }] : []),
    ...(isReportBuilder ? [{ label: 'Report Builder', path: '/report' }] : []),
    ...(isDct ? [{ label: 'DCT Compliance', path: '/dct-compliance' }] : []),
    ...(isManualWriter ? [{ label: 'Manual Writer', path: '/manual-writer' }] : []),
    ...(isManualMgmt ? [{ label: 'Manuals', path: '/manual-management' }] : []),
    { label: 'Entry Review', path: '/logbook/entry-review', keywords: ['logbook'] },
    ...(isLogbookEnabled ? [{ label: 'Fleet & Discrepancies', path: '/fleet' }] : []),
    ...(isForm337 ? [{ label: 'FAA Form 337', path: '/form-337' }] : []),
    ...(isAnalytics ? [{ label: 'Analytics', path: '/analytics' }] : []),
    { label: 'Settings', path: '/settings' },
    { label: 'Help Center', path: '/help', keywords: ['support', 'docs'] },
    ...(isAerogapEmployee ? [{ label: 'Companies', path: '/companies' }] : []),
    ...(isAdmin ? [{ label: 'Admin Panel', path: '/admin' }] : []),
  ];

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command menu"
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh] bg-black/55 backdrop-blur-sm"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-[#0c1420]/95 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          placeholder="Jump to…"
          className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
        />
        <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto scrollbar-thin p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-white/50">
            No matches.
          </Command.Empty>
          <Command.Group
            heading="Go to"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-white/40"
          >
            {actions.map((action) => (
              <Command.Item
                key={action.path}
                value={`${action.label} ${(action.keywords ?? []).join(' ')}`}
                onSelect={() => go(action.path)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 aria-selected:bg-sky/20 aria-selected:text-white"
              >
                {action.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
