"use client";

import { Button } from "@heroui/react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();
  // resolvedTheme is undefined on the server — render only after mount to
  // avoid a hydration mismatch on the label. useSyncExternalStore returns the
  // server snapshot (false) during SSR/hydration, true after — no effect needed.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;

  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <Button variant="ghost" onPress={() => setTheme(next)}>
      {resolvedTheme === "dark" ? "☀️ Sáng" : "🌙 Tối"}
    </Button>
  );
}
