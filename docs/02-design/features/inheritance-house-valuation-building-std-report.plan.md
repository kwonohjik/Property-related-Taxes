# 상속취득 주택 — 건물 기준시가 계산서 결과탭 출력 배선

> 작성일 2026-07-07 · 대상: 상속평가 경로(`HouseValuationSection`)에서 일괄 산출한 건물기준시가의
> 산출근거를 결과탭·PDF 「건물 기준시가 계산서」(국세청 서식)로 출력
> 유형: 기존 계산서 인프라 재사용 배선(엔진 변경 0)

## 0. 배경·목표

양도세 PHD 경로(PR#525)는 3시점 건물기준시가 일괄 산출값의 산출근거를 결과탭 국세청
「건물 기준시가 계산서」로 재현한다. 이 인프라(스냅샷 저장 → 재유도 렌더 → PDF → 이력 동봉)는
**세목 무관·prefix 기반으로 완전 일반화**되어 있다.

상속평가 경로(`HouseValuationSection`)에는 PR#530/#531에서 일괄 계산기를 배선했으나
**`snapshotPrefix`를 전달하지 않아** 계산서 파이프라인에 연결되지 않았다(당시 SCOPE OUT).
목표: 상속 경로에서도 건물기준시가 계산서가 결과탭·PDF에 출력되도록 배선한다.

## 1. 조사 결과 — 인프라 이미 일반화 (재사용)

| 인프라 | 위치 | 상태 |
|---|---|---|
| 스냅샷 재구성 | `lib/calc/phd-batch-snapshots.ts` `phdBatchToSnapshots(input, prefix)` | 세목무관(taxType=inheritance_gift valuation 재구성). 재사용 |
| 스냅샷 store | `lib/stores/building-std-snapshot-store.ts` `replaceSnapshotsByPrefix` | prefix 원자교체. 재사용 |
| 키 환원 정규식 | `lib/calc/building-std-snapshot-keys.ts` `idOfSnapshotKey`(`-(gb\|cb\|phd)-…`) | phd 키 이미 인식. 재사용 |
| 결과탭 렌더 | `components/calc/results/BuildingStdPriceReportSection.tsx` | assetId 소속판정. **라벨 조정 필요(§3)** |
| 표시 조건 | `TransferTaxResultView.tsx:168` `hasBuildingStdReport({assets})` | 자산 기반 자동 포함. 재사용 |
| PDF | `lib/calc/building-std-pdf-data.ts` · `lib/pdf/BuildingStdReportPdfPages.tsx` | 재유도 동일. 재사용 |
| 이력 동봉 | `lib/storage/use-auto-save-calculation.ts` `extractRelevantBuildingStdSnapshots` | 세목무관. 재사용 |
| PHD prefix 전달 모델 | `PreHousingDisclosureSection.tsx:172` `stdPriceSnapshotPrefix={\`bsp-${asset.assetId}-phd\`}` | 참고 |

**핵심**: 상속 경로도 동일 `AssetForm.assetId`를 쓰므로, `snapshotPrefix`만 주입하면 소속판정
(`idOfSnapshotKey`·`hasBuildingStdReport`·`extractRelevantBuildingStdSnapshots`)이 **자동으로 잡는다**.

## 2. 핵심 변경 — `snapshotPrefix` 전달 (1곳)

`components/calc/transfer/inheritance/HouseValuationSection.tsx:315`:

```tsx
<PhdBuildingStdPriceModalButton
  points={batchPoints}
  onApply={applyBatch}
  snapshotPrefix={`bsp-${asset.assetId}-phd`}   // ← 추가
/>
```

이것만으로 모달 `handleApplyAll`(`PhdBuildingStdPriceModalButton.tsx:206-208`)이
`replaceSnapshotsByPrefix(prefix, phdBatchToSnapshots(computedInput, prefix))`를 태우고,
결과탭·PDF·이력이 자동 인식한다.

## 3. 라벨 정합성 (검토 필요) — `titleOverride` "양도" 하드코딩

`BuildingStdPriceReportSection.tsx:64`:
```ts
const titleOverride = tp
  ? `양도 ${tp.timepoint} · ${tp.category === "commercial" ? "상가분" : "주택분"}${...}`
  : undefined;
```
상속 경로에서도 그대로 **"양도 취득시 · 주택분 (2005년)"** 로 표기됨 — "양도"는 이 맥락에서 오도.

**Option A (권장, 최소)** — 라벨에서 "양도" 제거(시점만): `취득시 · 주택분 (2005년)`.
양도·상속 두 맥락 모두 정확. 영향: 기존 테스트 3건(`building-std-report-phd-section.test.tsx:42-44`,
"양도 취득시/최초공시일/양도시 · 주택분" assert) 문구 갱신. 공유 컴포넌트라 양도 PHD 라벨도 함께 바뀜(무해).

**Option B (컨텍스트 분기)** — 상속 전용 키 infix(`bsp-${id}-iphd-…`) 도입 후 "상속 {timepoint}" 라벨.
`idOfSnapshotKey`·`phdTimepointLabel`·`extractRelevantBuildingStdSnapshots` 정규식에 `iphd` 추가 필요(파일 3~4곳).
라벨 정밀하나 변경 범위 큼. **비권장**(Simplicity First).

→ **Option A 채택**. `markCellOverride`(`:67-71`, 취득/최초=acq2001·양도=transfer)는 상속개시일도 취득의
일종이라 그대로 유효(변경 없음).

**titleOverride 필수 근거(F3)**: `NtsBuildingStdPriceReport.tsx:70` — titleOverride 미주입 시 기본 제목은
`markCell` 기반(취득당시/양도당시). PHD는 취득·최초공시·양도 3시점 중 취득·최초공시가 **같은 markCell(acq2001)**
이라 기본 제목으로는 구분 불가 → titleOverride가 반드시 필요. 따라서 "override 제거"가 아닌 "override에서 '양도'
단어만 제거"(Option A)가 정답 — 시점 구분(취득시/최초공시일/양도시)은 보존.

## 4. ≤2000 취득시점 한계 (명시·안내) ⚠

`phd-batch-snapshots.ts:90`: `point.year < BUILDING_STD_FIRST_YEAR(2001)` 시점은 스냅샷 **생성 제외**
(≤2000은 acqBase 산정기준율 경로라 valuation-mode 서식 재현 불가).

**사용자 예시(상속개시일 1983)의 경우**:
- 취득시(1983): ≤2000 → **계산서 미생성** (건물기준시가 값은 산출·적용되나 상세 서식 없음)
- 최초공시(2005)·양도(2026): ≥2001 → 계산서 출력 ✅

즉 이번 작업으로 **최초공시·양도 시점 계산서는 출력**되나, **취득시점이 ≤2000이면 그 시점 계산서는 미출력**.
결과탭 계산서 섹션에 취득시점 ≤2000 시 안내 문구("취득시점(YYYY) 계산서는 산정기준율 경로로 서식 미표시")를
추가할지 검토(경미, 선택). ≤2000 취득 계산서 재현은 별도 과제(§8 Phase 2).

## 5. 케이스 매트릭스

| # | 케이스 | 취득 year | 계산서 출력 | 검증 |
|---|---|---|---|---|
| C1 | 상속 2003·최초 2005·양도 2025 (전부 ≥2001) | 2003 | 3시점 전부(acq/first/transfer 키) | anchor A1 (순수) |
| C2 | 상속 1983(pre-1990)·최초 2005·양도 2026 | 1983 | 최초·양도만 (취득 키 부재) | anchor A1 + E2E |
| C3 | 공동주택(house_apart) | — | 버튼 미노출 → 계산서 없음(기존 F2) | 기존 커버 |
| C4 | 라벨 | — | "취득시/최초공시일/양도시 · 주택분" ("양도" 제거) | anchor A2 (테스트 3건 갱신) |

> C1(상속 2003)은 post-deemed → `isSupplementary`(보충적평가) 게이트가 필요해(PR#530 확인) 브라우저 진입이
> 무겁다. 3시점 전부 케이스는 **순수 anchor A1**로 검증하고, E2E는 pre-deemed(1983) 경로(C2)로 한다.

## 6. 변경 파일 (surgical)

| 파일 | 변경 | 규모 |
|---|---|---|
| `components/calc/transfer/inheritance/HouseValuationSection.tsx` | 모달 버튼에 `snapshotPrefix` 1줄 | +1 |
| `components/calc/results/BuildingStdPriceReportSection.tsx:64` | 라벨 "양도 " 제거 | ~1줄 |
| `__tests__/calc/building-std-report-phd-section.test.tsx:42-44` | assert 문구 갱신 | 3줄 |

**무변경(재사용)**: phd-batch-snapshots·snapshot-store·snapshot-keys·pdf-data·BuildingStdReportPdfPages·
use-auto-save-calculation·TransferTaxResultView 부착부. 전부 prefix·assetId 기반이라 자동 인식.
**엔진·타입·API·validate 변경 0**.

## 7. 검증 계획

**Pre-Do anchor 우선** (결과탭 도달은 전체 마법사 완주가 필요해 과중 → 계층 분리, F1):
- **A1 (스냅샷 키 생성 — 순수)**: `phdBatchToSnapshots(input, "bsp-X-phd")`가 ≥2001 시점은 `-acq/-first/-transfer`
  키 생성, ≤2000 시점(1983 취득)은 `-acq` 키 부재. `phd-batch-snapshots.test.ts` 확장(inheritance-style input).
- **A2 (계산서 렌더 + 라벨 — RTL)**: store에 상속식 스냅샷(`bsp-X-phd-first`·`-transfer`) seed 후
  `BuildingStdPriceReportSection` 렌더 → 계산서 표시 + 라벨 "취득시/최초공시일/양도시 · 주택분"("양도" 제거).
  `building-std-report-phd-section.test.tsx` 확장·기존 3건 문구 갱신.
- **E2E** (`transfer-inheritance-house-val-building-std-batch.spec.ts` 확장): 상속(pre-deemed 1983) 단독주택
  → 모달 계산→"모두 적용" 후 **`sessionStorage["building-std-snapshots"]` 키**에 `-phd-first`·`-phd-transfer` 존재,
  `-phd-acq` 부재 확인(기존 transfer T8 패턴). 결과탭 렌더는 A2가 커버(마법사 완주 불요).

**회귀**: `npx vitest run`(라벨 변경 3건 갱신 반영), `phd-batch-snapshots`·`building-std-report-pdf` 등.

## 8. SCOPE OUT

- **≤2000 취득시점 계산서 재현 (Phase 2)**: `phd-batch-snapshots.ts:90` 가드 완화 + acqBase 산정기준율
  서식 표현. `calcBuildingStandardPrice`는 ≤2000 산출 가능하나 `buildNtsReportModel` 서식이 산정기준율을
  표현하는지 미확인 → 별도 과제.
- **Option B 컨텍스트 라벨(상속/양도 구분)**: 미채택(Option A로 충분).
- **PDF의 시점 라벨**: `BuildingStdReportPdfPages`는 `titleOverride` 미반영(PR#525 기존 한계 승계) — 이번 범위 밖.

## 9. Definition of Done

- [ ] anchor A1(스냅샷 키 ≥2001 생성·≤2000 부재, 순수)·A2(계산서 렌더+라벨, RTL) RED→GREEN
- [ ] `HouseValuationSection`에 `snapshotPrefix` 전달
- [ ] `BuildingStdPriceReportSection:64` 라벨 "양도 " 제거 + 테스트 3건 갱신
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 회귀 통과
- [ ] E2E: 상속(1983) 모달 apply 후 `sessionStorage` 스냅샷 키 `-phd-first`·`-transfer` 존재·`-acq` 부재
- [ ] 브라우저 수동 확인(Playwright) 또는 미수행 명시

## 10. 리스크

- **낮음**: 핵심은 prefix 1줄 + 라벨 1줄. 인프라 전부 재사용. 엔진·타입 무변경.
- 라벨 변경이 양도 PHD 계산서에도 적용(공유 컴포넌트) — "양도" 제거는 양쪽 다 정확하므로 무해(테스트 3건만 갱신).
- ≤2000 취득시 계산서 미출력은 **의도된 한계**(사용자 1983 예시에서 취득시 미표시) — 명확히 안내.
