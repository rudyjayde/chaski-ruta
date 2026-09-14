-- CreateTable
CREATE TABLE "landing_content" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "landing_content_key_key" ON "landing_content"("key");

-- AddForeignKey
ALTER TABLE "landing_content" ADD CONSTRAINT "landing_content_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
