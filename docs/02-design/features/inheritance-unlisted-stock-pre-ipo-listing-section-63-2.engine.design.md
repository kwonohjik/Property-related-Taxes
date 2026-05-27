# 비상장주식 §63② 기업공개 준비 중 법인 평가 — 엔진 설계 (PR-L)

> **Plan**: `docs/00-pm/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.plan.md`
> **UI**: `inheritance-unlisted-stock-pre-ipo-listing-section-63-2.ui.design.md`
> **선행**: PR-G(§56②)·PR-G2(§59③)·PR-K(§54⑥)·PR-P(§54③). 본 PR은 §63②1호 = 비상장 V2 평가에 **새 평가방법(MAX override)** 추가.
> **법령 검증**: KoreanLaw MCP 2026-05-27 (상증법 mst=276123 §63② / 상증령 mst=283637 §57) — §63②①②③·§63③·§63①1호가목/나목·§57①②③ 전수 직접대조, 인용 오류 0

## Context

기업공개(IPO)를 위해 유가증권신고(또는 거래소 상장신청)를 한 법인의 주식은 **§63②1호 + 상증령 §57①**에 따라 `MAX(공모가격, §54 보충적평가)`로 평가한다. 평가기준일(상속개시일·증여일)이 **[신고일(미신고 시 상장신청일) − 6개월(상속)/3개월(증여), 거래소 상장일 전)** 윈도우 안에 있을 때만 적용된다. 비상장 V2(`evaluateUnlistedStockV2`)는 §54 보충적평가까지만 산출 — 본 PR이 STEP 7(§54④ 최종 1주당 평가액)과 STEP 8(§63③ 할증) 사이에 §63② override를 삽입한다.

**★ 할증 순서 필연성**: §63③ 원문은 "**§1①1호 및 §2에 따라 평가한 가액**에 100분의 20 가산". §63② 결과(§2)에도 §63③ 할증이 적용되므로 순서는 **§54 보충적평가 → §63② MAX override → §63③ 할증**이 산식 구조상 강제(할증 후 override 시 할증 base 누락). [[feedback_korean_law_82_vs_81_2_drift]]

**★ §54⑥ 무오염 필연성**: §54⑥ 평가심의위는 §54 보충적평가의 70~130% 범위로 신청가액을 검증(`evaluation-committee-section-54-6.ts` `validatePerShareRange(supplementary, taxpayer)`). 이 `supplementary`의 법정 기준은 §54 보충적평가이지 §63② MAX가 아니다. ∴ override **전** `supplementaryPerShareValue`를 캡처해 §54⑥에 전달해야 범위 기준이 오염되지 않는다(현행 라인 299는 `finalPerShareValue` 전달 → override 후 오염 위험).

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 | 상태 |
|---|---------|----------|-------------|--------|------|
| 1 | 상속·윈도우 내·공모가>보충적 → appliedValue=공모가 | 법 §63②1호·영 §57①1호 | 손계산 max(20,000,12,000) | PL-1 | ☐ TODO |
| 2 | orchestrator override → finalPerShareValue(할증 전)=공모가, result.applied=true | 영 §57① | evaluateUnlistedStockV2 | PL-2 | ☐ TODO |
| 3 | 공모가<보충적 → MAX=보충적(override 무효과), applied=true·근거 표기 | 영 §57①(큰 가액) | max(8,000,12,000)=12,000 | PL-3 | ☐ TODO |
| 4 | 윈도우 밖(상속 6개월 초과) → withinWindow=false·applied=false·현행 §54 유지 | 영 §57① | 신고일−8개월 | PL-4 | ☐ TODO |
| 5 | 증여 3개월 — 상속이면 포함이나 증여는 윈도우 밖 → applied=false | 영 §57①(증여 3개월) | 신고일−4개월·taxKind=gift | PL-5 | ☐ TODO |
| 6 | 상장 후(listingDate < evaluationDate) → withinWindow=false | 영 §57①(상장 전까지) | listingDate 경계 | PL-6 | ☐ TODO |
| 7 | §63③ 할증 — override값 기준 ×120% | 법 §63③ | 20,000×1.2=24,000 | PL-7 | ☐ TODO |
| 8 | Zod — preIpoListing 정의인데 공모가 0/신고일 누락 → parse 실패 | (검증 정책) | superRefine path | PL-8 | ☐ TODO |
| 9 | §54⑥ 동시 입력 → §54⑥ 범위 = 보충적(12,000) 기준, override(20,000) 무오염 | 영 §54⑥·§57① | lower=8,400·upper=15,600 | PL-9 | ☐ TODO |
| 10 | 순자산단독(liquidation) + §63② override → §54 보충적평가가 순자산단독도 포섭 | 영 §57①2호나목·§54④ | 공모가>순자산 | PL-10 | ☐ TODO |
| 11 | 날짜 string(JSON 경유) 방어 → withinWindow 정상(silent-false 아님) | (date-coerce 정책) | ISO string 전달 | PL-11 | ☐ TODO |
| 12 | 회귀 — preIpoListing 미입력 시 전체 불변(numeric 0 변동) | — | 전체 회귀 | (회귀) | ☐ TODO |

**규칙**: 행≥1 충족. PL-1 RED 선확인([[feedback_pre_anchor_verification]]). PL-11·PL-9·PL-10은 orchestrator 통합 anchor.

---

## 법령 근거

```
법 §63②: 제1항제1호에도 불구하고 각 호 주식은 대통령령 방법으로 평가.
         1호 = 기업공개 목적 유가증권 신고 법인 / 2호 = 협회 등록 신청 / 3호 = 상장법인 증자신주(미상장)
법 §63③: §1①1호 및 §2에 따라 평가한 가액에 100분의 20 가산(최대주주). → §63② 결과에도 할증.
영 §57①: 1호 기간 = 유가증권신고(미신고 시 상장신청) 직전 6개월(증여 3개월)부터 거래소 최초 상장 전까지.
         = MAX(1호 공모가격, 2호 = §63①1호가목 평가액 / 없으면 나목 = §54 보충적평가).
영 §57②: 2호 기간 = 등록신청 직전 6개월(증여 3개월)부터 협회 등록 전까지. (PR-L2)
영 §57③: 3호 = 상장가목 평가액 − 재정경제부령 배당차액. (PR-L3)
```

**본 PR 적용**: §63②1호. 비상장(상장 시세=가목 없음)이므로 §57①2호 = **나목 = §54 보충적평가**. ∴ `appliedValue = MAX(공모가, §54 보충적평가)`. [[feedback_korean_law_82_vs_81_2_drift]]

---

## 엔진 input 타입 (S-1)

`UnlistedStockValuationInput`에 optional 추가:
```ts
preIpoListing?: PreIpoListingInput;   // §63②1호 기업공개 준비 중
```
`PreIpoListingInput`(S-2 신규 모듈, evaluationDate 미포함 — C2):
```ts
export interface PreIpoListingInput {
  publicOfferingPrice: number;     // §57①1호 금융위 기준 공모가격 (1주당)
  securitiesFilingDate: Date;      // 윈도우 anchor — 유가증권 신고일(미신고 시 상장신청일, §57① 단서, C7)
  taxKind: "inheritance" | "gift"; // 6개월(상속) vs 3개월(증여) — 폼 명시 주입 (R-1, 자동추론 금지)
  listingDate?: Date;              // 거래소 최초 상장일 (미입력 = 상장 전)
}
```

## 엔진 result 타입 (S-1)

`UnlistedStockValuationResult`에 optional echo:
```ts
preIpoListingResult?: PreIpoListingResult;   // §63② 적용 여부·MAX 근거 (결과카드 분기)
```
```ts
export interface PreIpoListingResult {
  applied: boolean;            // withinWindow && 공모가>0
  withinWindow: boolean;       // 평가기준일 ∈ [신고일−N개월, 상장 전)
  publicOfferingPrice: number;
  supplementaryValue: number;  // §54 보충적평가 (= 입력 supplementaryPerShareValue, 모든 §54 분기 포섭)
  appliedValue: number;        // MAX(공모가, 보충적)
  windowMonths: 6 | 3;
  warnings: string[];          // 윈도우 밖·공모가 0 등 미적용 사유
}
```

---

## 계산 알고리즘 (단계별)

### S-2 신규 모듈 `pre-ipo-listing-section-63-2.ts` (≤150줄)

```ts
import { subMonths } from "date-fns";   // C5 — windowStart 산출

export function applyPreIpoListing(
  input: PreIpoListingInput,
  supplementaryPerShareValue: number,
  evaluationDate: Date,                 // C2 — V2 최상위 재사용
): PreIpoListingResult {
  const windowMonths: 6 | 3 = input.taxKind === "gift" ? 3 : 6;          // §57①
  const windowStart = subMonths(input.securitiesFilingDate, windowMonths); // C5
  const beforeListing = !input.listingDate || evaluationDate < input.listingDate; // 상장 전까지
  const withinWindow = evaluationDate >= windowStart && beforeListing;     // [신고일−N, 상장 전)
  const applied = withinWindow && input.publicOfferingPrice > 0;
  const appliedValue = applied
    ? Math.max(input.publicOfferingPrice, supplementaryPerShareValue)      // §57① 큰 가액
    : supplementaryPerShareValue;                                          // 미적용 시 현행 §54 유지
  const warnings: string[] = [];
  if (!withinWindow) warnings.push("§63②1호 윈도우 밖 — 현행 §54 보충적평가 유지");
  else if (input.publicOfferingPrice <= 0) warnings.push("공모가격 미입력(≤0) — §63② 미적용");
  return { applied, withinWindow, publicOfferingPrice: input.publicOfferingPrice,
           supplementaryValue: supplementaryPerShareValue, appliedValue, windowMonths, warnings };
}
```

### S-3 orchestrator override (STEP 7 직후, STEP 8 직전)

```ts
// finalPerShareValue 이미 let (라인 199, C4) — 모든 §54 분기 resolve 직후
const supplementaryPerShareValue = finalPerShareValue;   // C3 — §54⑥ 범위 기준 캡처 (override 전)

let preIpoResult: PreIpoListingResult | undefined;
if (input.preIpoListing) {
  preIpoResult = applyPreIpoListing(
    { ...input.preIpoListing,
      // C1 — JSON/sessionStorage 경유 string 방어 (date-coerce)
      securitiesFilingDate: toDate(input.preIpoListing.securitiesFilingDate, "securitiesFilingDate"),
      listingDate: toOptionalDate(input.preIpoListing.listingDate) },
    finalPerShareValue,                                          // §54 보충적평가 (§57①2호나목)
    toOptionalDate(input.evaluationDate) ?? input.evaluationDate, // C2 — V2 최상위
  );
  if (preIpoResult.applied) {
    finalPerShareValue = preIpoResult.appliedValue;              // MAX override
    appliedRules.push("상증법 §63②1호 + 상증령 §57① — 기업공개 준비 중 MAX(공모가, 보충적평가)");
  } else {
    for (const w of preIpoResult.warnings) warnings.push(`[§63②] ${w}`);
  }
}

const premium = calcMaxShareholderPremium({ finalPerShareValue, ... });  // STEP 8 §63③ (override값 기준)
```

§54⑥ 블록(현행 라인 296~305) 인자 교체:
```ts
evaluationCommitteeApplied = applyEvaluationCommittee(input.evaluationCommittee, supplementaryPerShareValue); // C3
```
result echo:
```ts
return { ..., preIpoListingResult: preIpoResult };   // S-1 echo
```

**하류 무변경**: §63③ 할증·`finalPerShareForReporting`·`totalValuation`·`netAssetPerShare`·영업권은 override된 `finalPerShareValue`를 소비(할증)하거나 무관(순자산·영업권). PR-G/G2(추정이익)·§54③·§54⑥과 직교.

> **★ 윈도우 의미론 (DR-1, 오독 방지)**: 윈도우 `[신고일−Nmo, 상장 전)`은 **신고일 이전 N개월 lookback을 포함**한다. §57① "신고일 직전 6개월(증여 3개월)부터 상장 전까지" → 평가기준일이 **신고일보다 앞서도**(예: 사망 4개월 후 회사가 IPO 신고) `신고일−6개월` 이내면 within. "평가기준일 현재 신고를 한 법인"은 *적격 법인* 조건이고, 기간 브래킷은 `[신고일−Nmo, 상장 전)`로 신고 전 구간을 명시 포함(IPO 임박 시점 평가 게이밍 방지 취지). ∴ `evaluationDate < securitiesFilingDate`를 미적용으로 처리하면 **오류** — `evaluationDate >= subMonths(신고일, N)`만 판정.

---

## Silent fallback / 자동 안분 후보 식별

- **override는 `applied=true` 시에만** — 윈도우 밖·공모가≤0이면 현행 §54 그대로(자동 보정 0, [[feedback_no_silent_apportion_fallback]]). 미적용 사유는 warnings로 안내.
- **taxKind 자동추론 금지** — 폼이 상속/증여 명시 주입(R-1). 누락 시 6개월 기본 추론은 증여 과대적용이므로 금지. Zod superRefine로 taxKind enum 강제.
- **날짜 정규화는 비교 직전 1회** — orchestrator override 전 toDate/toOptionalDate(C1). 임의 날짜 생성 아님(`new Date()` 직접 금지).
- **§54⑥ 범위 기준은 supplementaryPerShareValue** — override값으로 대체 금지(C3). 두 평가방법(§54⑥ 메타·§63② override)이 동일 base를 공유하지 않음.
- **§57① "큰 가액"은 법령 산식** — MAX는 임의 유리선택이 아니라 §57① 본문(중복배제 §127 패턴 아님).
- **IPO 중단 시 listingDate 영구 미입력(DR-3)** — 윈도우 상한이 무한 개방되어 §63②이 계속 적용될 수 있음. 엔진은 입력 신뢰(거래소 IPO 일정 자동 조회 없음) — IPO 철회 판단은 사용자 몫, 자동 보정 0. UI 안내로 보완(S-7).

---

## 테스트 약속

- 케이스 인벤토리 12행 → PL-1~11 + 회귀. PL-1 RED 선확인([[feedback_pre_anchor_verification]]).
- PL-1·PL-3·PL-7·PL-9 손계산 원단위 `toBe()`(MAX·할증·범위 경계).
- PL-9: §54⑥ `lower/upper`가 보충적(12,000) 기준임을 `toBe(8400)`·`toBe(15600)`로 고정 — override(20,000) 무오염.
- PL-11: ISO string 입력 → withinWindow 정상(silent-false 회귀 방지).
- 회귀: preIpoListing 미입력 시 전체 numeric 0 변동 실증([[feedback_numeric_impact_verify_before_bug_claim]]).

---

## UI 통합 위임

- UI 명세는 `inheritance-unlisted-stock-pre-ipo-listing-section-63-2.ui.design.md`.
- **8 동기화 지점**: S-1(타입)·S-4(Zod)·S-5(폼 조립·taxKind 주입) + S-6(토글 신규·sectionNum 재배치)·S-7(결과카드 MAX 분기)·S-8(besshi note + normalizeBesshiInput 날짜 정규화 C1).
- 신규 input(preIpoListing) → ⑤UI 위젯·⑧validation·④API 변환(폼→v2 조립) 동기화 필수. strip 0 grep(R-4).
- **sectionNum 재배치(DR-2)**: PreIpoListingToggle 삽입 위치 + 후속 섹션 번호 시프트는 UI 디자인에서 확정(PR-G EstimatedProfitToggle=4 시프트 선례). `UnlistedStockV2Card.tsx` `sectionNum` prop 단일출처 패턴 준수([[project_unlisted_capital_change_relocation]]).
- besshi: §63② 전용 행 없음 → 1쪽 ⑥ 최종평가액이 override값 자동 반영 + 결과카드 안내 우선. note는 `preIpoListingResult?.applied` **gated**(DR-2). `normalizeBesshiInput`에 preIpoListing 날짜 정규화 추가(C1).
- 증여세 공용(`GiftTaxForm`) 자동 적용 — taxKind=gift 주입 경로 확인(R-1).
