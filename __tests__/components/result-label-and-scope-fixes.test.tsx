/**
 * anchor: 결과·요약 **라벨·범위** 정정 (UI 리뷰 보통 #10·#16·#31·#36·#37·#45·#46).
 *
 * 세액은 그대로인데 **화면이 사실과 다른 말을 하던** 것들이다 — 근거조문이 틀렸거나,
 * 적용 범위를 넓게 말했거나, 내부 식별자가 근거 자리에 실렸거나, 요약이 다른 축을 봤다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InheritedAcquisitionDetailCard } from "@/components/calc/results/transfer/InheritedAcquisitionDetailCard";
import { summarizeAssetSections } from "@/components/calc/transfer/asset-section-summary";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

describe("상속 취득가액 배지 — 가목 우선·나목 한정 (#10)", () => {
  it("🔑 F-1: 「①·②·③ 중 큰 금액」이라 말하지 않는다", () => {
    render(
      <InheritedAcquisitionDetailCard
        detail={
          {
            acquisitionPrice: 500_000_000,
            method: "pre_deemed_max",
            legalBasis: "소득세법 §97①1호",
            formula: "",
          } as never
        }
      />,
    );
    const badge = screen.getByText(/의제취득일 전 상속·증여/);
    // 엔진은 `clauseA = max(①,②)` 후 `clauseA > 0 ? clauseA : ③`이다 — ③은 가목 확인불가 시만.
    expect(badge.textContent).toContain("가목");
    expect(badge.textContent).toContain("가목 확인불가 시");
    expect(badge.textContent).not.toContain("§164·환산 중 큰 금액");
  });
});

describe("고가주택 과세비율 근거조문 (#46)", () => {
  it("🔑 F-2: 정본 상수가 §160을 가리킨다 — §159의4는 표2 «대상» 조항이다", () => {
    expect(REDEVELOPMENT.HIGH_PRICE_FORMULA).toBe("소득세법 시행령 §160");
  });
});

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "land", ...over }) as AssetForm;

describe("② 양도정보 접힘 요약 (#36·#37)", () => {
  it("🔑 F-3: 공익수용을 고르면 「일반 양도」라 말하지 않는다", () => {
    const s = summarizeAssetSections(
      asset({ transferType: "regular", transferCause: "public_expropriation" }),
    );
    expect(s.transfer.label).toContain("공익수용");
  });

  it("F-4: 일반 양도는 종전 그대로다", () => {
    expect(summarizeAssetSections(asset({ transferType: "regular" })).transfer.label).toBe(
      "일반 양도",
    );
  });

  it("🔑 F-5: 안분 모드는 양도시 기준시가로 「입력됨」을 판정한다", () => {
    const a = asset({ actualSalePrice: "", standardPriceAtTransfer: "800000000" });
    expect(summarizeAssetSections(a, { bundledSaleMode: "apportioned" }).transfer.filled).toBe(true);
    // 모드가 아니면 종전대로 양도가액 하나만 본다 — 축을 죽인 게 아니다.
    expect(summarizeAssetSections(a).transfer.filled).toBe(false);
  });

  it("🔑 F-6: 지분 분할 모드는 지분율 입력으로 판정한다", () => {
    const a = asset({ actualSalePrice: "", ownershipNumerator: "60" });
    expect(summarizeAssetSections(a, { isFractionalSplit: true }).transfer.filled).toBe(true);
  });

  it("F-7: 부담부증여는 종전대로 §159 자동산정이다", () => {
    const s = summarizeAssetSections(asset({ transferType: "burdened_gift" }));
    expect(s.transfer.label).toBe("§159 자동산정");
    expect(s.transfer.filled).toBe(true);
  });
});
