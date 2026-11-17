# Unbeatable

*Your Life. Your Standards. Your Execution.*

A local-first personal discipline system: Command Center, tasks, habits, deep work and planning.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (logic + repository)
npm run build      # typecheck + production build in dist/
npm run preview    # serve the production build
```

## Stack and why

Vite + React 19 + TypeScript, Tailwind CSS v4, Radix Dialog, Lucide, Recharts, Zod, Dexie (IndexedDB).

The brief preferred Next.js + PostgreSQL + Prisma. For a single-user app whose main user is a minor, local-first storage is the better fit. Data never leaves the device, and there are no accounts, servers, secrets or trackers. A Next.js server layer would add nothing here. **There is no cloud sync.** Use Settings → Export to back up your data.

## Architecture

```
src/
  db/        schema.ts (Zod schemas = types), db.ts (Dexie), repo.ts (validated writes, export/import/delete)
  lib/       pure logic: date, habits (consistency/streaks/recovery), planner (recurrence/conflicts/workload),
             focus (timestamp-based timer state machine), mission (transparent task scoring)
  hooks/     app context (settings, today, dialogs), live data queries
  components/ ui kit, app shell, command palette, charts
  features/  onboarding, command center, tasks, habits, focus, planner, settings
```

Every write goes through `repo.ts` and is validated with Zod before it reaches IndexedDB.

## Key rules encoded

- Habit consistency is credit ÷ expected days. Partial progress earns partial credit, and excused days (rest, illness, injury, travel) are excluded.
- Optional habits are never "missed". In Recovery mode, only essential habits are expected.
- Today isn't judged until it's over. "Bounce-back rate" tracks recovery after a miss.
- Focus sessions record only time the timer actually ran. Paused time is "interrupted", and planned time never counts as work.
- Today's Mission holds at most three tasks. Suggestions show the reasons they were ranked.
- The planner flags overlaps and blocks outside waking hours, and estimates load against waking hours. It never auto-fills free time.
- Notifications fire only while the app is open in a tab. The app does not block other apps or websites.
