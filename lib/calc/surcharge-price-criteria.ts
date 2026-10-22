/**
 * 다주택 중과 판정 메뉴 — 「소득세법 시행령」 §167의3①1호 가액기준(양도 당시 기준시가 3억 이하 불산입) 입력이
 * 판정을 가르는 범위. ⑤ 칸 노출·필수 표시와 ⑧ 차단이 **같은 술어**를 쓴다(계획서 §5.3 M1 · §5.9).
 *
 * 지역/가액 기준은 엔진(`resolveLowPriceLocalHouse`)과 같은 순서로 정한다: 법정동코드가 있으면 그 분류, 없으면
 * ④가 싣는 `region`(양도 주택은 `deriveHouseRegionFromCode` — 코드 없으면 지역기준).
 *
 * 🔴 기준시가를 비우면 ④가 0을 싣고, 엔진은 0을 「3억 이하」로 읽어 그 주택을 주택 수에서 빼고 양도 주택이면 중과도
 *    하지 않는다 — 모르는 사실이 납세자에게 유리하게 작동한다. 그래서 가액기준 주택은 값을 받는다.
 */
import { classifyRegionCriteriaByCode } from "@/lib/tax-engine/multi-house-surcharge-count";
import { judgmentSaleIsHousing, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

/** 명부 행이 가액기준인가 — `buildOtherHousesPayload`가 싣는 `regionCode`(10자리만)·`region`과 같은 입력으로 판정 */
export function houseRowIsValueCriteria(h: Pick<HouseEntry, "regionCode" | "region">): boolean {
  if (h.regionCode?.length === 10) return classifyRegionCriteriaByCode(h.regionCode) === "VALUE";
  return h.region !== "capital";
}

/** 양도 주택이 가액기준인가 — 코드가 없으면 지역기준(`deriveHouseRegionFromCode`) */
export function sellingHouseIsValueCriteria(form: Pick<OneHouseJudgmentFormData, "assets">): boolean {
  const code = form.assets?.[0]?.regionCode;
  return !!code && classifyRegionCriteriaByCode(code) === "VALUE";
}

/** M1 — 양도 주택의 양도 당시 기준시가가 필수인가(주택 양도 · 가액기준) */
export function sellingTransferStdPriceRequired(form: OneHouseJudgmentFormData): boolean {
  return judgmentSaleIsHousing(form) && sellingHouseIsValueCriteria(form);
}
