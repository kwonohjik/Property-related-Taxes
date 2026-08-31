/**
 * anchor — 3~6개월 공실이 **입력 계층을 통과해 세액을 움직인다** (D1-03 배관)
 *
 * 자매 anchor `rental-97-vacancy-grace-by-article.anchor.test.ts`는 순수 헬퍼만 고정한다.
 * 그것만으로는 **제품이 no-op**일 수 있다 — 리뷰가 지적한 그대로다:
 *
 *   종전 ⑤UI는 「6개월 이상 공실 구간」만 물었고 ④API 변환은 그 플래그가 true일 때만
 *   `vacancyPeriods`를 보냈다. 즉 4개월 공실은 **엔진에 도달조차 못 했다**.
 *   ⇒ 상수만 3월로 바꾸면 계산은 맞아지지만 사용자가 그 사실을 입력할 방법이 없어
 *     세액은 1원도 변하지 않는다.
 *
 * 그래서 이 파일은 ④변환 → 엔진 평가까지의 **경로**를 고정한다.
 * ⑤UI 질문 문구(「3개월을 초과하는 공실 구간」)와 폼 키(`hasVacancyOverGrace`)는
 * 이 경로의 입구이고, 그 rename이 어느 계층에서 침묵 stripping되면 여기서 잡힌다.
 */
import { describe, it, expect } from "vitest";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { evaluateRental97Main } from "@/lib/tax-engine/transfer-reductions/rental-97-main";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";

const D = (s: string) => new Date(`${s}T00:00:00`);

/** 4개월 공실 — 3월 유예는 넘고 6개월 유예에는 못 미치는 「가르는 구간」 */
const VACANCY_4M = { startDate: "2001-01-01", endDate: "2001-05-01" };

describe("④ API 변환 — 유예 초과 공실이 엔진 payload에 실린다", () => {
  function convert(hasVacancy: boolean) {
    const [out] = toEngineReductions(
      [
        {
          type: "rental_97_main",
          registrationDate: "",
          rentalStartDate: "1999-01-01",
          isTaxRegistered: true,
          rentIncreaseViolationMode: "none",
          hasVacancyOverGrace: hasVacancy,
          vacancyPeriods: [VACANCY_4M],
          constructionYear: "1998",
          isNationalHousing: true,
          hasMin5RentalUnits: true,
          belowMin5UnitsPeriods: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
      "purchase",
    );
    return out as Record<string, unknown>;
  }

  it("🔴 「있음」 선택 시 4개월 공실 구간이 그대로 전달된다", () => {
    const r = convert(true);
    expect(r.vacancyPeriods, "④ 변환이 공실 구간을 stripping했다").toEqual([VACANCY_4M]);
  });

  it("「없음」 선택 시에는 보내지 않는다 (종전 동작 보존)", () => {
    expect(convert(false).vacancyPeriods).toBeUndefined();
  });
});

describe("🔴 엔진 — 같은 4개월 공실이 §97에서는 임대기간을 깎고 §97의5에서는 깎지 않는다", () => {
  const base = {
    rentalStartDate: D("1999-01-01"),
    acquisitionDate: D("1998-06-01"),
    transferDate: D("2004-03-01"), // 임대 5년 + 59일 — 4개월 공실을 깎으면 5년 미달
    calculatedTax: 100_000_000,
  };

  it("§97 본문: 4개월 공실 차감 → 5년 요건 미달 → 감면 배제", () => {
    const r = evaluateRental97Main({
      ...base,
      id: "rental_97_main",
      constructionYear: 1998,
      isNationalHousing: true,
      hasMin5RentalUnits: true, // 조특령 §97① 주체 요건 (D1-01)
      vacancyPeriods: [{ startDate: D(VACANCY_4M.startDate), endDate: D(VACANCY_4M.endDate) }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(r.isEligible, "3월 유예가 적용되지 않아 과다감면이 남았다").toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("RENTAL_PERIOD_SHORT");
  });

  it("대조군 — 공실이 없으면 같은 입력이 5년을 채워 적용된다 (구별력)", () => {
    const r = evaluateRental97Main({
      ...base,
      id: "rental_97_main",
      constructionYear: 1998,
      isNationalHousing: true,
      hasMin5RentalUnits: true, // 조특령 §97① 주체 요건 (D1-01)
      vacancyPeriods: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(r.isEligible).toBe(true);
    // §97 본문은 세액감면형(RentalTaxAmountEffect)이지만 결과 타입이 LTHD 효과와 union이라
    // 좁히기가 필요하다 — 값만 꺼내 단언한다.
    expect((r as { reductionAmount?: number }).reductionAmount).toBe(50_000_000);
  });

  /**
   * ⚠️ 이 케이스는 처음에 `eligibleRentalYears`를 비교했다가 **구별력 0**이었다 —
   *    요건 미충족으로 조기 이탈해 양쪽 다 `undefined`였고 `undefined === undefined`로 통과했다.
   *    (memory `feedback_leaf_anchor_skips_zod_layer`와 같은 층위: 측정 대상이 틀렸다.)
   *    ⇒ 요건을 모두 채워 **적용 여부 자체가 공실로 갈리도록** 다시 세웠다.
   */
  const BASE_97_5 = {
    id: "rental_97_5" as const,
    acquisitionDate: D("2018-01-01"),
    registrationDate: D("2018-03-01"), // 취득 후 3개월 이내
    rentalStartDate: D("2018-03-01"), // 취득일 이후지만 기준시가 3점으로 안분
    transferDate: D("2028-05-01"), // 임대 10년 + 61일
    isTaxRegistered: true,
    rentIncreaseViolated: false,
    isNationalHousingScale: true, // CA-01 — §97의5①3호 준용
    region: "capital" as const,
    stdPriceAtAcquisition: 300_000_000,
    officialPriceAtStart: 310_000_000,
    stdPriceAtTransfer: 500_000_000,
    calculatedTax: 100_000_000,
  };

  it("§97의5: 4개월 공실은 6개월 유예 이내라 차감하지 않는다 → 10년 유지·적용", () => {
    const r = evaluateRental975({
      ...BASE_97_5,
      vacancyPeriods: [{ startDate: D("2021-01-01"), endDate: D("2021-05-01") }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes, "§97의5에 3월 유예를 잘못 적용하면 임대기간이 깎여 배제된다").not.toContain(
      "RENTAL_PERIOD_SHORT",
    );
    expect(r.isEligible).toBe(true);
  });

  it("§97의5: 7개월 공실은 6개월 유예를 넘어 차감된다 → 10년 미달·배제 (구별력)", () => {
    const r = evaluateRental975({
      ...BASE_97_5,
      vacancyPeriods: [{ startDate: D("2021-01-01"), endDate: D("2021-08-01") }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(r.isEligible).toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("RENTAL_PERIOD_SHORT");
  });
});
