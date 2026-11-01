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

/**
 * 입주권의 담보·임대 승이 양도일 당시 괄호 열거 시기에 드는가(승계·원조합원 공통 — 원조합원은 ⑧이 막는다).
 * `isFractionalSplit`은 `bgWholeGiftValuation`과 같은 3상태다. 양도일 미입력은 `false`(판정하지 않는다).
 */
export function bgRtmiParenEnumerated(asset: AssetForm, transferDate: string | undefined, isFractionalSplit?: boolean): boolean {
  if (asset.assetKind !== "right_to_move_in" || asset.transferType !== "burdened_gift" || !transferDate) return false;
  const mode = bgWholeGiftValuation(asset, isFractionalSplit)?.selectedMode;
  if (mode === "mortgage") return transferDate >= BG_PAREN_MORTGAGE_66_FROM.toISOString().slice(0, 10);
  if (mode === "rental") return transferDate >= BG_PAREN_RENTAL_61_5_FROM.toISOString().slice(0, 10);
  return false;
}

/** 승계 입주권 단건에서 취득가액이 입주권 기준시가로 강제되는가 — 이때만 ⑤가 취득일 기준시가 2칸을 열고 ⑧이 그 합 > 0을 요구한다. */
export function bgSuccessorRightStdForced(asset: AssetForm, transferDate: string | undefined, isFractionalSplit?: boolean): boolean {
  if (!isBgSuccessorRight(asset) || isFractionalSplit === true || getOwnershipRatio(asset) < 1) return false;
  return bgRtmiParenEnumerated(asset, transferDate, isFractionalSplit);
}
