import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { UpdateAlertSchema } from '@/lib/validators'

export const PATCH = withAuthAndErrors(async (req, { params }) => {
  const body = await req.json()
  const data = UpdateAlertSchema.parse(body)

  const alert = await db.alert.findUnique({ where: { id: params['alertId'] } })
  if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 })

  const updated = await db.alert.update({ where: { id: params['alertId'] }, data })
  return NextResponse.json(updated)
})

export const DELETE = withAuthAndErrors(async (_req, { params }) => {
  const alert = await db.alert.findUnique({ where: { id: params['alertId'] } })
  if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 })

  await db.alert.delete({ where: { id: params['alertId'] } })
  return new NextResponse(null, { status: 204 })
})
