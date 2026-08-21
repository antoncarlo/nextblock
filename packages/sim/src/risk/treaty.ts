/**
 * How a gross loss becomes a ceded loss.
 *
 * This is where the reinsurance actually happens. Everything upstream produces
 * a loss to the original insured; this module answers the only question the
 * vault cares about, which is how much of it lands on the vault's capital.
 *
 * The five structures mirror `PortfolioRegistry.StructureType`. They are kept
 * as one discriminated union rather than as flags on a single object because
 * the parameters do not overlap: an excess-of-loss layer has an attachment and
 * no cession percentage, a quota share has the reverse, and a type that
 * permitted both would let a scenario be written that no treaty wording could
 * express.
 */
export type TreatyStructure =
  | {
      /** Proportional: the reinsurer takes a fixed share of every loss. */
      kind: 'quota-share';
      /** Ceded share in basis points; 2_500 is a quarter of each loss. */
      cessionBps: number;
    }
  | {
      /** Non-proportional: the reinsurer pays only above a retention. */
      kind: 'excess-of-loss';
      /** The cedant's retention. Nothing below this reaches the vault. */
      attachment: number;
      /** The width of the layer above the attachment, not its top. */
      limit: number;
    }
  | {
      /**
       * Proportional, but the share varies with the size of the risk: the
       * cedant keeps a line and cedes the surplus above it.
       */
      kind: 'surplus';
      /** The cedant's retained line per risk. */
      retainedLine: number;
      /** Maximum multiple of the line the treaty will take. */
      lines: number;
      /** The sum insured of the risk this loss arose from. */
      sumInsured: number;
    }
  | {
      /**
       * Binary: an index crosses a threshold and a fixed amount is paid,
       * whatever the actual loss turns out to be.
       */
      kind: 'parametric';
      /** Index level at or above which the payout is triggered. */
      trigger: number;
      /** The amount paid when it is. */
      payout: number;
    }
  | {
      /** No transformation. Kept explicit so "on-chain" is a stated choice. */
      kind: 'proportional-full';
    };

/**
 * Apply the treaty to one gross loss.
 *
 * @param grossLoss The loss to the original insured.
 * @param structure The treaty wording, as data.
 * @param indexValue The parametric index reading, where one applies. Ignored
 *        by every other structure — a parametric treaty pays on the index and
 *        not on the loss, which is the entire point of buying one.
 */
export function cededLoss(grossLoss: number, structure: TreatyStructure, indexValue = 0): number {
  if (grossLoss < 0) throw new Error(`cededLoss: gross loss cannot be negative, got ${grossLoss}`);

  switch (structure.kind) {
    case 'quota-share': {
      const { cessionBps } = structure;
      if (cessionBps < 0 || cessionBps > 10_000) {
        throw new Error(`cededLoss: cessionBps must lie in [0, 10000], got ${cessionBps}`);
      }
      return (grossLoss * cessionBps) / 10_000;
    }

    case 'excess-of-loss': {
      const { attachment, limit } = structure;
      if (limit <= 0) throw new Error(`cededLoss: XOL limit must be positive, got ${limit}`);
      // Below the attachment the vault pays nothing; above attachment + limit
      // the excess returns to the cedant or its next layer.
      return Math.min(Math.max(grossLoss - attachment, 0), limit);
    }

    case 'surplus': {
      const { retainedLine, lines, sumInsured } = structure;
      if (retainedLine <= 0) throw new Error(`cededLoss: retained line must be positive, got ${retainedLine}`);
      if (sumInsured <= 0) throw new Error(`cededLoss: sum insured must be positive, got ${sumInsured}`);

      // The cession is a proportion of the risk, fixed when the risk is
      // written, and applies to every loss from it regardless of size. A risk
      // at or below the line is not ceded at all.
      const capacity = retainedLine * lines;
      const ceded = Math.min(Math.max(sumInsured - retainedLine, 0), capacity);
      return (grossLoss * ceded) / sumInsured;
    }

    case 'parametric': {
      const { trigger, payout } = structure;
      // The payout does not depend on grossLoss, and that asymmetry is the
      // instrument: it can pay when there was no loss, and pay nothing when
      // there was a large one. Basis risk is the price of settling in hours
      // rather than in years.
      return indexValue >= trigger ? payout : 0;
    }

    case 'proportional-full':
      return grossLoss;
  }
}

/**
 * Aggregate a period's ceded losses under an annual aggregate deductible and
 * limit, where the treaty carries them.
 *
 * Applied to the period total rather than claim by claim: an aggregate feature
 * responds to the accumulation, which is exactly the case a per-claim view
 * cannot see. A book of many small losses can exhaust an aggregate limit while
 * no single loss ever reached an attachment.
 */
export function applyAggregate(
  cededTotal: number,
  options: { deductible?: number; limit?: number } = {},
): number {
  const deductible = options.deductible ?? 0;
  const afterDeductible = Math.max(cededTotal - deductible, 0);
  return options.limit === undefined ? afterDeductible : Math.min(afterDeductible, options.limit);
}
