-- AlterTable
ALTER TABLE "users" ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "consentedAt" TIMESTAMP(3);
