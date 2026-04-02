import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DISPLAY_CAP = 80;

export type SearchableUserRow = {
  _id: string;
  clerkUserId: string;
  name?: string | null;
  email?: string | null;
};

function rowLabel(user: SearchableUserRow): string {
  return (user.name || user.email || user.clerkUserId || "").trim();
}

function userMatchesQuery(user: SearchableUserRow, q: string): boolean {
  if (!q) return true;
  const n = (user.name || "").toLowerCase();
  const e = (user.email || "").toLowerCase();
  const id = (user.clerkUserId || "").toLowerCase();
  return n.includes(q) || e.includes(q) || id.includes(q);
}

type SearchableUserPickerProps = {
  users: SearchableUserRow[];
  value: string;
  onChange: (clerkUserId: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchableUserPicker({
  users,
  value,
  onChange,
  placeholder = "Search by name or email…",
  className = "",
}: SearchableUserPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => (value ? users.find((u) => u.clerkUserId === value) : undefined),
    [users, value]
  );

  const qNorm = query.trim().toLowerCase();
  const filtered = useMemo(() => users.filter((u) => userMatchesQuery(u, qNorm)), [users, qNorm]);
  const capped = filtered.slice(0, DISPLAY_CAP);
  const hasMore = filtered.length > DISPLAY_CAP;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const pick = (clerkUserId: string) => {
    onChange(clerkUserId);
    setQuery("");
    close();
  };

  return (
    <div ref={rootRef} className={`relative flex min-w-0 flex-1 flex-col gap-1 ${className}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      {selected && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
          <span className="truncate">
            <span className="text-white/50">Selected: </span>
            {rowLabel(selected)}
            {selected.email && rowLabel(selected) !== selected.email ? ` · ${selected.email}` : ""}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 rounded border border-white/25 px-2 py-0.5 text-white/80 hover:bg-white/10"
          >
            Clear
          </button>
        </div>
      )}
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-white/20 bg-navy-900 shadow-lg">
          {capped.length === 0 ? (
            <div className="px-3 py-2 text-sm text-white/50">No matching users</div>
          ) : (
            <>
              {capped.map((user) => (
                <button
                  key={user._id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(user.clerkUserId)}
                  className="flex w-full flex-col items-start gap-0.5 border-b border-white/5 px-3 py-2 text-left text-sm text-white last:border-b-0 hover:bg-white/10"
                >
                  <span>{rowLabel(user)}</span>
                  {user.email && user.email !== user.name ? (
                    <span className="text-xs text-white/50">{user.email}</span>
                  ) : null}
                </button>
              ))}
              {hasMore && (
                <div className="px-3 py-2 text-[11px] text-amber-200/80">
                  Showing first {DISPLAY_CAP} matches — type more to narrow results
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
