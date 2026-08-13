# 입주권 ↔ 재개발/재건축 APT 입력 블록 분리 계획서

- 작성일: 2026-08-14 (v2 — 자기검토로 D-1 판정 정정)
- 브랜치: `worktree-transfer-right-to-move-in-followup` (기준 커밋 `52c1180d` = PR #1245 머지 직후)
- 선행: PR #1245 「자산 종류로 양도 대상 축 일원화」 · memory `project_right_to_move_in_asset_kind_axis`

---

## 1. 요구사항 (사용자 지시)

| 자산 종류 | 전담 범위 | 대응 교재 사례 |
|---|---|---|
| **입주권** (`right_to_move_in`) | 관리처분 인가 후 ~ **완공 전** 권리를 양도 | **36 · 37 · 38 · 39** |
| **재개발/재건축 APT** (`redevelopment_apt`) | **완공된 신축 APT** 양도 | 40~42 · 44~48 |

「재개발/재건축 APT에 입주권 계산 기능이 다 구현되어 있다 → 원래 의도대로 입주권 쪽에서 계산되게 한다.」

---

## 2. 착수 전 실측

> ⚠️ 이 절의 수치는 전부 **throwaway probe 실행 결과**다(probe는 실측 후 삭제). 코드 인용 file:line은 실파일 대조를 마쳤다.

### 2.1 이미 분리된 것 (PR #1245 — 재작업 불필요)

| 계층 | 근거 | 상태 |
|---|---|---|
| 입력 UI 진입 게이트 | `asset-sections/AssetSectionAcquisition.tsx:315` | 두 종류 모두 §166 블록 렌더 ✅ |
| ① 「양도 대상」 라디오 | `RedevelopmentBlock.tsx:135-142` (주석만 남고 라디오 제거) | 폐지 ✅ |
| `redevSubject` 파생 | `asset-sections/AssetAreaRedevelopment.tsx:52-57` → `AssetSectionBasic.tsx:152` | 자산 종류에서 자동 파생 ✅ |
| 저장값 마이그레이션 | `lib/stores/calc-wizard-asset-migrate.ts:551-556` | 「APT + right」 → 입주권으로 승격 ✅ |
| 엔진 라우팅 | `lib/tax-engine/redevelopment.ts:786-789` `isRedevelopmentActive` | propertyType ↔ subject 1:1 강제 ✅ |
| LTHD 분기 | `lib/tax-engine/redevelopment-lthd.ts:136-145` `computeRightLthd` | 입주권 전용 산식 분리 ✅ |
| 회귀 감시 | `e2e/right-to-move-in-asset-kind-axis.spec.ts` (5건) | A-1~A-5 ✅ |

⇒ **UI에서 「재개발APT」를 골라 입주권 계산에 도달하는 경로는 이미 없다.** `redevSubjectPatchForAssetKind`가 항상 `"apt"`로 덮고, 저장된 불일치 조합은 마이그레이션이 자산 종류를 승격시킨다.

### 2.2 남은 결함 — **역방향 누수** (입주권 화면에 완공APT 전용 입력이 노출된다)

`RedevelopmentBlock`이 두 종류의 공용 컴포넌트인데, 완공APT 전용 카드에 `isRightSubject` 가드가 없다. 그 값이 API·엔진까지 그대로 흘러간다.

#### 🔴 D-1 — ③-a 「청산금 수령분 단독 신고」(사례 46)가 **양도가액을 대체한다**

- **노출**: `RedevelopmentBlock.tsx:181-183` — 게이트가 `redevIsSuccessorMember !== "yes" && redevSettlementDirection === "receive"` 뿐. **입주권 + 청산금 수령(사례 38·39)에서 그대로 보인다.**
- **배관**: `transfer-tax-api.ts:175-176` `isRedevelopment`가 입주권을 포함 → `:231` `isReceiveOnly` 성립 → **`:267-268`이 `transferPrice`를 청산금 수령액으로 교체**.
- **엔진**: `receiveOnlyMode`는 **`computeAptReceive` 안에서만** 읽힌다(`redevelopment-split.ts:305,314). 입주권 분기에는 대응 구현이 **없다** ⇒ 「인가전·인가후 양도차익 0 강제」가 걸리지 않은 채 **양도가액만 줄어든다**.
- **⑧ validate**: `transfer-tax-validate-redev.ts:145,175`에 subject 가드 없음 → 통과시킨다.

**실측 (probe P-0b/P-0c)** — 입주권 · 양도가액 420,000,000 · 권리가액 300,000,000 · 청산금 수령 50,000,000:

| | API body `transferPrice` | 인가전 분 양도차익 | 청산금 분 양도차익 |
|---|---|---|---|
| ③-a OFF (정상) | 420,000,000 | 100,000,000 | **170,000,000** |
| ③-a **ON** | **50,000,000** | 100,000,000 | **0** |

⇒ **양도차익 170,000,000원이 사라진다(과소 신고 방향).**
`transferDate` 대체(`:276`)는 실측상 발생하지 않았다 — 짝이 되는 「소유권이전 고시일」 필드가 입주권에서 이미 숨겨져 있어(`RedevelopmentBlock.tsx:293-300`) 값이 비기 때문. **UI 가드 하나에만 의존하고 있는 상태**다.

#### 🔴 D-2 — §⑤ 「거주월수 분리 입력」(사례 45)이 **입주권 LTHD를 부풀린다**

- **노출**: `RedevelopmentBlock.tsx:387-389` → `RedevelopmentResidenceSplitSection.tsx:29` 가드는 `isOneHouseSingle === false` 뿐.
- **배관**: `transfer-tax-api-redev.ts:92-94`가 `newHouseResidenceMonths`를 subject 무관하게 송신(실측 `120` 도달 확인).
- **엔진**: `redevelopment-lthd.ts:132` `existingResidenceMonths = prior + new`가 그대로 `computeRightLthd`로 전달된다. 그런데 `new`는 **신축주택 거주월수**이고, 입주권은 신축이 존재하지 않는 시점의 양도다.

**실측 (probe P-0a)** — 취득 2009-04-09 · 인가 2016-10-23 · 1세대1주택:

| prior / new | 보유율 | 거주율 | **LTHD 합계** |
|---|---|---|---|
| 0 / 0 | 14% (표1) | 0% | **14%** |
| 24 / 0 | 28% (표2) | 8% | **36%** |
| 24 / **60** | 28% | 28% | **56%** |
| 0 / **120** | 28% | 40% | **68%** |

⇒ 신축 거주월수만 넣어도 입주권 LTHD가 **14% → 68%**까지 오른다(과다 공제 방향).

#### 🟠 D-3 — ④ 섹션 제목 조문 오표시

`RedevelopmentBlock.tsx:198` 제목이 「재개발 일정·금액 **(시행령 §166②1호)**」로 고정. 입주권 산식 근거는 **§166①1호·2호**다(`redevelopment-lthd.ts:206-208` 주석 · `computeRightLthd`).

#### 🟠 D-5 — 도달 불가 레거시 remap + 주석 드리프트

`transfer-tax-api.ts:244-245` `assetKind==="redevelopment_apt" && redevSubject==="right"`. 마이그레이션이 이 조합을 없앤 뒤라 도달 불가. `:238` 주석은 폐지된 모델(「assetKind는 사업 분류」)을 서술 중.

#### 🟡 D-4 — ③-c `exemptionEligibleAtApproval` (법령 판정 필요)

`RedevelopmentBlock.tsx:193-195`. 입주권에서도 **효과가 있다** — `redevelopment-lthd.ts:118-123`이 subject 분기 **이전에** `effectiveOneHouseSingle`을 깎아 표2→표1 강등을 일으킨다. 근거 예규(서면2016-법령해석재산-2705)가 「청산금 수령분」 판정이라 입주권 적용 가부는 **미확인**.

#### ⚪ D-6 — 명명 (`RedevelopmentBlock` · `redev*` 30여 필드)

입주권 전담 화면인데 이름이 전부 「재개발」. **범위 밖**(소비처 20+ · 계산 무영향).

> 🔑 **v1 계획서 정정**: D-1을 「조용히 무시되는 dead input(무해)」으로 적었으나 **틀렸다**. `isRedevelopment`가 입주권을 포함해 `transferPrice`가 실제로 교체된다. 우선순위가 D-2보다 **앞**이며(과소 신고 방향), **수정 지점도 엔진이 아니라 API 레이어**다.

---

## 3. 목표 (성공 기준)

1. 입주권 화면에는 **사례 36~39에 필요한 입력만** 남는다 — 완공APT 전용(사례 45·46) 카드 미노출.
2. 입주권 + ③-a ON 조합에서 **`transferPrice`가 교체되지 않는다** (D-1).
3. 입주권 LTHD가 `newHouseResidenceMonths`에 **반응하지 않는다** (D-2).
4. 재개발APT 화면·계산은 **무변경**(사례 40~48 회귀 0).
5. 각 항목에 anchor가 있고, **mutation probe로 그 anchor가 실제로 결함을 잡는지 실측**한다.

---

## 4. 작업 단계

### Phase 0 — 안전망 실측 ✅ **수행 완료** (2026-08-14, 이 계획서 §2.2)

- P-0a(D-2 LTHD 반응) · P-0b(API body 도달) · P-0c(양도차익 영향) 실측 완료. probe 파일은 삭제했다.
- **남은 Phase 0 항목**: 기존 사례 36~39 테스트의 가드를 무력화했을 때 **몇 건이 실패하는지** 센다.
  - verify: 0건이면 이 영역에 안전망이 없다는 뜻 → Phase 1 전에 characterization 테스트를 먼저 깐다 (memory `feedback_pre_change_safety_net_probe`).

### Phase 1 — D-1 (양도가액 대체) 차단 · **API 레이어**

> ⚠️ **엔진 가드로는 못 막는다.** 손상은 `transfer-tax-api.ts:267`에서 body를 만들 때 이미 일어나므로, 엔진에 도달한 시점에는 `transferPrice`가 이미 틀려 있다.

3중 패턴 3곳을 **함께** 막는다(한 곳만 고치면 침묵 분기 오판 — memory `feedback_store_default_vs_ui_display_fallback`):

| 층 | 수정 |
|---|---|
| UI | `RedevelopmentBlock.tsx:181` ③-a 게이트에 `!isRightSubject` 추가 |
| API | `transfer-tax-api.ts:231` `isReceiveOnly`에 subject 조건 추가 + `-api-redev.ts:101` `receiveOnlyMode` 미송신 |
| validate ⑧ | `transfer-tax-validate-redev.ts:145,175` — 입주권 + `redevReceiveOnlyMode==="yes"`는 **차단**(stale 저장값 대비) |

- ③-b 분양가 미리보기는 입주권에서도 유효(권리가액 ± 청산금 = 분양가) → **유지**.
- verify: P-0b/P-0c 재현 케이스에서 `transferPrice`가 420,000,000을 유지하고 청산금 분 양도차익이 170,000,000으로 남는다.
- 🔎 **법령 판정 불필요**: 엔진에 입주권용 `receiveOnlyMode` 구현이 **아예 없으므로**, 켜면 어떤 해석에서도 틀린 값이 나온다. 「입력을 막는다」는 코드 사실만으로 정당화된다.

### Phase 2 — D-2 (LTHD 부풀림) 차단 · **엔진 + UI**

| 층 | 수정 |
|---|---|
| UI | `RedevelopmentBlock.tsx:387` 게이트에 `!isRightSubject` 추가 |
| 엔진 | `redevelopment-lthd.ts:132` — subject==="right" 시 `prior`만 사용(`new` 무시) |

- 엔진 쪽을 **정본**으로 둔다 — UI/API 어느 경로로 들어와도 막히고, `multi/route.ts` 등 별도 조립 경로도 함께 덮는다(memory 관측 36367 「⑭ 이중 진실」).
- verify: P-0a 표에서 `prior=0/new=120`이 `prior=0/new=0`과 **같은 14%**가 된다.

### Phase 3 — D-3 / D-5 (표시 · 죽은 분기)

- ④ 섹션 제목·`LawArticleModal` 배지를 subject별로 분기: 입주권 → §166①, 완공APT → §166②1호.
- `transfer-tax-api.ts:237-245` 주석을 현행 축으로 정정.
- 죽은 분기 제거는 **grep 전수 후 판정** — 마이그레이션을 우회하는 진입 경로(다건 조립 · 직접 API 호출 · 테스트 fixture)가 하나라도 있으면 **남긴다**.

### Phase 4 — D-4 (법령 판정)

- KoreanLaw MCP로 **§166① · §95② · 서면2016-법령해석재산-2705** 본문을 읽고, `exemptionEligibleAtApproval`이 입주권 양도에도 적용되는 판정인지 확정한다.
- 「입주권 무관」 확정 시에만 ③-c에 `!isRightSubject` + `redevelopment-lthd.ts:118` 가드에 subject 조건 추가.
- **본문 미확인 시 현행 유지**하고 카드 문구만 입주권 문맥으로 보정한다.
  - 🛑 memory `feedback_unverified_authority_blocks_tax_change` · `feedback_no_unfavorable_application_without_legal_basis`.

### Phase 5 — 검증

- `npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/ __tests__/calc/`
- `E2E_PORT=<포트> npx playwright test e2e/right-to-move-in-asset-kind-axis.spec.ts` + 재개발 관련 spec
- 신규 anchor:
  - `right-receive-only-transfer-price.anchor.test.ts` (D-1 — API body `transferPrice` 불변)
  - `right-lthd-new-house-months-ignored.anchor.test.ts` (D-2 — 14% 고정)
  - E2E A-6 「입주권에는 §⑤ 거주월수·③-a 단독신고 카드가 없다」
  - E2E A-7 「재개발APT에는 둘 다 남는다」(대칭 회귀)
- **mutation probe**: Phase 1·2 가드를 각각 되돌려 신규 anchor가 **빨개지는지** 확인. 안 빨개지면 anchor가 잘못된 단계를 보고 있다(memory `feedback_anchor_observes_wrong_stage`).
- 브라우저 수동 확인: 입주권 → 사례 36·38 입력 → 계산 → 결과·신고서.

---

## 5. 하지 않을 것 (명시)

| 항목 | 이유 |
|---|---|
| `RedevelopmentBlock` **컴포넌트 2분할** | 두 화면의 공통 입력(② 출자자산 · ③ 청산금 방향 · ④ 일정·금액 · ⑤ 인가전 취득가액)이 대부분이다. 분할하면 §166 산식이 두 곳에 복제돼 dual-truth가 된다. **가드 추가로 충분**하다 |
| `redev*` 필드 개명 | 소비처 20+ · 계산 무영향 · memory `feedback_rename_same_name_two_axes` 위험 |
| `redevSubject` 완전 폐지 | PR #1245가 이미 「내부 파생값으로 유지」로 결론 |
| 부담부증여 × 입주권 | 별건 설계(`project_burdened_gift_redevelopment_assets`, 구현 미착수) |

---

## 5-A. 구현 결과 (2026-08-14)

| Phase | 상태 | 변경 |
|---|---|---|
| 0 | ✅ | 안전망 계수 실측 — 두 필드를 쓰는 기존 fixture는 **전부 `subject:"apt"`** ⇒ 입주권 누수 안전망 **0건**이었다 |
| 1 (D-1) | ✅ | UI 게이트 + `isReceiveOnly` subject 조건 + payload 미송신 + **마이그레이션 정규화** |
| 2 (D-2) | ✅ | UI 게이트 + **엔진 정본 가드**(`redevelopment-lthd.ts` right 분기는 `prior`만 사용) |
| 3 (D-3) | ✅ | ④ 섹션 제목·법령 배지 자산 종류별 분기 (§166① / §166②1호) |
| 3 (D-5) | ✅(부분) | 주석 드리프트 정정. **분기는 남겼다** — 3진입 경로 전수 확인 후 판정 |
| 4 (D-4) | ✅ **종결** | 예규 본문 확보 후 **현행 유지가 옳다고 확정** — 아래 §5-B |
| 5 | ✅ | anchor 10건 + mutation 5회 + 전체 유닛 + E2E + 브라우저 실측 |

### 계획 대비 변경된 결정 2건

1. **D-1의 validate 차단 → 마이그레이션 정규화.** 계획서는 `transfer-tax-validate-redev.ts`에서
   「입주권 + receiveOnly=yes」를 차단하라고 했으나, **UI 카드를 이미 숨긴 뒤라 사용자가 그 값을
   끌 수단이 없다** — 차단하면 빠져나올 수 없는 dead-end가 된다
   ([[feedback-ui-gate-removes-sole-input-path]]). `calc-wizard-asset-migrate.ts`에서 입주권 자산의
   두 필드를 비우는 쪽으로 바꿨다(anchor N-1~N-3).
2. **D-5 죽은 분기를 제거하지 않았다.** 진입 3경로(store persist merge `calc-wizard-store.ts:464` ·
   legacy migration `calc-wizard-migration.ts:120` · 이력 복원 `HistoryDetailDrawer.tsx:141`)가
   모두 `migrateAsset`을 거쳐 정상 경로에서는 도달하지 않지만, 마이그레이션을 우회해 조립된
   입력(직접 fixture)을 위한 안전망 값이 있다. 제거 이득이 없어 주석만 정정했다.

### 변경 파일

| 파일 | 내용 |
|---|---|
| `components/calc/transfer/RedevelopmentBlock.tsx` | ③-a·⑥ 게이트에 `!isRightSubject` · ④ 조문 분기 · 헤더 주석 현행화 |
| `lib/calc/transfer-tax-api.ts` | `isReceiveOnly`에 `subject === "apt"` 조건 · 레거시 remap 주석 정정 |
| `lib/calc/transfer-tax-api-redev.ts` | `isApt` 게이트 — `receiveOnlyMode`·`newHouseResidenceMonths` 미송신 |
| `lib/tax-engine/redevelopment-lthd.ts` | right 분기 거주월수 = `prior`만 (신축 거주 미산입) |
| `lib/stores/calc-wizard-asset-migrate.ts` | 입주권 자산의 완공APT 전용 2필드 정규화 |
| `e2e/right-to-move-in-asset-kind-axis.spec.ts` | A-6·A-7·A-8 추가 · seed에 1세대1주택·청산금 방향 파라미터 |

### 검증 실측

- **mutation probe 5회 전건 적발**: 엔진 가드↔L-1·L-3 / `transfer-tax-api` 가드↔R-1 /
  payload 가드↔R-2 / 마이그레이션↔N-1·N-2 / UI 게이트↔A-6.
- `npx tsc --noEmit` **0건** · `npm run lint` **0 errors**(변경 파일 warning 0).
- `npm test` **15,586 passed**(1,391 파일, 245초) — 회귀 0.
- E2E 재개발 5 spec **16건 전건 통과**.
- **브라우저 실측**: 입주권 화면에서 「청산금 수령분 단독 신고」·「거주개월 분리 입력」·「조합원 구분」이
  사라지고 ④ 제목이 `시행령 §166①`로 표시된다. 재개발APT는 셋 다 보존 + `§166②1호`.

---

## 5-B. D-4 종결 — 예규 본문 확보 후 판정 (2026-08-14)

**결론: ③-c 「비과세 보유 요건」은 입주권에서도 유지가 옳다. 숨겼다면 틀렸을 것이다.**

### 본문 확보 경로

법제처 `interpretation`·국세청 `nts` **검색 API로는 본문이 안 나온다**(`[NOT_SUPPORTED]`).
`search_decisions(domain="nts")`로 얻은 `taxlaw.nts.go.kr` 링크를 **Playwright로 열고**,
「상세내용」의 **PDF iframe**(`downloadPDFFile.do`)을 받아 `pdftotext -layout`으로 전문을 얻었다
([[feedback-nts-taxlaw-readable-via-playwright]]).

### 판정 근거 (본문 실독)

1. **입주권 단계의 해석이다.** 질의 원문이 「보유주택을 조합에 제공하고 **조합원입주권과 청산금**을
   지급받는 경우」이고, 사실관계 타임라인상 재건축 준공은 **예정**(미완공)이다.
   ⇒ 완공APT 전용이 아니라 **입주권 양도 경로에도 적용**된다.
2. **「양도일 기준」과 「인가일 기준」은 모순이 아니다.** 회신이 인용한 부동산거래관리과-380은
   전단에서 「청산금의 1세대1주택 비과세는 **양도일 현재**를 기준으로 적용」이라 하나, 후단이
   「**조합에 제공한** 시점까지 3년(당시 요건) 미만 보유면 §154① 미충족」이라 한다
   ⇒ **보유기간은 조합 제공 시점(= 관리처분계획인가일)까지** 잰다.
   현행 UI 문구(「보유주택수는 양도일 기준이나 보유·거주요건은 관리처분계획인가일 기준」)가 정확하다.
3. **고가주택 판정 대상도 정합.** 질의2 답변이 「§166**④1호**에 규정하는 관리처분계획에 따라
   정하여진 가격(**권리가격**)이 고가주택에 해당하는 경우」라 한다 —
   엔진의 `redevInfo.rightsValue > HIGH_VALUE_THRESHOLD`(`transfer-tax-redevelopment.ts:455`)와 일치.
   예규의 **9억은 2016년 당시 §156① 기준**이며 현행 12억이다. 엔진 상수는 이미 `1_200_000_000`.

### 함께 정정한 것

- **예규 날짜 오기 13곳** — `2017.02.13` → **`2016.09.12`**(생산일자. 등록일자는 2017.01.06).
  코드 5파일 · 테스트 1 · 설계문서 3에 퍼져 있었고, 사용자에게 보이는 인용 배지에도 노출돼 있었다
  ([[feedback-korean-law-citation-verify]]).
- **양도시기 재확인 — 결함 없음.** 「청산금 수령분의 양도시기 = **소유권이전고시일 다음날**」이
  이미 정확히 구현돼 있다: UI가 고시일을 입력받아 `addDays(d, 1)`로 저장하고
  (`RedevelopmentBlockCards.tsx:57`) 화면에 「고시일 + 1일」을 표시하며
  (`:71`) 엔진이 그 값을 양도일로 쓴다(`redevelopment-lthd.ts:288`).

### 남은 것 (미구현 — 의도된 범위 밖)

- **예외**: 관리처분계획인가일 **이후에도 주택인 상태가 유지**되면 양도일 기준을 적용한 사례가 있다
  (2026-08-14 도메인 확인). 현행 자동 판정은 **인가일 기준 단일**이다.
  예외 케이스는 사용자가 ③-c에서 직접 `yes`/`no`를 선택해 반영한다 — 그 취지를 카드 안내문에 명시했다.
  자동 판정 분기 신설은 **적용 사례의 범위가 확정되지 않아** 하지 않는다.

---

## 6. 사용자 확인 1건

실측 결과 **「재개발APT를 골라 입주권 계산에 도달하는 경로」는 PR #1245로 이미 닫혀 있다.** 지금 남은 것은 반대 방향 누수(D-1·D-2)이고, 둘 다 **세액이 바뀌는 실결함**이다.

혹시 재개발APT를 골랐을 때 입주권 계산 결과가 나오는 화면을 실제로 보셨다면 별개 결함이므로, 재현 절차(자산 종류 · 입력값 · 결과 화면)를 알려주시면 Phase 0에 추가한다.
