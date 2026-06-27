# 엔진 설계 — 비상장주식 추정이익 산출방법 정교화 (상증령 §56② / 구증권공시세칙 6)

> 계획서: `docs/00-pm/unlisted-stock-estimated-profit-calculation-56-2.plan.md`
> 대상 엔진: `lib/tax-engine/property-valuation/estimated-profit-section-56-2.ts`
> 연동 파일: `lib/tax-engine/property-valuation/unlisted-orchestrator.ts`
> 작성일: 2026-06-27 · 법령 검증: KoreanLaw MCP (mst=283637 상증령 / mst=284609 상증규)

---

## 0. Context — 현행 구현 상태와 이번 범위

### 0-1. 현행 구현 (Do 전 실측 완료)

- **엔진**: `estimated-profit-section-56-2.ts` (125줄) — `applyEstimatedProfit(input, capRate)` 완성
  - §56② 4요건 AND 검증 (`hasTwoAgencies && proceduralOk`)
  - 추정이익 평균가액 = `floor(Σ agencyEstimates / n)`
  - 순손익가치 = `floor(평균가액 / capRate)`
  - `EstimatedProfitReasonCode` 7종 (1호 삭제), `ESTIMATED_PROFIT_REASON_LABEL` Record
- **오케스트레이터 통합**: `unlisted-orchestrator.ts` STEP 5.5 (line 160~171) — applied=true 시 `netIncomePerShare` 대체, §59③ 영업권 준용
- **기존 테스트**: `estimated-profit-section-56-2.test.ts` — EP-1~EP-9-3 총 16 anchor 통과
- **Zod 스키마**: `unlisted-stock-valuation-v2.schema.ts:197~213` — `estimatedProfit` optional 객체, `agencyEstimates.length < 2` superRefine
- **UI**: `EstimatedProfitToggle.tsx` (280줄) — ToggleCard(violet) + RadioCardGroup(7사유) + CurrencyInput[] + 절차 3요건 chip

### 0-2. 이번 1차 구현 범위 (계획서 §1 확정)

| Phase | 영역 | 내용 | 상태 |
|-------|------|------|------|
| B | D·E | 평가기관 메타(`agencies`) + 시점 안내(현행/구법) | **1차 구현** |
| A | — | 자본환원율 "차입금×1.5" — 1차 출처(구증권공시세칙 수익가치용) 미확정 | **보류** |
| C | B·C | 구법 연도별 주당추정이익 산식 + 3:2 가중평균 | **deferred** |
| D | 양도세 | §165④ 추정이익 갈음 명문 근거 부재 | **스코프 제외** |

---

## 1. 법령 근거 (KoreanLaw MCP 검증 2026-06-27)

### 1-1. 상증령 §56② 4요건 (mst=283637, 시행 2026-02-27 — 현행)

```
§56② 본문: "제1항에도 불구하고 다음 각 호의 요건을 모두 갖춘 경우에는 제54조제1항에 따른
           1주당 최근 3년간의 순손익액의 가중평균액을 재정경제부령으로 정하는 신용평가전문기관,
           공인회계사법에 따른 회계법인 또는 세무사법에 따른 세무법인 중 둘 이상의 신용평가전문기관,
           공인회계사법에 따른 회계법인 또는 세무사법에 따른 세무법인이 재정경제부령으로 정하는
           기준에 따라 산출한 1주당 추정이익의 평균가액으로 할 수 있다."

  1호: 일시적이고 우발적인 사건으로 최근 3년간 순손익액이 증가하는 등 재정경제부령 정하는 경우
       (→ 상증규 §17의3① 2~8호)
  2호: 법 §67·§68 신고기한까지 1주당 추정이익의 평균가액 신고
  3호: 산정기준일·평가서작성일이 신고기한 이내
  4호: 산정기준일·상속개시일 또는 증여일이 같은 연도
```

### 1-2. 상증규 §17의3① 사유 (mst=284609, 시행 2026-03-20 — 현행)

```
1호: 삭제
2호: 자산수증이익등 가중평균 > (법인세차감전손익 − 자산수증이익등) 가중평균 × 50%
3호: 평가기준일 전 3년 기간 중 합병·분할 또는 주요 업종 변경
4호: 법 §38 합병증여이익 산정 위한 합병당사법인 주식가액 산정
5호: 최근 3개 사업연도 중 1년 이상 휴업
6호: 유가증권·유형자산 처분손익 + 자산수증이익등 가중평균 > 법인세차감전손익 가중평균 × 50%
7호: 주요 업종 정상 매출발생기간 3년 미만
8호: 2~7호 유사 재정경제부장관 고시 사유
```

### 1-3. 상증규 §17의3③ — 신용평가전문기관 정의 (검증 완료)

```
"자본시장과 금융투자업에 관한 법률 제335조의3에 따라 신용평가업인가를 받은 자"
→ 법령 상수: VALUATION.UNLISTED_ESTIMATED_AGENCY_TYPE = "상증규 §17의3③"  (신규 추가)
```

### 1-4. 상증규 §17의3④ — 추정이익 평균가액 정의 (검증 완료)

```
"자본시장과 금융투자업에 관한 법률 시행령 제176조의5제2항에 따라 금융위원회가 정한
 수익가치에 영 제54조제1항에 따른 순손익가치환원율을 곱한 금액"

→ 추정이익 평균가액 = 수익가치(금융위 기준) × capRate(10%)
→ §56① 대입 시: (수익가치 × 10%) ÷ 10% = 수익가치  ← 환원율 상쇄 확인
→ orchestrator capRate = 상증규 §17의 연 10% 고정값 유지 필수 (변경 금지)
```

### 1-5. 산출방법 개정 임계 날짜 (확인 필요)

```
계획서 §0-3, 자료③③④⑤ (교재 이미지 기반):
  현행 (~2012.12.6 이후): 현금흐름할인모형·배당할인모형 등 미래 수익가치 산정 모형
  구법 (2012.12.5 이전): 연도별 주당추정이익 산식(B) + 1차·2차 3:2 가중평균(C)

⚠️ 임계 날짜 2012-12-06 출처: 구 증권공시세칙 6 부칙 — KoreanLaw MCP 검증 미완료
   (구 세칙 폐지로 현행 DB 조회 불가 추정).
   → 엔진에서 차단 아닌 '안내'로만 사용 (영향: UI 배지 표시만)
```

---

## 2. ★ 케이스 인벤토리 (1차 범위: D·E)

**기존 EP 케이스 (회귀 보호 — 변경 없음):**

| # | 시나리오 | 기대값 | 상태 |
|---|---------|--------|------|
| EP-1 | 2기관 평균 1,200 ÷ 0.10 = 12,000 | `toBe(12_000)` | 통과(기존) |
| EP-2 | orchestrator 갈음 netIncomePerShare=12,000 | `toBe(12_000)` | 통과(기존) |
| EP-3 | 기관 1개 → applied=false | warning "둘 이상" | 통과(기존) |
| EP-4 | 절차요건 false → applied=false | warning "절차 요건" | 통과(기존) |
| EP-5 | 영업권 §59③ 준용 — weightedAvg3y = 1,200×50,000 | `toBe(60_000_000)` | 통과(기존) |
| EP-6 | 음수 평균 → 0 미강제, 80% 하한 발동 | `netAssetFloorApplied=true` | 통과(기존) |
| EP-7 | Zod refine — 기관 1개 → parse 실패 | `.issues` 포함 | 통과(기존) |
| EP-8 | reasonCode 7종 라벨 모두 존재 | Record 완전 | 통과(기존) |
| EP-9-1~3 | 영업권 ON/OFF 비교, 3년결손 배제 | 상이·goodwill=0 | 통과(기존) |

**신규 DE 케이스 (1차 구현):**

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| DE-1 | `agencies` 미입력 + agencyEstimates 2개 → agencyMeta echo 없음 | §56② 하위호환 | 자기일관 | `estimated-profit-section-56-2.test.ts` | ☐ TODO |
| DE-2 | `agencies` 2개 + agencyEstimates 2개, length 일치 | §17의3③ | 자기일관 | 동상 | ☐ TODO |
| DE-3 | `agencies` 3개 + agencyEstimates 2개, length 불일치 | 정합 검증 | 자기일관 | 동상 | ☐ TODO |
| DE-4 | AgencyType 혼합(신평 1 + 회계 1) → applied=true | §56② "둘 이상" | §56② 본문 | 동상 | ☐ TODO |
| DE-5 | `valuationDate=2012-12-05` → evaluationMethod="legacy", warning | 구법 임계 | 교재 이미지(확인 필요) | 동상 | ☐ TODO |
| DE-6 | `valuationDate=2012-12-06` → evaluationMethod="current" | 현행 임계 | 교재 이미지(확인 필요) | 동상 | ☐ TODO |
| DE-7 | `valuationDate` 없음 → evaluationMethod undefined | 시점 미확인 | 자기일관 | 동상 | ☐ TODO |
| DE-8 | orchestrator 통합 — evaluationDate 주입 후 result.estimatedProfitResult.evaluationMethod 도출 | 연동 | 자기일관 | 동상 | ☐ TODO |
| DE-R | 회귀 — EP-1~EP-9-3 16건 모두 불변 | 회귀 방어 | EP 기존 anchor | 동상 | ☐ TODO |

---

## 3. 엔진 input 타입 변경

### 3-1. 신규 AgencyMeta 타입 (estimated-profit-section-56-2.ts 추가)

```ts
/** §56② + §17의3③ — 평가기관 유형 코드 */
export type AgencyType =
  | "credit_rating"  // 신용평가전문기관 (자본시장법 §335의3 인가)
  | "accounting"     // 공인회계사법에 따른 회계법인
  | "tax";           // 세무사법에 따른 세무법인

/** 평가기관 메타 (optional, agencyEstimates 정합 검증용) */
export interface AgencyMeta {
  type: AgencyType;
  name: string;  // 기관명 (임의 문자열, 엔진 산식 무관)
}
```

### 3-2. EstimatedProfitInput 확장 (신규 optional 필드 1개)

```ts
export interface EstimatedProfitInput {
  reasonCode: EstimatedProfitReasonCode;
  agencyEstimates: number[];            // 기존 — 1주당 추정이익 (환원 전)
  filedWithinDeadline: boolean;         // 기존
  baseDateAndReportWithinDeadline: boolean; // 기존
  sameYearAsInheritanceOrGift: boolean; // 기존

  // --- Phase D·E 신규 (optional, 엔진 산식 무관) ---
  /** 평가기관 메타 (optional) — agencyEstimates와 1:1 대응 권장, 불일치 시 warning만 */
  agencies?: AgencyMeta[];
}
```

### 3-3. applyEstimatedProfit 시그니처 변경 (optional 3번째 파라미터)

```ts
/**
 * §56② 추정이익 갈음 적용 판정 + 1주당 순손익가치 산출.
 *
 * @param input    추정이익 입력 (§56② 4요건 + 기관 메타)
 * @param capRate  §54① 순손익가치환원율 (상증규 §17 = 연 10% 고정)
 * @param evaluationDate  평가기준일 (orchestrator 주입 — 현행/구법 안내용, 차단 아님)
 */
export function applyEstimatedProfit(
  input: EstimatedProfitInput,
  capRate: number,
  evaluationDate?: Date,
): EstimatedProfitResult
```

> 🟢 **명명 정합 (residual)**: 3번째 파라미터명을 `evaluationDate`로 **통일**(orchestrator 주입 `input.evaluationDate`(types.ts:146)·DE-8 anchor와 동일 식별자). 본 설계서 본문/테스트의 `valuationDate` 표기는 모두 `evaluationDate`(평가기준일)와 동일 개념 — 구현 시 식별자는 `evaluationDate`로 단일화한다.

**하위 호환성**: 기존 2-인자 호출(`applyEstimatedProfit(input, capRate)`)은 `evaluationDate=undefined` → `evaluationMethod=undefined`로 자연 통과.

---

## 4. 엔진 result 타입 변경

```ts
export interface EstimatedProfitResult {
  // --- 기존 필드 (변경 없음) ---
  applied: boolean;
  estimatedProfitAverage: number;
  perShareIncomeValue: number;
  reasonCode?: EstimatedProfitReasonCode;
  agencyCount: number;
  warnings: string[];

  // --- Phase D·E 신규 필드 ---
  /** 평가기관 메타 echo (input.agencies 그대로) */
  agencyMeta?: AgencyMeta[];
  /** 산출방법 구분 — valuationDate 기준 (차단 아님, UI 안내용) */
  evaluationMethod?: "current" | "legacy";
  /** 산출방법 안내 텍스트 */
  evaluationMethodNote?: string;
}
```

---

## 5. 계산 알고리즘 (Phase D·E 추가 로직)

### 5-1. agencies 정합 검증 (warning, 차단 아님)

```
if (input.agencies !== undefined && input.agencies.length !== agencyCount) {
  warnings.push(
    `기관 메타 수(${input.agencies.length})와 추정이익 수(${agencyCount})가 다릅니다. 기관별 1:1 입력을 확인하세요.`
  );
}
```

### 5-2. 시점 분기 안내 (임계 날짜 = 2012-12-06, 확인 필요)

```
const LEGACY_LAW_THRESHOLD = new Date("2012-12-06");
// ⚠️ 구 증권공시세칙 6 부칙 기반 (KoreanLaw 검증 미완료) — 안내 전용, 차단 금지

let evaluationMethod: "current" | "legacy" | undefined;
let evaluationMethodNote: string | undefined;

if (valuationDate !== undefined) {
  if (valuationDate < LEGACY_LAW_THRESHOLD) {
    evaluationMethod = "legacy";
    evaluationMethodNote =
      "평가기준일이 2012.12.5 이전입니다. 구법(연도별 주당추정이익 산식 + 3:2 가중평균)이 적용될 수 있습니다. 산출 내역을 세무사에게 확인하세요.";
    warnings.push("[시점 안내] " + evaluationMethodNote);
  } else {
    evaluationMethod = "current";
    evaluationMethodNote =
      "평가기준일이 2012.12.6 이후입니다. 현금흐름할인모형·배당할인모형 등 미래 수익가치 산정 모형을 적용한 1주당 추정이익을 입력하세요.";
  }
}
```

### 5-3. agencyMeta echo

```
// 결과 조립 시:
agencyMeta: input.agencies,
```

### 5-4. 기존 산식 — 변경 없음 (하위 호환)

```
기존 핵심 산식 (유지):
  estimatedProfitAverage = floor(Σ agencyEstimates / agencyCount)
  perShareIncomeValue    = floor(estimatedProfitAverage / capRate)
  applied                = hasTwoAgencies && proceduralOk
```

---

## 6. orchestrator 통합 변경 (unlisted-orchestrator.ts)

STEP 5.5 호출부에 `input.evaluationDate` 주입:

```ts
// 변경 전 (line 163):
estimatedProfitResult = applyEstimatedProfit(input.estimatedProfit, capRate);

// 변경 후:
estimatedProfitResult = applyEstimatedProfit(
  input.estimatedProfit,
  capRate,
  toOptionalDate(input.evaluationDate) ?? input.evaluationDate,  // 현행/구법 산출방법 시점 안내용 — 임계일 출처 '구 증권공시세칙 6 부칙'(확인 필요)
);
```

`toOptionalDate`는 이미 `import { toDate, toOptionalDate } from "@/lib/api/date-coerce"` 로 import 됨.

---

## 7. 법령 상수 추가 (inheritance-gift.ts VALUATION 객체)

> 🟠 **정정 (residual — dead constant 방지, Simplicity First)**: 상수는 **실제 소비처가 있을 때만** 추가한다. 1차 범위(D·E)의 소비처를 아래에 명시:
> - `UNLISTED_ESTIMATED_AGENCY_TYPE` → **소비처 있음**: ⑤/⑦ 평가기관 메타(E) 표시 시 `LawArticleModal` 법 링크 + `appliedRules` 인용 문자열에 사용. **1차 추가.**
> - `UNLISTED_ESTIMATED_INCOME_FORMULA` → **소비처 없음(1차)**: 추정이익 산식 인용(B·C)에 쓰이나 B·C는 deferred. 1차에 소비처가 없으므로 **B·C 착수 시 함께 추가(보류)** — 지금 정의하면 dead constant.

```ts
// 기존 VALUATION.UNLISTED_ESTIMATED_INCOME_OPTION 옆에 추가
/** 상증규 §17의3③ — 신용평가전문기관 = 자본시장법 §335의3 신용평가업인가를 받은 자.
 *  소비처: ⑤/⑦ 평가기관 메타(E) law 링크·appliedRules 인용 */
UNLISTED_ESTIMATED_AGENCY_TYPE: "상증규 §17의3③",

// 🟠 UNLISTED_ESTIMATED_INCOME_FORMULA(상증규 §17의3④)는 B·C(deferred) 착수 시 추가 — 1차 소비처 없어 보류
```

---

## 8. 14개 동기화 지점 매핑 (Phase D·E)

> 신규 필드: `agencies?: AgencyMeta[]` (입력), `agencyMeta`/`evaluationMethod`/`evaluationMethodNote` (결과)
> 모두 optional → TS strict 모드에서 누락 시 엔진 호출에서 undefined 전달, silent strip 없음
> ⑫⑬⑭ 특히 주의 (TS 미감지 — grep 자가 점검 필수)

| # | 지점 | 위치 | 변경 내용 |
|---|------|------|----------|
| ① 폼 상태 | 상속·증여 비상장 폼 store | `agencies?: AgencyMeta[]` 추가 |
| ② initial | `estimatedProfit` 초기값 | `agencies: undefined` 추가 |
| ③ normalize | `components/calc/inheritance/normalize-restored-form-dates.ts` | `agencies` passthrough — **Date 필드 없어 신규 normalize 코드 불필요**(기존 `evaluationDate`만 `toOptionalDate`, line 98). |
| ④ API 변환 | **lib/calc 변환 부재** | 🔴 **정정**: 비상장 V2는 `lib/calc` 변환을 거치지 않음(`estimatedProfit` grep 0건). `UnlistedStockV2Card.tsx:321`에서 input 직접 구성 → `EstateItem` 객체 통째 직렬화. ④는 별도 변환 함수 없음 — `agencies`는 EstateItem에 포함되어 자동 전달. |
| ⑤ UI 위젯 | `EstimatedProfitToggle.tsx` | 기관 유형 선택 + 시점 배지 (UI 시니어 담당) |
| ⑥ 사이드바 | summary | 변경 없음 — **D·E 신규 필드는 산식 무관**(`estimatedProfitAverage`·`perShareIncomeValue` 불변)이므로 평가액 합계 변동 없음(plan §4 ⑥의 '합계 반영'은 기존 estimatedProfit 적용 동작을 지칭). |
| ⑦ 결과 카드 | `PerShareValuationResultCard.tsx:103~109` **+ `BesshiForm4Buppyo3PrintView.tsx`** | agencyMeta echo + evaluationMethod 배지 (UI 시니어 담당). **별지 부표3 인쇄뷰**: 법정 서식이라 agencyMeta/evaluationMethod **미표시**(법정 칸 외 메타 비표시 근거 — 표시 불필요). |
| ⑧ validation | `inheritance-validate-unlisted.ts` | `agencies` optional — fallback 동기화 불필요 |
| ⑨ Zod enum 메인 | `unlisted-stock-valuation-v2.schema.ts` | `estimatedProfit.agencies` optional 배열 추가 (AgencyType enum) |
| ⑩ Zod 컴패니언 | 해당 없음 | — |
| ⑪ Date fallback | 해당 없음 | agencies는 string 필드 |
| **⑫ Zod 입력 정의** | `unlisted-stock-valuation-v2.schema.ts:197~213` | `agencies?: z.array(...)` 신규 (`name: z.string()` 비차단). `estate-item-schema.ts:260` `unlistedStockValuationV2` 재사용으로 전파 — **단일 점검 지점** **★TS 미감지** |
| **⑬ body spread** | **명시 변환 없음** | 🔴 **정정**: `lib/calc` 변환 부재 → `estate-item-schema.ts:260` `EstateItem` 객체 통째 전달로 `agencies` 자동 포함(strip 위험 낮음 — 객체 통째 직렬화). ⑫(schema) 추가로 충분. **★TS 미감지** |
| **⑭ Route 매핑** | **명시 매핑 없음** | 🔴 **정정**: route handler 명시 매핑 없음 — `estate-item-schema` Zod parse 후 엔진 통째 전달(`evaluateUnlistedStockV2` 클라이언트 직접 호출 경로). ⑫ schema가 단일 전파점. **★TS 미감지** |

---

## 9. Zod 스키마 변경 (⑫ — TS 미감지 필수 점검)

`unlisted-stock-valuation-v2.schema.ts:197~213` 확장:

```ts
estimatedProfit: z
  .object({
    reasonCode: z.enum([
      "asset_receipt_50pct",
      "merger_split_business_change",
      "merger_gift_section38",
      "closure_over_1yr",
      "disposal_gain_50pct",
      "sales_period_under_3yr",
      "similar_notified",
    ]),
    agencyEstimates: z.array(z.number().finite()),
    filedWithinDeadline: z.boolean(),
    baseDateAndReportWithinDeadline: z.boolean(),
    sameYearAsInheritanceOrGift: z.boolean(),
    // Phase D·E 신규
    agencies: z
      .array(
        z.object({
          type: z.enum(["credit_rating", "accounting", "tax"]),
          name: z.string(),  // min(1) 금지 — 빈 기관명 비차단(엔진 warning만). UI ⑫·§6/§8과 통일 (CLAUDE.md ⑧)
        }),
      )
      .optional(),  // optional — 기존 agencyEstimates와 별도 검증
  })
  .optional(),
```

기존 superRefine(agencyEstimates.length < 2) 유지 — agencies.length 검증은 엔진 warning으로만 처리 (차단 아님, UI 입력 편의 우선).

---

## 10. Silent fallback / 자동 안분 후보

- `agencies` 미입력 시 agencyMeta=undefined → warning 없음 (완전 optional, 기존 동작 유지)
- `valuationDate` 미입력 시 evaluationMethod=undefined → 시점 안내 없음 (차단 아님)
- `agencies.length !== agencyEstimates.length` → warning만, applied 판정 변경 없음
- 자동 안분 fallback: 없음 (메모리 `feedback_no_silent_apportion_fallback.md` 준수)

---

## 11. anchor 기대값 상세

**DE-1 (agencies 미입력):**
```ts
const r = applyEstimatedProfit(epInput(), 0.1);
expect(r.agencyMeta).toBeUndefined();
expect(r.evaluationMethod).toBeUndefined();
// 기존 applied=true, estimatedProfitAverage=1200 불변
```

**DE-2 (agencies 2개, length 일치):**
```ts
const r = applyEstimatedProfit(
  epInput({ agencies: [{ type: "credit_rating", name: "NICE" }, { type: "accounting", name: "삼일회계" }] }),
  0.1,
);
expect(r.agencyMeta).toHaveLength(2);
expect(r.agencyMeta![0].type).toBe("credit_rating");
expect(r.warnings).toEqual([]);  // 정합 → warning 없음
```

**DE-3 (agencies 3개, agencyEstimates 2개 — 불일치):**
```ts
const r = applyEstimatedProfit(
  epInput({
    agencyEstimates: [1_000, 1_400],
    agencies: [
      { type: "credit_rating", name: "NICE" },
      { type: "accounting", name: "삼일" },
      { type: "tax", name: "세무법인ABC" },
    ],
  }),
  0.1,
);
expect(r.warnings.some((w) => w.includes("기관 메타 수") && w.includes("다릅니다"))).toBe(true);
expect(r.applied).toBe(true);  // applied 판정에는 영향 없음
```

**DE-5 (구법 시점, valuationDate=2012-12-05):**
```ts
const r = applyEstimatedProfit(epInput(), 0.1, new Date("2012-12-05"));
expect(r.evaluationMethod).toBe("legacy");
expect(r.warnings.some((w) => w.includes("[시점 안내]") && w.includes("구법"))).toBe(true);
expect(r.applied).toBe(true);  // 시점 안내는 차단 아님
```

**DE-6 (현행 시점, valuationDate=2012-12-06):**
```ts
const r = applyEstimatedProfit(epInput(), 0.1, new Date("2012-12-06"));
expect(r.evaluationMethod).toBe("current");
// evaluationMethodNote = "현금흐름할인모형..." → warning 미발행 (정상 시점)
expect(r.warnings.filter((w) => w.includes("[시점 안내]")).length).toBe(0);
```

**DE-7 (valuationDate 없음):**
```ts
const r = applyEstimatedProfit(epInput(), 0.1, undefined);
expect(r.evaluationMethod).toBeUndefined();
expect(r.evaluationMethodNote).toBeUndefined();
```

**DE-8 (orchestrator 통합 — evaluationDate 주입):**
```ts
const r = evaluateUnlistedStockV2({
  ...baseInput({ evaluationDate: new Date("2012-12-05") }),
  estimatedProfit: epInput(),
});
expect(r.estimatedProfitResult?.evaluationMethod).toBe("legacy");
```

---

## 12. 영향 파일 목록

| 파일 | 변경 내용 | 우선순위 |
|------|----------|---------|
| `lib/tax-engine/property-valuation/estimated-profit-section-56-2.ts` | `AgencyType`, `AgencyMeta` 신규, `EstimatedProfitInput.agencies?`, `EstimatedProfitResult` 3필드 추가, `applyEstimatedProfit` 3번째 파라미터 + 5-1~5-3 로직 | 엔진 선처리 |
| `lib/tax-engine/legal-codes/inheritance-gift.ts` | `VALUATION.UNLISTED_ESTIMATED_AGENCY_TYPE`만 추가(소비처: ⑤/⑦ E 메타). `UNLISTED_ESTIMATED_INCOME_FORMULA`는 B·C deferred 착수 시 추가(보류 — 1차 소비처 없음) | 엔진 선처리 |
| `lib/tax-engine/property-valuation/unlisted-orchestrator.ts` | STEP 5.5 `applyEstimatedProfit` 3번째 파라미터 추가 (1줄) | 엔진 선처리 |
| `lib/validators/unlisted-stock-valuation-v2.schema.ts` | `estimatedProfit.agencies` optional 배열 추가 (⑫) | 엔진 선처리 |
| `__tests__/tax-engine/property-valuation/estimated-profit-section-56-2.test.ts` | DE-1~DE-8, DE-R anchor 추가 | 엔진 선처리 |
| `components/calc/inheritance/unlisted-stock-v2/EstimatedProfitToggle.tsx` | 기관 유형 선택 + 시점 배지 (⑤) | UI 시니어 |
| `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:103~109` | agencyMeta echo(빈 행 필터) + evaluationMethod 배지 (⑦) | UI 시니어 |
| `components/calc/inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView.tsx` | 별지 부표3 — 법정 서식이라 메타 미표시(변경 없음, 누락 방지용 명시) | UI 시니어 |
| 상속·증여 폼 initial/normalize (`①②③`) | `agencies?: undefined` 추가. ③ normalize=`normalize-restored-form-dates.ts` passthrough(Date 없어 코드 불필요) | UI 시니어 |
| ~~`lib/calc/` API 변환 (`④⑬`)~~ | 🔴 **삭제 — 실존 안 함**: V2는 lib/calc 변환 없음. `EstateItem` 통째 전달(`estate-item-schema.ts:260`)로 `agencies` 자동 포함. ⑫(schema)가 단일 점검점 | — |

---

## 13. 미확정 사항 (Do 전 해소 — 추정 금지)

| 항목 | 현황 | 해소 방법 |
|------|------|----------|
| 구법 임계 날짜 2012-12-06 출처 | 교재 이미지 기반, KoreanLaw 검증 불가(폐지된 구 세칙) | 차단 아닌 안내로 사용, 엔진 주석에 "확인 필요" 명시 |
| AgencyType별 이름 정규화 | 엔진에서 name 검증 불필요(UI 자유 입력) | 검증 없음 — 빈 기관명은 엔진 warning(차단 없음), Zod `name: z.string()`(min(1) 없음). UI 설계서 §6/§8과 통일 |
| 구법 B·C 산식 deferred 착수 조건 | "실 사례 1건 확보" | 별도 계획 수립 시 착수 |

---

## 14. 보류·제외 항목

- **Phase A (자본환원율 "차입금 × 1.5")**: 구 증권공시세칙 수익가치용 자본환원율 1차 법령 출처 미확정. §54①/§56① capRate 슬롯 변경 금지. 1차 출처 확정 후 별도 서브계산 레이어로만 도입 가능.
- **Phase C (B·C 구법 산식)**: 실 사례 1건 확보 후 deferred 착수. `agencyEstimates` 단일 소스 유지. 보조계산기 → agencyEstimates 주입 경로로 확정.
- **Phase D (양도세 연결)**: §165④ 자족 규정 — §54~56 미준용. 추정이익 갈음 명문 근거 부재. 스코프 완전 제외.

---

## 15. UI 통합 위임 (UI 시니어 담당)

UI 측 구현 사항은 `unlisted-stock-estimated-profit-calculation-56-2.ui.design.md`에 별도 명세.

엔진 시니어 정의 완료 타입:
- `AgencyType`, `AgencyMeta` — `estimated-profit-section-56-2.ts` export
- `EstimatedProfitInput.agencies?: AgencyMeta[]`
- `EstimatedProfitResult.agencyMeta?: AgencyMeta[]`, `evaluationMethod?: "current" | "legacy"`, `evaluationMethodNote?: string`

UI 시니어 책임 지점: ①②③④⑤⑦⑬⑭ (§9 Zod ⑫는 엔진 시니어 선처리 후 UI merge).
