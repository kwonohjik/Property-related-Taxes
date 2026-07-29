# 건물기준시가 모달 E2E spec rot 수정 — 계획서

- 작성일: 2026-07-15
- 규모: **소** (E2E spec 셀렉터 정정 3건 + testid 추가. 엔진·계산 로직 무변경) → 디자인 문서 N/A
- 발단: PR #607 작업 중 `mixed-use-asset-major-commercial-modal.spec.ts` 실패 발견 → master에서도 동일 재현(사전 존재)
- 정책: `e2e/CLAUDE.md`(셀렉터 안티패턴) · `feedback_e2e_preexisting_failures` · `feedback_browser_verify_with_playwright`

---

## 0. 판정 — **제품 버그 아님, spec rot**

세 스펙 모두 **제품이 개선되면서 스펙이 따라가지 못한 것**이다. 계산 로직·엔진 결함 아님. 사용자 영향 0.

> ⚠️ 다만 **테스트가 침묵으로 썩어 있었다**는 사실 자체가 결함이다. 아래 §2-B는 `nth()` 서수가 어긋나
> **취득 값을 양도 칸에 채우고 있었다** — 만약 그 뒤 단언이 느슨했다면 **틀린 값으로 통과**했을 수 있다.

---

## 1. 실측 — 실패 3건 (사용자 지적 1건 + 동종 전수에서 2건 추가 발견)

사용자가 지적한 것은 1건이나, "연도 선택"·건물기준시가 모달에 의존하는 스펙을 전수 실행해 **2건을 추가로** 찾았다.

| # | spec | 실패 지점 | 원인 |
|---|---|---|---|
| 1 | `mixed-use-asset-major-commercial-modal.spec.ts:76` | `getByText('연도 선택')` 타임아웃 | **A. 연도 prefill** |
| 2 | `building-stdprice-apply-timepoint.spec.ts:26` | 동상 | **A. 연도 prefill** |
| 3 | `building-std-2023-mixed-transfer-report.spec.ts:69` | `getByPlaceholder('원/㎡').nth(1)` 타임아웃 | **B. placeholder 분기** |

**전수 범위**(grep 실측): `"연도 선택"` 사용 9개 ∩ 건물기준시가 모달 사용 11개. 교집합 4건 + prefill 전용 스펙 1건을 실행 → 위 3건 실패, `building-standard-price.spec.ts`·`building-stdprice-modal-prefill.spec.ts` 등 **18건 통과**.

---

## 2. 원인 (커밋까지 특정)

### 2-A. 연도 prefill로 `"연도 선택"`이 렌더되지 않음 — 스펙 #1·#2

`BuildingStdPriceForm.tsx:72` `YearSelect`의 `placeholder = "연도 선택"`은 **값이 비었을 때만** 렌더된다.
`BuildingStdPriceModalButton.tsx:86-87`이 자산 날짜에서 연도를 파생해 미리 채운다:

```ts
const acqYear   = prefill?.acquisitionDate ? deriveYearFromEventDate(prefill.acquisitionDate) : "";
const transYear = prefill?.transferDate    ? deriveYearFromEventDate(prefill.transferDate)    : "";
```

DOM 실측(실패 아티팩트) — 이미 채워져 있어 placeholder가 없다:

```yaml
- generic: 취득연도
  - combobox: { generic: "2010년" }   # ← "연도 선택" 아님
- generic: 양도연도
  - combobox: { generic: "2025년" }
```

**분기 커밋**: `a458a174` (2026-07-10, #560) *건물 기준시가 계산 모달 자산값 자동입력*.
스펙 #1 최종수정 `5c5ed7c0`(2026-07-09), #2 최종수정 `39889636`(2026-07-09) — **둘 다 #560 직전**. 정확히 여기서 썩었다.

⇒ 스펙이 하려던 "연도 선택"은 **이제 불필요한 동작**이다. 제품이 이겼다.

### 2-B. 취득 공시지가 placeholder 조건부 변경 → `nth()` 서수 붕괴 — 스펙 #3

`BuildingStdPriceForm.tsx:436-450` — **취득연도 ≤ 2000.12.31**(`acqIndexYear === 2001`)이면 위치지수용 공시지가가 2001.1.1 고정 필드로 바뀌며 placeholder도 바뀐다:

| 취득연도 | 취득 칸 placeholder | 양도 칸 | `getByPlaceholder("원/㎡")` 매칭 수 |
|---|---|---|---|
| ≤ 2000 | **`"2001.1.1. 현재 공시지가"`**(`:448`) | `"원/㎡"` | **1** |
| > 2000 | `"원/㎡"` | `"원/㎡"` | 2 |

스펙 #3은 취득연도 **2000**(`:31`)이라 하위 분기 → 매칭 1개.

```ts
// building-std-2023-mixed-transfer-report.spec.ts:68-69
await page.getByPlaceholder("원/㎡").nth(0).fill("2240000"); // 주석은 "취득당시" — 실제로는 양도 칸
await page.getByPlaceholder("원/㎡").nth(1).fill("2500000"); // 없음 → 타임아웃
```

DOM 실측 — `textbox "원/㎡"` **1개**, `textbox "2001.1.1. 현재 공시지가"` 1개.

**분기 커밋**: `f6e26a5c` (2026-07-11) *≤2000 취득 위치지수·공시지가 추천연도 정정*. 스펙 #3 최종수정 `27f7a035`(2026-06-13) — 그 이전.

> **이것이 이번 조사에서 가장 나쁜 발견이다.** `nth(0)`은 실패하지 않고 **양도 칸에 취득 값(2,240,000)을 채웠다**.
> `nth(1)`이 없어 타임아웃으로 드러났을 뿐, 필드가 하나 더 있었다면 **틀린 입력으로 조용히 통과**했을 것이다.
> `e2e/CLAUDE.md` §1·§4가 경고하는 서수 셀렉터 rot의 실례.

### 2-C. 왜 스펙 #1은 `원/㎡ nth(1)`을 쓰는데 멀쩡한가 (probe 실측)

취득연도 **2010** > 2000 → 상위 분기 → `원/㎡` 2개 → `nth(1)` 정상. 2-B와 모순 아님.

---

## 3. 수정안

### 3-1. 스펙 #1·#2 — 연도 선택 제거 + prefill 단언으로 전환 (**probe 통과 실측**)

`selectInModal(page, modal, "연도 선택", …)` 2줄을 삭제하고, **prefill 결과를 단언**한다. 죽은 조작을 지우는 데 그치지 않고 **#560 prefill의 회귀 가드로 승격**한다.

```ts
// 연도는 자산 취득일·양도일에서 파생돼 이미 채워져 있다(#560 prefill) — 선택 불필요.
await expect(modal.getByPlaceholder("건물 연면적")).toHaveValue("80");
await expect(modal.getByText("2010년", { exact: true })).toBeVisible(); // 취득일 2010-06-15 파생
await expect(modal.getByText("2025년", { exact: true })).toBeVisible(); // 양도일 2025-05-01 파생
```

- **검증 상태**: 스펙 #1에 대해 throwaway probe로 **실행 통과 확인(1 passed, 2.3s)**. 구조·용도 `selectInModal`과 `onApplyBoth` 이후 단언까지 전부 통과 → 스펙의 나머지는 건강하다.
- `exact: true` 필수 — 공시지가 연도의 `"YYYY년 (자동)"`과 구분(`building-stdprice-modal-prefill.spec.ts:64` 주석이 같은 함정을 이미 기록).
- **중복 아님**: `building-stdprice-modal-prefill.spec.ts:61-66`이 같은 패턴을 쓰나 그건 **일반건물** 호출부다. 스펙 #1은 **겸용 상가** 호출부(`MixedUseAssetMajorStdPrice.tsx:223-228` — `floorArea: asset.nonResidentialFloorArea`)라 소스가 다르다.

#### ⚠️ Do 정정 — 스펙 #2는 **연도 2줄 중 1줄만** 제거 (probe가 계획을 반증)

이 계획서 초안은 "#1과 동일하게 연도 2줄 삭제"를 전제했다. **틀렸다.** probe 실측:

| 항목 | 실측값 | 이유 |
|---|---|---|
| `"연도 선택"` 개수 | **1** | 이 스펙은 **취득일을 입력하지 않는다**(양도일만) → 취득연도는 prefill 대상 아님 |
| `"2025년"`(exact) | 1 | 양도일 2025-05-01에서 파생 → 양도연도만 prefill |
| `원/㎡` placeholder | 2 | 취득 2010 > 2000 → 상위 분기 |
| `건물 연면적` 값 | `""` | 일반건물 경로라 미prefill → `fill("100")` 유지 필요 |

⇒ **취득 연도 선택(`:26`)은 유지**, **양도 연도 선택(`:30`)만 제거** + 양도연도 prefill 단언 추가.
2줄 다 지웠다면 취득연도가 비어 계산이 안 됐다. `e2e/CLAUDE.md` §4 "추정 금지 — probe로 검증"이 실제로 오류를 잡은 사례.

### 3-2. 스펙 #3 — 서수 셀렉터 제거 (권장: 시점 섹션 스코프)

`nth(0)`/`nth(1)`은 placeholder 분기·필드 증감에 다시 썩는다. **두 안 중 (a) 권장.**

**(a) 시점 섹션 `data-testid` 스코프 — 권장**

⚠️ **실측**: `SectionCard`는 `BuildingStdPriceForm.tsx:95`의 **로컬 컴포넌트**이고 props가 `{num, title, tone, children}`로 **명시 나열**이다(`...props` 스프레드 없음) → `data-testid`를 그냥 넘기면 **침묵 strip**된다(`feedback_explicit_prop_mapping_strip`). prop 추가가 선행돼야 한다.

```tsx
// BuildingStdPriceForm.tsx:95-105 — testId prop 추가 (+2줄)
function SectionCard({ num, title, tone, children, testId }: {
  num: number; title: string; tone: "sky"|"amber"|"emerald"|"violet"|"rose";
  children: React.ReactNode; testId?: string;
}) {
  return <div data-testid={testId} className={…}>   // 루트 div에 부여
```
```tsx
// :406 · :508
<SectionCard num={2} title="취득 시점" tone="amber"   testId="bsp-section-acq">
<SectionCard num={3} title="양도 시점" tone="emerald" testId="bsp-section-transfer">
```
```ts
await page.getByTestId("bsp-section-acq").getByPlaceholder("2001.1.1. 현재 공시지가").fill("2240000");
await page.getByTestId("bsp-section-transfer").getByPlaceholder("원/㎡").fill("2500000");
```
- 장점: **서수 rot 클래스를 영구 제거**. 취득/양도 오적용을 구조적으로 차단(이번 침묵 오입력의 근본 원인).
- 비용: 제품 코드 **4줄**(prop 선언 2 + 호출부 2). 렌더 결과 무변경(`data-testid` 속성만 추가).

**(b) 고유 placeholder 직접 지정 — 대안**
```ts
await page.getByPlaceholder("2001.1.1. 현재 공시지가").fill("2240000");
await page.getByPlaceholder("원/㎡").fill("2500000");
```
- 장점: 제품 코드 무변경. 단점: 취득연도 >2000이면 `원/㎡`가 다시 2개 → 이 스펙(취득 2000)에서만 안전. **조건부 안전**이라 rot 재발 여지.

⇒ **(a) 채택, (b)는 SectionCard가 testid를 못 받고 수정 범위가 커질 때 fallback.**

---

## 4. 범위 밖 / 확인 필요

| 항목 | 판정 |
|---|---|
| 계산 로직·엔진 | **무변경** — 세 건 모두 셀렉터 문제 |
| PR #607(면적 단일 소스화)과의 관계 | **무관** — master에서 동일 재현. 파일 충돌 없음(#607은 이 3개 스펙 미수정) |
| `SectionCard`의 `data-testid` 통과 지원 | **미지원 확정**(실측 — `:95` 명시 props, 스프레드 없음) → `testId` prop 추가 필요(§3-2 a) |
| 스펙 #2의 prefill 렌더 상태 | **확인 필요** — Do probe (실패 로그는 placeholder 부재만 증명, "prefill됨" vs "Select 미렌더" 미구분) |
| 나머지 "연도 선택" 사용 스펙 6건 | 실행 결과 **통과** — 조치 불요 |
| `transfer-phd-building-stdprice-calculator.spec.ts` **4건 실패** | **범위 밖 — 또 다른 사전 존재 실패**(Do 회귀에서 신규 발견). `SectionCard` testid를 stash하고 master 상태로 실행해 **동일 4건 재현 확인**(6 passed / 4 failed). 대상은 `PhdBuildingStdPriceModalButton`(별도 컴포넌트)이라 본 수정과 코드 경로가 다르다. §6 후속 대상 |

---

## 5. 작업 순서

```
1. 브랜치 fix/building-stdprice-e2e-spec-rot (master 기준)
2. 스펙 #1 수정 (연도 2줄 삭제 + prefill 단언)   → verify: playwright 통과 (probe 완료 ✅)
3. 스펙 #2 probe로 prefill 확정 후 동일 수정     → verify: playwright 통과
4. SectionCard testId prop 추가 + 호출부 2곳     → verify: tsc 0 + 렌더 결과 무변경
5. 스펙 #3 (a)안 적용 (스코프 셀렉터)            → verify: playwright 통과 + **계산 결과값**이
                                                   기대치(양도 217,230,000 / 취득 154,960,000)와
                                                   일치 — 취득/양도 오입력이면 값이 어긋난다
6. 회귀: 건물기준시가 모달 의존 11개 스펙 전체 실행 → verify: 신규 실패 0
7. npm test + tsc                                → verify: 회귀 0
8. 커밋 + PR
```

**성공 기준**: 3개 스펙 통과 · 모달 의존 11개 스펙 신규 실패 0 · 제품 동작 무변경(`data-testid` 속성만 추가).

> **5단계의 값 검증이 핵심이다.** 스펙 #3의 제목이 곧 기대값(`양도당시 217,230,000 / 취득당시 154,960,000`)이라,
> 취득/양도를 바꿔 넣으면 **계산 결과가 달라져 즉시 드러난다**. §2-B의 침묵 오입력을 잡는 것도 이 단언이다.

---

## 6. 후속 제안 (본 계획 범위 밖)

이번 rot 3건은 **모두 "제품 개선 → 스펙 미동기"** 패턴이고, `nth()` 서수가 침묵 오입력까지 만들었다.
`e2e/CLAUDE.md`에 이미 규칙은 있으나 **강제력이 없다**. 별건으로 논의 가치:

- **`transfer-phd-building-stdprice-calculator.spec.ts` 4건**(T4·T5·T7·T9) — Do 회귀에서 발견한 사전 존재 실패. master 재현 확인. 본 PR 범위 밖이나 **다음 후보 1순위**
- 모달·폼의 시점(취득/양도) 블록에 testid를 **표준화**(이번 (a)안을 다른 모달로 확장)
- E2E 전체 주기적 실행(현재 pre-push는 tsc+vitest만 — E2E는 게이트 밖이라 rot이 침묵). **이번 조사에서만 rot 7건**(수정 3 + 잔존 4)이 나온 것이 방치 비용의 실측치다
