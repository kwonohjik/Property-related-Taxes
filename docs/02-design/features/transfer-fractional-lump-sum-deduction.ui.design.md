# 지분 모드 개산공제 — UI 설계 (rev.1)

> 계획서: `transfer-fractional-lump-sum-deduction.plan.md` (rev.2) · 엔진: `.engine.design.md` (rev.1)
> 정책: `components/calc/CLAUDE.md`
> 검증 원칙: file:line은 실측. 미확인은 "확인 필요".

---

## 0. 이 작업의 UI 성격

**신규 입력 위젯이 0개**다. 지분율은 기존 `OwnershipRatioInput`에서 이미 받고 있고,
엔진 `ownershipRatio`는 API 변환이 `getOwnershipRatio(asset)`로 파생한다.

UI 작업의 전부는 **표시(display) 축**이다 — 개산공제 값이 바뀌면서
「기준시가 × 3%」라고 적힌 산식이 **자기 값을 만들지 못하게** 되는 문제를 해소한다.

---

## 1. 핵심 문제 — 표시 산식 자기모순

```
현재 표시:  취득시 기준시가 500,000,000 × 3% = 15,000,000     ← 일관
정정 후:    취득시 기준시가 500,000,000 × 3% =  7,500,000     ← 산식이 값을 못 만든다
```

`feedback_engine_result_display_drift` 위반. 해소 방향은 둘 중 하나다:

| 안 | 내용 | 판정 |
|---|---|---|
| **A (채택)** | 엔진이 `lumpSumDeductionBase`(지분 기준시가)를 echo → UI가 그 값을 산식에 노출 | 단일 소스. 산식 = `지분 기준시가 375,000,000 × 3%` 형태 |
| B | UI가 `formData`의 지분율로 재계산해 표시 | **부결** — UI가 §163⑥ 산식을 재구현 = dual-truth |

---

## 2. 표시 지점 전수 (계획서 §8.1)

| # | 위치 | 현재 표시 | 조치 |
|---|---|---|---|
| D1 | `TransferTaxResultView.tsx:531,537` | split 카드 `취득시 기준시가 {stdPriceAtAcq} × 3%` | echo 값으로 교체 |
| D2 | `DetailedStatementFormulaBuilders.ts:356,360,366` | 일반건물 명세서 동일 산식 | 동일 |
| **D3** | `DetailedStatementFormulaBuilders.ts:679-684` | **자기일치 판정으로 라벨 결정** | **최우선** — 아래 §3 |
| D4 | `GeneralBuildingValuationDetailCard.tsx:293-295` | `토지 개산공제 = INT(취득시 토지 기준시가 × 3%)` | echo 값으로 교체 |
| D5 | `CommercialBuildingValuationDetailCard.tsx:165,168` | `개산공제 합계 = INT(… × 3%)` | 동일 + **부수 정정**: base를 "환산취득가"로 라벨링하나 엔진 base는 **기준시가**(`commercial-building-valuation.ts:277,301`) |
| D6 | `DetailedStatementRedevelopmentBuilders.ts:202,490,649` | 재개발 명세서 — `:202`는 **값 포함 산식**(`floor(P_A × 3%) = {lump}`)이라 drift 직결, `:490`·`:649`는 **산식 문구만**(값 미포함)이라 base 명칭만 정정 | 동일 |
| **D7** | `redevelopment.ts:260,412` | **엔진 내장 `rationale` 문자열** — UI가 아니라 **엔진 수정 대상** | 엔진 측에서 echo 값 사용 |

**drift 없음 확인** (오탐 방지 기록): `FilingFormTableHelpers.ts:544-556`은 엔진 값 passthrough(`appraisalDeduction`·`estimatedDeduction`)로 재계산이 없다. `BuildingStdPriceReportSection`은 개산공제를 표시하지 않는다.

---

## 3. D3 — 자기일치 판정 폐기 (Critical)

```ts
// DetailedStatementFormulaBuilders.ts:681-684 (현행)
const lumpDeduction = stdAcq != null ? Math.floor(stdAcq * 0.03) : null;
const isLumpDeduction =
  a.acquisitionWasEstimated === true && lumpDeduction != null && baseExp === lumpDeduction;
const baseLabel = isLumpDeduction
  ? `개산공제 … = 취득시 기준시가 … × 3% — 시행령 §163⑥`
  : `양도비 등 … (중개수수료·법무사 비용 등) — §97① 나목`;
```

UI가 §163⑥ 산식을 재계산해 **엔진 값과 등식 비교**로 라벨을 정한다. 지분 적용 후 등식이 깨지면
**개산공제가 "양도비 등"으로 오표시**된다 — 금액 성격 자체를 잘못 알리는 표시 오류다.

→ 등식 판정을 폐기하고 **엔진이 알려주는 모드**(`necessaryExpenseMode` 또는 echo 필드 존재 여부)로 분기한다.
이는 이번 변경과 무관하게도 옳다 — UI가 세법 산식을 재구현하는 구조 자체가 `feedback_ui_engine_dual_truth_avoidance` 위반이다.

---

## 4. ⑥ 사이드바 — floor 순서 통일

```ts
// calc-wizard-store.ts:486, 504-506 (현행)
baseExp = Math.floor(parseRaw(a.standardPriceAtAcq) * rate);        // 개산공제 먼저
return acc + (fractional ? Math.floor(baseExp * (n / d)) : baseExp); // 지분 나중
```

사이드바는 **이미 지분율을 적용한다**. 다만 순서가 엔진 설계(§E3 지분 먼저)와 **반대**라
**0.49%에서 1원 불일치**한다(실측).

→ 엔진 헬퍼와 동일 순서로 통일: `floor(floor(std × ratio) × rate)`.

> 이 지점은 **정황증거**이기도 하다 — 독립 구현체가 이미 "지분 적용이 옳다"를 전제하고 있고,
> 그 결과 현재 **사이드바 미리보기 ≠ 엔진 결과**라는 사용자 가시 불일치가 존재한다(계획서 §2.4).

---

## 5. 지분율 가시성 (신규)

결과 화면에 **지분율이 표시되지 않는다** (`TransferTaxResultView` grep 0건).
신고서에는 있다 — `FilingFormTableHelpers.ts:146-151` `(지분 X%)` 배지.

개산공제·취득가액이 물건 전체의 절반인 이유를 사용자가 알 수 없으므로,
결과 요약에 **지분 배지**를 추가한다. 신고서와 같은 표기(`(지분 50%)`)를 쓴다.

`OwnershipRatioInput.tsx:69,73`의 안내(`hint` "소유·취득 지분을 백분율(%)로 입력" ·
배지 "100% 기준 입력")에 **"취득가액·필요경비·개산공제 모두 자동 안분"**을 명시한다 — 선택 사항.

---

## 6. 8개 클라이언트 동기화 지점

| # | 지점 | 작업 |
|---|---|---|
| ① 폼 상태 | **없음** — `ownershipNumerator/Denominator` 재사용 |
| ② initial | **없음** |
| ③ normalize | **없음** |
| ④ API 변환 | `transfer-tax-api.ts`(primary) · `transfer-tax-api-helpers.ts:434`(companion) — `ownershipRatio` 전송 |
| ⑤ UI 위젯 | **없음** (선택: §5 안내 문구) |
| **⑥ 사이드바** | `calc-wizard-store.ts:486,504-506` floor 순서 통일 (§4) |
| **⑦ 결과 카드** | §2 표 D1~D7 |
| ⑧ validation | **없음** |

---

## 7. E2E / RTL

| ID | 시나리오 | 단언 |
|---|---|---|
| U1 | 지분 50% + 환산 → 결과 카드 | 산식의 base가 **지분 기준시가**로 표시되고, 그 값 × 3% = 표시된 개산공제 |
| U2 | 지분 50% → 사이드바 미리보기 vs 결과 | **두 값이 일치**(현재는 불일치) |
| U3 | 지분 50% + 이월과세 시나리오A | 라벨이 **"개산공제"**로 유지(현재 정정 후 "양도비 등"으로 오폴백 — D3) |
| U4 | 단독소유(100%) | 표시·값 **무변경** 회귀 |
| U5 | 결과 요약에 지분 배지 노출 | `(지분 50%)` 표기 |

> 신규 셀렉터는 throwaway probe로 실측 확정 후 고정(`feedback_browser_verify_with_playwright`).

---

## 8. 범위 밖

- 지분율 **입력** UX 변경(분수 입력·검증 강화 등) — 본 작업과 무관.
- `CommercialBuildingValuationDetailCard.tsx:165`의 base 라벨 오류(D5 부수) — 정정은 함께 하되 별도 결함으로 기록.
- 부담부증여 화면 — 경로 전체가 범위 밖(계획서 §4.2).

---

## 9. 인용 검증 이력 (STEP 13)

§2 표 D1~D6의 file:line을 **전건 직접 실측**했다 — D1(`:531`·`:537`) · D2(`:356`·`:366`) ·
D4(`:293`) · D5(`:165`) · D6(`:202`·`:490`·`:649`) 모두 해당 라인에 개산공제 산식이 실재함을 확인.
rev.1이 인용했던 `:496`은 실측 결과 해당 없어 **삭제**했다.
