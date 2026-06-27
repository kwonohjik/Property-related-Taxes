# 무체재산권 평가 — UI 설계서

> 계획서: [`docs/00-pm/inheritance-gift-intangible-ip-valuation.plan.md`](../../00-pm/inheritance-gift-intangible-ip-valuation.plan.md) · 엔진설계: [`.engine.design.md`](./inheritance-gift-intangible-ip-valuation.engine.design.md)
> 원본 위젯: 지상권 `EstateBodySuperficies.tsx` (상속·증여 공용 EstateItem 카드)

## 1. 진입점·dispatch

```
EstateItemEditor.tsx:55  →  VariantBody(실 dispatch, switch(category as …))
                              case "intangible_ip": <EstateBodyIntangibleIp {...props} />
```
- ⚠️ `VariantBody`는 `as` 캐스트·default 없음 → case 누락 시 **빈 화면(silent)**. 반드시 추가.
- `pickBodyVariant`(variants/index.ts)는 TS-guard지만 **dead** — 신뢰 금지(추가는 무해).

## 2. 입력 위젯 (신규 `variants/EstateBodyIntangibleIp.tsx`)

```
┌─ 무체재산권 (특허·실용신안·상표·디자인·저작권) ──────────────┐
│ ① 권리 종류   [RadioCardGroup] 특허 │ 실용신안 │ 상표 │ 디자인 │ 저작권 │
│ ② 수입금액 산정 [RadioCardGroup] 확정수입 │ 직전3년 평균 │ 감정가액      │
│                                                              │
│  ─ [확정수입] ─────────────────────────────────             │
│   ③ 미래 각 연도 수입금액(원)  [DecimalInput/CurrencyInput]   │
│  ─ [직전3년 평균] ─────────────────────────────             │
│   ④ 직전 3년 수입금액 합계(원) [CurrencyInput]                │
│   ⑤ 실제 연수(1~3)            [DecimalInput]  ← 필수         │
│  ─ [감정가액] ─────────────────────────────────             │
│   ⑥ 감정가액(원)              [CurrencyInput]                │
│                                                              │
│  ─ 존속기간 ───────────────────────────────────             │
│   ⑦ (특허·실용·상표·디자인) 출원일/설정등록일 [DateInput]     │
│   ⑦'(저작권) 저작자 사망일                   [DateInput]     │
│   ⑧ 잔존연수: 자동 13년 (20년 한도)  · [override] [_____]     │
└──────────────────────────────────────────────────────────────┘
```

- **권리종류·수입모드 = `RadioCardGroup`** (native radio 금지, OFF tone 유지). ⚠️ RadioCardGroup은 **그룹 testid 미지원** → 옵션별 `testId`(예 `intangible-ip-type-patent-${id}`) 부여.
- **원(KRW) 금액(③연수입·④3년합계·⑥감정가액) = `CurrencyInput`+`parseAmount`**(콤마 포맷). **⑤ 연수(1~3) = `DecimalInput`**(소수 전용). 금액에 DecimalInput 금지(콤마 상실).
- **날짜 = `DateInput`**(type=date 금지). ⚠️ DateInput은 **data-testid 미forward** → `<div data-testid>` 래퍼로 감싸고 E2E는 내부 input 타깃.
- placeholder 숫자 예시 금지 — 형식 설명은 FieldCard `hint`.
- 산정방식 토글은 영향 필드 **직전**에 배치(UI 순서=로직 순서).

## 3. 조건부 가시성 (모드·권리별)

| 노출 필드 | 조건 |
|---|---|
| ③ 연수입 | `intangibleIncomeMode === "fixed"` |
| ④ 3년합계 + ⑤ 연수 | `=== "avg3y"` |
| ⑥ 감정가액 | `=== "appraisal"` |
| ⑦ 출원일/등록일 | `intangibleIpType ∈ {patent,utility_model,trademark,design}` **AND `mode !== "appraisal"`** |
| ⑦' 사망일 | `intangibleIpType === "copyright"` **AND `mode !== "appraisal"`** |
| ⑧ 잔존연수 | `mode !== "appraisal"` (감정가액은 존속기간 무관 — 기산일·잔존연수 모두 숨김) |

> 미선택/미입력은 노출만 제어 — 자동 fallback 금지. validate가 차단.

## 4. 잔존연수 자동도출 (mirror-pattern — store 미러링 금지)

```ts
// EstateBodyIntangibleIp 내부 useMemo (EstateBodySuperficies:41-58 미러)
const autoYears = useMemo(() => {
  if (mode === "appraisal") return undefined;
  if (!기산일 || !valuationDate || !type) return undefined;
  // valuationDate(string) → parseISO 변환 필수 (엔진 시그니처 Date, superficies :49 미러)
  return resolveIntangibleRemainingYears({ type, originDate, authorDeathDate, valuationDate: parseISO(valuationDate) });
}, [type, originDate, authorDeathDate, valuationDate]);
const display = override ?? autoYears;   // override 우선, useEffect→store 미러링 안 함
```
- 엔진 `resolveIntangibleRemainingYears`를 **직접 import**(dual-truth 금지, single-source).
- override 입력 시 자동값 무시(clamp 0~20). 표시는 "자동 N년 · override M년".

## 5. testid 표준 (P5 E2E 전제)

> 부여 방식 (검토 실측): RadioCardGroup·DateInput은 직접 testid 불가 → 우회.
> - **옵션별 testId**(RadioCardGroup): `intangible-ip-type-{patent|utility_model|trademark|design|copyright}-${id}` · `intangible-ip-income-mode-{fixed|avg3y|appraisal}-${id}`
> - **`<div data-testid>` 래퍼**(DateInput): `intangible-ip-origin-date-${id}` · `intangible-ip-author-death-date-${id}` (내부 input 타깃)
> - **직접 forward 확인됨**(CurrencyInput·DecimalInput): `intangible-ip-annual-income-${id}` · `intangible-ip-prior3y-total-${id}` · `intangible-ip-prior3y-years-${id}` · `intangible-ip-appraised-${id}` · `intangible-ip-remaining-years-${id}`
> - 컨테이너: `estate-body-variant-intangible-ip-${id}`

## 6. 결과 카드 (산식 — 한국어 풀어쓰기)

```
무체재산권(특허권) 평가
 · 각 연도 수입금액           15,000,000원   (미래 확정수입)
 · 잔존연수 13년(20년 한도) · 할인율 10% 현재가치 환산 합계   106,550,336원
 · 평가액                    106,550,336원   [상증법 §64·령§59⑤·규§19]
```
- 변수 약어·`floor()` 노출 금지. 금액 칸 `font-mono tabular-nums` 우측정렬(`amount-column-align`). `LawArticleModal` 링크.

## 7. 카테고리 메타·폼 노출

| 위치 | 추가 | TS 가드 |
|---|---|---|
| `estate-category-meta.ts:23` `CATEGORY_LABELS`(Record) | `intangible_ip:"무체재산권"` | ✓ exhaustive |
| `:34` `CATEGORY_ICONS`(Record) | `intangible_ip:"💡"` | ✓ |
| `:45` `GIFT_CATEGORIES`(배열) | 추가 | 🔴 非exhaustive 수동 |
| `deemed-category-policy.ts:28` `INHERITANCE_CATEGORIES`(배열) | 추가 | 🔴 수동 |
| `CategoryChangeDialog.tsx:41` 라벨(Record) | `intangible_ip` | ✓ exhaustive |
| `CategoryChangeDialog.tsx:52,62` 배열 2곳 | 추가 | 🔴 非exhaustive 수동 |
| `InheritanceTaxResultView.types.ts:30`(Record) | 결과 라벨 | ✓ |
| `inheritance-filing-form-helpers.ts:130` `ESTATE_ITEM_TYPE_CODE`(Record) | 부표2 코드 | ✓ exhaustive (단 전용코드 부재 시 "12" fallback 값 결정 별도 — §12-2) |

## 8. 클라이언트 동기화 (계획서 §8 ①~⑲ 중 UI/calc)

- 폼 상태·initial·normalize: EstateItem 11필드 (지상권 패턴).
- API 변환: `lib/calc/estate-item-valuation.ts` `injectIntangibleRemainingYears` 신규 + `computeEffectiveValuation`에 `intangible_ip` 분기. `gift-api.ts:50`·`InheritanceTaxForm.tsx:426` inject 호출.
- 사이드바 합계: `computeEffectiveValuation` 위임 → 0원 제외 표시.
- validate: `estate-item-schema.ts` `intangibleIpItemSchema`(11필드 1:1·superRefine 분기).

## 9. 정책 준수

`RadioCardGroup` 필수(native 금지)·select-on-focus(공유 컴포넌트 내장)·placeholder 숫자예시 금지·UI순서=로직순서·mirror-pattern(useMemo derive, store 미러링 0)·결과 한국어 풀어쓰기·금액칼럼 정렬.
