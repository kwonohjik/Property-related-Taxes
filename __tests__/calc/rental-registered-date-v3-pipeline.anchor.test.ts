/**
 * V-3 지자체 임대사업자 「등록일」 칸 — ⑤ 미리 채움 · ④ 전송 · ⑧ 필수 · ⑫ Zod · ⑭ 엔진 매핑.
 * 엔진 판정은 `__tests__/tax-engine/rental-article/registered-date-v3.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { rentalUnitSchema } from "@/lib/api/transfer-tax-schema";
import { registeredDateAfterApplicationChange } from "@/lib/stores/calc-wizard-asset-rental-period";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { houseRowSurchargeAxisIssue } from "@/lib/calc/transfer-tax-validate-surcharge-axis";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { buildSellingRentalPayload } from "@/lib/calc/transfer-tax-api-houses";
import { houseSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapHousesToEngine } from "@/lib/api/transfer-route-multi-house";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

describe("⑤ 신청일 → 등록일 미리 채움(onChange)", () => {
  it("RD-1 등록일이 비었거나 종전 신청일과 같으면 새 신청일을 따라간다", () => {
    expect(registeredDateAfterApplicationChange("", "", "2018-03-30")).toBe("2018-03-30");
    expect(registeredDateAfterApplicationChange("2018-03-29", "2018-03-29", "2018-03-30")).toBe("2018-03-30");
  });

  it("RD-2 사용자가 다르게 고친 등록일은 그대로 둔다", () => {
    expect(registeredDateAfterApplicationChange("2018-03-30", "2018-04-04", "2018-03-29")).toBe("2018-04-04");
  });
});

function asset(unitOver: Record<string, unknown>): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2015-01-04",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2015-01-01",
          rentalRegistrationDate: "2015-01-01",
          rentalRegisteredDate: "2015-01-05",
          rentalCategory: "long_general",
          rentalAcquisitionType: "purchase",
          standardPriceAtRentalStart: "300,000,000",
          requirementsConfirmed: true,
          rentalMonths: "96",
          ...unitOver,
        },
      ],
    },
  };
}

const validate = (a: AssetForm) =>
  validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", "2025-03-03", "full") ?? "";

describe("§155⑳ 임대주택 카드 — ⑧·④·⑫·⑭", () => {
  it("RD-3 ★ ⑧ 등록일 미입력은 막는다(신청일로 간주하지 않음)", () => {
    expect(validate(asset({ rentalRegisteredDate: "" }))).toContain("지자체 임대사업자 등록일(등록증의 등록일)을 입력하세요");
  });

  it("RD-4 ⑧ 등록일이 신청일보다 앞이면 막는다 · 짝: 같은 날·뒤는 이 사유 없음", () => {
    expect(validate(asset({ rentalRegisteredDate: "2014-12-31" }))).toContain("등록신청일(2015-01-01) 이후여야");
    for (const d of ["2015-01-01", "2015-01-05"]) {
      expect(validate(asset({ rentalRegisteredDate: d }))).not.toContain("등록일");
    }
  });

  it("RD-5 ★ ④ 등록일을 ISO로 싣고 ⑫ Zod가 통과시킨다", () => {
    const api = toRentalHousingExceptionApi(asset({})) as { rentalUnits: Array<Record<string, unknown>> };
    expect(api.rentalUnits[0].rentalRegisteredDate).toBe("2015-01-05T00:00:00.000Z");
    const parsed = rentalUnitSchema.safeParse(api.rentalUnits[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.rentalRegisteredDate).toBe("2015-01-05T00:00:00.000Z");
  });

  it("RD-6 ④ 등록일이 비면 보내지 않는다(엔진이 신청일로 봄)", () => {
    const api = toRentalHousingExceptionApi(asset({ rentalRegisteredDate: "" })) as { rentalUnits: Array<Record<string, unknown>> };
    expect(api.rentalUnits[0].rentalRegisteredDate).toBeUndefined();
  });
});

const houseRow = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "h2",
    region: "capital",
    acquisitionDate: "2015-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    isLongTermRental: true,
    isRegisteredRental: true,
    rentalRegistrationDate: "2018-03-30",
    rentalRegisteredDate: "2018-04-04",
    businessRegistrationDate: "2018-03-30",
    rentalStartDate: "2018-04-04",
    ...over,
  }) as HouseEntry;

describe("다주택 중과배제 명부·양도 주택 — ⑧·④·⑫·⑭", () => {
  it("RD-7 ★ ⑧ 등록일 미입력·신청일보다 앞이면 막는다", () => {
    expect(houseRowSurchargeAxisIssue(houseRow({ rentalRegisteredDate: undefined }), "보유 주택 1", "2023-06-01", undefined)).toContain(
      "임대사업자 등록일(등록증의 등록일)을 입력하세요",
    );
    expect(houseRowSurchargeAxisIssue(houseRow({ rentalRegisteredDate: "2018-03-01" }), "보유 주택 1", "2023-06-01", undefined)).toContain(
      "등록 신청일(2018-03-30) 이후여야",
    );
    expect(houseRowSurchargeAxisIssue(houseRow(), "보유 주택 1", "2023-06-01", undefined) ?? "").not.toContain("등록일");
  });

  it("RD-8 ★ ④ 양도 주택 payload → ⑫ houseSchema → ⑭ 엔진 Date", () => {
    const payload = buildSellingRentalPayload(houseRow()) as Record<string, unknown>;
    expect(payload.rentalRegisteredDate).toBe("2018-04-04");
    const parsed = houseSchema.safeParse({
      id: "h1",
      region: "capital",
      acquisitionDate: "2015-01-01",
      officialPrice: 300_000_000,
      isInherited: false,
      isOfficetel: false,
      isUnsoldHousing: false,
      ...payload,
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
    const [engine] = mapHousesToEngine(parsed.success ? [parsed.data] : [])!;
    expect(engine.rentalRegisteredDate?.toISOString().slice(0, 10)).toBe("2018-04-04");
    expect(engine.rentalRegistrationDate?.toISOString().slice(0, 10)).toBe("2018-03-30");
  });
});
