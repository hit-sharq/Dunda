'use client'

import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

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

export default function Landing() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f5f0] text-[#172019]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-[#667068] md:flex">
          <Link href="#modules" className="transition-colors hover:text-[#172019]">Platform</Link>
          <Link href="#how" className="transition-colors hover:text-[#172019]">How it works</Link>
          <Link href="#hq" className="transition-colors hover:text-[#172019]">Multi-branch</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="hidden text-sm font-medium text-[#566058] sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full bg-[#172019] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
          >
            Get started <ArrowUpRight className="ml-1 inline size-4" />
          </Link>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_.9fr] lg:px-10 lg:pb-28 lg:pt-24">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#dce1d6] bg-white/70 px-3.5 py-2 text-xs font-medium text-[#647067]">
            <span className="size-1.5 rounded-full bg-[#95bd36]" />
            Built for the night economy
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-7xl">
            Run the night.<br />
            <span className="text-[#91ad48]">Run the business.</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-[#68736b]">
            Dunda is the operating system for ambitious clubs, lounges, bars, and hospitality groups.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="rounded-full bg-[#172019] px-6 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              Open Dunda workspace <ArrowUpRight className="ml-1 inline size-4" />
            </Link>
            <Link
              href="#modules"
              className="rounded-full border border-[#d5dbd2] bg-white px-6 py-3.5 text-sm font-semibold text-[#354139]"
            >
              See the platform
            </Link>
          </div>
          <div className="mt-12 flex items-center gap-3 text-sm text-[#78827a]">
            <div className="flex -space-x-2">
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-[#f5f5f0] bg-[#d2a188] text-xs font-semibold">A</span>
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-[#f5f5f0] bg-[#a5bd8e] text-xs font-semibold">K</span>
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-[#f5f5f0] bg-[#d4c184] text-xs font-semibold">M</span>
            </div>
            <span>Trusted by operators who move the city</span>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-[#e4efbd] blur-3xl" />
          <div className="relative rounded-[2rem] border border-[#dfe5d9] bg-[#e9eee5] p-3 shadow-[0_30px_80px_rgba(23,32,25,.12)]">
            <div className="rounded-[1.4rem] bg-white p-4">
              <div className="aspect-video bg-[#f5f5f0] rounded-[1rem] flex items-center justify-center text-[#9aa49d]">
                Dashboard Preview
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="modules" className="border-y border-[#e2e6df] bg-white/60">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#9aac51]">One connected operation</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              Everything your venue needs to make the night flow.
            </h2>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[#e2e6df] bg-[#e2e6df] sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['POS & payments', 'Move from order to payment in seconds, across every selling unit.'],
              ['Floor & tables', 'See every table, section, and running bill at a glance.'],
              ['Inventory control', 'Know what is moving, what is missing, and what to reorder.'],
              ['Events & VIP', 'Turn busy nights into memorable experiences for your best guests.'],
            ].map(([title, desc], i) => (
              <div key={title} className="bg-[#f8f9f5] p-6">
                <div className="mb-12 flex size-10 items-center justify-center rounded-xl bg-[#eaf2c9] text-[#607a2d]">
                  <span className="text-sm font-semibold">0{i + 1}</span>
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#768078]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="how" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#9aac51]">Built for operators</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              Less admin.<br />More momentum.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {['Set up your club', 'Add your team', 'Start selling', 'Scale your group'].map((item, i) => (
              <div key={item} className="border-t border-[#dfe4dc] pt-4">
                <div className="text-sm text-[#9aac51]">0{i + 1}</div>
                <h3 className="mt-8 text-xl font-medium">{item}</h3>
                <p className="mt-2 text-sm leading-6 text-[#788179]">A clear, shared source of truth for the whole operation.</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <footer className="bg-[#172019] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <div>
            <Logo />
            <p className="mt-3 text-sm text-[#a4afa5]">The club operating system.</p>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#a4afa5]">
            <span>© 2026 Dunda</span>
            <Link href="/sign-up" className="text-[#d3f36b]">
              Open workspace <ArrowUpRight className="ml-1 inline size-4" />
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}