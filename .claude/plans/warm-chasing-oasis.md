# 양도소득세 마법사 — 자산 통합 카드 UI 리팩터링

## Context

현재 양도소득세 마법사 Step1은 "주된 자산"과 "동반 자산"을 비대칭적으로 입력받는다:

- **주된 자산**: Step1의 물건유형 선택 → Step2~6의 평면 필드로 산재 입력
- **동반 자산**: Step1의 일괄양도 토글 ON → 풀 카드 UI로 즉시 표시

결과적으로 사용자는 Step1에서 "주된 자산 입력 카드"가 없는 상태에서 동반 자산 카드만 보게 되어, "이 카드가 주된 자산 입력란인가?"라는 혼란을 겪는다(사용자 피드백 2026-04-22).

사용자 결정에 따라 **"주된/동반" 구분을 제거하고 모든 양도 자산을 동일한 카드 UI로 N건 입력받는 통합 흐름**으로 재설계한다. 엔진(`bundled-sale-apportionment.ts`, `calculateTransferTaxAggregate`)은 이미 자산 배열을 동등 처리하므로 주로 UI/Store/Schema/Route 어댑터 계층을 수정한다.

**점진적 접근**: 이번 작업(Phase 1)은 기본 필드 통일에 집중하고, pre1990 토지·NBL 정밀판정·5종 감면 전체·다필지(parcels) 등 주 자산 전용 고급 기능은 후속 Phase로 분리한다.

## 목표 (이번 Phase 1)

1. `TransferFormData`의 주 자산 평면 필드 중 **자산 단위 데이터**를 `assets: AssetForm[]` 배열로 이동
2. Step1에서 "일괄양도 토글" 제거, 항상 자산 카드 리스트 형태로 N건 입력
3. 1건만 입력 시에도 단일 카드 UI 사용(카드 제거 버튼은 2건 이상일 때만 노출)
4. 자산 카드에서 취득 경로(매매/상속/증여) 분기와 자경농지 감면만 Phase 1 범위
5. 엔진은 기존 그대로 유지, Route 어댑터가 자산 배열을 기존 엔진 형식(primary + aggregate)으로 변환

## 비목표 (Phase 2+로 분리)

- pre1990 토지 환산, NBL 정밀판정 6필드, 다필지(`parcels[]`), 건물 신축/증축(§114조의2)을 자산 카드로 확장
- 5종 감면(자경·장기임대·신축·미분양·공익수용) 전체를 모든 자산 카드에서 입력
- 세대 Step(Step4/5)의 자산 카드별 비과세 대상 지정 UI 고도화

## 아키텍처 전환 요약

### 현재
```
TransferFormData {
  propertyType, transferPrice, transferDate, ...  // 주 자산 (평면, 40+ 필드)
  companionAssets: CompanionAssetForm[]            // 동반 자산 (0~N건)
  bundledSaleMode, primaryActualSalePrice          // 일괄양도 제어 필드
  isOneHousehold, houses[], reductions, ...        // 세대/납세자 단위
}
```

### 전환 후
```
TransferFormData {
  assets: AssetForm[]                              // 모든 양도 자산 (1~N건, 최소 1건)
  bundledSaleMode, contractTotalPrice              // 계약서 단위 필드
  transferDate, filingDate                         // 계약서 공통 날짜
  isOneHousehold, houses[], reductions, ...        // 세대/납세자 단위 (기존 그대로)
}

AssetForm {                                        // CompanionAssetForm 기반 확장
  assetId, assetLabel, assetKind,
  actualSalePrice, standardPriceAtTransfer,
  acquisitionCause, acquisitionDate, ...,
  directExpenses, reductionType, farmingYears,
  // 신규: isPrimaryForExemption 등 세대 플래그 연결점
}
```

## 단계별 구현 계획 (Phase 1)

### Step 1. 타입·Store 통합 — `lib/stores/calc-wizard-store.ts`
- `CompanionAssetForm`을 `AssetForm`으로 이름 변경, Phase 1 범위에 맞는 필드 유지
  - 유지: `assetId`, `assetLabel`, `assetKind`, `actualSalePrice`, `standardPriceAtTransfer`, `directExpenses`, `reductionType`, `farmingYears`, `acquisitionCause`, 취득일/피상속인일/증여자일, 상속 보충적평가 5필드, `fixedAcquisitionPrice`, `useEstimatedAcquisition`, `standardPriceAtAcq`
  - 추가: `isPrimaryForHouseholdFlags: boolean` — 세대 Step(Step4/5)에서 1세대1주택 비과세·다주택 중과·NBL 정밀 등을 적용할 "대표 자산" 지정용
- `TransferFormData`에서 제거: `propertyType`, `transferPrice`, `acquisitionCause`, `acquisitionPrice`, `acquisitionDate`, `decedentAcquisitionDate`, `donorAcquisitionDate`, `expenses`, `useEstimatedAcquisition`, `standardPriceAtAcquisition`, `standardPriceAtTransfer`, `inheritanceValuationMode`, `inheritanceLandPricePerM2`, `inheritanceHousePrice`, `primaryActualSalePrice`, `companionAssets` → 모두 `assets[].*`로 이동
- `TransferFormData`에서 유지: `transferDate`, `filingDate`, `bundledSaleMode`, `contractTotalPrice`(기존 `transferPrice` 의미 승계), 세대/납세자 단위 필드 전부, 가산세·감면 관련 루트 필드
- `makeDefaultAsset(index: number = 1): AssetForm` 팩토리 추가 (`makeDefaultCompanionAsset` 기반)
- `INITIAL_TRANSFER_FORM` 재정의: `assets: [makeDefaultAsset(1)]`
- `partialize`/`migrate` 업데이트: sessionStorage 기존 포맷 호환 (`companionAssets + 주자산 평면필드` → `assets`로 변환하는 마이그레이션 헬퍼 추가)

### Step 2. 공용 자산 카드로 컴포넌트 재배치 — `components/calc/transfer/`
- `CompanionAssetCard.tsx` → `AssetCard.tsx`로 이름 변경(또는 공용 래퍼 신설)
- `CompanionAssetsSection.tsx` → `AssetListSection.tsx`로 이름 변경, `assets: AssetForm[]` 받음
  - 1건만 있을 때 "삭제" 버튼 비노출, "+ 자산 추가" 버튼만 표시
  - 각 카드 헤더: `자산 {idx+1} — {assetKind label}` (현재 "동반자산 {idx}" → "자산 {idx}")
- `CompanionAcqPurchaseBlock.tsx`, `CompanionAcqInheritanceBlock.tsx`, `CompanionAcqGiftBlock.tsx` → `AcqPurchaseBlock.tsx`, `AcqInheritanceBlock.tsx`, `AcqGiftBlock.tsx`로 이름 변경
- `CompanionSaleModeBlock.tsx` 유지, `BundledSaleModeToggle`는 계약서 단위이므로 자산 카드 외부(Step1 상단)에 계속 배치
- 타입 import 경로 전부 업데이트

### Step 3. Step1 재설계 — `app/calc/transfer-tax/steps/Step1.tsx`
- 물건 유형 선택(5종 버튼 그리드) 제거 → 자산 카드 내부 `assetKind` 선택이 그 역할 대체
- `right_to_move_in` 조합원 유형 선택은 자산 카드 내부로 이동(해당 `assetKind`일 때만 표시)
- Step1 레이아웃:
  1. 상단: `BundledSaleModeToggle`(계약서 구분 기재 vs 기준시가 안분)
  2. 중간: `contractTotalPrice` 입력("총 양도가액 (모든 자산 합계)")
  3. 하단: `AssetListSection`(자산 카드 리스트 + "+ 자산 추가" 버튼)
- 일괄양도 토글(`companionAssets.length === 0` 기반) 제거
- `primaryActualSalePrice`/`standardPriceAtTransferForApportion` 개념은 "대표로 삼을 자산 카드" 없이 `assets`의 첫 카드를 관례적 primary로 취급(또는 `isPrimaryForHouseholdFlags` 플래그 기반)

### Step 4. Step2/3 조정 — `app/calc/transfer-tax/steps/Step2.tsx`, `Step3.tsx`
- Step2: 양도일·신고일·주소·다필지(parcels)만 남김. 주 자산 양도가액은 자산 카드로 이동했으므로 제거
  - 주소·다필지는 Phase 1에선 "대표 자산" 기준으로 계속 루트 입력 허용(후속 Phase에서 자산 카드로 이전)
- Step3: 취득 정보는 전부 자산 카드 내부로 이동 → Step3 자체를 "취득 공통 보조 정보"(pre1990, 건물 신축/증축 §114조의2, appraisal 등 Phase 2 대상 필드)만 남기거나, Phase 1에선 Step3를 일시적으로 스킵(건너뛰기)으로 처리
  - 구현 경량화: Step3에 "이 단계는 자산별 카드에서 입력되었습니다" 안내 + pre1990/신축/감정평가만 조건부 노출(대표 자산 기준)

### Step 5. 마법사 네비게이션 — `app/calc/transfer-tax/TransferTaxCalculator.tsx` + `lib/calc/transfer-tax-validate.ts`
- `validateStep(step, form)` 재작성:
  - Step1: `assets.length >= 1`, 각 자산의 `assetKind`, `actualSalePrice`/`standardPriceAtTransfer`, 취득일·취득가 필수
  - Step2: 양도일, 주소
  - Step3: Phase 2 필드만 검증(Phase 1에선 대부분 생략)
  - Step4~6: 기존 로직 유지(단, `isOneHousehold` 등은 `assets` 중 "대표 주택"이 있을 때만 의미)

### Step 6. API 어댑터 재작성 — `lib/calc/transfer-tax-api.ts`, `app/api/calc/transfer/route.ts`
- `callTransferTaxAPI(form)` 재작성:
  - 기존: `form.companionAssets.length === 0`이면 `/api/calc/transfer`(single), 있으면 `/api/calc/transfer/bundled`
  - 신규: `form.assets.length === 1`이면 single, `>=2`이면 bundled로 라우팅
  - 단건 경로: `form.assets[0]`을 기존 평면 필드로 변환해 `propertyBaseShape` 요청 만듦
  - 다건 경로: `form.assets[0]`을 primary로, 나머지를 `companionAssets`로 변환(혹은 스키마를 완전히 `assets` 배열로 재설계)
- Phase 1 **최소 변경 원칙**: `lib/api/transfer-tax-schema.ts`의 Zod 스키마는 유지, 클라이언트에서 기존 포맷으로 변환만. 스키마 통합은 Phase 2에서
- `app/api/calc/transfer/route.ts`는 변경 없음(클라이언트 어댑터가 기존 포맷 생성)

### Step 7. 테스트 업데이트 — `__tests__/`
- `__tests__/api/transfer.route.bundled.test.ts`: 기존 포맷 그대로 동작하므로 변경 없음(서버 로직 미변경)
- 신규 단위 테스트: `lib/calc/transfer-tax-api.ts`의 `form → request` 변환 헬퍼
  - `form.assets.length === 1` → single 요청 형식
  - `form.assets.length === 2` → bundled 요청 형식(첫 자산을 primary로 변환)
  - sessionStorage 마이그레이션 헬퍼: 기존 포맷 → 신규 `assets` 배열

## 수정 대상 파일

### 핵심 변경
- `lib/stores/calc-wizard-store.ts` (464줄) — 타입·팩토리·마이그레이션
- `components/calc/transfer/CompanionAssetCard.tsx` (247줄) — 이름 변경 + 사소한 라벨 조정
- `components/calc/transfer/CompanionAssetsSection.tsx` (52줄) — 삭제 버튼 노출 조건
- `components/calc/transfer/CompanionSaleModeBlock.tsx` (109줄) — 토글 라벨만
- `components/calc/transfer/CompanionAcq{Purchase,Inheritance,Gift}Block.tsx` — 이름 변경
- `app/calc/transfer-tax/steps/Step1.tsx` (168줄) — 전면 재설계
- `app/calc/transfer-tax/steps/Step2.tsx` (133줄) — 양도가액 필드 제거
- `app/calc/transfer-tax/steps/Step3.tsx` (662줄) — Phase 2 대상 필드만 남기고 대부분 자산 카드 안내로 전환
- `app/calc/transfer-tax/TransferTaxCalculator.tsx` — `form` → `assets` 기반 네비게이션 조정
- `lib/calc/transfer-tax-validate.ts` — 스텝별 검증 재작성
- `lib/calc/transfer-tax-api.ts` (413줄) — form → API 요청 변환 재작성

### 부수 영향(이름 변경 import 추적)
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` — companion 기반 props 참조
- `__tests__/tax-engine/bundled-sale-apportionment.test.ts` — 엔진 테스트는 불변

### 변경 없음
- `lib/tax-engine/transfer-tax.ts`, `transfer-tax-aggregate.ts`, `bundled-sale-apportionment.ts` — 엔진 유지
- `app/api/calc/transfer/route.ts` — 서버는 기존 스키마 유지
- `lib/api/transfer-tax-schema.ts` — Phase 2에서 통합

## 재사용할 기존 유틸

- `lib/tax-engine/bundled-sale-apportionment.ts` `apportionBundledSale()` — 주/동반 구분 없이 `assets[]`만 받음, 그대로 사용
- `lib/tax-engine/transfer-tax-aggregate.ts` `calculateTransferTaxAggregate()` — 이미 자산 리스트 동등 처리
- `components/calc/inputs/CurrencyInput.tsx` — 금액 입력 공용
- `components/ui/date-input.tsx` `DateInput` — 날짜 입력 공용(type="date" 금지 규칙)
- `lib/stores/calc-wizard-store.ts` `makeDefaultCompanionAsset()` — 기본값 팩토리, `makeDefaultAsset`으로 리팩터
- `components/calc/shared/ResetButton.tsx` — Step1 리셋 버튼 유지

## 검증 방법 (end-to-end)

### 1. 단위·통합 테스트
```bash
npm test                                              # 전체 vitest 1407 tests 유지
npx vitest run __tests__/tax-engine                   # 엔진 테스트 불변 확인
npx vitest run __tests__/api/transfer.route.bundled   # API 회귀
```

### 2. 타입 체크
```bash
npx tsc --noEmit                                      # 타입 에러 0
npm run lint                                          # lint 통과
```

### 3. 수동 UI 검증 (dev 서버)
```bash
npm run dev
```
브라우저에서 `/calc/transfer-tax` 진입 후:
- **1자산 시나리오**: 카드 1건만 입력 → 단건 엔진 결과와 기존 동작(주 자산 평면 입력)의 수치 일치 확인
- **N자산 시나리오**: 주택 + 토지 2건 카드 입력 → 일괄양도 안분 결과가 기존 동반자산 방식과 수치 일치
- **삭제 버튼 조건**: 1건일 때 삭제 버튼 없음, 2건 이상에서 삭제 가능
- **자산 추가**: "+ 자산 추가" 클릭 시 `makeDefaultAsset(n+1)` 기본값으로 카드 추가
- **마이그레이션**: sessionStorage에 구 포맷 저장 후 페이지 새로고침 → 신규 `assets` 배열로 정상 복원(데이터 손실 없음)

### 4. 회귀 검증 포인트
- Step4/5의 세대 단위 필드(1세대1주택, 다주택 중과, 일시적 2주택, 합가, 감면) 입력·계산 결과 불변
- pre1990 토지·NBL 정밀판정은 Phase 2 대상이므로 Phase 1에선 "대표 자산"(assets[0] 또는 `isPrimaryForHouseholdFlags === true`) 기준으로 기존 동작 유지
- 비로그인 → 로그인 전환 시 sessionStorage 마이그레이션 동작

## 위험 요소와 완화

| 위험 | 완화 |
|---|---|
| sessionStorage 구 포맷 데이터 손실 | 마이그레이션 헬퍼(`migrateLegacyForm`) 작성 + store `migrate` 훅 연결, 버전 번호 bump |
| Step3의 662줄 대부분 삭제 → Phase 2에서 복원 필요 | Phase 2 계획서에 "Step3 복원 범위"를 미리 명시, 현 Step3를 `Step3.legacy.tsx`로 보존한 채 신 Step3 생성 |
| Phase 1에서 "대표 자산" 판정이 `assets[0]` 관례에 의존 | `isPrimaryForHouseholdFlags` 플래그 도입으로 명시적 처리. 기본값은 `assets[0] === true` |
| API 스키마 미통합으로 인한 변환 복잡도 | 변환 헬퍼를 `lib/calc/transfer-tax-api.ts` 내부 단일 함수로 격리, 단위 테스트 필수 |
| 800줄 파일 정책 위반 위험(Step1/Step3 수정 시) | 자산 카드 분리는 이미 완료, Step1/Step3 오케스트레이터는 ≤200줄 유지 목표 |

## 후속 Phase 로드맵 (참고)

- **Phase 2**: Zod 스키마 통합(`propertyBaseShape` + `companionAssetSchema` → `assetSchema` 단일화), API 라우트 재작성, pre1990 토지·NBL 정밀판정 6필드를 자산 카드로 확장
- **Phase 3**: 5종 감면(장기임대·신축·미분양·공익수용) 전체를 자산 카드 단위 `reductions[]`로 확장, 다필지(`parcels[]`)·건물 신축/증축(§114조의2)을 자산 카드로 흡수
- **Phase 4**: 세대 Step의 자산 카드별 비과세 대상 지정·주택 카운트 자동 집계(자산 카드의 `assetKind === "housing"` 개수로 `householdHousingCount` 보조 계산)
