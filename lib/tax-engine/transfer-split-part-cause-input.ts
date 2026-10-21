/**
 * 엔진 입력(`TransferTaxInput`) → 토지 파트 취득원인 leaf 사실(`SplitPartCauseFacts`) — 순수 어댑터.
 *
 * `calcSplitGain`(진입 게이트)과 파트 이월과세 해결자(`transfer-tax-split-carryover.ts`, 입구 검사)가 **같은 사실**로
 * 같은 leaf(`collectSplitPartCauseIssues`)를 부른다. 둘이 따로 조립하면 한쪽에만 규칙이 걸린다(⑧≡⑫≡엔진 공유 원칙).
 */
import type { TransferTaxInput } from "./types/transfer.types";
import type { SplitPartCauseFacts } from "./transfer-split-part-cause";
import { deriveLegacyAcqMode } from "./transfer-tax-split-acq-price";
import type { PartAcqMode } from "./transfer-tax-split-acq-price";

/** YYYY-MM-DD — Date·문자열 모두. */
export function dayKey(d: Date | string | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10);
}

export function splitPartCauseFactsOfInput(input: TransferTaxInput): SplitPartCauseFacts {
  // 파트별 모드 조기 파생 — PHD 게이트 판정용(혼합 모드 시 오발동 방지).
  const earlyLandMode: PartAcqMode = input.landAcqMode ?? deriveLegacyAcqMode(input);
  const earlyBuildingMode: PartAcqMode = input.buildingAcqMode ?? deriveLegacyAcqMode(input);
  return {
    // 호출부(`calcSplitGain`)는 주택·건물만 이 함수를 부른다. 해결자는 다른 자산에 실린 파트 이월과세를 stray로 막는다.
    isSplitable: input.propertyType === "housing" || input.propertyType === "building",
    hasLandAcquisitionDate: !!input.landAcquisitionDate,
    landAcquisitionCause: input.landAcquisitionCause,
    hasLandDecedentAcquisitionDate: !!input.landDecedentAcquisitionDate,
    landMode: earlyLandMode,
    // ④ payload를 Route 변환 없이 엔진에 바로 넣는 호출부(테스트)도 있다 — 날짜 문자열도 받는다(`mixed-use-acq-date.ts` 같은 규약).
    landAcquisitionDate: dayKey(input.landAcquisitionDate as Date | string | undefined),
    buildingAcquisitionCause: input.acquisitionCause,
    selfOwns: input.selfOwns,
    isBurdenedGift: input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift",
    hasPreHousingDisclosure: !!input.preHousingDisclosure,
    hasFamilyBusinessInheritance: !!input.familyBusinessInheritance,
    landSec164Value: input.landSec164Value,
    isPartialAreaTransfer: input.isPartialAreaTransfer,
    // D2-4 — 건물 상속·증여 §163⑨ 단서 2호(단독·다가구주택만). 주택 여부는 엔진 입력의 자산 종류에서 읽는다.
    isHousing: input.propertyType === "housing",
    buildingHouseKind: input.buildingHouseKind,
    buildingSec164Value: input.buildingSec164Value,
    // 비주택 건물 2001.1.1.~2005.4.29. 상속·증여 — 일괄 고시 오피스텔·상업용 건물인가(아니면 단서 2호 구간 밖)
    buildingBundledStdPrice: input.buildingBundledStdPrice,
    // D1-H — 주택 부수토지 단서 2호(받을 당시 주택 있음 · 토지 몫 ②). 주택 구분은 위 `buildingHouseKind`를 같이 쓴다.
    landHouseExisted: input.landHouseExisted,
    landHouseSec164Value: input.landHouseSec164Value,
    // 주택별 최초공시일 — D2-4·D1-H 구간의 끝(공동주택이 아니면 2005-04-30을 대신한다).
    houseFirstDisclosureDate: input.houseFirstDisclosureDate,
    // D2 — 건물 상속·증여 + 토지 매매. 자산 단위 평가 payload는 호출 시점 입력에서 읽는다(STEP 0.45는 필드를 지우지 않는다).
    buildingMode: earlyBuildingMode,
    buildingAcquisitionDate: dayKey(input.acquisitionDate as Date | string | undefined),
    hasAssetLevelAcquisitionValuation: !!(
      input.inheritedAcquisition || input.inheritedHouseValuation || input.pre1990Land || input.commercialInheritanceValuation
    ),
    hasBuildingAcquisitionPrice: (input.buildingAcquisitionPrice ?? 0) > 0,
    hasLandAcquisitionPrice: (input.landAcquisitionPrice ?? 0) > 0,
    // P1 파트 이월과세 — 엔진 입력의 서브객체 존재가 와이어 `*CarryoverPart` 존재와 같은 사실이다(⑭ 합성기가 1:1로 옮긴다).
    hasLandCarryover: !!input.landCarryoverTaxation,
    hasBuildingCarryover: !!input.buildingCarryoverTaxation,
    // 자산 단위 이월과세는 취득원인이 이월과세일 때만 엔진이 읽는다(`transfer-tax-precalc.ts` STEP 0.475 게이트). 원인이 다르면 서브객체는 무시되는 잔재다.
    hasTopLevelCarryover: !!input.carryoverTaxation,
    // 엔진은 호스트를 가리지 않는다 — 컴패니언·다건은 ⑫가 입구에서 막아 파트 서브객체가 엔진에 닿지 않는다(생략 = 받는다).
    carryoverGiftDate: dayKey(input.carryoverGiftEvent?.giftRegistryDate),
    hasLegacyExpenses: (input.expenses ?? 0) > 0,
  };
}
