/**
 * Phase F ⑧ — 비주택 → 주택 용도변경 validation.
 *
 * 계획서 케이스: C-8·C-9·C-14·C-16·C-18~C-21·C-24
 * (C-26 비-primary는 UI 미노출로 처리 — validation 대상이 아니다.)
 *
 * ⚠️ 이 검증은 `validateAssetAcquisition`의 **모든 조기 return보다 앞**에 있어야 한다.
 *    부담부증여·겸용주택·이월과세는 각자 전용 검증으로 빠져나가므로, 뒤에 두면
 *    차단이 필요한 바로 그 조합에서 dead code가 된다 — 그 배치를 여기서 고정한다.
 */
import { describe, it, expect } from "vitest";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const TRANSFER_DATE = "2026-01-27";

function asset(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2018-02-10",
    actualSalePrice: "1,500,000,000",
    fixedAcquisitionPrice: "600,000,000",
    hasNonHousingConversion: true,
    residentialUseStartDate: "2022-11-25",
    ...over,
  };
}

const check = (over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) =>
  validateAssetAcquisition(asset(over), "자산 1", TRANSFER_DATE);

describe("정상 입력은 통과한다", () => {
  it("토글 ON + 유효한 날짜", () => {
    expect(check()).toBeNull();
  });

  it("토글 OFF면 이 검증이 개입하지 않는다 (회귀 0)", () => {
    expect(check({ hasNonHousingConversion: false, residentialUseStartDate: "" })).toBeNull();
  });

  /**
   * I-1 — C-21 범위 정정(2026-08-05). §154⑧3호는 "상속받은 **주택**"이 전제인데,
   * C-8이 용도변경일 > 취득일(=상속개시일)을 강제하므로 토글 ON인 상속은 언제나
   * 「상속개시 당시 비주택」이다 ⇒ 경합이 성립하지 않아 차단할 근거가 없다.
   * 설계: `docs/02-design/features/non-housing-to-housing-conversion-inheritance-c21.plan.md`
   */
  /**
   * K-5 — C-21 폐지(2026-08-05). §95④ 단서는 "제97조의2제1항의 경우"에만 미치므로
   * 단순 증여는 수증자 취득일 기산이고, 달리 취급하는 문언이 없다.
   */
  it("K-5 단순 증여는 통과한다 — §95④ 단서가 미치지 않는다", () => {
    expect(check({ acquisitionCause: "gift", donorAcquisitionDate: "2015-01-01" })).toBeNull();
  });

  it("I-1 상속 취득은 통과한다 — §154⑧3호 경합이 성립하지 않는다", () => {
    // `decedentAcquisitionDate`는 상속 자산의 **기존** 필수 필드다(용도변경과 무관 —
    // `transfer-tax-validate-asset.ts:557`). 용도변경 차단이 풀리면 이 요구가 드러난다.
    expect(
      check({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-03-05" }),
    ).toBeNull();
  });
});

describe("날짜 검증", () => {
  it("C-16 개시일 미입력 → 차단", () => {
    expect(check({ residentialUseStartDate: "" })).toMatch(/주거용 사용 개시일을 입력/);
  });

  it("C-8 개시일이 취득일 이전 → 차단", () => {
    expect(check({ residentialUseStartDate: "2017-01-01" })).toMatch(/취득일 이후/);
  });

  it("C-8 개시일 = 취득일이어도 차단 (기간을 나눌 수 없다)", () => {
    expect(check({ residentialUseStartDate: "2018-02-10" })).toMatch(/취득일 이후/);
  });

  it("C-9 개시일이 양도일 이후 → 차단", () => {
    expect(check({ residentialUseStartDate: "2026-06-01" })).toMatch(/양도일 이전/);
  });
});

describe("지원하지 않는 조합 — 전부 공통 안내를 단다", () => {
  const cases: [string, Partial<ReturnType<typeof makeDefaultAsset>>, RegExp][] = [
    ["C-14 겸용주택", { isMixedUseHouse: true }, /겸용주택/],
    ["C-19 토지·건물 분리취득", { hasSeperateLandAcquisitionDate: true }, /서로 다른 시점/],
    ["C-24 부담부증여", { transferType: "burdened_gift" }, /부담부증여/],
  ];

  it.each(cases)("%s → 차단", (_label, over, pattern) => {
    const msg = check(over);
    expect(msg).toMatch(pattern);
    // 사용자가 빠져나갈 길을 항상 함께 알려준다
    expect(msg).toMatch(/토글을 끄면 종전 방식으로 계산됩니다/);
  });

  it("C-18 장기임대 §97의3 → 차단", () => {
    const msg = check({
      reductions: [{ type: "rental_97_3" }] as ReturnType<typeof makeDefaultAsset>["reductions"],
    });
    expect(msg).toMatch(/장기임대주택·미분양주택/);
  });

  it("C-20 §98의2 미분양 → 차단", () => {
    const msg = check({
      reductions: [{ type: "unsold_98_2" }] as ReturnType<typeof makeDefaultAsset>["reductions"],
    });
    expect(msg).toMatch(/장기임대주택·미분양주택/);
  });

  it("무관한 감면은 차단하지 않는다", () => {
    expect(
      check({
        reductions: [{ type: "self_farming" }] as ReturnType<typeof makeDefaultAsset>["reductions"],
      }),
    ).toBeNull();
  });
});

describe("★ 배치 — 조기 return보다 앞에 있다", () => {
  it("겸용주택은 전용 검증으로 빠지기 전에 잡힌다", () => {
    // 겸용주택 전용 검증(validateMixedUseAsset)이 먼저 돌면 그쪽 메시지가 나온다.
    // 용도변경 차단 메시지가 나와야 배치가 맞다.
    expect(check({ isMixedUseHouse: true })).toMatch(/겸용주택과 함께 사용할 수 없습니다/);
  });

  it("부담부증여는 전용 검증으로 빠지기 전에 잡힌다", () => {
    expect(check({ transferType: "burdened_gift" })).toMatch(/부담부증여 양도입니다/);
  });

  /**
   * C-21 폐지 후에도 **배치**는 지켜야 한다. 이월과세 전용 검증(`validateCarryoverAsset`)이
   * 먼저 돌면 그쪽 메시지가 나온다 — 용도변경의 C-8 하한 메시지가 나와야 배치가 맞다.
   */
  it("이월과세는 전용 검증으로 빠지기 전에 잡힌다 (C-8 하한)", () => {
    const msg = check({
      acquisitionCause: "carryover_gift",
      // 전환일(2022-11-25)보다 **늦은** 등기접수일 → C-8 하한 위반
      carryover: { giftRegistryDate: "2023-01-01" } as ReturnType<
        typeof makeDefaultAsset
      >["carryover"],
    });
    expect(msg).toMatch(/증여 등기접수일 이후여야 합니다/);
  });
});
