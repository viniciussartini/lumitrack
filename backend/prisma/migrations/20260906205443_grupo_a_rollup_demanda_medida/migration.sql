-- CreateTable
CREATE TABLE "meter_demand_rollups" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "post" "tariff_post" NOT NULL,
    "maxAvgPowerW" DOUBLE PRECISION NOT NULL,
    "windowEndAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meter_demand_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meter_demand_rollups_meterId_periodStart_post_key" ON "meter_demand_rollups"("meterId", "periodStart", "post");

-- AddForeignKey
ALTER TABLE "meter_demand_rollups" ADD CONSTRAINT "meter_demand_rollups_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
