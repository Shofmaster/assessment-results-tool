import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AUDIT_AGENTS } from '../services/auditAgents';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';

type SearchTarget = 'agents' | 'claude' | 'web' | 'internal';

type InternalDestination = {
  path: string;
  label: string;
  description: string;
  keywords: string[];
};

const INTERNAL_DESTINATIONS: InternalDestination[] = [
  { path: '/logbook', label: 'Logbook Management', description: 'Project setup and operational records', keywords: ['logbook', 'project', 'records'] },
  { path: '/audit', label: 'Audit Simulation', description: 'Run multi-agent audit conversations', keywords: ['audit', 'simulation', 'agents'] },
  { path: '/guided-audit', label: 'Guided Audit', description: 'Step-by-step guided compliance review', keywords: ['guided', 'checklist', 'review'] },
  { path: '/review', label: 'Paperwork Review', description: 'Compare documents and generate findings', keywords: ['paperwork', 'documents', 'findings'] },
  { path: '/analysis', label: 'Analysis', description: 'Deep AI analysis of uploaded data', keywords: ['analysis', 'insights', 'ai'] },
  { path: '/library', label: 'Library', description: 'Reference and standards document library', keywords: ['library', 'references', 'standards'] },
  { path: '/schedule', label: 'Schedule', description: 'Recurring inspection planning and tracking', keywords: ['schedule', 'inspection', 'recurring'] },
  { path: '/entity-issues', label: 'CARs & Issues', description: 'Corrective action tracking', keywords: ['cars', 'issues', 'corrective'] },
];

export default function SplashPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<SearchTarget>('internal');
  const [isLoading, setIsLoading] = useState(false);
  const [claudeResponse, setClaudeResponse] = useState('');

  const normalizedQuery = query.trim().toLowerCase();

  const internalResults = useMemo(() => {
    if (!normalizedQuery) return INTERNAL_DESTINATIONS;
    return INTERNAL_DESTINATIONS.filter((item) => {
      const haystack = `${item.label} ${item.description} ${item.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  const agentResults = useMemo(() => {
    if (!normalizedQuery) return AUDIT_AGENTS;
    return AUDIT_AGENTS.filter((agent) =>
      `${agent.name} ${agent.role} ${agent.id}`.toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('Enter a search query.');
      return;
    }

    if (target === 'web') {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(trimmed)}`, '_blank', 'noopener,noreferrer');
      return;
    }

    if (target === 'claude') {
      setIsLoading(true);
      setClaudeResponse('');
      try {
        const response = await createClaudeMessage({
          model: DEFAULT_CLAUDE_MODEL,
          max_tokens: 500,
          temperature: 0.2,
          messages: [{ role: 'user', content: trimmed }],
        });
        const text = response.content
          .filter((block): block is { type: string; text?: string } => block.type === 'text')
          .map((block) => block.text || '')
          .join('\n')
          .trim();
        setClaudeResponse(text || 'No response returned.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Claude request failed.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (target === 'internal' && internalResults.length > 0) {
      navigate(internalResults[0].path);
      return;
    }

    if (target === 'agents' && agentResults.length > 0) {
      navigate(`/audit?agent=${encodeURIComponent(agentResults[0].id)}`);
    }
  };

  return (
    <div className="min-h-full px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-navy-900/50 p-6 md:p-8 backdrop-blur">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sky-light shadow-lg shadow-sky/30">
            <svg className="h-10 w-10 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-poppins font-bold text-white">Welcome to AeroGap</h1>
          <p className="mt-2 text-sm text-white/70">Start from one search bar: internal navigation, audit agents, Claude API, or web search.</p>
        </div>

        <form onSubmit={handleSearch} className="mt-8 space-y-3">
          <label htmlFor="splash-search" className="sr-only">
            Search AeroGap
          </label>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              id="splash-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents, pages, or ask Claude..."
              className="w-full rounded-xl border border-white/15 bg-navy-800/70 px-4 py-3 text-white placeholder:text-white/40 focus:border-sky/60 focus:outline-none"
            />
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as SearchTarget)}
              className="rounded-xl border border-white/15 bg-navy-800/70 px-3 py-3 text-white focus:border-sky/60 focus:outline-none"
            >
              <option value="internal">Internal search</option>
              <option value="agents">Agents</option>
              <option value="claude">Claude API</option>
              <option value="web">Web search</option>
            </select>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-sky px-5 py-3 font-semibold text-white hover:bg-sky-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {target === 'internal' && (
          <div className="mt-6 space-y-2">
            {internalResults.slice(0, 8).map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
              >
                <div className="text-sm font-semibold text-white">{item.label}</div>
                <div className="text-xs text-white/65">{item.description}</div>
              </button>
            ))}
            {internalResults.length === 0 && <p className="text-sm text-white/60">No internal matches found.</p>}
          </div>
        )}

        {target === 'agents' && (
          <div className="mt-6 grid gap-2 md:grid-cols-2">
            {agentResults.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => navigate(`/audit?agent=${encodeURIComponent(agent.id)}`)}
                className="rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
              >
                <div className="text-sm font-semibold text-white">{agent.avatar} {agent.name}</div>
                <div className="text-xs text-white/65">{agent.role}</div>
              </button>
            ))}
            {agentResults.length === 0 && <p className="text-sm text-white/60">No agents match this query.</p>}
          </div>
        )}

        {target === 'claude' && claudeResponse && (
          <div className="mt-6 rounded-xl border border-sky/30 bg-sky/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-light">Claude response</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-white/90">{claudeResponse}</p>
          </div>
        )}
      </div>
    </div>
  );
}
