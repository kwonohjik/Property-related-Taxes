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
import type { LandStateInterval, StateEvent } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { deriveOtherLandStateIntervals } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventCarriesTaxTypeBefore } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isStateIntervalBusiness } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventSequenceIssue } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { getOwnershipStart } from "@/lib/tax-engine/non-business-land/utils/period-math";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";
import { nblOtherStateEventsInUse } from "./nbl-other-state-history-scope";

export interface StateHistoryPreviewRow {
  /** 시작일(포함) ISO */
  start: string;
  /** 마지막 날(종료일 전날 = 반열린 구간의 끝 − 1일) ISO */
  lastDay: string;
  days: number;
  hasBuilding: boolean;
  propertyTaxType: LandStateInterval["propertyTaxType"];
  /** 마지막 구간(양도일 현재 — 현행 입력이 그대로 판정) */
  isTail: boolean;
  /** 이전 구간의 건축물·재산세 구분 기준 사업용 토지 요건 충족 여부. 마지막 구간은 `null`(계산 결과에서 확정). */
  meetsBuildingRequirement: boolean | null;
}

export interface StateHistoryPreview {
  rows: StateHistoryPreviewRow[];
  totalDays: number;
  /** 양도일 현재 건축물 유무 = 마지막 «건축물 사건» 종류(건축물 사건이 없으면 입력 토글) */
  hasBuildingAtTransfer: boolean;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 미리보기를 그릴 수 있으면 데이터, 아니면 `null`(`changed`가 아님 · 사건 미완성·결함 · 취득일·양도일 미입력). */
export function buildStateHistoryPreview(asset: AssetForm, transferDate: string | undefined, floorDate?: string): StateHistoryPreview | null {
  if (!nblOtherStateEventsInUse(asset)) return null;
  const acq = toOptionalDate(nblAcquisitionDateOf(asset));
  const transfer = toOptionalDate(transferDate);
  if (!acq || !transfer || !transferDate) return null;
  const rows = asset.nblOtherStateEvents ?? [];
  // E3-① — ⑧·⑫와 같은 값(`tailHasBuilding` = 입력 토글)을 넘긴다. 빠지면 «건축물 없음»으로 읽혀 tax-only 이력의 미리보기가 null이 된다.
  if (stateEventSequenceIssue(rows, { transferDate, floorDate, tailHasBuilding: asset.nblOtherHasBuilding })) return null;

  const events: StateEvent[] = rows.map((e) => ({
    kind: e.kind as StateEvent["kind"],
    date: toOptionalDate(e.date)!, // issue 없음 → 해석 가능
    propertyTaxTypeBefore: eventCarriesTaxTypeBefore(e.kind) ? e.propertyTaxTypeBefore : undefined,
  }));
  const intervals = deriveOtherLandStateIntervals(events, getOwnershipStart(acq), transfer, {
    hasBuilding: asset.nblOtherHasBuilding,
    propertyTaxType: (asset.nblOtherPropertyTaxType || "comprehensive") as LandStateInterval["propertyTaxType"],
  });
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
      isTail,
      meetsBuildingRequirement: isTail ? null : isStateIntervalBusiness(iv),
    };
  });
  return {
    rows: out,
    totalDays: out.reduce((s, r) => s + r.days, 0),
    hasBuildingAtTransfer: intervals[intervals.length - 1].hasBuilding,
  };
}
