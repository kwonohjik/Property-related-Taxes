/**
 * anchor: 결과탭 금액 표시의 **안전망**(결과탭 코드리뷰 Lane 6).
 *
 * 리뷰가 실측한 사각지대 — 표시 지점을 통째로 변조해도 아무 테스트도 실패하지 않았다:
 *   · #051 다건 「합산 결과」 카드 17행 — 결정세액 자리에 산출세액을 그려도 8,497건 중 **0건** 실패
 *   · #058 겸용 결과뷰 본문 96개 표시 지점 — 일괄 +11,111,111 해도 **0건** 실패
 *   · #059 일괄 「합산 과세 내역」 과세표준·결정세액 — **0건**
 *   · #091 결과뷰 3개의 최종 세액 표시 — 렌더 테스트 **0건**
 *
 * 그래서 Lane 3(표시 단일 소스화)에서 값을 옮기면 회귀를 잡을 수단이 없었다.
 * 이 anchor가 그 바닥을 깐다. 두 축으로만 단언한다:
 *
 *   (a) **엔진 대조** — 화면에 그려진 금액이 엔진 result의 대응 필드와 **같은 값**인가.
 *       표시부가 값을 다시 계산하면(A 계열 지방소득세 4벌 재계산이 그랬다) 여기서 갈린다.
 *   (b) **표 내부 항등식** — 같은 표 안에서 위아래 행이 산술적으로 맞는가.
 *
 * ⚠️ 현행 동작을 그대로 박제(characterization)하지 않는다. 리뷰가 이미 **깨져 있다고 확정한**
 *   항등식(#102 다건 「양도차익」이 비과세 gross 차익을 빼 위 세 행과 검산이 안 맞는 건)은
 *   여기서 단언하지 않는다 — 그것을 지금 고정하면 Lane 3이 그 defect를 「기존 동작」으로
 *   상속한다. 해당 항등식은 Lane 3에서 고칠 때 그 커밋의 anchor로 들어간다.
 *   (memory `feedback_anchor_correction_legal_priority`)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import {
  makeMockRates,
  baseTransferInput,
  makeMockRatesWithHouseEngine,
} from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 안분 표는 이 anchor의 관심사가 아니다 — 렌더가 죽지 않을 최소 형태만 채운다. */
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

/**
 * §77 공익수용(현금) — 감면을 **일부러** 건다.
 *
 * 🔴 처음에는 감면 없는 격자로 짰다가 뮤테이션 프로브가 이것을 반증했다:
 *   「결정세액」 자리에 `calculatedTax`를 그려도 9건이 전부 통과했다. 감면이 0이면
 *   `calculatedTax === determinedTax`라 그 행은 **애초에 구별력이 없다**.
 *   구별력 0은 「안전하다」가 아니라 「재지 못한다」는 뜻이다
 *   (memory `feedback_negative_assertion_needs_mutation_probe`).
 */
const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 900_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

/** 2자산 집계 — 다건다운 형태여야 합산 행에 구별력이 생긴다. */
function agg2() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...land({ reductions: EXPROPRIATION } as never),
          propertyId: "p1",
          propertyLabel: "토지 A",
        } as never,
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

/**
 * 렌더된 DOM에서 「라벨 → 금액」을 걷는다.
 *
 * 결과탭의 금액 행은 `<div class="flex justify-between"><span>라벨</span><span>값</span></div>`
 * 형태다(`ResultRow` · 겸용 `Row`). testid가 없으므로 이 구조가 접근 경로다 —
 * 공용 카드는 testid를 DOM에 흘리지 않는다(memory `feedback_shared_card_testid_not_forwarded`).
 */
function rowMap(root: Element): Map<string, number> {
  const m = new Map<string, number>();
  for (const div of root.querySelectorAll("div")) {
    const spans = [...div.children].filter((c) => c.tagName === "SPAN");
    if (spans.length !== 2) continue;
    const label = spans[0].textContent?.trim() ?? "";
    const raw = spans[1].textContent?.trim() ?? "";
    if (!label) continue;
    const n = parseAmount(raw);
    if (n === null) continue;
    m.set(label, n);
  }
  return m;
}

/** 「1,234」·「-1,234」·「△ 1,234」(차감 표기)를 읽는다. 금액이 아니면 null. */
function parseAmount(raw: string): number | null {
  if (!/^[△-]?\s?[\d,]+$/.test(raw)) return null;
  const n = Number(raw.replace(/[△,\s-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return raw.startsWith("△") || raw.startsWith("-") ? -n : n;
}

/** 표(table) 기반 카드용 — 「라벨 → 금액」. */
function cellMap(table: Element): Map<string, number> {
  const m = new Map<string, number>();
  for (const tr of table.querySelectorAll("tr")) {
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
 * 라벨로 금액을 꺼낸다. 행이 없으면 **실패**한다 — `?? 0` 폴백을 두지 않는 것이 요점이다.
 *
 * 🔴 처음에는 `m.get(label) ?? 0`으로 짰다가 프로브가 이것을 반증했다: 실제 라벨이
 *   「농어촌특별세 **(감면세액 × 20%)**」라 정확일치가 빗나갔고, 폴백 0이 그 실패를 삼켜
 *   「검산이 4,988,693 어긋난다」는 **가짜 결함**을 만들었다. 표는 정상이었다.
 *   폴백은 「행이 없다」와 「행 값이 0이다」를 구별하지 못한다 — 안전망에서는 치명적이다.
 *
 * 접두 일치는 허용하되 **유일해야** 한다. 둘 이상 걸리면 어느 행을 재는지 알 수 없다
 * (memory `feedback_hint_quoting_toggle_title_breaks_selector`).
 */
function get(m: Map<string, number>, label: string): number {
  if (m.has(label)) return m.get(label)!;
  const hits = [...m.entries()].filter(([k]) => k.startsWith(label));
  expect(
    hits.length,
    `행 「${label}」이 ${hits.length}개 걸렸다 (걷힌 라벨: ${[...m.keys()].join(" · ")})`,
  ).toBe(1);
  return hits[0][1];
}

function renderMulti(agg: ReturnType<typeof agg2>) {
  const properties = agg.properties.map((p) => ({
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
  })) as unknown as PropertyItem[];
  return render(
    <MultiTransferTaxResultView result={agg} properties={properties} taxYear={2026} />,
  );
}

// ── I-0 격자 구별력 ──────────────────────────────────────────────────
/**
 * **이 describe가 나머지 전부의 전제다.**
 *
 * 아래 anchor들은 「화면 값 = 엔진 필드」를 단언한다. 그런데 두 엔진 필드가 **우연히 같은 값**이면
 * 한쪽을 다른 쪽으로 바꿔 그려도 단언이 통과한다 — 측정이 성립하지 않는다.
 * 그래서 격자가 필드들을 실제로 갈라놓는지 먼저 못박는다. 여기가 깨지면 아래는 전부 무의미하다.
 */
describe("I-0 이 격자가 실제로 값을 갈라 놓는가", () => {
  const FIELDS = [
    "totalTransferGain",
    "totalIncomeAfterOffset",
    "taxBase",
    "calculatedTax",
    "determinedTax",
    "localIncomeTax",
  ] as const;

  it("대조 대상 필드가 모두 0이 아니다", () => {
    const agg = agg2();
    expect(agg.properties.length, "2자산 집계여야 합산 행에 구별력이 있다").toBe(2);
    for (const f of FIELDS) {
      expect(agg[f], `${f}가 0이면 이 anchor는 아무것도 구별하지 못한다`).toBeGreaterThan(0);
    }
    expect(agg.totalLongTermHoldingDeduction).toBeGreaterThan(0);
    expect(agg.basicDeduction).toBeGreaterThan(0);
  });

  it("대조 대상 필드가 서로 **다른 값**이다 (한 쌍이라도 같으면 그 행은 못 잰다)", () => {
    const agg = agg2();
    const seen = new Map<number, string>();
    for (const f of FIELDS) {
      const prev = seen.get(agg[f]);
      expect(
        prev,
        `${f}와 ${prev}가 같은 값(${agg[f].toLocaleString()})이라 서로 바꿔 그려도 단언이 통과한다`,
      ).toBeUndefined();
      seen.set(agg[f], f);
    }
  });

  it("감면이 실제로 걸려 산출세액 ≠ 결정세액이다", () => {
    const agg = agg2();
    expect(agg.reductionAmount, "감면 0이면 「결정세액」 행의 구별력이 사라진다").toBeGreaterThan(0);
    expect(agg.calculatedTax).not.toBe(agg.determinedTax);
  });
});

// ── I-1 다건 합산 결과 카드 (#051 · #091) ─────────────────────────────
describe("I-1 다건 「합산 결과」 카드 — 엔진 값을 그대로 그린다", () => {
  it("과세·세액 행 7개가 엔진 필드와 같은 값이다", () => {
    const agg = agg2();
    const { container } = renderMulti(agg);
    const summary = container.querySelector('[data-print-id="summary"]');
    expect(summary, "합산 결과 섹션이 없다").not.toBeNull();
    const rows = rowMap(summary!);

    expect(get(rows, "양도차익")).toBe(agg.totalTransferGain);
    expect(get(rows, "장기보유특별공제")).toBe(-agg.totalLongTermHoldingDeduction);
    expect(get(rows, "양도소득금액")).toBe(agg.totalIncomeAfterOffset);
    expect(get(rows, "양도소득 기본공제")).toBe(-agg.basicDeduction);
    expect(get(rows, "양도소득 과세표준")).toBe(agg.taxBase);
    expect(get(rows, "산출세액")).toBe(agg.calculatedTax);
    expect(get(rows, "결정세액")).toBe(agg.determinedTax);
    expect(get(rows, "지방세 결정세액")).toBe(agg.localIncomeTax);
  });

  it("가액 구성 3행이 자산별 합과 같다", () => {
    const agg = agg2();
    const { container } = renderMulti(agg);
    const rows = rowMap(container.querySelector('[data-print-id="summary"]')!);
    const sum = (f: "transferPrice" | "acquisitionPrice" | "necessaryExpense") =>
      agg.properties.reduce((s, p) => s + p[f], 0);

    expect(get(rows, "전체 양도가액")).toBe(sum("transferPrice"));
    expect(get(rows, "전체 취득가액")).toBe(-sum("acquisitionPrice"));
    expect(get(rows, "전체 필요경비")).toBe(-sum("necessaryExpense"));
  });

  it("표 내부 검산: 양도소득금액 − 기본공제 = 과세표준", () => {
    const agg = agg2();
    const { container } = renderMulti(agg);
    const rows = rowMap(container.querySelector('[data-print-id="summary"]')!);
    expect(get(rows, "양도소득금액") + get(rows, "양도소득 기본공제")).toBe(
      get(rows, "양도소득 과세표준"),
    );
  });

  it("표 내부 검산: 산출세액 − 감면세액 = 결정세액", () => {
    const agg = agg2();
    const { container } = renderMulti(agg);
    const rows = rowMap(container.querySelector('[data-print-id="summary"]')!);
    // 감면 행의 유무는 **엔진 값**으로 결정한다 — 화면에서 사라져도 검산이 맞아버리면 안 된다.
    expect(agg.reductionAmount).toBeGreaterThan(0);
    expect(get(rows, "산출세액") + get(rows, "공제 감면세액")).toBe(get(rows, "결정세액"));
  });
});

// ── I-2 일괄 「합산 과세 내역」 (#059) ─────────────────────────────────
describe("I-2 일괄 「합산 과세 내역」 — 엔진 값을 그대로 그린다", () => {
  function renderBundled(agg: ReturnType<typeof agg2>) {
    return render(
      <BundledAllocationCard
        apportionment={APPORTIONMENT as never}
        aggregated={agg}
        formData={createDefaultTransferFormData()}
        onBack={() => {}}
        onReset={() => {}}
      />,
    );
  }

  /** 「합산 과세 내역」 표만 본다 — 신고서·명세서 표와 섞이면 구별력을 잃는다. */
  function summaryTable(container: HTMLElement) {
    const t = [...container.querySelectorAll("table")].find((x) =>
      (x.textContent ?? "").includes("총납부세액"),
    );
    expect(t, "「총납부세액」이 있는 합산 과세 내역 표가 없다").toBeDefined();
    return t!;
  }

  it("과세표준·산출세액이 엔진 필드와 같은 값이다", () => {
    const agg = agg2();
    const { container } = renderBundled(agg);
    const cells = cellMap(summaryTable(container));

    expect(get(cells, "양도소득금액 (합산)")).toBe(agg.totalIncomeAfterOffset);
    expect(get(cells, "과세표준")).toBe(agg.taxBase);
    expect(get(cells, "산출세액")).toBe(agg.calculatedTax);
  });

  it("표 내부 검산: 양도소득금액 − 기본공제 = 과세표준", () => {
    const agg = agg2();
    const { container } = renderBundled(agg);
    const cells = cellMap(summaryTable(container));
    expect(agg.basicDeduction).toBeGreaterThan(0);
    expect(get(cells, "양도소득금액 (합산)") + get(cells, "기본공제")).toBe(
      get(cells, "과세표준"),
    );
  });

  it("표 내부 검산: 국세 + 지방세 + 농특세 = 총납부세액", () => {
    const agg = agg2();
    const { container } = renderBundled(agg);
    const cells = cellMap(summaryTable(container));
    // 농특세 행의 유무는 **엔진 값**으로 결정한다(라벨은 「농어촌특별세 (감면세액 × 20%)」).
    expect(agg.ruralSurtax ?? 0).toBeGreaterThan(0);
    expect(
      get(cells, "국세 납부세액") + get(cells, "지방세 납부세액") + get(cells, "농어촌특별세"),
    ).toBe(get(cells, "총납부세액"));
    expect(get(cells, "농어촌특별세")).toBe(agg.ruralSurtax);
  });
});

// ── I-2b 겸용 결과뷰 「합산 세액」 (#058) ──────────────────────────────
/**
 * 리뷰 실측: 겸용 본문 **96개 표시 지점을 일괄 +11,111,111 해도 0건 실패**했다.
 * 여기서는 세액 축의 뿌리 5개만 못박는다 — 그것이 흔들리면 아래 96개가 전부 흔들린다.
 *
 * ⚠️ 「총 납부세액」 행은 여기서 단언하지 않는다. 리뷰 #001이 「합산 세액」 표에
 *   감면세액·결정세액·가산세·농특세 행이 없어 총액이 자기 산식과 어긋난다고 **확정**했다.
 *   지금 고정하면 Lane 3이 그 defect를 상속한다.
 */
describe("I-2b 겸용 「합산 세액」 — 엔진 값을 그대로 그린다", () => {
  const mixed = () =>
    calcMixedUseTransferTax(
      3_000_000_000,
      D("2026-06-01"),
      { ...mixedUseCase14(), isOneHouseExempt: false },
      makeMockRatesWithHouseEngine(),
    );

  it("합산 양도소득금액·과세표준·양도소득세·지방소득세가 엔진 필드와 같은 값이다", () => {
    const b = mixed();
    const t = b.total;
    expect(t.aggregateIncome, "격자가 0이면 구별력이 없다").toBeGreaterThan(0);
    expect(t.taxBase).toBeGreaterThan(0);
    expect(t.transferTax).toBeGreaterThan(0);
    expect(t.localTax).toBeGreaterThan(0);

    const { container } = render(<MixedUseResultCard breakdown={b} />);
    const rows = rowMap(container);

    expect(get(rows, "합산 양도소득금액")).toBe(t.aggregateIncome);
    expect(get(rows, "과세표준")).toBe(t.taxBase);
    expect(get(rows, "양도소득세")).toBe(t.transferTax);
    expect(get(rows, "지방소득세 (10%)")).toBe(t.localTax);
  });

  it("표 내부 검산: 합산 양도소득금액 − 기본공제 = 과세표준", () => {
    const b = mixed();
    expect(b.total.basicDeduction).toBeGreaterThan(0);
    const { container } = render(<MixedUseResultCard breakdown={b} />);
    const rows = rowMap(container);
    expect(get(rows, "합산 양도소득금액") + get(rows, "기본공제")).toBe(get(rows, "과세표준"));
  });
});

// ── I-3 두 집계 뷰가 같은 result에서 같은 숫자를 낸다 (#091) ────────────
describe("I-3 일괄·다건 결과뷰가 같은 엔진 result에서 같은 값을 그린다", () => {
  it("과세표준·산출세액이 두 뷰에서 일치한다", () => {
    const agg = agg2();

    const multi = renderMulti(agg);
    const multiRows = rowMap(multi.container.querySelector('[data-print-id="summary"]')!);
    const multiBase = get(multiRows, "양도소득 과세표준");
    const multiCalc = get(multiRows, "산출세액");
    cleanup();

    const bundled = render(
      <BundledAllocationCard
        apportionment={APPORTIONMENT as never}
        aggregated={agg}
        formData={createDefaultTransferFormData()}
        onBack={() => {}}
        onReset={() => {}}
      />,
    );
    const table = [...bundled.container.querySelectorAll("table")].find((x) =>
      (x.textContent ?? "").includes("총납부세액"),
    )!;
    const cells = cellMap(table);

    expect(multiBase).toBe(get(cells, "과세표준"));
    expect(multiCalc).toBe(get(cells, "산출세액"));
    expect(multiBase).toBe(agg.taxBase);
  });
});
