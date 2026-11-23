/**
 * HouseTableRow — 다른 보유 주택 목록의 표 한 행(번호·지역·취득일·공시가격·특례 배지·편집/삭제) · 읽기 전용 요약 헬퍼.
 *
 * `HousesListSection.tsx`에서 옮겼다(JSX·testid 그대로 · 800줄 정책 — 765줄 위험구간 · 2026-11 리뷰 D-79 남은 항목).
 */
import { Settings } from "lucide-react";
import { HOUSE_REGION_LABEL } from "@/lib/calc/house-region";
import { mergeHouseSideOf, mergeSideLabel, type MergeContext } from "@/lib/calc/merge-house-origin";
import { isOwnedAtTransfer } from "@/lib/calc/household-house-count";
import { isSameDayFirstTransferred, isSameDayOrderUndecided } from "@/lib/calc/same-day-transfer-order";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

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
const CHIP_EMERALD =
  "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800";

interface HouseBadge {
  key: string;
  label: string;
  cls: string;
}

function resolveHouseBadges(h: HouseEntry, hideSurchargeInputs: boolean): HouseBadge[] {
  const badges: HouseBadge[] = [];
  if (h.isInherited) badges.push({ key: "inherited", label: "상속", cls: CHIP_AMBER });
  if (h.isLongTermRental) badges.push({ key: "rental", label: "장기임대", cls: CHIP_VIOLET });
  if (h.isApartment) badges.push({ key: "apt", label: "아파트", cls: CHIP_SKY });
  if (h.isOfficetel) badges.push({ key: "ofc", label: "오피스텔", cls: CHIP_SKY });
  // 5호(중과 제외) 사실의 배지 — 판정 route는 읽지 않는다. 판정 메뉴에 달면 반영된 것처럼 보인다(S14a-9).
  if (h.isUnsoldHousing && !hideSurchargeInputs) badges.push({ key: "unsold", label: "조특법 감면", cls: CHIP_SKY });
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
  /** §155④⑤ 합가 — 있으면 「특례」 열에 합가 전 보유 쪽 배지를 단다(판정 메뉴). */
  mergeContext?: MergeContext;
  /** 조특법 주택 수 제외 배지 — 행 편집 ⑥이 열려 있을 때만 단다. */
  countExclusionEnabled?: boolean;
  /** 그 행의 선언을 판정에 쓰는가 — 쓰지 않으면 배지를 달지 않는다(판정 메뉴 입주권 양도). 없으면 전부 쓴다. */
  countExclusionApplies?: (house: HouseEntry) => boolean;
  /** 양도일 — 그날 이후(같은 날 포함) 취득한 행에 「주택 수 제외」 배지를 단다(D2 · `isOwnedAtTransfer`). */
  transferDate: string | undefined;
  /** §154⑨ 같은 날 양도 순서가 닿는 양도 대상인가(`sameDayOrderApplies`) — 아니면 남은 선택값의 배지를 달지 않는다(주택 수에서도 빼지 않는다). */
  sameDayApplies: boolean;
  /** 중과 전용 입력을 닫은 화면 — 중과 전용 배지를 달지 않는다. */
  hideSurchargeInputs: boolean;
}

/** 조특법 주택 수 제외 사유 — 「특례」 열 배지 문구. 어느 주택이 무슨 사유로 빠지는지 표에서 보인다. */
function countExclusionBadgeLabel(h: HouseEntry): string | undefined {
  const x = h.countExclusion;
  if (!x) return undefined;
  if (x.kind === "special") return "주택 수 제외: 감면주택";
  if (x.reduction.type === "unsold_98_9") return "주택 수 제외: 준공후미분양";
  return x.reduction.type === "new_99_4_hometown" ? "주택 수 제외: 고향주택" : "주택 수 제외: 농어촌주택";
}

export function HouseTableRow({ house, idx, onEdit, onRemove, mergeContext, countExclusionEnabled, countExclusionApplies, transferDate, sameDayApplies, hideSurchargeInputs }: RowProps) {
  const badges = resolveHouseBadges(house, hideSurchargeInputs);
  const exclusionLabel =
    countExclusionEnabled && (countExclusionApplies?.(house) ?? true) ? countExclusionBadgeLabel(house) : undefined;
  const mergeSide = mergeContext ? mergeHouseSideOf(house, mergeContext) : undefined;
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
      <td className="px-3 py-2 text-xs">
        {HOUSE_REGION_LABEL[house.region]}
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
          {!isOwnedAtTransfer(house.acquisitionDate, transferDate) && (
            <span className={`${CHIP_BASE} ${CHIP_AMBER}`} data-testid={`house-after-transfer-badge-${house.id}`}>
              양도일(같은 날 포함) 이후 취득 — 주택 수 제외
            </span>
          )}
          {sameDayApplies && isSameDayFirstTransferred(house) && (
            <span className={`${CHIP_BASE} ${CHIP_EMERALD}`} data-testid={`house-same-day-badge-${house.id}`}>
              같은 날 먼저 양도 선택(§154⑨) — 주택 수 제외
            </span>
          )}
          {sameDayApplies && house.soldSameDay === true && !isSameDayFirstTransferred(house) && (
            <span className={`${CHIP_BASE} ${CHIP_AMBER}`} data-testid={`house-same-day-badge-${house.id}`}>
              {isSameDayOrderUndecided(house)
                ? "같은 날 양도 — 순서 미선택(주택 수 산입)"
                : "같은 날 양도 — 나중에 양도 선택(주택 수 산입)"}
            </span>
          )}
          {exclusionLabel && (
            <span className={`${CHIP_BASE} ${CHIP_EMERALD}`} data-testid={`house-count-exclusion-badge-${house.id}`}>
              {exclusionLabel}
            </span>
          )}
          {mergeContext && (
            <span
              className={`${CHIP_BASE} ${mergeSide ? CHIP_VIOLET : CHIP_AMBER}`}
              data-testid={`house-merge-badge-${house.id}`}
              data-side={mergeSide ?? "unset"}
            >
              {mergeSide ? mergeSideLabel(mergeSide, mergeContext.kind) : "합가 전 보유자 미입력"}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onEdit}
            // 검증 오류 → 이 행으로 이동. 입력칸은 편집 모달 안이라 DOM에 없으므로 행의 「편집」이 앵커다
            data-field={`houses.${idx}`}
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
