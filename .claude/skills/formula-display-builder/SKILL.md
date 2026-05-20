---
name: formula-display-builder
description: 결과 화면에서 세금 산출근거 산식을 변수 배지(⑭⑮⑯⑦) + 변수값 + fine-print + 분기 안내(rose 무효·amber 특례)로 표시하는 표준 UI 패턴. 펼침 토글·접근성·자기일관 검증 anchor를 포함.
trigger: 산출근거, 산식 표시, formula builder, 변수 배지, 신고서 변수 노출, 펼침 토글, ⑭ ⑮ ⑯, ⑦합계, fine-print, 산식 펼침
---

# formula-display-builder — 세금 산식 표시 UI 패턴

세액공제·산출세액·과세표준 등의 **산출근거(변수·값·산식)**를 결과 화면에서 펼침/인라인으로 표시하는 표준 UI 패턴. 변수 배지·fine-print·분기 안내로 사용자(납세자·세무사)가 산식을 직접 검증할 수 있도록 함.

## 적용 시점

- 사용자가 "산출근거", "어떻게 계산됐는지", "신고서 변수로 보여줘" 요청
- 세액공제 카드, 산출세액 카드, 한도 산식 표시 필요 시
- 신고서 양식(별지) 항목 번호(⑭⑮⑯⑦ 등)와 결과 화면 정합성 확보 필요
- 세무사 모드 — 의뢰인 설명용 산식 노출

## 적용 금지

- 단순 결과 숫자 표시 (산식 빌더 불필요)
- 모달 안의 입력 폼 (입력은 필드 + hint, 산식 빌더 아님)
- 산식이 자명한 경우(`A + B = C` 처럼) — fine-print만 필요

## 4-구성 표준 패턴

### 1. CreditRow 확장 — formula optional prop

```tsx
interface CreditRowProps {
  label: string;
  amount: number;
  lawRef?: string;
  highlight?: boolean;
  /** 산출근거 산식. undefined 시 펼침 토글 미렌더 — 기존 동작 보존 */
  formula?: React.ReactNode;
}

function CreditRow({ label, amount, lawRef, highlight, formula }: CreditRowProps) {
  const [expanded, setExpanded] = useState(false);
  if (amount === 0) return null;
  return (
    <div className="space-y-1">
      <div className={cardCls}>
        <div className="flex items-center gap-2 flex-wrap">
          <span>{label}</span>
          {lawRef && <span className="text-xs text-gray-400">{lawRef}</span>}
          {formula && (
            <button
              type="button"
              onClick={() => setExpanded((p) => !p)}
              className="text-[10px] text-gray-500 hover:text-violet-700"
              aria-expanded={expanded}
              aria-label={`${label} 산출근거 ${expanded ? "닫기" : "펼치기"}`}
            >
              {expanded ? "▼ 산출근거" : "▶ 산출근거"}
            </button>
          )}
        </div>
        <span className="font-mono">- {amount.toLocaleString()}</span>
      </div>
      {expanded && formula && (
        <div className="ml-3 px-3 py-2 text-[11px] text-gray-600 bg-gray-50/60 rounded-md space-y-1">
          {formula}
        </div>
      )}
    </div>
  );
}
```

### 2. Var 변수 배지 컴포넌트

```tsx
function Var({ label, val }: { label: string; val: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 dark:bg-blue-900/30 rounded px-1">
        {label}
      </span>
      <span className="text-[11px] font-mono">{val.toLocaleString()}</span>
    </span>
  );
}

// 사용
<Var label="⑮" val={creditLimit} />  // ⑮ 228,000,000
<Var label="⑤_prior" val={priorAddedTaxBase} />
<Var label="⑦합계" val={totalWithSurcharge} />
<Var label="기준세액" val={base} />
```

### 3. 산식 빌더 함수

각 공제·세액 항목별로 별도 빌더 함수:

```tsx
function buildSection28Formula(
  detail: PriorGiftCreditDetail,
  computedTax: number,
): React.ReactNode {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-1">
        <Var label="⑯" val={priorPaidCredit} /> = Min(
        <Var label="⑭" val={priorComputedTax} />,{" "}
        <Var label="⑮" val={creditLimit} />)
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1 text-gray-500">
        <Var label="⑮" val={creditLimit} /> = <Var label="⑦" val={computedTax} /> ×
        (<Var label="⑤_prior" val={priorAddedTaxBase} /> ÷{" "}
        <Var label="⑤" val={aggregatedTaxBase} />)
      </div>
      <FinePrint>※ ⑦은 할증 전 산출세액</FinePrint>
    </>
  );
}
```

### 4. 분기 안내 카드 (3종 색상 토큰)

```tsx
// (a) 무효 케이스 — rose (입력 조건 미충족)
{aggregatedTaxBase === 0 && (
  <div className="text-rose-600 dark:text-rose-400">
    ⑮ 0 — 과세표준 0으로 산식 무효
  </div>
)}

// (b) 정보 안내 — gray fine-print (의미 보완)
<div className="text-[10px] text-gray-400 dark:text-gray-500">
  ※ ⑦합계 = 산출세액 + 세대생략 할증
</div>

// (c) 특례 적용 안내 — amber (사용자 주의)
{specialTreatmentCredit > 0 && (
  <div className="text-[10px] text-amber-600 dark:text-amber-400">
    ※ 조특 특례 절감 분 차감 후 3% 적용
  </div>
)}
```

## 색상 토큰 가이드

| 영역 | 색상 |
|---|---|
| 변수 배지 (⑭⑮⑯⑦⑤_prior⑤) | blue-50/900 + blue-700/300 텍스트 |
| 펼침 토글 | gray-500 → hover violet-700 |
| 산식 컨테이너 배경 | gray-50/60 dark:gray-900/40 |
| fine-print 일반 (※) | gray-400 |
| 무효 안내 (입력 조건 미충족) | rose-600 |
| 특례·주의 안내 | amber-600 |
| 한국어 변수 라벨 ("기준세액") | blue 배지 |

## fine-print 표기 규칙

`※` 마크 + text-[10px] + gray-400:

```
※ ⑦은 할증 전 산출세액 (result.computedTax)
※ ⑦합계 = 산출세액 + 세대생략 할증
※ 조특 특례 절감 분 차감 후 3% 적용
```

목적:
- 동명이지(同名異旨) 변수 구분 (⑦ vs ⑦합계)
- 변수 출처 명시 (`result.computedTax`)
- 산식 의미 보완 (왜 이 변수가 사용되는가)

## 활성/비활성 가드 패턴 (echo-field-pattern과 연동)

```tsx
// echo 누락 시 산식 미표시 — fallback 0으로 잘못된 산식 표시 방지
const section69Formula =
  credit.filingCreditBase !== undefined &&
  credit.totalComputedTaxWithSurcharge !== undefined
    ? buildSection69Formula(credit)
    : undefined;

<CreditRow
  label="신고세액공제 (3%)"
  amount={credit.filingCredit}
  lawRef="§69"
  formula={section69Formula}  // undefined → 펼침 토글 미렌더
/>
```

## 접근성 체크리스트

- [ ] 펼침 버튼 `aria-expanded={expanded}` 동적
- [ ] 펼침 버튼 `aria-label="{label} 산출근거 {펼치기|닫기}"`
- [ ] 키보드 Tab → 포커스 + Enter/Space로 토글
- [ ] 변수 배지는 decorative `<span>` (alt 불필요, 숫자 텍스트와 함께)
- [ ] 모바일 폭에서 산식 줄바꿈 (flex-wrap)
- [ ] 산식 영역 텍스트 크기 ≥ text-[11px] (가독성)

## 자기일관 anchor 강제

산식 빌더 도입 시 **반드시** 자기일관 anchor 데이터 사용:

```ts
// __tests__/tax-engine/{domain}/{feature}-formula.test.ts
it("F-3: 부록 A 자기일관 — 산식 검증값", () => {
  // 입력 조건
  const result = calcXxx({
    computedTax: 380_000_000,
    priorGiftComputedTax: 240_000_000,
    priorGiftAddedTaxBase: 600_000_000,
    aggregatedTaxBase: 1_000_000_000,
    ...
  });
  // 산식 자기일관 검증
  // ⑮ = floor(380M × 600M / 1000M) = 228M
  expect(result.creditLimit).toBe(228_000_000);
  // ⑯ = Min(240M, 228M) = 228M
  expect(result.giftTaxCredit).toBe(228_000_000);
  // base = 380M - 228M = 152M (echo)
  expect(result.filingCreditBase).toBe(152_000_000);
  // §69 = floor(152M × 3%) = 4,560,000
  expect(result.filingCredit).toBe(4_560_000);
});
```

→ Plan/Design 부록 A의 모든 수치가 anchor와 정확 일치해야 함. 산술 자기일관성 위반은 사용자 혼동·신뢰 손상.

## 위반 시 신호

- 산식 표시인데 변수 배지 없음 → 일반 텍스트로 모호
- ⑭⑮⑯ 같은 신고서 항목 번호 표기 없음 → 세무사 친화 X
- "왜 이 산식?"이 fine-print에 없음 → 사용자 혼동
- 산식 데이터가 UI 빌더 안에서 직접 계산 → 엔진과 분리 (drift 위험)
- 펼침 토글이 항상 펼쳐진 상태 → 화면 부담
- amount=0인 행에 산식만 표시 → CreditRow null 반환 정책 위반

## 워크플로

1. **Plan/Design 단계**
   - 신고서 양식 항목 번호 매핑 (⑭⑮⑯ → 의미)
   - 자기일관 anchor 데이터 사전 작성 (부록 A)
   - 산식·fine-print·분기 안내 문안 확정

2. **echo 필드 추가** ([[echo-field-pattern]] 적용)
   - 엔진 결과 타입에 optional echo
   - return 직전 echo 2~N줄

3. **빌더 함수 작성**
   - `buildSection{N}Formula(detail, ...)` 시그니처
   - Var 배지 일관 사용
   - fine-print 2~3개

4. **CreditRow / 결과 카드 통합**
   - formula prop 추가 (optional)
   - echo 가드 패턴 (`!== undefined`)
   - 색상 토큰 일관

5. **anchor 자기일관 검증**
   - Plan/Design 부록 데이터로 단위 테스트
   - 모든 산식 수치 정확 일치

## 참고 사례

- **증여세 §28·§69 산출근거 표시** (`68a2e50`)
  - buildSection28Formula·buildSection69Formula 빌더 2종
  - Var 배지 (⑭⑮⑯⑦⑤_prior⑤·기준세액·⑦합계)
  - fine-print 2종 + 무효(rose)·특례(amber) 분기 안내
  - 자기일관 anchor F-3·F-9 검증
  - `components/calc/TaxCreditBreakdownCard.tsx`

## 관련 정책 메모리

- [[echo-field-pattern]] — 엔진 결과 echo 필드 표준 패턴
- [[feedback-result-view-korean-formula]] — 결과 산식은 한국어·법정 용어, 변수 약어·floor 금지
- [[feedback-pdf-table-row-one-to-one-mapping]] — 신고서 PDF 행 번호 ↔ 변수명 1:1 매핑
- [[feedback-tax-calculation-principle]] — 산식·근거 명확 노출로 납세자 검증 가능
