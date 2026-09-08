-- CreateTable
CREATE TABLE "FreeHitSnapshot" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "budgetRemaining" DOUBLE PRECISION NOT NULL,
    "freeTransfers" INTEGER NOT NULL,
    "roster" JSONB NOT NULL,
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeHitSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeHitSnapshot_fantasyTeamId_gameweek_key" ON "FreeHitSnapshot"("fantasyTeamId", "gameweek");

-- AddForeignKey
ALTER TABLE "FreeHitSnapshot" ADD CONSTRAINT "FreeHitSnapshot_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
