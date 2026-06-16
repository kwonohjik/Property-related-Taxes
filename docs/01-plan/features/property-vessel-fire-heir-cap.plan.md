# 재산세 후속 갭 3건 작업 계획서 — 선박 소방분 · 상속 주된상속자 지분판정 · 세부담상한 UI 검증

> **작성일**: 2026-06-16
> **worktree**: `.claude/worktrees/property-vessel-heir-cap` (branch `feat/property-vessel-heir-cap`, slot 1 → dev 3001 / e2e 3101)
> **상태**: Plan (Do 미착수)

## 0. 개요 · 조사로 드러난 사실

당초 3개 작업으로 요청되었으나, **착수 전 실측 조사 결과 작업 3은 이미 완전히 구현돼 있음**을 확인했다. 따라서 실제 구현 대상은 **작업 1·2** 두 건이고, 작업 3은 "구현 완료 검증 + 선택적 후속"으로 다룬다.

| 작업 | 당초 분류 | 조사 후 실제 상태 | 계획 |
|---|---|---|---|
| **A-1 선박 소방분(지역자원시설세)** | 미구현 | **진짜 미구현** — 선박은 0 고정, 법령상 과세 대상 확정 | 구현 |
| **A-2 상속 "주된 상속자" 지분 자동판정** | 불완전 | **진짜 미구현** — `heirs[0]` fallback + UI hint 드리프트 | 구현 |
| **A-3 세부담상한 전년도 세액 UI 입력** | 부분 미지원 | **기본 UI 구현 완료** — Step3 위젯·14지점 연결, §118 단서(직접입력)만 지원 | **§118 본문 정밀 재산정 후속 구현(확정)** |

## 1. 법령 근거 (KoreanLaw MCP 검증 완료 — 2026-06-16)

| 조문 | MST | 핵심 내용 | 검증 |
|---|---|---|---|
| 지방세법 §146③1호 | 282559 | "**건축물 또는 선박**의 가액 또는 시가표준액을 과세표준으로" 6구간 초과누진 | ✅ 본문 확인 |
| 지방세법 §146③2호·2의2호 | 282559 | 화재위험 **건축물**에 ×2/×3 (선박 미포함) | ✅ "건축물"만 명시 |
| 지방세법 §146④ | 282559 | 제3항 건축물·선박 = §104 2·3·5호. 과세표준 = §110 가액/시가표준액 | ✅ 선박 = §104 5호 |
| 지방세법 §107②2호 | 282559 | 상속 미등기 + 사실상소유자 미신고 → "행정안전부령으로 정하는 **주된 상속자**" | ✅ 위임 확인 |
| 지방세법 시행규칙 §53 | 282705 | 주된 상속자 = **민법상 상속지분 최대자**, 동률이면 **연장자** | ✅ 본문 확인 |
| 지방세법 §122 | 282559 | 비주택 직전연도 세액상당액 150% 상한, **주택 제외(단서)** | ✅ 본문 확인 |
| 지방세법 시행령 §118 | 286395 | "직전연도 세액상당액" = 직전연도 법령·과세표준 재산정. **단서: 납세자·현황 동일 시 직전연도 실제 과세액** | ✅ 본문 확인 |

---

## 2. 작업 A-1 — 선박 소방분(지역자원시설세) 산출 (§146③)

### 2.1 배경
지방세법 §146③1호는 **건축물 또는 선박**을 소방분 지역자원시설세 과세대상으로 명시한다. 현재 엔진은 `objectType === "vessel"`에 대해 소방분을 **0으로 고정**하여 법령상 과세 누락이 발생한다. (항공기는 §146④이 "§104 2·3·5호 = 건축물·선박"만 열거하므로 소방분 비대상 → 현 0 유지가 정확하다.)

### 2.2 현재 동작 (실측)
- `lib/tax-engine/property-tax-surtax.ts:108-112` — `baseFireTax` 분기:
  ```
  objectType === "building"  → calcRegionalResourceTax(publishedPrice)
  objectType === "housing" && housingFireServiceTaxBase != null → calcRegionalResourceTax(housingFireServiceTaxBase)
  else → 0          // ← vessel/aircraft/land 모두 0
  ```
- `lib/tax-engine/property-tax-surtax.ts:114-116` — 화재위험 중과 배율은 `objectType === "building"`일 때만 적용(주택·선박 ×1).
- 결과 노출 필드: `PropertySurtaxDetail.regionalResourceTax` (이미 존재 — vessel도 자동 노출됨).
- 호출부: `lib/tax-engine/property-tax.ts:726-734` (Step 4 부가세 합산). vessel/aircraft도 `calcSurtax()`를 거치므로 분기만 추가하면 결과 조립 자동 반영.

### 2.3 수정 지점
1. **`property-tax-surtax.ts:108-113`** — `baseFireTax` 분기(else 0이 113행)에 `objectType === "vessel"` 추가:
   - 과세표준 = 선박 시가표준액 = `publishedPrice` (§146④ — building과 동일 경로)
   - 세율 = `calcRegionalResourceTax(publishedPrice)` (6구간 표 공유)
   - 화재위험 중과는 추가하지 **않음** (배율 ×1 유지 — §146③2호 "건축물" 한정).
2. **`property-tax-surtax.ts:114-115` 게이트** — `fireHazardMultiplier`는 `objectType === "building"` 한정 유지(vessel ×1). 주석으로 "vessel 중과 미적용" 명시.
3. **`property-tax-surtax.ts:137`** — `if (objectType === "building")` 근거 push를 vessel 포함으로 확장(`building`·`vessel` 모두 `PROPERTY.REGIONAL_RESOURCE_TAX` push). 단 138행 화재위험 근거(`FIRE_HAZARD_SURCHARGE`)는 building 한정 유지.

### 2.4 산식 anchor (Pre-Do 우선 작성)
선박 시가표준액 = 예) 50,000,000원 가정 시 §146③1호 6구간:
- 39,000,000 초과 64,000,000 이하 구간 → `24,100 + (50,000,000 − 39,000,000) × 10/10,000`
- = `24,100 + 11,000,000 × 0.001` = `24,100 + 11,000` = **35,100원**
- 화재위험 중과 없음(×1). 지방교육세(소방분 비대상 — 본세 20%만 별도).
- **anchor 1 (세액)**: `objectType: "vessel"`, `publishedPrice: 50_000_000` → `result.surtax.regionalResourceTax === 35_100`
- **anchor 2 (근거)**: 동일 입력 → `result.legalBasis`(surtaxResult.legalBasis가 `property-tax.ts:735`에서 합류)에 `PROPERTY.REGIONAL_RESOURCE_TAX` 포함 (현재 `surtax.ts:137` building 한정 push라 vessel 누락 → 함께 실패해야 함)
- 회귀 가드: 동일 입력으로 **현재 코드는 `regionalResourceTax === 0`·근거 미포함** → 두 anchor 모두 먼저 실패해야 함(Pre-Do 검증).

### 2.5 14지점 영향
입력 필드 신규 추가 **없음**(publishedPrice·objectType 모두 기존). 엔진 내부 분기만 변경 → 타입·Zod·폼·API·validate 무변경.
**결과 표시(⑦) — 실측 확인 완료(추가작업 불필요)**: `PropertyTaxResultView.tsx:516-543`은 `surtax.regionalResourceTax > 0`이면 표시하고, `fireHazardMultiplier`·`housingFireServiceTaxBase`가 없는 vessel은 else 분기(`:542-543`)로 라벨 "지역자원시설세"로 **자동 표시**됨. (vessel 전용 라벨 분기 추가는 선택 — "지역자원시설세(선박분)" 정도 개선 가능)

### 2.6 테스트
- `__tests__/tax-engine/property/` 신규 anchor 1건(2.4) + 항공기는 0 유지 회귀 1건.
- E2E: 선박 과세대상 선택 → 소방분 표시 (기존 `e2e/property-fire-hazard-surcharge.spec.ts` 패턴 참고).

### 2.7 난이도 — **낮음** (엔진 1파일, 입력 변경 없음)

---

## 3. 작업 A-2 — 상속 "주된 상속자" 지분 자동판정 (§107②2호)

### 3.1 배경 · 드리프트
- 시행규칙 §53: 주된 상속자 = **민법상 상속지분 최대자 → 동률 시 연장자**.
- 현재 엔진(`property-taxpayer.ts:213-235`)은 `heirs[0]`(배열 첫 원소)을 무조건 주된 상속자로 선택 — 지분·나이 미반영.
- **드리프트**: `Step0.tsx:344` hint가 이미 "§107②2호 — 주된 상속인(**지분 최대자**)을 납세의무자로 설정"이라 **안내하지만 엔진은 그렇게 동작하지 않는다.** UI 약속 ↔ 엔진 동작 불일치 해소가 본 작업의 핵심 동기. (memory `feedback_engine_comment_vs_impl_drift` · `feedback_ui_engine_dual_truth_avoidance`)

### 3.2 현재 타입 (실측)
- `lib/tax-engine/types/property.types.ts:185` — `heirs?: string[]` (성명만)
- `lib/tax-engine/types/property-object.types.ts:198` — `heirs?: string[]`
- `lib/validators/property-input.ts:155` — `heirs: z.array(z.string()).optional()`
- `components/calc/property/shared.ts:148` — 폼은 `heirsText: string`(쉼표 구분), `shared.ts:442-446`에서 split → `string[]`
- 입력 UI: `Step0.tsx:343-350` "상속인 목록" 텍스트 입력 (성명만)

→ **지분·나이 정보 자체가 데이터 모델에 없음.** 자동판정하려면 타입 확장이 선행 필수.

### 3.3 타입 확장 (옵션 A 확정 — §6)
**엔진 타입** (`property.types.ts:185` · `property-object.types.ts:198` 2곳):
```ts
heirs?: Array<{ name: string; shareRatio?: number; birthDate?: string }>
```
- `shareRatio`·`birthDate`는 **optional** — 미입력 시 현행 `heirs[0]` fallback 유지(회귀 0).
- `determineTaxpayer` Pick(`property-taxpayer.ts:86`)은 `"heirs"` 포함 → 타입 자동 전파. 단 본문 `heirs[0]`(`:222`)는 `.name` 접근으로 변경 필요.

**폼 레이어 입력 모델** (검토 #2 정정 — 누락 보완):
- 현행 폼은 `heirsText: string`(쉼표 구분, `shared.ts:148`). 지분·생년을 담을 수 없음.
- 결정: 폼을 **행 기반 배열**로 전환 — `heirs: Array<{ name; shareRatioText; birthDate }>` (UI 입력은 string, API 변환 시 number/ISO로 파싱). `heirsText` 단일 문자열은 폐기 또는 마이그레이션(③).
- 자동 균등분배 금지(memory `feedback_no_silent_apportion_fallback`): 지분 미입력은 fallback+경고, 자동 계산 안 함.

### 3.4 판정 로직 (시행규칙 §53)
```
지분 정보가 충분(모든 heir에 shareRatio 존재):
  1) shareRatio 최대자 선택
  2) 최대자 복수(동률) → birthDate 최소(가장 이른 생년 = 연장자)
  3) birthDate도 동률/부재 → heirs[0] fallback + warning
지분 정보 불충분(일부/전부 미입력):
  → heirs[0] fallback + warning ("상속지분 미입력 — 첫 상속인을 주된 상속자로 처리")
```
- 재사용: `property-taxpayer.ts:241-243` 공유재산 `maxShareOwner` reduce 패턴 동형 적용.
- **자동 균등분배 금지**(memory `feedback_no_silent_apportion_fallback`): 지분 미입력 시 민법 법정상속분 자동계산은 **범위 외**. 미입력은 fallback + 경고로 처리(차단 아님 — 기존 동작 보존).

### 3.5 14지점 매핑 (heirs 타입 확장 시)
| # | 지점 | 파일 | 변경 |
|---|---|---|---|
| ① 폼 상태 | `components/calc/property/shared.ts:148` | `heirsText: string` → `heirs: {name; shareRatioText; birthDate}[]` 행 기반 |
| ② initial | `shared.ts:197` | `heirsText: ""` → `heirs: []` |
| ③ normalize | `shared.ts` (Step0 `:266` `heirsText:""` 리셋도) | sessionStorage 마이그레이션: legacy `heirsText`(string) 감지 → 행 배열 승급(성명만, 지분·생년 공란) |
| ④ API 변환 | `shared.ts:442-446` | split 로직 → 행 배열을 `{name, shareRatio?, birthDate?}[]`로 빌드(공란 필드 생략) |
| ⑤ UI 위젯 | `Step0.tsx:343-350` | 단일 텍스트 → 행 추가/삭제 UI(성명+지분+생년 `DateInput`). hint "지분 최대자" 문구는 엔진 정합 후 유지 |
| ⑦ 결과 카드 | `PropertyTaxResultView` | 주된 상속자 판정 근거(지분/연장자) 표시(선택) |
| ⑧ validate | `shared.ts:217~` · `property-input.ts:155` | Zod `z.array(z.object({...}))`. 지분은 **전원 입력 시에만** 0~1·합계≤1 검증(하나라도 미입력 = §3.4 fallback 대상 → 검증 스킵). **UI 통과↔validate 동일 fallback**(지분 미입력 허용 — 차단 아님) |
| 엔진 | `property-taxpayer.ts:86`(Pick), `:213-235`(판정), `:222`(`heirs[0]`→`.name`) · types 2곳(`property.types.ts:185`·`property-object.types.ts:198`) | 판정 로직 + 타입 + 본문 접근 변경 |

### 3.6 anchor (Pre-Do 우선)
- 3인 상속, 지분 {A:0.5, B:0.3, C:0.2} → 주된 상속자 = A
- 동률 {A:0.4(1970년생), B:0.4(1965년생), C:0.2} → 연장자 B
- 지분 미입력 → heirs[0] + warning (현행 동작 보존 회귀)

### 3.7 난이도 — **중간** (타입 확장 + 14지점 + 마이그레이션)

---

## 4. 작업 A-3 — 세부담상한 §118 본문 정밀 재산정 (§122 · 시행령 §118)

### 4.1 기본 UI는 이미 구현 완료 (실측 — 신규 구현 불필요)
현행은 시행령 §118 **단서**(납세자·현황 동일 시 직전연도 실제 과세액 직접 입력) 방식이 완비됨:
- `components/calc/PropertyTaxForm.tsx:19,227` — `Step3` import·렌더 확인.
- `components/calc/property/Step3.tsx:33-51` — 비주택일 때 "전년도 재산세 납부액" `CurrencyInput` + §122 `LawArticleModal`. 주택이면 §122 단서 안내(미적용).
- 14지점 전부 연결 확인:
  - ① 폼: `shared.ts:120` `previousYearTax: string` / ② initial `shared.ts:180 ""`
  - ⑧ validate: `shared.ts:217-223` (선택 입력 형식 검증)
  - ④ API 변환: `shared.ts:394-398` (주택 제외, 값>0만 전송)
  - 타입: `property.types.ts:110` `previousYearTax?: number` / Zod `property-input.ts:60-65`
  - 엔진: `property-tax.ts:346-392` `applyTaxCap(calculatedTax, objectType, previousYearTax)` — 주택 배제·미입력 시 경고
  - ⑦ 결과: `PropertyTaxResultView.tsx:440,480-483` (직전연도 상당액·상한율 표시)

### 4.2 후속 작업 (사용자 확정): §118 **본문** 정밀 재산정 추가
현재 입력값 `previousYearTax`는 사용자가 직접 넣은 "직전연도 실제 부과세액"으로, §118 1호 가목·2호 가목 **단서**(납세자·현황 동일)에 해당한다. 후속으로 §118 **본문**(직전연도 법령·과세표준으로 세액상당액 재산정)을 모드로 추가한다.

### 4.3 v1 구현 범위 / 범위 외 (법령 정밀도 vs 입력 부담 균형)
**v1 구현 (기본형 — §118 1호 가목 본문 + 2호 가목 본문 + 3호)**:
- 입력: 직전연도 과세표준(또는 직전연도 시가표준액·공시가격) → 직전연도 표준세율로 세액상당액 재산정.
- 3호 반영: 비과세·감면·가감세율(§111③)·세율특례(§111의2)가 당해연도에 적용/미적용이면 직전연도에도 동일 적용/미적용으로 간주.
- 대상: **비주택만**(§122 단서 — 토지·건축물·선박·항공기).

**v1 범위 외 (명시적 제외 — 직전연도 "가상 현황" 재구성 필요)**:
- 1호 나목(분할·합병·지목변경·신규등록·등록전환), 다목(과세대상 구분 변경), 라목(정비사업 멸실 토지 건축중 3·5년 의제)
- 2호 나목(신축·증축), 다목(용도변경), 라목(유사주택 비교)
- 4호(§111의2 특례 → 당해 9억 초과 전환)
→ 각 케이스는 직전연도 토지/건물 현황을 별도 재구성해야 하므로 계산기 단일 화면 입력으로 부적합. 후속 별도 검토.

### 4.4 입력 모델 · 모드 토글
- `Step3.tsx`에 `RadioCardGroup` 모드 토글(비주택 시):
  - (a) **직전연도 실제 부과세액 직접 입력** (현행 `previousYearTax` — 기본, §118 가목 단서)
  - (b) **직전연도 과세표준으로 재산정** (§118 가목 본문) → 직전연도 과세표준 입력 노출
- 신규 입력 필드: `previousYearTaxBase?: number`(직전연도 과세표준) — 모드 (b)에서만.
- **3중 패턴**(memory `mirror-pattern`): 모드·필드는 타입·API 변환·validate 모두 동일 fallback. UI 통과 ↔ validate 차단 모순 금지(⑧).

### 4.5 직전연도 세율 데이터 (핵심 리스크)
정밀 재산정은 "직전연도 법령(세율)"이 필요하다. 재산세 표준세율은 역사적으로 안정적이나 주택 특례세율(§111의2)·과세표준상한 등은 개정 이력이 있다.
- **v1 단순화**: 직전연도 = 당해연도 표준세율 동일 가정(대부분 비주택 표준세율 불변). 세율 개정 연도는 경고로 안내.
- **정밀화(후속)**: 역사적 세율표를 `lib/tax-engine/data/`에 정적 상수로 분리(memory `feedback_historical_tax_tables`). 연도별 세율 매개변수화.

### 4.6 anchor (Pre-Do 우선)
- 모드 (b): 비주택(건축물), 당해 산출세액 = 1,000,000 / 직전연도 과세표준 입력 → 직전연도 세율 재산정 = 500,000 → 상한 = 500,000 × 150% = 750,000 → `determinedTax = min(1,000,000, 750,000) = 750,000`.
- 모드 (a): 현행 동작 회귀(직접 입력 500,000 → 750,000) 유지.
- 주택: 모드 무관 상한 미적용(§122 단서) 회귀.

### 4.7 14지점 영향 (모드 (b) 신규 필드)
①②③ 폼/initial/normalize(`shared.ts`), ④ API 변환, ⑤ Step3 모드 토글(RadioCardGroup)+직전 과세표준 입력, ⑧ validate + Zod(`property-input.ts`), 타입(`property.types.ts` `previousYearTaxBase?`·`taxCapMode?`).
**엔진(설계 §4 검토 #8 정합)**: `applyTaxCap` **시그니처 불변** — 재산정(`recomputePriorYearTax`)은 `calculatePropertyTax` 본문에서 선행 후 basisTax 주입. 호출처 **2곳**(`property-tax.ts:707` 메인·`:581` 토지 분리과세) 동일 적용. 종부세는 자체 `comprehensive-tax-helpers.ts:206` applyTaxCap 사용 → **무영향**.
⑦ 결과뷰(재산정 산식 표시).

### 4.8 난이도 — **중~상** (직전연도 세율 데이터 의존 + 모드 분기 + 14지점). A-1·A-2와 **별도 사이클** 권장.

---

## 5. 작업 순서 · 리스크

1. **A-1 먼저**(독립·저난이도·입력 변경 없음) → anchor → 엔진 1파일 → 회귀.
2. **A-2 다음**(타입 확장 파급 큼) → Pre-Do anchor → 타입 → 엔진 판정 → 14지점 → 마이그레이션 → E2E.
3. **A-3 정밀 재산정**(별도 사이클 — 난이도 중~상) → 직전연도 세율 데이터 방침 결정(§4.5) → 모드 토글 → anchor → 14지점.

**리스크**:
- A-2 heirs `string[]` → 객체배열 변경은 **sessionStorage 마이그레이션**(③) 누락 시 기존 저장 폼 깨짐. `normalize`에서 string[] 감지 → 객체배열 승급 필수.
- A-2 Zod/validate ↔ UI fallback 정합(⑧): 지분 미입력 통과 ↔ 엔진 fallback 일치(memory `feedback_validation_sync_8th_point`).
- 두 작업 모두 격리 worktree에서 `npx tsc --noEmit` + `npx vitest run __tests__/tax-engine/property/` 통과 후 ship.

## 6. 결정사항 (확정 — 2026-06-16 사용자 승인)

1. ✅ **A-2 타입 확장**: 옵션 A 확정 — `heirs?: { name: string; shareRatio?: number; birthDate?: string }[]`. 시행규칙 §53 완전 구현(지분 최대 → 동률 시 연장자).
2. ✅ **A-2 지분 미입력 정책**: fallback + 경고(현행 `heirs[0]` 보존, 자동 균등분배 금지 — memory `feedback_no_silent_apportion_fallback`).
3. ✅ **A-3**: §118 **본문** 정밀 재산정 후속 구현 확정. v1 = 기본형(1호 가목 본문 + 2호 가목 본문 + 3호), 나·다·라목·4호 = 범위 외(§4.3).

**구현 진입 시 남은 결정**: A-3 직전연도 세율 — v1 당해 세율 동일 가정 vs 역사 세율표 분리(§4.5).

## 7. Definition of Done

- [ ] A-1: vessel 소방분 anchor 통과 + 항공기 0 유지 회귀 + 결과뷰 표시
- [ ] A-2: 지분판정 anchor 3종 + 타입 14지점 동기화 + sessionStorage 마이그레이션 + UI hint 드리프트 해소
- [ ] A-3: §118 본문 재산정 모드 anchor + 모드(a) 직접입력 현행 회귀 + 주택 미적용 회귀 + 14지점
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/property/` 통과
- [ ] E2E(선박 소방분 · 상속 지분판정 · 세부담상한 재산정) green (`E2E_PORT=3101`)
- [ ] 브라우저 수동 확인 또는 미수행 명시
