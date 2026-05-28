import { useEffect, useState } from 'react';
import { GlassModal, Button, Select } from '../ui';

export type FolderOption = {
  id: string;
  name: string;
  depth: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  folders: FolderOption[];
  confirmLabel?: string;
  /** Called with null for library root (no folder). */
  onConfirm: (folderId: string | null) => void | Promise<void>;
};

/** Flat folders with depth for indentation in the picker. */
export function flattenFoldersForPicker(
  folders: Array<{ _id: string; name: string; parentFolderId?: string | null }>,
): FolderOption[] {
  type Row = { id: string; name: string; parentId?: string };
  const rows: Row[] = folders.map((f) => ({
    id: String(f._id),
    name: f.name,
    parentId: f.parentFolderId ? String(f.parentFolderId) : undefined,
  }));
  const byParent = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.parentId ?? '__root__';
    const list = byParent.get(key) ?? [];
    list.push(row);
    byParent.set(key, list);
  }
  const sortKids = (list: Row[]) => list.slice().sort((a, b) => a.name.localeCompare(b.name));
  const out: FolderOption[] = [];
  const walk = (parentId: string | undefined, depth: number) => {
    const key = parentId ?? '__root__';
    const kids = sortKids(byParent.get(key) ?? []);
    for (const k of kids) {
      out.push({ id: k.id, name: k.name, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

export default function MoveToFolderModal({
  open,
  onClose,
  title,
  description,
  folders,
  confirmLabel = 'Move here',
  onConfirm,
}: Props) {
  const [target, setTarget] = useState<string>('__root__');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget('__root__');
      setBusy(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      await onConfirm(target === '__root__' ? null : target);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassModal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? '…' : confirmLabel}
          </Button>
        </>
      }
    >
      {description ? <p className="text-white/70 mb-3">{description}</p> : null}
      <Select
        label="Destination"
        selectSize="sm"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        disabled={busy}
        className="bg-white/5 border-white/15"
      >
        <option value="__root__">Library root (not in a folder)</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {'\u00A0'.repeat(f.depth * 2)}
            {f.name}
          </option>
        ))}
      </Select>
    </GlassModal>
  );
}
