# 비상장주식 평가 PR-K — §54⑥ 평가심의위원회 신청 옵션 Design

> **Plan**: `docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md`
> **Date**: 2026-05-24

---

## 1. KoreanLaw MCP 검증 결과 (Phase A-0)

### 1.1 상증령 §54⑥ 원문 (KoreanLaw MCP 2026-05-24)

> ⑥ 비상장주식등을 평가할 때 납세자가 다음 각 호의 어느 하나에 해당하는 방법으로 평가한 평가가액을 첨부하여 제49조의2제1항에 따른 평가심의위원회에 비상장주식등의 평가가액 및 평가방법에 대한 심의를 신청하는 경우에는 제54조제1항·제4항, 제55조 및 제56조에도 불구하고 평가심의위원회가 심의하여 제시하는 평가가액에 의하거나 그 위원회가 제시하는 평가방법 등을 고려하여 계산한 평가가액에 의할 수 있다. 다만, 납세자가 평가한 가액이 보충적 평가방법에 따른 주식평가액의 100분의 70에서 100분의 130까지의 범위 안의 가액인 경우로 한정한다.
> 1. 해당 법인의 자산·매출액 규모 및 사업의 영위기간 등을 고려하여 같은 업종을 영위하고 있는 다른 법인(제52조의2제1항에 따른 유가증권시장과 코스닥시장에 상장된 법인을 말한다)의 주식가액을 이용하여 평가하는 방법
> 2. 향후 기업에 유입될 것으로 예상되는 현금흐름에 일정한 할인율을 적용하여 평가하는 방법
> 3. 향후 주주가 받을 것으로 예상되는 배당수익에 일정한 할인율을 적용하여 평가하는 방법
> 4. 그 밖에 제1호부터 제3호까지의 규정에 준하는 방법으로서 일반적으로 공정하고 타당한 것으로 인정되는 방법

### 1.2 상증령 §49의2 (평가심의위원회 — 발췌)

| 항 | 핵심 |
|---|---|
| ①2호 | 비상장주식 §54⑥ 가액평가·평가방법 심의 위원회 |
| ⑤본문 | 신청 기한: 상속 4개월 전 / 증여 70일 전 (신고기한 만료 기준) |
| ⑤2호 (가·나·다) | 첨부 자료 — 보충적 평가액·불합리 근거·§54⑥ 평가액 |
| ⑥ | 통지 기한: 상속 1개월 전 / 증여 20일 전 |
| ⑦ | 심의 고려사항 3종 (법 §63 준용·§54~§56 적정성·업종/자산상태) |
| ⑨ | 신용평가전문기관 의뢰 가능 — 수수료 납세자 부담 |

### 1.3 상증법 §67·§68 (신고기한)

- §67① 상속세: 상속개시일이 속한 달의 말일 + 6개월
- §68① 증여세: 증여일이 속한 달의 말일 + 3개월

### 1.4 §54④ 순자산 단독 평가 분기 (Plan §1.5.1 동기화)

§54④ 1·2·6호 (청산·사업개시 3년 미만·잔여존속기한 3년) 또는 3·5호 단서 충족 시:
- `finalPerShareValue` = ⑥-㉡ (= ④ 1주당 순자산가액 × 80%)
- 70~130% 범위는 이 ⑥-㉡ 기준 적용 → 범위 폭이 좁아짐
- 본 PR 별도 분기 없음 — `result.finalPerShareValue` 일관 사용 (엔진이 §54④ 분기 책임)
- `supplementaryPerShareValuation = result.finalPerShareValue` (할증 전 ⑥) 단일 기준

---

## 2. 타입 시그니처

```ts
// lib/tax-engine/property-valuation/evaluation-committee-section-54-6.ts

export type EvaluationCommitteeMethod = "clm" | "dcf" | "ddm" | "other";

/**
 * 4방법 한글 라벨 — Record 강제 (memory `enum-verification-before-mapping`)
 * 컴파일 시점에 4방법 누락 차단.
 */
export const METHOD_LABEL: Record<EvaluationCommitteeMethod, string> = {
  clm: "유사 업종 상장법인 비교평가법 (1호)",
  dcf: "현금흐름할인법 DCF (2호)",
  ddm: "배당할인법 DDM (3호)",
  other: "기타 공정·타당 평가법 (4호)",
};

export interface EvaluationCommitteeInput {
  method: EvaluationCommitteeMethod;
  /** 1주당 평가가액 (할증 전, §54⑥ 단서 기준) */
  taxpayerPerShareValuation: number;
  /** method="other" 시 필수 — 평가 방법 설명 */
  methodNotes?: string;
  /** 평가 수행 기관 (회계법인·세무법인 등) — 선택 */
  evaluatorOrganization?: string;
}

export type EvaluationCommitteeWarningReason =
  | "out_of_range_below"           // 70% 미만
  | "out_of_range_above"           // 130% 초과
  | "zero_supplementary"           // 보충적 평가가액 0 이하
  | "other_method_missing_notes";  // method="other" + methodNotes 누락

export interface EvaluationCommitteeResult {
  isWithinRange: boolean;
  supplementaryPerShareValuation: number;  // = finalPerShareValue (1주당 ⑥)
  lowerBoundPerShare: number;              // floor(supplementary × 0.7)
  upperBoundPerShare: number;              // floor(supplementary × 1.3)
  taxpayerPerShareValuation: number;
  deviationPct: number;                    // (taxpayer − supplementary)/supplementary × 100 (소수 2자리)
  method: EvaluationCommitteeMethod;
  // ❌ methodLabel 미포함 — derived 필드 (UI가 METHOD_LABEL[method] lookup)
  //    이중 진실 회피 — Result는 method만 보존
  warnings: Array<{ reason: EvaluationCommitteeWarningReason; message: string }>;
  appliedLegalBasis: string;
}

// 결과 타입 확장 (lib/tax-engine/types/unlisted-stock-valuation.types.ts)
export interface UnlistedStockValuationResult {
  // ... 기존 필드 ...
  /** PR-K (§54⑥): 평가심의위 옵션 적용 결과 (참고용 메타 — 본 결과 무변경) */
  evaluationCommitteeApplied?: EvaluationCommitteeResult;
}
```

---

## 3. 핵심 산식

### 3.1 70~130% 범위 검증

```
lowerBound = Math.floor(supplementary × 0.7)  // 70% 이하 포함
upperBound = Math.floor(supplementary × 1.3)  // 130% 이하 포함

isWithinRange = (lowerBound ≤ taxpayer ≤ upperBound)
```

**전제**: `supplementary = result.finalPerShareValue`는 엔진(`net-asset-calc.ts:107`·`weighted-avg.ts`)에서 이미 `Math.floor` 처리된 정수. 본 모듈은 정수 입력 가정.

**경계값 처리** (Math.floor 일관 — memory `progressive_deduction_accuracy` 정책 동일):
- supplementary = 10,000 → lower = 7,000, upper = 13,000
- taxpayer = 7,000 → 통과 (이하 포함)
- taxpayer = 6,999 → 차단 (out_of_range_below)
- taxpayer = 13,000 → 통과
- taxpayer = 13,001 → 차단 (out_of_range_above)

### 3.2 deviationPct 계산

```
deviationPct = ((taxpayer − supplementary) / supplementary) × 100
             → 소수 2자리 (Math.round((x) × 100) / 100)
```

예시:
- supplementary 10,000 / taxpayer 9,500 → -5.00%
- supplementary 10,000 / taxpayer 11,300 → +13.00%

### 3.3 신청 기한 계산 (date-fns)

```ts
import { endOfMonth, addMonths, subMonths, subDays, differenceInDays } from "date-fns";

/**
 * 상속세 신청 기한 (§67① + §49의2⑤)
 * 사용처: PR-K-4 EvaluationCommitteeResultCard·EvaluationCommitteeFilingGuideCard
 */
export function inheritanceApplicationDeadline(deathDate: Date): Date {
  const filingDeadline = addMonths(endOfMonth(deathDate), 6);  // 신고기한
  return subMonths(filingDeadline, 4);                          // 신청 = 신고 − 4개월
}

/**
 * 증여세 신청 기한 (§68① + §49의2⑤)
 * 사용처: PR-K-4 동상
 */
export function giftApplicationDeadline(giftDate: Date): Date {
  const filingDeadline = addMonths(endOfMonth(giftDate), 3);
  return subDays(filingDeadline, 70);                          // 신청 = 신고 − 70일
}

/**
 * 카운트다운 헬퍼 — today를 인자로 받는 이유는 테스트 가능성 (jsdom + vi.useFakeTimers).
 * 음수 반환 = 기한 초과 (rose 경고 트리거).
 */
export function daysUntilDeadline(deadline: Date, today: Date = new Date()): number {
  return differenceInDays(deadline, today);
}
```

**경계 검증 사례 (사례 6 기준)**:
- 상속개시일 2024-01-20 → endOfMonth = 2024-01-31 → +6개월 = 2024-07-31 → -4개월 = 2024-03-31 (신청 마감)
- 오늘 2024-01-23 가정 → daysUntilDeadline = 67일 (D-67)

---

## 4. UI 와이어프레임 (PR-K-3·K-4·K-5)

### 4.1 EvaluationCommitteeToggle (PR-K-3)

```
┌─────────────────────────────────────────────────────────┐
│ 11. §54⑥ 평가심의위원회 신청 옵션  [○] OFF / [●] ON      │
├─────────────────────────────────────────────────────────┤
│ 평가 방법 (4방법 — RadioCardGroup)                       │
│ ○ 유사 업종 상장법인 비교평가법 (1호)                    │
│ ○ 현금흐름할인법 DCF (2호)                               │
│ ○ 배당할인법 DDM (3호)                                  │
│ ● 기타 공정·타당 평가법 (4호)                            │
│                                                          │
│ 1주당 평가가액 (할증 전, 보충적 평가가액 기준)            │
│ [______________]원                                       │
│                                                          │
│ ▼ method="other" 선택 시 노출                            │
│ 평가 방법 사유 (필수) — textarea                         │
│ [______________________________________]                 │
│                                                          │
│ 평가 수행 기관 (선택)                                    │
│ [회계법인 / 세무법인 명___________]                      │
└─────────────────────────────────────────────────────────┘
```

#### 4.1.1 토글 ON→OFF 데이터 폐기 다이얼로그 (memory `dialog-data-discard-confirm`)

```
┌─────────────────────────────────────────────────┐
│ ⚠ 평가심의위 옵션 비활성화                       │
├─────────────────────────────────────────────────┤
│ 입력하신 4방법·평가가액·사유 데이터가           │
│ 모두 삭제됩니다. 계속하시겠습니까?              │
│                                                  │
│            [취소]    [확인 — 데이터 삭제]       │
└─────────────────────────────────────────────────┘
```

- 취소·ESC·외부 클릭 시 토글 ON 상태 유지 + 데이터 보존
- 확인 시 evaluationCommittee=undefined
- 파괴 액션 rose-600 (memory 정책)

### 4.2 EvaluationCommitteeRangeIndicator (PR-K-4)

```
┌─────────────────────────────────────────────────────────┐
│ 70~130% 범위 검증 (보충적 평가가액 = 10,910원)            │
├─────────────────────────────────────────────────────────┤
│   7,637원    10,910원   14,183원                         │
│      │            │            │                         │
│      │←── 범위 안 (emerald) ──→│                         │
│  ────┼────────────●────────────┼────                     │
│      │       10,500원          │                         │
│      │       (deviation -3.75%) │                        │
│                                                          │
│ ✅ 70~130% 범위 안 — 평가심의위 신청 자격 있음           │
└─────────────────────────────────────────────────────────┘
```

### 4.3 EvaluationCommitteeResultCard (PR-K-4)

```
┌─────────────────────────────────────────────────────────┐
│ 평가심의위 옵션 적용 결과                                │
├─────────────────────────────────────────────────────────┤
│ 적용 방법: 유사 업종 상장법인 비교평가법 (1호)            │
│   ↑ UI가 METHOD_LABEL[result.method] lookup (Result는    │
│     method만 보존 — derived 필드 중복 진실 회피)          │
│ 법령 근거: 상증령 §54⑥ + §49의2                          │
│                                                          │
│ 범위 검증: ✅ 통과 (보충적 대비 -3.75%)                  │
│   보충적 평가가액  : 10,910원                            │
│   70% 하한        :  7,637원                             │
│   130% 상한       : 14,183원                             │
│   납세자 평가가액  : 10,500원                            │
│                                                          │
│ 신청 기한 카운트다운 (상속개시일 2024-01-20)             │
│   신고기한 만료    : 2024-07-31                          │
│   신청 마감       : 2024-03-31 (D-67일)                  │
│                                                          │
│ ※ 본 결과는 옵션 적용 가능 안내. 실제 적용은 평가심의위  │
│   통지 결과에 따름.                                      │
└─────────────────────────────────────────────────────────┘
```

### 4.4 EvaluationCommitteeFilingGuideCard (PR-K-5)

```
┌─────────────────────────────────────────────────────────┐
│ 평가심의위 신청 안내 (§49의2⑤·⑥)                        │
├─────────────────────────────────────────────────────────┤
│ 첨부 자료 (§49의2⑤2호)                                  │
│  ☐ (가) 보충적 평가액 + 부속서류                         │
│  ☐ (나) 보충적 평가액 불합리 근거 자료                   │
│  ☐ (다) §54⑥ 평가 결과 + 부속서류 (4방법 중 선택)        │
│                                                          │
│ 신청·통지 기한                                           │
│  - 상속세: 신청 4개월 전 / 통지 1개월 전                 │
│  - 증여세: 신청 70일 전 / 통지 20일 전                   │
│                                                          │
│ 심의 고려사항 (§49의2⑦)                                 │
│  1. 법 §63 유가증권 평가방법 준용 적정 가액              │
│  2. §54~§56 보충적 평가의 적정성 여부                    │
│  3. 업종·사업규모·자산상태·사회적 인식                   │
│                                                          │
│ 신용평가전문기관 의뢰 가능 (§49의2⑨)                    │
│  - 평가심의위가 필요시 의뢰 가능                          │
│  - 평가수수료는 납세자 부담                              │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 컴포넌트 분리

```
components/calc/inheritance/unlisted-stock-v2/
├── EvaluationCommitteeToggle.tsx              # PR-K-3 ~250줄
├── EvaluationCommitteeRangeIndicator.tsx      # PR-K-4 ~180줄
├── EvaluationCommitteeResultCard.tsx          # PR-K-4 ~150줄
├── EvaluationCommitteeFilingGuideCard.tsx     # PR-K-5 ~120줄
└── UnlistedStockV2Card.tsx                    # 수정 — 새 섹션 11 통합

lib/tax-engine/property-valuation/
└── evaluation-committee-section-54-6.ts       # PR-K-1 ~150줄

lib/tax-engine/types/unlisted-stock-valuation.types.ts  # 수정 — input/result 확장
lib/validators/unlisted-stock-valuation-v2.schema.ts    # PR-K-2 수정
lib/calc/inheritance-validate.ts                        # PR-K-2 수정
```

총 신규 약 700줄 + 수정 약 100줄. 800줄 정책 모두 준수.

### 5.1 의존 import 표

| 컴포넌트 | 외부 import |
|---|---|
| EvaluationCommitteeToggle | `@/components/ui/dialog` (Dialog), `@/components/calc/inputs/RadioCardGroup`, `@/components/calc/inputs/CurrencyInput`, `@/components/calc/inputs/FieldCard` |
| EvaluationCommitteeRangeIndicator | (Tailwind 직접) |
| EvaluationCommitteeResultCard | `date-fns` (differenceInDays), 본 모듈의 inheritanceApplicationDeadline·giftApplicationDeadline·daysUntilDeadline |
| EvaluationCommitteeFilingGuideCard | (정적 표시만 — import 최소) |
| 엔진 evaluation-committee-section-54-6 | 외부 import 없음 (순수 함수) |

---

## 6. anchor 매트릭스 (45건 — sub-PR별)

### 6.1 PR-K-1 (엔진·타입, 13건)

| ID | 시나리오 | 검증 |
|---|---|---|
| K-1-1 | METHOD_LABEL 4종 한글 라벨 강제 | `Object.keys(METHOD_LABEL).length === 4` + 모든 enum 키 포함 |
| K-1-2 | enum 외 값 차단 | TypeScript `// @ts-expect-error` 패턴 (런타임은 Zod 책임 — K-2-2) |
| K-1-3 | 70% 정확히 통과 | supp=10,000, taxpayer=7,000 → isWithinRange=true |
| K-1-4 | 130% 정확히 통과 | supp=10,000, taxpayer=13,000 → isWithinRange=true |
| K-1-5 | 70% 미만 차단 | taxpayer=6,999 → out_of_range_below |
| K-1-6 | 130% 초과 차단 | taxpayer=13,001 → out_of_range_above |
| K-1-7 | deviationPct (음수·양수·0) | -5.00 / +13.00 / 0.00 |
| K-1-8 | supplementary=0 → zero_supplementary | warnings + isWithinRange=false |
| K-1-9 | orchestrator 통합 (사례 6 기준 supplementary=10,910) | result.evaluationCommitteeApplied 노출 |
| K-1-10 | 본 결과 무변경 | result.totalValuation=340,392,000 유지 |
| K-1-11 | appliedRules 인용 | "상증령 §54⑥ + §49의2" 포함 |
| K-1-12 | 빈 입력 회귀 | evaluationCommittee=undefined → result.evaluationCommitteeApplied=undefined |
| K-1-13 | method="other" + methodNotes 누락 | other_method_missing_notes warnings |

### 6.2 PR-K-2 (Zod + validate, 4건)

| ID | 시나리오 | 검증 |
|---|---|---|
| K-2-1 | Zod 4방법 정상 통과 | 각각 safeParse success |
| K-2-2 | method enum 외 값 차단 | safeParse fail |
| K-2-3 | taxpayerPerShareValuation 음수 차단 | safeParse fail |
| K-2-4 | validate "other" + methodNotes 누락 차단 | validateUnlistedStockV2 → "기타 평가법 사유 필수" |

### 6.3 PR-K-3 (UI 토글 + 입력, 6건 RTL)

| ID | 시나리오 | 검증 |
|---|---|---|
| K-3-1 | RadioCardGroup 4옵션 렌더 | 4 buttons getByRole |
| K-3-2 | method="other" 시 methodNotes textarea 활성화 | textarea visible |
| K-3-3 | 토글 OFF→ON default values | evaluationCommittee 객체 생성 |
| K-3-4 | 토글 ON→OFF dialog 확인 후 데이터 폐기 | dialog open + confirm → evaluationCommittee=undefined |
| K-3-5 | taxpayerPerShareValuation 음수 차단 | input min=0 |
| K-3-6 | onChange → input 머지 | mock callback args |

### 6.4 PR-K-4 (범위 시각화 + 결과 카드, 9건 RTL)

| ID | 시나리오 | 검증 |
|---|---|---|
| K-4-1 | Range Indicator 70%·130% 표시 | "7,000원·13,000원" 텍스트 |
| K-4-2 | 납세자 위치 deviation 기반 (clamp 적용) | `pos = clamp((taxpayer-lower)/(upper-lower)*100, 0, 100)` — 범위 밖이면 0% 또는 100%에 고정 + 범위 밖 색조(rose) 강조 |
| K-4-3 | 범위 안/밖 색조 변경 | emerald/rose className 분기 |
| K-4-4 | 결과 카드 옵션 적용 시만 노출 | evaluationCommittee=undefined → null |
| K-4-5 | deviationPct 한글 표시 | "보충적 대비 -5.00%" 또는 "-3.75%" |
| K-4-6 | 상속세 신청 기한 카운트다운 | deathDate 기반 D-N일 |
| K-4-7 | 증여세 신청 기한 카운트다운 | giftDate 기반 D-N일 |
| K-4-8 | 기한 초과 음수일 + rose 경고 | "기한 초과 5일" rose tone |
| K-4-9 | supplementary=0 — gray-out + 입력 비활성 | Range Indicator gray tone + 안내 텍스트 "보충적 평가가액 계산 후 활성화됩니다" + taxpayer input disabled |

### 6.5 PR-K-5 (신고서 안내, 3건 RTL)

| ID | 시나리오 | 검증 |
|---|---|---|
| K-5-1 | 체크리스트 3행 렌더 | "(가)·(나)·(다)" 3 checkboxes |
| K-5-2 | 기한 안내 상속·증여 분기 | "상속 4개월 전·증여 70일 전" 양쪽 표시 |
| K-5-3 | 신용평가전문기관 안내 | "수수료 납세자 부담" 텍스트 |

### 6.6 PR-K-6 (통합·14지점·회귀, 10건)

| ID | 시나리오 | 검증 |
|---|---|---|
| K-6-1 | UnlistedStockV2Card 통합 — 섹션 11 노출 | EvaluationCommitteeToggle visible |
| K-6-2 | 토글 ON → Range Indicator + 결과 카드 연쇄 노출 | 3 컴포넌트 동시 visible |
| K-6-3 | 토글 OFF → 모든 sub-카드 숨김 | queryAll null |
| K-6-4 | 사례 6 (case-5a-integration) 회귀 0건 | 기존 18 anchor 통과 |
| K-6-5 | besshi-form-full-replica 회귀 0건 | 15 anchor 통과 |
| K-6-6 | PR-I (단주) 회귀 0건 | 8 anchor |
| K-6-7 | PR-H (이력) 회귀 0건 | 20 anchor |
| K-6-8 | PR-J (PDF) 회귀 0건 | 11 anchor |
| K-6-9 | PR-P (§54③) 회귀 0건 | 11 anchor |
| K-6-10 | 14지점 동기화 점검 grep — evaluationCommittee 필드 5단 파이프라인 | 폼→변환→fetch body→Zod→route→엔진 전수 매핑 확인 (sourceCalculationId는 PR-H 범위, 본 PR과 무관) |

---

## 7. 14 동기화 지점 매핑

| # | 지점 | sub-PR 영향 |
|---|---|---|
| ① 폼 상태 | EstateItem.unlistedStockValuationV2 통째 사용, optional 자동 포함 | PR-K-1 (타입만) |
| ② initial | createDefaultUnlistedStockV2 undefined로 통과 | PR-K-1 (변경 없음) |
| ③ normalize | 해당 없음 (optional) | — |
| ④ API 변환 | estateItems 통째 전달 — 자동 통과 | — |
| ⑤ UI 위젯 | EvaluationCommitteeToggle + 3 sub-card | PR-K-3·K-4·K-5 |
| ⑥ 사이드바 | 영향 없음 | — |
| ⑦ 결과 카드 | EvaluationCommitteeResultCard | PR-K-4 |
| ⑧ validation | "other" + methodNotes 강제 | PR-K-2 |
| ⑨~⑩ Zod | 4방법 enum + 음수 차단 | PR-K-2 |
| ⑪~⑭ route handler | estateItems 통째 → 자동 통과 (단 PR-K-2 Zod schema 강화 필수 — 누락 시 silent strip) | PR-K-2 의존 |

3대 정책 위반 없음:
- **(a) useEffect → store 미러링 금지**: 토글 OFF→ON 시 cross-field 동기화는 onChange 직접 (useEffect 미사용)
- **(b) 자동 안분 fallback 금지**: 수동 입력만, fallback 없음
- **(c) API/UI fallback ↔ validate 동기화**: methodNotes optional · "other" 시 필수 — Zod·validate 양쪽 강제

---

## 8. 회귀 보호 + 누적 anchor

PR-K 완료 시점 전체 anchor:
- case-5a-integration: 18
- besshi-form-full-replica: 15
- PR-I (단주): 8
- PR-H (이력): 20
- PR-J (PDF): 11
- PR-P (§54③): 11
- PR-K 신규: **45**
- **합계: 128 anchor + 기존 4,791 기반**

K-6-4·5·6·7·8·9 회귀 anchor 6건이 보장.
