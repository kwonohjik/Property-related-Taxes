# 토지·건물 취득/양도가액 독립 산정 모드 — 엔진 설계

> 계획서: `transfer-land-building-independent-valuation-mode.plan.md` (Plan 확정). 본 문서 = 엔진/데이터 설계 산출물.
> 대상 파일: `lib/tax-engine/transfer-tax-split-gain.ts` · `types/transfer.types.ts` · `transfer-tax-helpers.ts`(도출) · `transfer-tax-api.ts`(변환).
> 검증 원칙: file:line·법령은 실측/조문 확인 완료(계획서 부록·§4). 미확인은 "확인 필요".

## Context

토지·건물 취득일이 다른 자산(§166⑥·§168②)의 양도차익을 계산하는 `calcSplitGain`이 현재 **취득 산정 방식을 자산 전체 단일**(`input.useEstimatedAcquisition` boolean)로만 처리한다(`transfer-tax-split-gain.ts:84-146`). 사용자 확정: (Q1) 토지·건물 각각 4방식(실가·환산·감정·매매사례) **독립**, (Q2) 양도가액 일괄 안분을 **양도시 기준시가**로 정정. 핵심은 "모드 축의 분리" — 데이터·엔진 골격은 재활용, 파트별 취득 모드 축 + 독립 양도 모드 축 + 안분 시점 분리만 신설.

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

취득: 파트별 `actual`(실가)·`est`(환산)·`apr`(감정)·`sc`(매매사례). 양도: `구분`(actual 직접)·`일괄`(apportioned, 양도시 기준시가 안분).

| ID | 토지취득 | 건물취득 | 양도 | 핵심 입력 | 기대 산출 규칙 | anchor |
|---|---|---|---|---|---|---|
| C1 | actual | actual | 구분 | land/buildingAcquisitionPrice·TransferPrice 직접 | 각 파트 직접값 그대로. 개산공제 0 | 기존 S2 유지 |
| C2 | est | est | 일괄 | 양도시 파트 기준시가 필수 | 각 파트 환산 = 파트양도가×(취득시/양도시 기준시가), 개산공제 3%. 양도가 안분=양도시 비율 | 기존 S1·S3 **재계산**(Phase B) |
| **C3** | **actual** | **est** | 구분 | 토지 실취득가 + 건물 취득시·양도시 기준시가 | 토지=직접 실가(개산공제 0), 건물=환산(개산공제 3%). 파트 독립 | **신규 #5** land-building-mixed-actual-est |
| **C4** | **est** | **actual** | 구분 | 토지 취득시·양도시 기준시가 + 건물 실취득가 | 토지=환산(개산공제 3%), 건물=직접 실가(개산공제 0) | **신규 #6** land-building-mixed-est-actual |
| C5 | apr | est | 구분 | 토지 감정가 직접 + 건물 환산 기준시가 | 토지=감정가 직접(개산공제 3%, swap 제외), 건물=환산 | 신규 mixed-appraisal-est |
| C6 | actual | est | **일괄** | C3 + 양도시 파트 기준시가 | 양도가액=양도시 기준시가 비율 안분 → 파트 취득 계산 | 신규 mixed-apportioned(Phase B) |
| C7 | est | est | 일괄 | PHD(개별주택가격 미공시) + 양 파트 환산 | §164⑤ 3시점 경로(`calcSplitGainPreDisclosure`) **유지** | 기존 expropriation-phd-split |
| **C8** | **actual** | **est** | 구분 | 건물 취득일<2005-04-29 + PHD 입력 존재 | PHD 게이트 **억제**(양 파트 환산 아님) → 비-PHD 파트별 경로 | **신규** phd-gate-mixed-suppress |
| C9 | — | est | 구분 | `selfOwns="building_only"` | 건물 파트만 계산(토지 비소유 제외). `buildingAcqMode`만 활성 | 기존 owner-split-case12 + 신규 self-owns-mixed |
| C10 | — | — | — | `hasSeperateLandAcquisitionDate=false` | `calcSplitGain` null → 자산 전체 단일 경로 (회귀 0) | 기존 S5 유지 |
| C11 | sc | sc | 일괄 | 파트별 매매사례가 미입력 | §166⑥ "구분 불분명" → 취득시 기준시가 안분 | 기존 split-gain-salescase 재확인 |

> **16조합 자동 커버 근거**: 파트당 4-way `calcPartAcq` 독립 호출이므로 토지 4 × 건물 4 = 16이 조합 폭발 없이 커버. 위 표는 대표 + 신규 + 게이트 경계만 anchor.

## 법령 근거

- **소득세법 시행령 §166⑥** (MST 286211): 토지·건물 가액 구분 불분명 시 「부가가치세법 시행령」 §64① 준용 안분.
- **부가가치세법 시행령 §64①** (MST 283641): 1호 — **공급계약일(=양도) 현재 기준시가** 비율(감정평가액 있으면 그 비율). → 양도가액 안분 시점 = **양도시**(현행 취득시 사용은 위반, `split-gain.ts:26-36`→`:181-186`).
- **§163⑥**: 환산·감정·매매사례 취득 시 개산공제 = 취득시 기준시가 × 3%.
- **§97②2호 단서**: 환산취득가액 모드 전용 swap(가목 환산+개산공제 vs 나목 자본적지출+양도비 택일=max). 감정·매매사례 제외.
- 조회 완료 2026-07-27. (계획서 §4)

## 엔진 input 타입 (`types/transfer.types.ts` — Phase A0)

```ts
// TransferTaxInput 확장 (전부 optional — 비분리·미사용 시 undefined)
landAcqMode?: "actual" | "estimated" | "appraisal" | "salesCase";     // 토지 파트 취득 방식
buildingAcqMode?: "actual" | "estimated" | "appraisal" | "salesCase"; // 건물 파트 취득 방식
saleSplitMode?: "actual" | "apportioned";                             // 양도 방식 (구분|일괄) — 엔진 명시 입력(죽은 모드 아님)
landSalesCaseValue?: number;      // 토지 파트 매매사례 추계액
buildingSalesCaseValue?: number;  // 건물 파트 매매사례 추계액
// 기존 재활용: land/buildingAcquisitionPrice·TransferPrice·DirectExpenses·StandardPriceAtTransfer,
//   standardPricePerSqmAtAcquisition·acquisitionArea·standardPriceAtAcquisition(취득시 안분 소스)
```
- **비분리(`landAcquisitionDate` 미제공) 시 전부 미사용** — `calcSplitGain` null 조기반환(`:161`).
- 자산 전체 `useEstimatedAcquisition`은 **§6.1 파생값**(어느 파트든 est이면 true) — 신규 필드 아님.

## 엔진 result 타입 (`SplitPartResult` echo)

```ts
acqMode?: "actual" | "estimated" | "appraisal" | "salesCase";  // 파트별 방식 echo (결과뷰 라벨 전용)
```
계산 로직 무변경·표시 전용 optional. 혼합 모드(토지 실가+건물 환산)에서 결과뷰가 파트별 산식 라인을 다르게 렌더하는 소스.

## 계산 알고리즘 (단계별)

**calcSplitGain 파이프라인 수정점:**

1. **취득 안분비 `acqRatio`** = `calcApportionRatio`(취득시 기준시가, 현행 승계). **양도 안분비 `saleRatio` 신설** = `landStdAtTransfer / (landStdAtTransfer + buildingStdAtTransfer)` (§4-B, Phase B).
1b. **파트 취득시 기준시가** (현행 `:175-177` 승계 — `calcPartAcq` 환산 분자·개산공제 base): `landStdAtAcq = floor(standardPricePerSqmAtAcquisition × acquisitionArea)`, `buildingStdAtAcq = max(standardPriceAtAcquisition − landStdAtAcq, 0)`. 양도시 파트 기준시가(`land/buildingStandardPriceAtTransfer`)는 입력 필수(§7.2), 미입력 시 비분리 경로 fallback만.
2. **양도가액 분리** (splitPair 승격 — `saleSplitMode` 명시 분기):
   - `actual`: 파트 직접 `land/buildingTransferPrice`.
   - `apportioned`: `calcSaleApportionRatio`(양도시 비율)로 안분. 양도시 파트 기준시가 **필수**(미입력→validate 차단).
3. **취득가액 분리** — 파트별 `calcPartAcq(mode, ...)` 독립 4-way:
   ```
   est:  partStdAtTransfer>0 ? floor(partTransferPrice × partStdAtAcq / partStdAtTransfer) : 0
   apr:  splitPairSide(appraisalBase, directInput, acqRatio)
   sc:   salesCaseInput ?? floor(actualBase × acqRatio)   // base=0 소실 방지(현행 :126-134)
   actual: splitPairSide(actualBase, directInput, acqRatio)
   ```
4. **개산공제**: 파트 mode ∈ {est,apr,sc} → 파트 취득시 기준시가 × 3%. actual → 0.
5. **§97② swap** (`applyAssetSwap`): 파트 `mode==="estimated"`만. appraisal·salesCase 제외(현행 `:246-250` 감정 제외와 동형).
6. **필요경비·보유연수·selfOwns**: 자본적지출은 현행 `:199-212` 승계 — 총액 `expenses>0`이면 안분/잔액, 신규 경로(총액 0)면 파트 독립(`land/buildingDirectExpenses`). 보유연수 토지=`landAcquisitionDate`/건물=`acquisitionDate` 각각. `selfOwns`≠both이면 비소유 파트 계산 제외(§7.1).
7. **SoT 도출 (§6.1)** — 자산 전체 스칼라를 소비하는 legacy 경로용, API 변환에서 **단방향 1회 파생**:
   - `useEstimatedAcquisition` = `landAcqMode==="estimated" || buildingAcqMode==="estimated"` (소비: `transfer-tax-helpers.ts:284-293`).
   - penaltyBase(`finalize.ts:371-388`): 혼합 시 "환산 파트 존재→환산 penalty"(보수적, 극저빈도). 파트별 정밀 penalty는 범위 밖.
8. **PHD 게이트 강화** (`split-gain.ts:165`): `preHousingDisclosure && landAcqMode==="estimated" && buildingAcqMode==="estimated"`로 한정(혼합 시 오발동 방지).

## Silent fallback / 자동 안분 후보 식별

| 위치 | fallback | 판정 |
|---|---|---|
| C11 매매사례 미입력 → 취득시 기준시가 안분 | **허용** | `feedback_no_silent_apportion_fallback` 예외 요건 충족: ①§166⑥ "구분 불분명" 안분 **명시** + ②사용자가 `salesCase` 모드 **의식적 선택**. 빈값 임의 채움 아닌 법령 규정 파생 |
| apportioned 양도 안분에서 양도시 파트 기준시가 미입력 | **차단** | 자동 안분 금지 — validate 오류. 취득시 landRatio로 대체 금지(§4-B 위반) |
| est 파트 양도시 기준시가 미입력 | **차단** | 환산 분모 필수 — validate 오류 |
| 현행 `line 99-102` `standardPriceAtTransfer × landRatio` | **비분리 경로만 유지** | 파트별 분리 경로에는 미적용 |

## 테스트 약속

- **신규 anchor**(구분양도 기준, 양도 안분 무관 → Phase A 독립): C3(#5)·C4(#6)·C5·C8·C9 — 각 파트 취득가액·개산공제·양도차익 원단위 `toBe()`.
- **Phase B anchor**: C2·C6 — 양도시 기준시가 입력 추가 후 S1·S3 조문 기준 재계산(근거 주석 필수, `feedback_anchor_correction_legal_priority`).
- **회귀 0**: `land-building-split.test.ts` S1~S5, `split-gain-residual-symmetry`·`split-gain-salescase`(C11 동작 변경 명시)·`acq-cost-swap-split`·`owner-split-case12`·`expropriation-split-land`·`expropriation-phd-split`.
- **비분리 무영향**: C10 (hasSeperate=false → null).

## UI 통합 위임

→ `transfer-land-building-independent-valuation-mode.ui.design.md` (STEP 12). 파트별 취득 방식 RadioCardGroup(토지/건물 각 4방식)·양도 모드 토글·양도시 기준시가 입력 경로·결과뷰 파트별 산식·8 클라이언트 동기화(①~⑧). `data-testid`: `part-acq-mode-land`·`part-acq-mode-building`·`sale-split-mode`.
