/**
 * anchor — 장기보유특별공제 step 산식(상세명세서 2단계)의 §97의3·§97의4 표시 (표시 전용)
 *
 * §97의3 특례가 적용되면 `longTermHoldingRate`는 혼합율(임대분 70% · 그 밖의 분 일반 공제율의 가중)이고,
 * §97의4는 일반 공제율 + 추가공제율이다. 종전 산식은 그 율 옆에 §95② 표 분해를 그대로 붙여
 * 「1,500,000,000 × 64% | 보유 20년×2% = 64% (30% 한도)」·「보유 20년×2% = 40% (30% 한도)」처럼 자기모순이었다.
 * ⇒ §97의3은 「임대기간 분 × 특례율 + 그 밖의 분 × 일반 공제율」, §97의4는 「일반 공제율 + 추가공제율」로 쓴다.
 * 공제액·세액은 바뀌지 않는다(수정 전 실측값 고정).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 2016 등록·임대 (취득 2006 — 임대기간 분 비율 6/7) */
const R973 = {
  type: "rental_97_3",
  registrationDate: D("2016-01-01"),
  rentalStartDate: D("2016-01-01"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2016-01-01"),
  isNationalHousingScale: true,
  officialPriceAtStart: 400_000_000,
  region: "capital",
  isPrivateConstructionRental: false,
  rentalContinuesToTransfer: true,
  rentIncreaseViolated: false,
};
const R974 = {
  type: "rental_97_4",
  registrationDate: D("2016-01-01"),
  rentalStartDate: D("2016-01-01"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2016-01-01"), // 조특령 §97의4② 사업자등록일 (등록일과 같게 — 기산일 불변)
  rentIncreaseViolated: false,
  region: "capital",
  rental974Category: "purchase_a",
  officialPriceAtStart: 500_000_000,
};
const TWO_HOUSES = { householdHousingCount: 2, isOneHousehold: false, residencePeriodMonths: 0 };

function run(reductions: Any[], over: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 2_000_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2006-01-01"),
      transferDate: D("2026-06-01"),
      residencePeriodMonths: 120,
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtTransfer: 1_000_000_000,
      reductions,
      ...over,
    } as Any),
    rates,
  ) as Any;
}
const lthdStep = (r: Any) => r.steps.find((s: Any) => s.label === "장기보유특별공제");

describe("§97의3 특례 적용 — 임대기간 분·그 밖의 분으로 풀어 쓴다", () => {
  it("LS-1 2주택(표1 30%) — 혼합율 64% 옆 표1 분해 없음 · 공제액·세액 불변", () => {
    const r = run([R973], TWO_HOUSES);
    expect(r.rental97LthdDetail.specialApplied).toBe(true);
    expect(r.longTermHoldingDeduction).toBe(964_285_713);
    expect(r.determinedTax).toBe(188_010_000);
    const f = lthdStep(r).formula as string;
    expect(f).toContain(
      "임대기간 분 양도차익 1,285,714,285 × 70% + 그 밖의 양도차익 214,285,715 × 30% = 964,285,713",
    );
    expect(f).toContain("조특법 §97의3 장기보유특별공제 특례 — 그 밖의 양도차익의 일반 공제율: 보유 20년×2% = 30% (30% 한도)");
    expect(f).not.toContain("× 64%");
    expect(f).not.toContain("= 64%");
    expect(lthdStep(r).amount).toBe(964_285_713);
  });

  it("LS-2 1세대1주택 거주 2년(표2 48% < 70%) — 그 밖의 분은 표2 분해", () => {
    const r = run([R973], { residencePeriodMonths: 24 });
    expect(r.rental97LthdDetail.specialApplied).toBe(true);
    expect(r.longTermHoldingDeduction).toBe(401_142_856);
    expect(r.determinedTax).toBe(54_675_714);
    const f = lthdStep(r).formula as string;
    expect(f).toContain("임대기간 분 양도차익 514,285,714 × 70% + 그 밖의 양도차익 85,714,286 × 48% = 401,142,856");
    expect(f).toContain("보유 20년×4%=40% + 거주 2년×4%=8% = 48%");
    expect(f).not.toContain("= 67%");
  });

  /**
   * LS-5 보유·거주 기간분 행 — 특례 공제(임대기간 분 × 70%)는 거주기간별 공제율이 아니므로 보유 기간분에 넣는다.
   * 거주 기간분 = 그 밖의 양도차익 85,714,286 × 8% = 6,857,142 (종전: 총액 × 8%/48% = 66,857,142 — 특례 공제까지 배분)
   * 보유 기간분 = 401,142,856 − 6,857,142 = 394,285,714. 합 = 총 장특공제 불변. 신고서 양식도 이 금액을 읽는다.
   */
  it("LS-5 보유·거주 기간분 — 거주분은 그 밖의 양도차익 × 거주율만 · 합 = 총액", () => {
    const r = run([R973], { residencePeriodMonths: 24 });
    const step = (label: string) => r.steps.find((s: Any) => s.label === label);
    const holding = step("보유 기간분 장특");
    const residence = step("거주 기간분 장특");
    expect(residence.amount).toBe(6_857_142);
    expect(holding.amount).toBe(394_285_714);
    expect(holding.amount + residence.amount).toBe(r.longTermHoldingDeduction);
    expect(holding.formula).toBe(
      "임대기간 분 양도차익 514,285,714 × 70% (조특법 §97의3) + 그 밖의 양도차익 85,714,286 × 40% (보유 20년 × 4%, 40% 한도) = 394,285,714",
    );
    expect(residence.formula).toContain("그 밖의 양도차익 85,714,286 × 8% = 6,857,142");
    expect(r.determinedTax).toBe(54_675_714);
  });

  it("LS-6 대조 — 특례 미적용(표2 80%)이면 종전 표2 비율 분해 그대로", () => {
    const r = run([R973]);
    const step = (label: string) => r.steps.find((s: Any) => s.label === label);
    expect(step("보유 기간분 장특").formula).toContain("× 40% / 80%");
    expect(step("거주 기간분 장특").formula).toContain("× 40% / 80%");
    expect(step("보유 기간분 장특").amount + step("거주 기간분 장특").amount).toBe(480_000_000);
  });

  it("LS-3 대조 — 특례 미적용(표2 80% > 특례)이면 종전 일반 산식 그대로", () => {
    const r = run([R973]);
    expect(r.rental97LthdDetail.specialApplied).toBe(false);
    const f = lthdStep(r).formula as string;
    expect(f).toContain("× 80%");
    expect(f).not.toContain("임대기간 분 양도차익");
  });
});

describe("§97의4 가산 — 일반 공제율 + 추가공제율", () => {
  it("LS-4 2주택 — 「보유 20년×2% = 30% + §97의4 추가 10% = 40%」 · 공제액·세액 불변", () => {
    const r = run([R974], TWO_HOUSES);
    expect(r.longTermHoldingDeduction).toBe(600_000_000);
    expect(r.determinedTax).toBe(341_010_000);
    const f = lthdStep(r).formula as string;
    expect(f).toContain("1,500,000,000 × 40%");
    expect(f).toContain("보유 20년×2% = 30% (30% 한도) + 조특법 §97의4 추가공제율 10% = 40%");
    expect(f).not.toContain("보유 20년×2% = 40%");
  });
});
