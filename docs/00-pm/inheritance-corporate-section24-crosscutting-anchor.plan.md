# 영리법인 사전증여 × §24 종합한도 cross-cutting anchor

> 작성일: 2026-05-22
> 작업 유형: 회귀 anchor 보강 (엔진 변경 없음)
> 담당: `inheritance-gift-tax-senior` + `inheritance-gift-deduction-senior` + `inheritance-tax-qa`
> 연결 PDCA: `inheritance-deduction-limit-phase-d-anchor.plan.md` §7 후속-2
>
> **⚠️ 2026-05-22 Pre-Do 결과 — Archive 상태 (재진입 보류)**
>
> CC-01·02·03 3건 모두 design 가정과 실측 불일치 (실패):
> - CC-01: ceiling 5,265M 예상 vs 실제 **5,965M (변화 0)**
> - CC-02: finalTax baseline 동치 가정 vs 실제 **1,935,658원 차이**
> - CC-03: ceiling 8,225M 예상 vs 실제 **5,965M (baseline 그대로)**
>
> **핵심 발견**: 영리법인 사전증여가 §24 ceiling 산식에 **영향 0**. design의 "A·B 동시 영향" 전제 자체가 틀림.
> 또한 §13 cutoff 도과 영리법인이 corporate 면제 산식에 여전히 영향 미침.
>
> **재진입 조건**: KoreanLaw MCP로 §24·§13·§3의2 영리법인 관련 조문 본문 검증 +
> `priorGiftAggregated`·`corporateGiftTaxBase` 산식이 영리법인 포함 여부 법령 정합 확인.
> 검증 후 design 가정 보정 또는 엔진 동작 정정 (별도 PR).
>
> 현행 anchor 실측값 그대로 동결 시 잠재적 엔진 버그를 회귀 보호하게 됨 → 본 작업 진행 보류.

## 1. 배경

### 1.1 영리법인 사전증여가 두 산식에 동시 입력되는 구조

영리법인이 받은 사전증여(`beneficiaryType: "corporate"`)는 §13에 따라 상속세 과세가액에 가산되며, 다음 두 산식의 분자에 **동시에 영향**을 미친다.

**산식 A — §24 종합한도** (`inheritance-tax.ts:295~301`)
```
ceiling = 과세가액
        − legateeAmountNonHeir (상속인 외 자에 대한 유증)
        − max(0, totalPriorGiftAmount − (priorGiftDeductionTotal + disasterLossDeduction))
```
- `totalPriorGiftAmount = priorGiftAggregated` — **영리법인 포함 모든 사전증여 합계**
- 영리법인 사전증여 증가 → ceiling 감소 → 공제 cap 강화 → taxBase 증가 → computedTax 증가

**산식 B — §3의2 ② 영리법인 면제** (`inheritance-corporate-exemption.ts:8`)
```
한도 = floor(상속세 산출세액 × 영리법인 증여 과세표준 / 상속세 과세표준)
면제 = min(영리법인 증여세 산출세액, 한도)
```
- `corporateGiftTaxBase` — 영리법인 사전증여 과세표준 합계만
- 영리법인 사전증여 증가 → 면제 한도 증가 → 면제액 증가 → finalTax 감소

### 1.2 §13 5년 cutoff 단일 진실 (`isWithin13Cutoff`)

영리법인은 "상속인 외 자"이므로 §13 ② 5년 cutoff 적용. 두 산식 모두 동일 `isWithin13Cutoff` 헬퍼로 필터링:

- `aggregatePriorGiftsForInheritance` (`lib/tax-engine/inheritance-gift-common.ts:286`) → `priorGiftAggregated` (A 분자)
- `corporateGifts` filter (`inheritance-tax.ts:372~374`) → `corporateGiftTaxBase` (B 분자)

**결과 노출 경로**:

| 경로 | 의미 |
|---|---|
| `result.priorGiftAggregated` | A 분자 (top-level 노출, `types/inheritance-gift.types.ts:680`) |
| `result.deductionDetail.breakdown[".includes('§24 종합한도')"]` | ceiling 라인 amount |
| `result.deductionDetail.breakdown[".includes('한도 초과')"]` | cap 발동 시만 존재 |
| `result.corporateExemption?.amount` | B 결과 (영리법인 사전증여 0이면 `undefined`) |
| `result.finalTax` | A·B 효과 합산 |

**폴백 정책**: breakdown 라벨 매칭은 `.includes("§24 종합한도")` / `.includes("한도 초과")` 사용 — 라벨 부분 변경 안전. 라벨 자체 변경은 본 작업 범위 외.

→ 어느 한쪽만 cutoff 변경되면 A·B 불일치 발생.

### 1.3 현행 anchor 갭

| 영역 | 기존 | 갭 |
|---|---|---|
| §24 한도 단위 | P-01~P-06 ✅ | — |
| §3의2② 면제 단위 | `corporate-exemption-per-corporate.test.ts` ✅ | — |
| §24 한도 통합 | J-04d (영리법인 입력 고정) ✅ | — |
| §3의2② 면제 통합 baseline | J-04 (`corporateGiftComputedTax=0` 경계) + comprehensive H 시리즈 ✅ | — |
| **영리법인 사전증여 입력 변화 → A·B 동시 영향** | **0건** | ❌ |
| **§13 5년 cutoff 도과 영리법인 → A·B 양쪽 제외** | **0건** | ❌ |

회귀 위험 (위 갭이 잡지 못하는 silent breakage):
- `priorGiftAggregated` 합산에서 영리법인 분 누락 → A에서만 빠지고 B는 정상 → ceiling 과대, 면제 정상
- `corporateGifts` filter 변경 → B 분자 변경되나 A는 영향 없음 → 면제 산식 부정합
- `isWithin13Cutoff` 로직 변경 → A·B 중 한쪽만 적용
- `corporateGiftTaxBase`에 비-영리법인 사전증여 혼입 → 면제 한도 과대

## 2. 목표

영리법인 사전증여 입력 변화 시 §24 한도와 §3의2② 면제가 양쪽 모두 정합하게 변하는지 통합 anchor로 보호. 다음 3건 추가:

1. **CC-01** 영리법인 사전증여 700M → 1,400M로 증액 → **A·B 동시 영향** 검증 (A=ceiling 라인 −700M / B=면제 한도 증가 + finalTax 감소 / totalDeduction은 cap 미발동으로 미변화)
2. **CC-02** §13 5년 cutoff 도과 영리법인 사전증여 추가 → **A·B 양쪽에서 동일 제외** 검증 (baseline 동치)
3. **CC-03** 영리법인 사전증여만 있고 일반 사전증여 0 → A·B 단독 시나리오 + ceiling 8,225M anchor

## 3. 케이스 인벤토리

### 3.1 baseline (EXAMPLE_INPUT — fixture L427~440 검증 완료)

| 항목 | 값 |
|---|---|
| `deathDate` | 2023-03-05 (fixture L50) |
| `priorGiftDeductionTotal` | 650,000,000 (fixture L440) |
| `legateeAmountNonHeir` | 500,000,000 (fixture L439) |
| 영리법인 사전증여 1건 | 700M (corporate, **2021-08-10** = deathDate −1년7월, 5년 cutoff 내), corporateGiftComputedTax 150M |
| 상속인 사전증여 2건 | 760M (배우자 2022-06-10) + 1,500M (아들 2018-08-17) |
| 합계 priorGiftAggregated (계산) | **2,960M** (700+760+1,500) |
| §24 ceiling baseline (PDF 책 1864) | **5,965M** (= 8,775 − 500 − max(0, 2,960 − 650)) |
| baseline `result.totalDeduction` | **4,600M** (J-04b 확인, 한도 미발동 — 4,600 < 5,965) |
| baseline `result.corporateExemption.amount` | TBD (Pre-Do 측정 — 임시 실패 anchor로 실측) |
| baseline `result.finalTax` | TBD (Pre-Do 측정) |

> §13 5년 cutoff 기준일: `deathDate − 5년 = 2018-03-04`. 이 날짜 **이후** 영리법인 사전증여만 가산.

> `result.priorGiftAggregated`는 `InheritanceTaxResult` top-level 필드(`lib/tax-engine/types/inheritance-gift.types.ts:680`)로 노출됨 — anchor에서 직접 접근 가능.

### 3.2 CC-01: 영리법인 사전증여 증액 (700M → 1,400M)

⚠️ 본 변형으로 새 ceiling = 5,965 − 700 = **5,265M** > rawTotal 4,600M → **cap 여전히 미발동**. 따라서 **A 산식의 ceiling 라인만 변하고 `totalDeduction`은 baseline 4,600M 동일**. cross-cutting "동시 변화"는 ceiling line + corporateExemption + finalTax의 동시 변화로 검증한다 (totalDeduction은 미변화 자체를 검증).

추가로 영리법인 증여세 산출세액 임의 입력: `corporateGiftComputedTax` 150M → **300M** (임의 시나리오 — anchor의 회귀 검증 목적상 임의값으로 충분. 비례 산출이 아니라 사용자 시뮬레이션 입력).

| 검증 항목 | 기대 변화 |
|---|---|
| `result.priorGiftAggregated` | baseline +700M (= 3,660M) |
| breakdown "§24 종합한도 (...)" line amount (ceiling) | baseline −700M (= **5,265M**) |
| breakdown "한도 초과" line | **부재** (cap 미발동) |
| `result.totalDeduction` | **baseline 4,600M 동일** (rawTotal < 새 ceiling) |
| `result.corporateExemption.amount` | §3의2 한도 산식 재계산 정확값 (Pre-Do 측정) |
| `result.finalTax` | corporateExemption 증가량만큼 감소 (Pre-Do 측정) |

### 3.3 CC-02: §13 5년 cutoff 도과 영리법인 사전증여 추가

추가 fixture (EXAMPLE_INPUT.preGiftsWithin10Years에 spread + push):
- `giftDate: "2017-03-05"` (deathDate −6년, 5년 cutoff 도과)
- `giftAmount: 500M` · `giftTaxBase: 500M` · `giftTaxPaid: 0`
- `beneficiaryType: "corporate"` · `corporateGiftComputedTax: 100M`

**검증 패턴**: baseline 동치 — `const baseline = calcInheritanceTax(EXAMPLE_INPUT)` + `const augmented = calcInheritanceTax(modifiedInput)` 호출 후 4필드 양쪽 `===` 동치 비교.

| 검증 항목 | 기대 (baseline === augmented) |
|---|---|
| `priorGiftAggregated` | 동일 (cutoff 도과 제외) |
| breakdown ceiling 라인 amount | 동일 |
| `corporateExemption?.amount ?? 0` | 동일 |
| `finalTax` | 동일 |

→ A·B 양쪽 동기 cutoff 검증. baseline TBD 값을 미리 측정할 필요 없음 (동치 비교).

### 3.4 CC-03: 영리법인 사전증여만 (상속인 사전증여 0)

EXAMPLE_INPUT.preGiftsWithin10Years를 filter로 corporate만 남기기 (원본 fixture 변경 0).

⚠️ **cascade 영향 사전 안내**: 상속인 사전증여 2건(760M + 1,500M) 제거 시 다음이 자동 재계산됨:
- `spouseGiftTaxBase` (배우자 사전증여 과세표준 분자) → 0으로 변화
- `spouseLegalShareOverride` 미입력이므로 orchestrator 자동 계산 발동 (`inheritance-tax.ts:208~282`) → 배우자 법정상속분 자동 산식 결과 변화 → `spouseDeduction` 변화
- → `rawTotalDeduction` 변화 → `totalDeduction` 변화 → `taxBase`·`computedTax`·`finalTax` cascade

따라서 CC-03 anchor는 Pre-Do로 실측 후 동결값 고정 필수.

| 검증 항목 | 기대 |
|---|---|
| `result.priorGiftAggregated` | **700M** (영리법인 분만) |
| ceiling | **8,225M** (= 8,775 − 500 − max(0, 700 − 650)) |
| breakdown "한도 초과" line | **부재** (cap 미발동 — ceiling 8,225 > rawTotal 변형값) |
| `result.totalDeduction` | rawTotal (Pre-Do — 상속인 사전증여 제거가 spouseLegalShareOverride 자동 계산에 영향) |
| `result.corporateExemption.amount` | §3의2 산식 정확값 (Pre-Do) |

→ A·B 단독 분기 검증 + ceiling 산식 8,225M anchor.

> 모든 변형 시나리오는 `{ ...EXAMPLE_INPUT, preGiftsWithin10Years: [...새 배열] }` spread 패턴 사용. **원본 fixture 변경 금지** — 기존 J-04b/c/d·H 시리즈 anchor 회귀 보호.

## 4. 구현 단계

### 4.1 anchor 추가 위치

`__tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts` — 기존 `describe("[J] 경계값·예외", ...)` 블록 **종료 후** 외부에 신규 `describe("[K] 영리법인 × §24 cross-cutting", ...)` 추가. outer describe(`describe("상속세 종합사례 PDF — 통합 anchor", ...)`) 내부, [J] 블록의 닫는 `});` 다음에 형제 블록으로 배치.

```ts
describe("[K] 영리법인 × §24 cross-cutting", () => {
  it("CC-01: 영리법인 사전증여 700M→1,400M 증액 — A·B 동시 변화", () => { ... });
  it("CC-02: §13 5년 cutoff 도과 영리법인 사전증여 — A·B 양쪽 제외", () => { ... });
  it("CC-03: 영리법인 사전증여만 (상속인 0) — A·B 단독 시나리오 (ceiling 8,225M)", () => { ... });
});
```

### 4.2 baseline 측정 (Pre-Do — 실패 anchor 패턴)

> Pre-Do 중 TBD anchor가 잠시 broken state. 두 옵션:
> - (A) `it.skip()`로 임시 skip → 실측 시 활성화 → 동결 후 `it()` 복원
> - (B) 단일 세션에서 Pre-Do + 동결 + 커밋 연속 (broken state 미커밋)
>
> 권장 = (B). 본 작업은 단일 세션 처리 가능.

각 CC anchor를 작성하되 모든 `expect()` 우변을 `0` (확실히 실패할 값)으로 두고 1회 실행:

```ts
const result = calcInheritanceTax(input);
expect(result.priorGiftAggregated).toBe(0);  // → 실패 메시지에서 실측값 확인
expect(result.corporateExemption?.amount).toBe(0);
expect(result.finalTax).toBe(0);
```

실측값을 design `§3 동결값 표`에 갱신 후 `toBe()` 우변 교체. console.log·process.stdout 사용 금지 (commit에 잔존 위험).

### 4.3 검증 명령

```bash
npx vitest run __tests__/tax-engine/inheritance/comprehensive-case-pdf.test.ts
npx vitest run __tests__/tax-engine/inheritance/
npm run typecheck
npm test
```

## 5. 영향 범위

- **엔진 수정**: 0건
- **타입/UI/API**: 0건
- **테스트 파일**: 1개 (`comprehensive-case-pdf.test.ts`)
- **신규 anchor**: 3건 (CC-01·CC-02·CC-03)
- **14지점**: 전체 N/A
- **회귀 위험**: 0

## 6. Definition of Done

- [ ] Pre-Do: baseline `result.corporateExemption.amount`·`result.finalTax` 측정 + design 동결값 갱신
- [ ] CC-01·CC-02·CC-03 3건 모두 `toBe()` 원단위 PASS
- [ ] 신규 anchor가 §13 5년 cutoff 도과(CC-02) 시 A·B 양쪽 동기 제외 검증
- [ ] CC-03 ceiling 8,225M 산식 주석 명시
- [ ] `npm run typecheck` 0 error
- [ ] `npm test` 0 FAIL
- [ ] 신규 anchor 외 다른 anchor 통과수 변화 0

## 7. 후속 (out of scope)

- [후속-1] CC-04: cap 발동 + 영리법인 증액 동시 시나리오 (rawTotal 강화 + corporate 증액)
- [후속-2] `spouseLegalShareOverride` × `wasCapped` 우선순위 경계 anchor (`inheritance-deduction-limit-phase-d-anchor.plan.md` §7 후속-3)
- [후속-3] 영리법인 다수(N>1) 분배 시나리오 (`corporate-prior-gift-ui` 기존 anchor 보강)
- [후속-4] UI 영리법인 면제 + §24 한도 동시 노출 시 사용자 안내 (`inheritance-tax-ui-senior`)

## 8. 참조

| 항목 | 위치 |
|---|---|
| §24 한도 분자 영리법인 합산 | `lib/tax-engine/inheritance-tax.ts:295~301` |
| §3의2② 면제 영리법인 filter | `lib/tax-engine/inheritance-tax.ts:372~374` |
| §13 5년 cutoff 헬퍼 | `isWithin13Cutoff` (`inheritance-tax.ts:36`) |
| 면제 산식 | `lib/tax-engine/inheritance-corporate-exemption.ts:101~105` |
| 기존 anchor | `comprehensive-case-pdf.test.ts` J-04·J-04b·J-04c·J-04d + comprehensive H 시리즈 |
| baseline fixture | `__tests__/tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture.ts` |
| 법령 | 상증법 §3의2②·§13②·§24 |
| memory 정책 | `feedback_pre_anchor_verification`·`feedback_pdf_example_test_anchoring` |
