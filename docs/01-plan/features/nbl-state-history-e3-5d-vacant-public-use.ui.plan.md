# 비사업용 토지 상태 이력 E3f-3 / U-4 「빈집정비 철거 빈집 부속토지 — 국가 등 공용·공공용 사용 예외(지방세법 시행령 §103의2 2호 단서)」 — 화면·클라이언트(①~⑧⑫⑭) 계획서

> 상태: **Plan v2 (2026-11-24 — 코드 변경 0 · v1 UI 초안 + 사용자 결정 2026-11-24 반영 + 엔진 정본 정합)**. 사용자 결정 2026-11-24 «Low-3를 후속 작업으로 처리»의 UI 쪽. **엔진 정본 = `nbl-state-history-e3-5d-vacant-public-use.engine.plan.md`** — v1은 그 파일이 없을 때 쓴 «제안»이었고 **v2에서 이름·export·접힘 사유·시행본 연혁·결정을 엔진 문서에 맞췄다**(이름 대응표 = 엔진 문서 §5.3). 이 문서는 엔진 결정을 새로 짓지 않는다.
>
> **사용자 결정 2026-11-24**(엔진 Q 기준 — 엔진 문서 §0.0): Q-1 (가) 구현(= 이 문서 UQ-1 «입력받음») · Q-2 (가) 4칸(유료 여부를 따로 묻고 무상은 이 단서 대상이 아님) · Q-3 (가) 2024.5.28.판에도 «공용 사용 기간 ∩» 동일 적용(직접 해석례 없음 — **확인 필요**로 남김) · **Q-4 (가) 개시일·종료일 둘 다 필수(v1의 «종료일 비움 = 구간 끝» 추천은 기각)** · Q-5 (가) 무상이면 접힘 + «비과세·면제» 근거 선택 안내(자동 전환 없음) · Q-6 (가) #3642 머지 → E3f-3(엔진) → U-4(UI) · Q-7 (가) 새 필수 칸 미선택 400. UI UQ: UQ-2 빈집정비 칸 바로 뒤 · UQ-3 분리 · UQ-5 «모름»·«아니오» = 접힘 + 확인 필요(막지 않음 · 미선택은 ⑧·⑫ 둘 다 차단) · UQ-6 필수 · UQ-7 사용 기간으로 한정.
> 선행: E3f-2 = PR #3642(head `70aea05ca`, **미머지**). 이 문서의 모든 file:line = 워크트리 `Property-related-Taxes-nbl-e3-5c`(70aea05ca) 읽기 실측. 동작 주장은 §1.3 probe(throwaway `tsx` — 파일은 scratchpad, 저장소 변경 0)에만 근거를 둔다. **정독만으로 쓴 곳은 «정독», 미실측은 «확인 필요»** 로 적었다.
> **범위 밖(재제안 금지)**: V5-G2 · Q-8 (가) 겸용 상가분 · Q-3a (나) 변경 · 과세기준일(6.1.) 단위 «접기» · 자동 안분 fallback · Q-15 (가′) · `useEffect → store` 미러링 · native checkbox/radio/date · placeholder 숫자 예시. 사용 기간을 «구간 안분»하는 계산은 UI가 하지 않는다(엔진 소관).
> 정본(선례): `nbl-state-history-e3-5-demolition-temp-status.{engine,ui}.plan.md`(E3f-2 사실 칸 4개 — 이 문서는 그 위에 «조건부 하위 질문»을 얹는다).

---

## 0. 한눈에

### 0.1 문제

E3f-2는 나대지 구간 근거 «철거ㆍ멸실»에 사실 칸 4개를 만들었다. 그중 «철거 후 건축 외 용도로 사용했는가» = **«예»이면 한시 별도합산에서 제외(`demolished_other_use` 접힘 → 종합합산 + 확인 필요)** 로만 끝난다(`demolished-temp-status.ts:265` `otherUseOk`, `:270`). 그런데 「지방세법 시행령」 §103의2 **2호 단서**는 빈집정비 철거 빈집 부속토지에 한해 «건축 외 용도로 써도 국가·지방자치단체·지방자치단체조합이 1년 이상 공용·공공용으로 사용(계약서 등 입증 포함)하고 §109② 단서의 재산세 부과대상이면 그 사용 기간 동안은 포함»이라 한다. 입력 칸이 없어 이 경우도 접히므로 **법보다 불리**하다.

### 0.2 영향 크기 (실측 — §1.3)

K-7 빈집 셀(주택 철거 2021-06-02 · 취득 2018-06-01 · 양도 2024-09-01 · 닫는 행 2024-08-01 · 빈집정비 «예»):

| 건축 외 용도 | 현행 결과 (probe) | 산출세액(mock-rates 하네스 = E2E 기대값과 같은 체계) |
|---|---|---|
| 아니오 | 사업용 1,463/2,283 · `accepted` | **221,730,000** |
| **예** | **비사업용 366/2,283 · `demolished_other_use` 접힘** | **283,080,000** (스윙 61,350,000) |
| 모름 | 〃 (접힘) | — |

단서가 반영되면 이 «예» 행의 결과는 입력한 **공용 사용 기간**에 따라 갈린다(**엔진 결정: 창 ∩ 사용 기간으로 한정 — UQ-7 · 엔진 Q-3**). 독립 오라클(`evalDayRow`)로 본 사업용 일수(종료일 필수 — 모두 종료일 2024-07-01 가정): 사용 2023-06-01~ **734(비사업용)** · 2024-05-01~ **399(비사업용)** · 2024-01-01~ **520(비사업용)**(엔진 문서 Q1) · 사용 기간에 과세기준일이 없으면 접힘 366 · (참고 — «아니오»와 같은 전체 창은 1,463이지만 **한정 방식에서는 나오지 않는다**). 세액이 바뀌는 시료(엔진 문서 P-1: 취득 2023-03-01 · 사용 2025-01-01~2026-12-01)는 비사업용 304,920,000 → **사업용 239,370,000**. 즉 **사용 기간 입력이 판정을 뒤집는다** → 예/아니오만 받는 단순형은 쓸 수 없다(§8).

### 0.3 설계 한 줄

사실 칸 블록의 **④a 빈집정비 칸 바로 뒤**에 조건부 하위 블록 «국가 등 공공용 사용 예외(2호 단서)»를 둔다. 노출 = **주택 철거 행 ∧ 빈집정비 «예» ∧ 건축 외 용도 «예» ∧ 후보 과세기준일 시행본에 단서 존재 ∧ 엔진이 이력을 읽음** — 엔진 술어 하나 `demolishedPublicUseAsked`(§4 R-1)가 ⑤ 노출·④ 운반·⑧ 차단·⑫′ 400·⑭ 읽기를 모두 정한다(노출 ≡ 필수). 입력 4칸(§3.2 — **개시일·종료일 둘 다 필수**).

### 0.4 단계·PR

| 단계 | 내용 | 선행 |
|---|---|---|
| **E3f-3** (엔진 PR — 엔진 문서 §7) | 술어 R-1·창 ∩ 사용 기간·접힘 사유 `demolished_public_use_no_base_date`·고지·⑫⑫′⑭·manifest | #3642 머지 |
| **U-4** (UI PR) | ①~⑧ 이 문서 + E2E | E3f-3 머지(같은 릴리스) |

---

## 1. 현행 화면 실측

### 1.1 사실 칸 블록 — `components/calc/transfer/nbl/OtherLandDemolishedFactsField.tsx` (184줄)

| 위치 | 사실 |
|---|---|
| `:54-62` | 컴포넌트가 `view.need`(엔진 `demolishedRequiredFacts` 결과)·`demolishedRowUnansweredField`(= 엔진 `firstBlankDemolishedFact`)를 읽는다. `showOutcome = datesReadable && !unanswered && !!closedRow?.basisOutcome`(`:59`) — **사실 칸이 모두 답해진 뒤에만** 미리보기를 보인다. |
| `:65` | 블록 = `<ToneCard tone="amber" title="철거 후 한시 별도합산 사실 확인">`. `:67-70` 읽기 전용 줄 «철거일: …(위 「건축물 멸실·철거·붕괴」 행) · 이 나대지 구간: A ~ B». |
| `:78-94` ② 허가·사용승인 | `need.permit`(후보 ≥ 2019-06-01). 예/아니오/모름 `RadioCardGroup layout="inline"` · `data-field="nblOtherStateEvents.${i}.demolishedPermitBefore"`. |
| **`:96-112` ③ 건축 외 용도** | `need.otherUse`(후보 ≥ 2024-06-01 — `nbl-historical-values-era.ts` `demolishedOtherUseClauseApplies`). 라벨 «철거 후 그 토지를 건축을 위한 용도 외의 다른 용도로 사용했습니까?» · 선택지 **아니오 / 예 / 모름 순서**(`OTHER_USE_LABELS`, `:36`) · hint «…그 용도가 무엇인지는 묻지 않습니다. 모름은 인정하지 않고 확인 필요로 표시합니다.» · testid `nbl-other-state-event-${i}-demolished-otheruse-{yes\|no\|unknown}`. **«예»를 골라도 하위 질문 없음.** |
| **`:114-130` ④a 빈집정비** | `need.vacantHouse` = **주택 철거 행 ∧ 후보 ≥ 2024-06-01**(`demolished-temp-status.ts:208`). 라벨 «철거된 주택이 빈집정비사업 등으로 철거된 빈집이었습니까?» · hint «…예는 철거일부터 3년, 아니오·모름은 일반 한시 기간만 인정하고 3년 연장은 확인 필요로 표시». **③ 뒤에 온다.** |
| `:132-146` ④b 바닥면적 | `need.floorArea`(비주택 건축물 행) — 주택 행과 상호 배타. |
| `:148-152` | 사실 칸이 하나도 없는 구간은 한 줄 안내 `…-demolished-no-facts`. `:154-158` 주택 행 면적 보조 고지. |
| `:160-180` 미리보기 | 인정 창 `…-demolished-window` · 인정 고지 `…-accepted-notice` · 빈집 3년 불인정 고지 `…-vacant-notice` · 접힘 고지 `…-fold-notice`(엔진 `BARE_DEMOLISHED_FOLD_NOTICE[foldReason]`). |

→ **빈칸 순서(화면 = ⑧ 첫 빈칸 순서) = 허가 → 건축 외 용도 → 빈집정비 → 바닥면적**(`demolished-row-facts.ts:79-88` `firstBlankDemolishedFact`, 주석 `:91`).

### 1.2 연결 지점

| 위치 | 사실 |
|---|---|
| `OtherLandBareIntervalFields.tsx:55-60` · `:120-129` | `RESET_DEMOLISHED_FACTS`(사실 4키 `undefined`) — **재산세 구분 라디오 `onChange`에서만** 같이 리셋(근거만 바꿀 때는 보존 — `:126` 주석). 블록 마운트 `:177`(`demolishedView &&`). |
| `lib/calc/nbl-demolished-row-scope.ts:37-52` · `:54-59` | `demolishedRowViewOf` — ④ 와이어 근거가 `demolished`인 행에서만 뷰. `need`는 `demolishedRequiredFacts({…historyRead:true})`. 「엔진이 이력을 읽는가」(`nblStateHistoryIsRead`)는 호출자 몫. |
| `lib/calc/nbl-other-state-history-scope.ts:130-153` `stateEventWireRow` · `:158-175` `demolishedWireFacts` | ④: 사실 칸을 **`need`가 요구하는 칸만** 싣는다(`:169-172`) — 숨은 stale 값 비전송. |
| `lib/calc/transfer-tax-validate-nbl-state-history.ts:117-139` `demolishedRowFactError` | ⑧: 엔진 `demolishedRowFactIssue`(`demolished-row-facts.ts:98-122`) 호출 → `switch (issue.field)`가 **리터럴 접두** `nblOtherStateEvents.${issue.index}.<필드>`로 `fieldError`(정적 게이트 `transfer-validation-field-anchor-coverage`가 읽는다 — 주석 `:127`). 호출 위치 `:76`. |
| `lib/api/transfer-tax-schema-nbl-refines.ts:125-130` | ⑫′: 같은 `demolishedRowFactIssue` · 같은 `nblStateHistoryIsRead`. |
| `lib/api/transfer-tax-schema-nbl.ts:60-70` | ⑫ `nblStateEventRawSchema` — 사실 칸 4키(`:68-71`). **새 키 누락 = 침묵 strip**. |
| `form-mapper-helpers.ts:343` · `:363-381` `demolishedFactFields` | ⑭: `closesBare ∧ basis==="demolished" ∧ eventOffersDemolished`일 때 사실 4키를 엔진 `StateEvent`로. |
| `lib/stores/calc-wizard-asset-migrate-nbl.ts:77-93` | ③: 허용값 안 · `mayCloseBare`인 행만 보존, 키 없던 행에 키를 만들지 않는다(byte-identical). |
| `lib/stores/calc-wizard-asset-nbl-other.ts:62-90` | ①: `NblOtherStateEventInput` optional 4키(`:78-81`). |
| `lib/calc/nbl-other-state-history-preview.ts:143-156` | ⑤ 미리보기: 와이어 사실 칸 → `StateEvent`. `StateHistoryPreviewRow`(`:34-61`)가 `temporaryStatusWindow`·`temporaryStatusMonths`·`vacantHouseExtensionUnconfirmed`·`foldReason`을 echo. |
| `components/calc/NblStateHistoryPeriodTable.tsx:42-53` · `:160` | ⑦ 결과 구간표: `temporaryStatusText`(창 + «한시 기간 N»). |
| 사이드바 | `lib/stores/calc-wizard-store.ts`에 `nblOtherStateEvents`·`demolished` 언급 **0건**(grep) → ⑥ 변경 없음. |

### 1.3 probe (throwaway `tsx` — scratchpad `probe.ts`·`probe2.ts`, 저장소 변경 0)

`e35Base`/`e35VacantHouseCell` 시료(K-7) + 닫는 행 사실만 바꿔 현행 엔진을 직접 호출:

| 허가 | 건축 외 용도 | 빈집정비 | 결과 | foldReason |
|---|---|---|---|---|
| 예 | 아니오 | 예 | 비사업용 아님 · 1,463/2,283 · 세액 221,730,000 | — (accepted) |
| 예 | **예** | 예 | **비사업용 · 366/2,283 · 세액 283,080,000** | `demolished_other_use` |
| 예 | 모름 | 예 | 비사업용 · 366/2,283 | `demolished_other_use` |
| 예 | 예 | 아니오 | 비사업용 · 366/2,283 | `demolished_never_period` |

→ 현행은 «건축 외 용도 예 → 접힘»이며 이 칸이 하위 질문 없이 끝남을 **실측**으로 확인했다. (단서 반영 후 값은 §0.2의 오라클 가설일 뿐 — 엔진 구현 후 Pre-Do anchor로 실측: V-3.)

### 1.4 문구 문제 (현행이 단서를 가린다)

- `NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE`(`nbl-confirm-notices.ts:150-152`): «…건축을 위한 용도 외 사용이 없었음을 확인해 「아니오」를 선택하세요 — 모르면 종합합산으로 보았습니다». **빈집정비 «예» + 건축 외 용도 «예»인 사용자에게는 «아니오를 고르라»는 안내가 사실과 다른 선택을 유도**한다. 엔진이 이 경우만 변형 문구를 내야 한다(R-5).
- 건축 외 용도 hint(`OtherLandDemolishedFactsField.tsx:100`)에 «그 부분은 한시 별도합산에서 제외»만 있고 단서 언급이 없다.

---

## 2. 법령 (UI가 읽는 범위 — 엔진 정본이 우선)

KoreanLaw MCP로 직접 조회(엔진 문서 §1.2 표가 정본): 「지방세법 시행령」 §103의2 — **MST 262781(시행 2024.5.28. — 2호 신설 + 단서 도입 · 영 제34528호) · 271283(2025.5.27. — §103의2 본문은 262781과 글자 단위 동일; 다른 조문 개정으로 생긴 시행본이라 개정 아님)** = **괄호형**: «…빈집의 부속토지[건축 … 용도 외의 다른 용도로 사용하는 부속토지는 제외하되, 국가, 지방자치단체 또는 지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용(1년 이상 사용할 것이 계약서 등에 의하여 입증되는 경우를 포함한다)하는 부속토지로서 법 제109조제2항 단서에 따른 재산세의 부과 대상이 되는 부속토지를 포함한다]». **MST 282549(시행 2026.1.1. — 개정 · 영 제36043호) · 287223(2026.7.1.) · 290815(현행 2026.10.1.)** = **단서형**(287223·290815는 282549와 본문 동일): «다만, … 제외하되, 법 제109조제2항 단서에 따른 재산세의 부과대상이 되는 부속토지로서 국가, 지방자치단체 또는 지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용(…)하는 경우에는 **그 공용 또는 공공용으로 사용하는 기간 동안의 그 부속토지는 포함한다**.»
「지방세법」 §109② 단서(MST 282559): 국가 등이 1년 이상 공용·공공용 사용하는 재산은 재산세 비과세이나 **① 유료로 사용 ② 소유권 유상이전을 약정하고 취득 전에 미리 사용**이면 부과.

UI에 미치는 점: (a) 단서는 **2호(빈집정비 3년) 안에만** 있다 — 1호(일반 6개월·1년)에는 없다. (b) 요건 3개: 국가 등이 사용(1년 이상 또는 1년 이상 사용 계약서) ∧ §109② 단서(유료·유상이전 약정 전 사용 = 재산세 부과대상) ∧ **그 사용 기간 동안**. (c) 시행본이 둘(괄호형은 «기간 동안» 문언이 없고, 단서형은 «기간 동안»). **엔진 결정(Q-3 (가) · 사용자 결정 2026-11-24): 두 시행본에 같은 모델 — 판정을 «과세기준일 현재 사용 중인가»로 읽고 창을 사용 기간으로 한정**한다. 직접 해석례가 없어 **«확인 필요»**를 남긴다(V-2). 첫 과세기준일: 괄호형 **2024.6.1.**(영 부칙 제34528호 제4조) · 단서형 **2026.6.1.**(영 부칙 제36043호 제13조) — 엔진 문서 §1.2 확인(V-1 해소). 어느 시행본이든 후보 과세기준일 ≥ 2024.6.1.이라 노출 게이트는 `need.vacantHouse ∧ need.otherUse`(구조)로 충분하다.

---

## 3. 화면 설계

### 3.1 노출 술어 (단일 소스)

```
demolishedPublicUseAsked(need, ev) → { publicUse, paid, dates }               // R-1 (엔진 문서 §3.2 — 정본)
  publicUse : need.otherUse ∧ need.vacantHouse ∧ ev.otherUse==="yes" ∧ ev.vacantHouse==="yes"   // 주택 철거 행 = need.vacantHouse(구조)가 이미 뜻한다
  paid      : publicUse ∧ ev.publicUse==="yes"
  dates     : paid ∧ ev.paid==="yes"
```

- `ev`는 **④ 와이어 행**(= 요구 칸만 실린 값)이다. 요구 칸은 구조 술어(`demolishedRequiredFacts` — 답과 무관)라 **새 술어만 «답 의존»** 이다. 이 의존 사슬이 ④·⑧·⑫′·⑤·⑭ 5곳에서 똑같이 평가되도록 **엔진이 사슬 함수 하나를 export**하고, `firstBlankDemolishedFact`가 내부에서 같은 함수를 부른다(R-1·R-2).
- 위 사슬은 `historyRead`(엔진이 이력을 읽음)가 거짓이면 4칸 모두 없다(E3f-2 UQ-8 (가) — `demolishedRequiredFacts`가 이미 빈 집합을 돌려주므로 사슬도 자동으로 비어 있다).
- UI는 날짜·시행본·빈집/건축 외 용도의 의미를 비교하지 않는다.

### 3.2 위젯 (사실 칸 블록 안 — 순서 = ⑧ 첫 빈칸 순서)

배치: **④a 빈집정비 칸 바로 뒤**, ④b 바닥면적(주택 행엔 없음)·읽기 전용 고지 앞. 하위 블록은 `<ToneCard tone="amber" title="국가 등 공공용 사용 예외(「지방세법 시행령」 §103의2 2호 단서)">`(새 컴포넌트 `OtherLandDemolishedPublicUseField.tsx` — 메인 블록 184줄 → 200 안팎 유지 · 새 파일 ≈130줄; 중첩 ToneCard는 기존 미리보기 `:165`가 이미 쓰는 패턴). 번호 배지 없음(서브섹션 3개 미만).

| 순 | 위젯 | 노출 | 라벨·선택지·hint (placeholder 숫자 없음) | 저장·전송 |
|---|---|---|---|---|
| P1 | RadioCardGroup inline `…-demolished-publicuse-{yes\|no\|unknown}` · FieldCard `required` | `publicUse` | 「그 부속토지를 국가·지방자치단체·지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용했습니까?」 예 / 아니오 / 모름. hint: 1년 이상 사용할 것이 계약서 등으로 입증되면 «예»입니다. **그 구간의 토지 전부를 사용한 경우만 «예»**입니다(일부만 사용했으면 «아니오» — 이 계산기는 면적을 안분하지 않습니다). 건축을 위한 용도 외로 쓴 부속토지는 원래 제외되지만, 빈집정비사업으로 철거한 빈집의 부속토지는 이 경우에 한해 그 사용 기간 동안 포함됩니다. 아니오·모름은 인정하지 않고 확인 필요로 표시합니다. | `demolishedPublicUseBefore` `yes\|no\|unknown\|""` — 미선택 `""` → ⑧ 차단 |
| P2 | RadioCardGroup inline `…-demolished-publicusepaid-{yes\|no\|unknown}` | `paid` | 「그 사용이 유료이거나, 소유권 유상이전을 약정하고 취득 전에 미리 사용한 경우였습니까?」 예 / 아니오 / 모름. hint: 국가 등이 무상으로 쓰면 재산세가 비과세되어 이 예외의 대상이 아닙니다(「지방세법」 §109②) — 그때는 해당 기간의 재산세 구분을 따로 입력하고 근거로 「비과세·면제 토지」를 고르세요(자동으로 바꾸지 않습니다). 지자체의 철거비 지원 등이 대가에 해당하는지는 과세권자가 판단합니다(행안부 부동산세제과-1602). 재산세 과세내역(고지서)으로 확인하세요. 아니오·모름은 인정하지 않고 확인 필요. | `demolishedPublicUsePaidBefore` |
| P3 | FieldCard `field=…demolishedPublicUseFromBefore` label 「공용·공공용 사용 시작일」 `required` + 공용 `DateInput` | `dates` | hint: 국가 등이 그 부속토지를 쓰기 시작한 날(계약서 등으로 1년 이상 사용하기로 한 경우는 사용 개시일). | `demolishedPublicUseFromBefore` ISO 문자열 |
| P4 | FieldCard `field=…demolishedPublicUseToBefore` label 「공용·공공용 사용 종료일」 `required` + `DateInput` | `dates` | hint: 사용이 끝난 날(그날 포함). **지금도 사용 중이면 이 나대지 구간이 끝나는 날 이후의 날짜를 직접 입력하세요 — 빈칸은 «구간 끝까지»로 읽지 않습니다**(사용자 결정 2026-11-24 · 엔진 Q-4 (가) — 13호 «종료일 비움 = 양도일까지» 규약을 따르지 않는다). | `demolishedPublicUseToBefore` — 빈칸은 키 없음 → ⑧ 차단 |

날짜 칸 2개는 `grid grid-cols-1 sm:grid-cols-2 gap-3`(375px에서 세로). 모든 라디오는 `inline`(라벨이 긴 편이라 모바일에서는 RadioCardGroup 기본 줄바꿈에 맡긴다 — 확인 필요: 375px 렌더 E5-V4). 포커스 전체 선택은 `SelectOnFocusProvider`에 맡기고 개별 `onFocus` 없음. `useEffect → store` 없음 — 값은 `patchEvent` onChange에서만.

**순서 문제(UI 순서 = 계산 순서)와 선택 — 사용자 결정 2026-11-24: UQ-2 = ④a 뒤 + ③ hint 한 줄**: 단서는 계산에서 «건축 외 용도» 다음이지만 **하위 질문이 빈집정비 «예»에 종속**이라 ③과 ④a가 현행 순서(③ → ④a)인 이상 ④a 뒤가 아니면 «아직 안 보인 질문에 종속된 칸»이 된다. 대안 (나)(③↔④a 맞바꿈 — 빈집정비가 한시 기간 W를 정하므로 계산상 먼저라는 근거도 있다)은 `firstBlankDemolishedFact` 순서·E3f-2 anchor·E2E 단언 반전이 따라온다 → UQ-2(추천: 현행 순서 유지 + ③ hint 한 줄 «빈집정비사업으로 철거한 빈집이면 아래 빈집정비 칸에서 «예»를 고르면 국가 등 공공용 사용 예외를 추가로 묻습니다»).

### 3.3 «모름»·미선택

| 칸 | 미선택 `""` | 모름·아니오 |
|---|---|---|
| P1·P2 | ⑧ 차단 + ⑫′ 400 (E3f-2 Q-11 (나) 일관) | 차단하지 않음. **단서 불성립 = 현행과 같은 `demolished_other_use` 접힘 + 확인 필요**(엔진). 모름은 «혜택 불성립 + 확인 필요»(메모리 `feedback_unknown_fact_applies_unfavorably`) |
| P3 | 빈칸·해석 불가 → ⑧ 차단 + ⑫′ 400(점프 = P3 칸) | — |
| P4 | **빈칸·해석 불가·P3보다 이른 날짜 → ⑧ 차단 + ⑫′ 400(점프 = P4 칸)** — 빈칸은 «구간 끝까지»가 아니라 결함이다(Q-4 (가)) | — |

P1·P2 «아니오»·«모름»은 **별도 사유 없이 `demolished_other_use` 접힘**(고지에 «무상이면 비과세 → 「비과세·면제 토지」 근거로 선택» 안내 포함 — 엔진 Q-5 (가) · 엔진 문서 §3.6). 사용 기간에 한시 기간 중 과세기준일이 없으면(P3·P4 입력이 유효한데 성립 과세기준일 0) 엔진 접힘 **`demolished_public_use_no_base_date`**(엔진 문서 §3.3).

### 3.4 stale·리셋 (④ · onChange)

- 상위 답이 바뀌어 하위 칸이 사라지면(`빈집정비 yes→no/unknown`, `건축 외 용도 yes→no/unknown`, `P1 yes→no`, `P2 yes→no`) **저장값은 지우지 않고 ④가 보내지 않는다**(E3f-2 «숨은 값 보존» — 되돌리면 복원). 사슬 평가가 ④와 ⑧·⑫′에서 같으므로 «보이지 않는 칸 400» 불가능(§5).
- **재산세 구분 라디오 `onChange`의 `RESET_DEMOLISHED_FACTS`(`OtherLandBareIntervalFields.tsx:55-60`)에 새 4키를 추가**(키 삭제 — `patchEvent`가 `undefined`를 키째 제거). 근거만 바꿀 때는 보존(기존 규칙 그대로).
- 철거 행·구분 변경 행 종류를 바꿔 나대지 구간이 아니게 되는 경우는 ③ migrate와 ④(`mayCloseBare`·`eventOffersDemolished`)가 이미 막는다.

### 3.5 ⑤ 미리보기·⑦ 결과

- `showOutcome`은 **새 칸까지 모두 답해진 뒤**(`demolishedRowUnansweredField`가 `firstBlankDemolishedFact` 확장을 읽으므로 자동) — 선언 전 불이익 노출 금지(UQ-10 선례).
- 인정 창 줄 `…-demolished-window`는 엔진 `temporaryStatusWindow`를 그대로 보인다. 엔진이 창을 **사용 기간으로 한정**하므로(결정 — R-3) 같은 필드의 시작·끝이 달라질 뿐 UI 변경 없음. 단서가 적용됐음을 알리는 echo 플래그(제안 `temporaryStatusPublicUse: true`, R-4)가 있으면 창 줄 뒤에 « · 국가 등 공공용 사용 기간 포함(2호 단서)» 한 마디와 고지 한 줄(엔진 상수 `NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE` — 「사용 계약서·재산세 과세내역(고지서)으로 확인 필요」 · 사용 기간 밖은 인정하지 않았다는 문장 포함).
- 접힘 문구: 현행 `demolished_other_use` 문구의 «「아니오」를 선택하세요»(§1.4)는 **조건문으로 바뀐다 — 상태별 변형 없이 단일 문구**(엔진 문서 §3.6 첫 행).
- ⑦ 결과 구간표(`NblStateHistoryPeriodTable.tsx:48-53`) · `rowTaxTypeText`(`OtherLandStateHistorySection.tsx:163-171`)는 echo의 `temporaryStatusWindow`를 읽으므로 창 문자열은 그대로. 단서 플래그가 생기면 `temporaryStatusText`에 같은 꼬리말 한 줄(엔진 echo가 정본 — UI 계산 0).
- ⑥ 사이드바: 변경 없음(§1.2).

---

## 4. 엔진에 요구하는 export·변경 (R — 엔진 문서와 대조 후 확정)

| # | 요구 | 이유 |
|---|---|---|
| R-1 | **사슬 술어 `demolishedPublicUseAsked(need: Pick<DemolishedRequiredFacts, "otherUse" \| "vacantHouse">, ev: { demolishedOtherUseBefore, demolishedVacantHouseBefore, demolishedPublicUseBefore, demolishedPublicUsePaidBefore }): { publicUse: boolean; paid: boolean; dates: boolean }`**(엔진 문서 §3.2 정본 — `kind` 인자 없음. leaf — React·Date 비교 없음) | ⑤ 노출·④ 운반·⑧·⑫′·⑭가 **같은 함수 하나**를 부른다. 구조(필요 칸)와 답 의존을 한 곳에 둔다 |
| R-2 | `firstBlankDemolishedFact(ev, required)`가 R-1을 내부에서 불러 **빈칸 순서 허가 → 건축 외 용도 → 빈집정비 → 공용 사용(P1) → 유료(P2) → 시작일(P3) → 종료일(P4 — 빈칸·해석 불가·시작일 이전 모두 결함) → 바닥면적** 반환, `DemolishedRowFactField` union에 4키 추가, `MESSAGE_OF` 문구 4개 | ⑧·⑫′·⑤ 미리보기가 한 함수 |
| R-3 | `demolishedStatusWindow`: ① `facts`에 4키 추가 ② 단서 충족 과세기준일 `s`의 판정 = `s ∈ [개시일, 종료일]`(양 끝 포함 · **종료일 필수**) ∧ P1·P2 «예» ∧ **주택 ∧ vacantHouse «예»** ③ **창 = 기존 한시 창 ∩ [개시일, 종료일 + 1일)**(결정 — 엔진 Q-3 (가)·UQ-7) | 판정 정본 |
| R-4 | `LandStateInterval`·`StateHistoryIntervalEcho`에 `temporaryStatusPublicUse?: boolean` + 고지 상수(엔진 문서 §3.6 — `…_PUBLIC_USE_ACCEPTED_NOTICE` · `…_PUBLIC_USE_NO_BASE_DATE_NOTICE`) | ⑤⑦ 표시용 |
| R-5 | 접힘 사유: P1·P2 «아니오·모름» → `demolished_other_use` 유지(+ **단일 문구의 둘째 문장을 «없었다면 「아니오」» 조건문으로 교체**하고 단서·무상(비과세) 안내 추가 — 상태별 변형 없음), 사용 기간에 과세기준일 없음 → 신규 **`demolished_public_use_no_base_date`** + `BARE_DEMOLISHED_FOLD_NOTICE` 항목(`satisfies Record<DemolishedFoldReason, string>`가 누락을 막는다) | 문구 단일 소스 |
| R-6 | ⑭ `demolishedFactFields`(`form-mapper-helpers.ts:363-381`)에 4키(날짜는 `lib/api/date-coerce.ts` 경유 — `new Date(x)` 금지) · ⑫ 스키마 `nblStateEventRawSchema`(`:68-71` 옆)에 4키 · ⑫′ refine이 R-2 호출 | 5단 파이프라인 |
| R-7 | **불필요**(결정) — 시행본 게이트 함수를 새로 만들지 않는다. 괄호형·단서형 모두 후보 과세기준일 ≥ 2024.6.1.이라 `need.vacantHouse ∧ need.otherUse`(구조 술어)가 시행본 게이트를 이미 포함한다(엔진 문서 §3.2 · §5.3). 연혁 문구(2.절 두 형)는 엔진 `demolishedStatusNotice`가 이미 시행본별로 낸다 | — |
| R-8 | `NBL.*` 법령 상수 + `additions-nbl.ts` 등록(`verify:legal`) — 「지방세법 시행령」 §103의2 2호 **다만** 이하·「지방세법」 §109② 단서 키워드 verbatim | CLAUDE.md 법령 상수 규칙(엔진 PR) |

---

## 5. 14지점 매핑 (UI PR 기준)

| 지점 | 변경 | 위치 |
|---|---|---|
| ① 폼 상태 | `NblOtherStateEventInput`에 optional 4키 `demolishedPublicUseBefore?: DemolishedFact` · `demolishedPublicUsePaidBefore?: DemolishedFact` · `demolishedPublicUseFromBefore?: string` · `demolishedPublicUseToBefore?: string` | `calc-wizard-asset-nbl-other.ts:78-81` 옆 |
| ② initial | 초기값 변경 **없음**(optional — 키 부재 = 종전 행과 byte-identical; 초기값은 `nblOtherStateEvents: []` — `calc-wizard-asset-factory.ts:381` · `calc-wizard-asset-nbl.ts:184`). **재산세 구분 변경 리셋** `RESET_DEMOLISHED_FACTS`에 새 4키 추가는 §3.4(⑤ 컴포넌트 쪽 — 엔진 문서 ② 행과 같은 일) | `OtherLandBareIntervalFields.tsx:55-60` |
| ③ normalize | `migrateNblStateHistory`(`calc-wizard-asset-migrate-nbl.ts:77-93`)에 3지선다 2키(`fact()`)·날짜 2키(문자열일 때만) — `mayCloseBare`일 때만 보존 · 키가 없던 행은 키를 만들지 않는다. **영향**: E3f-2 머지 후 저장된 세션 중 빈집 «예» + 건축 외 용도 «예» 행은 새 필수 칸 때문에 ⑧이 막힌다(§7 UQ-6 — 사용자 결정 2026-11-24: 필수 · 엔진 Q-7 (가) 400) | 동 |
| ④ API 변환 | `demolishedWireFacts`(`nbl-other-state-history-scope.ts:158-175`)가 **R-1 사슬이 요구하는 칸만** 싣는다(키는 값이 있을 때만). 사슬 입력 = 같은 함수가 방금 만든 사실 4칸 | `lib/calc/nbl-other-state-history-scope.ts` |
| ⑤ UI | §3 — `OtherLandDemolishedFactsField.tsx`에 마운트 + 새 `OtherLandDemolishedPublicUseField.tsx` · `RESET_DEMOLISHED_FACTS` 확장 · 건축 외 용도 hint 한 줄 | `components/calc/transfer/nbl/` |
| ⑥ 사이드바 | 변경 없음 | — |
| ⑦ 결과 | §3.5 — echo 창·고지(엔진 R-4·R-5) 표시만 | `NblStateHistoryPeriodTable.tsx` · `OtherLandStateHistorySection.tsx` |
| ⑧ validate | `demolishedRowFactError`의 `switch`에 4 case(**리터럴 접두 `nblOtherStateEvents.${issue.index}.demolishedPublicUseBefore` 등** — 정적 게이트) · 문구는 엔진 R-2 | `transfer-tax-validate-nbl-state-history.ts:130-139` |
| ⑨~⑪ | 해당 없음(enum 신규 값 없음 — 기존 `NBL_DEMOLISHED_FACT_VALUES` 재사용 · enum 필드는 ⑫ 행 스키마에만 있다 — 엔진 문서 §3.5 ⑨⑩ 행과 같은 서술) | — |
| ⑫ Zod | `nblStateEventRawSchema`에 4키 — 3지선다 2키 `z.enum(NBL_DEMOLISHED_FACT_VALUES).or(z.literal("")).optional()` · 날짜 2키 `z.string().optional()`(바닥면적과 같은 규약) | `transfer-tax-schema-nbl.ts:68-71` 옆 |
| ⑫′ refine | 기존 호출이 R-2 확장을 자동으로 읽음(`transfer-tax-schema-nbl-refines.ts:125-130`) — 호출 인자 변경 없음 확인 | — |
| ⑬ body | 사건 행은 `nblOtherStateEvents` 배열째 실려 새 키는 ④가 만든 와이어 객체에 있으면 통과 — **route 관통 anchor로 고정**(침묵 strip) | `__tests__/api/…e3-5d-route.anchor.test.ts` |
| ⑭ Route/mapper | R-6 | 엔진 PR |

### 5.1 ⑧↔⑫′ parity 격자 (구현 위험의 중심)

`__tests__/lib/calc/nbl-state-history-e3-5c-facts.anchor.test.ts:128-188`의 격자(실제 ⑧ · 실제 ⑫′ · ④ 와이어 · 독립 진리표)를 **확장**한다(새 파일 `…e3-5d-public-use.anchor.test.ts`). 격자 축:

- 카드(기타토지 주택 철거 행 / 주택부수토지) × 양도·철거·닫는 행 시행본(단서 전(2023) · 괄호형(2024-06~2025) · 단서형(2026-06~)) × `vacantHouse` {"", yes, no, unknown} × `otherUse` {…} × `publicUse` {…} × `paid`(`demolishedPublicUsePaidBefore`) {…} × 시작일 {빈칸, 해석 불가, 유효} × 종료일 {빈칸, 해석 불가, 시작일 이전, 유효} × `historyRead` {참, 거짓}. **종료일 빈칸은 «유효»가 아니라 결함 셀**(Q-4 (가)).
- 단언: (a) ⑫′ 400 ⊆ ⑧ 차단 (b) 같은 칸·같은 문구 (c) 독립 진리표(사슬을 손으로 쓴 표 — 엔진 R-1을 재호출하지 않는다)와 일치 (d) `historyRead` 거짓이면 요구 0 (e) **stale 요구 0**(상위 답이 사슬을 끊으면 하위 값이 남아 있어도 ④ 비전송·⑧ 무요구·⑫′ 무요구) (f) **렌더 격자**: 같은 셀에서 `OtherLandDemolishedFactsField`를 jsdom 렌더해 **보이는 `data-field` 앵커 집합 = ⑧ 첫 빈칸 후보 집합(요구 칸)** — 「노출 ≡ 필수」.
- 격자 규모(공허 방지) 단언 + E3f-2 격자의 `K-10d` «명시 모름·예는 차단하지 않는다» 확장(P1·P2 «아니오·모름»은 차단 안 함, 접힘).
- mutation probe(안전망 실측 — 메모리 `hub_anchor_mutation_feedback`): ④ 사슬에서 `paid` 단계만 빼기 / ⑧만 `publicUse` 대신 `paid` 읽기 / ⑫′ 날짜 순서·종료일 빈칸 검사 삭제 — 각 변이가 격자에서 실패하는지 확인한다.

---

## 6. 테스트·E2E 계획

| 층 | 내용 |
|---|---|
| 엔진 anchor (엔진 PR) | R-1 진리표 · 창 한정(전체/한정 — 오라클 `evalDayRow` 대조) · 시행본별 문언 · 접힘 우선순위 |
| UI anchor `.test.tsx` | 노출 격자(§5.1 f) · 선택지 순서·testid · stale 보존·리셋(구분 변경만) · ④ 와이어 byte-identical(키 없던 행) · ③ migrate(허용값 밖 버림·키 미생성) · `showOutcome` 지연 |
| route anchor | ⑬ 관통: body에 새 키 → 엔진 도달(`demolished_other_use` → accepted) · 직접 API 사슬 불성립 stray → 무시 · **종료일 빈칸 → 400** |
| field-jump 케이스 | `e2e/_helpers/validation-field-jump-cases-nbl.ts:206-209` 옆에 4행(P1·P2 미선택 · P3 빈칸·해석 불가 · **P4 빈칸**·해석 불가·시작일 이전) — 정적 게이트 `transfer-validation-field-anchor-coverage` 통과 |
| E2E (`e2e/transfer-nbl-other-state-history-e3-5.spec.ts` 확장 또는 새 spec — 800줄 정책 확인) | **E5-11** K-7 + 빈집 «예» + 건축 외 용도 «예» → P1 노출(P2·P3·P4 숨김) · 미선택 ⑧ 차단 + 점프 · P1 «예» → P2 → «예» → P3/P4 · **종료일 빈칸 → ⑧ 차단 + P4 점프(구간 끝까지로 읽지 않음)** · 인정 창 미리보기 · 계산 body에 4키 · 결과 구간표. **기대값은 엔진 문서 §6.1 «E2E 기대값 시료»(오라클 — 구현 PR이 실측해 확정)**: **E5-11a** K-7 + P3 2024-01-01 · P4 2024-07-01 → 창 `[2024-01-01, 2024-06-03)` 154일 · 비사업용 520/2,283 · **세액 283,080,000(현행 접힘과 같음)** · 건축 외 용도 «아니오» 221,730,000 대조 · **E5-11b**(세액이 바뀌는 시료) 취득 2023-03-01 · 철거 2024-03-01 · 구분 변경 2026-12-01 · 양도 2027-01-15 · P3 2025-01-01 · P4 2026-12-01 → 사업용 1,064/1,415 · **239,370,000**(현행 접힘 304,920,000). **E5-12** 빈집정비 «아니오»로 바꾸면 하위 블록이 숨고 body에서 4키 소실 · 되돌리면 복원 · 재산세 구분을 바꾸면 리셋. **E5-13** 시행본 경계(양도·철거로 단서 전/괄호형/단서형 — 블록 노출 여부). **E5-V4** 라이트·다크 글자 대비 4.5 · 375px 가로 넘침 0 |
| 회귀 | `npx vitest run __tests__/tax-engine/non-business-land/ __tests__/lib/calc/ __tests__/api/` · `__tests__/lib/`(안전망 `nbl-state-history-leaf-unreachable.test.ts` — 새 leaf/컴포넌트 등록) · `tsc --noEmit` |
| 수동 | Playwright(메모리 `feedback_browser_verify_with_playwright`) — Network 탭 request body 신규 4키 확인 |

---

## 7. 사용자 결정 UQ (**사용자 결정 2026-11-24 반영 — 각 행 «결정» 표기가 정본, 엔진 Q와의 대응은 문서 머리말**)

| # | 질문 | 추천 | 근거 | 대안 |
|---|---|---|---|---|
| **UQ-1** | 이 단서를 입력으로 받을까, «안내만» 할까 **— 결정 2026-11-24: (가) 입력받음(= 엔진 Q-1 (가))** | **(가) 입력으로 받는다**(§3) | 사용자 결정 «Low-3 후속 처리»가 법보다 불리한 현행을 고치는 것이고, 안내만으로는 «예»인 사용자가 계속 비사업용 세액을 본다(현행 283,080,000 vs 사업용 가능 221,730,000 — §0.2). 단 §8처럼 비용 대비 효과가 낮은 셀이라는 점도 사실 | (나) 안내만 — §8 |
| **UQ-2** | 하위 질문 위치: ③(건축 외 용도) 바로 아래 vs ④a(빈집정비) 뒤 **— 결정 2026-11-24: ④a 바로 뒤** | **④a 뒤 + ③ hint 한 줄** | 종속 대상인 빈집정비가 ③ 뒤에 있어 ③ 바로 아래는 «안 보인 질문에 종속». ③↔④a 맞바꿈은 `firstBlankDemolishedFact` 순서·E3f-2 단언 반전을 부른다(비용 큼). 순서 위반이 아니라 «종속 질문은 부모 뒤» 원칙 | (나) ③↔④a 맞바꿈(빈집정비가 한시 기간 W를 정해 계산상 먼저이기도 함 — 엔진 R-2 순서 변경 + 안전망 반전 필요) |
| **UQ-3** | 요건 질문 분리: P1(공용·공공용 1년 이상) + P2(§109② 단서 — 유료·유상이전) 두 칸 vs 한 칸 **— 결정 2026-11-24: (가) 분리(= 엔진 Q-2 (가))** | **(가) 분리** | 두 요건이 법문상 별개이고 «모름» 처리·접힘 사유가 갈린다. P2는 고지서로 확인 가능한 사실이며, 합치면 «예» 한 번이 두 요건을 동시에 보증하게 돼 법보다 유리한 오답 위험(§109② 단서를 모르는 사용자) | (나) 한 칸 + hint에 §109② 설명(칸 3개로 줄어듦 · ⑧⑫ 지점 -1) |
| **UQ-4** | 사용 기간 입력 형식 **— 결정 2026-11-24: 개시일·종료일 둘 다 필수(= 엔진 Q-4 (가)). 아래 v1 추천 «종료일 비움 = 구간 끝»은 기각** | ~~(가) 시작일 필수 + 종료일 선택(비움 = 구간 끝까지)~~ → **(다) 시작·종료 모두 필수** | §0.2: 입력 값이 판정을 뒤집는다(창 한정 시 사용 기간에 따라 734/520/399 비사업용 ↔ 사업용 가능). 법문이 «사용하는 기간 동안». 두 날짜를 사용자가 말한 그대로 읽는다 — 가정값 없음 | (가) 종료일 선택 — **기각**(빈칸을 구간 끝으로 읽는 것은 사용자가 말하지 않은 값을 지어내는 자동 가정 · 13호 «종료일 비움» 선례는 소유 종료라는 다른 사실) · (나) 예/아니오만 — 불가(위 §0.2) |
| **UQ-5** | «모름»·«아니오» 처리 **— 결정 2026-11-24: 접힘 + 확인 필요, 막지 않음 · 미선택은 ⑧·⑫ 둘 다 차단** | **단서 불성립 = 현행 `demolished_other_use` 접힘 + 확인 필요**(차단 안 함) | E3f-2 일관(Q-11 (나)) · `feedback_unknown_fact_applies_unfavorably` | — |
| **UQ-6** | 새 칸을 필수(미선택 ⑧ 차단)로 할까, 선택(미선택 = 모름으로 접힘)으로 할까 **— 결정 2026-11-24: 필수(= 엔진 Q-7 (가) 400)** | **필수** | 노출 ≡ 필수 ≡ ⑫′ 400 정책 일관, 가정값 금지. 영향: E3f-2 후 저장된 «빈집 예 + 건축 외 용도 예» 세션은 새 질문에 답해야 계산(답은 «모름»이면 현행 결과와 같다) | 선택(미선택 = 아니오) — 새 칸이 사용자를 막지 않으나 «미선택=가정» 예외 신설 |
| **UQ-7** | 엔진 창 한정 방식(엔진 소관이나 UI 문구·E2E 기대값을 정한다) **— 결정 2026-11-24: 사용 기간으로 한정(= 엔진 Q-3 (가) — 창 ∩ 사용 기간 · 두 시행본 동일 · 확인 필요 유지)** | 엔진 Q로 올림 — UI 추천은 **사용 기간으로 한정**(법문 «기간 동안») | 전체 창 인정은 사용 시작 전·종료 후까지 포함해 법 근거 없는 유리. 반대로 한정하면 §0.2처럼 대부분 비사업용 유지(보수적). 법정확성 최우선 → 한정 + 고지 | 전체 창(기존 E3f-2 «창은 상한 근사 · V-14 고지» 관례와 같음) |

---

## 8. 단순화 대안 «안내만» 비교

| | (가) 입력 4칸(이 문서) | (나) 안내만 |
|---|---|---|
| 내용 | 조건부 하위 블록 + ①~⑭ 동기화 | 접힘 문구(R-5)에 «빈집정비 «예» + 국가 등 공공용 사용이면 이 계산기는 반영하지 않으므로 직접 확인» 한 줄 + 사용자가 9호 유예 등 다른 경로로 입력하도록 안내 |
| 법 일치 | 단서 충족자는 법대로 포함 | 단서 충족자는 계속 **법보다 불리**(안내로 갈음) — 메모리 `feedback_no_unfavorable_application_without_legal_basis`와 충돌 |
| 비용 | 엔진 R-1~R-8 + UI 신규 컴포넌트 1 · 수정 파일 ≈12 · parity 격자 확장 | 엔진 상수 1~2개 · UI 변경 0 |
| 위험 | 사슬 술어 5곳 일치(§5.1로 방어) · 새 필수 칸이 구 세션을 막음 | 없음 |
| 셀 크기 | 빈집정비 «예» ∧ 건축 외 용도 «예» ∧ 국가 등 공공용 사용 — 드문 조합 | 〃 |
| 추천 | **UQ-1 (가)** — **결정 2026-11-24로 확정**. 사용자가 이미 후속 처리를 결정했고, 안내만으로는 «법보다 불리»가 남는다 | 엔진 문서가 시행본·창 한정을 확정하기 전 임시 중간 단계로 쓸 수는 있다 |

---

## 9. 미검증(V) 레지스터

| # | 항목 | 상태 |
|---|---|---|
| V-1 | **단서형 첫 과세기준일** — **해소**: 영 부칙 제36043호 제13조 «제103조의2제1호 및 제2호의 개정규정은 이 영 시행 이후 납세의무가 성립하는 경우부터» → **2026.6.1.**(엔진 문서 §1.2 확인) | 확인(엔진 문서) |
| V-2 | 괄호형(2024.5.28.~2026.5.31. 시행본) 문언의 «과세기준일 현재 사용» 읽기 — 두 시행본에 같은 모델 | **Q-3 (가)로 결정**(사용자 결정 2026-11-24) — **직접 해석례 없어 «확인 필요»로 남김**(엔진 문서 V-4) |
| V-3 | 단서 반영 후 세액·일수(E2E 기대값) | **엔진 구현 후 실측**. 이 문서의 734/399/520·239,370,000은 엔진 문서 §6.1의 오라클 값(독립 오라클 + 엔진 프로토타입이 일치)일 뿐 |
| V-4 | 단서가 **주택부수토지 카드(Q-12 (가))** 에서도 같은 노출인지(모든 철거 행이 주택 → P1~P4 모두 노출 후보) — 사슬 `kind==="house"`가 두 카드 모두 참인지 | 확인 필요 — `demolishedRowViewOf`의 `tailKind` 분기 정독으로는 같다고 읽히나 렌더 실측 미수행 |
| V-5 | 375px에서 긴 라벨 + 3지선다 inline 레이아웃 줄바꿈 | 렌더 실측 미수행(E5-V4) |
| V-6 | 엔진 문서와의 이름·export 일치(§4) | **v2에서 대조·정합 완료**(엔진 문서 §5.3 대응표) |
| V-7 | `other-land-state-history.ts`(664줄) · `form-mapper-helpers.ts`(629줄) 추가 후 줄 수 | 각 +30 이하 예상(≤700) — 구현 시 실측. 새 UI 컴포넌트 ≈130줄 |

---

## 10. 파일 목록 (UI PR 예상)

수정: `lib/stores/calc-wizard-asset-nbl-other.ts` · `lib/stores/calc-wizard-asset-migrate-nbl.ts` · `lib/calc/nbl-other-state-history-scope.ts` · `lib/calc/nbl-demolished-row-scope.ts`(사슬 뷰 전달 시) · `lib/calc/nbl-other-state-history-preview.ts`(와이어→엔진 사실 4키) · `lib/calc/transfer-tax-validate-nbl-state-history.ts` · `components/calc/transfer/nbl/OtherLandDemolishedFactsField.tsx` · `OtherLandBareIntervalFields.tsx`(리셋 4키) · `components/calc/NblStateHistoryPeriodTable.tsx`(플래그 시 꼬리말) · `e2e/_helpers/validation-field-jump-cases-nbl.ts` · 테스트.
신규: `components/calc/transfer/nbl/OtherLandDemolishedPublicUseField.tsx` · `__tests__/lib/calc/nbl-state-history-e3-5d-public-use.anchor.test.ts(x)` · `__tests__/api/nbl-state-history-e3-5d-route.anchor.test.ts`.
엔진 PR 소관(참고): `demolished-temp-status.ts`(284줄) · `demolished-row-facts.ts`(123줄) · `land-usage.types.ts`(520줄) · `nbl-enum-values.ts` · `form-mapper-helpers.ts` · `transfer-tax-schema-nbl.ts`(340줄) · `nbl-confirm-notices.ts` · `state-history-echo.ts` · `legal-codes` · `additions-nbl.ts`.
