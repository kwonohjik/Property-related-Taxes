/**
 * Pre-Do anchor — O-3 상속·증여 게이트의 **파트 축** 정합 (2026-08-06)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §11
 * 이 파일은 **구현 전에** 작성돼 현행에서 실패한다(정책 `feedback_pre_anchor_verification`).
 *
 * ## 조문 근거 (KoreanLaw 원문 — mst=280405 / 286211)
 *
 * 「소득세법」 제97조 제1항 제1호 **단서**:
 *   "다만, 가목의 실지거래가액을 **확인할 수 없는 경우에 한정하여** 나목의 금액을 적용한다."
 * 「소득세법 시행령」 제163조 제9항: 상속·증여받은 자산은 상속개시일·증여일 현재 상증법
 *   §60~§66 평가액을 "취득당시의 실지거래가액으로 **본다**".
 *
 * ⇒ 상속·증여 파트는 실지거래가액이 **확인 가능**하므로 나목(매매사례가액·감정가액·환산취득가액)을
 *   적용할 **법적 근거가 없다**. 이 판정은 **파트별**이다 — §94①1호가 토지와 건물을 별개 자산으로
 *   열거하고(O-1 §10.1), §97②2호 본문도 「자산별로」라고 명시한다.
 *
 * ## 현행 결함 4건 (probe 실측 — 2026-08-06)
 *
 *   O3-1  상속 게이트가 **자산 레거시 플래그**(`useEstimatedAcquisition`)를 봐서 파트 라디오로
 *         설정한 환산이 새어 나간다 → §163⑨ 상속 평가액이 payload에서 사라지고 환산으로 계산됨
 *         (분리 ON·토지 실가+건물 환산: validate PASS · `inheritedLandValue=undefined` ·
 *          세액 515,046,647 vs 둘 다 실가 472,288,357 = **42,758,290원 차이**)
 *   O3-2  증여 게이트도 같은 축 결함
 *   O3-3  증여 + 분리 ON은 자산 단위 「증여 신고가액」을 요구하는데 그 칸이 화면에 **0개**다
 *         (파트 칸 2개만 존재) → dead-end (`feedback_ui_gate_removes_sole_input_path`)
 *   O3-4  상속 + 분리 ON에서 V-7이 파트 취득가액을 **필수로 요구**하는데 엔진은 그 값을 쓰지 않는다
 *         (999,999,999를 넣어도 세액 472,288,357 불변 — 상속 평가액이 override) → 거짓 요구 + 침묵 무시
 */
import { describe, it, expect } from "vitest";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const LAND_ACQ = "2005-06-01";
const BLD_ACQ = "2015-03-01";

/** 분리 ON · 파트별 필수값을 채운 기준선 (취득원인은 케이스별로 덮어쓴다) */
function base(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: LAND_ACQ,
    acquisitionDate: BLD_ACQ,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "100000000",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "180.96",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbZoneType: "commercial",
    actualSalePrice: "2000000000",
    ...over,
  } as AssetForm;
}

/** 토지·건물 모두 상속 (V1이 부분 상속을 차단하므로 상속은 항상 양쪽) */
const inherited = (over: Partial<AssetForm> = {}) =>
  base({
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    publishedValueAtInheritance: "300000000",
    gbBuildingInheritedValue: "100000000",
    ...over,
  } as Partial<AssetForm>);

const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산1", "2026-02-16");

/**
 * 추계 차단 규칙의 **고유 문구**로 단언한다.
 * `/상속/`·`/증여/`처럼 느슨하게 잡으면 기존 「증여 신고가액을 입력하세요」 메시지에 걸려
 * **잘못된 이유로 통과**한다(작성 중 실측 — A-3에서와 같은 거짓 통과).
 */
const BLOCK_MSG = /환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다/;

describe("O3-1 — 상속 파트는 추계(환산·감정·매매사례)가 법적으로 불가", () => {
  it("🔴 파트 라디오로 건물만 환산 → **차단**한다 (자산 레거시 플래그가 false여도)", () => {
    const a = inherited({ buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>);
    expect(a.useEstimatedAcquisition).toBeFalsy(); // 종전 게이트가 보던 축은 false다
    expect(v(a)).toMatch(BLOCK_MSG);
  });

  it("🔴 파트 라디오로 토지만 환산 → 차단", () => {
    const a = inherited({ landAcqMode: "estimated", landAcquisitionPrice: "" } as Partial<AssetForm>);
    expect(v(a)).toMatch(BLOCK_MSG);
  });

  it("감정가액 파트도 차단 — 단서는 「확인할 수 없는 경우에 한정」이다", () => {
    const a = inherited({ buildingAcqMode: "appraisal" } as Partial<AssetForm>);
    expect(v(a)).toMatch(BLOCK_MSG);
  });

  it("두 파트 모두 실가면 통과 (§163⑨ 평가액이 취득가액)", () => {
    expect(v(inherited())).toBeNull();
  });

  it("자산 레거시 플래그로 켠 환산도 여전히 차단 (회귀 0)", () => {
    const a = inherited({
      useEstimatedAcquisition: true,
      landAcqMode: "",
      buildingAcqMode: "",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(BLOCK_MSG);
  });
});

describe("O3-2 — 증여 파트도 같다 · 단 **증여 파트만** 제약된다", () => {
  it("🔴 건물 증여 + 건물 환산 → 차단", () => {
    const a = base({
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "gift",
      buildingAcqMode: "estimated",
      buildingAcquisitionPrice: "",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(BLOCK_MSG);
  });

  it("🔴 토지 매매 + 건물 증여에서 **토지만** 환산은 허용 — 증여 파트가 아니다", () => {
    const a = base({
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "gift",
      landAcqMode: "estimated",
      landAcquisitionPrice: "",
    } as Partial<AssetForm>);
    expect(v(a)).toBeNull();
  });

  it("토지 증여 + 토지 환산 → 차단", () => {
    const a = base({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "purchase",
      landAcqMode: "estimated",
      landAcquisitionPrice: "",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(BLOCK_MSG);
  });
});

describe("O3-3 — 증여 + 분리 ON은 자산 단위 신고가액을 요구하지 않는다", () => {
  /**
   * 분리 ON에서는 자산 단위 취득가액 칸이 화면에서 사라진다(`hideAssetAcqAxis`) —
   * probe 실측으로 **0개**였다. 그 칸을 요구하면 진행 불가다.
   * 파트별 실지거래가액은 V-7이 요구하므로 검증 공백도 없다.
   */
  it("🔴 파트 취득가액이 채워져 있으면 통과한다 — `fixedAcquisitionPrice` 요구 금지", () => {
    const a = base({
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      fixedAcquisitionPrice: "", // 화면에 칸이 없다
    } as Partial<AssetForm>);
    expect(v(a)).toBeNull();
  });

  it("분리 OFF에서는 종전대로 자산 단위 신고가액을 요구한다 (회귀 0)", () => {
    const a = base({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: BLD_ACQ,
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      fixedAcquisitionPrice: "",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(/증여 신고가액/);
  });
});

describe("O3-4 — 상속 파트의 취득가액은 §163⑨ 평가액이 정본이다", () => {
  /**
   * 엔진은 상속 파트의 파트 취득가액을 **쓰지 않는다**(route-helper가 `inheritedLandValue`로
   * override — probe: 999,999,999를 넣어도 세액 불변). 계산에 쓰이지 않는 값을 필수로 요구하면
   * 거짓 차단이고, 입력을 받아 두면 「적었는데 무시」가 된다.
   */
  it("🔴 파트 취득가액 없이도 통과한다 — 상속 평가액이 취득가액이다", () => {
    const a = inherited({
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
    } as Partial<AssetForm>);
    expect(v(a)).toBeNull();
  });

  it("상속 평가액이 비면 그쪽을 요구한다 (검증 공백 없음)", () => {
    const a = inherited({
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      publishedValueAtInheritance: "",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(/상속개시일 토지 평가액/);
  });

  it("상속이 아닌 파트는 종전대로 파트 취득가액을 요구한다 (회귀 0)", () => {
    const a = base({
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      landAcquisitionPrice: "",
    } as Partial<AssetForm>);
    expect(v(a)).toMatch(/토지 취득가액을 입력하세요/);
  });
});
