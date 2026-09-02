/**
 * anchor — §97의4 대상 요건: 소령 §167의3①2호 **가목·다목** (D2-04)
 *
 * ## 위임 체인 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특법 §97의4①** — 「…민간건설임대주택, 민간매입임대주택, 공공건설임대주택 또는
 * 공공매입임대주택으로서 **대통령령으로 정하는 주택**을 6년 이상 임대한 후 양도하는 경우…」
 *
 * **조특령 §97의4①** — 「법 제97조의4제1항에서 "대통령령으로 정하는 주택"이란
 * 「소득세법 시행령」 **제167조의3제1항제2호가목 및 다목**에 따른 장기임대주택…을 말한다.」
 *
 * **소령 §167의3①2호 가목** — 「민간매입임대주택을 **1호 이상** 임대하고 있는 거주자가
 * **5년 이상** 임대한 주택으로서 해당 주택 및 이에 부수되는 토지의 기준시가의 합계액이
 * 해당 주택의 **임대개시일 당시 6억원(수도권 밖의 지역인 경우에는 3억원)을 초과하지 않고**
 * 임대료등의 증가율이 100분의 5를 초과하지 않는 주택…」
 *
 * **소령 §167의3①2호 다목** — 「대지면적이 298제곱미터 이하이고 주택의 연면적이 149제곱미터
 * 이하인 **건설임대주택**을 **2호 이상** 임대하는 거주자가 5년 이상 임대하거나 분양전환하는
 * 주택으로서 … 합계액이 해당 주택의 **임대개시일 당시 6억원을 초과하지 않고** …」
 *
 * ⚠️ **다목에는 「수도권 밖 3억원」 괄호가 없다** — 가목에만 있다. 한 상수로 합치면 틀린다.
 * ⚠️ **나목은 §97의4 대상이 아니다** — 조특령 §97의4①이 「가목 및 다목」만 인용한다.
 *
 * ## 결함
 * `evaluateRental974`가 목별 요건을 **하나도** 검증하지 않았다. 검증되던 것은 시한·필수입력·
 * 임대료 5%·6년 임대뿐이다. 입력 경로도 ⑤·⑧·⑫·④·⑬ **5계층 모두 끊겨** 있었고,
 * router가 넘기던 `region`은 evaluator가 한 번도 읽지 않는 **사문 필드**였다.
 *
 * ⇒ 기준시가 12억 주택도 §97의4가 적용돼 §95② 공제율에 2~10%p가 부당 가산됐다.
 *
 * ## ✅ 종전의 「범위 밖 — 근거 미확보」 둘은 **전부 해소됐다** (표기 정정 2026-09-02)
 * 종전 헤더는 두 항목을 보류로 적어 뒀으나 **둘 다 이미 구현·검증됐다**:
 *   · 두 목의 단서 「**2018년 3월 31일까지** 사업자등록등을 한 주택으로 한정한다」 →
 *     `rental-97-4.ts`의 `REGISTRATION_SUNSET`(2018-03-31)로 구현했고, 소급을 막는
 *     시행일 게이트 `CLAUSE_SUNSET_EFFECTIVE_FROM`(2018-04-01 · 대통령령 제28637호)도 함께 있다.
 *   · **CB-01**(등록일 하한 → 양도일 축) → `period-check.ts`에서 **2026-08-31 해소**.
 *     법률 제12173호 **부칙 §2③**을 법제처 `target=eflaw`로 확인해 축을 양도일로 바꿨다.
 * ⚠️ 보류 표기를 남겨 두면 후속 작업자가 조사를 중단한다 — 해소되면 **표기부터** 고칠 것.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(`${s}T00:00:00`);

/** 8년 임대 → 추가율 6% */
const BASE = {
  id: "rental_97_4" as const,
  transferDate: D("2024-06-01"),
  acquisitionDate: D("2016-01-01"),
  registrationDate: D("2016-03-01"),
  rentalStartDate: D("2016-03-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
};

const rateOf = (r: ReturnType<typeof evaluateRental974>) =>
  (r as unknown as { additionalRate?: number }).additionalRate;

describe("가목 — 민간매입임대 (한도 6억 / 수도권 밖 3억)", () => {
  it("기준선: 수도권 5억 → 적용, 추가율 6%", () => {
    const r = evaluateRental974({
      ...BASE,
      rental974Category: "purchase_a",
      region: "capital",
      officialPriceAtStart: 500_000_000,
    } as Any);
    expect(r.isEligible).toBe(true);
    expect(rateOf(r)).toBe(0.06);
  });

  it("🔴 수도권 7억 → 한도 초과로 배제", () => {
    const r = evaluateRental974({
      ...BASE,
      rental974Category: "purchase_a",
      region: "capital",
      officialPriceAtStart: 700_000_000,
    } as Any);
    expect(r.isEligible, "6억 한도를 넘으면 장기임대주택이 아니다").toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("OFFICIAL_PRICE_OVER_CAP");
  });

  it("🔴 수도권 밖 4억 → 한도 3억 초과로 배제 (가목 괄호)", () => {
    const r = evaluateRental974({
      ...BASE,
      rental974Category: "purchase_a",
      region: "non_capital",
      officialPriceAtStart: 400_000_000,
    } as Any);
    expect(r.isEligible).toBe(false);
  });

  it("경계 — 정확히 6억은 「초과하지 않고」라 통과", () => {
    const r = evaluateRental974({
      ...BASE,
      rental974Category: "purchase_a",
      region: "capital",
      officialPriceAtStart: 600_000_000,
    } as Any);
    expect(r.isEligible).toBe(true);
  });
});

describe("다목 — 건설임대 (한도 6억, 「수도권 밖 3억」 없음)", () => {
  it("🔴 수도권 밖 4억이어도 다목은 통과한다 — 가목 괄호를 전용하면 틀린다", () => {
    const r = evaluateRental974({
      ...BASE,
      rental974Category: "construction_c",
      region: "non_capital",
      officialPriceAtStart: 400_000_000,
    } as Any);
    expect(r.isEligible, "다목엔 수도권 밖 3억 분기가 없다").toBe(true);
  });

  it("같은 입력에서 가목과 다목의 결과가 갈린다 — 구별력", () => {
    const mk = (cat: string) =>
      evaluateRental974({
        ...BASE,
        rental974Category: cat,
        region: "non_capital",
        officialPriceAtStart: 400_000_000,
      } as Any).isEligible;
    expect(mk("purchase_a")).toBe(false);
    expect(mk("construction_c")).toBe(true);
  });

  it("다목도 6억을 넘으면 배제", () => {
    const r = evaluateRental974({
      ...BASE,
      rental974Category: "construction_c",
      region: "capital",
      officialPriceAtStart: 700_000_000,
    } as Any);
    expect(r.isEligible).toBe(false);
  });
});

describe("미입력을 「충족」으로 읽지 않는다", () => {
  it("🔴 목 미선택 → 배제", () => {
    const r = evaluateRental974({ ...BASE, officialPriceAtStart: 500_000_000 } as Any);
    expect(r.isEligible).toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("MISSING_974_CATEGORY");
  });

  it("🔴 기준시가 미입력 → 배제 (자동 안분·추정 금지)", () => {
    const r = evaluateRental974({ ...BASE, rental974Category: "purchase_a" } as Any);
    expect(r.isEligible).toBe(false);
    const codes = r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);
    expect(codes).toContain("MISSING_OFFICIAL_PRICE");
  });
});

describe("⑫ Zod가 신규 필드를 통과시킨다", () => {
  it("officialPriceAtStart · rental974Category가 parse 후에도 살아남는다", () => {
    const parsed = reductionSchema.parse({
      type: "rental_97_4",
      officialPriceAtStart: 500_000_000,
      rental974Category: "construction_c",
    }) as Record<string, unknown>;
    expect(parsed.officialPriceAtStart, "⑫가 기준시가를 stripping했다").toBe(500_000_000);
    expect(parsed.rental974Category, "⑫가 목 구분을 stripping했다").toBe("construction_c");
  });
});
