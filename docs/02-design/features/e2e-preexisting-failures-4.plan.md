# E2E 사전존재 실패 4건 수정 계획서

> 대상: `mixed-use-filing-form-4col.spec.ts` 2건 · `transfer-phd-building-stdprice-calculator.spec.ts` 2건
> 작성: 2026-07-29
> 발견 경위: `transfer-split-part-std-card-gating.plan.md` PR ② baseline 확보 중 발견.
> PR ① 직전 커밋(`4dcf394f`)으로 되돌려 재실행해도 **동일 4건 실패** → 그 작업의 회귀가 아님을 확인.

---

## 1. 증상

| # | spec | 테스트 | 실패 형태 |
|---|---|---|---|
| F1 | `mixed-use-filing-form-4col` | 5열 헤더 + 구 2열 라벨 미표시 + 양도가액 자기정합 | `getByText('신고서 양식')` 20s timeout |
| F2 | 〃 | 토지≠건물 취득일 → 취득일자 행 토지 열/건물 열 상이 | 〃 |
| F3 | `transfer-phd-building-stdprice-calculator` | T5 겸용 Case B — 주택 3시점 산출·적용 | `모두 적용 (2개)` ≠ 기대 `3개` |
| F4 | 〃 | T7 겸용 Case A — 일괄 6필드 산출·적용 | `모두 적용 (4개)` ≠ 기대 `6개` |

---

## 2. 실측 (Playwright probe, 2026-07-29 · 검증 후 폐기)

### F1·F2 — 계산이 validate에 차단되어 결과 화면에 도달하지 못한다

계산 버튼 클릭 후 화면 텍스트 덤프(콘솔 에러 0건):

```
자산: 겸용주택 취득 실거래가을 입력하세요. 법 §100²에 따라 취득시 기준시가 비율로
주택분·상가분에 안분합니다.
```

spec의 `mixedUseAsset()` seed(`:16-38`)에는 **취득가액(`fixedAcquisitionPrice`)이 없다**.
기준시가 6필드(`mixedAcqHousingPrice` 등)만 넣고 실거래가를 넣지 않았다. 겸용주택 실가 모드에서
취득가액은 §100② 안분의 피안분액이므로 **validate가 요구하는 것이 옳다**.

**수정안 검증**: seed에 `fixedAcquisitionPrice: "700000000"`만 추가하고 재실행한 결과

| 확인 항목 | 결과 |
|---|---|
| 신고서 양식 표시 | `true` |
| `[data-print-id="filing-form"]` | 1개 |
| 표 헤더 | `["항목","합계","주택분 토지","주택분 건물","상가분 토지","상가분 건물"]` — 5열 기대와 일치 |
| 취득일자 행(F2용 seed) | `["취득일자","2010-03-15","2005-06-10","2010-03-15","2005-06-10","2010-03-15"]` |

F2 단언(`cells.nth(2)`=주택분 토지 `2005` / `cells.nth(3)`=주택분 건물 `2010` / 두 값 상이)도 충족.
→ **seed 1필드 추가로 F1·F2 모두 해소**.

### F3·F4 — 취득 시점이 통째로 계산에서 제외된다

모달 텍스트 덤프:

```
취득시 (연도 미상) 공시지가
해당 시점 날짜 미입력 — 계산 제외
최초공시일 (2015년) 공시지가
양도시 (2025년) 공시지가
```

구조·용도 콤보도 「최초공시」·「양도당시」 2개뿐(취득 시점 행 없음).
`computedCount`(`PhdBuildingStdPriceModalButton.tsx:268-278`)는 3시점 × 주택/상가 6슬롯의 non-null
개수이므로, 취득 시점이 빠지면 **T5는 3→2, T7은 6→4**가 된다. 관측값과 정확히 일치.

**원인**: spec이 취득일을 **토지 취득일 칸**에 넣고 있다.

```
[P-B2] 섹션3 내 '연도' 입력 개수: 2      ← 토지·건물 2열
[P-B2] .first() 방식  → {acquisitionDate: "",           landAcquisitionDate: "2010-06-15"}
[P-B2] testid 방식    → {acquisitionDate: "2010-06-15", landAcquisitionDate: "2010-06-15"}
                          → 모달에 「취득당시 (구조·용도 — 2010년 체계)」 출현
```

겸용주택 토글이 `hasSeperateLandAcquisitionDate: true`를 **강제**하므로
(`MixedUseSection.tsx:44-50` — "겸용주택 ON: 토지/건물 분리 모드 자동 활성화") 취득일이 2열이 되고,
spec의 `.first()`는 앞 칸인 **토지 취득일**을 잡는다. 건물 취득일(`acquisitionDate`)이 빈 채로 남아
PHD 3시점 모달이 취득 시점을 제외한다.

---

## 3. 결함 성격 — spec rot 2건 + 프로덕션 결함 1건

### D-A (spec) F1·F2 — seed 불완전

겸용주택 실가 모드에 취득가액이 없는 것은 **비현실적 입력**이다. validate 강화 시점에 이 spec이
깨졌고 방치됐다. 프로덕션 동작은 정상.

### D-B (spec) F3·F4 — 셀렉터가 UI 재배치를 따라가지 못함

`.first()`로 날짜를 잡는 패턴은 취득일이 단일 칸이던 시절의 것이다. 2026-07-29 별개취득 입력 흐름
재배치(`transfer-split-input-flow-reorder.plan.md`)로 분리 ON 시 `[토지 취득일 | 건물 취득일]` 2열이
되면서 의미가 바뀌었다. `e2e/CLAUDE.md` §1이 경고하는 **인덱스 의존 셀렉터 rot**의 재발이다.

### D-C (프로덕션) 건물 취득일 미입력이 조용히 취득 시점을 삭제한다 🔴

spec을 고쳐도 **실사용 결함은 남는다**. 겸용주택 사용자가 취득일을 한 칸만 채우면(2열 중 앞 = 토지),
PHD 3시점 모달이 취득 시점을 계산에서 빼고 **환산취득가 산정이 조용히 축소**된다.

같은 파일 안에서 취득일 소스가 두 갈래인 것이 방치를 키웠다:

| 위치 | 소스 |
|---|---|
| `MixedUsePreHousingDisclosureSection.tsx:80` | `asset.landAcquisitionDate \|\| asset.acquisitionDate` (fallback 有) |
| 〃 `:258` (PHD 3시점 모달 런처) | `asset.acquisitionDate` (fallback 無) |

**더 근본적으로는 플래그 오버로딩**이다. `hasSeperateLandAcquisitionDate`가
① "취득일이 실제로 다름"과 ② "토지·건물 분리 계산 필요"를 겸한다.
프로젝트는 이 구분을 위해 이미 `isSeparateAcquisition()` 헬퍼를 두고 있다
(`transfer-tax-split-acq-mode.ts:120-127` — 겸용주택은 명시적으로 `false`).
그런데 **취득일 2열 렌더 조건은 여전히 `isSplit`(= 플래그 원본)** 이다
(`CompanionAcqPurchaseBlock.tsx:117` → `CompanionAcqDateSection.tsx:125`).

> ⚠️ **정정(2026-07-29 실측)** — 초안은 여기서 "겸용주택은 ②만 해당한다 → 취득일이 같으므로
> 단일 칸이어야 한다"고 썼으나 **틀렸다**. `isSeparateAcquisition()`이 겸용을 `false`로 두는 것은
> **취득가액 축에서 파트별 완결을 요구하지 않는다**는 뜻이지 취득일이 같다는 뜻이 아니다.
> 겸용주택도 토지·건물 취득일이 다를 수 있고 **엔진이 그 값을 실제로 소비한다** — §4 Phase 2 참조.

---

## 4. 수정 설계

### Phase 1 (필수) — spec 2건 정정

**F1·F2**: `mixed-use-filing-form-4col.spec.ts`의 `mixedUseAsset()`에 취득가액 1필드 추가.

```ts
// 겸용주택 실가 모드의 §100② 피안분액 — 없으면 validate가 계산을 차단한다.
fixedAcquisitionPrice: "700000000",
```

값은 계산 성공만 좌우하고 기존 단언(5열 헤더·양도가액 자기정합 1,500,000,000·취득일자 행)에는
영향이 없음을 probe로 확인했다.

**F3·F4**: `transfer-phd-building-stdprice-calculator.spec.ts`의 취득일 입력을 **testid 기반**으로 교체.

```ts
// 겸용주택은 분리 모드가 강제 ON이라 취득일이 2열이다 — `.first()`는 토지 취득일을 잡는다.
// PHD 3시점 모달은 건물 취득일(acquisitionDate)을 본다.
await fillDateExact(page.getByTestId("acq-date-building"), { year: "2010", month: "06", day: "15" });
```

**교체 대상은 4곳**(실측 정정 — 초안은 3곳으로 적었다). `data-asset-section="3"` 스코프를 쓰는
날짜 입력은 9곳이지만, 그중 **겸용주택 토글을 켠 경로만** 2열이 된다:
T4(`:412`) · `gotoMixedPhd`(`:456`) · T6(`:530`) · T7(`:576`).
나머지 5곳(`:150`·`:234`·`:315`·`:646`·`:711`)은 단일 칸이라 종전 셀렉터가 정상 동작한다 —
**건드리지 않는다**(불필요한 변경 금지).

> ⚠️ 위 라인 번호는 **교체 전(2026-07-29 PR ① 착수 시점)** 기준이다. 구현 시 헬퍼
> `acqDateBuilding`(12줄)을 추가했으므로 현재 파일에서는 그만큼 밀려 있다. 재확인은 라인이 아니라
> `grep -n '겸용주택 분리계산'`으로 겸용 경로를 찾아 그 직후 날짜 입력을 대조한다.

> T4(`:412`)는 현재 **통과 중**이지만 같은 rot을 안고 있다. 겸용 경로이면서 취득 시점을 쓰지 않아
> 증상이 드러나지 않았을 뿐이므로 함께 교체한다.

**실행 결과(2026-07-29)**: 대상 4곳 교체 후 `transfer-phd-building-stdprice-calculator.spec.ts`
**11건 전건 통과**. T5는 3시점 산출값 3개(`71,280,000 / 79,320,000 / 87,840,000`),
T7은 6필드 산출값 6개를 출력해 `모두 적용` 개수가 기대와 일치함을 확인.

### Phase 2 — D-C 프로덕션 결함 (**A안 확정**, 2026-07-29 사용자 결정)

#### ⛔ B안(2열 → 단일 칸) 기각 — 실측으로 **기능 제거**임이 확인됨

초안의 권장안이었으나 **철회**한다(2026-07-29 실측).

**근거 1 — 겸용 엔진이 토지 취득일을 실제로 소비한다.**

| 소비처 | 용도 |
|---|---|
| `transfer-tax-mixed-use.ts:136-139` | `landAcquisitionDate < buildingAcquisitionDate ? land : building` — **LTHD 기간분할 기산일** |
| `transfer-tax-mixed-use-fourpart.ts:25·56` | 4부분 안분 |
| `transfer-tax-mixed-use-housing.ts:77·106·208` · `-commercial.ts:182` | 주택분·상가분 산정 |

**근거 2 — 겸용(매매)에서 2열이 유일한 입력 경로다.** `landAcquisitionDate`를 실제로 렌더하는
위젯은 3곳뿐이고(`CompanionAcqDateSection.tsx:132` · `GeneralBuildingAcquisitionCards.tsx:158` ·
`CompanionAcquisitionCauseSection.tsx:201`은 **prop 전달**일 뿐 렌더 아님), 겸용 매매 경로는
`CompanionAcqDateSection`의 2열이 전부다.

→ 2열을 없애면 **엔진이 계속 쓰는 값의 입력 경로가 사라진다**. 이번 세션 D6·Phase 1-a(3)에서
반복 확인한 "게이트 추가 = 입력 경로 제거" 함정의 재현이며, 결과는 조용한 오답이다.

**근거 3 — 기존 E2E가 그 기능을 검증 중이다.** `mixed-use-filing-form-4col.spec.ts:133`
"토지≠건물 취득일 → 취득일자 행 토지 열/건물 열 상이"가 겸용주택에서 토지 2005 / 건물 2010을
seed로 넣고 신고서 분리 표시를 단언한다. B안은 이 기능을 제거한다.

**따라서 신호 필드(`landAcqDateSplitForced` 등)도 불필요하다** — 렌더 조건을 바꾸지 않으므로
"자동 강제분 vs 사용자 선택분" 구분이 필요 없다. §7의 미확인 쟁점은 **소멸**한다.

#### ✅ 채택 — A안(안내 강화)

결함의 본질은 "2열이 뜨는 것"이 아니라 **"둘 다 채워야 한다는 사실을 알리지 않는 것"** 이다.

| 항목 | 구현 위치 | 조건 | 내용 |
|---|---|---|---|
| **A-1** | `CompanionAcqDateSection.tsx` — 2열 그리드(`:125-160`) **바로 위** | `isSplit && isMixedUse` — **prop이 이미 있다**(`:40`·`:45`, 추가 배선 불요) | "겸용주택은 토지·건물 취득일을 **각각** 입력합니다. 같은 날 취득했다면 같은 날짜를 넣으세요 — 두 값이 4부분 안분·장기보유공제 기산에 각각 쓰입니다(소득령 §166⑥)." |
| **A-2** | `PhdBuildingStdPriceModalButton.tsx:451` | 현행 문자열 `"해당 시점 날짜 미입력 — 계산 제외"` 교체 | "해당 시점 날짜 미입력 — 계산 제외 (③ 취득 정보의 「건물 취득일」을 입력하면 취득시점도 함께 산출됩니다)" |
| A-3 (선택) | 동상 2열 | 한쪽만 채워진 상태 | 빈 칸 hint 강조. **에러가 아닌 hint** 수준(과잉 경고 금지) |

**UI 규약 준수**(`components/calc/CLAUDE.md`):
- A-1은 안내 카드이므로 인라인 톤 하드코딩 금지 → **`<ToneCard tone="amber" noDark>`**
  (취득 축 = amber. 같은 파일 형제 카드와 `noDark` 일치).
- 라벨 크기는 정본 클래스만 — hint는 `text-xs`, fine print는 `text-caption`.
  임의 px 금지(`scripts/check-font-sizes.sh` pre-push 하드블록).
- 동적 톤 보간 금지(`scripts/check-tone-classes.sh` 하드블록).

**신설 testid**(anchor 셀렉터 — 문구 매칭은 재배치 때 또 깨진다):
`split-acq-date-mixed-note`(A-1) · `phd-point-excluded-note`(A-2).

**매트릭스 #3(수동 ON)에 A-1을 붙이지 않는 근거**: 사용자가 「토지·건물 취득일 다름」을 **직접**
켠 경우는 "취득일이 실제로 다르다"는 의도 표명이므로 둘 다 채울 의사가 있다. 반면 겸용은
**원하지 않았는데 토글이 자동으로 켜져** 2열이 나타난 것이라, 왜 두 칸인지·둘 다 채워야 하는지를
사용자가 알 길이 없다. 안내는 **의도하지 않은 강제**에만 붙인다(노이즈 최소화).

C안(`:258`에 `acquisitionDate || landAcquisitionDate` fallback)은 **기각 유지** — PHD 3시점의
「취득당시」는 **건물** 기준시가 산정이라 건물 취득일이 기준이다(§164③ 직전 고시분). 토지 취득일로
대체하면 잘못된 연도 체계를 써서 조용한 오답이 된다(표시 결함보다 나쁘다).

### Phase 3 (선택) — 조사 오류 정정

**위치 확정(2026-07-29 실측)**: `lib/calc/transfer-tax-validate-mixed-use-asset.ts:73`

```ts
const basisLabel = isSalesCase ? "매매사례가액" : isAppraisal ? "감정가액" : "취득 실거래가"; // :54
…
`${label}: 겸용주택 ${basisLabel}을 입력하세요. …`                                            // :73
```

`basisLabel` 3종 중 **"취득 실거래가"만 받침이 없어** "실거래가을"이 된다(감정가액·매매사례가액은
"액을"로 정상). → **라벨을 `"취득 실거래가액"`으로 바꾼다** — 3종 모두 "액"으로 끝나 조사가 일관되고,
결과 화면 표기(`MixedUseResultCard.tsx:334` "취득 실거래가(취득가액)")와도 어긋나지 않는다.
조사 분기 로직을 새로 만들지 않는 것이 더 단순하다.

---

## 5. 케이스 매트릭스 (A안 적용 후 기대 — 렌더 조건 **불변**)

| # | 자산 | 조건 | 취득일 UI | 안내 | PHD 3시점 모달 |
|---|---|---|---|---|---|
| 1 | 겸용주택 | 토글 자동 강제 | 2열 **유지** | **A-1 신설** | 건물 취득일 채우면 취득 시점 산출 |
| 2 | 겸용주택 | 건물 취득일 미입력 | 2열 | A-1 + A-3 | **A-2 안내**로 입력 위치 지시 |
| 3 | 주택·건물 | `hasSeperate` 수동 ON | 2열 유지 | 변경 없음 | ✅ |
| 4 | 주택·건물 | `selfOwns ≠ both` 강제 | 2열 유지 | A-1 준용 검토 | ✅ |
| 5 | 겸용주택 | 토지≠건물 취득일 실입력 | 2열 | — | ✅ · **신고서 분리 표시 유지**(기존 E2E가 검증) |

**렌더 조건을 바꾸지 않으므로 입력 경로 소멸·dead-end 위험이 없다.** 초안 B안이 안고 있던
"입력 도중 상태에서 2열이 사라진다"는 문제 자체가 발생하지 않는다.

---

## 6. 테스트 계획

### Phase 1 — 기존 spec 정정만 (신규 anchor 없음)

| 검증 | 방법 |
|---|---|
| F1·F2 통과 | `npx playwright test e2e/mixed-use-filing-form-4col.spec.ts` |
| F3·F4 통과 | `npx playwright test e2e/transfer-phd-building-stdprice-calculator.spec.ts` |
| 회귀 0 | 두 spec 전체(각 T1~T7 포함) |

### Phase 2 (A안) — anchor

| ID | 케이스 | 단언 |
|---|---|---|
| E1 | 겸용주택 토글 ON | 취득일 2열 **유지**(`acq-date-land`·`acq-date-building` 각 1개) + A-1 안내 노출 |
| E2 | 겸용 아님(주택 단독) | A-1 안내 **미노출**(자동 강제 경로에만 붙는다) |
| E3 | PHD 3시점 모달 · 건물 취득일 미입력 | "계산 제외" 문구에 **입력 위치** 포함(A-2) |
| E4 | PHD 3시점 모달 · 3시점 연도 확정 | 「계산 제외」 안내 0 · 「취득당시」 행 노출 (회귀 가드) |
| ~~E5~~ | 겸용 + 토지≠건물 취득일 | **신규 anchor 불요** — 기존 `mixed-use-filing-form-4col.spec.ts:133`(F2)이 이미 신고서 분리 표시를 단언한다. B안이 제거했을 기능의 가드로 그대로 활용 |

**실행 결과(2026-07-29)**: RED **2:3**(E1·E3 실패 / E2·E2-b·E4 통과) → 구현 후 **5건 전건 GREEN**.
파일: `__tests__/components/split-acq-date-mixed-note.test.tsx`.

### 회귀 범위

A안은 **표시 문구 추가**라 렌더 조건이 불변이다. `CompanionAcqDateSection`·PHD 모달을 쓰는
E2E만 확인하면 된다(`grep -rln "acq-date-building\|3시점 건물 기준시가" e2e/`).
B안이었다면 필요했을 전수 baseline 비교는 **불필요**하다.

**문구 매칭 단언 파손 — 실측 결과 0건**(2026-07-29):

| grep | 결과 |
|---|---|
| `"계산 제외"` (A-2 교체 대상) | e2e **주석 2곳뿐**, `expect` 단언 0건 |
| `"취득 실거래가"` (Phase 3 라벨) | e2e 주석 1곳 + anchor 테스트 **주석** 4곳, 단언 0건 |

→ A-2·Phase 3 모두 **기존 테스트를 깨지 않는다**. 신설 testid로 단언하므로 앞으로도 문구 변경에
강해진다(문구 매칭 단언을 새로 만들지 말 것).

**실행 결과(2026-07-29)** — 관련 E2E 6파일:

| 항목 | 결과 |
|---|---|
| 순차 실행(`--workers=1`) 3파일 37건 | **전건 통과** |
| 병렬 실행 시 3건 실패 | **부하 문제** — 단독 재실행 시 PHD 11/11·case-a 1/1 통과. E2E 검증은 `--workers=1` 권장 |
| `mixed-use-commercial-stdprice-landprice-prefill.spec.ts` 1건 | 🟡 **사전존재 실패** — A안 변경 2파일을 `git stash`로 되돌려 재실행해도 **동일 실패**("2001.1.1. 현재 공시지가" placeholder 미발견). 본 작업과 무관하며 **별도 항목**으로 남긴다(§7) |

---

## 6-A. 14 동기화 지점 점검

**엔진 input·result 타입 변경 없음 · 신규 폼 필드 없음 · API 스키마 변경 없음.**
A안은 표시 문구, Phase 3는 문자열 상수 변경이므로 해당 지점은 ⑤ 하나다.

| 지점 | 해당 | 근거 |
|---|---|---|
| ①폼 상태 ②initial ③normalize | ✕ | **신호 필드를 두지 않기로 확정** — 폼 필드 추가 자체가 없다 |
| ④API 변환 ⑨~⑭ | ✕ | 전송 필드 불변 |
| ⑤UI 위젯 | **✓** | A-1·A-2·A-3 |
| ⑥사이드바 ⑦결과 카드 | ✕ | 표시값 불변 |
| ⑧validation | **✓(Phase 3만)** | 메시지 **문자열**만 바뀐다 — 차단 조건·판정 로직 불변이므로 UI↔validate 모순 발생 여지 없음 |

**⑧ 자가 점검**: Phase 3는 `basisLabel` 상수 1개 변경이라 어느 입력이 통과/차단되는지가 달라지지
않는다. 다만 그 메시지를 **문자열로 단언하는 테스트**가 있으면 깨진다 →
`grep -rn "실거래가을\|취득 실거래가" __tests__/ e2e/`로 착수 전 확인.

---

## 7. 미확인 항목

- ~~Phase 2 핵심 쟁점: 자동 강제분 vs 사용자 선택분 신호 필드~~ → **소멸(2026-07-29)**.
  B안 기각으로 렌더 조건이 불변이 되어 그 구분이 필요 없어졌다. 신호 필드는 추가하지 않는다.
- **A-1 안내를 `selfOwns ≠ both` 강제 경로에도 붙일지** 미정(매트릭스 #4). 그 경로는 소유자가
  달라 취득일도 실제로 다른 경우가 많아 안내 필요성이 겸용보다 낮을 수 있다 — Phase 2 착수 시 결정.
- ~~Phase 3 조사 오류 메시지의 생성 위치~~ → **확정**: `transfer-tax-validate-mixed-use-asset.ts:54·73`.
- F3·F4가 **언제부터** 깨졌는지는 미조사 — 수정에 필요하지 않아 생략했다.
---

## 9. 후속 작업 (본 계획서 범위 밖 — 별도 착수)

### 🟡 N-1. `mixed-use-commercial-stdprice-landprice-prefill.spec.ts` 1건 사전존재 실패

- **테스트**: "취득 ≤2000: 배치 모달의 2001.1.1 공시지가가 상가 모달 취득칸에 자동 채움"
- **증상**: `getByPlaceholder('2001.1.1. 현재 공시지가')` 대기 timeout(120s)
- **본 작업 무관 확인**: A안 변경 2파일(`CompanionAcqDateSection` · `PhdBuildingStdPriceModalButton`)을
  `git stash`로 되돌려 재실행해도 **동일 실패**. 단독 실행(`--workers=1`)에서도 재현되므로
  병렬 부하 문제도 아니다.
- **미조사 항목**: 해당 placeholder를 렌더하는 조건(취득 ≤2000 + 최초공시 ≤2000 경로의
  `landPrice2001PerM2` 입력 칸)이 언제 사라졌는지, spec rot인지 프로덕션 회귀인지.
  D-A(seed 불완전)·D-B(셀렉터 rot) 어느 유형인지부터 판별해야 한다.
- **착수 시 첫 단계**: 본 계획서 §2와 동일하게 **Playwright probe로 모달 텍스트를 덤프**해
  "어느 칸이 없는지"부터 실측할 것(추정 금지).

---

## 8. 작업 순서

```
── PR ① (Phase 1 — spec 정정) ✅ 2026-07-29 완료 ────────────────
1. ✅ mixed-use-filing-form-4col.spec.ts seed에 fixedAcquisitionPrice 추가 → 2/2 통과
2. ✅ transfer-phd-building-stdprice-calculator.spec.ts 취득일 **4곳** testid 교체 → 11/11 통과
3. ✅ 영향 5파일 재실행 → **40건 전건 통과**(사전존재 실패 4 → 0), tsc 0건

> 프로덕션 코드 무변경(E2E spec·seed만) — 취득가액 산식·법령 적용·배관에 손대지 않았다.

── PR ② (Phase 2 — D-C 프로덕션 · A안) ✅ 2026-07-29 완료 ────────
4. ✅ 착수 전 grep → **파손 예정 0건**(§6 회귀 범위 표)
5. ✅ anchor E1~E4 작성 → RED **2:3** 확인(E5는 기존 F2로 대체)
6. ✅ A-1 안내(ToneCard amber noDark · testid `split-acq-date-mixed-note`) → E1·E2 GREEN
7. ✅ A-2 PHD 모달 문구 교체(testid `phd-point-excluded-note`) → E3·E4 GREEN
8. ✅ 톤·폰트 게이트 0건 · E2E 37건 순차 전건 통과 · tsc 0건 · anchor 5/5

── PR ③ (Phase 3 — 조사 오류) ✅ 2026-07-29 완료 ────────────────
9.  ✅ grep → 단언 0건(주석만) — 파손 없음
10. ✅ `transfer-tax-validate-mixed-use-asset.ts:54` 라벨 → "취득 실거래가액"
        (조사 고정 `${basisLabel}을`을 유지하려면 3종 라벨이 모두 받침 있는 "액"으로
         끝나야 한다는 규약을 주석으로 못박음 — 재발 방지)
11. ✅ 겸용 validate 23건 통과 · `npm run test:transfer` 4,860건 통과 · tsc 0건
```
