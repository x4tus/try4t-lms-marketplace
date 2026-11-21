'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

interface DashboardShellProps {
  title: string;
  subtitle: string;
  navItems: SidebarNavItem[];
  children: React.ReactNode;
}

export function DashboardShell({ title, subtitle, navItems, children }: DashboardShellProps) {
  const pathname = usePathname();

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <nav className="flex flex-row gap-1 overflow-x-auto pb-2 lg:flex-col lg:pb-0">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </span>
                {item.badge && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 space-y-6">{children}</main>
    </div>
  );
}
