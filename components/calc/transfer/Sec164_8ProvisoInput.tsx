"use client";

/**
 * Sec164_8ProvisoInput — §164⑥ 산식 괄호 단서(§164⑧ 준용) 보조 입력.
 *
 * > (취득당시의 가액과 최초로 고시한 기준시가 고시당시의 가액이 동일한 경우에는 제8항의 규정을 준용한다)
 *
 * 두 시점 기준시가합이 같으면 비율이 1이 되어 취득시 환산기준시가 = 최초고시 기준시가가 된다.
 * 법은 이때 §164⑧(기준시가 상승률 참작)을 준용하라고 하며, 산정 산식은 다음과 같다:
 *
 * ```
 *   취득당시 기준시가 = 최초고시 기준시가 × A / [ A + (A − B) × C / D ]
 *     A 취득시 기준시가합(자동)  B 전기의 기준시가합(입력)
 *     C 취득일~최초고시일 월수(자동)  D 조정월수(입력, 기본 12)
 * ```
 *
 * **조건이 성립할 때만 렌더**한다 — 평소에는 보이지 않는 예외 입력이다.
 * 계획서: docs/01-plan/features/commercial-164-6-same-value-164-8-proviso.plan.md
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { isSec164_8ProvisoApplicable, stdPriceSumAt } from "@/lib/calc/commercial-164-6-proviso";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function Sec164_8ProvisoInput({ asset, onChange }: Props) {
  if (!isSec164_8ProvisoApplicable(asset)) return null;
  const sum = stdPriceSumAt(asset, "acq");

  return (
    <ToneCard tone="rose" title="§164⑧ 준용 — 취득당시·최초고시당시 기준시가합이 동일" noDark>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §164 ⑥" label="§164⑥ 산식 단서" />
        <LawArticleModal legalBasis="소득세법 시행령 §164 ⑧" label="§164⑧" />
      </div>
      <p className="text-xs text-rose-800">
        취득당시와 최초고시당시의 기준시가합이{" "}
        <b className="font-mono tabular-nums">{sum.toLocaleString()}</b>원으로 <b>같습니다</b>. 이대로면
        비율이 1이 되어 취득시 환산기준시가가 최초고시 기준시가와 같아지므로, §164⑥ 산식 괄호 단서에
        따라 <b>§164⑧(기준시가 상승률 참작)을 준용</b>합니다.
      </p>
      <p className="text-caption text-rose-700">
        취득당시 기준시가 = 최초고시 기준시가 × A ÷ [A + (A − B) × C ÷ D] · A·C는 자동 산출
      </p>

      <FieldCard
        label="전기의 토지·건물 기준시가 합계액 (B)"
        unit="원"
        hint="취득 직전 고시분의 토지 기준시가 + 건물 기준시가 총액"
      >
        <CurrencyInput
          label=""
          value={asset.cbPrevStdPriceSum}
          onChange={(v) => onChange({ cbPrevStdPriceSum: v })}
          placeholder="전기 기준시가 합계액 입력"
          hideUnit
        />
      </FieldCard>
      <FieldCard
        label="기준시가 조정월수 (D)"
        unit="개월"
        hint="전기 기준시가 결정일부터 취득당시 기준시가 결정일 전일까지의 월수. 비우면 12개월로 봅니다."
      >
        <DecimalInput
          value={asset.cbStdPriceAdjustMonths}
          onChange={(v) => onChange({ cbStdPriceAdjustMonths: v })}
          placeholder="조정월수 입력"
        />
      </FieldCard>

      <p className="text-caption text-muted-foreground">
        C(취득일~최초고시일 월수)는 자동 산출하며, C÷D에는 100% 한도를 적용합니다(시행규칙 §80①1호가목).
      </p>
    </ToneCard>
  );
}
