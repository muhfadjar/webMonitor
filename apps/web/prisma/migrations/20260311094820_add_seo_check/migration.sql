-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "lastSeoCheckedAt" TIMESTAMP(3),
ADD COLUMN     "seoScore" INTEGER;

-- CreateTable
CREATE TABLE "seo_checks" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "h1Count" INTEGER,
    "canonicalUrl" TEXT,
    "hasViewport" BOOLEAN,
    "hasOgTags" BOOLEAN,
    "hasSchema" BOOLEAN,
    "imagesMissingAlt" INTEGER,
    "isIndexable" BOOLEAN,

    CONSTRAINT "seo_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_seo_checks_page_id_checked_at" ON "seo_checks"("pageId", "checkedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_seo_checks_site_id" ON "seo_checks"("siteId");

-- AddForeignKey
ALTER TABLE "seo_checks" ADD CONSTRAINT "seo_checks_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
