import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Separator } from '@/components/ui/separator'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r bg-card">
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-6 border-b">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            W
          </div>
          <span className="font-semibold text-sm">WebMonitor</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 p-4">
          <NavItem href="/" label="Dashboard" />
          <NavItem href="/sites" label="Sites" />
        </nav>

        <Separator />

        {/* User */}
        <div className="p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{session.user.name ?? session.user.email}</p>
          <p>{session.user.email}</p>
          <Link
            href="/api/auth/signout"
            className="mt-2 inline-block text-destructive hover:underline"
          >
            Sign out
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {label}
    </Link>
  )
}
