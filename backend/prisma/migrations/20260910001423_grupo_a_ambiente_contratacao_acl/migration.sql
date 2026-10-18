-- CreateEnum
CREATE TYPE "contracting_environment" AS ENUM ('ACR', 'ACL');

-- CreateEnum
CREATE TYPE "acl_submarket" AS ENUM ('NORTH', 'NORTHEAST', 'SOUTHEAST_CENTER_WEST', 'SOUTH');

-- CreateEnum
CREATE TYPE "acl_energy_source" AS ENUM ('CONVENTIONAL', 'INCENTIVIZED_50', 'INCENTIVIZED_100');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "contractingEnvironment" "contracting_environment" NOT NULL DEFAULT 'ACR';

-- CreateTable
CREATE TABLE "acl_contracts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "retailerName" TEXT NOT NULL,
    "submarket" "acl_submarket" NOT NULL,
    "energySource" "acl_energy_source" NOT NULL,
    "energyPricePerMwh" DECIMAL(10,2) NOT NULL,
    "contractedVolumeMwh" DECIMAL(10,3) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acl_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acl_contracts_propertyId_idx" ON "acl_contracts"("propertyId");

-- CreateIndex
CREATE INDEX "acl_contracts_userId_idx" ON "acl_contracts"("userId");

-- AddForeignKey
ALTER TABLE "acl_contracts" ADD CONSTRAINT "acl_contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acl_contracts" ADD CONSTRAINT "acl_contracts_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
