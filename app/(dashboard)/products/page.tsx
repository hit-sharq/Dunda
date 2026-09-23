import { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import PageContent from './page-content'

export const metadata: Metadata = {
  title: 'Products | Dunda',
  description: 'Manage product catalog',
}

export default async function ProductsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const member = await prisma.organizationMember.findUnique({
    where: { clerkUserId: userId },
    include: { organization: true },
  })
  if (!member?.organization) redirect('/onboarding')
  return <PageContent organizationId={member.organizationId} />
}