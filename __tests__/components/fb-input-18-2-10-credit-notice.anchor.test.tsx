/**
 * R-c06-03 형제 — 입력 단계 가업상속 의제 안내의 §18의2⑩ 서술 (리뷰 후속)
 *
 * 결과 카드(FamilyBusinessImputedComparisonCard)는 f7c952063에서 「차액은 사후관리로 상속세를
 * 부과할 때 상속세 산출세액에서 공제」로 정정했다. 입력 섹션 안내는 「§18의2⑩에 따라 차액을
 * 공제합니다」·「비교과세 후 불리한 경우 §18의2⑩ 공제 적용」으로 남아 이 양도세에서 차액을
 * 빼는 것처럼 읽혔다. 엔진은 결정세액에서 차액을 빼지 않는다(결정세액 = 의제 결정세액).
 * 상증법 §18의2⑩: 「…양도소득세 상당액을 상속세 산출세액에서 공제한다」.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FamilyBusinessInheritanceTransferSection } from "@/components/calc/transfer/FamilyBusinessInheritanceTransferSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: "2016-03-01",
    familyBusinessInheritance: {
      decedentAcquisitionPrice: 200_000_000,
      inheritanceMarketValue: 500_000_000,
      fbDeductionAppliedRate: 0.8,
      inheritanceDate: "2016-03-01",
    },
  } as unknown as AssetForm;
}

function text() {
  const { container } = render(
    <FamilyBusinessInheritanceTransferSection asset={asset()} onChange={() => {}} transferDate="2026-01-27" />,
  );
  return container.textContent ?? "";
}

describe("입력 섹션 §18의2⑩ 안내", () => {
  it("차액은 상속세 산출세액에서 공제된다고 밝힌다 (이 양도세에서 빼지 않음)", () => {
    const t = text();
    expect(t).toContain("상속세 산출세액에서 공제됩니다(§18의2⑩)");
    expect(t).not.toContain("§18의2⑩에 따라 차액을 공제합니다");
    expect(t).not.toContain("§18의2⑩ 공제 적용");
  });

  it("유리/불리 표현을 쓰지 않는다", () => {
    const t = text();
    expect(t).toContain("본문 강제 적용"); // 안내 블록이 렌더됐는지 전제
    expect(t).not.toMatch(/불리|유리/);
  });
});
