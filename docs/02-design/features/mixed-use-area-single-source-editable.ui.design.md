# 겸용주택 면적 단일 소스화 — UI 설계

- 계획서: [`mixed-use-area-single-source-editable.plan.md`](./mixed-use-area-single-source-editable.plan.md)
- 엔진설계: [`mixed-use-area-single-source-editable.engine.design.md`](./mixed-use-area-single-source-editable.engine.design.md)
- 작성일: 2026-07-15 (STEP 12 생성 → STEP 13 검토 정정 11건 반영)
- 대상: `components/calc/transfer/mixed-use/MixedUseAreaInputs.tsx` (① 면적·부수토지·지역 정보)

---

## 1. 입력 경로 케이스 매트릭스 (`feedback_ui_input_path_enumeration` — 전수)

| # | PHD | 용도변경 | 전용/공통 | 6칸 | 상가란 부수토지칸 | 비고 |
|---|---|---|---|---|---|---|
| U-1 | OFF | OFF | 입력 | 자동 안분 표시(정착·부수토지 4칸 배지 `자동`) | **제거**(U1) | 최빈 경로 |
| U-2 | OFF | OFF | 입력 | 부수토지 수동 편집(배지 `수동`) | 제거 | V2 발동 가능(둘 다 입력 시) |
| U-3 | OFF | OFF | **미입력** | 연면적 직접 입력 | 제거 | A2 — V3 게이트 skip |
| U-4 | OFF | OFF | 입력 → 연면적 수동 편집 | **전용/공통 자동 클리어**(§2-A2 "가") | 제거 | U-3으로 전이 |
| U-5 | **ON** | OFF | 입력 | **부수토지 override 배타 — 현행 유지** | 제거 | **U2 범위 밖 확정** — PHD가 §164⑦ 법정 입력 담당 |
| U-6 | OFF | **ON** | 입력 | 양도시 기준 편집 | 제거 | 취득시는 별도 안분(engine §1-4 P2) |
| U-7 | ON | ON | 입력 | 배타 + 별도 안분 (현행 유지) | 제거 | 최복잡 — 본 작업 무변경 |

> **U-5·U-7(PHD ON)은 범위 밖**(2026-07-15 사용자 결정) — 부수토지 override 배타를 **현행대로 유지**한다. 정착면적·연면적 편집은 PHD 무관하게 동작. §3 참조.

---

## 2. 위젯 명세

### 2-1. 레이아웃 (G8 정정 — 6열은 입력칸에 폭 부족)

현행 `grid grid-cols-3 sm:grid-cols-6`(`:130`)에 `DecimalInput` 6개는 데스크톱 1칸 폭이 부족(단위 + 소수 6자리). **쌍별 그룹 2열 × 3행**으로 재설계:

```
┌─ 면적 (건축물대장 기준) ────────────────────────────────────────┐
│  주택 전용면적(㎡)   상가 전용면적(㎡)   공통면적(㎡)            │  ← 보조 입력(현행 유지)
│  [   300      ]      [   259.2    ]     [   51.46   ]           │
├─ 계산 결과 (수정 가능) ─────────────────────────────────────────┤
│  주택 연면적 (㎡)                상가 연면적 (㎡)                │  ← 배지·리셋 없음(W1)
│  [    327.61    ] ㎡            [    283.05    ] ㎡             │
│                                                                  │
│  주택 정착면적 (㎡) [자동]       상가 정착면적 (㎡) [자동]       │
│  [     53.65    ] ㎡ ↻          [     46.35    ] ㎡ ↻           │
│                                                                  │
│  주택 부수토지 (㎡) [수동]       상가 부수토지 (㎡) [자동]       │
│  [     90.29    ] ㎡ ↻          [     78.01    ] ㎡ ↻           │
│                                                                  │
│  ⚠ 부수토지 합계 168.30㎡ ≠ 전체 토지 200.00㎡ (V2 — 차단)      │
└──────────────────────────────────────────────────────────────────┘
```

- 라벨: `text-caption`(11px) → **`text-sm`(14px)** — `components/calc/CLAUDE.md:313` **필드 라벨 정본**. ⚠️ 인접 전용/공통 라벨(`:75`)이 `text-xs`인 것은 **기존 이탈**이며 거기 "통일"하면 이탈이 확산된다(W4 정정)
- 컨테이너 `data-testid="mixed-derived-floor"`(`:131`) **유지**(회귀 최소화)
- 그리드: **`grid-cols-1 sm:grid-cols-2`**(W8 — 모바일 1열. 현행 `grid-cols-3`은 입력칸에 폭 부족)
- **`onFocus` 수동 추가 금지** — `SelectOnFocusProvider`가 `app/layout.tsx:69`에 전역 등록(W9)

### 2-2. 칸별 명세

**컴포넌트**: `DecimalInput`(면적㎡ 필수 — `CurrencyInput` 금지) + **`FieldCard` 6칸 전부 사용**(배지 슬롯 필요 — `FieldCard.tsx:14·33·73` 실측). ⚠️ 현행 6칸은 raw `<span>`, 인접 전용/공통은 raw `<label>` — **마크업이 달라진다**(W7)

| 칸 | 라벨 | placeholder | store 필드 | testid | write |
|---|---|---|---|---|---|
| 주택 연면적 | 주택 연면적 (㎡) | 주택 연면적 | `residentialFloorArea` | `mixed-area-residential-floor` | 직접 + **전용/공통 클리어** |
| 상가 연면적 | 상가 연면적 (㎡) | 상가 연면적 | `nonResidentialFloorArea` | `mixed-area-commercial-floor` | 동상 |
| 주택 정착면적 | 주택 정착면적 (㎡) | 주택 정착면적 | `mixedResidentialFootprintOverride` | `mixed-area-residential-footprint` | 직접 |
| 상가 정착면적 | 상가 정착면적 (㎡) | 상가 정착면적 | (역산) `mixedResidentialFootprintOverride` | `mixed-area-commercial-footprint` | **`residualArea(F, round2(입력))` 역산** |
| 주택 부수토지 | 주택 부수토지 (㎡) | 주택 부수토지 | `mixedResidentialLandAreaOverride` | `mixed-area-residential-land` | 직접 |
| 상가 부수토지 | 상가 부수토지 (㎡) | 상가 부수토지 | `mixedCommercialLandAreaOverride` | `mixed-area-commercial-land` | 직접(**역산 폐지** — §2-B) |

> **placeholder 숫자 예시 금지**(`components/calc/CLAUDE.md`) — 한국어 설명만.

### 2-3. 자동/수동 배지 + 리셋 (G4)

정본 패턴 **`LandPriceLookupField.tsx:138-155` 재사용**(W2 정정 — `:158-175`는 grid 레이아웃):

| 상태 | 배지 | 조건 |
|---|---|---|
| 자동 | `자동` — `rounded bg-green-100 px-1.5 py-0.5 **text-micro** font-medium text-green-700`(`:152` 실측) | store 필드 `""` (미설정) |
| 수동 | `수동` — `rounded bg-amber-100 px-1.5 py-0.5 **text-micro** font-medium text-amber-700`(`:140` 실측) | store 필드 `!== ""` |

> **`text-micro`(10px) 필수** — `components/calc/CLAUDE.md:316` "번호배지·pill = text-micro". `text-xs`로 만들면 규칙 위반(W3).

- 리셋 `↻ 자동` 버튼 → override를 `""`로 write(기존 `onCommercialLandChange:61-64` 빈값→클리어 패턴과 동형)
- **⚠️ 연면적 2칸은 배지·리셋 대상에서 제외 (W1 Critical)** — 연면적은 **실필드**라 되돌아갈 "자동 상태"가 없다. `↻ 자동`을 눌러도 복원할 파생 소스가 없고(§2-A2 "가"로 전용/공통이 이미 클리어됨), 배지 기준(전용/공통 유무)도 U-3(처음부터 직접 입력)과 U-4(수동 편집 후 클리어)를 **구분하지 못한다**. → **배지는 정착·부수토지 4칸만**. 연면적을 자동 파생으로 되돌리려면 **전용/공통을 다시 입력**하면 된다(안내 문구로 유도)

### 2-4. 값 표시 규칙

- 미설정 칸: `computeDerivedAreas` 결과를 **display fallback**(`value={store || String(derived.x)}`)
  - ✅ **`mirror-pattern` 위반 아님 (W6 판정)** — 스킬의 3중 패턴은 **"같은 의미의 두 필드 간 fallback"** 축(`mixedAcq || phdAcq`)이다. 본 건은 **필드 → 파생값**(`store || derived.x`) 축이라 무관하다. API가 `""`면 미전송하는 것은 **엔진이 같은 `computeDerivedAreas`로 동일 파생값을 재계산**하므로 **결과가 동일** — 비대칭이 아니라 **동일 값의 다른 표현**이다
- **`useEffect → store` 미러링 금지** — 모든 write는 `onChange` 내부 같은 patch

### 2-5. 오류·경고 표시 (G5)

| 검증 | 위치 | 톤 |
|---|---|---|
| **V2**(부수토지 합 ≠ 전체) | validate 반환 → **상단 에러 배너**(기존 경로) + 6칸 박스 직하 인라인 | **amber** |
| V3(연면적 합 ≠ 전용합+공통) | 6칸 박스 직하 인라인 | **amber** |

> **🚫 rose 사용 금지** — 이 카드에 이미 rose 소그룹(`:179-191` "부수토지 배율 지역")이 있어 rose가 **경고/섹션성격 2역 충돌**(`components/calc/CLAUDE.md` "2축 주의").
> **톤은 `components/calc/shared/tones.ts`의 `TONE` 상수 사용** — 인라인 하드코딩 금지(pre-push `check-tone-classes.sh` 하드블록).

### 2-6. 제거 대상 (U1)

| 항목 | 위치 |
|---|---|
| 상가부수토지 면적 FieldCard | `MixedUseAssetMajorStdPrice.tsx:238-252` (testid `mixed-commercial-land-override`) |
| `onCommercialLandChange` 역산 핸들러 | 동 `:60-67` |
| 안내문 "※ 주택·상가 부수토지 면적은 아래 상가 기준시가란에서 수정합니다" | `MixedUseAreaInputs.tsx:173-175` |
| **헤더 주석** "연면적 자동 파생(read-only)" · "부수토지 안분은 아래 상가 기준시가란에서 수정 (dual display 회피)" | `MixedUseAreaInputs.tsx:18-19` — **전부 거짓이 됨**(`feedback_engine_comment_vs_impl_drift`) |

---

## 3. ✅ U2 (PHD 배타) — **범위 밖 확정**

사용자 요구 §0-4는 "PHD 3-시점 패널 면적도 ①에서 조회"인데, 현행은 **PHD ON이면 ① 카드 override를 배타**한다:

- `MixedUseAreaInputs.tsx:31` `hasOverride = !asset.usePreHousingDisclosure && overrideStr.trim() !== ""`
- `types:51-52` — "PHD ON 경로는 `preHousingDisclosure.landArea`가 담당하므로 배타 — API 변환에서 `usePreHousingDisclosure=false`일 때만 주입"
- PHD 패널은 `phdResidentialLandArea`(직접입력, `calc-wizard-asset.ts:392`)를 별도로 씀

**배타를 풀면 §164⑦ 환산의 법정 입력을 ① 카드가 덮어쓰게 된다** → 법령 검토가 선행돼야 한다.

**⇒ U2는 범위 밖 확정(2026-07-15 사용자). 배타 유지(현행) — 본 작업의 부수토지 편집은 PHD OFF 경로 한정.**

---

## 4. 테스트 영향 (실측)

| 파일 | 영향 | 조치 |
|---|---|---|
| `e2e/mixed-use-exclusive-common-area.spec.ts:37-39` | `toContainText("72.00㎡")` — 표시 텍스트가 input value로 이동. **`㎡`는 `unit` prop의 별도 span**(`DecimalInput.tsx:79-83`)이라 `toContainText` 실패 | **`toHaveValue("72")`** — 근거: `DecimalInput`은 `thousandSeparator` 기본 false → **store 원문 표시**. store엔 `String(round2(72))` = `"72"`(`"72.00"` 아님) |
| 동 `:44-45` | `getByTestId("mixed-commercial-land-override")` + `toBeVisible` — **U1이 제거** | 신규 testid로 교체 |
| `__tests__/components/mixed-use-area-inputs-residual.anchor.test.tsx:42` | 연면적 합 불변식(이번 세션 신설) | onChange patch 검증이라 무영향 예상 — **확인 필요** |
| `__tests__/components/mixed-use-stdprice-point-order.anchor.test.tsx:135` | `override: "200"` → 상가 부수토지 0 경계 | 무영향 예상 |
| `__tests__/components/phd-modal-housing-floor-area-prefill.test.tsx:21` | 주택 연면적 prefill | 무영향 |
| E2E 면적 입력 5개 | **P1 `totalLand = 0` 게이트 필수** — 3개 spec이 전체 토지 미입력 | 게이트로 보호 |
| **사이드바** `calc-wizard-store.ts:469` | `computeDerivedAreas` 호출(plan §3-2-1 축 3) → 신규 2필드 전달 필요 | 합계 변동 확인(W10) |

---

## 5. 신규 anchor (UI)

| anchor | 케이스 |
|---|---|
| `UI-U3` | 전용/공통 미입력 + 연면적 직접 입력 → store에 write |
| `UI-U4` | 연면적 수동 편집 → **전용/공통 3필드가 같은 patch로 `""` 클리어** (§2-A2 "가") |
| `UI-BADGE` | 미설정 → `자동` / 설정 → `수동` / `↻` 클릭 → `""` write |
| `UI-F3` | 상가 정착면적 입력 46.35 → `mixedResidentialFootprintOverride = "53.65"` 역산 write |
| **`UI-F3-BOUND`** | **역산 손실 경계**(X2) — 입력 46.354 → `round2` 확정 후 역산 → 재표시 46.35. 입력값 ≠ 표시값 |
| `UI-V2` | 부수토지 두 칸 모두 입력 + 합 불일치 → amber 경고 인라인 + validate 차단 |
| `UI-NO-ROSE` | 경고 톤이 rose가 아님(배율 지역 소그룹과 충돌 회피) |
