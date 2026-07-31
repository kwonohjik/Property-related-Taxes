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

  it("B-B3b: 중과 **비대상**이면 세액 불변 — 판정만으로는 아무것도 바뀌지 않는다", () => {
    // (B2에서 갱신됨: 중과 **대상**이면 §95② 장특 배제로 세액이 오른다 — B-B5 계열.)
    expect(run({ multiHouse: multiHouse(1, { isRegulatedArea: false }) }).total.transferTax)
      .toBe(BASELINE_TAX);
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

describe("Phase B2 — §95② 중과 대상 주택 장기보유특별공제 배제", () => {
  /**
   * [법령 — 「소득세법」 §95②, MST 280405 · 2026-07-31 법제처 실측]
   *   "…제94조제1항제1호에 따른 자산(제104조제3항에 따른 미등기양도자산과
   *    **같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 보유기간이 3년 이상인 것…"
   *
   * §104⑦ 각 호의 대상은 「**주택**(이에 딸린 토지를 포함한다)」이므로 배제도 **주택분에 한정**된다.
   * 겸용의 상가건물·상가부수토지, 그리고 배율초과 비사업용 토지(§104①8호 자산)는 **유지**된다.
   *
   * ⚠️ 배제 술어는 `surchargeApplicable`이 **아니다**:
   *   `surchargeType !== "none" && !isSurchargeSuspended`
   *   2008 위기취득 배제(부칙 §9270호 §14①)는 **세율만** 배제하고 장특 배제는 존속하기 때문이다
   *   (`types/multi-house-surcharge.types.ts:410-412` · 서울행정법원 2024구단72950 국승).
   */
  it("B-B5: 중과 대상 → **주택분 장특 0**, 상가분 장특은 **유지**", () => {
    const r = run({ multiHouse: multiHouse(1) });
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(r.housingPart.longTermDeductionRate).toBe(0);
    expect(r.housingPart.longTermDeductionAmount).toBe(0);
    // 상가분은 §104⑦ 자산이 아니다 — 배제되면 침묵 과다과세다.
    expect(r.commercialPart.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("B-B5b: 배제로 주택 소득금액이 양도차익 전액이 된다 · 세액 증가", () => {
    const r = run({ multiHouse: multiHouse(1) });
    expect(r.housingPart.incomeAmount).toBe(r.housingPart.transferGain);
    expect(r.total.transferTax).toBeGreaterThan(BASELINE_TAX);
  });

  it("B-B6: 한시 유예 중이면 장특 **유지** (§167의3①12의2 → §104⑦ 각 호 미해당)", () => {
    const r = run({ multiHouse: multiHouse(1) }, DURING_SUSPENSION, ratesWithSuspension());
    expect(r.multiHouseSurcharge?.isSurchargeSuspended).toBe(true);
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("B-B7: 2008 위기취득 — **세율은 배제, 장특 배제는 존속** (술어가 다르다)", () => {
    // 부칙 §9270호 §14① — 2009-03-16 ~ 2012-12-31 취득. surchargeApplicable=false지만
    // surchargeType은 유지되므로 §95② 배제는 살아 있다.
    const r = run({
      multiHouse: multiHouse(1, {
        houses: [
          makeHouseInfo("selling", { acquisitionDate: D("2010-06-01") }),
          makeHouseInfo("h2", { acquisitionDate: D("2015-03-01") }),
        ],
      }),
    });
    expect(r.multiHouseSurcharge?.rateSurchargeStatutoryExcluded).toBe(true);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("multi_house_2");
    expect(r.housingPart.longTermDeductionAmount).toBe(0); // 장특 배제 존속
  });

  it("B-B8(회귀): 비조정지역 → 중과 대상 아님 → 장특 유지", () => {
    const r = run({ multiHouse: multiHouse(1, { isRegulatedArea: false }) });
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("B-B9(회귀): `multiHouse` 미주입 → 장특 완전 불변", () => {
    expect(run().housingPart.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("B-B10: 배율초과 비사업용 토지분 장특은 **유지** (§104①8호 자산 — §104⑦ 아님)", () => {
    const r = run({ multiHouse: multiHouse(1), totalLandArea: 1000 });
    expect(r.nonBusinessLandPart).not.toBeNull();
    expect(r.nonBusinessLandPart!.longTermDeductionAmount).toBeGreaterThan(0);
    expect(r.housingPart.longTermDeductionAmount).toBe(0);
  });
});

describe("Phase B3 — §104⑦ 중과세율 + 후단 MAX", () => {
  /**
   * [법령 — 「소득세법」 §104⑦ 본문·후단]
   *   본문: "…제55조제1항에 따른 세율에 **100분의 20**(제3호 및 제4호의 경우 **100분의 30**)을
   *          더한 세율을 적용한다."
   *   후단: "이 경우 해당 주택 **보유기간이 2년 미만**인 경우에는 [중과세액]과
   *          **제1항제2호 또는 제3호의 세율을 적용하여 계산한 양도소득 산출세액 중 큰 세액**을
   *          양도소득 산출세액으로 한다."
   *
   * §104⑤2호 단서상 주택분(§104⑦1·3호)과 상가분(§104①1호)은 **다른 호**이므로 합산되지 않는다.
   *
   * 목표값은 계획서 §3 E-2의 손계산 2호와 일치해야 한다(B2에서 1호=889,767,350 확인 완료).
   */
  const CLAUSE1_AFTER_B2 = 889_767_350;

  it("B-B11: 조정지역 2주택 → +20%p · 산출세액 1,137,370,975", () => {
    const r = run({ multiHouse: multiHouse(1) });
    expect(r.total.transferTax).toBe(1_137_370_975);
  });

  it("B-B12: 조정지역 3주택+ → +30%p · 산출세액 1,288,352,475", () => {
    const r = run({ multiHouse: multiHouse(2) });
    expect(r.total.transferTax).toBe(1_288_352_475);
  });

  it("B-B13: 2008 위기취득 — 세율 가산 **0**, 장특 배제는 존속 → B2 값 그대로", () => {
    const r = run({
      multiHouse: multiHouse(1, {
        houses: [
          makeHouseInfo("selling", { acquisitionDate: D("2010-06-01") }),
          makeHouseInfo("h2", { acquisitionDate: D("2015-03-01") }),
        ],
      }),
    });
    expect(r.total.transferTax).toBe(CLAUSE1_AFTER_B2);
  });

  it("B-B14: 한시 유예 중 → 세율·장특 **둘 다** 미적용 (중과 이전 값)", () => {
    const r = run({ multiHouse: multiHouse(1) }, DURING_SUSPENSION, ratesWithSuspension());
    expect(r.total.transferTax).toBe(
      run({}, DURING_SUSPENSION, ratesWithSuspension()).total.transferTax,
    );
  });

  it("B-B15(회귀): 비조정지역 → 세율·장특 미적용", () => {
    expect(run({ multiHouse: multiHouse(1, { isRegulatedArea: false }) }).total.transferTax)
      .toBe(BASELINE_TAX);
  });

  it("B-B16: 2018-04-01 **이전** 양도 → §104⑦ 가산율 없음(historical null)", () => {
    // resolveSurchargeAddonRate가 null을 돌려주는 구간 — 세율 가산이 붙으면 안 된다.
    const r = run({ multiHouse: multiHouse(1) }, D("2017-06-01"));
    expect(r.total.appliedRate).toBeLessThanOrEqual(0.45);
  });

  it("B-B17: 보유 2년 미만 + 중과 → §104⑦ **후단 MAX** — 여기서는 단기 70%가 이긴다", () => {
    const SHORT = { landAcquisitionDate: D("2025-06-01"), buildingAcquisitionDate: D("2025-06-01") };
    const r = run({ multiHouse: multiHouse(1), ...SHORT });
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    // 중과 한계세율 45%+20%p = 65% < 단기 70% → 후단 MAX가 §104①3호를 채택한다.
    expect(r.total.appliedRate).toBe(0.7);
    expect(r.total.transferTax).toBe(1_495_427_008);
  });

  it("B-B17b: 보유 2년 이상 + 중과 → 중과세율 채택 · 표시율 0.65(=45%+20%p)", () => {
    // B-B17과 짝 — 후단 MAX가 **양쪽 다** 고를 수 있음을 반증으로 고정한다.
    expect(run({ multiHouse: multiHouse(1) }).total.appliedRate).toBe(0.65);
    expect(run({ multiHouse: multiHouse(2) }).total.appliedRate).toBe(0.75);
  });

  it("B-B18: 배율초과 비사토 동반 → 세율 가산 **보류** + warning (계획서 §5.5)", () => {
    const r = run({ multiHouse: multiHouse(1), totalLandArea: 1000 });
    expect(r.nonBusinessLandPart).not.toBeNull();
    // 장특 배제는 적용되므로 세액은 불변이 아니다. 세율 가산만 빠진다.
    expect(r.housingPart.longTermDeductionAmount).toBe(0);
    expect(r.warnings.some((w) => w.includes("중과") && w.includes("세율"))).toBe(true);
  });
});
