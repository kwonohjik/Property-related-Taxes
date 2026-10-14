/**
 * 같은 날 취득한 주택(토지·건물 일괄취득)의 배율 초과 부수토지 분리 경로에서 **취득 당시 계약서 토지·건물 구분금액**을 받는 경로 (#17-6).
 *
 * ## 무엇을 하나
 *
 * 종전에는 취득가액(실지거래가액) 총액을 취득시 기준시가(개별주택가격 가목:나목 비례)로만 토지·건물에 나눴다(영 §166⑥). 이제 계약서에 토지·건물
 * 금액이 구분 기재돼 있으면 그 «구분 기장 가액»을 받아 「소득세법」 §100③으로 판정한다 — 구분 기장 가액이 §100②에 따라 안분계산한 가액과
 * **100분의 30 이상 차이**가 있으면 가액 구분이 불분명한 때로 보아 **안분 가액**을 쓰고, 30% 미만이면 **구분 기장 가액(계약서)**을 쓴다.
 * 판정 함수는 양도가액 축과 같은 단일 소스(`judgeDeemedUnclearSplit`)다 — 정수 교차곱, 경계 30.0% 정확히 = 불분명(「이상」).
 *
 * ## 확인하지 못한 것 (단정 금지 — 결과 고지 `housingExcessAcqContractNotice`)
 *
 * 법문은 «구분 기장한 가액이 안분계산한 가액과 100분의 30 이상 차이»라고만 해 비교 단위(토지만/건물만/각각)와 분모를 정하지 않는다.
 * 국세청 해석·조세심판례(조심2017서1492 — 건물가액 차이가 30% 이상이라는 사실에 다툼이 없어 불분명으로 판단 · 조심2022중6164 — 토지·건물 각각
 * 30% 차이 여부를 청구인이 다투었으나 계약서 기재 불인정으로 기각)를 조회했으나 비교 단위를 정면으로 설시한 것은 확인하지 못했다.
 * 그래서 이 저장소의 기존 양도가액 축 판정과 같이 **토지·건물 각각을 안분 가액 대비로 보아 어느 한쪽이라도 30% 이상이면 불분명**으로 구현했다.
 *
 * ## 연혁 게이트 — 양도일 기준 (`data/sec100-3-split-era.ts`)
 *
 * 2016.1.1. 전 양도: 판정 없음(계약서 구분금액을 그대로 구분 기장 가액으로) · 2016.1.1.~2024.12.31.: 본문만 · 2025.1.1. 이후: 단서 질문.
 * 영 §166⑧2호(함께 취득한 후 건물 등을 철거하고 토지만 사용)는 **주택 양도 경로에 해당하지 않아 묻지 않는다** — 이 경로는 주택(건물 포함)을 양도하는
 * 경우이고 건물을 철거했다면 주택 양도가 아니다. 1호(다른 법령에서 정하는 바에 따라 가액을 구분)만 사용자 신고로 받는다(자동 판정 불가).
 *
 * ## 범위
 *
 * 취득 쪽만이다. 양도가액의 계약서 구분(§100③ 양도 쪽)은 이 경로가 아니다 — 양도 당시 토지·건물 기준시가는 종전처럼 항상 필요하다.
 * 환산·감정·매매사례 취득은 §100②가 실지거래가액 산정에 대한 규정이라 받지 않는다. 12억 초과 고가주택 산식은 종전 그대로다.
 */
import { judgeDeemedUnclearSplit, type SaleSplitPair } from "./sale-split-deemed-unclear";
import { sec100_3Era } from "./data/sec100-3-split-era";
import { housingExcessSplitAppliesToInput } from "./housing-excess-split";
import { splitPair, type PartAcqMode } from "./transfer-tax-split-acq-price";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { AcqSplitJudgmentDetail, SplitGainResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput } from "./types/transfer.types";

/** 이 입력이 계약서 구분금액 경로(배율 초과분 분리 + 실지거래가액 취득)를 타는가 — ④⑤⑧의 클라이언트 술어와 같은 사실. */
export function housingExcessAcqContractApplies(
  input: TransferTaxInput,
  landMode: PartAcqMode,
  buildingMode: PartAcqMode,
): boolean {
  // 매매계약서의 가액 구분(§100②·③)이다 — 상속·증여(상증 평가액 하나)는 받지 않는다(#17-5 ②). ④⑤⑧의 `housingExcessNeedsAcqContract`와 같은 사실.
  return (
    (input.acquisitionCause ?? "purchase") === "purchase" &&
    housingExcessSplitAppliesToInput(input) &&
    landMode === "actual" &&
    buildingMode === "actual"
  );
}

/**
 * 계약서 구분금액이 있으면 §100③을 판정해 취득가액 분리에 쓸 입력과 판정 내역을 낸다. 없으면 입력을 그대로 돌려준다(종전 동작 — 미입력 불변).
 * 구분금액이 있는데 이 경로가 아니거나·한쪽만 있거나·합이 취득가액과 다르면 던진다(⑧이 선차단하므로 도달은 API 직접 호출뿐 — 침묵 무시 금지).
 */
export function resolveHousingExcessAcqContract(
  input: TransferTaxInput,
  landMode: PartAcqMode,
  buildingMode: PartAcqMode,
  landRatio: number | null,
): { input: TransferTaxInput; judgment?: AcqSplitJudgmentDetail } {
  const land = input.acqContractLandPrice;
  const building = input.acqContractBuildingPrice;
  if (land === undefined && building === undefined) return { input };
  const fail = (message: string): never => {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { what: "계약서 구분금액" });
  };
  if (!housingExcessAcqContractApplies(input, landMode, buildingMode)) {
    return fail(
      "계약서 토지·건물 구분금액은 같은 날 취득한 주택의 배율 초과 부수토지 분리(실지거래가액 취득)에서만 받습니다 — 이 입력에서는 쓰이지 않습니다.",
    );
  }
  if (land === undefined || building === undefined) {
    return fail("계약서 토지 금액과 건물 금액을 모두 입력하세요 — 한쪽만으로는 나머지를 자동 계산하지 않습니다.");
  }
  const total = input.acquisitionPrice ?? 0;
  if (land + building !== total) {
    return fail(
      `계약서 토지 금액과 건물 금액의 합(${(land + building).toLocaleString()})이 취득가액(${total.toLocaleString()})과 같아야 합니다.`,
    );
  }

  const declared: SaleSplitPair = { land, building };
  // 안분 가액 = 종전 경로가 총액을 나누던 값 그대로(취득시 기준시가 비율 — 영 §166⑥). 한 곳(`splitPair`)만 쓴다.
  const apportioned = splitPair(total, undefined, undefined, landRatio, "취득가액");
  const era = sec100_3Era(input.transferDate);
  const judged = judgeDeemedUnclearSplit({
    declared,
    apportioned,
    ...(era === "body_and_proviso" && input.acqContractOtherLaw === true ? { exemption: "other_law" as const } : {}),
  });
  const outcome: AcqSplitJudgmentDetail["outcome"] =
    era === "none"
      ? "before_effective"
      : judged.deemedUnclear
        ? "deemed_unclear"
        : judged.detail.exemptionApplied
          ? "exempt_other_law"
          : "contract";
  const applied = outcome === "deemed_unclear" ? apportioned : declared;
  const judgment: AcqSplitJudgmentDetail = {
    outcome,
    declared,
    apportioned,
    applied,
    landDeviationBp: judged.detail.landDeviationBp,
    buildingDeviationBp: judged.detail.buildingDeviationBp,
    landOver: judged.detail.landOver,
    buildingOver: judged.detail.buildingOver,
  };
  return {
    // 안분 가액이 적용되면 입력을 바꾸지 않는다 — 종전 경로(`splitPair` 비율 안분)가 같은 값을 낸다.
    input: outcome === "deemed_unclear" ? input : { ...input, landAcquisitionPrice: declared.land, buildingAcquisitionPrice: declared.building },
    judgment,
  };
}

/**
 * 고지(세액 불변) — 계약서 구분금액의 §100③ 판정 근거와 확인하지 못한 점. 판정이 돈 경우(계약서 구분금액이 입력된 경우)에만 낸다.
 * 어느 쪽이 유리·불리한지는 말하지 않는다.
 */
export function housingExcessAcqContractNotice(splitDetail: SplitGainResult | undefined): string | null {
  const j = splitDetail?.acqSplitJudgment;
  if (!j) return null;
  const cite = "「소득세법」 제100조 제3항";
  if (j.outcome === "before_effective") {
    return (
      `양도일이 2016년 1월 1일 전이라 ${cite}의 30% 판정을 하지 않고 계약서의 토지·건물 구분금액을 그대로 취득가액의 구분 기장 가액으로 썼습니다` +
      "(법률 제13558호 부칙 제2조②)."
    );
  }
  if (j.outcome === "exempt_other_law") {
    return (
      `「소득세법 시행령」 제166조 제8항 제1호(다른 법령에서 정하는 바에 따라 가액을 구분한 경우)에 해당한다는 신고에 따라 ${cite}의 30% 판정을 하지 않고 ` +
      "계약서의 토지·건물 구분금액을 그대로 취득가액의 구분 기장 가액으로 썼습니다 — 해당 사유는 신고 내용을 그대로 따른 것이므로 확인 필요"
    );
  }
  return (
    `계약서 토지·건물 구분금액이 취득시 기준시가로 안분계산한 가액과 100분의 30 이상 차이가 있는지를 ${cite}에 따라 판정했습니다. ` +
    "토지·건물 각각을 안분 가액 대비로 비교해 어느 한쪽이라도 30% 이상 차이가 나면 가액 구분이 불분명한 때로 보아 안분 가액을 적용합니다 — " +
    "법문이 비교 단위를 정하지 않고 이를 정면으로 설시한 예규·재결을 확인하지 못했습니다 — 확인 필요"
  );
}
