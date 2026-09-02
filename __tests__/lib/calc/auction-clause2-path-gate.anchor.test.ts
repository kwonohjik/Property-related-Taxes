/**
 * anchor — §164⑨2호 공매·경락의 **경로 게이트**(A08)
 *
 * 코드리뷰 2026-09 A08. 2호는 `resolveConversionDenominatorAtTransfer`를 통해서만 발동하고
 * 그 유일한 호출부가 **단건 `calcTransferGain` 안**이다. 다필지는 조기반환으로 STEP 2를
 * 통째로 건너뛰고, 토지·건물 분리취득은 `calcSplitGain` 조기반환으로 별도 경로를 탄다.
 *
 * 종전에는 그 경우에도 ⑤ 토글이 뜨고 ⑧이 공매·경락가액을 **필수로 요구한 뒤 무시**했다.
 * 값은 ④⑫⑭를 정상 통과해 엔진 input까지 도달한 뒤 소비만 안 됐다 — 세액 차 0원.
 * 즉 「차단됐다」가 아니라 **「필수로 요구해 놓고 버린다」**였다(무시되는 특례 가치는
 * 단건 동일조건에서 95,463,428원).
 *
 * 조문: 「소득세법 시행령」 §164⑨2호 —
 *   「「국세징수법」에 의한 공매와 「민사집행법」에 의한 강제경매 또는 저당권실행을 위하여
 *    경매되는 경우의 그 공매 또는 경락가액」
 *
 * **1호(공익수용)는 같은 층위에서 이미 막혀 있다** — 2호에만 대응 가드가 없었다.
 *
 * ⚠️ 술어를 1호에서 복사하면 안 된다 — 1호의 `isSplitLandExprEligibleAssetKind`는
 *    `["building"]`뿐인데 `calcSplitGain`은 `housing`도 태우므로 **주택 split이 남는다**.
 *    정본 술어는 `hasSeperateLandAcquisitionDate` 단독이다(A08-4가 그 경계를 고정).
 *
 * ⚠️ 이 anchor가 없으면 되돌려도 red가 나지 않는다 —
 *    `expropriation-auction-clause2.anchor.test.ts` 9건이 전부 단건/컴패니언 aggregate이고
 *    `parcels`·`landAcquisitionDate`와 조합한 케이스가 0건이었다(리뷰 시점 뮤테이션 3회
 *    209/2,091 · 757/7,807 · 463/4,368 반응 0).
 */
import { describe, it, expect } from "vitest";
import { validateAuctionAsset } from "@/lib/calc/transfer-tax-validate-expropriation";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER_DATE = "2020-06-01";

/** 공매·경락 토글 ON + 가액 미입력 — 게이트가 열려 있으면 ⑧이 차단해야 한다. */
function auctionAsset(over: Partial<AssetForm> = {}): AssetForm {
  const form = createDefaultTransferFormData();
  return {
    ...form.assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-01-01",
    useEstimatedAcquisition: true,
    isAuctionTransfer: true,
    auctionPrice: "",
    ...over,
  } as AssetForm;
}

const V = (a: AssetForm) => validateAuctionAsset(a, "자산", TRANSFER_DATE);

describe("[A08] §164⑨2호 — 엔진에 도달하는 경로에서만 요구한다", () => {
  it("A08-1(회귀): 단건 경로는 종전대로 공매·경락가액을 요구한다", () => {
    expect(V(auctionAsset())).toMatch(/공매·경락가액을 입력하세요/);
  });

  it("A08-2: 다필지 경로는 요구하지 않는다 (조기반환으로 STEP 2를 건너뛴다)", () => {
    expect(V(auctionAsset({ parcelMode: true }))).toBeNull();
  });

  it("A08-3: 토지·건물 분리취득은 요구하지 않는다 (calcSplitGain 별도 경로)", () => {
    expect(V(auctionAsset({ hasSeperateLandAcquisitionDate: true }))).toBeNull();
  });

  it("A08-4: **주택** split도 막힌다 — 1호 술어(building 전용)를 복사했다면 남았을 경로", () => {
    expect(
      V(auctionAsset({ assetKind: "housing", hasSeperateLandAcquisitionDate: true })),
    ).toBeNull();
  });

  it("A08-5(회귀): 1호와의 배타 차단은 경로와 무관하게 먼저 걸린다", () => {
    expect(V(auctionAsset({ transferCause: "public_expropriation", parcelMode: true }))).toMatch(
      /동시에 적용할 수 없습니다/,
    );
  });

  it("A08-6(회귀): 토글이 꺼져 있으면 아무것도 요구하지 않는다", () => {
    expect(V(auctionAsset({ isAuctionTransfer: false }))).toBeNull();
  });
});
