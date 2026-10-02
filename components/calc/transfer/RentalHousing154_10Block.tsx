"use client";

/**
 * §154⑩ 표준 경로(I-5) 입력 블록 — 시나리오 B(PHRP)에서 임대주택이 0호일 때.
 *
 * 양도일 현재 함께 보유 중인 장기임대주택이 없으면(전부 처분·등록말소 후 미보유) §155⑳ 본문
 * (「장기임대주택 … 과 그 밖의 1주택을 국내에 소유」)이 성립하지 않는다. 이 경우 §154⑩이 §155⑳
 * 후단의 PHRP **정의**만 빌린다 — §167조의3①2호의 면적·가액·의무기간 요건은 인용하지 않는다.
 *
 * 🔴 보유기간·거주기간은 **재기산하지 않는다**(§154⑤·§95④ — 실제 취득일 기준. 거주기간은 취득
 * 시기별로 「③ 거주주택 요건」 블록(`RentalHousingExceptionSection.tsx`)이 재사용하는
 * `postRegistrationResidenceMonths`(2019.2.12 이후 취득) 또는 일반 거주기간(그 전 취득)을 쓴다).
 * 이 블록은 §154⑩1호(등록·운영 사실)와, §161① 안분 섹션이 가려지는 모드에서만 §154⑩2호(PHRP
 * 정의)의 직전거주주택 양도일 입력만 담당한다.
 *
 * `RentalHousingExceptionSection.tsx`에서 800줄 정책에 따라 분리(2026-09-30).
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface RentalHousing154_10BlockProps {
  rh: AssetForm["rentalHousingException"];
  onChange: (patch: Partial<AssetForm["rentalHousingException"]>) => void;
  /**
   * 직전거주주택 양도일 입력칸을 이 블록에서 직접 받을지. §161① 안분 섹션(②)이 이미 같은 필드를
   * 받고 있으면(`allocationVisible`) 중복 입력을 피하기 위해 여기서는 감춘다. 판정 메뉴
   * (`facts` 모드)는 그 섹션을 통째로 감추므로 여기서 받아야 한다(Q-7 예외 — §154⑩2호 정의 요소라
   * 순수 세액 축이 아니다).
   */
  showDateInput?: boolean;
}

export function RentalHousing154_10Block({
  rh,
  onChange,
  showDateInput = false,
}: RentalHousing154_10BlockProps) {
  return (
    <div className="space-y-3" data-testid="rental-154-10-block">
      <ToneCard tone="emerald" title="§154⑩ 표준 경로 — 공동보유 장기임대주택 없음">
        <p className="text-caption">
          양도일 현재 함께 보유 중인 장기임대주택이 없습니다. 이 주택이 과거 임대주택으로 등록되거나
          어린이집으로 운영된 사실이 있고, 그 보유기간 중 다른 거주주택(직전거주주택)을 양도했다면
          소득세법 시행령 §154⑩에 따라 §161① 안분 산식으로 과세되는 양도소득금액을 한정합니다 —
          §167조의3①2호의 면적·가액·의무기간 요건은 적용되지 않습니다. 보유·거주기간은 아래
          「거주주택 요건」에서 함께 판정합니다.
        </p>
      </ToneCard>

      <div className="flex items-center gap-2">
        <ToggleCard
          tone="emerald"
          title="임대주택 등록·어린이집 운영 사실 (소령 §154⑩1호)"
          data-field="rentalHousingException.wasRegisteredRentalOrChildcare"
          description={
            '「민간임대주택에 관한 특별법」§5에 따라 임대주택으로 등록했거나, ' +
            '「영유아보육법」§12·§13에 따라 어린이집으로 설치·운영한 사실이 있습니다.'
          }
          checked={rh.wasRegisteredRentalOrChildcare === true}
          onCheckedChange={(v) => onChange({ wasRegisteredRentalOrChildcare: v })}
        />
        <LawArticleModal legalBasis="소득세법 시행령 §154⑩" label="§154⑩" />
      </div>

      {showDateInput && (
        <div data-testid="rental-154-10-prior-date">
          <FieldCard
            field="rentalHousingException.priorResidenceTransferDate"
            label="직전거주주택 양도일"
            required
            hint="소령 §154⑩2호 — 이 주택이 직전거주주택보유주택임을 확인하는 값이자 §161① 비과세 기산점입니다."
          >
            <DateInput
              value={rh.priorResidenceTransferDate ?? ""}
              onChange={(v) => onChange({ priorResidenceTransferDate: v || undefined })}
            />
          </FieldCard>
        </div>
      )}
    </div>
  );
}
