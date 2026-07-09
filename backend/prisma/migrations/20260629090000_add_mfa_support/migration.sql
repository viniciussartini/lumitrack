-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'MFA_ENABLED';
ALTER TYPE "audit_action" ADD VALUE 'MFA_DISABLED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT;

-- CreateTable
CREATE TABLE "mfa_backup_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfa_backup_codes_userId_idx" ON "mfa_backup_codes"("userId");

-- AddForeignKey
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
