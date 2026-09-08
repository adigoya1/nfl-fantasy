/*
  Warnings:

  - A unique constraint covering the columns `[espnEventId]` on the table `Game` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "espnEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Game_espnEventId_key" ON "Game"("espnEventId");
