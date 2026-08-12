/**
 * 부담부증여 ④ 「증여재산 평가」 상속·증여 건물 기준시가 계산기 — 런처 사양(단일 출처).
 *
 * ⚠️ **주입 규칙이 자산 종류마다 반대다.** 계산기는 건물분(`standardPrice`)과 부수토지
 * (`landStandardPrice`)를 **따로** 내주는데, ④ 필드가 무엇의 자리인지가 자산마다 다르다:
 *
 *  · `general_building` — ④는 **건물분 단독**. 토지분은 `gbTransferLandPricePerSqm × gbLandArea`로
 *    이미 별도 산출된다(`transfer-tax-api-burdened-gift.ts:169-180`). 합치면 **토지 이중계상**.
 *  · `building`         — ④는 **토지+건물 통합 총액**. API가 `landStdPriceAtTransfer = 0`으로 두고
 *    `standardPriceAtTransfer` 한 값에 통째로 싣기 때문이다(같은 파일 :205-214).
 *    합치지 않으면 **부수토지가 통째로 누락**된다.
 *
 * 두 실수 모두 화면에 아무 오류를 띄우지 않으므로, 분기를 호출부에 흩지 않고 여기 한 곳에 둔다.
 * anchor: `__tests__/calc/burdened-gift-std-price-launcher.anchor.test.ts`
 *
 * ## 대상에서 제외한 자산과 근거(법제처 본문 확인 2026-08-12)
 *
 *  · `commercial_building` — 「상속세 및 증여세법」 제61조 제1항 **제3호**: 오피스텔·상업용 건물
 *    (이들에 딸린 토지를 포함한다)은 국세청장이 **토지와 건물에 대하여 일괄하여** 산정·고시한
 *    가액으로 평가한다. 같은 항 제2호(건물)가 제3호를 명시 제외하므로 계산 대상이 아니다.
 *  · `housing`            — 같은 항 **제4호**: 개별주택가격·공동주택가격이 평가액이다.
 *  · `land`               — 건물이 없다.
 *
 * 설계: docs/02-design/features/burdened-gift-valuation-std-price-calculator.plan.md §3·§4.1
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export interface BgGiftStdPriceLauncherSpec {
  /** 모달 prefill — 건물 연면적(㎡) */
  floorArea: string;
  /** 모달 prefill — 부수토지 면적(㎡) */
  landAreaM2: string;
  /**
   * 모달 prefill — 평가기준일(=증여일=양도일) 당시 ㎡당 개별공시지가.
   *
   * 상증 평가와 양도세가 **같은 필지·같은 시점**을 보므로 자산 폼의 양도시 공시지가를 그대로
   * 쓴다. 빈 값이면 모달의 조회 필드(`LandPriceLookupField`)로 사용자가 조회한다.
   */
  landPricePerSqm: string;
  /**
   * 계산기 결과 → ④ 필드 값. 자산별 주입 규칙의 단일 구현.
   * @param buildingStd 계산기가 낸 건물 기준시가(원)
   * @param landStd 계산기가 낸 부수토지 평가액(원). 모달에서 토지 입력이 없으면 undefined
   */
  compose: (buildingStd: number, landStd?: number) => number;
  /** ④ 값이 부수토지를 포함해야 하는 자산인가 — UI 안내 노출 판정 */
  needsAppurtenantLand: boolean;
}

/**
 * ④ 상속·증여 계산기 런처 사양. 대상 자산이 아니면 null(런처 미노출).
 */
export function bgGiftStdPriceLauncherSpec(
  asset: Pick<
    AssetForm,
    | "assetKind"
    | "gbBuildingArea"
    | "gbLandArea"
    | "gbTransferLandPricePerSqm"
    | "buildingFloorArea"
    | "transferArea"
    | "standardPricePerSqmAtTransfer"
  >,
): BgGiftStdPriceLauncherSpec | null {
  if (asset.assetKind === "general_building") {
    return {
      /**
       * ⚠️ **전체 연면적**(`gbBuildingArea`)이다 — 양도세용 GB 계산기 3곳이 쓰는
       * `gbBuildingStdPriceFloorArea()`(= `gbOriginalBuildingArea || gbBuildingArea`, **원건물분**)가
       * 아니다. 양도세는 증축분을 별도 계산서(`-gb-ext-*`)로 분리하지만(소령 §162①4호 —
       * 증축분 취득시점 = 증축일), 증여재산 평가는 **시점이 증여일 하나**뿐이고 그 시점에는
       * 원건물·증축분이 한 덩어리로 존재한다. ⛔ 「다른 GB 런처와 통일」 금지.
       */
      floorArea: asset.gbBuildingArea,
      landAreaM2: asset.gbLandArea,
      // GB의 양도시 토지 공시지가 — 안분 분모 산정에 쓰는 값과 같은 필드다(단일 소스)
      landPricePerSqm: asset.gbTransferLandPricePerSqm,
      compose: (b) => b,
      needsAppurtenantLand: false,
    };
  }
  if (asset.assetKind === "building") {
    return {
      /** 나목 건물분 연면적은 축 B(`AssetAreaSection.tsx:129`). */
      floorArea: asset.buildingFloorArea,
      /**
       * 축 A = 토지 면적. `building`은 areaScenario가 `same` 단일이라 한 칸이
       * `acquisitionArea`·`transferArea`를 함께 기록한다(`AssetAreaSection.tsx:331-335`).
       */
      landAreaM2: asset.transferArea,
      // `building`은 통합 「양도시 기준시가」 카드의 ㎡당 단가를 그대로 쓴다
      // (`AssetSectionTransfer.tsx:40` — `standardPricePerSqmAtTransfer`)
      landPricePerSqm: asset.standardPricePerSqmAtTransfer,
      compose: (b, land) => b + (land ?? 0),
      needsAppurtenantLand: true,
    };
  }
  return null;
}
