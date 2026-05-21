"use client";

/**
 * 영농상속공제 자격 입력 (F-5)
 *
 * 법령: 상증법 §18의3 + 시행령 §16②③⑭ + §18의3⑥ (KoreanLaw MCP 검증 2026-05-21)
 *
 * 3-state 토글:
 *   - undefined: legacy 모드 (하단 폼 미렌더)
 *   - 객체: 활성화 (요건 입력)
 *
 * 정책:
 *   - feedback_three_state_optional_mode_toggle (3-state)
 *   - feedback_dialog_data_discard_confirm (OFF 시 데이터 폐기 확인)
 *   - mirror-pattern (useEffect → store 미러링 금지)
 *   - single-source-engine-helper (evaluateFarmingEligibility 엔진 헬퍼 직접 사용)
 */

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { evaluateFarmingEligibility } from "@/lib/tax-engine/deductions/inheritance-deductions";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const EMPTY_FARMING: FarmingInheritanceInput = {
  type: "personal",
  decedentEightYearFarming: false,
  decedentResidenceMet: false,
  heirIsAdult: false,
  heirTwoYearFarming: false,
  heirResidenceMet: false,
};

function isEmptyFarming(f: FarmingInheritanceInput): boolean {
  // type 변경만(personal ↔ corporate) + 모든 boolean false/undefined → 빈 객체
  return (
    f.decedentEightYearFarming === false &&
    f.decedentResidenceMet === false &&
    f.decedentCorporateMet === undefined &&
    f.heirIsAdult === false &&
    f.heirTwoYearFarming === false &&
    f.heirResidenceMet === false &&
    f.decedentEarlyDeath === undefined &&
    f.heirCorporateOfficer === undefined &&
    f.isDesignatedSuccessor === undefined &&
    f.hasDisqualifyingIncome === undefined &&
    f.hasTaxFraudConviction === undefined
  );
}

export interface FarmingEligibilitySectionProps {
  farming: FarmingInheritanceInput | undefined;
  estateItems: EstateItem[];
  onChange: (farming: FarmingInheritanceInput | undefined) => void;
}

export function FarmingEligibilitySection({
  farming,
  estateItems,
  onChange,
}: FarmingEligibilitySectionProps) {
  const isActive = farming !== undefined;
  const [discardOpen, setDiscardOpen] = useState(false);

  const evalResult = useMemo(
    () => (farming ? evaluateFarmingEligibility(farming) : null),
    [farming],
  );

  // 거주지 자산 유형별 동적 안내 (personal 전용)
  const isPersonal = farming?.type === "personal";
  const hasLandAsset = useMemo(
    () =>
      isPersonal &&
      estateItems.some((i) =>
        ["farmland", "pasture", "forest_land", "agricultural_building", "salt_field"]
          .includes(i.farmingCategory ?? ""),
      ),
    [isPersonal, estateItems],
  );
  const hasFishingAsset = useMemo(
    () =>
      isPersonal &&
      estateItems.some((i) =>
        ["fishing_vessel", "fishing_right"].includes(i.farmingCategory ?? ""),
      ),
    [isPersonal, estateItems],
  );

  const handleToggleOn = () => onChange({ ...EMPTY_FARMING });
  const handleToggleOff = () => {
    if (!farming || isEmptyFarming(farming)) {
      onChange(undefined);
      return;
    }
    setDiscardOpen(true);
  };

  const update = (patch: Partial<FarmingInheritanceInput>) => {
    if (!farming) return;
    onChange({ ...farming, ...patch });
  };

  return (
    <div className="space-y-3">
      <ToggleCard
        tone="violet"
        title="영농상속공제 요건 입력 (§18의3 + 시행령 §16)"
        description={
          isActive
            ? "활성화됨 — 아래 요건을 정확히 체크해야 공제가 적용됩니다."
            : "체크하면 자격 요건을 정확히 평가합니다. 미체크 시 사용자 입력값을 그대로 30억 한도까지 공제 (legacy)."
        }
        checked={isActive}
        onCheckedChange={(v) => (v ? handleToggleOn() : handleToggleOff())}
      />

      {farming && (
        <div className="rounded-md border border-violet-200 bg-violet-50/30 dark:bg-violet-950/10 dark:border-violet-800 p-3 space-y-4">
          {/* 영농 유형 */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
              영농 유형
            </p>
            <RadioCardGroup<"personal" | "corporate">
              name="farming-type"
              layout="inline"
              tone="violet"
              value={farming.type}
              options={[
                {
                  value: "personal",
                  label: "개인 영농 (소득세법)",
                  description: "§16②1호·§16③1호",
                },
                {
                  value: "corporate",
                  label: "법인 영농 (법인세법)",
                  description: "§16②2호·§16③2호",
                },
              ]}
              onChange={(v) => update({ type: v })}
            />
          </div>

          {/* 피상속인 요건 */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
              피상속인 요건 (§16②)
            </p>
            {farming.type === "personal" ? (
              <>
                <ToggleCard
                  tone="violet"
                  size="sm"
                  title="8년 이상 직접 영농 종사 (§16②1호가)"
                  description="질병·수용 1년 인정"
                  checked={farming.decedentEightYearFarming}
                  onCheckedChange={(v) => update({ decedentEightYearFarming: v })}
                />
                <ToggleCard
                  tone="violet"
                  size="sm"
                  title="거주지 충족 (§16②1호나)"
                  description={
                    hasLandAsset && hasFishingAsset
                      ? "농지등 소재 시·군·구·연접·30km + 어선 선적지·연안 시·군·구·30km"
                      : hasLandAsset
                        ? "농지·초지·산림지 소재 시·군·구·연접·30km 이내 거주"
                        : hasFishingAsset
                          ? "어선 선적지·어장 연안 시·군·구·연접·30km 이내 거주"
                          : "Step1에서 영농 자산 분류 지정 권장 (자산 유형별 거주지 정의 다름)"
                  }
                  checked={farming.decedentResidenceMet}
                  onCheckedChange={(v) => update({ decedentResidenceMet: v })}
                />
              </>
            ) : (
              <ToggleCard
                tone="violet"
                size="sm"
                title="법인 8년 경영 + 최대주주 50%+ 유지 (§16②2호)"
                description="피상속인+특수관계인 보유주식 합 ≥ 발행주식 50%"
                checked={farming.decedentCorporateMet ?? false}
                onCheckedChange={(v) => update({ decedentCorporateMet: v })}
              />
            )}
          </div>

          {/* 상속인 요건 */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
              상속인 요건 (§16③)
            </p>
            <ToggleCard
              tone="violet"
              size="sm"
              title="영농·영어·임업후계자 (재정경제부령)"
              description="체크 시 아래 18세·2년·거주 요건 면제 (피상속인 요건은 별개)"
              checked={farming.isDesignatedSuccessor ?? false}
              onCheckedChange={(v) =>
                update({ isDesignatedSuccessor: v ? true : undefined })
              }
            />
            <ToggleCard
              tone="violet"
              size="sm"
              title="18세 이상"
              description="상속개시일 현재"
              checked={farming.heirIsAdult}
              onCheckedChange={(v) => update({ heirIsAdult: v })}
              disabled={farming.isDesignatedSuccessor === true}
              disabledReason="후계자 트랙 — 18세 요건 면제"
            />
            <ToggleCard
              tone="violet"
              size="sm"
              title={
                farming.type === "personal"
                  ? "2년 이상 직접 영농 종사"
                  : "2년 이상 법인 종사"
              }
              description="피상속인 65세 미만 사망 시 면제 가능 (아래)"
              checked={farming.heirTwoYearFarming}
              onCheckedChange={(v) => update({ heirTwoYearFarming: v })}
              disabled={farming.isDesignatedSuccessor === true}
              disabledReason="후계자 트랙 — 2년 종사 요건 면제"
            />
            {farming.type === "personal" && (
              <ToggleCard
                tone="violet"
                size="sm"
                title="상속인 거주지 충족 (§16③1호나)"
                description="피상속인 거주 요건과 동일 (자산 유형별 분기)"
                checked={farming.heirResidenceMet}
                onCheckedChange={(v) => update({ heirResidenceMet: v })}
                disabled={farming.isDesignatedSuccessor === true}
                disabledReason="후계자 트랙 — 거주 요건 면제"
              />
            )}
            <ToggleCard
              tone="violet"
              size="sm"
              title="피상속인 65세 미만 사망 or 천재지변·인재 사망"
              description="체크 시 상속인 2년 종사 요건 면제"
              checked={farming.decedentEarlyDeath ?? false}
              onCheckedChange={(v) =>
                update({ decedentEarlyDeath: v ? true : undefined })
              }
            />
            {farming.type === "corporate" && (
              <ToggleCard
                tone="violet"
                size="sm"
                title="신고기한 내 임원 + 2년 내 대표이사 취임 예정 (§16③2호나)"
                checked={farming.heirCorporateOfficer ?? false}
                onCheckedChange={(v) =>
                  update({ heirCorporateOfficer: v ? true : undefined })
                }
              />
            )}
          </div>

          {/* §16⑭ + §18의3⑥ */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
              배제 사유 (§16⑭ + §18의3⑥)
            </p>
            <ToggleCard
              tone="rose"
              size="sm"
              title="사업소득+총급여 3,700만 이상 과세기간 존재 (§16⑭)"
              description="피상속인 또는 상속인 — 영농소득·부동산임대·농어가부업 제외 (후계자 트랙에도 적용)"
              checked={farming.hasDisqualifyingIncome ?? false}
              onCheckedChange={(v) =>
                update({ hasDisqualifyingIncome: v ? true : undefined })
              }
            />
            <ToggleCard
              tone="rose"
              size="sm"
              title="조세포탈·회계부정 형 확정 (§18의3⑥)"
              description="§15⑲ 1호 조세범 §3① 벌금 / 2호 외감법 §39① (자산 5% 이상) — 단독 사유로 공제 배제"
              checked={farming.hasTaxFraudConviction ?? false}
              onCheckedChange={(v) =>
                update({ hasTaxFraudConviction: v ? true : undefined })
              }
            />
          </div>

          {/* 실시간 미리보기 (single-source-engine-helper) */}
          {evalResult && (
            evalResult.eligible ? (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-2">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  ✓ 모든 요건 충족 — 영농상속공제 적용 가능 (30억 한도)
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2 space-y-1">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  ⚠️ 자격 미충족
                </p>
                <ul className="space-y-0.5 text-[10px] text-amber-700 dark:text-amber-300 list-disc pl-4">
                  {evalResult.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      )}

      {/* Dialog 데이터 폐기 확인 */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>영농상속공제 요건 입력을 끄시겠습니까?</DialogTitle>
            <DialogDescription>
              입력한 자격 요건 데이터가 모두 삭제되고 legacy 모드로 전환됩니다.
              영농상속재산가액 수동 입력 시 자격 평가 없이 30억 한도까지 공제됩니다.
              이 동작은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="px-3 py-1.5 text-sm rounded border border-border bg-background hover:bg-muted"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setDiscardOpen(false);
              }}
              className="px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700"
            >
              삭제하고 끄기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
