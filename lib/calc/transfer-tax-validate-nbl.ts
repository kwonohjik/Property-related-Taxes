/**
 * 비사업용 토지 정밀판정 필수 입력 검증 (⑧)
 *
 * transfer-tax-validate-asset.ts에서 분리(800줄 정책).
 *
 * 무조건 사업용 의제(§168의14③) 성립 시 지목·용도지역·기간기준 상세 입력은 UI(NblSectionContainer)에서
 * 비활성 + 엔진이 Step 2에서 무시 → 검증도 동일 스킵(UI 통과↔validate 차단 모순 방지,
 * memory feedback_validation_sync_8th_point). 판정 기준은 UI와 동일 어댑터(단일 진실).
 * 면적은 UI 비활성 대상이 아니고 평가에 필요할 수 있으므로 의제 시에도 유지.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { GRACE_REASON_SPECS } from "@/lib/tax-engine/non-business-land/grace-reason-period";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { isUrbanResidentialCommercialIndustrial } from "@/lib/tax-engine/non-business-land/urban-area";
import { isUrbanForFarmland } from "@/lib/tax-engine/non-business-land/urban-area";
import { isUrbanForPasture } from "@/lib/tax-engine/non-business-land/urban-area";
import { isUrbanForForest } from "@/lib/tax-engine/non-business-land/urban-area";
import { isUrbanCriteriaRegion } from "@/lib/tax-engine/non-business-land/urban-region-scope";
import type { LandDivision } from "@/lib/tax-engine/non-business-land/types";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { resolveNblUrbanIncorporationDate } from "./non-business-land-request";
import { validateNblOtherLand } from "./transfer-tax-validate-nbl-other";
import { parseTaxPeriodYears } from "@/lib/tax-engine/non-business-land/disqualified-tax-periods";

/** 폼의 3-state 값을 엔진 `LandDivision`으로 — ④ form-mapper와 **같은 접기 규칙**(3중 패턴). */
function nblLandDivisionOf(asset: AssetForm): LandDivision | undefined {
  const v = asset.nblLandDivision;
  return v === "dong" || v === "eup_myeon" ? v : undefined;
}

/** 편입일을 요구하는 지목의 표시명 (오류 메시지용) */
const LAND_TYPE_LABEL: Record<string, string> = {
  farmland: "농지",
  pasture: "목장용지",
  forest: "임야",
};

/**
 * 도시지역 편입 유예 판정이 **실제로 수행되는** 조합인지 — 엔진 술어를 그대로 재사용한다.
 *
 * 임야는 원칙적으로 지역기준을 적용하지 않고 시업중 임야(§168의9①2호가목)·
 * 특수산림사업지구(같은 호 나목)일 때만 적용하므로, 그 플래그가 없으면 편입일도 요구하지 않는다
 * (`forest.ts`의 게이트와 동일 — 과차단 방지).
 *
 * 목장은 2008.2.21. 이전 양도분에서 녹지까지 도시지역에 포함하는 연혁 축이 있다. 양도일을 모르면
 * **날짜를 지어내지 않고** 좁은 쪽(현행 = 주·상·공)만 본다 — 추정으로 차단을 넓히지 않는다.
 */
function isUrbanForIncorporationGrace(
  landType: string,
  zoneType: ZoneType,
  transferDate: Date | undefined,
  asset: AssetForm,
): boolean {
  // 법 §104의3①1호나목·3호가목의 지역 열거 밖(광역시의 군·도의 군·읍·면지역)이면 농지·목장에
  // 지역기준 자체가 적용되지 않으므로 편입일도 요구하지 않는다 — 과차단 방지 (E2-01).
  if (
    (landType === "farmland" || landType === "pasture") &&
    isUrbanCriteriaRegion(asset.nblLandSigunguCode, nblLandDivisionOf(asset)) === false
  ) {
    return false;
  }
  if (landType === "farmland") return isUrbanForFarmland(zoneType);
  if (landType === "pasture")
    return transferDate
      ? isUrbanForPasture(zoneType, transferDate)
      : isUrbanResidentialCommercialIndustrial(zoneType);
  if (landType === "forest")
    return (
      (asset.nblForestHasPlan === true || asset.nblForestIsProtected === true) &&
      isUrbanForForest(zoneType)
    );
  return false;
}

/** 비사업용 토지 정밀판정(nblUseDetailedJudgment) 필수 입력 검증. 첫 오류 메시지 또는 null. */
/** "YYYY-MM-DD" → 연도. 비었거나 형식이 다르면 undefined. */
function yearOf(iso: string | undefined): number | undefined {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(iso ?? "");
  return m ? Number(m[1]) : undefined;
}

export function validateNblDetailedJudgment(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  if (asset.assetKind !== "land" || !asset.nblUseDetailedJudgment) return null;

  const nblExempt = evaluateUnconditionalExemption(asset, formTransferDate ?? "").isExempt;
  if (!nblExempt && !asset.nblLandType)
    return `${label}: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요.`;
  if (!nblExempt && !asset.nblZoneType)
    return `${label}: 비사업용 토지 정밀판정 — 용도지역을 선택하세요.`;
  if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
    return `${label}: 비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요.`;

  /*
   * 공동소유 지분 범위 게이트(E5-03, 2026-09-02)는 2026-09-04에 **폐지**됐다.
   *
   * 그 게이트는 NBL 전용 「공동소유 지분」 입력칸(0~1 비율)이 자산-수준 「공유 지분율」(%)과
   * 한 화면에 공존해 사용자가 백분율 `50`을 비율 칸에 넣을 수 있었기 때문에 필요했다. 입력칸
   * 자체를 없애고 자산-수준 지분율에서 파생하도록 바꿨으므로(`buildNonBusinessLandRaw`)
   * **범위를 벗어난 값이 들어올 입력 경로가 없다** — 게이트는 도달 불가능한 코드가 됐다.
   *
   * 파생 산식(`deriveOwnershipRatio` = `getOwnershipRatio`)이 `Math.min(n/d, 1)`로 상한을,
   * `n <= 0 || d <= 0 || 비유한 → 1`로 하한을 **구조적으로** 막는다. 즉 백분율 감각의 `50`을
   * 넣어도 그것은 이제 50%(=0.5)로 읽히지, 배율 50으로 읽히지 않는다 — 종전 게이트가 막던
   * 「토지가액 50배 → §168의11② 수입금액비율 붕괴」 경로 자체가 사라졌다.
   */

  /**
   * 조특령 §66⑭ 결격 과세기간 — 형식·범위 차단 (E2-09, 2026-09-03).
   *
   * 파서(`parseTaxPeriodYears`)는 4자리 정수가 아닌 토큰을 **버리지 않고 `invalid`로 돌려준다**.
   * 조용히 버리면 「입력했는데 반영이 안 된 것」이 사용자에게 보이지 않는다(자동 fallback 금지).
   * 범위는 취득연도~양도연도 — 그 밖의 연도는 자경 기간과 겹칠 수 없어 아무것도 차감하지 못한다.
   */
  if (asset.nblDisqualifiedTaxPeriods) {
    const { years, invalid } = parseTaxPeriodYears(asset.nblDisqualifiedTaxPeriods);
    if (invalid.length > 0)
      return `${label}: 결격 과세기간(조특령 §66⑭)은 4자리 연도를 쉼표로 구분해 입력하세요 (예: 2019, 2020). 인식할 수 없는 값: ${invalid.join(", ")}`;
    const acqYear = yearOf(asset.acquisitionDate);
    const trfYear = yearOf(formTransferDate);
    if (acqYear !== undefined && trfYear !== undefined) {
      const outOfRange = years.filter((y) => y < acqYear || y > trfYear);
      if (outOfRange.length > 0)
        return `${label}: 결격 과세기간(조특령 §66⑭)은 취득연도(${acqYear})부터 양도연도(${trfYear}) 사이여야 합니다. 범위 밖: ${outOfRange.join(", ")}`;
    }
  }

  // 무조건 의제 성립 시 아래 기간기준 상세 입력은 엔진이 무시 + UI 비활성 → 검증 스킵
  if (nblExempt) return null;

  // 주택부수토지(§168-12) 도시지역 주·상·공 배율은 수도권 여부에 따라 3배/5배로 갈린다.
  // 미선택 시 엔진(housing-land.ts)이 수도권(불리)로 default 적용 → 유리-default 정책상 계산 전 차단.
  // 배율이 실제로 달라지는 urban 주·상·공 zoneType에서만 요구(녹지·도시 外는 수도권 무관 → 차단 금지).
  //
  // 🔴 "unknown"(「미확인」 선택지)도 차단한다 (E3-01·A2-02, 2026-09-02 코드리뷰).
  //    종전 조건 `!asset.nblIsMetropolitanArea`는 문자열 "unknown"이 truthy라 그대로 통과했고,
  //    서버 매퍼(`form-mapper.ts`)는 "yes"/"no" 외를 전부 `undefined`로 접으며,
  //    엔진(`housing-land.ts`)은 `undefined`를 **명시적으로 수도권(true)** 으로 대체한다
  //    (「보수적 기본값」 주석). 그 결과 비수도권 도시 주·상·공이 5배 대신 3배를 받아
  //    부수토지의 40%가 비사업용으로 넘어갔다 — 법 근거 없는 불리 적용이다.
  //
  // 🔴 **별장도 포함한다** (2026-09-06 UI 리뷰). 별장 요건 미해당 시 엔진이 주택부수토지로
  //    자동 재분류하므로(`engine.ts:118`) 같은 배율을 쓴다 — 바로 아래 정착면적 게이트가
  //    이미 `villa_land`까지 넓혀져 있는(E1-02) 것과 **같은 경로의 나머지 한 축**이다.
  //    종전에는 이 게이트만 `housing_site`에 머물러, 별장은 값을 넣을 화면도 없고
  //    차단도 되지 않은 채 3배(불리)로 계산됐다.
  if (
    (asset.nblLandType === "housing_site" || asset.nblLandType === "villa_land") &&
    isUrbanResidentialCommercialIndustrial(asset.nblZoneType as ZoneType) &&
    (!asset.nblIsMetropolitanArea || asset.nblIsMetropolitanArea === "unknown")
  ) {
    return `${label}: 주택부수토지 도시지역 주·상·공은 수도권 여부에 따라 배율이 달라집니다(수도권 3배 / 수도권 밖 5배). 수도권 여부를 선택하세요.`;
  }

  // §168의12 주택 정착면적 — 미입력 시 엔진(housing-land.ts:39)이 「정착면적 미입력」으로
  // 인정면적 0을 산정해 **전량 비사업용**으로 확정한다. 자동 fallback 금지 (E1-03).
  // 별장도 포함한다 — 별장 요건 미해당 시 엔진이 주택부수토지로 자동 재분류하므로 같은 값을 쓴다(E1-02).
  if (
    (asset.nblLandType === "housing_site" || asset.nblLandType === "villa_land") &&
    (!asset.nblHousingFootprint || parseFloat(asset.nblHousingFootprint) <= 0)
  ) {
    return asset.nblLandType === "villa_land"
      ? `${label}: 별장 부속토지 — 주택 정착면적(㎡)을 입력하세요. 별장 요건에 해당하지 않으면 주택부수토지로 재분류되며, 정착면적이 없으면 인정면적이 0이 되어 전량 비사업용으로 판정됩니다.`
      : `${label}: 주택부수토지 — 주택 정착면적(㎡)을 입력하세요. 미입력 시 인정면적이 0이 되어 전량 비사업용으로 판정됩니다.`;
  }

  // 법 §104의3①1호나목·3호가목 지역 열거 — 시(市)·특별자치시는 읍·면 여부가 판정을 가른다.
  // 미입력 시 엔진이 판정 불가로 두고 **도시지역 판정을 그대로 적용**하므로(불리) 계산 전 차단한다.
  // 자치구·일반구·군은 읍·면이 없거나 이미 대상 밖이라 요구하지 않는다(과차단 방지).
  if (
    (asset.nblLandType === "farmland" || asset.nblLandType === "pasture") &&
    isUrbanResidentialCommercialIndustrial(asset.nblZoneType as ZoneType) &&
    isUrbanCriteriaRegion(asset.nblLandSigunguCode, nblLandDivisionOf(asset)) === undefined &&
    asset.nblLandSigunguCode
  ) {
    return `${label}: 도시지역 ${LAND_TYPE_LABEL[asset.nblLandType] ?? "토지"} — 소재지 행정구역 단위(동 / 읍·면)를 선택하세요. 법 §104조의3①1호나목·3호가목은 읍·면지역을 도시지역 판정에서 제외합니다.`;
  }

  // §168의8⑤⑥(농지)·§168의10⑤(목장)·§168의9①2호 단서(임야) 도시지역 편입 유예 —
  // 편입일이 없으면 엔진이 「미제공」과 「유예 경과」를 같게 취급해 불리한 쪽으로 확정한다(V5-b).
  // ④ raw 빌더와 **같은 해소 규칙**을 쓴다(§66 자경 편입일 fallback 포함 — 3중 패턴).
  if (
    isUrbanForIncorporationGrace(
      asset.nblLandType,
      asset.nblZoneType as ZoneType,
      toOptionalDate(formTransferDate ?? ""),
      asset,
    ) &&
    !resolveNblUrbanIncorporationDate(asset)
  ) {
    return `${label}: 도시지역 ${LAND_TYPE_LABEL[asset.nblLandType] ?? "토지"} — 도시지역 편입일을 입력하세요. 미입력 시 편입 유예가 적용되지 않아 비사업용으로 판정됩니다.`;
  }

  // §168의14② 양도일 의제 — 사유 선택 시 의제일 필수 (자동 fallback 금지)
  if (asset.nblDeemedTransferReason && asset.nblDeemedTransferReason !== "none" && !asset.nblDeemedTransferDate)
    return `${label}: 양도일 의제 사유를 선택했습니다. 의제일(최초 경매기일·공매일·공고일 등)을 입력하세요.`;
  // §168의11①·⑤·⑥ 기타토지 정밀판정 입력 검증 (별도 파일 분리 — 800줄 정책)
  if (asset.nblLandType === "other_land") {
    const nblOtherErr = validateNblOtherLand(asset, label);
    if (nblOtherErr) return nblOtherErr;
  }
  // §168의11② 수입금액비율 — 업종 선택 시 당해 수입금액·토지가액 필수
  if (asset.nblLandType === "other_land" && asset.nblRevenueBusinessType) {
    if (!asset.nblRevenueCurrentRevenue || parseAmount(asset.nblRevenueCurrentRevenue) <= 0)
      return `${label}: 수입금액비율 업종 선택 시 당해 과세기간 수입금액을 입력하세요.`;
    if (!asset.nblRevenueCurrentLandValue || parseAmount(asset.nblRevenueCurrentLandValue) <= 0)
      return `${label}: 수입금액비율 업종 선택 시 당해 토지가액을 입력하세요.`;
    // §168의11③2호 공통수입 안분 토글 ON → 당해 공통수입·그 밖의 토지가액 필수쌍
    if (asset.nblRevenueCommonApportion) {
      if (!asset.nblRevenueCommonRevenue || parseAmount(asset.nblRevenueCommonRevenue) <= 0)
        return `${label}: 공통수입 안분 시 당해 공통수입금액을 입력하세요.`;
      if (!asset.nblRevenueOtherLandValue || parseAmount(asset.nblRevenueOtherLandValue) <= 0)
        return `${label}: 공통수입 안분 시 당해 '그 밖의 토지가액'을 입력하세요.`;
      // 직전 공통쌍은 선택이나 한쪽만 입력 시 나머지도 필수
      const pc = parseAmount(asset.nblRevenuePriorCommonRevenue || "0");
      const po = parseAmount(asset.nblRevenuePriorOtherLandValue || "0");
      if ((pc > 0) !== (po > 0))
        return `${label}: 직전 공통수입 안분은 공통수입금액과 '그 밖의 토지가액'을 함께 입력하세요.`;
    }
  }
  /**
   * 기간·이력 배열의 **행 단위** 필수 입력 (V2-b·A1-02, 2026-09-02 코드리뷰).
   *
   * 서버 매퍼 `mapBusinessUsePeriods`(form-mapper-helpers.ts)는 `.filter(p => p.startDate && p.endDate)`로,
   * `mapAssetToNblInput`의 거주이력은 `if (!s || !e) return []`로 **불완전 행을 조용히 버린다**.
   * 그런데 공용 UI `BusinessUsePeriodsInput`의 「+ 기간 추가」가 만드는 행은 전 필드가 비어 있고,
   * ⑫ Zod도 `z.string()`이라 빈 문자열을 통과시킨다 — 상류에 막는 층이 하나도 없었다.
   *
   * 결과는 지목마다 방향이 다르다(실측 ±57,150,000원):
   *  · 목장 축산기간 drop → 축산업 미영위로 판정되어 **과대**
   *  · 별장 사용기간 drop → 비사용기간이 늘어 주택부수토지로 재분류되어 **과소**
   *  · 농지 자경기간·거주이력 drop → 사용기준·재촌 미충족으로 **과대**
   *
   * 아래 `nblGracePeriods` 검증(§168의14①)이 이미 같은 형태를 구현하고 있다 — 그 sibling 패턴을 따른다.
   */
  const rowArrays: ReadonlyArray<{
    rows: ReadonlyArray<{ startDate?: string; endDate?: string }> | undefined;
    what: string;
    applies: boolean;
  }> = [
    { rows: asset.nblBusinessUsePeriods, what: "사업용 사용기간(자경 등)", applies: true },
    {
      rows: asset.nblPastureLivestockPeriods,
      what: "목장 축산기간",
      applies: asset.nblLandType === "pasture",
    },
    {
      rows: asset.nblVillaUsePeriods,
      what: "별장 사용기간",
      applies: asset.nblLandType === "villa_land",
    },
    { rows: asset.nblResidenceHistories, what: "거주 이력", applies: true },
  ];
  for (const { rows, what, applies } of rowArrays) {
    if (!applies) continue;
    for (const [i, r] of (rows ?? []).entries()) {
      if (!r.startDate)
        return `${label}: ${what} ${i + 1}번째 행 — 시작일을 입력하세요. (미입력 행은 판정에서 제외되어 결과가 달라집니다)`;
      if (!r.endDate)
        return `${label}: ${what} ${i + 1}번째 행 — 종료일을 입력하세요. (미입력 행은 판정에서 제외되어 결과가 달라집니다)`;
    }
  }

  // §168의14①·§83의5① 유예기간 — 사유별 필수 기산일/종료일 (자동 안분 fallback 금지)
  for (const g of asset.nblGracePeriods ?? []) {
    const spec = GRACE_REASON_SPECS[g.reasonCode];
    if (!spec) continue;
    if (spec.lengthKind === "compound_5") {
      if (!g.secondaryDate) return `${label}: 건설 착공(5호) 유예기간 — 착공일을 입력하세요.`;
    } else if (spec.lengthKind === "fixed_from_anchor") {
      if (!spec.anchorFromAcquisition && !g.anchorDate)
        return `${label}: ${spec.label} 유예기간 — 기산일을 입력하세요.`;
    } else {
      // event_window · anchor_to_input_end
      if (!g.anchorDate) return `${label}: ${spec.label} 유예기간 — 개시일을 입력하세요.`;
      if (!g.endDate) return `${label}: ${spec.label} 유예기간 — 종료일을 입력하세요.`;
    }
  }
  return null;
}
