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
  const server = await db.server.findUnique({
    where: { id: params['serverId'] },
    include: { _count: { select: { sites: true } } },
  })
  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 })

  if (server._count.sites > 0) {
    return NextResponse.json(
      { error: `Cannot delete server: ${server._count.sites} site(s) are still linked to it. Remove or reassign those sites first.` },
      { status: 409 }
    )
  }

  await db.server.delete({ where: { id: params['serverId'] } })

  return new NextResponse(null, { status: 204 })
})
