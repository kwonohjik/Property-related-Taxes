/**
 * 증여세 마법사 부담부증여 — 취득가액 산정방식 「매매사례가액(K-6)·감정가액(K-7)」 술어 (단일 출처).
 *
 * 양도세 화면의 `burdened-gift-presumed-acquisition.ts`(`AssetForm` 기반)와 **같은 결론**을 `BurdenedGiftTransferTaxInput`
 * 기반으로 낸다. ⑤ 위젯·④ API 변환·⑧ validate가 이 파일의 술어를 같이 써서 「칸은 뜨는데 계산은 막힌다」를 막는다.
 * 라벨·종류 판별은 양도세 쪽 leaf를 그대로 가져온다(문구가 갈라지지 않게).
 *
 * 계획서: docs/00-pm/burdened-gift-appraisal-gift-wizard.plan.md
 */
import { calculateBuildingPenalty } from "@/lib/tax-engine/transfer-tax-building-penalty";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { BG_PRESUMED_LABEL, isBgPresumedMethod, type BgPresumedMethod } from "./burdened-gift-presumed-acquisition";
import { giftBurdenedInheritedConversionBlocked } from "./gift-burdened-one-house";

export { BG_PRESUMED_LABEL, isBgPresumedMethod };
export type { BgPresumedMethod };

/** 상속받은 자산은 새 두 방식을 쓸 수 없다 — 환산 차단과 같은 술어(§163⑨ 평가액이 가목). */
export function giftBgPresumedBlockedByInheritance(bgt: BurdenedGiftTransferTaxInput): boolean {
  return giftBurdenedInheritedConversionBlocked(bgt);
}

export const GIFT_BG_PRESUMED_INHERITED_ERROR =
  "상속받은 자산은 상속개시일 현재 「상속세 및 증여세법」 평가액이 취득 당시 실지거래가액입니다(소득세법 시행령 §163⑨) — " +
  "매매사례가액·감정가액을 쓸 수 없습니다(소득세법 §97①1호 단서). 「실지취득가액」에 상속개시일 평가액(상속세 신고·결정가액)을 입력하세요.";

/**
 * **증축** 5년 이내 × 감정가액 — §114조의2 가산세 대상이라 base(「증축한 부분에 한정한 감정가액」)를 받아야 하는 조합.
 * 엔진이 같은 조합에서 그 값을 요구한다(`transfer-tax-burdened-gift-step.ts`) — 판정은 엔진과 같은 단일 소스 `calculateBuildingPenalty`.
 * 신축은 건물 전체 감정가액의 안분값이 base라 별도 칸이 없다. 토지는 건물 행위가 아니라 제외한다.
 */
export function giftBgAppraisalExtensionPenaltyApplies(
  bgt: BurdenedGiftTransferTaxInput,
  isLandType: boolean,
  giftDate: string | undefined,
): boolean {
  if (isLandType || bgt.isSelfBuilt !== true || bgt.buildingType !== "extension") return false;
  const date = toOptionalDate(giftDate);
  if (!date) return false;
  const input = {
    isSelfBuilt: true,
    acquisitionMethod: "appraisal",
    transferDate: date,
    constructionDate: toOptionalDate(bgt.constructionDate as unknown as string | Date | undefined),
    buildingType: "extension",
    extensionFloorArea: bgt.extensionFloorArea,
  } as unknown as TransferTaxInput;
  return calculateBuildingPenalty(input, 1) !== null;
}

/** 증축 × 감정가액 — 증축한 부분의 감정가액 미입력(⑧). 건물 전체로 대신하지 않는다. */
export const GIFT_BG_EXTENSION_APPRAISAL_REQUIRED_ERROR =
  "건물을 증축하고 증축일부터 5년 이내에 양도하면서 취득가액을 감정가액으로 산정하면 「소득세법」 제114조의2에 따라 증축한 부분의 감정가액에 5% 가산세가 붙습니다 — " +
  "증축한 부분의 감정가액을 입력하세요(건물 전체 감정가액으로 대신할 수 없습니다).";

/** 증축한 부분의 감정가액이 감정가액 총액보다 클 때(⑧) — 엔진과 같은 상한. */
export function giftBgExtensionAppraisalExceedsError(cap: number): string {
  return `증축한 부분의 감정가액이 감정가액 총액(${cap.toLocaleString()}원)보다 클 수 없습니다.`;
}
