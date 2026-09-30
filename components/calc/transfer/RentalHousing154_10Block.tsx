"use client";

/**
 * §154⑩ 표준 경로(I-5) 입력 블록 — 시나리오 B(PHRP)에서 임대주택이 0호일 때.
 *
 * 양도일 현재 함께 보유 중인 장기임대주택이 없으면(전부 처분·등록말소 후 미보유) §155⑳ 본문
 * (「장기임대주택 … 과 그 밖의 1주택을 국내에 소유」)이 성립하지 않는다. 이 경우 §154⑩이 §155⑳
 * 후단의 PHRP **정의**만 빌려 §154①(보유 2년·조정지역 취득 시 거주 2년)의 기산일을 「직전거주주택의
 * 양도일 후」로 재정의한다 — §167조의3①2호의 면적·가액·의무기간 요건은 인용하지 않는다.
 *
 * `RentalHousingExceptionSection.tsx`에서 800줄 정책에 따라 분리(2026-09-30).
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface RentalHousing154_10BlockProps {
  rh: AssetForm["rentalHousingException"];
  /** 양도일 — 직전거주주택 양도일 후 보유기간 실시간 판정용 */
  transferDate: string;
  onChange: (patch: Partial<AssetForm["rentalHousingException"]>) => void;
  /**
   * 직전거주주택 양도일 입력칸을 이 블록에서 직접 받을지. §154⑩은 이 날짜가 **판정 축**(재기산
   * 보유기간의 기산일)이라 §155⑳ PHRP(순수 세액 축, §161① 안분 비율)와 다르다 — 판정 메뉴
   * (`facts` 모드)는 §161 안분 섹션을 감추므로 그 섹션의 DateInput에 닿지 않는다. `false`(기본)면
   * 계산기(`full`)에서 §161 안분 섹션이 이미 같은 필드를 받고 있다는 뜻이다(중복 입력 방지).
   */
  showDateInput?: boolean;
}

export function RentalHousing154_10Block({
  rh,
  transferDate,
  onChange,
  showDateInput = false,
}: RentalHousing154_10BlockProps) {
  const priorDate = rh.priorResidenceTransferDate ?? "";
  const residenceMonthsRaw = rh.residenceMonthsAfterPriorResidenceTransfer ?? "";

  // 직전거주주택 양도일 후 보유기간(일) — 실시간 판정용 (엔진 calculateHoldingPeriod와 같은 기산 원칙)
  let holdDaysLabel = "-";
  let holdPass = false;
  if (priorDate && transferDate) {
    const priorMs = new Date(priorDate).getTime();
    const trnMs = new Date(transferDate).getTime();
    if (Number.isFinite(priorMs) && Number.isFinite(trnMs) && trnMs > priorMs) {
      const days = Math.floor((trnMs - priorMs) / (1000 * 60 * 60 * 24));
      holdPass = days >= 730;
      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      holdDaysLabel = `${years}년 ${months}개월`;
    }
  }

  return (
    <div className="space-y-3" data-testid="rental-154-10-block">
      <ToneCard tone="emerald" title="§154⑩ 표준 경로 — 공동보유 장기임대주택 없음">
        <p className="text-caption">
          양도일 현재 함께 보유 중인 장기임대주택이 없습니다. 이 주택이 과거 임대주택으로 등록되거나
          어린이집으로 운영된 사실이 있고, 그 보유기간 중 다른 거주주택(직전거주주택)을 양도했다면
          소득세법 시행령 §154⑩에 따라 <strong>직전거주주택 양도일 후의 기간분만</strong> 1주택 보유로
          인정됩니다 — §167조의3①2호의 면적·가액·의무기간 요건은 적용되지 않습니다.
        </p>
      </ToneCard>

      <div className="flex items-center gap-2">
        <ToggleCard
          tone="emerald"
          title="임대주택 등록·어린이집 운영 사실 (소령 §154⑩1호)"
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
            label="직전거주주택 양도일"
            required
            hint="소령 §154⑩2호 — 이 날짜 후의 기간분만 1주택 보유로 인정됩니다. §161① 비과세 기산점이기도 합니다."
          >
            <DateInput
              value={rh.priorResidenceTransferDate ?? ""}
              onChange={(v) => onChange({ priorResidenceTransferDate: v || undefined })}
            />
          </FieldCard>
        </div>
      )}

      <FieldCard
        label="직전거주주택 양도일 이후 거주기간"
        unit="개월"
        hint="취득 당시 조정대상지역이었던 주택만 해당합니다. 비조정지역 취득 주택은 비워 두세요 (소령 §154⑩+§154①)."
      >
        <IntegerInput
          ariaLabel="직전거주주택 양도일 이후 거주기간"
          allowEmpty
          value={residenceMonthsRaw === "" ? undefined : Number(residenceMonthsRaw)}
          onChange={(v) =>
            onChange({ residenceMonthsAfterPriorResidenceTransfer: v === undefined ? "" : String(v) })
          }
        />
      </FieldCard>

      {/* 실시간 충족 표시 (소령 §154⑩ + §154① 보유기간) */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-emerald-800">직전거주주택 양도일 후 보유기간 (2년 이상 필요)</span>
          <span className={cn("font-semibold", holdPass ? "text-emerald-700" : "text-rose-700")}>
            {priorDate ? (holdPass ? "✓ 충족" : "✗ 미충족") : "— 미입력"} — 현재 {holdDaysLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
