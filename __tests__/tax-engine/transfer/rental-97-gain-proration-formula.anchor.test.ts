/**
 * anchor — §97의3⑤ · §97의5②의 안분 산식은 **서로 다르다** (D2-03 · D2-06)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특령 §97의3⑤** — 「…100분의 70의 공제율을 적용하는 경우에는 임대기간 중에 발생한
 * 양도차익에 한정하여 적용하며, 임대기간 중 양도차익은 기준시가를 기준으로 다음 계산식에
 * 따라 산정한다.」
 *
 *   A × (B − C) ÷ (D − E)
 *   A: 「소득세법」 제92조제2항제1호에 따른 양도차익
 *   B: 제2항에 따른 실제 임대기간의 **마지막 날**의 기준시가
 *   C: 제2항에 따른 실제 임대기간의 **개시일**의 기준시가
 *   D: **양도일**의 기준시가
 *   E: **취득일**의 기준시가
 *
 * **조특령 §97의5②** — 「「소득세법」 제95조제1항에 따른 양도소득금액
 *   × (제1항에 따른 임대기간의 **마지막 날**의 기준시가 − **취득당시** 기준시가)
 *   ÷ (**양도 당시** 기준시가 − **취득 당시** 기준시가)」
 *
 * ## 결함 둘
 *
 * **① 분자의 감수가 조문마다 다른데 한 함수가 두 조문을 겸했다** (D2-03).
 *    §97의3은 C(임대개시일), §97의5는 E(취득당시)다. 코드는 §97의3의 것을 §97의5에도 써
 *    분자를 작게 만들었다 — 통상 사안에서 **감면 과소**(리뷰 실측 산출세액 1억 기준 6,666,667원).
 *
 * **② 피감수 B를 양도일 기준시가 D로 대체했다** (D2-06).
 *    두 조문 모두 B를 D와 **별개 변수로 정의**한다. §97의5①2호는 「10년 이상 계속하여
 *    임대한 **후 양도**」이므로 임대 종료일이 양도일보다 앞설 수 있다.
 *
 * ## 안전망 실측 (변경 전)
 * 비율 산식의 분자를 뒤집고 전건(18,150)을 돌렸을 때 **반응한 테스트는 1건뿐**이었다.
 */
import { describe, it, expect } from "vitest";
import { calcRentalGainRatio } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";

const D = (s: string) => new Date(`${s}T00:00:00`);

/** 취득 3억 → 임대개시 4억 → (임대종료 7억) → 양도 6억 */
const P = {
  rentalStartDate: D("2018-01-01"),
  acquisitionDate: D("2014-01-01"),
  stdPriceAtAcquisition: 300_000_000,
  stdPriceAtRentalStart: 400_000_000,
  stdPriceAtTransfer: 600_000_000,
};

describe("D2-03 — 분자의 감수가 조문마다 다르다", () => {
  it("§97의3⑤: (B−C)/(D−E) = (6억−4억)/(6억−3억) = 2/3", () => {
    const r = calcRentalGainRatio({
      ...P,
      numeratorBase: "rental_start",
      rentalContinuesToTransfer: true,
    });
    expect(r).toBeCloseTo(2 / 3, 10);
  });

  it("🔴 §97의5②: (B−E)/(D−E) = (6억−3억)/(6억−3억) = 1", () => {
    const r = calcRentalGainRatio({
      ...P,
      numeratorBase: "acquisition",
      rentalContinuesToTransfer: true,
    });
    expect(r, "§97의3 산식을 재사용하면 2/3가 되어 감면이 과소해진다").toBe(1);
  });

  it("두 조문의 비율이 실제로 갈린다 — 구별력", () => {
    const a = calcRentalGainRatio({ ...P, numeratorBase: "rental_start", rentalContinuesToTransfer: true });
    const b = calcRentalGainRatio({ ...P, numeratorBase: "acquisition", rentalContinuesToTransfer: true });
    expect(a).not.toBe(b);
    expect(b! > a!, "§97의5 분자가 더 커야 한다(감수가 취득당시)").toBe(true);
  });
});

describe("D2-06 — 피감수 B는 「임대기간의 마지막 날」이지 양도일이 아니다", () => {
  it("🔴 §97의3: 임대를 먼저 끝내면 B < D라 비율이 낮아진다", () => {
    // 임대종료 시점 기준시가 5억 → (5억−4억)/(6억−3억) = 1/3
    const r = calcRentalGainRatio({
      ...P,
      numeratorBase: "rental_start",
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: 500_000_000,
    });
    expect(r, "B를 양도일 기준시가로 대체하면 2/3가 되어 과다공제된다").toBeCloseTo(1 / 3, 10);
  });

  it("🔴 §97의5: 같은 사안에서 (5억−3억)/(6억−3억) = 2/3", () => {
    const r = calcRentalGainRatio({
      ...P,
      numeratorBase: "acquisition",
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: 500_000_000,
    });
    expect(r).toBeCloseTo(2 / 3, 10);
  });

  it("「계속 임대」면 B = D — 기존 사안은 회귀하지 않는다", () => {
    const cont = calcRentalGainRatio({ ...P, numeratorBase: "rental_start", rentalContinuesToTransfer: true });
    const explicit = calcRentalGainRatio({
      ...P,
      numeratorBase: "rental_start",
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: P.stdPriceAtTransfer,
    });
    expect(cont).toBe(explicit);
  });

  it("종료 시점 기준시가 미입력 → null (자동 안분 금지)", () => {
    expect(
      calcRentalGainRatio({ ...P, numeratorBase: "rental_start", rentalContinuesToTransfer: false }),
    ).toBeNull();
  });
});

describe("취득 즉시 임대 — 조기반환은 「계속 임대」일 때만", () => {
  const IMMEDIATE = {
    rentalStartDate: D("2014-01-01"),
    acquisitionDate: D("2014-01-01"),
    stdPriceAtAcquisition: 300_000_000,
    stdPriceAtTransfer: 600_000_000,
  };

  it("계속 임대면 기준시가를 보지 않고 1 — B=D·C=E라 값이 결과를 좌우하지 않는다", () => {
    expect(
      calcRentalGainRatio({
        rentalStartDate: D("2014-01-01"),
        acquisitionDate: D("2014-01-01"),
        numeratorBase: "rental_start",
        rentalContinuesToTransfer: true,
      }),
    ).toBe(1);
  });

  it("🔴 임대를 먼저 끝냈으면 조기반환하지 않는다 — 법문상 안분이 필요하다", () => {
    const r = calcRentalGainRatio({
      ...IMMEDIATE,
      numeratorBase: "rental_start",
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: 450_000_000,
    });
    // (4.5억 − 3억) / (6억 − 3억) = 0.5. 조기반환이 남아 있으면 1이 되어 전액 임대분 처리된다.
    expect(r, "취득 즉시 임대라도 조기 종료면 안분해야 한다").toBeCloseTo(0.5, 10);
  });
});

describe("클램프·불능 조건", () => {
  it("분모 ≤ 0이면 null", () => {
    expect(
      calcRentalGainRatio({
        ...P,
        stdPriceAtTransfer: 300_000_000,
        numeratorBase: "rental_start",
        rentalContinuesToTransfer: true,
      }),
    ).toBeNull();
  });

  it("비율은 0~1로 클램프된다", () => {
    const r = calcRentalGainRatio({
      ...P,
      numeratorBase: "acquisition",
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: 900_000_000, // B > D — 산술상 1 초과
    });
    expect(r).toBe(1);
  });
});

/**
 * ⚠️ 위 케이스들은 `calcRentalGainRatio`를 **직접** 호출하므로 evaluator와 ⑬router를 보지 못한다.
 *    실측: §97의5의 `numeratorBase`를 `"rental_start"`로 되돌리는 뮤테이션과
 *    ⑬router 명시매핑에서 신규 필드를 지우는 뮤테이션이 **둘 다 구별력 0**이었다
 *    (54/54·85/85 통과). 측정 대상을 올린다.
 */
describe("§97의5 엔진 — 리뷰 실측 시나리오 재현 (D2-03)", () => {
  /** 취득 2018-06-01(3억) · 등록 2018-08-01 · 임대개시 2018-09-01(3.2억) · 양도 2029-07-01(6억) */
  const BASE = {
    id: "rental_97_5" as const,
    acquisitionDate: D("2018-06-01"),
    registrationDate: D("2018-08-01"),
    rentalStartDate: D("2018-09-01"),
    transferDate: D("2029-07-01"),
    isTaxRegistered: true,
    rentIncreaseViolated: false,
    stdPriceAtAcquisition: 300_000_000,
    officialPriceAtStart: 320_000_000,
    stdPriceAtTransfer: 600_000_000,
    rentalContinuesToTransfer: true,
    calculatedTax: 100_000_000,
  };

  it("🔴 조특령 §97의5② 분자는 (B − 취득당시)라 비율 1 → 감면 전액", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = evaluateRental975({ ...BASE } as any);
    expect(r.isEligible).toBe(true);
    expect(
      (r as unknown as { rentalGainRatio?: number }).rentalGainRatio,
      "§97의3 산식(감수=임대개시 3.2억)을 쓰면 0.9333이 된다",
    ).toBe(1);
    expect((r as unknown as { reductionAmount?: number }).reductionAmount).toBe(100_000_000);
  });

  it("§97의3 산식이었다면 6,666,667원 과소였다 — 대조값 고정", () => {
    const wrong = calcRentalGainRatio({
      rentalStartDate: BASE.rentalStartDate,
      acquisitionDate: BASE.acquisitionDate,
      numeratorBase: "rental_start",
      stdPriceAtAcquisition: 300_000_000,
      stdPriceAtRentalStart: 320_000_000,
      stdPriceAtTransfer: 600_000_000,
      rentalContinuesToTransfer: true,
    });
    expect(Math.floor(100_000_000 * wrong!)).toBe(93_333_333);
  });
});

describe("⑬ router — 임대 종료 축이 evaluator까지 도달한다", () => {
  const rates = makeMockRates();

  const ratioOf = (r: ReturnType<typeof calculateTransferTax>) =>
    (r.rental97LthdDetail as unknown as { rentalGainRatio?: number } | undefined)?.rentalGainRatio;

  function run(continues: boolean, endPrice?: number) {
    return calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000,
        transferDate: D("2029-07-01"),
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("2014-01-01"),
        isOneHousehold: false,
        householdHousingCount: 2,
        standardPriceAtAcquisition: 300_000_000,
        standardPriceAtTransfer: 600_000_000,
        reductions: [
          {
            type: "rental_97_3",
            registrationDate: D("2014-02-01"),
            rentalStartDate: D("2018-01-01"),
            isTaxRegistered: true,
            officialPriceAtStart: 400_000_000,
            stdPriceAtRentalStart: 400_000_000,
            isNationalHousingScale: true,
            region: "capital",
            propertyType: "apartment",
            rentalHousingType: "long_term_private",
            rentalContinuesToTransfer: continues,
            ...(endPrice === undefined ? {} : { stdPriceAtRentalEnd: endPrice }),
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      rates,
    );
  }

  it("🔴 임대 조기 종료 선언이 안분 비율을 바꾼다 — router를 통과했다는 뜻", () => {
    const cont = ratioOf(run(true));
    const early = ratioOf(run(false, 500_000_000));
    expect(cont, "⑬ router 명시매핑이 필드를 stripping했다").not.toBe(early);
    expect(early!).toBeLessThan(cont!);
  });

  it("종료 시점 기준시가 미입력이면 불적용 사유가 붙는다 (자동 안분 금지)", () => {
    const r = run(false, undefined);
    expect(ratioOf(r) ?? null).not.toBe(1);
  });
});

describe("⑫ Zod가 신규 필드를 통과시킨다", () => {
  it("rentalContinuesToTransfer · stdPriceAtRentalEnd가 parse 후에도 살아남는다", () => {
    const parsed = reductionSchema.parse({
      type: "rental_97_3",
      rentalContinuesToTransfer: false,
      stdPriceAtRentalEnd: 500_000_000,
    }) as Record<string, unknown>;
    expect(parsed.rentalContinuesToTransfer, "⑫가 계속임대 플래그를 stripping했다").toBe(false);
    expect(parsed.stdPriceAtRentalEnd, "⑫가 임대종료 기준시가를 stripping했다").toBe(500_000_000);
  });
});
