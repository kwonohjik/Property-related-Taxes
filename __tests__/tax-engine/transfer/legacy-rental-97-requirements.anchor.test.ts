/**
 * anchor — 레거시 장기임대 경로의 §97 요건·§133 한도 (D1-04 · D1-05)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특법 §97①** — 「대통령령으로 정하는 거주자가 다음 각 호의 어느 하나에 해당하는
 * 국민주택(이에 딸린 해당 건물 연면적의 2배 이내의 토지를 포함한다)을 **2000년 12월 31일
 * 이전에 임대를 개시하여 5년 이상 임대한 후 양도**하는 경우에는 … 양도소득세의 **100분의 50**에
 * 상당하는 세액을 감면한다. **다만**, …**건설임대주택 중 5년 이상 임대**한 임대주택과 …
 * **매입임대주택 중 1995년 1월 1일 이후 취득 및 임대를 개시하여 5년 이상 임대**한 임대주택
 * (**취득 당시 입주된 사실이 없는 주택만 해당한다**) 및 **10년 이상 임대**한 임대주택의 경우에는
 * 양도소득세를 **면제**한다.
 *
 *   1. **1986년 1월 1일부터 2000년 12월 31일까지의 기간 중 신축된 주택**
 *   2. **1985년 12월 31일 이전에 신축된 공동주택**으로서 **1986년 1월 1일 현재 입주된 사실이
 *      없는 주택**」
 *
 * ⚠️ **단서의 면제는 본문 요건과 각 호를 면제하지 않는다** — 5년 임대만으로 100%가 되지 않는다.
 *
 * ## D1-04 — 레거시 엔진이 시한·신축연도를 한 번도 보지 않았다
 * `determineMandatoryPeriod`의 `public_construction` 분기가 5년 임대만으로 감면율 1.0을 줬다.
 * 파일 전체에 `constructionYear`도 2000.12.31 경계 상수도 없었다.
 * ⇒ 2015년 임대개시 주택도 100% 면제를 받았다.
 *
 * ## D1-05 — §133 한도를 §97 시리즈 전부에 걸었다
 * 조특법 §133①은 「제33조, 제43조, 제66조부터 제69조까지, …」, ②는 「제77조, 제77조의2 또는
 * 제77조의3」을 열거한다 — **§97·§97의3·§97의4·§97의5는 어느 항에도 없다.**
 * 산식도 달랐다: §133①1호는 「1억원을 초과하는 부분에 상당하는 금액」을 감면하지 아니한다
 * (**하드 캡**)이지 「초과분의 50%는 감면」이 아니다.
 *
 * ## 도달 경로
 * 마법사 UI가 아니라 **공개 API 직접 호출**뿐이다(`rentalReductionDetails`를 채우는
 * 클라이언트 코드 0건). 그래도 Zod·Route·결과 카드가 살아 있어 API 표면으로 도달한다.
 */
import { describe, it, expect } from "vitest";
import { calculateRentalReduction } from "@/lib/tax-engine/rental-housing-reduction";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(`${s}T00:00:00`);

const BASE = {
  isRegisteredLandlord: true,
  isTaxRegistered: true,
  registrationDate: D("1996-01-01"),
  rentalHousingType: "public_construction" as const,
  propertyType: "non_apartment" as const,
  region: "capital" as const,
  officialPriceAtStart: 200_000_000,
  rentalStartDate: D("1998-01-01"),
  transferDate: D("2005-06-01"),
  vacancyPeriods: [],
  rentHistory: [],
  calculatedTax: 300_000_000,
  constructionYear: 1990, // §97①1호
};

describe("D1-04 — §97① 본문 시한 (2000.12.31 이전 임대개시)", () => {
  it("기준선: 1998 임대개시 · 1990 신축 → 적용", () => {
    const r = calculateRentalReduction({ ...BASE } as Any, undefined as Any);
    expect(r.isEligible).toBe(true);
  });

  it("🔴 2015 임대개시 → 시한 외로 배제", () => {
    const r = calculateRentalReduction(
      { ...BASE, rentalStartDate: D("2015-01-01"), transferDate: D("2021-01-01"), constructionYear: 2015 } as Any,
      undefined as Any,
    );
    expect(r.isEligible, "5년 임대만으로 100% 면제가 되면 안 된다").toBe(false);
    const codes = r.ineligibleReasons.map((x) => x.code);
    expect(codes).toContain("RENTAL_START_AFTER_DEADLINE");
  });

  it("경계 — 2000.12.31 임대개시는 「이전」에 포함된다", () => {
    const r = calculateRentalReduction(
      { ...BASE, rentalStartDate: D("2000-12-31"), transferDate: D("2007-01-01") } as Any,
      undefined as Any,
    );
    const codes = r.ineligibleReasons.map((x) => x.code);
    expect(codes).not.toContain("RENTAL_START_AFTER_DEADLINE");
  });
});

describe("D1-04 — §97① 각 호 신축연도", () => {
  it("🔴 신축연도 미입력 → 배제 (충족으로 읽지 않는다)", () => {
    const { constructionYear: _drop, ...noYear } = BASE;
    const r = calculateRentalReduction(noYear as Any, undefined as Any);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("MISSING_CONSTRUCTION_YEAR");
  });

  it("1호: 1986~2000 신축 → 적용", () => {
    expect(
      calculateRentalReduction({ ...BASE, constructionYear: 1986 } as Any, undefined as Any).isEligible,
    ).toBe(true);
    expect(
      calculateRentalReduction({ ...BASE, constructionYear: 2000 } as Any, undefined as Any).isEligible,
    ).toBe(true);
  });

  it("🔴 2호: 1985 이전 신축은 「1986.1.1 현재 미입주」 확인이 있어야 한다", () => {
    const without = calculateRentalReduction({ ...BASE, constructionYear: 1984 } as Any, undefined as Any);
    expect(without.isEligible).toBe(false);
    expect(without.ineligibleReasons.map((x) => x.code)).toContain("NOT_UNOCCUPIED_AT_1986");

    const withFlag = calculateRentalReduction(
      { ...BASE, constructionYear: 1984, isUnoccupiedAt1986: true } as Any,
      undefined as Any,
    );
    expect(withFlag.isEligible, "2호 요건을 갖추면 적용되어야 한다").toBe(true);
  });

  it("🔴 2001년 이후 신축은 어느 호에도 없다 → 배제", () => {
    const r = calculateRentalReduction(
      { ...BASE, constructionYear: 2001, isUnoccupiedAt1986: true } as Any,
      undefined as Any,
    );
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("CONSTRUCTION_YEAR_OUT");
  });

  it("§97 아닌 유형에는 이 게이트를 걸지 않는다 — 조문이 다르다", () => {
    const r = calculateRentalReduction(
      { ...BASE, rentalHousingType: "long_term_private", constructionYear: undefined } as Any,
      undefined as Any,
    );
    const codes = r.ineligibleReasons.map((x) => x.code);
    expect(codes).not.toContain("MISSING_CONSTRUCTION_YEAR");
    expect(codes).not.toContain("RENTAL_START_AFTER_DEADLINE");
  });
});

describe("D1-05 — §133 한도는 §97 시리즈에 걸리지 않는다", () => {
  it("🔴 산출세액 3억 · 감면율 100% → 전액 감면 (한도 2억 아님)", () => {
    const r = calculateRentalReduction({ ...BASE } as Any, undefined as Any);
    expect(r.isEligible).toBe(true);
    // 종전: 1억 + floor(2억 × 0.5) = 2억
    expect(r.reductionAmount, "§133①·②에 §97은 열거돼 있지 않다").toBe(300_000_000);
  });

  it("한도 적용 플래그가 서지 않는다 — 화면 안내도 뜨지 않는다", () => {
    const r = calculateRentalReduction({ ...BASE } as Any, undefined as Any);
    expect(r.isLimitApplied).toBe(false);
    expect(r.annualLimit).toBe(0);
  });
});
