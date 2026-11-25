"use client";

/**
 * 재산세 별도합산 상세 — Step 2 (PSA-S2 재배치 · 계획서 `property-separate-demolished-sequential.ui.plan.md` §2.4).
 * 계산 순서 = 표시 순서: 토지 면적 → 공장용지 → **건축물 철거 완료 토글**(영향 칸 직전) →
 *   [OFF: 허가·사용승인] / [ON: 철거일 → 철거 사실 사슬] → 확정 안내(사슬이 접힘으로 끝났을 때 — 마지막 답 바로 아래) → **용도지역·건물 바닥면적은 사슬 끝에서만**(`SeparateAggregateAreaBasis`).
 * 어느 칸이 보이는가는 엔진 사슬(철거 `demolishedChainOf` · 비철거 `buildingChainOf`)이 한 곳에서 정한다 — UI는 날짜·시행본·답을 비교하지 않는다(= ④ 전송 = ⑧ 차단 = ⑫ 400).
 * PSA-SU: 확정 안내(`pt-sa-seq-settled`) · «이전에 고른 답» 표식(확인 집합은 이 컴포넌트의 핸들러만 갱신) · 항상 마운트된 읽기 전용 낭독 한 줄(`role="status"`).
 */
import { useState } from "react";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PROPERTY_SEPARATE } from "@/lib/tax-engine/legal-codes";
import { buildingChainOf } from "@/lib/calc/property-separate-requirements";
import { demolishedChainOf } from "@/lib/calc/property-separate-requirements";
import { demolishedPeriodTextOf } from "@/lib/calc/property-separate-requirements";
import { SeparateAggregateAreaBasis } from "./SeparateAggregateAreaBasis";
import { SeparateAggregateBuildingPermit } from "./SeparateAggregateBuildingPermit";
import { SeparateAggregateDemolishedFacts } from "./SeparateAggregateDemolishedFacts";
import { demolishedFormValues } from "./request-body";
import { nextConfirmed } from "./separate-sequence";
import { prevAnswerFieldsOf } from "./separate-sequence";
import { sequenceStatusText } from "./separate-sequence";
import type { SequenceField } from "./separate-sequence";
import type { FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step2SeparateAggregate({ form, onChange: onFormChange }: Props) {
  // 사용자가 이번에 답을 건드린(확인한) 칸. 핸들러에서만 갱신한다 — 숨은 칸은 다시 열리면 미확인(`nextConfirmed`). `useEffect → store` 없음.
  const [confirmed, setConfirmed] = useState<ReadonlySet<SequenceField>>(() => new Set());
  const onChange = (patch: Partial<FormState>) => {
    setConfirmed(nextConfirmed(form, patch, confirmed));
    onFormChange(patch);
  };
  const onConfirm = (field: SequenceField) => setConfirmed(new Set([...confirmed, field]));
  const prev = prevAnswerFieldsOf(form, confirmed);
  const demolished = form.saDemolished;
  // 용도지역·건물 바닥면적 블록은 엔진 사슬이 그 칸을 읽을 때만 그린다 — 철거: 사슬 끝(건축물 ∧ 문언 시행본 ∧ 앞 요건 통과) · 비철거: 허가 «예» 또는 허가 칸 없는 시행본.
  const showAreaBasis = demolished
    ? demolishedChainOf(demolishedFormValues(form)).asked.buildingFloorArea
    : buildingChainOf(form.saBuildingPermit).areaInputs;
  const period = demolishedPeriodTextOf();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">별도합산과세 상세 정보</h2>
      <p className="text-sm text-muted-foreground">
        아래 질문에 답하면 이어서 필요한 칸만 표시됩니다.
      </p>
      {/* 다음 질문·확정 낭독 — 항상 마운트(내용만 바뀐다). 새 카드 전체를 live로 감싸지 않는다 */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="pt-sa-seq-status">
        {sequenceStatusText(form)}
      </div>
      <LawArticleModal legalBasis="지방세법 시행령 §101" label="시행령 §101" />

      {/* 토지 면적 */}
      <div className="space-y-1">
        <label htmlFor="pt-sa-land-area-input" className="text-sm font-medium">토지 면적 (㎡)</label>
        <DecimalInput
          id="pt-sa-land-area-input"
          value={form.saLandArea}
          onChange={(v) => onChange({ saLandArea: v })}
          placeholder="면적 입력 (소수점 가능)"
          unit="㎡"
          data-testid="pt-sa-land-area"
        />
        <p className="text-xs text-muted-foreground">
          공시가격을 면적으로 나누어 개별공시지가(원/㎡)로 자동 환산됩니다.
        </p>
      </div>

      {/* 공장 여부 */}
      <ToggleCard
        tone="sky"
        title="공장용지"
        description="「지방세법 시행령」 §101①1호 — 기준면적은 공장용 건축물 바닥면적 × 용도지역 배율"
        checked={form.saIsFactory}
        onCheckedChange={(v) => onChange({ saIsFactory: v })}
      />

      {/* 공장입지기준면적 입력 칸은 제거했다(2026-08-05).
          그 면적은 「지방세법 시행령」 §102①1호(분리과세) 한도이고, §101①1호(별도합산)
          본문에는 그 개념이 없다. 종전 문구("이내: 별도합산")는 법문과 반대였다. */}

      {/* 건축물 철거 여부 — 아래 허가·철거 사슬·기준면적이 모두 이 토글에 달려 있다(모드 토글은 영향 칸 직전) */}
      <ToggleCard
        tone="sky"
        title="건축물 철거 완료"
        description={`철거·멸실 후 한시 별도합산 특례 — 허가·용도·빈집 요건 확인(${PROPERTY_SEPARATE.DEMOLISHED_GRACE})`}
        checked={form.saDemolished}
        onCheckedChange={(v) => onChange({ saDemolished: v })}
      />

      {/* 영 §101① 단서 허가·사용승인 — 철거 OFF ∧ 어댑터 술어(과세기준일 2011.6.1.~)일 때만. 토글 바로 아래(⑧ 순서: 토지 면적 → 허가 → 용도지역 → 바닥면적) */}
      <SeparateAggregateBuildingPermit form={form} prev={prev} onConfirm={onConfirm} onChange={onChange} />

      {demolished && (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium">철거일</label>
            <DateInput
              value={form.saDemolishedDate}
              onChange={(v) => onChange({ saDemolishedDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              {period.general
                ? `철거·멸실일부터 과세기준일 시행본의 한시 기간(${period.general}${period.vacantHouse ? ` · 빈집정비사업 철거 빈집 ${period.vacantHouse}` : ""}) 이내이고 아래 요건을 충족하면 별도합산 유지 특례가 적용됩니다.`
                : "과세기준일 시행본에는 철거·멸실 특례의 한시 기간 규정이 없습니다."}
            </p>
            <LawArticleModal legalBasis="지방세법 시행령 §103의2" label="§103의2 1호" />
          </div>
          <SeparateAggregateDemolishedFacts form={form} prev={prev} onConfirm={onConfirm} onChange={onChange} />
        </>
      )}

      {/* 기준면적 판정 정보 — 사슬 끝에서만(요구될 때만 그려진다) */}
      {showAreaBasis && <SeparateAggregateAreaBasis form={form} prev={prev} onConfirm={onConfirm} onChange={onChange} />}
    </div>
  );
}
