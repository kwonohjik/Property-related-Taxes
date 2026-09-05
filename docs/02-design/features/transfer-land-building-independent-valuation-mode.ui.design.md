# 토지·건물 취득/양도가액 독립 산정 모드 — UI 설계

> 계획서: `transfer-land-building-independent-valuation-mode.plan.md` · 엔진: `.engine.design.md`.
> 대상: `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` · `LandBuildingSplitSection.tsx` · `TransferTaxResultView.tsx`.
> 활성 범위: **분리 모드만**(`hasSeperateLandAcquisitionDate === true` OR `selfOwns !== "both"`). 비분리는 현행 자산 전체 단일 UI 유지(회귀 0).

## Context

분리 시 취득가액 산정을 토지·건물 각 4방식(실가·환산·감정·매매사례) 독립 RadioCardGroup으로, 양도가액을 독립 토글(구분양도/일괄양도 안분)로 재구성. UI 복잡도는 점진 노출(흔한 조합 기본 + 희소 조합 펼침)로 관리.

## 1. 8개 동기화 지점 (①~⑧ — 클라이언트)

| # | 지점 | 위치 · 작업 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-asset.ts` AssetForm — `landAcqMode`·`buildingAcqMode`(4-way `string`)·`saleSplitMode`·`landSalesCaseValue`·`buildingSalesCaseValue`(`string`) 추가 |
| ② initial | `calc-wizard-asset-factory.ts:131-145` 인접 — `landAcqMode="actual"`·`buildingAcqMode="actual"`·`saleSplitMode="apportioned"`·매매사례가 `""` |
| ③ normalize | `calc-wizard-asset-migrate.ts` `migrateAsset` — `landSplitMode → saleSplitMode` 매핑 + 신규 필드 `undefined\|""` → 명시 기본값(sessionStorage 무손실) |
| ④ API 변환 | `transfer-tax-api.ts:314-341` — 파트 모드 매핑 + **양도시 기준시가 전송 게이트를 `saleSplitMode==="apportioned" \|\| 파트 estimated`까지 확장**(현행 `landSplitMode==="actual"`만) |
| ⑤ UI 위젯 | `CompanionAcqPurchaseBlock`·`LandBuildingSplitSection` — §2 위젯 |
| ⑥ 사이드바 | `computeTransferSummary` — 파트 합계 영향 확인(결과 도착 후 취득가액 노출 원칙 유지) |
| ⑦ 결과 카드 | `TransferTaxResultView.tsx:490-539`·`FilingFormTableFinancials.ts:63-80` — 파트별 방식(`SplitPartResult.acqMode` echo) 라벨 + 혼합 시 파트별 산식 라인 |
| ⑧ validate | `transfer-tax-validate-split.ts` — 파트 모드 게이트, **estimated 파트·apportioned 양도의 양도시 기준시가 필수 차단** |

## 2. UI 위젯 명세 (분리 모드 취득 영역 — `<ToneCard tone="amber">`)

```
┌─ 취득가액 산정 방식 (토지·건물 취득일 다름) ──────────── amber ─┐
│ ① 토지 취득가액   [실거래가][환산취득가][감정가액][매매사례가액] │  ← RadioCardGroup layout="inline"
│    · actual   → 토지 취득가액(원) 직접입력                      │     data-testid="part-acq-mode-land"
│    · estimated→ 토지 취득시 공시지가(LandPriceLookupField)      │
│                 + 토지 양도시 기준시가(필수)                     │
│    · appraisal→ 토지 감정가액 + 토지 취득시 기준시가(개산공제)    │
│    · salesCase→ 토지 매매사례가액 + 토지 취득시 기준시가          │
│ ② 건물 취득가액   [실거래가][환산취득가][감정가액][매매사례가액] │     data-testid="part-acq-mode-building"
│    · (토지와 동형 — 건물 기준시가/감정가/매매사례가)             │
├─ 양도가액 결정 방식 ──────────────────────────────────────────┤
│    [구분양도(직접입력)]  [일괄양도(양도시 기준시가 안분)]        │     data-testid="sale-split-mode"
│    · actual      → 토지/건물 양도가액 직접입력                   │
│    · apportioned → 토지/건물 양도시 기준시가(안분 분모, 필수)     │
│                    + 자동 안분 미리보기(read-only)              │
└──────────────────────────────────────────────────────────────┘
```

- **RadioCardGroup 필수**(native 금지 — components/calc/CLAUDE.md). ToneCard amber 섹션 안 서브카드 ①② 시각 분리.
- **점진 노출**: 흔한 조합(둘 다 실가·둘 다 환산·토지 실가+건물 환산)은 라디오 기본. 감정·매매사례는 선택 시 관련 입력만 펼침.
- 공시지가는 `LandPriceLookupField` 필수. 라벨 정본 클래스·placeholder 숫자 예시 금지.
- **양도 토글 2-레벨 공존 (계획서 §2.2)**: 본 `saleSplitMode`(자산 **내** 토지·건물)는 기존 `bundledSaleMode`(자산 **간** 일괄양도, 다건 시 Step 상단 `BundledSaleModeToggle`)와 레벨이 달라 공존한다. 다건 자산에서 상단 자산간 토글 + 각 카드 내 토지·건물 토글이 중첩될 수 있으므로, 자산내 토글 라벨을 **"이 자산의 토지·건물 양도가액"**으로 명확히 구분한다. 단건(`assets.length===1`)은 자산간 토글이 비노출(`CompanionAssetsSection.tsx:87`)이라 중첩 없음.

## 3. 케이스 인벤토리 (UI 노출 조건)

| 조건 | 노출 위젯 |
|---|---|
| `hasSeperate=false` & `selfOwns=both` | 현행 자산 전체 단일 "취득가액 산정 방식"(변경 없음) |
| 분리 ON | ①②토지·건물 4방식 라디오 + 양도 토글 |
| 파트 `estimated` | 그 파트 취득시·양도시 기준시가 칸 |
| `saleSplitMode="apportioned"` | 토지·건물 양도시 기준시가 + 안분 미리보기 |
| `selfOwns="building_only"` | ①토지 취득 라디오 비활성/숨김(비소유), ②건물만 |
| `selfOwns="land_only"` | ②건물 취득 라디오 비활성/숨김, ①토지만 |

## 4. Silent fallback / 자동 안분 (UI 차단 규칙)

- **양도시 기준시가 미입력**(estimated 파트 or apportioned 양도): validate **차단**(한국어 오류 + 홈택스 기준시가 조회 안내). 자동 안분 금지(`feedback_no_silent_apportion_fallback`).
- **매매사례가 미입력**: §166⑥ "구분 불분명" 안분 — **허용**(사용자가 salesCase 모드 의식적 선택 + 법령 명시). placeholder "미입력 시 기준시가 비율 안분(§166⑥)".

## 5. Cross-field 동기화 → useEffect 금지 선언 (강제)

- 비분리→분리 전환 시 파트 모드 파생(`landAcqMode = buildingAcqMode = deriveMode(useEstimated, isAppraisal, isSalesCase)`)은 **onChange 핸들러 또는 useMemo 파생** — `useEffect → store` 미러링 **금지**(`feedback_useeffect_store_mirror_forbidden`, 기존 CompanionAcqPurchaseBlock PHD 래치 확산 방지).
- **3중 패턴**(`mirror-pattern`): factory default = UI `value={asset.landAcqMode}`(display fallback `|| "actual"` 단독 금지) = migrate = API/validate 동일 명시값.
- 모드 전환 시 상대 방식 입력 잔존 방지: salesCase↔actual 필드 분리(신규 `land/buildingSalesCaseValue`) — 값 혼선 차단.

## 6. UI 순서 = 엔진 계산 로직 순서

취득 방식 라디오(모드 결정) → 그 모드 조건부 입력 → 양도 방식 토글 → 양도 조건부 입력. 모드 토글은 영향 필드 **직전**(계획서 §8, components/calc/CLAUDE.md). 취득시 기준시가(환산 분자)가 양도시 기준시가(분모)보다 먼저.

## 7. 결과뷰 (⑦ — 파트별 산식)

- `SplitPartResult.acqMode` echo로 "토지=실가 / 건물=환산" 라벨. 혼합 시 파트마다 다른 산식 라인:
  - 실가 파트: `양도가액 − 실지취득가액 − 필요경비`
  - 환산 파트: `양도가액 − 환산취득가액(양도가×취득시/양도시 기준시가) − 개산공제(3%)`
- `selfOwns` ≠ both이면 비소유 파트 열 강조/제외(현행 `:491,517-539` 승계). 산식은 한국어 풀어쓰기·`floor()` 미표시.

## 완료 기준 (Do 단계 체크)

- [ ] 8 동기화 지점 전부 · ⑫⑬⑭ grep 자가점검(엔진 도달 5필드)
- [ ] RadioCardGroup·LandPriceLookupField·ToneCard 강제 규칙 준수
- [ ] E2E: 분리 ON → 토지 실가+건물 환산 → 계산 → 결과 파트별 산식 + Network body 신규 필드 확인
- [ ] ui-engine-sync-checker 8지점 통과
