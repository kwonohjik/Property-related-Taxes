/**
 * anchor — 양도시 **감정평가가액 basis 배관** (Phase 1-E · E-1)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.3 · §14.6
 *
 * ## 무엇을 잡는가
 *
 * 1-B가 `resolveSaleApportionBasis`에 **서열·시기 요건**을 완성했지만, 엔진 입력에서 그 함수까지
 * 감정가액이 **도달하지 않았다**(`resolveBasis`가 기준시가만 넘겼다). 1-E가 그 배관을 붙인다.
 *
 * ⇒ 이 파일은 **배관의 인과성**을 잡는다. 서열 판정 자체의 단위 테스트는 1-B anchor(B-1~B-9)에
 *   있으므로 여기서 되풀이하지 않는다.
 *
 * ## 조문
 *
 * 「부가가치세법 시행령」 제64조 제1항 제1호 **단서** — 「다만, 감정평가가액 … 이 있는 경우에는
 * **그 가액에 비례하여** 안분 계산한 금액으로 한다」 (「소득세법 시행령」 제166조 제6항이 차용).
 * ⇒ **서열: 감정평가가액 > 기준시가.**
 *
 * 같은 호 괄호의 시기 요건 ⇒ 유효 창 = **[(양도연도 − 1)-01-01, 양도연도-12-31]**
 * (「소득세법」 제5조 제1항 역년). 양도 2024-06-01 ⇒ **[2023-01-01, 2024-12-31]**.
 *
 * ## fixture — 두 basis가 **정반대 결론**을 내도록 짰다
 *
 * 총액 15억 · 양도시 기준시가 토지 9억 / 건물 6억 · 감정평가가액 토지 12억 / 건물 3억.
 * 구분 기재를 **12억 / 3억**으로 두면:
 *
 * | basis | 안분값 | 구분값(12억/3억)의 이탈 | §100③ |
 * |---|---|---|---|
 * | 기준시가 | 9억 / 6억 | 건물 **−50%** | **발동** → 9억/6억 적용 |
 * | 감정평가가액 | 12억 / 3억 | 0% | 미발동 → 12억/3억 적용 |
 *
 * ⇒ 배관이 끊기면 `deemedUnclear`와 **적용 양도가액이 통째로 뒤집힌다**. 세액 상수에 기대지 않고
 *   이 부등식으로 인과성을 고정한다(순환논증 회피).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** 기준시가 비율 안분값 (9억 : 6억) */
const BY_STD = { land: 900_000_000, building: 600_000_000 };
/** 감정평가가액 비율 안분값 (12억 : 3억) */
const BY_APPRAISAL = { land: 1_200_000_000, building: 300_000_000 };

/** 감정가액과 **같은** 구분 기재 — 기준시가 basis에서는 건물이 −50%로 발동한다. */
const DECLARED = { landTransferPrice: 1_200_000_000, buildingTransferPrice: 300_000_000 };

/** 창 안 감정일자 (양도연도 직전 과세기간) */
const IN_WINDOW = new Date("2023-06-01");

const APPRAISAL_FIELDS = {
  landAppraisalAtTransfer: BY_APPRAISAL.land,
  buildingAppraisalAtTransfer: BY_APPRAISAL.building,
  appraisalDateAtTransfer: IN_WINDOW,
};

const mk = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2016-06-01"),
    landAcquisitionDate: new Date("2014-06-01"),
    acquisitionPrice: 0,
    landAcquisitionPrice: 400_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    landStandardPriceAtTransfer: BY_STD.land,
    buildingStandardPriceAtTransfer: BY_STD.building,
    isOneHousehold: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    ...over,
  });

const taxOf = (over: Partial<TransferTaxInput> = {}) => calculateTransferTax(mk(over), rates).totalTax;
const splitOf = (over: Partial<TransferTaxInput> = {}) => calculateTransferTax(mk(over), rates).splitDetail;
const judgeOf = (over: Partial<TransferTaxInput> = {}) => splitOf(over)!.saleSplitJudgment;

describe("E-1-1 — 감정평가가액이 기준시가를 이긴다 (§64①1호 단서)", () => {
  it("🔴 대조군: 감정 없이 12억/3억을 신고하면 −50% 이탈로 **발동**해 9억/6억이 적용된다", () => {
    const j = judgeOf(DECLARED);
    expect(j!.basisKind).toBe("std_price");
    expect(j!.deemedUnclear).toBe(true);
    expect(j!.applied).toEqual(BY_STD);
  });

  it("🔴 감정 3필드를 넣으면 같은 신고가 **미발동**하고 12억/3억이 그대로 적용된다", () => {
    const over = { ...DECLARED, ...APPRAISAL_FIELDS };
    const j = judgeOf(over);
    expect(j!.basisKind).toBe("appraisal");
    expect(j!.apportioned).toEqual(BY_APPRAISAL);
    expect(j!.deemedUnclear).toBe(false);
    expect(j!.applied).toEqual(BY_APPRAISAL);
  });

  it("세액이 실제로 갈린다 — 배관이 끊기면 두 값이 같아진다", () => {
    expect(taxOf({ ...DECLARED, ...APPRAISAL_FIELDS })).not.toBe(taxOf(DECLARED));
  });

  it("일괄양도(구분 기재 없음)에서도 감정 비율로 안분된다", () => {
    const s = splitOf(APPRAISAL_FIELDS);
    expect(s!.land.transferPrice).toBe(BY_APPRAISAL.land);
    expect(s!.building.transferPrice).toBe(BY_APPRAISAL.building);
  });
});

describe("E-1-2 — 감정일자가 없으면 감정가액을 쓰지 않는다", () => {
  /**
   * 시기 요건을 판정할 수 없으면 basis로 채택할 근거가 없다. `resolveBasis`가 **아예 넘기지 않으므로**
   * 배제 사유도 남지 않는다 — 「입력이 있었는데 배제된」 상태가 아니라 「입력이 성립하지 않은」 상태다.
   * (정상 경로에서는 validate가 「감정가액 입력 시 감정일자 필수」로 먼저 막는다.)
   */
  it("가액 2필드만 있으면 기준시가로 안분한다", () => {
    const j = judgeOf({
      ...DECLARED,
      landAppraisalAtTransfer: BY_APPRAISAL.land,
      buildingAppraisalAtTransfer: BY_APPRAISAL.building,
    });
    expect(j!.basisKind).toBe("std_price");
    expect(j!.deemedUnclear).toBe(true);
    expect(j!.appraisalRejected).toBeUndefined();
  });
});

describe("E-1-3 — 배제 사유가 결과에 실린다 (침묵 후퇴 금지)", () => {
  it("한쪽만 평가됐으면 `incomplete`로 남고 기준시가로 후퇴한다", () => {
    const j = judgeOf({
      ...DECLARED,
      landAppraisalAtTransfer: BY_APPRAISAL.land,
      appraisalDateAtTransfer: IN_WINDOW,
    });
    expect(j!.basisKind).toBe("std_price");
    expect(j!.appraisalRejected).toBe("incomplete");
  });

  it("창을 벗어난 감정은 `out_of_window`로 남고 기준시가로 후퇴한다", () => {
    const j = judgeOf({
      ...DECLARED,
      ...APPRAISAL_FIELDS,
      appraisalDateAtTransfer: new Date("2022-12-31"), // 창 시작(2023-01-01) 하루 전
    });
    expect(j!.basisKind).toBe("std_price");
    expect(j!.appraisalRejected).toBe("out_of_window");
    expect(j!.deemedUnclear).toBe(true);
  });

  it("창 시작일 당일은 **유효**하다 — 경계는 닫혀 있다", () => {
    const j = judgeOf({
      ...DECLARED,
      ...APPRAISAL_FIELDS,
      appraisalDateAtTransfer: new Date("2023-01-01"),
    });
    expect(j!.basisKind).toBe("appraisal");
    expect(j!.appraisalRejected).toBeUndefined();
  });

  it("채택된 경우에는 배제 사유가 없다", () => {
    expect(judgeOf({ ...DECLARED, ...APPRAISAL_FIELDS })!.appraisalRejected).toBeUndefined();
  });
});
