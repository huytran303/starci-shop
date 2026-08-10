"use client";

import { RouterProvider } from "@heroui/react";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";

// Client wrapper stacking app-wide providers (theme, router; toast, query... later).
// next-themes sets .dark/.light on <html> — HeroUI's dark variant keys off .dark,
// with system preference as fallback, so attribute="class" + enableSystem matches.
export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <RouterProvider navigate={router.push}>{children}</RouterProvider>
    </ThemeProvider>
  );
}
