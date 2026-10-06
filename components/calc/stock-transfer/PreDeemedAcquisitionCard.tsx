"use client";

/**
 * PreDeemedAcquisitionCard — 의제취득일 전 «매수» 안내 + ② 입력 (Step 2, 영 §176의2④ — Z-1)
 *
 * 의제취득일(주식 1986.1.1. · 기타자산 1985.1.1.) 전에 매수한 주식의 취득가액은 다음 중 **많은 것**이다.
 *   ① 의제취득일 현재 매매사례가액·환산취득가액(입력한 모드)
 *   ② 취득 당시 실지거래가액 + 생산자물가상승분 (시행규칙 §85의2 — 취득월 지수 대비 의제취득일 직전 달 지수)
 *
 * - 실가 모드: 입력한 실가가 ②의 기준이다 — 별도 입력 없이 엔진이 산정한다.
 * - 환산·매매사례 모드: 실가를 «알고 있으면» 함께 입력해 ②와 ①을 견준다(비우면 ①만).
 * - 취득월이 PPI 계열(1965.01~) 이전이면 배율을 직접 입력한다(계획서 Q-4).
 *
 * 표시 조건 `isPreDeemedPurchaseForm`은 엔진 `resolvePreDeemedBasis`·④·⑧·⑫와 같은 leaf다.
 * 계획서: docs/00-pm/stock-pre-deemed-acquisition-176-2-4.plan.md
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  isPreDeemedPurchaseForm,
  isSection94_4Form,
} from "@/lib/calc/stock-transfer-section94-4-form";
import { isBeforePpiSeries } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import { stockDeemedAcquisitionDate } from "@/lib/tax-engine/stock-transfer/stock-deemed-acquisition-date";

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function PreDeemedAcquisitionCard({ form, onChange }: Props) {
  if (!isPreDeemedPurchaseForm(form)) return null;

  const mode = form.acquisitionMode || "actual"; // 3중 패턴 default
  const deemed = stockDeemedAcquisitionDate(isSection94_4Form(form)).replace(/-0?/g, ".").concat(".");
  const needsRatio =
    isBeforePpiSeries(form.acquisitionDate) &&
    (mode === "actual" || parseFloat((form.preDeemedActualPricePerShare || "0").replace(/,/g, "")) > 0);

  return (
    <div data-testid="pre-deemed-acquisition-card">
      <ToneCard
        tone="amber"
        title="의제취득일 전 취득 — 「많은 것」 (소득세법 시행령 §176의2④)"
        bodyClassName="space-y-3"
      >
        <p className="text-xs text-amber-800 leading-relaxed">
          의제취득일({deemed}) 전에 취득한 주식의 취득가액은 ① 의제취득일 현재 매매사례가액·환산취득가액과
          ② 취득 당시 실지거래가액에 취득일부터 의제취득일 직전일까지의 <strong>생산자물가상승분</strong>을 더한 금액
          중 <strong>많은 것</strong>입니다 (
          <LawArticleModal legalBasis="소득세법 시행령 §176의2" label="영 §176의2④" />
          {" · "}
          <LawArticleModal legalBasis="소득세법 시행규칙 §85의2" label="규칙 §85의2" />
          ). ②를 채택하면 필요경비는 개산공제가 아니라 실제 지출액(자본적지출·양도비)입니다.
        </p>

        {mode === "actual" ? (
          <p className="text-xs text-amber-800 leading-relaxed" data-testid="pre-deemed-actual-note">
            아래에 입력한 취득 당시 실지거래가액으로 ②를 계산합니다(취득월 생산자물가지수 대비 의제취득일 직전 달 지수).
            ①과 견주려면 위에서 「환산취득가」 또는 「매매사례가액」을 고르고 취득 당시 실가를 함께 입력하세요.
          </p>
        ) : (
          form.acquisitionCause === "bonus_taxed" ? (
            // 과세 무상주 — ②의 실지거래가액은 법정 액면가액이라 언제나 확인된다 → 필수(⑧)
            <CurrencyInput
              label="취득 당시 1주당 액면가액"
              required
              hint="의제배당으로 과세된 금액(소득세법 시행령 §27①1호 가목) — ② 액면가액 + 생산자물가상승분과 위 ①을 견줍니다."
              value={form.preDeemedActualPricePerShare}
              onChange={(v) => onChange({ preDeemedActualPricePerShare: v })}
            />
          ) : (
            <CurrencyInput
              label="취득 당시 실지거래가액 (1주당, 선택)"
              hint="알고 있으면 입력하세요 — ② 실가 + 생산자물가상승분과 위 ①을 견줍니다. 비우면 ①만 계산합니다."
              value={form.preDeemedActualPricePerShare}
              onChange={(v) => onChange({ preDeemedActualPricePerShare: v })}
            />
          )
        )}

        {needsRatio && (
          <FieldCard
            label="생산자물가상승 배율 (직접 입력)"
            required
            hint="취득월이 생산자물가지수 계열(1965.01~) 이전이라 자동 산정할 수 없습니다. 배율 = 의제취득일 직전 달 지수를 취득월 지수로 나눈 비율 (한국은행 조사 지수)"
          >
            <DecimalInput
              value={form.preDeemedPpiRatio}
              onChange={(v) => onChange({ preDeemedPpiRatio: v })}
              data-field="preDeemedPpiRatio"
              data-testid="pre-deemed-ppi-ratio"
            />
          </FieldCard>
        )}
      </ToneCard>
    </div>
  );
}
