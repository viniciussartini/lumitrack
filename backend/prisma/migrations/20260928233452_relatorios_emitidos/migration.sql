-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('MONTHLY', 'CONSUMPTION', 'ALERTS', 'POWER_QUALITY', 'DEMAND');

-- CreateEnum
CREATE TYPE "report_format" AS ENUM ('PDF', 'CSV');

-- CreateEnum
CREATE TYPE "report_origin" AS ENUM ('MANUAL', 'SCHEDULED');

-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'REPORT_GENERATE';

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "report_type" NOT NULL,
    "format" "report_format" NOT NULL,
    "origin" "report_origin" NOT NULL DEFAULT 'MANUAL',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_userId_createdAt_idx" ON "reports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_createdAt_idx" ON "reports"("createdAt");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
