/**
 * V-6 ⓑ·ⓒ — 「구 임대주택법」 매입임대(엔진 `구법`)는 종전 단기민간임대주택이고 임대의무기간은 종전 임대주택법 5년이다.
 *
 * 근거(원문 실독 2026-11-15):
 * - 민간임대주택에 관한 특별법 부칙<제13499호> 제3조③3호(2020.8.18. 부칙<제17482호> 신설 · MST 220963): 종전 「임대주택법」
 *   §16①4호 민간건설임대주택 또는 매입임대주택(1호 준공공 제외)은 단기임대주택으로 본다. 단서 「임대의무기간 … 종전의
 *   「임대주택법」을 적용한다」. 부칙<제15356호> 제5조⑤가 이를 단기민간임대주택으로 본다(같은 단서).
 * - 구 임대주택법 시행령 §13①2호(MST 177728): 그 밖의 임대주택 「임대 개시일부터 5년」.
 *
 * ⓑ 매입 아파트는 소령 §167의3①2호 가목2)·⑪ 양도기한(바닥 2027.12.31.) 대상이다(가목 — 부칙 제3조① 매입임대 인용).
 * ⓒ §155㉓1호 「임대의무기간의 2분의 1」 = 30개월(고른 등록 유형 「단기 4년」의 24개월이 아니다).
 *
 * 수정 전 실측: B-1 passed=true(게이트 없음) · C-1 26개월 자진말소 passed=true(24개월 기준) · C-5 5년 자동말소일에 확인 필요 고지.
 */
import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);

/** 2012.3. 구 임대주택법 매입임대(아파트) 등록 · 등록·임대 중 */
function unit(over: Partial<RentalUnitInput> = {}): RentalUnitInput {
  return {
    businessRegistrationDate: d("2012-03-01"),
    rentalRegistrationDate: d("2012-03-01"),
    rentalRegisteredDate: d("2012-03-01"),
    rentalCategory: "pre_2018",
    rentalAcquisitionType: "purchase",
    isApartment: true,
    region: "seoul-metro",
    standardPriceAtRentalStart: 300_000_000,
    hasMinimum2Units: false,
    rentalMonths: 120,
    requirementsConfirmed: true,
    isExcluded918Rule: false,
    ...over,
  } as RentalUnitInput;
}

const run = (units: RentalUnitInput[], transferDate: string) =>
  checkEligibility(units, 10, 5, false, {
    scenario: "A",
    transferDate: d(transferDate),
    residenceAcquisitionDate: d("2009-01-01"),
  } as Parameters<typeof checkEligibility>[4]);

/** 호별 미충족 문구에 ⑪ 양도기한 경과 사유가 있는가(`APT_TRANSFER_DEADLINE_EXCEEDED` 문구) */
const deadlineFailed = (r: ReturnType<typeof run>) => JSON.stringify(r.failReasons).includes("§167조의3⑪에 따른 양도기한");

describe("V-6 ⓑ 구 임대주택법 매입 아파트 × 소령 §167의3⑪ 양도기한", () => {
  it("B-1 2028-03-02 양도 · 연장 사실 없음 → 기한 경과로 불성립(가목과 같다)", () => {
    const r = run([unit()], "2028-03-02");
    expect(r.passed).toBe(false);
    expect(deadlineFailed(r)).toBe(true);
  });

  it("B-1′ 대조 — 같은 호를 가목(장기일반 매입)으로 넣어도 같은 결론", () => {
    const r = run([unit({ rentalCategory: "long_general" })], "2028-03-02");
    expect(deadlineFailed(r)).toBe(true);
  });

  it("B-2 2027-12-31 양도 → 기한 안 성립", () => {
    expect(run([unit()], "2027-12-31").passed).toBe(true);
  });

  it("B-3 비아파트 · 2028-03-02 → 게이트 밖 성립", () => {
    const r = run([unit({ isApartment: false })], "2028-03-02");
    expect(r.passed).toBe(true);
    expect(deadlineFailed(r)).toBe(false);
  });

  it("B-4 도시형 생활주택인 아파트 · 2028-03-02 → 가목2) 괄호로 게이트 밖 성립", () => {
    expect(run([unit({ isUrbanLifeHousingApartment: true })], "2028-03-02").passed).toBe(true);
  });

  it("B-5 미충족 문구는 「구법목」이 아니라 「구 임대주택법 매입임대 — 가목」", () => {
    const r = run([unit()], "2028-03-02");
    const joined = JSON.stringify(r.failReasons);
    expect(joined).toContain("구 임대주택법 매입임대 — 가목");
    expect(joined).not.toContain("구법목");
  });

  it("B-6 구법 × 건설은 다목이라 게이트 밖 — 2028-03-02 성립", () => {
    const r = run([unit({ rentalAcquisitionType: "construction", hasMinimum2Units: true, landAreaM2: 200, totalFloorAreaM2: 100 })], "2028-03-02");
    expect(deadlineFailed(r)).toBe(false);
  });
});

/** 2015.10. 구 임대주택법 매입 등록 · 말소 */
const cancelled = (over: Partial<RentalUnitInput>) =>
  unit({
    businessRegistrationDate: d("2015-10-01"),
    rentalRegistrationDate: d("2015-10-01"),
    rentalRegisteredDate: d("2015-10-01"),
    rentalAutoTermination: true,
    terminatedRegistrationType: "short_term",
    ...over,
  });

describe("V-6 ⓒ 구 임대주택법 자진말소 × §155㉓1호 1/2 = 30개월", () => {
  it("C-1 26개월 임대 후 자진말소 → 30개월 미달로 불성립", () => {
    const r = run([cancelled({ terminationReason: "voluntary", registrationCancellationDate: d("2022-01-10"), rentalMonths: 26, halfDutyRentalMonths: 26 })], "2024-06-01");
    expect(r.passed).toBe(false);
  });

  it("C-2 30개월 임대 후 자진말소 → 성립", () => {
    const r = run([cancelled({ terminationReason: "voluntary", registrationCancellationDate: d("2022-01-10"), rentalMonths: 30, halfDutyRentalMonths: 30 })], "2024-06-01");
    expect(r.passed).toBe(true);
  });

  it("C-3 미충족 문구 — 5년·30개월과 부칙 제3조③·구 임대주택법 시행령 §13①2호", () => {
    const r = run([cancelled({ terminationReason: "voluntary", registrationCancellationDate: d("2022-01-10"), rentalMonths: 26, halfDutyRentalMonths: 26 })], "2024-06-01");
    const joined = JSON.stringify(r);
    expect(joined).toContain("30개월");
    expect(joined).toContain("부칙<제13499호> 제3조③3호");
    expect(joined).toContain("구 임대주택법 시행령 §13①2호");
    expect(joined).not.toContain("24개월");
  });

  it("C-4 대조 — 가목(장기일반 매입 · 단기 4년 등록) 26개월 자진말소는 24개월 기준 그대로 성립", () => {
    const r = run([cancelled({ rentalCategory: "long_general", terminationReason: "voluntary", registrationCancellationDate: d("2022-01-10"), rentalMonths: 26, halfDutyRentalMonths: 26 })], "2024-06-01");
    expect(r.passed).toBe(true);
  });

  it("C-5 자동말소일 = 등록일 + 5년(2020-10-01) → 「말소일이 의무기간 종료보다 늦다」 확인 필요 고지 없음", () => {
    const r = run([cancelled({ terminationReason: "auto", registrationCancellationDate: d("2020-10-01"), rentalMonths: 60, halfDutyRentalMonths: 60 })], "2024-06-01");
    expect(r.notices?.some((n) => n.includes("임대의무기간 종료일을 넣었는지"))).toBe(false);
  });

  it("C-6 「해석례가 없다」 확인 필요 고지는 더 내지 않는다", () => {
    const r = run([cancelled({ terminationReason: "voluntary", registrationCancellationDate: d("2022-01-10"), rentalMonths: 30, halfDutyRentalMonths: 30 })], "2024-06-01");
    expect(r.notices?.some((n) => n.includes("확인된 해석례가 없습니다"))).toBe(false);
  });
});
