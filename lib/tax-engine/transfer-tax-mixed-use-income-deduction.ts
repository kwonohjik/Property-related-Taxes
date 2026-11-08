/**
 * 겸용주택 × 조특법 §99·§99의3·§98의3~§98의8 양도소득금액 차감 (§99 리뷰 NH-33 · Q-14 (a) · NH-75 / §98 시리즈 리뷰 US-13 · Q-14 (a)).
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
 * ## §98 시리즈 (리뷰 US-13 · Q-14 (a) 사용자 결정 2026-11-08)
 *
 * §98의3·§98의5·§98의6·§98의7·§98의8도 같은 라우터·같은 주택분 소득으로 계산한다(`MIXED_INCOME_DEDUCTION_COMPUTED_IDS`).
 *   · 기준시가 축은 A1 — 감면 카드의 취득시·5년 시점·양도시 기준시가를 「주택부분 + 부수토지」 가격으로 받는다(NH-33과 같은 규약,
 *     감면 패널이 겸용 자산에 안내한다). 겸용 경로는 2022.1.1. 이후 양도만 받아 5년 이내(세액감면형) 분기는 닿지 않는다.
 *   · 토지 선보유분: 산식은 확정 판결 노선(전체 양도소득금액 · 신축주택 취득당시 기준시가)을 유지하고 안내만 한다(Q-7 (b)).
 *
 * ## 이 파일이 다루지 않는 것
 *
 * §98(세율 특칙)·§98의2(장특 특칙)·§99의2·§98의4는 «계산하지 않고 고지»한다(`computeMixedUsePostTax`).
 */

/**
 * Q-7 (b) 안내 — 토지를 신축주택보다 먼저 취득한 §98의3 겸용(자기건설 등). 세액 불변. 유리·불리 표현은 쓰지 않는다.
 * 리뷰 `unsold-98-series-review-2026-11.md` §3 Q-7 결정(2026-11-06): 엔진 산식은 현행을 유지하고 두 노선을 함께 적는다.
 */
export const UNSOLD_983_LAND_PRIOR_NOTICE =
  "조특법 §98의3 차감은 주택부분 양도소득금액 전체(토지를 신축주택보다 먼저 취득한 기간의 토지 양도소득 포함)와 신축주택 취득 당시 " +
  "기준시가로 계산했습니다(서울행정법원 2017구단61723 → 서울고법 2019누38627 → 대법원 2019두58353 심리불속행). 국세청·조세심판원은 " +
  "토지 취득일부터 신축주택 취득일 전일까지 발생한 토지의 양도소득금액을 감면에서 제외하고 5년 후 산식의 취득 당시 기준시가를 토지 " +
  "취득 당시 값으로 봅니다(재산세과-1450 · 조심2011전1378 · 재산세과-514).";

export function mixedLandPriorNotice(
  resolution: IncomeDeductionResolution | undefined,
  asset: Pick<MixedUseAssetInput, "landAcquisitionDate" | "buildingAcquisitionDate">,
): string | undefined {
  if (resolution?.appliedId !== "unsold_98_3" || resolution.reducible <= 0) return undefined;
  return asset.landAcquisitionDate.getTime() < asset.buildingAcquisitionDate.getTime() ? UNSOLD_983_LAND_PRIOR_NOTICE : undefined;
}
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
