/**
 * 4289 ⑦ 결과 표시 — 토지 파트 「거주 11년」· 건물 파트 「거주 0년」(파트별 거주 연수 echo `splitDetail.*.residenceYears`)
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §6 echo · §7 결과 문구
 * 읽는 곳: 엔진 산식 step(`transfer-tax-split-display.ts` — 상세명세서는 그 step을 그대로 쓴다) · 신고서 split-2col 거주기간 파트 열.
 * (상세명세서 `residencePeriod` 항목은 STATEMENT_GROUPS에 없어 화면에 나오지 않는다 — 거기에는 쓰지 않았다.)
 * 옛 이력(echo 없음)은 종전 표시 그대로여야 한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

const s1 = (o: Partial<TransferTaxInput> = {}) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing", transferPrice: 2_000_000_000, transferDate: new Date("2025-01-15"), acquisitionDate: new Date("2012-10-01"),
      acquisitionCause: "gift", landAcquisitionCause: "purchase", landAcquisitionDate: new Date("2000-06-01"),
      isOneHousehold: true, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
      landTransferPrice: 1_400_000_000, buildingTransferPrice: 600_000_000, landStandardPriceAtTransfer: 1_400_000_000,
      buildingStandardPriceAtTransfer: 600_000_000, landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 50_000_000,
      residencePeriodMonths: 0, acquisitionPrice: 0, expenses: 0, ...o,
    }),
    makeMockRates(),
  );
const ON = { landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: 132 };

const asset = { ...makeDefaultAsset(1), acquisitionDate: "2012-10-01", acquisitionCause: "gift", assetKind: "housing", residencePeriodMonthsAsset: "0" } as never;
const form = { transferDate: "2025-01-15", filingDate: "2025-03-31", assets: [asset], contractTotalPrice: "2000000000", residencePeriodMonths: "0" } as never;

const items = (r: TransferTaxResult) => buildStatementItems(r, form, asset, undefined, undefined);
const rowsOf = (r: TransferTaxResult) => buildRows(r, deriveColumns(r).mode);
const cell = (rows: ReturnType<typeof rowsOf>, label: string, col: string) => rows.find((x) => x.label === label)?.values[col as never];

/** 옛 이력 — 파트 거주 연수 echo가 없는 결과(구 resultData). */
const legacy = (r: TransferTaxResult): TransferTaxResult => {
  const c = structuredClone(r);
  delete c.splitDetail!.land.residenceYears;
  delete c.splitDetail!.building.residenceYears;
  return c;
};

describe("④ ON — 결과 표시가 파트별 거주 연수를 읽는다", () => {
  const r = s1(ON);

  it("엔진 산식 step(명세서 보유·거주분 항목 포함): 토지 「거주 11년×4% = 40%」 · 건물 「거주 0년(2년 미만 …)」 — 자기모순 문장 없음", () => {
    const it = items(r);
    const res = it.get("ltResidencePart")!.formula;
    expect(res).toContain("토지분 208,000,000 (거주 11년×4% = 40%)");
    expect(res).toContain("건물분 0 (거주 0년(2년 미만 — 거주기간 공제 없음) = 0%)");
    expect(it.get("ltDeduction")!.formula).toContain("거주 0년(2년 미만 — 거주기간 공제 없음)=0%");
    expect(res).not.toMatch(/거주 11년\(2년 미만/);
  });

  it("신고서 split-2col 거주기간: 토지 열 「11년 0월」 + 각주 · 건물 열 본인 거주 「-」 · 합계 열 「-」", () => {
    const rows = rowsOf(r);
    expect(cell(rows, "거주기간", "land")).toBe("11년 0월");
    expect(cell(rows, "거주기간", "building")).toBe("-");
    expect(cell(rows, "거주기간", "total")).toBe("-");
    const row = rows.find((x) => x.label === "거주기간")!;
    expect(JSON.stringify(row.roseNotes)).toContain("서면-2025-법규재산-4289");
    // 금액 열은 echo 그대로 — 토지 거주분 208,000,000 · 건물 0
    expect(cell(rows, " 거주 기간분 장특", "land")).toBe(208_000_000);
    expect(cell(rows, " 거주 기간분 장특", "building")).toBe(0);
  });
});

describe("짝 — OFF·옛 이력은 종전 표시", () => {
  it("OFF: 두 파트 연수 같음(0/0) → 거주기간 파트 열 비움", () => {
    const r = s1();
    const rows = rowsOf(r);
    expect(cell(rows, "거주기간", "land")).toBeUndefined();
    expect(cell(rows, "거주기간", "building")).toBeUndefined();
  });

  it("옛 이력(echo 없음): 파트 열 비움 · 금액 echo는 그대로", () => {
    const r = legacy(s1(ON));
    const rows = rowsOf(r);
    expect(cell(rows, "거주기간", "land")).toBeUndefined();
    // 금액 echo(파트 공제액)는 옛 이력에도 그대로
    expect(cell(rows, "장기보유특별공제", "land")).toBe(416_000_000);
  });
});

describe("짝 — 4289 개월이 토지 공제율을 바꾸지 않으면 거주기간 파트 열 비움 (14지점 점검 FAIL-1)", () => {
  it("통칙으로 표1이 이김(건물 증여 2023-10-01): 토지 열 비움", () => {
    const r = s1({ ...ON, acquisitionDate: new Date("2023-10-01") });
    expect(r.splitDetail!.land.appurtenantLthd?.table1Applied).toBe(true);
    const rows = rowsOf(r);
    expect(cell(rows, "거주기간", "land")).toBeUndefined();
  });

  it("표2 대상 아님(2주택 세대): 토지 열 비움", () => {
    const rows = rowsOf(s1({ ...ON, householdHousingCount: 2 }));
    expect(cell(rows, "거주기간", "land")).toBeUndefined();
  });
});

