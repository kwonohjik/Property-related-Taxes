"use client";

/**
 * GiftRowEditor — 개별 사전증여 행 편집기.
 *
 * PriorGiftInput.tsx 800줄 분할 (PR Z, 2026-05-22).
 * 2-B (2026-05-29): 수증자(Heir) select 추가 — doneeId + isHeir 동시 동기화.
 */

import { useRef } from "react";
import {
  CurrencyInput,
  parseAmount,
  formatKRW,
} from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CorporateGiftFields } from "@/components/calc/prior-gift/CorporateGiftFields";
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

// ============================================================
// 수증자 select 헬퍼
// ============================================================

/** Heir.relation이 비상속인(수유자·영리법인)인지 판정 */
function isNonHeirRelation(relation: HeirRelation): boolean {
  return relation === "legatee" || relation === "corporate";
}

/** Heir.id → isHeir 도출 (relation 기반, isHeir prop 보조) */
function deriveIsHeirFromHeir(h: Heir): boolean {
  // Heir.isHeir prop이 명시된 경우 우선
  if (h.isHeir !== undefined) return h.isHeir;
  // relation으로 자동 추론
  return !isNonHeirRelation(h.relation);
}

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

  // 영리법인 ON↔OFF 사이클에서 prev 상태 보존 (계획서 §4-1-b · 디자인 §2-1)
  // 카드-local — store 글로벌 보존 금지, PriorGift 메타 신설 금지
  const prevRef = useRef<{
    isHeir: boolean;
    doneeRelation?: DonorRelation;
    giftTaxPaid: number;
  } | null>(null);

  const isCorporate = gift.beneficiaryType === "corporate";

  // ============================================================
  // 2-B: 수증자 select onChange 핸들러
  // useEffect → store 미러링 금지 정책 준수 — onChange에서 doneeId·isHeir 동시 patch.
  // ============================================================
  function handleDoneeSelect(heirId: string) {
    if (!heirId) {
      // "선택 안 함" → doneeId 제거, isHeir 기존값 유지
      set({ doneeId: undefined });
      return;
    }
    const selectedHeir = (heirs ?? []).find((h) => h.id === heirId);
    if (!selectedHeir) {
      set({ doneeId: heirId });
      return;
    }
    // doneeId + isHeir 동시 patch — §2.3 N1 교차 일관성 준수
    // isWithin13Cutoff(inheritance-gift-common.ts:295)가 gift.isHeir로 cutoff 10년/5년 판정
    const derivedIsHeir = deriveIsHeirFromHeir(selectedHeir);
    set({ doneeId: heirId, isHeir: derivedIsHeir });
  }

  function handleCorporateToggle(on: boolean) {
    if (on) {
      // ON 클릭 시점의 최신 gift 값을 캡처
      prevRef.current = {
        isHeir: gift.isHeir,
        doneeRelation: gift.doneeRelation,
        giftTaxPaid: gift.giftTaxPaid,
      };
      set({
        beneficiaryType: "corporate",
        isHeir: false, // 엔진 line 305: gift.isHeir ? 10 : 5 → §13①2호 5년 컷오프 강제
        doneeRelation: undefined,
        giftTaxPaid: 0, // §28 공제 중복 방지 (영리법인 §4의2③ 비과세)
      });
    } else {
      const prev = prevRef.current ?? {
        isHeir: true,
        doneeRelation: undefined,
        giftTaxPaid: 0,
      };
      set({
        beneficiaryType: undefined,
        corporateGiftComputedTax: undefined,
        isHeir: prev.isHeir,
        doneeRelation: prev.doneeRelation,
        giftTaxPaid: prev.giftTaxPaid,
      });
      prevRef.current = null;
    }
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

      {/* 영리법인 분기 토글 (상속세 모드 전용) — §13①2호 5년 합산 + §3의2② + 집행기준 28-0-1 면제 */}
      {showIsHeir && (
        <ToggleCard
          tone="violet"
          variant="card"
          title="🏢 수증인 = 영리법인"
          description="상증법 §13①2호 5년 합산 · §3의2② + 집행기준 28-0-1 공제"
          checked={isCorporate}
          onCheckedChange={handleCorporateToggle}
        >
          <CorporateGiftFields gift={gift} set={set} heirs={heirs} />
        </ToggleCard>
      )}

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

      {/* 수증자 관계 */}
      <div className="space-y-1">
        <label
          className={`block text-xs font-medium ${
            isCorporate ? "text-gray-400" : "text-gray-600 dark:text-gray-400"
          }`}
        >
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
          disabled={isCorporate}
          title={isCorporate ? "영리법인 — 자연인 관계 미적용" : undefined}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500"
        >
          <option value="">선택</option>
          {DONOR_RELATION_LIST.map((r) => (
            <option key={r} value={r}>
              {DONOR_RELATION_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {/* 수증자(상속인·수유자) select — 2-B: 인별 배부 대상 지정
       * 영리법인 ON 시 CorporateGiftFields.doneeId가 처리하므로 숨김.
       * doneeId 선택 시 isHeir를 onChange에서 동시 patch (useEffect 미러링 금지 준수).
       * 미선택 허용(자동 안분 fallback 금지 정책) — 미지정 시 ② 인별 배부 0 + 안내 배지.
       */}
      {showIsHeir && !isCorporate && (heirs ?? []).length > 0 && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            수증자 (상속인·수유자)
          </label>
          <select
            data-testid="gift-donee-select"
            value={gift.doneeId ?? ""}
            onChange={(e) => handleDoneeSelect(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">선택 안 함 (인별 배부 생략)</option>
            {(heirs ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {HEIR_RELATION_LABEL[h.relation]}
                {h.name ? ` (${h.name})` : ""}
                {isNonHeirRelation(h.relation) ? " — 비상속인" : ""}
              </option>
            ))}
          </select>
          {!gift.doneeId && (
            <p className="text-[11px] text-sky-600 dark:text-sky-400">
              ⓘ 수증자를 지정하면 상속인별 배부표 ② 사전증여 열에 반영됩니다.
            </p>
          )}
          {gift.doneeId && (
            <p className="text-[11px] text-violet-600 dark:text-violet-400">
              ✓ 상속인 여부가 수증자 관계에서 자동 결정됩니다.
            </p>
          )}
        </div>
      )}

      {/* 상속인 여부 (상속세 전용 · 영리법인 ON 시 disabled)
       * 2-B: doneeId 지정 시 — isHeir가 수증자 관계에서 자동 도출되므로 disabled(읽기 전용 표시).
       *      doneeId 미지정 시 — 사용자 수동 입력 가능 (기존 동작 유지).
       */}
      {showIsHeir && (
        <ToggleCard
          tone="violet"
          title="상속인에게 증여"
          description="상속인: 10년 이내 합산 (§13①1호) / 비상속인: 5년 이내 합산 (§13①2호)"
          checked={gift.isHeir}
          onCheckedChange={(v) => set({ isHeir: v })}
          disabled={isCorporate || !!gift.doneeId}
          disabledReason={
            isCorporate
              ? "영리법인 — §13①2호 5년 합산 자동 적용 (상속인 분류 미적용)"
              : gift.doneeId
                ? "수증자 지정됨 — 상속인 여부가 수증자 관계에서 자동 결정됩니다"
                : undefined
          }
        />
      )}

      {/* 증여가액 */}
      <CurrencyInput
        label="증여재산가액"
        value={gift.giftAmount > 0 ? String(gift.giftAmount) : ""}
        onChange={(v) => set({ giftAmount: parseAmount(v) })}
        required
        hint="증여 당시 평가액 (시가 기준)"
      />

      {/* 기납부 증여세 (영리법인 ON 시 disabled — §4의2③ 비과세 → §3의2②로 별도 공제) */}
      <CurrencyInput
        label="기납부 증여세"
        value={gift.giftTaxPaid > 0 ? String(gift.giftTaxPaid) : ""}
        onChange={(v) => set({ giftTaxPaid: parseAmount(v) })}
        hint={
          isCorporate
            ? "영리법인 — 증여세 비과세 (§4의2③). 위 ToggleCard 펼침 영역의 §3의2② 산출세액 상당액으로 공제."
            : "§28 증여세액공제 계산에 사용 — 납부하지 않았으면 0"
        }
        disabled={isCorporate}
      />

      {/* 신고서 부표 1 표시 메타 (선택 입력) — 결과 화면 ②/③ 컬럼 표시용 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            부표
          </span>
          <p className="text-xs font-semibold text-sky-700">
            증여재산 및 평가명세서 (별지 제10호서식 부표 1) 표시 (선택 입력)
          </p>
        </div>

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
