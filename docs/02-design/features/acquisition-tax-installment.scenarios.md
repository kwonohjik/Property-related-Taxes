# 연부취득 UI 설계 — 검증 규칙·시나리오·구현 우선순위·주의사항

**상위 문서**: [acquisition-tax-installment.ui.design.md](acquisition-tax-installment.ui.design.md)
**작성일**: 2026-05-01

---

## 1. 검증 규칙 (`validateStep`)

### Step0 검증 추가 (기존 isOnerous 블록에 통합)

`shared.ts`의 `validateStep()` 함수 수정:

```typescript
if (step === 0) {
  if (!form.propertyType) return "물건 유형을 선택하세요.";
  if (!form.acquisitionCause) return "취득 원인을 선택하세요.";
  if (!isDeemedAcquisitionCause(form.acquisitionCause)) {
    const isOnerous = ["purchase", "exchange", "auction", "in_kind_investment"]
      .includes(form.acquisitionCause);

    // 연부취득: 취득가액 대신 계약일 검증
    if (isOnerous && form.isInstallmentAcquisition) {
      if (!form.installmentContractDate) {
        return "연부취득 매매계약일을 입력하세요.";
      }
      // 취득가액(reportedPrice) 검증은 skip — 회차 합산이 과세표준
    } else if (isOnerous && !form.reportedPrice) {
      return "취득가액을 입력하세요.";
    }

    if (form.acquisitionCause === "burdened_gift" && !form.encumbrance) {
      return "부담부증여 채무액을 입력하세요.";
    }
  }
}
```

### Step1 검증 추가 (연부 ON 시)

```typescript
if (step === 1) {
  // ...기존 간주취득 검증...

  // 연부취득 회차 검증
  if (
    form.acquisitionCause === "purchase" &&
    form.isInstallmentAcquisition
  ) {
    const rows = form.installments ?? [];

    if (rows.length < 2) {
      return "연부취득은 최소 2회차 이상 입력해야 합니다.";
    }

    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].paymentDate) {
        return `${i + 1}번 회차 지급일을 입력하세요.`;
      }
      const amt = parseAmount(rows[i].amount) ?? 0;
      if (amt <= 0) {
        return `${i + 1}번 회차 지급액을 입력하세요.`;
      }
    }
    // 2년 이상 요건: 경고 배너(컴포넌트 내부)로 안내, validateStep 오류 미적용
  }
}
```

### 2년 미만 처리 방침

검증 오류로 Next 버튼을 막는 대신 `InstallmentPaymentsSection` 내부 amber 경고 배너로 안내한다.

이유:
- 날짜 경계(예: 계약일 2025-01-10, 잔금 2027-01-09)에서 24개월 판정이 불명확
- 사용자가 아직 전체 회차를 입력하지 않은 중간 상태일 수 있음
- 법령 요건 미충족 시 일반 매매 처리는 세무사 판단 영역 — UI가 강제 차단은 과도

---

## 2. 시나리오 테스트 케이스 (UI anchor)

### 시나리오 1 — 정상 3회차 (계약금·중도금·잔금)

```
입력:
  취득자: 개인
  취득 원인: 매매, 연부 ON
  물건: 주택, 취득 후 1주택
  매매계약일: 2025-01-10
  회차1: 계약금 / 2025-01-10 / 50,000,000원
  회차2: 중도금 / 2026-01-10 / 20,000,000원
  회차3: 잔금   / 2027-01-10 / 30,000,000원

기대 결과:
  과세표준: 100,000,000원 (합산)
  세율: 1% (6억 이하 주택)
  취득세 본세: 1,000,000원
  taxBaseMethod: "installment"
  신고기한(1): 2025-03-11 (2025-01-10 + 60일)
  신고기한(2): 2026-03-11
  신고기한(3): 2027-03-11
  2년 검증: 통과 (계약일~잔금일 24개월)
```

### 시나리오 2 — 고액 주택: 6억~9억 선형보간 구간

```
입력:
  취득 원인: 매매, 연부 ON
  물건: 주택, 취득 후 1주택
  회차1: 2025-01-10 / 300,000,000원
  회차2: 2026-06-10 / 200,000,000원
  회차3: 2027-06-10 / 250,000,000원

기대 결과:
  과세표준: 750,000,000원 (합산)
  세율: 선형보간 (750M은 6억~9억 구간)
    = (750,000,000 - 600,000,000) / 300,000,000 × 2 + 1 = 2%
  취득세 본세: 15,000,000원
  결과 화면: 선형보간 산식 표시
```

### 시나리오 3 — 검증: 2년 미만 경고

```
입력:
  취득 원인: 매매, 연부 ON
  매매계약일: 2025-01-10
  회차1: 2025-01-10 / 50,000,000원
  회차2: 2025-12-10 / 50,000,000원

기대 결과:
  InstallmentPaymentsSection 내 amber 경고 배너 표시:
    "첫 회차 ~ 마지막 회차 간격이 2년 미만입니다.
     연부취득 요건(§6 17호)을 확인하세요."
  validateStep(1) → null (오류가 아닌 경고)
  Next 버튼 활성 (계산 진행 허용)
```

### 시나리오 4 — 검증 실패: 1회차만 입력

```
입력:
  연부 ON, 회차 1개만 입력

기대 결과:
  validateStep(1) → "연부취득은 최소 2회차 이상 입력해야 합니다."
  Next 버튼 비활성
```

### 시나리오 5 — 검증 실패: 지급액 미입력

```
입력:
  연부 ON, 회차 2개
  회차1: 2025-01-10 / (금액 없음)
  회차2: 2026-01-10 / 50,000,000원

기대 결과:
  validateStep(1) → "1번 회차 지급액을 입력하세요."
```

### 시나리오 6 — 다주택 + 연부 (중과 + 안내 배너)

```
입력:
  취득자: 개인
  취득 원인: 매매, 연부 ON
  물건: 주택, 취득 후 2주택, 조정대상지역
  회차1: 2025-01-10 / 200,000,000원
  회차2: 2026-01-10 / 100,000,000원
  회차3: 2027-01-10 / 100,000,000원

기대 결과:
  과세표준: 400,000,000원 (합산)
  세율: 8% (조정대상지역 2주택 중과)
  취득세 본세: 32,000,000원
  결과 화면: "연부취득 + 다주택 주의사항" amber 배너 표시
```

### 시나리오 7 — 법인 + 연부

```
입력:
  취득자: 법인
  취득 원인: 매매, 연부 ON
  물건: 주택
  3회차 합계: 500,000,000원

기대 결과:
  세율: 12% (법인 주택 취득 중과)
  취득세 본세: 60,000,000원
  결과: 연부취득 요약 카드 + 신고기한 표
```

### 시나리오 8 — 비호환: 부담부증여 선택 시 연부 토글 미노출

```
입력:
  취득 원인: 부담부증여

기대 결과:
  Step0에 연부 ToggleCard 없음
  (acquisitionCause !== "purchase" 조건으로 렌더 안 함)
```

### 시나리오 9 — 토지 + 연부

```
입력:
  취득 원인: 매매, 연부 ON
  물건: 토지 (비농지)
  회차1: 2025-01-10 / 100,000,000원
  회차2: 2026-06-10 / 100,000,000원
  회차3: 2027-06-10 / 100,000,000원

기대 결과:
  Step2 (주택현황) skip
  과세표준: 300,000,000원
  세율: 4% (토지 기본세율)
  취득세 본세: 12,000,000원
```

### 시나리오 10 — 연부 OFF → 일반 매매 복귀

```
입력:
  취득 원인: 매매, 연부 ON → 연부 OFF

기대 결과:
  isInstallmentAcquisition: false
  installments 배열 유지 (reset 없음 — 재토글 시 데이터 복원)
  취득가액 CurrencyInput 재표시
  잔금 지급일 라벨 → "잔금 지급일" 복귀
```

---

## 3. 구현 우선순위

### Phase A (필수 — Definition of Done)

- [ ] ① FormState — 4개 필드 추가 (`isInstallmentAcquisition`, `installmentContractDate`, `installmentTotalContractPrice`, `installments[]`)
- [ ] ② INITIAL_FORM — 4개 필드 기본값 등록
- [ ] ③ normalize.ts — 4개 필드 fallback 추가
- [ ] ④ API 변환 — `buildAcquisitionTaxBody()` 연부 블록 추가 + `balancePaymentDate` 자동 설정
- [ ] ⑤-1 Step0 — 연부 ToggleCard (amber, `acquisitionCause === "purchase"` 조건) + TaxHelp + children 입력란
- [ ] ⑤-2 Step1 — `InstallmentPaymentsSection.tsx` 신규 파일 작성 + Step1 조건부 렌더
- [ ] ⑥ AcquisitionSidebar — `AcquisitionSummary` 인터페이스 확장 + `computeAcquisitionSummary()` 연부 분기 + 사이드바 항목
- [ ] ⑦ 결과 카드 — `InstallmentSummaryCard` (지역 함수 또는 분리 컴포넌트) + 회차별 신고기한 표 + D-day
- [ ] validateStep — Step0 연부 계약일 검증 + Step1 회차 최소 2개·지급일·금액 검증
- [ ] `npx tsc --noEmit` 오류 0건
- [ ] `npx vitest run __tests__/tax-engine/acquisition-tax/` 회귀 통과
- [ ] 브라우저 수동 확인 (연부 ON/OFF 토글, 회차 추가·삭제, 결과 화면 신고기한 표)

### Phase B (선택 — 향후 별도 설계 문서)

- [ ] 회차별 모드 토글 (RadioCardGroup: "합산 모드 / 회차별 모드")
- [ ] 회차별 모드 시 엔진 병렬 호출 (`Promise.all` N회)
- [ ] `InstallmentResultTable` 전용 컴포넌트 (회차별 세율·세액·D-day 표)
- [ ] 엔진 API 배열 결과 반환 구조 (별도 엔진 설계 필요)

### Phase C (옵션)

- [ ] 회차 날짜 오름차순 자동 정렬
- [ ] 회차 라벨 프리셋 버튼 ("계약금" / "중도금" / "잔금" 원클릭)
- [ ] 회차 중도 해제 처리 (연부취득 취소 시 기납부 세액 환급 안내)

---

## 4. 구현 시 주의사항

### 4.1 보고 항목 (구현 완료 후 엔진 시니어에게 보고)

1. 변경 파일 목록
2. `FormState` 신규 4개 필드 명세
3. `InstallmentPaymentsSection` UI 위치 (Step1, `purchase` + `isInstallmentAcquisition` 조건)
4. 결과 화면 표시 방식 (합산 과세표준 + 회차별 신고기한 표)
5. 회귀 테스트 결과
6. 브라우저 수동 확인 여부

### 4.2 엔진 인터페이스 — id·label 미전달

엔진 `AcquisitionTaxInput.installments[]`의 `InstallmentPayment` 타입은 `id`와 `label`을 갖지 않는다.
API 변환 시 반드시 두 필드를 제거하고 `{ paymentDate, amount }`만 전달한다.

```typescript
// 올바른 변환
body.installments = form.installments.map(({ paymentDate, amount }) => ({
  paymentDate,
  amount: parseAmount(amount) ?? 0,
}));

// 금지 — id, label이 엔진에 전달되면 타입 오류 (엔진 타입에 없는 필드)
body.installments = form.installments; // 금지
```

### 4.3 `reportedPrice` 처리

연부 ON 시 `reportedPrice`는 회차 합산으로 자동 대체된다.
서버 API Route Zod 스키마에서 `reportedPrice`가 필수로 선언된 경우,
합산 금액을 `body.reportedPrice`에 전달하여 Zod 통과를 보장한다.

```typescript
// buildAcquisitionTaxBody 초기화 시
const body: Record<string, unknown> = {
  propertyType: form.propertyType,
  acquisitionCause: form.acquisitionCause,
  acquiredBy: form.acquiredBy,
  reportedPrice: parseAmount(form.reportedPrice) ?? 0, // 초기값
};

// 연부 블록에서 덮어쓰기
if (form.isInstallmentAcquisition && engineInstallments.length > 0) {
  body.installments = engineInstallments;
  body.reportedPrice = engineInstallments.reduce((s, p) => s + p.amount, 0); // 덮어쓰기
}
```

### 4.4 800줄 정책

- `InstallmentPaymentsSection.tsx`: 독립 파일 — 반드시 분리 작성
- `AcquisitionTaxResultView.tsx`: 현재 파일 줄 수 확인 후 800줄 초과 시 `InstallmentResultCard.tsx` 분리
- `shared.ts`: 4개 필드 추가 후 줄 수 확인 (현재 536줄, 여유 있음)
- `normalize.ts`: 4개 필드 fallback 추가 후 줄 수 확인 (현재 284줄, 여유 있음)

### 4.5 연부 토글 OFF 시 installments 초기화 여부

연부 토글을 OFF로 전환해도 `installments` 배열을 자동으로 비우지 않는다.
사용자가 실수로 OFF했다가 다시 ON할 때 입력 데이터가 복원되도록 하는 UX 설계이다.
API 변환 레이어에서 `isInstallmentAcquisition === false`이면 `installments`를 미전달하므로
계산 결과에 영향 없다.

### 4.6 결과 화면에서 회차 정보 접근

`AcquisitionTaxResult` 엔진 결과에는 회차 배열이 포함되지 않는다 (합산 금액만 `taxBase`로 반환).
결과 화면에서 회차별 신고기한 표를 렌더하려면 `installments` 폼 데이터를 별도 prop으로 전달해야 한다.

구현 방법 (권장):
- `AcquisitionTaxForm`에서 `AcquisitionTaxResultView`에 `installments` prop 추가 전달
- 또는 폼 상태를 sessionStorage에서 복원 (현재 zustand persist 패턴 그대로 활용)

```typescript
// AcquisitionTaxResultView props 확장
interface AcquisitionTaxResultViewProps {
  result: AcquisitionTaxResult;
  installments?: Array<{
    label?: string;
    paymentDate: string;
    amount: string;
  }>;
}
```
