"use client";

/**
 * SurchargeFlowDiagram — 중과 흐름도 시각화 컴포넌트
 *
 * 8단계 중과 판정 흐름:
 *   [1] 사치성 판정 (§13⑤·⑥·⑦)
 *   [2] 법인 주택 12% (§13의2①1호)
 *   [3] 시가표준액 1억/2억 이하 배제 (§28의2①1호)
 *   [4] §13의2④ 지정 전 계약 보호
 *   [5] 일시적 2주택 (§28의5)
 *   [6] 주택 수 산정 (§28의4 — 6차원 매트릭스)
 *   [7-8] 다주택 중과 적용 여부
 *
 * 상태별 시각화:
 *   - 중과 적용 단계: rose 배경/텍스트
 *   - 중과 배제 결론 단계 (skip·배제): sky/emerald 배경 + "배제" 배지
 *   - 미해당·통과 단계: gray 배경 (muted)
 *
 * 항상 렌더 — 중과 미적용 케이스에서도 "왜 기본세율인지" 시각화.
 */

import { useState } from "react";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface Props {
  result: AcquisitionTaxResult;
}

type StepStatus = "applied" | "excluded" | "irrelevant";

interface FlowStep {
  id: string;
  label: string;
  legalBasis: string;
  status: StepStatus;
  detail?: string;
}

function buildFlowSteps(result: AcquisitionTaxResult): FlowStep[] {
  const steps: FlowStep[] = [];

  // [1] 사치성
  const luxuryApplied = result.rateType === "surcharge_luxury";
  steps.push({
    id: "luxury",
    label: "사치성 재산 판정",
    legalBasis: "지방세법 §13①",
    status: luxuryApplied ? "applied" : "irrelevant",
    detail: luxuryApplied
      ? `사치성 중과 적용 (세율: ${(result.appliedRate * 100).toFixed(5).replace(/\.?0+$/, "")}%)`
      : "해당 없음",
  });

  // [2] 법인 주택 12%
  const isCorpSurcharge = result.rateType === "surcharge_corporate";
  steps.push({
    id: "corp",
    label: "법인 주택 12% 중과",
    legalBasis: "지방세법 §13의2①1호",
    status: isCorpSurcharge ? "applied" : "irrelevant",
    detail: isCorpSurcharge
      ? "법인 주택 취득 — 12% 중과세율 적용"
      : "해당 없음",
  });

  // [3] 시가표준액 이하 배제
  const lowValueExcluded = result.warnings.some(w =>
    w.includes("1억") || w.includes("2억") || w.includes("시가표준액")
  );
  steps.push({
    id: "low_value",
    label: "시가표준액 1억/2억 이하 중과 배제",
    legalBasis: "지방세법시행령 §28의2①1호",
    status: lowValueExcluded ? "excluded" : "irrelevant",
    detail: lowValueExcluded
      ? "시가표준액 한도 이하 — 중과 배제"
      : "해당 없음 (한도 초과 또는 비해당)",
  });

  // [4] §13의2④ 지정 전 계약 보호
  const preRegApplied = result.surchargeReason?.includes("지정고시일 이전") || false;
  steps.push({
    id: "pre_regulation",
    label: "조정지역 지정 전 계약 보호",
    legalBasis: "지방세법 §13의2④",
    status: preRegApplied ? "excluded" : "irrelevant",
    detail: preRegApplied
      ? "지정고시일 이전 계약 + 계약금 증빙 — 비조정지역 취득 간주"
      : "해당 없음",
  });

  // [5] 일시적 2주택
  const isTempTwoHouse = result.warnings.some(w =>
    w.includes("일시적") || w.includes("처분기한")
  );
  steps.push({
    id: "temp_two",
    label: "일시적 2주택 중과 배제",
    legalBasis: "지방세법시행령 §28의5",
    status: isTempTwoHouse ? "excluded" : "irrelevant",
    detail: isTempTwoHouse
      ? "일시적 2주택 — 처분기한 내 처분 시 중과 미적용"
      : "해당 없음",
  });

  // [6] 주택 수 산정
  const houseCountDetail = result.houseCountDetail;
  steps.push({
    id: "house_count",
    label: "주택 수 산정",
    legalBasis: "지방세법시행령 §28의4",
    status: houseCountDetail ? "applied" : "irrelevant",
    detail: houseCountDetail
      ? `산정 ${houseCountDetail.effectiveCount}주택 (보유 ${houseCountDetail.totalCount}주택 중 제외 ${houseCountDetail.totalCount - houseCountDetail.effectiveCount}주택)`
      : "직접 입력 방식",
  });

  // [7-8] 다주택 중과 최종
  const isSurcharged = result.isSurcharged;
  const isMultiHouseSurcharge = isSurcharged && result.rateType === "surcharge_regulated";
  steps.push({
    id: "multi_house",
    label: "다주택 중과 적용",
    legalBasis: "지방세법 §13의2",
    status: isMultiHouseSurcharge ? "applied" : "excluded",
    detail: isMultiHouseSurcharge
      ? `중과 적용 — ${(result.appliedRate * 100).toFixed(0)}% (${result.surchargeReason ?? ""})`
      : `기본세율 적용 — ${(result.appliedRate * 100).toFixed(5).replace(/\.?0+$/, "")}%`,
  });

  return steps;
}

// ============================================================
// 단계별 스타일 헬퍼
// ============================================================

function getStepStyle(status: StepStatus) {
  if (status === "applied") {
    return {
      container: "bg-rose-100 border border-rose-300 text-rose-900",
      badge: "bg-rose-200 text-rose-800",
      badgeLabel: "적용",
      numberBg: "bg-rose-500 text-white",
    };
  }
  if (status === "excluded") {
    return {
      container: "bg-sky-50 border border-sky-300 text-sky-900",
      badge: "bg-sky-200 text-sky-800",
      badgeLabel: "배제",
      numberBg: "bg-sky-500 text-white",
    };
  }
  return {
    container: "bg-white/60 border border-gray-200 text-muted-foreground",
    badge: "bg-gray-100 text-gray-500",
    badgeLabel: "미해당",
    numberBg: "bg-gray-200 text-gray-500",
  };
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function SurchargeFlowDiagram({ result }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const flowSteps = buildFlowSteps(result);

  const isSurcharged = result.isSurcharged;

  return (
    <div className={`rounded-lg border p-4 ${
      isSurcharged
        ? "border-rose-200 bg-rose-50/30"
        : "border-gray-200 bg-gray-50/30"
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className={`text-sm font-semibold ${isSurcharged ? "text-rose-800" : "text-gray-700"}`}>
          중과세율 결정 흐름
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isSurcharged
            ? "bg-rose-200 text-rose-800"
            : "bg-emerald-100 text-emerald-800"
        }`}>
          {isSurcharged ? "중과 적용" : "기본세율 적용"}
        </span>
      </div>

      <div className="space-y-2">
        {flowSteps.map((step, idx) => {
          const style = getStepStyle(step.status);
          return (
            <div key={step.id}>
              <button
                type="button"
                onClick={() => setExpanded(expanded === step.id ? null : step.id)}
                className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${style.container}`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${style.numberBg}`}>
                  {idx + 1}
                </span>
                <span className="flex-1 font-medium">{step.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${style.badge}`}>
                  {style.badgeLabel}
                </span>
                <span className="text-muted-foreground text-xs">
                  {expanded === step.id ? "▲" : "▼"}
                </span>
              </button>

              {expanded === step.id && (
                <div className="mx-3 rounded-b-md border border-t-0 border-gray-200 bg-white/80 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                  <div className="mt-1">
                    <LawArticleModal legalBasis={step.legalBasis} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isSurcharged && (
        <p className="mt-3 text-xs text-muted-foreground">
          위 판정 과정에서 중과 조건이 충족되지 않아 기본세율이 적용됩니다.
          sky 색상 단계는 중과를 배제한 조건입니다.
        </p>
      )}
    </div>
  );
}
