/**
 * Keeps private keys out of everything that is not a signer.
 *
 * The harness holds a dozen keys at once, and every one of them is a liability
 * in a log line. The rules here are narrow on purpose: a key is read from the
 * environment, handed to a signer, and never again appears in a string that
 * anything else could persist.
 *
 * None of this makes a leaked key safe. It makes leaking one require somebody
 * to work around a guard rather than forget one.
 */

export class KeyGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyGuardError';
  }
}

/** Matches a 32-byte hex private key, with or without the 0x prefix. */
const PRIVATE_KEY_PATTERN = /\b(0x)?[0-9a-fA-F]{64}\b/g;

/**
 * Loads a key from the environment and confirms it is well formed.
 *
 * Returns the value rather than a wrapper because viem needs the string. The
 * discipline this enforces is at the boundary: nothing else in the package
 * should call `process.env` for a key, so there is one place to audit.
 */
export function loadKey(varName: string): `0x${string}` {
  const raw = process.env[varName];
  if (!raw) {
    throw new KeyGuardError(
      `${varName} is not set. Agent keys are read from the environment and never committed, ` +
        `never passed on the command line, and never written to a run artefact.`,
    );
  }

  const trimmed = raw.trim();
  const normalised = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalised)) {
    // Deliberately does not echo the value, not even its length: a malformed
    // key is still a secret, and error messages travel further than anything
    // else in a system.
    throw new KeyGuardError(`${varName} is not a well-formed 32-byte hex private key.`);
  }

  return normalised as `0x${string}`;
}

/**
 * Confirms the same key is not driving two agents.
 *
 * Sharing one key across roles is the single change that would make the whole
 * campaign meaningless: every separation-of-duty invariant would pass because
 * there would be no separation to violate, and none of them would say so. The
 * staging deployment is known to run several roles from one EOA, which is
 * exactly why this is checked in code rather than assumed from the runbook.
 */
export function assertDistinctSigners(agents: { id: string; address: string }[]): void {
  const seen = new Map<string, string>();

  for (const agent of agents) {
    const key = agent.address.toLowerCase();
    const previous = seen.get(key);
    if (previous) {
      throw new KeyGuardError(
        `Agents "${previous}" and "${agent.id}" share the address ${agent.address}. ` +
          `Every role-separation invariant in the suite would hold trivially, and would report ` +
          `green while proving nothing. Give each agent its own key.`,
      );
    }
    seen.set(key, agent.id);
  }
}

/**
 * Removes anything that looks like a private key from text about to be
 * written somewhere durable.
 *
 * Applied to findings, logs and artefacts. It is a backstop rather than the
 * defence — the defence is not putting keys in strings — but a backstop is
 * worth having on the path to a file that gets uploaded to CI and kept for
 * ninety days.
 */
export function redact(text: string): string {
  return text.replace(PRIVATE_KEY_PATTERN, '[redacted-key]');
}

/**
 * True if the text contains something shaped like a private key.
 *
 * For asserting in tests that an artefact writer is clean, rather than for
 * branching at runtime: by the time this returns true at runtime the string
 * already exists.
 *
 * A 32-byte hash matches this pattern too. That is a false positive worth
 * accepting — the cost is a redacted hash in a log, against the cost of a
 * missed key.
 */
export function looksLikeKey(text: string): boolean {
  PRIVATE_KEY_PATTERN.lastIndex = 0;
  return PRIVATE_KEY_PATTERN.test(text);
}
