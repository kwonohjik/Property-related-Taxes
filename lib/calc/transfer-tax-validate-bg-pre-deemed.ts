/**
 * ⑧ 의제취득일(1985.1.1.) 전 상속·증여 토지·주택 × 부담부증여 (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18).
 *
 * · 기준시가 평가(§159①1호 괄호 · Q-25) — 취득가액 = 의제취득일 기준시가 × 채무비율. 그 기준시가가 없으면 엔진이 400을 낸다
 *   (`burdened-gift-apportionment.ts`) → 같은 판정(④ payload에 의제취득일 기준시가 원천이 실리는가)으로 먼저 막는다.
 * · 시가 평가(Q-24) · 증여 — ①(증여 신고가액)이 필수다(사용자 결정 Q-14와 같다). 상속은 E-1(①② 또는 「확인할 수 없음」 선언)·PD-1이 맡는다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgPreDeemedUsesThreeWay } from "./bg-pre-deemed-mode";
import { buildInheritedAcquisitionPayload, buildInheritedHouseValuationPayload } from "./transfer-tax-api-inheritance";
import { buildPre1990LandPayload } from "./transfer-tax-api-helpers";
import { fieldError } from "./transfer-tax-validate-field";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function bgPreDeemedError(asset: AssetForm, label: string, formTransferDate: string | undefined): string | null {
  if (!isBgPreDeemedAsset(asset)) return null;
  if (bgPreDeemedUsesThreeWay(asset)) {
    if (asset.acquisitionCause === "gift" && !(parseAmount(asset.fixedAcquisitionPrice ?? "") > 0)) {
      return fieldError(
        "fixedAcquisitionPrice",
        `${label}: 의제취득일(1985.1.1.) 전에 증여받은 자산을 시가로 평가해 부담부증여하면 취득가액은 ① 증여 신고가액·② §164④~⑦ 기준시가·③ 환산취득가액 중 큰 금액에 채무비율을 곱한 금액입니다 — 증여 신고가액(증여일 현재 상증법 평가액)을 입력하세요 (소득세법 시행령 §159①1호·§163⑨).`,
      );
    }
    return null;
  }
  const td = formTransferDate ?? "";
  const ia = buildInheritedAcquisitionPayload(asset, 1, false).inheritedAcquisition as
    | { standardPriceAtDeemedDate?: number }
    | undefined;
  const hasDeemedStd =
    (ia?.standardPriceAtDeemedDate ?? 0) > 0 ||
    "inheritedHouseValuation" in buildInheritedHouseValuationPayload(asset, td) ||
    (asset.assetKind === "land" && "pre1990Land" in buildPre1990LandPayload(asset, td));
  if (hasDeemedStd) return null;
  return fieldError(
    "standardPriceAtAcq",
    `${label}: 의제취득일(1985.1.1.) 전에 취득한 자산을 기준시가로 평가해 부담부증여하면 취득가액은 의제취득일 현재 기준시가 × 채무비율입니다 — 의제취득일(1985.1.1.) 시점 기준시가를 입력하세요 (소득세법 시행령 §159①1호 괄호·§164④~⑦).`,
  );
}
