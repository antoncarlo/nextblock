'use client';
import { useEffect, useState } from 'react';
import {
  indexTermsByVault,
  type OfferingTerms,
} from '@/lib/offering/terms';

/**
 * Curator-supplied offering terms for all vaults, indexed by address.
 * One fetch per page load (the dataset is a handful of rows). `source`
 * tells the UI what it is showing: curator terms (backend) or nothing —
 * callers fall back to the illustrative defaults and label them as such.
 */
export function useOfferingTerms(): {
  terms: Map<string, OfferingTerms>;
  loaded: boolean;
} {
  const [terms, setTerms] = useState<Map<string, OfferingTerms>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/app/offering-terms')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: { terms: OfferingTerms[] }) => {
        if (!cancelled) setTerms(indexTermsByVault(json.terms ?? []));
      })
      .catch(() => {
        // Soft-fail: the vault list keeps rendering with the labeled
        // illustrative fallback; nothing is silently presented as curated.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { terms, loaded };
}
