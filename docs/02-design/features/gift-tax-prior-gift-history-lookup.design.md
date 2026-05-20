# Design — 증여세 동일인 사전증여 자동 조회·합산

> **Plan Doc**: [`docs/00-pm/gift-tax-prior-gift-history-lookup.plan.md`](../../00-pm/gift-tax-prior-gift-history-lookup.plan.md)
> **Tax Domain**: 증여세 §47② / §28 / §58 / §57
> **Status**: Design (Pre-Do)
> **Author**: claude-opus-4-7
> **Date**: 2026-05-20

---

## §1. 아키텍처 개요

### §1.1 레이어 매핑

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer (components/calc/gift/)                                │
│   ├─ PriorGiftInput.tsx (수정) — [📋 이력에서 조회] 버튼 추가   │
│   └─ PriorGiftHistoryModal.tsx (신규) — 후보 카드 모달          │
└───────────────────────┬─────────────────────────────────────────┘
                        │ import: PriorGiftCandidate, filter*, candidate*
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Calc Mediator (lib/calc/)                                       │
│   └─ prior-gift-lookup.ts (신규)                                │
│      · filterPriorGiftCandidates()                              │
│      · candidateToPriorGift()                                   │
└───────────┬──────────────────────────────┬──────────────────────┘
            │ uses                         │ uses
            ▼                              ▼
┌────────────────────────┐    ┌────────────────────────────────────┐
│ Storage (lib/storage/) │    │ Engine helper (lib/tax-engine/)    │
│ · CalculationRecord    │    │ · isSameDonorGroup (gift-prior-    │
│ · calculationRepository│    │   aggregation.ts:51)               │
└────────────────────────┘    │ · differenceInYears (date-fns)     │
                              └────────────────────────────────────┘
```

### §1.2 데이터 흐름

```
[PriorGiftInput] ── 클릭 ──> [PriorGiftHistoryModal opens]
                                       │
                                       │ useEffect(once): load
                                       ▼
                            calculationRepository.list({taxType:"gift"})
                                       │
                                       ▼
                            filterPriorGiftCandidates(records, …)
                                       │
                                       │ split: same_group / other
                                       ▼
                            [Modal renders 2-tier cards]
                                       │
                                       │ 사용자 [선택] 클릭
                                       ▼
                            candidateToPriorGift(c)
                                       │
                                       ▼
                            onSelect(priorGift)  ← PriorGiftInput callback
                                       │
                                       ▼
                            기존 PriorGiftInput append flow
                                       │
                                       ▼
                            GiftTaxForm.set({priorGifts: [...]})
```

### §1.3 의존성 단방향성 검증

| From | To | 허용 |
|---|---|---|
| `components/calc/gift/PriorGiftHistoryModal.tsx` | `lib/calc/prior-gift-lookup.ts` | ✓ UI→Mediator |
| `components/calc/PriorGiftInput.tsx` | `components/calc/gift/PriorGiftHistoryModal.tsx` | ✓ UI 내부 |
| `lib/calc/prior-gift-lookup.ts` | `lib/storage/types` (CalculationRecord 타입만) | ✓ Type-only import |
| `PriorGiftHistoryModal.tsx` | `lib/storage/calculation-repository.ts` | ✓ Modal이 repository 호출 책임. 순수 함수는 records 인자만 받음 |
| `lib/calc/prior-gift-lookup.ts` | `lib/tax-engine/gift-prior-aggregation.ts` | ✓ Mediator→Engine helper |
| `lib/calc/prior-gift-lookup.ts` | `lib/tax-engine/types/inheritance-gift.types.ts` | ✓ Mediator→Engine types |

순환 의존 없음. 단방향성 보장.

---

## §2. 타입 명세

### §2.0 inputData의 실제 구조

> **사실관계 확인**: `useAutoSaveCalculation` (`components/calc/GiftTaxForm.tsx:533`)이 `inputData: form as unknown as Record<string, unknown>`로 저장. 즉 IndexedDB의 `inputData`는 **GiftTaxForm의 `FormState`** 그 자체.
>
> - `inputData.giftDate`: string (FormState.giftDate)
> - `inputData.donor`: GiftDonorRelation (FormState.donor — required, default "father")
> - `inputData.donorRelation`: DonorRelation (FormState.donorRelation)
> - `inputData.priorGifts`: PriorGift[] ← **`priorGiftsWithin10Years` 아님** (GiftTaxInput 변환 전)
> - `inputData.isGenerationSkip`: boolean
> - `inputData.isMinorDonee`: boolean
>
> `resultData`는 `{success: true, result: GiftTaxResult}` 구조. 본 모듈은 `record.resultData.result` 우선 + `record.resultData` fallback.

### §2.1 신규 타입 (`lib/calc/prior-gift-lookup.ts`)

```ts
import type {
  GiftDonorRelation,
  DonorRelation,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { CalculationRecord } from "@/lib/storage/types";

export interface PriorGiftCandidate {
  /** Source 식별자 (record.id) — 선택 후 PriorGift.sourceCalculationId로 전달 */
  calculationId: string;
  /** ISO YYYY-MM-DD */
  giftDate: string;
  /** §47 그룹 판정 키 */
  donor: GiftDonorRelation;
  /** 당시 수증자-증여자 관계 (정보용, undefined 가능) */
  donorRelation: DonorRelation | undefined;
  /** result.grossGiftValue */
  grossGiftValue: number;
  /** result.finalTax — §28 공제 인용 */
  finalTax: number;
  /** result.taxBase = ⑤ */
  taxBase: number;
  /** result.computedTax = ⑦ */
  computedTax: number;
  /** result.additionalGenerationSkipSurcharge = ⑫ */
  additionalGenerationSkipSurcharge: number;
  /** inputData.isGenerationSkip */
  wasGenerationSkip: boolean;
  /** inputData.priorGifts.length > 0 — UI 배지용 메타 */
  hasInnerPriorGifts: boolean;
  /** §47 그룹 매칭 (isSameDonorGroup 결과) */
  matchType: "same_group" | "other";
  /** 저장 시각 — 정렬용 */
  createdAt: string;
  /** 자동 생성 title — 결과 화면 링크 라벨 */
  title: string;
}

export interface LookupWarning {
  calculationId: string;
  reason: "donor_missing" | "result_missing" | "future_date" | "exceed_10y" | "excluded";
  message: string;
}

export interface LookupResult {
  candidates: PriorGiftCandidate[];
  warnings: LookupWarning[];
}
```

### §2.2 PriorGift 타입 확장 (`lib/tax-engine/types/inheritance-gift.types.ts`)

```diff
 export interface PriorGift {
   giftDate: string;
   isHeir: boolean;
   giftAmount: number;
   giftTaxPaid: number;
   giftTaxBase?: number;
   doneeRelation?: DonorRelation;
   donor?: GiftDonorRelation;
   computedTax?: number;
   additionalGenerationSkipSurcharge?: number;
   wasGenerationSkip?: boolean;
   doneeId?: string;
   beneficiaryType?: "heir" | "legatee" | "corporate";
   corporateGiftComputedTax?: number;
+  /**
+   * 본 PriorGift가 사용자 이력에서 조회되어 채워졌을 때의 출처 CalculationRecord.id.
+   * UI 배지(📋 이력 기반) 및 결과 화면 링크용. 엔진은 무시.
+   * lib/calc/gift-tax-api.ts Zod 변환 시 strip.
+   */
+  sourceCalculationId?: string;
 }
```

**엔진 영향**: 0. `sourceCalculationId`는 optional + 엔진 계산 함수 어디서도 참조 안 함. Phase A 합산·§58·§57 산식 모두 영향 없음.

---

## §3. 순수 함수 명세

### §3.1 `filterPriorGiftCandidates`

```ts
export function filterPriorGiftCandidates(
  records: CalculationRecord[],
  currentGiftDate: string,          // ISO YYYY-MM-DD
  currentDonor: GiftDonorRelation,
  excludeCalculationIds: string[],
): LookupResult;
```

**알고리즘**:

```
1. const current = new Date(currentGiftDate)
2. const candidates: PriorGiftCandidate[] = []
3. const warnings: LookupWarning[] = []
4. for record of records:
   a. if record.taxType !== "gift": continue (silent — 다른 세목)
   b. if excludeCalculationIds.includes(record.id):
      warnings.push({reason:"excluded", ...}); continue
   c. const input = record.inputData
   d. const result = record.resultData?.result ?? record.resultData
   e. const validDonors = ["father","mother","grandparent","spouse","lineal_descendant","sibling","other_relative","other"]
   e'. if typeof input?.donor !== "string" || !validDonors.includes(input.donor):
       warnings.push({reason:"donor_missing", ...}); continue
   f. if result?.grossGiftValue === undefined OR result?.taxBase === undefined OR result?.computedTax === undefined:
      warnings.push({reason:"result_missing", ...}); continue
   g. const priorDate = new Date(input.giftDate)
   h. if priorDate >= current:
      warnings.push({reason:"future_date", ...}); continue (sanity)
   i. if differenceInYears(current, priorDate) > 10:
      warnings.push({reason:"exceed_10y", ...}); continue
   j. const matchType = isSameDonorGroup(input.donor, currentDonor) ? "same_group" : "other"
   k. candidates.push({
        calculationId: record.id,
        giftDate: input.giftDate,
        donor: input.donor,
        donorRelation: input.donorRelation,
        grossGiftValue: result.grossGiftValue,
        finalTax: result.finalTax ?? 0,
        taxBase: result.taxBase,
        computedTax: result.computedTax,
        additionalGenerationSkipSurcharge: result.additionalGenerationSkipSurcharge ?? 0,
        wasGenerationSkip: Boolean(input.isGenerationSkip),
        hasInnerPriorGifts: Array.isArray(input.priorGifts) && input.priorGifts.length > 0,
        matchType,
        createdAt: record.createdAt,
        title: record.title,
      })
5. candidates.sort by giftDate desc (최근 우선)
6. return {candidates, warnings}
```

**불변식**:
- `candidates` 어떤 항목도 `donor === undefined` 일 수 없음.
- `candidates` 어떤 항목도 `taxBase`·`computedTax`·`grossGiftValue` 누락 없음.
- `current giftDate < priorDate` 또는 `>10년` 항목 없음.

### §3.2 `candidateToPriorGift`

```ts
export function candidateToPriorGift(c: PriorGiftCandidate): PriorGift {
  return {
    giftDate: c.giftDate,
    isHeir: true,                                  // 상속세 모드 미사용 시 무영향 (default)
    giftAmount: c.grossGiftValue,
    giftTaxPaid: c.finalTax,
    giftTaxBase: c.taxBase,                        // ⑤
    doneeRelation: c.donorRelation,
    donor: c.donor,
    computedTax: c.computedTax,                    // ⑦
    additionalGenerationSkipSurcharge: c.additionalGenerationSkipSurcharge, // ⑫
    wasGenerationSkip: c.wasGenerationSkip,
    sourceCalculationId: c.calculationId,
    // doneeId / beneficiaryType / corporateGiftComputedTax : 미설정 (이력 추론 불가)
  };
}
```

**검증**: 자동 채움 9필드 + 메타 1필드 = 10필드. PriorGift의 나머지 4필드(`doneeId`/`beneficiaryType`/`corporateGiftComputedTax`/`isHeir`의 상속세 의미)는 사용자가 후속 입력.

---

## §4. UI 명세

### §4.1 케이스 인벤토리 (필수 — Plan 진입 게이트)

| ID | 조건 (현재 폼 + 이력 상태) | 모달 표시 | 후보 카드 | 자동 채움 |
|---|---|---|---|---|
| U-1 | 현재 `donor=father`, 이력 `father` 1건 (10년 이내, 단건) | "1건 매칭" | same_group 섹션 1장 | ✓ 10필드 |
| U-2 | 현재 `donor=father`, 이력 `mother` 1건 | "1건 매칭" (§47② 부모 동일인) | same_group 섹션 1장 (배지: "모→부 동일인") | ✓ 10필드 |
| U-3 | 현재 `donor=father`, 이력 `grandparent` 1건 | "기타 1건" | other 섹션 (접힘) 1장 | 사용자 펼침 후 ✓ |
| U-4 | 현재 `donor=grandparent`, 이력 `grandparent` 1건 (단독) | "1건 매칭" | same_group 1장 + 세대생략 배지 | ✓ 10필드 (⑫>0) |
| U-5 | 이력 없음 | "이력 없음" 빈상태 + "직접 입력하기" CTA | — | — |
| U-6 | 현재 `donor=father`, 이력 `father` 5건 (모두 10년 이내) | "5건 매칭" + 최신순 | same_group 5장 | 각각 ✓ |
| U-7 | 이력 1건, 10년 1일 초과 | "이력 없음" (필터 제외) | — | — |
| U-8 | 이력 1건, `donor` 미입력 (legacy 레코드) | warnings에만 노출 (모달 빈상태) | — | — |
| U-9 | 이력 1건, `result.taxBase` 누락 (손상) | warnings에 노출, 빈상태 | — | — |
| U-10 | 이력 2건 중 1건 이미 PriorGifts에 있음 (excludeCalculationIds) | "1건 매칭" + warnings에 "1건 중복 제외" | 1장 | ✓ |
| U-11 | 이력 1건, `inputData.priorGifts.length>0` (합산 회차) | "1건 매칭" + 카드 배지 "🔁 이전 합산 결과 포함" | same_group 1장 + 툴팁 안내 | ✓ |
| U-12 | 사용자가 자동 채움 후 금액 수정 | 모달 closed | "📋 이력 기반 (수정됨)" 배지 노출 | 사용자 수정값 우선 |
| U-13 | 자동 채움 후 PriorGiftInput에서 행 삭제 | 모달 다시 열면 후보로 다시 노출 (excludeCalculationIds 갱신) | same_group 1장 | ✓ |

### §4.2 PriorGiftInput.tsx 변경

```tsx
// 기존 헤더 영역 우상단에 버튼 추가
const canLookup = Boolean(currentGiftDate) && Boolean(currentDonor);

<div className="flex items-center justify-between">
  <h3>동일인 사전증여 합산 (§47)</h3>
  <button
    type="button"
    onClick={() => setHistoryModalOpen(true)}
    disabled={!canLookup}
    title={!canLookup ? "1단계에서 증여일과 증여자를 먼저 입력하세요" : undefined}
    className={`text-xs rounded-md border px-3 py-1.5 transition-colors ${
      canLookup
        ? "border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-700"
        : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
    }`}
  >
    📋 이력에서 조회
  </button>
</div>

{!canLookup && (
  <p className="text-[11px] text-gray-500">
    ※ 이력 조회는 1단계 증여일·증여자가 입력된 후 활성화됩니다.
  </p>
)}

{/* 사전증여 목록 — 기존 */}
{gifts.map((gift, i) => (
  <PriorGiftCard gift={gift} ...>
    {gift.sourceCalculationId && (
      <span className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-800 rounded px-2 py-0.5">
        📋 이력 기반
        {/* 사용자가 값 수정 시 (수정됨) 추가 표기 */}
      </span>
    )}
  </PriorGiftCard>
))}

<PriorGiftHistoryModal
  open={historyModalOpen}
  onOpenChange={setHistoryModalOpen}
  currentGiftDate={currentGiftDate}
  currentDonor={currentDonor}
  excludeCalculationIds={gifts.map(g => g.sourceCalculationId).filter(Boolean)}
  onSelect={(priorGift) => {
    onChange([...gifts, priorGift]);
    setHistoryModalOpen(false);
  }}
/>
```

### §4.3 PriorGiftHistoryModal.tsx 명세

#### §4.3.1 Props

```ts
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentGiftDate: string;            // GiftTaxForm.giftDate (필수, ISO YYYY-MM-DD)
  currentDonor: GiftDonorRelation;    // GiftTaxForm.donor (필수)
  excludeCalculationIds: string[];    // 이미 추가된 PriorGifts의 sourceCalculationId
  /** 선택 모드 — single: 클릭 즉시 닫힘 / multi: 체크박스 누적 후 [확인] */
  selectionMode?: "single" | "multi";  // 기본 "single"
  onSelect: (priorGifts: PriorGift[]) => void;  // 항상 배열 (single이어도 length=1)
  /** "직접 입력하기" 버튼 클릭 시 — 빈 PriorGift 1건 추가 */
  onManualAdd?: () => void;
}
```

**선택 모드 결정**: Phase 1은 `selectionMode="single"` 고정 (UI 단순). 여러 회차가 필요한 사용자는 모달을 반복 열어서 추가. Phase 2에서 multi 검토.

#### §4.3.2 Layout

**상태별 화면**:

| 상태 | 표시 |
|---|---|
| `loading=true` | "이력을 불러오는 중..." 스피너 + skeleton 3장 |
| `candidates.length=0 && warnings.length=0` | "조건을 만족하는 증여세 이력이 없습니다." (gray-100 box) + [+ 직접 입력하기] |
| `candidates.length=0 && warnings.length>0` | warnings 노출 + 빈상태 메시지 |
| `candidates.length>0` | same_group / other 2-tier + footer |
| `error` (Promise rejection) | "이력을 불러올 수 없습니다. 다시 시도하세요." + [닫기] |

**모달 골격**:

```
╔═══════════════════════════════════════════════════════╗
║  📋 사전증여 이력 조회                          ✕     ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  ━ 헤더 영역 (sky tone) ━━━━━━━━━━━━━━━━━━━━━━━━     ║
║  현재 증여일: 2026-05-20  ·  증여자: 부               ║
║  필터: 10년 이내 (~2016-05-21) + §47 동일인 그룹      ║
║                                                       ║
║  ▼ §47 동일 그룹 (자동 합산 대상) — 2건               ║
║                                                       ║
║  [후보 카드 1]                                         ║
║  [후보 카드 2]                                         ║
║                                                       ║
║  ▶ 기타 증여세 이력 (§47 합산 그룹 외) — 3건  [펼침]  ║
║    └─ [회색 톤 카드 1] (펼침 시)                       ║
║    └─ [회색 톤 카드 2]                                ║
║    └─ [회색 톤 카드 3]                                ║
║                                                       ║
║  ━ warnings 영역 (있을 때만, amber tone) ━━━━━━━━     ║
║  ⚠️ 1건은 donor 미입력으로 후보에서 제외되었습니다     ║
║  ⚠️ 1건은 10년 초과로 제외되었습니다                   ║
║                                                       ║
║  ━ Footer ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     ║
║  [+ 직접 입력하기]                          [닫기]    ║
╚═══════════════════════════════════════════════════════╝
```

#### §4.3.3 카드 구조 (same_group)

```tsx
<div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-2">
  {/* 헤더 */}
  <div className="flex items-center justify-between">
    <div className="text-sm font-semibold">
      {giftDate} · {DONOR_LABEL[donor]} → {donorRelation ? RELATION_LABEL[donorRelation] : "본인"}
    </div>
    {hasInnerPriorGifts && (
      <button
        type="button"
        onClick={() => setExpandInnerInfo(prev => !prev)}
        className="text-[10px] bg-sky-100 text-sky-800 rounded px-2 py-0.5 cursor-help"
        aria-label="이 회차의 합산 결과 안내 펼치기"
      >
        🔁 이전 합산 결과 포함
      </button>
    )}
  </div>
  {hasInnerPriorGifts && expandInnerInfo && (
    <div className="text-[11px] bg-sky-50 border border-sky-200 rounded p-2 text-sky-700">
      이 회차의 합산과세표준 ⑤·산출세액 ⑦은 이미 그 시점 이전의 사전증여를 합산한 결과입니다.
      추가로 같은 §47 그룹의 더 과거 회차를 별도로 더하면 이중 합산이 발생할 수 있습니다.
      가장 최근 합산 회차 1건만 선택하는 것을 권장합니다.
    </div>
  )}
  </div>

  {/* 금액 그리드 */}
  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
    <span className="text-gray-600">증여재산가액 ②③</span>
    <span className="text-right font-medium">{formatKRW(grossGiftValue)}</span>

    <span className="text-gray-600">합산과세표준 ⑤</span>
    <span className="text-right font-medium">{formatKRW(taxBase)}</span>

    <span className="text-gray-600">산출세액 ⑦</span>
    <span className="text-right font-medium">{formatKRW(computedTax)}</span>

    {additionalGenerationSkipSurcharge > 0 && (
      <>
        <span className="text-gray-600">세대생략 ⑫</span>
        <span className="text-right font-medium">{formatKRW(additionalGenerationSkipSurcharge)}</span>
      </>
    )}

    <span className="text-gray-600 border-t pt-1">납부세액</span>
    <span className="text-right font-semibold border-t pt-1">{formatKRW(finalTax)}</span>
  </div>

  {/* §47 그룹 배지 */}
  <p className="text-[11px] text-violet-700">
    ✓ 현재 증여자(<strong>{DONOR_LABEL[currentDonor]}</strong>)와 동일 §47 그룹
  </p>

  {/* 버튼 */}
  <div className="flex gap-2 pt-1">
    <button
      onClick={() => onSelect(candidateToPriorGift(candidate))}
      className="flex-1 rounded-md bg-violet-600 text-white py-2 text-sm font-medium hover:bg-violet-700"
    >
      📋 이 회차 선택
    </button>
    <a
      href={`/history/${calculationId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
    >
      🔍 상세
    </a>
  </div>
</div>
```

#### §4.3.4 카드 구조 (other — 그룹 외, 회색 톤)

기본 구조 동일. 차이:
- `border-gray-300 bg-gray-50/60` (회색 톤)
- §47 그룹 배지 → "ℹ️ §47 그룹 외 — 별개 신고로 자동 분리 (합산·§58 한도 미반영)" 안내
- "이 회차 선택" 버튼은 회색 ghost 톤

### §4.4 8개 동기화 지점 매핑

> **사실관계 검증 (코드 grep 2026-05-20)**:
> - 증여세에는 `lib/calc/gift-tax-api.ts` 파일이 **존재하지 않음**. 클라이언트 → API 흐름은 `components/calc/GiftTaxForm.tsx::buildInput()` 가 GiftTaxInput을 직접 생성 후 `fetch("/api/calc/gift")`.
> - Zod 스키마는 `lib/validators/property-valuation-input.ts:136 priorGiftSchema` + 라인 323 `giftTaxInputSchema`.

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | 폼 상태 타입 | `lib/tax-engine/types/inheritance-gift.types.ts` PriorGift | `sourceCalculationId?: string` 1필드 |
| ② | initial | `components/calc/PriorGiftInput.tsx::makeEmptyGift()` | `sourceCalculationId: undefined` |
| ③ | normalize | sessionStorage zustand persist | 선택 필드, 자동 보존. legacy 폼 무영향 |
| ④ | API 변환 | `components/calc/GiftTaxForm.tsx::buildInput()` | `priorGiftsWithin10Years.map(g => { const {sourceCalculationId, ...rest} = g; return rest; })` — 엔진 입력에서 strip |
| ⑤ | UI 위젯 | `PriorGiftInput.tsx` + 신규 `PriorGiftHistoryModal.tsx` | 버튼 + 모달 + 배지 |
| ⑥ | 사이드바 합계 | 영향 없음 | — |
| ⑦ | 결과 카드 | `components/calc/results/GiftTaxResultView.tsx` 사전증여 평가내역 영역 | `sourceCalculationId` 있는 행 옆 작은 "📋 이력" 배지 + 클릭 시 `/history/{id}` 신규 탭 (Phase 2) |
| ⑧ | Validation | `components/calc/GiftTaxForm.tsx::validateStep` | 변경 없음 — `sourceCalculationId`는 사용자 입력값이 아니므로 검증 안 함 |
| ⑨ | Zod (priorGiftSchema) | `lib/validators/property-valuation-input.ts:136` | `sourceCalculationId: z.string().optional()` 추가 (③의 strip을 깜빡한 경우 안전망) |

> ⚠️ **double-defense ④+⑨**: ④에서 strip하므로 ⑨까지 가지 않음. ⑨는 안전망. ④가 누락되면 ⑨가 schema 통과 후 GiftTaxInput에 잔존하나 엔진 어디서도 참조 안 함(타입에 없음). 엄밀히는 ④만 있어도 충분하나 향후 회귀 방지용으로 ⑨ 추가.

### §4.5 색상 토큰

| 영역 | 색상 |
|---|---|
| 모달 헤더 (현재 조건) | sky-200 / sky-50/40 / sky-700 |
| same_group 카드 | violet-200 / violet-50/40 / violet-700 |
| 매칭 그룹 배지 (✓ 동일 §47) | violet-100 text-violet-800 |
| other 카드 | gray-300 / gray-50/60 / gray-600 |
| hasInnerPriorGifts 배지 (회차별 메타) | sky-100 text-sky-800 |
| warnings 영역 (전역, 모달 푸터) | amber-50/40 border-amber-200 text-amber-700 |
| 빈상태 카드 | gray-100 text-gray-500 |
| "📋 이력 기반" 사전증여 카드 배지 | violet-100 text-violet-800 |
| "(수정됨)" 표시 | gray-500 italic |

### §4.6 모달 컴포넌트 — 확정

✓ 검증 완료 (2026-05-20): `components/ui/dialog.tsx` 존재 (BaseUI `@base-ui/react/dialog` 기반). 본 모달은 다음 컴포넌트들 재사용:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
```

- Esc·outside click 닫힘 — BaseUI 기본 동작
- Portal 렌더링 — DialogPortal 자동
- 접근성 — aria-labelledby, role=dialog 자동
- 별도 dialog.tsx 신규 작성 불필요.

---

## §5. 알고리즘 상세

### §5.1 정확한 §47 그룹 매칭 (엔진 헬퍼 재사용)

```ts
// lib/calc/prior-gift-lookup.ts
import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";

// 매칭 라인 (단 1줄)
const matchType = isSameDonorGroup(input.donor, currentDonor) ? "same_group" : "other";
```

→ 그룹 정의 변경은 엔진만 수정. UI/Storage 자동 추종.

### §5.2 10년 필터 (엔진 알고리즘 동기화)

```ts
import { differenceInYears } from "date-fns";

// 엔진 `aggregatePriorGiftsForGift` 와 동일 (gift-prior-aggregation.ts:112)
const elapsedYears = differenceInYears(current, priorDate);
if (elapsedYears > 10) {
  warnings.push({reason: "exceed_10y", ...});
  continue;
}
```

**경계값**: 10년 정확히 1일 경과 (예: 2016-05-19 ↔ 2026-05-20) → differenceInYears 반환 10 → **포함**. 10년 1일 초과(2016-05-19 ↔ 2026-05-21) → 반환 10 → **여전히 포함**. date-fns는 연도만 봄.

> ⚠️ **엔진 동기화 검증**: 본 알고리즘이 엔진과 정확히 일치하는지 anchor PGL-1/2에서 검증. 엔진이 향후 day-precision으로 바뀌면 본 모듈도 동기화 (또는 엔진 헬퍼를 import).

### §5.3 손상 레코드 안전 처리

```ts
// inputData 파싱 안전
const input = record.inputData as Record<string, unknown>;
const result = (record.resultData as Record<string, unknown>)?.result
            ?? record.resultData;

// 필수 필드 가드 — 누락 시 warnings에만 기록 후 continue (throw 금지)
if (typeof input?.donor !== "string") { warnings.push({reason:"donor_missing"}); continue; }
if (typeof result?.taxBase !== "number") { warnings.push({reason:"result_missing"}); continue; }
// ...
```

**Sentry 노출**: warnings.length > 0 시 1회 `Sentry.captureMessage` (severity: info, tag: `prior-gift-lookup-warnings`).

### §5.4 정렬

- 1차: `giftDate` 내림차순 (최근 우선) — 엔진 `aggregatePriorGiftsForGift` line 133과 동일.
- 2차: 동일 일자면 `createdAt` 내림차순 (최근 저장 우선).

---

## §6. 테스트 매트릭스

### §6.1 순수 함수 anchor (`__tests__/calc/prior-gift-lookup.spec.ts`)

| ID | Setup | Expected |
|---|---|---|
| PGL-1 | current=2026-05-20·father, record giftDate=2016-05-21·father | candidates[0] (10년 이내 경계, same_group) |
| PGL-2 | current=2026-05-20, record giftDate=2015-05-19 | warnings.exceed_10y, candidates=[] |
| PGL-3 | current=father, record=mother | matchType="same_group" |
| PGL-4 | current=father, record=grandparent | matchType="other" |
| PGL-5 | record inputData.priorGifts.length=2 | candidates[0].hasInnerPriorGifts=true |
| PGL-6 | record.id ∈ excludeCalculationIds | warnings.excluded, candidates=[] |
| PGL-7 | 전체 9필드 + sourceCalculationId 매핑 | candidateToPriorGift 결과 정확 |
| PGL-8 | record.inputData.giftDate ISO string | new Date 비교 정확 |
| PGL-9 | record.resultData.result undefined | warnings.result_missing, no throw |
| PGL-10 | record.inputData.donor undefined | warnings.donor_missing |
| PGL-11 | record giftDate > current (미래) | warnings.future_date |
| PGL-12 | 2건 후보, giftDate 다름 | 최근순 정렬 |
| PGL-13 | result.additionalGenerationSkipSurcharge undefined → 0 | candidate.additionalGenerationSkipSurcharge === 0 |
| PGL-14 | result.finalTax undefined → 0 | candidate.finalTax === 0 |
| PGL-15 | taxType="inheritance" record | candidates=[] (silent skip) |

### §6.2 UI 회귀 (브라우저 수동)

U-1 ~ U-13 (§4.1 케이스 인벤토리 그대로 검증).

### §6.3 회귀 anchor (엔진)

PriorGift 타입에 `sourceCalculationId` 추가 후 기존 anchor 모두 PASS 보장.

- `__tests__/tax-engine/gift-tax/` 전체 실행
- 기존 §47/§58/§57 anchor 회귀 0건

---

## §7. 위험·완화

| ID | 위험 | 완화 |
|---|---|---|
| R-1 | sessionStorage에 옛 PriorGift(`sourceCalculationId` 없음) → undefined 정상 동작 | 선택 필드라 무영향, anchor에서 확인 |
| R-2 | `excludeCalculationIds`에 `undefined` 포함 가능 (legacy 행) | `.filter(Boolean)` |
| R-3 | 결과 화면에서 사용자가 사전증여 행 삭제 후 모달 재오픈 시 후보가 사라짐 | 정상 동작 — excludeCalculationIds 재계산 |
| R-4 | 손상된 IndexedDB 레코드 — 모달 무한 로딩 우려 | Promise rejection 시 warnings에 기록 + 빈상태 노출 |
| R-5 | "📋 이력 기반 (수정됨)" 판정 방법 | PriorGift 자체에 `sourceSnapshot?: Partial<PriorGift>` (자동 채움 직후 값 보관, JSON.stringify 비교). 또는 더 단순화: 사용자가 어느 한 필드라도 수정하면 `sourceCalculationId` 자체를 undefined로 변경하여 배지 제거 (UI 단순). Design 단계 결정: **후자 — 사용자 수정 시 즉시 배지 제거**. snapshot 불필요. |
| R-6 | 다른 기기에서 신고한 회차 누락 (로컬 한정) | 안내 문구 "이 기기 이력만 노출" — Phase 1 한정 |

---

## §8. Definition of Done

- [ ] `lib/calc/prior-gift-lookup.ts` 신규 — anchor 15건 PASS
- [ ] `components/calc/gift/PriorGiftHistoryModal.tsx` 신규 (~250 LOC)
- [ ] `components/calc/PriorGiftInput.tsx` "이력에서 조회" 버튼 + 모달 통합 + 배지
- [ ] `lib/tax-engine/types/inheritance-gift.types.ts` PriorGift에 `sourceCalculationId?: string` 추가
- [ ] `lib/calc/gift-tax-api.ts` Zod 변환 시 `sourceCalculationId` strip
- [ ] `components/calc/results/GiftTaxResultView.tsx` `sourceCalculationId` 배지 (Phase 2)
- [ ] §47 그룹 매칭은 엔진 `isSameDonorGroup` 직접 import (재정의 0)
- [ ] 10년 필터는 `differenceInYears` (엔진과 동일)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npx vitest run __tests__/calc/prior-gift-lookup.spec.ts` PASS
- [ ] 전체 회귀 PASS (회귀 0 신규)
- [ ] 브라우저 수동 확인 (U-1~U-13)
- [ ] CLAUDE.md / MEMORY.md 메모리 항목 추가 ★

---

## §9. 작업 순서 (Do 단계)

| 단계 | 작업 | 추정 |
|---|---|---|
| D-1 | `lib/tax-engine/types/inheritance-gift.types.ts` PriorGift에 `sourceCalculationId?` 추가 + tsc 통과 | 0.1d |
| D-2 | `lib/calc/prior-gift-lookup.ts` + `__tests__/calc/prior-gift-lookup.spec.ts` (15 anchor) | 0.5d |
| D-3 | `components/calc/gift/PriorGiftHistoryModal.tsx` 신규 (Dialog 기반) | 0.5d |
| D-4 | `components/calc/PriorGiftInput.tsx` 통합 (버튼·모달·배지·sourceCalculationId factory) | 0.4d |
| D-5 | `components/calc/GiftTaxForm.tsx::buildInput` 에서 `sourceCalculationId` strip (④) | 0.1d |
| D-6 | `lib/validators/property-valuation-input.ts` priorGiftSchema에 `sourceCalculationId.optional()` (⑨ 안전망) | 0.1d |
| D-7 | (Phase 2) `GiftTaxResultView.tsx` 평가내역에 "📋 이력" 배지 | 0.3d |
| D-8 | 브라우저 수동 검증 (U-1 ~ U-13) | 0.5d |
| D-9 | CLAUDE.md 메모리 항목 추가 + 회귀 anchor 통과 | 0.2d |

**총 추정**: 약 2.7d (Plan §10의 2.75d와 일치).

---

## §10. 후속 PR 분리 항목

1. 상속세 모드 PriorGiftInput에도 동일 조회 (`mode="inheritance"` 분기).
2. 세무사 모드 `clientId` 필터.
3. Supabase 클라우드 이력 (다중 기기).
4. `/history` 페이지 → "이 회차를 현재 증여 계산에 추가" 버튼.
5. PDF/신고서 양식에 출처 부기란.
