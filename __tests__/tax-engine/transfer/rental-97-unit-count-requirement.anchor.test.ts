/**
 * anchor — §97·§97의2 **주체 요건(임대 호수)** (D1-01 · D1-02)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특령 §97①** — 「법 제97조제1항 각 호 외의 부분 본문에서 "대통령령으로 정하는 거주자"란
 * 임대주택을 **5호 이상** 임대하는 거주자를 말한다. 이 경우 임대주택을 여러 사람이 공동으로
 * 소유한 경우에는 공동으로 소유하고 있는 임대주택의 호수에 지분비율을 곱하여 호수를 산정한다.」
 *
 * **조특령 §97⑤4호** — 「**5호 미만**의 주택을 임대한 기간은 주택임대기간으로 보지 아니할 것」
 *
 * **조특령 §97의2①** — 「법 제97조의2제1항 각 호 외의 부분에서 "대통령령으로 정하는 거주자"란
 * **1호 이상의 신축임대주택**…**을 포함하여 2호 이상**의 임대주택을 5년 이상 임대하는 거주자를
 * 말한다.」
 *
 * ## 결함
 * 두 조문의 주체 요건이 **어느 계층에도 없었다** — 타입·Zod·폼·UI 모두 호수 필드가 없어
 * 1호만 임대한 거주자도 §97 50%(단서 100%)·§97의2 100%를 그대로 받았다.
 *
 * ## 요건이 둘로 갈린다 — 한 필드로 합치지 않는다
 * ①은 **주체 요건**(감면 대상자인가), ⑤4호는 **기간 요건**(그 기간이 임대기간인가)이다.
 * 지금 5호 이상이어도 3호였던 기간은 임대기간에서 빠지므로 입력이 둘 필요하다.
 *
 * ⚠️ §97의2에는 ⑤4호를 적용하지 않는다 — §97의2②의 준용(「§97②~⑥」)을 문자대로 읽으면
 *    「5호 미만 기간 불산입」이 §97의2의 「2호 이상」 요건과 정면으로 충돌해 조문이 통째로
 *    무력화된다(성질에 반하는 준용).
 *
 * ⚠️ 이 결함은 저장소 자신의 anchor가 고정하고 있었다 —
 *    `rental-97-evaluators.test.ts`의 케이스 #1·#4·#7이 호수 입력 없이 감면을 단언했다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental97Main } from "@/lib/tax-engine/transfer-reductions/rental-97-main";
import { evaluateRental972 } from "@/lib/tax-engine/transfer-reductions/rental-97-2";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(`${s}T00:00:00`);

const MAIN = {
  id: "rental_97_main" as const,
  transferDate: D("2005-06-01"),
  acquisitionDate: D("1995-03-01"),
  rentalStartDate: D("1996-01-01"),
  constructionYear: 1993,
  isNationalHousing: true,
  calculatedTax: 10_000_000,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runMain = (o: Record<string, unknown>) => evaluateRental97Main({ ...MAIN, ...o } as any);

describe("§97① — 5호 이상 임대하는 거주자", () => {
  it("기준선: 5호 이상 확인 시 50% 감면", () => {
    const r = runMain({ hasMin5RentalUnits: true });
    expect(r.isEligible).toBe(true);
    expect((r as { reductionAmount?: number }).reductionAmount).toBe(5_000_000);
  });

  it("🔴 「미해당(5호 미만)」이면 감면 0 — 대통령령상 거주자가 아니다", () => {
    const r = runMain({ hasMin5RentalUnits: false });
    expect(r.isEligible).toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("BELOW_MIN_5_UNITS");
  });

  it("🔴 미입력을 「충족」으로 읽지 않는다 — 조용히 감면되면 안 된다", () => {
    const r = runMain({});
    expect(r.isEligible, "미입력이 통과하면 1호 임대자도 감면받는다").toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("BELOW_MIN_5_UNITS");
  });

  it("불적용 사유의 근거는 시행령이다 (법 §97①이 아니라 조특령 §97①)", () => {
    const r = runMain({ hasMin5RentalUnits: false });
    const reason = r.isEligible
      ? undefined
      : (r.ineligibleReasons ?? []).find((x) => x.code === "BELOW_MIN_5_UNITS");
    expect(reason?.legalBasis).toBe("조특령 §97①");
  });
});

describe("§97⑤4호 — 5호 미만으로 임대한 기간은 임대기간이 아니다", () => {
  // 임대 1996-01-01 ~ 양도 2001-03-01 = 5년 + 60일. 90일을 빼면 5년 미달.
  const base = { ...MAIN, transferDate: D("2001-03-01"), hasMin5RentalUnits: true };

  it("기준선: 5호 미만 기간이 없으면 5년을 채운다", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(evaluateRental97Main(base as any).isEligible).toBe(true);
  });

  it("🔴 3개월간 4호였던 기간을 차감하면 5년 미달 → 감면 배제", () => {
    const r = evaluateRental97Main({
      ...base,
      belowMin5UnitsPeriods: [{ startDate: D("1997-01-01"), endDate: D("1997-04-01") }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(r.isEligible).toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("RENTAL_PERIOD_SHORT");
  });

  it("🔴 공실과 달리 **유예가 없다** — 2개월 구간도 차감된다", () => {
    // 같은 길이(61일)를 공실로 넣으면 3월 유예 이내라 차감되지 않는다.
    const asVacancy = evaluateRental97Main({
      ...base,
      vacancyPeriods: [{ startDate: D("1997-01-01"), endDate: D("1997-03-03") }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const asBelow5 = evaluateRental97Main({
      ...base,
      belowMin5UnitsPeriods: [{ startDate: D("1997-01-01"), endDate: D("1997-03-03") }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(asVacancy.isEligible, "공실 61일은 3월 유예 이내라 차감되지 않는다").toBe(true);
    expect(asBelow5.isEligible, "§97⑤4호에는 유예 규정이 없다").toBe(false);
  });
});

describe("§97의2① — 신축 1호 포함 2호 이상", () => {
  const BASE_972 = {
    id: "rental_97_2" as const,
    transferDate: D("2006-06-01"),
    acquisitionDate: D("2000-03-01"),
    contractDate: D("2000-02-01"),
    rentalStartDate: D("2000-04-01"),
    rental972Type: "purchase" as const,
    isNationalHousing: true,
    isUnoccupiedAtAcquisition: true, // D1-07 — §97의2①2호
    calculatedTax: 20_000_000,
  };

  it("기준선: 해당 확인 시 100% 면제", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = evaluateRental972({ ...BASE_972, hasNewRentalPlus2Units: true } as any);
    expect(r.isEligible).toBe(true);
    expect((r as { reductionAmount?: number }).reductionAmount).toBe(20_000_000);
  });

  it("🔴 신축임대 1호만이면 감면 0 (미해당)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = evaluateRental972({ ...BASE_972, hasNewRentalPlus2Units: false } as any);
    expect(r.isEligible).toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("BELOW_MIN_2_UNITS_WITH_NEW");
  });

  it("🔴 미입력도 배제한다", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(evaluateRental972({ ...BASE_972 } as any).isEligible).toBe(false);
  });

  it("§97의 5호 필드로는 충족되지 않는다 — 다른 조문·다른 숫자", () => {
    const r = evaluateRental972({
      ...BASE_972,
      hasMin5RentalUnits: true, // §97 필드를 넣어도 §97의2는 통과하면 안 된다
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(r.isEligible).toBe(false);
  });
});

describe("⑫ Zod가 신규 필드를 통과시킨다", () => {
  /**
   * ⚠️ 위 엔진 anchor는 evaluator를 **직접** 호출하므로 Zod 층 아래에서 시작한다.
   *    ⑫의 침묵 stripping은 스키마를 직접 태워야 잡힌다
   *    (memory `feedback_leaf_anchor_skips_zod_layer`).
   */
  it("§97: hasMin5RentalUnits · belowMin5UnitsPeriods가 parse 후에도 살아남는다", () => {
    const parsed = reductionSchema.parse({
      type: "rental_97_main",
      hasMin5RentalUnits: true,
      belowMin5UnitsPeriods: [{ startDate: "1997-01-01", endDate: "1997-04-01" }],
    }) as Record<string, unknown>;
    expect(parsed.hasMin5RentalUnits, "⑫가 5호 확인 필드를 stripping했다").toBe(true);
    expect(parsed.belowMin5UnitsPeriods, "⑫가 5호 미만 기간을 stripping했다").toHaveLength(1);
  });

  it("§97의2: hasNewRentalPlus2Units가 parse 후에도 살아남는다", () => {
    const parsed = reductionSchema.parse({
      type: "rental_97_2",
      hasNewRentalPlus2Units: true,
    }) as Record<string, unknown>;
    expect(parsed.hasNewRentalPlus2Units).toBe(true);
  });
});

describe("⑬ router 명시매핑 — 신규 필드가 evaluator까지 도달한다", () => {
  /**
   * ⚠️ 위 엔진 anchor는 `evaluateRental97Main`을 **직접** 호출하므로
   *    `rental-97-router.ts`의 `buildInput`을 타지 않는다. 그 case는 **명시 매핑**이라
   *    적지 않은 키를 조용히 버린다(memory `feedback_explicit_prop_mapping_strip`) —
   *    실제로 이번 작업에서 그 stripping이 발생했고, 진입점을 `calculateTransferTax`로
   *    잡은 anchor만이 잡아냈다. 그 층을 이 파일에서도 직접 고정한다.
   */
  const rates = makeMockRates();

  function run(hasMin5: boolean | undefined) {
    return calculateTransferTax(
      baseTransferInput({
        transferPrice: 500_000_000,
        transferDate: new Date("2005-06-01"),
        acquisitionPrice: 200_000_000,
        acquisitionDate: new Date("1995-03-01"),
        isOneHousehold: false,
        householdHousingCount: 2,
        reductions: [
          {
            type: "rental_97_main",
            constructionYear: 1993,
            isNationalHousing: true,
            rentalStartDate: new Date("1996-01-01"),
            isTaxRegistered: true,
            ...(hasMin5 === undefined ? {} : { hasMin5RentalUnits: hasMin5 }),
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      rates,
    );
  }

  it("🔴 5호 이상이면 §97 감면이 적용된다 — 필드가 router를 통과했다는 뜻", () => {
    const r = run(true);
    expect(r.reductionTypeApplied, "⑬ router 명시매핑이 필드를 stripping했다").toBe(
      "rental_97_main",
    );
    expect(r.reductionAmount).toBeGreaterThan(0);
  });

  it("미해당이면 감면이 적용되지 않는다 (구별력)", () => {
    expect(run(false).reductionAmount ?? 0).toBe(0);
  });

  it("미입력도 적용되지 않는다", () => {
    expect(run(undefined).reductionAmount ?? 0).toBe(0);
  });
});
