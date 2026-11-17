import React from 'react';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scheduled Maintenance | MakeupKhoj',
  description: 'MakeupKhoj is currently undergoing scheduled database maintenance and optimization. We will be back shortly.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-[#faf8f5] text-[#2c1810] flex flex-col items-center justify-center p-4 selection:bg-[#f3d9d0]">
      {/* Background aesthetic decorative blurs */}
      <div 
        aria-hidden="true" 
        className="fixed top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-[#fde8e3] opacity-60 blur-3xl pointer-events-none" 
      />
      <div 
        aria-hidden="true" 
        className="fixed bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-[#fae5d9] opacity-60 blur-3xl pointer-events-none" 
      />

      <div className="relative z-10 w-full max-w-lg bg-white/90 backdrop-blur-md border border-[#eee2dc] rounded-2xl p-8 sm:p-10 shadow-xl text-center">
        {/* MakeupKhoj Logo */}
        <div className="flex justify-center mb-6">
          <Image
            src="/branding/makeupkhoj-logo.png"
            alt="MakeupKhoj"
            width={220}
            height={62}
            priority
            unoptimized
            className="h-12 w-auto object-contain"
          />
        </div>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#fff0ea] border border-[#fbd4c6] text-[#b34026] text-xs font-semibold tracking-wide uppercase mb-5">
          <span className="w-2 h-2 rounded-full bg-[#b34026] animate-pulse" />
          Scheduled Maintenance
        </div>

        {/* Headline */}
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1a0f0a] mb-3 tracking-tight">
          We&apos;re Optimizing Our Systems
        </h1>

        {/* Description */}
        <p className="text-sm sm:text-base text-[#6b554b] leading-relaxed mb-6">
          MakeupKhoj is temporarily offline while we perform scheduled database optimization and performance testing.
          All services will resume shortly with faster price comparisons and smoother browsing.
        </p>

        {/* Feature status list */}
        <div className="bg-[#faf5f2] border border-[#eee4dc] rounded-xl p-4 text-left mb-6 space-y-2.5 text-xs sm:text-sm text-[#5a463c]">
          <div className="flex items-center gap-2.5">
            <span className="text-[#b34026] font-bold">⚡</span>
            <span>Database index &amp; query tuning underway</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[#b34026] font-bold">🔒</span>
            <span>Data integrity and state fully preserved</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[#b34026] font-bold">⏱</span>
            <span>All public APIs paused during testing</span>
          </div>
        </div>

        {/* Contact info / refresh button */}
        <div className="pt-2 border-t border-[#f0e6e0] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8c7367]">
          <span>Need help? <a href="mailto:support@makeupkhoj.com" className="text-[#b34026] hover:underline font-medium">support@makeupkhoj.com</a></span>
          <button 
            type="button" 
            onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
            className="px-3 py-1.5 rounded-lg bg-[#2c1810] text-white hover:bg-[#1a0f0a] transition-colors font-medium text-xs shadow-sm cursor-pointer"
          >
            Check Status
          </button>
        </div>
      </div>

      <footer className="relative z-10 mt-8 text-xs text-[#8c7367]">
        &copy; {new Date().getFullYear()} MakeupKhoj. All rights reserved.
      </footer>
    </main>
  );
}
