# 비주택→주택 용도변경 × 상속 취득 — C-21 차단 범위 정정 계획서

> **상태**: ✅ **구현 완료** (2026-08-05) — Phase 0·A·B·D 완주. **Phase C는 불요로 판명**(§7 ⑤).
> ~~종전 표기: Plan (Do 미착수) · 작성 2026-08-05~~
> **선행**: [`non-housing-to-housing-conversion.plan.md`](non-housing-to-housing-conversion.plan.md) §11 R-C · C-21
> **세목**: 양도소득세 — 「소득세법」 §95⑤ · 「소득세법 시행령」 §154⑤ 단서 · §154⑧3호

---

## 1. 한 줄 요약

**C-21이 「상속」을 통째로 차단하고 있는데, 그 차단 근거인 R-C 경합은 상속 경로에서 구조적으로 발생할 수 없다.** 차단 조건을 `상속·증여·이월과세` → `증여·이월과세`로 좁히고, 완화가 여는 통산 결함을 같은 PR에서 막는다.

---

## 2. 배경 — R-C는 「예규 대기」가 아니라 「범위 오설정」이었다

선행 계획서 §11은 R-C를 이렇게 적었다:

> **R-C** | §154⑧3호 ↔ §154⑤ 경합 | 명문 없음 → **C-21 차단**. **해소 시 최우선 확장 대상**(상속 오피스텔의 주거용 전환은 실무 빈발)

2026-08-05 코드·조문 실측 결과 **이 서술은 두 곳이 틀렸다**.

### 2.1 장특공제는 §154⑧3호와 무관하다

§154⑧3호는 §154①의 **비과세 요건 판정**(보유 2년·3년, 조정대상지역 거주 2년) 전용이다. 장기보유특별공제 보유기간에는 적용되지 않는다 — 상속 부동산은 **취득가액 = 상속개시 당시 시가**, **장특공제 보유기간 = 상속개시일 기산**이다.

코드는 이미 정합하다:

| 근거 | 내용 |
|---|---|
| `transfer-tax-lthd-start.ts:12-27` | `resolveLTHDStartDate`가 `decedentCohabitationHoldingStartDate`를 **보지 않는다**. `acquisitionDate`(상속개시일) 사용 |
| `transfer-tax-exemption.ts:354` | 주석 명시 — "단 LTHD(`resolveLTHDStartDate`)·단기세율(`decedentAcquisitionDate`)에는 적용하지 않는다" |
| `transfer-tax-exemption.ts:297-298` | 사전법령해석재산 2021-202 인용 — "통산은 표2 **대상 판정** 한정, 공제율은 상속개시일 기산" |

⇒ **경합의 영향 범위는 「비과세 성립 여부」 하나**다. 그것만으로 0원이냐 아니냐가 갈리므로 쟁점 자체는 남는다.

### 2.2 「상속받은 **주택**」 전제가 경합 창을 닫는다

§154⑧3호 법문(법제처 현행, 2026-07-01 시행):

> ⑧제1항에 따른 거주기간 또는 보유기간을 계산할 때 다음 각 호의 기간을 통산한다.
> 3. **상속받은 주택**으로서 상속인과 피상속인이 상속개시 당시 동일세대인 경우에는 상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간

「상속받은 **주택**」이므로 **상속개시 당시 주택**이어야 한다. 그러면 용도변경 시점에 따라 둘로 갈린다.

| | 용도변경 시점 | §154⑧3호 | §154⑤ 단서 | 경합 |
|---|---|---|---|---|
| **①** | **피상속인**이 전환한 뒤 사망 | ✅ 적용 | ✅ 적용 | 🔴 **진짜 경합** |
| **②** | 상속개시 당시 비주택 → **상속인**이 전환 | ❌ 미적용 | ✅ 적용 | ✅ **없음** |

### 2.3 ①은 **입력 자체가 불가능**하다

용도변경일이 취득일보다 뒤여야 한다는 게이트가 **이중으로** 걸려 있다.

| 층 | 근거 | 조건 |
|---|---|---|
| validate | `transfer-tax-validate-usage-conversion.ts:37-39` | `start <= asset.acquisitionDate` → 차단 |
| 엔진 | `usage-period-info.ts:41` | `changeMs <= acqMs` → `null` → `transfer-tax-lthd.ts:167-178` `TaxCalculationError` |

그리고 상속의 `acquisitionDate`는 **상속개시일**이다:

- 피상속인 취득일은 `decedentAcquisitionDate`로 **별도 필드**
- UI 라벨이 직접 말한다 — `CommercialInheritanceStdPriceSection.tsx:95` `timePointLabel="취득당시(상속개시일)"`
- `resolveAcquisitionOverride`(`transfer-tax-acquisition-override.ts:82-95`)는 **가격만** 바꾸고 날짜는 건드리지 않는다

⇒ **토글 ON + 상속이면 언제나 「상속개시 당시 비주택」 = ②**. ①은 폼으로도 엔진 단독 호출로도 만들 수 없다.

> **결론**: C-21의 상속 차단은 **경합이 없는 ②만 막고 있다**. 선행 계획서가 "실무 빈발"이라 꼽은 상속 오피스텔·상가의 주거용 전환이 바로 ②다.

---

## 3. 그런데 그냥 풀면 새 결함이 열린다

`consolidateResidenceMonths`(`transfer-tax-exemption.ts:276-291`)의 게이트:

```ts
if (opts.acquisitionCause === "inheritance" && opts.decedentSameHouseholdBeforeInheritance === true) {
  return residencePeriodMonths + (opts.decedentCohabitationResidenceMonths ?? 0);
}
```

**「상속개시 당시 주택」 조건이 없다.** 그리고 이 값이 §95⑤ 용도변경 분기에서 **표2 대상 판정**(거주 2년)에 쓰인다(`transfer-tax-lthd.ts:146`).

⇒ C-21을 그냥 풀면 **상속개시 당시 상가였던 자산에도 피상속인 동일세대 거주기간이 통산**되어 표2 대상 판정이 부당하게 통과한다. 납세자에게 유리한 방향이지만 §154⑧3호 문언에 근거가 없다 — 「명문 부재 = 유리」는 **불리한 적용을 막는 원칙**이지 **없는 혜택을 만드는 근거가 아니다**.

---

## 4. 무엇을 바꾸나

### D-1. 통산 게이트 — 용도변경이면 §154⑧3호 배제

`resolveExemptionResidenceMonths`(`transfer-tax-exemption.ts:301-303`)에서 판정한다.

```ts
export function resolveExemptionResidenceMonths(input: ResidenceReqInput): number {
  // §154⑧3호는 "상속받은 **주택**" 전제 — 용도변경 토글이 켜졌다는 것은 취득(상속개시) 당시
  // 비주택이었다는 뜻이므로(C-8이 용도변경일 > 취득일을 강제) 통산 요건이 성립하지 않는다.
  if (input.nonHousingToHousingConversion) return input.residencePeriodMonths;
  return consolidateResidenceMonths(input.residencePeriodMonths, input);
}
```

**왜 `consolidateResidenceMonths`가 아니라 여기인가** — memory `feedback_shared_predicate_argument_parity`(술어 공유 ≠ 단일 소스, 인자 동일성까지) + 선행 계획서 교훈("공유 술어는 인자 파라미터화보다 **함수 내부 도출**"). 대안 비교는 §6.

`ResidenceReqInput`은 **이미 `nonHousingToHousingConversion`을 포함**한다(`transfer-tax-exemption.ts:119-133`) → **Pick 목록 변경 없음** ⇒ Pick 개수 계약 가드도 손대지 않는다.

### D-2. C-21 차단 조건 축소

`transfer-tax-validate-usage-conversion.ts:61-68`

```diff
-  // C-21 — §154⑧3호 상속 통산·§97의2 이월과세와의 우선순위에 명문이 없다.
+  // C-21 — §97의2 이월과세와의 우선순위에 명문이 없다.
+  //   상속은 제외한다 — C-8(37행)이 용도변경일 > 취득일(=상속개시일)을 강제하므로
+  //   토글 ON인 상속은 언제나 「상속개시 당시 비주택」이고, §154⑧3호는 "상속받은 **주택**"
+  //   전제라 적용 요건이 성립하지 않는다(계획 §2.3). 통산 배제는 D-1이 담당한다.
   if (
-    asset.acquisitionCause === "inheritance" ||
     asset.acquisitionCause === "gift" ||
     asset.acquisitionCause === "carryover_gift"
   ) {
-    return unsupported("상속·증여로 취득한 자산입니다.");
+    return unsupported("증여로 취득한 자산입니다.");
   }
```

### D-3. 엔진 단독 호출 방어 — 순서 주석 정정

`transfer-tax-exemption.ts:360-363`의 주석이 "두 사유가 동시에 성립하는 조합은 명문이 없어 validation이 차단한다(C-21)"라고 적고 있다. **전제가 바뀌므로 정정**한다 — 상속은 더 이상 차단 대상이 아니고, 용도변경 우선 순서의 근거는 "§154⑧3호 요건 불성립"이 된다.

⚠️ **코드 동작은 바뀌지 않는다**(용도변경 우선 유지). 근거만 「명문 없음 + 차단」에서 「요건 불성립」으로 강해진다.

---

## 5. 케이스 매트릭스

| # | 조건 | 기대 |
|---|---|---|
| **I-1** | 상속 + 토글 ON + 동일세대 상속 **아님** | 정상 계산. 통산 원래 없음 → 회귀 0 |
| **I-2** | 상속 + 토글 ON + 동일세대 상속 + 상속인 실거주 **2년 이상** | 정상 계산. 표2 대상 **성립**(실거주만으로 충족) |
| **I-3** | 상속 + 토글 ON + 동일세대 상속 + 상속인 실거주 **2년 미만** + 피상속인 통산분으로 2년 초과 | **표2 대상 탈락** ← D-1 핵심. 종전 로직이면 부당 통과 |
| **I-4** | 상속 + 토글 ON + 비과세 거주요건(조정지역 2년) 판정 | 통산 배제 반영(`meetsOneHouseResidenceRequirement` `:325`) |
| **I-5** | 상속 + 토글 ON + §154① 단서 각호(`resolveExemptionProviso` `:202`) | 통산 배제 반영 — 단서 거주요건도 "제1항에 따른 거주기간" |
| **I-6** | 상속 + 토글 **OFF** + 동일세대 상속 | **통산 유지** — 기존 anchor 3종 회귀 0 |
| **I-7** | 상속 + 토글 ON + 용도변경일 ≤ 상속개시일 | **차단 유지**(C-8) — ① 진입 불가 재확인 |
| **I-8** | **증여** + 토글 ON | **차단 유지**(D-2) |
| **I-9** | **이월과세** + 토글 ON | **차단 유지**(D-2) — §6.2 참조 |
| **I-10** | 겸용주택 + 상속 + 동일세대 | **통산 유지** — 겸용 경로는 용도변경을 다루지 않음(§6.1) |

---

## 6. 설계 결정

### 6.1 게이트 위치 — `resolveExemptionResidenceMonths` (채택)

| 안 | 내용 | 판정 |
|---|---|---|
| (a) | `consolidateResidenceMonths` opts에 conversion 플래그 추가 | ❌ **기각** — 호출부 6곳이 각자 올바로 넘겨야 한다. 겸용주택 어댑터(`transfer-tax-api-mixed-use.ts:172`)까지 포함되어 인자 동일성 깨질 여지가 크다 |
| **(b)** | `resolveExemptionResidenceMonths`에서 **input으로부터 내부 도출** | ✅ **채택** — 호출부가 값을 고를 여지가 없다. `ResidenceReqInput`이 이미 필드를 갖고 있어 시그니처 변경 없음 |

**(b)의 사각지대와 그 해소** — 겸용주택 어댑터는 `consolidateResidenceMonths`를 **직접** 호출하므로 D-1 게이트를 우회한다. 그러나 실측 결과 **겸용 경로에는 `nonHousingToHousingConversion`이 애초에 전달되지 않는다**:

```
grep -n "nonHousingToHousingConversion" lib/tax-engine/transfer-tax-mixed-use*.ts lib/calc/transfer-tax-api-mixed-use.ts
→ 결과 없음
```

게다가 겸용주택 + 용도변경 토글은 **C-14가 차단**한다(`transfer-tax-validate-usage-conversion.ts:45-49`). ⇒ 우회 경로 자체가 존재하지 않는다. **I-10으로 고정**한다.

### 6.2 증여·이월과세는 차단 유지 — 근거가 다르다

| 취득원인 | 판정 | 근거 |
|---|---|---|
| **이월과세** | ✅ **차단 정당** | 엔진 STEP 0.475(`transfer-tax.ts:129-139`)가 이월과세 채택 시 `workingInput`을 **증여자 취득일 기준으로 교체**한다. 그러면 `calcUsagePeriodInfo`가 보는 취득일이 증여자 취득일이라 **용도변경이 증여자 단계에서 일어난 경우가 게이트를 통과한다** → §97의2와 §154⑤ 단서의 우선순위 문제가 **실제로 발생**. R-C의 진짜 미결은 여기다 |
| **단순 증여** | 🟡 **근거 미상 — 유지** | C-21 주석이 든 근거(§154⑧3호·§97의2)가 **둘 다 해당하지 않는다**. 증여의 `donorAcquisitionDate`는 `transfer-tax-rate-calc.ts:347`에서 **단기세율 기산일**로만 쓰여 §154⑤ 보유기간 축과 겹치지 않는다. 다른 차단 사유가 있는지 확인하지 못했다 ⇒ **안전측으로 차단 유지**, 별건으로 규명 |

⚠️ 차단 유지는 "불리한 적용"이 아니라 **계산 거부**다. 근거 없이 계산을 여는 쪽이 위험하다.

### 6.3 validate ↔ 엔진 이중 방어 유지

D-2는 validation만 푼다. 엔진의 C-8 등가 가드(`usage-period-info.ts:41`)는 **그대로 둔다** — 엔진 단독 호출(단위 테스트·자산별 직접 호출)은 validation을 거치지 않는다(선행 계획서 design I-15).

---

## 7. 14 동기화 지점 영향

**신규 입력 필드 없음** ⇒ ①~⑭ 대부분 무영향. 실제로 손대는 것은 ⑧뿐이다.

| 지점 | 영향 |
|---|---|
| ①폼 ②initial ③normalize | 없음 — 기존 `acquisitionCause`·`hasNonHousingConversion`·`decedentCohabitation*` 재사용 |
| ④API 변환 | 없음 — `transfer-tax-api-residence.ts:41-43` 등이 이미 필드를 넘긴다 |
| ⑤UI 위젯 | ✅ **변경 없음**(실측 완료) — 토글은 `assetKind === "housing" && isFirst`만 보고 `acquisitionCause`를 **전혀 보지 않는다**(`AssetSectionBasic.tsx:173-180` · `AssetSectionAcquisition.tsx:296-302`). 상속을 골라도 이미 노출된다 |
| ⑥사이드바 ⑦결과 카드 | 없음 |
| **⑧validation** | **변경** — D-2 |
| ⑨~⑭ Zod·route | 없음 — enum·필드 불변 |

> ⑤ 실측 결과 **UI 게이트 해제가 불필요**하다 ⇒ **Phase C 삭제**. 종전에는 토글이 노출돼도 validate가 막았으므로, C-21만 풀면 그대로 열린다.
>
> ⚠️ 다만 상속 자산에는 **기존 필수 필드**가 하나 더 있다 — `decedentAcquisitionDate`(피상속인 취득일, `transfer-tax-validate-asset.ts:557`). 용도변경과 무관한 종전 요구지만, C-21 차단이 풀리면서 **처음으로 드러난다**. I-1 테스트가 이를 고정한다.

---

## 8. 테스트 계획

### 8.1 신규

| 파일 | 케이스 |
|---|---|
| `__tests__/calc/usage-conversion-validate.test.ts` | I-8·I-9 차단 유지 + **I-1 상속 통과**(기존 67행 케이스를 통과 기대로 전환) |
| `__tests__/tax-engine/transfer/non-housing-to-housing-conversion.engine.test.ts` | **I-3**(통산 배제로 표2 탈락) · I-2 · I-4 · I-5 |

**I-3가 이 PR의 핵심 anchor**다 — 통산 배제가 실제로 세액을 바꾸는 유일한 케이스이므로, 이것이 없으면 D-1이 no-op이어도 초록이 된다.

### 8.2 회귀 보호 (I-6·I-10)

기존 anchor 3종이 **토글 OFF 상속의 통산**을 고정하고 있다. 전건 통과가 조건이다.

- `__tests__/tax-engine/transfer/inherited-self-transfer-154-8-3.anchor.test.ts`
- `__tests__/tax-engine/transfer/inherited-cohabitation-residence-table2.anchor.test.ts`
- `__tests__/tax-engine/transfer/mixed-use-inherited-cohabitation-table2.anchor.test.ts`

### 8.3 게이트

`npm run test:transfer` 전건 + `npx tsc --noEmit` 0 + `npm run lint` 0 error.

---

## 9. 리스크

| # | 항목 | 대응 |
|---|---|---|
| **R-1** | **D-1이 상속 외 경로의 통산까지 끄면 회귀** — `resolveExemptionResidenceMonths`는 비과세 거주요건·단서 각호·표2 대상 판정 **5곳**에서 쓰인다 | 게이트 조건이 `nonHousingToHousingConversion` 존재 여부뿐이라 토글 OFF 경로는 불변. I-6 anchor 3종이 고정 |
| ~~R-2~~ | ✅ **해소** — ⑤ UI 노출 실측 완료 | 토글이 `acquisitionCause`를 보지 않아 **UI 변경 불요**(§7) ⇒ Phase C 삭제 |
| **R-3** | 단순 증여 차단 근거 미상(§6.2) | 이번 범위 밖. 차단 유지라 세액 영향 없음 |
| **R-4** | 이월과세의 validate↔엔진 **비교 기준 불일치** — validate는 폼의 수증자 취득일과, 엔진은 치환된 증여자 취득일과 비교한다 | 이번 범위 밖(차단 유지로 도달 불가). 이월과세를 열 때 **선결 과제**로 인계 |

---

## 10. 범위 밖 (인계)

- **이월과세 개방** — R-C의 진짜 미결. §97의2 ↔ §154⑤ 우선순위 예규 필요 + R-4 선결
- **단순 증여 차단 근거 규명** — §6.2
- **V-4** — 표2 거주 "(보유기간 3년 이상에 한정함)"의 지시 대상. 8%p 차이. 이번 변경과 직교

---

## 11. Phase

| Phase | 내용 | verify |
|---|---|---|
| **0** ✅ | ⑤ UI 노출 실측 + I-3 anchor **선작성**(현행 엔진에서 **실패** 확인) | **충족** — I-3만 실패(`residencePct: 4`·`table1Pct: 8`으로 통산이 표2 대상을 통과시킨 흔적), I-1·I-2·I-6은 현행에서도 통과해 회귀 기준선 확보 |
| **A** ✅ | D-1 통산 게이트 | I-3 통과 · 상속 anchor 3종 **19테스트 회귀 0** |
| **B** ✅ | D-2 validate 축소 + D-3 주석 정정 | `usage-conversion-validate.test.ts` **18/18** |
| ~~C~~ | ~~UI 게이트 해제~~ | **삭제** — ⑤ 실측 결과 불요(§7) |
| **D** ✅ | 전건 회귀 | **480파일 5,442테스트** 통과 · tsc 0 · lint 0 error |

**Phase 0의 anchor 선작성이 이 계획의 안전장치다** — D-1이 no-op이어도 통과하는 테스트를 쓰면 검증이 아무것도 못 한다(memory `feedback_pre_anchor_verification`).

---

## 12. 검증 상태

이 계획서의 인용은 **전부 실측**이다(2026-08-05, master `8a737987` 기준).

| 검증 항목 | 방법 |
|---|---|
| §154⑤ 단서 · §154⑧3호 법문 | KoreanLaw MCP `get_law_text(mst=286211, jo=제154조)` — 2026-07-01 시행본 |
| 이중 게이트(C-8) | `transfer-tax-validate-usage-conversion.ts:37` · `usage-period-info.ts:41` 원문 확인 |
| 상속 `acquisitionDate` = 상속개시일 | `CommercialInheritanceStdPriceSection.tsx:95` UI 라벨 · `decedentAcquisitionDate` 별도 필드 존재 |
| LTHD 통산 미적용 | `transfer-tax-lthd-start.ts:12-27` 전문 확인 |
| 겸용 경로 용도변경 미전달 | grep 결과 0건 |
| `ResidenceReqInput`에 conversion 포함 | `transfer-tax-exemption.ts:119-133` |

**미확인으로 남긴 것**: 단순 증여 차단 근거(§6.2) — 별건으로 인계.

**Do 단계에서 추가 확인한 것**:

| 항목 | 결과 |
|---|---|
| ⑤ UI 토글 노출 | `AssetSectionBasic.tsx:173-180` — `acquisitionCause` 미참조 ⇒ 변경 불요 |
| Phase 0 anchor 실패 | I-3 단독 실패, 메시지가 예상 갭과 일치 |
| 상속 고유 필수 필드 | `decedentAcquisitionDate`(`transfer-tax-validate-asset.ts:557`) — 종전 요구가 차단 해제로 드러남. I-1이 고정 |
