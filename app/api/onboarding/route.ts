import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgName, branchName, currency } = await req.json()

    if (!orgName || !branchName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if user already has an organization
    const existingMember = await prisma.organizationMember.findUnique({
      where: { clerkUserId: userId },
    })

    if (existingMember) {
      return NextResponse.json({ error: 'User already has an organization' }, { status: 400 })
    }

    // Create organization, branch, and member in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: orgName,
          currency: currency || 'KES',
        },
      })

      const branch = await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: branchName,
          active: true,
        },
      })

      const member = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          clerkUserId: userId,
          role: 'OWNER',
          active: true,
        },
      })

      await tx.branchMember.create({
        data: {
          branchId: branch.id,
          organizationMemberId: member.id,
        },
      })

      // Create default floor and section
      const floor = await tx.floor.create({
        data: {
          branchId: branch.id,
          name: 'Main Floor',
        },
      })

      await tx.floorSection.create({
        data: {
          floorId: floor.id,
          name: 'Main Section',
        },
      })

      // Create default categories
      await tx.category.createMany({
        data: [
          { organizationId: organization.id, name: 'Beer' },
          { organizationId: organization.id, name: 'Spirits' },
          { organizationId: organization.id, name: 'Cocktails' },
          { organizationId: organization.id, name: 'Wine' },
          { organizationId: organization.id, name: 'Food' },
          { organizationId: organization.id, name: 'Cigars' },
          { organizationId: organization.id, name: 'Non-Alcoholic' },
        ],
      })

      return { organization, branch, member }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Onboarding error:', error)
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
  }
}