# 복합구조 조정률 건물특성 자동계산 — Plan

## 배경 / 문제

건물 기준시가 계산기의 **복합구조(층·구역별 구조·용도 상이)** 입력에서는 조정률을
**부분별 `adjustmentRate(%)` 또는 `adjustmentNos(번호)` 수동입력만** 지원한다.

단일구조(상증)는 「개별건물 특성 조정률」(I~VII 7구분)을 건물 특성만 고르면
`calcSpecialAdjustmentRate()`가 자동 산정한다(`AdjustmentRateModal`). 복합구조에는 이 자동계산 경로가 없다.

→ 사용자가 복합구조 각 부분마다 조정률표를 직접 보고 번호("9,20")나 최종 %를 수동 계산해 입력해야 한다.

### 누락 확인 (4계층 일관)

| 계층 | 위치 | 현황 |
|---|---|---|
| 타입 | `types/building-standard-price.types.ts:161` `BuildingCompositePart` | `specialFeatures` 필드 없음 |
| 엔진 | `building-standard-price-helpers.ts:303` `calcCompositeForYear` | `adjustmentFromNos`(수동)만 호출 |
| 폼 | `lib/calc/building-std-price-form.ts:32` `CompositePartForm` | `specialFeatures` 없음, `toCompositePart`(283)도 미전달 |
| UI | `components/calc/building-std-price/CompositePartsSection.tsx:108` | 조정률(%)·번호 입력 칸만, 특성 위젯 없음 |

## 적용 범위 (상증 전용)

- **상속·증여만**. 양도소득세는 고시상 조정률 미적용 — `calcTransferComposite`가 이미 조정률 입력을 차단(L140-149).
  건물특성 입력도 동일하게 차단한다.

## 핵심 설계 판단 — 특성의 적용 단위 (건물 전체 vs 부분별)

조정률표 적용요령(국세청 「상속세 및 증여세법상 건물평가시 적용할 조정률」, PDF 전수 실측,
`data/.../special-adjustment-rate.ts:7-21`)에 근거:

| 구분 | 항목 | 적용 단위 | 근거 |
|---|---|---|---|
| I | 지붕재료 | **건물 전체** | 지붕은 1개. 단 적용은 부분 구조지수<100일 때만(부분 조건부) |
| II | 최고층수 | **건물 전체** | 적용요령(3) "복합건물은 해당 건물 전체 최고층수" — **고시 명시** |
| II | 연면적 | **건물 전체** | 적용요령(4) "지하·옥탑 포함 전체면적" — **고시 명시**. 부분면적 합 + 부속 |
| II | 지능형건축물 | **건물 전체** | 건물 단위 인증 |
| III | 단독/공동주택 | **건물 전체** | 단독/공동 + 연면적/전유면적 = 건물 단위 |
| IV | 상가층 | **부분별** | "상가 1층/2층/지하1층" = 층(부분) 단위 |
| IV | 부속·주차 | **부분별** | 부속 부분(공용은 기존 `sharedAdjustment` 경로) |
| V | 개축(일부) | **부분별** | 일부 개축 = 특정 부분 |
| VI | 무벽건물 | **부분별** | 부분 단위 무벽 |
| VII | 구조진단/철거·화재멸실 | **부분별** | 부분 단위 손상 |

- **II만 고시 명문**. I·III·IV·V·VI·VII의 적용단위는 고시가 복합 케이스를 명시하지 않음 →
  계산서 행(=부분)별 적용 구조 + 각 항목 정의에 따른 **설계 판단**.
- 🔴 **Pre-Do 검증 필수**: KoreanLaw/고시로 위 분류 재확인(특히 I 지붕·V 개축·VII). 미확인 시 "확인 필요" 명시.

## 결합 규칙

각 부분 조정률 = (건물전체 특성 factors) × (해당 부분 특성 factors), 구분별 (지수/100) 곱(적용요령 2).
- 엔진은 부분마다 `merged = {...건물전체특성, ...부분특성}` 후 **기존 `selectSpecialAdjustment` 단일 출처** 재사용
  → `adjustmentItems` echo(NTS 계산서 Ⅲ 조정률 번호) 자동 확보. dual-truth 금지.
- 부분에 수동 `adjustmentNos`/`adjustmentRate`가 있으면 그 부분은 **수동 우선·완전 override**(건물전체 특성도 미적용, 하위호환·단일 manual과 일관).
- II는 최고층수/연면적/지능형 중 max 1개 → 전 부분 동일 factor. I 지붕은 건물 1개 입력이나 **부분 구조지수<100일 때만 적용**(엔진 per-part 게이트) → 부분별 상이 가능.
- 🔴 단일모드 잔존 특성 오염 방지: `toEngineInput`에서 `BUILDING_WIDE_FEATURE_KEYS`/`PART_FEATURE_KEYS` 필터(엔진설계 §1.2).

## 성공 기준 (verify)

1. anchor: 상증 복합 2부분(건물 최고층수 12층 + 1층 상가) → 부분별 조정률 1.32 / 1.10, items [6,20]/[6]. → Pre-Do 우선 작성·실패 확보.
2. `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/building-standard-price/` 통과.
3. 양도 복합 + 건물특성 입력 → 차단(throw) anchor.
4. NTS 계산서 복합 경로 조정률(번호) 칸에 자동 산정 번호 표시.
5. 8 동기화 지점(이 도구는 **API route 없음 → ⑨~⑭ Zod·body·route 매핑 N/A**. 클라이언트 직접 엔진 호출: 폼①·initial②·normalize③·toEngineInput④·UI위젯⑤·preview⑥·NTS report echo⑦·validation⑧).

## 산출물

- `docs/02-design/features/building-std-price-composite-adjustment.engine.design.md`
- `docs/02-design/features/building-std-price-composite-adjustment.ui.design.md`
