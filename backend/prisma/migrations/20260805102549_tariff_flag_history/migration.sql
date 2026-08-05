-- CreateEnum
CREATE TYPE "tariff_flag_change_source" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "tariff_flag_history" (
    "id" TEXT NOT NULL,
    "previousFlag" "TariffFlag",
    "newFlag" "TariffFlag" NOT NULL,
    "previousValues" JSONB,
    "newValues" JSONB NOT NULL,
    "source" "tariff_flag_change_source" NOT NULL,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tariff_flag_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tariff_flag_history_createdAt_idx" ON "tariff_flag_history"("createdAt");

-- AddForeignKey
ALTER TABLE "tariff_flag_history" ADD CONSTRAINT "tariff_flag_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
