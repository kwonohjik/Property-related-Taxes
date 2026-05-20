# 증여세 동일인 사전증여 자동 조회·합산 계획서

> **Feature ID**: `gift-tax-prior-gift-history-lookup`
> **Scope**: Phase 1 (조회·자동 채움) + Phase 2 (이력 미리보기 카드 + 신고서 양식 호환)
> **Tax Domain**: 증여세 (§47② 동일인 합산 + §28 증여세액공제 + §58 한도)
> **Data Source**: 로컬 IndexedDB (`lib/storage/calculation-repository.ts`)
> **Status**: Plan (Pre-Design)
> **Author**: claude-opus-4-7
> **Date**: 2026-05-20

---

## 1. 배경 및 문제 정의

### 1.1 현재 동작 (수동 입력)

`components/calc/PriorGiftInput.tsx`에서 사용자는 사전증여 1건당 **12개 필드**를 수동 입력:

| 그룹 | 필드 | 비고 |
|---|---|---|
| 기본 | `giftDate`, `doneeRelation`, `giftAmount`, `giftTaxPaid` | 필수 4건 |
| §47② 동일인 합산 | `donor`, `giftTaxBase`(⑤), `computedTax`(⑦) | §58 한도 산식용 |
| §57 세대생략 | `wasGenerationSkip`, `additionalGenerationSkipSurcharge`(⑫) | 조부모→손자 회차 |
| (상속세 모드) | `isHeir` | 상속세 폼에서만 |

### 1.2 사용자 불편 (Pain Points)

1. **중복 입력**: 본 앱에서 이미 계산·저장한 증여 신고건이 IndexedDB에 있음에도 사용자가 다시 수기로 입력.
2. **신고서 ⑤·⑦·⑫ 식별 부담**: 일반 납세자는 신고서 항목 번호를 모르며, 본 앱 이전 결과 화면에서 어떤 값을 꺼내야 할지 찾기 어려움.
3. **타이핑 오류 위험**: 12자리 금액·날짜 수기 입력 → 합산 한도 산식 오류 → §58 한도 잘못 계산.
4. **§47 그룹 판정 누락**: 현재 증여자(부) vs 사전증여 증여자(부) 동일인 판정을 사용자가 직접 옵션 선택. 헷갈리면 합산 누락.

### 1.3 해결 방향

**IndexedDB `calculations` 테이블의 증여세 이력**(`taxType: "gift"`)에서 다음을 자동 조회:

- `inputData.giftDate` — 현재 증여일 기준 10년 이내
- `inputData.donor` / `inputData.donorRelation` — 현재 증여의 §47 동일인 그룹 자동 매칭
- `resultData.result.*` — ⑤·⑦·⑫ 등 산식 인자 자동 인용

→ "내역 조회" 버튼 → 모달로 후보 노출 → 선택 → 12필드 자동 채움.

---

## 2. 법적 근거 정리 (변경 없음, 참조용)

| 조문 | 적용 | 본 PR 영향 |
|---|---|---|
| 상증법 §47② | 동일인 10년 이내 사전증여 합산 (부·모 = 동일인 / 조부모 = 별도 그룹) | 그룹 매칭 로직 |
| 상증법 §28 | 기납부 증여세액공제 | `giftTaxPaid` 자동 인용 |
| 상증법 §58 | 증여세액공제 한도 = `직전 회차 산출세액 × (현재 합산과세표준에서 사전증여분 ÷ 현재 합산과세표준)` | ⑤·⑦ 자동 인용 |
| 상증법 §57 | 세대생략 30%/40% 할증 + 누적 ⑨ | `additionalGenerationSkipSurcharge`(⑫) 자동 인용 |

본 PR은 **새로운 법적 해석 없음** — 입력 UX만 개선.

---

## 3. 데이터 소스 인벤토리

### 3.1 IndexedDB 스키마 (`lib/storage/types.ts`)

```ts
CalculationRecord {
  id: string;
  userId: UserId;
  taxType: "gift";  // 본 PR 필터 키
  inputData: { /* GiftTaxForm FormState 직렬화 */ };
  resultData: { /* GiftTaxResult */ };
  taxLawVersion: string;
  createdAt: string;
  updatedAt: string;
}
```

### 3.2 inputData 추출 매핑 (현재 → PriorGift)

> **검증 완료** (코드 grep 2026-05-20): `lib/tax-engine/types/inheritance-gift.types.ts:734-789` 기준.
>
> **inputData의 실체**: `useAutoSaveCalculation`(`components/calc/GiftTaxForm.tsx:533`)이 `form` (FormState) 자체를 저장. 즉 `inputData`는 GiftTaxInput이 아닌 GiftTaxForm.FormState — `inputData.priorGifts`(not `priorGiftsWithin10Years`)·`inputData.donor`·`inputData.donorRelation`·`inputData.isGenerationSkip` 모두 FormState 필드명 사용.

| PriorGift 필드 | 출처 (현재 증여세 기록의 inputData/resultData) | 비고 |
|---|---|---|
| `giftDate` | `inputData.giftDate` (string ISO) | 그대로 사용 (PriorGift도 string) |
| `doneeRelation` | `inputData.donorRelation` | 현재 증여의 관계 |
| `giftAmount` | `resultData.result.grossGiftValue` | line 736 |
| `giftTaxPaid` | `resultData.result.finalTax` | line 757 (결정세액) |
| `donor` | `inputData.donor` (§47 그룹 판정 키) | line 223 (PriorGift) |
| `giftTaxBase` (⑤) | **`resultData.result.taxBase`** | line 744 — `result.giftTaxBase`는 존재하지 않음 |
| `computedTax` (⑦) | `resultData.result.computedTax` | line 746 (할증 전) |
| `wasGenerationSkip` | `inputData.isGenerationSkip` (boolean) | — |
| `additionalGenerationSkipSurcharge` (⑫) | **`resultData.result.additionalGenerationSkipSurcharge`** | line 765 — `result.generationSkipSurcharge`(line 753)는 단독/합산에 따라 의미가 다르므로 사용 금지 |
| `isHeir` (상속세 모드) | (이력에서 추론 불가) | 사용자 입력 유지 |
| `doneeId` | (이력에서 추론 불가) | 상속세 종합사례 — Phase 1 범위 외 |
| `beneficiaryType` | (이력에서 추론 불가) | 상속세 종합사례 — Phase 1 범위 외 |
| `sourceCalculationId` (신규) | `record.id` | UI 메타 — 엔진 변환 시 제거 |

### 3.3 검증 완료 사항

- ✓ `GiftTaxResult` 실제 필드명 검증 (위 표 line 번호 참조).
- ✓ `inputData.giftDate`는 ISO string으로 직렬화됨 — Date 변환 없이 비교 가능.
- ⚠️ 합산 회차(`inputData.priorGifts.length > 0`) 정책: **포함**. §58 한도 산식이 "가장 최근 합산 회차의 ⑤·⑦"을 분자로 사용하므로 합산 회차도 정당한 후보. UI에 "이 회차는 이전 사전증여를 이미 합산한 결과 — 추가로 같은 그룹의 더 과거 회차를 별도 추가하면 이중 합산 위험" 안내 배지 표시.

---

## 4. UX 설계 — 사용자 시나리오

### 4.1 시나리오 A — 동일인 자동 매칭 후보 있음

```
1. 사용자가 [4단계: 비과세·합산]에 진입
2. "동일인 사전증여 합산 (§47)" 섹션 우상단에 [📋 이력에서 조회] 버튼
3. 클릭 → 모달 오픈
4. 자동 필터링 적용 (**엔진 단일 진실 재사용**, 2-tier 표시):
   - **공통 필터** (제외 조건):
     - `taxType == "gift"` 아니면 제외
     - `inputData.giftDate < 현재 giftDate` 아니면 제외
     - `differenceInYears(new Date(현재 giftDate), new Date(inputData.giftDate)) > 10` 이면 제외 ← 엔진 `aggregatePriorGiftsForGift`와 동일 알고리즘 (date-fns)
     - `inputData.donor` undefined 이면 제외 (warnings 기록)
     - `excludeCalculationIds.includes(record.id)` 이면 제외 (중복 방지)
   - **그룹 분류** (제외 아닌 후보를 matchType별로 분리):
     - `isSameDonorGroup(inputData.donor, 현재 donor) === true` → `matchType="same_group"` (상단 섹션 노출 — §47 합산 대상)
     - `false` → `matchType="other"` (하단 접힘 섹션 — "기타 증여세 이력")
   - **부가 메타** (제외 안 함, UI 배지용):
     - `inputData.priorGifts.length > 0` → `hasInnerPriorGifts=true` → 카드에 "🔁 이전 합산 결과 포함" 배지

   §47 그룹 정의:

   | 그룹 | donor 값 | §47 의미 |
   |---|---|---|
   | A | `father`, `mother` | 부·모 동일인 (§47②) |
   | B | `grandparent` | 조부모 (§57 세대생략 대상) |
   | C | `spouse` | 배우자 |
   | D | `lineal_descendant` | 직계비속 |
   | E | `sibling` | 형제자매 |
   | F | `other_relative` | 기타친족 |
   | G | `other` | 기타 |

5. 후보 카드 리스트 표시 (이력 미리보기 — Phase 2 핵심):
   ┌──────────────────────────────────────────┐
   │ 2021-05-10  부 → 본인 (직계존속 성인)        │
   │ 증여재산가액  350,000,000원                  │
   │ 합산과세표준 ⑤  300,000,000원                │
   │ 산출세액 ⑦       50,000,000원                │
   │ 납부세액         48,500,000원                │
   │ 세대생략 ⑫       0원                         │
   │ [선택]                                      │
   └──────────────────────────────────────────┘
6. 사용자가 [선택] 클릭 → 모달 닫히고 사전증여 목록에 1건 추가 (자동 채움 10필드 + 메타 1필드)
7. PriorGiftInput 카드 상단에 "📋 이력 기반" 배지 표시 (수정 가능)
```

### 4.2 시나리오 B — 후보 없음

```
1. 모달에 "조건을 만족하는 증여세 이력이 없습니다." 안내
2. "직접 입력하기" 버튼 → 모달 닫고 빈 PriorGift 1건 추가 (기존 동작 유지)
```

### 4.3 시나리오 C — 그룹 외 이력 (`matchType="other"`)

```
1. §47 동일 그룹 후보 없음 + 다른 그룹 증여세 이력 있음
2. 모달 하단에 접힘 섹션 "기타 증여세 이력 (§47 합산 그룹 외) ▶ N건"
3. 펼침 시 회색 톤 카드로 표시 — "이 회차는 별개 신고로 분리됩니다 — §47 합산·§58 한도 산식에서 자동 제외" 안내
4. 사용자가 의도적으로 선택 시 PriorGiftInput에 추가 (엔진 `aggregatePriorGiftsForGift`가 `isSameDonorGroup=false` 회차를 warnings 기록 후 합산 제외 — 사용자 인지 보장)
```

> **§47 그룹 외 회차 §28 영향**: 현 엔진은 합산 대상이 아니면 §28 공제 산식에도 미반영. 사용자가 그룹 외 회차를 추가할 실익은 없으나, 검토 목적으로 노출 허용.

### 4.4 시나리오 D — 중복 방지

- 이미 PriorGifts 목록에 같은 `calculationId` 출처 회차가 있으면 모달 후보에서 자동 제외.
- 출처 추적용 새 필드 `sourceCalculationId?: string` 추가 (PriorGift 타입 확장).

---

## 5. 구현 명세 (Phase별)

### 5.1 Phase 1 — 조회 모달 + 자동 채움 (필수)

#### 5.1.1 신규 파일

| 경로 | 책임 | 추정 LOC |
|---|---|---|
| `lib/calc/prior-gift-lookup.ts` | 순수 함수. 후보 필터링 + 그룹 매칭 + PriorGift 변환 | ~150 |
| `components/calc/gift/PriorGiftHistoryModal.tsx` | 조회 모달 UI (후보 카드 리스트 + 검색) | ~250 |
| `__tests__/calc/prior-gift-lookup.spec.ts` | 그룹 매칭·10년 필터·변환 anchor | ~120 |

> **위치 결정**: `lib/calc/`로 배치 (storage 아님). 이유: 본 모듈은 `CalculationRecord`(storage 타입) + `isSameDonorGroup`(engine 헬퍼) + `PriorGift`(engine 타입)을 모두 import 하므로 storage→engine 단방향 의존 규칙을 어김. `lib/calc/`는 이미 storage·engine 양쪽을 mediate하는 컨벤션 ([CLAUDE.md](../../CLAUDE.md) "lib/calc/ — 클라이언트↔API 변환").

#### 5.1.2 수정 파일

| 파일 | 변경 |
|---|---|
| `components/calc/PriorGiftInput.tsx` | "이력에서 조회" 버튼 추가 + 모달 호출 + `sourceCalculationId` 배지 표시 |
| `lib/tax-engine/types/inheritance-gift.types.ts` 또는 PriorGift 정의 위치 | `sourceCalculationId?: string` 필드 추가 (선택, 회귀 무) |
| `components/calc/GiftTaxForm.tsx` | 현재 `giftDate`·`donor`를 PriorGiftInput에 prop 전달 (이미 일부 전달 중 — 확장) |

#### 5.1.3 순수 함수 시그니처

```ts
// lib/storage/prior-gift-lookup.ts
import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";
import { differenceInYears } from "date-fns";

export interface PriorGiftCandidate {
  calculationId: string;
  giftDate: string;          // ISO YYYY-MM-DD (inputData.giftDate 그대로)
  donor: GiftDonorRelation;
  donorRelation: DonorRelation | undefined;
  grossGiftValue: number;             // result.grossGiftValue
  finalTax: number;                   // result.finalTax (= giftTaxPaid)
  taxBase: number;                    // result.taxBase = ⑤
  computedTax: number;                // result.computedTax = ⑦
  additionalGenerationSkipSurcharge: number; // result.additionalGenerationSkipSurcharge = ⑫
  wasGenerationSkip: boolean;         // inputData.isGenerationSkip
  hasInnerPriorGifts: boolean;        // inputData.priorGifts.length > 0
  /** §47 그룹 매칭 결과 (engine isSameDonorGroup) */
  matchType: "same_group" | "other";
}

export function filterPriorGiftCandidates(
  records: CalculationRecord[],
  currentGiftDate: string,                 // ISO YYYY-MM-DD
  currentDonor: GiftDonorRelation,
  excludeCalculationIds: string[],
): PriorGiftCandidate[];
// 내부에서 new Date() 1회 변환. 시그니처는 string으로 단순.
// matchType="same_group"·"other" 모두 포함 (UI가 2-tier 분리 렌더링 책임).

export function candidateToPriorGift(c: PriorGiftCandidate): PriorGift;
// 자동 채움 9필드 + sourceCalculationId(메타).
// isHeir/doneeId/beneficiaryType는 이력 추론 불가 → 미설정(undefined).
```

#### 5.1.4 §47 그룹 매칭 (엔진 헬퍼 재사용)

별도 매칭 함수 정의 금지. `lib/tax-engine/gift-prior-aggregation.ts:51` 의 `isSameDonorGroup(a, b)` 를 import 하여 사용.

엔진 그룹 정의 (`getDonorGroup`):

| 그룹 | donor 값 | §47 의미 |
|---|---|---|
| A | `father`, `mother` | 부·모 동일인 (§47②) |
| B | `grandparent` | 조부모 (§57 세대생략 대상) |
| C | `spouse` | 배우자 |
| D | `lineal_descendant` | 직계비속 |
| E | `sibling` | 형제자매 |
| F | `other_relative` | 기타친족 |
| G | `other` | 기타 |

→ 데이터·UI·검증 모두 엔진 헬퍼 단일 진실. 위 표는 참조용 문서화일 뿐 별도 코드 작성 금지.

> 🔒 **Single source of truth**: §47 그룹 정의 변경은 엔진 헬퍼만 수정. UI/Storage 모듈은 자동 추종.

### 5.2 Phase 2 — 이력 미리보기 카드 + 신고서 양식 호환

#### 5.2.1 미리보기 카드 (모달 내부)

후보 카드에 다음 정보를 **한 화면에서 검토 가능**하도록 표시:

```
┌─ 2021-05-10 · 부 → 직계존속 (성인) ────────────────┐
│  증여재산가액  ②③ 350,000,000원                       │
│  ─────────────────────────────────                    │
│  합산과세표준 ⑤  300,000,000원                         │
│  산출세액 ⑦      50,000,000원                          │
│  세대생략 할증 ⑫  0원                                  │
│  ─────────────────────────────────                    │
│  납부세액       48,500,000원                            │
│  세율 구간      30% (5억 이하)                          │
│                                                       │
│  ✓ 현재 증여자(부)와 동일 §47 그룹                      │
│  [📋 이 회차 선택]   [🔍 상세 보기]                     │
└──────────────────────────────────────────────────────┘
```

- "상세 보기" → `/history/{calculationId}` 새 탭 (기존 라우트 활용)
- 세율 구간 표시는 `computedTax / giftTaxBase` 비율 또는 기록의 `taxRate` 필드에서 추출

#### 5.2.2 신고서 양식 호환 (별지 제10호서식)

별지 제10호서식 [2020.03.13. 개정]은 `GiftTaxResult.besshi10Rows: FilingFormRow[]` 로 이미 재현됨 (`lib/tax-engine/types/inheritance-gift.types.ts:788`).

- 조회로 채워진 PriorGift는 신고서 양식 ⑤·⑥·⑦·⑫ 열에 정확 매핑되도록 `aggregatePriorGiftsForGift` 그대로 사용 (엔진 변경 0건).
- 결과 화면(`components/calc/results/GiftTaxResultView.tsx`)의 사전증여 표시 영역(평가내역 카드)에서 `sourceCalculationId` 있는 행 옆에 "📋 이력" 작은 배지 표시 (출처 추적용).
- `sourceCalculationId`는 UI 메타 — `lib/calc/gift-tax-api.ts` Zod 변환 시 strip. PDF/신고서 양식 자체에는 노출 안 함 (양식 호환 보장).
- 결과 화면 출처 배지는 클릭 시 `/history/{calculationId}` 새 탭 오픈 (옵션).

### 5.3 동기화 지점 점검 (8개 중 영향)

| # | 지점 | 변경 여부 |
|---|---|---|
| ① 폼 상태 타입 | PriorGift에 `sourceCalculationId?: string` 1필드만 추가 (donor/doneeId/beneficiaryType는 기존) | ✓ |
| ② initial value | `PriorGiftInput.tsx::makeEmptyGift()`에 `sourceCalculationId: undefined` 명시 | ✓ |
| ③ normalize | sessionStorage zustand persist — 선택 필드, 자동 보존. legacy 폼 무영향 | 확인 |
| ④ API 변환 | **`components/calc/GiftTaxForm.tsx::buildInput()`** — `lib/calc/gift-tax-api.ts`는 존재하지 않음. buildInput에서 `priorGiftsWithin10Years` map 시 `sourceCalculationId` strip | 변환 시 제거 |
| ⑤ UI 위젯 | PriorGiftInput 카드 상단 배지 + 모달 호출 버튼 + 신규 PriorGiftHistoryModal | ✓ |
| ⑥ 사이드바 합계 | 변경 없음 | — |
| ⑦ 결과 카드 | "📋 이력" 작은 배지 (Phase 2) | ✓ |
| ⑧ Validation | 변경 없음 (메타 필드는 검증 안 함) | — |
| ⑨ Zod | `lib/validators/property-valuation-input.ts:136 priorGiftSchema` — `sourceCalculationId: z.string().optional()` 안전망 추가 | ✓ |

### 5.4 엔진 영향

**엔진 변경 0건**. 본 PR은 UI/Storage 레이어 한정. `gift-tax.ts` 순수 함수는 PriorGift 입력을 그대로 받아 계산.

---

## 6. 테스트 계획

### 6.1 anchor 케이스 (`__tests__/calc/prior-gift-lookup.spec.ts`)

| ID | 시나리오 | 검증 |
|---|---|---|
| PGL-1 | 현재 증여일 2026-05-20, 후보 2021-05-10 (10년 이내) | 후보에 포함 |
| PGL-2 | 현재 증여일 2026-05-20, 후보 2016-05-19 (10년 1일 초과) | 후보에서 제외 |
| PGL-3 | 현재 donor=부, 후보 donor=모 | matchType="same_group" |
| PGL-4 | 현재 donor=부, 후보 donor=조부모 | matchType="other" |
| PGL-5 | 후보 inputData.priorGifts.length>0 (합산 후 회차) | **포함** + `hasInnerPriorGifts: true` |
| PGL-6 | excludeCalculationIds에 ID 포함 | 후보에서 제외 |
| PGL-7 | 후보 → PriorGift 변환 (자동 9필드 + sourceCalculationId) | 전 필드 정확 |
| PGL-8 | 후보 inputData.giftDate가 string ISO | Date 파싱 후 비교 정확 |
| PGL-9 | resultData.result 누락된 손상 레코드 | warnings.result_missing, 후보 제외, throw 금지 |
| PGL-10 | inputData.donor undefined | warnings.donor_missing |
| PGL-11 | inputData.donor 비-enum 문자열 (legacy 손상) | warnings.donor_missing |
| PGL-12 | record giftDate > current (미래 — sanity) | warnings.future_date |
| PGL-13 | 2건 후보, giftDate 다름 | 최근순 정렬 (giftDate desc) |
| PGL-14 | result.additionalGenerationSkipSurcharge undefined → 0 | candidate ⑫ === 0 |
| PGL-15 | result.finalTax undefined → 0 / taxType="inheritance" 레코드 silent skip | candidates=[] (silent) |

### 6.2 UI 테스트 (브라우저 수동)

- [ ] 빈 이력 → 모달에 "이력 없음" 메시지
- [ ] 후보 1건 → 선택 후 12필드 자동 채움
- [ ] 후보 2건 (그룹 매칭 + 그룹 외) → 두 섹션 분리 표시
- [ ] 자동 채움 후 사용자가 금액 수정 → 배지는 유지, 값은 변경 반영
- [ ] 같은 후보를 2번 선택 시도 → 두 번째는 후보 리스트에서 제외
- [ ] 모달 닫기 → 진행 중 입력 손실 없음
- [ ] 사이드바 합계 갱신 확인

---

## 7. 비기능 요구사항

### 7.1 성능

- IndexedDB `calculations.where("userId+taxType+createdAt")` 인덱스 활용 → 200건 상한이라 즉시 응답.
- 모달 열림 시 1회 `repository.list()` 호출, 결과 메모이즈.

### 7.2 오류 처리

- `resultData.result` 필드 일부 누락된 손상 레코드 → 후보에서 safe-skip (Sentry 경고 1회).
- 손상 레코드 제거 안내는 별도 PR (스코프 외).

### 7.3 접근성

- 모달은 `Dialog` (Radix UI / BaseUI) 사용. Esc·outside click 닫힘.
- 후보 카드는 키보드 Tab 순회 가능 + Enter로 선택.

### 7.4 보안·프라이버시

- IndexedDB 로컬 한정 — 외부 전송 없음.
- Supabase 전환 시 `current-user.ts:getCurrentUserId()` 교체로 자동 클라우드 동기화 가능 (별도 PR).

---

## 8. 위험·미해결 사항

| ID | 위험 | 완화 |
|---|---|---|
| R-1 | `GiftTaxResult` 필드명이 실제 엔진과 다를 가능성 | Design 단계 grep + 타입 가드 함수 작성 |
| R-2 | 사전증여(priorGifts.length>0) 회차를 후보에서 제외하면 사용자가 헷갈릴 수 있음 | 모달 하단에 "이미 합산된 회차는 표시되지 않습니다" 안내 |
| R-3 | `donor` 필드가 옵셔널 (undefined 가능) | 그룹 매칭에서 undefined는 "other"로 처리 |
| R-4 | 상속세 모드 PriorGiftInput에서도 같은 모달 사용 가능성 | Phase 1 스코프 외 — 증여세 모드만 우선. mode prop 분기로 차단 |
| R-5 | 세무사 모드 의뢰인(`clientId`) 다중 관리 시 후보 필터 누락 | 현재 PR은 `clientId` 무시 (본인 이력만). 향후 의뢰인 필터 추가 |

---

## 9. 향후 확장 (별도 PR)

1. **상속세 모드 PriorGiftInput**도 동일 조회 기능 (사전증여 5/10년 합산용).
2. **세무사 모드 의뢰인별 이력 필터** (`clientId` 일치).
3. **Supabase 클라우드 이력 연동** (로그인 사용자 다중 기기 동기화).
4. **단일 회차 직접 import** — `/history` 페이지에서 "현재 증여 계산에 사전증여로 추가" 버튼.
5. **PDF 신고서에서 이력 출처 명시** (양식 표 밖 부기란).

---

## 10. 작업 일정 (Recommend Sequence)

| 단계 | 작업 | 추정 |
|---|---|---|
| Design | `inheritance-gift-tax-ui-senior` + `Plan` agent — anchor 인벤토리 + GiftTaxResult 필드 검증 | 0.5d |
| Do-1 | `lib/storage/prior-gift-lookup.ts` + anchor 10건 | 0.5d |
| Do-2 | `PriorGiftHistoryModal.tsx` UI | 0.5d |
| Do-3 | `PriorGiftInput.tsx` 통합 + 배지 + sourceCalculationId 필드 | 0.5d |
| Check | `ui-engine-sync-checker` + 브라우저 수동 검증 (시나리오 A·B·C·D) | 0.5d |
| Act | 회귀 anchor 추가 + 디자인 문서 갱신 | 0.25d |

**총 추정**: 약 2.75d (Phase 1+2 통합).

---

## 11. Definition of Done

- [ ] `lib/calc/prior-gift-lookup.ts` 순수 함수 + anchor 15건 PASS (PGL-1~15)
- [ ] PriorGiftHistoryModal 동작 (시나리오 A·B·C·D)
- [ ] PriorGiftInput "이력에서 조회" 버튼 노출
- [ ] 자동 채움 후 12필드 정확 + sourceCalculationId 배지
- [ ] 그룹 매칭 자동 (부·모 동일인 + 조부모 = 별도)
- [ ] 손상 레코드 safe-skip
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npx vitest run __tests__/calc/prior-gift-lookup.spec.ts` PASS
- [ ] 전체 회귀 PASS (회귀 0 신규)
- [ ] 브라우저 수동 확인 (시나리오 4건)
- [ ] CLAUDE.md / MEMORY.md 메모리 항목 추가 (필요 시)

---

## 부록 A — 모달 와이어프레임 (텍스트)

```
╔═══════════════════════════════════════════════════════╗
║  📋 사전증여 이력 조회                          ✕     ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  현재 증여일: 2026-05-20  ·  증여자: 부               ║
║  필터: 10년 이내 (2016-05-21 이후) + 부·모 동일인     ║
║                                                       ║
║  ▼ §47 동일인 그룹 (자동 합산 대상) — 2건             ║
║                                                       ║
║  ┌─ 2021-05-10 · 부 ───────────────────────────────┐ ║
║  │  ②③ 350,000,000원                                │ ║
║  │  ⑤  300,000,000원   ⑦  50,000,000원              │ ║
║  │  납부 48,500,000원   ⑫  0원                       │ ║
║  │  ✓ 동일 그룹                  [선택] [상세]       │ ║
║  └─────────────────────────────────────────────────┘ ║
║                                                       ║
║  ┌─ 2019-03-22 · 모 ───────────────────────────────┐ ║
║  │  ②③ 100,000,000원                                │ ║
║  │  ⑤   50,000,000원   ⑦   5,000,000원              │ ║
║  │  납부  4,850,000원   ⑫  0원                       │ ║
║  │  ✓ 동일 그룹 (모→부 동일인)   [선택] [상세]       │ ║
║  └─────────────────────────────────────────────────┘ ║
║                                                       ║
║  ▶ 기타 증여세 이력 (3건) — 그룹 외, 펼쳐서 확인      ║
║                                                       ║
║  [+ 직접 입력하기]                          [닫기]    ║
╚═══════════════════════════════════════════════════════╝
```

---

> **다음 단계**: 본 계획서 승인 후 `inheritance-gift-tax-ui-senior` + Plan agent를 단일 메시지로 호출하여 Design 단계 진입. Design 산출물은 `docs/02-design/features/gift-tax-prior-gift-history-lookup.design.md`.
