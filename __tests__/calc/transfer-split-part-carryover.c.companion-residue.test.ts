/**
 * 주택 split 파트 이월과세 P2 C — 함께 양도 자산에 남은 C 토글(잔재)은 ④ 본문·⑧·⑥ 모두에서 «꺼진 것»으로 읽힌다 (2026-10-19)
 *
 * 토글은 첫 자산에서만 켤 수 있지만 값은 자산에 남는다(켠 뒤 종류를 토지로 바꾸고 «주택 먼저로 교환»으로 내려가 다시 주택으로 바꾸는 경로 등).
 * 컴패니언이 C로 읽히면 `isSeparateAcquisition`이 «아님»이 되어 ④ 본문(`companionAssets[].isSeparateAcquisition`)과 ⑥(취득가액 «계산 후 표시»)이
 * 토글을 끈 읽기와 갈린다(실측: true→false · acqPrice 9억→0 pending). 세 지점이 OFF와 같아야 한다.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { neutralizeCarryoverDonorSplitForCompanion } from "@/lib/calc/transfer-land-part-cause";
import { cAsset, cForm, bodyOf, issuesOf } from "./_helpers/split-carryover-c-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const primary = () =>
  ({ ...makeDefaultAsset(1), addressJibun: "서울 A", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-02", fixedAcquisitionPrice: "300,000,000", actualSalePrice: "800,000,000" }) as unknown as AssetForm;
/** 취득일 분리(서로 다른 두 날) + 이월과세(증여) 원인을 가진 주택 컴패니언 — 토글만 ON/OFF */
const companion = (on: boolean) =>
  cAsset({ assetLabel: "자산 2", assetId: "companion-2", carryoverDonorSplit: on, actualSalePrice: "400,000,000", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1995-03-01", acquisitionDate: "2023-03-01", fixedAcquisitionPrice: "300,000,000" });
const form = (on: boolean) => cForm({ assets: [primary(), companion(on)], contractTotalPrice: "1200000000", bundledSaleMode: "actual" });

describe("컴패니언 C 잔재 — OFF 읽기와 같다", () => {
  it("④ 본문: 토글만 다른 두 폼의 본문이 같다(companionAssets[].isSeparateAcquisition 포함)", async () => {
    expect(await bodyOf(form(true))).toEqual(await bodyOf(form(false)));
  });
  it("⑧: 차단 사유가 같다(⑧은 isNonPrimaryAsset 옵션으로 이미 갈려 있다)", () => {
    expect(issuesOf(form(true))).toEqual(issuesOf(form(false)));
  });
  it("⑥: 컴패니언 취득가액이 «계산 후 표시»가 아니라 입력 합(별개 취득 파트 합)으로 같다", () => {
    const on = computeTransferPerAssetSummary(form(true), null).rows[1];
    const off = computeTransferPerAssetSummary(form(false), null).rows[1];
    expect(on).toMatchObject({ acqPrice: off.acqPrice, acqPending: off.acqPending, expensePending: off.expensePending });
    expect(on.acqPending).toBe(false);
  });
  it("첫 자산(주 자산)의 C는 그대로 — 중화는 두 번째 이후에만", () => {
    const a = companion(true);
    expect(neutralizeCarryoverDonorSplitForCompanion(a, false)).toBe(a);
    expect(neutralizeCarryoverDonorSplitForCompanion(a, true).carryoverDonorSplit).toBe(false);
    // 값 보존 — 원본은 바뀌지 않는다
    expect(a.carryoverDonorSplit).toBe(true);
  });
});
