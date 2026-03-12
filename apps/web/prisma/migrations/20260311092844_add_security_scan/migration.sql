-- AlterTable
ALTER TABLE "page_checks" ADD COLUMN     "externalScripts" TEXT[],
ADD COLUMN     "securityIssues" JSONB;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "hasSecurityIssues" BOOLEAN NOT NULL DEFAULT false;
