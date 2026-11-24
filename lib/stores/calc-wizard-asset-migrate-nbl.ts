import { NBL_STATE_HISTORY_MODE_VALUES } from "@/lib/tax-engine/non-business-land/nbl-enum-values";
import { eventCarriesBuildingKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventCarriesTaxTypeBefore } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventClosesBareInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventClosesHouseInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { NBL_AREA_WITHIN_LIMIT_VALUES } from "@/lib/tax-engine/non-business-land/nbl-enum-values";
import { NBL_DEMOLISHED_FACT_VALUES } from "@/lib/tax-engine/non-business-land/nbl-enum-values";
import type { DemolishedFact } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { PROPERTY_TAX_BASIS_VALUES } from "@/lib/tax-engine/non-business-land/property-tax-basis";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";

/**
 * NBL2611-B1 복원 정규화 — `migrateAsset`(800줄 정책)에서 분리. 이력·sessionStorage 복원 자산에 호출한다. `a`를 직접 변형한다.
 *
 * · V1-A `nblOtherPropertyTaxBasis`·`nblOtherDemolishedFloorArea` — 구 이력에는 칸이 없다 → 미선택·빈 값(근거 미선택 = 종합합산 + 확인 필요, 종전 세액과 같다).
 * · Q-12 `nblVillaNoUseConfirmed` — 구 이력에는 칸이 없다 → 미확인(false). 별장 사용기간 0행이면 ⑧이 확인을 요구한다.
 * · Q-10 (나) 레거시 「거주·사업 직접 관련」(`nblOtherIsRelatedToResidence`) — 현재 화면에서는 켤 수 없는 칸인데 구 이력에
 *   남아 «호 미설정 시 사업용» fallback(엔진 OR)으로 판정을 덮었고, 호 「해당 없음」 명시까지 이겼다. 「모름 = 혜택 불성립 +
 *   확인 필요」(2026-10-04) 원칙에 따라 false로 정규화하고, 호가 비어 있던 이력에는 「호 재선택」 고지 표지를 세운다.
 *   표지는 사용자가 호를 고르면 화면이 끈다(`OtherLandDetailSection` onChange — useEffect 미러링 아님).
 *   호가 이미 실제 호(해당 없음 제외)면 boolean은 결과에 영향이 없던 값이라 조용히 false로만 접는다.
 */
export function migrateNblB1Fields(a: Record<string, unknown>): void {
  migrateNblStateHistory(a);
  migrateNblRevenuePeriod(a);
  migrateNblHouseholdHouse(a);
  // NBL2611-V1-A (Q-1) — 구 이력에는 «재산세 분류 근거» 칸이 없다 → 미선택. 건축물 없는 토지의 비종합합산 선언은 종전에도 종합합산이었고(PR#291 override)
  // 이제 «근거 미선택 → 종합합산 + 확인 필요»로 읽혀 세액은 그대로다. 사용자가 근거를 고르면 그 근거로 판정한다.
  if (a.nblOtherPropertyTaxBasis === undefined) a.nblOtherPropertyTaxBasis = "";
  if (a.nblOtherDemolishedFloorArea === undefined) a.nblOtherDemolishedFloorArea = "";
  // E3-⑤ E3f-1b — 철거ㆍ멸실일 칸: 구 이력에는 없다 → 빈 값. 날짜를 추정해 채우지 않는다(자동 fallback 금지) — 근거 «철거ㆍ멸실» 구 세션은 ⑧이 칸을 요구·안내한다.
  if (a.nblOtherDemolishedOn === undefined) a.nblOtherDemolishedOn = "";
  if (a.nblVillaNoUseConfirmed === undefined) a.nblVillaNoUseConfirmed = false;
  if (a.nblOtherLegacyRelatedReselect === undefined) a.nblOtherLegacyRelatedReselect = false;
  if (a.nblOtherIsRelatedToResidence === true) {
    const ho = a.nblOtherRelatedBusinessType;
    if (ho === undefined || ho === "" || ho === "none") a.nblOtherLegacyRelatedReselect = true;
    a.nblOtherIsRelatedToResidence = false;
  }
}

/**
 * NBL-STATE-HISTORY-U0 — 기타토지 소유기간 중 건축물 이력(`nblOtherStateHistoryMode`·`nblOtherStateEvents`) 복원 정규화.
 *
 * 칸 없음(`undefined`)은 `fillMissingFromFactory`도 채우지만 여기서 먼저 같은 값으로 채운다. 이 함수가 더하는 것은 **값·행 수준 방어**다:
 *  · 모드가 허용값 밖이면 `""`(미선택). **`""`을 `unchanged`로 접지 않는다** — 미입력 ≠ 미해당(⑧이 질문을 요구한다).
 *  · 사건이 배열이 아니면 `[]`. 행이 객체가 아니면 빈 행. 행의 `kind`·`propertyTaxTypeBefore`가 허용값 밖이면 `""`, `date`가 문자열이 아니면 `""`.
 *    허용값 밖 `kind`는 ⑧이 행 단위로 짚는다(침묵 제거 금지).
 *  · E3-1b — 신축 행도 나대지 구간을 닫으므로 `propertyTaxTypeBefore`를 보존한다(유효 종류 모두 운반). 선언 칸 2개(`propertyTaxBasisBefore`·`areaWithinLimitBefore`)는
 *    **값이 허용값 안이고 그 종류의 행이 나대지 구간을 닫을 수 있을 때만** 남기고, 키가 없던 행에는 키를 만들지 않는다(구 스냅샷 byte-identical).
 *    행이 지금 나대지를 닫는지(건축물 토글)는 여기서 보지 않는다 — 숨은 값은 보존하고 ④가 갈래에 맞을 때만 보낸다(토글을 되돌리면 복원).
 *  · E3-③ B — 철거 행의 `buildingKindBefore`는 `"house"`만 남긴다(키가 없던 행에는 만들지 않는다).
 */
function migrateNblStateHistory(a: Record<string, unknown>): void {
  if (!(NBL_STATE_HISTORY_MODE_VALUES as readonly unknown[]).includes(a.nblOtherStateHistoryMode)) a.nblOtherStateHistoryMode = "";
  if (!Array.isArray(a.nblOtherStateEvents)) {
    a.nblOtherStateEvents = [];
    return;
  }
  a.nblOtherStateEvents = (a.nblOtherStateEvents as unknown[]).map((row) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const kind = typeof r.kind === "string" && isEventKind(r.kind) ? r.kind : "";
    const before = typeof r.propertyTaxTypeBefore === "string" && Object.hasOwn(PROPERTY_TAX_TYPE_LABEL, r.propertyTaxTypeBefore) ? r.propertyTaxTypeBefore : "";
    // 이 종류의 행이 나대지 구간을 «닫을 수 있는가» — 토글과 무관하게 종류만 본다(`eventClosesBareInterval` 한 행짜리 호출: 신축·구분 변경 = true · 멸실·미선택 = false).
    const mayCloseBare = eventClosesBareInterval([{ kind }], 0, false);
    const basis = typeof r.propertyTaxBasisBefore === "string" && (PROPERTY_TAX_BASIS_VALUES as readonly string[]).includes(r.propertyTaxBasisBefore) ? r.propertyTaxBasisBefore : "";
    const limit = typeof r.areaWithinLimitBefore === "string" && (NBL_AREA_WITHIN_LIMIT_VALUES as readonly string[]).includes(r.areaWithinLimitBefore) ? r.areaWithinLimitBefore : "";
    // E3-③ A — 철거 행의 «철거 직전 주택 정착면적»: **문자열일 때만** 보존하고 키가 없던 행에는 만들지 않는다(구 스냅샷 byte-identical). 주택 구간을 닫는 행인지(주택 카드)는 지목에 달려 있어
    // 여기서 보지 않는다 — 숨은 값은 보존하고 ④가 `eventClosesHouseInterval`이 참인 행에서만 보낸다(지목을 되돌리면 복원).
    const footprint = eventClosesHouseInterval([{ kind }], 0, "house") && typeof r.houseFootprintBefore === "string" ? r.houseFootprintBefore : "";
    // E3-③ B — 기타토지 철거 행의 «철거된 건축물 종류»: `"house"`만 허용하고 철거 행에서만 보존한다. 키가 없던 행·`""`·허용값 밖은 키를 만들지 않는다(구 스냅샷 byte-identical = 주택 아닌 건축물).
    // 종류 칸이 의미를 갖는 지목(기타토지 — 주택 카드는 칸이 없다)은 여기서 보지 않는다 — 숨은 값은 보존하고 ④가 `eventClosesHouseInterval`이 참인 행에서만 보낸다.
    const buildingKind = eventCarriesBuildingKind(kind) && r.buildingKindBefore === "house" ? ("house" as const) : undefined;
    // E3-⑤ E3f-2 — 나대지 구간 근거 «철거ㆍ멸실»의 사실 3지선다 + 바닥면적: **허용값 안이고 나대지를 닫을 수 있는 행일 때만** 남기고, 키가 없던 행에는 키를 만들지 않는다(구 스냅샷 byte-identical).
    // 행이 지금 철거 행 뒤인지·근거가 `demolished`인지·어느 칸이 요구되는지는 여기서 보지 않는다 — 숨은 값은 보존하고 ④가 `demolishedRequiredFacts`가 요구하는 칸만 보낸다(되돌리면 복원).
    const fact = (v: unknown) => (typeof v === "string" && (NBL_DEMOLISHED_FACT_VALUES as readonly string[]).includes(v) ? v : "");
    const permit = mayCloseBare ? fact(r.demolishedPermitBefore) : "";
    const otherUse = mayCloseBare ? fact(r.demolishedOtherUseBefore) : "";
    const vacantHouse = mayCloseBare ? fact(r.demolishedVacantHouseBefore) : "";
    const floorArea = mayCloseBare && typeof r.demolishedFloorAreaBefore === "string" ? r.demolishedFloorAreaBefore : "";
    // E3f-3 — 영 §103의2 2호 단서 하위 칸(3지선다 2칸 + 날짜 문자열 2칸): 같은 규약 — 허용값·문자열일 때만, 키가 없던 행에는 만들지 않는다(byte-identical).
    const publicUse = mayCloseBare ? fact(r.demolishedPublicUseBefore) : "";
    const publicPaid = mayCloseBare ? fact(r.demolishedPublicUsePaidBefore) : "";
    const publicFrom = mayCloseBare && typeof r.demolishedPublicUseFromBefore === "string" ? r.demolishedPublicUseFromBefore : "";
    const publicTo = mayCloseBare && typeof r.demolishedPublicUseToBefore === "string" ? r.demolishedPublicUseToBefore : "";
    return {
      kind,
      date: typeof r.date === "string" ? r.date : "",
      propertyTaxTypeBefore: eventCarriesTaxTypeBefore(kind) || mayCloseBare ? before : "",
      ...(mayCloseBare && basis ? { propertyTaxBasisBefore: basis } : {}),
      ...(mayCloseBare && limit ? { areaWithinLimitBefore: limit } : {}),
      ...(footprint ? { houseFootprintBefore: footprint } : {}),
      ...(buildingKind ? { buildingKindBefore: buildingKind } : {}),
      ...(permit ? { demolishedPermitBefore: permit as DemolishedFact } : {}),
      ...(otherUse ? { demolishedOtherUseBefore: otherUse as DemolishedFact } : {}),
      ...(vacantHouse ? { demolishedVacantHouseBefore: vacantHouse as DemolishedFact } : {}),
      ...(floorArea ? { demolishedFloorAreaBefore: floorArea } : {}),
      ...(publicUse ? { demolishedPublicUseBefore: publicUse as DemolishedFact } : {}),
      ...(publicPaid ? { demolishedPublicUsePaidBefore: publicPaid as DemolishedFact } : {}),
      ...(publicFrom ? { demolishedPublicUseFromBefore: publicFrom } : {}),
      ...(publicTo ? { demolishedPublicUseToBefore: publicTo } : {}),
    };
  });
}

/**
 * NBL-STATE-HISTORY-E3-② — 업종 영위 기간(`nblRevenuePeriodOn`·`nblRevenueBusinessEndDate`·`nblRevenueYearRows`) 복원 정규화.
 *
 * 키가 없던 구 저장값에는 «꺼짐·빈 폐업일·빈 표»만 채운다(= 종전 판정과 같다 — 현행 경로). 이미 값이 있으면 **형만** 방어한다:
 *  · 토글이 boolean이 아니면 꺼짐 · 폐업일이 문자열이 아니면 `""`.
 *  · 표가 배열이 아니면 `[]`. 행은 객체이고 `year`가 4자리 문자열일 때만 남기고, 금액이 문자열이 아니면 `""`. **같은 연도는 마지막 행만** 남긴다.
 * 범위 밖 연도의 행은 지우지 않는다 — 개시일·양도일을 되돌리면 복원된다(④가 범위 안 연도만 보낸다).
 */
function migrateNblRevenuePeriod(a: Record<string, unknown>): void {
  if (typeof a.nblRevenuePeriodOn !== "boolean") a.nblRevenuePeriodOn = false;
  if (typeof a.nblRevenueBusinessEndDate !== "string") a.nblRevenueBusinessEndDate = "";
  if (!Array.isArray(a.nblRevenueYearRows)) {
    a.nblRevenueYearRows = [];
    return;
  }
  const byYear = new Map<string, { year: string; revenue: string; landValue: string }>();
  for (const row of a.nblRevenueYearRows as unknown[]) {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    if (typeof r.year !== "string" || !/^\d{4}$/.test(r.year)) continue;
    byYear.set(r.year, { year: r.year, revenue: typeof r.revenue === "string" ? r.revenue : "", landValue: typeof r.landValue === "string" ? r.landValue : "" });
  }
  a.nblRevenueYearRows = [...byYear.values()];
}

/**
 * NBL-STATE-HISTORY-E3-④ — 13호 「세대 주택 소유 기간」(`nblOtherHouseholdHouseStatus`·`nblOtherHouseholdHousePeriods`) 복원 정규화.
 *
 * 구 저장값에는 두 칸이 없다 → 질문 **미선택(`""`)** · 빈 행. **`""`을 `none`(무주택 선언)으로 채우지 않는다**(UQ-8 (가) — 사용자 대신 «무주택 선언»을 하는 침묵 가정 · 자동 fallback 금지) —
 * 13호 + 엔진이 행을 읽는 상태이면 ⑧이 질문을 요구해 막고 안내한다. 이미 값이 있으면 **형만** 방어한다:
 *  · 상태가 허용값 밖이면 `""`. 행 배열이 아니면 `[]`. 행은 객체일 때만 남기고(비객체 제거) `startDate`·`endDate`가 문자열이 아니면 `""`.
 *  · **날짜 문자열의 형식은 지우지 않는다** — 잘못된 값은 ⑧(HH-3)이 막아야 침묵 소실이 없다.
 */
function migrateNblHouseholdHouse(a: Record<string, unknown>): void {
  if (a.nblOtherHouseholdHouseStatus !== "none" && a.nblOtherHouseholdHouseStatus !== "owned") a.nblOtherHouseholdHouseStatus = "";
  if (!Array.isArray(a.nblOtherHouseholdHousePeriods)) {
    a.nblOtherHouseholdHousePeriods = [];
    return;
  }
  a.nblOtherHouseholdHousePeriods = (a.nblOtherHouseholdHousePeriods as unknown[])
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const r = row as Record<string, unknown>;
      return { startDate: typeof r.startDate === "string" ? r.startDate : "", endDate: typeof r.endDate === "string" ? r.endDate : "" };
    });
}
