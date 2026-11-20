/**
 * 상가(상업용 건물 · 오피스텔) 축 B 지분 카드 — **물건 단위 칸** 단일 소스.
 *
 * 같은 물건 · 같은 양도의 사실이라 전 지분이 자산 1 값을 쓴다(면적 · 용도지역 · 무허가 · 양도시 가격). ④ · ⑧(`mergePrimaryBasic`)과
 * 지분 카드 ③ 표시(`CompanionAssetCard` 취득정보 자산)가 같은 목록을 쓴다 — 지분 카드에서는 이 칸들을 입력받지 않는다(자산 1에서 입력).
 *
 * 취득 쪽 칸(`cbPartAcq*` 포함 · 취득시 · 최초고시 ㎡당 호별고시가 · 건물 기준시가 · 최초고시 개별공시지가 · §164⑧ 준용 전기 합계 · 조정월수)은 **넣지 않는다** —
 * 지분마다 취득일이 달라(축 B는 지분별 취득일 · 취득원인) 환산(소득세법 시행령 §176조의2②2호)과 §164⑥(§163⑨ 단서 2호)의 「취득 당시」가
 * 지분마다 다르다. 종전(2026-09-03)에는 16칸 전부를 병합해 지분 카드의 취득 쪽 입력이 무시됐다 — 매매 지분 환산은 자산 1의 취득시
 * 호별고시가로 계산됐고, §164⑥ 상속 지분은 ⑧이 방금 넣은 칸을 「누락」으로 막았다(계획서 `docs/00-pm/commercial-share-acq-side-fields.plan.md`).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export const CB_SHARE_OBJECT_FIELDS = [
  "cbTotalLandArea",
  "cbTotalBuildingFootprintArea",
  "cbZoneType",
  "cbUnapprovedBuilding",
  "cbLandArea",
  "cbExclusiveArea",
  "cbSharedArea",
  "cbUnitPriceAtTransfer",
  "cbLandPricePerSqmAtTransfer",
  "cbBuildingStdPriceAtTransfer",
  // 초과분 토지·건물 구분 — 양도 당시 2값은 물건 단위(취득 당시 2값은 지분마다 달라 카드별 입력)
  "cbPartTransferLandStd",
  "cbPartTransferBuildingStd",
] as const satisfies readonly (keyof AssetForm)[];

/** 자산 1의 물건 단위 칸 값 — 병합 · 지분 카드 표시용. */
export function commercialShareObjectFieldsOf(primary: AssetForm): Pick<AssetForm, (typeof CB_SHARE_OBJECT_FIELDS)[number]> {
  return Object.fromEntries(CB_SHARE_OBJECT_FIELDS.map((k) => [k, primary[k]])) as Pick<AssetForm, (typeof CB_SHARE_OBJECT_FIELDS)[number]>;
}
