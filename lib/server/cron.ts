import { after } from "next/server";
import { prisma } from "@/lib/db/client";
import { runRenewalSweep } from "@/lib/server/payments";




const LOCK_TIMEOUT_MINUTES = 30;

interface ScheduledJob {
  name: string;
  intervalMinutes: number;
  run: () => Promise<unknown>;
}


const JOBS: ScheduledJob[] = [
  {
    name: "renewal-sweep",
    intervalMinutes: 60 * 24,
    run: runRenewalSweep,
  },
];


export async function scheduleDueJobs(url: string): Promise<void> {
  
  
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


export async function markScheduledJobRun(name: string): Promise<void> {
  await prisma.dunda_scheduled_jobs
    .updateMany({
      where: { name },
      data: { last_run_at: new Date(), locked_at: null },
    })
    .catch(() => undefined);
}