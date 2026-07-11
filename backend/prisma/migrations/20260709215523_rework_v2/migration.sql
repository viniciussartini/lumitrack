-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('PROPERTY', 'AREA', 'DEVICE');

-- CreateEnum
CREATE TYPE "BillingClass" AS ENUM ('B1', 'B2', 'B3');

-- CreateEnum
CREATE TYPE "TariffFlag" AS ENUM ('GREEN', 'YELLOW', 'RED_P1', 'RED_P2');

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_areaId_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "consumption_records" DROP CONSTRAINT "consumption_records_areaId_fkey";

-- DropForeignKey
ALTER TABLE "consumption_records" DROP CONSTRAINT "consumption_records_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "consumption_records" DROP CONSTRAINT "consumption_records_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "energy_distributors" DROP CONSTRAINT "energy_distributors_userId_fkey";

-- DropForeignKey
ALTER TABLE "iot_device_configs" DROP CONSTRAINT "iot_device_configs_deviceId_fkey";

-- DropIndex
DROP INDEX "energy_distributors_userId_cnpj_key";

-- AlterTable
ALTER TABLE "alerts" DROP COLUMN "areaId",
DROP COLUMN "deviceId",
DROP COLUMN "message",
DROP COLUMN "propertyId",
DROP COLUMN "readAt",
DROP COLUMN "targetType",
DROP COLUMN "thresholdKwh",
DROP COLUMN "triggeredAt",
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "meterId" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "referencePowerKw" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "tolerancePercent" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "energy_distributors" DROP COLUMN "electricalSystem",
DROP COLUMN "kwhPrice",
DROP COLUMN "publicLightingFee",
DROP COLUMN "taxRate",
DROP COLUMN "userId",
DROP COLUMN "workingVoltage",
ADD COLUMN     "cofinsRate" DECIMAL(5,4) NOT NULL,
ADD COLUMN     "icmsRate" DECIMAL(5,4) NOT NULL,
ADD COLUMN     "pisRate" DECIMAL(5,4) NOT NULL,
ADD COLUMN     "state" TEXT NOT NULL,
ADD COLUMN     "tePerKwh" DECIMAL(10,6) NOT NULL,
ADD COLUMN     "tusdPerKwh" DECIMAL(10,6) NOT NULL;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "billingClass" "BillingClass" NOT NULL DEFAULT 'B1',
ADD COLUMN     "electricalSystem" "ElectricalSystemType" NOT NULL,
ADD COLUMN     "publicLightingFeeBrl" DECIMAL(10,2);

-- DropTable
DROP TABLE "consumption_records";

-- DropTable
DROP TABLE "iot_device_configs";

-- DropEnum
DROP TYPE "AlertTargetType";

-- DropEnum
DROP TYPE "ConsumptionPeriod";

-- CreateTable
CREATE TABLE "meters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "propertyId" TEXT,
    "areaId" TEXT,
    "deviceId" TEXT,
    "protocol" "iot_protocol" NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "topic" TEXT,
    "address" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "minuteStart" TIMESTAMP(3) NOT NULL,
    "kwhConsumed" DOUBLE PRECISION NOT NULL,
    "avgVoltage" DOUBLE PRECISION NOT NULL,
    "avgCurrent" DOUBLE PRECISION NOT NULL,
    "avgPowerW" DOUBLE PRECISION NOT NULL,
    "avgPowerFactor" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "secondsCovered" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_flag_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "currentFlag" "TariffFlag" NOT NULL DEFAULT 'GREEN',
    "greenPer100Kwh" DECIMAL(10,4) NOT NULL,
    "yellowPer100Kwh" DECIMAL(10,4) NOT NULL,
    "redP1Per100Kwh" DECIMAL(10,4) NOT NULL,
    "redP2Per100Kwh" DECIMAL(10,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_flag_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_trigger_events" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "minPowerW" DOUBLE PRECISION NOT NULL,
    "maxPowerW" DOUBLE PRECISION NOT NULL,
    "avgPowerW" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_trigger_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meters_propertyId_key" ON "meters"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "meters_areaId_key" ON "meters"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "meters_deviceId_key" ON "meters"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_meterId_minuteStart_key" ON "meter_readings"("meterId", "minuteStart");

-- CreateIndex
CREATE INDEX "alert_trigger_events_alertId_startedAt_idx" ON "alert_trigger_events"("alertId", "startedAt");

-- CreateIndex
CREATE INDEX "alerts_meterId_idx" ON "alerts"("meterId");

-- CreateIndex
CREATE UNIQUE INDEX "energy_distributors_cnpj_key" ON "energy_distributors"("cnpj");

-- AddForeignKey
ALTER TABLE "meters" ADD CONSTRAINT "meters_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meters" ADD CONSTRAINT "meters_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meters" ADD CONSTRAINT "meters_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_trigger_events" ADD CONSTRAINT "alert_trigger_events_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
