# NBL 잔여 미구현 4갭 구현 계획서 (2026-06-19)

> 출처: `nbl-gap-audit`(18에이전트 적대검증, 2026-06-19) → `nbl-followup-impl-plan`(8에이전트 정밀설계+자가검토).
> 모든 file:line·법령·anchor는 코드 실독 + KoreanLaw 본문 + throwaway probe로 검증됨(추정 금지). 메모리 [[project_transfer_nbl_gaps]] 참조.
> F1·F2·F3·B1~B4 본선은 완결(blocker 0). 본 문서는 그 이후 적대검증으로 새로 확인된 **잔여 갭 4건**.

## 0. 개요

| # | 갭 | scope | numeric | review 반영 | 핵심 |
|---|---|---|---|---|---|
| ① | §168의11⑤⑥ 라벨 오기 정정 | S | NONE(충실도) | ✗ design 원안 | 6 소스 + 2 테스트, `§168의10③`·`§168의11①` 병기 |
| ② | isFarmDevZone(농지개발사업지구 의제) 입력 결선 | M | MEDIUM | ✓ R1 반영 | sibling `isMarginalFarmProject` 6지점 1:1 복제 |
| ③ | 별장 농어촌주택 §168의13 3요건 검증 | L | MEDIUM | ✗ design 원안 | 신규 입력 4필드 + 3요건 AND 게이트 |
| ④ | hasBuilding 하드코딩 + propertyTaxType 침묵 override | M | MEDIUM | ✗ design 원안 | hasBuilding 결선, override는 isBareLand 시만 유지 |

**우선순위(사용자 지정 = 권장):** ① → ② → ③ → ④. ①②는 작아 한 브랜치로 묶어 1회 ship 가능(CI 절감). ③④는 각각 분리 PR.

### 충돌 매트릭스 (동시 작업 시 머지 충돌 후보)

| 파일 | ① | ② | ③ | ④ | 비고 |
|---|---|---|---|---|---|
| `lib/stores/calc-wizard-asset-factory.ts` | | 201 | 221 | 225 | 인접 라인 — 같은 브랜치면 무충돌, 분리 브랜치는 rebase 주의. **이미 803줄(800 초과·사전존재)** |
| `lib/api/transfer-tax-schema-sub.ts` | | 97(농지) | 121(villa) | 126(other) | 다른 블록 |
| `components/calc/NonBusinessLandResultCard.tsx` | 126 | — | 131(자동) | 136(자동) | ①만 코드 변경. ③④는 generic 렌더라 무변경 |
| `lib/tax-engine/non-business-land/other-land.ts` | 263은 engine.ts | — | — | 245·250(detail) | ①의 engine.ts:263과 별개 파일 |

→ **권장 PR 순서: ①+② (한 브랜치) → ④ → ③.** ③이 최대(L)이고 villa 경로 독립이라 마지막. ④의 ResultCard·factory 변경이 ③와 겹치지 않게 ④ 먼저 머지 후 ③ rebase.

### ship 패턴 (메모리 교훈)
- worktree에서 `gh pr merge`가 로컬 master 자동전환/충돌("master already used by worktree") → **원격 머지는 성공**, 로컬은 `git checkout -b` 후 staged 이동 또는 메인 트리에서 `worktree remove -f` + `pull`.
- pre-push = tsc + 전체 test만(lint 제외) → 대규모 변경 후 `npm run lint` 수동 1회.
- 신규 import는 **한 줄 한 named**(eslint --fix가 같은 줄 사용 중 named 제거하는 함정).

---

## ① §168의11⑤⑥ 라벨 오기 정정 (scope S · numeric NONE)

### 현황
현 구현은 **단일 필지의 기준면적 초과분만** 비사업용으로 안분한다. 두 경로가 동일한 `nonBusinessLandAreaRatio`(엔진 파생) 필드를 공유:
- (a) 기타토지 = §168의11① 호별 기준면적 (`other-land.ts:336-360`, `NBL.OTHER_LAND_BUSINESS`)
- (b) 축산용 = **§168조의10③** 기준면적 (`pasture.ts:152-161`, `NBL.PASTURE_AREA`)

그런데 주석·결과뷰·타입 라벨 **6 소스 + 테스트 4라인**이 이를 `§168의11⑤⑥`로 과대표기. KoreanLaw 본문 확인:
- §168의11⑤ = 연접 다수 필지 일괄사용 시 초과부분 필지 선택(**미구현**)
- §168의11⑥ = 복합용도 건축물 부속토지 연면적·바닥면적 비례 안분(**미구현**)

→ 현 단일필지 안분과 전혀 다른 기전이라 **명백한 오기**. 정확한 step 라벨 `other-land.ts:342·366`은 이미 `§168의11①`로 정직(기준·변경 대상 아님).

### ⚠️ 정정 핵심 (design deviation — 초기 보고 정정)
- 오기 위치가 4곳이 아니라 **6 소스**: `engine.ts:263`·`transfer-tax-rate-calc.ts:275`·`transfer.types.ts:135`·`non-business-land/types.ts:472`·`transfer-tax.ts:221`·결과뷰 `NonBusinessLandResultCard.tsx:126` + 테스트 2파일.
- 정정값은 단일 `§168의11①`이 **아니라** `§168의10③`(목장)·`§168의11①`(기타토지) **병기**. 공용 필드를 단일 ①로 바꾸면 목장 경로가 새 오기로 잔존. 병기 정답 템플릿: `utils/area-proportioning.ts:2` 헤더가 이미 `(목장 §168의10③ · 기타토지 §168의11① 공용)`.

### 14지점
전부 **N/A**. `nonBusinessLandAreaRatio`는 사용자 입력이 아닌 엔진 파생(`engine.ts:226` judge 결과를 effectiveInput에 주입). store/Zod/API/validate/form-mapper/request에 ⑤⑥ 라벨·해당 필드 없음(grep 0건). 형식상 ⑦결과카드만 라벨 문자열 차원에서 걸림.

### 구현 단계
1. `NonBusinessLandResultCard.tsx:126` — 안내문 `(§168의11⑤⑥)` → `(단일 필지 기준면적 초과분 안분 — 목장 §168의10③·기타토지 §168의11①. 연접 다필지(§168의11⑤)·복합용도 건축물(§168의11⑥) 안분은 미지원.)`
2. `transfer-tax-rate-calc.ts:275` 주석 — 동일 병기 + ⑤⑥ 미구현 명시
3. `engine.ts:263` 주석 — 동일
4. `transfer.types.ts:135` 주석 — 동일
5. `non-business-land/types.ts:472` JSDoc — 동일
6. `transfer-tax.ts:221` 주석 — 동일
7. `__tests__/.../nbl-partial-area-surcharge.test.ts:2,55` — describe/헤더의 ⑤⑥ → 병기(F3 식별자 보존)
8. `__tests__/lib/calc/nbl-result-card-render.test.tsx:40,56` — assertion `toMatch(/§168의11⑤⑥/)` → `toMatch(/§168의10③/)` AND `toMatch(/§168의11①/)` AND `not.toMatch(/§168의11⑤⑥/)`

### anchor (Pre-Do)
- **A1 결과뷰 렌더**: 목장(한우 100두·기준 1,000㎡ 초과) 트리거 → `textContent` `/§168의10③/` match ∧ `/§168의11①/` match ∧ NOT `/§168의11⑤⑥/`. **fix 전**: 결과뷰가 아직 ⑤⑥라 §168의10③ no-match 실패(목장 트리거이므로 단일 ①도 부정확함을 동시 증명).
- **A2 grep 회귀 가드**: `grep -rn '168의11⑤⑥' lib/ components/ __tests__/`(worktree 제외) → 정정 후 **0건**. fix 전 10 hit.

### risk / openQuestion
- 결과뷰(step1)와 테스트(step8) 문자열을 **정확히 동일 동기화**(toMatch 깨짐 방지).
- `.claude/worktrees/{gift-asset-value,inheritance-gaps}`에 동일 오기 각 6 hit → 머지 시 재유입 가능. **본 갭은 main tree 한정**(활성 동시편집 worktree 직접 수정 금지 — [[feedback_external_concurrent_edit_stale_read]]).
- SCOPE_OUT 문구 길이: 법령 정확성·미오해 우선 → 전체 노출 권장.

---

## ② isFarmDevZone(농지개발사업지구 사용의제) 입력 결선 (scope M · numeric MEDIUM) — R1 검토 반영

### 현황
엔진은 `isFarmDevZone`을 **이미 완전 소비**. `farmland.ts:64` `if (d.isFarmDevZone && input.landArea < FARM_DEV_MAX(=1500))` → reason push("농지개발사업지구 1,500㎡ 미만"). 타입 `FarmlandDeemingInput.isFarmDevZone?`도 `types.ts:290`에 존재. 그러나 **store/UI/Zod/form-mapper 전 입력 경로에 채널 부재** → 사용자가 입력할 방법이 없음.
- grep 실측: `isFarmDevZone` 정확히 **2건**(`farmland.ts:64`·`types.ts:290`). form-mapper-helpers buildFarmlandDeeming(116-130)은 has 게이트·반환객체 모두 미참조(0건).
- sibling `isMarginalFarmProject`(한계농지·폼 키 `nblFarmlandIsMarginalFarm`)는 동일 `farmland.ts:65`에서 똑같이 `&& landArea<1500` 게이트로 소비되며 **6지점 전부 결선** → 1:1 복제가 최안전.

### 법령 (KoreanLaw 본문 축자 확인)
소득세법 시행령 §168의8③1호 = 「농지법」 §6②제2호·**제9호**·제10호가목·다목. 농지법 §6②**제9호** = "한국농어촌공사 개발사업지구 농지로서 1천500제곱미터 미만". → 엔진 게이트·라벨이 §6②9호에 정확 대응. **UI 라벨 근거조문 = 소득세법 시행령 §168의8③(농지법 §6②9호)** (초기 보고 §6②10호 → §6②9호 정정).

### 14지점 (sibling 6지점 1:1 복제, 폼 키 `nblFarmlandIsFarmDevZone` → 엔진 `isFarmDevZone`)
| 지점 | 파일:line | 변경 |
|---|---|---|
| ①폼상태 | `calc-wizard-asset.ts:466` | `nblFarmlandIsFarmDevZone: boolean;` 추가(sibling 위) |
| ②initial | `calc-wizard-asset-factory.ts:201` | `nblFarmlandIsFarmDevZone: false,` (★803→804줄, 사전존재 800위반·무시) |
| ③normalize | `calc-wizard-asset-nbl.ts:229` | `nblFarmlandIsFarmDevZone: false,` |
| ⑤UI | `FarmlandDetailSection.tsx:82` | 한계농지 ToggleCard(77-82) 복제, `tone="sky"` |
| ⑫Zod | `transfer-tax-schema-sub.ts:97` | `nblFarmlandIsFarmDevZone: z.boolean().optional(),` ★누락 시 침묵 strip |
| ⑭하위매퍼 | `form-mapper-helpers.ts:119,125` | **2곳**: has 게이트 + 반환객체 |

**④⑬⑭(상위) 무변경**: prefix-pick(`non-business-land-request.ts`)·body spread·route 단일매퍼 위임 자동. **⑧validate 무변경**: sibling도 validate 0건(boolean 의제는 필수 아님·차단 validation은 전세목 E2E 회귀 — [[feedback_blocking_validation_full_e2e_regression]]).

### ⚠️ 최위험 (기능 버그 방지)
`form-mapper-helpers.ts` **has 게이트(119) + 반환객체(125) 둘 다** 변경 필수. 반환객체만 추가하고 has 게이트를 빠뜨리면 → 농지개발사업지구만 단독 체크된 케이스에서 `has=false` → `buildFarmlandDeeming` undefined 반환 → 엔진 미도달(부분 버그).

### anchor (Pre-Do)
- **wire 도달**: `buildNblEngineInput({...nblFarmlandIsFarmDevZone:true})` → `input.farmlandDeeming?.isFarmDevZone === true`. fix 전: has 게이트 부재로 undefined 반환 → undefined(≠true). ★단 buildNblEngineInput 직접 호출이라 Zod(⑫) 우회 → ⑫ 누락은 **grep 자가점검**으로 보완.
- **엔진 numeric**: `judgeFarmland(base({farmingSelf:false, landArea:1200, farmlandDeeming:{isFarmDevZone:true}, acq:'2010-01-01', transfer:'2020-01-01'}))` → `isBusiness===true` ∧ farmland_deeming step PASS. (엔진 이미 구현 — 결선 무관 회귀 가드. deemed 모드 = applies ∧ fullPeriod meets 둘 다, 10년 보유로 충족.)
- **경계**: `landArea:1500` → deeming 미적용(`<` strict, 농지법 "1천500제곱미터 미만" 정합).

### risk / openQuestion
- ⑫ Zod·⑭ has 게이트 누락이 TS 미감지 → grep `nblFarmlandIsFarmDevZone` **6+곳** 전수 확인 필수.
- `factory.ts` 사전존재 800 위반(803줄) → ②로 804줄 악화·hook 경고(무시, 분리는 scope 밖).
- **별건 기록**: sibling 한계농지(`isMarginalFarmProject`)=농지법 §6②9호의2(평균경사율 15%↑)는 §168의8③1호 인용 범위(§6②2·9·10가·다호) **밖**일 가능성 → sibling 자체 법령 근거 재확인(본 갭 무관, 별도 점검).

---

## ③ 별장 농어촌주택 §168의13 3요건 검증 (scope L · numeric MEDIUM)

### 현황
별장 판정(`villa-land.ts:101`)의 농어촌주택 예외가 `if(v.isEupMyeon && v.isRuralHousing)` **boolean 2개로만** 게이트. §168의13 법정 3요건을 전혀 산정하지 않음. `isRuralHousing=true` 하나로 PASS → `buildPass()` → `isBusiness:true` → engine이 `isNonBusinessLand:false`로 환산 → 중과(+10%p)·LTHD 표1 스킵 → **과세 과소 위험**(self-attest 오입력 시).
- `VillaUsage.isAfter20150101`은 5층 wire되어 있으나 엔진 grep 0건 **dead 필드**.
- 입력 면적은 `form-mapper.ts:67` acquisitionArea→landArea로 도달하나 **자산 전체 토지면적**이라 §168의13 부속토지면적과 동일 보장 없음 → 660㎡는 별도 입력 필요(landArea 재사용 불가).

### 법령 (KoreanLaw 본문 확인) — §168의13 = 3요건 AND
1. **1호**: 건물 연면적 150㎡ 이내 **AND** 부속토지 660㎡ 이내
2. **2호**: 건물 + 부속토지 **합산** 기준시가 2억원 이하
3. **3호**: 조특법 §99의4①1호가목 **1)~4)** 제외지역에 소재하지 **않을 것** = {수도권, 도시지역, 조정대상지역, 허가구역}. ★가목 5)관광단지는 §168의13이 "1)부터 4)까지"만 인용 → **별장 제외지역 미포함**(정밀).

### 14지점 (신규 필드 4종: `nblVillaBuildingFloorArea`·`nblVillaAttachedLandArea`·`nblVillaCombinedStdValue` string + `nblVillaIsInRestrictedArea` boolean)
| 지점 | 파일:line | 변경 |
|---|---|---|
| ①폼상태 | `calc-wizard-asset.ts:492` | 4필드 추가(`nblVillaIsAfter20150101` 인근) |
| ②initial | `calc-wizard-asset-factory.ts:221` | string `''`·boolean `false` |
| ②b orphan | `calc-wizard-asset-nbl.ts:249` | NBL_DEFAULTS(소비자 0건이나 일관성) |
| ③normalize | `calc-wizard-asset-factory.ts:394` | migrateAsset undefined 방어 4줄 |
| ④mapper | `form-mapper-helpers.ts:165` | `buildVilla`에 parseNumber 인자 + 4필드 매핑 |
| ④mapper 호출 | `form-mapper.ts:141` | `buildVilla(asset, landType, parseDate, parseNumber)` |
| ⑤UI | `VillaLandDetailSection.tsx:42` | 단일 ToggleCard 제거 → 3요건 분리 입력(면적 sky·기준시가 emerald·지역 rose) |
| ⑦결과 | `NonBusinessLandResultCard.tsx:131` | 코드 무변경(generic 렌더). villa-land.ts가 step.detail에 3요건 산식 풀어쓰기 |
| ⑧validate | `transfer-tax-validate.ts` | **비차단 권장**(아래 openQuestion) |
| ⑫Zod | `transfer-tax-schema-sub.ts:121` | 4필드 optional ★누락 시 strip |
| ⑭Route | `route.ts:215` | 무변경(buildVilla 매핑이 자동 도달) |

### 엔진 산식 (`villa-land.ts:101`)
```
const RURAL_FLOOR_MAX=150, RURAL_LAND_MAX=660, RURAL_VALUE_MAX=200_000_000;
const req1 = v.buildingFloorArea!==undefined && v.buildingFloorArea<=150
          && v.attachedLandArea!==undefined && v.attachedLandArea<=660;
const req2 = v.combinedStdValue!==undefined && v.combinedStdValue<=200_000_000;
const req3 = v.isInRestrictedArea !== true;   // 제외지역 아님
const ruralHousingQualified = v.isEupMyeon && req1 && req2 && req3;
// qualified일 때만 r2(기간기준) 평가→PASS, 미충족 시 buildFail
```
**미입력(undefined)=요건 미충족=비사업용** 처리. §168의13은 충족 시 사업용(납세자 유리)이므로 미입증=불인정이 법리상 타당(불리 적용 아님 — [[feedback_no_unfavorable_application_without_legal_basis]]).

### anchor (Pre-Do) — `villa-land.test.ts`
- **A1** 연면적 151㎡>150 → `isBusiness===false`. fix 전: buildingFloorArea 미소비로 true 오판.
- **A2** 부속토지 700㎡>660 → false. (landArea 660 게이트 villa에 부재 확인)
- **A3** 기준시가 2.1억>2억 → false.
- **A4** 제외지역(`isInRestrictedArea:true`) → false. §168의13 3호 = 가목 1)~4)(관광단지 5호 미포함).
- **A5** 3요건 전부 충족 + 기간기준 충족 → `isBusiness===true`(회귀 가드, 기존 line36-51 입력 보강 버전).
- ★기존 `villa-land.test.ts:36-51`이 2 boolean만으로 PASS 기대 → 3요건 도입으로 깨짐. **법령 정합값으로 입력 보강**([[feedback_anchor_correction_legal_priority]], 잘못된 anchor 유지 금지).

### risk / openQuestion (사용자 결정 필요)
1. **기준시가 2억 시점**: §168의13②2호 본문이 양도시/취득시 시점 침묵. 양도세 양도시점 과세 원칙상 양도일 기준 자연스러우나 → 단일 `combinedStdValue`(사용자가 해당 시점 값 직접 입력)로 시점 추상화. **확정 필요.**
2. **⑧validate 차단 여부**: isRuralHousing 진입 후 3 수치 미입력 시 (a)차단 vs **(b)비차단(미입력=요건 미충족=비사업용)**. (b) 권장(불리 아님). UI 통과↔validate 모순 방지([[feedback_validation_sync_8th_point]]).
3. **§99의4①1호가목 제외지역 자동판정 여부**: 기존 `nblIsMetropolitanArea`·`nblZoneType`·조정대상 인프라(REGULATED_REGIONS)로 일부 자동 derive 가능하나 **dual-truth·오판 위험** → 단일 boolean 수동 선언 권장([[feedback_ui_engine_dual_truth_avoidance]]).
4. **isAfter20150101 dead 필드**: @deprecated만 달고 유지 vs 5층 제거(sessionStorage 마이그 영향) → 본 갭은 @deprecated 권장, 제거는 별도.
5. **attachedLandArea vs landArea 혼동**: UI hint로 "660㎡ 요건은 건물 부속토지면적" 명시.

---

## ④ hasBuilding 하드코딩 + propertyTaxType 침묵 override (scope M · numeric MEDIUM) — 별건 triage

### 현황 (throwaway probe로 numeric 실증 완료)
`other-land.ts:48` isBareLand가 `if (!o.hasBuilding) return true`로 시작하는데 `form-mapper-helpers.ts:188`이 **`hasBuilding: false` 무조건 하드코딩**. → 엔진 도달 모든 기타토지가 isBareLand 항상 true → `other-land.ts:245` effectiveTaxType 항상 `comprehensive` 강제. 결과:
- (a) `other-land.ts:49~51`의 건물/토지 시가표준액 2% 비교 분기 영구 미도달
- (b) UI 노출 `nblOtherPropertyTaxType`(별도합산/분리과세, `OtherLandDetailSection.tsx:141`)이 침묵 override → **사업용 토지가 비사업용화**

**probe 실증**: 동일 입력(propertyTaxType=separate, building 1억/land 2억)에서 hasBuilding=true → `isNonBusinessLand=false`(사업용·정상), hasBuilding=false(현 매퍼) → `isNonBusinessLand=true`(비사업용·오류). **단일 필드 차이로 +10%p 중과 여부가 뒤바뀜.** `nblOtherHasBuilding` 키는 store/Zod/factory 0건(UI 토글 부재).

### 법령 (KoreanLaw 본문 확인)
소득세법 §104의3①4호: 가목=재산세 비과세·면제, **나목=「지방세법」§106①2호(별도합산)·3호(분리과세) 토지(둘 다 사업용)**, 다목=거주·사업 직접관련(§168의11). → 사용자가 별도합산/분리과세 선택 시 **나목 해당→사업용이 정당**, 종합합산 강제 override는 **부당**. 지방세법 시행령 §101①2호나목 = 건축물 시가표준액 < 부속토지 시가표준액×2% 미달 시 별도합산 제외(엔진 2% 비교가 이를 구현).
**결론**: override는 isBareLand=true(건물無 또는 2%미달)일 때만 정당. hasBuilding을 사용자 입력으로 결선하고 override는 유지하되 입력만 정확화.

### 14지점 (신규 `nblOtherHasBuilding` boolean)
| 지점 | 파일:line | 변경 |
|---|---|---|
| ①폼상태 | `calc-wizard-asset-nbl-other.ts:11` | NblOtherFormSlice에 `nblOtherHasBuilding: boolean;` |
| ②③initial | `calc-wizard-asset-nbl.ts:253`(NBL_DEFAULTS) + `calc-wizard-asset-factory.ts:225`(인라인) | **양쪽** `false`(factory가 spread 미사용) |
| ④mapper | `form-mapper-helpers.ts:188` | `hasBuilding: false` → `asBool(a.nblOtherHasBuilding)` |
| ⑤UI | `OtherLandDetailSection.tsx:139` | 재산세 분류 Select 위에 건물유무 ToggleCard(amber). 건물가액(162)·토지가액(172)은 hasBuilding ON 시만 표시 |
| ⑦결과 | `NonBusinessLandResultCard.tsx:136` | 코드 무변경(generic). `other-land.ts:250~252` step.detail 3분기 정확화 |
| ⑧validate | `transfer-tax-validate-asset.ts:491` | hasBuilding ON 시 건물·토지 가액 필수(UI 조건부 표시와 동기화) — **단 openQuestion 3 참조** |
| ⑫Zod | `transfer-tax-schema-sub.ts:126` | `nblOtherHasBuilding: z.boolean().optional(),` ★누락 시 strip |
| ⑬⑭ | `non-business-land-request.ts:36,64` | 무변경(prefix-pick·route 위임 자동) |

### ⚠️ 핵심 원칙
`other-land.ts:245` **override 로직 자체는 변경 금지**(isBareLand=true 시 comprehensive 강제가 법령상 정당). 변경하면 나대지가 사용자 separate 선택으로 별도합산화되는 **역버그**. override는 유지하고 **isBareLand 입력(hasBuilding)만 정확화**가 핵심. step.detail만 3분기로 명확화:
- bareLand ∧ hasBuilding → "건물 시가표준액 < 토지×2% → 별도합산 제외(종합합산)"
- bareLand ∧ !hasBuilding → "나대지 → 종합합산"
- !bareLand → 기존 "건축물 부속토지(원 재산세 유형 유지)"

### anchor (Pre-Do)
- **A4 매퍼 결선**(가장 직접적): `buildNblEngineInput(raw{nblOtherHasBuilding:true})` → `input.otherLand.hasBuilding===true`. fix 전: 하드코딩 false → expect(true) FAIL.
- **A1 별도합산 사업용**: raw{other_land, propertyTaxType:'separate', hasBuilding:true, building 1억/land 2억} → `isNonBusinessLand===false`. fix 전: hasBuilding 무시 → comprehensive → true(FAIL).
- **A2 나대지 baseline**: hasBuilding:false → `isNonBusinessLand===true`(override 정당 케이스). A1과 쌍으로 "단일 필드가 결과를 가른다" 증명.
- **A3 2% 분기 활성**: hasBuilding:true ∧ building 100만 < land 2억×2%=400만 → `isNonBusinessLand===true`(2% 미달→별도합산 제외). fix 전: 48행 early-return으로 2% 비교 미도달.
- **A5 validation**: hasBuilding:true ∧ 가액 미입력 → 차단 메시지(openQuestion 3 결정에 따라 조정).

### risk / openQuestion (사용자 결정 필요)
1. **기존 데이터 호환(numeric 영향)**: 현재 모든 기타토지가 hasBuilding=false로 판정돼 옴 → 결선 후 "건물 있는 별도합산 토지"였던 과거 케이스가 토글 ON 시 비사업용→사업용으로 변경. 저장 이력 재계산 결과 변동 → 변경 이력 명시.
2. **footprint 정밀안분 분리**: §101①2호나목은 "바닥면적을 제외한 부속토지"만 별도합산 제외(건물 바닥면적분은 별도합산 유지). 현 엔진 isBareLand는 전체 토지 boolean(footprint 차감 미구현). `OtherLandUsage.buildingFloorArea`(types.ts:231) 존재하나 미매핑. → **본 갭은 hasBuilding 결선·2% 분기·override 조건부화까지(M), footprint 정밀안분은 후속 갭(L)으로 분리** 권장.
3. **⑧validate 가액 필수 여부**: hasBuilding ON이지만 별도합산 확정이라 2% 비교 불요한 사용자 → 가액 선택적 허용 vs 필수 차단. 엔진 49행 `!== undefined` 가드 이미 존재 → **가액 입력 시에만 2% 비교, 미입력은 통과(비차단)** 권장. 확정 필요.
4. **§101① 단서(무허가 건축물 별도합산 제외)** 미구현 — 별건 추가 토글(본 갭 범위 외).

---

## 5. 공통 테스트 전략
- Pre-Do anchor 우선([[feedback_pre_anchor_verification]]): 각 갭 핵심 anchor 1건을 **fix 전 실패 확보** 후 디자인 환류.
- 14지점 grep 자가점검: ②`nblFarmlandIsFarmDevZone`·③`nblVilla*`·④`nblOtherHasBuilding` 각 6+곳.
- 회귀: 커밋/PR 전 전체 `npm test`([[feedback_per_tax_test_scripts]]). 차단 validation 추가 시(④ 가능) 전세목 E2E 회귀([[feedback_blocking_validation_full_e2e_regression]]).
- `npx tsc --noEmit` 0건 + `npm run lint`(대규모 변경 후).

## 6. 미해결 결정사항 (Do 착수 전 사용자 확정)
| # | 갭 | 결정 |
|---|---|---|
| Q1 | ③ | 기준시가 2억 판정 시점(양도일 vs 단일 입력 추상화) |
| Q2 | ③ | ⑧validate 차단 vs 비차단(비차단 권장) |
| Q3 | ③ | 제외지역 자동판정 vs 수동 boolean(수동 권장) |
| Q4 | ③ | isAfter20150101 @deprecated vs 제거 |
| Q5 | ④ | 기존 이력 재계산 변동 고지 방식 |
| Q6 | ④ | footprint 정밀안분 본 갭 포함 vs 후속 분리(분리 권장) |
| Q7 | ④ | hasBuilding ON 시 가액 필수 vs 선택(선택 권장) |
| Q8 | ② | sibling 한계농지(§6②9호의2) 법령 근거 별도 점검(본 갭 무관) |
