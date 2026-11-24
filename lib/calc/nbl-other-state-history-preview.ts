/**
 * ⑤ 「이 이력으로 나뉜 소유기간」 미리보기 데이터 — **표시 전용**(저장·미러링 없음 · `useMemo`로 호출).
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §3.3 · §5.3-3
 *
 * 구간은 엔진 공용 leaf(`deriveOtherLandStateIntervals`)가 만든다 — ⑦ 결과 카드·판정과 같은 함수라 «입력 화면에서 본 구간 = 결과에서 판정한 구간»이 보장된다.
 * 사건이 모두 유효할 때만 만든다(⑧과 같은 leaf `stateEventSequenceIssue`가 통과해야 한다 — 별도 판정을 재정의하지 않는다).
 *
 * 구간의 «사업용 토지 요건»은 **건축물·재산세 구분 기준만** 확정해 보인다(`isStateIntervalBusiness`). 최종 사업용 여부는 수입금액비율·호별 용도·유예 기간이 더해져
 * 계산 결과에서 정해지므로 마지막 구간(양도일 현재 — core가 판정)은 «결과 계산 후 확정»이다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { differenceInDays } from "@/lib/tax-engine/utc-date";
import { addDays } from "@/lib/tax-engine/utc-date";
import type { HouseCheck, HouseOutcome, LandStateInterval, StateBuildingKind, StateEvent } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { HouseIntervalCtx } from "@/lib/tax-engine/non-business-land/housing-limit";
import { housingStateHistoryIsRead, judgeHousingLimit, resolveHouseInterval } from "@/lib/tax-engine/non-business-land/housing-limit";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { consumesMetropolitanArea } from "@/lib/tax-engine/non-business-land/land-category";
import { eventClosesHouseInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventSubjectOf } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { deriveOtherLandStateIntervals } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isStateIntervalBusiness } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventSequenceIssue } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { getOwnershipStart } from "@/lib/tax-engine/non-business-land/utils/period-math";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";
import { housePriorFootprintIssueOf } from "./nbl-other-state-history-scope";
import { nblHousingStateHistoryApplies } from "./nbl-other-state-history-scope";
import { housePriorNeedsMetropolitanOf } from "./nbl-other-state-history-scope";
import { nblStateEventsInUse } from "./nbl-other-state-history-scope";
import { nblStateHistoryApplies } from "./nbl-other-state-history-scope";
import { stateEventWireRow } from "./nbl-other-state-history-scope";

export interface StateHistoryPreviewRow {
  /** 시작일(포함) ISO */
  start: string;
  /** 마지막 날(종료일 전날 = 반열린 구간의 끝 − 1일) ISO */
  lastDay: string;
  days: number;
  hasBuilding: boolean;
  propertyTaxType: LandStateInterval["propertyTaxType"];
  /** E3-1b — 나대지 구간 선언의 근거 해석(leaf echo). 선언이 없는 구간은 키 없음 = 종전 행과 같다. */
  basisOutcome?: LandStateInterval["basisOutcome"];
  basis?: LandStateInterval["basis"];
  foldReason?: LandStateInterval["foldReason"];
  /** E3-③ A — 주택 구간일 때만(주택부수토지 카드). 없으면 키 없음 = 기타토지 행과 같다. 허용 면적 근거는 leaf 결과(`houseCheck`)를 그대로 읽는다 — 재계산 금지. */
  buildingKind?: StateBuildingKind;
  houseOutcome?: HouseOutcome;
  houseCheck?: HouseCheck;
  /**
   * E3f-2 — 근거 «철거ㆍ멸실»을 받아들인 나대지 구간의 한시 창(구간 안으로 자른 일 단위 — 시작일·마지막 날 ISO · 철거일 당일부터 만료일 당일까지). 없으면 키 없음. 이 구간은 `meetsBuildingRequirement`가 거짓이고 창만 사업용이다.
   * `foldReason`에 새 접힘 사유(`demolished_*`)가 실릴 수 있다. 표시 전용(판정은 엔진 leaf).
   */
  temporaryStatusWindow?: { start: string; lastDay: string; days: number };
  temporaryStatusMonths?: LandStateInterval["temporaryStatusMonths"];
  vacantHouseExtensionUnconfirmed?: LandStateInterval["vacantHouseExtensionUnconfirmed"];
  /** E3f-3 — 창을 영 §103의2 2호 단서(국가 등 공용 사용 기간)로 받았다(라벨 «한시 기간 중 공용 사용 기간만»). 없으면 키 없음. */
  temporaryStatusPublicUse?: LandStateInterval["temporaryStatusPublicUse"];
  /** 마지막 구간(양도일 현재 — 현행 입력이 그대로 판정) */
  isTail: boolean;
  /** 이전 구간의 건축물·재산세 구분 기준 사업용 토지 요건 충족 여부. 마지막 구간은 `null`(계산 결과에서 확정). */
  meetsBuildingRequirement: boolean | null;
}

export interface StateHistoryPreview {
  rows: StateHistoryPreviewRow[];
  /** E3-④ — 엔진 leaf가 만든 구간 원본(Date). 13호 «세대 주택 소유 기간» 미리보기(`buildVacantLotHouseholdPreview`)가 엔진 leaf `vacantLotBusinessIntervals`에 그대로 넘긴다. 행은 이 구간의 문자열 표현이다. */
  intervals: LandStateInterval[];
  totalDays: number;
  /** 양도일 현재 건축물 유무 = 마지막 «건축물 사건» 종류(건축물 사건이 없으면 입력 토글) */
  hasBuildingAtTransfer: boolean;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * **양도일 현재** 정착면적 × 배율 ≤ 토지 면적인가 — 질문 아래 «배율 초과면 이력은 반영하지 않습니다» 안내 1줄용 **표시 전용** 계산(④⑧의 게이트가 아니다 — UQ-7 (다)).
 * 엔진 leaf `judgeHousingLimit`를 그대로 부른다(같은 존·양도일 배율). 입력이 비었거나 읽을 수 없으면 `"unknown"`(안내를 띄우지 않는다). 수도권 미선택이면 수도권 여부가 가르지 않을 때만 확정한다
 * (「수도권 / 수도권 밖」 두 결과가 같을 때) — 어긋나면 `"unknown"`이다(안내 깜빡임 방지 · 판정 아님).
 */
export function housingAreaLimitState(asset: AssetForm, transferDate: string | undefined): "within" | "exceeded" | "unknown" {
  const transfer = toOptionalDate(transferDate);
  if (!transfer || !nblHousingStateHistoryApplies(asset) || !asset.nblZoneType) return "unknown";
  const footprint = parseFloat((asset.nblHousingFootprint ?? "").replace(/,/g, ""));
  const ctx = houseIntervalCtxOf(asset, transfer);
  if (!(footprint > 0) || !(ctx.landArea > 0)) return "unknown";
  // 엔진이 이력을 읽는 조건과 같은 술어(`housingStateHistoryIsRead` — 양도일 현재 배율 이내)를 직접 부른다(UI Low 3 — ⑧ H9·⑤ 안내·`judgeHousingLand`가 한 함수).
  const judge = (isMetropolitanArea: boolean | undefined) => housingStateHistoryIsRead(judgeHousingLimit({ zoneType: ctx.zoneType, isMetropolitanArea, transferDate: transfer, footprint, landArea: ctx.landArea }).limit);
  if (ctx.isMetropolitanArea !== undefined) return judge(ctx.isMetropolitanArea) ? "within" : "exceeded";
  const [a, b] = [judge(true), judge(false)];
  return a === b ? (a ? "within" : "exceeded") : "unknown";
}

/** 미리보기를 그릴 수 있으면 데이터, 아니면 `null`(`changed`가 아님 · 사건 미완성·결함 · 취득일·양도일 미입력). */
/**
 * E3-③ A — 주택부수토지 카드의 과거 주택 구간 판정 맥락. ⑭ 매퍼(`mapAssetToNblInput`)와 **같은 접기 규칙**이다(3중 패턴): 용도지역 미선택 = `undesignated` · 수도권 `yes`/`no` 외 = `undefined`(보수적 수도권) · 면적 못 읽음 = 0.
 * 호출자(⑤ 미리보기·철거 행 허용 면적 미리보기)가 같은 값을 쓴다 — 표시 전용(판정 아님).
 */
export function houseIntervalCtxOf(asset: AssetForm, transferDate: Date): HouseIntervalCtx {
  // 수도권 값은 ④가 서버로 보내는 조건(소비표 지목 ∨ B 술어)일 때만 읽는다 — 아니면 서버(⑭)가 미제공(`undefined`)으로 읽는다. 같은 게이트를 쓰지 않으면 미리보기가 판정과 어긋난다.
  const metro = consumesMetropolitanArea(asset.nblLandType) || housePriorNeedsMetropolitanOf(asset, transferDate) ? asset.nblIsMetropolitanArea : "";
  const area = parseFloat((asset.acquisitionArea ?? "").replace(/,/g, ""));
  return {
    zoneType: (asset.nblZoneType || "undesignated") as ZoneType,
    isMetropolitanArea: metro === "yes" ? true : metro === "no" ? false : undefined,
    landArea: Number.isFinite(area) ? area : 0,
    transferDate,
  };
}

export interface HouseFootprintPreview {
  outcome: HouseOutcome;
  /** `within`·`exceeded`일 때만 — 정착면적 × 배율 = 허용 면적 · 토지 면적 · 초과 면적(leaf가 낸 값). */
  check?: HouseCheck;
}

/** 철거 행 «철거 직전 주택 정착면적» 칸 아래 허용 면적 미리보기(표시 전용) — 입력이 ⑧ 결함이면(빈칸·비수치·0·음수·정착>토지) 또는 양도일을 못 읽으면 null. 엔진 leaf `resolveHouseInterval` 직접 호출. */
export function buildHouseFootprintPreview(asset: AssetForm, i: number, transferDate: string | undefined): HouseFootprintPreview | null {
  const transfer = toOptionalDate(transferDate);
  if (!transfer || !nblStateHistoryApplies(asset)) return null;
  const events = asset.nblOtherStateEvents ?? [];
  const tailKind = nblHousingStateHistoryApplies(asset) ? ("house" as const) : undefined;
  const w = stateEventWireRow(events, i, tailKind === "house" || asset.nblOtherHasBuilding, tailKind);
  if (!eventClosesHouseInterval(events, i, tailKind) || !w.houseFootprintBefore || housePriorFootprintIssueOf(asset, i)) return null;
  const r = resolveHouseInterval(parseFloat(w.houseFootprintBefore.replace(/,/g, "")), houseIntervalCtxOf(asset, transfer));
  return { outcome: r.houseOutcome, ...(r.houseCheck ? { check: r.houseCheck } : {}) };
}

/** 미리보기를 그릴 수 있으면 데이터, 아니면 `null`(`changed`가 아님 · 사건 미완성·결함 · 취득일·양도일 미입력 · 주택 카드는 철거 행 정착면적 결함). */
export function buildStateHistoryPreview(asset: AssetForm, transferDate: string | undefined, floorDate?: string): StateHistoryPreview | null {
  if (!nblStateEventsInUse(asset)) return null;
  const acq = toOptionalDate(nblAcquisitionDateOf(asset));
  const transfer = toOptionalDate(transferDate);
  if (!acq || !transfer || !transferDate) return null;
  const rows = asset.nblOtherStateEvents ?? [];
  // E3-③ — 주택 카드: 사건 주체 `house`(D-1·D-2 구조 규칙 포함 — `deriveOtherLandStateIntervals`가 어기면 던지므로 ⑧과 같은 leaf를 먼저 통과해야 한다) · 철거 행 정착면적 ⑧ 결함이 있으면 그린 표가 판정과 어긋나므로 그리지 않는다.
  const house = nblHousingStateHistoryApplies(asset);
  if (stateEventSequenceIssue(rows, { transferDate, floorDate, subject: stateEventSubjectOf(asset.nblLandType) })) return null;
  // B(기타토지) 주택 철거 행도 같다 — 정착면적 ⑧ 결함이 있으면 판정과 어긋난 표를 그리지 않는다.
  if (rows.some((_, i) => housePriorFootprintIssueOf(asset, i))) return null;

  // E3-1b — 전송형(`stateEventWireRow`)을 그대로 쓴다: ④ 와이어·⑭ 매퍼와 같은 «나대지 구간을 닫는 행만 선언 칸을 싣는다» 규칙이라 미리보기 = 계산에 쓰인 구간이다.
  const events: StateEvent[] = rows.map((_, i) => {
    const w = stateEventWireRow(rows, i, house || asset.nblOtherHasBuilding, house ? "house" : undefined);
    return {
      kind: w.kind as StateEvent["kind"],
      date: toOptionalDate(w.date)!, // issue 없음 → 해석 가능
      propertyTaxTypeBefore: w.propertyTaxTypeBefore,
      propertyTaxBasisBefore: w.propertyTaxBasisBefore,
      areaWithinLimitBefore: w.areaWithinLimitBefore,
      ...(w.houseFootprintBefore ? { houseFootprintBefore: parseFloat(w.houseFootprintBefore.replace(/,/g, "")) } : {}),
      ...(w.buildingKindBefore ? { buildingKindBefore: w.buildingKindBefore } : {}),
      // E3f-2 — 근거 «철거ㆍ멸실»의 사실 칸(④ 와이어가 요구 칸만 싣는다 — ⑭ 매퍼와 같은 읽기). 키가 없으면 «미선택»이다.
      ...(w.demolishedPermitBefore ? { demolishedPermitBefore: w.demolishedPermitBefore } : {}),
      ...(w.demolishedOtherUseBefore ? { demolishedOtherUseBefore: w.demolishedOtherUseBefore } : {}),
      ...(w.demolishedVacantHouseBefore ? { demolishedVacantHouseBefore: w.demolishedVacantHouseBefore } : {}),
      // E3f-3 — 영 §103의2 2호 단서 하위 칸(④ 와이어가 `demolishedPublicUseAsked`로 연 칸만 싣는다). 날짜는 문자열 → Date(`toOptionalDate` — ⑭ 매퍼와 같은 읽기).
      ...(w.demolishedPublicUseBefore ? { demolishedPublicUseBefore: w.demolishedPublicUseBefore } : {}),
      ...(w.demolishedPublicUsePaidBefore ? { demolishedPublicUsePaidBefore: w.demolishedPublicUsePaidBefore } : {}),
      ...(toOptionalDate(w.demolishedPublicUseFromBefore) ? { demolishedPublicUseFromBefore: toOptionalDate(w.demolishedPublicUseFromBefore) } : {}),
      ...(toOptionalDate(w.demolishedPublicUseToBefore) ? { demolishedPublicUseToBefore: toOptionalDate(w.demolishedPublicUseToBefore) } : {}),
      ...(Number.isFinite(parseFloat((w.demolishedFloorAreaBefore ?? "").replace(/,/g, ""))) ? { demolishedFloorAreaBefore: parseFloat((w.demolishedFloorAreaBefore ?? "").replace(/,/g, "")) } : {}),
    };
  });
  const intervals = deriveOtherLandStateIntervals(
    events,
    getOwnershipStart(acq),
    transfer,
    house
      ? { hasBuilding: true, propertyTaxType: "unknown", buildingKind: "house", houseCtx: houseIntervalCtxOf(asset, transfer) }
      : {
          hasBuilding: asset.nblOtherHasBuilding,
          propertyTaxType: (asset.nblOtherPropertyTaxType || "comprehensive") as LandStateInterval["propertyTaxType"],
          // E3-③ B — «철거된 건축물 = 주택» 행이 있으면 판정 맥락(배율·토지 면적·수도권 — apply와 같은 값)이 필수다(없으면 leaf가 던진다). 주택 행이 없으면 leaf가 읽지 않는다(종전과 바이트 동일).
          houseCtx: houseIntervalCtxOf(asset, transfer),
        },
  );
  if (intervals.length === 0) return null;

  const out = intervals.map((iv, i): StateHistoryPreviewRow => {
    const isTail = i === intervals.length - 1;
    const last = new Date(iv.end);
    last.setUTCDate(last.getUTCDate() - 1);
    return {
      start: iso(iv.start),
      lastDay: iso(last),
      days: differenceInDays(iv.end, iv.start),
      hasBuilding: iv.hasBuilding,
      propertyTaxType: iv.propertyTaxType,
      ...(iv.basisOutcome ? { basisOutcome: iv.basisOutcome, ...(iv.basis ? { basis: iv.basis } : {}), ...(iv.foldReason ? { foldReason: iv.foldReason } : {}) } : {}),
      ...(iv.temporaryStatusWindow
        ? {
            temporaryStatusWindow: {
              start: iso(iv.temporaryStatusWindow.start),
              lastDay: iso(addDays(iv.temporaryStatusWindow.end, -1)),
              days: differenceInDays(iv.temporaryStatusWindow.end, iv.temporaryStatusWindow.start),
            },
            ...(iv.temporaryStatusMonths ? { temporaryStatusMonths: iv.temporaryStatusMonths } : {}),
            ...(iv.temporaryStatusPublicUse ? { temporaryStatusPublicUse: iv.temporaryStatusPublicUse } : {}),
            ...(iv.vacantHouseExtensionUnconfirmed ? { vacantHouseExtensionUnconfirmed: iv.vacantHouseExtensionUnconfirmed } : {}),
          }
        : {}),
      ...(iv.buildingKind ? { buildingKind: iv.buildingKind, ...(iv.houseOutcome ? { houseOutcome: iv.houseOutcome } : {}), ...(iv.houseCheck ? { houseCheck: iv.houseCheck } : {}) } : {}),
      isTail,
      meetsBuildingRequirement: isTail ? null : isStateIntervalBusiness(iv),
    };
  });
  return {
    rows: out,
    intervals,
    totalDays: out.reduce((s, r) => s + r.days, 0),
    hasBuildingAtTransfer: intervals[intervals.length - 1].hasBuilding,
  };
}
