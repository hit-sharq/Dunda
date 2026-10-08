import { after } from "next/server";
import { prisma } from "@/lib/db/client";
import { runRenewalSweep } from "@/lib/server/payments";

/**
 * The in-app clock.
 *
 * A serverless function cannot wake itself, so work
 * that must happen on a schedule is read from the
 * database whenever the app is asked anything: a job
 * that is due runs after the answer is sent, and a
 * lock column stops two requests running it at once.
 * Traffic keeps the clock; the lock keeps it honest.
 *
 * This is what makes the schedule independent of any
 * one host's cron: it runs wherever the app runs,
 * and a missed run is caught by the next request
 * rather than waiting for the next day.
 */

/** How long a claim on a job lasts before another request may take it. */
const LOCK_TIMEOUT_MINUTES = 30;

interface ScheduledJob {
  name: string;
  intervalMinutes: number;
  run: () => Promise<unknown>;
}

/** The work the clock runs. */
const JOBS: ScheduledJob[] = [
  {
    name: "renewal-sweep",
    intervalMinutes: 60 * 24,
    run: runRenewalSweep,
  },
];

/**
 * Claims and runs whatever is due.
 *
 * The claim is one conditional update, so exactly
 * one request wins a job even when two arrive
 * together. The job itself runs after the response
 * — a sweep takes seconds per club, and no caller
 * should wait for it — and the run is recorded
 * either way, so a job that fails is retried on
 * its next schedule rather than on every request.
 */
export async function scheduleDueJobs(url: string): Promise<void> {
  // The clock's own endpoints run their jobs
  // directly, so they are not asked again.
  if (url.includes("/api/cron/")) return;

  for (const job of JOBS) {
    const dueAt = new Date(Date.now() - job.intervalMinutes * 60_000);
    const staleLockAt = new Date(
      Date.now() - LOCK_TIMEOUT_MINUTES * 60_000,
    );

    let claimed: number;
    try {
      const result = await prisma.dunda_scheduled_jobs.updateMany({
        where: {
          name: job.name,
          AND: [
            {
              OR: [
                { last_run_at: null },
                { last_run_at: { lte: dueAt } },
              ],
            },
            {
              OR: [
                { locked_at: null },
                { locked_at: { lte: staleLockAt } },
              ],
            },
          ],
        },
        data: { locked_at: new Date() },
      });
      claimed = result.count;
    } catch {
      // A clock that cannot read the database is
      // silent: it must never take a request down
      // with it, and the next traffic tries again.
      return;
    }
    if (claimed === 0) continue;

    after(async () => {
      try {
        await job.run();
      } catch (error) {
        console.error(`[dunda] scheduled job ${job.name} failed`, error);
      } finally {
        await prisma.dunda_scheduled_jobs
          .updateMany({
            where: { name: job.name },
            data: { last_run_at: new Date(), locked_at: null },
          })
          .catch(() => undefined);
      }
    });
  }
}

/** Records that a job ran, for a trigger that runs it directly. */
export async function markScheduledJobRun(name: string): Promise<void> {
  await prisma.dunda_scheduled_jobs
    .updateMany({
      where: { name },
      data: { last_run_at: new Date(), locked_at: null },
    })
    .catch(() => undefined);
}
