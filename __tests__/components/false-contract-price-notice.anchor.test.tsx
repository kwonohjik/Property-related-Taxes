/**
 * anchor: 소득세법 §91② 범위 밖 고지가 **결과뷰 5곳**에 같은 술어로 뜬다 (결정 #48 A · 조건).
 *
 * 양도세 결과뷰는 4종(단건·다건·겸용·일괄)이고 부담부증여 양도세 카드가 따로 있다
 * (`feedback_transfer_result_view_is_not_one`). 엔진을 실제로 호출한 결과를 렌더해
 * 「뜨는 격자 / 안 뜨는 격자」를 짝으로 고정한다 — 손으로 만든 결과는 렌더 경로를 우회한다.
 *
 * 세액은 바뀌지 않는다: 계약서 거래가액 입력 칸이 없어 허위 계약서 사안도 엔진은 0원이다(E-1).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import {
  mixedUseCase14,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../tax-engine/_helpers/mixed-use-fixture";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const NOTICE = '[data-testid="false-contract-price-notice"]';
const noticeCount = (c: Element) => c.querySelectorAll(NOTICE).length;

// ── 격자 ────────────────────────────────────────────────────────────
/** 1세대1주택 10억(12억 이하) — 전액 비과세. */
const exemptInput = (o: Partial<TransferTaxInput> = {}) =>
  baseTransferInput({ transferPrice: 1_000_000_000, acquisitionPrice: 500_000_000, ...o });
/** 1세대1주택 15억 — 고가주택 부분 비과세(12억 초과분만 과세). */
const partialInput = () => baseTransferInput({ transferPrice: 1_500_000_000, acquisitionPrice: 500_000_000 });
/** 비과세 미적용 — 2주택, 같은 가액. 혜택이 없어 뺄 세액이 없다. */
const taxableInput = () =>
  baseTransferInput({
    isOneHousehold: false,
    householdHousingCount: 2,
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
  });
/** 자경농지 감면(조특법 §69) 토지 — 비과세가 아니라 감면. */
const farmInput = () =>
  baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2010-06-01"),
    transferDate: D("2026-06-01"),
    reductions: [{ type: "self_farming", farmingYears: 10 }],
  });

const formOn = (transferDate: string) => ({ ...createDefaultTransferFormData(), transferDate });

function renderSingle(input: TransferTaxInput, transferDate = "2024-06-01") {
  const result = calculateTransferTax(input, rates);
  const view = render(
    <TransferTaxResultView result={result} formData={formOn(transferDate)} onReset={() => {}} onBack={() => {}} />,
  );
  return { result, ...view };
}

describe("E-0 격자 — 짝의 전제 (이게 깨지면 아래 단언은 빈 격자를 잰다)", () => {
  it("전액 비과세 / 부분 비과세 / 과세 / 감면이 서로 다른 결과로 나온다", () => {
    const e = calculateTransferTax(exemptInput(), rates);
    expect([e.isExempt, e.totalTax]).toEqual([true, 0]);
    const p = calculateTransferTax(partialInput(), rates);
    expect([p.isExempt, p.isPartialExempt]).toEqual([false, true]);
    const t = calculateTransferTax(taxableInput(), rates);
    expect([t.isExempt, t.isPartialExempt ?? false, t.reductionAmount]).toEqual([false, false, 0]);
    const f = calculateTransferTax(farmInput(), rates);
    expect(f.reductionAmount).toBeGreaterThan(0);
    expect(f.isExempt).toBe(false);
  });

  it("E-1 세액 불변: 계약서 거래가액을 받는 입력이 없어 허위 계약서 사안도 엔진은 0원이다", () => {
    // 고지가 「이 계산에는 반영하지 않았다」고 말하는 근거 — 이 단언이 깨지면(= §91② 구현) 고지를 걷어야 한다.
    const r = calculateTransferTax(exemptInput(), rates);
    expect(r.totalTax).toBe(0);
    expect(r.calculatedTax).toBe(0);
  });
});

describe("A-1 단건", () => {
  it("전액 비과세 → 비과세 카드 안에 한 줄 (납부세액 0 카드의 자손)", () => {
    const { container } = renderSingle(exemptInput());
    expect(noticeCount(container)).toBe(1);
    const card = container.querySelector(NOTICE)!.closest("div.border-emerald-500");
    expect(card, "비과세 카드 안이어야 한다").not.toBeNull();
    expect(card!.textContent).toContain("납부세액 0");
  });

  it("부분 비과세 → 뜬다 (비과세 카드 밖, 한 번만)", () => {
    const { container } = renderSingle(partialInput());
    expect(noticeCount(container)).toBe(1);
    expect(container.querySelector(NOTICE)!.closest("div.border-emerald-500")).toBeNull();
  });

  it("감면 → 뜬다 (하위 결정 1)", () => {
    const { container } = renderSingle(farmInput(), "2026-06-01");
    expect(noticeCount(container)).toBe(1);
  });

  it("비과세·감면 없는 과세 결과 → 안 뜬다", () => {
    const { container } = renderSingle(taxableInput());
    expect(noticeCount(container)).toBe(0);
  });

  it("양도일 2011-06-30 비과세 → 안 뜬다 / 2011-07-01 → 뜬다", () => {
    expect(noticeCount(renderSingle(exemptInput(), "2011-06-30").container)).toBe(0);
    cleanup();
    expect(noticeCount(renderSingle(exemptInput(), "2011-07-01").container)).toBe(1);
  });
});

describe("A-2 다건 — 건별 양도일·혜택으로 가려 한 줄로 묶는다", () => {
  function multi(dates: Record<string, string>) {
    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2024,
        annualBasicDeductionUsed: 0,
        properties: [
          { ...exemptInput(), propertyId: "a", propertyLabel: "주택A" } as never,
          { ...partialInput(), propertyId: "c", propertyLabel: "고가주택C" } as never,
          {
            ...baseTransferInput({ propertyType: "land", isOneHousehold: false, householdHousingCount: 0, transferPrice: 400_000_000, acquisitionPrice: 300_000_000 }),
            propertyId: "b",
            propertyLabel: "토지B",
          } as never,
        ],
      } as never,
      rates,
    );
    const properties = agg.properties.map((p) => ({
      propertyId: p.propertyId,
      propertyLabel: p.propertyLabel,
      form: formOn(dates[p.propertyId] ?? "2024-06-01"),
    })) as unknown as PropertyItem[];
    return { agg, ...render(<MultiTransferTaxResultView result={agg} properties={properties} taxYear={2024} />) };
  }

  it("echo: 건별 breakdown이 부분 비과세를 싣는다 (isExempt:false여도)", () => {
    const { agg } = multi({});
    const by = Object.fromEntries(agg.properties.map((p) => [p.propertyId, p]));
    expect([by.a.isExempt, by.c.isExempt, by.c.isPartialExempt, by.b.isExempt, by.b.isPartialExempt ?? false]).toEqual([
      true, false, true, false, false,
    ]);
  });

  it("해당 건(주택A·고가주택C)만 라벨로 밝힌 한 줄이 summary 안에 뜬다 — 토지B는 빠진다", () => {
    const { container } = multi({});
    expect(noticeCount(container)).toBe(1);
    const n = container.querySelector(NOTICE)!;
    expect(n.closest('[data-print-id="summary"]')).not.toBeNull();
    expect(n.textContent).toContain("주택A");
    expect(n.textContent).toContain("고가주택C");
    expect(n.textContent).not.toContain("토지B");
  });

  it("건별 양도일 게이트: 주택A만 2011-06-30이면 고가주택C만 남는다", () => {
    const { container } = multi({ a: "2011-06-30" });
    const n = container.querySelector(NOTICE)!;
    expect(n.textContent).toContain("고가주택C");
    expect(n.textContent).not.toContain("주택A —");
  });

  it("해당 건이 하나도 없으면 안 뜬다", () => {
    const { container } = multi({ a: "2011-06-30", c: "2011-06-30" });
    expect(noticeCount(container)).toBe(0);
  });
});

describe("A-3 일괄(§166⑥ 주택 단위)", () => {
  const APPORTIONMENT = { apportioned: [], totalStandardAtTransfer: 0, residualAbsorbedBy: null, legalBasis: "소득세법 시행령 §166⑥", warnings: [] };
  function bundled(house: TransferTaxInput, transferDate: string) {
    const aggregated = calculateTransferTaxAggregate(
      {
        taxYear: 2024,
        annualBasicDeductionUsed: 0,
        properties: [{ ...house, propertyId: "h1", propertyLabel: "주택" } as never],
      } as never,
      rates,
    );
    return render(
      <BundledAllocationCard
        aggregated={aggregated}
        apportionment={APPORTIONMENT as never}
        formData={{ ...formOn(transferDate), assets: [] } as never}
      />,
    );
  }
  it("주택 단위가 비과세 → 뜬다 (calculation 섹션 안)", () => {
    const { container } = bundled(exemptInput(), "2024-06-01");
    expect(noticeCount(container)).toBe(1);
    expect(container.querySelector(NOTICE)!.closest('[data-print-id="calculation"]')).not.toBeNull();
  });
  it("부분 비과세도 뜬다 / 과세는 안 뜬다 / 2011-06-30은 안 뜬다", () => {
    expect(noticeCount(bundled(partialInput(), "2024-06-01").container)).toBe(1);
    cleanup();
    expect(noticeCount(bundled(taxableInput(), "2024-06-01").container)).toBe(0);
    cleanup();
    expect(noticeCount(bundled(exemptInput(), "2011-06-30").container)).toBe(0);
  });
});

describe("A-4 겸용주택", () => {
  const breakdown = calcMixedUseTransferTax(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, mixedUseCase14(), rates);
  it("E-0 격자: 주택부분 12억 이하 비과세", () => {
    expect(breakdown.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    expect(breakdown.housingPart.isExempt).toBe(true);
  });
  it("비과세 → 뜬다 (calculation 섹션 안)", () => {
    const { container } = render(<MixedUseResultCard breakdown={breakdown} formData={formOn("2022-02-16") as never} />);
    expect(noticeCount(container)).toBe(1);
    expect(container.querySelector(NOTICE)!.closest('[data-print-id="calculation"]')).not.toBeNull();
  });
  it("비과세 미적용(non_one_house_full_taxation) → 안 뜬다", () => {
    const taxable = {
      ...breakdown,
      housingPart: { ...breakdown.housingPart, isExempt: false },
      calculationRoute: { ...breakdown.calculationRoute, highValueRule: "non_one_house_full_taxation" as const },
    };
    const { container } = render(<MixedUseResultCard breakdown={taxable} formData={formOn("2022-02-16") as never} />);
    expect(noticeCount(container)).toBe(0);
  });
  it("12억 초과 안분(above_threshold_prorated) → 뜬다", () => {
    const prorated = {
      ...breakdown,
      housingPart: { ...breakdown.housingPart, isExempt: false },
      calculationRoute: { ...breakdown.calculationRoute, highValueRule: "above_threshold_prorated" as const },
    };
    const { container } = render(<MixedUseResultCard breakdown={prorated} formData={formOn("2022-02-16") as never} />);
    expect(noticeCount(container)).toBe(1);
  });
});

describe("A-5 부담부증여 양도세 카드 — 매매가 아니어도 빼지 않는다", () => {
  it("비과세·부분 비과세 → 뜬다 / 과세 → 안 뜬다 / 증여일 2011-06-30 → 안 뜬다", () => {
    const e = calculateTransferTax(exemptInput(), rates);
    const p = calculateTransferTax(partialInput(), rates);
    const t = calculateTransferTax(taxableInput(), rates);
    const at = (rs: typeof e[], d?: string) =>
      render(<BurdenedTransferTaxResultCard transferTaxResults={rs} {...(d ? { transferDate: d } : {})} />).container;
    expect(noticeCount(at([e], "2024-06-01"))).toBe(1);
    cleanup();
    expect(noticeCount(at([p], "2024-06-01"))).toBe(1);
    cleanup();
    expect(noticeCount(at([t], "2024-06-01"))).toBe(0);
    cleanup();
    expect(noticeCount(at([e], "2011-06-30"))).toBe(0);
    cleanup();
    // 양도일(증여일)을 모르면 띄운다.
    expect(noticeCount(at([e]))).toBe(1);
  });
});
