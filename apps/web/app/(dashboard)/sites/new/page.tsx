import { AddSiteForm } from '@/components/AddSiteForm'

export const metadata = { title: 'Add Site' }

export default function NewSitePage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Add Site</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Enter a domain to start monitoring
        </p>
      </div>
      <AddSiteForm />
    </div>
  )
}
