# Step1 통합 계획 — 사용자 제시 방향

## Context

**사용자가 제시한 통합 방향**:

1. **취득가 산정방식**: Step1의 자산카드에서 이미 "실거래가 / 환산취득가"가 `useEstimatedAcquisition` 토글로 구분되고 있으므로, 폼-전역 `acquisitionMethod` 필드는 **불필요·폐지**.
2. **감정가액**: 사용자에게 "감정가액 사용입니까?" 확인 후 → **실가 입력 루틴(`fixedAcquisitionPrice`)으로 그대로 입력** + **필요경비 개산공제 자동 반영**. 별도 `appraisalValue` 폼 필드 폐지.
3. **신축·증축 특례**: 폼-전역 4필드(`isSelfBuilt`, `buildingType`, `constructionDate`, `extensionFloorArea`)를 **자산-수준으로 이동**, Step1 자산카드의 **취득가액 입력란 마지막 부분**(`CompanionAcqPurchaseBlock` 하단)에 통합.

이로써 Step3(`steps/Step3.tsx`)는 사실상 빈 단계가 됨 → **폐지 가능, 5단계 → 4단계로 단축**.

본 문서는 (a) 이 방향의 **에러 발생 소지 검토**와 (b) **단계별 작업 계획**을 함께 다룸.

---

## 1. 변경 후 데이터 흐름 (목표 상태)

### 1.1 취득가 산정 의사표시 (자산-수준)
| 자산 카드 입력 | 의미 | 엔진 매핑 |
|---|---|---|
| `useEstimatedAcquisition = false` + `fixedAcquisitionPrice` 입력 | 실거래가 | `acquisitionMethod = "actual"` (도출) |
| `useEstimatedAcquisition = true` + 공시가격 조회 | 환산취득가 | `acquisitionMethod = "estimated"` (도출) |
| **신규: `isAppraisalAcquisition = true`** + `fixedAcquisitionPrice`에 감정가액 입력 | 감정가액 | `acquisitionMethod = "appraisal"` (도출) |

→ **폼-전역 `form.acquisitionMethod`는 폐지하되, 엔진 입력의 `acquisitionMethod`는 자산-수준 플래그에서 도출**해 그대로 보존 (엔진 로직 변경 없음).

### 1.2 신축·증축 (자산-수준)
- `AssetForm`에 4필드 추가: `isSelfBuilt`, `buildingType`, `constructionDate`, `extensionFloorArea`
- `acquisitionCause === "purchase"`인 자산 카드에만 노출.
- 다건 양도에서 **자산 1번은 신축, 자산 2번은 일반 매매** 같은 패턴이 자연스럽게 가능.

### 1.3 Step3 폐지 → 마법사 4단계
| 인덱스 | 변경 전 | 변경 후 |
|---|---|---|
| 0 | 자산 목록 | 자산 목록 (취득상세·환산·신축 모두 포함) |
| 1 | 취득 정보 (Step3) | (삭제) |
| 2 | 보유 상황 | 보유 상황 |
| 3 | 감면·공제 | 감면·공제 |
| 4 | 가산세 | 가산세 |

---

## 2. 에러 발생 소지 검토 (위험 8건)

### R1. 엔진은 `acquisitionMethod`를 핵심 분기 키로 사용 — 도출 로직 누락 시 계산 오류

`lib/tax-engine/transfer-tax.ts` 발췌:
```
라인 322-323: const mpPenaltyBase = effectiveInput.acquisitionMethod === "appraisal"
                ? (effectiveInput.appraisalValue ?? 0) : ...
라인 405-406: const pb0 = input.acquisitionMethod === "appraisal"
                ? (input.appraisalValue ?? 0) : ...
라인 609-610: const penaltyBase = input.acquisitionMethod === "appraisal"
                ? (input.appraisalValue ?? 0) : ...
```

**위험**: 신축·증축 가산세(§114조의2) 계산에서 `acquisitionMethod === "appraisal"` 분기가 3곳에 박혀 있음. 폼에서 `acquisitionMethod`를 폐지해도 **API 변환 단계에서 자산 플래그로부터 정확히 도출**하지 않으면 가산세 base가 잘못 계산.

**대응**: `transfer-tax-api.ts`에서 자산-수준 플래그 → 엔진 입력 변환:
```typescript
// 변경 전
const isEstimated = form.acquisitionMethod === "estimated" || primary.useEstimatedAcquisition;
const isAppraisal = form.acquisitionMethod === "appraisal";
acquisitionMethod: form.acquisitionMethod || "actual",

// 변경 후
const isAppraisal = primary.isAppraisalAcquisition === true;
const isEstimated = !isAppraisal && primary.useEstimatedAcquisition;
acquisitionMethod: isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual",
appraisalValue: isAppraisal ? parseAmount(primary.fixedAcquisitionPrice) : undefined,
```
**엔진 입력 타입은 변경 없음** → 엔진 변경 0건 + 33건 단위 테스트 그대로 통과 (테스트는 엔진 입력을 직접 만듦).

### R2. 감정가액 + 개산공제 자동 적용의 의미 불명확

**현재 엔진의 개산공제 로직** (`transfer-tax.ts` 라인 274, 379-386):
- 환산취득가(`estimated`) 모드일 때만 `estimatedDeduction` 적용 (실제 필요경비 대신 개산공제율 사용)
- 감정가액(`appraisal`) 모드는 현재 개산공제 자동 적용이 **명시되지 않음**

**소득세법 시행령 §163 ⑥**: 환산취득가·감정가액 모두 개산공제 적용 가능 (선택권 있음).

**위험**: 사용자 의도에 따라 두 가지 해석 가능:
- (a) 감정가액 선택 시 **자동으로** 개산공제 적용 (사용자 수정 불가)
- (b) 감정가액 선택 시 **개산공제 토글이 표시**되어 사용자가 선택

**대응**: 본 plan에서는 **(b) 해석 채택** — 감정가액 모드 시 개산공제 토글 표시. 엔진 변경 필요 (현재는 estimated 모드 자동 적용). 사용자 확인 필요 (§ 7 질문 1).

### R3. 다필지 모드(parcelMode)의 acquisitionMethod 충돌

`transfer-tax-api.ts` 라인 346·384:
- 다필지 자산은 **자산-수준** `parcels[i].acquisitionMethod`(actual/estimated만)을 이미 사용 — appraisal 미지원.
- 폼-전역 `form.acquisitionMethod`는 **다필지 자산에는 무시**됨.

**위험**: 폼-전역 폐지 시 영향 없음 — 다필지는 이미 자산-수준이라 변경 무관.

**대응**: 다필지 모드 변경 없음. 단, 자산-수준 `isAppraisalAcquisition` 플래그를 다필지에는 노출하지 않음 (`parcelMode === true`일 때 감정가액 토글 비활성).

### R4. 상속·증여 자산에서 신축·증축 4필드의 의미

`isSelfBuilt`는 본인이 신축한 경우 §114조의2 가산세 적용. 상속·증여는 피상속인/증여자의 신축 여부가 별도 판정 사항.

**위험**: 자산-수준으로 이동하면 모든 취득 원인에서 노출 가능 → 상속·증여 자산에서도 잘못 입력될 위험.

**대응**: 자산 카드의 신축·증축 섹션은 `acquisitionCause === "purchase"`일 때만 렌더 (`CompanionAcqInheritanceBlock`·`CompanionAcqGiftBlock`에는 미추가).

### R5. sessionStorage 마이그레이션 필요

기존 게스트 사용자가 sessionStorage에 다음 값을 가지고 있을 수 있음:
- `form.acquisitionMethod = "appraisal"`
- `form.appraisalValue = "100000000"`
- `form.isSelfBuilt = true`, `form.buildingType = "new"`, ...

**위험**: 마법사 진입 시 폐지된 필드가 무시되면 사용자 입력 손실.

**대응**: `lib/stores/calc-wizard-store.ts`의 `migrateLegacyForm` 확장:
```typescript
// 폼-전역 필드 → assets[0]로 이전
if (legacy.acquisitionMethod === "appraisal") {
  primaryAsset.isAppraisalAcquisition = true;
  if (legacy.appraisalValue) primaryAsset.fixedAcquisitionPrice = legacy.appraisalValue;
}
if (legacy.isSelfBuilt) {
  primaryAsset.isSelfBuilt = true;
  primaryAsset.buildingType = legacy.buildingType;
  primaryAsset.constructionDate = legacy.constructionDate;
  primaryAsset.extensionFloorArea = legacy.extensionFloorArea;
}
```

### R6. 마법사 단계 인덱스 재정렬 — 다건 모드 영향

`STEPS_SINGLE` 5→4 단축 시:
- `TransferTaxCalculator.tsx` `stepComponents`·`STEP_TITLES`·`sidebarSteps` 모두 재인덱싱
- `lib/calc/multi-transfer-tax-validate.ts` `for (let step = 0; step <= 3; step++)` → `step <= 2`로 변경
- `lib/calc/transfer-tax-validate.ts` Step2 함수 폐지·Step1으로 흡수, Step3·4·5는 인덱스 -1
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` 영향 가능

**위험**: 다건 모드 사용자가 마법사 도중 새 코드로 업그레이드되면 `currentStep`이 잘못된 단계를 가리킬 수 있음 (예: 저장된 `currentStep = 4` → 신 코드에서는 결과 화면).

**대응**: `migrateLegacyForm`과 함께 `currentStep`도 마이그레이션 — 이전 step 값을 새 인덱스로 매핑(0=0, 1→0, 2=1, 3=2, 4=3, 5=4 결과). 또는 마이그레이션 불필요 시 `setStep(0)` 강제 리셋.

### R7. validateStep 함수 시그니처 보존 — 기존 단건/다건 호출부 영향

`validateStep(currentStep, formData)`는 단건과 다건 모두에서 호출. Step2 검증 룰(다필지·환산취득가·1990 환산)을 Step1으로 흡수해야 함.

**위험**: 검증 룰을 빠뜨리면 사용자가 잘못된 입력으로 진행 가능.

**대응**: 새 `validateStep(0, ...)`은 기존 `validateStep(0, ...)` ∪ `validateStep(1, ...)` ∪ `validateStep(2, ...)` 의 합집합. 다필지 검증과 환산취득가 검증 모두 Step1에서 함께 수행.

### R8. 800줄 정책 — 자산 카드 비대화 위험

- `CompanionAssetCard.tsx` ≈ 1,000줄 (이미 800줄 초과 — 기존 예외)
- `CompanionAcqPurchaseBlock.tsx` ≈ 250줄. 신축·증축(50줄) + 1990 환산(40줄) 추가 시 ≈ 340줄 — 정책 통과
- `Step3.tsx` 폐지 (-613줄)

**대응**: `CompanionAcqPurchaseBlock` 안에 신축·증축·1990 섹션을 추가하되, sub-component 추출(`SelfBuiltSection.tsx`, `Pre1990Section.tsx`)로 800줄 안 유지. 1990 섹션은 이미 `Pre1990LandValuationInput.tsx`로 추출되어 있어 그대로 import 가능.

---

## 3. 변경 영향 파일 목록

### 3.1 엔진 (1파일)
| 파일 | 변경 |
|---|---|
| `lib/tax-engine/transfer-tax.ts` | 라인 274·379 부근: `useEstimatedDeduction = acquisitionMethod === "estimated" \|\| acquisitionMethod === "appraisal"` (Q1 자동 개산공제). 약 2줄 |

### 3.2 store/스키마 (4파일)
| 파일 | 변경 |
|---|---|
| `lib/stores/calc-wizard-store.ts` | `AssetForm`에 12필드 추가(취득가 1 + 신축 4 + 1990 7). `TransferFormData`에서 13필드 제거. `migrateLegacyForm`에 신축·1990 마이그레이션 추가. `currentStep` 5→4 단계 매핑(`STEP_MIGRATION`). `makeDefaultAsset` 기본값 |
| `lib/api/transfer-tax-schema.ts` | Zod 폼 스키마에서 13필드 제거. asset Zod에 12필드 추가. 라인 356·363·370 superRefine 자산별 이동 |
| `lib/calc/transfer-tax-api.ts` | 라인 217-261 + 408-437 변환: 폼-전역 키 → `primary.X` 도출. `acquisitionMethod` 도출 (R1). `appraisalValue` → `primary.fixedAcquisitionPrice`. `pre1990Land` 객체 자산-수준에서 빌드 |
| `lib/calc/transfer-tax-validate.ts` | Step2(라인 91-205) 폐지·내용 Step1으로 흡수. Step3·4·5 → Step2·3·4 인덱스 -1 |

### 3.3 UI (5파일)
| 파일 | 변경 |
|---|---|
| `app/calc/transfer-tax/TransferTaxCalculator.tsx` | `STEPS_SINGLE`·`STEP_TITLES` 4항목. `stepComponents` 재배열. `Step3 import` 제거 |
| `app/calc/transfer-tax/steps/Step3.tsx` | **파일 삭제** |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 하단 통합: (1) 감정가액 토글(`isAppraisalAcquisition`, useEstimatedAcquisition과 상호 배타), (2) 신축·증축 섹션 (`acquisitionCause === "purchase"`만), (3) 1990 환산 섹션 (`assetKind === "land"` + `acquisitionDate < 1990-08-30`만). 800줄 정책 회피 위해 sub-component 추출 |
| (신규) `components/calc/transfer/SelfBuiltSection.tsx` | 신축·증축 4필드 입력 UI. 자산별 `onChange(patch: Partial<AssetForm>)`. 약 70줄 |
| `components/calc/inputs/Pre1990LandValuationInput.tsx` | props 시그니처 변경: 폼-전역 객체 → 자산-수준 객체. `acquisitionDate`/`acquisitionArea` props는 자산에서 직접 |

### 3.4 다건 모드 (2파일)
| 파일 | 변경 |
|---|---|
| `lib/calc/multi-transfer-tax-validate.ts` | `for (step <= 3)` → `for (step <= 2)` |
| `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` | step 인덱스 사용처 검토 (대부분 단건 캘큨레이터 임베드라 자동 전파) |

### 3.5 테스트 (4파일)
- `__tests__/tax-engine/multi-parcel-transfer.test.ts`: 16건 fixture가 엔진 입력 직접 사용 — Q1 엔진 변경 영향 없음(estimated/actual만 사용). **변경 0**
- `__tests__/tax-engine/exchange-land-integration.test.ts`: 동상. **변경 0**
- `__tests__/api/transfer-tax-form.test.ts` (또는 동급): legacy 폼 → 신 폼 변환 테스트 신규 추가 (5케이스: appraisal, isSelfBuilt, pre1990, 다중, 결합)
- `__tests__/lib/transfer-step-migration.test.ts` 신규: `migrateLegacyForm` 단위 (5케이스)
- `__tests__/lib/transfer-validate.test.ts` (있다면) 인덱스 -1 갱신

---

## 4. 단계별 작업 계획 (6 phase)

### Phase 1 — 엔진 미세 수정 (10분)
- P1-01 `lib/tax-engine/transfer-tax.ts` 라인 274·379 — `useEstimatedDeduction` 분기 확장 (Q1)
- P1-02 기존 vitest 그린 유지 확인 (변경된 분기 fixture 없음 검증)

### Phase 2 — Store/스키마 마이그레이션 (1일)
- P2-01 `lib/stores/calc-wizard-store.ts` `AssetForm`에 12필드 추가 + `makeDefaultAsset` 기본값
- P2-02 `TransferFormData`에서 13필드 제거 + `defaultFormData` 정리
- P2-03 `migrateLegacyForm` 확장 — 신축·증축 + 1990 환산 + 감정가액 모두 자산화
- P2-04 `currentStep` 5→4 매핑(`STEP_MIGRATION`) `merge` 함수에 추가
- P2-05 `lib/api/transfer-tax-schema.ts` Zod 13필드 제거 + asset Zod 12필드 추가 + superRefine 자산별
- P2-06 `__tests__/lib/transfer-step-migration.test.ts` 신규 5케이스
- P2-07 `npm run build` 무경고 (타입 체크 통과)

### Phase 3 — API 변환 (반나절)
- P3-01 `lib/calc/transfer-tax-api.ts` 라인 217-261 도출 로직 (R1 대응)
- P3-02 라인 408-437 `pre1990Land` 객체 자산-수준 빌드
- P3-03 `__tests__/api/` 변환 시나리오 테스트 보강 (감정가액·신축·1990 각 1건)

### Phase 4 — 검증 단계 통합 (반나절)
- P4-01 `lib/calc/transfer-tax-validate.ts` Step2 폐지·내용 Step1 흡수, Step3·4·5 → Step2·3·4
- P4-02 `lib/calc/multi-transfer-tax-validate.ts` `step <= 3` → `step <= 2`
- P4-03 단건/다건 모드 검증 회귀 테스트 통과 확인

### Phase 5 — UI 통합 (1.5일)
- P5-01 `components/calc/transfer/SelfBuiltSection.tsx` 신규 (50~70줄)
- P5-02 `components/calc/inputs/Pre1990LandValuationInput.tsx` props 시그니처 자산화
- P5-03 `CompanionAcqPurchaseBlock.tsx` 하단 통합:
   - 감정가액 토글(`isAppraisalAcquisition`) — useEstimatedAcquisition과 상호 배타 라디오
   - 신축·증축 섹션 — `<SelfBuiltSection asset={...} onChange={...} />`
   - 1990 환산 섹션 — `<Pre1990LandValuationInput asset={...} onChange={...} />`
   - 800줄 정책 위반 없도록 sub-component 추가 추출 가능성 검토
- P5-04 `app/calc/transfer-tax/steps/Step3.tsx` 파일 삭제
- P5-05 `TransferTaxCalculator.tsx` STEPS·STEP_TITLES·stepComponents·sidebarSteps 4단계로 축소
- P5-06 `MultiTransferTaxCalculator.tsx` 인덱스 사용처 정정

### Phase 6 — 회귀·QA (반나절)
- P6-01 `npm test` 1,500+ 케이스 그린
- P6-02 `npm run lint`·`npm run build` 무경고
- P6-03 800줄 정책 위반 0건
- P6-04 브라우저 시각 점검 8시나리오 (§6 표 그대로)
- P6-05 sessionStorage 마이그레이션 시나리오 (legacy 데이터 주입 후 정상 복원)

**총 작업량**: 약 3~3.5일

### Phase 별 commit 분리 전략

각 Phase는 단독 commit으로 머지 가능 (앞 Phase만 머지된 상태에서도 빌드·테스트 그린):
- C1 `fix(engine): 감정가액 모드 개산공제 자동 적용 (소칙 §163⑥)` (Phase 1)
- C2 `refactor(store): 신축·1990·감정가액 필드 자산-수준으로 마이그레이션` (Phase 2)
- C3 `refactor(api): 자산-수준 acquisitionMethod 도출 + pre1990Land 자산화` (Phase 3)
- C4 `refactor(validate): Step2 폐지·Step1 통합·인덱스 -1 재정렬` (Phase 4)
- C5 `feat(ui): Step1 자산카드에 감정가액·신축·1990 통합 + Step3 폐지` (Phase 5)
- C6 `chore: 회귀 검증 + 시각 점검 보고` (Phase 6)

---

## 5. 핵심 함수·파일 (구현 시 참조)

| 영역 | 파일·심볼 | 비고 |
|---|---|---|
| 자산 카드 매매 블록 | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 신축·증축 섹션 통합 위치 |
| 1990 환산 (이미 추출됨) | `components/calc/inputs/Pre1990LandValuationInput.tsx` | props에 자산별 acquisitionDate/area 전달 |
| API 변환 | `lib/calc/transfer-tax-api.ts:160` `callTransferTaxAPI` | R1 핵심 도출 로직 |
| 폼 Zod | `lib/api/transfer-tax-schema.ts:289` `transferFormSchema` | 폼-전역 6필드 제거 위치 |
| Store 마이그레이션 | `lib/stores/calc-wizard-store.ts:migrateLegacyForm` | sessionStorage 호환성 |
| 검증 | `lib/calc/transfer-tax-validate.ts:91` Step2 함수 | Step1으로 흡수 대상 |

---

## 6. 검증·QA 시나리오 (Phase 5)

| # | 시나리오 | 입력 | 기대 결과 |
|---|---|---|---|
| 1 | 단건 매매 (실거래가) | 자산 카드: useEstimated=false, fixedAcquisitionPrice=5억 | acquisitionMethod="actual", 양도세 정상 계산 |
| 2 | 단건 환산취득가 | 자산 카드: useEstimated=true, 공시가격 조회 | acquisitionMethod="estimated", 개산공제 자동 적용 |
| 3 | 단건 감정가액 | 자산 카드: isAppraisalAcquisition=true, fixedAcquisitionPrice=감정가 | acquisitionMethod="appraisal", appraisalValue=fixedAcquisitionPrice 매핑 |
| 4 | 단건 매매 + 신축 | 자산 카드: 매매 + isSelfBuilt=true + buildingType="new" + 완공일 | §114조의2 가산세 정상 |
| 5 | 다건 양도 (자산1=신축, 자산2=일반) | 카드 1: isSelfBuilt=true, 카드 2: isSelfBuilt=false | 자산별 가산세 분리 적용 |
| 6 | sessionStorage 마이그레이션 | legacy `form.acquisitionMethod="appraisal"` + `form.appraisalValue=3억` | 신 코드에서 `assets[0].isAppraisalAcquisition=true` + `fixedAcquisitionPrice="300000000"` |
| 7 | 1990 토지 (단건) | acquisitionDate < 1990-08-30 + 토지등급 입력 | 환산취득가 정상 |
| 8 | 다필지 + 환산 | parcelMode=true, 필지별 actual/estimated | 다필지 변환 영향 없음 |

---

## 7. 확정된 결정 사항 (사용자 답변 2026-04-25)

| Q | 답 | 영향 |
|---|---|---|
| Q1. 감정가액 + 개산공제 | **자동 적용** | 엔진(`transfer-tax.ts`) 라인 274·379-386 분기를 `estimated || appraisal` 로 확장. 1~2줄 변경 |
| Q2. 1990 환산 UI 위치 | **자산카드 하단 통합** | `pre1990*` 7필드를 `AssetForm`으로 이동. `Pre1990LandValuationInput`은 자산별 props 받음. 다건 양도 시 자산별 1990 환산 가능 |
| Q3. 마법사 단계 축소 | **동의 (5→4)** | Step3 파일 삭제. 다건 모드 `currentStep` 마이그레이션 포함 |

### Q1 추가 영향: 엔진 분기 확장

`lib/tax-engine/transfer-tax.ts` 변경 (1~2줄 추가):
```typescript
// 변경 전 (라인 274 부근)
const useEstimatedDeduction = effectiveInput.acquisitionMethod === "estimated";

// 변경 후
const useEstimatedDeduction =
  effectiveInput.acquisitionMethod === "estimated" ||
  effectiveInput.acquisitionMethod === "appraisal";
```

**위험**: 기존 1,507건 테스트 중 `acquisitionMethod === "appraisal"` fixture가 있다면 결과 변동 가능 — grep 결과상 fixture는 없고 multi-parcel 테스트는 `estimated`/`actual`만 사용. 안전.

### Q2 추가 영향: AssetForm에 7필드 추가

`AssetForm`에 추가될 신규 필드 (총 12필드):
```typescript
// 취득가 산정 (1)
isAppraisalAcquisition: boolean;
// 신축·증축 (4)
isSelfBuilt: boolean;
buildingType: "new" | "extension" | "";
constructionDate: string;
extensionFloorArea: string;
// 1990 환산 (7)
pre1990Enabled: boolean;
pre1990PricePerSqm_1990: string;
pre1990PricePerSqm_atTransfer: string;
pre1990Grade_current: string;
pre1990Grade_prev: string;
pre1990Grade_atAcq: string;
pre1990GradeMode: "number" | "value";
```

`TransferFormData`에서 제거될 필드 (총 13필드): `acquisitionMethod`, `appraisalValue`, `isSelfBuilt`, `buildingType`, `constructionDate`, `extensionFloorArea`, `pre1990Enabled`, `pre1990PricePerSqm_1990`, `pre1990PricePerSqm_atTransfer`, `pre1990Grade_current`, `pre1990Grade_prev`, `pre1990Grade_atAcq`, `pre1990GradeMode`.

`migrateLegacyForm` 확장:
```typescript
// 1990 환산도 마이그레이션
if (legacy.pre1990Enabled) {
  primaryAsset.pre1990Enabled = true;
  primaryAsset.pre1990PricePerSqm_1990 = legacy.pre1990PricePerSqm_1990;
  // ... 7필드 모두
}
```

API 변환 (`transfer-tax-api.ts` 라인 408-437) `pre1990Land` 객체 빌드 시 `form.pre1990*` → `primary.pre1990*`로 변경.

### Q3 추가 영향: 다건 모드 currentStep 마이그레이션

`lib/stores/calc-wizard-store.ts` `merge` 함수에서 `currentStep` 보정:
```typescript
// 구 5단계 → 신 4단계 매핑
// 0=자산 → 0
// 1=취득정보(폐지) → 0 (자산으로 흡수)
// 2=보유상황 → 1
// 3=감면공제 → 2
// 4=가산세 → 3
// 5=결과 → 4 (결과)
const STEP_MIGRATION: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
```

다건 모드 `multi-transfer-tax-validate.ts` `for (step <= 3)` → `for (step <= 2)` (Step2 폐지로 자산·보유상황·감면 3단계 검증).

---

## 8. 변경하지 않을 것 (Out of Scope)

- 엔진 (`lib/tax-engine/transfer-tax.ts`): 입력 타입·계산 로직 모두 보존. acquisitionMethod 분기 그대로 사용
- 1,507건 vitest 테스트 fixture: 엔진 입력을 직접 만드는 테스트는 변경 0건 (R1의 도출 로직이 변환 단계에 한정되므로)
- 결과 화면(`results/TransferTaxResultView.tsx`): 표시 로직 변경 없음
- 다른 세목(취득세·재산세·종부세·상속·증여세) 마법사
- 디자인 토큰·shadcn 컴포넌트
