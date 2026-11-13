/**
 * ⑧ 부담부증여 × 토지·건물 소유자 분리 — 본인 몫(증여한 부분) 필수 입력 (계획서 `docs/00-pm/bg-owner-split-159.plan.md` §7 · Q-2 a · Q-3 a · Q-4).
 *
 * 엔진은 본인 몫만 받는다(`burdened-gift-owner-split.ts` — 비소유 파트 0). 화면(⑤ `BurdenedGiftOwnerSplitCard`)이 여는 칸 = ④(`bgOwnerSplitInfoPatch`)가 싣는 칸 =
 * 여기서 요구하는 칸이다(술어 `bgOwnerSplitActive` 하나). 범위 밖 사유는 이 함수가 아니라 `validateSplitDirectInputs`가 막는다.
 *
 * 요구하는 것(자동 안분 fallback 금지 — 비어 있으면 그 칸으로 보낸다):
 *  1. 채무가 증여자 본인 채무이고 증여한 부분에만 관련된다는 확인(공동담보는 입력 칸이 없어 계산하지 않는다 · Q-3 a).
 *  2. 시가 평가: 증여한 부분의 양도시 시가(`bgMarketValueOwnedPart`) — 총액 칸으로 대신하지 않는다.
 *  3. 증여한 부분의 양도시 기준시가 — 기준시가 평가의 증여가액 C, 시가 평가 × 환산의 분모일 때만(`bgOwnerSplitNeedsTransferStd` — 엔진 계약·⑫·⑤와 같은 술어).
 *     시가 평가 × 실지취득가액은 쓰지 않으므로 요구하지 않는다(쓰이지 않는 값을 지어 적게 하지 않는다).
 *  4. 증여한 부분의 취득시 기준시가 — 취득가액이 기준시가 × 채무비율이거나 환산·담보 승으로 이 값을 읽을 때(`bgAcqStdPriceNeededBase`).
 * 토지만 본인의 토지 취득일은 일반 소유자 분리와 같은 규칙이다(Q-8 — `separateLandDateRequired`가 ⑤ 표시·⑧을 함께 정한다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { bgAcqStdPriceNeededBase } from "./burdened-gift-acq-std-price";
import { bgOwnerSplitAcqStd, bgOwnerSplitTransferStd } from "./bg-owner-split-info";
import { bgOwnerSplitActive, bgOwnerSplitOwnedPart, bgOwnerSplitTransferStdNeeded, bgOwnerSplitUnsupported } from "./bg-owner-split-scope";
import { fieldError } from "./transfer-tax-validate-field";

/** `bundled` — 함께 부담부증여 묶음·지분 분할 자산이다(호출부가 안다). 범위 밖 사유는 본인 몫 입력 요구보다 먼저 그 칸(소유자 분리 토글)으로 보낸다. */
export function validateBgOwnerSplit(asset: AssetForm, label: string, bundled = false): string | null {
  const unsupported = bgOwnerSplitUnsupported(asset, { bundled });
  if (unsupported) return fieldError("selfOwns", `${label}: ${unsupported}`);
  if (!bgOwnerSplitActive(asset)) return null;
  const part = bgOwnerSplitOwnedPart(asset);
  const name = part === "land" ? "토지" : "건물";
  const market = asset.bgValuationMode === "sangjeungbeop_market";

  if (!asset.bgOwnerSplitDebtConfirmed)
    return fieldError(
      "bgOwnerSplitDebtConfirmed",
      `${label}: 인수한 채무(임대보증금 포함)가 증여자 본인 채무이고 증여한 ${name}에만 관련된다는 것을 확인하세요 — 타인 소유 부분과 함께 담보로 설정한 채무는 증여한 부분만의 담보평가액으로 안분해야 하는데 입력 칸이 없어 계산하지 않습니다(상속세 및 증여세법 시행령 §63①2호).`,
    );

  if (market && !(parseAmount(asset.bgMarketValueOwnedPart) > 0))
    return fieldError("bgMarketValueOwnedPart", `${label}: 부담부증여 시가 모드 — 증여한 ${name}분의 양도시 시가 평가액을 입력하세요. 평가액·증여가액은 증여한 자산의 값입니다 (소득세법 시행령 §159①).`);

  if (bgOwnerSplitTransferStdNeeded(asset) && !(part === "land" ? bgOwnerSplitTransferStd(asset).land : bgOwnerSplitTransferStd(asset).building)) {
    const field = part === "land" ? (parseAmount(asset.standardPricePerSqmAtTransfer) > 0 ? "transferArea" : "standardPricePerSqmAtTransfer") : "buildingStandardPriceAtTransfer";
    return fieldError(
      field,
      `${label}: 토지·건물 소유자가 다르면 증여한 ${name}분의 평가액으로 계산합니다 — 양도시 ${name} 기준시가${part === "land" ? "(개별공시지가 × 면적)" : ""}를 입력하세요 (소득세법 시행령 §159①·소득세법 §99①1호).`,
    );
  }

  if (bgAcqStdPriceNeededBase(asset) && !(part === "land" ? bgOwnerSplitAcqStd(asset).land : bgOwnerSplitAcqStd(asset).building)) {
    const field = part === "land" ? (parseAmount(asset.standardPricePerSqmAtAcq) > 0 && !(parseDecimal(asset.acquisitionArea) > 0) ? "acquisitionArea" : "standardPricePerSqmAtAcq") : "buildingStandardPriceAtAcq";
    return fieldError(
      field,
      `${label}: 토지·건물 소유자가 다르면 증여한 ${name}분의 취득 당시 기준시가로 취득가액을 정합니다 — 취득시 ${name} 기준시가${part === "land" ? "(취득 당시 개별공시지가 × 면적)" : ""}를 입력하세요 (소득세법 시행령 §159①1호·§164③).`,
    );
  }
  return null;
}
