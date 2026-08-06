/**
 * anchor: 신고서 양식 split-2col — 토지·건물 열 취득일자·보유기간 표시.
 *
 * 🔴 결함: 보유기간 셀이 엔진 `holdingYears`(만-연수 정수)를 `× 12`한 값으로 채워져,
 * 보유 1년 미만이면 `0 × 12 = 0` → `fmtPeriod`가 `"-"`를 반환해 **건물 보유기간이 사라졌다**.
 * 동시에 만-연수 절사 탓에 "1년 0월"처럼 실제 일자 차이와 어긋나는 값이 표시됐다.
 *
 * 🔴 결함②: 취득일자 셀이 토지·건물 모두 `acquisitionDate`(건물 취득일)로 채워져,
 * **별개취득(토지·건물 취득시기 상이)인데 두 열의 취득일자가 같게** 나왔다.
 * → 토지 열의 보유기간이 그 열의 취득일자와 정합하지 않았다.
 *
 * 불변식: 각 열의 보유기간 = 그 열의 취득일자 → 양도일.
 * 표시 규약(2026-07-29 사용자 확정) = **연·월 숫자 차이만**(일 무시).
 * 합계 열(`holdingPeriodFromDates`)·겸용 4열 모드(:482-487)와 동일 규약.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  buildRows,
  deriveColumns,
  holdingPeriodFromDates,
} from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();

// 토지 2025-01-08 취득 (→ 연·월 차이 14월 = 1년 2월)
// 건물 2025-08-29 취득 (→ 연·월 차이 7월 = 0년 7월 — 만-연수는 0이라 종전 코드에서 "-")
const LAND_ACQ = "2025-01-08";
const BUILDING_ACQ = "2025-08-29";
const TRANSFER = "2026-03-06";

function splitInput(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "building",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date(BUILDING_ACQ),
    transferDate: new Date(TRANSFER),
    landAcquisitionDate: new Date(LAND_ACQ),
    landSplitMode: "actual",
    landTransferPrice: 400_000_000,
    buildingTransferPrice: 100_000_000,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    landStandardPriceAtTransfer: 400_000_000,
    buildingStandardPriceAtTransfer: 100_000_000,
    landAcquisitionPrice: 240_000_000,
    buildingAcquisitionPrice: 60_000_000,
    landDirectExpenses: 0,
    buildingDirectExpenses: 0,
    // 규칙 ① — 양도가액 구분 근거(명시 가액이 있으므로 값에는 무영향)
    standardPriceAtAcquisition: 100_000_000,
    standardPricePerSqmAtAcquisition: 800_000,
    acquisitionArea: 100,
    selfOwns: "both",
  });
}

function makeFormData() {
  const form = createDefaultTransferFormData();
  form.transferDate = TRANSFER;
  form.contractTotalPrice = "500000000";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "building",
    acquisitionDate: BUILDING_ACQ,
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: LAND_ACQ,
  };
  return form;
}

function cell(rows: ReturnType<typeof buildRows>, label: string, col: string) {
  const r = rows.find((x) => x.label === label);
  return r?.values[col as keyof typeof r.values] ?? null;
}

describe("신고서 양식 split-2col — 보유기간·취득일자 (Pre-Do anchor)", () => {
  const result = calculateTransferTax(splitInput(), rates);
  const form = makeFormData();
  const { mode } = deriveColumns(result);
  const rows = buildRows(result, mode, form, form.assets[0], 500_000_000);

  it("전제 — split-2col 모드이고 건물 보유가 1년 미만(엔진 holdingYears = 0)", () => {
    expect(mode).toBe("split-2col");
    expect(result.splitDetail!.building.holdingYears).toBe(0);
  });

  it("🔴 건물 보유기간이 표시된다 (종전: 만-연수 0 → \"-\")", () => {
    expect(cell(rows, "보유기간", "building")).toBe("0년 7월");
  });

  it("토지 보유기간 = 토지 취득일 기산 (연·월 차이)", () => {
    expect(cell(rows, "보유기간", "land")).toBe("1년 2월");
  });

  it("🔴 취득일자는 열별 자기 취득일 (종전: 두 열 모두 건물 취득일)", () => {
    expect(cell(rows, "취득일자", "land")).toBe(LAND_ACQ);
    expect(cell(rows, "취득일자", "building")).toBe(BUILDING_ACQ);
  });

  it("각 열의 보유기간은 그 열의 취득일자와 정합한다", () => {
    expect(cell(rows, "보유기간", "land")).toBe(
      cell(rows, "취득일자", "land") === LAND_ACQ ? "1년 2월" : "불일치",
    );
    // 합계 열은 종전대로 자산 취득일(건물) 기산
    expect(cell(rows, "보유기간", "total")).toBe("0년 7월");
  });
});

// 신고서 양식 전 표(합계·토지·건물·겸용 4열·자산 합산·재개발 분기)가 공유하는 단일 규약.
describe("보유기간 표시 규약 — 연·월 차이 (일 무시)", () => {
  it("일수가 남아도 절사하지 않는다", () => {
    // 1년 1개월 28일 — 만-개월 절사 방식이면 "1년 1월"
    expect(holdingPeriodFromDates("2025-01-08", "2026-03-06")).toBe("1년 2월");
    expect(holdingPeriodFromDates("2025-08-29", "2026-03-06")).toBe("0년 7월");
  });

  it("같은 달 취득·양도는 \"0년 0월\" (\"-\" 아님)", () => {
    expect(holdingPeriodFromDates("2026-03-02", "2026-03-06")).toBe("0년 0월");
  });

  it("일자 미상·역전은 \"-\"", () => {
    expect(holdingPeriodFromDates("", "2026-03-06")).toBe("-");
    expect(holdingPeriodFromDates("2026-05-01", "2026-03-06")).toBe("-");
  });
});

describe("split-2col — 취득일 동일(비-별개취득) 무회귀", () => {
  it("토지·건물 취득일이 같으면 두 열 보유기간도 같다", () => {
    const input = splitInput();
    input.landAcquisitionDate = new Date(BUILDING_ACQ);
    const result = calculateTransferTax(input, rates);
    const form = makeFormData();
    form.assets[0] = { ...form.assets[0], landAcquisitionDate: BUILDING_ACQ };
    const rows = buildRows(result, "split-2col", form, form.assets[0], 500_000_000);
    expect(cell(rows, "보유기간", "land")).toBe("0년 7월");
    expect(cell(rows, "보유기간", "building")).toBe("0년 7월");
    expect(cell(rows, "취득일자", "land")).toBe(BUILDING_ACQ);
  });
});
