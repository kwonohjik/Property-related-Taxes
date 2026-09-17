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
| §45의3① (280353) | 「**직접 또는 간접으로** 보유하는 주식보유비율(이하 이 조, 제45조의4 및 **제45조의5**에서 "주식보유비율"이라 한다)」 | ⓐ·ⓑ 공통 비율 정의 — `combinedRatio()` = 직접 + 간접 |
| 상증령 §34의3② (288887) | 간접보유비율 = 「각 단계의 직접보유비율을 **모두 곱하여**」, 경로가 둘 이상이면 「각각의 비율을 **모두 합하여**」 | `computeIndirectRatioBig()` (§45의3과 공용) |
| §45의4① (280353) | 「지배주주와 그 친족(이하 이 조 및 **제45조의5**에서 "지배주주등"이라 한다)」 | ⓐ는 **집합**의 합계 비율 (증여자 본인 행 포함) |
| §45의5② | ①증여세액 > (직접증여 증여세 − 법인세상당액) → 초과액 없음 | `finalTax = min(㉮, ㉯)`, ㉯=㉠−㉡ |
| §34의5④ (283637) | 특정법인이익 = 1호(거래이익) − 2호(법인세 산출세액−공제감면) × min(거래이익/소득금액, 1) | `corpTaxApportioned` 안분 |
| §34의5⑤ | 증여의제이익 **1억원 이상** 한정 | 주주별 `gain ≥ 100,000,000` 게이트 |
| §34의5⑨ | 한도: ㉠=1호금액×지분율 직접증여 증여세 / ㉡=2호금액×지분율 | `calcSpecificCorpLimit` |

**과세제외 5종**: ⓪**특정법인 아님**(§45의5① ⓐ — 지배주주등 합계 주식보유비율 30% 미만, 법인 단위 선결 요건) ⓪′**법인주주**(지배주주등은 「지배주주와 그 친족」= 개인이다 — 그 지분은 개인에게 간접 귀속되므로 법인 행을 과세하면 이중계상) ①증여자 본인(특수관계인=증여자 → 자기 지분분 수증 아님) ②지배주주등 아님(친족 아닌 타인) ③§34의5⑤ 1억 미만.

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
  corporateTaxComputed?: number;         // 법인세 산출세액 (안분 前)
  corporateTaxCredit?: number;           // 법인세 공제·감면액
  giftDeduction?: number;                // §45의5② 한도 ㉮㉠ 증여재산공제 (default 0)
}

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
0. eligibility = ⓐ §45의5① 특정법인 해당성 (선결)
     directRatio = Σ_{isRelated && !isCorporate} combinedRatio(sh)          // isDonor 행 **포함** · 간접분 산입
     effective   = max(directRatio, controllingGroupRatio ?? 0)             // 직접분은 증명된 하한
     met = effective ≥ 30/100 ? "yes"
         : (controllingGroupRatio 있음 ? "no" : (roster ? "no" : "unknown"))
     met === "no" → 전 주주 reason=not_specific_corp, deemedGiftValue=0
1. corpTaxApportioned =
     (annualIncome > 0 && corporateTaxComputed != null)
       ? safeMultiplyThenDivide(
           max(0, corporateTaxComputed − (corporateTaxCredit ?? 0)),
           min(transactionBenefit, annualIncome),   // 거래이익/소득금액, 1 초과 시 1 → min으로 분자 상한
           annualIncome)
       : (corporateTax ?? 0)                         // 이월결손금 0 또는 single 직접값
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

### §45의5② 한도 (calcSpecificCorpLimit — 과세 주주별)
```
㉮ computedTax  = calcInheritanceGiftTax(truncateToThousand(gain − giftDeduction))
㉠ directGiftTax= calcInheritanceGiftTax(truncateToThousand(
                    safeMultiplyThenDivide(transactionBenefit, shares, totalShares) − giftDeduction))  // 거래이익(차감 前)×지분
㉡ corpTaxShare = safeMultiplyThenDivide(corpTaxApportioned, shares, totalShares)
㉯ limitAmount  = max(0, ㉠ − ㉡)
finalTax       = min(㉮, ㉯)
filingCredit   = Math.floor(finalTax × 3 / 100)   // §69 (finalTax×3 < 2^53 → BigInt 불요)
selfPayTax     = finalTax − filingCredit
```
- `calcInheritanceGiftTax`(`inheritance-gift-common.ts:100`) 직접 호출 → `gift-tax.ts` 순환 회피. 세율표 `DEFAULT_INHERITANCE_GIFT_BRACKETS`(common.ts:86), echo는 `findApplicableBracket`(common.ts:119).

## 6. 정밀도 / 정수연산
- 모든 안분: `safeMultiplyThenDivide(a,b,c)` (BigInt fallback, floor).
- 주주별 gain: **각자 독립 floor — 잔액 흡수 안 함** (§45의5 개별 산정, 합산 일치 불요).
- 한도 taxBase: `truncateToThousand` 천원절사 후 `calcInheritanceGiftTax` 전달.
- filingCredit: floor(×3/100). `Math.round` 금지.

## 7. 파일 구조 / 함수
```
lib/tax-engine/gift-deemed/specific-corp.ts   (38 → ~400줄, <800)
  · calcSpecificCorpGift(input)        — 기존 single, 하위호환 유지
  · calcSpecificCorpGiftMulti(input)   — 신규 roster
  · calcSpecificCorpLimit(...)         — §45의5② 내부 헬퍼
lib/tax-engine/gift-deemed/types.ts    — ScRelation·SpecificCorpShareholder·SpecificCorpDonee·SpecificCorpMultiResult + Input 확장 + Result.specificCorpMulti
lib/tax-engine/gift-deemed/router.ts   — case "specific_corp": shareholders 有 → Multi, 無 → 기존
lib/tax-engine/legal-codes/inheritance-gift.ts — GIFT.SPECIFIC_CORP_LIMIT = "상증법 §45의5②"
__tests__/tax-engine/gift-deemed/specific-corp-multi.test.ts — [SC-CASE1]·[SC-CASE2]·[SC-CASE2-LIMIT]
```

## 8. 엔진 → UI 동기화 (입력·결과 경계)
- **엔진 입력**: shareholders[](+`isCorporate`)·**intermediaryCorps[]**(간접출자관계)·annualIncome·corporateTaxComputed·corporateTaxCredit·giftDeduction·**controllingGroupRatio**(ⓐ 판정용 지배주주등 합계 비율, 직접+간접) (UI가 `safeMultiplyThenDivide` 호출 없이 raw 전달, **안분은 엔진**).
- **엔진 결과**: `specificCorpMulti.{corpProfit, corpTaxApportioned, donees[]}` + `specificCorpEligibility.{directPct, declaredPct, effectivePct, met}`. donee는 `directRatioPct`·`indirectRatioPct`를 분리해 echo한다. UI 결과뷰가 주주별 표 + 한도 표를 이 echo로 렌더 (UI 재계산 금지 — dual-truth 회피).
- 14 동기화 지점 상세는 `gift-specific-corp-45-5.ui.design.md`.

## 9. defer (v2)
- §34의5⑦ 현저대가(시가30%/3억) 저가·고가(2·3호) — 현 사례는 무상증여(1호).
- §45의5①3호의2 자본거래 준용(§38·§39·§39의2·§39의3).
- 관계별 증여재산공제(배우자 6억 등)·기존증여 10년 합산 — MVP는 giftDeduction input.
- **3단계 이상 간접출자**(개인 → 법인 → 법인 → 특정법인) — 현재 입력 구조는 경유 법인이 특정법인 주주 명부의 한 행이어야 해 2단계만 표현된다. 산식(`computeIndirectRatioBig`)은 다단계를 이미 지원하므로 입력축만 확장하면 된다.
- **간접출자법인이 주주 명부에 없는 경우** — 경유 법인의 특정법인 지분을 그 «행»에서 가져오는 설계라(중복 입력·교차검증 부재 회피) 명부에 없으면 표현할 수 없다. 그때는 `controllingGroupRatio`(ⓐ)와 single 모드 합산비율(ⓑ)로 신고한다.
