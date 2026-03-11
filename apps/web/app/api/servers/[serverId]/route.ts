import { NextResponse } from 'next/server'
import { withAuthAndErrors } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { UpdateServerSchema } from '@/lib/validators'

export const PATCH = withAuthAndErrors(async (req, { params }) => {
  const body = await req.json()
  const { name } = UpdateServerSchema.parse(body)

  const server = await db.server.findUnique({ where: { id: params['serverId'] } })
  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 })

  const updated = await db.server.update({
    where: { id: params['serverId'] },
    data: { name },
  })

  return NextResponse.json({
    id: updated.id,
    ipAddress: updated.ipAddress,
    name: updated.name,
    updatedAt: updated.updatedAt,
  })
})

export const DELETE = withAuthAndErrors(async (_req, { params }) => {
  const server = await db.server.findUnique({ where: { id: params['serverId'] } })
  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 })

  // Sites will have serverId set to null via onDelete: SetNull
  await db.server.delete({ where: { id: params['serverId'] } })

  return new NextResponse(null, { status: 204 })
})
