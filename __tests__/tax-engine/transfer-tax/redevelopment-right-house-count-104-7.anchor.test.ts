/**
 * anchor(세액) — 조합원입주권이 §104⑦ 주택 수에서 조용히 빠졌다 (C1-02)
 *
 * `isPresaleRightCounted`가 `type`을 보지 않고 2021-01-01 취득일 게이트를 전 항목에 걸어,
 * 2021년 전에 취득한 **조합원입주권**이 주택 수에서 빠졌다. 그 결과 §104⑦**4호**(+30%p)
 * 사안이 **2호**(+20%p)로 계산됐다 — 방향은 **과소과세**다.
 *
 * 근거·부칙 실독은 `presale-right-type-date-gate.anchor.test.ts` 헤더에 있다.
 * 이 파일은 그 술어 정정이 **세액까지 실제로 움직이는지**를 본다 — 술어 단위 anchor만으로는
 * 호출부가 그 값을 쓰는지 알 수 없다(memory `feedback_leaf_anchor_skips_zod_layer`와 같은 층).
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import {
  defaultRules,
  makeHouse,
  makeInput,
  mockRegulatedHistory,
  suspensionNone,
} from "../_helpers/multi-house-mock";

/** 조정대상지역 주택 2채 — 양도주택 포함. 권리 1개를 더하면 합 3 ⇒ §104⑦4호. */
function judge(rights: PresaleRight[]) {
  return determineMultiHouseSurcharge(
    makeInput([makeHouse("h1"), makeHouse("h2")], {
      transferDate: new Date("2026-06-01"),
      presaleRights: rights,
    }),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );
}

const right = (over: Partial<PresaleRight>): PresaleRight =>
  ({
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: new Date("2019-05-01"),
    region: "capital",
    regionCriteria: "REGION",
    ...over,
  }) as PresaleRight;

describe("C1-02 세액 — 2021 이전 취득 조합원입주권의 §104⑦ 산입", () => {
  it("기준선: 권리 없음 → 주택 2채 ⇒ §104⑦2호 (+20%p)", () => {
    const r = judge([]);
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.effectiveHouseCount).toBe(2);
  });

  it("★ 2019년 취득 조합원입주권 → 합 3 ⇒ §104⑦4호 (+30%p)", () => {
    // 종전: 취득일 게이트에 걸려 미산입 → multi_house_2(+20%p)로 계산됐다.
    const r = judge([right({})]);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(r.effectiveHouseCount).toBe(3);
  });

  it("2021년 이후 취득 조합원입주권도 같다 (게이트가 있었을 때도 통과하던 축 — 회귀 가드)", () => {
    const r = judge([right({ acquisitionDate: new Date("2021-06-01") })]);
    expect(r.surchargeType).toBe("multi_house_3plus");
  });

  it("🔑 **분양권**은 갈린다 — 2021 이전 취득은 여전히 미산입", () => {
    const before = judge([
      right({ type: "presale_right", acquisitionDate: new Date("2019-05-01") }),
    ]);
    const after = judge([
      right({ type: "presale_right", acquisitionDate: new Date("2021-06-01") }),
    ]);
    expect(before.surchargeType).toBe("multi_house_2");
    expect(after.surchargeType).toBe("multi_house_3plus");
  });

  it("🔑 VALUE지역 3억 이하 조합원입주권은 취득일과 무관하게 미산입 (§167의11②1호)", () => {
    const r = judge([
      right({
        acquisitionDate: new Date("2019-05-01"),
        region: "non_capital",
        regionCriteria: "VALUE",
        rightValue: 300_000_000,
      }),
    ]);
    expect(r.surchargeType).toBe("multi_house_2");
  });
});
