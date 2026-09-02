/**
 * anchor — 컴패니언(함께양도 2번째 이후) **미지원 조합 명시 차단** (A12 · A05)
 *
 * 코드리뷰 2026-09. 두 건 모두 「⑤가 입력을 받고 ⑧이 **필수로 요구**하는데 ④⑫에 채널이
 * 없어 값이 통째로 사라진다」는 같은 형태였다. 사용자 결정(2026-09-02)에 따라
 * **정식 지원이 아니라 명시 차단**으로 확정했다.
 *
 * ## A12 — 컴패니언 다필지(parcels) · 실측 2,173,600 ~ 15,488,000원
 *
 * ④ `buildAssetPayload`가 `parcels`를 만들지 않고 ⑫ `companionAssetSchema`에도 키가 없다.
 * 정식 지원은 ⑫⑬⑭ 3계층 신설이 필요한 신규 기능 규모이고, 채택 시 컴패니언에도
 * `firstParcelAcqDate` 규약(A15)을 맞춰야 같은 입력이 primary/companion 위치에 따라
 * 다른 세액을 내지 않는다.
 *
 * ## A05 — 컴패니언 §164⑨1호 토지분 보상 2필드
 *
 * ⑧이 값을 **강제해 놓고 버렸다**. 게다가 그 조합 전체가 원인 불명의 **HTTP 500**으로 죽는다
 * (컴패니언 `standardPricePerSqmAtAcquisition` 채널 부재 — 배선 3곳이 전부 단건 전용).
 * 2필드만 배선하는 것은 no-op이라 **금지**이고, 차단이 그 500 경로를 도달 불가로 만든다.
 *
 * ## ⚠️ ⑤ 게이트만으로는 부족하다
 *
 * 이미 `parcelMode: true`가 저장된 stale 세션 폼은 토글이 사라진 채 검증만 계속 돌아
 * 「화면에 없는 칸을 입력하라」가 된다(`feedback_new_asset_field_stale_sessionstorage_guard`).
 * ⑤ 노출 게이트와 ⑧ 차단을 **함께** 넣는 이유다.
 *
 * ⚠️ 이 anchor가 없으면 되돌려도 red가 나지 않는다 — `companionAssets` 언급 테스트 20파일
 *    ∩ `parcels`/`parcelMode` = 0건, ⑧·엔진 anchor는 전부 단건 또는 leaf 직접 호출이었다.
 */
import { describe, it, expect } from "vitest";
import { validateAssetAcquisition, validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 자산 2건(일괄양도) 폼 — index 0 = primary, index 1 = 컴패니언. */
function bundledForm(assetOver: Partial<AssetForm>) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-06-01";
  form.contractTotalPrice = "1,000,000,000";
  form.householdHousingCount = "1";
  const base = { ...form.assets[0], assetKind: "land", acquisitionCause: "purchase" } as AssetForm;
  form.assets = [
    { ...base, acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "300,000,000" },
    { ...base, ...assetOver } as AssetForm,
  ];
  return form;
}

const PARCEL_BLOCK = /함께양도 자산은 다필지/;
const EXPR_BLOCK = /함께양도 자산은 토지·건물 분리취득/;

describe("[A12] 컴패니언 다필지 — 명시 차단", () => {
  const parcelAsset: Partial<AssetForm> = {
    acquisitionDate: "2012-01-01",
    parcelMode: true,
    parcels: [] as never,
  };

  /** 취득 정보 검증에 직접 겨눈다 — 상위 `validateAssetEntry`는 앞선 검증이 먼저 걸린다. */
  const V = (isCompanion: boolean) =>
    validateAssetAcquisition(
      bundledForm(parcelAsset).assets[1],
      isCompanion ? "자산 2" : "자산",
      "2024-06-01",
      isCompanion,
    );

  it("A12-1: 컴패니언에서 차단한다", () => {
    expect(V(true)).toMatch(PARCEL_BLOCK);
  });

  it("A12-2(회귀): primary는 종전대로 필지 검증을 받는다 — 차단 문구가 아니다", () => {
    const err = V(false);
    expect(err ?? "").not.toMatch(PARCEL_BLOCK);
    // 「필지를 최소 1개 추가하세요」 같은 기존 검증이 그대로 돈다.
    expect(err).toBeTruthy();
  });

  it("A12-3: 차단 메시지가 해소 경로를 제시한다 (dead-end 방지)", () => {
    expect(V(true)).toMatch(/첫 번째 자산으로 옮기거나|해제하세요/);
  });
});

describe("[A05] 컴패니언 §164⑨1호 토지분 보상 — 명시 차단", () => {
  const exprAsset: Partial<AssetForm> = {
    assetKind: "building",
    acquisitionDate: "2012-01-01",
    landAcquisitionDate: "2010-01-01",
    hasSeperateLandAcquisitionDate: true,
    useEstimatedAcquisition: true,
    transferCause: "public_expropriation",
    expropriationNoticeDate: "2020-01-01",
  };

  it("A05-1: 컴패니언(index 1)에서 차단한다 — 종전에는 2필드를 요구해 놓고 버렸다", () => {
    const form = bundledForm(exprAsset);
    expect(validateAssetEntry(form.assets[1], 1, form) ?? "").toMatch(EXPR_BLOCK);
  });

  it("A05-2(회귀): primary는 이 차단에 걸리지 않는다", () => {
    const form = bundledForm(exprAsset);
    form.assets[0] = { ...form.assets[0], ...exprAsset } as AssetForm;
    expect(validateAssetEntry(form.assets[0], 0, form) ?? "").not.toMatch(EXPR_BLOCK);
  });
});
