-- Complete the snake_case migration for databases that previously applied
-- 20260822000000_rename_snake_to_camel. Every rename is data-preserving.
DO $migration$
DECLARE
  column_mapping record;
  source_exists boolean;
  target_exists boolean;
BEGIN
  FOR column_mapping IN
    SELECT * FROM (VALUES
      ('DiscordAuth', 'avatarId', 'avatar_id'),
      ('DiscordAuth', 'connectedAt', 'connected_at'),
      ('DiscordAuth', 'discordId', 'discord_id'),
      ('DiscordAuth', 'userId', 'userid'),
      ('EXBOAuth', 'accessExpiresAt', 'access_expires_at'),
      ('EXBOAuth', 'connectedAt', 'connected_at'),
      ('EXBOAuth', 'exboId', 'exbo_id'),
      ('EXBOAuth', 'refreshExpiresAt', 'refresh_expires_at'),
      ('EXBOAuth', 'regionChangedAt', 'region_changed_at'),
      ('EXBOAuth', 'tokenBlob', 'token_blob'),
      ('EXBOAuth', 'updatedAt', 'updated_at'),
      ('EXBOAuth', 'userId', 'userid'),
      ('EXBOAuthState', 'createdAt', 'created_at'),
      ('EXBOAuthState', 'expiresAt', 'expires_at'),
      ('Notifications', 'createdAt', 'created_at'),
      ('Sessions', 'lastUsedAt', 'last_used_at'),
      ('TelegramAuth', 'avatarId', 'avatar_id'),
      ('TelegramAuth', 'connectedAt', 'connected_at'),
      ('TelegramAuth', 'telegramId', 'telegram_id'),
      ('TelegramAuth', 'userId', 'userid'),
      ('User', 'joinedAt', 'joined_at'),
      ('User', 'passwordHash', 'password_hash'),
      ('User', 'socialLinks', 'social_links'),
      ('User', 'usernameChangedAt', 'username_changed_at'),
      ('UserSettings', 'banExpiresAt', 'ban_expires_at'),
      ('UserSettings', 'banReason', 'ban_reason'),
      ('UserSettings', 'publicProfile', 'public_profile'),
      ('absences', 'createdAt', 'created_at'),
      ('absences', 'updatedAt', 'updated_at'),
      ('article_comments', 'createdAt', 'created_at'),
      ('article_comments', 'updatedAt', 'updated_at'),
      ('article_versions', 'createdAt', 'created_at'),
      ('articles', 'createdAt', 'created_at'),
      ('articles', 'externalId', 'external_id'),
      ('articles', 'imageUrl', 'image_url'),
      ('articles', 'statusReason', 'status_reason'),
      ('articles', 'updatedAt', 'updated_at'),
      ('arts', 'authorName', 'author_name'),
      ('arts', 'authorSocialLinks', 'author_social_links'),
      ('arts', 'createdAt', 'created_at'),
      ('arts', 'externalId', 'external_id'),
      ('arts', 'imageUrl', 'image_url'),
      ('arts', 'updatedAt', 'updated_at'),
      ('bot_guilds', 'allowedRoleId', 'allowed_role_id'),
      ('bot_guilds', 'clanId', 'clan_id'),
      ('bot_guilds', 'createdAt', 'created_at'),
      ('bot_guilds', 'guildId', 'guild_id'),
      ('bot_guilds', 'linkedBy', 'linked_by'),
      ('bot_guilds', 'publishChannelId', 'publish_channel_id'),
      ('bot_guilds', 'publishTime', 'publish_time'),
      ('bot_guilds', 'stagesChannelId', 'stages_channel_id'),
      ('bot_guilds', 'updatedAt', 'updated_at'),
      ('bot_link_states', 'clanId', 'clan_id'),
      ('bot_link_states', 'createdAt', 'created_at'),
      ('bot_link_states', 'expiresAt', 'expires_at'),
      ('bot_link_states', 'userId', 'user_id'),
      ('builds', 'createdAt', 'created_at'),
      ('builds', 'externalId', 'external_id'),
      ('builds', 'updatedAt', 'updated_at'),
      ('clan_boost_orders', 'createdAt', 'created_at'),
      ('clan_history', 'clanId', 'clan_id'),
      ('clan_history', 'clanName', 'clan_name'),
      ('clan_history', 'clanTag', 'clan_tag'),
      ('clan_history', 'joinedAt', 'joined_at'),
      ('clan_history', 'playerName', 'player_name'),
      ('clan_history', 'seenAt', 'seen_at'),
      ('clan_invites', 'claimedAt', 'claimed_at'),
      ('clan_invites', 'claimedBy', 'claimed_by'),
      ('clan_invites', 'clanId', 'clan_id'),
      ('clan_invites', 'createdAt', 'created_at'),
      ('clan_invites', 'createdBy', 'created_by'),
      ('clan_member_notes', 'createdAt', 'created_at'),
      ('clan_member_notes', 'updatedAt', 'updated_at'),
      ('clan_members', 'joinTime', 'join_time'),
      ('clan_members', 'syncedAt', 'synced_at'),
      ('clan_squad_requests', 'createdAt', 'created_at'),
      ('clan_squads', 'createdAt', 'created_at'),
      ('clan_squads', 'updatedAt', 'updated_at'),
      ('clans', 'blockReason', 'block_reason'),
      ('clans', 'blockedAt', 'blocked_at'),
      ('clans', 'boostMode', 'boost_mode'),
      ('clans', 'createdAt', 'created_at'),
      ('clans', 'grenadeMode', 'grenade_mode'),
      ('clans', 'isPublic', 'is_public'),
      ('clans', 'levelPoints', 'level_points'),
      ('clans', 'memberCount', 'member_count'),
      ('clans', 'publicFields', 'public_fields'),
      ('clans', 'syncedAt', 'synced_at'),
      ('gold_drops', 'createdAt', 'created_at'),
      ('grenade_boxes', 'createdAt', 'created_at'),
      ('grenade_snapshots', 'createdAt', 'created_at'),
      ('grenade_snapshots', 'eventType', 'event_type'),
      ('grenade_snapshots', 'raidDate', 'raid_date'),
      ('stage_attendance', 'createdAt', 'created_at'),
      ('stage_attendance', 'updatedAt', 'updated_at'),
      ('stage_screenshots', 'aiError', 'ai_error'),
      ('stage_screenshots', 'aiResult', 'ai_result'),
      ('stage_screenshots', 'aiStatus', 'ai_status'),
      ('stage_screenshots', 'createdAt', 'created_at'),
      ('stage_screenshots', 'filePath', 'file_path'),
      ('stage_screenshots', 'mimeType', 'mime_type'),
      ('stage_screenshots', 'sizeBytes', 'size_bytes'),
      ('stage_sessions', 'aiSummary', 'ai_summary'),
      ('stage_sessions', 'createdAt', 'created_at'),
      ('stage_sessions', 'endedAt', 'ended_at'),
      ('stage_sessions', 'externalId', 'external_id'),
      ('stage_sessions', 'mapName', 'map_name'),
      ('stage_sessions', 'stageNumber', 'stage_number'),
      ('stage_sessions', 'startedAt', 'started_at'),
      ('stage_sessions', 'updatedAt', 'updated_at'),
      ('stars', 'createdAt', 'created_at'),
      ('user_clan_profile', 'updatedAt', 'updated_at'),
      ('user_loadout', 'isPublic', 'is_public'),
      ('user_loadout', 'updatedAt', 'updated_at')
    ) AS mappings(table_name, source_column, target_column)
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = column_mapping.table_name
        AND column_name = column_mapping.source_column
    ) INTO source_exists;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = column_mapping.table_name
        AND column_name = column_mapping.target_column
    ) INTO target_exists;

    IF source_exists AND NOT target_exists THEN
      EXECUTE format(
        'ALTER TABLE %I.%I RENAME COLUMN %I TO %I',
        current_schema(), column_mapping.table_name,
        column_mapping.source_column, column_mapping.target_column
      );
    ELSIF NOT source_exists AND target_exists THEN
      RAISE NOTICE 'Skipping %.%: target column % already exists',
        column_mapping.table_name, column_mapping.source_column,
        column_mapping.target_column;
    ELSIF source_exists AND target_exists THEN
      RAISE EXCEPTION 'Cannot rename %.% to %: both columns exist',
        column_mapping.table_name, column_mapping.source_column,
        column_mapping.target_column;
    ELSE
      RAISE EXCEPTION 'Cannot rename %.% to %: neither column exists',
        column_mapping.table_name, column_mapping.source_column,
        column_mapping.target_column;
    END IF;
  END LOOP;
END
$migration$;
