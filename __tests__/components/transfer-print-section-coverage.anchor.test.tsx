/**
 * anchor: 결과탭 **인쇄 게이트**(결과탭 코드리뷰 Lane 2).
 *
 * 리뷰가 확정한 세 결함은 전부 「화면에서는 멀쩡한데 인쇄물에서만 어긋난다」는 종류다 —
 * 값 anchor도 렌더 anchor도 잡지 못하고, 사용자는 PDF를 뽑아 봐야 안다:
 *
 *   · #004 #056 #073  `availablePrintIds`가 렌더 게이트를 무시하고 3개 leaf를 무조건
 *                     「가용」으로 선언 → 화면에 **없는** 섹션이 선택지에 뜨고 인쇄된다
 *   · #005 #037 #090 #100  다건 「건별 상세」 아코디언만 조건부 **언마운트**라, 기본값이
 *                     접힘인 채로 인쇄하면 자산별 신고서·감면·평가 상세가 통째로 빠진다
 *   · #006            다건 정정 카드만 첫 `PrintSection`보다 위에 있어 어느 leaf에도
 *                     속하지 않았다 — 일괄은 2026-08-27에 고친 비대칭이 남아 있었다
 *
 * 리뷰는 이 축의 anchor가 **0건**이라고 실측했다. 여기서 바닥을 깐다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  MultiTransferTaxResultView,
  hasReductionRecalc,
  hasGroupTaxCards,
  hasLossOffsetTable,
} from "@/components/calc/results/MultiTransferTaxResultView";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

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

/** 감면·차손·세율군이 **하나도 없는** 평범한 2자산 — 세 leaf가 전부 렌더되지 않아야 한다. */
function plainAgg() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...land(), propertyId: "p1", propertyLabel: "토지 A" } as never,
        {
          ...land({ transferPrice: 1_400_000_000, acquisitionPrice: 500_000_000 }),
          propertyId: "p2",
          propertyLabel: "토지 B",
        } as never,
      ],
    },
    rates,
  );
}

function props(a: ReturnType<typeof plainAgg>) {
  return a.properties.map((p) => ({
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
  })) as unknown as PropertyItem[];
}

// ── PG-0 격자 구별력 ─────────────────────────────────────────────────
describe("PG-0 격자", () => {
  it("이 격자에서 세 leaf는 실제로 렌더되지 않는다", () => {
    const a = plainAgg();
    expect(hasReductionRecalc(a), "감면이 있으면 이 anchor는 아무것도 구별하지 못한다").toBe(false);
    expect(hasGroupTaxCards(a)).toBe(false);
    expect(hasLossOffsetTable(a)).toBe(false);
  });
});

// ── PG-1 선택 목록 ↔ 렌더 게이트 (#004 #056 #073) ──────────────────────
describe("PG-1 「출력 항목 선택」에 화면에 없는 섹션이 뜨지 않는다", () => {
  /** 패널의 체크박스 라벨 = 선택 가능한 leaf. */
  function panelLabels(container: HTMLElement): string[] {
    return [...container.querySelectorAll('input[type="checkbox"]')]
      .map((el) => el.closest("label")?.textContent?.trim() ?? "")
      .filter(Boolean);
  }

  it("감면 재계산·세율군·차손 통산이 렌더되지 않으면 선택지에도 없다", () => {
    const a = plainAgg();
    const { container } = render(
      <MultiTransferTaxResultView result={a} properties={props(a)} taxYear={2026} />,
    );

    /*
     * 전제 — 세 섹션은 실제로 화면에 없다.
     * ⚠️ `PrintSection`은 **자식이 null이어도 wrapper div를 그린다**(`PrintSection.tsx:26`).
     *   그래서 `[data-print-id=…]`의 존재로는 판정할 수 없다 — 내용이 비었는지를 본다.
     */
    for (const id of ["reduction-recalc", "group-tax", "loss-offset"]) {
      const sec = container.querySelector(`[data-print-id="${id}"]`);
      expect((sec?.textContent ?? "").trim(), `${id} 섹션이 실제로 렌더됐다`).toBe("");
    }

    const labels = panelLabels(container).join(" | ");
    expect(labels, "패널이 비면 이 단언은 공허하다").not.toBe("");
    expect(labels).not.toContain("감면세액 합산 재계산");
    expect(labels).not.toContain("세율군별");
    expect(labels).not.toContain("차손 통산");
  });

  it("데이터가 있으면 선택지에 나타난다 (게이트가 통째로 막지 않는다)", () => {
    const a = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        annualBasicDeductionUsed: 0,
        properties: [
          {
            ...land({
              reductions: [
                {
                  type: "public_expropriation" as const,
                  cashCompensation: 900_000_000,
                  bondCompensation: 0,
                  bondHoldingYears: null,
                  businessApprovalDate: D("2024-01-01"),
                },
              ],
            } as never),
            propertyId: "p1",
            propertyLabel: "토지 A",
          } as never,
        ],
      },
      rates,
    );
    expect(hasReductionRecalc(a), "감면 격자가 성립하지 않으면 대조군이 안 된다").toBe(true);

    const { container } = render(
      <MultiTransferTaxResultView result={a} properties={props(a)} taxYear={2026} />,
    );
    expect(container.querySelector('[data-print-id="reduction-recalc"]')).not.toBeNull();
  });
});

// ── PG-2 인쇄 펼침은 CSS-only (#005 #037 #090 #100) ────────────────────
describe("PG-2 접힌 아코디언도 인쇄 DOM에 남는다", () => {
  it("「건별 상세」가 접힌 상태에서도 자산별 본문이 DOM에 존재한다", () => {
    const a = plainAgg();
    const { container } = render(
      <PropertyBreakdownAccordion breakdown={a.properties[0]} property={undefined} />,
    );
    // 기본값은 접힘이다 — 아무것도 누르지 않은 상태가 인쇄 시점의 상태다.
    const body = container.querySelector(".hidden.print\\:block");
    expect(body, "접힘 상태의 본문이 DOM에 없다 — 조건부 언마운트로 되돌아갔다").not.toBeNull();
    expect(body!.textContent ?? "", "본문이 비어 있다").toContain("양도가액");
  });

  it("소스가 `{open && (` 조건부 마운트를 쓰지 않는다", () => {
    const src = readFileSync("components/calc/results/MultiTransferPropertyBreakdown.tsx", "utf8");
    expect(src, "CSS-only 규약 위반 — skill `print-only-css-toggle`").not.toMatch(
      /\{\s*open\s*&&\s*\(/,
    );
    expect(src).toContain('hidden print:block');
  });
});

// ── PG-3 모든 카드가 어느 leaf에 속한다 (#006) ─────────────────────────
describe("PG-3 정정 카드가 인쇄 그룹 안에 있다", () => {
  it("다건: `amendment-result`가 `data-print-id` 조상을 갖는다", () => {
    const a = plainAgg();
    const withAmendment = {
      ...a,
      amendmentDetail: {
        originalDeterminedTax: 100_000_000,
        amendedDeterminedTax: 137_861_431,
        additionalTax: 37_861_431,
        underReportingReductionRate: 0,
        underReportingPenalty: 0,
        latePaymentPenalty: 0,
        additionalLocalIncomeTax: 3_786_143,
        totalPayable: 37_861_431,
        correctionKind: "amend" as const,
        steps: [],
      },
    } as unknown as typeof a;

    const { container } = render(
      <MultiTransferTaxResultView result={withAmendment} properties={props(a)} taxYear={2026} />,
    );
    const card = container.querySelector('[data-testid="amendment-result"]');
    expect(card, "정정 카드가 렌더되지 않았다 — 격자를 고칠 것").not.toBeNull();
    expect(
      card!.closest("[data-print-id]"),
      "정정 카드가 어느 인쇄 leaf에도 속하지 않는다 — 인쇄·PDF에서 빠진다",
    ).not.toBeNull();
  });

  it("일괄도 같다 (2026-08-27에 고친 정본이 유지된다)", () => {
    const src = readFileSync("components/calc/results/BundledAllocationCard.tsx", "utf8");
    const idx = src.indexOf("<AmendmentResultCard");
    expect(idx).toBeGreaterThan(0);
    // 그 앞에 `<PrintSection id="calculation"`이 열려 있어야 한다.
    expect(src.lastIndexOf('<PrintSection id="calculation"', idx)).toBeGreaterThan(0);
  });
});
