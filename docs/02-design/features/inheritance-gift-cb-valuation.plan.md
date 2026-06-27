# 전환사채 등의 평가 (전환사채·신주인수권부사채·신주인수권증권·신주인수권증서) — 구현 계획서

> 상속·증여 재산목록에 "전환사채등"을 자산종류로 추가하고 **상증법 §63①2호 + 상증령 §58의2** 보충적 평가를 재현한다.
> 직전 커밋 #403 `receivable`(채권평가 §58②)과 지상권 §61③를 정확한 구현 템플릿으로 따른다.
> 범위: **4종 전부 풀 재현** + **산식 풀입력**(사용자 확정 2026-06-27).
> 작성일 2026-06-27 · 브랜치 `feat/inheritance-gift-cb-valuation` (worktree slot 2).

---

## 0. 핵심 구분 — "재산평가"이지 "이익의 증여(§40)"가 아님

- 본 작업은 전환사채등 **그 자체를 상속·증여재산으로 평가**(§63①2호·§58의2)하는 것.
- 기존 증여세 "증여로 보는 경우"의 §40(전환사채 주식전환 이익의 증여)와 **별개**. §40은 `gift-deemed/convertible-bond.ts`에 이미 구현됨(건드리지 않음).
- 단, #403의 round-half-up 헬퍼(`property-valuation-receivable.ts:49 receivablePV`)는 산식 동일 계열 → **export 추가 후 재사용**(§4.2).

---

## 1. 범위 — 교재 4장(제2절 전환사채 등의 평가) 케이스 전부

상증령 §58의2 본문(KoreanLaw 검증 완료 2026-06-27, MST 283637) 기준. 교재 요약표(이미지1·2)를 법령 본문으로 보정.

### 1.1 평가방법 매트릭스 (전수 enumerate)

| 대분류 | 시점/사유 | 평가방법 | 법령 |
|---|---|---|---|
| **A. 거래소 거래 전환사채등** | 2개월 거래실적 有 | `Max(① 평가기준일 이전 2개월 종가평균, ② 평가기준일 이전 최근일 최종시세)` | §58의2① → §58①1호 |
| | 2개월 거래실적 無·타인매입 | 매입가액 + 평가기준일까지 미수이자상당액 (발행기관·발행회사 액면 직접매입 제외) | §58①2호가 |
| | 2개월 거래실적 無·그외 | 처분예상금액 | §58①2호나 |
| **B. 비거래소 전환사채등** | | | §58의2② |
| ─ 전환 **불가능** 기간 | 신주인수권증권 | `Max(0, PV(만기상환금액,R) − PV(만기상환금액,r))` | ②1호가 |
| | 그 외(전환사채 포함) | `PV(만기상환금액, min(R,r)) + 발생이자상당액` | ②1호나 |
| ─ 전환 **가능** 기간 | 전환사채 | `Max(①1호나목, 전환가능주식가액 − 배당차액)` | ②2호가 |
| | 신주인수권부사채 | `Max(①1호나목[=a], a − b + c)` (b·c 아래 정의) | ②2호나 |
| | 신주인수권증권 | `Max(① 신주인수권부사채의[PV(R)−PV(r)], ② 인수가능주식가액 − 배당차액 − 신주인수가액)` | ②2호다 |
| | 신주인수권증서 | 1) 거래소 거래: 전체 거래일 종가평균 / 2) 그외: 인수가능주식 권리락전가액 − 배당차액 − 신주인수가액 (상장주식 단서 있음) | ②2호라 |
| | 기타 | 가~다목 준용 | ②2호마 |

신주인수권부사채(②2호나) 보조항 (교재 사례 C로 확정):
- `a` = `PV(만기상환금액, min(R,r)) + 발생이자` (= ①1호나목 = 전환금지 신주인수권부사채 평가액)
- `b` = `Max(0, PV(만기상환금액, R) − PV(만기상환금액, r))` (= ①1호가목 = **전환금지 신주인수권증권** 평가액)
- `c` = `Max[ b, (인수가능주식가액 − 배당차액 − 신주인수가액) ]` (= ②2호다목 = **전환가능 신주인수권증권** 평가액)
- 신주인수권부사채(전환가능) = `Max(a, a − b + c)`

신주인수권증서 라목 2) 상장주식 단서: `권리락후 주식가액 < (권리락전 주식가액 − 배당차액)`이면 → `권리락후 주식가액 − 신주인수가액`.

> **B측 단서 override (A#5)**: §58의2② 본문 — "§58①2호나목 단서(2 이상 투자매매업자 등 평가액 평균액)에 따라 평가한 가액이 있는 경우 해당 가액으로 할 수 있다"는 비거래소(B) 전환사채등 **전체의 대체 우선경로**. MVP scope-out(직접입력 없음)이나 본문 존재 명시(§9.2).

기호: **R = 사채발행이율, r = 적정할인율, n = 만기년수**.

### ⚠️ PV 항 처리 정책 (A#1 Critical — 핵심)

산식에 나오는 두 현가항은 **계산 방식이 다르다**:
- **`PV(만기상환금액, R)` = 발행가액** (항상). R(사채발행이율)은 정의상 "만기 현금흐름의 발행일 현가 = 발행가액"을 만족시키는 발행수익률 — par채는 표시이자율, 상환할증채는 유효이자율. **입력 R(반올림값)로 직접 재계산 금지** (사례 B에서 5% 직접할인 시 1,000,367,131 → anchor 367,129원 빗나감). par 발행 가정상 발행가액 = `cbPrincipal`.
- **`PV(만기상환금액, r)` = BigInt round-half-up 계산** = `Σ 이자PV(r) + (원금+상환할증)PV(r)`, `amount × 1000ⁿ/(1000+10r)ⁿ`.
- **`PV(만기상환금액, min(R,r))`** (1호나목): min=R → 발행가액 / min=r(r<R, 드묾) → 위 BigInt 계산.
- ⇒ 1호가목 신주인수권증권 = `Max(0, 발행가액 − PV(r))`. R로 PV 계산하는 일은 없다.
- 비par(할인·할증) 발행은 scope-out (발행가액 = cbPrincipal 가정).

### 1.2 적정할인율(r) 시점별 고시 테이블 (이미지3 — 상증칙 §18의3 / 기재부고시)

| 적용기간 (상속개시일·증여일 기준) | 적정할인율 | 고시근거 |
|---|---|---|
| 2016.3.21. ~ 현재 | **8.0%** | 상증칙 §18의3 (부령 제557호) |
| 2010.11.5. ~ 2016.3.20. | 8.0% | 기재부고시 제2010-20호 |
| 2002.11.8. ~ 2010.11.4. | 6.5% | 국세청고시 제2009-29호 등 |
| 2002.7.10. ~ 2002.11.7. | 7.0% | 국세청고시 제2002-23호 |
| 2001.1.1. ~ 2002.7.9. | 7.5% | 국세청고시 제2001-14호 |

> **⚠️ single-source — 새 테이블 정의 금지 (B#1·#2·#3 Critical/High)**: §58의2의 적정할인율은 §40·§58② receivable와 **동일한 상증칙 §18의3 율**이다. 새 `resolveCbDiscountRate`/테이블을 만들면 dual-truth.
> → **기존 `resolveReceivableDiscountRate`(`lib/tax-engine/data/gift-deemed-rates.ts`) 재사용** (memory `single-source-engine-helper`).
> **⚠️ 시작일 충돌 — Do 전 reconcile 필수**: 기존 `gift-deemed-rates.ts`는 8% 시작일이 코드 `RECEIVABLE_DISCOUNT_RATE_HISTORY`=**2011-07-26**, 주석=**2010.11.5**, 본 교재=**2010.11.5** 로 3중 충돌. KoreanLaw §18의3 부칙 + 기재부고시 2010-20호 원문으로 확정 후 **receivable 테이블을 정정**(CB가 추종, 위 표는 잠정). memory `feedback_historical_statute_value_via_tribunal`. 2001 이전 부재 → "확인 필요" 가드.

### 1.3 배당차액(§57③, 상증규) 산식 (이미지3)

```
배당차액 = 1주당 액면가액 × 직전기 배당률
          × (신주발생일이 속하는 사업연도 개시일 ~ 배당기산일 전일까지의 일수 / 365)
          × 주식수
```
※ §57③ 위임 본칙(상증규 배당차액 조문)은 Do 진입 전 KoreanLaw 재검증 후 동결 (§9 확인 필요).

---

## 2. 검증된 Anchor — 교재 3사례 (전환사채·신주인수권증권·신주인수권부사채)

> 정밀도 실측(2026-06-27, 3검토자 재검증): 엔진 BigInt round-half-up `amount × 1000ⁿ / (1000+10r)ⁿ`.
> - **사례 A·B = ±2~3원** 일치(교재 현가계수 소수절사 기인).
> - **사례 C = 교재 천원단위 절사 → 엔진 원단위 1,278,624,603 vs 교재 1,278,623,000, ±2,000원 tolerance** (A#2).
> → 엔진 표준계산값을 anchor로 동결, 교재값은 위 tolerance로 참고 (메모리 `feedback_anchor_correction_legal_priority` — 절사 anchor 유지 금지).

---

### 사례 A — 전환사채 (상증기준 63-58의2-2, 이미지4 / 교재 1597~1598p)

**전제**: 발행 2009.1.1, 발행가액 5억(액면 1좌 @5,000, 상환할증조건 **아님**), 만기 3년, 발행이자율 R=3%(매년 말 1회 지급), 적정할인율 r=8%(현행), 전환권 발행 1년 후(2010.1.1~) @5,000당 신주 1주, 발행주식총수 100만주·1주당 액면 @5,000, 2010.4.1 시가 @20,000, 직전기 배당률 5%.

#### A-1 평가기준일(Ⅰ) = 2009.11.1 — 전환금지기간 (§58의2②1호나목) → **512,493,150**
- `min(R,r) = min(3%,8%) = 3%`
- ① 발행일 현재가치 = 500,000,000
  - 이자 PV = 5억×3%×연금현가계수(2.828611, n=3,r=3%) = 42,429,170
  - 원금 PV = 5억×현가계수(0.9151416, n=3,r=3%) = 457,570,830
- ② 발생이자상당액 = 5억×3%×304/365 = 12,493,150 (2009.1.1~2009.11.1, 304일)
- 평가액 = ① + ② = **512,493,150**

#### A-2 평가기준일(Ⅱ) = 2010.4.1 — 전환가능기간 (§58의2②2호가목) → **1,993,835,617**
- `Max(①, ②)`
- ① 전환금지기간 평가액(1호나목) = 503,739,726
  - 발행일 현재가치 500,000,000 + 발생이자(2010.1.1~2010.4.1, 91일) 5억×3%×91/365 = 3,739,726
  - ※ 2009년분 이자는 매년 말 액면이자 수취 → 2010.1.1~ 발생분만
- ② 전환가능주식가액 − 배당차액 = 2,000,000,000 − 6,164,383 = 1,993,835,617
  - 전환가능주식가액 = @20,000 × 100,000주 (전환가능주식수 = 5억 ÷ @5,000 = 100,000주)
  - 배당차액 = 100,000주 × @5,000 × 5% × 90/365 = 6,164,383
- 평가액 = Max(503,739,726, 1,993,835,617) = **1,993,835,617**

> **일수 기준 차이 주의 (A#4)**: 발생이자 **91일**(직전 이자지급일 2009.12.31 → 평가일 2010.4.1)과 배당차액 **90일**(사업연도개시 2010.1.1 → 배당기산일 전일)은 **서로 다른 기산점**을 쓴다. 혼동 금지.

---

### 사례 B — 신주인수권증권 (이미지 신주인수권증권 평가사례, **상환할증조건**)

**전제**: 신주인수권부사채 발행 2021.1.5, 만기 3년, 발행가액 10억(액면 1좌 @10,000, **상환할증조건**), 액면이자율 2%(매년 말), 상환할증금 95,000,000, 적정할인율 r=8%, 발행 1년 후 @10,000당 신주 1주를 **8,000원에 매입** 가능한 신주인수권증권, 발행주식총수 500,000주·@10,000, 2023.1.14 시가 @12,000, 직전기 배당 없음.
- **만기상환금액 = 원금 10억 + 상환할증금 0.95억 = 10.95억** (+ 매기 이자 2천만)
- **R = 유효이자율 5%**: 상환할증 有 → 표시이자율(2%) 아닌, 만기까지 액면이자+상환할증 합계의 발행일 PV = 발행가액(10억)을 만족시키는 이자율. (현금흐름: 1·2차 2천만, 3차 2천만+10억+0.95억=11.15억 → 발행가 10억 일치 이율 5%)

#### B-1 평가기준일(Ⅰ) = 2021.7.5 — 전환금지기간 (§58의2②1호가목) → **79,211,758** (교재) / 엔진 79,211,756 (±2)
- `Max(0, PV(만기상환금액, R) − PV(만기상환금액, r))`
- ① `PV(R)` = **발행가액 = 1,000,000,000** (유효이자율 정의상 = 발행가액. ※ 입력 R=5%로 직접 할인 금지 — 실제 5% 현금흐름 PV는 1,000,367,131로 발행가와 다름. A#1/#3)
- ② `PV(r=8%)` = 920,788,242 (BigInt: 이자PV 51,541,940 + 원금·할증PV 869,246,304)
- 평가액 = ① − ② = **79,211,758** (엔진 79,211,756)

#### B-2 평가기준일(Ⅱ) = 2023.1.4 — 전환가능기간 (§58의2②2호다목) → **400,000,000**
- `Max(①, ②)`
- ① 전환금지 신주인수권증권 평가액(가목) = 79,211,758
- ② 인수가능주식가액 − 배당차액 − 신주인수가액 = 1,200,000,000 − 0 − 800,000,000 = 400,000,000
  - 인수가능주식가액 = 100,000주 × @12,000 (인수가능주식수 = 10억 ÷ @10,000 = 100,000주)
  - 배당차액 = 0 (직전기 배당 없음)
  - 신주인수가액 = 100,000주 × @8,000 = 800,000,000
- 평가액 = Max(79,211,758, 400,000,000) = **400,000,000**

---

### 사례 C — 신주인수권부사채 (이미지4, 전환가능기간 평가기준일 Ⅱ, 단위 천원)

**전제**: 발행가액 10억, 만기 3년, R=3%(상환할증 無), r=8%, 인수가능주식 100,000주·시가 @12,000·신주인수가액 @8,000, 직전기 배당 없음, 평가기준일 발생이자 91일.

#### C 전환가능기간 신주인수권부사채 (§58의2②2호나목) → 교재 **1,278,623,000** / **엔진 1,278,624,603** (±2,000)
- `Max(a, a − b + c)`
- **a** = 전환금지 신주인수권부사채(1호나목) = 발행가액 1,000,000,000 + 발생이자(10억×3%×91/365) 7,479,452 = **1,007,479,452** (교재 1,007,479천)
- **b** = 전환금지 신주인수권증권(1호가목) = `Max(0, 발행가액 − PV(r=8%))` = 1,000,000,000 − 871,145,151 = **128,854,849** (교재 128,856천 — 천원절사 ~1.1천 차)
- **c** = 전환가능 신주인수권증권(2호다목) = `Max(b, 인수주식가액 − 배당차액 − 신주인수가액)` = Max(128,854,849, @12,000×100,000 − 0 − @8,000×100,000=400,000,000) = **400,000,000**
- ② = a − b + c = 1,007,479,452 − 128,854,849 + 400,000,000 = **1,278,624,603**
- 평가액 = Max(1,007,479,452, 1,278,624,603) = **1,278,624,603** (anchor 동결값, 교재 1,278,623,000 ±2,000)

> 사례 C는 **b·c의 산식 정의를 교재로 확정**: b = 전환금지 신주인수권증권, c = 전환가능 신주인수권증권. 신주인수권증권/부사채가 서로를 참조 → 엔진은 공용 PV·자본소득 헬퍼로 single-source.

---

### 사례 D — 신주인수권증서 (preemptive_right, 라목) — **교재 무앵커 → 자체 산식 self-consistent anchor** (C#1)

교재에 라목 단독 평가사례가 없다(`feedback_pre_anchor_verification`상 무앵커 분기 구현 금지). 사용자 "4종 전부" 선택이므로 **구현하되 자체 산식 기반 self-consistent anchor로 동결**한다.
- **라목 1) 거래소 거래**: 전체 거래일 종가평균 (입력값 echo). anchor: 입력 1,000원 → 1,000원.
- **라목 2) 비거래소(기본)**: `인수가능주식 권리락전 가액 − 배당차액 − 신주인수가액`
  - 자체 anchor `cb-D`: 권리락전 @12,000×100,000 − 0 − @8,000×100,000 = **400,000,000** (사례 B 전제 차용, 산식 검산용)
  - **상장주식 단서**: `권리락후 주식가액 < (권리락전 주식가액 − 배당차액)` → `권리락후 주식가액 − 신주인수가액`. anchor `cb-D2`: 권리락후 @9,000×100,000 − @8,000×100,000 = 100,000,000 (단서 발동 검증)
- §9.1에 "라목 교재 사례 부재 → 자체 산식 anchor, 실제 집행례 확인 권장" 명시.

---

### 2.99 정밀도 결정 (실측 완료 — A#1·#2 정정 반영)
- 엔진 PV(r) = round-half-up BigInt `amount × baseⁿ / stepⁿ` (base=denom, step=denom+numer; 이자는 항별 연금합, 원금+상환할증은 단일항). receivable `receivablePV` **export 재사용**.
- **PV(R) 항은 계산하지 않고 발행가액(=cbPrincipal) 사용** (§1.1 PV 정책). 입력 R은 min(R,r) 판정용.
- 1호나목 발행일 현재가치 = min=R → 발행가액 / min=r → `Σ 이자PV(r) + (원금+상환할증)PV(r)`.
- tolerance: **사례 A·B ±3원, 사례 C ±2,000원**(교재 천원절사). 엔진 표준계산값을 anchor로 동결.

---

## 3. 데이터 모델 — `AssetCategory` 신규 종류 + EstateItem 필드

### 3.1 `AssetCategory` 추가 (`lib/tax-engine/types/inheritance-gift-estate.types.ts`)
```ts
| "convertible_bond"   // 전환사채등 (§63①2호·§58의2)
```
+ 증권 종류 enum:
```ts
export type CbSecurityType =
  | "convertible_bond"        // 가. 전환사채
  | "bond_with_warrant"       // 나. 신주인수권부사채
  | "warrant_certificate"     // 다. 신주인수권증권
  | "preemptive_right";       // 라. 신주인수권증서
```

### 3.2 EstateItem 필드 (지상권·receivable 필드 인접 추가, 전부 optional) + **노출조건**(C#3)
| 필드 | 타입 | 용도 | 노출조건 |
|---|---|---|---|
| `cbSecurityType` | `CbSecurityType` | 4종 구분 (기본 convertible_bond) | 항상 |
| `cbTradedOnExchange` | `boolean` | 거래소 거래 여부 (A/B 분기) | 항상 |
| `cbHasTradeRecord` | `boolean` | 2개월 거래실적 유무 | A (거래소 ON) |
| `cbExchange2mAvg` / `cbExchangeLatestPrice` | `number` | 2개월 종가평균·최근시세 | A & 실적有 |
| `cbExchangeSubMode` | `"purchase"\|"disposal"` | §58①2호 가/나 선택 (RadioCardGroup) | A & 실적無 |
| `cbPurchasePrice` / `cbAccruedInterestToBase` | `number` | 매입분(2호가) | A & 실적無 & purchase |
| `cbDisposalExpected` | `number` | 처분예상금액(2호나) | A & 실적無 & disposal |
| `cbConvertible` | `boolean` | 주식전환 가능 여부 (B 분기) | B (거래소 OFF) |
| `cbPrincipal` | `number` | 원금(액면총액) = **발행가액(par)** | B |
| `cbHasRedemptionPremium` | `boolean` | 상환할증조건 여부 | B |
| `cbRedemptionPremium` | `number` | 상환할증금 | B & 할증有 |
| `cbCouponRate` | `number` | 표시 액면이자율 (%) | B |
| `cbIssueRate` | `number` | 유효이자율 R (%) — min(R,r) 판정용 | **B & 할증有만**(무할증=cbCouponRate 자동, C#7) |
| `cbMaturityYears` | `number` | 만기년수 n | B |
| `cbAccruedInterestOverride` | `number` | 발생이자 override (auto-derive 우선, C#5) | B (선택) |
| `cbInterestBaseDate` | `Date` | 직전 이자지급일(발생이자 일수 산정) | B |
| `cbConvertibleShareValue` | `number` | 전환·인수가능 주식가액(시가×주식수) | B & 전환가능 & 가·나·다목 |
| `cbDividendDifferenceOverride` | `number` | 배당차액 override (auto-derive 우선, C#5) | B & 전환가능 (선택) |
| `cbFaceValuePerShare` / `cbPriorDividendRate` / `cbShareCount` / `cbDividendBaseDate` | `number`/`Date` | 배당차액 auto-derive 입력 | B & 전환가능 |
| `cbSubscriptionPrice` | `number` | 신주인수가액 | 나·다·라목 |
| `cbExRightsPriorPrice` / `cbExRightsPostPrice` | `number` | 권리락 전·후 가액 | 라목(신주인수권증서) |

**정정 반영**:
- ~~`cbIssuePrice`~~ 제거 (C#4): 발행가액 = `cbPrincipal`(par 발행). 발행일 현재가치는 §1.1 PV 정책상 발행가액 = cbPrincipal. 비par 발행은 scope-out.
- ~~`cbAccruedInterest`/`cbDividendDifference`(토글)~~ → **auto-derive + override** (C#5): superficies `resolveSuperficiesTenureYears`+`superficiesRemainingYearsOverride` 패턴. 엔진이 일수·율로 derive, `*Override` 입력 시 우선. **ToggleCard 2개 제거** → useMemo derive(useEffect store 미러링 회피, mirror-pattern 자연 충족).
- `cbIssueRate`는 **상환할증有일 때만** 노출(C#7). 무할증이면 R=cbCouponRate 자동 — 동일값 이중입력 방지.

---

## 4. 엔진 설계 — `lib/tax-engine/property-valuation-convertible-bond.ts` (800줄 정책상 분리)

### 4.1 진입 함수 `evaluateConvertibleBond(item, valuationDate)`
```
1) cbTradedOnExchange === true  → evaluateExchangeCb()   (A)
2) else                         → evaluateNonExchangeCb() (B)
   - cbConvertible === false → 전환불가 기간 (1호 가/나목)
   - cbConvertible === true  → 전환가능 기간 (2호 가~라목)
   - cbSecurityType 으로 가~라목 분기
```
+ `property-valuation.ts:541 evaluateEstateItem` switch에 `case "convertible_bond"` 추가.

### 4.2 PV 헬퍼 — `receivablePV` export 재사용 (확정, B#7 / 엔진검토 #1·#3)
- 실제 헬퍼명은 `property-valuation-receivable.ts:49 receivablePV(amount, base, step, n)` = `round-half-up(amount × baseⁿ/stepⁿ)` (파일-로컬, ~~pvRoundHalfUp~~ 오기 정정). **`export` 추가만** 하면 됨 — 이미 base/step 인자라 일반화·시그니처 변경 불요. receivable 호출부 `receivablePV(amt, 1000, 1080, n)` 그대로 → anchor 8/8 무영향.
- CB는 `RateFraction{numer,denom}`을 `base=denom, step=denom+numer`로 변환 호출(denom===1000 가드).
- §40 헬퍼(`gift-deemed/convertible-bond-helpers.ts`)는 PV factor **외부주입** 방식이라 접근 상이 → **재사용 후보 제외**.
- **PV(R) 미계산**: 발행일 현재가치 = 발행가액(cbPrincipal), §1.1 정책. PV(r)만 위 헬퍼로 계산.

### 4.3 배당차액 `computeCbDividendDifference(item)` — §1.3 산식, **BigInt floor**(엔진검토 #5: round-half-up은 사례 A-2 off-by-1, floor=6,164,383 교재 일치 — 차감항 절사). `cbDividendDifferenceOverride` 우선(auto-derive+override, C#5).

### 4.4 적정할인율 — `resolveCbDiscountRate` = **`resolveReceivableDiscountRate(valuationDate)` 재사용 + 2001-01-01 미만 가드 래퍼**(B#1·#2 single-source / 엔진검토 #7: 원함수 무가드 침묵반환). 신규 테이블 금지. 시작일 충돌 Do 전 reconcile(§1.2·§9.1).

### 4.5 조문 상수 — `lib/tax-engine/legal-codes/`에 `INHERITANCE.CB_VALUATION_58_2` 등 (리터럴 금지).

---

## 5. 동기화 지점 (receivable #403 변경 파일 = 정확한 체크리스트)

> #403가 `Record<AssetCategory>` 10곳 포함 25파일을 변경. 동일 지점 전수.

> #403 git show --stat 실측: 소스 22 파일. CB도 동일 지점 + 아래 **B검토 추가 3건**.

**타입/엔진**
- [ ] `lib/tax-engine/types/inheritance-gift-estate.types.ts` — AssetCategory + CbSecurityType + EstateItem 필드
- [ ] **`lib/tax-engine/types/inheritance-gift.types.ts` — barrel re-export `CbSecurityType` (B#3 누락분, 미추가 시 UI import tsc 에러)**
- [ ] `lib/tax-engine/property-valuation.ts` — evaluateEstateItem switch case
- [ ] `lib/tax-engine/property-valuation-convertible-bond.ts` — 신규 엔진(800줄 분리)
- [ ] **`lib/tax-engine/data/gift-deemed-rates.ts` — `resolveReceivableDiscountRate` 재사용(신규 정의 X), 시작일 충돌 reconcile (B#1·#2)**
- [ ] **`lib/tax-engine/property-valuation-receivable.ts` — `receivablePV` export 추가(시그니처 무변경, B#7, receivable 회귀 게이트)**
- [ ] `lib/tax-engine/inheritance-asset-category.ts` — `CATEGORY_TO_SUMMARY` (→ financial/유가증권)
- [ ] `lib/tax-engine/legal-codes/` — 조문 상수 `CB_VALUATION_58_2`

**UI dispatch**
- [ ] `components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx` — 신규
- [ ] `components/calc/inheritance/estate-card/variants/index.ts` — import/export + `pickBodyVariant`(미사용이나 exhaustive `assertNever`라 tsc 강제, B#6)
- [ ] `components/calc/EstateItemEditor.tsx` — `VariantBody` switch (**실사용 dispatch**)
- [ ] ~~`variants/types.ts SupportedCategory`~~ — #403 미변경, `Exclude<AssetCategory,...>` **자동파생** → CB 전용 prop 타입 추가 시에만 편집 (B#8 강등)

**메타/카테고리 (Record<…> — tsc 강제)**
- [ ] `estate-category-meta.ts` — `CATEGORY_LABELS`("전환사채등")·`CATEGORY_ICONS` (Record) + `GIFT_CATEGORIES`(배열)
- [ ] `CategoryChangeDialog.tsx` — `CATEGORY_LABELS`(Record) + `INHERITANCE_CATEGORIES`·`GIFT_CATEGORIES`(배열)
- [ ] `inheritance-filing-form-helpers.ts:121 ESTATE_ITEM_TYPE_CODE`(Record) · `besshi-buppyo-2-data.ts:44` · `deduction-besshi-data.ts:243` (Record)

**검증/평가**
- [ ] `lib/validators/estate-item-schema.ts` — `convertibleBondItemSchema`(**cb* 全필드 1줄씩 등재 — 1개 누락 시 Zod 침묵 strip ⑫**, B point3) + discriminatedUnion + `COORD_INCOMPATIBLE`(배열) + 분기별 `superRefine`(§5.1)
- [ ] `lib/calc/estate-item-valuation.ts` — `computeEffectiveValuation` case (엔진 위임 = dual-truth 없음, 평가기준일 주입)
- [ ] **`lib/tax-engine/inheritance-tax-financial-eligibility.ts:42 FINANCIAL_CATEGORY_DEFAULT`(`Partial<Record>` — tsc 미감지) — §22 금융재산공제 적격 여부 명시 결정 (B#4, §5.2)**

**토글/정책 (Record — tsc 강제)**
- [ ] `lib/calc/asset-toggle-visibility.ts` — `MATRIX`·`CULTURAL_HERITAGE_VISIBILITY` (영농·가업 hidden)
- [ ] `lib/calc/deemed-category-policy.ts` — Record + `INHERITANCE_CATEGORIES`(배열)

**평가기준일 주입**
- [ ] `components/calc/InheritanceTaxForm.tsx` · `lib/calc/gift-api.ts` (#403 `inject*ValuationDate` 패턴 — 엔진 n·발생이자 일수·할인율 단일산정)

**결과뷰** (C#2 — receivable는 부표2 라인+라벨만, 결과화면 산식카드 없음)
- [ ] `components/calc/results/InheritanceTaxResultView.types.ts` · `inheritance-filing-form-helpers.ts` — 부표2 라인/코드 라벨

> ⚠️ **tsc 미감지 silent 지점(grep 자가점검 필수)**: `deemed-category-policy.ts INHERITANCE_CATEGORIES`, `estate-category-meta.ts GIFT_CATEGORIES`, `CategoryChangeDialog.tsx`(2곳), `estate-item-schema.ts COORD_INCOMPATIBLE`, `inheritance-tax-financial-eligibility.ts FINANCIAL_CATEGORY_DEFAULT(Partial)` — 배열 5종 + Partial 1종.

### 5.1 분기별 필수입력 (superRefine — 자동 안분 fallback 금지, B#5)
| 분기 | required |
|---|---|
| A & 실적有 | cbExchange2mAvg, cbExchangeLatestPrice |
| A & 실적無 & purchase | cbPurchasePrice (cbAccruedInterestToBase 0 허용) |
| A & 실적無 & disposal | cbDisposalExpected |
| B 공통 | cbPrincipal, cbCouponRate, cbMaturityYears, (할증有→cbRedemptionPremium·cbIssueRate) |
| B & 전환가능 & 전환사채(가) | cbConvertibleShareValue + 배당차액 입력(또는 override) |
| B & 전환가능 & 부사채(나) | cbConvertibleShareValue, cbSubscriptionPrice + 배당차액 (c=Max(b, 주식가액−배당차액−신주인수가액)) |
| B & 전환가능 & 신주인수권증권(다) | cbConvertibleShareValue(인수가능주식가액), cbSubscriptionPrice |
| B & 전환가능 & 신주인수권증서(라)·비거래소 | cbExRightsPriorPrice, cbSubscriptionPrice (+ 상장단서 시 cbExRightsPostPrice) |

미입력은 **validation 차단**(자동 0 채움 금지, `feedback_no_silent_apportion_fallback`). UI 통과↔validate 차단 모순 금지(`feedback_validation_sync_8th_point`).

### 5.2 §22 금융재산상속공제 적격 (B#4 — Do 전 결정)
전환사채등은 유가증권. §22①·상증령 §19 "금융재산" 정의에 회사채/유가증권 포함 여부를 KoreanLaw로 확인 후 `FINANCIAL_CATEGORY_DEFAULT`에 등재 여부 결정. receivable는 **미포함** 선택했음 — CB도 동일 선례 따를지 법령 근거로 단정(추정 금지).

---

## 6. UI 명세 (`EstateBodyConvertibleBond`)

UI 순서 = 엔진 로직 순서 (메모리 `feedback_ui_order_follows_logic`). root testid `estate-body-variant-convertible-bond-${id}`, inner testid는 receivable 패턴(C#6):
1. 자산명 + **증권 종류** `RadioCardGroup` (전환사채/신주인수권부사채/신주인수권증권/신주인수권증서) — `cb-security-type-${id}`
2. **거래소 거래 여부** `ToggleCard`
   - ON(A): 2개월 거래실적 `ToggleCard` → 종가평균·최근시세(`cb-2m-avg`·`cb-latest`) / (실적無) **`RadioCardGroup`(매입분 2호가 / 처분예상 2호나, C#8 — native select 금지)** → `cb-purchase-price`·`cb-disposal-expected`
   - OFF(B): cbPrincipal(`cb-principal`)·표시이자율(`cb-coupon-rate`)·만기년수 n(`cb-maturity`)·상환할증 ToggleCard→상환할증금·유효이자율(`cb-issue-rate`, **할증有만**)
3. **주식전환 가능 여부** `ToggleCard` (B 전용)
   - 발생이자: **auto-derive 읽기전용 표시**(직전이자지급일 `cb-interest-base-date`로 일수 산정) + `cb-accrued-override` 직접입력 override (토글 없음, C#5)
   - 전환가능 시 주식가액: 가·나·다목 = 전환·인수가능주식가액(`cb-conv-share-value`, 시가×주식수) / **라목 = 권리락전가액(`cb-exrights-prior`)** + 배당차액 **auto-derive(액면·배당률·배당기산일·주식수) + `cb-dividend-override`**
   - 신주인수권 종류(나·다·라목): 신주인수가액(`cb-subscription-price`) / (라목 상장단서) 권리락후가액(`cb-exrights-post`)
4. 적정할인율 r 표시(평가기준일 기준 `resolveReceivableDiscountRate` 자동, 읽기전용 배지)
- **결과 표시 (C#2 — 템플릿 실태 준수)**: receivable·superficies는 **결과화면 산식카드 없이** 부표2 명세서 라인 + 카테고리 라벨("전환사채등")로 평가액만 노출(`besshi-buppyo-2-data.ts`·`InheritanceTaxResultView.types.ts`). `formula-display-builder`/`VariableBadge`는 components/calc에 **부재** → 사용 안 함. 산식 풀이가 필요하면 별도 컴포넌트 신설 + §5 결과뷰 항목·amount-column-align 추가해야 하나 **MVP는 템플릿 동일(라인 노출)**.
- 입력 전체선택(SelectOnFocusProvider 자동), DateInput(type=date 금지), CurrencyInput/DecimalInput. 사이드바 합계(⑥)는 `computeEffectiveValuation`→grossEstate 자동집계로 **무영향**(추정 아님 — receivable 동일 경로, Do 시 확인).

---

## 7. Pre-Do Anchor (Do 진입 전 우선 작성·실행 — 메모리 `feedback_pre_anchor_verification`)

`__tests__/tax-engine/property-valuation/convertible-bond-58-2.test.ts`:
- [ ] `cb-A1` 전환사채 전환금지(Ⅰ) = **512,493,150** (±3원)
- [ ] `cb-A2` 전환사채 전환가능(Ⅱ) = **1,993,835,617** (±3, 보조: 503,739,726 / 배당차액 6,164,383)
- [ ] `cb-B1` 신주인수권증권 전환금지(Ⅰ) = **79,211,758** (±3, PV(r8)=920,788,242, **PV(R)=발행가액 1,000,000,000 — 5% 직접할인 금지**)
- [ ] `cb-B2` 신주인수권증권 전환가능(Ⅱ) = **400,000,000**
- [ ] `cb-C` 신주인수권부사채 전환가능 = **1,278,624,603** (**±2,000원** 천원절사, a=1,007,479,452 / b=128,854,849 / c=400,000,000)
- [ ] `cb-D` 신주인수권증서(라목 2) = **400,000,000** (자체산식 self-consistent) / `cb-D2` 상장단서 = 100,000,000
- [ ] `cb-pv` 발행일 현재가치 = 발행가액(cbPrincipal): 사례 A 500,000,000 / 사례 B·C 1,000,000,000
- [ ] `cb-regress` **receivable anchor 8/8 green** (receivablePV export 후 회귀 게이트, B#7)

→ anchor 실행해 PV(R)=발행가액·상환할증·라목 처리 확정 후 §4 동결. "현행 일치 예상" 금지.

---

## 8. 구현 순서 & 검증기준 (Goal-Driven)

```
0. (Do 전) §9.1 KoreanLaw 검증 + 할인율 시작일 reconcile  → verify: 본문 동결
1. 타입(AssetCategory·CbSecurityType·EstateItem) + barrel  → verify: tsc 0
2. Pre-Do anchor 8건 작성 (실패 확보)                      → verify: 7 fail + cb-regress 8/8 green
3. receivablePV export 추가                               → verify: receivable anchor 8/8 유지
4. 엔진(property-valuation-convertible-bond.ts) + dispatch  → verify: cb anchor 7건 pass (tolerance별)
5. Zod(cb* 全필드)·superRefine 분기·validate·평가기준일 주입 → verify: tsc 0 + 분기 필수입력 차단
6. UI(EstateBodyConvertibleBond) + dispatch + 메타 + 노출조건 → verify: 수동 폼→계산→결과
7. Record 강제 + 배열 5종/Partial grep + §22 적격 결정      → verify: grep 자가점검 + tsc 0
8. E2E `e2e/convertible-bond-valuation.spec.ts`            → verify: 2/2
```
완료 게이트: `npx tsc --noEmit` 0 · cb anchor 7 + receivable 8/8 · 전체회귀 0 · E2E 2/2 · 브라우저 수동확인.

---

## 9. 확인 필요 — Do 진입 전 KoreanLaw 검증

### 9.0 ✅ 검증 동결 (2026-06-27, MST 283637)
- 상증령 §58의2 전문 (4종 × 전환가능/불가능, 가~마목)
- 상증령 §58①(거래소·국채등 준용), §57③(배당차액 위임)

### 9.1 ⚠️ Do 전 추가 검증
- [ ] **배당차액 본칙**: §57③ → 상증규(배당차액 산식 조문) 본문 — 이미지3 산식과 일치 확인 후 동결
- [ ] **적정할인율 §18의3** 본문 + 부령 제557호 부칙 — 시대표율 출처 동결 **+ 8% 시작일 충돌 reconcile(2010.11.5 vs 2011.07.26 vs 코드, B#2)**, receivable 테이블 정정 후 CB 추종
- [ ] **만기상환금액 정의**(만기전 발생이자 포함 여부) — §58의2②1호 본문 재확인
- [ ] **유효이자율(R) 처리**: 상환할증조건 시 R=유효이자율(재재산-1036). PV(R)은 계산 않고 발행가액 사용(A#1) — R은 min(R,r) 판정용. 발행가·현금흐름 역산은 scope-out
- [ ] **§22 금융재산공제 적격**(B#4): §22①·상증령 §19 금융재산 정의에 전환사채등 포함 여부 → `FINANCIAL_CATEGORY_DEFAULT` 등재 결정
- [ ] **신주인수권증서 라목**(C#1): 교재 단독 사례 부재 → 자체 산식 anchor(cb-D)로 동결, 실제 집행례 확인 권장

### 9.2 미구현 edge case (scope-out, 명시)
- 비거래소(B) 전환사채등 **§58①2호나목 단서 대체경로**(2 이상 투자매매업자 평가 평균액 우선)(A#5) → 직접입력만
- 거래실적無 "처분예상금액 산정곤란 시 재정경제부령 평가"(§58①2호나 단서) → 직접입력만
- 신주인수권증서 라목 "거래소 거래 종가평균" 자동조회(키움) → 수동입력
- 비par(할인·할증) 발행 → 발행가액=cbPrincipal 가정(C#4)
- 2001.1.1. 이전 적정할인율 → "확인 필요" 가드(본문 부재)

---

## 10. 트레이드오프 메모 (CLAUDE.md Think Before Coding)
- **단순화 여지**: 신주인수권증권/증서는 실무 빈도 극히 낮음. 4종 풀구현은 사용자 명시 선택. → 4종 확정 진행.
- **정밀도**: 교재 현가계수 절사 → A·B ±3원, C ±2,000원(천원절사). 엔진 BigInt 표준계산값 동결.
- **입력 부담**: 산식 풀입력 필드 多 → auto-derive(발생이자·배당차액)+override로 완화(토글 제거, superficies 패턴).

## 11. STEP 1 검토 반영 이력 (3검토자, 정정 25건)
- **검토자 A(법령·산식)**: PV(R)=발행가액 항상[Critical]·사례C ±2,000원[High]·B분해값 삭제·일수차주석·B측단서·할인율Do전.
- **검토자 B(14동기화·정책)**: 할인율 single-source[Critical]·시작일충돌[High]·barrel[High]·§22적격·분기validation·pvRoundHalfUp일반화·types.ts강등·배열5종전수.
- **검토자 C(단순화·UI)**: 라목 무앵커[Critical]·결과산식 컴포넌트부재[High]·노출조건매트릭스[High]·cbIssuePrice중복·토글2개제거·testid·R게이트·RadioCardGroup.
