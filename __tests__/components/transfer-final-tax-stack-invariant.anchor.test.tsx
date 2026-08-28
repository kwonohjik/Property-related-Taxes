/**
 * anchor: **최종 세액 스택이 4개 결과뷰에서 자기검산된다** (결과탭 코드리뷰 Lane 3 · V4 — #001 #087).
 *
 * ## 왜 4벌인가
 *
 * 같은 「결정세액 → 가산세 → 지방소득세 → 농어촌특별세 → 총납부세액」 스택이 결과뷰마다
 * 따로 그려져 있다(단건 hero 칩 · 다건 합산 카드 · 일괄 합산 과세 내역 · 겸용 합산 세액).
 * 새 세목 항목이 엔진 총액에 추가되면 **행을 안 그린 뷰에서만 조용히 어긋난다** — 실제로
 * 농어촌특별세가 그랬다.
 *
 * ⇒ 뷰를 통합하는 대신 **불변식을 한 곳에 못박는다**: 화면에 그려진 최종 세액 행들의 합이
 *   엔진이 말한 총액과 같아야 한다. 새 항목이 생기면 그리지 않은 뷰가 여기서 실패한다.
 *
 * ## 겸용이 실제로 깨져 있었다 (#001)
 *
 * 엔진은 `totalPayable = 결정세액 + 지방소득세 + 가산세 + 농특세`인데
 * (`transfer-tax-mixed-use-totals.ts:249`) 「합산 세액」 표에는 감면세액·결정세액·가산세·농특세
 * 행이 하나도 없었고, 총 납부세액 산식은 「양도소득세 + 지방소득세」라고 적혀 있었다.
 * 지방소득세 산식도 「양도소득세 × 10%」인데 실제 base는 **결정세액**이라 감면이 붙으면
 * 산식으로 검산이 되지 않았다.
 *
 * Lane 6 anchor가 이 표의 「총 납부세액」 행을 일부러 단언하지 않고 남겨 둔 자리다
 * (그때 고정했다면 결함을 「기존 동작」으로 상속했을 것이다).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  makeMockRates,
  baseTransferInput,
  makeMockRatesWithHouseEngine,
} from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";

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

/** §77 공익수용(현금) — 감면세액·농어촌특별세가 실제로 생겨야 이 anchor에 구별력이 있다. */
const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 900_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

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

function agg2() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...land({ reductions: EXPROPRIATION } as never), propertyId: "p1", propertyLabel: "토지 A" } as never,
        {
          ...land({
            transferPrice: 1_400_000_000,
            acquisitionPrice: 500_000_000,
            expenses: 20_000_000,
            acquisitionDate: D("2015-06-01"),
          }),
          propertyId: "p2",
          propertyLabel: "토지 B",
        } as never,
      ],
    },
    rates,
  );
}

// ── DOM 수집 ────────────────────────────────────────────────────────
function parseAmount(raw: string): number | null {
  if (!/^[△-]?\s?[\d,]+$/.test(raw)) return null;
  const n = Number(raw.replace(/[△,\s-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return raw.startsWith("△") || raw.startsWith("-") ? -n : n;
}

function rowMap(root: Element): Map<string, number> {
  const m = new Map<string, number>();
  for (const div of root.querySelectorAll("div")) {
    const spans = [...div.children].filter((c) => c.tagName === "SPAN");
    if (spans.length !== 2) continue;
    const label = spans[0].textContent?.trim() ?? "";
    const n = parseAmount(spans[1].textContent?.trim() ?? "");
    if (!label || n === null) continue;
    m.set(label, n);
  }
  return m;
}

function cellMap(root: Element): Map<string, number> {
  const m = new Map<string, number>();
  for (const tr of root.querySelectorAll("tr")) {
    const tds = [...tr.querySelectorAll("td")];
    if (tds.length < 2) continue;
    const label = tds[0].textContent?.trim() ?? "";
    const n = parseAmount(tds[1].textContent?.trim() ?? "");
    if (!label || n === null) continue;
    m.set(label, n);
  }
  return m;
}

/**
 * 제목(h3)으로 카드 하나를 집어낸다.
 *
 * 🔴 이것이 없으면 측정이 성립하지 않는다. 일괄 결과뷰는 「합산 과세 내역」 카드와 **신고서 양식
 *   표**를 함께 렌더하는데 둘 다 `<table>`이라, 카드에서 농어촌특별세 행을 통째로 지운
 *   뮤테이션이 **신고서 양식의 같은 이름 행**에 걸려 anchor가 울리지 않았다(M8 실측).
 *   구별력 0은 「안전하다」가 아니라 「엉뚱한 것을 재고 있다」는 신호다.
 */
function cardByHeading(container: Element, heading: string): Element {
  const h = [...container.querySelectorAll("h3")].find(
    (el) => el.textContent?.trim() === heading,
  );
  expect(h, `카드 제목 「${heading}」을 찾지 못했다`).toBeDefined();
  return h!.parentElement!;
}

/** 라벨로 금액을 꺼낸다. 없으면 실패한다 — `?? 0` 폴백은 「행 없음」을 삼킨다. */
function get(m: Map<string, number>, label: string): number {
  if (m.has(label)) return m.get(label)!;
  const hits = [...m.entries()].filter(([k]) => k.startsWith(label));
  expect(
    hits.length,
    `행 「${label}」이 ${hits.length}개 걸렸다 (걷힌 라벨: ${[...m.keys()].join(" · ")})`,
  ).toBe(1);
  return hits[0][1];
}

// ── F-0 구별력 ──────────────────────────────────────────────────────
/**
 * 감면이 0이면 결정세액 == 산출세액이고 농특세도 0이라 **스택 행이 서로 구별되지 않는다**.
 * 구별력 0은 「안전하다」가 아니라 「재지 못한다」는 뜻이다.
 */
describe("F-0 격자 — 감면·농어촌특별세가 실제로 발생한다", () => {
  it("집계(다건·일괄) 격자", () => {
    const a = agg2();
    expect(a.reductionAmount, "감면 0이면 결정세액 == 산출세액이라 구별력이 없다").toBeGreaterThan(0);
    expect(a.ruralSurtax ?? 0, "농특세 0이면 그 행의 누락을 잴 수 없다").toBeGreaterThan(0);
    expect(a.determinedTax).toBeGreaterThan(0);
    expect(a.localIncomeTax).toBeGreaterThan(0);
    expect(a.calculatedTax).not.toBe(a.determinedTax);
  });

  it("단건 격자", () => {
    const r = calculateTransferTax(land({ reductions: EXPROPRIATION } as never), rates);
    expect(r.reductionAmount).toBeGreaterThan(0);
    expect(r.determinedTax).toBeGreaterThan(0);
    expect(r.calculatedTax).not.toBe(r.determinedTax);
  });

  it("겸용 격자", () => {
    const t = mixed().total;
    expect(t.reductionAmount, "겸용에 §77 감면이 붙지 않으면 #001을 잴 수 없다").toBeGreaterThan(0);
    expect(t.ruralSurtax).toBeGreaterThan(0);
    expect(t.transferTax).not.toBe(t.determinedTax);
  });
});

function mixed() {
  return calcMixedUseTransferTax(
    3_000_000_000,
    D("2026-06-01"),
    {
      ...mixedUseCase14(),
      isOneHouseExempt: false,
      reductions: EXPROPRIATION,
    } as never,
    makeMockRatesWithHouseEngine(),
  );
}

// ── F-1 겸용 (#001) ─────────────────────────────────────────────────
describe("F-1 겸용 「합산 세액」 — 그린 행들의 합 = 엔진 총 납부세액", () => {
  it("결정세액 + 지방소득세 + 가산세 + 농어촌특별세 = 총 납부세액", () => {
    const b = mixed();
    const t = b.total;
    const { container } = render(<MixedUseResultCard breakdown={b} />);
    const rows = rowMap(container);

    const sum =
      get(rows, "결정세액") +
      get(rows, "지방소득세 (10%)") +
      (t.penaltyTax > 0 ? get(rows, "가산세") : 0) +
      (t.ruralSurtax > 0 ? get(rows, "농어촌특별세") : 0);
    expect(sum).toBe(get(rows, "총 납부세액"));
    expect(get(rows, "총 납부세액")).toBe(t.totalPayable);
  });

  it("산출세액 − 감면세액 = 결정세액 (표 내부 검산)", () => {
    const b = mixed();
    const { container } = render(<MixedUseResultCard breakdown={b} />);
    const rows = rowMap(container);
    // 「감면세액」 행은 △ 표기라 음수로 읽힌다.
    expect(get(rows, "양도소득세") + get(rows, "감면세액")).toBe(get(rows, "결정세액"));
  });

  it("지방소득세는 결정세액 × 10%다 (산출세액이 아니다)", () => {
    const b = mixed();
    const { container } = render(<MixedUseResultCard breakdown={b} />);
    const rows = rowMap(container);
    expect(get(rows, "지방소득세 (10%)")).toBe(Math.floor(get(rows, "결정세액") * 0.1));
    expect(
      get(rows, "지방소득세 (10%)"),
      "감면이 있으면 산출세액 × 10%와 달라야 한다 — 같으면 격자에 구별력이 없다",
    ).not.toBe(Math.floor(get(rows, "양도소득세") * 0.1));
  });
});

// ── F-2 일괄 (#087) ─────────────────────────────────────────────────
describe("F-2 일괄 「합산 과세 내역」 — 국세 + 지방세 + 농특세 = 총납부세액", () => {
  it("스택 합이 엔진 totalTax와 같다", () => {
    const a = agg2();
    const { container } = render(
      <BundledAllocationCard
        apportionment={APPORTIONMENT as never}
        aggregated={a}
        formData={createDefaultTransferFormData()}
      />,
    );
    const cells = cellMap(cardByHeading(container, "합산 과세 내역"));
    const sum =
      get(cells, "국세 납부세액") +
      get(cells, "지방세 납부세액") +
      ((a.ruralSurtax ?? 0) > 0 ? get(cells, "농어촌특별세") : 0);
    expect(sum).toBe(get(cells, "총납부세액"));
    expect(get(cells, "총납부세액")).toBe(a.totalTax);
  });
});

// ── F-3 다건 (#087) ─────────────────────────────────────────────────
describe("F-3 다건 합산 카드 — 정산 축도 농특세를 포함해 마감된다", () => {
  it("차감납부세액 + 지방세 + 농어촌특별세 = 최종 납부세액", () => {
    const a = agg2();
    const properties = a.properties.map((p) => ({
      propertyId: p.propertyId,
      propertyLabel: p.propertyLabel,
    })) as unknown as PropertyItem[];
    const { container } = render(
      <MultiTransferTaxResultView result={a} properties={properties} taxYear={2026} />,
    );
    const rows = rowMap(container.querySelector('[data-print-id="summary"]')!);
    // 정산 축(§111③)은 국세·지방세 정산분만 담으므로 농특세를 별도 행으로 얹어 마감한다.
    expect(get(rows, "결정세액")).toBe(a.determinedTax);
    expect(get(rows, "지방세 결정세액")).toBe(a.localIncomeTax);
    expect(get(rows, "농어촌특별세")).toBe(a.ruralSurtax ?? 0);
  });
});

// ── F-4 단건 hero (#087) ────────────────────────────────────────────
describe("F-4 단건 헤드라인 — 칩 합이 총납부세액과 같다", () => {
  it("결정세액 + 가산세 + 지방소득세 + 농어촌특별세 = 총 납부세액", () => {
    const r = calculateTransferTax(land({ reductions: EXPROPRIATION } as never), rates);
    const { container } = render(
      <TransferTaxResultView result={r} onReset={() => {}} onBack={() => {}} />,
    );
    const text = container.textContent ?? "";
    /** 칩은 `<span>라벨 1,234</span>` 한 덩어리라 행 수집기로는 안 잡힌다. */
    const chip = (label: string): number => {
      const m = text.match(new RegExp(`${label}\\s([\\d,]+)`));
      expect(m, `칩 「${label}」을 찾지 못했다`).not.toBeNull();
      return Number(m![1].replace(/,/g, ""));
    };
    const sum =
      chip("결정세액") +
      (r.penaltyTax > 0 ? chip("가산세") : 0) +
      chip("지방소득세") +
      chip("농어촌특별세");
    expect(sum).toBe(r.totalTax);
  });
});
