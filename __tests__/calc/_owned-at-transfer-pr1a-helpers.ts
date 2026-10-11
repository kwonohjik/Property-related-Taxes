/**
 * PR1a anchor 공용 — ④ callTransferTaxAPI 본문 가로채기 → 계산기 route POST(⑫⑭) + ⑧ 전 단계 이슈.
 * (D2 `owned-at-transfer-d2.anchor.test.tsx`의 「양도일 현재 보유」 규칙을 route 결론까지 잇는다.)
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

export const hrow = (over: Partial<HouseEntry>): HouseEntry =>
  ({
    region: "capital",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionOrigin: "general",
    ...over,
  }) as HouseEntry;

export function allIssues(form: TransferFormData) {
  const out: { step: number; field?: string; message: string }[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, form)) out.push({ step: s, field: i.field, message: i.message });
  return out;
}

async function captureBody(form: TransferFormData): Promise<Record<string, unknown>> {
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
    /* 응답 파싱 실패는 무시 — 본문만 본다 */
  }
  vi.unstubAllGlobals();
  return cap.body!;
}

export async function runCalc(form: TransferFormData) {
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
  const result = json?.data?.result;
  return { issues, body, status: res.status, isExempt: result?.isExempt as boolean | undefined, totalTax: result?.totalTax as number | undefined };
}
