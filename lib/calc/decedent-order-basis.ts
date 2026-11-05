/**
 * 「피상속인 취득일 < 상속개시일」 순서 검사의 **상속개시일** — ⑧(`getAssetDateOrderIssue`)과
 * ⑫(`transfer-tax-schema-refines.ts` 상속 분기)가 같은 기준을 쓰게 하는 단일 진실.
 *
 * 일반건물 · 토지·건물 취득일 분리(ON)에서 `acquisitionDate`는 **건물** 취득일이고, 토지 카드의 상속개시일은
 * `landAcquisitionDate`에 쓴다(`GeneralBuildingAcquisitionCards.tsx` — `fieldAcquisitionDate`). 이때 자산 취득원인은
 * 토지의 원인이라, 피상속인 취득일은 토지의 것이다 → 토지 상속개시일과 비교한다.
 * 그 밖(분리 OFF · 주택 · D2 건물만 상속)은 `acquisitionDate`가 곧 상속개시일이다.
 *
 * 계획서 `docs/02-design/features/expropriation-77-9-gb-d2.plan.md` D-1 — 종전엔 건물 취득일과 비교해
 * 「건물 취득일 ≤ 피상속인 취득일 < 토지 상속개시일」인 정상 입력을 ⑧·⑫ 모두 막았다.
 */
export function decedentOrderBasisDate(
  isGeneralBuildingSeparate: boolean,
  acquisitionDate: string | undefined,
  landAcquisitionDate: string | undefined,
): string | undefined {
  return isGeneralBuildingSeparate && landAcquisitionDate ? landAcquisitionDate : acquisitionDate;
}
