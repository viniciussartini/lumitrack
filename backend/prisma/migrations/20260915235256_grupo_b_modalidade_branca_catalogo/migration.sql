-- CreateEnum
CREATE TYPE "group_b_modality" AS ENUM ('CONVENTIONAL', 'WHITE');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "groupBModality" "group_b_modality" DEFAULT 'CONVENTIONAL',
ADD COLUMN     "receivesBillingDiscount" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "group_b_energy_rates" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "modality" "group_b_modality" NOT NULL,
    "post" "tariff_post" NOT NULL,
    "tusdPerKwh" DECIMAL(10,6) NOT NULL,
    "tePerKwh" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_b_energy_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_b_energy_rates_distributorId_modality_post_key" ON "group_b_energy_rates"("distributorId", "modality", "post");

-- AddForeignKey
ALTER TABLE "group_b_energy_rates" ADD CONSTRAINT "group_b_energy_rates_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "energy_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
