/**
 * anchor — §97의4① 단서: **§95② 단서(1세대1주택 표2)** 적용 시 추가공제율 배제 (D2-01 · D2-09)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특법 §97의4①** — 「…대통령령으로 정하는 주택을 6년 이상 임대한 후 양도하는 경우 그 주택을
 * 양도함으로써 발생하는 소득에 대해서는 「소득세법」 **제95조제1항**에 따른 장기보유 특별공제액을
 * 계산할 때 **같은 조 제2항**에 따른 보유기간별 공제율에 해당 주택의 임대기간에 따라 다음 표에
 * 따른 추가공제율을 더한 공제율을 적용한다. **다만, 같은 항 단서에 해당하는 경우에는 그러하지
 * 아니하다.**」
 *
 * ## 「같은 항 단서」가 어느 조항인가 — 문언으로 확정된다
 * 직전 지시어가 「같은 조 **제2항**」이므로 「같은 항」 = **소득세법 §95②**이다.
 * §95② 단서 = 「다만, 대통령령으로 정하는 **1세대 1주택**…의 경우에는 … **표 2**…」
 *
 * ⇒ 표2(보유분 40% + 거주분 40%)가 적용되는 1세대1주택 고가주택에는 §97의4 추가공제율을
 *   **가산하지 않는다**. 종전 코드는 표2 여부를 보는 분기가 아예 없어 그대로 더했다.
 *
 * ## D2-09 — 같은 축의 인용 오류
 * `rental-97-4.ts` 헤더 주석이 이 단서를 「**소득세법 §95① 단서**」로 적었다.
 * **§95①에는 단서가 없다**(한 문장). 미등기 배제는 §95② **본문 괄호**(§104③)이고
 * 이미 `transfer-tax-lthd.ts`의 L-0가 처리한다. 인용을 §95② 단서로 정정한다.
 *
 * ## 안전망 실측 (변경 전)
 * `const combined = rate + additionalRate`를 `rate`로 무력화하고 전건(18,185)을 돌렸을 때
 * **반응한 테스트는 1건뿐**이었고, 그 1건조차 `householdHousingCount: 2 // 12억 비과세 미적용`로
 * **표2를 의도적으로 회피**한 케이스였다.
 * ⇒ 표2 × §97의4 조합은 **한 번도 검증된 적이 없다**. 이 파일이 그 공백을 메운다.
 */
import { describe, it, expect } from "vitest";
import { calcLongTermHoldingDeduction } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const rates = parseRatesFromMap(makeMockRates());
const D = (s: string) => new Date(`${s}T00:00:00`);

const R974 = {
  type: "rental_97_4",
  registrationDate: D("2016-01-01"),
  rentalStartDate: D("2016-01-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  region: "capital",
  // 소령 §167의3①2호 가목 대상 요건 (D2-04)
  rental974Category: "purchase_a",
  officialPriceAtStart: 500_000_000,
};

/**
 * 보유 2006-01-01 ~ 2026-01-01 = 20년 · 거주 10년(표2 거주분 40%) · 임대 10년(추가율 10%)
 * 1세대1주택 고가주택 → 표2 적용
 */
function run(opts: { table2: boolean; withRental: boolean; residenceMonths?: number }) {
  const input = baseTransferInput({
    transferPrice: 3_000_000_000,
    transferDate: D("2026-01-01"),
    acquisitionPrice: 500_000_000,
    acquisitionDate: D("2006-01-01"),
    isOneHousehold: opts.table2,
    householdHousingCount: opts.table2 ? 1 : 2,
    residencePeriodMonths: opts.residenceMonths ?? 120, // 거주 10년
    reductions: opts.withRental ? [R974] : [],
  } as Any);
  return calcLongTermHoldingDeduction(
    1_000_000_000,
    input as Any,
    rates.longTermHoldingRules,
    false,
    false,
  );
}

describe("기준선 — 표2가 아니면 종전대로 가산한다", () => {
  it("다주택(표1): §97의4 추가율 10%p가 가산된다", () => {
    const withR = run({ table2: false, withRental: true });
    const without = run({ table2: false, withRental: false });
    expect(withR.rate - without.rate).toBeCloseTo(0.1, 10);
  });
});

describe("🔴 §97의4① 단서 — 표2(1세대1주택)면 가산하지 않는다", () => {
  it("표2 공제율이 §97의4 유무와 무관하게 같다", () => {
    const withR = run({ table2: true, withRental: true });
    const without = run({ table2: true, withRental: false });
    expect(withR.rate, "§95② 단서 대상에 추가율을 더하면 법정 상한 80%를 넘는다").toBe(
      without.rate,
    );
    expect(withR.deduction).toBe(without.deduction);
  });

  it("공제율이 법정 상한 80%를 넘지 않는다", () => {
    const r = run({ table2: true, withRental: true });
    // 보유 20년 40% + 거주 10년 40% = 80%. 여기에 10%p를 더하면 90%가 된다.
    expect(r.rate).toBe(0.8);
    expect(r.deduction).toBe(800_000_000);
  });

  it("배제 사유가 결과에 남는다 — 화면에서 조용히 사라지지 않는다", () => {
    const r = run({ table2: true, withRental: true });
    const detail = r.rental97LthdDetail as unknown as
      | { isEligible?: boolean; ineligibleReasons?: { code: string; legalBasis: string }[] }
      | undefined;
    expect(detail, "§97의4를 선택했는데 상세가 통째로 사라지면 안 된다").toBeDefined();
    const reason = (detail?.ineligibleReasons ?? []).find(
      (x) => x.code === "TABLE2_PROVISO_EXCLUDED",
    );
    expect(reason).toBeDefined();
    expect(reason?.legalBasis).toContain("§97의4");
  });
});

describe("구별력 — 표2 여부가 실제로 결과를 가른다", () => {
  it("같은 §97의4 입력에서 표1은 가산되고 표2는 가산되지 않는다", () => {
    const t1 = run({ table2: false, withRental: true }).rate - run({ table2: false, withRental: false }).rate;
    const t2 = run({ table2: true, withRental: true }).rate - run({ table2: true, withRental: false }).rate;
    expect(t1).toBeCloseTo(0.1, 10);
    expect(t2).toBe(0);
  });
});

describe("🔑 술어는 `useTable2`여야 한다 — `isOneHouseForTable2`가 아니다", () => {
  /**
   * `useTable2 = isOneHouseForTable2 && table2ResidenceYears >= 2`.
   * 두 술어는 **거주 2년 요건**에서 갈린다 — 1세대1주택이라도 거주 2년 미만이면
   * §95② **단서가 적용되지 않아** 표1이 쓰이고, 그러면 §97의4 추가율은 **가산되어야** 한다.
   *
   * ⚠️ 실측: 이 케이스가 없을 때 `useTable2` → `isOneHouseForTable2` 뮤테이션이
   *    전건 4,567건에서 **구별력 0**이었다. 술어를 바꿔 다는 것만으로는 잡히지 않는다
   *    (memory `feedback_shared_predicate_argument_parity` — 술어 공유 ≠ 인자 동일성).
   */
  it("🔴 1세대1주택이지만 거주 1년 → 표1이므로 추가율이 가산된다", () => {
    const withR = run({ table2: true, withRental: true, residenceMonths: 12 });
    const without = run({ table2: true, withRental: false, residenceMonths: 12 });
    expect(
      withR.rate - without.rate,
      "거주 2년 미만은 §95② 단서 대상이 아니므로 배제하면 부당 불이익이다",
    ).toBeCloseTo(0.1, 10);
  });

  it("거주 2년이면 표2로 넘어가 가산되지 않는다 — 경계", () => {
    const withR = run({ table2: true, withRental: true, residenceMonths: 24 });
    const without = run({ table2: true, withRental: false, residenceMonths: 24 });
    expect(withR.rate).toBe(without.rate);
  });
});
