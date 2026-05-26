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

import { useMemo, useState } from "react";
import { CorporateInfoSection } from "./CorporateInfoSection";
import { UnlistedStockHistoryModal } from "./UnlistedStockHistoryModal";
import { FiscalYearAdjustmentTable } from "./FiscalYearAdjustmentTable";
import { NetAssetCalculationTable } from "./NetAssetCalculationTable";
import { PerShareValuationResultCard } from "./PerShareValuationResultCard";
import { GoodwillCalculationTable } from "./GoodwillCalculationTable";
import { BesshiForm4Buppyo3PrintView } from "./BesshiForm4Buppyo3PrintView";
import { ValuationDeltaTable } from "./ValuationDeltaTable";
import type { EvaluationDeltaRow } from "@/lib/tax-engine/property-valuation/evaluation-delta";
import {
  MajorShareholderStockToggle,
  type Section22MajorShareholderMode,
} from "./MajorShareholderStockToggle";
import { RealEstateHeavyToggle } from "./RealEstateHeavyToggle";
import { EvaluationCommitteeToggle } from "./EvaluationCommitteeToggle";
import { EvaluationCommitteeResultCard } from "./EvaluationCommitteeResultCard";
import { EvaluationCommitteeFilingGuideCard } from "./EvaluationCommitteeFilingGuideCard";
import type { EvaluationCommitteeInput } from "@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type {
  UnlistedStockValuationInput,
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
  /** PR-H: 이력 자동조회 — 세무사 모드 의뢰인 ID (null = 본인) */
  currentClientId?: string | null;
  /** PR-H: 이미 자산 목록에 추가된 calculationId 배열 (중복 차단) */
  historyExcludeIds?: string[];
}

export function UnlistedStockV2Card({
  input,
  onChange,
  currentClientId = null,
  historyExcludeIds = [],
}: UnlistedStockV2CardProps) {
  // PR-H: 이력 조회 모달
  const [historyOpen, setHistoryOpen] = useState(false);
  // sourceCalculationId 메타 — UI 전용 (엔진 미전달)
  const [sourceCalculationId, setSourceCalculationId] = useState<string | undefined>(undefined);

  /**
   * PR-H: 이력 선택 → 법인 정보만 prefill (Q1 B안)
   * - evaluationDate·ownedShares·isMaxShareholder는 사용자 입력 보존
   * - sourceCalculationId 메타 부착 (mirror-pattern으로 핵심 필드 수정 시 자동 제거)
   */
  const handleHistorySelect = (
    partial: Partial<UnlistedStockValuationInput>,
    sourceId: string,
  ) => {
    onChange({ ...input, ...partial });
    setSourceCalculationId(sourceId);
  };

  /**
   * PR-H: corpName 수정 시 sourceCalculationId 자동 제거 (mirror-pattern)
   */
  const wrappedOnChange = (next: UnlistedStockValuationInput) => {
    if (sourceCalculationId && next.corpName !== input.corpName) {
      setSourceCalculationId(undefined);
    }
    onChange(next);
  };
  const updateCorporateInfo = (patch: Partial<UnlistedStockValuationInput>) => {
    wrappedOnChange({ ...input, ...patch });
  };

  const updateFiscalYears = (next: [FiscalYearAdjustment, FiscalYearAdjustment, FiscalYearAdjustment]) => {
    wrappedOnChange({ ...input, fiscalYears: next });
  };

  const updateCapitalChanges = (next: UnlistedCapitalChange[]) => {
    wrappedOnChange({ ...input, capitalChanges: next });
  };

  const updateNetAsset = (next: UnlistedNetAssetCalculation) => {
    wrappedOnChange({ ...input, netAssetValueRaw: next });
  };

  // PR-F: §54⑤ 부동산과다 ON/OFF 직접 토글
  const handleRealEstateHeavyChange = (next: boolean) => {
    wrappedOnChange({ ...input, isRealEstateHeavy: next });
  };

  // PR-E: §22② 모드 변경 (mode만 변경, isMaxShareholder는 §63③ 용이므로 분리)
  const handleSection22ModeChange = (mode: Section22MajorShareholderMode) => {
    wrappedOnChange({ ...input, section22MajorShareholderMode: mode });
  };

  const section22Mode = input.section22MajorShareholderMode ?? "auto";

  // PR-N: 평가차액 행 단위 입력 콜백 (netAssetValueRaw.evaluationDeltaRows 단일 통합 배열)
  const handleEvaluationDeltaRowsChange = (rows: EvaluationDeltaRow[]) => {
    wrappedOnChange({
      ...input,
      netAssetValueRaw: {
        ...input.netAssetValueRaw,
        evaluationDeltaRows: rows.length > 0 ? rows : undefined,
      },
    });
  };
  const handleAssetValuationDeltaFallback = (next: number) => {
    wrappedOnChange({
      ...input,
      netAssetValueRaw: { ...input.netAssetValueRaw, assetValuationDelta: next },
    });
  };

  return (
    <div className="space-y-4 border-2 border-indigo-300 bg-indigo-50/30 rounded-lg p-4">
      <div className="flex items-center justify-between pb-2 border-b border-indigo-200">
        <div className="flex items-center gap-2">
          <span className="text-indigo-600 text-lg">📊</span>
          <h3 className="text-sm font-bold text-indigo-900">
            비상장주식 V2 평가 (별지 제4호 부표3 완전 재현)
          </h3>
        </div>
        {/* PR-H: 이력 자동 조회 버튼 */}
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="text-xs px-2.5 py-1 rounded border border-indigo-300 bg-white hover:bg-indigo-100 text-indigo-700 font-medium transition-colors"
          data-testid="open-unlisted-stock-history-modal"
          title="기존 평가 이력에서 법인 정보를 자동으로 채웁니다"
        >
          📂 이력 조회
        </button>
      </div>
      <p className="text-[11px] text-indigo-700/80">
        상증법 §63 ① 나목 + 상증령 §54·§55·§56·§59 + 상증규 §17·§17의2·§17의3·§19 (KoreanLaw 1차+2차 검증 완료)
      </p>

      {/* PR-H: 이력 출처 배지 — sourceCalculationId 부착 시만 표시 */}
      {sourceCalculationId && (
        <p
          className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1 inline-block"
          data-testid="source-calculation-id-badge"
        >
          📂 이력에서 자동 채움 · 평가기준일·보유주식수·할증은 사용자 입력 보존
        </p>
      )}

      {/* PR-H: 이력 조회 모달 */}
      <UnlistedStockHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        currentCorpName={input.corpName || undefined}
        currentClientId={currentClientId}
        excludeCalculationIds={historyExcludeIds}
        onSelect={handleHistorySelect}
      />

      {/* 1. 법인 기본 정보 + §54④ 사유 + 회사 규모 */}
      <CorporateInfoSection
        corpName={input.corpName}
        representative={input.representative}
        businessRegistrationNumber={input.businessRegistrationNumber}
        capital={input.capital}
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
        capitalChanges={input.capitalChanges}
        onCapitalChangesChange={updateCapitalChanges}
        onChange={(patch) => {
          updateCorporateInfo(patch as Partial<UnlistedStockValuationInput>);
        }}
      />

      {/* 1-B. PR-F: §54⑤ 부동산과다 ON/OFF (Section 3) */}
      <RealEstateHeavyToggle
        isRealEstateHeavy={input.isRealEstateHeavy}
        onChange={handleRealEstateHeavyChange}
      />

      {/* 2. 사업연도 가산·차감 (3년치) */}
      <FiscalYearAdjustmentTable
        fiscalYears={input.fiscalYears}
        onChange={updateFiscalYears}
      />

      {/* 자본금 변동(증자·감자)은 섹션 1(CorporateInfoSection) 내부 발행주식총수·자본금 아래로 이동됨 */}

      {/* 3-B. PR-N: 평가차액 행 단위 입력 (별지 3쪽, design v3 Section 4) */}
      <ValuationDeltaTable
        evaluationDeltaRows={input.netAssetValueRaw.evaluationDeltaRows ?? []}
        fallbackAssetValuationDelta={input.netAssetValueRaw.assetValuationDelta}
        onRowsChange={handleEvaluationDeltaRowsChange}
        onFallbackChange={handleAssetValuationDeltaFallback}
      />

      {/* 4. 자산총액·부채총액 (별지 2쪽) — ② 평가차액은 위 ValuationDeltaTable 결과 자동 반영 */}
      <NetAssetCalculationTable
        netAssetValueRaw={input.netAssetValueRaw}
        onChange={updateNetAsset}
      />

      {/* 5. 영업권 평가 (자동 표시) */}
      <GoodwillPanel input={input} />

      {/* 5-B. PR-E: §22② 최대주주 자동 도출 (Section 10 — design v3) */}
      <MajorShareholderStockToggle
        mode={section22Mode}
        ownedShares={input.ownedShares}
        totalShares={input.totalShares}
        onChange={handleSection22ModeChange}
      />

      {/* 5-C. PR-K: §54⑥ 평가심의위원회 신청 옵션 (Section 11) */}
      <EvaluationCommitteeToggle
        value={input.evaluationCommittee}
        onChange={(next: EvaluationCommitteeInput | undefined) =>
          wrappedOnChange({ ...input, evaluationCommittee: next })
        }
      />
      <EvaluationCommitteeResultPanel input={input} />
      {input.evaluationCommittee && (
        <EvaluationCommitteeFilingGuideCard taxKind="inheritance" />
      )}

      {/* 6. 결과 카드 */}
      <PerShareValuationResultCard input={input} />

      {/* 7. 별지 양식 PDF 출력 미리보기 */}
      <BesshiForm4Buppyo3PrintView input={input} />
    </div>
  );
}

function EvaluationCommitteeResultPanel({ input }: { input: UnlistedStockValuationInput }) {
  const result = useMemo(() => {
    if (!input.evaluationCommittee) return null;
    try {
      if (input.totalShares <= 0 || input.ownedShares <= 0) return null;
      return evaluateUnlistedStockV2(input);
    } catch {
      return null;
    }
  }, [input]);

  if (!input.evaluationCommittee || !result?.evaluationCommitteeApplied) return null;

  return (
    <EvaluationCommitteeResultCard
      result={result.evaluationCommitteeApplied}
      taxpayerPerShareValuation={input.evaluationCommittee.taxpayerPerShareValuation}
      baseDate={input.evaluationDate}
      taxKind="inheritance"
    />
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
