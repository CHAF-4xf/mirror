-- AlterTable
ALTER TABLE "Run" ADD COLUMN "demoSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Run_demoSlug_key" ON "Run"("demoSlug");
