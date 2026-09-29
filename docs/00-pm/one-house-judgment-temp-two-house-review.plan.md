# 1세대1주택 판정 — §155① 처분기한 「조건부」 오판정 수정 + 비과세 요건 순차 검토 표시

- 작성일: 2026-09-29
- 대상 화면: `/calc/one-house-exemption` ④ 판정 결과 (`components/calc/results/OneHouseJudgmentResultView.tsx`)
- 상태: **Do 완료(2026-09-29)** — Q-1=B · Q-2=나 · Q-3=정정. V-1~V-7 확인(§9-1). 전체 vitest 2385파일 25,439건 통과 · E2E 2건 · 뮤테이션 10/10 KILL

---

## 1. 제보 요약

| 입력 | 값 |
|---|---|
| 양도 대상 주택 | 서울 서초구, 취득 **2018-07-06**, 양도 예정 **2026-10-22**, 예상 양도가 24억 |
| 취득 당시 조정대상지역 | 해당(2017-08-03 고시) → 거주 2년 필요 |
| 거주 | 2022-03-22 ~ 2024-05-31 = **26개월** |
| 다른 보유 주택 | 1채, 취득 **2023-07-01** (→ 신규 주택) |
| 조회일 | **2026-09-29** |

화면 결과: **「조건부」** — 「2026-07-01까지 — 신규주택 취득일부터 이 날짜까지 종전주택을 양도해야 비과세」

제보 결함 두 가지:

1. 양도 예정일(2026-10-22)이 처분기한(2026-07-01)을 넘었으므로 입력한 날짜 기준 판정은 **과세**인데 「조건부」로 표시된다.
2. 처분기한 2026-07-01은 **조회일(2026-09-29)에 이미 지났다**. 지금은 이룰 수 없는 조건을 안내하고 있다.

요청 기능: 판정 결과에 **비과세 법정요건을 순서대로 검토한 내용**을 보여 줄 것.
(1) 종전주택 취득 후 1년이 지나 신규주택을 취득했는가 → (2) 신규주택 취득일부터 3년 안에 종전주택을 양도하는가 → (3) 거주요건이 필요하면 충족했는가

---

## 2. 실측 재현 (2026-09-29, 임시 probe — 실행 후 삭제함)

`checkExemption(baseTransferInput({...제보값}), mockRules)`:

```
isExempt=false, isPartialExempt=false
pending = [{ id: "155-1-disposal-deadline", deadline: 2026-07-01, legalBasis: "소득세법 시행령 §155①" }]
undetermined = [], unmetExceptions = []
timing = { oneYearThreshold: 2019-07-07, oneYearMet: true, deadline: 2026-07-01, threeYearMet: false, overall: false }

(대조) 양도일만 2026-06-30으로 바꾸면 → isPartialExempt=true, "일시적 2주택 고가주택"
```

⇒ 엔진의 과세 판정은 맞다. **결함은 `pending`을 만드는 방식과 그것을 「조건부」 배지로 읽는 방식**에 있다.

---

## 3. 원인 분석 (file:line 실측)

### 3-1. pending은 「조회일」을 모른다

- `lib/tax-engine/one-house/pending.ts:172-205` — `155-1-disposal-deadline`은 `!timing.threeYearMet && oneYearMet && 보유·거주 충족`이면 **무조건** 만든다. 기한이 이미 지났는지는 보지 않는다.
- 엔진 입력(`OneHouseJudgeInput`)과 route(`app/api/calc/one-house-exemption/route.ts:138-181`) 어디에도 판정 기준일(조회일)이 없다. 엔진이 비교할 수 있는 날짜는 양도일뿐이다.
- 같은 성격(「이 날짜까지 양도」)의 pending이 **6종** 더 있고 모두 같은 결함을 갖는다:

| id | 조문 | 방향 | 조회일 경과 시 성취 가능? |
|---|---|---|---|
| `156-2-3-right-three-year` | §89② / §156의2③ | 이 날까지 양도 | ❌ |
| `155-1-disposal-deadline` | §155① | 이 날까지 양도 | ❌ ← **제보** |
| `155-5-marriage-merge` | §155⑤ | 이 날까지 양도 | ❌ |
| `155-4-parental-care-merge` | §155④ | 이 날까지 양도 | ❌ |
| `155-8-unavoidable-resolved` | §155⑧ | 이 날까지 양도 | ❌ |
| `155-7-3ho-return-to-farm` | §155⑦3호 | 이 날까지 양도 | ❌ |
| `154-1-holding-years` | §154① | 이 날 **이후** 양도 | ✅ (지나면 오히려 충족) |

### 3-2. 「조건부」 배지는 pending 유무만 본다

- `lib/calc/one-house-judgment-verdict.ts:56-62` — `pending.length > 0`이면 「조건부 — 아래 조건을 기한 내에 갖추면 비과세」.
- 이 술어는 결과뷰와 **이력 카드·불러오기 모달이 공유**한다(같은 파일 머리 주석). 여기를 바꾸면 이력 라벨도 바뀐다.

### 3-3. 요건 검토 내용이 결과 화면에 없다

- 입력 단계(`app/calc/one-house-exemption/steps/Step2.tsx:84-88` → `lib/calc/one-house-judgment-temp-two-house.ts`)와 양도세 계산기(`TemporaryTwoHouseSection.tsx:313-330`)에는 요건 A(1년)·B(처분기한) 카드가 **이미 있다**.
- 그러나 결과뷰는 결론(배지)과 pending만 보여 주고 **어느 요건을 충족했고 어느 요건에서 떨어졌는지**는 보여 주지 않는다. 엔진 결과(`OneHouseJudgment`, `types.ts:300-360`)에도 요건별 검토 내용이 담겨 있지 않다.

### 3-4. (곁가지 발견) pending 문구가 고가주택에서 부정확하다

- `pending.ts:192` 「…양도해야 **비과세**」 — 제보 사례는 기한 안에 팔아도 24억 > 12억이라 **부분 비과세**(12억 초과분 과세)다(§2 대조 실측). 문구가 결론보다 넓다. → Q-3

---

## 4. 법령 근거 (KoreanLaw MCP 확인 — 소득세법 시행령 MST 286211, 2026-07-01 시행 현행본)

「소득세법 시행령」 §155① 본문:

> 국내에 1주택을 소유한 1세대가 그 주택(…"종전의 주택")을 양도하기 전에 다른 주택(…"신규 주택")을 취득…함으로써 일시적으로 2주택이 된 경우 **종전의 주택을 취득한 날부터 1년 이상이 지난 후 신규 주택을 취득**하고 **신규 주택을 취득한 날부터 3년 이내에 종전의 주택을 양도**하는 경우(제18항에 따른 사유에 해당하는 경우를 포함한다)에는 이를 1세대1주택으로 보아 **제154조제1항을 적용**한다.

⇒ 검토해야 할 법정요건과 순서:

| 순서 | 요건 | 근거 | 엔진 술어(정본) |
|---|---|---|---|
| ① | 종전주택 취득일부터 1년 이상 지난 후 신규주택 취득 (§154①1·2가·3호 사유, §155⑯이면 면제) | 영 §155① 전단·후단, ⑯ 후단 | `judgeTemporaryTwoHouseTiming().oneYearMet` |
| ② | 신규주택 취득일부터 3년(연혁·⑯ 5년) 안에 종전주택 양도 (⑱ 사유면 충족으로 봄) | 영 §155① 본문·⑯·⑱ | `…timing.threeYearMet` / `deadline` |
| ②′ | (2019-12-17~2022-05-09 체제 한정) 1년 내 세대 전원 전입 | 구 영 §155①2호 가목 | `…timing.moveInMet` |
| ③ | 종전주택 **보유 2년** | 영 §154① (§155①이 준용) | `meetsTemporaryTwoHousePrevHolding` |
| ④ | 종전주택 **거주 2년** — 취득 당시 조정대상지역일 때만 필요 | 영 §154① 본문 괄호 | `meetsOneHouseResidenceRequirement` |
| (결론) | 양도가액 12억 초과면 초과분 과세 | 법 §89①3호 각 목 외의 부분 | `resolveHighValueHouseThreshold` |

> 📌 사용자가 적은 3개 요건 외에 **③ 보유 2년**을 넣는다. §155①이 「제154조제1항을 적용한다」로 보유요건을 그대로 요구하므로 빠뜨리면 검토가 불완전하다(가정 A-1). ②′는 해당 연혁일 때만 한 줄이 생긴다.

---

## 5. 해결 방향

### 5-1. 판정 기준일(조회일) 도입 — 결함 2

- route가 서버 시각을 **한국 날짜(Asia/Seoul)**로 잘라 `judgmentBaseDate`를 만들고 엔진 입력에 넣는다. Vercel 서버는 UTC라서 `new Date()`를 그대로 쓰면 00:00~09:00 KST 사이에 날짜가 하루 앞선다(V-2).
- 엔진은 순수 함수를 유지한다 — 「오늘」을 스스로 읽지 않고 **입력으로 받는다**. 이 값이 없으면(양도세 계산기·기존 테스트) 지금 동작 그대로 둔다.
- 「이 날까지 양도」 6종은 **기한 < 판정 기준일**이면 pending에서 뺀다(기한 당일은 아직 가능 → 남긴다). `154-1-holding-years`는 대상이 아니다.
- 이를 위해 pending 항목에 방향 표지 `kind: "transfer_by" | "transfer_after"`를 둔다. id 문자열로 분류하지 않는다 — 새 pending이 추가될 때 분류를 빠뜨리지 않도록 **타입이 강제**하게 한다.
- 응답에 `judgmentBaseDate`를 함께 실어 결과 화면에 「판정 기준일 2026-09-29」를 표시한다. 이력 상세는 저장 당시의 판정이므로 이 표지가 있어야 「왜 지금은 지난 기한이 보이나」를 설명할 수 있다.

### 5-2. 판정 배지 의미 — 결함 1 (**Q-1 = B 확정**)

양도 예정일이 기한을 넘었지만 기한은 아직 오지 않은 경우(예: 조회일 2026-05-01, 기한 2026-07-01, 예정일 2026-10-22)를 어떻게 표시할지 정해야 한다.

- **(A) 최소 수정**: 5-1만 적용한다. 이룰 수 없는 기한만 빠지고, 이룰 수 있으면 지금처럼 「조건부」로 둔다. 제보 사례는 과세로 바뀐다.
- **(B) 입력일 기준 판정 (권장)**: 배지는 항상 **입력한 양도(예정)일 기준** 결론(과세)으로 둔다. 이룰 수 있는 기한은 배지가 아니라 별도 안내 카드(「양도일을 조정하면 비과세가 가능합니다」)로 보여 준다.
  - 근거: 엔진은 입력한 양도일로 판정한다. 「조건부」는 **입력한 날짜로는 이미 떨어진 요건**을 조건처럼 보이게 한다. 제보자 문장(「양도예정일이 조건 이후라 판정은 과세가 맞다」)과도 맞는다.
  - 파급: pending이 있으면 언제나 과세가 아니므로 「조건부」 라벨이 **사라진다**. 이력 목록·불러오기 모달의 기존 기록 라벨도 「조건부」에서 「과세」로 바뀐다(같은 술어를 공유하므로 자동). `154-1-holding-years`도 「과세 + 이 날 이후 양도하면 비과세」로 바뀐다.

### 5-3. 비과세 요건 순차 검토 카드 — 요청 기능

- **엔진이 echo한다**(echo-field-pattern). UI가 날짜를 다시 계산하면 dual truth가 된다(결과뷰 머리 주석 「날짜를 다시 계산하지 않는다」).
- `OneHouseJudgment.requirementReview?: { scheme: "155-1-temporary-two-house" | "154-1-one-house"; items: RequirementCheck[] }`
  - `RequirementCheck = { id; label; status: "met" | "unmet" | "waived" | "not_required"; facts: {label, value}[]; note?; legalBasis }`
  - 각 `status`는 §4 표의 **정본 술어 반환값을 그대로** 옮긴다(재판정 금지).
- **scheme 2종**(Q-2 = 나):
  - `"155-1-temporary-two-house"` — 아래 표와 §4 순서.
  - `"154-1-one-house"` — 1주택 단독 양도(`householdHousingCount === 1`, 특례 미선언). 행: ① 1세대 1주택(판정 주택 수 1채) → ② 보유 2년(§154⑤·⑧3호 기산 보정 반영, §154① 단서면 면제) → ③ 거주 2년(취득 당시 조정대상지역일 때만, 2017-08-02 이전 취득 경과규정·상생임대 면제 구별) → 결론 행 고가주택 12억(양도일 연혁 기준금액).
  - 그 밖의 §155 특례(합가·상속·농어촌·부득이·문화유산·§155⑳ 등)는 **이번 범위 밖**이다. 해당 판정에서는 `requirementReview`를 싣지 않는다(기존 카드가 그대로 담당). 후속 확장 여지만 남긴다.
- 조립 조건(§155①): E-3과 같은 게이트 — `householdHousingCount === 2 && temporaryTwoHouse && twoHouseRule` + pending.ts 선행 게이트 3개(미등기·부수토지·1세대/주택). 그 밖의 경우에는 싣지 않는다.
- 판정은 **단락하지 않고 전 요건을 끝까지 검토**해 모두 보여 준다(①이 미충족이어도 ②③④를 표시). 사용자가 「어디서 떨어졌는지 + 나머지는 괜찮은지」를 한 번에 봐야 하기 때문이다.
- ④ 거주요건은 「필요 없음」과 「충족」을 구별해야 하는데 현재 `meetsOneHouseResidenceRequirement`(`transfer-tax-exemption-requirements.ts:392-`)는 boolean만 준다. ⇒ 그 함수의 분기를 **사유를 돌려주는 leaf**(`describeResidenceRequirement`)로 추출하고, 기존 boolean 함수는 그 leaf에서 파생시킨다(단일 소스 — 동작 불변을 기존 테스트로 보장).
- 화면 배치: 「주택 수 산정」 바로 다음(로직 순서 = 표시 순서). 각 행은 `충족/미충족/면제/해당 없음` 배지 + 근거 날짜 + 조문 링크(`LawArticleModal`).

제보 사례의 예상 표시:

| # | 요건 | 결과 | 근거 |
|---|---|---|---|
| 1 | 종전주택 취득 후 1년 지나 신규주택 취득 | ✅ 충족 | 종전 취득 2018-07-06 · 1년 경과일 2019-07-07 · 신규 취득 2023-07-01 |
| 2 | 신규주택 취득일부터 3년 안에 종전주택 양도 | ❌ 미충족 | 처분기한 2026-07-01 · 양도 예정 2026-10-22 |
| 3 | 종전주택 보유 2년 | ✅ 충족 | 2018-07-06부터 8년 3개월 |
| 4 | 종전주택 거주 2년(취득 당시 조정대상지역) | ✅ 충족 | 거주 26개월 |
| 결론 | 과세 (2번 미충족) | | 처분기한이 판정 기준일 2026-09-29 전에 지나 치유 불가 |

> 위 수치 중 3번 「8년 3개월」은 `calculateHoldingPeriod` 실측 전 **추정값**이다 — Pre-Do anchor에서 확정한다(V-3).

---

## 6. 변경 범위 (예상 — Q 결정 후 확정)

| 층 | 파일 | 내용 |
|---|---|---|
| 엔진 타입 | `lib/tax-engine/one-house/types.ts` | 입력 `judgmentBaseDate?: Date` · pending `kind` · `requirementReview?` |
| 엔진 분리(선행) | `lib/tax-engine/one-house/pending.ts` (**현재 800줄**) | `collectUnmetExceptions`·그 하위 함수(약 :420~:800)를 `one-house/unmet-exceptions.ts`로 **순수 이동**. 800줄 hard cap이라 한 줄도 더 넣을 수 없다. 재수출로 import 경로 보존 |
| 엔진 | `pending.ts` | 7개 push에 `kind` 부여 + 기준일 필터 |
| 엔진 | `lib/tax-engine/transfer-tax-exemption-requirements.ts` (694줄) | `describeResidenceRequirement` leaf 추출, boolean 함수는 파생 |
| 엔진 신규 | `lib/tax-engine/one-house/requirement-review.ts` | §155①·§154① 두 scheme 요건 검토 조립(정본 술어 호출만) |
| 엔진 | `lib/tax-engine/transfer-tax-exemption.ts` (599줄) | `checkExemption` 반환에 `requirementReview` 싣기 |
| Route | `app/api/calc/one-house-exemption/route.ts` | KST 기준일 생성·주입, 응답 echo |
| UI 술어 | `lib/calc/one-house-judgment-verdict.ts` | 배지 의미 변경(Q-1=B) — pending은 배지를 바꾸지 않음. 「조건부」 라벨 제거 |
| 엔진 문구 | `pending.ts` 7개 description | Q-3 — 고가주택이면 「부분 비과세(기준금액 초과분 과세)」. 기준금액은 `resolveHighValueHouseThreshold` |
| UI | `components/calc/results/one-house/RequirementReviewCard.tsx` (신규) | 요건 검토 카드 |
| UI | `OneHouseJudgmentResultView.tsx` (414줄) | 카드 배치 · 기준일 표지 · pending 카드 제목 「양도일을 조정하면 비과세가 가능합니다」 |

- 입력 폼·Zod·④ 변환은 **건드리지 않는다** — 기준일은 서버가 만들고 사용자가 입력하지 않는다. 14 동기화 지점 중 해당하는 곳은 ⑦(결과 카드)과 ⑭(route → 엔진 입력)이다.
- 양도세 계산기 경로(`transfer-tax.ts` → `checkExemption`)에는 기준일을 넘기지 않는다 → **세액 변경 0**. `requirementReview`는 optional echo라 계산기 결과에 실려도 무해하다(V-4에서 JSON 직렬화·결과뷰 미사용 확인).

---

## 7. 작업 순서 (Do)

```
0. pending.ts 순수 분리(unmet-exceptions.ts)         → verify: tsc 0 · 기존 one-house 테스트 전건 통과(동작 불변)
1. Pre-Do anchor(RED) 작성 — 제보 사례 그대로          → verify: 현행 코드에서 RED (기준일 필터·review 부재)
2. types + pending kind + 기준일 필터                  → verify: anchor 필터 부분 GREEN, 기존 PD-* 무변경 통과
3. describeResidenceRequirement 추출                  → verify: 거주요건 관련 기존 테스트 전건 통과(동작 불변)
4. requirement-review.ts + checkExemption echo         → verify: anchor review 부분 GREEN(날짜 정확값)
5. route 기준일(KST) 주입·echo                         → verify: route anchor — UTC 23:30 = KST 다음날 경계 케이스
6. verdict 술어(Q-1) + 결과뷰 카드                     → verify: RTL 테스트(순서·testid·배지), 이력 라벨 테스트 갱신
7. 뮤테이션 probe                                       → verify: 필터 제거·kind 뒤바꿈·「<」→「<=」 각각 anchor가 KILL
8. E2E 1건 + 브라우저 확인(Playwright)                  → verify: 제보 입력 재현 → 과세 + 요건 4행
9. npm run test:transfer + typecheck + lint
```

---

## 8. 테스트 계획

### 엔진 anchor (`__tests__/tax-engine/transfer/one-house-temp-two-house-review.anchor.test.ts`)

| ID | 케이스 | 기대 |
|---|---|---|
| R-1 | 제보 사례, 기준일 2026-09-29 | pending `[]`, 과세, review 4행 = 충족·미충족·충족·충족, 날짜 정확값 |
| R-2 | 긍정 짝 — 같은 사례, 기준일 2026-05-01 | `155-1-disposal-deadline` 남음(2026-07-01) |
| R-3 | 경계 — 기준일 = 기한(2026-07-01) | 남음 (기한 당일까지 양도 가능) |
| R-4 | 경계 — 기준일 = 기한 + 1일 | 빠짐 |
| R-5 | `154-1-holding-years` + 기준일이 그 날짜 이후 | **남음**(`transfer_after`는 필터 대상 아님) |
| R-6 | 기준일 미제공(계산기 경로) | 종전 동작 그대로(PD-1 등 기존 anchor 무변경) |
| R-7 | 요건 ① 미충족(신규 취득이 1년 이내) | review ①=unmet, 나머지도 끝까지 표시 |
| R-8 | 거주 불요(취득 당시 비조정) | review ④ = `not_required`(「충족」과 구별) |
| R-9 | §154① 단서·⑯로 1년 면제 | review ① = `waived` + 사유 |
| R-10 | ⑱ 처분기한 예외 | review ② = met + ⑱ note |
| R-11 | 6종 `transfer_by` 각각 기한 < 기준일 | 전부 빠짐(축별 1건) |
| R-12 | 1주택 단독 · 조정지역 취득 · 거주 24개월 · 10억 | scheme `154-1-one-house`, ①②③ 충족, 결론 비과세 |
| R-13 | 1주택 단독 · 거주 23개월 | ③ unmet, 과세 |
| R-14 | 1주택 단독 · 2017-08-02 취득(경과규정) | ③ `not_required`(경과규정 사유) — 「충족」과 구별 |
| R-15 | 1주택 단독 · 24억 · 요건 충족 | 결론 행 = 부분 비과세(12억 초과분) |
| R-16 | Q-3 문구 — 제보 사례 기준일 2026-05-01 | pending 문구가 「부분 비과세」 |
| R-17 | 범위 밖 특례(합가 선언) | `requirementReview` 없음 |

### UI (RTL, `.test.tsx`)
- 요건 카드가 「주택 수 산정」 다음에 오고 행 순서가 ①→②→③→④인지 · 기준일 표지 · 구 이력(`requirementReview` 없음)이면 카드를 렌더하지 않음.
- 배지 = 과세, 안내 카드 제목 변경. 이력 라벨 테스트(`oneHouseVerdictLabel`) 갱신 — 「조건부」 단언 역방향 grep 전수(`e2e/`·`__tests__/`).

### E2E
- `e2e/one-house-judgment-temp-two-house-review.spec.ts` — 기한이 **이미 지난** 제보 사례만 둔다. 기한이 미래인 케이스는 실행 날짜에 따라 결과가 바뀌어 flaky해지므로 단위 테스트(기준일 주입)에서만 다룬다.

### 영향받는 기존 테스트 (역방향 grep 결과 — 갱신 대상 후보)
`__tests__/tax-engine/transfer/one-house-judgment-pending-undetermined.anchor.test.ts` · `one-house-deadline-civil-161.anchor.test.ts` · `one-house-deadline-leap-boundary.anchor.test.ts` · `temporary-two-house-regulated-move-in-a2b.anchor.test.ts` · `__tests__/api/one-house-exemption.route.anchor.test.ts` · `__tests__/api/one-house-deadline-civil-161.route.anchor.test.ts` · `__tests__/calc/one-house-exemption-api.anchor.test.ts`
→ route anchor 2건은 과거 기한을 쓰므로 **기준일이 들어가면 pending이 사라진다**. 테스트에서 기준일을 고정 주입할 수 있게 route에 시계 주입점(테스트 전용 아님 — 모듈 함수 `resolveJudgmentBaseDate(now)`)을 두고 `vi.setSystemTime`으로 고정한다(V-5).

---

## 9. 레지스터

### 사용자 결정 (Q)

| ID | 질문 | **결정(2026-09-29)** |
|---|---|---|
| Q-1 | 기한 미도래·예정일 초과 시 배지 | **B** — 입력일 기준 「과세」 + 「양도일을 조정하면 비과세 가능」 안내. 「조건부」 라벨 폐지 |
| Q-2 | 요건 검토 카드 범위 | **나** — §155① 일시적 2주택 + 1주택 단독 양도 |
| Q-3 | 고가주택 pending 문구 | **정정** — 같은 PR |

### 가정 (A)

- A-1: 요건 검토에 ③ 보유 2년을 포함한다(§155① → §154① 적용). 
- A-2: 판정 기준일은 **서버 시각의 한국 날짜**다. 사용자가 고르지 않는다.

### 미검증 (V) — Do 전 확인

- V-1: 6종 `transfer_by` pending 각각에 대해 「기한 < 기준일이면 치유 불가」가 법적으로 맞는지 — 특히 §155⑧(해소일 기준)·§155⑦3호(귀농주택 취득일 기준)는 기산일이 과거 사실이라 성립할 것으로 보이나 **축별로 확인 필요**.
- V-2: 배포 런타임 TZ가 UTC인지, 기존 코드에 KST 날짜 유틸이 있는지(현재 `Asia/Seoul` 사용처는 `lib/tax-engine/same-adjustment-period-std-price.ts` 1곳 — 재사용 가능 여부 확인 필요).
- V-3: 제보 사례의 보유기간 표시값 — `calculateHoldingPeriod` 실측.
- V-4: `requirementReview`가 양도세 계산기 결과(`TransferTaxResult`)에 섞여 들어가는지, 들어가면 이력 JSON 크기·표시에 영향이 없는지.
- V-5: route anchor에서 시각 고정 방식(`vi.setSystemTime`)이 기존 route 테스트와 충돌하지 않는지.
- V-7: 「조건부」 라벨을 단언하는 기존 테스트·E2E와 이력 화면(목록·드로어·불러오기 모달) 전수 — 라벨 변경 파급 범위.
- V-6: `describeResidenceRequirement` 추출 시 `meetsOneHouseResidenceRequirement` 호출처 전수(비과세·중과·장특공) — 동작 불변 확인 범위.

---

### 9-1. V 확인 결과 (2026-09-29)

| ID | 결과 |
|---|---|
| V-1 | 6종 모두 기산일이 **과거 사실**(신규 취득일·권리 취득일·합가일·해소일·귀농주택 취득일)이고 법문이 「그 날부터 N년 이내에 양도」다(영 §155①④⑤⑦⑧, 현행 MST 286211 실독). 기한이 기준일 전에 지나면 치유 불가 — 필터 성립. ⑱ 사유는 `threeYearMet`을 이미 참으로 만들어 pending이 생기지 않는다 |
| V-2 | 저장소에 KST 날짜 유틸 없음(`Asia/Seoul` 사용처 1곳은 무관). `lib/api/judgment-base-date.ts` 신설 — +9h 고정(일광절약시간 없음) 후 UTC 자정. 경계 테스트 3건 |
| V-3 | `calculateHoldingPeriod(2018-07-06 → 2026-10-22)` = **8년 3개월**(anchor R-1r이 고정) |
| V-4 | 계산기(`transfer-tax.ts:216`)는 판정 결과를 필드 단위로만 읽는다 — `requirementReview`가 세액·결과 타입에 새지 않는다. 기준일은 `CheckExemptionOptions`로만 받아 계산기 경로는 불변 |
| V-5 | route anchor 3건(`R-5`·`LF-1`·civil-161)이 과거 기한을 단언 → `vi.useFakeTimers({ toFake: ["Date"] })`로 「오늘」을 기한 전으로 고정. 짝(R-5b: 기한 다음 날 → pending 없음) 추가 |
| V-6 | `meetsOneHouseResidenceRequirement`·`meetsOneHouseHoldingResidence`를 사유 leaf(`describe*`)에서 파생 — 호출처 무변경, 전체 테스트 통과로 동작 불변 확인 |
| V-7 | 「조건부」를 **긍정 단언**하는 테스트·E2E 0건. 부정 단언 1건(`one-house-unmet-exceptions.ui.test.tsx` UMUI-3)이 옛 제목이라 공허해질 참이어서 새 제목으로 갱신. 이력 목록·드로어·불러오기 모달은 같은 술어를 거쳐 자동으로 「과세」 |

### 9-2. 구현 중 추가로 발견·처리한 것

- **§155⑳ 불충족 덮어쓰기** — route가 코어 판정을 사후에 과세로 뒤집는다(`applyRentalHousingVerdict`). 요건 검토를 남기면 과세 배지 아래 「전 요건 충족」이 그려진다 ⇒ `appliedExceptions`와 함께 지운다. 뮤테이션 M8이 처음엔 **생존**해 R-19·R-19b를 추가했다.
- **근거 조문 카드** — 제보 사례에서 유일한 출처가 pending이었으므로 pending이 빠지면 카드도 사라진다. 요건 행마다 조문 링크가 있어 정보 손실은 없다.
- 기존 경고 2건(`transfer-tax-exemption.ts` 미사용 import `calculateHoldingPeriod`·`resolveExemptionHoldingStartDate`)은 변경 전부터 있던 것이라 건드리지 않았다.
- `resolveHighValuePriceCheck`(threshold.ts)를 새로 뒀지만 `checkExemptionCore`의 인라인 7곳은 그대로다(범위 밖) — 우선순위를 바꿀 때 함께 바꿀 것.

## 10. 완료 기준 (DoD)

- [x] 제보 입력 → 배지 「과세」, 이룰 수 없는 기한 안내 없음, 요건 검토 4행이 §4 순서로 표시
- [x] 1주택 단독 양도 → 요건 검토 카드(1세대1주택·보유·거주·고가) 표시
- [x] R-1~R-19 anchor 통과 + 뮤테이션 10종 KILL
- [x] 양도세 계산기 세액 변경 0 (전체 vitest 전건 통과)
- [x] `pending.ts` 415줄 착지, 모든 수정 파일 ≤ 800줄(최대 `transfer-tax-exemption-requirements.ts` 753)
- [x] `npx tsc --noEmit` 0건 · lint error 0건(변경 파일 신규 경고 0)
- [x] Playwright 브라우저 확인(제보 입력 재현 — 스크린샷 확인)
