"use client";

/**
 * §98 미분양 국민주택 — 세율 20% 선택 입력 폼 (P5, 2026-06-12)
 *
 * 효과 ①1호: 양도소득세 세율 20% 단일 (§104① 불구). ①2호 종합소득 합산은 범위 외 (안내).
 * 농특세 없음. 중과 배제 (소령 §167의3①3호 — 감면대상장기임대주택).
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold98Form = Extract<AssetReductionForm, { type: "unsold_98" }>;

interface Props {
  value: Unsold98Form;
  onChange: (patch: Partial<Unsold98Form>) => void;
}

export function Unsold98InputForm({ value, onChange }: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98①" label="§98① 미분양 국민주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98" label="조특령 §98" />
      </div>

      <ToneCard tone="sky" title="① 취득·계약 시기">
        <div>
          <label className="mb-1 block text-sm font-medium">최초 매매계약일</label>
          <DateInput data-field="reduction.unsold_98.contractDate98" value={value.contractDate98} onChange={(v) => onChange({ contractDate98: v })} />
          <p className="mt-1 text-xs text-muted-foreground">
            취득기간 ① 1995.11.1~1997.12.31 / ③ 1998.3.1~1998.12.31 — 취득일 또는 시한 내 계약 + 계약금
            납부 중 하나가 기간 내이면 됩니다 (법 §98①·③) — 계약일은 반드시 입력하세요 (자산의 매매계약일 칸은 읽지 않습니다)
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="rose" title="② 자격 요건 확인">
        <ToggleCard
          tone="rose"
          title="국민주택규모 이하"
          description="조특령 §98①·⑤"
          checked={value.isNationalScale98}
          onCheckedChange={(v) => onChange({ isNationalScale98: v })}
        />
        <ToggleCard
          tone="rose"
          title="서울특별시 외 지역 소재"
          description="조특령 §98①·⑤"
          checked={value.isOutsideSeoul98}
          onCheckedChange={(v) => onChange({ isOutsideSeoul98: v })}
        />
        <ToggleCard
          tone="rose"
          title="시장·군수·구청장 미분양 확인"
          description="1995.10.31(1998.3.1 이후 취득분은 1998.2.28) 현재 미분양주택임을 확인받은 주택 — 미분양주택확인서 (조특령 §98①1호·⑤1호)"
          checked={value.isUnsoldConfirmed98}
          onCheckedChange={(v) => onChange({ isUnsoldConfirmed98: v })}
        />
        <ToggleCard
          tone="rose"
          title="민간임대주택·공공임대주택이 아님"
          description="사업계획승인을 얻어 건설하는 주택에서 민간임대주택(민간임대주택에 관한 특별법 §2)과 공공임대주택(공공주택 특별법 §2 1호 가목)은 제외됩니다 (조특령 §98①1호 괄호 — 1998.3.1 이후 취득분에도 동일)"
          checked={value.isNotRentalHousing98}
          onCheckedChange={(v) => onChange({ isNotRentalHousing98: v })}
        />
        <ToggleCard
          tone="rose"
          title="최초 분양 + 완공 후 타인 입주사실 없음"
          description="주택건설사업자로부터 최초로 분양받았고 완공 후 다른 자가 입주한 사실이 없는 주택 (조특령 §98①2호·⑤2호)"
          checked={value.isFirstBuyerNoOccupancy98}
          onCheckedChange={(v) => onChange({ isFirstBuyerNoOccupancy98: v })}
        />
        <ToggleCard
          tone="violet"
          title="5년 이상 임대 (다주택 중과 배제 판정)"
          description="§98 적용 요건은 「5년 이상 보유 또는 임대」이고 보유기간은 취득일·양도일로 자동 검증합니다. 5년 이상 임대한 국민주택이면 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①3호·§167의10①2호)"
          checked={value.rentedFor5Years98}
          onCheckedChange={(v) => onChange({ rentedFor5Years98: v })}
        />
      </ToneCard>

      {/*
        D11-05 — 적용 주체 요건. 엔진에는 게이트가 있었으나(`unsold-hybrid-p5.ts:159`) ①④⑤⑫ 어디에도
        입력 경로가 없어 상수 `?? true` fallback으로 **영구 사문**이었다. §99의3 sibling
        (`isResident993`)과 같은 형태로 배선한다 — 기본값은 법문이 상정하는 통상의 경우이되
        **화면에 보이고 끌 수 있어야** 비거주자가 사실대로 신고할 수 있다.
      */}
      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          tone="violet"
          title="거주자"
          description="법 §98① 「거주자가 …」 — 체크 해제 시 적용 배제"
          checked={value.isResident98}
          onCheckedChange={(v) => onChange({ isResident98: v })}
        />
      </div>

      <ToneCard tone="emerald" bodyClassName="space-y-1" className="text-caption text-emerald-900 dark:text-emerald-200">
        <p>
          · 적용 효과 (①1호 양도소득세 방식): 세율을 소득세법 §104①에도 불구하고 100분의 20 단일세율로
          적용합니다 — 누진·단기보유세율을 대체합니다 (법 §98①1호).
        </p>
        <p>
          · §98은 신청해야 적용되는 선택 특례입니다 (조특령 §98④ — 과세특례적용신고서). 결과 화면에 같은 과세표준의
          기본세율 산출세액을 함께 표시합니다.
        </p>
        <p>
          · ①2호 종합소득 합산 방식 선택은 본 계산기 범위 외입니다 — 종합소득세 신고에서 별도
          검토하세요.
        </p>
        <p>· 농어촌특별세는 부과되지 않습니다.</p>
        <p>
          · 다주택 중과(소득세법 §104⑦) 대상이면 중과세율을 적용합니다. 5년 이상 임대한 국민주택은 중과가 배제되어 20%가
          적용됩니다 (소득세법 시행령 §167의3①3호·§167의10①2호 — 감면대상장기임대주택). 20% 특례와 중과의 적용 순서를 정면으로 다룬
          해석례는 확인하지 못했습니다.
        </p>
      </ToneCard>
    </div>
  );
}
