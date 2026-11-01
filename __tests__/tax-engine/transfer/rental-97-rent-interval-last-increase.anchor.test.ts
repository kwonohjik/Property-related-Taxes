/**
 * anchor — 1년 이내 재증액 금지의 기산점은 **마지막 증액일** (2026-11-01, 사용자 확인)
 *
 * 조특령 §97의3③1호 후단 · 소득세법 시행령 §167의3①2호 가·다목 괄호
 *   「임대료등의 증액 청구는 임대차계약 또는 약정한 임대료등의 증액이 있은 후 1년 이내에는 하지 못하고」
 *
 * 종전에는 「직전 계약일」부터 1년을 셌다 — 동결·감액 갱신이 기산점을 새로 열어, 마지막 증액으로부터는
 * 1년이 지났는데도 동결 갱신 직후의 증액을 「1년 이내」로 잡았다.
 * 지금: 기산점은 마지막 증액 계약일, 아직 증액이 없으면 첫 계약일. 동결·감액은 기산점을 옮기지 않는다.
 * 시행일 게이트(직전 계약 ≥ 2020-02-11)는 그대로다(`rental-97-3-97-5-rent-cap-from-rental-start.anchor.test.ts`).
 *
 * 공용 헬퍼라 §97의3·§97의4·§97의5가 같다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { validateRentIncreaseInterval } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

/** UTC 자정 — 엔진 날짜 상수·API 경로와 같은 축 */
const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const jeonse = (date: string, deposit: number) => ({ contractDate: D(date), contractType: "jeonse" as const, deposit, monthlyRent: 0 });

/** §97의3 — 취득·등록·임대개시·사업자등록 모두 2015-01-01 (안분 불필요), 양도 2026-07-01 */
const BASE_973: Rental97EvaluationInput = {
  id: "rental_97_3",
  acquisitionDate: D("2015-01-01"),
  registrationDate: D("2015-01-01"),
  rentalStartDate: D("2015-01-01"),
  taxRegistrationDate: D("2015-01-01"),
  transferDate: D("2026-07-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: true,
  officialPriceAtStart: 300_000_000,
  isNationalHousingScale: true,
  region: "capital",
  rentalContinuesToTransfer: true,
};
const r973 = (h: ReturnType<typeof jeonse>[]) => evaluateRental973({ ...BASE_973, rentHistory: h });

describe("기산점 = 마지막 증액일 (증액 전이면 첫 계약일)", () => {
  it("🔴 동결 갱신은 기산점을 새로 열지 않는다 — 2020-03-01 계약 → 2020-12-01 동결 → 2021-03-15 4% 증액 = 적격 (종전: 동결일부터 세어 위반)", () => {
    const r = r973([jeonse("2020-03-01", 100_000_000), jeonse("2020-12-01", 100_000_000), jeonse("2021-03-15", 104_000_000)]);
    expect(r.isEligible).toBe(true);
  });

  it("동결이 있어도 첫 계약일로부터 1년 이내 증액이면 위반 — 2020-03-01 → 2020-06-01 동결 → 2021-02-01 4%", () => {
    const r = r973([jeonse("2020-03-01", 100_000_000), jeonse("2020-06-01", 100_000_000), jeonse("2021-02-01", 104_000_000)]);
    expect(codes(r)).toEqual(["RENT_INCREASE_WITHIN_1_YEAR"]);
  });

  it("증액이 있으면 기산점이 그 날로 옮겨간다 — 2021-03-02 증액 후 2022-01-01 재증액 = 위반", () => {
    const r = r973([jeonse("2020-03-01", 100_000_000), jeonse("2021-03-02", 104_000_000), jeonse("2022-01-01", 108_000_000)]);
    expect(codes(r)).toEqual(["RENT_INCREASE_WITHIN_1_YEAR"]);
  });

  it("감액도 기산점을 옮기지 않는다 — 2020-03-01 → 2020-12-01 감액 → 2021-02-01 증액 = 첫 계약일로부터 1년 이내라 위반", () => {
    const r = r973([jeonse("2020-03-01", 100_000_000), jeonse("2020-12-01", 95_000_000), jeonse("2021-02-01", 99_000_000)]);
    expect(codes(r)).toEqual(["RENT_INCREASE_WITHIN_1_YEAR"]);
  });

  it("헬퍼 — 위반에 기산점(lastIncreaseDate)과 바로 앞 계약일(previousContractDate)을 따로 담는다", () => {
    const v = validateRentIncreaseInterval(
      [jeonse("2020-03-01", 100_000_000), jeonse("2020-06-01", 100_000_000), jeonse("2021-02-01", 104_000_000)],
      0.04,
    ).violations;
    expect(v).toHaveLength(1);
    expect(v[0].lastIncreaseDate.toISOString().slice(0, 10)).toBe("2020-03-01");
    expect(v[0].previousContractDate.toISOString().slice(0, 10)).toBe("2020-06-01");
    expect(v[0].contractDate.toISOString().slice(0, 10)).toBe("2021-02-01");
  });
});

describe("공용 헬퍼 — §97의4·§97의5도 같다", () => {
  it("🔴 §97의4 동결 갱신 후 증액(마지막 증액·첫 계약으로부터 1년 경과) = 적격", () => {
    const r = evaluateRental974({
      id: "rental_97_4",
      acquisitionDate: D("2016-01-01"),
      registrationDate: D("2016-03-01"),
      rentalStartDate: D("2016-03-01"),
      transferDate: D("2024-06-01"),
      isTaxRegistered: true,
      rentIncreaseViolated: true,
      rental974Category: "purchase_a",
      region: "capital",
      officialPriceAtStart: 500_000_000,
      rentHistory: [jeonse("2020-03-01", 100_000_000), jeonse("2020-12-01", 100_000_000), jeonse("2021-03-15", 104_000_000)],
    });
    expect(r.isEligible).toBe(true);
  });

  it("§97의5 메시지는 기산점(마지막 증액일) → 증액일을 보여 준다", () => {
    const r = evaluateRental975({
      id: "rental_97_5",
      acquisitionDate: D("2018-07-01"),
      registrationDate: D("2018-08-01"),
      rentalStartDate: D("2018-08-01"),
      taxRegistrationDate: D("2018-08-01"),
      transferDate: D("2029-01-01"),
      isPurchaseRental: true,
      isTaxRegistered: true,
      rentIncreaseViolated: true,
      isNationalHousingScale: true,
      region: "capital",
      officialPriceAtStart: 320_000_000,
      rentalContinuesToTransfer: true,
      calculatedTax: 50_000_000,
      rentHistory: [jeonse("2020-03-01", 100_000_000), jeonse("2020-06-01", 100_000_000), jeonse("2021-02-01", 104_000_000)],
    });
    expect(codes(r)).toEqual(["RENT_INCREASE_WITHIN_1_YEAR"]);
    const msg = r.isEligible ? "" : r.ineligibleReasons[0].message;
    expect(msg).toMatch(/마지막 증액일\(증액 전이면 첫 계약일\)로부터 1년 이내/);
    expect(msg).toMatch(/2020-03-01 → 2021-02-01/);
  });
});
