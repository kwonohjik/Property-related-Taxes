/**
 * 일반건물 **분리 ON + 증여 파트**의 취득가액 필수 — V-7 제외 대상을 상속으로 한정.
 *
 * ## 결함 (2026-08-07 실측, `8546dc32` O-3 이후)
 *
 * 분리 ON에서 증여 파트의 취득가액을 **아무도 요구하지 않아** 취득가액 0으로 통과했다.
 *
 * | 케이스(분리 ON · 두 파트 실가 · 파트 취득가액 칸 공란) | 종전 validate |
 * |---|---|
 * | 매매 + 매매 (대조군) | ⛔ 차단 |
 * | 매매 + 증여 · 증여 + 증여 · 증여 + 매매 | **✅ 통과** ← 결함 |
 * | 상속 + 상속 | ✅ 통과 (정상 — 평가액이 override) |
 *
 * 세액 실측(양도가 16.2억): 취득가액 0·0 → 산출세액 **500,567,775**.
 * 정상(토지 5억·건물 3억) 224,840,590 대비 **275,727,185원 과대**.
 *
 * ## 원인 — 술어는 공유했으나 **인자가 같지 않았다**
 *
 * O-3은 두 가지를 **동시에** 했다:
 *   ① 자산 단위 요구를 `!isSeparate &&`로 걷어냄 (분리 ON dead-end 해소 — 정당)
 *   ② V-7의 파트 취득가액 요구에서 `isLandInherited || isLandGift`를 제외
 *
 * ②의 근거는 「route helper가 `inheritedLandValue`/`inheritedBuildingValue`로 **override**
 * 하므로 파트 칸이 계산에 쓰이지 않는다」인데, **그 override는 상속에만 있다** — 증여 평가액
 * 전용 payload 필드는 존재하지 않는다(`giftedLandValue` 등 grep 0건). 증여 파트의 파트
 * 취득가액은 엔진이 **그대로 소비한다**.
 *
 * ⚠️ O-3 이전에는 자산 단위 칸을 요구하는데 그 칸이 화면에 없어 **dead-end(차단)** 였다.
 *    이후 **통과하고 틀린 값**이 됐다 — 실패 모드가 나빠진 회귀다.
 *
 * ## 이 수정은 O-3이 **문서화한 설계로 되돌리는 것**이다
 *
 * `gb-inheritance-gift-part-axis.anchor.test.ts:149`가 이미 그 불변식을 적어 두었다 —
 * 「파트별 실지거래가액은 **V-7이 요구하므로** 검증 공백도 없다」. 의도는 옳았고 구현만
 * 어긋나 있었다.
 *
 * 근거: `feedback_shared_predicate_argument_parity` · 계획서
 * `docs/02-design/features/transfer-gb-inheritance-partial-phase2.plan.md` §9-2.
 */
import { describe, it, expect } from "vitest";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 분리 ON · 파트 취득가액 칸만 비운 기준선 (취득원인은 케이스별로 덮어쓴다) */
function base(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2010-03-01",
    acquisitionDate: "2015-05-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "",
    buildingAcquisitionPrice: "",
    fixedAcquisitionPrice: "", // 분리 ON이면 화면에서 사라진다(hideAssetAcqAxis)
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    gbTransferLandPricePerSqm: "5514000",
    gbTransferBuildingValue: "259072400",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbZoneType: "general_residential",
    actualSalePrice: "1620000000",
    ...over,
  } as AssetForm;
}

const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", "2026-02-16");

/**
 * 증여 파트 전용 문구로 단언한다 — `/증여 신고가액/`만 쓰면 분리 OFF의 자산 단위 메시지에
 * 걸려 **잘못된 이유로 통과**한다(O-3 anchor `BLOCK_MSG` 주석과 같은 취지).
 */
const LAND_GIFT_MSG = /토지 증여 신고가액/;
const BUILDING_GIFT_MSG = /건물 증여 신고가액/;

describe("GP-1 — 증여 파트는 파트 취득가액을 요구한다 (분리 ON)", () => {
  it("🔴 매매 + 증여 — 건물 칸 공란은 차단", () => {
    const a = base({
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "gift",
      landAcquisitionPrice: "500000000",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(BUILDING_GIFT_MSG);
  });

  it("🔴 증여 + 증여 — 토지 칸부터 차단", () => {
    const a = base({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(LAND_GIFT_MSG);
  });

  it("🔴 증여 + 매매 — 토지 칸 공란은 차단", () => {
    const a = base({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "purchase",
      buildingAcquisitionPrice: "300000000",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(LAND_GIFT_MSG);
  });

  it("채우면 통과한다 — 입력 경로가 실재한다(dead-end 아님)", () => {
    const a = base({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      landAcquisitionPrice: "500000000",
      buildingAcquisitionPrice: "300000000",
    } as Partial<AssetForm>);
    expect(v(a)).toBeNull();
  });
});

describe("GP-2 — 상속 파트는 여전히 제외한다 (거짓 차단 금지)", () => {
  /**
   * 상속은 route helper가 `inheritedLandValue`/`inheritedBuildingValue`로 override하므로
   * 파트 칸이 계산 어디에도 쓰이지 않는다(O-3 probe: 999,999,999를 넣어도 세액 불변).
   * 이 수정이 상속까지 요구하게 되면 **쓰이지 않는 값을 강요하는 거짓 차단**이 된다.
   */
  it("상속 + 상속 — 파트 칸 공란이어도 통과", () => {
    const a = base({
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "inheritance",
      publishedValueAtInheritance: "600000000",
      gbBuildingInheritedValue: "300000000",
      decedentAcquisitionDate: "2000-01-01",
    } as Partial<AssetForm>);
    expect(v(a)).toBeNull();
  });

  it("상속 평가액이 비면 그쪽을 요구한다 (검증 공백 없음)", () => {
    const a = base({
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "inheritance",
      publishedValueAtInheritance: "",
      gbBuildingInheritedValue: "300000000",
      decedentAcquisitionDate: "2000-01-01",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(/상속개시일 토지 평가액/);
  });
});

describe("GP-3 — 회귀 0", () => {
  it("매매 + 매매 (대조군) — 종전 문구 유지", () => {
    const a = base({
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(/토지 취득가액을 입력하세요/);
  });

  it("pre-1985 증여 — §163⑨ 게이트 false라 종전 매매 문구", () => {
    const a = base({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      landAcquisitionDate: "1980-03-01",
      acquisitionDate: "1980-05-01",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(/토지 취득가액을 입력하세요/);
  });

  it("분리 OFF + 증여 — 자산 단위 신고가액 요구 유지", () => {
    const a = base({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2015-05-01",
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(/증여 신고가액\(취득가액\)을 입력하세요/);
  });

  it("환산 파트는 요구하지 않는다 — 토지 매매·환산 + 건물 증여(실가)", () => {
    const a = base({
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "gift",
      landAcqMode: "estimated",
      buildingAcquisitionPrice: "300000000",
    } as Partial<AssetForm>);
    expect(v(a)).toBeNull();
  });
});
