---
name: history-lookup-modal
description: IndexedDB(또는 Supabase) 이력에서 자동 조회 후 폼에 채워주는 모달 UI 표준 패턴. lib/calc mediator + filterCandidates 순수 함수 + Dialog 기반 모달 + sourceCalculationId 메타 + 자동 채움 후 수정 시 배지 제거.
trigger: 이력 조회, history lookup, 이력 모달, calculation history, 사전 회차 조회, calculation lookup, 자동 채움 모달, IndexedDB 조회 모달, 자동 조회
---

# history-lookup-modal — 이력 자동 조회 모달 표준 패턴

저장된 계산 이력(IndexedDB / Supabase `calculations`)에서 동일인·동일 의뢰인 회차를 자동 조회하여 사용자가 선택해 폼에 자동 채워주는 표준 모달 UI 패턴.

## 적용 시점

- 사용자가 "이력에서 가져와", "이전 신고건 사용", "사전 회차 자동 조회" 요청
- 마법사 폼에 같은 사용자/의뢰인의 과거 회차 입력이 반복적으로 필요할 때
- 신고서 양식 항목(⑤·⑦·⑫ 등)을 사용자가 수기 입력하기 부담스러울 때
- 세무사 모드 의뢰인별 격리가 필요한 경우

## 적용 금지

- 1회성 임시 데이터 (이력 무의미)
- 외부 API 데이터 (별도 fetcher 패턴)
- 다른 사용자 데이터 (보안 위반 — userId 격리 강제)

## 4-레이어 표준 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer (components/calc/{domain}/)                            │
│   ├─ {Domain}HistoryModal.tsx (신규) — Dialog 기반 모달          │
│   └─ {Form}Input.tsx (수정) — "📋 이력에서 조회" 버튼 + 배지      │
└───────────────────────┬─────────────────────────────────────────┘
                        │ import
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Calc Mediator (lib/calc/)                                       │
│   └─ {domain}-lookup.ts (신규)                                  │
│      · filter{Domain}Candidates() — 후보 필터링 순수 함수       │
│      · candidateTo{TargetType}() — 후보→폼 데이터 변환          │
└───────────┬──────────────────────────────┬──────────────────────┘
            │ uses                         │ uses
            ▼                              ▼
┌────────────────────────┐    ┌────────────────────────────────────┐
│ Storage (lib/storage/) │    │ Engine helper (lib/tax-engine/)    │
│ · CalculationRecord    │    │ · 그룹 매칭 헬퍼 (재사용 강제)     │
│ · calculationRepository│    │ · 기간 필터 헬퍼 (date-fns)        │
└────────────────────────┘    └────────────────────────────────────┘
```

### 의존 방향 (단방향)

| From | To | 허용 |
|---|---|---|
| Modal | Mediator(filter/converter 함수) | ✓ UI→Mediator |
| Modal | Storage(repository) | ✓ Modal이 직접 호출 |
| Mediator | Storage types (CalculationRecord) | ✓ Type-only import |
| Mediator | Engine helper | ✓ 그룹 매칭·기간 필터 재사용 |

순환 금지. lib/storage가 lib/calc·lib/tax-engine을 import 하지 않음.

## 데이터 흐름

```
[Input Form] ── 클릭 ──> [HistoryModal opens]
                                 │
                                 │ useEffect: load
                                 ▼
                       calculationRepository.list({taxType})
                                 │
                                 ▼
                       filter{Domain}Candidates(records, ...)
                                 │
                                 │ candidates + warnings 분리
                                 ▼
                       [Modal renders cards + warnings]
                                 │
                                 │ 사용자 [선택] 클릭
                                 ▼
                       candidateTo{TargetType}(c)
                                 │
                                 ▼
                       onSelect(targetData)  ← Modal callback
                                 │
                                 ▼
                       기존 폼 append flow (sourceCalculationId 메타 포함)
```

## 핵심 정책

### 1. 자동 채움 + 메타 필드 (sourceCalculationId)

```ts
// PriorGift / TransferAsset / 등에 메타 필드 추가
export interface PriorGift {
  // 기존 필드들
  giftAmount: number;
  giftDate: string;

  /**
   * 본 데이터가 이력 조회에서 자동 채워졌을 때의 출처 CalculationRecord.id.
   * UI 메타 — 엔진은 무시. buildInput에서 strip.
   */
  sourceCalculationId?: string;
}
```

→ UI에서 "📋 이력 기반" 배지 표시. 사용자가 수정하면 sourceCalculationId 자동 제거.

### 2. 4-필드 9개 동기화 지점 매핑

| # | 영향 |
|---|---|
| ① 폼 상태 | sourceCalculationId 필드 추가 |
| ② initial | makeEmpty* factory에 undefined 명시 |
| ③ normalize | optional이라 자동 보존 |
| ④ API 변환 | buildInput에서 strip (엔진 무시) |
| ⑤ UI 위젯 | Modal + 버튼 + 배지 |
| ⑥ 사이드바 | 영향 없음 |
| ⑦ 결과 카드 | 출처 배지 표시 (선택) |
| ⑧ Validation | 메타라 검증 안 함 |
| ⑨ Zod | optional 안전망 추가 |

### 3. 사용자 수정 감지 → 배지 자동 제거

```tsx
function handleUpdate(index: number, updated: PriorGift) {
  const next = [...gifts];
  const prev = gifts[index];
  // 자동 채움 후 어느 필드라도 수정 시 sourceCalculationId 제거
  if (prev.sourceCalculationId && hasUserEditedFields(prev, updated)) {
    updated = { ...updated, sourceCalculationId: undefined };
  }
  next[index] = updated;
  onChange(next);
}
```

→ snapshot 보관 불필요. 단순 diff로 판단.

### 4. Modal 5-상태 화면

| 상태 | 표시 |
|---|---|
| loading | 스피너 + skeleton 3장 |
| 빈상태 (warnings 없음) | "조건을 만족하는 이력이 없습니다" + "직접 입력" CTA |
| 빈상태 (warnings 있음) | warnings 안내 + "N건 제외됨" |
| candidates 있음 | 카드 리스트 + 정렬 |
| error | "이력을 불러올 수 없습니다" + 닫기 |

### 5. 동일인/의뢰인 격리

```ts
// 우선 옵션: clientId 기반 (세무사 모드 호환)
filterCandidates(records, currentGiftDate, currentClientId, excludeIds)

// 대안: 이름 + 생년월일 (단순 사용자 모드)
// 단, UserProfile/Client에 이미 정보가 있으면 폼 재입력 금지 (DRY 위반)
```

→ 일반 납세자 모드: `clientId === null`인 본인 이력만
→ 세무사 모드: `clientId === currentClientId`로 의뢰인 격리

## 표준 워크플로

### Step 1: 메타 필드 추가

```ts
// types/{domain}.types.ts
interface {Target} {
  // 기존 ...
  sourceCalculationId?: string;
}
```

### Step 2: lib/calc/{domain}-lookup.ts 신규 (~150 LOC)

```ts
import { differenceInYears } from "date-fns";
import type { CalculationRecord } from "@/lib/storage/types";
import type { {Target} } from "@/lib/tax-engine/types/{domain}.types";

export interface {Domain}Candidate {
  calculationId: string;
  // 카드 표시용 필드들
  // ...
}

export interface LookupResult {
  candidates: {Domain}Candidate[];
  warnings: LookupWarning[];
}

export function filter{Domain}Candidates(
  records: CalculationRecord[],
  currentDate: string,
  currentKey: string | null,
  excludeIds: ReadonlyArray<string>,
): LookupResult { /* ... */ }

export function candidateTo{Target}(c: {Domain}Candidate): {Target} { /* ... */ }
```

### Step 3: components/calc/{domain}/{Domain}HistoryModal.tsx 신규 (~300 LOC)

- BaseUI Dialog 재사용
- 5-상태 화면 분기
- 카드 리스트 + 정렬
- onSelect 콜백

### Step 4: 호출처 Input.tsx 통합

- "📋 이력에서 조회" 버튼 (활성화 조건 명시)
- Modal mount + onSelect handler
- "📋 이력 기반" 배지 (sourceCalculationId 있을 때)
- 사용자 수정 시 배지 자동 제거

### Step 5: buildInput에서 strip (지점 ④)

```ts
// {Form}.tsx::buildInput()
priorGiftsWithin10Years: form.priorGifts.map(
  ({ sourceCalculationId: _src, ...rest }) => rest
)
```

### Step 6: Zod schema 안전망 (지점 ⑨)

```ts
// lib/validators/{domain}-input.ts
export const targetSchema = z.object({
  // 기존 ...
  sourceCalculationId: z.string().optional(),  // 안전망
});
```

## 손상 레코드 처리

- `inputData.{필수필드}` 누락 → warnings에 기록, 후보 제외 (throw 금지)
- enum 검증 가드 (`!validEnums.includes(value)`)
- Sentry 1회 경고 (severity: info)

## 검증 anchor 표준 (10건 권장)

| ID | 시나리오 | 검증 |
|---|---|---|
| L-1 | 본인 1건 + 조건 만족 | 후보 포함, warnings 0 |
| L-2 | 기간 초과 | warnings.exceed_period |
| L-3 | 동일 키 매칭 | candidates 정상 |
| L-4 | 다른 키 매칭 | warnings.different_key |
| L-5 | excludeIds 포함 | warnings.excluded |
| L-6 | candidateTo* 변환 정확 | 모든 필드 매핑 |
| L-7 | 손상 레코드 (result 누락) | warnings.result_missing, throw 0 |
| L-8 | enum 누락/오류 | warnings.invalid_enum |
| L-9 | 미래 일자 | warnings.future_date |
| L-10 | 정렬 (최근순) | 첫 번째가 최신 |

## 본 PR 사례

**증여세 사전증여 이력 자동 조회** (커밋 d239db9·49a4deb):
- `lib/calc/prior-gift-lookup.ts` (~220 LOC) — filterPriorGiftCandidates + candidateToPriorGift
- `components/calc/gift/PriorGiftHistoryModal.tsx` (~340 LOC)
- clientId 기반 의뢰인 격리
- PGL-1~15 anchor 100% PASS
- "📋 이력 기반" 배지 + 사용자 수정 시 자동 제거
- `/history/{id}` 동적 라우트 미존재 시 span으로 fallback (49a4deb fix)

## 후속 PR 분리 항목 (재사용 시)

1. **상속세 사전증여** — 같은 패턴 (`mode="inheritance"` 분기)
2. **양도세 다건 입력** — 같은 사용자의 과거 양도 회차
3. **주식 양도세 보유종목** — 같은 종목 이전 매수 이력
4. **세무사 의뢰인 필터** — clientId 기반 격리

## 위반 시 신호

- inputData에서 데이터를 직접 꺼내쓰는 UI → mediator filter 함수 미사용
- Modal이 calculationRepository 외에 다른 데이터 소스 호출 → 단일 진실 위반
- 자동 채움 후 배지가 안 사라짐 → hasUserEditedFields 누락
- sourceCalculationId가 엔진 입력에 포함됨 → buildInput strip 누락 (Zod 안전망으로 차단되나 ④ 동기화 위반)

## 관련 스킬

- [[echo-field-pattern]] — sourceCalculationId는 결과 echo가 아닌 입력 메타 (반대 방향)
- [[tax-field-add]] — 9개 동기화 지점 강제
- [[policy-check]] — Lookup 시작 전 MEMORY에서 관련 정책 검색
