import {describe, it, expect} from 'vitest';
import {mkdtemp, mkdir, writeFile, rm, readFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve, basename} from 'node:path';
import {inside, inventoryLibrary, proposeLayout, summarize, writeInventory} from '../scripts/plan-library-import.mjs';

async function fixture(run) {
  const temp = await mkdtemp(join(tmpdir(), 'novel-plan-'));
  try { await run(temp); } finally {
    if (dirname(resolve(temp)) !== resolve(tmpdir()) || !basename(temp).startsWith('novel-plan-')) throw new Error('Unsafe fixture cleanup path.');
    await rm(temp, {recursive: true, force: true});
  }
}
describe('metadata-only hierarchy proposal', () => {
  it('keeps genre/author paths, identifies ordered chapters, accounts for attachments without reading text', async () => fixture(async root => {
    const book = join(root, 'Fantasy', 'Author', 'Novel'); await mkdir(book, {recursive: true});
    await writeFile(join(book, '10 Chapter.txt'), 'synthetic ten'); await writeFile(join(book, '2 Chapter.txt'), 'synthetic two');
    await writeFile(join(root, 'standalone.epub'), 'synthetic archive'); await writeFile(join(root, 'utility.py'), 'not a novel');
    const inventory = await inventoryLibrary(root), layout = proposeLayout(inventory);
    const folder = layout.units.find(unit => unit.kind === 'chapter-folder-candidate');
    expect(folder.groupPath).toEqual(['Fantasy', 'Author']); expect(folder.title).toBe('Novel');
    expect(folder.files.map(path => path.split('/').at(-1))).toEqual(['2 Chapter.txt', '10 Chapter.txt']);
    expect(layout.units.find(unit => unit.kind === 'epub-book-pending').requiresReview).toBe(true);
    expect(layout.attachments).toEqual(['utility.py']);
    expect([...layout.units.flatMap(unit => unit.files), ...layout.attachments].sort()).toEqual(inventory.files.map(file => file.path).sort());
    expect(inventory.files.every(file => !('text' in file) && !('content' in file))).toBe(true);
    expect(summarize(inventory, layout).uploaded).toBe(false);
  }));
  it('does not merge differently named works or infer authors from folder labels', async () => fixture(async root => {
    await mkdir(join(root, 'Collection')); await writeFile(join(root, 'Collection', 'Work A.txt'), 'a'); await writeFile(join(root, 'Collection', 'Work B.txt'), 'b');
    const layout = proposeLayout(await inventoryLibrary(root));
    expect(layout.units).toHaveLength(2);
    expect(layout.units.every(unit => unit.requiresReview && unit.kind === 'txt-book-candidate' && !('author' in unit))).toBe(true);
  }));
  it('requires review for numbered stories, never presents guesses as confirmed imports', async () => fixture(async root => {
    await writeFile(join(root, '1 story.txt'), 'a'); await writeFile(join(root, '2 story.txt'), 'b');
    const layout = proposeLayout(await inventoryLibrary(root));
    expect(layout.status).toBe('needs-mapping-review'); expect(layout.units[0].requiresReview).toBe(true);
  }));
  it('keeps dictionary sidecars separate and supports numbered names without separators', async () => fixture(async root => {
    await writeFile(join(root, '001正文.txt'), 'a'); await writeFile(join(root, '002正文.txt'), 'b'); await writeFile(join(root, 'Names.txt'), 'synthetic=name');
    const inventory = await inventoryLibrary(root), layout = proposeLayout(inventory);
    expect(layout.units.find(unit => unit.kind === 'chapter-folder-candidate').files).toHaveLength(2);
    expect(layout.units.find(unit => unit.kind === 'auxiliary-text-pending').files).toEqual(['Names.txt']);
    expect(layout.units.flatMap(unit => unit.files)).toHaveLength(inventory.files.length);
  }));
  it('flags mixed numbered folders without claiming unrelated titles are confirmed chapters', async () => fixture(async root => {
    for (let i=1; i<=10; i++) await writeFile(join(root, `${i} chapter.txt`), 'synthetic');
    await writeFile(join(root, 'different-work.txt'), 'synthetic');
    const layout = proposeLayout(await inventoryLibrary(root));
    expect(layout.units[0].kind).toBe('mixed-folder-candidate');
    expect(layout.units[0].requiresReview).toBe(true); expect(layout.units[0].numberedFiles).toBe(10);
    expect(layout.units[0].files).toHaveLength(11);
  }));
  it('rejects prefix siblings and outputs inside source, leaves originals byte-identical', async () => fixture(async temp => {
    const source = join(temp, 'source'); await mkdir(source); const original = Buffer.from([0xff, 0x00, 0xaa]); await writeFile(join(source, 'raw.txt'), original);
    expect(inside(source, join(temp, 'source-other'))).toBe(false);
    await expect(writeInventory(source, join(source, 'plan.json'))).rejects.toThrow('inside source');
    const destination = join(temp, 'plan.json'); await writeInventory(source, destination);
    expect(await readFile(join(source, 'raw.txt'))).toEqual(original); expect(JSON.parse(await readFile(destination, 'utf8')).summary.files).toBe(1);
  }));
  it('does not follow redirected directories outside the selected tree', async () => fixture(async temp => {
    const root = join(temp, 'source'), outside = join(temp, 'outside'); await mkdir(root); await mkdir(outside);
    await writeFile(join(outside, 'private.txt'), 'must not inventory');
    await symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    const inventory = await inventoryLibrary(root); expect(inventory.files).toEqual([]); expect(inventory.skipped).toHaveLength(1);
  }));
});
