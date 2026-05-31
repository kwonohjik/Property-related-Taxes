"use client";

/**
 * GiftRowEditor — 개별 사전증여 행 편집기.
 *
 * PriorGiftInput.tsx 800줄 분할 (PR Z, 2026-05-22).
 * 2-B (2026-05-29): 수증자(Heir) select 추가 — doneeId + isHeir 동시 동기화.
 */

import { useState } from "react";
import {
  CurrencyInput,
  parseAmount,
  formatKRW,
} from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  DONOR_RELATION_LABELS,
  DONOR_RELATION_LIST,
  GIFT_DONOR_LABELS,
  GIFT_DONOR_LIST,
  GIFT_PRIOR_CATEGORY_LIST,
  GIFT_PRIOR_CATEGORY_LABELS,
} from "@/components/calc/prior-gift/meta";
import type {
  PriorGift,
  DonorRelation,
  GiftDonorRelation,
  GiftPriorPropertyCategory,
  Heir,
  HeirRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  isNonHeirRelation,
  deriveIsHeirFromHeir,
  deriveBeneficiaryTypeFromHeir,
  deriveDoneeRelationFromHeir,
} from "@/lib/calc/prior-gift-donee-derive";
import { autoComputePriorGiftTax } from "@/lib/calc/prior-gift-auto-tax";

// ============================================================
// 수증자 select 헬퍼 — 파생 로직은 lib/calc/prior-gift-donee-derive.ts 단일 진실
// ============================================================

const HEIR_RELATION_LABEL: Record<HeirRelation, string> = {
  spouse: "배우자",
  child: "자녀",
  lineal_ascendant: "직계존속",
  sibling: "형제자매",
  other: "기타",
  legatee: "수유자",
  corporate: "영리법인",
};

export interface GiftRowEditorProps {
  gift: PriorGift;
  index: number;
  /** 상속세 모드: 상속인 여부 선택 표시 / 증여세 모드: 숨김 */
  showIsHeir: boolean;
  /** 증여세 모드: donor·⑤·⑦·⑫ Phase A 필드 표시 */
  showGiftPhaseA: boolean;
  onUpdate: (updated: PriorGift) => void;
  onRemove: () => void;
  /** 상속세 모드 — 영리법인 doneeId select 옵션 (PR-C) */
  heirs?: Heir[];
}

export function GiftRowEditor({
  gift,
  index,
  showIsHeir,
  showGiftPhaseA,
  onUpdate,
  onRemove,
  heirs,
}: GiftRowEditorProps) {
  const set = (patch: Partial<PriorGift>) => onUpdate({ ...gift, ...patch });

  // 세액 입력란(giftTaxPaid·corporateGiftComputedTax 공통) 사용자 수동 수정 여부 — 자동 덮어쓰기 차단.
  // 카드-local useState (showAutoBadge가 render에 영향 → ref 아닌 state. useEffect→store 미러링 아님).
  const [userTouchedTax, setUserTouchedTax] = useState(false);

  // 부표1(신고서 메타) 기본 접힘 (donee-phase2 — 입력 간소화, print 자동 펼침)
  const [besshiOpen, setBesshiOpen] = useState(false);

  const isCorporate = gift.beneficiaryType === "corporate";

  /**
   * 자동계산 세액 patch (mirror) — userTouchedTax 미터치 시에만 적용.
   *   영리법인: corporateGiftComputedTax(§3의2② 산출세액 상당액)·giftTaxPaid=0·giftTaxBase=undefined
   *   그 외(상속인·수유자·비영리법인): giftTaxPaid
   */
  function computeTaxPatch(next: PriorGift): Partial<PriorGift> {
    if (userTouchedTax) return {};
    const tax = autoComputePriorGiftTax(next.giftAmount ?? 0, next.doneeRelation);
    if (next.beneficiaryType === "corporate") {
      return { corporateGiftComputedTax: tax, giftTaxPaid: 0, giftTaxBase: undefined };
    }
    return { giftTaxPaid: tax };
  }

  // ============================================================
  // 수증자 select onChange — doneeId·isHeir·beneficiaryType·doneeRelation 4필드 + 자동계산 단일 set
  // (useEffect → store 미러링 금지 정책 준수).
  // ============================================================
  function handleDoneeSelect(heirId: string) {
    if (!heirId) {
      // "선택 안 함" → doneeId 제거, 나머지 기존값 유지 (수동 경로 복귀)
      set({ doneeId: undefined });
      return;
    }
    const selectedHeir = (heirs ?? []).find((h) => h.id === heirId);
    if (!selectedHeir) {
      set({ doneeId: heirId });
      return;
    }
    const corePatch: Partial<PriorGift> = {
      doneeId: heirId,
      isHeir: deriveIsHeirFromHeir(selectedHeir),
      beneficiaryType: deriveBeneficiaryTypeFromHeir(selectedHeir),
      doneeRelation: deriveDoneeRelationFromHeir(selectedHeir.relation),
    };
    set({ ...corePatch, ...computeTaxPatch({ ...gift, ...corePatch }) });
  }

  // 증여재산가액 onChange — 가액 반영 후 자동 세액 재계산 (단일 set)
  function handleGiftAmountChange(v: string) {
    const giftAmount = parseAmount(v);
    set({ giftAmount, ...computeTaxPatch({ ...gift, giftAmount }) });
  }

  // 수동 경로 관계 onChange — doneeRelation 반영 후 자동 세액 재계산 (P6 경로2)
  function handleManualRelationChange(rel: DonorRelation | undefined) {
    set({ doneeRelation: rel, ...computeTaxPatch({ ...gift, doneeRelation: rel }) });
  }

  // 세액 입력란 수동 수정 — userTouchedTax 플래그 set 후 자동 덮어쓰기 차단
  function handleTaxAmountChange(v: string) {
    setUserTouchedTax(true);
    const amount = parseAmount(v);
    set(isCorporate ? { corporateGiftComputedTax: amount } : { giftTaxPaid: amount });
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            증여 {index + 1}
          </span>
          {gift.sourceCalculationId && (
            <span
              className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-800 rounded px-2 py-0.5"
              title="이 사전증여는 저장된 증여세 이력에서 자동 입력되었습니다. 필드를 수정하면 배지가 사라집니다."
            >
              📋 이력 기반
            </span>
          )}
          {isCorporate && (
            <span
              className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-800 rounded px-2 py-0.5"
              title="영리법인 사전증여 — 상증법 §13①2호 5년 합산 · §3의2② + 집행기준 28-0-1 면제"
              aria-label="영리법인 사전증여 — 상증법 §13① · §3의2② · 집행기준 28-0-1"
            >
              🏢 영리법인
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          삭제
        </button>
      </div>

      {/* 영리법인 토글 폐지 (donee-phase2) — 영리법인 여부는 Step1에서 결정,
       * 수증인은 아래 드롭다운에서 영리법인 포함 통일 선택. */}

      {/* 증여일 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          증여일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={gift.giftDate}
          onChange={(v) => set({ giftDate: v })}
        />
      </div>

      {/* 수증인과의 관계 — 증여세 모드 전용 (§53 증여재산공제 핵심 입력, 증여일 직후 유지) */}
      {showGiftPhaseA && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            수증인과의 관계
          </label>
          <select
            value={gift.doneeRelation ?? ""}
            onChange={(e) =>
              set({
                doneeRelation: (e.target.value || undefined) as
                  | DonorRelation
                  | undefined,
              })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">선택</option>
            {DONOR_RELATION_LIST.map((r) => (
              <option key={r} value={r}>
                {DONOR_RELATION_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ③ 수증자 드롭다운 — 상속세 모드 최상단 (증여일 직후).
       * 도메인: 증여인=피상속인(고정), 수증인=Step1 heirs 전체 중 선택(영리법인 포함 — donee-phase2).
       * doneeId 선택 시 isHeir·beneficiaryType·doneeRelation + 자동계산 세액 도출.
       * orphan(Step1 삭제) 가드: matchedHeir 없으면 amber 안내 + select value="".
       */}
      {showIsHeir && (heirs ?? []).length > 0 && (() => {
        const matchedHeir = (heirs ?? []).find((h) => h.id === gift.doneeId);
        const summaryLabel = (h: Heir): string => {
          if (h.relation === "corporate") {
            return h.isForProfit === false ? "비영리법인" : "영리법인";
          }
          return HEIR_RELATION_LABEL[h.relation];
        };
        return (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              수증자 (상속인·수유자·법인)
            </label>
            <select
              data-testid="gift-donee-select"
              value={matchedHeir ? gift.doneeId : ""}
              onChange={(e) => handleDoneeSelect(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">선택 안 함 (인별 배부 생략)</option>
              {(heirs ?? []).map((h) => (
                <option key={h.id} value={h.id}>
                  {summaryLabel(h)}
                  {h.name ? ` (${h.name})` : ""}
                  {h.relation !== "corporate" && isNonHeirRelation(h.relation)
                    ? " — 비상속인"
                    : ""}
                </option>
              ))}
            </select>

            {/* ④ 요약 배지 (read-only) — doneeId 선택 + 매칭 Heir 존재 */}
            {gift.doneeId && matchedHeir && (
              <div
                data-testid="gift-donee-summary"
                className="rounded-md bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 px-3 py-2 text-[11px] text-violet-700 dark:text-violet-300"
              >
                {summaryLabel(matchedHeir)}
                {matchedHeir.name ? ` (${matchedHeir.name})` : ""}
                {" · "}
                {deriveBeneficiaryTypeFromHeir(matchedHeir) === "heir"
                  ? "상속인 · §13①1호 10년 합산"
                  : "비상속인 · §13①2호 5년 합산"}
              </div>
            )}

            {/* ④' orphan 안내 — doneeId 있으나 매칭 Heir 삭제됨 */}
            {gift.doneeId && !matchedHeir && (
              <p
                data-testid="gift-donee-orphan"
                className="text-[11px] text-amber-600 dark:text-amber-400"
              >
                ⚠️ 지정한 수증자가 상속인 목록에서 삭제되었습니다 — 수증자를 다시 선택하세요.
              </p>
            )}

            {/* 미선택 안내 */}
            {!gift.doneeId && (
              <p className="text-[11px] text-sky-600 dark:text-sky-400">
                ⓘ 수증자를 지정하면 상속인별 배부표 ② 사전증여 열에 반영됩니다. (미지정 시 합산만)
              </p>
            )}
          </div>
        );
      })()}

      {/* ⑤ 상속인에게 증여 토글 + ⑥ 수증인과의 관계 — 상속세 모드 doneeId 미선택 시에만 (수동 경로).
       * isHeir(§13 게이트)가 doneeRelation(§53 관계)보다 위 — 사용자 지적 반영.
       * 관계 수동 선택 시 자동계산(P6 경로2).
       */}
      {showIsHeir && !isCorporate && !gift.doneeId && (
        <>
          <ToggleCard
            tone="violet"
            title="상속인에게 증여"
            description="상속인: 10년 이내 합산 (§13①1호) / 비상속인: 5년 이내 합산 (§13①2호)"
            checked={gift.isHeir}
            onCheckedChange={(v) =>
              set({ isHeir: v, beneficiaryType: v ? "heir" : "legatee" })
            }
          />
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              수증인과의 관계
            </label>
            <select
              value={gift.doneeRelation ?? ""}
              onChange={(e) =>
                handleManualRelationChange(
                  (e.target.value || undefined) as DonorRelation | undefined,
                )
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">선택</option>
              {DONOR_RELATION_LIST.map((r) => (
                <option key={r} value={r}>
                  {DONOR_RELATION_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* 증여가액 — 입력 시 자동 세액 재계산 */}
      <CurrencyInput
        label="증여재산가액"
        value={gift.giftAmount > 0 ? String(gift.giftAmount) : ""}
        onChange={handleGiftAmountChange}
        required
        hint="증여 당시 평가액 (시가 기준)"
      />

      {/* 세액 입력란 — 자동계산(수정 가능). 영리법인은 §3의2② 산출세액 상당액, 그 외는 기납부 증여세.
       * userTouchedTax(useRef) 미터치 시 giftAmount·doneeRelation 변경마다 자동 재계산. 수동 수정 시 고정. */}
      {(() => {
        const taxValue = isCorporate
          ? gift.corporateGiftComputedTax ?? 0
          : gift.giftTaxPaid;
        const showAutoBadge = !userTouchedTax && taxValue > 0;
        return (
          <div className="space-y-1">
            <CurrencyInput
              label={
                isCorporate
                  ? "§3의2② 산출세액 상당액 (자동·수정 가능)"
                  : "기납부 증여세 (자동·수정 가능)"
              }
              value={taxValue > 0 ? String(taxValue) : ""}
              onChange={handleTaxAmountChange}
              hint={
                isCorporate
                  ? "영리법인 증여세는 비과세(§4의2③). §3의2② 면제 한도 분자 — 증여재산가액·관계로 자동 산출."
                  : "§28 증여세액공제 계산 — 증여재산가액·수증자 관계로 자동 산출(수정 가능)."
              }
            />
            {showAutoBadge && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                🧮 자동계산 (증여재산가액 − §53 공제 → §56 세율). 직접 입력 시 자동 갱신 중지.
              </p>
            )}
          </div>
        );
      })()}

      {/* 신고서 부표 1 표시 메타 (선택 입력·기본 접힘) — 결과 화면 ②/③ 컬럼 표시용.
       * donee-phase2: 필수 입력과 시각 분리. print 시 자동 펼침([[print-only-css-toggle]]). */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <button
          type="button"
          onClick={() => setBesshiOpen((o) => !o)}
          className="flex items-center gap-2 w-full text-left print:hidden"
          data-testid="gift-besshi-toggle"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            부표
          </span>
          <p className="text-xs font-semibold text-sky-700 flex-1">
            증여재산 및 평가명세서 (별지 제10호서식 부표 1) 표시 (선택 입력)
          </p>
          <span className="text-sky-600 text-xs">{besshiOpen ? "▲" : "▼"}</span>
        </button>

        <div className={besshiOpen ? "block space-y-3" : "hidden print:block print:space-y-3"}>

        {/* 자산 종류 — 부표 1 ② 컬럼 */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-sky-700">
            자산 종류 — ② 재산종류코드
          </label>
          <select
            value={gift.propertyCategory ?? ""}
            onChange={(e) =>
              set({
                propertyCategory: (e.target.value || undefined) as
                  | GiftPriorPropertyCategory
                  | undefined,
              })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">선택 (미입력 시 &quot;12 기타재산&quot;으로 표시)</option>
            {GIFT_PRIOR_CATEGORY_LIST.map((c) => (
              <option key={c} value={c}>
                {GIFT_PRIOR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        {/* PR 3 (2026-05-22): 토지 부수토지 토글 — 02/03 코드 분기 */}
        {gift.propertyCategory === "real_estate_land" && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-sky-700">
              부수토지 여부 — 02/03 코드 분기
            </label>
            <div className="flex gap-2 text-xs">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={gift.isAttachedLandToBuilding === false}
                  onChange={() => set({ isAttachedLandToBuilding: false })}
                />
                <span>02 토지I (순수토지)</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  checked={gift.isAttachedLandToBuilding === true}
                  onChange={() => set({ isAttachedLandToBuilding: true })}
                />
                <span>03 토지II (일반건물 부수토지)</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer text-gray-500">
                <input
                  type="radio"
                  checked={gift.isAttachedLandToBuilding === undefined}
                  onChange={() => set({ isAttachedLandToBuilding: undefined })}
                />
                <span>미지정</span>
              </label>
            </div>
          </div>
        )}

        {/* 자산 명칭 */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-sky-700">
            자산 명칭
          </label>
          <input
            type="text"
            value={gift.propertyName ?? ""}
            onChange={(e) =>
              set({ propertyName: e.target.value || undefined })
            }
            placeholder="자산 명칭 입력"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* 소재지 — 부표 1 ③ 컬럼 */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-sky-700">
            소재지·법인명 — ③ 컬럼
          </label>
          <input
            type="text"
            value={gift.propertyLocation ?? ""}
            onChange={(e) =>
              set({ propertyLocation: e.target.value || undefined })
            }
            placeholder="부동산 소재지·법인명 입력"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[11px] text-sky-600">
            미입력 시 결과 화면 ③ 컬럼에 &quot;사전증여 (YYYY-MM-DD)&quot;로 표시됩니다.
          </p>
        </div>
        </div>
      </div>

      {/* Phase A: 증여세 모드 전용 — donor + ⑤ + ⑦ + 할증 + ⑫ */}
      {showGiftPhaseA && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
              §47
            </span>
            <p className="text-xs font-semibold text-violet-700">
              동일인 합산 정보 (§47 ② · §58 한도 산식용)
            </p>
          </div>

          {/* 증여자 (donor) */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-violet-700">
              증여자 (동일인 그룹 판정) <span className="text-destructive">*</span>
            </label>
            <select
              value={gift.donor ?? ""}
              onChange={(e) =>
                set({
                  donor: (e.target.value || undefined) as
                    | GiftDonorRelation
                    | undefined,
                })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">선택</option>
              {GIFT_DONOR_LIST.map((d) => (
                <option key={d} value={d}>
                  {GIFT_DONOR_LABELS[d]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-violet-600">
              현재 증여자와 동일인 그룹(부·모 또는 조부모)만 §47 합산 대상. 다른 그룹은 별개 신고로 자동 분리됩니다.
            </p>
          </div>

          {/* ⑤ 합산과세표준 */}
          <CurrencyInput
            label="그 회차 합산과세표준 ⑤"
            value={
              gift.giftTaxBase && gift.giftTaxBase > 0
                ? String(gift.giftTaxBase)
                : ""
            }
            onChange={(v) => set({ giftTaxBase: parseAmount(v) || undefined })}
            hint="신고서 ⑤ 값. §58 한도 산식 분자(가장 최근 합산 회차) 용도."
          />

          {/* ⑦ 산출세액 */}
          <CurrencyInput
            label="그 회차 산출세액 ⑦"
            value={
              gift.computedTax && gift.computedTax > 0
                ? String(gift.computedTax)
                : ""
            }
            onChange={(v) => set({ computedTax: parseAmount(v) || undefined })}
            hint="신고서 ⑦ 값. §58 가산 증여재산 산출세액(가장 최근 합산 회차)."
          />

          {/* 세대생략 토글 */}
          <ToggleCard
            tone="rose"
            title="그 회차에 세대생략 할증 적용 (§57)"
            description="조부모→손자 등 세대생략 증여 회차였으면 ON. donor=조부모 시 자동 ON 권장."
            checked={gift.wasGenerationSkip ?? false}
            onCheckedChange={(v) => set({ wasGenerationSkip: v })}
          />

          {/* ⑫ 추가 할증세액 (할증 ON 시만) */}
          {gift.wasGenerationSkip && (
            <CurrencyInput
              label="그 회차 추가 할증세액 ⑫"
              value={
                gift.additionalGenerationSkipSurcharge &&
                gift.additionalGenerationSkipSurcharge > 0
                  ? String(gift.additionalGenerationSkipSurcharge)
                  : ""
              }
              onChange={(v) =>
                set({
                  additionalGenerationSkipSurcharge:
                    parseAmount(v) || undefined,
                })
              }
              hint="신고서 ⑫ 값. §57 누적 기할증과세액 ⑨ 산정용."
            />
          )}
        </div>
      )}

      {/* 요약 미리보기 */}
      {gift.giftAmount > 0 && (
        <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
          <span>증여가액</span>
          <span className="font-medium">{formatKRW(gift.giftAmount)}</span>
        </div>
      )}
    </div>
  );
}
