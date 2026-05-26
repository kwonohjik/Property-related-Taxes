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
import { checkFarmingResidenceCompliance } from "@/lib/calc/farming-residence-check";
import { ResidenceCheckPreviewCard } from "./ResidenceCheckPreviewCard";
import { HeirAssessmentCard } from "./HeirAssessmentCard";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { deriveQualifiedHeirIds } from "@/lib/tax-engine/deductions/inheritance-deductions";
import type { FarmingHeirAssessment } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";

/** AddressSearch onChange → LatLng + Address 동시 영속화 */
function ResidenceAddressField({
  label,
  address,
  latLng,
  onChange,
}: {
  label: string;
  address: { road?: string; jibun?: string; building?: string; detail?: string } | undefined;
  latLng: { lat: number; lng: number } | undefined;
  onChange: (patch: {
    address: { road?: string; jibun?: string; building?: string; detail?: string } | undefined;
    latLng: { lat: number; lng: number } | undefined;
    /** v4.1.1 Phase 5 — pnu 5자리에서 자동 추출된 시·군·구 코드 (행안부 10자리) */
    sigunguCode: string | undefined;
  }) => void;
}) {
  // AddressSearch 호환 string 형식으로 변환
  const value: AddressValue = {
    road: address?.road ?? "",
    jibun: address?.jibun ?? "",
    building: address?.building ?? "",
    detail: address?.detail ?? "",
    lng: latLng ? String(latLng.lng) : "",
    lat: latLng ? String(latLng.lat) : "",
  };
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
        {label} (Vworld 주소 검색)
      </label>
      <AddressSearch
        value={value}
        onChange={(v) => {
          const hasAddress = v.road || v.jibun || v.building || v.detail;
          const nextAddress = hasAddress
            ? {
                road: v.road || undefined,
                jibun: v.jibun || undefined,
                building: v.building || undefined,
                detail: v.detail || undefined,
              }
            : undefined;
          const latNum = v.lat ? parseFloat(v.lat) : NaN;
          const lngNum = v.lng ? parseFloat(v.lng) : NaN;
          const nextLatLng =
            Number.isFinite(latNum) && Number.isFinite(lngNum)
              ? { lat: latNum, lng: lngNum }
              : undefined;
          const sigunguCode = extractSigunguCodeFromPnu(v.pnu);
          onChange({ address: nextAddress, latLng: nextLatLng, sigunguCode });
        }}
      />
    </div>
  );
}

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
    f.hasTaxFraudConviction === undefined &&
    f.isSecondaryAfterFarmingInheritance === undefined &&
    f.qualifiedHeirIds === undefined &&
    f.decedentResidenceLatLng === undefined &&
    f.heirResidenceLatLng === undefined &&
    f.decedentResidenceAddress === undefined &&
    f.heirResidenceAddress === undefined &&
    f.heirAssessments === undefined &&
    // v4.1.1 Phase 5 — 신규 6 필드 (sigunguCode×2 + forestManageableArea×2)
    f.decedentResidenceSigunguCode === undefined &&
    f.heirResidenceSigunguCode === undefined &&
    f.decedentForestManageableArea === undefined &&
    f.heirForestManageableArea === undefined
  );
}

// v4.1.1 PR-4a (M1) — extractSigunguCodeFromPnu을 lib/geo/pnu-sigungu.ts로 이전·export
// 본 파일은 동 모듈을 import하여 사용 (위 import 구문)

export interface FarmingEligibilitySectionProps {
  farming: FarmingInheritanceInput | undefined;
  estateItems: EstateItem[];
  /** 상속인 목록 — F-11 자격자 분배분 토글 UI용 */
  heirs?: Heir[];
  onChange: (farming: FarmingInheritanceInput | undefined) => void;
}

export function FarmingEligibilitySection({
  farming,
  estateItems,
  heirs,
  onChange,
}: FarmingEligibilitySectionProps) {
  const isActive = farming !== undefined;
  const [discardOpen, setDiscardOpen] = useState(false);

  const evalResult = useMemo(
    () => (farming ? evaluateFarmingEligibility(farming) : null),
    [farming],
  );

  // F-10 거주지 자동 검증 미리보기 (옵션 A 정책 — autoMet 안내용)
  const residenceCheck = useMemo(
    () => (farming?.type === "personal" ? checkFarmingResidenceCompliance(estateItems, farming) : null),
    [farming, estateItems],
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
              배제 사유 (§16⑭ + §18의3⑥{farming.type === "corporate" ? " + §16② 단서" : ""})
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
            {/* PR-D F-9: §16② 단서 — corporate 전용 (rare) */}
            {farming.type === "corporate" && (
              <ToggleCard
                tone="rose"
                size="sm"
                title="§16② 단서 — 영농상속 후 최대주주 사망 상속"
                description="본 상속이 직전 영농상속 당시 최대주주(상속받지 않은 자) 사망으로 개시된 두 번째 상속인 경우 — 적용 배제 (rare)"
                checked={farming.isSecondaryAfterFarmingInheritance ?? false}
                onCheckedChange={(v) =>
                  update({
                    isSecondaryAfterFarmingInheritance: v ? true : undefined,
                  })
                }
              />
            )}
          </div>

          {/* 부록 A — 상속인별 분리 자격 평가 (heirAssessments, 2026-05-22) */}
          {heirs && heirs.length > 1 && (
            <div className="space-y-2">
              <ToggleCard
                tone="violet"
                size="sm"
                title="상속인별 자격 분리 평가 (부록 A)"
                description={
                  farming.heirAssessments !== undefined
                    ? "활성화 — 각 상속인 카드에서 18세·2년·거주·결격소득 별도 입력. 자격 충족자만 영농상속재산가액 자동 합산"
                    : "체크 시 상속인별 18세·2년·거주·결격소득 분리 평가 (§16③ + §16⑭). 미체크 시 폼-수준 일괄 평가 (기본)"
                }
                checked={farming.heirAssessments !== undefined}
                onCheckedChange={(v) => {
                  if (v) {
                    // ON — heirs로 default assessments 초기화
                    const defaults: FarmingHeirAssessment[] = heirs.map((h) => ({
                      heirId: h.id,
                      heirIsAdult: farming.heirIsAdult,
                      heirTwoYearFarming: farming.heirTwoYearFarming,
                      heirResidenceMet: farming.heirResidenceMet,
                      heirCorporateOfficer: farming.heirCorporateOfficer,
                      isDesignatedSuccessor: farming.isDesignatedSuccessor,
                      hasDisqualifyingIncome: farming.hasDisqualifyingIncome,
                    }));
                    update({ heirAssessments: defaults, qualifiedHeirIds: undefined });
                  } else {
                    update({ heirAssessments: undefined });
                  }
                }}
              />

              {farming.heirAssessments !== undefined && (
                <div className="space-y-2">
                  {heirs.map((h, idx) => {
                    const assessment =
                      farming.heirAssessments!.find((a) => a.heirId === h.id) ?? {
                        heirId: h.id,
                        heirIsAdult: false,
                        heirTwoYearFarming: false,
                        heirResidenceMet: false,
                      };
                    return (
                      <HeirAssessmentCard
                        key={h.id || idx}
                        farming={farming}
                        heir={h}
                        assessment={assessment}
                        onUpdate={(next) => {
                          const list = farming.heirAssessments!.filter(
                            (a) => a.heirId !== h.id,
                          );
                          update({ heirAssessments: [...list, next] });
                        }}
                      />
                    );
                  })}
                  {/* 자동 도출된 qualifiedHeirIds 안내 */}
                  {(() => {
                    const auto = deriveQualifiedHeirIds(farming);
                    if (auto === undefined) return null;
                    return (
                      <div className="rounded-md border border-violet-300 bg-violet-100/60 dark:bg-violet-900/30 dark:border-violet-700 p-2">
                        <p className="text-[11px] font-semibold text-violet-900 dark:text-violet-100">
                          🤖 자동 자격자 도출 — {auto.length}명 / {heirs.length}명
                        </p>
                        <p className="text-[10px] text-violet-800 dark:text-violet-200">
                          {auto.length === 0
                            ? "자격 충족 상속인 없음 — 영농상속재산가액 0"
                            : `자격자: ${auto.map((id) => heirs.find((h) => h.id === id)?.name || id).join(", ")}`}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* §16⑤ 본문 — 자격자 분배분 (F-11). PR5: heirAssessments 입력 시에도 명시 override 노출 */}
          {heirs && heirs.length > 1 && (
            <div className="space-y-1.5">
              {farming.heirAssessments !== undefined ? (
                <>
                  <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
                    자격자 직접 조정 (override) — §16⑤ 본문
                  </p>
                  <p className="text-[10px] text-violet-700 dark:text-violet-300">
                    미선택 시 위 자동 도출 결과를 적용합니다. 직접 선택하면 자동 판정을 무시하고
                    명시 지정한 자격자 기준으로 영농상속재산가액이 산정됩니다.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
                    자격 충족 상속인 선택 (§16⑤ 본문)
                  </p>
                  <p className="text-[10px] text-violet-700 dark:text-violet-300">
                    미체크 시 전체 상속인이 자격 충족된 것으로 간주 (전체 영농자산 합산). 1명 이상 체크하면
                    heirAllocations 중 해당 상속인 분배분만 영농상속재산가액에 합산됩니다.
                  </p>
                </>
              )}
              {heirs.map((h) => {
                const ids = farming.qualifiedHeirIds ?? undefined;
                const checked = ids !== undefined && ids.includes(h.id);
                return (
                  <ToggleCard
                    key={h.id}
                    tone="violet"
                    size="sm"
                    title={h.name || `${h.relation} ${h.id}`}
                    description={`관계: ${h.relation}`}
                    checked={checked}
                    onCheckedChange={(v) => {
                      const current = farming.qualifiedHeirIds ?? [];
                      const next = v
                        ? [...current, h.id]
                        : current.filter((id) => id !== h.id);
                      // 1명 이상 체크 시 명시 배열, 모두 해제 시 빈배열(자격자 0명, §16⑤ 본문 0원 명시)
                      update({ qualifiedHeirIds: next });
                    }}
                  />
                );
              })}
              {farming.qualifiedHeirIds !== undefined && (
                <button
                  type="button"
                  onClick={() => update({ qualifiedHeirIds: undefined })}
                  className="text-[10px] underline text-violet-700 dark:text-violet-300 hover:text-violet-900"
                >
                  {farming.heirAssessments !== undefined
                    ? "↺ 자동 도출 결과로 되돌리기"
                    : "↺ 전체 상속인 자격 충족(legacy)로 되돌리기"}
                </button>
              )}
              {/* PR5 — 명시 override가 자동 판정과 다를 때 경고 (중립적 사실) */}
              {(() => {
                if (
                  farming.heirAssessments === undefined ||
                  farming.qualifiedHeirIds === undefined
                )
                  return null;
                const auto = deriveQualifiedHeirIds(farming) ?? [];
                const manual = farming.qualifiedHeirIds;
                const differs =
                  [...manual].sort().join(",") !== [...auto].sort().join(",");
                if (!differs) return null;
                return (
                  <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-900/30 dark:border-amber-700 p-2">
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                      ⚠ 명시 지정이 자동 판정과 다릅니다
                    </p>
                    <p className="text-[10px] text-amber-700 dark:text-amber-300">
                      법령 자동 판정(§16③)과 다른 자격자를 지정했습니다. 명시 지정한 자격자
                      기준으로 영농상속재산가액이 산정됩니다.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* F-10 거주지 좌표 자동 검증 (personal 전용, 옵션 A 정책) */}
          {farming.type === "personal" && (
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10 dark:border-emerald-800 p-3">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                📍 거주지 좌표 자동 검증 (선택, §16②1호나)
              </p>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                Vworld 주소 검색 시 좌표 자동 저장 → 자산 소재지와 Haversine 30km 자동 비교
                (안내용 — 사용자 명시 토글 우선)
              </p>
              <ResidenceAddressField
                label="피상속인 거주지"
                address={farming.decedentResidenceAddress}
                latLng={farming.decedentResidenceLatLng}
                onChange={({ address, latLng, sigunguCode }) =>
                  update({
                    decedentResidenceAddress: address,
                    decedentResidenceLatLng: latLng,
                    decedentResidenceSigunguCode: sigunguCode,
                  })
                }
              />
              <ResidenceAddressField
                label="상속인 거주지"
                address={farming.heirResidenceAddress}
                latLng={farming.heirResidenceLatLng}
                onChange={({ address, latLng, sigunguCode }) =>
                  update({
                    heirResidenceAddress: address,
                    heirResidenceLatLng: latLng,
                    heirResidenceSigunguCode: sigunguCode,
                  })
                }
              />
              {/* v4.1.1 Phase 5 — 산림지 단서 ToggleCard (farmingCategory=forest_land 자산 1건+ 존재 시만 노출) */}
              {estateItems.some((i) => i.farmingCategory === "forest_land") && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ToggleCard
                    tone="emerald"
                    variant="card"
                    title="피상속인 — 산림지 통상 직접 경영 가능 지역 (§16②1호나 단서)"
                    description="자산 소재 시·군·구·연접·30km에 모두 해당되지 않더라도 산림지를 통상적으로 직접 경영할 수 있는 지역에 거주 시 거주 요건 충족 (사용자 명시)"
                    checked={farming.decedentForestManageableArea === true}
                    onCheckedChange={(v) =>
                      update({ decedentForestManageableArea: v ? true : undefined })
                    }
                  />
                  <ToggleCard
                    tone="emerald"
                    variant="card"
                    title="상속인 — 산림지 통상 직접 경영 가능 지역 (§16②1호나 단서)"
                    description="동일"
                    checked={farming.heirForestManageableArea === true}
                    onCheckedChange={(v) =>
                      update({ heirForestManageableArea: v ? true : undefined })
                    }
                  />
                </div>
              )}
              {residenceCheck && (
                <ResidenceCheckPreviewCard result={residenceCheck} />
              )}
            </div>
          )}

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
