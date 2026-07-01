"use client";

/**
 * HouseCountVerifier — 세대 카운트 검산기 컴포넌트
 *
 * - 엔진 결과의 houseCountDetail 표시
 * - 제외 항목 내역 표시
 * - 한시 특례 6종 체크박스 안내
 * - 미성년 별도세대 인정 불가 강조
 */

import { useState } from "react";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";

interface Props {
  result: AcquisitionTaxResult;
}

// ============================================================
// 제외 항목 레이블
// ============================================================

const EXCLUSION_TYPE_LABELS: Record<string, string> = {
  low_standard_value: "시가표준액 1억/2억 이하",
  public_housing: "공공주택사업자 매입임대",
  elderly_welfare: "노인복지주택",
  cultural_heritage: "문화유산·천연기념물",
  public_supported_rental: "공공지원민간임대주택",
  daycare: "가정어린이집",
  reit: "부동산투자회사 매입",
  demolition: "멸실 목적 주택",
  unsold_contractor: "미분양 시공자 취득",
  debt_repayment: "채권변제 취득",
  rural_house: "농어촌 주택",
  employee_rental: "사원임대용",
  inherited_5yr: "상속 5년 미경과",
  hansi_new_build: "한시특례 신축",
  hansi_lease: "한시특례 임대등록",
  hansi_unsold: "한시특례 미분양",
  right_owned: "입주권·분양권 보유",
  low_officetel: "시가표준액 1억 이하 오피스텔",
  low_land_only: "시가표준액 1억 이하 부속토지",
  pre_marriage_right: "혼인 전 분양권 (배우자)",
};

// ============================================================
// 메인 컴포넌트
// ============================================================

export function HouseCountVerifier({ result }: Props) {
  const [open, setOpen] = useState(false);
  const detail = result.houseCountDetail;

  if (!detail) {
    return (
      <div className="rounded-lg border border-gray-200 bg-muted/20 p-3 text-sm text-muted-foreground">
        보유 주택 목록을 입력하면 주택 수 자동 산정 결과가 표시됩니다.
      </div>
    );
  }

  const excludedCount = detail.totalCount - detail.effectiveCount;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/30">
      {/* 헤더 요약 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-sky-800">주택 수 산정 결과</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            실효 주택 수: <strong className="text-sky-700">{detail.effectiveCount}주택</strong>
            {excludedCount > 0 && ` (보유 ${detail.totalCount}주택 중 ${excludedCount}주택 제외)`}
          </p>
        </div>
        <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(open)}</span>
      </button>

      {open && (
        <div className="border-t border-sky-200 px-4 py-3 space-y-3">
          {/* 기준일 */}
          <div className="text-xs text-muted-foreground">
            산정 기준일: <strong>{detail.referenceDate}</strong>
            {detail.pendingAcquisitionIncluded && " (취득 대상 포함)"}
          </div>

          {/* 제외 내역 */}
          {detail.excludedDetails && detail.excludedDetails.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-sky-700 mb-2">제외 항목</p>
              <div className="space-y-1">
                {detail.excludedDetails.map((excl, i) => (
                  <div key={i} className="flex items-start gap-2 rounded bg-sky-50/70 px-2 py-1.5 text-xs">
                    <span className="text-sky-500 shrink-0 mt-0.5">✓</span>
                    <div>
                      <span className="font-medium">
                        {EXCLUSION_TYPE_LABELS[excl.reason] ?? excl.reason}
                      </span>
                      {excl.description && (
                        <span className="text-muted-foreground ml-1">— {excl.description}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 세대 별도 인정 정보 */}
          {detail.separateHousehold && (
            <div className="rounded bg-violet-50/70 border border-violet-200 p-2 text-xs">
              <p className="font-semibold text-violet-700 mb-1">세대 별도 인정</p>
              <p className="text-muted-foreground">{detail.separateHousehold.description ?? detail.separateHousehold.reason}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                미성년자는 소득 충족 시에도 별도 세대 인정 불가 (§28의3②1호 단서)
              </p>
            </div>
          )}

          {/* 신탁 주택 */}
          {detail.trustedHouseCount && detail.trustedHouseCount > 0 && (
            <div className="rounded bg-sky-50/70 border border-sky-200 p-2 text-xs">
              신탁재산 위탁자 주택: {detail.trustedHouseCount}채 가산 (§13의3 1호)
            </div>
          )}

          {/* 일시적 2주택 경고 */}
          {detail.temporaryTwoHouseWarning && (
            <div className="rounded bg-amber-50/70 border border-amber-200 p-2 text-xs text-amber-700">
              {detail.temporaryTwoHouseWarning}
            </div>
          )}

          {/* 경고 */}
          {detail.warnings && detail.warnings.length > 0 && (
            <div className="space-y-1">
              {detail.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">• {w}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
