"use client";

/**
 * 부담부증여 입력 블록 (소득세법 시행령 §159).
 *
 * Phase 1: propertyType === "general_building" + acquisitionCause === "burdened_gift" 시 노출.
 * - 평가 모드 라디오 (상증법 기준시가 / 시가)
 * - 인수 채무 3분리 입력 (보증금·차입금·임대료)
 * - (선택) 근저당 설정액 분리 입력 — v2 본격 분기
 * - 시가 모드 시 양도시·취득시 평가액 입력
 *
 * 가시성 원칙:
 *  - 펼침 카드 tone="fuchsia" — 부담부증여 전용 tone
 *  - 양도가액 = 인수채무 자동 표시 (소령 §159, 사용자 입력 차단)
 *  - useEffect 미러링 금지 (useMemo 순수 계산만)
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

const VALUATION_MODE_OPTIONS = [
  {
    value: "sangjeungbeop_standard",
    label: "상증법 기준시가",
    description: "보충적평가 (개별공시지가 + 건물기준시가)",
  },
  {
    value: "sangjeungbeop_market",
    label: "상증법 시가",
    description: "매매사례·감정·보상·경매·공매가",
  },
] as const;

export function BurdenedGiftBlock({ asset, onChange }: Props) {
  // 인수 채무액 = 임대보증금 + 담보차입금 (소령 §159 — 양도가액)
  const lendingDeposit = parseAmount(asset.bgLendingDepositTotal) || 0;
  const mortgageDebt = parseAmount(asset.bgMortgageDebtAmount) || 0;
  const assumedDebtAmount = lendingDeposit + mortgageDebt;

  // 상증법 §60~§66 평가 미리보기 (useMemo — store 미러링 금지)
  const valuationPreview = useMemo(() => {
    const annualRent = parseAmount(asset.bgAnnualRentTotal) || 0;
    const mortgageSet = asset.bgMortgageSetAmount
      ? (parseAmount(asset.bgMortgageSetAmount) || mortgageDebt)
      : mortgageDebt;
    const rental = lendingDeposit + (annualRent > 0 ? Math.floor(annualRent / 0.12) : 0);
    const mortgage = lendingDeposit + mortgageSet;
    return { rental, mortgage };
  }, [asset.bgAnnualRentTotal, asset.bgMortgageSetAmount, lendingDeposit, mortgageDebt]);

  const isMarketMode = asset.bgValuationMode === "sangjeungbeop_market";
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-fuchsia-900">
          부담부증여 (소득세법 시행령 §159)
        </p>
        <p className="text-xs text-fuchsia-700">
          납세의무자: <b>증여자</b> · 양도가액 = 인수 채무액 · 보유기간 = 증여자 당초 취득일~증여일
        </p>
      </div>

      {/* ① 평가 모드 라디오 */}
      <FieldCard label="양도(증여) 평가 유형" hint="상증법 §60~§66. 사례 34는 기준시가 모드.">
        <RadioCardGroup
          name="bgValuationMode"
          layout="stack"
          value={asset.bgValuationMode || ""}
          onChange={(v) => onChange({ bgValuationMode: v as AssetForm["bgValuationMode"] })}
          options={VALUATION_MODE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            description: o.description,
          }))}
        />
      </FieldCard>

      {/* ② 인수 채무 입력 (3분리: 보증금·차입금·임대료) */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 space-y-2">
        <p className="text-xs font-semibold text-rose-800">인수 채무 + 임대 평가 보조</p>
        <FieldCard
          label="임대보증금 총액"
          hint="채무로 인수 + 임대평가 환산에도 사용 (상증령 §50⑦)"
        >
          <CurrencyInput label=""
            hideUnit
            value={asset.bgLendingDepositTotal}
            onChange={(v) => onChange({ bgLendingDepositTotal: v })}
          />
        </FieldCard>
        <FieldCard
          label="담보차입금 (실제 채무잔액)"
          hint="채무로 인수 — 담보평가 산정에도 사용"
        >
          <CurrencyInput label=""
            hideUnit
            value={asset.bgMortgageDebtAmount}
            onChange={(v) => onChange({ bgMortgageDebtAmount: v })}
          />
        </FieldCard>
        <FieldCard
          label="연간 임대료 (선택)"
          hint="임대평가 환산용 — 채무 아님. 환산식: 보증금 + 임대료/12%"
        >
          <CurrencyInput label=""
            hideUnit
            value={asset.bgAnnualRentTotal}
            onChange={(v) => onChange({ bgAnnualRentTotal: v })}
          />
        </FieldCard>
        <FieldCard
          label="(근)저당권 설정액 (선택)"
          hint="미입력 시 담보차입금 = 설정액 가정. 실제 잔액과 다를 때만 입력"
        >
          <CurrencyInput label=""
            hideUnit
            value={asset.bgMortgageSetAmount}
            onChange={(v) => onChange({ bgMortgageSetAmount: v })}
          />
        </FieldCard>
      </div>

      {/* ③ 시가 모드 — 양도시·취득시 평가액 직접 입력 */}
      {isMarketMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">시가 모드 — 상증법 §60②~④</p>
          <FieldCard label="양도시 시가 평가액 (총액)">
            <CurrencyInput label=""
              hideUnit
              value={asset.bgMarketValueAtTransfer}
              onChange={(v) => onChange({ bgMarketValueAtTransfer: v })}
            />
          </FieldCard>
          <FieldCard label="취득시 시가 평가액 (총액)">
            <CurrencyInput label=""
              hideUnit
              value={asset.bgMarketValueAtAcquisition}
              onChange={(v) => onChange({ bgMarketValueAtAcquisition: v })}
            />
          </FieldCard>
        </div>
      )}

      {/* ④ 양도가액 = 채무액 미리보기 (소령 §159, disabled) */}
      <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-100/70 p-3 space-y-1">
        <p className="text-xs font-semibold text-fuchsia-900">자동 계산 미리보기</p>
        <div className="text-xs text-fuchsia-800 space-y-0.5">
          <p>
            인수 채무액 (= 양도가액):{" "}
            <span className="font-mono font-semibold">{fmt(assumedDebtAmount)}원</span>
          </p>
          <p>
            담보평가:{" "}
            <span className="font-mono">{fmt(valuationPreview.mortgage)}원</span>
          </p>
          <p>
            임대평가:{" "}
            <span className="font-mono">{fmt(valuationPreview.rental)}원</span>
          </p>
          <p className="text-fuchsia-600 mt-1">
            * Max(보충적·담보·임대)를 분모로 양도가/취득가 자산별 안분 — 엔진이 자동 산정.
          </p>
        </div>
      </div>
    </div>
  );
}
