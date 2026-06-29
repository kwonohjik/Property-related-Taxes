/**
 * 양도세 자산 카드 — 단축 라벨 단일 출처.
 *
 * CompanionAssetCard 헤더(자산 N — {kindLabel})와 접기 섹션 요약(asset-section-summary.ts)이
 * 같은 라벨을 공유하도록 추출 (라벨 dual-truth 방지).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 자산 종류 단축 라벨 (헤더·요약 공용). */
export const ASSET_KIND_LABELS: Record<AssetForm["assetKind"], string> = {
  housing: "주택",
  land: "토지",
  building: "건물(토지 제외)",
  right_to_move_in: "입주권",
  presale_right: "분양권",
  commercial_building: "상업용건물·오피스텔",
  general_building: "일반건물(토지+건물 일괄)",
  redevelopment_apt: "재개발/재건축 APT",
};

/** 취득 원인 단축 라벨 (요약용). */
export const ACQUISITION_CAUSE_LABELS: Record<AssetForm["acquisitionCause"], string> = {
  purchase: "매매",
  inheritance: "상속",
  gift: "증여",
  carryover_gift: "이월과세(증여)",
  newConstruction: "신축(자가건축)",
  burdened_gift: "부담부", // @deprecated — transfer(양도)로 이관됨
};

/** 양도 형태 단축 라벨 (요약용, "" 미선택은 호출부에서 "regular" fallback). */
export const TRANSFER_TYPE_LABELS: Record<Exclude<AssetForm["transferType"], "">, string> = {
  regular: "일반 양도",
  burdened_gift: "부담부증여",
};
