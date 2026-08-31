/**
 * anchor — §97의5①3호의 준용 사슬 (CA-01)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특법 §97의5①3호** — 「임대기간 중 **제97조의3제1항제2호의 요건**을 준수할 것」
 *
 * **조특법 §97의3①2호** — 「**대통령령으로 정하는** 임대보증금 또는 임대료 증액 제한 요건 등을
 * 준수하는 경우」
 *
 * **조특령 §97의3③** — 「법 제97조의3제1항제2호에서 "대통령령으로 정하는 임대보증금 또는
 * 임대료 증액 제한 요건 등"이란 **다음 각 호의 요건**을 말한다.
 *   1. 임대료등의 증가율이 100분의 5를 초과하지 않을 것
 *   2. **「주택법」 제2조제6호에 따른 국민주택규모 이하의 주택**일 것
 *   3. 장기일반민간임대주택등의 임대개시일부터 10년 이상 임대할 것
 *   4. **기준시가의 합계액이 해당 주택의 임대개시일 당시 6억원(수도권 밖의 지역인 경우에는
 *      3억원)을 초과하지 아니할 것**」
 *
 * ⇒ §97의5①3호가 준용하는 것은 **1~4호 전부**다.
 *
 * ## 결함
 * `rental-97-5.ts`가 **1호(임대료 5%)만** 검증했다.
 * - 2호(국민주택규모)는 §97의5 variant에 **입력 필드조차 없었다**.
 * - 4호(기준시가 한도)는 UI hint가 「6억(수도권 밖 3억) 이하 요건 확인용」이라 명시하고
 *   ⑤·⑧·⑫·⑬가 값을 끝까지 날랐는데 **엔진이 한도 비교를 하지 않는 dead pass-through**였다.
 * - `region`은 §97의5 평가기에서 **0건** 참조되는 사문 필드였다.
 *
 * 코드 주석 「전용면적 요건: 본조·시행령 모두 없음 — 국민주택규모 요건은 §97의3 전용」은
 * **준용 사슬을 끝까지 읽지 않은 결론**이었다.
 *
 * ## 형제에 이미 구현돼 있었다
 * `rental-97-3.ts`가 2호·4호를 모두 차단하고 있었다 — 같은 규칙을 두 번 쓰지 않도록
 * `checkRental973Clause24`로 **공용화**했다.
 *
 * ## 안전망
 * `rental-97-evaluators.test.ts`의 `base975()`가 면적·기준시가·소재지 없이 `isEligible=true`를
 * 단언해 이 결함의 회귀 테스트는 **0건**이었다.
 *
 * ⚠️ 4호의 **시기 적용례**(신설 시점·부칙)는 확인하지 못했다 — §97의3도 무조건 적용 중이라
 *    같은 전제를 따른다. 별건 확인 대상.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { evaluateRental97TaxAmount } from "@/lib/tax-engine/transfer-reductions/rental-97-router";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(`${s}T00:00:00`);

const BASE = {
  id: "rental_97_5" as const,
  transferDate: D("2029-02-01"),
  acquisitionDate: D("2018-10-01"),
  registrationDate: D("2018-12-01"),
  rentalStartDate: D("2018-12-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  stdPriceAtAcquisition: 300_000_000,
  stdPriceAtRentalStart: 300_000_000,
  stdPriceAtTransfer: 600_000_000,
  isNationalHousingScale: true,
  officialPriceAtStart: 300_000_000,
  region: "capital" as const,
  calculatedTax: 50_000_000,
};

const codesOf = (r: ReturnType<typeof evaluateRental975>) =>
  r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);

describe("2호 — 국민주택규모 이하", () => {
  it("기준선: 확인 시 전액 감면", () => {
    const r = evaluateRental975({ ...BASE } as Any);
    expect(r.isEligible).toBe(true);
    expect((r as unknown as { reductionAmount?: number }).reductionAmount).toBe(50_000_000);
  });

  it("🔴 국민주택규모 초과 → 배제", () => {
    const r = evaluateRental975({ ...BASE, isNationalHousingScale: false } as Any);
    expect(r.isEligible, "§97의5①3호가 §97의3③2호를 준용한다").toBe(false);
    expect(codesOf(r)).toContain("NOT_NATIONAL_HOUSING_SCALE");
  });

  it("🔴 미입력도 배제 — 충족으로 읽지 않는다", () => {
    const { isNationalHousingScale: _drop, ...noScale } = BASE;
    expect(evaluateRental975(noScale as Any).isEligible).toBe(false);
  });

  it("사유의 근거는 준용 종점인 조특령 §97의3③2호다", () => {
    const r = evaluateRental975({ ...BASE, isNationalHousingScale: false } as Any);
    const reason = r.isEligible
      ? undefined
      : (r.ineligibleReasons ?? []).find((x) => x.code === "NOT_NATIONAL_HOUSING_SCALE");
    expect(reason?.legalBasis).toBe("조특령 §97의3③2호");
    expect(reason?.message).toContain("§97의5①3호");
  });
});

describe("4호 — 임대개시일 당시 기준시가 6억(수도권 밖 3억)", () => {
  it("🔴 수도권 7억 → 배제", () => {
    const r = evaluateRental975({ ...BASE, officialPriceAtStart: 700_000_000 } as Any);
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("OFFICIAL_PRICE_EXCEEDED");
  });

  it("🔴 수도권 밖 4억 → 3억 한도 초과로 배제", () => {
    const r = evaluateRental975({
      ...BASE,
      region: "non_capital",
      officialPriceAtStart: 400_000_000,
    } as Any);
    expect(r.isEligible, "region이 사문 필드가 아니게 됐다").toBe(false);
  });

  it("경계 — 정확히 6억은 「초과하지 아니할 것」이라 통과", () => {
    const r = evaluateRental975({ ...BASE, officialPriceAtStart: 600_000_000 } as Any);
    expect(r.isEligible).toBe(true);
  });

  it("🔴 기준시가 미입력 → 배제", () => {
    const { officialPriceAtStart: _d, stdPriceAtRentalStart: _d2, ...noPrice } = BASE;
    const r = evaluateRental975({ ...noPrice, stdPriceAtRentalStart: 300_000_000 } as Any);
    expect(codesOf(r)).toContain("MISSING_OFFICIAL_PRICE");
  });

  it("구별력 — 같은 금액이 소재지에 따라 갈린다", () => {
    const cap = evaluateRental975({ ...BASE, officialPriceAtStart: 400_000_000 } as Any).isEligible;
    const non = evaluateRental975({
      ...BASE, region: "non_capital", officialPriceAtStart: 400_000_000,
    } as Any).isEligible;
    expect(cap).toBe(true);
    expect(non).toBe(false);
  });
});

describe("⑬ router — 국민주택규모가 evaluator까지 도달한다", () => {
  /**
   * ⚠️ 실측: `case "rental_97_5"`의 명시 매핑에 `isNationalHousingScale`이 없어
   *    엔진이 항상 「미확인」으로 배제했다. 이번 배치에서 **네 번째** 같은 stripping이다.
   */
  const CTX = {
    transferDate: D("2029-02-01"),
    acquisitionDate: D("2018-10-01"),
    stdPriceAtAcquisition: 300_000_000,
    stdPriceAtTransfer: 600_000_000,
    calculatedTax: 50_000_000,
  };
  const R = {
    type: "rental_97_5",
    registrationDate: D("2018-12-01"),
    rentalStartDate: D("2018-12-01"),
    isTaxRegistered: true,
    officialPriceAtStart: 300_000_000,
    stdPriceAtRentalStart: 300_000_000,
    region: "capital",
    rentalContinuesToTransfer: true,
  };

  it("🔴 true면 적용된다 — router를 통과했다는 뜻", () => {
    const r = evaluateRental97TaxAmount([{ ...R, isNationalHousingScale: true }] as Any, CTX as Any);
    expect(r?.isEligible, "⑬ router 명시매핑이 필드를 stripping했다").toBe(true);
  });

  it("false면 적용되지 않는다 (구별력)", () => {
    const r = evaluateRental97TaxAmount([{ ...R, isNationalHousingScale: false }] as Any, CTX as Any);
    expect(r?.isEligible).toBe(false);
  });
});
