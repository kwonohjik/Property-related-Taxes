"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 경량 Tabs (Radix 없이). shadcn tabs 설치 전 MVP 용.
 *
 * 사용 예:
 *   <SimpleTabs defaultValue="a">
 *     <TabsList>
 *       <TabsTrigger value="a">A</TabsTrigger>
 *       <TabsTrigger value="b">B</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="a">...</TabsContent>
 *     <TabsContent value="b">...</TabsContent>
 *   </SimpleTabs>
 */

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
}
const Ctx = createContext<TabsCtx | null>(null);

export function SimpleTabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  /** controlled 모드 — 부모가 탭 상태를 관리 */
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const value = controlledValue ?? internalValue;

  const setValue = (v: string) => {
    if (controlledValue === undefined) setInternalValue(v);
    onValueChange?.(v);
  };

  return (
    <Ctx.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TabsTrigger must be inside SimpleTabs");
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-background text-foreground shadow" : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TabsContent must be inside SimpleTabs");
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" data-tab-value={value} className={cn("mt-4", className)}>
      {children}
    </div>
  );
}
