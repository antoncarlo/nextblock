import { resolve } from 'node:path';

/**
 * Resolve a path the way the person (or workflow) who typed it meant it.
 *
 * `npm --workspace @nextblock/sim run smoke -- … contracts/deployments/x.json` runs the
 * script with its working directory set to the workspace (packages/sim), not to where the
 * command was typed, so a path written relative to the repository root points at a file
 * that does not exist. npm records the directory it was invoked from in INIT_CWD; paths
 * are resolved against that, and against the working directory when run without npm.
 * Absolute paths are returned unchanged.
 */
export function fromInvocation(path: string, env: Record<string, string | undefined> = process.env): string {
  return resolve(env.INIT_CWD || process.cwd(), path);
}
