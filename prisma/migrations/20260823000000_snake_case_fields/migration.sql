-- Rename existing columns to the snake_case names used by Prisma.
-- PostgreSQL column renames preserve data, indexes, and constraints.
--
-- Some deployed databases already have individual snake_case columns because of
-- historical/manual schema drift. For every mapping below:
--   * rename the legacy column when only it exists;
--   * do nothing when the target column already exists;
--   * fail with a useful error when neither or both columns exist.
DO $migration$
DECLARE
  column_mapping record;
  existing_source_column text;
  source_count integer;
  target_exists boolean;
BEGIN
  FOR column_mapping IN
    SELECT *
    FROM (VALUES
      ('UserSettings', 'userId', 'user_id'),
      ('UserCustomization', 'userId', 'user_id'),
      ('UserCustomization', 'bannerMode', 'banner_mode'),
      ('UserCustomization', 'bannerType', 'banner_type'),
      ('UserCustomization', 'bannerColor', 'banner_color'),
      ('UserCustomization', 'bannerImage', 'banner_image'),
      ('UserCustomization', 'cardBackground', 'card_background'),
      ('UserCustomization', 'cardColor', 'card_color'),
      ('UserCustomization', 'avatarImage', 'avatar_image'),
      ('UserCustomization', 'createdAt', 'created_at'),
      ('UserCustomization', 'updatedAt', 'updated_at'),
      ('Sessions', 'sessionId', 'session_id'),
      -- Fresh migration history has "User_Agent"; a deployed schema variant
      -- has "userAgent". Accept either legacy spelling.
      ('Sessions', 'User_Agent', 'user_agent'),
      ('Sessions', 'userId', 'user_id'),
      ('builds', 'authorId', 'author_id'),
      ('articles', 'authorId', 'author_id'),
      ('arts', 'authorId', 'author_id'),
      ('article_versions', 'articleId', 'article_id'),
      ('article_comments', 'authorId', 'author_id'),
      ('article_comments', 'articleId', 'article_id'),
      ('article_comments', 'artId', 'art_id'),
      ('article_comments', 'parentId', 'parent_id'),
      ('stars', 'targetType', 'target_type'),
      ('stars', 'targetId', 'target_id'),
      ('stars', 'userId', 'user_id'),
      ('PlayerNote', 'createdAt', 'created_at'),
      ('PlayerNote', 'updatedAt', 'updated_at'),
      ('PopularPlayer', 'updatedAt', 'updated_at'),
      ('PlayerBlacklist', 'createdAt', 'created_at'),
      ('clan_members', 'clanId', 'clan_id'),
      ('clan_members', 'userId', 'user_id'),
      ('clan_history', 'userId', 'user_id'),
      ('user_clan_profile', 'userId', 'user_id'),
      ('user_clan_profile', 'clanId', 'clan_id'),
      ('user_clan_profile', 'isActive', 'is_active'),
      ('stage_sessions', 'creatorId', 'creator_id'),
      ('stage_sessions', 'clanId', 'clan_id'),
      ('stage_screenshots', 'sessionId', 'session_id'),
      ('stage_attendance', 'sessionId', 'session_id'),
      ('stage_attendance', 'userId', 'user_id'),
      ('clan_squads', 'clanId', 'clan_id'),
      ('clan_squads', 'createdBy', 'created_by'),
      ('clan_squads', 'leaderId', 'leader_id'),
      ('clan_squad_members', 'squadId', 'squad_id'),
      ('clan_squad_members', 'memberId', 'member_id'),
      ('clan_squad_requests', 'squadId', 'squad_id'),
      ('clan_squad_requests', 'memberId', 'member_id'),
      ('gold_drops', 'clanId', 'clan_id'),
      ('gold_drop_attendees', 'dropId', 'drop_id'),
      ('gold_drop_attendees', 'memberId', 'member_id'),
      ('absences', 'clanId', 'clan_id'),
      ('absences', 'userId', 'user_id'),
      ('clan_invites', 'userId', 'user_id'),
      ('grenade_snapshots', 'clanId', 'clan_id'),
      ('clan_member_notes', 'clanId', 'clan_id'),
      ('clan_member_notes', 'memberId', 'member_id'),
      ('clan_member_notes', 'authorId', 'author_id'),
      ('grenade_boxes', 'clanId', 'clan_id'),
      ('clan_boost_orders', 'clanId', 'clan_id'),
      ('clan_boost_orders', 'playerId', 'player_id'),
      ('clan_boost_orders', 'itemId', 'item_id'),
      ('clan_boost_orders', 'itemName', 'item_name'),
      ('user_loadout', 'userId', 'user_id')
    ) AS mappings(table_name, source_column, target_column)
  LOOP
    SELECT count(*), min(column_name)
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = column_mapping.table_name
      AND column_name IN (
        column_mapping.source_column,
        CASE
          WHEN column_mapping.table_name = 'Sessions'
            AND column_mapping.source_column = 'User_Agent'
          THEN 'userAgent'
          ELSE column_mapping.source_column
        END
      )
    INTO source_count, existing_source_column;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = column_mapping.table_name
        AND column_name = column_mapping.target_column
    ) INTO target_exists;

    IF source_count = 1 AND NOT target_exists THEN
      EXECUTE format(
        'ALTER TABLE %I.%I RENAME COLUMN %I TO %I',
        current_schema(),
        column_mapping.table_name,
        existing_source_column,
        column_mapping.target_column
      );
    ELSIF source_count = 0 AND target_exists THEN
      RAISE NOTICE 'Skipping %.%: target column % already exists',
        column_mapping.table_name,
        column_mapping.source_column,
        column_mapping.target_column;
    ELSIF source_count > 0 AND target_exists THEN
      RAISE EXCEPTION 'Cannot rename %.% to %: legacy and target columns coexist',
        column_mapping.table_name,
        column_mapping.source_column,
        column_mapping.target_column;
    ELSIF source_count > 1 THEN
      RAISE EXCEPTION 'Cannot rename %.% to %: multiple legacy columns coexist',
        column_mapping.table_name,
        column_mapping.source_column,
        column_mapping.target_column;
    ELSE
      RAISE EXCEPTION 'Cannot rename %.% to %: neither column exists',
        column_mapping.table_name,
        column_mapping.source_column,
        column_mapping.target_column;
    END IF;
  END LOOP;
END
$migration$;
