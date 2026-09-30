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
import type { ExclusionReason, SeparateHouseholdReason } from "@/lib/tax-engine/house-count/types";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";

interface Props {
  result: AcquisitionTaxResult;
}

// ============================================================
// 제외 항목 레이블
// ============================================================

/**
 * 🔑 키는 엔진 사유값(`ExclusionReason`) 그대로다 — 종전 키(`low_standard_value`·`inherited_5yr` 등)는
 *    엔진이 내는 값과 달라 화면에 내부 id가 그대로 나왔다. `satisfies`로 **누락**을 컴파일러가 잡는다.
 */
const EXCLUSION_TYPE_LABELS = {
  low_value_metro: "시가표준액 1억 이하 (수도권)",
  low_value_non_metro: "시가표준액 2억 이하 (수도권 밖)",
  elder_housing: "노인복지주택",
  cultural_heritage: "문화유산·천연기념물",
  farmland_rural: "농어촌 주택",
  unsold_apt_non_metro: "수도권 밖 미분양 아파트",
  unsold_constructor: "멸실 목적 미분양 시공자 취득",
  creditor_acquisition: "채권변제 취득",
  public_supported_lease: "공공지원민간임대주택",
  population_decline_lease: "인구감소지역 임대주택",
  staff_rental: "사원임대용",
  inheritance_under_5yr: "상속 5년 미경과",
  spouse_pre_marriage_house: "배우자의 혼인 전 주택 (혼인 전 분양권으로 취득)",
  spouse_not_in_household_at_right_date: "배우자 주택 — 권리취득일 현재 세대원 아님 (2023.3.14. 전 취득)",
  same_day_ordered_after_pending: "같은 날 취득 — 취득하는 주택 뒤로 정함",
  hansi_new_build: "한시특례 신축",
  hansi_lease_registered: "한시특례 임대등록",
  hansi_unsold_apt: "한시특례 미분양",
  low_value_office: "시가표준액 1억 이하 오피스텔",
  pre_2020_08_12_right_office: "2020.8.12. 전 취득·계약 입주권·분양권·오피스텔",
  acquired_after_reference_date: "권리취득일 뒤 취득",
  joint_inheritance_not_owner: "공동상속 — 소유자로 보지 않는 상속인",
  pending_hansi_new_build: "취득 주택 — 한시특례 신축",
  pending_hansi_lease: "취득 주택 — 한시특례 임대등록",
  pending_hansi_unsold: "취득 주택 — 한시특례 미분양",
} satisfies Record<ExclusionReason, string>;

/**
 * 🔑 D-3 — `description`이 없으면 `reason`(내부 id)이 그대로 화면에 나왔다
 *    (`feedback_no_internal_id_in_result`). 엔진은 4종 모두 항상 `description`을 채우지만
 *    (`lib/tax-engine/house-count/household.ts`), 화면 층에서도 같은 불변식을 지킨다 —
 *    `satisfies`로 신설 사유 누락을 컴파일러가 잡는다.
 */
const SEPARATE_HOUSEHOLD_REASON_LABELS = {
  under30_income: "30세 미만 자녀 — 소득 요건 충족 (§28의3② 1호)",
  over65_cohabitation: "65세 이상 직계존속 동거봉양 합가 (§28의3② 2호)",
  overseas_90days: "90일 이상 해외 출국 (§28의3② 3호)",
  relocate_60days: "취득 후 60일 이내 주소 이전 (§28의3② 4호)",
} satisfies Record<SeparateHouseholdReason, string>;

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
                        {EXCLUSION_TYPE_LABELS[excl.reason] ?? "기타 제외 사유"}
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
              <p className="text-muted-foreground">
                {detail.separateHousehold.description ??
                  (detail.separateHousehold.reason
                    ? SEPARATE_HOUSEHOLD_REASON_LABELS[detail.separateHousehold.reason]
                    : "세대 별도 인정 사유")}
              </p>
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
