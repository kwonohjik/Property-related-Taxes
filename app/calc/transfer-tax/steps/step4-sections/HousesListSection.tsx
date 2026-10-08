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
import { gracePeriodInScope } from "@/lib/calc/grace-period-scope";
import {
  sellingHouseExclusionVisible,
  sellingHouseTwoHouseExclusionVisible,
  sellingHouseLongTermRentalVisible,
} from "@/lib/calc/house-count-inputs-scope";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { mergeHouseSideOf, mergeSideLabel, type MergeContext } from "@/lib/calc/merge-house-origin";
import { deriveOneHouseFactsFromHouses } from "@/lib/calc/one-house-row-facts";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { SellingHouseExclusionSection } from "@/components/calc/transfer/SellingHouseExclusionSection";
import { SellingHouseLongTermRentalSection } from "@/components/calc/transfer/SellingHouseLongTermRentalSection";
import { SellingHouseTaxIncentiveRentalSection } from "@/components/calc/transfer/SellingHouseTaxIncentiveRentalSection";
import { sellingHouseTaxIncentiveRentalVisible } from "@/lib/calc/tax-incentive-rental-scope";
import { SellingHouseTwoHouseExclusionSection } from "@/components/calc/transfer/SellingHouseTwoHouseExclusionSection";
import { SellingHousePreDesignationContractSection } from "@/components/calc/transfer/SellingHousePreDesignationContractSection";
import { preDesignationContractInScopeOf } from "@/lib/calc/pre-designation-contract-scope";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { deriveHouseRegionFromCode } from "@/lib/calc/house-region";
import { computeHouseCountDivergence } from "@/lib/calc/house-count-divergence";
import { housesPatchWithDerivedCount, presaleRightsPatchWithConfirmClear } from "@/lib/calc/household-house-count";
import { isOwnedAtTransfer } from "@/lib/calc/household-house-count";
import type { TransferFormData, HouseEntry } from "@/lib/stores/calc-wizard-store";
import { GracePeriodSection } from "./GracePeriodSection";

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

function resolveHouseBadges(h: HouseEntry): HouseBadge[] {
  const badges: HouseBadge[] = [];
  if (h.isInherited) badges.push({ key: "inherited", label: "상속", cls: CHIP_AMBER });
  if (h.isLongTermRental) badges.push({ key: "rental", label: "장기임대", cls: CHIP_VIOLET });
  if (h.isApartment) badges.push({ key: "apt", label: "아파트", cls: CHIP_SKY });
  if (h.isOfficetel) badges.push({ key: "ofc", label: "오피스텔", cls: CHIP_SKY });
  if (h.isUnsoldHousing) badges.push({ key: "unsold", label: "조특법 감면", cls: CHIP_SKY });
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
}

/** 조특법 주택 수 제외 사유 — 「특례」 열 배지 문구. 어느 주택이 무슨 사유로 빠지는지 표에서 보인다. */
function countExclusionBadgeLabel(h: HouseEntry): string | undefined {
  const x = h.countExclusion;
  if (!x) return undefined;
  if (x.kind === "special") return "주택 수 제외: 감면주택";
  if (x.reduction.type === "unsold_98_9") return "주택 수 제외: 준공후미분양";
  return x.reduction.type === "new_99_4_hometown" ? "주택 수 제외: 고향주택" : "주택 수 제외: 농어촌주택";
}

function HouseTableRow({ house, idx, onEdit, onRemove, mergeContext, countExclusionEnabled, countExclusionApplies, transferDate }: RowProps) {
  const badges = resolveHouseBadges(house);
  const exclusionLabel =
    countExclusionEnabled && (countExclusionApplies?.(house) ?? true) ? countExclusionBadgeLabel(house) : undefined;
  const mergeSide = mergeContext ? mergeHouseSideOf(house, mergeContext) : undefined;
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
          {!isOwnedAtTransfer(house.acquisitionDate, transferDate) && (
            <span className={`${CHIP_BASE} ${CHIP_AMBER}`} data-testid={`house-after-transfer-badge-${house.id}`}>
              양도일(같은 날 포함) 이후 취득 — 주택 수 제외
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


// ============================================================
// 메인 컴포넌트
// ============================================================

export function HousesListSection({
  form,
  onChange,
  hideGracePeriod = false,
  hideSellingHouseExclusion = false,
  hideSpouseOwned = false,
  mergeContext,
  countExclusionEnabled = false,
  countExclusionApplies,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  /**
   * 중과 경과조치(§167의3①12의2 나·다목) 하위 섹션을 숨긴다 — **중과 한시배제 창 전용**.
   *
   * 창 안(양도일 ≤ 2026-05-09)에서는 `checkGracePeriodExemption`의 **가목 우선 게이트**가
   * `gracePeriod` 내용과 무관하게 `suspended: true`를 반환하므로(`multi-house-surcharge-exclusion.ts:156`
   * — `GRACE_PERIOD_A_DEADLINE`은 `SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end` 단일 출처)
   * 나·다목 입력은 **증명 가능한 no-op**이다. 목록 자체는 §155②③·§89② 비과세 축 때문에 열지만,
   * 이 섹션만 계속 닫아 둔다.
   *
   * ⚠️ ⑧ `transfer-tax-validate.ts`의 gracePeriod 검증도 같은 조건으로 건너뛴다 —
   *    안 그러면 「보이지 않는 필드 차단」이 된다.
   */
  hideGracePeriod?: boolean;
  /**
   * 양도 주택 전용 **중과배제** 특례 2섹션(§167의10①3·7호 · 3주택+)을 숨긴다 —
   * **1세대1주택 비과세 판정 메뉴 전용**(계획서 §3.2-C · F-1).
   *
   * 🔑 그 두 섹션은 파일 머리 주석이 밝히듯 **중과 축**(영 §167의10)이고 비과세 판정과 무관하다.
   *    판정 메뉴는 `sellingHouseExclusion`을 API 본문에 **싣지도 않으므로**
   *    (`one-house-exemption-api.ts`), 그대로 두면 **입력해도 아무 데도 가지 않는 칸**이 된다.
   *
   * ⚠️ 계산기는 이 prop을 넘기지 않는다 — 기본값 `false`로 **동작 불변**이다.
   *    「수정 없이 재사용」 전제가 여기서 한 번 깨지며, 그 범위는 이 prop 하나로 한정된다.
   */
  hideSellingHouseExclusion?: boolean;
  /**
   * 「배우자 단독 보유」 칩(§167의3⑨·§167의4⑤ **중과 축**)을 숨긴다 — **판정 메뉴 전용**.
   * 판정 route는 중과 엔진을 부르지 않아 이 값이 결과를 바꾸지 않는다(2026-09-29 route probe —
   * 켜고 끈 응답이 동일). 같은 사실을 합가 전 보유 쪽(`mergeContext`)이 묻는다.
   */
  hideSpouseOwned?: boolean;
  /**
   * §155④⑤ 합가 — 넘기면 행 편집 창에 합가 전 보유 쪽을 묻고 표에 배지를 단다(판정 메뉴).
   * 게이트(합가 칸이 보이고 합가일이 있을 때)는 호출부가 건다. 계산기는 넘기지 않는다.
   */
  mergeContext?: MergeContext;
  /** 조특법 주택 수 제외(행 편집 ⑥·「특례」 배지) — 게이트는 호출부(`HouseCountExemptionInputs`)가 정한다. */
  countExclusionEnabled?: boolean;
  /** 행 선언을 판정에 쓰는가(배지 한정) — `HouseTableRow`로 넘긴다. */
  countExclusionApplies?: (house: HouseEntry) => boolean;
}) {
  const houses = form.houses;
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * 명부 patch — **파생 주택 수를 같은 patch 에 싣는다**(Q-8 후속).
   * 세 쓰기 지점(추가·삭제·수정)이 전부 이걸 거친다. 한 곳이라도 빠지면 그 경로로만
   * 스칼라가 어긋나므로 `onChange({ houses })` 를 직접 부르지 말 것.
   */
  function patchHouses(next: HouseEntry[]) {
    return housesPatchWithDerivedCount(
      next,
      form.assets?.[0]?.assetKind,
      // OH-34: 레거시 표식이 켜져 있으면 스칼라를 덮지 않는다(전환 버튼만이 끈다).
      form.legacyHouseCountPrecedence ?? false,
      form.transferDate,
    );
  }

  // 양도 주택 소재지 — 양도 물건(assets[0]) 주소에서 자동 판정 (사용자 수동 선택 폐지)
  const sellingRegionCode = form.assets?.[0]?.regionCode;
  const sellingRegionLabel =
    deriveHouseRegionFromCode(sellingRegionCode) === "capital" ? "수도권·광역시 등" : "지방";

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
    onChange(patchHouses([...houses, newHouse]));
    // 추가 즉시 편집 모달 오픈
    setEditingId(newHouse.id);
  }

  function removeHouse(id: string) {
    onChange(patchHouses(houses.filter((h) => h.id !== id)));
    if (editingId === id) setEditingId(null);
  }

  function updateHouse(id: string, patch: Partial<HouseEntry>) {
    onChange(patchHouses(houses.map((h) => (h.id === id ? { ...h, ...patch } : h))));
  }

  // gracePeriod 노출 조건: 1세대 + 주택수 2채 이상 + (보유 주택 OR 분양권·입주권) 1건 이상.
  // 보유 항목 0건이면 엔진이 gracePeriod를 소비하지 않으므로(houses[] 경로 전용 — rate-calc:307·helpers:783)
  // 위젯·API 전송(housesPayload && gracePeriod)·엔진 사용을 일치시켜 침묵 무시(silent omission) 차단.
  const householdCount = parseInt(form.householdHousingCount || "1", 10);
  // 술어는 ④ 전송·⑧ validate와 **같은 함수**다 (Q03 — `gracePeriodInScope`).
  // 종전에는 세 층이 각자 조건을 적어 갈라졌다. `hideGracePeriod`는 상위(Step4)가 한시배제 창
  // 분기에서 명시로 닫는 축이라 그대로 둔다 — 술어도 같은 창을 보므로 중복이지 모순이 아니다.
  const showGracePeriod = !hideGracePeriod && gracePeriodInScope(form);

  // ①(세대 보유 주택 수) ↔ ④(다른 보유 주택 목록) 정합성 안내 (표시 전용 — 계획서 §2·§3).
  // 배제규칙은 엔진 전용이라 UI 재계산 금지 → 구조적 개수만 대조(useMemo 파생, store 미기록).
  /**
   * OH-30 — 세대 단위 레거시 §155 사실만 있고 **행 지정이 없는가**.
   * 도출 leaf가 내보내는 `fromLegacyOnly`를 그대로 읽는다(화면이 규칙을 재구현하지 않는다).
   */
  const legacyOneHouseFacts = useMemo(
    () =>
      deriveOneHouseFactsFromHouses(form.houses, {
        culturalHeritageHouseSpecial: form.culturalHeritageHouseSpecial,
        ...(form.ruralHouseSpecial && form.ruralHouseKind
          ? {
              ruralHouse: {
                kind: form.ruralHouseKind as "inherited" | "farm_exit" | "return_to_farm",
                isOutsideCapitalEupMyeon: form.ruralHouseOutsideCapitalEupMyeon,
              },
            }
          : {}),
        ...(form.unavoidableOutsideCapitalSpecial
          ? {
              unavoidableOutsideCapitalHouse: {
                reason: form.unavoidableOutsideCapitalReason as
                  | "study"
                  | "work"
                  | "illness"
                  | "other",
              },
            }
          : {}),
      }).fromLegacyOnly,
    [
      form.houses,
      form.culturalHeritageHouseSpecial,
      form.ruralHouseSpecial,
      form.ruralHouseKind,
      form.ruralHouseOutsideCapitalEupMyeon,
      form.unavoidableOutsideCapitalSpecial,
      form.unavoidableOutsideCapitalReason,
    ],
  );

  const divergence = useMemo(
    () =>
      computeHouseCountDivergence({
        primaryKind: form.assets?.[0]?.assetKind ?? "",
        householdHousingCount: form.householdHousingCount,
        houses: form.houses,
        presaleRights: form.presaleRights,
      }),
    [form.assets, form.householdHousingCount, form.houses, form.presaleRights],
  );

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
              {/*
                🔴 종전 문구는 「**1단계**에서 양도 물건 주소를 입력하세요」였다. 이 컴포넌트는
                   계산기와 판정 메뉴가 **함께 쓰는데**, 계산기는 1단계 자산 카드
                   (`AssetSectionBasic.tsx:315`)가 맞고 판정 메뉴는 ② 양도 대상 주택 화면이다.
                   판정 메뉴에는 주소 입력이 **아예 없던 시기**가 있어(2026-09-23 신설 전)
                   따라갈 경로가 없는 안내가 상시 노출됐다. ⇒ 단계 번호를 빼고 **양쪽에서 참인**
                   문구로 둔다(prop을 하나 더 꿰는 것보다 얕다).
              */}
              <p className="text-xs">
                양도 물건의 소재지 주소가 없어 <b>수도권·광역시 등</b> 기본값이 적용됩니다. 정확한
                판정을 위해 <b>양도 대상 주택</b>의 소재지 주소를 입력하세요.
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
                    mergeContext={mergeContext}
                    countExclusionEnabled={countExclusionEnabled}
                    countExclusionApplies={countExclusionApplies}
                    transferDate={form.transferDate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/*
          ── OH-30 — 레거시 §155 사실이 「어느 주택인지」 미지정 (D-6 4) ──

          🔴 옛 record는 §155⑥⑦⑧을 **세대 단위 값**으로만 들고 있어 어느 행인지 알 수 없다.
             자동 배정하면 틀린 주택에 사실을 붙이게 되므로 **지정하지 않고 밝힌다**.
             세액은 저장 당시와 같다 — 어댑터가 레거시 값을 그대로 쓴다(OH-21).
        */}
        {legacyOneHouseFacts && (
          <ToneCard tone="violet" bodyClassName="" className="px-3 py-2">
            <p className="text-xs leading-relaxed" data-testid="one-house-legacy-unassigned">
              저장된 <b>1세대1주택 특례 사실</b>(§155⑥ 문화유산 · §155⑦ 농어촌 · §155⑧ 수도권 밖
              부득이)이 <b>어느 주택인지 지정되지 않았습니다</b>. 계산은 저장 당시와 같은 값으로
              하지만, 해당 주택 행의 <b>편집 → ⑤ 1세대1주택 비과세 특례 사실</b>에서 지정하면
              명부가 정본이 됩니다. 특히 <b>§155⑥ 문화유산</b>은 행에 지정해야 다주택 중과에서도
              빠집니다(영 §167의3①6호) — 세대 단위 값만으로는 어느 주택인지 알 수 없어 중과
              판정에 쓸 수 없습니다.
            </p>
          </ToneCard>
        )}

        {/* ── ①↔④ 정합성 안내 (표시 전용) ── */}
        {/* ⚠️ OH-34 표식이 켜져 있으면 이 문장은 **거짓**이다(계산이 스칼라로 간다) — 숨긴다.
            그 상태의 안내는 아래 레거시 카드가 대신한다. */}
        {divergence.showPrecedence && !form.legacyHouseCountPrecedence && (
          <ToneCard tone="sky" bodyClassName="" className="px-3 py-2">
            <p className="text-xs leading-relaxed">
              <b>세대 주택 수</b>는 이 <b>다른 보유 주택 목록</b> 기준으로 산정됩니다 —{" "}
              {divergence.selfOffset === 0 ? (
                <><b>조합원입주권 비과세 판정</b>(소득세법 §89①4호)입니다.</>
              ) : (
                <>중과 2주택·3주택 판정(배제규칙 반영)과 <b>1세대1주택 비과세 판정</b> 모두입니다.</>
              )}
              ① <b>세대 보유 주택 수</b>는 목록이 비어 있을 때만 사용됩니다.
            </p>
          </ToneCard>
        )}
        {/* OH-34 — 저장 당시 스칼라가 명부와 어긋난 **이력을 복원**한 경우.
            계산은 저장 당시 값으로 하고(세액 보존), 명부로 넘어가는 것은 사용자가 고른다. */}
        {divergence.showMismatch && form.legacyHouseCountPrecedence && (
          <ToneCard tone="amber" bodyClassName="" className="px-3 py-2">
            <div className="space-y-1.5" data-testid="house-count-legacy-precedence">
              <p className="text-xs leading-relaxed">
                저장 당시 직접 입력한 주택 수(<b>{divergence.declared}채</b>)와 목록
                (<b>{divergence.structuralCount}채</b>, {divergence.selfOffset === 0 ? "양도 입주권 제외" : "양도주택 포함"})가 다릅니다 — 저장 당시 세액을
                유지하려고 계산은 <b>{divergence.declared}채</b>로 합니다. 누락된 주택을 목록에
                보완하거나, 목록 기준으로 전환하세요.{" "}
                <span className="text-muted-foreground">(분양권·입주권은 별도 집계)</span>
              </p>
              <button
                type="button"
                data-testid="house-count-adopt-roster"
                onClick={() =>
                  onChange({
                    legacyHouseCountPrecedence: false,
                    householdHousingCount: String(divergence.structuralCount),
                  })
                }
                className="rounded-md border border-amber-400 bg-amber-100/60 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
              >
                목록 기준({divergence.structuralCount}채)으로 전환
              </button>
            </div>
          </ToneCard>
        )}
        {divergence.showMismatch && !form.legacyHouseCountPrecedence && (
          <ToneCard tone="amber" bodyClassName="" className="px-3 py-2">
            <p className="text-xs leading-relaxed" data-testid="house-count-mismatch">
              ① 세대 보유 주택 수(<b>{divergence.declared}채</b>)와 목록의 주택 수
              (<b>{divergence.structuralCount}채</b>, {divergence.selfOffset === 0 ? "양도 입주권 제외" : "양도주택 포함"})가 다릅니다 — 계산은{" "}
              <b>목록의 {divergence.structuralCount}채</b>로 합니다. 누락된 주택을 추가하거나
              ①을 실제 세대 보유 주택 수에 맞게 조정하세요. <span className="text-muted-foreground">(분양권·입주권은 별도 집계)</span>
            </p>
          </ToneCard>
        )}
      </div>

      {/* ── 분양권·입주권 ── PR-D(2026-10-05) — 「없음」 확인 토글(목록 0행) + 행 추가 시 해제. */}
      <PresaleRightsSection
        rights={form.presaleRights}
        onChange={(presaleRights) => onChange(presaleRightsPatchWithConfirmClear(presaleRights))}
        showSpouseOwned={!hideSpouseOwned && !!form.marriageDate}
        primaryKind={form.assets?.[0]?.assetKind}
        confirmed={form.householdNoPresaleRightsConfirmed}
        onConfirmedChange={(v) => onChange({ householdNoPresaleRightsConfirmed: v })}
        transferDate={form.transferDate}
      />

      {/* ── 양도 주택 3주택+ 전용 배제 특례 ──
          🔴 「담긴 값이 있으면」도 연다 (2026-09-07 대장 재대조). 토글을 켠 뒤 주택수를 2채로
             낮추면 섹션이 사라지는데 ⑧(`transfer-tax-validate.ts`)은 켜진 토글의 기간(년)을
             계속 요구해, 그 토글을 끌 화면이 없는 dead-end가 됐다. 술어는 leaf 단일 소스. */}
      {!hideSellingHouseExclusion && sellingHouseExclusionVisible(form) && (
        <SellingHouseExclusionSection
          value={form.sellingHouseExclusion}
          onChange={(sellingHouseExclusion) => onChange({ sellingHouseExclusion })}
        />
      )}

      {/* ── 양도 주택 2주택 전용 배제 특례 (§167의10①3호·7호) ──
          두 호는 **양도하는 주택 자신**에도 적용된다(F-16). 종전에는 「다른 보유 주택」 행에만
          입력이 있어 양도 주택에는 경로가 없었다. dead-end 회피는 위 3주택+ 섹션과 같은 규칙. */}
      {!hideSellingHouseExclusion && sellingHouseTwoHouseExclusionVisible(form) && (
        <SellingHouseTwoHouseExclusionSection
          value={form.sellingHouseExclusion}
          onChange={(sellingHouseExclusion) => onChange({ sellingHouseExclusion })}
        />
      )}

      {/* ── 양도 주택이 장기임대주택인 경우 (§167의3①2호) ──
          🔴 게이트가 **2채**다 — 위 두 섹션과 다르다. 2호는 2주택에서도 §167의10①2호가 준용하고
             엔진도 `effectiveHouseCount >= 2`에서 판정한다. 3으로 맞추면 2주택에서 선언 경로가
             사라져 종전의 「입력 경로 없음」이 절반만 해소된다. */}
      {!hideSellingHouseExclusion && sellingHouseLongTermRentalVisible(form) && (
        <SellingHouseLongTermRentalSection
          value={form.sellingHouseExclusion}
          onChange={(sellingHouseExclusion) => onChange({ sellingHouseExclusion })}
        />
      )}

      {/* ── 양도 주택이 감면대상장기임대주택인 경우 (§167의3①3호) ──
          2호와 같은 이유로 게이트가 **2채**다(§167의10①2호 준용). 술어는 leaf 단일 소스. */}
      {!hideSellingHouseExclusion && sellingHouseTaxIncentiveRentalVisible(form) && (
        <SellingHouseTaxIncentiveRentalSection
          value={form.sellingHouseExclusion}
          onChange={(sellingHouseExclusion) => onChange({ sellingHouseExclusion })}
        />
      )}

      {/* ── 조정대상지역 공고 전 매매계약 (영 §167의10①11호 등) ──
          양도 매매계약 사실이라 12의2 나·다목(아래 gracePeriod)과 나란히 둔다 — 칸은 따로다(Q-3).
          범위는 ④·⑧과 같은 술어(`pre-designation-contract-scope.ts`). 판정 메뉴는 이 사실을 싣지 않는다. */}
      {!hideSellingHouseExclusion && preDesignationContractInScopeOf(form) && (
        <SellingHousePreDesignationContractSection
          value={form.sellingHouseExclusion}
          onChange={(sellingHouseExclusion) => onChange({ sellingHouseExclusion })}
          regionCode={form.assets[0]?.regionCode}
          regionInDesignatedDistrict={form.assets[0]?.regionInDesignatedDistrict}
          transferDate={form.transferDate}
        />
      )}

      {/* ── gracePeriod 섹션 (조건부) ── */}
      {showGracePeriod && (
        <GracePeriodSection form={form} onChange={onChange} />
      )}

      {/* ── 편집 모달 ── */}
      <Dialog open={editingHouse !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }} modal={true}>
        <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              주택 {editingHouse ? houses.findIndex((h) => h.id === editingHouse.id) + 1 : ""} 정보 입력
            </DialogTitle>
          </DialogHeader>
          {editingHouse && (
            <HouseEntryEditor
              house={editingHouse}
              onUpdate={(patch) => updateHouse(editingHouse.id, patch)}
              showSpouseOwned={!hideSpouseOwned && !!form.marriageDate}
              transferDate={form.transferDate}
              mergeContext={mergeContext}
              countExclusionEnabled={countExclusionEnabled}
              // §167의3①3호는 중과 축 — 판정 메뉴(양도 주택 중과 섹션을 숨기는 화면)에서는 묻지 않는다.
              taxIncentiveRentalEnabled={!hideSellingHouseExclusion}
              // P4 양론 C1 「동일세대원에게 증여」는 판정 메뉴(쟁점 카드가 있는 화면)에서만 묻는다.
              householdGiftEnabled={hideSellingHouseExclusion}
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
