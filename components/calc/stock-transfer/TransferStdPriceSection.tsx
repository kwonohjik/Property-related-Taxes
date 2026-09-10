"use client";

/**
 * TransferStdPriceSection — 양도 당시 기준시가 «분모» 공통 블록 (S3)
 *
 * 계획서 `docs/00-pm/stock-listed-conversion-unification.plan.md` §1-2.
 *
 * ## 왜 공통 블록인가
 *
 * 환산취득가 = 양도가 × (취득 당시 기준시가 ÷ **양도 당시 기준시가**).
 * 분모는 네 갈래 중 **셋에서 공통**이고, 네 번째(양도일 거래정지)에서만 보충 평가로 대체된다.
 *
 * 종전에는 이 칸의 입력 UI가 **두 곳**에 있었다 — Step2의 일반 환산 블록과
 * `PostListingValuationCard`의 ③ 섹션. 둘이 상호배타로 렌더돼, 「취득 후 상장」을 켜면
 * 위 칸이 사라지고 아래에 **같은 칸이 다시** 나타났다(제보 2026-09-10).
 *
 * ## 부수 효과 — F-10 dead-end가 구조적으로 사라진다
 *
 * `transferStdInputMode`(직접/일자별)의 라디오와 32셀 표가 종전에는 「취득 후 상장」
 * ToggleCard children 안에만 있어, 축 밖에서 `daily`가 남으면 **되돌릴 UI가 없었다**.
 * 이 블록이 4갈래 **위에 항상** 있으므로 어느 모드에서도 되돌릴 수 있다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { KiwoomAutoFetchButton } from "./KiwoomAutoFetchButton";
import { TransferDate1MonthClosingPriceTable } from "./TransferDate1MonthClosingPriceTable";

interface TransferStdPriceSectionProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function TransferStdPriceSection({ form, onChange }: TransferStdPriceSectionProps) {
  /*
    양도일 거래정지(§165③)에서는 1개월 종가평균이 법령상 무효다 — 엔진도 쓰지 않고
    ⑧도 검증을 면제한다. 입력칸을 그대로 두면 「넣어도 안 쓰이는 칸」이 되므로 안내로 바꾼다.
    ⚠️ **숨기지 않는다** — 자리를 지켜야 「분모가 어디로 갔나」를 사용자가 잃지 않는다.
  */
  if (form.acquisitionStdMode === "halt_transfer") {
    return (
      <ToneCard tone="emerald" sectionNum={1} title="양도 당시 기준시가 (환산비율의 분모)">
        <p className="text-sm text-emerald-800 leading-relaxed">
          양도일 이전 1개월에 거래정지·관리종목 구간이 있어 종가평균을 쓸 수 없습니다
          (「소득세법 시행령」 제165조 제3항). 아래 <strong>비상장 보충 평가</strong>에서
          양도 당시 기준시가도 함께 산정합니다.
        </p>
      </ToneCard>
    );
  }

  const inputMode = form.transferStdInputMode || "direct";

  return (
    <ToneCard
      tone="emerald"
      sectionNum={1}
      title="양도 당시 기준시가 (환산비율의 분모)"
      bodyClassName="space-y-3"
    >
      <FieldCard label="기준시가 입력 방식">
        <RadioCardGroup
          name="transferStdInputMode"
          value={inputMode}
          onChange={(v) => onChange({ transferStdInputMode: v as "direct" | "daily" })}
          tone="emerald"
          layout="inline"
          options={[
            { value: "direct", label: "직접 입력 (1개월 평균 단일 숫자)" },
            { value: "daily", label: "일자별 입력 (자동 평균 산정)" },
          ]}
        />
      </FieldCard>

      {/* 키움 자동조회 — 종목코드 + 양도일 + 상장 종목 충족 시 활성화 */}
      <KiwoomAutoFetchButton
        securityCode={form.securityCode}
        transferDate={form.transferDate}
        marketType={form.marketType}
        tradingHalt={form.kiwoomTradingHalt}
        onFill={onChange}
      />

      {inputMode === "direct" ? (
        <FieldCard
          label="1개월 종가 평균"
          required
          hint="양도일 이전 1개월 종가 평균 (1주당, 「소득세법」 제99조 제1항 제3호 · 같은 법 시행령 제165조 제3항)"
        >
          <CurrencyInput
            label=""
            hideUnit
            value={form.transferDatePriceAvg1Month}
            onChange={(v) => onChange({ transferDatePriceAvg1Month: v })}
            placeholder="양도일 이전 1개월 종가평균 (1주당)"
          />
        </FieldCard>
      ) : (
        /*
          요약줄은 표 안의 것 **하나만** 둔다 — 저장 필드를 읽는 줄과 매 렌더 재계산하는 줄이
          갈렸던 사고가 있었다(제보 2026-09-01: 16,560 vs 16,559).
        */
        <TransferDate1MonthClosingPriceTable form={form} onChange={onChange} />
      )}
    </ToneCard>
  );
}
