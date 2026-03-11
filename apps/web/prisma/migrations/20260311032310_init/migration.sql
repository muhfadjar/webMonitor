-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'PAUSED');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('PENDING', 'UP', 'DOWN', 'REDIRECT', 'ERROR');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('SSL_EXPIRY', 'SITE_DOWN', 'PAGE_DOWN', 'STATUS_CHANGE', 'CONTENT_CHANGE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "displayName" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'PENDING',
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdBy" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_checks" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "redirectUrl" TEXT,
    "serverHeader" TEXT,
    "contentType" TEXT,
    "xPoweredBy" TEXT,
    "isReachable" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "rawHeaders" JSONB,

    CONSTRAINT "site_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssl_certificates" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValid" BOOLEAN NOT NULL,
    "issuer" TEXT,
    "subject" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "daysUntilExpiry" INTEGER,
    "serialNumber" TEXT,
    "fingerprintSha256" TEXT,
    "protocol" TEXT,
    "cipherSuite" TEXT,
    "subjectAltNames" TEXT[],
    "errorMessage" TEXT,

    CONSTRAINT "ssl_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "robots_entries" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAccessible" BOOLEAN NOT NULL,
    "rawContent" TEXT,
    "sitemapUrls" TEXT[],
    "disallowRules" JSONB,
    "allowRules" JSONB,
    "crawlDelay" INTEGER,
    "httpStatus" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "robots_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "path" TEXT,
    "sourceSitemap" TEXT,
    "sitemapChain" TEXT[],
    "priority" DECIMAL(3,1),
    "changeFreq" TEXT,
    "lastModified" TIMESTAMP(3),
    "status" "PageStatus" NOT NULL DEFAULT 'PENDING',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_checks" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "isReachable" BOOLEAN NOT NULL,
    "redirectUrl" TEXT,
    "contentHash" TEXT,
    "contentLength" INTEGER,
    "title" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "page_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "siteId" TEXT,
    "pageId" TEXT,
    "type" "AlertType" NOT NULL,
    "thresholdDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notificationEmail" TEXT,
    "webhookUrl" TEXT,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sites_domain_key" ON "sites"("domain");

-- CreateIndex
CREATE INDEX "idx_sites_status" ON "sites"("status");

-- CreateIndex
CREATE INDEX "idx_sites_domain" ON "sites"("domain");

-- CreateIndex
CREATE INDEX "idx_site_checks_site_id_checked_at" ON "site_checks"("siteId", "checkedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_ssl_site_id_checked_at" ON "ssl_certificates"("siteId", "checkedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_ssl_expiry" ON "ssl_certificates"("validTo");

-- CreateIndex
CREATE INDEX "idx_robots_site_id" ON "robots_entries"("siteId");

-- CreateIndex
CREATE INDEX "idx_pages_site_id_status" ON "pages"("siteId", "status");

-- CreateIndex
CREATE INDEX "idx_pages_last_checked_at" ON "pages"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pages_siteId_urlHash_key" ON "pages"("siteId", "urlHash");

-- CreateIndex
CREATE INDEX "idx_page_checks_page_id_checked_at" ON "page_checks"("pageId", "checkedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_page_checks_site_id_checked_at" ON "page_checks"("siteId", "checkedAt" DESC);

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_checks" ADD CONSTRAINT "site_checks_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "robots_entries" ADD CONSTRAINT "robots_entries_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_checks" ADD CONSTRAINT "page_checks_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
