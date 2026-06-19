"use client";

/**
 * GiftRowEditor — 개별 사전증여 행 편집기.
 *
 * PriorGiftInput.tsx 800줄 분할 (PR Z, 2026-05-22).
 * 2-B (2026-05-29): 수증자(Heir) select 추가 — doneeId + isHeir 동시 동기화.
 * [B+C] 2026-06-07: 과세표준 산정 방식(B)·증여 당시 미성년 토글(C) 추가.
 *   sub-components: GiftTaxBaseModeBlock, MinorAtGiftToggleBlock (800줄 정책 준수).
 */

import { useState } from "react";
import {
  CurrencyInput,
  parseAmount,
} from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  DONOR_RELATION_LABELS,
  DONOR_RELATION_LIST,
  GIFT_DONOR_LABELS,
  GIFT_DONOR_LIST,
  GIFT_PRIOR_CATEGORY_LIST,
  GIFT_PRIOR_CATEGORY_LABELS,
  donorSummaryLabel,
} from "@/components/calc/prior-gift/meta";
import type {
  PriorGift,
  DonorRelation,
  GiftDonorRelation,
  GiftPriorPropertyCategory,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  deriveIsHeirFromHeir,
  deriveBeneficiaryTypeFromHeir,
  deriveDoneeRelationFromHeir,
} from "@/lib/calc/prior-gift-donee-derive";
import {
  autoComputePriorGiftTax,
  computePriorGiftBaseTaxPrefill,
} from "@/lib/calc/prior-gift-auto-tax";
import { isInheritancePriorGiftMarriageBirthEligible } from "@/lib/calc/prior-gift-marriage-birth-rule";
import { GiftTaxBaseModeBlock } from "@/components/calc/prior-gift/GiftTaxBaseModeBlock";
import { MinorAtGiftToggleBlock } from "@/components/calc/prior-gift/MinorAtGiftToggleBlock";

// ============================================================
// 수증자 select 헬퍼 — 파생 로직은 lib/calc/prior-gift-donee-derive.ts 단일 진실,
// 요약 라벨(donorSummaryLabel)은 meta.ts 단일 진실 (PriorGiftTableView 공용).
// ============================================================

export interface GiftRowEditorProps {
  gift: PriorGift;
  index: number;
  /** 모달 내부 렌더 시 헤더부(번호·배지·삭제) 숨김 — DialogTitle·푸터와 중복 방지 */
  hideHeader?: boolean;
  /** 상속세 모드: 상속인 여부 선택 표시 / 증여세 모드: 숨김 */
  showIsHeir: boolean;
  /** 증여세 모드: donor·⑤·⑦·⑫ Phase A 필드 표시 */
  showGiftPhaseA: boolean;
  /**
   * 상속 모드 전용 — 조특법 특례 구분(specialTreatmentType)·기납부 특례세액(priorSpecialTaxPaid) 표시.
   * §30의5⑨·§30의6⑤: 특례 prior는 §13 기간 무관 가산 → 상속세 모드에서도 입력 필요.
   * donor·⑤·⑦·할증·⑫ 블록은 증여세 모드 전용(showGiftPhaseA) 그대로 유지.
   */
  showSpecialType?: boolean;
  onUpdate: (updated: PriorGift) => void;
  onRemove: () => void;
  /** 상속세 모드 — 영리법인 doneeId select 옵션 (PR-C) */
  heirs?: Heir[];
}

export function GiftRowEditor({
  gift,
  index,
  hideHeader = false,
  showIsHeir,
  showGiftPhaseA,
  showSpecialType = false,
  onUpdate,
  onRemove,
  heirs,
}: GiftRowEditorProps) {
  const set = (patch: Partial<PriorGift>) => onUpdate({ ...gift, ...patch });

  // 세액 입력란(giftTaxPaid·corporateGiftComputedTax 공통) 사용자 수동 수정 여부 — 자동 덮어쓰기 차단.
  // 카드-local useState (showAutoBadge가 render에 영향 → ref 아닌 state. useEffect→store 미러링 아님).
  const [userTouchedTax, setUserTouchedTax] = useState(false);

  // 증여세 모드 ⑤·⑦ prefill 수동 수정 여부 — 자동 덮어쓰기 차단.
  // 이력 채움 행(sourceCalculationId)은 초기 true로 prefill이 이력 ⑤·⑦을 덮지 않게 보호 (R6).
  const [userTouchedBaseTax, setUserTouchedBaseTax] = useState(
    Boolean(gift.sourceCalculationId),
  );

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
      // 세액 0(가액 미입력 등)이면 cgct를 undefined로 — 0 store 잔재 예방(빈칸 버그 발생 경로 차단).
      return {
        corporateGiftComputedTax: tax > 0 ? tax : undefined,
        giftTaxPaid: 0,
        giftTaxBase: undefined,
      };
    }
    return { giftTaxPaid: tax };
  }

  /**
   * 증여세 모드 ⑤·⑦ prefill patch (store commit — D1).
   *   donor + 증여재산가액에서 §53 관계 도출 → 단순 1건 ⑤·⑦ 추정값을 실제 store에 반영.
   *   표시 fallback이 아니라 store commit이라야 validate(동일그룹 ⑤·⑦ 필수)를 통과한다.
   *   게이트: 증여세 모드 + 미터치 + 비특례 + donor·가액 존재 (computePriorGiftBaseTaxPrefill).
   */
  function computeBaseTaxPatch(next: PriorGift): Partial<PriorGift> {
    if (!showGiftPhaseA || userTouchedBaseTax) return {};
    if (next.specialTreatmentType) return {}; // 특례는 §47 합산 제외 → prefill 불필요
    const prefill = computePriorGiftBaseTaxPrefill(
      next.donor,
      next.giftAmount ?? 0,
    );
    if (!prefill) return {};
    // 과세표준 0(공제 이하)은 빈칸 유지 → 사용자 직접 입력 유도 (validate >0 정합)
    return {
      giftTaxBase: prefill.giftTaxBase || undefined,
      computedTax: prefill.computedTax || undefined,
    };
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
  //   증여세 모드: ⑤·⑦ prefill(store commit) / 상속세 모드: 기납부 증여세 자동계산
  function handleGiftAmountChange(v: string) {
    const giftAmount = parseAmount(v);
    const next = { ...gift, giftAmount };
    set({
      giftAmount,
      ...(showGiftPhaseA
        ? computeBaseTaxPatch(next)
        : computeTaxPatch(next)),
    });
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
    <div
      className={
        hideHeader
          ? "space-y-3"
          : "border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900"
      }
    >
      {/* 헤더 — 모달 내부(hideHeader)에서는 DialogTitle·푸터 삭제 버튼과 중복이라 숨김 */}
      {!hideHeader && (
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
      )}

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

      {/* 증여자(donor) — 증여세 모드 전용. 증여일 직후 배치 = "누가 줬나" 단일 입력.
       *  §47 동일인 합산 그룹 판정 + §53 증여재산공제 관계(deriveDonorRelation)를 모두 이 값에서 도출.
       *  구 "수증인과의 관계"(doneeRelation) Select 폐지 — donor와 중복·증여세 엔진 미사용. */}
      {showGiftPhaseA && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            증여자 (동일인 그룹 판정) <span className="text-destructive">*</span>
          </label>
          <select
            data-testid="gift-prior-donor-select"
            value={gift.donor ?? ""}
            onChange={(e) => {
              const donor = (e.target.value || undefined) as
                | GiftDonorRelation
                | undefined;
              set({ donor, ...computeBaseTaxPatch({ ...gift, donor }) });
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">선택</option>
            {GIFT_DONOR_LIST.map((d) => (
              <option key={d} value={d}>
                {GIFT_DONOR_LABELS[d]}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            현재 증여자와 동일인 그룹(부·모 또는 조부모)만 §47 합산 대상. §53 증여재산공제 관계도 이 값에서 자동 도출됩니다.
          </p>
        </div>
      )}

      {/* ③ 수증자 드롭다운 — 상속세 모드 최상단 (증여일 직후).
       * 도메인: 증여인=피상속인(고정), 수증인=Step1 heirs 전체 중 선택(영리법인 포함 — donee-phase2).
       * doneeId 선택 시 isHeir·beneficiaryType·doneeRelation + 자동계산 세액 도출.
       * orphan(Step1 삭제) 가드: matchedHeir 없으면 amber 안내 + select value="".
       */}
      {showIsHeir && (heirs ?? []).length > 0 && (() => {
        const matchedHeir = (heirs ?? []).find((h) => h.id === gift.doneeId);
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
                  {donorSummaryLabel(h)}
                  {h.name ? ` (${h.name})` : ""}
                  {h.relation !== "corporate" && !deriveIsHeirFromHeir(h)
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
                {donorSummaryLabel(matchedHeir)}
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

      {/* 증여가액 — 입력 시 자동 세액 재계산. 증여세 모드는 hint 생략(입력 간결화). */}
      <CurrencyInput
        label="증여재산가액"
        value={gift.giftAmount > 0 ? String(gift.giftAmount) : ""}
        onChange={handleGiftAmountChange}
        required
        hint={showGiftPhaseA ? undefined : "증여 당시 평가액 (시가 기준)"}
      />

      {/* ⑤·⑦ 과세표준·산출세액 — 증여세 모드 전용. 증여재산가액 흐름에 연속 배치(카드 래퍼 없음).
       *  D2: 조특법 특례 회차는 §47 합산 제외 → 숨김. prefill(store commit)·userTouchedBaseTax 유지. */}
      {showGiftPhaseA && !gift.specialTreatmentType && (
        <>
          <CurrencyInput
            label="과세표준 ⑤"
            value={
              gift.giftTaxBase && gift.giftTaxBase > 0
                ? String(gift.giftTaxBase)
                : ""
            }
            onChange={(v) => {
              setUserTouchedBaseTax(true);
              set({ giftTaxBase: parseAmount(v) || undefined });
            }}
          />
          <CurrencyInput
            label="산출세액 ⑦"
            value={
              gift.computedTax && gift.computedTax > 0
                ? String(gift.computedTax)
                : ""
            }
            onChange={(v) => {
              setUserTouchedBaseTax(true);
              set({ computedTax: parseAmount(v) || undefined });
            }}
          />
        </>
      )}

      {/* [B] 과세표준 산정 방식 — 상속세 모드(showIsHeir) 전용.
       * 위치: 증여가액 다음, §53의2 직전 (§53 도출 직전 = 계산 로직 순서).
       * auto 복귀 시 marriageBirthDeduction 보존(초기화 금지). */}
      {showIsHeir && !isCorporate && (
        <GiftTaxBaseModeBlock
          gift={gift}
          set={set}
          groupName={`priorGiftTaxBaseInputMode-${index}`}
        />
      )}

      {/* [C] 증여 당시 미성년 토글 — 상속세 모드 + 자녀(lineal_descendant) 수증 시.
       * birthDate 있으면 자동 판정 안내만 표시, 없으면 토글.
       * doneeRelation=lineal_descendant: 피상속인 관점 자녀 = §53 직계존속 공제 대상.
       * 영리법인·증여세 모드는 미적용. */}
      {showIsHeir &&
        !isCorporate &&
        gift.doneeRelation === "lineal_descendant" && (() => {
          const matchedHeir = (heirs ?? []).find((h) => h.id === gift.doneeId);
          return (
            <MinorAtGiftToggleBlock
              gift={gift}
              set={set}
              heirBirthDate={matchedHeir?.birthDate}
            />
          );
        })()}

      {/* §53의2 혼인·출산 증여재산공제 — 상속세 모드 + 피상속인의 직계비속(자녀 등)만 노출 (2026-06-07)
       * 게이트: showIsHeir(상속세) AND doneeRelation===lineal_descendant (피상속인 관점 — 수증자가 피상속인의 직계비속)
       * 자녀가 피상속인(=자녀의 직계존속)으로부터 받은 사전증여가 §53의2 주 케이스.
       * giftTaxBase 입력 건은 §53의2 이미 반영 → 위젯 숨김 + 안내 표시 */}
      {showIsHeir &&
        isInheritancePriorGiftMarriageBirthEligible(gift.doneeRelation) && (
          <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
                §53의2
              </span>
              <p className="text-xs font-semibold text-sky-700">
                혼인·출산 증여재산공제 (직계존속 한정)
              </p>
            </div>
            {gift.giftTaxBase != null ? (
              <p className="text-[11px] text-sky-600 dark:text-sky-400">
                ⓘ 과세표준을 직접 입력한 경우 §53의2는 이미 반영된 것으로 간주합니다.
              </p>
            ) : (
              <CurrencyInput
                label="§53의2 적용액 (혼인·출산 합산 최대 1억)"
                value={
                  gift.marriageBirthDeduction && gift.marriageBirthDeduction > 0
                    ? String(gift.marriageBirthDeduction)
                    : ""
                }
                onChange={(v) =>
                  set({ marriageBirthDeduction: parseAmount(v) || undefined })
                }
                hint="직계존속으로부터 혼인일 전후 2년 / 출생·입양 2년 내 증여에 적용된 §53의2 공제액. 합산 1억 한도."
              />
            )}
            {/* MBC-07 — 수동 경로(doneeId 없음)는 동일 수증자 합산 1억 캡 보장 불가 안내 */}
            {!gift.doneeId &&
              gift.marriageBirthDeduction != null &&
              gift.marriageBirthDeduction > 0 && (
                <p className="text-[11px] text-sky-600 dark:text-sky-400">
                  ⓘ 동일 수증자에게 혼인·출산을 여러 건 입력할 때는 위 <strong>수증자 선택</strong>으로
                  지정하세요. 수증자를 지정하지 않으면 합산 1억 한도가 건별로 적용됩니다(§53의2③).
                </p>
              )}
          </div>
        )}

      {/* 세액 입력란 — 자동계산(수정 가능). 영리법인은 §3의2② 산출세액 상당액, 그 외는 기납부 증여세.
       * userTouchedTax 미터치 시 giftAmount·doneeRelation 변경마다 자동 재계산. 수동 수정 시 고정.
       * ★ 진입 fallback(phase2-후속): 영리법인 cgct 미설정(undefined)이고 가액 있으면, onChange 트리거 없이도
       *   표시값을 autoComputePriorGiftTax로 derive (기존 데이터·진입 시점 빈칸 해소). store mirror 아님(표시 전용).
       *   계산 정합은 lib/calc/inheritance-api.ts API fallback이 동일 산식으로 보장(mirror 3중). */}
      {/* 기납부 증여세 — 상속세 모드 전용(§28 증여세액공제용).
       *  증여세 모드는 §58이 ⑦(computedTax)을 쓰므로 미사용 → 숨김. */}
      {!showGiftPhaseA && (() => {
        const corpNeedsFallback =
          isCorporate &&
          (gift.corporateGiftComputedTax === undefined ||
            gift.corporateGiftComputedTax <= 0) &&
          (gift.giftAmount ?? 0) > 0 &&
          !userTouchedTax;
        const taxValue = corpNeedsFallback
          ? autoComputePriorGiftTax(gift.giftAmount ?? 0, gift.doneeRelation)
          : isCorporate
            ? gift.corporateGiftComputedTax ?? 0
            : gift.giftTaxPaid;
        const showAutoBadge = !userTouchedTax && taxValue > 0;
        return (
          <div className="space-y-1">
            <CurrencyInput
              label={
                isCorporate
                  ? "⑩a 상속인외 증여세 산출세액"
                  : "기납부 증여세 (자동·수정 가능)"
              }
              value={taxValue > 0 ? String(taxValue) : ""}
              onChange={handleTaxAmountChange}
              hint={
                isCorporate
                  ? "영리법인 증여세는 비과세(§4의2③). §3의2② 면제 한도 분자 — 증여재산가액·관계로 자동 산출(수정 가능)."
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

      {/* 과세특례 구분 — §30의5·§30의6 해당 여부.
       * 증여세 모드(showGiftPhaseA): 기존 §47 합산 제외, 특례 스트림 분리 안내.
       * 상속세 모드(showSpecialType): §30의5⑨·§30의6⑤ — 기간 무관 가산 안내.
       * donor·⑤·⑦·할증·⑫ 블록(§47 카드)은 showGiftPhaseA 단독 유지(상속 모드 숨김).
       */}
      {(showGiftPhaseA || showSpecialType) && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
              §30
            </span>
            <p className="text-xs font-semibold text-emerald-700">
              이 사전증여의 조특법 과세특례 여부
            </p>
          </div>
          <RadioCardGroup<"none" | "startup" | "family_business">
            name={`priorGiftSpecialType-${index}`}
            tone="emerald"
            layout="inline"
            value={gift.specialTreatmentType ?? "none"}
            onChange={(v) =>
              set({
                specialTreatmentType: v === "none" ? undefined : (v as "startup" | "family_business"),
                // 특례 타입 초기화 시 priorSpecialTaxPaid도 초기화
                ...(v === "none" ? { priorSpecialTaxPaid: undefined } : {}),
              })
            }
            options={[
              { value: "none", label: "일반 증여" },
              { value: "startup", label: "창업자금 §30의5" },
              { value: "family_business", label: "가업승계 §30의6" },
            ]}
          />
          {gift.specialTreatmentType === "startup" && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              {showGiftPhaseA
                ? "§30의5① 후단 — 창업자금은 증여 시기와 무관하게 현재 신고분과 합산됩니다. §47②(10년 합산)에서 제외되어 별도 특례 스트림으로 계산됩니다."
                : "§30의5⑧⑨ — 창업자금은 §13 10년/5년 기간과 관계없이 상속세 과세가액에 가산됩니다 (조특법 §30의5⑨)."}
            </p>
          )}
          {gift.specialTreatmentType === "family_business" && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              {showGiftPhaseA
                ? "§30의6 — 가업승계는 §30의5 제8항~제13항 준용. 과거 가업승계 prior는 기간무관 합산됩니다."
                : "§30의6⑤ — 가업승계 주식은 §30의5⑧~⑬ 준용. §13 기간과 관계없이 상속세 과세가액에 가산됩니다."}
            </p>
          )}
          {/* 상속세 모드 — 특례 prior의 §28/§30의5⑩ 공제액 입력 (증여 당시 납부한 증여세액) */}
          {showSpecialType && !showGiftPhaseA && gift.specialTreatmentType && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
              ⓘ §30의5⑩ — 창업자금·가업승계 특례 증여세액은 상속세 산출세액에서 전액 직접 공제됩니다 (§28 안분 한도 미적용). 증여 당시 납부한 증여세를 아래 &quot;기납부 증여세&quot; 란에 입력하세요.
            </p>
          )}
          {/* 기납부 특례세액 — 특례 타입 선택 시 노출 (증여세 모드: §30의5①후단 차감 / 상속세 모드: §30의5⑩ 공제 분자) */}
          {gift.specialTreatmentType && (
            <CurrencyInput
              label={
                showGiftPhaseA
                  ? "그 회차에 납부한 특례세액 (기납부 특례세액 차감용)"
                  : "기납부 증여세 (§30의5⑩ — 자동·수정 가능)"
              }
              value={
                showGiftPhaseA
                  ? (gift.priorSpecialTaxPaid && gift.priorSpecialTaxPaid > 0
                      ? String(gift.priorSpecialTaxPaid)
                      : "")
                  : (gift.giftTaxPaid > 0 ? String(gift.giftTaxPaid) : "")
              }
              onChange={(v) =>
                showGiftPhaseA
                  ? set({ priorSpecialTaxPaid: parseAmount(v) || undefined })
                  : (() => {
                      setUserTouchedTax(true);
                      set({ giftTaxPaid: parseAmount(v) });
                    })()
              }
              hint={
                showGiftPhaseA
                  ? "§30의5①후단 합산 시 기납부 특례세액 차감 (max(0, 합산기준특례산출세액 - Σ기납부)). 없으면 빈칸."
                  : "§30의5⑩ — 증여 당시 납부한 창업자금·가업승계 증여세액 (안분 없이 상속세 산출세액에서 직접 전액 공제, 초과환급 없음). 기납부 증여세 란에서 입력한 값과 동일합니다."
              }
            />
          )}
        </div>
      )}

      {/* 세대생략 할증 — 증여세 모드 전용, §30 다음 독립 배치 (구 §47 카드에서 분리).
       *  D2: 조특법 특례 회차는 §47 합산 제외 → 숨김. */}
      {showGiftPhaseA && !gift.specialTreatmentType && (
        <>
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
              hint="신고서 ⑱ 값. §57 누적 기할증과세액 ⑨ 산정용."
            />
          )}
        </>
      )}

      {/* 신고서 부표 1 표시 메타 (선택 입력·기본 접힘·맨 뒤 배치) — 결과 화면 ②/③ 컬럼 표시용.
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
            <RadioCardGroup<"pure" | "attached" | "unspecified">
              name={`attachedLandToBuilding-${index}`}
              tone="sky"
              layout="inline"
              value={
                gift.isAttachedLandToBuilding === undefined
                  ? "unspecified"
                  : gift.isAttachedLandToBuilding
                    ? "attached"
                    : "pure"
              }
              onChange={(v) =>
                set({
                  isAttachedLandToBuilding:
                    v === "unspecified" ? undefined : v === "attached",
                })
              }
              options={[
                { value: "pure", label: "02 토지I (순수토지)" },
                { value: "attached", label: "03 토지II (일반건물 부수토지)" },
                { value: "unspecified", label: "미지정" },
              ]}
            />
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

    </div>
  );
}
