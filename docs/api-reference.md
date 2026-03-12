# API Reference

Base path: `/api`
All endpoints require authentication (NextAuth session cookie) unless noted.
All responses are JSON. Errors follow `{ "error": "message", "details"?: any }`.

---

## Authentication

### POST `/api/auth/login`
NextAuth credential login (handled by NextAuth internally).

### GET `/api/auth/session`
Returns current session or null.

---

## Sites

### GET `/api/sites`
List all monitored sites.

**Query params:**
| Param | Type | Description |
|---|---|---|
| status | string | Filter by status: `pending,active,error,paused` |
| tags | string | Comma-separated tag filter (matches any) |
| page | int | Pagination page (default 1) |
| limit | int | Results per page (default 20, max 100) |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "domain": "example.com",
      "displayName": "Example Site",
      "status": "active",
      "checkIntervalMinutes": 10,
      "pageCheckIntervalMinutes": 1440,
      "tags": ["production", "ecommerce"],
      "serverId": "uuid or null",
      "googleTags": {
        "gtmIds": ["GTM-XXXXXX"],
        "ga4Ids": ["G-XXXXXXXXXX"],
        "uaIds": [],
        "adsIds": [],
        "optimizeIds": [],
        "searchConsoleVerification": null
      },
      "lastCheckedAt": "2024-01-15T10:30:00Z",
      "createdAt": "2024-01-01T00:00:00Z",
      "latestCheck": {
        "httpStatus": 200,
        "responseTimeMs": 234,
        "isReachable": true
      },
      "latestSsl": {
        "isValid": true,
        "daysUntilExpiry": 45
      },
      "pageCount": 142,
      "pagesUp": 139,
      "pagesDown": 3
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

---

### POST `/api/sites`
Add a new site for monitoring.

**Request body:**
```json
{
  "domain": "example.com",
  "displayName": "Example Site",
  "checkIntervalMinutes": 10,
  "pageCheckIntervalMinutes": 1440,
  "tags": ["production"]
}
```

**Validation:**
- `domain` — required, must be a valid hostname (no protocol, no path)
- `checkIntervalMinutes` — optional, min 5, max 10080 (1 week), **default 10**
- `pageCheckIntervalMinutes` — optional, min 5, max 10080, **default 1440** (24h)
- `tags` — optional, array of strings

**Response 201:**
```json
{
  "id": "uuid",
  "domain": "example.com",
  "status": "pending",
  "createdAt": "2024-01-15T10:00:00Z"
}
```
Immediately enqueues a `site-discovery` job.

---

### GET `/api/sites/:id`
Get full details for a single site.

**Response 200:**
```json
{
  "id": "uuid",
  "domain": "example.com",
  "displayName": "Example Site",
  "status": "active",
  "checkIntervalMinutes": 10,
  "pageCheckIntervalMinutes": 1440,
  "tags": ["production"],
  "serverId": "uuid or null",
  "googleTags": { ... },
  "lastCheckedAt": "2024-01-15T10:30:00Z",
  "latestCheck": { ... },
  "latestSsl": { ... },
  "latestRobots": {
    "isAccessible": true,
    "sitemapUrls": ["https://example.com/sitemap.xml"],
    "crawlDelay": null
  },
  "pageStats": {
    "total": 142,
    "up": 139,
    "down": 2,
    "error": 1,
    "pending": 0
  }
}
```

---

### PATCH `/api/sites/:id`
Update site settings.

**Request body (all optional):**
```json
{
  "displayName": "New Name",
  "checkIntervalMinutes": 30,
  "pageCheckIntervalMinutes": 720,
  "tags": ["staging"],
  "status": "paused"
}
```

---

### DELETE `/api/sites/:id`
Remove a site and all associated data.

**Response 204:** No content.

---

### POST `/api/sites/:id/recheck`
Trigger an immediate full re-check of a site.

**Response 202:**
```json
{ "jobId": "bull-job-id", "message": "Re-check queued" }
```

---

### POST `/api/sites/:id/reindex`
Re-fetch sitemaps and re-index all pages (clears existing pages, re-discovers).

**Response 202:**
```json
{ "jobId": "bull-job-id", "message": "Re-index queued" }
```

---

### GET `/api/sites/export`
Download all sites as an Excel (.xlsx) file.

**Response 200:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

Excel columns: `domain`, `displayName`, `checkIntervalMinutes`, `pageCheckIntervalMinutes`, `tags`, `status`, `serverIp`, `serverName`

---

### POST `/api/sites/import`
Bulk-import sites from an Excel (.xlsx) file.

**Request:** `multipart/form-data` with a `file` field containing the `.xlsx`.

**Excel columns:**
| Column | Required | Notes |
|---|---|---|
| domain | yes | Valid hostname, no protocol |
| displayName | no | Optional friendly name |
| checkIntervalMinutes | no | Default 10 if omitted |
| pageCheckIntervalMinutes | no | Default 1440 if omitted |

**Limits:** Max 500 sites per import.

**Response 200:**
```json
{
  "imported": 12,
  "skipped": 2,
  "errors": [
    { "row": 5, "domain": "bad domain", "error": "Invalid hostname" }
  ]
}
```

---

## Site Checks (History)

### GET `/api/sites/:id/checks`
Get health check history for a site.

**Query params:** `from`, `to` (ISO dates), `limit` (default 100, max 500)

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "checkedAt": "2024-01-15T10:30:00Z",
      "httpStatus": 200,
      "responseTimeMs": 234,
      "isReachable": true,
      "serverHeader": "nginx/1.24"
    }
  ]
}
```

---

## SSL

### GET `/api/sites/:id/ssl`
Get SSL certificate history.

**Query params:** `limit` (default 20)

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "checkedAt": "2024-01-15T10:30:00Z",
      "isValid": true,
      "issuer": "Let's Encrypt",
      "validFrom": "2024-01-01T00:00:00Z",
      "validTo": "2024-04-01T00:00:00Z",
      "daysUntilExpiry": 76,
      "protocol": "TLSv1.3"
    }
  ]
}
```

---

## Robots.txt

### GET `/api/sites/:id/robots`
Get robots.txt history for a site.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "fetchedAt": "2024-01-15T10:30:00Z",
      "isAccessible": true,
      "sitemapUrls": ["https://example.com/sitemap.xml"],
      "disallowRules": {
        "*": ["/admin/", "/private/"]
      },
      "crawlDelay": 2,
      "rawContent": "User-agent: *\nDisallow: /admin/\n..."
    }
  ]
}
```

---

## Pages

### GET `/api/sites/:id/pages`
List all pages discovered for a site.

**Query params:**
| Param | Type | Description |
|---|---|---|
| status | string | Filter: `pending,up,down,redirect,error` |
| search | string | Search URL/path |
| page | int | Pagination |
| limit | int | Default 50, max 200 |
| sortBy | string | `url,status,responseTimeMs,lastCheckedAt` |
| sortOrder | string | `asc,desc` |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "url": "https://example.com/about",
      "path": "/about",
      "status": "up",
      "priority": 0.8,
      "changeFreq": "monthly",
      "hasSecurityIssues": false,
      "seoScore": 87,
      "lastCheckedAt": "2024-01-15T10:30:00Z",
      "lastSeoCheckedAt": "2024-01-15T11:00:00Z",
      "latestCheck": {
        "httpStatus": 200,
        "responseTimeMs": 180,
        "title": "About Us"
      }
    }
  ],
  "pagination": { ... }
}
```

---

### GET `/api/sites/:id/pages/:pageId`
Get details for a single page including check history.

**Response 200:**
```json
{
  "id": "uuid",
  "url": "https://example.com/about",
  "status": "up",
  "sourceSitemap": "https://example.com/sitemap.xml",
  "hasSecurityIssues": false,
  "seoScore": 87,
  "checks": [
    {
      "checkedAt": "2024-01-15T10:30:00Z",
      "httpStatus": 200,
      "responseTimeMs": 180,
      "contentHash": "abc123...",
      "securityIssues": null,
      "externalScripts": []
    }
  ]
}
```

---

### POST `/api/sites/:id/pages/:pageId/recheck`
Trigger immediate re-check for a single page.

---

### POST `/api/sites/:id/pages/seo-analyze-selected`
Trigger SEO analysis for a selected list of pages.

**Request body:**
```json
{ "pageIds": ["uuid1", "uuid2"] }
```

**Response 202:**
```json
{ "queued": 2 }
```

---

## Sitemaps

### GET `/api/sites/:id/sitemaps`
List discovered sitemaps for a site.

**Response 200:**
```json
{
  "data": [
    {
      "url": "https://example.com/sitemap.xml",
      "pageCount": 142,
      "source": "robots.txt",
      "discoveredAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

## Alerts

### GET `/api/sites/:id/alerts`
List alert configurations for a site.

### POST `/api/sites/:id/alerts`
Create an alert.

**Request body:**
```json
{
  "type": "SSL_EXPIRY",
  "thresholdDays": 30,
  "notificationEmail": "admin@example.com",
  "webhookUrl": "https://hooks.example.com/alert"
}
```

### PATCH `/api/alerts/:id`
Update an alert.

### DELETE `/api/alerts/:id`
Delete an alert.

---

## Dashboard / Stats

### GET `/api/dashboard/stats`
Aggregate stats across all sites.

**Response 200:**
```json
{
  "totalSites": 5,
  "sitesUp": 4,
  "sitesDown": 1,
  "totalPages": 742,
  "pagesUp": 738,
  "pagesDown": 4,
  "sslExpiringSoon": 1,
  "avgResponseTimeMs": 312
}
```

### GET `/api/dashboard/uptime`
Uptime percentages per site for last 7/30/90 days.

**Query params:** `days` (7, 30, or 90)

---

## Jobs

### GET `/api/jobs/status`
Get current queue stats (admin only).

**Response 200:**
```json
{
  "queues": {
    "site-discovery": { "waiting": 0, "active": 1, "completed": 42, "failed": 0 },
    "page-check": { "waiting": 156, "active": 20, "completed": 8432, "failed": 3 },
    "ssl-check": { "waiting": 0, "active": 2, "completed": 84, "failed": 0 },
    "seo-check": { "waiting": 12, "active": 5, "completed": 320, "failed": 0 }
  }
}
```
