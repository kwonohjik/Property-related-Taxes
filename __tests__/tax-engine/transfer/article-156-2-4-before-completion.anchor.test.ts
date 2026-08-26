/**
 * anchor — §156의2④2호 **전단**(「완성되기 전」 양도)에 선언 경로가 없었다 (R-3)
 *
 * ## 조문 (법제처 실독 · 시행령 MST 286211, 시행 2026-07-01)
 *
 * > **§156의2④** … 조합원입주권을 취득한 날부터 **3년이 지나** 종전주택을 양도하는 경우로서
 * > 다음 각 호의 요건을 **모두** 갖춘 때에는 이를 1세대1주택으로 보아 제154조제1항을 적용한다.
 * >   1. … 취득하는 주택이 **완성된 후 3년 이내**에 그 주택으로 **세대전원이 이사** … 하여
 * >      **1년 이상 계속하여 거주**할 것
 * >   2. … 취득하는 주택이 **완성되기 전 또는 완성된 후 3년 이내**에 종전의 주택을 양도할 것
 *
 * §156의3③(분양권판)도 문언이 동형이다.
 *
 * ## 🔑 완성 전 양도이면 1호는 **장래 요건**이다
 *
 * 아직 완성되지 않았으니 이사·거주가 있을 수 없다. 그래서 **§156의2⑬**(분양권은 §156의3⑩)가
 * 「제4항**제1호**의 요건을 **충족하지 못하게 된 때**」의 추징을 따로 규정한다.
 * ⇒ 1호는 자기선언(장래 이행)이고, 2호 **전단**은 **완성일 없이** 성립한다.
 *
 * ## 🔴 종전 실측 — 완성일이 필수라 선언 자체가 막혔다
 *
 * · ⑧ `transfer-tax-validate.ts`가 「완성일을 입력하세요」로 **계산을 차단**
 * · ④ `buildRightThreeYearExceptionPayload`는 완성일이 비면 **키를 만들지 않음** ⇒ 판정 불가
 *
 * 사업이 진행 중이라 준공일이 정해지지 않은 세대는 **조문상 요건을 충족하는데도** 그 사실을
 * 선언할 칸이 없었다. 유일한 우회가 「예상 준공일」을 임의로 적는 것인데, 그 값은 조문에 없는
 * 입력이면서 3년 기한 계산에 **실제로 쓰인다**(memory `feedback_ui_gate_removes_sole_input_path`).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const mockRates = makeMockRates();
const run = (input: TransferTaxInput) => calculateTransferTax(input, mockRates);
const verdict = (input: TransferTaxInput) => resolveArticle89Clause2(input, undefined);

/** 권리 취득 2016-10-01 + 3년 = 2019-10-01 < 양도 2024-06-01 ⇒ **3년 초과** 경로로 들어간다. */
function right(over: Partial<PresaleRight> = {}): PresaleRight {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: new Date("2016-10-01"),
    region: "capital",
    ...over,
  };
}

function overThreeYears(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    residencePeriodMonths: 60,
    presaleRights: [right()],
    ...over,
  });
}

describe("④2호 전단 — 완성일 없이 판정된다", () => {
  it("기준선: 선언이 없으면 판정 불가로 남는다", () => {
    const v = verdict(overThreeYears());
    expect(v.status).toBe("undetermined");
    expect(v.openArticles).toContain("소득세법 시행령 §156의2 ④");
  });

  it("★ 「완성 전 양도」 선언만으로 예외가 성립한다 — 완성일을 요구하지 않는다", () => {
    const r = run(
      overThreeYears({
        rightThreeYearException: {
          kind: "before_completion",
          movedInWithin3Years: true,
          residedOneYearOrMore: true,
        },
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("★ 인용은 §156의2④다 — 사후관리(⑬) 경고가 붙어야 한다", () => {
    const v = verdict(
      overThreeYears({
        rightThreeYearException: {
          kind: "before_completion",
          movedInWithin3Years: true,
          residedOneYearOrMore: true,
        },
      }),
    );
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의2 ④");
  });

  it("🔑 1호(이사·거주)는 **장래 요건이라도 선언이 있어야** 한다", () => {
    for (const [moved, resided] of [
      [false, true],
      [true, false],
      [false, false],
    ] as const) {
      const v = verdict(
        overThreeYears({
          rightThreeYearException: {
            kind: "before_completion",
            movedInWithin3Years: moved,
            residedOneYearOrMore: resided,
          },
        }),
      );
      expect(v.status, `${moved}/${resided}`).toBe("excluded");
    }
  });

  it("🔑 분양권도 같다 — §156의3③으로 인용한다", () => {
    const v = resolveArticle89Clause2(
      overThreeYears({
        // 종전주택 2019-06-01 + 1년 < 분양권 2021-01-01, 그 + 3년(2024-01-01) < 양도 2024-06-01
        //   ⇒ **3년 초과** 경로에 실제로 도달한다(값을 잘못 잡으면 ②에서 이미 충족돼 측정 실패).
        acquisitionDate: new Date("2019-06-01"),
        presaleRights: [
          right({ type: "presale_right", acquisitionDate: new Date("2021-01-01") }),
        ],
        rightThreeYearException: {
          kind: "before_completion",
          movedInWithin3Years: true,
          residedOneYearOrMore: true,
        },
      }),
      new Date("2021-01-01"),
    );
    expect(v.exception).toBe("소득세법 시행령 §156의3 ③");
  });
});

describe("⭐ 사후관리 경고 — 완성 전 양도가 특히 중요하다", () => {
  it("★ §156의2⑬ 추징 안내가 결과에 남는다", () => {
    const r = run(
      overThreeYears({
        rightThreeYearException: {
          kind: "before_completion",
          movedInWithin3Years: true,
          residedOneYearOrMore: true,
        },
      }),
    );
    const joined = (r.warnings ?? []).join("\n");
    expect(joined).toContain("§156의2⑬");
  });
});

describe("회귀 — 완성 후 갈래는 그대로다", () => {
  const base = {
    kind: "new_house",
    movedInWithin3Years: true,
    residedOneYearOrMore: true,
  } as const;

  it("완성 후 3년 이내 양도 → 충족", () => {
    const v = verdict(
      overThreeYears({
        rightThreeYearException: { ...base, completionDate: new Date("2022-01-01") },
      }),
    );
    expect(v.status).toBe("exception_met");
  });

  it("완성 후 3년 초과 양도 → 배제", () => {
    const v = verdict(
      overThreeYears({
        rightThreeYearException: { ...base, completionDate: new Date("2020-01-01") },
      }),
    );
    expect(v.status).toBe("excluded");
  });

  it("🔑 완성일이 양도일보다 뒤면 `new_house` 갈래로도 「완성 전」이 성립한다", () => {
    // 예상 준공일을 넣은 기존 사용자의 저장분이 그대로 동작해야 한다(회귀 0).
    const v = verdict(
      overThreeYears({
        rightThreeYearException: { ...base, completionDate: new Date("2026-01-01") },
      }),
    );
    expect(v.status).toBe("exception_met");
  });
});
