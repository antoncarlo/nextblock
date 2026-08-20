/**
 * What the simulation produces.
 *
 * A campaign that ends in "it passed" or "it failed" is not useful to an
 * auditor. What is useful is a record of each thing that went wrong, precise
 * enough to be replayed by somebody who was not there. So a finding carries
 * the seed and the action index alongside the claim — everything needed to
 * regenerate the state that produced it.
 */

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export type FindingKind =
  /** On-chain state diverged from the independently-computed shadow model. */
  | 'DRIFT'
  /** An action expected to revert was accepted. */
  | 'PERMITTED'
  /** An action expected to succeed reverted. */
  | 'REFUSED'
  /** A stated invariant did not hold. */
  | 'INVARIANT'
  /** The run could not continue: infrastructure, not protocol. */
  | 'HARNESS';

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  /** One sentence naming the defect, not its consequence. */
  summary: string;
  /** The invariant or rule this violates, e.g. "I-37". */
  rule?: string;
  /** Agent that took the action, e.g. "A3-allocator-01". */
  agent?: string;
  /** Everything needed to replay. */
  repro: {
    seed: string;
    /** Zero-based index of the action within the run. */
    actionIndex: number;
    scenario: string;
    contract?: string;
    functionName?: string;
    args?: unknown[];
  };
  /** Expected and observed, as strings so bigint and address survive. */
  expected?: string;
  observed?: string;
  /** Transaction hash where one exists. Absent for view-only checks. */
  txHash?: string;
}

/**
 * Severity is assigned from the kind and what moved, never from how alarming
 * the message reads.
 *
 * The rules are deliberately blunt. A grader that weighs many factors produces
 * numbers nobody can predict or argue with; one that can be stated in four
 * lines can be disagreed with, which is what makes it useful in a review.
 */
export function classify(kind: FindingKind, context: { movesFunds?: boolean; isAuthority?: boolean }): Severity {
  // Anything that moves value incorrectly, or grants authority that was not
  // held, is the top band regardless of how small the amount was. The amount
  // is a fact about this run; the reachability is a fact about the protocol.
  if (context.movesFunds || context.isAuthority) return 'P0';

  switch (kind) {
    // Accounting that disagrees with an independent model is P0 by default:
    // either the contract is wrong or the model is, and until that is settled
    // no other number from the run can be trusted.
    case 'DRIFT':
      return 'P0';
    // A refusal that did not happen is a hole in the perimeter.
    case 'PERMITTED':
      return 'P1';
    case 'INVARIANT':
      return 'P1';
    // A legitimate action being rejected is a liveness problem: real, but it
    // costs availability rather than money.
    case 'REFUSED':
      return 'P2';
    // Not a statement about the protocol at all.
    case 'HARNESS':
      return 'P3';
  }
}

/** One finding as an NDJSON line. */
export function toNdjson(finding: Finding): string {
  return JSON.stringify(finding);
}

/**
 * Findings as a JUnit report, so CI renders them where test results already
 * appear rather than in a log somebody has to open.
 *
 * Only P0 and P1 become failures. P2 and P3 are recorded as passing cases with
 * their text attached: a report where everything is a failure gets muted, and
 * a muted report is worth nothing.
 */
export function toJUnit(findings: Finding[], suiteName = 'agent-simulation'): string {
  const failures = findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const cases = findings
    .map((f) => {
      const name = escape(`${f.rule ?? f.kind}: ${f.summary}`);
      const body = escape(
        [
          f.summary,
          f.expected !== undefined ? `expected: ${f.expected}` : '',
          f.observed !== undefined ? `observed: ${f.observed}` : '',
          `replay: seed ${f.repro.seed}, scenario ${f.repro.scenario}, action ${f.repro.actionIndex}`,
        ]
          .filter(Boolean)
          .join('\n'),
      );

      if (f.severity === 'P0' || f.severity === 'P1') {
        return `    <testcase classname="${escape(f.agent ?? 'protocol')}" name="${name}">\n      <failure type="${f.kind}" message="${escape(f.summary)}">${body}</failure>\n    </testcase>`;
      }
      return `    <testcase classname="${escape(f.agent ?? 'protocol')}" name="${name}">\n      <system-out>${body}</system-out>\n    </testcase>`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites>',
    `  <testsuite name="${escape(suiteName)}" tests="${findings.length}" failures="${failures.length}">`,
    cases,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}

/**
 * A Foundry test that reproduces the finding.
 *
 * Emitted as a skeleton rather than a runnable proof. It carries the seed, the
 * scenario and the exact call, which is the part a human cannot reconstruct
 * from a log; the setup is left as a marked gap because a generator that
 * guessed at it would produce tests that compile and prove the wrong thing.
 * A stub somebody has to finish is more honest than a green test nobody wrote.
 */
export function toReproTest(finding: Finding): string {
  const fn = finding.repro.functionName ?? 'unknown';
  const safeName = fn.replace(/[^a-zA-Z0-9]/g, '');

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/// @title Repro_${safeName}_${finding.repro.actionIndex}
/// @author Anton Carlo Santoro
/// @notice ${finding.summary}
/// @dev Generated from a simulation finding. Severity ${finding.severity}, kind
///      ${finding.kind}${finding.rule ? `, rule ${finding.rule}` : ''}.
///
///      Replay coordinates: seed ${finding.repro.seed}, scenario
///      ${finding.repro.scenario}, action index ${finding.repro.actionIndex}.
///
///      The setup below is deliberately incomplete. The generator knows which
///      call failed and with what arguments; it does not know which of the
///      thousands of preceding actions were load-bearing, and a guess would
///      produce a test that compiles and proves something other than the
///      finding. Fill it in from the run log before trusting a green result.
contract Repro_${safeName}_${finding.repro.actionIndex}Test is Test {
    function setUp() public {
        // TODO: rebuild the state at action ${finding.repro.actionIndex} of scenario
        // ${finding.repro.scenario}.
    }

    function test_reproduces() public {
        vm.skip(true); // remove once setUp is complete
        // contract:  ${finding.repro.contract ?? 'unknown'}
        // function:  ${fn}
        // arguments: ${JSON.stringify(finding.repro.args ?? [])}
        // expected:  ${finding.expected ?? 'n/a'}
        // observed:  ${finding.observed ?? 'n/a'}
    }
}
`;
}
