/**
 * 부담부증여 — ④ 자본적지출·양도비 칸이 세액에 쓰이지 않는가 (화면 게이트 · 요약 칩 공용 단일 출처).
 *
 * 취득가액을 기준시가로 산정하면(「소득세법 시행령」 §159①1호 괄호) 또는 감정가액·매매사례가액이면 필요경비는
 * 개산공제(시행령 §163⑥)뿐이다. 「소득세법」 §97②2호 단서의 자본적지출·양도비 택일은 환산취득가액 전용이다.
 * 엔진 근거: `burdened-gift-apportionment.ts`(K-1~K-3·K-6/K-7은 개산공제만, 단서는 `converted`만) ·
 * `mixed-use-burdened-gift.ts`(겸용도 같은 갈래). 계획서 `docs/00-pm/burdened-gift-expense-notice-and-redev-card.plan.md`.
 *
 * 칸을 남기는(null) 경우 — 엔진이 쓰거나, 숨기면 막다른 길이 되는 경로:
 *  · 원조합원 입주권(실지취득가액 고정) · 재개발 완공 아파트(§166 경로가 필요경비를 따로 붙인다)
 *  · 토지·건물 분리 — ⑧ 분리 검증이 자산 단위 자본적지출을 파트 칸으로 보낸다(`isSplitValidationActive`)
 *  · 이월과세 — 양도인 평가액 박스가 실지취득가액 경로로 자본적지출을 받는다
 *  · 시가 모드 담보평가 승 — ⑧이 먼저 막아 화면에서 계산까지 가지 못한다(계획서 §1.4). 판정하지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isBgPresumedMethod } from "./burdened-gift-presumed-acquisition";
import { isSplitValidationActive } from "./transfer-tax-validate-split";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";

/** 취득가액 산정 근거 — 안내 문구가 그 이름으로 말한다. 칸이 쓰이면 null. */
export function bgExpenseUnusedBasis(asset: AssetForm): "기준시가" | "감정가액" | "매매사례가액" | null {
  if (asset.transferType !== "burdened_gift") return null;
  if (asset.assetKind === "right_to_move_in" || asset.assetKind === "redevelopment_apt") return null;
  if (asset.acquisitionCause === "carryover_gift") return null;
  if (isSplitValidationActive(asset)) return null;
  // 평가 모드 미선택은 ④가 기준시가 모드로 보낸다(`buildBurdenedGiftInfo` — `bgValuationMode || "sangjeungbeop_standard"`).
  // 시가 모드여도 담보평가(상증법 §66)가 이기면 취득가액이 취득시 기준시가로 강제된다(§159①1호 괄호 · 엔진 `acqStdPriceForced`) — 개산공제뿐(O-5).
  if (asset.bgValuationMode !== "sangjeungbeop_market" || bgCollateralForcesStdAcq(asset)) return "기준시가";
  // 의제취득일 전 상속·증여 토지·주택(시가) — 산정방식 대신 ①②③ 중 큰 금액이다. ①②면 실제 필요경비, ③이면 §97②2호 단서 비교에 쓴다(계획서 §18).
  if (isBgPreDeemedAsset(asset)) return null;
  if (!isBgPresumedMethod(asset.bgAcquisitionMethod)) return null;
  return asset.bgAcquisitionMethod === "appraisal" ? "감정가액" : "매매사례가액";
}

export function bgExpenseInputsUnused(asset: AssetForm): boolean {
  return bgExpenseUnusedBasis(asset) !== null;
}
