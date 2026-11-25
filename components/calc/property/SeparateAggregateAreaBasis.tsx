"use client";

/**
 * 재산세 별도합산 — 기준면적 판정 정보 블록(용도지역 + 건물 바닥면적) (PSA-S2 · 계획서 `property-separate-demolished-sequential.ui.plan.md` §2.4 ⑥).
 *
 * **사슬 끝에서만** 그린다 — `Step2SeparateAggregate`가 엔진 사슬이 이 두 칸을 읽을 때(철거: `chain.asked.buildingFloorArea` · 비철거: `buildingChain.areaInputs` = 허가 «예» 또는 허가 칸 없는 시행본)만 부른다.
 * 그려졌다 = 요구됐다(⑧ 차단 · ⑫ 400 · ④ 전송과 같은 엔진 걷기 하나) — 그래서 `*` 필수 표시는 항상 켜진다.
 * 순서는 용도지역 → 바닥면적(⑧·⑫와 같은 순서). `useEffect → store` 미러링 없음 — 렌더 파생 + onChange뿐이다.
 */
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ReferenceSiteLinks } from "@/components/calc/inputs/ReferenceSiteLink";
import { REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ZONING_DISTRICT_LABELS } from "./shared";
import type { FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function SeparateAggregateAreaBasis({ form, onChange }: Props) {
  const demolished = form.saDemolished;
  return (
    <div className="space-y-5" data-testid="pt-sa-area-basis">
      {/* 용도지역 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          용도지역<span className="text-destructive"> *</span>
        </label>
        <RadioCardGroup
          name="saZoningDistrict"
          tone="sky"
          layout="inline"
          options={ZONING_DISTRICT_LABELS.map(([value, label]) => ({ value, label }))}
          value={form.saZoningDistrict}
          onChange={(v) => onChange({ saZoningDistrict: v })}
          data-testid="pt-sa-area-zoning"
        />
        <ReferenceSiteLinks sites={[REFERENCE_SITES.landUsePlan]} />
      </div>

      {/* 건물 바닥면적 — 공장·비공장 공통 (§101①1호·2호 모두 바닥면적 × 배율) */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          {demolished ? "철거 전 건축물 바닥면적 (㎡)" : "건물 바닥면적 (㎡)"}
          <span className="text-destructive"> *</span>
        </label>
        <DecimalInput
          value={form.saBuildingFloorArea}
          onChange={(v) => onChange({ saBuildingFloorArea: v })}
          placeholder="면적 입력 (소수점 가능)"
          unit="㎡"
          data-testid="pt-sa-area-floor"
        />
        <p className="text-xs text-muted-foreground">
          {demolished
            ? "철거ㆍ멸실되기 전 건축물의 바닥면적(건축물 외의 시설은 수평투영면적)입니다. 철거된 건축물의 부속토지 범위는 이 면적 × 용도지역 배율입니다."
            : "기준면적 = 건물 바닥면적 × 용도지역 배율 (공장용지도 동일 — §101①1호)"}
        </p>
        <LawArticleModal legalBasis="지방세법 시행령 §101" label="§101②" />
      </div>
    </div>
  );
}
