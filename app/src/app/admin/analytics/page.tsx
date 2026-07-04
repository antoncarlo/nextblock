import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase-server';

/**
 * Internal analytics dashboard — /admin/analytics.
 *
 * Password-gated (env ADMIN_PASSWORD; session cookie = sha256 of the
 * password, httpOnly) and explicitly non-indexed. Reads site_visits and
 * site_events with the service-role client (both tables are RLS
 * deny-by-default). Charts are dependency-free (pure divs/inline styles).
 *
 * Palette (spec): page #2A3660, accents #00FFCC, table headers #2A3660 with
 * bold white text, striped rows white / light gray.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NextBlock — Internal Analytics',
  robots: { index: false, follow: false, nocache: true },
};

const AUTH_COOKIE = 'nb_admin';
const NAVY = '#2A3660';
const MINT = '#00FFCC';

function passwordHash(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return createHash('sha256').update(pw).digest('hex');
}

async function login(formData: FormData) {
  'use server';
  const expected = passwordHash();
  const given = String(formData.get('password') ?? '');
  if (expected && createHash('sha256').update(given).digest('hex') === expected) {
    (await cookies()).set(AUTH_COOKIE, expected, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/admin',
      maxAge: 12 * 60 * 60,
    });
  }
  revalidatePath('/admin/analytics');
}

async function logout() {
  'use server';
  (await cookies()).delete(AUTH_COOKIE);
  revalidatePath('/admin/analytics');
}

// --- data shaping (pure TS, testnet-scale caps) ----------------------------

interface VisitRow {
  created_at: string;
  country: string | null;
  referrer: string | null;
  path: string;
  session_id: string;
  ip?: string | null;
  city?: string | null;
  user_agent?: string | null;
}
interface EventRow {
  session_id: string;
  path: string;
  event_type: 'click' | 'section_time' | 'scroll';
  section: string | null;
  element_text: string | null;
  value_numeric: number | null;
}

function topN(counts: Map<string, number>, n: number): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}
function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default async function AnalyticsPage() {
  const expected = passwordHash();
  const authed = expected !== null && (await cookies()).get(AUTH_COOKIE)?.value === expected;

  if (!expected) {
    return (
      <Shell>
        <Card title="Not configured">
          <p style={{ color: '#374151', fontSize: 14 }}>
            Set the <code>ADMIN_PASSWORD</code> environment variable to enable this dashboard.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!authed) {
    return (
      <Shell>
        <Card title="Internal analytics — sign in">
          <form action={login} style={{ display: 'flex', gap: 10 }}>
            <input
              type="password"
              name="password"
              placeholder="Admin password"
              autoFocus
              style={{ flex: 1, border: '1px solid #D1D5DB', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}
            />
            <button
              type="submit"
              style={{ background: NAVY, color: '#fff', fontWeight: 700, border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer' }}
            >
              Enter
            </button>
          </form>
        </Card>
      </Shell>
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return (
      <Shell>
        <Card title="Backend unavailable">
          <p style={{ color: '#374151', fontSize: 14 }}>Supabase service credentials are not configured.</p>
        </Card>
      </Shell>
    );
  }

  // eslint-disable-next-line -- server component, force-dynamic: "now" is the request instant by design
  const now = Date.now();
  const dayMs = 86_400_000;
  const iso = (t: number) => new Date(t).toISOString();
  const since30 = iso(now - 30 * dayMs);
  const since7 = iso(now - 7 * dayMs);
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';

  const [vToday, vWeek, vMonth, visitsQ, eventsQ] = await Promise.all([
    supabase.from('site_visits').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('site_visits').select('id', { count: 'exact', head: true }).gte('created_at', since7),
    supabase.from('site_visits').select('id', { count: 'exact', head: true }).gte('created_at', since30),
    supabase
      .from('site_visits')
      .select('created_at, country, referrer, path, session_id, ip, city, user_agent')
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(20000),
    supabase
      .from('site_events')
      .select('session_id, path, event_type, section, element_text, value_numeric')
      .gte('created_at', since30)
      .limit(20000),
  ]);

  const visits = (visitsQ.data ?? []) as VisitRow[];
  const events = (eventsQ.data ?? []) as EventRow[];

  // KPI: avg session time = sum of section dwell per session (30d);
  // bounce = sessions with exactly one pageview (7d).
  const dwellPerSession = new Map<string, number>();
  const viewsPerSession7 = new Map<string, number>();
  const daily = new Map<string, number>();
  const countries = new Map<string, number>();
  const referrers = new Map<string, number>();
  const pages = new Map<string, number>();

  for (const v of visits) {
    bump(daily, v.created_at.slice(0, 10));
    bump(countries, v.country || 'Unknown');
    bump(pages, v.path);
    if (v.referrer) {
      let host = v.referrer;
      try {
        host = new URL(v.referrer).host || v.referrer;
      } catch {
        // keep the raw value when it is not a URL
      }
      if (!host.includes('nextblock')) bump(referrers, host);
    }
    if (v.created_at >= since7) bump(viewsPerSession7, v.session_id);
  }

  const sectionTimeByPath = new Map<string, Map<string, number>>();
  const clicks = new Map<string, number>();
  const scrollMaxBySessionPath = new Map<string, number>();

  for (const e of events) {
    if (e.event_type === 'section_time' && e.section && e.value_numeric) {
      bump(dwellPerSession, e.session_id, e.value_numeric);
      const per = sectionTimeByPath.get(e.path) ?? new Map<string, number>();
      bump(per, e.section, e.value_numeric);
      sectionTimeByPath.set(e.path, per);
    } else if (e.event_type === 'click') {
      bump(clicks, `${e.section ?? '—'} · ${e.element_text ?? '(no text)'}`);
    } else if (e.event_type === 'scroll' && e.value_numeric) {
      const key = `${e.session_id}|${e.path}`;
      scrollMaxBySessionPath.set(key, Math.max(scrollMaxBySessionPath.get(key) ?? 0, e.value_numeric));
    }
  }

  const dwellValues = [...dwellPerSession.values()];
  const avgSessionSec = dwellValues.length ? Math.round(dwellValues.reduce((a, b) => a + b, 0) / dwellValues.length) : 0;
  const sessions7 = viewsPerSession7.size;
  const bounces7 = [...viewsPerSession7.values()].filter((n) => n === 1).length;
  const bounceRate = sessions7 ? Math.round((bounces7 / sessions7) * 100) : 0;

  // Daily series, oldest → newest, zero-filled.
  const series: { day: string; n: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(now - i * dayMs).toISOString().slice(0, 10);
    series.push({ day, n: daily.get(day) ?? 0 });
  }
  const seriesMax = Math.max(1, ...series.map((s) => s.n));

  // Scroll depth per path: average per-session max milestone + stall/finish shares.
  const scrollAgg = new Map<string, { sum: number; n: number; low: number; full: number }>();
  scrollMaxBySessionPath.forEach((max, key) => {
    const path = key.slice(key.indexOf('|') + 1);
    const rec = scrollAgg.get(path) ?? { sum: 0, n: 0, low: 0, full: 0 };
    rec.sum += max;
    rec.n += 1;
    if (max <= 25) rec.low += 1;
    if (max >= 100) rec.full += 1;
    scrollAgg.set(path, rec);
  });
  const scrollRows = [...scrollAgg.entries()]
    .map(([path, r]) => ({
      path,
      avg: Math.round(r.sum / r.n),
      n: r.n,
      lowPct: Math.round((r.low / r.n) * 100),
      fullPct: Math.round((r.full / r.n) * 100),
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  const topSectionPerPath = [...sectionTimeByPath.entries()]
    .map(([path, per]) => {
      const [best, secs] = topN(per, 1)[0] ?? ['—', 0];
      return { path, best, secs: Math.round(secs) };
    })
    .sort((a, b) => b.secs - a.secs)
    .slice(0, 10);

  const last50 = visits.slice(0, 50);

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: 0 }}>
          Internal analytics <span style={{ color: MINT }}>· NextBlock</span>
        </h1>
        <form action={logout}>
          <button
            type="submit"
            style={{ background: 'transparent', color: MINT, border: `1px solid ${MINT}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            Logout
          </button>
        </form>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Kpi label="Visits today" value={fmt(vToday.count ?? 0)} />
        <Kpi label="Visits 7 days" value={fmt(vWeek.count ?? 0)} />
        <Kpi label="Visits 30 days" value={fmt(vMonth.count ?? 0)} />
        <Kpi label="Avg session time" value={`${avgSessionSec}s`} note="sum of section dwell / session" />
        <Kpi label="Bounce rate (7d)" value={`${bounceRate}%`} note={`${bounces7}/${sessions7} single-view sessions`} />
      </div>

      {/* Daily visits bar chart */}
      <Card title="Daily visits — last 30 days">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
          {series.map((s) => (
            <div
              key={s.day}
              title={`${s.day}: ${s.n}`}
              style={{ flex: 1, background: MINT, opacity: s.n === 0 ? 0.15 : 0.9, height: `${Math.max(3, (s.n / seriesMax) * 100)}%`, borderRadius: '3px 3px 0 0' }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6B7280', fontSize: 11, marginTop: 6 }}>
          <span>{series[0].day}</span>
          <span>max {seriesMax}/day</span>
          <span>{series[series.length - 1].day}</span>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Card title="Top 10 countries">
          <Bars data={topN(countries, 10)} />
        </Card>
        <Card title="Top 10 referrers">
          <Bars data={topN(referrers, 10)} empty="No external referrers yet" />
        </Card>
        <Card title="Top 10 pages">
          <Bars data={topN(pages, 10)} />
        </Card>
        <Card title="Top 10 clicked elements">
          <Bars data={topN(clicks, 10)} empty="No clicks captured yet" />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
        <Card title="Most-viewed section per page (dwell seconds)">
          <Table
            head={['Page', 'Top section', 'Seconds (agg.)']}
            rows={topSectionPerPath.map((r) => [r.path, r.best, fmt(r.secs)])}
            empty="No section_time events yet — instrument sections with data-track-section"
          />
        </Card>
        <Card title="Scroll depth per page (per-session max)">
          <Table
            head={['Page', 'Avg max scroll', 'Stuck ≤25%', 'Reach 100%', 'Sessions']}
            rows={scrollRows.map((r) => [r.path, `${r.avg}%`, `${r.lowPct}%`, `${r.fullPct}%`, fmt(r.n)])}
            empty="No scroll events yet"
          />
          {scrollRows.length > 0 && (
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 10 }}>
              Reading: on <strong>{scrollRows[0].path}</strong>, {100 - scrollRows[0].fullPct}% of sessions never reach
              the end of the page (avg max depth {scrollRows[0].avg}%).
            </p>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Last 50 visits (raw)">
          <Table
            head={['When (UTC)', 'Path', 'Country', 'City', 'Referrer', 'Session']}
            rows={last50.map((v) => [
              v.created_at.replace('T', ' ').slice(0, 19),
              v.path,
              v.country ?? '—',
              v.city ?? '—',
              v.referrer ? v.referrer.slice(0, 40) : '—',
              v.session_id.slice(0, 8),
            ])}
            empty="No visits recorded yet"
          />
        </Card>
      </div>
    </Shell>
  );
}

// --- presentational (palette-locked) ---------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: NAVY, padding: '28px 20px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 18, marginBottom: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.18)' }}>
      <h2 style={{ color: NAVY, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 12px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,255,204,0.35)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: MINT, fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {note && <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function Bars({ data, empty }: { data: [string, number][]; empty?: string }) {
  if (data.length === 0) return <p style={{ color: '#9CA3AF', fontSize: 13 }}>{empty ?? 'No data yet'}</p>;
  const max = Math.max(...data.map(([, n]) => n));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map(([label, n]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{ width: 170, color: '#374151', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={label}
          >
            {label}
          </span>
          <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 4, height: 14 }}>
            <div style={{ width: `${(n / max) * 100}%`, background: MINT, height: '100%', borderRadius: 4 }} />
          </div>
          <span style={{ width: 48, textAlign: 'right', color: NAVY, fontSize: 12, fontWeight: 700 }}>{fmt(n)}</span>
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  if (rows.length === 0) return <p style={{ color: '#9CA3AF', fontSize: 13 }}>{empty ?? 'No data yet'}</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} style={{ background: NAVY, color: '#fff', fontWeight: 700, textAlign: 'left', padding: '8px 10px', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F3F4F6' }}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
