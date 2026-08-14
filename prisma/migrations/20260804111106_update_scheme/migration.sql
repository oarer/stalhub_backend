-- DropIndex
DROP INDEX "stage_sessions_clanId_type_stage_number_started_at_idx";

-- AlterTable
CREATE SEQUENCE clan_history_id_seq;
ALTER TABLE "clan_history" ALTER COLUMN "id" SET DEFAULT nextval('clan_history_id_seq');
ALTER SEQUENCE clan_history_id_seq OWNED BY "clan_history"."id";
