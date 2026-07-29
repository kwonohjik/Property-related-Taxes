# 양도소득세 — 기본정보 면적 축 확대 (UI 설계)

> 작성일: 2026-07-30
> 계획서: [`docs/01-plan/features/transfer-asset-area-basic-info.plan.md`](../../01-plan/features/transfer-asset-area-basic-info.plan.md)
> 엔진 설계: [`transfer-asset-area-basic-info.engine.design.md`](transfer-asset-area-basic-info.engine.design.md)
> 상위 정본: [`docs/02-design/area-taxonomy.md`](../area-taxonomy.md)

---

## 1. 현행 UI 실측

### 1.1 면적 섹션의 위치와 게이트

`components/calc/transfer/asset-sections/AssetSectionBasic.tsx` (454줄) 안, 기본정보 ① 섹션(`CompanionAssetCard.tsx:272~294`, tone `sky`) 내부:

```
:298   {/* 면적 정보 — 토지 자산만 표시 */}
:299   {asset.assetKind === "land" && (
:310       면적 입력 방식  [Select — same / partial / reduction / increase]
:368       same     → 「취득·양도 당시 면적 (㎡)」 단일 DecimalInput  (:380~385)
:391       partial  → 「취득 당시 면적」 + 「양도 당시 면적」 2칸        (:404~424)
:430       reduction→ <ReplotReductionFields>
```

- Select `data-testid="area-scenario-select"` (`:355`) — 기존 E2E 셀렉터로 이미 사용 중일 가능성 → **변경 금지**.
- ⓘ 툴팁이 taxonomy §5.2 문구로 이미 구현됨(`:371~378`, `:392~399`, `:409~416`).
- 같은 파일에 `assetKind === "land"` 게이트가 **2곳** 있다: `:298`(면적) · `:445`(토지 성격 `CompanionLandNatureBlock`). **:445는 건드리지 않는다** — 토지 성격은 실제로 토지 전용 개념.

### 1.2 중복 면적 입력 위치 7곳 (계획서 §1.3 재수록)

| # | 위치 | 노출 조건 | 처리 방향(안) |
|---|---|---|---|
| D-1 | `CompanionAcqPurchaseBlock.tsx:594~601` 취득시 기준시가 위젯 | `acqStdPriceRequired && !showAcqStdReadonly` | 양방향 read/write 유지 |
| D-2 | `CompanionAcqPurchaseBlock.tsx:639~646` 양도시 기준시가 위젯 | `useEstimatedAcquisition` | 양방향 read/write 유지 |
| D-3 | `PreHousingDisclosureSection.tsx:112~113` | PHD 토글 ON | **읽기 전용 전환 검토** |
| D-4 | `CompanionAcquisitionCauseSection.tsx:146~151` | 환지 라벨 분기 | 유지 (환지 전용 라벨) |
| D-5 | `LandBuildingSplitSection.tsx:139~140` | 분리 모드 | 유지 — 이미 `SplitAcqStdReadonlyPanel` 선례 존재 |
| D-6 | `GeneralBuildingAcquisitionCards.tsx:127~128` | `general_building` | 검토 |
| D-7 | `nbl/OtherLandDetailSection.tsx:599` | 읽기 전용 | 변경 없음 |

**설계 원칙**: 일괄 전환 금지. D-1·D-2는 `StandardPriceInput`이 단가×면적=총액을 **그 자리에서 계산해 보여주는** 위젯이므로 면적을 그 화면에서 못 고치면 UX가 퇴행한다 → 같은 폼 필드 양방향 read/write 패턴(components/calc/CLAUDE.md "같은 의미 폼 필드의 양방향 read/write 통합")을 적용해 **양쪽 다 입력 가능·자동 동기화**로 둔다.

D-5에는 이미 선례가 있다 — `SplitAcqStdReadonlyPanel.tsx:9` 주석이 "같은 폼 필드(`standardPricePerSqmAtAcq`·`acquisitionArea`)를 한 화면에서 두 번 입력받는" 문제를 읽기 전용 파생으로 해결한 것을 기록한다. **이 패턴을 D-3·D-6 판단의 기준으로 삼는다.**

---

## 2. 변경 설계

### 2.1 게이트 확대 — Phase 2는 `housing`만 (rev.2 확정)

실측 결과 각 자산유형은 **전용 면적 필드를 이미 갖고 전용 섹션에서 입력받는다**(엔진 설계 §4.1). 따라서 `AssetSectionBasic.tsx:298` 게이트에 추가할 대상은 **`acquisitionArea`를 소비하면서 전용 입력 섹션이 없는 자산유형**뿐 — 즉 `housing`이다.

| assetKind | 면적 섹션 대상 | 허용 시나리오 | 근거 |
|---|---|---|---|
| `land` | ✅ 현행 유지 | same · partial · reduction · increase | 현행 그대로 |
| `housing`(일반) | ✅ **Phase 2 추가** | same · partial | `acquisitionArea` 소비(PHD·환산)하나 입력이 PHD 섹션에 종속 |
| `housing`+겸용 | ❌ 제외 | — | `mixedUseTotalLandArea` + 겸용 전용 섹션(`MixedUseAreaInputs.tsx:213`)이 이미 담당 |
| `commercial_building` | ❌ 제외(Phase 3 승격 검토) | — | `cbLandArea`·`cbExclusiveArea`·`cbSharedArea` 3축 전용 섹션 |
| `general_building` | ❌ 제외(Phase 3 승격 검토) | — | `gbLandArea`·`gbBuildingArea`·`gbBuildingFootprintArea` 3축 |
| `redevelopment_apt`·`right_to_move_in` | ❌ 제외(Phase 3 승격 검토) | — | `redevLandArea` 전용 섹션 |
| `presale_right`·`building` | ❌ 제외 | — | 면적 소비 미확인 — 확대 대상 아님 |

**환지 시나리오는 land 전용 유지**: 소득령 §162의2는 토지 제도. `housing` 추가 시 `reduction`·`increase` 옵션이 노출되지 않도록 상수로 분리한다.

```ts
// components/calc/transfer/asset-sections/ 내 상수 — 엔진 아님(UI 표시 규칙)
const AREA_SCENARIOS_BY_ASSET_KIND: Partial<Record<AssetForm["assetKind"], AssetForm["areaScenario"][]>> = {
  land:    ["same", "partial", "reduction", "increase"],
  housing: ["same", "partial"],
};
// 키 부재 = 면적 섹션 미렌더 (전용 섹션이 담당)
```

- `Partial<Record<...>>`로 두어 **키 부재 = 미렌더**를 명시한다. 8종 전부 열거하면 "빈 배열"과 "미지원"이 구분되지 않는다.
- 자산유형 변경 시 허용 외 `areaScenario`가 stale로 남는 것 방지 — `assetKind` 변경 `onChange`(`AssetSectionBasic.tsx:139`)에서 **단일 배치 update**로 함께 리셋. `useEffect → store` 미러링 금지, 다중 키는 한 번의 `update` 호출(memory `feedback_multikey_patch_stale_spread_overwrite`).
- **Phase 3(전용 필드 기본정보 승격)은 별도 PR로 분리 가능** — Phase 2만으로 사용자 요청의 핵심(비사업용토지·기준시가에 면적 활용)이 충족된다.

### 2.2 라벨 표준화 (taxonomy 원칙 C)

현행 land 섹션 라벨은 이미 표준을 따른다("취득·양도 당시 면적 (㎡)" · "취득 당시 면적 (㎡)" · "양도 당시 면적 (㎡)"). 게이트 해제 시 자산유형별로 대상물이 달라지므로 **접두 대상어만 자산유형에서 파생**한다:

| assetKind | `same` 라벨 |
|---|---|
| `land` | 취득·양도 당시 면적 (㎡) — 현행 유지 |
| `housing` | 취득·양도 당시 **토지** 면적 (㎡) — 주택은 부수토지 면적이 PHD·환산의 곱셈 인자 |

Phase 4(라벨 표준화)에서 전용 섹션의 비준수 라벨도 교체 대상이다. 실측된 비준수 예: `RedevelopmentValuationSection.tsx:239,402` "토지면적 (㎡)" — 시점 표기가 없다(같은 파일 hint가 "시점별 동일 가정"임을 자백한다). Phase 4는 Phase 2·3과 독립 PR로 분리한다.

- 라벨 크기는 현행 유지: 필드 라벨 `text-sm`(`:307`) / 시나리오 내부 소라벨 `text-xs text-muted-foreground`(`:371` 등). 임의 px 금지 — pre-push `scripts/check-font-sizes.sh` 하드블록.
- **주의**: 현행 시나리오 내부 라벨이 `<label className="text-xs text-muted-foreground">` native이고 `FieldCard`를 쓰지 않는다. 신규 칸도 **기존 스타일에 맞춘다**(Surgical — 인접 코드를 "개선"하지 않음). `FieldCard`로의 일괄 전환은 별건.

### 2.3 겸용주택 — UI 변경 없음 (rev.2 확정)

U-1 해소 결과 겸용주택의 전체 면적은 **이미 `mixedUseTotalLandArea`가 담당**하며 전용 입력 위젯(`MixedUseAreaInputs.tsx:213`)·전용 검증(`validate-mixed-area.ts:24`)·API 전달(`transfer-tax-api-mixed-use.ts:54` → `totalLandArea`)이 모두 배선돼 있다.

→ **"겸용주택 등에서는 전체 면적 기준"은 이미 충족 상태.** 신규 칸·신규 필드·양방향 통합 모두 불필요하다. rev.1의 "전체 면적 1칸 신설" 안은 폐기한다(필드 중복 유발).

파트별 면적(`residentialExclusiveArea` 등 6종)은 용도별 안분의 정본이므로 그대로 유지한다.

### 2.4 톤·섹션 규약

- 기본정보 섹션은 tone `sky`로 고정(`CompanionAssetCard.tsx:275`) — 면적은 components/calc/CLAUDE.md 색상 가이드에서도 "면적·규모 = sky"이므로 정합.
- 면적 블록이 3개 이상 서브섹션으로 커지면 `<ToneCard tone="sky" sectionNum>` 적용. 현행은 단일 블록이므로 **지금은 불필요** — 과설계 금지.
- 인라인 톤 하드코딩 금지, `tones.ts` 단일 소스.

---

## 3. 케이스 매트릭스 (단순 → 복잡)

| # | assetKind | 시나리오 | 취득가액 방식 | 기대 UI | 기대 엔진 도달 | 성격 |
|---|---|---|---|---|---|---|
| C-01 | land | same | 실지거래가 | 기본정보 면적 1칸 | NBL `landArea` = 입력값 (A-1) | 현행 |
| C-02 | land | same | 기준시가 | 기본정보 1칸 + D-1 위젯(동기화) | 토지 기준시가 = 단가×면적 | 현행 |
| C-03 | land | partial | 환산 | 취득·양도 2칸 + D-1·D-2 | 분자/분모 면적 각각 | 현행 |
| C-04 | land | reduction | 환산 | 환지 3칸 + 의제취득면적 배지 | 종전×(교부/권리) | 현행 |
| C-05 | housing | same | 실지거래가 | **Phase 2 신규 노출** 1칸 | 면적 미소비 경로 — 저장만 | **신규** |
| C-06 | housing | same | 환산 + PHD ON | 기본정보 1칸 ↔ D-3 동기화 | `validate-asset.ts:458` 통과 (A-2) | **신규** |
| C-07 | housing | partial | 환산 | 2칸 | PHD 면적비 반영 | **신규** |
| C-08 | housing | **reduction 선택 시도** | — | 옵션 **미노출** (환지=토지 전용) | — | **신규 제약** |
| C-09 | housing + 겸용 | — | 기준시가 | 기본정보 면적 섹션 **미렌더** | `mixedUseTotalLandArea` 경로 무변경 (A-3) | 현행 유지 |
| C-10 | commercial_building | — | 기준시가 | 기본정보 미렌더, 상가 전용 3축 유지 | §164⑥ 3축 | 현행 유지 |
| C-11 | general_building | — | 환산 | 기본정보 미렌더, GB 전용 3축 유지 | — | 현행 유지 |
| C-12 | redevelopment_apt | — | — | 기본정보 미렌더, `redevLandArea` 유지 | — | 현행 유지 |
| C-13 | land | same | 분리 모드 | 기본정보 1칸 + D-5 읽기전용 패널 | 파트별 독립 | 현행 |
| C-14 | land | partial | 실지거래가, 취득<양도 | 입력 허용 | **현행 통과** (A-6) → Phase 5에서 차단 | 갭 |

- **Phase 2의 신규 동작은 C-05·C-06·C-07·C-08 4건**으로 국한된다(rev.1은 C-08·C-09 상가·GB까지 신규로 잡았으나 그것들은 전용 섹션 유지 → 현행 무변경).
- C-09~C-12는 "**변하지 않아야 한다**"를 검증하는 회귀 케이스다. 게이트 확대가 전용 섹션 자산까지 새 칸을 띄우면 중복 입력이 된다.

---

## 4. 8개 클라이언트 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-asset.ts:91,93,102` | **무변경** |
| ② initial | `calc-wizard-asset-factory.ts:86~88` | **무변경** — `"same"`/`""`/`""` 확인 완료 (U-7) |
| ③ normalize | `calc-wizard-asset-migrate.ts:25~30` | **무변경** |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` | **무변경** — 겸용 파생 폐기(§2.3) |
| ⑤ UI 위젯 | `AssetSectionBasic.tsx:298~441` | **주 변경** — §2.1·§2.2 |
| ⑥ 사이드바 | `computeTransferSummary` | **무변경** — 면적은 금액 합계 아님 |
| ⑦ 결과 카드 | `TransferTaxResultView` 외 | Phase 4 라벨 표준화 범위 (Phase 2 무변경) |
| ⑧ validation | `transfer-tax-validate-asset.ts` | **Phase 5 변경** — 엔진 설계 §5.2·§5.4·§5.5 |

**Phase 2 실질 변경은 ⑤ 단독**이다. ①②③④⑥⑦⑨~⑭ 무변경, ⑧은 Phase 5로 분리. 무변경 주장은 Phase 2 종료 시 grep 자가 점검으로 확증한다.

---

## 5. 테스트 설계

### 5.1 RTL (신규)

| ID | 검증 | 상태 |
|---|---|---|
| R-1 | assetKind별 면적 섹션 렌더 여부 = §2.1 표와 일치 | ⚙️ **baseline 작성 완료** — `__tests__/components/asset-section-basic-area-gate.anchor.test.tsx` (housing 3건이 Phase 2에서 뒤집힘) |
| R-2 | housing 시나리오 Select에 `reduction`·`increase` 옵션 **부재** | Phase 1 신규 |
| R-3 | `same`에서 단일 입력 → `acquisitionArea`·`transferArea` 동시 갱신(단일 배치) | Phase 2 신규 |
| R-4 | assetKind 변경 시 허용 외 `areaScenario` 리셋 | Phase 1 신규 |
| R-5 | 라벨 문자열이 자산유형별 표준 라벨과 일치 | Phase 4 신규 |
| R-6 | 겸용·상가·GB·재개발에서 기본정보 면적 섹션 **미렌더**(중복 방지) | Phase 2 신규 — C-09~C-12 |

`afterEach(cleanup)` 수동 등록 필수 (memory `feedback_rtl_manual_cleanup_required`) — 기존 anchor 파일에 적용됨.

### 5.2 E2E

| ID | 검증 | 상태 |
|---|---|---|
| E-1 | housing: 기본정보 면적 칸 노출 + 라벨 + 환지 옵션 부재 + 중복 0 | ✅ `e2e/transfer-housing-area-basic-info.spec.ts` |
| E-2 | 겸용 토글 ON → 기본정보 면적 섹션 미노출 | ✅ 동상 (2번째 케이스) |
| E-3 | 기존 land 환지 플로우 무회귀 (`area-scenario-select` 보존) | ✅ `e2e/transfer-replot-increase-estimated.spec.ts` 통과 |
| E-4 | 겸용 전용/공통면적 안분 무회귀 | ✅ `e2e/mixed-use-exclusive-common-area.spec.ts` 통과 |
| E-5 | housing + PHD 환산 계산 완주 (C-06 end-to-end) | ⏳ Phase 5 |

**E2E 조작 규약**: 겸용 토글은 `getByRole("switch", { name: "겸용주택 분리계산" })` — `getByText` 클릭은 ToggleCard에서 동작하지 않는다(실측 실패 후 정정, memory `feedback_e2e_togglecard_setchecked`).

- E2E는 worktree 포트 규약 사용: `E2E_PORT=3101 npx playwright test <spec>`.
- `ToggleCard`는 `setChecked` 사용 (memory `feedback_e2e_togglecard_setchecked`).

### 5.3 회귀 범위

`lib/stores/**`·`lib/calc/**` 변경이 걸리면 pre-push가 **전체**로 자동 판정한다(CLAUDE.md 테스트 범위 정책). 작업 중 반복 검증은 `npm run test:transfer`(~59초) + 해당 RTL 파일로 좁히고, push 전 전체 1회.

---

## 6. 미해소 항목 — 전건 해소 (Do 착수 가능)

| # | 항목 | 결과 |
|---|---|---|
| U-1 | `mixedUseTotalLandArea` ↔ `acquisitionArea` | ✅ 별개 축, 겸용은 이미 충족 → §2.3 "UI 변경 없음" |
| U-4 | 상가·일반건물 면적 사용 | ✅ 전용 3축 사용 → §2.1에서 **제외 대상**으로 확정 |
| U-5 | 재개발 면적 개념 | ✅ `redevLandArea` 존재 → 제외 대상 |
| U-6 | `StandardPriceInput` area 미제어 | ✅ `isAreaMode`가 `land`·`building_non_residential` 한정 → 현행 위험 없음. **신규 호출 시 R6 가드** |
| U-7 | `areaScenario` 기본값 | ✅ `"same"` (`calc-wizard-asset-factory.ts:88`) |
| U-8 | `area-scenario-select` testid | ✅ `e2e/transfer-replot-increase-estimated.spec.ts:30` 사용 중 → **변경 금지** |

잔존: U-3(`transferArea` 일괄양도 안분 소비 지점) — Phase 3 착수 시 확인. Phase 2를 차단하지 않는다.

---

## 7. rev.2 설계 환류 요약

| rev.1 서술 | rev.2 정정 | 영향 |
|---|---|---|
| 게이트를 **전 자산유형**으로 확대 | **`housing`만** 확대 — 나머지는 전용 섹션이 담당 | §2.1 표 전면 교체 |
| 겸용에 전체 면적 1칸 신설 | **UI 변경 없음** — `mixedUseTotalLandArea`가 이미 담당 | §2.3 폐기·재작성 |
| 상가·GB를 신규 노출 대상(C-08·C-09) | **현행 유지 회귀 케이스**로 전환(C-10·C-11) | §3 매트릭스 12→14건 |
| ④ API 변환 "부분 변경 가능" | **무변경** 확정 | §4 |
| ⑧ validation을 Phase 2에 포함 | **Phase 5로 분리** — Phase 2는 ⑤ 단독 | §4 |
| (없음) | 자산-수준 `partial` 불변식 미구현(C-14) | Phase 5 추가 항목 |

---

## 8. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-07-30 | v1.0 | 최초 작성 — 게이트 해제 중심. U-1·U-4~U-8 미검증 명시 |
| 2026-07-30 | v1.1 (rev.2) | anchor 18건 green 반영. §2.1 게이트 대상을 전 자산유형 → **`housing` 단독**으로 축소(전용 섹션 실측), §2.3 겸용 UI 변경 폐기, §3 매트릭스 14건 재작성(회귀 케이스 C-09~C-12 신설), §4 Phase 2 = ⑤ 단독 확정, §5 R-1 baseline 작성·R-6 추가, §6 전건 해소, §7 환류 요약 신설 |
