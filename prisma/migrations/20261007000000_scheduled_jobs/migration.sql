CREATE TABLE "dunda_scheduled_jobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interval_minutes" INTEGER NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "dunda_scheduled_jobs" ADD CONSTRAINT "dunda_scheduled_jobs_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "dunda_scheduled_jobs_name_key" ON "dunda_scheduled_jobs"("name");
INSERT INTO "dunda_scheduled_jobs" ("id", "name", "interval_minutes") VALUES ('job-renewal-sweep', 'renewal-sweep', 1440);
