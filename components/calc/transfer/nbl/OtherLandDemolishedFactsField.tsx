"use client";

/**
 * 나대지 구간 근거 «철거ㆍ멸실» 사실 칸 블록 — NBL-STATE-HISTORY-E3-⑤ E3f-2 (U-3 · 계획서 `…e3-5-demolition-temp-status.ui.plan.md` §4.3 · §4.4).
 *
 * `OtherLandBareIntervalFields`가 근거 «철거ㆍ멸실»을 고른 행(철거 행 뒤 나대지 구간을 닫는 행)에서만 그린다. 화면 순서 = 계산 순서:
 *   ① 철거일·구간(읽기 전용) → ② 허가·사용승인 → ③ 철거 후 건축 외 용도 → ④a 빈집정비(주택 철거 행) → (E3f-3 · U-4) 국가 등 공용·공공용 사용 예외 하위 4칸(`OtherLandDemolishedPublicUseField`) / ④b 종전 바닥면적(비주택 철거 행) → 인정 창·접힘 미리보기.
 * 어느 칸이 보이는가는 엔진 `demolishedRequiredFacts`(= ④ 전송 = ⑧ 차단 = ⑫′ 400 — 노출 ≡ 필수)를 `nbl-demolished-row-scope.ts`가 한 곳에서 부른 값이다. UI는 날짜·시행본을 비교하지 않는다.
 * 선택지 값 `""`은 «미선택»이다 — 가정값 없음(노출된 칸의 미선택은 ⑧이 막는다 · 명시 «모름»은 혜택 불성립 + 확인 필요).
 * 미리보기(인정 창·접힘 사유)는 엔진 구간 해석(`buildStateHistoryPreview`가 낸 행)을 읽을 뿐이다 — 판정·계산 0 · 저장·전송 없음. 사실 칸이 모두 답해진 뒤에만 보인다.
 * 이 컴포넌트는 `useEffect → store` 미러링이 없다(전부 렌더 파생 · 쓰기는 onChange).
 */
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { OtherLandDemolishedPublicUseField } from "@/components/calc/transfer/nbl/OtherLandDemolishedPublicUseField";
import type { DemolishedRowView } from "@/lib/calc/nbl-demolished-row-scope";
import { demolishedRowUnansweredField } from "@/lib/calc/nbl-demolished-row-scope";
import type { StateHistoryPreviewRow } from "@/lib/calc/nbl-other-state-history-preview";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { DemolishedFact } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { BARE_DEMOLISHED_FOLD_NOTICE } from "@/lib/tax-engine/non-business-land/state-history-echo";

type Answer = Exclude<DemolishedFact, "">;

/** 3지선다 선택지 — 값은 `yes`·`no`·`unknown`, 뜻은 칸마다 다르다(허가: yes = 받음 · 건축 외 용도: yes = 건축 외 용도로 사용 · 빈집정비: yes = 빈집정비사업으로 철거). 순서는 «혜택 쪽 답이 먼저»가 아니라 질문 문장 순서다. */
function answerOptions(i: number, key: string, order: readonly Answer[], labels: Record<Answer, string>): RadioCardOption<Answer>[] {
  return order.map((v) => ({ value: v, label: labels[v], testId: `nbl-other-state-event-${i}-demolished-${key}-${v}` }));
}

const PERMIT_LABELS = { yes: "예", no: "아니오", unknown: "모름" } as const satisfies Record<Answer, string>;
const OTHER_USE_LABELS = { no: "아니오", yes: "예", unknown: "모름" } as const satisfies Record<Answer, string>;
const VACANT_LABELS = { yes: "예", no: "아니오", unknown: "모름" } as const satisfies Record<Answer, string>;

/** 한시 기간(개월) → 법문 표현. 12 = 2026.6.1.~ 시행본 «1년». */
const MONTHS_TEXT = { 6: "6개월", 12: "1년", 36: "3년" } as const;

interface Props {
  /** 사건 행 번호(0부터). */
  index: number;
  idKey: string;
  /** 저장값 그대로의 행 — 사실 칸 4개는 여기서 읽고 쓴다(숨은 stale 값은 보존한다). */
  event: NblOtherStateEventInput;
  view: DemolishedRowView;
  /** 이 행이 닫은 구간의 미리보기 행(표시 전용). 미리보기를 그릴 수 없으면 없다. */
  closedRow?: StateHistoryPreviewRow;
  patchEvent: (patch: Partial<NblOtherStateEventInput>) => void;
}

export function OtherLandDemolishedFactsField({ index: i, idKey, event: ev, view, closedRow, patchEvent }: Props) {
  const { need } = view;
  const anyNeeded = need.permit || need.otherUse || need.vacantHouse || need.floorArea;
  const unanswered = demolishedRowUnansweredField(ev, view);
  // 인정 창·접힘 미리보기는 사실 칸이 모두 답해진 뒤(UQ-10 — 미답 상태에서 «허가 미확인으로 접힘»을 보이면 선언 전부터 불이익처럼 읽힌다).
  const showOutcome = view.datesReadable && !unanswered && !!closedRow?.basisOutcome;
  const win = closedRow?.temporaryStatusWindow;
  const foldReason = closedRow?.basisOutcome === "unconfirmed" ? closedRow.foldReason : undefined;
  const foldNotice = foldReason && Object.hasOwn(BARE_DEMOLISHED_FOLD_NOTICE, foldReason) ? BARE_DEMOLISHED_FOLD_NOTICE[foldReason as keyof typeof BARE_DEMOLISHED_FOLD_NOTICE] : undefined;

  return (
    <ToneCard tone="amber" title="철거 후 한시 별도합산 사실 확인">
      <div className="space-y-3" data-testid={`nbl-other-state-event-${i}-demolished`}>
        <p className="text-caption leading-snug text-muted-foreground" data-testid={`nbl-other-state-event-${i}-demolished-removed-on`}>
          철거일: {view.removedOn || "미입력"}(위 「건축물 멸실·철거·붕괴」 행)
          {closedRow ? ` · 이 나대지 구간: ${closedRow.start} ~ ${closedRow.lastDay}` : ""}
        </p>

        {!view.datesReadable && (
          <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-demolished-dates-notice`}>
            사건일을 입력하면 필요한 사실 칸이 표시됩니다.
          </p>
        )}

        {need.permit && (
          <FieldCard
            label="철거된 건축물(주택)이 건축 관계 법령상 허가·사용승인을 받은 것이었습니까?"
            required
            hint="건축 관계 법령에 따라 허가 등을 받아야 하는데 받지 않았거나 사용승인(임시사용승인 포함)을 받아야 하는데 받지 않은 건축물 또는 주택의 부속토지는 한시 별도합산에서 제외됩니다. 건축물대장·허가대장으로 확인하세요 — 모름은 인정하지 않고 확인 필요로 표시합니다."
          >
            <RadioCardGroup
              name={`nblOtherStateDemolishedPermit-${idKey}-${i}`}
              tone="amber"
              layout="inline"
              options={answerOptions(i, "permit", ["yes", "no", "unknown"], PERMIT_LABELS)}
              value={ev.demolishedPermitBefore ?? ""}
              onChange={(v) => patchEvent({ demolishedPermitBefore: v })}
              data-field={`nblOtherStateEvents.${i}.demolishedPermitBefore`}
            />
          </FieldCard>
        )}

        {need.otherUse && (
          <FieldCard
            label="철거 후 그 토지를 건축을 위한 용도 외의 다른 용도로 사용했습니까?"
            required
            hint={`철거한 뒤 그 토지를 건축을 위한 용도 외의 다른 용도로 사용했으면 그 부분은 한시 별도합산에서 제외됩니다(그 용도가 무엇인지는 묻지 않습니다). 모름은 인정하지 않고 확인 필요로 표시합니다.${need.vacantHouse ? " 빈집정비사업으로 철거한 빈집이면 아래 빈집정비 칸에서 «예»를 고르면 국가 등 공공용 사용 예외를 추가로 묻습니다." : ""}`}
          >
            <RadioCardGroup
              name={`nblOtherStateDemolishedOtherUse-${idKey}-${i}`}
              tone="amber"
              layout="inline"
              options={answerOptions(i, "otheruse", ["no", "yes", "unknown"], OTHER_USE_LABELS)}
              value={ev.demolishedOtherUseBefore ?? ""}
              onChange={(v) => patchEvent({ demolishedOtherUseBefore: v })}
              data-field={`nblOtherStateEvents.${i}.demolishedOtherUseBefore`}
            />
          </FieldCard>
        )}

        {need.vacantHouse && (
          <FieldCard
            label="철거된 주택이 빈집정비사업 등으로 철거된 빈집이었습니까?"
            required
            hint="「빈집 및 소규모주택 정비에 관한 특례법」 빈집정비사업 등으로 철거한 빈집이면 «예»입니다. 예는 철거일부터 3년, 아니오·모름은 일반 한시 기간(6개월 · 2026.6.1.~ 1년)만 인정하고 3년 연장은 확인 필요로 표시합니다."
          >
            <RadioCardGroup
              name={`nblOtherStateDemolishedVacantHouse-${idKey}-${i}`}
              tone="amber"
              layout="inline"
              options={answerOptions(i, "vacanthouse", ["yes", "no", "unknown"], VACANT_LABELS)}
              value={ev.demolishedVacantHouseBefore ?? ""}
              onChange={(v) => patchEvent({ demolishedVacantHouseBefore: v })}
              data-field={`nblOtherStateEvents.${i}.demolishedVacantHouseBefore`}
            />
          </FieldCard>
        )}

        <OtherLandDemolishedPublicUseField index={i} idKey={idKey} event={ev} view={view} patchEvent={patchEvent} />

        {need.floorArea && (
          <FieldCard
            field={`nblOtherStateEvents.${i}.demolishedFloorAreaBefore`}
            label="철거 전 건축물 바닥면적"
            unit="㎡"
            required
            hint="철거ㆍ멸실되기 전 건축물의 바닥면적(건축물 외의 시설은 수평투영면적)입니다. 이 면적에 용도지역별 적용배율을 곱한 범위가 인정되고, 부속토지가 그보다 넓으면 그 구간 전체를 종합합산으로 보며 안분하지 않습니다. 용도지역은 위 토지 정보의 값을 씁니다."
          >
            <DecimalInput
              value={ev.demolishedFloorAreaBefore ?? ""}
              onChange={(v) => patchEvent({ demolishedFloorAreaBefore: v })}
              data-testid={`nbl-other-state-event-${i}-demolished-floorarea`}
            />
          </FieldCard>
        )}

        {view.datesReadable && !anyNeeded && (
          <p className="text-caption leading-snug text-muted-foreground" data-testid={`nbl-other-state-event-${i}-demolished-no-facts`}>
            이 구간에서는 입력할 사실 칸이 없습니다 — 한시 기간 안에 과세기준일이 있는지가 판정을 정합니다.
          </p>
        )}

        {view.kind === "house" && (
          <p className="text-caption leading-snug text-muted-foreground" data-testid={`nbl-other-state-event-${i}-demolished-house-area-notice`}>
            {NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE}
          </p>
        )}

        {showOutcome && win && closedRow && (
          <div className="space-y-1.5" data-testid={`nbl-other-state-event-${i}-demolished-outcome`}>
            <p className="text-xs font-medium" data-testid={`nbl-other-state-event-${i}-demolished-window`}>
              한시 지위 인정 기간: {win.start} ~ {win.lastDay}({win.days.toLocaleString()}일{closedRow.temporaryStatusMonths ? ` · 한시 기간 ${MONTHS_TEXT[closedRow.temporaryStatusMonths]}` : ""}{closedRow.temporaryStatusPublicUse && !closedRow.temporaryStatusPublicUseMixed ? " · 국가 등 공용 사용 기간만" : ""}{closedRow.temporaryStatusPublicUseMixed && !closedRow.temporaryStatusPublicUseWindow ? " · 한시 기간 + 국가 등 공용 사용 기간" : ""})
            </p>
            {closedRow.temporaryStatusPublicUseWindow && (
              <p className="text-xs font-medium" data-testid={`nbl-other-state-event-${i}-demolished-publicuse-window`}>
                공용 사용 단서 인정 기간: {closedRow.temporaryStatusPublicUseWindow.start} ~ {closedRow.temporaryStatusPublicUseWindow.lastDay}({closedRow.temporaryStatusPublicUseWindow.days.toLocaleString()}일 · 국가 등 공용 사용 기간만) — 위 기간과 합쳐 인정합니다
              </p>
            )}
            <ToneCard tone="amber">
              <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-demolished-accepted-notice`}>{NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE}</p>
            </ToneCard>
            {closedRow.temporaryStatusPublicUseUnused && (
              <ToneCard tone="amber">
                <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-demolished-publicuse-unused-notice`}>{NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE}</p>
              </ToneCard>
            )}
            {closedRow.temporaryStatusPublicUse && (
              <ToneCard tone="amber">
                <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-demolished-publicuse-accepted-notice`}>{closedRow.temporaryStatusPublicUseMixed ? NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE : NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE}</p>
              </ToneCard>
            )}
            {closedRow.vacantHouseExtensionUnconfirmed && (
              <ToneCard tone="amber">
                <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-demolished-vacant-notice`}>{NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE}</p>
              </ToneCard>
            )}
          </div>
        )}

        {showOutcome && foldNotice && (
          <ToneCard tone="amber">
            <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-demolished-fold-notice`}>{foldNotice}</p>
          </ToneCard>
        )}
      </div>
    </ToneCard>
  );
}
