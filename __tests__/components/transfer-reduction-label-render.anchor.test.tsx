/**
 * anchor: 미등록 감면 유형이 화면에 **내부 enum id로 새지 않는다** (결과탭 코드리뷰 #039·#047·#092).
 *
 * 종전에는 집계 결과뷰 둘이 라벨맵을 6종만 갖고 `?? entry.type`으로 폴백해,
 * §97 계열·§98 계열·§77의2·§77의3 등이 `gb_designated_land`·`rental_97_3` 같은
 * 내부 문자열로 화면에 그대로 떴다.
 *
 * 🔴 **정적 감사만으로는 부족하다.** `transfer-result-display-convention.anchor.test.ts`가
 *   `?? entry.type` 패턴을 막지만, 뮤테이션 프로브에서 `${entry.type}`을 **직접** 끼워 넣자
 *   14건이 전부 통과했다. 「그 필드가 화면에 나가는가」는 렌더해 봐야 안다.
 *   그래서 이 anchor는 **화면 텍스트에 snake_case 식별자가 있는지**를 직접 본다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { REDUCTION_TYPE_LABELS } from "@/lib/tax-engine/transfer-reduction-type-labels";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const APPORTIONMENT = {
  apportioned: [],
  totalStandardAtTransfer: 0,
  residualAbsorbedBy: null,
  legalBasis: "소득세법 시행령 §166⑥",
  warnings: [],
};

function land(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    acquisitionDate: D("2012-01-01"),
    transferDate: D("2026-03-01"),
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    expenses: 10_000_000,
    isOneHousehold: false,
    householdHousingCount: 0,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
    ...o,
  } as Partial<TransferTaxInput>);
}

const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 900_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

function agg() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...land({ reductions: EXPROPRIATION } as never), propertyId: "p1", propertyLabel: "토지 A" } as never,
      ],
    },
    rates,
  );
}

/**
 * **라벨맵에 없는** 감면 유형으로 갈아끼운다.
 *
 * 엔진은 유효 유형만 내므로 미등록 케이스를 자연 발생시킬 수 없다. 그러나 실제 결함은
 * 「엔진이 새 유형을 내는데 UI 맵이 아직 모른다」는 상황이었으므로, 그 상태를 직접 만든다.
 */
function withUnknownType(a: ReturnType<typeof agg>) {
  const UNKNOWN = "some_future_reduction_id";
  expect(REDUCTION_TYPE_LABELS[UNKNOWN], "이 키가 맵에 있으면 이 anchor는 무의미하다").toBeUndefined();
  return {
    ...a,
    reductionBreakdown: a.reductionBreakdown.map((e) => ({ ...e, type: UNKNOWN })),
    properties: a.properties.map((p) => ({ ...p, reductionType: UNKNOWN })),
  };
}

/** 화면 텍스트에 남은 snake_case 식별자를 찾는다(한글·숫자 사이에 낀 영문 소문자_영문). */
function snakeCaseLeaks(text: string): string[] {
  return [...new Set(text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [])];
}

function multiProps(a: ReturnType<typeof agg>) {
  return a.properties.map((p) => ({
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
  })) as unknown as PropertyItem[];
}

// ── L-0 격자 구별력 ──────────────────────────────────────────────────
describe("L-0 감면 breakdown이 실제로 렌더되는가", () => {
  it("감면이 걸리고 breakdown이 비어 있지 않다", () => {
    const a = agg();
    expect(a.reductionAmount, "감면 0이면 카드 자체가 안 뜬다").toBeGreaterThan(0);
    expect(a.reductionBreakdown.length).toBeGreaterThan(0);
  });
});

// ── L-1 등록 유형 — 한국어 라벨이 뜬다 ────────────────────────────────
describe("L-1 등록된 감면 유형은 한국어 라벨로 표시된다", () => {
  it("다건 결과뷰", () => {
    const a = agg();
    const { container } = render(
      <MultiTransferTaxResultView result={a} properties={multiProps(a)} taxYear={2026} />,
    );
    expect(container.textContent).toContain("공익사업용 토지 수용 (§77)");
  });

  it("일괄 결과뷰 — 다건과 **같은 문구**다 (종전에는 두 뷰의 문구가 갈렸다)", () => {
    const a = agg();
    const { container } = render(
      <BundledAllocationCard
        apportionment={APPORTIONMENT as never}
        aggregated={a}
        formData={createDefaultTransferFormData()}
        onBack={() => {}}
        onReset={() => {}}
      />,
    );
    expect(container.textContent).toContain("공익사업용 토지 수용 (§77)");
  });
});

// ── L-2 미등록 유형 — 내부 id가 새지 않는다 ───────────────────────────
describe("L-2 미등록 감면 유형도 내부 id를 노출하지 않는다", () => {
  it("다건 결과뷰: 화면에 `some_future_reduction_id`가 없고 「기타 감면」이 뜬다", () => {
    const a = withUnknownType(agg());
    const { container } = render(
      <MultiTransferTaxResultView result={a} properties={multiProps(a)} taxYear={2026} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("some_future_reduction_id");
    expect(snakeCaseLeaks(text), "화면에 내부 식별자가 남아 있다").toEqual([]);
    expect(text).toContain("기타 감면");
  });

  it("일괄 결과뷰: 화면에 내부 id가 없다", () => {
    const a = withUnknownType(agg());
    const { container } = render(
      <BundledAllocationCard
        apportionment={APPORTIONMENT as never}
        aggregated={a}
        formData={createDefaultTransferFormData()}
        onBack={() => {}}
        onReset={() => {}}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("some_future_reduction_id");
    expect(snakeCaseLeaks(text), "화면에 내부 식별자가 남아 있다").toEqual([]);
  });
});
