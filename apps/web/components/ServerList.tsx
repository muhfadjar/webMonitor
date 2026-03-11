'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface ServerRow {
  id: string
  ipAddress: string
  name: string | null
  siteCount: number
}

export function ServerList({ servers }: { servers: ServerRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-6 py-3 text-left font-medium text-muted-foreground">IP Address</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sites</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((server) => (
            <ServerRow key={server.id} server={server} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ServerRow({ server }: { server: ServerRow }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(server.name ?? '')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/servers/${server.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value.trim() || null }),
      })
      setEditing(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function deleteServer() {
    if (!confirm(`Delete server ${server.ipAddress}? Sites will be unlinked but not deleted.`)) return
    await fetch(`/api/servers/${server.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-6 py-3 font-mono text-sm">{server.ipAddress}</td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') setEditing(false)
              }}
              placeholder="e.g. Production server"
              className="h-7 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-48"
            />
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? '…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            className="text-left hover:underline text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setEditing(true)}
          >
            {server.name ?? <span className="italic">Click to name</span>}
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        <Link
          href={`/sites?serverId=${server.id}`}
          className="hover:underline text-primary"
        >
          {server.siteCount} site{server.siteCount !== 1 ? 's' : ''}
        </Link>
      </td>
      <td className="px-4 py-3">
        <Button size="sm" variant="ghost" onClick={deleteServer} className="text-destructive hover:text-destructive">
          Delete
        </Button>
      </td>
    </tr>
  )
}
