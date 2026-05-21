# 상속세 모드 PriorGiftHistoryModal 활성화 계획서

> 2026-05-21 · feature: `inheritance-prior-gift-modal-activation`
> 선행: Phase 1 (`c48826a`) · Phase 1.5 (`bc3f8b3`) · Phase 2 인프라 (`5ff5606`) · Phase 3 (`bbdabe0`) · PR-A~D (`e87be7c`) · PR-E (`479b94c`)
> 소관: `inheritance-gift-tax-ui-senior` (UI) · `inheritance-gift-tax-senior` (필터 의미 검토)

## 1. 배경

PR-E (`479b94c`)에서 `PriorGiftHistoryModal`에 영리법인 1-클릭 import 인프라 (`enableCorporateOption` prop) 추가 완료. 그러나 `PriorGiftInput.tsx:746` 모달 활성화 조건이 `mode === "gift"` 로 제한되어 상속세 마법사에서 모달 자체가 호출되지 않음.

상속세 모드에서 사용자가 사전증여 이력에서 자동 채우려면:
- 피상속인이 **증여자**였던 이력 검색 (증여세 계산기로 작성된 이력)
- 수증자(=상속인 또는 영리법인) 단위로 후보 표시
- 영리법인 1-클릭 import 활용

## 2. 모달 prop 의미 매핑 분석

### 2-1. 증여세 모드 (현행)

| Prop | 의미 |
|---|---|
| `currentGiftDate` | 현재 증여일 — 10년 이내 필터 기준 |
| `currentDonor` | 현재 증여자 관계 (`GiftDonorRelation` enum, 8종) — §47 동일인 그룹 매칭 |
| `currentClientId` | 수증자(=의뢰인) clientId — 동일 수증자 이력 필터 |
| `excludeCalculationIds` | 현재 폼에서 이미 추가된 calculationId — 중복 차단 |

→ "동일 의뢰인(수증자)이 받은 §47 동일인 그룹 증여자로부터의 10년 이내 증여 이력"

### 2-2. 상속세 모드 (PR-E 활성화 대상)

| Prop | 의미 (상속세) | 의미 매핑 |
|---|---|---|
| `currentGiftDate` | **상속개시일 (deathDate)** | 10년 이내 (상속인) / 5년 이내 (비상속인) 필터 기준 |
| `currentDonor` | **피상속인 관계** — 자녀 입장에서 "직계존속(부)·(모)" / 손자 입장에서 "조부모" | `GiftDonorRelation` enum 재사용 가능 (father·mother·grandparent) |
| `currentClientId` | **개별 상속인 clientId** — 행별 다름. 또는 "피상속인의 모든 사전증여" 보기 모드 | **결정 필요** (옵션 A vs B) |
| `excludeCalculationIds` | 동일 (이미 추가된 이력 차단) | 변경 없음 |

### 2-3. 결정 필요 — `currentClientId` 의미 (옵션 A vs B)

#### 옵션 A: 행별 수증자 매칭 (정밀)

- 상속세 사전증여 행마다 doneeId(Heir.id) 설정 → 해당 상속인의 clientId 로 필터
- 영리법인 행은 영리법인 clientId 매칭 (현행 DB에 미존재 시 fallback)
- 장점: 의미적 정확
- 단점: doneeId 사전 설정 필요. 신규 행 추가 직후 모달 호출 시 doneeId 미설정 → 필터 미작동

#### 옵션 B: 피상속인 단위 전수 조회 (단순)

- 피상속인이 증여자였던 모든 이력 조회 (clientId 무관)
- 사용자가 candidate 카드에서 수증자 정보 확인 후 선택 (수동 매칭)
- 장점: doneeId 사전 설정 불필요. 폭넓은 검색
- 단점: 의뢰인(수증자) 정보 무시 — 잘못된 행 import 위험. 필터 폭 넓어 후보 다수

#### 권장: 옵션 A + B 토글

- 기본 모드: 옵션 A (현재 행의 doneeId 기준)
- 모달 상단에 "전체 보기" 체크박스 → 옵션 B 활성화

## 3. 작업 범위

### 3-1. `lib/calc/prior-gift-lookup.ts` — 필터 함수 확장

```ts
export interface FindPriorGiftCandidatesInput {
  /** ISO date — 10년 / 5년 cutoff 기준일 */
  referenceDate: string;
  /** 증여자 관계 그룹 — 미설정 시 모든 그룹 (옵션 B 전수 조회) */
  donorGroup?: GiftDonorRelation | "all";
  /** 수증자 clientId — 미설정 시 전수 조회 (옵션 B) */
  clientId?: string | null;
  /** 제외할 calculationId 배열 */
  excludeCalculationIds: string[];
  /** 모드 — 상속세: 5년/10년 분기 적용. 증여세: 10년 단일. */
  mode: "inheritance" | "gift";
  /** 상속세 모드에서 isHeir 판정 — 도과 행 제외 (선택) */
  isHeirOfDecedent?: boolean;
}
```

기존 함수 시그니처는 deprecated alias 로 보존, 신규 호출자만 확장 시그니처 사용.

### 3-2. `PriorGiftInput.tsx` — 상속세 모드 모달 활성화

```tsx
// 기존: line 695-696
const canLookup =
  mode === "gift" && Boolean(currentGiftDate) && Boolean(currentDonor);

// 변경:
const canLookup =
  (mode === "gift" && Boolean(currentGiftDate) && Boolean(currentDonor)) ||
  (mode === "inheritance" && Boolean(currentDeathDate));
```

신규 prop:
- `currentDeathDate?: string` — 상속개시일 (상속세 모드 필수)
- 기존 `currentGiftDate`·`currentDonor` 은 증여세 모드 전용 유지

### 3-3. `PriorGiftHistoryModal.tsx` — "전체 보기" 토글

- 모달 상단에 체크박스 "전체 보기 (피상속인의 모든 사전증여)"
- 체크 시 `clientId` 필터 무시 (옵션 B)
- 미체크 시 옵션 A (현재 행 doneeId 기준)

### 3-4. PR-E `enableCorporateOption` 자동 활성화

- 상속세 모드에서 `enableCorporateOption={true}` 자동 전달
- 증여세 모드는 false 유지 (영리법인 수증자 미지원)

### 3-5. InheritanceTaxForm 호출부

```tsx
<PriorGiftInput
  gifts={form.priorGifts}
  onChange={(gifts) => set({ priorGifts: gifts })}
  mode="inheritance"
  heirs={form.heirs}
  currentDeathDate={form.deathDate}      // 신규
  currentClientId={null}                  // 옵션 B 기본
/>
```

## 4. 14 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | PriorGift 변경 없음 | — |
| ② initial | — | — |
| ③ normalize | — | — |
| ④ API 변환 | — | — |
| **⑤ UI 위젯** | **PriorGiftInput 모달 활성 조건 + 신규 prop 5종** | 본 PR |
| ⑥ 사이드바 | 변경 없음 | — |
| ⑦ 결과 카드 | 변경 없음 | — |
| ⑧ Validation | 변경 없음 | — |
| ⑨~⑭ Zod/API | 변경 없음 | — |

## 5. 케이스 매트릭스

| # | 모드 | currentDeathDate | currentClientId | 기대 |
|---|---|---|---|---|
| M1 | inheritance | 2026-05-21 | null (전체 보기) | 10년 이내 모든 사전증여 후보 |
| M2 | inheritance | 2026-05-21 | "client_A" | client_A 수증 이력만 |
| M3 | inheritance | 미입력 | — | canLookup=false → 모달 비활성 |
| M4 | gift (회귀) | — | currentClientId | 기존 동작 보존 |
| M5 | inheritance + 영리법인 1-클릭 | 2026-05-21 | null | enableCorporateOption=true 자동 활성 |

## 6. 검증

### 6-1. anchor (lib/calc 단위)

- `findPriorGiftCandidates` 확장 시그니처 — 옵션 A·B 분기 anchor
- 5년 / 10년 cutoff inheritance 모드 anchor
- 회귀: 증여세 모드 기존 시그니처 alias 보존

### 6-2. 브라우저 수동

- M1·M2·M3·M5 시나리오
- 영리법인 1-클릭 후 doneeId select 활성 → Heir 선택 → 산출세액 입력 → validate 통과

## 7. Out-of-Scope

- 부표 5 별도 컴포넌트 (별도 계획서)
- 부표 1 재산종류코드 정합화 (별도 계획서)

## 8. Definition of Done

- [ ] findPriorGiftCandidates 확장 시그니처 + 기존 alias deprecated
- [ ] PriorGiftInput canLookup 조건 + currentDeathDate prop
- [ ] PriorGiftHistoryModal "전체 보기" 토글
- [ ] 상속세 모드 enableCorporateOption=true 자동
- [ ] InheritanceTaxForm 호출부 currentDeathDate 전달
- [ ] anchor M1~M5 통과
- [ ] M4 회귀 보호
- [ ] `npx tsc --noEmit` 0건

## 9. 작업량 예상

| 항목 | 변경 |
|---|---|
| `prior-gift-lookup.ts` 시그니처 확장 | ~50줄 |
| `PriorGiftInput.tsx` canLookup + prop | ~20줄 |
| `PriorGiftHistoryModal.tsx` 전체 보기 토글 | ~30줄 |
| `InheritanceTaxForm` 호출부 | ~3줄 |
| anchor | ~120줄 |
| **합계** | **~225줄** |
