/**
 * anchor: D7-08 잔여 — 조특령 §66④1호 **단서의 목 구성은 시대에 따라 다르다**.
 *
 * 판정은 불리언 하나(`hasIncorporationProvisoException`)라 **세액은 변하지 않는다**.
 * 갈리는 것은 **인용 문구**다 — 구 사안에 「가·나·다목」이라 쓰면 있지도 않은 목을 인용한다.
 *
 * 원문 경계 (2026-09-14 법제처 `target=eflaw` 실측):
 *   · 2005-02-19 시행본(mst 66868): 「다만, 다음 각목의 1에 해당하는 **대규모 개발사업지역**
 *     … 안에서 … 단계적 사업시행 또는 보상지연으로 … 3년이 지난 농지를 제외한다.
 *     가. 토지소유자가 1천명 이상인 지역 나. 사업시행면적이 … 규모 이상인 지역」
 *     ⇒ 가·나는 **지역의 규모 기준**. 예외 사유는 1종.
 *   · 2008-02-22 시행본(mst 83146 · 대통령령 제20620호): 「다음 각 목의 어느 하나에 해당하는
 *     **경우**는 제외한다. 가·나·다」 ⇒ 예외 **3종**.
 */
import { describe, it, expect } from "vitest";
import {
  SELF_FARMING_PROVISO_3MOK_FROM,
  selfFarmingProvisoLabel,
  calculateSelfFarmingReduction,
} from "@/lib/tax-engine/self-farming-reduction";

const D = (s: string) => new Date(s);

describe("§66④1호 단서 인용 문구 — 양도일별", () => {
  it("E-1: 2008.2.22. 이후 양도 → 「가·나·다목」", () => {
    expect(selfFarmingProvisoLabel(D("2026-05-01"))).toContain("가·나·다목");
  });

  it("E-2: 2008.2.21. 이전 양도 → 목을 인용하지 않는다", () => {
    const label = selfFarmingProvisoLabel(D("2007-06-01"));
    expect(label).not.toContain("가·나·다목");
    expect(label).toContain("2008.2.21. 이전");
  });

  it("E-3: 경계 — 2008.2.22.은 현행, 2008.2.21.은 구 문언", () => {
    expect(selfFarmingProvisoLabel(D("2008-02-22"))).toContain("가·나·다목");
    expect(selfFarmingProvisoLabel(D("2008-02-21"))).not.toContain("가·나·다목");
    expect(SELF_FARMING_PROVISO_3MOK_FROM.getTime()).toBe(D("2008-02-22").getTime());
  });

  it("E-4: 양도일 미입력·빈 문자열 → 현행 기준 (⑤ UI와 같은 기본값)", () => {
    expect(selfFarmingProvisoLabel(undefined)).toContain("가·나·다목");
    expect(selfFarmingProvisoLabel("")).toContain("가·나·다목");
  });

  it("E-5: ISO 문자열도 같은 경계로 판정한다 (⑤가 문자열을 넘긴다)", () => {
    expect(selfFarmingProvisoLabel("2007-06-01")).not.toContain("가·나·다목");
    expect(selfFarmingProvisoLabel("2026-05-01")).toContain("가·나·다목");
  });
});

/**
 * E-6·E-7 — **엔진이 실제로 이 함수를 쓰는가**를 잰다.
 * 헬퍼만 단언하면 「라이브러리가 옳다」는 말일 뿐, breakdown이 옛 문구를 그대로 박아 둬도 통과한다
 * (memory `feedback_library_anchor_does_not_prove_component_uses_it`).
 */
describe("엔진 breakdown이 시대별 문구를 싣는다", () => {
  const base = {
    transferIncome: 500_000_000,
    farmingYears: 30,
    minFarmingYears: 8,
    acquisitionDate: D("1990-05-24"),
    incorporationDate: D("2000-01-01"),
    incorporationLocationType: "metro_or_city" as const,
    hasIncorporationProvisoException: true,
    standardPriceAtAcquisition: 100_000_000,
    standardPriceAtIncorporation: 300_000_000,
    standardPriceAtTransfer: 600_000_000,
  };

  it("E-6: 2007년 양도 → breakdown에 「가·나·다목」이 없다", () => {
    const r = calculateSelfFarmingReduction({ ...base, transferDate: D("2007-06-01") });
    const line = r.breakdown.find((b) => b.includes("§66④1호")) ?? "";
    expect(line).toContain("3년 배제에서 제외");
    expect(line).not.toContain("가·나·다목");
  });

  it("E-7: 2026년 양도 → breakdown에 「가·나·다목」이 있다 (대조군)", () => {
    const r = calculateSelfFarmingReduction({ ...base, transferDate: D("2026-06-01") });
    const line = r.breakdown.find((b) => b.includes("§66④1호")) ?? "";
    expect(line).toContain("가·나·다목");
  });
});
