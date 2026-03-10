# Frontend Pages & Features

Built with Next.js 14 App Router, TailwindCSS, and shadcn/ui components.

## Page Structure

```
app/
├── (auth)/
│   └── login/                  # Login page
├── (dashboard)/
│   ├── layout.tsx              # Sidebar + nav layout
│   ├── page.tsx                # Dashboard overview
│   ├── sites/
│   │   ├── page.tsx            # Sites list
│   │   ├── new/
│   │   │   └── page.tsx        # Add new site form
│   │   └── [siteId]/
│   │       ├── page.tsx        # Site overview
│   │       ├── pages/
│   │       │   ├── page.tsx    # Pages list
│   │       │   └── [pageId]/
│   │       │       └── page.tsx # Single page detail
│   │       ├── ssl/
│   │       │   └── page.tsx    # SSL history
│   │       ├── robots/
│   │       │   └── page.tsx    # Robots.txt viewer
│   │       └── alerts/
│   │           └── page.tsx    # Alert settings
└── api/                        # API routes (not UI)
```

---

## Pages

### Login (`/login`)
- Email + password form
- Redirects to dashboard on success
- Clean centered card layout

---

### Dashboard Overview (`/`)
**Summary cards (top row):**
- Total Sites Monitored
- Sites Currently Up / Down
- Total Pages Indexed
- Pages with Issues

**Charts:**
- Response time trend (last 24h) — line chart per site
- Uptime percentage — 7-day bar chart per site

**Recent Issues panel:**
- Latest page downs, SSL warnings, content changes
- Sorted by recency, with site + URL link

**Active Sites table:**
- Domain, status badge, page count, avg response time, SSL expiry countdown, last checked

---

### Sites List (`/sites`)
- Table: Domain, Status, Pages, Uptime %, Avg Response Time, SSL Expires, Actions
- Status filter tabs: All / Active / Error / Paused / Pending
- Search by domain
- Add Site button → opens `/sites/new`
- Row click → site detail page

---

### Add New Site (`/sites/new`)
Form fields:
- **Domain** (required) — input with validation hint, strips protocol if entered
- **Display Name** (optional)
- **Check Interval** — dropdown: 5min / 15min / 30min / 1h / 6h / 24h
- Submit → shows progress toast → redirects to site detail

---

### Site Overview (`/sites/[siteId]`)
**Header:**
- Domain name, status badge, last checked time
- Action buttons: Re-check now | Re-index | Pause/Resume | Delete

**Info cards row:**
- HTTP Status (with color)
- Response Time (ms)
- Total Pages
- SSL Status

**Tabs:**
1. **Overview** — server info, response headers, robots.txt summary
2. **Pages** → links to `/sites/[siteId]/pages`
3. **SSL** → links to `/sites/[siteId]/ssl`
4. **Robots.txt** → links to `/sites/[siteId]/robots`
5. **Alerts** → links to `/sites/[siteId]/alerts`
6. **History** — site check history chart + table

**Response Time Chart:**
- Line chart of last 30 checks
- X-axis: time, Y-axis: ms

---

### Pages List (`/sites/[siteId]/pages`)
**Stats bar:** Total | Up | Down | Redirect | Error | Pending

**Filters:**
- Status filter pills
- Search box (URL/path)
- Sort by: URL / Status / Response Time / Last Checked

**Table columns:**
- URL (truncated, with link)
- HTTP Status (badge)
- Response Time
- Title (from last check)
- Last Checked
- Actions: Re-check

**Pagination** with page size selector.

---

### Single Page Detail (`/sites/[siteId]/pages/[pageId]`)
- Full URL, source sitemap, status badge
- Latest check: status, response time, title, content hash
- Response time history chart (last 20 checks)
- Check history table: time, status, response time, content change indicator

---

### SSL Detail (`/sites/[siteId]/ssl`)
**Current Certificate card:**
- Valid / Invalid badge
- Issuer, Subject
- Valid From / To dates
- **Days Until Expiry** — highlighted red if < 30 days
- Protocol, Cipher
- Subject Alternative Names

**History table:** Past 10 certificate snapshots

---

### Robots.txt Viewer (`/sites/[siteId]/robots`)
- Last fetched time, HTTP status
- **Raw content** — monospace code block
- **Parsed Rules** — accordion by User-agent
- **Sitemaps Found** — list with links
- **Crawl Delay** — highlighted if set

---

### Alerts (`/sites/[siteId]/alerts`)
**Existing alerts table:**
- Type, Threshold, Email/Webhook, Last Triggered, Active toggle, Delete

**Add Alert form:**
- Alert type selector
- Threshold (days, for SSL)
- Notification email
- Webhook URL
- Save button

---

## UI Components

| Component | Usage |
|---|---|
| `<StatusBadge>` | UP/DOWN/PENDING/ERROR color-coded pill |
| `<ResponseTimeChart>` | Recharts line chart with time axis |
| `<UptimeBar>` | 24-hour segmented uptime bar |
| `<SslExpiryBadge>` | Days remaining with warning colors |
| `<JobProgressToast>` | Real-time discovery progress notification |
| `<DomainInput>` | Auto-strips protocol, validates hostname |
| `<PageStatusFilters>` | Multi-select filter pills |

---

## Real-time Updates

- **Server-Sent Events (SSE)** via `/api/sites/:id/stream` — pushes status updates to the site detail page while a discovery job is running
- Dashboard auto-refreshes every 60 seconds via `useSWR` with `refreshInterval`
- Manual refresh button on all pages

---

## Responsive Design

- Sidebar collapses to a bottom tab bar on mobile
- Tables switch to card layout on small screens
- Charts responsive via Recharts `ResponsiveContainer`
