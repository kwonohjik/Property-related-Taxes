/**
 * anchor — §89② 배제의 **합가(동거봉양·혼인)** 예외 (C1-01 Phase 4)
 *
 * ## 조문 (법제처 실독 · 시행령 MST 286211, 시행 2026-07-01)
 *
 * > **§156의2⑧** 제1호에 해당하는 자가 제2호에 해당하는 자를 **동거봉양**하기 위하여 세대를
 * > 합침으로써 1세대가 1주택과 1조합원입주권, **1주택과 2조합원입주권**, 2주택과 1조합원입주권
 * > 또는 2주택과 2조합원입주권 등을 소유하게 되는 경우 **합친 날부터 10년 이내에 먼저 양도하는
 * > 주택**(최초양도주택)이 **제3호, 제4호 또는 제5호**에 따른 주택 중 어느 하나에 해당하는
 * > 경우에는 이를 1세대1주택으로 보아 제154조제1항을 적용한다.
 * >   3. 합친 날 이전에 제1호**가목**(1주택) 또는 제2호가목에 해당하는 자가 소유하던 주택
 * >   4. 합친 날 이전에 제1호**다목**(1주택과 1권리) 또는 제2호다목에 해당하는 자가 소유하던
 * >      주택. **다만, 다음 각 목의 어느 하나의 요건을 갖춘 경우로 한정한다.**
 * >      가. 합가전 조합원입주권이 **관리처분계획등의 인가로 인하여 최초 취득**된 것인 경우에는
 * >          최초양도주택이 … **사업시행계획 인가일 이후 취득**된 것으로서 **취득 후 1년 이상
 * >          거주**하였을 것
 * >      나. 합가전 조합원입주권이 **매매 등으로 승계취득**된 것인 경우에는 최초양도주택이
 * >          합가전 조합원입주권을 **취득하기 전부터 소유**하던 것일 것
 * >      다. 합친 날 이전 취득한 **분양권**으로서 최초양도주택이 … **취득하기 전부터 소유**하던 것일 것
 * >   5. 합친 날 이전에 제1호**나목**(권리만) 또는 제2호나목에 해당하는 자가 소유하던 1권리에
 * >      의하여 … **합친 날 이후에 취득하는 주택**
 *
 * > **§156의3⑥** … 1세대가 1주택과 1분양권 … 을 소유하게 되는 경우는 **제156조의2제8항 또는
 * > 제9항에 따른다**. ⇒ 분양권 축은 **별도 구현하지 않는다**(위임이라 진실이 둘이 된다).
 *
 * ## 🔑 ⑨(혼인)는 ⑧의 **호 번호가 하나씩 당겨진다**
 *
 * ⑨에는 「60세 이상 직계존속」인 제2호가 없어 제1호 하나뿐이다. 그래서
 * **2호 = ⑧3호 · 3호 = ⑧4호 · 4호 = ⑧5호**다. 한 상수로 묶으면 인용이 조용히 틀린다
 * (memory `feedback_rename_same_name_two_axes`와 같은 층위).
 *
 * ## ⭐ 「미선언」과 「해당 없음」은 다르다
 *
 * 합가 사실만 있고 합가 전 보유 구성을 선언하지 않으면 **판정 불가**(종전 동작 유지 + 경고)다.
 * 신규 필드라 기존 저장분에 값이 없고, 미입력을 미해당으로 읽으면 합가 세대 전체가 갑자기
 * 과세로 뒤집힌다(Phase 2·3과 같은 규약).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { MergedHouseholdFirstHouse } from "@/lib/tax-engine/types/transfer.types";

const mockRates = makeMockRates();
const run = (input: TransferTaxInput) => calculateTransferTax(input, mockRates);

const MERGE_DATE = new Date("2020-03-01");

function right(over: Partial<PresaleRight> = {}): PresaleRight {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: new Date("2016-10-01"),
    region: "capital",
    ...over,
  };
}

/**
 * 동거봉양 합가 세대 — 주택 1채 + 입주권 1개.
 *
 * 🔑 양도일(2024-06-01)은 권리 취득(2016-10-01) + **3년을 넘겼다**. 합가 예외가 없으면
 *    §156의2③이 탈락하므로, 이 케이스의 결과는 **오직 ⑧이 가른다**.
 */
function mergedCase(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2015-06-01"), // 합가일(2020-03-01) 이전 취득
    transferDate: new Date("2024-06-01"),
    residencePeriodMonths: 60,
    presaleRights: [right()],
    parentalCareMerge: { mergeDate: MERGE_DATE },
    isFirstTransferredInMerge: true,
    rightThreeYearException: { kind: "none" }, // 3년 초과 축은 명시적으로 닫는다
    ...over,
  });
}

const declare = (d: MergedHouseholdFirstHouse) => ({ mergedHouseholdFirstHouse: d });

/** 술어를 직접 호출해 **인용 문자열**까지 본다 — 세액만으로는 호 번호가 관측되지 않는다. */
function verdict(input: TransferTaxInput) {
  return resolveArticle89Clause2(input, undefined);
}

describe("⑧ 미선언 — 판정 불가(종전 동작 유지 + 경고)", () => {
  it("★ 합가 사실만 있고 합가 전 보유 구성을 선언하지 않으면 §156의2⑧을 안내한다", () => {
    const r = run(mergedCase());
    expect(r.isExempt).toBe(true); // 종전 동작 유지 — 불리하게 뒤집지 않는다
    const joined = (r.warnings ?? []).join("\n");
    expect(joined).toContain("§89②");
    expect(joined).toContain("§156의2 ⑧");
  });

  it("혼인 합가는 ⑨를 안내한다 (⑧이 아니다)", () => {
    const v = verdict(
      mergedCase({ parentalCareMerge: undefined, marriageMerge: { marriageDate: MERGE_DATE } }),
    );
    expect(v.status).toBe("undetermined");
    expect(v.openArticles).toContain("소득세법 시행령 §156의2 ⑨");
    expect(v.openArticles).not.toContain("소득세법 시행령 §156의2 ⑧");
  });
});

describe("⑧3호(⑨2호) — 합친 날 이전에 1주택만 소유하던 자의 주택", () => {
  it("★ 선언하면 3년을 넘겨도 비과세가 유지된다", () => {
    const r = run(mergedCase(declare({ kind: "house_only" })));
    expect(r.isExempt).toBe(true);
    expect(r.warnings ?? []).toEqual([]);
  });

  it("★ 세액이 실제로 움직인다 — 「해당 없음」 선언은 과세로 간다", () => {
    const met = run(mergedCase(declare({ kind: "house_only" })));
    const none = run(mergedCase(declare({ kind: "none" })));
    expect(met.totalTax).toBe(0);
    expect(none.totalTax).toBeGreaterThan(0);
  });

  it("🔑 「합친 날 이전에 소유하던」 요건 — 합가 후 취득한 주택은 3호가 아니다", () => {
    const v = verdict(
      mergedCase({
        ...declare({ kind: "house_only" }),
        acquisitionDate: new Date("2021-01-01"), // 합가일 이후
      }),
    );
    expect(v.status).toBe("excluded");
  });

  it("🔑 ⑨(혼인)는 **2호**로 인용한다 — 호 번호가 하나 당겨진다", () => {
    const v = verdict(
      mergedCase({
        ...declare({ kind: "house_only" }),
        parentalCareMerge: undefined,
        marriageMerge: { marriageDate: MERGE_DATE },
      }),
    );
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의2 ⑨2호");
  });

  it("동거봉양은 **3호**로 인용한다", () => {
    const v = verdict(mergedCase(declare({ kind: "house_only" })));
    expect(v.exception).toBe("소득세법 시행령 §156의2 ⑧3호");
  });
});

describe("⑧4호 단서 — 가·나·다목은 요건이 서로 다르다", () => {
  it("가목: 인가일 이후 취득 **그리고** 1년 이상 거주 — 둘 다 충족해야 한다", () => {
    const v = verdict(
      mergedCase(declare({ kind: "initial_right", acquiredAfterApproval: true, residedOneYear: true })),
    );
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의2 ⑧4호가목");
  });

  it("🔑 가목: 거주 요건이 빠지면 탈락한다 (한 요건으로 뭉치면 안 된다)", () => {
    const v = verdict(
      mergedCase(declare({ kind: "initial_right", acquiredAfterApproval: true, residedOneYear: false })),
    );
    expect(v.status).toBe("excluded");
  });

  it("🔑 가목: 인가일 이후 취득 요건이 빠져도 탈락한다", () => {
    const v = verdict(
      mergedCase(declare({ kind: "initial_right", acquiredAfterApproval: false, residedOneYear: true })),
    );
    expect(v.status).toBe("excluded");
  });

  it("나목(승계취득 입주권): 최초양도주택을 권리 취득 전부터 소유", () => {
    const ok = verdict(mergedCase(declare({ kind: "succeeded_right", ownedBeforeRight: true })));
    expect(ok.exception).toBe("소득세법 시행령 §156의2 ⑧4호나목");
    const ng = verdict(mergedCase(declare({ kind: "succeeded_right", ownedBeforeRight: false })));
    expect(ng.status).toBe("excluded");
  });

  it("다목(분양권): 같은 요건이지만 **다목**으로 인용한다", () => {
    const v = verdict(mergedCase(declare({ kind: "presale_right", ownedBeforeRight: true })));
    expect(v.exception).toBe("소득세법 시행령 §156의2 ⑧4호다목");
  });

  it("🔑 ⑨(혼인)에서는 4호가 **3호**가 된다", () => {
    const v = verdict(
      mergedCase({
        ...declare({ kind: "succeeded_right", ownedBeforeRight: true }),
        parentalCareMerge: undefined,
        marriageMerge: { marriageDate: MERGE_DATE },
      }),
    );
    expect(v.exception).toBe("소득세법 시행령 §156의2 ⑨3호나목");
  });
});

describe("⑧5호(⑨4호) — 권리만 갖던 자의 권리로 합친 날 **이후에** 취득한 주택", () => {
  it("★ 합가 후 취득이어야 5호다", () => {
    const v = verdict(
      mergedCase({
        ...declare({ kind: "right_only" }),
        acquisitionDate: new Date("2021-01-01"), // 합가일 이후
      }),
    );
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의2 ⑧5호");
  });

  it("🔑 합가 **이전** 취득이면 5호가 아니다 — 3·4호와 방향이 반대다", () => {
    const v = verdict(mergedCase(declare({ kind: "right_only" })));
    expect(v.status).toBe("excluded");
  });
});

describe("⑧ 본문 요건 — 10년 · 최초양도주택", () => {
  it("🔑 합친 날부터 **10년 이내**여야 한다", () => {
    const inTime = verdict(
      mergedCase({ ...declare({ kind: "house_only" }), transferDate: new Date("2030-03-01") }),
    );
    expect(inTime.status).toBe("exception_met"); // 경계 당일은 「10년 이내」

    const late = verdict(
      mergedCase({ ...declare({ kind: "house_only" }), transferDate: new Date("2030-03-02") }),
    );
    expect(late.status).toBe("excluded");
  });

  it("🔑 「**먼저 양도하는** 주택」이 아니면 적용되지 않는다", () => {
    const v = verdict(
      mergedCase({ ...declare({ kind: "house_only" }), isFirstTransferredInMerge: false }),
    );
    expect(v.status).toBe("excluded");
  });
});

describe("⭐ ⑧ 본문은 「1주택과 2조합원입주권」을 명문으로 열거한다 — U-2의 합가 축", () => {
  const twoRights = [
    right(),
    right({ id: "r2", acquisitionDate: new Date("2018-05-01") }),
  ];

  it("★ 권리가 2개여도 ⑧이 충족되면 비과세가 유지된다", () => {
    const r = run(mergedCase({ ...declare({ kind: "house_only" }), presaleRights: twoRights }));
    expect(r.isExempt).toBe(true);
    expect(r.warnings ?? []).toEqual([]);
  });

  it("🔑 합가 축이 「해당 없음」으로 닫히면 2권리 세대에 남는 예외가 없다 ⇒ 배제 확정", () => {
    // ⑦·§156의3⑤는 「상속 외 권리 **1개**」를 전제하므로 상속 권리가 없는 2권리 세대에는
    // 적용될 수 없고, ③·②·④·③은 「1주택과 **1**권리」 전제다.
    const v = verdict(mergedCase({ ...declare({ kind: "none" }), presaleRights: twoRights }));
    expect(v.status).toBe("excluded");
  });

  it("🔑 합가 축이 미선언이면 2권리 세대는 여전히 판정 불가다", () => {
    const v = verdict(mergedCase({ presaleRights: twoRights }));
    expect(v.status).toBe("undetermined");
    expect(v.openArticles).toContain("소득세법 시행령 §156의2 ⑧");
  });

  it("🔑 합가 사실이 아예 없는 2권리 세대도 배제 확정이다", () => {
    const v = verdict(
      mergedCase({
        presaleRights: twoRights,
        parentalCareMerge: undefined,
        isFirstTransferredInMerge: undefined,
      }),
    );
    expect(v.status).toBe("excluded");
  });
});

describe("합가 축은 §155④⑤와 술어를 공유하지 않는다", () => {
  it("🔑 §155④⑤는 합가 전 보유 구성을 묻지 않는다 — 2주택 합가 비과세는 그대로다", () => {
    // 권리가 없으면 §89② 자체가 적용되지 않으므로 ⑧ 선언과 무관하게 §155④가 판정한다.
    const r = run(
      mergedCase({
        presaleRights: [],
        householdHousingCount: 2,
        rightThreeYearException: undefined,
      }),
    );
    expect(r.isExempt).toBe(true);
  });
});
