import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { plan, toyTests } from './test-plan.mjs';
import { runSteps } from './runner.mjs';

try {
  const [mode, ...targets] = process.argv.slice(2);
  const steps = plan(mode, targets);
  if (mode === 'list') console.table(toyTests);
  else {
    process.chdir(resolve(import.meta.dirname, '..'));
    const results = await runSteps(steps);
    console.table(results);
    await mkdir('test-results', { recursive: true });
    await writeFile(
      `test-results/${mode}-summary.json`,
      JSON.stringify(
        { mode, targets, at: new Date().toISOString(), results },
        null,
        2,
      ) + '\n',
    );
    if (results.some((result) => result.status !== 'PASS'))
      process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
