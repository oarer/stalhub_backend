-- AlterTable: Add rank to role
ALTER TABLE "role" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: Prisma implicit many-to-many junction table
CREATE TABLE "_RoleToPermission" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_RoleToPermission_AB_pkey" PRIMARY KEY ("A", "B")
);

-- CreateIndex
CREATE INDEX "_RoleToPermission_B_index" ON "_RoleToPermission"("B");

-- Copy data from old role_permission table
INSERT INTO "_RoleToPermission" ("A", "B")
SELECT "roleId", "permissionId" FROM "role_permission";

-- DropTable
DROP TABLE "role_permission";

-- AddForeignKey
ALTER TABLE "_RoleToPermission" ADD CONSTRAINT "_RoleToPermission_A_fkey" FOREIGN KEY ("A") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToPermission" ADD CONSTRAINT "_RoleToPermission_B_fkey" FOREIGN KEY ("B") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
