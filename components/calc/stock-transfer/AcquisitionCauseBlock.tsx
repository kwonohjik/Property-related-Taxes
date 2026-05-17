"use client";

/**
 * AcquisitionCauseBlock — 취득원인 + 단기 30% 기산점 (Step 1)
 *
 * §104② — 단기 보유기간 기산점 분기:
 *   매매: 취득일 → 양도일
 *   상속: 피상속인 취득일 → 양도일 (§104②1)
 *   증여: 수증일 → 양도일 (§97의2 미적용 — 일반 증여)
 *   합병·분할: 종전 주식 취득일 → 양도일 (§104②3)
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface AcquisitionCauseBlockProps {
  form: Pick<
    StockTransferFormData,
    | "acquisitionCause"
    | "decedentAcquisitionDate"
    | "donorAcquisitionDate"
    | "preMergerAcquisitionDate"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function AcquisitionCauseBlock({ form, onChange }: AcquisitionCauseBlockProps) {
  const cause = form.acquisitionCause || "purchase";

  return (
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
          {
            value: "inheritance",
            label: "상속",
            description: "피상속인 취득일 기산 (§104②1)",
          },
          {
            value: "gift",
            label: "증여",
            description: "수증일 기산 (§97의2 미적용)",
          },
          {
            value: "merger_split",
            label: "합병·분할",
            description: "종전 주식 취득일 기산 (§104②3)",
          },
        ]}
      />

      {/* 상속: 피상속인 취득일 */}
      {cause === "inheritance" && (
        <div className="mt-4">
          <FieldCard
            label="피상속인 취득일 (§104②1)"
            required
            hint="단기 30% 세율 적용 여부는 피상속인 취득일 → 양도일로 계산합니다"
          >
            <DateInput
              value={form.decedentAcquisitionDate}
              onChange={(v) => onChange({ decedentAcquisitionDate: v })}
            />
          </FieldCard>
          {/* 의제취득일 안내 (1985.12.31. 이전) */}
          <div className="mt-2 rounded border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700">
            1985.12.31. 이전 취득 주식: 의제취득일 1986.1.1. 자동 적용 (시행령 §162①)
          </div>
        </div>
      )}

      {/* 증여: 수증일 (별도 보조 일자 — PR-1은 수증일 = 취득일로 처리) */}
      {cause === "gift" && (
        <div className="mt-4">
          <div className="rounded border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700">
            증여 주식은 수증일(= 취득일)부터 기산합니다. §97의2 이월과세는 주식에 미적용.
          </div>
        </div>
      )}

      {/* 합병·분할: 종전 주식 취득일 */}
      {cause === "merger_split" && (
        <div className="mt-4">
          <FieldCard
            label="종전 주식 취득일 (§104②3)"
            required
            hint="합병·분할로 취득한 신주의 단기 기산점은 종전 주식 취득일입니다"
          >
            <DateInput
              value={form.preMergerAcquisitionDate}
              onChange={(v) => onChange({ preMergerAcquisitionDate: v })}
            />
          </FieldCard>
        </div>
      )}
    </FieldCard>
  );
}
