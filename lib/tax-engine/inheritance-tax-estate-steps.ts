/**
 * 상속세 — **STEP 1~5**: 재산 평가 · 비과세 · §14 차감 · §15 추정상속재산 · §13 사전증여 합산 ·
 * 상속세 과세가액.
 *
 * `inheritance-tax.ts`의 `calcInheritanceTax`(772줄 단일 함수)에서 분리했다(800줄 정책).
 * 입력이 **누적 배열 3개 + `preGifts`** 뿐이라 이음매가 좁고, 호출부가 구조분해로 받으므로
 * **하류 참조가 하나도 바뀌지 않는다** — 무동작 리팩터임을 그 형태가 보장한다.
 *
 * ⚠️ `allBreakdown`·`allLaws`·`allWarnings`는 **호출부 컬렉션을 그대로 받아 push/add**한다
 *    (반환하지 않는다) — 종전 순서를 지키기 위함이다.
 */
import { INH } from "./legal-codes";
import type { InheritanceTaxInput, CalculationStep } from "./types/inheritance-gift.types";
import { evaluateAllEstateItems } from "./property-valuation";
import { evaluateExemptions } from "./exemption-evaluator";
import {
  aggregatePriorGiftsForInheritance,
  isWithin13Cutoff,
  calcFuneralExpenseDeduction,
} from "./inheritance-gift-common";
import { evaluatePresumedInheritance } from "./presumed-inheritance";
import { deriveCollateralDebts, sumCollateralDebt } from "./inheritance-collateral-debt";

export function runEstateValuationSteps(
  input: InheritanceTaxInput,
  allBreakdown: CalculationStep[],
  allLaws: Set<string>,
  allWarnings: string[],
  preGifts: NonNullable<InheritanceTaxInput["preGiftsWithin10Years"]>,
) {
  // ─────────────────────────────────────────────
  // STEP 1: 재산 평가
  // ─────────────────────────────────────────────
  const valuationResults = evaluateAllEstateItems(input.estateItems);

  const grossEstateValue = valuationResults.reduce(
    (sum, v) => sum + v.valuatedAmount,
    0,
  );

  allBreakdown.push({
    label: "상속재산 평가액 합계",
    amount: grossEstateValue,
    lawRef: INH.TAXABLE_VALUE,
  });

  for (const vr of valuationResults) {
    allWarnings.push(...vr.warnings);
  }

  // ─────────────────────────────────────────────
  // STEP 2: 비과세 차감
  // ─────────────────────────────────────────────
  let exemptAmount = 0;
  let exemptionDetail: ReturnType<typeof evaluateExemptions> | undefined;
  if (input.exemptions && input.exemptions.length > 0) {
    const exemptResult = evaluateExemptions(input.exemptions, grossEstateValue, "inheritance");
    exemptAmount = exemptResult.totalExemptAmount;
    allBreakdown.push(...exemptResult.breakdown);
    exemptionDetail = exemptResult;
  }

  // ─────────────────────────────────────────────
  // STEP 3: 장례비·공과금·채무 차감 (§14)
  //   debtItems 입력 시 우선 적용 (협의분할 가능). 미입력 시 legacy debts·funeralExpense 사용.
  // ─────────────────────────────────────────────
  let funeralDeduction = 0;
  let nonFuneralDebts = 0;

  // H-33: 비거주자는 §14②에 따라 (1)해당재산 공과금·(2)국내재산 담보채무·(3)국내사업장 장부채무만 차감.
  //   장례비(§14①2호)·무담보 일반채무(financial·personal)는 §14②에 미열거 → 차감 불가.
  //   공과금(tax 카테고리 §14②1호)·담보채무(collateral §14②2호)는 유지.
  const isNonResident = input.decedentType === "non_resident";

  // 담보채무 §14 자동공제 (collateral-debt-auto-deduction) — opt-in ON 자산의 담보채권액을 derive
  const collateralDebts = deriveCollateralDebts(input.estateItems);
  const collateralTotal = sumCollateralDebt(collateralDebts);

  if (input.debtItems && input.debtItems.length > 0) {
    // 신규 debtItems 경로 — category별 합산 + 장례비 한도 적용
    let funeralMeal = 0; // 식대 한도 1천만
    let funeralBongan = 0; // 봉안 한도 5백만
    for (const di of input.debtItems) {
      if (di.category === "funeral") {
        if (di.isBongan) funeralBongan += di.amount;
        else funeralMeal += di.amount;
      } else if (isNonResident && di.category !== "tax") {
        // 비거주자 — 무담보 일반채무(financial·personal) §14② 배제. 공과금(tax)만 유지.
        continue;
      } else {
        nonFuneralDebts += di.amount;
      }
    }
    // 상증령 §9②: 식대 clamp[500만,1천만] + 봉안 min(실제,500만). 단일진실 헬퍼로 통일.
    //   비거주자는 §14②에 장례비 호 부재 → 차감 배제(0).
    funeralDeduction = isNonResident
      ? 0
      : calcFuneralExpenseDeduction(funeralMeal, funeralBongan).deduction;
    allBreakdown.push({
      label: isNonResident ? "장례비 — 비거주자 §14② 배제" : "장례비 (식대 한도 500만~1천만 + 봉안 한도 5백만)",
      amount: -funeralDeduction,
      lawRef: INH.DEBT_DEDUCTION,
      note: isNonResident
        ? "비거주자는 §14②에 장례비 호 부재 → 차감 불가"
        : `식대 ${funeralMeal.toLocaleString()} → ${Math.min(Math.max(funeralMeal, 5_000_000), 10_000_000).toLocaleString()}, 봉안 ${funeralBongan.toLocaleString()} → ${Math.min(funeralBongan, 5_000_000).toLocaleString()}`,
    });
    allBreakdown.push({
      label: isNonResident ? "공과금 차감 (비거주자 §14②1호 — 무담보 일반채무 배제)" : "공과금·채무 차감",
      amount: -nonFuneralDebts,
      lawRef: INH.DEBT_DEDUCTION,
    });
  } else {
    // Legacy/Simple 경로 — funeralExpense + funeralBonganExpense (or funeralIncludesBongan compat)
    // funeralBonganExpense 가 제공되면 §9②분리 적용, 없으면 legacy boolean 호환
    const fd =
      input.funeralBonganExpense !== undefined
        ? calcFuneralExpenseDeduction(input.funeralExpense, input.funeralBonganExpense)
        : calcFuneralExpenseDeduction(input.funeralExpense, input.funeralIncludesBongan);
    // 비거주자 — 장례비·무담보 일반채무(legacy debts는 미분류 → §14② 배제) 차감 불가
    funeralDeduction = isNonResident ? 0 : fd.deduction;
    if (!isNonResident) allBreakdown.push(...fd.breakdown);
    nonFuneralDebts = isNonResident ? 0 : input.debts;
    allBreakdown.push({
      label: isNonResident ? "공과금·채무 — 비거주자 §14② 배제 (미분류 legacy 채무)" : "공과금·채무 차감",
      amount: -nonFuneralDebts,
      lawRef: INH.DEBT_DEDUCTION,
    });
  }
  // 담보채무 §14 자동공제 합산 (debtItems/legacy 경로 무관 — 별개 출처)
  if (collateralTotal > 0) {
    nonFuneralDebts += collateralTotal;
    allBreakdown.push({
      label: "담보채무 §14 자동공제 (자산 평가 연동)",
      amount: -collateralTotal,
      lawRef: INH.DEBT_DEDUCTION,
      note: collateralDebts
        .map((d) => `${d.creditorName} ${d.amount.toLocaleString()}`)
        .join(", "),
    });
  }
  allLaws.add(INH.DEBT_DEDUCTION);
  const deductedBeforeAggregation = funeralDeduction + nonFuneralDebts;

  // ─────────────────────────────────────────────
  // STEP 3.5: 추정상속재산 §15 (Phase A)
  // ─────────────────────────────────────────────
  let presumedTotal = 0;
  let presumedDetail:
    | { items: ReturnType<typeof evaluatePresumedInheritance>["items"]; total: number }
    | undefined;
  if (input.presumedItems && input.presumedItems.length > 0) {
    const presumedResult = evaluatePresumedInheritance(input.presumedItems);
    presumedTotal = presumedResult.total;
    presumedDetail = presumedResult;
    for (const ir of presumedResult.items) {
      allBreakdown.push(...ir.breakdown);
    }
    allBreakdown.push({
      label: "추정상속재산 §15 합계",
      amount: presumedTotal,
      lawRef: INH.PRESUMPTION,
    });
    allLaws.add(INH.PRESUMPTION);
  }

  // ─────────────────────────────────────────────
  // STEP 4: 사전증여재산 합산 (§13)
  // ─────────────────────────────────────────────
  const { totalAmount: priorGiftAggregated, breakdown: priorGiftBreakdown } =
    aggregatePriorGiftsForInheritance(
      preGifts,
      input.deathDate,
    );

  allBreakdown.push(...priorGiftBreakdown);

  // ─────────────────────────────────────────────
  // STEP 4.5: §13 cutoff 필터 끌어올림 (STEP 8.5·9·13 공유)
  //   cutoffFilteredGifts는 이하 세 STEP에서 동일 집합을 참조.
  //   (기존 STEP 13 내부에서 중복 계산하던 것을 단일 진실로 통일)
  // ─────────────────────────────────────────────
  const cutoffFilteredGifts = preGifts.filter(
    (g) => isWithin13Cutoff(g, input.deathDate),
  );

  // ─────────────────────────────────────────────
  // STEP 5: 상속세 과세가액 (추정상속재산 §15 포함)
  // ─────────────────────────────────────────────
  const taxableEstateValue = Math.max(
    0,
    grossEstateValue + presumedTotal - exemptAmount - deductedBeforeAggregation + priorGiftAggregated,
  );

  allBreakdown.push({
    label: "상속세 과세가액",
    amount: taxableEstateValue,
    lawRef: INH.TAXABLE_VALUE,
    note: "= 평가액 + 추정상속재산 - 비과세 - 장례·채무 + 사전증여",
  });

  // ─────────────────────────────────────────────
  return {
    collateralDebts,
    cutoffFilteredGifts,
    deductedBeforeAggregation,
    exemptAmount,
    exemptionDetail,
    funeralDeduction,
    grossEstateValue,
    nonFuneralDebts,
    presumedDetail,
    presumedTotal,
    taxableEstateValue,
    valuationResults,
    priorGiftAggregated,
  };
}
