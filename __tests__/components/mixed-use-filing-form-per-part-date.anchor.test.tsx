/**
 * 겸용주택 신고서 양식 — 토지/건물 열별 취득일자·보유기간 표시 앵커.
 *
 * 계획서: docs/02-design/features/mixed-use-filing-form-per-part-acquisition-date.plan.md
 * 변경: fourpart/mixed-4col 신고서에서 취득일자·보유기간을 토지 열=토지 취득일 / 건물 열=건물 취득일로 분리.
 * 엔진 무변경 — 토지/건물 취득일은 form asset(landAcquisitionDate / acquisitionDate)에서 읽음.
 *
 * A1: 토지 취득일 ≠ 건물 취득일 → 토지 열·건물 열 취득일자·보유기간 상이
 * A2: hasSeperateLandAcquisitionDate 미입력(landAcquisitionDate="") → 4열 동일(fallback 무회귀)
 * A3: 합계 열 = 건물 취득일 기준 (변경 없음)
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import {
  mixedUseCase14,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../tax-engine/_helpers/mixed-use-fixture";

const rates = makeMockRates();
const result = mixedUseToFilingResult(
  calcMixedUseTransferTax(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, mixedUseCase14(), rates),
);

function formDataWith(landAcqDate: string, buildingAcqDate: string): TransferFormData {
  return {
    transferDate: "2022-02-16",
    filingDate: "2022-04-30",
    contractTotalPrice: String(CASE14_TRANSFER_PRICE),
    assets: [
      {
        ...makeDefaultAsset(1),
        acquisitionDate: buildingAcqDate,
        landAcquisitionDate: landAcqDate,
        hasSeperateLandAcquisitionDate: landAcqDate !== "",
      },
    ],
  } as unknown as TransferFormData;
}

function rowStr(rows: ReturnType<typeof buildRows>, label: string, col: string): string {
  const r = rows.find((x) => x.label === label);
  const v = r?.values[col as keyof typeof r.values];
  return typeof v === "string" ? v : String(v ?? "");
}

describe("겸용주택 신고서 — 토지/건물 열별 취득일자·보유기간 (Pre-Do anchor)", () => {
  it("A1 토지 취득일 ≠ 건물 취득일 → 열별 상이 (토지 1992 / 건물 1997)", () => {
    const fd = formDataWith("1992-01-01", "1997-09-12");
    const { mode } = deriveColumns(result);
    const rows = buildRows(result, mode, fd, undefined, CASE14_TRANSFER_PRICE);

    // 취득일자: 토지 열=1992, 건물 열=1997
    expect(rowStr(rows, "취득일자", "housingLand")).toContain("1992");
    expect(rowStr(rows, "취득일자", "commercialLand")).toContain("1992");
    expect(rowStr(rows, "취득일자", "housingBuilding")).toContain("1997");
    expect(rowStr(rows, "취득일자", "commercialBuilding")).toContain("1997");
    // 토지 열 ≠ 건물 열
    expect(rowStr(rows, "취득일자", "housingLand")).not.toBe(
      rowStr(rows, "취득일자", "housingBuilding"),
    );
    // 보유기간: 토지(1992~2022) > 건물(1997~2022) → 문자열 상이
    expect(rowStr(rows, "보유기간", "housingLand")).not.toBe(
      rowStr(rows, "보유기간", "housingBuilding"),
    );
    expect(rowStr(rows, "보유기간", "commercialLand")).toBe(
      rowStr(rows, "보유기간", "housingLand"),
    ); // 토지 열끼리 동일
  });

  it("A2 landAcquisitionDate 미입력 → 4열 동일(fallback 무회귀)", () => {
    const fd = formDataWith("", "1997-09-12");
    const { mode } = deriveColumns(result);
    const rows = buildRows(result, mode, fd, undefined, CASE14_TRANSFER_PRICE);

    const cols = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"];
    const acqDates = cols.map((c) => rowStr(rows, "취득일자", c));
    const holds = cols.map((c) => rowStr(rows, "보유기간", c));
    expect(new Set(acqDates).size).toBe(1); // 전부 동일
    expect(new Set(holds).size).toBe(1);
    expect(acqDates[0]).toContain("1997");
  });

  it("A3 합계 열 = 건물 취득일 기준 (변경 없음)", () => {
    const fd = formDataWith("1992-01-01", "1997-09-12");
    const { mode } = deriveColumns(result);
    const rows = buildRows(result, mode, fd, undefined, CASE14_TRANSFER_PRICE);
    // 합계 취득일자 = 건물(1997) — 대표값
    expect(rowStr(rows, "취득일자", "total")).toContain("1997");
    expect(rowStr(rows, "취득일자", "total")).toBe(rowStr(rows, "취득일자", "housingBuilding"));
  });
});
