/**
 * I-4 — §155㉓ 등록 말소일의 클라이언트 층(③ normalize · ⑧ validate · ④ API 변환).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | M-1 | ③ | 구 기록(말소 불리언만)은 말소일 ""로 복원된다 — 선언을 날짜로 지어내지 않는다 |
 * | V-1 | ⑧ | 말소 토글 ON(가·다·라·마목)이면 말소일 필수 — 계산기·판정 메뉴 두 모드 모두 |
 * | V-2 | ⑧ | 말소일 < 지자체 등록신청일 · 말소일 > 양도일 차단 / 경계(같은 날) 통과 |
 * | V-3 | ⑧ | 말소 토글 OFF·㉓ 대상 아닌 목(바목)은 요구하지 않는다(짝) |
 * | A-1 | ④ | 토글 ON + 날짜 → ISO 전송 / 빈값·토글 OFF → 보내지 않는다 |
 */
import { describe, it, expect } from "vitest";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

/** 2018-06-01 등록 매입 → 가목 · 자진말소(단기) */
function unit(over: Partial<Unit> = {}): Unit {
  return {
    ...makeDefaultRentalUnit(),
    businessRegistrationDate: "2018-06-01",
    rentalRegistrationDate: "2018-06-01",
    standardPriceAtRentalStart: "300,000,000",
    requirementsConfirmed: true,
    rentalMonths: "30",
    rentalAutoTermination: true,
    terminatedRegistrationType: "short_term",
    registrationCancellationDate: "2021-03-03",
    ...over,
  };
}

function asset(u: Unit): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2016-01-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [u] },
  };
}

const V = (u: Unit, transfer = "2024-06-01", mode: "full" | "facts" = "full") => {
  const a = asset(u);
  return validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", transfer, mode);
};

describe("M-1 ③ 구 기록 복원", () => {
  it("말소 불리언만 있고 말소일 필드가 없다 → \"\"(토글은 그대로)", () => {
    const m = migrateAsset({
      rentalHousingException: {
        applyException: true,
        scenario: "A",
        rentalUnits: [{ rentalAutoTermination: true, terminatedRegistrationType: "short_term" }],
      },
    });
    const u = m.rentalHousingException.rentalUnits[0];
    expect(u.rentalAutoTermination).toBe(true);
    expect(u.registrationCancellationDate).toBe("");
  });
  it("복원된 구 기록은 ⑧이 말소일을 요구한다(비과세로 새지 않는다)", () => {
    expect(V(unit({ registrationCancellationDate: "" }))).toContain("등록 말소일을 입력하세요");
  });
});

describe("V-1·V-2·V-3 ⑧", () => {
  it("V-1 말소일 미입력 → 계산기·판정 메뉴 모두 차단", () => {
    expect(V(unit({ registrationCancellationDate: "" }))).toContain("등록 말소일");
    expect(V(unit({ registrationCancellationDate: "" }), "2024-06-01", "facts")).toContain("등록 말소일");
    expect(V(unit())).toBeNull();
  });
  it("V-2 등록신청일 전 말소일 차단 · 같은 날 통과", () => {
    expect(V(unit({ registrationCancellationDate: "2018-05-31" }))).toContain("이후여야");
    expect(V(unit({ registrationCancellationDate: "2018-06-01" }))).toBeNull();
  });
  it("V-2 양도일 뒤 말소일 차단 · 양도일 당일 통과", () => {
    expect(V(unit({ registrationCancellationDate: "2024-06-02" }))).toContain("양도일(2024-06-01) 뒤");
    expect(V(unit({ registrationCancellationDate: "2024-06-01" }))).toBeNull();
  });
  it("V-3 말소 토글 OFF · 바목(㉓ 대상 아님)은 말소일을 요구하지 않는다", () => {
    expect(V(unit({ rentalAutoTermination: false, registrationCancellationDate: "" }))).toBeNull();
    const ba = unit({
      rentalAcquisitionType: "construction",
      businessRegistrationDate: "2021-01-01",
      rentalRegistrationDate: "2021-01-01",
      rentalLandArea: "200",
      rentalTotalFloorArea: "140",
      hasMinimum2Units: true,
      registrationCancellationDate: "",
    });
    expect(V(ba)).toBeNull();
  });
});

describe("A-1 ④ 전송 규약", () => {
  const sent = (u: Unit) =>
    (toRentalHousingExceptionApi(asset(u)) as { rentalUnits: Record<string, unknown>[] }).rentalUnits[0]
      .registrationCancellationDate;
  it("토글 ON + 날짜 → ISO", () => {
    expect(sent(unit())).toBe("2021-03-03T00:00:00.000Z");
  });
  it("빈값·토글 OFF → 보내지 않는다", () => {
    expect(sent(unit({ registrationCancellationDate: "" }))).toBeUndefined();
    expect(sent(unit({ rentalAutoTermination: false }))).toBeUndefined();
  });
});
