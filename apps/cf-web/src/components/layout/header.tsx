"use client";

import React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useBreadcrumbs } from '@/hooks/use-breadcrumbs';
import Link from 'next/link';

export default function Header() {
  const breadcrumbs = useBreadcrumbs();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/5 px-4 sticky top-0 z-10 bg-[#050505]/80 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1 text-zinc-400 hover:text-white transition-colors" />
        <Separator orientation="vertical" className="mr-2 h-4 bg-white/10" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink asChild>
                <Link href="/admin" className="text-zinc-500 hover:text-white font-bold text-xs uppercase tracking-widest">
                  Admin OS
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {breadcrumbs.length > 0 && <BreadcrumbSeparator className="hidden md:block text-zinc-800" />}
            {breadcrumbs.map((breadcrumb, index) => (
              <React.Fragment key={breadcrumb.link}>
                <BreadcrumbItem>
                  {index === breadcrumbs.length - 1 ? (
                    <BreadcrumbPage className="text-white font-bold text-xs uppercase tracking-widest">
                      {breadcrumb.title}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={breadcrumb.link} className="text-zinc-500 hover:text-white font-bold text-xs uppercase tracking-widest">
                        {breadcrumb.title}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbs.length - 1 && (
                  <BreadcrumbSeparator className="hidden md:block text-zinc-800" />
                )}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <div className="ml-auto flex items-center gap-4">
        {/* Placeholder for future header items like search or notifications */}
      </div>
    </header>
  );
}
