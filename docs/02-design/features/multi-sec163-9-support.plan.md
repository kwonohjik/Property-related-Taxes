# 다건 계산 — 상속·증여 §163⑨ 취득가액(①②③)을 단건과 같은 경로로 지원

> **출처**: `multi-sec163-9-clause-b-drop.plan.md` §4 V-1(#2888) — 「Q-1 b(다건 ② 지원) 별건」. #2888은 다건에서 ② 입력을 **막았다**. 이 계획은 막는 대신 **계산한다**.
> **결정**: 사용자 「권장안으로」(2026-11-04) — Q-1 a · Q-2 a · Q-3 a.
> **검증 깊이**: L3 — 다건 세액이 단건과 같아진다(②가 큰 자산은 바로잡히고, ①만 쓰던 자산은 그대로).

## 0. 결론

- 다건 엔진(`transfer-tax-aggregate`)은 자산마다 단건 엔진을 그대로 부른다. 단건 엔진은 §163⑨ 4키(`inheritedAcquisition`·`inheritedHouseValuation`·`pre1990Land`·`commercialInheritanceValuation`)를 받아 STEP 0.45에서 max를 고른다. **엔진은 이미 된다.** 막힌 곳은 배관 세 곳이다:
  1. ④ `buildPropertyPayload`(`lib/calc/multi-transfer-tax-api.ts:243`) — 상속이면 ①만 `acquisitionPrice`로 싣고 §163⑨ 빌더를 부르지 않는다. `pre1990Land`는 매매 1990 환산 게이트(`hasPre1990LandEstimation`)로만 싣는다(`:427`).
  2. ⑫ `MULTI_REJECT_RULES`(`lib/api/transfer-tax-schema-multi-refines.ts:81`·`:82`) — `inheritedAcquisition`·`inheritedHouseValuation`을 거절한다.
  3. ⑭ `multi/route.ts:513` — `pre1990Land`만 손으로 옮긴다. 단건·컴패니언이 쓰는 공용 leaf `toEngineSec163_9Inputs`(`route-inherited-acquisition.ts:65`)를 쓰지 않는다.
- 시험 수정(④ 단건 빌더 3개 spread · ⑫ 두 줄 삭제 · ⑭ 공용 leaf · #2888 가드 해제 — 측정 뒤 원복)으로 격자 12칸 전부 **다건 `totalTax` = ⌊단건 결정세액 × 1.1⌋**(지방소득세 포함)을 확인했다(§1).

## 1. 실측 — 시험 수정 격자 (master ccb8a2581 · 세율 mock · 양도 2026-02-16 13억 · ① 3억)

| 행 | 단건 결정세액 | 다건 종전 | 다건 시험 수정 | ⌊단건×1.1⌋와 같은가 |
|---|---|---|---|---|
| 주택 상속 2000 ① + ② 7.2억 | 135,460,000 | #2888 차단(그 전 282,711,000) | 149,006,000 | ✅ |
| 주택 상속 2000 ②만 | 135,460,000 | ⑧ 「상속 취득가액(신고가액)을 입력하거나…」 | 149,006,000(⑧은 아직 막음 — Q-2) | ✅ |
| 주택 상속 2000 ①만 | 257,010,000 | 282,711,000 | 282,711,000 | ✅(불변) |
| 주택 증여 2000 ① + ② | 135,460,000 | 차단 | 149,006,000 | ✅ |
| 주택 증여 2000 ①만 | 257,010,000 | 282,711,000 | 282,711,000 | ✅(불변) |
| 토지 상속 1988 ① + ② 4.8억 | 204,090,000 | 차단(그 전 282,711,000) | 224,499,000 | ✅ |
| 토지 상속 1988 ②만 | 204,090,000 | ⑧ 막음 | 224,499,000(⑧은 아직 막음) | ✅ |
| 토지 상속 1988 ①만 | 257,010,000 | 282,711,000 | 282,711,000 | ✅(불변) |
| 주택 상속 1984(의제 전) ①만 | 257,010,000 | 282,711,000 | 282,711,000 | ✅(불변) |
| 지분 1/2 주택 2000 ① + ② | 135,460,000 | 차단 | 149,006,000 | ✅ |
| 주택 상속 2010 ①만 | 257,010,000 | 282,711,000 | 282,711,000 | ✅(불변) |
| D2(건물 상속 + 토지 매매) | 247,266,000 | 271,992,600 | 271,992,600 | ✅(불변 · 기존 파트 경로) |

- 시험 수정 diff는 84줄(4파일 · +9 −17). 다건 ④ 본문에 `inheritedAcquisition`(①만이어도 실린다)·`inheritedHouseValuation`·`pre1990Land`가 실렸다.
- 의제취득일 전(1984) ③(환산 — 3자 max) 행은 ③ 칸을 채운 시료로 재지 않았다 → §4 V-1.

## 2. 결정 Q-n

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 범위 | **a** 단건과 같은 빌더를 그대로 — §163⑨ 전체(① · ② 주택·토지 · 의제 전 ③) / b ②(의제 후)만 열고 의제 전은 계속 ①만 | **a** — 같은 빌더라 범위를 나누면 오히려 갈래가 생긴다. 의제 전 ③은 구현 때 격자에 넣어 잰다(V-1) |
| Q-2 | 다건 ⑧ 「상속 ① 공란」 가드 | **a** 단건과 같이 ② 완전 입력이면 ① 없이 통과(`isSec164ClauseAFilled`) · 문구에서 「보충적평가 자동조회·환산취득가는 단건 전용」을 사실대로 고친다 / b ①은 계속 필수 | **a** — 서버·엔진은 ②만으로 계산한다(격자 ②만 행). b는 단건과 다른 규칙을 남긴다 |
| Q-3 | 저장된 다건 폼의 세액이 바뀌는 것(① + ② 입력 → 내려감) | **a** 조용히 정정 / b 안내 | **a** — #2888이 그 입력을 막고 있었으므로 이미 계산된 다건 결과는 ①만 쓴 종전 결과다. 다시 계산하면 바르게 나온다 |

- #2888 가드(`MULTI_SEC164_CLAUSE_B_UNSUPPORTED_MESSAGE`)와 ⑫ 문구 상수(`MULTI_INHERITANCE_VALUATION_UNSUPPORTED_MESSAGE`)는 쓰임이 없어지므로 지운다(내 변경이 만든 고아).
- 상가(`commercialInheritanceValuation`)는 다건이 `commercial_building`을 막으므로 ⑫ 거절을 그대로 둔다.

## 3. 변경 계획 (Q 전부 a 기준)

1. ④ `buildPropertyPayload` — 단건과 같은 빌더 `buildInheritedAcquisitionPayload`·`buildInheritedHouseValuationPayload` spread · `pre1990Land` 게이트를 단건과 같은 `hasPre1990 || hasPre1990ForSec164`(`primaryAcquisitionModeFlags`).
2. ⑫ — 두 거절 규칙 삭제.
3. ⑭ — `pre1990Land` 손 매핑을 공용 leaf `toEngineSec163_9Inputs(p, transferDate, p.transferPrice)`로 바꾼다(Date 변환 포함 · 단건·컴패니언과 같은 leaf).
4. ⑧ — #2888 가드 삭제 · 상속 ① 공란 가드에 「② 완전 입력이면 통과」(Q-2 a) · 문구 정리.
5. 테스트 — #2888 anchor·E2E는 의도된 반전(막힘 → 계산). 다건 ⑫ 거절을 고정한 기존 테스트가 있으면 같이 옮긴다. 격자 anchor(위 12칸 + 의제 전 ③) → mutation → 회귀 → tsc/eslint → Playwright(다건 화면 ② 채운 상속 주택 → 200 · 본문 키 · 세액).

## 4. 남는 것 V-n

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 의제취득일 전(1985.1.1. 전) 상속 ③(환산 · 3자 max) 다건 = 단건 | ✅ 2026-11-04 — 1984 상속 토지 ① 3억 · ③ 칸(의제취득일 기준시가 5억 · 양도시 9억) → 다건 143,701,555(= ⌊단건 × 1.1⌋ · ① 단독 282,711,000보다 낮음 = ③ 채택) · 본문 `inheritedAcquisition.mode` = `pre-deemed` |
| V-2 | 다건 결과 화면이 §163⑨ 결과(`inheritedAcquisitionDetail`)를 보여 주는가 | ✅ 카드는 보인다(2026-11-04 · headless Playwright — 건별 상세를 펼치면 「상속·증여 취득가액 의제 계산 720,000,000」 + 「상속주택 환산취득가액 계산」). ❌ 대신 자산별 **취득가액·필요경비 표시**가 틀린다(①을 취득가액으로, 차액을 필요경비로) → 후속 계획서 `multi-inherited-acq-display-echo.plan.md` |
| V-3 | 다건 「이력 불러오기」로 들어온 단건 기록(②가 있는 상속 자산) | ✅ 2026-11-04 — `buildPropertyFromSingleRecord`(JSON 왕복 기록) 9행 전부 직접 입력과 세액·본문 키(`inheritedAcquisition`·`inheritedHouseValuation`·`pre1990Land`)가 같다(후속 계획서 §1.3) |

## 5. 법령 근거

- 소득세법 시행령 §163⑨ 본문·단서 1호·2호 · §176조의2④ — 단건 엔진이 이미 구현(이 계획은 배관만). KoreanLaw MCP 현행(mst 290841) 본문은 #2876 계획서 §5와 같은 조회.

## 6. 구현 결과 (2026-11-04)

### 6.1 변경

1. ④ `buildPropertyPayload`(`lib/calc/multi-transfer-tax-api.ts`) — 단건과 같은 빌더 `buildInheritedAcquisitionPayload`·`buildInheritedHouseValuationPayload` spread · `pre1990Land` 게이트를 `hasPre1990 || hasPre1990ForSec164`(`primaryAcquisitionModeFlags`)로.
2. ⑫ `MULTI_REJECT_RULES` — `inheritedAcquisition`·`inheritedHouseValuation` 거절 삭제(상가 `commercialInheritanceValuation`은 유지).
3. ⑭ `multi/route.ts` — `pre1990Land` 손 매핑을 공용 leaf `toEngineSec163_9Inputs`로. 넘기는 키를 객체로 **명시**했다 — F-12 키 분류 가드가 `p.<키>`로 매핑을 읽는다(초안의 `toEngineSec163_9Inputs(p, …)`는 그 가드를 깼다).
4. ⑧ `validateMultiSupportedMode` — #2888의 ② 입력 차단과 다건 전용 「상속 ① 공란」 가드를 지웠다. 다건 검증은 건별로 단건 ⑧(`validateStep`)도 돌리므로 ① 공란은 `postDeemedClauseARequiredError`가 단건과 같이 짚는다(② 완전 입력이면 통과 — Q-2 a).
5. 고아 정리 — 문구 상수 `MULTI_SEC164_CLAUSE_B_UNSUPPORTED_MESSAGE`(#2888)·`MULTI_INHERITANCE_VALUATION_UNSUPPORTED_MESSAGE`, 그 import, `legal-codes` import, ⑧의 `effectiveBuildingCauseMix`·`sec164*Status` import.

### 6.2 테스트

- 신규 anchor `__tests__/calc/multi-sec163-9-support.anchor.test.ts` 12건(정본: 다건 `totalTax` = ⌊단건 결정세액 × 1.1⌋):
  - MS-1 격자 7칸(상속 주택 ①+② · ②만 · ①만 · 증여 ①+② · 토지 1988 ①+② · ②만 · 2010 ①만 — ⑧ 통과 · 본문 키) + D2.
  - MS-2 의제 전 1984 토지 ③ 칸 · ①만(본문 `mode: pre-deemed`) · MS-2b ③ 채택 143,701,555 < 282,711,000.
  - MS-3 ⑫ 상가 키 400 유지.
- 의도된 반전: #2888 anchor `multi-sec163-9-clause-b-drop` 삭제(막힘을 고정했다 — MS-1이 대체) · E2E를 `e2e/multi-sec163-9-support.spec.ts`로 바꿔 씀(막힘 → 200 · 149,006,000) · `transfer-land-part-cause.d2.predo` C16(다건 전용 가드 문구 → 건별 단건 ⑧ `publishedValueAtInheritance` 이슈).
- pre-push 첫 시도에서 `__tests__/lib`의 의도된 반전 3건이 더 나왔다(회귀를 api·calc·components로만 돌려 놓쳤다): `multi-transfer-api-sync` R2-H1 ×2(다건 전용 「신고가액」 차단 → 다건 고유 차단 없음 · 건별 ⑧ `publishedValueAtInheritance` — 시료에 소재지를 채워 자산 ⑧이 평가액 규칙까지 가게 했다) · `pre1990-land-gate` A09-12(1987 증여 토지 다건 `pre1990Land` 미구성 → 단건과 같은 값 — 단건은 §163⑨1호로 이미 싣고 있었다).
- E2E MS-E1·E2(headless Playwright — 사람이 직접 한 브라우저 확인은 아니다) + 인접 다건 E2E 10건 통과(`transfer-multi-pre1990-land` 1건은 회귀와 동시 실행 중 첫 시도 page.goto 시간 초과 → 재시도 통과 · load 45). E2E 뮤테이션(M1) → MS-E1 실패 확인.
- mutation:

| M | 무력화 | 실패 |
|---|---|---|
| M1 | ④ `inheritedAcquisition` 빌더 제거 | MS-1 7칸 · MS-2 ③ · MS-2b(10건) |
| M2 | ④ `inheritedHouseValuation` 빌더 제거 | MS-1 주택 ② 3칸 |
| M3 | ④ `pre1990Land` 게이트 종전으로 | MS-1 토지 2칸 |
| M4 | ⑫ `inheritedAcquisition` 거절 복원 | MS-1 7칸 · MS-2 ③ · MS-2b(10건) |
| M5 | ⑭ `pre1990Land`만 매핑 | MS-1 ② 5칸 · MS-2 ③ · MS-2b(7건) |
| M6 | ⑧ 다건 전용 ① 공란 가드 복원 | MS-1 ②만 2칸 |

- 회귀: `__tests__/api`·`__tests__/calc`·`__tests__/components` 23,464 통과 · 실패 6 — 의도된 반전 1(C16) · F-12 1(⑭ 키 명시로 해결) · S13-3 4(단독 실행 통과 — 부하). 갱신 후 관련 3파일 40/40. tsc 0 · 변경 파일 eslint 0.
