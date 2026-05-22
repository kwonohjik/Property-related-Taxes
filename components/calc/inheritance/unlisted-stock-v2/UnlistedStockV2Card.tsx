"use client";

/**
 * UnlistedStockV2Card — 비상장주식 V2 평가 (별지 부표3) 진입점 카드
 *
 * EstateItem.unlistedStockValuationV2를 직접 read/write.
 * 5개 섹션 컨테이너 + 결과 카드 통합.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * UI Design: docs/02-design/features/inheritance-unlisted-stock-valuation.ui.design.md §2-1·§6
 */

import { useMemo } from "react";
import { CorporateInfoSection } from "./CorporateInfoSection";
import { FiscalYearAdjustmentTable } from "./FiscalYearAdjustmentTable";
import { CapitalChangeTable } from "./CapitalChangeTable";
import { NetAssetCalculationTable } from "./NetAssetCalculationTable";
import { PerShareValuationResultCard } from "./PerShareValuationResultCard";
import { GoodwillCalculationTable } from "./GoodwillCalculationTable";
import { BesshiForm4Buppyo3PrintView } from "./BesshiForm4Buppyo3PrintView";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetOnlyReason,
  FiscalYearAdjustment,
  UnlistedCapitalChange,
  UnlistedNetAssetCalculation,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const EMPTY_NET_ASSET: UnlistedNetAssetCalculation = {
  bsTotalAssets: 0,
  assetValuationDelta: 0,
  corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0,
  otherEarnedRights: 0,
  prepaidExpenses: 0,
  preGiftRetainedEarnings: 0,
  bsTotalLiabilities: 0,
  corporateTaxPayable: 0,
  farmingSurtax: 0,
  localIncomeTax: 0,
  dividendPayable: 0,
  retirementProvision: 0,
  otherProvision: 0,
  reserveExcluded: 0,
  allowanceExcluded: 0,
  deferredTaxAdjustment: 0,
};

function emptyFiscalYear(label: string, monthsAgo: number): FiscalYearAdjustment {
  const date = new Date();
  date.setFullYear(date.getFullYear() - Math.floor(monthsAgo / 12));
  date.setMonth(11, 31); // 12월 31일 기본
  return {
    fiscalYearLabel: label,
    fiscalYearEndDate: date,
    taxableIncome: 0,
  };
}

export function createDefaultUnlistedStockV2(): UnlistedStockValuationInput {
  const now = new Date();
  const currentYear = now.getFullYear();
  return {
    corpName: "",
    representative: undefined,
    businessStartDate: new Date(currentYear - 10, 0, 1),
    evaluationDate: now,
    faceValuePerShare: 5_000,
    totalShares: 0,
    ownedShares: 0,
    isRealEstateHeavy: false,
    fiscalYears: [
      emptyFiscalYear(`${currentYear - 1}`, 12),
      emptyFiscalYear(`${currentYear - 2}`, 24),
      emptyFiscalYear(`${currentYear - 3}`, 36),
    ],
    capitalChanges: [],
    netAssetValueRaw: { ...EMPTY_NET_ASSET },
    isContinuousLossLastThreeYears: false,
    // ★ 법정 고정값 — UI 입력 위젯 미노출이 의도적 설계
    //   capitalizationRate (§54① 환원율): 상증규 §17에 의해 100분의 10 고정 (KoreanLaw 검증 2026-05-22)
    //   goodwillRate (§59② 영업권 이자율): 상증규 §19①에 의해 100분의 10 고정
    //   → 두 값 모두 법령 본칙으로 고정되어 사용자 변경 불가. UI에 노출하지 않음.
    capitalizationRate: 0.10,
    isMaxShareholder: false,
    companySize: "large",
  };
}

export interface UnlistedStockV2CardProps {
  input: UnlistedStockValuationInput;
  onChange: (next: UnlistedStockValuationInput) => void;
}

export function UnlistedStockV2Card({ input, onChange }: UnlistedStockV2CardProps) {
  const updateCorporateInfo = (patch: Partial<UnlistedStockValuationInput>) => {
    onChange({ ...input, ...patch });
  };

  const updateFiscalYears = (next: [FiscalYearAdjustment, FiscalYearAdjustment, FiscalYearAdjustment]) => {
    onChange({ ...input, fiscalYears: next });
  };

  const updateCapitalChanges = (next: UnlistedCapitalChange[]) => {
    onChange({ ...input, capitalChanges: next });
  };

  const updateNetAsset = (next: UnlistedNetAssetCalculation) => {
    onChange({ ...input, netAssetValueRaw: next });
  };

  return (
    <div className="space-y-4 border-2 border-indigo-300 bg-indigo-50/30 rounded-lg p-4">
      <div className="flex items-center gap-2 pb-2 border-b border-indigo-200">
        <span className="text-indigo-600 text-lg">📊</span>
        <h3 className="text-sm font-bold text-indigo-900">
          비상장주식 V2 평가 (별지 제4호 부표3 완전 재현)
        </h3>
      </div>
      <p className="text-[11px] text-indigo-700/80">
        상증법 §63 ① 나목 + 상증령 §54·§55·§56·§59 + 상증규 §17·§17의2·§17의3·§19 (KoreanLaw 1차+2차 검증 완료)
      </p>

      {/* 1. 법인 기본 정보 + §54④ 사유 + 회사 규모 */}
      <CorporateInfoSection
        corpName={input.corpName}
        representative={input.representative}
        businessStartDate={input.businessStartDate}
        evaluationDate={input.evaluationDate}
        faceValuePerShare={input.faceValuePerShare}
        totalShares={input.totalShares}
        ownedShares={input.ownedShares}
        isRealEstateHeavy={input.isRealEstateHeavy}
        netAssetOnlyReason={input.netAssetOnlyReason}
        isMaxShareholder={input.isMaxShareholder}
        companySize={input.companySize}
        isContinuousLossLastThreeYears={input.isContinuousLossLastThreeYears}
        onChange={(patch) => {
          updateCorporateInfo(patch as Partial<UnlistedStockValuationInput>);
        }}
      />

      {/* 2. 사업연도 가산·차감 (3년치) */}
      <FiscalYearAdjustmentTable
        fiscalYears={input.fiscalYears}
        onChange={updateFiscalYears}
      />

      {/* 3. 자본금 변동 */}
      <CapitalChangeTable
        capitalChanges={input.capitalChanges}
        onChange={updateCapitalChanges}
      />

      {/* 4. 자산총액·부채총액 */}
      <NetAssetCalculationTable
        netAssetValueRaw={input.netAssetValueRaw}
        onChange={updateNetAsset}
      />

      {/* 5. 영업권 평가 (자동 표시) */}
      <GoodwillPanel input={input} />

      {/* 6. 결과 카드 */}
      <PerShareValuationResultCard input={input} />

      {/* 7. 별지 양식 PDF 출력 미리보기 */}
      <BesshiForm4Buppyo3PrintView input={input} />
    </div>
  );
}

function GoodwillPanel({ input }: { input: UnlistedStockValuationInput }) {
  const result = useMemo(() => {
    try {
      if (input.totalShares <= 0 || input.ownedShares <= 0) return null;
      return evaluateUnlistedStockV2(input);
    } catch {
      return null;
    }
  }, [input]);

  if (!result) return null;
  return <GoodwillCalculationTable goodwill={result.goodwillCalculation} />;
}
