/**
 * anchor: §104⑦ 중과의 **양도 대상은 「주택」뿐** — 조합원입주권·분양권 제외 (2026-08-25)
 *
 * 계획서: `docs/00-pm/transfer-right-to-move-in-surcharge-scope.plan.md`
 *
 * ## 법령 (KoreanLaw MCP 본문 실독 · 시행 2026-07-01본 · MST 280405)
 *
 * **§104⑦** — 「다음 각 호의 어느 하나에 해당하는 **주택**(이에 딸린 토지를 포함한다. 이하 이
 * 항에서 같다)을 **양도하는 경우** … 100분의 20(제3호 및 제4호의 경우 100분의 30)을 더한 세율」
 *
 * > 2호 「조정대상지역에 있는 **주택**으로서 1세대가 1주택과 **조합원입주권 또는 분양권**을
 * >   1개 보유한 경우의 **해당 주택**」
 * > 4호 「… 1세대가 주택과 **조합원입주권 또는 분양권**을 보유한 경우로서 그 수의 합이 3 이상인
 * >   경우 **해당 주택**」
 *
 * 🔑 입주권·분양권은 **주택 수를 세는 요소**로만 등장하고, 세율을 더할 대상은 언제나
 *    「해당 **주택**」이다. 각 호 어디에도 「조합원입주권을 양도하는 경우」가 없다.
 *    (입주권 = §94①2호**가**목 · 분양권 = §94①2호**나**목)
 *
 * **§95②** — 「"장기보유 특별공제액"이란 **제94조제1항제1호에 따른 자산**(… **같은 조 제7항 각
 * 호에 따른 자산은 제외한다**)으로서 보유기간이 3년 이상인 것 **및 제94조제1항제2호가목에 따른
 * 자산 중 조합원입주권**(조합원으로부터 취득한 것은 제외한다)에 대하여 …」
 *
 * 🔑 **§104⑦ 제외 괄호는 §94①1호 자산에만 붙어 있다.** 조합원입주권은 그 뒤 「및」로 병렬된
 *    **별개 항목**이고 그 항목엔 괄호가 없다 ⇒ 원조합원 입주권은 다주택이어도 LTHD 대상이다.
 *    승계분만 「조합원으로부터 취득한 것은 제외한다」로 빠진다(`transfer-tax-lthd.ts:84`).
 *    분양권(§94①2호**나**목)은 §95② 어느 항목에도 없어 애초에 LTHD 대상이 아니다.
 *
 * ## 종전 결함 — 지점이 **넷**이었다
 *
 * | # | 위치 | 증상 |
 * |---|---|---|
 * | A | fallback 집합에 입주권·분양권 | `houses[]` 없이 30%p |
 * | B | 정밀 분기가 **자산을 안 본다** | `houses[]`가 오면 A를 우회 |
 * | C | `rate-calc`가 `surchargeApplicable`을 **직접** 만듦 | leaf 게이트가 세율에 안 닿음 |
 * | D | 직전 배치가 §166 경로에 심은 §95② 배제 | 입주권에도 걸림 |
 *
 * ⭐ **A만 고치면 B가 뚫리고, A·B만 고치면 C 때문에 「세율은 중과인데 장특은 살아 있다」**는
 *    위법 상태가 된다(실측). 그래서 게이트를 leaf 최상단 단일 전제로 뒀다.
 *
 * ## 🔴 착수 전 안전망 = 0건
 *
 * 게이트를 적용한 채 전건(1,491파일 16,409테스트) **전부 통과**했다. 유일한 관련 anchor
 * (`successor-right-to-move-in.test.ts` V-1)는 **유예 창 안**을 보고 있어 구별력이 0이었다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  makeMockRatesWithHouseEngine,
  makeHouseInfo,
  baseTransferInput,
} from "../_helpers/mock-rates";
import { resolveSurchargeApplication } from "@/lib/tax-engine/transfer-tax-surcharge-predicate";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

/** ⚠️ 유예를 끈다(`surcharge_suspended: false`) — 유예 중이면 결론이 겹쳐 구별력이 사라진다. */
const rates = makeMockRatesWithHouseEngine();

/** 조정대상지역 · 세대 3주택 · 양도 2026-06-01(유예 종료 후) */
function base(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    transferDate: new Date("2026-06-01"),
    acquisitionDate: new Date("2020-05-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 3,
    householdRightCount: 1,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: 0,
    isSuccessorRightToMoveIn: false, // 원조합원 — §95② LTHD 대상
    ...over,
  });
}

const run = (i: TransferTaxInput) => calculateTransferTax(i, rates);

/** 세대 보유 3채 — ④가 입주권 양도에도 싣는 `houses[]` 경로 재현 */
const houses3 = [
  makeHouseInfo("selling", { acquisitionDate: new Date("2020-05-01") }),
  makeHouseInfo("h2"),
  makeHouseInfo("h3"),
];

describe("§104⑦ 양도 대상 — 조합원입주권", () => {
  it("RT-01: 🔴 조정 3주택이어도 중과가 붙지 않는다 (종전 0.68)", () => {
    const r = run(base());
    expect(r.appliedRate).toBe(0.38); // §55① 누진만
    expect(r.calculatedTax).toBe(45_990_000);
    expect(r.surchargeType).toBeUndefined();
  });

  it("RT-02: 🔴 §95② 장특공제가 **살아 있다** — 제외 괄호는 §94①1호에만 붙는다 (종전 0)", () => {
    const r = run(base());
    expect(r.longTermHoldingDeduction).toBe(24_000_000);
    expect(r.lthdExclusionReason).toBeUndefined();
  });

  it("RT-03: 🔴 **정밀 경로**(`houses[]`)도 동일 — fallback만 막으면 뚫린다", () => {
    const precise = run(base({ sellingHouseId: "selling", houses: houses3 }));
    const fallback = run(base());
    expect(precise.appliedRate).toBe(fallback.appliedRate);
    expect(precise.calculatedTax).toBe(fallback.calculatedTax);
    expect(precise.longTermHoldingDeduction).toBe(fallback.longTermHoldingDeduction);
    // 정밀 판정 자체는 「세대에 중과 대상이 있다」고 답한다 — 그래도 양도 대상이 아니라 안 붙는다.
    expect(precise.multiHouseSurchargeEvaluation?.surchargeType).toBe("multi_house_3plus");
  });

  it("RT-04: 승계 입주권은 LTHD가 여전히 0 (§95② 「조합원으로부터 취득한 것은 제외」)", () => {
    const r = run(base({ isSuccessorRightToMoveIn: true }));
    expect(r.appliedRate).toBe(0.38); // 중과는 여기서도 없다
    expect(r.longTermHoldingDeduction).toBe(0);
  });

  it("RT-07: 1세대 2주택(§104⑦1호 20%p)도 미적용 (종전 0.58)", () => {
    expect(run(base({ householdHousingCount: 2 })).appliedRate).toBe(0.38);
  });

  it("RT-08: 단기(1~2년)는 §104①2호 60% 그대로 — 게이트가 단기세율을 건드리지 않는다", () => {
    expect(run(base({ acquisitionDate: new Date("2025-01-01") })).appliedRate).toBe(0.6);
    expect(run(base({ acquisitionDate: new Date("2026-01-01") })).appliedRate).toBe(0.7); // 3호
  });
});

describe("§104⑦ 양도 대상 — §166 3분할 경로 (원조합원 입주권)", () => {
  const redev: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 90_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
  };
  const r166 = (over: Partial<TransferTaxInput> = {}) =>
    run(
      base({
        transferPrice: 800_000_000,
        acquisitionPrice: 200_000_000,
        acquisitionDate: new Date("2010-05-01"),
        redevelopment: redev,
        ...over,
      }),
    );

  it("RT-05: 🔴 세율·분기 장특공제가 복원된다 (종전 0.72 · 329,460,000 · LTHD 0)", () => {
    const r = r166();
    expect(r.appliedRate).toBe(0.4);
    expect(r.calculatedTax).toBe(170_660_000);
    expect(r.longTermHoldingDeduction).toBe(16_000_000);
    // 🔑 합계만 맞고 분기가 0이면 화면이 어긋난다 — 분기까지 확인한다.
    expect(r.redevelopmentDetail!.preApproval.lthd).toBe(16_000_000);
  });

  it("RT-06: 「장기보유특별공제 배제 (다주택 중과)」 step이 **없다**", () => {
    const labels = r166().steps.map((s) => s.label);
    expect(labels).not.toContain("장기보유특별공제 배제 (다주택 중과)");
  });

  it("RT-06b: 대조 — 비조정 1주택과 **완전히 같다** (중과 축이 통째로 빠졌다는 확인)", () => {
    const regulated = r166();
    const plain = r166({ isRegulatedArea: false, householdHousingCount: 1 });
    expect(regulated.calculatedTax).toBe(plain.calculatedTax);
    expect(regulated.longTermHoldingDeduction).toBe(plain.longTermHoldingDeduction);
  });
});

describe("§104⑦ 양도 대상 — 분양권", () => {
  const pr = (over: Partial<TransferTaxInput> = {}) =>
    run(base({ propertyType: "presale_right", isSuccessorRightToMoveIn: false, ...over }));

  it("RT-11: 단건 세율은 불변 — §104①1호 괄호 60%가 이미 중과보다 앞선다", () => {
    expect(pr().appliedRate).toBe(0.6);
    expect(pr({ acquisitionDate: new Date("2026-01-01") }).appliedRate).toBe(0.7);
    // 조정·3주택이든 비조정·1주택이든 같다.
    expect(pr().calculatedTax).toBe(
      pr({ isRegulatedArea: false, householdHousingCount: 1 }).calculatedTax,
    );
  });

  it("RT-11b: 🔴 **다건 §104⑤에서는 움직인다** — 존재하지 않는 ⑦ 호가 버킷을 갈랐다", () => {
    /**
     * 종전에는 분양권에 `surchargeClause("multi_house_3plus")`가 **후보 호**로 붙어
     * `clauseBucketKey`가 사업용 토지(§104①1호)와 달라졌고, §104⑤2호 합산에서 빠져
     * 누진이 두 번 태워졌다. 실측 229,300,000 → **225,440,000**(3,860,000 과대).
     *
     * ⭐ 대조군이 도출값을 확증한다 — **비조정·1주택이면 종전에도 225,440,000**이었다.
     *    즉 차이는 「분양권이라서」가 아니라 「⑦ 후보가 붙어서」 생겼다.
     */
    const item = (id: string, o: Partial<TransferTaxInput>) =>
      ({ ...base({ ...o }), propertyId: id, propertyLabel: id }) as never;

    const agg = (regulated: boolean) =>
      calculateTransferTaxAggregate(
        {
          taxYear: 2026,
          annualBasicDeductionUsed: 0,
          properties: [
            item("a", {
              propertyType: "presale_right",
              transferPrice: 500_000_000,
              acquisitionPrice: 200_000_000,
              isRegulatedArea: regulated,
              householdHousingCount: regulated ? 3 : 1,
            }),
            item("b", {
              propertyType: "land",
              transferPrice: 400_000_000,
              acquisitionPrice: 200_000_000,
              isRegulatedArea: regulated,
              householdHousingCount: regulated ? 3 : 1,
            }),
          ],
        },
        rates,
      ).determinedTax;

    expect(agg(true)).toBe(225_440_000); // 종전 229,300,000
    expect(agg(true)).toBe(agg(false)); // 조정·다주택 여부가 분양권 버킷을 가르지 않는다
  });
});

describe("leaf 계약 — `resolveSurchargeApplication` 반환 4필드", () => {
  /**
   * 🔑 **엔진 경유로는 잡히지 않는 계약이다** — `calcTax`는 `isRateSurchargeApplied`가 false면
   *    `effectiveSurchargeType`을 아예 읽지 않으므로, leaf가 비대상 자산에 `"multi_house_3plus"`를
   *    돌려줘도 세액이 안 변한다(mutation P-5 실측 0/47).
   *    그래도 leaf의 **공개 반환값**이므로 다음 소비처가 그대로 믿는다 ⇒ 여기서 고정한다.
   */
  const rules = { surcharge_suspended: false } as unknown as Parameters<
    typeof resolveSurchargeApplication
  >[2];
  const leaf = (propertyType: string, precise?: Parameters<typeof resolveSurchargeApplication>[1]) =>
    resolveSurchargeApplication(
      {
        propertyType,
        isRegulatedArea: true,
        householdHousingCount: 3,
        transferDate: new Date("2026-06-01"),
      },
      precise,
      rules,
    );

  /** 정밀 판정이 「세대에 3주택+ 중과 대상이 있다」고 답한 상태 */
  const preciseHit = {
    surchargeType: "multi_house_3plus",
    surchargeApplicable: true,
    isSurchargeSuspended: false,
    effectiveHouseCount: 3,
  } as unknown as Parameters<typeof resolveSurchargeApplication>[1];

  it("RT-13: 🔴 비대상 자산은 **네 값이 함께** 닫힌다 — 정밀 판정이 있어도", () => {
    for (const pt of ["right_to_move_in", "presale_right", "land", "commercial_building"]) {
      for (const precise of [undefined, preciseHit]) {
        const r = leaf(pt, precise);
        const tag = `${pt}/precise=${precise ? 1 : 0}`;
        expect(r.isSurchargeCase, tag).toBe(false);
        expect(r.isSurchargeApplied, tag).toBe(false);
        expect(r.isRateSurchargeApplied, tag).toBe(false);
        expect(r.effectiveSurchargeType, tag).toBe("none");
      }
    }
  });

  it("RT-14: 겸용주택은 **정밀 경로에서만** 중과 대상이다 (fallback 미포함은 별건 경계)", () => {
    // 정밀 판정이 있으면 §104⑦ 대상 — ④가 `assetKind === "housing"` 기준으로 houses[]를 싣는다.
    const withPrecise = leaf("mixed-use-house", preciseHit);
    expect(withPrecise.isSurchargeCase).toBe(true);
    expect(withPrecise.effectiveSurchargeType).toBe("multi_house_3plus");

    // 정밀 판정이 없으면 원시 플래그만으로는 걸지 않는다 — **현행 동작 보존**.
    // 이 줄이 빨개지면 겸용주택 fallback 결정을 바꾼 것이다(별건이므로 계획서부터).
    expect(leaf("mixed-use-house").isSurchargeCase).toBe(false);
  });

  it("RT-15: 대조 — 주택은 두 경로 모두 대상이다", () => {
    expect(leaf("housing").isSurchargeCase).toBe(true);
    expect(leaf("housing", preciseHit).isRateSurchargeApplied).toBe(true);
    expect(leaf("redevelopment_apt").effectiveSurchargeType).toBe("multi_house_3plus");
  });
});

describe("§104⑦ 대조군 — 「주택」은 그대로 중과된다 (게이트를 통째로 닫은 것이 아니다)", () => {
  it("RT-09: 주택(housing)은 0.68 · 장특 배제 유지", () => {
    const r = run(base({ propertyType: "housing", householdRightCount: 0 }));
    expect(r.appliedRate).toBe(0.68);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(r.longTermHoldingDeduction).toBe(0);
  });

  it("RT-10: 재개발APT(redevelopment_apt)도 유지 — 직전 배치 보존", () => {
    const r = run(base({ propertyType: "redevelopment_apt", householdRightCount: 0 }));
    expect(r.appliedRate).toBe(0.68);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(r.longTermHoldingDeduction).toBe(0);
  });

  it("RT-09b: 주택 2주택은 0.58 (§104⑦1호 20%p) — 유형 구분도 살아 있다", () => {
    const r = run(base({ propertyType: "housing", householdRightCount: 0, householdHousingCount: 2 }));
    expect(r.appliedRate).toBe(0.58);
    expect(r.surchargeType).toBe("multi_house_2");
  });
});
