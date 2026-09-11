"use client";

/**
 * FarmingDeductionDetailCard — 영농상속공제 펼침 (§18의3)
 * 기존 FarmingDeductionDetailRow 로직 흡수 + 펼침 인터페이스 추가
 * re-export: FarmingDeductionDetailRow 경로 보존 필요
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { FarmingDeductionDetail } from "@/lib/tax-engine/types/inheritance-farming.types";
import { ExpandButton } from "./shared";

function labelMatchKind(
  kind: "same_district" | "adjacent_district" | "within_30km" | "forest_manageable_area" | "fail" | null,
): string {
  switch (kind) {
    case "same_district":
      return "동일 시·군·구";
    case "adjacent_district":
      return "연접 시·군·구";
    case "within_30km":
      return "30km 직선거리";
    case "forest_manageable_area":
      return "산림지 통상 경영 지역 (사용자 명시)";
    case "fail":
      return "자동 미충족 (사용자 명시값 적용)";
    case null:
      return "미입력";
  }
}

/** 기존 FarmingDeductionDetailRow 인라인 컨텐츠 (펼침 없이 그대로 표시하는 레거시 인터페이스) */
function FarmingDetailContent({ detail }: { detail: FarmingDeductionDetail }) {
  if (!detail.evaluated) {
    return (
      <div className="mx-4 my-2 rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-2">
        <p className="text-caption text-violet-700 dark:text-violet-300">
          ⓘ 요건 미평가(요건 미입력 방식). Step4에서 영농상속공제 요건 입력을 활성화하면 자격을 자동 평가합니다.
        </p>
      </div>
    );
  }

  if (!detail.eligible && detail.appliedAssetValue > 0) {
    return (
      <div className="mx-4 my-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2 space-y-1">
        <p className="text-caption font-semibold text-amber-800 dark:text-amber-200">
          입력 자산 {formatKRW(detail.appliedAssetValue)} — 자격 미충족으로 공제 적용 불가
        </p>
        <ul className="space-y-0.5 text-micro text-amber-700 dark:text-amber-300 list-disc pl-4">
          {detail.ineligibleReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (detail.cappedDeduction === 0) {
    return (
      <div className="mx-4 my-2 text-caption text-gray-500 dark:text-gray-400">
        ⓘ {detail.eligible ? "영농 자산 미입력" : "자격 미충족 + 자산 미입력"}
      </div>
    );
  }

  const limit = detail.appliedLimit || 3_000_000_000;
  const capped = detail.appliedAssetValue > limit;
  return (
    <div className="mx-4 my-2 space-y-1">
      <div className="text-caption text-gray-600 dark:text-gray-400">
        ⓘ 영농자산 {formatKRW(detail.appliedAssetValue)}
        {` · 적용 한도 ${(limit / 100_000_000).toLocaleString("ko-KR")}억 (상속개시 연도 기준)`}
        {capped && ` → 한도 적용 ${formatKRW(detail.cappedDeduction)}`}
      </div>
      {detail.qualifiedHeirCount !== undefined && detail.totalHeirCount !== undefined && (
        <div className="text-micro text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 rounded p-2">
          부록 A — 자격 충족 상속인{" "}
          <span className="font-semibold">{detail.qualifiedHeirCount}명</span> / 전체{" "}
          {detail.totalHeirCount}명 (시행령 §16⑤ 본문)
        </div>
      )}
      {detail.residence && (
        <div className="text-micro text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 rounded p-2">
          {detail.residence.decedentMatchKind === null && detail.residence.heirMatchKind === null ? (
            <span>거주지: 사용자 명시 (자동 거주지 검증 미수행 — 좌표·코드 미입력)</span>
          ) : (
            <>
              §16②1호나 거주지 자동 검증:
              <span className="ml-1 font-semibold">
                피상속인 {labelMatchKind(detail.residence.decedentMatchKind)}
              </span>{" "}
              ·{" "}
              <span className="font-semibold">
                상속인 {labelMatchKind(detail.residence.heirMatchKind)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 새 인터페이스 — 펼침 버튼 포함 Row 패턴
// ============================================================

interface Props {
  detail?: FarmingDeductionDetail;
  triggerLabel: string;
  triggerValue: string;
}

export function FarmingDeductionDetailCard({ detail, triggerLabel, triggerValue }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm">{triggerValue}</span>
          {detail && <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />}
        </span>
      </div>

      {open && detail && <FarmingDetailContent detail={detail} />}
    </>
  );
}

// ============================================================
// 테스트 진입점 — «실제로 렌더되는» 본문 (IG-152)
//
// 종전에는 같은 이름의 **복제본**(FarmingDeductionDetailRowExport.tsx)이 따로 있었고
// 영농 UI 테스트 12건이 전부 그 복제본만 렌더했다. 복제본은 한도를 30억으로 고정해,
// 실렌더 카드의 연도별 한도(30억/15억/5억) 표시가 깨져도 테스트가 초록이었다.
// 안전망이 «다른 컴포넌트»를 보고 있었던 셈이라 복제본과 re-export를 제거했다.
// ============================================================

export function FarmingDeductionDetailRowContent({
  detail,
}: {
  detail?: FarmingDeductionDetail;
}) {
  if (!detail) return null;
  return <FarmingDetailContent detail={detail} />;
}
