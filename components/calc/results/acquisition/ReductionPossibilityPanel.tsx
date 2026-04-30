"use client";

/**
 * ReductionPossibilityPanel — "추가 감면·배제 가능성" 패널
 *
 * 계산 결과에서 미적용된 감면·배제 항목 중 사용자가 확인하지 않은 것들을 안내.
 * 각 항목 클릭 → 해당 입력 단계로 복귀 (onGoToStep).
 *
 * 표시 조건:
 * - 가능한 항목이 1개 이상일 때만 렌더
 */

import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";

interface Props {
  result: AcquisitionTaxResult;
  /** 단계로 이동하는 콜백 (0-based index) */
  onGoToStep?: (step: number) => void;
}

interface PossibleItem {
  id: string;
  label: string;
  description: string;
  step: number;
  badge?: string;
}

export function ReductionPossibilityPanel({ result, onGoToStep }: Props) {
  const items: PossibleItem[] = [];

  // 생애최초 감면 미적용 (주택 유상취득이고 감면 미적용 시)
  if (
    result.propertyType === "housing" &&
    result.acquisitionCause === "purchase" &&
    result.reductionType !== "first_home" &&
    result.reductionAmount === 0
  ) {
    items.push({
      id: "first_home",
      label: "생애최초 주택 감면",
      description: "본인·배우자 모두 무주택이면 최대 200만원(소형 300만원) 감면",
      step: 5,
      badge: "최대 200만원",
    });
  }

  // 일시적 2주택 (2주택 + 중과 적용 + 일시적2주택 미선택)
  if (
    result.isSurcharged &&
    result.surchargeReason?.includes("2주택") &&
    !result.surchargeReason?.includes("일시적")
  ) {
    items.push({
      id: "temporary_two_house",
      label: "일시적 2주택 중과 배제",
      description: "종전 주택 처분 예정이면 중과 미적용 — 처분기한 3년 내 처분 조건",
      step: 3,
      badge: "중과 배제 가능",
    });
  }

  // 자경농지 감면 미적용
  if (
    (result.propertyType === "land_farmland" || result.propertyType === "land") &&
    result.reductionType !== "self_cultivation" &&
    result.reductionAmount === 0 &&
    result.selfCultivationReductionDetail?.isEligible === false
  ) {
    items.push({
      id: "self_cultivation",
      label: "자경농지 50% 감면",
      description: "2년 이상 영농 + 거주지 요건 충족 시 취득세 50% 감면",
      step: 5,
      badge: "50% 감면",
    });
  }

  // 시가표준액 1억/2억 이하 중과 배제 — 중과 적용 + 다주택 중과인 경우 안내
  if (
    result.isSurcharged &&
    (result.rateType === "surcharge_regulated")
  ) {
    items.push({
      id: "low_value_exclusion",
      label: "시가표준액 1억/2억 이하 중과 배제 여부 확인",
      description: "전체 주택 시가표준액이 수도권 1억 / 비수도권 2억 이하이면 다주택 중과 배제",
      step: 3,
    });
  }

  // 세율특례 §15 미확인 (상속인 경우)
  if (
    result.acquisitionCause === "inheritance" &&
    !result.specialRateDetail
  ) {
    items.push({
      id: "special_rate_inheritance",
      label: "상속 1가구 1주택 세율특례 (§15①2호)",
      description: "상속인이 1가구 1주택자이면 세율 0.8%로 감면",
      step: 4,
      badge: "0.8% 특례",
    });
  }

  // 무상취득 중과 단서 배제 미확인 (증여 + 중과 적용)
  if (
    (result.acquisitionCause === "gift" || result.acquisitionCause === "burdened_gift") &&
    result.isSurcharged
  ) {
    items.push({
      id: "gift_exclusion",
      label: "무상취득 중과 배제 단서 여부 확인",
      description: "증여자가 1세대 1주택자이고 가족 관계(계부모·의붓자녀 포함)면 중과 배제",
      step: 3,
    });
  }

  // 표시할 항목이 없으면 렌더하지 않음
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-amber-600 text-sm font-bold">!</span>
        <p className="text-xs font-semibold text-amber-800">
          추가 감면·배제 가능성 확인
        </p>
      </div>
      <p className="text-xs text-amber-700">
        이 사례에서 적용 가능할 수 있는 항목입니다. 해당 단계로 이동하여 확인하세요.
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onGoToStep?.(item.step)}
              className="w-full text-left rounded-md border border-amber-200 bg-white/70 px-3 py-2 hover:bg-amber-50 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-900 group-hover:text-amber-700">
                    {item.label}
                    {item.badge && (
                      <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        {item.badge}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                </div>
                {onGoToStep && (
                  <span className="shrink-0 text-xs text-amber-600 group-hover:text-amber-800">
                    Step {item.step + 1} →
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
