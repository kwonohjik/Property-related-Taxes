# 겸용주택 기준시가 — 시점 입력 순서 통일 + 양도시 공시지가 fallback 대칭화

- 작성일: 2026-07-15 (자가 검토 루프 1회차 정정 반영: Critical 2 · High 3 · Medium 9 · Low 5)
- 대상: 양도소득세 > 겸용주택 마법사 > 기준시가 섹션
- 유형: **P2 fallback 대칭화**(로직) + **P1 시점 순서 통일**(시각) — **PR 분리**
- 엔진 산식 변경: **없음**

## 0. 검증 상태

모든 인용은 실제 파일 대조 완료. 미검증은 §7에 "확인 필요"로 분리.

**1회차 검토에서 뒤집힌 전제 3건** (기록 — 재발 방지):
1. ~~"`:257`만 고치면 된다"~~ → **자동합계 파생 계산 `:70`·`:53`이 진짜 급소**. 입력칸만 고치면 사용자가 본 "양도 상가부수토지 기준시가 (자동) —"가 그대로 남는다.
2. ~~"주택가격은 이미 `phdTransferHousingPrice || mixedTransferHousingPrice` 3중 fallback 선례"~~ → **거짓**. PHD 패널은 `mixedTransferHousingPrice`를 **직접 write**한다(`MixedUsePreHousingDisclosureSection.tsx:150`, 헤더 주석 `:8` "양도시 개별주택가격은 mixedTransferHousingPrice를 자동 mirror"). 단일 필드 공유이지 fallback이 아니다. 진짜 선례는 **취득측 상가 공시지가**다.
3. ~~"P1은 JSX 블록 위치만 바꾸면 되는 로직 무변경"~~ → **Legacy에서 거짓**. 섹션 번호 배지가 역전된다(§3 P1-b).

---

## 1. 문제

### P1 — 시점 입력 순서 불일치 (시각)

**불일치는 PHD 토글 ON일 때만 드러난다** (실측):

| PHD | ② 주택 | ③ 상가 | 일치 |
|---|---|---|---|
| OFF | 양도(`MixedUseAssetMajorStdPrice.tsx:119`) → 취득(`:135`) | 양도(`:196`) → 취득(`:206`) | ✅ |
| ON | 양도 sub-block 숨김(`:117`) → PHD 3-시점 패널만 = 취득→최초공시→양도 (`ThreePointStandardPriceInput.tsx:622-628`) | 양도 → 취득 | ❌ |

PHD 3-시점 패널 순서는 §164⑦ 환산식의 법정 시계열 → 뒤집을 수 없다.

### P2 — 양도시 상가부수토지 공시지가가 PHD 값을 이어받지 않음

**원인: fallback 비대칭 — 표시·파생 계산 양쪽 모두** (실측 확정)

| 축 | 취득측 (fallback 있음) | 양도측 (fallback 없음) |
|---|---|---|
| **자동합계 파생** | `:76-77` `parseAmount(mixedAcq) \|\| parseAmount(phdLandPricePerSqmAtAcq)` — 주석: "API 변환과 동일 우선순위" | **`:70` `parseAmount(asset.mixedTransferLandPricePerSqm) ?? 0`** |
| 입력칸 표시 | `:270` `asset.mixedAcqLandPricePerSqm \|\| asset.phdLandPricePerSqmAtAcq` | **`:257` `asset.mixedTransferLandPricePerSqm`** |
| Legacy 파생 | `:59-61` fallback 있음 | **`:53` 없음** |
| Legacy 표시 | `:279` fallback 있음 | **`:160` 없음** |
| API 변환 | `:170-173` 3단 fallback | **`:152` `\|\| 0`** |

대칭 필드 `phdLandPricePerSqmAtTransfer`는 존재하고 PHD 패널이 값을 write하는데(`calc-wizard-asset.ts:384` 정의, `MixedUsePreHousingDisclosureSection.tsx:285` write), 상가 양도측이 **어느 레이어에서도 읽지 않는다**.

**"자동으로 채워진다"의 정체**: `LandPriceLookupField.tsx`에 `useEffect` 0건(`:19`), 조회는 버튼 `onClick`(`:190`) → `handleLookup()`(`:96-127`)이 유일. 취득칸의 값은 조회 결과가 아니라 **PHD 값을 비추는 read-through fallback**이다. `canLookup = !!jibun && !!effectiveYear`(`:136`)는 양쪽 동일 → "양도 버튼 고장"이 아니다.

**법리**: 주택부수토지·상가부수토지는 **동일 필지** → 개별공시지가(원/㎡) 동일. 안분은 면적으로 하고 단가는 공유한다. 화면 실측도 일치(주택 취득 2,280,000 = 상가 취득 2,280,000).

**영향 범위 (실측 — 과대주장 금지)**:
- ❌ **조용한 계산 오류 아님**. `transfer-tax-validate-asset.ts:335`가 빈값을 차단 → 잘못된 세액 미산출.
- ✅ **실제 피해**: PHD에 넣은 값(6,216,000)을 상가 양도칸에 **다시 입력해야** 진행. 그 전까지 자동합계는 "—".

---

## 2. 방침

| # | 결정 | 근거 |
|---|---|---|
| P2 | 양도측에 **대칭 fallback** — 파생·표시·API·validate·사이드바 **5축 전부** | `mirror-pattern` 스킬(`SKILL.md:34-69`이 `mixedAcqLandPricePerSqm \|\| phdLandPricePerSqmAtAcq`를 canonical 예제로 제시) · `feedback_validation_sync_8th_point` |
| P1 | **겸용주택 전체를 취득→양도로 통일** | 사용자 결정(2026-07-15) |

**fallback 방향**: `mixed || phd` (자기 필드 우선). 소비자별 "자기 필드 우선" 규칙에 정합 (실측):

| 소비자 | 취득측 | 양도측 |
|---|---|---|
| PHD 패널 | `phd \|\| mixed \|\| pre1990` (`MixedUsePreHousingDisclosureSection.tsx:259`) | `phd \|\| mixed` (`:284`) |
| 상가 섹션 | `mixed \|\| phd` (`AssetMajor:270`·`:77`) | **← P2: `mixed \|\| phd`** |
| API mixed 페이로드 | `mixed \|\| phd \|\| pre1990` (`api:171`) | **← P2: `mixed \|\| phd`** |
| API PHD 페이로드 | `phd \|\| mixed \|\| pre1990` (`api:182`) | `phd \|\| mixed` (`api:186`, 기존) |

**⚠️ 연산자 함정 (Critical)**: `parseAmount`는 `number`를 반환하며 **null을 절대 반환하지 않는다**(`CurrencyInput.tsx:22-26` — `value == null` → `0`). 따라서:
- `:70`·`:53`의 기존 `?? 0`은 **dead code**.
- fallback을 `??`로 붙이면 **조용히 무효화**된다(빈문자 → `0` → `??` 미발동).
- **반드시 `||`** 를 쓰고 `?? 0`은 제거한다 (취득측 `:77`과 동형).

**`useEffect → store` 미러링 금지** (정책) — 취득측이 이미 read-through 방식.

### 정책 판정 (검토 결과 — 재제기 방지)

- **`feedback_store_default_vs_ui_display_fallback` 위반 아님**. 그 정책의 금지 대상은 **하드코딩 리터럴** fallback(`|| "housing"`)이며 store에 영속되지 않는 값이 활성 조건 분기를 어긋나게 하는 경우다. P2의 fallback 대상은 사용자가 입력해 **store에 영속된 다른 필드**이고, `mixedTransferLandPricePerSqm` 소비자 전수 grep에 **활성 조건 분기 0건**이며, P2는 모든 소비자에 **동일 fallback**을 적용해 발산 경로가 없다. 해당 memory 자신이 `mirror-pattern`을 상위 정책으로 선언한다.
- **P1은 `feedback_ui_order_follows_logic` 의도적 이탈 — 사용자 승인 예외로 기록**. 실측상 엔진은 **양도를 먼저** 쓴다(`transfer-tax-mixed-use-helpers.ts:95-101` 양도가액 안분 1단계 → `:241-247` 취득가액 환산 2단계). 타입 선언도 `transferStandardPrice`(`transfer-mixed-use.types.ts:63`) → `acquisitionStandardPrice`(`:65`). 즉 **현행 양도→취득이 정책 정합**이고 P1은 이탈이다. 그럼에도 PHD 3-시점(§164⑦ 법정 시계열)이 화면의 지배적 구조이므로 사용자가 시계열 정렬을 선택했다. 미기록 시 후속 리뷰·gap-detector가 재차 flag한다.
- **다른 자산 블록 트레이드오프**: `GeneralBuildingBlock.tsx:9-10`(양도→취득, 근거: 양도시는 모드 무관 항상 필수 / 취득시는 환산·일괄 모드에서만 조건부)과 순서가 달라진다. 겸용주택은 PHD 3-시점 패널을 품는 유일한 자산 → 국지적 예외.
- **미채택 대안 (기록 — 재제기 방지)**: `components/calc/CLAUDE.md` §"같은 의미 폼 필드의 양방향 read/write 통합"에 따라 PHD 패널이 `mixedTransferLandPricePerSqm`을 직접 read/write하면 fallback 5축이 전부 불필요해진다(주택가격이 실제 이 방식). **미채택 사유**: (a) 취득측이 2-필드 fallback이라 양도만 공유필드로 가면 새 비대칭, (b) legacy sessionStorage의 `phdLandPricePerSqmAtTransfer` 잔존값 마이그레이션 필요. 취득측 대칭 유지를 우선.

---

## 3. 변경 지점

### P2 — fallback 5축 (PR ①)

| # | 축 | 파일:line | 변경 |
|---|---|---|---|
| **핵심** | **자동합계 파생** | `MixedUseAssetMajorStdPrice.tsx:70` | `parseAmount(asset.mixedTransferLandPricePerSqm) ?? 0` → `parseAmount(asset.mixedTransferLandPricePerSqm) \|\| parseAmount(asset.phdLandPricePerSqmAtTransfer)` |
| **핵심** | 자동합계 파생(Legacy) | `MixedUseLegacyStdPrice.tsx:53` | 동일 |
| ⑤ | 입력칸 표시 | `MixedUseAssetMajorStdPrice.tsx:257` | `... \|\| asset.phdLandPricePerSqmAtTransfer` |
| ⑤ | 입력칸 표시(Legacy) | `MixedUseLegacyStdPrice.tsx:160` | 동일 |
| ④ | API 변환 | `transfer-tax-api.ts:152` | `parseAmount(primary.mixedTransferLandPricePerSqm) \|\| 0` → `... \|\| parseAmount(primary.phdLandPricePerSqmAtTransfer) \|\| 0` |
| ⑧ | Validation | `transfer-tax-validate-asset.ts:335` | fallback 인정. **동형 선례 = 취득측 `:403-408`**(`directLandPerSqm <= 0 && phdLandPerSqm <= 0 && pre1990 <= 0` → 차단) |
| ⑥ | 사이드바 합계 | `calc-wizard-store.ts:481` | 동일 fallback (미적용 시 사이드바만 0 — `feedback_engine_result_display_drift`) |

14지점 중 ①②③(폼 상태·initial·normalize)·⑨~⑭(Zod·body spread·Route)는 **신규 필드 없음 → 해당 없음**. `phdLandPricePerSqmAtTransfer`는 기존 필드(`calc-wizard-asset.ts:384`, factory `:135`, migrate `:318`).

**범위 밖 확인**: `transfer-tax-api.ts:644`는 `:630`의 `...(!isMixed && ...)` 가드 내부 = **비-겸용 경로** → 무변경이 정확. `PreHousingDisclosureSection.tsx:196`도 비-겸용.

### P1-a — AssetMajor 순서 스왑 (PR ②)

| 블록 | 현재 | 변경 |
|---|---|---|
| ② 주택: 양도 sub-block `:117-130` / 취득 sub-block `:132-173` | 양도 → 취득 | 취득 → 양도 |
| ③ 상가건물 grid: 양도 `:195-204` / 취득 `:205-214` | 양도 → 취득 | 취득 → 양도 |
| ③ 부수토지: 양도 `:254-266` / 취득 `:267-279` | 양도 → 취득 | 취득 → 양도 |
| 자동합계 박스: 양도 `:287-302`(게이트 `:287` 포함) / 취득 `:303-316` | 양도 → 취득 | 취득 → 양도 |

파생 계산은 전부 컴포넌트 상단 `:42-89`(`commercialLandArea`는 `:50-57`) → JSX 순서 무관. 순증 0줄(322/332줄, 800줄 정책 무관).

**② 주택 스왑은 배지 문제 없음** — 섹션 번호가 상위 `housingSectionNum` 1개뿐이고 `:117`이 PHD ON 시 양도 sub-block을 숨긴다.

**모달 런처**(`:216-233`)는 스왑 대상 아님. 참고로 **모달 내부는 이미 취득(`BuildingStdPriceForm.tsx:406` `num={2} "취득 시점"`) → 양도(`:508` `num={3} "양도 시점"`)** 순 — P1 방향을 뒷받침하는 기존 근거.

#### 면적 행 이동 — 게이트도 함께 스왑 (사용자 결정: 취득 박스로)

**대상 구분 (중요)**: 옮기는 것은 **자동합계 박스의 표시 행** `:289-292`다. 같은 이름의 **입력 FieldCard** `:236-250`(label `"상가부수토지 면적 (㎡)"`, testid `mixed-commercial-land-override`, 게이트 `!usePreHousingDisclosure && totalLand > 0`)는 **무관·불변**. PHD OFF에서 면적이 화면에 2번 나오는 것은 기존 동작이며 본 건 범위 밖.

**현행 구조 실측**:
```
outer gate :282-285  (transferLandStd>0 || transferBuilding>0 || acqLandStd>0 || acqBuilding>0)
  ├ emerald 박스  게이트 :287 = commercialLandArea > 0   ← 면적 행(:289-292) + 양도 행 2개
  └ amber 박스    게이트 :303 = acqLandStd>0 || acqBuilding>0  ← 취득 행
```
즉 **"첫 박스가 면적 행을 담고 `commercialLandArea > 0`로 게이팅"** 이 현행 패턴이며, 취득만 입력된 상태에서 emerald 박스가 대시로 렌더되는 것이 **사용자 스크린샷 그대로**다(면적 78.01㎡ + "양도 … —" 2줄). 대시 박스는 신규 문제가 아니라 현행 동작.

**결정 — 역할과 게이트를 함께 스왑** (새 게이트 조건 추가 불필요):
```
outer gate :282-285  (변경 없음)
  ├ amber 박스(첫째)   게이트 = commercialLandArea > 0        ← 면적 행 + 취득 행
  └ emerald 박스(둘째) 게이트 = transferLandStd>0 || transferBuilding>0  ← 양도 행
```
현행의 "첫 박스 = 면적 + 자기 시점 / 둘째 박스 = 자기 값 게이트" 구조를 **역할만 바꿔 그대로 보존**한다. 각 박스 내부 행 구성·조건(emerald 합계 행은 무조건 `:297`, amber 합계 행은 `acqCommercialBuilding > 0` `:309`)은 **손대지 않는다**(surgical).

> 초안의 "amber 게이트에 `|| commercialLandArea > 0` 추가" 안은 **폐기**. 그 안은 양도측만 입력 시 amber 박스에 면적 + 대시 1줄만 남기고, 게이트 조건을 비대칭하게 만든다.

### P1-b — Legacy 순서 스왑 + **섹션 번호 재할당 (Critical)** (PR ②)

**JSX만 스왑하면 배지가 ③ → ② 역순으로 나온다.** 실측:
- `MixedUseSection.tsx:128-129` → `transferSectionNum={2}` / `acqSectionNum={3}` **하드코딩**
- `MixedUseStandardPriceInputs.tsx:45-46` → Legacy로 그대로 전달
- Legacy가 양도 배지에 `transferSectionNum`(`:107-109`), 취득 배지에 `acqSectionNum`(`:193-195`)을 렌더

**🚫 함정**: `MixedUseSection.tsx:128-129`의 숫자를 바꾸면 **AssetMajor가 깨진다** — 같은 쌍이 `MixedUseStandardPriceInputs.tsx:58-59`에서 `housingSectionNum={transferSectionNum}`·`commercialSectionNum={acqSectionNum}`(②주택/③상가, 스왑 대상 아님)로도 매핑되어 **③주택/②상가**가 된다.

**해법**: `MixedUseStandardPriceInputs.tsx:45-46`의 **Legacy 분기에서만** 스왑 — `transferSectionNum={acqSectionNum}` / `acqSectionNum={transferSectionNum}`.

부수: `MixedUseSection.tsx:122` 주석 `{/* ② 양도시 기준시가 / ③ 취득시 기준시가 */}` 갱신.

**Legacy 면적 행 — 구조가 AssetMajor와 다르다 (STEP 3 발견)**

AssetMajor는 두 합계박스가 섹션 끝에 **형제로 모여 공통 outer gate**(`:282-285`) 아래 있는 반면, **Legacy는 합계박스가 각 시점 섹션 안에 중첩**되어 있고 **outer gate가 없다**:

```
Legacy 양도 섹션(:101-188)
  └ 합계박스 :169-184  게이트 = commercialLandArea > 0   ← 면적 행(:171-174) + 양도 행 2개
Legacy 취득 섹션(:190-329)
  └ 합계박스 :313-326  게이트 = acqCommercialLandStd > 0 || acqCommercialBuilding > 0
```

라벨도 다르다 — Legacy 취득측은 시점 접두어가 **있고**(`"취득시 상가부수토지 기준시가 (자동)"` `:316`), 양도측은 **없다**(`"상가부수토지 기준시가 (자동)"` `:176` — 섹션 헤더가 시점을 표시). 비대칭이나 본 건 범위 밖(무변경).

**방침**: 게이트 스왑 패턴은 AssetMajor와 **동일하게 적용 가능**하다(outer gate 유무는 무관 — 각 박스 게이트만 바꾸면 됨):
- 취득 합계박스(`:313-326`) → 게이트 `commercialLandArea > 0` + **면적 행 이관**
- 양도 합계박스(`:169-184`) → 게이트 `transferCommercialLandStd > 0 || transferCommercialBuilding > 0`

**회귀 없음 확인**: Legacy 양도 박스는 오늘도 게이트가 `commercialLandArea > 0` 단독이라 **면적만 입력해도 대시 박스가 렌더**된다(outer gate 부재). 스왑 후 취득 박스가 같은 동작을 이어받을 뿐 — 신규 빈 박스 아님.

**Legacy Case A 특이**: `:104` `!(isCaseA && asset.usePreHousingDisclosure)`가 양도 섹션을 통째로 가드 → Case A + PHD ON에서는 취득 섹션만 렌더되고 스왑은 시각적 no-op. 이 상태에선 오늘도 "③"만 단독 표시(기존 번호 이상) — P1-b 번호 재할당으로 "②" 단독이 되어 오히려 개선.

---

## 4. 케이스 매트릭스

| # | PHD | mixed 양도 | phd 양도 | 기대 (P2 후) |
|---|---|---|---|---|
| C1 | OFF | 6,216,000 | — | 표시·**자동합계**·API·사이드바 = 6,216,000. validate 통과 |
| C2 | OFF | 빈값 | 빈값 | validate 차단 |
| C3 | ON | 빈값 | 6,216,000 | **표시·자동합계·API·사이드바 = 6,216,000, validate 통과** ← 핵심 회귀 대상 |
| C4 | ON | 6,216,000 | 5,000,000 | mixed 우선 = 6,216,000 |
| C5 | ON | 빈값 | 빈값 | validate 차단 |
| C6 | ON | 빈값 | 0 | validate 차단 (`\|\|` falsy — 0은 유효 공시지가 아님) |
| **C7** | **OFF(ON→OFF 전환)** | **빈값** | **6,216,000 잔존** | **통과 = 6,216,000** — PHD OFF는 phd 필드를 지우지 않는다(`AssetMajor:146-151`이 `usePreHousingDisclosure`·`useEstimatedAcquisition`만 patch). 취득측(`:270`)이 이미 PHD 게이트 없이 동일 동작 → **대칭 유지**. 동일 필지 단가라 수치상 정당. (게이트를 넣으려면 4축 전부에 `usePreHousingDisclosure &&` 필요 → 취득측 회귀 유발, 비권장) |

취득측 대조군(회귀 없어야 함): `mixedAcqLandPricePerSqm || phdLandPricePerSqmAtAcq || derivePre1990...`

---

## 5. 작업 순서 — **PR 2개로 분리**

P2는 로직 변경이라 anchor로 검증되고 사용자 실피해를 즉시 해소한다. P1은 순수 시각 재배치인데 P1-b(섹션 번호)로 위험이 드러났다 → **회귀 격리·리뷰 난이도 모두 분리가 유리**.

### PR ① — P2 fallback 대칭화

1. **Pre-Do anchor** — C3를 재현하는 실패 테스트 **먼저** 작성·실행 (`feedback_pre_anchor_verification`).
   - verify: C3가 현행 코드에서 **실패**하는 것을 확인. 특히 **자동합계 "—"** 가 실패로 잡히는지 (입력칸만 검사하면 `:70` 누락을 놓친다)
2. 5축 구현 — 파생(`:70`·`:53`) → 표시(`:257`·`:160`) → API(`:152`) → validate(`:335`) → 사이드바(`:481`). 전부 `||`, `?? 0` 제거
3. verify: C1~C7 전부 통과 · 취득측 대조군 무회귀
4. 게이트: `npx tsc --noEmit` · `npm run lint` · `npm test`
5. **차단 validation 완화 → 전체 E2E 회귀** (`feedback_blocking_validation_full_e2e_regression`). 완화는 통과 범위를 넓히므로 위험은 낮으나 전량 확인
6. 브라우저: PHD ON에서 상가 양도칸 자동 표시 + **자동합계 박스 금액 표시** + Network 탭 `transferStandardPrice.landPricePerSqm`

### PR ② — P1 순서 통일

1. P1-a AssetMajor 스왑 4블록 + 면적 행·게이트 스왑
2. P1-b Legacy 스왑 + **`MixedUseStandardPriceInputs.tsx:45-46` 섹션 번호 스왑** + `MixedUseSection.tsx:122` 주석
3. verify: 배지가 ②취득 → ③양도로 정순 · 빈 박스 없음
4. 게이트 + E2E 전량

## 5-1. 테스트

**신규 anchor — PR ①** (`__tests__/components/mixed-use-transfer-landprice-fallback.anchor.test.tsx`)
- C3: PHD ON + mixed 빈값 → 상가 양도 input에 phd 값 표시 **AND 자동합계 박스에 금액**(대시 아님)
- C4 우선순위 · C7 잔존값

**신규 anchor — PR ①** (`__tests__/lib/calc/mixed-use-transfer-landprice-fallback.anchor.test.ts`)
- API 변환 C3에서 `transferStandardPrice.landPricePerSqm > 0` · validate C3 통과 / C5 차단

**신규 anchor — PR ②**
- ③ 상가 섹션에서 "취득시"가 "양도시"보다 DOM상 먼저
  - **⚠️ 반드시 ③ 상가 섹션 컨테이너로 스코프**할 것. `양도시`/`취득시` 텍스트가 AssetMajor에 각 3곳(`:119`·`:196`·`:255` / `:135`·`:206`·`:268`) 있고 ② 주택 sub-block이 DOM상 먼저 → 스코프 없는 `getAllByText("취득시")[0]`은 ② 주택을 잡는다
- Legacy 배지 번호: 취득=②, 양도=③

**기존 회귀 — DOM 순서 비의존 실측 완료** (근거 기록 — 재검증 비용 절감):
- `e2e/mixed-use-asset-major-commercial-modal.spec.ts:79,85` `.first()/.nth(1)` → `modal`(`:68` `getByRole("dialog")`) 스코프 ✅ / `:99-100` 고유 placeholder ✅
- `e2e/transfer-phd-building-stdprice-calculator.spec.ts` `.nth(0~2)` 다수 → 전부 `modal`(dialog) 또는 `phd`(phdSection) 스코프 ✅
- `e2e/mixed-use-{one-household-exempt,filing-form-4col,residence-single-source}.spec.ts` `.first()/.nth()` → 신고서 표(`[data-print-section="form-table"]`) 스코프, 기준시가 섹션 무관 ✅
- 대상 컴포넌트를 렌더하는 RTL 테스트는 `__tests__/components/mixed-use-commercial-land-price-year.anchor.test.tsx` **단 1개**, `getAllByText().length > 0`로 순서 비의존 ✅

**`transfer-p3-hybrid` 전제는 stale — 스왑 제약 아님**: 코드 주석 `MixedUseAssetMajorStdPrice.tsx:281`이 "기준시가 합계 문구는 E2E transfer-p3-hybrid 방어용"이라 하지만, `e2e/transfer-p3-hybrid.spec.ts:19`는 **감면·공제 단계**로 이동해 미분양 그룹만 다루며 겸용 기준시가 섹션에 진입하지 않는다. `:41 getByText(/기준시가 합계/).first()`가 잡는 것은 §98의6 폼의 "기준시가 합계 6억" 한도 텍스트로 보인다(cf. `__tests__/tax-engine/transfer-tax/unsold-hybrid-p3.test.ts:179`). 문구 유지는 무해하나 **제약으로 취급하지 말 것**. 주석 드리프트 정정(`feedback_engine_comment_vs_impl_drift`)은 **별건**.

---

## 6. 남은 판단 (구현 중 결정)

| # | 항목 | 메모 |
|---|---|---|
| 1 | 양도측 hint `(필수)` 추가 | `AssetMajor:263` 양도 hint는 `"상가부수토지 산정용"`(필수 표기 없음)인데 `validate:335`가 **양도측을 차단**한다. 취득측 `:276`엔 `"(필수)"` 있음. P2로 자동 표시되면 필수성 인지가 더 흐려짐 → 추가 검토. **PR ① 범위 내 선택** |

---

## 7. 확인 필요 (미검증)

1. **Vworld 2025년 데이터 가용성** — `app/api/address/standard-price/route.ts:258-266`은 해당 연도 데이터 부재 시 **전년도 재시도 없이 404**(연도 축 fallback 없음, 자산유형 축만 `:294-331`). 2025 데이터가 없다면 조회 버튼도 실패하지만 **본 계획의 유효성과 무관**(fallback은 조회와 독립 경로). API 실호출 확인 필요.
2. **취득측 `validate:403-408` 실제 차단 여부** — 선례로 인용했으나 도달 조건 미검증.

---

## 8. 범위 밖 (명시적 제외)

- 엔진 산식·`transfer-tax-mixed-use*.ts` 일체 — 무변경
- Vworld 라우트 연도 fallback 신설 — 별건
- `MixedUseAssetMajorStdPrice.tsx:281` 주석 드리프트 정정 — 별건
- PHD OFF에서 면적이 2번 표시(입력 FieldCard `:236-250` + 합계 행) — 기존 동작, 별건
- 다른 자산 블록(`GeneralBuildingBlock`·`CommercialBuildingBlock`)의 2시점 순서 — 무변경
