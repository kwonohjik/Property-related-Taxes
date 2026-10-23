/**
 * ④⑬ 다주택 중과 판정 메뉴 — 폼 → API 본문 · fetch (계획서 §4.2 · P4).
 *
 * 1주택 판정 본문(`buildOneHouseExemptionApiBody`)을 그대로 쓰고 **중과 축만** 더한다 — 두 메뉴가 같은 폼(store)을 공유하므로
 * 비과세 축 변환을 두 벌 두지 않는다.
 *
 * | 덧붙이는 것 | 1주택 본문 | 중과 본문 |
 * |---|---|---|
 * | 양도 주택 자체 배제 사실(`sellingHouseExclusion` — 사원용·문화유산·어린이집·11호 계약 등) | 싣지 않는다(§167의10 중과 축) | 양도 주택 행에 싣는다 |
 * | 명부가 빈 세대의 양도 주택 행 | 없다 | 싣는다(주택 수 1 · 조정대상지역 판정을 엔진이 하게) |
 * | 한시 유예 나·다목(`gracePeriod`) | 없다 | 계산기 ④와 같은 `gracePeriodInScope` — 판정 폼엔 주택 수 스칼라가 없어 명부 파생값 폼으로 |
 *
 * 명부 행의 중과 칸(4호·8호·8호의2 · 배우자 보유 등)은 `buildOtherHousesPayload`가 이미 싣는다(두 본문 공통).
 */
import { buildOneHouseExemptionApiBody } from "./one-house-exemption-api";
import { buildHousesPayload } from "./transfer-tax-api-houses";
import { gracePeriodInScope } from "./grace-period-scope";
import { formatFieldErrors } from "./transfer-tax-error-format";
import { withDerivedHouseCount, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { toSurchargeSimulationPayload, type SurchargeSimulationInputForm } from "./surcharge-simulation-input";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";

export function buildMultiHouseSurchargeApiBody(form: OneHouseJudgmentFormData): { property: Record<string, unknown> } {
  const base = buildOneHouseExemptionApiBody(form);
  const primary = form.assets[0];
  const houses = buildHousesPayload(primary, form.houses, form.presaleRights.length, form.sellingHouseExclusion, form.transferDate, {
    includeSellingWithoutRoster: true,
  });
  return {
    property: {
      ...base,
      ...(houses ? { houses, sellingHouseId: "selling" } : {}),
      ...(gracePeriodInScope(withDerivedHouseCount(form)) && form.gracePeriod ? { gracePeriod: form.gracePeriod } : {}),
    },
  };
}

/**
 * ⑬ fetch — 판정 route envelope(`{ data }` · `{ error: { code, message, fieldErrors? } }`)는 1주택 판정과 같다.
 * `simulation`을 주면 같은 요청이 판정과 세부담 시뮬레이션(D3c)을 함께 돌려준다.
 */
export async function callMultiHouseSurchargeJudgmentAPI(
  form: OneHouseJudgmentFormData,
  simulation?: SurchargeSimulationInputForm,
): Promise<MultiHouseSurchargeJudgmentResponse> {
  const res = await fetch("/api/calc/multi-house-surcharge-judgment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...buildMultiHouseSurchargeApiBody(form),
      ...(simulation ? { simulation: toSurchargeSimulationPayload(simulation) } : {}),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (json as { error?: { message?: string; fieldErrors?: Record<string, string[]> } } | null)?.error;
    const message = error?.message ?? `HTTP ${res.status}`;
    if (error?.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
      throw new Error(formatFieldErrors(error.fieldErrors, message));
    }
    throw new Error(message);
  }
  return (json as { data: MultiHouseSurchargeJudgmentResponse }).data;
}
