/**
 * anchor: §97의3⑤·§97의5② 안분 기준시가 — 감면-수준 override + 자산-수준 폴백 (Q10).
 *
 * 조특령 §97의3⑤의 안분은 취득시(E)·양도시(D) 기준시가를 요구한다. 그런데 자산-수준
 * 기준시가의 전송 조건은 두 시점이 **다르다**(`transfer-tax-api.ts` 실측) — 취득시는 추계
 * 또는 분리(§166⑥) 모드, 양도시는 **추계 모드만**이다 —
 * 실지거래가액 모드에서는 ctx가 비어 `calcRentalGainRatio`가 null을 돌려주고, §97의3이
 * `MISSING_PRORATION_PRICES`로 **전액 불적용**됐다. 채울 칸 자체가 없었다.
 *
 * ⚠️ 자산-수준 전송 조건을 넓히지 않는다 — 그 값은 §164⑧·개산공제·§166⑥ 분리 안분의
 *    입력이라 무관한 경로의 세액이 함께 움직인다. 감면-수준 override + `?? ctx` 폴백이다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental97Lthd } from "@/lib/tax-engine/transfer-reductions/rental-97-router";
import type { TransferReduction } from "@/lib/tax-engine/types/transfer.types";

const BASE = {
  type: "rental_97_3" as const,
  registrationDate: new Date("2015-03-02"),
  rentalStartDate: new Date("2016-01-05"), // 취득일보다 늦다 → 안분 필요
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  rentalContinuesToTransfer: true,
  officialPriceAtStart: 400_000_000,
  isNationalHousingScale: true,
  region: "capital" as const,
  rentalHousingType: "long_term_private" as const,
  isConvertedFromShortTerm: false,
  isPrivateConstructionRental: false,
  stdPriceAtRentalStart: 500_000_000,
};

const CTX = {
  transferDate: new Date("2027-03-10"),
  acquisitionDate: new Date("2015-02-01"),
};

function run(reduction: Record<string, unknown>, ctx: Record<string, unknown> = {}) {
  return evaluateRental97Lthd([reduction as unknown as TransferReduction], {
    ...CTX,
    ...ctx,
  });
}

function prorationMissing(result: ReturnType<typeof run>): boolean {
  if (!result || result.isEligible) return false;
  return result.ineligibleReasons.some((r) => r.code === "MISSING_PRORATION_PRICES");
}

/** 적용 성립 시의 안분비율 (불성립이면 null) */
function ratioOf(result: ReturnType<typeof run>): number | null {
  if (!result || !result.isEligible) return null;
  return "rentalGainRatio" in result ? (result.rentalGainRatio as number) : null;
}

describe("§97의3⑤ 안분 기준시가 — 감면-수준 override", () => {
  it("🔴 자산-수준도 감면-수준도 없으면 종전처럼 안분 불성립 사유가 뜬다", () => {
    expect(prorationMissing(run(BASE))).toBe(true);
  });

  it("🔑 감면-수준 override만 있어도 안분이 성립한다 (실지거래가액 모드 구제)", () => {
    const r = run({
      ...BASE,
      stdPriceAtAcquisition: 400_000_000,
      stdPriceAtTransfer: 800_000_000,
    });
    expect(prorationMissing(r)).toBe(false);
  });

  it("자산-수준(ctx)만 있어도 종전대로 성립한다 (폴백 유지)", () => {
    const r = run(BASE, {
      stdPriceAtAcquisition: 400_000_000,
      stdPriceAtTransfer: 800_000_000,
    });
    expect(prorationMissing(r)).toBe(false);
  });

  it("🔑 둘 다 있으면 감면-수준이 이긴다 — 비율이 override 값으로 계산된다", () => {
    // E=400M·D=800M·C(임대개시)=500M → (800−500)/(800−400) = 0.75
    const withOverride = run(
      { ...BASE, stdPriceAtAcquisition: 400_000_000, stdPriceAtTransfer: 800_000_000 },
      { stdPriceAtAcquisition: 100_000_000, stdPriceAtTransfer: 900_000_000 },
    );
    // ctx만 쓰면 (900−500)/(900−100) = 0.5 로 달라진다.
    const ctxOnly = run(BASE, {
      stdPriceAtAcquisition: 100_000_000,
      stdPriceAtTransfer: 900_000_000,
    });
    expect(ratioOf(withOverride)).toBeCloseTo(0.75, 6);
    expect(ratioOf(ctxOnly)).toBeCloseTo(0.5, 6);
  });
});
