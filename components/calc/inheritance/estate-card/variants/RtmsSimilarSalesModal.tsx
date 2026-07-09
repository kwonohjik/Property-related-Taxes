"use client";

/**
 * RtmsSimilarSalesModal — RTMS 유사매매사례가액 자동조회 모달
 *
 * 법령 근거:
 *   - 상증령 §49①: 평가기간 (상속 전후 6개월 / 증여 전 6개월~후 3개월)
 *   - 상증령 §49②: 가장 가까운 날 기준 추천 (자동 1건 확정 금지)
 *   - 상증령 §49④: 유사재산 매매사례가액 (신고일 절단 포함)
 *   - 상증령 §49①1호가목: 특수관계인 거래 시가 불인정 — 자동 판별 불가, 경고만
 *   - 시행규칙 §15③1호: 공동주택 유사재산 3요건 (단지·면적±5%·공시가격±5%)
 *
 * 설계:
 *   - 4-레이어 아키텍처: 모달(UI) → Mediator(rtms-similar-sales-lookup.ts) → 라우트 → RTMS API
 *   - 자동 1건 확정 금지: 추천 표시만, 사용자 선택 필수
 *   - mirror-pattern: useEffect→store 미러링 금지. 자동채움은 onSelect 콜백으로 처리
 *   - 직거래 행 개별 경고 배지 (§49①1호가목 특수관계 개연성)
 *   - P5: configMissing 시 모달 내 안내 표시 (버튼 비활성은 부모 처리)
 *
 * 설계 문서: docs/02-design/features/inheritance-similar-sales-rtms-lookup.ui.design.md §2·§4
 * Plan §9·§10·§11 BINDING 반영.
 */

import { useState, useCallback } from "react";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  fetchRtmsSimilarSales,
  filterSimilarSales,
  rankByClosestDate,
  averageAmount,
  isRtmsLookupError,
} from "@/lib/calc/rtms-similar-sales-lookup";
import type { RtmsPropertyType } from "@/lib/calc/rtms-similar-sales-lookup";
import type { SimilarSalesCandidate } from "@/lib/calc/rtms-similar-sales-filter";

// 물건 종류 옵션 (공동주택 계열 — RTMS 종류별 endpoint)
const PROPERTY_TYPE_OPTIONS: { value: RtmsPropertyType; label: string }[] = [
  { value: "apt", label: "아파트" },
  { value: "rh", label: "연립·다세대" },
  { value: "offi", label: "오피스텔" },
];

// ──────────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────────

export interface RtmsSimilarSalesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 대상 아파트 단지명 */
  aptName: string;
  /** 대상 아파트 소재 시군구코드 (5자리 — lawdCd 파생용) */
  sigunguCode: string;
  /** 대상 아파트 전용면적 (㎡) */
  targetExclusiveAreaM2?: number;
  /** 대상 아파트 공동주택가격 (원) — Phase 1: 경고만, Phase 2: ±5% 적용 */
  targetStandardPrice?: number;
  /** 대상 아파트 읍면동명 (optional — 있으면 단지 매칭 정밀화) */
  targetUmdNm?: string;
  /** 평가기준일(상속·증여) 또는 취득일(양도) (YYYY-MM-DD) */
  valuationDate: string;
  /** 세목 — 평가기간 산정 (상속·증여=상증령 §49 / 양도=소득세법 시행령 §176의2③) */
  taxType: "inheritance" | "gift" | "transfer";
  /** 물건 종류 초기값 (apt/rh/offi — 기본 apt). 사용자가 모달 내 라디오로 변경 가능. */
  initialPropertyType?: RtmsPropertyType;
  /** 자동채움 콜백 — 사용자가 "이 금액으로 채우기" 클릭 시 호출 */
  onSelect: (result: { amount: number }) => void;
}

// ──────────────────────────────────────────────────────────────
// 내부 상태 타입
// ──────────────────────────────────────────────────────────────

type ModalStatus = "idle" | "loading" | "error" | "empty" | "ready";

// ──────────────────────────────────────────────────────────────
// 금액 포맷 헬퍼
// ──────────────────────────────────────────────────────────────

function formatWon(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatAreaPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ──────────────────────────────────────────────────────────────
// 개별 후보 행
// ──────────────────────────────────────────────────────────────

interface CandidateRowProps {
  candidate: SimilarSalesCandidate;
  isSelected: boolean;
  onToggle: () => void;
}

function CandidateRow({ candidate, isSelected, onToggle }: CandidateRowProps) {
  const { trade, areaDiffRatePct, daysFromValuationDate, isRecommended, isWithinPeriod } = candidate;
  const isDirectTrade = trade.dealingType === "직거래";

  return (
    <div
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={[
        "rounded-lg border p-3 cursor-pointer transition-colors",
        isSelected
          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-900/20"
          : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800/60",
        !isWithinPeriod ? "opacity-60" : "",
      ].join(" ")}
    >
      {/* 상단: 체크 + 추천배지 + 층·면적·거래일 */}
      <div className="flex items-start gap-2">
        {/* 체크박스 */}
        <div className={[
          "mt-0.5 shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center",
          isSelected
            ? "bg-emerald-500 border-emerald-500"
            : "border-gray-300 dark:border-gray-600",
        ].join(" ")}>
          {isSelected && (
            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* 추천 배지 (§49② 가장 가까운 날) */}
            {isRecommended && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-micro font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                ★ §49② 추천
              </span>
            )}
            {/* 평가기간 외 배지 */}
            {!isWithinPeriod && (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-micro font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                평가기간 외
              </span>
            )}
            {/* 직거래 경고 배지 (P9 — §49①1호가목 특수관계 개연성) */}
            {isDirectTrade && (
              <span
                title="직거래는 특수관계인 거래 가능성이 높습니다 (§49①1호가목)"
                className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-micro font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              >
                ⚠️ 직거래
              </span>
            )}
          </div>

          {/* 기본 정보 */}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-700 dark:text-gray-300">
            <span>{trade.floor > 0 ? `${trade.floor}층` : "층미상"}</span>
            <span>{trade.exclusiveAreaM2.toFixed(2)}㎡</span>
            <span>{trade.dealDate}</span>
            <span className="text-gray-500 dark:text-gray-400">
              면적차 {formatAreaPct(areaDiffRatePct)}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              평가기준일 {daysFromValuationDate}일
            </span>
            {trade.dealingType && (
              <span className="text-gray-500 dark:text-gray-400">
                {trade.dealingType}
              </span>
            )}
          </div>
        </div>

        {/* 거래금액 — 우측 정렬 */}
        <div className="shrink-0 text-right">
          <div className="text-sm font-mono font-semibold tabular-nums whitespace-nowrap text-gray-900 dark:text-gray-100">
            {formatWon(trade.dealAmountWon)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 메인 모달
// ──────────────────────────────────────────────────────────────

export function RtmsSimilarSalesModal({
  open,
  onOpenChange,
  aptName,
  sigunguCode,
  targetExclusiveAreaM2,
  targetStandardPrice,
  targetUmdNm,
  valuationDate,
  taxType,
  initialPropertyType,
  onSelect,
}: RtmsSimilarSalesModalProps) {
  const [propertyType, setPropertyType] = useState<RtmsPropertyType>(
    initialPropertyType ?? "apt",
  );
  const [status, setStatus] = useState<ModalStatus>("idle");
  const [candidates, setCandidates] = useState<SimilarSalesCandidate[]>([]);
  const [outOfPeriod, setOutOfPeriod] = useState<SimilarSalesCandidate[]>([]);
  const [outOfPeriodOpen, setOutOfPeriodOpen] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | undefined>(undefined);
  const [reportDate, setReportDate] = useState("");
  const [appliedCriteria, setAppliedCriteria] = useState<{
    areaMin: number;
    areaMax: number;
    periodStart: string;
    periodEnd: string;
  } | null>(null);
  const [hasQueried, setHasQueried] = useState(false);

  // 쿼리 실행
  const handleQuery = useCallback(async () => {
    if (!valuationDate || !sigunguCode) {
      setError("평가기준일 또는 시군구코드가 없습니다.");
      setStatus("error");
      return;
    }

    const lawdCd = sigunguCode.slice(0, 5);

    setStatus("loading");
    setError(undefined);
    setSelectedIds(new Set());
    setHasQueried(true);

    const outcome = await fetchRtmsSimilarSales(
      lawdCd,
      valuationDate,
      taxType,
      propertyType,
    );

    if (isRtmsLookupError(outcome)) {
      if (outcome.code === "API_KEY_MISSING") {
        setError("MOLIT_RTMS_API_KEY가 설정되지 않았습니다. 관리자에게 문의하세요.");
      } else {
        setError(outcome.message || "RTMS 조회 중 오류가 발생했습니다.");
      }
      setStatus("error");
      return;
    }

    // 필터링
    const valuationDateObj = new Date(valuationDate + "T00:00:00.000Z");
    const reportDateObj = reportDate ? new Date(reportDate + "T00:00:00.000Z") : undefined;

    const filterResult = filterSimilarSales(outcome.records, {
      targetAptName: aptName,
      targetUmdNm: targetUmdNm,
      targetExclusiveAreaM2,
      targetStandardPrice,
      valuationDate: valuationDateObj,
      taxType,
      reportDate: reportDateObj,
    });

    setAppliedCriteria(filterResult.appliedCriteria);
    setWarnings(filterResult.warnings);

    // 기간 내 후보
    const ranked = rankByClosestDate(filterResult.candidates);
    setCandidates(ranked);
    setOutOfPeriod(filterResult.outOfPeriod);

    if (ranked.length === 0) {
      setStatus("empty");
    } else {
      setStatus("ready");
    }
  }, [aptName, sigunguCode, targetExclusiveAreaM2, targetStandardPrice, targetUmdNm, valuationDate, taxType, reportDate, propertyType]);

  // 행 선택 토글
  const handleToggle = useCallback((tradeKey: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tradeKey)) {
        next.delete(tradeKey);
      } else {
        next.add(tradeKey);
      }
      return next;
    });
  }, []);

  // 후보 고유키 (중복 없는 식별자)
  const tradeKey = (c: SimilarSalesCandidate) =>
    `${c.trade.dealDate}|${c.trade.floor}|${c.trade.dealAmountWon}|${c.trade.exclusiveAreaM2}`;

  // 선택 후보 목록
  const selectedCandidates = candidates.filter((c) => selectedIds.has(tradeKey(c)));

  // 선택 평균금액
  const selectedAvg = selectedCandidates.length > 0
    ? averageAmount(selectedCandidates)
    : 0;

  // "이 금액으로 채우기" 클릭
  const handleFill = useCallback(() => {
    if (selectedAvg <= 0) return;
    onSelect({ amount: selectedAvg });
  }, [selectedAvg, onSelect]);

  // 전체 선택/해제
  const allSelected = candidates.length > 0 && candidates.every((c) => selectedIds.has(tradeKey(c)));
  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map(tradeKey)));
    }
  }, [allSelected, candidates]);

  // 모달 닫힐 때 상태 초기화
  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) {
      setStatus("idle");
      setCandidates([]);
      setOutOfPeriod([]);
      setWarnings([]);
      setSelectedIds(new Set());
      setError(undefined);
      setAppliedCriteria(null);
      setHasQueried(false);
    }
    onOpenChange(v);
  }, [onOpenChange]);

  const isTransfer = taxType === "transfer";
  const taxLabel =
    taxType === "inheritance" ? "상속" : taxType === "gift" ? "증여" : "양도";
  const periodLabel =
    taxType === "inheritance"
      ? "전후 6개월"
      : taxType === "gift"
        ? "전 6개월~후 3개월"
        : "취득일 전후 3개월";
  const legalRef = isTransfer
    ? "소득세법 시행령 §176의2③1호 — 취득일 전후 각 3개월 유사 매매사례"
    : "상속세 및 증여세법 시행령 §49④ — 면적·용도·기준시가 유사 매매사례";
  const dateLabel = isTransfer ? "(취득일)" : "(평가기준일)";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        aria-describedby="rtms-modal-description"
      >
        <DialogHeader>
          <DialogTitle>유사 매매사례 자동조회</DialogTitle>
          <p
            id="rtms-modal-description"
            className="text-xs text-muted-foreground"
          >
            {legalRef}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* 대상 아파트 정보 카드 (sky) */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-900/15 px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              대상 아파트 정보
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
              <div>
                <span className="text-gray-500 dark:text-gray-400">단지명</span>
                <span className="ml-1.5 font-medium">{aptName || "(미입력)"}</span>
              </div>
              {targetExclusiveAreaM2 != null && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">전용면적</span>
                  <span className="ml-1.5 font-medium">{targetExclusiveAreaM2.toFixed(2)}㎡</span>
                </div>
              )}
              {targetStandardPrice != null && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">공동주택가격</span>
                  <span className="ml-1.5 font-mono tabular-nums">{formatWon(targetStandardPrice)}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500 dark:text-gray-400">기준일</span>
                <span className="ml-1.5 font-medium">{valuationDate}</span>
                <span className="ml-1 text-gray-400">{dateLabel}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">조회범위</span>
                <span className="ml-1.5 text-sky-700 dark:text-sky-300">
                  {taxLabel}: {periodLabel}
                </span>
              </div>
            </div>
          </div>

          {/* 물건 종류 선택 (사용자 명시 선택 — RTMS 종류별 endpoint) */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-900/15 px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              물건 종류
            </p>
            <RadioCardGroup<RtmsPropertyType>
              name="rtms-property-type"
              layout="inline"
              value={propertyType}
              onChange={setPropertyType}
              options={PROPERTY_TYPE_OPTIONS}
            />
          </div>

          {/* 신고일 입력 (선택 — §49④ 신고일 절단, P7) — 상속·증여 전용 */}
          {!isTransfer && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                신고일 (선택 — §49④)
              </p>
              <p className="text-caption text-gray-500 dark:text-gray-400">
                신고일 입력 시 그 이후 거래는 유사매매사례에서 제외됩니다 (상증령 §49④ 괄호).
                통상 신고 전 시뮬레이션이므로 미입력이 기본입니다.
              </p>
              <DateInput
                value={reportDate}
                onChange={setReportDate}
              />
            </div>
          )}

          {/* 조회 버튼 */}
          <Button
            onClick={handleQuery}
            disabled={status === "loading"}
            className="w-full"
          >
            {status === "loading"
              ? "국토교통부 실거래가 조회 중..."
              : hasQueried
                ? "다시 조회"
                : "조회 시작"}
          </Button>

          {/* 로딩 상태 */}
          {status === "loading" && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                국토교통부 실거래가를 조회하고 있습니다...
              </div>
              {/* Skeleton cards */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          )}

          {/* 오류 상태 */}
          {status === "error" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20 px-4 py-3" role="alert">
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                실거래가를 불러오지 못했습니다
              </p>
              {error && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleQuery}
              >
                재시도
              </Button>
            </div>
          )}

          {/* 경고 (warnings 배열) */}
          {status !== "loading" && warnings.length > 0 && (
            <div className="space-y-1.5" role="status" aria-live="polite">
              {warnings.map((w, i) => (
                <div
                  key={i}
                  className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300"
                >
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}

          {/* 조회 조건 칩 (amber) — 결과 있을 때만 */}
          {(status === "ready" || status === "empty") && appliedCriteria && (
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-2.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                면적 {appliedCriteria.areaMin > 0 ? `${appliedCriteria.areaMin.toFixed(2)}~${appliedCriteria.areaMax.toFixed(2)}㎡` : "범위 미적용"}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-2.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                기간 {appliedCriteria.periodStart} ~ {appliedCriteria.periodEnd}
              </span>
              {targetStandardPrice == null && (
                <span className="rounded-full border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 px-2.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                  공시가격 필터 미적용
                </span>
              )}
            </div>
          )}

          {/* 후보 없음 상태 */}
          {status === "empty" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/20 px-4 py-6 text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                조건을 만족하는 유사 매매사례가 없습니다
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                직접 금액을 입력하거나 조회 조건을 확인해주세요.
              </p>
              {outOfPeriod.length > 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  평가기간 외 거래 {outOfPeriod.length}건이 있습니다 (위 목록에 표시).
                </p>
              )}
            </div>
          )}

          {/* 후보 리스트 */}
          {status === "ready" && candidates.length > 0 && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {candidates.length}건 조회 (평가기간 내)
                </p>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-caption text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline underline-offset-2"
                >
                  {allSelected ? "전체 해제" : "전체 선택"}
                </button>
              </div>

              {candidates.map((c) => {
                const key = tradeKey(c);
                return (
                  <CandidateRow
                    key={key}
                    candidate={c}
                    isSelected={selectedIds.has(key)}
                    onToggle={() => handleToggle(key)}
                  />
                );
              })}

              {/* 평가기간 외 참고 거래 */}
              {outOfPeriod.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setOutOfPeriodOpen((o) => !o)}
                    aria-expanded={outOfPeriodOpen}
                    className={expandToggleClass("slate")}
                  >
                    {expandToggleLabel(outOfPeriodOpen)} · 평가기간 외 거래 {outOfPeriod.length}건 (참고용 — 시가 불인정 가능)
                  </button>
                  {outOfPeriodOpen && (
                    <div className="mt-2 space-y-2 opacity-70">
                      {outOfPeriod.map((c) => {
                        const key = tradeKey(c);
                        return (
                          <CandidateRow
                            key={key}
                            candidate={c}
                            isSelected={selectedIds.has(key)}
                            onToggle={() => handleToggle(key)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* §49①1호가목 특수관계 경고 배너 — 후보 있을 때 항상 표시 */}
          {(status === "ready" || (status === "empty" && outOfPeriod.length > 0)) && (
            <div
              className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-300"
              role="note"
            >
              <p className="font-semibold">
                ⚠️ 특수관계인 거래 주의 (상증령 §49①1호가목)
              </p>
              <p className="mt-1">
                특수관계인(상증령 §2의2)과의 거래는 시가로 인정되지 않습니다.
                거래 당사자와 대상 아파트 소유자(피상속인·증여자) 간 특수관계 여부를
                반드시 확인하세요. 특수관계 판별은 자동화할 수 없습니다.
              </p>
            </div>
          )}
        </div>

        {/* 하단: 선택 평균 + 채우기 버튼 */}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            {selectedCandidates.length > 0 ? (
              <span>
                <span className="font-medium">선택 {selectedCandidates.length}건 평균:</span>
                {" "}
                <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatWon(selectedAvg)}
                </span>
              </span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500 text-xs">
                행을 선택하면 평균 금액이 표시됩니다
              </span>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              취소
            </Button>
            <Button
              disabled={selectedAvg <= 0}
              onClick={handleFill}
            >
              이 금액으로 채우기
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
