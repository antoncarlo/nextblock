'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Internal analytics — behavioral tracker (client side).
 *
 * Mounted once in the root layout; renders nothing. Captures:
 *   - CLICK on links/buttons (attributed to the nearest [data-track-section])
 *   - SECTION DWELL TIME via IntersectionObserver on [data-track-section]
 *   - SCROLL DEPTH milestones (25/50/75/100% of the page, max reached)
 *
 * Every send is fire-and-forget through navigator.sendBeacon (fetch keepalive
 * fallback) so nothing is lost on unload and navigation is never blocked.
 * The session id is NOT read here: /api/track/event re-reads the httpOnly
 * cookie server-side. No personal data is collected.
 */

interface TrackEvent {
  path: string;
  eventType: 'click' | 'section_time' | 'scroll';
  section?: string | null;
  elementText?: string | null;
  valueNumeric?: number | null;
}

const ENDPOINT = '/api/track/event';

function send(events: TrackEvent[]) {
  if (events.length === 0) return;
  const body = JSON.stringify(events.length === 1 ? events[0] : events);
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
  } catch {
    // Analytics must never surface errors to the visitor.
  }
}

function labelOf(el: Element): string {
  const aria = el.getAttribute('aria-label');
  const text = (aria ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 120);
}

export function TrackerScript() {
  const pathname = usePathname();
  // Refs survive re-renders; state is intentionally not used (no re-render needed).
  const dwell = useRef<Map<string, { acc: number; since: number | null }>>(new Map());
  const milestones = useRef<Set<number>>(new Set());
  const pathRef = useRef<string>(pathname ?? '/');

  useEffect(() => {
    const path = pathname ?? '/';
    pathRef.current = path;
    dwell.current = new Map();
    milestones.current = new Set();

    // --- SECTION DWELL TIME -------------------------------------------------
    const io = new IntersectionObserver(
      (entries) => {
        const now = performance.now();
        for (const entry of entries) {
          const name = entry.target.getAttribute('data-track-section');
          if (!name) continue;
          const rec = dwell.current.get(name) ?? { acc: 0, since: null };
          if (entry.isIntersecting && rec.since === null) {
            rec.since = now;
          } else if (!entry.isIntersecting && rec.since !== null) {
            rec.acc += now - rec.since;
            rec.since = null;
          }
          dwell.current.set(name, rec);
        }
      },
      // "Visible" = at least 40% of the section in viewport.
      { threshold: 0.4 },
    );

    const observed = new Set<Element>();
    const scan = () => {
      document.querySelectorAll('[data-track-section]').forEach((el) => {
        if (!observed.has(el)) {
          observed.add(el);
          io.observe(el);
        }
      });
    };
    scan();
    // Sections mounted after data fetches: one delayed rescan is enough.
    const rescan = window.setTimeout(scan, 2000);

    const flushDwell = () => {
      const now = performance.now();
      const batch: TrackEvent[] = [];
      dwell.current.forEach((rec, name) => {
        const total = rec.acc + (rec.since !== null ? now - rec.since : 0);
        rec.acc = 0;
        rec.since = rec.since !== null ? now : null;
        const seconds = Math.round(total / 1000);
        if (seconds >= 1) {
          batch.push({ path: pathRef.current, eventType: 'section_time', section: name, valueNumeric: seconds });
        }
      });
      send(batch);
    };

    // --- CLICKS -------------------------------------------------------------
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const interactive = target?.closest('a, button, [role="button"]');
      if (!interactive) return;
      const section = interactive.closest('[data-track-section]')?.getAttribute('data-track-section') ?? null;
      send([{ path: pathRef.current, eventType: 'click', section, elementText: labelOf(interactive) }]);
    };
    document.addEventListener('click', onClick, { capture: true, passive: true });

    // --- SCROLL DEPTH -------------------------------------------------------
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        const percent = scrollable <= 0 ? 100 : ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100;
        for (const m of [25, 50, 75, 100]) {
          if (percent >= m && !milestones.current.has(m)) {
            milestones.current.add(m);
            send([{ path: pathRef.current, eventType: 'scroll', valueNumeric: m }]);
          }
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // short pages may already satisfy 100%

    // --- FLUSH ON LEAVE -----------------------------------------------------
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushDwell();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flushDwell);

    return () => {
      // Route change (SPA): flush dwell for the page we are leaving.
      flushDwell();
      window.clearTimeout(rescan);
      io.disconnect();
      document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flushDwell);
    };
  }, [pathname]);

  return null;
}
