"use client";

/**
 * AcquisitionInfoBlock — 취득 정보 통합 카드 (single 모드, Plan v1.2)
 *
 * 취득일 + 취득원인(§104② 기산점) + cause별 보조 일자를 amber tone 단일 카드로 통합.
 * 기존 AcquisitionCauseBlock 폐기 후 후속.
 *
 * 정책:
 *  - feedback_section_card_numbering: amber tone 색상 카드
 *  - feedback_toggle_card_visibility: RadioCardGroup OFF/ON 모두 tone 유지
 *  - feedback_no_silent_apportion_fallback: cause 변경 시 보조 일자 store 값 유지
 *  - feedback_useeffect_store_mirror_forbidden: 모든 변경은 onChange 직접 patch
 *
 * 기존 안내 카드 3종 보존:
 *  1. 단기 30% (§104②)
 *  2. inheritance 1985.12.31. 이전 의제취득일 (시행령 §162⑦3호)
 *  3. gift 수증일 안내 (§97의2 미적용)
 *
 * 의제취득일 자동 적용 (시행령 §162⑦3호):
 *  - 1985.12.31. 이전 입력 시 onChange 시점에 자동 1986-01-01 patch
 *  - 원래 입력값은 component local state로 보관하여 안내 메시지에 표시
 */

import { useState } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

const DEEMED_CUTOFF = "1985-12-31";
const DEEMED_DATE = "1986-01-01";

/** 1985.12.31. 이전(포함)이면 1986-01-01 의제취득일로 강제 변환 */
function coerceDeemed(value: string): { coerced: string; applied: boolean } {
  if (!value) return { coerced: value, applied: false };
  if (value <= DEEMED_CUTOFF) {
    return { coerced: DEEMED_DATE, applied: true };
  }
  return { coerced: value, applied: false };
}

interface AcquisitionInfoBlockProps {
  form: Pick<
    StockTransferFormData,
    | "acquisitionDate"
    | "acquisitionCause"
    | "decedentAcquisitionDate"
    | "preMergerAcquisitionDate"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function AcquisitionInfoBlock({ form, onChange }: AcquisitionInfoBlockProps) {
  // 3중 패턴 default — store factory와 일치
  const cause = form.acquisitionCause || "purchase";
  const dateLabel = cause === "gift" ? "수증일" : "취득일";
  // gift만 보조 정보(§97의2 미적용) 노출. purchase 등 자명 케이스는 hint 생략.
  const dateHint = cause === "gift" ? "수증일 — §97의2 이월과세 미적용" : undefined;

  // 의제취득일 자동 변환 시 사용자 입력 원본을 임시 보관 (안내 메시지용)
  // store에는 변환된 값만 들어가므로 원본은 local state로만 유지
  const [acqOriginal, setAcqOriginal] = useState<string | null>(null);
  const [decedentOriginal, setDecedentOriginal] = useState<string | null>(null);
  const [preMergerOriginal, setPreMergerOriginal] = useState<string | null>(null);

  const handleAcqDateChange = (v: string) => {
    const { coerced, applied } = coerceDeemed(v);
    setAcqOriginal(applied ? v : null);
    onChange({ acquisitionDate: coerced });
  };

  const handleDecedentDateChange = (v: string) => {
    const { coerced, applied } = coerceDeemed(v);
    setDecedentOriginal(applied ? v : null);
    onChange({ decedentAcquisitionDate: coerced });
  };

  const handlePreMergerDateChange = (v: string) => {
    const { coerced, applied } = coerceDeemed(v);
    setPreMergerOriginal(applied ? v : null);
    onChange({ preMergerAcquisitionDate: coerced });
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-4">
      {/* 헤더 — §104② 안내는 FieldCard hint에서 단일 노출 (디자인 §2-E-1) */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber-800 font-semibold text-sm">📋 취득 정보</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />
        <LawArticleModal legalBasis="소득세법 §104 ②" label="§104②" />
      </div>

      {/* 취득일 (single column) */}
      <FieldCard label={dateLabel} required hint={dateHint}>
        <DateInput value={form.acquisitionDate} onChange={handleAcqDateChange} />
        {acqOriginal && form.acquisitionDate === DEEMED_DATE && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-100/70 px-2 py-1.5 text-xs text-amber-900">
            ⓘ 입력하신 {acqOriginal}은 1985.12.31. 이전이므로 의제취득일{" "}
            <strong>1986.1.1.</strong>로 자동 변경되었습니다.{" "}
            (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
          </p>
        )}
      </FieldCard>

      {/* 취득원인 RadioCardGroup */}
      <FieldCard
        label="취득원인"
        hint="§104② 단기 30% 기산점 — 취득원인에 따라 단기 보유기간 기산점이 달라집니다"
      >
        <RadioCardGroup
          name="acquisitionCause"
          value={cause}
          onChange={(v) =>
            onChange({ acquisitionCause: v as StockTransferFormData["acquisitionCause"] })
          }
          tone="amber"
          layout="inline"
          options={[
            { value: "purchase", label: "매매", description: "취득일 기산" },
            { value: "inheritance", label: "상속", description: "피상속인 취득일 (§104②1)" },
            { value: "gift", label: "증여", description: "수증일 (§97의2 미적용)" },
            { value: "merger_split", label: "합병·분할", description: "종전 주식 (§104②3)" },
          ]}
        />
      </FieldCard>

      {/* inheritance nested 카드 */}
      {cause === "inheritance" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3 space-y-2">
          <FieldCard
            label="피상속인 취득일 (§104②1)"
            required
            hint="단기 30% 세율 적용 여부는 피상속인 취득일 → 양도일로 계산"
          >
            <DateInput
              value={form.decedentAcquisitionDate ?? ""}
              onChange={handleDecedentDateChange}
            />
            {decedentOriginal && form.decedentAcquisitionDate === DEEMED_DATE && (
              <p className="mt-2 rounded-md border border-amber-400 bg-amber-200/70 px-2 py-1.5 text-xs text-amber-900">
                ⓘ 입력하신 피상속인 취득일 {decedentOriginal}은 1985.12.31. 이전이므로
                의제취득일 <strong>1986.1.1.</strong>로 자동 변경되었습니다.{" "}
                (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
              </p>
            )}
          </FieldCard>
          <p className="text-xs text-amber-800">
            ⓘ 1985.12.31. 이전 취득 주식: 의제취득일 1986.1.1. 자동 적용 (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
          </p>
        </div>
      )}

      {/* gift nested 안내 */}
      {cause === "gift" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3">
          <p className="text-xs text-amber-800">
            ⓘ 증여 주식은 수증일(= 취득일)부터 기산합니다. §97의2 이월과세는 주식에 미적용.
          </p>
        </div>
      )}

      {/* merger_split nested 카드 */}
      {cause === "merger_split" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3">
          <FieldCard
            label="종전 주식 취득일 (§104②3)"
            required
            hint="합병·분할로 취득한 신주의 단기 기산점은 종전 주식 취득일"
          >
            <DateInput
              value={form.preMergerAcquisitionDate ?? ""}
              onChange={handlePreMergerDateChange}
            />
            {preMergerOriginal && form.preMergerAcquisitionDate === DEEMED_DATE && (
              <p className="mt-2 rounded-md border border-amber-400 bg-amber-200/70 px-2 py-1.5 text-xs text-amber-900">
                ⓘ 입력하신 종전 주식 취득일 {preMergerOriginal}은 1985.12.31. 이전이므로
                의제취득일 <strong>1986.1.1.</strong>로 자동 변경되었습니다.{" "}
                (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
              </p>
            )}
          </FieldCard>
        </div>
      )}
    </div>
  );
}
