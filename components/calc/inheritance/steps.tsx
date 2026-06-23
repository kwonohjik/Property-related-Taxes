"use client";

/**
 * InheritanceTaxForm Steps 0~5 — 800줄 정책 분리
 *
 * InheritanceTaxForm.tsx에서 추출. FormState 타입은 인근에서 import.
 */

import { useState, useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { AddressSearch } from "@/components/ui/address-search";
import type { AddressValue } from "@/components/ui/address-search";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";
import { PriorGiftInput } from "@/components/calc/PriorGiftInput";
import { HeirComposition } from "@/components/calc/HeirComposition";
import { CohabitantDependentSection } from "./CohabitantDependentSection";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { DebtAllocationInput } from "./DebtAllocationInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deriveCollateralDebts } from "@/lib/tax-engine/inheritance-collateral-debt";
import type { DeductionSuggestion } from "@/lib/calc/inheritance-deduction-suggest";
import type { FormState, FormSet } from "./shared";

/** Step4 추가공제 자동 도출값 — InheritanceTaxForm useMemo에서 계산해 prop 전달(3중 일치). */
export type Step4Autos = {
  spouse: DeductionSuggestion;
  netFin: DeductionSuggestion;
  cohabit: DeductionSuggestion & { securedDebt: number };
  farming: DeductionSuggestion;
  legatee: DeductionSuggestion;
};

// ============================================================
// Step 0 — 피상속인 기본 정보 + 상속인·수유자 구성
// 색상 카드 + 섹션 번호 패턴 (components/calc/CLAUDE.md 강제)
// ============================================================

/** AddressSearch 빈 값 (undefined 대신 빈 객체로 컴포넌트에 전달) */
const EMPTY_ADDRESS: AddressValue = {
  road: "",
  jibun: "",
  building: "",
  detail: "",
  lng: "",
  lat: "",
};

export function Step0({
  form,
  set,
  setHeirs,
}: {
  form: FormState;
  set: FormSet;
  setHeirs: (heirs: FormState["heirs"]) => void;
}) {
  return (
    <div className="space-y-3">
      {/* 섹션 ① — 피상속인 기본 정보 (sky tone) */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            1
          </span>
          <p className="text-xs font-semibold text-sky-700">피상속인 기본 정보</p>
        </div>

        {/* 1행 — 항상 3컬럼 고정 (성명·주민등록번호·상속개시일) */}
        <div className="grid grid-cols-3 gap-3">
          <div className="min-w-0 space-y-1.5">
            <label className="block text-sm font-medium">피상속인 성명</label>
            <input
              type="text"
              value={form.decedentName}
              onChange={(e) => set({ decedentName: e.target.value })}
              placeholder="성명"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <label className="block text-sm font-medium">주민등록번호</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.decedentResidentNumber}
              onChange={(e) => set({ decedentResidentNumber: e.target.value })}
              placeholder="앞 6자리-뒤 7자리"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <label className="block text-sm font-medium">
              상속개시일 (사망일) <span className="text-destructive">*</span>
            </label>
            <DateInput value={form.deathDate} onChange={(v) => set({ deathDate: v })} />
          </div>
        </div>

        {/* 2행 — 거주자 여부 (RadioCardGroup inline) */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">거주자 여부</label>
          <RadioCardGroup
            lawLinks="상증법"
            name="decedentType"
            layout="inline"
            tone="sky"
            value={form.decedentType}
            onChange={(v) => set({ decedentType: v as "resident" | "non_resident" })}
            options={[
              { value: "resident", label: "거주자" },
              { value: "non_resident", label: "비거주자" },
            ]}
          />
        </div>

        {/* 3행 — 주소 (Vworld 검색, 선택 입력) */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            피상속인 주소
          </label>
          <AddressSearch
            value={form.decedentAddress ?? EMPTY_ADDRESS}
            onChange={(v) => set({ decedentAddress: v })}
          />
        </div>
      </div>

      {/* 섹션 ② — 상속인·수유자 구성 (violet tone). 헤더(번호·제목·6명·추가버튼)는 HeirComposition이 렌더 */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
        {/* B-2 (2026-06-01): deathDate 전달 — legatee 미성년 자동 판정용 */}
        <HeirComposition heirs={form.heirs} onChange={setHeirs} deathDate={form.deathDate} />
        <CollapsibleHintCard tone="sky" summary="협의분할·법정상속분 배분 안내">
          <p className="text-sky-800 dark:text-sky-200 leading-relaxed">
            협의분할은 각 <strong>자산 카드</strong>에서 상속인별로 분배합니다. 분배를 입력하지 않은 자산은
            <strong> 법정상속분</strong>(배우자 1.5 : 직계비속·직계존속 1)으로 자동 배분됩니다.
          </p>
        </CollapsibleHintCard>
      </div>

      {/* 섹션 ③ — 동거가족 인적공제 (비상속인 부양가족, 시령 §18①) — ② 밖 독립 섹션 */}
      <CohabitantDependentSection
        value={form.cohabitantDependents}
        onChange={(deps) => set({ cohabitantDependents: deps })}
        deathDate={form.deathDate}
      />
    </div>
  );
}

// ============================================================
// Step 1 — 상속재산 평가 + 추정상속재산 §15
// (800줄 정책: Step1Estate.tsx로 분리, import 사이트 호환 위해 re-export)
// ============================================================

export { Step1 } from "./Step1Estate";

// ============================================================
// Step 2 — 비과세·장례비·채무 (debtItems 협의분할 모드 추가)
// ============================================================

export function Step2({ form, set }: { form: FormState; set: FormSet }) {
  // 방안 C 3-state: undefined(OFF) / [] (ON 빈) / [...] (ON 데이터)
  const isAllocationMode = form.debtItems !== undefined;
  const itemCount = form.debtItems?.length ?? 0;
  const [pendingDiscardConfirm, setPendingDiscardConfirm] = useState(false);

  // 재산평가에서 파생된 담보채무 목록 (B5 §3-2, U-2) — derive only, store 쓰기 금지
  const derivedCollateralDebts = useMemo(
    () => deriveCollateralDebts(form.estateItems),
    [form.estateItems],
  );

  const enterAllocationMode = () => {
    set({
      debtItems: [],
      funeralExpense: "",
      funeralIncludesBongan: false,
      debts: "",
    });
  };

  const exitAllocationMode = () => {
    set({ debtItems: undefined });
  };

  const handleToggle = (v: boolean) => {
    if (v) {
      enterAllocationMode();
    } else if (itemCount > 0) {
      // 입력된 항목이 있으면 폐기 확인 (디자인 §3.2 상태 보장 정책)
      setPendingDiscardConfirm(true);
    } else {
      exitAllocationMode();
    }
  };

  return (
    <div className="space-y-6">
      <ExemptionChecklist
        category="inheritance"
        value={form.exemptionItems}
        onChange={(items) => set({ exemptionItems: items })}
        heirs={form.heirs}
      />

      {/* 협의분할 모드 토글 (amber tone) */}
      <ToggleCard
        lawLinks="상증법"
        tone="amber"
        title="채무·공과·장례비 협의분할 입력"
        description="ON: 항목별 채권자명·상속인별 변제 분담 입력 / OFF: 합계 단일 금액 입력"
        checked={isAllocationMode}
        onCheckedChange={handleToggle}
      />

      {isAllocationMode ? (
        <DebtAllocationInput
          items={form.debtItems ?? []}
          heirs={form.heirs}
          derivedCollateralDebts={derivedCollateralDebts}
          onChange={(items) => set({ debtItems: items })}
        />
      ) : (
        <>
          {/* 장례비 — 식대 + 봉안·자연장지를 하나의 범주 카드로 묶어 합산 공제임을 명확히 */}
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-950/20 p-3 space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200">
                장례비 (§14①3호)
              </h3>
              <span className="text-[11px] text-violet-600 dark:text-violet-400">
                — 아래 두 항목을 합산해 공제합니다 (각 한도 별도)
              </span>
            </div>
            {/* 상증령 §9②1호: 일반 장례비(봉안 제외) — clamp [500만, 1천만] */}
            <CurrencyInput
              label="① 일반 장례비(식대·제수 등) · 500만~1,000만"
              value={form.funeralExpense}
              onChange={(v) => set({ funeralExpense: v })}
              hint="500만원 미만이면 500만원 인정, 1,000만원 초과분은 공제 불가 (상증령 §9②1호)"
            />
            {/* 상증령 §9②2호: 봉안시설·자연장지 비용 — min(실제, 500만) */}
            <CurrencyInput
              label="② 봉안시설·자연장지 비용"
              value={form.funeralBonganExpense}
              onChange={(v) => set({ funeralBonganExpense: v })}
              hint="한도: 500만원 초과분은 공제 불가. 이용하지 않으면 빈칸 (상증령 §9②2호)"
            />
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <CurrencyInput
              label="공과금 + 채무 합계 (§14①1·2호)"
              value={form.debts}
              onChange={(v) => set({ debts: v })}
              hint="상속개시일 현재 피상속인이 부담해야 할 채무 총액"
            />
          </div>
        </>
      )}

      <Dialog
        open={pendingDiscardConfirm}
        onOpenChange={setPendingDiscardConfirm}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>협의분할 입력 모드를 끄시겠습니까?</DialogTitle>
            <DialogDescription>
              입력한 채무·공과·장례비 {itemCount}개 항목이 모두 삭제되고
              단일 금액 입력 모드로 전환됩니다. 이 동작은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setPendingDiscardConfirm(false)}
              className="px-3 py-1.5 text-sm rounded border border-border bg-background hover:bg-muted"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                exitAllocationMode();
                setPendingDiscardConfirm(false);
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

// ============================================================
// Step 3 — 사전증여재산
// ============================================================

export function Step3({ form, set }: { form: FormState; set: FormSet }) {
  return (
    <PriorGiftInput
      gifts={form.priorGifts}
      onChange={(gifts) => set({ priorGifts: gifts })}
      mode="inheritance"
      heirs={form.heirs}
      // PR 1 (2026-05-22): 상속세 모드 모달 활성화
      currentDeathDate={form.deathDate}
      // 영리법인 Heir 1건 이상 시 1-클릭 영리법인 import 자동 활성화
      allowCorporateImport={form.heirs?.some((h) => h.relation === "corporate") ?? false}
    />
  );
}

// ============================================================
// Step 4 — 공제·세액공제 (구 Step 4·5 통합, HeirComposition은 Step 0으로 이동)
// 800줄 정책: Step4Deductions.tsx로 분리. 외부 import 호환 re-export.
// ============================================================

export { Step4 } from "./Step4Deductions";

