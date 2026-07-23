"use client";

/**
 * HousesListSection — 다른 보유 주택 목록 + 중과 유예 조건 (Step 4 섹션)
 *
 * ## 구조
 *  - 상단: 양도 주택 소재지 (양도 물건 주소에서 자동 판정 — 읽기 전용)
 *  - 중단: 주택 테이블 (행: 번호·지역·취득일·공시가격·특례배지·편집버튼)
 *         행 편집 버튼 → 모달(Dialog) 오픈 → HouseEntryEditor
 *  - 하단: gracePeriod 섹션 (ToggleCard, 노출 조건: 1세대 + 보유주택 2채↑)
 *
 * ## 정책 (강제)
 *  - useEffect→store 미러링 금지 (onChange 직접 set)
 *  - 자동 안분 fallback 금지
 *  - ToggleCard/RadioCardGroup 전용 (native checkbox/radio 금지)
 *  - gracePeriod OFF 시 form.gracePeriod = undefined (onChange 직접)
 *  - Tailwind 정적 색조 매핑 (동적 bg-${tone} 금지)
 */

import { useMemo, useState } from "react";
import { Settings } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { SellingHouseExclusionSection } from "@/components/calc/transfer/SellingHouseExclusionSection";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { deriveSellingHouseRegion } from "@/lib/calc/selling-house-region";
import type { TransferFormData, HouseEntry } from "@/lib/stores/calc-wizard-store";
import {
  checkGracePeriodExemption,
  transitionExemptionMonths,
} from "@/lib/tax-engine/multi-house-surcharge-exclusion";
import { SURCHARGE_TRANSITION } from "@/lib/tax-engine/legal-codes";

// ============================================================
// 특례 배지 (읽기 전용 요약)
// ============================================================

const CHIP_BASE =
  "inline-flex items-center text-micro px-1.5 py-0.5 rounded-full border select-none";
const CHIP_SKY =
  "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800";
const CHIP_AMBER =
  "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800";
const CHIP_VIOLET =
  "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800";

interface HouseBadge {
  key: string;
  label: string;
  cls: string;
}

function resolveHouseBadges(h: HouseEntry): HouseBadge[] {
  const badges: HouseBadge[] = [];
  if (h.isInherited) badges.push({ key: "inherited", label: "상속", cls: CHIP_AMBER });
  if (h.isLongTermRental) badges.push({ key: "rental", label: "장기임대", cls: CHIP_VIOLET });
  if (h.isApartment) badges.push({ key: "apt", label: "아파트", cls: CHIP_SKY });
  if (h.isOfficetel) badges.push({ key: "ofc", label: "오피스텔", cls: CHIP_SKY });
  if (h.isUnsoldHousing) badges.push({ key: "unsold", label: "미분양", cls: CHIP_SKY });
  return badges;
}

// ============================================================
// 날짜 표시 헬퍼 (YYYY-MM-DD → YY.MM.DD 단축)
// ============================================================
function shortDate(s: string): string {
  if (!s) return "—";
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  return `${parts[0].slice(2)}.${parts[1]}.${parts[2]}`;
}

// ============================================================
// 금액 포맷 (읽기 전용 요약)
// ============================================================
function fmtPrice(s: string): string {
  const n = parseInt(s.replace(/[^0-9]/g, "") || "0", 10);
  if (n === 0) return "—";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.floor(n / 10_000)}만`;
  return n.toLocaleString();
}

// ============================================================
// 테이블 행
// ============================================================

interface RowProps {
  house: HouseEntry;
  idx: number;
  onEdit: () => void;
  onRemove: () => void;
}

function HouseTableRow({ house, idx, onEdit, onRemove }: RowProps) {
  const badges = resolveHouseBadges(house);
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
      <td className="px-3 py-2 text-xs">
        {house.region === "capital" ? "수도권·광역시 등" : "지방"}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap">
        {shortDate(house.acquisitionDate)}
      </td>
      <td className="px-3 py-2 text-xs text-right tabular-nums whitespace-nowrap">
        {fmtPrice(house.officialPrice)}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b.key} className={`${CHIP_BASE} ${b.cls}`}>
              {b.label}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-caption text-primary hover:underline"
            aria-label={`주택 ${idx + 1} 편집`}
          >
            <Settings className="h-3 w-3" />
            편집
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-caption text-destructive hover:underline"
            aria-label={`주택 ${idx + 1} 삭제`}
          >
            삭제
          </button>
        </div>
      </td>
    </tr>
  );
}

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

function GracePeriodSection({ form, onChange }: GracePeriodSectionProps) {
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

  // 기한 미리보기 — 엔진 판정 함수 재사용(단일 진실 소스, 드리프트 방지)
  const preview = useMemo(() => {
    if (!gp || !gp.contractDate || gp.isLandPermitTarget === undefined) return null;
    const contractDate = new Date(gp.contractDate);
    if (Number.isNaN(contractDate.getTime())) return null;
    const transferDate = form.transferDate ? new Date(form.transferDate) : contractDate;
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

// ============================================================
// 메인 컴포넌트
// ============================================================

export function HousesListSection({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  const houses = form.houses;
  const [editingId, setEditingId] = useState<string | null>(null);

  // 양도 주택 소재지 — 양도 물건(assets[0]) 주소에서 자동 판정 (사용자 수동 선택 폐지)
  const sellingRegionCode = form.assets?.[0]?.regionCode;
  const sellingRegionLabel =
    deriveSellingHouseRegion(sellingRegionCode) === "capital" ? "수도권·광역시 등" : "지방";

  // 편집 중인 주택 (모달 오픈용)
  const editingHouse = editingId ? houses.find((h) => h.id === editingId) ?? null : null;

  function addHouse() {
    const newHouse: HouseEntry = {
      id: `house_${Date.now()}`,
      region: "capital",
      acquisitionDate: "",
      officialPrice: "",
      isInherited: false,
      isLongTermRental: false,
      isApartment: false,
      isOfficetel: false,
      isUnsoldHousing: false,
      acquisitionPrice: "",
      exclusiveArea: "",
      isUnsoldNewHouse: false,
      completionDate: "",
      isSpouseOwned: false,
      isCoInherited: false,
      decedentSameHouseholdAtInheritance: false,
      isRankingDisqualifiedInheritedHouse: false,
    };
    onChange({ houses: [...houses, newHouse] });
    // 추가 즉시 편집 모달 오픈
    setEditingId(newHouse.id);
  }

  function removeHouse(id: string) {
    onChange({ houses: houses.filter((h) => h.id !== id) });
    if (editingId === id) setEditingId(null);
  }

  function updateHouse(id: string, patch: Partial<HouseEntry>) {
    onChange({ houses: houses.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  }

  // gracePeriod 노출 조건: 1세대 + 주택수 2채 이상 + (보유 주택 OR 분양권·입주권) 1건 이상.
  // 보유 항목 0건이면 엔진이 gracePeriod를 소비하지 않으므로(houses[] 경로 전용 — rate-calc:307·helpers:783)
  // 위젯·API 전송(housesPayload && gracePeriod)·엔진 사용을 일치시켜 침묵 무시(silent omission) 차단.
  const householdCount = parseInt(form.householdHousingCount || "1", 10);
  const hasMultiHouseEntries = houses.length > 0 || form.presaleRights.length > 0;
  const showGracePeriod = form.isOneHousehold && householdCount >= 2 && hasMultiHouseEntries;

  return (
    <div className="space-y-3">
      {/* ── 양도 주택 소재지 ── */}
      <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-4 space-y-3">
        <p className="text-sm font-medium">
          다른 보유 주택 목록{" "}
          <span className="text-xs text-muted-foreground font-normal">(정밀 중과세 판정용, 선택)</span>
        </p>

        {/* 양도 주택 소재지 — 양도 물건 주소에서 자동 판정 (읽기 전용) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">양도 주택 소재지</span>
          {sellingRegionCode ? (
            <ToneCard tone="rose" bodyClassName="" className="flex-1 px-3 py-2">
              <span className="text-sm font-medium">{sellingRegionLabel}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                양도 물건 주소에서 자동 판정
              </span>
            </ToneCard>
          ) : (
            <ToneCard tone="amber" bodyClassName="" className="flex-1 px-3 py-2">
              <p className="text-xs">
                양도 물건의 소재지 주소가 없어 <b>수도권·광역시 등</b> 기본값이 적용됩니다. 정확한
                판정을 위해 1단계에서 양도 물건 주소를 입력하세요.
              </p>
            </ToneCard>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            현재 양도하는 주택 외 세대 구성원이 보유한 주택을 입력하세요.
          </p>
          <button
            type="button"
            onClick={addHouse}
            className="shrink-0 text-sm font-medium text-primary hover:underline"
          >
            + 주택 추가
          </button>
        </div>

        {houses.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">
            없음 — 주택 추가 시 정밀 주택 수 산정이 적용됩니다.
          </p>
        ) : (
          /* 주택 목록 테이블 */
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium w-8">No.</th>
                  <th className="px-3 py-2 text-left font-medium">지역</th>
                  <th className="px-3 py-2 text-left font-medium">취득일</th>
                  <th className="px-3 py-2 text-right font-medium">공시가격</th>
                  <th className="px-3 py-2 text-left font-medium">특례</th>
                  <th className="px-3 py-2 text-right font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {houses.map((h, idx) => (
                  <HouseTableRow
                    key={h.id}
                    house={h}
                    idx={idx}
                    onEdit={() => setEditingId(h.id)}
                    onRemove={() => removeHouse(h.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 분양권·입주권 ── */}
      <PresaleRightsSection
        rights={form.presaleRights}
        onChange={(presaleRights) => onChange({ presaleRights })}
        showSpouseOwned={!!form.marriageDate}
      />

      {/* ── 양도 주택 3주택+ 전용 배제 특례 (householdHousingCount≥3 시) ── */}
      {householdCount >= 3 && (
        <SellingHouseExclusionSection
          value={form.sellingHouseExclusion}
          onChange={(sellingHouseExclusion) => onChange({ sellingHouseExclusion })}
        />
      )}

      {/* ── gracePeriod 섹션 (조건부) ── */}
      {showGracePeriod && (
        <GracePeriodSection form={form} onChange={onChange} />
      )}

      {/* ── 편집 모달 ── */}
      <Dialog open={editingHouse !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }} modal={true}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              주택 {editingHouse ? houses.findIndex((h) => h.id === editingHouse.id) + 1 : ""} 정보 입력
            </DialogTitle>
          </DialogHeader>
          {editingHouse && (
            <HouseEntryEditor
              house={editingHouse}
              onUpdate={(patch) => updateHouse(editingHouse.id, patch)}
              showSpouseOwned={!!form.marriageDate}
            />
          )}
          <div className="flex justify-end pt-2 border-t border-border">
            <button
              type="button"
              className="text-sm text-primary hover:underline px-3 py-1.5"
              onClick={() => setEditingId(null)}
            >
              완료
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
