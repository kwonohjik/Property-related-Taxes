"use client";

/**
 * NetAssetCalculationTable — 자산총액·부채총액 입력 (별지 2~3쪽)
 *
 * 법령: 상증령 §55① + 상증규 §17의2 1~4호
 *
 * 산식:
 *   자산총액 (가) = ① + ② + ③ + ④ + ⑤ − ⑥ − ⑦ → ⑧ 소계
 *   부채총액 (나) = ⑨ + ⑩ + ⑪ + ⑫ + ⑬ + ⑭ + ⑮ − ⑯ − ⑰ − ⑱ → ⑲ 소계  (2025.07.10 양식)
 *   영업권 포함 전 순자산가액 (다) = ⑧ − ⑲ (0 이하 시 0)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import { useMemo, useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

interface AssetRow {
  key: keyof Pick<UnlistedNetAssetCalculation,
    | "bsTotalAssets"
    | "assetValuationDelta"
    | "corpTaxReservedAmount"
    | "paidInCapitalIncrease"
    | "otherEarnedRights"
    | "prepaidExpenses"
    | "preGiftRetainedEarnings">;
  label: string;
  cellNum: string;
  sign: "+" | "−";
  description?: string;
}

interface LiabilityRow {
  key: keyof Pick<UnlistedNetAssetCalculation,
    | "bsTotalLiabilities"
    | "corporateTaxPayable"
    | "farmingSurtax"
    | "localIncomeTax"
    | "dividendPayable"
    | "retirementProvision"
    | "otherProvision"
    | "reserveExcluded"
    | "allowanceExcluded"
    | "deferredTaxAdjustment">;
  label: string;
  cellNum: string;
  sign: "+" | "−";
  description?: string;
}

const ASSET_ROWS: AssetRow[] = [
  { key: "bsTotalAssets", label: "재무상태표상 자산가액", cellNum: "①", sign: "+" },
  { key: "assetValuationDelta", label: "평가차액", cellNum: "②", sign: "+", description: "§60·§66 평가가액 − 장부" },
  { key: "corpTaxReservedAmount", label: "법인세법상 유보금액", cellNum: "③", sign: "+" },
  { key: "paidInCapitalIncrease", label: "유상증자 등", cellNum: "④", sign: "+" },
  { key: "otherEarnedRights", label: "지급받을 권리 확정 가액", cellNum: "⑤", sign: "+", description: "§17의2 1호 — 자산 가산" },
  { key: "prepaidExpenses", label: "선급비용 + 무형자산", cellNum: "⑥", sign: "−", description: "§17의2 2호 — 자산 차감" },
  { key: "preGiftRetainedEarnings", label: "증자일 전 잉여금 유보액", cellNum: "⑦", sign: "−" },
];

const LIABILITY_ROWS: LiabilityRow[] = [
  { key: "bsTotalLiabilities", label: "재무상태표상 부채액", cellNum: "⑨", sign: "+" },
  { key: "corporateTaxPayable", label: "법인세", cellNum: "⑩", sign: "+", description: "§17의2 3호 가" },
  { key: "farmingSurtax", label: "농어촌특별세", cellNum: "⑪", sign: "+", description: "§17의2 3호 가" },
  { key: "localIncomeTax", label: "지방소득세", cellNum: "⑫", sign: "+", description: "§17의2 3호 가" },
  { key: "dividendPayable", label: "확정 배당금·상여금", cellNum: "⑬", sign: "+", description: "§17의2 3호 나" },
  { key: "retirementProvision", label: "퇴직급여 추계액", cellNum: "⑭", sign: "+", description: "§17의2 3호 다 — 전원 퇴직 가정" },
  { key: "otherProvision", label: "기타 (충당금 중 평가기준일 현재 비용으로 확정된 것)", cellNum: "⑮", sign: "+", description: "§17의2 4호 단서 가 — 모든 법인 적용 (보험법인 한정 아님)" },
  { key: "reserveExcluded", label: "제준비금", cellNum: "⑯", sign: "−", description: "§17의2 4호 본문 — 부채 차감" },
  { key: "allowanceExcluded", label: "제충당금", cellNum: "⑰", sign: "−", description: "§17의2 4호 본문 — 부채 차감" },
  { key: "deferredTaxAdjustment", label: "이연법인세대 등", cellNum: "⑱", sign: "−" },
];

export interface NetAssetCalculationTableProps {
  netAssetValueRaw: UnlistedNetAssetCalculation;
  onChange: (next: UnlistedNetAssetCalculation) => void;
}

export function NetAssetCalculationTable({
  netAssetValueRaw,
  onChange,
}: NetAssetCalculationTableProps) {
  function update<K extends keyof UnlistedNetAssetCalculation>(
    key: K,
    value: UnlistedNetAssetCalculation[K],
  ) {
    onChange({ ...netAssetValueRaw, [key]: value });
  }

  // PR-M: 보험법인 토글 — 3 필드 중 하나라도 값이 있으면 default ON, 사용자 수동 override 가능
  const insuranceHasValue =
    (netAssetValueRaw.insuranceReservePolicy ?? 0) > 0 ||
    (netAssetValueRaw.insuranceExtraordinaryReserve ?? 0) > 0 ||
    (netAssetValueRaw.insuranceSurrenderReserve ?? 0) > 0;
  const [insuranceCompanyOpen, setInsuranceCompanyOpen] = useState(insuranceHasValue);

  function toggleInsuranceCompany(next: boolean) {
    setInsuranceCompanyOpen(next);
    if (!next) {
      // OFF 시 3 필드 모두 클리어 (silent omission 차단 — UI/엔진 일관성)
      onChange({
        ...netAssetValueRaw,
        insuranceReservePolicy: undefined,
        insuranceExtraordinaryReserve: undefined,
        insuranceSurrenderReserve: undefined,
      });
    }
  }

  // 자동 합산 미리보기 (보험법인 3 필드 가산 포함 — 엔진 net-asset-calc.ts:77~79 정합)
  const { totalAssets, totalLiabilities, netAssetBeforeGoodwill } = useMemo(() => {
    const a =
      netAssetValueRaw.bsTotalAssets +
      netAssetValueRaw.assetValuationDelta +
      netAssetValueRaw.corpTaxReservedAmount +
      netAssetValueRaw.paidInCapitalIncrease +
      netAssetValueRaw.otherEarnedRights -
      netAssetValueRaw.prepaidExpenses -
      netAssetValueRaw.preGiftRetainedEarnings;
    const l =
      netAssetValueRaw.bsTotalLiabilities +
      netAssetValueRaw.corporateTaxPayable +
      netAssetValueRaw.farmingSurtax +
      netAssetValueRaw.localIncomeTax +
      netAssetValueRaw.dividendPayable +
      netAssetValueRaw.retirementProvision +
      netAssetValueRaw.otherProvision -
      netAssetValueRaw.reserveExcluded -
      netAssetValueRaw.allowanceExcluded -
      netAssetValueRaw.deferredTaxAdjustment +
      (netAssetValueRaw.insuranceReservePolicy ?? 0) +
      (netAssetValueRaw.insuranceExtraordinaryReserve ?? 0) +
      (netAssetValueRaw.insuranceSurrenderReserve ?? 0);
    const n = Math.max(0, a - l);
    return { totalAssets: a, totalLiabilities: l, netAssetBeforeGoodwill: n };
  }, [netAssetValueRaw]);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">5</span>
        <p className="text-xs font-semibold text-violet-700">순자산가액 (별지 2~3쪽 + §55·§17의2)</p>
      </div>
      <p className="text-[11px] text-violet-700/80">
        자산총액 ⑧ − 부채총액 ⑲ = 다.영업권 포함 전 순자산가액 (§55① 후단 — 0 이하 시 0)
      </p>

      {/* 자산총액 표 */}
      <div className="rounded border border-emerald-200 bg-emerald-50/60 p-2 space-y-1">
        <p className="text-[11px] font-semibold text-emerald-800">가. 자산총액</p>
        {ASSET_ROWS.map((row) => (
          <div key={row.key} className="grid grid-cols-[8rem_1fr] items-center gap-2 py-0.5">
            <div className="text-[11px]">
              <span className={`font-mono ${row.sign === "+" ? "text-emerald-700" : "text-rose-700"}`}>
                {row.cellNum} {row.sign}
              </span>{" "}
              {row.label}
              {row.description && (
                <span className="block text-[10px] text-gray-500">({row.description})</span>
              )}
            </div>
            <CurrencyInput
              label={row.label}
              value={String(netAssetValueRaw[row.key] || "")}
              onChange={(v) => update(row.key, Number(v.replace(/,/g, "")) || 0)}
              placeholder="0"
              hideUnit
            />
          </div>
        ))}
        <div className="border-t border-emerald-300 pt-1 mt-1 flex justify-between text-[11px] font-bold text-emerald-900">
          <span>⑧ 자산총액 소계</span>
          <span className="font-mono">{totalAssets.toLocaleString()}원</span>
        </div>
      </div>

      {/* 부채총액 표 */}
      <div className="rounded border border-rose-200 bg-rose-50/60 p-2 space-y-1">
        <p className="text-[11px] font-semibold text-rose-800">나. 부채총액</p>
        {LIABILITY_ROWS.map((row) => (
          <div key={row.key} className="grid grid-cols-[8rem_1fr] items-center gap-2 py-0.5">
            <div className="text-[11px]">
              <span className={`font-mono ${row.sign === "+" ? "text-rose-700" : "text-emerald-700"}`}>
                {row.cellNum} {row.sign}
              </span>{" "}
              {row.label}
              {row.description && (
                <span className="block text-[10px] text-gray-500">({row.description})</span>
              )}
            </div>
            <CurrencyInput
              label={row.label}
              value={String(netAssetValueRaw[row.key] || "")}
              onChange={(v) => update(row.key, Number(v.replace(/,/g, "")) || 0)}
              placeholder="0"
              hideUnit
            />
          </div>
        ))}
        <div className="border-t border-rose-300 pt-1 mt-1 flex justify-between text-[11px] font-bold text-rose-900">
          <span>⑲ 부채총액 소계</span>
          <span className="font-mono">{totalLiabilities.toLocaleString()}원</span>
        </div>
      </div>

      {/* PR-M: 보험법인 부채 가산 (§17의2 4호 단서 나·다) */}
      <ToggleCard
        tone="violet"
        title="보험사업·보험회사 여부"
        description="해당 시 책임준비금·비상위험준비금·해약환급금준비금을 부채에 가산 (§17의2 4호 단서 나·다)"
        checked={insuranceCompanyOpen}
        onCheckedChange={toggleInsuranceCompany}
        variant="card"
      >
        <div className="space-y-1.5">
          <p className="text-[11px] text-violet-700/80">
            ※ 일반 충당금 ⑮ (§17의2 4호 단서 가)는 모든 법인 적용. 본 토글은 보험사업법인·보험회사에 한정 적용.
          </p>
          <div className="grid grid-cols-[12rem_1fr] items-center gap-2 py-0.5">
            <div className="text-[11px]">
              <span className="font-mono text-violet-700">+ 책임준비금</span>
              <span className="block text-[10px] text-gray-500">(법인세법 §30① / 보험업법 §120 — §17의2 4호 단서 나·다)</span>
            </div>
            <CurrencyInput
              label="책임준비금"
              value={String(netAssetValueRaw.insuranceReservePolicy ?? "")}
              onChange={(v) => update("insuranceReservePolicy", Number(v.replace(/,/g, "")) || 0)}
              placeholder="0"
              hideUnit
            />
          </div>
          <div className="grid grid-cols-[12rem_1fr] items-center gap-2 py-0.5">
            <div className="text-[11px]">
              <span className="font-mono text-violet-700">+ 비상위험준비금</span>
              <span className="block text-[10px] text-gray-500">(법인세법 §31① — §17의2 4호 단서 나·다)</span>
            </div>
            <CurrencyInput
              label="비상위험준비금"
              value={String(netAssetValueRaw.insuranceExtraordinaryReserve ?? "")}
              onChange={(v) => update("insuranceExtraordinaryReserve", Number(v.replace(/,/g, "")) || 0)}
              placeholder="0"
              hideUnit
            />
          </div>
          <div className="grid grid-cols-[12rem_1fr] items-center gap-2 py-0.5">
            <div className="text-[11px]">
              <span className="font-mono text-violet-700">+ 해약환급금준비금</span>
              <span className="block text-[10px] text-gray-500">(법인세법 §32① — §17의2 4호 단서 다, 보험회사 한정)</span>
            </div>
            <CurrencyInput
              label="해약환급금준비금"
              value={String(netAssetValueRaw.insuranceSurrenderReserve ?? "")}
              onChange={(v) => update("insuranceSurrenderReserve", Number(v.replace(/,/g, "")) || 0)}
              placeholder="0"
              hideUnit
            />
          </div>
        </div>
      </ToggleCard>

      {/* 영업권 포함 전 순자산가액 */}
      <div className="rounded border-2 border-violet-400 bg-violet-100/80 p-3 flex justify-between items-center">
        <div>
          <p className="text-[11px] font-bold text-violet-900">다. 영업권 포함 전 순자산가액</p>
          <p className="text-[10px] text-violet-700">= 자산총액 ⑧ − 부채총액 ⑲ {netAssetBeforeGoodwill === 0 && totalAssets - totalLiabilities < 0 && "(§55① 후단 — 0 이하 → 0)"}</p>
        </div>
        <span className="font-mono text-sm font-bold text-violet-900">
          {netAssetBeforeGoodwill.toLocaleString()}원
        </span>
      </div>
    </div>
  );
}
