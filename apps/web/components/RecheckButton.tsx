'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface Props {
  url: string
  label?: string
  variant?: 'default' | 'outline' | 'destructive' | 'ghost' | 'link' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function RecheckButton({
  url,
  label = 'Re-check',
  variant = 'outline',
  size = 'sm',
}: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    setDone(false)
    try {
      await fetch(url, { method: 'POST' })
      setDone(true)
      setTimeout(() => {
        setDone(false)
        router.refresh()
      }, 1500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant={variant} size={size} onClick={handleClick} disabled={loading}>
      {loading ? 'Queuing…' : done ? 'Queued!' : label}
    </Button>
  )
}
