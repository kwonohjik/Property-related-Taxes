// ── 계산기 — ④ 본문 가로채기 → route POST(⑫⑭) + ⑧ 전 단계 이슈. 호출 파일에서 preloadTaxRates를 mock한다. ──
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

export type Form = ReturnType<typeof createDefaultTransferFormData>;
export const newForm = () => createDefaultTransferFormData();

export const hrow = (over: Partial<HouseEntry>): HouseEntry =>
  ({
    region: "non_capital",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

export function allIssues(form: Form) {
  const out: string[] = [];
  for (let s = 0; s <= 5; s++)
    for (const i of collectStepIssues(s, form)) out.push(`${s}:${i.field ?? ""}:${i.message.slice(0, 80)}`);
  return out;
}

export async function captureBody(form: Form): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* 본문만 본다 */
  }
  vi.unstubAllGlobals();
  return cap.body!;
}

export async function runCalc(form: Form) {
  const issues = allIssues(form);
  const body = await captureBody(form);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const r = json?.data?.result ?? {};
  return {
    status: res.status,
    isExempt: r.isExempt,
    exemptReason: r.exemptReason,
    totalTax: r.totalTax,
    calculatedTax: r.calculatedTax,
    warnings: r.warnings,
    issues,
    body,
    r,
    err: res.status !== 200 ? JSON.stringify(json).slice(0, 500) : undefined,
  };
}
