/**
 * @vitest-environment jsdom
 *
 * PR6b — 표시층 UI·결과 4뷰 (S16-8 · S16-2 ③ · S06-13 카드 · S06-8 카드·명세서·신고서·PDF)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
import type { ReactElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { runCalc } from "./_helpers";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

// ───────────────────────── S16-8 라목 배지 ─────────────────────────
const LA = { ...makeDefaultRentalUnit(), businessRegistrationDate: "2009-03-01", rentalRegistrationDate: "2009-03-01", rentalCategory: "unsold_08_09", rentalAcquisitionType: "purchase" } as Unit;
const MA = { ...makeDefaultRentalUnit(), businessRegistrationDate: "2021-03-01", rentalRegistrationDate: "2021-03-01", rentalCategory: "long_general", rentalAcquisitionType: "purchase" } as Unit;
const DA = { ...makeDefaultRentalUnit(), businessRegistrationDate: "2015-03-01", rentalRegistrationDate: "2015-03-01", rentalCategory: "long_general", rentalAcquisitionType: "construction" } as Unit;
const badge = (u: Unit) => {
  cleanup();
  render(<RentalUnitCard unit={u} index={0} onChange={() => {}} onRemove={() => {}} canRemove={false} transferDate="2026-03-01" />);
  return screen.getByTestId("rental-verdict-badge-0").textContent ?? "";
};

describe("S16-8 임대주택 카드 배지 — 규모요건은 입력칸이 열리는 목(건설·라목)과 같다", () => {
  it("라목: 규모(대지298㎡·연면적149㎡) 표시, 「규모요건 없음」 아님 — 같은 카드의 면적 입력칸과 정합", () => {
    const t = badge(LA);
    expect(t).not.toContain("규모요건 없음");
    expect(t).toMatch(/규모 대지298㎡·연면적149㎡/);
    expect(screen.getByText("대지면적")).toBeTruthy();
  });
  it("[짝] 다목(건설)은 규모 표시, 마목(매입 장기)은 「규모요건 없음」 + 면적 입력칸 없음", () => {
    expect(badge(DA)).toMatch(/규모 대지298㎡·연면적149㎡/);
    expect(badge(MA)).toContain("규모요건 없음");
    expect(screen.queryByText("대지면적")).toBeNull();
  });
});

// ───────────────────────── S16-2 ③ 실시간 보유기간 표시 ─────────────────────────
function holdRow(acq: string, td: string, mode: "full" | "facts") {
  cleanup();
  const a = makeDefaultAsset(1);
  const asset: AssetForm = {
    ...a, acquisitionDate: acq, residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "24",
    rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A" },
  };
  render(<RentalHousingExceptionSection rh={asset.rentalHousingException} asset={asset} acquisitionDate={acq} transferDate={td} onChangeResidence={vi.fn()} onChange={vi.fn()} mode={mode} />);
  return screen.getByText("거주주택 보유기간 (2년 이상 필요)").parentElement?.textContent ?? "";
}

describe("S16-2 ③ 거주주택 보유기간 표시 — ⑧·엔진과 같은 함수(초일 산입)", () => {
  it.each(["full", "facts"] as const)("%s: 응당일 전날(2021-05-10→2023-05-09)은 ✓ 충족 · 2년 0개월", (mode) => {
    const t = holdRow("2021-05-10", "2023-05-09", mode);
    expect(t).toContain("✓ 충족");
    expect(t).toContain("현재 2년 0개월");
  });
  it("[짝] 이틀 전(2023-05-08)은 ✗ 미충족 · 1년 11개월", () => {
    const t = holdRow("2021-05-10", "2023-05-08", "full");
    expect(t).toContain("✗ 미충족");
    expect(t).toContain("현재 1년 11개월");
  });
});

// ───────────────────────── S06-13 / S06-8 결과 표시 ─────────────────────────
const T = "2023-03-03";
const UNIT = { ...makeDefaultRentalUnit(), businessRegistrationDate: "2014-01-01", rentalRegistrationDate: "2014-01-01", standardPriceAtRentalStart: "200,000,000", rentalInputMode: "direct" as const, rentalMonths: "100", requirementsConfirmed: true };
function bForm(units: 0 | 1) {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: T, householdHousingCount: "1", isOneHousehold: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, contractTotalPrice: "800,000,000" });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-08-12", actualSalePrice: "800,000,000", fixedAcquisitionPrice: "489,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: "24" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException, applyException: true, scenario: "B", rentalUnits: units ? [UNIT] : [],
    priorResidenceTransferDate: "2016-08-25", standardPriceAtAcquisitionForPhrp: "300,000,000", standardPriceAtPriorTransfer: "450,000,000",
    standardPriceAtTransferForPhrp: "500,000,000", postRegistrationResidenceMonths: "24", wasRegisteredRentalOrChildcare: units === 0,
  };
  return f;
}
const GANGNAM = "1168010100";
function a2Form() {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2016-01-01", fixedAcquisitionPrice: "500,000,000", regionCode: GANGNAM, addressJibun: "서울 강남구 역삼동 1", residenceInputMode: "direct", residencePeriodMonthsAsset: "40" };
  Object.assign(f, {
    householdNoPresaleRightsConfirmed: true, transferDate: "2026-03-01", contractTotalPrice: "1,500,000,000", residencePeriodMonths: "40", householdHousingCount: "2", isRegulatedArea: true, wasRegulatedAtAcquisition: false,
    houses: [{ id: "h4", region: "capital", regionCode: GANGNAM, acquisitionDate: "2013-06-01", officialPrice: "300000000", isInherited: false, isLongTermRental: true, isApartment: false, isOfficetel: false, isUnsoldHousing: false }],
  });
  const a = f.assets[0];
  a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "80", requirementsConfirmed: true }] };
  return f;
}

/** react-pdf 트리를 순회해 텍스트를 모은다. */
function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") {
    try { collect((el.type as (p: unknown) => unknown)(el.props), out); } catch { /* 렌더 불가 노드 */ }
    return out;
  }
  collect((el.props ?? {}).children, out);
  return out;
}
const after = (t: string[], label: string) => { const i = t.indexOf(label); return i >= 0 ? t[i + 1] : undefined; };

describe("S06-13 상세 카드 — 머리 근거는 판정이 정한 laws(§154⑩ 표준 경로 = §154⑩)", () => {
  it("B·0호: 머리·하단 모두 §154⑩, [짝] B·1호: §155⑳", async () => {
    for (const [n, basis] of [[0, "소득세법 시행령 §154⑩"], [1, "소득세법 시행령 §155⑳"]] as const) {
      const r = await runCalc(bForm(n));
      cleanup();
      const { container } = render(<RentalHousingExceptionDetailCard detail={r.result.rentalHousingExceptionDetail} />);
      expect(container.querySelector(".text-micro")?.textContent, `units=${n}`).toBe(basis);
      expect(container.textContent).toContain(`적용 법령: ${basis}`);
    }
  });
});

describe("S06-8 RH-A2 4뷰 — 「(소령 §161①)」은 B에만, 장특·양도소득금액이 표2 기준으로 맞물린다", () => {
  it("카드·명세서·신고서·PDF", async () => {
    const f = a2Form();
    const a = await runCalc(f);
    const b = await runCalc(bForm(0));
    const ra = a.result as TransferTaxResult;
    const rb = b.result as TransferTaxResult;
    expect(ra.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A2");

    // ① 상세 카드
    cleanup();
    render(<RentalHousingExceptionDetailCard detail={ra.rentalHousingExceptionDetail!} />);
    expect(screen.getByText("비과세 양도소득금액")).toBeTruthy();
    expect(screen.queryByText(/비과세 양도소득금액 \(시행령 §161①\)/)).toBeNull();
    cleanup();
    render(<RentalHousingExceptionDetailCard detail={rb.rentalHousingExceptionDetail!} />);
    expect(screen.getByText("비과세 양도소득금액 (시행령 §161①)")).toBeTruthy();

    // ② 상세명세서 — A2: 라벨에 §161① 없음, 양도소득금액 480,000,000, 비과세 384,000,000
    const itemsA = buildStatementItems(ra, f, undefined, undefined, 1_500_000_000);
    expect(itemsA.get("nontaxableIncome")?.label).toBe("비과세 양도소득금액");
    expect(itemsA.get("nontaxableIncome")?.value).toBe(384_000_000);
    expect(itemsA.get("incomeAmount")?.value).toBe(480_000_000);
    expect(buildStatementItems(rb, bForm(0), undefined, undefined, 800_000_000).get("nontaxableIncome")?.label).toBe("비과세 양도소득금액 (소령 §161①)");

    // ③ 신고서 표 — 행 라벨·장특·양도소득금액
    const rows = buildRows(ra, deriveColumns(ra).mode, f, undefined, 1_500_000_000);
    const nt = rows.find((r) => r.label.startsWith("비과세 양도소득금액"))!;
    expect(nt.label).toBe("비과세 양도소득금액");
    expect(nt.values.total).toBe(384_000_000);
    expect(rows.find((r) => r.label === "장기보유특별공제")?.values.total).toBe(520_000_000);
    expect(rows.find((r) => r.label === "양도소득금액")?.values.total).toBe(480_000_000);
    const rowsB = buildRows(rb, deriveColumns(rb).mode, bForm(0), undefined, 800_000_000);
    expect(rowsB.some((r) => r.label === "비과세 양도소득금액 (소령 §161①)")).toBe(true);

    // ④ PDF — 양도소득금액 = 양도차익 − 장특(0으로 찍히지 않는다) · 감면후 소득금액 = 과세대상 양도소득금액
    const texts = collect(TransferSection({ r: ra as unknown as Record<string, unknown> }));
    expect(after(texts, "양도소득금액")).toBe("480,000,000");
    expect(texts).toContain("비과세 양도소득금액");
    expect(texts[texts.indexOf("비과세 양도소득금액") + 2]).toBe("384,000,000");
    expect(texts).not.toContain("비과세 양도소득금액 (소령 §161①)");
    expect(after(texts, "감면후 소득금액")).toBe("96,000,000");
    expect(after(texts, "과세표준")).toBe("93,500,000");
  });
});
