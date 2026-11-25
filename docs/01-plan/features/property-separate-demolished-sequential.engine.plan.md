# 재산세 별도합산 — 철거 요건 «순차 노출»(답 의존 사슬) — 엔진·판정 측 계획

> 상태: **Plan v2 (2026-11-25) · 코드 변경 0(계획서만)** — 사용자 결정 2026-11-25 «순차 노출로 변경»(추천 «현행 유지» 기각 — sync-checker Low-2·Low-1 over-ask 해소) + **SQ-1~6 전부 추천안 채택(§0.0) — 미결 Q 0건. UI 문서와 이름·분할 정합 완료(§2.3 표).**
> base: `master` 2fbfa9032(#3654 — 비철거 허가·사용승인 칸 머지 직후) · 브랜치 `docs/property-demolished-sequential-plan` · 짝 문서: `property-separate-demolished-sequential.ui.plan.md`(UI 시니어 — 이 문서는 건드리지 않는다. **엔진 export 이름은 §2.3이 정본**).
> 선행: `property-separate-demolished-requirements.engine.plan.md`(PSA-E1~E4·U1~U2 · 이하 «선행 계획서») — 이 문서는 그 §5.4 «엔진이 읽는 칸만 요구»를 **날짜·종류 한정에서 «앞 답까지 반영»으로 확장**한다.
> **번호 규칙**: `SQ-n`(사용자 결정) · `SV-n`(미검증) · `SK-n`(케이스). 합칠 때 `PSA-SQ-n`·`PSA-SV-n`.
> **검증 표기**: 「확인」= 이 세션에서 파일·probe로 직접 읽음/실측 / 「오라클」= 제안 모델의 기대값(미구현) / 「확인 필요」= 읽지 못함. probe는 전부 스크래치패드(저장소 밖)에서 현행 master 코드를 import해 돌렸고 **코드 변경 0**이다.
> 약칭: 법 = 「지방세법」, 영 = 「지방세법 시행령」, 영 §103의2 = «철거ㆍ멸실된 건축물 또는 주택의 범위», 영 §101① 단서 = 본 경로 허가·사용승인 요건.

---

## 0. 한눈에

### 0.0 사용자 결정 2026-11-25 (이 문서는 이 표를 전제로 한다)

| Q | 결정 (**사용자 결정 2026-11-25 — 전부 추천안**) | UI 문서 대응 | 반영 |
|---|---|---|---|
| SQ-1 | (가) 사슬 걷기 | — | §2.2 |
| SQ-2 | (가) 빈집정비 자리 날짜 의존 — 일반 한시 기간 밖이면 종류 뒤 관문, 안이면 건축 외 «예» 뒤 단서 하위 | UQ-S4 | §2.1 |
| SQ-3 | (가) 재배치 — 토지 면적·공장 → 철거 토글 → 허가 또는 철거 사슬 → 확정 안내 → 용도지역·바닥면적(사슬 끝) | UQ-S2·S3 | §2.7 |
| SQ-4 | (가) 숨은 답 보존 + 다시 나타날 때 «이전에 고른 답» 표시 | UI §2.1-5 | §2.7 |
| SQ-5 | (가) 일반 기간·빈집 기간 병기 고지 | — | §2.5 |
| SQ-6 | (가) 직접 호출 접힘 사유 `input` → `period`/`not_yet` | — | §2.4 |
| — | 엄격 순차 노출(UQ-S1) · 결과 카드에 «묻지 않은 칸» 줄 추가 안 함(UQ-S5) · PR = PSA-S1 → S2 → SU → SX | UQ-S1·S5 | §3.2 · §6 |

전제:

- **앞 답이 결과를 확정하면 뒤 칸을 묻지 않는다.** 요구 칸 집합이 지금은 «날짜·종류»로만 정해지는데(`propertyDemolishedRequired` — 확인 `lib/tax-engine/property-separate-requirements.ts:94-105`), 이것을 **답 의존 사슬**로 바꾼다.
- 법문·연혁 경계·판정 결과·세액은 **바꾸지 않는다.** 바뀌는 것은 «어느 칸을 언제 묻는가»(⑤ 노출 · ⑧ 차단 · ⑫ 400 · ④ 운반)와 고지 문구 일부뿐이다(§3).
- 범위: ① 철거 경로 사슬(Low-2 두 가지: 종류 over-ask · 앞 답에 가려지는 칸) ② 비철거 허가 «아니오»·«모름» 시 용도지역·바닥면적 요구 해제(PSA-E3 Low-1).

### 0.1 결론 요약

| 항목 | 내용 |
|---|---|
| over-ask 실측 | 현행 요구 술어 대비 **판정 불변 상태에서 묻지 않아도 되는 칸**이 4갈래 있다(§1.2): ① 날짜만으로 접힘이 확정되는데 **종류**를 묻는다 ② 주택·한시 기간이 일반 기간을 넘는 철거인데 **빈집정비 «아니오»여도 허가·건축 외 용도**를 묻는다 ③ **허가 «아니오»·«모름»**인데 건축 외 용도·빈집정비·바닥면적을 묻는다 ④ **건축 외 용도 «아니오»·«모름»**인데 빈집정비·공용·유료를, **건축 외 용도 «예»·«모름»인 건축물**인데 바닥면적·용도지역을 묻는다. 비철거는 ⑤ **허가 «아니오»·«모름»**인데 용도지역·바닥면적을 묻는다. |
| 규모(균등 답 가정 · 사실 칸 4지 4^5 격자) | 2026.6.1. 과세기준일 주택: 사실 칸 평균 **4.15 → 2.49칸**(over-ask 216/243 조합), 건축물(일반 기간 안) **4.00 → 2.44칸**. 날짜 확정 구간(2026: 철거 ≤ 2023-05-31)은 종류 1칸 → **0칸**. §1.2 표. |
| 판정 불변·완화만 | 현행 판정과 새 사슬의 판정이 **202,752셀 전부 일치**(접힘/성립 · 접힘 사유 · 인정 면적), 새 사슬이 읽는 칸 ⊆ 현행이 묻는 칸이라 **강화(현행 통과 → 새 차단) 0건**(§3.1 — probe 실측). 지금 400이던 입력이 200이 되는 방향만 있다. |
| 설계 추천 | **엔진 판정 함수를 «사슬 걷기(chain walk)» 하나로 만든다** — 같은 한 번의 걷기가 (a) 판정 (b) 읽은 칸 순서 (c) 첫 미답 칸을 낸다. ⑤⑧④⑫가 읽는 칸·순서가 엔진 판정과 **구조적으로 같아진다**(별도 규칙 재정의 없음). 런타임 «두 번 돌려 측정»(양도세 선례)은 «다음에 무엇을 물을지» 순서가 없어 부적합하고, 명시 규칙 술어를 따로 두면 판정의 단락(short-circuit)과 이중 인코딩돼 드리프트한다(§2.2). |
| 핵심 비자명점 | **빈집정비 칸의 위치가 날짜에 따라 둘로 갈린다** — 철거일이 일반 한시 기간을 넘기면 그 답이 기간을 정하는 **관문**(종류 바로 뒤, 허가 앞), 일반 기간 안이면 2호 단서의 **하위 칸**(건축 외 용도 «예» 뒤). 한 자리에 고정하면 일반 기간 안 주택에서 빈집정비 over-ask 216/243이 그대로 남는다(§2.1·SQ-2). |
| 질문 순서는 판정을 안 바꾼다 | 접힘 조건(기간 ∧ 허가 ∧ 건축 외 용도)은 모두 «AND»라 어느 순서로 물어도 판정(접힘/성립·면적)은 같다. 순서가 바꾸는 것은 **표시되는 접힘 사유(첫 실패 사유)**와 **질문 수**뿐이다 → 엔진 판정 순서(기간 → 허가 → 건축 외 용도 → 면적, 선행 계획서 §5.3)를 그대로 질문 순서로 쓴다. |
| 영향 파일(예상) | 엔진 leaf `property-separate-requirements.ts`(391줄 → 약 480줄) · `separate-aggregate-land.ts`(비철거 접힘 위치) · Zod ⑩(비철거 분기) · 어댑터 `lib/calc/property-separate-requirements.ts` · ⑧ `shared.ts` · ④ `request-body.ts` · 결과 문구 `property-demolished-verdict-text.ts`. **새 입력 칸·새 와이어 키 0** → ⑫ 객체 선언·⑬·⑭ 변경 없음(§3.4). |
| PR | PSA-S1(철거 사슬 — 엔진 + ⑧④⑫ + 위젯 가시성·빈집정비 위치) → PSA-S2(비철거 허가 우선 + Step2 재배치) → PSA-SU(나머지 UI) → PSA-SX(E2E). §6. |

### 0.2 이 문서가 건드리지 않는 것

- 법령 본문·연혁 경계(2011.6.1. · 2016.6.1. · 2019.6.1. · 2024.6.1. · 2026.6.1.) · 접힘 사유 우선순위 · 면적 분할(Q-4) · 이관분 세액(E4) — 불변. **새 조문 인용 없음**(새 고지 문구는 기존 `PROPERTY_SEPARATE.DEMOLISHED_GRACE`를 인용 — `npm run verify:legal` 추가 등록 불요, 구현 PR이 확인).
- 직접 API의 «요구되지 않은 칸은 400이 아니라 무시»(선행 계획서 §5.5)는 그대로다 — 오히려 «요구되지 않은 칸»의 범위가 넓어진다.
- ⛔ **재제안 금지**: 과세기준일 단위 접기 · 자동 안분 fallback · «현행 유지»(이미 기각) · **공장용지 ON → 종류 «건축물» 자동 채움**(이미 결정 — 단위 anchor `__tests__/components/calc/property-separate-demolished-facts.anchor.test.tsx:133` «자동으로 건축물을 채우지 않는다»).

---

## 1. 현행 실측 (master 2fbfa9032)

### 1.1 요구 술어·판정 순서·호출 구조 (확인 — file:line)

| 구성 | 위치 | 현행 동작 |
|---|---|---|
| 요구 칸 집합 | `property-separate-requirements.ts:94-105` `propertyDemolishedRequired({taxBaseDate, removedOn, kind})` | `removedOn`·`kind` 유효 ∧ `removedOn ≤ s` ∧ **철거일이 «가장 긴 가능 기간»(`demolishedStatusPeriodMonths(s, kind==="house")`) 안**이면 `{permit, otherUse, vacantHouse, floorArea}`를 **시행본 문언 여부만으로** 한꺼번에 연다. **답은 보지 않는다.** |
| 2호 단서 하위 칸 | `:111-117` `propertyDemolishedPublicUseAsked(need, facts)` | 이미 답 의존: `otherUse` «예» ∧ `vacantHouse` «예» → 공용 사용, 그것이 «예» → 유료. 사슬의 선례다. |
| 첫 결함 | `:180-197` `propertyDemolishedFactIssue` | 철거일 → 종류 → 철거일 > 과세기준일 → 공장용지×주택 → 허가 → 건축 외 → 빈집정비 → 공용 → 유료 → 바닥면적 → 용도지역(요구된 칸 중 비어 있는 첫 칸). ⑧·⑫ 공유. |
| 판정 | `:310-391` `judgePropertyDemolishedLand` | `input` → `need` → **`vacantYes`를 기간 판정 앞에서 읽음(`:338`)** → 시행 전(`not_yet`) → 기간 → 허가 → 건축 외 용도(2호 단서) → 면적. `:334` 종류가 없으면 **날짜가 확정이어도** `input` 접힘. |
| 비철거 | `separate-aggregate-land.ts:223-239` `hasBuilding` → `:315-316` `calculateBaseArea`(용도지역 미등재면 **throw** — `:424-434`) → `:332-347` 허가 접힘 | 허가 접힘이 `calculateBaseArea` **뒤**라 용도지역·바닥면적이 항상 필요(주석 `:332-333` «접힘이 읽는 칸을 줄이지 않는다» — 선행 계획서 §8.1d (1)이 의도한 선택). |
| ⑫ | `lib/validators/property-input.ts:457-511` | 철거: `propertyDemolishedFactIssue` 1회 호출. 비철거: 용도지역 → 바닥면적 → 허가를 **인라인**으로 각각 요구(순서가 ⑧과 별도 코드로 복제). `zoningDistrict`·`buildingFloorArea`는 스키마상 optional(`:156-158`). |
| ⑧ | `components/calc/property/shared.ts:432-464` | 철거: `demolishedFactIssueOf`. 비철거: 용도지역 → 토지 면적 → 바닥면적 → 허가(`:453-462`). |
| ④ | `components/calc/property/request-body.ts:30-49` · 어댑터 `lib/calc/property-separate-requirements.ts:82-100` | 철거: `demolishedWireFields`가 `demolishedNeedOf`(요구 술어)가 연 칸만 싣는다. **종류는 고르기만 하면 항상**. 비철거: 용도지역·바닥면적은 **항상**, 허가는 요구될 때만. |
| ⑤ | `Step2SeparateAggregate.tsx:34-124` · `SeparateAggregateDemolishedFacts.tsx:120-224` | 용도지역·토지 면적·공장용지·바닥면적 → 허가(비철거) → **철거 토글** → 철거일 → [종류 라디오(항상) → 허가 → 건축 외 → 빈집정비 → 공용 → 유료]. 철거 토글이 바닥면적·용도지역 **아래**에 있다. |
| 합산 칸(Step 3) | `property-land-split-tax.ts:83-103` `propertyLandSplitRequiredFor` | `isSeparateAggregateLand`를 **그대로 돌려** 분류 면적으로 요구 칸을 정한다 — 엔진 판정이 바뀌면 자동 추종(판정 동치이면 불변). |

### 1.2 over-ask 실측 — 격자 probe (현행 요구 술어 vs 새 사슬 프로토타입)

방법: 과세기준일 9개(2015 · 2016 · 2018 · 2019 · 2023 · 2024 · 2025 · 2026 · 2027 각 6.1.) × 철거일 후보(과세기준일 당일 · 6/12/36개월 만료일과 앞뒤 하루 · 2010-01-01 — 계 99쌍) × 종류 2 × 사실 칸 `{"" · 예 · 아니오 · 모름}^5`(허가 · 건축 외 · 빈집정비 · 공용 · 유료 = 1,024) = **202,752셀**. 각 셀에서 (a) 현행 `judgePropertyDemolishedLand` 판정 (b) 현행이 묻는 칸(`propertyDemolishedRequired` + `propertyDemolishedPublicUseAsked`) (c) §2.1 사슬 프로토타입의 판정·읽은 칸을 비교했다.

**판정 일치 202,752 / 202,752 · 강화 0 · 새 읽기 ⊄ 현행 묻는 칸 0**(§3.1). 아래는 over-ask 셀 수(과세기준일 2026-06-01 · 사실 칸 `{예·아니오·모름}^5 = 243` 조합 기준 — 균등 답 가정이므로 «실제 사용자 분포»가 아니라 **분기별 구조 크기**다):

| 갈래 | 조건(2026.6.1.) | 현행이 더 묻는 칸 | 조합 수 | 평균 묻는 칸(현행 → 새) |
|---|---|---|---|---|
| ① 종류 over-ask | 철거 ≤ **2023-05-31**(36개월 밖 — 어떤 종류도 기간 밖) | 종류 | 243/243 | 1 → **0** |
| ② 빈집정비가 기간을 정하는 구간 | **주택** · 철거 2023-06-01~2025-05-31(일반 1년 밖 · 3년 안) · 빈집정비 «아니오»·«모름»(162조합) | 허가 · 건축 외 · 공용 · 유료 | 허가 162 · 건축 외 216 · 공용 18 · 유료 6 | 4.15 → **2.49** |
| ② 같은 구간 건축물 | 건축물 · 일반 기간 밖 | (없음 — 종류만 묻고 접힘) | 0/243 | 1 → 1 |
| ③④ 일반 기간 안 주택 | 주택 · 철거 2025-06-01~2026-06-01 | 빈집정비 **216**(허가 «예» ∧ 건축 외 «예»일 때만 필요) · 건축 외 162 · 공용 18 · 유료 6 | 216/243 | 4.15 → **2.49** |
| ③④ 일반 기간 안 건축물 | 건축물 · 철거 2025-06-01~2026-06-01 | **바닥면적·용도지역 216**(허가 «예» ∧ 건축 외 «아니오»일 때만 필요 = 27조합) · 건축 외 162 | 216/243 | 4.00 → **2.44** |
| ⑤ 비철거 | 허가 «아니오»·«모름» | 용도지역 · 바닥면적 | 허가 답 3지 중 2지 | — (§1.4) |

- 사용자 지시의 «162/243 패턴»(2026 주택 · 철거 2025-05-31 · 빈집정비 «아니오»면 허가·건축 외 답이 결과에 영향 없음)이 위 ② 행의 허가 162이다(확인).
- ① 날짜 확정 구간: 격자 56개 (과세기준일 × 철거일) 날짜 셀 중 **32개 셀**에서 종류가 불필요하다(과세기준일 2015.6.1. 전 «시행 전»(`not_yet`) 8 · 가장 긴 한시 기간 밖 24). 화면 경로(과세기준일 = 올해 6.1.)에서는 2026 기준 철거 ≤ 2023-05-31이 해당한다.
- 사용자 지시 예(2026.6.1. 과세기준일 · 철거 2023-05-31 · 2016-06-01 · 과세기준일 2015 직접 API)는 전부 ①이다 — probe 확인(아래 §4.1 SK-1·SK-23·SK-24).

### 1.3 질문 순서와 판정의 관계 (확인 — AND 구조)

접힘 조건은 **기간 · 허가 · 건축 외 용도**가 모두 통과해야 별도합산이 성립하는 AND이고, 건축 외 용도 «예»는 2호 단서(빈집정비 «예» ∧ 공용 «예» ∧ 유료 «예»)로만 구제된다(`:359-367`). 따라서 어느 칸을 먼저 물어도 **접힘/성립·면적은 같고**, 달라지는 것은 ① 접힘이 확정되는 시점(= 이후 칸을 묻지 않는 시점) ② 결과 카드에 보이는 **첫 실패 사유** ③ 질문 수다. 이 때문에 질문 순서는 «엔진 판정 순서 = 화면 순서»(CLAUDE.md UI 규칙) 한 가지로 충분하며, 예외는 §2.1의 **빈집정비 관문**(그 답이 «기간 판정 자체»를 정해 허가·건축 외 용도보다 앞서 알아야 함)뿐이다.

### 1.4 비철거 over-ask (PSA-E3 Low-1 — 확인)

현행: 허가 «아니오»·«모름»이면 엔진은 **전량 종합합산 접힘**인데 용도지역·바닥면적을 먼저 요구한다(`calculateBaseArea`가 접힘보다 앞 — `separate-aggregate-land.ts:315-316` ← `:334`). probe(현행 master):

| 입력(비철거 · 과세기준일 2026.6.1. · 토지 300㎡) | 현행 결과 |
|---|---|
| 허가 «아니오» · 용도지역·바닥면적 **없음** (Zod) | **400** — 용도지역·바닥면적 요구 |
| 허가 «아니오» · 용도지역 상업·바닥면적 100 (Zod) | 200 |
| 엔진: 허가 «아니오» · 용도지역·바닥면적 없음 | 접힘 — 별도합산 인정 0 · 종합합산 이관 300 · 고지 «건축물이 없는 토지는…» |
| 엔진: 허가 «아니오» · 용도지역·바닥면적 있음 | **같은 결과**(인정 0 · 이관 300) · 고지 «허가 등을 받아야 하는데…» · `multiplier` 3 · `buildingPermitFolded` true |
| 엔진: 허가 «아니오» · 용도지역 **미등재(`xxx`)** | **throw**(`별도합산 기준면적 산정: 용도지역…`) |

→ 허가 ≠ «예»에서 용도지역·바닥면적은 **판정에 영향이 없다**(면적 분할 결과 동일). 요구만 있다(확인).

**순차 노출과 만나면 생기는 함정(UI 문서 probe N3와 같은 결과 — 이 세션에서 재현 확인)**: 허가 «아니오» · 바닥면적만 있고 용도지역이 없는 입력(허가 앞세움 뒤 용도지역 칸이 숨겨져 안 보내지는 경우)은 엔진이 `calculateBaseArea`에서 **throw**하고, `propertyLandSplitRequiredFor`가 `catch`로 «요구 없음»(`otherSeparate:false · otherComprehensive:false`)을 내 **Step 3 합산 칸 요구가 침묵으로 사라진다**(같은 입력에 용도지역이 있으면 `otherComprehensive:true`, 둘 다 없으면 `true`). 그래서 비철거 접힘을 `calculateBaseArea` **앞**으로 옮기는 것(PSA-S2)은 선택이 아니라 순차 노출의 **선행 조건**이다(§2.6 · T9).

### 1.5 이 설계가 깨는 현행 전제 (구현 PR이 먼저 고칠 주석·문서 — «부재 서술도 전제다»)

- `separate-aggregate-land.ts:332-333` «용도지역·바닥면적은 위에서 이미 읽었다(요구 술어가 항상 요구하는 칸…)» · 선행 계획서 §8.1d (1) · `types/property.types.ts:218`·`:238`(「`propertyDemolishedRequired().floorArea`」·「요구 술어가 연 칸만」) · `SeparateAggregateDemolishedFacts.tsx:5-12`(칸 노출 술어 설명) · `property-demolished-verdict-text.ts:27-37`(`requiredText` «없음(한시 기간 밖이거나…)» 문구).
- 구현 전 grep 목록: `propertyDemolishedRequired`·`propertyDemolishedPublicUseAsked`·`demolishedNeedOf`(비테스트 사용처는 어댑터·leaf뿐 — 확인 `grep -rn`), `buildingPermitNeedOf`, 렌더 격자 2종·패리티 격자 3종(§3.3).

---

## 2. 설계

### 2.1 사슬 정의 — 걷기 규칙 (오라클)

입력: 과세기준일 `s` · 철거일 `r` · 종류 `kind` · 사실 칸 · (바닥면적·용도지역). `Wv` = `demolishedStatusPeriodMonths(s,true)`(가장 긴 기간 — 2024.6.1.~ 36, 그 전은 일반과 같음) · `Wg` = `demolishedStatusPeriodMonths(s,false)`(일반 6/12). «읽기(read)» = 그 칸을 요구하고 값을 본다. **비어 있는 칸을 읽으면 멈춘다**(첫 미답 칸 — 판정은 «yes 아님 = 접힘»으로 현행 E-9와 같음).

| # | 단계 | 읽는 조건 | 읽은 뒤 |
|---|---|---|---|
| 0 | 철거일·과세기준일 | `r` 유효 ∧ `s` 유효 ∧ `r ≤ s` | 아니면 `input`(날짜 결함 — ⑧이 «철거일» 문구) |
| 1 | **날짜 확정** | `Wv = 0`(s < 2016.6.1.) → `not_yet` 접힘 · `r`이 `Wv` **밖** → `period` 접힘 | **종류를 읽지 않는다**(§2.5) |
| 2 | **종류** | 1을 통과 | 비어 있으면 멈춤 |
| 3 | **빈집정비 — 관문** | 종류 «주택» ∧ `r`이 `Wg` 밖 ∧ `Wv` 안(= 2024.6.1.~ 시행본) | «예» → 계속(W=36) · «아니오»·«모름»·미답 → `period` 접힘(«모름»은 연장 미확인 고지) |
| 3′ | 종류 «건축물» ∧ `r`이 `Wg` 밖 | — | `period` 접힘(빈집정비 칸 없음) |
| 4 | **허가·사용승인** | s ≥ 2019.6.1. | «예»만 계속 · 그 밖(`no`·`unknown`·미답) → `permit` 접힘 |
| 5 | **건축 외 용도** | s ≥ 2024.6.1. | «아니오» → 계속 · «모름» → `other_use` 접힘 · «예» → 아래 5a |
| 5a | (건축 외 «예») 종류 «건축물» | — | `other_use` 접힘(빈집정비·공용·유료 안 물음) |
| 5b | (건축 외 «예» ∧ 주택) **빈집정비 — 하위 칸** | 3에서 아직 안 읽었을 때만(= `r`이 `Wg` 안) | «예»만 계속 · 그 밖 `other_use` 접힘 |
| 5c | 공용·공공용 사용 | 5b 통과 | «예»만 계속 · 그 밖 `other_use` 접힘 |
| 5d | 유료·재산세 부과 | 5c 통과 | «예» 계속 · «아니오» `public_use_unpaid` 접힘 · «모름»·미답 `other_use` 접힘 |
| 6 | **용도지역 → 바닥면적**(첫 결함 순서 — E-S6 통일) | 종류 «건축물» ∧ s ≥ 2024.6.1.(면적 문언 시행본) ∧ 1~5 모두 통과 | 비어 있으면 멈춤(엔진 직접 호출은 `area_input` 접힘) · 있으면 면적 분할 |
| — | 성립 | 1~6 통과 | 주택·문언 전 시행본: 부속토지 전체 + 범위 확인 필요 고지 |

- «접힘 확정»은 그 단계의 답으로 결과가 정해진 것이다 — **그 뒤 칸은 읽지 않으므로 요구되지 않는다**(⑤ 숨김 · ⑧ 미차단 · ⑫ 미요구 · ④ 미전송 · 엔진 미판독).
- 프로토타입(probe `probe-blank.ts` — 위 표를 그대로 코드화)과 현행 판정의 일치 202,752/202,752(§1.2)로 표의 동치성을 확인했다. 이 표가 구현의 오라클이다.
- **빈집정비의 두 자리**(3 vs 5b)는 같은 칸 `demolishedVacantHouse`·같은 라벨이다. 3에서 읽었으면 5b는 건너뛴다(이미 답을 안다). **`chain.vacantHousePosition`**으로 UI가 자리를 안다(§2.3).

### 2.2 방식 비교와 추천

| 안 | 내용 | 장점 | 단점·비용 |
|---|---|---|---|
| **(가) 사슬 걷기 — 추천** | 판정 함수를 «단계 표(§2.1)를 위에서 아래로 걷는» 하나로 재구성. 걷기 결과가 `{ 판정, 읽은 칸 순서(order), 첫 미답 칸(next) }`. 요구 술어·첫 결함·판정이 **한 번의 걷기에서 파생**(= 인코딩 1벌). | «별도 규칙 재정의 금지»가 구조적으로 충족(요구 칸 ≡ 엔진이 읽는 칸). 순서(= 화면 순서)가 걷기 순서. 빈집정비 두 자리도 자연스럽게 표현. 런타임 비용 무시(실측 judge 1회 ≈ 1.6µs). | `judgePropertyDemolishedLand` 본문을 다시 쓴다(약 80줄) → 회귀 위험 → **현행 판정 동결 복제본과 격자 동치 anchor**(§5)로 봉쇄. 새 프로토타입이 이미 202,752셀 동치. |
| (나) 명시 규칙 술어 + 판정이 소비 | `propertyDemolishedRequired(i, facts)`에 «앞 답이 접힘을 확정하면 뒤 칸 false» 규칙을 추가하고, 판정은 `need`를 읽어 분기(현행 구조 확장). | 현행 구조·export 이름과 가장 가깝다(diff 최소). | 술어의 prune 조건과 판정의 단락(return 순서)이 **두 벌** — 한쪽만 고치면 «요구 칸 ≠ 읽는 칸»(조용한 드리프트). 순서 개념(next)이 없어 `FactIssue`가 별도 순서 상수를 또 들고 있게 된다. 별도 규칙 재정의 금지 요건과 충돌. |
| (다) 런타임 두 번 돌려 측정(`otherLandReadsHouseholdHousePeriods` 선례 — `non-business-land/other-land-vacant-lot-read.ts`) | 칸 F마다 «F를 바꿔 엔진을 돌려 판정이 다르면 요구». | 판정 로직을 재구현하지 않는 장점. 비용도 무시(243조합 × 1.6µs ≈ 0.4ms — 실측). | «다음에 무엇을 먼저 물을지» **순서를 못 정한다**(F의 영향은 뒤 칸 답에 따라 달라져 «존재하는 보완 답이 있으면 요구»가 되면 허가를 건축 외 용도·빈집정비보다 먼저 묻게 되어 ② 갈래가 풀리지 않는다). 양도세 선례는 «이 행이 판정에 닿을 수 있는가»(단일 칸 존재 여부)라 이 문제와 다르다. |

**추천 (가)**, 단 **(다)를 런타임이 아니라 테스트 오라클로 쓴다**(§5의 최소성 anchor: 읽힌 칸마다 «바꾸면 판정 또는 다음 질문 집합이 달라진다», 읽히지 않은 칸은 «바꿔도 판정·읽은 칸이 같다»). 이렇게 하면 사슬(가)이 틀려도 독립 측정이 잡는다.

### 2.3 UI 시니어가 쓰는 export (정본 — 이름·모양)

`lib/tax-engine/property-separate-requirements.ts`(순수 — DB·`new Date(x)` 없음):

```ts
/** 사슬이 읽는 칸. «바닥면적 + 용도지역»은 한 쌍으로 `buildingFloorArea` 하나 */
export type PropertyDemolishedAskField =
  | "demolishedKind" | "demolishedVacantHouse" | "demolishedPermit" | "demolishedOtherUse"
  | "demolishedPublicUse" | "demolishedPublicUsePaid" | "buildingFloorArea";

export interface PropertyDemolishedChainInput {
  taxBaseDate: Date; removedOn: Date | undefined;
  kind: PropertyDemolishedKind | "" | undefined;
  isFactory?: boolean;                       // 공장용지 ∧ 종류 «주택» 모순을 사슬 안에서 다룬다(아래)
  facts: PropertyDemolishedFacts;            // ← 필수(생략하면 «전부 미답» 의미가 되므로 타입으로 막는다)
  buildingFloorArea?: number; zoningDistrict?: string;
}
export interface PropertyDemolishedChain {
  order: PropertyDemolishedAskField[];       // 엔진이 읽은 칸 — 읽는 순서 = 화면 순서. 첫 미답 칸에서 멈춘다(그 칸 포함)
  asked: Record<PropertyDemolishedAskField, boolean>;  // order에서 파생 — 위젯 노출 · ④ 전송 · ⑫ 요구가 읽는다
  next: PropertyDemolishedAskField | null;   // 첫 미답 칸(없으면 null)
  resolved: { kind: "holds" } | { kind: "fold"; foldReason: PropertyDemolishedFoldReason; at: PropertyDemolishedAskField | "date"; notice: string } | null; // 날짜 결함·모순이 아니고 next가 null이면 non-null. `at` = 결과를 확정한 답의 칸(날짜만으로 확정이면 "date")
  vacantHousePosition: "gate" | "proviso" | null;      // 빈집정비 칸 자리 — 관문(허가 앞) / 단서 하위(건축 외 «예» 뒤) / 안 읽음
}
export function propertyDemolishedChain(i: PropertyDemolishedChainInput): PropertyDemolishedChain;
```

- **모순 처리**: 철거일 > 과세기준일(날짜 결함)이면 `order = []` · `next = null` · `resolved = null`(⑧이 «철거일은 과세기준일 이전» 문구 — 고칠 칸은 철거일). **공장용지 ∧ 종류 «주택»**이면 `order = ["demolishedKind"]` · `next = "demolishedKind"`(⑧이 모순 문구 — **고칠 칸인 종류 라디오는 화면에 남아야 한다**. UI 문서 E-S1의 «모순은 사슬에 넣지 않고 `order=[]`»를 그대로 따르면 종류 라디오가 사라져 막다른 길이 되므로 이 점만 다르게 요청한다).
- **유지하는 export**(이름·시그니처 불변): `propertyDemolishedFactIssue`(⑧·⑫ — 내부가 `chain.next`의 문구를 낸다. 철거일 → 철거일 > 과세기준일 → 종류(읽혀야 할 때만) → 공장용지×주택(종류가 읽혔을 때만) → `chain.next` 문구) · `judgePropertyDemolishedLand`(입구 동일 · echo `required`는 **모양 유지** — 의미만 «사슬이 읽은 칸») · `resolvePropertyTaxBaseDate` · `PROPERTY_DEMOLISHED_ISSUE_MESSAGE`.
- **제거**: `propertyDemolishedRequired` · `propertyDemolishedPublicUseAsked` — 사슬이 대체(비테스트 사용처 = 어댑터 `demolishedNeedOf` 1곳과 leaf 내부뿐 — 확인). 구현 PR이 사용처 grep을 다시 돌려 확정(SV-1).
- **비철거**(같은 leaf):

```ts
export interface PropertyBuildingChain {
  permit: boolean;       // 허가·사용승인 칸을 묻는가(= 기존 propertyBuildingPermitRequired(s))
  areaInputs: boolean;   // 용도지역·바닥면적을 묻는가 — 허가 칸이 없는 시행본이거나 허가 «예»일 때만
  resolvedFold: boolean; // 허가 «아니오»·«모름» — 결과 확정(전량 종합합산)
}
export function propertyBuildingChain(i: { taxBaseDate: Date; permit: PropertyRequirementFact | undefined }): PropertyBuildingChain;
```
  `propertyBuildingPermitRequired` · `propertyBuildingPermitHolds` · `propertyBuildingPermitFactIssue` 유지. **비철거 첫 결함 순서**를 ⑧·⑫가 같은 leaf 함수 하나로 얻도록 `propertyBuildingFactIssue({taxBaseDate, permit, zoningDistrict, buildingFloorArea})`(허가 → 용도지역 → 바닥면적, 사슬 순서)를 추가한다(지금은 두 파일이 순서를 각자 인라인 — §1.1).
- 어댑터 `lib/calc/property-separate-requirements.ts`(UI는 이것만 부른다):
  - `demolishedChainOf(values, taxBaseDate?)` → `PropertyDemolishedChain`(구 `demolishedNeedOf` 대체 — 확정, 별칭 없음).
  - `demolishedWireFields`는 `chain.asked`만 싣는다(**종류도 읽힌 경우에만**).
  - `buildingChainOf(permit, taxBaseDate?)` → `PropertyBuildingChain` · `buildingPermitNeedOf` 유지 · `buildingAreaInputsNeedOf(permit, taxBaseDate?)` 추가(= `areaInputs`).
- **UI 문서(`…sequential.ui.plan.md` §3)와의 대응 — 2026-11-25 이름 정합 완료(UI 문서도 이 이름을 쓴다)**:

| UI 문서 요구 | 이 문서 | 비고 |
|---|---|---|
| E-S1 (구 임시명 `propertyDemolishedSequence` · `frontier` · `settled` · `vacantHouseDecisive`) | `propertyDemolishedChain` → `{order, asked, next, resolved, vacantHousePosition}` | UI 문서가 `next`·`resolved`·`vacantHousePosition === "gate"`로 고쳤다. 공장용지×주택 모순 시 `order=["demolishedKind"]`(고칠 칸 유지)도 UI 문서에 반영됨. `resolved.at`·`notice`는 UI가 확정 안내에 그대로 쓴다 |
| E-S1b `FactIssue`가 `next`에서 파생 | 동일 | 시그니처·문구 유지 |
| E-S2 비철거 허가 선행 판정 | §2.6 · PSA-S2 | 동일(+ N3 함정 근거 §1.4) |
| E-S3 (구 임시명 `propertyBuildingSequence` · `areaAsked`) | `propertyBuildingChain` → `{permit, areaInputs, resolvedFold}` | UI 문서가 고쳤다. 어댑터: `demolishedChainOf` · `buildingChainOf` · `buildingAreaInputsNeedOf` |
| E-S4 `verdict.required` = 사슬이 연 칸 · 모양 유지 | 동일 | `kind` 키 추가 안 함 |
| E-S5 ⑫ 비철거 `areaInputs`일 때만 | 동일(`propertyBuildingFactIssue`) | 접힘 확정 body(뒤 칸 생략)가 ⑫ 400이 되지 않음 — T5 |
| E-S6 철거 면적 결함 순서 용도지역 → 바닥면적 | **수용**(SV-8) | |
| E-S7 `building_permit`을 `PropertyDemolishedFoldReason`에 넣지 않음 | **동의** | 비철거 접힘은 `buildingPermitFolded` 별도 표현 유지 |

- UI 규칙: **UI는 날짜·시행본·답을 비교하지 않고** 위 값만 읽는다. 위젯은 `chain.order`의 칸 이름 → 위젯 매핑으로 그리면 순서가 엔진과 같다(빈집정비 자리 포함). `chain.next`가 있으면 그 칸이 «지금 답해야 할 칸»(= ⑧ 문구가 가리키는 칸 · 필드 점프 신설 없음), `chain.resolved`가 fold이면 «이미 결과가 정해져 더 묻지 않는다» 안내에 `notice`를 그대로 쓴다.

### 2.4 엔진 `judgePropertyDemolishedLand` 재구성 (읽기 규칙)

- **한 번의 걷기**(`walkDemolishedChain` — leaf 내부)가 `{order, blank, outcome}`을 내고 판정·`propertyDemolishedChain`·`FactIssue`가 모두 그것을 쓴다. 판정은 걷기 결과에 면적 계산(`round2`·`getZoneAreaMultiplier`)만 얹는다.
- **읽지 않은 칸은 판정을 못 바꾼다**: 현행 `:338`처럼 «빈집정비 «예»를 기간 판정 앞에서 무조건 읽는» 코드를 없앤다(읽기는 걷기 위치에서만). 그 결과 `periodMonths`·`vacantHouseExtensionUnconfirmed` echo가 읽히지 않은 stale 값에 흔들리지 않는다(§3.2).
- UI 문서 §1.5는 «철거 판정 leaf는 이미 순차 — 술어만 바꾸면 된다»고 보지만, 현행 leaf는 **종류 부재를 날짜보다 먼저 `input` 처리(`:334`)** 하고 **빈집정비를 기간 판정 앞에서 무조건 읽는다(`:338`)** — 둘 다 «읽지 않은 칸은 영향이 없다» 원칙에 어긋나므로 걷기 재구성에 포함한다(판정 결과는 동치 — §3.1).
- 직접 호출에서 비어 있는 칸(`""`·undefined)은 현행처럼 «yes 아님 = 접힘»(throw 없음 — 선행 계획서 E-9). 걷기는 비어 있는 칸에서 멈추므로 그 뒤 칸은 읽지 않는다.
- `isSeparateAggregateLand` 철거 분기·`property-tax-land-split.ts`의 이관 사유 매핑은 **판정 동치라 불변**(`input`·`not_yet`·`period` → 모두 `demolished_period` 이관 사유 — `property-tax-land-split.ts:47-58` 확인).

### 2.5 종류 칸 — 날짜만으로 확정되는 구간

- 철거일이 «가장 긴 가능 기간»(`Wv`)을 지났거나(s ≥ 2016.6.1.) 과세기준일이 시행 전(s < 2016.6.1.)이면 **종류를 요구하지 않는다**. 엔진은 종류 없이 `period`/`not_yet` 접힘(현행은 종류가 없으면 날짜가 확정이어도 `input` 접힘 — `:334`).
- **결과 카드·고지**: 접힘 문구는 종류에 의존하지 않아야 한다(걷기가 종류를 안 읽었으므로). 새 고지 `propertyDemolishedPeriodAllKindsNotice(general, vacant)` — s ≥ 2024.6.1.이면 «철거ㆍ멸실일부터 일반 한시 기간(N)과 빈집정비사업 철거 빈집 한시 기간(3년)이 모두 지나 건축물이 없는 토지로 보아 종합합산으로 처리합니다», 그 전 시행본이면 기존 `propertyDemolishedPeriodNotice(6)`과 같은 문장(SQ-5). `not_yet` 문구는 불변. `periodMonths` echo = `Wv`.
- 종류가 이미 폼에 있어도(`demolishedKind` 값 있음) 날짜가 확정이면 **무시**한다(요구되지 않은 칸 — stale 무해 원칙). 공장용지×주택 모순 차단도 종류가 읽힌 경우에만 건다.

### 2.6 비철거 사슬 — 허가 우선 (PSA-E3 Low-1)

- 순서: **허가(s ≥ 2011.6.1.) → «예» 또는 허가 칸 없는 시행본이면 용도지역 → 바닥면적**. 허가 «아니오»·«모름»은 결과(전량 종합합산 이관)를 확정하므로 용도지역·바닥면적은 묻지 않는다.
- `isSeparateAggregateLand` 비철거 분기: **허가 접힘을 `hasBuilding`·`calculateBaseArea` 앞으로** 옮긴다(`propertyBuildingPermitHolds` 실패 → 인정 0 · 이관 = 토지 전체 · `buildingPermitFolded: true`). 허가 «예»(또는 시행 전)일 때만 `hasBuilding` → `calculateBaseArea` → 면적 분할(현행 그대로).
- 판정 동치: §1.4 probe에서 허가 «아니오»일 때 용도지역·바닥면적 유무와 무관하게 (인정 0 · 이관 300)이었다. 바뀌는 echo: 접힘 시 `multiplier`·`baseArea`(현행은 용도지역이 있으면 배율·0 — 새는 0·0), 고지(바닥면적이 없던 경우 «건축물이 없는 토지…» → «허가 등을 받아야 하는데…»). 용도지역 미등재(throw)가 허가 ≠ «예»에서 사라진다(완화).
- 선행 계획서 §8.1d (1)의 «읽는 칸 = 요구 칸 일치» 의도는 **요구 술어를 사슬로 바꾸어 보존**한다(접힘을 앞당기고 요구를 같이 줄임).
- 공장용지(`isFactory`)도 같다(단서가 §101① 본문이라 공장용·영업용 공통 — 선행 계획서 §8.1d).

### 2.7 입구 규칙 — ⑧ · ⑫ · ④ · ⑤

| 지점 | 규칙 |
|---|---|
| ⑧ 순서 | 철거: 토지 면적 → `propertyDemolishedFactIssue`(= 철거일 → [종류] → … → `chain.next`). 비철거: 토지 면적 → `propertyBuildingFactIssue`(허가 → [용도지역 → 바닥면적]). **철거 토글은 용도지역·바닥면적보다 위**여야 한다(두 분기가 다른 칸 순서를 가지므로 — SQ-3) — Step2 재배치는 UI 문서. |
| ⑧ 점프 | **필드 점프는 신설하지 않는다**(선행 결정 — `PropertyTaxForm`은 `setStep`만). 엄격 순차라 ⑧이 가리키는 칸 = `chain.next` = 화면의 마지막 질문이다. `data-field` 앵커 id는 현행 유지(빈집정비 두 자리도 같은 `demolishedVacantHouse`). |
| ⑫ | 철거: `propertyDemolishedFactIssue` 1회(호출은 불변 — 내부만 사슬). 비철거: 인라인 3개를 `propertyBuildingFactIssue`로 교체. **요구되지 않은 칸이 와도 400이 아니라 무시**(현행 방침 확장). 새 스키마 키 없음. |
| ④ | `chain.asked`에 있는 칸만 싣는다 — **종류**(읽힌 경우만) · 사실 칸 · 바닥면적·용도지역(`asked.buildingFloorArea` — 비철거는 `areaInputs`). 앞 답이 접힘을 확정해 뒤 칸이 사라지면 **폼 값은 남고(숨은 값 보존) 본문에서만 빠진다**(현행 패턴 — `e2e …:168` 선례). |
| ⑤ | 위젯 노출 = `chain.asked` · 순서 = `chain.order` · 결과 확정 안내 = `chain.resolved.notice`. 날짜가 확정이라 종류를 안 묻는 경우의 안내도 같은 `notice`(현행 `noFactsNotice`의 날짜·시행본 재계산을 대체 — UI가 날짜를 비교하지 않는다). |
| 숨은 값 재노출 | **결정(SQ-4)**: 앞 답을 되돌려 칸이 다시 열리면 폼에 남은 이전 답이 선택된 채 보이고(자동 채움 아님) UI가 «이전에 고른 답» 표시를 붙인다(UI 문서 §2.1-5 — onChange 핸들러만, `useEffect → store` 없음). 엔진 몫은 없다(`chain`은 값을 지우지 않는다). |

### 2.8 «모름» 취급

- 사실 칸 «모름»은 **혜택 불성립 = 접힘 확정**이다(현행 규칙 `:353-366` 그대로) → 그 뒤 칸은 요구되지 않는다. 예외 없음:
  - 허가 «모름» → `permit` 접힘 · 건축 외 용도 «모름» → `other_use` 접힘 · 빈집정비 «모름»(관문) → `period` 접힘 + **연장 미확인 고지**(`vacantHouseExtensionUnconfirmed`) · 단서 칸 «모름» → `other_use` 접힘.
- 빈집정비 «아니오»·«모름»이 관문이 아닌 자리(5b)에서는 접힘 사유가 `other_use`이고 연장 미확인 고지는 없다(일반 기간 안이라 3년 연장이 판정에 닿지 않음) — 현행과 같다(`:347-348`의 조건식을 그대로 둔다).
- 미선택 `""`은 «모름»이 아니라 **미답**이다 — 걷기는 거기서 멈추고 ⑧·⑫가 막는다(선행 계획서 Q-1 불변).

---

## 3. 영향

### 3.1 직접 API 하위호환 — 완화만, 강화 없음 (확인 — probe 실측)

- **집합 포함**: 모든 입력에서 새 사슬이 읽는 칸 ⊆ 현행이 요구하는 칸. 각 단계의 읽기 조건이 현행 `need`의 조건에 단락만 **더한** 것이고(§2.1), 신규 요구가 없다. 격자 **202,752셀**에서 «새 사슬에는 비어 있는 읽힌 칸이 있는데 현행에는 비어 있는 요구 칸이 없는» 셀(= 현행 통과 → 새 차단) = **0**, «새가 읽는데 현행은 안 묻는» 칸 = **0**(probe `probe-blank.ts`).
- **판정 동치**: 같은 격자에서 (접힘/성립 · 접힘 사유 · 인정 면적) 일치 **202,752/202,752**(빈 칸 포함).
- **예외 — 사유 라벨만 바뀌는 입력**: 직접 엔진 호출에서 `demolishedKind`가 **없고** 날짜로 확정인 입력(현행 `input` 접힘 → 새 `period`/`not_yet` 접힘). 둘 다 전량 종합합산 이관이고 이관 사유가 같아(`demolished_period`) **세액 불변**(SQ-6).
- 현행 Zod가 400을 내는 예(probe 실측) → 새 사슬에서는 요구되지 않는다(오라클): 철거 2023-05-31 + 종류 없음(과세기준일 2026-06-01) · 주택 2025-05-31 + 빈집정비 «아니오»만(허가·건축 외 없음) · 건축물 허가 «아니오»만(건축 외 용도 없음) · 비철거 허가 «아니오»만(용도지역·바닥면적 없음). 반대 방향(현행 200 → 새 400)은 격자에서 0건.
- 새 사슬이 첫 결함을 **다른 칸으로 가리킬 수 있다**(다중 미답일 때 — 예: 빈집정비 관문이 허가보다 먼저). 400 → 400이라 하위호환 문제는 아니나 **문구·`path` 단언은 갱신**이 필요하다(§3.3).

### 3.2 echo·문구 변경 (판정·세액 불변)

| 항목 | 변화 |
|---|---|
| `demolishedVerdict.required` | **모양 유지**(`kind` 키를 추가하지 않는다 — 종류는 `requiredText`가 원래 나열하지 않는 칸) · 각 칸의 의미가 «현행 술어가 연 칸» → «사슬이 읽은 칸»으로 좁아진다. 결과 카드·PDF `requiredText`(`property-demolished-verdict-text.ts:27-37`)의 «입력이 필요했던 칸» 행이 사슬 기준이 되고, 읽은 칸이 없을 때 문구를 «앞의 답(또는 철거일)으로 결과가 정해져 더 묻지 않음»으로 바꾼다. |
| `periodMonths` | 읽히지 않은 빈집정비 stale «예»가 더 이상 36을 만들지 않는다(예: 주택 · 일반 기간 안 · 허가 «아니오» + stale 빈집정비 «예» → 현행 36 → 새 12). 읽힌 경우(관문 «예» · 5b «예»)는 36 그대로. |
| 날짜 확정 접힘 고지 | §2.5 — 종류와 무관한 문구. 종류가 입력돼 있던 기간 밖 케이스(2026 · 철거 ≤ 2023-05-31)는 «1년(일반)이 지나» → 일반·빈집정비 기간 병기로 바뀐다(SQ-5). |
| 비철거 접힘 echo | `multiplier`·`baseArea` 0(§2.6) — 재산세 결과 카드·PDF·`lib/calc`에서 이 echo를 읽는 곳은 grep 0건(확인), API 응답 외부 소비는 SV-2. |

### 3.3 기존 테스트·E2E 영향 (grep 일치 — **실행 결과 아님**, SV-1)

| 파일(`__tests__`) | 영향 |
|---|---|
| `tax-engine/property-separate-requirements.anchor.test.ts` · `tax-engine/property/separate-demolished-requirements-wire.anchor.test.ts` | 날짜·종류 한정 요구 집합 단언 → 사슬 오라클(§4)로 교체. **단언을 약화하지 말고** 같은 셀을 사슬 값으로 다시 쓴다(「공유 단언 반전=형제 안전망 소실」) |
| `tax-engine/property/building-permit-101.anchor.test.ts` · `tax-engine/separate-aggregate-land.test.ts` · `tax-engine/separate-aggregate-demolished-era.anchor.test.ts` | 비철거 접힘의 echo·고지(바닥면적 유무별) · 종류 없는 날짜 확정 입력의 사유 |
| `api/property.route.demolished-requirements.anchor.test.ts` · `api/property.route.building-permit.anchor.test.ts` · `api/property.route.separate-aggregate-required.anchor.test.ts` · `api/property.route.separate-aggregate-demolished-era.anchor.test.ts` · `api/property.route.land-split-inputs.anchor.test.ts` | 400 → 200 케이스 추가 · 다중 미답일 때 첫 결함 칸·문구 |
| `calc/property-demolished-parity-grid` · `calc/property-building-permit-parity-grid` · `calc/property-precalc-parity-grid` | ⑧↔⑫A↔⑫B 첫 문구 대조 — 사슬 순서로 같은 격자가 같은 결론이어야 한다(셀 수는 줄지 않는다). 비철거 격자에 «허가 ≠ 예 ∧ 용도지역·바닥면적 없음 → 둘 다 통과» 셀 추가 |
| `components/calc/property-separate-demolished-render-grid.anchor.test.tsx` · `property-building-permit-render-grid.anchor.test.tsx` · `property-separate-demolished-facts.anchor.test.tsx` | «DOM 순서 = ⑧이 물은 순서» 단언이 **빈집정비 자리**를 반영해 갱신. 종류 라디오는 «철거일 + 종류 요구일 때만» 그려진다(현행 «항상»). `base()` 픽스처의 `saZoningDistrict: "commercial"` 고정이 비철거 격자에서 조건부 요구를 가리지 않도록 **용도지역·바닥면적 «있음/없음» 축을 비철거 격자에 추가**(「픽스처 기본값이 게이트 결함을 가린다」) |
| `components/calc/property-demolished-body` · `property-building-permit-body` · `land-split-card` · `land-split-inputs` | ④ 전송 키(종류 조건부 · 비철거 용도지역·바닥면적 조건부) · 결과 문구 |
| `e2e/property-separate-demolished-requirements.spec.ts` · `e2e/property-separate-building-permit.spec.ts` | 종류 칸 노출 시점(날짜 후 · 요구일 때) · 빈집정비 칸 자리 · 허가 «아니오»에서 용도지역·바닥면적 숨김 · 금액 불변(기존 K-1 516,000 · K-2 960,000 · K-15 768,000 · K-17 1,380,000 그대로 — `…spec.ts:40·53·82·106`) |

세액이 같다는 근거: 판정 동치이므로 기존 E2E·anchor의 **금액 단언은 하나도 바뀌지 않아야 한다** — 바뀌면 사슬 결함이다(조기 신호).

### 3.4 14지점 (엔진 측)

| # | 지점 | 변경 |
|---|---|---|
| ①②③ 폼·initial·normalize | `FormState` 키 불변(`saDemolishedKind` 등 그대로). **«숨은 값 보존»이라 초기화 코드 없음** | 없음 |
| ④ API 변환 | `request-body.ts:30-49` · 어댑터 `demolishedWireFields`: **종류·비철거 용도지역·바닥면적을 요구된 경우에만** 싣는다 | **있음** |
| ⑤ 위젯 | `Step2SeparateAggregate.tsx` 재배치(철거 토글 상향 · 용도지역·바닥면적 조건부) · `SeparateAggregateDemolishedFacts.tsx` 종류 조건부·빈집정비 자리·`resolved` 안내 · `SeparateAggregateBuildingPermit.tsx` 위치 | **있음(UI 문서)** |
| ⑥ 사이드바 | 재산세 위저드는 사이드바 없음(선행 계획서 V-8) | 없음 |
| ⑦ 결과 카드 | `PropertyLandSplitCard`·PDF의 `propertyDemolishedVerdictLines` 문구 | **있음** |
| ⑧ validate | `shared.ts:432-464` — 비철거 순서·조건부(허가 → 용도지역 → 바닥면적) · 철거는 호출 불변 | **있음** |
| ⑨⑩ Zod enum·정제 | 철거 분기 호출 불변 · **비철거 인라인 3개를 `propertyBuildingFactIssue`로 교체**(`property-input.ts:483-510`) | **있음** |
| ⑪ 자산-수준 fallback | — | 없음 |
| ⑫ Zod 입력 객체 | **새 키 없음**(`demolishedKind` 등 모두 이미 선언·optional — `property-input.ts:156-182`) | 없음 |
| ⑬ body spread | 없음(④ = ⑬) | 없음 |
| ⑭ route → 엔진 | `parsed.data` 그대로 — 필드 매핑·Date 변환 없음 | 없음 |
| 엔진 타입 | `LandDemolishedVerdictEcho` 모양 불변(`separate-aggregate-land.ts:144-148`) · `property.types.ts` 주석 정정 | 주석만 |

⑫⑬⑭가 «TypeScript 미감지» 위험 지점인데 이번 변경은 **새 와이어 키가 없어** 침묵 stripping 위험이 없다. 대신 위험은 **④가 «읽힌 칸만 싣는다»를 어기면(요구된 칸을 빠뜨려) ⑫가 400**이 되는 방향 — 패리티 격자(§5 T5)가 막는다.

---

## 4. 케이스 표 (오라클 — 구현 PR의 anchor 입력)

공통: 철거 토지 400㎡ · 철거 전 바닥면적 100㎡ · 용도지역 상업(배율 3 → 기준면적 300㎡) · 용도지역·바닥면적은 «읽힐 때만» 요구. `현행`은 probe로 실측한 현행 요구 칸(종류 포함). **이 표의 «새 읽은 칸»·«판정»은 프로토타입 실측(판정은 현행 judge와 일치 확인)이다.**

### 4.1 철거 경로 (`s`는 과세기준일)

| SK | s · 철거일 · 종류 | 답 | 새 읽은 칸(order) | 판정(현행 judge와 동일) | 현행이 묻는 칸 |
|---|---|---|---|---|---|
| 1 | 2026.6.1. · 2023-05-31 · (없음) | — | **없음** | 접힘 `period`(종류 없이) | 종류 |
| 2 | 2026.6.1. · 2023-06-01(36개월 당일) · (없음) | — | 종류 | 미답 | 종류 |
| 3 | 〃 · **주택** | — | 종류 → **빈집정비(관문)** | 미답 | 종류 · 허가 · 건축 외 · 빈집정비 |
| 4 | 〃 · 주택 | 빈집정비 «아니오» | 종류 → 빈집정비 | 접힘 `period` | 〃(4칸) |
| 5 | 〃 · 주택 | 빈집정비 «모름» | 종류 → 빈집정비 | 접힘 `period` + **연장 미확인 고지** | 〃 |
| 6 | 〃 · 주택 | 빈집정비 «예» | … → **허가** | 미답 | 〃 |
| 7 | 〃 · 주택 | 빈집 «예» · 허가 «아니오» | 종류 → 빈집 → 허가 | 접힘 `permit` · `periodMonths` 36 | 〃 |
| 8 | 〃 · 주택 | 빈집 «예» · 허가 «예» | … → **건축 외 용도** | 미답 | 〃 |
| 9 | 〃 · 주택 | 빈집 «예» · 허가 «예» · 건축 외 «아니오» | 종류 → 빈집 → 허가 → 건축 외 | **성립**(주택 — 부속토지 전체 400 · 바닥면적 안 물음) | 〃 |
| 10 | 〃 · 주택 | … · 건축 외 «예» | … → 건축 외 → **공용 사용**(빈집정비는 이미 읽음) | 미답 | 〃 + 공용 |
| 11a | 〃 · 주택 | … · 건축 외 «예» · 공용 «예» | … → **유료** | 미답 | 〃 + 공용·유료 |
| 11b | 〃 | … · 유료 «예» | 같음 | 성립(단서 포함) | 〃 |
| 11c | 〃 | … · 유료 «아니오» | 같음 | 접힘 `public_use_unpaid` | 〃 |
| 11d | 〃 | … · 유료 «모름» | 같음 | 접힘 `other_use` | 〃 |
| 11e | 〃 | … · 공용 «아니오» | … → 공용 | 접힘 `other_use`(유료 안 물음) | 〃 + 공용 |
| 12 | 2026.6.1. · 2025-06-01(1년 당일) · 주택 | — | 종류 → **허가**(빈집정비 **안 물음**) | 미답 | 종류 · 허가 · 건축 외 · 빈집정비 |
| 12b | 〃 | 허가 «예» · 건축 외 «아니오» | 종류 → 허가 → 건축 외 | 성립(전체 400) | 〃 4칸 |
| 13 | 〃 | 허가 «예» · 건축 외 «예» | … → 건축 외 → **빈집정비(단서 하위)** | 미답 | 〃 |
| 14 | 〃 | … · 빈집정비 «아니오» | 종류 → 허가 → 건축 외 → 빈집정비 | 접힘 `other_use` | 〃 |
| 14b | 〃 | … · 빈집 «예» · 공용 «예» · 유료 «예» | … → 공용 → 유료 | 성립 · `periodMonths` 36 | 〃 + 공용·유료 |
| 15 | 〃 · **건축물** | 허가 «아니오» | 종류 → 허가 | 접힘 `permit` | 종류 · 허가 · 건축 외 · **용도지역·바닥면적** |
| 16 | 〃 · 건축물 | 허가 «예» · 건축 외 «예» | 종류 → 허가 → 건축 외 | 접힘 `other_use`(빈집정비·공용·유료·바닥면적 안 물음) | 〃 |
| 17 | 〃 · 건축물 | 허가 «예» · 건축 외 «모름» | 종류 → 허가 → 건축 외 | 접힘 `other_use` | 〃 |
| 18 | 〃 · 건축물 | 허가 «예» · 건축 외 «아니오» | … → 건축 외 → **용도지역·바닥면적** | 성립 · 별도합산 300 + 이관 100 | 〃 |
| 19b | 2026.6.1. · 2025-05-31(1년 밖) · 건축물 | — | 종류 | 접힘 `period` | 종류 |
| 19h | 〃 · 주택 | — | 종류 → **빈집정비(관문)** | 미답(빈집정비 답에서 SK-4~6으로 이어짐) | 종류 · 허가 · 건축 외 · 빈집정비 |
| 20 | 2024.6.1. · 2023-12-01 · 건축물 | 허가 «예» · 건축 외 «아니오» | 종류 → 허가 → 건축 외 → 바닥면적 | 성립(300+100) | 같음 |
| 21 | 2019.6.1. · 2018-12-01 · 건축물 | 허가 «예» | 종류 → 허가 | 성립(전체 400 · 건축 외 문언 없음 고지) | 같음 |
| 21b | 〃 | 허가 «아니오» | 종류 → 허가 | 접힘 `permit` | 같음 |
| 22 | 2016.6.1. · 2015-12-01 · 건축물/주택 | — | 종류 | 성립(전체 400 — 허가·건축 외 문언 없음) | 종류 |
| 23 | **2015.6.1.** · 2015-01-01 · (없음) — 직접 API | — | **없음** | 접힘 `not_yet` | 종류 |
| 24 | 2016.6.1. · 2015-11-30(6개월 밖) · (없음) | — | **없음** | 접힘 `period` | 종류 |
| 25 | 철거일 > 과세기준일 · 종류 무관 | — | 없음(날짜 결함 — 오라클, 미실측) | `input` — ⑧ «철거일은 과세기준일 이전» | 종류 |

- SK-1·23·24는 선행 prompt 예(2023-05-31 · 2016-06-01 · 과세기준일 2015)와 일치하는 **종류 불요** 구간이다. SK-12 (일반 기간 안 주택 — 허가 먼저·빈집정비는 건축 외 «예» 뒤)가 §2.1의 «빈집정비 두 자리» 오라클이다.
- 금액: 같은 필지에서 접힘 사유(기간·허가·건축 외·무상 공용)가 달라도 **종합합산 이관액은 같다**(기존 E2E 3건이 모두 960,000 — `…spec.ts:53·64·73`). 성립·분할 금액(516,000 · 768,000)도 불변. 구현 anchor는 `calculatePropertyTax` 직접 호출로 위 판정에 맞는 금액을 새로 실측해 고정한다(이 계획서에서 신규 수치 단정 안 함).

### 4.2 비철거 (`s ≥ 2011.6.1.` · 토지 300㎡ · 공장용지 여부 무관)

| SN | 허가 | 용도지역·바닥면적 | 새 읽은 칸 | 판정 | 현행 |
|---|---|---|---|---|---|
| 1 | 미답 | — | 허가(멈춤) | 미답 | 허가 · 용도지역 · 바닥면적 |
| 2 | «아니오» | 없음 | 허가 | **전량 종합합산 이관**(인정 0 · 이관 300 · `buildingPermitFolded`) | 400(용도지역·바닥면적) |
| 3 | «모름» | 없음 | 허가 | 〃 + «확인되지 않아» 고지 | 400 |
| 4 | «예» | 없음 | 허가 → 용도지역 → 바닥면적(미답에서 멈춤) | 미답 | 400 |
| 5 | «예» | 상업 · 100 | 허가 → 용도지역 → 바닥면적 | 성립 · 별도합산 300 + 이관 0(상업 3배 → 기준 300 ≥ 토지 300 이내) | 200 |
| 6 | «아니오» | **미등재 용도지역**(엔진 직접 호출) | 허가 | 접힘(throw 없음) | throw |
| 7 | s < 2011.6.1.(직접 API) | 없음 | 용도지역 → 바닥면적 | 미답 | 용도지역 · 바닥면적 |
| 8 | 철거 ON(사슬 §4.1) | — | 비철거 칸 읽지 않음 | — | — |

---

## 5. 테스트·mutation 계획

### 5.1 anchor (구현 PR이 먼저 쓴다 — Pre-Do: 현행과 **달라야 하는** 셀 SK-1·SK-3·SK-12·SK-15·SN-2부터)

| T | 내용 | 보증 |
|---|---|---|
| T1 판정 동치 | **현행 judge·술어를 동결 복제**한 테스트 전용 fixture(master 2fbfa9032)와 새 judge를 격자(과세기준일 9 × 철거일 경계 × 종류 2 × 사실 칸 4^5 + 종류 «없음»)에서 대조: (접힘/성립 · 접힘 사유 · 인정 면적) 전수 일치. 종류 «없음»은 «날짜 확정 셀만 일치, 그 밖은 `input`» | 판정 회귀 0(probe가 202,752/202,752 선행 확인) |
| T2 완화만 | 새 읽은 칸 ⊆ 현행 요구 칸 · 현행 통과 → 새 차단 0 | 하위호환(§3.1) |
| T3 최소성(독립 오라클 = §2.2 (다)) | 읽힌 칸마다 «다른 값으로 바꾸면 판정 또는 다음에 읽는 칸 집합이 달라진다» · 읽히지 않은 칸마다 «어떤 값으로 바꿔도 판정·`order`가 같다» | 과요구·과소요구 둘 다 차단 |
| T4 stale 무해 | 읽히지 않은 칸의 값을 모든 값으로 흔들어도 `judge` 전체(`required`·`periodMonths`·notices 포함)가 같다 | 숨은 stale 값이 결과를 못 바꿈 |
| T5 ⑧↔⑫A↔⑫B 패리티 | 기존 3개 격자를 사슬 순서로 갱신 — 첫 문구·필드 일치 · «⑧ 통과 ∧ ⑫ 400»·«⑧ 차단 ∧ ⑫ 200» 0 | 입구 정합 |
| T6 ④ 전송 | `demolishedWireFields`·`buildingPermitWireFields`·비철거 용도지역·바닥면적이 `chain.asked`와 같은 키 집합 | stale 미전송 |
| T7 렌더 격자 | DOM 라디오 순서 = `chain.order`(빈집정비 자리 포함) · `chain.asked` 밖 위젯 0 · 종류 라디오는 `asked.demolishedKind`일 때만 | ⑤ ≡ 엔진 |
| T8 E2E | 종류 불요 날짜 · 빈집정비 관문 · 빈집정비 단서 자리 · 허가 «아니오» 비철거에서 용도지역·바닥면적 숨김 + 금액 불변 + 375px | 브라우저 확인 |
| T9 단계 연결 | `propertyLandSplitRequiredFor`(Step 3)가 같은 분류 면적을 내는지 — 합산 칸 anchor 재실행 + **N3 재현**(비철거 허가 «아니오» · 바닥면적만 있고 용도지역 없음 → throw 없이 합산 칸 `otherComprehensive:true`) | 후단 불변 · 침묵 소실 방지 |

### 5.2 mutation 후보 (각각 어느 anchor가 죽어야 하는지)

| M | 변이 | 죽는 anchor |
|---|---|---|
| M-S1 | 날짜 확정 단락 제거(종류를 항상 읽음) | T3·T7·SK-1 |
| M-S2 | 빈집정비 관문 생략(허가 뒤에서 읽음) | T3(허가가 불필요하게 읽힘)·SK-3/4 |
| M-S3 | 빈집정비를 항상 종류 바로 뒤에 고정(SQ-2 (나)) | T3·SK-12(일반 기간 안 주택에서 과요구) |
| M-S4 | 허가 «아니오»·«모름»에서 건축 외 용도를 계속 읽음 | T3·T4·SK-7/15 |
| M-S5 | 건축 외 «예» ∧ 건축물에서 빈집정비를 읽음 | T3·SK-16 |
| M-S6 | 건축 외 용도 «모름»을 «아니오»처럼 계속 진행 | T1·SK-17 |
| M-S7 | 비어 있는 칸에서 멈추지 않고 다음 칸을 읽음 | T3·T5 |
| M-S8 | 바닥면적을 접힘 뒤에도 요구(SK-16 · SK-15) | T3·T6 |
| M-S9 | 비철거 허가 접힘을 `calculateBaseArea` 뒤로 되돌림 | SN-2/3/6·T5 |
| M-S10 | ⑫가 사슬 대신 구 술어(날짜·종류만)를 씀 | T5(⑧↔⑫) |
| M-S11 | ④가 읽히지 않은 칸을 싣거나 읽힌 칸을 뺌 | T6·T5(⑫A) |
| M-S12 | 읽히지 않은 빈집정비 stale «예»를 기간 판정에서 읽음(현행 `:338` 복원) | T4(`periodMonths`) |
| M-S13 | 공장용지×주택 차단을 종류가 안 읽힐 때도 건다 / 반대로 읽힐 때도 건너뜀 | SK 공장용지 셀·기존 모순 anchor |

---

## 6. PR 분할 (엔진 선행 → UI 시퀀셜 — CLAUDE.md 워크플로)

| PR | 내용 | 비고 |
|---|---|---|
| **PSA-S1** | leaf 사슬 걷기 · `propertyDemolishedChain` · judge 재구성 · `FactIssue` 재배선 · 구 술어 2개 제거 · 새 고지 · 어댑터 `demolishedChainOf`·`demolishedWireFields` · ⑧ 철거 분기(호출 불변) · ⑫ 철거 분기(호출 불변) · **위젯 가시성·빈집정비 자리·종류 조건부 노출 최소 배선** · T1~T7 · 기존 anchor 갱신(§3.3) | 렌더 격자가 DOM 순서를 단언하므로(`property-separate-demolished-render-grid.anchor.test.tsx` 헤더 «화면에 그려진 사실 칸 그룹 = ⑧이 물은 칸(순서까지)») 위젯 최소 배선을 같은 PR에 둔다 — PSA-E3(엔진·Zod·배관에 UI 최소분을 같은 브랜치) 선례. 안내문·결과 카드 문구는 PSA-SU |
| **PSA-S2** | 비철거 사슬: `propertyBuildingChain`·`propertyBuildingFactIssue` · `isSeparateAggregateLand` 접힘 위치 · ⑫ 비철거 분기 교체 · ⑧ 비철거 순서 · ④ 비철거 용도지역·바닥면적 조건부 · **Step2 재배치(토지 면적·공장 → 철거 토글 → 허가 또는 철거 사슬 → 용도지역·바닥면적)**(신규 `SeparateAggregateAreaBasis.tsx` 포함 — UI 시니어 구현) · 비철거 패리티·렌더 격자 갱신 | 파일 소유: 위 Step2 재배치는 UI 문서 §2.4가 정본 |
| **PSA-SU** | UI 나머지: `resolved` 확정 안내(`pt-sa-seq-settled`) · live region · 결과 카드 «입력이 필요했던 칸» 문구(줄 추가 없음 — UQ-S5) · 숨은 답 «이전에 고른 답» 표시(SQ-4) · 힌트 문구 · 375px · 격자 G-A·G-B | UI 문서 정본 |
| **PSA-SX** | E2E(Playwright): T8 · 브라우저 수동 확인(폼 → 계산 → 결과 · Network body 키) | CI 전용 E2E |

- Check 단계: `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`(matchRate). 완료 자가 점검: `npx tsc --noEmit` · `npx vitest run __tests__/tax-engine/property/ __tests__/tax-engine/separate-aggregate-* __tests__/tax-engine/property-separate-* __tests__/api/property.route.* __tests__/calc/ __tests__/components/calc/property-*` · `npm run test:property` · `npm run verify:legal`(새 인용 없음 확인).
- 파일 크기: leaf 391 → 약 480줄(≤700) · `separate-aggregate-land.ts` 734줄(접힘 위치 이동은 순증 ≈ 0 — 750 이상으로 커지면 그 김에 분리, 정책) · `property-input.ts` 530 · `shared.ts` 583 · `request-body.ts` 326.

---

## 7. 사용자 결정 Q — **전부 결정됨(2026-11-25, 추천안 채택 — §0.0)**. 아래는 결정 전 기록(추천 첫째 + 근거)

| Q | 질문 | 결정(= 추천) | 대안 · 근거 |
|---|---|---|---|
| **SQ-1** | 구현 방식 | **(가) 사슬 걷기** — 판정·읽은 칸·첫 미답 칸을 한 번의 걷기에서 파생(§2.2) | (나) 명시 규칙 술어 확장: diff는 작으나 prune 규칙과 판정 단락이 이중 인코딩 → 드리프트(별도 규칙 재정의 금지 위반 위험). (다) 런타임 두 번 돌려 측정: 순서를 정할 수 없어 ②를 못 푼다 — **테스트 오라클로만 채택** |
| **SQ-2** | **빈집정비 칸의 자리** | **(가) 날짜 의존** — 철거일이 일반 한시 기간 밖이면 종류 바로 뒤(관문) · 안이면 건축 외 «예» 뒤(단서 하위). 같은 칸·같은 라벨, 자리만 다름 | (나) 종류 바로 뒤 고정: 구현·화면이 단순하나 **주택·일반 기간 안**에서 빈집정비 over-ask 216/243이 현행과 똑같이 남는다(§1.2 ③④ 행) — 사용자 지시(앞 답이 결과를 확정하면 묻지 않는다)와 충돌하는 잔여분. 수용 가능하면 (나)로 단순화 가능 |
| **SQ-3** | 비철거 순서 — **철거 토글을 용도지역·바닥면적 위로 올리고 허가를 앞세움** | **(가) 재배치**(철거 토글 → [철거: 철거일…] / [비철거: 허가 → 용도지역 → 바닥면적]). 사용자 요청(Low-1)의 직접 귀결 | (나) 화면 순서는 현행 유지하고 허가 «아니오»일 때만 숨김: 용도지역·바닥면적이 허가보다 **위**에 있어 «앞 답이 뒤 칸을 가린다» 원칙이 성립하지 않는다(위 칸을 이미 채운 뒤에 사라짐) → 비추 |
| **SQ-4** | 앞 답 변경으로 칸이 사라졌다 다시 열릴 때 이전 답 | **(가) 폼에 보존**(현행 «숨은 값 보존» — ④ 미전송·⑧ 미요구)하고 **다시 열릴 때 UI가 «이전에 고른 답» 임을 표시**(표시 방식은 UI 문서 §2.1-5) | (나) 앞 칸 onChange에서 뒤 칸을 `""`로 초기화(재질문): 확인은 강제되나 앞 칸을 잠깐 바꿨다 되돌릴 때 입력이 사라진다. `useEffect → store` 초기화는 금지라 onChange 핸들러에서만 가능 |
| **SQ-5** | 날짜만으로 확정되는 접힘(종류를 안 물음)의 고지 문구 | **(가) 일반 기간과 빈집정비 기간 병기**(«…(1년)과 빈집정비사업 철거 빈집(3년)이 모두 지나…») — 2024.6.1.~ 시행본. 그 전 시행본은 현행 문장 그대로 | (나) 가장 긴 기간(36개월)만: 일반 기간 정보가 빠짐. 종류를 묻는 안은 사용자 결정에 반함 |
| **SQ-6** | 엔진 직접 호출(종류 없음 + 날짜 확정)의 접힘 사유 | **(가) `input` → `period`/`not_yet`**(날짜 확정이 우선) — 이관 사유 `demolished_period`·세액 불변 | (나) 현행 `input` 유지: 날짜 확정 접힘이 종류 부재 사유로 가려져 «종류를 묻지 않는다» 원칙과 모순 |

**미결 Q 0건.**

---

## 8. 미검증 V

| V | 내용 | 영향 |
|---|---|---|
| SV-1 | §3.3의 «깨지는 기존 단언»은 **grep 일치 파일 목록**이지 실행 결과가 아니다. 구현 PR의 첫 vitest 실행에서 확정. `propertyDemolishedRequired`·`PublicUseAsked` 비테스트 사용처가 어댑터뿐이라는 것도 `grep` 기준(확인) — 구현 PR이 다시 돌린다 | 중 |
| SV-2 | 비철거 접힘 echo(`multiplier`·`baseArea` 0)를 **API 응답을 직접 읽는 외부 소비자**가 있는지는 미조사(앱 안 결과 카드·PDF·`lib/calc`는 grep 0건 확인) | 낮음 |
| SV-3 | 비철거 바닥면적 결함 문구가 ⑧(«건물 바닥면적(㎡)을 입력하세요.»)과 ⑫(«별도합산 토지는 건축물 바닥면적(㎡)이 필요합니다(…§101①1호)»)가 **현행에서 다르다**(`shared.ts:459` ↔ `property-input.ts:493-495`). `propertyBuildingFactIssue`로 통합할 때 하나로 정리 — 어느 문구가 기존 anchor에 박혀 있는지 grep 필요 | 낮음 |
| SV-4 | 렌더 격자(연도별 180초 제한) 실행 시간 — 사슬로 셀당 렌더 횟수가 줄 것으로 보나 **추정**, 구현 후 실측 | 낮음 |
| SV-5 | 브라우저 수동 확인·Network 탭 본문 확인 **미수행**(문서 작업). 숨은 값 재노출 UX는 실제 화면 확인 필요 | 중 — SQ-4 |
| SV-6 | Step2 재배치(철거 토글 상향)가 기존 E2E 셀렉터·`LandPriceLookupField`·StepIndicator 점프에 미치는 영향 — UI 문서 §5.3(E2E 헬퍼 개편 포함)이 다루나 실측 전 | 중 |
| SV-7 | 비철거 허가 앞세움은 «허가 답 = 건축물이 있다는 전제»를 암묵적으로 둔다(허가 «아니오» + 바닥면적 없음 → 접힘 + 허가 고지; 현행은 «건축물이 없는 토지» 고지). 둘 다 전량 종합합산이라 세액 불변(probe 확인) — 고지 문구 차이만 | 낮음 |
| SV-8 | 용도지역·바닥면적의 칸 내부 순서가 현행에서 경로별로 다르다(철거 leaf `FactIssue`는 바닥면적 → 용도지역 `:192-195`, 비철거 ⑧·⑫는 용도지역 → 바닥면적). **UI 문서 E-S6 요청을 수용해 철거도 용도지역 → 바닥면적으로 통일**한다(화면에서 두 칸을 한 덩어리로 그리므로). 철거 격자 fixture의 `saZoningDistrict` 고정(«채워 둔 셀» 전제)과 `FIELD_BY_MESSAGE` 순서 단언을 같은 PR이 갱신 | 낮음 |
| SV-9 | 법령: 질문 순서·노출만 바뀌고 법문·연혁 경계·접힘 사유 우선순위는 불변이라 KoreanLaw 재조회를 하지 않았다. 새 고지(`PeriodAllKindsNotice`)가 인용하는 조문은 기존 `PROPERTY_SEPARATE.DEMOLISHED_GRACE` — `npm run verify:legal`로 구현 PR이 확인 | 낮음 |

---

## 9. 재제안 금지·기결정 준수 확인

- 과세기준일 단위 접기 · 자동 안분 fallback — 사용하지 않는다. 사슬의 «접힘 확정»은 법문(기간 ∧ 허가 ∧ 건축 외 용도)의 AND 구조 그대로이며, 면적 분할(Q-4)은 법문 «면적 범위의 토지».
- «현행 유지» — 제안하지 않는다(사용자 결정 2026-11-25).
- 공장용지 → 종류 자동 채움 — 제안하지 않는다(기결정).
- 「모름」은 혜택 불성립 확정 + 확인 필요(법 근거 없이 불리 적용 금지 — 선행 계획서 Q-1 · 법문 «받은 건축물»의 반대 해석 V-14는 불변).
- 납세자 유리/불리·절감 표현 없음 — 이 문서는 «어느 칸을 언제 묻는가»만 다룬다.
- `useEffect → store` 미러링 금지 · 숨은 값 초기화는 onChange 핸들러만(SQ-4) · placeholder 숫자 예시 금지 — UI 문서.

## 10. 검증 기록

- 코드 읽기(master 2fbfa9032): `lib/tax-engine/property-separate-requirements.ts`(전체) · `lib/calc/property-separate-requirements.ts`(전체) · `lib/tax-engine/separate-aggregate-land.ts:195-434` · `lib/validators/property-input.ts:430-528` · `components/calc/property/shared.ts:395-505` · `request-body.ts:20-67` · `Step2SeparateAggregate.tsx` · `SeparateAggregateDemolishedFacts.tsx` · `property-land-split-tax.ts:40-123` · `property-tax-land-split.ts:44-70` · `lib/calc/property-demolished-verdict-text.ts` · `data/nbl-historical-values-era.ts:120-205` · 선행 계획서 §0~§9 · 렌더 격자·패리티 격자 헤더.
- probe(스크래치패드 — 저장소 밖 · 현행 master import · 코드 변경 0): `probe-overask.ts`(over-ask 격자 · 판정 동치 27,216셀) · `probe-blank.ts`(빈 칸 포함 202,752셀 — 판정 일치·강화·부분집합) · `probe-cases.ts`(34셀 — §4.1은 그 대표 · 현행 judge·요구 칸과 대조 · SK-25는 정의상 오라클로 미실측) · `probe-zod.ts`(현행 Zod 400 사례 · 비철거 엔진 접힘 echo · judge 1회 ≈ 1.6µs). 구현 PR의 T1~T3이 이 격자를 영구화한다.
- 미수행: 브라우저 수동 확인 · vitest 실행(코드 변경 0이라 불필요) · KoreanLaw MCP 재조회(SV-9).
