/**
 * FilingFormTable 다자산 합산(aggregate) 모드 행 빌더 — 800줄 분리 정책에 따라 분리.
 *
 * 단건 buildRows(`FilingFormTableHelpers.ts`)의 32행 rowOrder와 동일 구조를 유지하면서
 * 합계 열 + 자산별 열로 enumerate. 자산별 산정이 어려운 합산-only 행
 * (과세표준·기본공제·지방세 등)은 합계만 채우고 자산 셀은 null.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import {
  effectiveGrossGain,
  assetTaxableGain,
  assetExemptGain,
} from "@/components/calc/results/transfer/exempt-gross-gain";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  type AggregateMeta,
  type ColumnKey,
  type RowDef,
  splitLtDeduction,
  holdingMonthsFromDates,
  holdingPeriodFromDates,
  fmtDate,
  fmtPeriod,
  getAcqDateForCard,
} from "./FilingFormTableHelpers";
import { reductionEligibleIncome } from "./reduction-eligible-income";
import { selectPriorFiledIndices } from "@/lib/calc/multi-prior-filed";
import { baseCardId, shareIndexOf } from "@/lib/tax-engine/general-building-share-id";

/** 일반건물이 엔진 내부에서 분해하는 카드 id (지분 접미사 제거 후 기준). */
const GB_CARD_BASE_IDS = new Set([
  "land",
  "land_business",
  "land_nbl",
  "building",
  "building1",
  "building2",
]);

export function buildAggregateRows(
  _result: TransferTaxResult,
  aggregate: AggregateMeta,
  formData: TransferFormData | undefined,
  acquisitionDateLabel?: string,
): RowDef[] {
  const { properties, aggregated } = aggregate;
  const transferDate = formData?.transferDate ?? "";
  const v: Record<string, Record<ColumnKey, number | string | null>> = {};

  function setNum(rowKey: string, col: ColumnKey, n: number | null) {
    if (!v[rowKey]) v[rowKey] = {};
    v[rowKey][col] = n;
  }
  function setStr(rowKey: string, col: ColumnKey, s: string) {
    if (!v[rowKey]) v[rowKey] = {};
    v[rowKey][col] = s;
  }

  // propertyId → AssetForm 매핑 (TransferTaxCalculator의 ownershipMap 패턴과 동일):
  //   assets[0] → "primary", assets[i>0] → assetId 그대로
  //   G-2 한도 초과 split: "{assetId}__appurtenant" / "{assetId}__excess" suffix 제거 후 재조회
  //   GB(일반건물 토지+건물 일괄): 단일 자산이 엔진 내부에서 "land"/"building"/"building1"/"building2" 카드로 분해됨 → assets[0]로 fallback
  //     - "building" (사례 31 비증축 경로) / "building1" (사례 33 증축 경로 원건물)
  //     - "building2" (사례 33 증축 경로 증축분 — acqDate는 증축일)
  function findAssetByPropertyId(pid: string): AssetForm | undefined {
    // NOTE: 이 함수 결과로 반환된 AssetForm의 landNature로
    // 컬럼 라벨 suffix "(부수토지)" / "(독립 나대지)"를 표시할 수 있음 — buildAggregateRows 호출부에서 사용.
    // 다건 multi: 각 property가 자기 form을 가짐 → propertyFormMap 우선 (bundled는 미주입 → 아래 formData 폴백)
    const fromPropertyForm = aggregate.propertyFormMap?.get(pid)?.assets[0];
    if (fromPropertyForm) return fromPropertyForm;
    if (!formData) return undefined;
    if (pid === "primary") return formData.assets[0];
    // 일반건물(토지+건물 일괄) — 토지·건물 분해된 카드는 assets에서 취득일·필요경비 메타를 가져온다.
    //
    // 🔴 **지분(%) 분할이면 `assets[0]`이 아니다.** 카드 id는 `land#1` 꼴이고 접미사 인덱스가
    //    곧 `assets`의 인덱스다(`transfer-tax-api-gb-shares.ts:168` — 같은 배열을 같은 순서로
    //    순회해 태깅한다). 지분마다 취득일이 다른 것이 이 기능의 존재 이유이므로,
    //    전부 `assets[0]`로 보내면 **신고서 취득일이 전 행 동일하게 틀린다**.
    //    종전에는 정확 비교라 `land#1`이 여기서 아예 안 걸려 메타가 **누락**됐다.
    if (formData.assets[0]?.assetKind === "general_building" && GB_CARD_BASE_IDS.has(baseCardId(pid))) {
      const shareIdx = shareIndexOf(pid);
      return shareIdx !== undefined ? formData.assets[shareIdx] : formData.assets[0];
    }
    const direct = formData.assets.find((a) => a.assetId === pid);
    if (direct) return direct;
    // split suffix 제거 fallback — 부수토지 한도 초과 분리 시 원본 assetId로 재조회
    const basePid = pid.replace(/__(appurtenant|excess)$/, "");
    if (basePid !== pid) return formData.assets.find((a) => a.assetId === basePid);
    return undefined;
  }

  // (getAcqDateForCard는 FilingFormTableHelpers.ts로 이전 — DRY 정리, DetailedStatementHelpers와 공유)

  // 합계 열 — 머리 정보 (자산별이라 합계는 양도일자만 채움)
  // 자산 양도일이 모두 동일하면 그 값, 다르면 "-" (상이 양도일은 대표값 무의미)
  const allColTransferDates = properties.map(
    (p) => aggregate.propertyFormMap?.get(p.propertyId)?.transferDate ?? transferDate,
  );
  const uniqTransferDates = new Set(allColTransferDates.filter(Boolean));
  setStr(
    "transferDate",
    "total",
    uniqTransferDates.size === 1 ? fmtDate([...uniqTransferDates][0]!) : "-",
  );
  setStr("acquisitionDate", "total", "-");
  setStr("holdingPeriod", "total", "-");
  setStr("moveOut", "total", "-");
  setStr("moveIn", "total", "-");
  setStr("residencePeriod", "total", "-");

  let sumTransferPrice = 0;
  let sumAcqPrice = 0;
  let sumExpenses = 0;
  let sumTransferGain = 0;
  let sumTaxableGain = 0;
  let sumExemptGain = 0;
  let sumLtDeduction = 0;
  let sumLtHolding = 0;
  let sumLtResidence = 0;
  // 산출세액 행 주석: 자산별 shortTermNote (부수토지 일체과세 등 특수 세율)
  const taxNotes: Record<string, string> = {};
  /**
   * 「감면후 소득금액」 열이 「양도소득금액」보다 작은데 감면이 0인 경우의 근거.
   * 서식(별지 제84호 부표1)에는 §102② 결손금 통산 행이 없어, 종전에는 그 차액이
   * **무설명으로 사라졌다** (결과탭 코드리뷰 #072).
   */
  const offsetNotes: Record<string, string> = {};

  for (const p of properties) {
    const col = p.propertyId;
    // 다건 multi: 자산별 양도일 (bundled는 propertyFormMap 미주입 → 단일 transferDate 폴백)
    const colTransferDate = aggregate.propertyFormMap?.get(col)?.transferDate ?? transferDate;
    const a = findAssetByPropertyId(col);
    /**
     * 이 열이 **일반건물 일괄이 엔진 내부에서 쪼갠 파트**인가(토지·건물1·건물2).
     * 다건 양도의 「자산」과 달리 독립 신고 단위가 아니라 한 자산의 계산 파트다 —
     * 아래 세액 행에서 이 구별이 필요하다(`findAssetByPropertyId`와 같은 판정).
     */
    const isGbPartColumn =
      formData?.assets[0]?.assetKind === "general_building" &&
      GB_CARD_BASE_IDS.has(baseCardId(col));
    // GB 카드별 정확한 취득일(원건물=건물취득일·증축건물=증축일·토지=토지취득일).
    // 일반 자산은 asset.acquisitionDate 그대로.
    const acqDate = getAcqDateForCard(a, col);

    // 머리 정보
    setStr("transferDate", col, fmtDate(colTransferDate));
    setStr("acquisitionDate", col, fmtDate(acqDate));
    setStr("holdingPeriod", col, holdingPeriodFromDates(acqDate, colTransferDate));

    const periods = a?.residenceInputMode === "interval" ? a.residencePeriods ?? [] : [];
    const firstMoveIn = periods.length > 0 ? periods[0].moveInDate : "";
    const lastMoveOut = periods.length > 0
      ? (periods[periods.length - 1].moveOutDate || colTransferDate)
      : "";
    const residenceMs = (() => {
      if (a?.residenceInputMode === "interval" && periods.length > 0) {
        return periods.reduce((sum, pp) => {
          const end = pp.moveOutDate || colTransferDate;
          return sum + holdingMonthsFromDates(pp.moveInDate, end);
        }, 0);
      }
      return parseInt(a?.residencePeriodMonthsAsset || "0") || 0;
    })();
    setStr("moveOut", col, lastMoveOut ? fmtDate(lastMoveOut) : "-");
    setStr("moveIn", col, firstMoveIn ? fmtDate(firstMoveIn) : "-");
    setStr("residencePeriod", col, fmtPeriod(residenceMs));

    // 가격 — 신고서 양식 표시 관행: 자본적지출은 취득가액에 합산, 필요경비는 양도비만
    const displayAcq = p.acquisitionPrice + p.capitalExpenditureForDisplay;
    const displayExp = Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay);
    setNum("transferPrice", col, p.transferPrice);
    setNum("acquisitionPrice", col, displayAcq);
    setNum("expenses", col, displayExp);

    // 양도차익 / 비과세 / 과세대상 (자산별 역산)
    // 비과세 자산은 엔진 transferGain=0 → exemptGrossGain echo 사용 (전액 비과세 → 과세대상 0).
    // 비-비과세는 assetTaxableGain = max(0, income) + 장특공제 (income = taxableGain - 장특).
    // 자산별 신고서 어댑터(`MultiTransferPropertyBreakdown`)와 **같은 leaf**를 쓴다 —
    // 두 표가 같은 자산을 다르게 표시하던 것을 막는다(#019).
    const transferGain = effectiveGrossGain(p);
    const longTermDed = p.longTermHoldingDeduction;
    const taxableGainOfAsset = assetTaxableGain(p);
    const exemptGainOfAsset = assetExemptGain(p);
    setNum("transferGain", col, transferGain);
    setNum("exemptGain", col, exemptGainOfAsset);
    setNum("taxableGain", col, taxableGainOfAsset);

    // 장기보유공제 (계 + 보유분/거주분 분리)
    const holdingMs = holdingMonthsFromDates(acqDate, colTransferDate);
    // useTable2: 거주 ≥ 24개월 휴리스틱 (단건과 동일)
    const useTable2 = residenceMs >= 24;
    const split = splitLtDeduction(longTermDed, holdingMs, residenceMs, useTable2);
    setNum("ltDeduction", col, longTermDed);
    setNum("ltHoldingPart", col, split.holdingAmount);
    setNum("ltResidencePart", col, split.residenceAmount);

    // 양도소득금액
    setNum("incomeAmount", col, p.income);
    setNum("nontaxableIncome", col, 0);
    setNum(
      "reductionTargetIncome",
      col,
      reductionEligibleIncome(
        p.reductionType,
        p.income,
        p.reducibleIncome ?? 0,
        p.replacementLandDetail?.eligibleTransferIncome,
      ),
    );
    setNum("reductionTargetIncome2", col, p.incomeDeductionReducible ?? 0);
    setNum("incomeAmountAfter", col, Math.max(0, p.incomeAfterOffset - (p.incomeDeductionReducible ?? 0)));
    const received = p.lossOffsetFromSameGroup + p.lossOffsetFromOtherGroup;
    if (received > 0) {
      offsetNotes[col] =
        `결손금 통산 ${received.toLocaleString()} 반영 (소득세법 §102②) — 감면과 무관`;
    } else if (p.income < 0 && p.incomeAfterOffset === 0) {
      offsetNotes[col] =
        `결손금 ${Math.abs(p.income).toLocaleString()}이 다른 자산의 양도소득금액에 통산 (소득세법 §102②)`;
    }
    setNum("priorIncomeAmount", col, null); // 신고서 단위 개념 — 자산별 "-" (합계만 산정)

    // 합산-only 행 — 자산 셀 null
    setNum("basicDeduction", col, null);
    setNum("taxBase", col, null);

    /**
     * 자산별 세액 (참고) — **일반건물이 엔진 내부에서 쪼갠 파트 열에는 싣지 않는다**
     * (2026-08-12 사용자 지적).
     *
     * `refCalculatedTax`는 「자산 단독 참고값」이고 `Σ ref ≠ 합계`는 비교과세의 본질이라
     * 설계상 의도된 것이다(`transfer-tax-aggregate-helpers.ts` — ❌역안분 재제안 금지).
     * 다건 양도에서는 그 값이 **예정신고 단위**라 의미가 있으므로 그대로 둔다.
     *
     * 그러나 GB 일괄(토지·건물1·건물2)은 **한 자산이 쪼개진 계산 파트**다. 바로 위
     * 과세표준·기본공제가 이미 합산-only(자산 셀 `-`)인데 그 아래 세액만 파트별로 뜨면
     * **과세표준 없이 유도된 값**이 나란히 서고, 누진 합산이라 합도 맞지 않는다
     * (실측: 5,810,841 + 0 + 132,315 = 5,943,156 ≠ 합계 6,340,103).
     * ⇒ 산출세액부터는 합계만 표시한다.
     */
    const assetPenalty = (p.penaltyTax ?? 0) + (p.filingDelayedPenaltyTax ?? 0);
    if (isGbPartColumn) {
      setNum("calculatedTax", col, null);
      setNum("reductionTax", col, null);
      setNum("determinedTax", col, null);
      setNum("penaltyTax", col, null);
      setNum("totalDeterminedTax", col, null);
    } else {
      setNum("calculatedTax", col, p.refCalculatedTax);
      // 감면세액 ≤ 산출세액, «산출 − 감면 = 결정» 자기일관 (reductionAggregated 미cap 표시 정정).
      setNum("reductionTax", col, Math.max(0, p.refCalculatedTax - p.refDeterminedTax));
      setNum("determinedTax", col, p.refDeterminedTax);
      setNum("penaltyTax", col, assetPenalty);
      setNum("totalDeterminedTax", col, p.refDeterminedTax + assetPenalty);
    }

    // shortTermNote — 부수토지 일체과세 등 특수 세율 주석. 자산 열에 개별 저장.
    if (p.shortTermNote) {
      taxNotes[col] = p.shortTermNote;
    }

    // 농어촌특별세·지방세 — 합산-only
    setNum("ruralSurtax", col, null);
    setNum("localCalculatedTax", col, null);
    setNum("localReduction", col, null);
    setNum("localDeterminedTax", col, null);

    // 기납부·차감납부 (§111③ 예정신고 정산) — 신고서 단위 개념, 자산별 null
    setNum("priorPaidTax", col, null);
    setNum("deductedPayable", col, null);
    setNum("priorPaidLocalTax", col, null);
    setNum("deductedLocalPayable", col, null);

    // 합계 누적
    sumTransferPrice += p.transferPrice;
    sumAcqPrice += displayAcq;
    sumExpenses += displayExp;
    sumTransferGain += transferGain;
    sumTaxableGain += taxableGainOfAsset;
    sumExemptGain += exemptGainOfAsset;
    sumLtDeduction += longTermDed;
    sumLtHolding += split.holdingAmount;
    sumLtResidence += split.residenceAmount;
  }

  // 합계 열
  setNum("transferPrice", "total", sumTransferPrice);
  setNum("acquisitionPrice", "total", sumAcqPrice);
  setNum("expenses", "total", sumExpenses);
  setNum("transferGain", "total", sumTransferGain);
  setNum("exemptGain", "total", sumExemptGain);
  setNum("taxableGain", "total", sumTaxableGain);
  setNum("ltDeduction", "total", sumLtDeduction);
  setNum("ltHoldingPart", "total", sumLtHolding);
  setNum("ltResidencePart", "total", sumLtResidence);
  setNum("incomeAmount", "total", aggregated.totalIncomeAfterOffset);
  setNum("nontaxableIncome", "total", 0);
  setNum(
    "reductionTargetIncome",
    "total",
    properties.reduce(
      (s, p) =>
        s +
        reductionEligibleIncome(
          p.reductionType,
          p.income,
          p.reducibleIncome ?? 0,
          p.replacementLandDetail?.eligibleTransferIncome,
        ),
      0,
    ),
  );
  setNum(
    "reductionTargetIncome2",
    "total",
    properties.reduce((s, p) => s + (p.incomeDeductionReducible ?? 0), 0),
  );
  setNum(
    "incomeAmountAfter",
    "total",
    properties.reduce((s, p) => s + Math.max(0, p.incomeAfterOffset - (p.incomeDeductionReducible ?? 0)), 0),
  );
  // 기신고 양도소득금액 (§103) — 가장 늦은 신고일(확정신고분)보다 신고일이 빠른 자산들의 양도소득금액 합산.
  //   신고일 = form.filingDate(입력값) → 없으면 statutoryFilingDeadline(법정신고기한, 양도일 파생) fallback.
  //   bundled(propertyFormMap 미주입)은 filingDates 전부 "" → maxFiling "" → priorIncome 0 (회귀 0).
  const priorFilingDates = properties.map((p) => {
    const f = aggregate.propertyFormMap?.get(p.propertyId);
    return f?.filingDate || f?.statutoryFilingDeadline || "";
  });
  // 신고일 필터는 기납부세액(§111③)과 단일 출처 공유 — computeAutoPriorPaid와 대칭.
  const priorIdx = new Set(selectPriorFiledIndices(priorFilingDates));
  let priorReportedIncome = 0;
  properties.forEach((p, i) => {
    if (priorIdx.has(i)) priorReportedIncome += p.income;
  });
  setNum("priorIncomeAmount", "total", priorReportedIncome);
  setNum("basicDeduction", "total", aggregated.basicDeduction);
  setNum("taxBase", "total", aggregated.taxBase);
  setNum("calculatedTax", "total", aggregated.calculatedTax);
  setNum("reductionTax", "total", aggregated.reductionAmount);
  setNum("determinedTax", "total", aggregated.determinedTax);
  setNum("penaltyTax", "total", aggregated.penaltyTax);
  setNum("totalDeterminedTax", "total", aggregated.determinedTax + aggregated.penaltyTax);
  /**
   * 농어촌특별세 — 엔진 2-pass 산정값(`transfer-tax-aggregate.ts`)을 그대로 싣는다.
   *
   * 종전에는 `0` 리터럴이라, 일괄(bundled) + 소득금액차감 감면(§99의3 등) 케이스에서
   * 실제 부과되는 농특세가 서식에서 통째로 사라졌다(엔진 `totalTax`에는 합산돼 있어
   * 같은 화면의 총 납부세액과 그 금액만큼 어긋났다). 단건 `FilingFormTableHelpers.ts`가
   * `incomeDeductionRuralSurtax(result)`를 싣는 것과 같은 층위다.
   *
   * 자산 열은 위 루프에서 `null`(합산-only) — 농특세는 감면 전후 산출세액 차액의 20%라
   * 자산별로 나누어지지 않는다.
   */
  setNum("ruralSurtax", "total", aggregated.ruralSurtax ?? 0);
  /**
   * 지방소득세 산출세액 — 엔진 값을 그대로 싣는다(재계산 금지).
   * 종전에는 `aggregated.penaltyTax`로 base를 재현했는데 그 필드는 **국기법 신고불성실·
   * 납부지연분까지 합한 총액**이라(`transfer-aggregate.types.ts` 주석) 엔진이 실제로 쓴
   * base(`buildingPenaltyTax`)보다 커졌고, 「산출세액 > 결정세액 · 감면 0」 모순이 나왔다.
   */
  setNum("localCalculatedTax", "total", aggregated.localIncomeTax);
  setNum("localReduction", "total", 0);
  setNum("localDeterminedTax", "total", aggregated.localIncomeTax);
  // 기납부·차감납부 (§111③ 예정신고 정산) — 합계 열만. MultiTransferTaxSummaryCard와 동일 엔진 필드(절대값).
  setNum("priorPaidTax", "total", aggregated.priorPaidTax);
  setNum("deductedPayable", "total", aggregated.settlementAdditionalPayable);
  setNum("priorPaidLocalTax", "total", aggregated.priorPaidLocalTax);
  setNum("deductedLocalPayable", "total", aggregated.settlementLocalPayable);

  const acqDateRowLabel = acquisitionDateLabel
    ? `취득일자 ${acquisitionDateLabel}`
    : "취득일자";
  const rowOrder: Array<[string, string, Partial<RowDef>?]> = [
    ["transferDate", "양도일자"],
    ["acquisitionDate", acqDateRowLabel],
    ["holdingPeriod", "보유기간"],
    ["moveOut", "퇴거일"],
    ["moveIn", "입주일"],
    ["residencePeriod", "거주기간", { separatorAfter: true }],
    ["transferPrice", "양도가액"],
    ["acquisitionPrice", "취득가액"],
    ["expenses", "필요경비", { separatorAfter: true }],
    ["transferGain", "전체 양도차익"],
    ["exemptGain", "비과세 양도차익"],
    ["taxableGain", "과세대상 양도차익", { separatorAfter: true }],
    ["ltDeduction", "장기보유특별공제"],
    ["ltHoldingPart", " 보유 기간분 장특", { indent: true }],
    ["ltResidencePart", " 거주 기간분 장특", { indent: true, separatorAfter: true }],
    ["incomeAmount", "양도소득금액"],
    ["nontaxableIncome", "비과세 양도소득금액 (소령 §161①)", { indent: true }],
    ["reductionTargetIncome", "세액감면대상금액"],
    ["reductionTargetIncome2", "소득금액 감면대상"],
    [
      "incomeAmountAfter",
      "감면후 소득금액",
      Object.keys(offsetNotes).length > 0 ? { notes: offsetNotes } : undefined,
    ],
    ["priorIncomeAmount", "기신고 양도소득금액"],
    ["basicDeduction", "기본공제", { separatorAfter: true }],
    ["taxBase", "과세표준", { highlight: true }],
    ["calculatedTax", "산출세액", Object.keys(taxNotes).length > 0 ? { notes: taxNotes } : undefined],
    ["reductionTax", "감면세액"],
    ["determinedTax", "결정세액", { highlight: true }],
    ["penaltyTax", "가산세액"],
    ["totalDeterminedTax", "총결정세액", { highlight: true }],
    ["priorPaidTax", "기납부세액 (예정신고, §111③)"],
    ["deductedPayable", "차감납부할세액", { highlight: true, separatorAfter: true }],
    ["ruralSurtax", "농어촌특별세"],
    ["localCalculatedTax", "지방소득세 산출세액"],
    ["localReduction", "지방세 감면세액"],
    ["localDeterminedTax", "지방세 결정세액", { highlight: true }],
    ["priorPaidLocalTax", "기납부세액 (지방, 예정신고)"],
    ["deductedLocalPayable", "차감납부할 지방소득세", { highlight: true }],
  ];

  return rowOrder.map(([key, label, opts]) => ({
    label,
    values: v[key] ?? {},
    ...(opts ?? {}),
  }));
}
