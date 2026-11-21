/**
 * anchor — 양도세 결과뷰 리뷰(2026-11-21) MAJOR 묶음 m8-citation: 법령 인용 오기 (표시 전용 · 세액 불변)
 *
 * | R-id | 현상(수정 전) | 기대 |
 * |---|---|---|
 * | R-c05-03 | 단건·집계 필요경비 산식이 양도비를 「§97① 나목」, 개산공제를 「§97① 나목·시행령 §163⑥」으로 적는다 | 양도비 = 소득세법 §97 ① 3호 · 개산공제 = 소득세법 §97 ② 2호 + 시행령 §163 ⑥ |
 * | R-c05-04 | 일반건물 명세서가 양도비를 「§97① 나목」, 자본적지출을 「§97① 가목」으로 적는다 | ①3호 · ①2호 |
 * | R-c11-02 | 집계 소제목(`aggregateExpenseHeading`)이 「§97① 나목」 | ①3호 · ②2호 + §163⑥ |
 * | R-c01-05 | 한시유예 가목 근거가 2주택에서도 §167의3(3주택 이상)만 | `SURCHARGE_TRANSITION.BASIS_A`(§167의3·§167의10 병기) · 나·다목에도 조문 |
 * | R-c03-01 | 농특세 정정 줄 머리말이 「상계하지 않고 따로 납부·환급」의 근거로 §7①을 든다 | §7①은 «별도 계산·표시»에만 · 상계 여부는 아래 고지(확인 필요)에 맡긴다 |
 * | R-c09-02 | 소유자 분리 배지·명세서·엔진 단계 라벨이 주식 대주주 조문(소령 §168②)을 든다 | §168② 삭제 |
 *
 * 법령 본문: 소득세법 §97(MST 280405) · 소득세법 시행령 §163·§166·§168(MST 290841) — KoreanLaw 실독 2026-11-21.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { buildNecessaryExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { aggregateExpenseHeading } from "@/components/calc/results/transfer/split-acq-text";
import { buildGbAcquisitionFormula, buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { AmendmentBlock } from "@/components/calc/transfer/AmendmentBlock";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeHouseInfo, makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { COMBOS, SCN_N, run } from "../tax-engine/transfer/_helpers/split-acq-display-fixture";

afterEach(cleanup);

const TRANSFER_COST = "소득세법 §97 ① 3호";
const CAPEX = "소득세법 §97 ① 2호";
const LUMP = "소득세법 §97 ② 2호 + 시행령 §163 ⑥";

const res = (over: Partial<TransferTaxResult>) => ({ steps: [], ...over }) as unknown as TransferTaxResult;

describe("R-c05-03 단건·집계 필요경비 산식 (DetailedStatementFormulaBuilders)", () => {
  it("M8-1 실가 단건 — 양도비는 §97①3호", () => {
    const f = buildNecessaryExpenseFormula(res({ usedEstimatedAcquisition: false }), false, 3_000_000);
    expect(f).toBe(`양도비 3,000,000 (중개수수료·법무사 비용 등) — ${TRANSFER_COST}`);
    expect(f).not.toContain("나목");
  });

  it("M8-2 환산 단건 — 개산공제는 §97②2호 + 시행령 §163⑥ (기준시가 있음·없음)", () => {
    const base = { usedEstimatedAcquisition: true, estimatedDeduction: 3_000_000 };
    expect(buildNecessaryExpenseFormula(res({ ...base, estimatedStdPriceAtAcquisition: 100_000_000 }), false, 3_000_000, 0.03)).toBe(
      `개산공제 3,000,000 = 취득시 기준시가 100,000,000 × 3% — ${LUMP}`,
    );
    expect(buildNecessaryExpenseFormula(res(base), false, 3_000_000, 0.03)).toBe(`개산공제 3,000,000 (취득시 기준시가 × 3%) — ${LUMP}`);
  });

  it("M8-3 집계 fallback 소제목 — 산정방식 집합이 없을 때", () => {
    expect(buildNecessaryExpenseFormula(res({ usedEstimatedAcquisition: false }), true, 0)).toBe(
      `자산별 양도비 합계 (중개수수료·법무사 비용 등) — ${TRANSFER_COST}`,
    );
    expect(buildNecessaryExpenseFormula(res({ usedEstimatedAcquisition: true }), true, 0)).toBe(
      `자산별 개산공제·양도비 합계 — ${LUMP}·${TRANSFER_COST}`,
    );
  });

  it("M8-4 이월과세 A(증여자 실가) — 본인 양도비 등도 §97①3호", () => {
    const r = res({
      carryoverTaxationDetail: {
        adoptedScenario: "A",
        scenarioA: { giftTaxAddedToExpense: 0, donorCapexAddedToExpense: 0, acquisitionWasEstimated: false },
      },
    } as never);
    expect(buildNecessaryExpenseFormula(r, false, 1_500_000)).toBe(`양도비 등 1,500,000 (중개수수료·법무사 비용 등) — ${TRANSFER_COST}`);
  });
});

describe("R-c11-02 집계 소제목 (split-acq-text `aggregateExpenseHeading`)", () => {
  it("M8-5 전부 실거래가 → ①3호 · 전부 환산/부담부증여 기준시가 → ②2호 + §163⑥ · ①3호", () => {
    expect(aggregateExpenseHeading(new Set(["actual"]))).toBe(`자산별 양도비 합계 (중개수수료·법무사 비용 등) — ${TRANSFER_COST}`);
    for (const m of ["estimated", "bgStandard"] as const) {
      expect(aggregateExpenseHeading(new Set([m]))).toBe(`자산별 개산공제·양도비 합계 — ${LUMP}·${TRANSFER_COST}`);
    }
  });
});

describe("R-c05-04 일반건물 명세서 (DetailedStatementGbFormulas · gbDetail 없는 다건 fallback)", () => {
  const p = (over: Partial<PerPropertyBreakdown>) =>
    ({ propertyId: "np1", acquisitionPrice: 100_000_000, necessaryExpense: 5_000_000, capitalExpenditureForDisplay: 0, ...over }) as PerPropertyBreakdown;

  it("M8-6 양도비 합계 — ①3호", () => {
    expect(buildGbExpenseFormula(p({}), undefined)).toBe(`자산별 양도비 합계 = 5,000,000 (${TRANSFER_COST})`);
  });

  it("M8-7 swap으로 자본적지출이 취득가액 칸에 얹힌 경우 — 자본적지출은 ①2호", () => {
    const f = buildGbAcquisitionFormula(
      p({ capitalExpenditureForDisplay: 2_000_000, filingDisplay: { swapApplied: true } } as never),
      undefined,
      undefined,
    );
    expect(f).toBe(`취득가액 100,000,000 + 자본적지출 2,000,000 = 102,000,000 (신고서 양식: 자본적지출(${CAPEX}) 합산 표시)`);
  });
});

describe("R-c09-02 소유자 분리 — 주식 대주주 조문(소령 §168②)을 들지 않는다", () => {
  const land = () => run(SCN_N, COMBOS.AE, { selfOwns: "land_only" });
  const form = { transferDate: "2026-07-01", contractTotalPrice: String(SCN_N.price), assets: [{ residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;

  it("M8-8 결과 카드 배지", () => {
    const { container } = render(<SplitGainDetailSection splitDetail={land().splitDetail!} />);
    const t = container.textContent ?? "";
    expect(t).toContain("본인 신고분: 토지 (소득세법 시행령 §166 ⑥)");
    expect(t).not.toContain("§168");
  });

  it("M8-9 상세명세서 양도가액 산식", () => {
    const f = buildStatementItems(land(), form, undefined, undefined, SCN_N.price).get("transferPrice")!.formula as string;
    expect(f).toBe("본인 소유 파트 양도가 — 토지 675,000,000 (일괄양도가액 900,000,000 중 · 소득세법 시행령 §166 ⑥)");
  });

  it("M8-10 엔진 계산 과정 단계 라벨", () => {
    const step = land().steps.find((s) => s.label.startsWith("본인 신고분"));
    expect(step?.label).toBe("본인 신고분: 토지 (소득세법 시행령 §166 ⑥)");
  });
});

describe("R-c01-05 다주택 중과 한시유예 근거 줄 (TransferTaxResultView)", () => {
  function suspendedRates() {
    const rates = makeMockRatesWithHouseEngine();
    const surcharge = rates.get("transfer:surcharge:_default")!;
    rates.set("transfer:surcharge:_default", {
      ...surcharge,
      specialRules: { surcharge_suspended: true, suspended_types: ["multi_house_2", "multi_house_3plus"], suspended_until: "2026-05-09" },
    });
    return rates;
  }
  const twoHouses = (transferDate: string, contractDate: string) =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
        acquisitionDate: new Date("2020-01-01"), transferDate: new Date(transferDate),
        isRegulatedArea: true, householdHousingCount: 2, isOneHousehold: true, sellingHouseId: "h1",
        houses: [makeHouseInfo("h1", { regionCode: "11680" }), makeHouseInfo("h2")],
        gracePeriod: { contractDate: new Date(contractDate), isLandPermitTarget: false, depositReceiptConfirmed: true },
      }),
      suspendedRates(),
    );
  const view = (r: TransferTaxResult) =>
    render(<TransferTaxResultView result={r} formData={createDefaultTransferFormData()} onReset={() => {}} onBack={() => {}} />).container.textContent ?? "";

  it("M8-11 2주택 가목 — §167의10①12의2 가목이 함께 적힌다(§167의3 단독 아님)", () => {
    const r = twoHouses("2026-05-09", "2026-06-01");
    // 유예면 엔진이 `surchargeType`을 싣지 않는다(실측 undefined) — 주택 수로 조문을 고를 수 없어 두 조문을 병기한 단일 소스를 쓴다.
    expect([r.isSurchargeSuspended, r.surchargeSuspensionBasis, r.surchargeType, r.multiHouseSurchargeDetail?.effectiveHouseCount]).toEqual([true, "a", undefined, 2]);
    const t = view(r);
    expect(t).toContain("근거: 2026-05-09까지 양도 (소득세법 시행령 §167의3①12의2 가목 · §167의10①12의2 가목)");
  });

  it("M8-12 다목 — 경과조치 줄에도 조문이 붙는다", () => {
    const r = twoHouses("2026-08-01", "2026-04-01");
    expect(r.surchargeSuspensionBasis).toBe("da");
    expect(view(r)).toMatch(/근거: 매매계약 경과조치 \(다목\) — 양도기한 \S+ 이내 충족 \(소득세법 시행령 §167의3①12의2 나·다목 · §167의10①12의2 나·다목\)/);
  });
});

describe("R-c03-01 농어촌특별세 정정 줄 머리말 (AmendmentResultCard)", () => {
  it("M8-13 §7①을 «상계하지 않음»의 근거로 들지 않는다 — 상계 여부는 아래 고지가 말한다", () => {
    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2024,
        properties: [
          {
            ...baseTransferInput({ propertyType: "land", transferPrice: 600_000_000, acquisitionPrice: 200_000_000, transferDate: new Date("2024-03-01"), acquisitionDate: new Date("2009-03-01") }),
            propertyId: "land",
            propertyLabel: "토지",
          },
        ],
        annualBasicDeductionUsed: 0,
        basicDeductionAllocation: "MAX_BENEFIT",
        priorReductionUsage: [],
        amendment: { originalDeterminedTax: 10_000_000, applyUnderReportingPenalty: false, underReportingReason: "normal", underReductionMode: "exempt", applyLatePaymentPenalty: false },
      } as never,
      makeMockRates(),
    );
    const detail = {
      ...agg.amendmentDetail!,
      ruralSurtax: { originalRuralSurtax: 500_000, amendedRuralSurtax: 0, additionalRuralSurtax: 0, latePaymentPenalty: 0, refundRuralSurtax: 500_000, totalPayable: 0 },
    };
    const { getByTestId } = render(<AmendmentResultCard detail={detail} fullTotalTax={1_000} />);
    const head = getByTestId("amendment-rural-surtax").querySelector("p")!.textContent;
    expect(head).toBe("농어촌특별세 — 양도소득세 금액과 별도로 계산·표시합니다 (농어촌특별세법 §7①)");
  });

  it.each([
    ["수정신고", undefined, "양도소득세 금액과 별도로 추가 납부·환급을 계산하며(농어촌특별세법 §7①), 양도소득세와 서로 상계하지 않습니다"],
    ["경정청구", "refund_claim", "양도소득세 금액과 별도로 환급·추가 납부를 계산하며(농어촌특별세법 §7①), 양도소득세와 서로 상계하지 않습니다"],
  ] as const)("M8-14 입력 화면 «당초 농어촌특별세» 안내(%s) — §7①은 별도 계산에만 붙는다", (_label, correctionKind, tail) => {
    const form = { ...createDefaultTransferFormData(), ...(correctionKind ? { correctionKind } : {}) } as TransferFormData;
    const { container } = render(<AmendmentBlock form={form} onChange={() => {}} />);
    const t = container.textContent ?? "";
    expect(t).toContain(`당초 신고·납부한 농어촌특별세 (이력에서 자동 입력) — ${tail}`);
    expect(t).not.toContain("상계하지 않고 별도로");
  });
});
