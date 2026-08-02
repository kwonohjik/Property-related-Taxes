# 현물출자에 따른 이익의 증여 (§39의3) — 계산사례 재현 보완 작업계획서

> 브랜치 `feat/gift-inkind-capital-39-3` · 워크트리 `.claude/worktrees/gift-inkind-capital`
> 대상: 첨부 세무교재 「현물출자에 따른 이익의 증여」 계산사례 1·2·3 100% 재현
> 작성 기준: **추정 금지** — 모든 수치·인용은 실측(probe 실행·KoreanLaw MCP 본문·file:line)으로 검증 후 단정. 미검증은 "확인 필요" 명시.

---

## 0. 한 줄 요약 / 결론 먼저

§39의3 현물출자 의제는 **기존 단순 기능(gross 단일값 산출)이 UI→API→엔진 14지점에 배선되어 있다**. 그러나 이는 **"지점(슬롯)이 존재한다"는 뜻일 뿐, 신규 `parties`(증여자/수증자 명부)·저가 안분·per-party 분리·별건 prefill 로직은 코드에 전혀 없다**(아래 §2-1 주의). 따라서 본 작업은 "약간의 보강"이 아니라 **저가인수 2단계(gross + 증여자별 안분) 엔진 신설 + roster 14지점 동기화 + 별건 prefill 신설**이며, 난이도를 과소평가하지 말 것(재검토 wiring 렌즈 지적).

현행 엔진은 **gross(법문 전액)만 산출**하여 교재 계산사례 1(저가 과세 450,000,000)·2(고가 per-donee 분리)를 재현하지 못한다.

> **★ `deemedGiftValue` 의미 고정 (전 섹션 공통 — 의미 가변 금지)**
> | 분기 | `deemedGiftValue` | `grossDeemedGiftValue`(echo) |
> |---|---|---|
> | 저가 + roster無 | = gross (법문 §29의3①1, **증여자별 안분·자기지분 제외 前 — 과세표준 아닐 수 있음**) | = gross |
> | 저가 + roster有 | = Σ 증여자별 과세(gross × 각 증여자 지분/preTotal, 자기지분 제외) | = gross |
> | 고가 (roster無=relatedRatio / 有=per-donee) | = ratio 적용 후 과세(Σ) | = base(차액×인수신주, ratio 前) |
>
> 저가 roster無의 `deemedGiftValue`=gross는 **현물출자자가 출자前 지분을 보유하면 실제 과세표준보다 크다**(자기증여분 미제외). 결과뷰는 이때 amber 경고 필수(§7 ⑦).

---

## 1. 배경 — 무엇이 모순처럼 보였고, 어떻게 해소됐나

첨부 교재 저가인수 사례가 표면상 충돌:

| 사례 | 현물출자자 출자前 지분 | 교재 표기 산식 | 교재 표기값 | 표기 레벨 |
|---|---|---|---|---|
| 계산사례 1 (저가) | C 10%(10,000/100,000) | (15,000−10,000)×100,000×**(90,000/100,000)** | 450,000,000 | **(B) 증여자별 안분 後 = 과세** |
| 계산사례 3 (저가) | 갑 **50%**(10,000/20,000) | (800−600)×20,000 | 4,000,000 | **(A) gross(법문)만 — 안분 前** |

**KoreanLaw MCP 본문 + 조세심판원 조심2010서3741로 해소(아래 §3).** "전액 vs 비율"은 잘못된 프레이밍 — **(A) 증여재산가액 총액(gross)** 과 **(B) 증여자별 안분(자기지분 제외, §47)** 은 별개의 양립 단계다. **두 사례는 교재의 표기 레벨이 다를 뿐이며, 같은 방법을 일관 적용하면**: 사례1 과세=gross 500M×90%=450M, **사례3 저가 과세=gross 4M×(을 증여자 50%)=2,000,000**(갑 자기지분 50% 제외) — 즉 교재 사례3의 4M은 gross이고 §47 과세표준은 2M이다. 본 계획은 양 레벨(gross echo + 안분 과세)을 모두 산출·동결한다(§4·§7).

---

## 2. 현행 상태 — 실측 (probe 실행·정찰 검증)

### 2-1. 배선 완비 (14지점 전부 present) — wiring 정찰

| 지점 | 위치 (file:line) | 상태 |
|---|---|---|
| ① 폼 필드 | `components/calc/deemed-gift/shared.tsx:133~141` (con* 8필드) | present |
| ② initial | `shared.tsx:284~291` (`INITIAL_DEEMED` conCaseType='low') | present |
| ③ UI 위젯 | `components/calc/deemed-gift/capital-forms.tsx:149~186` (`ContributionFields`) | present |
| ④ API 변환 | `lib/calc/gift-deemed-api.ts:154~166` (`buildDeemedGiftInput` case `contribution`) | present |
| ⑤ Zod | `lib/validators/gift-deemed-input.ts:141~151` (`contributionSchema`) | present |
| ⑥ Validation | `lib/calc/gift-deemed-validate.ts:90~93` (case `contribution`) | present |
| ⑦ Route | `app/api/calc/gift-deemed/route.ts:42·62` (`calcDeemedGift`) | present |
| ⑧ 엔진 | `lib/tax-engine/gift-deemed/contribution-in-kind.ts:10~72` | present |
| ⑨ 타입 | `lib/tax-engine/gift-deemed/types.ts:221~233` (`ContributionInput`) | present |
| ⑩ 결과 breakdown | `contribution-in-kind.ts:26~32·56~62` (산식 5행) | present |
| ⑪ 결과 뷰 | `components/calc/results/DeemedGiftResultView.tsx:48` (breakdown map) | present |
| ⑫ 증여세 합산 | `gift-deemed-api.ts:288~320` (`buildGiftWizardPrefill` → giftItems `category:'other'`) | present |
| ⑬ Router | `lib/tax-engine/gift-deemed/router.ts:44~45` | present |
| ⑭ 진입 | `app/calc/gift-deemed/page.tsx` + `shared.tsx:397` (`DeemedTypeSelector`) | present |

> **함의 (정확히)**: 위 present는 **기존 단순 기능(gross 단일값·8필드)의 슬롯이 존재**한다는 뜻이다. **신규 `parties`/`relation` 필드, 저가 안분 엔진(A2), 고가 per-donee(A3), 별건 prefill(⑫)은 코드에 0건** — `types.ts`의 `ContributionInput`에 `parties` 없음(`:222~233`), `contribution-in-kind.ts:19`는 gross만, `buildGiftWizardPrefill`(`gift-deemed-api.ts:308~318`)은 단일 `category:"other"`만. 즉 §8 영향표의 "신규"는 **슬롯은 있으나 신규 필드 동기화는 전부 미구현**이라는 의미. Do 난이도 = 신규 엔진 분기 + 14지점 동기화(과소평가 금지).

### 2-2. 엔진 수치 실측 (probe 실행 — 6 케이스 calcContributionGift 직접 호출)

| 케이스 | 입력 요지 | 현행 엔진 출력 | 교재 기대 | 일치 |
|---|---|---|---|---|
| 사례1 저가 | pre 20,000/10만주, 인수 10,000, 배정 10만 | **500,000,000** (gross) | 450,000,000 | ✗ **(−50M)** |
| 사례2 고가 합계 | pre 5,000, 인수 20,000, 50,000주, ratio 45/100 | 225,000,000 | 225,000,000 | ✓ |
| 사례2 고가 B | ratio 35/100 | 175,000,000 | 175,000,000 | ✓(개별호출) |
| 사례2 고가 C | ratio 10/100 | 50,000,000 | 50,000,000 | ✓(개별호출) |
| 사례3 저가 | pre 1,000/2만, 인수 600 | 4,000,000 | 4,000,000 | ✓ (gross) |
| 사례3 고가 | pre 1,000, 인수 2,000, ratio 10/20 | 5,000,000 | 5,000,000 | ✓ |

근거: `contribution-in-kind.ts:19` 저가 `value = safeMultiply(perShareGain, allocatedShares)` (gross, 비율 미적용). 고가 `:50~51` base × `relatedRatio`.

### 2-3. 기존 anchor (교재 6케이스 아님 — 별도 회귀 자산)

- `__tests__/tax-engine/gift-deemed/capital-transaction-anchor.test.ts` [CON-1] 저가 99,990,000
- `__tests__/tax-engine/gift-deemed/capital-subcase-anchor.test.ts` [CON-H] 고가 60,003,000 (ratio 30/100)
- `__tests__/tax-engine/gift-deemed/small-shareholder-imputation-anchor.test.ts` [IMP-CON] 저가 소액주주 의제 echo

> **회귀 게이트**: 위 3 anchor는 roster 미사용(현행 gross/relatedRatio 경로) → **신규 optional 필드 추가 시 불변 보장**.

---

## 3. 법령 검증 결과 (KoreanLaw MCP 본문 직접 인용 — 추정 0)

상증법 MST `276123`(시행 20260102) · 상증령 MST `283637`(시행 20260227).

### 3-1. ★핵심: 저가인수 증여재산가액 = 2단계 (총액 + 증여자별 안분)

- **(A) 총액(gross) — 법문**: 상증령 §29의3①1호 = "제29조제2항제1호가목 준용 가액 − 같은 호 나목 가액 × **현물출자자가 배정받은 신주수**". 지분비율 인자 **없음**. (비율은 ①2호 고가인수에만 "현물출자자 외 주주등의 지분비율을 각각 곱하여"로 등장.) → **사례3 저가 4,000,000 = 이 gross**.
- **(B) 증여자별 안분 — 조심2010서3741(2011.6.29., 참조 조심2011서39·조심2009서1909)**: 현물출자자가 얻은 이익은 **신주를 배정받지 않은 기존 각 주주(=현물출자자 外 주주)로부터 증여받은 것으로 보아 각 주주별로 구분 계산**(준용 법 §39② 소액주주 1인 의제 + **법 §47 증여자별 과세표준**). 현물출자자 본인의 현물출자 전 지분은 **자기증여라 증여자 풀에서 제외**. → **사례1 450,000,000 = gross 500M × (현물출자자 外 주주 지분 90%)**, A로부터 275M·B로부터 175M **별건 증여**.

> **설계 귀결**: 엔진은 ① gross echo + ② 증여자 명부 제공 시 per-donor 안분(자기 제외). 명부 미제공 시 안분 미산출(자동 fallback 금지) + gross만 표시. **Pre-Do anchor로 사례1(450M)·사례3(4M) 둘 다 동결해 2단계 회귀 차단**.

### 3-2. 평가 (현물출자 전·후 1주당) — §60·§63·§29②1가 단서

- **후 1주당(이론값)**: §29②1가 본문 = `[(전 1주평가 × 전 주식총수) + (인수가 × 증가주식수)] / (전 주식총수 + 증가주식수)`. ("증자"→"현물출자" 준용)
- **상장(코스닥 포함) 후 — 단서 방향 비대칭**: 저가(준용 §29②1가 단서)=**Min[실제 평가, 이론값]**(작은값) / 고가(준용 §29②3나 단서)=**Max[실제 평가, 이론값]**(큰값). 본문 인용: 3호나 단서 "증자후의 1주당 평가가액이 산식 가액보다 **큰** 경우에는 당해 가액". 실제 평가 = §63①1가 **평가기준일 이전·이후 각 2개월** 최종시세 평균(전후 각 2개월 — 도메인상 "후 평가"는 후 시점 기준).
- **상장 전**: §63①1가(평가기준일 이전·이후 각 2개월 평균; 증자 등 사유 시 §52의2 단축). **비상장 전**: §60① 시가 / §63①1나 보충평가. **비상장 후**: 이론값(단서 미적용).
- ⚠️ 교재 3 계산사례는 **모두 비상장** → 상장 Min/Max는 계산사례 재현에 **불필요**(Phase D 후속, 구현 시 저가 Min·고가 Max 분기 주의).

### 3-3. 증여시기 = 현물출자 납입일

§39의3① **본문이 직접** "현물출자 납입일을 증여일로" 정함(1차 근거). 신주인수권증서 교부일 빠른날 예외(§29①3호 본문 확인)의 §39의3 준용 여부는 본문에 명문 없음 → **참고(확인 필요)**로 강등, 1차는 납입일. 판례 대법 2007두7949(2009.8.20.)·조심2010서3741.

### 3-4. 최대주주 할증평가 배제 — **§53⑧3호** (정정)

§63③ 최대주주 20% 할증. **배제 위임 = 상증령 §53⑧3호** ("§28·§29·§29의2·**§29의3**·§30 이익 계산 시"). → **사용자/교재 추정 §53⑥ 아님. §53⑧3호로 정정**(시행령 구조 개편으로 항 이동).

### 3-5. 증여자 연대납부의무 면제 — §4의2

- **§4의2⑥ 단서**: 연대납부 배제 열거에 **§39의3 포함**.
- **§4의2③**: 수증자에 소득세/법인세 부과 시 증여세 비과세. **§4의2④**: 영리법인 수증 시 주주 미부과.
- 주의: §4의2① = 납부의무 주체 규정(면제 무관). §4의2⑤ = §35~§37·§41의4 한정(§39의3 비적용).

### 3-6. 중복배제·1년 합산 — §43 (둘 다 §39의3 포함)

- **§43① 중복적용 배제(이익 최대 1개)**: 목록에 §39의3 포함.
- **§43② 1년내 동일거래 합산**: 목록에 §39의3 포함. 계산방법 **상증령 §32의4 6호** "법 §39의3①의 현물출자에 따른 이익(각 호의 이익별로 구분)".

---

## 4. 계산사례 매트릭스 (Phase-0 anchor 동결값)

> 단순 → 복잡 순. **모든 분기 enumerate**. 원단위 `toBe()` 동결.

### CASE-1 저가인수 — 다수 증여자 안분 (사례1)
- 입력: caseType=low, preContribPrice=20000, preContribShares=100000, newSharePrice=10000, contributedShares=100000, allocatedShares=100000, **parties(증여자)=[A:55000, B:35000]** (현물출자자 C 자기지분 10,000 제외)
- 후1주가 = (20000×100000 + 10000×100000)/200000 = **15,000**
- **gross** = (15000−10000)×100000 = **500,000,000**
- per-donor: A = 500M×55000/100000 = **275,000,000**; B = 500M×35000/100000 = **175,000,000**
- **deemedGiftValue(과세) = 450,000,000** (= 별건 2건 합)

### CASE-2 고가인수 — 다수 수증자(특수관계) 분리 (사례2)
- 입력: caseType=high, preContribPrice=5000, preContribShares=100000, newSharePrice=20000, contributedShares=50000, allocatedShares=50000, **parties(수증자 특수관계)=[B:35000, C:10000]** (현물출자자 A 제외)
- 후1주가 = (5000×100000 + 20000×50000)/150000 = **10,000**
- 차액 = 20000−10000 = **10,000**, base = 10000×50000 = **500,000,000**
- 적용요건: 차액 10,000 ≥ 후가 10,000×30%=3,000 ✓ (3억 검토 생략)
- per-donee: B = 500M×35000/100000 = **175,000,000**; C = 500M×10000/100000 = **50,000,000**
- **합계 = 225,000,000** (각 수증자 별건 과세)

### CASE-3L 저가인수 — gross vs 과세 2레벨 (사례3 저가)
> 교재 사례3 주주현황(이미지): **현물출자자 갑 출자前 10,000/20,000=50%**, 을 50%. 갑 출자後 30,000(75%)·을 10,000(25%).
- 입력: caseType=low, preContribPrice=1000, preContribShares=20000, newSharePrice=600, contributedShares=20000, allocatedShares=20000
- 후1주가 = (1000×20000 + 600×20000)/40000 = **800**
- **gross(roster無) = (800−600)×20000 = 4,000,000** ← **교재 사례3 표기값**(법문 §29의3①1, 안분 前)
- **과세(roster有: 증여자 을 10,000) = gross 4M × (10,000/20,000) = 2,000,000** ← §47 자기지분 50% 제외 후 실제 과세표준
- 납세의무자 = 현물출자자 갑. **두 값 모두 Phase-0 동결**(gross 4M·과세 2M). ⚠️ 교재 4M은 gross이며 갑 자기지분 보유로 과세표준≠4M임을 결과뷰 경고.

### CASE-3H 고가인수 — 단일 비율 (사례3 고가)
- 입력: caseType=high, preContribPrice=1000, preContribShares=20000, newSharePrice=2000, contributedShares=20000, allocatedShares=20000, relatedRatio=10000/20000 (또는 parties=[을:10000])
- 후1주가 = (1000×20000 + 2000×20000)/40000 = **1,500**, 차액=500, base=500×20000=10,000,000
- 적용요건: 500 ≥ 1500×30%=450 ✓
- **deemedGiftValue = 10,000,000×(10000/20000) = 5,000,000** (납세의무자=특수관계 기존주주 을)

---

## 5. 갭 분석 (실측 5건)

| # | 갭 | 근거 (file:line) | 영향 |
|---|---|---|---|
| G1 ★ | 저가인수 **증여자별 안분 미구현** (gross만) | `contribution-in-kind.ts:19` | 사례1 −50M·A/B 분리 불가 |
| G2 ★ | **per-party 분리 출력 부재** (단일 집계) | `contribution-in-kind.ts:36`, `capital-helpers.ts:34` 주석 | 사례1 A/B·사례2 B/C 분리 불가 |
| G3 | gross↔과세 2값 echo 부재 | `types.ts:32~76` `DeemedGiftResult` | 산출근거 표시 불가 |
| G4 | 상장 Min[2개월평균,이론값] 미처리 (caller 책임) | `contribution-in-kind.ts:16·46`, `capital-helpers.ts:6~18` | 비상장 계산사례엔 무영향(Phase D) |
| G5 | 증여시기·할증배제(§53⑧3호)·연대면제(§4의2)·§43 결과 미표기 | breakdown note 부재 | 계산사례 수치 무관, 정확성 보강 |

> G4·G5는 **3 계산사례 수치와 무관** → 후속/저우선. G1·G2·G3가 계산사례 재현의 본체.

---

## 6. 핵심 설계 결정

### 결정 1 — 저가인수 2단계 모델 (채택)
엔진이 **항상 gross 산출 + 증여자 명부(roster) 제공 시 per-donor 안분**. 명부 미제공 시 gross만(자동 fallback 금지, `feedback_no_silent_apportion_fallback`).
- 대안(기각): 단일 "현물출자자 외 지분율 %" 입력 → 450M aggregate는 되나 A/B **별건 증여(§47) 분리 불가** → 교재 사례1 재현 실패.

### 결정 2 — 공용 roster `parties?: ContributionParty[]` (3-state)
caseType이 역할 결정: 저가=증여자(현물출자자 外 전체 주주), 고가=수증자(현물출자자 특수관계 기존주주만).
- 3-state(`feedback_three_state_optional_mode_toggle`): `undefined`=OFF(현행 gross/relatedRatio 경로 유지) / `[]`=ON 빈(validate 차단) / `[{...}]`=데이터.
- **비율 분모는 양 caseType 모두 `preContribShares`, 분자만 다름**:
  - 저가: 분자=현물출자자 外 **전체 주주**(증여자 풀) → Σ비율 = (1−현물출자자 자기지분율). CASE-1 90%·CASE-3L 50%.
  - 고가: 분자=현물출자자 **특수관계 기존주주만**(수증자) → **Σ비율<1 정상**(자기지분 + 비특수관계 주주 둘 다 제외, 특수관계인만 과세). CASE-2 45%(=B35%+C10%, 비특수관계 55% 제외).
- 고가 기존 `relatedRatio`(단일)와 병존: roster 있으면 per-donee, 없으면 relatedRatio aggregate(사례3H·기존 CON-H 회귀 보존).
- `ContributionParty { name?: string; preShares: number; relation?: GiftDonorRelation }` — `relation`은 결정 4의 증여세 별건 prefill용 관계(저가=증여자 관계, 고가=수증자의 현물출자자에 대한 관계). 미지정 시 prefill 후 마법사에서 선택.

### 결정 3 — 결과 타입 확장 (Record/배열, **Map 금지** `feedback_engine_result_map_json_loss`)
`DeemedGiftResult`에 `grossDeemedGiftValue?: number` + `contributionBreakdown?: { party: string; preShares: number; ratioLabel: string; value: number; relation?: GiftDonorRelation }[]` 추가. `party`는 `name.trim() || "주주"`(`feedback_no_internal_id_in_result`).
- `caseType?: "low" | "high"` echo 추가 (`echo-field-pattern` — 산식 불변, 노출만). prefill·결과뷰가 저가/고가를 gross 대소비교 휴리스틱 대신 이 명시값으로 판정(고가 roster有도 gross(base) ≥ Σper-donee 성립 → gross 비교 시 고가가 저가로 오판되어 동시증여 prefill로 오라우팅 방지).

### 결정 4 — 증여세 본세 prefill **별건 분리** (사용자 확정 2026-06-25)
§47 증여자별 과세표준 원칙상 별건 분리. **저가/고가 비대칭** (실측 확인):
- **저가 (1 수증자=현물출자자, N 증여자)** → **기존 동시증여 메커니즘 재사용** (`lib/tax-engine/gift-simultaneous.ts` `calcSimultaneousGifts`, 상증령 §46①2호 공제 안분·법 §47② 동일인 합산 가드). prefill이 현 신고 건 + `simultaneousGifts[]`(`GiftSubFormState`, `components/calc/gift/SimultaneousGiftCard.tsx`) 배열을 증여자별로 populate. **다중 giftItems 단순 합산 금지** — 서로 다른 증여자는 §47상 합산 불가(동일인 그룹 아닌 한). `project_gift_simultaneous_multi` 패턴.
- **고가 (1 증여자=현물출자자, N 수증자=독립 납세의무자)** → 동시증여 아님(동시증여=동일 수증자 전제). N개 **독립 증여세 건**. ✅ **확정·구현(2026-08-02)**: 마법사 세션 1개 = 신고 1건이므로 N건 동시 주입은 불가 — **결과뷰 과세 수증자 select → 선택 1건 이관**(`conSelectedDoneeIndex`). 선례 그대로: 감자 §39의2 `cdSelectedDoneeIndex` · 특정법인 §45의5 `scSelectedDoneeIndex`. 목록·이관 기준은 **과세 행(value > 0)만** — §29의3② 기준금액 미달 행은 신고 대상이 아니다.

---

## 7. 작업 Phase (Do는 시퀀셜 — 엔진 → UI/API → 회귀)

### Phase 0 — Pre-Do anchor (A1 타입 선행 후 작성) `pre-do-anchor-verification`
> ⚠️ TBC anchor는 `parties` 입력·`contributionBreakdown` 결과를 assert하므로 **A1(types 확장) 없이는 작성 불가**. 순서 = A1 → Phase-0 anchor 작성(현행 로직 미구현이라 RED) → A2~A5 구현(GREEN). 단순 게이트는 A1 전이라도 gross로 선작성 가능.
`__tests__/tax-engine/gift-deemed/contribution-textbook-anchor.test.ts` 신규 — **anchor ID 6건**:
- [TBC-1] CASE-1: gross 500,000,000 + per-donor A 275,000,000·B 175,000,000 + deemedGiftValue(과세) 450,000,000
- [TBC-2] CASE-2: per-donee B 175,000,000·C 50,000,000 + 합 225,000,000
- [TBC-3L] CASE-3L gross 4,000,000 (roster無) + **과세 2,000,000 (roster 을 10,000)**
- [TBC-3H] CASE-3H 5,000,000
- [TBC-RES] floor 잔액흡수 검증: gross 1,000,000·preContribShares 3·parties 2건(각 1주, 자기지분 1) → 과세 Σ=floor(1,000,000×2/3)=666,666, 마지막 party=666,666−333,333(=safeMultiplyThenDivide의 floor)=333,333 (잔액은 **taxableTotal** 기준 흡수, gross 아님 — §A4)
- [TBC-NOTE] CASE-1 결과 breakdown/ note에 `§53⑧3호`·`§4의2⑥`·`§43①`·`현물출자 납입일` 키워드 `toContain` (note 침묵소실 회귀 차단)
- **게이트**: TBC-1·2·3L(과세)는 현행에서 RED(안분/분리 미구현)여야 정상. 실패 메시지로 설계 환류.

### Phase A — 엔진 (`contribution-in-kind.ts` + `types.ts` + `capital-helpers.ts`)
- A1. `types.ts`: `ContributionParty { name?: string; preShares: number; relation?: GiftDonorRelation }` + `ContributionInput.parties?` 추가. `DeemedGiftResult.grossDeemedGiftValue?`·`contributionBreakdown?`(각 행 `relation?` 포함) 추가.
- A2. 저가 `contributionLow`: gross 산출 유지 + parties 있으면 per-donor 안분(`safeMultiplyThenDivide(gross, partyShares, preContribShares)`) → `contributionBreakdown` + `deemedGiftValue=Σ과세`(자기지분 제외). parties 없으면 `deemedGiftValue=gross` + `grossDeemedGiftValue=gross`(의미 고정표 참조).
- A3. 고가 `contributionHigh`: parties 있으면 per-donee 분리(각 수증자 base×partyShares/preTotal), 없으면 현행 relatedRatio. **게이트 비대칭 명시**: 30% 요건은 1주당 차액 vs 후가×30%(공통, per-share) / **3억 요건은 per-donee**(§29의3② "그 이익"=ratio 적용 후 개인별). roster無 aggregate 경로의 3억 게이트는 합계 기준임을 코드 주석+§10 리스크에 명시. `contributionBreakdown` 채움.
- A4. floor 안분 잔액: **기준은 `taxableTotal`(=`safeMultiplyThenDivide(gross, ΣpartyShares, preContribShares)`), gross 아님**. 다건 분할 시 마지막 party = `taxableTotal − Σfloor(others)` 흡수(`feedback_floor_residual_absorption`). gross 기준이면 자기증여 비과세분이 마지막 증여자에 흡수돼 과대과세(재검토 logic 지적, TBC-RES로 동결). 사례1·2는 정수배분(잔액 0)이나 일반 케이스 방어 필수.
- A5. legal-codes `inheritance-gift.ts`: **GIFT.* 상수 신규 추가**(문자열 리터럴 금지 정책 — breakdown note 직접 기입 금지). 예: `GIFT.CONTRIBUTION_TIMING="상증법 §39의3① 본문"`·`GIFT.PREMIUM_EXCLUSION_29_3="상증령 §53⑧3호"`·`GIFT.JOINT_LIABILITY_EXEMPTION="상증법 §4의2⑥"`·`GIFT.DUP_EXCLUSION_ANNUAL="상증법 §43②"`. 추가 전 `korean-law-citation-verify`로 §53⑧3호 위임체인 재확인.
- **검증**: `npx vitest run __tests__/tax-engine/gift-deemed/` → TBC 6 anchor green + **CON-1/CON-H/IMP-CON 불변**(`npx vitest run __tests__/tax-engine/gift-deemed/capital-transaction-anchor.test.ts capital-subcase-anchor.test.ts small-shareholder-imputation-anchor.test.ts`).

### Phase B — UI/API 14지점 동기화 (선례 = capital_increase/decrease)
- ① 폼 `shared.tsx`: `conParties: { name: string; shares: string }[]` 추가 (+②initial `[]`/undefined, ③normalize).
- ③ UI `capital-forms.tsx` `ContributionFields`: roster 입력(행 추가/삭제, name+preShares). 저가=violet "증여자(현물출자자 외 주주)", 고가=violet "수증자(특수관계 기존주주)". 3-state 토글(명부 사용 ON/OFF). `RadioCardGroup`/`ToggleCard`·`CurrencyInput`/`DecimalInput` 규칙 준수.
- ④ API `gift-deemed-api.ts` case `contribution`: `parties` 배열 변환(빈 name 허용·shares parseAmount).
- ⑤ Zod `gift-deemed-input.ts` `contributionSchema`: `parties: z.array(z.object({ name: z.string().optional(), preShares: z.number().nonnegative() })).optional()` + superRefine(parties 정의 시 length≥1·Σshares ≤ preContribShares).
- ⑥ Validation `gift-deemed-validate.ts` case `contribution`: roster 검증(빈 배열 차단·합계 초과 차단) — UI 통과↔validate 모순 0.
- ⑦ 결과뷰 `DeemedGiftResultView.tsx`: `contributionBreakdown` per-party 표 + `grossDeemedGiftValue` echo + 증여시기/할증배제/연대면제/§43 note. 금액칸 `amount-column-align`.
- ⑫ prefill `gift-deemed-api.ts:288~320` `buildGiftWizardPrefill` **별건 분리** (결정 4):
  - 저가: `contributionBreakdown` N행 → 현 신고 건 + `simultaneousGifts[]`(증여자별) populate. 수증자=현물출자자, 증여자 관계=party.relation. 동시증여 경로(`calcSimultaneousGifts`) 라우팅. trust_benefit subGifts(:295~306)가 다항목 prefill 선례.
  - 고가: 수증자별 N행 → 결과뷰 수증자 리스트 + 선택 수증자 단건 prefill(수증자=party, 증여자=현물출자자). ✅ **완료(2026-08-02)** — `conSelectedDoneeIndex` 신설(①폼·②initial), `DeemedGiftResultView` select(`con-high-donee-selector`), `buildGiftWizardPrefill` 고가 분기가 **과세 행 필터 + 선택 인덱스**(범위 초과 시 첫 과세 행 fallback, 전원 미달 시 `giftItems: []`). anchor `__tests__/calc/gift-deemed-contribution-high-prefill.test.ts`(PB-1~6) + `...-high-donee-select.test.tsx`(PB-U1~3).
  - ⚠️ **현행 prefill은 단일 `category:"other"` 항목만 반환**(`gift-deemed-api.ts:308~318`) — contribution 분기 신설(자명하지 않음). 다중 giftItems 단순 합산 금지(저가 증여자 §47 합산 불가). 동시증여 §47② 동일인 그룹 가드(`components/calc/gift-tax-form-validate.ts:336`)와 정합 확인. `relation`→`donorRelation` 매핑, 미지정 시 마법사 "증여자 관계 선택" 차단으로 자연 가드.

### Phase C — 회귀·E2E
- `npx vitest run __tests__/tax-engine/gift-deemed/` 전건 + `npm run typecheck`.
- **E2E 신규 1건 명시**(`e2e/gift-deemed-capital.spec.ts`에 §39의3 con-case 0건 확인됨 — 추가 필수): 저가 roster 입력→결과뷰 per-party 표·gross echo 확인→"증여세 본세로 계산" handoff→gift 마법사 `SimultaneousGiftCard` N개 prefill 확인까지 1 happy-path. `feedback_browser_verify_with_playwright`·`feedback_e2e_preexisting_failures`(사전존재 실패 회귀 오인 금지).
- **route 왕복 보존 확인**: `contributionBreakdown` 배열이 `/api/calc/gift-deemed` JSON 왕복 후 결과뷰까지 보존되는지 RTL/통합 anchor 1건(배열은 Map과 달리 소실 없으나 ⑫⑬⑭ 침묵 strip 정책 정합).

### Phase D — 상장 Min/Max ✅**완료 (2026-08-02)**
- `isListed?` + `listedMarketAvg?` + `publicOfferingShares?` 신설. **저가 = Min[종가평균, 이론값](§29②1가 단서) · 고가 = Max[…](§29②3나 단서)** — §29의3①이 두 목을 **단서째로 준용**하고 「"증자"는 "현물출자"로 본다」.
- ⚠️ **§29의3② 30% 게이트 분모가 연쇄**로 바뀐다(「같은 호 나목을 준용하여 계산한 가액」) ⇒ Max가 **과세 여부를 뒤집을 수 있다**(anchor D-5).
- 본칙 **§39 증자**와 **전환주식 §39①3호**(위임 자동 커버)까지 동시 적용. cap-table 경로는 방향이 주주별로 갈려 **제외**(별건).
- 자본시장법 §165의6①3 **일반공모 배정분 제외**도 함께 구현(현물출자 전용 · 상장 게이트는 엔진 내부).
- 계획서: [`gift-inkind-contribution-39-3-phase-d.plan.md`](gift-inkind-contribution-39-3-phase-d.plan.md) v1.2 · anchor `__tests__/tax-engine/gift-deemed/listed-per-share-bound.anchor.test.ts`.

---

## 8. 14 동기화 지점 영향표 (신규 `parties` 필드)

> ⚠️ 본 표의 ①~⑭ 번호는 현행 상태 survey용 일련번호이며, **CLAUDE.md Definition-of-Done 14지점 표준번호(①폼~⑧validation·⑨Zod메인~⑭Route)는 UI 설계 문서 §10이 정본**이다. Check 단계 ui-engine-sync-checker는 표준번호로 점검.

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 | `shared.tsx` `conParties` 추가 | 신규 |
| ② initial | `INITIAL_DEEMED` conParties | 신규 |
| ③ normalize | sessionStorage 마이그(undefined 허용) | 신규 |
| ④ API 변환 | `gift-deemed-api.ts` parties 매핑 | 신규 |
| ⑤ UI 위젯 | `ContributionFields` roster | 신규 |
| ⑥ 사이드바 | (해당 없음 — 의제 단일값) | — |
| ⑦ 결과 카드 | per-party 표 + gross echo + note | 신규 |
| ⑧ Validation | roster 검증 | 신규 |
| ⑨ 타입 | `ContributionInput.parties` + result 2필드 | 신규 |
| ⑩ breakdown | 안분 행 추가 | 신규 |
| ⑪ 결과뷰 렌더 | ⑦과 동일 | 신규 |
| ⑫ 증여세 합산 | 저가=동시증여 다건·고가=수증자별 별건 prefill (결정 4·`relation` 매핑) | 신규 |
| ⑬ Router | 변경 없음(시그니처 유지) | — |
| ⑭ 진입 | 변경 없음 | — |

---

## 9. 적용 정책 (메모리 사전 점검 — `policy-check`)

- `feedback_three_state_optional_mode_toggle` — parties `T[]|undefined` 3-state. length>0 파생 금지.
- `feedback_no_silent_apportion_fallback` — 명부 미입력 시 안분 자동채움 금지(gross만 + 안내).
- `feedback_engine_result_map_json_loss` — breakdown은 **배열/Record**(Map 금지, NextResponse.json {} 소실).
- `feedback_no_internal_id_in_result` — party 라벨 `name.trim() || "주주"`.
- `feedback_floor_residual_absorption` — 다건 floor 안분 잔액 마지막 흡수.
- `feedback_korean_law_citation_verify` / `korean-law-citation-verify` — §53⑧3호·§4의2⑥·§43①② 인용 본문 재확인 후 표시.
- `feedback_tax_calculation_principle` — 유불리·절감 표현 금지, 중립 사실.
- `feedback_validation_sync_8th_point` — API/UI fallback ↔ validate 동기화.
- `amount-column-align` — per-party 금액 표 `font-mono tabular-nums` 우측정렬(콤마 세로 정렬). `BesshiRow` 재사용 우선.
- `mirror-pattern` / `feedback_useeffect_store_mirror_forbidden` — roster↔prefill·conParties 동기화는 onChange/변환함수로. **useEffect→store 미러링 금지**(무한 루프).
- `single-source-engine-helper` — 별건 prefill 동일인 판정은 `lib/tax-engine/gift-prior-aggregation`의 `isSameDonorGroup`/`getDonorGroup` 재사용(재정의 금지).
- `tax-field-add` / `single-response-do-execution` — Do 14지점 점검·단일응답 완주.

---

## 10. 리스크 / 검증 게이트

| 리스크 | 대응 |
|---|---|
| 저가 2단계 해석이 심판례(조심2010서3741) 기반 — 법문엔 비율 없음 | Pre-Do anchor 사례1·3 둘 다 동결. gross는 항상 echo로 노출(법문값 보존), 과세값은 안분(심판례). 결과뷰에 양값·근거 병기 |
| 기존 CON-1/CON-H/IMP-CON 회귀 | roster optional·미사용 경로 불변 — anchor 재실행 게이트 |
| §47 별건 증여 prefill(⑫) | **별건 분리 확정(결정 4)**. 저가=동시증여 재사용(§46①2호·§47②), 고가=수증자별 독립 건. ✅ **잔여 해소(2026-08-02)** — 고가 multi-수증자는 결과뷰 select로 1건씩 이관 |
| 동시증여 §47② 동일인 그룹 가드 충돌 | 저가 증여자가 동일인 그룹(예 父+祖)이면 `components/calc/gift-tax-form-validate.ts:336`(UI 가드) + `lib/tax-engine/gift-simultaneous.ts` `mergeSameDonorGroupGifts`(엔진 병합) 발동. roster→prefill 시 동일그룹 합산 입력 안내. relation 미지정 시 "증여자 관계를 선택하세요"로 자연 차단 |
| 고가 3억 게이트 per-donee↔aggregate | §29의3② "그 이익"=ratio 적용 후 per-donee 판정. roster無 aggregate 경로의 3억 게이트는 **합계 기준**(다수 특수관계인 개인별<3억·합계≥3억 시 오판정 가능). per-donee 정확 판정은 roster 경로에서만. 30% 게이트는 per-share 공통. 6 계산사례는 30%로 통과해 수치영향 0 |
| ESLint --fix named export 제거 | 신규 import 1라인 1named (CLAUDE.md 함정) |
| ✅**해소 — 고가 roster 행 라벨 오기**(2026-08-02 발견·같은 날 수정) | `contribution-form.tsx:67` 행 라벨이 `isHigh ? "인수 신주수" : "현물출자 전 보유주식수"`인데, 이 입력은 `gift-deemed-api.ts:267`에서 `ContributionParty.preShares`로 들어가 `contribution-in-kind.ts:174` `base × preShares / preContribShares` **지분비율의 분자**가 된다. 검증도 `Σshares ≤ conPreShares`(발행주식총수) 기준(`gift-deemed-validate.ts:185~188`)이고, TBC-2 anchor도 B 35,000/100,000 = 35% **기존 보유주식수**다. 고가에서 신주를 인수하는 쪽은 현물출자자(폼-전역 `conAllocatedShares`, 같은 라벨)이고 수증자는 인수하지 않는다 ⇒ 고가 라벨은 **"현물출자 전 보유주식수"**여야 한다. 라벨만 오기이고 산식 영향 0(사용자가 라벨대로 입력하면 분자가 틀림). **저가·고가 공통 「현물출자 전 보유주식수」로 수정** + anchor `__tests__/calc/gift-deemed-contribution-roster-label.test.tsx` |

**완료 정의**: TBC 6 anchor green · CON-1/CON-H/IMP-CON 불변 · `tsc --noEmit` 0 · gift-deemed 전 테스트 green · 결과뷰 per-party 표·gross echo·법령 note 표시 · 브라우저(또는 E2E) 확인.

---

## 11. 범위 외 (SCOPE-OUT)

- ~~상장법인 Min[2개월시세평균, 이론값] 및 시세 자동조회(키움)~~ ✅**Phase D·D-2 모두 완료(2026-08-02)**. 잔여는 §52의2② 단축 override 자동 판정뿐(사용자 직접 산정).
- §60·§63 보충적 평가 엔진 내 계산(현행대로 caller가 평가값 주입).
- §43① 중복배제·§43② 1년합산의 **자동 다규정 비교/합산 오케스트레이션**(router Phase 3 별도) — 본 PR은 §39의3 단건 정확성 + note 표기까지. **SCOPE-OUT 근거**: 교재 계산사례 1·2·3 모두 단건 §39의3로 §43 중복배제/합산 미발생(재검토 확인).
- 고가인수 **multi-수증자 자동 N-건** 동시 계산 UX(결정 4 — 본 PR은 수증자 선택 단건 prefill까지, N-건 자동화는 후속). 저가 동시증여 다건은 본 PR 범위.
