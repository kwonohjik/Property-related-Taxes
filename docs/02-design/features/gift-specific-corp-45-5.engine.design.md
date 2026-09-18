# §45의5 특정법인과의 거래 이익 — 엔진 설계 (engine.design)

> Plan: `docs/00-pm/gift-specific-corp-45-5.plan.md`. 본 문서는 엔진 input/result 타입·알고리즘·정밀도·동기화 지점·anchor를 확정한다.
> 검증: 법제처 API verbatim(§45의5 MST 276123 / §34의5 MST 283637) + 코드 실측(file:line).

## 1. 개요

현행 `lib/tax-engine/gift-deemed/specific-corp.ts`(38줄, 단일 1인)를 **다주주 roster + 법인세 안분 + 과세제외 3종 + §45의5② 증여세 한도**로 확장. 기존 `calcSpecificCorpGift`(single)는 하위 호환 유지, 신규 `calcSpecificCorpGiftMulti` 추가.

## 2. 법령 근거 (verbatim 요약)

| 조문 | 내용 | 엔진 반영 |
|---|---|---|
| §45의5① ⓐ (280353) | 「**지배주주등의 주식보유비율이 100분의 30 이상인 법인**(…"특정법인")」 — 과세 **대상 법인**을 정하는 선결 요건 | `evaluateSpecificCorpEligibility()` — 지배주주등 행 직접지분 합계 + 신고된 간접분 |
| §45의5① ⓑ (280353) | 특정법인이익 × **지배주주등의 주식보유비율** → 지배주주등이 증여받은 것으로 봄 | `corpProfit × shares/totalShares` |
| §45의5① 상대방 (280353) | 「특정법인이 **지배주주 및 그 특수관계인**과 … 거래를 하는 경우」 | `evaluateScTransaction()` — `counterparty` |
| 상증령 §34의5② (288887) | 3의2호 자본거래는 「특정법인과 **지배주주의 특수관계인** 사이에 이루어지거나 지배주주의 특수관계인 사이에」 ⇒ **지배주주 본인 제외** | 3의2호 선택 시 상대방 후보에서 본인 제거 |
| 상증령 §34의5④1호 (288887) | 가목(1호·4호) 증여재산가액·채무면제이익 / **나목(3의2호) §38·§39·§39의2·§39의3·§40·§41의2·§42의2 준용** / 다목 「가목 및 나목 외의 경우: **제7항에 따른** 시가와 대가와의 차액」 | `txLabel()` 유형별 라벨. 나목 준용계산은 **미수행**(고지) |
| 상증령 §34의5⑥ 단서 (288887) | 「해산(합병·분할에 의한 해산 제외) 중인 경우로서 주주등에게 분배할 **잔여재산이 없는 경우는 제외**」 | `isDissolvingWithoutResidual` |
| 상증령 §34의5⑦ (288887) | 「차액이 시가의 100분의 30 이상**이거나** 그 차액이 3억원 이상」 ⇒ **OR** | `diff >= applyRate(mv, 0.3) \|\| diff >= 300,000,000` |
| 상증령 §34의5⑧ (288887) | 「제7항을 적용할 때 재산 또는 용역의 시가는 「법인세법 시행령」 제89조에 따른다」 | 시가 입력 hint |
| 법 §53 | 관계별 증여재산공제 — **수증자별**로 갈린다 | 행 단위 `donorRelation` → `GIFT_DEDUCTION_LIMIT`(단일 소스 재사용) |
| 법 §57①② | 세대생략 할증 30%(미성년 + 세대생략 재산 20억 초과 시 40%) | 행 단위 `isGenerationSkip` → `calcGenerationSkipSurcharge`(공용 leaf) |
| §45의3① (280353) | 「**직접 또는 간접으로** 보유하는 주식보유비율(이하 이 조, 제45조의4 및 **제45조의5**에서 "주식보유비율"이라 한다)」 | ⓐ·ⓑ 공통 비율 정의 — `combinedRatio()` = 직접 + 간접 |
| 상증령 §34의3② (288887) | 간접보유비율 = 「각 단계의 직접보유비율을 **모두 곱하여**」, 경로가 둘 이상이면 「각각의 비율을 **모두 합하여**」 | `computeIndirectRatioBig()` (§45의3과 공용) |
| §45의4① (280353) | 「지배주주와 그 친족(이하 이 조 및 **제45조의5**에서 "지배주주등"이라 한다)」 | ⓐ는 **집합**의 합계 비율 (증여자 본인 행 포함) |
| §45의5② | ①증여세액 > (직접증여 증여세 − 법인세상당액) → 초과액 없음 | `finalTax = min(㉮, ㉯)`, ㉯=㉠−㉡ + 마법사 산출세액 clamp |
| 법 §43② · 영 §32의4 11호 | 증여일부터 소급 1년 이내 **같은 호** 거래의 이익을 합산해 금액기준 판정 | `aggregatePriorTransactions` (`priorTransactions`) |
| §34의5④ (283637) | 특정법인이익 = 1호(거래이익) − 2호(산출세액 − **토지등 양도소득 법인세액(§55의2)** − 공제감면) × min(거래이익/소득금액, 1) | `corpTaxApportioned` 안분 |
| §34의5⑤ | 증여의제이익 **1억원 이상** 한정 | 주주별 `gain ≥ 100,000,000` 게이트 |
| §34의5⑨ | 한도: ㉠=1호금액×지분율 직접증여 증여세 / ㉡=2호금액×지분율 | `calcSpecificCorpLimit` |

> ⚠️ **증여자는 1명까지만 지정한다.** 법 §45의5①은 「… 거래를 하는 경우에는 **거래한 날을 증여일로
> 하여**」라고 **거래 단위**로 증여를 본다 ⇒ 증여자가 2인이면 별개 거래 2건이다. 합산 입력하면 두 행이
> 서로 `donor_self`로 상쇄돼 **0원**이 된다(실측). ⑤·⑧·⑫ 세 층에서 막는다(3중 패턴).
> 엔진에 「자기증여분 차감」 분해를 넣는 쪽은 납세자에게 **불리한 방향**인데 그 분해를 지시하는
> 법령·해석 근거를 확인하지 못했다 — 근거 없이 불리하게 적용하지 않는다.

**과세제외 6종**: ⓧ**§45의5① 거래 아님**(거래상대방 미해당 · 영 ⑥ 단서 · 영 ⑦ 현저성 미달) ⓪**특정법인 아님**(§45의5① ⓐ — 지배주주등 합계 주식보유비율 30% 미만, 법인 단위 선결 요건) ⓪′**법인주주**(지배주주등은 「지배주주와 그 친족」= 개인이다 — 그 지분은 개인에게 간접 귀속되므로 법인 행을 과세하면 이중계상) ①증여자 본인(그 행은 **지배주주등이면서 동시에 거래상대방**이다 — 자기 지분분은 수증이 아니다. ⚠️ 「특수관계인=증여자」로 적지 말 것 — 현행 §45의5①의 거래상대방은 「지배주주 **및** 그 특수관계인」이라 둘은 등가가 아니다) ②지배주주등 아님(친족 아닌 타인) ③§34의5⑤ 1억 미만.

> ⚠️ **ⓐ와 ⓑ는 이름이 같은 다른 비율이다.** ⓐ는 그룹 합계(법인 단위), ⓑ는 상증령 §34의5⑨
> 「**해당** 지배주주등의 주식보유비율을 곱한 금액을 … **각각**」에 따라 인별이다.
> 섞으면 그룹 35%인 특정법인에서 개인 20%를 보유한 수증자의 정당한 과세분이 0원이 된다.
>
> ⚠️ **미신고 시 두 모드가 갈린다.** 「주식보유비율」이 직접+간접이라 직접지분 합계로는 **충족만
> 확정**된다. `roster`는 발행주식 총수 + 주주 전원 명부를 받으므로 미신고를 간접 0%로 보고
> **판정**하지만(사유 문구에 전제를 명시), `single`은 그룹 명부가 없어 미신고면 **판정을 보류**한다
> (`met: "unknown"` + 결과뷰 amber 고지).

## 3. 케이스 인벤토리 (전 주주 enumerate + anchor)

### 사례 1 `[SC-CASE1]` — 법인세 0, 거래이익 10억
| 주주 | relation | isDonor | isRelated | 지분 | gain(원) | taxable | nonTaxableReason |
|---|---|---|---|---|---|---|---|
| 부 | lineal_ascendant | true | true | 40% | (제외) | ✗ | donor_self |
| 직원 | other | false | false | 30% | 300,000,000 | ✗ | non_related |
| 장남 | lineal_descendant | false | true | 25% | **250,000,000** | ✓ | — |
| 차남 | lineal_descendant | false | true | 5% | 50,000,000 | ✗ | below_threshold |

corpTaxApportioned=0, corpProfit=1,000,000,000. 과세 합계 250,000,000.

### 사례 2 `[SC-CASE2]` — 법인세 780백만, 거래이익 30억, 소득금액 40억
| 주주 | relation | isDonor | isRelated | 지분 | gain(원) | taxable | nonTaxableReason |
|---|---|---|---|---|---|---|---|
| 갑 | lineal_descendant | false | true | 60% | **1,449,000,000** | ✓ | — |
| 부 | lineal_ascendant | true | true | 20% | 483,000,000 | ✗ | donor_self |
| 을 | sibling | false | true | 3% | 72,450,000 | ✗ | below_threshold |
| 병 | other | false | false | 17% | 410,550,000 | ✗ | non_related |

corpTaxApportioned = `safeMultiplyThenDivide(780,000,000, 3,000,000,000, 4,000,000,000)` = **585,000,000**.
corpProfit = 3,000,000,000 − 585,000,000 = **2,415,000,000**.

### 사례 2 한도(갑) `[SC-CASE2-LIMIT]` — giftDeduction=50,000,000
| 항목 | taxBase(천원절사 후) | 산출 | 값(원) |
|---|---|---|---|
| ㉮ 일반 | 1,449,000,000 − 50,000,000 = 1,399,000,000 | ×40%−1.6억 | **399,600,000** |
| ㉠ 직접증여(차감 前) | 3,000,000,000×60% − 50,000,000 = 1,750,000,000 | ×40%−1.6억 | **540,000,000** |
| ㉡ 법인세분 | — | 585,000,000×60% | 351,000,000 |
| ㉯ 한도 | — | max(0, ㉠−㉡) | **189,000,000** |
| finalTax | — | min(㉮,㉯) | **189,000,000** |
| filingCredit | — | floor(189,000,000×3/100) | 5,670,000 |
| selfPayTax | — | finalTax − credit | **183,330,000** |

## 4. 타입 정의 (types.ts 확장 — 신규 전부 optional, 하위 호환)

```ts
type ScRelation =
  | "lineal_ascendant" | "lineal_descendant"
  | "spouse" | "sibling" | "other_relative" | "other";   // "other" = 비친족(타인)
// 증여자 본인 판정은 relation이 아닌 isDonor 플래그(분리). isRelated = (relation !== "other") 로 UI에서 도출.

interface SpecificCorpShareholder {
  id: string;
  name: string;
  relation: ScRelation;
  shares: number;          // 보유 주식수
  totalShares: number;     // 발행주식 총수 (분모)
  isDonor: boolean;        // 증여자 본인 → donor_self 제외
  isRelated: boolean;      // 지배주주 친족 여부, false → non_related 제외
}

// SpecificCorpInput 확장 (기존 transactionBenefit/corporateTax/ownershipRatio 유지)
interface SpecificCorpInput {
  transactionBenefit: number;            // §34의5④1호 거래이익
  corporateTax?: number;                 // (single 하위호환) 이미 안분된 법인세상당액
  ownershipRatio?: { numer: number; denom: number }; // (single) 단일 지분율
  // ↓ roster 모드
  shareholders?: SpecificCorpShareholder[];
  annualIncome?: number;                 // §34의5④2호나목 각사업연도소득금액 (분모)
  corporateTaxComputed?: number;         // 법인세 산출세액 (안분 前 — §55① 정의상 §55의2분 «포함»)
  corporateTaxOnLandTransfer?: number;   // 법인세법 §55의2 토지등 양도소득 법인세액 (§34의5④2호가목 제외항목)
  corporateTaxCredit?: number;           // 법인세 공제·감면액
  giftDeduction?: number;                // §45의5② 한도 ㉮㉠ 증여재산공제 (default 0)
  transactionDate?: string;              // §45의5① 「거래한 날」=증여일 — §43² 윈도 + §69 공제율 기준일
                                         //   엔진이 `appliedLawDate`로 되돌려준다(4개 엔진 공통 축)
  priorTransactions?: { date; benefit; label? }[];  // §43²·영 §32의4 11호 — 소급 1년 이내 같은 호 거래
}

### §43² 1년 합산 (영 §32의4 11호)
```
windowFrom = transactionDate − 1년            // 폐구간(당일 포함)
inWindow   = priorTransactions.filter(t => windowFrom ≤ t.date ≤ transactionDate)
benefit    = 이번 거래의 이익 + Σ inWindow.benefit     // ⇒ 이후 파이프라인(법인세 안분·1억 판정) 전부가 합산값 기준
```
- **호별**이다 — 11호 괄호 「같은 항 **각 호의 거래에 따른 이익별로 구분된 이익**」. UI가 같은 호만 받게 안내한다.
- 2·3호의 **현저성(영 §34의5⑦)은 건별 요건**이다 — ⑦이 「현저히 낮은/높은 대가」를 그렇게 «정의»하므로
  요건을 넘은 거래의 이익만 합산 대상이 된다(anchor [A-4]).
- `transactionDate`가 없으면 윈도를 정할 수 없어 합산하지 않는다 — 그 상태는 ⑧ 공통 가드가 앞에서 막는다.
- ⚠️ 법 §43② 본문 괄호 「(시가와 대가의 차액을 말한다)」를 «다목만 합산»으로 읽지 말 것 — 같은 항이
  §37·§41의2·§41의4도 열거하는데 그것들은 시가−대가 차액이 아니다. 범위는 영 §32의4 11호가 정한다.
- 형제 §41의4(9호, `free-loan-aggregated.ts`)와 달리 **증여시기 탐색이 없다** — §45의5①이
  「거래한 날을 증여일로 하여」로 이미 고정한다.

interface SpecificCorpDonee {
  name: string;
  relation: ScRelation;
  shares: number;
  totalShares: number;
  ownershipRatioPct: number;             // 표시용 백분율
  gain: number;                          // 증여의제이익 (= corpProfit × shares/totalShares)
  isTaxable: boolean;
  nonTaxableReason?: "donor_self" | "non_related" | "below_threshold";
  limitCalc?: {                          // 과세 주주만 (수증자 선택 대상)
    computedTax: number;                 // ㉮
    directGiftTax: number;               // ㉠
    corpTaxShare: number;                // ㉡
    limitAmount: number;                 // ㉯ = max(0, ㉠−㉡)
    finalTax: number;                    // min(㉮,㉯)
    filingCredit: number;                // floor(finalTax×3/100)
    selfPayTax: number;                  // finalTax − filingCredit
  };
}

// DeemedGiftResult 확장 (capitalDecreaseMulti 패턴 — Record/배열, Map 금지)
interface SpecificCorpMultiResult {
  corpProfit: number;
  corpTaxApportioned: number;
  donees: SpecificCorpDonee[];
}
// DeemedGiftResult += specificCorpMulti?: SpecificCorpMultiResult;
// ⚠️ 확인필요(MVP defer): aggregationExcluded?(§47① 합산배제)·donorJointLiabilityExempt?(§4의2⑥ 연대납세의무 면제)
//   의 §45의5 해당 여부 미검증. 현행 specific-corp.ts도 미설정 → 회귀 없음. KoreanLaw 검증 후 v2 echo.
```

## 5. 알고리즘 (calcSpecificCorpGiftMulti)

```
0. tx = evaluateScTransaction(input)   // 거래 자체가 §45의5① 안에 있는가 (가장 앞)
     상대방: 3의2호면 {지배주주의 특수관계인}, 그 밖이면 {지배주주 본인, 그 특수관계인}
             미전달 → "unknown"(판정 보류 · 값 유지 · 결과뷰 고지). ⑧이 제품 경로에서 강제
     4호 + 해산·잔여재산 없음 → 제외 (영 ⑥ 단서)
     2·3호 → diff = (2호: 시가−대가 / 3호: 대가−시가)
             met = diff ≥ floor(시가×30%) **또는** diff ≥ 300,000,000   (영 ⑦ — OR)
             미달 → benefit 0 (영 ④1호다목이 참조할 차액이 없다)
     1호·4호(가목) · 3의2호(나목 — 준용계산은 이 화면 밖) → 입력값 그대로
0′. eligibility = ⓐ §45의5① 특정법인 해당성 (선결)
     directRatio = Σ_{isRelated && !isCorporate} combinedRatio(sh)          // isDonor 행 **포함** · 간접분 산입
     effective   = max(directRatio, controllingGroupRatio ?? 0)             // 직접분은 증명된 하한
     met = effective ≥ 30/100 ? "yes"
         : (controllingGroupRatio 있음 ? "no" : (roster ? "no" : "unknown"))
     met === "no" → 전 주주 reason=not_specific_corp, deemedGiftValue=0
1. corpTaxApportioned =
     (annualIncome > 0)                              // ⚠️ 구현은 annualIncome만 본다 — 종전 문서의
       ? safeMultiplyThenDivide(                     //    `&& corporateTaxComputed != null`은 최초
           max(0, corporateTaxComputed              //    커밋부터 코드에 없던 문서 드리프트였다.
               − (corporateTaxOnLandTransfer ?? 0)   // §34의5④2호가목 — 법인세법 §55의2 토지등 양도소득 법인세액
               − (corporateTaxCredit ?? 0)),
           min(transactionBenefit, annualIncome),   // 거래이익/소득금액, 1 초과 시 1 → min으로 분자 상한
           annualIncome)
       : (corporateTax ?? 0)                         // 이월결손금 0 또는 single 직접값

   > **§55의2 제외는 확인적 문구가 아니다.** 법인세법 §55①이 산출세액을 「…제55조의2에 따른
   > 토지등 양도소득에 대한 법인세액 … 이 있으면 이를 **합한 금액으로 한다**」로 정의하므로,
   > 법문 용어를 그대로 따른 입력이 곧 과대 입력이 된다(안분 과대 → 증여의제이익 과소).
   > ⚠️ §55① 괄호는 조특법 §100의32 특례세액도 합산하지만 §34의5④2호가목 괄호는 §55의2만
   > 열거한다 — **§100의32분은 빼지 않는다**(확대 적용 금지). anchor `[LT-0]~[LT-8]`.
2. corpProfit = max(0, transactionBenefit − corpTaxApportioned)
3. donees = shareholders.map(sh => {
     ratio = 직접(sh.shares/totalShares) + 간접(computeIndirectRatioBig, mode="ruling")  // BigInt 분수
     gain  = floor(corpProfit × ratio)                                      // floor 1회 · 잔액 흡수 안 함
     if (sh.isCorporate)    → taxable=false, reason=corporate_shareholder, gain=0
     if (sh.isDonor)        → taxable=false, reason=donor_self
     else if (!sh.isRelated)→ taxable=false, reason=non_related
     else if (gain < 1억)   → taxable=false, reason=below_threshold
     else                   → taxable=true
   })
4. deemedGiftValue = Σ taxable donee.gain   // 과세 지배주주등 gain 합(router 단일 의제 요약값; 실제 세액은 수증자별 limitCalc)
5. specificCorpMulti = { corpProfit, corpTaxApportioned, donees }
6. 결과 조립 (capital-decrease-multi.ts:153-173 패턴 차용):
     applied = deemedGiftValue > 0
     breakdown = [
       { "특정법인의 이익 (거래이익 − 법인세 안분)", corpProfit, GIFT.SPECIFIC_CORP },
       { "증여재산가액 (지배주주등 지분 안분)", deemedGiftValue, GIFT.SPECIFIC_CORP, note:`과세 수증자 ${taxableCount}명` },
     ]
     exclusionReason = applied ? undefined : "과세 지배주주등 없음(본인증여·비친족·1억 미만 제외)"
     return { type:"specific_corp", applied, deemedGiftValue, breakdown, exclusionReason,
              legalBasis: GIFT.SPECIFIC_CORP, specificCorpMulti }
```

> **법인세 안분 분자 상한**: §34의5④2호나목 "min(거래이익/소득금액, 1)" → `min(transactionBenefit, annualIncome)`를 분자로 사용해 비율 1 초과 차단. 사례2: min(30억,40억)=30억 → 780백만×30억/40억=585백만 ✓.

### 행위시법 (specific-corp-era.ts) — 거래일 시점의 법령으로 계산한다

§45의5①이 「**거래한 날**을 증여일로 하여」로 증여시기를 고정하므로 그 날 시행 중이던 법령이 적용된다.
전건 KoreanLaw MCP 원문 확인:

| 거래일(증여일) | 법 §45의5 | 영 §34의5⑨ ㉠ base | 앱 |
|---|---|---|---|
| ~2019-12-31 | 구 체계(결손·휴폐업·지배주주등 50%↑ 3분류) · **②에 한도 없음** | (⑨ 자체가 없다) | **차단** |
| 2020-01-01~02-10 | 현행 ①② 시행(법률 제16846호) | 위임 시행령 **미시행** | **차단** |
| 2020-02-11~2022-02-14 | 현행 ①② | **net** — 「같은 항에 따른 **증여의제이익을** 해당 주주가 직접 증여받은 것으로 볼 때의 증여세」 | 분기 |
| 2022-02-15~ | 현행 ①② | **gross** — 「**제4항제1호의 금액에** … 주식보유비율을 곱한 금액을 …」(대통령령 제32414호) | 현행 |

- **차단이 정본인 이유**: 구 체계 구간은 과세요건(3분류)부터 달라, 현행 30% 요건으로 계산하면
  구법상 비대상 법인에 **없는 세금을 만든다**(예: 지배주주 40% · 결손 없음 · 정상영업).
  「법 근거 없이 불리하게 적용하지 않는다」 ⇒ 계산하지 않는다. 위임 시행령 부재 구간도 산식이
  법정돼 있지 않아 같다. ⑧validate가 먼저 막고 엔진 게이트가 같은 술어로 이중 방어한다.
- **net 구간의 성질**: ㉠의 base가 ㉮와 같아지므로 ㉠ = ㉮가 되고 ㉯ = ㉮ − ㉡ ⇒
  **법인세 상당액이 0이 아니면 항상 한도가 걸린다**. gross로 계산해 두면 그만큼 과대(납세자 불리).
  실측(거래이익 30억·소득 50억·산출세액 5억·갑 30%·을 20%): 45,000,000원 과대였다.
- 거래일 미전달은 현행(gross)·차단 없음 — 무회귀 안전판. anchor `[R-0]~[R-13]`.

### §45의5② 한도 (calcSpecificCorpLimit — 과세 주주별)

> **single·roster 공용 leaf다.** 조문(법 §45의5② · 영 §34의5⑨)에는 입력 모드 축이 없다. 종전에는
> single(`calcSpecificCorpGift`)이 한도를 계산하지 않아, 한도 전용 입력(증여재산공제)이 엔진까지
> 도달한 뒤 버려지는 유령 필드였다. single은 `result.specificCorpLimit`, roster는
> `donees[].limitCalc`에 담고 같은 사실관계면 **완전히 같다**(anchor [L-0]).
>
> **세액 경로 도달** — 한도는 결과뷰 표시로 끝나지 않는다. prefill이 `EstateItem.deemedGiftTaxCap`
> (`limitAmount` = ㉯ + staleness 근거 `basis`)을 싣고, 증여세 본엔진(`gift-tax.ts` STEP 7.4 ·
> `deemed-gift-tax-cap.ts`)이 산출세액(§56+§57)을 ㉯로 자른다. 적용 조건은 **그 신고의 과세가액이
> 이 증여의제이익 하나이고 공제가 이관 당시와 같을 때**뿐이다 — 상한 대상은 「제1항에 따른 증여세액」
> 인데 다른 재산이 섞이면 §45의5에 안분 규정이 없어서다. 적용하지 않으면 경고를 남긴다
> (anchor [L-6]~[L-15]; 교재 사례2 두 화면 모두 산출 189,000,000 · 자진납부 183,330,000).

> **§53 공제와 §57 할증은 수증자별이다.** 공제는 행 단위 `donorRelation`에서(미지정이면 입력 단의
> 단일 `giftDeduction`으로 폴백 — 10년 기사용분이 있을 때 쓰는 경로), 할증은 행 단위
> `isGenerationSkip`에서 온다. 할증은 ㉮·㉠ **양쪽**에 붙는다 — 영 §34의5⑨이 ㉠를 「직접 증여받은
> 것으로 볼 때의 **증여세**」로 정의하므로 §57이 포함된다. ㉠에만 빠뜨리면 ㉯가 작아져 finalTax가
> 할증 전 값으로 되돌아간다(anchor [D-7]).
> 표시층이 사유 없이 큰 값을 보이지 않도록 `giftDeductionApplied`·`generationSkipSurcharge`를 echo한다.
```
taxBase(x)     = x < 500,000 ? 0 : x                // §55② 과세최저한 — 천원절사는 §55에 없다(종전 truncateToThousand 제거)
㉮ computedTax  = calcInheritanceGiftTax(taxBase(max(0, gain − giftDeduction)))
㉠ directGiftTax= calcInheritanceGiftTax(taxBase(max(0, ㉠base − giftDeduction)))
   ㉠base       = limitBasis === "net" ? gain(=증여의제이익)        // ~2022-02-14
                                       : 거래이익(차감 前) × 주식보유비율  // 2022-02-15~
㉡ corpTaxShare = safeMultiplyThenDivide(corpTaxApportioned, shares, totalShares)
㉯ limitAmount  = max(0, ㉠ − ㉡)
finalTax       = min(㉮, ㉯)
filingCredit   = applyRateFraction(finalTax, round(rate×100), 100)  // §69 — rate = resolveFilingCreditRate(거래일)
                                                   //   연도별 단일 소스(10%→7%→5%→3%). 3% 하드코딩 금지.
                                                   //   결과뷰 라벨도 `filingCreditRate` echo를 쓴다(문자열 3% 금지).
selfPayTax     = finalTax − filingCredit
```
- `calcInheritanceGiftTax`(`inheritance-gift-common.ts:100`) 직접 호출 → `gift-tax.ts` 순환 회피. 세율표 `DEFAULT_INHERITANCE_GIFT_BRACKETS`(common.ts:86), echo는 `findApplicableBracket`(common.ts:119).

## 6. 정밀도 / 정수연산
- 모든 안분: `safeMultiplyThenDivide(a,b,c)` (BigInt fallback, floor).
- 주주별 gain: **각자 독립 floor — 잔액 흡수 안 함** (§45의5 개별 산정, 합산 일치 불요).
- 한도 taxBase: **§55② 과세최저한(50만원 미만 → 0)** 후 `calcInheritanceGiftTax` 전달. 종전 `truncateToThousand`
  천원절사는 §55 어디에도 근거가 없고 저장소의 다른 증여세 스트림 4곳과도 어긋났다(anchor [L-3]~[L-5]).
- filingCredit: floor(×3/100). `Math.round` 금지.

## 7. 파일 구조 / 함수
```
lib/tax-engine/gift-deemed/specific-corp-era.ts — 행위시법 경계 상수·판정(차단 사유·limitBasis)
lib/tax-engine/gift-deemed/specific-corp.ts   (38 → ~650줄, <800)
  · calcSpecificCorpGift(input)        — 기존 single, 하위호환 유지
  · calcSpecificCorpGiftMulti(input)   — 신규 roster
  · calcSpecificCorpLimit(...)         — §45의5② 내부 헬퍼
lib/tax-engine/gift-deemed/types.ts    — ScRelation·SpecificCorpShareholder·SpecificCorpDonee·SpecificCorpMultiResult + Input 확장 + Result.specificCorpMulti
lib/tax-engine/gift-deemed/router.ts   — case "specific_corp": shareholders 有 → Multi, 無 → 기존
lib/tax-engine/legal-codes/inheritance-gift.ts — GIFT.SPECIFIC_CORP_LIMIT = "상증법 §45의5②"
__tests__/tax-engine/gift-deemed/specific-corp-multi.test.ts — [SC-CASE1]·[SC-CASE2]·[SC-CASE2-LIMIT]
```

## 8. 엔진 → UI 동기화 (입력·결과 경계)
- **엔진 입력**: 행 단위 **donorRelation**(§53)·**isGenerationSkip**(§57)·**counterparty**·**transactionType**·**marketValue**·**consideration**·**isDissolvingWithoutResidual**·shareholders[](+`isCorporate`)·**intermediaryCorps[]**(간접출자관계)·annualIncome·corporateTaxComputed·**corporateTaxOnLandTransfer**·corporateTaxCredit·giftDeduction·**controllingGroupRatio**(ⓐ 판정용 지배주주등 합계 비율, 직접+간접) (UI가 `safeMultiplyThenDivide` 호출 없이 raw 전달, **안분은 엔진**).
- **엔진 결과**: `specificCorpMulti.{corpProfit, corpTaxApportioned, donees[]}` + `specificCorpEligibility.{directPct, declaredPct, effectivePct, met}`. donee는 `directRatioPct`·`indirectRatioPct`를 분리해 echo한다. 거래 판정은 `specificCorpTransaction.{benefit, exclusionReason, counterpartyMet, significance, transactionType}`. UI 결과뷰가 주주별 표 + 한도 표를 이 echo로 렌더 (UI 재계산 금지 — dual-truth 회피).
- 14 동기화 지점 상세는 `gift-specific-corp-45-5.ui.design.md`.

## 9. defer (v2)
- §34의5⑦ 현저대가(시가30%/3억) 저가·고가(2·3호) — 현 사례는 무상증여(1호).
- **3의2호 자본거래의 준용계산(영 §34의5④1호나목)** — 유형 구분·상대방 제한·인용은 구현했으나
  §38 등 **준용 산식은 이 화면이 수행하지 않는다**. 준용 대상 7개 조문이 같은 마법사의 다른 유형
  (합병·증자·감자·현물출자·전환사채·초과배당·조직변경)으로 전부 노출돼 있으므로, 거기서 산출한
  이익을 「거래이익」에 넣도록 `CollapsibleHintCard`로 고지한다. 자동 배선은 별건.
- **영 §34의5⑦ 후단 금전 대부** — 「금전을 대부하거나 대부받는 경우에는 법 제41조의4를 준용하여
  계산한 이익으로 한다」. 현재 미반영(§41의4는 별도 유형으로 존재).
- **3의2호 시행일(2025.3.14) 전 거래 차단** — `giftDate`가 엔진 input에 없어 행위시법 분기를 만들
  자리가 없다(W1 선행).
- 관계별 증여재산공제(배우자 6억 등)·기존증여 10년 합산 — MVP는 giftDeduction input.
- **3단계 이상 간접출자**(개인 → 법인 → 법인 → 특정법인) — 현재 입력 구조는 경유 법인이 특정법인 주주 명부의 한 행이어야 해 2단계만 표현된다. 산식(`computeIndirectRatioBig`)은 다단계를 이미 지원하므로 입력축만 확장하면 된다.
- **간접출자법인이 주주 명부에 없는 경우** — 경유 법인의 특정법인 지분을 그 «행»에서 가져오는 설계라(중복 입력·교차검증 부재 회피) 명부에 없으면 표현할 수 없다. 그때는 `controllingGroupRatio`(ⓐ)와 single 모드 합산비율(ⓑ)로 신고한다.
