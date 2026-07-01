import { useMemo, useState, useCallback, type HTMLAttributes } from 'react';
import { FiChevronDown, FiChevronRight, FiFolder, FiFolderPlus, FiTrash2, FiEdit2, FiMove, FiCornerDownRight } from 'react-icons/fi';
import { Button, GlassModal, Input } from '../ui';
import { flattenFoldersForPicker } from './MoveToFolderModal';

/** HTML5 data transfer type for library drag-and-drop (publications, documents, folder reparent). */
export const LIBRARY_DND_MIME = 'application/x-aerogap-library';

export type LibraryDnDPayload = { type: 'publication' | 'document' | 'folder'; id: string };

export function setLibraryDragData(e: React.DragEvent, payload: LibraryDnDPayload) {
  try {
    e.dataTransfer.setData(LIBRARY_DND_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  } catch {
    /* noop */
  }
}

function readLibraryDragPayload(e: React.DragEvent): LibraryDnDPayload | null {
  try {
    const raw = e.dataTransfer.getData(LIBRARY_DND_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LibraryDnDPayload;
    if (
      (parsed.type === 'publication' || parsed.type === 'document' || parsed.type === 'folder') &&
      typeof parsed.id === 'string'
    )
      return parsed;
  } catch {
    /* noop */
  }
  return null;
}

function hasLibraryDragData(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types ?? []).includes(LIBRARY_DND_MIME);
}

type FolderRow = {
  _id: string;
  name: string;
  parentFolderId?: string;
};

type Props = {
  folders: FolderRow[];
  selectedFolderId?: string | null;
  onSelectFolder: (folderId: string | null | undefined) => void;
  onCreateFolder: (name: string, parentFolderId?: string) => Promise<void> | void;
  onRenameFolder: (folderId: string, name: string) => Promise<void> | void;
  onMoveFolder: (folderId: string, newParentFolderId?: string) => Promise<void> | void;
  onDeleteFolder: (folderId: string, mode: 'moveChildrenUp' | 'deleteAll') => Promise<void> | void;
  folderItemCounts?: Record<string, number>;
  title?: string;
  showAllItemsNode?: boolean;
  /** When true, folder rows can be dragged onto another folder or root to reparent. */
  enableFolderReparentDrop?: boolean;
  onPublicationDropped?: (folderId: string | null, publicationId: string) => void | Promise<void>;
  onDocumentDropped?: (folderId: string | null, documentId: string) => void | Promise<void>;
  onFolderReparentDropped?: (draggedFolderId: string, newParentFolderId: string | undefined) => void | Promise<void>;
};

type Node = FolderRow & { children: Node[] };

function buildTree(folders: FolderRow[]): Node[] {
  const byId = new Map<string, Node>();
  for (const folder of folders) byId.set(String(folder._id), { ...folder, children: [] });
  const roots: Node[] = [];
  for (const folder of folders) {
    const node = byId.get(String(folder._id))!;
    const parent = folder.parentFolderId ? byId.get(String(folder.parentFolderId)) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (nodes: Node[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

/** True when `nodeId` is the same as or nested under `ancestorId`. */
function isUnderFolder(folders: FolderRow[], ancestorId: string, nodeId: string): boolean {
  if (String(ancestorId) === String(nodeId)) return true;
  let cur: string | undefined = nodeId;
  const parentById = new Map(folders.map((f) => [String(f._id), f.parentFolderId ? String(f.parentFolderId) : undefined]));
  for (let guard = 0; guard < 256 && cur; guard++) {
    const p = parentById.get(cur);
    if (!p) break;
    if (String(p) === String(ancestorId)) return true;
    cur = p;
  }
  return false;
}

type ModalState =
  | { kind: 'create'; parentFolderId?: string; parentLabel: string }
  | { kind: 'rename'; folderId: string; currentName: string }
  | { kind: 'move'; folderId: string; currentName: string }
  | { kind: 'delete'; folderId: string; name: string };

export default function LibraryFolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  folderItemCounts,
  title = 'Folders',
  showAllItemsNode = true,
  enableFolderReparentDrop = true,
  onPublicationDropped,
  onDocumentDropped,
  onFolderReparentDropped,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [moveParentId, setMoveParentId] = useState<string>('__root__');
  const [modalBusy, setModalBusy] = useState(false);
  const [dropHighlight, setDropHighlight] = useState<string | '__root__' | null>(null);

  const tree = useMemo(() => buildTree(folders), [folders]);

  const flatForMoveSelect = useMemo(
    () =>
      flattenFoldersForPicker(
        folders.map((f) => ({ _id: f._id, name: f.name, parentFolderId: f.parentFolderId ?? null })),
      ),
    [folders],
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = (parentFolderId?: string, parentLabel = 'Library root') => {
    setModalInput('');
    setModal({ kind: 'create', parentFolderId, parentLabel });
  };

  const openRename = (folderId: string, currentName: string) => {
    setModalInput(currentName);
    setModal({ kind: 'rename', folderId, currentName });
  };

  const openMove = (folderId: string, currentName: string) => {
    setMoveParentId('__root__');
    setModal({ kind: 'move', folderId, currentName });
  };

  const openDelete = (folderId: string, name: string) => {
    setModal({ kind: 'delete', folderId, name });
  };

  const moveOptionsForFolder = useMemo(() => {
    if (modal?.kind !== 'move') return [];
    const dragged = modal.folderId;
    return flatForMoveSelect.filter((opt) => opt.id !== dragged && !isUnderFolder(folders, dragged, opt.id));
  }, [modal, flatForMoveSelect, folders]);

  const handleModalPrimary = async () => {
    if (!modal) return;
    setModalBusy(true);
    try {
      if (modal.kind === 'create') {
        const name = modalInput.trim();
        if (!name) return;
        await onCreateFolder(name, modal.parentFolderId);
      } else if (modal.kind === 'rename') {
        const name = modalInput.trim();
        if (!name || name === modal.currentName) return;
        await onRenameFolder(modal.folderId, name);
      } else if (modal.kind === 'move') {
        const newParent = moveParentId === '__root__' ? undefined : moveParentId;
        if (newParent && (newParent === modal.folderId || isUnderFolder(folders, modal.folderId, newParent))) return;
        await onMoveFolder(modal.folderId, newParent);
      }
      setModal(null);
    } finally {
      setModalBusy(false);
    }
  };

  const handleDeleteMode = async (mode: 'moveChildrenUp' | 'deleteAll') => {
    if (!modal || modal.kind !== 'delete') return;
    setModalBusy(true);
    try {
      await onDeleteFolder(modal.folderId, mode);
      setModal(null);
    } finally {
      setModalBusy(false);
    }
  };

  const allowDrop = useCallback((e: React.DragEvent) => {
    if (!hasLibraryDragData(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDropZone = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    setDropHighlight(null);
    const payload = readLibraryDragPayload(e);
    if (!payload) return;

    if (payload.type === 'publication' && onPublicationDropped) {
      await onPublicationDropped(targetFolderId, payload.id);
      return;
    }

    if (payload.type === 'document' && onDocumentDropped) {
      await onDocumentDropped(targetFolderId, payload.id);
      return;
    }

    if (payload.type === 'folder' && enableFolderReparentDrop && onFolderReparentDropped) {
      const draggedId = payload.id;
      if (targetFolderId !== null) {
        if (draggedId === targetFolderId) return;
        if (isUnderFolder(folders, draggedId, targetFolderId)) return;
      }
      const newParent = targetFolderId === null ? undefined : targetFolderId;
      await onFolderReparentDropped(draggedId, newParent);
    }
  };

  const dragOverClass = (key: string | '__root__') =>
    dropHighlight === key ? 'ring-1 ring-sky-light/70 bg-sky/15' : '';

  const dragOverHandlers = (
    highlightKey: string,
  ): Pick<HTMLAttributes<HTMLDivElement>, 'onDragLeave' | 'onDragOver'> => ({
    onDragOver: (e) => {
      allowDrop(e);
      if (
        hasLibraryDragData(e) &&
        (onPublicationDropped || onDocumentDropped || (enableFolderReparentDrop && onFolderReparentDropped))
      ) {
        setDropHighlight(highlightKey);
      }
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node)) setDropHighlight(null);
    },
  });

  const renderNode = (node: Node, depth: number): JSX.Element => {
    const id = String(node._id);
    const isExpanded = expandedIds.has(id) || depth < 1;
    const isSelected = selectedFolderId === id;
    const count = folderItemCounts?.[id] ?? 0;

    return (
      <div key={id}>
        <div
          className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${isSelected ? 'bg-sky/15' : 'hover:bg-white/5'} ${dragOverClass(id)}`}
          style={{ marginLeft: depth * 12 }}
          {...dragOverHandlers(id)}
          onDrop={(e) => void handleDropZone(e, id)}
        >
          <button type="button" className="p-1 text-white/60 shrink-0 hover:text-white" onClick={() => toggleExpand(id)} aria-label="Toggle folder">
            {node.children.length > 0 ? (isExpanded ? <FiChevronDown /> : <FiChevronRight />) : <span className="inline-block w-4" />}
          </button>
          <button
            type="button"
            draggable={Boolean(enableFolderReparentDrop && onFolderReparentDropped)}
            onDragStart={(e) => {
              if (!enableFolderReparentDrop || !onFolderReparentDropped) return;
              setLibraryDragData(e, { type: 'folder', id });
            }}
            className={`min-w-0 flex-1 text-left truncate text-sm ${enableFolderReparentDrop && onFolderReparentDropped ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onClick={() => onSelectFolder(id)}
            title={enableFolderReparentDrop && onFolderReparentDropped ? 'Drag to another folder to move' : undefined}
          >
            <span className="inline-flex items-center gap-2">
              <FiFolder className="text-sky-lighter/80 shrink-0" />
              <span className="truncate">{node.name}</span>
              {folderItemCounts ? (
                <span className="text-white/50 text-xs tabular-nums shrink-0">{count}</span>
              ) : null}
            </span>
          </button>
          <div className="flex items-center transition-opacity focus-within:!opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            <button type="button" className="p-1 text-white/50 hover:text-white" onClick={() => openCreate(id, node.name)} title="New subfolder">
              <FiFolderPlus />
            </button>
            <button type="button" className="p-1 text-white/50 hover:text-white" onClick={() => openRename(id, node.name)} title="Rename">
              <FiEdit2 />
            </button>
            <button type="button" className="p-1 text-white/50 hover:text-white" onClick={() => openMove(id, node.name)} title="Move">
              <FiMove />
            </button>
            <button type="button" className="p-1 text-white/50 hover:text-red-300" onClick={() => openDelete(id, node.name)} title="Delete">
              <FiTrash2 />
            </button>
          </div>
        </div>
        {isExpanded && node.children.length > 0 ? (
          <div className="mt-1 space-y-1">{node.children.map((child) => renderNode(child, depth + 1))}</div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{title}</h3>
        <Button size="sm" variant="ghost" icon={<FiFolderPlus />} onClick={() => openCreate(undefined, 'Library root')}>
          New
        </Button>
      </div>
      {onPublicationDropped || onDocumentDropped || (enableFolderReparentDrop && onFolderReparentDropped) ? (
        <p className="mb-2 text-[11px] text-white/55">
          Tip: drag a publication, document, or folder onto a folder (or Root) to move it.
        </p>
      ) : null}
      {showAllItemsNode ? (
        <button
          type="button"
          className={`mb-2 w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${selectedFolderId === undefined ? 'bg-sky/15 font-medium text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
          onClick={() => onSelectFolder(undefined)}
        >
          All items
        </button>
      ) : null}
      <div
        className={`mb-2 w-full rounded-lg px-2 py-1.5 text-left text-sm cursor-default transition-colors ${selectedFolderId === null ? 'bg-sky/15' : 'hover:bg-white/5'} ${dragOverClass('__root__')}`}
        role="presentation"
        {...dragOverHandlers('__root__')}
        onDrop={(e) => void handleDropZone(e, null)}
      >
        <button type="button" className="w-full text-left" onClick={() => onSelectFolder(null)}>
          <span className="inline-flex items-center gap-2 text-sm">
            <FiCornerDownRight className="text-white/50" />
            Root only <span className="text-white/40 text-xs font-normal">(drop here for no folder)</span>
          </span>
        </button>
      </div>
      <div className="space-y-1">
        {tree.length === 0 ? (
          <p className="py-2 text-xs text-white/55">No folders yet — use “New” or upload with folder structure.</p>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>

      <GlassModal
        open={modal?.kind === 'create'}
        title="New folder"
        onClose={() => !modalBusy && setModal(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(null)} disabled={modalBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void handleModalPrimary()} disabled={modalBusy || !modalInput.trim()}>
              {modalBusy ? '…' : 'Create'}
            </Button>
          </>
        }
      >
        {modal?.kind === 'create' ? (
          <>
            <p className="text-white/60 text-sm mb-3">Inside: {modal.parentLabel}</p>
            <Input
              autoFocus
              placeholder="Folder name"
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleModalPrimary()}
            />
          </>
        ) : null}
      </GlassModal>

      <GlassModal
        open={modal?.kind === 'rename'}
        title="Rename folder"
        onClose={() => !modalBusy && setModal(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(null)} disabled={modalBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleModalPrimary()}
              disabled={modalBusy || !modalInput.trim() || (modal?.kind === 'rename' && modalInput.trim() === modal.currentName)}
            >
              {modalBusy ? '…' : 'Save'}
            </Button>
          </>
        }
      >
        {modal?.kind === 'rename' ? (
          <Input
            autoFocus
            value={modalInput}
            onChange={(e) => setModalInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleModalPrimary()}
          />
        ) : null}
      </GlassModal>

      <GlassModal
        open={modal?.kind === 'move'}
        title="Move folder"
        onClose={() => !modalBusy && setModal(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(null)} disabled={modalBusy}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void handleModalPrimary()} disabled={modalBusy}>
              {modalBusy ? '…' : 'Move'}
            </Button>
          </>
        }
      >
        {modal?.kind === 'move' ? (
          <>
            <p className="text-white/60 text-sm mb-3">Moving: {modal.currentName}</p>
            <label className="block text-xs font-medium text-white/60 mb-1.5">New parent</label>
            <select
              className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-light"
              value={moveParentId}
              onChange={(e) => setMoveParentId(e.target.value)}
            >
              <option value="__root__">Library root</option>
              {moveOptionsForFolder.map((f) => (
                <option key={f.id} value={f.id}>
                  {'\u00A0'.repeat(f.depth * 2)}
                  {f.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </GlassModal>

      <GlassModal
        open={modal?.kind === 'delete'}
        title="Delete folder"
        sizeClassName="max-w-lg"
        onClose={() => !modalBusy && setModal(null)}
        footer={
          <Button variant="secondary" size="sm" onClick={() => !modalBusy && setModal(null)} disabled={modalBusy}>
            Cancel
          </Button>
        }
      >
        {modal?.kind === 'delete' ? (
          <div className="space-y-4">
            <p className="text-white/80">
              Remove <strong className="text-white">{modal.name}</strong>?
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="secondary" className="flex-1 justify-center" disabled={modalBusy} onClick={() => void handleDeleteMode('moveChildrenUp')}>
                Move contents up
              </Button>
              <Button
                variant="primary"
                className="flex-1 justify-center !bg-red-900/70 hover:!bg-red-800/90 border-red-400/40"
                disabled={modalBusy}
                onClick={() => void handleDeleteMode('deleteAll')}
              >
                Delete all inside
              </Button>
            </div>
            <p className="text-xs text-white/50">
              Move contents up keeps files and child folders but lifts them one level; Delete all permanently removes publications and documents in this folder tree (same as deleting each item).
            </p>
          </div>
        ) : null}
      </GlassModal>
    </div>
  );
}
