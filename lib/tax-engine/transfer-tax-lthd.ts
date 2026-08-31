/**
 * H-5: calcLongTermHoldingDeduction — 장기보유특별공제 (「소득세법」 §95②·⑤)
 *
 * 800줄 정책에 따라 `transfer-tax-helpers.ts`에서 분리(2026-08-05). 하위 호환을 위해
 * helpers가 재수출하므로 기존 import 경로는 그대로 쓸 수 있다.
 *
 * 분기 순서가 곧 법령 우선순위다:
 *   L-0  미등기 — 배제 (§95② 단서)
 *   L-0a 분양권·승계입주권 — 배제
 *   L-1  중과세 적용 중 — 배제
 *   L-1b 부수토지 일체과세 — 주택 기준 표1/표2
 *   L-1c 장기임대 특례율 우선
 *   L-2  §95⑤·⑥ 비주택 → 주택 용도변경 혼합 (표1 + 표2)
 *   L-2' §97의3·§97의4 장기임대 장특 특례
 *   L-3  1세대1주택 표2 / L-4 일반 표1
 */
import { format } from "date-fns";
import {
  applyRate,
  applyFairMarketRatio,
  applyRateFraction,
  calculateHoldingPeriod,
  LTHD_CONVERSION_95_5_CUTOFF,
} from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
// 「소득세법」 §95⑤ 용도변경 — 기간 분해·보유분 공제율 leaf (UI 미리보기와 같은 함수를 쓴다)
import { calcUsagePeriodInfo } from "./usage-period-info";
import { calcConversionHoldingPct } from "./conversion-holding-pct";
// 「소득세법」 §95② 표1·표2 공제율 **정본**(3년 가드 내장). 사본을 새로 만들지 말 것.
import { calcLongTermRate } from "./transfer-tax-mixed-use-inheritance";
import { TRANSFER } from "./legal-codes";
import type { LthdExclusionReason } from "./legal-codes/transfer";
import { resolveLTHDStartDate } from "./transfer-tax-lthd-start";
import { resolveExemptionResidenceMonths } from "./transfer-tax-exemption";
import { getLongTermDeductionOverride } from "./rental-housing-reduction";
import { evaluateRental97Lthd } from "./transfer-reductions/rental-97-router";
import type { Rental97Result } from "./transfer-reductions/types";
import type { LongTermRentalRuleSet } from "./schemas/rate-table.schema";
import type { TransferTaxInput, SplitGainResult } from "./types/transfer.types";
import type { UsageConversionDetail } from "./types/transfer-result.types";
import type { ParsedRates } from "./transfer-tax-helpers";

interface LongTermHoldingResult {
  deduction: number;
  rate: number;
  holdingPeriod: { years: number; months: number };
  /** §97의3·§97의4 평가 결과 echo (Phase 2 — 2026-06-11). 평가 항목이 없으면 undefined. */
  rental97LthdDetail?: Rental97Result;
  /** 배제 사유 echo — 배제 경로(L-0·L-0a·L-1)에서만. 미배제(공제율 미달 포함)는 undefined. */
  exclusionReason?: LthdExclusionReason;
  /** §95⑤·⑥ 용도변경 혼합 공제 적용 내역 echo (L-2 분기에서만). 미적용은 undefined. */
  usageConversionDetail?: UsageConversionDetail;
  /**
   * §95④ 후단(가업상속) 공제율 분해 문구 echo — L-5 분기에서만. 결과 step 산식 표시 전용.
   * 세액에 영향 없음(공제액은 `deduction`이 정본).
   */
  fbLthdFormula?: string;
}

/**
 * 공제율 → 공제액 (D10-06).
 *
 * `applyRate`(= `Math.floor(amount × rate)`)에 **double로 합산한 공제율**을 넘기면
 * 합이 의도값보다 1 ulp 작아지는 조합에서 **1원 과소**공제가 난다(납세자 불리).
 *
 * 실측 하향 드리프트 조합:
 * - 표1 × §97의4 추가율 — 6년+2% · **9년+2%** · 12년+4% · 12년+10% · 15년+↑+4%
 * - 표2 일반 경로 — 보유 9년+거주 1년 · 보유 8년+거주 9년 · 보유 9년+거주 8년
 *   (`calcLongTermRate`가 보유분·거주분을 double로 더한다. **표2가 §97의4보다 훨씬 흔하다**.)
 *
 * 단방향이다 — 상향 드리프트(0.20+0.10 = 0.30000000000000004)는 곱한 결과가 정수의 위쪽으로만
 * 밀려 `Math.floor`가 변하지 않는다(리뷰 전수 스캔 1,600만 케이스에서 과다공제 0건).
 *
 * ⇒ 국소 패치가 아니라 이 파일의 「공제율 → 공제액」 적용 지점 **공통**으로 정수 분수연산을 쓴다.
 *   `applyFairMarketRatio`는 같은 이유(공정시장가액비율 0.70의 double 표현)로 이미 존재하는
 *   정본 헬퍼다 — `Math.round`는 **비율 상수를 정수 분자로** 바꾸는 데만 쓰므로
 *   「세법은 floor」 원칙 위반이 아니다.
 */
const applyLthdRate = applyFairMarketRatio;

export function calcLongTermHoldingDeduction(
  taxableGain: number,
  input: TransferTaxInput,
  rules: ParsedRates["longTermHoldingRules"],
  isSurcharge: boolean,
  isSuspended: boolean,
  longTermRentalRules?: LongTermRentalRuleSet,
  splitDetail?: SplitGainResult,
  /**
   * 「소득세법 시행령」 §159의4 — 표2 대상 「1주택」에는 **§155 각 항에 따라 1세대1주택으로 보는
   * 주택**이 포함된다. 그 의제 성립 판정은 `checkExemption`이 유일하게 내리므로 그 결과를
   * **단일 술어**로 받는다(주택 수를 깎아 흉내내면 `checkExemption`의 의제 분기 자체가 도달 불가가 된다).
   * 표2 게이트에만 쓰고 12억 안분 축(`isProratedSplit`)·§95⑤ 진입조건은 건드리지 않는다.
   */
  deemedOneHouseBy155?: boolean,
): LongTermHoldingResult {
  // L-0: 미등기 — 배제
  if (input.isUnregistered) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 }, exclusionReason: "unregistered" };
  }

  // L-0a: 분양권·승계입주권 — 배제
  if (input.propertyType === "presale_right") {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 }, exclusionReason: "presale_right" };
  }
  if (input.propertyType === "right_to_move_in" && input.isSuccessorRightToMoveIn === true) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 }, exclusionReason: "successor_right_to_move_in" };
  }

  // L-1: 중과세 적용 중(유예 해제)이면 배제
  if (isSurcharge && !isSuspended) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 }, exclusionReason: "multi_house_surcharge" };
  }

  // L-1b: 부수토지 일체과세 (landNature === "appurtenant_to_housing")
  // — 세율(§104①2호 괄호·영 §167의5)은 주택과 일체로 판정하나, **장기보유특별공제의 보유기간은
  //   토지 자신의 것**이다 (아래 참조).
  if (
    input.propertyType === "land" &&
    input.landNature === "appurtenant_to_housing" &&
    input.primaryContextForCompanionRate
  ) {
    const ctx = input.primaryContextForCompanionRate;
    const primaryHoldingYears = Math.floor(ctx.holdingMonths / 12);
    /**
     * 2026-08-13 정정 (F11 — **세액 변경**): 표1 공제율과 3년 진입요건이 primary **주택**의
     * 보유개월을 보고 있었다. 「소득세법」 §95④ 본문은 「제2항에서 규정하는 자산의 보유기간은
     * **그 자산의 취득일부터 양도일까지**로 한다」이고, 같은 항 **단서의 예외는 §97의2①(이월과세)와
     * 가업상속공제 적용비율분 둘로 한정 열거**돼 부수토지 예외가 없다. §95②의 진입요건
     * 「보유기간이 3년 이상인 것」도 이 정의를 따른다.
     *
     * 일체과세 근거인 §104①2호 괄호는 「주택(이에 딸린 토지…를 포함한다. **이하 이 항에서 같다**)」라
     * 정의확장을 **제104조 제1항 내부로 한정**한다 — §95(장특) 보유기간 축으로 전이되지 않는다.
     * 세율 축 근거를 장특에 원용한 것이 오류의 원인이었다.
     *
     * 실측: 토지 2021-06-01 취득(양도 2024-06-01 기준 2년 11개월) · 주 주택 14년 · 양도 5억/취득 1억
     *   → 종전 표1 28%(112,000,000 공제)·총세액 97,405,000
     *   → 토지 축 0%·총세액 146,366,000 (48,961,000 과소과세였다).
     *
     * ⚠️ **표2(1세대1주택) 축은 그대로 둔다.** 기획재정부 재산세제과-1183(2010.12.10)은
     *    「토지 전체보유기간에 따른 **표1**의 공제율과 주택 부수토지로서의 보유기간에 따른
     *    **표2**의 공제율 중 **큰** 공제율」을 적용하라고 하나, 그 예규들은 전부 표2가 보유
     *    **단일축**이던 시기(~2018) 것이라 현행 2축 표2(보유분+거주분)에 max를 어떻게 대입할지가
     *    **미확정**이다(nts 48건·6건, 조세심판원 5건 전수 조회 결과 부존재). 여기서는 §95④ 문리만으로
     *    확정되는 **표1 축·3년 게이트**만 고친다.
     */
    const landHolding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
    // 부수토지는 1세대1주택 여부·거주기간을 주택과 공유. 표2 대상 판정은 본 게이트(:아래 L-3)와
    // **같은 술어**여야 한다 — 한쪽만 §159의4 의제를 반영하면 부수토지 경로가 어긋난다.
    const isOneHouseSingleForCompanion =
      input.isOneHousehold && (input.householdHousingCount === 1 || deemedOneHouseBy155 === true);
    const residenceYears = Math.floor(input.residencePeriodMonths / 12); // 실거주(거주분 공제율)
    const table2ResidenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12); // 통산(대상 판정)
    const useTable2ForCompanion = isOneHouseSingleForCompanion && table2ResidenceYears >= 2;
    // 표2(1세대1주택 — 보유분 4% + 실거주분 4%, 각 40% 캡)는 주택 보유연수,
    // 표1(일반 보유 × 2%, 30% 캡)은 **토지 자신의** 보유연수.
    const companionHoldingYears = useTable2ForCompanion ? primaryHoldingYears : landHolding.years;
    // 3년 진입요건도 같은 축이다 — `calcLongTermRate` 정본에 3년 가드가 내장돼 있어
    // 외곽 게이트를 따로 두지 않는다(종전 `ctx.holdingMonths < 36` 외곽 return은 축이 어긋나 있었다).
    const companionRate = calcLongTermRate(
      companionHoldingYears,
      residenceYears,
      useTable2ForCompanion,
    );
    const deduction = companionRate > 0 ? applyLthdRate(taxableGain, companionRate) : 0;
    // 표시용 보유기간은 **공제율을 만든 축**과 맞춘다 — 어긋나면 산식이 자기모순으로 출력된다
    // (실측 종전: "보유 2년×2% = 28% | 보유기간 2년 11개월").
    const displayHolding = useTable2ForCompanion
      ? { years: primaryHoldingYears, months: ctx.holdingMonths % 12 }
      : { years: landHolding.years, months: landHolding.months };
    return {
      deduction,
      rate: companionRate,
      holdingPeriod: displayHolding,
    };
  }

  // L-1c: 장기임대주택 특례율 우선 적용
  if (input.rentalReductionDetails && longTermRentalRules) {
    const override = getLongTermDeductionOverride(
      input.rentalReductionDetails,
      longTermRentalRules,
    );
    if (override.hasOverride) {
      const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
      const deduction = applyLthdRate(taxableGain, override.overrideRate);
      return {
        deduction,
        rate: override.overrideRate,
        holdingPeriod: { years: holding.years, months: holding.months },
      };
    }
  }

  /**
   * ⚠️ **두 축이 같은 이름을 쓰지 않도록 나눈다** (2026-08-13 F10).
   *   · `isOneHouseSingle`        — 실제 보유 주택 수 축. §95⑤ 진입조건·12억 초과분 안분에 쓴다.
   *   · `isOneHouseForTable2`     — 「소득세법 시행령」 §159의4 표2 **대상** 축. §155 의제를 포함한다.
   * §159의4는 표2 대상을 「1주택(제155조 … 및 그 밖의 규정에 따라 1세대 1주택으로 보는 주택을
   * 포함한다)을 보유하고 보유기간 중 거주기간이 2년 이상인 것」으로 정의하므로, 실제 주택 수만
   * 보면 §155①④⑤⑦⑧ 의제 주택이 표1(최대 30%)로 떨어진다
   * (실측: 12억 초과 고가주택에서 표1 16% vs 표2 64% — 총세액 23,633,500 vs 5,838,642).
   */
  const isOneHouseSingle =
    input.isOneHousehold && input.householdHousingCount === 1;
  const isOneHouseForTable2 =
    isOneHouseSingle || (input.isOneHousehold && deemedOneHouseBy155 === true);
  const residenceYears = Math.floor(input.residencePeriodMonths / 12); // 실거주(표2 거주분 공제율)
  // §154⑧3호: 표2 "대상 판정"은 동일세대 상속 통산 거주 (공제율은 실거주 residenceYears 유지).
  const table2ResidenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12);

  // L-2: 「소득세법」 §95⑤·⑥ — 비주택으로 보유하다 주택으로 용도변경한 뒤 양도하는 경우.
  //   보유분 = 비주택 기간 표1 + 주택 기간 표2 (합계 40% 한도 — 같은 항 1호 단서)
  //   거주분 = 표2 거주분 (주택으로 보유한 기간 중의 거주기간 — 같은 항 2호)
  // 게이트는 §95⑤ 본문("제89조 제1항 제3호 각 목의 어느 하나에 해당하는 자산")이 여는
  // 표2 대상 요건과 같다 — 시행령 §159의4가 §95⑤을 명시 포함한다.
  // 배제 경로(L-0 미등기·L-0a 분양권·L-1 중과·L-1b 부수토지·L-1c 임대특례)는 위에서 이미 return했다.
  // ⚠️ 여기는 **실제 1주택 축(`isOneHouseSingle`)을 유지**한다 — §159의4가 §95⑤을 포함하므로
  //    §155 의제까지 넓히는 것이 법령상으로는 정합하나, 그 확대는 용도변경 혼합공제 진입조건을
  //    함께 넓히는 별개 변경이라 이번 범위(표2 대상 축)에 넣지 않았다. 넓혀도 dead-end는 아니다
  //    — 진입하지 못하면 아래 L-3이 §159의4 축(`useTable2`)으로 표2를 적용한다.
  if (
    input.nonHousingToHousingConversion &&
    input.transferDate >= LTHD_CONVERSION_95_5_CUTOFF &&
    isOneHouseSingle &&
    table2ResidenceYears >= 2 &&
    !splitDetail // 토지·건물 분리취득과는 병용하지 않는다 (validation과 이중 방어)
  ) {
    const conv = input.nonHousingToHousingConversion;
    const info = calcUsagePeriodInfo(
      input.acquisitionDate,
      conv.residentialUseStartDate,
      input.transferDate,
    );
    // 폼 경로는 validation이 막지만 엔진 단독 호출(단위 테스트·자산별 직접 호출)은 거치지 않는다.
    // 기간 분해가 불가능한 날짜는 조용히 무시하지 않고 드러낸다.
    if (!info) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_DATE,
        `주거용 사용 개시일은 취득일 이후·양도일 이전이어야 합니다 (${TRANSFER.CONVERSION_HOUSING_PERIOD_START}).`,
        {
          acquisitionDate: input.acquisitionDate,
          residentialUseStartDate: conv.residentialUseStartDate,
          transferDate: input.transferDate,
        },
      );
    }

    const { table1Pct, table2HoldingPct, holdingPct, capped } = calcConversionHoldingPct(
      info.t1HoldingYears,
      info.t2HoldingYears,
    );

    // 거주분 — 표2 거주 8% 칸의 "(보유기간 3년 이상에 한정함)"은 **총 보유기간** 기준이다(V-4 확정).
    //   ① §95④ — "제2항에서 규정하는 자산의 보유기간은 취득일부터 양도일까지". 표2는 제2항의 표다.
    //   ② §95⑥ — 재정의 대상은 「주택으로 보유한 기간」이라는 별개 개념어이고 "보유기간"은 건드리지 않았다.
    //   ③ §95⑤ 첫머리는 "제2항 **단서**에도 불구하고" — 본문의 "보유기간 3년 이상" 대상 요건은 살아 있다.
    //   ④ §95⑤2호가 특정한 것은 거주기간 열에 **대입할 값**뿐이고 단서의 요건은 언급이 없다.
    // 반대해석(주택 보유기간 기준)은 ⑤1호가 표2 보유기간 열에 주택 기간을 대입하는 점을 근거로 하나,
    // 명문 없이 공제를 8%p 줄이는 방향이라 채택하지 않는다. 예규·심판례는 2026-08-05 현재 0건.
    const totalHolding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
    const residencePct = totalHolding.years < 3 ? 0 : Math.min(residenceYears * 4, 40);

    const totalPct = holdingPct + residencePct;
    return {
      // 정수 % + 분수 연산 — 표1(2% 배수) + 표2(4% 배수) 합이 소수로는 부정확해진다
      // (0.22 + 0.12 = 0.33999999999999997 → 1원 과소). conversion-holding-pct.ts 참조.
      deduction: applyRateFraction(taxableGain, totalPct, 100),
      rate: totalPct / 100, // 표시용
      holdingPeriod: { years: totalHolding.years, months: totalHolding.months },
      usageConversionDetail: {
        residentialUseStartDate: format(conv.residentialUseStartDate, "yyyy-MM-dd"),
        nonHousingYears: info.t1HoldingYears,
        housingYears: info.t2HoldingYears,
        table1Pct,
        table2HoldingPct,
        residencePct,
        holdingRateCapped: capped,
        residenceMonthsTrimmed: conv.residenceMonthsTrimmed,
      },
    };
  }

  // 공제율 산식 (L-3/L-4 통합 헬퍼) — `calcLongTermRate` 정본 위임.
  //   L-3: 1세대1주택 표2(§95② 별표) — 보유분·거주분 각 40% 캡 후 합산.
  //        대상 판정은 통산(table2ResidenceYears), 공제율 거주분은 실거주(residenceYears).
  //   L-4: 일반 표1 — 보유 × 2%, 30% 캡.
  //   3년 가드는 정본에 내장돼 있다.
  // §159의4는 「1주택(의제 포함)을 보유하**고** 거주 2년 이상」이라는 **연언(AND)**이다 —
  // 의제만으로 표2가 열리지 않으며 거주 2년 요건은 그대로 유지된다.
  const useTable2 = isOneHouseForTable2 && table2ResidenceYears >= 2;
  const rateForYears = (years: number): number =>
    calcLongTermRate(years, residenceYears, useTable2);

  // 토지/건물 분리 케이스 — 각각 보유연수 적용 후 합산
  if (splitDetail) {
    const selfOwns = splitDetail.selfOwns ?? "both";
    const ownsLand = selfOwns !== "building_only";
    const ownsBuilding = selfOwns !== "land_only";

    // 1세대1주택 12억 초과 안분: 본인 소유 파트 양도가액 기준
    const THRESHOLD = 1_200_000_000;
    const selfTransferPrice = selfOwns === "building_only"
      ? splitDetail.building.transferPrice
      : selfOwns === "land_only"
        ? splitDetail.land.transferPrice
        : input.transferPrice;
    // ⚠️ 여기는 **12억 안분 축**이지 표2 대상 축이 아니다 — 이름이 비슷해도 다른 판정이므로
    //    §159의4 의제(`isOneHouseForTable2`)를 대입하지 않는다. 12억 안분은 STEP 3
    //    (`resolveTaxableGain`)이 `checkExemption`의 `isPartialExempt`로 이미 판정한 축이다.
    const isProratedSplit = isOneHouseSingle && selfTransferPrice > THRESHOLD;
    const proratePartGain = (g: number): number => {
      if (!isProratedSplit || g <= 0) return g;
      return Math.floor(g * (selfTransferPrice - THRESHOLD) / selfTransferPrice);
    };

    // 파트별 과세 양도차익 — 호출부가 미리 확정해 두었으면(G-3 부수토지 비과세 제외 등) 그 값을
    // 따른다. 여기서 다시 안분하면 STEP 3의 과세 양도차익과 어긋난다(이중 진실).
    const landTaxableGain = ownsLand
      ? (splitDetail.land.taxableGainAfterProration ?? proratePartGain(splitDetail.land.gain))
      : 0;
    const buildingTaxableGain = ownsBuilding
      ? (splitDetail.building.taxableGainAfterProration ?? proratePartGain(splitDetail.building.gain))
      : 0;

    const landRate = ownsLand ? rateForYears(splitDetail.land.holdingYears) : 0;
    const buildingRate = ownsBuilding ? rateForYears(splitDetail.building.holdingYears) : 0;
    const landDed = ownsLand ? applyRate(Math.max(landTaxableGain, 0), landRate) : 0;
    const buildingDed = ownsBuilding ? applyRate(Math.max(buildingTaxableGain, 0), buildingRate) : 0;

    // SplitPartResult 에 공제율·공제액 채우기 (참조 수정)
    // 과세 양도차익도 함께 역기입 — 소비자(파트별 세율 §104⑤)가 `gain`(안분 전)과
    // `longTermDeduction`(안분 후) 축을 섞지 않도록 한다.
    splitDetail.land.taxableGainAfterProration = landTaxableGain;
    splitDetail.building.taxableGainAfterProration = buildingTaxableGain;
    splitDetail.land.longTermRate = landRate;
    splitDetail.land.longTermDeduction = landDed;
    splitDetail.building.longTermRate = buildingRate;
    splitDetail.building.longTermDeduction = buildingDed;

    // 배율 초과 부수토지(비사업용 토지) 파트 — 「소득세법」 제95조 제2항 **표1**(일반)을 쓴다.
    // 1세대1주택 표2는 비과세 대상 주택·부수토지 전용이고, 배율 초과분은 §104의3①5호로
    // 비사업용 토지이므로 대상이 아니다. 보유연수는 토지 본래 보유연수.
    const nb = splitDetail.nonBusinessLandPart;
    let nbDed = 0;
    if (nb) {
      const nbTaxableGain = nb.taxableGainAfterProration ?? nb.gain;
      const nbRate = calcLongTermRate(nb.holdingYears, 0, false); // 표1 — 정본 위임(3년 가드 내장)
      nbDed = applyRate(Math.max(nbTaxableGain, 0), nbRate);
      nb.taxableGainAfterProration = nbTaxableGain;
      nb.longTermRate = nbRate;
      nb.longTermDeduction = nbDed;
    }

    const anchorDate = selfOwns === "land_only" && input.landAcquisitionDate
      ? input.landAcquisitionDate
      : input.acquisitionDate;
    const anchorHolding = calculateHoldingPeriod(anchorDate, input.transferDate);
    return {
      deduction: landDed + buildingDed + nbDed,
      rate: 0, // 단일 공제율 없음 (혼합) — splitDetail.land/building.longTermRate 참조
      holdingPeriod: { years: anchorHolding.years, months: anchorHolding.months },
    };
  }

  // 단일 취득일 — 사례 35: 다주택 용도변경 시 LTHD 기산일 = conversionDate (사전법규재산 2022-684)
  const holding = calculateHoldingPeriod(resolveLTHDStartDate(input), input.transferDate);
  const holdingPeriod = { years: holding.years, months: holding.months };

  const rate = rateForYears(holding.years);

  // L-5: 「소득세법」 §95④ **후단** — 가업상속공제가 적용된 **비율에 해당하는 자산**의 보유기간은
  //      피상속인이 취득한 날부터 기산한다. (법률 제12169호, 2014.1.1 시행 — 연혁 대조 실측)
  //
  //   자산을 적용률 r로 관념 분할해 **각 부분을 제 기산일로** 본다(계획서 Q1 = 안 (a)):
  //     공제율 = r × rate(피상속인 취득일 기산) + (1−r) × rate(상속개시일 기산)
  //   「비율에 해당하는 자산」이라는 한정어를 살리는 독법이고, §97의2④이 취득가액을
  //   `피상속인 취득가액 × r + 상속개시일 평가액 × (1−r)`로 이미 쪼갠 축과 일치한다.
  //   (전부 상속개시일 기산으로 보면 후단이 사문화되므로 그 독법은 성립하지 않는다.)
  //
  //   ⚠️ **보유분만 가중한다.** 표2 거주분 공제율은 상속개시일 이후 상속인 실거주 기준을
  //      유지한다 — 후단은 「보유기간」만 규정하고 거주기간 승계 명문이 없다(계획서 Q3,
  //      사전-2025-법규재산-0506 질의2). `calcLongTermRate(y, 0, ...)`로 보유분만 뽑아
  //      가중한 뒤 거주분을 그대로 더한다(표1이면 거주분 0이라 자동으로 표1 식이 된다).
  //
  //   정수 연산: 공제율을 가중하지 않고 **양도차익을 안분**해 각각 floor한다(§97의3과 동일 패턴).
  //   양도차익 안분은 `Σ = 전체` 불변식이 성립하므로 잔액흡수가 정당하다.
  const fbl = input.fbLthdLatter;
  if (fbl) {
    const holdingFromDecedent = calculateHoldingPeriod(
      fbl.decedentAcquisitionDate,
      input.transferDate,
    );
    const holdOnly = (years: number): number => calcLongTermRate(years, 0, useTable2);
    const decedentHoldRate = holdOnly(holdingFromDecedent.years);
    const heirHoldRate = holdOnly(holding.years);
    const residencePart = rate - heirHoldRate; // 표2 거주분(표1이면 0)

    const positiveGain = Math.max(taxableGain, 0);
    const decedentGain = applyRateFraction(positiveGain, Math.round(fbl.appliedRate * 1_000_000), 1_000_000);
    const heirGain = positiveGain - decedentGain; // 잔액 흡수 — Σ = positiveGain

    const deduction =
      applyRate(decedentGain, decedentHoldRate) +
      applyRate(heirGain, heirHoldRate) +
      applyRate(positiveGain, residencePart);
    const blendedRate =
      fbl.appliedRate * decedentHoldRate + (1 - fbl.appliedRate) * heirHoldRate + residencePart;

    // 산식 표시 — 한국어 풀어쓰기(변수 약어·floor() 금지). 공제율이 소수(25.6% 등)일 수 있어
    // 반올림하지 않고 소수 첫째 자리까지 보여준다.
    const pct = (v: number): string => `${+(v * 100).toFixed(1)}`;
    const heirSharePct = pct(1 - fbl.appliedRate);
    const fbLthdFormula =
      `가업상속공제적용률 ${pct(fbl.appliedRate)}% 분은 피상속인 취득일부터 ${holdingFromDecedent.years}년 → ${pct(decedentHoldRate)}%` +
      ` + 나머지 ${heirSharePct}% 분은 상속개시일부터 ${holding.years}년 → ${pct(heirHoldRate)}%` +
      (residencePart > 0 ? ` + 거주분 ${pct(residencePart)}%` : "") +
      ` = ${pct(blendedRate)}%`;

    return { deduction, rate: blendedRate, holdingPeriod, fbLthdFormula };
  }

  // L-2': 장기임대 §97의3 (장특 70% 대체) / §97의4 (추가율 가산) — Phase 2 (2026-06-11)
  // reductions[]의 rental_97_3/rental_97_4 본 필드 항목을 평가. 임대분 안분은 조특령 §97의3⑤.
  const rental97Eval = evaluateRental97Lthd(input.reductions, {
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    stdPriceAtAcquisition: input.standardPriceAtAcquisition,
    stdPriceAtTransfer: input.standardPriceAtTransfer,
  });
  if (
    rental97Eval?.isEligible &&
    rental97Eval.effectCategory === "long_term_holding_special" &&
    rental97Eval.overrideRate !== undefined
  ) {
    // §97의3: 임대기간 분 양도차익 × 70% + 비임대분 × 일반율 (ratio=1이면 전액 70%)
    const positiveGain = Math.max(taxableGain, 0);
    const rentalGain = applyRate(positiveGain, rental97Eval.rentalGainRatio);
    const nonRentalGain = positiveGain - rentalGain;
    const deduction = applyRate(rentalGain, rental97Eval.overrideRate) + applyRate(nonRentalGain, rate);
    const blendedRate =
      rental97Eval.overrideRate * rental97Eval.rentalGainRatio + rate * (1 - rental97Eval.rentalGainRatio);
    return {
      deduction,
      rate: blendedRate,
      holdingPeriod,
      // [echo] 결과 카드 산식 표시용 — 계산에는 관여하지 않는다(위 값 그대로 실어 보낸다)
      rental97LthdDetail: {
        ...rental97Eval,
        baseLthdRate: rate,
        gainApplied: positiveGain,
        rentalGainApplied: rentalGain,
        nonRentalGainApplied: nonRentalGain,
        deductionApplied: deduction,
      },
    };
  }
  if (
    rental97Eval?.isEligible &&
    rental97Eval.effectCategory === "long_term_holding_additional" &&
    rental97Eval.additionalRate !== undefined
  ) {
    // §97의4① **단서** — 「다만, 같은 항 단서에 해당하는 경우에는 그러하지 아니하다」 (D2-01)
    //
    // 직전 지시어가 「같은 조 **제2항**」이므로 「같은 항」 = 소득세법 §95②이고,
    // §95② 단서는 「다만, 대통령령으로 정하는 **1세대 1주택**…의 경우에는 … **표 2**…」다.
    // ⇒ 표2가 적용되는 1세대1주택 고가주택에는 추가공제율을 **가산하지 않는다**.
    //
    // 🔑 판정 술어를 새로 만들지 않는다 — 위 :269의 `useTable2`가 이미 §95② 단서 해당 여부다.
    //    (같은 사실을 두 술어로 판정하면 드리프트한다 — memory `feedback_shared_predicate_argument_parity`)
    //
    // ⚠️ 배제해도 `rental97LthdDetail`은 남긴다. 사용자가 §97의4를 선택했는데 결과 화면에서
    //    통째로 사라지면 「왜 반영이 안 됐는지」를 알 길이 없다.
    if (useTable2) {
      return {
        deduction: applyLthdRate(taxableGain, rate),
        rate,
        holdingPeriod,
        rental97LthdDetail: {
          ...rental97Eval,
          isEligible: false,
          ineligibleReasons: [
            {
              code: "TABLE2_PROVISO_EXCLUDED",
              message:
                "1세대1주택 장기보유특별공제 표2(소득세법 §95② 단서) 적용 대상이므로 " +
                "§97의4 추가공제율을 가산하지 않습니다 (조특법 §97의4① 단서).",
              legalBasis: "조특법 §97의4① 단서 · 소득세법 §95② 단서",
            },
          ],
          baseLthdRate: rate,
          gainApplied: taxableGain,
          deductionApplied: applyLthdRate(taxableGain, rate),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
    }

    // §97의4: 보유기간별 공제율(§95② 표1)에 추가율 가산 — 기본 공제율이 0(보유 3년 미만)이면 가산 불가
    if (rate > 0) {
      const combined = rate + rental97Eval.additionalRate;
      const combinedDeduction = applyLthdRate(taxableGain, combined);
      return {
        deduction: combinedDeduction,
        rate: combined,
        holdingPeriod,
        // [echo] 산식 표시용 — 계산 무관
        rental97LthdDetail: {
          ...rental97Eval,
          baseLthdRate: rate,
          gainApplied: taxableGain,
          deductionApplied: combinedDeduction,
        },
      };
    }
    return { deduction: 0, rate: 0, holdingPeriod, rental97LthdDetail: rental97Eval };
  }

  if (rate > 0) {
    const deduction = applyLthdRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod, rental97LthdDetail: rental97Eval };
  }

  return { deduction: 0, rate: 0, holdingPeriod, rental97LthdDetail: rental97Eval };
}
