/**
 * anchor — 부칙·경과조치로 확정한 세 축 (CB-01 · D2-07 · D2-04 잔여)
 *
 * 세 건 모두 **부칙 원문을 확보하지 못해 보류**돼 있었다. 법제처 `target=eflaw` 부칙·연혁
 * 조회(`lib/korean-law/applicable-law.ts`)로 2026-08-31에 전부 확보했다.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ## CB-01 — §97의4 시한은 **양도일** 축이다 (등록일이 아니다)
 *
 * **법률 제12173호 부칙**(§97의4 신설, MST 149368):
 *   제1조(시행일) 이 법은 2014년 1월 1일부터 시행한다. (§97의4는 단서 예외 목록에 없다)
 *   **제2조(일반적 적용례) ③** 「이 법 중 **양도소득세** 및 증권거래세에 관한 개정규정은
 *     이 법 시행 후 **양도하는 분**부터 적용한다.」
 *
 * §97의4 **전용 적용례 조문은 없다**(제31조는 §96, 제32조는 §99의4).
 * ⇒ 종전의 `registrationDate >= 2014-01-01`은 **축이 틀렸고**, 2013년 등록·2026년 양도
 *   사안을 부당 배제했다(납세자 불리).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ## D2-07 — §97의3 「민간건설임대주택」 한정에는 **경과조치가 있다**
 *
 * **법률 제19199호**(2022.12.31 공포, 2023.1.1 시행) **부칙 제38조(경과조치)**:
 *   「이 법 시행 **전에 등록을 한** 공공지원민간임대주택 또는 장기일반민간임대주택에 대한
 *    양도소득세 과세특례에 관하여는 제97조의3제1항의 개정규정에도 불구하고
 *    **종전의 규정에 따른다**.」
 *
 * 문언 이력(실측): ~2022년의 「민간건설임대주택」은 **등록 시한 연장 괄호**
 * (「2020.12.31(민간건설임대주택은 2022.12.31)까지」)였고, **범위 한정**이 된 것은
 * 2023-01-01 시행분부터다.
 * ⇒ 2023.1.1 전 등록분에는 **범위 한정이 적용되지 않는다**. 무조건 걸면 법 근거 없는 불리 적용.
 *
 * 🔴 **2026-09-14 정정 — 「매입임대라도 적용된다」는 시한을 빠뜨린 말이었다.** 그 괄호는 시한이고,
 *    매입임대의 시한은 **2020.12.31**에서 끝난다. 따라서 2021.1.1~2022.12.31 등록 매입임대는
 *    (범위 한정이 아니라) **시한** 축에서 배제된다 — 별건 축의 anchor
 *    `rental-97-3-purchase-reg-deadline.anchor.test.ts`가 그 경계·세액을 지킨다.
 *    아래 D2-07 그룹은 그래서 **건설임대 / 2020년 등록**으로 축을 분리해 잰다.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ## D2-04 잔여 — 소령 §167의3①2호 단서(2018.3.31)의 시행일
 *
 * **대통령령 제28637호** — 부칙 §1 1호가 §167의3을 **2018-04-01** 시행으로 지정.
 * 같은 부칙에 §167의3 **적용례·경과조치는 없다** — 단서 자체가 시행일 전날까지를
 * grandfathering하는 구조다.
 * ⇒ **2018-04-01 이후 양도분**에만 적용한다(그 전 양도는 단서가 없던 구 소령).
 */
import { describe, it, expect } from "vitest";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** 엔진·Route와 같은 UTC 자정 파싱 */
const D = (s: string) => new Date(s);

describe("CB-01 — §97의4 시한 축이 양도일이다", () => {
  const check = (ctx: Record<string, unknown>) =>
    checkReductionPeriod("rental_97_4", ctx as Any).inPeriod;

  it("🔴 2013년 등록 + 2026년 양도 → 통과 (종전에는 등록일 하한으로 부당 배제)", () => {
    expect(
      check({ registrationDate: D("2013-05-01"), transferDate: D("2026-01-01") }),
      "부칙 §2③은 「이 법 시행 후 양도하는 분」이다 — 등록일이 아니다",
    ).toBe(true);
  });

  it("🔴 2013년 양도는 배제된다 — 시행 전 양도분", () => {
    expect(check({ registrationDate: D("2013-05-01"), transferDate: D("2013-12-31") })).toBe(false);
  });

  it("경계 — 2014.1.1 양도는 「시행 후」에 포함된다", () => {
    expect(check({ registrationDate: D("2010-01-01"), transferDate: D("2014-01-01") })).toBe(true);
  });

  it("등록일은 더 이상 시한을 가르지 않는다 — 구별력", () => {
    const a = check({ registrationDate: D("2010-01-01"), transferDate: D("2026-01-01") });
    const b = check({ registrationDate: D("2020-01-01"), transferDate: D("2026-01-01") });
    expect(a).toBe(b);
    expect(a).toBe(true);
  });
});

describe("D2-07 — §97의3 건설한정은 2023.1.1 이후 등록분만", () => {
  const BASE = {
    id: "rental_97_3" as const,
    acquisitionDate: D("2013-01-01"),
    transferDate: D("2035-01-01"),
    rentalStartDate: D("2013-06-01"),
    isTaxRegistered: true,
    rentIncreaseViolated: false,
    officialPriceAtStart: 400_000_000,
    stdPriceAtRentalStart: 400_000_000,
    stdPriceAtAcquisition: 400_000_000,
    stdPriceAtTransfer: 900_000_000,
    isNationalHousingScale: true,
    region: "capital" as const,
    propertyType: "non_apartment" as const,
    rentalHousingType: "long_term_private" as const,
    rentalContinuesToTransfer: true,
  };
  const codesOf = (r: ReturnType<typeof evaluateRental973>) =>
    r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);

  it("🔴 2020년 등록 매입임대 → 경과조치로 **적격**이다 (부칙 §38 + 시한 내)", () => {
    const r = evaluateRental973({
      ...BASE,
      registrationDate: D("2020-06-01"),
      rentalStartDate: D("2020-06-01"),
    } as Any);
    // ⚠️ 「특정 코드가 없다」만 보면 **다른 코드로 배제돼도 통과**한다(2026-09-14 실측 — 새 시한
    //    게이트가 이 anchor의 구별력을 흡수했다). 적격 자체를 단언한다.
    expect(r.isEligible, `부칙 §38은 시행 전 등록분에 종전 규정을 적용한다 / codes=${codesOf(r)}`).toBe(true);
  });

  it("🔴 2022년 등록 매입임대 → **범위 한정**으로는 안 걸린다 (걸리는 것은 시한 축)", () => {
    const r = evaluateRental973({
      ...BASE,
      registrationDate: D("2022-06-01"),
      rentalStartDate: D("2022-06-01"),
    } as Any);
    expect(codesOf(r)).not.toContain("NOT_PRIVATE_CONSTRUCTION_RENTAL");
    // 시한 축은 살아 있어야 한다 — 매입임대 등록 시한은 2020.12.31이다.
    expect(codesOf(r)).toContain("PURCHASE_RENTAL_REG_DEADLINE");
  });

  it("🔴 2023년 등록 + 건설임대 미확인 → 배제", () => {
    const r = evaluateRental973({
      ...BASE,
      registrationDate: D("2023-06-01"),
      rentalStartDate: D("2023-06-01"),
    } as Any);
    expect(codesOf(r)).toContain("NOT_PRIVATE_CONSTRUCTION_RENTAL");
  });

  it("2023년 등록 + 건설임대 확인 → 통과", () => {
    const r = evaluateRental973({
      ...BASE,
      registrationDate: D("2023-06-01"),
      rentalStartDate: D("2023-06-01"),
      isPrivateConstructionRental: true,
    } as Any);
    expect(r.isEligible, `codes=${codesOf(r)}`).toBe(true);
  });

  it("경계 — 2022.12.31 등록은 경과조치 대상(≠ 한정 축), 2023.1.1은 한정 축", () => {
    // 같은 매입임대 픽스처에서 **배제 사유가 갈리는지**로 잰다 — 「특정 코드가 없다」만 보면
    // 다른 코드로 배제돼도 통과하므로(구별력 0) 양쪽 코드를 서로 배타적으로 단언한다.
    const before = evaluateRental973({
      ...BASE,
      registrationDate: D("2022-12-31"),
      rentalStartDate: D("2022-12-31"),
    } as Any);
    const after = evaluateRental973({
      ...BASE,
      registrationDate: D("2023-01-01"),
      rentalStartDate: D("2023-01-01"),
    } as Any);
    expect(codesOf(before)).not.toContain("NOT_PRIVATE_CONSTRUCTION_RENTAL");
    expect(codesOf(before)).toContain("PURCHASE_RENTAL_REG_DEADLINE"); // 시한 축
    expect(codesOf(after)).toContain("NOT_PRIVATE_CONSTRUCTION_RENTAL"); // 한정 축
    expect(codesOf(after)).not.toContain("PURCHASE_RENTAL_REG_DEADLINE");
  });
});

describe("D2-04 잔여 — 소령 §167의3①2호 단서(2018.3.31)", () => {
  const BASE = {
    id: "rental_97_4" as const,
    acquisitionDate: D("2010-01-01"),
    rentalStartDate: D("2010-03-01"),
    isTaxRegistered: true,
    rentIncreaseViolated: false,
    rental974Category: "purchase_a" as const,
    region: "capital" as const,
    officialPriceAtStart: 500_000_000,
  };
  const codesOf = (r: ReturnType<typeof evaluateRental974>) =>
    r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);

  it("🔴 2018.4.1 이후 등록 + 2024년 양도 → 단서로 배제", () => {
    const r = evaluateRental974({
      ...BASE,
      registrationDate: D("2018-06-01"),
      transferDate: D("2024-06-01"),
    } as Any);
    expect(codesOf(r)).toContain("REGISTRATION_AFTER_2018_03_31");
  });

  it("2018.3.31까지 등록 → 통과", () => {
    const r = evaluateRental974({
      ...BASE,
      registrationDate: D("2018-03-31"),
      transferDate: D("2024-06-01"),
    } as Any);
    expect(codesOf(r)).not.toContain("REGISTRATION_AFTER_2018_03_31");
  });

  it("🔴 단서 시행 전(2018.4.1 미만) 양도에는 소급하지 않는다 — 행위시법", () => {
    const r = evaluateRental974({
      ...BASE,
      registrationDate: D("2018-06-01"), // 단서 기준으론 초과지만
      transferDate: D("2018-03-01"), // 양도가 시행 전
    } as Any);
    expect(
      codesOf(r),
      "현행 소령을 과거 양도분에 소급하면 법 근거 없는 불리 적용이다",
    ).not.toContain("REGISTRATION_AFTER_2018_03_31");
  });

  it("구별력 — 같은 등록일이 양도 시점에 따라 갈린다", () => {
    const early = codesOf(evaluateRental974({ ...BASE, registrationDate: D("2018-06-01"), transferDate: D("2018-03-01") } as Any));
    const late = codesOf(evaluateRental974({ ...BASE, registrationDate: D("2018-06-01"), transferDate: D("2024-06-01") } as Any));
    expect(early).not.toContain("REGISTRATION_AFTER_2018_03_31");
    expect(late).toContain("REGISTRATION_AFTER_2018_03_31");
  });
});
