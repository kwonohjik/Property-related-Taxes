"use client";

/**
 * 상속 부동산 취득가액 의제 섹션 (의제취득일 분기)
 *
 * 상속개시일 기준으로 의제취득일(1985.1.1.) 전/후 자동 분기:
 *   - 전 (pre-deemed):  소령 §176조의2 ④ — max(환산취득가, 피상속인 실가×물가상승률)
 *   - 이후 (post-deemed): 소령 §163 ⑨   — 상속세 신고가액
 *
 * 상속개시일은 위쪽 CompanionAcqInheritanceBlock에서 입력한 값(acquisitionDate)을
 * CompanionAssetCard가 inheritanceStartDate로 자동 동기화하므로 여기서 중복 입력하지 않는다.
 */

import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PreDeemedInputs } from "./inheritance/PreDeemedInputs";
import { PostDeemedInputs } from "./inheritance/PostDeemedInputs";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// 1985-01-01 (UTC) — 소득세법 부칙(1985.1.1. 개정) 의제취득일
const DEEMED_DATE_STR = "1985-01-01";

const LAW_BADGE_CLASS =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
  "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 " +
  "hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors shrink-0 whitespace-nowrap cursor-pointer";

function computeMode(
  dateStr: string,
): "pre-deemed" | "post-deemed" | null {
  if (!dateStr) return null;
  return dateStr < DEEMED_DATE_STR ? "pre-deemed" : "post-deemed";
}

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — PreDeemedInputs의 1990 토지 환산 계산에 필요 */
  transferDate?: string;
}

export function InheritedAcquisitionDeemedSection({ asset, onChange, transferDate }: Props) {
  // inheritanceStartDate가 없으면 acquisitionDate로 fallback
  // (CompanionAssetCard에서 동기화하지만 기존 세션 데이터 호환)
  const effectiveDate = asset.inheritanceStartDate || asset.acquisitionDate;
  const mode = asset.inheritanceMode ?? computeMode(effectiveDate);

  // 모드가 없으면(날짜 미입력) 섹션 전체를 숨김
  if (!mode) return null;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-3">
      {/* 헤더 — 상속개시일 + 모드 배지 + 법령 링크 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold shrink-0">취득가액 의제 특례 (소령 §176조의2④·§163⑨)</p>
          {mode === "pre-deemed" && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
              의제취득일 이전
            </span>
          )}
          {mode === "post-deemed" && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">
              의제취득일 이후
            </span>
          )}
        </div>
        <LawArticleModal
          legalBasis="소득세법시행령 §163"
          label="소령 §163 ⑨"
          className={LAW_BADGE_CLASS}
        />
      </div>

      {/* 상속개시일 표시 (읽기 전용 — 위쪽 입력값 자동 반영) */}
      <p className="text-[11px] text-muted-foreground">
        상속개시일 {effectiveDate} — 의제취득일(1985.1.1.) 기준{" "}
        {mode === "pre-deemed"
          ? "환산취득가 또는 피상속인 실가 × 물가상승률 적용"
          : "상속세 신고가액을 취득가로 인정"}
      </p>

      {/* 분기별 입력 */}
      {mode === "pre-deemed" && (
        <PreDeemedInputs asset={asset} onChange={onChange} transferDate={transferDate} />
      )}
      {mode === "post-deemed" && (
        <PostDeemedInputs asset={asset} onChange={onChange} />
      )}
    </div>
  );
}
