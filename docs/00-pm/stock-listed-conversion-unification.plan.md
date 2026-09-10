# 주식양도세 — 상장 환산취득가 «분모 공통화 + 분자 단일 축» 통합 계획서

> **출처**: 제보(2026-09-10) — 「취득 후 상장이라도 양도 당시 1주당 기준시가는 공통적으로
> 필요하고 단지 취득가액을 환산하느냐 자동조회하느냐 구분 문제인데, 이 프로젝트는
> 취득 후 상장을 처음부터 다시 계산하는 구조로 되어 있어 코드 중복이 있는 것 같다.」
>
> **작성**: 2026-09-10 · **검증 깊이 L3**(여러 파일 · 상태 모델 · **세액 변동 있음**)
> **상태**: 착수 전. §1~§4는 **전부 실측 완료**(뮤테이션 4회 포함). **V-1·V-3 종결**(§6-1·6-2).
> 잔여 미결 **V-4 · Q-2**(둘 다 S1 전제 아님). §5의 S3은 S2 산출물이 나온 뒤 별도 설계서로 확장한다.
>
> **자가검토 1회차 완료**(2026-09-10, `plan-design-self-review-loop`) — 인용 46건/65줄 기계 검증,
> 불일치 8건 정정 · 판정 뒤집힘 1건(마이그레이션 위치) · 누락 4건(14지점 표·상호배타 UI·불가 조합 2행)
> · 재검토(blast-radius)가 **정정이 새로 만든 오류 1건**을 추가 발견 · 검토 중 **V-2·V-5 종결**.

---

## 0. 요청과 범위

제보의 진단은 옳다. 다만 **중복이 세 층으로 갈리고**, 그 셋의 비용·위험이 서로 다르다.
이 계획서는 그 셋을 분리해 **가장 싼 것부터, UI를 한 번만 고치는 경로**를 정한다.

- **범위 안**: 상장 환산취득가(`acquisitionMode === "estimated"` × 상장) 경로의
  분모(양도 당시 기준시가) 공통화 · 분자 산정 방식 단일 축화 · 산식 중복 제거 ·
  분모 미입력 방어 동작 통일.
- **범위 밖**: 비상장 보충 평가(§165④) 자체의 산식 · 기타자산 · 국외주식 ·
  부담부증여 §159 안분 로직.
- **명시적 비목표**: 엔진 `StockTransferInput`의 boolean 3개를 enum으로 바꾸는 것.
  §2에서 **비용/편익이 뒤집혀 있음을 실측**했다. 기각 근거를 §3-2에 남긴다.

---

## 1. 현행 구조 실측 — 중복은 «세 층»이다

### 1-1. 필드는 중복이 아니다

양도 당시 기준시가는 `transferDatePriceAvg1Month` **하나**다
(`lib/stores/calc-wizard-stock-form.ts:146`). 두 화면이 같은 필드를 쓴다 — 상태 이중화 없음.

### 1-2. ① 입력 UI가 두 곳이다 (상호배타 렌더)

| | 렌더 위치 | 렌더 조건 | 입력 수단 |
|---|---|---|---|
| 일반 환산 블록 | `app/calc/stock-transfer-tax/steps/Step2.tsx:422` | `Step2.tsx:396` — `!tradingHaltAtTransfer && !acquiredBeforeListing` | 직접 입력 + 키움 자동조회 |
| 「취득 후 상장」 ③ | `components/calc/stock-transfer/PostListingValuationCard.tsx:416` | `Step2.tsx:469` — ToggleCard children | 직접 입력 + **일자별 32셀 표** + 키움 자동조회 |

두 블록이 **상호배타**라, 토글을 켜면 위 칸이 통째로 사라지고 아래에 같은 칸이 **다시**
나타난다. 제보의 「처음부터 다시 계산하는 구조」가 가리키는 실체가 이것이다.

### 1-3. ② 기능 비대칭 — 같은 값인데 한쪽만 일자별 입력이 된다

`TransferDate1MonthClosingPriceTable`(32셀 표)의 사용처는 **`PostListingValuationCard.tsx:449`
한 곳뿐**이다. 일반 §176의2②1호 경로 사용자는 1개월 평균을 손으로 계산하거나 키움에
의존해야 한다 — 같은 법조문의 같은 값인데 입력 수단이 갈린다.

> 📌 이 비대칭은 이미 한 번 부분적으로 해소됐다 — 키움 버튼은 2026-09-02에 게이트 **밖**으로
> 꺼냈다(`Step2.tsx:402-412` 주석 · 버튼 `:413-419` + `__tests__/components/stock-listed-conversion-autofetch-gate.anchor.test.tsx`).
> 그때 **표는 함께 꺼내지 않았다.** 이 계획서는 그 나머지를 마저 처리한다.

### 1-4. ③ 산식이 두 곳에 각각 구현돼 있다

```
lib/tax-engine/stock-transfer/stock-valuation-listed.ts:101-103
  Math.floor(safeMultiply(transferPrice, acqStd) / transferStd)

lib/tax-engine/stock-transfer/apply-163-9-conversion.ts:44
  Math.floor(safeMultiply(transferPrice, acqStdPerShare) / transferStd)
```

같은 시행령 §176의2②1호, 같은 floor 정책, 같은 `safeMultiply` 안전망 — **별개 함수**다.

### 1-5. 구조를 다시 그리면 — 분모 1개 + 분자 4갈래

```
환산취득가 = 양도가 × ( 취득 당시 기준시가 ÷ 양도 당시 기준시가 )
                        └── 4갈래 ──┘        └── 공통 (예외 1건) ──┘
```

| 분자 산정 | 현재 표현 | 분모는? |
|---|---|---|
| 취득일 이전 1개월 종가평균 | (토글 없음 — 기본 경로) | 공통 |
| 취득일 거래정지 → 보충 평가 (§165③) | `tradingHaltAtAcquisition` | 공통 |
| 취득 후 상장 → §165⑤ 환산 | `acquiredBeforeListing` | 공통 |
| **양도일** 거래정지 (§165③) | `tradingHaltAtTransfer` | **분모도 보충 평가로 대체** ← 유일한 예외 |

4갈래가 **boolean 3개의 조합**으로 표현되고, 각 블록이 분모를 **각자 다시 선언**한다.
불가능한 조합(양도정지 + 취득후상장)은 타입이 아니라 **런타임 게이트 2겹**으로 막고 있다
(⑧ G-5 `lib/calc/stock-transfer-tax-validate-step2.ts:359` + ⑫ `lib/api/stock-transfer-tax-schema.ts:419`.
취득일 정지 짝은 ⑧ `:367` + ⑫ `:429`).
엔진도 그 전제에 의존한다(`stock-acquisition-basis.ts:128` 위 `[C-3]` 주석).

---

## 2. 비용 동인 실측 — 「엔진까지 enum화」는 수정 68곳 : 이득 2곳이다

### 2-1. 참조 수 (2026-09-10 실측)

| 필드 | 소스(`lib`+`components`+`app`) | 테스트(`__tests__`+`e2e`) |
|---|---|---|
| `acquiredBeforeListing` | 20파일 / 48참조 | **75파일 / 119참조** |
| `tradingHaltAtTransfer` | 14파일 / 34참조 | 61파일 / 89참조 |
| `tradingHaltAtAcquisition` | 10파일 / 20참조 | 10파일 / 19참조 |

`acquiredBeforeListing` 테스트 75파일의 분포:

```
56  __tests__/tax-engine/stock-transfer     ← 엔진 테스트 (직접 세팅 68회)
 8  __tests__/components/calc/stock-transfer
 5  __tests__/components
 5  __tests__/calc
 1  __tests__/calc/stock-transfer
```

엔진 테스트를 감싸는 input 빌더 헬퍼는 **없다** — 전부 인라인 리터럴이다
(`__tests__/tax-engine/stock-transfer/helpers/`에 `acquiredBeforeListing:` 세팅 0건).

### 2-2. 그런데 엔진이 «분기 판단»에 읽는 지점은 2곳뿐이다

```
lib/tax-engine/stock-transfer/stock-acquisition-basis.ts:128        if (input.acquiredBeforeListing) {
lib/tax-engine/stock-transfer/exempt-informational-acquisition.ts:105  if (input.acquiredBeforeListing) {
```

나머지 참조는 전부 **결과 에코**(`stock-transfer-tax.ts:553`,
`stock-transfer-exempt-result.ts:151`)이거나 **어댑터 전달**
(`post-listing-flat-adapter.ts:353-419`, `foreign-stock-aggregate-adapter.ts:127`)이다.

⇒ **엔진 input에서 boolean을 빼면 68곳을 손으로 고치는데, 얻는 것은 분기 2곳의 표현 변경뿐이다.**
그 68곳은 기계적 수정이지만 「한 항목이 여러 대상을 함께 단언하면 반전이 형제 안전망을
지운다」(memory)가 그대로 적용되는 대량 편집이라, 위험 대비 이득이 없다.

---

## 3. 목적지 재정의 — C의 경계를 «엔진»이 아니라 «폼 ↔ API 변환»에 둔다

### 3-1. 설계

```
폼 상태 (①②③⑧ + UI)
    acquisitionStdMode : "monthly_avg" | "halt_supplementary" | "post_listing"
    transferStdHalt    : boolean                      ← 유일한 «편집» 지점
        │
        ④ lib/calc/stock-transfer-tax-api.ts          enum → boolean 3개로 펼침
        │
        ⑫ lib/api/stock-transfer-tax-schema.ts        boolean 수신 + superRefine으로 불가능 조합 거부
        │
   엔진 StockTransferInput                            boolean 3개 유지 — 법령 요건 플래그
                                                      ← 엔진·56 테스트 무변경
```

**이것도 C다.** 목표였던 「불가능한 조합 배제」를 타입 대신 **스키마 `superRefine`**로
달성하고, 값은 **하나의 enum에서만 편집**되므로 이중 진실이 아니다 — boolean은 파생
전송값이다.

관용도 이미 있다: `unlistedDetailMode`(3지 enum)를 `post-listing-flat-adapter.ts`가 하위
필드로 펼치는 구조가 **정확히 같은 형태**다.

### 3-2. 기각 — 「엔진 input까지 enum」

§2-2의 68 : 2 비율이 근거다. 나중에 다시 제안될 것이므로 여기에 못박는다.
**되살리려면 먼저 엔진 테스트용 input 빌더를 도입해 68곳을 1곳으로 줄인 뒤**에 논해야 한다.

---

## 4. 결정 사항 — 분모 미입력 방어의 정본

### Q-1 ✅ **결정: 차단(취득가 0 + warning)** — 사용자 결정(2026-09-10)

두 경로가 갈려 있었다:

| 경로 | 현재 동작 |
|---|---|
| 일반 (`stock-valuation-listed.ts:74`) | `?? 0` → 0-가드 → **취득가·개산공제 둘 다 0** + warning |
| §165⑤ (`apply-163-9-conversion.ts:60-67` `resolveTransferStd`) | 1주당 양도가로 fallback → **환산 미적용**(취득기준시가 × 주식수) + warning |

CLAUDE.md 「자동 안분 fallback 금지」와 일관되는 **차단** 쪽으로 통일한다.

### 4-1. 이 결정이 실제로 무엇을 바꾸는가 — 뮤테이션 2회로 실측

**probe 1** — `resolveTransferStd`의 fallback 분기 제거 후
`__tests__/tax-engine/stock-transfer/` + `__tests__/calc/` + `__tests__/components/` 전건:

```
Test Files  1 failed | 696 passed (697)
Tests       1 failed | 6413 passed (6414)
FAIL  filing-form-conversion-rows.anchor.test.ts > A-3-4: 분모 자동 대체 시 그 사실을 라벨에 병기한다
```

> 🔴 **첫 측정은 틀렸다.** `__tests__/components/`를 빼고 돌려 「0건 실패」가 나왔고,
> 그대로 「무해」로 결론 낼 뻔했다. 범위를 넓히자 A-3-4가 드러났다.
> **뮤테이션의 실행 범위가 결론의 분모다** — 좁히면 안전해 보인다.

**probe 2** — 같은 분기에 `throw`를 심어 **도달 여부**를 계측:

```
3 tests reach the branch:
  post-listing-163-9-conversion.test.ts   PL-3
  route-split-mode.anchor.test.ts         LO-PRE-3
  filing-form-conversion-rows.anchor.test.ts  A-3-4
```

⇒ 도달은 3건인데 probe 1에서 깨진 것은 1건. **PL-3·LO-PRE-3은 그 분기를 지나면서도
구별하지 못한다.**

### 4-2. PL-3의 구별력이 0인 이유 — 픽스처가 나누어떨어진다

`post-listing-163-9-conversion.test.ts:105-111` (`PL-3: transferStd 미입력 → fallback (기존 동작)`)은
이름에 fallback을 달고 있는데 fallback을 없애도 통과한다.

- fallback 값 = `floor(양도가 × acqStd / floor(양도가 ÷ 주식수))`
- 차단 시 값 = `apply163_9Conversion`의 `fallbackTotal`
  = `postListingResult.totalAcquisitionPrice`
  = `finalPerShareValue × shareCount` (`stock-valuation-post-listing.ts:560`)

**주식수가 양도가를 나누어떨어뜨리면 둘이 같아진다.** PL-3 픽스처가 정확히 그 경우다
(44,750,000 ÷ 5,000 = 8,950, 나머지 0).

실측 (node 직접 계산, `acqStd = 5,824`):

| 양도가 | 주식수 | fallback(현행) | 차단(환산 미적용) | 차이 |
|---:|---:|---:|---:|---:|
| 44,750,000 | 5,000 | 29,120,000 | 29,120,000 | **0** ← PL-3 픽스처 |
| 44,753,000 | 5,000 | 29,121,952 | 29,120,000 | **+1,952** |
| 100,000,007 | 3 | 17,472 | 17,472 | 0 |
| 37,500,000 | 1,234 | 7,187,047 | 7,186,816 | **+231** |

⇒ **이 결정은 「무해」가 아니다.** 나누어떨어지지 않는 경우 취득가가 수천 원 달라진다
(fallback 쪽이 **항상 크거나 같다** — `floor(양도가÷주식수) ≤ 양도가÷주식수`라 더 작은 수로
나누게 되어 몫이 커진다). 다만 아래 4-3 때문에 **정상 사용자는 이 분기에 닿지 않는다**.

### 4-3. 도달 가능성 — ⑧은 이미 막고, ⑫만 한 칸 느슨하다

| 층 | 일반 경로 분모 | §165⑤ 경로 분모 |
|---|---|---|
| ⑧ validate (`stock-transfer-tax-validate-step2.ts:296-332`) | 필수 | **필수** (direct/daily 축 분기까지) |
| ⑫ Zod (분모 refine `stock-transfer-tax-schema.ts:457-467`) | 필수 | 🔴 **면제** |

⑫의 면제는 의도된 것이고 그 근거가 `stock-transfer-tax-schema.ts:447-451`에 적혀 있다 —
「§165⑤ 분기는 `resolveTransferStd`가 fallback하는 **설계된 동작**이라, 여기서 막으면 엔진이
정상 처리하는 payload를 400으로 돌린다」.

**차단으로 정본을 바꾸면 그 근거가 소멸하므로 ⑫도 함께 좁혀야 한다.** 좁혀도 dead-end가
아니다 — 입력 경로가 ⑤에 실재한다(`PostListingValuationCard.tsx:399·416`, 직접/일자별 두 축).

부담부증여 §159 경로는 **영향 없음**을 확인했다 — `lib/calc/gift-burdened-transfer-api.ts:478`이
`acquiredBeforeListing: false`를 **고정**하므로 §165⑤ 분기에 애초에 진입하지 않는다.
(그 파일의 분모 전송은 `:563`이며 일반 경로용이다.)

### 4-4. 이 결정이 고아로 만드는 것

`conversionUsedFallback`이 영구히 `false`가 되므로 아래 둘이 dead code가 된다:

- `components/calc/stock-transfer/StockFilingFormTableHelpers.ts:354-356` — 신고서 12-2행 라벨의
  「(미입력 · 1주당 양도가액으로 대체)」 병기
- `components/calc/results/PostListingDetailCard.tsx:207` — 결과뷰 대체 안내

anchor `A-3-4`는 **폐기가 아니라 이관**한다 — 지킬 성질이 「대체 사실을 병기한다」에서
「⑫가 미입력을 거부한다」로 바뀐다.

### Q-2 ⏳ **미결 — S3 착수 시 결정**: 불가 조합 A의 UI 표현

「양도일 거래정지」와 「분자 = 취득 후 상장」을 사용자가 동시에 고르지 못하게 하는 방식.
§5 S3의 세 안(disabled · 숨김 · 축 통합) 중 택일한다. **작업량은 셋이 비슷하고 UX가 갈린다** —
3안(축 통합)은 조합 자체를 소멸시키지만 「분모/분자」 2블록 구조가 흐려진다.

---

## 5. 단계 — UI를 «한 번만» 고친다

A(분모만 공통화) → B(분자 라디오) → C를 각각 배포하면 **UI를 3번, anchor·E2E를 3번** 고친다.
A·B의 산출물은 전부 C에 흡수되므로 **배포 단위로 쪼개지 않는다.**

| | A→B→C 순차 배포 | 아래 경로 |
|---|---|---|
| UI 재작성 | 3회 | **1회** |
| anchor·E2E 갱신 | 3회 | **1회** |
| 엔진 테스트 68곳 | 수정 | **무변경** |

### S0 — 셀렉터 방탄화 (UI 무변경 · 독립 머지 가능)

E2E·anchor가 이 영역을 **라벨 문자열**로 잡는 지점을 `name`/`data-testid` 축으로 이관한다.
S3에서 라벨·구조가 바뀌어도 안 깨지게 만들어 S3의 diff를 줄인다.

알려진 라벨 의존(실측):
- `e2e/stock-transfer-halt-acquisition.spec.ts:80,95`
- `e2e/stock-listed-conversion-kiwoom-autofetch.spec.ts:92,107,134,173,193`
- `e2e/stock-transfer-97-2-swap.spec.ts:60`

> ⚠️ 「셀렉터 축은 네 형태다 — 리터럴·상수 간접·accessible name·정규식 이스케이프」
> (memory `feedback_selector_axis_has_three_forms`). S0 착수 시 네 형태를 **전수**로 훑는다.
> 위 목록은 리터럴 형태만 센 것이므로 **하한**이다.

**수용 기준**: 프로덕션 코드 변경 0줄. E2E 전건 통과.

### S1 — 산식 1곳으로 + Q-1 정본 적용 (UI 무변경) ✅ **완료 2026-09-10**

1. `calcListedValuation`이 `apply163_9Conversion`을 쓰도록 교체
   (`stock-valuation-listed.ts:101-103` → 헬퍼 호출). 두 경로의 floor·`safeMultiply` 정책 동일 확인.
   > ⚠️ **효과 범위를 과장하지 말 것** — 헬퍼가 담당하는 것은 **곱셈 한 줄**이다.
   > `conversionRatio`·`perShareAcquisitionPrice`·`stdPriceTotalForEstimatedDeduction`·
   > 0-가드(`:77-96`)·warning 3종은 헬퍼에 없고 `calcListedValuation`에 남는다.
   > 이 단계의 값은 「중복 제거」보다 **「두 경로가 같은 함수를 지난다」는 계약**에 있다.
2. `resolveTransferStd`의 fallback 분기 제거 → 0 반환. 호출부 2곳
   (`stock-acquisition-basis.ts:139`, `exempt-informational-acquisition.ts:110`)에서
   일반 경로와 **같은 문구**의 warning을 남긴다.
3. `apply163_9Conversion` 호출부의 `fallbackTotal` 인자를 0으로 — 「환산 미적용」이 아니라
   **차단**이 되게 한다. (§4-2 표의 「차단」열은 현행 `fallbackTotal`을 쓴 값이므로,
   이 3번을 하면 그 열이 **0**이 된다. S2 회귀표는 3번 적용 **후** 값으로 잡는다.)
4. ⑫ Zod의 §165⑤ 분모 면제 제거(`stock-transfer-tax-schema.ts:459` 조건에서
   `!data.acquiredBeforeListing` 삭제) + `:438-452` 주석 블록을 새 근거로 교체.
5. §4-4의 dead code 2곳 제거, `A-3-4` 이관.
6. **`route-split-mode.anchor.test.ts` LO-PRE-3 픽스처에 `transferDatePriceAvg1Month` 추가**
   (§6-3 — 4를 넣으면 그 payload가 400이 된다. 목적이 §81④ 전파라 분모 추가가 의도를 해치지 않는다).

> 🔴 **2·3·4는 쪼개지 않는다** — §6-2 참조. 4(⑫ 면제 제거)를 뒤로 미루면 그 사이
> 「비과세 + §165⑤ + 분모 미입력」 payload가 통과해 **비과세 화면의 취득가가 조용히 0**이 된다.
> ⑧이 UI를 막고 있어 증상이 드러나지 않으므로 더 위험하다.
> 🔑 신규 anchor는 `BG-ENG-1~3`(`gift-burdened-stock-major-and-conversion.anchor.test.ts:375-395`)을
> 템플릿으로 쓴다 — §165⑤ 쪽에 같은 형태로 3건(양성 2 + 대조군 1).

**수용 기준 — 실측 결과**

| 기준 | 결과 |
|---|---|
| `npm test` 전건 | **1,956파일 20,535건 통과** |
| `npx tsc --noEmit` · eslint(변경 10파일) | 0건 |
| E2E 주식 25 spec + 부담부증여 4 spec | **80건 전건 통과** |
| 신규 anchor | `post-listing-denominator-blocked` 5건 + `post-listing-conversion-parity` 3건 |

**Pre-Do anchor가 먼저 잡은 것** — 구현 전에 돌린 초판 anchor가 **작성자 픽스처의 결함**을 먼저
드러냈다(존재하지 않는 필드명 `totalTransferPrice` · 스키마 필수 필드 누락으로 대조군까지 0).
검증된 픽스처(`post-listing-163-9-conversion.test.ts` `baseInput`)를 재사용해 고친 뒤에야
anchor가 **의도한 사유로만** 실패했다 — PLD-1이 낸 `29,121,952`는 §4-2 표의 그 값과 일치한다.

**구현 후 뮤테이션 — anchor마다 «정확히 그것만» 실패**

| P-n | 무력화 대상 | 실패한 anchor |
|---|---|---|
| P-1 | `resolveTransferStd` fallback 부활 | PLD-1 · PL-3 · A-3-4 (정본 축 전체) |
| P-2 | ⑫ 면제 복원 | **PLD-3만** |
| P-3 | 신고서 「대체」 병기 부활 | **A-3-4만** |
| P-4 | 일반 경로 floor 시점 변경 | **PAR-1만** |

> 🔴 **P-1 복원에 `git checkout --`를 써서 커밋 전 편집이 날아갔다**(memory
> `feedback_mutation_probe_git_checkout_destroys_wip`가 경고한 그대로). 재적용 후 나머지
> 뮤테이션은 파일 백업(`cp`)으로 돌렸다. **커밋 전 뮤테이션에 그 명령을 쓰지 말 것.**

**이관·보강한 기존 테스트 3건**
- `PL-3` — 「fallback (기존 동작)」 → 「취득가액 0 + 사유 경고」로 정본 전환
- `A-3-4` — 「대체 사실을 병기한다」 → 「대체하지 **않는다**」로 성질 반전
- `LO-PRE-3` — 분모 `8,950` 추가(종전 fallback이 쓰던 값과 같게 잡아 §81④ 단언을 흔들지 않음)

**부수 정리** — `conversionUsedFallback`이 영구 false가 되므로 타입 필드와 소비처 2곳
(`StockFilingFormTableHelpers.ts` · `PostListingDetailCard.tsx`)을 함께 걷었다.
`stock-valuation-listed.ts`의 거래정지 조기반환은 **기존** dead code라 §6-1대로 손대지 않았다.

### S2 — 안전망 측정 (프로덕션 무변경) ✅ **완료 2026-09-10**

4갈래 × 분모 조합의 **현재 결과**를 회귀표 anchor로 고정한다. S3의 수용 기준이 된다.

| # | 분자 | 분모 | 고정할 값 |
|---|---|---|---|
| 1 | 취득일 1개월 종가평균 | 종가평균 | `acquisitionPrice` · `expenses`(개산공제) · `calculatedTax` |
| 2 | 취득일 거래정지 → 보충 평가 | 종가평균 | 〃 |
| 3 | 취득 후 상장 §165⑤ | 종가평균 | 〃 + `postListingDetail.finalPerShareValue` |
| 4 | (분자·분모 모두) 양도일 거래정지 | 보충 평가 | 〃 |
| 5 | **불가 조합 A** — 취득 후 상장 × **양도일** 거래정지 | — | ⑧ G-5(`stock-transfer-tax-validate-step2.ts:359`) 차단 · ⑫ `stock-transfer-tax-schema.ts:419` 400 |
| 6 | **불가 조합 B** — 취득 후 상장 × **취득일** 거래정지 | — | ⑧ `stock-transfer-tax-validate-step2.ts:367` 차단 · ⑫ `stock-transfer-tax-schema.ts:429` 400 |

> 「바꾸기 전에 안전망을 잰다」(memory `feedback_pre_change_safety_net_probe`).
> S2 없이 S3를 하면 「바뀐 것이 UI인지 계산인지」를 가를 수단이 없다.

**수용 기준 — 실측 결과**

`__tests__/calc/stock-conversion-branch-matrix.anchor.test.ts` — **10건**.
프로덕션 코드 변경 **0줄**(계획대로).

네 행이 **같은 base**(양도가 44,753,000 · 주식수 1,000 · 분모 10,000)를 쓴다.
양도가는 주식수로 나누어떨어지지 않게 잡았다 — §4-2의 그 함정과 같은 이유다.

| 행 | 분자 산정 | acquisitionPrice | estimatedBase | expenses | calculatedTax | method |
|---|---|---:|---:|---:|---:|---|
| R1 | 취득일 1개월 종가평균 (입력 5,600) | 25,061,680 | 5,600,000 | 56,000 | 3,427,060 | `monthly_avg_listed` |
| R2 | 취득일 거래정지 → 보충 평가 (산출 5,600) | 25,061,680 | 5,600,000 | 56,000 | 3,427,060 | `halt_acquisition_conversion` |
| R3 | 취득 후 상장 §165⑤ (산출 5,824) | 26,064,147 | 5,824,000 | 58,240 | 3,226,120 | `post_listing_conversion` |
| R4 | **분모까지** 보충 평가 (양도일 정지) | 23,205,259 | 5,600,000 | 56,000 | 3,798,340 | `weighted_avg` |

> R1·R2는 **분자를 같게 맞춰** 세액이 같다 — 「경로가 달라도 분자가 같으면 결과가 같다」를
> 보이려는 것이다. 그래서 `method`를 함께 못박아 두 행이 뒤바뀌는 것도 잡고,
> 대조군 `MTX-R0`이 「원래 다 같은 값 아닌가」라는 오독을 막는다.

**불가 조합 2건은 값이 아니라 «차단»을 고정한다** — `MTX-XA/XA'`(⑧·⑫) · `MTX-XB/XB'`(⑧·⑫)
+ 대조군 `MTX-X0`(조합이 없으면 둘 다 통과).

**뮤테이션 5회 — 각 행이 정확히 자기 것만 지킨다**

| M-n | 무력화 | 깨진 행 |
|---|---|---|
| M-ALL | 개산공제율 1% → 2% (`STOCK_ESTIMATED_EXPENSE_RATE`) | **R1·R2·R3·R4 전부** |
| M-R3 | §165⑤ 1주당 취득기준시가 산출에 ×1.1 | **R3만** |
| M-R4 | 양도정지 분기를 if-체인에서 비활성화 | **R4만** |
| M-XA | ⑧의 양도정지×취득후상장 차단 제거 | **MTX-XA만** |
| M-XB | ⑫의 취득정지×취득후상장 차단 제거 | **MTX-XB'만** |

### 6-4. S2가 부수적으로 드러낸 것 2건

**① `postListingDetail.totalAcquisitionPrice`가 S1 이후 «소비처 0»이 됐다.**

종전에는 `apply163_9Conversion`의 `fallbackTotal` 인자로 쓰였는데(그 fallback 경로가 유일한
소비처였다), S1이 그 인자를 0으로 바꾸면서 읽는 곳이 사라졌다. 실측 — 뮤테이션으로 그 값을
2배로 바꿔도 회귀표가 **전건 통과**했고, `components/`에서 이 필드를 읽는 곳은 없다
(`LotMatchingDetailCard.tsx:116`의 동명 필드는 **다른 타입**이다).

⇒ **제거하지 않는다.** 값 자체는 「환산 전 취득기준시가 총액」으로 여전히 옳고
(`estimatedBase`와 같은 뜻), 진단용 echo로 남긴다. 다만 **anchor로 지킬 수 없는 필드**임을
알고 있어야 한다 — S3에서 result 형태를 손볼 때 정리 후보다.

**② `valuationDetail.finalPerShareValue`의 «의미»가 경로마다 다르다.**

| 경로 | 값 | 의미 |
|---|---|---|
| R1 일반 | 25,061 | **환산 후** 1주당 취득가 (`stock-acquisition-basis.ts:309` Bug-A 정정분) |
| R2·R3·R4 | 5,600 · 5,824 · 5,600 | 1주당 **취득기준시가** |

현재 오표시는 **없다** — 화면의 「1주당 취득기준시가 =」 문구가
`StockTransferTaxResultViewHelpers.tsx:83`에서 `method === "post_listing_conversion"`으로
게이팅돼 있어, 의미가 맞는 경로에서만 렌더된다.

⇒ 그러나 **S3에서 경로를 하나로 합칠 때 이 분기를 모르고 통일하면 화면이 조용히 틀려진다.**
회귀표가 `method`와 `finalPerShareValue`를 **함께** 고정하는 이유가 이것이다.

### S3 — 본체 (한 PR · S2 산출 후 별도 설계서로 확장)

- 폼 enum `acquisitionStdMode` + `transferStdHalt` 도입 (①②③⑧)
- ④에서 boolean 3개로 펼침 · ⑫ `superRefine`으로 불가능 조합 거부
- UI 최종형: 분모 블록을 4갈래 **위**에 항상 렌더 + 분자 산정 방식 라디오 1개
  (일자별 32셀 표·키움을 모든 경로에서 공용 — §1-3 비대칭 해소)
- 마이그레이션: boolean → enum **순수 함수** 1개로 국한 + anchor
  → **`lib/stores/calc-wizard-stock-normalize.ts`의 `normalizeStockFormData`**
- anchor·E2E는 **여기서 한 번만** 갱신

> 🔴 **초판 정정** — 초판은 마이그레이션 위치를 `lib/stores/calc-wizard-migration.ts`로 적었다.
> **틀렸다**: 그 파일에 stock 참조가 **0건**이고, `lib/stores/`에 stock 전용 마이그레이션
> 파일도 없다. 실제 위치는 `calc-wizard-stock-normalize.ts`의 `normalizeStockFormData`이며,
> **sessionStorage 재수화**(`calc-wizard-stock-store.ts:237·240`)와 **이력 복원**
> (`app/history/HistoryClient.tsx:313`) **양쪽이 그 함수 하나**를 지난다.
> ⇒ 「순수 함수 1개로 국한」이라는 전제는 유지된다 — 위치만 바뀐다.

#### S3의 14 동기화 지점 커버리지 (신규 폼 필드 2개)

`acquisitionStdMode`·`transferStdHalt`가 ①에 들어가므로 14지점을 전수로 잡는다.
**N/A도 명시한다** — ⑫⑬⑭는 TypeScript가 못 잡아 **침묵 strip**되는 지점이다.

| # | 지점 | S3에서 할 일 |
|---|---|---|
| ① | 폼 상태 `StockTransferFormData` | 필드 2개 추가 · boolean 3개 제거 |
| ② | initial `createInitialStockFormData` | `"monthly_avg"` / `false` |
| ③ | normalize | **F-1의 그 함수** — 구 boolean → enum 역산 |
| ④ | API 변환 `stock-transfer-tax-api.ts` | enum → boolean 3개 펼침 |
| ⑤ | UI 위젯 | 분모 블록 + 분자 라디오 (상호배타 규칙 아래 참조) |
| ⑥ | 사이드바 합계 | **N/A** — `StockSidebar.tsx`에 이 축 참조 0건(실측) |
| ⑦ | 결과 카드 | **N/A** — `PostListingDetailCard.tsx:77`이 읽는 것은 **엔진 result의** `acquiredBeforeListing`이고 result는 boolean을 유지한다 |
| ⑧ | validation | 술어를 enum 축으로 전환 + 상호배타 차단 |
| ⑨⑩⑪ | Zod enum 메인·컴패니언 · 자산-수준 fallback | **N/A** — 엔진 input이 boolean을 유지하므로 스키마 형태 불변 |
| ⑫ | Zod 입력 객체 | boolean 유지 + `superRefine` 강화 |
| ⑬ | body spread | ④가 만든 boolean 3개가 실제로 body에 실리는지 **grep 자가 점검** |
| ⑭ | Route handler 엔진 input 매핑 | boolean 그대로 — 변경 없음을 **확인**(무변경도 점검 대상) |

#### S3 필수 — 「양도일 거래정지 × 취득 후 상장」 상호배타 UI

메뉴 초안은 분모의 체크박스와 분자의 라디오를 **독립**으로 그렸다. 그대로 두면 사용자가
「분자 = 취득 후 상장」 + 「분모 = 양도일 거래정지」를 동시에 고를 수 있는데, 그 조합은
**법령상 양립 불가**로 ⑧ G-5(`stock-transfer-tax-validate-step2.ts:359`)와
⑫(`stock-transfer-tax-schema.ts:419`)가 각각 차단·400 처리한다
(취득일 정지 짝은 ⑧ `:367` + ⑫ `:429` — V-5 종결분).

⇒ **UI가 통과시키고 validate가 막는 모순**이 된다(CLAUDE.md ⑧ 규칙 · memory
`feedback_ui_gate_two_conditions_downstream_one`). S3 설계 시 **셋 중 하나**를 택해 명시한다:

1. 분모 체크박스를 켜면 분자 라디오에서 「취득 후 상장」을 **disabled**로
2. 「취득 후 상장」을 고르면 분모 체크박스를 **숨김**
3. 분자 라디오에 「양도일 거래정지」를 **4번째 선택지**로 합쳐 축을 하나로 (조합 자체가 소멸)

> 3안은 §1-5 표의 「양도일 거래정지는 분모까지 대체한다」는 성질과 가장 잘 맞는다 —
> 다만 「분모/분자」 2블록 구조가 흐려지므로 S3 설계서에서 UX로 판정한다.

메뉴 최종형(초안):

```
환산취득가 (시행령 §176의2②1호)

  양도 당시 기준시가 (분모)
    [기준시가 입력 방식]  직접 / 일자별        [🔍 키움 자동조회]
    □ 양도일 이전 1개월에 거래정지·관리종목 구간 있음 (§165③) → 보충 평가로 대체

  취득 당시 기준시가 (분자) — 산정 방식
    ( ) 취득일 이전 1개월 종가평균                     (일반)
    ( ) 취득일 거래정지 → 비상장 보충 평가              (§165③)
    ( ) 취득 후 상장 → 상장일 이후 1개월 종가평균 환산   (§165⑤)
```

---

## 6. 미검증 항목 (V-n) — **각 단계** 착수 전에 닫는다

> V-4는 S0의 전제다. **S1의 착수 조건은 전건 해소됐다**(V-1·V-2·V-3·V-5 종결).

| # | 항목 | 왜 미결인가 |
|---|---|---|
| ~~V-1~~ | ✅ **종결 2026-09-10** — §6-1 참조 | |
| ~~V-2~~ | ✅ **종결 2026-09-10** — §6-3 참조. 실사용 호출자 **0건 파손**, 픽스처 1건만 보강 | |
| ~~V-3~~ | ✅ **종결 2026-09-10** — §6-2 참조. 다만 **S1의 단계 결합 제약**이 나왔다 | |
| **V-4** | S0의 셀렉터 의존이 리터럴 외 3형태에 몇 건 더 있는가 | §5 S0의 목록은 리터럴만 센 하한 |
| ~~V-5~~ | ✅ **종결 2026-09-10** — ⑧에 짝 게이트가 **있다**. `stock-transfer-tax-validate-step2.ts:366-372` `[C-1 M-4]`가 「취득 당시 비상장 주식은 취득일 거래정지 대상이 아닙니다」로 막고, 주석이 「Zod refine과 **동일 문구**」임을 명시한다(⑫ `stock-transfer-tax-schema.ts:429`). ⇒ ⑧↔⑫ 모순 없음 | |

### 6-1. V-1 종결 — 보존 대상은 «부분문자열 2개 + 취득가 0», 조기반환은 **구조적 dead code**

**🔴 grep이 거짓음성이었다.** 0-가드 warning 3종의 소비처를 `grep`으로 찾으니 **0건**이 나왔고,
그대로 「아무도 안 지킨다」로 넘어갈 뻔했다. 문구를 `MUTATED_W1~3`으로 바꿔 돌리자 드러났다:

```
FAIL  __tests__/calc/gift-burdened-stock-major-and-conversion.anchor.test.ts
      BG-ENG-1: 분모 누락 → 취득가액 0 + 사유 경고 (형제 분기와 대칭)
      BG-ENG-2: 분자 누락 → 취득가액 0 + 사유 경고
Test Files  1 failed | 696 passed (697)
```

테스트가 **전체 문자열이 아니라 부분문자열**(`toContain("양도일 이전 1개월 종가평균이 0 이하")`)을
쓰기 때문에 리터럴 grep에 안 걸렸다.
⇒ 「'없음' 단언엔 mutation probe」(memory `feedback_negative_assertion_needs_mutation_probe`)가
그대로 적중한 사례다. **S1에서 「소비처 없음」을 근거로 무엇을 지우려 할 때마다 이 절차를 반복한다.**

**S1이 반드시 보존해야 하는 것** (`gift-burdened-stock-major-and-conversion.anchor.test.ts:375-395`):

| 단언 | 값 |
|---|---|
| BG-ENG-1 | `acquisitionPrice === 0` · warnings ⊇ `"양도일 이전 1개월 종가평균이 0 이하"` |
| BG-ENG-2 | `acquisitionPrice === 0` · warnings ⊇ `"취득일 이전 1개월 종가평균이 0 이하"` |
| BG-ENG-3 (대조군) | 정상 입력에는 `"종가평균이 0 이하"`가 **붙지 않는다** |

> 🔑 **BG-ENG는 S1의 §165⑤ 쪽 신규 anchor의 템플릿이다.** 그 파일 `:357` 주석이 프레이밍까지
> 그대로 준다 — 「⑫가 막으므로 UI 경로로는 도달하지 않는다 — 엔진 직접 호출(외부 연동) 방어를 고정한다」.

**반대로, 보존할 필요가 없는 것** — `stock-valuation-listed.ts:58-72`의 거래정지 조기반환과
그것이 세우는 `tradingHaltFallback` 필드는 **도달 불가**다.

- 뮤테이션: 그 분기에 `throw` → **6,414건 전건 통과**(도달 0)
- 구조: `stock-acquisition-basis.ts`의 if-체인이 halt를 **먼저** 걸러낸다 —
  `:128` `acquiredBeforeListing` → `:161` **`tradingHaltAtTransfer`** → `:208` `unlisted`
  → `:253` `tradingHaltAtAcquisition` → **`:299` `else`에서만** `calcListedValuation` 호출.
  비과세 경로도 같다(`exempt-informational-acquisition.ts:131`이 halt를 먼저 `return`).
- `tradingHaltFallback`의 소비처: 소스·테스트 **0건**(직접 호출 테스트 2파일도 이 필드는 안 본다)

> ⚠️ **그래도 S1에서 지우지 않는다.** 내 변경이 만든 고아가 아니라 **기존 dead code**이므로
> CLAUDE.md 「관련 없는 dead code는 언급만 한다 — 삭제하지 않는다」가 적용된다. 여기 기록만 남긴다.

### 6-2. V-3 종결 — 지난다. 단 **⑫ 면제가 살아 있는 동안은 API로 뚫린다**

| 층 | 비과세 경로에 적용되는가 | 근거 |
|---|---|---|
| ⑧ validate | **예** | `stock-transfer-tax-validate-step2.ts`에 `isExempt`/`비과세`/`exempt` 참조 **0건** — 비과세를 알지 못하므로 우회할 수 없다. 비과세 판정은 엔진이 한다 |
| 마법사 게이트 | **예** | `StockTransferTaxCalculator.tsx:114-130` `handleNext`가 `severity === "error"`면 단계 전환을 막는다 |
| ⑫ Zod | **예** | 분모 refine의 게이트는 `acquisitionMode === "estimated" && isListed`뿐 (`stock-transfer-tax-schema.ts:453-456`) — 비과세 여부와 무관 |

비과세 §165⑤ 분기도 `acquisitionMode === "estimated"` 안에 있다
(`exempt-informational-acquisition.ts:104-105`). 정상 화면 동작은 `A-3-5`가 고정한다
(`filing-form-conversion-rows.anchor.test.ts:103-111` — 비과세 경로에서 12-2 = 8,659).

**🔴 그런데 지금 ⑫는 §165⑤ 분모를 면제한다**(`stock-transfer-tax-schema.ts:459`).
따라서 **「비과세 + 취득 후 상장 + 분모 미입력」 payload가 API를 그대로 통과**하고,
현재는 fallback이 그것을 받아 「환산 미적용」으로 처리한다.

⇒ **S1의 단계 결합 제약**: S1-2·S1-3(fallback 제거)을 넣으면서 S1-4(⑫ 면제 제거)를
**같은 PR에 묶지 않으면**, 그 사이 상태에서 비과세 화면의 취득가가 **조용히 0**이 된다.
UI 경로는 ⑧이 이미 막고 있어 증상이 안 보이므로 더 위험하다.


### 6-3. V-2 종결 — 실사용 호출자 0건 파손, 픽스처 1건 보강

**호출자 전수 열거** (API 경로에 우회가 없음을 먼저 확인):

| 스키마 적용 지점 | 파일:줄 |
|---|---|
| 단건 | `app/api/calc/stock-transfer/route.ts:80` — `addStockRefines(stockTransferInputSchema)` |
| **합산** | `lib/api/stock-transfer-tax-schema.ts:747` — `aggregateStockItemSchema`가 종목마다 `addStockRefines` 적용 |

분모 refine(`:457-467`)은 `addStockRefines`(`:374-697`) **안**에 있으므로 **두 경로 모두** 지난다.
`fetch("/api/calc/stock-transfer")` 호출자는 넷뿐이다 — 마법사 단건·합산
(`lib/calc/stock-transfer-tax-api.ts:546·592`), 부담부증여 단건·합산
(`lib/calc/gift-burdened-transfer-api.ts:591·642`). **외부 연동 호출자는 저장소 안에 없다.**

**전진 probe** — `:459`에서 `!data.acquiredBeforeListing`를 실제로 제거하고 측정:

| 대상 | 결과 |
|---|---|
| vitest (`tax-engine/stock-transfer` + `calc` + `components`) | **6,413 / 6,414 통과** · 실패 1건 |
| E2E 주식 25 spec | **57건 전건 통과** |
| E2E 부담부증여 4 spec | **23건 전건 통과** |

유일한 실패는 `route-split-mode.anchor.test.ts` **LO-PRE-3**이고, **실사용 호출자가 아니라
픽스처 미비**다 — 그 테스트의 목적은 「§81④ 전전연도 3필드가 API 경로로 엔진까지 전파되는가」이고
분모와 무관한데, payload에 `transferDatePriceAvg1Month`가 빠져 있다.

> 🔑 그 픽스처도 `perShareTransferPrice: 8,950 × shareCount: 5,000`이라 **나누어떨어진다** —
> §4-2의 PL-3과 **같은 함정**이다. 두 테스트가 독립적으로 같은 모양의 픽스처를 갖고 있어
> fallback 제거가 수치로 드러나지 않았다.

⇒ **S1-4에 「LO-PRE-3 픽스처에 분모 추가」를 작업 항목으로 포함**한다. 그 외 파손 없음.

---

## 7. 착수 순서 요약

```
S0 (셀렉터 방탄화)   ⏳ V-4 선행
S1 (산식 통합 + Q-1) ✅ 완료 — PR #1562
S2 (회귀표 anchor)   ✅ 완료
            ↓
S3 (enum + UI 최종형) ─ 설계서 별도 · S2 표가 수용 기준 · Q-2 결정 필요
```

**V-1·V-2·V-3·V-5 전건 종결**(§6-1·6-2·6-3 · §6 표) — **S1은 착수 조건을 충족했다.**
남은 것은 V-4(S0의 셀렉터 범위 산정)와 Q-2(S3의 상호배타 UI 결정)뿐이고, 둘 다 S1의 전제가 아니다.

S1 착수 시 **2·3·4를 한 PR로 묶는 제약**(§6-2)을 반드시 지킬 것.
