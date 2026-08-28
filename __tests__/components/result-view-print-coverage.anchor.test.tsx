/**
 * anchor: 결과뷰의 **모든 카드가 「출력 항목 선택」에 걸린다** (결과탭 코드리뷰 — #062 · #089).
 *
 * ## 감싸지 않은 블록은 «항상» 인쇄된다
 *
 * `PrintSection`은 미선택 시 `print:hidden`만 붙인다(`shared/PrintSection.tsx`). 그래서 그
 * 래퍼 **밖**에 있는 블록은 선택 상태와 무관하게 인쇄된다 — 「신고서 양식 표」만 체크해도
 * 재개발 §166 3분할·감면 산출근거 카드(단건)와 「양도가액 안분」 표(일괄)가 그대로 딸려 나왔다.
 *
 * 실측(착수 전, 재개발 입주권 + §77 공익수용 격자):
 *
 * | 뷰 | `data-print-id` 없는 루트 직계 자식 |
 * |---|---|
 * | 단건 | 출력 패널 · **재개발 3분할 카드** · **감면 산출근거 카드** · 면책 고지 · 네비 |
 * | 일괄 | 출력 패널 · **「양도가액 안분」 표** · 네비 |
 *
 * ⚠️ **격자를 잘못 잡으면 이 anchor는 아무것도 못 본다** — 단순 토지로 재면 그 카드들이 애초에
 *   렌더되지 않아 위반이 2건(면책·네비)뿐이다. 그래서 A-0이 「문제의 카드가 실제로 뜨는가」를
 *   먼저 확인한다.
 *
 * ## 새 leaf로 감쌌다 — 옮기지 않았다
 *
 * 그 블록들은 화면에서 신고서 표 **앞**(일괄) 또는 맨 뒤(단건)에 있어, 기존 섹션으로 옮기면
 * 일괄의 핵심 표인 「양도가액 안분」이 뒤로 밀린다. 새 leaf(`allocation`·`detail-cards`)는
 * **화면 순서를 그대로 두면서** 선택 가능하게 하고, `data-print-id`도 유일하게 유지한다
 * (중복이면 Playwright strict 로케이터가 깨진다).
 *
 * ## 목록과 화면이 «같은 술어»를 본다 (#089)
 *
 * `detail-cards`는 조건부라 하나도 안 뜰 수 있다. 렌더 게이트와 `availablePrintIds`가 각각
 * 판정하면 「목록에 있는데 화면에 없다」가 생기므로 **같은 술어**(`hasSingleDetailCards` →
 * `hasReductionDetailCards`)를 부르게 했다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { flattenPrintSectionIds } from "@/lib/print/transfer-print-sections";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const APPORTIONMENT = {
  apportioned: [],
  totalStandardAtTransfer: 0,
  residualAbsorbedBy: null,
  legalBasis: "소득세법 시행령 §166⑥",
  warnings: [],
};

/**
 * 래퍼 밖이어도 **정당한** 직계 자식.
 * - 출력 항목 선택 패널: 자기 자신을 선택 대상으로 만들 수 없다.
 * - 면책 고지: 선택과 무관하게 항상 인쇄되어야 한다.
 * - 하단 네비 버튼: `print:hidden`이라 인쇄에 애초에 안 나온다.
 * - 계산 경고 카드: 단건·일괄·다건 **세 뷰 모두** 패널 위 상시 노출로 통일돼 있다.
 */
const ALLOWED = [/출력 항목 선택/, /면책 고지/, /다시 계산하기|홈으로/, /확인이 필요한 사항/];

function looseChildren(root: Element): string[] {
  return [...root.children]
    .filter((c) => !c.hasAttribute("data-print-id"))
    .map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => !ALLOWED.some((re) => re.test(t)))
    .map((t) => t.slice(0, 80));
}

/** 재개발 입주권 + §77 공익수용 — 단건 ⑦ 상세 카드가 실제로 뜨는 격자. */
function richSingle() {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 520_000_000,
      transferDate: D("2023-03-02"),
      acquisitionDate: D("2002-04-09"),
      acquisitionPrice: 100_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      householdRightCount: 1,
      residencePeriodMonths: 0,
      transferCause: "public_expropriation",
      reductions: [
        {
          type: "public_expropriation",
          cashCompensation: 520_000_000,
          bondCompensation: 0,
          bondHoldingYears: null,
          businessApprovalDate: D("2022-01-01"),
        },
      ],
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: D("2018-10-23"),
        rightsValue: 300_000_000,
        settlementDirection: "pay",
        settlementAmount: 90_000_000,
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing",
      },
    } as Partial<TransferTaxInput>),
    rates,
  );
}

function bundled() {
  const land = (over: Partial<TransferTaxInput> = {}) =>
    baseTransferInput({
      propertyType: "land",
      acquisitionDate: D("2010-03-01"),
      transferDate: D("2026-02-01"),
      transferPrice: 900_000_000,
      acquisitionPrice: 300_000_000,
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 0,
      isNonBusinessLand: false,
      ...over,
    } as Partial<TransferTaxInput>);
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...land(), propertyId: "a1", propertyLabel: "토지" } as never,
        { ...land({ transferPrice: 400_000_000 }), propertyId: "a2", propertyLabel: "건물" } as never,
      ],
    } as never,
    rates,
  );
}

// ── A-0 구별력 ──────────────────────────────────────────────────────
describe("A-0 격자 — 문제의 카드가 실제로 렌더된다", () => {
  it("단건 격자가 재개발 detail과 §77 감면을 낸다 (없으면 anchor가 아무것도 못 본다)", () => {
    const r = richSingle();
    expect(r.redevelopmentDetail).toBeDefined();
    expect(r.reductionAmount).toBeGreaterThan(0);
    expect(r.reductionTypeApplied).toBe("public_expropriation");
  });
});

// ── A-1 단건 ────────────────────────────────────────────────────────
describe("A-1 단건 — 모든 카드가 PrintSection 안에 있다 (#062)", () => {
  it("🔴 래퍼 밖 카드가 없다", () => {
    const { container } = render(
      <TransferTaxResultView result={richSingle()} onReset={() => {}} onBack={() => {}} />,
    );
    const loose = looseChildren(container.firstElementChild!);
    expect(loose, `\n선택 출력이 걸리지 않는 블록:\n${loose.join("\n")}`).toEqual([]);
  });

  it("🔴 상세 카드 묶음이 detail-cards leaf로 감싸져 있다", () => {
    const { container } = render(
      <TransferTaxResultView result={richSingle()} onReset={() => {}} onBack={() => {}} />,
    );
    const sec = container.querySelector('[data-print-id="detail-cards"]');
    expect(sec, "detail-cards 섹션이 없다").not.toBeNull();
    expect(sec!.textContent ?? "").toContain("재개발/재건축 양도차익 3분할");
    expect(sec!.textContent ?? "").toContain("공익사업 수용 감면 상세");
  });
});

// ── A-2 일괄 ────────────────────────────────────────────────────────
describe("A-2 일괄 — 「양도가액 안분」이 선택 가능하고 순서가 그대로다 (#062)", () => {
  it("🔴 래퍼 밖 카드가 없다", () => {
    const { container } = render(
      <BundledAllocationCard
        aggregated={bundled()}
        apportionment={APPORTIONMENT as never}
        formData={{ assets: [] } as never}
      />,
    );
    const loose = looseChildren(container.firstElementChild!);
    expect(loose, `\n선택 출력이 걸리지 않는 블록:\n${loose.join("\n")}`).toEqual([]);
  });

  it("🔴 안분 표가 신고서 표보다 **앞**에 있다 (감싸면서 순서를 바꾸지 않았다)", () => {
    const { container } = render(
      <BundledAllocationCard
        aggregated={bundled()}
        apportionment={APPORTIONMENT as never}
        formData={{ assets: [] } as never}
      />,
    );
    const ids = [...container.firstElementChild!.children]
      .map((c) => c.getAttribute("data-print-id"))
      .filter(Boolean) as string[];
    expect(ids.indexOf("allocation")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("allocation")).toBeLessThan(ids.indexOf("form-table"));
  });
});

// ── A-3 레지스트리 ──────────────────────────────────────────────────
describe("A-3 새 leaf가 레지스트리에 등록돼 있다", () => {
  it("선택 패널이 그릴 수 있어야 고를 수 있다", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toContain("allocation");
    expect(ids).toContain("detail-cards");
    expect(new Set(ids).size, "leaf id가 중복이다").toBe(ids.length);
  });
});
