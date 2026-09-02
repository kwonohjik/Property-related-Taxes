# 취득 후 상장 ② 섹션 — 라벨 정정 + 일자별 입력 축 신설 계획서

> 사용자 요구(2026-09-02, 이미지 29·30)
> 1. ② 섹션 제목 「상장 당시 시세」 → 「상장 당시 기준시가」로 정정
> 2. ①의 「입력 방식」 옵션 단추(직접 입력 ↔ 일자별 입력) 효과를 ②에도 적용 — 상장 당시 일자별 조회 기능 추가
>
> 대상 `components/calc/stock-transfer/PostListingValuationCard.tsx` + sibling + validate + adapter
> 작성일 2026-09-02 · 기준 커밋 `eb1597e6`
>
> 🔴 **§1~§5의 file:line은 «구현 전»(eb1597e6) 좌표다.** 구현으로 6곳이 이동했고 그중
> `PostListingClosingPriceTable.tsx:171` · `TransferDate1MonthClosingPriceTable.tsx:130`
> (섹션 배지)은 **삭제되어 이제 존재하지 않는다**. 현재 좌표는 §9 자가검토 표를 볼 것.

---

## 0. 결론 먼저

| 요구 | 판정 | 근거 |
|---|---|---|
| ① 라벨 정정 | 🔴 **원안 반려 — 대안 제시** | 「상장 당시 기준시가」는 §165⑤에 없는 명칭이고, 법문상 상장 시점 가액인 **③(상장일 현재의 제4항에 따른 평가액)** 과 이름이 겹친다 |
| ② 일자별 축 | 🟢 **가능 — 엔진·Zod·API 스키마 무변경** | simple 모드는 `listingDatePriceAvg1Month` 단일 필드만 엔진에 전달한다(adapter 조기 반환). 표는 그 값을 «파생»시키기만 하면 된다 |

---

## 1. 법령 검증 (KoreanLaw 실조회)

**소득세법 시행령 제165조** (MST 286211 · 공포 2026-05-22 · 시행 2026-07-01, 2026-09-02 조회)

> ⑤ 주식등의 양도일 현재에는 제3항에 따른 주식등에 해당되나 그 취득 당시에는 제3항에 따른 주식등에 해당되지 않는 경우 **취득 당시의 기준시가**는 제4항에도 불구하고 다음 계산식에 따라 계산한 가액에 따른다. 이 경우 취득일 현재의 **제4항에 따른 평가액**과 코스닥시장 또는 코넥스시장 **상장일 현재의 제4항에 따른 평가액**이 같은 경우에는 제9항을 준용하여 계산한 가액을 … 평가액으로 한다.
>
> (코스닥시장 또는 코넥스시장 **상장일 이후 1개월간 공표된 매일의 … 최종시세가액의 평균액**) × (취득일 현재의 제4항에 따른 평가액 / 상장일 현재의 제4항에 따른 평가액)

### 1.1 이름의 층위 — 화면 ①②③과 대조

| 화면 | 법문상 이름 | 조문 |
|---|---|---|
| ① 양도 당시 기준시가 | **양도 당시의 기준시가** | 법 §99①3 → 영 §165③ (⑨도 같은 표현 사용) |
| ② 상장일 이후 1개월 종가평균 | **최종시세가액의 평균액** | 영 §165⑤ 계산식 첫 항 |
| ③ 상장연도·취득연도 평가액 | **상장일 현재 / 취득일 현재의 제4항에 따른 평가액** | 영 §165⑤ 후단 · §165④ |
| (산식 결과) | **취득 당시의 기준시가** | 영 §165⑤ 본문 |

⇒ **「상장 당시 기준시가」라는 개념은 조문에 없다.** §99①은 기준시가를 「양도·취득 당시」의 값으로만 정의하고, 「상장 당시」라는 시점의 기준시가를 두지 않는다. 상장 시점의 가액을 법이 부르는 이름은 **「상장일 현재의 제4항에 따른 평가액」** — 그것이 우리 화면의 **③**이다.

⇒ ②에 「상장 당시 기준시가」를 붙이면 **③과 이름이 충돌**한다. ①과 층위를 맞추려던 의도가, 실제로는 두 섹션을 한 이름으로 묶어버린다.

### 1.2 라벨 대안

| 안 | 제목 | 평가 |
|---|---|---|
| **A (권장)** | **「상장일 이후 1개월 종가」** | 조문 「상장일 이후 1개월간 … 최종시세가액의 평균액」의 축약. 안에 든 두 필드(상장일 · 1개월 종가평균)를 제목이 그대로 설명한다 |
| B | 「상장 당시 시세」 (현행 유지) | 틀리진 않으나 「시세」가 무엇의 시세인지 제목만으로는 안 잡힌다 — 이번 제보의 원인과 같은 결 |
| C | 「상장 당시 기준시가」 (원안) | ❌ 조문에 없는 명칭 + ③과 충돌 |

**A안 보강** — ①과의 짝을 살리려면 섹션 본문 첫 줄에 한 줄 안내를 둔다(제목은 짧게):

```
① 양도 당시 기준시가        ← 환산 산식의 분모
② 상장일 이후 1개월 종가     ← §165⑤ 계산식의 첫 항 (취득 당시 기준시가의 기초)
③ 상장연도·취득연도 평가액   ← §165⑤ 계산식의 비율
```

> ⚠️ 이 판단은 사용자 결정 사항이다. C안을 그대로 쓰기로 하면 **③의 제목도 함께 바꿔** 충돌을 없애야 한다(예: ③ → 「상장일·취득일 현재 평가액(§165④)」). 어느 쪽이든 **②와 ③이 같은 이름을 쓰는 상태로 두지 않는다.**

---

## 2. 현행 아키텍처 실측

### 2.1 ②의 입력 경로는 지금 `unlistedDetailMode`에 **종속**돼 있다

`PostListingValuationCard.tsx:258`

| `unlistedDetailMode` | ② 입력 UI | 엔진에 가는 값 |
|---|---|---|
| `simple` | 단일 숫자 `listingDatePriceAvg1Month` (`:259~271`) | 그 필드 **그대로** |
| `full` · `listing_only` | 32셀 표 + 자본조정 (`:273~284`) | `postListingDetail.closing` → adapter가 **재계산** |

즉 사용자가 ③의 «자료 종류»를 고르면 ②의 «입력 방식»까지 함께 정해진다. 이번 요구는 **그 종속을 끊어 ②에 자기 축을 주는 것**이다.

### 2.2 배관 — simple 모드는 필드 1개가 정본

- `post-listing-flat-adapter.ts:334` — `mode === "simple"`이면 **조기 반환**하며 `postListingDetail: undefined`, `listingDatePriceAvg1Month: toNumber(form.listingDatePriceAvg1Month)`.
- `stock-transfer-tax-api.ts:395` — `adaptFlatToApiBody(form, true)` 결과로 body를 덮어쓴다.
- 엔진 `synthesizePostListingInput`(`:461`)은 `detail.unlistedDetailMode === "simple"`이면 **조기 반환** — simple 모드에서 표를 함께 보내도 **엔진이 무시**한다.

🔑 ⇒ **simple + daily의 배관은 「표 → `listingDatePriceAvg1Month` 파생」 하나뿐이다.** 엔진·Zod(`stock-transfer-tax-schema.ts:286`)·route 무변경.

### 2.3 ①(양도일 축)의 선례

| | ① `TransferDate1MonthClosingPriceTable` | ② `PostListingClosingPriceTable` |
|---|---|---|
| 평균 mirror | ✅ `:102~115` — 셀 편집 시 `transferDatePriceAvg1Month`에 기록 | ❌ 기록 없음(`:146~156`) |
| KRX 평일 휴장일 | ✅ `isKrxHolidayInFixture` 제외 | ❌ 주말만 제외 (빈칸이면 어차피 제외되므로 결함은 아님) |
| 자본조정 절단 | 해당 없음 | `calcClosingAvgWithEvent` — **표 미리보기(`:115~122`)는 절단 미반영**, adapter(`:349`)만 반영 |
| 키움 자동조회 | 평균 mirror ✅ | `KiwoomPostListingAutoFetchButton.tsx:137` — **이미 `listingDatePriceAvg1Month`를 쓴다**(절단 미반영 단순 평균) |

---

## 3. 요구 2 설계

### 3.1 안 1 — simple 모드 안에 direct/daily 축 신설 **(권장)**

신규 폼 필드 1개:

```ts
// lib/stores/calc-wizard-stock-form.ts
listingStdInputMode: "direct" | "daily";   // 3중 패턴 default "direct" (기존 동작 보존)
```

렌더 규칙:

| `unlistedDetailMode` | ②의 「입력 방식」 라디오 | ② 본문 |
|---|---|---|
| `simple` + `direct` | 노출 (direct 선택) | 현행 단일 숫자 — **무변경** |
| `simple` + `daily` | 노출 (daily 선택) | 키움 자동조회 + 32셀 표 + 자본조정 섹션 ← **신설** |
| `full` · `listing_only` | 미노출 + 한 줄 안내 | 현행 표 — **무변경** |

> `full`·`listing_only`에 라디오를 두지 않는 이유: 그 모드는 «결산서를 갖고 있다»는 선언이고 종가도 같은 자료에서 나온다. 라디오를 두면 6조합이 되고, 그중 `full + direct`는 **엔진 변경**이 필요하다(§3.2). 최소 변경으로 요구를 충족하는 경계가 여기다.

### 3.2 안 2 — ②를 완전 독립 축으로 (6조합) *(비권장 — 참고용)*

`full`·`listing_only`에서도 direct를 허용하려면:

- `post-listing-flat-adapter.ts:477` **full 분기가 `listingDatePriceAvg1Month`를 무조건 합성값으로 덮어쓴다** — 표가 비면 0이 되어 direct 입력값이 **조용히 사라진다**. `listing_only` 분기(`:467`)에만 있는 `|| input.listingDatePriceAvg1Month` fallback을 full에도 넣어야 한다.
- 엔진 회귀면이 넓다(`post-listing-detail.full.test.ts` 외).

⇒ 이번 범위에서 제외. 필요해지면 별건으로.

### 3.3 파생 방식 — mirror(저장) vs 헬퍼(무저장)

| | (a) mirror 저장 | (b) **파생 헬퍼** ← 권장 |
|---|---|---|
| 방식 | 표 편집 시 평균을 `listingDatePriceAvg1Month`에 기록 (① 선례) | 저장하지 않고, 읽는 쪽 3곳이 헬퍼를 호출 |
| 쓰기 지점 | **4곳** — 셀 편집 · 자본조정 토글 · 상장일 변경(`:239~249`) · 키움 자동조회 | 0곳 |
| stale 위험 | 🔴 있음 — 상장일만 바꾸면 표는 재구성되는데 평균은 옛 값으로 남는다. simple 모드에서는 그 값이 **곧 엔진 입력**이라 실제 오답 | 구조적으로 불가능 |
| 선례 | ①이 정확히 이 사고를 냈다(2026-09-01, 16,560 vs 16,559 — `TransferDate1MonthClosingPriceTable.tsx:30~34` 주석) | — |

**(b) 채택.** 헬퍼 1개를 단일 진실로 둔다:

```ts
// lib/calc/stock-post-listing-closing-avg.ts (신규)
// direct → 입력 필드, daily → 표에서 calcClosingAvgWithEvent (자본조정 절단 포함)
export function resolveListingClosingAvg(form): number
```

호출처 3곳 — 모두 «읽기»다:

1. `PostListingFormulaPreview.tsx:90` (simple 분기) — 화면 환산 미리보기
2. `stock-transfer-tax-validate-step2.ts:372` — 필수 검증
3. `post-listing-flat-adapter.ts:334` (simple 조기 반환) — API body

> ⚠️ **자본조정 절단은 반드시 헬퍼 안에서 처리한다.** simple 모드는 `postListingDetail`을 보내지 않으므로 엔진이 절단을 해줄 수 없다. 헬퍼가 `calcClosingAvgWithEvent`를 쓰지 않으면 증자·합병 사례에서 **조용한 과대평가**가 된다.

---

## 4. 배관 매트릭스 (14 동기화 지점)

| # | 지점 | 조치 |
|---|---|---|
| ① | FormData 타입 | `listingStdInputMode` 추가 (`calc-wizard-stock-form.ts:152` 옆) |
| ② | initial | `"direct"` (`:543` 옆) |
| ③ | normalize | `acquiredBeforeListing` 게이트 — **`transferStdInputMode` 선례 그대로**(`calc-wizard-stock-normalize.ts:59`). 축 밖에서 `daily`가 남으면 되돌릴 UI가 없다 |
| ④ | API 변환 | 값 자체는 `listingDatePriceAvg1Month`로 이미 흐른다. 모드 메타 전송은 **선택** (§6 Q2) |
| ⑤ | UI 위젯 | ②에 라디오 + 조건부 표/단일 숫자 |
| ⑥ | 사이드바 | 해당 없음(참조처 0건 — grep 확인) |
| ⑦ | 결과 카드 | 선택 (§6 Q2) |
| ⑧ | validate | daily일 때 단일 숫자 대신 **표 1셀 이상 + 산정 평균 > 0** 검사 |
| ⑨~⑭ | Zod·route·엔진 | **무변경** (§2.2) |

추가 — 토글 OFF 정규화: `PostListingValuationCard.tsx:116~122`의 한 번의 patch에 `listingStdInputMode: "direct"`를 **함께** 넣는다(나눠 부르면 뒤 호출이 앞 spread를 덮는다 — 같은 파일 `:113` 경고).

---

## 5. 함정 (착수 전 확인)

1. **`{mode === "simple" ? ... : ...}` 삼항 분기 안의 JSX 주석** — 분기 첫 요소로 두면 객체 리터럴로 파싱돼 TS1005, 주석 본문의 중괄호는 TS1381 (`:255~257` 실측 기록). 주석은 삼항 밖에.
2. **표 미리보기 ≠ 엔진값(기존 드리프트)** — `PostListingClosingPriceTable.tsx:115~122`는 `calcMonthlyClosingAverage`(절단 없음), adapter는 `calcClosingAvgWithEvent`(절단 있음). 자본조정이 켜진 full 모드에서 지금도 두 값이 갈린다. **③에서 도입하는 헬퍼로 표 미리보기도 통일**할 것을 권장(별건이 아니라 같은 자리다).
3. **키움 자동조회의 평균도 절단 미반영** (`KiwoomPostListingAutoFetchButton.tsx:117~137`). simple+daily에서 그 값이 정본이 되면 안 된다 — (b) 채택 시 자동조회는 **셀만 채우고** 평균 필드는 건드리지 않도록 정리한다.
4. 🔴 **같은 라벨의 컨트롤이 둘이 된다 — 셀렉터 충돌.** ②의 라디오는 ①과 **문구가 같다**
   (「직접 입력 (1개월 평균 단일 숫자)」·「일자별 입력 (자동 평균 산정)」). 라벨 문자열로
   집는 기존 셀렉터는 그 순간 다중 매칭으로 던진다.
   ⇒ 라벨을 복제하는 변경에서는 **그 문자열을 쓰는 테스트를 먼저 grep**할 것
     (필드명 grep으로는 안 잡힌다 — §8·§9-D1). 소속은 `input[name="..."]`로 못박는다.
   ※ 이 세션 앞부분에서 `layout="inline"` 셀렉터 충돌을 이미 겪고도 이 함정을 세우지 못했다.

5. **섹션 배지 충돌** — 표 컴포넌트가 자체 `sectionNum={1}` 배지를 단다(`PostListingClosingPriceTable.tsx:171`, `TransferDate1MonthClosingPriceTable.tsx:130`). 바깥 ①②③과 겹친다(현행에서도 이미 그렇다 — full 모드 ② 안의 "1"). 이번에 ②에 표가 하나 더 생기므로 **배지 제거** 권장.

---

## 6. 결정 (2026-09-02 확정) — ✅ 구현 완료

| # | 질문 | 결정 |
|---|---|---|
| Q1 | ② 제목 | ✅ **A안 「상장일 이후 1개월 종가」** |
| Q2 | 결과 화면 「일자별 입력 모드」 배너를 ②에도 | ✅ **이번엔 제외** (Zod·엔진 result 확장 동반) |
| Q3 | `full`·`listing_only`에서도 direct 허용 | ✅ **제외** (§3.2 — 엔진 변경 필요) |

### 계획서와 달라진 점 2가지

1. **함정 3(키움 자동조회의 평균 write)은 «그대로 두었다».** 계획서는 「셀만 채우도록 정리」라
   했으나, (b) 파생 방식을 택한 순간 그 write는 **정본이 될 수 없다** — daily에서는 아무도
   그 필드를 읽지 않는다. 오히려 daily→direct로 되돌릴 때의 선입력값으로 쓸모가 있고
   ①의 동작과도 같다. 요청 밖 동작 변경 + 회귀면(listing_only의 `||` fallback)을 감수할
   이유가 없다.
2. **②에 한 줄 안내를 넣지 않았다.** 「A안 보강」으로 제안했으나 확정된 것은 제목뿐이고,
   제목 자체가 이미 칸의 내용을 말한다. (`full`·`listing_only`에서 라디오가 없는 이유만
   한 줄로 남겼다 — 그건 «없는 것»에 대한 설명이라 대체 수단이 없다.)

### 구현 결과

- `listingStdInputMode` 신설 — 폼 타입·initial·normalize(축 게이트)·토글 OFF 정규화
- `resolveListingClosingAvg` 신설(`post-listing-flat-adapter.ts`) — 읽기 3곳이 호출
- 엔진·Zod·route **무변경** (계획대로)
- 함께 정리: 표 미리보기 절단 통일 · 종가 표 배지 제거
- anchor **19건** — LS-1~7 · RLA-1~5 · LSV-1~4 · SEC(갱신) · FD(갱신)
- 뮤테이션 **5/5 감지** — M-A(adapter) · M-B(미리보기) · M-C(validate 축) · M-D(절단) · M-E(라디오)

> 🔴 **작업 중 사고**: 뮤테이션 복원을 `git checkout -- <file>`로 해서 커밋 안 된 3파일이
> 날아갔다([[feedback_mutation_probe_git_checkout_destroys_wip]]의 재발). 재작성 후
> **커밋을 먼저 하고** `git checkout HEAD -- <file>`로 복원하도록 바꿔 5건을 완주했다.

---

## 7. 작업 단계 · 검증

```
1. 라벨 정정 (Q1 확정 후)               → verify: post-listing-three-sections.anchor T2 갱신 + 전건 green
2. 헬퍼 resolveListingClosingAvg 신설    → verify: 신규 유닛 — direct/daily/자본조정 절단 3케이스
3. 읽기 3곳을 헬퍼로 전환 (preview·validate·adapter)
                                        → verify: 뮤테이션 — 헬퍼를 상수 0으로 바꿔 3곳 각각 red 확인
4. 폼 필드 + normalize + 토글 OFF 정규화 → verify: normalize 앵커(FD-4 패턴 mirror)
5. ② UI 라디오 + 조건부 렌더            → verify: 신규 앵커 — simple+direct/simple+daily/full 3분기 DOM
6. validate daily 분기                   → verify: 표 빈 상태 daily → 차단, 1셀 입력 → 통과
7. 함정 2·3·4 정리                       → verify: 기존 full 모드 앵커 무회귀
```

**뮤테이션 필수(3단계)** — 헬퍼를 도입하면 「읽는 쪽이 정말 헬퍼를 거치는가」가 유일한 안전망이다. 3곳 각각을 끊어보지 않으면 한 곳이 옛 필드를 그대로 읽고 있어도 전건이 통과한다.

## 8. 영향 테스트 (사전 식별 20파일)

```
__tests__/calc/post-listing-amount-mode-validate.anchor.test.ts
__tests__/calc/stock-api-plumbing-strip.anchor.test.ts
__tests__/calc/stock-transfer/post-listing-validate.test.ts
__tests__/components/calc/stock-transfer/post-listing-three-sections.anchor.test.tsx   ← T2 라벨
__tests__/components/calc/stock-transfer/filing-form-conversion-rows.anchor.test.ts
__tests__/components/post-listing-weighted-basis.anchor.test.tsx
__tests__/tax-engine/stock-transfer/{case-48-acquired-then-listed,post-listing-165-5-floor80,
  post-listing-detail.extra,post-listing-detail.full,post-listing-163-9-conversion,
  postlisting-yearcolumn-export-regression,section81-4-preprior-floor80,
  carryover-97-2-estimated-branches,exempt-result-field-parity,pr2-validate,
  route-split-mode,transfer-std-input-mode}.test.ts
e2e/stock-transfer-165-5-floor80.spec.ts
e2e/stock-transfer-monthly-accrual.spec.ts
```


---

## 9. 자가검토 (2026-09-02, 구현 후 실측 대조)

계획서의 모든 주장을 현재 파일과 대조했다. **결함 5건 · 검증 통과 5건.**

### 🔴 D-1 영향 테스트 목록이 사실상 틀렸다 — 1 적중 / 19 오탐 / 2 누락

실제로 수정이 필요했던 기존 테스트는 **3건**이었다:

| 파일 | §8 기재 |
|---|---|
| `post-listing-three-sections.anchor.test.tsx` (T2 라벨) | ✅ 있음 |
| `post-listing-toggle-off-normalizes-mode.anchor.test.tsx` (patch `toEqual` 전량 비교) | ❌ **없음** |
| `stock-listed-conversion-autofetch-gate.anchor.test.tsx` (AG-4 라벨 다중 매칭) | ❌ **없음** |

§8이 적은 나머지 19개는 **한 건도 손댈 필요가 없었다.**

**원인** — grep 어휘를 「내가 바꾸는 필드」(`listingDatePriceAvg1Month`·`listingPriceClosing`)에서
뽑았다. 그런데 실제 파손 원인은 필드가 아니라 (a) **복제되는 라벨 문자열**, (b) **patch 객체의
형태 변화**였다. 둘 다 그 어휘로는 잡히지 않는다.

**더 나쁜 것은 자기모순이다** — §2.2는 「엔진·Zod·route **무변경**」이라 결론내고서, §8은
그 무변경 계약만 소비하는 **엔진 테스트 12개**를 영향으로 적었다. 두 절이 서로를 부정한다.
§2.2가 맞았다(엔진 테스트는 전부 무변경 통과).

⇒ **영향 목록은 「무엇을 바꾸는가」가 아니라 「무엇이 깨지는가」로 뽑을 것.**
  - 라벨·제목을 **복제**하면 → 그 문자열을 쓰는 셀렉터
  - patch·객체를 **확장**하면 → `toEqual`로 전량 비교하는 단언
  - 필드 grep은 **계약이 바뀔 때만** 유효하다

### 🔴 D-2 「함정」에 셀렉터 충돌이 없었다

같은 라벨의 컨트롤을 하나 더 그리는 변경인데 그 위험을 세우지 않았다. AG-4가 실제로 깨졌다.
⇒ §5에 함정 4로 추가했다.

### 🟠 D-3 인용 6곳이 현재 파일과 어긋난다

| 계획서 인용 | 현재 |
|---|---|
| `PostListingValuationCard.tsx:258` (simple 삼항) | 이동 |
| `post-listing-flat-adapter.ts:334` (simple 조기반환) | 이동 (헬퍼 삽입) |
| `post-listing-flat-adapter.ts:477` (full 덮어쓰기) | 이동 |
| `stock-transfer-tax-validate-step2.ts:372` | 이동 (:378~) |
| `PostListingFormulaPreview.tsx:90` | :92 |
| `PostListingClosingPriceTable.tsx:171` · `TransferDate1MonthClosingPriceTable.tsx:130` | **삭제됨** |

헤더에 「기준 커밋 eb1597e6」이 있어 좌표 자체는 방어되지만, §6에 「✅ 구현 완료」를 덧붙이면서
**한 문서 안에 두 시점이 섞였다**. 헤더에 경고를 명시했다.

**현재 좌표** — 헬퍼 `post-listing-flat-adapter.ts:175` · 읽기 3곳
`post-listing-flat-adapter.ts:372` · `stock-transfer-tax-validate-step2.ts:395` ·
`PostListingFormulaPreview.tsx:92`.

### 🟠 D-4 검증 계획에 E2E가 없었고, 실제로 돌리지 않았다

§7은 vitest anchor만 세웠다. 신규 UI 분기(**simple + daily**)는 **브라우저에서 확인하지 않았다.**
- 저장소 DoD는 「브라우저 수동 확인 또는 미수행 명시」다 → **미수행을 명시한다.**
- 기존 E2E는 simple+**direct**만 지난다(`stock-transfer-165-5-floor80.spec.ts:77`).
- ①은 이 갭을 E2E로 메운 선례가 있다(`stock-listed-conversion-kiwoom-autofetch.spec.ts` KA-5 —
  「컴포넌트 anchor는 patch와 validate를 각각 보지만 **두 겹을 지나 다음 단계로 넘어가는지**는
  브라우저에서만 안다」). ②에는 그 대응물이 없다.
- ⇒ **잔여 작업**: simple+daily로 종가를 넣고 Step3까지 넘어가는 spec 1건.

### 🟡 D-5 Q2 제외의 결과로 ①·② 결과 표시가 비대칭인데 잔여로 적지 않았다

①은 엔진 result에 `transferDailyModeUsed`가 있어 결과 화면에 「✓ 일자별 입력 모드 — 자동 산정
평균 N」 배너가 뜬다(`PostListingDetailCard.tsx:189`). ②에는 그 echo가 없다.
사용자는 결과만 보고 **②를 일자별로 넣었는지 알 수 없다.** 의도한 제외이나 잔여로 남는다.

### ✅ 검증 통과 (실측)

| 주장 | 결과 |
|---|---|
| §1 §165⑤ 원문 인용 | KoreanLaw MST 286211 대조 일치 |
| §3.3 「읽기 3곳」 | validate·adapter·preview **정확히 3곳** (grep) |
| §4 ⑥ 사이드바 참조처 0건 | 0건 |
| §3.2 full 분기가 직접입력값을 0으로 덮는다 | 코드 확인 — 제외 판단 타당 |
| §2.2 엔진·Zod·route 무변경 | 실제 무변경, 엔진 테스트 전건 통과 |
