/**
 * ④ 일반건물(토지+건물 일괄) API 변환 헬퍼 (소령 §176의2②, §163⑥, §166⑥, §163⑨).
 *
 * `transfer-tax-api-helpers.ts` 800줄 정책에 따라 GB 전용 변환(buildExtensionInfo·
 * buildGeneralBuildingValuation)을 분리. 함수 로직 변경 없이 순수 추출 + §163⑨ 상속 게이트.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { partAcquisitionDates, effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
// §163⑨ 단서 게이트 — 상가 경로와 **같은 상수·같은 술어**를 쓴다(경계가 갈리면 조문 하나에 두 정책이 된다).
import { LAND_PRICE_NOTICE_START } from "./transfer-pre1990-commercial-bridge";
import { isBeforeBuildingStdPriceNotice } from "./commercial-164-6-proviso";
import { effectiveGbLandPriceAtAcq } from "./transfer-pre1990-gb-bridge";
import { buildGbCarryoverPayload } from "./transfer-tax-api-gb-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

// ─── ④ 사례 33: 증축 extensionInfo 서브객체 변환 헬퍼 ───

/**
 * AssetForm gbExtension* 필드 → extensionInfo 서브객체 변환.
 * gbHasExtension=false 시 undefined 반환.
 * gbHasExtension=true 시 필수 필드 누락은 validate 단계에서 이미 차단됨.
 * → 이 함수에서 undefined 폴백 대신 fail-fast throw (silent 회귀 차단).
 *
 * defensive 아닌 fail-fast — 이 throw에 도달하면 validate 우회 버그.
 * 사례 31 동작으로 silent 회귀하는 경로를 조기에 발각.
 * (자동 안분 fallback 금지 정책 — feedback_no_silent_apportion_fallback.md)
 */
function buildExtensionInfo(
  asset: AssetForm,
): object | undefined {
  if (!asset.gbHasExtension) return undefined;

  const extensionDate = asset.gbExtensionDate || undefined;
  const extensionArea = parseDecimal(asset.gbExtensionArea); // 선택 필드 — 0이면 미전달
  const extensionCause = asset.gbExtensionAcquisitionCause;

  // 취득방식 결정: 빈 문자열은 "estimated" fallback (validate에서 이미 검증됨)
  const mode: "actual" | "estimated" =
    asset.gbExtensionAcquisitionMode === "actual" ? "actual" : "estimated";

  // gbHasExtension=true + 공통 필수 필드 누락 → validate 우회 — fail-fast throw
  if (!extensionDate || !extensionCause) {
    throw new Error(
      `[buildExtensionInfo] gbHasExtension=true이지만 필드 누락 — validate 단계에서 차단되어야 함 (asset.assetId=${asset.assetId})`
    );
  }

  // §114조의2① 85㎡ 게이트: newConstruction 시만 전달. 미입력(0) → 85㎡ 이하 처리로 가산세 미발동.
  const extensionFloorArea85 =
    extensionCause === "newConstruction"
      ? parseDecimal(asset.gbExtensionFloorArea85) || undefined
      : undefined;

  // 공통 base 필드
  const base = {
    extensionDate,                               // string — route handler에서 toOptionalDate 변환 (⑭)
    ...(extensionArea ? { extensionArea } : {}), // 선택 필드: 미입력 시 미전달
    extensionAcquisitionCause: extensionCause,
    acquisitionMode: mode,
    ...(extensionFloorArea85 ? { extensionFloorArea85 } : {}),
  };

  if (mode === "estimated") {
    const transferExtStdPrice = parseAmount(asset.gbTransferExtensionBuildingStdPrice);
    const acqExtStdPrice = parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice);
    if (!transferExtStdPrice || !acqExtStdPrice) {
      throw new Error(
        `[buildExtensionInfo] 환산 모드 stdPrice 누락 — validate 단계에서 차단되어야 함 (asset.assetId=${asset.assetId})`
      );
    }
    return {
      ...base,
      transferExtensionBuildingStdPrice: transferExtStdPrice,
      acquisitionExtensionBuildingStdPrice: acqExtStdPrice,
    };
  }

  // mode === "actual"
  const actualAcq = parseAmount(asset.gbExtensionActualAcquisitionPrice);
  if (!actualAcq) {
    throw new Error(
      `[buildExtensionInfo] 실가 모드 actualAcquisitionPrice 누락 — validate 단계에서 차단되어야 함 (asset.assetId=${asset.assetId})`
    );
  }
  return {
    ...base,
    actualAcquisitionPrice: actualAcq,
    actualExpenses: parseAmount(asset.gbExtensionActualExpenses) || 0,
  };
}

// ─── ④ 일반건물(토지+건물 일괄) API 변환 헬퍼 (소령 §176의2②, §163⑥, §166⑥) ───

/**
 * AssetForm gb* 필드 → generalBuildingValuation 서브객체 변환.
 *
 * 환산취득가 모드: 취득시 기준시가 포함 — 엔진이 환산·개산공제 계산.
 * 실거래가/감정가 모드: 양도시 기준시가만 — route helper가 §166⑥ 비율로 실거래가 안분 + NBL 판정.
 *   → actualPriceMode: true 플래그로 route helper 분기.
 *
 * 상속(§163⑨): 상속개시일 평가액을 취득당시 실지거래가액으로 직접 배정(환산·개산공제 미적용).
 *   Phase 1 = C1(토지·건물 모두 상속, actual 모드). 게이트 acquisitionByInheritance로 격리.
 *
 * 자동 안분 fallback 금지 — 미입력은 validate에서 명확한 오류로 차단.
 */
/**
 * 구분양도(§100②) 3필드 — 환산·실가 **양 경로 공통**(계획서 §6 ④).
 *
 * 게이트는 split 경로와 같다(`transfer-tax-api-split.ts` `saleDirectActive`) —
 * 「기준시가 비율 안분」으로 되돌린 뒤 잔존한 입력값을 사용자 의도와 다르게 전송하지 않는다.
 *
 * ⚠️ 엔진이 읽는 실제 스위치는 **값의 유무**다(`allocateBundledTransferPrice`). `saleSplitMode`는
 *    전송하지 않는다 — 엔진이 읽지 않는 플래그를 나르면 「죽은 모드」가 다시 생긴다(계획서 Q-7).
 */
function saleSplitFields(asset: AssetForm): Record<string, unknown> {
  if (asset.saleSplitMode !== "actual") return {};
  return {
    landTransferPrice: parseAmount(asset.landTransferPrice) || undefined,
    buildingTransferPrice: parseAmount(asset.buildingTransferPrice) || undefined,
    ...(asset.saleSplitExemption ? { saleSplitExemption: asset.saleSplitExemption } : {}),
  };
}

/**
 * 양도시 **감정평가가액** 3필드 — 안분 basis 서열 1순위(부가령 §64①1호 단서).
 *
 * ⚠️ `saleSplitFields`와 달리 **모드 게이트가 없다** — 일괄양도의 안분 basis이자 구분양도의
 *    30% 비교 대상이라 양쪽에서 쓰인다. 구분양도로 좁히면 일괄에서 감정가액이 조용히 무시된다.
 */
function saleAppraisalFields(asset: AssetForm): Record<string, unknown> {
  return {
    landAppraisalAtTransfer: parseAmount(asset.landAppraisalAtTransfer) || undefined,
    buildingAppraisalAtTransfer: parseAmount(asset.buildingAppraisalAtTransfer) || undefined,
    appraisalDateAtTransfer: asset.appraisalDateAtTransfer || undefined,
  };
}

export function buildGeneralBuildingValuation(
  asset: AssetForm,
  /**
   * 폼-전역 양도일 — **§164④ 등급환산 파생에만** 쓴다(`effectiveGbLandPriceAtAcq`).
   *
   * 상가 `buildCommercialBuildingValuation(primary, form.transferDate)`와 같은 규약이다.
   * 생략하면 사용자가 직접 입력한 `gbAcqLandPricePerSqm`만 유효하고 등급환산 파생은 꺼진다 —
   * 프로덕션 호출부(`transfer-tax-api.ts:157`)는 항상 넘기므로 그 경로에는 영향이 없고,
   * ⑧ validate는 자체 `formTransferDate`로 같은 파생을 본다(3중 fallback 유지).
   */
  transferDate?: string,
): object | undefined {
  if (asset.assetKind !== "general_building") return undefined;

  const transferLandPricePerSqm = parseAmount(asset.gbTransferLandPricePerSqm);
  const transferBuildingStdPrice = parseAmount(asset.gbTransferBuildingValue);
  const landArea = parseDecimal(asset.gbLandArea);
  const buildingFootprintArea = parseDecimal(asset.gbBuildingFootprintArea);

  // 양도시 기준시가·면적은 모드 무관 필수 (validate에서 사전 차단)
  if (
    !transferLandPricePerSqm ||
    !transferBuildingStdPrice ||
    !landArea ||
    !buildingFootprintArea
  ) return undefined;

  const nblFields = {
    zoneType: asset.gbZoneType || undefined,
    isMetropolitan: asset.gbIsMetropolitan,
    isUnregistered: asset.gbIsUnregistered,
  };

  /**
   * §163⑨ 상속 취득가액 직접 산정 게이트.
   *
   * 🔴 **1985-01-01 하한을 제거했다** (2026-08-07). 종전 근거는 「pre-1985 상속·증여는
   *    §176조의2④ 의제취득 영역이므로 게이트를 끄고 **기존 환산 fallback**에 맡긴다」였다.
   *    원문 확인 결과 두 군데가 틀렸다:
   *
   *    ① **§163⑨에는 「의제취득일」 조건이 없다.** 조건은 「상속 또는 증여받은 자산」과
   *       단서의 「기준시가 고시 전」뿐이다(MST 286211 본문 직독).
   *    ② **§176조의2④는 나목 계열**이라 가목이 확인되면 도달하지 않는다 — 법 §97①1호 단서
   *       「가목의 실지거래가액을 **확인할 수 없는 경우에 한정하여** 나목」. §163⑨은 평가액을
   *       「실지거래가액으로 **본다**」고 하므로 가목이 확인된다. 법 §97②1호 나목의 생산자
   *       물가상승률 가산도 「**환산취득가액에 의하여** … 계산하는 경우」가 조건이다.
   *
   *    게다가 그 「환산 fallback」은 **더 이상 존재하지 않는다** — O-3(2026-08-06)이 상속·증여
   *    파트의 환산을 1985 하한 없이 차단했다(V2). 결과는 가목도 나목도 아닌 **취득가액 0**
   *    이었다(실측 1980년 상속 세액 443,235,000 · validate 통과).
   *
   *    단건 경로는 이미 가목 우선이다(`calcPreDeemed` — #1080). GB만 예외였다.
   *
   * ⚠️ **취득시기 의제(1985.1.1)는 이 축과 무관하다** — 보유기간·세율·장특공제이고,
   *    여기서 정하는 것은 취득**가액**이다.
   */
  const acquisitionByInheritance = asset.acquisitionCause === "inheritance";
  const buildingAcquisitionByInheritance = asset.gbBuildingAcquisitionCause === "inheritance";
  /**
   * §163⑨ 단서 각 호 — **미공시 시기 상속은 §164 가액과 겨룬다** (Phase 3).
   *
   * 본문은 상증법 §60~66 평가액을 취득당시 실지거래가액으로 보지만, 단서가 두 경우를 뺀다:
   *
   *   **1호** 「1990년 8월 30일 개별공시지가가 고시되기 **전에**」 상속·증여받은 **토지**
   *          → 평가액과 **제164조제4항**의 가액 중 **많은 금액**
   *   **2호** 상증법 §61①2호~4호 「건물의 기준시가가 고시되기 **전에**」 상속·증여받은 **건물**
   *          → 평가액과 **제164조제5항 내지 제7항**의 가액 중 **많은 금액**
   *
   * 일반건물의 건물분은 법 §99①1호 **나목**이므로 §164**⑤**가 정본이다
   * (⑥=오피스텔·상업용건물·공동주택, ⑦=주택). §164⑤의 가액은 곧 「취득당시의 기준시가」이고,
   * 취득연도 ≤2000이면 「건물 기준시가 계산」 모달이 **2001 지수표 × 산정기준율**로 그 값을
   * 산출한다(`building-standard-price.ts:198·214`) — 그래서 별도 축이 필요 없다.
   *
   * ⚠️ **경계가 파트마다 다르다** — 토지는 1990-08-30(일자), 건물은 취득연도 2000/2001.
   *    1995년 상속이면 **건물만** 게이트 안이다. 하나로 묶으면 그 조합에서 틀린다.
   * ⚠️ 동점은 **평가액(①)** 이다 — 금액은 같고 근거만 갈린다(`calcPostDeemed`와 같은 규약).
   * ⚠️ 게이트 밖에서는 **비교하지 않는다** — 단서는 두 경우에 한정되고, 그 밖에서 max를
   *    적용하면 본문이 정한 「평가액을 실지거래가액으로 본다」를 넘어선다.
   */
  /**
   * 🔑 **증여도 같은 단서를 받는다.** §163⑨ 본문은 「**상속 또는 증여**받은 자산」이 대상이고,
   *    단서 1호·2호도 「상속 또는 **증여**받은 토지/건물」이라고 쓴다.
   *
   *    다만 ①의 소스가 다르다 — 상속은 전용 필드가 있지만 증여 신고가액은 **분리 ON이면
   *    파트 칸**, 분리 OFF면 자산 단위 칸이다. 조문이 요구하는 「자산별」 비교가 성립하려면
   *    파트별 신고가액이 있어야 하므로, **분리 OFF + 게이트 안은 ⑧이 안내로 차단**한다.
   *
   * ⚠️ `isLandGift`/`isBuildingGift`는 ⑧과 **같은 정의**다.
   */
  // 1985 하한 제거 — 위 상속 게이트와 같은 근거다(§163⑨은 상속·증여를 같은 문장에서 다룬다).
  const isLandGift = asset.acquisitionCause === "gift";
  const isBuildingGift = asset.gbBuildingAcquisitionCause === "gift";

  const landInheritanceDate = partAcquisitionDates(asset).land;
  /** 토지 파트가 §163⑨ 단서 **1호** 구간인가 — 상속·증여 공통. */
  const landSec164Applies =
    (acquisitionByInheritance || isLandGift) &&
    !!landInheritanceDate &&
    landInheritanceDate < LAND_PRICE_NOTICE_START;
  /** 건물 파트가 §163⑨ 단서 **2호** 구간인가. */
  const buildingSec164Applies =
    (buildingAcquisitionByInheritance || isBuildingGift) &&
    isBeforeBuildingStdPriceNotice(asset.acquisitionDate);
  /** ② §164④ 가액 — 취득시 토지 기준시가 **총액**(㎡당 × 면적). */
  const sec164LandTotal = Math.floor(
    effectiveGbLandPriceAtAcq(asset, transferDate ?? "") * (parseDecimal(asset.gbLandArea) || 0),
  );
  /** ② §164⑤ 가액 — 취득시 건물 기준시가. */
  const sec164BuildingValue = parseAmount(asset.gbAcqBuildingValue);

  const reportedLandValue = parseAmount(asset.publishedValueAtInheritance);
  const reportedBuildingValue = parseAmount(asset.gbBuildingInheritedValue);
  const inheritedLandValue =
    (landSec164Applies ? Math.max(reportedLandValue, sec164LandTotal) : reportedLandValue) ||
    undefined;
  const inheritedBuildingValue =
    (buildingSec164Applies
      ? Math.max(reportedBuildingValue, sec164BuildingValue)
      : reportedBuildingValue) || undefined;
  /**
   * 상속 필드 — **양 경로 모두**에 싣는다.
   *
   * 🔴 종전 주석은 「환산 모드=C2는 validate 차단이나 **대칭 전달**」이라고 적었으나
   *    **구현이 따라가지 않았다** — 이 객체는 실가 return에만 spread돼 있었고, C2 payload
   *    실측에서 `inheritedBuildingValue`·`buildingAcquisitionByInheritance`가 둘 다
   *    부재했다(2026-08-07). V1이 C2를 막고 있어 무해했을 뿐이다.
   *    결과 카드의 파트별 상속 라벨은 이 echo가 **유일한 소스**다.
   */
  const gbInheritanceEcho = {
    ...(acquisitionByInheritance ? { acquisitionByInheritance } : {}),
    ...(buildingAcquisitionByInheritance ? { buildingAcquisitionByInheritance } : {}),
  };
  /** 실가 경로의 C1 전용 분기(둘 다 상속)가 소비하는 평가액 — Phase 1. */
  const gbInheritanceFields = {
    ...gbInheritanceEcho,
    ...(acquisitionByInheritance ? { inheritedLandValue } : {}),
    ...(buildingAcquisitionByInheritance ? { inheritedBuildingValue } : {}),
  };

  // 풀세트 payload 필요 케이스 = 환산취득가 모드 OR 사례 33 일괄 모드 (실가+증축)
  // 두 경우 모두 취득시 기준시가·extensionInfo·buildingAcquisitionCause 필요.
  // 사례 33 일괄 모드는 extensionInfo.actualBundledAcquisitionPrice가 정의되어 엔진이 실가 분기.
  /**
   * 파트별 취득 방식 (2026-08-05 P3) — 미선택이면 자산 전체 레거시 플래그에서 파생한다
   * (`effectivePartAcqMode` 단일 소스). 분리 OFF에서는 두 파트가 같은 값이라 종전과 동일하다.
   */
  const landMode = effectivePartAcqMode(asset.landAcqMode, asset);
  const buildingMode = effectivePartAcqMode(asset.buildingAcqMode, asset);
  const anyEstimated = landMode === "estimated" || buildingMode === "estimated";
  /**
   * 파트별 자본적지출 — **두 파트가 모두 환산인 경우를 뺀 전부**에서 보낸다(O-1 해소).
   *
   * 두 파트 모두 환산이면 종전 자산 단위 `capitalExpenditure`가 §97②2호 단서의 자산총액 판정에
   * 쓰이므로 파트 값을 보내지 않는다(회귀 0). 그 밖의 조합(혼합·둘 다 실가·감정/매매사례)은
   * 파트별 귀속이 있어야 조문대로 계산된다 — 실가 파트는 §97②1호 **가산**, 환산 파트는
   * 같은 호 단서 **택일**이라 단위가 다르기 때문이다(`general-building-swap.ts`).
   */
  const bothEstimated = landMode === "estimated" && buildingMode === "estimated";
  const partExpensePayload = !bothEstimated
    ? {
        ...(parseAmount(asset.landDirectExpenses) ? { landDirectExpenses: parseAmount(asset.landDirectExpenses) } : {}),
        ...(parseAmount(asset.buildingDirectExpenses) ? { buildingDirectExpenses: parseAmount(asset.buildingDirectExpenses) } : {}),
      }
    : {};

  /**
   * §163⑨ 상속 파트의 평가액을 **파트별 실지거래가액 슬롯**에 싣는다 (Phase 2 — C2·C2′·C3).
   *
   * 같은 항이 상속개시일 평가액을 「취득당시의 실지거래가액으로 **본다**」고 하므로, 엔진에서도
   * 파트별 실지거래가액 슬롯에 그대로 싣는 것이 법문과 1:1이다. 그러면 이미 완성된 파트 축
   * 배선이 부분 상속 세 케이스를 전부 처리한다 — **새 엔진 분기가 필요 없다**:
   *   · 환산 경로 `applyPartAcqModes` — 비-환산 파트만 파트 가격으로 교체하고 개산공제도 파트별 0
   *   · 실가 경로 `hasBothPartPrices` — 두 파트 가격이 다 차므로 안분 없이 직접 배정
   *
   * 종전에는 상속 파트에 파트 가격이 없어 두 AND 게이트가 모두 false로 떨어졌다 —
   * 환산 경로는 **throw**, 실가 경로는 **취득가액 0**이었다(Pre-Do 실측).
   *
   * ⚠️ **평가액이 정본이라 파트 칸 입력을 덮어쓴다.** 두 칸이 같은 슬롯을 다투지 않도록
   *    상속 파트에서는 파트 취득가액 칸을 화면에서 숨긴다(`GeneralBuildingAcquisitionCards`).
   * ⚠️ C1(둘 다 상속)은 실가 경로의 **전용 분기가 먼저** 잡으므로 값이 변하지 않는다(회귀 0).
   * ⚠️ 분리 OFF + 부분 상속은 두 AND 게이트가 모두 false로 떨어져 **평가액이 소실**되므로
   *    validate가 차단한다(V-5 — 종전 「이중계상」 서술은 2026-08-08 실측으로 정정했다).
   */
  /**
   * 증여 파트의 §163⑨ 단서 max — ①은 **파트 칸의 증여 신고가액**이다.
   *
   * 상속처럼 전용 필드가 없으므로 파트 슬롯 자체가 ①이고, 여기서 ②와 겨룬다.
   * 게이트 밖이면 그대로 통과한다(비교 없음).
   */
  const giftMax = (reported: number, applies: boolean, sec164: number) =>
    (applies ? Math.max(reported, sec164) : reported) || undefined;

  const landPartPrice = acquisitionByInheritance
    ? inheritedLandValue
    : giftMax(
        parseAmount(asset.landAcquisitionPrice),
        isLandGift && landSec164Applies,
        sec164LandTotal,
      );
  const buildingPartPrice = buildingAcquisitionByInheritance
    ? inheritedBuildingValue
    : giftMax(
        parseAmount(asset.buildingAcquisitionPrice),
        isBuildingGift && buildingSec164Applies,
        sec164BuildingValue,
      );

  const partModePayload = {
    landAcqMode: landMode,
    buildingAcqMode: buildingMode,
    ...partExpensePayload,
    ...(landPartPrice ? { landAcquisitionPrice: landPartPrice } : {}),
    ...(buildingPartPrice ? { buildingAcquisitionPrice: buildingPartPrice } : {}),
  };

  // 한 파트라도 환산이면 **환산 경로**로 보낸다(혼합 모드 라우팅 확정 2026-08-05).
  // 그 경로만 파트별 기준시가·개산공제 구조를 갖는다 — 계획서 §3.3·`general-building-part-acq.ts`.
  if (anyEstimated || asset.gbHasExtension) {
    // 취득시 기준시가 — **환산 파트만** 필수다(2026-08-05 P7 정정).
    //
    // 🔴 종전에는 두 값을 무조건 요구해 `undefined`를 반환했다. validate V-5는 실가 파트의
    //    기준시가를 요구하지 않으므로(계산 어디에도 쓰이지 않는다), 사용자가 안내대로 비워두면
    //    **payload가 통째로 사라져 `route.ts`의 일반건물 게이트가 실패**했다 —
    //    validate 통과 ↔ API 침묵 drop이라는 최악의 조합이다(혼합 모드 C-4·C-5 전체가 불능).
    //    요구 조건을 validate와 **같은 축**(파트 모드)으로 맞춘다.
    const acquisitionLandPricePerSqm = parseAmount(asset.gbAcqLandPricePerSqm);
    const acquisitionBuildingStdPrice = parseAmount(asset.gbAcqBuildingValue);
    const buildingArea = parseDecimal(asset.gbBuildingArea) || parseDecimal(asset.gbBuildingFootprintArea);
    const needLandStd = landMode === "estimated" || asset.gbHasExtension;
    const needBuildingStd = buildingMode === "estimated" || asset.gbHasExtension;
    if (needLandStd && !acquisitionLandPricePerSqm) return undefined;
    if (needBuildingStd && !acquisitionBuildingStdPrice) return undefined;
    if (!buildingArea) return undefined;
    return {
      transferLandPricePerSqm,
      transferBuildingStdPrice,
      acquisitionLandPricePerSqm,
      acquisitionBuildingStdPrice,
      landArea,
      buildingArea,
      buildingFootprintArea,
      ...saleSplitFields(asset),
      ...saleAppraisalFields(asset),
      ...partModePayload,
      // C2(토지 환산 + 건물 상속) — 결과 카드 파트별 라벨의 유일 소스. 종전 누락(§9-1).
      // 값(평가액)은 위 `partModePayload`의 파트 가격 슬롯으로 흐르므로 여기서는 **게이트만** 보낸다.
      ...gbInheritanceEcho,
      estimatedDeductionRate: 0.03, // §163⑥ 등기 자산 3% 고정
      buildingAcquisitionDate: partAcquisitionDates(asset).building || undefined,
      landAcquisitionDate: partAcquisitionDates(asset).land || undefined,
      // isSelfBuilt: gbBuildingAcquisitionCause에서 도출 (A안: gbIsSelfBuilt 필드 폐지)
      isSelfBuilt: asset.gbBuildingAcquisitionCause === "newConstruction",
      // buildingAcquisitionCause: 엔진 input 필드 (⑭ route handler 매핑 준비)
      // 빈 문자열("")도 fallback해야 함 — ?? 는 nullish만 처리하므로 || 사용.
      buildingAcquisitionCause: asset.gbBuildingAcquisitionCause || "purchase",
      // #4-a: 토지 취득원인 + 상속·증여 보조 필드
      // 토지의 acquisitionCause(자산-수준) → landAcquisitionCause(payload)로 전달
      ...(asset.acquisitionCause && asset.acquisitionCause !== "newConstruction"
        ? { landAcquisitionCause: asset.acquisitionCause }
        : {}),
      // ⑫ 이월과세(§97의2) — 사건 1벌 + 파트 N벌. route가 영 §163의2②로 조립한다.
      //    🔴 이것이 없어서 「입력했는데 세액 그대로」였다(계획 §2 ③).
      ...buildGbCarryoverPayload(asset),
      ...(asset.decedentAcquisitionDate
        ? { decedentAcquisitionDate: asset.decedentAcquisitionDate }
        : {}),
      ...(asset.donorAcquisitionDate
        ? { donorAcquisitionDate: asset.donorAcquisitionDate }
        : {}),
      // 사례 33: 증축 extensionInfo 서브객체 (gbHasExtension=false 시 undefined → 미포함)
      extensionInfo: buildExtensionInfo(asset),
      // 사례 33 증축 경로에서만 사용: 토지+건물1 일괄 취득가·필요경비 (extensionInfo.actualBundled* 주입용).
      // 환산취득가 모드에서 body.acquisitionPrice=0이므로 여기서 명시 전달. route helper ⑭에서 주입.
      ...(asset.gbHasExtension
        ? {
            bundledAcquisitionPrice: parseAmount(asset.fixedAcquisitionPrice),
            // 일괄 취득 시 필요경비 — 전용 필드(gbBundledAcquisitionExpenses) 우선.
            // legacy fallback: 미입력 시 transferExpense·directExpenses (이전 임시 매핑 호환).
            bundledExpenses:
              parseAmount(asset.gbBundledAcquisitionExpenses) ||
              parseAmount(asset.transferExpense) ||
              parseAmount(asset.directExpenses),
            /**
             * 🔴 **채택된 값의 「성질」**을 함께 보낸다 (2026-08-07 W-1a).
             *
             * 위 fallback은 세 후보를 **한 슬롯**에 담아 성질 정보를 지운다. 그 슬롯은
             * `general-building-extension.ts`에서 **취득시** 기준시가 비율로 안분되는데,
             * ②(`transferExpense`)가 채택되면 **양도비가 취득 축으로 안분**된다 —
             * 「소득세법」 제100조 제2항 후문·본문이 정하는 시점(양도비 = **양도 당시**)과 어긋난다.
             *
             * ⚠️ **값을 빼지 않고 성질만 알린다.** ②를 fallback에서 제거하면 원건물 실가(A/B)
             *    조합에서 양도비의 차감 경로가 사라진다 — 자산 단위 swap 판정은 실가 카드에
             *    §97②1호 가산을 적용하지 않기 때문이다(`general-building-swap.ts` 자산 분기).
             *
             * · `capital`  ① 전용 필드 — 취득에 부수 ⇒ **취득시** 축(현행 유지)
             * · `transfer` ② 양도비    — 양도에 부수 ⇒ **양도시** 축(정정 대상)
             * · `mixed`    ③ legacy    — 두 성질이 섞인 덩어리 ⇒ **취득시** 유지
             *              (근거 없이 바꾸면 기존 이력의 배분이 움직인다 — W-5 교리)
             */
            bundledExpenseNature: parseAmount(asset.gbBundledAcquisitionExpenses)
              ? ("capital" as const)
              : parseAmount(asset.transferExpense)
                ? ("transfer" as const)
                : ("mixed" as const),
          }
        : {}),
      // §97②2호 단서 swap(자산총액) — G2(전체환산)·G4(NBL)·G3(증축) 공통.
      // capitalExpenditure는 항상 전달 — bundledExpenses fallback(transferExpense·directExpenses)에
      //   포함되지 않아 증축에서도 이중소비 없음.
      ...(parseAmount(asset.capitalExpenditure)
        ? { capitalExpenditure: parseAmount(asset.capitalExpenditure) }
        : {}),
      /**
       * 🔴 **증축에서도 「소비되지 않을 때는」 나목에 넣는다** (2026-08-07 W-1b).
       *
       * 종전 규칙은 「증축이면 무조건 제외」(decision b)였다. 이유는 위 `bundledExpenses`의
       * fallback ②가 `transferExpense`를 채택하면 **같은 값이 두 번** 반영되기 때문이고,
       * 그 우려는 **실재한다**(실측: 결정세액 131,082,800 → 16,954,949로 과소).
       *
       * 그러나 전용 필드 `gbBundledAcquisitionExpenses`가 입력되면 fallback은 **①에서 멈춘다**
       * ⇒ `transferExpense`는 소비되지 않는데도 제외되어 **§97②2호 단서의 나목에서 통째로
       * 빠졌다**. 실측 **결정세액 121,962,280원 과대**(양도비 3억 기준).
       *
       * ⇒ **①이 채택됐을 때만** 넣는다. 「무조건 제외」도 「무조건 포함」도 틀렸다.
       */
      ...((!asset.gbHasExtension || !!parseAmount(asset.gbBundledAcquisitionExpenses)) &&
      parseAmount(asset.transferExpense)
        ? { transferExpense: parseAmount(asset.transferExpense) }
        : {}),
      ...nblFields,
      // 사례 35: 주택→상가 용도변경 (자산 공통 — 환산 모드도 동일 LTHD 분기)
      ...(asset.gbHouseToCommercialConversion
        ? {
            houseToCommercialConversion: true,
            conversionDate: asset.gbConversionDate || undefined,
            wasMultiHouseAtConversion: asset.gbWasMultiHouseAtConversion ?? false,
          }
        : {}),
      // 사례 35 후속-1: §99-164-10 환산주택가격 (환산 모드만, useEstimatedAcquisition=true 분기)
      ...(asset.gbHasFirstDisclosure
        ? {
            hasFirstDisclosure: true,
            firstDisclosurePrice: parseAmount(asset.gbFirstDisclosurePrice) || undefined,
            firstDisclosureLandStdPrice: parseAmount(asset.gbFirstDisclosureLandStdPrice) || undefined,
            firstDisclosureBuildingStdPrice: parseAmount(asset.gbFirstDisclosureBuildingStdPrice) || undefined,
          }
        : {}),
    };
  }

  // 실거래가/감정가 모드 — 양도시 기준시가만 (route helper에서 §166⑥ 비율 안분)
  // buildingAcquisitionCause는 Zod schema에서 required이므로 minimal payload에도 포함.
  // (§114조의2 신축 5년 이내 가산세 판정에 사용 — 실거래가 모드에서도 의미 있음)
  // 부담부증여 §159①1호 산식용 — 취득시 기준시가 (입력 있을 때만 전달, optional).
  const acquisitionLandPricePerSqm = parseAmount(asset.gbAcqLandPricePerSqm);
  const acquisitionBuildingStdPrice = parseAmount(asset.gbAcqBuildingValue);
  return {
    transferLandPricePerSqm,
    transferBuildingStdPrice,
    landArea,
    buildingFootprintArea,
    actualPriceMode: true,
    ...saleSplitFields(asset),
    ...saleAppraisalFields(asset),
    ...partModePayload,
    // M-1a — 실거래가 모드에서도 파트 취득일을 싣는다. 종전에는 건물 취득일이 여기서 누락돼
    // 건물 카드가 토지 취득일로 계산됐다(계획서 §1.3 실측 결함).
    buildingAcquisitionDate: partAcquisitionDates(asset).building || undefined,
    landAcquisitionDate: partAcquisitionDates(asset).land || undefined,
    buildingAcquisitionCause: asset.gbBuildingAcquisitionCause || "purchase",
    isSelfBuilt: asset.gbBuildingAcquisitionCause === "newConstruction",
    ...(acquisitionLandPricePerSqm ? { acquisitionLandPricePerSqm } : {}),
    ...(acquisitionBuildingStdPrice ? { acquisitionBuildingStdPrice } : {}),
    /**
     * 🔴 자본적지출(§97①2호)·양도비(§97①3호) — **실가 경로에도 싣는다**(2026-08-07 P-3).
     *
     * 종전에는 환산 payload(위 `:279-289`)에만 있어 **실가 경로에 도달하지 못했다**.
     * `actualExpenses`는 legacy `directExpenses`에서만 오는데(`transfer-tax-api.ts:285-290`)
     * 현행 UI는 자본적지출·양도비 두 칸을 쓰고 legacy 칸은 **둘 다 0일 때만** 띄운다
     * (`AssetSectionExpense.tsx:109-111`) ⇒ 실측 **결정세액 12,800,000원 과대**(비용 4,000만 기준).
     *
     * ⚠️ 환산 경로와 달리 **§97②2호 단서 swap 대상이 아니다** — 실가 경로는 환산취득가도
     *    개산공제도 쓰지 않아 단서 요건을 충족하지 않는다. 적용 조문은 같은 항 **1호**
     *    (「해당 실지거래가액 + 제1항제2호·제3호의 금액」)의 **단순 가산**이다.
     *
     * ⚠️ 증축 제외 게이트(`!gbHasExtension`)를 여기 걸지 않는다 — 증축은 애초에 환산 경로로
     *    가므로(`:217` `anyEstimated || gbHasExtension`) 이 return에 도달하지 않는다.
     */
    ...(parseAmount(asset.capitalExpenditure)
      ? { capitalExpenditure: parseAmount(asset.capitalExpenditure) }
      : {}),
    ...(parseAmount(asset.transferExpense)
      ? { transferExpense: parseAmount(asset.transferExpense) }
      : {}),
    // §95④ 단기보유 기산점 — actual 분기 기존 결측 보강 (토지 취득원인·피상속인/증여자 취득일).
    ...(asset.acquisitionCause && asset.acquisitionCause !== "newConstruction"
      ? { landAcquisitionCause: asset.acquisitionCause }
      : {}),
    // ⑫ 이월과세 — 🔴 **실가 경로에도 반드시** (설계 D1-1). 한쪽만 고치면 모드에 따라 켜졌다 꺼졌다 한다.
    ...buildGbCarryoverPayload(asset),
    ...(asset.decedentAcquisitionDate ? { decedentAcquisitionDate: asset.decedentAcquisitionDate } : {}),
    ...(asset.donorAcquisitionDate ? { donorAcquisitionDate: asset.donorAcquisitionDate } : {}),
    // §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1)
    ...gbInheritanceFields,
    ...nblFields,
    // 사례 35: 주택→상가 용도변경 — actual 모드도 동일 LTHD 분기
    ...(asset.gbHouseToCommercialConversion
      ? {
          houseToCommercialConversion: true,
          conversionDate: asset.gbConversionDate || undefined,
          wasMultiHouseAtConversion: asset.gbWasMultiHouseAtConversion ?? false,
        }
      : {}),
  };
}
