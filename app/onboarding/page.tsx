'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-[#d3f36b] text-[#172019]">
        <span className="text-lg font-black">d</span>
      </div>
      <span className="text-lg font-semibold tracking-tight">dunda</span>
    </div>
  )
}

export default function OnboardingPage() {
  const { userId, isLoaded } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [orgName, setOrgName] = useState('')
  const [branchName, setBranchName] = useState('')
  const [currency, setCurrency] = useState('KES')
  const [loading, setLoading] = useState(false)

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <div className="size-8 border-4 border-[#d3f36b] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!userId) {
    return null // Will redirect via middleware
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, branchName, currency }),
      })
      
      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (error) {
      console.error('Onboarding failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <h1 className="mt-6 text-2xl font-semibold text-[#172019]">
            {step === 1 ? 'Create your organization' : 'Set up your first branch'}
          </h1>
          <p className="mt-2 text-sm text-[#68736b]">
            {step === 1 
              ? 'This will be your main workspace in Dunda' 
              : 'Add the first location for your venue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {step === 1 && (
            <>
              <div>
                <label htmlFor="orgName" className="block text-sm font-medium text-[#354139] mb-1.5">
                  Organization Name
                </label>
                <input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full rounded-lg border border-[#d5dbd2] bg-white px-4 py-2.5 text-sm text-[#172019] placeholder:text-[#9aa49d] focus:border-[#9aac51] focus:ring-2 focus:ring-[#9aac51]/20 outline-none"
                  placeholder="e.g., Skyline Entertainment"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={!orgName || loading}
                className="w-full rounded-full bg-[#172019] px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                Continue <ArrowUpRight className="ml-1 inline size-4" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label htmlFor="branchName" className="block text-sm font-medium text-[#354139] mb-1.5">
                  Branch Name
                </label>
                <input
                  id="branchName"
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full rounded-lg border border-[#d5dbd2] bg-white px-4 py-2.5 text-sm text-[#172019] placeholder:text-[#9aa49d] focus:border-[#9aac51] focus:ring-2 focus:ring-[#9aac51]/20 outline-none"
                  placeholder="e.g., Main Branch"
                  required
                />
              </div>
              <div>
                <label htmlFor="currency" className="block text-sm font-medium text-[#354139] mb-1.5">
                  Currency
                </label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-[#d5dbd2] bg-white px-4 py-2.5 text-sm text-[#172019] focus:border-[#9aac51] focus:ring-2 focus:ring-[#9aac51]/20 outline-none"
                >
                  <option value="KES">KES - Kenyan Shilling</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!branchName || loading}
                className="w-full rounded-full bg-[#172019] px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {loading ? (
                  'Setting up...'
                ) : (
                  <>
                    Complete Setup <ArrowUpRight className="ml-1 inline size-4" />
                  </>
                )}
              </button>
            </>
          )}
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[#68736b]">
          <span>Step {step} of 2</span>
          <div className="flex gap-1">
            {[1, 2].map((s) => (
              <span
                key={s}
                className={`size-2 rounded-full transition-colors ${
                  s <= step ? 'bg-[#9aac51]' : 'bg-[#d5dbd2]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}