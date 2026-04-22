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
app/calc/transfer-tax/
├── TransferTaxCalculator.tsx   # 오케스트레이터 (store 연결 + 네비게이션 + 결과 분기)
└── steps/
    ├── Step1.tsx  # 자산 목록 + 양도일·신고일 (Step2 기능 통합됨, 소재지·다필지는 자산 카드 내부)
    ├── Step3.tsx  # 취득 정보 상세 (환산취득가·1990 토지·감정가·신축·증축) — 신 Step2 위치
    ├── Step4.tsx  # 보유 상황 (NBL·다주택·합가 섹션 포함) — 신 Step3 위치
    ├── Step5.tsx  # 감면·공제 (자산별 체크박스 복수 선택) — 신 Step4 위치
    └── Step6.tsx  # 가산세 (단건 모드 전용)

components/calc/acquisition/
├── shared.ts       # 상수·FormState·INITIAL_FORM·validateStep·callAPI·CSS classes
├── Step0.tsx       # 취득 정보
└── Step1.tsx       # 물건 상세
# (Step 2/3은 main 파일에 inline — result/setForm 결합이 높음)
```

**Props 시그니처**: `{ form, onChange: (d: Partial<FormData>) => void }` + Step별 필요 콜백. 플래그(`isHousing` 등)는 상위에서 파생해 주입.

## 공용 입력 컴포넌트 (절대 규칙)

| 용도 | 컴포넌트 | 이유 |
|---|---|---|
| 날짜 입력 | `@/components/ui/date-input.tsx` (`DateInput`) | `<input type="date">` 사용 금지. 연도 6자리 표시 버그 회피 + 연/월/일 분리 입력. |
| 금액 입력 | `@/components/calc/inputs/CurrencyInput.tsx` | 자동 콤마 포맷. `parseAmount()` 로 "1,500,000" → 1500000 정수 변환. |
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

## UI 수정 시 체크리스트

- [ ] `DateInput` 사용 (type="date" 아님)
- [ ] 금액 input은 `CurrencyInput` + `parseAmount`
- [ ] `onFocus` 수동 추가 금지 (Provider가 처리)
- [ ] StepWizard 네비게이션 버튼 빠짐 없음
- [ ] 새 필드 추가 시 `calc-wizard-store.ts` 의 `TransferFormData` 등에도 반영
- [ ] API 호출은 `lib/calc/{tax-type}-api.ts` 의 `call*API()` 를 거침 (직접 fetch 금지)
- [ ] `validateStep()` 로직 업데이트 (단계별 필수 필드)
