# UI 설계 — 부동산 평가 아코디언 + 매매사례가액 + 평가방식 라디오 삭제

> 상위: `inheritance-real-estate-valuation-accordion.plan.md` · `.engine.design.md`
> 공용 폼: `PropertyValuationForm` = **상속(`Step1Estate.tsx:55`) + 증여(`gift-tax-form-shared.tsx:396`) 공용** → 한 곳 수정 = 양 세목 자동 적용.
> 모든 file:line 실측(13단계 STEP12 선행 검증).

## 1. 컴포넌트 지형 (실측)

```
PropertyValuationForm (상속·증여 공용)
├─ EstateBodyRealEstate (variants/EstateBodyRealEstate.tsx)   ← 이미지3 (Part 1 대상)
│   ├─ 우선순위 안내 (PRIORITY_HINT[cat], L221)
│   ├─ FieldCard "개별공시지가/기준시가" + StandardPriceInput (L229-255, 상시)
│   └─ RealEstateAdvancedFields = ToggleCard (L259-481, 시가+감정+임대+저당 묶음)
└─ EstateItemAdvancedPanel (estate-card/EstateItemAdvancedPanel.tsx, ⚙️고급)  ← 이미지4 (Part 2 대상)
    ├─ EstimatedValuePreview (L97)
    └─ EstateValuationMetaSection (L101)  ← 평가방식 라디오 + 면적/수량
```

→ **Part1(아코디언·매매사례가액)** = `EstateBodyRealEstate`. **Part2(라디오 삭제)** = `EstateValuationMetaSection`. 다른 파일.

## 2. Part 1 — EstateBodyRealEstate 재편

### 2-1. AS-IS → TO-BE 구조

| 현재 | 변경 후 |
|---|---|
| 우선순위 안내 | 안내 문구 갱신: "시가 → 감정가 → 매매사례가 → 보충적 평가 (상증법 §60·§49)" |
| FieldCard "개별공시지가/기준시가" (상시, 위) | **"보충적 평가방법 (토지: 개별공시지가)"**(D-2) — 상시, **아코디언 아래로 이동**(우선순위=계산순서) |
| ToggleCard "시가·감정가·임대보증금·저당권"(묶음) | **분해**: 아코디언 3(시가·감정가액·매매사례가액) + 담보·임대 상시 영역 |

### 2-2. ASCII 레이아웃 (TO-BE)

```
ℹ️ 시가 → 감정가 → 매매사례가 → 보충적 평가 순 적용 (상증법 §60①·§49②④)

평가액 입력 (해당 항목만 펼쳐 입력)
[ 시가 (매매·수용·경매가액)        ▸/▾ ]   ← ToggleCard, 값>0 자동 펼침
   └ marketValue  CurrencyInput  "평가기간(±6개월) 내 실거래가"
[ 감정평가액                       ▸/▾ ]
   └ appraisedValue  "감정평가법인 감정가"
[ 매매사례가액 (유사매매사례)       ▸/▾ ]   ← 신규
   └ similarSalesValue  "면적·용도 유사 다른 재산 (시행령 §49④, 해당재산 시가 있으면 미적용)"

┌─ 보충적 평가방법 (토지: 개별공시지가) ─────── 상시 ─┐
│ ⚠️ 자동조회는 소재지 지번 선택 시 활성화             │
│ 2023▾ [공시가격 조회]   ㎡단가 × 면적 → 금액         │
│ standardPrice — "시가·감정가·매매사례가 없을 때 최종" │
└───────────────────────────────────────────────┘

┌─ 담보·임대 (§66 하한 / §14 공제) ──────────── 상시 ─┐
│ 저당권 등 담보채권액  mortgageAmount [        ]      │
│ 임대보증금 leaseDeposit [        ] (주택만 showLeaseDeposit)│
│ §14 자동공제 ToggleCard / §23의2 동거주택 (기존 보존) │
└────────────────────────────────────────────────┘
```

### 2-3. 위젯 규칙

- 아코디언 3개 = `ToggleCard variant="card"` (native accordion 금지). tone: 시가·감정·매매=`emerald`(평가·확정 정보), 보충평가 상시=`sky`(일반), 담보·임대=`amber`(차감·분리).
- **초기 펼침**: 필드별 `(item.X ?? 0) > 0` → 자동 ON(비파괴, 기존 `hasAdvancedValue` 패턴을 필드별 분해).
- 매매사례가액 `CurrencyInput` + `parseAmount`(원·정수). `hideLabel hideUnit`(FieldCard 라벨 중복 방지, 기존 패턴).
- **담보·임대는 평가방식과 직교 → 아코디언 밖 상시**(§66·§14, 계획 D-3).
- 보충평가 라벨 D-2: `cat==="real_estate_land"`→"보충적 평가방법 (토지: 개별공시지가)" / apartment→"(주택: 공동·개별주택가격)" / building→"(건물: 기준시가)".

## 3. Part 2 — EstateValuationMetaSection 라디오 삭제

### 3-1. 변경

- **삭제**: `VALUATION_OPTIONS`(L26-32)·`AutoOrMethod`(L24)·`currentMethod`(L41)·평가방식 RadioCardGroup 블록(L54-69).
- **제목**: "평가방식·수량 (상속개시자료 요약 표시용)" → **"수량·면적 (상속개시자료 요약 표시용)"**(L49-51).
- **유지**: 면적(`areaSqm`, 부동산)·수량(`quantityCount`, other) 입력.
- **빈 섹션 가드**: 라디오 삭제 후 `showArea || showQuantity`일 때만 섹션 렌더. cash·financial·deposit·주식은 입력 0개 → 카드 숨김(빈 emerald 카드 방지).
- `EstateItemAdvancedPanel:101` 호출부 무변경(내부 가드).

### 3-2. ASCII (TO-BE)

```
§ 수량·면적 (상속개시자료 요약 표시용)        ← 부동산·기타자산만 표시
면적 (㎡) — 미입력 시 상속인별 분배 면적 합계 자동 사용
[ 자산 전체 면적 ]                            ← areaSqm (부동산)
수량 (점)  [ 기타자산 수량 ]                   ← quantityCount (other)
```

## 4. 동기화 지점 ⑤ (UI 위젯)

| 위치 | 변경 |
|---|---|
| `EstateBodyRealEstate.tsx` | 아코디언3 재편 + similarSalesValue CurrencyInput + 보충평가 라벨 D-2 + 담보·임대 상시 분리 |
| `EstateValuationMetaSection.tsx` | 라디오 삭제 + 제목 + 빈 섹션 가드 |
| `EstimatedValuePreview` (H3) | similar if 분기 (엔진설계 §3-2) |
| `TotalEstimatedValue` (H4) | similar if 분기 |

## 5. testid / a11y

- 아코디언 ToggleCard: 기존 ToggleCard testid 체계 따름(신규 testid 불요, label 텍스트 기반 E2E).
- E2E 셀렉터: `getByText("매매사례가액 (유사매매사례)")` 펼침 후 `similarSalesValue` 입력.
- **기존 E2E 영향**: `estate-asset-input-fieldcard.spec.ts`가 "시가·감정가·임대보증금·저당권 입력" 텍스트 클릭(현행) → **아코디언 전환 시 셀렉터 변경 필수**(시가/감정가 개별 헤더). 회귀 spec 갱신.

## 6. UI 회귀/검토 (STEP13)

- 라디오 삭제로 주식 비고 열 도출 회귀(STEP3 #10) — 주식은 본 섹션 숨김, 비고는 엔진 도출.
- 라벨 통일: "매매사례가액"(STEP3 #11).
- gift 공용 자동 적용(#15) — 증여 자산 카드도 동일.
- 기존 데이터 펼침: 필드별 자동 ON(비파괴).

## 7. 섹션 순서 — ✅ 안 가 확정 (사용자 2026-06-08, STEP13 #16)

**안 가 (로직 순서, CLAUDE.md "UI 순서=계산 로직 순서")**:
1. 우선순위 안내 문구
2. 시가·감정가액·매매사례가액 **아코디언 3** (엔진 우선순위 순)
3. 보충적 평가방법 (공시지가, 상시)
4. 담보·임대 (§66·§14, 최하단 — 평가 후 적용)

→ §2-2 ASCII가 확정 레이아웃. 보충평가는 AS-IS(맨 위)에서 **아코디언 아래로 이동**(의도적 순서 변경). 공시지가 자동조회 UX는 안내 문구·자동 펼침으로 보완.

## 8. 추가 UI 규칙 (STEP13 #17·#18)

- **#17**: `EstateValuationMetaSection` 제목 변경 시 `§` 아이콘(L46)·emerald tone(L44 카드 배경) 유지. 라디오 삭제로 카드 내용이 면적/수량만 남아도 카드 스타일 보존.
- **#18 E2E 회귀**: `estate-asset-input-fieldcard.spec.ts`(텍스트 "시가·감정가·임대보증금·저당권 입력" 클릭) 외, "평가방식"·"개별공시지가" 텍스트 셀렉터 사용 spec 전수 grep 후 갱신. 전체 E2E는 baseline 대조(`feedback_e2e_preexisting_failures`).
