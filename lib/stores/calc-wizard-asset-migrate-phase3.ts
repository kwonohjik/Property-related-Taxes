/**
 * migrateAsset Phase 3 normalize 헬퍼 — calc-wizard-asset-factory.ts 800줄 정책 분리 (2026-06-15).
 *
 * 포함 내용:
 * - 부담부증여 transferType 마이그레이션 (Phase 2, 2026-05-12)
 * - 증여세 통합 + 사전증여 5필드 fallback (Phase 3, 2026-05-12)
 * - 매매사례가액(추계) 신규 필드 fallback (§176의2③1호, 2026-06-15)
 */

/**
 * M-1a — 일반건물 취득일 규약을 split(주택·건물)과 **일치**시킨다 (2026-08-05).
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §3.2
 *
 * 종전 일반건물은 `acquisitionDate` = **토지**, `gbBuildingAcquisitionDate` = **건물**이었고
 * split은 정반대(`acquisitionDate` = 건물, `landAcquisitionDate` = 토지)였다. 같은 필드가
 * 자산유형에 따라 반대를 뜻해, 일반건물에 분리 입력을 열면 두 날짜가 뒤바뀐 채 계산된다.
 *
 * ## ⛔ 자산유형 게이트가 필수다
 *
 * `gbBuildingAcquisitionDate`는 factory 공통 기본값이라 **주택·상가 등 모든 자산**에도 `""`로
 * 저장돼 있다. 키 존재만 트리거로 삼으면 주택 자산의 `acquisitionDate`(=건물)를 토지 칸으로
 * 옮겨 split 규약을 깨뜨린다 — 반드시 `assetKind === "general_building"`에서만 스왑한다.
 *
 * ## 멱등
 *
 * 키 삭제가 유일한 근거다. 삭제를 빠뜨리면 재실행 때 토지↔건물이 다시 스왑된다.
 * anchor: `__tests__/calc/gb-acquisition-date-convention.anchor.test.ts` A-9
 */
function migrateGbAcquisitionDateConvention(a: Record<string, unknown>): void {
  if (!("gbBuildingAcquisitionDate" in a)) return; // 이미 전환됨 → no-op

  const legacyBuildingDate = (a.gbBuildingAcquisitionDate as string) || "";
  delete a.gbBuildingAcquisitionDate; // 멱등의 근거 — 반드시 스왑 여부와 무관하게 삭제

  if (a.assetKind !== "general_building") return; // 타 자산유형은 이미 split 규약

  const legacyLandDate = (a.acquisitionDate as string) || "";
  a.landAcquisitionDate = legacyLandDate;
  a.acquisitionDate = legacyBuildingDate || legacyLandDate;
  // 두 날짜가 실제로 다를 때만 분리 입력으로 승격한다(같으면 「같음」 모드가 정상).
  a.hasSeperateLandAcquisitionDate =
    !!legacyLandDate && !!legacyBuildingDate && legacyLandDate !== legacyBuildingDate;
}

/**
 * 일반건물(general_building) 취득원인·증축·용도변경 normalize — factory 800줄 정책 분리.
 * a는 Record<string, unknown>으로 mutate되는 raw 객체.
 */
export function migrateGeneralBuildingFields(a: Record<string, unknown>): void {
  if (a.gbIsMetropolitan === undefined) a.gbIsMetropolitan = false;
  // 2026-08-11 개명(`gbIsUnregistered` → `gbUnapprovedBuilding`) — 구 세션 값 이전.
  // 「지방세법 시행령」 §101① 단서 축이지 §104③ 미등기양도자산이 아니다.
  if (a.gbUnapprovedBuilding === undefined) {
    a.gbUnapprovedBuilding = a.gbIsUnregistered ?? false;
  }
  delete a.gbIsUnregistered;
  // §104③ 미등기양도자산 2필드 — stale sessionStorage 가드. 없으면 undefined가 그대로
  // payload에 실려 Zod optional을 통과하고, 엔진이 등기 자산으로 처리한다(종전 동작 = 안전측).
  if (a.gbLandUnregistered === undefined) a.gbLandUnregistered = false;
  if (a.gbBuildingUnregistered === undefined) a.gbBuildingUnregistered = false;
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
  if (a.assetKind === "general_building") {
    // acquisitionCause 중 건물 카드에 허용된 원인이면 그대로 사용
    const ac = a.acquisitionCause as string;
    // "carryover_gift"는 건물 카드 미지원 → "purchase" fallback
    const fromLand = validBuildingCauses.includes(ac) ? ac : "purchase";
    const current = a.gbBuildingAcquisitionCause as string | undefined;
    const isSeparate = a.hasSeperateLandAcquisitionDate === true;

    if (!current || !validBuildingCauses.includes(current)) {
      // M-2 (종전): 미입력·무효값이면 토지 원인을 복사한다 — 잃을 값이 없다.
      a.gbBuildingAcquisitionCause = fromLand;
    } else if (!isSeparate && current !== fromLand) {
      /**
       * M-2b **분리 OFF + 취득원인 불일치 → 되맞추지 않고 분리를 켠다** (2026-08-07).
       *
       * 종전 UI는 분리 OFF에서도 토지·건물 취득원인 라디오를 각각 그려서 「토지 상속 + 건물
       * 매매」 같은 조합을 저장할 수 있었다. OFF가 **단일 취득원인 카드**가 된 뒤로는 그 상태를
       * 화면에 표현할 방법이 없다 — 라디오는 `acquisitionCause`만 보여주므로 **저장값과 화면이
       * 어긋난 채 payload를 가른다**(`transfer-tax-api-gb.ts:487`이 건물 축을 그대로 싣는다).
       *
       * 🔴 **되맞추면(건물 원인을 토지 원인으로 덮으면) 안 된다.** 그것은 사용자가 저장한 사실을
       *    조용히 바꾸는 것이고, 「토지 상속 + 건물 매매」를 「둘 다 상속」으로 만들어 **취득가액
       *    산정 자체를 바꾼다**. 실제로 그 구현은 부분 상속 가드(`transfer-tax-validate-gb.ts:145`
       *    V-5)를 무력화시켰다 — E2E `general-building-partial-inheritance` PI-4가 잡았다.
       *
       * ⇒ 값을 보존하고 **분리를 켠다**. 그러면 두 원인이 화면에 그대로 나타나고, 파트별 취득가액
       *   칸이 열려 V-7이 각 파트를 요구한다 — V-5가 원래 안내하던 「토글을 켜고 파트별로
       *   입력하세요」를 마이그레이션이 대신 해주는 셈이다.
       *
       * 신축도 같은 규칙이다(UI의 Q4와 동일) — 「신축 + 취득일 같음」은 물리적으로 모순이므로
       * 분리가 켜지는 것이 사실에 맞다.
       */
      a.hasSeperateLandAcquisitionDate = true;
    }
  }
  migrateGbAcquisitionDateConvention(a);
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
  // §163⑨ 상속 취득가액 직접 산정 (Phase 1) — 구 세션 복원 방어
  if (a.gbBuildingInheritedValue === undefined) a.gbBuildingInheritedValue = "";
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
  // ③ §114조의2 Phase2: 증축부분 바닥면적 합계 (85㎡ 게이트용) — 구 세션 복원 방어
  if (a.gbExtensionFloorArea85 === undefined) a.gbExtensionFloorArea85 = "";
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
  // 이월과세 §97의2 「당초 증여자」 한 벌 (D-7b) — stale sessionStorage 가드
  // (신규 필드는 옛 저장분에 없으므로 undefined로 도착한다 — CurrencyInput이 uncontrolled로
  //  전환되는 것을 막으려면 빈 문자열로 채워야 한다. memory `feedback_new_asset_field_stale_sessionstorage_guard`)
  if (a.bgCoDonorLandStdPriceAtAcq === undefined) a.bgCoDonorLandStdPriceAtAcq = "";
  if (a.bgCoDonorBuildingStdPriceAtAcq === undefined) a.bgCoDonorBuildingStdPriceAtAcq = "";
  if (a.bgCoDonorActualAcquisitionLand === undefined) a.bgCoDonorActualAcquisitionLand = "";
  if (a.bgCoDonorActualAcquisitionBuilding === undefined) a.bgCoDonorActualAcquisitionBuilding = "";
  if (a.bgCoDonorActualAcquisitionTotal === undefined) a.bgCoDonorActualAcquisitionTotal = "";
  if (a.bgCoDonorMarketValueAtAcquisition === undefined) a.bgCoDonorMarketValueAtAcquisition = "";
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
