/**
 * 취득세 중과세 상세 판정 결과 카드
 *
 * AcquisitionTaxResult.isSurcharged / surchargeReason /
 * firstHomeReduction 데이터를 시각화.
 * - 중과세 유형 (다주택·법인·사치성)
 * - 기본세율 vs 중과세율 비교
 * - 생애최초 감면 적용 여부·금액·추징 경고
 * - 중과 배제 사유
 */

import { cn } from "@/lib/utils";
import type { AcquisitionTaxResult, SurchargeDecision } from "@/lib/tax-engine/types/acquisition.types";

// ============================================================
// 타입
// ============================================================

interface Props {
  result: AcquisitionTaxResult;
  /** assessSurcharge 결과 (선택 — 전달 시 세부 배제 사유 표시) */
  surchargeDetail?: Pick<SurchargeDecision, "exceptions" | "warnings" | "legalBasis">;
}

// ============================================================
// 유틸
// ============================================================

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function formatRate(r: number) {
  return (r * 100).toFixed(5).replace(/\.?0+$/, "") + "%";
}

// ============================================================
// 중과세 유형 레이블
// ============================================================

function getSurchargeTypeLabel(rateType: AcquisitionTaxResult["rateType"], surchargeReason?: string): string {
  if (rateType === "surcharge_corporate") return "법인 주택 취득 중과 (지방세법 §13의2)";
  if (rateType === "surcharge_luxury") return "사치성 재산 중과 (지방세법 §13①)";
  if (rateType === "surcharge_regulated") {
    if (surchargeReason?.includes("3주택") || surchargeReason?.includes("3house")) {
      return "조정대상지역 3주택 이상 취득 중과 (지방세법 §13의2)";
    }
    return "조정대상지역 2주택 취득 중과 (지방세법 §13의2)";
  }
  return surchargeReason ?? "중과세";
}

// ============================================================
// 세율 비교 바 (시각화)
// ============================================================

function RateBar({ rate, label, isHighlight }: { rate: number; label: string; isHighlight?: boolean }) {
  const pct = Math.min(rate * 100 / 12 * 100, 100); // 12%를 최대값으로 시각화
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={cn("font-medium", isHighlight ? "text-destructive" : "text-muted-foreground")}>
          {label}
        </span>
        <span className={cn("font-semibold", isHighlight ? "text-destructive" : "")}>
          {formatRate(rate)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={cn("h-2 rounded-full transition-all", isHighlight ? "bg-destructive" : "bg-primary/50")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function AcquisitionSurchargeDetailCard({ result, surchargeDetail }: Props) {
  const {
    isSurcharged,
    appliedRate,
    acquisitionTax,
    taxBase,
    surchargeReason,
    rateType,
    reductionType,
    reductionAmount,
    totalTax,
    totalTaxAfterReduction,
  } = result;

  // 중과도 없고 감면도 없으면 카드 미표시
  if (!isSurcharged && !reductionType) return null;

  // 기본세율 추정 (표시 목적)
  const estimatedBasicRate = (() => {
    if (taxBase <= 0) return 0;
    if (taxBase <= 600_000_000) return 0.01;
    if (taxBase <= 900_000_000) return appliedRate; // 선형보간 구간 (중과 없음)
    return 0.03;
  })();

  const basicTax = isSurcharged ? Math.floor(taxBase * estimatedBasicRate) : acquisitionTax;
  const surchargeExtra = isSurcharged ? acquisitionTax - basicTax : 0;

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-destructive">
            {isSurcharged ? "중과세 적용" : "감면 적용"}
          </p>
          {isSurcharged && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {getSurchargeTypeLabel(rateType, surchargeReason)}
            </p>
          )}
        </div>
        {isSurcharged && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
            {formatRate(appliedRate)}
          </span>
        )}
      </div>

      {/* 세율 비교 바 */}
      {isSurcharged && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">세율 비교</p>
          <RateBar rate={estimatedBasicRate} label="기본세율 (중과 전)" />
          <RateBar rate={appliedRate} label="적용세율 (중과 후)" isHighlight />
        </div>
      )}

      {/* 세액 비교 */}
      {isSurcharged && (
        <div className="rounded-md bg-background border p-3 space-y-1.5 text-sm">
          <p className="text-xs font-medium text-muted-foreground mb-2">세액 비교</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">기본세율 적용 시</span>
            <span>{formatKRW(basicTax)}</span>
          </div>
          <div className="flex justify-between text-destructive font-medium">
            <span>중과세 추가 부담</span>
            <span>+ {formatKRW(surchargeExtra)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-1.5">
            <span>취득세 본세</span>
            <span>{formatKRW(acquisitionTax)}</span>
          </div>
        </div>
      )}

      {/* 생애최초 감면 */}
      {reductionType === "first_home" && (
        <div className="rounded-md bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800 p-3 space-y-2">
          <p className="text-xs font-semibold text-green-800 dark:text-green-200">
            생애최초 주택 취득 감면 적용 (지방세특례제한법 §36의3)
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">감면 전 납부세액</span>
              <span>{formatKRW(totalTax)}</span>
            </div>
            <div className="flex justify-between text-green-700 dark:text-green-300 font-medium">
              <span>감면액 (최대 200만원)</span>
              <span>- {formatKRW(reductionAmount)}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1">
              <span>최종 납부세액</span>
              <span className="text-primary">{formatKRW(totalTaxAfterReduction)}</span>
            </div>
          </div>

          {/* 추징 경고 */}
          <div className="rounded bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-2 mt-1">
            <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200">⚠️ 추징 주의사항</p>
            <ul className="mt-1 space-y-0.5 text-xs text-yellow-700 dark:text-yellow-300">
              <li>• 취득일로부터 3년 이내 처분 시 감면세액 추징</li>
              <li>• 취득일로부터 3년 이내 임대 시 추징</li>
              <li>• 취득일로부터 3년 이내 주거 외 용도 사용 시 추징</li>
            </ul>
          </div>
        </div>
      )}

      {/* 중과 배제 사유 */}
      {surchargeDetail?.exceptions && surchargeDetail.exceptions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">중과 배제 사유</p>
          <ul className="space-y-0.5">
            {surchargeDetail.exceptions.map((ex, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                <span className="mt-0.5 text-primary">✓</span>
                {ex}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 추가 경고 */}
      {surchargeDetail?.warnings && surchargeDetail.warnings.length > 0 && (
        <ul className="space-y-0.5">
          {surchargeDetail.warnings.map((w, i) => (
            <li key={i} className="text-xs text-yellow-700 dark:text-yellow-300">
              • {w}
            </li>
          ))}
        </ul>
      )}

      {/* 법령 근거 */}
      {surchargeDetail?.legalBasis && surchargeDetail.legalBasis.length > 0 && (
        <p className="text-xs text-muted-foreground">
          근거: {surchargeDetail.legalBasis.join(" / ")}
        </p>
      )}
    </div>
  );
}
