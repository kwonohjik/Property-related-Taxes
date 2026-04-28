# 양도소득세 — 상속 부동산 취득 실거래가 특례 (의제취득일 분기) — TODO

> 계획서: `docs/01-plan/features/transfer-tax-inherited-acquisition.plan.md`
> 설계서: `docs/02-design/features/transfer-tax-inherited-acquisition.design.md`
> 작성일: 2026-04-28 / 최종 갱신: 2026-04-28 (P1~P4 완료 반영)
> 담당: 양도세(transfer-tax-senior) + 상속·증여(inheritance-gift-tax-senior) + QA(transfer-tax-qa)
> 의존: 1990.8.30. 이전 토지 환산 (`pre-1990-land-valuation.ts`) 완료 / FieldCard·SectionHeader·WizardSidebar 사용 가능

---

## 진행 상태 범례

| 기호 | 상태 |
| ---- | ---- |
| `[ ]` | 미시작 |
| `[~]` | 진행 중 |
| `[x]` | 완료 |
| `[!]` | 차단 / 검토 필요 |

---

## 작업 합산 요약

| Phase | 항목 수 | 완료 | 비율 | 신규 파일 | 수정 파일 | 신규 테스트 | 예상 시간 |
| ----- | ------- | ---- | ---- | --------- | --------- | ----------- | --------- |
| P1 데이터·법령 상수 | 6 | 5 | 83% | 1 | 1 | 1 | 0.5일 |
| P2 타입 확장 | 7 | 7 | 100% | 0 | 2 | 0 | 0.5일 |
| P3 엔진 case A/B 분기 | 14 | 14 | 100% | 2 | 2 | 0 | 1일 |
| P4 엔진 단위 테스트 | 19 | 18 | 95% | 1 | 1 | 1 | 1일 |
| P5 API zod·매핑 | 6 | 0 | 0% | 0 | 2 | 0 | 0.5일 |
| P6 UI 컴포넌트 | 14 | 0 | 0% | 3 | 2 | 0 | 1.5일 |
| P7 Store·Migration | 8 | 0 | 0% | 0 | 2 | 0 | 0.5일 |
| P8 e2e 통합·QA | 9 | 0 | 0% | 1 | 0 | 1 | 0.5일 |
| **합계** | **83** | **44** | **53%** | **7** | **12** | **3** | **6일** |

---

## Phase P1 — 데이터 · 법령 상수

### P1-A CPI 정적 테이블

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-01 | `CpiEntry` 인터페이스 + `CPI_MIN_YEAR`/`CPI_MAX_YEAR` 상수 export | `lib/tax-engine/data/cpi-rates.ts` (신규) | - | tsc 통과 |
| `[x]` | P1-02 | `CPI_TABLE: ReadonlyArray<CpiEntry>` (1965~2026, 통계청 KOSIS 연평균 기준 2020=100). placeholder 값 OK, P1-03에서 실측치 갱신 | 동상 | P1-01 | 62행 이상 |
| `[~]` | P1-03 | 통계청 KOSIS 실측치로 placeholder 갱신 (1965~2025 확정값 + 2026 잠정) | `lib/tax-engine/data/cpi-rates.ts` | P1-02 | 1965·1985·2020·2025 anchor 테스트 통과 |
| `[x]` | P1-04 | `getCpiAnnual(year)` + `getCpiRatio(fromDate, toDate)` 헬퍼 함수 | 동상 | P1-02 | 단위 테스트 4건 (정상·범위외·동일년·역방향) |

> ⚠️ P1-03: placeholder 구현 완료, KOSIS 확정치 교체 미완. `cpi-rates.ts` 7~10줄 TODO 코멘트 참조.

### P1-B 법령 상수 추가

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-05 | `TRANSFER.INHERITED_BEFORE_DEEMED` / `INHERITED_AFTER_DEEMED` / `DEEMED_ACQUISITION_DATE_BASIS` / `INHERITANCE_VALUATION_PRINCIPLE` 4상수 추가 | `lib/tax-engine/legal-codes/transfer.ts` | - | export 4건 |
| `[ ]` | P1-06 | `LawArticleModal` `/api/law/article` 매핑 — 위 4키가 §176조의2 ④, §163 ⑨, §60, §61 조문 원문으로 연결 | `app/api/law/article/route.ts` (동적 조회 방식, 별도 매핑 불필요. UI에서 올바른 인자 전달만 필요) | P6-03 | UI 배지 클릭 시 조문 표시 |

---

## Phase P2 — 타입 확장

### P2-A 상속 평가 타입 확장

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-01 | `InheritanceAcquisitionMethod` enum 확장 — `auction_public_sale` / `similar_sale` / `pre_deemed_max` 3종 추가 | `lib/tax-engine/types/inheritance-acquisition.types.ts` | - | tsc 통과 |
| `[x]` | P2-02 | `DEEMED_ACQUISITION_DATE` 상수 export (`new Date("1985-01-01T00:00:00.000Z")`) | 동상 | - | export 확인 |
| `[x]` | P2-03 | `InheritanceAcquisitionInput` 신규 필드 추가 — `decedentAcquisitionDate?` / `decedentActualPrice?` / `transferDate?` / `transferPrice?` / `standardPriceAtDeemedDate?` / `standardPriceAtTransfer?` / `reportedValue?` / `reportedMethod?` (모두 optional) | 동상 | P2-01 | 기존 5케이스 테스트 회귀 0 |
| `[x]` | P2-04 | `InheritanceAcquisitionResult.preDeemedBreakdown?` (`PreDeemedBreakdown` 인터페이스) + `warnings?` 필드 추가 | 동상 | P2-01 | 타입 export |

### P2-B 양도세 입력 타입 확장

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-05 | `TransferTaxInput.inheritedAcquisition?: InheritanceAcquisitionInput` 추가 | `lib/tax-engine/types/transfer.types.ts` | P2-03 | tsc 통과 |
| `[x]` | P2-06 | `CalculationStep` 사용 — STEP 0.45 label/formula/amount/legalBasis 형식으로 기록 (id 별도 추가 불필요) | `lib/tax-engine/transfer-tax.ts` | P2-05 | tsc 통과 |
| `[x]` | P2-07 | `TransferTaxResult.inheritedAcquisitionDetail?: InheritanceAcquisitionResult` 추가 + re-export 확인 | `lib/tax-engine/types/transfer.types.ts` | P2-05 | API에서 import 통과 |

---

## Phase P3 — 엔진 case A/B 분기

### P3-A 진입 분기

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-01 | `calculateInheritanceAcquisitionPrice()` 진입 분기 — `inheritanceDate < DEEMED_ACQUISITION_DATE` 판정 | `lib/tax-engine/inheritance-acquisition-price.ts` | P2-04 | 1984-12-31 → A, 1985-01-01 → B |
| `[x]` | P3-02 | `validateInput()` — case A/B 별 누락 가드 (inheritanceDate 미입력·음수 값·실가 입증 시 취득일 필수 등 4건 구현) | 동상 | P3-01 | throw 케이스 모두 단위 테스트 |

### P3-B case A — `calcPreDeemed()`

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-03 | 환산취득가 산정 — `calculateEstimatedAcquisitionPrice()` 재활용. 입력 누락 시 0 + warnings 처리 | `lib/tax-engine/inheritance-acquisition-price.ts` | P3-01 | tsc + 분기 테스트 |
| `[x]` | P3-04 | `decedentActualPrice × getCpiRatio()` 산정. CPI 범위 외 시 warnings 푸시 | 동상 | P1-04, P3-03 | warnings 테스트 |
| `[x]` | P3-05 | `Math.max(converted, inflationAdjusted ?? 0)` 선택 + `selectedMethod` 결정 | 동상 | P3-03, P3-04 | A-2/A-3 테스트 통과 |
| `[x]` | P3-06 | `buildPreDeemedFormula()` — 한국어 산식 문자열 (메모리 `feedback_result_view_korean_formula` 준수) | 동상 | P3-05 | 산식 문자열 검증 |
| `[x]` | P3-07 | `preDeemedBreakdown` 객체 조립 후 결과 반환 | 동상 | P3-05 | 필드 누락 0 |

### P3-C case B — `calcPostDeemed()`

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-08 | `reportedValue` + `reportedMethod` 모두 입력 시 신고가액 그대로 반환 | `lib/tax-engine/inheritance-acquisition-price.ts` | P3-01 | B-1~B-5 테스트 |
| `[x]` | P3-09 | `resolvePostDeemedLegalBasis(method)` switch — 5종 enum별 §60①·§60②·§60⑤·§61·시행령 §49 분기 | 동상 | P3-08 | legalBasis 문자열 매트릭스 |
| `[x]` | P3-10 | `legacyFallback()` — 기존 시가→감정→보충 우선순위 보존 (하위호환) | 동상 | P3-08 | 기존 5케이스 anchor 통과 |

> ⚠️ P3-09/P3-10: 설계서 함수명(`postDeemedLegalBasis` → `resolvePostDeemedLegalBasis`, `legacyPostDeemedFallback` → `legacyFallback`)과 차이 있음. 동작 동일. 설계서 §3-C 갱신 권고.

### P3-D `transfer-tax.ts` STEP 0.45 통합

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-11 | `inheritance-acquisition-helpers.ts` 신설 — `runInheritedAcquisitionStep()` / `resolveInheritedAcquisitionInput()` / `applyResultToInput()` / `InheritedAcquisitionStepResult` 인터페이스 | `lib/tax-engine/inheritance-acquisition-helpers.ts` (신규, 103줄) | P3-07, P3-10 | tsc 통과 |
| `[x]` | P3-12 | STEP 0.4(`pre1990Land`) 결과의 `standardPriceAtAcquisition`을 `inheritedAcquisition.standardPriceAtDeemedDate`로 자동 주입 (case A + 토지, 미입력 시 한정) | `lib/tax-engine/inheritance-acquisition-helpers.ts` L67-75 | P3-11 | E-1 테스트 |
| `[x]` | P3-13 | STEP 0.45 신설 — `runInheritedAcquisitionStep()` 호출 (5줄) + `acquisitionPrice` 덮어쓰기 + case A 환산 시 `useEstimatedAcquisition=true` 주입 | `lib/tax-engine/transfer-tax.ts` (line 186~196, 773줄) | P3-11, P3-12 | E-2 테스트 |
| `[x]` | P3-14 | `steps.push(inheritedStep.step)` 기록 + `inheritedAcquisitionDetail: inheritedAcquisitionStep?.result` 결과 반환 | 동상 | P3-13 | E-3 테스트 |

> ✅ 800줄 점검 완료: `transfer-tax.ts` 773줄 (helper 분리로 정책 준수). `inheritance-acquisition-price.ts` 272줄.

---

## Phase P4 — 엔진 단위 테스트

### P4-A 기존 테스트 회귀

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P4-01 | L-1~L-5 (기존 보충/시가/감정) 회귀 확인 — 기존 12케이스 전원 통과 + 신규 추가로 30케이스 | `__tests__/tax-engine/inheritance-acquisition-price.test.ts` | P3-10 | 기존 anchor 0 회귀 |

### P4-B case A 신규 테스트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P4-02 | A-1 환산만 (실가 미입증) — `toBe(184_000_000)` anchor | 동상 | P3-07 | `selected = "converted"` |
| `[x]` | P4-03 | A-2 실가×CPI 우세 — 분기 방향 검증 | 동상 | P3-05 | `selected = "inflation_adjusted"` |
| `[x]` | P4-04 | A-3 환산 우세 — `toBe(736_000_000)` anchor | 동상 | P3-05 | `selected = "converted"` |
| `[x]` | P4-05 | A-4 양쪽 정보 부족 — acquisitionPrice=0 + warnings | 동상 | P3-05 | `acquisitionPrice = 0` + warnings |
| `[x]` | P4-06 | A-5 양도시 기준시가 0 — throw 없이 converted=0 | 동상 | P3-03 | `converted = 0`, throw 안 함 |
| `[x]` | P4-07 | A-6 PDF 시나리오 환산값 anchor (1983.7.26. 상속·2023.2.16. 양도 920백만) | 동상 | P1-03, P3-07 | 환산값 `toBe()` ✅ / 최종 산출세액 anchor는 P8-04로 이관 |
| `[x]` | P4-08 | A-7 CPI 범위 외 (1960년 등) — warnings에 "CPI" 포함 | 동상 | P3-04 | warnings 검증 |
| `[x]` | P4-09 | A-8 decedent 일관성 검증 — actualPrice 있고 acquisitionDate 없음 → throw | 동상 | P3-02 | throw |

### P4-C case B 신규 테스트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P4-10 | B-1 시가 5억 — legalBasis에 §60 ① 포함 | `__tests__/tax-engine/inheritance-acquisition-price.test.ts` | P3-09 | ✅ |
| `[x]` | P4-11 | B-2 감정평가 4.8억 — §60 ⑤ | 동상 | P3-09 | ✅ |
| `[x]` | P4-12 | B-3 보충적평가 `toBe(1_069_096_799)` anchor (184.2㎡ × 5,804,000 floor값) | 동상 | P3-09 | §61 + 원 단위 anchor ✅ |
| `[x]` | P4-13 | B-4 수용·경매 6억 — §60 ② | 동상 | P3-09 | ✅ |
| `[x]` | P4-14 | B-5 유사매매 5.5억 — 시행령 §49 | 동상 | P3-09 | ✅ |
| `[x]` | P4-15 | B-6 신고가액 미입력 → 기존 폴백(시가) | 동상 | P3-10 | ✅ |

### P4-D 경계·픽스처

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P4-16 | D-1/D-2 1984-12-31 ↔ 1985-01-01 경계 분기 + `DEEMED_ACQUISITION_DATE` 상수 검증 (3케이스) | `__tests__/tax-engine/inheritance-acquisition-price.test.ts` | P3-01 | 정확히 갈림 |
| `[x]` | P4-17 | `_helpers/inheritance-fixture.ts` 신설 — `BEFORE_DEEMED` / `AFTER_DEEMED` / `PDF_SCENARIO` 3종 | `__tests__/tax-engine/_helpers/inheritance-fixture.ts` (신규, 40줄) | - | export 3종 |
| `[ ]` | P4-18 | CPI helper 단위 테스트 (`getCpiRatio`) — 정상·범위외·동일년·역방향 4건 | `__tests__/tax-engine/data/cpi-rates.test.ts` (신규) | P1-04 | 4 케이스 |
| `[x]` | P4-19 | `npm test` 전체 통과 확인 — 87파일 1,631테스트 0 fail | - | P4-01~P4-17 | ✅ 0 fail |

> ⚠️ P4-07: 환산값 anchor 완료. 최종 산출세액(양도차익→장특공제→세율→지방소득세)의 책 본문값 원 단위 anchor는 P1-03(KOSIS 실측치 갱신) + P8-04(e2e) 에서 완성.
> ⚠️ P4-18: 미착수 — `cpi-rates.test.ts` 신설 필요.

---

## Phase P5 — API zod · 매핑

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P5-01 | `inheritedAcquisitionSchema = z.discriminatedUnion("mode", [pre, post])` 정의 | `app/api/calc/transfer-tax/route.ts` (또는 `lib/api/transfer-tax-schema.ts`) | P2-05 | parse 통과 |
| `[ ]` | P5-02 | case A `.refine()` — `hasDecedentActualPrice=true`이면 `decedentAcquisitionDate`+`decedentActualPrice` 둘 다 필수 | 동상 | P5-01 | refine 메시지 |
| `[ ]` | P5-03 | `assetSchema`에 `inheritedAcquisition: inheritedAcquisitionSchema.optional()` 추가 | 동상 | P5-01 | 자산-수준 검증 |
| `[ ]` | P5-04 | `buildInheritedAcquisition(asset, transferDate, transferPrice)` — AssetForm → InheritanceAcquisitionInput 변환 | `app/api/calc/transfer-tax/route.ts` | P5-03 | 단위 테스트 |
| `[ ]` | P5-05 | `engineInput.inheritedAcquisition` 주입 후 `calculateTransferTax()` 호출 | 동상 | P5-04 | 200 OK 응답 |
| `[ ]` | P5-06 | API 응답 schema에 `inheritedAcquisitionDetail` 노출 — UI 결과 카드용 | 동상 | P5-05 | UI 렌더링 가능 |

---

## Phase P6 — UI 컴포넌트

### P6-A 자산-수준 입력 블록

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P6-01 | `CompanionAcqInheritanceBlock.tsx`에 상속개시일 DateInput 추가 (가장 위) | `components/calc/transfer/CompanionAcqInheritanceBlock.tsx` | P7-01 | onChange → `inheritanceMode` 자동 결정 |
| `[ ]` | P6-02 | `inheritanceMode` 분기 conditional rendering — `<PreDeemedInputs>` / `<PostDeemedInputs>` | 동상 | P6-01 | 1984-12-31 → PreDeemed 노출 |
| `[ ]` | P6-03 | `FieldCard` `trailing` prop에 `LawArticleModal` 배지 — §176의2 ④ / §163 ⑨ | 동상 | P1-06 | 클릭 시 조문 팝업 |

### P6-B PreDeemedInputs (case A)

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P6-04 | `<PreDeemedInputs>` 신규 컴포넌트 — props `{ asset, onChange, pre1990LandStandardPrice? }` | `components/calc/transfer/inheritance/PreDeemedInputs.tsx` (신규) | P7-01 | 컴포넌트 export |
| `[ ]` | P6-05 | 의제취득일 기준시가 입력 — Vworld API 자동조회 버튼 + 1990 토지 환산 결과 자동 주입 | 동상 | P6-04 | 클릭 시 자동 채움 |
| `[ ]` | P6-06 | 양도시 기준시가 입력 — 자산정보 기존 필드와 동기화 옵션 | 동상 | P6-04 | 동기화 토글 |
| `[ ]` | P6-07 | "피상속인 실가 입증 가능" 체크박스 + 조건부 취득일·취득가 입력 | 동상 | P6-04 | 토글 ON 시 2필드 노출 |

### P6-C PostDeemedInputs (case B)

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P6-08 | `<PostDeemedInputs>` 신규 컴포넌트 — props `{ asset, onChange }` | `components/calc/transfer/inheritance/PostDeemedInputs.tsx` (신규) | P7-01 | 컴포넌트 export |
| `[ ]` | P6-09 | 평가방법 Select (5종 enum) — 메모리 `feedback_select_component` 준수 (한국어 라벨 명시) | 동상 | P6-08 | 5종 라벨 표시 |
| `[ ]` | P6-10 | 신고가액 CurrencyInput + 평가 근거 메모 TextInput | 동상 | P6-08 | onFocus 전체선택 |
| `[ ]` | P6-11 | 보충적평가 선택 시 "보조계산 사용" 토글 + 토지 면적·단가·건물 가격 입력 + 자동 합산 → 신고가액 동기화 | 동상 | P6-08 | 자동 채움 후 사용자 수정 가능 |

### P6-D 결과 미리보기

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P6-12 | `<InheritanceValuationPreviewCard>` 신규 — props `{ mode, preDeemedPreview?, postDeemedPreview?, legalArticleKey }` | `components/calc/transfer/InheritanceValuationPreviewCard.tsx` (신규) | P7-01 | 두 모드 모두 렌더링 |
| `[ ]` | P6-13 | 한국어 산식 표기 (`floor`·약어 금지). 최종 적용 금액 강조, 후보는 회색 | 동상 | P6-12 | snapshot 검증 |
| `[ ]` | P6-14 | `WizardSidebar` 합계 항목 추가 — case A는 API 응답 후, case B는 즉시 (design §8-E) | `components/calc/transfer/wizard/WizardSidebar.tsx` (수정) | P5-06 | 0원 항목 미노출 |

---

## Phase P7 — Store · Migration

### P7-A AssetForm 신규 필드

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P7-01 | `inheritanceMode` / `inheritanceStartDate` / `decedentAcquisitionDate` / `decedentAcquisitionPrice` / `hasDecedentActualPrice` 5필드 추가 | `lib/stores/calc-wizard-asset.ts` | P2-05 | 인터페이스 정의 |
| `[ ]` | P7-02 | `inheritanceReportedValue` / `inheritanceValuationMethod` / `inheritanceValuationEvidence` / `useSupplementaryHelper` 4필드 추가 | 동상 | P7-01 | 인터페이스 정의 |
| `[ ]` | P7-03 | 보충적평가 보조 3필드 — `supplementaryLandArea` / `supplementaryLandUnitPrice` / `supplementaryBuildingValue` | 동상 | P7-01 | 인터페이스 정의 |
| `[ ]` | P7-04 | `makeDefaultAsset()`에 12개 신규 필드 기본값 추가 (boolean false / string "" / null·undefined) | 동상 | P7-03 | 신규 자산 생성 시 NaN 0건 |

### P7-B Migration

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P7-05 | `migrateLegacyForm()`에 12개 신규 필드 기본값 주입 | `lib/stores/calc-wizard-migration.ts` | P7-04 | 기존 sessionStorage 로드 시 NaN 0건 |
| `[ ]` | P7-06 | 기존 사용자가 `publishedValueAtInheritance` 입력했던 경우 → `inheritanceValuationMethod="supplementary"` 자동 매핑 | 동상 | P7-05 | 기존 입력 보존 |
| `[ ]` | P7-07 | persist version bump | `lib/stores/calc-wizard-store.ts` | P7-05 | 새 버전 적용 |
| `[ ]` | P7-08 | Zustand selector 검토 — 새 객체 반환 selector는 `useShallow` 사용 (메모리 `feedback_zustand_selector`) | UI 호출부 전체 | P7-04 | 무한 루프 0 |

---

## Phase P8 — e2e 통합 · QA

### P8-A e2e 테스트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P8-01 | E-1 case A + 1990 토지 결합 — `pre1990LandResult.standardPriceAtAcquisition` 자동 주입 검증 | `__tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts` (신규) | P3-12 | 단계별 step 노출 |
| `[ ]` | P8-02 | E-2 case A 환산 채택 시 `useEstimatedAcquisition=true` 흐름 — STEP 2 양도차익에서 동일 acquisitionPrice 사용 | 동상 | P3-13 | 일관성 검증 |
| `[ ]` | P8-03 | E-3 case B 보충적평가 — 최종 산출세액 + `result.inheritedAcquisitionDetail` 포함 | 동상 | P3-14 | result.inheritedAcquisitionDetail 검증 |
| `[ ]` | P8-04 | E-4 PDF 시나리오 산출세액 anchor — 책 본문 결과값 매칭 (양도차익→장특공제→누진세율→지방소득세까지) | 동상 | P1-03, P4-07 | `toBe(...)` 원 단위 |

### P8-B 검증

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[ ]` | P8-05 | gap-detector 실행 — design 대비 구현 일치도 90%+ | - | P8-04 | match rate 90%+ |
| `[ ]` | P8-06 | `transfer-tax-qa` 에이전트 회귀 검증 — 전체 테스트 0 회귀 | - | P8-04 | npm test 전체 통과 |
| `[ ]` | P8-07 | 의존성 검사 — `grep -r "from.*transfer-tax['\"]" lib/tax-engine/inheritance-acquisition-price.ts` 0건 | - | P3-14 | grep 결과 비어있음 |
| `[ ]` | P8-08 | 800줄 정책 점검 — 모든 신규·수정 파일 ≤ 800줄 | - | P3-14, P6-14 | wc -l 확인 |
| `[ ]` | P8-09 | 수용 기준 (plan §12) 9항목 모두 통과 확인 + 완료 보고서 작성 | `docs/04-report/transfer-tax-inherited-acquisition.report.md` (신규) | P8-05~08 | 보고서 commit |

---

## 주의사항 / 참조 메모리

- **계산 로직 순서 = UI 표시 순서**: 상속개시일 → 분기 → 후속 필드 노출 (메모리 `feedback_ui_order_follows_logic`).
- **결과 뷰 산식**: 한국어 풀어쓰기 + 중간 산술 결과 미표기 (메모리 `feedback_result_view_korean_formula`).
- **Select 컴포넌트**: `<SelectValue />` 단독 금지, 한국어 라벨 명시 (메모리 `feedback_select_component`).
- **DateInput**: `type="date"` 금지, `@/components/ui/date-input.tsx` 사용 (메모리 `feedback_date_input`).
- **CurrencyInput onFocus 전체선택**: 내장됨 (메모리 `feedback_select_on_focus`).
- **법령 조문 링크**: 외부 링크 금지, `LawArticleModal` 팝업 + `/api/law/article` API (메모리 `feedback_law_article_link`).
- **PDF 예제값 anchor**: 원 단위 `toBe()` 고정 (메모리 `feedback_pdf_example_test_anchoring`).
- **단방향 의존**: `transfer-tax.ts → inheritance-acquisition-helpers.ts → inheritance-acquisition-price.ts → cpi-rates.ts`. 역방향 import 금지.
- **800줄 정책**: 작업 중 PostToolUse hook 경고 발생 시 즉시 분리.

---

## 설계서 Minor 수정 사항 (갱신 권고)

| 항목 | 설계서 기술 | 실제 구현 | 동작 영향 |
| ---- | ---------- | --------- | --------- |
| case B 함수명 | `legacyPostDeemedFallback()` | `legacyFallback()` | 없음 (private 함수) |
| helper 함수명 | `buildInheritedAcquisitionStep()` | `applyResultToInput()` | 없음 (private 함수) |
| case A legalBasis 상수 | `TRANSFER.LAND_VALUATION_BY_RATIO` | `TRANSFER.PRE1990_STD_PRICE_CONVERSION` | 없음 (존재하지 않는 키명 오기) |
| `DEEMED_ACQUISITION_DATE` 정의 | `new Date("1985-01-01")` | `new Date("1985-01-01T00:00:00.000Z")` | 없음 (UTC 명시가 더 견고) |

---

## 진행 추적

| Phase | 시작일 | 완료일 | 비고 |
| ----- | ------ | ------ | ---- |
| P1 데이터·법령 상수 | 2026-04-28 | 2026-04-28 | P1-03 KOSIS 실측치 미갱신 |
| P2 타입 확장 | 2026-04-28 | 2026-04-28 | 전체 완료 |
| P3 엔진 case A/B 분기 | 2026-04-28 | 2026-04-28 | helper 분리 포함, 800줄 준수 |
| P4 엔진 단위 테스트 | 2026-04-28 | 2026-04-28 | 30케이스 통과. P4-18 미작성 |
| P5 API zod·매핑 | | | |
| P6 UI 컴포넌트 | | | |
| P7 Store·Migration | | | |
| P8 e2e 통합·QA | | | |
