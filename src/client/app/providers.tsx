"use client";

import { RouterProvider } from "@heroui/react";
import { useRouter } from "next/navigation";

// HeroUI v3 needs no theme provider — this client wrapper wires React Aria's
// RouterProvider to the Next router so HeroUI Links do client-side navigation.
// Future providers (theme, toast, query...) stack inside here, not in layout.tsx.
export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return <RouterProvider navigate={router.push}>{children}</RouterProvider>;
}
