# 가상화폐(가상자산) 평가 §60② — 엔진 설계

> **PDCA Phase: Design (Engine)** | 작성일: 2026-06-27 | 계획서: `docs/00-pm/inheritance-gift-crypto-asset-valuation-60-2.plan.md`
> 선례: 예금 §63④(`inheritance-deposit-valuation-63-4.engine.design.md`) · 지상권 §61③

---

## 1. 법령근거 (상수화 — 리터럴 금지)

| 상수 | 조문 | 내용 |
|---|---|---|
| `INHERITANCE_GIFT.CRYPTO_BASE` | 상증법 §65② | 가상자산 평가 위임(대통령령) |
| `INHERITANCE_GIFT.CRYPTO_LISTED` | 상증령 §60②1호 | 고시사업장: 전·후 각 1개월 일평균가액의 평균액 |
| `INHERITANCE_GIFT.CRYPTO_OTHER` | 상증령 §60②2호 | 그 밖: 거래일 일평균가액·종료시각 시세 |
| (참조) | 특금법 §2③ | 가상자산 정의(시행령 인용) |
| (참조) | 부칙(2020.12.22) 1단서 | 2022.1.1. 이후 상속개시·증여분 적용 |

→ `lib/tax-engine/legal-codes/`에 `CRYPTO.*` 상수 추가. (메모리 `feedback_legal_codes`)

---

## 2. 케이스 인벤토리 (전수 enumerate — 단순부터)

| # | 모드 | 1호/2호 | 적용시기 | 입력 | 평가식 | 비고 |
|---|---|---|---|---|---|---|
| C1 | direct | — | ≥2022 | unitPrice, qty | unitPrice × qty | 최소 케이스 |
| C2 | timeseries | 1호 | ≥2022 | dailyPrices[], qty | avg(dailyPrices) × qty | **법정 주력** |
| C3 | timeseries | 1호 | ≥2022 | dailyPrices[] 1건 | dailyPrices[0] × qty | 단일일 경계 |
| C4 | direct/timeseries | 2호 | ≥2022 | unitPrice 또는 dailyPrices | §60②2호 — 거래일 일평균/종료시각 직접입력 | 2호는 direct 권장 |
| C5 | * | * | **<2022** | — | §60② 미적용 → 평가기준일 현재 시가(direct 입력) | 부칙 게이트 |
| C6 | timeseries | 1호 | ≥2022 | dailyPrices[] 빈 배열 | **검증오류**(미입력 차단) | 자동 안분 fallback 금지 |
| C7 | direct | — | ≥2022 | unitPrice, qty(소수 8자리) | floor(unitPrice × qty) | 소수 수량 정밀 |

> 1단계(사업장별 P_d 평균)는 **모드B 입력 단위가 이미 P_d**이므로 엔진은 2단계(기간평균)만. 사업장 매트릭스는 SCOPE OUT.

---

## 3. 입력/결과 타입

### 3.1 EstateItem mixin (`types/inheritance-gift-crypto.types.ts` 신규)

```ts
export interface EstateItemCryptoFields {
  /** 평가 모드 (선례 savingsValuationMode 동일 — optional, display fallback ?? 'direct') */
  cryptoValuationMode?: "direct" | "timeseries";
  /** 보유 수량 (소수 8자리, 1 satoshi) */
  cryptoQuantity?: number;
  /** 모드A: 1코인당 평가단가 (직접입력) */
  cryptoUnitPrice?: number;
  /** 모드B: 거래일별 "일평균가액의 평균액 P_d" 배열 (Map 금지 — number[]) */
  cryptoDailyPrices?: number[];
  /** 1호(고시사업장 거래)=true / 2호=false. display fallback ?? true */
  cryptoIsListedProvider?: boolean;
  /** [파생 echo] 엔진이 산정한 1코인당 평가단가 (모드B 2단계 결과) */
  cryptoUnitPriceComputed?: number;
}
```

> `EstateItem`(`inheritance-gift-estate.types.ts`)에 `& EstateItemCryptoFields` 합성. `AssetCategory`에 `"crypto_asset"` 추가(line 40-52).

### 3.2 결과 (PropertyValuationResult — 기존 타입 재사용)

```ts
// ValuationMethod union (inheritance-gift-estate.types.ts:28-37)에 "crypto_statutory" 추가 [확정]
//   crypto_statutory = §60②1호 평균 / market_value = 2호·시가직접
{
  method: "crypto_statutory" | "market_value",
  valuatedAmount: number,        // Math.floor(단가 × 수량)
  breakdown: [   // ★ 수량은 amount(원)에 넣지 않음 — label 텍스트로(coin 단위, "원 표기 금지"·금액정렬 충돌 회피)
    { label: "거래일별 일평균가액의 평균액 (N일)", amount: unitPrice, lawRef: "상증령 §60②1호" },
    { label: `1코인당 평가단가 × 보유수량 ${quantity}`, amount: valuatedAmount, lawRef: "상증법 §65②" },
  ],
  warnings: string[],            // 부칙 게이트·빈 배열 등
}
```

---

## 4. 알고리즘

### 4.1 `computeCryptoUnitPrice` (`property-valuation-crypto.ts` 신규)

```
function computeCryptoUnitPrice(dailyPrices: number[]): number
  // §60②1호 2단계: 거래일별 P_d 들의 단순평균
  if dailyPrices.length === 0 → throw/return null (검증은 상위 schema·validate)
  sum = Σ dailyPrices
  return Math.floor(sum / dailyPrices.length)   // 원단위 절사 (국고금관리법 §47 동형, 예금 선례)
```

- ⚠️ **정밀**: dailyPrices 합 × 1 / N 단순평균. 분자 < 2^53 (가액 ~수천만 × 최대 62일 → 안전). BigInt 불요. 단 floor 시점 = 평균 직후 1회(중간절사 정책).
- 검증 anchor: [11000,12000,13000,13000] → floor(49000/4)=12250 ✅ / [11000,12000,13000] → floor(36000/3)=12000 ✅.

### 4.2 `evaluateCryptoAsset(item)` (`property-valuation.ts`)

```
function evaluateCryptoAsset(item): PropertyValuationResult
  qty = item.cryptoQuantity ?? 0
  mode = item.cryptoValuationMode ?? "direct"     // display fallback 동일
  isListed = item.cryptoIsListedProvider ?? true

  if mode === "timeseries":
     unit = item.cryptoUnitPriceComputed ?? computeCryptoUnitPrice(item.cryptoDailyPrices ?? [])
     method = isListed ? "crypto_statutory" : "market_value"
  else: // direct
     unit = item.cryptoUnitPrice ?? 0
     method = "market_value"

  amount = Math.floor(unit * qty)    // 단가(정수) × 수량(소수 8자리) → 정수 평가액
  return { method, valuatedAmount: amount, breakdown: [...], warnings }
```

> ⚠️ **`safeMultiply` 사용 금지**(실측: tax-utils.ts:90 — <2^53는 단순 `a*b`, 초과 시 `BigInt(Math.floor(b))`로 **수량 소수부 소실**). 가상자산 평가액(단가 수천만 × 수량)은 정상범위이므로 **`Math.floor(unit * qty)` 직접**. 수량은 UI에서 `parseFloat(toFixed(8))` 반올림 후 전달(8자리 한정).

### 4.3 dispatch (`evaluateEstateItem` switch, `property-valuation.ts:592-630`)

```
case "crypto_asset": return evaluateCryptoAsset(item);
```
(listed/unlisted_stock과 달리 throw 없음 → `evaluateEstateItem` 직접 처리 OK)

### 4.4 평가기준일 주입 (`injectCryptoUnitPriceIfTimeseries`, `estate-item-valuation.ts`)

```
// 모드B에서 cryptoUnitPriceComputed echo 주입 (UI 표시·검증 일관)
if mode==="timeseries" && dailyPrices?.length:
   item.cryptoUnitPriceComputed = computeCryptoUnitPrice(dailyPrices)
```
→ `buildInput`(상속)·`buildGiftTaxInput`(증여) `.map()` 파이프라인에 추가(예금 `injectSavingsAccrualIfAuto` 동일 위치).

### 4.5 적용시기 게이트 (C5)

- 평가기준일(상속개시일/증여일) < 2022-01-01 → §60② 미적용. UI에서 timeseries 모드 차단·direct(시가)만. 엔진은 direct로 들어오므로 별도 분기 불요, **UI 게이트 + warning**으로 처리(엔진은 법 근거 없이 불리 적용 금지 — 들어온 값 그대로 평가).

---

## 5. UI 추정 합계 (`computeEffectiveValuation`, dual-truth 회피)

```
if item.category === "crypto_asset":
   mode = item.cryptoValuationMode ?? "direct"
   if mode === "timeseries":
      unit = item.cryptoUnitPriceComputed
             ?? (item.cryptoDailyPrices?.length ? computeCryptoUnitPrice(item.cryptoDailyPrices) : undefined)
   else: unit = item.cryptoUnitPrice
   return unit != null ? Math.floor(unit * (item.cryptoQuantity ?? 0)) : (item.marketValue ?? 0)
```
> ★ `computeCryptoUnitPrice`를 **import 재사용**(UI 재구현 금지 `feedback_ui_engine_dual_truth_avoidance`·`single-source-engine-helper`).

---

## 6. anchor 테스트 (Pre-Do 우선)

| anchor | 입력 | 기대 | 근거 |
|---|---|---|---|
| `crypto-daily-avg-4providers` | [11000,12000,13000,13000] | 12250 | 교재 문1 1단계 ✅ |
| `crypto-daily-avg-3providers` | [11000,12000,13000] | 12000 | 교재 문2 1단계 ✅ |
| `crypto-period-avg` | [10000,20000,30000], qty 2 | unit 20000, amount 40000 | 자기일관 ②단계 |
| `crypto-mode-direct` | unitPrice 50000, qty 1.5 | 75000 | C1/C7 |
| `crypto-floor` | unitPrice 33333, qty 0.00000003 | floor(0.00099999)=0 | 소수 floor |
| `crypto-empty-guard` | dailyPrices [] | 검증오류(엔진 throw 또는 0+warning) | C6 |

---

## 7. 동기화 지점 커버리지 (엔진측 14 — 계획 §5 매핑)

①AssetCategory ②mixin타입 ③evaluateCryptoAsset ④switch ⑤evaluateAllEstateItems(자동) ⑥computeEffectiveValuation ⑦inject* ⑧⑨⑩⑪⑫ Zod(estate-item-schema discriminatedUnion+superRefine) ⑬buildInput/buildGiftTaxInput 파이프라인 ⑭breakdown. → UI 설계는 `.ui.design.md` 참조.

## 8. Design 확인 결과 (실측 완료)

- [x] `safeMultiply`(tax-utils.ts:90) 소수 인자 부적합(초과 시 소수 소실) → **`Math.floor(unit*qty)` 직접** 확정.
- [x] `ValuationMethod` union(`inheritance-gift-estate.types.ts:28-37`)에 `"crypto_statutory"` 추가 — 위치 확정.
- [ ] (잔여) 수량 0/단가 0 시 평가액 0 — 사이드바 0원 미표시 정책과 정합(UI 설계에서 확정).
