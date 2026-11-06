/**
 * 겸용주택 × 조특법 §99(신축주택 감면)·§99의3(신축주택 과세특례) 양도소득금액 차감 (리뷰 NH-33 · Q-14 (a) · NH-75).
 *
 * ## 종전 결함
 *
 * 겸용 경로는 §99·§99의3 선택을 «차감형은 계산하지 않고 고지»(`transfer-tax-mixed-use-totals.ts`)로만 다뤘다. 그런데 같은 함수가
 * §97의5 감면 대상 소득은 주택분으로 한정해 계산한다. 선택한 §99·§99의3 입력(감면 패널의 15개 이상 칸)은 ⑫·⑭를 지나 엔진 입력까지 오지만
 * 겸용 엔진이 읽지 않아 조용히 버려졌다(NH-75 — 세액 영향은 NH-33과 같은 값).
 *
 * ## 계산 (사용자 결정 Q-14 (a) — 주택분에서 계산)
 *
 * 조특법 §99①·§99의3①은 «신축주택»(주택에 딸린 토지 포함 — 조특령 §99의3②1호가 소득세법 §95① 준용)의 양도소득금액에서 일정액을
 * 차감한다(소득세법 §90②). 겸용주택에서 주택으로 보는 부분은 주택분(주택 + 그 부수토지)뿐이다(소득세법 시행령 §160①·§161⑤ — 상가분은
 * 일반 건물·토지이므로 «주택» 감면 대상이 아니다). 그래서 단건 경로(`transfer-tax-income-steps.ts` STEP 4.6)와 **같은 라우터**
 * (`resolveIncomeDeduction`)를 **주택분 양도소득금액**을 기초로 불러 그 금액을 주택분에서만 뺀다.
 *   · 5년 이내 양도: 주택분 양도소득금액 전액 차감(라우터가 정한다)
 *   · 5년 후 양도: 기준시가 안분 — 감면 입력의 취득·5년·양도 시 기준시가(`standardPriceAt…`)로 라우터가 정한다
 *   · 비과세 부분·상가분·배율 초과 비사업용 토지분은 주택분 소득에 들어 있지 않아 차감되지 않는다.
 *
 * 파트 간 차손 통산(시행령 §167의2①)이 있으면 차감액을 다건 합산과 **같은 leaf**(`reducibleShiftOf`)로 안분한다 —
 * 시행령 §167의2②: 통산받은 차손을 «순양도소득금액 : 감면소득금액» 비율로 안분해 감면소득금액을 줄인다.
 *
 * ## 농어촌특별세 · 중과
 *
 * · 농특세: 단건 STEP 7.5와 같은 leaf(`applyIncomeDeductionSurtax`) — (차감 전 산출세액 − 차감 후 산출세액) × 20%.
 * · 중과 배제: 별도(`transfer-tax-mixed-use-reduction-surcharge.ts` — NH-09)가 같은 조문으로 선판정한다.
 *
 * ## 이 파일이 다루지 않는 것
 *
 * §98~§98의8 하이브리드·§98의8 준공후미분양 50% 차감(`ALL_INCOME_DEDUCTION_IDS`의 나머지 9종)은 사용자 결정 범위 밖이라 종전대로
 * «계산하지 않고 고지»한다(`computeMixedUsePostTax`).
 */
import { buildIncomeDeductionStep, resolveIncomeDeduction } from "./transfer-reductions/income-deduction-router";
import type { IncomeDeductionResolution } from "./transfer-reductions/income-deduction-router";
import { reducibleShiftOf } from "./reducible-loss-share-core";
import { MIXED_INCOME_DEDUCTION_COMPUTED_IDS, mixedHighValueJudgmentPrice } from "./transfer-tax-mixed-use-reduction-surcharge";
import type { MixedUseRatePart } from "./transfer-tax-mixed-use-totals";
import type { MixedUseApportionment, MixedUseAssetInput, MixedUseStep } from "./types/transfer-mixed-use.types";

/** 겸용 감면 선택 중 이 파일이 계산하는 것 — 없으면 undefined(라우터를 부르지 않는다). 미등기는 조특법 §129②로 적용하지 않는다. */
export function resolveMixedIncomeDeduction(args: {
  asset: MixedUseAssetInput;
  transferDate: Date;
  transferPrice: number;
  apportionment: MixedUseApportionment;
  /** 주택분 양도소득금액(장기보유특별공제 후 · 비과세 부분 제외) — 차감의 한도 기초 */
  housingIncome: number;
  isUnregistered: boolean;
}): IncomeDeductionResolution | undefined {
  const { asset, transferDate, transferPrice, apportionment, housingIncome, isUnregistered } = args;
  const selected = (asset.reductions ?? []).filter((r) => MIXED_INCOME_DEDUCTION_COMPUTED_IDS.has(r.type));
  if (isUnregistered || selected.length === 0) return undefined;
  return resolveIncomeDeduction(selected, {
    transferDate,
    // 감면 취득일 = 건물 취득일(겸용 §89 판정의 주택 부분 취득일) — NH-09 중과 배제 선판정과 같은 인자
    acquisitionDate: asset.buildingAcquisitionDate,
    assetContractDate: asset.assetContractDate,
    transferPrice,
    totalPropertyTransferPrice: mixedHighValueJudgmentPrice(asset, transferPrice, apportionment),
    acquisitionCause: asset.acquisitionCause,
    transferIncome: Math.max(0, housingIncome),
  });
}

/**
 * 통산 후 주택분 소득에서 뺄 차감액과 차감 후 주택분·세율 파트 소득.
 * `reducible`은 통산 **전** 주택분 소득 기준으로 라우터가 정한 값이다 — 통산으로 주택분 소득이 줄었으면 §167의2② 안분으로 줄인다.
 */
export function applyHousingIncomeDeduction(args: {
  reducible: number;
  housingBeforeOffset: number;
  housingAfterOffset: number;
  rateParts?: MixedUseRatePart[];
}): { applied: number; housingIncome: number; rateParts?: MixedUseRatePart[] } {
  const { reducible, housingBeforeOffset, housingAfterOffset, rateParts } = args;
  if (reducible <= 0 || housingAfterOffset <= 0) return { applied: 0, housingIncome: housingAfterOffset, rateParts };
  const shift = reducibleShiftOf({ loss: housingBeforeOffset - housingAfterOffset, base: housingBeforeOffset }, reducible);
  const applied = Math.min(Math.max(0, reducible - shift), housingAfterOffset);
  return {
    applied,
    housingIncome: housingAfterOffset - applied,
    rateParts: rateParts?.map((p) => (p.kind === "housing" ? { ...p, income: p.income - applied } : p)),
  };
}

/** 결과 step — 단건 STEP 4.6과 같은 라벨·산식 문구(`buildIncomeDeductionStep`). 적용 불가여도 사유를 싣는다(조용히 버리지 않는다). */
export function buildMixedIncomeDeductionStep(
  resolution: IncomeDeductionResolution,
  housingIncomeBefore: number,
  housingIncomeAfter: number,
): MixedUseStep {
  const s = buildIncomeDeductionStep(resolution, housingIncomeBefore, housingIncomeAfter);
  return {
    id: "income-deduction-new-housing",
    title: `${s.label} (주택분)`,
    legalBasis: s.legalBasis,
    values: [{ label: s.formula, value: s.amount, isResult: true }],
  };
}
