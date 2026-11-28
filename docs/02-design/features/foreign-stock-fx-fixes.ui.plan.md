# 국외주식 환산 4건 — UI·클라이언트 계획 (①②③⑤⑥⑦⑧)

> 엔진·API 파트: [foreign-stock-fx-fixes.engine.plan.md](foreign-stock-fx-fixes.engine.plan.md) (병행 작성 — **이 문서의 계약 요구(§7)는 그쪽과 맞춰야 확정**). 근거 별건 목록: [transfer-foreign-realestate.engine.plan.md](transfer-foreign-realestate.engine.plan.md) §9.
> **기준 트리**: worktree `stock-fx-plan` (HEAD = master `2e47de6b4`). 아래 file:line은 전부 이 트리에서 열어 확인(코드 읽기)했다. probe·브라우저 실행은 하지 않았다 → 「실행 미확인」.
> **범위**: 클라이언트 8지점(①폼 ②initial ③normalize ④API 변환 ⑤위젯 ⑥사이드바 ⑦결과 ⑧validate). ⑨~⑭(Zod·Route)는 엔진 파트. 이 문서는 코드를 고치지 않는다.
> **Q·V·UQ 번호는 이 문서 안에서만 쓴다**(UQ = UI 사용자 결정, V = 미검증).

---

## 0. 한 줄 요약

| # | 이슈 | UI에 닿는 곳 | 핵심 |
|---|---|---|---|
| 1 | 환산 1원 과소 | **미리보기 6곳**(§1.1)이 같은 부동소수 `Math.floor`를 **복제**하고 있다 + 결과 카드 환율 표시 `toLocaleString`이 **소수 3자리에서 잘린다**(§1.3) | 엔진이 쓸 환산 leaf **한 개**를 import해 6곳을 치환. 한도(소수 4자리·금액 1e11·환율 1e7)는 ⑧이 같은 상수로 미러 |
| 2 | 환율 fallback | 필요경비 환율 2칸만 해당(외국납부세액은 **이미 ⑧·Zod 필수**) — 힌트·placeholder·⑧ 주석·E2E FXE-3이 fallback을 **명문화**(§2) | **keep / remove 두 갈래**(UQ-3). remove면 ⑧ 필수화 + 문구 교체, 저장 폼 마이그레이션은 **불필요**(§2.3) |
| 3 | FS-09 장기할부 | `InstallmentReceiptsMatrix`·`FS_RECEIPT_MODE_OPTIONS`·결과 카드 분기·⑧·④가 전부 «수령일별 환율» 전제 | 영 §178의5② 현행 본문 = **양도일 1회 환율**(§3.1 verbatim). 엔진이 바꾸면 수령일 행의 환율 열이 **의미를 잃는다**(UQ-6) |
| 4 | `foreign-options.ts` 리터럴 | 주식 1곳 + 부동산 1곳이 공유 | 법령 상수 2개 신설 후 라벨 조립(§4). 소스 가드 테스트는 **없다** |

---

## 1. 이슈 1 — 원화 환산 1원 과소 (UI 측)

### 1.1 `Math.floor(외화 × 환율)`을 UI가 복제한 곳 — 전수 (grep `Math\.floor\(.*(rate|Rate|…)` + 수동 확인)

| # | 위치 | 코드 | 무엇을 환산 | 화면 문구 |
|---|---|---|---|---|
| U-1 | `components/calc/foreign/ForeignDatedAmountRows.tsx:78-83` `calcRowKrw` → `:119-124` `rowKrw`(`krwOf` 미지정 시 이 경로) | `Math.floor(amount * rate)` | 행별 원화 환산(셀 미리보기) + **합계**(`:128-133`) | 우측 열·합계 상자 |
| U-2 | `components/calc/stock-transfer/ForeignStockPriceBlock.tsx:163` | `Math.floor(perShare * count * rate)` | 양도가액 single·1주당 | «양도가액(원화 환산 참고): N» |
| U-3 | 같은 파일 `:166` | `Math.floor(total * rate)` | 양도가액 single·총액 | 같음 |
| U-4 | 같은 파일 `:259` | `Math.floor(perShare * count * rate)` | 취득가액(실가·시가 두 모드) | «취득가액(원화 환산 참고): N» |
| U-5 | `components/calc/stock-transfer/StockSidebar.tsx:207`, `:210` | 위와 동형(`parseFloat`) | 사이드바 «양도가액(환산 참고)» | 사이드바 행 |
| U-6 | `components/calc/stock-transfer/ForeignCarryoverBlocks.tsx:76` | `Math.floor(perShare * count * rate)` | 증여자 취득가액(이월과세) | «증여자 취득가액(원화 환산 참고): N» |

- **`InstallmentReceiptsMatrix.tsx:63-75`는 `krwOf`를 넘기지 않는다** → 주식 수령 행은 U-1의 기본 경로를 탄다. 부동산은 `krwOf={krwOfExact}`(`components/calc/transfer/foreign/foreign-ui-shared.ts:46-50`)로 이미 엔진 leaf를 쓴다 — **같은 컴포넌트가 두 갈래**다. U-1의 기본값(`calcRowKrw`)을 지우고 `krwOf`를 필수로 만들면 호출처(주식 1곳·부동산 N곳) 누락이 **컴파일 에러로 잡힌다**(권장, UQ-1).
- 사이드바는 별도 `compute…Summary` 함수가 없다 — `StockSidebar.tsx:199-212`에 **인라인**이다(⑥ 지점). 같은 블록이 `fsTransferReceiptMode`를 **보지 않는다**: 분할 수령 모드에서도 stale한 단일 입력(`transferExchangeRate`·`perShare…`)으로 미리보기를 낸다(코드 읽기 · 실행 미확인 — 이슈 3과 함께 정리, §3.4).
- **이미 정확한 곳(손대지 않음)**: 국외전출세 `lib/calc/stock-transfer-exit-tax-fx-preview.ts:10,21`은 엔진 `toKrwExact`를 쓴다. 신고서 양식(`StockFilingFormTable*`·`ForeignStockFilingFormSection`)은 환율 곱셈이 **없고** `StockTransferResult`만 읽는다(grep 확인 — `Math.floor`·`ExchangeRate` 연산 0건). 결과 카드(`ForeignStockResultCard.tsx:119-170`)의 «외화 × 환율 = 원화»는 **엔진 값 echo**라 재계산이 아니다.

### 1.2 어떤 helper를 쓰나 — 후보 2개 (엔진 파트가 정한다 → UQ-1)

| 후보 | 위치 | 특성 | 주식 UI 적합성 |
|---|---|---|---|
| `toKrw`/`tryToKrw(amount, rate, path)` | `lib/tax-engine/foreign-realestate/fx.ts:41,66` | 소수 4자리·금액 ≤1e11·환율 ≤1e7, 위반 시 throw / `{error}`. **수량 인자 없음** | `단가 × 주식 수`를 UI에서 먼저 곱하면 **그 곱이 다시 부동소수**(예: 0.1 × 3). 단가×수량 경로(U-2·U-4·U-6)에 그대로 못 쓴다 |
| `toKrwExact(amount, rate, quantity)` | `lib/tax-engine/stock-transfer/exit-tax-fx.ts:73-90` | `단가×수량×환율` BigInt 1회 절사(수량 정수). **환율 소수 4자리** 제한(`FX_RATE_MAX_DECIMALS`), 금액 소수 10자리 | 단가×수량에 적합. 단 범위 상한(1e11)·throw 형식이 `tryToKrw`와 다르다 |

- 사실: 엔진 `foreign-stock.ts`는 `:199`(총액)·`:204`(단가×주수)·`:216`·`:223`(취득)·`:246-247`(필요경비)·`:257`(외국세)·`:97`(수령 행)에서 `Math.floor`를 쓴다(`foreign-stock.ts` grep). UI는 **그중 어느 항목을 엔진이 바꾸는지**를 따라간다 — 엔진 계획서 확정 전 UI가 먼저 결정하지 않는다.
- UI 계약(§7 C-1): 엔진 파트가 **client-safe 순수 함수 1개**(`(amount, rate, quantity?) → number | {error}` 형태)를 export하면 U-1~U-6 전부 그것만 import. 전례: `lib/stores/transfer-foreign-summary.ts:17,53`이 부동산 엔진 leaf를 직접 import한다(single-source-engine-helper 스킬).
- 미리보기는 **환산 불가(한도 위반·빈 칸)면 `null` → 행 자체를 숨긴다**(부동산 `foreignKrwPreview` 규약, `foreign-ui-shared.ts:38-43`). throw를 렌더 중에 던지면 안 된다(렌더 크래시).

### 1.3 인접 결함 — 결과 카드의 환율 표시 3자리 절단 (실측)

- `ForeignStockResultCard.tsx:28-30` `fmt(n) = n.toLocaleString("ko-KR")`과 `components/calc/foreign/fx-formula.ts:6-8` 동형 `fmt`는 **소수 최대 3자리**다. 실측: `(1300.1234).toLocaleString("ko-KR")` = `1,300.123`. 환율을 소수 4자리까지 받는 한(엔진 `FX_MAX_DECIMALS = 4`) 결과 산식의 «× 환율» 숫자가 **입력과 다르게 보인다** → 사용자가 «외화 × 환율 = 원화»를 계산기로 검산하면 어긋난다(⑦ 산식 검증성 위반).
- 영향 지점: `fx-formula.ts:19`(`fmt(rate)`), `ForeignStockResultCard.tsx:133`(수령 행 `fmt(r.exchangeRate)`), `:183`·`:212-214`(외국납부세액·지출일 환율). 부동산 결과(`foreign-result-parts.tsx`)가 같은 `fxFormula`를 쓴다 → 환율용 포맷터(소수 4자리) 도입은 **공용 leaf 1곳** 수정으로 양쪽에 반영된다.
- 이 수정은 이슈 1과 **같은 PR**(UI-1)에 넣는 것을 권장 — 1원 정확성을 올려도 표시가 잘리면 검증이 안 된다. (UQ-2)

### 1.4 14지점 매핑

| 지점 | 변경 | 비고 |
|---|---|---|
| ①②③ 폼·initial·normalize | **없음**(필드 추가 0) | 환산은 파생값 |
| ④ API 변환 | 없음(이슈 1 단독) | `parseFloatOrUndef`가 환율 문자열을 number로 — 소수 4자리 초과는 ⑧이 사전 차단 |
| ⑤ 위젯 | U-1~U-6 치환 | 800줄: `ForeignStockPriceBlock` 272·`StockSidebar` 392·`ForeignDatedAmountRows` 250 — 모두 여유 |
| ⑥ 사이드바 | U-5 치환 + 분할 수령 모드 가드(§3.4) | |
| ⑦ 결과 | `fmt(rate)` 소수 4자리(§1.3) | 엔진 echo(`transferPriceForeign = perShare × shareCount`)도 부동소수 → 엔진이 정수 스케일로 내면 표시 일치(V-3) |
| ⑧ validate | **한도 미러**: 환율 소수 5자리 이상·외화액 >1e11·환율 >1e7이면 «다음» 차단 — 엔진이 throw하는 입력을 ⑧이 통과시키면 **UI 통과 ↔ 엔진 400 모순**(`stock-transfer-tax-validate-foreign.ts`는 현재 `> 0`만 본다: 수령 행 `:181-195` · 필요경비 `:321-328` · 외국세 `:350-361`) | 부동산은 `transfer-foreign-validate.parity.test.ts`로 격자 고정 — 주식도 같은 parity 테스트 신설(UQ-2) |

### 1.5 테스트·E2E

- 갱신: `__tests__/components/foreign-stock-market-price-acq-input.anchor.test.tsx:51`(취득 미리보기 12,000,000), `__tests__/components/calc/stock-transfer/foreign-carryover-widgets.anchor.test.tsx:150`(증여자 50,000,000), `e2e/foreign-stock-carryover-97-2.spec.ts:160-161` — **값은 같다**(정수 케이스). 새 helper 경유 후에도 통과해야 하는 **회귀망**.
- 신규 anchor(핵심): 미리보기 == 엔진 결과가 **1원 과소가 나는 입력**에서 일치 — `400000 × 1300.10`(부동산 K-23 실측 520,039,999 vs 520,040,000)을 U-3 총액 모드에, 단가×주수형(`perShare × count × rate`)은 엔진 파트가 실측한 반례(V-1)로. 「UI 미리보기 = API 응답 `transferPriceKrw`」 동일성 1건(e2e) + 컴포넌트 단위 1건.
- 신규: ⑧ parity 격자(소수 4/5자리·1e11 경계·환율 1e7 경계) — 같은 상수 import(`FX_MAX_DECIMALS`가 현재 **export**돼 있다: `fx.ts:11`).

---

## 2. 이슈 2 — 필요경비·외국세 환율 fallback (UI 측)

### 2.1 현재 UI가 fallback을 어떻게 표현하나 (코드 읽기)

| 항목 | 위치 | 현재 |
|---|---|---|
| 자본적지출 환율 칸 | `ForeignStockExpenseBlock.tsx:58-76` | 금액 >0일 때만 표시(`hasAmount` `:36`). hint = `rateHint()` `:37-39` «…비워두면 양도일 기준환율로 환산합니다.», placeholder `:72` «비우면 양도일 기준환율 적용» |
| 양도비 환율 칸 | 같은 파일 `:90-105`(placeholder `:102`) | 동형 |
| 외국납부세액 환율 칸 | 같은 파일 `:150-161` | `required`, 필드 hint «외국납부세액 납부일 기준 환율 (원/외화). §178의5», placeholder «납부일 기준환율» — **fallback 문구 없음** |
| ⑧ 필요경비 환율 | `stock-transfer-tax-validate-foreign.ts:311-328` | 주석 «비우는 것은 **허용**한다 — 미입력은 엔진에서 양도일 환율로 떨어지므로 차단할 이유가 없다». 넣었는데 ≤0이면만 차단 |
| ⑧ 외국납부세액 환율 | 같은 파일 `:330-362` | 빈 칸·≤0 차단. 메시지 «납세일 기준환율을 입력하세요 (§178의5) — 자동 안분 불가» |
| ④ API 변환 | `stock-transfer-tax-api-foreign-exit.ts:79-85`·`:159-160` | 빈 칸이면 **키를 싣지 않는다**(`parseFloatOrUndef`) — 주석: 0을 실으면 엔진 `??` fallback이 안 걸려 0원이 된다 |
| ⑫ Zod(엔진 파트) | `lib/api/stock-transfer-foreign-schema.ts:111-119`·`:215-221` | 필요경비 환율 `positive().optional()`, 외국세 환율은 `hasForeignTax`일 때 **필수**(`:215`, 주석 «비우면 엔진이 양도일 환율로 대신 썼다 … 2026-09-30») |
| ⑦ 결과 | `ForeignStockResultCard.tsx:208-216` | `…ExchangeRateApplied`(fallback 반영값) echo — 자본적지출·양도비 환율이 같으면 한 줄, 다르면 병기 |
| 사이드바 | `StockSidebar.tsx` | 필요경비 환율 표시 없음(grep 0건) |
| 저장 폼 | `calc-wizard-stock-form.ts:288,290,294` · `normalize.ts:546,548,555` | 세 환율 모두 `""` 기본·`strField`(문자열 보존) |

- **외국납부세액 fallback은 UI·API 경로에서 이미 죽어 있다**(⑧ + Zod 둘 다 필수) — 엔진 `foreign-stock.ts:256`의 `?? transferExchangeRate`는 직접 엔진 호출 경로에서만 닿는다(다종목 `aggregate` 경로가 같은 Zod를 거치는지는 **확인 필요**, V-2).
- **기존 결정 소재**: fallback은 «기존 계산 불변»을 이유로 **의도적 설계**였다 — `__tests__/tax-engine/stock-transfer/foreign-expense-exchange-rate.predo.anchor.test.ts:24,88`(FX-3 «[회귀 방지]»), `e2e/foreign-stock-expense-exchange-rate.spec.ts:123-143`(FXE-3), ⑧ 주석. 반면 이월과세 계획이 신규 축엔 fallback을 **두지 않기로**(Q-4) 했고(`foreign-stock-carryover-97-2.engine.plan.md:118`) 국외 부동산은 «환율은 어떤 fallback도 없다»(`lib/calc/transfer-tax-validate-foreign.ts:5`). memory·docs에서 **사용자가 필요경비 환율 fallback을 별도로 승인/기각한 기록은 찾지 못했다**(`project_foreign_realestate_transfer_plan.md:14`가 «별건»으로만 언급) → **사용자 결정(UQ-3)**.

### 2.2 갈래 A — keep (엔진이 fallback 유지)

UI 변경은 **표시 정직성**만:
- hint·placeholder 유지하되, 결과 카드가 이미 적용 환율을 밝힌다(`:208-216`) → 변경 없음. 사이드바 변경 없음. ⑧ 변경 없음.
- 선택 개선(UQ-3a): hint에 «양도일과 지출일이 다르면 지출일 환율을 입력하세요 — 비우면 양도일 환율로 환산합니다(영 §178의5①은 지출한 날 환율)» 정도로 **fallback이 법정 기준이 아님**을 명시. (현 문구는 fallback을 중립 서술만 한다.)
- 이슈 1(정수 환산)과는 독립. FX-3·FXE-3 불변.

### 2.3 갈래 B — remove (엔진이 fallback 삭제, 금액 입력 시 환율 필수)

| 지점 | 변경 |
|---|---|
| ① 타입·② initial | 없음(`string`, `""`) |
| ③ normalize | **마이그레이션 불필요** — 빈 환율은 «값 없음»으로 정직하다. 복원 후 Step3 «다음»/«결과 보기»에서 ⑧이 막는다. 값을 **채워 넣는 마이그레이션 금지**(자동 fallback 재도입 = 정책 위반). `store` persist에 `version` 키 없음·복원은 `normalizeStockFormData` 한 곳(`stock-resume-entry.ts`·`store` onRehydrate — 이월과세 UI 계획 §1.3 실측과 동일, 이번 트리에서 재확인 필요 V-4) |
| ④ API 변환 | `parseFloatOrUndef` 유지(빈 칸이면 키 미전송 → Zod 필수 위반 400이 아니라 **⑧이 먼저 막는다**). 주석 `:79-85`의 «`?? transferExchangeRate` fallback» 설명 갱신 |
| ⑤ 위젯 | `rateHint()`에서 fallback 문구 삭제 → «…지출한 날의 기준환율 (원/외화) — 영 §178의5①». placeholder 2곳 삭제(`placeholder` 숫자 예시 금지 규칙 — 형식 설명은 hint). 두 FieldCard에 `required` 추가. 선택(UQ-4): 「양도일 환율과 같음」 보조 버튼 — `ForeignDatedAmountRows.rateShortcut`(`:75-78,:176-185`) 전례, **onClick 1회 기록**(effect 미러링 아님, fallback 아님) |
| ⑥ 사이드바 | 없음 |
| ⑦ 결과 | `…ExchangeRateApplied`가 항상 입력값이 되므로 `:208-216` 로직은 유지(두 환율 같을 때 한 줄). 문구 «지출일 기준환율» 그대로 |
| ⑧ validate | `checkExpenseRate`(`:321-328`): `hasAmount(금액) && isEmpty(환율)` → error «자본적지출 지출일 기준환율을 입력하세요 (영 §178의5①)». **UI가 칸을 숨기는 조건(금액 >0, `ForeignStockExpenseBlock.tsx:36`)과 ⑧ 필수 조건이 정확히 같아야 한다**(3중 패턴) — 금액만 있고 칸은 보이는 경로 = 항상 요구, 금액 0이면 칸도 안 보이고 요구도 없음. 이월과세 `foreignCarryoverStepErrors` 호출(`:366`)과 순서 충돌 없음 |
| 외국세 | 이미 필수 — 변경 없음(엔진·Zod의 죽은 `??`만 엔진 파트가 정리) |

- 테스트: `e2e/foreign-stock-expense-exchange-rate.spec.ts` **FXE-3 반전**(`:123-143` — «비우면 양도일 환율로 환산» → 「Step3 다음 차단 + 오류 메시지」), FXE-1/2는 유지. `foreign-wizard-step-layout.anchor.test.tsx`·`foreign-stock-carryover-wiring.anchor.test.ts`가 `validateStep3Foreign`를 호출 — 환율 빈 + 금액 입력 픽스처가 있으면 깨진다(**확인 필요**, V-5). 엔진 FX-3 anchor는 엔진 파트.
- 📌 사용자에게 보일 변화: 양도비·자본적지출을 넣고 환율을 비워 두던 사용자가 이제 막힌다 → 안내 문구가 중요(⑧ 메시지에 «양도일 환율을 쓰려면 직접 입력하세요»).

### 2.4 외국납부세액 환산일 문구 (공통, 어느 갈래든)

- 현재 주식 hint: «외국납부세액 납부일 기준 환율 (원/외화). §178의5»(`ForeignStockExpenseBlock.tsx:152`) · ⑧ 메시지 «(§178의5)»(`validate-foreign.ts:353`) · Zod 메시지 «(소득세법 시행령 §178의5)»(`schema:218`).
- **인용 정정 후보**: 영 §178의5①(현행 MST 290841, 2026-11-28 조회)는 «**양도가액 및 필요경비**를 수령하거나 지출한 날 현재 …»이다 — **외국납부세액**의 환산은 규정 대상이 아니다. 국외 부동산 계획 V-12 해소(2026-11-28)는 외국납부세액 환산일을 **소득세법 시행규칙 §60②**(「납부한 때」)로 확정했다(`lib/tax-engine/legal-codes/transfer-foreign-realestate.ts:67` `RULE_60_2_FTC_FX_RATE` · `lib/calc/transfer-foreign-messages.ts:76` `FOREIGN_TAX_FX_DATE_TEXT`). 주식의 외국납부세액도 같은 §118의6(§118②1호 준용) 체계라 **같은 문구를 쓰는 것이 일관**(UQ-5). 시행규칙 §60②는 이번 세션에서 재조회하지 않았다 → 부동산 계획의 해소 기록에 의존 — **재확인 필요**(V-6).
- 변경(권장): ⑤ hint = `FOREIGN_TAX_FX_DATE_TEXT`(부동산 `ForeignTaxSection.tsx:19,61`·`ForeignResultNotices.tsx:18,72`가 쓰는 그 상수) + 배지 «§178의5» → `RE.RULE_60_2_FTC_FX_RATE`. ⑦ `ForeignStockResultCard.tsx:183` sub 문구에 «납세일» 대신 «납부한 때»(법문 표현). ⑧ 메시지 인용 교체. 상수 파일명이 `transfer-foreign-*`(부동산 전용 이름)라 주식이 import하면 **이름 비대칭** — 이동은 부동산 쪽을 건드리는 별건이므로 이번엔 **직접 import만**(Surgical), 이동은 후속 제안으로 남긴다.
- ⚠️ 미납분(분납·납기 미도래) 문구는 종합소득 해석례(사전-2019-법령해석소득-0283)라 «국외자산 양도 직접 해석례 없음» 단서를 상수가 이미 포함 — 그대로 인용.

---

## 3. 이슈 3 — FS-09 장기할부 (UI 측)

### 3.1 법령 현행 본문 (KoreanLaw MCP 2026-11-28 실독, 소득세법 시행령 MST 290841 · 시행 2026-10-01)

- **영 §178의5②**: 「제1항을 적용함에 있어서 **제162조제1항제3호**의 규정에 의한 장기할부조건의 경우에는 **동호의 규정에 의한 양도일 및 취득일을 양도가액 또는 취득가액을 수령하거나 지출한 날로 본다**.」
- **영 §162①3호**: 「재정경제부령이 정하는 장기할부조건의 경우에는 소유권이전등기(…) 접수일·인도일 또는 사용수익일 중 **빠른 날**」
- 해석: 장기할부면 양도가액의 환산 기준일 = **§162①3호 양도일(세 날 중 빠른 날) 1개**, 취득가액 = 같은 취지의 취득일 1개. 수령일마다 환율을 바꾸지 않는다(문언상). 엔진 주석(`foreign-stock.ts:77-84`)·UI 문구는 «각 수령일의 기준환율»로 서술해 **문언과 다르다**(국외 부동산 계획 V-10). 단 **«재정경제부령이 정하는 장기할부조건»의 요건**(소칙 §78③)은 이번에 조회하지 않았다 → V-7.
- 코드 문서 오기(UI 측): `InstallmentReceiptsMatrix.tsx:5-8` 헤더가 «2026.4.21. 시행 … 「양도일을 수령한 날로 본다」»로 인용 — 현행 본문(위)과 다르다(생략·시행일 표기 불일치). 수정 대상.

### 3.2 현재 UI 지도

| 요소 | 위치 |
|---|---|
| 수령 방식 라디오 | `ForeignStockPriceBlock.tsx:46-86` — `FS_RECEIPT_MODE_OPTIONS`(`foreign-stock-shared.tsx:26-37`): «수령일별 기준환율 개별 적용»; hint `:49-50` «각 수령일의 기준환율 적용 (§178의5②)» |
| 분할 수령 행 | `InstallmentReceiptsMatrix.tsx` 얇은 어댑터 → `ForeignDatedAmountRows`(수령일·수령액·**기준환율 열**·원화 환산·합계 «§178의5② 원화 환산 합계»·`singleRowNotice`) |
| ①②③ | `form-types.ts:609-618`(`fsTransferReceiptMode`·`fsTransferInstallmentReceipts[{receiptDate,amountForeign,exchangeRate}]`) · `form.ts:306-307` · `normalize.ts:570-575,590-605` |
| ④⑬ | `stock-transfer-tax-api-foreign-exit.ts:121-136` — 행별 `exchangeRate` 전송, 단일 양도가액 필드 미전송 |
| ⑧ | `validate-foreign.ts:143-195` — 행 ≥2·행별 날짜/외화액/환율 필수, `:197` 주석 «분할 모드에서는 단일 양도일 환율 검증 생략» |
| ⑦ | `ForeignStockResultCard.tsx:119-146` `transferReceiptDetail` 분기 — «수령일별 기준환율 적용»·행별 «수령액 × 수령일 기준환율» |
| 사이드바 | 분할 모드 전용 표시 **없음**(§1.1) |
| 이력 | 결과 객체에 `transferReceiptDetail`이 저장될 수 있다(IndexedDB resultData — 저장 경로는 **확인 필요**, V-8) |

### 3.3 엔진이 «양도일 1회 환율»로 바꿀 때 — 두 갈래 (UQ-6)

**갈래 A — 모드 폐지(권장)**: 양도일 1회 환율이면 분할 수령 모드는 `total` 모드(총 외화 양도가액 × 양도일 환율)와 **수학적으로 동일**하다. 수령일·행별 환율은 계산에 쓰이지 않는 **죽은 입력**이 된다(사용자가 «이 날짜가 환율에 영향을 주나?»를 오해). 따라서:
- ⑤ 라디오 제거 + 안내 `ToneCard` 1개(법 §178의5② + §162①3호 verbatim, «양도일 = 이전등기 접수일·인도일·사용수익일 중 빠른 날»). `InstallmentReceiptsMatrix.tsx` 삭제 후보(`ForeignDatedAmountRows`는 부동산이 계속 쓴다).
- 양도일 칸(`ForeignStockIdentityBlock` 양도일)의 hint에 «장기할부조건이면 §162①3호의 빠른 날» 추가(V-7 확인 후).
- ①②③: `fsTransferReceiptMode`·`fsTransferInstallmentReceipts` 필드 **deprecate**. ③ normalize에서 **복원 시 변환**: `installments` + 행 있음 → `fgTransferPriceMode = "total"`, `totalTransferPriceForeign = Σ 외화액`(문자열 십진 합 — float 합 금지), `transferExchangeRate`는 **채우지 않는다**(행별 환율 중 하나를 고르는 것 = 자동 선택 fallback). → ⑧이 «양도일 기준환율을 입력하세요»로 막는다. 모드 전환을 알리는 1회 배너는 **새 state 없이** 불가(useEffect 미러링 금지) → 알림은 ⑧ 메시지 문구에 실어 처리(예: «장기할부 분할 수령 입력은 양도일 1회 환율 방식으로 바뀌었습니다 — 총 외화액을 확인하고 양도일 환율을 입력하세요»). ⑧이 «종전 installments 폼 흔적»을 어떻게 아는가 = 필드를 남기면 가능, 지우면 불가 → **정리 PR에서 필드는 남기고 읽기 전용**(V-9).
- ④⑬: `transferInstallmentReceipts` 미전송(엔진 계약 C-3). ⑧: `:143-197` 분기 삭제(single/total 검증만).
- ⑦: 신규 결과는 `transferReceiptDetail` 없음 → `:119-146` 분기는 **이력 결과 렌더용으로만 존속**하거나 삭제(엔진이 결과 타입에서 필드를 남기는지에 따름, C-4). 이력의 옛 결과는 «수령일별 환율» 산식을 그대로 보여주므로 **옛 계산 방식임을 알리는 고지**가 없으면 현행 법해석과 어긋난 값을 정상으로 보인다 → 이력 렌더 시 `ToneCard` 주의 1개(문구는 엔진 결정 후).

**갈래 B — 모드 유지, 환율 열만 제거**: 행 = 수령일·수령액만, 환율은 단일 «양도일 기준환율»(single 칸 재사용). 장점: 입력 연속성. 단점: 수령일이 계산에 안 쓰이는 입력 + `ForeignDatedAmountRows`에 «환율 열 숨김» 옵션 추가(부동산 공용 leaf 변경) → **비권장**.

**갈래 C — 엔진이 현행(수령일별) 유지**: UI 변경 = 문구 정정(§3.1 헤더·라디오 설명) + 이슈 1 helper(`krwOf` 주입)만. 단 이는 **법문과 다른 구현을 고정**하므로 사용자가 «기존 유지»를 명시 결정한 경우에 한한다.

### 3.4 갈래 무관 정리 (소규모)
- `StockSidebar.tsx:199-212`에 `fsTransferReceiptMode !== "installments"` 가드(분할 모드의 stale 단일값 미리보기 방지) — 갈래 A면 모드 자체가 사라져 불필요.
- 14지점 영향(갈래 A): ①②③④⑤⑦⑧ 전부 + ⑥(없음). 테스트: `__tests__/tax-engine/stock-transfer/foreign-stock-fs09-installments.test.ts`(엔진 파트), `__tests__/components/foreign-stock-result-fx-foreign-amount.anchor.test.tsx`(FX-4 총액 모드 — 유지), UI는 신규 `foreign-installment-removal.anchor.test.tsx`(normalize 변환 + ⑧ 메시지 + 라디오 부재) · e2e: 현재 **FS-09 전용 e2e 없음**(grep 0건) → 신규 1건(분할 → 총액 모드 변환 후 양도일 환율 필수 차단).

---

## 4. 이슈 4 — `foreign-options.ts` 리터럴 → 법령 상수

### 4.1 현재 (코드 읽기)
- `components/calc/foreign/foreign-options.ts:27-36`: `label: "세액공제 (§118의6①1호)"`, `label: "필요경비 산입 (§118의6①2호)"` + description.
- **사용처 2곳(전수)**: ① 주식 `ForeignStockExpenseBlock.tsx:23,171`(`options={FOREIGN_TAX_METHOD_OPTIONS}`) ② 부동산 `components/calc/transfer/foreign/foreign-ui-shared.ts:6,57-61`(`FOREIGN_RE_TAX_METHOD_OPTIONS`, description만 «종목»→«자산» replace) → `ForeignTaxSection.tsx`.
- 동명 충돌 주의: `ExitTaxHoldingActualFields.tsx:37`의 `FOREIGN_TAX_METHOD_OPTIONS`는 **다른 상수**(krw/foreign 입력 방식)다 — 건드리지 않는다.
- **소스 가드 테스트 없음**: `__tests__`·`e2e`에서 `"세액공제 (§118의6"`·`FOREIGN_TAX_METHOD_OPTIONS` 라벨 문자열 grep 0건(`transfer-foreign-form-slice.test.ts:8`은 `FOREIGN_TAX_METHOD_DEFAULT`만). 인용 리터럴 가드는 다른 영역에만 있다(`redev-citation-literal-audit`·`sigungu-code-literal-audit`).
- 기존 상수: `TRANSFER_FOREIGN_RE.SECTION_118_6_FOREIGN_TAX = "소득세법 §118의6"`(`transfer-foreign-realestate.ts:29`, 호 단위 없음) · `STOCK_FOREIGN.SECTION_118_6_CREDIT_METHOD = "소득세법 §118②·§118의6 (세액공제)"`(`stock.ts:492` — 주식 다리 조문 서술, 라벨용 부적합). manifest: `TRANSFER_FOREIGN_RE.FOREIGN_TAX_METHODS_AND_LIMIT`(`additions-transfer-foreign-realestate.ts:~29`)와 `TRANSFER.OVERSEAS_FOREIGN_TAX_CREDIT`(`additions-transfer.ts:328`)가 §118의6 본문 키워드를 이미 검증한다(키워드에 «공제한도금액»(1호)·«필요경비에 산입하는 방법»(2호) 포함).

### 4.2 계획 (UQ-7)
- 상수 신설(후보, 엔진/레거시코드 파트와 합의): `TRANSFER_FOREIGN_RE.SECTION_118_6_1_1_CREDIT = "소득세법 §118의6 ①1호"`, `…_1_2_EXPENSE = "소득세법 §118의6 ①2호"` — 부동산 «본체» 묶음에 두는 이유: 두 자산이 공유하는 조문이 §118의6 **본체**(주식은 §118②1호 준용이지만 라벨은 같은 §118의6 호). `STOCK_FOREIGN`에 중복 정의하면 두 단일 소스가 갈라진다.
- 라벨 조립: `foreign-options.ts`가 상수를 import해 `` `세액공제 (${…})` ``. 상수는 «소득세법 » 접두를 포함하므로 라벨이 «세액공제 (소득세법 §118의6 ①1호)»로 **길어지고 띄어쓰기가 바뀐다**(현재 «§118의6①1호»). 접두 제거 헬퍼 vs 풀 표기 → UQ-7b(권장: 풀 표기 — 라디오 카드 폭 여유, 법령명 명시가 CLAUDE 규칙 「인용 = 법령명+조항호」와 일치).
- **manifest**: 이 상수 값이 `verify:legal` 대상이어야 하는가 = 게이트 `__tests__/lib/legal-verification-coverage-complete.test.ts`가 «상수 값 단위»인지 «조문 단위»인지 **확인 필요**(V-10) — 조문 단위면 §118의6이 이미 등록돼 추가 불필요, 상수 단위면 ①1호·①2호 키워드 verbatim 등록(KoreanLaw MCP 본문 대조 후).
- 범위: **`foreign-options.ts` 한 파일만**(이슈 4 문면). 같은 리터럴 계열이 더 있다 — `StockFilingFormTableHelpers.ts:499,518`·`StockAggregateSummaryCard.tsx:236`·`ForeignStockResultCard.tsx:269`·`ForeignTaxCalcSection.tsx:7`(주석) — **언급만**(요청 범위 밖, 후속 일괄 제안 여지).
- 테스트: 라벨 렌더 2곳(주식 `ForeignStockExpenseBlock`·부동산 `ForeignTaxSection`)의 anchor가 상수 값을 본다 — 신규 소형 anchor 1건(라벨 == 상수 조립). 14지점 영향 없음(표시 문자열만, ①~④·⑧ 무관).

---

## 5. 결정 레지스터 — UQ-n (권고 포함)

| UQ | 질문 | 권고 |
|---|---|---|
| UQ-1 | 환산 helper: `tryToKrw`(부동산) vs `toKrwExact`(수량 지원) vs 신규 통합 leaf | **엔진 파트 결정을 따른다**. UI 요구: 단가×수량×환율을 **한 번 절사**하는 client-safe 순수 함수 1개 + `{krw}|{error}` 비throw 변형. `ForeignDatedAmountRows.krwOf`를 필수로 바꿔 누락을 컴파일로 잡는다 |
| UQ-2 | 입력 한도(소수 4자리·1e11·1e7)를 ⑧에 미러할지 / 결과 환율 표시를 4자리로 | **둘 다 예**. ⑧은 엔진 export 상수 import + 주식 parity 테스트. `DecimalInput` 입력 자체 제한은 **하지 않는다**(Surgical — ⑧ 오류로 안내) |
| UQ-3 | 필요경비 환율 fallback keep / remove | **remove 권고**(국외 부동산·이월과세 신규 축·외국세와 일관, 3대 정책 #2). 단 FX-3 «기존 계산 불변» 설계를 **뒤집는 것**이라 사용자 승인 전 착수 금지. keep이면 §2.2 hint 정직화만(UQ-3a 권고 예) |
| UQ-4 | (remove 시) 「양도일 환율과 같음」 보조 버튼 | **예** — onClick 1회 기록(effect 아님), 부동산 `rateShortcut` 전례. 빈 칸은 계속 ⑧이 막는다 |
| UQ-5 | 외국납부세액 환산일 문구 = `FOREIGN_TAX_FX_DATE_TEXT` 공유 + 「§178의5」→ 소칙 §60② | **예**(어느 갈래든 독립 적용 가능). 상수 파일 이동은 후속 |
| UQ-6 | FS-09: 모드 폐지(A) / 환율 열만 제거(B) / 현행 유지(C) | **A 권고**(법문 §3.1 + 죽은 입력 방지). 엔진이 C(유지)면 UI는 문구 정정만. 옛 폼 복원은 총액 모드 변환 + 환율 미채움(⑧ 차단) |
| UQ-7 | 법령 상수 위치(`TRANSFER_FOREIGN_RE` 본체 묶음) · 라벨 풀 표기 · 범위(foreign-options만) | **권고 순서대로 예** |

## 6. 미검증 레지스터 — V-n (「확인 필요」, 추정 금지)

| V | 내용 | 확인 방법 |
|---|---|---|
| V-1 | 주식 경로에서 1원 과소가 나는 **구체 반례**(단가×주수×환율 조합·크기) — 부동산 K-23(400000 × 1300.10)만 실측됨 | 엔진 파트 probe. UI anchor 입력값은 그 결과 채택 |
| V-2 | 다종목(`aggregate`) 경로 `ForeignStockInput`이 같은 Zod(`stock-transfer-foreign-schema.ts:215` 외국세 환율 필수)를 거치는지 — 아니면 외국세 환율 fallback이 aggregate에서 **살아 있다** | `app/api/calc/stock-transfer/route.ts` items 경로 코드 읽기 + 요청 실행 |
| V-3 | 결과 echo `transferPriceForeign = perShare × shareCount`(`foreign-stock.ts:205`)가 부동소수라 결과 카드 «외화 × 환율 = 원화» 외화 칸이 `0.30000000000000004`류로 나오는지(`fx-formula.ts`는 소수 4자리 `maximumFractionDigits`라 가려짐) | 엔진 probe + 카드 렌더 anchor |
| V-4 | 저장 폼 복원 경로가 `normalizeStockFormData` 단일인지(이월과세 UI 계획 §1.3 실측이 다른 트리) — `calc-wizard-stock-store.ts` persist `version` 유무 | 이 트리에서 재확인 |
| V-5 | `foreign-wizard-step-layout.anchor.test.tsx`·`foreign-stock-carryover-wiring.anchor.test.ts` 픽스처에 «금액 있음 + 환율 빈 칸»이 있는지(remove 시 깨짐) | 코드 읽기 + remove 가정 dry-run |
| V-6 | 소득세법 시행규칙 §60②·①(외국납부세액 «납부한 때»·양도소득 명시) — 부동산 계획 V-12 기록에 의존, 이번 세션 미재조회 | KoreanLaw MCP 재조회 |
| V-7 | «재정경제부령이 정하는 장기할부조건»(소칙 §78③) 요건(2년·2회 이상 등) · 장기할부 «취득일»의 §162①3호 적용 · 양도일 칸 hint 문구 | KoreanLaw MCP 본문 |
| V-8 | `transferReceiptDetail`이 IndexedDB 이력 resultData에 실제로 저장·재표시되는 경로 | `lib/storage` + `StockTransferTaxResultView` 읽기 |
| V-9 | 갈래 A의 deprecate 필드를 남기고 ⑧이 흔적을 읽는 설계가 `normalize` idempotency·다종목 savedItems에 안전한지 | 구현 PR 전 probe |
| V-10 | 법령 상수 신설 시 `legal-verification-coverage-complete` 게이트의 등록 단위 | 게이트 코드 읽기 후 `npm run verify:legal` |

## 7. 엔진 파트에 요구하는 계약

- C-1 환산 leaf(UQ-1) — 이름·시그니처·한도 상수(`FX_MAX_DECIMALS`·금액·환율 상한) **export**, client import 가능(서버 전용 의존 0).
- C-2 이슈 2 결정 반영: 갈래 B면 엔진 `?? transferExchangeRate` 삭제 + Zod에서 `capitalExpenditureForeign > 0 ⇒ …ExchangeRate` 필수 refine(⑧과 **같은 조건** — 3중 패턴) + 에러 코드/메시지 문구를 UI와 공유.
- C-3 이슈 3: 엔진 입력에서 `transferInstallmentReceipts` 유지/삭제 여부 · `transferReceiptMode` 처리(옛 클라이언트 요청 호환) · 새 환산 기준일 echo(`transferExchangeRate` 단일).
- C-4 결과 타입에서 `transferReceiptDetail` 존속 여부(이력 렌더).
- C-5 Zod 메시지의 «§178의5» 외국세 인용(`schema:218`) 정정 여부(UQ-5와 연동).

## 8. UI PR 분할 (엔진 PR 이후, 소형·순차)

| UI PR | 내용 | 선행 | 14지점 |
|---|---|---|---|
| UI-0 | **이슈 4 단독**(상수 2개 + `foreign-options.ts` 조립 + anchor 1건). 엔진 무관 — 먼저 가능 | 없음(상수 위치만 엔진 파트와 합의) | 표시 문자열만 |
| UI-1 | 이슈 1: U-1~U-6 helper 치환 + `krwOf` 필수화 + 환율 표시 4자리(§1.3) + ⑧ 한도 미러 + parity·anchor 신규 | 엔진 PR-A(환산 leaf) | ⑤⑥⑦⑧ |
| UI-2 | 이슈 2 + UQ-5: (remove면) hint·placeholder·`required`·⑧ 필수·E2E FXE-3 반전·(UQ-4 버튼) / (keep이면) hint 정직화. 외국납부세액 환산일 문구·인용 | 엔진 PR-B + **사용자 UQ-3 결정** | ⑤⑦⑧ (③ 불필요) |
| UI-3 | 이슈 3: (A) 모드 폐지·normalize 변환·⑧/④ 분기 삭제·안내 카드·이력 고지·E2E 신규 | 엔진 PR-C(양도일 1회 환율) + 사용자 UQ-6 | ①②③④⑤⑦⑧ |

- 각 PR 완료 보고 전: `npx tsc --noEmit` · `npx vitest run __tests__/tax-engine/stock-transfer/ __tests__/calc/ __tests__/components/` · 브라우저 수동(Network 탭 request body: 환율 키 유무·`transferInstallmentReceipts` 미전송) · `ui-engine-sync-checker`. **미수행 시 명시**. E2E(`e2e/foreign-stock-*.spec.ts`)는 CI에서만 돈다.
- 파일 크기: `StockSidebar.tsx` 392·`ForeignStockPriceBlock.tsx` 272·`validate-foreign.ts` 369·`normalize.ts` 695(UI-3에서 +변환 로직 시 700 근접 — 변환은 별도 leaf로 분리, 750 위험구간 기회주의 분리 규칙).
- 자가 점검(3대 정책): useEffect 미러링 0(보조 버튼·모드 변환은 onClick/normalize) · 자동 안분 fallback 0(복원 시 환율 미채움) · ⑧↔UI↔API 동일 조건(§2.3 ⑧ 행).
