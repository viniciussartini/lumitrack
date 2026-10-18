-- AlterTable
ALTER TABLE "report_schedules" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextRunAt" TIMESTAMP(3);
