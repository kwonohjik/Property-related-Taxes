# 부담부증여 §114조의2 환산취득가 5% 가산세 — UI 설계

> Plan: `docs/00-pm/burdened-gift-114-2-penalty.plan.md`
> 엔진 설계: `docs/02-design/features/burdened-gift-114-2-penalty.engine.design.md`
> 작성일: 2026-06-21
> 담당: inheritance-gift-tax-ui-senior
> 법령 검증: KoreanLaw MCP MST 285523 (소득세법 시행 2026-04-21) §114조의2 직접 확인
> 전제 PR: #315 증여세 부담부증여 K-4/K-5 취득가액 모드 이식
>
> **13단계 자가검증 정정 반영(2026-06-21): mustFix 4 + residual 9** — mustFix 4(§5.3 RadioCardGroup API 불일치: `disabledReason`(RadioCardOption 부재 속성)→valid `hint`로 교체·disabled:true 유지, 필수 `name="bg-building-type"` prop 추가, 실측 `RadioCardGroup.tsx:91-104`). UI 측 validate 필드(`item.standardPrice`·`bgItem.standardPrice` — `bgt.buildingStdPriceAtTransfer` 타입 부재)·land/building/housing 자산종류·extensionFloorArea Phase2 미매핑은 본 설계에 기존 반영됨.

---

## 0. 한 줄 요약

`BurdenedGiftValuationModeSection.tsx`의 K-5 환산 박스(`isMarketMode && isConverted`)에
**`!isLandType` 게이트로 신축 위젯**(ToggleCard + RadioCardGroup + DateInput)을 추가한다.
`BurdenedTransferTaxResultCard.tsx`의 `SingleTransferResultCard`(`:63`)에
**`result.penaltyTax > 0` 조건부 가산세 Row**를 삽입한다.
엔진 수정(finalize 결선·step override·route-helper 건물카드)은 엔진 시니어 담당이며,
UI 측 신규 작업은 **⑤ 신축 위젯**·**⑦ 결과카드 Row** 두 곳이다.

양도세 측(`TransferTaxResultView`)은 기존 penalty Row 확인 완료 — **UI 신규 0건**.

---

## 1. 법령 근거 (KoreanLaw MST 285523 직접 확인)

### 소득세법 §114조의2 (현행 — 시행 2026-04-21)

```
① 거주자가 건물을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는 경우에
   한정한다)하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는 경우로서
   제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는
   해당 건물의 감정가액(증축의 경우 증축한 부분에 한정한다) 또는 환산취득가액(증축의 경우
   증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을 제92조제3항제2호에 따른 양도소득
   결정세액에 더한다.
② 제1항은 제92조제3항제1호에 따른 양도소득 산출세액이 없는 경우에도 적용한다.
```

### 법령 포인트 (UI 설계에 직결)

| 항목 | 판정 | UI 영향 |
|---|---|---|
| 발동 조건: 건물 신축·증축 + 취득일부터 5년 이내 + 환산취득가액 사용 | 확정 | 위젯 활성화 조건(`isSelfBuilt=true + isConverted + !isLandType`) |
| 토지는 §114조의2 대상 아님 | 확정 | `isLandType=true` 시 위젯 미노출 |
| K-4 실지취득가 선택 시 미발동 (조심2019서3934 확인) | 확정 | `isConverted` 아닐 때 위젯 미노출 |
| 증축: 바닥면적 합계 85㎡ 초과만 대상·증축부분 한정 base | 확정 | Phase 1: extension disabled(과대 부과 방지) |
| 산출세액 0이어도 부과 (§114조의2②) | 확정 | 결과 Row는 `penaltyTax > 0` 시 항상 표시 |
| 신축 기산일 = 취득일, 증축 기산일 = 증축일 | 확정 | DateInput 힌트: "신축일(취득일) — 취득일부터 5년 이내 양도 시 가산세 발동" |
| 부담부증여 채무분 양도에 §114조의2 적용 (조심2019서3934 — 기각·적법) | 확정 | 위젯이 isConverted 증여 탭에 노출될 근거 |
| base = 채무비율 안분 후 건물 환산취득가 | 강한 해석(재결 직접 판시 아님, plan §2.3) | 결과 Row 산식: `건물 환산취득가(안분 후) × 5%` |

---

## 2. UI 신규 작업 범위

### 양도세 측 — 신규 0건

`TransferTaxResultView.tsx:420-421`에 기존 penalty Row 확인 완료(엔진 설계 실측):
```tsx
{result.penaltyTax > 0 && (
  <Row label="환산가액적용가산세 (§114조의2)" … />
)}
```
양도세 측 UI 8지점은 모두 기존 완비. 엔진 수정(finalize·step.ts)만으로 numeric 자동 반영.

### 증여세 측 — 신규 2지점

| 지점 | 파일 | 작업 |
|---|---|---|
| ⑤ UI 위젯 | `components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx:217` | K-5 환산 박스 내부에 `!isLandType` 게이트 신축 위젯 추가 |
| ⑦ 결과카드 | `components/calc/results/BurdenedTransferTaxResultCard.tsx` 내 `SingleTransferResultCard:63` | penalty Row 삽입 + 지방소득세 base 정합 표시(D-8) |

---

## 3. 14개 동기화 지점 전수 점검

### 양도세 측 (14지점) — 신규 0건

| # | 지점 | 파일 | 상태 |
|---|---|---|---|
| ① | 폼 상태 | `lib/stores/calc-wizard-asset.ts` `isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea` | ✅ 기존 |
| ② | initial | 동상 factory 4필드 | ✅ 기존 |
| ③ | normalize | `lib/stores/calc-wizard-migration.ts` 4필드 | ✅ 기존 |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts` body 최상위 4필드 | ✅ 기존 |
| ⑤ | UI 위젯 | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:673-689` `SelfBuiltSection` | ✅ 기존 노출 |
| ⑥ | 사이드바 | penalty는 API 결과 후 — N/A | — |
| ⑦ | 결과카드 | `components/calc/results/TransferTaxResultView.tsx:420-421` penalty Row | ✅ 기존 (실측 확인) |
| ⑧ | validate | `lib/calc/transfer-tax-validate.ts` `acquisitionCause === "purchase"` 게이트 | ✅ 기존 |
| ⑨ | Zod enum | `lib/api/transfer-tax-schema.ts:175-178` propertyBaseShape 4필드 | ✅ 기존 (실측) |
| ⑩ | Zod 컴패니언 | 동상 — 신규 enum 없음 | ✅ 기존 |
| ⑪ | acqDate fallback | N/A | — |
| ⑫ | Zod 입력객체 | propertyBaseShape spread 수용 | ✅ 기존 (실측) |
| ⑬ | body spread | `lib/calc/transfer-tax-api.ts` 4필드 최상위 | ✅ 기존 |
| ⑭ | Route 매핑 | `app/api/calc/transfer/route.ts:268-271` `toOptionalDate(constructionDate)` | ✅ 기존 (실측) |

### 증여세 측 (14지점) — 신규 7지점

| # | 지점 | 파일 (repo-root 절대경로) | 작업 | 상태 |
|---|---|---|---|---|
| ① | 폼 타입 | `lib/tax-engine/types/inheritance-gift-estate.types.ts` `BurdenedGiftTransferTaxInput` | 신축 필드 추가 (`isSelfBuilt?:boolean` / `buildingType?:"new"|"extension"` / `constructionDate?:Date`). `extensionFloorArea?:number`는 Phase 2 대비 타입 선언만(initial·API 미배선) | ❌ **추가** |
| ② | initial | `components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection.tsx:57` `createEmptyBgt` | 신축 3필드 `undefined` 초기값 + `hasData` OR 조건 추가 (extensionFloorArea 제외) | ❌ **추가** |
| ③ | normalize | `components/calc/inheritance/normalize-restored-form-dates.ts:85-99` | `toOptionalDate(bgt.constructionDate)` 추가 (Date 침묵 함정 방지) | ❌ **추가** |
| ④ = ⑬ | API 변환 / body | `lib/calc/gift-burdened-transfer-api.ts:153-218` | body 최상위 신축 3필드 명시 매핑 (`isMarketMode && isConverted` 조건 spread) — **명시 매핑이므로 TS 미감지·침묵 strip 주의. grep 자가점검 필수.** (extensionFloorArea는 Phase 2) | ❌ **추가** |
| ⑤ | UI 위젯 | `components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection.tsx:217` | K-5 박스 내부 `!isLandType` 게이트 신축 위젯 | ❌ **추가** |
| ⑥ | 사이드바 | 증여세 사이드바는 본세만 — N/A | — | — |
| ⑦ | 결과카드 | `components/calc/results/BurdenedTransferTaxResultCard.tsx` Row sub-component (`:63`~) | penalty Row + D-8 지방소득세 base 정합 표시 | ❌ **추가** |
| ⑧ | validate | `components/calc/gift-tax-form-shared.tsx:246,302-322` | `isSelfBuilt=true + isConverted + !isLandType` 시: `buildingType` 미선택 차단·`constructionDate` 필수. 또한 `isConverted + !isLandType` 시 `bgItem.standardPrice > 0`(양도시 건물 기준시가, K-5 환산 분모) 필수. **early-return 패턴**(issues.push 아님) | ❌ **추가** |
| ⑨ | Zod enum | `lib/api/transfer-tax-schema.ts:175-178` | **0건** — propertyBaseShape에 이미 존재 | ✅ 기존 |
| ⑩ | Zod 컴패니언 | 동상 | **0건** — 신규 enum 없음 | ✅ 기존 |
| ⑪ | acqDate fallback | N/A | — | — |
| ⑫ | Zod 입력객체 | `lib/api/transfer-tax-schema.ts:175-178` | **0건** — body 최상위 배치로 propertyBaseShape spread 수용 | ✅ 기존 |
| ⑬ | body spread | `lib/calc/gift-burdened-transfer-api.ts:177-218` (=④ 동일 위치) | 명시 매핑 추가 — 상동 | ❌ **추가** |
| ⑭ | Route 매핑+Date | `app/api/calc/transfer/route.ts:268-271` | **0건** — 4필드 이미 매핑 | ✅ 기존 |

**증여세 측 실제 신규 작업: ①②③④⑤⑦⑧ (7지점), ⑬=④ 동일 위치. ⑥⑨⑩⑪⑫⑭ 해당없음/0건.**

---

## 4. 케이스 매트릭스 (법령 본문·단서·각호 전수)

| # | 시나리오 | 자산종류(증여탭) | 취득방식 | 신축/증축 | UI 노출 | 발동 | base |
|---|---|---|---|---|---|---|---|
| C-1 | 비-land + K-5 + 신축 + 5년 이내 | building / housing | K-5 환산(`isConverted`) | 신축(`isSelfBuilt=true`, `buildingType="new"`) | **위젯 노출** | **발동** | `perAsset.building.acquisitionPrice` × 5% |
| C-2 | 비-land + K-5 + 신축 + 5년 초과 | building / housing | K-5 | 신축(5년 초과) | 위젯 노출 | 미발동 | — (rate-calc.ts:77-78 게이트) |
| C-3 | land + K-5 + `isSelfBuilt=true` (비현실) | land | K-5 | 전부 | **위젯 미노출** (`!isLandType` 게이트) | 미발동 | — (토지는 §114조의2 대상 아님) |
| C-4 | 비-land + K-4 실지 + 신축 | building / housing | K-4 실지(`isActual`) | 신축 | **위젯 미노출** (`isConverted` 아님) | 미발동 | — (K-4=§97①1호가목) |
| C-5 | 비-land + K-5 + `isSelfBuilt=false` | building / housing | K-5 | 해당없음 | 위젯 노출(ToggleCard OFF 상태) | 미발동 | — (isSelfBuilt OFF) |
| C-6 | 비-land + K-5 + 신축 + `transferDate < 2018-01-01` | building / housing | K-5 | 신축 | 위젯 노출 | 미발동 | — (rate-calc.ts:60 2018.1.1 게이트) |
| C-7 | 비-land + K-5 + 증축(85㎡초과·5년이내) | building / housing | K-5 | 증축 | 위젯 노출·extension RadioCard **disabled** | **(Phase 1 미지원)** | 증축부분 한정 base 미구현 → SCOPE OUT |
| C-8 | 비-land + K-5 + 증축(85㎡이하) | building / housing | K-5 | 증축 85㎡이하 | 위젯 노출·extension disabled | 미발동 | — (rate-calc.ts:69 게이트) |
| C-9 | 비-land + K-5 + 기준시가 모드 | building / housing | K-1~K-3(표준) | — | **위젯 미노출** (`isMarketMode=false`) | 미발동 | — (환산 아님) |
| C-10 | housing + K-5 + 신축 + 5년 이내 | housing(증여탭) | K-5 | 신축 | **위젯 노출·발동** | 발동 | `perAsset.building.acquisitionPrice` × 5% (C-1 동형) |

> **§114조의2① "건물"**: 주거용 건물(housing)·비주거용 건물(building) 모두 해당.
> 증여세 탭은 land/building/housing 단일슬롯(general_building·commercial_building 없음).
> `extensionFloorArea`는 Phase 1 UI 미노출이므로 validate 차단 불요.

---

## 5. UI 위젯 상세 — ⑤ BurdenedGiftValuationModeSection.tsx

### 5.1 삽입 위치

`BurdenedGiftValuationModeSection.tsx`의 K-5 환산 안내 박스(`:217`~`:246`) 내부.

현행 K-5 박스:
```tsx
{isMarketMode && isConverted && (
  <div className="rounded-md border border-sky-200 bg-sky-50/60 ...">
    <p className="font-semibold mb-1">K-5 환산취득가액 계산 방식</p>
    ...
    {isLandType && ( /* 토지 전용 공시지가 입력 */ )}
  </div>
)}
```

신축 위젯 추가 후:
```tsx
{isMarketMode && isConverted && (
  <div className="rounded-md border border-sky-200 bg-sky-50/60 ...">
    <p className="font-semibold mb-1">K-5 환산취득가액 계산 방식</p>
    ...
    {isLandType && ( /* 토지 전용 공시지가 입력 — 기존 무변경 */ )}

    {/* ★ 신규: 신축 가산세 위젯 — 비-토지 전용 */}
    {!isLandType && (
      <SelfBuiltPenaltyWidget bgt={bgt} set={set} />
    )}
  </div>
)}
```

### 5.2 기존 SelfBuiltSection 재사용 검토 (필수)

CLAUDE.md UI 체크리스트는 "신축·증축 입력 → `SelfBuiltSection`"을 명시한다. 신규 위젯 신설 전
기존 `components/calc/transfer/SelfBuiltSection.tsx`(105줄, §114조의2 동일 목적) 재사용을 먼저 평가한다.

**실측한 SelfBuiltSection의 Props·구현 (`SelfBuiltSection.tsx:19-105`)**:
- props가 **string 기반**: `buildingType: "new"|"extension"|""`, `constructionDate: string`,
  `extensionFloorArea: string` + 각 `on*Change` 콜백 8개.
- buildingType 선택은 **native `<button>`** (RadioCardGroup 아님, `:60-74`).
- **extension 활성**(disabled 아님) — buildingType==="extension" 시 면적 입력 노출(`:86-102`).
- ToggleCard는 `title`/`checked`/`onCheckedChange` 사용(`:41-53`).

**증여 탭 요구와의 차이 (재사용 차단 사유)**:
| 항목 | SelfBuiltSection (기존) | 증여 탭 요구 |
|---|---|---|
| `constructionDate` 타입 | `string` + `onConstructionDateChange(string)` | `Date` (`bgt.constructionDate?: Date`) |
| `buildingType` 빈값 | `""` (string union) | `undefined` |
| buildingType 위젯 | native `<button>` | `RadioCardGroup`(프로젝트 신규 native 금지 정책) |
| extension | **활성** | **disabled** (Phase 1 SCOPE OUT — 증축부분 한정 base 미구현) |
| 콜백 형태 | 개별 8 콜백(string) | `set(Partial<BurdenedGiftTransferTaxInput>)` 단일 |

**판정**: 기존 SelfBuiltSection은 string-props·native 버튼·extension 활성으로 증여 탭의
Date-props·RadioCardGroup·extension disabled 요구와 구조적으로 불일치. 양 탭 공유를 위해
SelfBuiltSection을 (a) value 타입을 Date/string 양립으로 일반화 + (b) `extensionDisabled?` prop 추가 +
(c) buildingType을 RadioCardGroup으로 교체하는 확장은 양도세 탭(현행 활성 동작)을 동시에 건드려
회귀 위험이 크다(Surgical Changes 위배). 따라서 **증여 탭 전용 인라인 위젯을 신설**하되,
ToggleCard·DateInput·RadioCardGroup 공용 컴포넌트는 그대로 차용한다.
(Phase 2에서 양 탭 공유 리팩터가 필요하면 그 시점에 별도 과제로 평가.)

### 5.3 SelfBuiltPenaltyWidget 구조

`BurdenedGiftValuationModeSection.tsx` 내부 선언(별도 파일 불요 — 분리 시 800줄 정책 확인).

```tsx
/**
 * §114조의2 신축 가산세 위젯 — K-5 환산 + 비-토지 조건 하에만 렌더
 * (isMarketMode && isConverted && !isLandType 게이트는 부모가 담당)
 */
function SelfBuiltPenaltyWidget({
  bgt,
  set,
}: {
  bgt: BurdenedGiftTransferTaxInput;
  set: (patch: Partial<BurdenedGiftTransferTaxInput>) => void;
}) {
  return (
    <div className="mt-2 pt-2 border-t border-sky-200/60">
      {/* ① 신축 여부 토글 — ToggleCard 실제 API: title·checked·onCheckedChange */}
      <ToggleCard
        tone="amber"
        title="신축 건물 — §114조의2 환산취득가액 가산세"
        description="건물을 신축하고 취득일부터 5년 이내 양도(증여)하는 경우,
                     환산취득가액의 5%를 결정세액에 가산합니다. (소득세법 §114조의2①)"
        checked={bgt.isSelfBuilt === true}
        onCheckedChange={(v) => set({
          isSelfBuilt: v || undefined,
          buildingType: v ? "new" : undefined,
          constructionDate: v ? bgt.constructionDate : undefined,
        })}
      >
        {/* ② buildingType — Phase 1: 신축(new)만, 증축(extension) disabled */}
        <FieldCard
          label="신축/증축 구분"
          hint="증축은 현재 미지원(증축부분 한정 base 산출 필요 — Phase 2 예정)."
        >
          <RadioCardGroup
            name="bg-building-type"
            layout="inline"
            value={bgt.buildingType ?? "new"}
            onChange={(v) => set({ buildingType: v as "new" | "extension" })}
            options={[
              { value: "new", label: "신축" },
              {
                value: "extension",
                label: "증축",
                disabled: true,
                // RadioCardOption에 disabledReason 없음 (실측 RadioCardGroup.tsx:91-104:
                //   value·label·description·trailing·hint·disabled·testId·lawRefs만 보유).
                // 비활성 사유는 valid 속성 hint로 표시.
                hint: "증축(85㎡ 초과·증축부분 한정) 가산세는 Phase 2 지원",
              },
            ]}
          />
        </FieldCard>

        {/* ③ 신축일 — 5년 기산점 */}
        <FieldCard
          label="신축일 (취득일)"
          hint="취득일부터 5년 이내 양도(증여) 시 가산세 발동. (§114조의2① '취득일부터 5년 이내')"
        >
          <DateInput
            value={bgt.constructionDate}
            onChange={(v) => set({ constructionDate: v ?? undefined })}
            data-testid="bg-construction-date"
          />
        </FieldCard>
      </ToggleCard>
    </div>
  );
}
```

### 5.4 Props 연결

`BurdenedGiftValuationModeSection`의 기존 Props 시그니처:
```ts
export interface ValuationModeSectionProps {
  bgt: BurdenedGiftTransferTaxInput;
  set: (patch: Partial<BurdenedGiftTransferTaxInput>) => void;
  item: EstateItem;
  isLandType: boolean;
  jibun?: string;
}
```
신규 필드(`isSelfBuilt`·`buildingType`·`constructionDate`) 모두 `bgt`에 포함되어
기존 Props 변경 없음.

### 5.5 Cross-field 연동 (useEffect 금지)

| 트리거 | 대상 | 구현 |
|---|---|---|
| `isSelfBuilt` OFF | `buildingType` · `constructionDate` clear | `onChange` 내부 `set({ ..., buildingType: undefined, constructionDate: undefined })` — store 직접 set, useEffect 금지 |
| `buildingType` 변경 | `extensionFloorArea` (Phase 1 미노출) | 해당 없음 |

### 5.6 UI 순서 = 엔진 계산 순서

엔진 `calculateBuildingPenalty`(rate-calc.ts:55-78) 게이트 순서:
1. `isSelfBuilt` (`:55`)
2. `transferDate >= 2018-01-01` (`:60` — 시스템 자동)
3. `acquisitionMethod === "estimated"` (`:62` — K-5이면 step override가 자동 설정)
4. `buildingType !== "extension"` (`:67`)
5. `constructionDate` + `addYears(constructionDate, 5) >= transferDate` (`:72·:77`)

UI 순서: `isSelfBuilt` 토글 → `buildingType` 라디오 → `constructionDate` DateInput.
(transferDate·acquisitionMethod는 시스템 자동 — UI 노출 불요.)

---

## 6. 결과 카드 — ⑦ BurdenedTransferTaxResultCard.tsx

### 6.1 삽입 위치

`SingleTransferResultCard`(`:63`)의 최종 납부세액 섹션(`:109`)에서
**"결정세액"(`:136`) 행과 "지방소득세"(`:137-141`) 행 사이**에 삽입.

### 6.2 penalty Row 산식

```tsx
{/* ★ 신규: §114조의2 가산세 Row */}
{result.penaltyTax > 0 && (
  <Row
    label="환산가액적용가산세 (§114조의2)"
    value={formatKRW(result.penaltyTax)}
  />
)}
{/* ★ 신규: 지방소득세 base 정합 주석 (D-8) */}
{result.penaltyTax > 0 && (
  <div className="px-4 py-1 text-xs text-muted-foreground bg-amber-50/40 dark:bg-amber-900/10">
    ※ 지방소득세 = (결정세액 + 환산가액적용가산세) × 10% (지방세법 §103의3·소득세법 §114조의2①)
  </div>
)}
<Row
  label="지방소득세 (10%)"
  value={formatKRW(result.localIncomeTax)}
  sub
/>
```

### 6.3 지방소득세 base 정합 표시 (D-8)

`result.localIncomeTax`는 엔진에서 `applyRate(determinedTax + penaltyTax, 0.1)`로 산정됨
(`transfer-tax-finalize.ts:323`). 결과 화면에 표시된 "결정세액"은 penalty 전 값
(`determinedTax`, `:335`)이므로, 사용자가 `determinedTax × 10% ≠ localIncomeTax`를 오인하지
않도록 penalty Row 바로 아래에 정합 주석을 표시한다.

**법령 인용 정정 (KoreanLaw 검증)**: 10% 지방소득세(양도소득 개인지방소득세)의 근거는
**지방세법 §103의3**(양도소득에 대한 개인지방소득세 세율 — MST 282559 §103의3 직접 확인)이며,
penalty base(환산취득가액 5%)가 결정세액에 산입되는 근거는 **소득세법 §114조의2①**이다.
엔진 legal-code 상수 `lib/tax-engine/legal-codes/transfer.ts:204 LOCAL_INCOME_TAX: "지방세법 §103의3"`와
동일 인용으로 통일한다. **소득세법 §89①은 "비과세 양도소득"(파산처분·1세대1주택 등) 조문으로
지방소득세와 무관하므로 인용 금지**(MST 285523 §89 본문 직접 확인).
산식 `(결정세액 + 환산가액적용가산세) × 10%`는 엔진 `transfer-tax-finalize.ts:323
applyRate(determinedTaxWithPenalty, 0.1)`와 일치(정확).

### 6.4 상세 펼침 영역 산식 추가

기존 `detailOpen` 영역(`:150-218`)의 K-5 취득가액 표시(`:180-188`) 다음에:

```tsx
{/* ★ 신규: §114조의2 가산세 산식 */}
{result.penaltyTax > 0 && (
  <p className="mt-1 text-amber-700 dark:text-amber-300">
    ※ 환산가액적용가산세:
    건물 환산취득가(채무비율 안분 후) {formatKRW(result.penaltyBase)} × 5%
    = {formatKRW(result.penaltyTax)} (소득세법 §114조의2①)
  </p>
)}
```

**법적 근거 표기 정책**: 납세자 유불리 표현 금지. 사실만 표기.
- 가산세 발동 여부는 `penaltyTax > 0` 기준.
- "불이익" 같은 주관 표현 금지.

---

## 7. Validation — ⑧ gift-tax-form-shared.tsx

### 7.1 추가 위치

`components/calc/gift-tax-form-shared.tsx:302-322`의 기존 isMarketMode 블록 내부.
현행 검증 함수(`gift-tax-form-shared.tsx:280-346`)는 **첫 오류에서 즉시 `return "문자열"`**로
빠져나가는 단일-반환 패턴(289·293·305·308·313·319·327·332·339 모두 early return)이므로,
`issues.push` 배열 패턴이 아니라 **early-return 패턴**으로 작성한다.
현행 land 전용 기준시가 차단 패턴과 대칭으로 추가:

```ts
// 신축 가산세 validate (기존 isMarketMode && isConverted 블록 내부, early-return 패턴)
if (
  bgt.acquisitionMethod === "converted" &&
  !isLandType &&         // 토지가 아닌 건물형
  bgt.isSelfBuilt === true
) {
  // buildingType 필수 (Phase 1: "new"만 유효, extension disabled이나 누락 방어)
  if (!bgt.buildingType) {
    return `${itemLabel}: 신축/증축 구분을 선택해 주세요.`;
  }
  // constructionDate 필수 (5년 기산일)
  if (!bgt.constructionDate) {
    return `${itemLabel}: 신축일(취득일)을 입력해 주세요. §114조의2①의 5년 기산점입니다.`;
  }
}
// K-5 환산 분모 필수 (item.standardPrice = 양도시 건물 기준시가):
// 현행 검증은 else(표준모드) 분기(:327)에서만 standardPrice>0를 검사하므로,
// isMarketMode K-5 비-land 분기에 동일 검사를 추가하는 것이 갭 해소.
// 0이면 buildingStdAtTransfer=0 → perAsset.building.acquisitionPrice=0 → penaltyBase=0 침묵.
if (
  bgt.acquisitionMethod === "converted" &&
  !isLandType &&
  (!bgItem.standardPrice || bgItem.standardPrice <= 0)
) {
  return `${itemLabel}: K-5 환산 취득가액 계산을 위해 양도시 건물 기준시가를 입력해 주세요.`;
}
```

> **필드명 정정 (실측)**: `BurdenedGiftTransferTaxInput` 타입(`lib/tax-engine/types/inheritance-gift-estate.types.ts:571-686`)에
> **`buildingStdPriceAtTransfer` 필드는 존재하지 않는다**(존재하는 `*StdPriceAtTransfer`는 `landStdPriceAtTransfer`뿐, `:685`).
> K-5 비-land 건물 환산 분모(양도시 건물 기준시가)는 `item.standardPrice`에서 온다
> (`gift-burdened-transfer-api.ts:99 const stdAtTransfer = item.standardPrice ?? 0; buildingStdAtTransfer = isLandType ? 0 : stdAtTransfer`,
> `:164`에서 `burdenedGiftInfo.buildingStdPriceAtTransfer`로 wiring). 따라서 `bgt.buildingStdPriceAtTransfer`를
> 참조하면 항상 undefined → 정상 입력해도 영구 차단되는 UI 통과↔validate 차단 모순이 발생. 검증 대상은 item-level
> **`bgItem.standardPrice`**로 정정한다.

### 7.2 UI ↔ validate 동기화 점검

| 조건 | UI 표시 | validate 차단 |
|---|---|---|
| `isLandType=true` | 위젯 미노출 | validate 조건에서 `!isLandType` 제외 → 자동 skip |
| `isMarketMode=false` | 위젯 미노출 | validate 조건에서 `bgt.acquisitionMethod !== "converted"` 제외 → 자동 skip |
| `isSelfBuilt=false` | ToggleCard OFF | `isSelfBuilt !== true` 로 skip → 차단 없음 |
| `isSelfBuilt=true + buildingType 미선택` | RadioCardGroup 노출 | validate 차단 |
| `isSelfBuilt=true + constructionDate 미입력` | DateInput 노출 | validate 차단 |
| `isConverted + !isLandType + bgItem.standardPrice=0` | K-5 환산 분모(양도시 건물 기준시가) 미입력 | validate 차단 |

**⑧ validation-API fallback 동기화 정책**: 신규 필드에 자동 안분·자동 fallback 금지.
미입력 시 validate에서 명확한 오류로 차단. UI 통과↔validate 차단 모순 없음.

---

## 8. Cross-field 동기화 — useEffect 금지 선언

| 트리거 | 갱신 대상 | 구현 | useEffect 금지 이유 |
|---|---|---|---|
| `isSelfBuilt` OFF | `buildingType=undefined`, `constructionDate=undefined` | ToggleCard `onChange` 내 `set({...})` | 무한 루프(Maximum update depth exceeded) 차단 |
| `buildingType="new"` | `extensionFloorArea` — Phase 1 미노출 | 해당 없음 | — |
| K-5 모드 OFF (`isConverted=false`) | 신축 위젯 자체 미노출 | `isMarketMode && isConverted && !isLandType` 게이트 | 상위 조건으로 자동 |

---

## 9. Silent Fallback 후보 식별 — 자동 안분 금지 확인

| 필드 | 위험 | 처리 |
|---|---|---|
| `constructionDate` 미입력 | `addYears(null, 5)` → NaN·오동작 | ⑧ validate: isSelfBuilt=true 시 필수 차단 |
| `buildingType` 미선택 | `undefined` → extension 분기 skip → 신축 취급 (Phase 1 무해이나 불명확) | ⑧ validate: 선택 필수. extension disabled로 2중 차단 |
| `bgItem.standardPrice` 미입력(0) (양도시 건물 기준시가, K-5 환산 분모) | `buildingStdAtTransfer=0` → `perAsset.building.acquisitionPrice=0` → penaltyBase=0 → 침묵 미발동 | ⑧ validate: 명시 차단 (Finding 5). **필드는 `item.standardPrice` — `bgt.buildingStdPriceAtTransfer`는 타입에 부재** |
| `isSelfBuilt=false` 기본(undefined) | 미신축 자산에 가산세 미부과 — 정상 동작 | 문제 없음 — OFF 기본값이 정책과 일치 |
| `extensionFloorArea` 미입력 | Phase 1 UI 미노출이므로 undefined → 0 → rate-calc.ts:69 게이트 통과 | Phase 1 신축만이라 무해. 방어적으로 extension disabled |

---

## 10. ① 폼 타입 확장 명세

`lib/tax-engine/types/inheritance-gift-estate.types.ts`의 `BurdenedGiftTransferTaxInput`(`:571-686`)에 추가:

```ts
// ===== §114조의2 신축 가산세 필드 =====
/**
 * 신축 여부.
 * 부담부증여 안분 SUPPORTED: housing·building(·general_building·commercial_building은 증여탭 부재).
 * land는 §114조의2 대상 아님 → UI에서 !isLandType 게이트로 미노출.
 * isSelfBuilt=true + isConverted + !isLandType 동시 충족 시 위젯 노출·발동.
 */
isSelfBuilt?: boolean;

/**
 * 신축("new") 또는 증축("extension").
 * Phase 1: "new"만 UI 지원. "extension"은 RadioCard disabled.
 * 증축 §114조의2① "증축부분에 한정" base 분리 미구현(Phase 1 SCOPE OUT).
 */
buildingType?: "new" | "extension";

/**
 * 신축일(취득일). §114조의2① "취득일부터 5년 이내" 기산점.
 * isSelfBuilt===true + isConverted + !isLandType 시 필수.
 * ★ normalize에서 toOptionalDate 반드시 적용(Date 침묵 함정 방지).
 */
constructionDate?: Date;

/**
 * 증축 바닥면적 합계(㎡). buildingType==="extension" 시만 게이트 검사.
 * ★ Phase 2 도입 예정 — Phase 1 미배선. 증축 RadioCard disabled(신축만 지원)이라
 *   Phase 1에서 절대 값이 채워지지 않으므로 ② initial·④⑬ API 매핑에서 제외한다.
 *   엔진 게이트(rate-calc.ts:69)는 undefined→0으로 통과하므로 필드 부재가 신축 발동을 막지 않음.
 *   (타입에는 Phase 2 대비 선언만 유지.)
 */
extensionFloorArea?: number;
```

---

## 11. ② initial 갱신 명세

`BurdenedGiftTransferSection.tsx:57`의 `createEmptyBgt()`:

```ts
function createEmptyBgt(): BurdenedGiftTransferTaxInput {
  return {
    // ... 기존 필드 ...
    // ★ 신규 추가 (Phase 1: 신축 3필드만. extensionFloorArea는 Phase 2 — 미배선)
    isSelfBuilt: undefined,
    buildingType: undefined,
    constructionDate: undefined,
  };
}
```

`hasData` 조건: `isSelfBuilt === true` 시 hasData OR 추가
(신축만 입력하고 다른 필드 비워도 저장 가능하도록).

---

## 12. ③ normalize 명세

`components/calc/inheritance/normalize-restored-form-dates.ts:85-99`의 `normalizedAcq` 패턴 동형:

```ts
// 기존 normalizedAcq 블록 내부 또는 인접에 추가
constructionDate: toOptionalDate(bgt.constructionDate),
```

sessionStorage에서 Date가 string으로 직렬화되어 복원되므로,
`addYears(string, 5)` 오동작 방지를 위해 반드시 `toOptionalDate` 적용.

---

## 13. ④⑬ API 변환 명세

`lib/calc/gift-burdened-transfer-api.ts:153-218` body 최상위 신축 3필드 명시 매핑 (Phase 1):

```ts
// ★ 신규: §114조의2 신축 가산세 — K-5 환산 모드 시 최상위 전달
// (이 필드는 PropertyBaseShape Zod에 이미 정의됨 — propertyBaseShape spread 수용)
// Phase 1: 신축 3필드만 매핑. extensionFloorArea는 Phase 2 도입 시 함께 배선(미매핑).
...(isMarketMode && isConverted && {
  isSelfBuilt: bgt.isSelfBuilt,
  buildingType: bgt.buildingType,
  constructionDate: bgt.constructionDate,  // Date 그대로 — route.ts:270에서 toOptionalDate 처리
}),
```

**⑬ 함정 주의**: `gift-burdened-transfer-api.ts`는 명시 매핑(spread 아님) → 신규 필드
누락 시 TS 미감지·침묵 strip → 엔진 미도달. **grep 자가점검 필수**:
```bash
grep -n "isSelfBuilt\|buildingType\|constructionDate" \
  lib/calc/gift-burdened-transfer-api.ts
```
Phase 1 신축 3필드(isSelfBuilt·buildingType·constructionDate) 모두 존재해야 완료.
(extensionFloorArea는 Phase 2 — Phase 1 미매핑.)

**활성화 주의**: D-2 penalty 활성화는 ⑬ body가 아니라 **엔진 내부(finalize:313-314 input→effectiveInput)로만 해결**.
`usedEstimatedAcquisition`·`estimatedBase`는 Zod·route에 미정의 → body 전송해도 strip.
⑬은 신축 게이트 3필드(isSelfBuilt·buildingType·constructionDate)의 엔진 도달 목적만 (Phase 1).

---

## 14. 결과 산식 한국어 표기 규칙

| 항목 | 표시 | 금지 |
|---|---|---|
| penalty Row 라벨 | `환산가액적용가산세 (§114조의2)` | `penaltyTax`·변수 약어 |
| 산식 | `건물 환산취득가(채무비율 안분 후) {penaltyBase} × 5% = {penaltyTax}` | `floor()` 묵시 표기 |
| 지방소득세 base 정합 | `지방소득세 = (결정세액 + 환산가액적용가산세) × 10%` (지방세법 §103의3·소득세법 §114조의2①) | `determinedTaxWithPenalty` 등 내부 변수명·소득세법 §89①(비과세 양도소득 — 무관) 인용 금지 |
| 법령 인용 | `소득세법 §114조의2①` | 추정 조문 단정 금지 |

---

## 15. 리스크·함정

| # | 리스크 | 관련 정책 | 대응 |
|---|---|---|---|
| R-1 | step override 단독으로 penalty 미발동 | D-2 plan §5 | finalize:313-314 input→effectiveInput 엔진 결선이 반드시 선행. anchor-1으로 (a) 적용 전(0)/후(>0) 확인. UI 시니어는 엔진 PR 완료 후 UI 작업 |
| R-2 | ③ normalize Date 침묵 함정 | `feedback_engine_result_map_json_loss` 류 | `toOptionalDate(bgt.constructionDate)` — sessionStorage 복원 시 string→Date 변환 |
| R-3 | ⑬ 명시 매핑 침묵 strip | `feedback_explicit_prop_mapping_strip` | grep 신축 3필드(isSelfBuilt·buildingType·constructionDate) 자가점검 |
| R-4 | `bgItem.standardPrice`(양도시 건물 기준시가) 미입력 → penaltyBase=0 침묵 | Finding 5 (엔진 설계) | ⑧ validate 차단 (`bgt.buildingStdPriceAtTransfer`는 타입 부재 — `item.standardPrice` 검증) |
| R-5 | 증축 발동 시 건물 전체 base → 과대 부과 | D-7 / §114조의2① "증축부분 한정" | extension RadioCard disabled. Phase 1 신축만 |
| R-6 | useEffect store 미러링 | `feedback_useeffect_store_mirror_forbidden` | ToggleCard onChange 내 직접 set(). useEffect 금지 |
| R-7 | 자동 fallback | `feedback_no_silent_apportion_fallback` | ⑧ validate: isSelfBuilt=true 시 buildingType·constructionDate 미입력=차단 + isConverted·!isLandType 시 `bgItem.standardPrice` 미입력=차단 |
| R-8 | 지방소득세 base 오인 | D-8 엔진 설계 | penalty Row 아래 "(결정세액 + 가산세) × 10%" 주석 |
| R-9 | 엔진 PR 미머지 상태에서 UI 작업 | R-1 | 엔진 anchor-1 통과 확인 후 UI 시작 |

---

## 16. Anchor 기대값 (UI 검증용)

### anchor UI-1: 신축 위젯 노출 조건

```
입력: valuationMode="sangjeungbeop_market", acquisitionMethod="converted", isLandType=false
기대: SelfBuiltPenaltyWidget 렌더 (data-testid="bg-self-built-toggle" 존재)
```

```
입력: valuationMode="sangjeungbeop_market", acquisitionMethod="converted", isLandType=true
기대: SelfBuiltPenaltyWidget 미노출 (data-testid="bg-self-built-toggle" 부재)
```

```
입력: valuationMode="sangjeungbeop_market", acquisitionMethod="actual", isLandType=false
기대: SelfBuiltPenaltyWidget 미노출
```

### anchor UI-2: validate 차단 조건 (early-return — 반환 문자열 1개씩 검증)

> 현행 검증 함수는 첫 오류에서 즉시 `return "문자열"`하는 단일-반환 패턴이므로,
> 입력 1건당 반환 문자열 1개를 단계적으로 검증한다(다중 issues 동시 검출 불가).
> K-5 환산 분모는 타입 부재 필드(`buildingStdPriceAtTransfer`)가 아니라 `bgItem.standardPrice`로 검증.

```
입력: isSelfBuilt=true, buildingType=undefined, constructionDate=설정, bgItem.standardPrice>0
기대: 반환 문자열에 "신축/증축 구분을 선택해 주세요" 포함 (첫 return)

입력: isSelfBuilt=true, buildingType="new", constructionDate=undefined, bgItem.standardPrice>0
기대: 반환 문자열에 "신축일(취득일)을 입력해 주세요" 포함

입력: isSelfBuilt=true, buildingType="new", constructionDate=설정, bgItem.standardPrice=0
기대: 반환 문자열에 "양도시 건물 기준시가를 입력해 주세요" 포함

입력: isSelfBuilt=false, isConverted, !isLandType, bgItem.standardPrice>0
기대: 신축 관련 차단 없음 (standardPrice 충족 시 반환 없음)
```

### anchor UI-3: 결과카드 penalty Row

```
result.penaltyTax = 1_500_000 (양도분 건물 환산취득가 30,000,000 × 5%)
result.penaltyBase = 30_000_000

기대: "환산가액적용가산세 (§114조의2)" Row 표시
      formatKRW(1_500_000) = "1,500,000" 표시
      지방소득세 base 정합 주석 표시
      상세 펼침 시: "건물 환산취득가(채무비율 안분 후) 30,000,000 × 5% = 1,500,000" 표시
```

---

## 17. E2E 명세

### 증여세 탭: `e2e/gift-burdened-transfer-penalty.spec.ts` (신설)

```
시나리오:
  1. 증여세 마법사 진입 → 부담부증여 자산 추가
  2. 자산 모달 → 시가 모드(sangjeungbeop_market) 선택
  3. K-5 환산(converted) 선택
  4. 자산 종류 = housing (isLandType=false)
  5. 신축 ToggleCard ON
  6. buildingType: "new" 확인(기본)
  7. constructionDate: 4년 이내 날짜 입력
  8. 양도시 건물 기준시가(item.standardPrice — K-5 환산 분모) 입력
  9. 계산 실행
 10. BurdenedTransferTaxResultCard에 "환산가액적용가산세 (§114조의2)" Row 존재 assert

E2E 함정:
  - 모달 닫기: backdrop 클릭(project_stock_item_table_modal_plan 패턴)
  - 자산명 필수: 모달 내 자산명 입력 필수
  - getByLabel 오매칭: textbox role 한정 (e.g., getByRole('textbox', {name: '신축일'}))
  - DateInput은 연/월/일 3개 input — getByTestId("bg-construction-date") 조합
```

### 양도세 탭: `e2e/transfer-burdened-gift-penalty.spec.ts` (신설)

```
시나리오:
  1. 양도세 마법사 → 자산추가 → 부담부증여 선택
  2. 취득원인: 매매
  3. 취득가액 방식: 환산(K-5)
  4. 신축 ToggleCard ON
  5. constructionDate: 4년 이내
  6. 계산 → TransferTaxResultView에서 "환산가액적용가산세 (§114조의2)" Row 존재 assert

결과뷰 경로 확정: 양도세 탭 부담부증여 단건은 route.ts:765 calculateTransferTax 단건
                  → TransferTaxResultView 경유(BurdenedTransferTaxResultCard 아님).
                  양도세 E2E selector는 TransferTaxResultView 기준.
```

---

## 18. SCOPE OUT (UI 관점)

- **증축(extension) UI 위젯**: extension RadioCard disabled. base 분리 미구현(§114조의2① "증축부분 한정"). Phase 2로 이관.
- **양도세 탭 UI 변경**: 기존 `SelfBuiltSection`·`TransferTaxResultView` penalty Row 완비. 신규 0건.
- **사이드바 합계 신축 필드**: penalty는 API 결과 후 산정 → 사이드바 미표시.
- **이력 저장·PDF 별지 서식**: penalty 결과 칸 반영은 후속.
- **general_building·commercial_building 증여 탭 category**: 증여세 탭에 해당 자산 종류 없음(실측). UI 분리 불요.

---

## 19. Definition of Done — 자가 점검 체크리스트

- [ ] ①~⑧ 7지점 증여세 측 전부 구현 확인
- [ ] ③ normalize `toOptionalDate(bgt.constructionDate)` grep 확인
- [ ] ④⑬ grep: `gift-burdened-transfer-api.ts`에 isSelfBuilt·buildingType·constructionDate 3건 존재 (extensionFloorArea는 Phase 2 — 미매핑)
- [ ] ⑤ K-5 박스 내 `!isLandType` 게이트 확인 — isLandType=true 시 위젯 미노출
- [ ] ⑦ penalty Row: `result.penaltyTax > 0` 조건부, 결정세액↔지방소득세 사이 삽입
- [ ] ⑦ 지방소득세 base 정합 주석 표시 확인
- [ ] ⑦ 상세 펼침 영역 가산세 산식 표시 (`penaltyBase × 5%`)
- [ ] ⑧ validate: `isSelfBuilt=true + isConverted + !isLandType` 시 buildingType·constructionDate 차단 + `isConverted + !isLandType` 시 `bgItem.standardPrice > 0` 차단 (early-return 패턴, `buildingStdPriceAtTransfer`는 타입 부재)
- [ ] UI↔validate 모순 없음: UI 통과 시 validate 통과, UI 미노출 시 validate skip
- [ ] useEffect 사용 없음 (cross-field는 onChange 직접 set)
- [ ] 자동 안분 fallback 없음 (미입력은 validate 차단)
- [ ] `npx tsc --noEmit` 0건
- [ ] 엔진 PR(finalize 결선·step.ts·route-helper) 완료 후 E2E 실행
- [ ] E2E 증여세 탭: `gift-burdened-transfer-penalty.spec.ts` 통과
- [ ] E2E 양도세 탭: `transfer-burdened-gift-penalty.spec.ts` 통과
- [ ] 3대 핵심 정책(useEffect 금지·자동 fallback 금지·validation 8번째 동기화) 위반 없음
