# 토지·건물 취득시기 상이 — 취득가액 축 재설계 · UI 설계 (rev.3)

> 계획서: `transfer-separate-acq-date-per-part-completion.plan.md` (rev.3) · 엔진: `.engine.design.md` (rev.3)
> 대상: `CompanionAcqPurchaseBlock.tsx` · `LandBuildingSplitSection.tsx` · 사이드바 2함수 · 결과뷰 3파일
> 정책: `components/calc/CLAUDE.md` (ToneCard·라벨 정본 클래스·RadioCardGroup·LandPriceLookupField·모달 런처·placeholder 숫자예시 금지)
>
> **rev.3 = STEP 1 6-way 자가검토 반영.** rev.1 대비 폐기·정정은 §0.

---

## 0. rev.1 대비 폐기·정정

| rev.1 항목 | 판정 | 사유 |
|---|---|---|
| 상단 블록 **통째** 숨김 | **범위 축소** | 숨김 fragment(`:306-609`) 안에 **PHD 토글**(`:436`, 조건이 `isSplit` 명시 포함)·**토지면적**(`:559-560`·`:466`)이 있어 함께 소실 |
| 게이트 `isSplit` | **`isSeparateAcquisition`으로 교체** | `isSplit`은 겸용주택(`MixedUseSection.tsx:48`)·`selfOwns≠both`(`CompanionAcquisitionCauseSection.tsx:179`)로도 켜진다 — 함께 취득 자산 오포섭 |
| 파트 모드 `"actual"` 하드코딩 초기화 | **`deriveLegacyPartAcqMode(asset)`** | 상단에서 이미 환산·감정을 고른 사용자의 선택이 조용히 실거래가로 바뀜 |
| `StandardPriceInput` 코드샘플 | **`LandPriceLookupField`(토지)** | 문서 내 자기모순(57행↔63행). 선례 `GeneralBuildingBlock.tsx:328,356` |
| 신규 echo `stdPriceAtAcquisition` | **폐기 → `stdPriceAtAcq` 재사용** | `transfer-split-gain.types.ts:39`에 이미 존재 |
| ⑥ 사이드바 1파일 | **2함수** | `transfer-per-asset-summary.ts:72-75` `directAcqRaw()` **+** `calc-wizard-store.ts:435` `computeTransferSummary` 둘 다 `fixedAcquisitionPrice` 의존 |
| "취득가액 합계" 부분합 표시 | **금지** | 미확정 파트 제외한 부분합을 합계로 표시하면 총액 오독(`feedback_engine_result_display_drift`) |
| `apr` testid = `act`와 동일 | **분리** | E2E에서 두 모드 구분 불가 |

---

## 1. 게이트 — `isSeparateAcquisition` (단일 헬퍼)

```ts
// lib/calc/transfer-tax-split-acq-mode.ts 에 export (UI·API·validate·엔진 공유 — dual-truth 방지)
export function isSeparateAcquisition(asset: AssetForm): boolean {
  return !!asset.hasSeperateLandAcquisitionDate
    && !!asset.landAcquisitionDate
    && asset.landAcquisitionDate !== asset.acquisitionDate
    && !asset.isMixedUseHouse;
}
```

| 진입 경로 | 날짜 상이 | 겸용 | 신모델 적용 |
|---|---|---|---|
| ① 취득일 다름 토글 | ✓ | ✗ | **적용** |
| ② `selfOwns ≠ both` 강제 | 날짜 같으면 ✗ | ✗ | 미적용(현행 유지) |
| ③ 겸용주택 강제 | — | ✓ | **미적용**(§14) |

> ②는 날짜가 실제로 다르면 적용된다 — 소유자 분리 자체가 배제 사유는 아니다.

---

## 2. 화면 구조 (분리 모드 ON, `propertyType` 공통)

```
┌ 건물 취득일 (사용승인일·매매 등기접수일)  [토지·건물 취득일 다름 ●]
│  2025 - 08 - 29        [의제취득(§98) 배지 — 게이트 밖, 소실 없음]
│  [토지·건물 소유자 다름 ○]
│
│  ⚠️ 취득 당시 개별주택가격 미공시 (§164⑤ 3-시점 계산)  ← PHD 토글: **게이트 밖으로 이동**
│
│  ── 축 A 상단 입력("취득가액 산정 방식"·"취득가액") 미표시 ──
│  [ToneCard amber] 토지·건물 취득일이 다르므로 취득가액은 토지·건물 각각 아래에서
│                   산정합니다. 별개 거래로 취득한 자산에는 하나의 총 취득가액이
│                   존재하지 않습니다 (소득세법 §114⑦·시행령 §176의2③).
│
│  ── 축 B 취득시 기준시가 — **숨기지 않는다** (P1에서 이미 노출, PR #837) ──
│  housing  : 라목 결합 총액 3요소 (총액 · ㎡당 공시지가 · 토지면적)  ← 상단 공용 유지
│  building : 파트 블록으로 이동 (토지=가목/토지취득일, 건물=나목/건물취득일)
│
├ 토지 취득일   2025 - 01 - 08
│
├ ┌ 취득가액 산정 방식 — 토지·건물 독립 선택   [§166⑥ 안분 ↗]
│ │ ① 토지 취득가액 방식   ⦿실거래가 ○환산취득가 ○감정가액 ○매매사례가액
│ │    └ 방식별 완결 입력 (§3)
│ │ ② 건물 취득가액 방식   ⦿실거래가 ○환산취득가 ○감정가액 ○매매사례가액
│ │    └ 방식별 완결 입력 (§3)
│ │ ▸ 토지 100,000,000 · 건물 계산 후 확정        ← "합계" 라벨 금지 (§5)
│ └
└ 이 자산의 토지·건물 양도가액 결정 방식  ⦿구분양도 ○일괄양도   ← 현행 유지
```

---

## 3. 파트 블록 입력 매트릭스

`part` = `land` | `building`. 기준일: 토지 → `landAcquisitionDate`, 건물 → `acquisitionDate`.

### 3-A. 축 A (취득가액) — **양 propertyType 공통**

| 방식 | 입력 | 필수 | testid |
|---|---|---|---|
| 실거래가 `act` | `{파트} 취득가액` | ✅ | `split-{part}-acq-price` (기존) |
| 감정가액 `apr` | `{파트} 감정가액` | ✅ | **`split-{part}-appraisal-value` (신규 — act와 분리)** |
| 매매사례가액 `sc` | `{파트} 매매사례가액` (취득일 ±3개월 §176의2③1호) | ✅ | `split-{part}-salescase-value` (기존) |
| 환산취득가 `est` | (금액 입력 없음 — 축 B에서 산출) | — | — |

- `apr`은 **저장 필드가 `land/buildingAcquisitionPrice`로 `act`와 동일**(Q3 재사용)하되 **testid·라벨은 분리**한다 — 저장 단일화와 테스트 식별성은 별개 문제다.
- placeholder `"미입력 시 나머지에서 자동 계산"` **삭제** — 잔액 규칙 폐지로 거짓 안내가 된다. 대체 문구 없음(빈 placeholder).

### 3-B. 축 B (취득시 기준시가)

| propertyType | 위치 | 위젯 | testid |
|---|---|---|---|
| `housing` | **상단 공용 유지** | `StandardPriceInput`(라목 총액 + ㎡당 공시지가 + 면적). 기준일 = `acquisitionDate` | 기존 |
| `building` 토지 | 파트 블록 | **`LandPriceLookupField`** (선례 `GeneralBuildingBlock.tsx:328`). 기준일 = `landAcquisitionDate` | `split-land-std-acq` (신규) |
| `building` 건물 | 파트 블록 | **`BuildingStdPriceModalButton`** + `snapshotKey={`bsp-${assetId}-split-acq`}` (선례 `:342,370`) | `split-building-std-acq` (신규) |

- `BuildingStdPriceModalButton`은 「건물 기준시가 계산서」 서식 출력의 스냅샷 소스다 — 누락 시 서식이 비어 출력된다.
- 양도시 기준시가는 **현행 유지** — 파트별 `split-{part}-std-transfer`(기존, `LandBuildingSplitSection.tsx:241-250`)와 상단 공용(환산 모드 전용, P1에서 게이팅 완료).

### 3-C. 게이트 밖으로 이동해야 하는 위젯 (숨김 부작용 차단)

| 위젯 | 현 위치 | 조치 |
|---|---|---|
| PHD 토글 + `PreHousingDisclosureSection` | `CompanionAcqPurchaseBlock.tsx:436-452` (숨김 fragment 내부, 조건에 `isSplit` 포함) | **게이트 밖으로 이동** — 양도가액 분리 블록(`:612-617`)이 이미 쓰는 패턴 |
| 토지면적 `acquisitionArea` | `:559-560`(StandardPriceInput `area`)·`:466`(SalesCaseSection) | `housing`은 축 B 상단 유지로 자동 해소. `building`은 **파트 블록 토지 행에 필수 포함** |
| `usePreHousingDisclosure` 자동 ON useEffect | `:107-121` (게이트 밖) | PHD 토글 이동으로 동반 해소 — 미해소 시 "플래그 true인데 UI 없음" 상태 발생 |

**비이슈 확인분**(오탐 방지): `Pre1990LandValuationInput`(`:574-584`)은 `showPre1990 = isLand && …`이고 `isSplitable = housing|building`(`:131-132`)이라 분리 모드와 **상호배타** → 소실 없음. 의제취득 배지(`:175-179`·`:626-630`)는 게이트 밖 → 소실 없음. 분리 토글은 housing/building에만 노출되어 `commercial_building`·`general_building`·`land`·`redevelopment_apt`와 충돌 없음.

---

## 4. 상단 축 A 숨김 구현

`CompanionAcqPurchaseBlock.tsx:306`의 기존 조건부 숨김 패턴을 확장한다:

```tsx
{props.asset?.transferType !== "burdened_gift"
  && props.asset?.assetKind !== "redevelopment_apt"
  && !isSeparateAcq && (              // ← 추가
  <>
    <label>취득가액 산정 방식</label> … <CurrencyInput label="취득가액 (원)" … />
  </>
)}
{isSeparateAcq && (
  <ToneCard tone="amber" data-testid="split-acq-total-note"> … </ToneCard>
)}
```

- 폼 상태(`useEstimatedAcquisition`·`fixedAcquisitionPrice`)는 **보존**한다 — 토글을 끄면 복원되어야 하므로. 선례는 **부담부증여** 숨김(`:264-266` 주석: "폼 상태(useEstimatedAcquisition·fixedAcquisitionPrice 등)는 보존하여"). ※ `redevelopment_apt` 주석(`:284-286`)에는 폼 상태 보존 언급이 없다.
- ⚠️ **stale 전송 가드 필수**: 숨김+보존 패턴은 **이미 실사고 선례**가 있다 — `burdened-gift-stale-acq-method.anchor.test.ts`(stale 취득방식이 §159 안분 취득가액을 덮어써 과소납부). 따라서 **API 변환에서 `isSeparateAcquisition`일 때 `fixedAcquisitionPrice`·`appraisalValue`·`similarSalesValue`를 축 A로 전송하지 않는다**(⑬). 동형 anchor 신설.

---

## 5. 파트 모드 초기화 (3중 패턴)

```tsx
// 토글 onChange 핸들러에서 단일 배치 update (useEffect → store 미러링 금지)
onCheckedChange={(v) => onChange({
  hasSeperateLandAcquisitionDate: v,
  ...(v ? {
    landAcqMode: deriveLegacyPartAcqMode(asset),      // "actual" 하드코딩 금지
    buildingAcqMode: deriveLegacyPartAcqMode(asset),
  } : {}),
})}
```

| 지점 | 값 | 근거 |
|---|---|---|
| ② factory default | `""` 유지 | 비분리 자산은 파트 모드 무의미. 분리 진입 시 onChange가 기록 |
| ③ normalize | `""` 가드만 | ②③ 경로(selfOwns·겸용)로 진입해 `""` 잔류하는 경우 대비 |
| ⑤ UI display | `value={asset.landAcqMode}` **직접** | `|| "actual"` display fallback **금지** (3중 불일치 원인) |
| ④⑧ API·validate | `effectivePartAcqMode(explicit, asset)` | 기존 단일 소스 유지 |

> 다중 키를 한 번에 바꾸므로 **단일 배치 `onChange`**로 처리한다(`feedback_multikey_patch_stale_spread_overwrite` — 분리 호출 시 stale spread로 덮어쓰기 발생).

---

## 6. 합계 표시 — "합계" 라벨 금지

```
▸ 토지 100,000,000 · 건물 계산 후 확정
```

- 환산·매매사례 파트는 계산 전 금액이 없다. 미확정 파트를 제외한 부분합을 「취득가액 합계」로 표시하면 사용자가 총액으로 오독한다.
- 결과 도착 후에는 `SplitPartResult.acquisitionPrice` 합계로 대체 표시.
- ⑥ 사이드바 **2함수 모두** 수정: `transfer-per-asset-summary.ts:72-75` `directAcqRaw()`(현재 `isSalesCaseAcquisition ? similarSalesValue : fixedAcquisitionPrice`) · `calc-wizard-store.ts:435` `computeTransferSummary`. 분리 모드에서 파트 합계를 읽지 않으면 **0 / «-»**로 표시된다.

---

## 7. 결과 화면

```
토지 (취득 2025-01-08 · 실거래가)
  취득가액 100,000,000

건물 (취득 2025-08-29 · 환산취득가)
  환산취득가 = 건물 양도가액 400,000,000 × (건물 취득시 기준시가 300,000,000 ÷ 건물 양도시 기준시가 400,000,000)
             = 300,000,000
  필요경비 개산공제 = 건물 취득시 기준시가 300,000,000 × 3% = 9,000,000   (소득령 §163⑥)
```

- echo 소스: `acqMode`(`transfer-split-gain.types.ts:47`) · `stdPriceAtAcq`(`:39`) — **기존 필드 재사용**.
- `stdPriceDerivedFromTotal` fine-print는 **propertyType별로 문구가 다르다**:
  - `housing`: "개별주택가격(부수토지 포함)에서 토지분을 분리한 값입니다 (소득령 §163⑥2호가목)" — **정상 경로 설명**
  - `building`: "취득시 기준시가를 파트별로 입력하지 않아 결합 총액에서 안분한 값입니다" — **입력 유도**
- 산식은 한국어 풀어쓰기 + `Frac`/`FLine` 표준, 변수 약어·`floor()` 금지.
- ⑦ 소비처 **3파일**: `TransferTaxResultView.tsx` · `FilingFormTableHelpers.ts` · `DetailedStatementFormulaBuilders.ts` — 마지막 파일은 현재 **split 분기 0건**(grep)이라 파트별 산식이 상세명세서에 반영되지 않는다(`feedback_detailed_statement_formula_sync`).

---

## 8. 8개 클라이언트 동기화 지점

| # | 파일 | 작업 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-asset.ts` | `buildingStandardPriceAtAcquisition` (building 전용) |
| ② initial | `calc-wizard-asset-factory.ts` | `""` (파트 모드는 `""` 유지 — §5) |
| ③ normalize | `calc-wizard-asset-migrate.ts` | undefined 가드만 (물질화 마이그레이션 없음) |
| ④ API 변환 | `transfer-tax-api.ts` | `isSeparateAcquisition` 파생 · 신규 필드 · **stale 3필드 미전송 가드**(§4) · 지분 `applyRatio`(E5) |
| ⑤ UI 위젯 | `LandBuildingSplitSection.tsx` · `CompanionAcqPurchaseBlock.tsx` | §3·§4·§5 |
| ⑥ 사이드바 | `transfer-per-asset-summary.ts:72-75` **+** `calc-wizard-store.ts:435` | §6 |
| ⑦ 결과 카드 | `TransferTaxResultView.tsx` · `FilingFormTableHelpers.ts` · `DetailedStatementFormulaBuilders.ts` | §7 |
| ⑧ validation | `transfer-tax-validate-split.ts` | V0~V4 **함수 최상단** 배치 (engine.design §5) |

---

## 9. E2E (`e2e/split-mode-gating.spec.ts`)

**착지 완료 (PR #837, P1)**: 실거래가 모드 취득시 기준시가 노출 · 양도시 기준시가 미노출 · 분리 OFF 회귀 — 3건 green.

**후속 (P5)**

| ID | 시나리오 | 단언 |
|---|---|---|
| U1 | 분리 토글 ON(날짜 상이) | 상단 "취득가액 산정 방식" 미표시 + `split-acq-total-note` 표시 |
| U2 | 토지 실가 / 건물 환산 | 토지=금액칸, 건물=기준시가 칸 |
| U3 | 토지 실가 금액 미입력 → 다음 | validate 오류에 "토지 취득가액" 포함 |
| U4 | 양쪽 실가 + 금액 둘 다 입력 | 계산 성공 + 결과에 파트 분리 표시 |
| U5 | 분리 토글 OFF 복귀 | 상단 입력 복원(폼 상태 보존) |
| **U6** | **겸용주택 토글 ON** | 상단 입력 **유지**(게이트 `false`) — 오포섭 회귀 가드 |
| **U7** | **`selfOwns≠both` + 날짜 동일** | 상단 입력 **유지** — 오포섭 회귀 가드 |
| **U8** | 분리 모드 + PHD 대상 취득일 | **PHD 토글이 계속 보인다** — 숨김 부작용 회귀 가드 |

- U1의 `"취득가액 산정 방식"`은 분리 섹션(`LandBuildingSplitSection.tsx:144`)에도 존재 → **substring 오매칭 주의**(`e2e/CLAUDE.md` §3). `exact:true` 또는 상단 전용 testid 사용.
- 신규 셀렉터는 throwaway probe로 실측 확정 후 고정. `ToggleCard`는 `setChecked` 헬퍼.
