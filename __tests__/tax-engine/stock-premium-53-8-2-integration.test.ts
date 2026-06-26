/**
 * 상장 §53⑧ 배제사유 공용화 + 2호 게이트 통합 anchor.
 *
 * - migrateListedPremiumReason: 레거시 art53_8_*·smb_med → 공용 코드
 * - evaluateListedStock: 2호 게이트 통과(배제 0%) / 실패(할증 20%) 분기
 *
 * 법령: 상증령 §53⑧2 · §49①1 (KoreanLaw 검증 2026-06-27)
 */
import { describe, it, expect } from "vitest";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import { migrateListedPremiumReason } from "@/lib/tax-engine/types/stock-premium-exclusion.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { Section53_8_2Input } from "@/lib/tax-engine/types/stock-premium-exclusion.types";

const D = new Date("2026-03-01");

const makeItem = (
  exclusion: EstateItem["premiumExclusionReason"],
  sec?: Section53_8_2Input,
): EstateItem => ({
  id: "s1",
  name: "상장주식",
  category: "listed_stock",
  listedStockAvgPrice: 10_000,
  listedStockShares: 100,
  isMaxShareholder: true,
  companySize: "large",
  premiumExclusionReason: exclusion,
  section53_8_2: sec,
});

const goodSale: Section53_8_2Input = {
  allSharesSold: true,
  meetsArticle49_1_1: true,
  saleContractDate: new Date("2026-04-01"),
  transferType: "inheritance",
};

describe("migrateListedPremiumReason — 레거시 매핑", () => {
  it("art53_8_1 → continuous_loss_3y (1호)", () => {
    expect(migrateListedPremiumReason("art53_8_1")).toBe("continuous_loss_3y");
  });
  it("art53_8_4 → all_sold_within_6m (2호 의도)", () => {
    expect(migrateListedPremiumReason("art53_8_4")).toBe("all_sold_within_6m");
  });
  it("smb_med → small_medium_enterprise (9호)", () => {
    expect(migrateListedPremiumReason("smb_med")).toBe("small_medium_enterprise");
  });
  it("art53_8_2 (호 무의미) → none", () => {
    expect(migrateListedPremiumReason("art53_8_2")).toBe("none");
  });
  it("이미 공용 코드는 그대로", () => {
    expect(migrateListedPremiumReason("all_sold_within_6m")).toBe("all_sold_within_6m");
  });
  it("undefined → none", () => {
    expect(migrateListedPremiumReason(undefined)).toBe("none");
  });
});

describe("evaluateListedStock — §53⑧2호 게이트 통합", () => {
  it("2호 요건 충족(상속·기간내·전부매각·정상거래) → 할증 배제 0%, 평가액=100만", () => {
    const r = evaluateListedStock(makeItem("all_sold_within_6m", goodSale), {
      valuationDate: D,
    });
    expect(r.besshiData?.page1Values.majorShareholderRate).toBe(0);
    expect(r.valuatedAmount).toBe(1_000_000); // 10,000 × 100
    expect(r.besshiData?.page1Values.premiumExclusionLabel).toContain("§53 ⑧ 2호");
  });

  it("2호 기간초과(증여 D+6월 매각) → 게이트 실패 → 할증 20%, 평가액=120만", () => {
    const r = evaluateListedStock(
      makeItem("all_sold_within_6m", {
        ...goodSale,
        transferType: "gift",
        saleContractDate: new Date("2026-08-01"),
      }),
      { valuationDate: D },
    );
    expect(r.besshiData?.page1Values.majorShareholderRate).toBe(0.2);
    expect(r.valuatedAmount).toBe(1_200_000); // floor(10,000×1.2)×100
    expect(r.warnings.some((w) => w.includes("§53⑧2호"))).toBe(true);
  });

  it("2호 전부매각 아님 → 게이트 실패 → 할증 20%", () => {
    const r = evaluateListedStock(
      makeItem("all_sold_within_6m", { ...goodSale, allSharesSold: false }),
      { valuationDate: D },
    );
    expect(r.besshiData?.page1Values.majorShareholderRate).toBe(0.2);
  });

  it("2호 보조입력 부재 → missing_input → 할증 20%(보수적)", () => {
    const r = evaluateListedStock(makeItem("all_sold_within_6m", undefined), {
      valuationDate: D,
    });
    expect(r.besshiData?.page1Values.majorShareholderRate).toBe(0.2);
  });

  it("중소기업은 9호로 배제(2호 무관) → 0%", () => {
    const item = makeItem("none", undefined);
    item.companySize = "small";
    const r = evaluateListedStock(item, { valuationDate: D });
    expect(r.besshiData?.page1Values.majorShareholderRate).toBe(0);
  });
});
