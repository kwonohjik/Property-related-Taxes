# 비상장주식 간편평가 — 결손·순자산 음수 직접 입력 구현계획

> **Source**: 사용자 요청 (2026-05-27) — 비상장주식 간편평가(`UnlistedStockSimpleFields`) 입력 UX 개선
> **Date**: 2026-05-27
> **세목**: 상속세·증여세 (재산평가 — 비상장주식 §63①1호 다목, 시행령 §54~§56). **공유 컴포넌트 `UnlistedStockSimpleFields`(mode prop)라 상속·증여 동시 적용**.
> **범위**: 간편평가 모드 **UI 입력 레이어 + Zod 1건**. 엔진 산식 변경 0건.
> **정책**: [[feedback_numeric_impact_verify_before_bug_claim]] · [[feedback_no_silent_apportion_fallback]] · [[feedback_useeffect_store_mirror_forbidden]] · [[feedback_api_zod_schema_sync]] · [[feedback_validation_sync_8th_point]] · [[feedback_toggle_card_visibility]] · [[feedback_korean_law_82_vs_81_2_drift]]

---

## 1. 요구사항 (사용자 첨부 이미지)

1. **순손익가치 — 결손(적자)**: 현재는 연도별 입력칸 옆에 **「결손(적자)」 토글 스위치**(`ToggleCard variant="chip"`)를 켜서 부호를 음수로 전환한다. → **토글 제거**. 입력칸에 **음수를 그대로 입력**받는다.
2. **순자산가치 — 음수**: 현재는 음수 입력 자체가 불가능하다. → **음수를 그대로 입력**받고, **계산상으로만 0으로 처리**(시행령 §55① 후단).

핵심: 두 변경 모두 **입력 affordance(입력 받는 방식)** 변경이며, 계산 산식은 변경하지 않는다.

---

## 2. 법령 근거 (검증 완료 — legal-codes 상수 대조)

> ✅ 아래 조문은 프로젝트 `legal-codes/inheritance-gift.ts`의 **KoreanLaw 검증 완료 상수**와 일치 확인(2026-05-27 grep 대조). 신규 인용 도입 없음([[feedback_korean_law_82_vs_81_2_drift]]).

| 조문 | legal-codes 상수 | 내용 | 엔진 처리 |
|---|---|---|---|
| 상증령 §56① | `UNLISTED_NET_INCOME_FORMULA` = "상증령 §56 ①" | 3년 순손익 가중평균(3·2·1/6), **음수 시 0** | `calcCompanyWeightedNetIncome3Y` → `weighted < 0 ? 0` |
| 상증령 §55① | `UNLISTED_NET_ASSET_FORMULA` = "상증령 §55 ①" | 순자산가액 자산−부채, **0 이하 시 0**(장부가액 하한) | `calcPerShareNetAssetValue` → `Math.max(0, netAssetValue)` |

→ **결손 연도의 순손익액(음수)·음수 순자산은 법령상 "그대로 받아 계산 단계에서 0으로 귀결"되는 값**이다. UI가 음수 입력을 막을 이유가 없으며, 토글로 우회 표현하던 것을 제거해 입력 모델과 일치시킨다.

---

## 3. 현행 구조 분석 (실증)

### 3.1 순손익 — `NetIncomeYearRow` (UnlistedStockSimpleFields.tsx:444~504)

- 각 연도 = `CurrencyInput`(절대값 표시) + **결손 `ToggleCard` chip** + 로컬 state `deficitY1/Y2/Y3`.
- 부호 적용: `onChange`/`onDeficitChange`에서 `deficit ? -absVal : absVal`로 store(`netIncomeY1~Y3`)에 **이미 음수 저장 중**.
- 즉 **store 데이터 모델은 이미 signed**. 토글은 음수를 입력받는 *우회 위젯*일 뿐이다.

### 3.2 순자산 — `CurrencyInput` (UnlistedStockSimpleFields.tsx:401~407)

- `netAssetValue`를 `CurrencyInput`로 입력. **음수 입력 불가**(아래 3.3).
- hint에 이미 "0 이하면 0으로 처리 (시행령 §55①)" 명시.

### 3.3 입력 컴포넌트의 음수 차단 (근본 원인)

| 컴포넌트 | 음수 차단 코드 |
|---|---|
| `CurrencyInput.handleChange` | `e.target.value.replace(/[^0-9]/g, "")` — `-` 제거 |
| `CurrencyInput.toRawDigits` / `formatWithCommas` | `replace(/[^0-9]/g, "")` — `-` 제거 |
| `DecimalInput.handleChange` | `replace(/[^0-9.]/g, "")` (주석: "음수 제외") |
| `parseAmount` | `-` 자체는 보존하나 `parseAmount("-")`→**NaN** (차단 아님 — 가드 필요) |

→ **음수 입력 가능 공용 컴포넌트가 현재 없음.** `parseAmount`는 `"-120,000,000"`→`-120000000` 정상 파싱(실행 검증)하나, **🔴 `parseAmount("-")` → `NaN`**(node 실증). 사용자가 부호 `−`만 입력한 전이 상태에서 NaN이 store→`calcCompanyWeightedNetIncome3Y`→결과까지 전파됨. → **NaN 가드 필수**(정정 항목 (E)). 가드 후 `"-"`→`0`, `"-120,000,000"`→`-120000000` 모두 정상(실행 검증 완료).

### 3.4 엔진 — 음수 이미 정상 처리 (변경 불필요)

```
calcCompanyWeightedNetIncome3Y(y1,y2,y3): (y1*3+y2*2+y3*1)/6 → <0 ? 0   // §56① 단서
calcPerShareNetAssetValue(netAssetValue, totalShares): Math.max(0, netAssetValue)/totalShares  // §55① 후단
```

### 3.5 API / Zod / Validation 왕복 점검 (실증)

| 지점 | 현행 | 음수 통과? |
|---|---|---|
| API 변환 (`inheritance-api.ts:71`) | `estateItems: input.estateItems` 무변환 | ✅ |
| Zod `netIncomeY1~Y3` (`property-valuation-input.ts:24~28`) | `z.number().optional()` | ✅ |
| **Zod `netAssetValue` (`property-valuation-input.ts:29`)** | **`z.number().nonnegative()`** | ❌ **거부 — 완화 필요** |
| Client validation (`inheritance-validate.ts`·`gift-validate.ts`) | 간편모드 netAsset/netIncome 별도 검증 없음(V2 `netAssetValueRaw`만 검증) | ✅ |

> **유일한 차단점**: Zod `netAssetValue.nonnegative()`. 순손익 3년치는 Zod·API 모두 이미 음수 통과.
> **★ 단일 스키마**: `unlistedStockDataSchema`(line 11, 단일 정의) → `estateItemSchema`(line 186) → **`inheritanceTaxInputSchema`(line 644) + `giftTaxInputSchema`(line 687) 양쪽 공유**(실증). 따라서 Zod 1줄 수정이 **상속·증여 동시 적용**.

---

## 4. 핵심 결론 — 변경 범위

| 변경 | 파일 | 성격 |
|---|---|---|
| (A) `CurrencyInput`에 `allowNegative` prop 추가 | `components/calc/inputs/CurrencyInput.tsx` | 신규 옵션(기본 false — 기존 사용처 무영향) |
| (B) 순손익 3년: 결손 토글·`deficitYN` state 제거, 음수 직접 입력 | `UnlistedStockSimpleFields.tsx` (`NetIncomeYearRow`) | UI |
| (C) 순자산: `allowNegative` 음수 입력 허용 | `UnlistedStockSimpleFields.tsx` (순자산 CurrencyInput) | UI |
| (D) Zod `netAssetValue.nonnegative()` → `z.number()` (단일 스키마 — 상속·증여 동시) | `lib/validators/property-valuation-input.ts:29` | 동기화 지점 ⑫ |
| **(E) `parseAmount` NaN 가드** — `isNaN(n) ? 0 : n` (`"-"` 전이 입력 방어) | `components/calc/inputs/CurrencyInput.tsx` | 공용 util (안전 강화) |

- **엔진 변경 0건** ([[feedback_numeric_impact_verify_before_bug_claim]]: 산식 무변경, 입력 affordance만 변경. (E)도 UI util — 엔진 아님).
- **자동 안분/fallback 없음** ([[feedback_no_silent_apportion_fallback]] 무충돌 — 직접 입력이 더 정확).
- **useEffect 미러링 제거** ([[feedback_useeffect_store_mirror_forbidden]] 부합 — 오히려 deficit 로컬 state 제거로 단순화).

### 범위 외 (명시)

- **정식평가(V2 / 별지 부표3) 모드**: 순손익을 `fiscalYears` 표(별지 부표3)로 입력 — 결손 토글이 없는 별도 UI. 본 요청(첨부 이미지 = 간편평가)과 무관 → **범위 외**. V2 순손익/순자산 음수 처리는 별도 트랙.
- legacy `weightedNetIncome` 단일칸: deprecated, 본 PR 무영향.

---

## 5. 설계 — 음수 입력 위젯

### 5.1 결정: `CurrencyInput`에 `allowNegative` prop 추가 (신규 컴포넌트 X)

- 순손익·순자산은 억 단위 큰 금액 → **천단위 콤마 필요** → `CurrencyInput` 확장이 적합(`DecimalInput`은 콤마 부재).
- `allowNegative?: boolean = false` → 기본 false이면 기존 동작 100% 보존(기존 모든 사용처 무영향).
- 변경점(allowNegative=true 경로만 — **아래 모두 node 실행 검증 완료**):
  - `handleChange`: `raw.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "")` → 선행 `-` 1개만 보존 (`"abc-1-2"`→`"-12"`, `"--5"`→`"-5"`, `"12-34"`→`"1234"`).
  - `toRawDigits` / `formatWithCommas`: 선행 `-` 보존 후 정수부 콤마 (`"-120000000"`→표시 `"-120,000,000"`, 전이 `"-"`→`"-"` 유지).
  - **useEffect 외부 sync(CurrencyInput.tsx:61~65)·`handleFocus`도 동일 allowNegative 변형 `toRawDigits` 사용** — 음수 value 외부 주입 시 `-` 소실 방지.
  - 표시: 포커스 중 `localRaw`(`"-120000000"`/`"-"`), 블러 시 `formatWithCommas`(`"-120,000,000"`).
- **(E) `parseAmount` NaN 가드**: `const n = parseInt(...); return isNaN(n) ? 0 : n;` — 기존 digit-only 호출자 동작 불변(NaN 미발생), allowNegative 전이 `"-"`만 `0`으로 안전 변환. 공용 util이나 NaN→0은 모든 통화 필드에서 항상 안전(회귀 C-7·C-8로 가드).

### 5.2 `NetIncomeYearRow` 단순화

- `ToggleCard` chip·`isDeficit`·`onDeficitChange`·`absValue`·"결손 적용: −X" hint **전부 제거**.
- 입력칸 = `CurrencyInput allowNegative` 단일. `value={String(value ?? "")}`, `onChange={v => onChange(parseAmount(v))}` (부모는 signed 그대로 store 저장).
- 부모(`UnlistedStockSimpleFields`)에서 `deficitY1/Y2/Y3` `useState` 3개 제거, `setStock({ netIncomeYN: parseAmount(v) })`로 직접 저장.
- 음수 입력 시 hint로 "음수 입력 시 결손 — 가중평균이 음수면 0으로 처리(§56① 단서)" 안내(정적, 기존 자동계산 미리보기 박스가 이미 "→ 0 적용" 표시).

### 5.3 순자산 입력

- `CurrencyInput allowNegative` 적용. hint 유지("0 이하면 0으로 처리 §55①").
- 음수 입력 시 미리보기에서 `perShareAssetValue = 0`으로 자연 표시(엔진 clamp). 기존 "0으로 절사" 경고(`data.netAssetValue > 0 && perShareAssetValue === 0`)는 **양수 한정 조건이라 음수 시 미발화 — 정상**(모순 없음, 실증).
- **개선(⑦)**: 음수 입력 시 필드 하단에 정적 안내 `음수 순자산 → 0으로 처리(§55①)` 노출(순손익 미리보기 박스의 "→ 0 적용(§56① 단서)"과 대칭). 사용자가 0 처리를 "버그"로 오인 방지. 납세자 유불리 표현 금지([[feedback_tax_calculation_principle]]).

---

## 6. 14개 동기화 지점 점검 (Definition of Done)

| # | 지점 | 변경 | 비고 |
|---|---|---|---|
| ① 폼 상태 | `UnlistedStockData` 타입 | — | `netIncomeY1~Y3?`·`netAssetValue` 이미 number(signed 허용) |
| ② initial | `defaultStockData` | — | 0 기본값 유지 |
| ③ normalize | lookup normalize | — | clamp 없음 (실증) |
| ④ API 변환 | `inheritance-api.ts` | — | estateItems 무변환 통과 |
| ⑤ UI 위젯 | `NetIncomeYearRow`·순자산 CurrencyInput | **(B)(C)** | 토글 제거 + allowNegative |
| ⑥ 사이드바 | 주식 합계 (`TotalStockValue`) | — | `calcUnlistedStockPerShareValue`가 clamp → 변화 없음 |
| ⑦ 결과/미리보기 | `UnlistedStockPreview` | 경고 문구 점검 + 음수 안내 | 적자 판정 `resolveWeightedNetIncome<=0` 음수 입력으로도 정상 |
| ⑧ Validation | `inheritance-validate.ts`·`gift-validate.ts` | — | 간편모드 음수 차단 없음 (V2만 검증) |
| ⑨⑩ Zod enum | — | — | enum 무관 |
| ⑪ acqDate fallback | — | — | 무관 |
| **⑫ Zod 입력 객체** | `property-valuation-input.ts:29` (단일 `unlistedStockDataSchema`) | **(D)** | `netAssetValue` nonnegative 제거 — 상속·증여 동시 |
| ⑬ body spread | `inheritance-api.ts`·`gift-api.ts` | — | estateItems/giftItems 포함됨 |
| ⑭ Route 매핑 | inheritance/gift route | — | estateItems passthrough |
| **공용 util** | `parseAmount` (`CurrencyInput.tsx`) | **(E)** | NaN 가드 |

→ 실질 변경 지점: **⑤(UI B·C) + ⑫(Zod D) + 공용 CurrencyInput(A·E)**. 나머지는 무영향 실증 완료.

---

## 7. 케이스 매트릭스 (Pre-Do anchor 대상 — [[feedback_pre_anchor_verification]])

> Do 진입 전 **앵커 1~2건 우선 실행**해 현행 동작 실증. "현행 일치 예상" 가정 금지.

| # | 시나리오 | 입력 | 기대 |
|---|---|---|---|
| C-1 | 전 연도 흑자 | Y1=120M, Y2=80M, Y3=65.2M | 가중평균 양수, 순손익가치>0 |
| C-2 | 일부 결손(음수 직접) | Y1=−120M, Y2=−80M, Y3=65.2M(이미지값) | 가중평균 = (−360−160+65.2)/6 <0 → **0**, 순손익가치 0 |
| C-3 | 토글 제거 회귀 | C-2를 **음수 직접 입력**으로 | C-2와 **동일 store 값·동일 결과** (토글 경로와 등가) |
| C-4 | 음수 순자산 | netAssetValue=−50M, totalShares=100k | `perShareAssetValue=0`, 적자 시 최종 0 |
| C-5 | 양수 순자산 정상 | netAssetValue=5B, totalShares=100k | 5만/주 정상 |
| C-6 | Zod 음수 순자산 통과 (상속·증여 양쪽) | netAssetValue<0 POST | safeParse 성공(완화 후), 결과 0 처리 |
| C-7 | allowNegative 기본 off 회귀 | 기존 CurrencyInput 사용처 (allowNegative 미지정) | `-` 입력 무시(기존 동작 100% 보존) |
| C-8 | **`parseAmount` 전이/회귀** | `"-"`, `"-120,000,000"`, `"1,000"`, `""` | `0`, `-120000000`, `1000`, `0` (NaN 0건) |

- anchor 파일: `__tests__/tax-engine/property-valuation/unlisted-stock-deficit-negative.test.ts` (신규). C-7·C-8은 컴포넌트/util 단위 — RTL/util 테스트로 분리 가능.
- 엔진 무변경이므로 C-2/C-4/C-5는 **현행 엔진으로 이미 통과 예상**(node 산식 실증: C-2 가중평균 −75.8M→0) → **C-3(토글↔음수 등가)·C-6(Zod 완화·상속+증여)·C-7(off 회귀)·C-8(NaN 가드)** 가 본 PR의 실질 가드.

---

## 8. 작업 순서 (PDCA Do — 시퀀셜)

> CLAUDE.md 워크플로: UI 변경 위주이므로 Do 단계는 `inheritance-gift-tax-ui-senior` 단독 위임 가능(엔진 변경 0). Zod 완화(⑫)는 동일 PR 내 처리.

1. **Pre-Do anchor**: C-3·C-6·C-7·C-8 RED 작성 → 현행 실증(C-6는 현재 RED 예상 = Zod 차단 확인, C-8 `"-"` 현재 NaN 확인).
2. **(A)+(E)** `CurrencyInput` `allowNegative` prop + `parseAmount` NaN 가드 추가 + 단위 테스트 → C-7·C-8 GREEN.
3. **(D)** Zod `netAssetValue` nonnegative 제거 → C-6 GREEN (상속·증여 양쪽).
4. **(B)** `NetIncomeYearRow` 토글·`deficitY1/Y2/Y3` state 제거 + allowNegative 적용 → C-3 GREEN.
5. **(C)** 순자산 CurrencyInput allowNegative + 음수→0 정적 안내.
6. **⑦** 미리보기 경고 문구 검토(적자/0절사 경고가 음수 입력과 모순 없는지 — 양수 조건 미발화 확인).
7. **Check**: `npx tsc --noEmit` 0 → `npx vitest run __tests__/tax-engine/property-valuation/` → `ui-engine-sync-checker`.
8. **브라우저 확인**: Playwright e2e (`e2e/`) — 음수 입력→계산→결과 0 처리 확인 ([[feedback_browser_verify_with_playwright]]).

---

## 9. 리스크 / 주의

- **R-1 (회귀)**: `allowNegative` 기본 false 미보장 시 전 세목 금액 입력이 음수 허용으로 오염. → 기본 false + C-7 회귀 anchor 필수.
- **R-2 (저장 데이터 호환)**: 기존 토글로 저장된 음수 `netIncomeYN` 값은 그대로 음수 표시되면 됨(데이터 모델 동일). 마이그레이션 불필요.
- **R-3 (콤마+부호 포맷)**: `formatWithCommas("-120000000")` 정수부 콤마 + 선행 `-` 보존 로직 단위 테스트로 가드.
- **R-4 (lint --fix import 정리)**: `ToggleCard` import가 `NetIncomeYearRow`에서만 쓰이면 제거 — CLAUDE.md ESLint --fix 함정 주의(한 라인 1 named).
- **R-5 (음수 0 안내)**: 음수→0 처리를 사용자가 "버그"로 오인하지 않도록 미리보기 박스의 기존 "→ 0 적용(§56① 단서)"·순자산 hint를 유지·강조. 납세자 유불리 표현 금지([[feedback_tax_calculation_principle]]).
- **R-6 (`parseAmount` 공용 util 변경)**: NaN 가드(E)는 `CurrencyInput.tsx`의 공용 export로, 전 세목 통화 입력이 의존. NaN→0은 항상 안전(통화 필드 NaN은 항상 버그)하나, 회귀 위험 차단을 위해 C-8에 기존 digit-only 입력(`"1,000"`→1000)·빈값(`""`→0) 불변을 명시 anchor. parseAmount 분리 헬퍼 신설은 과설계 — 중앙 가드 채택.

---

## 10. 완료 정의

- [ ] C-1~C-8 anchor 통과 (특히 C-3 토글↔음수 등가, C-6 Zod 완화 상속+증여, C-7 off 회귀, C-8 NaN 가드)
- [ ] 결손 토글·`deficitY1/Y2/Y3` state·`Math.abs` 부호 로직 완전 제거 (grep 0건)
- [ ] `CurrencyInput allowNegative` 기본 false, 기존 사용처 무영향 (C-7)
- [ ] `parseAmount("-")` → 0 (NaN 0건, C-8)
- [ ] Zod `netAssetValue` 음수 허용 (단일 스키마 — 상속·증여 동시), 엔진 0 처리 일치
- [ ] `ToggleCard` import 미사용 시 제거 (ESLint --fix 함정 주의 — R-4)
- [ ] `npx tsc --noEmit` 0건 · 전체 `npm test` 통과
- [ ] Playwright e2e 음수 입력 흐름 통과 (상속·증여 양쪽)
