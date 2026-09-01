/**
 * @vitest-environment jsdom
 *
 * 비상장 보충적 평가 — 결손·자본잠식(음수) 직접 입력 anchor (DN-1~5·7~12)
 *
 * 계획서: docs/00-pm/post-listing-deficit-negative-input.plan.md §9
 *
 * 🔴 **이 파일이 지키는 것은 「부호가 살아남는가」다.**
 *    `CurrencyInput`은 `allowNegative` 미전달 시 선행 `-`를 **차단이 아니라 조용히 제거**한다
 *    (CurrencyInput.tsx:97). 결손이 같은 크기의 **이익으로 뒤집힌 채** 엔진에 도달한다.
 *    수정 전 실측: 1주당 기준시가 38,000 vs 16,000 (2.4배 과대).
 *
 * ⚠️ **셀렉터** — 이 카드들의 `<label>`은 `htmlFor`가 없고 `input`에 `id`/`aria-label`이 없어
 *    RTL의 `getByRole("textbox", { name })`이 접근 가능한 이름을 계산하지 못한다.
 *    라벨 텍스트 → 감싸는 컨테이너 → `input` 순으로 내려간다(`inputByLabel`).
 *    placeholder는 24행 표에서 전부 `"원"`이라 판별자가 되지 못한다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { YearColumn as NIYearColumn } from "@/components/calc/stock-transfer/PostListingNetIncomeStatement";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { MonthlyAccrual81Section } from "@/components/calc/stock-transfer/MonthlyAccrual81Section";
import {
  createInitialStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

/**
 * 라벨 텍스트로 입력칸을 찾는다.
 * - FieldCard: `<div data-slot="field-card">` 안에 `<label>`과 입력이 함께 있다.
 * - CurrencyInput 자체 라벨: `<div class="space-y-1.5">` 안에 `<label>`과 입력이 형제다.
 */
function inputByLabel(re: RegExp): HTMLInputElement {
  const hits = Array.from(document.querySelectorAll("label")).filter((l) =>
    re.test((l.textContent ?? "").trim()),
  );
  expect(hits, `라벨 ${re} 매칭 1건이어야 한다`).toHaveLength(1);
  const scope = hits[0].closest('[data-slot="field-card"]') ?? hits[0].parentElement!;
  const input = scope.querySelector("input");
  expect(input, `라벨 ${re} 의 입력칸`).not.toBeNull();
  return input as HTMLInputElement;
}

/** 상태를 들고 있는 하네스 — 입력이 store에 반영되어야 다음 단언이 의미를 갖는다. */
function useFormHarness(initial: Partial<StockTransferFormData> = {}) {
  const patches: Partial<StockTransferFormData>[] = [];
  function Harness({ children }: { children: (f: StockTransferFormData, onChange: (p: Partial<StockTransferFormData>) => void) => React.ReactNode }) {
    const [form, setForm] = React.useState<StockTransferFormData>({
      ...createInitialStockFormData(),
      ...initial,
    } as StockTransferFormData);
    return <>{children(form, (p) => { patches.push(p); setForm((prev) => ({ ...prev, ...p })); })}</>;
  }
  return { Harness, patches };
}

// ============================================================
// Phase 1 — 완전재현 순손익 계산서 (W-1)
// ============================================================

describe("DN-1~5: 완전재현 순손익 계산서 행 1 (소령 §165④1 가목)", () => {
  it("DN-1: 행 1 「각 사업연도 소득금액」에 음수 입력 → 부호 보존", () => {
    const { Harness, patches } = useFormHarness();
    render(<Harness>{(form, onChange) => <NIYearColumn form={form} onChange={onChange} col="Listing" />}</Harness>);

    const row1 = inputByLabel(/^1\. 각 사업연도 소득금액$/);
    fireEvent.focus(row1);
    fireEvent.change(row1, { target: { value: "-500000000" } });

    expect(patches.at(-1)).toEqual({ niAddRow1Listing: "-500000000" });
  });

  it("DN-2: 가산 행 2(환급금 이자)는 종전대로 부호 제거 — 가산 성질상 비음수", () => {
    const { Harness, patches } = useFormHarness();
    render(<Harness>{(form, onChange) => <NIYearColumn form={form} onChange={onChange} col="Listing" />}</Harness>);

    const row2 = inputByLabel(/^2\. 국세·지방세 과오납 환급금 이자$/);
    fireEvent.focus(row2);
    fireEvent.change(row2, { target: { value: "-100" } });

    expect(patches.at(-1)).toEqual({ niAddRow2Listing: "100" });
  });

  it("DN-3: 차감 행 5(벌금·과료)는 종전대로 부호 제거", () => {
    const { Harness, patches } = useFormHarness();
    render(<Harness>{(form, onChange) => <NIYearColumn form={form} onChange={onChange} col="Listing" />}</Harness>);

    const row5 = inputByLabel(/^5\. 벌금·과료·과태료·가산금·체납처분비$/);
    fireEvent.focus(row5);
    fireEvent.change(row5, { target: { value: "-100" } });

    expect(patches.at(-1)).toEqual({ niSubRow5Listing: "100" });
  });

  it("DN-4: §165④ 비상장 축(col=EUTransfer)에도 같은 수정이 파급된다", () => {
    const { Harness, patches } = useFormHarness();
    render(<Harness>{(form, onChange) => <NIYearColumn form={form} onChange={onChange} col="EUTransfer" />}</Harness>);

    const row1 = inputByLabel(/^1\. 각 사업연도 소득금액$/);
    fireEvent.focus(row1);
    fireEvent.change(row1, { target: { value: "-500000000" } });

    expect(patches.at(-1)).toEqual({ niAddRow1EUTransfer: "-500000000" });
  });

  it("DN-5: 위젯으로 결손을 입력하면 프리뷰 「17. 순손익액」이 음수로 표시된다", () => {
    // ⚠️ store를 직접 시드하면 위젯을 우회해 P-1(부호 제거 복원)이 이 anchor를 못 지킨다.
    //    반드시 «입력을 거쳐» 프리뷰까지 도달하는지를 본다.
    const { Harness } = useFormHarness({ niShareCountListing: "100000" });
    render(<Harness>{(form, onChange) => <NIYearColumn form={form} onChange={onChange} col="Listing" />}</Harness>);

    const row1 = inputByLabel(/^1\. 각 사업연도 소득금액$/);
    fireEvent.focus(row1);
    fireEvent.change(row1, { target: { value: "-500000000" } });

    // 17행 = A − B = -500,000,000 / 21행 = -5,000 / 24행 = -50,000
    expect(screen.getByText(/17\. 순손익액/).textContent).toContain("-500,000,000");
  });
});

// ============================================================
// Phase 2 — 1주당 순손익가치 직접입력 (W-4·W-7)
// ============================================================

describe("DN-7~9: 1주당 순손익가치 직접입력", () => {
  it("DN-7: 간이 direct 모드 — 상장연도 1주당 순손익가치 음수 보존 (W-4)", () => {
    const { Harness, patches } = useFormHarness({ acquiredBeforeListing: true, unlistedDetailMode: "simple" });
    render(<Harness>{(form, onChange) => <PostListingValuationCard form={form} onChange={onChange} />}</Harness>);

    const ni = inputByLabel(/^상장일 직전 사업연도 1주당 순손익가치/);
    fireEvent.focus(ni);
    fireEvent.change(ni, { target: { value: "-50000" } });

    expect(patches.at(-1)).toEqual({ listingYearNetIncomePerShare: "-50000" });
  });

  it("DN-8: §165④ 간이 — 양도연도 1주당 순손익가치 음수 보존 (W-7)", () => {
    const { Harness, patches } = useFormHarness();
    render(<Harness>{(form, onChange) => <EstimatedUnlistedBlock form={form} onChange={onChange} />}</Harness>);

    const ni = inputByLabel(/^1주당 순손익가치\s*\*?$/);
    fireEvent.focus(ni);
    fireEvent.change(ni, { target: { value: "-50000" } });

    expect(patches.at(-1)).toEqual({ transferYearNetIncomePerShare: "-50000" });
  });

  it("DN-9: [§2.4 회귀] amounts 모드가 저장한 음수를 direct 화면이 부호 그대로 표시한다", () => {
    // PR #1384 amounts 모드는 파생 1주당 가치를 direct와 «같은 store 키»에 쓴다.
    // direct 위젯에 allowNegative가 없으면 화면이 "50,000"으로 보이고,
    // 그 칸을 한 번 고치는 순간 부호가 영구 소실된다.
    const { Harness } = useFormHarness({
      acquiredBeforeListing: true,
      unlistedDetailMode: "simple",
      listingYearNetIncomePerShare: "-50000",
    });
    render(<Harness>{(form, onChange) => <PostListingValuationCard form={form} onChange={onChange} />}</Harness>);

    expect(inputByLabel(/^상장일 직전 사업연도 1주당 순손익가치/).value).toBe("-50,000");
  });
});

// ============================================================
// Phase 2′ — 1주당 순자산가치 직접입력 (W-9·W-12·W-13)
// ============================================================

describe("DN-10~12: 1주당 순자산가치 직접입력 (자본잠식 — 소령 §165④1 나목)", () => {
  it("DN-10: 간이 direct 모드 — 상장연도 1주당 순자산가치 음수 보존 (W-9)", () => {
    const { Harness, patches } = useFormHarness({ acquiredBeforeListing: true, unlistedDetailMode: "simple" });
    render(<Harness>{(form, onChange) => <PostListingValuationCard form={form} onChange={onChange} />}</Harness>);

    const na = inputByLabel(/^상장일 직전 사업연도 1주당 순자산가치/);
    fireEvent.focus(na);
    fireEvent.change(na, { target: { value: "-20000" } });

    expect(patches.at(-1)).toEqual({ listingYearNetAssetPerShare: "-20000" });
  });

  it("DN-11: 소칙 §81④ 월할 — 전전사업연도 1주당 순자산가치 음수 보존 (W-12)", () => {
    const calls: string[] = [];
    render(
      <MonthlyAccrual81Section
        visible
        checked
        onToggle={() => {}}
        prePriorNI=""
        prePriorNA=""
        priorBizYearMonths="12"
        onChangePrePriorNI={() => {}}
        onChangePrePriorNA={(v) => calls.push(v)}
        onChangePriorBizYearMonths={() => {}}
        title="t"
        description="d"
        monthsHint="h"
      />,
    );

    const na = inputByLabel(/^전전사업연도 1주당 순자산가치/);
    fireEvent.focus(na);
    fireEvent.change(na, { target: { value: "-20000" } });

    expect(calls.at(-1)).toBe("-20000");
  });

  it("DN-12: §165④ 간이 — 양도연도 1주당 순자산가치 음수 보존 (W-13)", () => {
    const { Harness, patches } = useFormHarness();
    render(<Harness>{(form, onChange) => <EstimatedUnlistedBlock form={form} onChange={onChange} />}</Harness>);

    const na = inputByLabel(/^1주당 순자산가치\s*\*?$/);
    fireEvent.focus(na);
    fireEvent.change(na, { target: { value: "-20000" } });

    expect(patches.at(-1)).toEqual({ transferYearNetAssetPerShare: "-20000" });
  });
});
