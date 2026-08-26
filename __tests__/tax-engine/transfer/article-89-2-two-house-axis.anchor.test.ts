/**
 * anchor — §155⑥ 신설 + §89② 배제의 **2주택 축** (C1-01 Phase 5)
 *
 * ## 조문 (법제처 실독 · 시행령 MST 286211, 시행 2026-07-01)
 *
 * > **§155⑥** 다음 각 호의 어느 하나에 해당하는 주택과 그밖의 주택(일반주택)을 국내에 각각
 * > 1개씩 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 국내에 1개의 주택을 소유하고
 * > 있는 것으로 보아 제154조제1항을 적용한다.
 * >   1. 「문화유산의 보존 및 활용에 관한 법률」에 따른 **지정문화유산**, 「근현대문화유산의
 * >      보존 및 활용에 관한 법률」에 따른 **국가등록문화유산** 및 「자연유산의 보존 및 활용에
 * >      관한 법률」에 따른 **천연기념물등**
 * >   2. **삭제**  3. **삭제**
 *
 * > **§156의2⑩** 제155조제6항제1호에 해당하는 주택과 그 밖의 주택(일반주택) **및
 * > 조합원입주권**을 국내에 각각 1개씩 소유하고 있는 1세대가 일반주택을 양도하는 경우에는
 * > … **제3항 내지 제5항의 규정을 적용**한다. (§156의3⑦ = 분양권판)
 *
 * > **§156의2⑪** 제155조제7항의 규정에 따른 농어촌주택 중 **동항제2호의 이농주택**과 그 밖의
 * > 주택(일반주택) 및 조합원입주권을 … 각각 1개씩 … **제3항 내지 제5항**을 적용한다.
 * > (§156의3⑧ = 분양권판)
 *
 * ## 🔑 ⑪은 **이농주택만**이다
 *
 * `RuralHouseKind`는 상속(§155⑦1호)·이농(2호)·귀농(3호) 셋인데 ⑪·§156의3⑧이 지목하는 것은
 * **2호 이농주택뿐**이다. 종전 게이트는 `ruralHouse`가 있기만 하면 판정 불가로 뺐다 —
 * 상속 농어촌주택·귀농주택 세대에 **적용될 수 없는 조문**을 안내한 것이다(P-0과 같은 결함).
 *
 * ## ⭐ ⑦1호(상속받은 **주택**) 갈래는 U-1을 타지 않는다 — 실측으로 뒤집힌 전제
 *
 * 계획서는 ⑦1호를 「2주택 + 1권리 = U-1」로 분류했다. **틀렸다.** §155②③ 주택수 제외가
 * `checkExemption` 진입 전에 count를 이미 1로 줄이므로(`transfer-tax-house-exclusion-step.ts`)
 * U-1이 발동하지 않고 ③ 타이밍까지 그대로 도달한다. 그 결과 ⑦ **후단**의
 * 「제3항 및 제4항의 규정을 적용받는 일반주택은 **상속개시 당시 보유한 주택**으로 한정한다」가
 * **한 번도 검증되지 않았다**.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { PresaleRight, HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const mockRates = makeMockRates();
const run = (input: TransferTaxInput) => calculateTransferTax(input, mockRates);
const verdict = (input: TransferTaxInput) => resolveArticle89Clause2(input, undefined);

function right(over: Partial<PresaleRight> = {}): PresaleRight {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: new Date("2016-10-01"), // 종전주택(2015-06-01) + 1년 경과
    region: "capital",
    ...over,
  };
}

function house(over: Partial<HouseInfo> = {}): HouseInfo {
  return {
    id: "h",
    acquisitionDate: new Date("2015-06-01"),
    isRegulatedArea: false,
    ...over,
  } as HouseInfo;
}

/** 2주택 세대. 양도일 2019-06-01은 권리 취득 + 3년 이내라 ③ 타이밍은 충족한다. */
function twoHouse(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2019-06-01"),
    residencePeriodMonths: 60,
    presaleRights: [right()],
    ...over,
  });
}

describe("§155⑥ 신설 — 문화유산 주택 + 일반주택", () => {
  it("★ 종전에는 **비과세가 아니었다** — 2주택으로만 보였다", () => {
    // 권리 없이 순수 §155⑥만 본다.
    const without = run(twoHouse({ presaleRights: [] }));
    expect(without.isExempt).toBe(false);
  });

  it("★ 선언하면 1주택으로 보아 §154①을 적용한다", () => {
    const r = run(twoHouse({ presaleRights: [], culturalHeritageHouse: true }));
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain("§155⑥");
    expect(r.totalTax).toBe(0);
  });

  it("🔑 「각각 1개씩」 — 3주택 세대에는 적용되지 않는다", () => {
    const r = run(
      twoHouse({ presaleRights: [], householdHousingCount: 3, culturalHeritageHouse: true }),
    );
    expect(r.isExempt).toBe(false);
  });

  it("🔑 §154① 보유·거주 요건은 그대로 적용된다 (「보아 제154조제1항을 적용」)", () => {
    const r = run(
      twoHouse({
        presaleRights: [],
        culturalHeritageHouse: true,
        acquisitionDate: new Date("2018-09-01"), // 보유 2년 미만
      }),
    );
    expect(r.isExempt).toBe(false);
  });

  it("12억 초과는 고가주택 부분과세로 간다", () => {
    const r = run(
      twoHouse({ presaleRights: [], culturalHeritageHouse: true, transferPrice: 2_000_000_000 }),
    );
    expect(r.isPartialExempt).toBe(true);
  });
});

describe("§156의2⑩ · §156의3⑦ — 문화유산 주택 + 일반주택 + 권리", () => {
  it("★ 종전에는 판정 불가였다 → 이제 ③을 준용해 비과세를 유지한다", () => {
    const r = run(twoHouse({ culturalHeritageHouse: true }));
    expect(r.isExempt).toBe(true);
    expect(r.warnings ?? []).toEqual([]);
  });

  it("준용 근거를 ⑩으로 남긴다 — 타이밍 인용은 ③ 그대로다", () => {
    const v = verdict(twoHouse({ culturalHeritageHouse: true }));
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의2 ③");
    expect(v.viaArticle).toBe("소득세법 시행령 §156의2 ⑩");
  });

  it("🔑 준용이므로 ③ 타이밍이 깨지면 그대로 탈락한다", () => {
    // 권리를 종전주택 취득 4개월 뒤에 취득 ⇒ 1년 요건 미충족.
    const v = verdict(
      twoHouse({
        culturalHeritageHouse: true,
        presaleRights: [right({ acquisitionDate: new Date("2015-10-01") })],
      }),
    );
    expect(v.status).toBe("excluded");
  });

  it("🔑 「각각 1개씩」 — 권리가 2개면 ⑩이 아니다", () => {
    const v = verdict(
      twoHouse({
        culturalHeritageHouse: true,
        presaleRights: [right(), right({ id: "r2" })],
      }),
    );
    expect(v.status).toBe("undetermined");
  });

  it("분양권도 같다 — §156의3⑦로 인용한다", () => {
    const v = verdict(
      twoHouse({
        culturalHeritageHouse: true,
        presaleRights: [right({ type: "presale_right" })],
      }),
    );
    // presaleRightStartDate 미제공이라 분양권은 §89②의 대상 자체가 아니다.
    expect(v.status).toBe("not_applicable");
  });
});

describe("§156의2⑪ · §156의3⑧ — 이농주택**만**", () => {
  const farmExit = {
    kind: "farm_exit" as const,
    isOutsideCapitalEupMyeon: true,
    ownerResidenceYears: 6,
  };

  it("★ 이농주택 + 일반주택 + 권리 → ③을 준용해 비과세 유지", () => {
    const r = run(twoHouse({ ruralHouse: farmExit }));
    expect(r.isExempt).toBe(true);
    expect(r.warnings ?? []).toEqual([]);
  });

  it("준용 근거는 ⑪이다", () => {
    const v = verdict(twoHouse({ ruralHouse: farmExit }));
    expect(v.viaArticle).toBe("소득세법 시행령 §156의2 ⑪");
  });

  it("🔑 **상속** 농어촌주택(§155⑦1호)에는 ⑪이 적용되지 않는다 → 판정 불가", () => {
    const v = verdict(
      twoHouse({
        ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 6 },
      }),
    );
    expect(v.status).toBe("undetermined");
    /**
     * ⑪은 이농주택 전용이므로 **가리키지 않는다**(적용될 수 없는 조문 안내 금지 — P-0).
     *
     * ⚠️ `join(" ")`에 `not.toContain("§156의2 ⑪")`을 쓰면 **구별력이 0이다** — 안내 문자열이
     *    「§156의2 ⑦·⑩·⑪」 한 덩어리라 그 부분 문자열이 애초에 없다. 실제로 이 뮤테이션이
     *    처음엔 0건 검출이었다(memory `feedback_negative_assertion_needs_mutation_probe`).
     *    ⇒ 배열 **원소를 통째로** 대조한다.
     */
    expect(v.openArticles).toEqual([
      "소득세법 시행령 §156의2 ⑦·⑩",
      "소득세법 시행령 §156의3 ⑤·⑦",
    ]);
  });

  it("🔑 **귀농**주택(§155⑦3호)도 마찬가지다", () => {
    const v = verdict(
      twoHouse({
        ruralHouse: {
          kind: "return_to_farm",
          isOutsideCapitalEupMyeon: true,
          acquisitionDate: new Date("2016-01-01"),
          landAreaSqm: 500,
          wholeHouseholdMoved: true,
        },
      }),
    );
    expect(v.openArticles).toEqual([
      "소득세법 시행령 §156의2 ⑦·⑩",
      "소득세법 시행령 §156의3 ⑤·⑦",
    ]);
  });
});

describe("⭐ §156의2⑦1호 후단 — 상속받은 **주택** 갈래", () => {
  /** §155②③이 주택수를 2 → 1로 줄인다. 그래서 U-1이 아니라 ③ 타이밍까지 도달한다. */
  function inheritedHouseCase(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
    return twoHouse({
      sellingHouseId: "sell",
      houses: [house({ id: "sell" }), house({ id: "inh", isInherited: true })],
      ...over,
    });
  }

  it("🔴 종전에는 후단 요건이 **한 번도 검증되지 않았다** → 이제 판정 불가로 남는다", () => {
    const r = run(inheritedHouseCase());
    expect(r.isExempt).toBe(true); // 종전 동작 유지(불리하게 뒤집지 않는다)
    const joined = (r.warnings ?? []).join("\n");
    expect(joined).toContain("§156의2 ⑦");
  });

  it("★ 「상속개시 당시 보유한 주택」을 선언하면 ⑦을 준용해 그대로 비과세다", () => {
    const r = run(inheritedHouseCase({ generalHouseHeldAtInheritance: true }));
    expect(r.isExempt).toBe(true);
    expect(r.warnings ?? []).toEqual([]);
  });

  /**
   * ⚠️ 술어를 **직접** 부를 때는 `householdHousingCount`를 1로 넣어야 실제 호출부와 같다 —
   *    엔진은 §155②③ 제외를 마친 `exemptionJudgeInput`을 넘기기 때문이다. 2를 그대로 넣으면
   *    2주택 축이 먼저 열려 이 갈래에 도달하지 못한다(측정 실패).
   */
  it("준용 근거를 ⑦로 남긴다", () => {
    const v = verdict(
      inheritedHouseCase({ generalHouseHeldAtInheritance: true, householdHousingCount: 1 }),
    );
    expect(v.status).toBe("exception_met");
    expect(v.viaArticle).toBe("소득세법 시행령 §156의2 ⑦");
  });

  it("🔑 상속주택이 없으면 이 요건을 묻지 않는다 (관계없는 세대에 안내 금지)", () => {
    const v = verdict(
      twoHouse({
        householdHousingCount: 1,
        houses: [house({ id: "sell" })],
        sellingHouseId: "sell",
      }),
    );
    expect(v.status).toBe("exception_met");
    expect(v.viaArticle).toBeUndefined();
  });
});

describe("U-1 잔여 — 닫히지 않은 2주택 조합은 그대로 판정 불가다", () => {
  it("특수주택 선언이 없는 2주택 + 권리 → ⑦·⑩·⑪ 안내", () => {
    const v = verdict(twoHouse());
    expect(v.status).toBe("undetermined");
    expect(v.openArticles).toContain("소득세법 시행령 §156의2 ⑦·⑩·⑪");
    expect(v.openArticles).toContain("소득세법 시행령 §156의3 ⑤·⑦·⑧");
  });

  it("3주택 이상은 「각각 1개씩」을 벗어나 여전히 판정 불가다", () => {
    const v = verdict(twoHouse({ householdHousingCount: 3, culturalHeritageHouse: true }));
    expect(v.status).toBe("undetermined");
  });
});
