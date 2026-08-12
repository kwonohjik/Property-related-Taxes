/**
 * ④ 일반건물 × 지분(%) 분할 취득 — API 변환 (`generalBuildingShares[]` 빌더).
 *
 * 계획서: `docs/00-pm/transfer-general-building-fractional-share.plan.md` (개정 3)
 * 설계:   `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md` D2·D3
 *
 * `transfer-tax-api-gb.ts`(547줄)가 800줄 정책에 가까워 sibling으로 분리했다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { buildGeneralBuildingValuation } from "./transfer-tax-api-gb";
import { getOwnershipRatio, mergePrimaryBasic, isFullFractionalBundle } from "./transfer-tax-api-helpers";

/**
 * 물건-수준 GB 폼 필드 — primary에서 복사한다.
 *
 * 🔑 **Zod의 `GB_SHARE_PROPERTY_LEVEL_PATHS`(payload 키)와 같은 축이다.**
 *    payload 키와 폼 필드명이 **다르므로**(예: 폼 `gbAcqLandPricePerSqm` → payload
 *    `acquisitionLandPricePerSqm`) 아래 표로 대응을 명시한다. 한쪽만 늘리면
 *    superRefine이 상시 차단하거나 반대로 검증이 조용히 약해진다.
 *
 * | 폼 필드 (여기)                          | payload 키 (Zod)                                  |
 * |---|---|
 * | `gbLandArea`                            | `landArea`                                        |
 * | `gbBuildingArea`                        | `buildingArea`                                    |
 * | `gbBuildingFootprintArea`               | `buildingFootprintArea`                           |
 * | `gbTransferLandPricePerSqm`             | `transferLandPricePerSqm`                         |
 * | `gbTransferBuildingValue`               | `transferBuildingStdPrice`                        |
 * | `gbZoneType`·`gbIsMetropolitan`·`gbUnapprovedBuilding` | `zoneType`·`isMetropolitan`·`unapprovedBuilding` |
 * | `saleSplitMode`·`landTransferPrice`·`buildingTransferPrice`·`saleSplitExemption` | 양도 계약 단위 |
 * | `landAppraisalAtTransfer`·`buildingAppraisalAtTransfer`·`appraisalDateAtTransfer` | 감정 서열 |
 * | `gbHasExtension` + 증축 6필드(실가 2필드 제외) | `extensionInfo.*`                            |
 * | `gbHouseToCommercialConversion`·`gbConversionDate`·`gbWasMultiHouseAtConversion` | 용도변경 |
 * | `gbHasFirstDisclosure` + 최초공시 3필드  | `hasFirstDisclosure` 외                           |
 *
 * ⚠️ **증축 실가 2필드(`gbExtensionActualAcquisitionPrice`·`gbExtensionActualExpenses`)는 제외**한다 —
 *    그 지분이 부담한 몫이라 지분-수준이고 × 지분율 대상이다(D3).
 */
const GB_PROPERTY_LEVEL_FORM_FIELDS = [
  // 면적
  "gbLandArea",
  "gbBuildingArea",
  /* 원건물 연면적 — 물건 사건이라 첫 카드가 전담한다(증축과 같은 축). payload 키는 없다:
     엔진에 가지 않고 건물1 기준시가 계산기 prefill로만 쓰인다. */
  "gbOriginalBuildingArea",
  "gbBuildingFootprintArea",
  // 양도시 기준시가
  "gbTransferLandPricePerSqm",
  "gbTransferBuildingValue",
  // 물건 속성 (NBL)
  "gbZoneType",
  "gbIsMetropolitan",
  "gbUnapprovedBuilding",
  // 물건 속성 (§104③ 미등기양도자산 — 위 `gbUnapprovedBuilding`(§101① 단서)과 별개 축)
  "gbLandUnregistered",
  "gbBuildingUnregistered",
  // 양도 계약 단위
  "saleSplitMode",
  "landTransferPrice",
  "buildingTransferPrice",
  "saleSplitExemption",
  "landAppraisalAtTransfer",
  "buildingAppraisalAtTransfer",
  "appraisalDateAtTransfer",
  // 물건 사건 ① 증축 (실가 2필드 제외 — 위 주석)
  "gbHasExtension",
  "gbExtensionDate",
  "gbExtensionArea",
  "gbExtensionAcquisitionMode",
  "gbExtensionAcquisitionCause",
  "gbExtensionFloorArea85",
  "gbTransferExtensionBuildingStdPrice",
  "gbAcquisitionExtensionBuildingStdPrice",
  // 물건 사건 ② 용도변경
  "gbHouseToCommercialConversion",
  "gbConversionDate",
  "gbWasMultiHouseAtConversion",
  // 물건 사건 ③ 최초공시
  "gbHasFirstDisclosure",
  "gbFirstDisclosurePrice",
  "gbFirstDisclosureLandStdPrice",
  "gbFirstDisclosureBuildingStdPrice",
] as const satisfies readonly (keyof AssetForm)[];

/** 계약 개수 가드 — 목록이 조용히 줄면 동일성 검증이 약해진다. */
export const GB_PROPERTY_LEVEL_FORM_FIELD_COUNT = GB_PROPERTY_LEVEL_FORM_FIELDS.length;

/**
 * 지분 자산에 primary의 **물건-수준** 값을 병합한다 — `mergePrimaryBasic`의 GB 확장판.
 *
 * 기존 7키(자산종류·면적·토지성격·양도형태)는 그대로 위임하고 GB 필드를 얹는다.
 * 취득측(취득일·취득원인·취득시 기준시가·파트 취득가액·필요경비)은 **병합하지 않는다** — 지분 고유값이다.
 */
export function mergeGbPropertyLevel(asset: AssetForm, primary: AssetForm): AssetForm {
  const merged = { ...mergePrimaryBasic(asset, primary) } as Record<string, unknown>;
  for (const f of GB_PROPERTY_LEVEL_FORM_FIELDS) {
    merged[f] = (primary as unknown as Record<string, unknown>)[f];
  }
  return merged as unknown as AssetForm;
}

/**
 * D3 — 지분율 스케일. **100% 기준으로 입력받은 금액만** × r 한다.
 *
 * 🔴 **기준시가·면적은 절대 스케일하지 않는다.** 환산 산식에서 분자·분모로 함께 나타나 약분되고,
 *    `ownershipRatio`가 이미 개산공제(영 §163⑥) base를 줄인다 — 기준시가까지 줄이면 **이중 축소**다
 *    (`lib/tax-engine/types/general-building.types.ts` `ownershipRatio` 주석).
 *
 * UI 안내문(「모든 금액을 100% 기준으로 입력하세요」)과 **같은 계층**에서 변환해야 3중 mirror가 성립한다.
 */
export function applyShareScale(
  valuation: Record<string, unknown>,
  ratio: number,
): Record<string, unknown> {
  if (ratio >= 1) return valuation;
  const scale = (v: unknown) =>
    typeof v === "number" && v > 0 ? applyRatio(v, ratio) : v;

  const out: Record<string, unknown> = { ...valuation };
  // 파트별 실지거래가액(§97①1호) · 파트별 직접 귀속 필요경비
  for (const k of [
    "landAcquisitionPrice",
    "buildingAcquisitionPrice",
    "landDirectExpenses",
    "buildingDirectExpenses",
    // 자산 단위 나목(§97②2호) — swap 비교 대상
    "capitalExpenditure",
    "transferExpense",
    // 일괄 취득가액·필요경비 (증축 경로 원건물분)
    "bundledAcquisitionPrice",
    "bundledExpenses",
  ]) {
    if (out[k] !== undefined) out[k] = scale(out[k]);
  }
  // 증축 **실가** 2필드만 — 기준시가 2필드는 물건-수준이라 건드리지 않는다.
  const ext = out.extensionInfo as Record<string, unknown> | undefined;
  if (ext) {
    out.extensionInfo = {
      ...ext,
      ...(ext.actualAcquisitionPrice !== undefined
        ? { actualAcquisitionPrice: scale(ext.actualAcquisitionPrice) }
        : {}),
      ...(ext.actualExpenses !== undefined
        ? { actualExpenses: scale(ext.actualExpenses) }
        : {}),
    };
  }
  return out;
}

export interface GeneralBuildingSharePayloadOut {
  shareId: string;
  shareLabel: string;
  ownershipRatio: number;
  acquisitionDate: string;
  valuation: Record<string, unknown>;
}

/**
 * 지분 배열을 만든다. 조건 미충족 시 `undefined` — 그러면 기존 경로가 그대로 돈다(회귀 0).
 *
 * 진입 조건: **전 자산이 fractional** + primary가 일반건물 + 자산 2건 이상.
 */
export function buildGeneralBuildingShares(
  assets: AssetForm[],
  transferDate: string,
): GeneralBuildingSharePayloadOut[] | undefined {
  const primary = assets[0];
  if (!primary || assets.length < 2) return undefined;
  if (primary.assetKind !== "general_building") return undefined;
  if (!isFullFractionalBundle(assets)) return undefined;

  const out: GeneralBuildingSharePayloadOut[] = [];
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const ratio = getOwnershipRatio(asset);
    // 물건-수준 병합 → GB payload 생성 → 지분율 스케일 (순서 고정)
    const merged = mergeGbPropertyLevel(asset, primary);
    const valuation = buildGeneralBuildingValuation(merged, transferDate) as
      | Record<string, unknown>
      | undefined;
    if (!valuation) return undefined; // 필수값 미충족 — validate가 먼저 막는다
    const scaled = applyShareScale(valuation, ratio);

    out.push({
      shareId: asset.assetId,
      shareLabel: asset.assetLabel || `지분 ${i + 1}`,
      ownershipRatio: ratio,
      // 토지 취득일 (M-1a). 분리 OFF면 건물 취득일과 같다.
      acquisitionDate: asset.landAcquisitionDate || asset.acquisitionDate,
      // 자본적지출·양도비는 `valuation` 안에 있고 `applyShareScale`이 이미 × r 했다.
      valuation: scaled,
    });
  }
  return out;
}
