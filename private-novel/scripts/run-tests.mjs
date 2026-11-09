import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, mkdtemp, readdir, realpath, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const [runner, ...args] = process.argv.slice(2);
const packages = {vitest: 'vitest', playwright: '@playwright/test'};
const packageName = Object.hasOwn(packages, runner) && packages[runner];

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function run() {
  if (!packageName) throw new Error('Expected vitest or playwright.');
  const manifest = require.resolve(packageName + '/package.json');
  const cli = join(dirname(manifest), require(manifest).bin[runner]);

  const defaultRoot = process.platform === 'win32'
    ? fileURLToPath(new URL('../.dsh-tmp/t', import.meta.url))
    : join(tmpdir(), 'private-novel-tests-' + process.getuid());
  const requestedRoot = process.env.PRIVATE_NOVEL_TEST_TEMP_ROOT || defaultRoot;
  if (!isAbsolute(requestedRoot)) throw new Error('The test temp root must be an absolute path.');
  await mkdir(requestedRoot, {recursive: true, mode: 0o700});
  const root = await realpath(requestedRoot);

  // Do not guess whether files from an interrupted run are safe to remove.
  for (const name of await readdir(root)) {
    const owner = /^run-([1-9]\d{0,9})-[a-zA-Z0-9]{6}$/.exec(name);
    if (owner && !isRunning(Number(owner[1])) && (await readdir(root)).includes(name)) {
      throw new Error('Previous test run left files in ' + join(root, name) +
        '. Check that its test processes have stopped and remove that run directory before retrying.');
    }
  }

  const directory = await mkdtemp(join(root, 'run-' + process.pid + '-'));
  let child;
  let interrupted;
  const signals = ['SIGINT', 'SIGTERM'];
  const handlers = signals.map(signal => () => {
    interrupted ??= signal;
    if (child?.exitCode === null && child.signalCode === null) child.kill(signal);
  });
  signals.forEach((signal, index) => process.on(signal, handlers[index]));

  try {
    child = spawn(process.execPath, [cli, ...args], {
      env: {...process.env, TEMP: directory, TMP: directory, TMPDIR: directory},
      stdio: 'inherit',
    });
    const [code, signal] = await once(child, 'close');
    process.exitCode = interrupted === 'SIGINT' || signal === 'SIGINT' ? 130 :
      interrupted === 'SIGTERM' || signal === 'SIGTERM' ? 143 : code ?? 1;
  } finally {
    try {
      if (dirname(directory) !== root || await realpath(directory) !== directory) {
        throw new Error('Refusing to remove a test directory that no longer resolves to its original path.');
      }
      await rm(directory, {recursive: true, force: true, maxRetries: 12, retryDelay: 100});
    } catch (error) {
      console.error('[test temp] Could not clean ' + directory + ': ' + error.message);
      process.exitCode ||= 1;
    } finally {
      signals.forEach((signal, index) => process.off(signal, handlers[index]));
    }
  }
}

try {
  await run();
} catch (error) {
  console.error('[test temp] ' + error.message);
  process.exitCode = 1;
}
