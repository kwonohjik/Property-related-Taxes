/**
 * anchor — §89② 배제의 **3년 초과 예외** (C1-01 Phase 2)
 *
 * ## 조문
 *
 * Phase 1은 「권리 취득일부터 3년이 지나 종전주택을 양도」한 세대를 `undetermined`로 두고
 * 경고만 냈다. 그 조합에 남은 예외는 **둘뿐**이다(16항 전수 대조):
 *
 * > **시행령 §156의2④**(입주권) · **§156의3③**(분양권) — … 3년이 지나 종전주택을 양도하는
 * > 경우로서 다음 각 호의 요건을 **모두** 갖춘 때
 * >   1. … 취득하는 주택이 **완성된 후 3년 이내**에 그 주택으로 **세대전원이 이사**하여
 * >      **1년 이상 계속하여 거주**할 것
 * >   2. … 취득하는 주택이 **완성되기 전 또는 완성된 후 3년 이내**에 종전의 주택을 양도할 것
 *
 * > **시행규칙 §75①** — 「3년 이내에 양도하지 못하는 경우로서 재정경제부령으로 정하는 사유」란
 * > 권리를 취득한 날부터 **3년이 되는 날 현재** ①매각의뢰 ②경매 신청 ③공매 진행 중인 경우로서
 * > **해당 각 호의 어느 하나의 방법에 따라 양도된 경우**를 말한다.
 *
 * ## 🔑 §155①·§155⑱을 복사하면 두 군데가 틀린다
 *
 * 1. **§75①의 사유는 3개뿐**이다 — §155⑱의 4호(현금청산금 소송)·5호(수용재결·매도청구)가 없다.
 * 2. **§75①은 요건이 둘**이다 — 「3년이 되는 날 현재 해당」 **그리고** 「그 방법에 따라 **양도된**
 *    경우」. §155⑱은 전자만 요구한다(`judgeTemporaryTwoHouseTiming`).
 *
 * ## ⭐ 미입력은 「미해당」이 아니다
 *
 * 신규 필드라 기존 저장분에 값이 없다. 미입력을 미해당으로 읽으면 3년 초과 세대 **전체**가
 * 갑자기 과세로 뒤집힌다 ⇒ 선언이 없으면 `undetermined`를 유지한다. 「해당 없음」은
 * `kind: "none"`으로 **명시 선언**해야 배제가 확정된다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { RightThreeYearException } from "@/lib/tax-engine/types/transfer.types";

const mockRates = makeMockRates();

/**
 * 1주택 + 입주권 1개. 종전주택 2015-06-01 취득 → 입주권 2016-10-01 취득(1년 경과 ✓) →
 * 3년 기한 2019-10-01. 양도 2024-06-01 ⇒ **3년 초과**.
 */
function overThreeYears(
  exception: RightThreeYearException | undefined,
  over: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    residencePeriodMonths: 60,
    presaleRights: [rightAt("2016-10-01")],
    rightThreeYearException: exception,
    ...over,
  });
}

function rightAt(iso: string, over: Partial<PresaleRight> = {}): PresaleRight {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: new Date(iso),
    region: "capital",
    ...over,
  };
}

const run = (input: TransferTaxInput) => calculateTransferTax(input, mockRates);
const warnText = (input: TransferTaxInput) => (run(input).warnings ?? []).join("\n");

/** ④1호·2호를 모두 충족하는 선언 — 완성 2023-01-01, 양도 2024-06-01(완성+3년 이내). */
const NEW_HOUSE_OK: RightThreeYearException = {
  kind: "new_house",
  completionDate: new Date("2023-01-01"),
  movedInWithin3Years: true,
  residedOneYearOrMore: true,
};

describe("§156의2④ · §156의3③ — 신축주택 완성·이주", () => {
  it("★ 1호·2호 모두 충족 → 비과세 유지 (종전에는 경고만 났다)", () => {
    const r = run(overThreeYears(NEW_HOUSE_OK));
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("★ 1호 미충족(이사 X) → §89② 배제 확정 ⇒ 과세", () => {
    const r = run(overThreeYears({ ...NEW_HOUSE_OK, movedInWithin3Years: false }));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("★ 1호 미충족(1년 거주 X) → 배제", () => {
    expect(run(overThreeYears({ ...NEW_HOUSE_OK, residedOneYearOrMore: false })).isExempt).toBe(
      false,
    );
  });

  it("🔑 2호 — 「완성되기 **전**」 양도는 완성일 비교 없이 충족한다", () => {
    const r = run(
      overThreeYears({ ...NEW_HOUSE_OK, completionDate: new Date("2025-01-01") }), // 양도 2024-06-01 < 완성
    );
    expect(r.isExempt).toBe(true);
  });

  it("🔑 2호 — 완성 후 3년을 넘겨 양도하면 배제", () => {
    const r = run(overThreeYears({ ...NEW_HOUSE_OK, completionDate: new Date("2021-01-01") }));
    // 완성 2021-01-01 + 3년 = 2024-01-01 < 양도 2024-06-01
    expect(r.isExempt).toBe(false);
  });

  it("경계: 완성일 + 3년 **당일** 양도는 「3년 이내」다", () => {
    const r = run(
      overThreeYears(
        { ...NEW_HOUSE_OK, completionDate: new Date("2021-06-01") },
        { transferDate: new Date("2024-06-01") },
      ),
    );
    expect(r.isExempt).toBe(true);
  });

  it("분양권도 같은 leaf가 담당한다 (§156의3③ — 문언 동형)", () => {
    const r = run(
      overThreeYears(NEW_HOUSE_OK, {
        presaleRights: [rightAt("2016-10-01", { type: "presale_right" })],
      }),
    );
    // ⚠️ 분양권 축은 기산일 게이트 탓에 이 mock에서 §89② 대상이 아니다 —
    //    그래서 §89② 자체가 발동하지 않고 비과세가 유지된다(대조군).
    expect(r.isExempt).toBe(true);
  });
});

describe("시행규칙 §75① — 경매·공매 등 (3년 초과 치유)", () => {
  it("★ 사유 해당 + 그 방법으로 양도 → 비과세 유지", () => {
    const r = run(
      overThreeYears({ kind: "delay", reason: "auction", disposedByThatMethod: true }),
    );
    expect(r.isExempt).toBe(true);
  });

  it("⭐ **요건이 둘이다** — 사유만 있고 그 방법으로 양도하지 않았으면 배제", () => {
    // §155⑱은 「사유 해당」만 요구한다. 그쪽을 복사하면 이 케이스가 조용히 통과한다.
    const r = run(
      overThreeYears({ kind: "delay", reason: "auction", disposedByThatMethod: false }),
    );
    expect(r.isExempt).toBe(false);
  });

  it("세 사유 모두 같은 판정 (§75① 1~3호)", () => {
    for (const reason of ["kamco", "auction", "public_sale"] as const) {
      const r = run(overThreeYears({ kind: "delay", reason, disposedByThatMethod: true }));
      expect(r.isExempt, reason).toBe(true);
    }
  });
});

describe("⭐ 선언 유무가 판정을 가른다", () => {
  it("미선언(undefined) → **종전대로 판정 불가** + 경고 유지", () => {
    const r = run(overThreeYears(undefined));
    expect(r.isExempt).toBe(true); // 종전 동작
    const joined = (r.warnings ?? []).join("\n");
    expect(joined).toContain("§156의2 ④");
    expect(joined).toContain("소득세법 시행규칙 §75 ①");
  });

  it("★ `none` **명시 선언** → 그때 비로소 배제가 확정된다", () => {
    const r = run(overThreeYears({ kind: "none" }));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
    // 판정했으므로 「확인하세요」 경고는 사라진다
    expect((r.warnings ?? []).join("\n")).not.toContain("소득세법 시행규칙 §75 ①");
  });

  it("🔑 3년 **이내** 양도에는 이 선언이 아무 영향이 없다 (§156의2③이 먼저 충족)", () => {
    const within = { transferDate: new Date("2019-06-01") };
    expect(run(overThreeYears(undefined, within)).isExempt).toBe(true);
    expect(run(overThreeYears({ kind: "none" }, within)).isExempt).toBe(true);
  });
});

describe("§156의2⑬ · §156의3⑩ 사후관리 — 자기선언 인정 시 추징 경고", () => {
  it("★ ④로 인정하면 추징 경고가 붙는다", () => {
    expect(warnText(overThreeYears(NEW_HOUSE_OK))).toContain("추징");
  });

  it("§75① 경로는 자기선언 사후관리 대상이 아니다 (⑬은 ④1호·⑤2호만 든다)", () => {
    const t = warnText(
      overThreeYears({ kind: "delay", reason: "kamco", disposedByThatMethod: true }),
    );
    expect(t).not.toContain("추징");
  });

  it("🔑 배제된 경우에는 경고하지 않는다 — 비과세를 받지 않았으면 추징 리스크가 없다", () => {
    const t = warnText(overThreeYears({ kind: "none" }));
    expect(t).not.toContain("추징");
  });
});
