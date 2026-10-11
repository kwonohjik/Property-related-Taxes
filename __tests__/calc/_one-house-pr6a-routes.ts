/** 장기임대주택 거주주택 특례(§155⑳) 엔진 불변식·게이트 축(PR6a) anchor 공용 — 판정 메뉴 route · 핸드오프 → 계산기 route. */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as POST_OH } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

/** 오늘 날짜를 고정해 실행한다(판정 메뉴가 「오늘」을 기준일로 쓴다). */
export function withToday<T>(today: string, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${today}T03:00:00Z`));
  return fn().finally(() => vi.useRealTimers());
}

/** 판정 메뉴 폼 → ⑧ validateAllSteps → ④ → route(⑫⑭) 원 응답. */
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
  return { status: res.status, ve, body, json, data: json?.data };
}

/** 판정 메뉴 → 계산기 핸드오프(「계산기로 보내기」)가 만드는 계산기 폼. */
export function handoff(form: OneHouseJudgmentFormData, over: Partial<TransferFormData> = {}): TransferFormData {
  return { ...createDefaultTransferFormData(), ...toTransferFormPatch(form), ...over } as TransferFormData;
}
