/**
 * @vitest-environment jsdom
 *
 * §165④ 미리보기 단일 정본 위임 + O-4·O-5·O-7 anchor
 *
 * 계획서: docs/00-pm/unlisted-valuation-preview-single-source.plan.md §8
 *
 * 🔑 **이 파일이 지키는 것은 「미리보기가 엔진과 같은 값을 말하는가」다.**
 *    `valuation-165-4-basis.ts`는 스스로를 「제4항에 따른 평가액의 **단일 정본**」이라 선언하고
 *    「인자는 **사실**만 받는다(transferDate)」고 못박아 두었다. 미리보기가 그 함수를 부르지 않고
 *    산식을 재구현하면 연혁 게이팅·하한 규칙이 조용히 갈린다.
 *    실측 divergence: 1997 양도 38,000 vs 20,000 · 결손 −22,000 vs 16,000 ·
 *    순손익 미입력 20,000 vs 16,000.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { FaceValueBlock } from "@/components/calc/stock-transfer/FaceValueBlock";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { YearColumn as NAYearColumn } from "@/components/calc/stock-transfer/PostListingNetAssetStatement";
import { calcSection165_4Value } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import {
  createInitialStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

function Stateful({
  initial,
  render: renderFn,
  onPatch,
}: {
  initial: Partial<StockTransferFormData>;
  render: (f: StockTransferFormData, onChange: (p: Partial<StockTransferFormData>) => void) => React.ReactNode;
  onPatch?: (p: Partial<StockTransferFormData>) => void;
}) {
  const [form, setForm] = React.useState<StockTransferFormData>({
    ...createInitialStockFormData(),
    ...initial,
  } as StockTransferFormData);
  return <>{renderFn(form, (p) => { onPatch?.(p); setForm((prev) => ({ ...prev, ...p })); })}</>;
}

/** 「양도기준시가 (1주당): 20,000원」 등에서 숫자만 뽑는다 */
function shownStdPrice(re: RegExp): number {
  const el = screen.getByText(re);
  const m = (el.textContent ?? "").match(/-?[\d,]+/g);
  expect(m, `표시 텍스트에서 숫자를 못 찾았다: ${el.textContent}`).not.toBeNull();
  return Number((m as string[])[m!.length - 1].replace(/,/g, ""));
}

function inputByLabel(re: RegExp): HTMLInputElement {
  const hits = Array.from(document.querySelectorAll("label")).filter((l) =>
    re.test((l.textContent ?? "").trim()),
  );
  expect(hits, `라벨 ${re} 매칭 1건이어야 한다`).toHaveLength(1);
  const scope = hits[0].closest('[data-slot="field-card"]') ?? hits[0].parentElement!;
  return scope.querySelector("input") as HTMLInputElement;
}

const EUB_STD = /양도기준시가 \(1주당\)/;
const FVB_STD = /^양도기준시가 = /;

// ============================================================
// O-6 — 미리보기 위임
// ============================================================

describe("PV-1~6: §165④ 미리보기가 엔진 정본과 같은 값을 낸다", () => {
  it("PV-1: 1997 양도 → 순자산 단독 연혁(ni 가중치 0) — 20,000 (재구현은 38,000)", () => {
    render(
      <Stateful
        initial={{
          transferDate: "1997-06-01",
          transferYearNetIncomePerShare: "50000",
          transferYearNetAssetPerShare: "20000",
        }}
        render={(f, o) => <EstimatedUnlistedBlock form={f} onChange={o} />}
      />,
    );
    expect(shownStdPrice(EUB_STD)).toBe(20_000);
  });

  it("PV-2: 2026 양도 · 결손 → 80% 하한 16,000 (재구현은 -22,000 — weighted>0 가드)", () => {
    render(
      <Stateful
        initial={{
          transferDate: "2026-01-01",
          transferYearNetIncomePerShare: "-50000",
          transferYearNetAssetPerShare: "20000",
        }}
        render={(f, o) => <EstimatedUnlistedBlock form={f} onChange={o} />}
      />,
    );
    expect(shownStdPrice(EUB_STD)).toBe(16_000);
  });

  it("PV-3: FaceValueBlock 순손익 미입력 → 16,000 (재구현은 20,000 — `ni>0 ? … : na`)", () => {
    render(
      <Stateful
        initial={{
          transferDate: "2026-01-01",
          transferYearNetIncomePerShare: "",
          transferYearNetAssetPerShare: "20000",
        }}
        render={(f, o) => <FaceValueBlock form={f} onChange={o} />}
      />,
    );
    expect(shownStdPrice(FVB_STD)).toBe(16_000);
  });

  it("PV-4: 양도일 미입력 → 미리보기 미표시 (임의 기준일 fallback 금지)", () => {
    render(
      <Stateful
        initial={{
          transferDate: "",
          transferYearNetIncomePerShare: "50000",
          transferYearNetAssetPerShare: "20000",
        }}
        render={(f, o) => <EstimatedUnlistedBlock form={f} onChange={o} />}
      />,
    );
    expect(screen.queryByText(EUB_STD)).toBeNull();
  });

  it("PV-5: §165④3 순자산 단독 → 하한 미적용, 순자산가치 그대로", () => {
    render(
      <Stateful
        initial={{
          transferDate: "2026-01-01",
          netAssetOnlyReason: "stock_holding_company",
          transferYearNetAssetPerShare: "20000",
        }}
        render={(f, o) => <EstimatedUnlistedBlock form={f} onChange={o} />}
      />,
    );
    expect(shownStdPrice(EUB_STD)).toBe(20_000);
  });

  it("PV-6: 엔진 정본과 수치가 일치한다 (dual-truth 0)", () => {
    const cases: [string, number, number][] = [
      ["2026-01-01", 50_000, 20_000],
      ["2005-06-01", 50_000, 20_000],
      ["1997-06-01", 50_000, 20_000],
      ["2026-01-01", -50_000, 20_000],
      ["2026-01-01", 50_000, -20_000],
    ];
    for (const [d, ni, na] of cases) {
      cleanup();
      render(
        <Stateful
          initial={{
            transferDate: d,
            transferYearNetIncomePerShare: String(ni),
            transferYearNetAssetPerShare: String(na),
          }}
          render={(f, o) => <EstimatedUnlistedBlock form={f} onChange={o} />}
        />,
      );
      const expected = calcSection165_4Value(ni, na, false, new Date(d)).value;
      expect(shownStdPrice(EUB_STD), `${d} ni=${ni} na=${na}`).toBe(expected);
    }
  });
});

// ============================================================
// O-5 — §81④ 월할 토글 게이트
// ============================================================

// ToggleCard는 OFF일 때 children(전전사업연도 입력칸)을 렌더하지 않는다
// ⇒ 노출 판정은 «토글 제목»으로 본다.
const ACCRUAL_TITLE = /같은 사업연도에 취득·상장 \(소칙 §81④ 1호\)/;

describe("AT-1~2: 소칙 §81④ 월할 토글 노출 조건 (소령 §165⑤ 후단 「같은 경우」)", () => {
  it("AT-1: 평가액이 «음수로 동일»해도 토글이 노출된다 — 법문에 양수 요건 없음", () => {
    render(
      <Stateful
        initial={{
          acquiredBeforeListing: true,
          unlistedDetailMode: "simple",
          transferDate: "2026-01-01",
          listingYearNetIncomePerShare: "-50000",
          listingYearNetAssetPerShare: "-20000",
          acquisitionYearNetIncomePerShare: "-50000",
          acquisitionYearNetAssetPerShare: "-20000",
        }}
        render={(f, o) => <PostListingValuationCard form={f} onChange={o} />}
      />,
    );
    expect(screen.getByText(ACCRUAL_TITLE)).toBeInTheDocument();
  });

  it("AT-2: 4필드 «미입력»이면 토글 미노출 — 0 == 0을 「동일」로 보지 않는다", () => {
    render(
      <Stateful
        initial={{
          acquiredBeforeListing: true,
          unlistedDetailMode: "simple",
          transferDate: "2026-01-01",
        }}
        render={(f, o) => <PostListingValuationCard form={f} onChange={o} />}
      />,
    );
    expect(screen.queryByText(ACCRUAL_TITLE)).toBeNull();
  });
});

// ============================================================
// O-4 — 순자산가액 계산서 △ 조정행
// ============================================================

describe("NA-1~3: 순자산가액 계산서 △ 조정행 (상증령 §55① · 상증칙 §17의2)", () => {
  function renderNA(onPatch: (p: Partial<StockTransferFormData>) => void) {
    render(
      <Stateful
        initial={{}}
        onPatch={onPatch}
        render={(f, o) => <NAYearColumn form={f} onChange={o} col="Listing" />}
      />,
    );
  }

  it("NA-1: 행 2 평가차액 — 평가차손(음수) 입력 보존", () => {
    const patches: Partial<StockTransferFormData>[] = [];
    renderNA((p) => patches.push(p));
    const el = inputByLabel(/^2\. 평가차액$/);
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: "-3000000" } });
    expect(patches.at(-1)).toEqual({ naAssetAddRow2Listing: "-3000000" });
  });

  it("NA-2: 행 3 법인세법상 유보금액 — △유보(음수) 입력 보존", () => {
    const patches: Partial<StockTransferFormData>[] = [];
    renderNA((p) => patches.push(p));
    const el = inputByLabel(/^3\. 법인세법상 유보금액$/);
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: "-1000000" } });
    expect(patches.at(-1)).toEqual({ naAssetAddRow3Listing: "-1000000" });
  });

  it("NA-3: 행 4 유상증자는 종전대로 부호 제거 — 성질상 비음수", () => {
    const patches: Partial<StockTransferFormData>[] = [];
    renderNA((p) => patches.push(p));
    const el = inputByLabel(/^4\. 유상증자 등$/);
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: "-1000000" } });
    expect(patches.at(-1)).toEqual({ naAssetAddRow4Listing: "1000000" });
  });
});

// ============================================================
// O-7 — 라벨 오타
// ============================================================

describe("LB-1: 순손익 계산서 행 3 라벨 (상증령 §56④1 나목)", () => {
  it("「수입배당금 중 익금불산입한 금액」 — 「수익」·「입금」 오타 아님", async () => {
    const { YearColumn } = await import(
      "@/components/calc/stock-transfer/PostListingNetIncomeStatement"
    );
    render(
      <Stateful
        initial={{}}
        render={(f, o) => <YearColumn form={f} onChange={o} col="Listing" />}
      />,
    );
    expect(screen.getByText("3. 수입배당금 중 익금불산입한 금액")).toBeInTheDocument();
    expect(screen.queryByText(/수익배당금|입금불산입/)).toBeNull();
  });
});
