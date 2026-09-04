/*
  Warnings:

  - A unique constraint covering the columns `[email,role]` on the table `people` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "people_email_key";

-- DropIndex
DROP INDEX "people_googleId_key";

-- CreateIndex
CREATE INDEX "people_email_idx" ON "people"("email");

-- CreateIndex
CREATE INDEX "people_googleId_idx" ON "people"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "people_email_role_key" ON "people"("email", "role");
