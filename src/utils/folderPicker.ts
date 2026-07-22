import type { ConfirmDialogOptions } from '../components/confirm/ConfirmDialogProvider';

type ConfirmFn = (options: ConfirmDialogOptions) => Promise<boolean>;

/**
 * Open the OS folder picker repeatedly so several folders can be stacked into one
 * upload batch. After each folder, the app confirm dialog offers to add another;
 * declining (or dismissing the dialog) hands the combined, path-deduped file list
 * to onPick once. Browsers only allow one folder per native dialog, so this
 * click-to-add loop is how we support "multiple folders". onPick is not called if
 * nothing was selected.
 */
export function pickFoldersAccumulate(confirm: ConfirmFn, onPick: (files: File[]) => void): void {
  const collected: File[] = [];
  const seen = new Set<string>();

  const openOne = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none';
    const teardown = () => { queueMicrotask(() => input.remove()); };
    const finish = () => { if (collected.length) onPick(collected.slice()); };
    input.addEventListener('change', () => {
      const list = input.files ? Array.from(input.files) : [];
      teardown();
      let added = 0;
      let folderName = '';
      for (const f of list) {
        const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\\/g, '/');
        if (!folderName) folderName = rel.split('/')[0] || '';
        if (seen.has(rel)) continue;
        seen.add(rel);
        collected.push(f);
        added += 1;
      }
      void confirm({
        title: 'Add another folder?',
        message: `Added ${added} file(s)${folderName ? ` from "${folderName}"` : ''}. ${collected.length} file(s) staged.`,
        confirmLabel: 'Add another folder',
        cancelLabel: 'Upload now',
        destructive: false,
      }).then((again) => {
        if (again) openOne();
        else finish();
      });
    });
    input.addEventListener('cancel', () => { teardown(); finish(); });
    document.body.appendChild(input);
    input.click();
  };

  openOne();
}
