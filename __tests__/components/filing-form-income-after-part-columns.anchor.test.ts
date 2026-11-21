/**
 * R-c06-05 — 겸용 4열 신고서 표 「감면후 소득금액」 파트 열.
 *
 * 종전: `fourPartFinancials`가 파트 열을 양도소득금액(차감 전)과 같은 값으로 채워, §99의3 소득금액 차감이 있으면
 * 열 합 568,973,163 ≠ 합계 452,832,192(차감 116,140,971)였다. 파트별 귀속 echo가 없으므로 차감이 있으면 파트 열을 비우고
 * 합계 열만 남긴다(UI에서 새로 안분하지 않는다). 시료는 `mixed-use-engine-steps-table.anchor.test.tsx`의 §99의3 A1.
 */
import { describe, it, expect } from "vitest";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { deriveColumns } from "@/components/calc/results/transfer/FilingFormTableColumns";

const D = (s: string) => new Date(s);
const r993 = {
  type: "new_99_3", contractDate993: D("2002-03-01"), acquisitionType993: "from_builder", firstContract993: "yes" as const,
  region993: "outside_speculation", standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000, exclusiveAreaSqm993: 84,
};
const LATE = { buildingAcquisitionDate: D("2003-09-01"), landAcquisitionDate: D("2003-09-01") };
const PARTS = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"] as const;

function rowsOf(reductions: unknown[]) {
  const b = calcMixed(
    1_100_000_000, D("2026-06-01"),
    { ...mixedUseCase14(), isOneHouseExempt: false, ...LATE, reductions } as unknown as MixedUseAssetInput,
    makeMockRatesWithHouseEngine(),
  );
  const res = mixedUseToFilingResult(b);
  const { mode } = deriveColumns(res);
  expect(mode).toBe("mixed-4col");
  const rows = buildRows(res, mode);
  return (label: string) => rows.find((r) => r.label.trim() === label)!;
}

describe("겸용 4열 — 감면후 소득금액 파트 열 (R-c06-05)", () => {
  it("🔑 §99의3 소득금액 차감이 있으면 파트 열은 비우고 합계 452,832,192만 남긴다", () => {
    const row = rowsOf([r993]);
    expect(row("소득금액 감면대상").values.total).toBe(116_140_971);
    const after = row("감면후 소득금액");
    expect(after.values.total).toBe(452_832_192);
    for (const c of PARTS) expect(after.values[c] ?? null).toBeNull();
    expect(after.roseNotes?.total).toContain("합계 열에만");
    // 양도소득금액 행(차감 전)은 열 합 = 합계 그대로
    const income = row("양도소득금액").values;
    expect(PARTS.reduce((s, c) => s + (income[c] as number), 0)).toBe(568_973_163);
  });

  it("차감이 없으면 파트 열은 종전대로 양도소득금액과 같고 열 합 = 합계", () => {
    const row = rowsOf([]);
    const after = row("감면후 소득금액").values;
    const income = row("양도소득금액").values;
    for (const c of PARTS) expect(after[c]).toBe(income[c]);
    expect(PARTS.reduce((s, c) => s + (after[c] as number), 0)).toBe(after.total);
    expect(row("감면후 소득금액").roseNotes?.total).toBeUndefined();
  });
});
