# Database Schema

All tables use PostgreSQL 16. Managed via Prisma ORM with migration files.

## Entity Relationship Diagram

```
servers
  └──< sites (server_id)

users
  └──< sites (created_by)
         ├──< site_checks
         ├──< ssl_certificates
         ├──< robots_entries
         └──< pages
                ├──< page_checks
                ├──< seo_checks
                └──< alerts (page_id)
```

---

## Tables

### `servers`
Tracks server IP addresses that host monitored sites. Sites optionally link to a server.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ip_address | varchar UNIQUE | Server IP address |
| name | varchar | optional friendly name |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:**
- `idx_servers_ip` on `ip_address`

---

### `users`
Admin accounts (managed by NextAuth).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | varchar(255) UNIQUE | |
| password_hash | varchar(255) | bcrypt |
| name | varchar(100) | |
| role | enum('ADMIN','VIEWER') | default 'ADMIN' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `sites`
The root monitored domain.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| domain | varchar(255) UNIQUE | normalized, no trailing slash |
| display_name | varchar(255) | optional friendly name |
| status | enum | 'PENDING','ACTIVE','ERROR','PAUSED' |
| check_interval_minutes | int | site-level checks (HTTP/SSL/robots), **default 10** |
| page_check_interval_minutes | int | per-page checks, **default 1440** (24h) |
| server_id | uuid FK → servers | nullable |
| tags | text[] | user-defined labels, e.g. `["production","ecommerce"]` |
| google_tags | jsonb | detected Google tracking tags (see GoogleTagsResult) |
| created_by | uuid FK → users | |
| last_checked_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:**
- `idx_sites_status` on `status`
- `idx_sites_domain` on `domain`
- `idx_sites_server_id` on `server_id`

**`google_tags` JSON structure:**
```json
{
  "gtmIds": ["GTM-XXXXXX"],
  "ga4Ids": ["G-XXXXXXXXXX"],
  "uaIds": ["UA-XXXXXXXX-X"],
  "adsIds": ["AW-XXXXXXXXXX"],
  "optimizeIds": ["OPT-XXXXXXX"],
  "searchConsoleVerification": "verification-token or null"
}
```

---

### `site_checks`
Each full-site health check snapshot.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| site_id | uuid FK → sites | |
| checked_at | timestamptz | |
| http_status | int | e.g. 200, 301, 500 |
| response_time_ms | int | time to first byte |
| redirect_url | text | nullable, final URL after redirects |
| server_header | varchar(255) | e.g. "nginx/1.24" |
| content_type | varchar(255) | |
| x_powered_by | varchar(255) | nullable |
| is_reachable | boolean | |
| error_message | text | nullable |
| raw_headers | jsonb | full response headers |

**Indexes:**
- `idx_site_checks_site_id_checked_at` on `(site_id, checked_at DESC)`

> Partition by range on `checked_at` for large-scale deployments (optional).

---

### `ssl_certificates`
SSL certificate details per check cycle.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| site_id | uuid FK → sites | |
| checked_at | timestamptz | |
| is_valid | boolean | |
| issuer | varchar(255) | |
| subject | varchar(255) | |
| valid_from | timestamptz | |
| valid_to | timestamptz | |
| days_until_expiry | int | computed |
| serial_number | varchar(100) | |
| fingerprint_sha256 | varchar(64) | |
| protocol | varchar(20) | e.g. "TLSv1.3" |
| cipher_suite | varchar(100) | |
| subject_alt_names | text[] | SANs |
| error_message | text | nullable |

**Indexes:**
- `idx_ssl_site_id_checked_at` on `(site_id, checked_at DESC)`
- `idx_ssl_expiry` on `valid_to` (for expiry alerting queries)

---

### `robots_entries`
Parsed robots.txt content per site.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| site_id | uuid FK → sites | |
| fetched_at | timestamptz | |
| is_accessible | boolean | HTTP 200 received |
| raw_content | text | full raw robots.txt |
| sitemap_urls | text[] | sitemap entries found in robots.txt |
| disallow_rules | jsonb | `{ "user-agent": ["disallow_path", ...] }` |
| allow_rules | jsonb | same structure |
| crawl_delay | int | nullable, seconds |
| http_status | int | |
| error_message | text | nullable |

**Indexes:**
- `idx_robots_site_id` on `site_id`

---

### `pages`
All URLs discovered from sitemaps.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| site_id | uuid FK → sites | |
| url | text | full URL |
| url_hash | char(64) | SHA-256 of normalized URL, for dedup |
| path | text | path portion only |
| source_sitemap | text | direct parent sitemap URL this URL was found in |
| sitemap_chain | text[] | full crawl path, e.g. `[sitemap_index.xml, en/sitemap.xml]` |
| priority | numeric(3,1) | from sitemap `<priority>` |
| change_freq | varchar(20) | from sitemap `<changefreq>` |
| last_modified | timestamptz | from sitemap `<lastmod>`, nullable |
| status | enum | 'PENDING','UP','DOWN','REDIRECT','ERROR' |
| has_security_issues | boolean | true if latest check found security issues, default false |
| seo_score | int | 0–100 score from latest SEO check, nullable |
| last_seo_checked_at | timestamptz | nullable |
| last_checked_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:**
- `UNIQUE (site_id, url_hash)` — deduplication
- `idx_pages_site_id_status` on `(site_id, status)`
- `idx_pages_last_checked_at` on `last_checked_at` (for scheduler)

---

### `page_checks`
Individual page check results (the hot table — high write volume).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| page_id | uuid FK → pages | |
| site_id | uuid FK → sites | denormalized for query efficiency |
| checked_at | timestamptz | |
| http_status | int | |
| response_time_ms | int | |
| is_reachable | boolean | |
| redirect_url | text | nullable |
| content_hash | char(64) | SHA-256 of response body, detect changes |
| content_length | int | bytes |
| title | text | `<title>` tag if HTML |
| error_message | text | nullable |
| security_issues | jsonb | detected security findings, nullable |
| external_scripts | text[] | external script URLs found on the page |

**Indexes:**
- `idx_page_checks_page_id_checked_at` on `(page_id, checked_at DESC)`
- `idx_page_checks_site_id_checked_at` on `(site_id, checked_at DESC)`

> Recommend partitioning by month on `checked_at` once data grows.

---

### `seo_checks`
SEO audit results per page. Written by the `seo-check` worker.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| page_id | uuid FK → pages | |
| site_id | uuid FK → sites | denormalized for site-wide queries |
| checked_at | timestamptz | |
| score | int | 0–100 weighted SEO score |
| issues | jsonb | array of `{ check, severity, message, recommendation }` |
| title | text | extracted `<title>` value |
| description | text | extracted `<meta name="description">` value |
| h1_count | int | number of `<h1>` tags found |
| canonical_url | text | value of `<link rel="canonical">` if present |
| has_viewport | boolean | true if viewport meta tag is present |
| has_og_tags | boolean | true if Open Graph tags are present |
| has_schema | boolean | true if JSON-LD / Schema.org markup is present |
| images_missing_alt | int | count of `<img>` tags without alt attribute |
| is_indexable | boolean | false if `noindex` directive found |

**Issue severity levels:** `error`, `warning`, `info`

**Indexes:**
- `idx_seo_checks_page_id_checked_at` on `(page_id, checked_at DESC)`
- `idx_seo_checks_site_id` on `site_id`

---

### `alerts`
Alert configurations and triggered events.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| site_id | uuid FK → sites | nullable |
| page_id | uuid FK → pages | nullable |
| type | enum | 'SSL_EXPIRY','SITE_DOWN','PAGE_DOWN','STATUS_CHANGE','CONTENT_CHANGE' |
| threshold_days | int | for ssl_expiry alerts |
| is_active | boolean | default true |
| notification_email | varchar(255) | nullable |
| webhook_url | text | nullable |
| last_triggered_at | timestamptz | nullable |
| created_at | timestamptz | |

---

## Prisma Schema (apps/web/prisma/schema.prisma)

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-arm64-openssl-1.1.x", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  VIEWER
}

enum SiteStatus {
  PENDING
  ACTIVE
  ERROR
  PAUSED
}

enum PageStatus {
  PENDING
  UP
  DOWN
  REDIRECT
  ERROR
}

enum AlertType {
  SSL_EXPIRY
  SITE_DOWN
  PAGE_DOWN
  STATUS_CHANGE
  CONTENT_CHANGE
}

model Server {
  id        String   @id @default(uuid())
  ipAddress String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  sites     Site[]

  @@index([ipAddress], name: "idx_servers_ip")
  @@map("servers")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String?
  role         Role     @default(ADMIN)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  sites        Site[]

  @@map("users")
}

model Site {
  id                       String     @id @default(uuid())
  domain                   String     @unique
  displayName              String?
  status                   SiteStatus @default(PENDING)
  checkIntervalMinutes     Int        @default(10)
  pageCheckIntervalMinutes Int        @default(1440)
  serverId                 String?
  tags                     String[]
  googleTags               Json?
  createdBy                String
  lastCheckedAt            DateTime?
  createdAt                DateTime   @default(now())
  updatedAt                DateTime   @updatedAt

  user            User             @relation(fields: [createdBy], references: [id])
  server          Server?          @relation(fields: [serverId], references: [id], onDelete: SetNull)
  siteChecks      SiteCheck[]
  sslCertificates SslCertificate[]
  robotsEntries   RobotsEntry[]
  pages           Page[]
  alerts          Alert[]

  @@index([status], name: "idx_sites_status")
  @@index([domain], name: "idx_sites_domain")
  @@index([serverId], name: "idx_sites_server_id")
  @@map("sites")
}

model Page {
  id                String     @id @default(uuid())
  siteId            String
  url               String
  urlHash           String
  path              String?
  sourceSitemap     String?
  sitemapChain      String[]
  priority          Decimal?   @db.Decimal(3, 1)
  changeFreq        String?
  lastModified      DateTime?
  status            PageStatus @default(PENDING)
  lastCheckedAt     DateTime?
  hasSecurityIssues Boolean    @default(false)
  seoScore          Int?
  lastSeoCheckedAt  DateTime?
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  site       Site        @relation(fields: [siteId], references: [id], onDelete: Cascade)
  pageChecks PageCheck[]
  seoChecks  SeoCheck[]
  alerts     Alert[]

  @@unique([siteId, urlHash], name: "uniq_pages_site_url_hash")
  @@index([siteId, status], name: "idx_pages_site_id_status")
  @@index([lastCheckedAt], name: "idx_pages_last_checked_at")
  @@map("pages")
}

model PageCheck {
  id              String   @id @default(uuid())
  pageId          String
  siteId          String
  checkedAt       DateTime @default(now())
  httpStatus      Int?
  responseTimeMs  Int?
  isReachable     Boolean
  redirectUrl     String?
  contentHash     String?
  contentLength   Int?
  title           String?
  errorMessage    String?
  securityIssues  Json?
  externalScripts String[]

  page Page @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId, checkedAt(sort: Desc)], name: "idx_page_checks_page_id_checked_at")
  @@index([siteId, checkedAt(sort: Desc)], name: "idx_page_checks_site_id_checked_at")
  @@map("page_checks")
}

model SeoCheck {
  id               String   @id @default(uuid())
  pageId           String
  siteId           String
  checkedAt        DateTime @default(now())
  score            Int
  issues           Json
  title            String?
  description      String?
  h1Count          Int?
  canonicalUrl     String?
  hasViewport      Boolean?
  hasOgTags        Boolean?
  hasSchema        Boolean?
  imagesMissingAlt Int?
  isIndexable      Boolean?

  page Page @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId, checkedAt(sort: Desc)], name: "idx_seo_checks_page_id_checked_at")
  @@index([siteId], name: "idx_seo_checks_site_id")
  @@map("seo_checks")
}

model Alert {
  id                String    @id @default(uuid())
  siteId            String?
  pageId            String?
  type              AlertType
  thresholdDays     Int?
  isActive          Boolean   @default(true)
  notificationEmail String?
  webhookUrl        String?
  lastTriggeredAt   DateTime?
  createdAt         DateTime  @default(now())

  site Site? @relation(fields: [siteId], references: [id], onDelete: Cascade)
  page Page? @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@map("alerts")
}
```
