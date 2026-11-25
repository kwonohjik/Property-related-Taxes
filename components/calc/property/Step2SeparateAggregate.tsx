"use client";

import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { PROPERTY_SEPARATE } from "@/lib/tax-engine/legal-codes";
import { demolishedChainOf, demolishedPeriodTextOf } from "@/lib/calc/property-separate-requirements";
import { SeparateAggregateBuildingPermit } from "./SeparateAggregateBuildingPermit";
import { SeparateAggregateDemolishedFacts } from "./SeparateAggregateDemolishedFacts";
import { demolishedFormValues } from "./request-body";
import { ZONING_DISTRICT_LABELS, type FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step2SeparateAggregate({ form, onChange }: Props) {
  // 철거 필지는 «건물 바닥면적» 칸이 철거 전 바닥면적이다 — 엔진 사슬이 그 칸을 읽을 때(건축물 ∧ 문언 시행본 ∧ 앞 요건 통과)만 필수(사슬은 ⑧·⑫·④와 같은 걷기 하나).
  const demolished = form.saDemolished;
  const needFloor = demolished && demolishedChainOf(demolishedFormValues(form)).asked.buildingFloorArea;
  const period = demolishedPeriodTextOf();
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">별도합산과세 상세 정보</h2>
      <p className="text-sm text-muted-foreground">
        기준면적(건물 바닥면적 × 용도지역 배율) 판정에 필요한 정보를 입력하세요.
      </p>
      <LawArticleModal legalBasis="지방세법 시행령 §101" label="시행령 §101" />

      {/* 용도지역 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">용도지역</label>
        <RadioCardGroup
          name="saZoningDistrict"
          tone="sky"
          layout="inline"
          options={ZONING_DISTRICT_LABELS.map(([value, label]) => ({ value, label }))}
          value={form.saZoningDistrict}
          onChange={(v) => onChange({ saZoningDistrict: v })}
        />
        <ReferenceSiteLinks sites={[REFERENCE_SITES.landUsePlan]} />
      </div>

      {/* 토지 면적 */}
      <div className="space-y-1">
        <label className="text-sm font-medium">토지 면적 (㎡)</label>
        <DecimalInput
          value={form.saLandArea}
          onChange={(v) => onChange({ saLandArea: v })}
          placeholder="면적 입력 (소수점 가능)"
          unit="㎡"
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

      {/* 건물 바닥면적 — 공장·비공장 공통 (§101①1호·2호 모두 바닥면적 × 배율) */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          {demolished ? "철거 전 건축물 바닥면적 (㎡)" : "건물 바닥면적 (㎡)"}
          {needFloor && <span className="text-destructive"> *</span>}
        </label>
        <DecimalInput
          value={form.saBuildingFloorArea}
          onChange={(v) => onChange({ saBuildingFloorArea: v })}
          placeholder="면적 입력 (소수점 가능)"
          unit="㎡"
        />
        <p className="text-xs text-muted-foreground">
          {demolished
            ? "철거ㆍ멸실되기 전 건축물의 바닥면적(건축물 외의 시설은 수평투영면적)입니다. 철거된 건축물의 부속토지 범위는 이 면적 × 용도지역 배율이며, 철거된 것이 주택이거나 그 과세기준일 시행본에 이 범위 문언이 없으면 입력하지 않아도 됩니다."
            : "기준면적 = 건물 바닥면적 × 용도지역 배율 (공장용지도 동일 — §101①1호)"}
        </p>
        <LawArticleModal legalBasis="지방세법 시행령 §101" label="§101②" />
      </div>

      {/* 영 §101① 단서 허가·사용승인 — 철거 OFF ∧ 어댑터 술어(과세기준일 2011.6.1.~)일 때만(⑧ 순서: 용도지역 → 바닥면적 → 허가) */}
      <SeparateAggregateBuildingPermit form={form} onChange={onChange} />

      {/* 공장입지기준면적 입력 칸은 제거했다(2026-08-05).
          그 면적은 「지방세법 시행령」 §102①1호(분리과세) 한도이고, §101①1호(별도합산)
          본문에는 그 개념이 없다. 종전 문구("이내: 별도합산")는 법문과 반대였다. */}

      {/* 건축물 철거 여부 */}
      <ToggleCard
        tone="sky"
        title="건축물 철거 완료"
        description={`철거·멸실 후 한시 별도합산 특례 — 허가·용도·빈집 요건 확인(${PROPERTY_SEPARATE.DEMOLISHED_GRACE})`}
        checked={form.saDemolished}
        onCheckedChange={(v) => onChange({ saDemolished: v })}
      />

      {form.saDemolished && (
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
          <SeparateAggregateDemolishedFacts form={form} onChange={onChange} />
        </>
      )}
    </div>
  );
}
