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

## 3. 결함 성격 — spec rot 2건 + 프로덕션 결함 소지 1건

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
① "취득일이 실제로 다름"과 ② "토지·건물 분리 계산 필요"를 겸하는데, 겸용주택은 ②만 해당한다.
프로젝트는 이 구분을 위해 이미 `isSeparateAcquisition()` 헬퍼를 두고 있다
(`transfer-tax-split-acq-mode.ts:120-127` — 겸용주택은 명시적으로 `false`).
그런데 **취득일 2열 렌더 조건은 여전히 `isSplit`(= 플래그 원본)** 이다
(`CompanionAcqPurchaseBlock.tsx:116` → `CompanionAcqDateSection.tsx:125`).

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

> T4(`:412`)는 현재 **통과 중**이지만 같은 rot을 안고 있다. 겸용 경로이면서 취득 시점을 쓰지 않아
> 증상이 드러나지 않았을 뿐이므로 함께 교체한다.

**실행 결과(2026-07-29)**: 대상 4곳 교체 후 `transfer-phd-building-stdprice-calculator.spec.ts`
**11건 전건 통과**. T5는 3시점 산출값 3개(`71,280,000 / 79,320,000 / 87,840,000`),
T7은 6필드 산출값 6개를 출력해 `모두 적용` 개수가 기대와 일치함을 확인.

### Phase 2 (권장) — D-C 프로덕션 결함

세 안 중 택일. **B안 권장**.

| 안 | 내용 | 판정 |
|---|---|---|
| A. 안내 강화만 | 모달 "해당 시점 날짜 미입력 — 계산 제외" 문구에 **입력 위치**를 명시("③ 취득 정보의 «건물 취득일»") | 최소 변경이나 사용자가 여전히 2열을 채워야 한다 |
| **B. 취득일 2열 렌더 조건 교정** | 2열 렌더를 `isSplit` → **`isSeparateAcquisition()`** 로 바꿔, 겸용주택·`selfOwns` 강제 분리처럼 **취득일이 같은 경로는 단일 칸**으로 되돌린다 | **권장** — 플래그 오버로딩 해소가 근본. 겸용주택 사용자가 애초에 2열을 볼 이유가 없다 |
| C. `:258`에 fallback | `acquisitionDate \|\| landAcquisitionDate` | **기각** — PHD 3시점의 「취득당시」는 **건물** 기준시가 산정이라 건물 취득일이 기준이다(§164③ 직전 고시분). 토지 취득일로 대체하면 **잘못된 연도 체계**를 쓴다(조용한 오답 — 표시 결함보다 나쁘다) |

B안 적용 시 **취득일이 실제로 다른 겸용주택**은? `isSeparateAcquisition()`이 겸용을 명시적으로
제외하므로(`:125`) 2열이 사라진다 — 그 경로는 4부분 안분(`transfer-tax-mixed-use.ts`)이 별도 축을
지배하므로 범위 밖이라는 것이 기존 설계 판단이다. **B안은 그 판단을 UI에 일관 적용하는 것**이며,
겸용에서 토지 취득일을 별도로 받아야 한다면 그것은 별개 기능 요구다(§6에 기록).

### Phase 3 (선택) — 문구 정정

validate 오류 메시지 조사 오류: "겸용주택 취득 실거래가**을** 입력하세요" → **"를"**.
(라벨이 받침 없는 "가"로 끝나는데 "을"이 붙었다. 메시지 생성부는 Phase 3 착수 시 grep으로 확정한다.)

---

## 5. 케이스 매트릭스 (Phase 2 B안 적용 후 기대)

| # | 자산 | 조건 | 취득일 UI | PHD 3시점 모달 |
|---|---|---|---|---|
| 1 | 겸용주택 | 취득일 동일(정상) | **단일 칸** | 취득 시점 산출 ✅ |
| 2 | 겸용주택 | 취득일 다르게 입력 시도 | 단일 칸(입력 불가) | 취득 시점 산출 ✅ · §6 기록 |
| 3 | 주택·건물 | `hasSeperate` ON + 날짜 상이 | 2열 유지 | 건물 취득일 기준 ✅ |
| 4 | 주택·건물 | `hasSeperate` ON + 날짜 동일 | **단일 칸**(회귀 주의) | ✅ |
| 5 | 주택·건물 | `selfOwns ≠ both` 강제 ON | **단일 칸** | ✅ |

⚠️ **#4 주의**: 사용자가 토글을 켜고 아직 날짜를 안 넣은 **입력 도중 상태**도
`isSeparateAcquisition() === false`다(두 날짜가 같거나 비어 있음). 그 순간 2열이 사라지면
**토지 취득일을 입력할 방법이 없어진다** — Phase 1-c(D6)에서 겪은 것과 같은 구조의 dead-end다.
→ B안은 `hasSeperate 토글이 ON이면 2열 유지`를 함께 만족해야 한다. 즉 조건은
`isSplit && (사용자가 토글을 명시적으로 켰거나 날짜가 실제로 다름)`이며,
**겸용·`selfOwns` 자동 강제분만 단일 칸으로 되돌리는 것**이 정확한 표현이다.
`hasSeperateLandAcquisitionDate`가 자동 강제인지 사용자 선택인지 구분하는 신호가 현재 폼에 없으므로,
**신호 필드 추가 여부가 Phase 2의 실제 설계 쟁점**이다(§7 미확인).

---

## 6. 테스트 계획

### Phase 1 — 기존 spec 정정만 (신규 anchor 없음)

| 검증 | 방법 |
|---|---|
| F1·F2 통과 | `npx playwright test e2e/mixed-use-filing-form-4col.spec.ts` |
| F3·F4 통과 | `npx playwright test e2e/transfer-phd-building-stdprice-calculator.spec.ts` |
| 회귀 0 | 두 spec 전체(각 T1~T7 포함) |

### Phase 2 — anchor 필수

| ID | 케이스 | 단언 |
|---|---|---|
| E1 | 겸용주택 ON | 취득일 입력이 **1개**(`acq-date-land` 미렌더) |
| E2 | 겸용주택 ON + PHD | 3시점 모달에 「취득당시」 행 노출 · `computedCount` 3 |
| E3 | 주택 + `hasSeperate` 수동 ON + 날짜 미입력 | 2열 **유지**(입력 경로 소멸 금지 — 매트릭스 #4) |
| E4 | 주택 + 날짜 상이 | 2열 유지 · 회귀 0 |
| E5 | `selfOwns = building_only` | 단일 칸 · PHD 취득 시점 산출 |

### 회귀 범위

Phase 2는 `CompanionAcqDateSection` 렌더 조건 변경이라 **취득일 입력을 쓰는 모든 E2E**가 영향권이다.
`grep -rln "acq-date-building\|acq-date-land" e2e/`로 목록을 먼저 확보하고,
`--reporter=json` baseline 대비 신규 실패로 판정한다
(memory `feedback_blocking_validation_full_e2e_regression`의 절차를 렌더 조건 변경에도 적용).

---

## 7. 미확인 항목

- **Phase 2의 핵심 쟁점**: `hasSeperateLandAcquisitionDate`가 **자동 강제분인지 사용자 선택분인지**
  구분하는 신호가 현재 폼에 없다. 신호 필드(`landAcqDateSplitByUser` 등)를 추가할지,
  아니면 `assetKind`·`isMixedUseHouse`·`selfOwns`로 자동 강제 경로를 역판정할지 미정.
  후자는 강제 조건이 늘어날 때마다 두 곳을 고쳐야 해 드리프트 위험이 있다.
- Phase 3 조사 오류 메시지의 생성 위치 미확정(`transfer-tax-validate-*.ts` grep 필요).
- F3·F4가 **언제부터** 깨졌는지는 미조사 — 수정에 필요하지 않아 생략했다.

---

## 8. 작업 순서

```
── PR ① (Phase 1 — spec 정정) ✅ 2026-07-29 완료 ────────────────
1. ✅ mixed-use-filing-form-4col.spec.ts seed에 fixedAcquisitionPrice 추가 → 2/2 통과
2. ✅ transfer-phd-building-stdprice-calculator.spec.ts 취득일 **4곳** testid 교체 → 11/11 통과
3. ✅ 영향 5파일 재실행 → **40건 전건 통과**(사전존재 실패 4 → 0), tsc 0건

> 프로덕션 코드 무변경(E2E spec·seed만) — 취득가액 산식·법령 적용·배관에 손대지 않았다.

── PR ② (Phase 2 — D-C 프로덕션) ───────────────────────────────
4. §7 미확인 쟁점 결정(신호 필드 여부) → verify: 사용자 확인
5. E2E baseline 확보(취득일 사용 spec 전수, --reporter=json)
6. anchor E1~E5 작성 → RED 확인
7. 렌더 조건 교정 구현              → verify: E1~E5 GREEN
8. baseline 대비 신규 실패 식별      → verify: 0건
```
