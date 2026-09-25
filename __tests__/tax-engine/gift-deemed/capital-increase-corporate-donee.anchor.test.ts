import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import type { CapitalIncreaseAllocationInput, CapitalIncreaseInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 1-E — **수증자 영리법인 축** (리뷰 #21·#77)
 *
 * 「상증법」§4의2① 각 호가 수증자로 드는 것은 거주자·비거주자(각 **비영리법인 포함**)뿐이고
 * **영리법인은 어디에도 없다**. 1차 근거는 §4의2③이 아니라 **§2 9호·§4의2①** ― 영리법인은
 * 증여세 **납세의무자 범위 자체**에 들어오지 않는다.
 *   §4의2③ — 「… 수증자에게 「소득세법」에 따른 소득세 또는 「법인세법」에 따른 **법인세가 부과되는
 *             경우에는 증여세를 부과하지 아니한다**. … 비과세되거나 감면되는 경우에도 또한 같다.」
 *   「법인세법 시행령」§11 8호·§88①8호나목(자본거래 분여이익 익금산입) · 같은 영 §89⑥이
 *   익금 계산에 「상증법」**§39**·「상증령」**§29②**를 준용한다.
 *
 * ⚠️ **§4의2③만으로는 부족하다.** 법인령 §11 8호는 「**특수관계인으로부터** 분여받은 이익」만
 *    익금인데 §39①1호 가·다·라목에는 특수관계 요건이 없다 ⇒ **비특수관계 영리법인**은 익금산입이
 *    없어 §4의2③의 문언 요건을 충족하지 않는다. 그래도 증여세는 부과되지 않는다(§4의2①).
 *    ⇒ 두 근거를 함께 들어야 축이 전 구간을 덮는다.
 *
 * ⚠️ **이익 자체를 0으로 만드는 것이 아니다.** 부정되는 것은 증여세 부과이지 이익의 존재가 아니다
 *    (그 금액은 법인령 §89⑥ 준용 계산액으로 그대로 쓰인다). ⇒ `delta`·`byShareholder`·
 *    `reconciliation`은 **보존**하고 과세분(`value`)만 0으로 둔다.
 */

/** 리뷰 실패 시나리오 — ㉮ 20,000 · ㉰ 5,000 · 갑(개인) 전량 포기 · ㈜을(영리법인)이 실권주 인수 */
function corpCapTable(isCorporate?: boolean): CapitalIncreaseAllocationInput {
  return {
    direction: "low",
    preIssuePrice: 20_000,
    newSharePrice: 5_000,
    shareholders: [
      { id: "갑", name: "갑", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, reallocatedShares: 0, relatedTo: ["을"] },
      { id: "을", name: "㈜을", preShares: 20_000, entitledShares: 20_000, subscribedShares: 80_000, reallocatedShares: 60_000, relatedTo: ["갑"], isCorporate },
      { id: "병", name: "병", preShares: 20_000, entitledShares: 20_000, subscribedShares: 20_000, reallocatedShares: 0, relatedTo: [] },
    ],
  };
}

const SINGLE_BASE: CapitalIncreaseInput = {
  direction: "low",
  subType: "forfeited_realloc",
  preIssuePrice: 20_000,
  preIssueShares: 100_000,
  newSharePrice: 5_000,
  issuedShares: 100_000,
  forfeitedShares: 60_000,
};

describe("[CT-S39-CORP] #21 cap-table 영리법인 수증자", () => {
  it("[CT-S39-CORP-BASE] 기준 — 개인 수증자면 그대로 450,000,000 (긍정 짝)", () => {
    const r = calcCapitalIncreaseAllocation(corpCapTable(undefined));
    expect(r.perShareAfter).toBe(12_500);
    expect(r.perBeneficiary.find((b) => b.beneficiaryId === "을")?.total).toBe(450_000_000);
  });

  it("[CT-S39-CORP-ZERO] 영리법인이면 증여세 납세의무자가 아니다 → 0", () => {
    const r = calcCapitalIncreaseAllocation(corpCapTable(true));
    expect(r.perBeneficiary.find((b) => b.beneficiaryId === "을")?.total).toBe(0);
    expect(r.splits.find((s) => s.beneficiaryId === "을")?.excludedReason).toContain("영리법인");
  });

  it("[CT-S39-CORP-KEEP-DELTA] 이익 자체는 부정되지 않는다 — 검증내역·zero-sum 보존", () => {
    const r = calcCapitalIncreaseAllocation(corpCapTable(true));
    // 법인령 §89⑥ 준용 계산액으로 그대로 쓰이므로 delta를 지우면 안 된다.
    expect(r.byShareholder.find((b) => b.id === "을")?.delta).toBe(450_000_000);
    expect(r.byShareholder.find((b) => b.id === "갑")?.delta).toBe(-450_000_000);
    expect(r.reconciliation.balanced).toBe(true);
  });
});

describe("[CI-S39-CORP] #21 단건 영리법인 수증자", () => {
  it("[CI-S39-CORP-BASE] 기준 — 개인 수증자 450,000,000 (긍정 짝)", () => {
    expect(calcCapitalIncreaseGift(SINGLE_BASE).deemedGiftValue).toBe(450_000_000);
  });

  it("[CI-S39-CORP-ZERO] 저가 — 영리법인이면 0 + 배제 사유", () => {
    const r = calcCapitalIncreaseGift({ ...SINGLE_BASE, doneeIsForProfitCorp: true });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("영리법인");
  });

  // 고가(§39①2호)는 **수증자가 신주 인수를 포기한 자**다 — 저가와 사람이 다르므로 별도로 고정한다.
  //   (뮤테이션 실측: 저가 anchor만으로는 고가 가드를 지워도 전건 초록이었다)
  const HIGH_BASE: CapitalIncreaseInput = {
    direction: "high",
    subType: "no_realloc",
    preIssuePrice: 5_000,
    preIssueShares: 100_000,
    newSharePrice: 20_000,
    issuedShares: 50_000,
    forfeitedShares: 50_000,
    relatedAcquiredShares: 50_000,
    ratioDenomShares: 50_000,
  };

  it("[CI-S39-CORP-HIGH-BASE] 고가 기준 — 개인 포기자 500,000,000 (긍정 짝)", () => {
    expect(calcCapitalIncreaseGift(HIGH_BASE).deemedGiftValue).toBe(500_000_000);
  });

  it("[CI-S39-CORP-HIGH-ZERO] 고가 — 포기자가 영리법인이면 0 + 배제 사유", () => {
    const r = calcCapitalIncreaseGift({ ...HIGH_BASE, doneeIsForProfitCorp: true });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("영리법인");
  });
});

describe("[CS-S39-CORP] #77 전환주식 경로에도 같은 축이 상속된다", () => {
  const leg = (newSharePrice: number): CapitalIncreaseInput => ({
    direction: "low",
    preIssuePrice: 20_000,
    preIssueShares: 100_000,
    newSharePrice,
    issuedShares: 100_000,
    forfeitedShares: 100_000,
  });

  it("[CS-S39-CORP-BASE] 기준 — 200,000,000 (긍정 짝)", () => {
    expect(
      calcConvertibleStockGift({ atConversion: leg(10_000), atIssuance: leg(14_000) }).deemedGiftValue,
    ).toBe(200_000_000);
  });

  it("[CS-S39-CORP-ZERO] 영리법인이면 0 + 배제 사유 (차감 결과 0과 구별된다)", () => {
    const r = calcConvertibleStockGift({
      atConversion: { ...leg(10_000), doneeIsForProfitCorp: true },
      atIssuance: { ...leg(14_000), doneeIsForProfitCorp: true },
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("영리법인");
  });
});
