-- CreateTable
CREATE TABLE "pld_quotes" (
    "id" TEXT NOT NULL,
    "submarket" "acl_submarket" NOT NULL,
    "referencePeriod" TIMESTAMP(3) NOT NULL,
    "valuePerMwh" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pld_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pld_quotes_submarket_referencePeriod_key" ON "pld_quotes"("submarket", "referencePeriod");
