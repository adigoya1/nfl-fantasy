/*
  Warnings:

  - You are about to drop the column `isCaptain` on the `RosterSlot` table. All the data in the column will be lost.
  - You are about to drop the column `isViceCaptain` on the `RosterSlot` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Chip" AS ENUM ('CAPTAIN', 'BENCH_BOOST', 'FREE_HIT');

-- AlterTable
ALTER TABLE "RosterSlot" DROP COLUMN "isCaptain",
DROP COLUMN "isViceCaptain";

-- CreateTable
CREATE TABLE "ChipUsage" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "chip" "Chip" NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "captainPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChipUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChipUsage_fantasyTeamId_chip_key" ON "ChipUsage"("fantasyTeamId", "chip");

-- AddForeignKey
ALTER TABLE "ChipUsage" ADD CONSTRAINT "ChipUsage_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
