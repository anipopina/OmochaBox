import { spawn } from 'node:child_process';

export function execute(step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, { stdio: 'inherit' });
    child.once('error', (error) => resolve({ code: 1, error: error.message }));
    child.once('exit', (code, signal) =>
      resolve({ code: code ?? 1, ...(signal ? { signal } : {}) }),
    );
  });
}

export async function runSteps(steps, run = execute) {
  const results = [];
  for (const step of steps) {
    const blocked = step.needs.filter(
      (id) => results.find((result) => result.id === id)?.status !== 'PASS',
    );
    if (blocked.length) {
      results.push({
        id: step.id,
        status: 'SKIP',
        seconds: 0,
        reason: `Failed prerequisite: ${blocked.join(', ')}`,
      });
      continue;
    }
    console.log(`\n▶ ${step.id}`);
    const start = performance.now();
    let result;
    try {
      result = await run(step);
    } catch (error) {
      result = { code: 1, error: error.message };
    }
    results.push({
      id: step.id,
      status: result.code === 0 ? 'PASS' : 'FAIL',
      seconds: Math.round((performance.now() - start) / 10) / 100,
      ...result,
    });
  }
  return results;
}
