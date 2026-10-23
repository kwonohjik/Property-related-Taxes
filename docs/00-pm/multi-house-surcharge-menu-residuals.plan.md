# 다주택 중과 판정 메뉴 — 남은 미결 정리 계획서 (V-4 · V-5 · V-9 잔여)

- 작성: 2026-10-23
- 근거 문서: `multi-house-surcharge-judgment-menu.plan.md`(이하 「원 계획서」) §11 V-n 레지스터. 메뉴 P0~P9는 전부 머지됐다(P9 #2462 e96fc15d4).
- 검증 깊이: **L3**. V-4가 판정 메뉴 두 곳의 비과세 결론을 바꾸고, 형제 결함인 클라이언트 leaf는 계산기 ④ 본문을 바꿀 수 있다.
- 이 문서의 수치는 모두 2026-10-23 master(0da6fb875)에서 throwaway probe로 실측했다. probe 파일은 지웠다.

## 0. 요약

| 항목 | 실측 결론 | 처리 | PR |
|---|---|---|---|
| **V-4** 1주택 판정 단계의 일반주택 취득일 | 🔴 **결론이 갈린다.** 동일세대 증여 주택 + §99의4 농어촌주택에서 계산기는 비과세, 판정 메뉴는 과세 | 판정 단계에 계산기와 같은 날짜를 넘긴다. 화면 쪽 leaf도 맞춘다(Q-1) | PR-1 |
| **V-5** 입주권 양도 시 보유 주택별 표 | 막힌 원인 하나: 양도하는 입주권의 「종전 주택의 가격」 칸이 판정 메뉴에 없다 | Q-2 결정 → 표를 열거나, 현행 유지로 종결 | PR-2(Q-2 (a)일 때) |
| **V-9 잔여** 페이지 메타데이터 인용 | 법 §104⑦은 맞다. 권리를 함께 세는 영 §167의4·§167의11이 빠져 있다 | 인용 두 조를 더한다 | PR-1에 동반 |
| 원 계획서 §11.7 verdict | 착수 전 상태(「미해소 V-1~V-9 · needs-fix」) 그대로다 | 이 계획서 PR에서 정정 | PR-0 |

---

## 1. V-4 — 판정 단계가 일반주택 취득일로 증여일을 쓴다

### 1.1 실측

시료: 직계존속이 2018-01-01 취득 → 2019-03-01 세대 보유 시작(합가) → 2021-06-01 증여 → 계속 같은 세대 → 2025-02-16 양도(9억 · 비조정 · 전주 완산구). 보유 주택 명부에는 농어촌주택 1채가 있다(2020-06-01 취득 · 기준시가 1억 · §99의4 농어촌 선언 · 소재지 요건 충족).

| 같은 세대 | 1주택 판정 메뉴 | 계산기(넘기기 후 · 이월과세 칸 채움) | 중과 메뉴 비과세 요약(D3a) |
|---|---|---|---|
| 예 | **과세**(`isExempt=false`) | **비과세** — `new_99_4_rural` 적격 · 주택 수 제외 1 | **과세** |
| 아니오(음성 짝) | 과세 | 과세 — `ACQUISITION_ORDER` 불성립 · 세액 197,703,000 | 과세 |

- 판정 단계가 `resolveHceGeneralHouseAcquisitionDate`의 날짜를 넘기도록 임시로 고쳐 다시 돌렸다. 결과는 예 = 세 곳 모두 비과세, 아니오 = 세 곳 모두 과세였다. **수정 하나로 세 경로가 일치한다.**
- 화면에 오류나 경고는 없었다(`validateAllSteps` 오류 0). 사용자는 판정 메뉴에서 과세를 보고 계산기로 넘기면 비과세를 본다.

### 1.2 원인

- `app/api/calc/one-house-exemption/judgment-pipeline.ts:36` — `runHouseCountExclusionStep(engineInput, steps)`에 3번째 인자가 없다.
  - 그러면 `resolveExemptionHouseCountExclusions`가 `effectiveInput.acquisitionDate`(증여일)로 폴백한다(`lib/tax-engine/transfer-tax-house-exclusion-step.ts:72`).
- 계산기는 `transfer-tax.ts:237`에서 `hceGeneralHouseAcquisitionDate`를 넘긴다. 이 날짜는 `resolveHceGeneralHouseAcquisitionDate`(`lib/tax-engine/transfer-tax-precalc.ts:284-293`)가 아래 순서로 고른다.
  1. `houseCountExclusionAcquisitionDate`
  2. 토지만 출자한 원조합원 → 사용승인일
  3. 이월과세 → `resolveHouseCountExclusionAcqDate`
  4. 증여 세대 통산 시작일(`giftHouseholdConsolidationStart` — `lib/tax-engine/one-house/gift-household-basis.ts:109-116`), 없으면 취득일
- 이 날짜를 읽는 술어는 §99의4① 「취득 전 보유」(`transfer-reductions/new-99-4.ts:208`)와 §98의9①(`transfer-reductions/unsold-98-9.ts:75`)이다.
- 같은 파일 `:55`의 `resolveRentalResidenceComposition(engineInput, parsedRates)`에도 날짜가 없다. 계산기는 넘긴다(`transfer-tax-rental-housing-step.ts:189`). §155⑳ 세대 구성 판정이 같은 주택 수 제외를 쓰므로 함께 고친다.
- 영향 범위:
  - 1주택 판정 메뉴 결론
  - 양론 표시(P4) — 같은 파이프라인을 다시 부른다
  - 다주택 중과 메뉴 비과세 요약(`app/api/calc/multi-house-surcharge-judgment/route.ts:61`가 같은 조립을 쓴다)
- 중과 headline은 이미 같은 날짜를 넘긴다(`surcharge-judgment-payload.ts:169`). 계산기 세액 경로 엔진은 바뀌지 않는다(클라이언트 leaf는 §1.3).

### 1.3 형제 결함 — 화면 쪽 leaf도 증여일을 쓴다

- `lib/calc/house-count-exclusion-rows.ts:172` `eligibleCountExcludedHouseIds`는 일반주택 취득일로 `primary.acquisitionDate`를 쓴다.
  - 실측: 위 시료의 「같은 세대 예」에서 판정 메뉴 폼과 계산기 폼(넘기기 후, `carryover_gift`) **둘 다 `[]`** 였다. 엔진은 같은 행(r1)을 뺀다.
- 이 leaf를 쓰는 곳:
  - 1주택 Step2 머리말 주택 수(`app/calc/one-house-exemption/steps/Step2.tsx:147`)
  - `exemptionCountExcludedHouseIds`·`temporaryTwoHouseCandidateExcludedIds`(`lib/calc/temp-two-house-candidate-exclusion.ts:122`)
- 그 뒤에 이어지는 곳:
  - 계산기 ④: `transfer-tax-api.ts:612`·`transfer-tax-api-residence.ts:75`·`multi-transfer-tax-api.ts:205`
  - 계산기 ⑧: `transfer-tax-validate-step1.ts:288`
  - 판정 메뉴 일시적 2주택: `one-house-judgment-temp-two-house.ts:36`
  - 섹션 노출 주택 수: `exemption-house-count.ts:32`·`one-house-judgment-section-scope.ts:119`
- ⇒ 엔진만 고치면 판정 메뉴의 머리말 주택 수와 일시적 2주택 섹션 노출이 엔진 결론과 어긋난다. 계산기는 지금도 어긋나 있다(3중 패턴 위반 — memory `mirror-pattern`). leaf를 고치면 계산기 ④ 본문(일시적 2주택 신규 주택 도출)이 바뀔 수 있어서 Q-1로 범위를 정한다.

### 1.4 수정 설계

- **엔진(route)**
  - `judgment-pipeline.ts`에서 `const generalHouseAcquisitionDate = resolveHceGeneralHouseAcquisitionDate(engineInput)`을 한 번 구한다.
  - `:36` `runHouseCountExclusionStep`과 `:55` `resolveRentalResidenceComposition`에 넘긴다. 계산기와 같은 함수, 같은 인자다.
- **leaf(Q-1 (a)일 때)**
  - `eligibleCountExcludedHouseIds`의 일반주택 취득일을 엔진과 같은 규칙으로 고른다.
  - 증여 세대 갈래는 ④가 이미 만드는 세대 사실(`buildGiftHouseholdPayload`·`buildCalcGiftHouseholdPayload` — `lib/calc/gift-household-payload.ts:89·173`)을 Date로 바꿔 엔진 `giftHouseholdConsolidationStart`에 그대로 넣는다. 술어는 하나만 둔다.
  - 이월과세·토지 출자 원조합원·`houseCountExclusionAcquisitionDate` 갈래가 폼에서 닿는지, 어디서 오는지는 V-A로 확정한 뒤 같은 helper에 넣는다.
- **신규 필드 0**: Zod·route 매핑·body는 바뀌지 않는다(⑫⑬⑭ 무관). 바뀌는 지점은 route 판정 단계(⑭ 뒤 엔진 호출)와 클라이언트 leaf(④⑤⑧이 공유)다.

### 1.5 테스트·mutation

| ID | 단언 | 지키는 것 |
|---|---|---|
| GH-1 | §1.1 시료 「예」 — 1주택 판정 메뉴 비과세 · §99의4 적격 | :36 인자 |
| GH-2 | 같은 시료 — 중과 메뉴 D3a 비과세 요약 = 1주택 판정 메뉴 = 계산기 | 세 경로 parity |
| GH-3 | 「아니오」 음성 짝 — 세 곳 모두 과세(`ACQUISITION_ORDER`) | 과잉 적용 방지 |
| GH-4 | §155⑳ 세대 구성 — 증여 세대에서 :55 날짜가 결론을 가르는 시료(V-C로 확보) | :55 인자 |
| GH-5 | leaf — 「예」에서 `eligibleCountExcludedHouseIds`에 r1 포함 · 「아니오」 미포함 | Q-1 (a) |
| GH-6 | 계산기 ④ 본문 — leaf 정정이 바꾸는 사례(V-B 결과에 따라) | 계산기 회귀 |

- mutation: :36 인자 제거 → GH-1·GH-2 실패 · :55 인자 제거 → GH-4 실패 · leaf 날짜 원복 → GH-5(·GH-6) 실패.
- **착수 전 안전망 실측**(P-0): 현재 :36에 인자를 넣어도 기존 테스트가 모두 통과하는지 돌려 본다. 통과하면 「지금 이 동작을 지키는 테스트 0건」이 확정되므로 GH-1~3을 필수로 한다.

---

## 2. V-5 — 입주권을 양도할 때 보유 주택별 표

### 2.1 현재

- 양도 대상이 입주권이면 route가 `scope.reason = "non_housing_sale"`로 답한다(`surcharge-judgment-payload.ts:158`). 결과 화면은 범위 밖 사유 문구(`MultiHouseSurchargeResultView.tsx:28`)와 1주택(§89①4호) 비과세 요약만 보인다.
- 판정 메뉴의 권리 양도는 `right_to_move_in`(조합원입주권)뿐이다(`judgment-request.ts:149`). 분양권 양도는 판정 메뉴에 경로가 없다.

### 2.2 법문 (2026-10-23 KoreanLaw MCP — 「소득세법 시행령」 MST 290841, 시행 2026-10-01)

- 영 §167의4②1호와 §167의11②1호는 문언이 같다. 수도권·광역시·특별자치시 밖(군·읍·면 포함)의 조합원입주권은 「조합원입주권의 가액(「도시 및 주거환경정비법」 제74조제1항제5호에 따른 **종전 주택의 가격**을 말한다)」이 「해당 주택 또는 그 밖의 주택의 양도 당시 3억원을 초과하지 않」으면 주택 수에 넣지 않는다.
- 엔진은 이 값을 `PresaleRight.rightValue`로 받는다. 값이 없으면 `Infinity`, 곧 산입으로 판정한다(`multi-house-surcharge-count.ts:532` — 모름 = 혜택 불성립).

### 2.3 막힌 지점

- 표 ⑤ 「이 주택을 대신 양도한다면」을 판정하려면 양도하는 입주권을 **보유 권리 행**으로 바꿔 세대 주택 수에 넣어야 한다. 가액기준 지역이면 그 행의 가액이 산입 여부를 가른다.
- 판정 메뉴의 입주권 양도 본문은 판정 사실만 담는 좁은 블록이다. §166 산식 입력(권리가액 등)은 일부러 보내지 않는다(`lib/calc/one-house-exemption-api.ts:335-343` 주석).
  - 권리가액은 「종전 주택의 가격 × 비례율」이라 §167의4가 말하는 값도 아니다.
- 보유 권리 목록에는 이미 같은 칸이 있다. `PresaleRightsSection.tsx:325-330` 「가액(공급가격)」이고, 빈 값이면 산입한다.

### 2.4 Q-2 — 결정 필요

| 선택지 | 하는 일 | 비용·위험 |
|---|---|---|
| **(a) 표를 연다** | 중과 메뉴에서만, 양도 입주권이 가액기준 지역일 때 「종전 주택의 가격」 선택 칸을 보유 권리 칸과 같은 규칙(빈 값 = 산입)으로 둔다. route는 범위 밖으로 답하는 대신 headline 「중과 없음 — 주택이 아님」(자산 게이트)과 표를 싣는다. 행 판정에서는 assets[0]을 `redevelopment_right` 권리 행으로 바꾸고 `selling` 더미 주택 행을 뺀다 | 신규 필드 1(①②③④⑤⑫⑭ — 중과 route 스키마 한정 · 1주택 본문에는 싣지 않는다: 권리 행이 섞이면 §89①4호 판정의 권리 수가 바뀐다). route 분기 하나 · 결과 뷰 분기 하나 |
| (b) 현행 유지로 종결 | V-5를 「범위 밖 확정」으로 닫는다. 입주권 양도는 중과 대상이 아니라는 결론과 §89①4호 요약은 이미 보인다 | 원 계획서 D1(교재식 전체 표)이 입주권 양도에서는 표 없이 끝난다 |

- 권장: **(a)**. D1은 양도 대상과 관계없이 표를 보이는 결정이었고, 막힌 원인이 칸 하나라서 비용이 작다.
- (a)를 고르면 V-D·V-E가 착수 조건이다.

### 2.5 (a)일 때 테스트

- RS-1 가액기준 지역 입주권 · 가액 2.5억 → 표에서 그 권리가 「산입 안 함(3억 이하)」
- RS-2 같은 시료 · 가액 빈 값 → 「산입」(모름 = 불성립)
- RS-3 조정지역 주택 2채 + 입주권 양도 → 행 k 간이 판정이 「주택 + 권리 3 이상」 중과
- RS-4 1주택 본문(§89①4호)에는 이 칸이 실리지 않는다
- mutation: 권리 행 변환 제거 → RS-3 실패 · 1주택 본문 누출 → RS-4 실패

---

## 3. V-9 잔여 — 페이지 메타데이터 인용

- 현재(`app/calc/multi-house-surcharge/page.tsx:7`): 「(소득세법 §104⑦, 시행령 §167의3·§167의10)」.
- 원문 대조(2026-10-23):
  - 「소득세법」(MST 280405) §104⑦ 1~4호가 조정대상지역 1세대 2주택·3주택 이상과, 주택에 조합원입주권·분양권을 더한 경우의 가산세율이다. **맞다.**
  - 영 §167의3·§167의10은 주택만 있는 3주택·2주택이다. 권리를 함께 세는 2호·4호는 각각 **영 §167의11**(1세대 2주택·조합원입주권 또는 분양권)과 **영 §167의4**(1세대 3주택·입주권 또는 분양권 이상)다. 엔진은 권리 산입을 판정하므로(§2.2) 인용이 모자라다.
- 수정: 「(소득세법 §104⑦, 시행령 §167의3·§167의4·§167의10·§167의11)」.
  - 메타데이터 문자열이라 `legal-codes/` 상수와 매니페스트 대상이 아니다. 화면 설명문의 인용은 P3c에서 이미 대조했다.
  - 위기 취득 특례 부칙을 인용하지 않는다는 원 계획서 V-9 결정은 유지한다.

---

## 4. 원 계획서 정정 (PR-0 — 이 계획서와 함께)

- §11.7 verdict: 「미해소 V-n: V-1(일부)·…·V-9 · `needs-fix`」를 실제 상태로 고친다.
  - V-1~V-3·V-6~V-8·V-10은 해소됐다. V-9는 부분 해소다.
  - V-4·V-5·V-9 잔여는 이 계획서로 넘긴다.
- §11 표의 V-4·V-5·V-9 행에 이 계획서를 가리키는 줄을 더한다. V-4에는 「결론이 갈린다(실측)」를 적는다.

## 5. PR 분할

| PR | 내용 | 착수 조건 |
|---|---|---|
| PR-0 | 이 계획서 + 원 계획서 §4 정정 | 없음 |
| PR-1 | V-4 엔진(:36·:55) + leaf(Q-1) + V-9 메타데이터 | Q-1 결정 · V-A·V-B·V-C 해소 |
| PR-2 | V-5 표 열기 | Q-2 = (a) · V-D·V-E 해소 |

## 6. 미검증 레지스터

| ID | 항목 | 검증 방법 | 설계 영향 | 상태 |
|---|---|---|---|---|
| V-A | `resolveHceGeneralHouseAcquisitionDate` 4갈래 중 판정 메뉴·계산기 폼에서 닿는 갈래와 폼 출처(`houseCountExclusionAcquisitionDate`를 싣는 ④가 있는지 · 이월과세 갈래가 판정 메뉴에서 닿는지) | grep ④ 빌더 · probe | leaf helper가 받을 폼 키 | ⏳ |
| V-B | leaf 정정이 계산기 ④ 본문을 바꾸는 사례가 있는가 — 일시적 2주택 신규 주택 도출에서 제외 행 집합이 달라지는 시료 | probe(넘기기 전후 본문 대조) | 있으면 계산기 세액 변화 → GH-6 필수 · 원 계획서 「계산기 불변」 범위를 넘는다고 보고 | ⏳ |
| V-C | :55(`resolveRentalResidenceComposition`) 날짜가 결론을 가르는 시료가 있는가 | probe | 없으면 :55는 parity 목적으로만 고치고 GH-4는 mutation 동치로 기록 | ⏳ |
| V-D | (Q-2 a) 권리 행 변환 시 `acquisitionDate`·지역·배우자 3-state 등 권리 행 전용 칸의 값 — `rightsOwnedAtTransfer` 필터·§167의4⑤ 배우자 차감과의 관계 | Read `multi-house-surcharge-count.ts`·행 판정 조립부 | 변환 helper 시그니처 | ⏳ |
| V-E | (Q-2 a) 「종전 주택의 가격」을 계산기 재개발 블록의 기존 칸에서 가져올 수 있는가(넘기기 때 값 이동) | grep `calc-wizard-asset-redev.ts` | 신규 필드인지 기존 필드 재사용인지 | ⏳ |

## 7. 결정 게이트

| ID | 질문 | 선택지와 달라지는 것 | 상태 |
|---|---|---|---|
| Q-1 | 클라이언트 leaf(§1.3)를 어디서 고칠까 | (a) **PR-1에 포함** — 판정 메뉴 화면과 계산기 ④⑤⑧이 엔진과 같은 날짜를 쓴다. 계산기 본문이 바뀔 수 있어 V-B 실측 필수 (b) 엔진만 먼저, leaf는 별건 — 그동안 판정 메뉴 머리말 주택 수가 결론과 어긋난다 | ⏳ 권장 (a) |
| Q-2 | V-5 표를 열까 | §2.4 | ⏳ 권장 (a) |

## 8. verdict

- 미해소 High: V-4는 원인·수정을 실측으로 확정했다. 남은 것은 범위 결정 Q-1이다.
- 미해소 V-n: V-A·V-B·V-C는 PR-1 착수 조건, V-D·V-E는 PR-2 착수 조건이다.
- ⇒ **`needs-fix`** — PR-0은 바로 머지할 수 있다. PR-1은 Q-1 결정과 V-A~V-C 해소 후에 착수한다.
