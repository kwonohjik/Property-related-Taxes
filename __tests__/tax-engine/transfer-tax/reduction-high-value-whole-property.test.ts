/**
 * A4 — 감면 고가주택 가액 요건은 **물건 전체 가액** 기준(§99의3·§99).
 *
 * ## 결함
 *
 * `income-deduction-router.ts`가 §99의3·§99 평가기에 **지분 스케일된** `ctx.transferPrice`를
 * 넘기고 있었다(`transfer-tax.ts` → `input.transferPrice` → API `applyRatio(totalContractPrice, ratio)`).
 * 감면 가액 요건은 물건 전체 가액 기준이므로, 지분분을 쓰면 **문턱이 1/지분율만큼 올라간다**:
 *
 * | 지분 | 엔진 도달 양도가액 | 12억 판정 | 실효 문턱(물건 전체) |
 * |---|---|---|---|
 * | 100% | 20억 | 고가주택 ✅ | 12억 |
 * | **50%** | **10억** | **아님 ❌** | **24억** |
 *
 * 고가주택 배제를 피해 감면이 부당하게 유지된다(과소과세).
 *
 * 같은 판정 객체 안에서 기준시가(`standardPriceAtAcquisition993` 등)는 **감면 전용 폼 필드**라
 * raw 100%인데 양도가액만 지분분인 **혼합 스케일**이었다.
 *
 * ## 정정
 *
 * 필드명을 `transferPrice` → **`wholePropertyTransferPrice`**로 바꿔 계약을 이름에 못박고,
 * 라우터가 `ctx.totalPropertyTransferPrice ?? ctx.transferPrice`를 전달한다.
 * `totalPropertyTransferPrice`는 §89 12억 안분이 이미 쓰던 100% echo다(`transfer-tax.ts:447-465`) —
 * **같은 고가주택 개념인데 §89 경로만 처리돼 있었다.**
 *
 * rename 시 tsc가 기존 호출부 9곳을 전부 지목했다 — 이제 지분분을 조용히 넘길 수 없다.
 */
import { describe, it, expect } from "vitest";
import { isHighValueHouseUnder993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { resolveIncomeDeduction } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";

const TRANSFER_DATE = new Date("2024-05-01"); // 12억 구간 (2021-12-08~)

// ════════════════════════════════════════════════════════════
// H1 — 판정기 자체: 시점별 임계 매트릭스
//   §99의3 고가주택 기준은 취득시점대별로 갈린다. 각 구간에서 물건 전체 기준으로 판정된다.
// ════════════════════════════════════════════════════════════
describe("H1: 고가주택 임계 — 시점 매트릭스", () => {
  const cases: Array<[string, Date, number, number, boolean]> = [
    // [설명, 기준일, 물건전체 양도가, 전용면적, 고가주택인가]
    ["2002-09-30 이전 — 6억 + 165㎡ (AND)", new Date("2002-06-01"), 700_000_000, 170, true],
    ["2002-09-30 이전 — 6억 초과이나 면적 미달", new Date("2002-06-01"), 700_000_000, 100, false],
    ["2002-12-31 이전 — 6억 + 149㎡ (AND)", new Date("2002-11-01"), 700_000_000, 150, true],
    ["2008-10-05 이전 — 6억 단독", new Date("2005-01-01"), 700_000_000, 60, true],
    ["2021-12-07 이전 — 9억 단독", new Date("2015-01-01"), 1_000_000_000, 60, true],
    ["2021-12-07 이전 — 9억 이하", new Date("2015-01-01"), 800_000_000, 60, false],
    ["2021-12-08 이후 — 12억 단독", TRANSFER_DATE, 1_300_000_000, 60, true],
    ["2021-12-08 이후 — 12억 이하", TRANSFER_DATE, 1_100_000_000, 60, false],
  ];
  for (const [label, base, price, area, expected] of cases) {
    it(label, () => {
      expect(isHighValueHouseUnder993(base, price, area)).toBe(expected);
    });
  }
});

// ════════════════════════════════════════════════════════════
// H2 — 라우터: 지분 모드에서 물건 전체 값이 판정에 쓰인다
// ════════════════════════════════════════════════════════════
describe("H2: 라우터가 물건 전체 양도가액을 넘긴다", () => {
  // §99의3 취득기간은 2001.5.23~2003.6.30이고 고가주택 기준일은
  // `contractDate ?? usageApprovalDate ?? acquisitionDate`(new-99-3.ts:279)다.
  // → 이 조문에서 실제로 적용되는 임계는 **6억**(2008-10-05 이전 구간, 면적요건 없음)이다.
  //   물건 전체 11억 / 지분 50% 5.5억으로 두면 두 값의 판정이 **반대**가 된다(판별력).
  const CONTRACT = new Date("2003-01-15");
  const baseCtx = {
    transferDate: TRANSFER_DATE,
    acquisitionDate: new Date("2003-02-01"),
    standardPriceAtTransfer: 900_000_000,
    transferIncome: 300_000_000,
  };
  const reductions993 = [
    {
      type: "new_99_3",
      contractDate993: CONTRACT,
      usageApprovalDate993: new Date("2003-02-01"),
      standardPriceAtAcquisition993: 300_000_000,
      standardPriceAt5Years: 500_000_000,
      standardPriceAtTransfer993: 900_000_000,
      exclusiveAreaSqm993: 60,
    },
  ];

  /** 불적격 사유는 조문 detail에서 직접 읽는다 — 라우터 요약 필드보다 정밀하다. */
  const reasonOf = (ctx: Record<string, unknown>) => {
    const r = resolveIncomeDeduction(reductions993 as never, { ...baseCtx, ...ctx } as never);
    const detail = r.new993Detail;
    expect(detail, "§99의3 평가기가 호출되지 않았다 — fixture의 기간 요건을 확인하라").toBeDefined();
    return detail!.ineligibleReasons.map((x) => x.message).join(" · ");
  };

  it("🔴 지분 50% — 물건 전체 11억이면 지분분 5.5억이어도 고가주택으로 배제된다", () => {
    const reason = reasonOf({
      transferPrice: 550_000_000, // 지분분 (엔진 도달값) — 6억 이하
      totalPropertyTransferPrice: 1_100_000_000, // 물건 전체 — 6억 초과
    });
    expect(reason, "물건 전체 11억 > 6억이므로 고가주택 배제여야 한다").toMatch(/고가주택/);
  });

  it("단독소유 — 100% echo가 없으면 transferPrice로 후퇴한다 (회귀 가드)", () => {
    const withEcho = reasonOf({
      transferPrice: 1_100_000_000,
      totalPropertyTransferPrice: 1_100_000_000,
    });
    const withoutEcho = reasonOf({ transferPrice: 1_100_000_000 });
    expect(withoutEcho).toBe(withEcho);
    expect(withoutEcho).toMatch(/고가주택/);
  });

  it("물건 전체가 임계 이하면 고가주택 사유가 없다", () => {
    const reason = reasonOf({
      transferPrice: 250_000_000,
      totalPropertyTransferPrice: 500_000_000,
    });
    expect(reason).not.toMatch(/고가주택/);
  });
});

// ════════════════════════════════════════════════════════════
// H3 — 판별력 가드
//   지분분을 넘기면 판정이 실제로 뒤집히는 fixture임을 고정한다.
//   (두 값이 같은 결론을 내는 입력으로 anchor를 세우면 회귀를 못 잡는다)
// ════════════════════════════════════════════════════════════
describe("H3: 판별력 — 지분분 vs 물건 전체가 실제로 갈린다", () => {
  it("20억 물건의 50% 지분 — 두 값의 판정이 반대다", () => {
    expect(isHighValueHouseUnder993(TRANSFER_DATE, 2_000_000_000, 60)).toBe(true);
    expect(isHighValueHouseUnder993(TRANSFER_DATE, 1_000_000_000, 60)).toBe(false);
  });
});
