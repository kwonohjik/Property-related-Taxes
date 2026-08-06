/**
 * Pre-Do anchor — 일반건물 **구분양도 축 + §100③ 30% 의제** (Phase 2-B)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §5 · §16
 *
 * ⚠️ **이 파일은 구현 전에 작성돼 현행에서 실패한다**(정책 `feedback_pre_anchor_verification`).
 *    현행 일반건물 엔진은 양도가액을 **항상** 기준시가 비율로 안분하고(`allocateBundledTransferPrice`),
 *    구분 기재를 받을 입력 필드 자체가 없다(`GeneralBuildingInput`에 `totalTransferPrice`뿐).
 *
 * ## 조문
 *
 * 「소득세법」 제100조 제2항 — 토지·건물을 함께 양도하면 **각각 구분하여 기장**하되 구분이
 * 불분명하면 안분한다. 같은 조 **제3항** — 구분 기장한 가액이 안분계산한 가액과 **100분의 30
 * 이상 차이**가 있으면 구분이 **불분명한 때로 본다**.
 *
 * ⇒ 일반건물도 자산 종류를 가리지 않는 조문이므로 같은 규칙이 적용된다. Phase 1이 split 경로에
 *   만든 판정 함수를 **그대로 호출**한다(계획서 §4.3).
 *
 * ## fixture — 사례 31 (`general-building-case-31.test.ts`와 동일 입력)
 *
 * 총액 925,000,000 · 양도시 기준시가 토지 920,550,000(10,830,000 × 85㎡) / 건물 20,629,440
 * ⇒ **안분값 = 토지 904,725,192 / 건물 20,274,808**.
 *
 * 🔴 **건물이 실질 제약이다** — 분모가 작아 같은 차이 금액이 큰 비율이 된다.
 * 건물 적정범위(개구간) = (14,192,365.6, 26,357,250.4).
 */
import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingAssetCards,
  type GeneralBuildingInput,
} from "@/lib/tax-engine/general-building-valuation";

const BASE: GeneralBuildingInput = {
  totalTransferPrice: 925_000_000,
  transferDate: new Date("2023-02-19"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
  buildingAcquisitionCause: "purchase",
  buildingAcquisitionDate: new Date("1999-05-24"),
};

/** 기준시가 비율 안분값 — 사례 31 anchor와 같은 값이다 */
const APPORTIONED = { land: 904_725_192, building: 20_274_808 };

const mk = (over: Partial<GeneralBuildingInput> = {}) =>
  buildGeneralBuildingAssetCards({ ...BASE, ...over });

describe("G-1 — 구분 기재가 없으면 현행 그대로다 (회귀 0)", () => {
  it("안분값이 사례 31 anchor와 일치한다", () => {
    const out = mk();
    expect(out.allocation.land).toBe(APPORTIONED.land);
    expect(out.allocation.building).toBe(APPORTIONED.building);
  });
});

describe("G-2 — 적정범위 안의 구분 기재는 그대로 쓴다", () => {
  /**
   * 토지 900,000,000 / 건물 25,000,000
   *   토지 이탈 ≈ 0.5% · 건물 이탈 ≈ 23.3% ⇒ 둘 다 30% 미만 → 발동하지 않는다.
   */
  const over = { landTransferPrice: 900_000_000, buildingTransferPrice: 25_000_000 };

  it("양도가액이 구분값이 된다", () => {
    const out = mk(over);
    expect(out.allocation.land).toBe(900_000_000);
    expect(out.allocation.building).toBe(25_000_000);
  });

  it("합은 여전히 총액이다", () => {
    const out = mk(over);
    expect(out.allocation.land + out.allocation.building).toBe(925_000_000);
  });

  it("🔴 환산취득가 **분자**가 구분값을 따른다 — 분모(기준시가)는 그대로다", () => {
    // 환산취득가 = 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가).
    // 구분 토지값(9억)이 안분값(904,725,192)보다 **작으므로** 환산취득가도 작아져야 한다.
    // 상수로 못박지 않고 부등식으로 고정한다 — 산식을 테스트가 복제하면 순환논증이 된다.
    const base = mk();
    const split = mk(over);
    expect(split.acquisition.land).toBeLessThan(base.acquisition.land);
    expect(split.acquisition.building).toBeGreaterThan(base.acquisition.building);
  });

  it("개산공제는 바뀌지 않는다 — 취득시 기준시가만 쓰므로 양도가액 축과 무관하다", () => {
    expect(mk(over).estimatedDeduction).toEqual(mk().estimatedDeduction);
  });
});

describe("G-3 — 30% 이상 벗어나면 안분값으로 되돌린다 (§100③)", () => {
  /**
   * 토지 825,000,000 / 건물 100,000,000
   *   건물 이탈 = |1억 − 20,274,808| / 20,274,808 ≈ 393% ⇒ 발동.
   *   토지는 8.8%로 범위 안이지만 **한쪽만 벗어나도 발동**한다(§11.1).
   */
  const over = { landTransferPrice: 825_000_000, buildingTransferPrice: 100_000_000 };

  it("건물만 벗어나도 발동해 양쪽 다 안분값이 된다", () => {
    const out = mk(over);
    expect(out.allocation.land).toBe(APPORTIONED.land);
    expect(out.allocation.building).toBe(APPORTIONED.building);
  });

  it("발동하면 환산취득가도 안분 기준으로 돌아온다", () => {
    expect(mk(over).acquisition).toEqual(mk().acquisition);
  });
});

describe("G-4 — 한쪽만 입력하면 잔액으로 도출하고 그 파트도 판정한다 (S-8 · Q-3)", () => {
  it("건물만 입력 → 토지는 총액 − 건물로 도출된다", () => {
    const out = mk({ buildingTransferPrice: 25_000_000 });
    expect(out.allocation.building).toBe(25_000_000);
    expect(out.allocation.land).toBe(900_000_000);
  });

  it("🔴 도출된 파트가 벗어나면 발동한다 — 「한쪽만 검증하고 차액으로 결정」 금지(§11.3)", () => {
    // 건물 1억만 입력 → 토지 825,000,000으로 도출. 건물이 393% 벗어나므로 발동한다.
    const out = mk({ buildingTransferPrice: 100_000_000 });
    expect(out.allocation.land).toBe(APPORTIONED.land);
    expect(out.allocation.building).toBe(APPORTIONED.building);
  });
});

describe("G-7 — 감정평가가액이 기준시가를 이긴다 (부가령 §64①1호 단서)", () => {
  /**
   * 감정 토지 4억 / 건물 5.25억 (합 = 총액 9.25억) ⇒ 감정 비율 안분값이 그대로 4억 / 5.25억.
   * 기준시가 안분값(904,725,192 / 20,274,808)과 **확연히 달라** 어느 basis를 썼는지 한눈에 갈린다.
   *
   * 양도 2023-02-19 ⇒ 유효 창 = [2022-01-01, 2023-12-31].
   */
  const APPRAISAL = {
    landAppraisalAtTransfer: 400_000_000,
    buildingAppraisalAtTransfer: 525_000_000,
    appraisalDateAtTransfer: new Date("2022-06-01"),
  };

  it("🔴 감정 3필드를 넣으면 감정 비율로 안분한다", () => {
    const out = mk(APPRAISAL);
    expect(out.allocation.land).toBe(400_000_000);
    expect(out.allocation.building).toBe(525_000_000);
  });

  /**
   * 🔴 **시기 요건은 엔진이 판정하지 않는다**(2026-08-06 · Q-9 확정 — 계획서 §21).
   *
   * 종전에는 감정일자가 없거나 유효 창을 벗어나면 기준시가로 후퇴시켰다. 그 판정은 부가령
   * §64①1호 괄호의 「공급시기」를 **양도시기로 읽는 유추** 위에 서 있었다. 근거가 확정되지 않아
   * 엔진이 대신 판단하지 않고, 사용자가 감정평가가액으로 안분하겠다고 한 선택을 따른다.
   */
  it("감정일자가 없어도 감정 비율로 안분한다", () => {
    const out = mk({
      landAppraisalAtTransfer: 400_000_000,
      buildingAppraisalAtTransfer: 525_000_000,
    });
    expect(out.allocation.land).toBe(400_000_000);
    expect(out.allocation.building).toBe(525_000_000);
  });

  it("아주 오래된 감정(양도 2년 전)도 그대로 채택한다", () => {
    const out = mk({ ...APPRAISAL, appraisalDateAtTransfer: new Date("2021-12-31") });
    expect(out.allocation.land).toBe(400_000_000);
  });

  it("구분 기재와 함께 쓰면 **감정 기준**으로 30% 판정한다", () => {
    // 구분값 4억 / 5.25억은 감정 안분값과 정확히 같으므로 미발동.
    // 같은 구분값을 기준시가 basis(904,725,192)로 재면 토지가 −55%라 발동했을 것이다.
    const j = mk({
      ...APPRAISAL,
      landTransferPrice: 400_000_000,
      buildingTransferPrice: 525_000_000,
    }).saleSplitJudgment;
    expect(j!.basisKind).toBe("appraisal");
    expect(j!.deemedUnclear).toBe(false);
    expect(j!.applied).toEqual({ land: 400_000_000, building: 525_000_000 });
  });

  it("배제 사유가 판정 결과에 실린다 — 조용히 후퇴하지 않는다", () => {
    const j = mk({
      ...APPRAISAL,
      buildingAppraisalAtTransfer: undefined,
      landTransferPrice: 900_000_000,
    }).saleSplitJudgment;
    expect(j!.basisKind).toBe("std_price");
    expect(j!.appraisalRejected).toBe("incomplete");
  });
});

describe("G-6 — 🔴 증축 조합도 구분 기재를 받는다 (Q-4 확정 — 계약이 뒤집혔다)", () => {
  /**
   * ## 계약 이력
   *
   * 종전에는 「건물 양도가액 하나를 본체·증축에 배분할 근거가 없다」며 **차단**했다.
   * 2026-08-06 사용자 확정으로 기준이 정해졌다:
   *
   * > 증축분이 미미하면 당초 건물의 **자본적 지출**로 처리하고, 크고 중요하면 양도소득금액을
   * > 구분하여 계산한다(중요 여부는 사용자 판단). 그 경우 양도가액을 당초 건물·증축 건물·토지로
   * > 나누는 기준은 **양도 당시 기준시가 비율**밖에 없다.
   *
   * ⇒ 토지는 구분값을 그대로 쓰고, **건물 구분값을 본체·증축에 기준시가 비율로** 나눈다.
   *   §100③ 판정은 계약서가 구분한 축(**토지 ↔ 건물 합계**) 기준 2-way다.
   */
  const withExtension: Partial<GeneralBuildingInput> = {
    extensionInfo: {
      extensionDate: new Date("2010-05-01"),
      extensionAcquisitionCause: "newConstruction",
      transferExtensionBuildingStdPrice: 5_000_000,
      acquisitionExtensionBuildingStdPrice: 4_000_000,
    },
  };

  /** 3-way 안분(구분 기재 없음)을 기준선으로 잡는다 */
  const base = () => mk(withExtension);

  it("구분 기재가 없으면 종전 3-way 안분 그대로다 (회귀 0)", () => {
    const out = base();
    expect(out.allocation.land + out.allocation.building).toBeLessThan(925_000_000); // 건물2가 따로 있다
    expect(out.saleSplitJudgment).toBeUndefined();
  });

  it("🔴 토지는 구분값을 그대로 쓴다", () => {
    const out = mk({ ...withExtension, landTransferPrice: 900_000_000, buildingTransferPrice: 25_000_000 });
    expect(out.allocation.land).toBe(900_000_000);
  });

  it("🔴 건물 구분값을 본체·증축에 **양도시 기준시가 비율**로 나눈다", () => {
    const out = mk({ ...withExtension, landTransferPrice: 900_000_000, buildingTransferPrice: 25_000_000 });
    // 본체 : 증축 = 20,629,440 : 5,000,000 ⇒ 본체 몫 = floor(25,000,000 × 20,629,440 / 25,629,440)
    const expected1 = Math.floor((25_000_000 * 20_629_440) / 25_629_440);
    expect(out.allocation.building).toBe(expected1);
    // 증축 몫은 잔액이므로 합이 건물 구분값과 정확히 같다
    const b2 = 25_000_000 - expected1;
    expect(out.allocation.building + b2).toBe(25_000_000);
  });

  it("한쪽만 입력해도 나머지를 도출한 뒤 같은 방식으로 나눈다", () => {
    const out = mk({ ...withExtension, buildingTransferPrice: 25_000_000 });
    expect(out.allocation.land).toBe(900_000_000); // 925,000,000 − 25,000,000
  });

  it("🔴 §100③ 판정은 **토지 ↔ 건물 합계** 2-way다", () => {
    const out = mk({ ...withExtension, landTransferPrice: 900_000_000, buildingTransferPrice: 25_000_000 });
    const j = out.saleSplitJudgment!;
    expect(j.declared).toEqual({ land: 900_000_000, building: 25_000_000 });
    // 안분값의 건물은 본체+증축 **합계**다 — 계약서가 구분하지 않은 축은 비교 대상이 아니다
    expect(j.apportioned.land + j.apportioned.building).toBe(925_000_000);
    expect(j.basisKind).toBe("std_price");
  });

  it("30% 이상 벗어나면 3-way 안분값으로 되돌린다", () => {
    const over = mk({ ...withExtension, landTransferPrice: 700_000_000, buildingTransferPrice: 225_000_000 });
    const b = base();
    expect(over.saleSplitJudgment!.deemedUnclear).toBe(true);
    expect(over.allocation.land).toBe(b.allocation.land);
    expect(over.allocation.building).toBe(b.allocation.building);
  });

  it("합이 총액과 다르면 차단한다", () => {
    expect(() =>
      mk({ ...withExtension, landTransferPrice: 900_000_000, buildingTransferPrice: 30_000_000 }),
    ).toThrow(/총 양도가액.*과 다릅니다/);
  });
});

describe("G-5 — §166⑧ 예외를 선택하면 발동하지 않는다", () => {
  it("30% 초과여도 구분값을 그대로 쓴다", () => {
    const out = mk({
      landTransferPrice: 825_000_000,
      buildingTransferPrice: 100_000_000,
      saleSplitExemption: "other_law",
    });
    expect(out.allocation.land).toBe(825_000_000);
    expect(out.allocation.building).toBe(100_000_000);
  });
});
