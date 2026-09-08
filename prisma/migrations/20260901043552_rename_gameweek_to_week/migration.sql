-- AlterTable: rename gameweek -> week, preserving data
ALTER TABLE "ChipUsage" RENAME COLUMN "gameweek" TO "week";

-- AlterTable: rename gameweek -> week, preserving data
ALTER TABLE "FreeHitSnapshot" RENAME COLUMN "gameweek" TO "week";
ALTER INDEX "FreeHitSnapshot_fantasyTeamId_gameweek_key" RENAME TO "FreeHitSnapshot_fantasyTeamId_week_key";

-- AlterTable: rename gameweek -> week, preserving data
ALTER TABLE "PriceHistory" RENAME COLUMN "gameweek" TO "week";
ALTER INDEX "PriceHistory_playerId_gameweek_key" RENAME TO "PriceHistory_playerId_week_key";

-- AlterTable: rename gameweek -> week, preserving data
ALTER TABLE "Transfer" RENAME COLUMN "gameweek" TO "week";

-- RenameTable + rename column, preserving data
ALTER TABLE "PlayerGameweekScore" RENAME TO "PlayerWeekScore";
ALTER TABLE "PlayerWeekScore" RENAME COLUMN "gameweek" TO "week";
ALTER INDEX "PlayerGameweekScore_playerId_gameweek_key" RENAME TO "PlayerWeekScore_playerId_week_key";
ALTER TABLE "PlayerWeekScore" RENAME CONSTRAINT "PlayerGameweekScore_playerId_fkey" TO "PlayerWeekScore_playerId_fkey";