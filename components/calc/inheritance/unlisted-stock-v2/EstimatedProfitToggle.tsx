"use client";

/**
 * EstimatedProfitToggle — §56② 추정이익 갈음 옵션 (PR-G)
 *
 * UI 구조:
 *   - ToggleCard tone="violet" (ON/OFF 분기)
 *   - ON 시 펼침:
 *     ① RadioCardGroup — §17의3① 사유 7종 (reasonCode)
 *     ② 동적 기관 추정이익 행 (≥2) — CurrencyInput[] + 추가/삭제
 *     ③ 절차 3요건 ToggleCard chip (§56② 2·3·4호)
 *     ④ 미리보기 — 추정이익 평균가액 ÷ 환원율 = 순손익가치 (applyEstimatedProfit 재사용)
 *   - ON → OFF 시: Dialog 확인 후 estimatedProfit 통째 폐기 (dialog-data-discard-confirm)
 *
 * 갈음 산식·결과 표시는 orchestrator + PerShareValuationResultCard. 본 토글은 입력만.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md
 * 법령: 상증령 §56② + 상증규 §17의3①④
 */

import { useMemo, useState } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyEstimatedProfit,
  type EstimatedProfitInput,
  type EstimatedProfitReasonCode,
} from "@/lib/tax-engine/property-valuation/estimated-profit-section-56-2";

const REASON_OPTIONS: { value: EstimatedProfitReasonCode; label: string; description: string }[] = [
  { value: "asset_receipt_50pct", label: "자산수증이익 등 50% 초과 (2호)", description: "자산수증·채무면제·보험차익·재해손실 가중평균이 (법인세차감전손익 − 자산수증이익등) 가중평균의 50% 초과" },
  { value: "merger_split_business_change", label: "합병·분할·주요업종 변경 (3호)", description: "평가기준일 전 3년 기간 중 합병·분할 또는 주요 업종 변경" },
  { value: "merger_gift_section38", label: "§38 합병증여이익 산정 (4호)", description: "법 §38 합병증여이익 산정을 위한 합병당사법인 주식가액 산정" },
  { value: "closure_over_1yr", label: "1년 이상 휴업 (5호)", description: "최근 3개 사업연도 중 1년 이상 휴업한 사실" },
  { value: "disposal_gain_50pct", label: "처분손익 등 50% 초과 (6호)", description: "유가증권·유형자산 처분손익 + 자산수증이익등 가중평균이 법인세차감전손익 가중평균의 50% 초과" },
  { value: "sales_period_under_3yr", label: "매출발생 3년 미만 (7호)", description: "주요 업종 정상 매출발생기간이 3년 미만" },
  { value: "similar_notified", label: "고시 유사 사유 (8호)", description: "2~7호와 유사한 재정경제부장관 고시 사유" },
];

const DEFAULT_INPUT: EstimatedProfitInput = {
  reasonCode: "merger_split_business_change",
  agencyEstimates: [0, 0],
  filedWithinDeadline: false,
  baseDateAndReportWithinDeadline: false,
  sameYearAsInheritanceOrGift: false,
};

export interface EstimatedProfitToggleProps {
  /** undefined = OFF, 정의됨 = ON */
  value: EstimatedProfitInput | undefined;
  onChange: (next: EstimatedProfitInput | undefined) => void;
  /** §54① 환원율 (미리보기용, 기본 0.10) */
  capitalizationRate?: number;
  /** 섹션 번호 (부모 UnlistedStockV2Card 단일 출처) */
  sectionNum?: number;
}

export function EstimatedProfitToggle({
  value,
  onChange,
  capitalizationRate = 0.1,
  sectionNum = 4,
}: EstimatedProfitToggleProps) {
  const isOn = value !== undefined;
  const [discardOpen, setDiscardOpen] = useState(false);

  const preview = useMemo(
    () => (value ? applyEstimatedProfit(value, capitalizationRate) : null),
    [value, capitalizationRate],
  );

  const handleToggle = (next: boolean) => {
    if (next) {
      onChange({ ...DEFAULT_INPUT, agencyEstimates: [0, 0] });
    } else if (isOn) {
      const hasData =
        (value?.agencyEstimates.some((v) => v > 0) ?? false) ||
        !!(value && (value.filedWithinDeadline || value.baseDateAndReportWithinDeadline || value.sameYearAsInheritanceOrGift));
      if (hasData) setDiscardOpen(true);
      else onChange(undefined);
    }
  };

  const confirmDiscard = () => {
    onChange(undefined);
    setDiscardOpen(false);
  };

  const handleReasonChange = (reasonCode: EstimatedProfitReasonCode) => {
    if (!value) return;
    onChange({ ...value, reasonCode });
  };

  const handleEstimateChange = (idx: number, raw: string) => {
    if (!value) return;
    const next = [...value.agencyEstimates];
    next[idx] = parseAmount(raw);
    onChange({ ...value, agencyEstimates: next });
  };

  const handleAddAgency = () => {
    if (!value) return;
    onChange({ ...value, agencyEstimates: [...value.agencyEstimates, 0] });
  };

  const handleRemoveAgency = (idx: number) => {
    if (!value || value.agencyEstimates.length <= 2) return;
    onChange({ ...value, agencyEstimates: value.agencyEstimates.filter((_, i) => i !== idx) });
  };

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <>
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            {sectionNum}
          </span>
          <p className="text-xs font-semibold text-violet-700">추정이익 갈음 (선택)</p>
        </div>
        <ToggleCard
          lawLinks="상증법"
          tone="violet"
          checked={isOn}
          onCheckedChange={handleToggle}
          title="§56② 추정이익 평균가액 갈음 옵션"
          description="일시·우발적 사건 등(§17의3①) + 절차 요건 충족 시, 둘 이상 평가기관의 1주당 추정이익 평균가액으로 순손익가치를 갈음 (상증령 §56②)"
        >
          {isOn && value && (
            <div className="space-y-3 mt-2" data-testid="estimated-profit-form">
              <div className="flex flex-wrap gap-1.5">
                <LawArticleModal legalBasis="상증령 §56" label="상증령 §56② 추정이익 갈음" />
                <LawArticleModal legalBasis="상증규 §17의3" label="상증규 §17의3 사유·환원율" />
              </div>
              {/* ① §17의3① 사유 */}
              <RadioCardGroup
                lawLinks="상증법"
                name="estimated-profit-reason"
                tone="violet"
                layout="stack"
                value={value.reasonCode}
                onChange={handleReasonChange}
                options={REASON_OPTIONS}
              />

              {/* ② 동적 기관 추정이익 행 (≥2) */}
              <div className="space-y-2" data-testid="estimated-profit-agencies">
                {value.agencyEstimates.map((est, idx) => (
                  <FieldCard
                    key={idx}
                    label={`평가기관 ${idx + 1} — 1주당 추정이익`}
                    hint="신용평가전문기관·회계법인·세무법인이 산출한 1주당 추정이익 (원)"
                    trailing={
                      value.agencyEstimates.length > 2 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveAgency(idx)}
                          className="text-xs text-rose-600 hover:text-rose-700"
                          data-testid={`estimated-profit-remove-${idx}`}
                        >
                          삭제
                        </button>
                      ) : undefined
                    }
                  >
                    <CurrencyInput
                      label={`평가기관 ${idx + 1} 추정이익`}
                      hideLabel
                      value={String(est || "")}
                      onChange={(raw) => handleEstimateChange(idx, raw)}
                      hideUnit
                    />
                  </FieldCard>
                ))}
                <button
                  type="button"
                  onClick={handleAddAgency}
                  className="text-xs font-medium text-violet-700 hover:text-violet-900"
                  data-testid="estimated-profit-add-agency"
                >
                  + 평가기관 추가
                </button>
              </div>

              {/* ③ 절차 3요건 (§56② 2·3·4호) */}
              <div className="space-y-2">
                <ToggleCard
                  lawLinks="상증법"
                  tone="violet"
                  variant="chip"
                  checked={value.filedWithinDeadline}
                  onCheckedChange={(c) => onChange({ ...value, filedWithinDeadline: c })}
                  title="신고기한 내 추정이익 평균가액 신고 (§56② 2호)"
                />
                <ToggleCard
                  lawLinks="상증법"
                  tone="violet"
                  variant="chip"
                  checked={value.baseDateAndReportWithinDeadline}
                  onCheckedChange={(c) => onChange({ ...value, baseDateAndReportWithinDeadline: c })}
                  title="산정기준일·평가서작성일이 신고기한 이내 (§56② 3호)"
                />
                <ToggleCard
                  lawLinks="상증법"
                  tone="violet"
                  variant="chip"
                  checked={value.sameYearAsInheritanceOrGift}
                  onCheckedChange={(c) => onChange({ ...value, sameYearAsInheritanceOrGift: c })}
                  title="산정기준일·상속개시(증여)일 동일 연도 (§56② 4호)"
                />
              </div>

              {/* ④ 미리보기 */}
              {preview && (
                <div
                  className="rounded-md border border-violet-200 bg-violet-100/60 px-3 py-2 text-xs text-violet-900"
                  data-testid="estimated-profit-preview"
                >
                  {preview.applied ? (
                    <>
                      추정이익 평균가액 <b>{fmt(preview.estimatedProfitAverage)}</b> (기관 {preview.agencyCount}개 평균)
                      {" "}÷ 환원율 {(capitalizationRate * 100).toFixed(0)}% = 1주당 순손익가치{" "}
                      <b>{fmt(preview.perShareIncomeValue)}</b>
                    </>
                  ) : (
                    <span className="text-amber-700">
                      요건 미충족으로 갈음 미적용 — {preview.warnings.join(" / ")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </ToggleCard>
      </div>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent data-testid="estimated-profit-discard-dialog">
          <DialogHeader>
            <DialogTitle>추정이익 갈음 입력 폐기</DialogTitle>
            <DialogDescription>
              지금까지 입력한 추정이익 갈음 정보(사유·평가기관 추정이익·절차 확인)가 모두 폐기됩니다. 계속 진행할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
              data-testid="estimated-profit-discard-cancel"
            >
              취소 (입력 유지)
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
              className="px-3 py-1.5 text-sm rounded-md bg-rose-600 text-white hover:bg-rose-700"
              data-testid="estimated-profit-discard-confirm"
            >
              폐기 후 OFF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
