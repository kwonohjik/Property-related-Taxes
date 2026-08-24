# 청산금 수령분 단독 신고(사례 46) — 결과탭 합계 양도가액·취득가액 오표시 수정 계획서

- 작성일: 2026-08-24 · rev.1
- 제보: 사용자 스크린샷 2장(입력 마법사 ③④ + 결과탭 「신고서 양식」)
- 성격: **표시 결함**(display) — 세액 계산은 정확하다(실측 확인). 다만 **두 결과 카드가 취득가액을 서로 다르게 보여준다.**
- 범위: 완공 APT + 청산금 수령 + `receiveOnlyMode=true` 단건 경로

---

## 1. 현상 — 제보 수치 재현 완료

제보 입력: 권리가액 500,000,000 · 청산금 수령액 114,000,000 · 관리처분인가일 2009-10-23 ·
취득일 2002-04-09 · 소유권이전 고시일 2024-01-25(→ 양도일 2024-01-26) ·
폼의 자산-수준 양도가액 525,000,000 · 폼의 양도일 2026-03-02.

> **종전부동산 취득가액 200,000,000은 제보 화면에 없다** — ③ 열의 45,600,000에서 역산한 **재구성값**이다
> (`45,600,000 ÷ (114,000,000 / 500,000,000) = 200,000,000`). probe가 ③ 열 전 항목을 화면과 **일치**시켰으므로
> 재구성은 검증됐다. 다만 anchor 작성 시 이 값이 **가정**임을 주석에 남길 것.

probe로 화면 수치를 **그대로 재현**했다(`buildRows` 직접 호출):

| 행 | 합계 열 (현행) | ① 인가전 | ② 인가후 | ③ 청산금 | 파트 합 | 판정 |
|---|---|---|---|---|---|---|
| 양도가액 | **525,000,000** | 0 | 0 | 114,000,000 | 114,000,000 | 🔴 |
| 취득가액 | **456,600,000** | 0 | 0 | 45,600,000 | 45,600,000 | 🔴 |
| 양도일자 | **2026-03-02** | 2024-01-26 | 2024-01-26 | 2024-01-26 | — | 🔴 |
| 보유기간 | **23년 11월** | 21년 9월 | 21년 9월 | 21년 9월 | — | 🔴 |
| 전체 양도차익 | 68,400,000 | 0 | 0 | 68,400,000 | 68,400,000 | ✅ |

**세액은 정확하다** — 양도소득금액 47,880,000 = 68,400,000 − LTHD 20,520,000. 엔진은 `transferPrice`를
receiveOnly 분기에서 사용하지 않는다(`redevelopment-split.ts:314-345` — settlement만 산정).

## 2. 두 번째 결함 — 같은 화면의 두 카드가 취득가액을 다르게 말한다

같은 result로 **계산명세서 카드**(`buildStatementItems`)를 뽑으면 값이 또 다르다:

| 카드 | 양도가액 | 취득가액 | 자기일관성 |
|---|---|---|---|
| 신고서 양식 (`buildRows`) | 525,000,000 | **456,600,000** | ✅ 성립(역산 규칙) — 다만 둘 다 틀림 |
| 계산명세서 (`buildStatementItems`) | 525,000,000 | **45,600,000** | 🔴 **파탄** — 525,000,000 − 45,600,000 − 0 = **479,400,000** ≠ 양도차익 68,400,000 |

취득가액이 **45,600,000 vs 456,600,000 — 10배 차이로 어긋난다.** 계산명세서는 취득가액만 파트 합으로
정정하고 양도가액은 그대로 둬서 산식이 성립하지 않는다(`DetailedStatementRedevelopmentBuilders.ts:609`
주석 「양도가액 — 합계는 totalTransferPrice 유지」 · `:632` `acqItem.value = sumAcq`).

> `acqItem.value = sumAcq`는 **2곳**이다 — `:467`(`applyLandContribOverrides`, 사례 37 land 출자)과 `:632`(일반 재개발).
> 사례 37은 `totalTransferPrice`가 실제 신축주택 양도가라 자기일관성이 성립한다. 본 결함은 **receiveOnly 전용**이다.

## 3. 원인 — ④에는 미러가 있는데 ⑦에는 없다

`receiveOnlyMode`에서 **양도가액 = 청산금 수령액 의제**는 이미 확립된 규칙이고, **④ API 변환 계층에는 구현돼 있다**:

```
lib/calc/transfer-tax-api.ts:280-292   isReceiveOnly 판정 (subject==="apt" && redevReceiveOnlyMode==="yes")
lib/calc/transfer-tax-api.ts:332-334   transferPrice: isReceiveOnly ? 청산금 : 계약총액
lib/calc/transfer-tax-api.ts:341       transferDate: receiveOnlyTransferDate || form.transferDate
```

주석도 명시한다 — 「memory `mirror-pattern` 3중 패턴 (UI display + API + validate)」.
**그런데 3중 중 「UI display」가 결과 표시에는 적용되지 않았다.** ⑦ 두 지점 모두 폼 원본을 그대로 읽는다:

| 지점 | 코드 | 읽는 값 |
|---|---|---|
| 신고서 양식 | `FilingFormTableHelpers.ts:410-413` `rawTotalPrice = override ?? contractTotalPrice` → `:421-424` `totalTransferPrice` | 525,000,000 |
| 신고서 양식 | `FilingFormTableHelpers.ts:402` `transferDate = formData.transferDate` | 2026-03-02 |
| 계산명세서 | `DetailedStatementHelpers.ts:125-127` (동일 식) | 525,000,000 |
| 계산명세서 | `DetailedStatementHelpers.ts:111` `transferDate = formData.transferDate` | 2026-03-02 |

취득가액 456,600,000은 **역산 규칙의 정상 동작**이다(`FilingFormTableHelpers.ts:562-579`,
memory `feedback_redev_filing_form_acquisition_inverse`):
`합계 취득 = 합계 양도 − 합계 경비 − 합계 차익` = 525,000,000 − 0 − 68,400,000. **입력이 틀려서 출력이 틀렸다.**
⇒ 양도가액만 바로잡으면 취득가액은 `114,000,000 − 0 − 68,400,000 = 45,600,000`으로 **자동 정정**된다.

## 4. 🔴 안전망 실측 — **0건**

memory `feedback_pre_change_safety_net_probe` 절차대로 **바꾸기 전에 잰다.**
`buildRows`의 `transferPrice/total`과 역산 분모를 receiveOnly 시 파트 합으로 바꾸는 뮤테이션을 적용하고
`__tests__/components/` + `__tests__/tax-engine/transfer-tax/redevelopment/` + `__tests__/calc/` 전량 실행:

```
386 파일 3,664 테스트 — 전건 통과 (실패 0)
```

⇒ **receiveOnly 표시를 고정하는 테스트가 하나도 없다.** 동시에 **수정 후 회귀를 잡아줄 안전망도 없다.**

> ⚠️ **「0건」의 범위를 오독하지 말 것.** 뮤테이션은 `receiveOnlyMode === true` **게이트 안에서만** 값을 바꿨다.
> 따라서 이 결과는 **C2~C6(비-receiveOnly)의 커버리지에 대해서는 아무것도 말하지 않는다** — 그 경로들은
> 애초에 뮤테이션의 영향을 받지 않았다. 회귀 가드 G-1~G-3을 **별도로** 두는 이유가 이것이다.
따라서 Do 진입 전 **Pre-Do anchor 선작성이 필수**다(memory `feedback_pre_anchor_verification`).

> ⚠️ **이 실측이 덮은 것은 「양도가액」뿐이다.** 뮤테이션은 `transferPrice/total`과 역산 분모만 바꿨다.
> **`transferDate` 교체(§6-4)의 안전망은 아직 재지 않았다** — 거주기간 fallback·LTHD 분해까지 번지므로
> 3-b 착수 전에 **별도 뮤테이션으로 다시 측정**한다(§11).

## 5. 법령·산식 근거

- 소득세법 시행령 **§166① 본문 + 제1항 제2호 가목** — 청산금 수령분 단독 신고 산식.
  상수는 `lib/tax-engine/legal-codes/transfer-house.ts:292-296`(JSDoc)에 이미 존재한다.
- 신축 APT 양도가 신고 대상이 아니므로 **양도가액 = 청산금 수령액**이 신고단위 전부다.
  UI 안내문도 같은 말을 한다 — 「청산금 수령액만 양도가액으로 의제됩니다」(제보 스크린샷 1).
- 양도시기 = **소유권이전 고시일의 익일**(NTS 집행기준 · 시행령 §162①9호). UI가 「자동 산정 양도일」로
  이미 표시하고 ④가 엔진에 그 값을 보낸다.

⇒ 본 수정은 **새 해석을 도입하지 않는다.** 이미 ④에 구현된 규칙을 ⑦에 적용할 뿐이다.

## 6. 설계 — 공용 leaf 1개, 호출부 3곳

### 6-1. 왜 호출부에서 `transferPriceOverride`를 넘기지 않는가

`TransferTaxResultView`에서 override를 주는 방법은 **결과뷰마다 중복**된다. 양도세 결과뷰는 하나가 아니다
(memory `feedback_transfer_result_view_is_not_one` — 2회 재발). 표시 계층 **안쪽 단일 지점**에서 해결한다.

### 6-2. 공용 leaf

`components/calc/results/transfer/`에 순수 함수 1개를 신설한다(무의존 leaf):

```ts
/** receiveOnly(사례 46) 표시 보정 — 신고단위 양도가액·양도일은 청산금 분 단독이다. */
export function resolveReceiveOnlyDisplay(
  result: TransferTaxResult,
  fallbackTransferPrice: number,
  fallbackTransferDate: string,
): { transferPrice: number; transferDate: string }
```

- 발동 조건: `result.redevelopmentDetail?.receiveOnlyMode === true` **AND** 인가전·인가후 파트가 모두 0.
  🔴 **플래그만으로 켜면 안 된다 — V-1 probe로 실패 모드를 실측했다**: `right`+`receiveOnlyMode=true`에서
  플래그는 `true`인데 `preApproval = 386,000,000`이라, 합계를 settlement 단독으로 바꾸면 **인가전 분이 통째로 소실**된다.
- `transferPrice` ← `settlement.apportionedTransfer`
- `transferDate` ← `settlement.branchTransferDate`(존재 시).
  ⚠️ **타입이 다르다** — `branchTransferDate?: Date`(`transfer-redevelopment.types.ts:433`)이고 호출부 fallback은
  `formData.transferDate`(**string** `YYYY-MM-DD`)다. leaf는 **string으로 정규화해 반환**하고(`toISOString()` 금지 —
  UTC 시프트로 하루 밀린다. 기존 date 유틸 재사용), `branchTransferDate`가 `undefined`면 **fallback을 그대로 돌려준다**.
- 두 값 모두 **result 단일 소스**다.
- ⚠️ **§11이 3-a(양도가액)/3-b(양도일)로 나뉘므로 leaf는 두 값을 독립 소비 가능해야 한다** —
  객체를 반환하되 호출부가 `transferPrice`만 먼저 쓰고 `transferDate`는 3-b에서 붙인다.
  「한 번에 둘 다」로 설계하면 3-a 단독 착수가 막힌다.

### 6-3. 적용 지점 — 파일 3개 · 값 2종

| # | 파일 | 현행 | 변경 |
|---|---|---|---|
| A | `FilingFormTableHelpers.ts:411-414` `totalTransferPrice` 산출 | `override ?? contractTotalPrice` | leaf 결과 우선 |
| A' | `FilingFormTableHelpers.ts:406` `transferDate` | `formData.transferDate` | leaf 결과 우선 |
| B | `DetailedStatementHelpers.ts:125-127` `totalTransferPrice` | 동일 식 | leaf 결과 우선 |
| B' | `DetailedStatementHelpers.ts:111` `transferDate` | 동일 | leaf 결과 우선 |
| **C** | `TransferTaxResultView.tsx:246` `CarryoverScenarioBFilingCard transferPrice` | `override ?? contractTotalPrice` | leaf 결과 우선 (V-2에서 발견) |

> **지점 C를 왜 포함하는가**: 이월과세 비교 모드 분기(`TransferTaxResultView.tsx:222-241`)는 `FilingFormTable`에
> `redevSubject`·`redevSettlementDirection`을 **함께 넘긴다** — 즉 코드가 **redev + 이월과세 공존을 상정**한다.
> 조합의 실제 도달성은 미확인이지만, **같은 결함을 아는 채로 남기지 않는다**는 판단으로 범위에 넣는다.
> 비용은 호출부 1줄이다. **전용 anchor는 두지 않는다** — 조합 도달성이 미확인이라 fixture를 만들 수 없다.
> 정확성은 **leaf의 A-1~A-5가 보증**하고, 지점 C는 그 leaf를 그대로 쓴다. 이 사실을 여기 명시해 둔다(침묵 금지).

### 6-4. 🔴 `transferDate` 교체의 파급은 2행이 아니다 (검토 1회차 발견)

초판은 A'·B'를 「양도일자·보유기간 2행」으로만 적었다. **불완전했다** — 두 파일 모두 `transferDate`가
**지역변수 하나**이고 아래 소비처가 전부 그것을 읽는다. 행별로 기대 동작을 확정하고 anchor로 고정한다.

| 파일:line | 소비처 | receiveOnly에서 바뀌는가 | 판정 |
|---|---|---|---|
| `FilingFormTableHelpers.ts:456` | 양도일자 합계 행 | 2026-03-02 → **2024-01-26** | 의도된 수정 |
| `:458` | 보유기간 합계 행 | 23년 11월 → **21년 9월** | 의도된 수정 |
| `:641` `holdingMs` → `:684` `splitLtDeduction` | **LTHD 보유/거주 기간분 분해**(redev 분기) | 분해 기준 개월수가 바뀐다 | **잠재 불일치 해소** — 엔진은 이미 2024-01-26로 LTHD를 산정했는데 표시 분해만 2026-03-02 기준이었다. 제보 케이스는 거주월수 0이라 육안 변화 없음(전액 보유분) |
| `:437`·`:463` | 거주기간 종료일 fallback(`moveOutDate` 없으면 `transferDate`) | 퇴거일 미입력 시 종료일이 앞당겨짐 | 🔴 **anchor 필요** — C7 신설 |
| `:512-515`·`:524-525`·`:538-539`·`:547-548` | 4열·2열 모드 전용 | receiveOnly는 `redev-4split`이라 **미진입** | 해당 없음 |
| `DetailedStatementHelpers.ts:132` | 양도일자 항목 | 동일 | 의도된 수정 |
| `:159-160` | 보유기간 항목 + **산식 문자열** | 「양도일 … − 취득일 … = …」 문구가 함께 바뀜 | 의도된 수정 |
| `:167` | 자산별 보유기간(aggregate 전용) | 단건은 미진입 | 해당 없음 |
| `:178`·`:183`·`:210` | 거주기간 fallback·산식 | 위 `:437`과 동일 사유 | 🔴 C7 |
| `:395` | 하위 빌더로 pass-through | 전달값이 바뀜 — 소비처 재확인 필요 | ⏳ **V-7** |

⇒ **양도가액과 양도일은 위험도가 다르다.** 양도가액 교체는 소비처가 3곳(표시·역산·명세서)으로 닫혀 있지만,
양도일 교체는 거주기간·LTHD 분해까지 번진다. Do에서 **양도가액 먼저 · 양도일은 C7 anchor 확보 후**로 나눠 진행한다.

역산(`:562-579`)·계산명세서 `sumAcq`(`:632`)는 **손대지 않는다** — 입력이 고쳐지면 둘 다 45,600,000으로 수렴한다.
이것이 「양도 − 취득 − 경비 = 차익」 자기일관성을 두 카드에서 동시에 회복시키는 최소 변경이다.

## 7. 케이스 매트릭스

| # | 조합 | 기대 합계 양도가액 | 기대 합계 취득가액 | 기대 합계 양도일 | anchor |
|---|---|---|---|---|---|
| C1 | apt + receive + **receiveOnly=true** (제보 케이스) | 114,000,000 | 45,600,000 | 2024-01-26 | A-1~A-5 · E-1 |
| C2 | apt + receive + receiveOnly=**false** (사례 47 동시신고) | 계약총액 **유지** | 역산 유지 | 폼 양도일 유지 | G-1 |
| C3 | apt + **pay** (사례 44·45) | 계약총액 유지 | 역산 유지 | 폼 양도일 유지 | G-2 |
| C4 | right(입주권) + receive (**사례 36·39** — 45가 아니다. 45는 apt+pay) | 계약총액 유지 | 역산 유지 | 폼 양도일 유지 | G-3 |
| C5 | land 출자 §166③ (사례 37) | 계약총액 유지 | `landContribDetail` 경로 유지 | 유지 | 전체 회귀 |
| C6 | 비-재개발 전 분기 | 유지 | 유지 | 유지 | 전체 회귀 |
| **C7** | C1 + **거주기간 구간 입력(퇴거일 미입력)** | 114,000,000 | 45,600,000 | 2024-01-26 · **거주 종료일이 양도일로 당겨짐** | A-6 |

C2~C6은 **회귀 0**이어야 한다. C1만 값이 바뀐다.

## 8. Pre-Do anchor (Do 진입 전 작성 — 안전망 0건이므로 필수)

| ID | 내용 | 판정 |
|---|---|---|
| **A-1** | C1 `buildRows` 합계 양도가액 = 114,000,000 · 취득가액 = 45,600,000 | 현행 RED |
| **A-2** | C1 `buildRows` 합계 양도일자 = 2024-01-26 · 보유기간 = 21년 9월 | 현행 RED |
| **A-3** | C1 `buildStatementItems` 양도가액 = 114,000,000 · 취득가액 = 45,600,000 | 현행 RED |
| **A-4** | C1 자기일관성: 합계 양도 − 취득 − 경비 == 엔진 `transferGain` (**두 카드 모두**) | 현행 RED(계산명세서) |
| **A-5** | C1 합계 == ①+②+③ 파트 합 (양도가액·취득가액) | 현행 RED |
| **G-1** | C2(사례 47) 합계 양도가액 == 계약총액 — 회귀 가드 | 현행 GREEN 유지 |
| **G-2** | C3(사례 44) 회귀 가드 | 현행 GREEN 유지 |
| **G-3** | C4(사례 36/39 입주권 receive) 회귀 가드 | 현행 GREEN 유지 |
| **A-6** | C7 거주기간 종료일 fallback — 퇴거일 미입력 시 종료일 == 2024-01-26 | 신규 |
| **E-1** | 🔴 **결과뷰 레벨** — 제보 입력으로 결과탭 렌더 후 「신고서 양식」 합계 양도가액 == 114,000,000 (E2E 1건) | 신규 |

> A-1~A-5는 `buildRows`/`buildStatementItems` **단위 호출**이다. §6-1이 「결과뷰는 하나가 아니다」를 근거로
> 표시 계층 안쪽 수정을 택했으므로, **그 선택이 실제로 화면에 도달하는지**는 단위 anchor로 증명되지 않는다.
> E-1이 그 간극을 메운다(memory `feedback_transfer_result_view_is_not_one` · `feedback_browser_verify_with_playwright`).

**뮤테이션 구별력 측정 필수**(memory `feedback_negative_assertion_needs_mutation_probe`):
leaf를 no-op으로 되돌렸을 때 **A-1~A-6·E-1이 전부 실패**해야 한다. 실패 0건이면 anchor가 잘못된 단계를 보고 있는 것이다
(memory `feedback_anchor_observes_wrong_stage`).

## 9. 미검증 항목 (Do 중 확인)

| ID | 항목 | 확인 방법 |
|---|---|---|
| **V-1** | ✅ **해소(2026-08-24 probe) — 위험 실재 확인.** `receiveOnlyMode`는 **분기 발동과 무관하게 입력값이 그대로 echo된다**(`redevelopment.ts:695` — `redevelopment.receiveOnlyMode === true ? true : undefined`). subject="right"에 플래그만 실리면 파트는 0이 아닌데 표시가 청산금 단독으로 바뀔 수 있다. ④에는 **게이트가 두 개**이고 서로 다른 파일이다 — ⓐ `transfer-tax-api-redev.ts:112-120`이 `!isApt → receiveOnlyMode: undefined`로 **payload 자체를 막고**, ⓑ `transfer-tax-api.ts:288-289`가 `redevPayload?.subject === "apt"`로 **양도가액 미러를 막는다**. 둘 다 form 기준이라 엔진 echo(`redevelopment.ts:695`)는 여전히 무가드다. ⇒ **표시 leaf는 플래그를 믿지 말고 파트 0을 함께 확인**할 것 | **실측**: `right` + `receiveOnlyMode=true` 주입 → `flag=true`인데 `preApproval=386,000,000`(0 아님)·`settlement=420,000,000`. 플래그만 믿으면 합계가 settlement 단독이 되어 **인가전 분 386,000,000이 합계에서 소실**되고 취득가액 역산도 붕괴한다. 대조군: `apt`+true → 파트 `0/0/114,000,000` ✅ · `right`+false → `flag=undefined` ✅ ⇒ **파트 0 게이트는 필수**(설계 §6-2 반영 완료) |
| **V-2** | ✅ **해소(grep 전수).** `contractTotalPrice` 소비처는 결과 계층에 **4곳**: `DetailedStatementHelpers.ts:127`(지점 B) · `FilingFormTableHelpers.ts:413`(지점 A) · `TransferTaxResultView.tsx:549` **상가건물 전용 카드** · `:582` **일반건물 전용 카드**(둘 다 redev 미해당) · `:246` `CarryoverScenarioBFilingCard` | ⇒ **신규 적용 지점 1곳 추가**(`:246`, 아래 지점 C). 상단 요약·사이드바에 별도 소스는 **없다** |
| **V-3** | ✅ **해소.** `data-print-section="form-table"`은 `FilingFormTable.tsx:52` **자신**에 붙어 있다 — 인쇄는 동일 `buildRows` 결과를 그대로 쓴다. 별도 분기 없음 | (`CarryoverScenarioBFilingCard.tsx:71`이 같은 섹션명을 쓰지만 별도 카드 — 지점 C로 흡수) |
| **V-4** | ✅ **해소(probe).** C1에서 ③ 열 양도일자가 `-`가 아니라 `2024-01-26`으로 렌더됐다(`fmtD(gamok.branchTransferDate)` 경유) ⇒ 채워진다. 그래도 leaf는 `undefined` 시 **fallback 유지**로 설계(방어) | |
| **V-5** | ✅ **해소(grep 0건).** 다건(묶음) 경로 영향 — **미배선으로 실측됨**(`multi-transfer-tax-api.ts`·`multi/route.ts`에 `receiveOnly` 0건). 배선되면 `buildAggregateRows`에도 동일 조치 필요 | grep 재확인 |
| **V-7** | ✅ **해소(2026-08-24 Read+probe).** `:395` → `setLongTermDeductionItems`(`DetailedStatementLthdItems.ts:39`). 그 안의 `transferDate` 소비처는 **`:73` `totalHoldingMs` 하나**(단건). `:84`·`:92`는 `isAggregate` 전용이라 단건 receiveOnly는 미진입 | **실측**: 거주 0개월·30개월 두 변형 모두 보유분 `20,520,000` / 거주분 `0`으로 **금액 불변**. 바뀌는 것은 **보유기간 문자열뿐**(`23년 11월` → `21년 9월`). ⇒ 3-b의 범위는 §6-4 표를 넘지 않는다 |
| **V-6** | ✅ **해소(grep).** `525,000,000`/`456,600,000`을 참조하는 E2E·단위 테스트는 **receiveOnly 문맥에 없다**. redev spec 1건(`e2e/redevelopment-inheritance-163-9-acquisition.spec.ts:36`)은 `settlementDirection: "pay"`라 **C3**다 ⇒ 회귀가 아니라 **G-2를 E2E로도 확인할 수 있는 기존 자산** | |

### 9-1. 해소 후에도 남은 미확인 (설계 영향 없음)

- **표2(§95② 별표2)가 적용되는 receiveOnly 조합의 존재 여부** — V-7 실측에서 두 변형 모두 표1로 떨어져
  `splitLtDeduction`의 보유/거주 분해가 불변이었다. 표2 진입 조합이 실재한다면 분해 **비율**이 달라질 수 있다.
  다만 그 경우에도 **엔진은 이미 2024-01-26로 LTHD를 산정**했으므로 교체는 표시를 엔진에 맞추는 방향이고,
  **설계는 어느 쪽이든 동일**하다(3-b는 A-2·A-6로 고정). ⇒ 착수 차단 사유가 아니다.
- 이 미확인 값을 **화면 문구·상수로 쓰지 않는다.**

## 9-2. 14 동기화 지점 커버리지

**신규 필드 0개** — 엔진 input/result·폼 상태·Zod 스키마 어느 것도 바뀌지 않는다.
읽는 값(`redevelopmentDetail.receiveOnlyMode` · `settlement.apportionedTransfer` · `settlement.branchTransferDate`)은
**모두 기존 result 필드**다(`transfer-redevelopment.types.ts:433`·`:538`).

⇒ ①~⑭ **전 지점 N/A**. ⑫Zod·⑬body spread·⑭Route 매핑의 침묵 strip 위험도 해당 없음.
변경은 **⑦ 결과 카드 한 층에 갇힌다** — 이것이 본 계획의 회귀 표면이 좁은 이유다.

## 10. 범위 밖 (별건)

- **폼의 자산-수준 양도가액·양도일을 receiveOnly에서 숨기거나 자동 채우는 UX** — 입력 UI 변경이라 별건.
  본 계획은 **표시만** 고친다(사용자가 남긴 폼 값은 보존).
- 인가전/인가후 필요경비 슬롯(§97①2·3호) 미매핑 — UI 안내문이 이미 고지 중인 기존 별건.
- LTHD·세율 등 세액 계산 — **본 건과 무관**(실측상 정확).

## 11. 진행 순서

```
0. ✅ **V-1~V-7 전건 해소 완료**(2026-08-24 검토 루프) — 착수 차단 없음
1. Pre-Do anchor A-1~A-6 + E-1 + G-1~G-3 작성                       → verify: **RED 7 / GREEN 3**
2. **`transferDate` 안전망 뮤테이션**(§4 각주 — 유일한 미측정 잔여)   → verify: 실측 건수 기록
3-a. leaf 신설 + **양도가액만** 배선(지점 A·B·C)                     → verify: A-1·A-3·A-4·A-5 GREEN
3-b. **양도일** 배선(지점 A'·B')                                     → verify: A-2·A-6 GREEN
4. 뮤테이션 구별력 측정(leaf no-op 되돌림)                            → verify: **A-1~A-6·E-1 전부 RED**
5. 회귀 — 전체 test + typecheck + lint                               → verify: 실패 0
6. 브라우저 수동 확인 (제보 입력 그대로 → 결과탭 두 카드 대조)          → verify: 114,000,000 / 45,600,000
```

---

## 12. Do 실행 기록 (2026-08-24) — 계획이 세 곳 정정됐다

### 🔴 정정 1 — `branchTransferDate`는 **런타임에 string**이다 (E-1이 잡았다)

계획서 §6-2는 타입 선언(`branchTransferDate?: Date`)만 보고 「`toISOString()` 금지 — UTC 시프트」라고 적었다.
**둘 다 불완전했다.**

- 결과는 **API Route를 거쳐 JSON 직렬화**되므로 화면 도달 시점엔 **문자열**이다(루트 CLAUDE.md 「API Date 직렬화」).
  엔진을 직접 호출하는 **단위 anchor는 `Date`라 이 경로를 덮지 못한다** — A-1~A-6 전건 GREEN 상태에서
  **E2E(E-1)만 런타임 예외를 잡아냈다**(결과 화면이 「페이지를 불러오지 못했습니다」로 죽었다).
- `toISOString()` 자체는 **금지가 아니라 정본**이었다. ③ 청산금 분 열이 `fmtD`
  (`FilingFormTableRedevRows.ts:28-32`)로 같은 값을 그리는데 그것이 `toISOString().slice(0,10)`이다.
  합계가 다른 변환을 쓰면 두 열이 하루 어긋난다 ⇒ **③ 열과 동일 변환 재사용**이 정본.

⇒ leaf의 `toDateString`을 `Date | string` 양쪽 수용으로 고치고, **A-7**(JSON 왕복 anchor)을 신설했다.
⇒ **§8의 E-1(결과뷰 레벨 anchor)은 사변이 아니었다** — 단위 anchor가 구조적으로 못 보는 층을 지킨다.

### 🔴 정정 2 — V-1 가드 anchor 초판은 **구별력이 0이었다**

파트 0 게이트를 제거하는 뮤테이션(M-2)에 **anchor가 통과했다.** 원인은 fixture가
`contractTotalPrice = settlement.apportionedTransfer = 420,000,000`으로 **기대값과 뮤테이션 결과가 우연히 일치**한 것.
⇒ 폼 양도가액을 `999,000,000`, 폼 양도일을 `2026-03-02`로 **분리**해 재측정(M-2b) → 정확히 1건 RED 확인.

> 교훈: 「anchor를 썼다」가 아니라 **「뮤테이션이 그 anchor를 울리는가」**를 재야 한다.

### 정정 3 — 3-a/3-b 분리는 불필요했다

§11이 양도가액·양도일을 2단계로 나눈 근거는 「양도일 파급이 넓다」였다. 그러나 **단계 2 실측에서
`transferDate` 안전망도 0건**으로 나왔고(기존 테스트 실패 0), 두 값이 **같은 지역변수 하나**를 공유해
원자적으로 처리하는 편이 오히려 안전했다. A-2·A-6가 이미 파급을 고정한다.

### 구현 결과

| 항목 | 값 |
|---|---|
| 신규 leaf | `components/calc/results/transfer/receive-only-display.ts` |
| 적용 지점 | A `FilingFormTableHelpers` · B `DetailedStatementHelpers` · C `TransferTaxResultView:253-254` |
| anchor | 단위 **11건**(A-1~A-7 + G-1~G-3 + V1) · E2E **1건**(E-1) |
| 뮤테이션 구별력 | M-1(leaf no-op) → 6건 RED · M-2b(파트 0 게이트 제거) → V1 1건 RED · M-3(string 경로 제거) → A-7 1건 RED |
| 회귀 | 전체 vitest 통과 · tsc 0 · lint 0 errors |

리팩터 1건: 지점 A의 leaf 호출을 `rawTotalPrice` 산출 **뒤로** 옮겨 fallback 식 중복을 제거했다
(지분 안분 분기를 leaf의 fallback 인자로 넘겨 종전 동작을 그대로 보존).

