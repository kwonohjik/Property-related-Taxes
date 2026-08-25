/**
 * anchor: 겸용주택 §104⑦ 중과 — **세대 주택 목록 미입력 시 원시 플래그 fallback** (2026-08-25)
 *
 * 계획서: `docs/00-pm/transfer-mixed-use-surcharge-fallback.plan.md`
 *
 * ## 종전 결함 — 입력 방식이 세액을 갈랐다
 *
 * `multiHouse`는 `houses[]`가 있어야 조립된다(`route.ts` — 「`houses` 미전송이면 undefined →
 * 엔진이 중과 판정을 건너뛴다」). 그래서 사용자가 **세대 보유 주택 목록을 채우지 않으면**
 * 조정대상지역 다주택인데도 겸용주택에 중과가 **통째로 미적용**됐다.
 *
 * 실브라우저 실측(주택 100㎡ + 상가 100㎡ · 조정지역 · 세대 2주택 · 양도 2026-06-01):
 *
 * | 목록 | 세율 | 결정세액 | 주택분 장특공제 |
 * |---|---|---|---|
 * | 입력함 | 0.65 | 1,567,019,136 | 0 |
 * | **미입력** | **0.45** | **1,061,535,000** | **445,655,171** |
 *
 * ⇒ **505,484,136원 과소과세.** 일반 주택(`housing`)·재개발APT는 같은 상황에서
 *    `SURCHARGE_FALLBACK_PROPERTY_TYPES`로 중과가 걸린다 — **겸용만 달랐다**.
 *
 * ## 🔑 `propertyType`으로 `"housing"`을 넘긴다
 *
 * §104⑦의 대상은 「주택」이고 겸용에서 중과가 미치는 것은 **주택분**이다.
 * `"mixed-use-house"`를 넘기면 `SURCHARGE_FALLBACK_PROPERTY_TYPES`를 넓혀야 하는데, 그 집합은
 * 일괄·직접호출 경로의 `calculateTransferTax`도 함께 보므로 **무관한 곳까지 움직인다**.
 *
 * ## 🔑 주택 수는 **양도하는 겸용주택 자신을 포함**한다
 *
 * §104⑦ 각 호의 「1세대 2주택」이 세대 소유분 전체를 세므로 `householdHousingCount`를
 * **그대로** 쓴다(+1 보정 없음). 일반 주택 경로와 같은 규약이다.
 *
 * ## 착수 전 안전망
 *
 * `multiHouseSurcharge === undefined`일 때 중과를 **무조건** 켜는 mutation에 13파일 46건이
 * 반응했다 — 재개발·입주권 때의 0건과 달리 이 축에는 계약이 실재한다.
 * ⚠️ 그 46은 **과대 측정**이었다(조건을 재현할 수 없어 비조정·1주택까지 전부 켜졌다).
 *    실제 회귀는 **0건**이다 — 엔진 fixture 직접 호출은 `surchargeFallback`이 undefined라
 *    `householdHousingCount: 0`으로 fallback이 걸리지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRatesWithHouseEngine, makeHouseInfo } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
/** 중과 한시배제(§167의3①12의2 가목) 종료일 2026-05-09 **이후** */
const AFTER_SUSPENSION = D("2026-06-01");
const DURING_SUSPENSION = D("2026-05-09");
const PRICE = 3_000_000_000;

/** 정밀 경로 — 양도 대상 겸용주택(id="selling") + 추가 보유 주택 n채 */
function precise(extra: number) {
  return {
    houses: [
      makeHouseInfo("selling"),
      ...Array.from({ length: extra }, (_, i) =>
        makeHouseInfo(`h${i + 2}`, { acquisitionDate: D("2015-03-01") }),
      ),
    ],
    sellingHouseId: "selling",
    presaleRights: [],
    isOneHousehold: true,
    isRegulatedArea: true,
  } as NonNullable<MixedUseAssetInput["multiHouse"]>;
}

/** fallback 경로 — 목록 없이 원시 플래그만 */
const fb = (householdHousingCount: number, isRegulatedArea = true) => ({
  isRegulatedArea,
  householdHousingCount,
});

/**
 * ⚠️ 유예를 되살린 rates — `makeMockRatesWithHouseEngine()`는 유예를 **의도적으로 끈다**.
 */
function ratesWithSuspension() {
  const m = makeMockRatesWithHouseEngine();
  const rec = m.get("transfer:surcharge:_default") as unknown as Record<string, unknown>;
  m.set("transfer:surcharge:_default", {
    ...rec,
    specialRules: {
      surcharge_suspended: true,
      suspended_types: ["multi_house_2", "multi_house_3plus"],
      suspended_until: "2026-05-09",
    },
  } as never);
  return m;
}

function run(
  over: Partial<MixedUseAssetInput> = {},
  transferDate = AFTER_SUSPENSION,
  rates = makeMockRatesWithHouseEngine(),
) {
  return calcMixedUseTransferTax(
    PRICE,
    transferDate,
    { ...mixedUseCase14(), isOneHouseExempt: false, ...over },
    rates,
  );
}

const FALLBACK_WARNING = /세대 보유 주택 목록이 입력되지 않아/;

describe("겸용주택 §104⑦ — 원시 플래그 fallback", () => {
  it("MF-01: 🔴 목록 없이 조정·2주택 → 중과가 걸린다 (종전 미적용)", () => {
    const r = run({ surchargeFallback: fb(2) });
    // 정밀 판정 객체는 없다 — fallback 경로임을 먼저 고정한다.
    expect(r.multiHouseSurcharge).toBeUndefined();
    // 세율 축: §104⑦1호 +20%p가 주택 파트에 붙는다.
    expect(r.total.surchargeAddon).toBe(0.2);
    // 장특 축: §95② 본문 괄호로 주택분 공제가 배제된다.
    expect(r.housingPart.longTermDeductionAmount).toBe(0);
    expect(r.housingPart.longTermDeductionRate).toBe(0);
  });

  it("MF-02: 🔑 정밀 경로와 **세액이 같다** — 입력 방식이 세액을 가르지 않는다", () => {
    const withList = run({ multiHouse: precise(1) });
    const withoutList = run({ surchargeFallback: fb(2) });

    expect(withList.multiHouseSurcharge?.surchargeType).toBe("multi_house_2"); // 전제 확인
    expect(withoutList.total.transferTax).toBe(withList.total.transferTax);
    expect(withoutList.total.determinedTax).toBe(withList.total.determinedTax);
    expect(withoutList.housingPart.longTermDeductionAmount).toBe(
      withList.housingPart.longTermDeductionAmount,
    );
  });

  it("MF-03: 🔑 정밀 판정이 **이긴다** — fallback이 정밀을 덮지 않는다", () => {
    /**
     * 목록상 1채(중과 없음)인데 원시 플래그는 3주택이라고 말하는 모순 입력.
     * leaf가 정밀을 우선하므로 **중과가 걸리지 않아야** 한다.
     */
    const r = run({ multiHouse: precise(0), surchargeFallback: fb(3) });
    expect(r.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(r.total.surchargeAddon).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
    expect(r.warnings.some((w) => FALLBACK_WARNING.test(w))).toBe(false);
  });

  it("MF-04: 유예 창 안(2026-05-09)에서는 미적용 — 경계", () => {
    const r = run({ surchargeFallback: fb(2) }, DURING_SUSPENSION, ratesWithSuspension());
    expect(r.total.surchargeAddon).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("MF-05: 대조 — 비조정지역이면 fallback도 미적용", () => {
    const r = run({ surchargeFallback: fb(2, false) });
    expect(r.total.surchargeAddon).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("MF-05b: 대조 — 1주택이면 미적용 (주택 수에 겸용주택 자신이 포함된다)", () => {
    // 🔑 `householdHousingCount: 1` = 「양도하는 겸용주택 1채뿐」. +1 보정을 하면 2가 되어
    //    중과가 걸린다 — 이 단언이 그 오구현을 막는다.
    const r = run({ surchargeFallback: fb(1) });
    expect(r.total.surchargeAddon).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("MF-05c: 대조 — `surchargeFallback` 미주입이면 종전 그대로 (회귀 0)", () => {
    const r = run();
    expect(r.total.surchargeAddon).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
    expect(r.warnings.some((w) => FALLBACK_WARNING.test(w))).toBe(false);
  });

  it("MF-06: 🔑 **주택분 한정** — 상가 파트는 불변 (§104⑦ 대상은 「주택」)", () => {
    const plain = run();
    const surcharged = run({ surchargeFallback: fb(2) });
    expect(surcharged.commercialPart.incomeAmount).toBe(plain.commercialPart.incomeAmount);
    expect(surcharged.commercialPart.longTermDeductionAmount).toBe(
      plain.commercialPart.longTermDeductionAmount,
    );
  });

  it("MF-07: 🔑 3주택이면 +30%p (§104⑦3호) — 유형 구분이 살아 있다", () => {
    expect(run({ surchargeFallback: fb(3) }).total.surchargeAddon).toBe(0.3);
    expect(run({ surchargeFallback: fb(2) }).total.surchargeAddon).toBe(0.2);
  });

  it("MF-09: 🔑 fallback으로 걸었을 때만 **근사 경고**를 남긴다", () => {
    // 걸었을 때 — 경고 있음
    expect(run({ surchargeFallback: fb(2) }).warnings.some((w) => FALLBACK_WARNING.test(w))).toBe(true);

    // ⚠️ 유예 중에는 **하지 않은 일을 했다고 말하면 안 된다** — 세율·장특 어느 쪽도 안 움직인다.
    const inWindow = run({ surchargeFallback: fb(2) }, DURING_SUSPENSION, ratesWithSuspension());
    expect(inWindow.warnings.some((w) => FALLBACK_WARNING.test(w))).toBe(false);

    // 비조정·1주택도 경고 없음
    expect(run({ surchargeFallback: fb(2, false) }).warnings.some((w) => FALLBACK_WARNING.test(w))).toBe(false);
    expect(run({ surchargeFallback: fb(1) }).warnings.some((w) => FALLBACK_WARNING.test(w))).toBe(false);

    // 정밀 경로는 근사가 아니므로 경고 없음
    expect(run({ multiHouse: precise(1) }).warnings.some((w) => FALLBACK_WARNING.test(w))).toBe(false);
  });
});
