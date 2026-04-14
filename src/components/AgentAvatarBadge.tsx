import {
  FiShield,
  FiGlobe,
  FiAward,
  FiClipboard,
  FiZap,
  FiBarChart2,
  FiSearch,
  FiHome,
  FiPackage,
  FiTool,
  FiSliders,
  FiUser,
  FiCpu,
  FiRadio,
  FiStar,
  FiLock,
  FiBox,
  FiGrid,
  FiActivity,
  FiAlertTriangle,
} from 'react-icons/fi';
import type { ComponentType } from 'react';

type IconComponent = ComponentType<{ className?: string; size?: number }>;

interface AgentIconConfig {
  icon: IconComponent;
  bg: string;
  text: string;
  ring: string;
}

const AGENT_ICON_MAP: Record<string, AgentIconConfig> = {
  'faa-inspector':                 { icon: FiShield,       bg: 'bg-blue-600/80',    text: 'text-blue-100',   ring: 'ring-blue-400/40' },
  'easa-inspector':                { icon: FiGlobe,        bg: 'bg-indigo-600/80',  text: 'text-indigo-100', ring: 'ring-indigo-400/40' },
  'isbao-auditor':                 { icon: FiAward,        bg: 'bg-emerald-600/80', text: 'text-emerald-100',ring: 'ring-emerald-400/40' },
  'as9100-auditor':                { icon: FiClipboard,    bg: 'bg-violet-600/80',  text: 'text-violet-100', ring: 'ring-violet-400/40' },
  'nasa-auditor':                  { icon: FiZap,          bg: 'bg-zinc-600/80',    text: 'text-zinc-100',   ring: 'ring-zinc-400/40' },
  'sms-consultant':                { icon: FiBarChart2,    bg: 'bg-teal-600/80',    text: 'text-teal-100',   ring: 'ring-teal-400/40' },
  'safety-auditor':                { icon: FiSearch,       bg: 'bg-rose-600/80',    text: 'text-rose-100',   ring: 'ring-rose-400/40' },
  'public-use-auditor':            { icon: FiHome,         bg: 'bg-stone-600/80',   text: 'text-stone-100',  ring: 'ring-stone-400/40' },
  'airworthiness-auditor':         { icon: FiActivity,     bg: 'bg-sky-600/80',     text: 'text-sky-100',    ring: 'ring-sky-400/40' },
  'supply-chain-auditor':          { icon: FiPackage,      bg: 'bg-orange-600/80',  text: 'text-orange-100', ring: 'ring-orange-400/40' },
  'shop-owner':                    { icon: FiTool,         bg: 'bg-amber-600/80',   text: 'text-amber-100',  ring: 'ring-amber-400/40' },
  'dom-maintenance-manager':       { icon: FiSliders,      bg: 'bg-slate-600/80',   text: 'text-slate-100',  ring: 'ring-slate-400/40' },
  'chief-inspector-quality-manager':{ icon: FiClipboard,  bg: 'bg-slate-700/80',   text: 'text-slate-100',  ring: 'ring-slate-400/40' },
  'entity-safety-manager':         { icon: FiShield,       bg: 'bg-teal-700/80',    text: 'text-teal-100',   ring: 'ring-teal-400/40' },
  'general-manager':               { icon: FiGrid,         bg: 'bg-slate-500/80',   text: 'text-slate-100',  ring: 'ring-slate-300/40' },
  'audit-intelligence-analyst':    { icon: FiCpu,          bg: 'bg-purple-600/80',  text: 'text-purple-100', ring: 'ring-purple-400/40' },
  'do178c-auditor':                { icon: FiCpu,          bg: 'bg-blue-700/80',    text: 'text-blue-100',   ring: 'ring-blue-400/40' },
  'do254-auditor':                 { icon: FiRadio,        bg: 'bg-red-600/80',     text: 'text-red-100',    ring: 'ring-red-400/40' },
  'systems-safety-auditor':        { icon: FiAlertTriangle,bg: 'bg-yellow-600/80',  text: 'text-yellow-100', ring: 'ring-yellow-400/40' },
  'do160-auditor':                 { icon: FiZap,          bg: 'bg-orange-700/80',  text: 'text-orange-100', ring: 'ring-orange-400/40' },
  'nadcap-auditor':                { icon: FiStar,         bg: 'bg-pink-600/80',    text: 'text-pink-100',   ring: 'ring-pink-400/40' },
  'defense-auditor':               { icon: FiShield,       bg: 'bg-gray-700/80',    text: 'text-gray-100',   ring: 'ring-gray-400/40' },
  'space-systems-auditor':         { icon: FiZap,          bg: 'bg-indigo-700/80',  text: 'text-indigo-100', ring: 'ring-indigo-400/40' },
  'cybersecurity-auditor':         { icon: FiLock,         bg: 'bg-red-700/80',     text: 'text-red-100',    ring: 'ring-red-400/40' },
  'uas-evtol-auditor':             { icon: FiActivity,     bg: 'bg-cyan-600/80',    text: 'text-cyan-100',   ring: 'ring-cyan-400/40' },
  'laboratory-auditor':            { icon: FiBox,          bg: 'bg-lime-600/80',    text: 'text-lime-100',   ring: 'ring-lime-400/40' },
  'additive-mfg-auditor':          { icon: FiBox,          bg: 'bg-amber-700/80',   text: 'text-amber-100',  ring: 'ring-amber-400/40' },
};

const DEFAULT_CONFIG: AgentIconConfig = {
  icon: FiUser,
  bg: 'bg-white/20',
  text: 'text-white',
  ring: 'ring-white/20',
};

interface AgentAvatarBadgeProps {
  agentId: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: { wrapper: 'w-7 h-7', icon: 14 },
  md: { wrapper: 'w-9 h-9', icon: 17 },
  lg: { wrapper: 'w-12 h-12', icon: 22 },
};

export function AgentAvatarBadge({ agentId, size = 'md', className = '' }: AgentAvatarBadgeProps) {
  const config = AGENT_ICON_MAP[agentId] ?? DEFAULT_CONFIG;
  const Icon = config.icon;
  const { wrapper, icon: iconSize } = SIZE_CLASSES[size];

  return (
    <div
      className={`${wrapper} rounded-full ${config.bg} ${config.text} ring-1 ${config.ring} flex items-center justify-center shrink-0 ${className}`}
      aria-hidden
    >
      <Icon size={iconSize} />
    </div>
  );
}

/** Render the host (user) avatar badge. */
export function HostAvatarBadge({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { wrapper, icon: iconSize } = SIZE_CLASSES[size];
  return (
    <div
      className={`${wrapper} rounded-full bg-sky/20 text-sky-lighter ring-1 ring-sky/30 flex items-center justify-center shrink-0 ${className}`}
      aria-hidden
    >
      <FiUser size={iconSize} />
    </div>
  );
}
