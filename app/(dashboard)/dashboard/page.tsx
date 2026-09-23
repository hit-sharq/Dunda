import { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DashboardContent from './dashboard-content'

export const metadata: Metadata = {
  title: 'Overview | Dunda',
  description: 'Your Dunda workspace overview',
}

export default async function DashboardPage() {
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }

  const member = await prisma.organizationMember.findUnique({
    where: { clerkUserId: userId },
    include: { organization: true },
  })

  if (!member?.organization) {
    redirect('/onboarding')
  }

  return <DashboardContent organizationId={member.organizationId} />
}