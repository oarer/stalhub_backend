-- DeleteDuplicateNotes: keep only the most recent note per memberId
DELETE FROM "clan_member_notes"
WHERE id NOT IN (
  SELECT MAX(id)
  FROM "clan_member_notes"
  GROUP BY "memberId"
);

-- CreateIndex: add unique constraint on memberId
CREATE UNIQUE INDEX "clan_member_notes_memberId_key" ON "clan_member_notes"("memberId");
