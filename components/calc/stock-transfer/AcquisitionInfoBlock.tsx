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
 *  2. inheritance 1985.12.31. 이전 의제취득일 (시행령 §162①)
 *  3. gift 수증일 안내 (§97의2 미적용)
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

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
  const dateHint = cause === "gift" ? "수증일 (§97의2 미적용)" : "실제 취득일 (YYYY-MM-DD)";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-4">
      {/* 헤더 — §104② 안내는 FieldCard hint에서 단일 노출 (디자인 §2-E-1) */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber-800 font-semibold text-sm">📋 취득 정보</span>
      </div>

      {/* 취득일 (single column) */}
      <FieldCard label={dateLabel} required hint={dateHint}>
        <DateInput
          value={form.acquisitionDate}
          onChange={(v) => onChange({ acquisitionDate: v })}
        />
      </FieldCard>

      {/* 취득원인 RadioCardGroup */}
      <FieldCard
        label="취득원인 (단기 30% 기산점)"
        hint="§104② — 취득원인에 따라 단기 보유기간 기산점이 달라집니다"
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
              onChange={(v) => onChange({ decedentAcquisitionDate: v })}
            />
          </FieldCard>
          <p className="text-xs text-amber-800">
            ⓘ 1985.12.31. 이전 취득 주식: 의제취득일 1986.1.1. 자동 적용 (시행령 §162①)
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
              onChange={(v) => onChange({ preMergerAcquisitionDate: v })}
            />
          </FieldCard>
        </div>
      )}
    </div>
  );
}
