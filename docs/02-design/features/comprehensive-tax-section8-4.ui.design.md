# 종합부동산세 §8④ 의제 + 세액공제 안분 — UI 설계

> Plan: `docs/01-plan/features/comprehensive-tax-section8-4.plan.md`
> 엔진 설계: `comprehensive-tax-section8-4.engine.design.md`
> 작성: 2026-06-12 · 13단계 자가 검토 STEP 12 산출물

---

## 현행 실측 요약

- Step1 `app/calc/comprehensive-tax/Step1Basic.tsx` (310줄): 과세연도·납세의무자 유형 2단 라디오(:141·:157)·1세대1주택 ToggleCard(:202)·부부 §10의2 ToggleCard(:247, 상호배타 disabled)
- Step2 `components/calc/PropertyListInput.tsx` (253줄): 주택 카드 — 공시가격·면적·location(metro/non_metro)·합산배제 유형 셀렉트
- 결과뷰 `ComprehensiveTaxResultView.tsx` (644줄): `HousingTaxSection` 공제 breakdown(고령자율·장기보유율·합산·캡)·안분 공제 행
- store `PropertyEntry`: §8④ 관련 필드 0건

## Phase D-1 UI 변경 (GAP-1 순서 정정에 따른 ⑦)

`HousingTaxSection` 행 순서를 새 계산 순서로 재배치: 산출세액 → **재산세 비율 안분 공제** → **1세대1주택 세액공제**(breakdown) → 세부담상한 → 결정세액. (현행: 세액공제가 안분보다 위 — 계산 순서 = UI 순서 정책 위반 상태가 됨.) 입력 UI 변경 없음.

## Phase D-2 사용자 시나리오

### S-1 지방 저가주택 (§8④4호 — 사례5 구성)

1. Step2에서 주택 2채 입력: 성동 15억(metro) + 세종 2억(**non_metro**).
2. 세종 주택 카드의 "§8④ 1세대1주택자 의제 특례" ToggleCard ON → 유형 RadioCardGroup에서 "지방 저가주택 (4호)" 선택. 추가 입력 없음 — 기존 location·공시가격으로 ⑧ 요건 검증(수도권 외 + 기준액 이하).
3. Step1: 1세대1주택 ToggleCard에 자동 안내("§8④ 특례 지정됨 — 1세대1주택자로 계산"). 부부 §10의2 동시 ON 가능(사례5).
4. 결과: 기본공제 12억(11억) + 공제 breakdown에 **안분 행** "1주택분 안분 (15억 ÷ 17억)" + "§8④4호 지방 저가주택" 배지.

### S-2 일시적 2주택 (§8④2호)

특례 ToggleCard ON → "일시적 2주택 (2호)" → **신규주택 취득일** DateInput (령 §4의2① 3년 — ⑧에서 과세기준일과 3년 비교 경고). 신청 기한 안내(§8⑤ 9.16~30).

### S-3 상속주택 (§8④3호)

"상속주택 (3호)" → **상속개시일** DateInput + **지분율** DecimalInput(%) (령 §4의2② 5년/40%/6억·3억 — ⑧ 경고). ※ 상속주택은 의제 미성립(일반 2주택+)이어도 주택 수 제외(나목)는 엔진이 자동 적용 — UI 추가 분기 없음.

### S-4 부속토지 (§8④1호)

"다른 주택의 부속토지 (1호)" → 추가 입력 없음 + 안내("신청 불요 — 당연 적용. 세율 주택 수에는 포함됩니다").

## 위젯 명세 (Step2 주택 카드 내 — PropertyListInput)

```
┌─ 주택 N ──────────────────────────────────┐
│ 공시가격 · 면적 · 소재지 (기존)              │
│ 합산배제 신청 셀렉트 (기존)                  │
│ ── 신규 ──                                  │
│ §8④ 1세대1주택자 의제 특례 — ToggleCard(violet)│
│   ON: 유형 RadioCardGroup (stack)            │
│     ○ 지방 저가주택 (4호) — 입력 없음         │
│        ※ location=metro 또는 공시>기준액이면  │
│          옵션 disabled + 사유 표시 (⑧ 사전 차단)│
│     ○ 일시적 2주택 (2호) — 신규주택 취득일     │
│     ○ 상속주택 (3호) — 상속개시일·지분율(%)    │
│     ○ 다른 주택의 부속토지 (1호) — 안내만      │
│   하단 안내: 신청 기한 9.16~30 (1호 제외)     │
└──────────────────────────────────────────┘
```

- 합산배제 유형이 none이 아닌 주택은 특례 ToggleCard **disabled** (`disabledReason`: 합산배제 주택은 §8④ 대상 아님 — D2-8) — 엔진 excludedSet 처리와 동기.
- 법인(taxpayerType ≠ individual) 선택 시 특례 ToggleCard 비노출 (Step1 매트릭스와 동일 정책).
- 일반주택(특례 미지정) 수가 1이 아닐 때: 카드 하단 amber 경고("§8④ 의제는 일반주택 1채 구성에서만 적용됩니다") — 차단 아님(엔진 경고와 동기, 상속 나목 count 제외는 여전히 유효하므로).

## 결과뷰 변경 (⑦)

| 위치 | 변경 |
|---|---|
| `HousingTaxSection` 공제 breakdown | `result.section8para4Detail` 존재 시 안분 행 추가: "1주택분 안분 ({main 공시} ÷ {전체 공시})" — **echo 사용, UI 재계산 금지** (`oneHouseDeduction.apportionmentRatio` 또는 `section8para4Detail`) |
| 배지 | §8④ 유형별: "§8④2호 일시적 2주택" / "3호 상속주택" / "4호 지방 저가주택" / "1호 부속토지" — `appliedTypes` echo. 기존 §10의2 배지와 병기 가능(사례5) |
| 기본공제 라벨 | `isSection8para4Applied`(= `section8para4Detail` truthy) → "1세대1주택 의제 (§8④)" — 기존 분기(1세대1주택/부부 특례/일반)에 추가 |
| 산식 표기 | 한국어 풀어쓰기: "공제 = 1,498,644 × 15억 ÷ 17억 × 40% = 528,933" 형식 |

## 14개 동기화 지점 (신규 per-property 필드 4개)

`section8para4Type` · `newHouseAcquisitionDate` · `inheritanceOpenDate` · `inheritanceShareRatio` (뒤 3개는 **Zod 검증 전용 — 엔진 미전달**):

| 지점 | 파일 | 내용 |
|---|---|---|
| ① | store `PropertyEntry` | 4필드 (type은 `"none"` 기본) |
| ② | `makeProperty()` | `"none"` / `""` 초기화 |
| ③ | `onRehydrateStorage` | property 배열 normalize `?? "none"` |
| ④⑬ | `comprehensive-api.ts` property 변환 | `section8para4Type` 전달(none이면 undefined) + 요건 3필드는 **body 포함하되 엔진 미사용**(Zod 검증 목적) — 또는 ⑧을 클라이언트에서 수행하고 body 제외 (디자인 단계 확정: 1차 body 포함 — Zod refine이 단일 진실) |
| ⑤ | `PropertyListInput.tsx` | 위 위젯 명세 (253줄 + ~100줄 — 800줄 여유. 초과 시 `Section8Para4Card` 분리) |
| ⑥ | — | 사이드바 없음 |
| ⑦ | 결과뷰 | 위 표 |
| ⑧ | Zod refine (property 수준) | 4호: `location === "non_metro"` && 공시 ≤ 연도별 기준액(R-2 상수) / 3호: 지분율 0~100 / 2호: 취득일 형식. UI 경고와 동기 (UI 통과↔Zod 차단 모순 금지 — 요건 미충족은 **경고+차단** 중 차단으로 통일: 법령 요건 명확 항목만 차단, 3년·5년 기간 판정은 경고) |
| ⑨⑫ | `comprehensive-input.ts` property 스키마 | enum + 3필드 optional 정의 (grep 자가 점검) |
| ⑩⑪ | — | 해당 없음 |
| ⑭ | route property 변환 블록 | `section8para4Type` 1:1 (요건 필드 매핑 불요 — 엔진 input에 없음) |

## E2E

| spec | 케이스 |
|---|---|
| `comprehensive-tax-section8-4.spec.ts` 신규 | CPT-S8-E2E-1: 2채 입력 + 4호 지정 → Step1 자동 안내 + 결과 기본공제 12억·안분 행·배지 / CPT-S8-E2E-2: 사례5 구성(2022 + §10의2 + 4호) → "969,711" 표시 / CPT-S8-E2E-3: metro 주택에서 4호 옵션 **disabled + 사유 표시** 확인 (UI 사전 차단 — Zod 422는 2차) |
| 기존 회귀 | 12건 (comprehensive 4 spec) + **CPT-E2E-2는 D-1에서 행 순서 변경 영향 실측** |

## 함정 체크리스트 (Do)

- [ ] ③ property 배열 normalize — 기존 저장 주택에 `section8para4Type` undefined → `"none"` (3중 일치)
- [ ] 합산배제 ↔ §8④ 상호배타: 카드 내 disabled 동기 (엔진 excludedSet 우선과 일치)
- [ ] 안분 행은 echo만 (UI 재계산 = dual-truth 금지)
- [ ] D-1 행 순서 변경 시 CPT-E2E-2 셀렉터 영향 실측
- [ ] 법인 시 특례 비노출 + API에서 type "none" strip (3중 패턴)
- [ ] DecimalInput(지분율 %) — CurrencyInput 금지
