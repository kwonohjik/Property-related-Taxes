/**
 * 계산명세서 32항목 — **4단계: 양도소득금액·기본공제** (800줄 분리, 2026-11-08)
 *
 * `DetailedStatementHelpers.ts`(793줄)의 `buildStatementItems` 4단계 구간을 그대로 옮겼다
 * (동작 변경 없음 — 순수 이동). 옮긴 행: 양도소득금액(incomeAmount) · 비과세 양도소득금액
 * (nontaxableIncome) · 세액감면대상금액(reductionTargetIncome) · 소득금액 감면대상
 * (reductionTargetIncome2) · 감면후 소득금액(incomeAmountAfter) · 기신고 양도소득금액
 * (priorIncomeAmount) · 기본공제(basicDeduction).
 *
 * 이 구간은 **out 0** 이다 — 뒤 단계(`appendLateStageItems`)가 이 구간의 지역 변수를 읽지 않아
 * `items`(Map)에 set 만 한다. 앞 단계에서 받는 값은 §161 판정(`isRentalHousingException`)과
 * 그 시나리오 ID(`rhScenarioId`) 두 개다 — 2단계(비과세·과세대상 양도차익)와 **같은 술어**를
 * 봐야 하므로 다시 계산하지 않고 호출부에서 넘겨받는다.
 *
 * 순환 차단: 공용 헬퍼는 원본이 아니라 `DetailedStatementLeaf.ts`에서 가져온다.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { AggregateMeta } from "./FilingFormTableHelpers";
import type { StatementItem } from "./DetailedStatementConfig";
import { findStepByLabel } from "./DetailedStatementLeaf";
import { buildPerAssetWithFormula } from "./DetailedStatementLeaf";
import { buildIncomeFormula } from "./DetailedStatementFormulaBuilders";
import { buildIncomeDeductionReducibleFormula } from "./DetailedStatementFormulaBuilders";
import { reductionEligibleIncome } from "./reduction-eligible-income";
import { incomeDeductionReducible } from "./reduction-eligible-income";
import { pickIncomeDeductionFormulaSource } from "./reduction-eligible-income";
import { eligibleIncomeBasisText } from "./reduction-eligible-income";
import { INCOME_DEDUCTION_5YEAR_FORMULA } from "./DetailedStatementFormulaNodes";
import { nontaxableIncomeLabel } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/display-labels";

/** 4단계 — `items` 에 **set 만** 한다(반환 없음). */
export function setIncomeAndBasicDeductionItems(
  items: Map<string, StatementItem>,
  ctx: {
    result: TransferTaxResult;
    isAggregate: boolean;
    properties: PerPropertyBreakdown[];
    aggregate: AggregateMeta | undefined;
    /** §161(장기임대주택 보유자 거주주택 비과세) 경로 — 2단계와 같은 술어(호출부에서 판정). */
    isRentalHousingException: boolean;
    /** 「(소령 §161①)」 라벨 분기용 시나리오 ID. */
    rhScenarioId: NonNullable<TransferTaxResult["rentalHousingExceptionDetail"]>["scenarioId"] | undefined;
  },
): void {
  const { result, isAggregate, properties, aggregate, isRentalHousingException, rhScenarioId } = ctx;
  /**
   * 🔴 **`findStepByLabel`은 부분일치라 「비과세 양도소득금액」을 잡는다** (2026-09-07 UI 리뷰).
   *
   * §161 경로의 steps에는 순수 「양도소득금액」 step이 없다 — 엔진이 STEP 4.5 앞에서
   * 즉시 반환하기 때문이다(`transfer-tax.ts:437~451`). 남는 것은
   * 「비과세 양도소득금액 (소령 §161①)」뿐이라, 그 산식(`§95① 양도소득금액 X −
   * 과세대상 양도소득금액 Y = Z`)과 법령이 **「양도소득금액」 행에** 붙어 바로 아래
   * 비과세 행과 같은 산식이 두 번 찍혔다. 비과세 라벨을 먼저 걸러낸다.
   */
  const incomeStep = findStepByLabel(
    result.steps?.filter((s) => !s.label?.includes("비과세") && !s.label?.includes("양도소득금액 차감")),
    "양도소득금액",
  );
  const sumIncome = isAggregate
    ? properties.reduce((s, p) => s + p.incomeAfterOffset, 0)
    : 0;
  /**
   * §161(장기임대주택 보유자 거주주택 비과세, `isRH`)만 **분기한다** (2026-09-06 · UI 리뷰
   * `rh161-income-double-deduct`).
   *
   * 🔴 그 경로에서 엔진은 `taxableGain` 슬롯에 **이미 장특공제·§161 안분이 끝난 양도소득금액**을
   *   담는다(`transfer-tax-rental-housing-step.ts:617` `taxableGain: totalTaxableIncome`).
   *   여기서 장특공제를 또 빼면 「양도소득금액」이 그만큼 과소 표시되고, 바로 아래
   *   「감면후 소득금액」은 isRH 분기를 타 `result.taxableGain`을 그대로 쓰므로
   *   **감면후가 감면 전보다 커지는** 자기모순이 표에 그대로 남는다.
   *
   * 🔑 신고서 카드(`FilingFormTableHelpers.ts:603`)는 이미 같은 분기를 쓴다 — 두 카드의
   *   「양도소득금액」이 갈리지 않도록 **같은 식**을 쓴다(비과세분은 아래 「비과세 양도소득금액
   *   (소령 §161①)」 행이 별도로 보여 준다 — 신고서와 같은 구조다).
   *
   * ⚠️ 이 값은 ⑲ 세액감면대상금액 산정에도 그대로 흘러간다(:515).
   *
   * 🔴 **`Math.max(0, …)`를 걷어냈다** (2026-09-16 · 양도차손 보존).
   *   엔진이 차손을 보존하게 되자 이 바닥이 **같은 화면의 두 카드를 갈랐다** —
   *   신고서(`FilingFormTableHelpers.ts:619~621`)는 바닥이 없어 **−20,000,000**,
   *   여기는 **0**을 찍었다. 위 주석이 「같은 식을 쓴다」고 적어 둔 바로 그 정합이 깨진다.
   *   §95①(양도소득금액 = 양도차익 − 장특공제)에는 차익 단계 바닥이 없고, 0 바닥은
   *   과세표준(§92)·「감면후 소득금액」(:623)이 각자 담당하므로 정보 손실도 없다.
   */
  const singleIncome = isRentalHousingException
    ? result.transferGain - result.longTermHoldingDeduction
    : result.taxableGain - result.longTermHoldingDeduction;
  items.set("incomeAmount", {
    label: "양도소득금액",
    value: isAggregate ? sumIncome : singleIncome,
    formula:
      incomeStep?.formula ?? "과세대상 양도차익 − 장기보유특별공제 (음수 시 0)",
    legalBasis: incomeStep?.legalBasis ?? "소득세법 §95①",
    note: isAggregate
      ? "다건 모드: §102② 차손통산(같은 그룹 우선·타군 안분) 후의 자산별 합계"
      : isRentalHousingException
        ? "§161 특례: 전체 양도차익 기준(비과세분 포함) — 비과세 부분은 아래 행에서 차감합니다"
        : undefined,
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          (p) => p.incomeAfterOffset,
          (p) => {
            const given = (aggregate?.aggregated.lossOffsetTable ?? []).filter((row) => row.fromPropertyId === p.propertyId);
            return buildIncomeFormula(
              p,
              given.reduce((sum, row) => sum + row.amount, 0),
              [...new Set(given.flatMap((row) => (row.fromPart ? [row.fromPart] : [])))],
            );
          },
        )
      : undefined,
  });

  // 비과세 양도소득금액 — 엔진이 emit한 §161① step의 산식·법령 우선 사용 (정확한 변수값).
  const nontaxStep = findStepByLabel(result.steps, "비과세 양도소득금액");
  items.set("nontaxableIncome", {
    // 특례 적용 결과만 시나리오별 라벨 — 미적용은 종전 라벨(행은 특례 때만 값이 있다).
    label: isRentalHousingException ? nontaxableIncomeLabel(rhScenarioId) : "비과세 양도소득금액 (소령 §161①)",
    value: result.nontaxableGainAmount ?? 0,
    formula:
      nontaxStep?.formula ??
      "§95① 양도소득금액 − 과세대상 양도소득금액 — §155⑳ + §161 안분 비과세 부분",
    legalBasis: nontaxStep?.legalBasis ?? "소득세법 시행령 §161·§155⑳",
    note: "장기임대주택 거주주택 비과세 특례 시만 표시",
  });

  // ⑲ 세액감면대상금액 = 감면대상 양도소득금액 (§90① — 감면율 前). §77 계열 reducibleIncome은 감면율 곱값이라 부적합.
  const eligibleIncomeOf = (p: (typeof properties)[number]) =>
    reductionEligibleIncome(
      p.reductionType,
      p.income,
      p.reducibleIncome ?? 0,
      p.replacementLandDetail?.eligibleTransferIncome,
      p.eligibleIncomeAfterLoss,
    );
  const eligibleValue = isAggregate
    ? properties.reduce((s, p) => s + eligibleIncomeOf(p), 0)
    : reductionEligibleIncome(
        result.reductionTypeApplied,
        singleIncome,
        result.reducibleIncome ?? 0,
        result.replacementLandDetail?.eligibleTransferIncome,
        result.eligibleIncomeAfterLoss,
      );
  items.set("reductionTargetIncome", {
    label: "세액감면대상금액",
    value: eligibleValue,
    // ⑲는 **감면율을 곱하기 前** 대상 소득금액이다(부표1 작성방법 14번 — 감면율은 16번 별도 칸).
    // 조문마다 기준이 달라(전액/대토보상분/임대기간 안분) 그 근거를 함께 보인다.
    formula: isAggregate
      ? `자산별 감면 적용 대상 양도소득금액 합계 = ${eligibleValue.toLocaleString()} (§90① 세액감면방식 — 감면율·기본공제 前)`
      : `${eligibleIncomeBasisText(result.reductionTypeApplied, eligibleValue)} — §90① 세액감면방식이라 감면율·기본공제를 곱하기 전 금액이며, 소득금액에서 차감하지 않습니다`,
    legalBasis: "소득세법 §90① · 조세특례제한법 §127",
    perAsset: isAggregate
      ? buildPerAssetWithFormula(
          properties,
          eligibleIncomeOf,
          (p) => (eligibleIncomeOf(p) > 0 ? `감면 대상 양도소득금액 = ${eligibleIncomeOf(p).toLocaleString()}` : "감면 대상 없음"),
        )
      : undefined,
  });

  // 소득금액차감방식(§90②) 5년 안분 감면대상 양도소득금액 — §99의3·§99·§98의8·하이브리드 공용.
  // 집계(다건)는 PerPropertyBreakdown의 incomeDeductionReducible 합산, 단건은 result detail 합산 헬퍼.
  const aggIncomeDeductionReducible = isAggregate
    ? properties.reduce((s, p) => s + (p.incomeDeductionReducible ?? 0), 0)
    : 0;
  const singleIncomeDeduction = incomeDeductionReducible(result);
  const incomeDeductionFormulaSource = pickIncomeDeductionFormulaSource(result);
  items.set("reductionTargetIncome2", {
    label: "소득금액 감면대상",
    value: isAggregate ? aggIncomeDeductionReducible : singleIncomeDeduction,
    formula:
      // 소득금액차감 8조문 공용 — 3시점 기준시가 echo가 있으면 값이 대입된 분수 산식을 쓴다.
      // 감면액이 0이어도 값과 사유를 함께 보인다(결과만 0이면 왜 0인지 알 수 없다).
      // echo가 없는 구 저장 이력·다건 집계는 종전 일반 문구로 fallback.
      !isAggregate && incomeDeductionFormulaSource
        ? buildIncomeDeductionReducibleFormula(incomeDeductionFormulaSource, singleIncome)
        : INCOME_DEDUCTION_5YEAR_FORMULA,
    legalBasis: "조세특례제한법 §99의3·§99·§98의8 등 · 소득세법 §90②",
    note: "신축·미분양 등 소득금액차감 감면 — 소득금액에서 직접 차감(세액감면방식 아님)",
  });

  // 감면후 소득금액 = 양도소득금액 − 소득금액 감면대상(§90② 소득금액차감). FilingFormTableHelpers와 동일.
  // §161(장기임대 거주주택 비과세, isRH)은 taxableGain이 이미 안분 후 값이므로 별도 분기.
  // 위 4단계에서 이미 판정했다 — 같은 술어를 두 번 쓰지 않는다(두 곳이 갈리면 표가 다시 모순된다).
  const isRH = isRentalHousingException;
  const incomeAfterValue = isAggregate
    ? properties.reduce((s, p) => s + Math.max(0, p.incomeAfterOffset - (p.incomeDeductionReducible ?? 0)), 0)
    : isRH
      ? Math.max(0, result.taxableGain - singleIncomeDeduction) // §155⑳ 경로 차감(NH-37 · US-43)도 안분 후 과세분에서 뺀다
      : Math.max(0, singleIncome - singleIncomeDeduction);
  items.set("incomeAmountAfter", {
    label: "감면후 소득금액",
    value: incomeAfterValue,
    formula: isAggregate
      ? `자산별 (양도소득금액 − 소득금액 감면대상) 합계 = ${incomeAfterValue.toLocaleString()}`
      : isRH
        ? singleIncomeDeduction > 0
          ? `과세대상 양도소득금액 ${result.taxableGain.toLocaleString()} (§161 안분 후) − 소득금액 감면대상 ${singleIncomeDeduction.toLocaleString()} = ${incomeAfterValue.toLocaleString()}`
          : `과세대상 양도소득금액 ${result.taxableGain.toLocaleString()} (§161 안분 후 — 세액감면방식 소득금액 미차감)`
        : `양도소득금액 ${singleIncome.toLocaleString()} − 소득금액 감면대상 ${singleIncomeDeduction.toLocaleString()} = ${incomeAfterValue.toLocaleString()}`,
    legalBasis: "소득세법 §95·§90②",
    note: "소득금액차감 감면 반영 후 소득금액 (세액감면방식은 소득금액 미차감)",
  });

  items.set("priorIncomeAmount", {
    label: "기신고 양도소득금액",
    value: 0,
    formula: "역년 내 이미 신고한 양도소득금액 합계 (예정신고분)",
    // 소득세법 시행령 §103은 **삭제**됐다(실측 — 본문이 「삭제」 두 글자다).
    // 예정신고분 정산의 정본은 §107②·§111③이고, 같은 결과탭의 신고서 양식이 이미
    // 「기납부세액 (예정신고, §111③)」으로 적고 있다 (결과탭 코드리뷰 #031).
    legalBasis: "소득세법 §107②·§111③",
    note: "본 계산기는 기신고분을 반영하지 않음 (필요 시 별도 차감)",
    summaryOnly: true,
  });

  const basicStep = findStepByLabel(result.steps, "기본공제");
  items.set("basicDeduction", {
    label: "기본공제",
    value: result.basicDeduction,
    formula: basicStep?.formula ?? "연 250만원 한도 (§103) — 자산별 배분 후 합계",
    legalBasis: basicStep?.legalBasis ?? "소득세법 §103",
    summaryOnly: true,
  });
}
