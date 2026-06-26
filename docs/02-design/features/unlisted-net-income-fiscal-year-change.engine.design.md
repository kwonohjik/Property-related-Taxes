# 엔진 설계 — 비상장주식 순손익가치: 사업연도 변경·합병 적용방법

> 계획서: `unlisted-net-income-fiscal-year-change.plan.md`
> 대상 엔진: `lib/tax-engine/property-valuation/` (비상장주식 순손익가치)
> 본 문서는 **영역③ 합병 합산 신규 엔진** 중심. 영역①②는 기구현 검증(케이스 인벤토리만).

---

## 1. 케이스 인벤토리 (전 분기 enumerate — 단순→복잡)

| ID | 영역 | 시나리오 | 입력 핵심 | 기대(anchor) | 신규/검증 |
|---|---|---|---|---|---|
| C1 | ① | 사업개시 2019.3.1, 평가 2022.12.31 | 전1~3년 모두 12개월 사업연도(2022·2021·2020) | 연환산 미적용, `{(㉱×3)+(㉰×2)+(㉯×1)}/6` | 검증 |
| C2 | ① | 동, 평가 2022.12.30 | 전3년이 2019(10개월) | 2019연도만 `×12/10` 환산, `{(㉰×3)+(㉯×2)+(㉮×12/10)}/6` | 검증 |
| C3 | ① | 동, 평가 2021.12.31 | 사업개시 3년 미만 | 순자산 단독(§54④ 2호 `lt3y`) | 검증 |
| C4 | ② | 사업연도 변경일 2019.4.1, 평가 2021.3.31 | 전1/2/3년 모두 12개월 | 환산 불필요 | 검증 |
| C5 | ② | 동, 평가 2021.3.30 | 전2년 사업연도가 3개월짜리(19.1.1~3.31) | 해당 연도 `×12/3` 환산 | 검증 ⚠️PDF 재대조 |
| C6 | ② | 동, 평가 2021.4.30 | 전1/2/3년 모두 12개월 | 환산 불필요 | 검증 ⚠️PDF 재대조 |
| A-1 | ③ | 사례㉮ 동일 사업연도 합병 | 합병법인+피합병 연도별 주식수·순손익 | 1주당 33/83/200 → 가중평균 **133** | 신규 |
| A-2 | ③ | 사례㉯ 다른 사업연도 합병(월수 안분) | A 12월말·B 6월말, 합병 2020.6.30 | 순손익액 전2년 **350**·전3년 **450** | 신규 |
| A-3 | ③ | 사례㉰ 1:0.5 합병비율 | 합병후 15,000주, 갑·을 동일 사업연도 | 1주당 2,800/1,666/2,000 → **@2,288** | 신규 |
| A-0a | ③ | 피합병 소멸 연도(㉮ 2007) | 그 역년과 겹치는 targetFiscalYear 없음 | overlap=0 → 합병법인 단독, acq.shares | 신규 |
| A-0b | ③ | 합병 전 합병법인만 존재(㉰ 2019) | 겹치는 targetFiscalYear 없음 | overlap=0 → 합병법인 단독, acq.shares(10,000) | 신규 |

> C5·C6은 이미지39 동그라미(㉮~㉳) 귀속이 OCR 불확실 → **Do 전 PDF 원본 재대조 필수**(메모리 `feedback_pdf_table_row_one_to_one_mapping`). 미확정 표기.

---

## 2. 입력/결과 타입 (신규)

### 2.1 입력 — `lib/tax-engine/types/merger-net-income.types.ts`
> 재설계(검토 6-1·6-2): `sameFiscalYear` 플래그 제거. target은 역년별이 아니라 **피합병 사업연도 전체 목록**(한 역년에 복수 사업연도가 걸칠 수 있음 — 사례㉯). 동일 사업연도(㉮㉰)는 overlap=12개월으로 단일 알고리즘이 자연 흡수.
```ts
export interface MergerAcquirerYear {       // 합병법인 전1/2/3년
  shares: number;            // 해당 사업연도 종료일 발행주식총수(>0) — 합병 전 단독연도 주식수
  netIncome: number;         // 순손익액(총액, 음수 허용 — 통산)
  startDate: Date;           // 합병법인 사업연도 범위(overlap 계산 — 필수)
  endDate: Date;
}
export interface MergerTargetYear {         // 피합병법인 사업연도(개수 가변)
  netIncome: number;         // 순손익액(총액, 음수 허용)
  startDate: Date;           // 안분 overlap 계산 — 필수
  endDate: Date;
}
export interface MergerNetIncomeContext {
  mergerRegistrationDate: Date;
  acquirer: [MergerAcquirerYear, MergerAcquirerYear, MergerAcquirerYear]; // 전1/2/3년
  targetFiscalYears: MergerTargetYear[];   // 피합병 전체 사업연도(소멸/합병전 미존재 연도는 그냥 목록에 없음)
  postMergerShares: number;                // 합병후 발행주식총수(§56③)
}
// UnlistedStockValuationInput 에 추가
mergerContext?: MergerNetIncomeContext;
```

### 2.2 결과 echo — `UnlistedStockValuationResult` 확장 (echo-field-pattern)
```ts
mergerApplied?: boolean;
mergerPerShareNetIncome?: [number, number, number];   // 합병 합산 후 연도별 1주당
mergerYearBreakdown?: [MergerYearEcho, MergerYearEcho, MergerYearEcho]; // 연도별 합산근거
// MergerYearEcho: { acquirerNetIncome, targetApportioned, combinedNetIncome, sharesUsed, perShare }
```
> 엔진 산식 변경 0 — echo만 추가. 회귀 위험 최소(메모리 `feedback_engine_result_display_drift` 자기일관 anchor).

---

## 3. 알고리즘 — `lib/tax-engine/property-valuation/merger-net-income.ts`

**단일 통합 알고리즘**(검토 6-2 — ㉮㉯㉰ 분기 없음):
```
computeMergerPerShareNetIncome(ctx): { perShare: [n,n,n], combined: [n,n,n], breakdown: [...] }

for yearIdx in 0..2:
  acq      = ctx.acquirer[yearIdx]
  acqRange = [acq.startDate, acq.endDate]                  // 합병법인 사업연도 범위

  // 피합병 각 사업연도가 이 역년과 겹치는 개월수만큼 안분 합산
  targetSum  = Σ over tg in ctx.targetFiscalYears:
                 safeMultiplyThenDivide(tg.netIncome, overlapMonths(tg, acqRange), 12)
  hasOverlap = ctx.targetFiscalYears.some(tg => overlapMonths(tg, acqRange) > 0)

  combined = acq.netIncome + targetSum                     // 음수 통산(주석3) — 절단 없음
  shares   = hasOverlap ? ctx.postMergerShares : acq.shares // 겹침有=합병후총수(주석2), 無=합병전 단독연도 주식수(주석4)
  perShare = Math.floor(combined / shares)                  // 음수 1주당도 그대로(가중평균서 최종 음수0)

return { perShare, combined, breakdown }
```
- 동일 사업연도(㉮㉰)는 overlap=12 → `×12/12` = 피합병 순손익 전액 합산(자연 흡수). 합병 후 피합병이 이미 acq에 포함된 연도는 targetFiscalYears에 그 기간이 없으므로 overlap=0 → 안분 0(주석1, 연환산도 자동 skip).
- 헬퍼: `safeMultiplyThenDivide`(`lib/tax-engine/tax-utils.ts:104`), `overlapMonths`는 `monthsBetween`(`fiscal-year-annualize.ts:28`) 재사용.

**핵심 규칙(PDF 주석 동결):**
1. (주석1) 합병일이 속한 피합병 사업연도가 1년 미만으로 **합병 후부터 합병법인에 합산** → 연환산 제외. 전1년(합병 완료 후 역년)은 target 안분 0.
2. (주석2/§56③) 합병 후 연도 주식수 = `postMergerShares`. 합병 전 합병법인 단독 연도는 `acquirer[i].shares`.
3. (주석3) 피합병 결손금은 0으로 보지 않고 **acquirer 이익과 통산**(음수 유지). 음수0 절단은 **최종 `calcWeightedAvg3y`에서만**.
4. (주석4) 합병 전 연도(피합병 미존재)는 합병법인만으로 계산, 합병법인 그 해 주식수 기준.

**정수연산**: `floorDiv = Math.floor(combined / shares)` — 단, combined 음수 시 floor 방향 주의(음수 1주당은 가중평균서 0 처리되므로 floor 허용). 월수 안분 `safeMultiplyThenDivide(netIncome, overlapMonths, 12)`, 분자 초과 시 BigInt(`bigint-round-half-up`). 1원 toleranc.

### overlapMonths(targetFy, acqRange)
피합병 사업연도 `targetFy(start~end)` 와 합병법인 역년 `acqRange(start~end)` 의 겹치는 캘린더 개월수.
`const s = max(targetFy.start, acqRange.start); const e = min(targetFy.end, acqRange.end); return e < s ? 0 : monthsBetween(s, e, {floorToOne:false});`

**A-1 검증** (㉮, targetFiscalYears=[을2005(2005.1.1~12.31,△50,000), 을2006(2006.1.1~12.31,△75,000)]; 을2007 소멸→목록 없음):
- 2005역년: overlap(을2005)=12 → △50,000 전액. combined=100,000−50,000=50,000. hasOverlap=true→1,500. `floor(50,000/1,500)=33` ✓
- 2006역년: combined=200,000−75,000=125,000 /1,500 = `83` ✓
- 2007역년: overlap 모두 0 → combined=300,000, shares=acq2007.shares=1,500 → `200` ✓
- 가중평균 `(200×3+83×2+33×1)/6 = 799/6 = 133` ✓

**A-2 검증** (㉯, targetFiscalYears=[B(2019.7.1~2020.6.30,100), B(2018.7.1~2019.6.30,400)]):
> ㉯는 주식수 미제공 → anchor는 **combined(순손익액) 레벨**(350·450). perShare 미검증.
- 전1년 2021역년: overlap 둘다 0 → combined=600(A만) ✓
- 전2년 2020역년: B(100)∩2020(1~6=6)=50; B(400)∩2020=0. combined=300+50=**350** ✓
- 전3년 2019역년: B(100)∩2019(7~12=6)=50; B(400)∩2019(1~6=6)=200. combined=200+250=**450** ✓

**A-3 검증** (㉰, targetFiscalYears=[을2021(2021.1.1~12.31,2,000,000), 을2020(2020.1.1~12.31,△5,000,000)]; 을2019 미존재):
- 2021역년: overlap(을2021)=12 → 2,000,000. combined=40,000,000+2,000,000=42,000,000. hasOverlap→15,000. `floor(/15,000)=2,800` ✓
- 2020역년: overlap(을2020)=12 → △5,000,000 통산. combined=25,000,000 /15,000 = `1,666` ✓
- 2019역년: overlap 0 → combined=20,000,000, shares=acq2019.shares=10,000 → `2,000` ✓
- 가중평균 `(2800×3+1666×2+2000×1)/6 = 13,732/6 = 2,288` ✓

---

## 4. orchestrator 통합 — `unlisted-orchestrator.ts`

```
// line 130 직전 분기 삽입
if (input.mergerContext) {
  const merger = computeMergerPerShareNetIncome(input.mergerContext);
  perShareForWeighted = merger.perShare;       // 연환산 분기 SKIP(주석1 — 안분에 월할 내재)
} else {
  perShareForWeighted = annualizedPerShare;    // 기존 §17의3② 연환산 경로
}
const weightedNetIncomePerShare = calcWeightedAvg3y(perShareForWeighted);  // 단일 진실 유지
```
- 영업권용 `companyWeighted`(line 177-179): 합병 시 *총액* 가중평균 입력도 합산 반영 필요 →
  §3가 반환하는 `merger.combined[]`(연도별 합산 순손익액 총액)를 **그대로 재사용**(중복 산출 금지, 검토 8-1). **Do에서 영업권 anchor로 확인**(미확정 — 영업권 PDF 사례 없으면 SCOPE 보류 후보).

---

## 5. 동기화 지점 매핑 (8지점, 영역③)

| # | 지점 | 위치 | 신규 작업 |
|---|---|---|---|
| ① 폼 | `UnlistedStockV2Card.tsx` 상태 | `mergerForm` 서브상태 |
| ② initial | 동 initial | `mergerContext` 미설정(OFF) |
| ③ normalize | `normalize-restored-form-dates.ts` | merger Date 3종 재수화 |
| ④ 변환 | `lib/calc/` 클라→엔진 | passthrough(API 미경유) |
| ⑤ 위젯 | 신규 `MergerNetIncomeBlock.tsx` | sameFiscalYear 토글·연도 카드 |
| ⑥ 사이드바 | summary | 합산 1주당 echo |
| ⑦ 결과 | `PerShareValuationResultCard.tsx` | `mergerYearBreakdown` 명세 카드 |
| ⑧ validate | `inheritance-validate-unlisted.ts` | 필수필드·UI↔validate 정합 |

---

## 6. 미확정(Do 전 해소 — 추정 금지)
- C5/C6 동그라미 귀속 → PDF 원본 재대조
- 영업권 companyWeighted 합병 합산 필요성 → 영업권 anchor 확인, 없으면 보류 명시
- 소멸/합병전 연도 주식수 분기(A-0a/A-0b) → `hasOverlap=false` 경로로 통합 해결, 엔진 anchor로 고정
- 음수 1주당 floor 방향이 가중평균 음수0 처리와 충돌 없는지 → A-1·A-3은 연도별 combined가 모두 양수라 직접 anchor 없음. **음수 combined 1주당 발생 시 floor 처리 case를 별도 단위테스트로 추가**(PDF 부재 → 자기일관 anchor)
