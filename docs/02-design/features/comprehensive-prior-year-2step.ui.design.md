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

- 직전공시 입력을 카드 하단(:370)에서 **당해 공시(`StandardPriceInput` :177) 직하**로 이동. 동일 `StandardPriceInput`에 `referenceDate={(year-1)+"-06-01"}` 전달 → 직전연도 조회. **(Do) `hideLabel` prop 신규** 추가 — CurrencyInput이 `hideLabel`일 때만 `aria-label`을 붙이므로(분리 `<label>`은 htmlFor 미연결) E2E `getByLabel("직전연도 공시가격")` 안정화. 시각 라벨은 sky 카드 헤더 `<p>`가 담당.
- 모드 라디오(`RadioCardGroup` tone="sky", 2택)·세대속성 토글(`ToggleCard`)을 **주택 목록 상단**(첫 주택 카드 전)에 배치 — 모드가 각 카드 직전공시 표시를 제어(U1, UI 순서 준수). ② 모드일 때만 각 주택 카드 직전공시 `StandardPriceInput` 노출. **(Do 정정) 5단계에 있던 당해 조정대상지역 2주택 토글(`isMultiHouseInAdjustedArea`, 2022 이하)·corporate_special(§9②3호) 세부담상한 미적용 안내도 함께 2단계 상단으로 이전** — 설계 누락분, Step2Properties에서 `deriveCorporateClass`로 분기. 5단계 `Step5TaxCap`(page.tsx:334~449) **삭제**.
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
- **(Do 정정) `previousYearTotalTax`(direct) 보유자 → `"none"`** (②auto 전환 아님 — 직전 세액은 종부세+재산세 합계라 재산세만으론 역산 불가 → 세부담상한 미적용이 안전. ②로 전환하면 priorAssessedValue 없이 validation 차단되어 사용자 멈춤). 신규 기본도 `"none"`.
- 구 제거 필드(`previousYearTotalTax`·`previousYearAutoAssessedValue`·`previousYearAutoHouseValues`) `delete`로 정리
- `currentStep ≥ 4` → 3 재매핑(구 4=세부담상한·5=결과 → 3=토지, 마지막 입력 단계로 clamp)

## 9. E2E

- `e2e/comprehensive-prior-year-2step.spec.ts`: 2단계 직전공시(당해 밑) 입력 → ② 모드 → 계산 → 세부담상한 결과.
- ★ **단계 재매핑(5→4) 회귀**: 기존 종부세 E2E가 5단계 가정 시 전부 영향 → 4단계 인덱스로 갱신·baseline 대조(메모리 `feedback_blocking_validation_full_e2e_regression`).
- ★ 합산배제·토지 E2E 단계 인덱스 시프트 점검.

**(Do 완료)**:
- 신규 spec N-2(사례8 16,747,099 보존)·N-3(none 미노출·auto 전환 노출)·N-4(auto 혼재 차단) 통과.
- 기존 종부세 E2E 21개 전부 4단계로 갱신·통과: cap-mode 사용 8개(직전공시 `getByLabel("직전연도 공시가격")`·cap-mode-auto Step2 이동·당해공시는 클릭 전 입력) + 단계수 의존 10개(clickNext −1·Step5 참조 Step2 이동) + 신규 3개.
- ★ **잠복 셀렉터 버그 동반 정정**(단계수 무관, 커밋 c5b4534f "재산세 부과세액" CurrencyInput 추가 후): 주택 카드 `placeholder="금액 입력"`이 공시+부과재산세 **2개** → 다주택 `nth(1)`로 주택2 공시 채우던 spec이 주택1 부과재산세 칸을 채워 주택2 공시 0이 되던 버그. **주택2 공시 = nth(2)**(공시 짝수 인덱스 0/2/4). CPT-YA-E2E-3(3주택 28,080,000)·S8-E2E-1/2(969,711)·case5·PYM-E1 정정 — 기대 numeric 보존(임의 변경 아님).
- ★ Step5 직접 참조 검증(tax-year-aware 당해 조정대상지역 토글 노출/미노출·corporation 세부담상한 미적용) → Step2로 이동. corporation은 "전년도 총세액" 라벨 폐지 → cap-mode-auto/직전공시 부재 검증으로 대체.
- ★ case12-filing F-3: 주택분 직접입력 모드(cap-mode-direct) 완전 제거로 "⑯=직접입력값 3,243,000" 재현 불가 → none 모드 전환 + 해당 단언 제거(임의값 발명 금지). F-2도 직접입력 fill 제거.

## 10. 동기화 지점 체크리스트 (8/14) — Do 완료

- [x] ① 폼 상태: `previousYearCapMode "none"|"auto"`·제거 필드 4개(priorAssessedTaxCapEnabled·previousYearTotalTax·AutoAssessedValue·AutoHouseValues) 정리
- [x] ② initial: `defaultFormData` capMode "none"·제거 필드 삭제
- [x] ③ normalize/migration: `onRehydrateStorage` AutoHouseValues[i]→properties[i].priorAssessedValue·direct→none·currentStep≥4→3·구필드 delete
- [x] ④ API 변환: `capMode==="auto"` 게이트로 priorAssessedValue 전송·previousYearAuto 파생·previousYearTotalTax undefined·하위호환 분기 제거
- [x] ⑤ UI 위젯: 직전공시 당해 직하 `StandardPriceInput`(hideLabel)·모드 2택+세대속성+당해 조정2주택 2단계 상단·5단계 삭제
- [x] ⑥ 사이드바: 합계 유지(변경 없음)
- [x] ⑦ 결과뷰: capMode "none"|"auto" 동기화·previousYearTotalTaxDirect 제거
- [x] ⑧ validation: `validatePriorAssessedValue` auto 전 주택 필수(2단계 handleNext)·refine ⑫ 제거
- [x] ⑫ Zod: refine ⑫·direct↔auto 상호배타 제거(엔진 호환 위해 previousYearTotalTax·previousYearAuto 스키마 유지)
- [x] tsc 0 · `vitest run comprehensive` 375 · 신규 E2E 3종 + 기존 8종 갱신 통과 (나머지 단계수 의존 10종 갱신 진행)
- [x] ★ Do 추가: 엔진 §122 이중 적용 수정 (engine.design 「Do 단계 환류」) — 다주택+감면 교재 정답 보존
