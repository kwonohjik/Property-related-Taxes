# NBL 무조건 사업용 의제 시 지목 검증 차단 모순 — 수정 계획서 (v2)

> 작성 2026-07-01 · 브랜치 `fix/nbl-determination` (worktree `.claude/worktrees/nbl-fix`)
> 관련 선행: PR #454(무조건 사업용 의제 UI↔엔진 불일치, `docs/00-pm/nbl-unconditional-exemption-ui-mismatch.plan.md`)
> 정책: `feedback_validation_sync_8th_point`(UI/API 통과 ↔ validate 차단 모순 금지) · `feedback_ui_engine_dual_truth_avoidance`(단일 진실) · `feedback_api_zod_schema_sync`(⑫⑬⑭ 침묵 strip) · `single-source-engine-helper`
>
> **v2 개정**: 자가검토로 계층 C(클라이언트 raw 빌더 + Zod 필수 enum) 누락 발견 → 4계층 수정으로 확대. 면적 스킵 철회. importer 수·필드명 정정.

---

## 1. 문제 (증상)

비사업용 토지 정밀판정에서 **"공익사업으로 수용"(§168의14③3호)** 토글을 켜고 요건 충족 사업인정고시일(예: 2004-04-23, 2006.12.31 이전)을 입력하면:

- 입력 폼: **"요건 충족 · 이 사유로 사업용 토지로 확정됩니다"** 배너 + 하단 **지목 입력란 비활성화**(`opacity-50 pointer-events-none`) — 여기까지 정상(엔진 판정과 일치).
- "다음/계산" 시도 시 **"자산: 비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요."** 검증 오류 발생.
- **모순**: 지목 입력란은 비활성인데 검증은 지목을 필수 요구 → 사용자가 오류를 해소할 방법이 없음.

### 재현 조건 (실측 필드명)

- `assetKind === "land"` + `nblUseDetailedJudgment === true`
- 지목 무관 의제 성립: `nblExemptPublicExpropriation === true` + `nblExemptPublicNoticeDate ≤ 2006-12-31`(또는 취득일 ≤ 고시일−5년) → `isExempt === true`
- `nblLandType`(지목) 미선택

→ 지목 무관 의제(`publicExpropriation`·`factoryAdjacent`)만 노출. 농지·임야·목장을 요구하는 의제는 지목이 있어야 `isExempt`가 되어 이 경로에 도달하지 않음.

---

## 2. 근본 원인 — NBL 데이터 파이프라인 4개 게이트 (전수 실측)

지목 미선택 + 의제 성립 시, 데이터가 엔진에 도달하기까지 **4곳**에서 차단/누락된다.

```
[폼] AssetForm (nblLandType="", nblExemptPublicExpropriation=true, ...)
  │
  ├─ ❶ 계층 A  클라이언트 검증  validateAssetAcquisition
  │      transfer-tax-validate-asset.ts:458  → "지목을 선택하세요" 차단 🔴
  │
  ├─ ❷ 계층 C-1 클라이언트 raw 빌더  buildNonBusinessLandRaw
  │      non-business-land-request.ts  → !nblLandType || !nblZoneType 이면 undefined 반환
  │      → transfer-tax-api.ts:484 에서 nonBusinessLandRaw 미포함(서버 전송 안 됨) 🔴
  │
  ├─ ❸ 계층 C-2 Zod 스키마  nonBusinessLandRawSchema
  │      transfer-tax-schema-sub.ts:87  nblLandType: z.enum(NBL_UI_LAND_TYPE_VALUES) — "" 불허 🔴
  │      (빌더가 ""를 보내면 서버에서 거부)
  │
  ├─ ❹ 계층 B  서버 매퍼  mapAssetToNblInput
  │      form-mapper.ts:62  → !nblLandType 이면 null 반환(엔진 미호출) 🔴
  │      (buildNblEngineInput(non-business-land-request.ts)은 별도 가드 없이 이 매퍼로 위임)
  │
  └─ ✅ 엔진  judgeNonBusinessLand  (transfer-tax.ts:219)
         engine.ts:56  Step 2 의제 먼저 검사 → 성립 시 지목별 judge 이전 즉시 사업용 반환
         unconditional-exemption.ts:88  공익수용은 categoryGroup(지목) 미참조 → 지목 "" 이어도 정상
```

**원래(v1) 계획은 ❶·❹만 다뤄 불완전.** ❷(빌더)에서 이미 서버 전송이 막히거나 ❸(Zod)에서 거부되어, ❶·❹만 고쳐도 의제가 엔진에 도달하지 못한다. 이는 `feedback_api_zod_schema_sync`가 경고하는 "⑫⑬ TypeScript 미감지 침묵 strip" 전형.

### UI ↔ 검증 dual truth (모순의 본질)

- UI(`NblSectionContainer.tsx:106-108`)는 의제 성립 시 `nbl-per-category` div **전체**(지목·용도지역·재촌·지목별세부·유예기간·양도일의제)를 비활성화. 판정 기준은 어댑터 `evaluateUnconditionalExemption(asset, transferDate)`.
- 검증·빌더·Zod·매퍼는 **raw 필드(`nblLandType`)** 기준 → UI와 다른 진실.
- 면적(`acquisitionArea`)은 `nbl-per-category` div **밖**(자산 카드, S186 자동입력) → 비활성 대상 아님.

### 엔진은 이미 안전 (실측)

- `engine.ts:55-82` — Step 2 의제 성립 시 지목별 judge(Step 4) 이전 즉시 사업용 반환.
- `unconditional-exemption.ts:88-108` — 공익수용은 `categoryGroup` 미참조(고시일만). `factoryAdjacent`(line 123) 동일.
- `form-mapper.ts` 하위 `buildForestDetail`/`buildPasture`/`buildVilla`/`buildOtherLand`/`buildRevenueTest`는 모두 `landType` 불일치 시 `undefined` 반환 → 빈 landType 안전.
- `buildUnconditionalExemption`(form-mapper-helpers.ts)은 8토글 중 하나도 없으면 `undefined` 반환 → 가드 신뢰 가능.

→ **게이트(❶❷❸❹)만 의제 인식하도록 열면 됨. 엔진 로직 변경 없음.**

---

## 3. 케이스 매트릭스 (지목 × 의제 × 요건충족)

| # | 지목 | 의제 토글 | isExempt | 현재 | 기대 |
|---|------|-----------|:---:|------|------|
| 1 | 선택 | 없음 | — | 지목별 판정 정상 | 변화 없음 ✅ |
| 2 | 선택 | 지목무관(공익수용) 충족 | ✅ | 정상 | 변화 없음 ✅ |
| 3 | **미선택** | **공익수용 충족** | ✅ | **🔴 4계층 차단(모순)** | 통과 + 결과에 의제 근거 표시 |
| 4 | 미선택 | 공익수용 ON·미충족(고시일 2017) | ❌ | 지목 차단 | **변화 없음** — 지목 요구 유지 ✅ |
| 5 | 선택 | 농지요구 의제 충족 | ✅ | 정상 | 변화 없음 ✅ |
| 6 | 미선택 | 농지요구 의제 ON | ❌ | 지목 차단 | **변화 없음** — 지목 요구 유지 ✅ |

**불변식**: 4계층 모두 `isExempt === true`일 때만 지목/용도지역 요구를 건너뜀. 케이스 4·6(미충족)은 지목 요구 유지 → 빈 지목이 엔진에 도달하는 경로는 오직 isExempt 케이스뿐 → Step 2 항상 short-circuit → 비사업용 오판정 불가.

---

## 4. 수정 설계 — 5개 변경 (4계층 + 어댑터 재배치)

> 모든 게이트가 **동일한 `isExempt` 판정**(어댑터)을 쓰도록 통일 = dual truth 제거. 어댑터를 `lib/calc/`에 두어 4곳이 정방향 import.

### 4.0 왜 4계층 전부인가 — ❶-only 불충분 근거 (실증)

"검증(❶)만 풀면 계산은 통과하니 충분하지 않나?"에 대한 반증:

- **세액 정확성 리스크**: ❶만 고치면 빌더(❷)가 NBL을 미전송 → `transfer-tax.ts:218` `nonBusinessLandDetails` undefined → `nonBusinessLandJudgment` 미생성 → `isNonBusinessLand`가 **입력 플래그 그대로**(transfer-tax.ts:220 override 미발동). 플래그 기본값은 `false`(asset-factory:173)라 대개 사업용(정확)이지만, **사용자가 간편모드에서 "비사업용" 플래그를 켠 뒤 상세모드+의제로 전환하면 플래그가 잔존 → 의제 토지가 비사업용 +10% 중과되는 오과세**. 전체 수정은 엔진이 사업용을 실제 판정해 플래그를 **override**하므로 잔존 플래그와 무관하게 정확.
- **결과 완결성**: `TransferTaxResultView.tsx:369`는 `result.nonBusinessLandJudgmentDetail` 존재 시에만 `NonBusinessLandResultCard`(Step 2 무조건 의제 근거 포함) 렌더. ❶-only면 detail 부재 → **입력폼은 "요건 충족·사업용 확정"인데 결과엔 NBL 판정이 전혀 표시 안 됨**(사용자 혼란).

→ ❷❸❹는 과잉설계가 아니라 **세액 정확성 + 결과 완결성**에 필요.

### 변경 ⓪ — 어댑터 재배치 (2026-07-01 사용자 확정: 이동)

`components/calc/transfer/nbl/unconditional-exemption-status.ts` → **`lib/calc/nbl-unconditional-exemption-status.ts`** 이동.

- 근거: 순수·client-safe(오직 `@/lib/*` 의존). 유닛 테스트가 이미 `__tests__/lib/calc/`에 있음.
- **import 갱신 3곳**(실측 `git grep -l unconditional-exemption-status`):
  1. `components/calc/transfer/nbl/NblSectionContainer.tsx:6`
  2. `components/calc/transfer/nbl/UnconditionalExemptionSection.tsx:11` ← v1 누락분
  3. `__tests__/lib/calc/nbl-unconditional-exemption-status.test.ts:12`
- 이후 신규 소비자 2곳(❶ 검증·❷ 빌더, 모두 lib/calc)도 정방향 import. 순환 없음(어댑터 → lib/tax-engine 단방향).

### 변경 ❶ — 클라이언트 검증 (계층 A)

`lib/calc/transfer-tax-validate-asset.ts` `validateAssetAcquisition`(line 457~, `formTransferDate` 이미 수신)

```ts
if (asset.assetKind === "land" && asset.nblUseDetailedJudgment) {
  const isExempt = evaluateUnconditionalExemption(asset, formTransferDate ?? "").isExempt;
  if (!isExempt && !asset.nblLandType)  return `${label}: … 지목을 선택하세요.`;     // 458
  if (!isExempt && !asset.nblZoneType)  return `${label}: … 용도지역을 선택하세요.`;  // 460
  if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)             // 462 — 유지
    return `${label}: … 토지 면적(㎡)을 입력하세요.`;
  if (!isExempt) {
    // 양도일 의제(465) · other_land(468~490) · 유예기간(492~505) — 모두 nbl-per-category div 內(비활성) → 스킵
  }
}
```

- **스킵 대상**(UI 비활성 = 엔진 무시): 지목(458)·용도지역(460)·양도일의제(465)·other_land(468)·유예기간(492).
- **유지 대상**: 면적(462) — UI 비활성 대상 아님(모순 없음) + 토지 평가에 필요할 수 있음 + S186 자동입력. **v1의 "면적 스킵" 철회.**

### 변경 ❷ — 클라이언트 raw 빌더 (계층 C-1)

`lib/calc/non-business-land-request.ts` `buildNonBusinessLandRaw(asset, transferDate)`

```ts
// 변경 전: !nblLandType || !nblZoneType 이면 무조건 undefined
// 변경 후: 의제 성립 시 지목/용도지역 미선택 허용
const isExempt = evaluateUnconditionalExemption(asset, transferDate).isExempt;
if (
  asset.assetKind !== "land" ||
  !asset.nblUseDetailedJudgment ||
  !asset.acquisitionArea ||
  !asset.acquisitionDate ||
  (!isExempt && (!asset.nblLandType || !asset.nblZoneType))
) {
  return undefined;
}
// 이하 동일 — Object.fromEntries(startsWith("nbl"))로 nblExempt* 포함해 전송
```

- 빈 지목/용도지역 시 raw에 `nblLandType: ""`·`nblZoneType: ""`가 실려 전송됨 → Zod(❸)에서 허용 필요.

### 변경 ❸ — Zod 스키마 (계층 C-2, ⑫)

`lib/api/transfer-tax-schema-sub.ts:87` `nonBusinessLandRawSchema`

```ts
// 변경 전: nblLandType: z.enum(NBL_UI_LAND_TYPE_VALUES)
// 변경 후: 의제 시 "" 허용
nblLandType: z.enum(NBL_UI_LAND_TYPE_VALUES).or(z.literal("")),
// nblZoneType: z.string() — 이미 "" 허용, 변경 불요
```

- line 79·85 주석("빌더가 nblLandType truthy시만 전송")도 개정(의제 예외 명시).

### 변경 ❹ — 서버 매퍼 (계층 B)

`lib/tax-engine/non-business-land/form-mapper.ts:62` `mapAssetToNblInput`

```ts
// 변경 전
if (!asset.nblUseDetailedJudgment || !asset.nblLandType) return null;
// 변경 후
if (!asset.nblUseDetailedJudgment) return null;
if (!asset.nblLandType && !buildUnconditionalExemption(asset, context.parseDate)) return null;
```

- `landType = asString("") as LandType` → `classifyLandCategory` → `categoryGroup "unknown"` → 엔진 Step 2 의제 short-circuit → 사업용(무조건 의제) + 근거 step 반환.
- 주의: line 62는 line 64 destructure **이전** → `context.parseDate` 사용(구조분해된 `parseDate` 아님).

---

## 5. 검증 계획

### Phase 0 — Pre-Do anchor (RED 먼저, `pre-do-anchor-verification`)

Do **전** 아래 anchor 작성·실행로 현재 실패 확인 + 설계 환류:

1. **계층 A** (validate): 케이스 3 asset(`nblExemptPublicExpropriation=true`, `nblExemptPublicNoticeDate="2004-04-23"`, `nblLandType:""`, `nblZoneType:""`, `acquisitionArea:"1000"`, 유효 취득일/양도일) → `validateAssetAcquisition(asset,"자산1","2024-05-01")` **`null` 기대**(현재 "지목을 선택" 실패).
2. **계층 C-1** (builder): 동일 asset → `buildNonBusinessLandRaw(asset,"2024-05-01")` **undefined 아님** + `nblExemptPublicExpropriation` 포함 기대(현재 undefined 실패).
3. **계층 C-2** (Zod): 위 raw → `nonBusinessLandRawSchema.safeParse(raw).success === true` 기대(현재 nblLandType "" 거부 실패).
4. **계층 B + 엔진** (mapper→engine): 위 raw → `buildNblEngineInput` non-null → `judgeNonBusinessLand` → `isNonBusinessLand === false` + `unconditionalExemption.reason === "public_expropriation"` 기대(현재 null 실패).
5. **잔존 플래그 override**(정확성 회귀 방지): 입력 플래그 `isNonBusinessLand: true` + 공익수용 의제 충족 + 지목 미선택 → 전체 파이프라인(빌더→매퍼→`calculateTransferTax`) 결과 `isNonBusinessLand === false`(사업용, 중과 0) 기대. §4.0 오과세 시나리오를 직접 봉쇄.

### Phase 1 — 회귀 가드 (기존 테스트 GREEN 유지)

- `__tests__/lib/calc/nbl-detailed-cases.test.ts:241-256` — 비의제 케이스의 지목/용도지역/면적 차단 단언(`baseLand()`에 의제 토글 없음 → isExempt=false). **내 수정 후에도 GREEN 유지**(케이스 4·6 가드 역할). 실측으로 회귀 없음 확인.
- `__tests__/lib/calc/nbl-raw-to-engine-input.test.ts` — `buildNonBusinessLandRaw`·`buildNblEngineInput` 검증(변경 ❷·❹ 회귀면). 기존 케이스는 지목 有 → 가드 미변경 경로 → **GREEN 유지** 확인.
- 케이스 4 신규 anchor: 공익수용 ON + 고시일 2017 + 취득일 2015(미충족) → 지목 요구 메시지 유지.

### Phase 2 — 구현 후 유닛

- Phase 0 anchor 전부 GREEN.
- `npx vitest run __tests__/lib/calc/ __tests__/tax-engine/non-business-land/` 회귀 0.
- 어댑터 테스트(이동 경로 반영) 통과.

### Phase 3 — E2E (기존 갭 보완)

`e2e/transfer-nbl-unconditional-exemption.spec.ts`는 입력 폼 배너·비활성만 검증하고 **계산 진행을 안 해** 버그 미탐지.

- **신규 테스트**: 공익수용 충족 + 지목 미선택 → **다음/계산까지 진행** → "지목을 선택" 오류 미발생 + 결과 화면 도달 + `NonBusinessLandResultCard`("비사업용토지 판정 결과" + 사업용/무조건 의제) 표시 확인.
- **주의**: 계산 도달을 위해 자산의 필수 필드(양도가액·취득가액·양도일·취득일·면적 등)를 **완전한 유효값**으로 채워야 함(NBL 필드만으론 다른 단계 검증에 막힘).
- worktree 포트: `E2E_PORT=3101 npx playwright test e2e/transfer-nbl-unconditional-exemption.spec.ts`.

### Phase 4 — 게이트

`npx tsc --noEmit` 0 · `npm run lint`(변경 파일) · pre-push(tsc + 전체 test).

---

## 6. 14 동기화 지점 점검

신규 필드 추가가 아닌 **기존 게이트 로직 수정**이나, 본 버그가 정확히 ⑧·④/⑬·⑫·⑭ 파이프라인 누락이므로 해당 지점 명시:

| # | 지점 | 본 수정 |
|---|------|--------|
| ①②③⑤⑥⑦ | 폼상태·initial·normalize·위젯·사이드바·결과카드 | 변경 없음(기존 필드) |
| ④/⑬ | API 변환·body(`non-business-land-request.ts` `buildNonBusinessLandRaw`) | ✅ 변경 ❷ |
| ⑧ | Validation(`transfer-tax-validate-asset.ts`) | ✅ 변경 ❶ |
| ⑫ | Zod 입력객체(`transfer-tax-schema-sub.ts`) | ✅ 변경 ❸ |
| ⑭ | Route 매핑(`buildNblEngineInput`→`mapAssetToNblInput`) | ✅ 변경 ❹ (route.ts:215 자체는 변경 불요) |

- **다건(multi) 경로 — 실측 확인**: 클라이언트 다건 변환 `lib/calc/multi-transfer-tax-api.ts:24`도 **동일한 `buildNonBusinessLandRaw`를 공유** → 변경 ❷ 하나로 단건·다건 모두 커버. 서버측 `app/api/calc/transfer/multi/route.ts:146`도 동일 `buildNblEngineInput` → 변경 ❹로 커버. **별도 다건 빌더 없음(추가 변경 불요).**

---

## 7. 범위 밖 (Scope Out)

- 농지·임야·목장 요구 의제(상속·20년소유·이농·종중)의 지목-미선택 처리 — 해당 의제는 지목 필수라 무관.
- 의제 성립 시 결과 카드 디자인 개선 — 기존 `NonBusinessLandResultCard` 재사용.
- 의제-specific 날짜(사업인정고시일) 입력 자체의 필수 검증 강화 — 별건.
- 엔진 판정 로직(`unconditional-exemption.ts`·`engine.ts`) — 이미 정확, 무변경.

---

## 8. 리스크 및 완화

| 리스크 | 완화 |
|---|---|
| 4계층 중 일부만 수정 → 여전히 차단/누락 | Phase 0 anchor를 **계층별 1건씩**(A/C-1/C-2/B) 작성해 각 게이트 통과를 개별 검증 |
| 빈 지목이 비의제 케이스로 엔진 도달 → 비사업용 오판정 | ❶ 검증이 isExempt=false면 지목 요구 → 도달 불가. ❹ 매퍼 2차 가드(토글 없으면 null). 매퍼는 절대 비사업용 오판정 안 함(null=NBL 미판정=중과 없음) |
| 어댑터 재배치 참조 누락 | `git grep unconditional-exemption-status` 전수 + tsc 0 게이트. importer 3곳 명시 |
| Zod "" 허용이 비의제 직접 API 우회 허용 | ❹ 매퍼가 빈 지목+무토글이면 null 반환(NBL 미판정) — 오판정 아님. 클라이언트 검증이 정상 게이트 |
| multi 경로 빌더 누락 | **실측 해소** — 단건·다건이 동일 `buildNonBusinessLandRaw` 공유(§6) → ❷로 자동 커버 |
| E2E worktree 포트 충돌 | `E2E_PORT=3101` 명시 |

---

## 9. 작업 순서

```
0. Pre-Do anchor 5건(A/C-1/C-2/B+엔진/잔존플래그override) 작성·실행 → 각 RED 확인, 설계 환류
1. 변경 ⓪ 어댑터 lib/calc/ 이동 + import 3곳 갱신          → verify: tsc 0, 어댑터 테스트 GREEN
2. 변경 ❶ validate-asset.ts (isExempt 스킵, 면적 유지)      → verify: 케이스3 anchor GREEN, nbl-detailed-cases GREEN
3. 변경 ❷ non-business-land-request.ts (빌더 가드 완화)     → verify: C-1 anchor GREEN
4. 변경 ❸ transfer-tax-schema-sub.ts (Zod "" 허용)          → verify: C-2 anchor GREEN
5. 변경 ❹ form-mapper.ts:62 (매퍼 가드 완화)                → verify: B+엔진 anchor GREEN
6. E2E 신규(계산 진행) 추가                                 → verify: E2E GREEN (E2E_PORT=3101)
7. tsc + lint + 전체 vitest                                → verify: 0건
8. ship (fix/nbl-determination → master)
```
