'use client'

import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-[#d3f36b]">
            <span className="text-xl font-black text-[#172019]">d</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-[#172019]">Welcome back</h1>
          <p className="mt-2 text-sm text-[#68736b]">Sign in to your Dunda workspace</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary: 'bg-[#172019] hover:bg-[#172019]/90 text-white',
              card: 'shadow-lg border border-[#e2e6df]',
              headerTitle: 'text-[#172019]',
              headerSubtitle: 'text-[#68736b]',
            },
          }}
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
        />
      </div>
    </div>
  )
}