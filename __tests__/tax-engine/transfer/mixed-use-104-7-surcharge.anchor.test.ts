/**
 * anchor: 겸용주택 법 §104⑦ 다주택 중과 — **Phase B1: 판정 배관만** (E-2).
 *
 * 계획서: docs/02-design/features/transfer-mixed-use-residence-surcharge.plan.md §5
 *
 * B1은 **세액을 바꾸지 않는다.** 정본 `determineMultiHouseSurcharge`를 겸용 경로에 연결해
 * 판정 결과(`multiHouseSurcharge`)를 만들어 노출하는 데까지다.
 *   - B2 = §95② 주택분 장특 배제
 *   - B3 = §104⑦ 세율 가산 + 후단 MAX
 * 셋을 한 커밋에 묶으면 anchor가 깨졌을 때 어느 단계인지 분리되지 않는다(실측상 차액의
 * 절반 이상이 세율이 아니라 장특에서 나온다).
 *
 * 🔴 **R-9 — 이 파일의 최대 위험은 「침묵 GREEN」이다.**
 *   `transfer:special:house_count_exclusion` 레코드는 `makeMockRatesWithHouseEngine()`에만 있고
 *   `makeMockRates()`에는 **없다**. `parseRatesFromMap`은 이를 optional로 처리해 **예외를 던지지
 *   않으므로**(`transfer-tax-helpers.ts:130-134`), 잘못된 mock을 쓰면 `houseCountExclusionRules`가
 *   undefined → 중과 판정이 통째로 스킵된 채 테스트가 "통과"한다.
 *   ⇒ 모든 케이스가 `multiHouseSurcharge`의 **생성 여부를 먼저 단언**한다.
 *
 * [법령 — 「소득세법」 §104⑦, MST 280405 · 시행 2026-07-01 · 2026-07-31 법제처 실측]
 *   "다음 각 호의 어느 하나에 해당하는 **주택(이에 딸린 토지를 포함한다)**을 양도하는 경우
 *    제55조제1항에 따른 세율에 100분의 20(제3호 및 제4호의 경우 100분의 30)을 더한 세율을 적용한다."
 *   1호 = 조정대상지역 1세대 2주택 / 3호 = 조정대상지역 1세대 3주택 이상
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates, makeMockRatesWithHouseEngine, makeHouseInfo } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
/** 중과 한시배제(§167의3①12의2 가목) 종료일 2026-05-09 **이후** */
const AFTER_SUSPENSION = D("2026-06-01");
/** 한시배제 창 **안** */
const DURING_SUSPENSION = D("2026-05-09");
const PRICE = 3_000_000_000;

/** 양도 대상 겸용주택(id="selling") + 추가 보유 주택 n채 */
function multiHouse(extra: number, over: Record<string, unknown> = {}) {
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
    ...over,
  } as NonNullable<MixedUseAssetInput["multiHouse"]>;
}

/**
 * ⚠️ `makeMockRatesWithHouseEngine()`는 **한시 유예를 의도적으로 끈다**
 * (`specialRules: { surcharge_suspended: false }` — "중과 실제 적용 테스트용" override).
 * 유예 창을 검증하려면 그 레코드만 되살려야 한다.
 */
function ratesWithSuspension() {
  const m = makeMockRatesWithHouseEngine();
  const rec = m.get("transfer:surcharge:_default") as unknown as Record<string, unknown>;
  m.set("transfer:surcharge:_default", {
    ...rec,
    specialRules: {
      surcharge_suspended: true,
      suspended_types: ["multi_house_2", "multi_house_3plus"],
      suspended_until: "2026-05-09", // §167의3①12의2 가목
    },
  } as never);
  return m;
}

function run(over: Partial<MixedUseAssetInput> = {}, transferDate = AFTER_SUSPENSION, rates = makeMockRatesWithHouseEngine()) {
  return calcMixedUseTransferTax(
    PRICE,
    transferDate,
    { ...mixedUseCase14(), isOneHouseExempt: false, ...over },
    rates,
  );
}

/** B1 시점의 세액 — 판정만 붙고 세율·장특은 아직 그대로다 */
const BASELINE_TAX = run().total.transferTax;

describe("Phase B1 — §104⑦ 중과 판정 배관 (E-2)", () => {
  it("B-B0(R-9 방어): mock에 house_count_exclusion이 있어야 판정이 생성된다", () => {
    // 이 단언이 없으면 아래 anchor들이 "중과가 스킵된 채" 통과할 수 있다.
    expect(run({ multiHouse: multiHouse(1) }).multiHouseSurcharge).toBeDefined();
    // 반대로 house 엔진 없는 mock이면 판정 자체가 생기지 않는다 — 규칙 부재 시 침묵 스킵을 명시.
    expect(run({ multiHouse: multiHouse(1) }, AFTER_SUSPENSION, makeMockRates()).multiHouseSurcharge)
      .toBeUndefined();
  });

  it("B-B1: 조정대상지역 1세대 2주택 → surchargeType='multi_house_2' · 적용", () => {
    const r = run({ multiHouse: multiHouse(1) });
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_2");
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(r.multiHouseSurcharge?.isSurchargeSuspended).toBe(false);
    expect(r.multiHouseSurcharge?.effectiveHouseCount).toBe(2);
  });

  it("B-B1b: 3주택 이상 → surchargeType='multi_house_3plus' (§104⑦3호 +30%p 대상)", () => {
    const r = run({ multiHouse: multiHouse(2) });
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
    expect(r.multiHouseSurcharge?.effectiveHouseCount).toBe(3);
  });

  it("B-B2(회귀): 양도 당시 **비**조정대상지역 → 중과 대상 아님", () => {
    const r = run({ multiHouse: multiHouse(1, { isRegulatedArea: false }) });
    expect(r.multiHouseSurcharge).toBeDefined(); // 판정은 돌았다
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(r.total.transferTax).toBe(BASELINE_TAX);
  });

  it("B-B2b: 한시배제 창(~2026-05-09) 안에서 양도 → 유예 (경계 포함)", () => {
    const r = run({ multiHouse: multiHouse(1) }, DURING_SUSPENSION, ratesWithSuspension());
    expect(r.multiHouseSurcharge?.isSurchargeSuspended).toBe(true);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    // 하루 뒤(2026-05-10)는 유예 밖 — 경계를 양방향으로 고정한다.
    const after = run({ multiHouse: multiHouse(1) }, D("2026-05-10"), ratesWithSuspension());
    expect(after.multiHouseSurcharge?.isSurchargeSuspended).toBe(false);
    expect(after.multiHouseSurcharge?.surchargeApplicable).toBe(true);
  });

  it("B-B3(회귀): `multiHouse` **미주입** → 판정 없음 · 세액 완전 불변", () => {
    const r = run();
    expect(r.multiHouseSurcharge).toBeUndefined();
    expect(r.total.transferTax).toBe(BASELINE_TAX);
  });

  it("B-B3b(회귀): **B1은 세액을 바꾸지 않는다** — 중과 판정이 붙어도 아직 동일", () => {
    // B2(장특 배제)·B3(세율 가산)이 붙으면 이 anchor는 **의도적으로** 갱신된다.
    expect(run({ multiHouse: multiHouse(1) }).total.transferTax).toBe(BASELINE_TAX);
    expect(run({ multiHouse: multiHouse(2) }).total.transferTax).toBe(BASELINE_TAX);
  });

  it("B-B4: Phase A의 §154① 판정이 중과 입력으로 전달된다 (배제2 게이트)", () => {
    // 보유 1년 → §154① 미충족 → sellingHouseMeetsOneHouseRequirements=false로 전달되어야 한다.
    // 판정이 예외 없이 완주하는지까지가 B1 범위(게이트 세부 효과는 정본 anchor 소관).
    const r = run({
      multiHouse: multiHouse(1),
      landAcquisitionDate: D("2025-06-01"),
      buildingAcquisitionDate: D("2025-06-01"),
    });
    expect(r.multiHouseSurcharge).toBeDefined();
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_2");
  });
});
