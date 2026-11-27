/** 단건 엔진 케이스 매트릭스 — 계획서 엔진 §2 K-3·K-7·K-8·K-9·K-19~K-25 + 입력 검증. */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { k1Asset, k1Input, ratesAt, usd, d } from "./_fixtures";

const rates = ratesAt("2026-07-10");

describe("세율·공제 분기", () => {
  it("K-3: 보유 6개월(취득 2026-01-15)이어도 §55①만 — 단기 40/50% 없음, 세액 K-1과 동일", () => {
    const r = calc(
      k1Input({ assets: [k1Asset({ acquisitionDate: d("2026-01-15"), acquisition: usd(400_000, "2026-01-15", 1_300) })] }),
      rates,
    );
    expect(r.calculatedTax).toBe(147_860_000);
    expect(r.calculatedTax).not.toBe(217_250_000);
  });

  it("K-7: 단건 양도차손 — 양도소득금액 0 · 기본공제 0 · 세액 0 · 차손액 echo", () => {
    const r = calc(k1Input({ assets: [k1Asset({ transfer: usd(300_000, "2026-07-10", 1_100) })] }), rates);
    expect(r.rows[0].capitalGain).toBe(-223_000_000);
    expect(r.rows[0].lossAmount).toBe(223_000_000);
    expect(r.incomeAmountTotal).toBe(0);
    expect(r.basicDeduction).toBe(0);
    expect(r.taxBase).toBe(0);
    expect(r.appliedRate).toBe(0);
    expect([r.calculatedTax, r.localIncomeTax, r.totalTax]).toEqual([0, 0, 0]);
  });

  it("K-8: 환차익(달러 기준 손실이어도 원화 차익은 과세) — 차익 107,000,000 → 과세표준 104,500,000 · 산출세액 21,135,000 · 지방 2,113,500", () => {
    const r = calc(
      k1Input({
        assets: [
          k1Asset({
            acquisition: usd(400_000, "2022-01-15", 1_000),
            transfer: usd(390_000, "2026-07-10", 1_300),
            transferCosts: [],
          }),
        ],
      }),
      rates,
    );
    expect(r.rows[0].capitalGain).toBe(107_000_000);
    expect(r.taxBase).toBe(104_500_000);
    expect(r.calculatedTax).toBe(21_135_000);
    expect(r.localIncomeTax).toBe(2_113_500);
  });

  it("양도소득금액이 기본공제 한도 이하면 공제는 소득금액만큼(과세표준 0)", () => {
    const r = calc(
      k1Input({ assets: [k1Asset({ transfer: usd(1_000_000, "2026-07-10", 1_000), acquisition: usd(1_000_000, "2022-01-15", 998), transferCosts: [] })] }),
      rates,
    );
    expect(r.incomeAmountTotal).toBe(2_000_000);
    expect(r.basicDeduction).toBe(2_000_000);
    expect(r.taxBase).toBe(0);
  });

  it("자본적지출은 항목별 지출일 환율로 환산해 차감", () => {
    const r = calc(
      k1Input({ assets: [k1Asset({ capitalExpenditures: [usd(10_000, "2024-03-02", 1_330.55), usd(5_000, "2025-05-05", 1_410)] })] }),
      rates,
    );
    expect(r.rows[0].capitalExpenditures.map((c) => c.amountKrw)).toEqual([13_305_500, 7_050_000]);
    expect(r.rows[0].capitalExpenditureKrw).toBe(20_355_500);
    expect(r.rows[0].capitalGain).toBe(437_000_000 - 20_355_500);
  });

  it("K-24: 양도 2022-12-31 — 구표(3~5억 공제 25,400,000)라 산출세액 148,400,000", () => {
    const r = calc(
      k1Input({
        assets: [
          k1Asset({
            transferDate: d("2022-12-31"),
            transfer: usd(900_000, "2022-12-31", 1_100),
            transferCosts: [usd(30_000, "2022-12-31", 1_100)],
          }),
        ],
      }),
      ratesAt("2022-12-31"),
    );
    expect(r.taxBase).toBe(434_500_000);
    expect(r.calculatedTax).toBe(148_400_000);
  });
});

describe("과세대상·지원범위 게이트", () => {
  it("K-9: 거주 4년 — not_liable, 세액 0, 환산 echo는 유지", () => {
    const r = calc(k1Input({ domesticResidenceYears: 4 }), rates);
    expect(r.taxCategory).toBe("not_liable");
    expect(r.isLiable).toBe(false);
    expect(r.notLiableReason).toBe("RESIDENCE_UNDER_5_YEARS");
    expect([r.calculatedTax, r.localIncomeTax, r.totalTax, r.taxBase, r.basicDeduction]).toEqual([0, 0, 0, 0, 0]);
    expect(r.rows[0].transferValueKrw).toBe(990_000_000);
  });

  it("거주 정확히 5년은 과세, 4년은 비과세 경계", () => {
    expect(calc(k1Input({ domesticResidenceYears: 5 }), rates).isLiable).toBe(true);
    expect(calc(k1Input({ domesticResidenceYears: 4 }), rates).isLiable).toBe(false);
  });

  it("K-25: 양도일 2019-12-31 → 던진다(era 술어)", () => {
    const asset = k1Asset({
      transferDate: d("2019-12-31"),
      acquisitionDate: d("2015-01-01"),
      transfer: usd(900_000, "2019-12-31", 1_100),
      acquisition: usd(400_000, "2015-01-01", 1_300),
      transferCosts: [],
    });
    expect(() => calc(k1Input({ assets: [asset] }), ratesAt("2019-12-31"))).toThrow(TaxCalculationError);
  });

  it("양도일 2020-01-01 당일은 지원", () => {
    const asset = k1Asset({
      transferDate: d("2020-01-01"),
      acquisitionDate: d("2015-01-01"),
      transfer: usd(900_000, "2020-01-01", 1_100),
      acquisition: usd(400_000, "2015-01-01", 1_300),
      transferCosts: [],
    });
    expect(calc(k1Input({ assets: [asset] }), ratesAt("2020-01-01")).isLiable).toBe(true);
  });
});

describe("입력 검증 — fallback 없이 던진다", () => {
  const bad = (over: Parameters<typeof k1Asset>[0]) => () => calc(k1Input({ assets: [k1Asset(over)] }), rates);

  it("취득가액 환율 미입력(0) — 양도일 환율로 대체하지 않는다", () => {
    expect(bad({ acquisition: usd(400_000, "2022-01-15", 0) })).toThrow(/exchangeRate/);
  });
  it("양도비 환율 미입력(NaN)", () => {
    expect(bad({ transferCosts: [usd(30_000, "2026-07-10", Number.NaN)] })).toThrow(TaxCalculationError);
  });
  it("항목 일자 무효", () => {
    expect(bad({ transfer: { ...usd(1, "2026-07-10", 1), date: new Date("x") } })).toThrow(/날짜/);
  });
  it("취득일 > 양도일", () => {
    expect(bad({ acquisitionDate: d("2026-07-11") })).toThrow(/취득일/);
  });
  it("거주 연수 소수·음수", () => {
    expect(() => calc(k1Input({ domesticResidenceYears: 5.5 }), rates)).toThrow(TaxCalculationError);
    expect(() => calc(k1Input({ domesticResidenceYears: -1 }), rates)).toThrow(TaxCalculationError);
  });
  it("0건 거부 · 자산 id 중복 거부(외국납부세액이 id로 자산을 가리킨다)", () => {
    expect(() => calc(k1Input({ assets: [] }), rates)).toThrow(TaxCalculationError);
    expect(() => calc(k1Input({ assets: [k1Asset(), k1Asset()] }), rates)).toThrow(/id가 겹칩니다/);
  });
  it("누진세율 구간이 역순이면 거부", () => {
    const reversed = { ...rates, brackets: [...rates.brackets].reverse() };
    expect(() => calc(k1Input(), reversed)).toThrow(/오름차순/);
  });
});

describe("확인 필요 코드 — 납세의무 있는 결과에만(U5)", () => {
  it("납세의무 없음(거주 5년 미만)은 세액이 0이라 확인 필요 코드를 싣지 않는다", () => {
    const r = calc(k1Input({ domesticResidenceYears: 4 }), rates);
    expect(r.taxCategory).toBe("not_liable");
    expect(r.confirmationNeeded).toEqual([]);
  });

  it("세액 숫자는 코드 추가 전과 같다(K-1 147,860,000 · 지방소득세 14,786,000)", () => {
    const r = calc(k1Input(), rates);
    expect(r.calculatedTax).toBe(147_860_000);
    expect(r.localIncomeTax).toBe(14_786_000);
    expect(r.totalTax).toBe(162_646_000);
  });
});

describe("결과 메타", () => {
  it("appliedLawDate·supportedFrom·confirmationNeeded·appliedRules", () => {
    const r = calc(k1Input(), rates);
    expect(r.appliedLawDate).toBe("2026-07-10");
    expect(r.supportedFrom).toBe("2020-01-01");
    expect(r.confirmationNeeded).toEqual([
      "LOCAL_TAX_WEIGHTING_NOT_EVALUATED",
      "DOMESTIC_TRANSFER_NOT_AGGREGATED",
      "UNSUPPORTED_SITUATIONS_NOT_EVALUATED",
    ]);
    expect(r.appliedRules).toContain("소득세법 §118의8");
    expect(r.appliedRules).toContain("국고금 관리법 §47 ①");
    // 지방소득세 가중 미평가는 코드로만 알린다 — 같은 취지의 warnings 문구를 두면 «확인 필요» 카드가 겹친다(U3)
    expect(r.warnings).toEqual([]);
  });
});
