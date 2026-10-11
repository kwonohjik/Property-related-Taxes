/**
 * 판정 메뉴 전 구간(폼 → ⑧ → ④ → ⑫ → route ⑭ → 엔진)의 **원 응답** 관측 — `observe.ts`(요약)보다 넓게 본다.
 * `data.judgment`(unmetExceptions·undetermined·pending) · `data.houseCount`(제외 명세) · `data.contestedIssues`를 그대로 돌려준다.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, type RulingCase } from "./harness";

export function mkCase(today: string, form: Record<string, unknown>): RulingCase {
  return { id: "probe", docNo: "", docDate: "", basis: "current", today, summary: "", bucket: "match", form } as unknown as RulingCase;
}

export async function observeRaw(c: RulingCase) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const form = buildCaseForm(c);
    const issues = validateAllSteps(form).map((e) => `${e.severity}:${e.field}: ${e.message}`);
    const body = buildOneHouseExemptionApiBody(form);
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status as number, issues, body: body as any, json, j: json?.data?.judgment, data: json?.data };
  } finally {
    vi.useRealTimers();
  }
}
