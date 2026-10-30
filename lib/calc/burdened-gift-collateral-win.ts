/**
 * 단건 부담부증여 — 상증법 증여가액 C와 그 승자(시가·보충적 / 담보 §66 / 임대 §61⑤). ⑧ 분모 · ⑤ 칸 노출 · ④ 숨김이 같은 leaf를 쓴다.
 *
 * 「상속세 및 증여세법」 제66조 — 저당권 설정 재산·전세권 등기 재산(임대보증금 포함)은 담보 채권액 기준 평가액과 제60조 평가액 중
 * **큰 금액**이 그 재산의 가액이다. 시가 모드에서도 담보평가가 이기면 증여가액은 담보평가액이고, 「소득세법 시행령」 제159조 제1항 제1호
 * 괄호(제66조 열거)에 따라 취득가액도 취득시 기준시가로 산정한다(엔진 `resolveBgAcquisitionBasis`).
 *
 * 종전 ⑧은 분모를 시가 입력값으로 둬, 담보평가액 = 인수 채무(채무비율 정확히 1)인 정당한 경우까지 「채무액이 증여가액 초과」로 막았다.
 * 같은 사실을 기준시가 모드로 넣으면 계산됐다(128,124,000) — 계획서 `docs/00-pm/burdened-gift-residuals-o3-o5-o8.plan.md` O-5.
 *
 * ## 범위 — 단독 소유(지분 100%)만
 *
 * 지분이 있으면 채무 입력 규약이 축마다 반대다(축 A 공유 소유 = 지분 인수분 · 축 B 지분 분할 = 물건 전체 후 ④가 안분). 자산 하나만으로는
 * 축을 가릴 수 없어 승자를 잘못 판정할 수 있으므로 `undefined`/`false`를 돌려 종전 처리(⑧ 시가 분모)를 유지한다. 함께 부담부증여 묶음은
 * 승자가 **섞이면** 막고(`bgBundleWinnersMixed` — 합산 증여가액 불일치), 지분·이월과세·입주권·겸용 자산의 비보충 승자는 이 범위 밖이라 따로 막는다
 * (`bgNonSupplementaryWinnerUnsupported`). 균일 승자(100% 소유)는 단건과 같은 판정·같은 분모를 쓴다.
 *
 * 값은 ④가 엔진에 싣는 info(`buildBurdenedGiftInfo`)를 엔진과 같은 경로(`companionBurdenedGiftValuations` — 지분 축소 → Max)로 계산한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { buildBurdenedGiftInfo, companionBurdenedGiftValuations, type CompanionBurdenedGiftValuation } from "./transfer-tax-api-burdened-gift";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";
import { bgAnyCarryover } from "./bg-carryover-parts";
import { BG_PAREN_MORTGAGE_66_FROM } from "@/lib/tax-engine/burdened-gift-valuation";

/** 단독 소유 단건의 증여가액 C(엔진 `giftValuation.max`)와 승자. 지분이 있으면 `undefined`(위 범위). */
export function bgWholeGiftValuation(asset: AssetForm): CompanionBurdenedGiftValuation | undefined {
  if (getOwnershipRatio(asset) < 1) return undefined;
  return companionBurdenedGiftValuations([buildBurdenedGiftInfo(asset)], [1])[0];
}

/**
 * 시가 모드에서 담보평가(§66)가 이겨 취득가액이 취득시 기준시가로 강제되는가 — 엔진 `resolveBgAcquisitionBasis`의
 * `collateralForcedStdInMarketMode`와 같은 조건이다(입주권 제외).
 *
 * 화면이 이 경우를 다루지 않는 자산은 `false`다 — ⑧이 따로 막는다:
 * - 겸용주택: 엔진 MB-7(담보평가를 주택·상가로 나눌 법정 기준 없음).
 * - 이월과세(§97의2): 취득가액이 당초 증여자의 값이라 담보 승과의 결합을 검토하지 않았다.
 * - 지분 보유: 위 범위.
 */
export function bgCollateralForcesStdAcq(asset: AssetForm): boolean {
  if (asset.transferType !== "burdened_gift" || asset.bgValuationMode !== "sangjeungbeop_market") return false;
  // 이월과세 — 일반건물은 토지·건물 중 한 파트라도(`bgAnyCarryover` · ⑧ 담보 승 차단과 같은 술어).
  if (asset.assetKind === "right_to_move_in" || bgAnyCarryover(asset)) return false;
  if (isMixedBurdenedGift(asset)) return false;
  return bgWholeGiftValuation(asset)?.selectedMode === "mortgage";
}

/**
 * 함께 부담부증여 묶음에서 **비보충 승자(담보 §66·임대 §61⑤)를 계산하지 않는** 자산인가 — 화면·엔진의 취득가액 처리를 확인하지 못한 범위다.
 * · 지분 보유: 승자 판정(`bgWholeGiftValuation`)과 ⑤ 칸 노출(`bgCollateralForcesStdAcq`)이 단독 소유만 다룬다.
 * · 이월과세 · 조합원입주권 · 겸용주택: 위 `bgCollateralForcesStdAcq` 주석과 같다.
 * 단건 ⑧의 담보 승 차단(`transfer-tax-validate-bg.ts`)보다 좁히지 않는다 — 묶음에서 풀리는 것은 이 범위 밖의 균일 승자뿐이다.
 */
export function bgNonSupplementaryWinnerUnsupported(asset: AssetForm): boolean {
  if (getOwnershipRatio(asset) < 1) return true;
  return asset.assetKind === "right_to_move_in" || bgAnyCarryover(asset) || isMixedBurdenedGift(asset);
}

/** `bgNonSupplementaryWinnerUnsupported`가 true인 이유 — ⑧ 안내 문구용. 판정 순서는 위 함수와 같다. */
export function bgUnsupportedWinnerReason(asset: AssetForm): string {
  if (getOwnershipRatio(asset) < 1) return "지분 보유";
  if (asset.assetKind === "right_to_move_in") return "조합원입주권";
  if (bgAnyCarryover(asset)) return "이월과세";
  return "겸용주택";
}

/**
 * 담보 승 취득가액 문구의 시기 단서 — §159①1호 괄호에 상증법 §66이 열거된 2023.2.28. 전 양도면 `true`.
 * 결과 화면 고지(`bgParenthesisEraNotice`)와 같은 경계다. 담보 승 판정(`bgCollateralForcesStdAcq`)이 이미 승자를 정했으므로
 * 여기서는 양도일만 본다. 양도일 미입력은 `false` — 결과 화면이 판정한다.
 */
export function bgCollateralParenEraUncertain(transferDate: string | undefined): boolean {
  return !!transferDate && transferDate < BG_PAREN_MORTGAGE_66_FROM.toISOString().slice(0, 10);
}

/** 위 경우 「(소령 §159①1호 괄호)」 인용 뒤에 붙이는 짧은 단서. 상세 안내는 부담부증여 블록 한 곳에서 한다. */
export const BG_COLLATERAL_PAREN_ERA_SUFFIX = " — 2023.2.28. 전 양도는 그 당시 괄호에 상증법 §66이 없어 확인이 필요합니다";
