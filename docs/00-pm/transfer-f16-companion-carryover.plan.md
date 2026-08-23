# F16 — 컴패니언 자산 이월과세(§97의2) ⑫ 부재 · 작업 계획


> ✅ **2026-08-23 갱신 — Q-3(D-6) 해소됨.** `8cef41cc`로 ⑭ `engine-input.ts`의
> `donorRelation`·`donorDeceased` 침묵 strip을 수정했다(= 리뷰 F15). 2필드 추가가 아니라
> **열거 자체를 spread로 교체**해 같은 결함의 재발을 구조적으로 막았고, anchor 7건(구별력 5 red)을
> 심었다. 실측 22,450,000 과대 해소(시나리오 의존 — 계획서 축 C의 106,722,000은 다른 픽스처 값).
> ⚠️ 이 수정은 **단건 경로 전용**이다 — 컴패니언(⑫⑭)은 여전히 결함 상태이며 Q-1이 남아 있다.
> 아래 D-6 서술은 착수 시점 기록으로 보존한다.

> 대상: [`transfer-review-2026-08-open-items.plan.md`](transfer-review-2026-08-open-items.plan.md) **F16**
> 기준 커밋: `5d14dbdc` (worktree `transfer-code-review`) · 실측일 **2026-08-23**
> 본 문서의 모든 file:line·수치는 위 커밋에서 **파일을 열어 확인**했거나 **route POST 실행**으로 측정한 값이다.
> 미확인 항목은 §8 V-레지스터에 「확인 필요」로 분리했다. 소스 코드 변경 **0건**(probe는 삭제 완료).
>
> **적대적 자가검토 1회차 반영 완료 (2026-08-23)** — 인용 전수 재검증 + 독립 재현.
> 재현된 수치(별도 probe, 삭제 완료): **P-d**(companion `acq 0` / `gain 514,285,714` / `det 180,059,999` ·
> `carryoverTaxation` 유무 **`JSON.stringify` 완전 일치**) · **P-a**(primary `tp 1,285,714,286` / `acq 0` /
> `gain 985,714,286` / `ne 300,000,000` · `adoptedScenario "B"` · `scenarioB.acquisitionPrice 300,000,000`) ·
> **D-2**(`gift`→`2005-01-01T00:00:00.000Z` / `carryover_gift`→`undefined`, `carryoverTaxation`도 `undefined`) ·
> **D-5**(payload `standardPriceAtTransfer` 600,000,000 → **222,222,222** · `standardPriceAtAcquisition` 111,111,111 ·
> `useEstimatedAcquisition` true). **전부 일치**. 정정 내역은 §11.

---

## 0. 한 줄 결론

미결 문서가 (a)의 유일한 장애물로 적은 **「스케일 충돌」은 재현되지 않았고**(3개 독립 픽스처),
대신 문서에 없던 결함 **5건**이 추가로 실측됐다. 결함의 크기는 「취득가액 0」 하나가 아니다.
**권고는 (b) 즉시 차단 + (a)를 별도 트랙으로 분리**다 — 근거는 §5, 반대 논거도 §5에 함께 적었다.
**최종 선택은 사용자 결정 사항**이다(§9 Q-1).

---

## 1. 전제 재검증 — 미결 문서의 서술 중 **뒤집힌 것**

F35에서 「4열이 법정 서식」이라는 전제 자체가 틀렸던 전례가 있어 이 절을 맨 앞에 둔다.

| # | 미결 문서 F16의 서술 | 재검증 결과 | 근거 |
|---|---|---|---|
| **P-1** | (a)의 위험: 「일괄 route가 `transferPrice`를 안분값으로 덮은 상태에서 §97의2② 비교과세가 돌면 부담부증여와 **같은 클래스**의 스케일 충돌」 | 🔴 **뒤집힘.** 같은 클래스가 아니다. STEP 0.475는 `transferPrice`를 **교체하지 않는다**(`acquisitionPrice`·`acquisitionDate`·`capitalExpenditure`만). 부담부증여 STEP 0.48은 안분 `transferPrice`를 **무시하고 인수채무액**으로 gain을 재산정해 축이 둘로 갈리는 것이 원인이다. | `lib/tax-engine/transfer-tax.ts:129-150` · 본 계획 실측 P-a/P-b(§3) · 축 B 스윕(안분값 500,000,000↔400,000,000에서 오차 **불변**) · 축 C R2(안분 1,080,000,000에서 필요경비 **양수**) |
| **P-2** | (a)의 작업량: 「⑫스키마 + ⑭매핑 + **④취득가액 3계층**」 | 🔴 **뒤집힘.** ④는 **이미 emit한다**. `buildAssetPayload`가 컴패니언에도 `buildCarryoverPayload`를 호출해 `carryoverTaxation` + `topLevelOverrides`를 싣는다. 결손은 정확히 **⑩·⑫·⑭ 세 곳**이다. | `lib/calc/transfer-tax-api-helpers.ts:680-689`(`const cp = buildCarryoverPayload(asset, transferDate)` … `...cp.topLevelOverrides`) |
| **P-3** | 결함 = 「컴패니언 이월과세 **취득가액이 0으로 떨어진다**」(단일 결함) | 🔴 **과소 서술.** 같은 축에서 **6건**이 나왔다(§2). 특히 ⑭는 `carryoverTaxation`뿐 아니라 `donorAcquisitionDate`도 버리고, ④의 스프레드가 **§166⑥ 안분 키를 덮어쓴다**. | §2 표 |
| **P-4** | (b)의 장애물이 F41 `i > 0` 선례로 해소됐다 | ✅ **유지 + 보강.** F41 루프 실재 확인(`transfer-tax-validate.ts:171-178`, `if (!isGbFractional)` 가드 `:170` 안). 더 강한 선례도 있다 — **다건 경로가 이미 축자적으로 차단**한다: `lib/calc/multi-transfer-tax-validate.ts:66-68` 「배우자등 이월과세(§97의2)는 단건 계산기에서만 지원됩니다.」 | 위 2파일 |
| **P-5** | (도달성은 미기재) | 🆕 **도달성 확정.** 입력 UI가 없어 no-op인 것이 아니다. 컴패니언 취득원인 라디오에 「이월과세(증여)」가 **게이트 없이** 있고, ⑧은 오히려 그 폼을 **필수 입력으로 강제**한다. 사용자는 필드별 오류 안내를 받으며 끝까지 채운 뒤 조용히 틀린 세액을 받는다. | `components/calc/transfer/CompanionAcquisitionCauseSection.tsx:27-33,304-310` · `CompanionAssetsSection.tsx:78` · `CompanionAssetCard.tsx:366` · `asset-sections/AssetSectionAcquisition.tsx:170` · `lib/calc/transfer-tax-validate-asset.ts:181-268`(호출 `transfer-tax-validate.ts:191`이 **전 자산** 순회) |
| **P-6** | (법령 판단 미기재) | 🆕 **§97의2①은 자산 단위 규정**이고 「주된 자산 전용」·「일괄양도 제외」 문언이 본문·각 호·②의 배제사유 어디에도 없다. ⇒ (b)는 법 해석이 아니라 **도구 한계 고지**로만 성립한다. | KoreanLaw MCP `get_law_text(mst=280405, jo=제97조의2)` — ①「…증여받은 제94조제1항제1호 및 제3호에 따른 **자산**이나 그 밖에 대통령령으로 정하는 자산의 **양도차익을 계산할 때** 양도가액에서 공제할 필요경비는…」 |

> ⚠️ **축 C가 인용한 「Wave 2가 `engine-input.ts`의 `donorRelation` strip을 고쳤다」는 사실이 아니다.**
> `git log --all -S "donorRelation" -- app/api/calc/transfer/engine-input.ts` → **0 커밋**. 그 문자열은 이 파일에 존재한 적이 없다.
> 즉 D-6(§2)은 **한 번도 고쳐진 적 없는** 현행 결함이다.

---

## 2. 결함의 실제 크기 — 6건

「취득가액 0」은 이 중 D-1 하나다. D-1~D-3·D-5는 **「컴패니언이 `carryover_gift`로 일괄에 진입」이 공통 전제**라 하나의 조치로 함께 닫힌다. D-4·D-6은 **전제가 달라 별건**이다.

| ID | 결함 | 지점 | 재현 입력 → 관측값 | 출처 |
|---|---|---|---|---|
| **D-1** | ⑫ `companionAssetSchema`에 `carryoverTaxation` 부재 → **400이 아니라 200 + 침묵 strip**. 컴패니언 취득가액 **0**. | `lib/api/transfer-tax-schema-sub.ts:286-427`(grep `carryover` → **:359 enum 1건뿐**) | **본 계획 P-d**: 컴패니언 `carryover_gift`(증여자 취득가 100,000,000·증여세 30,000,000·증여 당시 평가액 300,000,000), 총 1,800,000,000 apportioned → `acq **0** / gain 514,285,714 / 결정세액 180,059,999`. `carryoverTaxation`을 body에 **넣은 응답과 넣지 않은 응답이 `JSON.stringify` 완전 일치**. | 본 계획 실측 + 축 A N3 + 축 C R1 |
| **D-2** | ⑭도 `donorAcquisitionDate`를 버린다 — 게이트가 `c.acquisitionCause === "gift"` **하나뿐**. ⇒ §104②2호 보유기간 소급(`transfer-rate-holding-basis.ts:62`는 **`carryover_gift`에서만** 이 값을 쓴다)이 컴패니언에서 영영 발화하지 않는다. **쓰이지 않는 경우에만 싣고, 쓰이는 경우에 버린다.** | `app/api/calc/transfer/bundled-split-helpers.ts:226-228` | 축 A N4: 동일 객체를 `gift`로 주면 `2005-01-01T00:00:00.000Z`, `carryover_gift`로 주면 **`undefined`**. ④는 두 경우 모두 싣는다(`transfer-tax-api-helpers.ts:673-679`에 `carryover_gift` 분기 실재) · ⑫도 통과시킨다. **⑭ 단독 소실**. | 축 A |
| **D-3** | ⑩ 컴패니언 superRefine에 `carryover_gift` arm 부재(`purchase`/`gift`/`inheritance` 셋뿐). ⇒ `carryover_gift`는 **취득가액 0으로 엔진에 도달할 수 있는 유일한 컴패니언 취득원인**이다. | `lib/api/transfer-tax-schema.ts:599-661` | sibling 대조(축 A Q3): 취득가액 없는 `gift` 컴패니언은 ⑧(`"자산 2: 증여 신고가액을 입력하세요."`)·⑫(`{"companionAssets":["증여 자산은 신고가액(취득가액) 필수"]}`) **양쪽에서** 막힌다. | 축 A |
| **D-5** | ④ 스프레드가 **§166⑥ 안분 키를 덮어쓴다**. `standardPriceAtTransfer:`(`:607`)·`standardPriceAtAcquisition:`(`:611`)·`useEstimatedAcquisition:`(`:652`)보다 `...cp.topLevelOverrides`(`:687`)가 **뒤**에 있어 spread가 이긴다. **이 3필드는 ⑫에 있어 Zod를 통과하고 ⑭가 엔진까지 싣는다 — 오늘 실제로 도달한다.**<br>🔑 **근본 원인은 순서가 아니라 `standardPriceAtTransfer`의 역할이 컴패니언에서만 둘이라는 것**이다 — §166⑥ **안분 키**이자 §97①1호나목 **환산 분모**. 엔진 환산은 최상위 값을 읽는다(`transfer-tax-carryover.ts:254-258`). ⇒ A-8은 **순서 조정이 아니다**(V-10). | `lib/calc/transfer-tax-api-helpers.ts:607·611·652 vs :687` · 생성부 `lib/calc/transfer-tax-api-carryover.ts:58-65` | 축 A P4/Q2 + **본 검토 재현**: 이월과세 `general` 환산 모드에서 사용자가 입력한 컴패니언 양도시 기준시가 600,000,000이 payload에서 **222,222,222**(증여자 양도시 기준시가)로 치환. `standardPriceAtAcquisition`=111,111,111·`useEstimatedAcquisition`=true 동반 주입. ⑧은 `[]`, ⑫ success=true. **세액 크기 미측정 → V-2**. | 축 A · 본 검토 |
| **D-4** | 🆕 **F16과 전제가 다른 별건 — aggregate 표시 계층의 취득가액/필요경비 열 배분 드리프트.** `effectiveAcquisitionPrice = r.singleInput.acquisitionPrice`(STEP 0.475 **이전**)인데 `r.result.transferGain`은 **이후** 값이라, `NE = 양도가 − 취득가 − 양도차익` 역산이 채택 시나리오와 어긋난다. | `lib/tax-engine/transfer-tax-aggregate.ts:486-497` | **본 계획 P-a**(primary `carryover_gift` × 함께양도 — ⑧에 차단 항목이 없어 **오늘 도달한다**): 안분 양도가 1,285,714,286 / **취득가액 0** / 양도차익 985,714,286 / **필요경비 300,000,000**. 실제로는 300,000,000이 채택 시나리오(B) 취득가액이다. P-b(같은 케이스에 `acquisitionPrice: 300,000,000` 주입) → `취득가 300,000,000 / NE 0`으로 **자기일관**. ⇒ 드리프트 = `acqInput − 채택취득가`. | 본 계획 실측(§3) |
| **D-6** | 🆕 **단건 경로 별건 — ⑭ `engine-input.ts`가 `donorRelation`·`donorDeceased`를 침묵 strip.** ④(`transfer-tax-api-carryover.ts:77-78`)가 싣고 ⑫(`transfer-tax-schema.ts:363-364`)가 통과시키고 ⑧(`transfer-tax-validate-asset.ts:203,212`)이 검증하는데 ⑭에서만 사라진다. GB 경로(`app/api/calc/transfer/general-building-route-cards.ts:150-152·158-160` + `carryoverTaxationEngineShape`에 두 필드 **있음** `lib/api/transfer-tax-building-schemas.ts:34-35`)는 정상 — **단건만**이다. | `app/api/calc/transfer/engine-input.ts:85-96`(8키 매핑 `:87-94`, 두 필드 없음 — grep `donorRelation` **0 히트**) | 축 C C2: 배우자+사망 선언 케이스에서 현행 결정세액 363,561,000(배제 미적용·`eligible=true`) vs 정상 전달 256,839,000(`exclusionReason=relation_invalid`) → **106,722,000 과대**. ⚠️ **본 계획에서 재현하지 않았다**(축 C 인용) → V-9. | 축 C |

### 2.1 사용자에게 보이는 형태

- D-1: **오류가 뜨지 않는다.** ⑫가 200으로 통과시키므로 화면에는 입력값이 그대로 남고 세액만 틀리다.
- D-1 + ⑧: `collectStepIssues(0, form)` 실측(축 A Q1) — 자산2 `carryover_gift`에서 `"자산 2: 증여 등기접수일을 입력하세요."` · `"자산 2: 증여자 취득일을 입력하세요."` · 관계·가업상속공제 차단 메시지가 모두 나온다. **채우도록 강제한 뒤 반영하지 않는다.**
- D-4: 음수가 나는 픽스처에서는 `Math.max(0, …)` clamp(`components/calc/results/transfer/FilingFormTableAggregateHelpers.ts:162` · `components/calc/results/transfer/DetailedStatementHelpers.ts:276·294`)에 가려져 **신고서 열의 산술이 맞지 않는** 형태로만 드러난다(축 B **픽스처 B-2** 실측: 양도가액 500,000,000 − 취득가액 250,000,000 − 필요경비 0 ≠ 양도차익 320,000,000 ⇒ clamp 전 NE **−70,000,000**).

> ⚠️ **축 B는 서로 다른 픽스처 두 개를 같은 이름으로 부른다** — 혼동 주의.
> **B-1**(§3 표): `acqInput` 300,000,000 · 표시 필요경비 **−170,000,000**.
> **B-2**(위): 양도가액 500,000,000 · clamp 전 NE **−70,000,000**.
> 두 값은 서로 다른 픽스처의 값이며 **본 계획은 둘 다 재현하지 않았다**(축 B 인용) — Q-2가 인용하는 「일반건물 파트 이월과세」 수치가 B-2인지도 **확인 필요**(§8 V-11).

---

## 3. 축 간 상충 해소 — 「−170,000,000」 vs 「+250,000,000」

축 B는 primary carryover × 함께양도에서 **필요경비 −170,000,000**, 축 C는 같은 경로에서 **+250,000,000(양수)** 를 보고했다. 본 계획이 직접 측정해 **둘 다 같은 하나의 메커니즘**임을 확인했다.

`transfer-tax-aggregate.ts:486-497`의 역산은 항등식이다:

```
표시 필요경비 = 안분 양도가액 − (STEP 0.475 이전) acqInput − (STEP 0.475 이후) 양도차익
             = 채택 시나리오 취득가액 + 증여세 산입액 등 − acqInput
```

| 픽스처 | `acqInput` | 관측 표시 필요경비 | 부호 |
|---|---|---|---|
| 축 B(픽스처 B-1) | 300,000,000 (= 증여 당시 평가액을 폼에 넣음) | **−170,000,000** | 음수 |
| 축 C R2 | 0 | **+250,000,000** | 양수(그러나 **필요경비가 아니라 취득가액**) |
| **본 계획 P-a** ✅재현 | 0 | **+300,000,000** (= 채택 시나리오 B 취득가액 전액, 취득가액 열은 **0**) | 양수(같은 오분류) |
| **본 계획 P-b** | 300,000,000 (= 채택 취득가액과 일치) | **0** | 정상 |

⇒ **모순이 아니다.** 부호는 픽스처의 `acqInput`이 결정한다. 그리고 실사용에서 `acqInput`은 **항상 0**이다 —
`carryover_gift`에서는 `fixedAcquisitionPrice` 입력 UI가 렌더되지 않고(`CompanionAcquisitionCauseSection.tsx:148` — `CompanionAcqPurchaseBlock`은 `purchase`에서만),
④의 `fixedAcqRaw`(`transfer-tax-api-helpers.ts:526-532`)·primary `acquisitionPrice`(`transfer-tax-api.ts:277-289`)에도 `carryover_gift` 분기가 없다.
⇒ **현실 형태는 P-a**: 신고서 취득가액 열 **0**, 필요경비 열에 취득가액 전액. 양도차익 열은 항등식상 정확하다.

> 이 절의 함의: **(a)를 열면 컴패니언도 이 표시 경로에 올라탄다.** D-4는 (a)의 **선행 조건**이지 부수 효과가 아니다.

---

## 4. 선택지

### (a) 정식 지원

| # | 파일:라인 | 내용 | 규모 |
|---|---|---|---|
| A-1 | `lib/api/transfer-tax-building-schemas.ts:24` | `carryoverTaxationEngineShape`를 `export`로 (현재 비-export) | 1줄 |
| A-2 | `lib/api/transfer-tax-schema-sub.ts:427`(스키마 말미) | `carryoverTaxation: carryoverTaxationEngineShape.optional()` + import. ⚠️ 단건 `transfer-tax-schema.ts:354-370`과 필드·타입 diff 대조 필수(GB shape의 `giftTaxAmount` 주석은 **「이미 안분된 값」**이라 의미가 다를 수 있다 → V-5) | 2줄 |
| A-3 | `lib/api/transfer-tax-schema.ts:599-661` | 컴패니언 superRefine에 `carryover_gift` arm 신설. ⑧(`transfer-tax-validate-asset.ts:181-268`)과 필수 필드 동일화(⑧↔⑩ 모순 금지) | ~25줄 |
| A-4 | `app/api/calc/transfer/bundled-split-helpers.ts:103-115` | `CompanionRawAsset`에 `carryoverTaxation` 추가(F14 선례대로 `z.infer` 재사용) | 1~13줄 |
| A-5 | `app/api/calc/transfer/bundled-split-helpers.ts:236~` | `buildCompanionEngineInputs`에 매핑 + `giftRegistryDate`·`donorAcquisitionDate` **Date 변환**(`lib/api/date-coerce.ts` — string 통과 시 비교가 침묵 false) | ~10줄 |
| A-6 | `app/api/calc/transfer/bundled-split-helpers.ts:226-228` | `donor` 게이트를 `gift | carryover_gift`로 (D-2) | 2줄 |
| A-7 | `app/api/calc/transfer/bundled-split-helpers.ts:247-248` | `useEstimatedAcquisition` 게이트의 `purchase` 한정 해제(이월과세 환산) | 2줄 |
| A-8 | `lib/calc/transfer-tax-api-helpers.ts:607·611·652 vs :687` | **D-5 정정.** 🔴 **「순서 조정」이 아니다** — 스프레드를 앞으로 옮기면 `standardPriceAtAcquisition:`(`:611`)의 명시 키가 **`purchase` 게이트라 `carryover_gift`에서 `undefined`를 산출**해 증여자 취득시 기준시가를 지우고, 엔진 환산(`transfer-tax-carryover.ts:254-258`)의 **분자가 0**이 되어 시나리오 A 취득가액이 0이 된다 — **지금보다 나쁘다**. 필요한 것은 `standardPriceAtTransfer`의 **두 역할 분리**(§166⑥ 안분 키 ↔ 환산 분모)다. 정본 sibling: primary는 이 충돌이 없어 **명시 삼항**으로 푼다(`lib/calc/transfer-tax-api.ts:330-331`·`345-346` `isCarryoverGeneral`). ⇒ 설계 선행(**V-10**) | ~5줄 **아님 — 설계 확정 후 재산정** |
| A-9 | `lib/tax-engine/transfer-tax-aggregate.ts:486-497` | **D-4 정정** — `carryoverTaxationDetail.adoptedScenario`·`scenarioA/B.acquisitionPrice`가 이미 breakdown에 실려 있어 **엔진 변경 없이** 표시 축을 채택 시나리오로 맞출 수 있다(본 검토 P-a 재현에서 `adopted "B"`·`sB 300,000,000` 응답 도달 확인) | ~5줄 |
| A-10 | `lib/calc/transfer-tax-validate.ts:76-93` | **V-1** 지분분할 × 이월과세 스케일 축 판단(차단 또는 ratio 적용) | ~5줄 또는 `transfer-tax-api-carryover.ts`에 ratio ~10줄 |
| A-11 | (선택) `lib/stores/transfer-per-asset-summary.ts:134-165` | ⑥ 사이드바 — `directAcqRaw`에 carryover 분기 없음. **단건도 없으므로 컴패니언 고유 결손이 아니다** | ~5줄 |
| A-12 | `__tests__/` | anchor 최소 3건(⑫ parse 생존 · ⑭ 도달 · route 세액 대조). 선례 `__tests__/api/transfer.route.review-2026-08-f13.test.ts` | ~300줄 |

**소계**: 프로덕션 **~50~70줄 / 6~8파일** — 단 **A-8의 규모는 V-10 설계 확정 후에만 확정된다**(위 표).
**엔진·⑤UI·⑦결과카드·⑬ 변경 0** — 이미 배선돼 있다
(`lib/tax-engine/transfer-tax.ts:129-150` STEP 0.475 · `lib/tax-engine/transfer-tax-aggregate.ts:95-109` per-item 호출 ·
`lib/tax-engine/types/transfer-aggregate.types.ts:43-52` `TransferTaxItemInput`이 `carryoverTaxation`을 Omit하지 않음 ·
`components/calc/results/BundledAllocationCard.tsx:198` → `components/calc/results/transfer/ValuationDetailCards.tsx:118-119` → `CarryoverComparisonCard`).

> ⑬ **재확인(본 검토)**: `lib/calc/transfer-tax-api.ts:693-697`이 `form.assets.slice(1).map(buildAssetPayload)`로
> **필드 열거 없이 통째로** 싣는다 ⇒ ⑬는 F16의 결손 지점이 **아니다**. (14지점 중 ④⑤⑥⑦⑧⑨⑪⑬ 무변경 · **⑩⑫⑭만 결손**.)

**위험**: 미결 문서가 든 스케일 충돌은 아니다(§1 P-1). 실제 위험은 **선행 결함 D-4·D-5**와 **미검증 V-1·V-3·V-10**이다.
⑫를 여는 순간 D-5가 「컴패니언 이월과세 환산 경로에서 §166⑥ 안분 키가 증여자 기준시가로 치환」으로 확대된다
(memory `feedback_ui_gate_expansion_activates_latent_defect` 패턴).

### (b) ⑧ 명시 차단

| # | 파일:라인 | 내용 | 규모 |
|---|---|---|---|
| B-1 | `lib/calc/transfer-tax-validate.ts` **`:178` 직후**(= `:179`의 닫는 `}` **앞**) — F41 루프 `:171-178` 바로 아래, **같은 `if (!isGbFractional)` 블록 `:170-179` 안** | `for (let i = 1; i < form.assets.length; i++)` — `acquisitionCause === "carryover_gift"`면 차단. 문구는 다건과 정합(`multi-transfer-tax-validate.ts:66-68`) + **통과 경로 지목**(아래 ⚠️3 참조) | 본문 ~8줄 + JSDoc ~15줄 |
| B-2 | `__tests__/calc/` 신규 1파일 | 선례 `__tests__/calc/companion-sales-case-single-only-review-2026-08-f41.test.ts`(202줄·`it` 5건) 복제 | ~150~200줄 |

**⚠️1 구현 위치는 `SINGLE_ONLY` 배열(`:128-137`)이 아니어야 한다.** 그 루프는 `some()`(`:139-147`)이라 **primary만 carryover인 조합**까지 막는데, 그 조합은 오늘 200이 나온다(본 계획 P-a — 단 표시 열은 D-4 드리프트를 탄다).

**⚠️2 `if (!isGbFractional)` 밖으로 내면 안 된다** — GB 지분 분할은 지분마다 `valuation.land/buildingCarryoverTaxation`을 **지원한다**(⑫: `lib/api/transfer-tax-building-schemas.ts:298·303`이 `generalBuildingValuationSchema` 안에 있고 `generalBuildingShareSchema`(`:468` 선언)가 `:482 valuation:`으로 그 스키마를 통째로 품는다). **결정적 근거는 ④에 있다**: `lib/calc/transfer-tax-api-gb-carryover.ts:123` — `landIsCarryover = asset.acquisitionCause === "carryover_gift"`. **B-1이 검사할 술어와 같은 필드**다 ⇒ 밖에 두면 GB 토지 파트 이월과세가 **실제로 죽는다**(가정 아님, 코드 사실).

**⚠️3 🆕 (본 검토 추가) 비-GB 지분분할도 이 루프에 걸린다 — 메시지가 dead-end가 되면 안 된다.** `fullFractional && !isGbFractional`이면 `form.assets[1..]`은 **함께양도 컴패니언이 아니라 같은 물건의 지분 공유자**이고, 각 지분은 자기 `acquisitionCause`를 갖는다(`transfer-tax-validate.ts:191-197` `mergePrimaryBasic` — 취득측은 companion 고유값 유지). 그 지분이 `carryover_gift`면 B-1이 막는데, 이때 「**함께 양도** 토글을 끄세요」는 **틀린 안내**다(그 사용자가 켠 것은 지분 분할 토글이다). ⇒ 문구는 F41 선례처럼 **경로를 둘 다 지목**해야 한다: 「함께 양도/지분 분할 토글을 끄고 단건으로 계산하거나, 이 자산의 취득 원인을 「증여」로 변경하세요」(memory `feedback_ui_gate_removes_sole_input_path`).
> 부수 효과: 이 차단은 **V-1의 미측정 구간(지분 × 이월과세 스케일) 중 i>0 쪽을 함께 닫는다**. primary(i=0) 지분 carryover는 여전히 차단 밖이다.

**소계**: 프로덕션 **~23줄 / 1파일**.

### 비교

| 축 | (a) 정식 지원 | (b) 명시 차단 |
|---|---|---|
| 프로덕션 규모 | ~50~70줄 / 6~8파일 (**A-8은 V-10 후 재산정**) | ~23줄 / 1파일 |
| 닫는 결함 | D-1·D-2·D-3 + (동반 수정으로) D-4·D-5 — **결함 자체를 없앤다** | D-1·D-2·D-3·D-5의 **도달 경로만** 닫는다 (전제가 모두 「컴패니언 carryover 진입」) |
| 남는 결함 | V-1·V-3·V-10 해소 전까지 미지 영역 | **D-4·D-6은 그대로**(별건) + 🆕 **⑩·⑫의 API 계약 결함(D-1·D-3)은 존속**한다 — (b)는 ⑧(클라이언트 validate)이라 **마법사를 거치지 않는 호출자**(직접 POST·향후 신규 UI 경로)에는 여전히 200 + 취득가액 0이다. F41 선례도 ⑧ 전용이었으므로 저장소 관행과는 정합하나, 「결함이 사라졌다」고 적으면 안 된다 |
| 법령 정합 | §97의2① 자산 단위 규정에 부합 | 법이 허용하는 계산을 **도구가 제공하지 못함을 고지** |
| 저장소 선례 | — | 다건 경로가 **같은 문장으로 이미 차단**(`multi-transfer-tax-validate.ts:66-68`) · 「침묵 오산보다 명시 차단」(`transfer-tax-validate.ts:112`) |
| 안전망 | 0건에서 시작 — anchor 3건 신설 필수 | 0건에서 시작 — anchor 1파일 신설 필수 |
| 되돌리기 | — | (a) 착수 시 B-1 루프 **제거 필요**(회수 비용 ~23줄) |

---

## 5. 권고안 — **(b) 즉시 + (a) 별도 트랙**. 최종 선택은 사용자 결정(Q-1).

**권고**: 먼저 **(b)** 로 컴패니언 이월과세를 명시 차단하고, **(a)** 는 V-1~V-5를 해소한 뒤의 **별도 계획**으로 분리한다.

**근거**

1. **오늘 사용자에게 도달하는 것은 「침묵 오산」이다.** ⑧이 이월과세 폼을 필드별로 강제해 끝까지 채우게 한 뒤(§2.1) 취득가액 0으로 계산한다. 저장소의 확립된 정책은 「침묵 오산보다 명시 차단」이고(`transfer-tax-validate.ts:112`), **다건 경로는 같은 문장으로 이미 차단**한다(`multi-transfer-tax-validate.ts:66-68`). (b)는 신규 정책이 아니라 **일괄을 다건에 정렬**시키는 것이다.
2. **(b)는 D-1·D-2·D-3·D-5의 도달 경로를 한 번에 닫는다** — 넷 다 전제가 「컴패니언이 `carryover_gift`로 일괄에 진입」이기 때문이다. 특히 D-5는 ⑫와 무관하게 **오늘 도달하는** 결함인데 (b)가 그 유일한 **UI** 트리거를 막는다.
   ⚠️ **정확히**: (b)는 ⑧(클라이언트 validate)이므로 **결함을 제거하지 않고 도달을 막는다.** ⑩·⑫는 그대로 200을 내주므로 마법사를 거치지 않는 호출자에겐 D-1·D-3가 살아 있다. F41 선례도 ⑧ 전용이라 관행과는 정합하지만, (a)와의 비교에서 이 차이를 지워선 안 된다.
3. **(a)는 선행 조건이 남아 있다.** D-4(표시 축)를 고치지 않은 채 ⑫를 열면 컴패니언이 곧바로 같은 드리프트 경로에 올라탄다(§3). V-1(지분분할 스케일)·V-3(②3호 비교 스코프)은 **수치·법령 모두 미확정**이고, 🆕 **V-10**(D-5의 정정 설계 — 안분 키 ↔ 환산 분모 역할 분리)은 **본 검토에서 새로 열린 미확정**이다. A-8을 「순서 조정」으로 착수하면 시나리오 A 취득가액이 0이 되어 **지금보다 악화**된다.
4. **(b)는 (a)를 막지 않는다.** B-1은 술어 1개짜리 루프라 (a) 착수 시 제거 비용이 ~23줄이다.

**반대 논거(사용자가 (a)를 택할 근거로 정당하다)**

- **법령은 (a) 쪽이다.** §97의2①은 자산 단위 규정이고 일괄양도 배제 문언이 없다(§1 P-6). (b)는 법이 허용하는 계산을 도구가 거부하는 상태를 남긴다.
- **(a)가 리뷰가 적은 것보다 훨씬 싸다.** ④·⑤·⑦·⑧·⑬·엔진이 이미 배선돼 있어 **⑫ 배관 자체의 결손은 ⑩·⑫·⑭ 세 곳뿐**이다(§1 P-2). ⚠️ 다만 이 「세 곳」은 **배관 결손만**의 수이고, 착수에 필요한 총량은 여기에 선행 정정(D-4·D-5)과 미확정 해소(V-1·V-3·V-10)가 더해진다 — §4 (a) 표 A-1~A-12가 그 전량이다.
- (b)는 **이미 그 조합을 저장해 둔 사용자**에게 차단으로 나타난다(→ V-4).

---

## 6. 착수 전 필수 조건 — 안전망이 **0건**이다

실측된 안전망 현황(어느 선택지를 택하든 동일):

| 층 | 현황 | 근거 |
|---|---|---|
| vitest | 컴패니언 carryover를 단언하는 테스트 **0건**. `companionAssets` + `carryover`가 함께 나오는 2파일은 둘 다 primary 전용이다 — `__tests__/calc/gift-donor-date-optional-parity.test.ts`(컴패니언은 `acquisitionCause: "gift"` `:100-110`, carryover 단언은 단건 `:141~`) · `__tests__/api/transfer.route.bundled.test.ts:385-392`(주석 안의 §104② 설명) | grep 전수 |
| E2E | carryover spec 6개(`carryover-donor-death` · `transfer-burdened-gift-carryover-block` · `non-housing-to-housing-conversion` · `general-building-carryover` · 주식 2건) 중 **컴패니언/자산 2를 다루는 것 0건** | `grep -rln carryover e2e/` → 6파일, 그중 `자산 2|companion` 매칭 0 |
| mutation probe | 컴패니언 payload에 `carryoverTaxation`을 넣어도 **응답이 바이트 동일** — 아무 테스트도 이 필드를 관측하지 않는다는 직접 증거 | 본 계획 P-d(`JSON.stringify` 일치) · 축 A N3 |
| 인접 anchor의 사각 | `__tests__/api/transfer.route.gb-carryover.predo.anchor.test.ts`는 `necessaryExpense`를 **타입(`:124`)에만** 선언하고 expect가 **0건**이다 — D-4가 anchor를 통과하며 살아 있는 이유 | grep(파일 내 `necessaryExpense` 히트 **1건**, `:124` 타입 선언뿐 — 본 검토 재확인) |

> ✅ **본 검토 재확인**: 위 4행 전부 재현했다. 특히 mutation probe는 `JSON.stringify(응답) === JSON.stringify(응답)` **true** — 안전망 0건이 실측으로 확정됐다.

⇒ **anchor 신설은 필수다.** 필요한 픽스처를 구체적으로 명시한다.

**공통 픽스처 C-BASE** (route POST, `preloadTaxRates`=`makeMockRates()`):
primary = 토지, 양도 2024-03-01, 총 양도가 1,800,000,000, apportioned 모드(`standardPriceAtTransferForApportion` 1,000,000,000);
companion = 주택 `standardPriceAtTransfer` 400,000,000, `acquisitionCause: "carryover_gift"`,
`carryoverTaxation = { giftRegistryDate: "2021-06-01", donorAcquisitionDate: "2005-01-01", donorAcquisitionPrice: 100,000,000, useEstimatedAcquisition: false, giftTaxAmount: 30,000,000, giftDateValuation: 300,000,000, exclusionDeclared: {} }`.
현행 관측값(고정 대상): companion `acquisitionPrice 0` · `transferGain 514,285,714` · `determinedTax 180,059,999`.

| 선택지 | 필수 anchor | 통과 기준 |
|---|---|---|
| 공통 | **N-0 characterization** — C-BASE의 현행 3값을 고정 | 수정 전 녹색 (본 검토 재현: `acq 0` · `gain 514,285,714` · `det 180,059,999`) |
| (a) 전용 | **N-1 mutation probe** — C-BASE에 `carryoverTaxation` 유무 두 응답이 **달라야** 한다 | 수정 전 **적색**(오늘은 바이트 동일 — 실측 `true`) |

> 🔴 **N-1을 「공통」에 두면 안 된다 (본 검토 정정).** (b)를 택하면 응답은 **영원히 바이트 동일**이므로
> N-1은 절대 녹색이 되지 않는다 — 커밋하면 상시 적색 테스트가 되어 게이트를 무의미하게 만든다
> (CLAUDE.md 「상시 실패 CI에만 있어 실질 관문이 없던 것과 같은 실패」).
> ⇒ **(b) 경로에서 N-1은 커밋하지 않는 일회성 probe**이고, 커밋되는 것은 §10 (b)-3의 **B-A~B-D(⑧ 레벨)** 다.
> **(a) 경로에서만** N-1이 「수정 전 적색 → 수정 후 녹색」 anchor로 성립한다.
| (b) | **B-A** 컴패니언 carryover → ⑧ 차단 / **B-B** primary만 carryover + 일반 컴패니언 → **미차단**(P-a가 200 실증) / **B-C** 단건 carryover → 미차단 / **B-D** GB 지분분할 각 지분 carryover → **미차단** | 4건 전부 |
| (a) | **A-A** ⑫ parse 후 `'carryoverTaxation' in parsed.data === true` / **A-B** ⑭ `buildCompanionEngineInputs` 출력에 `carryoverTaxation`·`donorAcquisitionDate`(**Date 인스턴스**) 도달 / **A-C** route 세액이 단건 대조군과 일치 / **A-D** D-4 정정 후 `양도가액 − 취득가액 − 필요경비 = 양도차익` 자기검산 | 4건 전부 |

---

## 7. ⛔ 금지 사항

1. **자동 안분 fallback 금지** — 컴패니언 이월과세 입력 누락을 형제 자산 값·폼-수준 `totalAcquisitionPrice`로 메우지 말 것. 실측상 폼-수준 총 취득가액을 줘도 값이 바뀌지 않으며(축 A N2), 그 fallback을 **신설하는 것**이 정책 위반이다(memory `feedback_no_silent_apportion_fallback`).
2. **`useEffect → store` 미러링 금지** — (b)의 차단을 UI에서 취득원인 자동 변경으로 구현하지 말 것. 3중 패턴(display fallback / API / validate)만 사용한다(memory `mirror-pattern`).
3. **엔진 dual-truth 금지** — `carryover_gift` 판정·시나리오 채택을 route·⑭·UI에서 재구현하지 말 것. 판정은 `lib/tax-engine/transfer-tax-carryover.ts` 단일 소스이고 ⑭는 **원값만 전달**한다(`bundled-split-helpers.ts:254-256` 주석 「엔진이 게이트 판정 … 여기선 원값만 전달」과 동일 규율).
4. **⑧ 차단을 「dead-end」로 만들지 말 것** — 차단 메시지는 반드시 통과 경로(함께양도 토글 OFF / 취득원인 변경)를 지목한다(memory `feedback_ui_gate_removes_sole_input_path`).
5. **`SINGLE_ONLY` `some()` 배열에 carryover를 넣지 말 것** — primary-only carryover는 오늘 **200으로 계산되어 세액이 나온다**(본 계획 P-a 재현). ⚠️ 「정상」이 아니다 — 같은 케이스가 D-4 표시 드리프트를 탄다(취득가액 열 0 / 필요경비 열 300,000,000). 차단하지 않는 이유는 「정상이라서」가 아니라 **세액 자체는 도출되므로 계산 경로를 죽일 근거가 없기** 때문이다.
6. **R4 지분 부담부증여 재제안 금지** — 지분 축을 손대는 A-10을 부담부증여로 확장하지 말 것(`archive_transfer_completed` / R4 🛑보류 확정).
7. **재개발·입주권 축은 읽기만** — `assetKind` 축 일원화(#1245~#1247)는 별도 패스다.
8. **파트 안분 재제안 금지** — 자본적지출을 §100② 후문으로 파트 안분하는 것은 doNotFix 확정(F23 절 참조). 이월과세 `donorCapitalExpenditure`에도 같은 규율을 적용한다.
9. **납세자 유리/불리·절감 표현 금지** — 시나리오 A/B 채택은 §97의2②3호의 법정 비교이지 선택이 아니다.
10. **anchor를 「현행 일치 예상」으로 쓰지 말 것** — N-1은 **수정 전에 적색이어야** 의미가 있다.

---

## 8. 미검증 항목(V-n) 레지스터

| ID | 미검증 내용 | 어떻게 검증할 것인가 | 어느 선택지에 필요 |
|---|---|---|---|
| **V-1** | **지분분할 × 이월과세 스케일**. `lib/calc/transfer-tax-api-carryover.ts`(88줄) 전체에 `applyRatio|ratio` grep **0건**(본 검토 재확인) — `giftDateValuation`·`donorAcquisitionPrice`가 100% 스케일로 실리는데 지분 모드 양도가액은 `lib/calc/transfer-tax-api.ts:272`(`applyRatio(totalContractPrice, primaryRatio)`)에서 × ratio 된다. ⑧ 지분분할 차단 목록(`lib/calc/transfer-tax-validate.ts:76-93`)에 `carryover_gift`는 **없다**. 시나리오 B 취득가 > 양도가로 음수 양도차익이 나는지 **수치 미측정**. | 지분 2건(ratio 0.5) × primary carryover 픽스처로 route POST → `transferGain` 부호·`adoptedScenario` 관측. 음수면 A-10에서 차단 또는 ratio 적용 결정. | (a) 필수 · (b)는 **i>0 지분만 부수적으로 닫는다**(§4 ⚠️3). **primary(i=0) 지분 carryover는 (b) 차단 밖**이라 미해소로 남는다 |
| **V-2** | **D-5의 세액 크기**. payload 오염(600,000,000 → 222,222,222)과 ⑫·⑭ 통과는 실측됐으나 apportioned 배분 양도가액·최종 세액 변동폭 미측정. | 이월과세 `general` 환산 모드 컴패니언 픽스처로 route POST 2회(오염 전/후 값 직접 주입) 대조. | (a) 필수 · (b)는 차단으로 해소되나 **크기는 기록해 둘 것** |
| **V-3** | **§97의2②3호 비교 스코프**(자산별 vs 신고단위)가 **일괄 경로**에서 어떻게 결합되는가. 조문은 「양도소득 **결정세액**」이고 주식 축은 「전체 합산 결정세액」으로 결론냈다(`lib/tax-engine/stock-transfer/stock-carryover.ts:11,330,350-352`). 부동산 다자산 격자 실측(memory `project_stock_carryover_97_2_necessary_expense_open.md:169-170`)은 **다건 계산기** 맥락이고, 다건은 `multi-transfer-tax-validate.ts:66`이 carryover를 차단하므로 실사용 조합이 아니었다. | (a) 착수 시 일괄 경로 전용 격자(채택 A/B × 컴패니언 유무)로 실측. 조문 해석이 갈리면 KoreanLaw로 §97의2② + 영 §163의2 위임 체인 확인 후 착수. **미해소 상태로 (a) 착수 금지.** | (a) 필수 |
| **V-4** | **(b) 채택 시 기존 저장 데이터 dead-end 여부**. sessionStorage/IndexedDB에 이미 자산2=`carryover_gift`가 있는 사용자가 차단에 걸리는데, 취득원인 라디오가 살아 있어 **통과 경로는 존재**한다. 메시지가 그 경로를 지목하는지는 문구 설계 시 확인 필요. | Playwright로 자산2 carryover 상태를 만든 뒤 새로고침 → 차단 메시지 노출·라디오 변경으로 해소되는지 확인(memory `feedback_blocking_validation_full_e2e_regression`). | (b) 필수 |
| **V-5** | **`carryoverTaxationEngineShape`(GB용) ↔ 단건 `transfer-tax-schema.ts:354-370` shape 동일성**. 육안으로 필드 10개가 일치하나 `giftTaxAmount` 주석이 GB에서는 「이미 안분된 값」이라 **의미가 다를 수 있다**. | 두 스키마를 diff로 대조하고, 재사용 시 컴패니언에서 `giftTaxAmount`가 안분 전 값인지 anchor로 고정. | (a) 필수(A-1/A-2) |
| **V-6** | **D-2 게이트 확장의 부작용**. `donorAcquisitionDate`가 `gift`일 때 §104②2호 외 **다른 용도**로 쓰이는지 전수 확인하지 않았다. | `grep -rn donorAcquisitionDate lib/tax-engine/`로 소비 지점 전수 → `carryover_gift` 확장이 gift 동작을 바꾸지 않음을 anchor로 고정. | (a) 필수(A-6) |
| **V-7** | **D-4가 단건 표시 경로에도 있는지**. 단건은 `components/calc/results/transfer/FilingFormTableHelpers.ts:611-622`가 취득가액을 **역산**(`engineAcqPrice = totalTransferPrice − effGainForAcq − totalEngineExpenses`, `:618`)해 자기일관이라는 코드 사실만 확인했다(본 검토 재확인). aggregate만 방향이 반대다 — **수치 미측정**. | D-4 수정 시 단건 신고서 열도 함께 회귀 확인(양도가액 − 취득가액 − 필요경비 = 양도차익). | (a) A-9 · D-4 별건 수정 |
| **V-8** | **`assetKind: commercial_building` 컴패니언 × carryover 도달성**. ⑫ enum은 `housing|land|building` 3종이라 변환을 거친다. 축 A 결론(주택·토지·건물로 이미 도달)은 바뀌지 않는다. | (b) 채택 시 차단 술어가 그 조합도 덮는지 anchor 1건 추가. | 양쪽 |
| **V-9** | **D-6 수치와 수정의 독립성**. ⚠️ 두 갈래다 — ① **106,722,000이라는 수치 자체가 축 C 인용이고 본 계획에서 재현되지 않았다**(코드 사실 「⑭에 두 필드가 없다」만 재확인). ② 두 필드를 추가하면 단건 결정세액이 그만큼 움직이는데 기존 anchor를 깨는지 미확인. | ① 배우자+사망 픽스처로 route POST 2회(현행 / 두 필드 직접 주입) 대조 — **Q-3 승인 전에 먼저 재현**할 것. ② `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/api/` 전수 후 실패 anchor를 법령 정합 기준으로 판정(memory `feedback_anchor_correction_legal_priority`). | 별건(F16과 무관) — **①은 Q-3 답변 전 선행** |
| **V-10** | 🆕 **D-5 정정의 설계**(본 검토에서 새로 열림). 컴패니언에서 `standardPriceAtTransfer`는 **§166⑥ 안분 키**이자 **§97①1호나목 환산 분모** 두 역할을 겸한다. 엔진은 최상위 값을 읽고(`lib/tax-engine/transfer-tax-carryover.ts:254-258`), primary는 역할이 하나라 명시 삼항으로 푼다(`lib/calc/transfer-tax-api.ts:330-331`·`345-346`). **컴패니언에서 두 역할을 어떻게 분리할지가 미확정**이고, 순진한 스프레드 재배치는 `standardPriceAtAcquisition:`(`transfer-tax-api-helpers.ts:611`)의 `purchase` 게이트 때문에 **환산 분자를 `undefined`로 지운다**(코드 사실). | ① 안분 키 전용 필드를 새로 둘지, ② 안분을 ④에서 미리 확정해 보낼지, ③ 컴패니언 이월과세 `general` 환산 자체를 미지원으로 좁힐지 — 셋을 route POST 대조로 비교한 뒤 A-8 규모 재산정. | (a) 필수 · (b)는 차단으로 우회 |
| **V-11** | 🆕 **축 B의 두 수치 출처**(본 검토에서 발견). §3 표의 **−170,000,000**(픽스처 B-1)과 §2.1의 **−70,000,000**(픽스처 B-2)은 서로 다른 픽스처 값인데 Q-2가 후자를 「일반건물 파트 이월과세(출하 완료 기능)」에 귀속시킨다. **그 귀속이 맞는지 본 계획은 확인하지 않았다.** | 일반건물 파트 이월과세(`landCarryoverTaxation`) 픽스처로 aggregate 경로 route POST → 신고서 열 산술(양도가액 − 취득가액 − 필요경비 = 양도차익) 성립 여부와 clamp 전 NE 부호 실측. **Q-2 답변 전에 확정**할 것 — 「출하된 기능이 이미 틀렸다」는 주장의 유일한 근거다. | Q-2 |

---

## 9. 사용자 결정 사항

| ID | 질문 |
|---|---|
| **Q-1** | (a) 정식 지원 / (b) 명시 차단 / (b)→(a) 순차 — 어느 것으로 갈 것인가. 본 계획 권고는 **(b)→(a) 순차**(§5). |
| **Q-2** | **D-4**(aggregate 표시 열 배분, `lib/tax-engine/transfer-tax-aggregate.ts:486-497`)를 F16과 **함께** 처리할 것인가, 별도 항목으로 뺄 것인가. primary carryover × 함께양도에서 **본 계획이 재현**했다(P-a: 취득가액 열 0 / 필요경비 열 300,000,000). ⚠️ **「일반건물 파트 이월과세(출하 완료 기능)에서도 발생」은 축 B 인용이고 본 계획이 재현하지 않았다 → V-11 선행 확인 필요.** |
| **Q-3** | **D-6**(`app/api/calc/transfer/engine-input.ts:85-96` `donorRelation`·`donorDeceased` strip)을 F16 선택지와 무관하게 **즉시 별건 수정**할 것인가. 2줄 + anchor. ⚠️ **「단건 106,722,000 과대」는 축 C 인용이고 본 계획이 재현하지 않았다 → V-9① 선행 재현 필요**(코드 사실 「⑭에 두 필드 없음」만 재확인). |

---

## 10. 단계별 실행 계획

### 공통 (선택지 확정 전 — 지금 해도 되는 것)

```
1. anchor N-0(characterization) 작성 — §6 C-BASE 3값 고정
   → verify: 수정 전 녹색. `npx vitest run <new-file>`
   (기대값은 본 검토 재현치: acq 0 / gain 514,285,714 / det 180,059,999)
2. probe N-1(mutation) 실행 — carryoverTaxation 유무 응답이 달라야 한다
   → verify: 오늘 **바이트 동일**(실측 true)임을 확인. ⚠️ **커밋 여부는 선택지에 종속**한다:
             (a) 경로에서만 anchor로 커밋(수정 전 적색 → 수정 후 녹색),
             (b) 경로에서는 **커밋하지 않는다**(영원히 적색이 되므로 — §6 🔴).
```

### (b)를 택한 경우

```
3. B-A~B-D 4케이스 anchor 작성
   (선례 __tests__/calc/companion-sales-case-single-only-review-2026-08-f41.test.ts 202줄·it 5건 복제)
   → verify: B-A만 적색, B-B·B-C·B-D는 녹색 (차단 전 상태에서)
3b. 🆕 차단 문구 확정 — 비-GB 지분분할 지분(i>0)도 이 루프에 걸리므로 통과 경로를 **둘 다** 지목
    (「함께 양도/지분 분할 토글을 끄고 … 또는 취득 원인을 「증여」로 변경」 — §4 ⚠️3)
   → verify: 지분분할 픽스처(비-GB, ratio 0.5, 지분2=carryover_gift)에서 메시지가
             지분 분할 경로를 지목하는지 문자열 단언
4. transfer-tax-validate.ts **:178 직후**(:179 닫는 `}` 앞) — if (!isGbFractional) 블록 **안**에 i>0 루프 추가
   → verify: 3·3b의 케이스 전부 녹색. `npx vitest run __tests__/calc/`
   → verify(회귀): GB 지분분할 × 토지 파트 carryover가 **여전히 통과**한다
             (transfer-tax-api-gb-carryover.ts:123이 같은 필드를 게이트로 쓴다 — B-D)
5. V-4 확인 — 저장된 자산2=carryover_gift 상태에서 dead-end가 아닌지
   → verify: Playwright로 차단 메시지 노출 + 취득원인 변경으로 해소
6. N-0 갱신 — 차단 후에는 route까지 도달하지 않으므로 ⑧ 레벨 단언으로 대체
   → verify: `npm run check:pre-pr`
```

### (a)를 택한 경우 (V-1·V-3 해소가 **선행 조건**)

```
0. V-3 확정 — §97의2②3호 비교 스코프를 일괄 경로에서 실측·법령 확인
   → verify: 격자 실측 결과가 단건 대조군과 정합. 갈리면 착수 중단.
1. V-1 확정 — 지분분할 × 이월과세 픽스처 route POST
   → verify: transferGain 부호·adoptedScenario 관측. 음수면 A-10 설계 후 진행.
2. D-4 선행 수정 (A-9) + V-7 단건 회귀
   → verify: 양도가액 − 취득가액 − 필요경비 = 양도차익 자기검산이 primary carryover ×
             함께양도(P-a 픽스처)와 일반건물 파트 이월과세 양쪽에서 성립
2b. 🆕 V-10 확정 — D-5 정정 **설계**를 먼저 고른다(안분 키 ↔ 환산 분모 역할 분리)
   → verify: 후보 3안을 route POST로 대조. ⛔ 「스프레드 순서만 바꾼다」는 **금지** —
             standardPriceAtAcquisition:(:611)의 purchase 게이트가 환산 분자를 undefined로 지운다
3. D-5 선행 수정 (A-8, V-10에서 고른 설계) + V-2 수치 기록
   → verify: 이월과세 general 환산 컴패니언 payload의 standardPriceAtTransfer가
             사용자 입력값(§166⑥ 안분 키)을 유지하면서
             **동시에** 환산 분자·분모가 증여자 축으로 일관되게 도달한다(둘 다 단언)
4. A-1·A-2 (⑫) + V-5 shape diff
   → verify: anchor A-A 녹색 — parse 후 'carryoverTaxation' in parsed.data === true
5. A-3 (⑩ superRefine) — ⑧ 필수 필드와 동일화
   → verify: ⑧ 통과 ↔ ⑫ 400 모순 케이스 0건 (⑧/⑫ 교차 매트릭스 anchor)
6. A-4·A-5·A-6·A-7 (⑭) + V-6
   → verify: anchor A-B 녹색 — carryoverTaxation 도달 + donorAcquisitionDate가 Date 인스턴스
7. route 세액 대조
   → verify: anchor A-C·A-D 녹색 · N-1이 이제 녹색(응답이 달라졌다)
8. 전수 회귀
   → verify: `npm run check:pre-pr` + `npx playwright test`(carryover 6 spec)
```

### D-6(별건, Q-3 승인 시)

```
0. 🆕 V-9① 재현 선행 — 축 C 수치(363,561,000 → 256,839,000)를 본 저장소 현행 코드에서 먼저 관측
   → verify: 배우자+사망 픽스처 route POST 2회(현행 / 두 필드 직접 주입) 대조.
             수치가 다르면 계획서 수치를 실측값으로 갱신한 뒤 진행(추정 인용 금지)
1. app/api/calc/transfer/engine-input.ts:85-96에 donorRelation·donorDeceased 2줄 추가
   → verify: 0에서 관측한 두 값이 그대로 재현 + exclusionReason === "relation_invalid"
2. V-9② 회귀
   → verify: npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/api/
```

---

## 11. 적대적 자가검토 1회차 — 정정 내역 (2026-08-23)

**인용 전수 검증**: 본 문서가 인용한 file:line을 **전부 열었다**. 결과 — 실재 확인 다수, 정정 **6건**.

| # | 정정 전 | 정정 후 | 성격 |
|---|---|---|---|
| C-1 | `types/transfer-aggregate.types.ts:43-52` | `lib/tax-engine/types/transfer-aggregate.types.ts:43-52` | **경로 오류(파일 부존재)** — 라인은 정확 |
| C-2 | `ValuationDetailCards.tsx` · `FilingFormTable*Helpers.ts` · `DetailedStatementHelpers.ts` (파일명만) | `components/calc/results/transfer/…` 전체 경로 | 경로 누락 |
| C-3 | `transfer-tax-api-carryover.ts:57-66` | `:58-65` (`:57`·`:66`은 공백) | 라인 드리프트 |
| C-4 | `transfer-tax-building-schemas.ts:33-34` (donorRelation·donorDeceased) | `:34-35` (`:33`은 주석) | 라인 드리프트 |
| C-5 | B-1 「`:179` **직후**」 + 「같은 `if (!isGbFractional)` 블록 **안**」 | 「**`:178` 직후**(= `:179` 닫는 `}` 앞)」 | **자기모순** — `:179`가 그 블록의 닫는 중괄호라 「직후」면 블록 밖이다 |
| C-6 | `transfer-tax-aggregate.ts:96-109` per-item 호출 | `:95-109`(`:95`가 `.map(` 시작) | 라인 드리프트 |

**실측 재현**: P-d·P-a·D-2·D-5를 독립 probe로 재현 — **전부 일치**(§0 머리말). probe는 삭제했다.

**새로 열린 항목**: **V-10**(A-8이 「순서 조정」이면 악화된다 — 코드 사실로 확인) · **V-11**(축 B의 −170,000,000 / −70,000,000 두 픽스처 구분 미표시) · §4 **⚠️3**(비-GB 지분분할도 B-1 루프에 걸려 차단 문구가 dead-end가 될 수 있다).

**약화한 주장**: (b)가 「D-1·D-2·D-3·D-5를 닫는다」 → 「**도달 경로만** 닫는다」(⑧은 클라이언트 validate라 ⑩·⑫의 API 계약 결함은 존속). Q-2·Q-3·D-6이 인용한 축 B/C **수치는 본 계획 미재현**임을 명시(V-9①·V-11).

**기각한 의심(재검토 불필요)**:
- 「primary 경로도 `topLevelOverrides`를 버리므로 D-7이 있다」 → **아니다.** primary는 `lib/calc/transfer-tax-api.ts:330-331`·`345-346`에서 `isCarryoverGeneral` 명시 삼항으로 증여자 기준시가를 직접 싣는다 ⇒ 오버라이드가 필요 없다. (그래서 primary에는 D-5가 없다.)
- 「⑬(`callTransferTaxAPI` body spread)도 결손일 수 있다」 → **아니다.** `lib/calc/transfer-tax-api.ts:693-697`이 필드 열거 없이 통째로 싣는다.
- 「B-1의 `if (!isGbFractional)` 가드는 과잉일 수 있다(GB는 파트 축이니 asset-level `acquisitionCause`와 무관)」 → **아니다.** `lib/calc/transfer-tax-api-gb-carryover.ts:123`이 **asset-level `acquisitionCause`를 토지 파트 게이트로 쓴다** ⇒ 가드는 필수다.

**법령 재확인**: §1 P-6의 §97의2① 인용문을 KoreanLaw MCP로 재조회해 **verbatim 일치** 확인(mst 280405 · 공포 2025-12-23 · 시행 2026-07-01). ②3호 「양도소득 **결정세액**」 문언도 V-3 기재대로다.
