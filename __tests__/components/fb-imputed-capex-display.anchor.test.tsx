/**
 * anchor — 가업상속 §97의2④1호 **자본적지출의 표시 정합**(A22)
 *
 * 코드리뷰 2026-09 A22 · 세액 불변, 표시 산식 ↔ 표시 금액 괴리 실측 80,000,000원
 * (capex 1억·r=0.8) · 180,000,000원(capex 3억·r=0.6).
 *
 * 엔진은 §97의2④1호 base에 `decedentCapitalExpenditure`를 가산한 뒤 적용률을 곱하는데:
 *   (a) **결과 카드**: echo 필드가 없어 「피상속인 원취득가액」·「상속개시일 자산 평가액」
 *       두 행만 찍으면서 **값은 자본적지출이 반영된 금액**을 표시 → 표 안의 세 숫자 불일치.
 *   (b) **입력 미리보기**: 산식을 복제하면서 자본적지출을 **인자로 받지도 않아**
 *       사용자가 hint를 읽고 입력해도 **화면 숫자가 1원도 안 움직였다**. 게다가 엔진이
 *       명시적으로 금지한 부동소수 `1 - r`을 써서 1원 오차까지 났다.
 *
 * ⚠️ 자본적지출을 1호 base에 넣는 것 **자체**는 저장소의 기존 결정(계획서 Q7 = 안 B)이라
 *    이 anchor의 대상이 아니다. 대상은 **채택 산식과 화면 산식의 괴리**다.
 *
 * ⚠️ 이 anchor가 없으면 되돌려도 red가 나지 않는다 — 카드·입력 섹션을 렌더하는 테스트가
 *    0건이었고, 엔진 값만 `fb-lthd-95-4-latter.anchor.test.ts` M-4가 고정할 뿐
 *    **화면이 그 값을 어떤 산식으로 설명하는지는 아무도 보지 않았다**.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calcFamilyBusinessImputedAcquisitionPrice } from "@/lib/tax-engine/transfer-tax-family-business";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";

afterEach(cleanup);

const DECEDENT = 200_000_000;
const MARKET = 500_000_000;

function detail(capex: number, rate = 0.8) {
  const imputed = calcFamilyBusinessImputedAcquisitionPrice(DECEDENT, MARKET, rate, capex);
  return {
    imputedAcquisitionPrice: imputed,
    cgtUnderSection97_2_4: 90_000_000,
    cgtUnderSection97: 50_000_000,
    creditAmount: 40_000_000,
    appliedRate: rate,
    decedentAcquisitionPrice: DECEDENT,
    inheritanceMarketValue: MARKET,
    ...(capex ? { decedentCapitalExpenditure: capex } : {}),
    creditBreakdown: [],
  };
}

describe("[A22] 엔진 leaf — 자본적지출이 base에 가산된다", () => {
  it("A22-1: capex가 의제 취득가액을 움직인다", () => {
    expect(calcFamilyBusinessImputedAcquisitionPrice(DECEDENT, MARKET, 0.8, 100_000_000)).toBe(
      340_000_000,
    );
    expect(calcFamilyBusinessImputedAcquisitionPrice(DECEDENT, MARKET, 0.8, 0)).toBe(260_000_000);
  });

  it("A22-2: 부동소수 `1 - r` 아티팩트가 없다 (r=0.8에서 260,000,000 — 259,999,999 아님)", () => {
    expect(calcFamilyBusinessImputedAcquisitionPrice(DECEDENT, MARKET, 0.8, 0)).not.toBe(
      259_999_999,
    );
  });
});

describe("[A22] 결과 카드 — 표시 산식과 표시 금액이 자기일관이다", () => {
  it("A22-3: capex > 0이면 「피상속인 자본적 지출액」 행이 뜬다", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detail(100_000_000)} />);
    expect(screen.getByText("피상속인 자본적 지출액")).toBeTruthy();
  });

  it("A22-4: capex > 0이면 라벨 산식이 `(원취득가 + 자본적지출)`로 바뀐다", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detail(100_000_000)} />);
    expect(screen.getByText(/\(원취득가 \+ 자본적지출\) × 80\.00% \+ 평가액 × 20\.00%/)).toBeTruthy();
  });

  it("A22-5: 표시된 산식대로 재구성한 값 = 표시 금액 (자기일관)", () => {
    const d = detail(100_000_000);
    // 라벨이 약속하는 산식: (원취득가 + 자본적지출) × r + 평가액 × (1−r)
    const reconstructed =
      Math.floor((d.decedentAcquisitionPrice + d.decedentCapitalExpenditure!) * d.appliedRate) +
      Math.floor(d.inheritanceMarketValue * (1 - d.appliedRate));
    expect(Math.abs(reconstructed - d.imputedAcquisitionPrice)).toBeLessThanOrEqual(1);
  });

  it("A22-6(회귀): capex가 없으면 종전 라벨·행 구성을 유지한다", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detail(0)} />);
    expect(screen.queryByText("피상속인 자본적 지출액")).toBeNull();
    expect(screen.getByText(/원취득가 × 80\.00% \+ 평가액 × 20\.00%/)).toBeTruthy();
  });
});

/**
 * A17 — G-1 시점 게이트(「소득세법」 부칙 법률 제12169호 §12, 기준일 = **상속개시일**)
 *
 * 게이트 결론(특례 미적용)은 법령상 옳은데 **사유가 어디에도 남지 않았고**, 더 나쁘게는
 * rose 카드가 「의제 취득가액이 … **반드시 적용됩니다**」를 무조건 렌더했다 — 2014.1.1. 전
 * 상속분에서 이 문장은 단순 누락이 아니라 **적극적 허위 서술**이다.
 *
 * 엔진 게이트와 **같은 술어**(`isFamilyBusinessCgtEra`)를 UI가 쓰게 해 dual truth를 없앤다.
 */
describe("[A17] 엔진 — G-1 게이트 탈락 사유가 warnings에 남는다", () => {
  it("A17-1: 2014.1.1. 전 상속이면 특례 미적용 사유가 결과 warnings에 있다", async () => {
    const { calculateTransferTax } = await import("@/lib/tax-engine/transfer-tax");
    const { makeMockRates, baseTransferInput } = await import("../tax-engine/_helpers/mock-rates");
    const fb = {
      decedentAcquisitionPrice: 200_000_000,
      inheritanceMarketValue: 500_000_000,
      fbDeductionAppliedRate: 0.8,
      inheritanceDate: "2013-12-31",
    };
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        transferDate: new Date("2026-01-01"),
        acquisitionDate: new Date("2013-12-31"),
        acquisitionPrice: 500_000_000,
        acquisitionCause: "inheritance",
        familyBusinessInheritance: fb,
      } as never),
      makeMockRates(),
    );
    expect(r.familyBusinessDetail).toBeUndefined();
    expect((r.warnings ?? []).join(" ")).toMatch(/§97의2④.*미적용.*2014/);
  });

  it("A17-2(회귀): 2014.1.1. 이후 상속이면 특례가 적용되고 그 경고는 없다", async () => {
    const { calculateTransferTax } = await import("@/lib/tax-engine/transfer-tax");
    const { makeMockRates, baseTransferInput } = await import("../tax-engine/_helpers/mock-rates");
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        transferDate: new Date("2026-01-01"),
        acquisitionDate: new Date("2014-01-01"),
        acquisitionPrice: 500_000_000,
        acquisitionCause: "inheritance",
        familyBusinessInheritance: {
          decedentAcquisitionPrice: 200_000_000,
          inheritanceMarketValue: 500_000_000,
          fbDeductionAppliedRate: 0.8,
          inheritanceDate: "2014-01-01",
        },
      } as never),
      makeMockRates(),
    );
    expect(r.familyBusinessDetail).toBeDefined();
    expect((r.warnings ?? []).join(" ")).not.toMatch(/§97의2④.*미적용/);
  });
});
