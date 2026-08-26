/**
 * anchor — §89② 배제의 **상속받은 권리** 예외 (C1-01 Phase 3)
 *
 * ## 조문 (법제처 실독 · 시행령 MST 286211)
 *
 * > **§156의2⑥** 상속받은 조합원입주권[**피상속인이 상속개시 당시 주택 또는 분양권을 소유하지
 * > 않은 경우**의 상속받은 조합원입주권만 해당하며, 피상속인이 2 이상의 조합원입주권을 소유한
 * > 경우에는 다음 각 호의 순위에 따른 1조합원입주권만 해당하고, **공동상속조합원입주권**의
 * > 경우에는 제7항제3호에 해당하는 사람이 소유한 것으로 본다]과 그 밖의 주택(일반주택)을 국내에
 * > **각각 1개씩** 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 **국내에 1개의 주택을
 * > 소유하고 있는 것으로 보아** 제154조제1항을 적용한다. **다만**, 상속인과 피상속인이 상속개시
 * > 당시 1세대인 경우에는 … 합치기 이전부터 보유하고 있었던 주택이 조합원입주권으로 전환된
 * > 경우에만 상속받은 조합원입주권으로 본다.
 *
 * > **§156의2⑦** 제1호의 주택, **제2호의 조합원입주권** 또는 제4호의 분양권과 **상속 외의
 * > 원인으로 취득한 주택**(일반주택) 및 **상속 외의 원인으로 취득한 조합원입주권**을 국내에 각각
 * > 1개씩 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 국내에 일반주택과 상속 외의 원인으로
 * > 취득한 조합원입주권을 소유하고 있는 것으로 보아 **제3항부터 제5항까지의 규정을 적용**한다.
 *
 * ## 🔑 ⑥과 ⑦은 효과가 다르다
 *
 * · **⑥ = 직접 1세대1주택 의제** — 타이밍(1년·3년) 요건이 **없다**. ③④를 태우면 조용히 틀린다.
 * · **⑦ = 준용** — 상속받은 것을 없는 셈 치고 **상속 외 권리**로 ③~⑤ 타이밍을 판정한다.
 *   ⇒ ⑦은 「1주택 + 2권리」 조합이라 **U-2(권리 2개)의 절반**을 함께 닫는다.
 *
 * ## 🔑 순위는 계산하지 않는다
 *
 * 완전히 같은 문제(§155②1~4호)를 이 저장소는 자기선언 boolean으로 처리한다
 * (`transfer-inheritance-exclusion.ts` `passesRankingGate`). 같은 규약을 권리 축에 얹었다.
 * ⚠️ 단계 수는 다르다 — 입주권 3단계 / 분양권 2단계, 공동상속도 3단계 / 2단계.
 *
 * ## ⭐ 긍정 선언이 없으면 판정하지 않는다
 *
 * 일반주택이 「상속개시 당시 보유한 주택」이어야 한다는 요건은 **긍정 선언**을 요구한다.
 * 미선언은 `undetermined`(종전 유지 + 경고)이지 `excluded`가 아니다 — 미선언을 미해당으로
 * 읽으면 상속 권리 보유 세대가 갑자기 과세로 뒤집힌다(Phase 2와 같은 규약).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const mockRates = makeMockRates();

function right(over: Partial<PresaleRight> = {}): PresaleRight {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: new Date("2016-10-01"),
    region: "capital",
    ...over,
  };
}

/** 상속 권리 1개 + 일반주택 1채. 양도 2024-06-01(권리 취득 + 3년 초과 — ⑥엔 무관해야 한다). */
function inheritedCase(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    residencePeriodMonths: 60,
    presaleRights: [right({ isInherited: true })],
    generalHouseHeldAtInheritance: true,
    ...over,
  });
}

const run = (input: TransferTaxInput) => calculateTransferTax(input, mockRates);
const warnText = (input: TransferTaxInput) => (run(input).warnings ?? []).join("\n");

describe("§156의2⑥ — 상속 입주권 + 일반주택 (직접 의제)", () => {
  it("★ 요건 충족 → 비과세 유지 (종전에는 경고만 났다)", () => {
    const r = run(inheritedCase());
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("⭐ **타이밍 요건이 없다** — 3년을 훌쩍 넘겨도 ⑥은 그대로 적용된다", () => {
    // 권리 2016-10-01 + 3년 = 2019-10-01 ≪ 양도 2024-06-01. ③④를 태웠다면 배제됐을 조합.
    const r = run(inheritedCase());
    expect(r.isExempt).toBe(true);
    // ③④ 경로였다면 「3년 초과」 경고가 붙었을 것이다
    expect((r.warnings ?? []).join("\n")).not.toContain("소득세법 시행규칙 §75 ①");
  });

  it("🔑 1년 요건도 없다 — 종전주택 취득 직후 상속받아도 적용된다", () => {
    const r = run(
      inheritedCase({
        presaleRights: [right({ isInherited: true, acquisitionDate: new Date("2015-08-01") })],
      }),
    );
    expect(r.isExempt).toBe(true);
  });

  it("분양권도 같다 — §156의3④", () => {
    // ⚠️ 분양권은 기산일 게이트 탓에 이 mock에서 §89② 대상이 아니다(대조군).
    const r = run(
      inheritedCase({
        presaleRights: [right({ type: "presale_right", isInherited: true })],
      }),
    );
    expect(r.isExempt).toBe(true);
  });
});

describe("§156의2⑥ 본문 괄호·단서 — 인정되지 않는 경우", () => {
  /** 인정 실패 시 그 권리는 **일반 권리**로 취급되어 ③④ 타이밍 판정을 탄다. */
  function disqualified(over: Partial<PresaleRight>) {
    return run(inheritedCase({ presaleRights: [right({ isInherited: true, ...over })] }));
  }

  it("★ 피상속인이 상속개시 당시 **주택**을 보유 → 인정 안 됨 ⇒ 일반 권리로 타이밍 판정", () => {
    const r = disqualified({ decedentOwnedHouseAtDeath: true });
    // 3년 초과인데 예외 선언이 없으므로 판정 불가로 남는다(과세로 뒤집지 않는다)
    expect(r.isExempt).toBe(true);
    expect((r.warnings ?? []).join("\n")).toContain("소득세법 시행규칙 §75 ①");
  });

  it("피상속인이 **다른 종류의 권리**를 보유 → 인정 안 됨", () => {
    const r = disqualified({ decedentOwnedOtherRightTypeAtDeath: true });
    expect((r.warnings ?? []).join("\n")).toContain("소득세법 시행규칙 §75 ①");
  });

  it("⭐ §156의2⑮ 선택은 **권리 요건만** 면제한다 — 주택 요건은 그대로다", () => {
    const withChoice = (over: Partial<PresaleRight>) =>
      run(
        inheritedCase({
          presaleRights: [right({ isInherited: true, ...over })],
          inheritedRightChoiceWhenBothHeld: "redevelopment_right",
        }),
      );
    // 권리 보유 → ⑮ 선택으로 면제되어 ⑥이 적용된다(타이밍 경고 없음)
    expect(
      (withChoice({ decedentOwnedOtherRightTypeAtDeath: true }).warnings ?? []).join("\n"),
    ).not.toContain("소득세법 시행규칙 §75 ①");
    // 주택 보유 → ⑮로도 면제되지 않는다
    expect(
      (withChoice({ decedentOwnedHouseAtDeath: true }).warnings ?? []).join("\n"),
    ).toContain("소득세법 시행규칙 §75 ①");
  });

  it("🔑 ⑮ 선택은 **선택한 종류**에만 적용된다", () => {
    const r = run(
      inheritedCase({
        presaleRights: [right({ isInherited: true, decedentOwnedOtherRightTypeAtDeath: true })],
        inheritedRightChoiceWhenBothHeld: "presale_right", // 입주권이 아니라 분양권을 선택
      }),
    );
    expect((r.warnings ?? []).join("\n")).toContain("소득세법 시행규칙 §75 ①");
  });

  it("순위 부적격 선언 → 인정 안 됨 (§156의2⑥1~3호)", () => {
    const r = disqualified({ isRankingDisqualifiedInheritedRight: true });
    expect((r.warnings ?? []).join("\n")).toContain("소득세법 시행규칙 §75 ①");
  });

  it("공동상속 · 최대지분 아님 → 다른 사람 소유로 본다 (§156의2⑦3호가)", () => {
    const r = disqualified({ isCoInherited: true });
    expect((r.warnings ?? []).join("\n")).toContain("소득세법 시행규칙 §75 ①");
  });

  it("공동상속 · 최대지분이면 인정된다", () => {
    const r = disqualified({ isCoInherited: true, isLargestCoInheritedShareholder: true });
    expect((r.warnings ?? []).join("\n")).not.toContain("소득세법 시행규칙 §75 ①");
  });

  it("🔑 단서 — 상속개시 당시 **동일세대**면 원칙 배제", () => {
    const r = disqualified({ decedentSameHouseholdAtInheritance: true });
    expect((r.warnings ?? []).join("\n")).toContain("소득세법 시행규칙 §75 ①");
  });

  it("🔑 단서의 예외 — 동거봉양 합가 전부터 보유하던 주택이 전환된 경우면 인정", () => {
    const r = disqualified({
      decedentSameHouseholdAtInheritance: true,
      parentalCareMergeInheritedRight: true,
    });
    expect((r.warnings ?? []).join("\n")).not.toContain("소득세법 시행규칙 §75 ①");
  });

  it("일반주택이 상속개시일 소급 2년 내 피상속인 증여분이면 인정 안 됨", () => {
    const r = run(inheritedCase({ generalHouseGiftedFromDecedentWithin2yr: true }));
    expect((r.warnings ?? []).join("\n")).toContain("소득세법 시행규칙 §75 ①");
  });
});

describe("⭐ 긍정 선언이 없으면 판정하지 않는다", () => {
  it("★ `generalHouseHeldAtInheritance` 미선언 → **판정 불가** (배제하지 않는다)", () => {
    const r = run(inheritedCase({ generalHouseHeldAtInheritance: undefined }));
    expect(r.isExempt).toBe(true);
    expect((r.warnings ?? []).join("\n")).toContain("§156의2 ⑥·⑦");
  });

  it("상속 권리 **2개 이상** → 조문이 「1개」 전제라 판정 불가", () => {
    const r = run(
      inheritedCase({
        presaleRights: [right({ isInherited: true }), right({ id: "r2", isInherited: true })],
      }),
    );
    expect(r.isExempt).toBe(true);
    expect((r.warnings ?? []).join("\n")).toContain("§156의2 ⑥·⑦");
  });
});

describe("§156의2⑦ — 상속 권리 + 일반주택 + **상속 외** 권리 (U-2의 상속 축)", () => {
  /** 상속 1 + 상속 외 1 = 1주택 + 2권리. 준용 타이밍의 상대는 **상속 외 권리**다. */
  function article7(otherAcquiredAt: string, over: Partial<TransferTaxInput> = {}) {
    return run(
      inheritedCase({
        presaleRights: [
          right({ id: "inh", isInherited: true, acquisitionDate: new Date("2016-10-01") }),
          right({ id: "own", acquisitionDate: new Date(otherAcquiredAt) }),
        ],
        ...over,
      }),
    );
  }

  it("★ 상속 외 권리가 ③ 요건을 충족 → 비과세 유지", () => {
    // 상속 외 권리 2022-01-01 취득(종전주택 2015-06-01 + 1년 경과) → 3년 기한 2025-01-01 > 양도 2024-06-01
    const r = article7("2022-01-01");
    expect(r.isExempt).toBe(true);
    expect((r.warnings ?? []).join("\n")).toEqual("");
  });

  it("⭐ 타이밍의 상대는 **상속 외 권리**다 — 상속 권리 취득일은 보지 않는다", () => {
    // 상속 권리(2016-10-01)만 보면 3년 초과지만, 상속 외 권리(2022-01-01)는 3년 이내다.
    const r = article7("2022-01-01");
    expect((r.warnings ?? []).join("\n")).not.toContain("소득세법 시행규칙 §75 ①");
  });

  it("상속 외 권리가 1년 요건 미충족 → 배제 확정", () => {
    // 종전주택 2015-06-01 → 상속 외 권리 2015-10-01(4개월)
    const r = article7("2015-10-01");
    expect(r.isExempt).toBe(false);
  });

  it("🔑 상속 권리가 **인정되지 않으면** ⑦이 아니라 U-2(권리 2개)로 남는다", () => {
    const r = run(
      inheritedCase({
        presaleRights: [
          right({ id: "inh", isInherited: true, decedentOwnedHouseAtDeath: true }),
          right({ id: "own", acquisitionDate: new Date("2022-01-01") }),
        ],
      }),
    );
    expect(r.isExempt).toBe(true);
    expect((r.warnings ?? []).join("\n")).toContain("§156의2 ⑦·⑧·⑨");
  });

  it("상속 외 권리가 2개면 ⑦의 「각각 1개씩」을 벗어난다 → 판정 불가", () => {
    const r = run(
      inheritedCase({
        presaleRights: [
          right({ id: "inh", isInherited: true }),
          right({ id: "o1", acquisitionDate: new Date("2022-01-01") }),
          right({ id: "o2", acquisitionDate: new Date("2022-02-01") }),
        ],
      }),
    );
    expect((r.warnings ?? []).join("\n")).toContain("§156의2 ⑦·⑧·⑨");
  });
});

describe("회귀 — 상속과 무관한 경로는 그대로다", () => {
  it("상속 선언이 없으면 종전 판정(③ 타이밍)이 그대로 적용된다", () => {
    const r = run(
      inheritedCase({
        presaleRights: [right()],
        transferDate: new Date("2019-06-01"),
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(warnText(inheritedCase({ presaleRights: [right()], transferDate: new Date("2019-06-01") }))).toEqual("");
  });

  it("상속 선언이 없으면 1년 요건 미충족은 여전히 배제다", () => {
    const r = run(
      inheritedCase({
        presaleRights: [right({ acquisitionDate: new Date("2015-10-01") })],
      }),
    );
    expect(r.isExempt).toBe(false);
  });
});
