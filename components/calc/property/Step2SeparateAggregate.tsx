"use client";

import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { ZONING_DISTRICT_LABELS, type FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step2SeparateAggregate({ form, onChange }: Props) {
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
          공시가격 ÷ 면적 = 개별공시지가(원/㎡)로 자동 환산됩니다.
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
        <label className="text-sm font-medium">건물 바닥면적 (㎡)</label>
        <DecimalInput
          value={form.saBuildingFloorArea}
          onChange={(v) => onChange({ saBuildingFloorArea: v })}
          placeholder="면적 입력 (소수점 가능)"
          unit="㎡"
        />
        <p className="text-xs text-muted-foreground">
          기준면적 = 건물 바닥면적 × 용도지역 배율 (공장용지도 동일 — §101①1호)
        </p>
        <LawArticleModal legalBasis="지방세법 시행령 §101" label="§101②" />
      </div>

      {/* 공장입지기준면적 입력 칸은 제거했다(2026-08-05).
          그 면적은 「지방세법 시행령」 §102①1호(분리과세) 한도이고, §101①1호(별도합산)
          본문에는 그 개념이 없다. 종전 문구("이내: 별도합산")는 법문과 반대였다. */}

      {/* 건축물 철거 여부 */}
      <ToggleCard
        tone="sky"
        title="건축물 철거 완료"
        description="철거·멸실 후 1년 이내 별도합산 유지 특례"
        checked={form.saDemolished}
        onCheckedChange={(v) => onChange({ saDemolished: v })}
      />

      {form.saDemolished && (
        <div className="space-y-1">
          <label className="text-sm font-medium">철거일</label>
          <DateInput
            value={form.saDemolishedDate}
            onChange={(v) => onChange({ saDemolishedDate: v })}
          />
          <p className="text-xs text-muted-foreground">
            철거·멸실일부터 1년 이내이면 별도합산 유지 특례 적용
          </p>
          <LawArticleModal legalBasis="지방세법 시행령 §103의2" label="§103의2 1호" />
        </div>
      )}
    </div>
  );
}
