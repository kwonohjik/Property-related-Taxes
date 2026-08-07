# 일반건물(general_building) 상속 취득가액 — UI 설계 문서 (STEP 12)

> 상태: **✅ Phase 1(C1) 구현 완료** — 커밋 `b8d71870`(2026-07-20).
> ⚠️ 인용 file:line은 착수 시점(2026-07-20) 좌표다. 부분 상속(C2·C2′·C3)의 현행 UI 현황은 [[transfer-gb-inheritance-partial-phase2.plan.md]] §4를 볼 것.

> 단일 소스 계획서: [`transfer-general-building-inheritance-acquisition.plan.md`](./transfer-general-building-inheritance-acquisition.plan.md) (STEP 1~4 자가검토 완료·Q1·Q2 해소). 본 문서는 그 §4 확정 결정을 그대로 구현하는 **UI/클라이언트 8개 동기화 지점** 설계. 계획서 확정 결정(§4-1~9, Q1, Q2) 재-open 금지.
> 겸용주택 선행 수정: [`transfer-mixed-use-inheritance-acquisition.ui.design.md`](./transfer-mixed-use-inheritance-acquisition.ui.design.md)(PR#710) — 동일 클래스 버그, 동일 패턴(§163⑨ 직접 산정) 재사용.
> 엔진 설계문서(STEP 5)는 본 문서 작성 시점 기준 **미생성**. 본 문서는 계획서 §4가 명시한 payload 계약을 클라이언트 측에서 확정하며, 엔진 소비 로직(⑨~⑭, `GeneralBuildingInput` 필드 추가·`calculateGeneralBuildingActualTransfer` 시그니처)은 엔진 시니어의 후속 STEP 5 설계 대상입니다. §8 "엔진/Route 후속 조치"에 인계 사항을 명시합니다.

---

## §0. Phase 1 범위 확정 (본 문서에서 결정 — Q3·Q4 해소)

계획서 §4-4는 Q3(C2: 토지 매매+건물 상속, 환산 토글 ON)을 "(i) 건물분 상속 직접배정 지원 vs (ii) 상속 자산은 actual 모드로 강제(경로 A 차단) 중 택 — Phase 1 범위 확정"으로 열어두었다. 계획서 §4 "유력 최소경로" 자체가 "상속 시 actual 모드를 강제하면 정합"이라고 명시하므로, 본 UI 설계는 **(ii)를 채택**한다.

**Phase 1 지원 조합 = C1 단독** (§5 매트릭스 기준):

| # | 토지 | 건물 | 모드 | Phase 1 |
|---|---|---|---|---|
| C1 | 상속 | 상속 | actual (경로 B) | ✅ 지원 (본 문서 대상) |
| C2 | 매매 | 상속 | 경로 A (환산 ON) | ⛔ 차단 — ⑧에서 명시적 오류 (Q3 미해소, Phase 2) |
| C2′ | 매매 | 상속 | 경로 B (환산 OFF) | ⛔ 차단 — 토지분 실거래가 안분과 건물 직접배정 혼합 배선 미정 (Q3 잔여, Phase 2) |
| C3 | 상속 | 매매/신축 | 경로 B | ⛔ 차단 — 혼합 배선 미정 (Q4, Phase 2) |

근거(실측): 경로 B 실가 모드는 `bundledAcquisitionPrice`(또는 `fixedAcquisitionPrice`) **하나의 값**을 §166⑥ 비율로 토지·건물에 안분하는 구조(`app/api/calc/transfer/general-building-route-helper.ts:435` `calculateGeneralBuildingActualTransfer`)다. 토지·건물 중 **한쪽만** 상속(직접배정)이고 나머지가 매매(실거래가 1건)인 경우, "실거래가 안분 대상 금액"과 "상속 직접배정 금액"을 같은 인풋에 동시에 넣을 방법이 현재 엔진에 없다 — 이는 계획서 §4-4/Q4가 "혼합 배선"이라 부른 미해결 설계 문제이며, 본 UI 시니어 임의로 답을 만들지 않는다(계획서 미확정 사항 임의 확정 금지). Phase 2에서 엔진 시니어가 배선을 설계한 뒤 UI를 확장한다.

**자가 점검**: 이 범위 축소는 계획서 §4 "유력 최소경로"의 명시적 선호(actual 모드 강제)를 그대로 따른 것이며 새로운 정책을 만들지 않는다. Q1·Q2처럼 "✅해소"로 격상하지 않고 "Phase 1 UI 설계 결정(엔진 시니어 확인 필요)"로 표시 — 계획서 문언 자체를 수정하지 않는다.

---

## §1. 필드명 확정 (겸용 PR#710 네이밍 컨벤션 준수)

| 개념 | 필드명 | 근거 |
|---|---|---|
| 건물 상속개시일 신고가액 (신규) | `gbBuildingInheritedValue: string` | `gb` 접두사(GeneralBuildingFormSlice 컨벤션) + `mixedHousingInheritedValueOverride` 대칭 네이밍 |
| 토지 상속개시일 평가액 (재사용) | `publishedValueAtInheritance: string` | 기존 `AssetForm` 필드(`lib/stores/calc-wizard-asset.ts:118`) — **신규 필드 생성 안 함** |
| API 게이트 — 토지 (신규, 서버 미저장) | `acquisitionByInheritance?: boolean` | 계획서 §4-5 정의 그대로 |
| API 게이트 — 건물 (신규, 서버 미저장) | `buildingAcquisitionByInheritance?: boolean` | **본 문서 확장(대칭 네이밍)** — 계획서 §4-5는 토지 게이트만 정의. 건물 독립 게이트는 §0 Phase 1 범위(C1=양쪽 상속) 검증 및 향후 Q3·Q4(Phase 2, 부분 상속) 대비용. 엔진 시니어 확인 필요 |
| API 신규 값 (신규, 서버 미저장) | `inheritedLandValue?: number` / `inheritedBuildingValue?: number` | 계획서 §4-2 "명시 2필드" |

`gbBuildingInheritedValue`는 **필요경비(자본적지출·양도비) 필드를 별도로 신설하지 않는다** — GB 자산의 필요경비는 이미 자산-수준 공통 필드(`directExpenses`/`capitalExpenditure`/`transferExpense`, `lib/calc/transfer-tax-api-helpers.ts:642-656`)로 assetKind 무관 범용 처리되며 상속 GB도 예외 없이 이 경로를 그대로 탄다. 겸용주택의 `mixedHousingInheritedExpense`/`mixedCommercialInheritedExpense`는 겸용 전용 파이프라인(범용 필드 배선 안 됨)이라 별도 필드가 필요했던 것과 다른 상황 — GB는 신설 불필요.

---

## §2. 8개 클라이언트 동기화 지점

### ① AssetForm 신규 필드

**파일**: `lib/stores/calc-wizard-asset-gb.ts` (`GeneralBuildingFormSlice` interface, 기존 gb* 필드 블록 말미 — `gbFirstDisclosureBuildingStdPrice` 다음, L145 이후)

```ts
// ── §163⑨ 상속 취득가액 직접 산정 (엔진 정합, Phase 1 = C1 토지·건물 모두 상속 전용) ──
/**
 * 상속개시일 건물 신고가액 (원, 문자열). gbBuildingAcquisitionCause === "inheritance" 시 필수.
 * 상속세 신고서·결정통지서상 건물 평가액(상증법 §60~66). 소령 §163⑨ 취득당시 실지거래가액 의제 —
 * 환산·개산공제(§163⑥) 미적용.
 * Phase 1은 공시된 정상 케이스만 지원(계획서 Q2) — §163⑨2호 미공시 건물기준시가 max 비교는 Phase 2.
 */
gbBuildingInheritedValue: string;
```

토지 측은 **신규 필드 없음** — `asset.publishedValueAtInheritance`(`lib/stores/calc-wizard-asset.ts:118`, `InheritanceAcquisitionFormSlice`) 재사용(계획서 §4-2 확정).

### ② initial value

**파일**: `lib/stores/calc-wizard-asset-factory.ts` — `makeDefaultAsset()`(L44) 반환 객체, 기존 gb* 초기값 블록(L305-341) 말미에 추가:

```ts
    // ── §163⑨ 상속 취득가액 직접 산정 (Phase 1) ──
    gbBuildingInheritedValue: "",
```

`publishedValueAtInheritance`는 이미 초기화되어 있음(변경 없음).

### ③ normalize fallback

**파일**: `lib/stores/calc-wizard-asset-migrate-phase3.ts` — `migrateGeneralBuildingFields(a)`(L14-86), 기존 gb* fallback 블록 말미(L66 `gbFirstDisclosureBuildingStdPrice` 다음)에 추가:

```ts
  // §163⑨ 상속 취득가액 직접 산정 (Phase 1) — 구 세션 복원 방어
  if (a.gbBuildingInheritedValue === undefined) a.gbBuildingInheritedValue = "";
```

호출부(`lib/stores/calc-wizard-asset-migrate.ts:502` `migrateGeneralBuildingFields(a)`)는 변경 없음 — 이미 이 함수를 호출 중.

### ④ API 변환 — `lib/calc/transfer-tax-api-helpers.ts` `buildGeneralBuildingValuation()`(L281-402)

**중요 실측 발견 (Do 단계에서 반드시 처리)**: 실거래가/감정가 모드 분기(L376-402, "경로 B")는 환산 모드 분기(L308-374, "경로 A")와 달리 `landAcquisitionCause`·`decedentAcquisitionDate`·`donorAcquisitionDate`를 반환 객체에 **포함하지 않는다**. C1(순수 상속·경로 B)이 정확히 이 분기를 타므로, 이 필드들을 추가하지 않으면 §95④ 단기보유 기산점(피상속인 취득일) 판정이 GB 상속 케이스에서 계속 깨진다. 이는 상속가액 배선과 독립된 기존 결함이지만 본 수정으로 반드시 함께 고친다(회귀 없이는 C1이 "취득가 0" 버그는 해결돼도 세율 구간이 틀릴 수 있음).

두 분기 모두에 다음 3개 신규 필드를 추가:

```ts
// §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1 전용 게이트)
// 계획서 §4-5: acquisitionByInheritance = acquisitionCause==="inheritance" && acquisitionDate>="1985-01-01"
const acquisitionByInheritance =
  asset.acquisitionCause === "inheritance" && asset.acquisitionDate >= "1985-01-01";
const buildingAcquisitionByInheritance =
  asset.gbBuildingAcquisitionCause === "inheritance" &&
  (asset.gbBuildingAcquisitionDate || asset.acquisitionDate) >= "1985-01-01";
```

**환산 모드 분기(L308-374, "경로 A") 반환 객체에 추가** — 기존 `...(asset.decedentAcquisitionDate ? {...} : {})` 블록(L334-339) 인근:

```ts
    ...(acquisitionByInheritance
      ? { acquisitionByInheritance, inheritedLandValue: parseAmount(asset.publishedValueAtInheritance) || undefined }
      : {}),
    ...(buildingAcquisitionByInheritance
      ? { buildingAcquisitionByInheritance, inheritedBuildingValue: parseAmount(asset.gbBuildingInheritedValue) || undefined }
      : {}),
```

**실가 모드 분기(L376-402, "경로 B") 반환 객체 — 신규 필드 + 기존 결측 필드(위 실측 발견) 함께 추가**:

```ts
  return {
    transferLandPricePerSqm,
    transferBuildingStdPrice,
    landArea,
    buildingFootprintArea,
    actualPriceMode: true,
    buildingAcquisitionCause: asset.gbBuildingAcquisitionCause || "purchase",
    isSelfBuilt: asset.gbBuildingAcquisitionCause === "newConstruction",
    ...(acquisitionLandPricePerSqm ? { acquisitionLandPricePerSqm } : {}),
    ...(acquisitionBuildingStdPrice ? { acquisitionBuildingStdPrice } : {}),
    // ↓ 신규: 실가 모드 분기에 그동안 누락돼 있던 상속·증여 보조 필드 (§95④ 단기보유 기산점)
    ...(asset.acquisitionCause && asset.acquisitionCause !== "newConstruction"
      ? { landAcquisitionCause: asset.acquisitionCause }
      : {}),
    ...(asset.decedentAcquisitionDate ? { decedentAcquisitionDate: asset.decedentAcquisitionDate } : {}),
    ...(asset.donorAcquisitionDate ? { donorAcquisitionDate: asset.donorAcquisitionDate } : {}),
    // ↓ 신규: §163⑨ 상속 취득가액 직접 산정
    ...(acquisitionByInheritance
      ? { acquisitionByInheritance, inheritedLandValue: parseAmount(asset.publishedValueAtInheritance) || undefined }
      : {}),
    ...(buildingAcquisitionByInheritance
      ? { buildingAcquisitionByInheritance, inheritedBuildingValue: parseAmount(asset.gbBuildingInheritedValue) || undefined }
      : {}),
    ...nblFields,
    ...(asset.gbHouseToCommercialConversion ? { ... } : {}),
  };
```

`bundledAcquisitionPrice` 침묵 0 fallback 금지 원칙(계획서 §4-2)은 이미 준수됨 — 상속 값은 별도 명시 필드로 전달하고, `bundledAcquisitionPrice`(사례 33 전용)는 건드리지 않는다.

### ⑤ UI 입력 위젯

**건물 — 신규 위젯**: `components/calc/transfer/GeneralBuildingAcquisitionCards.tsx`, amber 건물 카드 내부 L279 (현재 주석 `{/* 건물 상속·증여 보조 입력은 후속 PR에서 구현 (본 PR 스코프 미포함) */}`)를 대체:

```tsx
{asset.gbBuildingAcquisitionCause === "inheritance" && (
  <ToneCard
    tone="violet"
    title="상속개시일 건물 신고가액"
    titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
  >
    <CurrencyInput
      label=""
      value={asset.gbBuildingInheritedValue}
      onChange={(v) => onChange({ gbBuildingInheritedValue: v })}
      hint="상속세 신고서·결정통지서상 건물 평가액(상증법 §60~66). 상속개시일 평가액을 취득가액으로 직접 사용 — 환산·개산공제 미적용"
    />
  </ToneCard>
)}
```

신규 import 필요: `CurrencyInput`(`@/components/calc/inputs/CurrencyInput`), `LawArticleModal`(`@/components/ui/law-article-modal`) — 현재 파일에 없음(확인 완료, L1-28 import 목록에 부재).

**토지 — 신규 위젯 없음**: `asset.acquisitionCause === "inheritance"` 분기(L186-192)는 기존 `CompanionAcqInheritanceBlock` 그대로 렌더 — **코드 변경 없음**. 사용자가 "자산 구분" 라디오에서 "토지"를 선택하고 `PostDeemedInputs`(`components/calc/transfer/inheritance/PostDeemedInputs.tsx`)에서 신고가액 또는 보충적평가(개별공시지가×면적)를 입력하면 `publishedValueAtInheritance`에 총액(원)이 채워진다.

**⚠️ 구현 시 주의 (문서화만 — 코드 변경 아님)**: `PostDeemedInputs.tsx`의 "보충적평가 보조계산" 토글(isLand 분기, L229-248)은 GB 전용 `gbLandArea`가 아닌 범용 `supplementaryLandArea` 필드로 면적을 입력받는다. GB는 이미 섹션①(`GeneralBuildingBlock.tsx` L296-315)에서 `gbLandArea`를 필수 입력받으므로, 사용자가 두 면적을 다르게 입력하면 `publishedValueAtInheritance`(토지 총액)가 `gbLandArea` 기준과 불일치할 수 있다. 이는 GB에 국한된 문제가 아니라 일반 land 자산에도 이미 존재하는 기존 패턴(예: `acquisitionArea`와 `supplementaryLandArea` 분리)이므로 본 수정 범위에서 새로 만든 결함이 아니다 — `PostDeemedInputs.tsx`는 공용 컴포넌트라 GB 전용 분기 추가는 계획서의 "신규 토지 UI 신설 금지" 원칙과 충돌 위험이 있어 **본 Phase 1에서는 손대지 않는다**. 대신 `CompanionAcqInheritanceBlock` GB 렌더 지점(L186-192) 바로 위에 아래 캡션을 추가해 사용자에게 안내(신규 입력 필드 아님, 순수 안내문):

```tsx
{asset.acquisitionCause === "inheritance" && (
  <>
    <p className="text-caption text-muted-foreground px-1">
      아래 상속 평가액 산정 시 면적은 위 ① 토지면적({asset.gbLandArea || "미입력"}㎡)과 일치시켜 입력하세요.
    </p>
    <CompanionAcqInheritanceBlock asset={asset} onChange={onChange} transferDate={transferDate} />
  </>
)}
```

**UI 순서 검증**: `CompanionAcquisitionCauseSection`(→`GeneralBuildingAcquisitionCards`)이 `AssetSectionAcquisition.tsx:119`에서, `GeneralBuildingBlock`(기준시가 섹션)이 `AssetSectionAcquisition.tsx:272`에서 렌더 — 취득원인 카드가 기준시가 섹션보다 **먼저** 렌더됨(실측 확인). C1(양쪽 상속)에서는 `GeneralBuildingBlock`의 ③ 취득시 기준시가 섹션이 `isEstimated || gbHasExtension || burdened_gift` 게이트(`GeneralBuildingBlock.tsx:347`)로 인해 **숨겨지므로**, 상속 입력 위젯이 사실상 유일한 취득가액 입력 경로가 된다 — 엔진 로직 순서(취득원인 확정 → 취득가액 산정)와 UI 순서 일치.

### ⑥ 사이드바 합계 — 변경 없음 (검증 완료)

**파일**: `lib/stores/calc-wizard-store.ts` `computeTransferSummary()`(L417), `totalAcqPrice` 리듀서(L437-445).

`totalAcqPrice`는 `a.fixedAcquisitionPrice`(또는 `similarSalesValue`)만 합산한다. GB 자산은 상속 모드든 환산 모드든 `fixedAcquisitionPrice`를 채우지 않는다(`buildAssetPayload`의 `fixedAcqRaw` 산정식, `lib/calc/transfer-tax-api-helpers.ts:563-569`은 purchase(actual)·gift·newConstruction만 채움) — 따라서 GB 상속 자산은 **이미 기존 환산 GB와 동일하게** 사이드바 합계에서 자연 제외된다(0 표시 아님, 항목 자체 미기여). 계획서 §4-8 "결과 도착 후 노출"은 이 기존 동작을 그대로 유지하라는 의미로 확인됨 — **코드 변경 불필요**.

### ⑦ 결과 카드 산식·표시

**파일**: `lib/tax-engine/general-building-valuation.ts` `GeneralBuildingOutput` 타입(L386-438) — echo 필드 추가 (엔진 시니어 STEP 5 대상, 여기서는 UI가 소비할 계약만 명시):

```ts
  /** §163⑨ 상속 취득가액 직접 산정 여부 — 토지분(결과 카드 라벨 분기용, Phase 1 echo). */
  acquisitionByInheritance?: boolean;
  /** §163⑨ 상속 취득가액 직접 산정 여부 — 건물분. */
  buildingAcquisitionByInheritance?: boolean;
```

`acquisition.land`/`acquisition.building`(기존 필드, `GeneralBuildingAcquisition` 타입)은 상속 케이스에서 환산값 대신 `inheritedLandValue`/`inheritedBuildingValue`를 그대로 담아 반환 — **별도 echo 불필요**(값 자체가 이미 정확한 취득가액). `estimatedDeduction.land`/`.building`은 상속분에 대해 0(개산공제 미적용, 계획서 §4-3).

**파일**: `components/calc/results/GeneralBuildingValuationDetailCard.tsx` — `detail.acquisitionByInheritance`/`detail.buildingAcquisitionByInheritance`로 라벨 분기.

Section ②(현재 L189-231, `SectionTitle number="②"`) 제목·산식 텍스트 분기:

```tsx
const isLandInherited = !!detail.acquisitionByInheritance;
const isBuildingInherited = !!detail.buildingAcquisitionByInheritance;

<SectionTitle
  number="②"
  text={
    isLandInherited && isBuildingInherited
      ? "취득가액 (상속개시일 평가액 — 소득세법 시행령 §163⑨)"
      : "환산취득가 (시행령 §176의2②)"
  }
  tone="amber"
/>
```

산식 블록(L213-230) 분기:

```tsx
{isLandInherited && isBuildingInherited ? (
  <>
    <p>토지 취득가액 = 상속개시일 토지 평가액(상증법 §60~66, 신고가액 또는 보충적평가)</p>
    <p className="pl-2">= <span className="font-semibold tabular-nums">{formatKRW(acquisition.land)}</span></p>
    <p>건물 취득가액 = 상속개시일 건물 신고가액(상증법 §60)</p>
    <p className="pl-2">= <span className="font-semibold tabular-nums">{formatKRW(acquisition.building)}</span></p>
    <p className="text-amber-600">취득당시 실지거래가액으로 의제(소령 §163⑨) — 환산·개산공제 미적용</p>
  </>
) : (
  /* 기존 환산 산식 그대로 (exprVal 분기 포함) */
)}
```

Section ③(L233-262, "기타필요경비 — 개산공제") 분기 — 상속 케이스는 개산공제가 항상 0이지만, "왜 0인지"를 명시하지 않으면 계산 오류처럼 보일 위험(법정 용어 우선 원칙):

```tsx
<SectionTitle
  number="③"
  text={
    isLandInherited && isBuildingInherited
      ? "기타필요경비 — 개산공제 미적용 (소령 §163⑨ 실지거래가액 의제)"
      : "기타필요경비 — 개산공제 (시행령 §163⑥, 등기 자산 3%)"
  }
  tone="sky"
/>
{isLandInherited && isBuildingInherited ? (
  <p className="text-xs text-sky-800">
    상속개시일 평가액을 취득당시 실지거래가액으로 보므로(소령 §163⑨), 환산취득가 전용 개산공제(§163⑥)는 적용하지 않습니다.
  </p>
) : (
  /* 기존 산식 텍스트 그대로 */
)}
```

Section ④·⑤(자산별 통산 표) — `estimatedDeduction.land/building`이 0이므로 표 자체는 코드 변경 없이 정확히 표시됨(값 기반, 라벨 불변).

호출부(`components/calc/results/TransferTaxResultView.tsx:582-592`)는 **변경 없음** — `detail` prop 하나로 이미 전체 `GeneralBuildingOutput`을 전달 중이므로 신규 echo 필드는 `detail.acquisitionByInheritance` 형태로 자동 도달.

### ⑧ Validation — `lib/calc/transfer-tax-validate-gb.ts` `validateGeneralBuildingAsset()`

기존 환산/실가 모드 분기(L88-125) 다음, "공통 취득일 검증"(L128) 이전에 신규 블록 삽입:

```ts
  // ── §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1 전용, 계획서 §0) ──
  const isLandInherited = asset.acquisitionCause === "inheritance";
  const isBuildingInherited = asset.gbBuildingAcquisitionCause === "inheritance";

  if (isLandInherited || isBuildingInherited) {
    // Phase 1 = C1(토지·건물 모두 상속) 단독 지원. 부분 상속 조합은 Q3·Q4 미해소로 차단.
    if (isLandInherited !== isBuildingInherited) {
      return `${label}: 일반건물의 토지·건물 중 한쪽만 상속으로 취득한 조합은 아직 지원하지 않습니다. (토지·건물 모두 상속이거나, 모두 상속이 아니어야 합니다)`;
    }
    if (asset.useEstimatedAcquisition || asset.gbHasExtension) {
      return `${label}: 상속 취득 일반건물은 환산취득가·증축 조합을 지원하지 않습니다. 실거래가 모드(환산취득가 토글 OFF·증축 토글 OFF)로 입력하세요.`;
    }
    if (!parseAmount(asset.publishedValueAtInheritance)) {
      return `${label}: 상속개시일 토지 평가액을 입력하세요. (자산 구분 "토지" 선택 후 상속세 신고가액 또는 보충적평가)`;
    }
    if (!parseAmount(asset.gbBuildingInheritedValue)) {
      return `${label}: 상속개시일 건물 신고가액을 입력하세요.`;
    }
  }
```

**배치 근거**: `useEstimatedAcquisition || gbHasExtension` 모드별 검증 블록(L90-125)이 이미 통과된 뒤 실행되므로, 위 "환산·증축 조합 차단" 검사는 그 두 블록이 요구하는 필드(취득시 기준시가 등)가 이미 채워진 상태에서도 최종적으로 상속 조합을 걸러낸다 — 검증 순서상 문제없음(모드별 1차 검증 통과 → 상속 정합성 2차 검증).

**3중 fallback 동기화 표**:

| 필드 | UI display | API(④) | validate(⑧) |
|---|---|---|---|
| 토지 상속평가액 | `asset.publishedValueAtInheritance` (CompanionAcqInheritanceBlock, 변경 없음) | `parseAmount(asset.publishedValueAtInheritance)` | `parseAmount(asset.publishedValueAtInheritance) > 0` 필수 |
| 건물 상속평가액 | `asset.gbBuildingInheritedValue` (신규 위젯) | `parseAmount(asset.gbBuildingInheritedValue)` | `parseAmount(asset.gbBuildingInheritedValue) > 0` 필수 |

자동 안분 fallback 없음(계획서 §4-2 "침묵 0 fallback 금지" 준수) — 두 값 모두 미입력 시 명확한 오류 메시지로 차단, 엔진에 0/undefined 도달 없음.

---

## §3. 위젯 ASCII 목업

### 건물 취득 카드 (amber, `GeneralBuildingAcquisitionCards.tsx`) — `gbBuildingAcquisitionCause === "inheritance"` 선택 시

```
┌─ 🏗 건물 취득 ────────────────────────────────────────────┐
│ 취득원인:  [ 매매 ] [●상속] [ 증여 ] [ 신축(자가건축) ]      │
│                                                             │
│ 건물 취득일                                                 │
│  hint: 건물 매매·상속·증여 등기접수일 또는 잔금청산일         │
│  [ YYYY ] [ MM ] [ DD ]                                    │
│                                                             │
│ ┌─ 상속개시일 건물 신고가액 ────────── [소령 §163⑨] ──────┐ │
│ │ (violet ToneCard)                                       │ │
│ │  [                                              ] 원     │ │
│ │  hint: 상속세 신고서·결정통지서상 건물 평가액             │ │
│ │        (상증법 §60~66). 상속개시일 평가액을 취득가액으로  │ │
│ │        직접 사용 — 환산·개산공제 미적용                   │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 토지 취득 카드 (sky) — `acquisitionCause === "inheritance"` 선택 시 (기존 컴포넌트, 캡션만 추가)

```
┌─ 📌 토지 취득 ────────────────────────────────────────────┐
│ 취득원인:  [ 매매 ] [●상속] [ 증여 ] [ 이월과세(증여) ]     │
│                                                             │
│  ※ 아래 상속 평가액 산정 시 면적은 위 ① 토지면적(150㎡)과   │
│     일치시켜 입력하세요.                                    │
│                                                             │
│ ┌─ (기존 CompanionAcqInheritanceBlock — 변경 없음) ───────┐ │
│ │ 상속개시일: [ YYYY-MM-DD ]  피상속인 취득일: [ ... ]     │ │
│ │ 자산 구분 (상속개시일 기준)      [소령§163⑨][상증법§61]  │ │
│ │  (●) 토지 (공시지가 × 면적)                              │ │
│ │  ( ) 개별·다세대주택                                     │ │
│ │  ( ) 공동주택                                            │ │
│ │                                                          │ │
│ │ 의제취득일 이후 상속 — 상속세 신고가액을 취득가로 인정     │ │
│ │  상속세 신고 시 평가방법: [ 보충적평가액 ▾ ]              │ │
│ │  상속세 신고가액: [                    ] 원              │ │
│ │  ⊞ 보충적평가 보조계산 사용                               │ │
│ │     개별공시지가(원/㎡): [        ]  면적(㎡): [    ]     │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 결과 카드 — `GeneralBuildingValuationDetailCard.tsx` Section ②③ (C1, 상속 케이스)

```
② 취득가액 (상속개시일 평가액 — 소득세법 시행령 §163⑨)
┌────────────┬────────────┬────────────┬────────────┐
│ 구분        │ 토지        │ 건물        │ 합계        │
├────────────┼────────────┼────────────┼────────────┤
│ 취득가액     │ 84,000,000 │ 45,000,000 │ 129,000,000│
└────────────┴────────────┴────────────┴────────────┘
 산식
  토지 취득가액 = 상속개시일 토지 평가액(상증법 §60~66, 신고가액 또는 보충적평가)
              = 84,000,000
  건물 취득가액 = 상속개시일 건물 신고가액(상증법 §60)
              = 45,000,000
  취득당시 실지거래가액으로 의제(소령 §163⑨) — 환산·개산공제 미적용

③ 기타필요경비 — 개산공제 미적용 (소령 §163⑨ 실지거래가액 의제)
  상속개시일 평가액을 취득당시 실지거래가액으로 보므로(소령 §163⑨), 환산취득가
  전용 개산공제(§163⑥)는 적용하지 않습니다.
```

---

## §4. 사용자 시나리오

### 시나리오 C1 — 토지·건물 모두 상속 (Phase 1 주 대상, §1 버그의 직접 수정)

1. 자산 종류 = "일반건물(토지+건물 일괄)" 선택.
2. 📌 토지 취득 카드 → 취득원인 "상속" 선택 → `CompanionAcqInheritanceBlock` 노출.
   - 상속개시일·피상속인 취득일 입력.
   - "자산 구분" = "토지" 선택 → 평가방법 "보충적평가액" → "보조계산 사용" ON → 개별공시지가·면적(= ① 토지면적과 일치) 입력 → `publishedValueAtInheritance` 자동 채움.
3. 🏗 건물 취득 카드 → 취득원인 "상속" 선택 → 건물 취득일 입력 → 신규 violet 카드에 상속개시일 건물 신고가액 입력.
4. `GeneralBuildingBlock` ① 면적·규모(토지면적·건물 수평투영면적) 입력. ② 양도시 기준시가(§166⑥ 안분 비율용 — 상속이어도 양도가액 안분에는 필요, 계획서 §2 결론) 입력. ③ 취득시 기준시가 섹션은 `useEstimatedAcquisition`/`gbHasExtension`이 모두 false이므로 **숨겨짐**(정상 — 환산 정보 불필요).
5. ④ 비사업용토지 판정 섹션(용도지역 등) 입력.
6. 계산하기 → 결과 화면: `GeneralBuildingValuationDetailCard` Section②가 "취득가액 (상속개시일 평가액)" 라벨로 토지 84,000,000 + 건물 45,000,000을 그대로 표시, Section③은 "개산공제 미적용" 안내.

### 시나리오 C2 — 토지 매매 + 건물 상속 (Phase 1 명시적 차단)

1. 📌 토지 취득 카드 → "매매" 선택 → `useEstimatedAcquisition` 토글 ON(환산취득가 모드).
2. 🏗 건물 취득 카드 → "상속" 선택 → violet 카드에 신고가액 입력.
3. 계산하기 클릭 → **`⑧ validate` 차단**: "일반건물의 토지·건물 중 한쪽만 상속으로 취득한 조합은 아직 지원하지 않습니다." (토지=매매, 건물=상속 → `isLandInherited(false) !== isBuildingInherited(true)`)
4. 사용자가 토지도 "상속"으로 변경하거나, 건물을 "매매"로 되돌리면 계산 가능.

이 차단은 §0에서 결정한 Phase 1 범위(C1 단독)의 직접적 결과이며, 계획서 Q3가 Phase 2로 이월됨을 사용자에게도 일관되게 전달한다(엔진이 조용히 틀린 값을 내는 대신 명확한 오류로 차단 — CLAUDE.md 설계 원칙).

---

## §5. Validation 규칙 표

| # | 조건 | 규칙 | 오류 메시지 |
|---|---|---|---|
| V1 | `acquisitionCause === "inheritance"` XOR `gbBuildingAcquisitionCause === "inheritance"` | 차단 (Phase 1 = C1 단독) | "토지·건물 중 한쪽만 상속으로 취득한 조합은 아직 지원하지 않습니다." |
| V2 | 양쪽 상속 AND (`useEstimatedAcquisition` OR `gbHasExtension`) | 차단 | "환산취득가·증축 조합을 지원하지 않습니다. 실거래가 모드로 입력하세요." |
| V3 | 양쪽 상속 AND `publishedValueAtInheritance` 미입력/0 | 차단 | "상속개시일 토지 평가액을 입력하세요." |
| V4 | 양쪽 상속 AND `gbBuildingInheritedValue` 미입력/0 | 차단 | "상속개시일 건물 신고가액을 입력하세요." |

V1~V4는 기존 면적·용도지역·양도시 기준시가 필수 검증(L60-82)과 **AND** 관계 — 상속 여부와 무관하게 항상 먼저 통과해야 함.

---

## §6. testid·E2E 셀렉터 후보

겸용주택 E2E(`e2e/mixed-use-inheritance-acquisition.spec.ts`) 패턴 재사용 — `data-testid` 신설 없이 텍스트/라벨 기반 셀렉터(프로젝트 컨벤션, `e2e/CLAUDE.md`):

```ts
// e2e/general-building-inheritance-acquisition.spec.ts (신규 파일 후보)
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "general_building",
          acquisitionCause: "inheritance",
          acquisitionDate: "2017-09-15",
          decedentAcquisitionDate: "2010-02-02",
          inheritanceAssetKind: "land",
          publishedValueAtInheritance: "84000000",
          gbBuildingAcquisitionCause: "inheritance",
          gbBuildingAcquisitionDate: "2017-09-15",
          gbBuildingInheritedValue: "45000000",
          gbLandArea: "150",
          gbBuildingFootprintArea: "80",
          gbTransferLandPricePerSqm: "3000000",
          gbTransferBuildingValue: "60000000",
          gbZoneType: "general_residential",
          gbIsMetropolitan: true,
        }],
        transferDate: "2025-06-01",
        // ...
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

// 결과 검증 후보:
await expect(page.getByText("취득가액 (상속개시일 평가액")).toBeVisible();
await expect(page.getByText("개산공제 미적용")).toBeVisible();
await expect(page.getByText("환산취득가 (시행령")).toHaveCount(0);
```

`getByText` count·정확한 문자열은 실제 렌더 후 throwaway probe로 재확인 필요(`e2e/CLAUDE.md` §4 "추정 금지" — Do 단계에서 확정).

V1 차단 검증(C2 시나리오) 별도 spec:

```ts
await page.getByRole("button", { name: "세금 계산하기" }).click();
await expect(page.getByText("한쪽만 상속으로 취득한 조합")).toBeVisible();
```

---

## §7. 자가 점검 — 8지점 도달 확인

- [x] ① AssetForm — `gbBuildingInheritedValue` (`calc-wizard-asset-gb.ts`), 토지는 기존 `publishedValueAtInheritance` 재사용
- [x] ② initial — `makeDefaultAsset()` gb* 블록에 `gbBuildingInheritedValue: ""`
- [x] ③ normalize — `migrateGeneralBuildingFields()`에 fallback 추가
- [x] ④ API 변환 — `buildGeneralBuildingValuation()` 양쪽 분기(환산·실가)에 `acquisitionByInheritance`·`inheritedLandValue`·`buildingAcquisitionByInheritance`·`inheritedBuildingValue` + 실가 분기 결측 필드(`landAcquisitionCause`·`decedentAcquisitionDate`·`donorAcquisitionDate`) 보강
- [x] ⑤ UI 위젯 — 건물 신규 ToneCard(amber 카드 내), 토지는 무변경(캡션만 추가)
- [x] ⑥ 사이드바 — 코드 변경 불필요(검증 완료, 기존 동작이 이미 계획서 요구사항 충족)
- [x] ⑦ 결과 카드 — `GeneralBuildingOutput`에 echo 2필드(엔진 시니어 STEP 5 대상) + `GeneralBuildingValuationDetailCard` Section②③ 라벨·산식 분기
- [x] ⑧ validation — `validateGeneralBuildingAsset()`에 V1~V4 신규 블록, 3중 fallback 표 일치(UI=API=validate 모두 `publishedValueAtInheritance`/`gbBuildingInheritedValue` 동일 소스)

정책 자가 점검:
- 자동 안분 fallback 없음 — 토지·건물 평가액 모두 미입력 시 validate가 명확히 차단(§163⑨은 PHD §164⑦ 면적안분 예외 대상 아님).
- useEffect→store 미러링 없음 — 모든 신규 onChange는 직접 patch.
- mirror-pattern(3중) — §2 ⑧ 표로 UI/API/validate 동일 소스 확인.
- UI 순서=엔진 순서 — §2 ⑤ "UI 순서 검증" 문단.
- ToggleCard/RadioCardGroup — 신규 위젯은 라디오·토글이 아닌 단순 조건부 CurrencyInput(ToneCard 컨테이너)이라 해당 없음. 기존 취득원인 라디오(`RadioCardGroup`)는 무변경.

---

## §8. 엔진/Route 후속 조치 필요 사항 (본 UI 문서 범위 밖 — 인계)

STEP 5(엔진 설계문서) 미생성 상태에서 아래는 본 UI 설계가 전제하는 **엔진·Route 계약**이며, transfer-tax-senior의 후속 설계·구현이 필요합니다:

1. **`GeneralBuildingInput` 타입 확장**(`lib/tax-engine/general-building-valuation.ts:56`): `acquisitionByInheritance?`·`buildingAcquisitionByInheritance?`·`inheritedLandValue?: number`·`inheritedBuildingValue?: number` 4필드 추가.
2. **`buildGeneralBuildingAssetCards()`/`buildGeneralBuildingAssetCardsWithExtension` 신규 분기**: 위 게이트 true 시 §176의2② 환산 계산을 건너뛰고 `acquisition.land = inheritedLandValue`, `acquisition.building = inheritedBuildingValue`, `estimatedDeduction.land = estimatedDeduction.building = 0` 직접 대입. 참고 구현: `lib/tax-engine/inheritance-acquisition-price.ts` `calcPostDeemed()`(계획서 §3).
3. **`GeneralBuildingOutput`에 echo 2필드 추가**(§2 ⑦에 명시) — `acquisitionByInheritance`·`buildingAcquisitionByInheritance`.
4. **실측 발견 — `app/api/calc/transfer/general-building-route-helper.ts:314-338`**: `dispatchGeneralBuilding()`의 `actualPriceMode === true` 분기(`calculateGeneralBuildingActualTransfer` 호출부)는 `coercedGbRaw`에 이미 존재하는 `landAcquisitionCause`·`decedentAcquisitionDate`·`donorAcquisitionDate`·(본 설계의 신규 4필드)를 **명시적으로 전달하지 않는다**(L316-335 object literal이 필드를 하나씩 나열). 클라이언트 ④가 아무리 정확히 값을 보내도 이 route-helper의 명시적 spread 누락으로 엔진에 도달하지 못한다 — Do 단계에서 엔진 시니어가 반드시 이 object literal에 필드를 추가해야 함([[feedback_explicit_prop_mapping_strip]] 패턴과 동일 위험군).
5. **`calculateGeneralBuildingActualTransfer` 입력 타입**(route-helper.ts:435 인근) 확장 — 위 4개 상속 필드 + 3개 기존 결측 필드 수신.
6. **Zod 스키마**(`lib/api/transfer-tax-building-schemas.ts:21` `generalBuildingValuationSchema`): `acquisitionByInheritance`·`buildingAcquisitionByInheritance`(boolean, optional)·`inheritedLandValue`·`inheritedBuildingValue`(number, int, positive, optional) 4필드 추가 — 미정의 시 침묵 stripping(⑫).

이 6개 항목은 본 UI 설계 문서의 "확정 결정"이 아니라 **엔진 시니어에게 전달하는 요구 계약**입니다 — Do 단계에서 엔진·UI 시니어가 시퀀셜로 작업(CLAUDE.md 워크플로: 엔진이 타입·헬퍼 선처리 → UI가 ⑤⑥⑦ 담당)하되, 본 문서의 ④ 클라이언트 payload 필드명이 엔진 input 필드명과 정확히 일치해야 합니다(위 1번 타입에 그대로 반영).

---

## §9. 범위 밖 — 계획서 §7 그대로 승계

- 상가건물(commercial_building) 상속 버그 — 별도 후속(사용자 "일반건물 먼저").
- Q3(C2/C2′)·Q4(C3) 부분 상속 조합 — Phase 2, 본 문서 §0에서 명시적 차단 처리.
- Q5(부담부증여·NBL·용도변경·증축과 상속 조합) — 기존 validate 조기 차단(L34 `isBurdenedGiftGB` 분기는 상속 분기보다 먼저 return하므로 자동 상호배타. 증축·용도변경은 V2로 이미 차단됨).
- §163⑨1·2호 미공시 max 비교(계획서 Q2 Phase 2) — 건물기준시가 위젯은 본 Phase 1에 포함하지 않음.

---

관련: [[project_transfer_special_engine_inheritance_acquisition_bugs]] · [[transfer-mixed-use-inheritance-acquisition.ui.design.md]] · [[mirror-pattern]] · [[feedback_no_silent_apportion_fallback]] · [[feedback_explicit_prop_mapping_strip]] · [[feedback_ui_input_path_enumeration]]
