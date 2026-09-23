import { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import PageContent from './page-content'

export const metadata: Metadata = {
  title: 'Floor Plan | Dunda',
  description: 'Manage your venue layout',
}

export default async function FloorPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const member = await prisma.organizationMember.findUnique({
    where: { clerkUserId: userId },
    include: { organization: true },
  })
  if (!member?.organization) redirect('/onboarding')
  return <PageContent organizationId={member.organizationId} />
}