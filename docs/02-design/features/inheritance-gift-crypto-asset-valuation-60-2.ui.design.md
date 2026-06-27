# 가상화폐(가상자산) 평가 §60② — UI 설계

> **PDCA Phase: Design (UI)** | 작성일: 2026-06-27 | 엔진설계: `inheritance-gift-crypto-asset-valuation-60-2.engine.design.md`
> 선례: `EstateBodyFinancial.tsx`(모드 RadioCardGroup) · `EstateBodySuperficies.tsx`(복합 입력)

---

## 1. 신규 컴포넌트 `EstateBodyCryptoAsset.tsx`

위치: `components/calc/inheritance/estate-card/variants/EstateBodyCryptoAsset.tsx`
Props: `VariantBodyProps`(item, set, valuationDate, mode 'inheritance'|'gift' 등 — 선례 동일 시그니처).

### 1.1 입력 순서 (= 엔진 계산 순서, CLAUDE.md)

```
① 부칙 게이트 안내 (valuationDate < 2022-01-01 시 amber, timeseries 숨김)
② 평가 모드 RadioCardGroup [emerald] : "평가단가 직접입력" | "일평균가액 시계열"
   └ (timeseries 선택 시) 1호/2호 ToggleCard [rose]
   └ (timeseries 선택 시) 거래일별 일평균가액 행 입력 (행 추가/삭제) → 평균단가 자동표시
   └ (direct 선택 시) 1코인당 평가단가 CurrencyInput
③ 보유 수량 DecimalInput (소수 8자리)
④ [자동] 평가액 = 단가 × 수량 (결과 박스, 카드 색조)
```

### 1.2 위젯 ASCII

```
┌─ 🪙 가상화폐(가상자산) 평가 ─────────────────────────────┐
│ ⚠ 2022.1.1. 이후 상속개시·증여분만 §60② 평균평가 적용     │  ← valuationDate<2022만
│   (그 전: 평가기준일 현재 시가 직접입력)                    │     amber, ②에서 timeseries 숨김
│                                                            │
│ 평가 방법                                                   │
│ ┌────────────────────┐ ┌────────────────────┐            │ RadioCardGroup emerald
│ │○ 평가단가 직접입력  │ │● 일평균가액 시계열  │            │ (미선택도 tone 유지)
│ └────────────────────┘ └────────────────────┘            │
│                                                            │
│ [timeseries 선택 시]                                       │
│ ┌ 거래소 구분 ───────────────────────────────[rose]┐      │ ToggleCard
│ │ ● 국세청 고시사업장(§60②1호)  ○ 그 밖(2호)        │      │ 1호=ON default
│ │   업비트·빗썸·코빗·코인원(2022~)·고팍스(2025~)     │      │
│ └────────────────────────────────────────────────┘       │
│ 거래일별 일평균가액의 평균액 (전·후 각 1개월)              │ sky 섹션카드 ①
│   2022-01-05  [   12,250 ] 원   [삭제]                     │ CurrencyInput 행
│   2022-01-06  [   12,800 ] 원   [삭제]                     │
│   …                                            [+ 행 추가] │
│   → 일평균가액의 평균액: 12,525 원 (N일)                   │ 자동 echo (computeCryptoUnitPrice)
│                                                            │
│ [direct 선택 시]                                           │
│ 1코인당 평가단가  [      50,000 ] 원                       │ CurrencyInput
│                                                            │
│ 보유 수량         [  1.50000000 ] 개                       │ DecimalInput(8자리)
│ ┌──────────────────────────────────────────[emerald]┐    │
│ │ 가상자산 평가액 = 1코인당 평가단가 × 보유수량      │    │ 자동 결과박스(선택 모드 기준)
│ │   (예 timeseries: 12,525 × 1.5 = 18,787 원)        │    │ floor
│ └────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────┘
```

### 1.3 모드 초기화 (useEffect 미러링 금지)

- `const mode = item.cryptoValuationMode ?? "direct"` (display fallback)
- `const isListed = item.cryptoIsListedProvider ?? true`
- 변경은 onChange 핸들러에서만 `set({ cryptoValuationMode: v })` (선례 `EstateBodyFinancial.tsx:103-116`). **mount 자동 set·useEffect 금지**.
- 시계열 행 추가/삭제: `set({ cryptoDailyPrices: [...prev, 0] })` / `filter`. 행 값 변경: 인덱스 교체.
- 평균단가 echo는 `useMemo(() => computeCryptoUnitPrice(dailyPrices), [dailyPrices])` — **엔진 함수 import**(dual-truth 회피).

### 1.4 부칙 게이트

- `valuationDate < 2022-01-01`: amber 안내 + 모드 RadioCardGroup에서 timeseries 옵션 `disabled`+`disabledReason`("2022.1.1. 이후 적용"), direct만. (법 근거 없이 불리 적용 금지 — 차단이 아니라 시가 직접입력 유도)

---

## 2. dispatch 등록 (`components/calc/EstateItemEditor.tsx:49-68`)

```tsx
// VariantSupportedCategory 타입에 "crypto_asset" 추가 (동 파일 내 정의)
case "crypto_asset":
  return <EstateBodyCryptoAsset {...props} />;
```
+ `variants/index.ts` barrel export 추가. ⚠️ switch **default 없음** → 누락 시 침묵 빈 화면(`silent-blank`).

---

## 3. 카테고리 메타·노출 배열

| 지점 | 파일 | 변경 |
|---|---|---|
| `CATEGORY_LABELS` | `estate-category-meta.ts:16` | `crypto_asset: "가상화폐(가상자산)"` (Record exhaustive — 누락 시 컴파일에러 가드) |
| `CATEGORY_ICONS` | `estate-category-meta.ts:29` | `crypto_asset: "🪙"` |
| `INHERITANCE_CATEGORIES` | `deemed-category-policy.ts:28` | `"crypto_asset"` push (상속 노출, TS 미감지) |
| `GIFT_CATEGORIES` | `estate-category-meta.ts:43` | `"crypto_asset"` push (증여 노출, TS 미감지) |

---

## 4. 결과뷰 method 라벨 (STEP 8 파급)

`ValuationMethod`에 `crypto_statutory` 추가 → 결과뷰 method→라벨 매핑에 케이스 추가:
- `crypto_statutory` → "가상자산 법정평가 (상증령 §60②1호)"
- (2호·direct는 기존 `market_value` → "시가")

> 매핑이 `Record<ValuationMethod, string>` exhaustive면 TS 가드, `switch`+default면 케이스 명시 추가(침묵 방지). **위치 실측은 Do 단계**(`PropertyValuationResult` 표시 컴포넌트 grep).

---

## 5. 8개 동기화 지점 (UI측 Definition of Done)

| # | 지점 | 위치 | 가상화폐 |
|---|---|---|---|
| ① | 폼 상태 타입 | `EstateItem`(crypto mixin) | `EstateItemCryptoFields` |
| ② | initial | 별도 factory 없음(빈 객체+category) | mode display fallback `?? 'direct'` |
| ③ | normalize | sessionStorage 호환 — number[]·optional 그대로 | dailyPrices 배열 보존 |
| ④ | API 변환 | `gift-api.ts`·상속 buildInput `.map(injectCryptoUnitPriceIfTimeseries)` | echo 주입 |
| ⑤ | UI 위젯 | `EstateBodyCryptoAsset.tsx`(신규) + dispatch | §1 |
| ⑥ | 사이드바 합계 | `computeEffectiveValuation` crypto 분기 | 엔진 import |
| ⑦ | 결과 카드 | breakdown + method 라벨 | §4 |
| ⑧ | validation | `inheritance-validate.ts`·`gift-api` validateStep | 모드별 필수: direct→unitPrice·qty / timeseries→dailyPrices(≥1)·qty. **fallback `?? 'direct'` 동일** (UI통과↔validate차단 모순 금지) |

---

## 6. Zod 스키마 (`lib/validators/estate-item-schema.ts`)

```ts
export const cryptoAssetItemSchema = baseItemSchema.extend({
  category: z.literal("crypto_asset"),
  cryptoValuationMode: z.enum(["direct", "timeseries"]).optional(),
  cryptoQuantity: z.number().nonnegative().optional(),
  cryptoUnitPrice: z.number().nonnegative().optional(),
  cryptoDailyPrices: z.array(z.number().nonnegative()).optional(),   // ⑫ silent strip 방지
  cryptoIsListedProvider: z.boolean().optional(),
  cryptoUnitPriceComputed: z.number().optional(),
}).superRefine((item, ctx) => {
  const mode = item.cryptoValuationMode ?? "direct";
  if (mode === "direct" && !(item.cryptoUnitPrice && item.cryptoQuantity)) { /* 필수 */ }
  if (mode === "timeseries" && !(item.cryptoDailyPrices?.length && item.cryptoQuantity)) { /* 필수 — 빈 배열 차단(C6) */ }
});
```
+ `estateItemSchema` discriminatedUnion **멤버 배열(line 487-498)**에 `cryptoAssetItemSchema` 추가 — ★ 선례 `superficiesItemSchema`(323)·`receivableItemSchema`(351)도 `.extend().superRefine()`인데 멤버로 정상 등록(line 491·495·496 실증) → **superRefine 붙은 스키마도 멤버 가능**(Zod 버전 허용).
+ outer superRefine `COORD_INCOMPATIBLE` 배열(**line 503**)에 `"crypto_asset"` 추가(좌표 입력 차단).

---

## 7. UI 검토 확인 필요 (Do 실측)

- [ ] 결과뷰 method 라벨 매핑 위치·형식(Record vs switch).
- [ ] 시계열 행 입력에 날짜 표시 필요 여부 — P_d 배열은 값만 필요(날짜는 라벨 보조). 날짜 없이 값 배열만으로 평균 가능(순서 무관) → **날짜 입력 생략 가능**(입력 경량화). 단 UI 가독성 위해 인덱스/날짜 라벨 표시 검토.
- [ ] DecimalInput 8자리 표시 포맷(`toFixed(8)` 후행 0 처리).
