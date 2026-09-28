/**
 * L-12 anchor — 완공APT **청산금 수령분** 1세대1주택 비과세: 판정 기준일 · 권리가액 고가 안분
 *
 * ── 근거 (taxlaw.nts.go.kr 원문 실독 2026-09-28) ─────────────────────────────────────────
 * · 부동산거래관리과-380 (2012.07.20) — 「… 그 청산금의 1세대1주택 비과세는 **양도일 현재를
 *   기준으로** 적용하는 것이나, … 3년 미만 보유하던 종전주택을 당해 조합에 제공한 경우 그 청산금은
 *   … 제154조제1항의 1세대1주택 비과세 요건을 충족하지 아니하여 양도소득세가 과세되는 것입니다.」
 * · 사전-2022-법규재산-1282 (2023.02.17) — 「“청산금 해당주택”의 1세대 1주택 비과세를 적용 여부는
 *   “청산금 해당주택”의 양도일 현재를 기준으로 판단하는 것이며, … 양도시기는 … **소유권이전
 *   고시일의 다음날**」 · 그 날 입주권으로 받은 신축 2채를 함께 소유 → §154① 불가.
 * · 서면-2016-법령해석재산-2705 [법령해석과-2904] (2016.09.12) 질의2 · 부동산납세과-1850
 *   (2016.12.02) — 「… 관리처분계획에 따라 정하여진 가격(**권리가격**)이 고가주택에 해당하는 경우,
 *   지급받은 청산금의 양도차익은 “청산금에 대한 양도차익”에 … 제95조 제3항 및 … 제160조 제1항
 *   제1호의 규정을 적용하여 9억원을 초과하는 부분에 대해 계산하는 금액」.
 *   (질의1 회신은 380을 그대로 인용한다 — 「인가일 기준」의 근거가 아니다.)
 * · 기준금액은 **양도일** 시점 값(소득세법 §89①3호 괄호 · 시행령 §156① 연혁 —
 *   `resolveHighValueHouseThreshold`). 청산금분의 양도일은 소유권이전 고시일 다음날(1282).
 *
 * ── 수정 전 → 후 실측 (`makeMockRates()`, 사례 47 사실관계: 2001 취득 · 인가 2014-02-01 ·
 *    청산금 2억 수령 · 보유 요건 충족 선언) ─────────────────────────────────────────────
 * | # | 시나리오 | 수정 전 총납부세액 | 수정 후 |
 * |---|---|---|---|
 * | A-2 | 단독신고 · 권리가액 8억 · 1주택 | 29,216,000 (비과세 미적용) | 0 |
 * | B-1 | 동시신고 10억 · 권리가액 15억 | 32,360,166 (청산금분 전액 과세) | 2,513,500 |
 * | B-2 | 단독신고 · 권리가액 15억 | 32,360,166 | 2,513,500 |
 * | B-3 | 동시신고 20억 · 권리가액 15억 | 62,850,332 (신축 비율 0.4 차용) | 51,926,600 |
 * | C-1 | 동시신고 20억 · 보유 요건 미충족 | 230,967,000 (신축 비율 0.4로 축소) | 264,924,000 |
 * | D-1 | 청산금분 양도일 1주택 · 신축 양도일 2주택 | 315,051,000 | 258,456,000(선언 yes) |
 * | D-2 | 청산금분 양도일 2주택 · 신축 양도일 1주택 | 0 (과다 비과세) | 29,216,000(선언 no) |
 * | E-1 | 단독신고 2020 · 권리가액 10억(9억 시기) | 30,563,500 | 666,600 |
 * | E-2 | 동시신고 2020 · 권리가액 10억 | 0 (12억 고정 기준) | 666,600 |
 * | F   | 입주권 + 청산금 수령 · 세대 1주택 | 22,478,500 (§166①2호 가목분 300,000,000 소실) | 148,566,000 |
 * | G-1 | 단독신고 청산금 13억 · 권리가액 20억 · 보유 요건 미충족 | 10,560,000 (청산금액으로 §95③ 안분) | 358,710,000 |
 * | G-2 | 같은 사실 · 보유 요건 충족 | 10,560,000 | 122,518,000 |
 * (수정 전 값은 base `0b005867` 코드로 같은 fixture를 돌린 실측이다.)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case47RedevelopmentInfo } from "./_helpers";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { SETTLEMENT_ONE_HOUSE_UNDETERMINED_WARNING } from "@/lib/tax-engine/transfer-tax-redevelopment-settlement";

const rates = makeMockRates();

/** 동시신고 — 사례 47 사실관계, 신축주택 양도가액·청산금분 양도일만 바꾼다. */
function sim(
  price: number,
  redev: Partial<RedevelopmentInfo> = {},
  o: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: price,
    transferDate: new Date("2022-03-01"),
    acquisitionDate: new Date("2001-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 254,
    redevelopment: { ...case47RedevelopmentInfo(), ...redev },
    ...o,
  });
}

/** 단독신고 — ④와 같이 양도가액 = 청산금, 양도일 = 청산금분 양도일(`transfer-tax-api.ts` 미러). */
function solo(redev: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
  const r = { ...case47RedevelopmentInfo(), receiveOnlyMode: true, ...redev };
  return sim(r.settlementAmount, r, { transferDate: r.settlementSaleDate! });
}

const run = (i: TransferTaxInput) => {
  const r = calculateTransferTax(i, rates);
  return { r, d: r.redevelopmentDetail! };
};

describe("L-12 (a) 권리가액 ≤ 기준금액 + 청산금분 양도일 현재 1주택 → 비과세", () => {
  it("A-1 동시신고 10억 — 청산금분 175,000,000 전액 비과세 (종전과 같다)", () => {
    const { r, d } = run(sim(1_000_000_000));
    expect(d.settlementExemptionApplied).toBe(true);
    expect(d.exemptedGain).toBe(175_000_000);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("🔑 A-2 단독신고(receiveOnlyMode)도 비과세 — 수정 전 29,216,000", () => {
    const { r, d } = run(solo());
    expect(d.settlementExemptionApplied).toBe(true);
    expect(d.settlement.gain).toBe(0);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("A-3 긍정 짝의 부정형 — 보유 요건 미충족 선언이면 단독신고도 과세 (사례 46 축 유지)", () => {
    const { r, d } = run(solo({ exemptionEligibleAtApproval: false }));
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlement.gain).toBe(175_000_000);
    expect(r.totalTax).toBe(29_216_000);
  });
});

describe("L-12 (b) 권리가액 > 기준금액 → §160① 권리가액 기준 안분", () => {
  it("🔑 B-1 동시신고 10억 · 권리가액 15억 — 186,666,667 × 3억/15억 = 37,333,333 (수정 전 전액 과세)", () => {
    const { r, d } = run(sim(1_000_000_000, { rightsValue: 1_500_000_000 }));
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlementHighValueAllocation).toEqual({
      rightsValue: 1_500_000_000,
      threshold: 1_200_000_000,
      taxableRatio: 0.2,
      gainBeforeAllocation: 186_666_667,
      taxableGain: 37_333_333,
      nontaxableGain: 149_333_334,
    });
    expect(d.settlement.gain).toBe(37_333_333);
    expect(d.settlement.gainBeforeAllocation).toBe(186_666_667);
    expect(d.settlement.nontaxableGain).toBe(149_333_334);
    // §160①2호 — 안분 후 양도차익 × 그 분기 공제율(30%)
    expect(d.settlement.lthd).toBe(11_199_999);
    expect(r.isPartialExempt).toBe(true);
    expect(r.totalTax).toBe(2_513_500);
  });

  it("B-2 단독신고 · 권리가액 15억 — 같은 청산금분이면 같은 세액", () => {
    const { r, d } = run(solo({ rightsValue: 1_500_000_000 }));
    expect(d.settlement.gain).toBe(37_333_333);
    expect(r.totalTax).toBe(2_513_500);
  });

  it("🔑 B-3 동시신고 20억(신축 고가) · 권리가액 15억 — 청산금분은 신축 비율 0.4가 아니라 0.2", () => {
    const { r, d } = run(sim(2_000_000_000, { rightsValue: 1_500_000_000 }));
    expect(d.highValueAllocation?.taxableRatio).toBeCloseTo(0.4, 10); // 신축주택분
    expect(d.settlementHighValueAllocation?.taxableRatio).toBe(0.2); // 청산금분
    expect(d.settlement.gain).toBe(37_333_333); // 수정 전 74,666,666
    expect(r.totalTax).toBe(51_926_600); // 수정 전 62,850,332
  });

  it("B-4 경계 — 권리가액 정확히 12억은 고가가 아니다(전액 비과세) · 12억+1원부터 안분", () => {
    expect(run(sim(1_000_000_000, { rightsValue: 1_200_000_000 })).d.settlementExemptionApplied).toBe(true);
    const over = run(sim(1_000_000_000, { rightsValue: 1_200_000_001 })).d;
    expect(over.settlementExemptionApplied).toBeUndefined();
    expect(over.settlementHighValueAllocation?.threshold).toBe(1_200_000_000);
  });
});

describe("L-12 (c) 신축 고가 + 청산금분 자체 요건 미충족 → 신축 안분 비율을 빌리지 않는다", () => {
  it("🔑 C-1 동시신고 20억 · 보유 요건 미충족 선언 — 청산금분 175,000,000 전액 과세 (수정 전 70,000,000)", () => {
    const { r, d } = run(sim(2_000_000_000, { exemptionEligibleAtApproval: false }));
    expect(d.highValueAllocation?.taxableRatio).toBeCloseTo(0.4, 10); // 신축주택분만 안분
    expect(d.settlement.gain).toBe(175_000_000);
    expect(d.settlement.gainBeforeAllocation).toBeUndefined(); // 신축 안분을 거치지 않았다
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlementHighValueAllocation).toBeUndefined();
    expect(r.totalTax).toBe(264_924_000);
  });

  it("C-2 신축주택 안분 메타는 신축주택분(인가전 + 인가후 기존건물분)만으로 산정된다", () => {
    const { d } = run(sim(2_000_000_000, { exemptionEligibleAtApproval: false }));
    // (525,000,000 + 1,400,000,000) × 0.4 = 770,000,000
    expect(d.highValueAllocation?.taxableGain).toBe(770_000_000);
    expect(d.highValueAllocation?.nontaxableGain).toBe(1_155_000_000);
  });
});

describe("L-12 (d) 판정 기준일 — 청산금분 양도일 vs 신축주택 양도일", () => {
  const SETTLE_2020 = { settlementSaleDate: new Date("2020-06-01") };

  it("🔑 D-1 청산금분 양도일 1주택 · 신축 양도일 2주택 — 선언 yes면 청산금분 비과세 (수정 전 과세)", () => {
    const { r, d } = run(
      sim(1_000_000_000, { ...SETTLE_2020, oneHouseAtSettlementSale: true }, { householdHousingCount: 2 }),
    );
    expect(d.settlementExemptionApplied).toBe(true);
    expect(r.totalTax).toBe(258_456_000); // 수정 전 315,051,000
  });

  it("🔑 D-2 청산금분 양도일 2주택 · 신축 양도일 1주택 — 선언 no면 청산금분 과세 (수정 전 0)", () => {
    const { r, d } = run(sim(1_000_000_000, { ...SETTLE_2020, oneHouseAtSettlementSale: false }));
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlement.gain).toBe(175_000_000);
    expect(r.totalTax).toBe(29_216_000);
  });

  it("D-2 긍정 짝 — 같은 사실에 선언 yes면 비과세", () => {
    expect(run(sim(1_000_000_000, { ...SETTLE_2020, oneHouseAtSettlementSale: true })).r.totalTax).toBe(0);
  });

  it("🔑 D-3 두 날이 다르고 선언 없음 → 판정 불가: 비과세 미적용 + 경고 (조용히 신축 양도일 사실을 쓰지 않는다)", () => {
    const { r, d } = run(sim(1_000_000_000, SETTLE_2020));
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlement.gain).toBe(175_000_000);
    expect(r.warnings).toContain(SETTLEMENT_ONE_HOUSE_UNDETERMINED_WARNING);
  });

  it("D-4 두 날이 같고 선언 없음 → 세대 입력으로 판정(종전 동작) · 경고 없음", () => {
    const { r, d } = run(sim(1_000_000_000));
    expect(d.settlementExemptionApplied).toBe(true);
    expect(r.warnings).not.toContain(SETTLEMENT_ONE_HOUSE_UNDETERMINED_WARNING);
  });

  it("D-5 선언이 세대 입력보다 우선 — 같은 날이어도 선언 no면 과세", () => {
    const { d } = run(sim(1_000_000_000, { oneHouseAtSettlementSale: false }));
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlement.gain).toBe(175_000_000);
  });
});

describe("L-12 (e) 기준금액은 청산금분 양도일 시점 값 (E-3 — 청산금 경로)", () => {
  it("🔑 E-1 단독신고 2020-06-01 · 권리가액 10억 > 9억 — 180,000,000 × 1억/10억 = 18,000,000", () => {
    const { r, d } = run(
      solo({ rightsValue: 1_000_000_000, settlementSaleDate: new Date("2020-06-01") }),
    );
    expect(d.settlementHighValueAllocation?.threshold).toBe(900_000_000);
    expect(d.settlement.gain).toBe(18_000_000);
    expect(r.totalTax).toBe(666_600); // 수정 전 30,563,500 (비과세 미적용)
  });

  it("🔑 E-2 동시신고 2020 · 권리가액 10억 — 12억 고정 기준이면 전액 비과세였다 (수정 전 0)", () => {
    const { r, d } = run(
      sim(
        800_000_000,
        { rightsValue: 1_000_000_000, settlementSaleDate: new Date("2020-06-01") },
        { transferDate: new Date("2020-06-01") },
      ),
    );
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlement.gain).toBe(18_000_000);
    expect(r.totalTax).toBe(666_600);
  });

  it("E-3 기준 시점은 신축주택 양도일이 아니라 청산금분 양도일 — 2021-12-07 이전 청산금분은 9억", () => {
    const { d } = run(
      sim(1_000_000_000, {
        rightsValue: 1_000_000_000,
        settlementSaleDate: new Date("2021-12-07"),
        oneHouseAtSettlementSale: true,
      }),
    );
    expect(d.settlementHighValueAllocation?.threshold).toBe(900_000_000);
  });
});

describe("L-12 (f) 입주권(subject=right)의 settlement 분기는 청산금 수령분이 아니다", () => {
  it("🔑 F-1 입주권 + 청산금 수령 · 세대 1주택(나목 미성립) — §166①2호 가목분 300,000,000이 과세된다", () => {
    const { r, d } = run(
      sim(
        900_000_000,
        { subject: "right", receiveOnlyMode: undefined, settlementSaleDate: undefined },
        { propertyType: "right_to_move_in", householdHousingCount: 1, householdRightCount: 1 },
      ),
    );
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlement.gain).toBe(300_000_000);
    expect(r.totalTax).toBe(148_566_000); // 수정 전 22,478,500
  });
});

describe("L-12 (g) 단독신고의 고가 판정 대상은 청산금 수령액이 아니라 권리가액", () => {
  /**
   * 종전에는 단독신고(양도가액 = 청산금 수령액)에서 신축주택 경로의 §95③ 안분이 **청산금 수령액**으로
   * 12억을 쟀다 — 보유 요건 미충족 선언이어도 걸렸다(§95③의 대상은 §89①3호로 비과세에서 제외되는
   * 고가주택뿐이다). 권리가액 20억 · 청산금 13억(단독신고 양도가액 13억):
   */
  const big = (eligible: boolean) =>
    solo({ rightsValue: 2_000_000_000, settlementAmount: 1_300_000_000, exemptionEligibleAtApproval: eligible });

  it("🔑 G-1 보유 요건 미충족 — 안분 없이 전액 과세 1,235,000,000 (수정 전 × 1억/13억 = 95,000,000 · 세액 10,560,000)", () => {
    const { r, d } = run(big(false));
    expect(d.highValueAllocation).toBeUndefined();
    expect(d.settlementHighValueAllocation).toBeUndefined();
    expect(d.settlement.gain).toBe(1_235_000_000);
    expect(r.isPartialExempt).toBe(false);
    expect(r.totalTax).toBe(358_710_000);
  });

  it("🔑 G-2 보유 요건 충족 — 권리가액 기준 × 8억/20억 = 494,000,000 (수정 전 95,000,000 · 세액 10,560,000)", () => {
    const { r, d } = run(big(true));
    expect(d.highValueAllocation).toBeUndefined();
    expect(d.settlementHighValueAllocation?.taxableRatio).toBe(0.4);
    expect(d.settlement.gain).toBe(494_000_000);
    expect(r.isPartialExempt).toBe(true);
    expect(r.totalTax).toBe(122_518_000);
  });
});

describe("L-12 표시 — 단독신고 상세명세서 헤더가 비과세·안분을 드러낸다", () => {
  it("단독신고 비과세·안분·과세 세 경우의 청산금 열 헤더", async () => {
    const { buildRedevPerAssetForGain } = await import(
      "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders"
    );
    const label = (i: TransferTaxInput) => buildRedevPerAssetForGain(run(i).d, "apt", "receive")[2].label;
    expect(label(solo())).toContain("1세대1주택 비과세");
    expect(label(solo({ rightsValue: 1_500_000_000 }))).toContain("권리가액 기준 고가주택 안분");
    expect(label(solo({ exemptionEligibleAtApproval: false }))).toBe(
      "③ 청산금 수령분 (단독 신고) (§166①2호 가목 · 재산-439 · 서면2016-2705)",
    );
  });
});
