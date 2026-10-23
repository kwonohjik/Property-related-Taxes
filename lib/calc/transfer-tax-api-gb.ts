/**
 * ④ 일반건물(토지+건물 일괄) API 변환 헬퍼 (소령 §176의2②, §163⑥, §166⑥, §163⑨).
 *
 * `transfer-tax-api-helpers.ts` 800줄 정책에 따라 GB 전용 변환(buildExtensionInfo·
 * buildGeneralBuildingValuation)을 분리. 함수 로직 변경 없이 순수 추출 + §163⑨ 상속 게이트.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { depreciationSupport } from "./depreciation-scope";
import { parseDecimal } from "@/lib/calc/number-parse";
import { partAcquisitionDates, gbPartModes } from "./transfer-tax-split-acq-mode";
import { partNeedsOwnAcqStd } from "./transfer-tax-split-acq-mode";
// §163⑨ 단서 게이트 — 상가 경로와 **같은 상수·같은 술어**를 쓴다(경계가 갈리면 조문 하나에 두 정책이 된다).
import { buildGbCarryoverPayload } from "./transfer-tax-api-gb-carryover";
import { gbFirstDisclosureLandStdPriceOf } from "./gb-first-disclosure";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { gbBuildingOwnDecedentDate } from "./transfer-tax-validate-gb-required";
import { saleSplitProvisoApplies } from "./sale-split-100-3-era";
import { gbSec1639Acquisition } from "./transfer-tax-api-gb-sec163-9";
import { gbCapexBeforeExtensionSlots } from "./gb-extension-capex-timing";

/**
 * 수유자(상속인 아닌 유증·사인증여) — 상속 취득 블록의 토글(취득원인 = 상속일 때 뜬다)을 환산·실가 두 경로에 같은 키로 싣는다.
 * route는 상속 카드(토지·건물)에만 붙인다(`buildProperties`). 계획서 `docs/00-pm/non-heir-bequest-followups.plan.md`.
 */
function gbNonHeirBequestField(asset: AssetForm): { nonHeirBequest?: true } {
  return asset.acquisitionCause === "inheritance" && asset.nonHeirBequest ? { nonHeirBequest: true } : {};
}

/**
 * ④ D3(2026-09-30) — 건물 파트 피상속인 취득일. ⑧·⑤와 **같은 술어**(`gbBuildingOwnDecedentDate`)라
 * 분리 OFF·비상속에서 남은 값은 싣지 않는다. 비면 엔진이 토지의 피상속인 취득일로 fallback한다.
 */
function buildingDecedentField(asset: AssetForm): Record<string, string> {
  const d = gbBuildingOwnDecedentDate(asset);
  return d ? { buildingDecedentAcquisitionDate: d } : {};
}

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
  /**
   * 🔴 **양도시 건물2 기준시가는 실가 모드에서도 싣는다** (2026-08-12 D-1).
   *
   * 종전에는 이 분기가 그 필드를 빼먹었다. 그래서 엔진
   * `general-building-extension.ts:77` `extStdTotal = … ?? 0`이 **0**이 되고, §166⑥ 3-way
   * 안분 분모에서 건물2가 통째로 빠져 **건물2 양도가액이 0**이 됐다(잔액 흡수 `:95-96`).
   * 토지·건물1이 총액을 다 가져가 과대 배분되고, 그 오염이 환산 분자를 타고 **취득가액까지**
   * 전파된다(실측: 조합 D 토지 취득가액 250,000,000 — 정상 235,294,117).
   *
   * 🔑 **양도가액 안분은 취득가액 산정 방식과 무관한 별개 축이다** — 「소득세법」 제100조 제2항 ·
   *    같은 법 시행령 제166조 제6항. 증축분을 실지거래가액으로 취득했어도 양도가액을 3파트로
   *    나누려면 세 기준시가가 모두 필요하다.
   *
   * ⚠️ UI는 실가 모드에서도 이 칸을 **이미 렌더한다**(`GeneralBuildingBlock.tsx` 실가 분기 —
   *    hint가 「§166⑥ 양도가액 안분 분모 계산에 필요합니다」라고 명시). 받는데 보내지 않는
   *    상태였다. 취득시 기준시가(`acquisitionExtensionBuildingStdPrice`)는 실가 모드에서
   *    쓰이지 않으므로 **여기서도 싣지 않는다**(환산 분자 전용).
   *
   * 미입력은 validate가 먼저 차단한다 — 여기 도달하면 우회 버그이므로 fail-fast
   * (자동 0 fallback 금지 · `feedback_no_silent_apportion_fallback`).
   */
  const transferExtStdPrice = parseAmount(asset.gbTransferExtensionBuildingStdPrice);
  if (!transferExtStdPrice) {
    throw new Error(
      `[buildExtensionInfo] 실가 모드 transferExtensionBuildingStdPrice 누락 — §166⑥ 안분 분모에 필요. validate 단계에서 차단되어야 함 (asset.assetId=${asset.assetId})`
    );
  }
  return {
    ...base,
    transferExtensionBuildingStdPrice: transferExtStdPrice,
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
function saleSplitFields(asset: AssetForm, transferDate?: string): Record<string, unknown> {
  if (asset.saleSplitMode !== "actual") return {};
  return {
    landTransferPrice: parseAmount(asset.landTransferPrice) || undefined,
    buildingTransferPrice: parseAmount(asset.buildingTransferPrice) || undefined,
    // 단서(영 §166⑧)는 양도일 2025.1.1. 이후만 효력이 있다 — 칸을 숨긴 구간의 잔존값을 요청 body에 싣지 않는다
    // (엔진도 era로 무시하는 최종 안전망이다. 3중 패턴: 화면·전송·엔진이 같은 구간을 본다).
    ...(asset.saleSplitExemption && saleSplitProvisoApplies(transferDate)
      ? { saleSplitExemption: asset.saleSplitExemption }
      : {}),
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
    unapprovedBuilding: asset.gbUnapprovedBuilding,
    // 「소득세법」 §104의2② 지정지역 선언 — 양도 2009.3.16.~2015.12.31.의 배율초과 토지 카드(8호 중과 유예 판정)만 읽는다.
    isDesignatedArea: asset.isDesignatedArea,
  };

  /**
   * §104③ 미등기양도자산 — **토지·건물 각각**(별개 부동산·별개 등기부).
   *
   * ⚠️ 위 `nblFields.isUnregistered`(「지방세법 시행령」 §101① 단서 — 허가·사용승인 미이행)와
   *    **별개 축**이다. 이름이 닮았을 뿐 판정도 효과도 다르다.
   *
   * 개산공제율(§163⑥1호 단서)은 엔진이 이 둘에서 파생하므로 **율은 보내지 않는다** —
   * 율을 함께 실으면 두 소스가 갈라져 한쪽만 갱신되는 사고가 난다.
   *
   * 🔑 `nblFields`와 같은 이유로 **객체로 뽑았다**: payload 조립 경로가 환산(`:372`)·실가(`:498`)
   *    둘이라, 한쪽에만 인라인으로 넣으면 그 모드에서 조용히 누락된다.
   */
  const unregisteredFields = {
    unregisteredLand: asset.gbLandUnregistered,
    unregisteredBuilding: asset.gbBuildingUnregistered,
  };

  // 풀세트 payload 필요 케이스 = 환산취득가 모드 OR 사례 33 일괄 모드 (실가+증축)
  // 두 경우 모두 취득시 기준시가·extensionInfo·buildingAcquisitionCause 필요.
  // 사례 33 일괄 모드는 extensionInfo.actualBundledAcquisitionPrice가 정의되어 엔진이 실가 분기.
  /**
   * 파트별 취득 방식 (2026-08-05 P3) — 미선택이면 자산 전체 레거시 플래그에서 파생한다
   * (`effectivePartAcqMode` 단일 소스). 분리 OFF에서는 두 파트가 같은 값이라 종전과 동일하다.
   */
  const separate = !!asset.hasSeperateLandAcquisitionDate;
  // 분리 OFF는 파트 라디오가 화면에 없다 → stale explicit을 무시하고 레거시 3플래그로 통일(`gbPartModes` — A1 Q-A2 「전면」).
  const { land: landMode, building: buildingMode } = gbPartModes(asset);
  const anyEstimated = landMode === "estimated" || buildingMode === "estimated";
  /**
   * D-1 라우팅 술어 — **하나라도 `actual`이 아니면** 환산 경로(개산공제 §163⑥ 구조를 가진 유일한 경로)로 보낸다.
   * `anyEstimated`(환산만)가 감정·매매사례 파트를 실가 경로에 떨궈 개산공제를 0으로 만들었다(G-2).
   * ⚠️ 아래 **최초공시 블록 게이트(`anyEstimated`)는 이 술어로 바꾸지 않는다**(D-1′) — 그 블록은 환산 한정이다.
   */
  const anyNonActual = landMode !== "actual" || buildingMode !== "actual";
  /**
   * 부담부증여(§159)는 **실가 경로**가 취득가액·개산공제를 채무비율로 정한다. 환산 경로는 `burdenedGiftInfo`를
   * 소비하지 않으므로, stale 감정·매매사례 플래그가 새로 환산 경로로 새면 §159가 침묵 소실된다 — 신규 술어에만 건다
   * (환산·증축의 종전 라우팅은 그대로).
   */
  const isBurdenedGiftGb =
    asset.transferType === "burdened_gift" || asset.acquisitionCause === "burdened_gift";
  /**
   * 파트별 자본적지출 — **두 파트가 모두 환산인 경우를 뺀 전부**에서 보낸다(O-1 해소).
   *
   * 두 파트 모두 환산이면 종전 자산 단위 `capitalExpenditure`가 §97②2호 단서의 자산총액 판정에
   * 쓰이므로 파트 값을 보내지 않는다(회귀 0). 그 밖의 조합(혼합·둘 다 실가·감정/매매사례)은
   * 파트별 귀속이 있어야 조문대로 계산된다 — 실가 파트는 §97②1호 **가산**, 환산 파트는
   * 같은 호 단서 **택일**이라 단위가 다르기 때문이다(`general-building-swap.ts`).
   */
  const bothEstimated = landMode === "estimated" && buildingMode === "estimated";
  // 증축 × 자본적지출 — 그중 증축 전 지출액(증축분에 배분하지 않는다 · `gb-extension-capex-timing.plan.md`). 0도 싣는다(⑧이 비움을 막는다).
  const capexBeforeExt = gbCapexBeforeExtensionSlots(asset);
  /*
   * 파트 자본적지출 칸은 **화면에 있을 때만** 싣는다 — 분리 ON 건물 카드(`isSeparate`) · `showPartCapex`(두 파트 모두 환산 제외) ·
   * 부담부증여면 `PartAcqModeField`가 통째로 숨는다. 숨은 칸의 잔존값이 공제되던 것을 막는다
   * (`gb-extension-capex-residuals.plan.md` O-1 · 증축이면 ⑫ 「증축 전 지출액」 필수 규칙과 같은 자리).
   */
  const partExpenseShown = separate && !bothEstimated && asset.transferType !== "burdened_gift";
  const partExpensePayload = partExpenseShown
    ? {
        ...(parseAmount(asset.landDirectExpenses) ? { landDirectExpenses: parseAmount(asset.landDirectExpenses) } : {}),
        ...(parseAmount(asset.buildingDirectExpenses) ? { buildingDirectExpenses: parseAmount(asset.buildingDirectExpenses) } : {}),
        ...(capexBeforeExt.building
          ? { buildingDirectExpensesBeforeExtension: parseAmount(asset.gbBuildingCapexBeforeExtension) }
          : {}),
      }
    : {};

  // §163⑨ 상속·증여 파트 취득가액(①② max · 1985 전 ①② 따로) — `transfer-tax-api-gb-sec163-9.ts`(800줄 정책 분리).
  const { gbInheritanceEcho, gbInheritanceFields, landPartPrice, buildingPartPrice, preDeemedFields, acqLandPerSqm } =
    gbSec1639Acquisition(asset, transferDate, isBurdenedGiftGb);

  /**
   * 분리 OFF **자산 단위** 감정가액·매매사례가액(F-2) — 총액 하나가 `bundledAcquisitionPrice`로 간다.
   * 감정 → `fixedAcquisitionPrice`, 매매사례 → `similarSalesValue`(기존 필드 · 신규 폼 필드 없음).
   * 두 파트 모드가 같은 `appraisal`/`salesCase`일 때만(분리 OFF 불변식). 증축은 아래 증축 spread가 같은 키를
   * **원건물 일괄 실가**로 따로 쓰므로 여기서 싣지 않는다(Q-A3이 증축 × 자산 단위 감정·매매사례를 서버에서 차단한다).
   * 이때 stale 파트 값(분리를 켰다 끈 뒤 남은 값)은 싣지 않는다 — 엔진은 총액과 파트 값이 같이 오면 파트 값을 쓴다.
   */
  const unifiedMode = !separate && landMode === buildingMode ? landMode : undefined;
  const bundledEstimateTotal =
    !asset.gbHasExtension && !isBurdenedGiftGb && (unifiedMode === "appraisal" || unifiedMode === "salesCase")
      ? parseAmount(unifiedMode === "salesCase" ? asset.similarSalesValue : asset.fixedAcquisitionPrice)
      : 0;
  const ownPartValues = bundledEstimateTotal > 0
    ? {} // 총액이 원천 — 파트 값 미전송
    : {
        ...(landPartPrice ? { landAcquisitionPrice: landPartPrice } : {}),
        ...(buildingPartPrice ? { buildingAcquisitionPrice: buildingPartPrice } : {}),
      };
  /** F-1 — 파트별 매매사례가액은 **분리 ON + 그 파트가 매매사례일 때만** 싣는다(0이면 미전송). */
  const landSalesCase = separate && landMode === "salesCase" ? parseAmount(asset.landSalesCaseValue) : 0;
  const buildingSalesCase = separate && buildingMode === "salesCase" ? parseAmount(asset.buildingSalesCaseValue) : 0;

  const partModePayload = {
    landAcqMode: landMode,
    buildingAcqMode: buildingMode,
    ...partExpensePayload,
    ...ownPartValues,
    ...(landSalesCase ? { landSalesCaseValue: landSalesCase } : {}),
    ...(buildingSalesCase ? { buildingSalesCaseValue: buildingSalesCase } : {}),
    ...(bundledEstimateTotal > 0 ? { bundledAcquisitionPrice: bundledEstimateTotal } : {}),
  };

  // 한 파트라도 **actual이 아니면**(환산·감정·매매사례) 환산 경로로 보낸다(혼합 모드 라우팅 확정 2026-08-05 · D-1 2026-10-06).
  // 그 경로만 파트별 기준시가·개산공제 구조를 갖는다 — 계획서 §3.3·`general-building-part-acq.ts`.
  if (anyEstimated || asset.gbHasExtension || (anyNonActual && !isBurdenedGiftGb)) {
    // 취득시 기준시가 — **환산 파트만** 필수다(2026-08-05 P7 정정).
    //
    // 🔴 종전에는 두 값을 무조건 요구해 `undefined`를 반환했다. validate V-5는 실가 파트의
    //    기준시가를 요구하지 않으므로(계산 어디에도 쓰이지 않는다), 사용자가 안내대로 비워두면
    //    **payload가 통째로 사라져 `route.ts`의 일반건물 게이트가 실패**했다 —
    //    validate 통과 ↔ API 침묵 drop이라는 최악의 조합이다(혼합 모드 C-4·C-5 전체가 불능).
    //    요구 조건을 validate와 **같은 축**(파트 모드)으로 맞춘다.
    const acquisitionLandPricePerSqm = acqLandPerSqm;
    const acquisitionBuildingStdPrice = parseAmount(asset.gbAcqBuildingValue);
    const buildingArea = parseDecimal(asset.gbBuildingArea) || parseDecimal(asset.gbBuildingFootprintArea);
    // 비-actual 파트(환산·감정·매매사례)는 자기 취득시 기준시가가 개산공제 base다 — ⑧·⑫와 같은 leaf(`partNeedsOwnAcqStd`, F-4).
    const needLandStd = partNeedsOwnAcqStd(landMode) || asset.gbHasExtension;
    const needBuildingStd = partNeedsOwnAcqStd(buildingMode) || asset.gbHasExtension;
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
      ...saleSplitFields(asset, transferDate),
      ...saleAppraisalFields(asset),
      ...partModePayload,
      // C2(토지 환산 + 건물 상속) — 결과 카드 파트별 라벨의 유일 소스. 종전 누락(§9-1).
      // 값(평가액)은 위 `partModePayload`의 파트 가격 슬롯으로 흐르므로 여기서는 **게이트만** 보낸다.
      ...gbInheritanceEcho,
      ...preDeemedFields,
      ...unregisteredFields,
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
      ...gbNonHeirBequestField(asset),
      ...buildingDecedentField(asset),
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
            // 일괄 취득 시 필요경비 — 전용 필드(gbBundledAcquisitionExpenses) 우선, 없으면 이전 입력 형식(directExpenses).
            // 🔴 양도비(transferExpense)는 이 사슬에 **넣지 않는다**(2026-10-22 E-1 · `docs/00-pm/gb-extension-actual-expenses.plan.md`).
            //    종전엔 ②로 들어와 파트 가격으로 대체된 파트(분리 ON·상속·증여)에서 엔진이 덮어써 사라졌다. 양도비는 아래 나목
            //    단일 경로로만 가고, 엔진 진입(`general-building-entry.ts`)이 실가 파트에 §97②1호로 가산한다 — 이중계상이 구조적으로 없다.
            //    이전 형식은 종전처럼 양도비가 있으면 쓰지 않는다(종전 사슬이 ②에서 멈추던 것과 같은 조건 — 회귀 0).
            bundledExpenses:
              parseAmount(asset.gbBundledAcquisitionExpenses) ||
              (parseAmount(asset.transferExpense) ? 0 : parseAmount(asset.directExpenses)),
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
             * · `transfer` ② 양도비    — 2026-10-22 E-1부터 ④가 보내지 않는다(위 사슬에서 뺐다). 엔진 분기는 옛 결과 재계산용으로 남는다(계획서 Q-3).
             * · `mixed`    ③ legacy    — 두 성질이 섞인 덩어리 ⇒ **취득시** 유지
             *              (근거 없이 바꾸면 기존 이력의 배분이 움직인다 — W-5 교리)
             */
            bundledExpenseNature: parseAmount(asset.gbBundledAcquisitionExpenses)
              ? ("capital" as const)
              : ("mixed" as const),
          }
        : {}),
      // §97②2호 단서 swap(자산총액) — G2(전체환산)·G4(NBL)·G3(증축) 공통.
      // capitalExpenditure는 항상 전달 — bundledExpenses fallback(transferExpense·directExpenses)에
      //   포함되지 않아 증축에서도 이중소비 없음.
      // 증축이면 「그중 증축 전 지출액」 칸이 있는 자리에서만 싣는다(부담부증여로 칸이 숨으면 미전송) — ⑫가 증축 전 키를 필수로 본다.
      ...(parseAmount(asset.capitalExpenditure) && (!asset.gbHasExtension || capexBeforeExt.asset)
        ? { capitalExpenditure: parseAmount(asset.capitalExpenditure) }
        : {}),
      ...(capexBeforeExt.asset
        ? { capitalExpenditureBeforeExtension: parseAmount(asset.gbCapexBeforeExtension) }
        : {}),
      // §97③ 감가상각비 — 건물분. 지분 스케일은 `applyShareScale`(gb-shares)이 한다.
      ...(depreciationSupport(asset).status === "ok" && parseAmount(asset.depreciationAmount ?? "")
        ? { depreciationAmount: parseAmount(asset.depreciationAmount ?? "") }
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
       *
       * ── 🔴 **`bothEstimated` 추가** (2026-08-12 D-10) ──────────────────────────────
       *
       * 위 규칙의 전제는 「`bundledExpenses`가 그 값을 **소비한다**」인데, **원건물이 양쪽 다
       * 환산이면 소비하지 않는다**. `general-building-extension.ts`가 일괄 안분 필요경비를
       * 계산한 직후 환산 파트에서 **개산공제로 덮기** 때문이다(같은 파일 「파트가 환산이면
       * 일괄 안분값을 쓰지 않는다」 분기 — 2026-08-08 추가). 그 변경으로 W-1b의 전제가
       * 조합 C·D에서만 무너졌는데 게이트는 그대로 남아 있었다.
       *
       * mutation 실측: 조합 C에서 `bundledExpenses`를 10,000,000 → 5,000,000으로 바꿔도
       * 토지·건물1 필요경비가 **개산공제 6,000,000·3,000,000에 고정**된다(= 안분값이 아니다).
       * ⇒ 이중계상이 성립할 수 없는데도 양도비가 나목에서 빠졌다.
       * 실측 **결정세액 28,979,117원 과대**(자본적지출 8억·양도비 3억 기준).
       *
       * 「소득세법」 제97조 제2항 제2호 **단서 나목**은 「제1항제2호 **및** 제3호에 따른 금액의
       * **합계액**」이라 양도비를 조건 없이 포함한다. 빼는 유일한 정당화가 이중계상인데
       * 그것이 성립하지 않으므로, 조합 C·D에서는 **항상 싣는다**.
       *
       * ── 🔴 **`isSeparate` 추가** (2026-08-12 D-11 — 계획서 §14 O-3 종결) ──────────
       *
       * 종전 주석은 「부분 혼합(토지 실가 + 건물1 환산)은 실가 파트가 `bundledExpenses`를
       * **실제로 소비**하므로 이중계상 위험이 남는다」였다. **그 전제가 틀렸다.**
       *
       * 부분 혼합은 **분리 ON에서만** 만들 수 있고(파트별 산정방식 라디오가
       * `GeneralBuildingAcquisitionCards`의 분리 ON 분기에만 있다), 분리 ON이면
       * `general-building-extension.ts`의 일괄 안분값이 **두 파트 모두에서 덮인다**:
       *   · 비-환산 파트 → Step 2.5 `applyPartAcqModes`가 파트 가격으로 대체.
       *     V-7이 그 값을 **필수로 요구**하므로 비어 있을 수 없다.
       *   · 환산 파트     → 「파트가 환산이면 일괄 안분값을 쓰지 않는다」 분기가 §176의2② 값으로 대체.
       *
       * mutation 실측: 분리 ON에서 `gbBundledAcquisitionExpenses`를 0 → 5억으로 바꿔도
       * 토지 카드 필요경비·결정세액이 **불변**이고, stale `fixedAcquisitionPrice` 9억이 payload에
       * 실려도 토지 취득가액은 파트 가격 그대로다. 반면 분리 **OFF**(조합 A)는 같은 mutation에서
       * 토지 필요경비 0 → 333,333,333 · 결정세액 155,801,082 → 17,789,329으로 크게 반응한다.
       * ⇒ 이중계상이 성립하지 않는데도 양도비가 나목에서 통째로 빠졌다.
       * 실측 **결정세액 58,948,319원 과대**(양도비 3억 기준).
       *
       * 범위는 부분 혼합에 한정되지 않는다 — **분리 ON × 증축 전부**(둘 다 실가 포함)가 같다.
       *
       * ⚠️ 분리 **OFF**는 종전 그대로다. 그쪽은 파트 취득가액 칸이 화면에 없어 일괄 안분값이
       *    실가 파트의 정본으로 남고, 그때는 이중계상이 **실재한다**(위 대조군 수치).
       *
       * ── ✅ **게이트 폐지** (2026-10-22 E-1) ──────────────────────────────────────────
       *
       * 위 게이트들은 전부 「양도비가 `bundledExpenses` 사슬에도 들어갈 수 있다」에서 나왔다. 사슬에서 양도비를 뺐으므로
       * (위 `bundledExpenses`) 이중계상의 전제가 사라졌다 ⇒ **항상 싣는다**. 원건물이 실가면 엔진 진입이 파트 축으로
       * 실가 카드에 가산하고(`general-building-entry.ts`), 환산이면 종전 단서 비교 그대로다.
       */
      ...(parseAmount(asset.transferExpense)
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
      /**
       * 사례 35 후속-1: §99-164-10 환산주택가격.
       *
       * 🔑 **`&& anyEstimated`가 필수다**(2026-08-13). 이 블록을 감싼 분기는
       * `anyEstimated || gbHasExtension`이라 **실거래가 + 증축**에서도 열린다. 조건을
       * `gbHasFirstDisclosure` 단독으로 두면 그 조합에서 stale 플래그가 payload에 실려
       * 엔진이 `applyConvertedHousingPriceOverride`를 적용한다 — 실가로 계산해야 할
       * 취득가액이 조용히 환산값으로 바뀐다(계획서 §7.5 (b)).
       *
       * 종전에는 validate가 「환산취득가 모드에서만 가능합니다」로 차단해 우연히 막고
       * 있었다. 그 차단을 파트 축 무시로 바꾸면서(D-1) 이 게이트가 그 역할을 승계한다.
       *
       * ⚠️ UI 노출·validate와 **같은 축**이어야 한다 — `isGbFirstDisclosureApplicable`가
       *    쓰는 것도 `effectivePartAcqMode` 2개의 OR로 `anyEstimated`와 동일하다.
       *
       * 토지 기준시가는 **총액을 저장하지 않는다** — ㎡당 단가 × 면적으로 파생하되
       * 구형 자산의 총액 입력을 fallback으로 받는다(`gbFirstDisclosureLandStdPriceOf`).
       */
      ...(asset.gbHasFirstDisclosure && anyEstimated
        ? {
            hasFirstDisclosure: true,
            firstDisclosurePrice: parseAmount(asset.gbFirstDisclosurePrice) || undefined,
            firstDisclosureLandStdPrice: gbFirstDisclosureLandStdPriceOf(asset) || undefined,
            firstDisclosureBuildingStdPrice: parseAmount(asset.gbFirstDisclosureBuildingStdPrice) || undefined,
          }
        : {}),
    };
  }

  // 실거래가/감정가 모드 — 양도시 기준시가만 (route helper에서 §166⑥ 비율 안분)
  // buildingAcquisitionCause는 Zod schema에서 required이므로 minimal payload에도 포함.
  // (§114조의2 신축 5년 이내 가산세 판정에 사용 — 실거래가 모드에서도 의미 있음)
  // 부담부증여 §159①1호 산식용 — 취득시 기준시가 (입력 있을 때만 전달, optional).
  const acquisitionLandPricePerSqm = acqLandPerSqm;
  const acquisitionBuildingStdPrice = parseAmount(asset.gbAcqBuildingValue);
  return {
    transferLandPricePerSqm,
    transferBuildingStdPrice,
    landArea,
    buildingFootprintArea,
    actualPriceMode: true,
    ...saleSplitFields(asset, transferDate),
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
    // §97③ 감가상각비 — 건물분(실가 경로). 지분 스케일은 `applyShareScale`이 한다.
    ...(depreciationSupport(asset).status === "ok" && parseAmount(asset.depreciationAmount ?? "")
      ? { depreciationAmount: parseAmount(asset.depreciationAmount ?? "") }
      : {}),
    // §95④ 단기보유 기산점 — actual 분기 기존 결측 보강 (토지 취득원인·피상속인/증여자 취득일).
    ...(asset.acquisitionCause && asset.acquisitionCause !== "newConstruction"
      ? { landAcquisitionCause: asset.acquisitionCause }
      : {}),
    // ⑫ 이월과세 — 🔴 **실가 경로에도 반드시** (설계 D1-1). 한쪽만 고치면 모드에 따라 켜졌다 꺼졌다 한다.
    ...buildGbCarryoverPayload(asset),
    ...(asset.decedentAcquisitionDate ? { decedentAcquisitionDate: asset.decedentAcquisitionDate } : {}),
    ...gbNonHeirBequestField(asset),
    ...buildingDecedentField(asset),
    ...(asset.donorAcquisitionDate ? { donorAcquisitionDate: asset.donorAcquisitionDate } : {}),
    // §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1)
    ...gbInheritanceFields,
    ...preDeemedFields,
    ...nblFields,
    ...unregisteredFields,
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
