'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatDay, formatEtClock } from '@/lib/format';
import type { MacroEvent, MacroImpact } from '@/lib/types';
import { formatPrint } from '@/server/macro';
import { ReportNoteView } from './report-note';

type Payload = {
  events: MacroEvent[];
  updatedAt: number | null;
  attribution: string;
  error: string | null;
};

type Filter = 'high' | 'notable' | 'all';

const IMPACT: Record<MacroImpact, string> = { high: 'High', med: 'Medium', low: 'Low' };

export function CalendarBoard() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('notable');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    api<Payload>('/api/calendar')
      .then((body) => {
        if (!stop) setPayload(body);
      })
      .catch((err) => {
        if (!stop) setError(err instanceof Error ? err.message : 'Could not load the calendar.');
      });
    return () => {
      stop = true;
    };
  }, []);

  const events = useMemo(() => {
    const rows = payload?.events ?? [];
    if (filter === 'high') return rows.filter((event) => event.importance === 'high');
    if (filter === 'notable') return rows.filter((event) => event.importance !== 'low');
    return rows;
  }, [payload, filter]);

  const next = (payload?.events ?? []).find((event) => event.importance === 'high' && event.scheduledAt > Date.now());
  const groups = groupByDay(events);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Calendar</h1>
          <p className="muted" style={{ margin: '0.3rem 0 0' }}>
            US releases that tend to move rates, the dollar, and stocks. Upcoming rows explain the release. Once a
            print is out, the row summarizes what came out, what it means, and what it may have moved.
          </p>
        </div>
      </div>

      <div className="range" style={{ marginBottom: '0.9rem' }}>
        {(
          [
            ['high', 'High'],
            ['notable', 'High and medium'],
            ['all', 'All'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className="btn" type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {payload?.error && payload.events.length > 0 ? <div className="banner">{payload.error}</div> : null}
      {!payload && !error ? <p className="muted">Loading the calendar…</p> : null}

      {next ? (
        <div className="banner">
          Next high-impact release: {next.name}
          {next.period ? ` · ${next.period}` : ''} · {formatDay(next.scheduledAt).replace(/^Today · /, '')}{' '}
          {new Date(next.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ({formatEtClock(next.scheduledAt)})
        </div>
      ) : null}

      {payload && events.length === 0 ? (
        <div className="panel empty">
          <h2>Nothing in this filter</h2>
          <p>Try All to include lower-impact releases such as Treasury auctions.</p>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="day-label">{group.label}</h2>
          <div className="panel panel-pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
            {group.events.map((event) => {
              const expanded = open === event.id;
              const upcoming = event.scheduledAt > Date.now();
              return (
                <article key={event.id} className="event">
                  <button
                    className="event-row"
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : event.id)}
                  >
                    <div className="event-main">
                      <div className="num">
                        {new Date(event.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        <div className="muted">{formatEtClock(event.scheduledAt)}</div>
                      </div>
                      <div>
                        <div>
                          {event.name}{' '}
                          <span className={`tag impact-${event.importance}`}>{IMPACT[event.importance]}</span>
                        </div>
                        <div className="muted">
                          {event.period || 'US'}
                          {upcoming ? ' · Upcoming' : ''}
                        </div>
                      </div>
                      <div className="event-figures num">
                        <div>Prev {formatPrint(event.previous, event.unit)}</div>
                        <div>Actual {formatPrint(event.actual, event.unit)}</div>
                      </div>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="event-explain">
                      {event.report ? (
                        <ReportNoteView note={event.report} />
                      ) : (
                        <>
                          {upcoming ? null : (
                            <p className="muted">
                              The release time has passed. This feed has the schedule, not the text of the report, so the note stays
                              the general one.
                            </p>
                          )}
                          <p>{event.about}</p>
                          <p>{event.affects}</p>
                        </>
                      )}
                      {event.url ? (
                        <p>
                          <a href={event.url} target="_blank" rel="noreferrer">
                            Release page
                          </a>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {payload ? (
        <p className="muted credit">
          <a href="https://xoomar.com/markets/api/calendar" target="_blank" rel="noreferrer">
            Data: XOOMAR
          </a>
          {payload.attribution.replace(/^Data: XOOMAR\.?\s*/, '')
            ? `. ${payload.attribution.replace(/^Data: XOOMAR\.?\s*/, '')}`
            : ''}{' '}
          Consensus forecasts are not included. A published note is written from the print in this feed, set against
          the previous period, and describes the usual market link for a result like that.
        </p>
      ) : null}
    </>
  );
}

function groupByDay(events: MacroEvent[]): { key: string; label: string; events: MacroEvent[] }[] {
  const groups: { key: string; label: string; events: MacroEvent[] }[] = [];
  for (const event of events) {
    const key = new Date(event.scheduledAt).toLocaleDateString('en-CA');
    const current = groups.find((group) => group.key === key);
    if (current) current.events.push(event);
    else groups.push({ key, label: formatDay(event.scheduledAt), events: [event] });
  }
  return groups;
}

