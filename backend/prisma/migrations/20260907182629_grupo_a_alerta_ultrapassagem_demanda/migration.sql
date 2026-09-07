-- CreateTable
CREATE TABLE "demand_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thresholdPercent" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedPeriodStart" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demand_alerts_meterId_idx" ON "demand_alerts"("meterId");

-- CreateIndex
CREATE INDEX "demand_alerts_userId_idx" ON "demand_alerts"("userId");

-- AddForeignKey
ALTER TABLE "demand_alerts" ADD CONSTRAINT "demand_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_alerts" ADD CONSTRAINT "demand_alerts_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
