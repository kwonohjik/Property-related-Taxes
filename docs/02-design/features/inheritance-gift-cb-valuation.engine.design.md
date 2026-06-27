# 전환사채 등의 평가 — 엔진/데이터 설계

> 계획서 `inheritance-gift-cb-valuation.plan.md` 기반 엔진/데이터 설계 (PDCA Design 산출물).
> 상증법 §63①2호 + 상증령 §58의2. 4종(전환사채·신주인수권부사채·신주인수권증권·신주인수권증서).
> 템플릿: #403 receivable engine.design. 작성 2026-06-27.

## 1. 케이스 인벤토리 (행 ≥ 1 강제)

| ID | 분기 | 조문 | 산식 | anchor |
|---|---|---|---|---|
| CB-A1 | 거래소·2개월실적有 | §58의2①→§58①1호 | `Max(2개월종가평균, 최근일최종시세)` | — (echo) |
| CB-A2a | 거래소·실적無·매입 | §58①2호가 | `매입가액 + 미수이자상당액` | — |
| CB-A2b | 거래소·실적無·그외 | §58①2호나 | `처분예상금액` | — |
| CB-B1a | 비거래소·전환불가·신주인수권증권 | §58의2②1호가 | `Max(0, 발행가액 − PV(r))` | cb-B1 79,211,758 |
| CB-B1b | 비거래소·전환불가·그외(전환사채) | §58의2②1호나 | `PV(min(R,r)) + 발생이자` | cb-A1 512,493,150 |
| CB-B2가 | 비거래소·전환가능·전환사채 | §58의2②2호가 | `Max(B1b, 전환주식가액 − 배당차액)` | cb-A2 1,993,835,617 |
| CB-B2나 | 비거래소·전환가능·신주인수권부사채 | §58의2②2호나 | `Max(a, a − b + c)` | cb-C 1,278,624,603 |
| CB-B2다 | 비거래소·전환가능·신주인수권증권 | §58의2②2호다 | `Max(b, 인수주식가액 − 배당차액 − 신주인수가액)` | cb-B2 400,000,000 |
| CB-B2라 | 비거래소·전환가능·신주인수권증서 | §58의2②2호라 | 거래소=종가평균 / 그외=권리락전가액 − 배당차액 − 신주인수가액 (상장단서) | cb-D 400,000,000 / cb-D2 100,000,000 |
| CB-B2마 | 기타 | §58의2②2호마 | 가~다목 준용 | — |

보조: `a` = CB-B1b(전환금지 부사채), `b` = CB-B1a(전환금지 신주인수권증권), `c` = CB-B2다(전환가능 신주인수권증권). (계획서 §1.1)

## 2. 입력 타입 (EstateItem 확장)

`lib/tax-engine/types/inheritance-gift-estate.types.ts` (계획서 §3, 전부 optional):
```ts
export type CbSecurityType =
  | "convertible_bond"      // 가. 전환사채
  | "bond_with_warrant"     // 나. 신주인수권부사채
  | "warrant_certificate"   // 다. 신주인수권증권
  | "preemptive_right";     // 라. 신주인수권증서
```
- AssetCategory에 `"convertible_bond"` 추가. barrel `inheritance-gift.types.ts`에 `CbSecurityType` re-export (B#3).
- EstateItem cb* 필드: 계획서 §3.2 표 그대로 (노출조건 열 포함). `cbIssuePrice` 없음(발행가액=cbPrincipal).
- **발생이자·배당차액 = auto-derive + `*Override`** (토글 없음, superficies 패턴).

## 3. 출력 타입 — 기존 `PropertyValuationResult` 재사용 (estate.types:576)
- `{ estateItemId, method: ValuationMethod, valuatedAmount, breakdown[], warnings[] }` (실측 필드명 일치).
- **echo는 `breakdown[]` CalculationStep로 노출** (검토 #6: result 타입에 범용 echo 필드 부재 — besshiData는 상장주식 전용). 발생이자·배당차액·PV(r)·발행가액·선택 분기를 step 라벨+amount로. result 타입 확장 안 함.

## 4. 알고리즘

### 4.1 `evaluateConvertibleBond(item, valuationDateISO): PropertyValuationResult`
```
rFrac = resolveCbDiscountRate(valuationDateISO)        // = resolveReceivableDiscountRate + 2001미만 가드(§4.5)
                                                        // RateFraction {numer, denom}, denom===1000 가정 가드
rPercent = rFrac.numer / rFrac.denom * 100             // min 비교용 스칼라
R = cbHasRedemptionPremium ? cbIssueRate : cbCouponRate // 둘 다 % 스칼라
issuePrice = cbPrincipal                               // 발행가액 (par) — PV(R) 미계산
maturityAmt = cbPrincipal + (cbRedemptionPremium ?? 0) // 만기상환금액(원금+할증)

if (cbTradedOnExchange && securityType !== "preemptive_right"):   // A (라목은 라목1 경로 우선, §4.1 라목)
  if (cbHasTradeRecord): return Max(cbExchange2mAvg, cbExchangeLatestPrice)
  else: return cbExchangeSubMode==="purchase"
            ? cbPurchasePrice + cbAccruedInterestToBase
            : cbDisposalExpected
else:                                                  // B
  PV_r = pvBond(maturityAmt, cbPrincipal, cbCouponRate, rFrac, cbMaturityYears)  // §4.2
  accrued = cbAccruedInterestOverride ?? deriveAccruedInterest(item)             // §4.3
  base_1b = (rPercent >= R ? issuePrice : PV_r) + accrued                        // 1호나목: min(R,r)=R→발행가액 / min=r→PV_r
  warrant_1a = max(0, issuePrice - PV_r)                                         // 1호가목 = PV(R)−PV(r), PV(R)=발행가액
  if (!cbConvertible):
     return securityType==="warrant_certificate" ? warrant_1a : base_1b
  else:
     div = cbDividendDifferenceOverride ?? computeCbDividendDifference(item)  // §4.4
     switch(securityType):
       convertible_bond:   return max(base_1b, cbConvertibleShareValue - div)
       warrant_certificate:return max(warrant_1a, cbConvertibleShareValue - div - cbSubscriptionPrice)
       bond_with_warrant:
         c = max(warrant_1a, cbConvertibleShareValue - div - cbSubscriptionPrice)
         return max(base_1b, base_1b - warrant_1a + c)
       preemptive_right:                                       // 라목 (A분기보다 우선 진입, §4.1 top)
         if (cbTradedOnExchange): return cbExchange2mAvg        // 라목1: 거래소 전체거래일 종가평균 (전용 의미, A분기 skip됨)
         bare = cbExRightsPriorPrice - div - cbSubscriptionPrice
         if (상장 && cbExRightsPostPrice < cbExRightsPriorPrice - div):
            return cbExRightsPostPrice - cbSubscriptionPrice    // 라목2 상장단서
         return bare                                            // 라목2 기본
```
+ `property-valuation.ts evaluateEstateItem` switch에 `case "convertible_bond"` → `evaluateConvertibleBond`.
> ⚠️ 라목 거래소 종가평균은 §58①1호 "2개월 평균"과 **산식이 다름**(전체 거래일). securityType===preemptive_right면 §4.1 top의 A분기를 skip하고 라목 경로로 진입(검토 #9). `cbExchange2mAvg` 필드를 라목에선 "전체일 평균" 의미로 재사용(UI 라벨 분기).

### 4.2 PV 헬퍼 — `receivablePV` export 재사용 (B#7, single-source — **시그니처/호출부 무변경**, 검토 #1·#3 정정)
- 실제 헬퍼: `property-valuation-receivable.ts:49 function receivablePV(amount, base, step, n)` = `round-half-up(amount × baseⁿ / stepⁿ)` BigInt. **현재 파일-로컬** → `export` 추가만 하면 됨(일반화·시그니처 변경 불요 → receivable 호출부 `receivablePV(s.amount, 1000, 1080, n)` 그대로, anchor 8/8 무영향).
- CB는 `RateFraction`을 base/step으로 변환해 호출:
```
pvBond(maturityAmt, principal, couponRate, rFrac, n):
  이자 = floor(principal × couponRate / 100)
  base = rFrac.denom;  step = rFrac.denom + rFrac.numer     // denom===1000 가드 (history 4행 전부 denom 1000)
  Σ_{t=1..n} receivablePV(이자, base, step, t)  +  receivablePV(maturityAmt, base, step, n)
```
※ **PV(R) 미계산** — 발행가액(issuePrice) 직접 사용 (A#1 Critical). R은 min 판정 전용.

### 4.3 발생이자 `deriveAccruedInterest(item)` — `floor(cbPrincipal × cbCouponRate/100 × days/365)`, days = `differenceInDays(평가기준일, cbInterestBaseDate)`.
> **Do 환류(윤년)**: date-fns는 윤년 실제일수를 정확 산정(사례 C 2015-12-31→2016-04-01 = **92일**). 교재는 91일 근사(사례 A2 비윤년은 92→교재 91 일치). 윤년 ±1일 차로 anchor tolerance 초과 시 `cbAccruedInterestOverride`로 교재값 직접 주입(사례 C anchor가 이 경로 — auto-derive 정확성은 A1·A2가 검증).

### 4.4 배당차액 `computeCbDividendDifference(item)` — `floor(cbFaceValuePerShare × cbPriorDividendRate/100 × days/365 × cbShareCount)`, days = 사업연도개시→배당기산일 전일. **floor 통일**(검토 #5: round-half-up은 사례 A-2에서 off-by-1 → 6,164,384; floor=6,164,383이 교재 일치. 차감항 절사 = 납세자 유리, 법령 명문 없으면 floor). BigInt 정수연산.

### 4.5 적정할인율 — `resolveCbDiscountRate(valuationDateISO)` = **`resolveReceivableDiscountRate` 재사용 + 2001-01-01 미만 가드 래퍼**(검토 #7: 원 함수는 가드 없이 history[0] 침묵반환 → CB 진입부에서 별도 가드). 신규 테이블 정의 금지(B#1·#2). 시작일 충돌 Do전 reconcile(§9.1).

## 5. 조문 상수
`lib/tax-engine/legal-codes/inheritance-gift.ts`: `CB_VALUATION_58_2` (상증령 §58의2), `CB_DISCOUNT_RATE_18_3` (상증칙 §18의3), `DIVIDEND_DIFF_57_3` (§57③). 리터럴 금지.

## 6. 클라이언트 평가 진입 (valuationDate 주입)
`lib/calc/estate-item-valuation.ts computeEffectiveValuation`에 `case "convertible_bond"` → `evaluateConvertibleBond(item, valuationDate).valuatedAmount` (엔진 단일진실, dual-truth 없음). 평가기준일은 InheritanceTaxForm·gift-api `inject*ValuationDate` 패턴(#403).

## 7. 동기화 지점 — 계획서 §5 참조
엔진측: estate.types + barrel(`CbSecurityType`) + property-valuation switch + 신규 엔진파일 + gift-deemed-rates(`resolveReceivableDiscountRate` 재사용) + **receivable(`receivablePV` export만 추가, 시그니처 무변경)** + asset-category + legal-codes. 나머지 UI/검증/정책은 UI 설계·계획 §5.

## 8. anchor 테스트 매핑 (계획서 §7)
| anchor | 케이스 | 기대값 | tolerance |
|---|---|---|---|
| cb-A1 | CB-B1b | 512,493,150 | ±3 |
| cb-A2 | CB-B2가 | 1,993,835,617 | ±3 |
| cb-B1 | CB-B1a | 79,211,758 | ±3 (PV(R)=발행가액) |
| cb-B2 | CB-B2다 | 400,000,000 | 0 |
| cb-C | CB-B2나 | 1,278,624,603 | ±2,000 (천원절사) |
| cb-D / cb-D2 | CB-B2라 | 400,000,000 / 100,000,000 | 0 (자체산식) |
| cb-pv | 발행가액 | 5억 / 10억 | 0 |
| cb-regress | receivable 8/8 | green | — |

## 9. 동결 전 확인 (계획서 §9 동기화)
배당차액 본칙(§57③→상증규, floor 통일 근거)·적정할인율 §18의3 부칙+시작일 reconcile(2010-11-05~2011-07-25 구간 receivable·CB 동시영향)·만기상환금액 정의·유효이자율 처리·§22 금융재산공제 적격·라목 자체anchor. 전부 Do STEP 0에서 KoreanLaw 검증 후 동결.

### 9.2 scope-out
- 마목(기타): `CbSecurityType` 4멤버(가~라)에 대응 enum 없음 → 4종으로 충분, **마목 미구현 명시**(검토 #10).
- 2001-01-01 미만 적정할인율: §4.5 가드로 "확인 필요" 차단.
- 비par 발행·B측 §58①2호나 단서 대체경로·라목 거래소 종가평균 자동조회: 계획 §9.2.
