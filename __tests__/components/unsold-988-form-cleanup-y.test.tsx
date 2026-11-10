/**
 * @vitest-environment jsdom
 *
 * 그룹 Y — §98의8 입력 폼 정비(#3114 J가 §98의3·5·6·7만 하고 남긴 것) + 임대기간 입력·결과 카드 echo
 *
 *  - 로컬 SectionShell 톤맵 → <ToneCard sectionNum title> (다크 짝·정본 배지)
 *  - emerald 안내 박스 → ToneCard emerald
 *  - 직접 작성 라벨 text-sm · 법조문 hint text-micro 부재
 *  - 임대 섹션: 사업자등록일·임대사업자등록일·실제 임대개시일·공실 구간·정수 상속 개월
 *  - 결과 카드: 「임대기간 N개월(기산일, 공실 M개월 제외)」
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { Unsold988InputForm } from "@/components/calc/transfer/Unsold988InputForm";
import { IncomeDeductionDetailCard } from "@/components/calc/results/transfer/IncomeDeductionDetailCard";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { evaluateUnsold988 } from "@/lib/tax-engine/transfer-reductions/unsold-98-8";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

type F988 = Extract<AssetReductionForm, { type: "unsold_98_8" }>;
const f988 = getReductionDefault("unsold_98_8") as F988;

describe("Y-F1 §98의8 폼 — ToneCard 정본", () => {
  it("섹션 번호 배지가 TONE 정본(다크 짝 포함)이고 구 SectionShell 톤이 없다", () => {
    const r = render(<Unsold988InputForm value={f988} onChange={() => {}} />);
    for (const n of ["①", "②", "③", "④", "⑤"]) {
      const badge = r.getAllByText(n)[0];
      expect(badge.className).toContain("dark:bg-");
      expect(badge.className).toContain("dark:text-");
      const card = badge.closest("div.rounded-lg") as HTMLElement;
      expect(card.className).toContain("dark:border-");
      expect(card.className).not.toContain("950/40 p-3");
    }
  });

  it("emerald 안내 박스가 정본 emerald 카드다", () => {
    const r = render(<Unsold988InputForm value={f988} onChange={() => {}} />);
    const box = r.container.querySelector("div.border-emerald-200") as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.className).toContain("bg-emerald-50/40");
    expect(box.className).toContain("dark:border-emerald-800");
  });

  it("직접 작성한 label은 text-sm이고 text-micro 문단은 없다", () => {
    const r = render(<Unsold988InputForm value={f988} onChange={() => {}} />);
    const labels = Array.from(r.container.querySelectorAll("label.block"));
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(l.className).toContain("text-sm");
      expect(l.className).not.toContain("text-xs");
    }
    expect(r.container.innerHTML).not.toMatch(/<p[^>]*text-micro/);
  });
});

describe("Y-F2 §98의8 폼 — 임대 입력 필드", () => {
  it("사업자등록일·임대사업자등록일·실제 임대개시일·공실 구간 칸이 data-field로 존재한다", () => {
    const r = render(<Unsold988InputForm value={f988} onChange={() => {}} />);
    for (const k of ["businessRegistrationDate988", "rentalRegistrationDate988", "rentalStartDate988", "rentalVacancyPeriods988", "inheritedRentalMonths988"]) {
      expect(r.container.querySelector(`[data-field="reduction.unsold_98_8.${k}"]`), k).not.toBeNull();
    }
    expect(r.container.textContent).toContain("개시하는 날 당일 포함");
  });

  it("「+ 공실 구간 추가」가 빈 행을 onChange로 보낸다", () => {
    const onChange = vi.fn();
    const r = render(<Unsold988InputForm value={f988} onChange={onChange} />);
    fireEvent.click(r.getByText("+ 공실 구간 추가"));
    expect(onChange).toHaveBeenCalledWith({ rentalVacancyPeriods988: [{ startDate: "", endDate: "" }] });
  });
});

describe("Y-F3 §98의8 결과 카드 — 인정 임대기간 echo (⑦)", () => {
  const D = (s: string) => new Date(s);
  const base = {
    transferDate: D("2020-11-30"),
    acquisitionDate: D("2015-07-01"),
    contractDate: D("2015-06-01"),
    acquisitionPrice: 550_000_000,
    exclusiveAreaSqm: 84.5,
    rentalContractDate: D("2015-11-20"),
    rentalStartDate: D("2015-12-01"),
    businessRegistrationDate: D("2015-12-01"),
    rentalRegistrationDate: D("2015-12-01"),
    isUnsoldAfterCompletion: true,
    isFirstContract: true,
    isNotRecontract: true,
    transferIncome: 200_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAt5Years: 300_000_000,
    standardPriceAtTransfer: 400_000_000,
  };

  it("적격: 「임대기간 60개월(기산일 2015-12-01)」", () => {
    const result = evaluateUnsold988(base);
    const r = render(<IncomeDeductionDetailCard kind="unsold_98_8" result={result} calculatedTax={0} />);
    expect(r.getByTestId("unsold988-rental-period").textContent).toBe("임대기간 60개월(기산일 2015-12-01)");
  });

  it("부적격(공실 6일): 「임대기간 59개월(기산일, 공실 1개월 제외)」 + 5년 미만 사유", () => {
    const result = evaluateUnsold988({ ...base, rentalVacancies: [{ startDate: D("2018-03-15"), endDate: D("2018-03-20") }] });
    const r = render(<IncomeDeductionDetailCard kind="unsold_98_8" result={result} calculatedTax={0} />);
    expect(r.getByTestId("unsold988-rental-period").textContent).toBe("임대기간 59개월(기산일 2015-12-01, 공실 1개월 제외)");
    expect(r.getByText(/임대기간이 5년\(60개월\) 미만입니다/)).toBeTruthy();
  });

  it("부적격: 2016.1.1. 이후 등록 사유가 카드에 보인다", () => {
    const result = evaluateUnsold988({ ...base, rentalRegistrationDate: D("2016-01-01"), transferDate: D("2021-02-28") });
    const r = render(<IncomeDeductionDetailCard kind="unsold_98_8" result={result} calculatedTax={0} />);
    expect(r.getByText(/임대사업자등록이 2016\.1\.1\. 이후에 이뤄졌습니다/)).toBeTruthy();
  });
});
