/**
 * 축 B(같은 물건 지분 분할) × 부담부증여 — 의제취득일(1985.1.1.) 전 3자 max·의제취득일 기준시가 범위 밖 지분이 있는가 (PR-7b-5 · 사용자 결정 Q-34).
 *
 * 산정방식은 첫 카드에서 받고 지분 카드는 병합해 쓴다(④ `mergePrimaryBasic`). 지분마다 취득원인·날짜가 달라 범위가 지분별로 갈리는데,
 * 첫 카드가 범위 안이라는 이유만으로 산정방식 라디오를 숨기면 범위 밖 지분(매매 등)은 입력할 곳이 없거나(⑧이 요구 — 막다른 길)
 * 숨기기 전에 골라 둔 값이 그 지분 계산에 쓰였다(계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` B-3).
 * ⑧·④가 지분을 판정하는 단일 소스(`axisBEffectiveAsset`)와 같은 병합으로 판정한다.
 */
import { axisBEffectiveAsset } from "./axis-b-effective-asset";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { gbBgThreeWayParts } from "./bg-pre-deemed-mode";
import { mergePrimaryBasic } from "./transfer-tax-api-helpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function bgFractionalHasOutOfScopeShare(shares: readonly AssetForm[] | undefined): boolean {
  if (!shares) return false;
  const form = { assets: [...shares], assetSplitMode: "fractional" as const };
  return shares.some((_, i) => !isBgPreDeemedAsset(axisBEffectiveAsset(form, i)));
}

/**
 * 축 B × 일반건물 — 토지·건물이 모두 의제취득일 전(3자 max)이 아닌 지분이 있는가(PR-7b-6b · Q-34와 같은 규칙). 있으면 첫 카드가 두 파트 다
 * 의제취득일 전이어도 산정방식 라디오를 남겨 그 지분이 쓸 방식을 받는다 — ④⑧은 지분마다 `gbBgThreeWayParts`로 판정한다.
 */
export function gbBgFractionalHasPartialShare(shares: readonly AssetForm[] | undefined): boolean {
  if (!shares) return false;
  const form = { assets: [...shares], assetSplitMode: "fractional" as const };
  return shares.some((_, i) => !gbBgThreeWayParts(axisBEffectiveAsset(form, i)).all);
}

/**
 * 축 B × 일반건물 — 파트별로 「모든 지분에서 의제취득일 전(3자 max)」인가. 실지·추계 금액 칸은 첫 카드에서 받아 지분마다 병합되고(`mergePrimaryBasic`)
 * ⑧은 지분마다 자기 의제 파트가 아닌 쪽 칸을 요구한다 — 첫 카드는 모든 지분이 의제인 파트의 칸만 숨겨야 한다(리뷰 F-1 · PR-7b-6b).
 */
export function gbBgFractionalPreDeemedPartsAll(shares: readonly AssetForm[]): { land: boolean; building: boolean } {
  const form = { assets: [...shares], assetSplitMode: "fractional" as const };
  const parts = shares.map((_, i) => gbBgThreeWayParts(axisBEffectiveAsset(form, i)));
  return { land: parts.every((p) => p.land), building: parts.every((p) => p.building) };
}

/**
 * 축 B 지분 카드의 ③ 취득정보가 의제취득일 전 술어(`isBgPreDeemedAsset` 등)를 판정할 값 — 병합 결과가 범위 안이면 양도 형태·부담부증여
 * 평가 값(②에서만 편집 — 지분 카드는 ②가 숨는다)을 첫 카드 병합값으로 준다. 범위 밖이면 빈 객체(종전 그대로).
 * 종전에는 원본 카드(`transferType` "regular")로 판정해 기준시가 평가에서도 쓰이지 않는 ①·양도시 기준시가 칸이 떴다(계획서 D-3).
 * ③이 편집하는 값은 덮지 않는다 — 물건 수준 값을 지분 카드에서 고치는 경로를 열지 않는다(`CompanionAssetCard` `acquisitionAsset` 주석).
 */
export function bgPreDeemedShareJudgmentFields(share: AssetForm, primary: AssetForm): Partial<AssetForm> {
  const merged = mergePrimaryBasic(share, primary);
  // 일반건물은 파트별 3자 max(시가 평가 · PR-7b-6b)일 때 — 지분 카드의 ① 칸·안내가 같은 병합값으로 판정한다
  if (!isBgPreDeemedAsset(merged) && !gbBgThreeWayParts(merged).any) return {};
  return Object.fromEntries(
    Object.entries(merged).filter(([k]) => k === "transferType" || k.startsWith("bg")),
  ) as Partial<AssetForm>;
}
