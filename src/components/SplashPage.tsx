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
  const [agentResponse, setAgentResponse] = useState('');
  const [agentRoute, setAgentRoute] = useState<string[]>([]);

  const normalizedQuery = query.trim().toLowerCase();

  const internalResults = useMemo(() => {
    if (!normalizedQuery) return INTERNAL_DESTINATIONS;
    return INTERNAL_DESTINATIONS.filter((item) => {
      const haystack = `${item.label} ${item.description} ${item.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  const suggestedAgents = useMemo(() => {
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const scored = AUDIT_AGENTS.map((agent) => {
      const haystack = `${agent.name} ${agent.role} ${agent.id}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (token.length < 3) continue;
        if (haystack.includes(token)) score += 2;
      }
      if (normalizedQuery.includes('faa') && agent.id === 'faa-inspector') score += 4;
      if (normalizedQuery.includes('easa') && agent.id === 'easa-inspector') score += 4;
      if (normalizedQuery.includes('isbao') && agent.id === 'isbao-auditor') score += 4;
      if (normalizedQuery.includes('nasa') && agent.id === 'nasa-auditor') score += 4;
      if (normalizedQuery.includes('safety') && agent.id === 'safety-auditor') score += 3;
      if (normalizedQuery.includes('sms') && agent.id === 'sms-consultant') score += 3;
      if (normalizedQuery.includes('quality') && agent.id === 'as9100-auditor') score += 3;
      return { agent, score };
    })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.agent);
    return scored.length > 0 ? scored : AUDIT_AGENTS.slice(0, 3);
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

    if (target === 'agents') {
      setIsLoading(true);
      setAgentResponse('');
      setAgentRoute([]);
      try {
        const routed = suggestedAgents;
        const availableAgents = routed
          .map((agent) => `- ${agent.name} (${agent.id}): ${agent.role}`)
          .join('\n');
        const system = [
          'You are an audit assistant router for AeroGap.',
          'Automatically answer the user question from the most relevant audit expert perspective(s).',
          'Use the listed experts only. If one expert is clearly best, answer from that expert.',
          'If multiple experts are needed, synthesize a single direct answer and clearly label viewpoints.',
          'Keep the response practical and concise.',
          '',
          'Available experts for this question:',
          availableAgents,
        ].join('\n');
        const response = await createClaudeMessage({
          model: DEFAULT_CLAUDE_MODEL,
          max_tokens: 700,
          temperature: 0.2,
          system,
          messages: [{ role: 'user', content: trimmed }],
        });
        const text = response.content
          .filter((block): block is { type: string; text?: string } => block.type === 'text')
          .map((block) => block.text || '')
          .join('\n')
          .trim();
        setAgentResponse(text || 'No response returned.');
        setAgentRoute(routed.map((agent) => agent.name));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Agent answer failed.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (target === 'internal' && internalResults.length > 0) {
      navigate(internalResults[0].path);
      return;
    }
  };

  return (
    <div className="min-h-full px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-navy-900/50 p-6 md:p-8 backdrop-blur">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sky-light shadow-lg shadow-sky/30">
            <svg className="h-11 w-11 animate-spin text-white" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <circle cx="32" cy="32" r="28" stroke="currentColor" strokeOpacity="0.35" strokeWidth="4" />
              <g fill="currentColor">
                <path d="M32 10c6 0 11 5 11 11-7 1-14-3-17-10 2-1 4-1 6-1z" />
                <path d="M47.6 16.4c4.3 4.3 4.3 11.3 0 15.6-6.2-3.3-9.6-10.6-8.2-17.6 3-.4 6 .5 8.2 2z" />
                <path d="M54 32c0 6-5 11-11 11-1-7 3-14 10-17 1 2 1 4 1 6z" />
                <path d="M47.6 47.6c-4.3 4.3-11.3 4.3-15.6 0 3.3-6.2 10.6-9.6 17.6-8.2.4 3-.5 6-2 8.2z" />
                <path d="M32 54c-6 0-11-5-11-11 7-1 14 3 17 10-2 1-4 1-6 1z" />
                <path d="M16.4 47.6c-4.3-4.3-4.3-11.3 0-15.6 6.2 3.3 9.6 10.6 8.2 17.6-3 .4-6-.5-8.2-2z" />
                <path d="M10 32c0-6 5-11 11-11 1 7-3 14-10 17-1-2-1-4-1-6z" />
                <path d="M16.4 16.4c4.3-4.3 11.3-4.3 15.6 0-3.3 6.2-10.6 9.6-17.6 8.2-.4-3 .5-6 2-8.2z" />
              </g>
              <circle cx="32" cy="32" r="7" fill="currentColor" fillOpacity="0.9" />
              <circle cx="32" cy="32" r="3" fill="#0b1f3d" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-poppins font-bold text-white">Welcome to AeroGap</h1>
          <p className="mt-2 text-sm text-white/70">Start from one search bar: internal navigation, auto-routed agent Q&A, Claude API, or web search.</p>
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
              placeholder="Ask a question or search pages..."
              className="w-full rounded-xl border border-white/15 bg-navy-800/70 px-4 py-3 text-white placeholder:text-white/40 focus:border-sky/60 focus:outline-none"
            />
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as SearchTarget)}
              className="rounded-xl border border-white/15 bg-navy-800/70 px-3 py-3 text-white focus:border-sky/60 focus:outline-none"
            >
              <option value="internal">Internal search</option>
              <option value="agents">Ask agents (auto)</option>
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
          <div className="mt-6 rounded-xl border border-sky/30 bg-sky/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-light">Agent answer (auto-routed)</p>
            {agentRoute.length > 0 && (
              <p className="mt-2 text-xs text-white/70">
                Routed to: {agentRoute.join(', ')}
              </p>
            )}
            {agentResponse ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-white/90">{agentResponse}</p>
            ) : (
              <p className="mt-2 text-sm text-white/60">Ask your question and AeroGap will route it to the most relevant agent automatically.</p>
            )}
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
