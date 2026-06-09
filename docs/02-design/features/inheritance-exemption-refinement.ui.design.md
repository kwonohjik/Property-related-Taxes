# 상속세 비과세·과세가액 불산입 정비 — UI 디자인

> 계획서·엔진설계 동반. 대상 컴포넌트: `ExemptionChecklist.tsx`·`ExemptionSummaryCard.tsx` · 작성 2026-06-09
> 4작업 전부 UI 영향. 엔진 무영향 작업(2·3)이 표시의 핵심.

## 1. 작업 2 — 리스크 배지·riskNote 박스 삭제 (`ExemptionChecklist.tsx`)

### 변경 전 (현행 ExemptionRow 헤더 + 펼침)
```
┌─ 금양임야 (禁養林野)                          [여][부] ┐
│ [추징 위험] 상증법 §12         ← RiskBadge(:107) 삭제   │
│ 피상속인이 제사를 모시던 … 9,900㎡(3,000평) 이내 …      │
│   ⚠️ 9,900㎡ 초과분은 일반 상속재산으로 과세…           │ ← riskNote(:175-179) 삭제
└────────────────────────────────────────────────────┘
```

### 변경 후
```
┌─ 금양임야 (禁養林野)                          [여][부] ┐
│ 상증법 §12                     ← lawRef 배지만 유지       │
│ 피상속인이 제사를 모시던 선조 분묘에 속한 임야           │ ← 한도 수치 제거(작업3)
└────────────────────────────────────────────────────┘
```

### 변경 항목
- `RiskBadge` 컴포넌트(`:28-41`) 삭제 + `ExemptionRow` 헤더 호출(`:107`) 삭제.
- 펼침 영역 `riskNote` 블록(`:174-179`) 삭제.
- `lawRef` span(`:108`) 유지.

## 2. 작업 3 — 중복 한도 메시지 단일화

### 중복 매트릭스 (금양임야 — "9,900㎡" 5중)
| 출처 | 현행 | 변경 |
|---|---|---|
| `exemption-rules.ts:99` description | "…9,900㎡(3,000평) 이내 (상증령 §8③1호)" | "…선조 분묘에 속한 임야 (상증령 §8③1호)" (수치 제거) |
| `ExemptionChecklist:133-137` 금액 라벨 | "(면적 한도 9,900㎡ — 초과 시 면적 비율로 안분 과세)" | **삭제** (금액 라벨엔 한도 불요) |
| `ExemptionChecklist:151-155` 면적 라벨 | "한도 9,900㎡" | **유지 — 단일 출처** |
| `ExemptionChecklist:166-170` warning | "9,900㎡ 초과분…+묘토 합산 2억원…" | 초과 입력 시에만 + 2억원 문구는 그룹 안내로 이관 |
| `exemption-rules.ts:113` exclusions | "9,900㎡(3,000평) 초과 부분" | **데이터 삭제** |

- 면적 한도 단일 출처 = **면적 입력 라벨(`:151-155`)**.
- 금액 한도(족보 1천만·장애인신탁 5억)는 금액 라벨(`:128-132`) 1회 유지.

### 요건/제외 "자세히" 접힘
```
┌─ (금양임야 펼침, 여 선택) ───────────────────────────┐
│ 해당 자산 가액           [ 200,000,000 ] 원           │
│ 해당 면적 (㎡) · 한도 9,900㎡  [ 3,000 ]              │
│   ⚠️ 한도 초과 — 초과분 안분 과세  (초과 시에만)       │
│ ▸ 적용 요건·제외 사유 자세히        ← 기본 접힘(토글)  │
└────────────────────────────────────────────────────┘
```
- `requirements`(`:117-121`)·`exclusions`(`:182-193`)를 단일 토글(`<button>`+상태 or `<details>`)로 묶어 **기본 숨김**. 입력 폼이라 print 무관(CSS-only 불요).
- testid: `exemption-row-{ruleId}-details-toggle`.

## 3. 작업 4 — 상속인별 귀속 입력 위젯

### 컴포넌트 트리·prop 배선 (13-1·13-4 정정)
```
steps.tsx:216  <ExemptionChecklist heirs={form.heirs} ... />     ← heirs 신규 전달(1줄)
  └ ExemptionChecklist(category, value, onChange, heirs)           ← prop 추가
      └ ExemptionRow(..., heirs, isInheritance)                     ← prop 2개 추가(현행 :48 미수신)
          └ (isInheritance && checked && hasDistributableHeir일 때만)
             ToggleCard(tone="violet", 제목 "협의분할 (상속인별 분배)")  ← HeirAllocationToggleSection 폐기
               └ HeirAllocationInput(                                  ← generic, EstateItem 무관
                    allocations={item.heirAllocations}
                    expectedTotal={claimedAmount}
                    heirs={heirs}
                    onChange={(allocs)=>onItemChange({...item, heirAllocations: allocs})}
                    heading={null} )
```
- ❌ **`HeirAllocationToggleSection` 재사용 불가** — `onChange:(patch: Partial<EstateItem>)`·`expectedTotal=effectiveValuation`로 EstateItem 강결합(`:31,66-69`).
- ✅ `HeirAllocationInput`만 generic 재사용. ON/OFF는 `ToggleCard`로 직접 제어(ON→`[]`, OFF→`undefined`).
- **증여세 게이트**: `isInheritance`(`category === "inheritance"`) 일 때만 토글 노출.
- **활성 조건**: `hasDistributableHeir(heirs)`(영리법인만 있으면 미노출).

### 위젯 ASCII (공익법인 출연, 여 선택 + 협의분할 ON)
```
┌─ 공익법인 출연 재산                           [여][부] ┐
│ 상증법 §16①                                            │
│ 해당 자산 가액           [ 100,000,000 ] 원            │
│ ▸ 적용 요건·제외 사유 자세히                           │
│ ┌─ violet ToggleCard ──────────────────────────────┐ │
│ │ ◉ 협의분할 (상속인별 분배)              [ON]      │ │
│ │   [배우자(김…)] [자녀(이…)]  ← 칩 토글            │ │
│ │   배우자  [ 60,000,000 ]                          │ │
│ │   자녀    [ 40,000,000 ]                          │ │
│ │   합계 100,000,000 = 청구액 ✓ (emerald)           │ │
│ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```
- `expectedTotal = claimedAmount`(청구액). 합계 불일치 시 rose, 일치 시 emerald(`HeirAllocationInput` 기본 동작).
- `heading={null}` (ToggleCard 제목이 맥락 제공), `flush` 적정.
- 3-state: OFF=`heirAllocations` undefined / ON 빈=`[]` / ON 데이터=`[...]`.

## 4. 작업 1 — 결과 화면 구분 표시 (`ExemptionSummaryCard.tsx`)

### 변경 전
```
┌ 비과세 적용 내역              총 비과세 차감 -10,000,000 ┐
│ 족보·제구            -10,000,000                        │
│ 공익법인 출연 재산   -100,000,000   ← 불산입이 섞임      │
└────────────────────────────────────────────────────┘
```

### 변경 후 (treatment 2그룹)
```
┌ 과세제외 내역                      총 차감 -110,000,000 ┐
│ 〔비과세 (상증법 §12)〕                                 │
│   족보·제구          -10,000,000                        │
│ 〔과세가액 불산입 (상증법 §16·§17)〕                    │
│   공익법인 출연 재산 -100,000,000                       │
│ 적용 조문: …                                            │
└────────────────────────────────────────────────────┘
```
- `itemResults`를 `item.treatment`로 분할. 그룹 소제목은 그룹에 항목 있을 때만.
- **헤더 조건부(13-2)**: `notIncludedTotal>0` 시 "과세제외 내역"·"총 차감"·2그룹 / 불산입 없으면 "비과세 적용 내역"·"총 비과세 차감"·단일(현행 유지). `ExemptionSummaryCard`는 `InheritanceTaxResultView:495` 전용(증여세 미사용 — 안전).
- 요약 카드(`InheritanceTaxResultView.tsx:361-363`): `notIncludedTotal>0` 시 `비과세 차감` + `과세가액 불산입 차감` 두 `SummaryRow`.
- 상속인별 표 ㉠ 행(`heir-allocation-summary.ts:210`)은 통합 "과세제외 재산" 유지(엔진 per-heir 자동).

## 5. UI측 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 | `FormState.exemptionItems: ExemptionCheckedItem[]`(`shared.ts:31`) — 타입에 heirAllocations 자동 포함(엔진 타입 확장) |
| ② initial | 토글 OFF 기본 — 신규 항목 `{ruleId, claimedAmount:0}`(heirAllocations 미설정) |
| ③ normalize | 기존 sessionStorage 항목 heirAllocations 없음 → undefined 안전 |
| ⑤ 위젯 | §1·§2·§3 표시 변경 + §3 HeirAllocation 통합 |
| ⑥ 사이드바 | 영향 없음 |
| ⑦ 결과 | §4 ExemptionSummaryCard 2그룹 + 요약 2행 + ㉠ 행 자동 |
| ⑧ validation | `validateExemptionItemAllocations`(Σ==claimedAmount) + (6-3 정책 (a) 채택 시) estateItem 귀속 불일치 경고 |

## 6. testid·접근성

- 그룹 소제목: `exemption-result-group-{treatment}`.
- 협의분할 토글: `exemption-{ruleId}-alloc-toggle`.
- `HeirAllocationInput` 칩: 기존 a11y(combobox/pressed) 재사용.
- Enter 이동·SelectOnFocus: Provider 전역 적용(추가 작업 불요).

## 7. Do 전 미확정 (엔진설계 §6 연동)
- 차감 위치·귀속 정합 정책(anchor A1) → ⑧ validation 경고 유무 결정.
