/**
 * anchor — §99·§99의3 재계약·대체취득 배제와 **조특칙 §44의4 카브백** (D3-06)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특령 §99의3④** — 「법 제99조의3제1항제1호에서 "대통령령으로 정하는 사유에 해당하는 사실이
 * 있는 주택"이란 **2001년 5월 23일 전에** 주택건설사업자와 주택분양계약을 체결한 분양계약자가
 * 당해 계약을 해제하고 분양계약자 또는 그 배우자(분양계약자 또는 그 배우자의 직계존비속 및
 * 형제자매를 포함한다)가 ⓐ **당초 분양계약을 체결하였던 주택을 다시 분양받아 취득한 주택** 또는
 * ⓑ 당해 주택건설사업자로부터 당초 분양계약을 체결하였던 주택에 **대체하여 다른 주택을 분양받아
 * 취득한 주택**을 말한다. **다만, 재정경제부령이 정하는 사유에 해당하는 주택을 제외한다.**」
 *
 * **조특칙 §44의4** — 「**영 제99조제2항 단서 및 영 제99조의3제4항 단서**에서 "재정경제부령이
 * 정하는 사유에 해당하는 주택"이라 함은 「소득세법 시행규칙」 **제71조제3항**의 규정에 의한
 * 사유로 **당해주택건설업자로부터 다른 주택을 분양받아 취득하는 경우**의 주택을 말한다.」
 *
 * **소칙 §71③** 사유 — 취학 · 근무상 형편(전근 등) · 1년 이상 치료·요양을 요하는 질병 ·
 * 학교폭력으로 인한 전학.
 *
 * ## 결함
 * ① §99의3: 배제 자체가 **미구현**(엔진·⑤·④·⑫·⑭ 전무) — 배제 대상자가 감면을 받았다.
 * ② §99: 배제는 구현됐으나 **카브백이 없어** 부득이한 사유로 대체취득한 정상 대상자를
 *    **법 근거 없이 배제**했다. 조특칙 §44의4가 두 조문을 **함께** 받으므로 같은 결함이다.
 *
 * ⚠️ 카브백은 **ⓑ 대체취득(다른 주택) 갈래**에만 대응한다 — 조특칙 §44의4가
 *    「…다른 주택을 분양받아 취득하는 경우」로 한정한다. ⓐ 재분양은 카브백 대상이 아니다.
 *    (엔진은 사용자 자기선언을 그대로 받으므로 그 구분은 ⑤ 안내문이 담당한다.)
 */
import { describe, it, expect } from "vitest";
import { evaluateNew993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { evaluateNew99 } from "@/lib/tax-engine/transfer-reductions/new-99";

const D = (s: string) => new Date(`${s}T00:00:00`);

const BASE_993 = {
  transferDate: D("2012-06-30"),
  acquisitionDate: D("2003-03-01"),
  contractDate: D("2002-01-10"),
  transferIncome: 300_000_000,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  standardPriceAtTransfer: 500_000_000,
  wholePropertyTransferPrice: 550_000_000,
  exclusiveAreaSqm: 84,
  region: "outside_speculation" as const,
  isResident: true,
  isHousingConstructionBusiness: false,
  acquisitionType: "from_builder" as const,
  calculatedTaxBeforeReduction: 100_000_000,
  calculatedTaxAfterReduction: 0,
};

describe("§99의3④ 재계약·대체취득 배제", () => {
  it("기준선 — 배제 사유 없으면 적용된다", () => {
    expect(evaluateNew993(BASE_993).isEligible).toBe(true);
  });

  it("🔴 배제 사유 선언 시 적용 배제된다", () => {
    const r = evaluateNew993({ ...BASE_993, isRecontractExcluded: true });
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("RECONTRACT_EXCLUDED");
    expect(r.ineligibleReasons?.[0].legalBasis).toContain("§99의3");
  });

  it("🔴 조특칙 §44의4 카브백 — 부득이한 사유 대체취득이면 배제하지 않는다", () => {
    const r = evaluateNew993({
      ...BASE_993,
      isRecontractExcluded: true,
      recontractUnavoidableCause: true,
    });
    expect(r.isEligible, "카브백이 없으면 법 근거 없는 불리 적용이 된다").toBe(true);
    expect(r.reducibleTransferIncome).toBeGreaterThan(0);
  });

  it("카브백만 선언되고 배제 사유가 없으면 아무 영향이 없다", () => {
    const r = evaluateNew993({ ...BASE_993, recontractUnavoidableCause: true });
    expect(r.isEligible).toBe(true);
  });
});

const BASE_99 = {
  transferDate: D("2010-06-30"),
  acquisitionDate: D("1999-03-01"),
  contractDate: D("1999-02-01"),
  transferIncome: 300_000_000,
  standardPriceAtAcquisition: 100_000_000,
  standardPriceAt5Years: 150_000_000,
  standardPriceAtTransfer: 300_000_000,
  wholePropertyTransferPrice: 500_000_000,
  exclusiveAreaSqm: 84,
  isResident: true,
  isHousingConstructionBusiness: false,
  acquisitionType: "from_builder" as const,
  calculatedTaxBeforeReduction: 100_000_000,
  calculatedTaxAfterReduction: 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("§99② 재계약·대체취득 배제 — 같은 카브백이 걸린다", () => {
  it("배제 사유 선언 시 적용 배제된다 (종전 동작 보존)", () => {
    const r = evaluateNew99({ ...BASE_99, isRecontractExcluded: true });
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("RECONTRACT_EXCLUDED");
  });

  it("🔴 카브백 — 조특칙 §44의4는 «영 §99② 단서»도 함께 받는다", () => {
    const r = evaluateNew99({
      ...BASE_99,
      isRecontractExcluded: true,
      recontractUnavoidableCause: true,
    });
    expect(r.isEligible, "§99에만 카브백이 없으면 두 조문이 어긋난다").toBe(true);
  });
});
