/**
 * 레거시 신축·미분양 단순 감면(`new_housing`·`unsold_housing` + 소재지) → 조문 ID 폼 이관.
 *
 * 레거시 타입은 엔진에서 「산출세액 × 50%·100%」 단순 감면으로 계산됐다. 다건 신고에서는 그 금액을 단건 세액
 * (기본공제 전)으로 구해 그대로 더해서, 차손을 받아 산출세액이 줄면 50%가 100%가 되고 자산별 배분 합이 감면액과
 * 어긋나며 농어촌특별세가 빠졌다(계획서 `transfer-90-1-reducible-income-after-loss-offset.plan.md` §6 재조사).
 * 현행 UI는 이 타입을 만들지 않으므로 입구(구 세션 · ④ · ⑫)를 닫는다.
 *
 * 이관 원칙은 레거시 장기임대(`legacy-rental-reduction.ts`)와 같다:
 *   · 조문은 이력(IndexedDB) 이관과 **같은 규칙**(`reclassifiedLegacyHousingType` — 취득일로 §99의3/§98의3)
 *   · 폼은 패널에서 그 조문을 새로 고른 것과 같은 기본값이다. 계약일·사용승인일·기준시가 등은 비어 있어
 *     ⑧이 사용자에게 묻는다 — 조용히 감면을 주지도, 조용히 없애지도 않는다.
 *   · 구 폼의 소재지(수도권 여부)는 새 조문의 지역 요건과 축이 달라 옮기지 않는다.
 *
 * 두 경로가 모두 이 함수를 쓴다:
 *   ① 폼-전역 구버전 세션 → `calc-wizard-migration.ts`
 *   ② 이미 레거시 타입이 들어 있는 자산 폼 → `calc-wizard-asset-migrate-rental-split.ts`
 */
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { reclassifiedLegacyHousingType } from "@/lib/storage/migrations/reduction-reclassification";

export const isLegacyHousingReductionType = (t: unknown): t is "new_housing" | "unsold_housing" =>
  t === "new_housing" || t === "unsold_housing";

export function legacyHousingReductionToForm(
  type: "new_housing" | "unsold_housing",
  acquisitionDate: unknown,
): Record<string, unknown> {
  const d = typeof acquisitionDate === "string" && acquisitionDate !== "" ? acquisitionDate : undefined;
  return { ...getReductionDefault(reclassifiedLegacyHousingType(type, d)) };
}
