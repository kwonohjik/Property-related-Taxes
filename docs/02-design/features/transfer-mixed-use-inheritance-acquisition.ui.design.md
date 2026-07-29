# 겸용주택 상속 취득가액 엔진 정합 — UI 설계

- **계획서**: [`transfer-mixed-use-inheritance-acquisition.plan.md`](./transfer-mixed-use-inheritance-acquisition.plan.md) (확정 — 재논쟁 금지, 본 문서는 UI 구체화만)
- **엔진설계**: `transfer-mixed-use-inheritance-acquisition.engine.design.md` (병행 작성 — 필드명 최종 정합은 그쪽과 교차 확인 필요, 본 문서 §7 표시)
- **작성일**: 2026-07-20
- **대상**: `components/calc/transfer/CompanionAcqInheritanceBlock.tsx` · `components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx` · `lib/calc/transfer-tax-api-mixed-use.ts` · `lib/stores/calc-wizard-asset-gb.ts`/`calc-wizard-asset-mixed-use.ts` · `lib/calc/transfer-tax-validate-asset.ts` · `components/calc/results/mixed-use/MixedUseResultCard.tsx`
- **실측 방법**: 아래 모든 file:line은 2026-07-20 직접 Read로 검증. 미검증 항목은 "확인 필요"로 명시.

---

## 0. TL;DR — 확정 UI 결정 5가지

| # | 결정 | 근거 |
|---|---|---|
| D1 | `acquisitionByInheritance`는 **신규 UI 토글이 아니다** — `asset.acquisitionCause === "inheritance"`에서 API 변환 시 100% 파생. 겸용주택도 이미 "취득 원인" 5버튼(`CompanionAcquisitionCauseSection.tsx:56-71`)이 렌더되므로 사용자는 이미 상속을 선택하고 있다 | 단일 소스 원칙 — 별도 토글은 dual-truth 위험만 추가 |
| D2 | dead 블록 게이팅은 **신규 prop 없이 `asset.isMixedUseHouse`에서 직접 파생** — `CompanionAcqPurchaseBlock.tsx:145` `const isMixedUse = !!props.asset?.isMixedUseHouse;` 기존 패턴 재사용 | asset은 이미 prop으로 전달됨(`CompanionAcqInheritanceBlock.tsx:34`) — prop 추가 불요 |
| D3 | override 입력(`housingInheritedValueOverride`/`commercialInheritedValueOverride`)은 **금액만**(시가·감정·매매사례 평가방법 select 재도입 안 함) | 평가방법 select(`PostDeemedInputs.tsx` 5옵션)는 겸용에서 dead였던 바로 그 복잡도 — 재도입은 Simplicity First 위반 |
| D4 | 엔진 §4-1의 단일 `inheritedNecessaryExpense`는 **주택분/상가분 2필드로 분리 권장**(`housingInheritedExpense`/`commercialInheritedExpense`) | 단일 필드로 받으면 UI/엔진 어느 쪽이든 주택·상가 안분을 해야 함 → 정책 #2(자동 안분 fallback 금지) 위반. **엔진 설계와 정합 필요** |
| D5 | §164⑦ 라벨 — 겸용 PHD 토글은 **이미 정정 완료**(코드베이스 전수 grep "§164②" 0건). 라벨 작업은 "취득시"→"상속개시일" 문구 치환만 남음 | `MixedUseAssetMajorStdPrice.tsx:134` 실측: `"취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 환산)"` — 이미 §164⑦ |

---

## 1. 8개 클라이언트 동기화 지점 매핑

| # | 지점 | 파일:라인 | 변경 내용 |
|---|---|---|---|
| ① | AssetForm 타입 | `lib/stores/calc-wizard-asset-gb.ts:197` 직후 삽입 (`GeneralBuildingFormSlice` — 기존 `mixedAcq*` 필드가 이미 이 파일에 선언됨, `AssetForm extends ... GeneralBuildingFormSlice`, `calc-wizard-asset.ts:55`) | 신규 4필드 추가 (§2) |
| ② | initial value | `lib/stores/calc-wizard-asset-mixed-use.ts:35-89` `MIXED_USE_DEFAULTS` `Pick<AssetForm, ...>` 확장 + 빈 문자열 디폴트 | §2 |
| ③ | normalize | `lib/stores/calc-wizard-asset-mixed-use.ts:117-154` `migrateMixedUseFields()` — `if (!a.xxx) a.xxx = ""` 4줄 추가 | §2 |
| ④ | API 변환 | `lib/calc/transfer-tax-api-mixed-use.ts` `buildMixedUsePayload()` — **명시 필드 매핑**(파일 자체 경고 주석 `:4` "신규 엔진 필드는 여기 추가하지 않으면 침묵 strip") | §5·§6 |
| ⑤ | UI 위젯 | `CompanionAcqInheritanceBlock.tsx`(dead 게이팅, §3) + `MixedUseAssetMajorStdPrice.tsx`(override 입력·라벨, §4) | §3·§4 |
| ⑥ | 사이드바 합계 | `lib/stores/transfer-per-asset-summary.ts:186-190` — **변경 불요**(§8에서 실측 확인: 이미 구조화 필드 `estimatedAcquisitionPrice`만 읽어 상속/환산 무관 자동 반영) | §8 |
| ⑦ | 결과 카드 | `components/calc/results/mixed-use/MixedUseResultCard.tsx:279-299·384-388` 라벨·산식 분기 + `MixedUseCalculationRoute.acquisitionConversionRoute`에 `"inheritance_direct"` 케이스(엔진 설계 §4-3 합의) | §9 |
| ⑧ | validation | `lib/calc/transfer-tax-validate-asset.ts:324-431`(`isMixedUseHouse` 블록) 내 상속 전용 하위 분기 추가 | §7 |

---

## 2. 신규 AssetForm 필드 명세

### 2-1. UI 폼 필드 (calc-wizard-asset-gb.ts에 추가)

`mixedAcqLandPricePerSqm: string;`(`:197`) 직후, `mixedIsMetropolitanArea: boolean;`(`:199`) 이전에 삽입:

```ts
// ── 상속 취득 겸용주택 — §163⑨ 취득가액 직접 산정 (엔진 정합, acquisitionByInheritance 파생) ──
/**
 * 상속개시일 주택분 신고가액 override (원, 문자열). 선택 입력.
 * 시가·감정·매매사례로 상속세 신고한 경우에만 입력. 미입력 시 mixedAcqHousingPrice(보충적평가)로 fallback.
 * acquisitionCause === "inheritance" 일 때만 UI 노출.
 */
mixedHousingInheritedValueOverride: string;
/**
 * 상속개시일 상가분 신고가액 override (원, 문자열). 선택 입력.
 * 미입력 시 (mixedAcqCommercialBuildingPrice + mixedAcqLandPricePerSqm×상가부수토지면적)로 fallback.
 */
mixedCommercialInheritedValueOverride: string;
/**
 * 상속(실가) 모드 주택분 실제 필요경비 — 자본적지출·양도비 (원, 문자열). 선택 입력.
 * 개산공제(§163⑥, 취득시 기준시가×3%) 대체 — 상속은 실지거래가액 의제라 개산공제 미적용(계획 §1-4).
 * 미입력 시 0 (엔진 §4-2 landAppraisalDed/buildingAppraisalDed → 0 처리와 별개로, 이 필드가 실제 차감액).
 */
mixedHousingInheritedExpense: string;
/** 상속(실가) 모드 상가분 실제 필요경비 (원, 문자열). 선택 입력. 위와 동일 축. */
mixedCommercialInheritedExpense: string;
```

> **`acquisitionByInheritance` 자체는 AssetForm 필드가 아니다** — §0 D1. `asset.acquisitionCause === "inheritance"` 에서 매번 파생(단일 소스). 저장하면 `acquisitionCause`와의 dual-truth 위험(예: 사용자가 취득원인을 상속→매매로 바꿔도 플래그가 안 바뀌는 stale 위험).

### 2-2. ② initial (`calc-wizard-asset-mixed-use.ts`)

`MIXED_USE_DEFAULTS`의 `Pick<AssetForm, ...>` 유니온에 4개 키 추가 + 객체 리터럴에 `""` 4줄 추가(기존 `mixedAcqLandPricePerSqm: "",` 패턴과 동일).

### 2-3. ③ normalize (`migrateMixedUseFields`)

```ts
if (!a.mixedHousingInheritedValueOverride) a.mixedHousingInheritedValueOverride = "";
if (!a.mixedCommercialInheritedValueOverride) a.mixedCommercialInheritedValueOverride = "";
if (!a.mixedHousingInheritedExpense) a.mixedHousingInheritedExpense = "";
if (!a.mixedCommercialInheritedExpense) a.mixedCommercialInheritedExpense = "";
```

기존 이력(신규 필드 추가 전 세션)은 `undefined` → 위 가드로 `""` 채움. 값 손실 없음(신규 필드라 마이그레이션 대상 legacy 값 자체가 없음).

---

## 3. dead 블록 게이팅 (계획 §5-1)

### 3-1. 케이스 매트릭스

| # | assetKind | isMixedUseHouse | acquisitionCause | 현재 동작 | 목표 동작 |
|---|---|---|---|---|---|
| G-1 | housing | **true** | inheritance | `CompanionAcqInheritanceBlock` 전체 렌더 — 자산구분·의제특례 입력 요구하지만 `buildMixedUsePayload`가 미소비(계획 §1-3, dead) | 헤더(상속개시일·피상속인취득일) + §154⑧3호 토글만 렌더, 자산구분·의제특례 숨김 |
| G-2 | housing | **true** | inheritance + `familyBusinessInheritance` 토글 ON | `FamilyBusinessInheritanceTransferSection`(`CompanionAcquisitionCauseSection.tsx:224-230`) 렌더 — §97의2④ 의제취득가액도 `buildMixedUsePayload`에 없음(실측: 4필드 `decedentAcquisitionPrice`/`inheritanceMarketValue`/`fbDeductionAppliedRate`/`inheritanceDate` grep 0건) → **추가 발견 dead 블록** | ToggleCard `disabled` + `disabledReason="겸용주택은 가업상속공제 의제취득가액 미지원(범위 밖)"` (계획 §7-5 "범위 밖" 정합) |
| G-3 | housing | false | inheritance | 정상(기존 동작, 변경 없음) | 변경 없음 |
| G-4 | land/building 등 | — | inheritance | 정상(겸용 아님, 변경 없음) | 변경 없음 |

> **G-2는 계획서에 명시되지 않은 추가 발견**(2026-07-20 실측). 계획 §5-1 "자산 구분·취득가액 의제 특례" 두 블록만 언급했으나, 동일 조건(`acquisitionCause === "inheritance"`, `buildMixedUsePayload` 미소비)의 세 번째 블록이 존재. 같은 근본원인이라 §5-1 범위에 포함 권장. 단, 이 블록은 `familyBusinessInheritance` 토글이 **기본 OFF**(opt-in)라 G-1보다 오도 위험이 낮음 — 완전 숨김이 아니라 `disabled`로 처리(사용자가 가업상속 시나리오임을 인지하되 겸용에서 미지원임을 명시).

### 3-2. 구현안 — prop 추가 없이 asset에서 직접 파생 (D2)

`CompanionAcqInheritanceBlock.tsx`는 이미 `asset: AssetForm` prop을 받는다(`:34`). `isMixedUseHouse`는 `AssetForm`의 필드이므로 **새 prop 불요** — `CompanionAcqPurchaseBlock.tsx:145`의 기존 패턴(`const isMixedUse = !!props.asset?.isMixedUseHouse;`)을 그대로 재사용:

```tsx
// CompanionAcqInheritanceBlock.tsx 상단에 추가
const isMixedUse = !!asset.isMixedUseHouse;
```

렌더 트리 변경(`:110-140`):

```
[변경 전]                                    [변경 후]
헤더(상속개시일·피상속인취득일)                헤더(상속개시일·피상속인취득일)         ← 유지
§154⑧3호 통산 토글 (housing만)                §154⑧3호 통산 토글 (housing만)         ← 유지
자산 구분 RadioCardGroup ──────────┐          {!isMixedUse && (                        ← 게이팅
InheritedAcquisitionDeemedSection  │            자산 구분 RadioCardGroup
  (pre/post 의제취득가액 입력)      │            InheritedAcquisitionDeemedSection
                                    │          )}
                                  항상 렌더    {isMixedUse && <겸용 안내 카드>}         ← 신규
```

### 3-3. ASCII 위젯 — 겸용 안내 카드 (신규)

`isMixedUse` 분기에서 자산구분·의제특례 대신 `<ToneCard tone="violet">` 렌더(components/calc/CLAUDE.md "신규 안내/섹션 카드는 ToneCard" 준수 — `Tone` 유니온에 `fuchsia` 없음, `CompanionAcqPurchaseBlock.tsx:290-308`의 구형 인라인 violet 카드는 ToneCard 표준화 이전 패턴이라 신규는 ToneCard로):

```
┌─ (violet) ──────────────────────────────────────────────────┐
│ 취득가액 — 겸용주택 상속개시일 평가액 자동 적용    [소령 §163⑨]│
│                                                                │
│ 겸용주택(주택+상가)은 상속개시일 현재 상증법 §60~66 평가액을   │
│ 취득가액으로 직접 사용합니다. 아래 ② 주택 기준시가 · ③ 상가    │
│ 기준시가 섹션의 "상속개시일" 입력에서 산정하므로, 이 화면의    │
│ 자산 구분·취득가액 의제 특례 입력은 표시하지 않습니다.         │
└────────────────────────────────────────────────────────────┘
```

Props: `<ToneCard tone="violet" title="취득가액 — 겸용주택 상속개시일 평가액 자동 적용" titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}>`.

### 3-4. FamilyBusinessInheritanceTransferSection (G-2)

`FamilyBusinessInheritanceTransferSection.tsx` 자체 `ToggleCard`(파일 79번째 줄 부근, 실측: `isOn = asset.familyBusinessInheritance !== undefined`)에 겸용 게이트 추가:

```tsx
<ToggleCard
  ...
  disabled={!!asset.isMixedUseHouse}
  disabledReason={asset.isMixedUseHouse ? "겸용주택은 가업상속공제 의제취득가액 미지원(범위 밖)" : undefined}
  checked={isOn}
  ...
/>
```

`MixedUseSection.tsx:53-60`의 `hasPartialUsageChange` 토글이 이미 `disabled={!asset.isMixedUseHouse}` + `disabledReason`으로 동일 패턴을 사용 중 — 새 패턴 발명 아님, 기존 컴포넌트 convention 그대로 적용.

---

## 4. 상속개시일 기준 라벨 명확화 + override 입력 (계획 §5-2)

### 4-1. §164⑦ 인용 상태 — 실측 결과 이미 정정됨

`grep -rn "§164②" components/ lib/` **전수 0건**(2026-07-20). 계획서가 지적한 "§164②" 오인용은 **겸용주택 UI에는 현재 존재하지 않는다**:
- `MixedUseAssetMajorStdPrice.tsx:134` ToggleCard title: `"취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 환산)"` — 이미 §164⑦
- `MixedUsePreHousingDisclosureSection.tsx:37-40` `LegalBadge()`: `legalBasis="소득세법 시행령 §164 ⑦"` — 이미 §164⑦

**확인 필요**: 계획서의 "이미지9" 스크린샷이 더 이전 버전이었거나, 인용 문제가 실제로는 **단일자산 흐름**(`HouseValuationSection.tsx:288-291`)에 있을 가능성. 실측 결과 그 파일은 `legalBasis="소득세법시행령 §164"` label=`"소령 §164⑤"`로 라벨링되어 있다(§164⑤=일반건물 환산 조문). §164⑦(주택 전용)이 정본이어야 하나, 실제로는 그 섹션 내부 "건물기준시가" 항목이 §164⑤ **준용**분(계획 §2 인용: "건물분 기준시가는 §164⑤ 준용")이라 섹션 헤더 배지에 §164⑤만 다는 것이 완전히 틀린 것은 아니다 — **다만 §164⑦(주택 전용 정본) 배지가 헤더에 없다는 점은 사실**. 이 파일은 `PostDeemedInputs.tsx` → `HouseValuationSection`(단일자산 흐름) 경로이며 **§3의 게이팅으로 겸용에서는 렌더되지 않으므로 본 작업 범위 밖**. 별도 이슈로 기록 권장(엔진 정합 아님, 단순 라벨 정합).

### 4-2. "취득시" → "상속개시일" 라벨 치환 (`MixedUseAssetMajorStdPrice.tsx`)

상속 취득 겸용주택은 취득시점 = 상속개시일이므로, `acquisitionCause === "inheritance"`일 때 "취득시" 문구를 "상속개시일"로 치환한다. 파생 상수:

```tsx
const isInheritance = asset.acquisitionCause === "inheritance";
const acqLabel = isInheritance ? "상속개시일" : "취득시";
```

치환 대상(실측 line, `MixedUseAssetMajorStdPrice.tsx`):

| line | 현재 텍스트 | 변경 |
|---|---|---|
| `:130` | `<p ...>취득시</p>` (주택 취득 sub-block 캡션) | `{acqLabel}` |
| `:134` | ToggleCard title `"취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 환산)"` | `` `${isInheritance ? "상속개시일" : "취득 당시"} 개별주택가격 미공시 (§164⑦ 3-시점 환산)` `` |
| `:164` | hint `"미공시 시 비워두세요 — 위 §164⑦ 토글 사용"` | 변경 없음(이미 시점 무관 문구) |
| `:207` | `<p ...>취득시</p>` (상가건물 취득 sub-block 캡션) | `{acqLabel}` |
| `:212` | placeholder `"취득시 상가건물 기준시가 (필수)"` | `` `${acqLabel} 상가건물 기준시가 (필수)` `` |
| `:258` | `<p ...>취득시</p>` (상가부수토지 공시지가 취득 sub-block) | `{acqLabel}` |
| `:267` | placeholder `"취득시 개별공시지가 /㎡"` | `` `${acqLabel} 개별공시지가 /㎡` `` |
| `:302` | `<span>취득 상가부수토지 기준시가 (자동)</span>` | `` `${acqLabel} 상가부수토지 기준시가 (자동)` `` (label prefix "취득"도 동일 축) |
| `:307` | `<span>취득 상가부분 기준시가 합계 (자동)</span>` | `` `${acqLabel} 상가부분 기준시가 합계 (자동)` `` |

**범위 밖(명시)**: `ThreePointStandardPriceInput.tsx:655,657`의 컬럼 헤더 `"취득시"`/`"양도시"`는 하드코딩된 공용 컴포넌트 내부 문자열이며, 겸용 PHD뿐 아니라 일반건물·상업용건물 §164⑤/⑥ 환산에도 공용된다. 이 컴포넌트를 상속 인지형으로 바꾸면 영향범위가 전 세목 3-시점 환산 위젯 전체로 확산(회귀 위험 큼) — **본 작업 범위 밖**. 대신 `MixedUsePreHousingDisclosureSection.tsx`에 상속 컨텍스트 안내 1줄 추가로 완화(§4-4).

### 4-3. override 입력 위젯 (계획 §7 열린 질문 #1 — 권장안 확정)

**권장**: override 입력 + 기준시가 자동 fallback(계획 자체 권장안 채택). 금액 단일 입력만(평가방법 select 재도입 안 함, §0 D3).

주택 섹션(② 주택 기준시가, `MixedUseAssetMajorStdPrice.tsx:129` "취득시" sub-block 최상단, PHD 토글보다 먼저 — UI 순서=계산 로직 순서: override가 있으면 PHD/보충적평가 둘 다 무시되므로 게이트 조건 먼저 배치):

```
┌─ 취득시(=상속개시일 시) ─────────────────────────────────┐
│ ┌─ (violet, isInheritance만) ─────────────────────────┐ │
│ │ 상속개시일 신고가액 override (선택)     [상증법 §60]  │ │
│ │ [                              ] 원                  │ │
│ │ 시가·감정·매매사례로 상속세 신고한 경우만 입력.        │ │
│ │ 미입력 시 아래 개별주택공시가격(보충적평가)을 자동 사용│ │
│ └───────────────────────────────────────────────────────┘ │
│                                                             │
│ [기존] ToggleCard §164⑦ 3-시점 환산 (미공시)               │
│ [기존] 개별주택공시가격 StandardPriceInput (PHD OFF 시)     │
└─────────────────────────────────────────────────────────┘
```

상가 섹션(③ 상가 기준시가, `:198` "상가건물 기준시가" 그리드 위):

```
┌─ (violet, isInheritance만) ─────────────────────────────┐
│ 상속개시일 신고가액 override (선택, 상가 전체)  [상증법 §60]│
│ [                              ] 원                       │
│ 미입력 시 아래 상가건물 기준시가 + 개별공시지가 합계를      │
│ 자동 사용                                                  │
└───────────────────────────────────────────────────────────┘
[기존] 상가건물 기준시가 (취득시/양도시 그리드)
[기존] 상가부수토지 개별공시지가 (취득시/양도시)
```

컴포넌트: `CurrencyInput`(`hideUnit` — FieldCard 밖 사용 시 CLAUDE.md 규칙) + `<ToneCard tone="violet">` 래핑. `placeholder`는 숫자 예시 금지 정책 준수(이미 위 문구는 설명형).

### 4-4. PHD 패널 상속 컨텍스트 안내 (범위 밖 완화)

`MixedUsePreHousingDisclosureSection.tsx` 헤더(`:102-109`) 아래에 `isInheritance` 조건부 1줄 안내 추가:

```tsx
{asset.acquisitionCause === "inheritance" && (
  <p className="text-caption text-violet-700">
    ※ 상속 취득 자산은 아래 &ldquo;취득시&rdquo; 열이 <b>상속개시일</b> 기준입니다.
  </p>
)}
```

`ThreePointStandardPriceInput`(§4-2 범위 밖) 내부 컬럼 헤더는 그대로 두되, 패널 진입 시 문맥을 안내하여 혼동을 완화. 저비용·저위험(공용 컴포넌트 미변경).

---

## 5. mirror-pattern 3중 패턴 (강제)

override → 기준시가 fallback은 **display prop + API/validate fallback** 3중 패턴을 따른다. `useEffect → store` 미러링 절대 금지.

| 계층 | 구현 | 근거 |
|---|---|---|
| **① UI display** | override 입력칸은 override 필드값만 표시(fallback 표시 안 함 — override는 "직접 입력" 전용, fallback은 아래 기존 필드가 이미 별도로 표시 중이므로 시각적 fallback 불필요) | override와 기준시가는 **다른 입력칸**(§4-3 위젯 — 같은 칸에서 fallback 표시하는 `mixedAcqLandPricePerSqm || phdLandPricePerSqmAtAcq` 패턴과 다름). dual-display 불요 |
| **② API 변환** | `buildMixedUsePayload`: `housingInheritedValue: parseAmount(primary.mixedHousingInheritedValueOverride) || undefined` — fallback은 **엔진이 수행**(엔진 input에 `housingInheritedValue`가 undefined면 엔진이 `acquisitionStandardPrice.housingPrice`로 fallback, 계획 §4-1 주석: "미제공 시 취득시 개별주택가격(보충적평가) 자동 사용") | UI가 아닌 **엔진이 fallback 소유** — UI는 override 유무만 전달(3중 패턴의 "API fallback"이 엔진 쪽으로 이동한 형태, 계획 §4-1 필드 설계 자체가 이 축) |
| **③ validate** | override 미입력이어도 `mixedAcqHousingPrice`(기존 필드)가 있으면 통과(§7) — API/엔진과 동일 fallback 인식 | ⑧ 정책 — UI 통과↔validate 차단 모순 방지 |

**핵심 차이점**: 기존 mirror-pattern 사례(`mixedAcqLandPricePerSqm || phdLandPricePerSqmAtAcq` 등, `MixedUseAssetMajorStdPrice.tsx:69-70`)는 **같은 의미의 두 필드가 UI 표시 단계에서 합쳐지는 축**이다. 본 건은 override가 **없으면 엔진이 이미 존재하는 다른 필드값을 그대로 재사용**하는 축이라 UI 표시 단계에서 합칠 필요가 없다(override 필드와 기존 필드가 화면에서 물리적으로 분리된 두 입력칸). **useEffect로 override 값을 기존 필드에 미러링하지 않는다** — 각자 독립적으로 store에 쓰고, 합치는 일은 엔진(②)에서만 일어난다.

---

## 6. 필요경비 실가 모드 (계획 §7 열린 질문 #3 — 권장 결정)

**계획서 §4-1의 단일 `inheritedNecessaryExpense`(자산 단위)는 UI 관점에서 채택 불가**로 판단, 분리 권장:

### 6-1. 왜 분리해야 하는가

정책 #2(자동 안분 fallback 금지, 본 세션 시스템 프롬프트 최상단 명시): "세무 입력 필드의 빈 값을 면적·시점비율로 자동 안분하지 말 것. 미입력은 validation 단계에서 명확한 오류로 차단." 단일 `inheritedNecessaryExpense` 필드를 받으면:
- **UI가 안분**해야 함(자산 단위 총액을 주택/상가로 나눠 엔진 두 파트에 전달) → 정책 위반.
- **엔진이 안분**해야 함(엔진 내부에서 면적·기준시가 비율로 나눔) → 계획 §4-2가 기술한 "필요경비 산식 라벨 분기"의 근거가 모호해짐(어떤 비율로 나눴는지 결과 카드에 산식으로 설명 불가 — CLAUDE.md "산식의 각 숫자 옆에 변수명 라벨" 요구와 충돌).

### 6-2. 권장안

`housingInheritedExpense?: number` / `commercialInheritedExpense?: number` 2필드로 분리(§2-1의 UI 필드와 1:1 대응). 각 필드는 해당 부분(주택/상가)의 실제 자본적지출·양도비 합계를 사용자가 직접 입력 — 안분 없음.

> **엔진 설계와 정합 필요**: 계획 §4-1 원문의 `inheritedNecessaryExpense?: number`는 이 권장안 반영 시 `housingInheritedExpense?: number` + `commercialInheritedExpense?: number`로 필드명·개수가 바뀐다. engine.design.md 작성 시 본 절 참조하여 최종 확정.

### 6-3. UI 배치

§4-3 override 입력 바로 아래, 같은 violet 카드 내부(또는 별도 amber 서브 카드 — "실제 필요경비"는 취득가액이 아니라 비용 항목이므로 톤 분리 고려):

```
┌─ (violet, isInheritance만) ─────────────────────────────┐
│ 상속개시일 신고가액 override (선택)          [상증법 §60] │
│ [                              ] 원                      │
│                                                            │
│ 실제 필요경비 — 자본적지출·양도비 (선택)      [§163⑨]    │
│ [                              ] 원                      │
│ 상속(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)│
│ 를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요│
└────────────────────────────────────────────────────────┘
```

hint 문구는 placeholder 숫자 예시 금지 정책 준수(설명형 텍스트).

---

## 7. Validation (⑧, `transfer-tax-validate-asset.ts`)

`isMixedUseHouse === true` 블록(`:324-431`) 내부, 기존 면적·양도시 필수값 검증(`:325-340`) 다음에 상속 전용 하위 분기 추가. **자동 안분 fallback 금지 정책**에 따라 override/기존 필드 어느 쪽도 없으면 명확한 오류로 차단(엔진에 0/undefined가 도달해 침묵 계산되는 것을 방지).

```ts
// (:340 이후 삽입 위치 — PHD 검증(:345) 이전)
if (asset.acquisitionCause === "inheritance") {
  // 주택분 — PHD ON이면 PHD 자체 필수 검증(:345-355)이 이미 상속개시일 개별주택가격을 커버 →
  // override는 항상 optional. PHD OFF일 때만 override||기존필드 필수.
  if (!asset.usePreHousingDisclosure) {
    const housingValue =
      parseAmount(asset.mixedHousingInheritedValueOverride) ||
      parseAmount(asset.mixedAcqHousingPrice);
    if (housingValue <= 0) {
      return `${label}: 상속개시일 주택분 평가액을 입력하세요. (신고가액 override 또는 개별주택공시가격)`;
    }
  }
  // 상가분 — PHD는 주택 전용(§164⑤ 준용은 건물분만), 상가는 항상 직접 입력 축.
  const commercialValue =
    parseAmount(asset.mixedCommercialInheritedValueOverride) ||
    (parseAmount(asset.mixedAcqCommercialBuildingPrice) > 0 &&
     parseAmount(asset.mixedAcqLandPricePerSqm) > 0
      ? 1 // 존재 플래그 — 실제 합계는 엔진이 재계산(dual-truth 회피, feedback_ui_engine_dual_truth_avoidance)
      : 0);
  if (commercialValue <= 0) {
    return `${label}: 상속개시일 상가분 평가액을 입력하세요. (신고가액 override 또는 상가건물 기준시가+개별공시지가)`;
  }
}
```

> **확인 필요 (기존 갭, 본 작업 범위 밖)**: 실측 결과 현재 `validate`는 **매매(purchase) 취득 겸용주택**에서도 `mixedAcqHousingPrice`/`mixedAcqCommercialBuildingPrice`/`mixedAcqLandPricePerSqm`의 필수 여부를 명시적으로 검증하지 않는다(`grep -n "mixedAcqHousingPrice" transfer-tax-validate-asset.ts` 0건, `mixedAcqCommercialBuildingPrice`/`mixedAcqLandPricePerSqm`은 `hasPartialUsageChange` 분기 내부에서만 검증됨, `:395-417`). 상속 분기는 위 코드로 이 갭 없이 엄격하게 검증되지만, **비상속(매매) 기본 경로는 여전히 느슨한 상태로 남는다** — 별도 이슈로 분리 권장(본 작업 스코프 아님, 엔진이 `MixedUseCalculationRoute.housingAcqPriceSource: "missing"` 케이스를 이미 갖고 있어 엔진 차원에서는 허용된 상태로 보임).

### 7-1. mixedHousingInheritedExpense/mixedCommercialInheritedExpense 검증

선택 필드이므로 필수 검증 없음. 다만 음수 방지(다른 금액 필드와 동일 — `CurrencyInput`은 음수 입력 UI 자체가 없으므로 별도 validate 불요, 기존 `mixedTransferHousingPrice` 등과 동일 취급).

---

## 8. 사이드바 (⑥) — 실측 결과 변경 불요

`lib/stores/transfer-per-asset-summary.ts:186-190`:

```ts
if (mixedResult && i === 0) {
  // 겸용주택: 주택+상가 환산취득가액 합(전용 필드, 라벨 파싱 아님).
  acqPrice =
    mixedResult.housingPart.estimatedAcquisitionPrice +
    mixedResult.commercialPart.estimatedAcquisitionPrice;
}
```

이 코드는 **`MixedUseHousingPart.estimatedAcquisitionPrice`/`MixedUseCommercialPart.estimatedAcquisitionPrice` 구조화 필드만 읽는다** — 그 값이 §97 환산으로 산출됐는지 §163⑨ 상속개시일 평가액 직접 산정으로 산출됐는지는 무관하게 자동 반영된다(계획 §4-3 "엔진이 산정에 쓴 단일 플래그에서 파생" 원칙과 정합 — 필드 자체는 안 바뀌고 산출 방식만 내부적으로 분기). 이미 별도 버그수정계획서(`mixed-use-sidebar-acq-preview.bugfix.plan.md`)로 이 배선이 완료되어 있음을 실측 확인(2026-07-19 작업, 코드에 이미 반영됨).

**결론**: ⑥ 지점은 **본 작업에서 코드 변경 불요**. 회귀 테스트로 결과 도착 후 사이드바 취득가액이 상속 케이스에서도 정상 표시되는지 확인만 하면 됨(§11 anchor).

`lib/stores/calc-wizard-store.ts:464-520`의 `computeTransferSummary`가 반환하는 `TransferSummary.mixedUse` 객체(입력 단계 프리뷰, 결과 도착 전용)는 애초에 취득가액 필드를 갖고 있지 않다(`housingRatio`/`residentialLandArea`/`commercialLandArea`/`housingTransferPrice`/`commercialTransferPrice`만) — 상속 여부와 무관하게 설계상 제외(라이브 프리뷰는 서버 rates 필요라 클라이언트 불가, 위 버그수정계획서 §4 "기각안" 참조). **변경 불요**.

---

## 9. 결과 카드 (⑦, `MixedUseResultCard.tsx`)

### 9-1. 라벨 분기

> **🔴 STEP 10 정정 (엔진 정본 반영)**: 엔진은 part-level `acqPriceSource`를 **미채택**(dual-truth 회피). 정본 = `MixedUseCalculationRoute.acquisitionConversionRoute ∈ {"inheritance_direct","inheritance_phd_max"}` + 최상위 `MixedUseGainBreakdown.acquisitionByInheritance` echo. **아래 표·코드의 `h.acqPriceSource === "inheritance_valuation"` 조건은 전부 `route.acquisitionConversionRoute`가 두 상속값 중 하나인지로 대체**한다. 또한 필요경비 echo `landInheritedExpense`/`buildingInheritedExpense`는 **엔진 미제공** — 상속 시 `buildingAppraisalDed`(필요경비 담김·`landAppraisalDed`=0) 재사용, 후보 표시는 `inheritedAcquisitionDetail`(reportedValue/standardPriceCandidate/selected). 계획 §4.5 참조.

(아래는 원안 — 위 정정 렌즈로 읽을 것:)

```tsx
const housingAcqLabel = h.acqPriceSource === "inheritance_valuation"
  ? "상속개시일 평가액(취득가액)"
  : "주택 환산취득가액";
```

| 위치(line) | 현재 | 상속 분기 |
|---|---|---|
| `:280` `label="주택 환산취득가액"` | 고정 | `housingAcqLabel`(위) |
| `:282-299` formula (§97 비율식) | `§97: 주택 양도가액 × (취득시/양도시 기준시가)` | `h.acqPriceSource === "inheritance_valuation"` 이면 `` `상속개시일 평가액(상증법 §60~66) ${fmtPlain(h.estimatedAcquisitionPrice)} — 취득당시 실지거래가액으로 의제 (소령 §163⑨)` `` |
| `:327,333` 토지/건물분 formula "개산공제 ... × 3%" | 고정 | 상속 시 `landAppraisalDed`/`buildingAppraisalDed`가 0으로 강제되므로(계획 §4-2), 산식 문구도 `` `양도가액 ${...} - 환산취득가액 ${...} - 실제 필요경비 ${fmtPlain(h.landInheritedExpense ?? 0)}` `` 형태로 교체(개산공제×3% 문구 제거 — floor()류 묵시 처리 원칙과 동일하게 "0으로 강제됨"을 산식에 노출하지 않고 실제 차감 항목만 표기) |
| `:385` `label="상가 환산취득가액"` | 고정 | 상가 동일 패턴 (`c.acqPriceSource`) |
| `:387` formula (§97 비율식) | 고정 | `` `상속개시일 평가액(상증법 §60~66) ${fmtPlain(c.estimatedAcquisitionPrice)} — 취득당시 실지거래가액으로 의제 (소령 §163⑨)` `` |
| `:398,404` 토지/건물분 formula | 고정 | 위 landAppraisalDed 동일 패턴 |

> **echo 필드 필요**: `landInheritedExpense`/`buildingInheritedExpense`(주택·상가 각 토지/건물분 실제 필요경비 배분값) 결과 타입에 없으면 산식에 정확한 숫자를 못 붙인다. `echo-field-pattern` 스킬 적용 권장 — 엔진 산식·계산 로직 변경 없이 결과에 optional echo 필드로 노출. **엔진 설계에 요청 필요**(§6-3 UI가 주택분/상가분 필요경비를 분리 입력받으므로, 엔진이 토지/건물 세분까지 추가로 나누는지, 아니면 부분 단위(주택/상가)까지만 반영하고 토지/건물 세분 표시는 "합산 표기"로 타협할지 확정 필요).

### 9-2. dual-truth 회피

`h.acqPriceSource`/`c.acqPriceSource`(단일 소스 플래그)에서만 라벨을 파생한다. `asset.acquisitionCause === "inheritance"` 같은 **폼 값을 결과 카드에서 재확인하지 않는다** — 계획 §4-3 "dual-truth 주의" 그대로 적용(엔진이 실제로 어떤 경로로 계산했는지와 폼 입력이 어긋나는 edge case, 예: 계산 후 폼을 되돌린 경우를 방지).

### 9-3. `calculationRoute.acquisitionConversionRoute`

`MixedUseCalculationRoute.acquisitionConversionRoute`(`types/transfer-mixed-use.types.ts:358`, 현재 `"section97_direct" | "phd_corrected"`)에 `"inheritance_direct"` 추가(엔진 설계 §4-3). 결과 카드 하단 "계산 경로" 설명 영역(파일 내 `calculationRoute` 참조부 — 정확한 렌더 위치는 `MixedUseResultCard.tsx` 800줄 전체 재확인 필요, 본 세션에서는 상단 258-414행 범위만 실측)에 다음 문구 매핑 추가:

```
"inheritance_direct": "상속개시일 평가액(상증법 §60~66)을 취득가액으로 직접 적용했습니다 (소령 §163⑨)."
```

---

## 10. 정책 준수 체크리스트

- [x] `ToggleCard`/`RadioCardGroup` — 신규 위젯 없음(기존 CurrencyInput override 입력만 추가, 톤 카드는 `ToneCard`)
- [x] `tones.ts` 단일소스 — `<ToneCard tone="violet">` 사용, 인라인 `bg-violet-*` 하드코딩 금지
- [x] 라벨 정본 클래스 — 신규 텍스트는 기존 `text-caption`/`text-xs`/`text-sm` 그대로 상속(치환만, 크기 변경 없음). `text-[Npx]` 미사용
- [x] `CurrencyInput` — override·필요경비 입력 모두 금액(원) → `CurrencyInput` + `parseAmount` (DecimalInput 아님 — 정수 원 단위)
- [x] `DateInput`/`DecimalInput` — 신규 날짜·소수 필드 없음(해당 없음)
- [x] `LandPriceLookupField` — 신규 공시지가 필드 없음(기존 필드 fallback만 사용, 해당 없음)
- [x] placeholder 숫자 예시 금지 — 위 모든 hint는 설명형 텍스트
- [x] UI 순서 = 계산 로직 순서 — override 입력을 PHD/보충적평가 입력보다 먼저 배치(엔진이 override 우선 적용 후 없으면 기존 값 fallback, §4-1 순서와 정합)
- [x] `useEffect → store` 미러링 금지 — override/필요경비 모두 onChange 직접 patch만 사용, 파생 미러링 없음(§5)
- [x] 자동 안분 fallback 금지 — 필요경비 2필드 분리(§6), validation에서 미입력 명확 차단(§7)

---

## 11. 테스트 계획 (UI anchor)

계획 §6 Pre-Do anchor(엔진 anchor)와 별도로, UI 레이어 anchor:

| anchor | 케이스 | 검증 |
|---|---|---|
| `UI-DEAD-GATE` | `isMixedUseHouse=true` + `acquisitionCause="inheritance"` | `CompanionAcqInheritanceBlock` 렌더 결과에 "자산 구분" RadioCardGroup·`InheritedAcquisitionDeemedSection` 부재, 겸용 안내 ToneCard 존재 |
| `UI-FB-DISABLED` | 동일 조건 + `familyBusinessInheritance` 토글 시도 | `FamilyBusinessInheritanceTransferSection`의 ToggleCard가 `disabled` |
| `UI-LABEL-SWAP` | 동일 조건 | `MixedUseAssetMajorStdPrice`에서 "취득시" 리터럴 부재, "상속개시일" 존재(주택·상가 섹션 모두) |
| `UI-OVERRIDE-API` | override 입력값 있음 | `buildMixedUsePayload()` 결과에 `housingInheritedValue`/`commercialInheritedValue` 정확 반영 |
| `UI-OVERRIDE-FALLBACK-API` | override 없음, `mixedAcqHousingPrice`만 있음 | `buildMixedUsePayload()` 결과에 `housingInheritedValue: undefined`(엔진이 fallback 수행 — UI는 undefined 전달만 확인) |
| `UI-VALIDATE-BLOCK` | 상속 + override·기존필드 모두 없음 | `validateAsset` 오류 반환("상속개시일 주택분 평가액을 입력하세요") |
| `UI-VALIDATE-PHD-EXEMPT` | 상속 + PHD ON + override 없음 | 주택분은 통과(§164⑦ 자체 검증이 커버), 상가분은 여전히 필수 |
| `UI-REGRESSION-PURCHASE` | `acquisitionCause="purchase"` (겸용) | 3-11 신규 분기 전부 미적용, 기존 동작 완전 불변 |
| `UI-SIDEBAR-INHERITANCE` | 계산 완료(상속 겸용) | `computeTransferPerAssetSummary` 결과 취득가액이 `housingPart+commercialPart estimatedAcquisitionPrice` 합과 일치(§8 — 변경 없는 기존 로직의 회귀 확인) |
| `UI-RESULT-LABEL` | 계산 완료(상속 겸용, `acqPriceSource="inheritance_valuation"` 가정) | `MixedUseResultCard` 렌더 텍스트에 "상속개시일 평가액(취득가액)" 존재, "환산취득가액" 부재(해당 부분만) |

---

## 12. 열린 질문 — 권장 결정 (계획 §7 대응)

| # | 질문 | 권장 결정 | 근거 |
|---|---|---|---|
| 1 | override 입력 UI 범위 | **override(금액만) + 자동 fallback**(계획 자체 권장안 채택, §4-3) | 평가방법 select 재도입은 dead였던 복잡도 재현(Simplicity First) |
| 3 | 필요경비 분리 vs 안분 | **주택/상가 2필드 분리**(§6, 계획 원안 대비 변경) | 정책 #2(자동 안분 금지) — **엔진 설계와 정합 필요**(§0 D4) |
| 5 | 가업상속공제(§97의2②)·공익수용(§164⑨1호) 조합 | **UI는 `disabled` 게이트만**(§3-4 G-2), 엔진 조합 로직 미구현 상태 그대로 노출 차단 | 계획 §7-5 "범위 밖, 회귀만 확인" — UI 차원에서 dead-input 트랩만 예방 |

---

## 13. 확인 필요 목록 (요약)

1. ✅ **해소(STEP 10, 계획 §4.5)**: 필요경비 2필드 분리 확정. 정본 명 = AssetForm `mixedHousingInheritedExpense`/`mixedCommercialInheritedExpense`, 엔진 input `housingInheritedExpense`/`commercialInheritedExpense`. override는 `mixed...ValueOverride`(→ 엔진 `housingInheritedValue`).
2. ✅ **해소(STEP 10)**: echo 필드 `landInheritedExpense`/`buildingInheritedExpense`는 **만들지 않음** — 엔진이 상속 시 `buildingAppraisalDed`(필요경비·land=0)를 재사용. 산식은 이 필드 + `inheritedAcquisitionDetail`로 구성.
3. ✅ **해소(STEP 10)**: part-level `acqPriceSource` **미채택**. 결과 카드는 `calculationRoute.acquisitionConversionRoute`(`inheritance_direct`/`inheritance_phd_max`)로 라벨 분기(§9-1 정정 note).
4. **`HouseValuationSection.tsx:290` §164⑤ 라벨**(단일자산 흐름, 겸용 아님) — §164⑦ 정본 배지 누락 가능성. 본 작업 범위 밖, 별도 이슈로 분리 권장.
5. **기존 검증 갭**(매매 겸용주택의 `mixedAcqHousingPrice`/`mixedAcqCommercialBuildingPrice` 필수성 미검증, §7 각주) — 본 작업 범위 밖, 별도 이슈로 분리 권장.
6. **`MixedUseResultCard.tsx`의 `calculationRoute` 렌더 정확 위치**(§9-3) — 800줄 파일 전체를 본 세션에서 다 읽지 않음(258-414행만 실측). Do 단계 진입 전 재확인 필요.
