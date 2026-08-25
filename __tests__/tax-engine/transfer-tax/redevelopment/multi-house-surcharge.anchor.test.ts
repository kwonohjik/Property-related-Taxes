/**
 * anchor: 재개발 신축주택의 **다주택 중과**(§104⑦) + **장특공제 배제**(§95②) — 2026-08-25
 *
 * ## 종전 결함 — 판정해 놓고 버렸다
 *
 * `transfer-tax.ts`는 STEP 0.5에서 `runMultiHouseSurchargeStep`으로 중과를 판정한 뒤
 * 재개발 분기(`calculateRedevelopmentTax`)에 **그 값을 넘기지 않았다**. 형제 경로 둘
 * (`buildExemptEarlyResult` · `handleMultiParcelBranch`)은 처음부터 넘기고 있었다.
 *
 * 게다가 fallback 목록 **두 곳**(`transfer-tax.ts` STEP 4 앞 · `transfer-tax-rate-calc.ts`
 * `calcTax`)이 `redevelopment_apt`를 빠뜨려, 정밀 판정이 없을 때도 중과가 0이었다.
 * 같은 파일(`transfer-tax-rate-calc.ts:434`)이 「신축APT는 **주택** — §104①2/3호 60%/70%」로
 * 단기세율을 매기고 있었으므로 **한 파일 안에서 모순**이었다.
 *
 * 실측 Δ (3주택 · 조정지역 · 양도 2026-06-01 · 유예 종료 후):
 *
 * | | 세율 | 산출세액 | LTHD |
 * |---|---|---|---|
 * | 종전 | 0.38 | 55,836,614 | 86,533,774 |
 * | 현행 | **0.68** | **174,503,223** | **0** |
 *
 * ## 법령
 *
 * · **§104⑦** — 「다음 각 호의 어느 하나에 해당하는 **주택**(이에 딸린 토지를 포함한다)을
 *   양도하는 경우」. 취득 경위를 묻지 않는다.
 * · **영 §167의3①12의2 · §167의10①12의2** — 「법 제95조제4항에 따른 보유기간이 2년(**재개발사업,
 *   재건축사업 또는 소규모재건축사업등을 시행하는 정비사업조합의 조합원이 해당 조합에 기존건물과
 *   그 부수토지를 제공하고 관리처분계획등에 따라 취득한 신축주택 및 그 부수토지를 양도하는
 *   경우의 보유기간은 기존건물과 그 부수토지의 취득일부터 기산한다**) 이상인 주택으로서 …」
 *   ⇒ **배제 대상이라면 이 기산 규칙을 둘 이유가 없다.** §167의3① 1~13호의 배제 열거에
 *   「재개발로 취득한 주택」은 없다.
 * · **§95②** — 「… 제94조제1항제1호에 따른 자산(제104조제3항에 따른 미등기양도자산과
 *   **같은 조 제7항 각 호에 따른 자산은 제외한다**) …」 ⇒ 중과 대상이면 장특공제도 배제.
 *
 * ## 🔴 착수 전 안전망 = 사실상 0건
 *
 * 6개 지점 중 **5개가 0건**이었다(베이스라인 5,925건 기준):
 * ④ 단건 게이트 0 · ④ 다건 복제본 0 · **세율 fallback 0** · 재개발 인자 전달 0 ·
 * fallback 목록 확장 0. 유일한 계약은 `transfer-tax.ts` LTHD 축 17건뿐이었다.
 *
 * ⭐ **세율 fallback(0건)이 죽은 코드였던 것은 아니다** — 승계조합원 입주권이 `houses[]` 없이
 *   그 경로로 30%p를 받는 것을 실측했다(세율 0.7). **살아 있는데 아무도 안 지키는 코드**였다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  makeMockRates,
  makeMockRatesWithHouseEngine,
  makeHouseInfo,
  baseTransferInput,
} from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

/** ⚠️ `makeMockRatesWithHouseEngine`은 **유예를 끈다**(`surcharge_suspended: false`). */
const rates = makeMockRatesWithHouseEngine();

const houses = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    makeHouseInfo(`h${i + 1}`, i === 0 ? { acquisitionDate: new Date("2005-04-09") } : {}),
  );

/** 사례 44 재개발APT · 3주택 · 조정지역 · 양도 2026-06-01(유예 종료 후). */
function apt(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-06-01"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
    ...over,
  });
}

const run = (i: TransferTaxInput, r = rates) => calculateTransferTax(i, r);

describe("재개발 신축주택 · §104⑦ 다주택 중과", () => {
  it("RS-01: 🔴 정밀 판정(houses[])이 **재개발 분기까지 도달**한다 (종전 Δ 0)", () => {
    const r = run(apt({ sellingHouseId: "h1", houses: houses(3) }));
    expect(r.appliedRate).toBe(0.68); // §55① 38% + §104⑦3호 30%p
    expect(r.calculatedTax).toBe(174_503_223);
  });

  it("RS-02: 🔴 **fallback도 중과를 건다** — `houses[]` 없이도 동일 (B2 지점)", () => {
    const precise = run(apt({ sellingHouseId: "h1", houses: houses(3) }));
    const fallback = run(apt());
    expect(fallback.appliedRate).toBe(precise.appliedRate);
    expect(fallback.calculatedTax).toBe(precise.calculatedTax);
  });

  it("RS-03: 1세대 2주택(§104⑦1호)은 20%p — 영 §167의10①12의2도 같은 괄호다", () => {
    const r = run(apt({ householdHousingCount: 2, sellingHouseId: "h1", houses: houses(2) }));
    expect(r.appliedRate).toBe(0.58); // 38% + 20%p
  });

  it("RS-04: 🔴 **§95② 장특공제가 배제된다** (종전 86,533,774 유지)", () => {
    const r = run(apt());
    expect(r.longTermHoldingDeduction).toBe(0);
    // 공제가 빠진 만큼 과세표준이 올라간다 — 배제가 표시만이 아니라 계산에 닿았다는 확인.
    expect(r.taxBase).toBe(285_945_917);
  });

  it("RS-05: 🔑 **분기 3개도 함께 0이 된다** — 합계만 0이면 화면이 어긋난다", () => {
    const d = run(apt()).redevelopmentDetail!;
    expect(d.preApproval.lthd).toBe(0);
    expect(d.postApprovalExistingHouse.lthd).toBe(0);
    expect(d.settlement.lthd).toBe(0);
    expect(d.preApproval.lthdRate).toBe(0);
  });

  it("RS-06: 배제 근거를 **화면에 남긴다** (세액만 바뀌고 침묵하지 않는다)", () => {
    const r = run(apt());
    expect(r.steps.some((s) => s.label === "장기보유특별공제 배제 (다주택 중과)")).toBe(true);
  });

  it("RS-07a: 🔴 정밀 판정이 fallback을 **이긴다** — 인자를 안 넘기면 배제가 되살아난다", () => {
    /**
     * ⚠️ 이 케이스가 없으면 `calcTax` 4번째 인자 제거를 **아무도 못 잡는다**(실측 M-3 0/17).
     *    fallback에도 `redevelopment_apt`가 있어 보통은 두 판정이 같은 결론을 내기 때문이다.
     *    구별하려면 **둘이 갈리는** 사실관계가 필요하다:
     *
     *    보유 3채 중 2채가 **수도권 밖 기준시가 3억 이하**(영 §167의3①**1호** — 각 호 외의
     *    부분 괄호가 「제1호 … 에 해당하는 주택은 **주택의 수를 계산할 때 산입하지 않는다**」)
     *    ⇒ 정밀 판정은 주택수를 1로 보아 `surchargeType: "none"`인데, 원시 플래그
     *    (`householdHousingCount: 3` + 조정지역)만 보는 fallback은 중과를 건다.
     *    이것이 F01이 경고한 「단건이 배제한 중과가 되살아난다」다.
     */
    const excludedHouses = [
      makeHouseInfo("h1", { acquisitionDate: new Date("2005-04-09") }),
      makeHouseInfo("h2", { region: "non_capital", officialPrice: 200_000_000 }),
      makeHouseInfo("h3", { region: "non_capital", officialPrice: 200_000_000 }),
    ];
    const precise = run(apt({ sellingHouseId: "h1", houses: excludedHouses }));

    // 정밀 판정이 주택수를 깎아 중과가 빠진다 — 장특공제도 함께 살아난다(§95②).
    expect(precise.multiHouseSurchargeEvaluation?.surchargeType).toBe("none");
    expect(precise.appliedRate).toBe(0.38);
    expect(precise.longTermHoldingDeduction).toBe(86_533_774);

    // 같은 세대 주택수를 fallback으로만 보면 중과가 걸린다 — 두 경로가 실제로 갈린다.
    expect(run(apt()).appliedRate).toBe(0.68);
  });

  it("RS-07: 🔑 정밀 판정을 **결과에 echo**한다 — 다건이 재판정하면 단건과 갈린다", () => {
    const r = run(apt({ sellingHouseId: "h1", houses: houses(3) }));
    expect(r.multiHouseSurchargeEvaluation).toBeDefined();
    expect(r.multiHouseSurchargeEvaluation!.surchargeType).toBe("multi_house_3plus");
  });

  it("RS-08: 유예 창 경계 — 영 §167의3①12의2 가목 「2026년 5월 9일까지 양도하는 주택」", () => {
    const susp = makeMockRates(); // suspended_until: 2026-05-09
    const inWindow = run(apt({ transferDate: new Date("2026-05-09") }), susp);
    const outWindow = run(apt({ transferDate: new Date("2026-05-10") }), susp);

    expect(inWindow.appliedRate).toBe(0.38);
    expect(inWindow.longTermHoldingDeduction).toBe(86_533_774); // 유예 중이면 장특도 살아 있다
    expect(outWindow.appliedRate).toBe(0.68);
    expect(outWindow.longTermHoldingDeduction).toBe(0);
  });
});

describe("재개발 신축주택 · 중과 대조군 (회귀 0)", () => {
  it("RS-09: 비조정지역은 종전 그대로", () => {
    const r = run(apt({ isRegulatedArea: false }));
    expect(r.appliedRate).toBe(0.38);
    expect(r.calculatedTax).toBe(55_836_614);
    expect(r.longTermHoldingDeduction).toBe(86_533_774);
  });

  it("RS-10: 1주택은 종전 그대로", () => {
    const r = run(apt({ householdHousingCount: 1 }));
    expect(r.calculatedTax).toBe(55_836_614);
    expect(r.longTermHoldingDeduction).toBe(86_533_774);
  });

  it("RS-11: 사례 44 원본 조건(2주택·비조정·2026-02-16)은 불변", () => {
    const r = run(
      apt({
        transferDate: new Date("2026-02-16"),
        householdHousingCount: 2,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
      }),
    );
    expect(r.calculatedTax).toBe(55_836_614);
    expect(r.totalTax).toBe(61_420_275);
  });
});
