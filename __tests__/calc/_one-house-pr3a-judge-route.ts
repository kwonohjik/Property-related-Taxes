/** 1세대1주택 상속·합가 엔진 축(PR3a) anchor 공용 — 판정 메뉴 폼 → ⑧ validateAllSteps → ④ buildOneHouseExemptionApiBody → route POST(⑫⑭) 원 응답. */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

/** 판정 메뉴 케이스 — 평가셋 모양(`RulingCase`)으로 폼을 만든다. */
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
    return { status: res.status, issues, body, json, j: json?.data?.judgment, data: json?.data };
  } finally {
    vi.useRealTimers();
  }
}
