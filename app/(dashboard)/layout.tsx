import { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import DashboardProviders from './providers'
import Sidebar from './sidebar'
import Header from './header'

export const metadata: Metadata = {
  title: 'Dashboard | Dunda',
  description: 'Your Dunda workspace dashboard',
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }

  // Get user's organization
  const member = await prisma.organizationMember.findUnique({
    where: { clerkUserId: userId },
    include: { organization: true },
  })

  if (!member?.organization) {
    redirect('/onboarding')
  }

  return (
    <DashboardProviders>
      <div className="flex min-h-screen bg-[#f4f5f1]">
        <Sidebar organizationId={member.organizationId} />
        <main className="min-w-0 flex-1">
          <Header organizationId={member.organizationId} />
          <div className="p-4 sm:p-7">{children}</div>
        </main>
      </div>
    </DashboardProviders>
  )
}