import {describe, expect, it} from 'vitest';
import {mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('../scripts/plan-library-import.mjs', import.meta.url));

async function fixture(run) {
  const temporaryBase = resolve(tmpdir());
  const temporaryRoot = await mkdtemp(join(temporaryBase, 'novel-plan-review-'));
  try { await run(temporaryRoot); }
  finally {
    if (dirname(resolve(temporaryRoot)) !== temporaryBase || !basename(temporaryRoot).startsWith('novel-plan-review-')) {
      throw new Error('Refuse temporary cleanup outside verified fixture directory.');
    }
    await rm(temporaryRoot, {recursive: true, force: true});
  }
}

function invoke(source, profile) {
  return spawnSync(process.execPath, [script, source], {
    encoding: 'utf8',
    env: {...process.env, USERPROFILE: profile, HOME: profile},
    timeout: 10000,
  });
}

describe('independent metadata-only CLI source immutability', () => {
  for (const existingState of [false, true]) {
    it(`rejects redirected profile state (${existingState ? 'existing' : 'missing'}) before modifying source`, async () => fixture(async root => {
      const source = join(root, 'source');
      const profile = join(root, 'profile');
      await mkdir(source); await mkdir(profile);
      const original = Buffer.from([0xff, 0x00, 0x80]);
      await writeFile(join(source, 'original.txt'), original);
      if (existingState) await mkdir(join(source, 'private-novel'));
      await symlink(source, join(profile, '.codex'), process.platform === 'win32' ? 'junction' : 'dir');
      const before = (await readdir(source)).sort();

      const result = invoke(source, profile);

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect((await readdir(source)).sort()).toEqual(before);
      expect(await readFile(join(source, 'original.txt'))).toEqual(original);
      if (existingState) expect(await readdir(join(source, 'private-novel'))).toEqual([]);
      expect(result.stdout).toBe('');
    }));
  }

  it('writes only metadata outside the source with pre-existing ordinary state', async () => fixture(async root => {
    const source = join(root, 'source');
    const profile = join(root, 'profile');
    const state = join(profile, '.codex', 'private-novel');
    await mkdir(source); await mkdir(state, {recursive: true});
    const original = Buffer.from([0xff, 0x00, 0x80]);
    await writeFile(join(source, 'original.txt'), original);

    const result = invoke(source, profile);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const report = JSON.parse(await readFile(join(state, 'bulk-library-plan.json'), 'utf8'));
    expect(report.summary).toMatchObject({files: 1, bytes: original.length, uploaded: false});
    expect(report.inventory.files[0]).toMatchObject({path: 'original.txt', bytes: original.length, extension: '.txt'});
    expect(report.inventory.files[0]).not.toHaveProperty('text');
    expect(report.inventory.files[0]).not.toHaveProperty('content');
    expect(report.inventory.files[0]).not.toHaveProperty('sha256');
    expect(report.inventory.files[0]).not.toHaveProperty('encoding');
    expect(await readdir(source)).toEqual(['original.txt']);
    expect(await readFile(join(source, 'original.txt'))).toEqual(original);
    expect(await readdir(state)).toEqual(['bulk-library-plan.json']);
  }));
});
