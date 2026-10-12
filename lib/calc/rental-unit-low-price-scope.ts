/**
 * 임대 호의 「거주주택 양도일 현재 기준시가」 칸 범위 — ⑤(노출)·④(전송)가 같은 술어를 쓴다(3중 패턴).
 *
 * 영 §167의3①1호는 「수도권 및 광역시·특별자치시(…군·읍·면 제외) 외의 지역」(가액기준 지역)의 주택만 양도 당시
 * 기준시가 3억 이하이면 주택 수에서 뺀다. 소재지 주소로 법정동코드를 얻어 가액기준 지역일 때만 묻는다 — 엔진과 같은
 * 지역 분류(`classifyRegionCriteriaByCode`)다. 주소가 없으면 묻지 않는다(엔진은 모름 = 산입 + 확인 필요 고지).
 */
import { classifyRegionCriteriaByCode } from "@/lib/tax-engine/multi-house-surcharge-count";

export function rentalUnitLowPriceInScope(unit: { regionCode?: string }): boolean {
  const code = unit.regionCode ?? "";
  return code.length >= 10 && classifyRegionCriteriaByCode(code) === "VALUE";
}
