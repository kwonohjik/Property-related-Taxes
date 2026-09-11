# 상속·증여세 UI 리뷰 — 잔여 154건 처리 배치 (2026-09-11)

대장: [`inheritance-gift-ui-review-2026-09.md`](inheritance-gift-ui-review-2026-09.md).
BLOCKER 10건은 **PR #1581로 종결**. 이 문서는 **MAJOR 81 + MINOR 73 = 154건**의 처리 단위다.

전건 재분류를 스크립트로 검증했다 — **할당 154 · 누락 0 · 중복 0**.

## 묶는 기준은 「파일」이 아니라 «한 번 판단하고 N번 적용하는 단위»다

154건을 파일순으로 훑으면 파일마다 다른 판단을 새로 해야 한다. 대신 **수정 행위가 같은 것**끼리 묶으면
판단 1회를 N건에 분할상환할 수 있고, **검증 수단도 배치마다 하나로 고정**된다. 배치가 곧 PR이고,
배치가 곧 「이 PR에서 값이 바뀌었는가」의 판정 단위다.

| # | 배치 | 건수 | MAJOR | MINOR | 파일 | 수정 행위 | 검증 수단 |
|---|---|---:|---:|---:|---:|---|---|
| ~~G1~~ ✅ | ~~문구·조문표기~~ | 33 | 6 | 27 | 28 | 라벨·hint·조문 인용 1~3줄 | typecheck + 기존 테스트 (값 무변동) |
| ~~G2~~ ✅ | ~~엔진 단일소스 위임~~ | 23 | 16 | 7 | 22 | UI 로컬 재구현 삭제 → 엔진 헬퍼 import | 「UI 표시값 == 엔진 값」 anchor |
| ~~G4~~ ✅ | ~~게이트 OFF 값 정리~~ | 16 | 9 | 7 | 12 | 게이트가 닫힐 때 patch에서 값도 정리 | RTL anchor (OFF → store 키 부재) |
| ~~G5~~ ✅ | ~~공용컴포넌트·인쇄·저장~~ | 13 | 3 | 10 | 11 | 저장소 확립 패턴으로 교체 | RTL + E2E 셀렉터 |
| ~~G6~~ ✅ | ~~결과뷰·별지서식~~ | 14 | 13 | 1 | 13 | 화면 ↔ 별지 값·산식 불일치 해소 | 결과뷰 anchor + PDF 행 대조 |
| ~~G7~~ ✅ | ~~재산카드·주식평가~~ | 10 | 7 | 3 | 9 | 카드별 게이트·목록 정합 | RTL anchor |
| ~~G8~~ ✅ | ~~입력폼 구조·사후관리~~ | 20 | 9 | 11 | 16 | 위젯 신설·죽은 경로 판정 | RTL anchor + 개별 판단 |
| ~~G3~~ ✅ | ~~미입력→0 (⑧validate·fallback)~~ | 25 | 18 | 7 | 18 | 차단 추가 · `\|\| undefined` 방향 교정 | **E2E 전건** |
|  | **합계** | **154** | **81** | **73** | | | |

## 순서에 근거가 있다 — 임의 배열이 아니다

```
G1 → G2 → G4 → G5 → G6 → G7 → G8 → G3
```

- **G1이 먼저인 이유**: 값이 안 바뀌는 유일한 배치다. 뒤로 미뤄 값 변동 배치와 섞으면
  「이 PR에서 금액이 달라졌는가」를 더 이상 한눈에 판정할 수 없다.
- 🔴 **G4가 G3보다 반드시 먼저다**: `IG-020`·`IG-022`는 「숨겨진 행을 ⑧validate가 계속 요구해
  **영구 차단**」이다. 숨은 값을 정리하지 않은 채 G3에서 차단을 더 추가하면 **새 영구 차단이 생긴다.**
- 🔴 **G3이 마지막인 이유**: 차단 validation 추가는 그 칸을 채우지 않던 **기존 E2E를 전건 회귀**시킨다
  (메모리 `feedback_blocking_validation_full_e2e_regression`). E2E 스펙 수정을 동반하므로,
  다른 배치가 모두 끝난 뒤 돌려야 실패 원인이 이 배치임을 단정할 수 있다.

**병렬은 파일이 겹치지 않는 쌍만.** 전 쌍 겹침을 실측했다 — 겹치는 조합은
G1×G2·G1×G3·G1×G5~G8 · G2×G3·G2×G5·G2×G7·G2×G8 · G3×G5·G3×G7·G3×G8 · G4×G7·G4×G8 · G5×G6·G5×G7.
**겹침 0인 조합만 worktree 병렬**로 돌린다: `G4×G5` · `G4×G6` · `G6×G7` · `G6×G8` · `G7×G8`.

> `StockItemEditor.tsx`는 G1·G2·G5·G7 **네 배치**에 걸린다(IG-129·127·128·056).
> 이 파일만은 **G2에서 4건을 한 번에** 처리하고 나머지 배치의 목록에서 뺀다.

## G1 종결 기록 (2026-09-11)

전건 33건 수정 완료. 착수 전 예상과 어긋난 것 셋을 남긴다 — 뒤 배치에도 그대로 적용된다.

**① 「문구만」이라는 전제가 세 번 깨졌다.** 예고했던 값-변동 3건(`IG-100`·`118`·`159`) 외에
`IG-137`(taxKind를 화면·PDF 5단계로 배선) · `IG-141`(라벨을 행 배열에서 파생) ·
`IG-146`(**엔진 result에 echo 필드 1개 추가**) · `IG-160`(prop 배선)이 코드 변경을 요구했다.
⇒ **배치 이름이 곧 작업 규모의 상한은 아니다.** 다음 배치도 착수 시 건별로 다시 잰다.

**② 대장의 제안이 저장소 정책과 충돌한 것이 1건.** `IG-150`의 제안 문구
「공제액 = MIN(㉠ 산정액, ㉡ 한도 2억)」을 그대로 넣었더니
`__tests__/components/minmax-function-notation-policy.test.ts`가 막았다 — 표시 산식은
한국어 풀어쓰기가 정본이고 `MIN(`은 함수 표기다. ⇒ **제안은 참고이지 명세가 아니다.**

**③ 통과하던 테스트 2건이 결함을 지키고 있었다.** `prior-gift-table-view.test.tsx`의
D-4는 제목부터 「증여세 모드 → doneeRelation 라벨만」이었는데, 그게 바로 `IG-066`이 지적한
결함이다(증여세 모드의 doneeRelation은 증여자 관계가 복사된 값). 계약 자체를 뒤집고
헤더 분기 anchor(D-6)를 더했다. BLOCKER 때의 `BT-E2E-4`와 같은 층위다.

**④ CI 라운드 — 대장이 지적한 지점이 «그 결함의 전부»가 아니었다.** `IG-142`(장례비를
§14①3호로 오인용)는 대장이 `DebtAllocationResultCard:149` 한 곳만 잡았는데, 같은 오인용이
`steps.tsx:233`의 **화면 라벨**과 그 파일 머리글에도 있었다. 결정적으로
`heir-allocation-summary.ts:248`은 **이미 「§14①2호」로 맞았다** — 한 저장소가 같은 조문을
두 가지로 쓰고 있었다. 리뷰는 파일 단위로 훑어 찾은 것이라 그 파일을 안 본 인스턴스는
잡히지 않는다. ⇒ **조문 인용을 고칠 때는 「그 조문 + 그 주제」로 전역 grep을 한 번 더** 돌린다
(memory `feedback_citation_drift_replicates_across_repo`). E-표시법령 축에 그대로 적용된다.

**⑤ CI의 실패 목록은 «첫 실패에서 멈춘» 부분집합이다.** `inheritance-payment-in-kind`는
66행이 깨져 멈췄고 같은 테스트의 70행(충당순서)은 실행조차 안 됐다. CI 목록만 보고 고쳤으면
다음 라운드에 또 빨간불이 났다. ⇒ **바꾼 표시 문자열을 diff에서 뽑아 `e2e/`·`__tests__/`에
역방향 grep**하는 것이 정본이다. 이 방법으로 CI가 준 4건 외에 **3건을 더** 찾았다.

**⑥ E2E가 지키던 결함 4종** — 그중 하나는 **틀린 placeholder가 셀렉터 축**이었다.
「주당 순손익 입력」이라는 잘못된 문구(라벨은 「전후 2개월 종가 단순평균」)를 2개 spec이
`getByPlaceholder`로 잡고 있었다. 저장소 관례는 이미 `getByTestId("ls-avg-price")`였고
(6 spec) 그 둘만 취약한 축이었다 — 문구를 고치자 spec이 깨진 것이 아니라, **문구가 틀렸다는
사실을 spec이 붙잡고 있었던** 것이다 (memory `feedback_selector_axis_has_three_forms`).

**⚠️ pre-push는 E2E를 돌리지 않는다**(CLAUDE.md — E2E는 CI 1회뿐). 표시 문구를 바꾸는 배치는
**푸시 전에 관련 spec을 로컬에서 직접** 돌릴 것: `npx playwright test <spec>`.

**뮤테이션 프로브에서 배운 것**: 상수만 단언한 `IG-141` anchor는 «호출부를 되돌리는»
뮤테이션에 **구별력 0**이었다(라벨 함수는 맞는데 표가 `{}`를 넘겨도 통과). 렌더 anchor를
짝으로 추가해야 「컴포넌트가 그 단일 소스를 부른다」가 증명된다
(memory `feedback_library_anchor_does_not_prove_component_uses_it`).

## G2 종결 기록 (2026-09-11)

전건 23건 수정 완료(28파일). 축은 넷으로 갈렸다 — **평가기준일 미전달 10 · UI가 엔진 산식
재구현 7 · 엔진 echo 미사용 4 · 게이트 술어 불일치 2**.

**⭐ ① 대장이 UI 결함으로 적은 것이 «실제 세액 경로»에도 있었다.** `IG-053`이 부록으로
적어둔 「청크 밖이지만 함께 확인 필요」를 따라가니, `lib/tax-engine/valuation/resolve-estate-item-value.ts:76`의
`evaluateListedStock(item, {})`가 **저장소에서 유일하게** 평가기준일을 안 넘기고 있었다
(나머지 6개 호출부는 전부 넘긴다). 이 함수는 `valuationDate`를 **이미 파라미터로 받으면서
쓰지 않았다.** 결과는 §53⑧2호 전부매각 할증배제가 조용히 죽어 **세액이 과대**해지는 것이다.
⇒ **UI 리뷰 항목의 「부록」이 엔진 결함을 가리킬 수 있다** — 청크 밖이라고 접지 말 것.

**② 모집단이 대장보다 넓었다.** `computeStockValuation`에 날짜를 안 넘기는 곳이 대장 지적
3건 외에 **4곳 더** 있었다. G1 ④(`IG-142`)와 같은 형태다 — 리뷰는 파일 단위로 훑은 것이라
그 파일을 안 본 인스턴스는 목록에 없다.

**③ 호 번호를 UI가 재현하면 안 되는 경우가 있다.** `IG-034`에서 가업 공제한도 라벨을
「10년 이상(1호)」식으로 고치려다, **2014~2017 tier는 구간 경계 자체가 다르다**는 것을
확인했다(10~15 / 15~20 / 20+). 같은 금액이 다른 호에 대응하므로 **금액으로 호를 역산하면
틀린다.** ⇒ 엔진이 준 한도와 입력 연수만 적는다.

**④ 픽스처가 «어떤 쓰기 지점도 만들지 않는 데이터»였다.** `source-data-summary.test.tsx`의
U-10이 영리법인 사전증여에 `computedTax: 150_000_000`을 주고 소계 592,000,000을 단언했다.
그런데 영리법인 행의 산출세액을 쓰는 지점은 `GiftRowEditor:107-113`(cgct에 기록,
`giftTaxBase`는 명시적으로 undefined) · `prior-gift-lookup.ts:313`(이력의 computedTax →
**cgct로 매핑**) 둘뿐이고, 엔진(`inheritance-corporate-exemption-step.ts:65`)도 cgct를 읽는다.
결정적으로 **같은 배열을 받는 형제표**(`InheritanceTaxResultView:328` vs `:337`)의
`InheritanceFilingFormTable.tsx:199-201`은 **이미 분기하고 있었다** — 두 표가 같은 데이터로
다른 값을 그리고 있었던 것이다. ⇒ 픽스처를 실재 가능한 데이터로 고치고, **미끼
`computedTax: 999,999,999`를 함께 둔 U-12**(양성=cgct 표시 / 음성=미끼 무시)를 더했다
(memory `feedback_fixture_default_masks_gate_defect` · `feedback_negative_anchor_needs_positive_twin`).

**⑤ 내가 실측 없이 단정했다 — 틀렸다.** `IG-049`에서 「`getShareThresholdByDate() * 100`이
G1에서 고친 부동소수 함정을 재현한다」고 적었으나, 실측하니 **0.2·0.3·0.4·0.5는 정확히
떨어진다**(0.07만 문제였다). 헬퍼(`ratePercent`)는 미래 임계값 대비로 유지하되 **근거를
정정**했다. 규칙은 이미 메모리에 있었다 — `feedback_numeric_impact_verify_before_bug_claim`.

**⑥ 「미성년」은 두 축이다.** `resolveMinorBeneficiary`의 19세는 **민법 §4 성년**이고
(§57 세대생략이 쓴다 — `inheritance-generation-skip.ts:115`), `resolveS20Params().minorAgeLimit`은
**§20 인적공제 tier**다(2016-01-01 前 20세). 하드코딩된 19를 무조건 tier로 바꾸면 틀린다.

**뮤테이션 프로브 — 구별력 0이 또 나왔다.** `IG-088`의 첫 anchor는 헬퍼만 단언해 호출부를
되돌려도 통과했다(G1 `IG-141`과 **같은 형태의 재발**). 렌더 anchor(R-5·R-6)를 짝으로 추가한
뒤에야 잡혔다. ⇒ **단일소스 위임 배치의 anchor는 기본형이 «렌더»다.**

**🟠 별건으로 남긴 것**: `resolveEstateItemValue`는 `valuationDate` 파라미터가 **아예 없는데**,
docstring은 `computeEffectiveValuation`과 「동치(단일 진실)」라고 적는다. 시그니처를 넓히면
호출부 폭발 범위가 이 배치를 넘어서므로 **건드리지 않고 남긴다.**

## G4 종결 기록 (2026-09-11)

전건 16건 수정 완료. 착수 노트는 **방향이 둘**(키가 없으면 원본이 살아남음 / 명시적 undefined로
지워야 함)이라고 적었는데, 실제로는 **셋**이었다.

**⭐ ① 세 번째 방향이 가장 많았다 — 「값을 지우지 않고 «판정 술어»를 맞춘다」.**
판정 기준은 하나다: **엔진이 그 값을 읽는가.**

| 엔진이 | 처리 | 해당 |
|---|---|---|
| **읽지 않는다** (차단만 발생) | ⑧validate·⑫Zod를 **렌더 게이트와 같은 술어**에 태운다 | `IG-020` · `IG-022` · `IG-119` |
| **읽는다** (계산이 달라진다) | 게이트가 닫힐 때 **값도 함께** 정리한다 | `IG-021` · `IG-045` · `IG-055` · `IG-064` · `IG-065` · `IG-098` · `IG-139` |

이 갈래는 **추정이 아니라 실측으로** 갈랐다 — `IG-119`는 엔진이 신주인수권증서 + 거래소 ON에서
종가평균만 쓰고 `cbConvertible`을 **아예 읽지 않는다**(`property-valuation-convertible-bond.ts` 라목1).
`IG-022`도 `lib/tax-engine/gift-deemed/related-corp.ts:145`가 `!p.isRelated || p.exclusionType`로 같은 술어를 이미 건너뛴다.
⇒ 둘 다 **차단만** 풀면 됐고, 값을 지웠으면 오히려 사용자 입력을 날렸을 것이다.
메모리 `feedback_ui_gate_removes_sole_input_path`의 「값은 지우지 않는다 — 표시 게이트만」이 여기다.

**② 대장 밖 모집단을 쟀는데 이번엔 «없었다».** G1(`IG-142` 3곳)·G2(`computeStockValuation` 7곳)에서
연달아 모집단이 넓어졌기에 `IG-098`의 형제 경로(`capital_increase`의 `ciSmallImputation`)를 실측했다.
UI 게이트는 `!isHigh`(`capital-forms.tsx`), API도 `!isHigh`(`gift-deemed-api.ts`) — **이미 일치**한다.
⇒ **「두 번 넓었으니 이번에도 넓다」가 아니다.** 재고 나서 없다고 말하는 것과 안 재고 없다고
말하는 것은 다르다. 비대칭은 `contribution` 한 곳뿐이었다.

**③ 같은 boolean을 두 컨트롤이 공유하면 하나가 자기 자신을 지운다** (`IG-112`).
`Step4Deductions`의 주석은 「체크리스트 칩 = casualtyLossEnabled 직접 토글 → **이중 토글 없음**」이라
적고 있었지만, 코드는 칩과 카드 안 스위치 **둘 다** 같은 필드를 쓰는 이중 토글이었다.
⇒ **계산 축**(`casualtyLossEnabled` — ④buildInput·⑧validate 단일 진실, 건드리지 않음)과
**표시 축**(칩 override)을 분리했다. 이제 스위치를 내려도 카드가 남아 ToggleCard의 OFF 상태가
비로소 렌더된다(저장소 규칙 「OFF도 tone 유지」가 그동안 구조적으로 불가능했다).

**④ 「둘 중 하나를 명시적으로 택하라」는 지적은 법령이 정한다** (`IG-047`).
평가기간 외 유사매매 행을 «선택 가능»으로 할지 «불가»로 할지 — 목록 헤더가 이미
「참고용 — 시가 불인정 가능」이라 적고 있었다. §49① 평가기간 밖은 시가로 못 쓴다.
⇒ 선택 불가로 확정하고 배지를 「평가기간 외 · **선택 불가**」로 바꿨다.

**⑤ 16축 전부 «첫 시도에» 구별력이 나왔다.** G1·G2에서 각각 1건씩 구별력 0을 만들고
렌더 anchor를 덧대야 했는데, 이번엔 **렌더 anchor를 기본형으로 먼저 썼다**(순수 11 + 렌더 17 + 모달 2 = 30건).
⇒ 「단일소스·게이트 배치의 anchor 기본형은 렌더」가 두 배치 연속으로 확인됐다.

**⑥ 내 주석이 단 줄번호가 내 편집으로 밀렸다.** `:479`·`:509`·`:322`처럼 **같은 파일 안**을
가리키는 `:NNN` 인용은 그 파일을 편집하는 순간 썩는다(대장에서 그대로 옮겨 적은 값이었다).
⇒ 같은 파일 안은 **심볼명**으로, 다른 파일만 `file:line`으로 쓴다.

## G5 종결 기록 (2026-09-11)

전건 13건 수정 완료. 이 배치의 정체는 한 문장이다 — **저장소에 이미 확립된 공용 수단이
있는데 그것을 안 쓴 곳**. 5축이 전부 그 형태였다(인쇄 `print-only-css-toggle` · `ToggleCard`·
`RadioCardGroup`·`CurrencyInput` · `RestartFromScratchButton` · `save-handler-builders`).
⇒ anchor도 「공용 수단과 **동일한가**」로 잰다(`expect(formatGiftSaveMessage).toBe(formatSaveMessage)`) —
로컬 재구현을 다시 만들면 그 자리에서 깨진다.

**⭐ ① 모집단을 줄인 것이 «내 스캔 정규식»이었다.** 죽은 `data-testid`는 대장이 3건
(`IG-099`·`106`·`122`)을 적었는데, 실제로는 **19건 · 7파일**이었다. 내 첫 스캔
`<(ToggleCard|RadioCardGroup)\b[^>]*?>`는 **3건**만 잡았다 — `[^>]*?`가 `description={<>…</>}`
같은 **중첩 JSX의 `>`에서 멈추기** 때문이다. 깊이 기반으로 다시 세어야 19건이 나왔다.
메모리 `feedback_regex_charclass_undercounts_population`의 정확한 재발이다.
⇒ **모집단을 정규식으로 셀 때는 「그 정규식이 놓칠 수 있는 형태」를 먼저 적어라.**

**② 근본 원인은 「JSX가 하이픈 속성명을 타입검사하지 않는다」다.** `ToggleCardProps`에
`data-testid`가 없는데도 호출부는 그것을 넘길 수 있었고 **tsc는 침묵**했다. 값은 DOM에
닿지 못하고 버려졌다. ⇒ 공용 컴포넌트가 **받아서 루트에 붙이도록** 한 지점만 고쳐
**19곳이 한 번에** 살아났다. 호출부는 한 줄도 안 건드렸다.

**③ 저장 헬퍼는 7세목 중 «증여세 하나만» 표준 밖이었다.** 그 결과 두 기능이 통째로
빠져 있었다 — **미결(draft) 저장**(`IG-162`)과 **190건 한도 경고**(`IG-163`).
게다가 `GiftTaxForm`은 공통 타입을 맞추려고 `isDraft: false`를 **위조**해 넘기고 있었다.
공통 헬퍼에 위임하면서 그 위조도 사라졌다.

**④ 틀린 셀렉터 축이 또 나왔다.** `gift-deemed-specific-corp.spec.ts`가
`getByTestId("sc-sh-is-donor-N").check()`를 쓰고 있었다 — `.check()`는 **native checkbox 전용**이라
`ToggleCard`(role=switch)로 바꾸면 깨진다. 저장소 관례는 이미
`locator('[data-slot="toggle-card"]').getByRole("switch").click()`였다. G1의 placeholder 사례와 같은 층위다.

**⑤ 인쇄 언마운트 모집단 11건 중 3건만 고쳤다 — 의도적이다.** 나머지 8건은
`deduction-breakdown/`의 **한 단계 더 안쪽** 상세 카드들이고, 그것들을 한 번에 감싸면
부모의 `divide-y` 자식 수가 바뀌어 **구분선이 줄어드는 시각적 변화**가 생긴다.
보고된 3건(섹션 레벨)은 그 자체로 완결이므로 분리했다. ⇒ 아래 「별건」 참조.

**⑥ 뮤테이션 프로브의 함정 — «구문 오류»는 구별력이 아니다.** `IG-090`의 첫 프로브가
`11 passed`로 나와 구별력 0처럼 보였는데, 실은 뮤테이션이 JSX를 깨뜨려 **렌더 anchor 파일이
아예 로드되지 않은** 것이었다(`Test Files 1 failed`가 따로 찍혔다). 구문상 유효한 뮤테이션
(`hidden print:block` → `hidden`)으로 다시 재서 `1 failed`를 확인했다.
⇒ **프로브 결과는 `Tests` 줄만 보지 말고 `Test Files` 줄도 함께 읽어라.**

### 🟠 별건으로 남긴 것 (실측 확인 · 이 배치 범위 밖)

| | 실측 | 왜 안 고쳤나 |
|---|---|---|
| 인쇄 언마운트 8건 | `deduction-breakdown/` 상세 카드 8곳이 `{open && …}` | 묶으면 `divide-y` 레이아웃이 바뀐다 — 별도 판단 필요 |
| `PropertyTaxForm.tsx:178` | 「**다시 계산하기**」 라벨에 전체 초기화(`INITIAL_FORM`)를 달았다 | `components/calc/CLAUDE.md:14`가 금지하는 **바로 그것**인데 **재산세**라 이 리뷰 범위 밖 |
| native checkbox 잔존 3곳 | `SpecialTreatmentAssetSelector` · `PrintSelectionPanel` · `/law UnifiedSearchBar` | 전부 **다중선택 목록**이지 분기 토글이 아니다 — 현행 유지가 맞다 |

## G6 종결 기록 (2026-09-11)

전건 14건 수정 완료(MAJOR 13/14 — 잔여 배치 중 비중 최고였다). 반복 주제는 예고대로
**「화면 값 ≠ 별지 값」**이었다(`IG-052`·`054`·`062`·`081`·`082`).

**⭐ ① 「그 조문 + 그 주제」 전역 grep이 8곳을 드러냈다.** `IG-077`은 §24 차감 행이
**두 번** 그려지는 것만 지적했는데, 두 행의 조문 표기가 서로 달랐다(`§24 ②2호` vs `§24 ①2호`).
KoreanLaw로 확인하니 **상증법 §24에는 «항»이 없다** — 본문 + 각 호(1~3호)뿐이다.
⇒ **둘 다 오인용**이었고, 저장소 전체에 `①1호`·`②2호`·`①2호`·`①3호`·`②`·`③`가 섞여 있었다.
정본은 **「§24 N호」**다. `Step4DeductionChecklist`는 **이미 「§24 각 호 순서: 1호·2호·3호」로 맞았다**
— 한 저장소가 같은 조문을 두 가지로 쓰고 있었다(G1의 `IG-142`와 동형).

**🔴 ② 그 전역 치환이 «다른 법령의 §24»를 건드렸다 — 메모리를 갖고도 밟았다.**
`법인세령 §24①2호바목`(감가상각자산 = **개발비**)은 ①이 **정당**하다. 조번호만 같은 다른 법령이다.
정규식 한 방에 2곳이 잘못 바뀌었고, **diff 전수 확인**에서 잡아 되돌렸다
(메모리 `feedback_rename_same_name_two_axes` — 「같은 이름이 두 축이면 전역 치환 금지」).
⇒ anchor `F-17`이 그 **대조군**을 고정한다 — 「법인세령 §24①2호바목은 그대로 남아야 한다」.
**조문 인용 일괄 정정은 «법령명»으로 먼저 쪼갠 뒤에만 안전하다.**

**③ rowSpan은 행 그룹(thead/tbody)을 넘지 못한다** (`IG-039`). `<thead>`의 `rowSpan={7}`이
tbody 5행까지 덮으려 했지만 실제로는 헤더 2행만 덮어, **본문 전 행이 col1을 잃었다**
(헤더 19열 vs 본문 18열). 인쇄·PDF 제출 서식에서 성명이 「상속인」 칸 아래로, ⑧이 ⑦ 칸으로 밀렸다.
⇒ 헤더는 `rowSpan={2}`, tbody 첫 행에 별도 밴드 셀(`rowSpan={minRows + 1}` — **파생값**).
하드코딩 7은 동거 상속인이 5명 이상이면 가정 자체가 어긋났다.
렌더 anchor가 **rowspan carry를 복원해 각 행의 실제 열 수**를 재고, 0명·2명·6명 세 경계를 고정한다.

**④ 소스 문자열 anchor는 「조건만 바뀌는」 뮤테이션에 구별력 0이다.** `IG-054`의 첫 anchor는
`page1Values.section53_8_2FailLabel`이 소스에 있는지만 봤는데, 게이트를 `{false && …}`로
바꿔도 **본문 표현식이 그대로 남아** 통과했다. G1의 「외국납부세액공제 거짓 양성」과 동형이다.
⇒ 렌더 anchor(H-6·H-7)로 옮겨야 잡힌다. **게이트 축은 소스로 재지 마라.**

**⑤ 안전망이 «화면에 없는 컴포넌트»를 보고 있었다** (`IG-152`). 영농 UI 테스트 12건이 전부
복제본(`FarmingDeductionDetailRowExport`)만 렌더했고, 그 복제본은 한도를 **30억으로 고정**해
실렌더 카드의 연도별 한도(30억/15억/5억)가 깨져도 초록이었다. 실렌더로 옮기자 1건이 깨졌는데,
그 단언이 바로 **복제본의 문구**였다(「공제 0원」 — 실렌더는 「공제 적용 불가」).
⇒ 복제본과 re-export를 제거했다. BLOCKER 때의 `BT-E2E-4`·G1 ③과 같은 층위다.

**⑥ PDF와 화면이 «같은 어댑터»를 다른 인자 수로 불렀다** (`IG-052`). 화면은 8인자, PDF는 5인자라
㊵ 물납액·㊶ 분납액이 PDF에서만 대시로 비었다 — Props에 그 필드가 **아예 없어** 부모가 넘길
수도 없었다(명시 prop 매핑 strip). ⚠️ 대장이 함께 적은 ⑩ 주소는 **PDF에 렌더 지점 자체가 없어**
넘겨도 달라지지 않는다 — 안 쓰는 prop을 만들지 않았다(½ 정정 채택).

## G7 종결 기록 (2026-09-11)

전건 10건 수정 완료. 이 배치에서 가장 큰 것은 **법령 수치 자체가 틀렸던 1건**이다.

**⭐ ① 「신청기한」이라는 이름의 함수가 «신고기한»을 반환하고 있었다** (`IG-058`).
KoreanLaw 실측 — 상증령 §49의2⑤: 「법 제67조에 따른 상속세 과세표준 신고기한 만료
**4개월 전**(증여의 경우 법 제68조에 따른 증여세 과세표준 신고기한 만료 **70일 전**)까지
신청해야 한다」. ⑥ 통지기한은 **1개월 전 / 20일 전**.
카드는 신고기한을 그대로 D-N으로 찍어 **상속은 4개월, 증여는 70일 늦은** 날짜를 안내했다 —
그 카운트다운을 믿고 기다리면 §54⑥ 신청 자체가 불가능해진다.

⇒ **이름이 거짓인 것이 결함의 뿌리였다.** `inheritanceApplicationDeadline` →
`inheritanceFilingDeadline`(신고기한)으로 고치고, 신청·통지 기한을 별도 파생 함수로 만들었다.
신고기한 산정은 저장소 정본(`inheritance-gift-filing-deadline.ts`)에 위임했다 —
§67④ 비거주자 9개월 분기가 그쪽에만 있어, 이제 **신청기한도 비거주자를 따라간다**.

**② 기존 테스트 2건이 틀린 기한을 지키고 있었다** — `K-4-6`(2024-07-31)·`K-4-7`(2024-04-30)이
바로 그 «신고기한»이었다. 계약을 뒤집고 정본 날짜(2024-03-31 · 2024-02-20)로 단언을 바꿨다.
G1 ③·G6 `IG-152`와 같은 층위다 — **틀린 값을 테스트가 붙잡고 있었다.**

**③ 「보이는 조건」을 다른 축에 재사용하면 법령 요건이 무너진다** (`IG-043`).
`showCohabitToggle={showLeaseDeposit && …}` — 임대보증금 **노출 조건**(apartment||building,
실질은 「land가 아님」)을 §23의2 **주택 판정**에 그대로 썼다. 하류에 카테고리 필터가 전혀 없어
(`inheritance-deduction-suggest`·`validate`) 상업용 건물에 **최대 6억 공제**가 열렸다.
⇒ 「그 조건이 무엇을 뜻하는가」를 확인하지 않고 재사용한 것이 원인이다
(메모리 `feedback_ui_mode_flag_not_domain_semantics`와 같은 형태).

**④ 필수 검증이 «하나도» 실행되지 않는 조합이 있었다** (`IG-044`). 거래소 거래 + 신주인수권증서는
거래소 분기가 그 종류를 제외하고, 비거래소 분기도 `isPreemptive`면 원금·만기를 건너뛰고
렌더되지도 않는 `cbConvertible`만 봤다. 비워둔 채 계산하면 엔진이 `?? 0`으로 받아 **평가액 0원**이
되고 카드에 미리보기가 없어 알아챌 수도 없다 — 재산이 조용히 과소 신고된다.

**⑤ 게이트 밖에 있어야 할 블록이 안에 있었다** (`IG-046`). 「평가기간 외 거래 N건이 있습니다
(**위 목록에 표시**)」라고 안내하면서, 그 목록은 `status === "ready" && candidates.length > 0`
안에 있었다 — `empty`는 정의상 후보 0건이라 **결코 참이 되지 않는다**. 즉 참고 거래가 가장
필요한 상황에서만 볼 수 없었다. 블록을 게이트 밖으로 빼고 문구도 사실과 맞췄다.

**⑥ 사본이 단일 출처를 따라가지 못했다** (`IG-040`). 카테고리 변경 다이얼로그가 목록 2개·라벨
1개를 자체 선언해 `crypto_asset`이 **사본에만 빠졌다** — 가상자산은 «추가»는 되는데 «변경»으로는
도달할 수 없었고, crypto_asset 항목에서 열면 대응 라디오가 없어 아무것도 선택되지 않은 채 떴다.
⇒ 사본 3개를 지우고 단일 출처를 import, **이 화면에서만 다른 문구 1개**(deposit)만 override로 남겼다.

**⑦ 뮤테이션 11축 전부 첫 시도에 구별력.** G6에서 확정한 「게이트 축은 소스로 재지 않는다」를
처음부터 적용해, 게이트성 4건(`IG-040`·`123`·`061`×2)을 **렌더 anchor**로 잡았다.

**🔴 ⑧ 내 확인 게이트가 과했고, E2E가 그것을 잡았다.** `IG-061`의 폐기 확인을 처음엔
`hasRows`(행이 하나라도 있으면)로 걸었는데, ON 토글이 **자동 생성한 빈 행 2개**에까지 확인을
물어 「잃을 것이 없는」 상황에 마찰만 만들었다. 게다가 그 경로에서 행을 지우지 않아
`inputMode = preference || hasRows`가 계속 참이 되어 **토글이 꺼지지 않는 버그**까지 냈다.
⇒ 형제 토글 3개와 같은 **`hasData` 축**(계정과목 또는 금액이 실제로 있는가)으로 고치고,
데이터 없는 빈 행은 확인 없이 즉시 정리한다. 단위 anchor는 데이터 있는 픽스처만 써서
이 실수를 못 잡았고 — **E2E 2건이 잡았다**. 대조군 anchor(B-8b)를 추가했다.

**⑨ E2E 2건이 결함을 지키고 있었다** — 이번 배치도 예외가 아니었다.
`inheritance-family-business-multiple`은 **영위연수만 채운(=자격 미충족)** 상태에서
「총한도 600억」이 보이는 것을 단언했는데, 그게 정확히 `IG-123`이 지적한 화면이다.
계약을 뒤집어 「금액 대신 사유 안내」를 단언하게 했고, **자격 충족 시 미리보기가 나오는 축은
단위 anchor(B-6)가 덮는다**고 spec 주석에 명시했다.

## 배치별 착수 노트

### G1 — 문구·조문표기 (33건)
- ⚠️ **법령 인용 정정 4건은 KoreanLaw 본문 확인이 착수 조건이다**(메모리 ★★★ `feedback_korean_law_citation_verify`):
  `IG-079`(§22① 1호↔2호 뒤바뀜) · `IG-134`(§49의2④ → ⑤·⑥) · `IG-142`(§14①3호 → 2호) · `IG-151`(법/령 층위 누락).
- ⚠️ **「문구만」이 아닌 3건**이 섞여 있다 — 표시 금액이 실제로 바뀐다:
  `IG-100`(만원 절사 제거) · `IG-118`(옵션 카운트) · `IG-159`(`7.000000000000001%`).
- `IG-023`·`IG-035`는 「문구를 고칠지 구현을 고칠지」 택일이다. `IG-035`는 **구현 쪽이 정합**이라 G3으로 보냈다.

### G2 — 엔진 단일소스 위임 (23건)
- 축 하나가 절반을 차지한다: **평가기준일(`valuationDate`/`deathDate`) 미전달 10건** —
  `IG-027`·`034`·`041`·`053`·`083`·`085`·`127`·`149`·`153`·`155`. 수정이 사실상 동일하다.
- 나머지는 「UI가 엔진 산식을 로컬 재구현」(`IG-030`·`033`·`067`·`088`·`089`·`105`·`156`)과
  「엔진 echo를 안 읽음」(`IG-078`·`091`·`140`).
- 검증은 **표시값과 엔진 값의 동치**를 단언한다. 뮤테이션 프로브로 구별력 확인 필수.

### G3 — 미입력→0 (25건) · **가장 위험**
- `lib/calc/gift-deemed-validate.ts`·`gift-tax-form-validate.ts`·`capital-forms.tsx` 세 파일에 집중.
- 두 방향이 한 축이다: **⑧이 안 막아 0이 흘러가는 것**(13건)과 **④가 0을 보내 엔진 `?? fallback`을 죽이는 것**(12건).
  둘 다 저장소 정책 「자동 안분 fallback 금지 · 미입력은 검증 오류로 차단」의 같은 위반이다.
- `IG-014`·`IG-051`·`IG-120`은 **`|| undefined`가 0을 삼키는** 동일 함정 — 셋을 같은 형태로 고친다.

### G4 — 게이트 OFF 값 정리 (16건)
- BLOCKER `IG-006`(카테고리 변경 시 §14 유령 담보채무)과 **동형**이다. 그 수정을 선례로 쓴다.
- ⚠️ 방향이 정반대인 두 경우가 섞여 있다 — 키가 **없으면** 원본이 살아남고, 키를 **명시적 undefined**로
  넣어야 지워진다(메모리 `feedback_multikey_patch_stale_spread_overwrite`). 건마다 어느 쪽인지 먼저 판정.

### G5 — 공용컴포넌트·인쇄·저장 (13건)
- 하위 5축: 인쇄 언마운트 3(`IG-071`·`090`·`148`, 완전 동일 패턴) · native→공용 3 ·
  `RestartFromScratchButton` 2 · 죽은 `data-testid` 3 · 공통 저장 헬퍼 2.
- ⚠️ `data-testid` 3건은 **E2E 셀렉터가 걸린다** — 옮기기 전에 참조 spec을 grep할 것.

### G6 — 결과뷰·별지서식 (14건) · MAJOR 비중 최고(13/14)
- 「화면 값 ≠ 별지 값」이 반복 주제다(`IG-052`·`054`·`062`·`081`·`082`).
- `IG-039`(rowSpan 재설계)와 `IG-052`(PDF Props 확장)는 이 배치에서 가장 큰 단위 — 먼저 착수.

### G7 — 재산카드·주식평가 (10건) / G8 — 입력폼 구조·사후관리 (20건)
- G8에는 **위젯 신설 1건**(`IG-025` 중소기업 여부 토글 — 세율 10%→20%가 걸린다)과
  **죽은 경로 판정 5건**(`IG-095`·`101`·`111`·`135`·`154` — 살릴지 지울지 결정이 선행)이 있다.
- 사후관리 시뮬레이터 4건(`IG-011`~`013`·`095`)은 `app/calc/family-business-postmgmt/page.tsx` 한 파일이다.

## 전건 목록

### G1 문구·조문표기

- `IG-042` **MAJOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/EstateBodyDeposit.tsx:36` — 전세보증금 반환채권 카드가 엔진이 쓰지 않는 「÷12%」 산식을 라벨로 표시
- `IG-066` **MAJOR** · E-표시법령 · `components/calc/prior-gift/PriorGiftTableView.tsx:71` — 증여세 모드 「수증자」 칸이 증여자 관계를 보여주고, donor는 표에 없다
- `IG-069` **MAJOR** · E-표시법령 · `components/calc/results/GiftDonorPaidGrossUpSection.tsx:68` — gross-up 결과를 「최종 과세표준」으로 표기 — 실제는 공제 전 과세가액
- `IG-074` **MAJOR** · E-표시법령 · `components/calc/results/GiftTwoStreamDetailSection.tsx:34` — 「일반 증여 산출세액」 라벨에 결정세액을 표시한다
- `IG-079` **MAJOR** · E-표시법령 · `components/calc/results/deduction-breakdown/FinancialDeductionDetailCard.tsx:140` — 금융재산공제 §22① 1호·2호 인용이 서로 뒤바뀜
- `IG-097` **MINOR** · E-표시법령 · `app/calc/public-interest-postmgmt/page.tsx:110` — 페이지 부제가 1호·4호만 적혀 있으나 실제로는 6개 사유를 제공한다
- `IG-100` **MINOR** · E-표시법령 · `components/calc/exemption/ExemptionSummaryCard.tsx:15` — 결과 카드 금액이 만원 단위로 절사돼 실제 차감액과 다르게 표시
- `IG-108` **MINOR** · E-표시법령 · `components/calc/inheritance/FarmingCategorySection.tsx:91` — 내부 enum 값 corporate_stock이 화면 힌트로 그대로 노출
- `IG-109` **MINOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessCategorySection.tsx:95` — 내부 enum 값 corporate_stock이 화면 힌트로 그대로 노출
- `IG-116` **MINOR** · E-표시법령 · `components/calc/inheritance/besshi-buppyo-2/Buppyo2HeirSheet.tsx:47` — 부표2 화면에 「(앞쪽)」·용지 규격 표기가 빠져 형제 서식과 어긋난다
- `IG-118` **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/chip-config.ts:304` — 옵션 카운트가 최대주주 §22②를 안 세어 칩과 숫자가 어긋난다
- `IG-124` **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/EstateBodyReceivable.tsx:205` — 「회수불가능 사유」 hint가 존재하지 않는 별지 표기를 약속한다
- `IG-126` **MINOR** · E-표시법령 · `components/calc/inheritance/listed-stock/besshi/Page2DailyClosingTable.tsx:44` — 평가조서(을) 금액 칸에 font-mono 누락 — 형제 평가조서는 준수
- `IG-129` **MINOR** · E-표시법령 · `components/calc/inheritance/stock/StockItemEditor.tsx:236` — 종가 평균 칸 placeholder가 「주당 순손익 입력」이라고 다른 항목을 지시
- `IG-130` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/CrossHoldingResultCard.tsx:59` — 발행법인명 미입력 시 내부 rowId(UUID)를 화면에 그대로 노출
- `IG-132` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:394` — 영업권 배제 사유를 내부 enum 문자열 그대로 화면에 출력
- `IG-133` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx:401` — 최대주주 할증 배제 사유도 내부 enum 문자열 그대로 노출
- `IG-134` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeFilingGuideCard.tsx:102` — 신청·통지 기한 근거를 §49의2④로 인용 — 실제는 ⑤·⑥
- `IG-136` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:357` — 영업권 섹션 번호 11이 화면상 8·9·10보다 위에 그려진다
- `IG-137` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/Page1CoverSection.tsx:136` — 증여세 평가에서도 별지 총계 행이 "상속재산가액"으로 표시된다
- `IG-141` **MINOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts:162` — ⑲ 소계 산식 라벨이 보험준비금 3행을 포함하지 않아 값과 맞지 않는다
- `IG-142` **MINOR** · E-표시법령 · `components/calc/results/DebtAllocationResultCard.tsx:149` — 장례비 한도 근거를 §14①3호로 인용 — 3호는 채무, 장례비는 2호
- `IG-144` **MINOR** · E-표시법령 · `components/calc/results/GiftTwoStreamDetailSection.tsx:92` — 「= 일반 + 특례」 산식 라벨이 합산배제 스트림을 빠뜨린다
- `IG-145` **MINOR** · C-공용컴포넌트 · `components/calc/results/GiftTaxValuationFormTable.tsx:125` — 부표1 금액 칸에 font-mono 누락 — 콤마 세로 정렬 깨짐
- `IG-146` **MINOR** · E-표시법령 · `components/calc/results/allocation-breakdown/ComputedTaxDetailCard.tsx:66` — 「배부대상 산출세액 = ⑦ − 영리법인 면제」 산식이 차감항 하나를 빠뜨렸다
- `IG-147` **MINOR** · E-표시법령 · `components/calc/results/RelatedCorpResultSection.tsx:141` — 교재 예제의 고정 금액을 모든 §45의3 결과에 「본 시스템 산출」로 표시
- `IG-150` **MINOR** · E-표시법령 · `components/calc/results/deduction-breakdown/FinancialDeductionDetailCard.tsx:152` — 금융재산공제 소계 라벨의 산식이 실제 값과 다르다
- `IG-151` **MINOR** · E-표시법령 · `components/calc/results/payment-in-kind/PaymentInKindCard.tsx:158` — 충당순서 인용에 법/령 구분이 없어 §74②가 다른 조문으로 읽힌다
- `IG-158` **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:305` — §69 산출근거 각주의 「3%」가 하드코딩돼 연도율과 어긋난다
- `IG-159` **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:486` — 신고세액공제 율 표시가 2017년에 「7.000000000000001%」로 나온다
- `IG-160` **MINOR** · E-표시법령 · `components/calc/TaxCreditBreakdownCard.tsx:290` — §69 신고분 세액 산식에 §71 농지감면 차감항이 빠져 등식이 안 맞는다
- `IG-164` **MINOR** · E-표시법령 · `components/calc/results/source-summary/PriorGiftSummaryTable.tsx:130` — 기본(auto) 모드에서 증여재산공제·과세표준 열과 소계가 항상 0
- `IG-023` **MAJOR** · E-표시법령 · `components/calc/exemption/ExemptionChecklistPanel.tsx:104` — 칩 툴팁이 「값 보존」이라 하지만 해제 시 입력값이 삭제된다

### G2 엔진 단일소스

- `IG-027` **MAJOR** · E-표시법령 · `components/calc/gift/SpecialTreatmentAssetSelector.tsx:35` — 특례 귀속 자산 평가액을 자체 산식으로 뽑아 주식·부동산이 0으로 표시
- `IG-030` **MAJOR** · E-표시법령 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:61` — 차감 미리보기의 주식가액이 엔진 §60 평가순위와 달라 카드가 안 뜬다
- `IG-032` **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:165` — 자격 미리보기가 자동판정 전 입력으로 판정해 항상 미충족
- `IG-033` **MAJOR** · E-표시법령 · `components/calc/inheritance/DebtAllocationInput.tsx:115` — 장례비 합계가 §9②1호 500만 최소보장을 빠뜨려 엔진과 다름
- `IG-034` **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:173` — 공제 한도 미리보기가 deathDate 없이 계산돼 개정 전 상속에 오표시
- `IG-036` **MAJOR** · B-3중패턴 · `components/calc/inheritance/InheritanceReviewSummary.tsx:96` — 계산 전 요약이 체크리스트 게이트를 무시해 미적용 공제를 「적용 예정」으로 표시
- `IG-041` **MAJOR** · E-표시법령 · `components/calc/inheritance/estate-card/EstateChipInlineExpand.tsx:128` — 협의분할 패널 기준액이 평가기준일을 빼고 계산돼 칩 평가액과 다르다
- `IG-049` **MAJOR** · E-표시법령 · `components/calc/inheritance/family-business/FbDecedentRequirementsSection.tsx:54` — 피상속인 지분 임계 40/20 하드코딩 — 엔진은 상속개시일 시기별
- `IG-053` **MAJOR** · E-표시법령 · `components/calc/inheritance/listed-stock/ListedStockValuationPreviewCard.tsx:42` — 평가액 미리보기가 평가기준일 미전달 — §53⑧2호 배제를 못 본다
- `IG-067` **MAJOR** · E-표시법령 · `components/calc/results/DebtAllocationResultCard.tsx:64` — 장례비 500만원 최소 인정 미반영 — 카드 합계가 엔진 공제액과 다름
- `IG-078` **MAJOR** · E-표시법령 · `components/calc/results/allocation-breakdown/CorporateGiftCreditDetailCard.tsx:31` — 영리법인 과세표준 역산값이 법인별 한도 산식 분자와 일치하지 않는다
- `IG-083` **MAJOR** · E-표시법령 · `components/calc/EstateItemTableView.tsx:62` — 평가액 칸이 평가기준일 없이 계산돼 엔진값과 어긋난다
- `IG-085` **MAJOR** · E-표시법령 · `components/calc/PropertyValuationForm.tsx:327` — 「재산 합계 (예상)」가 평가기준일을 안 넘겨 날짜기반 자산이 0원
- `IG-088` **MAJOR** · E-표시법령 · `components/calc/property-valuation-preview.tsx:45` — 미리보기 §66 담보채권액이 신용보증기관 보증액을 안 뺀다
- `IG-089` **MAJOR** · E-표시법령 · `components/calc/results/source-summary/PresumedInheritanceTable.tsx:98` — 소명대상 금액이 §15 임계 분기를 무시하고 1년+2년을 그대로 더한다
- `IG-091` **MAJOR** · E-표시법령 · `components/calc/results/source-summary/PriorGiftSummaryTable.tsx:133` — 영리법인 사전증여 산출세액을 corporateGiftComputedTax에서 안 읽어 항상 공란
- `IG-105` **MINOR** · E-표시법령 · `components/calc/inheritance/CohabitAncillaryLandBlock.tsx:86` — §154⑦ 지역별 배율이 UI 안에서만 두 번 재선언(엔진과 3중)
- `IG-127` **MINOR** · B-3중패턴 · `components/calc/inheritance/stock/StockItemEditor.tsx:372` — 협의분할 기준 평가액만 평가기준일 fallback을 빼먹어 테이블과 갈린다
- `IG-140` **MINOR** · E-표시법령 · `components/calc/prior-gift/AggregationSummary.tsx:85` — 「§28 공제 대상」 합계에 제척기간 만료 회차가 그대로 들어간다
- `IG-149` **MINOR** · E-표시법령 · `components/calc/results/deduction-breakdown/PersonalDeductionDetailCard.tsx:45` — 인적공제 카드가 현행 금액·연령을 하드코딩 — 2016년 前 상속에서 라벨≠금액
- `IG-153` **MINOR** · E-표시법령 · `components/calc/CohabitantTableView.tsx:101` — 미성년·연로자 배지가 연령 임계를 19/65로 하드코딩 — 2016년 개정 전 tier 미반영
- `IG-155` **MINOR** · E-표시법령 · `components/calc/StockValuationForm.tsx:54` — 주식 합계 미리보기가 단일진실 헬퍼를 우회해 할증 판정이 갈린다
- `IG-156` **MINOR** · E-표시법령 · `components/calc/HeirTableView.tsx:169` — 미성년 배지가 사용자 지정 override를 무시해 엔진과 어긋난다

### G3 미입력→0 (validate+fallback)

- `IG-014` **MAJOR** · B-3중패턴 · `components/calc/deemed-gift/capital-forms.tsx:211` — 합병대가 미입력 → ④가 0을 보내 엔진 `?? face` fallback이 죽고 §28③2가 항상 0원
- `IG-015` **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:521` — 저가감자 단일 — 산식 인자 2칸이 ⑧에 없고, ⑧이 지키는 칸은 산식에 안 쓰인다
- `IG-016` **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:256` — 증자 §39 「이익 귀속 주식수」가 ⑧ 미검증 — 0이면 사실과 다른 제외 사유가 뜬다
- `IG-017` **MAJOR** · A-배관 · `components/calc/deemed-gift/capital-forms.tsx:205` — 합병 §38 주식교부 단일모드 「대주주등 주식수」가 ⑧ 미검증 → 0원
- `IG-018` **MAJOR** · A-배관 · `components/calc/deemed-gift/convertible-stock-form.tsx:118` — 전환주식 «분모 신주수» 미입력을 ⑧validate가 안 봐 증여이익이 조용히 0원
- `IG-019` **MAJOR** · F-도달가능성 · `components/calc/deemed-gift/other-forms.tsx:206` — 초과배당 «정산 입력»을 켜도 증여자 관계를 안 고르면 정산이 조용히 계산되지 않는다
- `IG-028` **MAJOR** · B-3중패턴 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:88` — 지운 연도 칸이 0으로 저장돼 5년 평균을 끌어내린다
- `IG-029` **MAJOR** · A-배관 · `components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx:87` — 연도 칸을 건너뛰면 배열에 구멍 → Zod가 null을 거절해 계산 차단
- `IG-031` **MAJOR** · D-타입 · `components/calc/inheritance/CorporateHeirFields.tsx:187` — ⑩ 지분율 입력이 부동소수 왕복으로 깨져 두 자리 입력 불가
- `IG-035` **MAJOR** · E-표시법령 · `components/calc/inheritance/FamilyBusinessEligibilitySection.tsx:340` — 「미입력 시 기준 미충족」 hint가 엔진 동작과 정반대
- `IG-048` **MAJOR** · B-3중패턴 · `components/calc/inheritance/family-business/FamilyBusinessHeirSelector.tsx:118` — 자동선택 경로에서 생년월일 칸이 항상 뜨고 입력값은 엔진에서 무시된다
- `IG-050` **MAJOR** · B-3중패턴 · `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:211` — 최대주주 할증 기업규모가 '중소기업'으로 보이나 store는 미입력
- `IG-051` **MAJOR** · A-배관 · `components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection.tsx:319` — 직전기 배당률 0을 입력할 수 없는데 validate는 0을 요구
- `IG-057` **MAJOR** · A-배관 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeToggle.tsx:40` — 평가심의위 토글 ON 기본값 0이 Zod positive()에 걸려 계산 전체가 400
- `IG-059` **MAJOR** · B-3중패턴 · `components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable.tsx:115` — 보험법인 토글이 useState 로컬 캐시라 이력 자동채움 후 OFF로 남는다
- `IG-060` **MAJOR** · B-3중패턴 · `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx:334` — 총액 모드 평가차액 입력이 음수를 못 받아 부호가 조용히 반전된다
- `IG-063` **MAJOR** · A-배관 · `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx:127` — currentClientId가 부모에서 안 넘어와 세무사 모드에서 이력 조회가 항상 0건
- `IG-086` **MAJOR** · A-배관 · `components/calc/gift-tax-form-validate.ts:339` — 증여 ⑧이 납부지연가산세 ON의 미납액·법정납부기한 미입력을 안 막는다
- `IG-092` **MINOR** · A-배관 · `app/calc/family-business-postmgmt/page.tsx:169` — 이자율 칸을 비우면 게이트를 통과해 이자상당액이 조용히 0
- `IG-094` **MINOR** · A-배관 · `app/calc/public-interest-postmgmt/Clause2Form.tsx:115` — undefined 센티널 가드가 IntegerInput 앞에서 무력화된다
- `IG-102` **MINOR** · A-배관 · `components/calc/gift/GiftCreditChecklist.tsx:433` — ⑧이 동시증여를 `simultaneousGifts`로만 보고 대납 조합을 못 막아 API 400
- `IG-103` **MINOR** · B-3중패턴 · `components/calc/gift/GiftCreditChecklist.tsx:472` — 새 동시증여 건이 donor="father" 기본값으로 생성돼 즉시 동일그룹 차단
- `IG-117` **MINOR** · A-배관 · `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:52` — 날짜 역변환에 new Date() 직접 호출 — date-coerce 정책 위반
- `IG-120` **MINOR** · B-3중패턴 · `components/calc/inheritance/estate-card/variants/EstateBodyFinancial.tsx:251` — 원천징수율 0% 입력이 `|| undefined`에 먹혀 항상 14%로 되돌아감
- `IG-161` **MINOR** · A-배관 · `components/calc/gift-tax-form-validate.ts:446` — ⑧ 대납 차단 목록에 「동시증여 다중 건」이 없어 ⑫에서 400이 난다

### G4 게이트 OFF 값정리

- `IG-020` **MAJOR** · A-배관 · `components/calc/deemed-gift/related-corp-form.tsx:166` — 간접출자법인 섹션이 숨겨져도 ⑧validate가 그 행을 계속 요구 — 영구 차단
- `IG-021` **MAJOR** · F-도달가능성 · `components/calc/deemed-gift/related-corp-form.tsx:146` — 화면에서 사라진 간접출자법인 행이 그대로 전송돼 증여의제이익을 바꾼다
- `IG-022` **MAJOR** · A-배관 · `components/calc/deemed-gift/related-corp-form.tsx:326` — §⑭ 지배주주등 보유비율 행이 숨겨져도 validate가 계속 요구
- `IG-045` **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation.tsx:194` — §61 경로 A 전환 시 공실 3필드가 남아 숨겨진 채 평가액을 올린다
- `IG-047` **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:322` — 평가기간 외 행은 체크는 켜지지만 평균·채우기에서 침묵 제외된다
- `IG-055` **MAJOR** · F-도달가능성 · `components/calc/inheritance/steps.tsx:177` — 협의분할 모드 진입이 봉안비만 안 지워 숨겨진 값이 계속 공제된다
- `IG-064` **MAJOR** · A-배관 · `components/calc/prior-gift/GiftRowEditor.tsx:509` — §53의2 칸이 관계 변경으로 사라져도 값이 남아 validate가 영구 차단
- `IG-065` **MAJOR** · A-배관 · `components/calc/prior-gift/GiftRowEditor.tsx:479` — 영리법인 수증자를 고르면 과세표준이 지워지는데 manual 모드 플래그는 남는다
- `IG-084` **MAJOR** · F-도달가능성 · `components/calc/HeirEditor.tsx:475` — 대습상속인 토글을 켜면 「상속인 여부」의 유일한 입력 경로가 사라진다
- `IG-098` **MINOR** · B-3중패턴 · `components/calc/deemed-gift/contribution-form.tsx:215` — 현물출자 소액주주 의제 토글은 명부 ON 시 사라지지만 값은 계속 전송된다
- `IG-112` **MINOR** · F-도달가능성 · `components/calc/inheritance/Step4Deductions.tsx:458` — 재해손실공제 카드가 자기 토글을 끄면 스스로 언마운트된다
- `IG-115` **MINOR** · F-도달가능성 · `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:98` — 다이얼로그가 항상 마운트돼 있어 재오픈 시 이전 선택이 남는다
- `IG-119` **MINOR** · A-배관 · `components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx:186` — 거래소 ON이 전환 토글을 언마운트하는데 ⑫는 그 안의 칸을 계속 요구
- `IG-131` **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/EstimatedProfitToggle.tsx:116` — 추정이익 폐기 확인 게이트가 기관명·사유를 데이터로 안 본다
- `IG-138` **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/PreIpoListingToggle.tsx:105` — 폐기 확인 게이트가 신고일·준비유형 입력을 데이터로 세지 않는다
- `IG-139` **MINOR** · F-도달가능성 · `components/calc/prior-gift/GiftRowEditor.tsx:280` — 증여자를 「선택」으로 되돌리면 사망일 입력칸이 사라지고 빈 문자열이 남는다

### G5 공용컴포넌트·인쇄·저장

- `IG-071` **MAJOR** · F-도달가능성 · `components/calc/results/InheritanceTaxResultView.tsx:535` — 「재산 평가 내역」은 접힘 시 언마운트되어 인쇄가 빈 껍데기다
- `IG-075` **MAJOR** · C-공용컴포넌트 · `components/calc/results/InheritanceTaxResultView.tsx:696` — 「처음으로」가 확인 없이 전체 입력을 폐기한다
- `IG-090` **MAJOR** · C-공용컴포넌트 · `components/calc/results/source-summary/SourceDataSummarySection.tsx:77` — {open && ...} 언마운트라 인쇄 시 4표가 통째로 빠진다
- `IG-093` **MINOR** · C-공용컴포넌트 · `app/calc/inheritance-postmgmt/page.tsx:283` — 분기 토글을 native checkbox로 작성 — ToggleCard 강제 규칙 위반
- `IG-096` **MINOR** · C-공용컴포넌트 · `components/calc/deemed-gift/SpecificCorpShareholderTable.tsx:124` — native `<input type="checkbox">` — ToggleCard 강제 규칙 위반
- `IG-099` **MINOR** · D-타입 · `components/calc/deemed-gift/other-forms.tsx:188` — ToggleCard에 직접 넘긴 data-testid 6건이 DOM에 도달하지 않는다
- `IG-106` **MINOR** · D-타입 · `components/calc/inheritance/CohabitRequirementBlock.tsx:133` — ToggleCard에 넘긴 data-testid는 DOM에 닿지 않는 죽은 prop
- `IG-122` **MINOR** · D-타입 · `components/calc/inheritance/estate-card/variants/EstateBodyCryptoAsset.tsx:119` — 공용 RadioCardGroup·ToggleCard에 넘긴 data-testid가 DOM에 나가지 않음
- `IG-128` **MINOR** · C-공용컴포넌트 · `components/calc/inheritance/stock/StockItemEditor.tsx:228` — 전후 2개월 종가 평균이 CurrencyInput 대신 native input이다
- `IG-143` **MINOR** · C-공용컴포넌트 · `components/calc/results/GiftTaxResultView.tsx:744` — 「처음으로」가 폐기 확인 없이 전체 입력을 초기화
- `IG-148` **MINOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:66` — 상속공제 상세 내역은 접힌 상태로 인쇄하면 내용이 통째로 빠진다
- `IG-162` **MINOR** · C-공용컴포넌트 · `components/calc/gift-tax-save-handler.ts:28` — 증여세만 공통 저장 헬퍼를 안 써 미결(임시) 저장이 안 된다
- `IG-163` **MINOR** · C-공용컴포넌트 · `components/calc/gift-tax-save-handler.ts:48` — 증여세 저장 토스트에만 이력 한도 경고가 없다

### G6 결과뷰·별지서식

- `IG-039` **MAJOR** · E-표시법령 · `components/calc/inheritance/deduction-besshi/Besshi6_2Section2.tsx:176` — 별지6호의2 상속인별 표 — thead의 rowSpan={7}이 tbody를 못 덮어 본문이 한 칸 어긋난다
- `IG-052` **MAJOR** · E-표시법령 · `components/calc/inheritance/filing-form-9/FilingForm9PdfDownloadButton.tsx:57` — 별지9호 PDF가 물납·분납액 인자를 안 받아 화면과 다른 값 출력
- `IG-054` **MAJOR** · A-배관 · `components/calc/inheritance/listed-stock/besshi/Page1CoverSection.tsx:224` — §53⑧2호 게이트 실패 라벨이 어느 화면에도 표시되지 않는다
- `IG-062` **MAJOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx:41` — 별지 2쪽 「다」가 §55① 후단 0 하한을 빼먹어 다+라 ≠ 마
- `IG-068` **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxResultView.tsx:280` — 「증여세 결정세액」 라벨 아래에 가산세 포함 총 납부세액 표시
- `IG-070` **MAJOR** · A-배관 · `components/calc/results/InheritanceTaxResultView.tsx:261` — 납부지연가산세만 있으면 총 납부세액 행이 통째로 사라진다
- `IG-072` **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxResultViewHelpers.tsx:88` — 연부연납 안내가 가산율 「연 1.8%」를 하드코딩 — 현행 3.1%
- `IG-073` **MAJOR** · E-표시법령 · `components/calc/results/GiftTaxValuationFormTable.tsx:260` — 부표1이 §47② 합산 제외 사전증여까지 A24 본문 행으로 찍는다
- `IG-076` **MAJOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx:164` — 동거주택공제 「미적용」 표시 경로가 게이트에 갇혀 영구 도달 불가
- `IG-077` **MAJOR** · E-표시법령 · `components/calc/results/deduction-breakdown/DeductionLimitDetailCard.tsx:79` — §24 한도 산정에서 상속포기 차감액이 같은 값으로 두 번 표시된다
- `IG-080` **MAJOR** · E-표시법령 · `components/calc/results/useInheritanceResultDerived.ts:144` — 분납 신고기한이 비거주자 9개월(§67④)을 무시하고 항상 6개월
- `IG-081` **MAJOR** · E-표시법령 · `components/calc/results/useInheritanceResultDerived.ts:130` — 물납 요건 미충족인데 별지9호 ㊵에 물납액이 찍힌다
- `IG-082` **MAJOR** · E-표시법령 · `components/calc/results/inheritance/CulturalHeritageDeferralCard.tsx:65` — 「납부할세액 (별지9호 ㊳)」이 가산세를 뺀 다른 값이다
- `IG-152` **MINOR** · F-도달가능성 · `components/calc/results/deduction-breakdown/FarmingDeductionDetailRowExport.tsx:78` — 화면에 없는 영농 복제본이 30억 고정 — 유일한 UI 테스트가 그것을 본다

### G7 재산카드·주식평가

- `IG-040` **MAJOR** · C-공용컴포넌트 · `components/calc/inheritance/estate-card/CategoryChangeDialog.tsx:51` — 카테고리 목록을 단일 출처에서 복제하면서 crypto_asset을 빠뜨렸다
- `IG-043` **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:251` — §23의2 동거주택 공제 토글이 「상업용 건물」 자산에도 열린다
- `IG-044` **MAJOR** · A-배관 · `components/calc/inheritance/estate-card/variants/EstateBodyConvertibleBond.tsx:86` — 상장 신주인수권증서의 유일한 입력칸을 ⑫Zod가 검증하지 않아 미입력 통과
- `IG-046` **MAJOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx:550` — 후보 0건 안내가 가리키는 「평가기간 외 목록」이 렌더되지 않는다
- `IG-056` **MAJOR** · A-배관 · `components/calc/inheritance/stock/StockItemEditor.tsx:249` — §63②3호 토글이 unlistedShareMode를 안 써서 validate가 숨은 칸을 요구한다
- `IG-058` **MAJOR** · E-표시법령 · `components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeResultCard.tsx:129` — 평가심의위 신청 기한 카운트다운이 신고기한 자체를 기한으로 표시
- `IG-061` **MAJOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable.tsx:110` — 행 모드 토글 OFF가 확인 없이 입력 행을 전부 삭제한다
- `IG-121` **MINOR** · F-도달가능성 · `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx:332` — RTMS 자동조회 버튼이 평가기준일 미입력을 disabled 조건에서 빠뜨려 클릭 무반응
- `IG-123` **MINOR** · E-표시법령 · `components/calc/inheritance/estate-card/variants/FbAdditionalBusinessesSection.tsx:183` — 복수가업 미리보기가 자격 미충족일 때도 0이 아닌 공제액을 보여준다
- `IG-135` **MINOR** · F-도달가능성 · `components/calc/inheritance/unlisted-stock-v2/GoodwillCalculationTable.tsx:30` — onIntangibleDeductionChange는 아무 데도 연결되지 않은 죽은 prop

### G8 입력폼구조·사후관리

- `IG-011` **MAJOR** · F-도달가능성 · `app/calc/family-business-postmgmt/page.tsx:364` — 정당사유 17개가 위반 유형과 무관하게 전부 노출 — 엔진은 무조건 면제
- `IG-012` **MAJOR** · E-표시법령 · `app/calc/family-business-postmgmt/page.tsx:471` — ③의 「4호 위반: 아니오」와 ②의 4호 추징이 같은 화면에서 모순
- `IG-013` **MAJOR** · E-표시법령 · `app/calc/family-business-postmgmt/page.tsx:215` — 수정신고 기한을 첫 번째 위반 사건 날짜로만 계산
- `IG-024` **MAJOR** · F-도달가능성 · `components/calc/gift/SimultaneousGiftCard.tsx:272` — 동시증여 서브카드 안에 또 동시증여 토글이 열리고 입력은 ④가 폐기
- `IG-025` **MAJOR** · A-배관 · `components/calc/gift/StockBurdenedDebtSection.tsx:230` — 중소기업 여부 입력 위젯이 없어 ④가 항상 false 전송 (세율 10%→20%)
- `IG-026` **MAJOR** · E-표시법령 · `components/calc/gift/PriorGiftHistoryModal.tsx:315` — 상속세 모드에서 적용되지 않은 필터 조건을 적용된 것처럼 표시
- `IG-037` **MAJOR** · F-도달가능성 · `components/calc/inheritance/Step4Deductions.tsx:179` — groupBVisibleCount가 heirWaiver를 안 세어 활성이어도 칸이 가려짐
- `IG-038` **MAJOR** · B-3중패턴 · `components/calc/inheritance/Step4Deductions.tsx:461` — 감정평가수수료만 ④에 체크리스트 게이트가 없어 「계산 제외」가 거짓
- `IG-087` **MAJOR** · F-도달가능성 · `components/calc/UnlistedStockSimpleFields.tsx:44` — §54④ 6호 선택 시 순손익 3칸이 사라져 영업권 입력 경로가 없어진다
- `IG-095` **MINOR** · F-도달가능성 · `app/calc/family-business-postmgmt/page.tsx:300` — 「직접입력 모드로 공제받은 사례」 토글이 아무것도 하지 않는다
- `IG-101` **MINOR** · F-도달가능성 · `components/calc/exemption/ExemptionChecklistPanel.tsx:85` — 칩의 amber 경고 점 분기가 구조적으로 도달 불가
- `IG-104` **MINOR** · F-도달가능성 · `components/calc/inheritance/AutoSuggestBadge.tsx:60` — 호출부가 fallback 값을 넘겨 「채우기」 미도달·「되돌리기」 무동작
- `IG-107` **MINOR** · A-배관 · `components/calc/inheritance/EstateCommonAttributesSection.tsx:153` — 영농·가업 토글을 동시에 켤 수 있으나 validate가 계산을 차단
- `IG-110` **MINOR** · E-표시법령 · `components/calc/inheritance/FarmingEligibilitySection.tsx:548` — 자격자 전부 해제(빈 배열) 상태에서 안내문이 정반대 규칙을 설명
- `IG-111` **MINOR** · F-도달가능성 · `components/calc/inheritance/HeirAllocationInput.tsx:243` — showAreaInput을 true로 넘기는 호출부가 없어 분배 면적 입력 경로가 없다
- `IG-113` **MINOR** · A-배관 · `components/calc/inheritance/Step4DeductionChecklist.tsx:304` — 배우자 칩은 배우자 상속인이 없어도 「직접 입력 가능」이라 안내한다
- `IG-114` **MINOR** · B-3중패턴 · `components/calc/inheritance/SubstituteHeirPanel.tsx:139` — 기존 대습 그룹 선택 시 피대습자 성명만 동기화하고 원래순위는 안 맞춘다
- `IG-125` **MINOR** · F-도달가능성 · `components/calc/inheritance/family-business/FbDecedentRequirementsSection.tsx:85` — 대표이사 재직구간 절반 입력 시 '입력 필요'가 아니라 '미충족' 표시
- `IG-154` **MINOR** · F-도달가능성 · `components/calc/GiftTaxForm.tsx:361` — 입력 화면의 저장하기 버튼 2개가 구조적으로 항상 disabled
- `IG-157` **MINOR** · E-표시법령 · `components/calc/InheritanceTaxForm.tsx:449` — 한국어 라벨 오류 포매터가 미배선 — Zod 내부 경로가 그대로 노출

---

## G8 종결 기록 (2026-09-11) — 입력폼 구조·사후관리 20건

**PR**: (본 브랜치) · **anchor**: 순수 18 + 렌더 33 + 모달 3 = **54** · **E2E 신규 6건**
**회귀**: vitest 1,991파일 20,867건 통과 · E2E 1,151 passed / 1 skipped / 0 failed · tsc 0 · lint 0 error

### 법령 실측 (KoreanLaw MCP)

| 조문 | 확인 내용 | 쓰인 곳 |
|---|---|---|
| 상증령 §15⑧ | 정당한 사유는 **1호(자산처분)·2호(미종사)·3호(지분감소) 3개뿐**. 법 §18의2⑤**4호(고용 미달)에는 정당사유 규정이 없다** | IG-011 |
| 상증법 §18의2⑨ | 기한 = 「제5항 각 호의 어느 하나에 **해당하는 날**이 속하는 달의 말일부터 6개월」 ⇒ **사건별** | IG-013 |
| 소득세법 §104①11 | 가목1) 1년미만·비중소 30% / 가목2) 20·25% 누진 / 나목1) 중소 10% / 나목2) 20% | IG-025 |

### 수정 행위별 묶음

| 묶음 | 항목 | 한 일 |
|---|---|---|
| 사후관리 페이지 | IG-011·012·013·095 | 정당사유를 위반 유형으로 필터(+유형 변경 시 stale 사유 정리) · ③↔② 모순 경고 · 기한을 **추징 대상 중 가장 이른 날** 기준 + 건별 기한 열 · `usedDirectInput`을 읽기 전용 배지로 강등 |
| Step4 공제 | IG-037·038·104·113 | `groupBVisibleCount`에 heirWaiver 산입 · ④ `appraisalFee`에 `isManualItemActive` 게이트 · AutoSuggestBadge에 **raw 폼 값** 전달 · 배우자 칩을 `hasSpouse`로 비활성 |
| 도달 불가 경로 | IG-087·101·111·154 | §54④ 6호에서 순손익 3칸 **유지**(영업권) · 죽은 amber 경고 분기·`itemMap` prop 제거 · `showAreaInput` 배선 + DecimalInput 전환 · 증여 저장 버튼을 `isFormEmpty` 기준으로 |
| 증여 폼 구조 | IG-024·025·026 | `hideSimultaneous` prop으로 중첩 동시증여 차단 · 중소기업 여부 ToggleCard 신설 · 사전증여 필터 요약 mode 분기 |
| 상속인·자산 토글 | IG-107·110·114·125 | 영농↔가업 상호 `disabled` · `qualifiedHeirIds=[]` 안내 분기 · 대습 그룹 선택 시 `substituteForRelation` 동기화 · 반쪽 재직구간을 「입력 필요」로 |
| 오류 포매터 | IG-157 | 특화 포매터 배선 + **라벨표를 실제 Zod 스키마 키로 재작성**(20개 최상위 + 중첩) · 일반 포매터 제거 |

### 이 배치에서 배운 것

1. **「최종값이 X다」와 「X를 구하는 입력이 필요 없다」는 다른 명제다.** IG-087의 뿌리가 이것이다 —
   §54④ 6호는 최종 평가액이 순자산가치지만, 그 순자산가치에 §59② 영업권이 가산되고 영업권의
   분자가 3년치 순손익이다. 「무조건 순자산 ⇒ 순손익 불필요」라는 한 단계 생략이 화면에서 입력
   경로를 지웠다. 엔진은 이미 그 구분을 코드로 적어 두고 있었다(`mapToNetAssetOnlyReason`이
   6호를 `undefined`로 매핑 = §55③ 배제 대상 아님). **UI가 엔진의 분기를 «요약»하면 틀린다.**

2. **🔴 통과하던 테스트가 결함을 지키고 있었다 — 7개 배치 연속.**
   `unlisted-simple-net-income-visibility.test.tsx`가 「6호 → 순손익 섹션 숨김」을 단언하고 있었고,
   파일 헤더까지 「엔진 분기와 단일 진실」이라고 적혀 있었다. 실제로는 **엔진과 어긋난 요약**이었다.
   전건 회귀에서 이 1건만 빨개진 것이 발견 경로다. (G1 2 · G2 1 · G6 2 · G7 3 · G8 1)

3. **뮤테이션 프로브가 구별력 0을 두 번 잡았다 — 둘 다 「내가 축을 잘못 봤다」였다.**
   - IG-125: 가드를 **두 곳**(판정 useMemo · 안내 문구)에 넣고 anchor는 **문구만** 봤다.
     판정 가드를 지워도 문구 가드가 같은 말을 계속 내보내 통과했다. 실제 축은 `autoMet`
     (null=ℹ️ 안내 / false=✗ 미충족)이다 ⇒ 프리뷰 카드의 아이콘·「미충족」 유무로 바꿨다.
   - IG-013: 배너 단언을 **결과 섹션 전체**(`fb-postmgmt-result`)에 걸었더니, 같은 날짜가
     「건별 기한 열」에도 있어 배너가 틀려도 통과했다 ⇒ 배너에 `data-testid`를 주고 스코프했다.
     **부분이 전체에 포함되면 전체를 보는 단언은 그 부분을 증명하지 못한다.**

4. **E2E 요약 줄을 「마지막 passed 줄」로 읽으면 실패가 사라진다.** 프로브 1차에서 그렇게 집계해
   「7 passed」만 보고 5건 전부 구별력 있다고 오독할 뻔했다. Playwright는 실패 시
   `1 failed` **다음에** `7 passed`를 찍는다 ⇒ **exit code + 요약 전 줄**로 판정할 것.
   (`feedback_gh_watch_pipe_exit0_false_green`과 같은 층위의 함정이 로컬에도 있다.)

5. **전역 문자열 치환이 «내가 방금 쓴 주석»을 먹는다 — 이 배치에서 두 번.**
   `disabled={!result}` → `disabled={isFormEmpty}` 치환이 바로 위에 쓴 설명 주석 속 같은 문자열까지
   바꿔 주석이 자기모순이 됐고, `assert 'X' not in s` 단언도 그 주석 때문에 실패했다.
   ⇒ **치환 전에 주석을 쓰지 않는다**(또는 치환 뒤 diff를 전수 읽는다).
   G6의 `§24①2호` 사고(`법인세령 §24①2호바`까지 바꿈)와 같은 부류다.

6. **라벨표는 「있다」가 아니라 「스키마와 맞다」로 재야 한다.** IG-157의 ½ 정정이 지적한 대로,
   포매터를 배선만 하면 리뷰가 든 대표 증상(`deductionInput.familyBusiness.heirId`)이 그대로
   남는다. 실제로 `INHERITANCE_FIELD_LABELS`는 최상위 20개 키 중 3개만 덮고 있었고,
   `inheritanceDate`·`priorGiftsTotal`처럼 **스키마에 없는 키**가 섞여 있었다.
   스키마 5개(`inheritanceTaxInputSchema`·deduction·credit·heir·estateItem)에서 키를 실측해 재작성했다.

### 별건으로 남긴 것 (범위 밖 — 보고만)

- **`PriorGiftHistoryModal`의 `useEffect` 누락 dep(`mode`)** — 이 배치 이전부터 있던 lint warning이다
  (master에서 동일 warning 실측). 고치면 모달 재조회 동작이 바뀔 수 있어 손대지 않았다.
- **`ExemptionChecklistPanel`의 칩별 「체크했지만 값 없음」 표시** — 죽은 분기를 지우면서 검토했다.
  그 신호 자체는 `warningCount` 그룹 배지로 이미 있고, 칩 단위로 다시 그리는 것은 요청 범위 밖이다.
- **`FarmingEligibilitySection`은 여전히 고아 컴포넌트다**(앱 마운트 지점 0건 — import처는 테스트
  2파일뿐). IG-110의 문구 분기는 **재마운트를 전제로** 고쳤다. 삭제·복원 판단은 별건이다.

---

## G3 종결 기록 (2026-09-11) — 미입력→0 (⑧validate·fallback) 25건 · **대장 전건 종결**

**anchor**: 순수 51 + 렌더 28 = **79** · **회귀**: vitest 1,998파일 20,946건 · E2E **1,151 passed / 0 failed** · tsc 0 · lint 0 error

### 이 배치의 결함은 한 형태였다

「미입력 → 조용히 0」이다. 엔진이 곱셈 인자를 0으로 받으면 증여재산가액이 0원이 되고,
**틀린 제외 사유**까지 함께 표시된다 — 「이익이 기준금액(3억) 미만」·「증자 후 1주가가
인수가 이하 — 이익 없음」. 사용자에게는 **과세 대상이 아닌 것으로** 보인다.

| 묶음 | 항목 | 한 일 |
|---|---|---|
| 증여의제 ⑧ 보강 | IG-014·015·016·017·018·019 | 곱셈 인자 5종 차단 추가 · `mergeConsideration`을 `\|\| undefined`로 돌려 엔진 `?? face` 복원 · 정산에 증여자 관계 필수화 |
| 0 보존 | IG-028·029·051·060·120 | 5년 현금 칸을 **자리 고정 + 명시 null**로 · 직전기 배당률·원천징수율의 `\|\| undefined` 제거 · 총액 평가차액 `allowNegative` |
| ⑧↔⑫ 미러링 | IG-086·102·103·161 | 법정납부기한 차단(상속과 동일 문구) · 대납 ⓓ·ⓔ를 Zod와 같은 문구로 · 새 동시증여 건을 관계 미선택으로 |
| 3중 불일치 | IG-035·048·050·059 | 규모 요건 필수 입력 + hint 정정 · `selectedHeir`를 `effectiveHeirId`로 · `companySize` 기본값 명시 저장 · 보험 토글을 데이터 파생으로 |
| 배선 | IG-057·063·092·094 | 평가심의위 ⑧ 추가 · `activeClientId` 전달 · 이자율 trim 가드 · `IntegerInput`에 `allowEmpty` |
| 타입·날짜 | IG-031·117 | 지분율을 문자열 보관으로 · `dateToStr`을 UTC 기준으로 통일 |

### 배운 것

1. **「차단을 더하면 기존 E2E가 전건 회귀한다」는 예상이 빗나갔다 — 0건이었다.**
   이 배치를 마지막에 둔 이유가 그 위험이었는데(memory `feedback_blocking_validation_full_e2e_regression`),
   IG-035·IG-057의 두 차단 모두 기존 spec을 하나도 깨지 않았다. 위험이 없었다는 뜻이 아니라
   **「예상 위험」과 「실측」이 다르다**는 뜻이다 — 순서 판단은 옳았고, 측정은 더 옳았다.

2. **🔴 워크트리 E2E에서 포트 격리를 빠뜨려 «남의 WIP»를 테스트했다.**
   1차 전건에서 주식양도세 spec 3건이 실패했다. 내 worktree는 master 커밋 그대로인데도
   실패한 이유는 `reuseExistingServer`가 **메인 트리의 3000 포트 dev 서버**를 재사용해
   다른 세션이 편집 중인 코드를 테스트했기 때문이다(`E2E_PORT=3111`로 재실행 → 0 failed).
   memory `feedback_worktree_e2e_port_isolation`이 정확히 이것을 경고하고 있었다.
   ⇒ **워크트리 E2E는 `E2E_PORT` 없이 돌리면 결과가 내 코드의 신호가 아니다.**

3. **leaf 직접호출 anchor는 「그 규칙이 배선됐는가」를 증명하지 못한다 — 구별력 0으로 드러났다.**
   IG-035의 `validateFamilyBusinessEnterpriseSize`를 직접 부르는 anchor 4건은 규칙을 지켰지만,
   `validateInheritanceTaxInput`에서 **호출을 통째로 지운** 뮤테이션을 하나도 못 잡았다.
   진입점으로 다시 재는 anchor 4건을 따로 두어 해소했다(`ig-ui-g3-fb-size-wiring`).

4. **같은 결함의 형제 인스턴스는 대장에 없어도 함께 고쳐야 한다.** IG-017은 「주식교부 단일모드」만
   지적했지만 `mergerNonStock`도 같은 `majorShares`를 곱한다 — 엔진을 읽고 두 분기를 함께 막았다.

5. **`|| undefined`의 «올바른 방향»이 항목마다 반대다.** IG-014는 **넣어야** 엔진 기본값이 살고,
   IG-051·IG-120은 **빼야** 0이 저장된다. 「이 관용구는 좋다/나쁘다」로 일반화하면 둘 중 하나를 망친다.

6. **희소 배열은 JSON에서 null이 된다.** IG-029의 400은 그 한 줄이 원인이었다
   (`const a=[]; a[2]=1; JSON.stringify(a)` → `[null,null,1]`). 자리를 지키려면 **명시 null**을 써야 한다.

### 별건으로 남긴 것

- **「납부지연가산세 토글 ON인데 미납액이 비었다」** 차단은 상속·주식도 하지 않는 **공유 갭**이다
  (IG-086 ½ 정정). 증여에만 더하면 새 불일치가 생기므로 3세목을 함께 볼 때 처리한다.
- **`Clause6Form`의 약한 센티널 가드** — `allowEmpty` 배선은 했으나 `canCalculate`의 판정 구조
  자체는 Clause2와 다르다. 공익법인 사후관리 전반은 이 리뷰 범위 밖이다.


---

## 별건 항목 정리 (2026-09-11 · 대장 종결 후)

리뷰 9배치를 닫으면서 「별건」·「범위 밖」으로 남긴 8건을 **착수 전에 전수 재실측**했다.
5건이 실재했고 3건은 닫혔거나 의도된 설계였다.

| # | 항목 | 실측 결과 | 조치 |
|---|---|---|---|
| 1 | 납부지연 토글 ON + 미납액 공란 | **실재** — 단 모집단은 **3이 아니라 2**(아래) | ✅ 공용 leaf 로 상속·증여 동시 차단 |
| 2 | `Clause6Form` 약한 센티널 | **닫힘** — G3 의 `allowEmpty` 배선으로 `canCalculate`가 `undefined`를 정확히 거른다 | 조치 없음 |
| 3 | `PriorGiftHistoryModal` `mode` 린트 경고 | **실재** — 스타일이 아니라 **결과가 갈리는** 자리였다 | ✅ deps 에 추가 |
| 4 | `FarmingEligibilitySection` 고아 | **실재** — import 하는 곳이 테스트 5파일뿐 | ❌ 보고만 (배선 여부는 제품 판단) |
| 5 | 인쇄 언마운트 | **실재** — 8파일 **9곳** | ✅ `PrintExpandable` 공용 래퍼 |
| 6 | `PropertyTaxForm` 「다시 계산하기」 | **실재 + 규약 위반**, 전 세목 중 **재산세만 남아 있었다** | ✅ 라벨↔동작 1:1 복원 |
| 7 | native checkbox 3건 | 다중 선택 목록 — 의도된 것 | 조치 없음 |
| 8 | `resolveEstateItemValue` 주석 드리프트 | **실재** — 「5단계」인데 실제로는 6단계 + 부수토지 가산 | ✅ 주석 정정 |

### 🔴 「3세목 공유 갭」은 **내 오기(誤記)였다** — 모집단은 2였다

IG-086 당시 「상속·증여·주식이 함께 겪는 갭」이라 적고 미뤘다. 실측하니 **주식에는 토글이
없다** — `components/calc/stock-transfer/PenaltyDetailBlock.tsx`는 `SectionHeader` 아래 칸이
항상 떠 있고 hint 가 「0이면 납부지연가산세를 계산하지 않습니다」라고 **명시**한다(의도된 설계).
양도는 결정세액에서 미납액을 파생하고 route 가 0을 전액으로 채운다(`transfer/route.ts:619`).

⇒ 이 축이 성립하는 곳은 상속·증여 **둘뿐**이었다. 「셋을 함께 봐야 한다」는 전제가 처리를
미루게 했는데, 그 전제 자체가 틀렸다. **미결로 미룰 때 적어 둔 모집단도 미검증 자산이다**
([[feedback_open_item_wording_is_also_unverified]]).

### 왜 공용 leaf 인가 — 두 세목의 ⑧이 **다른 층**을 본다

- 상속 `validateInheritanceTaxInput`은 **엔진 input** 을 본다 → 토글이 거기 없어 축이 안 보인다.
- 증여 `validateStep`은 **폼**을 본다 → 토글이 보인다.

층이 달라 각자 적으면 조건·문구가 드리프트한다. `validateLatePaymentFields`를 ④ 빌더 옆에
두고 양쪽이 부른다. 상속 쪽 배선(`handleCalculate`)은 순수 함수로 잴 수 없어 **E2E**가 덮는다
(leaf 직접 호출은 배선을 증명하지 않는다 — [[feedback_leaf_anchor_skips_zod_layer]]).

### ⚠️ 미룬 판단이 **옳았던** 유일한 건 — `divide-y` 겹선

별건 표의 「묶으면 `divide-y` 레이아웃이 바뀐다 — 별도 판단 필요」는 **맞았다**. 다른 항목들은
미룬 이유가 틀렸는데 이것만 반대였다.

Tailwind **v4** 의 `divide-y` 는 `:where(.divide-y > :not(:last-child))` 다(v4.3.3 생성 CSS
실측). **`display:none` 을 건너뛰지 않는다** — v3 의 `> :not([hidden]) ~ :not([hidden])` 과
다르다. 상세를 언마운트하지 않게 바꾸면:

```
종전(접힘): [h1, h2, … hN]           → hN 은 :last-child ⇒ 선 없음
변경(접힘): [h1, w1*, h2, w2*, … hN, wN*]   (* = display:none)
            → hN 이 :last-child 를 잃어 **border-bottom 획득** ⇒ 박스 테두리 위 겹선
```

실측으로 확인했다 — 픽스처 렌더 결과 `divide-y` 직계 자식 **15개**, 마지막이 숨겨진 래퍼였다.

⇒ 컨테이너에 `[&>*:nth-last-child(2):has(+.hidden)]:border-b-0` 을 건다. 펼치면 뒤 형제에
`.hidden` 이 없어 규칙이 걸리지 않아 헤더↔상세 구분선은 그대로 남는다.

### 🔴 접힌 내용을 DOM 에 남기면 **모든 부분일치 셀렉터의 모집단이 넓어진다**

전체 E2E 에서 **6건이 빨개졌다** — 단언이 틀린 게 아니라 전부 **strict mode violation** 이었다.

| spec | 셀렉터 | 종전 1건 → 이제 |
|---|---|---|
| `inheritance-deduction-breakdown` | `getByText("공제 합계")` | **3건**(+「인적공제 합계 (§20①)」·「기초·인적공제 합계보다 …」) |
| `inheritance-spouse-deduction-fix` | `getByText(/배우자 단독상속 — 일괄공제 배제/)` | **2건**(+상세 주석) |

`exact: true` 로 좁히고 **왜 좁혔는지**를 spec 에 적었다(느슨하게 되돌리면 다시 깨진다).

⚠️ 백그라운드 실행의 알림은 **「exit code 0」이었다** — `| tail` 파이프 끝단 값이다.
출력의 `6 failed` 줄을 직접 읽어서 잡았다
([[feedback_playwright_summary_last_passed_line_hides_failures]]).

### 인쇄 언마운트 — 「어느 층을 고쳤다」 ≠ 「그 층이 소비된다」

바깥 섹션(`DeductionBreakdownSection`)은 IG-148 에서 이미 CSS 토글로 바꿨다. 그런데 **그 안의
카드 8개는 그대로였다** — 섹션이 인쇄에서 펼쳐져도 개별 카드가 접혀 있으면 종이에는 헤더 행만
나왔다. 한 층을 고친 것이 아래 층까지 고친 것으로 읽힌 사례다
([[feedback_fixed_layer_vs_consumed_layer]]).

### 기존 테스트 2건의 **전제**가 바뀌었다

`ig-ui-g3-validate.anchor.test.ts`의 F-1·F-2 는 `unpaidTax`를 비운 채 **기한 축만** 쟀다.
그때는 미납액이 아무 조건에도 안 걸려 기한 메시지가 나왔지만, 이제 leaf 가 미납액을 **먼저**
요구한다 ⇒ 미납액을 채우지 않으면 두 항목은 기한 축을 **더 이상 재지 못한다**. 픽스처를
보강해 축을 되살렸다.

### 새로 발견한 것 (이번에도 고치지 않고 남긴다)

- **`ResetButton`이 `window.confirm`을 쓴다** (`components/calc/shared/ResetButton.tsx:32`).
  `components/calc/CLAUDE.md:14`가 명시적으로 금지하는 것이다. 호출부가 5곳(종부세·주식·양도
  multi·양도 단건·재산세 Step0)이고 **입력 단계** 버튼이라 이번 축(결과 화면 폐기)과 다르다.
  규약 위반이 더 넓은 층에 있다 — [[feedback_rule_wider_than_its_guard]].
