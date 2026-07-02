/**
 * Public integrity manifest for a confidential portfolio document (pure).
 *
 * In confidential-pinning mode the bordereau/treaty itself never touches IPFS
 * — anyone who learns a CID can read the content, and a bordereau carries
 * insured-party data. What gets pinned instead is this manifest: the keccak256
 * fingerprint of the real bytes plus non-sensitive metadata. It lets anyone
 * verify LATER that a disclosed document is exactly the committed one (hash it,
 * compare), without the document being public in the meantime.
 *
 * DO NOT add fields derived from the document's CONTENT (insured names, sums,
 * row counts…): the manifest is world-readable forever.
 */

export const PORTFOLIO_MANIFEST_KIND = 'nextblock.portfolio-document.v1';

export interface PortfolioDocumentManifest {
  kind: typeof PORTFOLIO_MANIFEST_KIND;
  /** 0x-prefixed keccak256 of the raw document bytes — matches the on-chain documentHash. */
  documentHash: `0x${string}`;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Lowercase wallet that signed the upload (already public on-chain as the cedant). */
  uploader: string;
  /** ISO-8601 upload instant. */
  uploadedAt: string;
  /** Where the confidential bytes live (a pointer class, never a fetchable URL). */
  storage: 'private-bucket';
  note: string;
}

export function buildDocumentManifest(input: {
  documentHash: `0x${string}`;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploader: string;
  uploadedAt: Date;
}): PortfolioDocumentManifest {
  return {
    kind: PORTFOLIO_MANIFEST_KIND,
    documentHash: input.documentHash,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    uploader: input.uploader.toLowerCase(),
    uploadedAt: input.uploadedAt.toISOString(),
    storage: 'private-bucket',
    note:
      'Confidential document: bytes are held off-chain in a private bucket. ' +
      'This manifest is the public integrity record — keccak256 of the real bytes ' +
      'equals documentHash on the NextBlock PortfolioRegistry.',
  };
}
