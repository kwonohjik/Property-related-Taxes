"use client";

/**
 * EstimatedProfitToggle — §56② 추정이익 갈음 옵션 (PR-G)
 *
 * UI 구조:
 *   - ToggleCard tone="violet" (ON/OFF 분기)
 *   - ON 시 펼침:
 *     ① RadioCardGroup — §17의3① 사유 7종 (reasonCode)
 *     ② 동적 기관 행 (≥2) — (유형 RadioCardGroup inline + 기관명 text input + CurrencyInput) + 추가/삭제
 *     ③ 절차 3요건 ToggleCard chip (§56② 2·3·4호)
 *     ④ 미리보기 — 추정이익 평균가액 ÷ 환원율 = 순손익가치 + evaluationMethod 배지
 *   - ON → OFF 시: Dialog 확인 후 estimatedProfit 통째 폐기 (dialog-data-discard-confirm)
 *
 * Phase D·E (이번 구현):
 *   - evaluationDate prop — 현행/구법 시점 안내 (차단 아님)
 *   - agencies[] — 기관 유형 + 이름 입력 (optional, 비차단)
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
  type AgencyType,
  type EstimatedProfitInput,
  type EstimatedProfitReasonCode,
} from "@/lib/tax-engine/property-valuation/estimated-profit-section-56-2";
import { VALUATION } from "@/lib/tax-engine/legal-codes/inheritance-gift";

/** §17의3③ 기관 유형 라벨 (상증규 §17의3③) */
const AGENCY_TYPE_LABEL: Record<AgencyType, string> = {
  credit_rating: "신용평가전문기관",
  accounting: "회계법인",
  tax: "세무법인",
};

const AGENCY_TYPE_OPTIONS: { value: AgencyType; label: string; description: string }[] = [
  { value: "credit_rating", label: "신용평가전문기관", description: "자본시장법 §335의3 인가" },
  { value: "accounting", label: "회계법인", description: "공인회계사법에 따른 회계법인" },
  { value: "tax", label: "세무법인", description: "세무사법에 따른 세무법인" },
];

const REASON_OPTIONS: { value: EstimatedProfitReasonCode; label: string; description: string }[] = [
  { value: "asset_receipt_50pct", label: "자산수증이익 등 50% 초과 (2호)", description: "자산수증·채무면제·보험차익·재해손실 가중평균이 (법인세차감전손익 − 자산수증이익등) 가중평균의 50% 초과" },
  { value: "merger_split_business_change", label: "합병·분할·주요업종 변경 (3호)", description: "평가기준일 전 3년 기간 중 합병·분할 또는 주요 업종 변경" },
  { value: "merger_gift_section38", label: "§38 합병증여이익 산정 (4호)", description: "법 §38 합병증여이익 산정을 위한 합병당사법인 주식가액 산정" },
  { value: "closure_over_1yr", label: "1년 이상 휴업 (5호)", description: "최근 3개 사업연도 중 1년 이상 휴업한 사실" },
  { value: "disposal_gain_50pct", label: "처분손익 등 50% 초과 (6호)", description: "유가증권·유형자산 처분손익 + 자산수증이익등 가중평균이 법인세차감전손익 가중평균의 50% 초과" },
  { value: "sales_period_under_3yr", label: "매출발생 3년 미만 (7호)", description: "주요 업종 정상 매출발생기간이 3년 미만" },
  { value: "similar_notified", label: "고시 유사 사유 (8호)", description: "2~7호와 유사한 재정경제부장관 고시 사유" },
];

// ② initial — agencies: undefined (optional, 비차단)
const DEFAULT_INPUT: EstimatedProfitInput = {
  reasonCode: "merger_split_business_change",
  agencyEstimates: [0, 0],
  agencies: undefined,
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
  /**
   * 영역 D — 시점 안내용 평가기준일.
   * UnlistedStockV2Card의 effectiveInput.evaluationDate 주입.
   * undefined 시 evaluationMethod 배지 미표시 (차단 아님).
   */
  evaluationDate?: Date;
}

export function EstimatedProfitToggle({
  value,
  onChange,
  capitalizationRate = 0.1,
  sectionNum = 4,
  evaluationDate,
}: EstimatedProfitToggleProps) {
  const isOn = value !== undefined;
  const [discardOpen, setDiscardOpen] = useState(false);

  // ④ 미리보기 — evaluationDate 주입 (영역 D)
  const preview = useMemo(
    () => (value ? applyEstimatedProfit(value, capitalizationRate, evaluationDate) : null),
    [value, capitalizationRate, evaluationDate],
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

  // 영역 E — agencies 추가 시 함께 확장 (인덱스 정합 패딩)
  const handleAddAgency = () => {
    if (!value) return;
    onChange({
      ...value,
      agencyEstimates: [...value.agencyEstimates, 0],
      agencies: value.agencies
        ? [...value.agencies, { type: "credit_rating" as AgencyType, name: "" }]
        : undefined, // agencies가 undefined이면 유지 (기존 데이터 하위호환)
    });
  };

  const handleRemoveAgency = (idx: number) => {
    if (!value || value.agencyEstimates.length <= 2) return;
    onChange({
      ...value,
      agencyEstimates: value.agencyEstimates.filter((_, i) => i !== idx),
      agencies: value.agencies ? value.agencies.filter((_, i) => i !== idx) : undefined,
    });
  };

  // 영역 E — 기관 유형 변경 (처음 입력 시 agencies 초기화)
  const handleAgencyTypeChange = (idx: number, type: AgencyType) => {
    if (!value) return;
    const currentAgencies =
      value.agencies ??
      value.agencyEstimates.map(() => ({ type: "credit_rating" as AgencyType, name: "" }));
    const next = [...currentAgencies];
    next[idx] = { ...next[idx], type };
    onChange({ ...value, agencies: next });
  };

  // 영역 E — 기관명 변경 (처음 입력 시 agencies 초기화)
  const handleAgencyNameChange = (idx: number, name: string) => {
    if (!value) return;
    const currentAgencies =
      value.agencies ??
      value.agencyEstimates.map(() => ({ type: "credit_rating" as AgencyType, name: "" }));
    const next = [...currentAgencies];
    next[idx] = { ...next[idx], name };
    onChange({ ...value, agencies: next });
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

              {/* ② 동적 기관 행 (≥2) — 유형 + 기관명 + 추정이익 */}
              <div className="space-y-2" data-testid="estimated-profit-agencies">
                {value.agencyEstimates.map((est, idx) => {
                  const agencyMeta = value.agencies?.[idx];
                  return (
                    <div
                      key={idx}
                      className="rounded-md border border-violet-200 bg-violet-50/60 p-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-violet-800">
                          평가기관 {idx + 1}
                        </span>
                        {value.agencyEstimates.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAgency(idx)}
                            className="text-xs text-rose-600 hover:text-rose-700"
                            data-testid={`estimated-profit-remove-${idx}`}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      {/* 기관 유형 선택 — RadioCardGroup inline */}
                      <div data-testid={`estimated-profit-agency-type-${idx}`}>
                        <p className="text-[10px] text-violet-700 mb-1">
                          유형{" "}
                          <span className="text-violet-500">
                            (<LawArticleModal
                              legalBasis={VALUATION.UNLISTED_ESTIMATED_AGENCY_TYPE}
                              label={VALUATION.UNLISTED_ESTIMATED_AGENCY_TYPE}
                              className="text-[10px]"
                            />)
                          </span>
                        </p>
                        <RadioCardGroup
                          lawLinks="상증법"
                          name={`estimated-profit-agency-type-${idx}`}
                          tone="violet"
                          layout="inline"
                          value={agencyMeta?.type ?? "credit_rating"}
                          onChange={(type) => handleAgencyTypeChange(idx, type as AgencyType)}
                          options={AGENCY_TYPE_OPTIONS}
                        />
                      </div>
                      {/* 기관명 — 비차단, SelectOnFocusProvider 전역 처리 */}
                      <FieldCard
                        label={`평가기관 ${idx + 1} 기관명`}
                        hint="기관명을 입력하세요 (예: NICE신용평가, 삼일회계법인)"
                      >
                        <input
                          type="text"
                          data-testid={`estimated-profit-agency-name-${idx}`}
                          value={agencyMeta?.name ?? ""}
                          onChange={(e) => handleAgencyNameChange(idx, e.target.value)}
                          placeholder="기관명 입력 (예: NICE신용평가, 삼일회계법인)"
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-400"
                        />
                      </FieldCard>
                      {/* 1주당 추정이익 */}
                      <FieldCard
                        label={`평가기관 ${idx + 1} — 1주당 추정이익`}
                        hint="해당 평가기관이 산출한 1주당 추정이익 (원, 환원 전 금액)"
                      >
                        <CurrencyInput
                          label={`평가기관 ${idx + 1} 추정이익`}
                          hideLabel
                          value={String(est || "")}
                          onChange={(raw) => handleEstimateChange(idx, raw)}
                          hideUnit
                        />
                      </FieldCard>
                    </div>
                  );
                })}
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

              {/* ④ 미리보기 — evaluationMethod 배지 포함 */}
              {preview && (
                <div
                  className="rounded-md border border-violet-200 bg-violet-100/60 px-3 py-2 text-xs text-violet-900 space-y-1"
                  data-testid="estimated-profit-preview"
                >
                  {preview.applied ? (
                    <p>
                      추정이익 평균가액 <b>{fmt(preview.estimatedProfitAverage)}</b> (기관 {preview.agencyCount}개 평균)
                      {" "}÷ 환원율 {(capitalizationRate * 100).toFixed(0)}% = 1주당 순손익가치{" "}
                      <b>{fmt(preview.perShareIncomeValue)}</b>
                    </p>
                  ) : (
                    <p className="text-amber-700">
                      요건 미충족으로 갈음 미적용 — {preview.warnings.filter((w) => !w.startsWith("[시점 안내]")).join(" / ")}
                    </p>
                  )}
                  {/* 영역 D — evaluationMethod 배지 */}
                  {preview.evaluationMethod && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium border ${
                          preview.evaluationMethod === "legacy"
                            ? "bg-amber-100 border-amber-300 text-amber-700"
                            : "bg-violet-100 border-violet-300 text-violet-700"
                        }`}
                        data-testid="preview-evaluation-method-badge"
                      >
                        {preview.evaluationMethod === "legacy" ? "구법 안내" : "현행"}
                      </span>
                      <span
                        className={`text-[10px] leading-snug ${
                          preview.evaluationMethod === "legacy" ? "text-amber-700" : "text-violet-700"
                        }`}
                      >
                        {preview.evaluationMethodNote}
                      </span>
                    </div>
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
