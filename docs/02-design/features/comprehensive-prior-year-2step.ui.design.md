# 종부세 직전연도 입력 2단계 통합 — UI 설계

> 엔진 설계: `comprehensive-prior-year-2step.engine.design.md` · 계획서: `docs/00-pm/comprehensive-prior-year-2step-consolidation.plan.md`
> ★ 엔진 무변경. UI 위젯 재배치 + 변환·검증 + 5단계 제거 + 마이그레이션.

## 1. 사용자 시나리오

1. 주택 목록 **상단**에서 **세부담상한 모드** 선택: ① 적용 안 함 / ② 직전 공시가격 자동계산. (모드가 직전공시 입력 표시를 제어 → "모드 토글은 영향 필드 직전" 원칙: 모드가 위)
2. ② 선택 시 직전 세대속성(직전 조정2주택·직전 1세대1주택) 토글.
3. 각 주택 카드에서 **당해 공시가격** 입력(`StandardPriceInput`, 조회 버튼).
4. ② 모드면 바로 아래 **직전연도 공시가격** 노출 — 같은 `StandardPriceInput`(`referenceDate = year-1`)으로 직전연도도 조회(같은 PNU `year-1`).
5. 5단계(세부담 상한)는 **사라짐** → 4단계 마법사(기본/주택/합산배제/토지).

```
┌─ 세부담 상한 (직전연도 기준) ─────────────────────┐   ← 주택 목록 상단(모드가 직전공시 제어)
│  ○ 적용 안 함    ● 직전 공시가격으로 자동 계산              │
│  (② 시)  직전 조정2주택 [토글]   직전 1세대1주택 [토글]      │
└──────────────────────────────────────────────┘
[주택 N 카드]                                       (StandardPriceInput 2개 인접)
  공시가격 (당해 2022) [조회]  1,300,000,000  원
  직전연도 공시가격 (2021) [조회]  1,200,000,000  원   ← ② 모드일 때 노출 (당해 직하·referenceDate=year-1)
  지분율 / 재산세 감면율 / 건물·부속토지 분리 / 다가구 / 재산세 부과세액(직접입력)
[주택 목록 하단]
  전체 공시가격 합산 (2건)  2,700,000,000
```

## 2. 폼 상태 (①②③ — `lib/stores/comprehensive-wizard-store.ts`)

**유지**: `PropertyForm.priorAssessedValue`(:69)
**변경**: `previousYearCapMode`(:157) `"direct"|"auto"` → **`"none"|"auto"`** · `previousYearAutoIsOneHouse`·`previousYearAutoIsMultiAdjusted` 유지(세대속성)
**제거**: `priorAssessedTaxCapEnabled`(:68 주택별 토글 — 세대 모드가 표시 제어하므로 불필요, U2) · `PropertyForm.previousYearTotalTax`(:80 DEAD) · `FormData.previousYearTotalTax`(:155) · `previousYearAutoAssessedValue`(:158) · `previousYearAutoHouseValues`(:160) — `priorAssessedValue`로 흡수

## 3. UI 위젯 (⑤ — `components/calc/PropertyListInput.tsx`)

- 직전공시 입력을 카드 하단(:370)에서 **당해 공시(`StandardPriceInput` :177) 직하**로 이동. 동일 `StandardPriceInput`에 `referenceDate={(year-1)+"-06-01"}` 전달 → 직전연도 조회.
- 모드 라디오(`RadioCardGroup` tone="sky", 2택)·세대속성 토글(`ToggleCard`)을 **주택 목록 상단**(첫 주택 카드 전)에 배치 — 모드가 각 카드 직전공시 표시를 제어(U1, UI 순서 준수). ② 모드일 때만 각 주택 카드 직전공시 `StandardPriceInput` 노출. 5단계 `Step5TaxCap`(page.tsx:334~449) **삭제**.
- 합산배제 주택(C9' 확정 시) 직전공시 노출 정책: 합산배제 주택 카드에도 직전공시 입력란 + hint("직전 재산세상당액 합산용 — 당해 합산배제와 별개").

## 4. API 변환 (④⑬ — `lib/calc/comprehensive-api.ts`)

- engine.design "계산 알고리즘" 그대로: `capMode==="auto"` 시 주택별 `priorAssessedValue`(>0) → `properties[].priorAssessedValue` + `previousYearAuto` 11필드 파생.
- `previousYearTotalTax` 전송 분기(:456~458) **제거**. `previousYearAutoHouseValues`/`AssessedValue` 참조 제거.

## 5. Zod (⑨⑫) + Route (⑭)

- `comprehensive-input.ts`: refine ⑫(:566~579)·direct↔auto(:538) **제거**. `previousYearTotalTax`(메인)·`previousYearAuto.priorHouseValues`는 엔진 호환 위해 스키마 유지(변환이 채움).
- Route(`route.ts`) 매핑 무변경.

## 6. 결과뷰 산식 (⑦ — `ComprehensiveTaxResultView`)

- 세부담상한 표시(`:577` capMode 참조) — `"direct"|"auto"` → `"none"|"auto"` 동기화. direct 분기 표시 제거.

## 7. Validation (⑧ — `comprehensive-api.ts` validate + `page.tsx` handleNext)

- ② 모드: **전 주택 직전공시 필수**(혼재 차단, engine.design). 일부 누락 시 차단 — "직전 공시가격을 모든 주택에 입력하세요".
- ① 모드: 직전공시 불필요(미입력 허용).
- 기존 handleNext auto 검증(:542~556)을 2단계로 이동.

## 8. 마이그레이션 (③ — sessionStorage)

- `previousYearAutoHouseValues[i]` → `properties[i].priorAssessedValue` (다주택)
- `previousYearAutoAssessedValue` → `properties[0].priorAssessedValue` (1주택)
- `previousYearTotalTax`(direct) 보유자 → ② 전환 + 직전공시 재입력 안내(역산 불가)
- `currentStep` 4→3 재매핑(`STEP_MIGRATION`)

## 9. E2E

- `e2e/comprehensive-prior-year-2step.spec.ts`: 2단계 직전공시(당해 밑) 입력 → ② 모드 → 계산 → 세부담상한 결과.
- ★ **단계 재매핑(5→4) 회귀**: 기존 종부세 E2E가 5단계 가정 시 전부 영향 → 4단계 인덱스로 갱신·baseline 대조(메모리 `feedback_blocking_validation_full_e2e_regression`).
- ★ 합산배제·토지 E2E 단계 인덱스 시프트 점검.

## 10. 동기화 지점 체크리스트 (8/14)

- [ ] ① 폼 상태: capMode enum·제거 필드 정리
- [ ] ② initial: 제거 필드
- [ ] ③ normalize/migration: AutoHouseValues→priorAssessedValue·currentStep 4→3
- [ ] ④ API 변환: previousYearAuto 11필드 파생·direct 제거
- [ ] ⑤ UI 위젯: 직전공시 재배치·모드 2택·5단계 삭제
- [ ] ⑥ 사이드바: 합계 유지
- [ ] ⑦ 결과뷰: capMode enum 동기화
- [ ] ⑧ validation: ② 전 주택 필수·refine 제거 모순 차단
- [ ] ⑫ Zod: refine ⑫·direct↔auto 제거
- [ ] tsc 0 · `vitest run comprehensive*` · E2E 4단계 갱신
