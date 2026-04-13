# Korean Tax Calc — UI/컴포넌트 설계 (Design Document)

> PDCA Design Phase | 2026-04-14
> Plan Reference: `docs/01-plan/features/korean-tax-calc.plan.md`
> Engine Design Reference: `docs/02-design/features/korean-tax-calc-engine.design.md`
> Tech Stack: Next.js 15 (App Router, React 19) + shadcn/ui + Tailwind CSS v4 + react-hook-form + zod + zustand

---

## Context Anchor

| Dimension | Content |
|-----------|---------|
| **WHY** | 복잡한 세금 계산 입력을 단계별 마법사로 분해하여 40~60대 사용자도 쉽게 완료할 수 있도록 설계 |
| **WHO** | 부동산 매도 예정자(40-60대), 공인중개사·세무사(B2B), 부동산 투자자 |
| **RISK** | 입력 항목 과다 → 이탈률 증가, 모바일 UX 부족, 복잡한 결과 화면 가독성 |
| **SUCCESS** | 계산 완료율 80%+, 모바일 반응형 100%, 결과 화면에서 계산 과정 이해 가능 |
| **SCOPE** | StepWizard, 6개 세금별 폼, 결과 컴포넌트, 이력 페이지, 랜딩 페이지 |

---

## 1. 페이지 라우트 구조

```
app/
  layout.tsx                       # 공통 레이아웃 (Header, Footer)
  page.tsx                         # 랜딩 — 6가지 세금 선택 카드
  │
  calc/
  │  layout.tsx                    # 계산기 공통 레이아웃 (면책고지 Footer)
  │  transfer-tax/
  │  │  page.tsx                   # 양도소득세 StepWizard
  │  │  loading.tsx
  │  │  error.tsx
  │  inheritance-tax/page.tsx      # 상속세
  │  gift-tax/page.tsx             # 증여세
  │  acquisition-tax/page.tsx      # 취득세
  │  property-tax/page.tsx         # 재산세
  │  comprehensive-tax/page.tsx    # 종합부동산세
  │
  result/
  │  [id]/page.tsx                 # 계산 결과 상세 (이력 저장분)
  │
  history/
  │  page.tsx                      # 이력 목록 (보호 라우트)
  │
  auth/
  │  login/page.tsx
  │  signup/page.tsx
  │  callback/route.ts             # OAuth 콜백 (redirect 방식)
  │
  guide/
     page.tsx                      # 세금 가이드 목록 (SSG)
     [slug]/page.tsx               # 개별 가이드 (SSG)
```

---

## 2. 컴포넌트 계층 구조

```
components/
  layout/
    Header.tsx                     # 네비게이션 + 인증 상태
    Footer.tsx                     # 면책 고지 + 링크
    MobileNav.tsx                  # 모바일 햄버거 메뉴

  calc/
    StepWizard.tsx                 # 공통 다단계 입력 마법사 (핵심)
    StepIndicator.tsx              # 단계 진행 표시 바
    StepNavigation.tsx             # 이전/다음/계산하기 버튼

    forms/
      TransferTaxForm.tsx          # 양도소득세 (5 Steps)
      AcquisitionTaxForm.tsx       # 취득세 (4 Steps)
      InheritanceTaxForm.tsx       # 상속세 (6 Steps)
      GiftTaxForm.tsx              # 증여세 (4 Steps)
      PropertyTaxForm.tsx          # 재산세 (3 Steps)
      ComprehensiveTaxForm.tsx     # 종합부동산세 (4 Steps)

    inputs/
      CurrencyInput.tsx            # 금액 입력 (천 단위 콤마 자동)
      DateInput.tsx                # 날짜 입력 (date-fns 연동)
      PropertyListInput.tsx        # 복수 물건 동적 추가/삭제
      PriorGiftInput.tsx           # 사전증여 내역 동적 추가
      HeirCompositionInput.tsx     # 상속인 구성 입력
      PropertyValuationInput.tsx   # 재산 평가 (시가/보충적)
      RegulatedAreaSelect.tsx      # 조정대상지역 선택 (안내 툴팁)

    results/
      TaxResult.tsx                # 계산 결과 요약 카드
      ResultBreakdown.tsx          # 단계별 계산 과정 상세
      LinkedTaxResult.tsx          # 재산세↔종부세 연동 결과
      ResultActions.tsx            # 저장/PDF/다시계산 버튼

    shared/
      DisclaimerBanner.tsx         # 면책 고지 배너
      LoginPromptBanner.tsx        # 비로그인 "저장하려면 로그인" 안내
      InfoTooltip.tsx              # 세법 용어 설명 툴팁
      WarningAlert.tsx             # 중과세/추징 경고 알림

  landing/
    TaxTypeCard.tsx                # 세금 종류 선택 카드
    TaxTypeGrid.tsx                # 6개 카드 그리드

  history/
    CalculationList.tsx            # 이력 목록
    CalculationListItem.tsx        # 이력 항목
    HistoryFilter.tsx              # 세금 종류 필터

  ui/                              # shadcn/ui 컴포넌트 (자동 생성)
```

---

## 3. StepWizard — 핵심 공통 컴포넌트

### 3.1 설계 목적

6개 세금 계산기의 입력 흐름을 통일된 UX로 제공. 각 세금별 입력 필드는 다르지만, 단계 이동·유효성 검증·상태 관리는 동일 패턴.

### 3.2 Props 인터페이스

```typescript
interface StepWizardProps {
  taxType: TaxType;
  steps: StepConfig[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}

interface StepConfig {
  id: string;                      // 예: 'property-type'
  title: string;                   // 예: '물건 유형 선택'
  description?: string;            // 단계 설명
  component: React.ComponentType<StepComponentProps>;
  validationSchema: z.ZodSchema;   // 해당 단계 Zod 스키마
  isConditional?: (data: Record<string, unknown>) => boolean;
    // 조건부 단계 (예: 토지일 때만 비사업용토지 필드 표시)
}

interface StepComponentProps {
  form: UseFormReturn;             // react-hook-form
  data: Record<string, unknown>;   // 전체 폼 데이터 (이전 단계 포함)
}
```

### 3.3 상태 관리 — zustand + sessionStorage

```typescript
// lib/stores/calc-wizard-store.ts
interface CalcWizardState {
  taxType: TaxType | null;
  currentStep: number;
  formData: Record<string, unknown>;
  result: TaxResult | null;        // 계산 결과 (비로그인 임시 보관)

  // Actions
  setStep: (step: number) => void;
  updateFormData: (stepData: Record<string, unknown>) => void;
  setResult: (result: TaxResult) => void;
  reset: () => void;
}

const useCalcWizardStore = create<CalcWizardState>()(
  persist(
    (set) => ({
      taxType: null,
      currentStep: 0,
      formData: {},
      result: null,
      setStep: (step) => set({ currentStep: step }),
      updateFormData: (stepData) =>
        set((state) => ({
          formData: { ...state.formData, ...stepData },
        })),
      setResult: (result) => set({ result }),
      reset: () => set({ taxType: null, currentStep: 0, formData: {}, result: null }),
    }),
    {
      name: 'calc-wizard',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
```

### 3.4 단계 이동 흐름

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Step 1     │────▶│   Step 2     │────▶│   Step N     │
│  물건 유형    │◀────│  양도 정보    │◀────│  감면 확인    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │ "계산하기"
                                                  ▼
                                          ┌──────────────┐
                                          │  API 호출     │
                                          │  POST /api/   │
                                          │  calc/{type}  │
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  결과 화면    │
                                          │  TaxResult    │
                                          └──────────────┘

각 단계 "다음" 클릭 시:
1. react-hook-form trigger() → 현재 단계 Zod 검증
2. 검증 통과 → zustand store에 formData 업데이트
3. sessionStorage 자동 동기화 (새로고침 시 복원)
4. currentStep + 1
```

### 3.5 UX 원칙

| 원칙 | 구현 |
|------|------|
| **진행 상태 시각화** | StepIndicator — 현재 단계/전체 단계 + 완료 단계 체크 표시 |
| **입력 유실 방지** | sessionStorage persist — 브라우저 새로고침/뒤로가기 시 데이터 보존 |
| **조건부 필드** | 물건 유형에 따라 불필요한 필드 숨김 (예: 토지 선택 시 거주기간 미표시) |
| **실시간 안내** | InfoTooltip — 세법 용어 옆 ? 아이콘, 호버/터치 시 설명 표시 |
| **경고 선행 표시** | WarningAlert — 미등기·중과세 선택 시 즉시 경고 메시지 표시 |
| **모바일 우선** | 폼 요소 최소 44px 터치 영역, 1열 레이아웃 |

---

## 4. 세금별 폼 스텝 설계

### 4.1 양도소득세 — TransferTaxForm (5 Steps)

| Step | 제목 | 입력 필드 | 조건부 |
|------|------|----------|--------|
| 1 | 물건 유형 | 주택/토지/건물 라디오 | - |
| 2 | 양도 정보 | 양도가액(CurrencyInput), 양도일(DateInput) | - |
| 3 | 취득 정보 | 취득가액, 취득일, 필요경비, [환산취득가 토글 → 기준시가 2개] | 환산취득가 선택 시 기준시가 필드 표시 |
| 4 | 보유 상황 | 주택 수, 거주기간, 조정대상지역, 미등기, 비사업용토지 | 주택→거주기간 표시, 토지→비사업용토지 표시 |
| 5 | 감면 확인 | 감면 유형 선택 (해당 시 세부 조건) | 감면 유형별 추가 필드 |

**특수 UX:**
- Step 4 "미등기" 체크 시 WarningAlert: "미등기 양도 시 70% 단일세율 적용, 공제 배제"
- 기본공제 안내: 이력 조회 → "이번 연도 잔여 한도: OOO만원" 또는 "연간 250만원 한도" 안내

### 4.2 취득세 — AcquisitionTaxForm (4 Steps)

| Step | 제목 | 입력 필드 | 조건부 |
|------|------|----------|--------|
| 1 | 취득 정보 | 취득자유형(개인/법인), 물건종류, 취득원인, 취득가액, 취득일 | 상속+농지→농지체크 |
| 2 | 물건 상세 | 전용면적(㎡), 사치성재산 여부 | - |
| 3 | 주택 현황 | 보유 주택 수, 조정대상지역 여부 | 주택 선택 시만 표시 |
| 4 | 감면 확인 | 생애최초 여부, 수도권/비수도권 | 주택+개인 시만 표시 |

**특수 UX:**
- 법인 선택 시 Step 3에서 "법인 주택 취득: 12% 중과" 자동 안내
- 생애최초 체크 시 추징 주의사항 안내

### 4.3 상속세 — InheritanceTaxForm (6 Steps)

| Step | 제목 | 입력 필드 | 조건부 |
|------|------|----------|--------|
| 1 | 기본 정보 | 상속개시일, 기한 내 신고 체크 | - |
| 2 | 상속재산 | PropertyValuationInput (유형별 추가), 금융자산 순액 | - |
| 3 | 채무·장례 | 공과금, 사적채무, 장례비용, 봉안시설 체크 | - |
| 4 | 상속인 구성 | HeirCompositionInput (배우자, 자녀 수, 관계, 나이), 배우자 실제 상속분 | - |
| 5 | 사전증여 | PriorGiftInput (동적 추가), 세대생략 체크, 해외재산 체크 | - |
| 6 | 공제 확인 | 동거주택 요건(5개 체크), 영농·가업 해당 여부 | 해당 시 세부 입력 |

**특수 UX:**
- Step 4에서 법정상속분 실시간 미리보기 (비율·금액)
- Step 6 공제 합계가 과세가액 초과 시 "과세표준 0원" 안내 + "그래도 공제 내역 확인" 링크
- "대습상속·상속포기 → 세무사 상담 권장" 안내 배너

### 4.4 증여세 — GiftTaxForm (4 Steps)

| Step | 제목 | 입력 필드 | 조건부 |
|------|------|----------|--------|
| 1 | 기본 정보 | 증여일, 증여자-수증자 관계, 성년/미성년, 기한 내 신고 | - |
| 2 | 증여재산 | 증여재산가액(PropertyValuationInput), 채무인수액 | - |
| 3 | 사전증여 | PriorGiftInput (10년 내 동일인), 비과세 체크리스트 | - |
| 4 | 추가 확인 | 세대생략 여부 | - |

**특수 UX:**
- Step 3에서 잔여 공제 실시간 표시: "공제 한도 5,000만원 중 잔여: OOO만원"
- 미성년자 수증 시 "증여자 연대납세의무" WarningAlert

### 4.5 재산세 — PropertyTaxForm (3 Steps)

| Step | 제목 | 입력 필드 | 조건부 |
|------|------|----------|--------|
| 1 | 물건 정보 | 물건종류(주택/토지/건축물), 공시가격 또는 시가표준액 | - |
| 2 | 세부 정보 | 1세대1주택 체크, 토지 과세유형, 건축물 용도, 도시지역 여부 | 물건종류별 표시 분기 |
| 3 | 전년도 세액 | 전년도 재산세 (선택), 이전 이력 자동 채움 제안 | - |

### 4.6 종합부동산세 — ComprehensiveTaxForm (4 Steps)

| Step | 제목 | 입력 필드 | 조건부 |
|------|------|----------|--------|
| 1 | 주택 목록 | PropertyListInput (추가/삭제), 합산 공시가격 실시간 | - |
| 2 | 소유자 정보 | 1세대1주택 여부, 나이, 보유기간 | 1주택 시 공제 필드 표시 |
| 3 | 토지 정보 | 종합합산 토지 공시지가, 별도합산 토지 공시지가 | 토지 보유 시만 |
| 4 | 상한 정보 | 전년도 종부세 결정세액(선택), 전년도 재산세 합계(선택), 조정대상지역 2주택+ 여부 | - |

**특수 UX:**
- Step 1 합산 공시가격 실시간 표시 → 기본공제(9억/12억) 초과 여부 즉시 확인
- 결과에서 LinkedTaxResult로 재산세↔종부세 연동 시각화

---

## 5. 결과 화면 컴포넌트

### 5.1 TaxResult — 결과 요약

```
┌─────────────────────────────────────────┐
│  양도소득세 계산 결과                      │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  총 납부세액                        │  │
│  │  ₩ 12,345,000                     │  │
│  │  (양도소득세 ₩11,222,000 +         │  │
│  │   지방소득세 ₩1,123,000)           │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [상세 과정 보기 ▼]                      │
│  [이력 저장]  [PDF 다운로드]  [다시 계산]  │
│                                         │
│  ⚠️ 면책 고지: 본 계산 결과는 참고용이며...│
└─────────────────────────────────────────┘
```

### 5.2 ResultBreakdown — 계산 과정 상세

```
┌─────────────────────────────────────────┐
│  계산 과정 상세                           │
│                                         │
│  ① 양도차익 계산                         │
│    양도가액        ₩ 500,000,000         │
│  - 취득가액        ₩ 300,000,000         │
│  - 필요경비        ₩   5,000,000         │
│  ─────────────────────────────────      │
│  = 양도차익        ₩ 195,000,000         │
│                                         │
│  ② 장기보유특별공제 (보유 5년, 일반 10%)   │
│  - 공제액          ₩  19,500,000         │
│                                         │
│  ③ 기본공제                              │
│  - 연간 한도       ₩   2,500,000         │
│                                         │
│  ④ 과세표준                              │
│    ₩ 173,000,000 (천원 미만 절사)         │
│                                         │
│  ⑤ 세율 적용 (38%, 누진공제 1,994만원)    │
│    산출세액        ₩  45,800,000         │
│  ...                                    │
└─────────────────────────────────────────┘
```

각 `CalculationStep`을 순서대로 렌더링. 포맷:
- 라벨 (단계명)
- 계산식 (formula)
- 금액 (CurrencyFormat)
- 구분선

### 5.3 LinkedTaxResult — 종부세↔재산세 연동 결과

```
┌─────────────────────────────────────────┐
│  종합부동산세 + 재산세 연동 결과           │
│                                         │
│  ┌─────────────┐   ┌─────────────┐     │
│  │ 종합부동산세   │   │ 재산세       │     │
│  │ ₩ 270,000   │   │ ₩ 2,970,000 │     │
│  └──────┬──────┘   └──────┬──────┘     │
│         │                  │            │
│         └──── 비율 안분 ────┘            │
│               공제 20%                   │
│         ₩594,000 공제 적용               │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 총 납부세액 합계                     │  │
│  │ 종부세 ₩270,000                    │  │
│  │ 재산세 ₩2,970,000                  │  │
│  │ 농특세 ₩54,000                     │  │
│  │ ─────────────────────             │  │
│  │ 합계  ₩3,294,000                   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 6. 공유 입력 컴포넌트

### 6.1 CurrencyInput

```typescript
interface CurrencyInputProps {
  name: string;
  label: string;
  placeholder?: string;            // 예: '양도가액을 입력하세요'
  unit?: '원' | '만원';            // 표시 단위 (내부는 항상 원)
  min?: number;
  max?: number;
  helperText?: string;             // 하단 안내 텍스트
  required?: boolean;
}
```

**동작:**
- 입력 중 천 단위 콤마 자동 삽입 (`Intl.NumberFormat`)
- 숫자 외 문자 입력 방지
- 포커스 해제 시 "₩" 접두사 + "원" 접미사 표시
- 모바일: `inputMode="numeric"` (숫자 키패드)

### 6.2 PropertyListInput

```typescript
interface PropertyListInputProps {
  name: string;
  maxItems?: number;               // 기본 50
  showTotalAssessedValue: boolean;  // 합산 공시가격 실시간 표시
}

// 각 항목
interface PropertyItem {
  id: string;                      // 유니크 키
  assessedValue: number;           // 공시가격
  areaSqm: number;                 // 면적
  isUrbanArea: boolean;            // 도시지역 여부
}
```

**동작:**
- "물건 추가" 버튼 → 새 행 추가 (공시가격, 면적, 도시지역)
- 행별 삭제 버튼 (최소 1개 유지)
- 하단 합산 공시가격 실시간 갱신 + 기본공제 비교 표시

### 6.3 PriorGiftInput

```typescript
interface PriorGiftInputProps {
  name: string;
  deductionLimit: number;          // 관계별 공제 한도
}

interface PriorGiftItem {
  giftDate: Date;
  amount: number;
  taxPaid: number;
  deductionUsed: number;
}
```

**동작:**
- "이전 증여 추가" 버튼 → 동적 행 추가
- 잔여 공제 실시간 계산: `한도 - sum(deductionUsed)`
- 10년 초과 증여 입력 시 경고: "10년 초과 증여는 합산 대상이 아닙니다"

### 6.4 HeirCompositionInput

```typescript
interface HeirCompositionInputProps {
  name: string;
  onShareCalculated?: (shares: LegalShare[]) => void;
}
```

**동작:**
- 배우자 유무 토글
- 자녀 동적 추가 (관계, 나이, 장애 여부)
- 입력 변경 시 법정상속분 비율·금액 실시간 미리보기 테이블 표시

---

## 7. 랜딩 페이지

### 7.1 TaxTypeGrid 레이아웃

```
┌─────────────────────────────────────────────────┐
│  부동산 세금 계산기                                │
│  복잡한 세금, 1분 안에 정확하게                    │
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ 양도소득세   │  │ 취득세      │  │ 상속세      │ │
│  │ 매도 시 세금 │  │ 매수 시 세금 │  │ 상속 재산   │ │
│  │  [계산하기]  │  │  [계산하기]  │  │  [계산하기]  │ │
│  └────────────┘  └────────────┘  └────────────┘ │
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ 증여세      │  │ 재산세      │  │ 종합부동산세 │ │
│  │ 증여 재산   │  │ 보유 세금   │  │ 고액 보유세  │ │
│  │  [계산하기]  │  │  [계산하기]  │  │  [계산하기]  │ │
│  └────────────┘  └────────────┘  └────────────┘ │
└─────────────────────────────────────────────────┘

모바일: 1열, 데스크톱: 3열 (md:grid-cols-3)
```

### 7.2 TaxTypeCard

```typescript
interface TaxTypeCardProps {
  taxType: TaxType;
  title: string;                   // '양도소득세'
  subtitle: string;                // '부동산 매도 시 양도차익에 부과'
  icon: React.ReactNode;           // 세금 유형별 아이콘
  href: string;                    // '/calc/transfer-tax'
  color: string;                   // 카드 강조색 (세금별 구분)
}
```

---

## 8. 이력 페이지

### 8.1 CalculationList

```
┌─────────────────────────────────────────────────┐
│  계산 이력                                        │
│                                                  │
│  [전체] [양도소득세] [취득세] [상속세] ...  ← 필터  │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │ 2026-04-14  양도소득세                      │   │
│  │ 총 납부세액: ₩12,345,000                   │   │
│  │ 양도가액 5억 / 취득가액 3억                   │   │
│  │ [상세] [PDF] [삭제]                         │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │ 2026-04-13  종합부동산세                     │   │
│  │ 총 납부세액: ₩3,294,000 (재산세 연동)        │   │
│  │ 공시가격 합산 15억 / 1세대1주택               │   │
│  │ [상세] [PDF] [삭제]                         │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

- 보호 라우트: 로그인 필수
- 날짜 내림차순 정렬
- 세금 종류별 필터 (탭 또는 드롭다운)
- 종부세 이력은 "재산세 연동" 배지 표시

---

## 9. 반응형 설계

### 9.1 브레이크포인트 (Tailwind CSS v4)

| 브레이크포인트 | 크기 | 레이아웃 |
|-------------|------|---------|
| `sm` | 640px+ | 폼 패딩 확대 |
| `md` | 768px+ | 랜딩 2열, 결과 2열 |
| `lg` | 1024px+ | 랜딩 3열, 사이드바 표시 |

### 9.2 모바일 UX 원칙

| 원칙 | 구현 |
|------|------|
| **터치 영역** | 모든 인터랙티브 요소 최소 44×44px |
| **1열 폼** | 모바일에서 폼 필드 세로 배치 (가로 2열 X) |
| **숫자 키패드** | CurrencyInput에 `inputMode="numeric"` |
| **스크롤 위치** | 단계 전환 시 상단 자동 스크롤 |
| **에러 스크롤** | 유효성 오류 시 첫 에러 필드로 자동 스크롤 |
| **결과 요약 우선** | 모바일에서 상세 과정은 접힌 상태 (아코디언) |

---

## 10. 에러 처리 UI

### 10.1 계산 에러

```
┌─────────────────────────────────────────┐
│  ⚠️ 계산 중 오류가 발생했습니다            │
│                                         │
│  세율 데이터를 찾을 수 없습니다.            │
│  (코드: TAX_RATE_NOT_FOUND)              │
│                                         │
│  입력하신 데이터는 보존되어 있습니다.        │
│  [다시 시도]  [입력 수정]                  │
└─────────────────────────────────────────┘
```

- zustand 상태 보존 → 에러 후에도 입력 데이터 유실 없음
- 에러 코드별 사용자 친화적 메시지 매핑

### 10.2 네트워크 에러

- `error.tsx` (App Router Error Boundary) 활용
- "인터넷 연결을 확인해주세요" + 자동 재시도 버튼

### 10.3 Rate Limit 초과

- 429 응답 시: "요청이 많습니다. 잠시 후 다시 시도해주세요" + 남은 시간 표시

---

## 11. 면책 고지 (DisclaimerBanner)

모든 계산 결과 페이지 하단에 표시:

```
본 계산 결과는 2026년 기준 세법에 따른 참고용 자료이며,
법적 효력이 없습니다. 실제 세금 신고·납부 시에는
관할 세무서 또는 세무 전문가에게 상담하시기 바랍니다.
세법 개정, 개별 사정에 따라 실제 세액이 달라질 수 있습니다.
```

- 결과 화면: 결과 카드 하단 고정
- 이력 상세: 하단 표시
- PDF: 마지막 페이지 포함
