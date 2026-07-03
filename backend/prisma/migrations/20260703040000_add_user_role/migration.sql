-- CreateEnum
CREATE TYPE "role" AS ENUM ('USER', 'ADMIN');

-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'ADMIN_AUDIT_LOG_VIEW';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "role" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "audit_logs_outcome_idx" ON "audit_logs"("outcome");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_idx" ON "audit_logs"("resourceType");
