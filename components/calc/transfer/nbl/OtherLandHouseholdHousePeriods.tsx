"use client";

/**
 * 13호(무주택 1세대 1필지 나지) 「세대 주택 소유 기간」 질문 + 행 입력 — NBL-STATE-HISTORY-E3-④ UI-M.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §4.2 (UQ-2 (가) 2지선다 필수 · UQ-4 (가) 13호 블록 안 · UQ-5 (가) ToneCard 행 + 종료일 비움 = 양도일까지)
 *
 * 노출 조건은 엔진 술어 `vacantLotHousePeriodsRead`를 부르는 단일 래퍼(`vacantLotHousePeriodsReadOf`)다 — ④ 전송·⑧ 요구와 같은 함수(자체 조건 금지).
 * 질문 `""` = 선택 안 됨(표시 fallback·가정값 없음 — ⑧ HH-1이 막는다). 종료일 빈칸 = «양도일까지 계속 소유»(hint · 행 요약 · ④ 키 생략 · ⑧·⑫ 허용 · ⑭ 양도일 — 같은 뜻).
 * 모든 쓰기는 onChange 핸들러다(`useEffect → store` 미러링 없음). 안내 문구는 엔진 상수(`nbl-confirm-notices`)가 단일 소스다.
 */
import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { NBL_HOUSEHOLD_HOUSE_PERIODS_MAX } from "@/lib/calc/nbl-household-house-periods-cap";
import { nblHouseholdHousePeriodsCapMessage } from "@/lib/calc/nbl-household-house-periods-cap";
import { buildVacantLotHouseholdPreview } from "@/lib/calc/nbl-vacant-lot-household-preview";
import { vacantLotHousePeriodsReadOf } from "@/lib/calc/nbl-vacant-lot-household-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblHouseholdHousePeriodInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import type { NblHouseholdHouseStatus } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_VACANT_LOT_HOUSE_PERIODS_INPUT_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { addDays } from "@/lib/tax-engine/utc-date";

export interface OtherLandHouseholdHousePeriodsProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일 — 미리보기·행 요약의 끝 */
  transferDate?: string;
}

const STATUS_OPTIONS: RadioCardOption<Exclude<NblHouseholdHouseStatus, "">>[] = [
  { value: "none", label: "없습니다 — 소유기간 내내 무주택", description: "소유한 기간 전체를 13호의 무주택 기간으로 봅니다(자기 선언).", testId: "nbl-other-household-house-none" },
  { value: "owned", label: "있습니다 — 소유한 기간을 입력", description: "세대가 주택을 소유한 기간은 13호로 인정하지 않습니다 — 아래에 기간을 입력합니다.", testId: "nbl-other-household-house-owned" },
];

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** 행 요약(표시 전용) — 반열린 `[시작일, 종료일)`을 사용자가 읽는 «종료일 전날까지»로 풀어 말한다. 시작일을 읽을 수 없으면 줄을 그리지 않는다. */
function rowSummary(row: NblHouseholdHousePeriodInput): string | null {
  const start = toOptionalDate(row.startDate);
  if (!start) return null;
  if (!row.endDate) return `계산에 쓰는 소유 기간: ${iso(start)} ~ 양도일까지 계속 소유`;
  const end = toOptionalDate(row.endDate);
  if (!end || end.getTime() <= start.getTime()) return null;
  return `계산에 쓰는 소유 기간: ${iso(start)} ~ ${iso(addDays(end, -1))} (종료일 전날까지)`;
}

export function OtherLandHouseholdHousePeriods({ asset, onAssetChange, transferDate }: OtherLandHouseholdHousePeriodsProps) {
  const rows = asset.nblOtherHouseholdHousePeriods ?? [];
  const status = asset.nblOtherHouseholdHouseStatus;
  const idKey = asset.assetId ?? "primary";
  const read = vacantLotHousePeriodsReadOf(asset);
  const preview = useMemo(() => buildVacantLotHouseholdPreview(asset, transferDate), [asset, transferDate]);
  if (!read) return null;

  function patchRow(i: number, patch: Partial<NblHouseholdHousePeriodInput>) {
    onAssetChange({ nblOtherHouseholdHousePeriods: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  }
  const atCap = rows.length >= NBL_HOUSEHOLD_HOUSE_PERIODS_MAX;

  return (
    <div className="space-y-3" data-testid="nbl-other-household-house">
      <FieldCard
        field="nblOtherHouseholdHouseStatus"
        label="이 토지를 소유한 기간 중 우리 세대가 주택을 소유한 적이 있습니까?"
        hint="주택을 소유하는 동안은 13호로 인정하지 않습니다(해석례 기준 — 확인 필요). 세대 구성이 달라진 경우는 판정하지 않고 입력한 기간 그대로 반영합니다."
        required
      >
        <RadioCardGroup
          name={`nblOtherHouseholdHouseStatus-${idKey}`}
          tone="violet"
          options={STATUS_OPTIONS}
          value={status === "none" || status === "owned" ? status : ""}
          // 빈칸은 빈칸이다 — 표시 fallback·가정값 없음(저장 `""` = ⑧ HH-1 차단).
          onChange={(v) => onAssetChange({ nblOtherHouseholdHouseStatus: v })}
          data-testid="nbl-other-household-house-status"
        />
      </FieldCard>

      {status === "owned" && (
        <div className="space-y-3" data-field="nblOtherHouseholdHousePeriods" data-testid="nbl-other-household-house-periods">
          {rows.map((row, i) => {
            const summary = rowSummary(row);
            return (
              <ToneCard
                key={i}
                tone="violet"
                sectionNum={i + 1}
                title="주택 소유 기간"
                titleExtra={
                  <button
                    type="button"
                    onClick={() => onAssetChange({ nblOtherHouseholdHousePeriods: rows.filter((_, idx) => idx !== i) })}
                    className="ml-auto text-xs text-destructive hover:underline"
                    data-testid={`nbl-other-household-house-${i}-remove`}
                  >
                    삭제
                  </button>
                }
              >
                <FieldCard label="주택을 소유하게 된 날" required hint="이 날부터 주택을 소유한 것으로 봅니다(해당일 귀속은 해석례 미확인 — 확인 필요).">
                  <DateInput
                    value={row.startDate}
                    onChange={(v) => patchRow(i, { startDate: v })}
                    data-field={`nblOtherHouseholdHousePeriods.${i}.startDate`}
                    data-testid={`nbl-other-household-house-${i}-start`}
                  />
                </FieldCard>
                <FieldCard label="주택을 더 이상 소유하지 않게 된 날" hint="이 날부터 다시 무주택으로 봅니다. 아직 소유 중이면 비워 두세요 — 양도일까지 소유한 것으로 계산합니다.">
                  <DateInput
                    value={row.endDate}
                    onChange={(v) => patchRow(i, { endDate: v })}
                    data-field={`nblOtherHouseholdHousePeriods.${i}.endDate`}
                    data-testid={`nbl-other-household-house-${i}-end`}
                  />
                </FieldCard>
                {summary && (
                  <p className="text-xs text-muted-foreground px-1" data-testid={`nbl-other-household-house-${i}-summary`}>
                    {summary}
                  </p>
                )}
              </ToneCard>
            );
          })}

          {atCap ? (
            <p className="text-xs text-muted-foreground px-1" data-testid="nbl-other-household-house-cap-notice">
              {nblHouseholdHousePeriodsCapMessage()}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onAssetChange({ nblOtherHouseholdHousePeriods: [...rows, { startDate: "", endDate: "" }] })}
              className="w-full rounded-lg border border-dashed border-border py-2 text-xs text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors"
              data-testid="nbl-other-household-house-add"
            >
              + 주택 소유 기간 추가
            </button>
          )}

          {/* 표시 전용 — 엔진 leaf가 낸 일수(재계산 없음). 행에 ⑧ 결함이 있으면 그리지 않는다. */}
          {preview && (
            <p className="text-xs text-muted-foreground px-1 leading-snug" data-testid="nbl-other-household-house-preview">
              13호로 인정되는 기간(예상): {preview.businessDays.toLocaleString()}일 / 소유기간 {preview.ownershipDays.toLocaleString()}일 · 세대 주택 소유로 제외한 기간 {preview.houseOwnedDays.toLocaleString()}일 — 최종 판정은 결과에서 확정합니다.
            </p>
          )}

          <ToneCard tone="violet">
            <p className="text-caption leading-snug" data-testid="nbl-other-household-house-input-notice">{NBL_VACANT_LOT_HOUSE_PERIODS_INPUT_NOTICE}</p>
          </ToneCard>
        </div>
      )}
    </div>
  );
}
