"use client";

/**
 * HousesListSection — 다른 보유 주택 목록 + 중과 유예 조건 (Step 4 섹션)
 *
 * ## 구조
 *  - 상단: 양도 주택 소재지 RadioCardGroup
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

import { useState } from "react";
import { Settings } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { SellingHouseExclusionSection } from "@/components/calc/transfer/SellingHouseExclusionSection";
import type { TransferFormData, HouseEntry } from "@/lib/stores/calc-wizard-store";

// ============================================================
// 특례 배지 (읽기 전용 요약)
// ============================================================

const CHIP_BASE =
  "inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border select-none";
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
        {house.region === "capital" ? "수도권" : "지방"}
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
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            aria-label={`주택 ${idx + 1} 편집`}
          >
            <Settings className="h-3 w-3" />
            편집
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] text-destructive hover:underline"
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

function GracePeriodSection({ form, onChange }: GracePeriodSectionProps) {
  const gp = form.gracePeriod;
  const isOn = gp !== undefined;

  function handleToggle(v: boolean) {
    if (!v) {
      // OFF: gracePeriod = undefined (직접 set — useEffect 미러링 금지)
      onChange({ gracePeriod: undefined });
    } else {
      // ON: 기본 객체 초기화
      onChange({
        gracePeriod: {
          contractDate: "",
          isLandPermitArea: false,
          hasTenantInResidence: false,
          areaDesignatedDate: undefined,
        },
      });
    }
  }

  function patchGp(patch: Partial<NonNullable<TransferFormData["gracePeriod"]>>) {
    if (!gp) return;
    onChange({ gracePeriod: { ...gp, ...patch } });
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2.5">
      <ToggleCard
        variant="card"
        tone="violet"
        checked={isOn}
        onCheckedChange={handleToggle}
        title="중과세 한시 유예 조건 입력"
        description="2022.5.10~2026.5.9 매매계약 시 정밀 조건 판정 (소령 §167의3 중과 한시 배제). 미입력 시 유예 기간 내 계약이면 전면 배제 적용."
      >
        {/* ON 시 세부 조건 노출 */}
        {isOn && gp && (
          <div className="space-y-3 pt-1">
            {/* 매매계약일 */}
            <div className="space-y-1">
              <label className="block text-[11px] text-muted-foreground font-medium">
                매매계약일 <span className="text-rose-500">*</span>
              </label>
              <DateInput
                value={gp.contractDate}
                onChange={(v) => patchGp({ contractDate: v })}
              />
              <p className="text-[11px] text-muted-foreground/70">
                2022.5.10 ~ 2026.5.9 사이 계약 여부를 정밀 판정합니다.
              </p>
            </div>

            {/* 토지거래허가구역 여부 */}
            <ToggleCard
              variant="chip"
              tone="rose"
              checked={gp.isLandPermitArea}
              onCheckedChange={(v) => {
                patchGp({
                  isLandPermitArea: v,
                  // 토지허가 OFF 시 임차인 거주 초기화
                  hasTenantInResidence: v ? gp.hasTenantInResidence : false,
                });
              }}
              title="토지거래허가구역"
            />

            {/* 임차인 거주 (토지허가구역일 때만) */}
            {gp.isLandPermitArea && (
              <ToggleCard
                variant="chip"
                tone="rose"
                checked={gp.hasTenantInResidence}
                onCheckedChange={(v) => patchGp({ hasTenantInResidence: v })}
                title="임차인 거주 중"
              />
            )}

            {/* 조정대상지역 최초 지정일 (optional) */}
            <div className="space-y-1">
              <label className="block text-[11px] text-muted-foreground font-medium">
                조정대상지역 최초 지정일{" "}
                <span className="text-muted-foreground/60 font-normal">(선택)</span>
              </label>
              <DateInput
                value={gp.areaDesignatedDate ?? ""}
                onChange={(v) => patchGp({ areaDesignatedDate: v || undefined })}
              />
              <p className="text-[11px] text-muted-foreground/70">
                2025.10.16 이후 신규 지정 지역인 경우 입력 (공고일 이전 계약 특례 판정)
              </p>
            </div>
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
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            다른 보유 주택 목록{" "}
            <span className="text-xs text-muted-foreground font-normal">(정밀 중과세 판정용, 선택)</span>
          </p>
          <button
            type="button"
            onClick={addHouse}
            className="text-xs text-primary hover:underline"
          >
            + 주택 추가
          </button>
        </div>

        {/* 양도 주택 권역 선택 */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">양도 주택 소재지</span>
          <RadioCardGroup
            name="sellingHouseRegion"
            layout="inline"
            tone="rose"
            value={form.sellingHouseRegion}
            onChange={(v) => onChange({ sellingHouseRegion: v as "capital" | "non_capital" })}
            options={[
              { value: "capital", label: "수도권" },
              { value: "non_capital", label: "지방" },
            ]}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          현재 양도하는 주택 외 세대 구성원이 보유한 주택을 입력하세요.
        </p>

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
