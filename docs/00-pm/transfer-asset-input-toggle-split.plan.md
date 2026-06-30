# 양도세 자산입력 — 단일 토글 분리 (함께양도 ↔ 지분분할) 계획서

> 작성: 2026-06-30 · 갱신: 2026-06-30 (2차 — D5 토글 B 위치 옵션 W 확정, 전 결정 완료)
> 상태: **Plan 확정 (D1~D5 결정 완료, Do 대기)** · 범위: UI 진입점 재배치 (엔진 무변경 "가벼운 버전")

## 0. 적용 정책 (policy-check 결과 — STEP 0)

| 정책 | 적용 지점 | 비고 |
|---|---|---|
| `three_state_optional_mode_toggle` ★★★ | §3-3·3-4 | 토글 상태 **derive 재계산 금지**, 명시 `useState`. 자기소멸 차단 |
| `dialog_data_discard_confirm` ★★ | §3-3 | 토글 OFF 형제 카드 제거 시 shadcn **Dialog** (window.confirm 금지) |
| `explicit_prop_mapping_strip` ★★★ | §5 | `onAddAsset`·`isFirst` 명시 전달 + grep 점검 (③ prop 명시 매핑) |
| `store_default_vs_ui_display_fallback` ★★★ | §2-3·2-6 | ✅ 실측: `OwnershipRatioInput` fallback 미사용 + `makeDefaultAsset` 100/100 정합 |

## 1. 목적

Step1 자산 목록 상단의 **단일 토글**이 성격이 다른 두 사건을 한꺼번에 켜는 구조를
**의미에 맞는 두 토글로 분리**한다.

- 현재 문구: `"함께 양도한 다른 자산이 있거나, 같은 물건을 지분별로 나눠 취득했나요?"`
  (`app/calc/transfer-tax/steps/Step1.tsx:74`)

| | 함께 양도한 다른 자산 | 같은 물건 지분별 취득 |
|---|---|---|
| 성격 | **양도** 사건 (다른 물건 N개, 한 날·한 계약) | **취득** 사건 (같은 물건 1개, 취득시기·원인만 다름) |
| scope | 자산 **목록 전체** (자산이 N개냐) | **개별 자산**의 취득 이력 |
| 고유 입력 | §166⑥ 안분방식(실가/안분) 토글 | 지분율(분자/분모) — 총액×지분율 자동 |

## 2. 현황 실측 (file:line — 검증 완료)

### 2-1. 단일 토글 + 동반 블록
- `Step1.tsx:30` — `hasBundledAssets = useState(() => form.assets.length > 1)` (length 기반 초기화)
- `Step1.tsx:32-43` — `handleBundledToggle`: ON → `makeDefaultAsset(2)` 추가 / OFF → `assets[0]`만 남김
- `Step1.tsx:45-56` — `updateAssets`: `assets.length > 1`이면 토글 자동 ON
- `Step1.tsx:69-82` — 토글 카드 (tone="sky")
- `Step1.tsx:85-127` — **§166⑥ 안분 블록**: 총 양도가액 + 총 양도비 + `BundledSaleModeToggle`
- `Step1.tsx:148-152` — `hasBundledAssets` 시 §166⑥ 안내 문구
- ✅ **`hasBundledAssets` 참조는 Step1.tsx 단독** (app/components/lib grep 0건) → 외부 컴포넌트·스토어 영향 없음

### 2-2. 두 시나리오의 구분 메커니즘 — **별도 플래그 없음**
현재 데이터·엔진은 "함께양도"와 "지분분할"을 **명시적으로 구분하지 않는다**.
오직 `ownership ratio`(분자<분모)의 자동 감지로만 갈린다.
- `transfer-tax-validate.ts:72-84` — *"지분 모드 자산이 하나라도 있으면 ratio 자동 적용으로 합계 검증 생략. 동일 물건 지분 단계취득은 ratio 합 = 100% 가정으로 시스템이 자동 분배."*
  - `anyFractional = assets.some(분자<분모)` → true면 actual 합계검증(`sum === contractTotalPrice`) 생략
- `transfer-tax-api.ts:635-665` — `assets.length > 1` → bundled 엔드포인트, `bundledSaleMode` 전달.
  지분 모드는 `contractTotalPrice × ratio` 자동 입력
- `CompanionSaleModeBlock.tsx:222-272` — `isFractional`(분자<분모 + contractTotalPrice) 시 안분 키 입력 면제, `FractionalAutoSalePriceCard`(총액×지분율) 표시

### 2-3. 지분율 위젯 현재 위치 — ① 기본정보 (전 자산종류)
- `AssetSectionBasic.tsx:371` — `OwnershipRatioInput` (① 기본정보 섹션). **assetKind 조건 없이 항상 렌더**
- `AssetSectionBasic.tsx:383-399` — 지분 모드 시 "100% 기준 입력" amber 안내

### 2-4. ③ 취득정보의 인접 토글 `parcelMode` (D1 공존 대상)
- `AssetSectionAcquisition.tsx:64-106` — `"취득시기 상이 (환지·합병 등 다필지)"` 토글
  - `asset.parcelMode` + `asset.parcels[]` **자산 카드 내부 중첩 배열** (`ParcelListInput`이 ③ 안에 인라인 펼침)
  - **토지 전용** (`assetKind === "land"`), 소득세법 시행령 §162①6호
- ⚠️ 지분분할(주택 포함, 형제 자산 추가)과 **적용대상·데이터 계층이 다름** → D1: 통합 아닌 안내 구분 공존

### 2-5. 자산 추가 흐름 — `onAddAsset`은 현재 ①에만
- `CompanionAssetsSection.tsx:57-60` — `addAsset(patch)` → 형제 `assets[]`에 추가 (목록 레벨)
- `CompanionAssetCard.tsx:261` — `onAddAsset`을 **① 기본정보(AssetSectionBasic)로만** 전달 (증환지 `ReplotIncreaseFields`가 사용)
- `AssetSectionAcquisition`(③) 현재 props: `asset, onChange, transferDate, isNewConstruction, isPrimary, isOneHouseSingle` — **`onAddAsset` 없음** → 토글 B를 ③에 넣으려면 추가 전달 필요

### 2-6. 기본값·사이드바
- `calc-wizard-asset-factory.ts:81-83` — `makeDefaultAsset` ownership **100/100 보장** ✅ (단독 소유 기본)
- `calc-wizard-store.ts:364-371` — `computeTransferSummary`는 `contractTotalPrice` 사용, `hasBundledAssets` 미참조 → 사이드바 영향 없음 ✅

## 3. 설계 (가벼운 버전 — flat `assets[]` 유지)

### 3-1. 토글 A — "함께 양도한 다른 자산" (확정)
- **위치**: 자산 목록 레벨 (현 Step1 상단 유지). ②양도정보 카드 안은 계층 역전이라 배제
- **tone**: sky · **문구(안)**: `"같은 날 다른 부동산도 함께 파셨나요?"`
- **동반 블록**: §166⑥ 안분 블록(총양도가액 + 총양도비 + `BundledSaleModeToggle`)을 **이 토글 전용**으로 귀속
- ON 시: 다른 물건 자산 추가 (`makeDefaultAsset`, ownership 100/100 기본)
- **OFF + 형제 데이터 존재**: Step1에서 shadcn **Dialog 폐기확인**(토글 B와 동일 패턴, 정책 §0, 검토 #8). 확정 시 `assets[0]`만 남김

### 3-2. 토글 B — "같은 물건 지분별 분할 취득" ✅ 옵션 W 확정

**딜레마**: 사용자 요청은 "취득정보(③)에서 체크"인데, flat 모델에서 지분 취득분은 **형제 자산 카드**다.
즉 토글 B의 의미는 자산-수준(③)이지만 동작은 목록-수준(형제 추가)이라 계층이 어긋난다.
같은 ③ 안 `parcelMode`는 자산 내부에 인라인 펼침이라 펼침 방향도 다르다.

| 옵션 | 위치 | 동작 | 장점 | 단점 |
|---|---|---|---|---|
| **W ✅확정** | 첫 자산(`isPrimary`) ③ 취득정보에만 | ON → 형제 지분 카드 추가(`onAddAsset` ③로 전달), ownership 분자<분모 자동감지 | 사용자 요청("취득정보") 충족, 형제 카드엔 미표시로 중복 회피 | 첫 카드 ③이 목록에 형제 생성(약한 계층 점프, parcelMode와 동급) |
| Y | 목록 레벨 (토글 A 옆) | 동일 | 계층 완전 일치, 중복 0 | 사용자 "취득정보에서" 요청과 위치 어긋남 |
| Z | ③ 자산 내부 중첩(`parcels[]` 류) | 자산 안 지분취득분[] | parcelMode와 가장 일관 | **데이터 모델 변경 = 무거운 버전**, scope-out |

- ✅ **확정: 옵션 W** (사용자 결정 2026-06-30) — 첫 자산 ③ 취득정보. 형제 카드엔 미표시

### 3-3. 토글 B 동작 상세 (옵션 W 확정)
- **게이트**: **첫 자산(`idx === 0`)** ③ 취득정보에만 토글 B 렌더 (형제 카드 미표시).
  ⚠️ 코드의 `asset.isPrimaryForHouseholdFlags`(1세대1주택 판정용)와 **다른 개념** — 반드시 idx 기준 별도 prop(`isFirst`) (검토 #3)
- **상태**: 토글 B는 **명시 `useState`** 보관. `assets.some(분자<분모)` derive는 **초기화(세션 복원) 1회만**,
  렌더마다 재계산 금지 — three_state 자기소멸 차단 (정책 §0, 검토 #1)
- **ON**: `onAddAsset`으로 같은 물건 형제 1건 추가. ownership은 **자동 비율 주입 금지**(`no_silent_apportion_fallback`):
  토글 상태를 validate가 못 보므로(§9) **ownership 분자 빈칸**으로 추가 → validate "지분율 미입력 차단"으로
  단독(100/100)·미완성 모순 방지. 사용자가 분자<분모 직접 입력 (검토 #4·#9, §9 옵션 c)
- **OFF + 형제 데이터 존재**: shadcn **Dialog 폐기확인**(window.confirm 금지 — 정책 §0, 검토 #2).
  확정 시 `assets[0]`만 남김. 빈 상태면 즉시 OFF
- §166⑥ 안분 토글 **미노출** (지분율 자동). 단 총양도가액(`contractTotalPrice`)은 필요 → 입력란 노출 유지
- parcelMode와 ③ 공존: description으로 *"필지가 다름(환지·합병, 토지)"* vs *"지분이 다름(예: 60% 상속+40% 매매)"* 구분 (D1)
- **OwnershipRatioInput 노출**(Do 환류 — code-review Medium ①): 토글 B와 독립으로 **모든 자산 카드 ③에 항상 노출**(구버전 ① 동작 보존). 단독 단일 자산의 부분소유(공유지분 50% 단독 양도) 직접입력 경로 유지. fractional 전용 가드는 회귀라 제거.

### 3-4. 두 토글 상태 관리 (확정 — D4, three_state 정책 반영)
- flat `assets[]` 유지. **두 토글 모두 명시 `useState`** — 렌더마다 derive 재계산 금지(자기소멸·상호간섭 차단, 검토 #1)
  - **초기화 1회만**(세션 복원): 토글 B = `assets.some(분자<분모)`, 토글 A = `assets.length>1 && !B`
  - 이후 ON/OFF = `setState` + assets 조작 (현행 `handleBundledToggle` 명시 패턴 답습)
- ⚠️ **현행 `updateAssets` 자동 동기화 재설계 필수**(Step1:46-48): `length>1 → setHasBundledAssets(true)` 무조건 강제는
  토글 B 형제 추가 시 토글 A를 오작동 ON → **제거하거나 "어느 토글 소관인지" 명시 분기** (검토 #6)
- **상호배타 구현**(D2 혼재 미지원): 토글 A ON 중 토글 B는 `disabled`+사유, 역도 동일.
  flat `assets[]` 한 배열을 두 모드가 공유하므로 동시 ON 시 데이터 의미 모호 방지
- **"+ 자산 추가" 버튼 소관**(CompanionAssetsSection:99): **토글 A(함께양도) 전용** — 다른 물건 추가.
  토글 B(지분분할)는 ③ 취득정보 내부에서 같은 물건 지분분 추가로 분리 (검토 #11)

## 4. 결정 사항

| # | 쟁점 | 결정 |
|---|---|---|
| D1 | 토글 B ↔ 기존 `parcelMode` 관계 | ✅ **안내 문구로 구분, 공존** (통합 X) |
| D2 | 혼재 시나리오(지분분할+함께양도 동시) | ✅ **제외(scope-out)** — flat 모델 유지, 두 토글 상호배타 |
| D3 | `OwnershipRatioInput` ①→③ 이동 | ✅ 이동 (지분분할은 취득 사건, 토글 B와 같은 자리) |
| D4 | 토글 상태 derive vs 명시 state | ✅ 명시 `useState` (과도기 안정성) |
| D5 | 토글 B 위치 (옵션 W vs Y) | ✅ **옵션 W** — 첫 자산 ③ 취득정보 (사용자 결정) |

## 5. 변경 범위 (파일별 — Do 시 8지점 점검)

| 파일 | 변경 |
|---|---|
| `Step1.tsx` | 단일 토글 → 토글 A(목록레벨)로 축소. §166⑥ 블록을 토글 A 전용으로. 토글 B 상태(상호배타) 연동 |
| `asset-sections/AssetSectionAcquisition.tsx` | 토글 B 신설(옵션 W: **idx===0 게이트**) + `OwnershipRatioInput` 이식 + **`onAddAsset`·`isFirst` prop 신규 수신(명시 매핑 — `explicit_prop_mapping_strip` grep 점검)** + parcelMode 안내 구분 |
| `CompanionAssetCard.tsx` | `onAddAsset`·`isFirst`(idx===0)를 ③(AssetSectionAcquisition)에도 **명시 전달**(spread 아님 → 누락 시 침묵 strip). Dialog 폐기확인 local state 호스트 |
| `asset-sections/AssetSectionBasic.tsx` | `OwnershipRatioInput`·100% 안내 제거(③로 이동, D3) |
| `transfer-tax-validate.ts` | 분리 후에도 `anyFractional` 합계검증 분기 동작 보장 (회귀 방지) |
| `transfer-tax-api.ts` | **무변경 목표** (엔진 입력 동일). 변경 시 ④⑬⑭ 재점검 |
| `CompanionSaleModeBlock.tsx` | `isFractional` 자동감지 로직 유지 (무변경 목표) |

- **8지점 동기화**(components/calc/CLAUDE.md): ①폼타입·②initial·③normalize 무변경 / ④API 무변경 목표 /
  ⑤UI=핵심 변경 / ⑥사이드바 무변경(2-6) / ⑦결과 무변경 / ⑧validate=분기 보장
- **800줄 정책**: `AssetSectionAcquisition` 증가분 확인 → 초과 시 sub-component 추출 (토글 B 블록 분리)

## 6. 검증 계획

- **Pre-Do anchor**: 분리 전 현행 동작 캡처 후 분리 후 **동일 결과** 보장 (회귀 0)
  - (1) 함께양도 actual 합계검증 (sum === contractTotalPrice)
  - (2) 지분분할 ratio 자동안분 (총액×지분율, 합계검증 생략)
- **E2E**(`e2e/*.spec.ts`): 토글 A만 / 토글 B만 / 둘 다 OFF(단독) + **토글 A↔B 상호배타 비활성** + **OFF 시 Dialog 폐기확인**(취소→데이터 유지·확정→제거) 경로. 수동안내 금지(메모리 정책)
- **자기소멸 회귀 테스트**(검토 #1): 토글 B ON 클릭 직후 Switch가 ON 유지되는지 (derive였다면 즉시 OFF 복귀) — RTL 또는 E2E
- `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/transfer/` 통과
- 브라우저 수동: 폼→계산→결과, Network 탭 request body 동일성(엔진 입력 불변) 확인

## 7. Scope-out (이번 작업 제외)

- 자산 모델 중첩화(자산→취득분[], 옵션 Z) — 무거운 버전, 14지점+엔진 대공사
- 혼재 시나리오(D2)
- `parcelMode`(다필지) 토글 자체의 동작 변경 — 안내 문구 외 무변경
- 엔진 안분 로직(`bundled-sale-apportionment`) 변경

## 8. 미확인 → 해소 결과

- [x] `hasBundledAssets` 참조 전수 → **Step1.tsx 단독** (외부 영향 0)
- [x] 사이드바 `computeTransferSummary` → `hasBundledAssets` 미참조 (영향 없음)
- [x] `makeDefaultAsset` ownership 기본값 → **100/100 보장**
- [x] `onAddAsset` 흐름 → 현재 ①에만, ③ 전달 필요(변경 범위 5에 반영)
- [x] **D5(토글 B 위치) → 옵션 W 확정** (첫 자산 ③ 취득정보)
- [x] 토글 OFF 시 형제 카드 제거 → **Dialog 폐기확인 적용** (정책 §0, §3-1·3-3, 검토 #2·#8)
- [ ] (Do 직전) legacy sessionStorage 혼재 데이터(지분분할+함께양도, 현행 미차단) normalize 처리 방침 (검토 #10)
- [ ] (Do 직전) `OwnershipRatioInput` ③ 이동 시 `AssetSectionExpense.tsx:9`의 `isFractionalMode` import 경로(`../OwnershipRatioInput`) 정합 — 컴포넌트 파일은 유지, 렌더 위치만 이동이라 import 불변 예상이나 실측
- [ ] (Do 직전) **validate ↔ 토글 상태 단절** 해소 방식 확정 (STEP 10 발견 — 아래 §9)

## 9. validate ↔ 토글 상태 정합 (STEP 10 발견 — 통합비교)

**모순**: `collectStepIssues(step, form)`·`validateStep(step, form)`은 **form-only**
(실측 `transfer-tax-validate.ts:42·244`, 호출부 `TransferTaxCalculator.tsx` 188·208·352·751·763 등 7곳 `formData`만 전달).
토글 B는 컴포넌트 local `useState`라 validate가 "토글 B ON인데 단독(100/100)"을 **알 수 없음**.

| 옵션 | 방법 | 평가 |
|---|---|---|
| **(c) ✅확정** | 토글 B ON 시 ownership을 **미완성(분자 빈칸)**으로 형제 추가 → validate "지분율 미입력 차단". ownership 단일진실, 토글 상태 불필요 | 시그니처·form 무변경. three_state 정책 정합 |
| (a) | `collectStepIssues`에 토글 상태 인자 추가 | 호출부 7곳 변경, 순수성 저하 |
| (b) | 토글 B 상태 form 필드 승격 | boolean 이중진실(three_state 정책 주의) |

- **확정: 옵션 (c)** — 토글 B 경로는 `makeDefaultAsset` 100/100 대신 **ownership 분자 빈칸** 추가.
  validate에 "형제 존재 + 분자<분모 미충족(빈칸/100·100) 시 지분율 입력 차단" 추가 (⑧ 지점)
- **Do 직전 실측**: 현재 `transfer-tax-validate.ts`에 ownership 빈칸 검증 존재 여부
