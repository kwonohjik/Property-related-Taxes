/**
 * anchor — 양도세 결과뷰 리뷰 2026-11-21 c01 MINOR(다건 결과뷰 표시).
 *
 *  · R-c01-08 — 소멸 차손 라벨이 「§102② 단서」를 근거로 들었다. 소득세법 §102②는 두 문장뿐이고 단서가 없다
 *               (시행령 §167의2에도 이월 규정이 없다) → 「이월공제 규정 없음 — TRANSFER.LOSS_OFFSET」.
 *  · R-c01-09 — 건별 「기본공제 배분액」 산식이 「소득금액 비율안분」 고정이었다. 엔진 배분 축 3종은 모두 순차 공제다
 *               → 엔진 「기본공제」 STEP 산식을 그대로 쓴다.
 *  · R-c01-11 — 다건 정정 카드가 부담부증여에서도 「전체 세액」을 한정하지 않았다(단건·일괄은 「양도세분」).
 *  · R-c01-13 — 합산 카드·아코디언 금액 칸에 font-mono가 없었다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { buildMultiBody, postMulti } from "../calc/_helpers/single-multi-route-parity";

afterEach(cleanup);
vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

function land(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land", acquisitionDate: D("2012-01-01"), transferDate: D("2026-03-01"),
    transferPrice: 900_000_000, acquisitionPrice: 300_000_000, expenses: 10_000_000,
    isOneHousehold: false, householdHousingCount: 0, annualBasicDeductionUsed: 0, isNonBusinessLand: false, ...o,
  } as Partial<TransferTaxInput>);
}
function agg(items: TransferTaxInput[]) {
  return calculateTransferTaxAggregate(
    { taxYear: 2026, annualBasicDeductionUsed: 0, properties: items.map((p, i) => ({ ...p, propertyId: `p${i + 1}`, propertyLabel: `토지 ${i + 1}` })) as never },
    rates,
  );
}
const propsOf = (a: AggregateTransferResult) =>
  a.properties.map((p) => ({ propertyId: p.propertyId, propertyLabel: p.propertyLabel })) as unknown as PropertyItem[];
const mount = (a: AggregateTransferResult) =>
  render(<MultiTransferTaxResultView result={a} properties={propsOf(a)} taxYear={2026} />).container;

/** 정정 카드를 그리기 위한 최소 정정 detail(값은 카드 문구만 본다 — `transfer-print-section-coverage` PG-3와 같은 모양). */
const AMENDMENT = {
  originalDeterminedTax: 100_000_000, amendedDeterminedTax: 137_861_431, additionalTax: 37_861_431,
  underReportingReductionRate: 0, underReportingPenalty: 0, latePaymentPenalty: 0,
  additionalLocalIncomeTax: 3_786_143, totalPayable: 37_861_431, correctionKind: "amend" as const, steps: [],
};

describe("R-c01-08 소멸 차손 라벨 — 없는 단서를 근거로 들지 않는다", () => {
  it("차손이 남는 시료 — 「이월공제 규정 없음 — 소득세법 §102 ② + 시행령 §167의2」", () => {
    const a = agg([land({ transferPrice: 320_000_000 }), land({ transferPrice: 100_000_000 })]);
    expect(a.unusedLoss, "소멸 차손이 0이면 그 행이 없다 — 격자를 고칠 것").toBeGreaterThan(0);
    const text = mount(a).textContent ?? "";
    expect(text).toContain(`소멸 차손 (이월공제 규정 없음 — ${TRANSFER.LOSS_OFFSET})`);
    expect(text).not.toContain("§102② 단서");
  });
});

describe("R-c01-09 건별 기본공제 배분액 산식 = 엔진 「기본공제」 STEP", () => {
  it("비율안분 문구 대신 엔진 배분 축(§103② 양도일 순)을 적는다", () => {
    const a = agg([land(), land({ transferPrice: 1_400_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("2015-06-01") })]);
    const step = a.steps.find((s) => s.label === "기본공제")!;
    expect(step.formula).toContain("소득세법 §103②");
    expect(a.properties.some((p) => p.allocatedBasicDeduction > 0)).toBe(true);
    const text = mount(a).textContent ?? "";
    expect(text).toContain(step.formula);
    expect(text).not.toContain("소득금액 비율안분");
  });
});

describe("R-c01-11 다건 정정 카드 — 부담부증여면 「양도세분」으로 한정", () => {
  const BG_HOUSE: Partial<AssetForm> = {
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgDonorRelation: "lineal_descendant",
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", addressJibun: "테스트 7", regionCode: "2826010100",
    bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "300,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "400,000,000",
    standardPriceAtTransfer: "800000000",
  } as Partial<AssetForm>;
  function bgForm(): TransferFormData {
    const f = createDefaultTransferFormData();
    Object.assign(f, {
      transferDate: "2024-06-01", isOneHousehold: false, residencePeriodMonths: "0", contractTotalPrice: "",
      householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true,
    });
    f.assets = [{ ...makeDefaultAsset(1), ...BG_HOUSE } as AssetForm];
    return f;
  }

  it("부담부증여 자산이 있으면 「전체 세액 (양도세분)」", async () => {
    const m = await postMulti(await buildMultiBody([bgForm()]));
    expect(m.status, JSON.stringify(m.json).slice(0, 300)).toBe(200);
    const a = (m.json as { data: AggregateTransferResult }).data;
    expect(a.properties[0].transferBurdenedGiftBreakdown, "증여세 카드가 그려지는 시료여야 한다").toBeDefined();
    const text = mount({ ...a, amendmentDetail: AMENDMENT } as unknown as AggregateTransferResult).textContent ?? "";
    expect(text).toMatch(/전체 세액 \(양도세분\)/);
  });

  it("대조군 — 부담부증여가 없으면 종전 문구", () => {
    const a = agg([land()]);
    const text = mount({ ...a, amendmentDetail: AMENDMENT } as unknown as AggregateTransferResult).textContent ?? "";
    expect(text).toMatch(/참고 · 수정 후 전체 세액/);
    expect(text).not.toMatch(/양도세분/);
  });
});

describe("R-c01-13 금액 칸 고정폭", () => {
  it("합산 결과 카드 금액 칸이 font-mono tabular-nums다", () => {
    const a = agg([land()]);
    const summary = mount(a).querySelector('[data-print-id="summary"]')!;
    const amount = [...summary.querySelectorAll("div > span")].find((el) => el.textContent === a.taxBase.toLocaleString("ko-KR"));
    expect(amount, "과세표준 금액 칸이 없다").toBeDefined();
    expect(amount!.className).toContain("font-mono");
    expect(amount!.className).toContain("tabular-nums");
  });
});
