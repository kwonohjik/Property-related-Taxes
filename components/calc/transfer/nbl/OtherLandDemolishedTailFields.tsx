"use client";

/**
 * 기타토지 꼬리(양도일 현재) 근거 «철거ㆍ멸실» 블록 — NBL-STATE-HISTORY-E3-⑤ E3f-1b (U-2 · 계획서 `…e3-5-demolition-temp-status.ui.plan.md` §4.2).
 *
 * 화면 순서 = 계산 순서: 한시 기간 안내 → **철거ㆍ멸실일** → (한도 경과 안내) → 종전 바닥면적. `OtherLandPropertyTaxBasisField`가 근거 «철거ㆍ멸실»일 때만 이 블록을 그린다.
 *
 * 칸이 보이는 조건은 전부 엔진 술어를 `nbl-demolished-tail-scope.ts`가 한 곳에서 부른 값이다 — ⑤ 노출 = ⑧ 차단 = ⑫′ 400 = ④ 전송 = ⑭ 읽기(UI 자체 날짜·시행본 비교 금지):
 *  · 철거ㆍ멸실일 새 칸: 이력의 마지막 철거 행이 날짜를 대지 않을 때만(`demolishedOnRequired`). 대면 읽기 전용 한 줄(출처 표시) — 새 칸의 숨은 값은 지우지 않고 ④가 싣지 않는다.
 *  · 종전 바닥면적: 양도일 직전 과세기준일 ≥ 2024.6.1. 시행본만(`demolishedFloorAreaRequired` — 그 전 시행본은 면적 범위 문언이 없어 엔진이 읽지 않는다).
 *  · 한도 경과 안내: 엔진 `isTailDemolishedClearlyExpired`(철거일 + 최대 한시 기간 ≤ 양도일 직전 과세기준일) — UI는 계산하지 않는다. 철거일·양도일 해석 불가는 안내 없음.
 * 파생은 전부 렌더 계산이다(`useEffect → store` 미러링 없음).
 */
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { demolishedFloorAreaNeededOf, demolishedOnFieldNeededOf, demolishedTailFactsOf } from "@/lib/calc/nbl-demolished-tail-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NBL_PTAX_DEMOLISHED_STATUS_GRACE_DIRECTION_NOTE } from "@/lib/tax-engine/nbl-confirm-notices";
import { demolishedOnForEngine, demolishedOnRowDate } from "@/lib/tax-engine/non-business-land/demolished-input-issue";
import { demolishedStatusNotice, isTailDemolishedClearlyExpired, NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE } from "@/lib/tax-engine/non-business-land/demolished-temp-status";

interface Props {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일(ISO) — 한시 기간 안내·바닥면적 칸 노출·한도 경과 안내가 읽는다(미입력이면 시행본 연혁 안내 · 바닥면적 칸 노출). */
  transferDate?: string;
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

export function OtherLandDemolishedTailFields({ asset, onAssetChange, transferDate }: Props) {
  const transfer = toOptionalDate(transferDate);
  const facts = demolishedTailFactsOf(asset);
  const needsDate = demolishedOnFieldNeededOf(asset);
  const rowDate = needsDate ? undefined : demolishedOnRowDate(facts);
  // 엔진(⑭)이 읽는 철거ㆍ멸실일 — 철거 행 날짜가 새 칸보다 우선하고, 없을 때만 새 칸 값.
  const removedOn = demolishedOnForEngine(facts, toOptionalDate(asset.nblOtherDemolishedOn));
  const expired = !!removedOn && !!transfer && isTailDemolishedClearlyExpired(removedOn, transfer);
  const needsFloorArea = demolishedFloorAreaNeededOf(asset, transferDate);

  return (
    <div className="space-y-2" data-testid="nbl-other-demolished-tail">
      <p className="text-caption leading-snug text-muted-foreground">
        <span data-testid="nbl-other-tax-basis-demolished-notice">{demolishedStatusNotice(transfer)}</span>{" "}
        <span data-testid="nbl-other-tax-basis-demolished-direction">{NBL_PTAX_DEMOLISHED_STATUS_GRACE_DIRECTION_NOTE}</span>
      </p>

      {needsDate && (
        <FieldCard
          field="nblOtherDemolishedOn"
          label="철거ㆍ멸실일"
          required
          hint="건축물대장·등기부로 확인한 사실상 철거ㆍ멸실일입니다(취득 전에 철거됐어도 입력합니다). 사실상 철거일을 알 수 없으면 공부상 철거ㆍ멸실일을 입력하세요."
        >
          <DateInput
            value={asset.nblOtherDemolishedOn}
            onChange={(v) => onAssetChange({ nblOtherDemolishedOn: v })}
            data-testid="nbl-other-demolished-on"
          />
        </FieldCard>
      )}
      {rowDate && (
        <p className="text-caption leading-snug text-muted-foreground" data-testid="nbl-other-demolished-on-source">
          철거ㆍ멸실일(위 「건축물 멸실·철거·붕괴」 행): {isoOf(rowDate)}
        </p>
      )}

      {expired && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid="nbl-other-demolished-expired-notice">{NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE}</p>
        </ToneCard>
      )}

      {needsFloorArea && (
        <FieldCard
          field="nblOtherDemolishedFloorArea"
          label="철거ㆍ멸실 전 건축물 바닥면적"
          unit="㎡"
          hint="철거ㆍ멸실되기 전 건축물의 바닥면적(건축물 외의 시설은 수평투영면적)입니다. 이 면적에 용도지역별 적용배율을 곱한 범위가 별도합산(사업용)으로 남고 초과분은 종합합산(비사업용)입니다."
        >
          <DecimalInput value={asset.nblOtherDemolishedFloorArea} onChange={(v) => onAssetChange({ nblOtherDemolishedFloorArea: v })} />
        </FieldCard>
      )}
    </div>
  );
}
