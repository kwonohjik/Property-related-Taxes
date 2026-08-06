/**
 * Pre-Do anchor — §100③ 「구분 기장 가액 30% 이상 차이 → 불분명 의제」 판정 함수 (Phase 1-A)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §11 · §12.2 · §12.10
 * 이 파일은 **구현 전에** 작성돼 현행에서 실패한다(정책 `feedback_pre_anchor_verification`).
 *
 * ## 조문
 *
 * 「소득세법」 제100조 **제3항**:
 * > 토지와 건물 등을 **구분 기장한 가액**이 같은 항에 따라 **안분계산한 가액과 100분의 30 이상
 * > 차이가 있는 경우**에는 토지와 건물 등의 가액 구분이 **불분명한 때로 본다**. 다만, 다른 법령에서
 * > 정하는 바에 따라 가액을 구분한 경우 등 대통령령으로 정하는 사유에 해당하는 경우는 제외한다.
 *
 * 단서의 예외 = 「소득세법 시행령」 제166조 **제8항** 1호(다른 법령에 따라 구분) · 2호(함께 취득 후
 * 건물 철거하고 토지만 사용). 부가령 §64②가 같은 2사유를 문언까지 동일하게 규정한다.
 *
 * ## 확정된 해석 (계획서 §11 — 실무 자료 사례 4건으로 재현 검증)
 *
 *   · 비교 대상 = **토지·건물 양쪽 모두**. 한쪽이라도 벗어나면 발동
 *   · 분모 = **안분값**. 적정범위 = 안분값 × 0.7 초과 ~ × 1.3 미만 (**개구간**)
 *   · 「30% **이상** 차이」가 부적합이므로 **정확히 30%도 발동**
 *
 * ## 고정 계약
 *   U-1  실무 자료 사례 4건 재현 (원단위)
 *   U-2  경계 — 정확히 ±30%는 발동 · 1원 안쪽은 미발동
 *   U-3  🔴 **정수 연산** — `× 0.7` 하한을 부동소수로 만들면 판정이 뒤집히는 실입력이 존재한다
 *   U-4  한쪽만 벗어나도 발동한다 (양쪽 검사)
 *   U-5  §166⑧ 예외가 있으면 발동하지 않는다
 */
import { describe, it, expect } from "vitest";
import { judgeDeemedUnclearSplit } from "@/lib/tax-engine/sale-split-deemed-unclear";

/** 실무 자료 예시 — 총 10억 · 감정가액 건물 6억 / 토지 4억 ⇒ 안분값이 곧 감정가액 비율 결과다. */
const AP = { land: 400_000_000, building: 600_000_000 };

const judge = (land: number, building: number, exemption?: "other_law" | "demolished_land_only") =>
  judgeDeemedUnclearSplit({ declared: { land, building }, apportioned: AP, exemption });

describe("U-1 — 실무 자료 사례 4건 재현", () => {
  /**
   * 적정범위: 건물 (4.2억, 7.8억) · 토지 (2.8억, 5.2억).
   * 사례1·2는 **건물은 범위 안인데 토지가 벗어나** 부적합이다 — 「한쪽만 검증」 함정의 실례다.
   */
  it("사례1 — 건물 4.3억 / 토지 5.7억 → 부적합 (토지 42.5%)", () => {
    const r = judge(570_000_000, 430_000_000);
    expect(r.deemedUnclear).toBe(true);
    expect(r.detail.landOver).toBe(true);
    expect(r.detail.buildingOver).toBe(false); // 건물은 28.33%로 범위 안
    expect(r.detail.landDeviationBp).toBe(4250); // 42.50%
    expect(r.detail.buildingDeviationBp).toBe(2833); // 28.33% (floor)
  });

  it("사례2 — 건물 7.7억 / 토지 2.3억 → 부적합 (토지 42.5%)", () => {
    const r = judge(230_000_000, 770_000_000);
    expect(r.deemedUnclear).toBe(true);
    expect(r.detail.landOver).toBe(true);
    expect(r.detail.buildingOver).toBe(false);
  });

  it("사례3 — 건물 7.1억 / 토지 2.9억 → 적합", () => {
    const r = judge(290_000_000, 710_000_000);
    expect(r.deemedUnclear).toBe(false);
    expect(r.detail.landDeviationBp).toBe(2750); // 27.50%
    expect(r.detail.buildingDeviationBp).toBe(1833); // 18.33% (floor)
  });

  it("사례4 — 건물 4.9억 / 토지 5.1억 → 적합", () => {
    const r = judge(510_000_000, 490_000_000);
    expect(r.deemedUnclear).toBe(false);
  });

  it("발동 시 **안분값**을, 미발동 시 **구분값**을 적용한다", () => {
    expect(judge(570_000_000, 430_000_000).applied).toEqual(AP); // 사례1 → 안분
    expect(judge(290_000_000, 710_000_000).applied).toEqual({
      land: 290_000_000,
      building: 710_000_000,
    }); // 사례3 → 구분값 그대로
  });
});

describe("U-2 — 경계는 「이상」이다", () => {
  it("정확히 +30%는 **발동**한다 (토지 5.2억)", () => {
    expect(judge(520_000_000, 480_000_000).deemedUnclear).toBe(true);
  });

  it("정확히 −30%도 **발동**한다 (토지 2.8억)", () => {
    expect(judge(280_000_000, 720_000_000).deemedUnclear).toBe(true);
  });

  it("1원 안쪽은 미발동 — 개구간이다", () => {
    expect(judge(519_999_999, 480_000_001).deemedUnclear).toBe(false);
    expect(judge(280_000_001, 719_999_999).deemedUnclear).toBe(false);
  });
});

describe("U-3 — 🔴 정수 연산이어야 판정이 결정적이다", () => {
  /**
   * `× 0.7` 하한을 부동소수로 계산하면 **판정이 뒤집히는 실입력**이 있다(brute-force 실측).
   *
   *   안분 토지 167,800,000 · 구분 토지 117,460,000 (정확히 −30%)
   *   float 하한: 167_800_000 * 0.7 = 117459999.99999999
   *   ⇒ `구분값 < 하한`이 **false** → bound 방식은 「적합」으로 오판한다.
   *
   * 정수식 `|구분값 − 안분값| × 100 ≥ 안분값 × 30`은 오차가 없다.
   * (원 단위 1천만~20억 구간에서 `× 1.3`은 전부 정확했고 `× 0.7`만 3,821건 부정확했다 —
   *  즉 **하한이 위험**하다. 계획서 §11.5의 「6 × 1.3」 예는 억 단위 스크립트 값이었다.)
   */
  const AP2 = { land: 167_800_000, building: 400_000_000 };

  it("정확히 −30%인 토지를 **발동**으로 판정한다 (float 하한이면 놓친다)", () => {
    const r = judgeDeemedUnclearSplit({
      // 합 = 567,800,000 = 안분 합. 건물은 12.58%로 범위 안이라 토지 판정만 남는다.
      declared: { land: 117_460_000, building: 450_340_000 },
      apportioned: AP2,
    });
    expect(r.deemedUnclear).toBe(true);
    expect(r.detail.landOver).toBe(true);
    expect(r.detail.buildingOver).toBe(false);
    expect(r.detail.landDeviationBp).toBe(3000); // 정확히 30.00%
  });
});

describe("U-4 — 양쪽을 모두 검사한다", () => {
  it("건물만 벗어나도 발동한다", () => {
    // 건물 안분 6억 → 7.8억 이상이면 발동. 토지는 2.2억(안분 4억 대비 45%)이라 함께 벗어난다 →
    // 「건물만」을 만들려면 건물 안분이 토지보다 작아야 한다(§11.3 수학적 성질).
    const r = judgeDeemedUnclearSplit({
      declared: { land: 610_000_000, building: 390_000_000 },
      apportioned: { land: 700_000_000, building: 300_000_000 },
    });
    expect(r.detail.buildingOver).toBe(true); // 정확히 +30%
    expect(r.detail.landOver).toBe(false); // 12.86%
    expect(r.deemedUnclear).toBe(true);
  });

  it("양쪽이 모두 범위 안일 때만 미발동이다", () => {
    const r = judge(490_000_000, 510_000_000);
    expect(r.detail.landOver).toBe(false);
    expect(r.detail.buildingOver).toBe(false);
    expect(r.deemedUnclear).toBe(false);
  });
});

describe("U-5 — §166⑧ 예외", () => {
  it("1호(다른 법령에 따라 구분) — 발동하지 않고 구분값을 쓴다", () => {
    const r = judge(570_000_000, 430_000_000, "other_law");
    expect(r.deemedUnclear).toBe(false);
    expect(r.applied).toEqual({ land: 570_000_000, building: 430_000_000 });
    expect(r.detail.exemptionApplied).toBe("other_law");
  });

  it("2호(철거 후 토지만 사용) — 발동하지 않는다", () => {
    const r = judge(950_000_000, 50_000_000, "demolished_land_only");
    expect(r.deemedUnclear).toBe(false);
    expect(r.detail.exemptionApplied).toBe("demolished_land_only");
  });

  it("예외가 있어도 **이탈 사실 자체는 기록**한다 — 표시·신고서가 읽는다", () => {
    const r = judge(570_000_000, 430_000_000, "other_law");
    expect(r.detail.landOver).toBe(true); // 벗어난 건 사실이다
    expect(r.detail.landDeviationBp).toBe(4250);
  });
});

describe("U-6 — 방어적 입력", () => {
  it("안분값이 0인 파트는 이탈 판정에서 제외한다 — 0으로 나누지 않는다", () => {
    const r = judgeDeemedUnclearSplit({
      declared: { land: 1_000_000_000, building: 0 },
      apportioned: { land: 1_000_000_000, building: 0 },
    });
    expect(r.detail.buildingOver).toBe(false);
    expect(r.detail.buildingDeviationBp).toBe(0);
    expect(r.deemedUnclear).toBe(false);
  });
});
