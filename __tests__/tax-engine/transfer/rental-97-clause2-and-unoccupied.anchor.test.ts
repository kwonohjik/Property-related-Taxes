/**
 * anchor — §97①2호 신설 + 「취득 당시 미입주」 요건 (D1-06 · D1-07)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특법 §97①** 각 호 — 「다음 각 호의 **어느 하나**에 해당하는 국민주택…」
 *   1. 1986년 1월 1일부터 2000년 12월 31일까지의 기간 중 신축된 주택
 *   2. **1985년 12월 31일 이전에 신축된 공동주택**으로서 **1986년 1월 1일 현재 입주된 사실이
 *      없는 주택**
 *
 * **조특법 §97① 단서** — 「…**매입임대주택 중 1995년 1월 1일 이후 취득 및 임대를 개시하여
 * 5년 이상 임대한 임대주택(취득 당시 입주된 사실이 없는 주택만 해당한다)**…의 경우에는
 * 양도소득세를 면제한다.」
 *
 * **조특법 §97의2①2호** — 「…및 임대를 개시한 임대주택(**취득 당시 입주된 사실이 없는
 * 주택만 해당한다**)」
 *
 * ## D1-06 — 2호가 미구현이라 1985년 이전 신축이 일괄 차단됐다
 * 각 호는 「어느 하나」이므로 2호는 1호와 **대등한 선택지**인데, 엔진이 1호 범위 밖을 전부
 * `CONSTRUCTION_YEAR_OUT`으로 막아 해당자가 감면을 **전혀 받지 못했다**(납세자 불리).
 *
 * 🔑 2호는 **두 사실**을 요구한다 — ⓐ공동주택 · ⓑ1986.1.1 현재 미입주.
 *    한쪽만 보면 조문의 절반만 검증하는 것이다. 신규 필드는 2개다.
 *
 * ## D1-07 — 명문 요건인데 입력·검사 어디에도 없었다
 * 취득 당시 임차인이 입주해 있던 매입임대주택도 100% 면제를 받았다.
 * §97① 단서 나목과 §97의2①2호가 **같은 문언**을 쓰지만 조문이 다르므로 각 폼 variant에 둔다.
 *
 * ⚠️ 신규 3-state는 「미해당」 선택지를 둔다 — 미입력을 충족으로 읽으면 기존 1호 사용자가
 *    영향받거나(2호) 요건 미충족자가 통과한다(단서 나목).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental97Main } from "@/lib/tax-engine/transfer-reductions/rental-97-main";
import { evaluateRental972 } from "@/lib/tax-engine/transfer-reductions/rental-97-2";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(`${s}T00:00:00`);

/** 단서 다목(10년 이상) — 신축연도만 바꿔가며 각 호를 본다 */
const PROVISO_C = {
  id: "rental_97_proviso" as const,
  transferDate: D("2010-06-01"),
  acquisitionDate: D("1996-01-01"),
  rentalStartDate: D("1998-01-01"),
  isNationalHousing: true,
  hasMin5RentalUnits: true,
  provisoCase: "c_10years" as const,
  calculatedTax: 60_000_000,
};

const codesOf = (r: ReturnType<typeof evaluateRental97Main>) =>
  r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);

describe("D1-06 — §97①2호 (1985.12.31 이전 신축 공동주택)", () => {
  it("기준선: 1993년 신축(1호) → 적용", () => {
    const r = evaluateRental97Main({ ...PROVISO_C, constructionYear: 1993 } as Any);
    expect(r.isEligible).toBe(true);
    expect((r as unknown as { reductionAmount?: number }).reductionAmount).toBe(60_000_000);
  });

  it("🔴 1984년 신축 + 공동주택 + 1986.1.1 미입주 → 2호로 적용된다", () => {
    const r = evaluateRental97Main({
      ...PROVISO_C,
      constructionYear: 1984,
      isMultiUnitHousing: true,
      isUnoccupiedAt1986: true,
    } as Any);
    expect(r.isEligible, "2호가 미구현이면 1985년 이전 신축이 일괄 차단된다").toBe(true);
    expect((r as unknown as { reductionAmount?: number }).reductionAmount).toBe(60_000_000);
  });

  it("🔴 공동주택이 아니면 2호가 아니다", () => {
    const r = evaluateRental97Main({
      ...PROVISO_C,
      constructionYear: 1984,
      isMultiUnitHousing: false,
      isUnoccupiedAt1986: true,
    } as Any);
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("CLAUSE_2_NOT_MULTI_UNIT");
  });

  it("🔴 1986.1.1 현재 입주 사실이 있으면 2호가 아니다", () => {
    const r = evaluateRental97Main({
      ...PROVISO_C,
      constructionYear: 1984,
      isMultiUnitHousing: true,
      isUnoccupiedAt1986: false,
    } as Any);
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("CLAUSE_2_OCCUPIED_AT_1986");
  });

  it("🔴 두 사실 모두 미입력이면 두 사유가 다 뜬다 — 절반만 검증하지 않는다", () => {
    const r = evaluateRental97Main({ ...PROVISO_C, constructionYear: 1984 } as Any);
    const codes = codesOf(r);
    expect(codes).toContain("CLAUSE_2_NOT_MULTI_UNIT");
    expect(codes).toContain("CLAUSE_2_OCCUPIED_AT_1986");
  });

  it("2001년 이후 신축은 어느 호에도 없다 → CONSTRUCTION_YEAR_OUT", () => {
    const r = evaluateRental97Main({
      ...PROVISO_C,
      constructionYear: 2001,
      isMultiUnitHousing: true,
      isUnoccupiedAt1986: true,
    } as Any);
    expect(codesOf(r)).toContain("CONSTRUCTION_YEAR_OUT");
  });

  it("1호 범위(1986~2000)에는 2호 필드를 요구하지 않는다", () => {
    const r = evaluateRental97Main({ ...PROVISO_C, constructionYear: 1986 } as Any);
    const codes = codesOf(r);
    expect(codes).not.toContain("CLAUSE_2_NOT_MULTI_UNIT");
    expect(codes).not.toContain("CLAUSE_2_OCCUPIED_AT_1986");
  });
});

describe("D1-07 — 「취득 당시 입주된 사실이 없는 주택만 해당한다」", () => {
  const PROVISO_B = {
    ...PROVISO_C,
    provisoCase: "b_purchase" as const,
    constructionYear: 1996,
    acquisitionDate: D("1996-01-01"), // 1995.1.1 이후
    transferDate: D("2005-06-01"),
  };

  it("기준선: 미입주 확인 시 100% 면제", () => {
    const r = evaluateRental97Main({ ...PROVISO_B, isUnoccupiedAtAcquisition: true } as Any);
    expect(r.isEligible).toBe(true);
  });

  it("🔴 §97① 단서 나목 — 취득 당시 입주 사실이 있으면 배제", () => {
    const r = evaluateRental97Main({ ...PROVISO_B, isUnoccupiedAtAcquisition: false } as Any);
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("OCCUPIED_AT_ACQUISITION");
  });

  it("🔴 미입력도 배제 — 명문 요건을 충족으로 읽지 않는다", () => {
    expect(evaluateRental97Main({ ...PROVISO_B } as Any).isEligible).toBe(false);
  });

  it("단서 가목(건설임대)에는 걸리지 않는다 — 조문이 매입임대만 한정한다", () => {
    const r = evaluateRental97Main({
      ...PROVISO_B,
      provisoCase: "a_construction",
    } as Any);
    expect(codesOf(r)).not.toContain("OCCUPIED_AT_ACQUISITION");
  });

  it("🔴 §97의2①2호 — 매입임대(2호)에도 같은 요건이 걸린다", () => {
    const base = {
      id: "rental_97_2" as const,
      transferDate: D("2006-06-01"),
      acquisitionDate: D("2000-03-01"),
      contractDate: D("2000-02-01"),
      rentalStartDate: D("2000-04-01"),
      rental972Type: "purchase" as const,
      isNationalHousing: true,
      hasNewRentalPlus2Units: true,
      calculatedTax: 20_000_000,
    };
    const without = evaluateRental972({ ...base } as Any);
    expect(without.isEligible).toBe(false);
    const withFlag = evaluateRental972({ ...base, isUnoccupiedAtAcquisition: true } as Any);
    expect(withFlag.isEligible).toBe(true);
  });

  it("§97의2 1호(건설임대)에는 걸리지 않는다", () => {
    const r = evaluateRental972({
      id: "rental_97_2",
      transferDate: D("2006-06-01"),
      acquisitionDate: D("2000-03-01"),
      rentalStartDate: D("2000-04-01"),
      rental972Type: "construction",
      isNationalHousing: true,
      hasNewRentalPlus2Units: true,
      calculatedTax: 20_000_000,
    } as Any);
    expect(r.isEligible).toBe(true);
  });
});

describe("⑫ Zod가 신규 필드 3종을 통과시킨다", () => {
  it("§97: isMultiUnitHousing · isUnoccupiedAt1986 · isUnoccupiedAtAcquisition", () => {
    const p = reductionSchema.parse({
      type: "rental_97_proviso",
      isMultiUnitHousing: true,
      isUnoccupiedAt1986: true,
      isUnoccupiedAtAcquisition: true,
    }) as Record<string, unknown>;
    expect(p.isMultiUnitHousing).toBe(true);
    expect(p.isUnoccupiedAt1986).toBe(true);
    expect(p.isUnoccupiedAtAcquisition).toBe(true);
  });

  it("§97의2: isUnoccupiedAtAcquisition", () => {
    const p = reductionSchema.parse({
      type: "rental_97_2",
      isUnoccupiedAtAcquisition: true,
    }) as Record<string, unknown>;
    expect(p.isUnoccupiedAtAcquisition).toBe(true);
  });
});

describe("⑬ router — 2호 필드가 evaluator까지 도달한다", () => {
  /**
   * ⚠️ 위 케이스들은 evaluator를 **직접** 호출하므로 `rental-97-router.ts`의 명시 매핑을
   *    타지 않는다. 실측: router에서 `isMultiUnitHousing`·`isUnoccupiedAt1986`을 지워도
   *    전건 4,619건이 통과했다(**구별력 0**). 진입점을 `calculateTransferTax`로 올린다.
   */
  const rates = makeMockRates();

  function run(withClause2: boolean) {
    return calculateTransferTax(
      baseTransferInput({
        transferPrice: 500_000_000,
        transferDate: D("2010-06-01"),
        acquisitionPrice: 200_000_000,
        acquisitionDate: D("1996-01-01"),
        isOneHousehold: false,
        householdHousingCount: 2,
        reductions: [
          {
            type: "rental_97_proviso",
            provisoCase: "c_10years",
            constructionYear: 1984, // §97①2호 범위
            isNationalHousing: true,
            rentalStartDate: D("1998-01-01"),
            isTaxRegistered: true,
            hasMin5RentalUnits: true,
            ...(withClause2
              ? { isMultiUnitHousing: true, isUnoccupiedAt1986: true }
              : {}),
          },
        ],
      } as Any),
      rates,
    );
  }

  it("🔴 2호 두 필드가 있으면 감면이 적용된다 — router를 통과했다는 뜻", () => {
    const r = run(true);
    expect(r.reductionTypeApplied, "⑬ router 명시매핑이 필드를 stripping했다").toBe(
      "rental_97_proviso",
    );
    expect(r.reductionAmount).toBeGreaterThan(0);
  });

  it("없으면 적용되지 않는다 (구별력)", () => {
    expect(run(false).reductionAmount ?? 0).toBe(0);
  });
});
