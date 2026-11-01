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
 * ## 범위 — 지분이 있으면 축을 아는 호출만, 종류는 주택만
 *
 * 지분이 있으면 채무 입력 규약이 축마다 반대다(축 A 공유 소유 = 지분 인수분 · 축 B 지분 분할 = 물건 전체 후 ④가 안분). 자산 하나만으로는
 * 축을 가릴 수 없으므로 `isFractionalSplit`를 **세 상태**로 받는다 — `true` 축 B(비율 1로 물건 전체 판정) · `false` 축 A(지분분 판정) ·
 * `undefined` 축 미지정(승자를 확정하지 않고 `undefined`/`false`를 돌려 종전처럼 막는다 — 호출처를 단계적으로 옮겨도 미전환 호출처가 침묵 오판정하지 않는다).
 * 지분 자산의 담보 승 취득가액(취득시 기준시가 × 채무비율 — ⑤ 칸·⑧ 요구·⑫ 요구)을 확인한 종류는 **주택**(이월과세·의제취득일 전 상속·증여·겸용 제외)뿐이다
 * (`bgFractionalCollateralKindSupported`) — 그 밖의 종류는 ⑧이 정확한 사유로 막는다. 함께 부담부증여 묶음은 승자가 **섞이면** 막는다
 * (`bgBundleWinnersMixed` — 합산 증여가액 불일치). 균일 승자는 단건과 같은 판정·같은 분모를 쓴다.
 *
 * 값은 ④가 엔진에 싣는 info(`buildBurdenedGiftInfo`)를 엔진과 같은 경로(`companionBurdenedGiftValuations` — 지분 축소 → Max)로 계산한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { buildBurdenedGiftInfo, companionBurdenedGiftValuations, type CompanionBurdenedGiftValuation } from "./transfer-tax-api-burdened-gift";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgAnyCarryover } from "./bg-carryover-parts";
import { BG_PAREN_MORTGAGE_66_FROM } from "@/lib/tax-engine/burdened-gift-valuation";

/**
 * 단건의 증여가액 C(엔진 `giftValuation.max`)와 승자. 지분이 있으면 축을 알아야 한다 — 축 미지정(`undefined`)은 `undefined`(위 범위).
 *
 * · `isFractionalSplit === true`(축 B — 같은 물건을 지분으로 나눠 취득): 지분이 있어도 **비율 1로 물건 전체**를 판정한다 — 축 B는 채무·시가를 물건 전체로 입력하고
 *   ④가 채무를 지분율로 줄여 보내며 엔진이 시가를 같은 비율로 줄여 비교하므로(`scaleBurdenedGiftInfo`) 승자는 물건 전체 판정과 같다
 *   (실측: 60/40 카드 모두 엔진 승자와 일치 — `bg-axis-b-mkt-collateral-win.plan.md`). 카드 하나를 지분 비율로 줄여 판정하면 틀린다 — 40% 카드는 채무 6억 > 지분 시가 4억이라
 *   담보 승으로 읽히지만 엔진은 보충 승이다.
 * · `isFractionalSplit === false`(축 A — 공유 소유): 채무가 본인 인수분이므로 **지분분**으로 판정한다(엔진과 같은 경로 — 지분 축소 → Max).
 */
export function bgWholeGiftValuation(asset: AssetForm, isFractionalSplit?: boolean): CompanionBurdenedGiftValuation | undefined {
  const ratio = getOwnershipRatio(asset);
  if (ratio >= 1 || isFractionalSplit === true) return companionBurdenedGiftValuations([buildBurdenedGiftInfo(asset)], [1])[0];
  if (isFractionalSplit === false) return companionBurdenedGiftValuations([buildBurdenedGiftInfo(asset)], [ratio])[0];
  return undefined;
}

/**
 * 지분 자산(축 A·B)에서 담보·임대 승의 취득가액 처리(취득시 기준시가 × 채무비율 — ⑤ 칸·⑧ 요구·⑫ 요구)를 **확인한 범위**.
 * 주택(`housing`)만이다 — 이월과세·의제취득일 전 상속·증여는 교차를 측정하지 않았고, 토지·일반건물·재개발·입주권·겸용은 종류별 격자를 측정하지 않았다
 * (계획서 `bg-nonsupp-winner-support.plan.md` V-S1·V-S4). 범위 밖은 ⑧이 막는다(`bgSplitAxisCollateralWinUnsupported` · `bgFractionalCollateralWin`).
 */
export function bgFractionalCollateralKindSupported(asset: AssetForm): boolean {
  return asset.assetKind === "housing" && !isBgPreDeemedAsset(asset) && !bgAnyCarryover(asset) && !isMixedBurdenedGift(asset);
}

/** 축 B 카드에서 시가 모드 담보평가(§66)가 이기는데 취득가액 처리를 확인하지 못한 종류인가 — ⑧ 차단용(거짓 사유 「채무액 초과」 대체). */
export function bgSplitAxisCollateralWinUnsupported(asset: AssetForm): boolean {
  if (asset.transferType !== "burdened_gift" || asset.bgValuationMode !== "sangjeungbeop_market") return false;
  if (bgFractionalCollateralKindSupported(asset)) return false;
  return bgWholeGiftValuation(asset, true)?.selectedMode === "mortgage";
}

/**
 * 지분을 가진 자산(축 A 공유 소유 — 채무는 본인 인수분)에서 시가 모드 담보평가(§66)가 이기는가. 이기면 그 증여가액 C는 담보평가액이다.
 * 지분 자산의 담보 승은 채무 합계가 항상 시가 해당분보다 커서 ⑧의 「채무액이 증여가액 초과」 검사에 걸리므로, 확인하지 못한 종류(`bgFractionalCollateralKindSupported`가 false)는
 * 그 틀린 사유 대신 이 판정으로 정확히 막는다. 주택은 계산한다 — 취득가액 = 취득시 기준시가 × 지분 × 채무비율(엔진 `resolveBgAcquisitionBasis`)을 ⑤ 칸·⑧·⑫가 같은 술어로 다룬다.
 * 축 B(지분 분할 취득)는 호출자가 거른다 — 물건 전체 입력이라 이 승자 판정이 맞지 않는다.
 */
export function bgFractionalCollateralWin(asset: AssetForm): boolean {
  if (asset.transferType !== "burdened_gift" || asset.bgValuationMode !== "sangjeungbeop_market") return false;
  return getOwnershipRatio(asset) < 1 && bgWholeGiftValuation(asset, false)?.selectedMode === "mortgage";
}

/**
 * 시가 모드에서 담보평가(§66)가 이겨 취득가액이 취득시 기준시가로 강제되는가 — 엔진 `resolveBgAcquisitionBasis`의
 * `collateralForcedStdInMarketMode`와 같은 조건이다(입주권 제외).
 *
 * 이월과세(§97의2)도 포함한다 — 두 시나리오 모두 취득시 기준시가 × 채무비율이라(A = 당초 증여자 · B = 양도인) 기준시가 모드와 같은 칸·같은 검증을 쓴다
 * (`bg-carryover-mkt-collateral-win.plan.md`).
 *
 * 화면이 이 경우를 다루지 않는 자산은 `false`다 — ⑧이 따로 막는다:
 * - 겸용주택: 엔진 MB-7(담보평가를 주택·상가로 나눌 법정 기준 없음).
 * - 지분 보유: **주택**만(`bgFractionalCollateralKindSupported`). 축을 `isFractionalSplit`로 넘겨야 한다 — 축 B `true`(물건 전체 판정) · 축 A `false`(지분분 판정) ·
 *   미지정 `undefined`면 지분 자산은 `false`(종전 — 승자를 확정하지 않는다).
 */
export function bgCollateralForcesStdAcq(asset: AssetForm, isFractionalSplit?: boolean): boolean {
  if (asset.transferType !== "burdened_gift" || asset.bgValuationMode !== "sangjeungbeop_market") return false;
  if (asset.assetKind === "right_to_move_in") return false;
  if (isMixedBurdenedGift(asset)) return false;
  // 지분 자산은 확인한 범위(주택)만 — 그 밖은 false로 두고 ⑧이 `bgSplitAxisCollateralWinUnsupported`·`bgFractionalCollateralWin`으로 먼저 막는다.
  if ((isFractionalSplit === true || getOwnershipRatio(asset) < 1) && !bgFractionalCollateralKindSupported(asset)) return false;
  return bgWholeGiftValuation(asset, isFractionalSplit)?.selectedMode === "mortgage";
}

/**
 * 함께 부담부증여 묶음에서 **비보충 승자(담보 §66·임대 §61⑤)를 계산하지 않는** 자산인가 — 화면·엔진의 취득가액 처리를 확인하지 못한 범위다.
 * · 지분 보유: 주택(이월과세·의제취득일 전 상속·증여·겸용 제외)만 계산한다 — 기준시가 모드는 임대·담보, 시가 모드는 담보 승이 모두 취득가액 = 취득시 기준시가 × 지분 × 채무비율이다
 *   (균일 승자 묶음의 ⑫ 값은 자산별 단건 지분 실행의 합과 ±0 — `bg-axis-a-nonsupp-win.plan.md`). 그 밖의 종류는 확인하지 못해 막는다.
 * · 조합원입주권 · 겸용주택: 위 `bgCollateralForcesStdAcq` 주석과 같다. 단 묶음 게이트는 지분 100% 입주권을 `bgRtmiBundleWinnerComputable`로 걸러 푼다(X-1 — 이 함수는 «입주권이면 true»로 둔다).
 * · 이월과세는 막지 않는다 — 기준시가 모드는 임대·담보 승(1단계), 시가 모드는 담보 승(2단계)이 모두 취득가액 = 취득시 기준시가 × 채무비율이라
 *   (A = 당초 증여자 · B = 양도인) 균일 승자 묶음의 ⑫ 값이 단건 합·오라클과 맞는다(`bg-carryover-std-uniform-bundle.plan.md` · `bg-carryover-mkt-collateral-win.plan.md`).
 *   시가 모드의 임대 승은 존재하지 않는다(엔진 `computeSangjeungbeopValuation` — 임대 환산은 시가가 없을 때만 비교).
 */
export function bgNonSupplementaryWinnerUnsupported(asset: AssetForm): boolean {
  if (getOwnershipRatio(asset) < 1) return !bgFractionalCollateralKindSupported(asset);
  return asset.assetKind === "right_to_move_in" || isMixedBurdenedGift(asset);
}

/** `bgNonSupplementaryWinnerUnsupported`가 true인 이유 — ⑧ 안내 문구용. 입주권·겸용을 지분 여부보다 먼저 가른다(원인이 지분이 아니다). */
export function bgUnsupportedWinnerReason(asset: AssetForm): string {
  if (asset.assetKind === "right_to_move_in") return "조합원입주권";
  if (isMixedBurdenedGift(asset)) return "겸용주택";
  return "지분 보유";
}

/**
 * `bgNonSupplementaryWinnerUnsupported`가 true인 자산을 막는 **실제 사유** — ⑧ 안내 문구용(엔진 중단 사유와 같은 말).
 * · 조합원입주권: 괄호가 취득가액을 입주권 기준시가(소령 §165①)로 정하는 시기의 담보·임대 승 — 승계 단건만 계산하고(`bg-rtmi-std-acq.ts`), 원조합원은 질의 H-2 대기,
 *   묶음·지분은 확인하지 못했다(엔진 `burdened-gift-apportionment.ts`).
 * · 겸용주택: 담보·임대 평가액을 주택과 상가로 나눌 법정 기준이 없어 보충적평가·시가인 단독 소유 단건만 계산한다(엔진 MB-7 · 함께 양도는 MB-6).
 * · 지분 보유(주택 외): 취득가액 처리를 확인한 종류가 주택뿐이다. 뒤 문장은 사유별 조치 안내다.
 */
/** 원조합원 입주권 담보·임대 승 차단 사유 — 취득시 입주권 기준시가의 정의가 불명확하다(질의 H-2 대기). 승계는 I-1이 계산한다(`bg-rtmi-std-acq.ts`). */
export const BG_RTMI_ORIGINAL_CAUSE =
  "원조합원 입주권의 기준시가(「소득세법 시행령」 제165조 제1항 — 취득일까지 납입한 금액과 취득일 현재의 프리미엄)는 「취득일」과 「납입한 금액」에 종전 부동산 평가액·청산금을 포함하는지가 정해지지 않아 계산하지 않습니다. 담보 설정액·임대 보증금 입력을 재확인해 증여재산 평가가 보충적평가(기준시가) 또는 시가가 되게 하세요.";

/** 승계 입주권은 양도일을 알아야 계산 대상인지(괄호 열거 시기) 판정한다 — 양도일 미입력 상태의 사유(양도일 필수 검증이 따로 지적한다). */
export const BG_RTMI_SUCCESSOR_DATE_CAUSE =
  "승계 조합원입주권의 담보·임대 평가는 양도일에 따라 취득가액(입주권 기준시가 또는 실지)이 달라져 양도일을 입력해야 계산 여부를 판정합니다.";

export function bgUnsupportedWinnerCause(asset: AssetForm): string {
  if (asset.assetKind === "right_to_move_in") return asset.isSuccessorRightToMoveIn === true ? BG_RTMI_SUCCESSOR_DATE_CAUSE : BG_RTMI_ORIGINAL_CAUSE;
  if (isMixedBurdenedGift(asset))
    return "겸용주택 부담부증여는 단독 소유 단건만 계산하며, 담보·임대로 평가되는 경우 증여가액을 주택과 상가로 나눌 법정 기준이 없어 계산하지 않습니다. 담보 설정액·임대 보증금 입력을 재확인해 증여재산 평가가 보충적평가(기준시가) 또는 시가가 되게 하세요.";
  return "지분을 가진 자산의 담보·임대 평가에서 이 경우의 취득가액(「소득세법 시행령」 제159조 제1항 제1호 괄호 — 취득시 기준시가 × 채무비율)은 주택(이월과세·의제취득일 전 상속·증여 제외)만 계산합니다. 담보 설정액·임대 보증금 입력을 재확인해 증여재산 평가가 보충적평가(기준시가) 또는 시가가 되게 하세요.";
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
