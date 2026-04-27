'use client';

import React from 'react';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { InfobarProvider } from '@/components/ui/infobar';
import QueryProvider from './query-provider';
import { Toaster } from '@/components/ui/sonner';

export default function Providers({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <SessionProvider>
        <QueryProvider>
          <InfobarProvider>
            <div className="flex-1 w-full flex flex-col">
              {children}
            </div>
            <Toaster />
          </InfobarProvider>
        </QueryProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
