# 주식 부담부증여 채무비율 — 와이어에 증여가액 C를 싣는 S-2 계획서

**작성**: 2026-10-22 · **base**: master `2c9120fbb` · **선행**: `docs/00-pm/burdened-gift-debt-ratio-precision.plan.md` §6·§7(S-2 행)·§13.5 (PR-2 S-1 = `cf9089b32`/`ec404f79f`, master 포함 확인)
**상태**: ✅ Plan 확정 (2026-10-22 사용자 결정 — Q1 고침 · Q2 a-1 증여가액 C 1필드 `burdenedGiftValuationAmount` · Q2′ 구필드 폐지 + 수신 시 400 거절 · Q3 B>C 400 유지 · Q4 `positive()`만 · Q5 Playwright body 단언 포함 · Q6 선행 계획서 §13.5 후속 표기만) → Do
**실측 원자료**: 세션 scratchpad `sdf/`(p1~p8 · stock-acquisition-basis.ts.orig · sha.orig) — 세션이 끝나면 지워진다. 제품 파일은 probe 중 `stock-acquisition-basis.ts` 1개를 임시 변경(cp 백업 → 실행 → 원복)했고 **원복 sha 일치(`3084b73d…`)·`git status` clean을 확인**했다.

---

## 1. 요약

소득세법 시행령 §159①1호·2호는 부담부증여 양도 부분을 **`A × B/C`**(B 채무액, C 증여가액)로 계산하라고 한다
(KoreanLaw MCP `get_law_text(mst=290841, 제159조)` 본문 확인 · 현행 시행 2026-10-01). 주식 부담부증여에서 이 저장소는 **개산공제 base**(취득 당시 기준시가 총액, 시행령 §163⑥ 4호 「취득당시의 기준시가×1／100」 — 같은 MST 본문 확인)에도 B/C를 곱한다.

- **엔진이 B/C를 곱하는 곳은 정확히 한 곳(F4)**이다 — `lib/tax-engine/stock-transfer/stock-acquisition-basis.ts:410-417`. 주식 엔진 전체에서 `debt|채무|burdened` grep으로 확인(그 밖의 히트는 `exchangeDebtRelief`(교환 양도가) · 주석뿐). 환산취득가(`acquisitionPrice`)는 `transferPrice(=B)` 기반 단일 스케일(`apply163_9Conversion(transferPrice, acqStd, transferStd, 0)`, `stock-valuation-listed.ts:104`)이라 B/C 곱이 아니다.
- 와이어에는 소수 비율 `burdenedGiftDebtRatio` 하나뿐이다. 엔진은 C를 모른다. B는 같은 body의 `transferTotalPrice`로 **이미 실려 있다**(`gift-burdened-transfer-api.ts:577` = `assumedDebtForGift`) → 엔진 STEP 2에서 `transferPrice = input.transferTotalPrice`(`stock-transfer-tax.ts:206`)가 되고, `resolveAcquisitionBasis(input, transferPrice, …)`의 인자로 F4 지점에 **이미 손에 있다**.
- 따라서 **C 하나만 새로 싣고** 엔진이 `safeMultiplyThenDivide(estimatedBase, transferPrice, C)`로 곱하면 순환 소수 비율의 1원 과소가 사라진다. 와이어 변경은 14지점 중 ④⑫⑬⑭ + 엔진 타입·소비처뿐이고, **사용자 입력 폼(①②③⑤⑥)·결과 카드(⑦)는 무변경**이다.
- 실측(§6): 상장 현실 분포에서 F4 `estimatedBase` 1원 과소 **0.09~0.54%**(선행 계획서 Q5의 「0.002%」는 무작위 분포 값 — 둥근 주식수·호가 분포에서는 두 자릿수 배). 개산공제·과세표준이 바뀌는 건 그 일부, **산출세액이 바뀌는 사례를 엔진 쌍대 실행으로 1건 확인**(107,171,860 → 107,171,850). 영향은 최대 10원 단위 — 과장 금지.
- ⚠️ **폐지 방식에 함정이 있다.** `burdenedGiftDebtRatio`를 스키마에서 그냥 지우면 구버전 JS 번들을 든 탭이 보낸 필드가 Zod `z.object` 기본 동작으로 **조용히 strip**되고 개산공제 base가 **안분 없이 전액**(실측 개산공제 70,000 → 550,000, 7.9배)이 된다. 폐지 시 구필드 수신을 명시 거절하는 장치가 필수다(§7 Q2).

## 2. 원인

`burdenedGiftDebtRatio = assumedDebtForGift / valuationAmount`(`gift-burdened-transfer-api.ts:536`)를 와이어에 소수 하나로 싣는다. 엔진은 `applyRatio(estimatedBase, ratio)`(S-1)로 곱하는데, `applyRatio`는 짧은 소수(정수 %류)만 십진 정확이고 순환 소수(14/110 등)는 옛 식 `Math.floor(amount × ratio)`로 넘어간다(`tax-utils.ts:123-134`). 참값 `base × B / C`가 정수인 곱에서 float 곱이 `n−ε`에 떨어져 1원 과소.
근본 해법은 비율을 더 잘 추측하는 것이 아니라 **분자 B·분모 C 정수를 엔진까지 보내 `safeMultiplyThenDivide`에 넘기는 것**이다(정본 §159 경로가 이미 그렇다 — 선행 계획서 표 E).

## 3. 법령 근거 (인용 확인)

- 「소득세법 시행령」 §159①1호(취득가액 = A×B/C)·2호(양도가액 = A×B/C) — B 채무액, C 증여가액. **KoreanLaw MCP `get_law_text(mst=290841, jo=제159조)` 본문 확인(2026-10-22, 시행 2026-10-01)**. 산식이 분수로 명시되므로 정수 분자·분모 곱셈 후 나눗셈이 문언에 가장 가깝다.
- 「소득세법 시행령」 §163⑥ 4호(주식 등 제1호~제3호 외의 자산 — 취득당시의 기준시가×1／100) — 같은 MST 본문 확인. 상수 `STOCK.ENFORCEMENT_DECREE_163_6_4_ESTIMATED_EXPENSE`(`legal-codes/stock.ts:229`) 기존 사용.
- **확인 필요(정책 불변 전제)**: §159①은 «취득가액·양도가액»을 B/C로 안분한다고만 쓰고, **개산공제 base까지 B/C로 곱하라는 명문은 본문에 없다**. 이 저장소의 기존 정책(「환산취득가+개산공제」 합계의 두 항을 같은 스케일로 맞춘다)을 이번에 바꾸지 않는다 — 연산 정밀도만 고친다. 정책 자체의 법적 근거 재확인은 별건이다.
- 신규 조문 인용이 없어 `manifest/additions-*.ts` 등록은 불필요(기존 상수만 사용).

## 4. 경로 전수 조사 — `burdenedGiftDebtRatio` (file:line)

저장소 전체 grep(`lib components app __tests__ e2e docs`) 결과를 분류했다.

### 4.1 생산자 — 1곳뿐

| 위치 | 내용 |
|---|---|
| `lib/calc/gift-burdened-transfer-api.ts:672` | `body.burdenedGiftDebtRatio = debtRatio;` — `buildGiftStockBurdenedTransferBody`의 **estimated 모드에서만**(actual은 ④가 취득가를 이미 안분, `:655`). `debtRatio`는 `:536` |
| 호출 경로 | `callGiftStockBurdenedTransferAPI`(`:705`, 단건) · `callGiftStockBurdenedTransferAggregateAPI`(`:753`, `items:` 배열 합산) → 프로덕션 호출은 `components/calc/GiftTaxForm.tsx:261` **합산 호출 1곳**(단건 함수는 `__tests__/calc/gift-stock-burdened-aggregate.anchor.test.ts:90`만 호출 — 둘 다 같은 `buildGiftStockBurdenedTransferBody` 경유) |
| **다른 생산자 없음** | 주식 양도세 마법사 `lib/calc/stock-transfer-tax-api.ts` · `components/calc/stock-transfer/**` · 상속·취득 등 타 세목 · `lib/storage` · `lib/pdf` 어디에도 이 필드가 없다. 외부 호출자도 없다(`stock-transfer-tax-refines.ts:166`의 「호출자는 마법사 단건·합산과 부담부증여 단건·합산 넷뿐」 주석과 일치) |

### 4.2 수신·엔진 (14지점 표)

| # | 지점 | 파일:줄 | 현재 | 이 계획의 변경 |
|---|---|---|---|---|
| ① 폼 타입 | `EstateItem.assumedDebtForGift`·`marketValue` 등 | gift 폼 | 원값(B, C의 재료) 이미 있음. 비율 입력 칸 없음 | 무변경 |
| ② initial | — | — | 해당 없음(필드가 폼에 없음) | 무변경 |
| ③ normalize | — | — | 해당 없음 | 무변경 |
| **④ 변환** | `lib/calc/gift-burdened-transfer-api.ts:536` · `:672` · JSDoc `:468` | `debtRatio = B/C` → body 소수 | **C(`valuationAmount`)를 body에 싣고 비율 계산·전송 제거** | **변경** |
| ⑤ UI 위젯 | `components/calc/gift/StockBurdenedDebtSection.tsx` | 채무액·토글만, 비율 칸 없음 | 무변경 | 무변경 |
| ⑥ 사이드바 | — | 비율 미사용 | 무변경 | 무변경 |
| ⑦ 결과 카드 | `components/calc/results/BurdenedStockTransferTaxResultCard.tsx:12-15,168` | **결과(`StockTransferResult`)만 읽는다 — 와이어 필드를 읽지 않는다.** 산식은 안내 문구(분수 «채무액/주식평가액»)뿐 | 무변경(헤더 주석의 「개산공제 1% × (채무액/평가액)」 서술은 그대로 맞다) | 무변경 |
| ⑧ validate | `components/calc/gift-tax-form-validate.ts:328-390`(C-S1~S7) · `:405-` §47① B>C **경고(차단 아님)** | 이 경로의 ⑧은 **증여세 폼 validate**다. `lib/calc/stock-transfer-tax-validate.ts`는 이 경로를 거치지 않는다(마법사 전용) | 신규 필드가 사용자 입력이 아니고 fallback도 없어 ⑧ 규칙 추가 없음. 단 **B>C(§Q3)** 는 UI 통과↔API 차단 모순이 이미 있다 | Q3 |
| ⑨ Zod 메인 | `lib/api/stock-transfer-tax-schema.ts:203`(`stockTransferInputSchema`) · `app/api/calc/stock-transfer/route.ts:81` | — | — | ⑫ 참조 |
| ⑩ Zod 컴패니언 | `schema.ts:491-494` `aggregateStockItemSchema = union([foreign, addStockRefines(stockTransferInputSchema)])` · refines `lib/api/stock-transfer-tax-refines.ts:65` | 합산 경로는 **같은 입력 스키마·같은 refine을 재사용** → 필드 1회 추가로 단건·합산 둘 다 | refine 1건 추가(§5.3) | **변경** |
| ⑪ acquisitionDate fallback | `route.ts:93` | 이 필드와 무관 | 무변경 | 무변경 |
| **⑫ Zod 입력 객체** | `lib/api/stock-transfer-tax-schema.ts:418-421` | `burdenedGiftDebtRatio: z.number().min(0).max(1).optional()` | `burdenedGiftValuationAmount` 추가, 구필드 처리는 Q2 | **변경** |
| **⑬ body spread** | `gift-burdened-transfer-api.ts:709-716`(단건) · `:757-759`(합산 `items.map(build…)`) | body 객체를 **통째로** `JSON.stringify` — 필드별 spread 없음 | ④에서 body에 넣으면 자동 전달. 별도 편집 없음(grep 자가 점검만) | 확인 |
| **⑭ Route→엔진 매핑** | `lib/api/stock-transfer-engine-input.ts:166-168` — 단건 `route.ts:104` · 합산 `route.ts:138`이 **같은 `buildEngineInput`** 사용 | `burdenedGiftDebtRatio: coerced.… as number \| undefined` 명시 매핑 | 새 필드 1줄 매핑(누락 시 침묵 stripping) | **변경** |
| 엔진 타입 | `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts:637-651` | `burdenedGiftDebtRatio?: number` + JSDoc | 새 필드 JSDoc 교체(파일 1,635줄 — 순증 ≈0이라 분리 트리거 영향 없음, 기존 초과분은 본 계획 범위 밖) | **변경** |
| 엔진 소비처 | `stock-acquisition-basis.ts:410-417` | `applyRatio(estimatedBase, ratio)` (조건 `0<r<1`) | `safeMultiplyThenDivide(estimatedBase, transferPrice, C)` | **변경** |
| 합산 재실행 경로 | `stock-transfer-aggregate.ts:244·284` · `stock-transfer-aggregate-other-asset.ts:71` | `calculateStockTransferTaxInternal({ ...input, …})` — **input 전체 spread** | 새 필드가 그대로 따라간다(별도 편집 없음, 합산 anchor로 확인) | 확인 |

### 4.3 결과·표시·저장·PDF에서 이 필드를 읽는 곳 — 0곳

- `StockTransferResult`에 이 필드 echo 없음(타입·엔진 grep 0건).
- **저장**: 증여세 자동저장·수동저장은 `inputData = form`(EstateItem 등) + `resultData = 증여세 result`만 저장한다(`GiftTaxForm.tsx:92-98`, `gift-tax-save-handler.ts`). **주식 양도세 결과(`stockTransferTaxResults`)는 React state뿐**(`GiftTaxForm.tsx:67`)이고 IndexedDB·PDF 경로에 없다. **와이어 body 자체도 저장되지 않는다** — 이력 불러오기(`giftTaxResumeInput` → `GiftTaxForm.tsx:76-87`)는 폼을 복원하고 사용자가 「계산」을 다시 눌러야 body를 새 코드로 재구성한다. ⇒ **저장된 이력에 옛 `burdenedGiftDebtRatio`가 남는 경로가 없다.** (결과 선택 출력 `GiftTaxResultView.tsx:263`의 `burdened-stock-transfer-tax` 섹션은 state의 결과를 읽을 뿐.)
- 문서(참고, 역사 기록): `docs/02-design/features/gift-stock-burdened-transfer-tax.{engine,ui}.design.md` · `gift-stock-burdened-transfer-tax.plan.md` · `stock-carryover-97-2-necessary-expense.plan.md:619`의 필드 언급 — 설계 당시 기록이라 본 PR에서 갱신하지 않는다(필드명이 바뀌는 사실은 선행 계획서 §13.5에만 후속 표기).
- 테스트·가드 참조: `__tests__/calc/gift-burdened-stock-debt-ratio-precision.anchor.test.ts:114-160`(BD-8 + KNOWN-LIMIT `:150-160`) · `__tests__/calc/gift-burdened-stock-major-and-conversion.anchor.test.ts:251-259`(BG-DR-1) · `__tests__/lib/debt-ratio-apply-policy.test.ts:27,44,172-197` · `__tests__/tax-engine/stock-transfer/burdened-gift-stock-pre-do-anchor.test.ts`(주석뿐) · **E2E는 이 필드를 단언하지 않는다**(`e2e/gift-stock-burdened-transfer-tax.spec.ts` grep 0건).

### 4.4 엔진 B/C 사용처 총정리

| 항목 | 곱하는 값 | 방식 | 비고 |
|---|---|---|---|
| F4 개산공제 base | `estimatedBase × B/C` | 소수 비율 `applyRatio` | **본 계획 대상(유일)** |
| 환산취득가 `acquisitionPrice` | `transferPrice(=B) × 취득기준시가/양도기준시가` | 정수 분수 | B/C 곱 아님 — 대상 아님 |
| ④ actual 모드 안분 취득가 | `A × B/C` | `safeMultiplyThenDivide`(S-1) | 이미 정확 |

## 5. 설계안

### (a) 와이어에 C를 싣고 엔진이 `safeMultiplyThenDivide` ★ 권장

#### 5.1 B는 어디서 오는가 — 기존 `transferTotalPrice`가 B인가?

확인했다. ④ body는 `transferPriceMode: "actual"` · `transferActualInputMode: "total"` · `transferTotalPrice: assumedDebtForGift`(`:571-577`)이다. 엔진은 `actualMode === "total"`이면 `transferPrice = input.transferTotalPrice`(`stock-transfer-tax.ts:204-206`)로 확정한다. §159①2호에서 «양도가액 = 증여가액(C) × B/C = B»이므로 **부담부증여 주식에서 엔진의 `transferPrice`는 정의상 B**다. 새 B 필드는 필요 없다.

**하위 안**
- **a-1 (권장)**: 새 필드 **`burdenedGiftValuationAmount`(C, 증여재산 평가액)** 하나. B = 엔진 `transferPrice`.
  - 장점: B의 출처가 하나(`transferPrice`)라 두 필드가 어긋나는 드리프트가 없다(선행 PR-1 Q3 (a)의 근거와 같다). 와이어 필드 1개.
  - 주의: B를 암묵적으로 `transferPrice`에서 읽으므로 C 필드는 «실가·총액 입력 양도»에서만 의미가 있다 → Zod refine으로 그 형태를 강제(§5.3).
- **a-2**: `burdenedGiftDebtAmount`(B) + `burdenedGiftValuationAmount`(C) 둘 다. 비율의 직접 후속(자기완결 쌍)이라 refine이 와이어 안에서 닫히고(`0<B≤C`) per_share·교환 양도와의 결합 우려가 없다. 대신 B가 `transferTotalPrice`와 **같은 값을 중복 보유**해 어긋날 수 있고(④만 만들지만 직접 호출 시), 필드 2개 × 지점이 늘어난다.

#### 5.2 엔진 소비처 (`stock-acquisition-basis.ts`)

```
if (estimatedBase !== undefined && C !== undefined && C > 0 && transferPrice > 0 && transferPrice < C)
  estimatedBase = safeMultiplyThenDivide(estimatedBase, transferPrice, C);
```
- 가드 의미 보존: 종전 `0 < ratio < 1`에서만 곱했다 → `B === C`(r=1)는 곱하지 않음(어차피 동일 값), `B=0`·`C` 미지정 = 일반 양도(기존 동작 100% 보존, **자동 채움 없음**).
- 합류 지점 1곳(분기마다 두지 않음)은 그대로.
- 3대 정책: useEffect 미러링 없음 · 자동 안분 fallback 없음(C 미지정 = 안분 안 함, 빈 값을 채우지 않는다) · stock validate 14번째 동기화 — 이 필드는 사용자 입력도 UI fallback도 아니라 동기화 대상 fallback이 없다.

#### 5.3 ⑫⑩ Zod

- `burdenedGiftValuationAmount: z.number().positive().optional()`. **`.int()`는 걸지 않는다** — 선행 비율이 비정수를 허용했고, 증여 평가액(`computeStockValuation`: 할증·비상장 V2 평가)이 정수만 낸다는 확인이 없다(§10 확인 필요 1). `safeMultiplyThenDivide`는 비정수에서도 `Math.floor(product/c)`로 동작한다.
- `addStockRefines`에 한 건: **C가 있으면** (i) `transferPriceMode === "actual"` 이고 `transferActualInputMode === "total"`(엔진 default가 `per_share`라 명시 요구 — 3중 패턴 default 일치), (ii) `0 < transferTotalPrice ≤ C`, (iii) `acquisitionLots/transferLots` 없음(split 모드의 `transferPrice`는 lot 합계라 B가 아니다). 위반 시 종전 `max(1)` 위반과 같은 **400 Validation failed**(UI 통과↔API 차단의 기존 모순 §Q3는 유지).
- 합산 경로 `aggregateStockItemSchema`는 같은 스키마·refine을 재사용하므로 추가 편집이 없다. **회귀 위험**: `z.union([foreign, domestic])`라 domestic이 refine에서 실패하면 foreign 분기의 오류와 같이 나온다 — 메시지 위치만 확인(기존 동작).

### 병기 vs 폐지 — 구버전 입력 처리

| 안 | 내용 | 평가 |
|---|---|---|
| **폐지 + 구필드 명시 거절 (권장)** | 새 필드로 교체. 스키마에 `burdenedGiftDebtRatio`를 `optional` + «수신 시 400»으로만 남김(1릴리스 후 제거) | 구버전 탭이 보내면 **400 → 기존 «주식 부담부증여 양도소득세 계산에 실패했습니다» 배너**(`GiftTaxForm.tsx:276-283`)로 표면화, 재로드로 해소. **침묵 오계산 없음**. 엔진 경로 1개(정본). 구버전 저장 이력 없음(§4.3) |
| 병기 | C가 오면 분수, 없고 비율만 오면 `applyRatio` | 엔진에 두 경로 + 정적 가드(비율 곱 금지)와 충돌 — 가드 예외가 필요. 순환 소수 정확도는 구필드 호출에선 계속 열려 있어 «고쳤다»는 말이 반쪽 |
| 폐지 + strip(거절 없음) | 필드만 삭제 | **금지** — 구버전 탭 payload가 침묵 strip되어 개산공제가 안분 없이 전액(실측 70,000 → 550,000)이 된다. «침묵 stripping» 부류 |

외부 호출자는 없고(§4.1) 저장된 이력도 body를 쓰지 않으므로(§4.3) **병기의 호환 이득이 없다**. Next.js 재배포 직후 구번들 탭의 단발 오류만이 호환 이슈다.

### (b) ④가 개산공제 base를 미리 계산해 보낸다 — 기각

개산공제 base = **취득 당시 기준시가 총액**은 엔진이 산정한다(상장: 종가평균 환산 `stdPriceTotalForEstimatedDeduction`, 비상장: §165④ 보충평가 + 80% 하한·월할·거래정지 분기, `stock-acquisition-basis.ts:152-320`). ④(클라이언트)는 이 값을 모른다 — 계산하려면 엔진을 클라이언트에 복제해야 한다(dual-truth, 엔진 순수성·책임 분리 위반). 대안으로 «B/C를 곱한 값 대신 이미 곱한 개산공제 override»를 보내는 안도 같은 이유로 불가(override 필드는 엔진 산정을 우회해 환산·하한 분기를 죽인다). **불채택.**

### (c) 분자·분모를 정수 두 개로 `burdenedGiftDebtNumerator/Denominator` — a-2와 동형, 별도 안 아님

### 권장

**a-1 + 폐지 + 구필드 400 거절**: 와이어 필드 1개(C) 추가·1개 수신 거절. 최소 변경(④·⑫·⑩ refine·⑭·엔진 타입/소비처 6곳, UI·결과·validate 무변경).

## 6. 실측 (throwaway probe)

모두 실제 `tax-utils.ts`·실제 엔진(`buildGiftStockBurdenedTransferBody` → `addStockRefines(stockTransferInputSchema)` → `buildEngineInput` → `calculateStockTransferTax`)을 `npx tsx --tsconfig tsconfig.json`로 import해 실행. 참값은 BigInt `floor(base×B/C)`. PRNG 고정 시드(LCG). 쌍대 «후»는 `stock-acquisition-basis.ts`에 임시 hook(`__probeC`)을 넣어 `safeMultiplyThenDivide(estimatedBase, transferPrice, C)`를 태운 것(**원복 sha 일치**).

### 6.1 F4 `estimatedBase` 1원 과소 빈도 (현행 `applyRatio(base, B/C)`, 각 모델 40만 표본)

| 모델 | 참값이 정수(나눠떨어짐) | 현행 과소 | 개산공제 달라짐 | 신 방식 과소/과대 |
|---|---|---|---|---|
| M1 전부 둥근(C·B·base 만원 단위) | 439 | 7 (0.002%) | 5 | 0/0 |
| M2 전부 둥근(백만 단위) | 9,562 | 117 (0.03%) | 111 | 0/0 |
| M3 상장: C=p₁×주식수, B 만원, base=p₀×주식수(호가 100원) | 9,923 | 372 (**0.09%**) | 266 | 0/0 |
| M4 상장: B 백만 단위 | 10,893 | 431 (**0.11%**) | 401 | 0/0 |
| **M5 상장: 주식수 100주 단위 · 호가 1,000원 · B 백만** | 55,025 | **2,141 (0.54%)** | 2,015 | 0/0 |
| M6 비상장: C·base 원 단위 임의 | 0 | 0 | 0 | 0/0 |
| M7 B/C = 정수 % (S-1이 고친 부류) | 400,000 | **0** | 0 | 0/0 |

- 과소는 **전부 «참값이 정수로 떨어지는 곱»**에서만 난다(과소 중 나눠떨어짐 비율 100%). 과대는 0건.
- 따라서 선행 계획서 Q5의 «빈도 0.002%»는 M1(무작위 둥근 금액) 수준 값이다. **상장 현실 분포(호가·주식수가 둥근 경우)는 0.1~0.5%**로 한 자릿수~두 자릿수 배다. 그래도 «대부분 영향 없음»이다 — 비상장(M6)은 0건.
- 신 방식(`safeMultiplyThenDivide`)은 전 모델 오차 0.

### 6.2 개산공제·과세표준·산출세액이 바뀌는 엔진 쌍대 실행

| 표본 | n | estimatedBase 다름 | 개산공제 다름 | 과세표준 다름 | 산출세액 다름 |
|---|---|---|---|---|---|
| p3: 상장 환산, 호가 1,000원·주식수 100주 단위·B 백만 | 20,000 | 86 (0.43%) | 80 | 79 | **0** |
| p4: 호가 100원·B 천원 단위(임의에 가까움) | 60,000 | 42 (0.07%) | 18 | 17 | **0** |
| p5: **현행이 틀리는 구성만**(참값이 정수가 되게 B 선택) | 3,000 | 3,000 | 118 (3.9%) | 117 | **3 (0.1%)** |

- 영향이 작은 이유: base 1원 차이가 개산공제(1%)를 바꾸려면 참값이 100의 배수여야 하고, 세액을 바꾸려면 다시 과세표준 mod 5(20% 세율, 10원 미만 절사) 경계에 걸려야 한다. 합치면 **무작위 현실 표본에서 산출세액 변경은 10만 건당 한 자릿수 미만**이다. 과장하지 말 것 — 이 PR의 가치는 «참값 보장»이지 세액 대량 변동이 아니다.
- **산출세액이 바뀌는 사례 1건(실제 엔진 쌍대, 구성 사례)**: 상장(KOSPI) 환산 · 장외 비대주주(20%) · 증여 평가액 C **1,373,760,000** · 채무 B **717,925,280** · 32,400주 · 취득일 이전 1개월 평균 10,500 · 양도일 이전 1개월 평균 42,400. 비율 0.5225987654320987(순환).

  | | 현행 | 신(참값) |
  |---|---|---|
  | 개산공제 base `estimatedBase` | 177,788,099 | **177,788,100** |
  | 개산공제 | 1,777,880 | **1,777,881** |
  | 양도소득금액 | 538,359,300 | 538,359,299 |
  | 과세표준 | 535,859,300 | 535,859,299 |
  | **산출세액(=결정세액)** | 107,171,860 | **107,171,850** |
  | 지방소득세 | 10,717,180 | 10,717,180 |

  (엔진이 산출세액을 10원 미만 절사하므로 과세표준 1원이 10원으로 보인다. 표시 B는 «참값이 정수가 되도록» 고른 구성값이라 대표 빈도가 아니다 — 빈도는 위 표를 볼 것.)
- 선행 KNOWN-LIMIT 사례(B 1,400만 · C 1.1억 · 취득기준시가 총액 5,500만): 쌍대 실행 결과 `estimatedBase` 6,999,999 → 7,000,000, 개산공제 69,999 → 70,000, 과세표준 3,730,001 → 3,730,000, **산출세액 746,000 → 746,000(불변)**.

### 6.3 구버전 payload 침묵 strip 실측 (폐지 시 함정)

KNOWN-LIMIT 사례 body에서 `burdenedGiftDebtRatio`만 제거(= 신 스키마가 구필드를 모르는 상황)하고 같은 파이프라인을 태웠다. Zod는 모르는 키를 **조용히 strip**한다(`unknown key stripped: true`). 결과 `estimatedBase` 55,000,000(안분 없음) · 개산공제 **550,000**(현행 70,000의 7.9배) · 과세표준 3,250,000(현행 3,730,000). ⇒ §5 «구필드 명시 거절»이 필수인 근거.

### 6.4 B>C 현행 동작 (정책 보존 대상)

estimated 모드에서 B=1.2억 > C=1억: 현행 Zod가 `burdenedGiftDebtRatio: Too big: expected number to be <=1`로 **400**. B=C: 통과. **actual 모드 B>C는 통과**(1주당 취득가 48,000 = 4,000만 × 1.2 / 1,000주 — 안분 취득가가 실지취득가를 넘는 값; 이 PR 범위 밖 관찰). 증여세 폼 ⑧은 B>C를 **경고만**(차단 아님, `gift-tax-form-validate.ts:405-`)하므로 estimated 모드에서 «UI 통과 → API 400»인 기존 모순이 있다.

## 7. 사용자 결정

| Q | 쟁점 | 선택지 | 권장 |
|---|---|---|---|
| Q1 | 이번에 고칠지 | (a) S-2 진행 (b) 보류 — 0.1~0.5%(상장 현실 분포)·산출세액 영향 극히 드묾을 감수하고 KNOWN-LIMIT 유지 | (a) — 변경 6곳으로 작고, 순환 소수 비율을 «참값 보장»으로 닫으면 §13.5 한계 절이 사라진다. 영향 크기는 §6.2대로 작다는 점을 알고 결정 |
| Q2 | 와이어 형태 | (a-1) C 1필드, B=`transferPrice` (a-2) B·C 2필드 | a-1 — B 출처 단일(드리프트 방지). refine으로 «실가·총액»에 한정 |
| Q2′ | 구필드 `burdenedGiftDebtRatio` | (i) 폐지 + 수신 시 400 거절(1릴리스 후 필드 제거) (ii) 병기(구필드는 `applyRatio` 레거시) (iii) 폐지 + strip | (i) — (iii)는 침묵 오계산(§6.3), (ii)는 두 경로·가드 충돌 |
| Q3 | B>C 처리 | (a) 종전 보존: refine에서 400 (b) 안분 생략(r=1 취급) (c) 증여세 폼 ⑧에서 estimated 주식 부담부는 B>C **차단**으로 올려 UI↔API 모순 제거 | (a) — 동작 불변이 목표. (c)는 §47① 입증 후 허용 가능성(경고 문구)을 뒤집는 정책 변경이라 별건 후보로 «확인 필요» 표기 |
| Q4 | C 정수성 | (a) `positive()`만(비정수 허용) (b) `int()` | (a) — 증여 평가액이 항상 정수인지 미확인(§10), 선행 비율 필드도 비정수 허용 |
| Q5 | 검증 깊이 | (a) vitest 전 계층 + 라우트 핸들러 테스트 (b) + Playwright로 request body 1건 가로채기 단언 | (b) 권장 — 신규 와이어 필드는 «브라우저 → fetch body»만 vitest가 못 본다(CLAUDE.md 수동 확인 항목). 기존 `SBTT-E2E-2`에 `page.route` 가로채기 1줄 추가가 최소 |
| Q6 | 선행 계획서·문서 갱신 | (a) 선행 `burdened-gift-debt-ratio-precision.plan.md` §13.5·§6.4 «S-2 완료» 후속 표기 + 코드 주석 정정만 (b) 과거 설계 문서(`gift-stock-burdened-transfer-tax.*.design.md`)까지 | (a) — 과거 설계 문서는 기록 |

## 8. 구현 계획 (Do 시 순서)

브랜치는 선행 PR들과 독립이다(`stock-acquisition-basis.ts`·`gift-burdened-transfer-api.ts` 등 기존 PR 변경 파일이지만 master에 이미 머지됨).

1. **anchor 먼저(수정 전 실패 기록)** — §9.1 신규/반전 테스트를 먼저 쓰고 현행 코드에서 실패 확인.
2. 엔진 타입(`stock-transfer.types.ts:637-651`) JSDoc·필드 교체 → 소비처(`stock-acquisition-basis.ts:397-417`) 교체 + 주석(한계 문구 제거) → ⑫ 스키마(`stock-transfer-tax-schema.ts:418-421`) → refine(`stock-transfer-tax-refines.ts`) → ⑭ 매핑(`stock-transfer-engine-input.ts:166-168`) → ④(`gift-burdened-transfer-api.ts` `:468` JSDoc · `:536` · `:672`) → `inheritance-gift-estate.types.ts:995` 주석.
3. 정적 가드 개정(`debt-ratio-apply-policy.test.ts`) · KNOWN-LIMIT 반전 · BG-DR-1 수정.
4. 5단 파이프라인 grep: `grep -rn burdenedGiftValuationAmount lib app` → ④(생산) · ⑫ · ⑭ · 엔진 4곳이 나와야 하고 `burdenedGiftDebtRatio`는 구필드 거절 1곳 + 주석 외 0건.
5. 선행 계획서 §13.5 후속 표기(Q6 a).

**파일 크기**: `gift-burdened-transfer-api.ts` 783줄 — 순증 ≈0이지만 **800줄 직하**(변경 중 +17줄 이내로 유지; 초과 시 분리). `stock-transfer.types.ts` 1,635줄은 기존 초과(본 계획 순증 ≈0, 별건). 나머지는 모두 800줄 미만(schema 524 · refines 529 · basis 440 · engine-input 169).

## 9. 테스트·가드·뮤테이션 계획

### 9.1 anchor (수정 전 실패 → 수정 후 통과)

`__tests__/calc/gift-burdened-stock-debt-ratio-precision.anchor.test.ts` 확장(runFullStack = ④→⑫→⑭→엔진 그대로 사용).

| ID | 케이스 | 기대 |
|---|---|---|
| **BD-8 KNOWN-LIMIT 반전** | B 14,000,000 · C 110,000,000 · 취득기준시가 총액 55,000,000 | `estimatedBase === 7_000_000`(옛 6,999,999 단언을 참값으로 뒤집음) · 개산공제 70,000 · `body.burdenedGiftValuationAmount === 110_000_000` · `body.burdenedGiftDebtRatio === undefined` |
| BD-10 격자 | `B = m × (tr / gcd(tr, acq))`(참값이 정수가 되는 B)를 결정적 격자 수천 건 · 주식수 100주 단위 · 호가 100/1,000원 | `estimatedBase`·개산공제가 BigInt 참값과 **전건 일치**(현행은 격자 중 수% 불일치 — 수정 전 실패 건수 기록) |
| BD-11 결정세액 | §6.2 사례(C 1,373,760,000 · B 717,925,280 · 32,400주 · 10,500 · 42,400) | `estimatedBase 177_788_100` · 개산공제 `1_777_881` · 과세표준 `535_859_299` · **산출세액 `107_171_850`**(옛 107,171,860) |
| BD-12 정수 % 회귀 | S-1 기존 BD-8 케이스(57% · 28,500,000 / 285,000) · 10%(기존 BG-DR-2) · B=C(안분 없음) | 전부 불변 |
| BD-13 B>C | estimated · B 1.2억 > C 1억 | ⑫ refine **400**(종전 `max(1)` 400과 동일 상태). actual 모드는 영향 없음 |
| BD-14 구필드 | body에 `burdenedGiftDebtRatio`만 실린 payload(Q2′ i) | **400**, 메시지에 사유. C 없는 estimated payload(일반 양도) = 안분 없이 통과(기존 «ratio 없음» 동작) |
| BD-15 형태 제약 | C + `transferActualInputMode` 미지정/`per_share` · 교환 양도 · lots 동시 지정 | 400 |
| BD-16 합산 | `items` 2건(부담부 1건 + 일반 1건) 라우트 `POST` | 부담부 항목에 C가 도달(strip 안 됨)·일반 항목 불변. 기존 `gift-stock-burdened-aggregate.anchor.test.ts` 패턴 재사용 |
| BG-DR-1 수정 | 기존 `out.body.burdenedGiftDebtRatio ≈ 0.1` | `out.body.burdenedGiftValuationAmount` = 평가액으로 교체 |

### 9.2 정적 가드 (`debt-ratio-apply-policy.test.ts`)

- `FLOOR_ONLY_GUARDED_FILES`(stock-acquisition-basis)를 폐지하고 `GUARDED_FILES`에 편입 — 이제 `applyRatio(…, 비율)`도 금지.
- 코드 줄 호출 존재 가드: `safeMultiplyThenDivide(estimatedBase, transferPrice, input.burdenedGiftValuationAmount)` 패턴(`:172`의 `applyRatio(estimatedBase, input.burdenedGiftDebtRatio)` 매치를 교체).
- 식별자 가드: `burdenedGiftDebtRatio` 코드 줄은 «구필드 거절 1곳(스키마)»만 허용(주석 제외) — `IDENTIFIER_GUARDED_FILES`에 ④·엔진·engine-input 편입.
- 자기구별 테스트의 `applyRatio(estimatedBase, input.burdenedGiftDebtRatio)` 허용 케이스(`:196`) 갱신.

### 9.3 뮤테이션 (cp 백업 → 변형 → 대상 테스트 → 원복 sha 확인, git checkout 금지)

| # | 변형 | 기대 KILLED |
|---|---|---|
| S1 | 엔진 `safeMultiplyThenDivide` → `applyRatio(base, B/C)` 복귀 | BD-8 반전 · BD-10 · BD-11 |
| S2 | B↔C 뒤집기 | BD-8 · BD-10 |
| S3 | ④ `body.burdenedGiftValuationAmount` 미전달 | BD-8/BG-DR(+ 안분 사라지므로 BD-12 57% 케이스) |
| S4 | ⑫ 스키마에서 새 필드 삭제(침묵 strip 재현) | BD-8 · BD-16 |
| S5 | ⑭ `buildEngineInput` 매핑 삭제 | BD-8 · BD-16 (runFullStack이 ⑭ 경유) |
| S6 | refine B>C 제거 | BD-13 |
| S7 | 구필드 거절 제거 | BD-14 |
| S8 | `transferPrice < C` → `<=` | **SURVIVED 예상 — 동치**(`x×C/C = x`). Q 없이 가독성 가드로 유지(PR-1 M10과 같은 부류) |
| S9 | 엔진이 `transferPrice` 대신 `input.transferTotalPrice` 사용 | SURVIVED 예상 — actual/total에서 동치. refine이 형태를 강제하므로 허용 |
| S10 | refine의 `total` 모드 요구 제거 | BD-15 |

### 9.4 검증 절차

- Do 후 **동작 불변 계측**(선행 §13.6 방식): `buildGiftStockBurdenedTransferBody|burdenedGiftDebtRatio|burdenedGiftValuationAmount|burdenedGiftStockTransferTax|assumedDebtForGift`를 포함한 `.test.ts`·`.test.tsx`에서 신·구 식 병행 로그(임시, 원복·sha 일치) — 기존 호출(비율 0.1·0.2 등 짧은 소수)에서 신·구 불일치 0건 보고.
- `npx vitest run __tests__/calc/ __tests__/tax-engine/stock-transfer/ __tests__/api/ __tests__/lib/debt-ratio-apply-policy.test.ts` → `npm run check:pre-pr`. 부동산 transfer 회귀 영향 없음(파일 비중복) 확인.
- **브라우저 확인**: Q5 (b)이면 Playwright(`E2E_PORT` 격리)로 증여세 폼 → 주식 부담부 양도세 토글 ON → 계산 → `/api/calc/stock-transfer` request body에 `burdenedGiftValuationAmount` 존재·`burdenedGiftDebtRatio` 부재를 단언 + 결과 카드 개산공제 값. 미수행 시 명시.
- 14지점: ⑫⑬⑭ grep 자가 점검(§8 4번). ⑧ 증여 폼 validate 무변경(근거 §4.2 ⑧). **3대 정책**: useEffect 미러링 없음 / 자동 안분 fallback 없음(C 미지정 = 안분 안 함) / `lib/calc/stock-transfer-tax-validate.ts` 동기화 대상 없음(마법사에 이 필드·UI fallback 없음 — grep 0건).
- 법령 검증: 신규 조문 인용 없음 → `manifest/additions-*.ts` 불필요.

## 10. 확인 필요 목록

1. **증여 평가액 C의 정수성**: `computeEffectiveValuation`은 `marketValue` 등 사용자 입력을 그대로, 없으면 `computeStockValuation`(할증·비상장 V2 평가)을 반환한다 — 후자가 항상 정수인지 미확인. 비정수여도 `safeMultiplyThenDivide`는 `Math.floor(product/c)`로 동작(정확도는 정수 경로보다 낮을 수 있음). Do에서 `.int()` 부재 근거로 probe 1건.
2. **개산공제 base까지 B/C로 곱하는 정책의 법적 명문 근거**(§3) — 본 계획은 정책을 바꾸지 않는다. 별건 후보.
3. **B>C estimated 시 UI 통과↔API 400 모순**(§6.4)과 **actual 모드 B>C가 통과해 안분 취득가가 실지취득가를 넘는 점** — 이번에 정책을 바꾸지 않는다(Q3). §47① 입증 후 허용 가능성이라는 ⑧ 경고 문구와 충돌할 수 있어 사용자 결정 필요.
4. **단건 `callGiftStockBurdenedTransferAPI`**는 프로덕션 호출자가 없고(`GiftTaxForm.tsx`는 합산만 import) 테스트 1곳만 호출한다 — 죽은 코드 여부는 관찰만(건드리지 않음).
5. **합산 경로(`aggregateCore`) 재실행**에서 새 필드가 보존되는지는 `...input` spread 구조상 따라간다고 읽었으나 실행 확인은 BD-16 몫이다.
6. **`.test.tsx`(jsdom) 부담부 주식 테스트**는 값 계측에서 제외 가능성이 있다(표시 테스트라 영향 낮다고 보나 미관찰) — 동작 불변 계측에서 포함 여부 보고.
7. 구필드 거절의 **제거 시점**(1릴리스 후)은 배포 주기에 따라 사용자 결정.

## 11. 범위 밖 (관찰만)

- 환산취득가 `floor(B × acq/trans)`와 «C×(acq/trans)×B/C»의 floor 순서 차이 — 정책 불변.
- `perShareAcquisitionPrice = floor(안분취득가 / 주식수)` × 주식수 증폭(선행 §10) — 별건.
- 증여세 폼 ⑧의 B>C 경고→차단 승격(Q3 c) — 별건.
- 주식 개산공제 `Math.floor(estimatedBase * STOCK_ESTIMATED_EXPENSE_RATE)`(`stock-acquisition-basis.ts:420-428`) — 세율 곱(`applyRate` 계열 소관), 이번 실측 대상 아님.
