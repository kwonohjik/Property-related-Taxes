# 대주주 판정 UI 재배치 — 계획

- 작성일: 2026-09-08
- 브랜치: `chore/stock-major-shareholder-ui` (worktree `.claude/worktrees/stock-major-shareholder`)
- 대상: `components/calc/stock-transfer/MajorShareholderBlock.tsx` (708줄) ·
  `MajorShareholderCheckpointHints.tsx` (217줄) · `app/calc/stock-transfer-tax/steps/Step1.tsx` (331줄)
- 선행 계획: `docs/00-pm/stock-major-shareholder-toggle-removal.plan.md`
  (토글 폐지 → 자동 판정 전환. 이 계획은 그 위에 **배치**만 다시 그린다)

---

## 1. 문제 — 화면이 산만한 이유

사용자 제보: 「대주주 판정 UI가 매우 산만하다. 판정 기준이 중간에 나오고, hint도 산만하고,
**대주주 판정과 관계없는 부분도 같은 섹션에 묶여 있다**」.

실측으로 원인을 8건으로 갈랐다. 전부 현행 코드에서 확인한 것이다.

| # | 문제 | 근거 (file:line) |
|---|---|---|
| P1 | **기준이 입력 중간에 낀다** — 「현재 적용 기준(1.0%·50억)」·「시기별 이력」이 기준일 입력 **뒤**, 지분율 입력 **앞** | `MajorShareholderBlock.tsx:331-363`·`:366-384` |
| P2 | **예외가 기본 흐름 2번째 자리** — 대개 OFF인 「특수 판정 기준일」이 rose(경고 톤)로 상단 | `:285-325` |
| P3 | 🔴 **꺼진 기능의 hint가 항상 보인다** — `SpecialEntityHintsCard`가 ToggleCard **바깥**(형제)이라 토글 OFF여도 렌더 | `:325` 닫힘 → `:328` |
| P4 | **hint 4장이 4색**(sky·emerald·rose·amber) — tone 고유 의미가 무너짐. 시총(4건)·발행주식총수(2건)는 인접한 두 장 | `:460`·`:463` · `Hints.tsx:24-29` |
| P5 | **자동계산 버튼이 채울 칸보다 위** — 키움 카드 → 경고 → 「본인 단독 시가총액」 순 | `:440-449` → `:452-457` |
| P6 | **총 발행주식수가 3곳** — Step1 §3에 required로 있는데 §5가 본인용·합산용으로 또 물음 | `Step1.tsx:261-267`·`:272-278` vs `:408-414`·`:494-500` |
| P7 | **장내/장외 토글은 판정이 아니다** — 증권거래세·과세대상 축 | `:644-663` |
| P8 | **안내문이 시선을 왕복시킨다** — 헤더 배지에 이미 결과가 있는데 "판정 결과 박스에서 확인하세요" | `:702-704` vs `:680-693` |

### 1-1. 섹션 경계 오류 — 판정과 무관한 것이 §5에 있다

| 항목 | 실제 주제 | 위치 |
|---|---|---|
| 거래소 장내 거래 토글 | 증권거래세 탄력세율(증권거래세법 §8②)·과세대상(§94①3 가목1 단서) | `:644-663` |
| 세율 부칙 hint | 세율 §104① 20%/25% (「본 앱은 누진세율 통일 적용」으로 끝나는 정보성 문장) | `Hints.tsx:164-172` |
| 총 발행주식수 ×2 | 공용 입력 (§3에 이미 있음) | `:408-414`·`:494-500` |

hint 카드 제목이 내용과 어긋난다: **「합병·분할·간접투자·세율 부칙 안내 (4건)」인데
합병·분할 항목이 하나도 없다**. 실제 4건은 상장 전환 / §178 투자기구 / 창업투자조합 /
세율 부칙으로, 서로 다른 3개 주제다(`Hints.tsx:140-172`).

### 1-2. 반대 방향 — 판정에 쓰이는데 엉뚱한 데 묶였다 🔴 결함

**대차주식·사모펀드 간접소유 입력에 접근 경로가 없다.**

- **엔진**: `lib/tax-engine/stock-transfer/stock-classification.ts:159`
  ```ts
  const effectiveShareRatio = effectiveLargestGroup
    ? Math.max(input.selfShareRatio + ratioAugment, input.combinedShareRatio + ratioAugment)
    : input.selfShareRatio + ratioAugment;      // ← 합산 OFF에서도 본인 지분율에 가산
  ```
  `:156` 주석도 「F-15·F-16 가산은 본인·합산 **모두**에 적용」이라고 명시한다.
  `effectiveLargestGroup = input.isLargestShareholderGroup || forcedCombinedJudgment`(`:104`)이고,
  `forcedCombinedJudgment`는 본인 지분율·시총이 **둘 다 0**일 때만 참(`:100-103`)이므로,
  본인 지분율이 있으면 합산 OFF 상태 그대로 `selfShareRatio + ratioAugment`가 쓰인다.

- **엔진 앵커가 이미 그 케이스를 검증한다**:
  `__tests__/tax-engine/stock-transfer/textbook-alignment-augmentation.test.ts:94-108` (PHF-03)
  — `isLargestShareholderGroup: false`(`:26` 기본값) + `selfShareRatio: 0.015` +
  `lentSharesCount: 600` → 합계 2.1% ≥ 코스닥 2% → `taxCategory: "listed_major"`.
  PHF-04(`:111-`)는 사모펀드로 같은 검증.

- **UI**: 그 입력칸은 「본인+특수관계인 합산」 ToggleCard의 children(`:529-573`)이고
  `components/calc/inputs/ToggleCard.tsx:303`이 `{checked && children}`이라
  **토글 OFF면 렌더조차 되지 않는다**.

⇒ 「본인 단독 판정 + 대여 중인 주식 보유」는 합산 토글을 사실과 다르게 켜지 않는 한 입력 불가.
메모리 `feedback_ui_gate_removes_sole_input_path` 패턴의 재발이다.

**나머지 오배치**:

| 항목 | 현재 | 주제상 있어야 할 곳 |
|---|---|---|
| §178 투자기구 · 창업투자조합 hint | 특수 기준일 hint 카드 (`Hints.tsx:150-163`) | **합산 범위**(D) |
| 상장 전환 hint | 같은 카드 (`Hints.tsx:142-148`) | **임계 선택**(A) |

---

## 2. 사용자 결정 (2026-09-08 확정)

| Q | 결정 |
|---|---|
| Q1 세율 부칙 hint | **삭제** |
| Q2 총 발행주식수 | **§5에서 완전히 빼고 §3 값을 사용** |
| Q3 대차·PEF 결손(D-1) | **이번 작업에서 함께 수정** |

---

## 3. 현행 배치 (실측) → 목표 배치

### 3-1. 현행 — 기본 화면(모든 토글 OFF)에 17블록

```
①  헤더 "대주주 여부 — 자동 판정" + 배지               :696-699
②  안내문 "…판정 결과 박스에서 확인하세요"              :702-704
③  직전 사업연도 종료일 *                              :259-264
④  ⚠️ 비거래일 경고 (조건부)                           :268-282
⑤  [토글 OFF] 특수 판정 기준일 (rose)                  :285-325
⑥  💡 합병·분할·간접투자·세율 부칙 (4건) (rose)         :328   ← 토글 밖
⑦  현재 적용 기준 1.0%·50억 (violet)                   :331-363
⑧  [▼] 시기별 기준 이력 (slate)                        :366-384
⑨  (라디오) 지분율 직접 / 주식수로 계산                 :388-398
⑩  본인 단독 지분율                                    :400-405
⑪  키움 시가총액 자동 산정 (+경고)                      :440-449
⑫  본인 단독 시가총액                                  :452-457
⑬  💡 시가총액 산정 포함/제외 (4건) (sky)               :460
⑭  💡 발행주식총수 산정 포함 (2건) (emerald)            :463
⑮  [토글 OFF] 본인+특수관계인 합산 (violet)            :466-578
⑯  대주주 자동 판정 결과 박스                           :581-630
⑰  [토글 ON] 거래소 장내 거래 (emerald)                :644-663
```

### 3-2. 목표 — §5는 판정만, 무관한 것은 밖으로

```
§5 대주주 판정 (§157 / §167의8①2호)          ← 기본 화면 10블록
  A. 기준
     1  헤더 + 판정 배지                        (안내문 ② 삭제)
     2  현재 적용 기준 1.0%·50억 · 코스피 2024-01-01~
        └ [▼ 시기별 기준 이력]                  (⑧을 기준 박스 안으로 흡수)
        └ 💡 상장 전환 (임계는 양도일 기준 시장)  (Hints 4건 중 1건 이동)
  B. 기준일
     3  직전 사업연도 종료일 *
     4  ⚠️ 비거래일 경고 (조건부)
     5  [토글 OFF] 특수 판정 기준일 (합병·분할·신설법인)
        └ (ON일 때만) 사유 라디오 + 기준일자      (⑥ 카드는 소멸 — 아래 C-4)
  C. 본인 단독 측정값
     6  (라디오) 지분율 직접 / 주식수로 계산
     7  본인 단독 지분율 · (주식수 모드면) 본인 보유 주식수
        └ 발행주식 총수는 §3 값을 읽기만 한다     (Q2)
     8  본인 단독 시가총액  [🔍 자동계산]         (⑪을 칸 옆/아래로)
     9  대차주식 수 · 사모펀드 간접소유 주식 수    ← 합산 토글 밖 (D-1)
    10  [▼ 💡 시가총액·발행주식총수 산정 (6건)]   (⑬+⑭ 병합, sky 단일)
  D. 합산 (조건부)
    11  [토글 OFF] 본인+특수관계인 합산 최대주주그룹
        └ (ON일 때만) 합산 지분율·합산 시가총액
        └ 💡 합산 시 포함 (§178 투자기구·창업투자조합·비거주자)
  E. 결과
    12  대주주 자동 판정: ✓ … → 대주주 해당

§6 거래 구분 · 증권거래세 (신설)              ← ⑰ 이관
     장내/장외 토글 (설명문이 대주주 여부로 갈리므로 §5 바로 뒤에 둔다)

삭제: 세율 부칙 hint (Hints.tsx:164-172)      ← Q1
```

기본 화면 블록 **17 → 10**(§5 기준). hint 톤이 sky 하나로 줄어 rose·amber·emerald가
각각 특수분기·경고·장내거래 의미를 되찾는다.

---

## 4. 변경 목록

### C-1. 판정 기준을 맨 위로 (P1)

- `:331-363` 기준 박스와 `:366-384` 이력 펼침을 `innerContent` 최상단으로 이동.
- 이력 펼침은 독립 카드를 없애고 기준 박스 **안**의 토글로 넣는다.
- **왜**: 「지금 나에게 걸리는 선」을 먼저 봐야 아래 입력이 무엇을 향한 값인지 안다.
  현행은 값을 다 넣은 뒤 결과 박스(`:614-621`)가 기준을 **다시** 출력한다 — 위치가 틀렸다는 신호.
- 결과 박스의 기준 재출력은 **유지**한다(결과 판단 근거를 결과 옆에 두는 것은 정당).

### C-2. 안내문 삭제 (P8)

- `:702-704` 삭제. 기준 박스가 위로 오면 「아래에서 확인하세요」가 가리킬 곳이 없다.

### C-3. 특수 판정 기준일을 기준일 바로 아래로 (P2)

- `:285-325` 토글을 `③ 직전 사업연도 종료일` + `④ 비거래일 경고` 다음에 배치.
- 「기본 기준일 → 아니면 특수 기준일」이 한 묶음. 현행은 그 사이에 hint 카드가 끼어 갈라져 있다.
- ⚠️ 설명문 문자열은 건드리지 않는다 — `major-judgment-basis-radio.anchor.test.tsx`
  MJ-4·MJ-5(`:50-`·`:65-`)가 「화면 문자열에 `priorYearEndDate` 없음」+「필드 이름이 그 자리를
  대신함」을 고정한다.

### C-4. `SpecialEntityHintsCard` 해체 (P3·P4·1-1)

4건이 3주제로 섞여 있으므로 카드를 없애고 항목별로 이사시킨다.

| 항목 | `Hints.tsx` | 이동처 |
|---|---|---|
| 상장 전환 | `:142-148` | A. 기준 박스 안 |
| §178 투자기구 | `:150-155` | D. 합산 hint(`CombinedShareHintsCard`)로 합류 |
| 창업투자조합 | `:157-163` | D. 합산 hint로 합류 |
| 세율 부칙 | `:164-172` | **삭제** (Q1) |

- `SpecialEntityHintsCard` export 제거. 사용처는 `MajorShareholderBlock.tsx:52`(import)·`:328`(렌더)
  **2곳뿐**(전수 grep 확인 — `components/`·`app/`·`__tests__/`·`e2e/`에 다른 참조 없음).
- 합류 후 `CombinedShareHintsCard` 제목: 「특수관계인 합산 시 포함 항목 (3건)」 → **(5건)**.

### C-5. 시총·발행주식총수 hint 병합 + 톤 통일 (P4)

- `MarketCapHintsCard`(4건) + `IssuedSharesHintsCard`(2건) → 한 장. 소제목 2개로 나눈다.
- 제목: 「💡 시가총액·발행주식총수 산정 시 포함·제외 (6건)」, tone **sky** 단일.
- `HINT_CARD_TONE`(`Hints.tsx:24-29`)에서 미사용이 된 톤 키는 남은 사용처를 확인한 뒤 정리한다
  (amber는 `CombinedShareHintsCard`가 계속 쓴다 — rose·emerald는 사용처가 사라진다).

### C-6. 키움 자동계산 버튼을 시총 칸에 붙인다 (P5)

- `:440-449` `KiwoomMarketCapHelper`를 `:452-457` `CurrencyInput` **아래**로 이동하거나,
  `CurrencyInput`의 우측 액션으로 배치.
- ⚠️ **확인 필요(V-1)**: `CurrencyInput`이 우측 액션 슬롯을 지원하는지 미확인.
  지원하지 않으면 「입력칸 바로 아래 버튼 줄」로 간다 — 컴포넌트를 새로 만들지는 않는다.

### C-7. 총 발행주식수를 §5에서 제거 (P6 · Q2)

- `:408-414`(본인 모드) · `:494-500`(합산 모드) 두 `FieldCard` 삭제. §3(`Step1.tsx:261-267`·
  `:272-278`)이 단일 소스가 된다.
- 🔴 **함께 옮겨야 하는 배선**: 현행 §5의 그 필드 onChange는 `handleSharesChange`(`:411`·`:497`)를
  불러 **지분율을 재산출**한다. §3의 발행주식 총수 onChange는 단순 `onChange({ totalIssuedShares: v })`
  뿐이다(`Step1.tsx:264`·`:274`) — 그대로 지우면 「§3에서 발행주식수를 고쳐도 지분율이 안 따라오는」
  회귀가 생긴다. §3 onChange에 재산출을 이식해야 한다.
- `computeShareRatioFromShares`는 `MajorShareholderBlock`에서 export 중이고
  `share-ratio-calc.test.ts`(SR-1~SR-8)가 순수 함수로 검증한다 — **함수는 건드리지 않는다**.
  재산출 호출 지점만 옮긴다.
- §5 주식수 모드에는 「발행주식 총수 N주 (§3에서 입력)」 읽기 전용 표시를 남겨 산출식
  `보유 ÷ 총발행 × 100`의 분모가 무엇인지 보이게 한다.
- **E2E 영향 없음(실측)**: `e2e/stock-transfer-securities-tax.spec.ts:114`·`:358`,
  `stock-transfer-halt-acquisition.spec.ts:44`, `stock-transfer-165-5-capital-event.spec.ts:47`이
  `hasText: "발행주식 총수"`로 §3을 잡는다. §5의 라벨은 「총 발행주식수」로 **어순이 달라**
  substring 매칭되지 않는다 — 즉 이 spec들은 원래 §3만 보고 있었다.

### C-8. 대차·PEF를 합산 토글 밖으로 (D-1 · Q3)

- `:529-573` 블록을 ToggleCard children에서 꺼내 **C. 본인 단독 측정값** 하단(시총 다음)에 둔다.
- 게이트는 `f15f16Eligible`(`:252-255`, 양도일 ≥ 2013-02-15) 그대로 — 합산 여부와 무관해진다.
- 안내문 「✓ 양도일 2013.2.15. 이후 — 엔진이 지분율에 자동 가산합니다」(`:567-572`)는 유지하되,
  **본인·합산 양쪽에 가산됨**을 문구에 반영한다(엔진 `:156` 주석과 일치시킨다).
- ⚠️ **확인 필요(V-2)**: `lib/calc/stock-transfer-tax-validate.ts:215-233`의 대차·PEF 검증이
  합산 토글과 무관하게 도는지 — 무관하면 ⑧ 변경 불필요, 토글 조건이 걸려 있으면 함께 푼다.

### C-9. 장내/장외 토글을 §6으로 분리 (P7)

- `:644-663`을 `MajorShareholderBlock`에서 꺼내 `Step1.tsx` sections에 별도 항목으로 추가.
- 제목: 「거래 구분 · 증권거래세 (§94①3 가목1 단서 · 증권거래세법 §8②)」.
- 표시 조건은 현행 그대로 — 상장 3시장 && `!isKOTCTrading`.
- 순서는 대주주 판정 **바로 뒤**. 설명문이 `judgment.isMajor`로 4갈래 갈리므로(`:653-659`)
  판정보다 앞에 두면 문맥이 무너진다.
- 🔴 **전달 문제**: 설명문이 `judgment`(블록 내부 useMemo `:146-172`)에 의존한다. 섹션을 분리하면
  그 값을 어떻게 얻을지 정해야 한다.
  - 안 A: 새 컴포넌트가 `computeAutoIsMajor`(`major-sync.ts`)를 직접 호출 — 판정 로직 단일 소스 유지.
  - 안 B: `form.isMajorShareholder`(자동 동기화된 store 값)를 읽는다 — 이미 `handleAutoSyncChange`가
    입력마다 갱신한다.
  - **선택**: 안 A. 메모리 `feedback_ui_engine_dual_truth_avoidance`·`single-source-engine-helper`에
    따라 화면이 판정을 **재구성하지 않고** 엔진 헬퍼를 부른다.
  - ⚠️ **확인 필요(V-3)**: `computeAutoIsMajor`가 `undefined`를 반환하는 조건(자동 판정 미지원)에서
    설명문을 어떻게 쓸지 — 현행 `judgment.isMajor`는 `threshold === null`이면 `false`로 떨어진다
    (`:148-150`). 같은 문구가 나오도록 맞춘다.

---

## 5. 안전망 실측 (Do 진입 전 필수)

메모리 `feedback_pre_change_safety_net_probe` — **바꾸기 전에 무엇이 잡아주는지 잰다.**
선행 계획에서 「토글 폐지 뮤테이션에 331파일 3130테스트가 전부 통과」한 전례가 있다.

| probe | 방법 | 기대 |
|---|---|---|
| SN-1 | `SpecialEntityHintsCard` 렌더를 지운 채 전건 실행 | 실패 0건이면 **안전망 없음** → 앵커 신설 |
| SN-2 | §5의 총 발행주식수 FieldCard를 지운 채 실행 | 〃 |
| SN-3 | 대차·PEF 블록을 합산 토글 밖으로 옮긴 채 실행 | 〃 |
| SN-4 | 장내 토글을 지운 채 `stock-transfer-securities-tax.spec.ts` 실행 | E2E가 잡는지 확인 |

⚠️ 뮤테이션 probe의 `git checkout`은 커밋 안 된 작업 변경을 날린다
(`feedback_mutation_probe_git_checkout_destroys_wip`) — 워크트리에서 WIP 커밋 후 수행.

---

## 6. 앵커 계획

파일: `__tests__/components/calc/stock-transfer/major-shareholder-layout.anchor.test.tsx` (신설, jsdom)

배치를 고정하는 앵커는 **순서**를 단언한다(DOM 위치 비교). 문자열 존재만 보면 이동을 감지하지 못한다.

| ID | 단언 | 대응 |
|---|---|---|
| L-1 | 「현재 적용 기준」 노드가 「직전 사업연도 종료일」보다 **앞** | C-1 |
| L-2 | 기본 화면(토글 OFF)에 「합병·분할·간접투자」 문자열이 **없다** | C-4 |
| L-3 | 「세율 부칙」·「20% 단일」 문자열이 **어디에도 없다** | C-4/Q1 |
| L-4 | §5 안에 「총 발행주식수」 **입력칸(input)이 없다** (읽기 전용 텍스트는 허용) | C-7 |
| L-5 | Step1 §3에서 발행주식 총수를 바꾸면 `selfShareRatio` 재산출 patch가 실린다 | C-7 배선 이식 |
| L-6 | 합산 토글 **OFF** 상태에서 「대차주식 수」 입력칸이 렌더된다 | C-8 / D-1 |
| L-7 | 「거래소 장내 거래」가 `MajorShareholderBlock` 렌더 결과에 **없다** | C-9 |
| L-8 | Step1 렌더에는 「거래소 장내 거래」가 **있다**(섹션으로 이동했을 뿐 사라지지 않았다) | C-9 |
| L-9 | 시총 hint 카드가 1장이고 제목이 「(6건)」 | C-5 |

- L-7과 L-8은 **짝**이다. L-7만 두면 「지워버리기」로도 통과한다
  (`feedback_negative_anchor_needs_positive_twin`).
- L-2도 마찬가지로 「토글 ON이면 나타난다」 짝을 함께 둔다.
- 기존 앵커 `stock-major-shareholder-toggle-removal.test.tsx`(T-1·T-2·T-6·T-7)와
  `major-judgment-basis-radio.anchor.test.tsx`(MJ-1~MJ-5)는 **그대로 통과해야 한다** —
  재배치가 그 계약을 깨면 배치가 잘못된 것이다.

---

## 7. 14 동기화 지점 점검

이 작업은 **엔진 input·result를 바꾸지 않는다**. 폼 필드 추가·삭제도 없다
(총 발행주식수는 필드가 아니라 **입력 위젯**만 §3으로 일원화). 따라서 ①②③④⑨⑩⑪⑫⑬⑭는
변경 대상이 아니다. 실제로 손대는 지점:

| 지점 | 변경 | 비고 |
|---|---|---|
| ⑤ UI 위젯 | 배치 전면 | 본 계획의 본체 |
| ⑧ validation | **확인만** (V-2) | 대차·PEF 검증이 합산 토글에 묶여 있으면 푼다 |

⚠️ C-8은 **입력 경로를 여는** 변경이다. 메모리
`feedback_ui_gate_expansion_activates_latent_defect` — 게이트 확장이 잠자던 결함을 깨울 수 있다.
합산 OFF + 대차주식 입력 조합으로 ④(API 변환)·⑫(Zod)가 값을 통과시키는지 실측한다.
`stock-transfer-tax-api.ts:133-134`가 무조건 매핑하므로 통과가 예상되나 **확인 필요(V-4)**.

---

## 8. 미검증 항목 — **해소 완료 (2026-09-08)**

| ID | 내용 | 결과 |
|---|---|---|
| V-1 | `CurrencyInput` 우측 액션 슬롯 | ❌ **없다**. `CurrencyInput.tsx:45-58` props는 label·value·onChange·placeholder·required·hint·disabled·hideUnit·hideLabel·allowNegative뿐 ⇒ **버튼은 입력칸 아래 줄**로 배치. 컴포넌트 신설·확장 안 함 |
| V-2 | 대차·PEF validate가 합산 토글에 묶였는가 | ❌ **안 묶였다**. `stock-transfer-tax-validate.ts:214-235`는 `form.lentSharesCount` 값만 본다 ⇒ **⑧ 변경 불필요** |
| V-3 | `computeAutoIsMajor`의 `undefined` 조건 | `major-sync.ts:43-50`(시장 4종 밖) · `:54`(양도일·기준일 미입력) 2가지. §6 표시 조건이 상장 3시장이라 전자는 배제되고, 후자는 현행 `judgment`(`MajorShareholderBlock.tsx:148-150`)도 `false`로 떨어지므로 **`undefined`→`false` 취급 시 현행과 동일** ⇒ 안 A 확정. **단 D-2 발견(아래)** |
| V-4 | 합산 OFF + 대차주식이 ④⑫⑬⑭를 통과하는가 | ✅ **통과**. Zod `stock-transfer-tax-schema.ts:210-211` `optional().default(0)` · 매핑 `stock-transfer-engine-input.ts:36-37` · 변환 `stock-transfer-tax-api.ts:133-134` — 어디에도 합산 토글 조건이 없다 ⇒ **④⑫⑬⑭ 변경 불필요** |
| V-5 | `HINT_CARD_TONE` rose·emerald 미사용화 | 병합 후 grep으로 확정 (C-5 완료 시점) |

---

## 8-1. 🔴 D-2 — D-1을 고치면 **화면과 엔진이 갈린다** (V-3에서 발견)

`feedback_ui_gate_expansion_activates_latent_defect`가 예고한 그대로다. 게이트를 여는 순간
잠자던 괴리가 활성화된다.

- **엔진**은 대차·PEF를 지분율에 가산한다 — `stock-classification.ts:142-153`의 `ratioAugment`가
  `:159`에서 `selfShareRatio + ratioAugment`로 들어간다.
- **화면**은 가산하지 않는다 — `major-sync.ts:63-77`(배지·store 동기화)과
  `MajorShareholderBlock.tsx:151-161`(판정 미리보기 useMemo) 어디에도 `ratioAugment`가 없다.
- 지금까지 드러나지 않은 이유는 **입력 경로가 없어 값이 늘 `"0"`**이었기 때문이다
  (`calc-wizard-stock-form.ts:508` 기본값).

⇒ C-8로 경로를 열면 「본인 1.5% + 대차 600주(0.6%)」 코스닥 2024 케이스에서:

| | 판정 |
|---|---|
| 화면 배지·판정 박스 | 1.5% < 2% → **비대주주** |
| 엔진 (PHF-03 앵커) | 2.1% ≥ 2% → **대주주** |

게다가 `stock-classification.ts:170-175`가 `input.isMajorShareholder !== isMajor`일 때
`mismatchWarning`을 낸다. `isMajorShareholder`는 화면이 `computeAutoIsMajor`로 채운 값이므로
**사용자가 없앨 수 없는 상시 경고**가 뜬다 — `major-sync.ts:32-35`에 기록된 비상장 벤처 40억
사고와 **구조가 같다**(같은 술어를 다른 인자 집합으로 부름, `feedback_shared_predicate_argument_parity`).

### D-2 수정 방침 — 산식을 복제하지 않는다

`single-source-engine-helper` 정책상 화면이 가산 산식을 **다시 쓰면 안 된다**.

- `stock-classification.ts:142-153`의 가산 계산을 **순수 헬퍼로 추출**해 export하고,
  엔진 본체와 화면(`computeAutoIsMajor` · `judgment` useMemo)이 **같은 함수**를 부른다.
- 엔진 본체는 그 헬퍼를 호출하도록 교체 — **동작은 그대로**이며
  `textbook-alignment-augmentation.test.ts` PHF-01~06이 그것을 지켜준다.
- 추출 대상: 양도일 게이트(2013-02-15) · `lent + pef` · `totalIssuedShares > 0` 가드 ·
  `augmentedShares / totalIssuedShares`.

### 앵커 추가

| ID | 단언 |
|---|---|
| L-10 | 합산 OFF + `selfShareRatio 1.5%` + `lentSharesCount 600` + `totalIssuedShares 100,000` (코스닥·양도일 2024-06-01) → **화면 배지가 「대주주」** |
| L-11 | 같은 입력에서 `computeAutoIsMajor`가 `true` — 엔진 PHF-03과 **같은 결론** |
| L-12 | 양도일 2013-02-14이면 가산되지 않는다 (게이트 회귀 차단) |

---

## 8-2. 범위 밖으로 남기는 발견 (기록만)

`computeAutoIsMajor`(`major-sync.ts:65-70`)는 `isLargestShareholderGroup`이 false면 합산값을
`0`으로 버린다. 그런데 엔진은 `forcedCombinedJudgment`(`stock-classification.ts:100-104`)로
**본인 지분율·시총이 둘 다 0이고 합산값이 있으면 합산을 강제 적용**한다. 이 조합에서도 화면과
엔진이 갈린다.

- **D-1/D-2와 무관하게 이미 존재하는 괴리**다 — 이번 재배치가 만들지 않는다.
- 따라서 **이번 범위에서 고치지 않는다**(Surgical Changes). 별도 항목으로 남긴다.
- 다만 D-2 헬퍼 추출 시 같은 자리를 지나므로, 고칠 때 재사용할 수 있게 헬퍼 경계를 잡는다.

---

## 9. 실행 순서

```
1. ✅ V-1~V-4 해소 (읽기만)                  → 완료 2026-09-08. D-2 발견 (§8-1)
2. SN-1~SN-4 뮤테이션 probe                 → verify: 안전망 유무 실측 기록
3. 앵커 L-1~L-12 작성 (현행 기준 RED 확인)    → verify: 재배치 전에 의도대로 실패
4. C-4·C-5 (hint 해체·병합·삭제) + V-5       → verify: L-2·L-3·L-9 GREEN
5. C-1·C-2·C-3 (기준 상단화·안내문·기준일)   → verify: L-1 GREEN, MJ-1~5 유지
6. C-7 (총 발행주식수 §3 일원화 + 배선 이식)  → verify: L-4·L-5 GREEN, SR-1~8 유지
7. D-2 (가산 헬퍼 추출 — 엔진·화면 단일 소스) → verify: PHF-01~06 GREEN, L-11 GREEN
8. C-8 (대차·PEF 게이트 해제)                → verify: L-6·L-10·L-12 GREEN
9. C-6 (키움 버튼 — 입력칸 아래 줄, V-1)      → verify: 수동 확인
10. C-9 (장내 토글 §6 분리)                  → verify: L-7·L-8 GREEN
11. 전건 회귀                               → verify: npx vitest run + E2E_PORT=3200 관련 spec
```

⚠️ **7(D-2)이 8(C-8)보다 먼저다.** 순서를 뒤집으면 게이트를 연 상태로 화면·엔진이 갈린
구간이 생겨, 그 사이에 만든 앵커가 「갈린 상태」를 정답으로 굳힐 수 있다.

- 4~9는 각각 커밋을 나눈다 — 배치 변경은 되돌릴 일이 생기기 쉽다.
- `MajorShareholderBlock.tsx`는 현재 **708줄**이다. C-9로 장내 토글(약 20줄)이 빠지고
  C-7로 필드 2개가 빠지지만 여전히 700 근처다. 분리 트리거는 800이므로 **강제 분리 대상은 아니다**
  (File Size Policy — 「700~749에 안정적으로 앉은 파일을 미리 쪼개지 않는다」).
  다만 이미 여는 파일이므로 A~E 그룹이 자연 이음매가 되면 기회주의적 분리를 검토한다.

## 10. 하지 않는 것

- 판정 **로직** 변경 없음. 임계·산식·엔진 호출은 그대로다.
- `computeShareRatioFromShares`·`computeAutoIsMajor` 시그니처 변경 없음.
- hint **내용**(조문·해석례 인용) 수정 없음 — 세율 부칙 1건 삭제만 예외이고, 이는 사용자 결정.
- 색·톤 토큰 신설 없음. 기존 `tones.ts` 범위에서 재배정만.

---

## 11. 안전망 실측 결과 — **0건** (2026-09-08 실측)

뮤테이션 7종을 **동시에** 적용하고 전건 vitest를 돌렸다.

| 뮤테이션 | 대상 (원본 줄) |
|---|---|
| SN-1a | `SpecialEntityHintsCard` 렌더 제거 (327-328) |
| SN-1b | `MarketCapHintsCard`·`IssuedSharesHintsCard` 렌더 제거 (459-463) |
| SN-1c | `CombinedShareHintsCard` 렌더 제거 (575-576) |
| SN-2a | 본인 모드 「총 발행주식수」 FieldCard 제거 (408-414) |
| SN-2b | 합산 모드 「총 발행주식수」 FieldCard 제거 (494-500) |
| SN-3 | 대차·PEF 블록 제거 (529-573) |
| SN-4 | 거래소 장내 거래 토글 제거 (644-663) |

**결과 (`--reporter=json`)**:

```
numTotalTestSuites  7266
numTotalTests      20261
numPassedTests     20244      (차이 17건은 skip/todo)
numFailedTests         0
success             true
```

`npx tsc --noEmit`도 **0건**이었다 — 미사용 import가 남아도 tsc는 잡지 않는다.

⇒ **이 화면의 배치를 지키는 안전망은 존재하지 않는다.** 708줄 중 88줄을 지워도 아무도 모른다.
선행 계획의 「토글 폐지 뮤테이션에 3130테스트 전건 통과」와 같은 결과이며, 그때보다 모집단이
6배 커졌는데도 여전히 0건이다.

⇒ 재배치에 앞서 **L-1~L-12를 반드시 먼저 세운다**. 앵커 없이 옮기면 이 작업의 결과물도
다음 사람이 자유롭게 지울 수 있다.

**부수 확인**: E2E도 장내 토글을 조작하지 않는다 — `stock-transfer-securities-tax.spec.ts`를
비롯한 어느 spec에도 「장내」·`isOnMarketTransaction` 문자열이 없고, default `true`에 의존만 한다.
따라서 토글을 §6으로 옮겨도 E2E는 통과한다(감지도 못 한다).

**C-6 확정 (V-1 후속)**: `FieldCard`에는 `trailing` slot이 있지만(`FieldCard.tsx:12`),
`KiwoomMarketCapHelper`는 버튼이 아니라 **219줄 카드**로 조회 산출내역(종가·주식수·시총·임계
판정)까지 담는다(`:158-210`). `trailing`에 넣을 크기가 아니므로 **시총 입력칸 → 키움 카드**
순서 교체로 간다.

---

## 12. 구현 결과 (2026-09-08 완료)

### 커밋

| 커밋 | 내용 |
|---|---|
| `a9dc7d34` | 계획 문서 (진단 8건·결함 2건) |
| `839b786b` | 앵커 L-1~L-12 신설 — 현행 기준 **19 failed / 7 passed** |
| `940030e5` | C-4·C-5 hint 4장 → 2장 + 상장전환 인라인 |
| `8e0526b2` | C-1·C-2·C-3·C-6 기준 상단화·안내문 삭제·자동계산 위치 |
| `7a916bde` | C-7 발행주식 총수 §3 일원화 + 배선 이식 |
| `da43046d` | D-2 가산 헬퍼 추출 (엔진·화면 단일 소스) |
| `0e2a9edf` | C-8 대차·PEF 게이트 해제 (D-1 해소) |
| `bc8af177` | C-9 장내 토글 §6 분리 |

### 검증

| 항목 | 결과 |
|---|---|
| 앵커 L-1~L-12 | **26건 전건 GREEN** (19 failed → 0) |
| 전건 vitest | **7278파일 20287테스트 · 실패 0** |
| `tsc --noEmit` | 0건 |
| `npm run lint` | **0 errors** (warning 349 — 기존 수준) |
| 엔진 앵커 PHF-01~06 | 8건 통과 (헬퍼 추출 후 동작 불변) |
| 기존 앵커 T-1·T-2·T-6·T-7 · MJ-1~5 | 통과 유지 |

### 파일 크기 (File Size Policy)

| 파일 | 줄 |
|---|---|
| `MajorShareholderBlock.tsx` | 708 → **704** |
| `MajorShareholderCheckpointHints.tsx` | 217 → **211** |
| `TradingVenueBlock.tsx` (신설) | 73 |
| `Step1.tsx` | 331 → **372** |

장내 토글 33줄이 빠졌지만 `IssuedSharesReadout`과 근거 주석이 그만큼 들어와 실질 변화가
없다. **704는 분리 트리거(800)도 위험구간(≥750)도 아니므로 기회주의적 분리를 하지 않는다**
— 「700~749에 안정적으로 앉은 파일을 커지지도 않는데 미리 쪼개면 순수 낭비」(File Size Policy).

### 계획 대비 달라진 것

1. **C-6** — `CurrencyInput`에 액션 슬롯이 없고(V-1) `KiwoomMarketCapHelper`가 219줄 카드라
   `FieldCard.trailing`에 넣을 수 없었다. 「입력칸 → 키움 카드」 **순서 교체**로 갔다.
2. **D-2** — 계획 수립 시점에 없던 항목. V-3(`computeAutoIsMajor` 정독) 중 발견했다.
   C-8이 입력 경로를 여는 순간 화면과 엔진이 갈리는 구조였다.
3. **앵커 셀렉터 2회 정정** — 둘 다 「구별력 0」 함정이었다:
   - `CollapsibleHintCard`가 접히면 본문을 렌더하지 않아 「본문에 X가 없다」가 공짜로 참이
     됐다 ⇒ 본문 단언 전에 펼치는 헬퍼를 도입.
   - `IssuedSharesReadout`이 §3 라벨과 같은 문구를 인용해 셀렉터가 두 곳에 걸렸다
     ⇒ FieldCard 조상 기준으로 좁혔다([[feedback_hint_quoting_toggle_title_breaks_selector]]).

### 남은 것 (범위 밖 · §8-2)

`computeAutoIsMajor`는 `isLargestShareholderGroup`이 false면 합산값을 0으로 버리지만
엔진은 `forcedCombinedJudgment`(본인 지분율·시총이 **둘 다 0**이고 합산값이 있을 때)로
합산을 강제 적용한다. 이 조합에서 화면과 엔진이 여전히 갈린다. D-1/D-2와 무관하게
이미 존재하던 괴리라 이번 범위에서 고치지 않았다.
