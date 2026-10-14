/**
 * 부담부증여 시가 모드 — 취득가액 산정방식 「매매사례가액(K-6)·감정가액(K-7)」 술어·해석 (단일 출처).
 *
 * 소득세법 §97①1호나목 · 시행령 §163⑫ → §176의2③1호(매매사례)·2호(감정). 엔진·Zod는 PR-1(`77ac66c82`)에서
 * 완료됐고, 이 파일은 **⑤ 위젯(비활성·입력 칸)·⑧ validate·④ API 변환이 같은 판단을 쓰게 하는** leaf다.
 * 술어를 각자 재기술하면 「칸은 뜨는데 계산은 막힌다」 또는 그 반대가 된다
 * (`burdened-gift-acq-std-price.ts` 헤더와 같은 이유).
 *
 * 계획서: docs/00-pm/burdened-gift-appraisal-sales-case-acquisition.plan.md §4·§5.3~5.4
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { calculateBuildingPenalty } from "@/lib/tax-engine/transfer-tax-building-penalty";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { deriveSec163_9BaseDate, isPostDeemedInheritance } from "./transfer-163-9-base-date";
import { selfBuiltActive } from "./self-built-scope";

export type BgPresumedMethod = "salesCase" | "appraisal";

/** 화면·메시지 라벨 — 입력 칸 제목과 오류 문구가 같은 단어를 쓴다. */
export const BG_PRESUMED_LABEL: Record<BgPresumedMethod, string> = {
  salesCase: "매매사례가액",
  appraisal: "감정가액",
};

/** 이 산정방식이 K-6/K-7(공용 3칸 `bgPresumedAcquisition*`)을 쓰는가. */
export function isBgPresumedMethod(method: string | undefined): method is BgPresumedMethod {
  return method === "salesCase" || method === "appraisal";
}

export type BgPresumedBlockReason = "inheritance" | "carryover" | "fractionalSplit";

export interface BgPresumedBlock {
  reason: BgPresumedBlockReason;
  /** 라디오 옵션 설명(⑤) — 「환산취득가액」·「실지취득가액 안분」 문자열을 넣지 않는다(E2E 라디오 셀렉터 strict mode). */
  short: string;
  /** ⑧ 오류 본문 — 자산 라벨 접두는 호출부가 붙인다. */
  long: string;
}

type BlockAsset = Pick<AssetForm, "acquisitionCause" | "inheritanceStartDate" | "acquisitionDate">;

/**
 * 새 두 방식을 **고를 수 없는** 자산인가 — ⑤ 비활성과 ⑧ 오류가 같은 이 함수를 쓴다.
 * (조합원입주권은 라디오 자체가 렌더되지 않아 여기서 다루지 않는다 — 엔진·Zod가 별도로 막는다.)
 *
 *  · 상속 — 영 §163⑨가 상속개시일 평가액을 가목(실지거래가액)으로 보므로 나목(감정·매매사례·환산)에 닿지 않는다.
 *    기존 환산 차단 술어(`isPostDeemedInheritance`)와 같은 결론이다.
 *  · 이월과세 — 당초 증여자 값 한 벌을 받는 입력 칸이 없다(엔진 `assertCarryoverDonorBasis`가 같은 조합을 던진다).
 *  · 지분 분할 취득(축 B) — 지분마다 취득일이 달라 「취득일 전후 3개월」 값이 달라지는데 ④가 물건 단위 1값 모델이다
 *    (`mergePrimaryBasic`이 새 필드를 병합하지 않는다).
 */
export function bgPresumedBlock(
  asset: BlockAsset,
  ctx: { isFractionalSplit?: boolean } = {},
): BgPresumedBlock | null {
  if (isPostDeemedInheritance(asset.acquisitionCause, deriveSec163_9BaseDate(asset))) {
    return {
      reason: "inheritance",
      short: "상속받은 자산은 상증법 평가액이 취득 당시 실지거래가액으로 간주되어 쓸 수 없습니다 (소령 §163⑨)",
      long: "상속받은 자산은 상속개시일 현재 「상속세 및 증여세법」 평가액이 취득 당시 실지거래가액입니다(소득세법 시행령 §163⑨) — 매매사례가액·감정가액을 쓸 수 없습니다(소득세법 §97①1호 단서). 「실지취득가액 안분」에 상속개시일 평가액(상속세 신고·결정가액)을 입력하세요.",
    };
  }
  if (asset.acquisitionCause === "carryover_gift") {
    return {
      reason: "carryover",
      short: "이월과세(§97의2) 적용 자산은 아직 지원하지 않습니다 — 당초 증여자 값 입력 경로가 없습니다",
      long: "이월과세(소득세법 §97의2)가 적용되는 부담부증여는 취득가액 산정방식을 「매매사례가액」·「감정가액」으로 선택할 수 없습니다. 당초 증여자 취득 당시의 매매사례가액·감정가액을 입력하는 경로가 아직 없습니다. 「실지취득가액 안분」 또는 「환산취득가액」을 선택하세요.",
    };
  }
  if (ctx.isFractionalSplit) {
    return {
      reason: "fractionalSplit",
      short: "지분 분할 취득은 지분마다 취득일이 달라 쓸 수 없습니다",
      long: "지분 분할 취득(같은 물건을 여러 번에 나눠 취득)은 취득가액 산정방식을 「매매사례가액」·「감정가액」으로 선택할 수 없습니다. 매매사례가액·감정가액은 취득일 전후 각 3개월 이내의 값(소득세법 시행령 §176의2③)인데, 지분마다 취득일이 달라 물건 단위 한 값으로 입력할 수 없기 때문입니다. 「실지취득가액 안분」 또는 「환산취득가액」을 선택하세요.",
    };
  }
  return null;
}

/** K-6/K-7 금액 입력 형태 — K-4 실지취득가액 블록과 같은 3분기(자산 종류별). */
export type BgPresumedInputKind = "split" | "land" | "total";

export function bgPresumedInputKind(assetKind: AssetForm["assetKind"]): BgPresumedInputKind {
  if (assetKind === "general_building") return "split";
  if (assetKind === "land") return "land";
  return "total";
}

type AmountAsset = Pick<
  AssetForm,
  | "assetKind"
  | "bgPresumedAcquisitionLand"
  | "bgPresumedAcquisitionBuilding"
  | "bgPresumedAcquisitionTotal"
>;

/**
 * 입력 형태에 맞는 금액이 있는가 — ⑧ 「금액 필수」 판정. ④가 싣는 칸과 같은 칸만 본다
 * (Zod refine `presumed*` 중 하나가 양수여야 통과 · 엔진 STEP 4 분기와 같은 축).
 */
export function hasBgPresumedAmount(asset: AmountAsset): boolean {
  switch (bgPresumedInputKind(asset.assetKind)) {
    case "split":
      return (
        (parseAmount(asset.bgPresumedAcquisitionLand) || 0) > 0 ||
        (parseAmount(asset.bgPresumedAcquisitionBuilding) || 0) > 0
      );
    case "land":
      return (parseAmount(asset.bgPresumedAcquisitionLand) || 0) > 0;
    default:
      return (parseAmount(asset.bgPresumedAcquisitionTotal) || 0) > 0;
  }
}

/** 입력 형태에 맞는 첫 빈 칸의 필드명 — ⑧ 필드 점프용. */
export function firstEmptyBgPresumedField(
  asset: Pick<AssetForm, "assetKind">,
): "bgPresumedAcquisitionLand" | "bgPresumedAcquisitionTotal" {
  return bgPresumedInputKind(asset.assetKind) === "total"
    ? "bgPresumedAcquisitionTotal"
    : "bgPresumedAcquisitionLand";
}

type PenaltyAsset = Pick<
  AssetForm,
  | "assetKind"
  | "isSelfBuilt"
  | "acquisitionCause"
  | "buildingType"
  | "constructionDate"
  | "extensionFloorArea"
>;

/**
 * 신축·증축 5년 이내 × **감정가액** — 소득세법 §114조의2 가산세 대상 조합인가.
 *
 * 부담부증여 step은 아직 그 가산세 신호를 세우지 않아, 통과시키면 가산세(감정가액의 5%)가 **조용히 빠진다**
 * (엔진이 같은 조합을 던진다 — `transfer-tax-burdened-gift-step.ts`). 판정은 엔진과 **같은 단일 소스**
 * `calculateBuildingPenalty`에, 폼 값을 ④가 엔진 입력으로 옮기는 것과 같은 매핑으로 넣는다
 * (`transfer-tax-api.ts` `isSelfBuilt: selfBuiltActive(primary)` · `constructionDate` · `extensionFloorArea`).
 * 매매사례가액은 조문(「감정가액 또는 환산취득가액」)에 없어 대상이 아니므로 호출부가 감정일 때만 부른다.
 */
export function bgAppraisalBuildingPenaltyApplies(
  asset: PenaltyAsset,
  transferDate: string | undefined,
): boolean {
  const date = toOptionalDate(transferDate);
  if (!date || !selfBuiltActive(asset)) return false;
  const constructionDate = toOptionalDate(asset.constructionDate);
  const input = {
    isSelfBuilt: true,
    acquisitionMethod: "appraisal",
    transferDate: date,
    constructionDate,
    buildingType: asset.buildingType || undefined,
    extensionFloorArea:
      asset.buildingType === "extension" && asset.extensionFloorArea
        ? parseFloat(asset.extensionFloorArea)
        : undefined,
  } as unknown as TransferTaxInput;
  return calculateBuildingPenalty(input, 1) !== null;
}
