"use client";

/**
 * 기타토지 «소유기간 중 건축물 유무 이력» 입력 — NBL-STATE-HISTORY-U1 (계획서 `docs/01-plan/features/nbl-other-land-state-history.ui.plan.md` §5).
 *
 * 질문(3지선다) → 사건 행(종류·날짜·철거 행의 «철거 직전 재산세 구분») → 이 이력으로 나뉜 소유기간(읽기전용 미리보기).
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
import { NBL_STATE_HISTORY_UNCHANGED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { StateEventKind } from "@/lib/tax-engine/non-business-land/land-usage.types";
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
  { value: "unchanged", label: "바뀐 적 없습니다", description: "소유기간 내내 양도일 현재와 같았습니다(건축물이 계속 있었거나 계속 없었습니다).", testId: "nbl-other-state-mode-unchanged" },
  { value: "changed", label: "바뀐 적 있습니다", description: "건축물을 새로 지었거나 철거·멸실된 적이 있습니다 — 아래에 사건을 입력합니다.", testId: "nbl-other-state-mode-changed" },
  { value: "unknown", label: "모름", description: "확인하지 못했습니다 — 양도일 현재 상태를 소유기간 전체에 적용하고 확인 필요로 표시합니다.", testId: "nbl-other-state-mode-unknown" },
];

const KIND_OPTIONS = (i: number): RadioCardOption<StateEventKind>[] => [
  { value: "building_built", label: STATE_EVENT_KIND_LABEL.building_built, testId: `nbl-other-state-event-${i}-kind-built` },
  { value: "building_removed", label: STATE_EVENT_KIND_LABEL.building_removed, testId: `nbl-other-state-event-${i}-kind-removed` },
];

/** 철거 직전 재산세 구분 선택지 — 라벨은 `PROPERTY_TAX_TYPE_LABEL` 단일 소스(enum 이름과 라벨이 직관과 다르다: separate=별도합산 · special_sum=분리과세). 순서: 비과세·면제 / 분리과세 / 별도합산 / 종합합산 / 모름. */
const PTAX_ORDER = ["exempt", "special_sum", "separate", "comprehensive"] as const satisfies readonly PropertyTaxType[];
type PtaxChoice = PropertyTaxType | "unknown";
const PTAX_OPTIONS = (i: number): RadioCardOption<PtaxChoice>[] => [
  ...PTAX_ORDER.map((v) => ({ value: v as PtaxChoice, label: PROPERTY_TAX_TYPE_LABEL[v], testId: `nbl-other-state-event-${i}-ptax-${v}` })),
  { value: "unknown", label: STATE_PROPERTY_TAX_TYPE_LABEL.unknown, testId: `nbl-other-state-event-${i}-ptax-unknown` },
];

const BUILT_DATE_HINT =
  "건축물이 있는 것으로 보는 첫날입니다. 사용승인일(준공일)과 재산세상 건축물로 보는 첫날이 다를 수 있습니다 — 확인 필요.";
const REMOVED_DATE_HINT = "건축물이 없어진 첫날(멸실·철거·붕괴일)입니다.";
const NEUTRAL_DATE_HINT = "새 상태가 시작되는 첫날입니다. 같은 날의 사건은 입력할 수 없습니다.";

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
    // 새 행의 기본 종류는 직전 사건의 반대(신축과 멸실은 번갈아 온다). 첫 행·직전 행이 미선택이면 사용자가 고른다. 날짜는 비워 둔다(자동 채움 금지).
    const prev = events[events.length - 1];
    const next: "" | StateEventKind = prev && isEventKind(prev.kind) ? (prev.kind === "building_built" ? "building_removed" : "building_built") : "";
    onAssetChange({ nblOtherStateEvents: [...events, { kind: next, date: "", propertyTaxTypeBefore: "" }] });
  }
  function removeEvent(i: number) {
    onAssetChange({ nblOtherStateEvents: events.filter((_, idx) => idx !== i) });
  }

  const eventsComplete = events.length > 0 && events.every((e) => isEventKind(e.kind));
  const lastKind = eventsComplete ? (events[events.length - 1].kind as StateEventKind) : undefined;

  return (
    <div className="space-y-3" data-testid="nbl-other-state-history">
      <SectionHeader
        title="소유기간 중 건축물 유무 이력"
        description="건축물이 새로 생기거나 없어진 적이 있으면 그 기간을 나누어(일 단위) 판정합니다."
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의6" label="§168의6 기간기준" />}
      />

      <FieldCard label="소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있습니까?" required>
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
            const removed = ev.kind === "building_removed";
            const dateHint = ev.kind === "building_built" ? BUILT_DATE_HINT : removed ? REMOVED_DATE_HINT : NEUTRAL_DATE_HINT;
            return (
              <ToneCard
                key={i}
                tone="amber"
                sectionNum={i + 1}
                title="건축물 사건"
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
                  hint={i === 0 ? "취득 당시 건축물이 있었다면 «건축물 멸실·철거·붕괴»부터 입력합니다. 건축물이 없던 토지라면 «건축물 신축»부터 입력합니다. 지분을 나눠 취득한 토지는 가장 이른 지분의 취득일 이후 사건부터 입력합니다." : undefined}
                >
                  <RadioCardGroup
                    name={`nblOtherStateEventKind-${idKey}-${i}`}
                    tone="amber"
                    layout="inline"
                    options={KIND_OPTIONS(i)}
                    value={isEventKind(ev.kind) ? ev.kind : ""}
                    // 종류를 바꾸면 철거 직전 재산세 구분을 함께 리셋한다(이벤트 시점 쓰기 — 신축 행에 stale 값이 남지 않게).
                    onChange={(v) => patchEvent(i, { kind: v, propertyTaxTypeBefore: "" })}
                    data-field={`nblOtherStateEvents.${i}.kind`}
                  />
                </FieldCard>

                <FieldCard label="사건일" hint={dateHint}>
                  <DateInput
                    value={ev.date}
                    onChange={(v) => patchEvent(i, { date: v })}
                    data-field={`nblOtherStateEvents.${i}.date`}
                    data-testid={`nbl-other-state-event-${i}-date`}
                  />
                </FieldCard>

                {removed && (
                  <FieldCard
                    label="철거 직전 그 토지의 재산세 구분"
                    hint="건축물이 있던 기간의 재산세 과세 구분입니다. 재산세 납세고지서(과세구분)에서 확인할 수 있습니다."
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
                            {NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE}
                          </p>
                        </ToneCard>
                      )}
                    </div>
                  </FieldCard>
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

          {/* 양도일 현재 건축물 — 「건축물 있음」 토글을 이 줄이 대신한다(같은 사실을 두 곳에서 받지 않는다). */}
          <p className="text-xs text-muted-foreground px-1" data-testid="nbl-state-history-at-transfer">
            {lastKind
              ? `양도일 현재 건축물: ${lastKind === "building_built" ? "있음" : "없음"} (마지막 사건: ${STATE_EVENT_KIND_LABEL[lastKind]})`
              : "사건 종류를 모두 선택하면 양도일 현재 건축물 유무가 정해집니다."}
          </p>

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
              <p data-testid="nbl-state-history-applied-notice">{NBL_STATE_HISTORY_APPLIED_NOTICE}</p>
              <p data-testid="nbl-state-history-grace-row-notice">{NBL_STATE_HISTORY_GRACE_ROW_NOTICE}</p>
            </div>
          </ToneCard>
        </div>
      )}
    </div>
  );
}
