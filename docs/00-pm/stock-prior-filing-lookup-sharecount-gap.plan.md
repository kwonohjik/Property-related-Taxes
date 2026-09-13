# 과점주주 §158② 「기신고 이력에서 합산」이 **항상 0건** — 엔진 결과에 주식수가 없다

> 기준 커밋 **`231abc63`** (2026-09-14) · 제보 케이스: 이력 1건(㈜현조경 · 양도 2023-06-20 · 납부세액 29,200,000) · 이번 양도일 **2026-02-20**
> 모든 file:line·수치는 이 커밋에서 **실측**했다(추정 0건). 착수 시 재확인할 것 — [[feedback_merged_plan_citations_drift]].

## ✅ 진행 상태 — 구현 완료 (2026-09-14)

| Phase | 내용 | 결과 |
|---|---|---|
| 0 | PA anchor 작성 | PA-1·PA-2 **기대대로 실패**(`result_missing`) — 전제 확인 |
| 1 | 결과 `shareCount` 필수 echo + 조립 3지점 | `tsc` 오류가 **정확히 예측한 3곳만** 발생 후 0건 |
| 2 | lookup 2단 소스(`resolveShareCount`) | PA 전건 통과 |
| 3 | 픽스처 정합화 (vitest `rec()` · E2E B-4) | 19건·4건 통과 |
| 4 | 모달 사유 2종 분리 | `tsc` 0건 |
| 4b | E2E **B-5 신설** — 사유 분리 문구 고정 | 통과 |
| 6 | **추가 요청(2026-09-14)** — 기신고 조문별 **자동 배제 철폐** + E2E **B-6 신설** | 통과 |
| 5 | 회귀·뮤테이션 | vitest **전체 2,028파일 21,266건 통과** · E2E **6건** 통과 · `tsc` 0건 · lint 0 error |

### 🔑 실행 중 드러난 것 — **fallback 이 echo anchor 의 구별력을 흡수했다**

M-1(엔진 echo 무력화)이 **PA-1을 통과**했다. PA-1의 레코드가 폼 수량도 갖고 있어 2순위
fallback 이 구제했기 때문이다. ⇒ PA-1 을 **1a(엔진 결과 직접 단언) · 1b(폼 수량 비움 = 1순위만)
· 1c(둘 다 있을 때 우선순위)** 로 쪼갰다. [[feedback_new_guard_absorbs_sibling_anchor_discriminance]]

### 뮤테이션 실측 (전 3건 구별력 있음)

| ID | 뮤테이션 | 잡은 anchor |
|---|---|---|
| M-1 | 엔진 echo → `shareCount: 0` | PA-1a·1b·1c (3건) — PA-2·3은 통과(축이 갈린다) |
| M-2 | lookup 2순위 fallback 삭제 | 형제 anchor 9건 + PA-2 · **E2E B-4도 실패** |
| M-3 | 게이트를 `shareCount < 0` 으로 완화 | PA-3 (1건) |
| M-5 | 모달에서 `resultMissing` 문구 조건을 `exceed3y` 로 스왑 | **E2E B-5** — 부정 단언(`toHaveCount(0)`)이 vacuous 하지 않음을 실측 |
| M-6·M-7 | 기납부 합산을 다시 「`①4다` 제외」로 되돌림 | A-23(vitest) · **E2E B-6** 둘 다 실패 |

M-2 를 E2E 에도 걸어 **B-4 가 실패하는 것**을 확인했다 — 구 이력 형태 픽스처가 실제로
fallback 경로를 지킨다(픽스처만 고치고 코드를 안 고쳤다면 빨개졌을 것이다).

---

## 0. 제보 재현 — 사유는 둘이고, 걸린 것은 **하나**다

throwaway probe(`filterPriorStockTransferCandidates`에 실제 저장 형태 레코드 주입):

| 이번 양도일 | 3년 창 판정 | 후보 | warning |
|---|---|---|---|
| 2026-02-20 (**제보**) | `isWithinAggregationWindow` = **true** | **0건** | `result_missing` |
| 2026-03-01 | true | 0건 | `result_missing` |
| 2026-09-14 | false | 0건 | `exceed_3y` |

⇒ 제보 케이스는 **3년 창과 무관**하다(경계 2023-02-20, 이력 2023-06-20은 창 안).
순수하게 `result_missing` 한 갈래이고, 이것이 **버그**다.

⚠️ 2026-06-21 이후 양도라면 `exceed_3y`가 먼저 걸리며 그것은 **영 §158② 문언상 정답**이다
(「양도일부터 **소급해 3년** 내」 — `block-shareholder-gate.ts:92-103`). 이 계획서는 그 축을 건드리지 않는다.

---

## 1. 근본 원인 — `resultData.shareCount`는 **존재한 적이 없다**

`lib/calc/stock-prior-transfer-lookup.ts:221-226` 이 후보 게이트로 읽는다:

```ts
const transferPrice = num(result.transferPrice);
const shareCount = num(result.shareCount);      // ← 항상 0
if (transferPrice <= 0 || shareCount <= 0) { …result_missing… }
```

그런데 이력에 저장되는 `resultData`는 **엔진 결과 객체 그대로**이고
(`app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx:89`), 그 타입
`StockTransferResult`(`lib/tax-engine/stock-transfer/types/stock-transfer.types.ts:768-1273`)에는
**최상위 `shareCount`가 없다**.

**실측(실제 엔진 1회 호출 후 키 덤프)**:

| 관측 | 값 |
|---|---|
| `"shareCount" in result` | **false** |
| 수량 관련 키 전수(`/share\|count\|qty/i`) | **`[]` (0개)** |
| `transferPrice` · `acquisitionPrice` · `expenses` · `calculatedTax` · `appliedSection94` | 600,000,000 · 450,000,000 · 1,500,000 · 29,200,000 · `①3나_본문` — **전부 정상** |
| `capitalAdjustmentsDetail` / `lotMatchingDetail` | 둘 다 `undefined` (자본조정·split 입력이 있을 때**만** 실린다 ⇒ fallback 소스로 쓸 수 없다) |

⇒ **lookup이 쓰는 6필드 중 주식수 하나만 구멍**이다. 그 하나가 AND 게이트라 기능 전체가 no-op이 된다.

폼(`inputData`)에는 값이 있으나 **문자열**이라(`lib/stores/calc-wizard-stock-form-types.ts:99`
`shareCount: string`) `num()`(`stock-prior-transfer-lookup.ts:105-107` — `typeof v === "number"` 요구)이
0으로 떨군다. ⇒ **현재 두 소스 모두 막혀 있다.**

### 결과 조립 지점은 3곳뿐 (전수)

[[feedback_enumerate_all_write_sites_before_fixing]] — `): StockTransferResult` 반환부 전수 grep:

| # | 위치 | 방식 | 조치 |
|---|---|---|---|
| ① | `stock-transfer-tax.ts:527` `fullResult` | 독립 리터럴 | echo 추가 |
| ② | `stock-transfer-exempt-result.ts:59` `buildExemptResult` | 독립 리터럴(비과세 전용) | echo 추가 |
| ③ | `foreign-stock-aggregate-adapter.ts:80` | 독립 리터럴(국외주식) | echo 추가 |
| — | `apply-exempt-zeroing.ts:23` | `{...result}` spread | 자동 전파 |
| — | `stock-transfer-aggregate.ts:374·393` `processItem` | `{...r}` spread | 자동 전파 |
| — | `stock-transfer-aggregate-penalty.ts:71` `stripItemPenalties` | spread | 자동 전파 |

### 다건 신고에서도 짝이 맞는다 (실측)

`StockTransferTaxCalculator.tsx:165-168` — items = `[...savedItems, formData]`, 대표 저장 =
`agg.items[length-1]` ⇒ **대표 결과 = `formData` 종목**이고 `inputData`도 그 `formData`다.
⇒ 2순위 fallback(`inputData.shareCount`)이 **대표 결과와 같은 종목**을 가리킨다. 어긋나지 않는다.
(다건의 **비대표** 종목이 이력에 없다는 한계는 종전대로이고 모달이 이미 문구로 고지한다 — `:197`.)

---

## 2. 왜 **19개 anchor + E2E 1건**이 이걸 못 잡았나 — 픽스처가 결함을 가렸다

[[feedback_fixture_default_masks_gate_defect]]의 두 번째 실례다.

| 게이트 | 픽스처 | 실제 저장 형태와의 차이 |
|---|---|---|
| `__tests__/calc/stock-prior-transfer-lookup.anchor.test.ts:46` (19건) | `resultData: { shareCount: o.shareCount ?? 30_000, … }` | 엔진이 **쓰지 않는 키**를 손으로 심는다 |
| `e2e/stock-block-shareholder-94-1-4-da.spec.ts:304` (B-4) | `putCalculationRecord(... resultData: { shareCount: 30_000, … })` | 동일 |

🔑 두 픽스처의 나머지 5값(600,000,000 / 450,000,000 / 1,500,000 / 29,200,000 / `①3나_본문`)은
**probe 실측치와 원 단위까지 일치**한다 — 실제 계산에서 따왔는데 **주식수만 덧붙였다**.
그래서 「실제와 같아 보이는」 픽스처가 됐고, 20개 게이트가 전부 초록인 채 기능이 죽어 있었다.

⇒ **이 계획의 검증 정본은 「엔진을 실제로 돌려 그 결과를 그대로 이력으로 쓰는」 anchor**다.

---

## 3. 설계 결정

### D-1 — 엔진 결과에 `shareCount`를 **필수 필드**로 추가한다 (echo)

- `echo-field-pattern` — 산식·세액 **무변경**, 값은 `input.shareCount` 그대로.
- **optional(`?:`)이 아니라 필수**로 둔다: 조립 지점 3곳의 누락을 **TypeScript가 잡는다**.
  실측상 부작용 없음 — 외부에서 `StockTransferResult`를 만드는 11곳 중 **9곳이 `as` 캐스트**
  (`__tests__/components/*` 8건 · `lib/calc/cross-104-5-adapter.ts:116` · `stock-transfer-tax-api.ts:602`)
  라 필수 필드가 늘어도 **타입 오류가 나지 않는다**. 진짜 리터럴은 위 ①②③뿐이다.
- **의미 고정**: 「그 회차에 **양도한** 주식수」다. 자본조정 환산 후 수량(`adjustedShareCount`)이
  아니다 — 둘이 다를 수 있음을 엔진이 이미 경고로 구분한다(`stock-transfer-pr2-detail.ts:91-93`).
  §158② 누적 양도비율의 분자는 **양도 수량**이므로 입력값이 맞다.
- ⑦ 결과 카드에는 **표시하지 않는다**(요청 범위 밖 · Simplicity).

### D-2 — lookup은 **2단 소스**로 읽는다 (기존 이력 61건 호환)

```
1순위  resultData.shareCount        (신규 — D-1 echo)
2순위  inputData.shareCount 문자열   (구 이력 — parseIntOrUndef 재사용)
없으면 result_missing 유지
```

🔴 **fallback이 없으면 이미 저장된 이력은 영원히 후보가 못 된다** — 제보 케이스가 바로 그것이다.
D-1만 하고 끝내면 「고쳤는데 내 이력은 여전히 안 뜬다」가 된다.

- 파서는 `lib/calc/stock-transfer-tax-api-parse.ts:9` `parseIntOrUndef`를 **재사용**한다
  (④ API 변환이 쓰는 것과 같은 술어 — [[feedback_shared_predicate_argument_parity]]).
- `transferPrice <= 0` 게이트는 **그대로 둔다**(결과가 실제로 없는 레코드 차단).

### D-3 — 모달이 제외 사유를 **구분해서** 말한다

현행 `BlockShareholderPriorTransferModal.tsx:134`은 「3년 창 밖**이거나** 계산 결과가 없어」로
두 사유를 합쳐 말한다. `warnings[].reason`은 이미 4종으로 갈려 있으므로(`exceed_3y` ·
`result_missing` · `future_date` · `different_client`) reason별로 집계해 문장을 나눈다.
제보자가 원인을 특정하지 못한 직접 원인이 이 문장이다.

### D-4 — 기신고 **조문별 자동 배제를 철폐**한다 (2026-09-14 사용자 결정)

종전 동작: 기신고 이력이 이미 `①4다`(기타자산)로 신고된 건이면 그 세액을 **기납부 합산에서 뺐다**.
근거는 영 §168② 「**대주주로서** 납부하였거나 납부할 세액」 문언이었다(그 회차는 「대주주로서」가
아니라 기타자산으로 낸 것이라는 해석).

**뒤집은 이유**: §94①4 다목 요건 판정 자체가 **사용자 입력 축**이다(요건 3칸을 사용자가 채운다).
기신고를 어떤 조문으로 했는지는 **사용자가 알고 고르는 정보**인데, 프로그램이 그것을 근거로
차감을 **자동으로 깎으면** ⓐ 방향이 **납세자에게 불리**하고 ⓑ 사용자가 되돌릴 수단이 없다
([[feedback_no_unfavorable_application_without_legal_basis]]).

⇒ **선택한 건은 전부 합산**한다. 조문 정보는 **배지로 표시만** 하고, 빼고 싶으면 사용자가
**선택을 해제**한다(입력 경로를 사용자에게 되돌려 준 것 — 자동 배제보다 통제가 넓다).

| | 종전 | 현행 |
|---|---|---|
| `priorMajorShareholderTax` | `①3` 건만 합산 | **선택 건 전부** |
| 후보 플래그 | `wasAlreadyBlockShareholder` = 배제 기준 | **표시 전용** |
| 합산 결과 필드 | `excludedFromPriorTaxIds` | `alreadyBlockShareholderIds`(표시용) |
| 배지 문구 | 「기납부 합산 **제외**」(amber) | 「기타자산(§94①4다)으로 **신고된 건**」(중립) |
| 합계 안내 | 「제외했습니다」 | 「**그대로 합산**했습니다 — 빼려면 선택 해제」 |

⚠️ 이 결정은 계획서 **V-3을 해소**한다(그 항목이 가리키던 혼란이 실제 제보로 확인됐다).

---

---

## 4. 변경 지점 전수

| # | 파일 | 내용 | 세액 영향 |
|---|---|---|---|
| 1 | `types/stock-transfer.types.ts` (~:820 `transferPrice` 직전) | `shareCount: number` 필수 필드 + echo 주석 | 없음 |
| 2 | `stock-transfer-tax.ts:527` | `shareCount,` 추가 (지역 변수 `:175`에 이미 있음) | 없음 |
| 3 | `stock-transfer-exempt-result.ts:59` | `shareCount: input.shareCount` | 없음 |
| 4 | `foreign-stock-aggregate-adapter.ts:80` | `shareCount: input.shareCount` | 없음 |
| 5 | `lib/calc/stock-prior-transfer-lookup.ts:221-226` | 2단 소스 + `parseIntOrUndef` import | **기능 복구** |
| 6 | `BlockShareholderPriorTransferModal.tsx:89·134` | reason별 집계·문구 분기 | 없음 |
| 7 | `__tests__/calc/stock-prior-transfer-lookup.anchor.test.ts:46` | 픽스처를 **실제 저장 형태**로 교체 | — |
| 8 | `e2e/stock-block-shareholder-94-1-4-da.spec.ts:304` | 픽스처에서 `shareCount` 제거(구 이력 형태) | — |

**14 동기화 지점**: 이번 변경은 **입력 축이 아니라 출력(result) 축**이다 ⇒ ⑨⑩⑪⑫⑬⑭(Zod·body·Route 매핑)
**해당 없음**. 클라이언트 축도 ①~⑥⑧ 무변경(표시하지 않는 echo). 영향은 ⑦ 소비자 중
**이력 저장 형태**뿐이다(V-1에서 실측 확인).

**파일 크기**: 최대 변경 대상 `stock-transfer-tax.ts` **628줄**(+1) · `lookup` 339(+~10) ·
모달 219(+~12) — 800 트리거 여유. 분리 불요.

---

## 5. Pre-Do anchor (Do 진입 **전** 작성·실행 — [[feedback_pre_anchor_verification]])

| ID | 내용 | 착수 전 기대 | 수정 후 기대 |
|---|---|---|---|
| **PA-1** | `calculateStockTransferTax`를 **실제로 돌려** 그 결과를 `resultData`로 쓴 이력 1건 + 이번 양도일 2026-02-20 → 후보 수 | **0건**(`result_missing`) ← 결함 특성화 | **1건** |
| **PA-2** | 같은 레코드에서 `resultData.shareCount`를 **지운** 구(舊) 이력 형태(= 현존 61건) → 후보 수 | 0건 | **1건** (D-2 fallback) |
| **PA-3** | `inputData.shareCount`도 빈 문자열인 레코드 | 0건 | **0건** 유지(`result_missing`) — 과잉 통과 방지 |

PA-1은 **현행에서 반드시 실패(=0건)해야 한다**. 실패하지 않으면 이 계획의 전제가 틀린 것이므로
Do를 멈추고 원인을 다시 잰다.

---

## 6. 실행 단계

```
Phase 0  PA-1~PA-3 작성 → 실행 → 현행 실패 방향 확인
         verify: PA-1·PA-2 fail(0건), PA-3 pass
Phase 1  D-1 — 타입 필수 필드 + 조립 3지점
         verify: npx tsc --noEmit 0건 (필수화로 ①②③ 외 오류가 나면 4절 전제 재검토)
Phase 2  D-2 — lookup 2단 소스
         verify: PA-1·PA-2·PA-3 전건 통과
Phase 3  픽스처 정합화 (vitest 19건 + E2E B-4)
         verify: npx vitest run __tests__/calc/stock-prior-transfer-lookup.anchor.test.ts
Phase 4  D-3 — 모달 사유 분리
         verify: 모달 렌더 테스트 또는 E2E로 문구 확인
Phase 5  전체 검증
         verify: npm run check:pre-pr + npx playwright test e2e/stock-block-shareholder-94-1-4-da.spec.ts
```

⚠️ Phase 3에서 **E2E 픽스처의 `shareCount`를 지우는 것 자체가 구별력 시험**이다 —
Phase 1·2 전에 지우면 B-4가 **실패해야** 정상이다.

---

## 7. 뮤테이션 계획 ([[feedback_negative_assertion_needs_mutation_probe]])

| ID | 뮤테이션 | 잡혀야 하는 anchor |
|---|---|---|
| M-1 | `stock-transfer-tax.ts`에서 `shareCount` echo 한 줄 삭제 | PA-1 |
| M-2 | lookup의 2순위 fallback 삭제 | PA-2 (PA-1은 **통과** — 두 축이 갈리는지 확인) |
| M-3 | 게이트를 `shareCount < 0`으로 완화 | PA-3 |

M-2가 PA-1까지 깨뜨리면 두 anchor가 같은 것을 보고 있다는 뜻이므로 PA-2를 구 이력 형태로 다시 짠다.

---

## 8. 회귀 위험

- **낮음** — 세액 산식 무변경(echo only), 입력 축 무변경.
- 가장 큰 위험은 **필수 필드화의 파급**인데, 실측상 `as` 캐스트 9곳이라 영향 없음(4절). Phase 1의
  `tsc` 결과로 즉시 확인된다.
- 기존 이력 61건은 D-2로 **읽기 호환**만 얻는다. 마이그레이션 없음(저장 데이터 무변경).

---

## 9. 미검증 항목(V) · 결정 대기(Q)

| ID | 내용 | 상태 |
|---|---|---|
| ~~**V-1**~~ | ✅ **해소** — ① print leaf 동기화 규칙([[feedback_print_leaf_add_unit_test_sync]])은 **출력 섹션 단위**이고 이번 변경은 섹션을 추가하지 않는다(`ALL_LEAVES` grep 0건). ② 결과 **최상위를 통째로 `toEqual`** 하는 테스트 0건(22건 전부 하위 객체 비교) ⇒ 키 추가로 깨질 게이트 없음 | 해소 |
| **V-2** | 제보자의 2023 이력이 `appliedSection94 = "①4다"`인지 (이력 카드 배지 「과점주주 주식」의 소스를 코드에서 못 찾음 — 문자열 grep 0건) | 미확인 |
| ~~**V-3**~~ | ✅ **해소 — D-4로 자동 배제 자체를 없앴다**(2026-09-14). 조문과 무관하게 전부 합산하고 배지는 정보 표시만 한다 | 해소 |
| ~~**Q-1**~~ | ✅ **결정 — 필수 필드**(2026-09-14 사용자 승인) | 확정 |
| ~~**Q-2**~~ | ✅ **결정 — `exceed_3y`·`result_missing` 둘만 분리**(2026-09-14 사용자 승인) | 확정 |

---

## 부록 — 판정에 쓴 probe (재현용)

`.probe/` 아래 throwaway로 두 개를 돌렸다(커밋하지 않음):

1. `filterPriorStockTransferCandidates`에 **손으로 만든** 저장 형태 레코드 주입 → 날짜 3종 비교
2. `calculateStockTransferTax` **실제 호출** → 결과 키 덤프 → 그 결과를 그대로 `resultData`로 넣어 lookup 실행

⚠️ 뮤테이션 probe 시 `git checkout`으로 되돌리지 말 것 — [[feedback_mutation_probe_git_checkout_destroys_wip]].
