/**
 * 일반건물 × 부담부증여 — 기준시가의 **쓰임**(평가 모드·취득가액 산정방식별) 안내 문구 (`GeneralBuildingBlock.tsx` 800줄 정책으로 분리 · PR-7b-6b).
 *
 * 엔진 분기(`burdened-gift-apportionment.ts` STEP 3 · `burdened-gift-acquisition.ts` STEP 4~5 · 파트별 3자 max `burdened-gift-part-pre-deemed.ts`)와 같은 축이다:
 *   · standard          — 양도시 합계 = 증여가액 보충적 평가, 취득가액 = 취득시 기준시가 × 채무비율
 *   · market_collateral — 담보평가(상증법 §66) 승: 산정방식과 무관하게 취득가액 = 취득시 기준시가 × 채무비율(§159①1호 괄호 · O-5)
 *   · market_actual     — 금액에는 안 쓰이고 토지·건물 **배분 비율**로만 쓰인다(양도가액·양도비 = 양도시 비율, 자본적지출 = 취득시 비율)
 *   · market_converted  — 환산취득가액 = 자산별 양도가액 × 취득시 ÷ 양도시 기준시가
 *   · market_presumed   — 매매사례가액·감정가액(K-6/K-7) × 채무비율. 취득시 기준시가는 **개산공제 base**로만 쓰인다
 *   · market_unset      — 산정방식 미선택(⑧이 막는다)
 * 의제취득일(1985.1.1.) 전 상속·증여 파트(시가 평가 · 담보 패)는 그 파트만 3자 max다(사용자 결정 Q-28) — `gbBgThreeWayParts`로 따로 본다.
 * 평가 모드 미선택("")은 ④가 기준시가 모드로 보낸다(`transfer-tax-api-burdened-gift.ts`).
 */
import { isBgPresumedMethod } from "./burdened-gift-presumed-acquisition";
import { bgCollateralForcesStdAcq, BG_COLLATERAL_PAREN_ERA_SUFFIX, bgCollateralParenEraUncertain } from "./burdened-gift-collateral-win";
import { gbBgThreeWayParts } from "./bg-pre-deemed-mode";
import { gbBgAcqStdBasis, gbBuildingPreDeemed } from "./gb-pre-deemed";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export type GbBgStdUse =
  | "standard"
  | "market_collateral"
  | "market_actual"
  | "market_converted"
  | "market_presumed"
  | "market_unset";

export function gbBgStdUseOf(asset: AssetForm): GbBgStdUse | null {
  if (asset.transferType !== "burdened_gift") return null;
  if (asset.bgValuationMode !== "sangjeungbeop_market") return "standard";
  if (bgCollateralForcesStdAcq(asset)) return "market_collateral";
  if (asset.bgAcquisitionMethod === "actual") return "market_actual";
  if (asset.bgAcquisitionMethod === "converted") return "market_converted";
  if (isBgPresumedMethod(asset.bgAcquisitionMethod)) return "market_presumed";
  return "market_unset";
}

const partsLabel = (p: { land: boolean; building: boolean }) => (p.land && p.building ? "토지·건물" : p.land ? "토지" : "건물");

/** ① 토지 공시지가 카드 머리 문구. 부담부증여가 아니면 null(호출부가 일반 문구를 쓴다). */
export function gbBgLandStdNote(asset: AssetForm, transferDate: string | undefined): string | null {
  const use = gbBgStdUseOf(asset);
  if (!use) return null;
  const parts = gbBgThreeWayParts(asset);
  if (parts.any) {
    return (
      `부담부증여(시가 모드 · 의제취득일 전 ${partsLabel(parts)}) — 양도시 비율로 증여가액(시가)을 토지·건물로 나눕니다. 의제취득일(1985.1.1.) 전에 상속·증여받은 파트의 취득가액은 ① 상증법 평가액, ② 취득시(의제취득일) 기준시가, ③ 그 파트 증여가액에 「취득시 기준시가를 양도시 기준시가로 나눈 비율」을 곱한 환산취득가액 중 큰 금액 × 채무비율입니다(소령 §159①1호·§176조의2④).` +
      (parts.all ? "" : " 다른 파트는 고른 취득가액 산정방식을 따릅니다.")
    );
  }
  switch (use) {
    case "standard":
      return "부담부증여(기준시가 모드) — 양도시 ① 토지 · ② 건물 기준시가 합계가 증여가액의 보충적 평가액이 되고, 양도시 비율로 양도가액을 토지·건물로 나눕니다. 취득가액은 취득시 기준시가 × 채무비율입니다.";
    case "market_collateral":
      return "부담부증여(시가 모드 · 담보평가 승) — 담보평가액이 시가보다 커서 증여가액이 담보평가액입니다(상증법 §66). 양도시 비율로 양도가액을 토지·건물로 나누고, 취득가액은 산정방식과 관계없이 취득시 기준시가 × 채무비율입니다(소령 §159①1호 괄호" + (bgCollateralParenEraUncertain(transferDate) ? BG_COLLATERAL_PAREN_ERA_SUFFIX : "") + ").";
    case "market_actual":
      return "부담부증여(시가 모드 · 실지취득가액) — 기준시가는 금액이 아니라 토지·건물 배분 비율로만 쓰입니다. 양도시 비율로 시가(양도가액)와 양도비를, 취득시 비율로 자본적지출을 나눕니다. 취득가액은 실지취득가액 × 채무비율입니다.";
    case "market_converted":
      return "부담부증여(시가 모드 · 환산취득가액) — 양도시 비율로 시가(양도가액)를 토지·건물로 나누고, 자산별 양도가액에 「취득시 기준시가를 양도시 기준시가로 나눈 비율」을 곱해 환산취득가액을 산정합니다.";
    case "market_presumed":
      return "부담부증여(시가 모드 · 매매사례가액·감정가액) — 양도시 비율로 시가(양도가액)를 토지·건물로 나눕니다. 취득가액은 입력한 매매사례가액·감정가액 × 채무비율이고, 취득시 기준시가는 개산공제의 기준으로만 쓰입니다.";
    case "market_unset":
      return "부담부증여(시가 모드) — ② 양도정보의 부담부증여 카드에서 취득가액 산정방식을 먼저 선택하세요. 선택에 따라 기준시가의 쓰임이 달라집니다.";
  }
}

/** 취득시 건물기준시가 칸 hint. 부담부증여가 아니면 null(호출부가 일반 hint를 쓴다). */
export function gbBgAcqBuildingHint(asset: AssetForm): string | null {
  const use = gbBgStdUseOf(asset);
  if (!use) return null;
  const basis = gbBgAcqStdBasis(gbBuildingPreDeemed(asset));
  if (gbBgThreeWayParts(asset).building) {
    return `${basis} 건물기준시가 총액. 의제취득일 전 건물은 이 금액이 ②(§164⑤ 가액)이자 ③(환산취득가액)의 분자이고, ③이 채택되면 이 금액 × 채무비율이 개산공제(§163⑥) 기준액입니다.`;
  }
  switch (use) {
    case "standard":
    case "market_collateral":
      return `${basis} 건물기준시가 총액. 이 금액 × 채무비율이 건물 취득가액이자 개산공제(§163⑥) 기준액입니다.`;
    case "market_actual":
      return `${basis} 건물기준시가 총액. 자본적지출을 토지·건물로 나누는 비율에만 쓰입니다 (취득가액은 실지취득가액 · 개산공제 미적용).`;
    case "market_converted":
      return `${basis} 건물기준시가 총액. 건물 환산취득가액 산정에 쓰이고, 이 금액 × 채무비율이 개산공제(§163⑥) 기준액입니다.`;
    case "market_presumed":
      return `${basis} 건물기준시가 총액. 취득가액에는 쓰이지 않고(입력한 매매사례가액·감정가액 × 채무비율), 이 금액 × 채무비율이 개산공제(§163⑥) 기준액입니다.`;
    case "market_unset":
      return `${basis} 건물기준시가 총액.`;
  }
}
