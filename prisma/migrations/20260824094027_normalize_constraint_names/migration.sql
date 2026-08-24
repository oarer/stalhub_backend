-- DropIndex
DROP INDEX "clan_member_notes_memberId_idx";

-- RenameForeignKey
ALTER TABLE "DiscordAuth" RENAME CONSTRAINT "DiscordAuth_userId_fkey" TO "DiscordAuth_userid_fkey";

-- RenameForeignKey
ALTER TABLE "EXBOAuth" RENAME CONSTRAINT "EXBOAuth_userId_fkey" TO "EXBOAuth_userid_fkey";

-- RenameForeignKey
ALTER TABLE "Sessions" RENAME CONSTRAINT "Sessions_userId_fkey" TO "Sessions_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "TelegramAuth" RENAME CONSTRAINT "TelegramAuth_userId_fkey" TO "TelegramAuth_userid_fkey";

-- RenameForeignKey
ALTER TABLE "UserCustomization" RENAME CONSTRAINT "UserCustomization_userId_fkey" TO "UserCustomization_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "UserSettings" RENAME CONSTRAINT "UserSettings_userId_fkey" TO "UserSettings_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "absences" RENAME CONSTRAINT "absences_userId_fkey" TO "absences_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "article_comments" RENAME CONSTRAINT "article_comments_artId_fkey" TO "article_comments_art_id_fkey";

-- RenameForeignKey
ALTER TABLE "article_comments" RENAME CONSTRAINT "article_comments_articleId_fkey" TO "article_comments_article_id_fkey";

-- RenameForeignKey
ALTER TABLE "article_comments" RENAME CONSTRAINT "article_comments_authorId_fkey" TO "article_comments_author_id_fkey";

-- RenameForeignKey
ALTER TABLE "article_comments" RENAME CONSTRAINT "article_comments_parentId_fkey" TO "article_comments_parent_id_fkey";

-- RenameForeignKey
ALTER TABLE "article_versions" RENAME CONSTRAINT "article_versions_articleId_fkey" TO "article_versions_article_id_fkey";

-- RenameForeignKey
ALTER TABLE "articles" RENAME CONSTRAINT "articles_authorId_fkey" TO "articles_author_id_fkey";

-- RenameForeignKey
ALTER TABLE "arts" RENAME CONSTRAINT "arts_authorId_fkey" TO "arts_author_id_fkey";

-- RenameForeignKey
ALTER TABLE "builds" RENAME CONSTRAINT "builds_authorId_fkey" TO "builds_author_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_boost_orders" RENAME CONSTRAINT "clan_boost_orders_clanId_fkey" TO "clan_boost_orders_clan_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_boost_orders" RENAME CONSTRAINT "clan_boost_orders_playerId_fkey" TO "clan_boost_orders_player_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_history" RENAME CONSTRAINT "clan_history_userId_fkey" TO "clan_history_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_invites" RENAME CONSTRAINT "clan_invites_userId_fkey" TO "clan_invites_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_member_notes" RENAME CONSTRAINT "clan_member_notes_authorId_fkey" TO "clan_member_notes_author_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_member_notes" RENAME CONSTRAINT "clan_member_notes_memberId_fkey" TO "clan_member_notes_member_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_members" RENAME CONSTRAINT "clan_members_clanId_fkey" TO "clan_members_clan_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_members" RENAME CONSTRAINT "clan_members_userId_fkey" TO "clan_members_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_squad_members" RENAME CONSTRAINT "clan_squad_members_memberId_fkey" TO "clan_squad_members_member_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_squad_members" RENAME CONSTRAINT "clan_squad_members_squadId_fkey" TO "clan_squad_members_squad_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_squad_requests" RENAME CONSTRAINT "clan_squad_requests_memberId_fkey" TO "clan_squad_requests_member_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_squad_requests" RENAME CONSTRAINT "clan_squad_requests_squadId_fkey" TO "clan_squad_requests_squad_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_squads" RENAME CONSTRAINT "clan_squads_clanId_fkey" TO "clan_squads_clan_id_fkey";

-- RenameForeignKey
ALTER TABLE "clan_squads" RENAME CONSTRAINT "clan_squads_leaderId_fkey" TO "clan_squads_leader_id_fkey";

-- RenameForeignKey
ALTER TABLE "gold_drop_attendees" RENAME CONSTRAINT "gold_drop_attendees_dropId_fkey" TO "gold_drop_attendees_drop_id_fkey";

-- RenameForeignKey
ALTER TABLE "gold_drop_attendees" RENAME CONSTRAINT "gold_drop_attendees_memberId_fkey" TO "gold_drop_attendees_member_id_fkey";

-- RenameForeignKey
ALTER TABLE "stage_attendance" RENAME CONSTRAINT "stage_attendance_sessionId_fkey" TO "stage_attendance_session_id_fkey";

-- RenameForeignKey
ALTER TABLE "stage_attendance" RENAME CONSTRAINT "stage_attendance_userId_fkey" TO "stage_attendance_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "stage_screenshots" RENAME CONSTRAINT "stage_screenshots_sessionId_fkey" TO "stage_screenshots_session_id_fkey";

-- RenameForeignKey
ALTER TABLE "stage_sessions" RENAME CONSTRAINT "stage_sessions_clanId_fkey" TO "stage_sessions_clan_id_fkey";

-- RenameForeignKey
ALTER TABLE "stage_sessions" RENAME CONSTRAINT "stage_sessions_creatorId_fkey" TO "stage_sessions_creator_id_fkey";

-- RenameForeignKey
ALTER TABLE "stars" RENAME CONSTRAINT "stars_userId_fkey" TO "stars_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "user_clan_profile" RENAME CONSTRAINT "user_clan_profile_clanId_fkey" TO "user_clan_profile_clan_id_fkey";

-- RenameForeignKey
ALTER TABLE "user_clan_profile" RENAME CONSTRAINT "user_clan_profile_userId_fkey" TO "user_clan_profile_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "user_loadout" RENAME CONSTRAINT "user_loadout_userId_fkey" TO "user_loadout_user_id_fkey";

-- RenameIndex
ALTER INDEX "DiscordAuth_discordId_key" RENAME TO "DiscordAuth_discord_id_key";

-- RenameIndex
ALTER INDEX "DiscordAuth_userId_key" RENAME TO "DiscordAuth_userid_key";

-- RenameIndex
ALTER INDEX "EXBOAuth_exboId_key" RENAME TO "EXBOAuth_exbo_id_key";

-- RenameIndex
ALTER INDEX "EXBOAuth_userId_key" RENAME TO "EXBOAuth_userid_key";

-- RenameIndex
ALTER INDEX "Sessions_sessionId_key" RENAME TO "Sessions_session_id_key";

-- RenameIndex
ALTER INDEX "TelegramAuth_telegramId_key" RENAME TO "TelegramAuth_telegram_id_key";

-- RenameIndex
ALTER INDEX "TelegramAuth_userId_key" RENAME TO "TelegramAuth_userid_key";

-- RenameIndex
ALTER INDEX "UserCustomization_userId_key" RENAME TO "UserCustomization_user_id_key";

-- RenameIndex
ALTER INDEX "UserSettings_userId_key" RENAME TO "UserSettings_user_id_key";

-- RenameIndex
ALTER INDEX "absences_clanId_date_idx" RENAME TO "absences_clan_id_date_idx";

-- RenameIndex
ALTER INDEX "absences_userId_date_key" RENAME TO "absences_user_id_date_key";

-- RenameIndex
ALTER INDEX "articles_externalId_key" RENAME TO "articles_external_id_key";

-- RenameIndex
ALTER INDEX "arts_externalId_key" RENAME TO "arts_external_id_key";

-- RenameIndex
ALTER INDEX "bot_guilds_guildId_key" RENAME TO "bot_guilds_guild_id_key";

-- RenameIndex
ALTER INDEX "builds_externalId_key" RENAME TO "builds_external_id_key";

-- RenameIndex
ALTER INDEX "clan_boost_orders_clanId_date_idx" RENAME TO "clan_boost_orders_clan_id_date_idx";

-- RenameIndex
ALTER INDEX "clan_history_playerName_seenAt_idx" RENAME TO "clan_history_player_name_seen_at_idx";

-- RenameIndex
ALTER INDEX "clan_history_userId_seen_at_idx" RENAME TO "clan_history_user_id_seen_at_idx";

-- RenameIndex
ALTER INDEX "clan_invites_userId_key" RENAME TO "clan_invites_user_id_key";

-- RenameIndex
ALTER INDEX "clan_member_notes_clanId_idx" RENAME TO "clan_member_notes_clan_id_idx";

-- RenameIndex
ALTER INDEX "clan_member_notes_memberId_key" RENAME TO "clan_member_notes_member_id_key";

-- RenameIndex
ALTER INDEX "clan_members_clanId_name_key" RENAME TO "clan_members_clan_id_name_key";

-- RenameIndex
ALTER INDEX "clan_members_userId_key" RENAME TO "clan_members_user_id_key";

-- RenameIndex
ALTER INDEX "clan_squad_members_squadId_memberId_key" RENAME TO "clan_squad_members_squad_id_member_id_key";

-- RenameIndex
ALTER INDEX "clan_squad_members_squadId_slot_key" RENAME TO "clan_squad_members_squad_id_slot_key";

-- RenameIndex
ALTER INDEX "clan_squad_requests_squadId_memberId_key" RENAME TO "clan_squad_requests_squad_id_member_id_key";

-- RenameIndex
ALTER INDEX "clan_squads_clanId_map_name_key" RENAME TO "clan_squads_clan_id_map_name_key";

-- RenameIndex
ALTER INDEX "clan_squads_leaderId_key" RENAME TO "clan_squads_leader_id_key";

-- RenameIndex
ALTER INDEX "gold_drop_attendees_dropId_memberId_key" RENAME TO "gold_drop_attendees_drop_id_member_id_key";

-- RenameIndex
ALTER INDEX "gold_drops_clanId_date_idx" RENAME TO "gold_drops_clan_id_date_idx";

-- RenameIndex
ALTER INDEX "grenade_boxes_clanId_date_idx" RENAME TO "grenade_boxes_clan_id_date_idx";

-- RenameIndex
ALTER INDEX "grenade_snapshots_clanId_raid_date_idx" RENAME TO "grenade_snapshots_clan_id_raid_date_idx";

-- RenameIndex
ALTER INDEX "stage_attendance_sessionId_name_key" RENAME TO "stage_attendance_session_id_name_key";

-- RenameIndex
ALTER INDEX "stage_sessions_externalId_key" RENAME TO "stage_sessions_external_id_key";

-- RenameIndex
ALTER INDEX "stars_targetType_targetId_userId_key" RENAME TO "stars_target_type_target_id_user_id_key";
