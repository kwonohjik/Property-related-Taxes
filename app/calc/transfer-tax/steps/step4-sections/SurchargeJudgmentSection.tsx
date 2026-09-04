"use client";

/**
 * SurchargeJudgmentSection — ④ 주택수·중과 판정 (**중과 트랙**, Step 4 섹션).
 *
 * 800줄 정책 분리(2026-09-02). 호출측(Step4)이 `!surchargeSuspended` 게이트를 소유하고,
 * 이 컴포넌트는 그 분기의 본문만 그린다. 한시배제 창 안에서는 대신
 * `HouseCountExemptionInputs`만 뜬다 — 두 분기는 **배타**여야 한다(같은 배열을 두 컴포넌트가
 * 각각 patch하는 last-write-wins 방지).
 *
 * 비과세(§89①3호) 주택수 입력 3종은 `HouseCountExemptionInputs`로 뽑았다 — 두 분기가
 * 같은 JSX를 복제해 한쪽만 고쳐 갈라지는 것이 §155②③·§89② 결함의 원인이었다.
 * 여기 남는 것은 **중과 전용**인 「양도일 기준 조정대상지역」과 그 안내 팁이다.
 */

import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { HouseCountExemptionInputs } from "./HouseCountExemptionInputs";
import { isHousingLike } from "@/lib/calc/housing-like-asset";
import {
  SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW,
  isWithinSurchargeSuspensionWindow,
} from "@/lib/tax-engine/legal-codes/transfer";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 한시배제 종료일 표시 문자열 — 상수 단일 출처에서 파생(재연장 개정 시 문구 자동 추종, 하드코딩 금지) */
const SUSPENSION_END_KO = (() => {
  const [y, m, d] = SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end.split("-");
  return `${y}.${Number(m)}.${Number(d)}.`;
})();

export function SurchargeJudgmentSection({
  form,
  onChange,
  primaryKind,
  primaryAcquisitionDate,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  primaryKind: string;
  primaryAcquisitionDate: string;
}) {
  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
      <SectionHeader title="④ 주택수·중과 판정" description="세대 전체 보유 주택·양도일 조정대상지역으로 다주택 중과를 판정합니다" />
      <div className="space-y-3">
        {/*
          🔴 2026-08-26 이동(C1-01): 주택 1채 미만 세대의 분양권·입주권 목록은 **② 비과세 판정**
             섹션으로 옮겼다. 이 자리는 중과 트랙이라 한시배제 기간(2022-05-10~2026-05-09)에는
             섹션 전체가 안내 카드로 대체되어 사라지는데, 「소득세법」 §89②(주택 + 권리 보유
             세대의 주택 양도 → §89①3호 배제)은 **중과와 무관한 비과세 규칙**이라 그때도
             선언 경로가 있어야 한다.
          ⚠️ 2채 이상에서는 아래 `HousesListSection`이 같은 `form.presaleRights`를 렌더한다.
             두 벌이 뜨면 같은 배열을 두 컴포넌트가 각각 patch해 마지막 것이 이긴다 —
             그래서 ②는 `< 2`에서만 연다.
        */}

        {/* 비과세 판정 주택수 입력 3종 (한시배제 분기와 공용 — 두 분기는 배타) */}
        {isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2 && (
          <HouseCountExemptionInputs form={form} onChange={onChange} />
        )}

        {/* 양도일 기준 조정대상지역 — 중과세 판단 기준 (주택 전용) */}
        {primaryKind === "housing" && (
          <ToggleCard
            checked={form.isRegulatedArea}
            onCheckedChange={(v) => onChange({ isRegulatedArea: v, isRegulatedAreaTouched: true })}
            title="양도일 기준 조정대상지역"
            tone="rose"
          />
        )}

        {/* 메시지 ① 중과 검토 안내 — 주택 + 양도시 조정대상이면 항상(1주택 포함, 단순 주의환기).
            한시배제 충족(B1: surchargeSuspended)이면 ④ 섹션 자체가 sky 안내 카드로 대체되어 이 팁은
            미도달 — 여기서는 B2(윈도우 내·보유 2년 미만)·B3(종료일 이후)의 혼선만 보강.
            (plan: step4-regulated-tip-surcharge-suspension) */}
        {primaryKind === "housing" && form.isRegulatedArea && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-900">
            <p className="font-medium">⚠️ 양도일 현재 조정대상지역</p>
            <p className="mt-0.5 text-caption leading-relaxed text-amber-800">
              조정대상지역 주택 양도는 중과세 적용 여부를 검토하세요.
            </p>
            {/* B2: 양도일은 한시배제 윈도우 내이나 보유 2년 미만 (충족 시 섹션 대체로 미도달) */}
            {isWithinSurchargeSuspensionWindow(form.transferDate) && !!primaryAcquisitionDate && (
              <p className="mt-0.5 text-caption leading-relaxed text-amber-800">
                보유 2년 미만은 다주택 중과 한시배제(§167의3①12의2) 대상이 아닙니다(단기양도세율과
                비교 적용).
              </p>
            )}
            {/* B3: 양도일이 한시배제 종료일 이후 — 계약·허가 기반 경과조치 가능성 안내(자동판정 미지원) */}
            {!!form.transferDate &&
              form.transferDate > SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end && (
                <p className="mt-0.5 text-caption leading-relaxed text-amber-800">
                  {SUSPENSION_END_KO}까지 매매계약 체결(계약금 수령)·토지거래허가 신청분은
                  경과조치로 중과가 배제될 수 있습니다(§167의3①12의2 나·다, §167의10①12의2 나·다).
                  아래 ④ 중과 판정 &gt; 중과 경과조치 조건 입력에서 나·다목을 판정합니다.
                </p>
              )}
          </div>
        )}
      </div>
    </section>
  );
}
