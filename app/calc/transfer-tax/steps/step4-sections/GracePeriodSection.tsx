"use client";

/**
 * GracePeriodSection — 다주택 중과 한시 유예 경과조치(§167의3①12의2 나·다목) 입력 (Step 4 · 주택 목록 하단)
 *
 * `HousesListSection.tsx`에서 분리했다(2026-09-29 — 800줄 정책, 공고 전 매매계약 섹션 추가로 초과).
 * 코드는 옮기기만 했다 — 동작 변경 없음. 노출 게이트는 호출부(`gracePeriodInScope`).
 */

import { useMemo } from "react";
import { meetsSurchargeSuspensionHolding } from "@/lib/tax-engine/tax-utils";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes/transfer-house";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  checkGracePeriodExemption,
  transitionExemptionMonths,
} from "@/lib/tax-engine/multi-house-surcharge-exclusion";
import { SURCHARGE_TRANSITION } from "@/lib/tax-engine/legal-codes";

// ============================================================
// gracePeriod 섹션 (중과세 한시 유예 2022.5.10~2026.5.9)
// ============================================================

interface GracePeriodSectionProps {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}

/** YYYY-MM-DD 표시 헬퍼 (Date → 문자열) */
function fmtYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function GracePeriodSection({ form, onChange }: GracePeriodSectionProps) {
  const gp = form.gracePeriod;
  const isOn = gp !== undefined;
  // 양도 주택(대표 자산) 소재지 법정동코드 — 나목4) 표 4/6개월 판정 기준 (④⑬ 기존 primary.regionCode 단일소스)
  const sellingRegionCode = form.assets?.[0]?.regionCode || undefined;
  const months = transitionExemptionMonths(sellingRegionCode);

  function handleToggle(v: boolean) {
    if (!v) {
      // OFF: gracePeriod = undefined (직접 set — useEffect 미러링 금지)
      onChange({ gracePeriod: undefined });
    } else {
      // ON: 기본 객체 초기화 — 신규 4필드(나·다목 §167의3①12의2)
      onChange({
        gracePeriod: {
          contractDate: "",
          isLandPermitTarget: undefined,
          permitApplicationDate: undefined,
          permitGranted: false,
          depositReceiptConfirmed: false,
        },
      });
    }
  }

  function patchGp(patch: Partial<NonNullable<TransferFormData["gracePeriod"]>>) {
    if (!gp) return;
    onChange({ gracePeriod: { ...gp, ...patch } });
  }

  /**
   * 기한 미리보기 — 엔진 판정 함수 재사용(단일 진실 소스, 드리프트 방지).
   *
   * 🔴 **엔진의 바깥 게이트도 함께 본다** (2026-09-07 대장 재대조).
   *    `multi-house-surcharge-exclusion.ts:462`는 「양도 주택 보유기간 **2년 이상**」
   *    (§167의3①12의2 본문 · §95④ 기산)을 통과해야 `checkGracePeriodExemption`에 **도달한다**.
   *    미리보기는 그 함수만 직접 불러 게이트를 건너뛰었고, 그래서 보유 2년 미만이라
   *    엔진이 중과를 적용하는 케이스에도 초록색 「충족 — 중과 경과조치 배제 대상」을 띄웠다.
   */
  const preview = useMemo(() => {
    if (!gp || !gp.contractDate || gp.isLandPermitTarget === undefined) return null;
    const contractDate = new Date(gp.contractDate);
    if (Number.isNaN(contractDate.getTime())) return null;
    const transferDate = form.transferDate ? new Date(form.transferDate) : contractDate;
    /**
     * 양도 주택 = 주 자산.
     *
     * ⚠️ 취득일이 **없으면 이 게이트를 적용하지 않는다** — 「판정 불가」와 「미충족」은 다르다.
     *    취득일을 아직 안 넣은 사용자에게 「보유 2년 미만」이라고 단정하면 그것대로 거짓이다.
     *    그 경우는 종전처럼 나·다목 조건만 미리 보여 준다.
     */
    const sellingAcqDate = form.assets?.[0]?.acquisitionDate;
    const sellingAcq = sellingAcqDate ? new Date(sellingAcqDate) : null;
    if (
      sellingAcq &&
      !Number.isNaN(sellingAcq.getTime()) &&
      // 엔진·④ 게이트와 같은 함수 — §95④ 보유기간 초일 산입(E-11).
      !meetsSurchargeSuspensionHolding(sellingAcq, transferDate)
    ) {
      return { suspended: false, deadline: undefined, holdingGateFailed: true };
    }
    return checkGracePeriodExemption(
      transferDate,
      {
        contractDate,
        isLandPermitTarget: gp.isLandPermitTarget,
        permitApplicationDate: gp.permitApplicationDate
          ? new Date(gp.permitApplicationDate)
          : undefined,
        permitGranted: gp.permitGranted,
        depositReceiptConfirmed: gp.depositReceiptConfirmed,
      },
      sellingRegionCode,
    );
  }, [
    gp,
    form.transferDate,
    form.assets,
    sellingRegionCode,
  ]);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2.5">
      <ToggleCard
        variant="card"
        tone="violet"
        checked={isOn}
        onCheckedChange={handleToggle}
        title="중과 경과조치 조건 입력 (§167의3①12의2 나·다목)"
        description="2026.5.9까지 양도(가목)는 자동 전면배제 적용됩니다. 이 입력은 2026.5.10 이후 양도분(나·다목 — 계약·허가 기반 경과조치)에 사용하세요."
        trailing={<LawArticleModal legalBasis="소득세법 시행령 §167의3" label="§167의3①12의2" />}
      >
        {/* ON 시 세부 조건 노출 */}
        {isOn && gp && (
          <div className="space-y-3 pt-1">
            <RadioCardGroup
              name="grace-period-basis"
              tone="rose"
              value={
                gp.isLandPermitTarget === true
                  ? "na"
                  : gp.isLandPermitTarget === false
                    ? "da"
                    : ""
              }
              onChange={(v) => {
                if (v === "na") {
                  patchGp({ isLandPermitTarget: true });
                } else {
                  // 다목 전환 — 나목 전용 입력값 초기화(silent 잔존 방지)
                  patchGp({
                    isLandPermitTarget: false,
                    permitApplicationDate: undefined,
                    permitGranted: false,
                  });
                }
              }}
              options={[
                {
                  value: "na",
                  label: "토지거래허가 대상",
                  description: "주택부수토지가 부동산거래신고법 §11 허가 대상 — 나목(허가신청·허가·계약금 4요건)",
                  testId: "grace-period-basis-na",
                },
                {
                  value: "da",
                  label: "허가 대상 아님",
                  description: "허가 대상이 아닌 주택부수토지 — 다목(계약·계약금 2요건)",
                  testId: "grace-period-basis-da",
                },
              ]}
            />

            {gp.isLandPermitTarget === true && (
              <div className="space-y-1">
                <label className="block text-caption text-muted-foreground font-medium">
                  토지거래허가 신청일 <span className="text-rose-500">*</span>
                </label>
                <DateInput
                  data-field="gracePeriod.permitApplicationDate"
                  value={gp.permitApplicationDate ?? ""}
                  onChange={(v) => patchGp({ permitApplicationDate: v || undefined })}
                />
                <p className="text-caption text-muted-foreground/70">
                  나목1) — {SURCHARGE_TRANSITION.DEADLINE}까지 신청해야 합니다.
                </p>
              </div>
            )}

            {gp.isLandPermitTarget === true && (
              <ToggleCard
                variant="chip"
                tone="rose"
                checked={gp.permitGranted ?? false}
                onCheckedChange={(v) => patchGp({ permitGranted: v })}
                title="토지거래허가 수령"
              />
            )}

            {gp.isLandPermitTarget !== undefined && (
              <div className="space-y-1">
                <label className="block text-caption text-muted-foreground font-medium">
                  매매계약일 <span className="text-rose-500">*</span>
                </label>
                <DateInput
                  data-field="gracePeriod.contractDate"
                  value={gp.contractDate}
                  onChange={(v) => patchGp({ contractDate: v })}
                />
                <p className="text-caption text-muted-foreground/70">
                  {gp.isLandPermitTarget
                    ? "나목4) — 계약일부터 4/6개월(2026.5.10 이후 계약 시 절대기한 한정) 이내 양도해야 합니다."
                    : `다목1) — ${SURCHARGE_TRANSITION.DEADLINE}까지 체결해야 합니다.`}
                </p>
              </div>
            )}

            {gp.isLandPermitTarget !== undefined && (
              <ToggleCard
                variant="chip"
                tone="rose"
                checked={gp.depositReceiptConfirmed ?? false}
                onCheckedChange={(v) => patchGp({ depositReceiptConfirmed: v })}
                title="계약금 수령 증빙 확인"
              />
            )}

            {/* 4/6개월 소재지 자동 판정 + 기한 미리보기 */}
            {gp.isLandPermitTarget !== undefined && (
              <div className="rounded-md border border-violet-200 bg-violet-100/50 p-2.5 space-y-1">
                <p className="text-caption font-medium text-violet-800">
                  소재지 강남·서초·송파·용산 → 4개월 / 그 외 조정대상지역(2025.10.16 지정) → 6개월
                </p>
                {months === null && !sellingRegionCode && (
                  <p className="text-caption text-amber-700">
                    양도 주택 소재지(법정동코드) 미확보 — 나·다목 경과조치는 소재지가 강남·서초·송파·용산
                    또는 2025.10.16 지정 조정대상지역일 때만 적용됩니다. ① 자산 정보에서 주소를 확인하세요.
                  </p>
                )}
                {months === null && sellingRegionCode && (
                  <p className="text-caption text-rose-700">
                    이 소재지는 나·다목 경과조치 대상 지역이 아닙니다(2026.5.9까지 허가신청·계약 요건이므로
                    그 시점에 조정대상지역이 아니었던 지역은 대상 제외). 중과가 적용됩니다.
                  </p>
                )}
                {months !== null && (
                  <p className="text-caption text-violet-700">
                    적용 개월수: {months}개월
                  </p>
                )}
                {preview?.deadline && (
                  <p className="text-caption text-violet-700">
                    계산된 양도 기한: {fmtYmd(preview.deadline)}까지
                  </p>
                )}
                {preview && (
                  <p
                    className={`text-caption font-medium ${preview.suspended ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {preview.suspended
                      ? "충족 — 중과 경과조치 배제 대상"
                      : "holdingGateFailed" in preview
                        ? `미충족 — 양도 주택 보유기간이 ${MULTI_HOUSE.SURCHARGE_SUSPENSION_MIN_HOLDING_YEARS}년 미만입니다 (§167의3①12의2 본문)`
                        : "미충족 — 현재 입력 기준 경과조치 배제 미해당"}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </ToggleCard>
    </div>
  );
}
