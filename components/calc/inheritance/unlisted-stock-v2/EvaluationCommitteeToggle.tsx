"use client";

/**
 * EvaluationCommitteeToggle — §54⑥ 평가심의위원회 신청 옵션 (PR-K-3)
 *
 * UI 구조:
 *   - ToggleCard tone="emerald" (ON/OFF 분기)
 *   - ON 시 펼침: RadioCardGroup 4방법 + 신청 평가액 + (other 시) methodNotes + (선택) evaluatorOrganization
 *   - ON → OFF 시: Dialog 확인 후 evaluationCommittee 통째 폐기 (memory dialog-data-discard-confirm)
 *
 * 본 토글은 입력 폼만 담당. 70~130% 범위 검증·결과 표시는 PR-K-4 (Range Indicator + ResultCard).
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md PR-K-3
 * 법령: 상증령 §54⑥ + §49의2⑤2호
 */

import { useState } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
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
  METHOD_LABEL,
  type EvaluationCommitteeInput,
  type EvaluationCommitteeMethod,
} from "@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6";

const DEFAULT_INPUT: EvaluationCommitteeInput = {
  method: "clm",
  taxpayerPerShareValuation: 0,
  methodNotes: "",
  evaluatorOrganization: "",
};

export interface EvaluationCommitteeToggleProps {
  /** undefined = OFF, 정의됨 = ON */
  value: EvaluationCommitteeInput | undefined;
  onChange: (next: EvaluationCommitteeInput | undefined) => void;
}

export function EvaluationCommitteeToggle({ value, onChange }: EvaluationCommitteeToggleProps) {
  const isOn = value !== undefined;
  const [discardOpen, setDiscardOpen] = useState(false);

  const handleToggle = (next: boolean) => {
    if (next) {
      // OFF → ON: 기본값 주입
      onChange({ ...DEFAULT_INPUT });
    } else if (isOn) {
      // ON → OFF: 입력값 있으면 Dialog 확인, 없으면 즉시 폐기
      const hasData =
        (value?.taxpayerPerShareValuation ?? 0) > 0 ||
        !!(value?.methodNotes && value.methodNotes.trim()) ||
        !!(value?.evaluatorOrganization && value.evaluatorOrganization.trim());
      if (hasData) {
        setDiscardOpen(true);
      } else {
        onChange(undefined);
      }
    }
  };

  const confirmDiscard = () => {
    onChange(undefined);
    setDiscardOpen(false);
  };

  const handleMethodChange = (method: EvaluationCommitteeMethod) => {
    if (!value) return;
    onChange({ ...value, method });
  };

  const handleTaxpayerChange = (raw: string) => {
    if (!value) return;
    onChange({ ...value, taxpayerPerShareValuation: parseAmount(raw) });
  };

  const handleNotesChange = (notes: string) => {
    if (!value) return;
    onChange({ ...value, methodNotes: notes });
  };

  const handleEvalOrgChange = (org: string) => {
    if (!value) return;
    onChange({ ...value, evaluatorOrganization: org });
  };

  return (
    <>
      <ToggleCard
        tone="emerald"
        checked={isOn}
        onCheckedChange={handleToggle}
        title="§54⑥ 평가심의위원회 신청 옵션"
        description="보충적 평가가액의 70~130% 범위 내 4가지 평가법 중 선택 (상증령 §54⑥ + §49의2)"
      >
        {isOn && value && (
          <div
            className="space-y-3 mt-2"
            data-testid="evaluation-committee-form"
          >
            <RadioCardGroup
              name="evaluation-committee-method"
              tone="emerald"
              layout="stack"
              value={value.method}
              onChange={handleMethodChange}
              options={[
                {
                  value: "clm",
                  label: METHOD_LABEL.clm,
                  description:
                    "동종 상장법인 PER·PBR·EV/EBITDA 등 시장배수 비교 (Comparable Listed Method)",
                },
                {
                  value: "dcf",
                  label: METHOD_LABEL.dcf,
                  description:
                    "미래 현금흐름을 WACC로 할인한 기업가치 (Discounted Cash Flow)",
                },
                {
                  value: "ddm",
                  label: METHOD_LABEL.ddm,
                  description:
                    "장래 예상 배당금을 자본환원율로 할인 (Dividend Discount Model)",
                },
                {
                  value: "other",
                  label: METHOD_LABEL.other,
                  description: "신용평가전문기관·감정평가법인 등 기타 합리적 평가법 (사유 필수)",
                },
              ]}
            />

            <FieldCard
              label="신청 평가액 (1주당)"
              hint="평가심의위에 신청하는 1주당 평가가액 (원). 보충적 평가가액의 70~130% 범위 내."
            >
              <CurrencyInput
                label="신청 평가액"
                value={String(value.taxpayerPerShareValuation || "")}
                onChange={handleTaxpayerChange}
                hideUnit
              />
            </FieldCard>

            {value.method === "other" && (
              <FieldCard
                label="평가법 사유 (필수)"
                hint="§49의2⑤2호 — 기타 평가법 선택 시 합리적 사유·근거 자료 입력 필수"
              >
                <textarea
                  value={value.methodNotes ?? ""}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder="감정평가법인 평가서 / 신용평가전문기관 평가 등"
                  data-testid="evaluation-committee-notes-input"
                />
              </FieldCard>
            )}

            <FieldCard
              label="평가기관 (선택)"
              hint="평가심의위 첨부자료 작성 기관명 — 신용평가전문기관 의뢰 시 §49의2⑨ 수수료 납세자 부담 안내"
            >
              <input
                type="text"
                value={value.evaluatorOrganization ?? ""}
                onChange={(e) => handleEvalOrgChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="삼일회계법인 / 한국기업평가 등"
                data-testid="evaluation-committee-organization-input"
              />
            </FieldCard>
          </div>
        )}
      </ToggleCard>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent data-testid="evaluation-committee-discard-dialog">
          <DialogHeader>
            <DialogTitle>평가심의위 신청 입력 폐기</DialogTitle>
            <DialogDescription>
              지금까지 입력한 평가심의위원회 신청 정보(평가법·신청 평가액·사유 등)가
              모두 폐기됩니다. 계속 진행할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
              data-testid="evaluation-committee-discard-cancel"
            >
              취소 (입력 유지)
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
              className="px-3 py-1.5 text-sm rounded-md bg-rose-600 text-white hover:bg-rose-700"
              data-testid="evaluation-committee-discard-confirm"
            >
              폐기 후 OFF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
