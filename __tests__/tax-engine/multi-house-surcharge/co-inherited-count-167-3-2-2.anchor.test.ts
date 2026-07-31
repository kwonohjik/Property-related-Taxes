/**
 * anchor: 공동상속주택의 **중과 주택 수** 산정 — 영 §167의3②2호(§167의10②로 2주택에 준용).
 *
 * 계획서: docs/02-design/features/transfer-surcharge-155-deeming-coverage.plan.md §9.3 (F-8 / D-3)
 *
 * [법령 — 「소득세법 시행령」 MST 286211 · 시행 2026-07-01 · 법제처 실측]
 *   §167의3② 2. 공동상속주택: **상속지분이 가장 큰 상속인의 소유로 하여 주택수를 계산**하되,
 *     상속지분이 가장 큰 자가 2인 이상인 경우에는 제155조제3항 각호의 순서에 의한 자가
 *     당해 공동상속주택을 소유한 것으로 본다.
 *   §167의10② 제1항을 적용할 때 **제167조의3제2항부터 제8항까지 및 제10항을 준용**한다.
 *
 * 🔴 결함이었던 것: `isCoInherited`·`isLargestCoInheritedShareholder`는
 *    `transfer-inheritance-exclusion.ts`(**비과세** 주택 수)에서만 읽혔고, 그 단계는
 *    `transfer-tax.ts`의 중과 판정(STEP 0.5)보다 **뒤**다. 중과 쪽 `countEffectiveHouses`는
 *    상속 5년 규칙만 봐서, 상속 5년이 지난 공동상속 **소수지분** 주택이 주택 수에 산입됐다.
 *
 * ⚠️ §167의3②2호에는 §155③ 같은 「1개 주택」 한정이 없다 — 문언 그대로 공동상속주택마다 적용한다.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

/** 일반주택(h1) 양도 + 다른 주택 h2 */
function judge(otherOver: Record<string, unknown>) {
  return determineMultiHouseSurcharge(
    makeInput(
      [makeHouse("h1", { regionCode: "11680" }), makeHouse("h2", { regionCode: "11680", ...otherOver })],
      { sellingHouseId: "h1", transferDate: new Date("2026-06-01") },
    ),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );
}

/** 상속 5년 배제가 먼저 걸려 침묵 GREEN이 되지 않도록 **10년 경과**로 고정 */
const LONG_AGO = new Date("2015-01-01");

describe("D-3 — 공동상속주택 중과 주택 수 (§167의3②2호)", () => {
  it("🔴 소수지분 공동상속주택은 주택 수에 산입되지 않는다 → 중과 대상 아님", () => {
    const r = judge({
      isInherited: true,
      inheritedDate: LONG_AGO,
      isCoInherited: true,
      isLargestCoInheritedShareholder: false,
    });
    expect(r.effectiveHouseCount).toBe(1);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.excludedHouses.map((e) => e.reason)).toContain("co_inherited_minor_share");
  });

  it("지분 미신고(미제공)도 소수지분으로 본다 — 자기선언 boolean의 기본값", () => {
    const r = judge({ isInherited: true, inheritedDate: LONG_AGO, isCoInherited: true });
    expect(r.effectiveHouseCount).toBe(1);
  });

  it("최대지분자는 산입된다 (§167의3②2호 본문) → 2주택 중과 (회귀)", () => {
    const r = judge({
      isInherited: true,
      inheritedDate: LONG_AGO,
      isCoInherited: true,
      isLargestCoInheritedShareholder: true,
    });
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.surchargeType).toBe("multi_house_2");
  });

  it("단독상속(공동상속 아님)은 5년 경과 후 산입된다 (회귀)", () => {
    const r = judge({ isInherited: true, inheritedDate: LONG_AGO });
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.surchargeType).toBe("multi_house_2");
  });

  it("상속 5년 이내면 종전 사유(inherited_5years)가 먼저 적용된다 (우선순위 회귀)", () => {
    const r = judge({
      isInherited: true,
      inheritedDate: new Date("2024-01-01"), // 2026-06-01 기준 5년 미경과
      isCoInherited: true,
      isLargestCoInheritedShareholder: false,
    });
    expect(r.excludedHouses[0].reason).toBe("inherited_5years");
  });

  it("상속이 아닌 주택에 isCoInherited가 잘못 실려도 산입된다 (게이트 오작동 방지)", () => {
    const r = judge({ isInherited: false, isCoInherited: true });
    expect(r.effectiveHouseCount).toBe(2);
  });
});
