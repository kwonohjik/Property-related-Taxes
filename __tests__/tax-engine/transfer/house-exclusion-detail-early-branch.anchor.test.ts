/**
 * anchor — 조기이탈 분기가 주택수 제외 «상세»를 버리지 않는다 (D4-08)
 *
 * `runHouseCountExclusionStep`은 `exemptionJudgeInput` 외에
 * `new994Detail`·`unsold989Detail`·`specialHouseExclusionDetail` 셋을 함께 낸다.
 * 정상 경로와 비과세 조기반환은 이 셋을 결과에 싣지만,
 * **재개발 완공주택 분기**(`transfer-tax.ts` STEP 0.65)와 **양도차손 분기**는 버리고 있었다.
 *
 * `steps`에는 근거가 남으므로 「아무것도 안 남는다」는 아니다. 소실되는 것은 detail 고유 정보다:
 *   ① §99의4⑥ 3년 미보유 **추징 경고**(`clawbackWarning`) — 이 필드는 detail에만 존재해
 *      warnings 등 다른 경로로 대체 노출되지 않는다
 *   ② 농어촌주택 보유기간 표시
 *   ③ §98의9 `dualExclusionWarning`
 *   ④ **적격 미달(isEligible=false)이면 step 자체가 push되지 않아**(`if (hceApplied)` 게이트)
 *      근거가 통째로 사라진다 — 정상 경로는 `isEligible` 게이트 없이 카드를 띄워 미적용 사유까지 보여준다
 *
 * ⚠️ `transfer-tax.ts:364-370`의 주석이 `multiHouseSurchargeResult`·`carryoverDetail`에 대해
 *    **같은 결함을 두 번** 기록해 두었다. 이것이 세 번째다 — 조기이탈 분기가 상류 산출물을
 *    버리는 패턴이라, 새 분기를 추가할 때 이 anchor가 감시한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { case44RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const D = (s: string) => new Date(`${s}T00:00:00`);

/** §99의4 농어촌주택 — 3년 미보유라 ⑥ 추징 경고가 붙는 조합 */
const rural994 = {
  type: "new_99_4_rural" as const,
  ruralAcquisitionDate994: D("2023-01-01"),
  ruralHouseKind994: "rural" as const,
  ruralRegionOk994: true,
  ruralAreaOk994: true,
  ruralPriceOk994: true,
};

function run(extra: Record<string, unknown>) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 900_000_000,
      transferDate: D("2024-06-01"),
      acquisitionPrice: 300_000_000,
      acquisitionDate: D("2015-06-01"),
      isOneHousehold: true,
      householdHousingCount: 2,
      reductions: [rural994],
      ...extra,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    rates,
  );
}

describe("주택수 제외 상세가 조기이탈 분기에서도 결과에 실린다", () => {
  it("정상 경로 — 기준선", () => {
    const r = run({});
    expect(r.new994Detail).toBeDefined();
  });

  it("🔴 양도차손 경로에서도 §99의4 상세가 남는다", () => {
    // 양도가 < 취득가 → transferGain <= 0 → buildLossTransferTaxResult 조기반환
    const r = run({ transferPrice: 200_000_000, acquisitionPrice: 300_000_000 });
    expect(r.determinedTax).toBe(0);
    expect(r.new994Detail, "차손 경로에서 §99의4 상세가 버려졌다").toBeDefined();
  });

  it("🔴 재개발 완공주택 분기에서도 §99의4 상세가 남는다", () => {
    // ⚠️ 진입 판정은 `assetKind`가 아니라 **`propertyType`** 을 본다(redevelopment-dispatch.ts:122).
    //    처음에 assetKind를 넘겨 분기에 도달하지 못했고 뮤테이션이 울리지 않았다(구별력 0).
    //    또 §166 분기는 재개발 전용 필드가 갖춰져야 결과가 조립된다 — 기존 사례 44 헬퍼를 쓴다.
    const r = run({
      propertyType: "redevelopment_apt",
      transferPrice: 525_000_000,
      transferDate: D("2026-02-16"),
      acquisitionDate: D("2005-04-09"),
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: true,
      isOneHousehold: false,
      residencePeriodMonths: 0,
      redevelopment: case44RedevelopmentInfo(),
    });
    expect(r.new994Detail, "재개발 분기에서 §99의4 상세가 버려졌다").toBeDefined();
  });
});
