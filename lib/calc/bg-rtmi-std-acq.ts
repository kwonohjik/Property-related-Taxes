/**
 * 조합원입주권 부담부증여 — 담보(§66)·임대(§61⑤) 승에서 §159①1호 A 괄호가 취득가액을 **입주권 기준시가**로 정하는 경우의 판정 (I-1).
 * ⑤ 칸 노출 · ⑧ 요구/차단 · ⑥ 사이드바 · ⑦ 결과가 같은 leaf를 쓴다(계획서 `docs/00-pm/bg-successor-rtmi-std-acq.plan.md`).
 *
 * 괄호는 양도가액을 상증법 §61①·②·⑤ 및 §66으로 산정한 경우 취득가액도 기준시가로 정한다 — 담보(§66)는 양도일 2023.2.28.부터, 임대(§61⑤)는 2020.2.11.부터 열거된다.
 * 입주권 평가 자체는 §61③(열거 밖)이라 보충적평가 승은 해당 없다(취득가액 = 실지). 입주권의 기준시가는 소령 §165①(취득일까지 납입한 금액 + 취득일 현재 프리미엄)이다.
 *
 * 승계조합원만 계산한다 — 두 값이 명확하다. 원조합원은 「취득일」·「납입한 금액」의 범위(종전 부동산 평가액·청산금 포함 여부)가 불명확해 질의 H-2 회신 전에는 막는다.
 * 지분·축 B·함께 양도 묶음은 이 단계에서 열지 않는다(승계 입주권 단건만).
 *
 * 엔진 `rtmiParenEnumerated`(`burdened-gift-valuation.ts`)와 **같은 경계**다 — 날짜는 ISO 문자열 비교(양도일 칸의 원값).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { BG_PAREN_MORTGAGE_66_FROM, BG_PAREN_RENTAL_61_5_FROM } from "@/lib/tax-engine/burdened-gift-valuation";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { bgWholeGiftValuation } from "./burdened-gift-collateral-win";
import { isBgSuccessorRight } from "./transfer-successor-right";

/** 담보·임대 승이 양도일 당시 §159①1호 A 괄호의 열거 시기에 드는가 — 날짜는 ISO 문자열 비교(양도일 칸의 원값). */
function parenEraStarted(mode: "mortgage" | "rental", transferDate: string): boolean {
  return transferDate >= (mode === "mortgage" ? BG_PAREN_MORTGAGE_66_FROM : BG_PAREN_RENTAL_61_5_FROM).toISOString().slice(0, 10);
}

/**
 * 입주권의 담보·임대 승이 양도일 당시 괄호 열거 시기에 드는가(승계·원조합원 공통 — 원조합원은 ⑧이 막는다).
 * `isFractionalSplit`은 `bgWholeGiftValuation`과 같은 3상태다. 양도일 미입력은 `false`(판정하지 않는다).
 */
export function bgRtmiParenEnumerated(asset: AssetForm, transferDate: string | undefined, isFractionalSplit?: boolean): boolean {
  if (asset.assetKind !== "right_to_move_in" || asset.transferType !== "burdened_gift" || !transferDate) return false;
  const mode = bgWholeGiftValuation(asset, isFractionalSplit)?.selectedMode;
  return (mode === "mortgage" || mode === "rental") && parenEraStarted(mode, transferDate);
}

/**
 * 축 A 공유 지분(지분 < 1) 입주권의 담보·임대 승을 ⑧이 계산 대상으로 두는가 (X-2) — 지분 자산의 「주택만」 차단(`bgFractionalCollateralKindSupported`)에서 입주권을 거른다.
 * **승계만**(열거 이전·이후 모두): 열거 이후는 취득가액 = 입주권 기준시가 × 지분 × 채무비율, 열거 이전은 실지 × 지분 × 채무비율이며 손계산과 맞는다
 * (`docs/00-pm/bg-successor-rtmi-axis-a-share.plan.md`). 원조합원은 열거 이후는 H-2 대기, 열거 이전은 청산금이 지분만큼 줄지 않는 것으로 측정돼(입력 규약 불명) 막는다.
 * 양도일 미입력은 `false`(막는다 — 양도일 필수 검증이 따로 지적한다).
 */
export function bgRtmiShareWinnerComputable(asset: AssetForm, transferDate: string | undefined): boolean {
  return asset.assetKind === "right_to_move_in" && getOwnershipRatio(asset) < 1 && !!transferDate && isBgSuccessorRight(asset);
}

/**
 * 함께 양도 묶음 ⑧ 승자 게이트(`transfer-tax-validate.ts`)가 입주권의 비보충 승을 **막지 않는** 경우 (X-1).
 * 게이트는 묶음의 승자 `mode`(담보·임대)를 이미 정했으므로 자산 단독 판정이 아니라 그 값을 받는다.
 * · 지분 100%이거나 축 A 공유 지분 승계 입주권(X-2). 묶음은 축 B가 아니다(게이트가 `!fullFractional`로 걸러 들어온다).
 * · 열거 이전: 취득가액이 실지라 승계·원조합원 모두 계산한다(엔진 값이 단건 합과 ±0 — `bg-successor-rtmi-extend-measure.md` C2·D1).
 * · 열거 이후: 승계만 — 취득시 기준시가 2칸은 자산별 (5-c‴)이 요구한다. 원조합원은 질의 H-2 대기라 막는다.
 * 양도일 미입력은 `false`(막는다 — 양도일 필수 검증이 따로 지적한다).
 */
export function bgRtmiBundleWinnerComputable(asset: AssetForm, mode: "mortgage" | "rental", transferDate: string | undefined): boolean {
  if (asset.assetKind !== "right_to_move_in" || !transferDate) return false;
  // 묶음은 축 B가 아니라 공유 지분 자산(축 A)만 지분을 가진다 — 승계만 푼다(X-2 `bgRtmiShareWinnerComputable`).
  if (getOwnershipRatio(asset) < 1) return bgRtmiShareWinnerComputable(asset, transferDate);
  return !parenEraStarted(mode, transferDate) || isBgSuccessorRight(asset);
}

/**
 * 승계 입주권에서 취득가액이 입주권 기준시가로 강제되는가 — 이때만 ⑤가 취득일 기준시가 2칸을 열고 ⑧이 그 합 > 0을 요구한다.
 * 지분 100%(단건·함께 양도 묶음)와 **축 A 공유 지분**(X-2 — `isFractionalSplit === false`로 축을 알릴 때만)을 푼다. 축 B(같은 물건 지분 분할, `true`)는 X-3 전까지 `false`이고,
 * 지분 < 1에 축을 모르면(`undefined`) 승자를 정하지 못해 `false`다(`bgWholeGiftValuation` fail-closed).
 * 지분이 있으면 취득가액 = 입주권 기준시가 × 지분 × 채무비율이다(엔진 `resolveBgAcquisitionBasis` — 기준시가 2칸은 물건 전체 값을 입력한다).
 */
export function bgSuccessorRightStdForced(asset: AssetForm, transferDate: string | undefined, isFractionalSplit?: boolean): boolean {
  if (!isBgSuccessorRight(asset) || isFractionalSplit === true) return false;
  return bgRtmiParenEnumerated(asset, transferDate, isFractionalSplit);
}
