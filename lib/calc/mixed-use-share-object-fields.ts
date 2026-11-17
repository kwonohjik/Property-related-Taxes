/**
 * 겸용주택 축 B 지분 카드 — **물건 단위 겸용 칸** 단일 소스(계획서 `bg-mixed-use-m2-bundle-share.plan.md` V-0 · 상가 선례 `commercial-share-object-fields.ts`).
 *
 * 같은 건물 · 같은 양도의 사실이라 전 지분이 자산 1 값을 쓴다 — 겸용 여부 · 면적(전용 · 공용 · 연면적 · 정착 · 토지 · 안분 지정) · 수도권 · 용도지역 ·
 * 양도시 기준시가(개별주택가격 · 상가건물 · ㎡당 공시지가 · 주택건물 나목). 지분 카드에는 ① 기본정보가 숨어 칸이 없다.
 * 양도가액 구분(§166⑧) · 건물 직접 양도비 · 감가상각비는 자산이 2건 이상이면 원래 받지 않는다(`mixed-use-sale-split-scope.ts`) — 목록에 넣지 않는다.
 * 병합하지 않던 동안 ④가 둘째 이후 지분을 **일반 주택**으로 보냈다(V-0 실측 −20,220,815).
 *
 * 취득 쪽 칸은 **넣지 않는다** — 지분마다 취득일 · 취득원인이 달라 취득시 기준시가 · 상속 · 증여 신고가액 · 파트별 취득 · 미공시(§164⑦) 값이 다르다.
 * 보유 중 일부 용도변경(§166⑥)은 지분 취득 시점마다 취득시 구성이 달라 축 B에서 받지 않는다(⑧ — `transfer-tax-validate-mixed-use-share.ts`).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export const MIXED_SHARE_OBJECT_FIELDS = [
  "isMixedUseHouse",
  "residentialExclusiveArea",
  "commercialExclusiveArea",
  "commonArea",
  "residentialFloorArea",
  "nonResidentialFloorArea",
  "buildingFootprintArea",
  "mixedUseTotalLandArea",
  "mixedResidentialLandAreaOverride",
  "mixedCommercialLandAreaOverride",
  "mixedResidentialFootprintOverride",
  "mixedTransferHousingPrice",
  "mixedTransferCommercialBuildingPrice",
  "mixedTransferLandPricePerSqm",
  "mixedTransferHousingBuildingStdPrice",
  "mixedIsMetropolitanArea",
  "mixedZoneType",
] as const satisfies readonly (keyof AssetForm)[];

/** 자산 1의 물건 단위 겸용 칸 값 — 병합 · 지분 카드 표시용. */
export function mixedUseShareObjectFieldsOf(primary: AssetForm): Pick<AssetForm, (typeof MIXED_SHARE_OBJECT_FIELDS)[number]> {
  return Object.fromEntries(MIXED_SHARE_OBJECT_FIELDS.map((k) => [k, primary[k]])) as Pick<AssetForm, (typeof MIXED_SHARE_OBJECT_FIELDS)[number]>;
}

/**
 * 겸용주택 부담부증여 × 축 B — **채무 귀속 · 주택분 구분 감정평가**도 물건 단위 값이다(M-2 PR-C · 계획서 §3.3.3 5).
 * 귀속은 한 증여계약 채무(임대보증금 · 담보차입금)의 사실이고, 구분 감정평가는 같은 물건 · 같은 증여일의 평가다. 지분 카드에는 ②가 숨어 칸이 없다 —
 * 병합하지 않으면 ⑧이 지분 카드에 「어디에 속하는지 선택하세요」를 내는 막다른 길이 된다. 지분 안분은 ④가 채무 칸과 같은 r로 항목별로 한다.
 * 겸용이 아닌 자산은 이 칸을 읽지 않는다(`isMixedBurdenedGift` 게이트) — 그래도 겸용일 때만 병합한다.
 */
export const MIXED_BG_SHARE_OBJECT_FIELDS = [
  "bgDepositAttribution",
  "bgDepositSplitHousing",
  "bgDepositSplitCommercial",
  "bgDepositSplitUnallocated",
  "bgMortgageAttribution",
  "bgMortgageSplitHousing",
  "bgMortgageSplitCommercial",
  "bgMortgageSplitUnallocated",
  "bgHousingAppraisalDeclared",
  "bgHousingAppraisalValue",
] as const satisfies readonly (keyof AssetForm)[];

/** 자산 1의 겸용 부담부증여 물건 단위 칸 — 자산 1이 겸용일 때만(아니면 빈 객체). */
export function mixedBgShareObjectFieldsOf(primary: AssetForm): Partial<Pick<AssetForm, (typeof MIXED_BG_SHARE_OBJECT_FIELDS)[number]>> {
  if (primary.isMixedUseHouse !== true) return {};
  return Object.fromEntries(MIXED_BG_SHARE_OBJECT_FIELDS.map((k) => [k, primary[k]])) as Pick<AssetForm, (typeof MIXED_BG_SHARE_OBJECT_FIELDS)[number]>;
}
