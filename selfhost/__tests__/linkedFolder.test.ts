/**
 * Unit tests for native linked-folder path sandbox and metadata walk.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { createLinkedFolderService, APP_FOLDER_NAME } = require_(
  join(dirname(fileURLToPath(import.meta.url)), '../desktop/linkedFolder.cjs'),
);

describe('linkedFolder path sandbox', () => {
  let tmp: string;
  let service: ReturnType<typeof createLinkedFolderService>;

  beforeEach(() => {
    tmp = fs.mkdtempSync(join(os.tmpdir(), 'aerogap-folder-'));
    const manuals = join(tmp, 'manuals');
    fs.mkdirSync(manuals, { recursive: true });
    fs.writeFileSync(join(manuals, 'AMM.pdf'), 'amm');
    fs.writeFileSync(join(manuals, 'scan-oxygen.png'), 'png-bytes');
    fs.writeFileSync(join(manuals, '05-10-00.xml'), '<para>time limits</para>');
    fs.mkdirSync(join(manuals, 'sub'));
    fs.writeFileSync(join(manuals, 'sub', 'IPC.pdf'), 'ipc');
    fs.writeFileSync(join(manuals, 'sub', 'flap.jpeg'), 'jpeg-bytes');
    fs.mkdirSync(join(manuals, APP_FOLDER_NAME));
    fs.writeFileSync(join(manuals, APP_FOLDER_NAME, 'secret.aqv.json'), 'nope');

    service = createLinkedFolderService(tmp, () => null);
    // Seed the linked path without a dialog.
    fs.writeFileSync(
      join(tmp, 'linked-manuals.json'),
      JSON.stringify({ path: manuals }),
      'utf8',
    );
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('status reports the linked folder', () => {
    const st = service.status();
    expect(st.linked).toBe(true);
    expect(st.name).toBe('manuals');
  });

  it('listMeta skips .aerogap and returns relative paths for all file types', () => {
    const meta = service.listMeta();
    const paths = meta.map((m: { relativePath: string }) => m.relativePath).sort();
    expect(paths).toEqual([
      '05-10-00.xml',
      'AMM.pdf',
      'scan-oxygen.png',
      'sub/IPC.pdf',
      'sub/flap.jpeg',
    ]);
    // Desktop walk does not type-filter; MIME is empty (Library fills via guessMimeFromPath).
    for (const m of meta) {
      expect(m.mimeType).toBe('');
    }
  });

  it('readFile returns bytes for png and xml relative paths', async () => {
    const png = await service.readFile('scan-oxygen.png');
    expect(new TextDecoder().decode(png)).toBe('png-bytes');
    const xml = await service.readFile('05-10-00.xml');
    expect(new TextDecoder().decode(xml)).toBe('<para>time limits</para>');
  });

  it('resolveUnderRoot rejects .. escapes', () => {
    const root = join(tmp, 'manuals');
    expect(() => service.resolveUnderRoot(root, '../outside.txt')).toThrow(/escapes/i);
    expect(() => service.resolveUnderRoot(root, 'sub/../../outside.txt')).toThrow(/escapes/i);
  });

  it('resolveUnderRoot accepts nested relative paths', () => {
    const root = join(tmp, 'manuals');
    const full = service.resolveUnderRoot(root, 'sub/IPC.pdf');
    expect(full).toBe(path.resolve(root, 'sub', 'IPC.pdf'));
  });

  it('readFile returns bytes for a relative path', async () => {
    const buf = await service.readFile('AMM.pdf');
    expect(new TextDecoder().decode(buf)).toBe('amm');
  });

  it('falls back to seat-local index when writing app folder fails', async () => {
    // Make .aerogap unwritable by replacing it with a file (mkdir fails).
    const manuals = join(tmp, 'manuals');
    fs.rmSync(join(manuals, APP_FOLDER_NAME), { recursive: true, force: true });
    fs.writeFileSync(join(manuals, APP_FOLDER_NAME), 'blocked');

    expect(await service.canWriteAppFolder()).toBe(false);
    await service.writeLocalIndex('proj1.aqv.json', '{"v":1}');
    expect(await service.readLocalIndex('proj1.aqv.json')).toBe('{"v":1}');
  });

  it('writeAppFile / readAppFile round-trip under .aerogap', async () => {
    // Restore writable .aerogap from beforeEach (blocked test mutates; this file is fresh).
    await service.writeAppFile('proj1.aqv.json', '{"shared":true}');
    expect(await service.readAppFile('proj1.aqv.json')).toBe('{"shared":true}');
  });
});
