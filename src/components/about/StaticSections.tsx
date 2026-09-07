import { MIN_GRADED_N, MIN_REVIEWS_RANKED } from '@/lib/domain/constants';
import { GPA_DATASET_URL } from './SourcesSection';
export function WhatSection({ schoolShortName }: { schoolShortName: string }) {
  return (
    <>
      <p>
        ProfPeek answers one registration-week question: <strong>which professor should I actually take?</strong> It joins
        the things that normally live on different tabs — the official grade distribution each instructor gave, which of
        their sections are offered this term and, where a school has them, what students said — and ranks the professors
        in a subject with the rules described on this page. Every school ships <strong>official grade data only</strong>;
        review features stay dormant until first-party reviews exist.
      </p>
      <p>
        It is a portfolio project, not a {schoolShortName} service. Nothing here is endorsed by the university. Rankings
        are one input to a decision, and the tooltips are written so a first-year can see what each number is and is
        not saying.
      </p>
    </>
  );
}

/** Design §5: why real schools have no reviews, what changes in the UI, and how first-party reviews come later. */
export function GradesOnlySection({ realSchools }: { realSchools: readonly string[] }) {
  const list = realSchools.length ? realSchools.join(', ') : 'every real school';
  return (
    <>
      <p>
        <strong>No scraped reviews.</strong> Review sites forbid reuse of their content in their terms of service, and a
        name-based join between grade rows and third-party opinions risks attributing someone else’s words to a real
        instructor. So {list} ship with <strong>official grade data and the public schedule only</strong>; nothing on those
        pages was written by a student.
      </p>
      <p>
        <strong>What changes on a grades-only school.</strong> Every professor with grade rows is ranked (there is no
        “not enough reviews” group), the default and only sort is the grade curve — leave-one-out Δ vs course, then GPA,
        then how many students were graded — and cards show the grade bar, the Δ chip, the W rate, the GPA trend and this
        term’s sections. Badges that need reviews (<em>Tough but loved</em>, <em>Hidden gem</em>) are never awarded; AI
        summaries and quotes are not rendered. Titles say “ranked by grade curve”.
      </p>
      <p>
        <strong>First-party reviews are the planned next step.</strong> The <code>sources.reviews</code> slot in the school
        registry is <code>null</code> for real schools today; a consent-based, first-party review source that fills it
        would switch the full UI back on for that school without any other change.
      </p>
    </>
  );
}

export function LimitationsSection({
  seatStatusAvailable,
  schoolNames = ['UIUC'],
}: {
  seatStatusAvailable: boolean;
  /** Short names of the real schools in this build. */
  schoolNames?: readonly string[];
}) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      <li>
        <strong>Grade rows are aggregates, not sections.</strong> The dataset publishes one row per term, course, section
        type and primary instructor, so co-taught courses credit only the listed primary instructor, and rows under{' '}
        {MIN_GRADED_N} graded students are hidden to protect privacy and avoid noise.
      </li>
      <li>
        <strong>Grades lag the schedule.</strong> The newest term in the dataset is usually a semester or two behind the
        term you are registering for; new instructors show “New — no grade data yet” and rank on reviews alone.
      </li>
      <li>
        <strong>Reviews (where present) are self-selected.</strong> Students who feel strongly write more; shrinkage and
        the {MIN_REVIEWS_RANKED}-review floor soften this but cannot remove it. Read the critical count next to every quote.
      </li>
      <li>
        <strong>Name matching is conservative, not perfect.</strong> Ambiguous strings become separate grades-only entries
        rather than guesses, so a professor’s record can be split across two rows when the dataset only gives an initial.
        The match report below lists every decision.
      </li>
      <li>
        <strong>{seatStatusAvailable ? 'Seat status is a snapshot.' : 'Seat status is not available.'}</strong>{' '}
        {seatStatusAvailable
          ? 'It is refreshed when the data is rebuilt, not live; the term pill shows the timestamp and turns amber when it is stale.'
          : 'The public schedule API says whether a section is offered, not whether it has seats.'}
      </li>
      <li>
        <strong>{schoolNames.length <= 1 ? 'One school.' : `${schoolNames.length} schools.`}</strong>{' '}
        {schoolNames.length ? `${schoolNames.join(', ')} ship${schoolNames.length === 1 ? 's' : ''} today.` : 'No real school ships yet.'}{' '}
        The repository and adapter interfaces are multi-school by design, but every threshold on this page was tuned on
        the UIUC dataset; a school’s grade buckets are normalised into one shape (see the sources table).
      </li>
      <li>
        <strong>Reviews are absent on real schools.</strong> Rankings there are grade curves only; a good teacher of a hard
        course can sit low on the list. Read the Δ chip as “grades vs. the same course taught by others”, not as quality.
      </li>
      <li>
        <strong>AI summaries are summaries.</strong> They paraphrase the selected reviews under a strict schema with
        validated evidence ids, but they are still generated text; use the “Why this?” links.
      </li>
    </ul>
  );
}

export function PrivacySection() {
  return (
    <>
      <p>
        <strong>No accounts; picks live in your browser.</strong> There is no sign-up, no login and no server-side user
        data. Your shortlist (“My picks”) and your last-chosen school are stored in <code>localStorage</code> on your
        device and never sent anywhere; share links carry the picks in the URL instead. The site sets no tracking cookies
        and loads no third-party analytics.
      </p>
      <p>
        <strong>Hosting and logs.</strong> The site is served by Vercel, whose request logs record the client IP, user
        agent, URL and time for a short retention window and are used only to operate the site. The API routes apply a
        per-IP rate limit; no request data is stored by the application itself.
      </p>
      <p>
        <strong>AI summaries.</strong> Summaries are generated offline by a script and committed; the deployed site
        serves them from a file and calls no model for public visitors. When the operator enables on-demand generation
        (<code>SUMMARY_ON_DEMAND=1</code>, gated by a shared secret), the professor’s name, department, aggregate
        statistics and the selected review texts are sent to the configured provider (Anthropic or Groq) at request
        time; nothing about the viewer is included.
      </p>
    </>
  );
}

export function LicensingSection() {
  return (
    <ul className="list-disc space-y-2 pl-5">
      <li>
        <strong>This project</strong> — source code and the processed datasets — is released under the{' '}
        <a href="https://opensource.org/licenses/MIT" rel="noopener noreferrer" target="_blank">MIT License</a>.
      </li>
      <li>
        <strong>UIUC GPA dataset</strong> — <a href={GPA_DATASET_URL} rel="noopener noreferrer" target="_blank">wadefagen/datasets</a>,
        No licence is declared on the dataset repository; the underlying grade records are Illinois public records released under FOIA, and we attribute the curator rather than claim a licence.
      </li>
      <li>
        <strong>UIUC Course Explorer</strong> — public API, no license asserted; used with attribution (“Data from the
        University of Illinois Course Explorer”). Nothing fetched from it is redistributed except the processed
        section list for the term shown.
      </li>
      <li>
        <strong>Review sites</strong> — no third-party review content is included in this repository. The optional live
        adapter is off by default and its output is never committed.
      </li>
    </ul>
  );
}
