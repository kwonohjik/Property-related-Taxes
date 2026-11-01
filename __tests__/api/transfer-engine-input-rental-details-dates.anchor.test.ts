/**
 * anchor — 단건 ⑭ `buildTransferEngineInput`의 레거시 `rentalReductionDetails` 날짜 변환 (2026-11-01)
 *
 * 리뷰 게이트 경미 결함: 단건(`engine-input.ts`)만 `new Date(문자열)`을 직접 불렀다 — 저장소 규칙 위반
 * (CLAUDE.md 「API Date 직렬화 — `lib/api/date-coerce.ts` 필수」). 다건(`multi/route.ts`)은 이미 `toDate`였다.
 * 결과값은 같다(Zod `z.string().date()`가 형식을 막고, 둘 다 "YYYY-MM-DD" → UTC 자정) — 이 anchor는
 * 변환 결과(Date 인스턴스·UTC 자정 값)와 중첩 배열(공실·계약 이력)까지 빠짐없이 바뀌는지를 고정한다.
 *
 * 이 입력은 화면에서 도달하지 않는 직접 API 호출 전용 하위 호환 경로다(PR #2819 호환성 항목).
 */
import { describe, it, expect } from "vitest";
import { buildTransferEngineInput } from "@/app/api/calc/transfer/engine-input";
import { propertySchema } from "@/lib/api/transfer-tax-schema";

const BASE = {
  propertyType: "housing" as const,
  transferPrice: 900_000_000,
  transferDate: "2020-06-01",
  acquisitionPrice: 400_000_000,
  acquisitionDate: "2008-01-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
};

const DETAILS = {
  isRegisteredLandlord: true,
  isTaxRegistered: true,
  registrationDate: "2010-01-01",
  rentalHousingType: "long_term_private",
  propertyType: "apartment",
  region: "capital",
  officialPriceAtStart: 200_000_000,
  rentalStartDate: "2010-02-01",
  transferDate: "2020-06-01",
  vacancyPeriods: [{ startDate: "2012-01-01", endDate: "2012-05-01" }],
  rentHistory: [
    { contractDate: "2010-02-01", contractType: "jeonse", deposit: 100_000_000, monthlyRent: 0 },
    { contractDate: "2012-02-01", contractType: "jeonse", deposit: 104_000_000, monthlyRent: 0 },
  ],
  calculatedTax: 0,
};

describe("단건 ⑭ rentalReductionDetails 날짜 — date-coerce toDate", () => {
  it("모든 날짜가 Date(UTC 자정)로 바뀐다 — 상위 3개 + 공실 구간 + 계약 이력", () => {
    const parsed = propertySchema.parse({ ...BASE, rentalReductionDetails: DETAILS });
    const d = buildTransferEngineInput(parsed, new Date("2020-06-01"), new Date("2008-01-01"), undefined)
      .rentalReductionDetails!;
    const iso = (x: Date) => x.toISOString();

    expect(iso(d.registrationDate)).toBe("2010-01-01T00:00:00.000Z");
    expect(iso(d.rentalStartDate)).toBe("2010-02-01T00:00:00.000Z");
    expect(iso(d.transferDate)).toBe("2020-06-01T00:00:00.000Z");
    expect(d.vacancyPeriods.map((v) => [iso(v.startDate), iso(v.endDate)])).toEqual([
      ["2012-01-01T00:00:00.000Z", "2012-05-01T00:00:00.000Z"],
    ]);
    expect(d.rentHistory.map((r) => iso(r.contractDate))).toEqual([
      "2010-02-01T00:00:00.000Z",
      "2012-02-01T00:00:00.000Z",
    ]);
    // 날짜 외 필드는 그대로
    expect(d.rentHistory[1].deposit).toBe(104_000_000);
    expect(d.officialPriceAtStart).toBe(200_000_000);
  });
});
