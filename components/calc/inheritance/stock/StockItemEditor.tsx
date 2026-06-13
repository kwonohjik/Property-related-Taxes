"use client";

/**
 * StockItemEditor — 주식 1건 편집 폼 (테이블 행 클릭 시 Dialog 모달 내용물)
 *
 * stock-item-table-view.ui.design.md §5.3.
 * 기존 StockValuationForm.ListedStockEditor·UnlistedStockCard body를 이 파일로 이동.
 * 모달이 곧 카드 외곽이므로 hideHeader=true로 외곽 border·헤더(이모지+번호+삭제) 미렌더 —
 * DialogTitle·푸터 삭제와 중복 제거. 자동조회·갑지·V2·부담부증여·공통속성 그대로 동작.
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { calcUnlistedStockPerShareValue } from "@/lib/tax-engine/property-valuation-stock";
import { applyCapitalIncreaseShareValuation } from "@/lib/tax-engine/property-valuation/dividend-difference-section-63-2-3";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { KiwoomValuationResultCard } from "@/components/calc/inheritance/listed-stock/KiwoomValuationResultCard";
import { useKiwoomValuationFetch } from "@/components/calc/inheritance/listed-stock/useKiwoomValuationFetch";
import { EstateCommonAttributesSection } from "@/components/calc/inheritance/EstateCommonAttributesSection";
import { StockBurdenedDebtSection } from "@/components/calc/gift/StockBurdenedDebtSection";
import { ListedStockBesshiAttributesSection } from "@/components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection";
import { ListedStockSecurityInfoSection } from "@/components/calc/inheritance/listed-stock/ListedStockSecurityInfoSection";
import { ListedStockBesshiPreviewCard } from "@/components/calc/inheritance/listed-stock/ListedStockBesshiPreviewCard";
import { ListedStockBesshiPdfDownloadButton } from "@/components/calc/inheritance/listed-stock/ListedStockBesshiPdfDownloadButton";
import { ListedStockValuationPreviewCard } from "@/components/calc/inheritance/listed-stock/ListedStockValuationPreviewCard";
import {
  applyKiwoomValuationResponse,
  resolveStartOverrideDate,
} from "@/lib/calc/listed-stock-besshi";
import { UnlistedStockSimpleFields } from "@/components/calc/UnlistedStockSimpleFields";
import {
  UnlistedStockV2Card,
  createDefaultUnlistedStockV2,
} from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card";
import { buildDefaultFiscalYears } from "@/lib/tax-engine/property-valuation/fiscal-year-annualize";
import { computeStockValuation, resolveUnlistedDisplayMode } from "@/lib/calc/stock-valuation";

// ============================================================
// 상장주식 자동조회 통합 (종목정보 + inline 버튼 + 결과 카드)
// ============================================================

function ListedStockAutoFetchIntegration({
  item,
  valuationDate,
  set,
}: {
  item: EstateItem;
  valuationDate: string;
  set: (patch: Partial<EstateItem>) => void;
}) {
  const startOverrideDate = resolveStartOverrideDate(item, valuationDate);
  const fetchState = useKiwoomValuationFetch({
    stockCode: item.listedStockCode ?? "",
    valuationDate,
    startOverrideDate,
    syncName: true,
    onResponse: (response) => {
      // 4그룹 분할 결과를 listedStockDailyGroupsInput 캐시에 channel-fill.
      // ★ onFill 은 전달하지 않음 — stale closure 덮어쓰기 방지
      //   (listed-stock-besshi-page2-empty-bug-fix.plan §2)
      const adapter = applyKiwoomValuationResponse(response, {
        startOverrideDate,
      });
      set({
        listedStockAvgPrice: adapter.listedStockAvgPrice,
        listedStockDailyGroupsInput: adapter.listedStockDailyGroupsInput,
        // 종목명 동시 mirror (Plan §3 Step C-2):
        //   name        — 자산 카드 헤더용 별명 (사용자 친화)
        //   companyName — 갑지 ① 정식 법인명
        //   키움 stockName 은 정식 법인명이므로 둘 다 정합.
        name: response.stockName || item.name,
        ...(adapter.companyName ? { companyName: adapter.companyName } : {}),
        // 상증령 §52의2 anchor shift echo (이미지 13)
        resolvedValuationAnchor: adapter.resolvedValuationAnchor,
        valuationAnchorShifted: adapter.valuationAnchorShifted,
        valuationAnchorShiftReason: adapter.valuationAnchorShiftReason,
        valuationPeriodStart: adapter.valuationPeriodStart,
        valuationPeriodEnd: adapter.valuationPeriodEnd,
      });
    },
  });

  // inline 버튼 — hook 결과를 직접 사용 (state 공유). KiwoomValuationAutoFetchButton
  // 컴포넌트는 본 통합에서 사용하지 않음 (별도 hook 인스턴스 회피).
  const inlineButton = (
    <button
      type="button"
      disabled={!fetchState.canFetch}
      onClick={fetchState.fetch}
      className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:bg-sky-200 disabled:text-sky-500 disabled:cursor-not-allowed whitespace-nowrap"
      title={fetchState.disabledReason ?? "전후 2개월 평균 자동 계산"}
      data-testid="ls-inline-auto-fetch-button"
    >
      {fetchState.loading ? "🔄 조회 중..." : "🔍 키움 자동조회"}
    </button>
  );

  return (
    <>
      <ListedStockSecurityInfoSection
        item={item}
        onUpdate={set}
        autoFetchSlot={inlineButton}
        autoFetchWarning={
          fetchState.error
            ? `❌ ${fetchState.error}`
            : fetchState.disabledReason
              ? `⚠️ ${fetchState.disabledReason}`
              : undefined
        }
      />
      <KiwoomValuationResultCard
        info={fetchState.info}
        error={fetchState.error}
        valuationDate={valuationDate}
        showDetail={fetchState.showDetail}
        onToggleDetail={() => fetchState.setShowDetail((v) => !v)}
        showError={false} // error 는 ListedStockSecurityInfoSection 의 warning 슬롯에서 노출
      />
    </>
  );
}

// ============================================================
// 상장주식 항목 편집기
// ============================================================

interface ListedStockEditorProps {
  item: EstateItem;
  index: number;
  onUpdate: (updated: EstateItem) => void;
  onRemove: () => void;
  /** 평가기준일 (상속개시일·증여일) — F-01 키움 자동조회 트리거 */
  valuationDate?: string;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
  /** 모달 내용물로 렌더 시 외곽 카드·헤더(이모지+번호+삭제) 미렌더 (DialogTitle·푸터 대체) */
  hideHeader?: boolean;
}

function ListedStockEditor({
  item,
  index,
  onUpdate,
  onRemove,
  valuationDate,
  mode,
  heirs,
  hideHeader = false,
}: ListedStockEditorProps) {
  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });

  const avgPrice = item.listedStockAvgPrice ?? 0;
  const shares = item.listedStockShares ?? 0;
  // §63②3호 (PR-L3): 상장법인 증자 신주(미상장)
  const isCapInc = item.isCapitalIncreaseUnlistedShare ?? false;
  const sameBaseDate = item.dividendBaseDateSameAsListed ?? false;
  const capInc = isCapInc
    ? applyCapitalIncreaseShareValuation(avgPrice, item.listedStockDividendDifference ?? 0, sameBaseDate)
    : null;
  // ★ C-B/D-8 재배선: preview totalValue = computeStockValuation(item) (§63②3호 차감 반영, dual-truth 차단)
  const totalValue = avgPrice > 0 && shares > 0 ? computeStockValuation(item) : 0;

  return (
    <div className={hideHeader ? "space-y-3" : "border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900"}>
      {/* 헤더 */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📈</span>
            <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
              상장주식 {index + 1}
            </span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            삭제
          </button>
        </div>
      )}

      {/* 법적 근거 안내 */}
      <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded px-3 py-2">
        ℹ️ 평가기준일 전후 2개월 최종 시세 단순평균 × 주식 수 (상증법 §63①1호 가목)
      </p>

      {/* 종목 정보 입력 (sky 카드) — 종목코드·종목명·보유 주식 수
          + 종목코드 우측 inline 자동조회 버튼 + 결과 카드는 직후 별도 위치에 렌더.
          평가기준일·종목코드 미입력 시 inline 버튼은 disabled, 결과 카드는 미렌더.
          Plan: docs/00-pm/listed-stock-security-info-layout-reorder.plan.md */}
      <ListedStockAutoFetchIntegration
        item={item}
        valuationDate={valuationDate ?? ""}
        set={set}
      />


      {/* 갑지 13 필드 입력 — 3 collapsible (sky·emerald·violet) */}
      <ListedStockBesshiAttributesSection
        item={item}
        onUpdate={(patch) => set(patch)}
      />

      {/* 평가조서 미리보기 + PDF 다운로드 (계획: ux-refinement) */}
      <div className="flex justify-end print:hidden">
        <ListedStockBesshiPdfDownloadButton item={item} valuationDate={valuationDate} />
      </div>
      <ListedStockBesshiPreviewCard item={item} valuationDate={valuationDate} />

      {/* 전후 2개월 종가 평균 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          전후 2개월 종가 단순평균 (원/주) <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={avgPrice > 0 ? avgPrice.toLocaleString() : ""}
          onChange={(e) => {
            const v = parseInt(e.target.value.replace(/,/g, "") || "0", 10);
            set({ listedStockAvgPrice: v || undefined });
          }}
          placeholder="주당 순손익 입력 (원)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="ls-avg-price"
        />
        <p className="text-xs text-gray-400">평가기준일 기준 전 2개월 + 후 2개월(총 4개월) 종가 평균</p>
      </div>

      {/* 보유 주식 수는 ListedStockSecurityInfoSection 으로 이동 (UX 개편) */}

      {/* §63②3호 — 상장법인 증자 신주(평가기준일 현재 미상장) (PR-L3) */}
      <ToggleCard
        tone="violet"
        checked={isCapInc}
        onCheckedChange={(v) =>
          set({
            isCapitalIncreaseUnlistedShare: v || undefined,
            ...(v ? {} : { listedStockDividendDifference: undefined, dividendBaseDateSameAsListed: undefined }),
          })
        }
        title="§63②3호 — 상장법인 증자 신주 (평가기준일 현재 미상장)"
        description="거래소 상장 법인의 증자로 취득한 새 주식으로 평가기준일 현재 상장되지 않은 경우. 평가 = 상장 주식 전후 2개월 평균 − 배당차액(시행규칙 §18②)."
      >
        <div className="space-y-3">
          {/* §18② 단서: 배당기산일 동일 → 배당차액 제외 */}
          <ToggleCard
            tone="sky"
            variant="chip"
            checked={sameBaseDate}
            onCheckedChange={(v) => set({ dividendBaseDateSameAsListed: v || undefined })}
            title="정관상 배당기산일을 기존 상장주식과 동일하게 정함 → 배당차액 제외 (§18② 단서)"
          />

          <FieldCard
            label="배당차액 (원/주)"
            hint="시행규칙 §18② 산출액을 직접 입력. 미입력 시 가목 평가액과 동일 적용. (단서 적용 시 0)"
          >
            <CurrencyInput
              label="배당차액"
              hideLabel
              hideUnit
              value={sameBaseDate ? "0" : String(item.listedStockDividendDifference ?? "")}
              onChange={(v) => {
                const n = parseAmount(v);
                set({ listedStockDividendDifference: n || undefined });
              }}
              disabled={sameBaseDate}
            />
          </FieldCard>

          {capInc && avgPrice > 0 && (
            <p className="text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 rounded px-3 py-2">
              1주당 = 가목 {avgPrice.toLocaleString()} − 배당차액 {capInc.effectiveDividendDifference.toLocaleString()} ={" "}
              <span className="font-semibold">{capInc.perShareValue.toLocaleString()}</span>
            </p>
          )}
        </div>
      </ToggleCard>

      {/* 평가액 미리보기 — §63③ 할증 반영 산식 표시 (dual-truth 차단)
          Plan: docs/00-pm/listed-stock-form-formula-premium-display-fix.plan.md */}
      <ListedStockValuationPreviewCard item={item} />

      {/* §47① 부담부증여 채무인수 (증여 모드 전용) — 평가 입력 뒤 = 계산 로직 순서 */}
      <StockBurdenedDebtSection item={item} onUpdate={onUpdate} mode={mode} />

      {/* 공통속성 4블록 (EstateCommonAttributesSection) — PR-4: 상장·비상장 공용 */}
      <EstateCommonAttributesSection
        item={item}
        onUpdate={onUpdate}
        mode={mode}
        heirs={heirs}
        effectiveValuation={totalValue}
        deathDate={valuationDate}
      />
    </div>
  );
}

// ============================================================
// 비상장주식 카드 — 모드 선택기 + 조건부 렌더 + 공통속성 (PR-3)
// ============================================================

// RadioCardGroup용 정적 tone 매핑 (feedback_tailwind_static_tone_mapping)
const VALUATION_MODE_OPTIONS = [
  {
    value: "simple" as const,
    label: "간편평가",
    description: "순손익·순자산 2개 수치 — 빠른 추산",
  },
  {
    value: "formal" as const,
    label: "정식평가",
    description: "별지 부표3 완전 재현 — 신고서용",
  },
];

interface UnlistedStockCardProps {
  item: EstateItem;
  index: number;
  onUpdate: (updated: EstateItem) => void;
  onRemove: () => void;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
  /** 평가기준일 display fallback — 상속개시일 또는 증여일 (YYYY-MM-DD) */
  valuationDate?: string;
  /** 모달 내용물로 렌더 시 외곽 카드·헤더(이모지+번호+삭제) 미렌더 (DialogTitle·푸터 대체) */
  hideHeader?: boolean;
}

function UnlistedStockCard({
  item,
  index,
  onUpdate,
  onRemove,
  mode,
  heirs,
  valuationDate,
  hideHeader = false,
}: UnlistedStockCardProps) {
  const currentMode = resolveUnlistedDisplayMode(item);
  // 부동산과다보유법인 — store(unlistedStockData)에서 read. heavyMap local state 폐지(엔진 도달 보장).
  const isRealEstateHeavy = item.unlistedStockData?.isRealEstateHeavy ?? false;

  // 협의분할 effectiveValuation 계산 — 선택 모드에 따라 다른 평가 함수 사용
  const effectiveValuation = useMemo(() => {
    if (currentMode === "formal" && item.unlistedStockValuationV2) {
      const v2 = item.unlistedStockValuationV2;
      if (v2.totalShares > 0 && v2.ownedShares > 0) {
        try {
          const result = evaluateUnlistedStockV2(v2);
          return result.totalValuation > 0 ? result.totalValuation : 0;
        } catch {
          return 0;
        }
      }
    }
    const data = item.unlistedStockData;
    if (data && data.totalShares > 0 && data.ownedShares > 0) {
      try {
        const preview = calcUnlistedStockPerShareValue(data, isRealEstateHeavy);
        return preview.perShareFinalValue * data.ownedShares;
      } catch {
        return 0;
      }
    }
    return 0;
  }, [currentMode, item, isRealEstateHeavy]);

  const handleModeChange = (newMode: "simple" | "formal") => {
    if (newMode === "formal" && !item.unlistedStockValuationV2) {
      // 정식 모드 최초 선택 → V2 초기값 생성 (C-3)
      // valuationDate(상속개시일/증여일)가 있으면 evaluationDate + fiscalYears 기본값으로 주입
      // (mirror-pattern: useEffect 금지 — 이벤트 핸들러 1회 주입)
      const defaultV2 = createDefaultUnlistedStockV2();
      if (valuationDate) {
        const vd = new Date(valuationDate);
        if (!isNaN(vd.getTime())) {
          defaultV2.evaluationDate = vd;
          // 평가기준일 연도(Y) 기준 직전 3 사업연도 자동 주입 (12월 결산 가정)
          // 사용자 이후 수정은 FiscalYearAdjustmentTable onChange로 보존
          defaultV2.fiscalYears = buildDefaultFiscalYears(vd.getFullYear());
        }
      }
      onUpdate({
        ...item,
        unlistedValuationMode: "formal",
        unlistedStockValuationV2: defaultV2,
      });
    } else {
      // 간편 복귀 or 재진입 — V2 보존, mode만 변경 (C-2/C-5)
      onUpdate({ ...item, unlistedValuationMode: newMode });
    }
  };

  return (
    <div className={hideHeader ? "space-y-3" : "border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900"}>
      {/* 헤더 */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
              비상장주식 {index + 1}
            </span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            삭제
          </button>
        </div>
      )}

      {/* ⚖️ 평가 방식 선택 — RadioCardGroup (PR-3, 계획서 §3) */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">⚖️ 평가 방식</p>
        <RadioCardGroup
          name={`unlisted-mode-${item.id}`}
          options={VALUATION_MODE_OPTIONS}
          value={currentMode}
          onChange={handleModeChange}
          tone="violet"
          layout="inline"
        />
      </div>

      {/* 선택 모드 입력 — simple: 간편 필드, formal: V2 카드 */}
      {currentMode === "simple" && (
        <UnlistedStockSimpleFields
          item={item}
          onUpdate={onUpdate}
          mode={mode}
          valuationDate={valuationDate}
        />
      )}
      {currentMode === "formal" && item.unlistedStockValuationV2 && (
        <UnlistedStockV2Card
          input={item.unlistedStockValuationV2}
          onChange={(next) => onUpdate({ ...item, unlistedStockValuationV2: next })}
          valuationDate={valuationDate}
          taxKind={mode}
        />
      )}

      {/* §47① 부담부증여 채무인수 (증여 모드 전용) — 평가 입력 뒤 = 계산 로직 순서 */}
      <StockBurdenedDebtSection item={item} onUpdate={onUpdate} mode={mode} />

      {/* 공통속성 4블록 (EstateCommonAttributesSection) — PR-4: 모드 밖, 카드 하단 배치 */}
      <EstateCommonAttributesSection
        item={item}
        onUpdate={onUpdate}
        mode={mode}
        heirs={heirs}
        effectiveValuation={effectiveValuation}
        deathDate={valuationDate}
      />
    </div>
  );
}

// ============================================================
// 메인 — category switch 래퍼 (모달 내용물)
// ============================================================

export interface StockItemEditorProps {
  item: EstateItem;
  index: number;
  onUpdate: (updated: EstateItem) => void;
  onRemove: () => void;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
  /** 평가기준일 (상속개시일·증여일) */
  valuationDate?: string;
}

export function StockItemEditor({
  item,
  index,
  onUpdate,
  onRemove,
  mode,
  heirs,
  valuationDate,
}: StockItemEditorProps) {
  if (item.category === "listed_stock") {
    return (
      <ListedStockEditor
        item={item}
        index={index}
        onUpdate={onUpdate}
        onRemove={onRemove}
        valuationDate={valuationDate}
        mode={mode}
        heirs={heirs}
        hideHeader
      />
    );
  }
  return (
    <UnlistedStockCard
      item={item}
      index={index}
      onUpdate={onUpdate}
      onRemove={onRemove}
      mode={mode}
      heirs={heirs}
      valuationDate={valuationDate}
      hideHeader
    />
  );
}
