"use client";

/**
 * 대주주 판정 카드 — `StockTransferTaxResultView.tsx`에서 분리(800줄 정책 — 2026-10-04 Z-1 작업 중 769줄 위험구간).
 * 로직은 한 줄도 바꾸지 않았다.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { MARKET_LABEL } from "@/components/calc/stock-transfer/market-label";

/**
 * 대주주 판정 여부 — exact 비교 필수.
 * substring 매칭 `includes("major")` 절대 금지:
 * "listed_non_major_in_market"·"listed_otc_non_major"·"unlisted_non_major" 가 모두 "major" 포함.
 */
function isMajorTaxCategory(c: StockTransferResult["taxCategory"]): boolean {
  return c === "listed_major" || c === "unlisted_major";
}

// Phase B 신설 (2026-05-19) — appliedThreshold.ruleSource 라벨 매핑
const RULE_SOURCE_LABEL: Record<NonNullable<NonNullable<StockTransferResult["appliedThreshold"]>["ruleSource"]>, string> = {
  "§157": "소득세법 시행령 §157 (상장)",
  "§167의8①2호": "소득세법 시행령 §167의8①2호 (비상장)",
  "§167의8①2호_벤처": "소득세법 시행령 §167의8①2호 나목 단서 (비상장 벤처)",
};

// F-09/F-10/F-14/F-23 신설 (2026-05-19) — judgmentBasis 라벨 매핑
const JUDGMENT_BASIS_LABEL: Record<NonNullable<NonNullable<StockTransferResult["appliedThreshold"]>["judgmentBasis"]>, string> = {
  default: "직전사업연도 종료일 (통상)",
  merger: "합병등기일 기준 (피합병법인 — 2010 소령 157⑧)",
  split: "분할등기일 기준 (분할 전 법인)",
  split_new_entity: "분할 전 직전사업연도 종료일 (분할신설법인)",
  incorporation: "설립등기일 기준 (신설법인 — 소령 157④)",
};

export function MajorShareholderResultCard({
  result,
}: {
  result: StockTransferResult;
}) {
  const t = result.appliedThreshold;
  if (!t) return null; // 기타자산(other_asset) 자동 가드

  // 비상장은 §167의8①2호, 상장은 §157④. Phase B — 벤처 분기 시 §167의8①2호 나목 단서
  const lawRef = t.isVentureRule
    ? "§167의8①2호 나목 단서"
    : t.marketType === "unlisted"
      ? "§167의8①2호"
      : "§157④";
  const isUnlisted = t.marketType === "unlisted";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-2">
      <h4 className="text-sm font-semibold text-violet-900 flex flex-wrap items-center gap-2">
        대주주 판정 ({lawRef})
        {/* Phase B (2026-05-19) — 비상장 벤처기업 임계 적용 배지 */}
        {t.isVentureRule && (
          <span className="inline-flex items-center rounded-full bg-violet-200 px-2 py-0.5 text-micro font-bold text-violet-900">
            비상장 벤처기업 임계 적용 (시총 40억)
          </span>
        )}
        {/* F-15·F-16 (2026-05-19) — 대차/사모펀드 자동 가산 적용 배지 */}
        {t.shareAugmentationApplied && (
          <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-micro font-bold text-amber-900">
            대차·사모펀드 자동 가산 ({t.augmentedShares?.toLocaleString() ?? 0}주)
          </span>
        )}
        {/* F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override 배지 */}
        {t.judgmentBasis && t.judgmentBasis !== "default" && (
          <span className="inline-flex items-center rounded-full bg-rose-200 px-2 py-0.5 text-micro font-bold text-rose-900">
            특수 판정 기준일 적용
          </span>
        )}
        {/* F-24 (2026-05-19) — 본인 미보유 강제 합산 배지 */}
        {t.forcedCombinedJudgment && (
          <span className="inline-flex items-center rounded-full bg-sky-200 px-2 py-0.5 text-micro font-bold text-sky-900">
            본인 미보유 → 특수관계인 합산 강제
          </span>
        )}
      </h4>
      <dl className="text-sm text-violet-800 space-y-1">
        <div>· 시장: <strong>{MARKET_LABEL[t.marketType]}</strong></div>
        <div>· 판정 기준일: {t.priorYearEndDate}</div>
        <div>· 임계 적용 시작: {t.fromDate}</div>
        <div>· 지분율 기준: <strong>{(t.shareRatio * 100).toFixed(1)}%</strong></div>
        {t.marketCap < Infinity && (
          <div>· 시총 기준: <strong>{t.marketCap.toLocaleString()}</strong></div>
        )}
        {/* Phase B (2026-05-19) — 적용 규칙 출처 명시 */}
        {t.ruleSource && (
          <div className="text-xs text-violet-600">
            · 적용 규칙: {RULE_SOURCE_LABEL[t.ruleSource]}
          </div>
        )}
        {/* F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 사유 명시 */}
        {t.judgmentBasis && t.judgmentBasis !== "default" && (
          <div className="text-xs text-rose-700 font-medium">
            · 판정 기준일 사유: {JUDGMENT_BASIS_LABEL[t.judgmentBasis]}
          </div>
        )}
        {/* F-24 (2026-05-19) — 본인 미보유 강제 합산 안내 */}
        {t.forcedCombinedJudgment && (
          <div className="text-xs text-sky-700 font-medium">
            · 직전사업연도 종료일 본인 미보유 → 특수관계 기타주주 합산하여 판정 (기획재정부 금융세제-327, 2020.12.10.)
          </div>
        )}
        <div className="pt-1 font-medium">
          판정:{" "}
          <strong>{isMajorTaxCategory(result.taxCategory) ? "대주주 해당" : "비대주주"}</strong>
        </div>
        {/* 비상장 벤처 미적용 시 안내 */}
        {isUnlisted && !t.isVentureRule && (
          <div className="text-xs text-violet-600 mt-1">
            ※ 벤처기업 주식의 시총 기준은 40억원 (§167의8①2호 나목 단서). 회사 분류에서 &quot;벤처기업&quot; 선택 시 자동 적용
          </div>
        )}
        {/* 상장 비과세 사유 표시 */}
        {result.isExempt && !isUnlisted && (
          <div className="text-xs text-violet-600 mt-1">→ 비과세 (§94①3 가목 단서)</div>
        )}
      </dl>
    </div>
  );
}
