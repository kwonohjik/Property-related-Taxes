# 전환사채등 주식전환 이익의 증여 (§40) — 보완 엔진 설계 (ENGINE DESIGN)

> 계획서: [`docs/00-pm/gift-convertible-bond-40.plan.md`](../../00-pm/gift-convertible-bond-40.plan.md) (13단계 자가검토 v2 반영)
> 대상 모듈: `lib/tax-engine/gift-deemed/convertible-bond.ts` (현행 4 caseType 보완)
> 법령 검증: KoreanLaw MCP 현행본(상증법 MST 276123 / 상증령 283637 / 상증칙 284609) — 전수 본문 대조 완료
> 작성일 2026-06-25 / 브랜치 `feat/gift-convertible-bond-40`

---

## 0. 설계 원칙

1. **엔진 코어 순수성**: `bondAcquisition`·`bondConversion`·`bondConversionReverse`·`bondTransfer`는 **최종값만 수신·차감**한다. 자동계산(이자손실분 PV·초과분 비율)·재안분·시가평가를 코어에서 수행하지 않는다 → dual-truth·이중곱 원천 차단.
2. **자동계산 분리**: 이자손실분(§10의2)·초과분 비율(②⑤)은 **전용 순수 헬퍼**로 산출 → lib/calc 변환계층(권장) 또는 dispatcher pre-step에서 코어 입력(`creditedShares`·`interestLoss`·②시가/인수가)을 도출. 코어는 도출된 최종값만 본다.
3. **명시 모드**: 자동/직접은 명시 플래그(`autoInterestLoss`·`autoExcess`)로 분기 — presence-derive·silent fallback 금지(`feedback_no_silent_apportion_fallback`).
4. **정수 연산**: 금액 원 단위. 율은 `{numer,denom}` 분수 + `applyRateFraction`/`safeMultiplyThenDivide`(floor). 부동소수 곱 금지.
5. **시가 input**: 전환사채등·신주인수권증권 §58의2 평가는 시가 input으로 수신(기존 자본거래 의제 설계원칙, `types.ts:166`). 자동평가 SCOPE OUT.

---

## 1. 타입 (`lib/tax-engine/gift-deemed/types.ts`)

### 1.1 엔진 코어 입력 (ConvertibleBondInput — 최종값만)
```ts
export interface ConvertibleBondInput {
  caseType?: "acquisition" | "conversion" | "conversion_reverse" | "transfer";
  bondMarketValue: number;            // 전환사채등 시가 (§58의2 평가결과 input; ② 초과분 반영값)
  acquisitionPrice?: number;          // ①②③ 인수·취득가액 (② 초과분 반영)
  transferPrice?: number;             // ⑧ 양도가액
  preConvPrice?: number;              // ④⑤⑥⑦ 전환등 전 1주당 평가가액
  preConvShares?: number;             // 전환등 전 발행주식총수
  conversionPrice?: number;           // 1주당 전환가액등
  increasedShares?: number;           // 전환등 증가주식수 (㉡ 가중평균 분모/분자)
  creditedShares?: number;            // [신규] 교부받은 주식수=이익승수 (미입력=increasedShares; ④⑥ 전부 / ⑤ 초과분)
  isListed?: boolean;                 // [신규] 주권상장법인 (§30⑤1 Min/Max 단서)
  listedMarketAvg?: number;           // [신규] 전환일 전후 2개월 종가평균(㉠)
  interestLoss?: number;              // 이자손실분 §10의2 — 최종값(초과분 안분 포함). 엔진 재안분 금지
  acquisitionGainPrior?: number;      // 인수시 기과세이익 (§30①1)
  bondTransferGainForCap?: number;    // [신규 G6] 전환사채 양도차익(양도가−취득가) — 양도 cap 한도
  relatedPreRatio?: { numer: number; denom: number };  // ⑦ 라목 특수관계인 전환전 지분율
}
```
> 현행(types.ts:236-252) 대비 신규: `creditedShares`·`isListed`·`listedMarketAvg`·`bondTransferGainForCap` 4개. 전부 optional. 기존 필드 변경 없음(append).

### 1.2 자동계산 raw 입력 (폼·변환계층 전용 — 엔진 input 비포함)
```ts
// DeemedFormState(폼) + lib/calc에서 소비. 엔진 코어 미사용. (구현 폼 필드명 cb*)
autoInterestLoss?: boolean;            // ON=PV 자동(현가계수) / OFF=interestLoss 직접
cbBondMaturity;                        // 만기상환금액(원금) = ㉠ par
cbCouponRatePct;                       // 사채발행이율 % (연이자 도출)
cbPvFactorAppr;                        // 적정할인율 현가계수 (예 0.73502)
cbAnnuityFactorAppr;                   // 적정할인율 연금현가계수 (예 3.31212)
autoExcess?: boolean;                  // ON=초과분 자동 / OFF=creditedShares·초과분값 직접 (autoInterestLoss와 독립)
ownPreRatio?: { numer; denom };        // 본인 전환전 지분율
subscribedShares?: number;             // 인수(전환) 주식수
totalSubscribableShares?: number;      // 전환사채 총인수가능주식수
```

### Router (`router.ts`)
```ts
case "convertible_bond": return calcConvertibleBondGift(input);  // 현행 유지
```
> §43① 중복배제·§43② 합산 후처리는 본 의제 범위 외(단일 의제 산출).

---

## 2. 규정별 설계 (`convertible-bond.ts`)

### (1) 인수·취득 ①②③ — `bondAcquisition` (§40①1호 / 영 §30①1)

**케이스 인벤토리**
| ID | 유형 | 조건 | 산식 |
|---|---|---|---|
| CB-ACQ-1 | ① 특수관계인 저가취득 | gain ≥ 기준 | `시가 − 취득가` |
| CB-ACQ-2 | ① 임계미달 | gain < 기준 | `applied=false` |
| CB-ACQ-EXCESS | ② 주주 균등초과 | (초과분반영 시가·인수가) | `시가 − 인수가` (헬퍼가 초과분 도출) |
| CB-ACQ-3RD | ③ 제3자 저가인수(전부) | gain ≥ 기준 | `시가 − 취득가` (균등배정 없음) |

**알고리즘**
```
gain = bondMarketValue - (acquisitionPrice ?? 0)
threshold = min(applyRate(bondMarketValue, 0.3), 100_000_000)   // Min(시가30%,1억) 영§30②1
applied = gain > 0 && gain >= threshold
value = applied ? gain : 0
```
> ②는 lib/calc가 autoExcess ON 시 `bondMarketValue`·`acquisitionPrice`를 초과분 반영값으로 도출 후 전달. 코어는 일반 차감.

**anchor**
| ID | 입력 | 기댓값 |
|---|---|---|
| CB-ACQ-1 | 시가 1,030,000,000 · 취득 910,000,000 | `120,000,000` (사례1) |
| CB-ACQ-EXCESS | 시가 1,050,000,000 · 인수 350,000,000 (초과분 70% 반영) | `700,000,000` (사례2) |
| CB-ACQ-2 | 시가 100,000,000 · 취득 95,000,000 | `applied=false` (500만 < min(3천만,1억)) |

---

### (2) 주식전환 정방향 ④⑤⑥ — `bondConversion` (§40①2호 가·나·다 / 영 §30①2)

**케이스 인벤토리**
| ID | 유형 | 조건 | 산식 |
|---|---|---|---|
| CB-CONV-1 | ④ 취득후 전환 | net ≥ 1억 | `(교부주식가액−전환가액)×교부수 − 이자손실분 − 기과세이익` |
| CB-CONV-FAIL | ④ 임계미달 | net < 1억 | `applied=false` |
| CB-CONV-EXCESS | ⑤ 주주 초과 후 전환 | net ≥ 1억 | 위 × **초과분**(creditedShares) |
| CB-CONV-3RD | ⑥ 제3자 후 전환(전부) | net ≥ 1억 | 위 × **전부**(creditedShares=increasedShares) |
| CB-CONV-MIN | ④⑤⑥ 상장 ㉠<㉡ | — | 교부주식가액 = Min(㉠,㉡) |
| CB-CONV-XFER-CAP | ④ 전환가능기간 양도 | — | Min(net, 양도차익) [Phase E] |

**알고리즘**
```
theoretical = computeWeightedPerShare(preConvPrice, preConvShares, conversionPrice, increasedShares)  // ㉡ §30⑤1
perShareValue = isListed ? min(listedMarketAvg, theoretical) : theoretical        // §30⑤1 단서 Min(가나다)
perShareGain = perShareValue - conversionPrice
multiplier = creditedShares ?? increasedShares                                     // ④⑥ 전부 / ⑤ 초과분
base = perShareGain > 0 ? safeMultiply(perShareGain, multiplier) : 0
net = base - (interestLoss ?? 0) - (acquisitionGainPrior ?? 0)                     // interestLoss=최종값(재안분 금지)
if (bondTransferGainForCap != null) net = min(net, bondTransferGainForCap)         // G6 양도 cap [Phase E]
threshold = 100_000_000                                                            // 영§30②2
applied = net >= threshold; value = applied ? net : 0
```
> ⚠️ **이중곱 가드**: 초과분 안분(이자손실분 × creditedShares/increasedShares)은 lib/calc 헬퍼에서만 수행되어 `interestLoss`에 이미 반영됨. 코어는 차감만 — 재안분 금지.

**anchor**
| ID | 입력 | 기댓값 |
|---|---|---|
| CB-CONV-1 (사례3) | preConv 9,000·1,000,000 / 전환 5,000 / 증가·교부 200,000 / isListed·㉠ 9,500 / 이자손실 165,616,400 / 기과세 120,000,000 | `380,983,600` |
| CB-CONV-EXCESS (사례4) | preConv 8,500·1,000,000 / 전환 5,000 / 증가 1,000,000 / **creditedShares 700,000** / 이자손실 **698,735,450(최종)** / 기과세 0 | `526,264,550` |
| CB-CONV-3RD | 사례3 동일 + creditedShares 미입력(=increasedShares 전부) | (산식 = CB-CONV-1) |
| CB-CONV-FAIL | net < 1억 | `applied=false` |
| CB-CONV-MIN | isListed·㉠ 8,000 < ㉡ → 교부=8,000 | (Min 적용) |

> 사례3 theoretical = Min(9,500, 8,333)=8,333 → (8,333−5,000)×200,000 − 165,616,400 − 120,000,000 = 380,983,600.
> 사례4 theoretical = Min(8,200, 6,750)=6,750 → (6,750−5,000)×700,000 − 698,735,450 − 0 = 526,264,550. (creditedShares 700,000 ≠ increasedShares 1,000,000 — 신규 필드로 분리)

---

### (3) 주식전환 라목 ⑦ — `bondConversionReverse` (§40①2호 라 / 영 §30①3)

**케이스 인벤토리**
| ID | 유형 | 조건 | 산식 |
|---|---|---|---|
| CB-REV | ⑦ 고가전환 기존주주 이익 | value > 0 | `(전환가액−교부주식가액)×증가주식수×특수관계인 전환전 지분율` |
| CB-REV-MAX | ⑦ 상장 ㉠>㉡ | — | 교부주식가액 = Max(㉠,㉡) |

**알고리즘**
```
theoretical = computeWeightedPerShare(preConvPrice, preConvShares, conversionPrice, increasedShares)
perShareValue = isListed ? max(listedMarketAvg, theoretical) : theoretical         // 라목 Max — §30⑤1 단서
perShareGain = conversionPrice - perShareValue                                     // 라목: 전환가액 > 교부주식가액
base = perShareGain > 0 ? safeMultiply(perShareGain, increasedShares) : 0
value = base > 0 ? safeMultiplyThenDivide(base, relatedPreRatio.numer, relatedPreRatio.denom) : 0
threshold = 0; applied = value > 0                                                 // 영§30②3 = 0원(전부과세)
```

**anchor**
| ID | 입력 | 기댓값 |
|---|---|---|
| CB-REV | 전환 20,000 / 교부주식가액 13,333 / 증가 50,000 / 지분율 30% | `(20,000−13,333)×50,000×0.3 = 100,005,000` |

---

### (4) 양도 ⑧ — `bondTransfer` (§40①3호 / 영 §30①4)

**케이스 인벤토리**
| ID | 유형 | 조건 | 산식 |
|---|---|---|---|
| CB-TRANSFER | ⑧ 특수관계인 고가양도 | gain ≥ 기준 | `양도가액 − 시가` |
| CB-TRANSFER-FAIL | ⑧ 임계미달 | gain < 기준 | `applied=false` |

**알고리즘**
```
gain = transferPrice - bondMarketValue
threshold = min(applyRate(bondMarketValue, 0.3), 100_000_000)   // Min(시가30%,1억) 영§30②1
applied = gain > 0 && gain >= threshold; value = applied ? gain : 0
```

**anchor**
| ID | 입력 | 기댓값 |
|---|---|---|
| CB-TRANSFER | 양도 600,000,000 · 시가 500,000,000 | `100,000,000` (기준 min(1.5억,1억)=1억) |
| CB-TRANSFER-FAIL | 양도 550,000,000 · 시가 500,000,000 | `applied=false` (5천만<1억) |

---

## 3. 자동계산 헬퍼 (`convertible-bond-helpers.ts` — 순수 함수, Do 구현 확정)

### 3.1 설계 결정 (Pre-Do 실측 환류)
- **㉠ = 액면(par)**: 발행이율=표면이율·만기상환할증금 부재 시 사채발행이율 PV는 액면과 정확히 일치(par bond) → ㉠를 maturityAmount로 직접 사용. (할증금 등 ㉠≠액면이면 발행이율 현가계수 optional 입력)
- **㉡ = 적정할인율 현가계수 input**: 공시 적정할인율 현가계수표(문제 제공 5자리값)를 `×1e5` 정수로 받아 `applyRateFraction` 정수곱 → **0원 정확 재현**(교재 5자리 반올림과 동일). 직접 `(1+r)^-n` 계산은 사례3 약 300원·사례4 6,500원 오차(표 반올림 차) → **현가계수 input 채택, tolerance 0**.
- `presentValue` BigInt 거듭제곱 헬퍼는 **미구현**(YAGNI — factor 경로로 충분).

### 3.2 이자손실분 (`bondInterestLoss`) — 상증칙 §10의2 (확정 시그니처)
```ts
bondInterestLoss({maturityAmount, annualCoupon, pvFactorAppropriate, annuityFactorAppropriate}): number
  // ㉠ = maturityAmount(par — 발행이율 PV=액면). 만기상환할증금 사채는 현 범위 외
  // ㉡ = applyRateFraction(원금, pvFactorAppropriate, 1e5) + applyRateFraction(연이자, annuityFactorAppropriate, 1e5)
  // return max(0, ㉠ − ㉡)   ※ 현가계수는 0.73502 → 73502 (×1e5)
  // ⑤ 초과분: 결과 × 초과분비율(applyExcessRatio) — lib/calc에서 적용. 엔진 재안분 금지
```
> 검증(0원 정확): 사례3 = 10억 − (735,020,000+99,363,600)=165,616,400 (n=4). 사례4 = 5,000,000,000 − (3,402,900,000+598,906,500)=998,193,500 → ×70% = 698,735,450 (n=5).

### 3.5 자동모드 적용 범위 (Do 확정)
- `autoExcess`는 **conversion(⑤)만** — ②(acquisition)는 신주인수권증권 §58의2 평가가 비선형(Max)이라 초과분 시가·인수가를 직접입력(자동 안분 불가).
- `autoInterestLoss`·`autoExcess` 독립 토글, 각 토글 내 자동↔직접 상호배타.

### 3.3 초과분 비율 (`computeExcessRatio`) — ②⑤ 한정
```
computeExcessRatio({subscribedShares, totalSubscribableShares, ownPreRatio}):
  균등배정 = safeMultiplyThenDivide(totalSubscribableShares, ownPreRatio.numer, ownPreRatio.denom)
  초과분 = subscribedShares - 균등배정
  return {numer: 초과분, denom: subscribedShares}
  // 사례2·4: 총인수가능 1,000,000 · 본인 30% · 전량 → 초과분 700,000(70%)
  // ③⑥(제3자)은 균등배정 없음 → N/A(전부)
```

### 3.4 적정할인율 (시대표 미채택 — Do 단순화)
- 적정할인율(상증칙 §18의3: 2010.11.5~ 8% / 과거 6.5·7·7.5%)은 **현가계수 input에 내재**(현가계수=(1+r)^-n). 이자손실분 자동계산이 적정율 현가계수를 직접 받아 0원 정확 재현하므로 **별도 시대표 상수·룩업 함수 미구현**(dead code 제거).
- 사용자는 증여일 시대의 공시 현가계수표 값을 입력. (시대표 자동도출은 비채택 — 직접 `(1+r)^-n` 계산 시 교재 표 반올림과 불일치)
> §41의4 `FREE_LOAN_RATE_HISTORY`와 **별개**(전환사채 적정할인율 ≠ 금전대출 적정이자율 4.6%).

---

## 4. 공통 인프라 — 법령 상수 (`legal-codes/inheritance-gift.ts`)
- 현행 `GIFT.CONVERTIBLE_BOND = "상증법 §40"` 유지(검증완료 — 본칙 적합).
- 신규 `GIFT.CONVERTIBLE_BOND_INTEREST_LOSS = "상증칙 §10의2"` → breakdown 이자손실분 row lawRef 부여(현행 lawRef 부재).
- (선택) `GIFT.CONVERTIBLE_BOND_DISCOUNT_RATE = "상증칙 §18의3"` (적정할인율 8%).

---

## 5. 동기화 지점 (엔진·API 측)

| 지점 | 내용 |
|---|---|
| ⑨⑩ Zod enum | `convertible_bond` literal — 변경 없음 |
| ⑫ Zod 입력객체 | `lib/validators/gift-deemed-input.ts:206-219` convertibleBondSchema에 신규 필드 `.optional()` 추가: `creditedShares`·`isListed`·`listedMarketAvg`·`bondTransferGainForCap` + raw입력군(autoInterestLoss·bond*·autoExcess·ownPreRatio·subscribedShares·totalSubscribableShares). 🔴 누락 시 safeParse 침묵 strip |
| ⑬ fetch body | `DeemedGiftCalculator` → `buildDeemedGiftInput()` 경유 |
| ⑭ Route 매핑 | `app/api/calc/gift-deemed/route.ts:42` 타입 단언 — 문자열 날짜 그대로(date-coerce N/A) |
| ⑧ validation | `gift-deemed-validate.ts:127-138` convertible_bond 분기 — caseType·모드별 required. creditedShares **non-required**(미입력=increasedShares) |

> ⑪ 자산-수준 fallback N/A (단일 의제). 자동계산 도출(creditedShares·interestLoss·②시가/인수가)은 ④ lib/calc(`gift-deemed-api.ts:167-195`)에서 처리.

---

## 6. anchor 테스트 목록 (`__tests__/tax-engine/gift-deemed/`)

| 파일 | 케이스 |
|---|---|
| `convertible-bond-textbook-cases.test.ts` (신규) | CB-ACQ-1(사례1)·CB-ACQ-EXCESS(사례2)·CB-CONV-1(사례3)·CB-CONV-EXCESS(사례4) — `toBe()` |
| `convertible-bond-subcase-anchor.test.ts` (기존) | CB-CONV-1/2·CB-REV·CB-TRANSFER·CB-ACQ — **회귀 유지** |
| 신규 경계/분기 | CB-ACQ-2·CB-CONV-FAIL·CB-CONV-3RD·CB-CONV-MIN·CB-REV-MAX·CB-TRANSFER-FAIL |
| 헬퍼 단위 | `bondInterestLoss`(사례3·4)·`computeExcessRatio`(70%)·`applyExcessRatio` |

**Pre-Do anchor (Do 진입 전 우선)**: CB-CONV-EXCESS(사례4 — creditedShares 분리 실증, 현재 실패) + CB-CONV-1(사례3 회귀 유지) + bondInterestLoss(현가계수 오차 실측 → tolerance 확정). (`pre-do-anchor-verification`)

---

## 7. 미결정 (Do 단계)

- ~~이자손실분 현가계수~~ **확정**: 현가계수 input + ㉠=액면(par) → 0원 정확 재현(R1 해소, tolerance 불요).
- **자동계산 호출 위치 확정**: lib/calc 변환계층(`gift-deemed-api.ts`)에서 헬퍼 호출 → 엔진 코어는 최종값만.
- **양도 cap(G6)**: `bondTransferGainForCap` 입력 경로 — 전환가능기간 전환사채 양도 케이스 UI 노출 여부(Phase E).
- **만기상환할증금 사채**: ㉠≠액면(par) 케이스 — 현 범위 외(par 가정). 필요 시 발행이율 현가계수 입력 분기 추가.
