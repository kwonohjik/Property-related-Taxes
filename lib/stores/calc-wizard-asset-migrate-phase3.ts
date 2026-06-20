/**
 * migrateAsset Phase 3 normalize 헬퍼 — calc-wizard-asset-factory.ts 800줄 정책 분리 (2026-06-15).
 *
 * 포함 내용:
 * - 부담부증여 transferType 마이그레이션 (Phase 2, 2026-05-12)
 * - 증여세 통합 + 사전증여 5필드 fallback (Phase 3, 2026-05-12)
 * - 매매사례가액(추계) 신규 필드 fallback (§176의2③1호, 2026-06-15)
 */

/**
 * 일반건물(general_building) 취득원인·증축·용도변경 normalize — factory 800줄 정책 분리.
 * a는 Record<string, unknown>으로 mutate되는 raw 객체.
 */
export function migrateGeneralBuildingFields(a: Record<string, unknown>): void {
  if (a.gbIsMetropolitan === undefined) a.gbIsMetropolitan = false;
  if (a.gbIsUnregistered === undefined) a.gbIsUnregistered = false;
  // ── 일반건물 건물 취득원인 마이그레이션 (M-1·M-2, 사례 32 이후 PR) ──
  // M-1: legacy gbIsSelfBuilt=true → gbBuildingAcquisitionCause="newConstruction" 자동 변환 후 삭제
  if ((a as Record<string, unknown>).gbIsSelfBuilt === true) {
    if (a.gbBuildingAcquisitionCause === undefined) {
      a.gbBuildingAcquisitionCause = "newConstruction";
    }
  }
  delete (a as Record<string, unknown>).gbIsSelfBuilt;
  // M-2: general_building + gbBuildingAcquisitionCause 미입력 시 acquisitionCause 값 복사
  // (사례 31 호환 데이터: 단일 취득원인이었던 경우 건물도 같은 원인으로 추정)
  const validBuildingCauses = ["purchase", "inheritance", "gift", "newConstruction"];
  if (
    a.assetKind === "general_building" &&
    (!a.gbBuildingAcquisitionCause ||
      !validBuildingCauses.includes(a.gbBuildingAcquisitionCause as string))
  ) {
    // acquisitionCause 중 건물 카드에 허용된 원인이면 그대로 사용
    const ac = a.acquisitionCause as string;
    // "carryover_gift"는 건물 카드 미지원 → "purchase" fallback
    if (validBuildingCauses.includes(ac)) {
      a.gbBuildingAcquisitionCause = ac;
    } else {
      a.gbBuildingAcquisitionCause = "purchase";
    }
  }
  if (a.gbBuildingAcquisitionDate === undefined) a.gbBuildingAcquisitionDate = "";
  // ③ 사례 33 일괄 모드: 토지·건물 일괄 취득 시 필요경비 (신규 필드 — bundledExpenses 분리, 2026-05-11)
  if (a.gbBundledAcquisitionExpenses === undefined) a.gbBundledAcquisitionExpenses = "";
  // ③ 사례 33: 증축 필드 마이그레이션 (sessionStorage 호환 — 신규 필드 누락 보호)
  // normalize 책임: 저장→로드 시 누락 필드 초기화.
  // onChange 책임(별도): 토글 OFF 시 폼 상태 유지 (재토글 ON 복원). normalize 아님.
  if (a.gbHasExtension === undefined) a.gbHasExtension = false;
  if (a.gbExtensionDate === undefined) a.gbExtensionDate = "";
  if (a.gbExtensionArea === undefined) a.gbExtensionArea = "";
  if (a.gbTransferExtensionBuildingStdPrice === undefined) a.gbTransferExtensionBuildingStdPrice = "";
  if (a.gbAcquisitionExtensionBuildingStdPrice === undefined) a.gbAcquisitionExtensionBuildingStdPrice = "";
  if (a.gbExtensionAcquisitionCause === undefined) a.gbExtensionAcquisitionCause = "newConstruction";
  // ③ 사례 33 확장: gbExtensionAcquisitionMode + 실가 2필드 마이그레이션
  if (a.gbExtensionAcquisitionMode === undefined) a.gbExtensionAcquisitionMode = "estimated";
  if (a.gbExtensionActualAcquisitionPrice === undefined) a.gbExtensionActualAcquisitionPrice = "";
  if (a.gbExtensionActualExpenses === undefined) a.gbExtensionActualExpenses = "";
  // ── 사례 35: 주택→상가 용도변경 normalize (강제 초기화 금지 — null=미선택 보존) ──
  if (a.gbHouseToCommercialConversion === undefined) a.gbHouseToCommercialConversion = false;
  if (a.gbConversionDate === undefined) a.gbConversionDate = "";
  if (a.gbWasMultiHouseAtConversion === undefined) a.gbWasMultiHouseAtConversion = null;
  // 사례 35 후속-1
  if (a.gbHasFirstDisclosure === undefined) a.gbHasFirstDisclosure = false;
  if (a.gbFirstDisclosurePrice === undefined) a.gbFirstDisclosurePrice = "";
  if (a.gbFirstDisclosureLandStdPrice === undefined) a.gbFirstDisclosureLandStdPrice = "";
  if (a.gbFirstDisclosureBuildingStdPrice === undefined) a.gbFirstDisclosureBuildingStdPrice = "";
  // gbHasExtension=false 인 legacy 데이터에 나머지 필드가 잘못 저장된 경우 정리
  // (신규 데이터에서는 발생하지 않으나 구형 마이그레이션 방어)
  if (a.gbHasExtension === false) {
    a.gbExtensionDate = "";
    a.gbExtensionArea = "";
    a.gbTransferExtensionBuildingStdPrice = "";
    a.gbAcquisitionExtensionBuildingStdPrice = "";
    a.gbExtensionAcquisitionCause = "newConstruction";
    a.gbExtensionAcquisitionMode = "estimated";
    a.gbExtensionActualAcquisitionPrice = "";
    a.gbExtensionActualExpenses = "";
  }
  // gbExtensionAcquisitionMode === "estimated" 시 실가 2필드 reset (정합성)
  if (a.gbExtensionAcquisitionMode === "estimated") {
    a.gbExtensionActualAcquisitionPrice = "";
    a.gbExtensionActualExpenses = "";
  }
}

/**
 * migrateAsset의 마지막 Phase 3 정규화 단계.
 * a는 Record<string, unknown>으로 mutate되는 raw 객체.
 */
export function applyPhase3Normalize(a: Record<string, unknown>): void {
  // ── 부담부증여 transferType 마이그레이션 (Phase 2, 2026-05-12) ──
  // legacy: acquisitionCause === "burdened_gift" → transferType === "burdened_gift" 로 이전.
  // 의미: "취득원인" 라디오에 끼워둔 burdened_gift는 양도 시점의 거래 형태로 이동.
  // 당초 취득은 "증여"로 추정(보수적 fallback) — 사용자가 매매·상속 등 정확한 원인으로 재입력 가능.
  if (a.transferType === undefined || a.transferType === null) {
    if (a.acquisitionCause === "burdened_gift") {
      a.transferType = "burdened_gift";
      a.acquisitionCause = "gift"; // 보수적 fallback (사용자 재입력 권장)
    } else {
      a.transferType = "regular";
    }
  }
  // ── Phase 3 (2026-05-12) — 증여세 통합 + 사전증여 5필드 fallback ──
  // 이전 세션 sessionStorage rehydrate 시 신규 필드가 undefined여서 콘솔 에러 또는 빈 폼 렌더 위험.
  if (a.bgDonorRelation === undefined) a.bgDonorRelation = "";
  if (a.bgIsMinorDonee === undefined) a.bgIsMinorDonee = false;
  if (a.bgIsGenerationSkip === undefined) a.bgIsGenerationSkip = false;
  if (a.bgIsFiledOnTime === undefined) a.bgIsFiledOnTime = true;
  if (!Array.isArray(a.bgPriorGifts)) a.bgPriorGifts = [];
  if (a.bgGiftBuildingStdPriceAtTransfer === undefined) a.bgGiftBuildingStdPriceAtTransfer = "";
  // K-4/K-5 취득가액 산정방식 (시가 모드) — 신규 4필드 fallback
  if (a.bgAcquisitionMethod === undefined) a.bgAcquisitionMethod = "";
  if (a.bgActualAcquisitionLand === undefined) a.bgActualAcquisitionLand = "";
  if (a.bgActualAcquisitionBuilding === undefined) a.bgActualAcquisitionBuilding = "";
  if (a.bgActualAcquisitionTotal === undefined) a.bgActualAcquisitionTotal = "";
  // 가업상속공제 §97의2④ — 미사용이면 undefined 유지 (3중 패턴: factory=undefined)
  if (a.familyBusinessInheritance === null) a.familyBusinessInheritance = undefined;
  // ── 매매사례가액(추계) 신규 필드 fallback (소령 §176의2③1호, 2026-06-15) ──
  // isSalesCaseAcquisition: 3중 배타 모드 플래그 — 미입력 시 false(실거래가 모드)
  if (a.isSalesCaseAcquisition === undefined) a.isSalesCaseAcquisition = false;
  // similarSalesValue: 매매사례가액 원화 문자열 — 미입력 시 빈 문자열
  if (a.similarSalesValue === undefined) a.similarSalesValue = "";
  // similarSalesSource: RTMS 자동조회 출처 배지 — 미입력 시 undefined (배지 미표시)
  if (a.similarSalesSource === null) a.similarSalesSource = undefined;
  // acquisitionSigunguCode: 취득 주소 시군구코드 — 미입력 시 빈 문자열
  if (a.acquisitionSigunguCode === undefined) a.acquisitionSigunguCode = "";
}
