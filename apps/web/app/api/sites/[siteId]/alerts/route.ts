import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { CreateAlertSchema } from '@/lib/validators'

export const GET = withAuthAndErrors(async (_req, { params }) => {
  const alerts = await db.alert.findMany({
    where: { siteId: params['siteId'] },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ data: alerts })
})

export const POST = withAuthAndErrors(async (req, { params }) => {
  const body = await req.json()
  const data = CreateAlertSchema.parse(body)

  const site = await db.site.findUnique({ where: { id: params['siteId'] } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const alert = await db.alert.create({
    data: { ...data, siteId: params['siteId'] },
  })

  return NextResponse.json(alert, { status: 201 })
})
