/**
 * anchor: 조특령 §97의3③**4호**(임대개시일 기준시가 6억/3억 한도)의 **시기 적용례**
 *         — 대통령령 제29241호 부칙 §2 (2026-09-02)
 *
 * ── 결함 ───────────────────────────────────────────────────────────
 * `checkRental973Clause24`는 4호를 **무조건** 적용했다. 그 함수 헤더는 「4호의 **시기 적용례**
 * (신설 시점·부칙)는 확인하지 못했다 … 별건으로 확인할 것」으로 스스로 미확인을 적어 두고
 * 있었다 — 확인 없이 적용하는 쪽이 **납세자 불리 소급**이다.
 *
 * ── 근거 (실측) ────────────────────────────────────────────────────
 * **연혁**: 6억(수도권 밖 3억) 한도는 **대통령령 제29241호**(2018.10.23 공포·시행)에서 신설.
 *   법제처 `target=eflaw` 전 시행본 대조 — 직전 계열(2014.2.21~)에는 그 문언이 없다.
 *
 * **부칙 §2** (같은 영):
 *   ① 「제97조의3제3항제4호의 개정규정은 **이 영 시행 이후 양도하는 분**부터 적용한다.」
 *   ② 「다음 각 호의 어느 하나에 해당하는 경우에는 제97조의3제3항제4호의 개정규정 및 이 조
 *      제1항에도 불구하고 **종전의 규정에 따른다**.
 *      1. **2018년 9월 13일 이전에 주택**(주택을 취득할 수 있는 권리를 포함한다)**을 취득한 경우**
 *      2. 2018년 9월 13일 이전에 주택을 취득하기 위하여 **매매계약을 체결하고 계약금을 지급**한
 *         사실이 증빙서류에 의하여 확인되는 경우」
 *
 * ── 세액 스테이크 ──────────────────────────────────────────────────
 * 4호는 §97의3(장기보유특별공제율 **70% 대체**)과 §97의5(**100% 세액감면**) 둘 다의
 * 진입 요건이다(§97의5①3호가 §97의3①2호를 준용 — CA-01). 부칙 예외 구간에서 잘못 걸리면
 * 그 특례를 **통째로** 잃는다. 실측: 기준시가 7억·임대 10년 사안에서
 * `OFFICIAL_PRICE_EXCEEDED`가 **단독 배제 사유**였다.
 *
 * ── ⚠️ 부칙②2호는 판정하지 않는다 ────────────────────────────────
 * 「매매계약 체결 + 계약금 지급」 사실을 담는 입력 필드가 없다. `contractDate`는 §99·§99의3·
 * §98 시리즈의 **시한 판정용 분양/매매계약일**이라 의미가 달라 전용하지 않는다.
 * 대신 해당 가능 구간에서 배제 메시지에 안내를 덧붙여 **침묵하지 않는다**(C4-7).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { isClause4Applicable } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";

/**
 * ⚠️ **`T00:00:00`을 붙이지 않는다.** 프로덕션 경로(`lib/api/date-coerce.ts` `toDate`)가
 * `new Date("YYYY-MM-DD")` = **UTC 자정**으로 파싱하고, 부칙 상수도 같은 형태다.
 * 로컬 자정(`T00:00:00`)을 쓰면 KST(+9)에서 **경계일 하루가 어긋나** C4-1·C4-2가 거짓 실패한다.
 */
const D = (s: string) => new Date(s);

/** 기준시가 7억(수도권 한도 6억 초과) · 임대 10년 — 4호 외 요건은 모두 충족시킨 픽스처 */
function input(over: Record<string, unknown> = {}) {
  return {
    type: "rental_97_3" as const,
    registrationDate: D("2010-03-01"),
    rentalStartDate: D("2010-04-01"),
    isTaxRegistered: true,
    isNationalHousingScale: true,
    officialPriceAtStart: 700_000_000,
    region: "capital" as const,
    acquisitionDate: D("2010-01-01"),
    transferDate: D("2020-06-01"),
    rentHistory: [],
    stdPriceAtAcquisition: 400_000_000,
    stdPriceAtRentalStart: 400_000_000,
    stdPriceAtTransfer: 900_000_000,
    rentalContinuesToTransfer: true,
    ...over,
  };
}
const codes = (r: ReturnType<typeof evaluateRental973>) =>
  r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code);

describe("§97의3③4호 부칙 게이트 — 술어 단위", () => {
  it("C4-1: 시행일(2018-10-23) 전 양도 → 미적용 (부칙 §2①)", () => {
    expect(isClause4Applicable({ transferDate: D("2018-10-22") })).toBe(false);
    expect(isClause4Applicable({ transferDate: D("2018-10-23") })).toBe(true);
  });

  it("C4-2: 2018-09-13 **이전** 취득 → 미적용 (부칙 §2②1호) · 9-14는 적용", () => {
    const t = { transferDate: D("2020-06-01") };
    expect(isClause4Applicable({ ...t, acquisitionDate: D("2018-09-13") })).toBe(false);
    expect(isClause4Applicable({ ...t, acquisitionDate: D("2018-09-14") })).toBe(true);
  });

  it("C4-3: 취득일 미제공이면 원칙(①)대로 적용한다 — 부칙②1호를 성립시킬 수 없다", () => {
    expect(isClause4Applicable({ transferDate: D("2020-06-01") })).toBe(true);
  });
});

describe("§97의3③4호 부칙 게이트 — 평가 결과", () => {
  it("C4-4: 🔴 취득 2010 · 양도 2020 → 한도 7억이어도 적격 (종전 규정 · 부칙②1호)", () => {
    const r = evaluateRental973(input() as never);
    expect(codes(r)).not.toContain("OFFICIAL_PRICE_EXCEEDED");
    expect(r.isEligible).toBe(true);
  });

  it("C4-5: 🔴 시행일 전 양도(2018-10-01) → 적격 (부칙 §2①)", () => {
    const r = evaluateRental973(input({ transferDate: D("2018-10-01") }) as never);
    expect(codes(r)).not.toContain("OFFICIAL_PRICE_EXCEEDED");
    expect(r.isEligible).toBe(true);
  });

  it("C4-6: 부칙 예외 밖(취득 2019-01-01 · 양도 2020) → 4호가 정당하게 배제한다", () => {
    const r = evaluateRental973(input({ acquisitionDate: D("2019-01-01") }) as never);
    expect(codes(r)).toContain("OFFICIAL_PRICE_EXCEEDED");
    expect(r.isEligible).toBe(false);
  });

  it("C4-7: 부칙②2호 해당 가능 구간에서는 배제 메시지가 그 사실을 고지한다 (침묵 금지)", () => {
    const r = evaluateRental973(input({ acquisitionDate: D("2019-01-01") }) as never);
    const msg = r.isEligible
      ? ""
      : r.ineligibleReasons.find((x) => x.code === "OFFICIAL_PRICE_EXCEEDED")?.message ?? "";
    expect(msg).toContain("2018.9.13. 이전에 매매계약을 체결하고 계약금을 지급");
    expect(msg).toContain("부칙 §2②2호");
  });

  it("C4-8: 🔑 4호 미적용 구간에서는 **기준시가 미입력도 문제 삼지 않는다**", () => {
    // 종전 규정에 그 요건이 없었으므로 값을 요구할 근거도 없다.
    const r = evaluateRental973(input({ officialPriceAtStart: undefined }) as never);
    expect(codes(r)).not.toContain("MISSING_OFFICIAL_PRICE");
    expect(r.isEligible).toBe(true);
  });

  it("C4-9: 반대로 4호 적용 구간에서는 미입력을 차단한다 (자동 fallback 금지)", () => {
    const r = evaluateRental973(
      input({ acquisitionDate: D("2019-01-01"), officialPriceAtStart: undefined }) as never,
    );
    expect(codes(r)).toContain("MISSING_OFFICIAL_PRICE");
  });

  it("C4-10: 2호(국민주택규모)는 부칙 대상이 아니다 — 미적용 구간에서도 검증된다", () => {
    // 부칙②이 지목하는 것은 「제97조의3제3항**제4호**의 개정규정」뿐이다.
    const r = evaluateRental973(input({ isNationalHousingScale: false }) as never);
    expect(codes(r)).toContain("NOT_NATIONAL_HOUSING_SCALE");
  });
});
