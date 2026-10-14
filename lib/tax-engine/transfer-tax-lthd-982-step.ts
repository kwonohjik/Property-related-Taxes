/**
 * STEP 4.05 — §98의2 특칙 장특 재할당 + STEP 4 장특 step 생성 + OH-31 표2 연혁 미지원 고지.
 *
 * `transfer-tax.ts` 800줄 정책 분리 — 순서(특칙 재할당 → step push → 고지)와 로직은 그대로 옮겼다.
 * `calcLongTermHoldingDeduction`의 결과(공제액·율)를 받아 §98의2 특칙으로 덮어쓸 수 있는 값을 돌려준다.
 */
import { applyRate } from "./tax-utils";
import { resolveExemptionRequirementResidenceMonths } from "./one-house/residence-months";
import { meetsTable2ResidenceRequirement } from "./transfer-tax-exemption";
import { isLthdTable2SubjectAsset, resolveLthdTable2OneHouseAxis } from "./lthd-table2-subject";
import { LTHD_TABLE2_UNSUPPORTED_NOTICE, resolveLthdTable2Era } from "./data/lthd-table2-era";
import { giftTable2PriorResidenceNotice } from "./one-house/gift-table2-notice";
import { appurtenantLandLthdNoticeText } from "./appurtenant-land-lthd-rate";
import { pushLongTermHoldingSteps } from "./transfer-tax-lthd-steps";
import type { LthdExclusionReason } from "./legal-codes/transfer";
import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";
import type { UsageConversionDetail } from "./types/transfer-result.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";

export interface Lthd982StepArgs {
  steps: CalculationStep[];
  warnings: string[];
  taxableGain: number;
  /** 표2 대상 판정 입력(유효 주택수 반영) — 계산 축과 같은 입력이다. */
  exemptionJudgeInput: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  /** `surchargeExclusionByReduction.appliedId` — "unsold_98_2"일 때만 특칙을 건다. */
  surchargeExclusionAppliedId: string | undefined;
  deemedOneHouseBy155: boolean;
  /** 12억 초과 고가주택 부분과세인가(`exemptionResult.isPartialExempt`) — 증여 전 동일세대 거주 표2 확인 필요 고지의 게이트(결정 #38-8). */
  isHighValuePartial: boolean;
  holdingPeriod: { years: number; months: number };
  longTermHoldingDeduction: number;
  longTermHoldingRate: number;
  lthdExclusionReason: LthdExclusionReason | undefined;
  usageConversionDetail?: UsageConversionDetail;
  fbLthdFormula?: string;
  appurtenantTable1Applied?: boolean;
  splitDetail?: SplitGainResult;
}

export function applyLthd982AndPushSteps(
  a: Lthd982StepArgs,
): { longTermHoldingDeduction: number; longTermHoldingRate: number } {
  const { exemptionJudgeInput, taxableGain, deemedOneHouseBy155, holdingPeriod } = a;
  let { longTermHoldingDeduction, longTermHoldingRate } = a;
  const table2ResidenceYearsForStep = Math.floor(resolveExemptionRequirementResidenceMonths(exemptionJudgeInput) / 12);
  // STEP 4.05: §98의2 특칙 — 장특 = 양도차익 × §95② 표2 보유기간별 공제율 강제 (법 ①1호, P4).
  // 적격 선판정은 STEP 0.45 (중과 배제 5호 열거 — 동일 신호). 1세대1주택 표2(보유+거주)는
  // ①의 "각 표 외의 부분 본문 불구" 범위 밖 — 특례 적용 시 유지 (항상 ≥ 표2 보유 단독).
  let lthd982Applied = false;
  if (a.surchargeExclusionAppliedId === "unsold_98_2") {
    // 표2 대상 축은 위 STEP 4와 **같은 술어**를 쓴다 — 여기만 실제 주택수를 보면 §155 의제
    // 자산에서 「STEP 4는 표2인데 §98의2 특칙은 표2가 아니라고 본다」는 세 번째 진실이 생긴다.
    const isOneHouseSpecial982 =
      resolveLthdTable2OneHouseAxis(exemptionJudgeInput, deemedOneHouseBy155) &&
      isLthdTable2SubjectAsset(exemptionJudgeInput) &&
      meetsTable2ResidenceRequirement(exemptionJudgeInput, table2ResidenceYearsForStep) &&
      longTermHoldingDeduction > 0;
    if (!isOneHouseSpecial982) {
      const rate982 = holdingPeriod.years >= 3 ? Math.min(holdingPeriod.years * 0.04, 0.4) : 0;
      longTermHoldingDeduction = applyRate(taxableGain, rate982);
      longTermHoldingRate = rate982;
      lthd982Applied = true;
    }
  }
  pushLongTermHoldingSteps({
    steps: a.steps,
    taxableGain,
    holdingPeriod,
    longTermHoldingRate,
    longTermHoldingDeduction,
    residenceYearsForStep: Math.floor(a.effectiveInput.residencePeriodMonths / 12),
    table2ResidenceYearsForStep,
    // 표시 축도 계산 축과 **같은 술어**를 쓴다 — §155의3 면제를 계산에만 반영하고 문구가 표1이면
    // 「공제율은 표2인데 문구는 표1」 드리프트가 난다.
    // 자산 축(순수 토지·건물·배율 초과·판정 불가 카드는 표1 — S08-6)도 같은 술어다.
    meetsTable2Residence:
      isLthdTable2SubjectAsset(exemptionJudgeInput) &&
      meetsTable2ResidenceRequirement(exemptionJudgeInput, table2ResidenceYearsForStep),
    isOneHousehold: exemptionJudgeInput.isOneHousehold,
    // 표시 축도 계산 축과 맞춘다 — §159의4 의제 1세대1주택은 표2를 적용받으므로 산식 문구도
    // 표2(보유 4% + 거주 4%)여야 한다. 어긋나면 「공제율 64%인데 문구는 표1」 drift가 난다.
    householdHousingCount: deemedOneHouseBy155 ? 1 : exemptionJudgeInput.householdHousingCount,
    lthd982Applied,
    lthdExclusionReason: a.lthdExclusionReason,
    // §95⑤ 적용 시 보유분을 표1+표2로 나눠 표시한다 — 없으면 종전 표2 문구 그대로.
    usageConversionDetail: a.usageConversionDetail,
    // §95④ 후단(가업상속) 적용 시 공제율 분해 문구로 대체한다.
    fbLthdFormula: a.fbLthdFormula,
    appurtenantTable1Applied: a.appurtenantTable1Applied,
    transferDate: exemptionJudgeInput.transferDate,
    splitDetail: a.splitDetail,
  });
  // 기본통칙 95-0…1 — 토지가 주택보다 먼저 취득돼 토지분 공제율이 「표1·표2 중 큰 공제율」로 정해졌고 그 값이 토지 자신의
  // 보유연수로 표2를 적용한 값과 달라졌을 때만 고지한다(사실만 — 세액은 파트별 공제액이 정본). §98의2 특칙이 총액을 덮어쓴 경우는 제외.
  const landAppurtenant = a.splitDetail?.land.appurtenantLthd;
  if (landAppurtenant?.changedFromOwnYears && !lthd982Applied) {
    a.warnings.push(
      appurtenantLandLthdNoticeText({
        landHoldingYears: a.splitDetail!.land.holdingYears,
        houseHoldingYears: landAppurtenant.houseHoldingYears,
        table1Rate: landAppurtenant.table1Rate,
        table2Rate: landAppurtenant.table2Rate,
        table1Applied: landAppurtenant.table1Applied,
      }),
    );
  }
  // OH-31 — 2009-01-01 전 양도분의 표2 연혁은 미지원이다(현행 식으로 계산) — 숨기지 않는다.
  if (longTermHoldingDeduction > 0 && resolveLthdTable2Era(exemptionJudgeInput.transferDate) === "unsupported" && resolveLthdTable2OneHouseAxis(exemptionJudgeInput, deemedOneHouseBy155) && isLthdTable2SubjectAsset(exemptionJudgeInput)) a.warnings.push(LTHD_TABLE2_UNSUPPORTED_NOTICE);

  // 결정 #38-8 — 증여 전 동일세대 거주를 표2 대상 판정에 통산하면 결론이 갈릴 때만 확인 필요(세액은 통산하지 않은 값 — 별건 #38-9 결정 대기).
  const giftTable2Notice = giftTable2PriorResidenceNotice({
    input: exemptionJudgeInput,
    deemedOneHouseBy155,
    isHighValuePartial: a.isHighValuePartial,
    lthdApplies: taxableGain > 0 && holdingPeriod.years >= 3 && a.lthdExclusionReason === undefined && !a.usageConversionDetail && !a.splitDetail,
  });
  if (giftTable2Notice) a.warnings.push(giftTable2Notice);

  return { longTermHoldingDeduction, longTermHoldingRate };
}
