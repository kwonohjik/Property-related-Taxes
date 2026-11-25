# 재산세 별도합산 철거·허가 칸 «순차 노출» — 화면·클라이언트(⑤⑦⑧·④⑫ 소비) 계획서

> 상태: **Plan v2 (2026-11-25 — 코드 변경 0)**. 사용자 결정 2026-11-25 «**순차 노출로 변경**»(「현행 유지」는 기각됨) + **UQ-S1~S5·SQ-1~6 전부 추천안 채택(§0.0) — 미결 0건**. 엔진 정본 = `docs/01-plan/features/property-separate-demolished-sequential.engine.plan.md`(**이름·분할 정합 완료** — §3.3). 이 문서의 export 이름은 엔진 §2.3과 같다.
> 선행 계획서: `property-separate-demolished-requirements.ui.plan.md`(PSA-U1/U2) · `…engine.plan.md`(PSA-E1~E4). 이 문서는 그 위에서 **노출 규칙·칸 위치·고지만** 바꾼다 — 판정(세액)은 바뀌지 않는다(§1.5 probe 근거).
> 근거 표기: file:line = 워크트리 `Property-related-Taxes-psa-seq-plan`(origin/master `2fbfa9032`)에서 이 세션이 직접 읽은 줄. 동작은 throwaway `tsx` probe(scratchpad — 저장소 변경 0)로 실측한 것만 단정했다. 정독만 한 곳은 «정독», 못 본 곳은 «확인 필요».
> **재제안 금지**: 현행 유지(기각) · 과세기준일(6.1.) 단위 접기 · 자동 안분 fallback · `useEffect → store` 미러링 · native radio/checkbox/date · placeholder 숫자 예시 · 법 근거 없는 유리/불리 표현.

---

## 0. 한눈에

### 0.0 사용자 결정 2026-11-25 (이 문서는 이 표를 전제로 한다 — 전부 추천안)

| 결정 | 내용 | 엔진 문서 |
|---|---|---|
| UQ-S1 | 엄격 순차 노출(답이 있는 칸 + 첫 미답 칸까지만) | — |
| UQ-S2·S3 = SQ-3 | 재배치 — **토지 면적·공장 → 철거 토글 → 허가 또는 철거 사슬 → 확정 안내 → 용도지역·바닥면적(사슬 끝)** | SQ-3 |
| UQ-S4 = SQ-2 | 빈집정비 자리 날짜 의존 — 일반 한시 기간 밖이면 종류 뒤 관문, 안이면 건축 외 «예» 뒤 단서 하위 | SQ-2 |
| UQ-S5 | 결과 카드에 «묻지 않은 칸» 줄 추가 안 함 | — |
| SQ-1 | 엔진 구현 = 사슬 걷기 | SQ-1 |
| SQ-4 | 숨은 답 보존 + 다시 나타날 때 «이전에 고른 답» 표시(§2.1-5) | SQ-4 |
| SQ-5·6 | 날짜 확정 접힘 고지 병기 · 직접 호출 사유 `input` → `period`/`not_yet` | SQ-5·6 |
| PR | 엔진 문서 PSA-S1 → S2 → SU → SX(§8) | §6 |

### 0.1 문제 (사용자 보고 + 실측)

요구 칸이 **날짜·종류로만** 정해져(`propertyDemolishedRequired` — `lib/tax-engine/property-separate-requirements.ts:94`), 앞 답이 결과를 확정해도 뒤 칸을 계속 묻는다. 비철거 허가 칸(`buildingPermitNeedOf`)도 용도지역·바닥면적과 무관하게 열려 «허가 아니오»인데 그 두 칸을 계속 요구한다(`shared.ts:453-463`).

| # | 현행 | 실측(엔진 probe, §1.5) |
|---|---|---|
| P-1 | 철거 3년 초과·1년 초과 등 기간 밖이면 사실 칸 0 + 안내 한 줄(이미 순차에 가까움) | 현행 유지(안내만 새 확정 안내로 통합) |
| P-2 | **주택 · 철거일이 일반 한시 기간(2026시행본 1년)을 넘고 3년 안**인데 허가·건축 외 용도를 먼저 묻고 맨 아래 빈집정비 «아니오» | probe A·B: 빈집정비 «아니오»·«모름» → **기간 초과로 접힘**(허가·건축 외 답은 판정에 영향 0) |
| P-3 | 허가 «아니오» → 건축 외 용도·(건축물이면) 바닥면적·용도지역까지 요구 | probe C·D: 엔진은 허가 «아니오»에서 이미 접고 뒤 칸을 읽지 않음 |
| P-4 | 건축 외 용도 «아니오» + 주택(일반 한시 기간 안) → 빈집정비 요구 | probe F: 빈집정비 미입력인데도 `holds` — **불필요한 요구** |
| P-5 | 비철거 허가 «아니오»인데 용도지역·바닥면적 요구 | §1.5 N1(접힘) — 면적을 읽지 않아도 접힘 |
| P-6 | 허가 칸이 «건물 바닥면적» 뒤·«건축물 철거 완료» 토글 **앞** | sync-checker Low-2 «모드 토글은 영향 필드 직전»에 어긋남 |

### 0.2 설계 한 줄

**엔진이 «답 의존 사슬»(다음에 물을 칸 목록 + 접힘 확정 여부)을 단일 소스로 내고, 화면은 그 목록의 첫 미선택 칸까지만 그린다.** 접힘이 확정되면 그 자리에 «이 답으로 별도합산 불성립(종합합산 이관)이 확정되어 나머지 칸은 묻지 않습니다» 안내를 보인다. 화면은 날짜·답을 해석하지 않는다(UI 자체 판단 금지 — `useEffect → store` 없음, 전부 렌더 파생).

### 0.3 변경 범위 요약

| 구역 | 변경 |
|---|---|
| 노출 | 철거 경로·비철거 경로 모두 «첫 미선택 칸까지» 엄격 순차 노출(UQ-S1 가) |
| 칸 순서 | 토지 면적 → 공장용지 → **철거 토글** → (OFF: 허가 / ON: 철거일·종류·사실 사슬) → 확정 안내 → **용도지역·바닥면적(사슬 끝에서만)** (UQ-S2·S3 가) |
| ⑧ | `validateStep(2)`의 «첫 결함» = 사슬의 **첫 미선택 칸** — 막힌 칸이 항상 화면의 마지막 질문 |
| ④ | **화면이 연 칸 + 답이 있는 칸만** 전송(숨은 stale 값 미전송 — 현행 정책의 확장) |
| ⑦ | 결과 «입력이 필요했던 칸» = **실제 물은 칸**(엔진 echo가 바뀜) |
| 세액 | 변화 없음(판정 동일) — 단 §1.5 N2/N3 엔진 순서 수정이 선행 조건 |

---

## 1. 현행 실측

### 1.1 위젯 칸 순서·노출 조건

`Step2SeparateAggregate.tsx`(127줄) 위→아래:

| 순서 | 칸 | 줄 | 노출 | 비고 |
|---|---|---|---|---|
| 1 | 용도지역 라디오 | :34-47 | **항상** | ⑧ 비철거 1순위 |
| 2 | 토지 면적 | :49-59 | 항상 | 철거 경로도 ⑧ 필수(`shared.ts:437`) |
| 3 | 공장용지 토글 | :62-68 | 항상 | 철거 ∧ 종류 «주택»과 모순 차단 |
| 4 | 건물 바닥면적 | :71-89 | 항상. 철거면 «철거 전 …» + `needFloor`일 때만 `*` | 힌트가 «주택이면 입력하지 않아도 됩니다» |
| 5 | **비철거 허가·사용승인** | :91-92 | `!saDemolished ∧ buildingPermitNeedOf()` | `SeparateAggregateBuildingPermit.tsx:42` |
| 6 | 건축물 철거 완료 토글 | :98-104 | 항상 | 5번이 이 토글 **앞** — Low-2 |
| 7 | 철거일 | :110-120 | 토글 ON | |
| 8 | 철거 사실 블록 | :122 → `SeparateAggregateDemolishedFacts.tsx` | 토글 ON | 아래 표 |

`SeparateAggregateDemolishedFacts.tsx`(224줄) 블록 안 순서: 종류(항상, :86~) → 모순 `role="alert"`(:102) → 입력 안내 `pt-demolished-dates-notice`(:109) → 요구 칸 0 안내 `pt-sa-demolished-no-facts`(:115, `noFactsNotice` — 기간 초과·2016.6.1. 전·시행본 문언 없음을 한 문장으로) → 허가(`need.permit`) → 건축 외 용도(`need.otherUse`) → 빈집정비(`need.vacantHouse`) → 공용 사용(`need.publicUse`, 하위 `ToneCard violet`) → 유료(`need.publicUsePaid`).
- 노출 = `demolishedNeedOf`(`lib/calc/property-separate-requirements.ts:50`)가 엔진 `propertyDemolishedRequired`(:94)·`propertyDemolishedPublicUseAsked`(:111)를 부른 값. **공용·유료만 «앞 답 의존»** 이고 나머지(허가·건축 외·빈집정비·바닥면적)는 날짜·종류로만 열린다 — 사용자 보고의 원인.
- 힌트가 뒤 칸을 가리킨다: 건축 외 용도 힌트의 «아래 빈집정비 칸에서 «예»…»(`need.vacantHouse`일 때 :142 `hint` 템플릿).
- 데이터 id: `pt-sa-demolished-{kind|permit|otheruse|vacanthouse|publicuse|publicusepaid}-{yes|no|unknown}`, 점프 앵커 `data-field`(`demolishedPermit` 등), 비철거 `pt-sa-permit-*`·`data-field="buildingPermit"`.

### 1.2 ⑧ — `validateStep(2)` (`shared.ts:432-463`)

- 철거: 토지 면적 → `demolishedFactIssueOf`(엔진 `propertyDemolishedFactIssue`:180 — 날짜 → 종류 → 기준일 뒤 → 공장×주택 → 허가 → 건축 외 → 빈집정비 → 공용 → 유료 → **바닥면적 → 용도지역**).
- 비철거: 용도지역 → 토지 면적 → 바닥면적 → 허가(`buildingPermitIssueOf`).
- **필드 점프는 없다**: `PropertyTaxForm.tsx:112-146`은 `setError(message)` + `setStep(step)`만 한다(`data-field`를 읽는 코드 0 — grep). 선행 UQ-6가 «필드 점프 신설 안 함»으로 결정. `firstInvalidStep`(:552)은 0 → 1 → 2 → 3 순서로 첫 실패 단계만 돌려준다.
- ⑫ 짝: `lib/validators/property-input.ts:459-509` — 철거는 `propertyDemolishedFactIssue`, 비철거는 **용도지역·바닥면적 무조건 요구 + 허가**(`:480-` 부근).

### 1.3 결과 카드·PDF

`PropertyLandSplitCard.tsx:134-143` → `propertyDemolishedVerdictLines`(`lib/calc/property-demolished-verdict-text.ts:40`): 한시 기간 · 판정 · (holds)면적 범위 · **입력이 필요했던 칸**(`requiredText`:24 — 엔진 echo `verdict.required`) · (빈집 미확인)확인 필요. PDF도 같은 함수(`lib/pdf/ResultPdfDocument.tsx:217`). 비철거 허가 접힘은 판정 블록이 없고 `land-split-reasons` + 엔진 고지로만 나온다.

### 1.4 테스트 현황

- 렌더 격자: `property-separate-demolished-render-grid.anchor.test.tsx`(223줄 — 연도 4 × 철거일 ~10 × 종류 3 × 공장 2 × 바닥면적 2 × 정책 4, 연도별 180초 제한) · `property-building-permit-render-grid.anchor.test.tsx`(172줄 — 연도 4 × 철거 2 × 공장 2 × 답 4 + «칸 순서 = 용도지역 → 바닥면적 → 허가, 철거 토글보다 앞» 단언 :135-143).
- 위젯: `property-separate-demolished-facts.anchor.test.tsx`(374줄). ④: `property-demolished-body`·`property-building-permit-body`. ⑧↔⑫: `__tests__/calc/property-{demolished,building-permit,precalc}-parity-grid.anchor.test.ts`, `__tests__/api/property.route.{separate-aggregate-required,demolished-requirements,building-permit,land-split-inputs}.anchor.test.ts`, `property-shared.test.ts`.
- E2E 3개 + 헬퍼: `e2e/property-separate-demolished-requirements.spec.ts`(231줄) · `e2e/property-separate-building-permit.spec.ts`(137줄) · `e2e/property-land-split.spec.ts`(:33·51·66·83·128이 `fillSeparateDetail` 사용) · 헬퍼 `e2e/_helpers/property-land.ts:fillSeparateDetail/fillDemolished`(**용도지역 → 면적 → 바닥면적을 위치(`.first()`/`.nth(1)`)로 채우고, 사실 칸은 고정 순서 허가 → 건축 외 → 빈집정비 → 공용 → 유료로 `check()`**).

### 1.5 엔진 probe (이 세션 · scratchpad `probe1.ts`·`probe2.ts`, 2026 시행본 s=2026-06-01 — 일반 12개월 · 빈집정비 36개월)

| 시료 | 입력(미입력 칸은 안 보냄) | 결과 |
|---|---|---|
| A | 주택 · 철거 2024-05-10(25개월) · 빈집정비 «아니오» | `fold period` — 허가·건축 외 답과 무관 |
| B | 〃 · 빈집정비 «모름» | `fold period`(+ 3년 연장 미확인 고지 경로) |
| C | 건축물 3개월 전 · 허가 «아니오» | `fold permit`(건축 외·바닥면적 미입력에도 접힘) |
| D | 〃 · 허가 «예» · 건축 외 «예» (바닥면적·용도지역 미입력) | `fold other_use` |
| E | 주택 3개월 전 · 허가 예 · 건축 외 예 · 빈집정비 «아니오» | `fold other_use` |
| F | 주택 3개월 전 · 허가 예 · 건축 외 «아니오» · **빈집정비 미입력** | **`holds`** (현행 술어는 빈집정비를 요구) |
| G | 주택 25개월 전 · 빈집정비 예 · 허가 예 · 건축 외 아니오 | `holds`, 기간 36개월 |
| N1 | 비철거 · 허가 «아니오» · 용도지역·바닥면적 있음 | 접힘 `buildingPermitFolded=true`, 합산 칸 요구 = 종합합산 O |
| **N2** | 비철거 · 허가 «아니오» · **용도지역·바닥면적 미전송** | 접힘이지만 **고지가 «건축물이 없는 토지는 종합합산과세대상입니다.»**, `buildingPermitFolded` 없음 — 사유 오표기 |
| **N3** | 비철거 · 허가 «아니오» · **바닥면적만 있고 용도지역 미전송** | **throw**(용도지역 «undefined») → `propertyLandSplitRequiredFor`가 `catch → 요구 없음`(`property-land-split-tax.ts:100` `catch`) → **Step 3 합산 칸 요구가 침묵으로 사라짐** |
| N4 | 비철거 · 허가 «아니오» · 바닥면적 미전송 | N2와 같은 «건축물 없음» 고지 |
| D1·D2 | 철거 · 허가 «아니오» / 허가 예 · 건축 외 아니오(면적 미전송) | 각각 `fold permit`·`fold area_input`(합산 칸 요구 O) — 철거 판정 leaf는 이미 앞에서 접으면 뒤를 읽지 않는다 |

결론: ① **철거 경로의 판정 결과는 이미 앞 답에서 접힌다**(위 A~G) — 다만 현행 leaf는 종류 부재를 날짜보다 먼저 `input` 처리(`:334`)하고 빈집정비를 기간 판정 앞에서 무조건 읽으므로(`:338`) **엔진은 leaf를 사슬 걷기로 재구성**한다(엔진 문서 §2.4 · SQ-1 결정). 판정 동치는 엔진 격자(202,752셀)가 확인했다. ② **비철거 경로는 엔진이 `hasBuilding`(`separate-aggregate-land.ts:223`)·용도지역·바닥면적을 허가 판정(:334)보다 먼저 읽는다** — 화면이 이 두 칸을 숨기고 보내지 않으면 N2/N3이 된다. 비철거 허가 판정을 앞으로 옮기는 것이 **엔진 선행 조건**(§3 E-S2). ③ 세액은 사슬 단축으로 바뀌지 않는다(접힘 판정 = 앞 답에서 이미 확정).

---

## 2. 순차 노출 설계

### 2.1 원칙

1. **사슬 = 엔진 정본.** 어떤 칸을 어떤 순서로 묻는지·어디서 확정되는지는 엔진 `…Chain` 결과(§3.1) 하나다. 화면은 칸 id → 렌더러 맵을 `order` 순서로 그릴 뿐 날짜·시행본·답을 비교하지 않는다.
2. **엄격 순차(UQ-S1 가).** 그린 칸 = «답이 있는 칸들 + 첫 미선택 칸(next)». next 뒤 칸은 그리지 않는다(DOM에 없음 — `display:none` 금지: ⑧↔DOM 단언을 단순하게 유지).
3. **입구는 철거일 1칸만 항상 노출**(3칸 부분 입력이 가능한 `DateInput`이라 깜박임을 피함). **종류는 `chain.order`에 있을 때만** 그린다 — 철거일이 가장 긴 한시 기간 밖이거나 과세기준일이 시행 전이면 날짜만으로 접힘이 확정되어 종류를 묻지 않는다(엔진 §2.5 — 이 문서의 이전 판 «종류 항상 노출»을 정정). 철거일이 비었거나 읽을 수 없으면 철거일 칸 + 현행 `pt-demolished-dates-notice`(문구는 «철거일을 입력하면 이어서 필요한 칸이 표시됩니다.»)만 보인다.
4. **확정(`chain.resolved`) = 엔진이 낸다.** 접힘이 확정되면 next = null, 뒤 칸 0, 확정 안내 1개. ⑧은 통과(막을 칸 없음) → «다음»·계산 진행. 계산 결과는 종합합산 이관 + 엔진 고지.
5. **숨은 값 보존·복원 + «이전에 고른 답» 표시(SQ-4 결정).** 확정으로 숨은 칸의 저장값은 지우지 않는다(위젯은 `onChange`로 클릭한 칸 하나만 패치 — 현행 그대로). 앞 답을 바꿔 사슬이 다시 길어지면 저장값이 **선택된 채** 다시 나타나는데, 사용자가 다시 확인했는지 알 수 있도록 그 카드에 **«이전에 고른 답»** 표식(`data-testid="pt-sa-prev-answer-{field}"` · 색만이 아닌 텍스트)을 붙인다. 표식 규칙(렌더 파생 + 핸들러 갱신 — `useEffect → store` 없음): 사실 칸 컴포넌트가 `useRef<Set<field>>`(확인 집합)를 들고, ① 칸을 클릭(`onChange`)하면 그 칸을 집합에 넣고 ② 같은 핸들러에서 «패치 반영 뒤 엔진 `chain.order`에 더 이상 없는 칸»을 집합에서 뺀다(그 칸은 숨었으므로 다음에 다시 열리면 미확인). 표식 = «그려졌고 · 저장값이 있고 · 확인 집합에 없음». 마운트 직후(단계 이동 후 복귀 포함) 저장값이 있는 칸은 같은 이유로 표식이 붙는다. ④는 «화면이 연 칸»만 전송(§2.7).
6. **계산 순서 = 표시 순서 = 엔진 판정 순서.** 판정 leaf의 접힘 우선순위(기간 → 허가 → 건축 외 → 공용·유료 → 면적)가 사슬 순서다. 단 빈집정비는 «기간을 정하는 답»이라 확장창에서는 **허가보다 앞**(§2.2 · SQ-2 결정).

### 2.2 철거 경로 사슬 (엔진 문서 §2.1 단계 표와 같은 모양 — 정합 완료)

2026 시행본(일반 12개월·빈집 36개월·허가/건축 외/빈집/면적 문언 모두 시행)을 예로 든다. 시행본별 칸 생략(2019.6.1. 전 허가 없음, 2024.6.1. 전 건축 외·빈집·면적 없음)은 엔진이 정한다 — 화면은 `order`에 없으면 그리지 않는다.

| 단계 | 칸 | 답 → 다음 |
|---|---|---|
| 입구 | 철거일(종류는 `order`에 있을 때만) | 철거일 > 기준일 → 모순 안내(차단) · 기준일 2016.6.1. 전 → **확정 not_yet**(종류 안 물음) · 철거일이 가장 긴 한시 기간 밖 → **확정 period**(종류 안 물음) · 그 안 → 종류 칸 |
| Q1 | **빈집정비(관문)** — `vacantHousePosition === "gate"`일 때만: 주택 ∧ 철거일이 일반 기간 밖·빈집 기간 안(건축물이면 이 단계 없이 **확정 period**) | 예 → Q2 · 아니오·모름 → **확정 period** |
| Q2 | 허가·사용승인 | 예 → Q3 · 아니오·모름 → **확정 permit** |
| Q3 | 철거 후 건축 외 용도 | 아니오 → Q7(건축물)/종료(주택) · 모름 → **확정 other_use** · 예 → (주택 ∧ 빈집 문언 시행본) Q4 / 그 밖 **확정 other_use** |
| Q4 | 빈집정비(단서 하위, `vacantHousePosition === "proviso"`) — Q1에서 이미 물었으면 생략 | 예 → Q5 · 아니오·모름 → **확정 other_use** |
| Q5 | 국가 등 공용·공공용 사용 | 예 → Q6 · 아니오·모름 → **확정 other_use** |
| Q6 | 유료 여부 | 예 → 종료 · 아니오 → **확정 public_use_unpaid** · 모름 → **확정 other_use** |
| Q7 | **용도지역 + 철거 전 바닥면적**(건축물 ∧ 면적 문언 시행본) | 둘 다 입력 → 종료(holds) |

접힘 사유·확정 지점은 현행 판정 leaf와 같다(`judgePropertyDemolishedLand`:310-377 정독 — 접힘 순서 period → permit → other_use(+단서) → area). 사슬 종료·확정 후 «빈칸 없음» → ⑧ 통과.

### 2.3 비철거 경로 사슬

| 단계 | 칸 | 답 → 다음 |
|---|---|---|
| R1 | 허가·사용승인(과세기준일 2011.6.1.~ 시행본만 — 엔진 `propertyBuildingChain().permit`, 어댑터 `buildingChainOf`) | 예 → R2 · 아니오·모름 → **확정 building_permit** |
| R2 | **용도지역 + 건물 바닥면적** | 둘 다 입력 → 종료 |
| (2011.6.1. 전) | 허가 칸 없음 → R2 바로 | 화면은 현재 연도만 보내므로 사실상 도달 불가(직접 API만) |

허가 칸이 **비어 있으면(미선택) R2는 그리지 않는다**(엄격 순차). 화면 허가 칸은 철거 토글 **바로 아래**(§2.4).

### 2.4 Step 2 화면 배치 (계산 순서 = 표시 순서 · Low-2)

```
h2 · 안내 1줄(«아래 질문에 답하면 이어서 필요한 칸만 표시됩니다»)
[법령 모달 §101]
① 토지 면적                      (항상 — 철거 경로 ⑧도 요구)
② 공장용지 토글                  (항상 — 종류 모순 판정 입력)
③ 건축물 철거 완료 토글           ← 모드 토글을 영향 칸 직전으로(허가·철거일·사슬·기준면적이 모두 이 아래)
④-OFF  허가·사용승인 칸 (+ 뜻 설명 접힘 카드)
④-ON   철거일 → «철거 후 한시 별도합산 사실 확인» 블록(종류 → 사슬)
⑤ 확정 안내 (사슬이 접힘으로 끝났을 때 — 마지막 답 바로 아래, 블록 안)
⑥ 기준면적 판정 정보 = 용도지역 + 건물(철거 전) 바닥면적 — 사슬이 Q7/R2에 도달했을 때만
```

- `⑥`은 새 컴포넌트 `SeparateAggregateAreaBasis.tsx`(~70줄 — 현행 Step2의 용도지역·바닥면적 JSX를 옮김). 철거 경로 문구(«철거 전 …») 분기와 `*` 필수 표시는 항상 켜짐(그려졌다 = 요구됨 — `needFloor` 분기 삭제).
- 화면 칸 순서 = **용도지역 → 바닥면적**으로 통일한다. 현재 비철거 ⑧은 용도지역 → 바닥면적(`shared.ts:453-458`)이지만 **철거 ⑧은 바닥면적 → 용도지역**(엔진 `propertyDemolishedFactIssue`:192-195)이라 화면(용도지역이 위)과 어긋나 있다 — 사슬 끝 블록이 둘을 한 덩어리로 그리므로 엔진 철거 순서를 용도지역 → 바닥면적으로 뒤집는다(E-S6, 철거 격자의 용도지역 «채워 둔 셀» 전제 :47 갱신).
- `Step2SeparateAggregate` 줄 수: 127 → ~125(면적 JSX가 `AreaBasis`로 빠지고 토글 위치 이동). `SeparateAggregateDemolishedFacts` 224 → ~270.

### 2.5 확정 안내

- 컴포넌트: `<ToneCard tone="slate" title="이 답으로 종합합산 이관이 확정되었습니다">` (인라인 톤 하드코딩 금지 · 본문 `text-caption leading-snug`) · `data-testid="pt-sa-seq-settled"` + `data-reason` = 철거: `chain.resolved.foldReason` · 비철거: `"building_permit"`(`buildingChainOf().resolvedFold`).
- 본문 3문장(법 근거 없는 유리/불리 표현·추정 금지):
  1. **«이 답으로 별도합산 불성립(종합합산 이관)이 확정되어 나머지 칸은 묻지 않습니다.»**
  2. 사유 1줄 — 철거는 **`chain.resolved.notice`를 그대로**(엔진이 기존 상수로 만든 문장 — UI가 문장을 조립·분기하지 않는다. 날짜만으로 확정된 접힘은 엔진이 일반·빈집 기간 병기 고지를 낸다 — 엔진 SQ-5). 비철거는 허가 답에 따라 `PROPERTY_BUILDING_PERMIT_NO_NOTICE`/`…UNKNOWN_NOTICE`(기존 상수 · 엔진 §2.6의 접힘 고지와 같은 문장).
  3. «모름»으로 답했으면 **««모름»은 요건 충족을 인정하지 않아 확정됩니다 — 확인되면 답을 바꾸세요. 답을 바꾸면 이어서 다시 묻습니다.»**, «아니오»면 «답을 바꾸면 이어서 다시 묻습니다.»
- 위치: 확정시킨 마지막 답 카드 **바로 아래**(철거 경로는 amber 블록 안, 비철거는 허가 카드 래퍼 안). 입구 확정(period·not_yet)은 철거일 카드 아래(종류 칸이 없다) — 현행 `pt-sa-demolished-no-facts`를 이 컴포넌트로 **흡수**(E2E 1곳 id 교체, §5.3).
- 모순 안내(`pt-sa-demolished-contradiction`, `role="alert"`)는 **확정이 아니라 차단**이라 현행 그대로 둔다.

### 2.6 칸 문구·힌트 수정

| 칸 | 수정 |
|---|---|
| 비철거 허가 | 힌트·뜻 설명은 유지(`pt-sa-permit` verbatim 테스트 :145-160 보존). 질문 앞에 위치만 이동 |
| 건축 외 용도 | 힌트 끝의 «아래 빈집정비 칸에서…»(`need.vacantHouse`) → ««예»이면 철거된 것이 빈집정비사업 빈집인지 이어서 묻습니다(주택·해당 시행본).»로 교체(뒤 칸이 없을 수 있어 «아래»를 쓰지 않는다) |
| 빈집정비(관문) | 질문 문구 그대로 + 힌트 **앞줄 추가**: «철거일이 일반 한시 기간({general})을 넘고 빈집정비사업 철거 빈집 기간({vacant}) 안이라, 이 답이 한시 기간 안인지를 정해 먼저 묻습니다.» — `period.general`/`period.vacantHouse`는 현행 `demolishedPeriodTextOf` 표기 함수 |
| 종류 | 힌트 «빈집정비 3년은 주택에만…»은 유지 |
| 철거일 힌트(Step2:111-117)·intro | intro: «아래 질문에 답하면 이어서 필요한 칸만 표시됩니다.» (현행 «기준면적… 입력하세요»는 사슬 끝 블록 제목으로 이동) |

### 2.7 ④ 전송 (wire)

- 철거: `demolished: true` + `demolishedDate`·`demolishedKind`(입구) + **엔진 `asked` 중 값이 있는 칸**만(현행 `demolishedWireFields`가 `need.*`로 하던 일을 `asked`로) + 사슬 끝 도달 시 `buildingFloorArea`·`zoningDistrict`.
- 비철거: **`buildingPermit`(R1이 열렸을 때) + R2 도달 시에만 `zoningDistrict`·`buildingFloorArea`**. 현행은 `zoningDistrict`를 항상, `buildingFloorArea`를 있으면 항상 보낸다(`request-body.ts:44-48`) — 바뀐다.
- `isFactory`: 현행 유지(철거·비철거 공통 `...(form.saIsFactory ? {isFactory:true}:{})`).
- 엔진·⑫가 전송되지 않은 뒤 칸을 읽지 않아야 한다 — §1.5 N2/N3 엔진 수정이 선행(E-S2·E-S5).

### 2.8 ⑧·점프

- ⑧ = 사슬 next의 문구(엔진 `…FactIssue`가 next에서 파생 — E-S1). 필드 점프는 선행 결정대로 **신설하지 않는다**. 엄격 순차라 막힌 칸이 곧 화면의 **마지막 질문**이라 오류 문구(`PropertyTaxForm.tsx:262-266`, 하단 배너) 바로 위에 있다.
- `firstInvalidStep`의 step 2 점프(`PropertyTaxForm.tsx:139-145`)는 변경 없음. 단 비철거 순서가 «토지 면적 → 허가 → 용도지역 → 바닥면적»으로 바뀐다(⑫ 문구 순서도 같음 — E-S5).
- `data-field` 앵커는 현행 id 유지(`demolishedPermit`·`buildingPermit` …) + 빈집정비 선행도 같은 `demolishedVacantHouse`(칸은 하나 — 위치만 가변).

### 2.9 접근성·375px

- **live region(UQ 없음, 스펙)**: Step2 안에 항상 마운트되는 `<div role="status" aria-live="polite" className="sr-only" data-testid="pt-sa-seq-status">`. 내용은 렌더 파생 한 줄 — next가 있으면 «다음 질문: {칸 이름}», 확정이면 «별도합산 불성립이 확정되어 나머지 칸은 묻지 않습니다», 없으면 빈 문자열. 칸 이름은 결과 카드 `requiredText`와 **같은 짧은 이름 맵**(`허가·사용승인`·`철거 후 건축 외 용도`·`빈집정비사업 철거`·`국가 등 공용·공공용 사용`·`유료·재산세 부과`·`철거 전 바닥면적·용도지역`)을 `lib/calc/property-demolished-verdict-text.ts`에서 export해 공유한다. 새 카드 전체를 live로 감싸지 않는다(긴 라벨·힌트가 통째로 낭독됨).
- **포커스 이동 없음**(포커스 탈취 금지): 새 칸은 방금 고른 라디오 바로 아래에 붙어 Tab 순서(DOM)가 자연스럽게 이어진다. 확정 안내는 `role` 없이 시각 텍스트(중복 낭독 방지 — 낭독은 status가 맡음).
- 애니메이션·전환 없음(모션 민감 사용자·`prefers-reduced-motion` 별도 처리 불필요). 칸은 마운트/언마운트.
- 375px: 모두 단일 칸 세로 스택(`RadioCardGroup layout="inline"` + `FieldCard`), 확정 안내는 `ToneCard` 1개(가로 스크롤 0 — 사슬 최대 길이(빈집정비 선행 + 허가 + 건축 외 + 공용·유료 + 기준면적)는 렌더 미수행 → V-5).
- 라벨 타이포: 본문 `text-caption`/`text-xs`/`text-sm` 정본 클래스만(임의 `text-[Npx]` 금지 — pre-push 게이트). 다크: 톤 토큰만.

---

## 3. 엔진에 요구하는 export

### 3.1 요구 목록 (엔진 문서 §2.3 이름으로 정합 완료)

| ID | 요구 | 소비 지점 | 근거 |
|---|---|---|---|
| **E-S1** | `propertyDemolishedChain({taxBaseDate, removedOn, kind, isFactory?, facts, buildingFloorArea?, zoningDistrict?})` → `{ order: PropertyDemolishedAskField[]; asked: Record<…, boolean>; next: PropertyDemolishedAskField \| null; resolved: null \| { kind: "holds" } \| { kind: "fold"; foldReason: PropertyDemolishedFoldReason; at: PropertyDemolishedAskField \| "date"; notice: string }; vacantHousePosition: "gate" \| "proviso" \| null }`. `order` = **엔진이 읽은 칸 = 답이 있는 칸 + next까지**(날짜 결함이면 `[]`), 순서가 곧 화면 순서(빈집정비 관문 포함). 철거일 > 기준일(날짜 결함)은 `order=[]`·`next=null`·`resolved=null`로 기존 `…FactIssue`의 «철거일» 문구만 남긴다. **공장용지 ∧ 종류 «주택» 모순은 `order=["demolishedKind"]`·`next="demolishedKind"`** — 고칠 칸인 종류 라디오가 화면에 남아야 한다(엔진 요청 — 이 문서의 이전 판 `order=[]`을 정정) | ⑤·⑧·④·⑫ | §2.2 |
| E-S1b | `propertyDemolishedFactIssue`를 위 `next`에서 파생(첫 결함 = next의 문구). 기존 시그니처·문구 유지 | ⑧·⑫ | `property-separate-requirements.ts:180` |
| **E-S2** | **비철거 허가를 용도지역·바닥면적·`hasBuilding`보다 먼저 판정**: `isSeparateAggregateLand`에서 `buildingPermit`이 «요구 시행본 ∧ yes 아님»이면 용도지역·바닥면적을 읽지 않고 즉시 `buildingPermitFolded=true` 접힘(고지 = `PROPERTY_BUILDING_PERMIT_NO/UNKNOWN_NOTICE`) | ④ 숨김 값 미전송과 양립 | probe N2·N3 (`separate-aggregate-land.ts:223-246` vs `:334`) |
| **E-S3** | `propertyBuildingChain({taxBaseDate, permit})` → `{ permit: boolean; areaInputs: boolean; resolvedFold: boolean }` — 허가 빈칸이면 `areaInputs=false`(엄격 순차). 기존 `propertyBuildingPermitRequired`·`…FactIssue`는 유지하고 첫 결함은 `propertyBuildingFactIssue`(허가 → 용도지역 → 바닥면적)가 낸다 | ⑤·⑧·④·⑫ | §2.3 |
| E-S4 | 판정 echo `verdict.required` 의미 = **사슬이 실제로 연 칸**(= `order`의 사실 칸 집합 + publicUse/paid). 필드 모양 유지(`LandDemolishedVerdictEcho.required`) — 화면 `requiredText`·PDF는 코드 변경 없이 새 의미를 따른다 | ⑦ | `property-demolished-verdict-text.ts:24-38` |
| E-S5 | ⑫ `superRefine`: 비철거 `zoningDistrict`·`buildingFloorArea` 요구를 `areaInputs`일 때만(현행 무조건 — `property-input.ts` 비철거 분기), 철거 사슬은 E-S1b. 접힘 확정 body(뒤 칸 생략)가 ⑫ 400이 되지 않아야 한다 | ⑫ | probe D1·N1 |
| E-S6 | 철거 `propertyDemolishedFactIssue`의 면적 결함 순서를 **용도지역 → 바닥면적**으로(비철거와 통일 — §2.4) | ⑧·⑫ | `:192-195` |
| E-S7 | `PropertyDemolishedFoldReason`에 `"building_permit"` 추가를 **하지 않는다** — 철거 판정 사유(`landSplit.demolishedVerdict`)와 비철거 접힘(`transferReasons`)은 이미 별도 표현이다. 입력 중 확정 안내용으로만 UI 타입 `PropertySettledReason = PropertyDemolishedFoldReason \| "building_permit"` 사용 | UI | §1.3 |

### 3.2 어댑터(`lib/calc/property-separate-requirements.ts`) 변경 — UI 시니어 몫

- `demolishedNeedOf`(:50) → `demolishedChainOf(values, taxBaseDate)`: 엔진 `propertyDemolishedChain`을 그대로 반환(모양 변환만 — `isFactory` 포함). 현 호출자(`Step2SeparateAggregate.tsx:24`, `SeparateAggregateDemolishedFacts.tsx`)를 교체.
- `buildingPermitNeedOf`(:112)는 유지, 추가로 `buildingChainOf(permit, taxBaseDate)`(→ `PropertyBuildingChain`)·`buildingAreaInputsNeedOf(permit, taxBaseDate)`(= `areaInputs`).
- `demolishedWireFields`(:77)·`buildingPermitWireFields`(:131)를 위 결과의 `asked`(철거)·`areaInputs`(비철거)로 재작성. `demolishedFactIssueOf`·`buildingPermitIssueOf`는 이름·시그니처 유지(⑧ 호출자 `shared.ts:439,461` 변경 최소).
- 비철거 ⑧(`shared.ts:453-463`) 순서 → 토지 면적 → 허가 → (areaInputs일 때) 용도지역 → 바닥면적. 150줄대 변경 +~10줄(583 → ~595, 700 미만).
- UI 파일: **칸 id → 렌더러 맵**(`FACT_CARDS`)을 `order`로 순회. 빈집정비·공용+유료 묶음(`ToneCard violet`) 등 현행 JSX는 그대로 맵 값으로 옮긴다.

### 3.3 엔진 문서 정합 표 (2026-11-25 — 불일치 0)

| 이 문서 | 엔진 문서 §2.3 | 일치 |
|---|---|---|
| E-S1 `propertyDemolishedChain` `{order, asked, next, resolved, vacantHousePosition}` · 공장×주택 모순 `order=["demolishedKind"]` | 같음 | 일치 |
| E-S1b `propertyDemolishedFactIssue` ← `chain.next` | 같음(시그니처·문구 유지) | 일치 |
| E-S2 비철거 허가 접힘을 `hasBuilding`·`calculateBaseArea` 앞으로 | §2.6 · PSA-S2 | 일치 |
| E-S3 `propertyBuildingChain` `{permit, areaInputs, resolvedFold}` | 같음 | 일치 |
| E-S4 `verdict.required` 모양 유지 · 의미 = 사슬이 읽은 칸 | 같음(`kind` 키 추가 안 함) | 일치 |
| E-S5 ⑫ 비철거 `areaInputs`일 때만(`propertyBuildingFactIssue`) | 같음 | 일치 |
| E-S6 철거 면적 결함 순서 용도지역 → 바닥면적 | 수용(SV-8) | 일치 |
| E-S7 `building_permit`을 철거 접힘 사유에 안 넣음 | 동의 | 일치 |
| 어댑터 `demolishedChainOf` · `buildingChainOf` · `buildingAreaInputsNeedOf` | 같음 | 일치 |
| 필드 점프 신설 없음 · `data-field` id 유지 | 같음(§2.7 ⑧ 행) | 일치 |

---

## 4. 14지점 대응 (재산세는 ⑬ 양도세 전용이라 제외)

| 지점 | 변경 | 근거 |
|---|---|---|
| ①②③ 폼 상태·initial·normalize | **없음** — 새 FormState 필드 0(사슬은 기존 `saDemolished*`·`saBuildingPermit` 파생). normalize 해당 없음(재산세는 로컬 state) | `shared.ts:174-191,286-299` |
| ④ API 변환 | **변경** — 전송 규칙 §2.7 (`request-body.ts:37-49` + 어댑터 wire 함수) | |
| ⑤ 위젯 | **변경** — `Step2SeparateAggregate`·`SeparateAggregateDemolishedFacts`·`SeparateAggregateBuildingPermit` + 신규 `SeparateAggregateAreaBasis`·확정 안내 | §2 |
| ⑥ 사이드바 | 해당 없음(재산세 마법사에 사이드바 없음 — 선행 §5.5) | |
| ⑦ 결과 카드·PDF | **의미 변경만**(코드는 `requiredText` 맵 export 1개 추가 + 칸 집합이 빈 경우 문구를 «앞의 답(또는 철거일)으로 결과가 정해져 더 묻지 않음»으로 교체 — 엔진 §3.2) — 「입력이 필요했던 칸」= 물은 칸. **새 줄 없음(UQ-S5 결정)** | §1.3 |
| ⑧ validation | **변경** — next 파생(§2.8), 비철거 순서 | |
| ⑨⑪ | 해당 없음(양도세 Zod enum·자산 취득일) | |
| ⑩ Zod 정제 | **변경(엔진 몫)** — 철거 분기 호출 불변(내부만 사슬) · 비철거 인라인 3개 → `propertyBuildingFactIssue`(엔진 문서 §3.4 ⑨⑩ 행과 같은 지점) | `property-input.ts` |
| ⑫ Zod 입력 객체 | **변경 없음** — 새 와이어 키 0(엔진 문서 §3.4 ⑫와 같음). 요구 규칙은 위 ⑩ 행 | `property-input.ts` |
| ⑭ Route | 해당 없음 — `app/api/calc/property/route.ts`에 `separateAggregateItem` 언급 0(grep) | |
| 종부세 연동 | 영향 없음 — 재산세 export 인터페이스(`calculatePropertyTax` 입출력) 변경 0, 종부세 UI는 별도합산 철거 칸을 쓰지 않음(확인 필요 V-7) | |

완료 보고 전 자가 점검: 3대 정책 — (1) 미러링 없음(전부 렌더 파생·onChange 한 칸 패치) (2) 자동 안분 fallback 없음(확정 = 이관은 법문이 정한 접힘, 숨은 값 복원은 사용자 명시 답의 재표시) (3) ⑧ 동기화(§2.8·E-S1b·E-S5 — UI는 통과인데 ⑫가 막는 모순을 격자 N4가 닫는다).

---

## 5. 영향 — 테스트·E2E 변화와 새 격자

### 5.1 기존 vitest 기대값 변화

| 파일 | 변화 |
|---|---|
| `property-separate-demolished-facts.anchor.test.tsx` | :71 «건축물 → 허가 + 건축 외 **동시**» → 허가만(건축 외는 허가 «예» 뒤) · :80·:86 «주택 → 빈집정비 노출·DOM 순 허가→건축 외→빈집정비» → 일반 기간 안이면 허가 → (건축 외 «예»일 때) 빈집정비, 확장창이면 **빈집정비 → 허가 → …** · :93 `pt-sa-demolished-no-facts` → `pt-sa-seq-settled[data-reason=period]` · :101 사슬 테스트는 선행 허가 «예» 전제 유지 · :142-208 «숨은 값 보존·④ 미전송»은 의미 유지하되 «화면이 연 칸»(= `order`) 기준으로 재단언 · :277-358 결과 카드 `land-split-demolished-required` echo(예: K-2 허가 «아니오» → 「허가·사용승인」만, K-1 → 허가·건축 외·면적 포함, K-15 주택 → 빈집정비 **미포함** 가능) 갱신 |
| `property-building-permit-render-grid.anchor.test.tsx` | :135-143 «칸 순서 용도지역 → 바닥면적 → 허가, 철거 토글보다 앞» → **«토글 → 허가 → (yes) 용도지역 → 바닥면적»** · 격자 (a) 노출 = «철거 OFF ∧ ≥2011»은 유지 · (b)~(d) 유지 + **신규 (e) 허가 아니오·모름·미선택 → 용도지역·바닥면적 DOM 0, ④에 두 키 없음, ⑧ 통과(아니오·모름)/허가 문구(미선택)** |
| `property-separate-demolished-render-grid.anchor.test.tsx` | 정책 4종(yes/no/unknown/mix) → **사슬 전수 DFS**(§5.2) · `FIELD_BY_MESSAGE`의 면적 문구 순서(용도지역 → 바닥면적) · (a) «화면 칸 = ⑧이 물은 칸»은 그대로 성립하되 «⑧이 물은 칸 = 엔진 `order`» 추가 · (c) «바닥면적 필수표시 ⇔ ⑧ 차단» → «면적 블록 DOM ⇔ 엔진 `areaAsked`» |
| ④ `property-demolished-body`·`property-building-permit-body` | 비철거 body에서 허가 «아니오»일 때 `zoningDistrict`·`buildingFloorArea` 부재 · 철거 body는 `order`와 일치 |
| ⑧↔⑫ parity: `property-{demolished,building-permit,precalc}-parity-grid`, `api/property.route.{separate-aggregate-required,building-permit,demolished-requirements,land-split-inputs}` | 비철거 «허가 아니오 + 용도지역/바닥면적 빈칸» 셀: 현재 ⑧·⑫ 둘 다 막음 → **둘 다 통과**(+ 엔진 접힘 + 합산 칸 요구 O). 같은 셀에서 N3(바닥면적만)·N2 재현 anchor |
| `__tests__/tax-engine/property-separate-requirements.anchor.test.ts`·`property/building-permit-101.anchor.test.ts` | 엔진 시니어 몫(E-S1~S6) |
| `property-shared.test.ts` | ⑧ 비철거 순서 |

### 5.2 새 격자 설계 — «노출 칸 = ⑧ 요구 칸 · 숨은 칸은 ⑧이 요구 안 함 · ⑧ 통과 ∧ ⑫ 400 = 0» (사슬 전수)

**G-A 철거 사슬(`property-separate-demolished-sequential-grid.anchor.test.tsx` — 신규, 렌더 격자와 같은 `walk()` 골격)**
- 뿌리: 과세기준일 연도 {2015(not_yet)·2016·2019·2024·2026} × 철거일 후보(`removals(s)` — 기준일 뒤·당일·6/12/36개월 경계 ±1일) × 종류 {"", house, building} × 공장 {F, T}.
- 각 뿌리에서 **next마다 답 {예, 아니오, 모름}을 전수 분기하는 DFS**(정책 4종 샘플링 폐기). 기준면적 블록 leaf: 용도지역 {빈, 채움} × 바닥면적 {빈, 채움}.
- 각 노드 단언: **N1** DOM 사실 칸 그룹 순서 = 엔진 `order`(사슬 순서 그대로, 빈집정비 선행 포함) · 마지막 그려진 칸 = next. **N2** ⑧ 문구 필드 = next(=마지막 칸) — 화면에 없는 칸을 ⑧이 요구하면 실패(막다른 길 0). **N3** next=null ∧ resolved가 fold ⇔ `pt-sa-seq-settled[data-reason]` = 엔진 `resolved.foldReason` · 확정 뒤 칸 0 · ⑧ 통과. **N4** ⑧ 통과 → ④ body를 실제 Zod에 → 통과(⑧ 통과 ∧ ⑫ 400 = 0) · body 사실 칸 키 집합 = `order` 중 값 있는 칸(숨은 키 0). **N5** 엔진 verdict(전체 와이어 `judgePropertyDemolishedLand`) 접힘 사유 = resolved.foldReason, `verdict.required` 칸 집합 = `order` 사실 칸(⑦ echo 정합).
- **전부 채워 둔 stale 변형**(모든 사실 칸·면적에 정책 답을 미리 채운 상태로 같은 DFS): 숨은 칸의 저장값이 화면·④에 새지 않는다(N1·N4가 그대로 성립해야 함) + **복원 단언**: 확정 leaf에서 확정시킨 답만 다른 값으로 바꿔 다시 렌더 → 사슬이 늘어나고 저장값이 `checked`로 나타나며 **`pt-sa-prev-answer-{field}` 표식이 붙고, 그 칸을 클릭하면 사라진다**(SQ-4).
- 비공허: 확정 사유별(not_yet·period·permit·other_use·public_use_unpaid) 셀 ≥1, holds 셀(건축물 면적 포함·주택) ≥1, depth 5(공용+유료까지) 셀 ≥1(≥2024), 선행 빈집정비 셀 ≥1.
- 시간: 연도별 `it` 분할 유지(180초). DFS 리프가 정책 4종보다 늘어난다 — 렌더 재사용(`rerender`) + 면적 블록 leaf는 2×2만. **실측 전 미확정(V-3)**: 초과 시 날짜 후보를 경계 대표만 남기는 방향은 허용하나 답 분기는 줄이지 않는다.

**G-B 비철거(기존 permit render grid 확장)**: 연도 {2010·2011·2019·2026} × 공장 × 허가 {"", yes, no, unknown} × 용도지역 {빈, 채움} × 바닥면적 {빈, 채움}. 단언: 면적 블록 DOM ⇔ (허가 yes ∨ 시행본에 허가 없음) · ⑧ 통과 조건 = 면적 블록 있으면 둘 다 채움, 없으면 허가가 아니오·모름 · ④ `zoningDistrict`·`buildingFloorArea` 키 ⇔ 면적 블록 · ⑧ 통과 → ⑫ 통과 · 허가 아니오·모름 셀에서 엔진이 throw하지 않고 `buildingPermitFolded=true` + `propertyLandSplitRequiredFor.otherComprehensive=true`(N3 재발 방지).

**뮤테이션 확인(구현 PR에서)**: ① 엔진 술어를 «전부 노출»로 되돌리면 G-A N1·N2 실패 ② `order`에서 빈집정비 선행을 빼면 실패 ③ E-S2 되돌리면 G-B 실패 — 격자가 비공허한지 실측해 보고(미수행 시 명시).

### 5.3 E2E 기대값 변화 (3 스펙 + 헬퍼)

**헬퍼(`e2e/_helpers/property-land.ts`) — 먼저 바뀐다**
- `fillSeparateDetail`: 순서를 **토지 면적 → (공장) → 허가(비철거) 또는 철거 토글·사슬 → 사슬이 끝나고 면적 블록이 **그려졌을 때만** 용도지역·바닥면적**으로. 위치 기반 `.first()`/`.nth(1)`은 «면적 블록의 바닥면적 칸»을 testid로 가리키도록 `data-testid`(`pt-sa-area-zoning`·`pt-sa-area-floor`) 신설.
- `fillDemolished`: 사실 칸을 **그려진 칸만(`count()>0`) 순서 허가 → 건축 외 → 빈집정비 → 공용 → 유료**로 채우되 확장창은 **빈집정비를 가장 먼저** 시도(헬퍼는 칸이 있으면 누르고 없으면 건너뛴다 — 사슬 판단을 헬퍼에 넣지 않는다).

**스펙별**
| 스펙 | 변화 |
|---|---|
| `property-separate-demolished-requirements.spec.ts` | K-1: 용도지역·바닥면적을 **사슬 끝**에서 입력(순서 변경) · K-2·허가 «모름»·건축 외 «예»·K-17/K-18/K-20: **body에 `zoningDistrict`·`buildingFloorArea` 없음**(숨은 값 미전송 확장) + 확정 안내 `pt-sa-seq-settled` 가시 · K-15(주택): 용도지역 라디오 **그려지지 않음**(`HOUSE.zoning` 단계 삭제) · K-16: 빈집정비 «예»가 **허가보다 먼저**(확장창) · K-19 inline: 첫 줄 `radio zoning` 제거, 공용 사슬 단언 유지 · «숨은 값 미전송»: 주택 → 건축물 변경은 기간 밖 확정 → `pt-sa-demolished-no-facts` → `pt-sa-seq-settled` · «미선택 차단 + 점프»: 종류 선택 후 «다음» → **허가 문구**(next) 불변 · 모순·375px 유지(375px 시료는 사슬 최대 길이로 확장) |
| `property-separate-building-permit.spec.ts` | K-27: 허가 «예» 뒤에 용도지역·바닥면적 칸이 나타남 단언 · K-28/K-29/공장용지+아니오: **용도지역·바닥면적 칸 DOM 0 · body에 두 키 없음 · 합산 입력(Step 3) 요구 유지 · 이관 사유·고지가 «건축물이 없는 토지»가 아님** · «미선택 차단» 첫 줄: 허가 미선택에서 면적 칸이 없다 → 다음 → ISSUE · 철거 토글 ON/OFF 보존 테스트: 허가 칸 위치(토글 아래)만 · 375px: 허가 카드 + 확정 안내 |
| `property-land-split.spec.ts` | :33·:66(철거 2년 전 → 기간 확정): 면적 블록이 그려지지 않아 `floor` 입력 제거 · :51·:83·:128(허가 «예»): 헬퍼 순서만 |
| **신규** (같은 spec 또는 `property-separate-sequential.spec.ts`) | S-A 건축물·허가 «아니오» → 건축 외 칸·면적 블록 없음 + 확정 안내 + 계산 960,000(기존 오라클) · S-B 허가 «예» → 건축 외 «예» → 확정(other_use) · S-C 확장창 주택 → 빈집정비 먼저 «아니오» → 확정 period · 허가 칸 없음 · 1,380,000 · S-D **복원**: 허가 «아니오»(확정) → «예»로 바꿔 건축 외 칸·면적 복귀 + 이전 답 `checked` · S-E 비철거 허가 «아니오» → 면적 블록 없음 → 계산 · request body 키 단언 · live region 텍스트(`pt-sa-seq-status`) 단언 · 375px 가로 넘침 0 |
| 세액 오라클 | **변화 없음**(K-1 516,000 · K-2 960,000 · K-15 768,000 · K-16 768,000 · K-17 1,380,000 · K-19 768,000 · K-20 1,380,000 · K-27 516,000 · K-28/29 960,000) — 판정 동일(§1.5) |

---

## 6. 사용자 결정 UQ-S — **전부 결정됨(2026-11-25, 추천안 채택 — §0.0)**. 아래는 결정 전 기록(근거)

**UQ-S1 — 노출 방식.** (가) **엄격 순차** — 답이 있는 칸 + 첫 미선택 칸까지만 그리고 뒤는 안 그린다 · (나) **가능성 있는 칸 전부 표시, 확정되면 숨김** — 지금처럼 허가·건축 외를 함께 보이고 답에 따라 사라진다 · (다) **한 번에 한 질문**(이전 답을 접어 요약) . **결정 (가) — 사용자 결정 2026-11-25.** 근거: 사용자 요구가 «앞 답이 결과를 확정하면 **뒤 칸을 묻지 않는**»이다. (나)는 허가 칸이 비어 있는 동안 건축 외 칸이 보이고 허가 «아니오»를 누르는 순간 화면 아래 칸이 사라져(레이아웃 점프) «묻지 않는다»가 아니라 «묻다가 지운다»가 된다. (다)는 답 수정 시 이전 질문 재열기가 필요해 범위 과대.

**UQ-S2 — 용도지역·바닥면적 칸의 위치와 노출.** (가) **사슬 끝에서만 노출**(철거 OFF: 허가 «예» 뒤 / ON: 사실 칸 통과 뒤 건축물일 때) · (나) 현 위치(맨 위 용도지역, 중간 바닥면적)에 **항상 표시**하고 `*` 필수 표시만 답 의존으로. **결정 (가) — 사용자 결정 2026-11-25.** 근거: 사용자 보고 P-3·P-5가 «허가 아니오인데 용도지역·바닥면적을 계속 요구»이고, (나)는 요구는 없애도 **칸이 계속 보여 «묻는다» 인상이 남는다**. 대가: E2E 헬퍼·위치 기반 셀렉터·위젯 테스트 대량 갱신(§5) + 비철거 ⑧·⑫ 순서 변경(E-S5). (나)는 변경이 작지만 계산 순서 = 표시 순서(면적 판정은 허가·요건 뒤)에도 어긋난다.

**UQ-S3 — 비철거 허가 칸 위치(Low-2).** (가) **철거 토글 바로 아래**(OFF 분기 첫 카드) · (나) 현 위치(바닥면적 뒤·토글 앞) 유지. **결정 (가) — 사용자 결정 2026-11-25.** 근거: 허가 칸은 토글 OFF일 때만 존재하는 **토글 의존 칸**이라 «모드 토글은 영향 필드 직전»(sync-checker Low-2·components/calc 규칙)을 따른다. UQ-S2 (가)와 한 묶음(허가가 면적 앞이어야 하므로 S2 (가) ∧ S3 (나)는 양립 불가). S2 (나) 선택 시에도 S3 (가)는 독립 적용 가능.

**UQ-S4 = 엔진 SQ-2 — 확장창 주택의 빈집정비 위치.** (가) **관문 질문**(철거일이 일반 한시 기간을 넘고 빈집 기간 안일 때만 허가보다 앞 — 판정 순서와 동일) · (나) 주택이면 **항상 맨 앞에서** 질문(정적 순서) · (다) 현행(맨 뒤). **결정 (가) — 사용자 결정 2026-11-25.** 근거: 이 답이 한시 기간 안인지 자체를 정해(probe A·B — 아니오·모름이면 기간 초과 확정) 허가·건축 외 답이 무의미해진다. (나)는 일반 기간 안인 주택에도 판정에 영향 없는 질문을 앞에 물어(probe F) 요구 취지에 반한다. (다)는 기각된 현행 문제.

**UQ-S5 — 결과 카드에 «묻지 않은 칸» 줄 추가 여부.** (가) **추가하지 않음** — 「입력이 필요했던 칸」 의미만 «실제 물은 칸»으로(엔진 echo 변경, 코드 변경 없음) · (나) «묻지 않은 칸: …(이 답으로 판정이 확정되어)» 줄 추가(엔진 echo `skipped` 필요). **결정 (가) — 사용자 결정 2026-11-25.** 근거: 접힘 사유가 이미 «판정» 줄에 있고 입력 화면의 확정 안내가 같은 내용을 말한다. 줄이 늘면 PDF·표 폭(375px)·테스트가 늘어난다. 사용자가 투명성을 원하면 (나)로 전환 가능(엔진 요구 1개 추가).

*(UQ 아님·결정 불필요로 확정)*: 철거일 입구 1칸 항상 노출·종류는 `order`에 있을 때만(§2.1-3) · 필드 점프 미신설(선행 UQ-6) · «모름» = 혜택 불성립 + 확인 필요(양도세·재산세 기결정) · 숨은 값 보존·복원 + «이전에 고른 답» 표시(SQ-4 결정) · 공장용지 토글 위치 유지(철거 종류 모순 판정 입력이라 토글 앞).

---

## 7. 미검증 V-n (추정 금지 — «확인 필요»)

- **V-1** ~~엔진 문서 이름 대조~~ — **해소(2026-11-25)**: §3.3 표, 불일치 0. 구현 PR 직전 한 번 더 대조.
- **V-2** 철거 경로에서 `vacantHousePosition === "gate"`(확장창)의 정확한 경계(`isWithinPeriodMonths` ±1일)가 엔진 `removals` 격자와 맞는지 — 현행 격자가 경계를 이미 훑으나 **새 술어 기준은 미실측**.
- **V-3** G-A DFS 격자 시간(연도별 180초 한도 안인지) — 미실측. 리프 수는 철거 건축물 ≈7, 주택 ≈14 정도로 **추정**일 뿐 enumerate 안 함.
- **V-4** `aria-live="polite"` 낭독 — jsdom은 속성만 검증, 실제 VoiceOver/NVDA 낭독 **미검증**.
- **V-5** 375px 사슬 최대 길이(선행 빈집정비 → 허가 → 건축 외 → 빈집(후행 생략) → 공용 → 유료 → 확정/기준면적) 렌더·스크롤 — 미수행(선행 계획서 V-2·V-10과 같은 부류).
- **V-6** PDF `ResultPdfDocument.tsx:217`의 «입력이 필요했던 칸» 행을 스냅샷으로 고정한 테스트가 있는지 — grep으로 `property-separate-demolished-facts.anchor.test.tsx:370` 외 못 찾았으나 PDF 스냅샷 전수는 **미확인**.
- **V-7** 종부세 UI가 재산세 별도합산 철거 칸/`landSplit.demolishedVerdict` echo를 읽는지 — 재산세 export 인터페이스 변경은 0이나 `comprehensive-tax-ui-senior` 영향 grep은 **미수행**.
- **V-8** `isSeparateAggregateLand` 비철거 순서 변경(E-S2)이 **허가 시행본 이전(2011.6.1. 전)** 입력의 기존 결과(건축물 없음 고지 등)를 바꾸지 않는지 — 엔진 시니어 확인.
- **V-9** `DateInput` 부분 입력 중(연도만 입력) `saDemolishedDate`가 무엇인지 — 입구 2칸 항상 노출로 우회했으나 **부분 입력 값의 사슬 영향 미실측**.

---

## 8. PR 분할 · 800줄 정책

PR 표기·분할은 **엔진 문서 §6이 정본**이다(UI 문서의 이전 판 S1/S2/S3 표기를 바꿨다):

1. **PSA-S1**(엔진 시니어 + UI 최소분): 엔진 사슬 걷기·`propertyDemolishedChain`·⑧④⑫ 철거 분기 + **UI 최소 배선**(이 문서 몫 — 위젯 노출을 `chain.asked`·`order`로 · 빈집정비 자리(`vacantHousePosition`) · 종류 칸 조건부 노출 · 어댑터 `demolishedChainOf`·`demolishedWireFields`) + 철거 렌더 격자·facts 위젯 테스트 갱신.
2. **PSA-S2**(엔진 + UI): 엔진 비철거 사슬(`propertyBuildingChain`·접힘 위치 E-S2) + **Step2 재배치**(§2.4 — 토지 면적·공장 → 철거 토글 → 허가/철거 사슬 → 확정 안내 → 신규 `SeparateAggregateAreaBasis`) + 비철거 ⑧④ + 허가 렌더 격자·parity 격자 갱신.
3. **PSA-SU**(UI): 확정 안내 `pt-sa-seq-settled`·live region·«이전에 고른 답» 표식(§2.1-5)·힌트 문구(§2.6)·echo `requiredText` 맵·G-A·G-B 격자 마무리·375px.
4. **PSA-SX**(E2E): 헬퍼 + 3 스펙 + 신규(§5.3).
- 엔진이 타입·헬퍼·anchor를 선처리한 뒤 UI가 ⑤⑦⑧ — 같은 PR 안에서도 엔진 커밋 → UI 커밋 순서(시퀀셜).
- 줄 수: `Step2SeparateAggregate.tsx` 127→~125 · `SeparateAggregateDemolishedFacts.tsx` 224→~270 · 신규 `SeparateAggregateAreaBasis.tsx` ~70 · `SeparateAggregateBuildingPermit.tsx` 66→~80 · `lib/calc/property-separate-requirements.ts` 140→~190 · `shared.ts` 583→~595 · `request-body.ts` 326→~335 · 엔진 `property-separate-requirements.ts` 391→~480(엔진 몫). **전부 700 미만 — 분리 불필요**(`property-input.ts` 530·`separate-aggregate-land.ts` 734는 E-S2로 ±소폭 — 734는 **≥700 주의**: E-S2 후 750 접근 시 엔진 시니어가 기회주의 분리 판단).

---

## 9. 재제안 금지·기결정 준수 · 자가 검토

- 현행 유지(기각) · 과세기준일 단위 접기 · 자동 안분 fallback(확정 = 법문 접힘이며 숨은 값 복원은 사용자 명시 답) · 미러링 · native 컨트롤 · placeholder 숫자 · 유리/불리 표현 — 이 문서는 모두 준수.
- 선행 계획서 결정 중 유지: 모름 = 혜택 불성립 + 확인 필요 · 공용·유료 날짜 칸 없음 · 필드 점프 미신설 · 계산 직전 재검증(`firstInvalidStep`).
- 자가 검토(1회): ① 주장 근거 — 칸 순서·줄은 이 세션 정독, 엔진 동작은 probe(`probe1.ts`·`probe2.ts`: N2/N3/A/B/F 실측), 격자 시간·SR 낭독·375px는 «미실측/미검증»으로 표시. ② 가장 큰 위험 둘: (a) **E-S2 없이 UI만 숨기면 N3 throw → Step 3 합산 칸 요구가 침묵으로 사라진다**(UI 선행 금지의 근거) (b) 철거 ⑧ 면적 순서(E-S6)·비철거 순서 변경이 ⑫ 문구 순서와 엇갈리는 모순 — G-B·parity 격자가 닫는다. ③ UQ-S1~S5 **전부 결정됨**(2026-11-25) — 미결 0건. Do는 엔진 문서 PSA-S1부터.
