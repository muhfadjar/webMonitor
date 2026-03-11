-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "serverId" TEXT;

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "servers_ipAddress_key" ON "servers"("ipAddress");

-- CreateIndex
CREATE INDEX "idx_servers_ip" ON "servers"("ipAddress");

-- CreateIndex
CREATE INDEX "idx_sites_server_id" ON "sites"("serverId");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
