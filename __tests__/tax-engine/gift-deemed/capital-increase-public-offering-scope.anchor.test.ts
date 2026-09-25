import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import type { CapitalIncreaseInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 2-D — 「상증법」§39① 괄호(주권상장법인 모집방법 배정 제외)의 **적용 범위** 3건 (리뷰 #49·#11·#4)
 *
 * 제외는 「배정(…으로 배정하는 경우는 제외한다. 이하 이 항에서 같다)」으로 **배정이라는 구성요건
 * 동사에 삽입**돼 있다. 제외 대상은 **배정 행위(경우)**이지 사람이 아니고, 배정이 없는 사안도 아니다.
 */

const LOW_NO_REALLOC: CapitalIncreaseInput = {
  direction: "low",
  subType: "no_realloc",
  preIssuePrice: 20_000,
  preIssueShares: 100_000,
  newSharePrice: 10_000,
  issuedShares: 100_000,
  forfeitedShares: 60_000,
  isListed: true,
};

const HIGH_NO_REALLOC: CapitalIncreaseInput = {
  direction: "high",
  subType: "no_realloc",
  preIssuePrice: 5_000,
  preIssueShares: 100_000,
  newSharePrice: 20_000,
  issuedShares: 50_000,
  forfeitedShares: 50_000,
  relatedAcquiredShares: 50_000,
  ratioDenomShares: 50_000,
  isListed: true,
};

/**
 * #49 — 나목은 「해당 법인이 **실권주를 배정하지 아니한** 경우」다. 배정이 없으므로 「공모로 배정한
 * 경우」라는 제외의 적용 대상 자체가 없다.
 *
 * 두 독법 어느 쪽으로 읽어도 0이 나오지 않는다:
 *   ① 구조 독법 — 배정이 없으니 제외 괄호가 걸릴 자리가 없다 ⇒ 나목 그대로 과세
 *   ② 문언 대입 독법 — 「(공모배정을 제외한) 배정을 하지 아니한 경우」로 읽으면 공모로 배정한 사안은
 *      오히려 **나목 요건을 충족**한다 ⇒ 과세
 * ⇒ 현행의 0원은 어느 독법에서도 도출되지 않는다.
 */
describe("[PO-S39-NOREALLOC] #49 실권주 미배정(나목)에는 공모 제외가 걸리지 않는다", () => {
  it("[PO-S39-NOREALLOC-LOW] 저가 나목 + 상장 + 공모 → 300,000,000 (제외 미발동)", () => {
    const r = calcCapitalIncreaseGift({ ...LOW_NO_REALLOC, allocationMethod: "public_offering" });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(300_000_000);
  });

  it("[PO-S39-NOREALLOC-HIGH] 고가 나목 + 상장 + 공모 → 500,000,000 (제외 미발동)", () => {
    const r = calcCapitalIncreaseGift({ ...HIGH_NO_REALLOC, allocationMethod: "public_offering" });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(500_000_000);
  });

  it("[PO-S39-NOREALLOC-BASE] 대비 짝 — 같은 사실관계의 normal도 같은 값(제외만 떼어낸 것)", () => {
    expect(calcCapitalIncreaseGift(LOW_NO_REALLOC).deemedGiftValue).toBe(300_000_000);
    expect(calcCapitalIncreaseGift(HIGH_NO_REALLOC).deemedGiftValue).toBe(500_000_000);
  });

  it("[PO-S39-REALLOC-KEEP] 긍정 짝 — 실권주를 «배정한» 가목에서는 제외가 그대로 발동해 0", () => {
    const r = calcCapitalIncreaseGift({
      ...LOW_NO_REALLOC,
      subType: "forfeited_realloc",
      allocationMethod: "public_offering",
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("모집방법");
  });
});

/**
 * #11 — 고가(§39①2호 가목)에서는 **배정을 받는 자(인수자)와 이익을 얻는 자(포기자)가 다른 사람**이다.
 *   「…해당 법인이 실권주를 배정하는 경우에는 **그 실권주를 배정받은 자**가 그 실권주를 인수함으로써
 *    그의 특수관계인에 해당하는 신주 인수 포기자가 얻은 이익」
 * cap-table은 제외 여부를 **수증자 행**으로만 조회해 판정 주체가 뒤바뀌어 있었다(양방향 오류).
 */
describe("[CT-S39-PO-SUBJECT] #11 고가 공모 제외는 «배정받은 자»(증여자) 행으로 판정한다", () => {
  const mk = (aMethod?: "public_offering", bMethod?: "public_offering") =>
    calcCapitalIncreaseAllocation({
      direction: "high",
      preIssuePrice: 5_000,
      newSharePrice: 20_000,
      isListed: true,
      shareholders: [
        { id: "A", preShares: 50_000, entitledShares: 50_000, subscribedShares: 100_000, reallocatedShares: 50_000, relatedTo: ["B"], allocationMethod: aMethod },
        { id: "B", preShares: 50_000, entitledShares: 50_000, subscribedShares: 0, reallocatedShares: 0, relatedTo: ["A"], allocationMethod: bMethod },
      ],
    });
  const total = (r: ReturnType<typeof calcCapitalIncreaseAllocation>) =>
    r.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total;

  it("[CT-S39-PO-BASE] 기준 — 공모 표시 없음 → B 375,000,000", () => {
    expect(mk()).toBeDefined();
    expect(total(mk())).toBe(375_000_000);
  });

  it("[CT-S39-PO-DONOR] 실권주를 배정받은 A 행에 공모 → 제외 발동 → B 0", () => {
    expect(total(mk("public_offering", undefined))).toBe(0);
  });

  it("[CT-S39-PO-BENEFICIARY] 아무것도 배정받지 않은 포기자 B 행에 공모 → 제외 근거 없음 → 375,000,000", () => {
    expect(total(mk(undefined, "public_offering"))).toBe(375_000_000);
  });

  it("[CT-S39-PO-SINGLE-PARITY] 같은 사실관계의 단건 엔진과 일치한다(두 엔진 375,000,000 차 해소)", () => {
    const single = calcCapitalIncreaseGift({
      direction: "high",
      subType: "forfeited_realloc",
      preIssuePrice: 5_000,
      preIssueShares: 100_000,
      newSharePrice: 20_000,
      issuedShares: 100_000,
      forfeitedShares: 50_000,
      isListed: true,
      allocationMethod: "public_offering",
    });
    expect(single.deemedGiftValue).toBe(0);
    expect(total(mk("public_offering", undefined))).toBe(0);
  });
});

/**
 * #4 — 「상증령」§29②6호 **나목**은 「전환주식 발행 당시 **제1호부터 제5호까지의 규정에 따라 계산한
 * 이익**」이다(본문 직접 조회). 제1호~제5호는 **계산방법** 규정이고, 공모 제외는 그 바깥의 **법** §39①
 * 본문 괄호에 있다. 차감항은 과세단위가 아니라 **기준선**이므로 요건필터를 태우지 않는다.
 *
 * 현행은 차감항에만 필터가 걸려 **어느 독법으로도 도출되지 않는 비대칭**이었다 —
 * 필터가 준용된다면 두 leg 모두 0이 되어 0 − 0 = 0이고, 준용되지 않는다면 둘 다 산식값이다.
 */
describe("[CS-S39-PO-SUBTRAHEND] #4 전환주식 차감항에 공모 제외가 전이되지 않는다", () => {
  const leg = (newSharePrice: number): CapitalIncreaseInput => ({
    direction: "low",
    preIssuePrice: 20_000,
    preIssueShares: 100_000,
    newSharePrice,
    issuedShares: 100_000,
    forfeitedShares: 100_000,
  });

  it("[CS-S39-PO-BASE] 기준 — 500,000,000 − 300,000,000 = 200,000,000", () => {
    expect(calcConvertibleStockGift({ atConversion: leg(10_000), atIssuance: leg(14_000) }).deemedGiftValue).toBe(
      200_000_000,
    );
  });

  it("[CS-S39-PO-ISSUANCE] 발행 시점만 공모 — 차감항이 사라지지 않는다 → 200,000,000", () => {
    const r = calcConvertibleStockGift({
      atConversion: leg(10_000),
      atIssuance: { ...leg(14_000), isListed: true, allocationMethod: "public_offering" },
    });
    expect(r.deemedGiftValue).toBe(200_000_000);
  });

  it("[CS-S39-PO-CONVERSION] 긍정 짝 — 전환 시점(과세단위) 공모는 그대로 제외 → 0", () => {
    const r = calcConvertibleStockGift({
      atConversion: { ...leg(10_000), isListed: true, allocationMethod: "public_offering" },
      atIssuance: leg(14_000),
    });
    expect(r.deemedGiftValue).toBe(0);
  });
});
