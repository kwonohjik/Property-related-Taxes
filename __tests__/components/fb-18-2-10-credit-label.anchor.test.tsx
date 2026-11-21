/**
 * anchor — 상증법 §18의2⑩ 공제의 명칭·차감 대상 표시 (결과뷰 리뷰 2026-11-21 R-c06-03)
 *
 * §18의2⑩(MST 276123 본문): 「제5항 또는 제8항제2호에 따라 상속세를 부과할 때 「소득세법」 제97조의2제4항에 따라
 * 납부하였거나 납부할 양도소득세가 있는 경우에는 … 계산한 **양도소득세 상당액을 상속세 산출세액에서 공제**한다」.
 * 종전 카드는 이를 「상속세 상당액 공제」라 부르고(§30·§3의2②의 용어), 「차액을 … 공제로 차감합니다」라고만 적어
 * 무엇에서 빼는지 밝히지 않았으며, 결정세액 두 행 바로 아래에 「- X」를 두어 이 양도세에서 빠지는 것처럼 보였다.
 * 엔진은 의제 결과를 그대로 반환한다(이 양도세 결정세액 = 의제 결정세액) — 아래 첫 테스트가 그 전제를 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

/** 의제 결정세액 > 일반 결정세액이 되는 시료 — 원취득가 2억 · 평가액 5억 · 적용률 80% */
function runEngine() {
  return calculateTransferTax(
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
}

describe("R-c06-03 — §18의2⑩ 공제 명칭·차감 대상", () => {
  it("전제(엔진): 이 양도세 결정세액은 의제 결정세액 그대로다 — 공제액을 빼지 않는다", () => {
    const r = runEngine();
    const d = r.familyBusinessDetail!;
    expect(d.creditAmount).toBeGreaterThan(0);
    expect(d.creditAmount).toBe(d.cgtUnderSection97_2_4 - d.cgtUnderSection97);
    expect(r.determinedTax).toBe(d.cgtUnderSection97_2_4);
  });

  it("공제 명칭은 「양도소득세 상당액 공제」 — 「상속세 상당액 공제」로 부르지 않는다", () => {
    const { container } = render(<FamilyBusinessImputedComparisonCard detail={runEngine().familyBusinessDetail!} />);
    const text = container.textContent ?? "";
    expect(text).toContain("§18의2⑩ 양도소득세 상당액 공제");
    expect(text).not.toContain("상속세 상당액 공제");
  });

  it("공제액 행에 「-」 부호를 붙이지 않는다 — 이 양도세에서 빼는 금액이 아니다", () => {
    const d = runEngine().familyBusinessDetail!;
    const { container } = render(<FamilyBusinessImputedComparisonCard detail={d} />);
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).not.toContain(`- ${d.creditAmount.toLocaleString()}`);
    expect(text).toContain(`(음수면 0)${d.creditAmount.toLocaleString()}`);
  });

  it("차액은 사후관리로 상속세를 부과할 때 상속세 산출세액에서 공제된다고 밝힌다", () => {
    const d = runEngine().familyBusinessDetail!;
    const { container } = render(<FamilyBusinessImputedComparisonCard detail={d} />);
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain(`차액(${d.creditAmount.toLocaleString()})은 가업상속 사후관리로 상속세를 부과할 때 상속세 산출세액에서 공제됩니다`);
    expect(text).not.toContain("공제로 차감합니다");
  });
});
