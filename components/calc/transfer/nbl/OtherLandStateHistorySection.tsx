"use client";

/**
 * 기타토지 «소유기간 중 건축물 유무·재산세 구분 이력» 입력 — NBL-STATE-HISTORY-U1 (계획서 `docs/01-plan/features/nbl-other-land-state-history.ui.plan.md` §5) + E3-① U4
 * (`nbl-state-history-e3-1-tax-type-change.ui.plan.md` §4 — 사건 종류 3종: 건축물 신축 · 건축물 멸실·철거·붕괴 · 재산세 과세 구분 변경).
 *
 * 질문(3지선다) → 사건 행(종류·날짜·철거/구분 변경 행의 «직전 재산세 구분») → 이 이력으로 나뉜 소유기간(읽기전용 미리보기).
 * «직전 구분» 칸 노출 여부는 leaf 단일 술어 `eventCarriesTaxTypeBefore`가 정한다(`=== "building_removed"` 리터럴 금지 — 새 종류의 값이 침묵으로 «모름»이 된다).
 * 구간은 엔진 공용 leaf가 만든다(`buildStateHistoryPreview`) — 결과 카드·판정과 같은 구간이다. 저장·미러링 없음(`useMemo` 표시 전용).
 *
 * 3중 패턴: `propertyTaxTypeBefore` `""` = 모름 — 화면은 «모름» 선택 상태로 보이고(`|| "unknown"`) 저장값은 `""`로 쓴다(④ 전송 · ⑫ enum · 엔진 모두 `""` = 종합합산 + 확인 필요).
 * 모드·종류 전환 시 파생 값 쓰기는 **onChange 핸들러**에서만 한다(`useEffect → store` 미러링 금지).
 */
import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { buildStateHistoryPreview } from "@/lib/calc/nbl-other-state-history-preview";
import { effectiveOtherHasBuildingOf } from "@/lib/calc/nbl-other-state-history-scope";
import { nblOtherStateEventsInUse } from "@/lib/calc/nbl-other-state-history-scope";
import { hasDeemedTransferReason } from "@/lib/calc/nbl-deemed-transfer-scope";
import { isDeemedTransferApplicable } from "@/lib/calc/nbl-deemed-transfer-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_GRACE_ROW_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNCHANGED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { StateEventKind } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { eventCarriesTaxTypeBefore } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { hasBuildingAtTransfer } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isBuildingEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { STATE_EVENT_KIND_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { STATE_PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";

export interface OtherLandStateHistorySectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일 — 미리보기 구간의 끝 */
  transferDate?: string;
}

type Mode = "unchanged" | "changed" | "unknown";

const MODE_OPTIONS: RadioCardOption<Mode>[] = [
  { value: "unchanged", label: "바뀐 적 없습니다", description: "소유기간 내내 양도일 현재와 같았습니다(건축물이 계속 있었거나 계속 없었고, 재산세 과세 구분도 같았습니다).", testId: "nbl-other-state-mode-unchanged" },
  { value: "changed", label: "바뀐 적 있습니다", description: "건축물을 새로 지었거나 철거·멸실된 적, 또는 재산세 과세 구분이 바뀐 적이 있습니다 — 아래에 사건을 입력합니다.", testId: "nbl-other-state-mode-changed" },
  { value: "unknown", label: "모름", description: "건축물·재산세 과세 구분 이력을 확인하지 못했습니다 — 양도일 현재 상태를 소유기간 전체에 적용하고 확인 필요로 표시합니다.", testId: "nbl-other-state-mode-unknown" },
];

const KIND_OPTIONS = (i: number): RadioCardOption<StateEventKind>[] => [
  { value: "building_built", label: STATE_EVENT_KIND_LABEL.building_built, testId: `nbl-other-state-event-${i}-kind-built` },
  { value: "building_removed", label: STATE_EVENT_KIND_LABEL.building_removed, testId: `nbl-other-state-event-${i}-kind-removed` },
  { value: "tax_type_changed", label: STATE_EVENT_KIND_LABEL.tax_type_changed, testId: `nbl-other-state-event-${i}-kind-taxchange` },
];

/** 철거·재산세 과세 구분 변경 행의 «직전 재산세 구분» 선택지 — 라벨은 `PROPERTY_TAX_TYPE_LABEL` 단일 소스(enum 이름과 라벨이 직관과 다르다: separate=별도합산 · special_sum=분리과세). 순서: 비과세·면제 / 분리과세 / 별도합산 / 종합합산 / 모름. */
const PTAX_ORDER = ["exempt", "special_sum", "separate", "comprehensive"] as const satisfies readonly PropertyTaxType[];
type PtaxChoice = PropertyTaxType | "unknown";
const PTAX_OPTIONS = (i: number): RadioCardOption<PtaxChoice>[] => [
  ...PTAX_ORDER.map((v) => ({ value: v as PtaxChoice, label: PROPERTY_TAX_TYPE_LABEL[v], testId: `nbl-other-state-event-${i}-ptax-${v}` })),
  { value: "unknown", label: STATE_PROPERTY_TAX_TYPE_LABEL.unknown, testId: `nbl-other-state-event-${i}-ptax-unknown` },
];

const BUILT_DATE_HINT =
  "건축물이 있는 것으로 보는 첫날입니다. 사용승인일(준공일)과 재산세상 건축물로 보는 첫날이 다를 수 있습니다 — 확인 필요.";
const REMOVED_DATE_HINT = "건축물이 없어진 첫날(멸실·철거·붕괴일)입니다.";
const TAX_CHANGE_DATE_HINT =
  "바뀐 과세 구분이 적용되기 시작한 첫날입니다. 재산세 납세고지서(과세구분)가 달라진 해를 확인해 날짜를 정하세요 — 정확한 날을 모르면 확인 필요.";
const NEUTRAL_DATE_HINT = "새 상태가 시작되는 첫날입니다. 같은 날의 사건은 입력할 수 없습니다.";
const KIND_HINT_FIRST_ROW =
  "취득 당시 건축물이 있었다면 «건축물 멸실·철거·붕괴»부터 입력합니다. 건축물이 없던 토지라면 «건축물 신축»부터 입력합니다. 지분을 나눠 취득한 토지는 가장 이른 지분의 취득일 이후 사건부터 입력합니다. " +
  "건축물은 그대로인데 재산세 과세 구분만 바뀐 적이 있으면 «재산세 과세 구분 변경»을 입력합니다. 건축물이 없던 기간에는 입력할 수 없습니다(나대지는 종합합산으로 봅니다).";

/** 종류별 사건일 hint — `Record<StateEventKind, …>`라 새 종류가 생기면 컴파일 오류로 알려 준다. 미선택·허용값 밖은 중립 문구. */
const DATE_HINT: Record<StateEventKind, string> = { building_built: BUILT_DATE_HINT, building_removed: REMOVED_DATE_HINT, tax_type_changed: TAX_CHANGE_DATE_HINT };
const dateHintOf = (kind: string): string => (isEventKind(kind) ? DATE_HINT[kind] : NEUTRAL_DATE_HINT);

/** 재산세 과세 구분 변경 행의 «변경 후» — 그 사건일에 시작하는 구간의 구분(읽기 전용 표시). 꼬리는 엔진이 보정할 수 있어 «선언 기준»으로 한정해 적는다(UV-4). */
function afterTaxTypeText(row: { propertyTaxType: PropertyTaxType | "unknown"; isTail: boolean }): string {
  if (row.isTail) return `${PROPERTY_TAX_TYPE_LABEL[row.propertyTaxType === "unknown" ? "comprehensive" : row.propertyTaxType]}(양도일 현재 선언 기준)`;
  return row.propertyTaxType === "unknown" ? `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(선언 없음 — 확인 필요)` : `${PROPERTY_TAX_TYPE_LABEL[row.propertyTaxType]}(선언)`;
}

function rowTaxTypeText(row: { hasBuilding: boolean; propertyTaxType: PropertyTaxType | "unknown"; isTail: boolean }): string {
  if (row.isTail) return "양도일 현재 선언 기준";
  if (!row.hasBuilding) return `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(나대지 — 고정)`;
  if (row.propertyTaxType === "unknown") return `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(선언 없음 — 확인 필요)`;
  return `${PROPERTY_TAX_TYPE_LABEL[row.propertyTaxType]}(선언)`;
}

export function OtherLandStateHistorySection({ asset, onAssetChange, transferDate }: OtherLandStateHistorySectionProps) {
  const events = asset.nblOtherStateEvents ?? [];
  const mode = asset.nblOtherStateHistoryMode;
  const inUse = nblOtherStateEventsInUse(asset);
  const deemedBlocks = inUse && isDeemedTransferApplicable(asset.nblLandType) && hasDeemedTransferReason(asset);
  const idKey = asset.assetId ?? "primary";

  const preview = useMemo(() => buildStateHistoryPreview(asset, transferDate), [asset, transferDate]);

  function changeMode(v: Mode) {
    // `changed → 그 밖`으로 바꿀 때는 숨었던 「건축물 있음」 토글에 마지막 파생값을 한 번 써 준다(이벤트 시점 쓰기 — `useEffect` 미러링 아님).
    onAssetChange(inUse && v !== "changed" ? { nblOtherStateHistoryMode: v, nblOtherHasBuilding: effectiveOtherHasBuildingOf(asset) } : { nblOtherStateHistoryMode: v });
  }
  function patchEvent(i: number, patch: Partial<NblOtherStateEventInput>) {
    onAssetChange({ nblOtherStateEvents: events.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });
  }
  function addEvent() {
    // 새 행의 기본 종류는 직전 «건축물 사건»의 반대(신축과 멸실은 번갈아 온다 — 재산세 과세 구분 변경 행은 건너뛴다). 첫 행·직전 행이 미선택·건축물 사건이 없으면 사용자가 고른다. 날짜는 비워 둔다(자동 채움 금지).
    const prev = events[events.length - 1];
    const lastBuilding = [...events].reverse().find((e) => isBuildingEventKind(e.kind));
    const next: "" | StateEventKind = prev && isEventKind(prev.kind) && lastBuilding ? (lastBuilding.kind === "building_built" ? "building_removed" : "building_built") : "";
    onAssetChange({ nblOtherStateEvents: [...events, { kind: next, date: "", propertyTaxTypeBefore: "" }] });
  }
  function removeEvent(i: number) {
    onAssetChange({ nblOtherStateEvents: events.filter((_, idx) => idx !== i) });
  }

  const eventsComplete = events.length > 0 && events.every((e) => isEventKind(e.kind));
  // 양도일 현재 건축물 = 마지막 «건축물 사건»(leaf `hasBuildingAtTransfer`). 건축물 사건이 0건이면 줄 대신 「건축물 있음」 토글이 보인다(`OtherLandDetailSection`).
  const hasBuildingEvent = events.some((e) => isBuildingEventKind(e.kind));
  const hasTaxChange = events.some((e) => e.kind === "tax_type_changed");
  const lastBuilding = eventsComplete ? hasBuildingAtTransfer(events) : undefined;
  const lastBuildingKind = [...events].reverse().find((e) => isBuildingEventKind(e.kind))?.kind;

  return (
    <div className="space-y-3" data-testid="nbl-other-state-history">
      <SectionHeader
        title="소유기간 중 건축물 유무·재산세 구분 이력"
        description="건축물이 새로 생기거나 없어졌거나 재산세 과세 구분이 바뀐 적이 있으면 그 기간을 나누어(일 단위) 판정합니다."
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의6" label="§168의6 기간기준" />}
      />

      <FieldCard label="소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적, 또는 재산세 과세 구분(고지서의 과세구분)이 바뀐 적이 있습니까?" required>
        <RadioCardGroup
          name={`nblOtherStateHistoryMode-${idKey}`}
          tone="amber"
          options={MODE_OPTIONS}
          value={mode === "unchanged" || mode === "changed" || mode === "unknown" ? mode : ""}
          onChange={changeMode}
          data-field="nblOtherStateHistoryMode"
          data-testid="nbl-other-state-mode"
        />
      </FieldCard>

      {mode === "unchanged" && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid="nbl-state-history-unchanged-notice">{NBL_STATE_HISTORY_UNCHANGED_NOTICE}</p>
        </ToneCard>
      )}
      {mode === "unknown" && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid="nbl-state-history-unknown-notice">{NBL_STATE_HISTORY_UNKNOWN_NOTICE}</p>
        </ToneCard>
      )}

      {mode === "changed" && (
        <div className="space-y-3" data-field="nblOtherStateEvents" data-testid="nbl-other-state-events">
          {deemedBlocks && (
            <ToneCard tone="amber">
              <p className="text-caption leading-snug" data-testid="nbl-state-history-deemed-notice">{NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE}</p>
            </ToneCard>
          )}

          {events.map((ev, i) => {
            const carriesBefore = eventCarriesTaxTypeBefore(ev.kind);
            const taxChange = ev.kind === "tax_type_changed";
            // 「변경 후」 = 이 사건일에 시작하는 미리보기 구간(표시 전용 — 저장·전송·검증 없음). 미리보기 불가·클립(사건일 ≤ 소유 첫날)이면 줄을 그리지 않는다.
            const afterRow = taxChange && !deemedBlocks ? preview?.rows.find((r) => r.start === ev.date) : undefined;
            return (
              <ToneCard
                key={i}
                tone="amber"
                sectionNum={i + 1}
                title={taxChange ? STATE_EVENT_KIND_LABEL.tax_type_changed : "건축물 사건"}
                titleExtra={
                  <button
                    type="button"
                    onClick={() => removeEvent(i)}
                    className="ml-auto text-xs text-destructive hover:underline"
                    data-testid={`nbl-other-state-event-${i}-remove`}
                  >
                    삭제
                  </button>
                }
              >
                <FieldCard
                  label="사건 종류"
                  hint={i === 0 ? KIND_HINT_FIRST_ROW : undefined}
                >
                  <RadioCardGroup
                    name={`nblOtherStateEventKind-${idKey}-${i}`}
                    tone="amber"
                    layout="inline"
                    options={KIND_OPTIONS(i)}
                    value={isEventKind(ev.kind) ? ev.kind : ""}
                    // 종류를 바꾸면 «직전 재산세 구분»을 함께 리셋한다(이벤트 시점 쓰기 — 신축 행에 stale 값이 남지 않게 · 철거 ↔ 구분 변경 전환 시 재선택).
                    onChange={(v) => patchEvent(i, { kind: v, propertyTaxTypeBefore: "" })}
                    data-field={`nblOtherStateEvents.${i}.kind`}
                  />
                </FieldCard>

                <FieldCard label="사건일" hint={dateHintOf(ev.kind)}>
                  <DateInput
                    value={ev.date}
                    onChange={(v) => patchEvent(i, { date: v })}
                    data-field={`nblOtherStateEvents.${i}.date`}
                    data-testid={`nbl-other-state-event-${i}-date`}
                  />
                </FieldCard>

                {carriesBefore && (
                  <FieldCard
                    label={taxChange ? "변경 직전 그 토지의 재산세 구분" : "철거 직전 그 토지의 재산세 구분"}
                    hint={
                      taxChange
                        ? "건축물이 있던 기간 중 이 날짜 직전의 재산세 과세 구분입니다. 재산세 납세고지서(과세구분)에서 확인할 수 있습니다."
                        : "건축물이 있던 기간의 재산세 과세 구분입니다. 재산세 납세고지서(과세구분)에서 확인할 수 있습니다."
                    }
                  >
                    <div className="space-y-2">
                      <RadioCardGroup
                        name={`nblOtherStatePtax-${idKey}-${i}`}
                        tone="amber"
                        layout="inline"
                        options={PTAX_OPTIONS(i)}
                        // 표시 fallback: 저장값 `""`(모름)은 «모름»이 선택된 것으로 보인다. 저장·전송·⑧(규칙 없음)·⑫(enum)·엔진 모두 `""` = 모름 → 종합합산 + 확인 필요.
                        value={ev.propertyTaxTypeBefore || "unknown"}
                        onChange={(v) => patchEvent(i, { propertyTaxTypeBefore: v === "unknown" ? "" : v })}
                        data-field={`nblOtherStateEvents.${i}.propertyTaxTypeBefore`}
                      />
                      {!ev.propertyTaxTypeBefore && (
                        <ToneCard tone="amber">
                          <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-ptax-unknown-notice`}>
                            {taxChange ? NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE : NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE}
                          </p>
                        </ToneCard>
                      )}
                    </div>
                  </FieldCard>
                )}

                {afterRow && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground px-1" data-testid={`nbl-other-state-event-${i}-after`}>
                      변경 후: {afterTaxTypeText(afterRow)}
                    </p>
                    {/* UQ-3 (가) — 변경 전후 구분이 같아도 막지 않는다(비차단 안내). 직전 구분 «모름»(`""`)·변경 후 «모름»(`"unknown"`)은 어떤 실제 구분과도 같지 않아 비교에서 자연히 빠진다. */}
                    {ev.propertyTaxTypeBefore === afterRow.propertyTaxType && (
                      <ToneCard tone="amber">
                        <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-same-notice`}>
                          변경 전후 구분이 같습니다. 바뀐 적이 없으면 이 행을 삭제하세요.
                        </p>
                      </ToneCard>
                    )}
                  </div>
                )}
              </ToneCard>
            );
          })}

          <button
            type="button"
            onClick={addEvent}
            className="w-full rounded-lg border border-dashed border-border py-2 text-xs text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors"
            data-testid="nbl-other-state-event-add"
          >
            + 사건 추가
          </button>

          {/* 양도일 현재 건축물 — 건축물 사건이 1건 이상이면 「건축물 있음」 토글을 이 줄이 대신한다(같은 사실을 두 곳에서 받지 않는다). 건축물 사건이 0건이면 줄 없이 토글이 보인다. */}
          {hasBuildingEvent && (
            <p className="text-xs text-muted-foreground px-1" data-testid="nbl-state-history-at-transfer">
              {lastBuilding !== undefined && lastBuildingKind
                ? `양도일 현재 건축물: ${lastBuilding ? "있음" : "없음"} (마지막 건축물 사건: ${STATE_EVENT_KIND_LABEL[lastBuildingKind as StateEventKind]})`
                : "사건 종류를 모두 선택하면 양도일 현재 건축물 유무가 정해집니다."}
            </p>
          )}

          {!deemedBlocks &&
            (preview ? (
              <ToneCard tone="sky" title="이 이력으로 나뉜 소유기간">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="nbl-state-history-preview">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">구간(시작일 포함 ~ 종료일 전날)</th>
                        <th className="py-1 pr-2 text-right font-medium">일수</th>
                        <th className="py-1 pr-2 font-medium">건축물</th>
                        <th className="py-1 pr-2 font-medium">재산세 구분</th>
                        <th className="py-1 font-medium">사업용 토지 요건</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i} data-testid={`nbl-state-history-preview-row-${i}`} className="border-t border-sky-200/60 dark:border-sky-800/60 align-top">
                          <td className="py-1 pr-2 font-mono tabular-nums">{r.start} ~ {r.lastDay}</td>
                          <td className="py-1 pr-2 text-right font-mono tabular-nums">{r.days.toLocaleString()}일</td>
                          <td className="py-1 pr-2">{r.hasBuilding ? "있음" : "없음"}</td>
                          <td className="py-1 pr-2">{rowTaxTypeText(r)}</td>
                          <td className="py-1">{r.meetsBuildingRequirement === null ? "결과 계산 후 확정" : r.meetsBuildingRequirement ? "충족" : "미충족"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-caption text-muted-foreground leading-snug" data-testid="nbl-state-history-preview-total">
                  합계 {preview.totalDays.toLocaleString()}일 = 소유기간. «사업용 토지 요건»은 건축물과 재산세 구분만 본 것이며, 소유기간 전체의 비사업용 여부는 계산 결과에서 확정합니다.
                </p>
              </ToneCard>
            ) : (
              <p className="text-xs text-muted-foreground px-1" data-testid="nbl-state-history-preview-empty">
                사건을 모두 입력하면 이 이력으로 나뉜 소유기간(구간·일수)이 여기에 표시됩니다.
              </p>
            ))}

          <ToneCard tone="amber">
            <div className="space-y-1.5 text-caption leading-snug">
              {/* 결과 경고와 같은 문구 — 엔진은 구분 변경 사건이 1건 이상이면 종전 한정 고지를 변형 고지로 «대체»한다(`applyStateHistory`). */}
              <p data-testid="nbl-state-history-applied-notice">{hasTaxChange ? NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE : NBL_STATE_HISTORY_APPLIED_NOTICE}</p>
              <p data-testid="nbl-state-history-grace-row-notice">{NBL_STATE_HISTORY_GRACE_ROW_NOTICE}</p>
            </div>
          </ToneCard>
        </div>
      )}
    </div>
  );
}
