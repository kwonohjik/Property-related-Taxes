# §100③ 「30% 이상 차이 → 불분명 의제」 양도가액 축 — 시행시기(양도일) 게이트 누락 수정 계획서

> 작성 2026-10-18 · master `2b88e5719` 기준 · 상태: **Do 완료(2026-10-18) — Step 0~4 완료, Step 5(pre-PR·CI·머지) 진행**
> 관련: `docs/02-design/features/general-building-sale-split-mode.plan.md` §2.3·§11 · 취득가액 축 선례 PR #2190(결정 #17-6)

## 0. 한 줄 요약

§100③은 **양도일에 따라 세 구간**으로 갈리는데(2016.1.1. 전 = 규정 없음 / 2016.1.1.~2024.12.31. = 본문만 / 2025.1.1.~ = 본문 + 단서),
**취득가액 축(#2190)만** 그 연혁(`sec100_3Era`)을 쓰고 **양도가액 축 3곳은 날짜를 전혀 보지 않는다.**
그 결과 ① 2016.1.1. 전 양도에 30% 의제가 **잘못 발동**하고 ② 2016~2024 양도에 **존재하지 않는 단서(예외)가 인정**된다.

## 1. 법령 연혁 (전부 원문 실독 — V-1~V-4)

| 양도일 | 30% 판정(본문) | 단서(영 §166⑧ 제외 사유) | 근거 |
|---|---|---|---|
| ~ 2015-12-31 | **없음** | 없음 | 법률 제13558호(2015.12.15.) 부칙 제2조② — 「양도소득에 관한 개정규정은 이 법 시행 이후 양도하는 자산부터」, 시행 2016.1.1.(부칙 제1조) |
| 2016-01-01 ~ 2024-12-31 | **적용** | **없음** | 같은 법 §100③ 2016.1.1. 시행본 문언에 「다만…」 없음 |
| 2025-01-01 ~ | 적용 | **적용** | 법률 제20615호(2024.12.31.) 부칙 제9조 — 「단서의 개정규정은 이 법 시행 이후 양도하는 경우부터」, 시행 2025.1.1. |

- **V-1** 2015.12.15. 개정(MST 177202) 부칙 원문: DRF `target=law&MST=177202`의 `부칙`에서 `<제13558호>` 추출.
- **V-2** 시행본 대조: `get_law_text`·`applicable_law` — 2016.1.1. 시행본 §100③은 단서 없음 `<신설 2015.12.15>`, 2025.1.1. 시행본은 `<신설 2015.12.15, 2024.12.31>` + 단서.
- **V-3** 영 §166⑧(제외 사유 2종)은 대통령령 제35349호(2025.2.28.) 신설. 부칙 제1조 공포일 시행, **부칙 전문에 제166조 적용례 없음**(DRF `MST=269541` 부칙 전문 검색 0건).
- **V-4** 적용 기준은 **양도일**이다(취득일 아님) — 이미 `lib/tax-engine/data/sec100-3-split-era.ts:1-16`에 같은 표가 있고(2026-10-14 부칙 원문 실독으로 작성), 오늘 독립 재확인한 결과와 **일치**한다.

## 2. 현상 (코드 정독 + probe 실측)

### 2.1 연혁 모듈은 있는데 한 축만 쓴다

`grep -rl "sec100-3-split-era" lib components app __tests__` → **취득가액 축 2파일**(`lib/tax-engine/housing-excess-acq-contract.ts:86`, `lib/calc/housing-excess-acq-contract.ts`) + 그 anchor뿐.

양도가액 축의 판정 호출 3곳은 날짜 인자가 없다:

| 호출부 | 경로 |
|---|---|
| `lib/tax-engine/transfer-tax-split-sale-price.ts:122` | 주택·토지·건물 구분양도 |
| `lib/tax-engine/general-building-valuation.ts:197` | 일반건물 |
| `lib/tax-engine/general-building-extension.ts:140` | 일반건물 증축 |

공통 leaf `judgeDeemedUnclearSplit`(`sale-split-deemed-unclear.ts`)은 `exemption`이 있으면 무조건 면제, 없으면 무조건 판정한다.

### 2.2 probe 실측 (일회용 vitest, 삭제함)

fixture: 주택 · 양도가액 15억 · 토지 취득 2008-06-01 / 건물 취득 2010-06-01(각 4억 실가) · 양도시 기준시가 토지 9억 / 건물 6억(안분값 9억/6억) · 구분 기재 **토지 14억 / 건물 1억**(`makeMockRates`). 세액은 **같은 양도일끼리만** 비교한다(mock 세율이 날짜 의존).

| 양도일 | 예외 입력 | 현행 결과 | 법 기준 기대 | 판정 |
|---|---|---|---|---|
| **2015-12-31** | 없음 | 의제 발동 → 9억/6억, **241,131,000** | 규정 없음 → 구분 기재 그대로 14억/1억, **218,031,000** ※ | 🔴 +23,100,000 과다 |
| 2016-01-01 | 없음 | 의제 발동 241,131,000 | 동일 | ✅ |
| **2024-12-31** | other_law / demolished | 예외 인정 → 14억/1억, **146,366,000** | 단서 없음 → 의제 발동 9억/6억, **187,726,000** ※ | 🔴 −41,360,000 과소 |
| 2025-01-01 | other_law | 예외 인정 146,366,000 | 동일 | ✅ |
| 2025-02-27 · 02-28 | other_law | 둘 다 예외 인정 | 영 ⑧ 신설일 경계 — **Q-3** | ❓ |

※ 기대값은 코드를 우회해 산출했다 — 2015-12-31은 같은 입력에 `other_law`를 넣어(판정 생략) 얻은 값, 2024-12-31은 예외 미입력 실측값.

**일반건물 2경로(§2.1 2·3행)는 코드 정독으로만 확인**했다(동일 leaf 호출·날짜 인자 없음). 실측은 Pre-Do anchor(§6 A-3)에서 한다.

## 3. 결함 정의

| # | 결함 | 방향 | 해당 구간 |
|---|---|---|---|
| D-1 | 2016.1.1. 전 양도에 30% 의제 발동 | 법 근거 없는 불리 적용 | 양도일 < 2016-01-01 |
| D-2 | 단서(영 §166⑧ 사유) 신고가 2025.1.1. 전 양도에도 인정됨 | 법 근거 없는 유리 적용 | 2016-01-01 ≤ 양도일 < 2025-01-01 |
| D-3 | UI가 모든 양도일에 단서 입력 카드를 노출·양도시 기준시가를 필수화 | D-1·D-2의 입력 쪽 | 해당 구간 전체 |
| D-4 | 결과 화면·고지가 연혁을 말하지 않음(단서가 없던 시기에도 「예외로 인정했습니다」) | 표시 | D-2 구간 |

## 4. 설계

**원칙: 취득가액 축 #2190의 확립된 패턴을 그대로 따른다**(별도 규칙 발명 금지) — 연혁은 `양도일` 하나에서 `sec100_3Era()`로 파생하고, 새 입력 필드는 만들지 않는다.

### 4.1 엔진 (단일 소스)

1. `judgeDeemedUnclearSplit` 입력에 `era: Sec100_3Era`를 **필수**로 추가(선택 인자로 두면 호출부가 또 빠뜨린다 — 이번 결함의 원인과 같은 형태).
   - `none` → 판정하지 않음(`deemedUnclear=false`, `applied=declared`). 이탈률은 **기록하지 않는다**(규정이 없는 시기의 수치를 신고서에 남기면 근거 없는 사실이 된다).
   - `body` → `exemption`이 와도 **무시**하고 판정한다. 무시했다는 사실을 `detail`에 남긴다(`exemptionIgnoredByEra`) — 침묵 후퇴 금지.
   - `body_and_proviso` → 현행과 동일.
2. 호출부 3곳이 `sec100_3Era(transferDate)`를 넘긴다. `BundledSaleAllocationInput`에는 `transferDate`가 **없으므로 추가**한다(§9-①).
3. 취득가액 축 호출(`housing-excess-acq-contract.ts:87`)은 새 필수 인자 때문에 `era`를 넘기게 되나 **동작은 불변**이어야 한다(회귀 0 — 기존 `dec17-6-*` anchor로 고정).
4. `none`에서는 「안분값이 없으면 차단」(`transfer-tax-split-sale-price.ts` L114-120, `sale_split_basis_missing`)을 **건너뛴다** — 판정을 안 하는데 안분값을 요구해 막으면 안 된다.

### 4.2 검증·UI (3중 패턴 — 같은 술어를 엔진·validate·UI가 공유)

- 술어는 `lib/calc/`에 `sec100_3Era` 래퍼 1개(`lib/calc/housing-excess-acq-contract.ts:31-38`이 이미 같은 구조)를 재사용·확장한다. 새 판정 로직을 UI에서 복제하지 않는다.
- **단서 카드**(`SaleSplitBasisExemptionCards.tsx:107` `SaleSplitExemptionCard`): `body_and_proviso`가 아니면 **숨김**. 저장된 `saleSplitExemption` 값은 **지우지 않는다**(양도일을 다시 바꾸면 복원돼야 한다 — 입력 시점 «바꿔 저장» 금지 정책). 엔진이 era로 무시한다.
- **양도시 기준시가 필수화**(`transfer-tax-validate-split.ts:459·465` V7 → `needsSaleStdPart`, `transfer-tax-split-acq-mode.ts:419`) — **Q-2 결정: 풀되 조건부**(§5). `needsSaleStdPart`는 지금 인자 없는 상수(`saleStdPlacement()` = `saleAxis:true`)라 **술어에 문맥(era·`saleSplitMode`·환산 파트 유무)을 넘기도록 시그니처를 넓힌다.** UI 노출과 validate가 같은 술어에서 나와야 하므로(`transfer-tax-split-acq-mode.ts` 주석 · 칸 없는 차단 금지) **두 곳을 같은 PR에서 함께 바꾼다.**
- **결과 표시**(`SaleSplitJudgmentBlock.tsx:48·68·100`): `detail.era`를 읽어 문구를 가른다(재계산 금지 — 기존 `landDeviationBp` 계약과 같은 원칙). 고지 문구 초안:
  - `none`: 「양도일이 2016년 1월 1일 전이라 「소득세법」 제100조 제3항의 30% 판정을 하지 않고 구분 기재 가액을 그대로 썼습니다(법률 제13558호 부칙 제2조②).」 — 취득가액 축 `before_effective` 고지(`housing-excess-acq-contract.ts:126-130`)와 같은 문형.
  - `body`에서 예외가 입력돼 있던 경우: 「양도일이 2025년 1월 1일 전이라 같은 항 단서(영 제166조 제8항)가 적용되지 않아 신고하신 예외를 반영하지 않았습니다(법률 제20615호 부칙 제9조).」
  - 유리·불리 표현 금지(프로젝트 규칙) — 위 두 문구는 사실만 말한다.

### 4.3 14개 동기화 지점

신규 **입력** 필드가 없으므로 ①②③④⑧(폼·초기값·정규화·API 변환) 및 ⑫⑬⑭(Zod·body spread·Route 매핑)는 **변경 없음 — 단, Step 0에서 grep으로 증명**한다(`transferDate`가 3경로 모두 엔진까지 도달하는지). 변경되는 지점: ⑤(단서 카드 가시성) · ⑦(결과 카드 문구) · ⑧(validate 술어, Q-2 결정 시) · **결과 타입 echo 필드** `SaleSplitJudgmentDetail.era`(`types/transfer-split-gain.types.ts`) — 이 타입을 읽는 Print leaf `ALL_LEAVES` 동기화 필요 여부는 **확인 필요**(메모리 `feedback_print_leaf_add_unit_test_sync`).

## 5. 결정 사항 (Q-n) — 2026-10-18 사용자 결정

| # | 질문 | 권고 | 근거 |
|---|---|---|---|
| **Q-1** ✅ | 2016.1.1. 전 양도: 구분 기재가 있으면 그대로 인정(고지만)하는가? | **예 — 결정(권고대로)** | 취득가액 축 #2190 `before_effective`와 동일 방식 |
| **Q-2** ✅ | `none`에서 양도시 기준시가 필수 입력을 해제하는가? | **해제 — 결정. 단 조건부**(아래 §5.1) | 기준시가에는 30% 판정 외 소비처가 있다 |
| **Q-3** ✅ | 2025.1.1.~2025.2.27. 단서 인정 | **현행(2025.1.1. 기준) 유지 — 결정(권고대로)** + 한계로 기록 | 영 ⑧ 부칙에 적용례 없음(V-3), 예규·심판례 미조회 → 임의 변경 금지 |
| **Q-4** ✅ | 단서가 없던 시기의 예외 입력 | **무시+고지 — 결정(권고대로)** | 취득가액 축 선례 · 저장값 보존과 양립 |

### 5.1 Q-2 해제 범위 — 코드로 확인한 소비처 (2026-10-18)

양도시 기준시가(`landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`)는 30% 판정 전용이 **아니다**:

| 소비처 | 위치 | `none`에서 해제 가능? |
|---|---|---|
| 30% 판정의 안분값 | `transfer-tax-split-sale-price.ts:49-50`, `sale-split-apportion-basis.ts` | **가능**(판정을 안 하므로) |
| 안분 방식(`appraisal`·`apportioned`)의 안분 기준 | 같은 파일 — `saleSplitMode !== "actual"`이면 이 값이 곧 **양도가액 구분의 기준**이다 | **불가** — 판정이 아니라 계산 자체에 필요 |
| 환산취득가액의 **분모** | `transfer-tax-split-acq-price.ts:416-417`(`?? 0`으로 읽되, **환산 파트가 비면 엔진이 차단**한다 — Step 0 확인 §9-②) | **불가**(클라이언트에서도 먼저 알려야 한다) |
| 개별주택가격 분할 | `transfer-tax-validate-split.ts` V7-H (`standardPriceAtTransfer`, 별도 필드) | 무관(이미 별도 검증) |

⇒ **해제 조건 = 양도일 `none` ∧ `saleSplitMode === "actual"` ∧ 어느 파트도 환산 취득이 아님.** 이 외에는 현행 필수를 유지한다.
V7 메시지가 「일괄양도 안분·환산취득가 계산에는…」이라 이미 두 소비처를 가리킨다 — 해제 조건을 이 문구와 어긋나지 않게 맞춘다.

> ⚠️ 위험: 조건 판정에 **환산 파트 유무**가 들어가므로, 이 술어를 빠뜨리면 환산 파트의 입력 누락을 클라이언트가 못 잡고 엔진 오류(막다른 길)로 넘어간다. Step 1 anchor에 「`none` + `actual` + 환산 파트 → 여전히 차단」을 **반드시** 넣고, Step 4 뮤테이션에 「환산 조건 제거」를 추가한다.
> 엔진의 「안분값 없으면 차단」(`transfer-tax-split-sale-price.ts` L114-120)도 같은 조건에서만 건너뛴다 — 환산 분모는 `transfer-tax-split-acq-price.ts`가 별도로 막는다(§9-②).

## 6. 실행 계획 (Do) — 시퀀셜

| Step | 내용 | verify |
|---|---|---|
| **0** | 사실 확인: ① 일반건물 2경로 입력에 `transferDate` 도달 ② §5.1 소비처 표 재확인(특히 환산 분모를 `none`에서 누가 막는지) ③ Print leaf 영향 ④ 14지점 grep | 각 항목을 표로 기록 — 하나라도 「확인 불가」면 해당 Step 보류 |
| **1** | **Pre-Do anchor 먼저**(현행에서 실패해야 함) A-1 주택 `none` 경계 2015-12-31/2016-01-01 · A-2 주택 `body` 예외 무시 2024-12-31/2025-01-01 · A-3 일반건물 2경로 동일 경계 · A-4 취득가액 축 불변 · **A-5 `none`+`actual`: 기준시가 없이 통과 / `none`+`actual`+환산 파트: 여전히 차단 / `none`+안분 모드: 여전히 차단** | 모두 **빨강**으로 시작 확인 |
| **2** | 엔진: leaf `era` 필수화 + 호출부 4곳 + `none` 기준시가 차단 skip + detail echo | A-1~A-4 초록, `__tests__/tax-engine/` 전체 통과 |
| **3** | validate·UI·결과 문구(Q-2·Q-4 결정 반영) | 컴포넌트 테스트 + Playwright로 브라우저 확인(양도일을 2015·2023·2025로 바꿔 카드 가시성·문구·계산) |
| **4** | 뮤테이션 probe: `era` 인자 제거 / `body` 분기 제거 / 경계 `<`↔`<=` / 해제 조건에서 환산 파트 항 제거 각각이 anchor에서 **KILLED** | 4종(era 인자·`body` 분기·경계·**해제 조건의 환산 파트 항**) 전부 KILLED |
| **5** | `npm run check:pre-pr` · ship는 PR 생성 후 `gh pr checks`의 **롤업 conclusion**으로 판정(`--watch` exit code 불신) | 전건 SUCCESS + headRefOid 일치 |

### 6.1 깨질 기존 테스트 (정독으로 식별 — Step 2에서 실측)

예외를 쓰면서 양도일이 2025.1.1. **전**인 파일이다. **단언을 뒤집지 말고 양도일을 2025-01-01 이후로 옮긴다**(공유 단언 반전은 형제 안전망을 지운다 — 같은 위치에 `body` 구간 반례를 **추가**해 안전망 유지):

| 파일 | 양도일 |
|---|---|
| `__tests__/calc/split-appraisal-exemption-plumbing.test.ts` | 2024-06-01 |
| `__tests__/tax-engine/transfer/sale-split-30pct-engine.anchor.test.ts` (U-8-5) | 2024-06-01 |
| `__tests__/calc/gb-sale-split-plumbing.test.ts` | 2023-02-19 |
| `__tests__/tax-engine/transfer-tax/general-building-sale-split-30pct.anchor.test.ts` | 2023-02-19 |
| `__tests__/components/sale-split-judgment-display.test.tsx` | 2024-06-01 · 2023-06-01 |

`split-overflow-guard-…-f37.test.ts`·E2E 헬퍼 2건(`validation-field-jump-cases-{gb,leaf}.ts`)은 날짜를 grep으로 못 읽었다 — **Step 0에서 확인**.

## 7. 범위 밖 (이 계획에서 하지 않는다)

- **취득가액 일반 경로의 §100③**: 현재 같은 날 취득한 주택의 배율 초과 부수토지 분리에만 판정이 있다(#2190 결정 #17-6 범위). 확대는 별건.
- **부가령 §64①1호 단서(감정평가가액 우선)의 시행시기**: 소령 §166⑥이 가리키는 안분 방법의 연혁이다. 이번에 부가령 §64 본문을 2021·2022·2024·2025 시점으로 읽어 단서가 **2021.1.1.에는 이미 있음**까지만 확인했고, **그 이전(2016~2020) 시점은 조회에 실패해 미확인**이다 → 별도 연혁 조사 대상(`feedback_era_gate_needs_version_text_and_addenda`).
- 2016.1.1. 전 양도의 §100② **개별 「불분명」 판단**(조세심판례) — 계산기 영역 밖.

## 8. 검증 레지스터

| # | 주장 | 상태 | 확인 방법 |
|---|---|---|---|
| V-1 | 본문 2016.1.1. 이후 양도분 | ✅ | 법률 제13558호 부칙 원문(DRF) |
| V-2 | 단서 2025.1.1. 이후 양도분 | ✅ | 법률 제20615호 부칙 제9조(MCP `applicable_law`) + 시행본 대조 |
| V-3 | 영 §166⑧ 2025.2.28. 공포일 시행·적용례 없음 | ✅ | 영 제35349호 부칙 전문 검색 |
| V-4 | 기존 `sec100_3Era`가 위와 일치 | ✅ | `sec100-3-split-era.ts:1-16` 대조 |
| V-5 | 양도가액 축 3곳 날짜 인자 없음 | ✅ | `grep -rl "sec100-3-split-era"` 결과 + 호출부 정독 |
| V-6 | 주택 경로 경계별 오동작 | ✅ 실측 | §2.2 probe |
| V-7 | 일반건물 2경로 오동작 | ⚠️ 정독만 | Step 1 A-3에서 실측 |
| V-8 | 영 ⑧ 신설 전 53일 구간 처리 | ❓ 미확인 | Q-3 |

## 9. Step 0 결과 (2026-10-18, master `93f9feac0`) — 계획 보정

| # | 확인 항목 | 결과 | 계획에 미치는 영향 |
|---|---|---|---|
| ① | 일반건물 2경로·실가 경로에 `transferDate`가 도달하는가 | ✅ `GeneralBuildingInput.transferDate: Date`(`general-building.types.ts:32`)와 실가 payload(`general-building-route-actual.ts:41·224`)에 모두 있다. **그러나** 공유 leaf 입력 `BundledSaleAllocationInput`(`general-building-valuation.ts:~109`)에는 필드가 없고, 실가 경로 호출(`route-actual.ts:337` `resolveSaleAllocation`)도 안 넘긴다 | `BundledSaleAllocationInput`에 `transferDate`(필수) 추가 + 두 호출부 전달. 증축 경로(`general-building-extension.ts`)는 `GeneralBuildingInput`을 통째로 받아 추가 배선 불필요 |
| ② | 환산 분모를 누가 막는가 / Q-2 해제 범위 | ✅ 엔진 `transfer-tax-split-acq-price.ts:~440`이 **환산 파트의 양도시 기준시가 누락 시 차단**(`missing` 목록). 비-환산 파트는 0 허용. **일반건물 경로는 양도시 기준시가가 `GeneralBuildingInput`의 필수 타입 필드**(환산 분모) | **Q-2 해제는 split(주택·건물 분할) V7 한 곳만.** 일반건물 경로는 해제 대상이 아니다. §5.1 문구도 정정(「조용히 0」은 틀렸다 — 환산 파트는 엔진이 막는다) |
| ③ | Print leaf 영향 | ✅ 없음 — `saleSplitJudgment`·`deemedUnclear`를 `lib/print`·`components/print`에서 참조하는 곳 0건. 소비처는 엔진 + 결과 컴포넌트 4개(`BundledAllocationCard` · `GeneralBuildingValuationDetailCard` · `SplitGainDetailSection` · `SaleSplitJudgmentBlock`) | Print `ALL_LEAVES` 동기화 불필요. 결과 컴포넌트 4개의 문구 갱신만 |
| ④ | 14지점 | ⑫⑬⑭ **변경 없음 확인**: 새 입력 없음, `transferDate`는 Zod `z.string().date()`(`transfer-tax-schema-base-shape.ts:57`)→`toDate`→엔진까지 기존 경로. **④ API 변환은 변경 대상**: 예외 전송(`transfer-tax-api-split.ts:257-261` · `transfer-tax-api-gb.ts:163`)도 같은 era 술어로 게이트(3중 패턴 — 화면에서 숨긴 값이 요청 body에 남지 않게) | 엔진이 최종 안전망으로 무시하되, ④에서도 보내지 않는다 |
| ⑤ | **신규 발견** — 예외 근거 필수 검증이 era를 모른다 | 🔴 split V9(`transfer-tax-validate-split.ts:545`)와 일반건물 R-5(`transfer-tax-validate-gb-sale.ts` 「R-5」 블록)가 `saleSplitExemption`이 저장돼 있으면 `saleSplitExemptionNote`를 요구한다. 단서 카드를 숨기면(§4.2) **칸이 없는데 차단되는 막다른 길**이 된다 | 두 검증도 `body_and_proviso`일 때만 근거를 요구하도록 era 조건 추가 — **계획 §4.2에 없던 항목** |
| ⑥ | **신규 발견** — validate 체인에 양도일이 없다 | `validateSplitDirectInputs(rawAsset, label)`(`transfer-tax-validate-split.ts:245`)은 3곳에서 호출된다(`validate-acquisition.ts:403·770`, `validate-building-cause.ts:35`). `validateGbSaleAxis(asset, label, isBurdenedGiftGB)`(`validate-gb-sale.ts:19`)도 양도일 인자가 없다. 상위 `validate-asset.ts:256`은 `form.transferDate`를 이미 갖고 있다(주택 초과 부수토지 검증에는 넘김) | 양도일(`string \| undefined`)을 이 두 체인에 **스레딩**해야 한다. 변경 파일 수가 늘어난다 — Step 3 범위 재산정 |
| ⑦ | 경계일 타임존 | ✅ 위험 없음 — Zod가 `YYYY-MM-DD`만 받고 `toDate`는 `new Date("YYYY-MM-DD")`(UTC 자정)이라 `sec100_3Era`의 `toISOString` 일자와 일치한다. 단 **UTC 자정이 아닌 `Date`가 직접 들어오면 경계일에 하루 어긋난다**(현 경로엔 없음) → Step 1 anchor는 `"YYYY-MM-DD"` 문자열과 UTC 자정 `Date` 두 형태로 경계를 고정 | 문서화 + anchor |
| ⑧ | `none` 구간이 실제로 도달 가능한가 | ✅ 지원 하한이 1990-01-01(`transfer-supported-period.ts:10`)이라 **1990~2015 양도가 모두 `none`** | — |

### 9.1 Step 3(검증·UI) 범위 재산정

변경 지점: split V7(Q-2 조건부 해제) · split V9 · 일반건물 R-5 · `needsSaleStdPart` 시그니처 · 단서 카드 가시성 · 기준시가 카드 가시성(`saleStdPlacement` 쪽) · ④ 전송 2곳 · 결과 컴포넌트 4개 · validate 체인 양도일 스레딩(호출 3+1곳).
**기준시가 카드 가시성은 validate와 같은 술어에서 나와야 한다**(`needsSaleStdPart` 주석의 막다른 길 규칙) — Step 3은 한 PR에서 둘을 함께 바꾼다.

## 10. 실행 결과 (2026-10-18) — 계획 대비 변경점

| Step | 결과 |
|---|---|
| 1 Pre-Do anchor | 22건 작성 → 현행에서 **14건 실패**(주택·일반건물 환산·일반건물 실가 3경로 오동작 실측 확정 — V-7 해소) |
| 2 엔진 | leaf `era` 필수화 + 호출부 4곳(주택 split · 일반건물 환산·실가 공유 leaf · 증축) 전달. anchor 28건 통과 |
| 3 검증·UI·표시 | 아래 §10.1. 기존 테스트 깨짐은 **예측 8건 + 추가 12건**(전부 «양도일이 단서 시행 전인데 예외를 쓰는» 케이스) → 양도일을 2025로 옮기고 단서 시행 전 **반례를 같은 자리에 추가** |
| 4 뮤테이션 | 아래 §10.2 — 24종 중 **초기 5종 생존**(증축 경로 · none 안분값 차단 skip · 진입 함수 체인 3갈래)을 anchor로 메워 **전부 KILLED** |

### 10.1 계획과 달라진 점 (실행 중 결정)

1. **`none` 구간의 이탈률 기록**: 계획 §4.1은 «기록하지 않는다»였으나 **기록하되 표시하지 않는 것**으로 바꿨다. 취득가액 축이 `before_effective`에서도 이탈률을 싣고 표시 계층이 숨기는 선례가 있고(`AcqSplitJudgmentBlock.tsx:47`), 안분값이 있으면 공통 leaf가 사실을 계산하는 편이 단순하다. 안분값이 **없을 때만** 0·false이고 `apportioned`·`basisKind`는 생략된다(타입을 optional로).
2. **Q-2 기준시가 해제는 validate만**: 기준시가 **카드 노출**(`saleStdPlacement`, 6개 컴포넌트)은 건드리지 않았다. 카드에 «필수» 표시가 없어(`TransferStdPriceCards.tsx`) 노출된 채 선택 입력이 되는 것은 막다른 길이 아니고, 6개 컴포넌트에 문맥을 내리는 변경은 이득 대비 범위가 컸다. 계획 §9.1의 «노출과 validate를 같은 술어로»는 **요구(validate)가 노출보다 좁아지는 방향**이라 안전하다고 판단했다.
3. **일반건물 경로의 기준시가는 해제 대상이 아니다**(§9-②) — `GeneralBuildingInput`의 필수 타입 필드.
4. **취득가액 축 호출부**(`housing-excess-acq-contract.ts`): 새 필수 인자 `era`를 넘기고, 예외 선별(`era === "body_and_proviso" &&`)을 leaf로 옮겼다. 동작 불변(기존 `dec17-6-*` anchor 통과).
5. **예외 근거 필수 검증 2곳**(split V9 · 일반건물 R-5)과 **API 전송 2곳**도 같은 구간 게이트 — 계획 §4.2에 없던 항목(§9-⑤).

### 10.2 뮤테이션 결과

엔진 5(leaf none 분기 · 예외 효력 · 경계 3종) · 호출부 5(주택·일반건물·증축·실가 날짜 전달 · none 안분값 skip) · validate·전송·UI 9(해제 조건 3항 · V9/R-5 게이트 2 · API 전송 2 · 카드 가림 2) · 스레딩 5(진입 함수 → split 검증: 일반 1 · 신축 1 · 건물 원인 혼합 2지점, 일반건물 1) = 24종 **전부 KILLED**. 이 과정에서 하네스가 zsh 단어분할로 **빈 결과를 SURVIVED로 오판**하는 것을 발견해(`feedback_mutation_harness_zsh_no_word_split`) 빈 출력을 ERROR로 처리하도록 고쳤다.

### 10.3 남은 한계 (미결 아님 — 범위 밖 또는 자료 부재)

- **Q-3**: 2025.1.1.~2025.2.27. 구간은 법 부칙(2025.1.1.) 기준 유지 — 예규·심판례 **미조회**(V-8).
- **감정평가 비교 기준 카드**(«30% 판정 비교 기준으로 감정평가가액 사용»)는 `none` 구간에서도 노출된다 — 판정이 없는 구간에서 문구가 맞지 않으나 입력 칸 숨김은 V8(감정 3필드 all-or-nothing)과 얽혀 이번 범위에서 제외했다.
- 브라우저 확인: 필드점프 E2E 2건(양도일 2025 입력 시 근거 오류가 나는 것)만 실행. 양도일 입력값을 바꿔 가며 예외 카드가 나타나고 사라지는 화면은 **컴포넌트 테스트로만** 검증했다(실브라우저 미확인).
