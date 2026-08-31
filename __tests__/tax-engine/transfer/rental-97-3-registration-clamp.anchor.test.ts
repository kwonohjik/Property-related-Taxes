/**
 * anchor — §97의3·§97의5 임대기간은 **등록일부터** 기산한다 (D2-02)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특령 §97의3②** — 「법 제97조의3제1항제1호에 따른 10년 이상 계속하여 임대한 경우는
 * … 공공지원민간임대주택 또는 장기일반민간임대주택…으로 **10년 이상 계속하여 등록되어 있고,
 * 그 등록 기간 동안 통산하여 10년 이상 임대한 경우**로 한다.」
 *
 * **조특령 §97의3④** — 「…「소득세법」 제168조에 따른 사업자등록과 「민간임대주택에 관한
 * 특별법」 제5조에 따른 임대사업자등록을 하고 장기일반민간임대주택등으로 **등록하여 임대하는
 * 날부터 임대를 개시한 것으로 본다**.」
 *
 * **조특령 §97의5③** — §97의3④과 같은 문언(§97의5도 같은 구조).
 * **조특령 §97의5①** — 「…장기일반민간임대주택등으로 **10년 이상 계속하여 등록하고,
 * 그 등록한 기간 동안 계속하여 10년 이상 임대한 경우**로 한다.」
 *
 * ## 결함
 * `evaluateRental973`·`evaluateRental975`가 입력된 `rentalStartDate`를 그대로 기산점으로 써서
 * **등록 이전 기간까지 10년 요건에 산입**했다. 등록 1년차에도 70% 특례(§97의3)가 통과했다.
 *
 * 리뷰 실측: 임대개시 2010-01-01 · 등록 2020-01-01(등록기간 1년) · 양도 2021-01-01,
 * 과세 양도차익 5억 → 장기보유특별공제 350,000,000원(70%). 조문상 특례 배제라 일반 표1
 * 100,000,000원이어야 한다 — **250,000,000원 과다**.
 *
 * ## 2차 과다공제가 겹쳤다
 * 조기 임대개시일 입력은 `rentalStartDate ≤ acquisitionDate`를 만들어 §97의3⑤ 안분비율을
 * 1로 고정하므로, 등록 후 임대기간분에만 적용돼야 할 특례율이 **전체 양도차익**에 적용됐다.
 *
 * ## 구현 범위 — 「계속하여 등록」은 검증하지 않는다
 * ②의 「**계속하여** 등록」(중도 말소·재등록 없음)까지 보려면 등록 말소 구간 입력이 필요한데
 * 저장소에 없다(`vacancyPeriods`는 공실이지 말소가 아니다). 없는 입력을 추정해 판정하지 않는다.
 * 기산점 클램프만으로 「등록기간 10년」 요건은 성립한다 — 등록 후 10년이 지나지 않았으면
 * 임대기간도 10년이 될 수 없다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(`${s}T00:00:00`);

const BASE_973 = {
  id: "rental_97_3" as const,
  acquisitionDate: D("2010-01-01"),
  transferDate: D("2021-01-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  officialPriceAtStart: 400_000_000,
  stdPriceAtRentalStart: 400_000_000,
  stdPriceAtAcquisition: 400_000_000,
  stdPriceAtTransfer: 900_000_000,
  isNationalHousingScale: true,
  region: "capital" as const,
  propertyType: "apartment" as const,
  rentalHousingType: "long_term_private" as const,
  rentalContinuesToTransfer: true,
};

describe("§97의3 — 등록 이전 임대기간은 산입하지 않는다 (령 §97의3④)", () => {
  it("🔴 임대개시 2010 · 등록 2020 · 양도 2021 → 등록기간 1년이라 특례 배제", () => {
    const r = evaluateRental973({
      ...BASE_973,
      rentalStartDate: D("2010-01-01"),
      registrationDate: D("2020-01-01"),
    } as Any);
    expect(r.isEligible, "등록 1년차에 70% 특례가 통과하면 안 된다").toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("RENTAL_PERIOD_SHORT");
  });

  it("기준선: 등록도 2010이면 11년이라 70% 적용", () => {
    const r = evaluateRental973({
      ...BASE_973,
      rentalStartDate: D("2010-01-01"),
      registrationDate: D("2010-01-01"),
    } as Any);
    expect(r.isEligible).toBe(true);
    expect((r as unknown as { overrideRate?: number }).overrideRate).toBe(0.7);
  });

  it("구별력 — 등록일만 옮겨도 결과가 갈린다", () => {
    const early = evaluateRental973({
      ...BASE_973, rentalStartDate: D("2010-01-01"), registrationDate: D("2010-01-01"),
    } as Any).isEligible;
    const late = evaluateRental973({
      ...BASE_973, rentalStartDate: D("2010-01-01"), registrationDate: D("2020-01-01"),
    } as Any).isEligible;
    expect(early).toBe(true);
    expect(late).toBe(false);
  });

  it("🔴 등록이 앞서면 임대개시일이 기산점이다 — max이지 등록일 고정이 아니다", () => {
    /**
     * 조특령 §97의3④는 「**등록하여 임대하는** 날부터」다 — 등록과 임대가 **둘 다** 있어야 한다.
     * 등록 2009 · 임대개시 2011-06-01 · 양도 2021-01-01이면 실제 임대는 9.6년뿐이다.
     *
     * ⚠️ 실측: 처음 이 케이스를 「등록 2009 · 임대개시 2010 · 양도 2021」로 썼더니
     *    두 기산점 모두 10년을 넘어 **구별력 0**이었다(등록일 고정 뮤테이션이 통과).
     *    임계를 가르는 값으로 바꿨다.
     */
    const r = evaluateRental973({
      ...BASE_973,
      rentalStartDate: D("2011-06-01"),
      registrationDate: D("2009-01-01"),
    } as Any);
    // 실제 임대 9년 7개월 → 10년 미달. 등록이 2023 이전이라 8년 50% 경과규정에 걸려
    // **적용은 되지만 50%**다. 등록일로 고정하면 12년이 되어 70%가 나온다.
    expect(r.isEligible).toBe(true);
    expect(
      (r as unknown as { overrideRate?: number }).overrideRate,
      "등록일로 고정하면 12년이 되어 70%가 부당 적용된다",
    ).toBe(0.5);
  });

  it("대조군 — 임대개시가 2010이면 11년이라 통과한다", () => {
    const r = evaluateRental973({
      ...BASE_973,
      rentalStartDate: D("2010-01-01"),
      registrationDate: D("2009-01-01"),
    } as Any);
    expect(r.isEligible).toBe(true);
  });

  it("8년 50% 경과규정 분기에도 같은 기산점이 적용된다", () => {
    // 등록 2015-01-01(≤2022.12.31) · 임대개시 2005 · 양도 2021 → 등록 기준 6년이라 8년 미달
    const r = evaluateRental973({
      ...BASE_973,
      rentalStartDate: D("2005-01-01"),
      registrationDate: D("2015-01-01"),
    } as Any);
    expect(r.isEligible, "8년 경과규정도 등록기간 기준이어야 한다").toBe(false);
  });
});

describe("§97의5 — 같은 구조 (령 §97의5③·§97의5①)", () => {
  const BASE_975 = {
    id: "rental_97_5" as const,
    acquisitionDate: D("2010-01-01"),
    transferDate: D("2021-01-01"),
    isTaxRegistered: true,
    rentIncreaseViolated: false,
    officialPriceAtStart: 400_000_000,
    stdPriceAtAcquisition: 400_000_000,
    stdPriceAtTransfer: 900_000_000,
    rentalContinuesToTransfer: true,
    isNationalHousingScale: true, // CA-01 — §97의5①3호 준용
    region: "capital" as const,
    calculatedTax: 100_000_000,
  };

  it("🔴 등록 2020 · 임대개시 2010 → 등록기간 1년이라 10년 요건 미달", () => {
    const r = evaluateRental975({
      ...BASE_975,
      rentalStartDate: D("2010-01-01"),
      registrationDate: D("2020-01-01"),
    } as Any);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("RENTAL_PERIOD_SHORT");
  });
});
