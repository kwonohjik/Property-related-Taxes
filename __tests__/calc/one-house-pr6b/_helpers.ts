/** PR6b 공용 — 판정 메뉴 route(④→⑫→⑭) · 핸드오프 → 계산기 ⑧ collectStepIssues · 계산기 route. */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as POST_TRANSFER } from "@/app/api/calc/transfer/route";
import { POST as POST_OH } from "@/app/api/calc/one-house-exemption/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { RulingCase } from "../one-house-rulings/harness";

export function withToday<T>(today: string, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${today}T03:00:00Z`));
  return fn().finally(() => vi.useRealTimers());
}

export function mkCase(today: string, form: Record<string, unknown>): RulingCase {
  return { id: "probe", docNo: "", docDate: "", basis: "current", today, summary: "", bucket: "match", form } as unknown as RulingCase;
}

export function allIssues(form: TransferFormData) {
  const out: string[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, form)) out.push(`step${s}${i.field ? `[${i.field}]` : ""}: ${i.message}`);
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
    /* body만 필요 */
  }
  vi.unstubAllGlobals();
  return cap.body!;
}

/** 계산기 ④ body → ⑫⑭ route. ⑧ 이슈는 막지 않고 함께 돌려준다. */
export async function runCalc(form: TransferFormData) {
  const issues = allIssues(form);
  const body = await captureBody(form);
  const res = await POST_TRANSFER(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  return { issues, status: res.status, result: json?.data?.result };
}

/** 판정 메뉴 ⑧ → ④ → route. */
export async function runJudgment(form: OneHouseJudgmentFormData) {
  const ve = validateAllSteps(form).map((e) => `${e.severity}:${e.field}: ${e.message}`);
  const body = buildOneHouseExemptionApiBody(form);
  const res = await POST_OH(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  return { status: res.status, ve, data: json?.data };
}

/** 판정 결과를 계산기 폼으로 넘긴 뒤(핸드오프). */
export function handoff(form: OneHouseJudgmentFormData, over: Partial<TransferFormData> = {}): TransferFormData {
  const d = createDefaultTransferFormData();
  const p = toTransferFormPatch(form);
  return { ...d, ...p, ...over } as TransferFormData;
}
