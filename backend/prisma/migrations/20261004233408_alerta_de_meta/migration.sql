-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "alertNotifiedMonth" INTEGER,
ADD COLUMN     "alertNotifiedYear" BOOLEAN NOT NULL DEFAULT false;
