# components/calc/ — 세금 계산 UI

Layer 1의 프런트엔드 측. 마법사(StepWizard) 기반 폼 + 결과 화면.

## StepWizard 패턴

각 세금 계산기는 여러 단계로 나뉘며, 상태는 zustand store (`lib/stores/calc-wizard-store.ts`)에 보관.

### 네비게이션 규칙 (절대)

- 모든 단계에 **뒤로가기 + 다음 버튼 필수**.
- 1단계 뒤로가기 = 홈(`/`) 으로 이동.
- 결과 화면의 "다시 계산하기" 는 마지막 입력 단계(감면/가산세 등)로 복귀 (첫 화면 아님).

### Step 파일 분리 규칙 (2026-04 리팩터링 후)

Calculator가 800줄 초과 + Step이 3개 이상이면 각 Step을 별도 파일로 분리. 예시:

```
app/calc/transfer-tax/                  # 양도세: Step1↔Step3 통합 후 4단계 (2026-04-25)
├── TransferTaxCalculator.tsx           # 오케스트레이터 + 사이드바 레이아웃
└── steps/
    ├── Step1.tsx  # 자산 목록 + 양도일·신고일 + 취득 상세 모두 (자산 카드 내부에 환산·1990·감정가액·신축 통합)
    ├── Step4.tsx  # 보유 상황 (NBL·다주택·합가) — UI 인덱스 1
    ├── Step5.tsx  # 감면·공제 (자산별 체크박스) — UI 인덱스 2
    └── Step6.tsx  # 가산세 (단건 모드 전용) — UI 인덱스 3
# (Step3.tsx 폐지: 취득 정보가 자산 카드 안으로 통합됨)

components/calc/acquisition/
├── shared.ts       # 상수·FormState·INITIAL_FORM·validateStep·callAPI·CSS classes
├── Step0.tsx       # 취득 정보
└── Step1.tsx       # 물건 상세
# (Step 2/3은 main 파일에 inline — result/setForm 결합이 높음)
```

**파일명 vs UI 인덱스 주의 (양도세)**: 파일명은 historical naming(Step1·Step4·Step5·Step6)을 유지하지만 마법사 UI는 0~3 인덱스. `STEPS_SINGLE = ["자산 목록", "보유 상황", "감면·공제", "가산세"]`. `stepComponentsAll`이 매핑.

**Props 시그니처**: `{ form, onChange: (d: Partial<FormData>) => void }` + Step별 필요 콜백. 플래그(`isHousing` 등)는 상위에서 파생해 주입.

### 자산-수준 통합 원칙 (2026-04-25 Step1↔Step3 통합 이후)

양도세 마법사는 **취득 정보 13필드**를 폼-전역에서 **자산-수준(`AssetForm`)으로 마이그레이션**:

- `acquisitionMethod` 폼 필드 폐지 → 자산-수준 `useEstimatedAcquisition` (boolean) + `isAppraisalAcquisition` (boolean) 두 플래그로 표현
- `appraisalValue` 폐지 → 감정가액 모드에서는 `fixedAcquisitionPrice`에 그대로 입력 (실가 입력 루틴과 단일화)
- `isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea` 4필드 → `AssetForm`에 자산별 저장
- `pre1990*` 7필드 → `AssetForm`에 자산별 저장 (이미 자산-수준에 존재)

**API 변환 (`lib/calc/transfer-tax-api.ts`)**: 엔진 입력의 `acquisitionMethod` 키는 자산 플래그에서 도출:
```typescript
const isAppraisal = primary.isAppraisalAcquisition === true;
const isEstimated = !isAppraisal && primary.useEstimatedAcquisition;
acquisitionMethod: isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual"
```

**감정가액 + 개산공제 자동 적용**: 엔진 `calcTransferGain`(`transfer-tax-helpers.ts`)이 `acquisitionMethod === "appraisal"` 시 자동으로 `취득시 기준시가 × 3%` 개산공제 적용 (소득세법 시행령 §163⑥).

**1990 환산 표시 조건**: `assetKind === "land"` AND `acquisitionDate < "1990-08-30"` AND 환산취득가 모드. 토지 외 자산은 토지등급 환산 미적용 (법령상 토지 전용).

**sessionStorage 마이그레이션**: `lib/stores/calc-wizard-migration.ts`의 `migrateLegacyForm`이 legacy 폼-전역 13필드 → assets[0]로 자동 이전. `currentStep` 5→4 인덱스 매핑(`STEP_MIGRATION`).

## 공용 입력 컴포넌트 (절대 규칙)

| 용도 | 컴포넌트 | 이유 |
|---|---|---|
| 날짜 입력 | `@/components/ui/date-input.tsx` (`DateInput`) | `<input type="date">` 사용 금지. 연도 6자리 표시 버그 회피 + 연/월/일 분리 입력. |
| 금액 입력 | `@/components/calc/inputs/CurrencyInput.tsx` | 자동 콤마 포맷. `parseAmount()` 로 "1,500,000" → 1500000 정수 변환. `hideUnit` prop으로 카드 모드에서 단위 중복 방지. |
| 필드 카드 | `@/components/calc/inputs/FieldCard.tsx` | 라벨·hint·warning·trailing·unit 슬롯을 통일. 데스크톱 좌-라벨 / 모바일 위-라벨. |
| 섹션 헤더 | `@/components/calc/shared/SectionHeader.tsx` | 큰 그룹 시작점 (점·아이콘 + 굵은 텍스트 + 우측 액션 슬롯). |
| 진척 사이드바 | `@/components/calc/shared/WizardSidebar.tsx` | lg(1024px) 이상 좌측 sticky. 단계 + 합계 요약. 마법사용. |
| 신축·증축 입력 | `@/components/calc/transfer/SelfBuiltSection.tsx` | 자산-수준 4필드 (isSelfBuilt·buildingType·constructionDate·extensionFloorArea). `acquisitionCause === "purchase"` + housing/building 자산 전용. |
| 1990 환산 | `@/components/calc/inputs/Pre1990LandValuationInput.tsx` | 토지 자산 + acquisitionDate < 1990-08-30 시 자동 활성화. 자산-수준 props (`form` = `Pre1990FormSlice`). |
| 주소 검색 | `@/components/ui/address-search.tsx` | Vworld 주소 검색 API. 조정대상지역·공시가격 조회에 필수 (지번 주소). |
| 리셋 버튼 | `@/components/calc/shared/ResetButton.tsx` | 1단계에만 배치. 확인 다이얼로그 포함. |

**포커스 시 전체 선택**: `SelectOnFocusProvider` (`components/providers/SelectOnFocusProvider.tsx`) 가 layout에 전역 등록되어 모든 `<input>`/`<textarea>` 에 자동 적용. 개별 `onFocus={(e) => e.target.select()}` 추가 불필요.

## 결과 화면 구조

`components/calc/results/{TaxType}ResultView.tsx` — `result` prop 받아 섹션별 카드로 렌더.

공통 섹션:
- 요약 카드 (총 납부세액 + 주요 단계)
- CalculationStep 목록 (산식·근거조문 포함)
- 상세 카드 (서브엔진별: `MultiHouseSurchargeDetailCard`, `NonBusinessLandResultCard`, `AcquisitionSurchargeDetailCard`, `SeparateTaxationDetailCard`, `TaxCreditBreakdownCard` 등)
- `DisclaimerBanner` (모든 결과 화면 하단 고정)
- `LoginPromptBanner` (비로그인 시 이력 저장 유도)

## Zustand 마법사 Store (`lib/stores/calc-wizard-store.ts`)

- sessionStorage persist. 비로그인 계산 결과 보존 → 로그인 후 Server Action으로 이력 마이그레이션.
- **`result` 필드는 partialize에서 제외**: 민감정보 + Date 직렬화 문제.
- `pendingMigration` 플래그로 마이그레이션 1회성 보장.
- **legacy 폼 마이그레이션은 `lib/stores/calc-wizard-migration.ts`로 분리** (800줄 정책 준수). `migrateLegacyForm(legacy, defaultFormData)`로 호출.
- **`currentStep` 자동 마이그레이션**: 5단계→4단계 인덱스 매핑(`STEP_MIGRATION`)이 `merge` 함수에 내장.

### useTransferSummary — 사이드바 합계 selector

```typescript
// hook으로 직접 호출 금지 — useSyncExternalStore 무한 루프 발생.
// TransferTaxCalculator 에서 useMemo로 래핑해 사용:
const transferSummary = useMemo(
  () => computeTransferSummary(formData, result),
  [formData.assets, formData.contractTotalPrice, result]
);
```

`computeTransferSummary(formData, result)`은 순수 함수 (`lib/stores/calc-wizard-store.ts`). 양도가액·취득가액·필요경비·양도소득금액·납부세액 5필드 반환.

## UI 수정 시 체크리스트

- [ ] `DateInput` 사용 (type="date" 아님)
- [ ] 금액 input은 `CurrencyInput` + `parseAmount`
- [ ] `FieldCard` 외부에서 `CurrencyInput` 사용 시 `hideUnit` prop으로 단위 중복 방지
- [ ] `onFocus` 수동 추가 금지 (Provider가 처리)
- [ ] StepWizard 네비게이션 버튼 빠짐 없음
- [ ] 양도세 자산-수준 필드 추가 시 `AssetForm` (폼-전역 `TransferFormData` 아님)
- [ ] API 호출은 `lib/calc/{tax-type}-api.ts` 의 `call*API()` 를 거침 (직접 fetch 금지)
- [ ] `validateStep()` 로직 업데이트 (단계별 필수 필드). 양도세는 4단계: 0=자산 / 1=보유 / 2=감면 / 3=가산세
- [ ] zustand store selector는 매 렌더 새 객체 반환 금지 — `useMemo` 또는 atomic selector 사용 (무한 루프 방지)
- [ ] 800줄 정책 준수 — Phase별 sub-component 추출 (예: `SelfBuiltSection`)
- [ ] **UI 순서 = 엔진 계산 로직 순서**: 입력 필드 배치 전 엔진 함수의 변수 사용 순서 확인. 모드 토글은 영향 받는 필드 직전. 같은 그룹 내에서도 알고리즘 의존 순서 (예: PHD 토지면적이 모든 후속 곱셈 인자이므로 최상단)
- [ ] **placeholder 정확성**: "자동 안분"은 엔진이 실제로 안분할 때만. 자본적지출처럼 귀속이 명확해야 하는 필드는 "없으면 비워두세요"
- [ ] **사이드바 합계**: 입력된 값으로 계산 가능한 항목만 표시 (0원·null 제외). 환산 모드의 취득가액처럼 API 결과 후에야 알 수 있는 값은 결과 도착 후 노출
- [ ] **결과 뷰 산식**: 변수 약어(`P_F`, `Sum_A`) 금지·한국어 풀어쓰기, 법정 용어 우선, 중간 산술 결과 미표시, `floor()` 묵시 처리
