/**
 * F11 — 부수토지 일체과세(L-1b)의 **표1 공제율·3년 진입요건**이 주택이 아니라 토지 자신의
 * 보유기간을 보아야 한다.
 *
 * 근거: 「소득세법」 §95④ 본문 「제2항에서 규정하는 자산의 보유기간은 **그 자산의 취득일부터
 * 양도일까지**로 한다」. 같은 항 **단서의 예외는 §97의2①(이월과세)와 가업상속공제 적용비율분
 * 둘로 한정 열거**돼 부수토지 예외가 없다. §95②의 진입요건 「보유기간이 3년 이상인 것」도 같은 정의다.
 *
 * 일체과세의 사정거리: §104①2호 괄호 「주택(이에 딸린 토지…를 포함한다. **이하 이 항에서 같다**)」는
 * 정의확장을 **제104조 제1항 내부로 한정**한다 ⇒ 세율 축 근거를 §95(장특) 보유기간으로 전이할 수 없다.
 *
 * ✅ **표2 축은 2026-09-02에 해소됐다** — 「소득세법 기본통칙 **95-0…1**」(조문번호 이동
 *    **2024.03.15.**)이 「그 토지의 **전체보유기간**에 따른 표1의 공제율과 주택 부수토지로서의
 *    보유기간에 따른 **표2의 공제율** 중 **큰 공제율**」을 명한다. 통칙이 **현행**이라 「단일축
 *    시기 해석」이라는 보류 사유가 성립하지 않고, 「표2의 **공제율**」을 통째로 지목하므로
 *    2축 분해도 필요 없다. ⇒ 아래 마지막 케이스 기대값을 갱신했다.
 *    상세·격자: `appurtenant-land-lthd-table1-floor.anchor.test.ts`.
 *
 * 기대값은 전부 엔진을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 일괄양도 companion 부수토지 — 양도 5억 / 취득 1억 / 양도일 2024-06-01 */
const companionLand = (
  over: Partial<TransferTaxInput>,
  primaryHoldingMonths: number,
): TransferTaxInput =>
  baseTransferInput({
    propertyType: "land",
    landNature: "appurtenant_to_housing",
    transferPrice: 500_000_000,
    acquisitionPrice: 100_000_000,
    acquisitionDate: new Date("2021-06-01"),
    transferDate: new Date("2024-06-01"),
    isOneHousehold: false,
    householdHousingCount: 3,
    residencePeriodMonths: 0,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: primaryHoldingMonths,
      buildingFootprintArea: 100,
      isUrbanArea: true,
    },
    ...over,
  });

describe("F11 — 부수토지 LTHD 표1·3년 게이트는 토지 자신의 보유기간 축이다", () => {
  it("토지 2년 11개월 · 주택 14년 → 표1 미적용 (주택 축이면 28% 공제가 잘못 부여됐다)", () => {
    const r = calculateTransferTax(companionLand({}, 168), rates);

    // 수정 전: rate 0.28 · 공제 112,000,000 · 총세액 97,405,000 (48,961,000 과소과세)
    expect(r.longTermHoldingRate).toBe(0);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.calculatedTax).toBe(133_060_000);
    expect(r.localIncomeTax).toBe(13_306_000);
    expect(r.totalTax).toBe(146_366_000);
  });

  it("산식 표시가 채택 축과 일치한다 (자기모순 제거)", () => {
    const r = calculateTransferTax(companionLand({}, 168), rates);
    const formula = r.steps.find((s) => s.label === "장기보유특별공제")?.formula;
    // 수정 전: "400,000,000 × 28% | 보유 2년×2% = 28% (30% 한도) | 보유기간 2년 11개월"
    expect(formula).toBe(
      "400,000,000 × 0% | 보유 2년×2% = 0% (30% 한도) | 보유기간 2년 11개월",
    );
  });

  it("토지 10년 · 주택 2년 → 토지 축으로 표1이 살아난다 (반대 방향)", () => {
    const r = calculateTransferTax(
      companionLand({ acquisitionDate: new Date("2014-06-01") }, 24),
      rates,
    );
    // 수정 전: 주택 24개월 < 36 게이트에 걸려 rate 0 · 총세액 146,366,000
    expect(r.longTermHoldingRate).toBeCloseTo(0.18, 10);
    expect(r.longTermHoldingDeduction).toBe(72_000_000);
    expect(r.calculatedTax).toBe(104_260_000);
    expect(r.totalTax).toBe(114_686_000);
  });

  it("🔁 표2 대상이어도 표1(토지 축)이 하한이다 — 기본통칙 95-0…1 (2026-09-02 갱신)", () => {
    /**
     * 🔁 **기대값 갱신** — 종전 기대는 `rate 0 / deduction 0`이었고, 사유는 이 파일 헤더가
     * 적어 둔 「예규가 표2 **단일축** 시기(~2018) 것이라 현행 2축 표2에 max를 어떻게
     * 대입할지 미확정」이었다. **현행 통칙이 그 두 전제를 동시에 무너뜨린다**:
     *
     *   「소득세법 기본통칙 **95-0…1**【주택부수토지가 주택보다 보유기간이 긴 경우】
     *    (조문번호 이동 **2024.03.15.**) — … 그 토지의 **전체보유기간**에 따른 표1의 공제율과
     *    주택 부수토지로서의 보유기간에 따른 **표2의 공제율** 중 **큰 공제율**을 적용한다.」
     *
     *   ⓐ 통칙은 **2024.03.15 현행**이다 — 2축 표2 시행(2020) 이후에도 살아 있다.
     *   ⓑ 「표2의 **공제율**」을 통째로 지목하므로 보유분/거주분 **분해가 필요 없다**.
     *
     * 종전 동작은 §95② **단서**(1세대1주택 **혜택** 규정) 때문에 본문 표1보다 **못 받는**
     * 결과였다 — 1세대1주택이 아니었다면 바로 위 케이스처럼 표1 6%를 받는 자산이다.
     * 상세: `appurtenant-land-lthd-table1-floor.anchor.test.ts`.
     */
    const r = calculateTransferTax(
      companionLand(
        {
          acquisitionDate: new Date("2021-01-01"), // 토지 3년 4개월 → 표1 6%
          isOneHousehold: true,
          householdHousingCount: 1,
          residencePeriodMonths: 30,
        },
        30, // 주택 2년 6개월 → 표2는 3년 미달로 0%
      ),
      rates,
    );
    expect(r.longTermHoldingRate).toBeCloseTo(0.06, 10);
    expect(r.longTermHoldingDeduction).toBe(24_000_000);
  });
});
