import type { ReportNote } from '@/lib/types';

export function ReportNoteView({ note }: { note: ReportNote }) {
  return (
    <>
      <p>
        <span className="kicker note-label">What happened</span>
        {note.happened}
      </p>
      <p>
        <span className="kicker note-label">What it means</span>
        {note.means}
      </p>
      <p>
        <span className="kicker note-label">What it might have influenced</span>
        {note.influenced}
      </p>
    </>
  );
}
