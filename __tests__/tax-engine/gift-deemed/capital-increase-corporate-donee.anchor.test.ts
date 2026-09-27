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

  // 🔴 이 파일 머리말의 규칙 — 「이익 자체를 0으로 만드는 것이 아니다 … 과세분만 0으로 둔다」.
  //    전환주식 경로는 그 규칙을 **스스로 위반**하고 있었다: ④(`gift-deemed-api.ts`의 `side()`)가
  //    두 leg에 플래그를 각각 실어, 각 leg가 `forProfitCorpExcludedResult`로 0을 내고
  //    **산출근거가 통째로 소실**됐다(실측: 500,000,000·300,000,000 두 행이 전부 0).
  //    §4의2④가 같은 함정을 피한 방식과 같게 — 게이트는 **최상위에서 한 번만** 판정하고
  //    두 leg 호출에는 false를 강제한다.
  const corpBoth = () =>
    calcConvertibleStockGift({
      atConversion: { ...leg(10_000), doneeIsForProfitCorp: true },
      atIssuance: { ...leg(14_000), doneeIsForProfitCorp: true },
    });
  const amountOf = (r: ReturnType<typeof calcConvertibleStockGift>, needle: string) =>
    r.breakdown.find((b) => b.label.includes(needle))?.amount;

  it("[CS-S39-CORP-PRESERVE] 배제돼도 두 leg 산출근거와 제외 전 이익이 보존된다", () => {
    const r = corpBoth();
    expect(amountOf(r, "전환 후 교부주식 기준 이익")).toBe(500_000_000);
    expect(amountOf(r, "전환주식 발행 당시 이익")).toBe(300_000_000);
    // 「법인세법 시행령」§89⑥이 §39·§29②를 준용해 계산하는 익금이 바로 이 금액이다 —
    //   0으로 지워지면 그 준용 계산액을 화면·이력에서 되읽을 수 없다.
    expect(r.thresholdEcho?.gain).toBe(200_000_000);
  });

  it("[CS-S39-CORP-LABEL] 결론 행은 「제외 전 산출 이익」으로 라벨이 바뀐다 (§31①)", () => {
    // 「상증법」§31①은 「증여재산가액」을 **과세대상 가액**으로 한정 정의한다 ⇒ 제외되면 그 이름이
    //   성립하지 않는다. 단건 경로는 `excludedResult`가 이 전환을 하는데 전환주식엔 없었다.
    const labels = corpBoth().breakdown.map((b) => b.label);
    expect(labels.some((l) => l.includes("제외 전 산출 이익"))).toBe(true);
    expect(labels.some((l) => l.startsWith("증여재산가액"))).toBe(false);
  });

  it("[CS-S39-CORP-LABEL-TWIN] 긍정 짝 — 배제가 없으면 「증여재산가액」 그대로", () => {
    const labels = calcConvertibleStockGift({
      atConversion: leg(10_000),
      atIssuance: leg(14_000),
    }).breakdown.map((b) => b.label);
    expect(labels.some((l) => l.startsWith("증여재산가액"))).toBe(true);
    expect(labels.some((l) => l.includes("제외 전 산출 이익"))).toBe(false);
  });

  it("[CS-S39-CORP-ONE-LEG] 건 단위 축 — 전환 leg만 표시해도 결과가 같다", () => {
    // 수증자는 두 시점에 걸쳐 **같은 사람**이다(`side()` 주석). 한쪽만 표시된 입력도
    //   같은 결론·같은 보존값을 내야 한다 — 아니면 ④가 어느 leg에 실었는지가 결과를 바꾼다.
    const r = calcConvertibleStockGift({
      atConversion: { ...leg(10_000), doneeIsForProfitCorp: true },
      atIssuance: leg(14_000),
    });
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("영리법인");
    expect(r.thresholdEcho?.gain).toBe(200_000_000);
    expect(amountOf(r, "전환 후 교부주식 기준 이익")).toBe(500_000_000);
  });

  // 🔴 이 테스트는 처음에 **공허했다** — 뮤테이션으로 드러났다(SM8 SURVIVED). `leg()`에 `subType`이
  //    없어 `statuteFixesShareholderStatus`가 undefined를 내고, `doneeIsShareholderOfIssuer`도
  //    없어 ④ 요건이 **성립하지 않았다**. 겹치지 않는 입력으로 우선순위를 단언하고 있었던 것이다.
  //    ⇒ 두 배제가 **실제로 동시에 성립하는** 입력을 만든다.
  it("[CS-S39-CORP-VS-424] ①③과 ④가 겹치면 ①③ 사유가 우선하고 금액은 보존된다", () => {
    const both = {
      doneeIsForProfitCorp: true,
      issuerGainCorporateTaxed: true,
      doneeIsShareholderOfIssuer: true, // ④ 요건 ㉡ — 이것이 없으면 ④가 발동하지 않아 무의미하다
    };
    // 전제 확인 — ①③을 끄면 ④ 사유가 나온다(즉 ④는 이 입력에서 진짜로 성립한다)
    const only424 = calcConvertibleStockGift({
      atConversion: { ...leg(10_000), ...both, doneeIsForProfitCorp: false },
      atIssuance: { ...leg(14_000), ...both, doneeIsForProfitCorp: false },
    });
    expect(only424.exclusionReason).toContain("§4의2④");

    const r = calcConvertibleStockGift({
      atConversion: { ...leg(10_000), ...both },
      atIssuance: { ...leg(14_000), ...both },
    });
    expect(r.exclusionReason).toContain("영리법인 수증자"); // ④가 아니라 ①③
    expect(r.thresholdEcho?.gain).toBe(200_000_000);
  });

  // SM5 SURVIVED — 최상위 판정이 `atConversion || atIssuance`인데 **뒤쪽 arm이 무방비**였다.
  //   수증자는 두 시점에 걸쳐 같은 사람이므로(파일 상단 `side()` 주석) 어느 leg에 표시돼도
  //   같은 결론이어야 한다. ④가 `atConversion`만 보는 것과 **다른 관행**이라 명시적으로 고정한다
  //   (④는 목 판정이 필요해 과세단위인 가목을 보고, ①③은 사람의 속성이라 OR이다).
  it("[CS-S39-CORP-ISSUANCE-LEG] 발행 시점 leg에만 표시돼도 같은 결론", () => {
    const r = calcConvertibleStockGift({
      atConversion: leg(10_000),
      atIssuance: { ...leg(14_000), doneeIsForProfitCorp: true },
    });
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("영리법인 수증자");
    expect(r.thresholdEcho?.gain).toBe(200_000_000);
  });
});
