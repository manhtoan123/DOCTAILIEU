import {lstat, readdir, realpath, writeFile, rename} from 'node:fs/promises';
import {relative, resolve, dirname, extname, basename, sep, isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';

const natural = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});
const compare = (a, b) => natural.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
export function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
function chapterLike(name) {
  return /^(?:第[0-9０-９零〇一二三四五六七八九十百千万两]+[章回节卷]|(?:chapter|chương)\s*\d+|\d{1,7})/iu.test(basename(name, extname(name)));
}
const auxiliaryNames = /^(?:vietphrase(?:_(?:chapter|number))?|names2?|namelist|hanviet|daitunhanxung|blacklist|readme)\.txt$/iu;

/** Metadata only. No file contents, network, hashes, encoding guesses or upload. */
export async function inventoryLibrary(source) {
  const sourceRoot = await realpath(source);
  const sourceInfo = await lstat(sourceRoot);
  if (!sourceInfo.isDirectory()) throw new Error('Source must be a directory.');
  const files = [], directories = [], skipped = [], errors = [];
  const visit = async directory => {
    let entries;
    try { entries = await readdir(directory, {withFileTypes: true}); }
    catch (error) { errors.push({path: relative(sourceRoot, directory), code: error.code ?? 'READ_ERROR'}); return; }
    entries.sort((a, b) => compare(a.name, b.name));
    const dir = {path: relative(sourceRoot, directory).split(sep).join('/'), files: [], children: []};
    directories.push(dir);
    for (const entry of entries) {
      const full = resolve(directory, entry.name);
      const rel = relative(sourceRoot, full).split(sep).join('/');
      if (!inside(sourceRoot, full)) throw new Error('Path escaped source.');
      try {
        const info = await lstat(full);
        if (info.isSymbolicLink()) { skipped.push({path: rel, reason: 'link-not-followed'}); continue; }
        // Resolve directories too: Windows junctions must never lead outside the selected tree.
        if (info.isDirectory()) {
          const actual = await realpath(full);
          if (actual !== full || !inside(sourceRoot, actual)) { skipped.push({path: rel, reason: 'redirected-directory'}); continue; }
          dir.children.push(rel); await visit(full);
        } else if (info.isFile()) {
          const file = {path: rel, bytes: info.size, modifiedMs: info.mtimeMs, extension: extname(entry.name).toLowerCase()};
          files.push(file); dir.files.push(rel);
        } else skipped.push({path: rel, reason: 'not-regular-file'});
      } catch (error) { errors.push({path: rel, code: error.code ?? 'STAT_ERROR'}); }
    }
  };
  await visit(sourceRoot);
  return {version: 1, sourceRoot, scannedAt: new Date().toISOString(), files, directories, skipped, errors};
}

/** Conservative proposals, never a destructive or upload-ready manifest. */
export function proposeLayout(inventory) {
  const byPath = new Map(inventory.files.map(file => [file.path, file]));
  const units = [], attachments = [];
  for (const directory of inventory.directories) {
    const direct = directory.files.map(path => byPath.get(path));
    if (direct.some(file => !file)) throw new Error('Incomplete inventory directory.');
    const auxiliary = direct.filter(file => file.extension === '.txt' && auxiliaryNames.test(basename(file.path)));
    const txt = direct.filter(file => file.extension === '.txt' && !auxiliaryNames.test(basename(file.path)));
    const epub = direct.filter(file => file.extension === '.epub');
    const parts = directory.path ? directory.path.split('/') : [];
    const numbered = txt.filter(file => chapterLike(file.path)).length;
    if (txt.length > 1 && numbered / txt.length >= 0.9) {
      units.push({kind: numbered === txt.length ? 'chapter-folder-candidate' : 'mixed-folder-candidate', path: directory.path, title: parts.at(-1) ?? 'Thư viện', groupPath: parts.slice(0, -1), files: txt.map(file => file.path), bytes: txt.reduce((sum, file) => sum + file.bytes, 0), numberedFiles: numbered, requiresReview: true});
    } else {
      for (const file of txt) units.push({kind: 'txt-book-candidate', path: file.path, title: basename(file.path, extname(file.path)), groupPath: parts, files: [file.path], bytes: file.bytes, requiresReview: txt.length > 1});
    }
    for (const file of epub) units.push({kind: 'epub-book-pending', path: file.path, title: basename(file.path, extname(file.path)), groupPath: parts, files: [file.path], bytes: file.bytes, requiresReview: true});
    for (const file of auxiliary) units.push({kind: 'auxiliary-text-pending', path: file.path, files: [file.path], bytes: file.bytes, requiresReview: true});
    for (const file of direct.filter(file => !['.txt', '.epub'].includes(file.extension))) attachments.push(file.path);
  }
  units.sort((a, b) => compare(a.path, b.path));
  return {version: 1, status: 'needs-mapping-review', units, attachments, rules: {groupLabels: 'preserve-folders-no-author-or-genre-guess', originals: 'must-remain-unchanged', upload: 'not-performed'}};
}

export function summarize(inventory, layout) {
  const types = {};
  for (const file of inventory.files) {
    const type = types[file.extension] ??= {files: 0, bytes: 0}; type.files++; type.bytes += file.bytes;
  }
  const kinds = {};
  for (const unit of layout.units) kinds[unit.kind] = (kinds[unit.kind] ?? 0) + 1;
  const txt = inventory.files.filter(file => file.extension === '.txt');
  return {files: inventory.files.length, bytes: inventory.files.reduce((sum, file) => sum + file.bytes, 0), directories: inventory.directories.length, types, proposedUnits: kinds, reviewUnits: layout.units.filter(unit => unit.requiresReview).length, attachments: layout.attachments.length, txtOver2MiB: txt.filter(file => file.bytes > 2 * 1048576).length, txtOver32MiB: txt.filter(file => file.bytes > 32 * 1048576).length, skipped: inventory.skipped.length, errors: inventory.errors.length, uploaded: false};
}

export async function writeInventory(source, destination) {
  const output = resolve(destination);
  const actualSource = await realpath(source);
  // Resolve destination parent to reject writing through a link into the source.
  const actualParent = await realpath(dirname(output));
  if (inside(actualSource, resolve(actualParent, basename(output)))) throw new Error('Inventory output cannot be inside source.');
  const inventory = await inventoryLibrary(actualSource);
  const layout = proposeLayout(inventory);
  const summary = summarize(inventory, layout);
  const temp = `${output}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({inventory, layout, summary}, null, 2), {flag: 'wx', mode: 0o600});
  await rename(temp, output);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.argv[2];
  if (!source || process.argv.length !== 3) throw new Error('Usage: node scripts/plan-library-import.mjs <source-directory>. This command never uploads.');
  // State is provisioned by project setup. Do not mkdir through a user-profile
  // junction before checking its real location against the source.
  const state = await realpath(resolve(homedir(), '.codex', 'private-novel'));
  if (inside(await realpath(source), state)) throw new Error('State directory cannot be inside source.');
  const destination = resolve(state, 'bulk-library-plan.json');
  console.log(JSON.stringify({...(await writeInventory(source, destination)), manifest: destination}));
}
