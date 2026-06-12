"use client";

/**
 * ComprehensiveFilingFormSection — 서식 4종 컨테이너
 *
 * 설계: ui.design §2
 * - 펼침 토글: 화면에서 hidden, 클릭 시 expand, 인쇄 시 항상 표시 (print:block)
 * - CSS-only 인쇄: useEffect·isPrinting 금지 → Tailwind print: 클래스만
 * - 게이팅: main·buppyo3 항상 / buppyo5 = taxCap 존재 / buppyo5sub = previousYearEquivalent 존재
 * - 인적사항 패널: 로컬 useState만 (주민번호 민감정보)
 *
 * print:break-after-page 각 서식 구분 (CSS 인쇄 페이지 분할)
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FilingFormPersonalInfoPanel } from "./FilingFormPersonalInfoPanel";
import { ComprehensiveFilingFormMain } from "./ComprehensiveFilingFormMain";
import { ComprehensiveFilingFormBuppyo3 } from "./ComprehensiveFilingFormBuppyo3";
import { ComprehensiveFilingFormBuppyo5 } from "./ComprehensiveFilingFormBuppyo5";
import { ComprehensiveFilingFormBuppyo5Sub } from "./ComprehensiveFilingFormBuppyo5Sub";

// ============================================================
// Props
// ============================================================

interface Props {
  result: ComprehensiveTaxResult;
  /** store의 landArea (서식 표시 전용, 엔진 미전송) */
  landArea?: string;
  /** store의 area (건물면적 서식 표시 전용) */
  buildingArea?: string;
  /**
   * 직전연도 세액 직접입력 값 (previousYearTotalTax)
   * 자동모드: undefined → previousYearEquivalent 사용
   * 직접모드: 이 값 사용 (b5 ⑯에만)
   */
  previousYearTotalTaxDirect?: number;
}

// ============================================================
// 메인
// ============================================================

export function ComprehensiveFilingFormSection({
  result,
  landArea,
  buildingArea,
  previousYearTotalTaxDirect,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // 게이팅
  const showBuppyo5 = !!result.taxCap;
  const showBuppyo5Sub = !!result.previousYearEquivalent;

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/20 dark:bg-blue-950/10">
      {/* 섹션 헤더 — 화면에서 펼침 토글 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-blue-800 dark:text-blue-200 print:hidden"
      >
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          신고서 서식 (2022년판)
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
            — 화면에서 펼쳐 확인·인쇄 가능
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {/* 현행판 상이 안내 */}
      <div className="px-4 pb-2 text-xs text-amber-700 dark:text-amber-400 print:hidden">
        ※ 현행 시행규칙 서식(2025.3.21 개정)과 별지 번호·양식이 다를 수 있습니다.
        국세청 홈택스 최신 서식과 비교하여 사용하세요.
      </div>

      {/* 컨텐츠 영역: 화면에서 hidden (expanded=true 시 block), 인쇄 시 항상 block */}
      <div
        className={`${expanded ? "block" : "hidden"} print:block px-4 pb-4 space-y-6`}
      >
        {/* 인적사항 */}
        <FilingFormPersonalInfoPanel />

        {/* 구분선 (화면 전용) */}
        <hr className="border-blue-200 print:hidden" />

        {/* 신고서 본체 */}
        <ComprehensiveFilingFormMain result={result} />

        {/* 구분선 (화면 전용) */}
        <hr className="border-blue-200 print:hidden" />

        {/* 별지3호부표 */}
        <ComprehensiveFilingFormBuppyo3
          result={result}
          landArea={landArea}
          buildingArea={buildingArea}
        />

        {/* 별지5호 — taxCap 있을 때만 */}
        {showBuppyo5 && (
          <>
            <hr className="border-blue-200 print:hidden" />
            <ComprehensiveFilingFormBuppyo5
              result={result}
              previousYearTotalTaxDirect={previousYearTotalTaxDirect}
            />
          </>
        )}

        {/* 별지5호부표 — previousYearEquivalent 있을 때만 (자동모드) */}
        {showBuppyo5Sub && (
          <>
            <hr className="border-blue-200 print:hidden" />
            <ComprehensiveFilingFormBuppyo5Sub result={result} />
          </>
        )}
      </div>
    </div>
  );
}
