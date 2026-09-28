/**
 * §41의2 1인 단위 — ⑤ 입력(영리법인 행 토글·계산 대상 선택기) · ⑦ 결과(수증자별 표) · 이관.
 *
 * 선택기가 없으면 둘째 수증자를 계산할 경로가 없다. 결과에 수증자별 표가 없으면 「누구의 값인지」가
 * 보이지 않는다 — 종전 화면은 특수관계인 전원을 한 사람처럼 보여 줬다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { ExcessDividendFields } from "@/components/calc/deemed-gift/other-forms";
import { ExcessDividendDetailSection } from "@/components/calc/results/ExcessDividendDetailSection";
import { calcExcessDividendGift } from "@/lib/tax-engine/gift-deemed/excess-dividend";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-prefill";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { EdShareholderRow } from "@/components/calc/deemed-gift/deemed-form-rows";
import type { ExcessDividendInput } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

const row = (id: string, role: EdShareholderRow["role"], name = id): EdShareholderRow => ({
  id, name, role, ownershipRatioPctStr: "25", actualDividendStr: "1",
});
const form = (rows: EdShareholderRow[], f: Partial<DeemedFormState> = {}) =>
  ({ ...INITIAL_DEEMED, type: "excess_dividend", edShareholders: rows, ...f }) as DeemedFormState;
const toggle = (id: string) => screen.getByTestId(id).querySelector("[role=switch]") ?? screen.getByTestId(id);

const ENGINE: ExcessDividendInput = {
  shareholders: [
    { id: "A", name: "갑", role: "major_shareholder", ownershipRatio: { numer: 50, denom: 100 }, actualDividend: 0 },
    { id: "B", name: "을", role: "related_party", ownershipRatio: { numer: 25, denom: 100 }, actualDividend: 700_000_000 },
    { id: "C", name: "병", role: "related_party", ownershipRatio: { numer: 25, denom: 100 }, actualDividend: 300_000_000 },
  ],
  dividendDate: new Date("2025-06-30"),
  incomeTaxMode: "undetermined",
};

describe("⑤ 입력 — 영리법인 토글은 특수관계인 행에만", () => {
  it("[EDU-1] 특수관계인 행에 토글이 있고 켜면 그 행에 표지가 선다 · 최대주주·기타 행에는 없다", () => {
    const set = vi.fn();
    const rows = [row("A", "major_shareholder"), row("B", "related_party"), row("D", "other")];
    render(<ExcessDividendFields form={form(rows)} set={set} />);
    expect(screen.queryByTestId("ed-sh-corp-0")).toBeNull();
    expect(screen.queryByTestId("ed-sh-corp-2")).toBeNull();
    fireEvent.click(toggle("ed-sh-corp-1"));
    expect(set).toHaveBeenCalledWith({ edShareholders: [rows[0], { ...rows[1], isForProfitCorp: true }, rows[2]] });
  });
});

describe("⑤ 입력 — 계산 대상 수증자 선택기", () => {
  it("[EDU-2] 특수관계인 2명 이상이면 선택기 — 특수관계인만 나열하고 고르면 id가 선다", () => {
    const set = vi.fn();
    render(<ExcessDividendFields form={form([row("A", "major_shareholder"), row("B", "related_party", "을"), row("C", "related_party", "병")])} set={set} />);
    const sel = screen.getByTestId("ed-target-donee") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual([expect.stringContaining("자동"), "을", "병"]);
    fireEvent.change(sel, { target: { value: "C" } });
    expect(set).toHaveBeenCalledWith({ edTargetDoneeId: "C" });
  });

  it("[EDU-3] 긍정 짝: 특수관계인 1명이면 선택기가 없다", () => {
    render(<ExcessDividendFields form={form([row("A", "major_shareholder"), row("B", "related_party")])} set={vi.fn()} />);
    expect(screen.queryByTestId("ed-target-donee")).toBeNull();
  });
});

describe("⑦ 결과 — 수증자별 초과배당금액 표", () => {
  it("[EDU-4] 수증자 2명 — 표에 둘 다, 계산 대상에 표시", () => {
    const r = calcExcessDividendGift({ ...ENGINE, targetDoneeId: "C" });
    render(<ExcessDividendDetailSection detail={r.excessDividendDetail!} />);
    const table = screen.getByTestId("ed-donee-table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("을");
    expect(rows[0].textContent).toContain("450,000,000");
    expect(rows[1].textContent).toContain("병");
    expect(rows[1].textContent).toContain("계산 대상");
    expect(rows[0].textContent).not.toContain("계산 대상");
  });

  it("[EDU-5] 영리법인 수증자 행은 사유를 적는다", () => {
    const r = calcExcessDividendGift({
      ...ENGINE,
      shareholders: ENGINE.shareholders.map((s) => (s.id === "B" ? { ...s, isForProfitCorp: true } : s)),
    });
    render(<ExcessDividendDetailSection detail={r.excessDividendDetail!} />);
    const rows = within(screen.getByTestId("ed-donee-table")).getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("영리법인");
  });

  it("[EDU-6] 긍정 짝: 수증자 1명이면 표가 없다(위 산정 내역이 곧 그 사람)", () => {
    const r = calcExcessDividendGift({ ...ENGINE, shareholders: ENGINE.shareholders.slice(0, 2) });
    render(<ExcessDividendDetailSection detail={r.excessDividendDetail!} />);
    expect(screen.queryByTestId("ed-donee-table")).toBeNull();
  });
});

describe("이관 — 누구의 증여이익인지 항목명에 싣는다", () => {
  it("[EDU-7] 계산 대상 병 1인분 43,000,000 · 항목명에 병", () => {
    const r = calcExcessDividendGift({ ...ENGINE, targetDoneeId: "C" });
    const p = buildGiftWizardPrefill(form([]), { ...r, type: "excess_dividend" });
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems![0].marketValue).toBe(43_000_000);
    expect(p.giftItems![0].name).toContain("병");
  });
});
