-- Historical compatibility migration.
--
-- This migration was applied manually to an early development database and was
-- later removed from the repository. It renamed snake_case constraint/index
-- names back to Prisma's then-generated camelCase names. The following
-- snake_case migration renames the columns again, and the completion migration
-- intentionally leaves these object names untouched.
--
-- Keep this file permanently: applied Prisma migrations are immutable history.
DO $migration$
DECLARE
  rename_mapping record;
  source_exists boolean;
  target_exists boolean;
BEGIN
  FOR rename_mapping IN
    SELECT * FROM (VALUES
      ('DiscordAuth_userid_fkey', 'DiscordAuth_userId_fkey', 'constraint'),
      ('EXBOAuth_userid_fkey', 'EXBOAuth_userId_fkey', 'constraint'),
      ('TelegramAuth_userid_fkey', 'TelegramAuth_userId_fkey', 'constraint'),
      ('DiscordAuth_discord_id_key', 'DiscordAuth_discordId_key', 'index'),
      ('DiscordAuth_userid_key', 'DiscordAuth_userId_key', 'index'),
      ('EXBOAuth_exbo_id_key', 'EXBOAuth_exboId_key', 'index'),
      ('EXBOAuth_userid_key', 'EXBOAuth_userId_key', 'index'),
      ('TelegramAuth_telegram_id_key', 'TelegramAuth_telegramId_key', 'index'),
      ('TelegramAuth_userid_key', 'TelegramAuth_userId_key', 'index'),
      ('articles_external_id_key', 'articles_externalId_key', 'index'),
      ('arts_external_id_key', 'arts_externalId_key', 'index'),
      ('bot_guilds_guild_id_key', 'bot_guilds_guildId_key', 'index'),
      ('builds_external_id_key', 'builds_externalId_key', 'index'),
      ('clan_history_player_name_seen_at_idx', 'clan_history_playerName_seenAt_idx', 'index'),
      ('clan_history_user_id_seen_at_idx', 'clan_history_userId_seenAt_idx', 'index'),
      ('grenade_snapshots_clan_id_raid_date_idx', 'grenade_snapshots_clanId_raidDate_idx', 'index'),
      ('stage_sessions_external_id_key', 'stage_sessions_externalId_key', 'index')
    ) AS mappings(source_name, target_name, object_type)
  LOOP
    IF rename_mapping.object_type = 'constraint' THEN
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace
          AND conname = rename_mapping.source_name
      ), EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace
          AND conname = rename_mapping.target_name
      ) INTO source_exists, target_exists;

      IF source_exists AND NOT target_exists THEN
        EXECUTE format(
          'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
          split_part(rename_mapping.source_name, '_', 1),
          rename_mapping.source_name,
          rename_mapping.target_name
        );
      END IF;
    ELSE
      SELECT to_regclass(format('%I.%I', current_schema(), rename_mapping.source_name)) IS NOT NULL,
             to_regclass(format('%I.%I', current_schema(), rename_mapping.target_name)) IS NOT NULL
      INTO source_exists, target_exists;

      IF source_exists AND NOT target_exists THEN
        EXECUTE format(
          'ALTER INDEX %I.%I RENAME TO %I',
          current_schema(),
          rename_mapping.source_name,
          rename_mapping.target_name
        );
      END IF;
    END IF;
  END LOOP;
END
$migration$;

-- This intermediate migration rebuilt the member-note unique index; the
-- following memberId -> member_id column rename preserves it.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'clan_member_notes'
      AND column_name = 'memberId'
  ) THEN
    DROP INDEX IF EXISTS "clan_member_notes_memberId_key";
    CREATE UNIQUE INDEX "clan_member_notes_memberId_key"
      ON "clan_member_notes"("memberId");
  END IF;
END
$migration$;
