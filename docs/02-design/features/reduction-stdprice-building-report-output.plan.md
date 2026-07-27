# 수정 계획서 — 감면소득금액 안분 시 「건물 기준시가 계산서」 미출력 (+ 인접 결함)

> 작성일 2026-07-27 · 세목: 양도소득세 · 유형: 결함 수정(결과 출력)
> 확정 방침: **방안 A** 채택 · **§4 인접 결함 포함**
> 관련 설계: `reduction-stdprice-lookup-phd-unification.plan.md`(조회형 통일)

## 1. 증상 (사용자 보고)

감면소득금액을 **기준시가로 안분 계산**(조특법 §99·§99의2·§98의3/5/6/7/8·§99의3 등 5년 안분 소득금액차감 방식)한 경우, 취득당시 기준시가를 §164⑤ PHD 환산하면서 **건물분 기준시가를 국세청 산식으로 계산**하게 된다. 이때 그 근거인 **「건물 기준시가 계산서」(NTS 서식)가 결과 화면·인쇄물에 출력되지 않는다.**

- 대상 자산: 주택(단독·공동)
- 요구: **§99의3에 국한하지 않고, 감면소득금액을 안분 계산한 모든 조문**에서 계산서가 반드시 출력되어야 함.

## 2. 근본 원인 (코드 검증 완료)

「건물 기준시가 계산서」는 `BuildingStdPriceReportSection`이 **`useBuildingStdSnapshotStore`의 스냅샷**에서 클라이언트 재유도해 렌더한다. 이 섹션은 "현재 계산에 소속된 스냅샷"만 필터링한다:

```
// components/calc/results/BuildingStdPriceReportSection.tsx:55-57
for (const [key, snap] of Object.entries(snapshots)) {
  const id = idOfSnapshotKey(key);
  if (id === "" || !inputStr.includes(id)) continue;   // ← 여기서 감면 스냅샷 전량 탈락
```

- `inputStr = JSON.stringify({ assets: formData.assets })` (같은 파일 52행).
- 소속 판정 id는 `idOfSnapshotKey(key)`로 스냅샷 키에서 추출.

감면 PHD 환산 위젯이 저장하는 스냅샷 키는 **`${snapshotKeyPrefix}-bsp`** 형식이다:

```
// components/calc/transfer/ReductionPhdInput.tsx:207-222, 235-251
//  ⚠️ 취득시 건물 버튼(207-)·최초공시시 건물 버튼(235-) **둘 다 동일 snapshotKey** 사용,
//     둘 다 onApplyBoth(acq, first)로 취득시+최초공시시 2시점을 함께 계산 → 단일 스냅샷 idempotent 갱신.
snapshotKey={snapshotKeyPrefix ? `${snapshotKeyPrefix}-bsp` : undefined}
```

`snapshotKeyPrefix`는 각 감면 폼이 정적 문자열로 주입 — `red99`·`red983`·`red985`·`red986`·`red987`·`red988`·`red992`(`ReductionStdPriceSection` 경유) 및 `red993`(`New993InputForm` 직접). 실제 키는 `red993-bsp`, `red99-bsp` 등.

`idOfSnapshotKey`는 **`bsp-` 접두 규약**을 가정한다:

```
// lib/calc/building-std-snapshot-keys.ts:15-22
export function idOfSnapshotKey(key: string): string {
  return key.startsWith("bsp-estate-")
    ? key.slice("bsp-estate-".length)
    : key.replace(/^bsp-/, "")                                        // red993-bsp → 미치환(접두 불일치)
         .replace(/-(?:gb|cb|phd)-(?:acq|first|transfer)(?:-commercial)?$/, "")  // 미매치
         .replace(/-mx-commercial$/, "");                            // 미매치
}
```

- `red993-bsp`는 `bsp-`로 시작하지 않아 어떤 규칙도 미매치 → **`"red993-bsp"` 문자열 전체가 id로 반환**.
- 이 id는 `formData.assets` JSON에 없음 → `!inputStr.includes(id)` 참 → `continue` → **스냅샷 스킵 → 계산서 미렌더.**

**결론:** 감면 조문 PHD 환산으로 건물 기준시가를 계산(모달 사용)해도 계산서가 결과 탭에 **절대 노출되지 않는다.** §99의3 포함 전 감면 조문 공통 구조적 결함(스냅샷 키가 `bsp-${assetId}-…` 규약 위반 → 소속 판정 탈락).

### 부가: assetId 미배선

감면 위젯 공용 prop 묶음 `reductionAssetProps`는 acquisitionDate·jibun·dong만 포함하고 **assetId 미전달**:

```
// components/calc/transfer/UnifiedReductionPanel.tsx:522-525
acquisitionDate,
jibun: assetJibun,
dong: assetDong,
```

규약 키(`bsp-${assetId}-…`) 생성을 위해 assetId(`AssetForm.assetId`, `calc-wizard-asset.ts:56` · 값 `asset-${ts}-${idx}`)를 위젯까지 배선해야 한다.

## 3. 수정 방안 A (확정)

핵심: **감면 PHD 스냅샷 키를 `bsp-${assetId}-red-phd` 규약에 편입**해 `idOfSnapshotKey`가 실제 assetId를 추출 → `formData.assets` JSON에 존재하므로 소속 판정 통과 → 렌더.

### 3-1. 렌더 성립 (필수 · 출력 자체)

1. **assetId 배선**: `UnifiedReductionPanel`의 `reductionAssetProps`에 `assetId: asset.assetId` 추가 → `ReductionStdPriceSection`·`New993InputForm` → `ReductionPhdInput`까지 새 prop `assetId` 통과.
2. **키 형식 전환** (`ReductionPhdInput`): `snapshotKey = ` `bsp-${assetId}-red-phd` (취득시·최초공시시 두 버튼 **동일 키 공유** 유지). `snapshotKeyPrefix`는 정정/이력 복원 안정 목적이었으나 assetId 기반으로 대체. 자산당 감면 1건(§127⑦ 택일)이므로 조문 접미 불필요 — Do 단계 anchor로 재확인.
3. **`idOfSnapshotKey` 확장** (`building-std-snapshot-keys.ts`): `-red-phd$` 세그먼트 제거 규칙 추가 → assetId 반환.

> **검증된 사실:** 감면 모달 스냅샷은 `taxType: "transfer"` (`building-std-price-form.ts:195` 기본값, `ReductionPhdInput`이 `lockedTaxType` 미전달). 섹션 필터(`BuildingStdPriceReportSection.tsx:66-72`)는 `bsp-${id}-red-phd`가 `-(phd|gb|cb)-acq`·`-(gb|cb)-transfer` 정규식에 **미매치 → 인스턴스 필터 없이 취득+양도(=최초공시) 2 인스턴스 유지**. 따라서 3-1(1~3)만으로 **계산서가 렌더된다.**

### 3-2. 헤딩·마킹 교정 (품질 · 별개 단계)

3-1만 적용하면 렌더는 되나, 결합 스냅샷의 두 번째 인스턴스(엔진 "transfer")가 기본 **"양도시"**로 라벨된다 — 실제로는 **최초공시일**. 교정:

4. **헤딩/markCell** (`BuildingStdPriceReportSection.tsx:66-95`): `red-phd` 키 인식 → 두 인스턴스를 `titleOverride`로 **"취득시"·"최초공시일"** 라벨, `markCellOverride`로 Ⅰ.구분 마킹(취득시 = 연도별 acq2000/acq2001, 최초공시일 = acq2001 취득당시 측). 필요 시 `phdTimepointLabel` 보조 경로 또는 섹션 내 전용 분기.

### 적용 범위 (전 감면 조문)

`ReductionStdPriceSection`(공용) → `New99InputForm`·`Unsold983/985/986/987/988/992InputForm` · `New993InputForm`(직접) · 단일 진입점 `ReductionPhdInput`(키 생성).

## 4. 인접 결함 수정 (포함 확정)

§99의3이 **아닌** 소득금액차감 감면(§99·§98의8·하이브리드 §98의3/5/6/7 등)은 신고서·상세명세서·요약이 **`new993Detail`만 참조**해 감면 반영이 누락된다. §127⑦로 자산당 1건만 적용되므로 **적용된 income-deduction detail 1건**을 집계하는 공용 헬퍼로 단일화한다.

### 4-1. 공용 헬퍼 신설

`reduction-eligible-income.ts`(또는 신규 인접 파일)에:
- `incomeDeductionReducible(result)` — `new993Detail ?? new99Detail ?? unsold988Detail ?? unsold98{2,3,4,5,6,7}Detail ?? unsold992Detail` 중 **적용 1건**의 `reducibleTransferIncome`(nullish 병합, 없으면 0).
- `incomeDeductionRuralSurtax(result)` — 동일 detail의 `ruralSurtax`.

(엔진 result에 income-deduction 적용 detail은 §127⑦로 1건만 채워지므로 nullish 우선순위 병합으로 충분. 하이브리드 5년 내 tax_amount 경로는 `reducibleTransferIncome=0`이라 자동 무영향.)

### 4-2. 표시 지점 치환 (new993Detail 단독 → 헬퍼)

| 파일:행 | 항목 | 현재 | 수정 |
|---|---|---|---|
| FilingFormTableHelpers.ts:653 | 소득금액 감면대상 값 | `new993Detail?.reducibleTransferIncome ?? 0` | `incomeDeductionReducible(result)` |
| FilingFormTableHelpers.ts:657 | 감면후 소득금액 차감액 | 동상 | 동상 |
| FilingFormTableHelpers.ts:671 | 농어촌특별세 | `new993Detail?.ruralSurtax ?? 0` | `incomeDeductionRuralSurtax(result)` |
| DetailedStatementHelpers.ts:613 | 소득금액 감면대상 값 | 동상 | 헬퍼 (집계는 기존 `aggIncomeDeductionReducible` 유지) |
| DetailedStatementHelpers.ts:625 | 감면후 소득금액 | 동상 | 헬퍼 |
| DetailedStatementHelpers.ts:615-617 | 산식(formula) | §99의3 전용 `buildNew993ReducibleFormula` | new993Detail이면 기존 유지, 그 외엔 적용 detail의 `formulaSteps` 요약 또는 일반 문구(값은 헬퍼로 정확). ⑦ 상세 카드(IncomeDeductionDetailCard)가 이미 조문별 산식 노출하므로 신고서 행은 일반 문구 허용 |
| TransferTaxResultView.tsx:311 | 총 납부세액 요약 농특세 | `new993Detail?.ruralSurtax ?? 0` | `incomeDeductionRuralSurtax(result)` |

> **라벨 일반화**: 위 행의 `formula`/`note` 문자열에 하드코딩된 "§99의3"은 "신축·미분양 등 소득금액차감 감면(§90②)"로 일반화. 법령 정확성 우선 — 조문 특정이 필요한 곳은 적용 detail 종류로 분기.

## 5. 영향 파일

| 구분 | 파일 |
|---|---|
| 키 유틸 | `lib/calc/building-std-snapshot-keys.ts` (`idOfSnapshotKey`·필요 시 `phdTimepointLabel`) |
| 결과 섹션 | `components/calc/results/BuildingStdPriceReportSection.tsx` (헤딩·markCell) |
| 감면 위젯 | `ReductionPhdInput.tsx`(assetId prop·키 생성) · `ReductionStdPriceSection.tsx`(assetId 통과) |
| 조문 폼 | `New993InputForm.tsx`·`New99InputForm.tsx`·`Unsold98{3,5,6,7,8}InputForm.tsx`·`Unsold992InputForm.tsx` (assetId 통과) |
| 패널 | `UnifiedReductionPanel.tsx` (`reductionAssetProps`에 `assetId: asset.assetId`) |
| 인접(§4) | `FilingFormTableHelpers.ts`·`DetailedStatementHelpers.ts`·`TransferTaxResultView.tsx` + 헬퍼(`reduction-eligible-income.ts` 인접) |

**추가 소비처 주의**: `idOfSnapshotKey`는 `lib/hooks/use-auto-save-calculation.ts`(이력 동봉 필터)도 공유한다(`building-std-snapshot-keys.ts:10` 주석). 키 규약 편입의 **긍정적 부수효과**: 감면 건물 기준시가 스냅샷이 이제 이력에 동봉·복원된다(종전 `red993-bsp`는 assets에 없어 미동봉 → 복원 시 유실). Do 단계에서 이력 저장·복원 회귀 확인 필요.

## 6. 검증 (성공 기준)

1. **Pre-Do anchor**: `idOfSnapshotKey("bsp-asset-1-red-phd") === "asset-1"` 단위 테스트 먼저 작성·통과 → 유틸 확장 방향 확정.
2. **소속 판정 anchor**: `bsp-${assetId}-red-phd` 스냅샷 + `formData.assets[0].assetId === assetId`일 때 `BuildingStdPriceReportSection`이 계산서 ≥1 렌더(RTL), 헤딩 "취득시"·"최초공시일" 검증.
3. **§4 anchor**: `new99Detail`만 채워진 result에서 `incomeDeductionReducible`·`incomeDeductionRuralSurtax`가 값 반환 → FilingFormTable "소득금액 감면대상"·"농어촌특별세"·"감면후 소득금액" 정합(0 아님). §99의3 result 회귀(기존 값 불변).
4. **키 충돌 회귀**: 자산-수준 PHD(`bsp-${id}-phd-acq`)와 감면 PHD(`bsp-${id}-red-phd`)가 공존 시 배치 삭제(`replaceSnapshotsByPrefix("bsp-${id}-phd")`)로 서로 안 지워짐(`red-phd`는 `bsp-${id}-phd` 접두 불일치 — anchor로 확정).
5. **이력 회귀**: 감면 계산 저장 → 이력 복원 시 감면 건물 기준시가 스냅샷 동반 복원·계산서 재출력.
6. **E2E**: 감면(§99의3·§99 각 1건) + 주택 + 취득일 최초공시 이전 → PHD 환산 모달로 건물 기준시가 계산 → 결과 탭 「건물 기준시가 계산서」(취득시·최초공시일) 노출. `transfer-reduction-*-stdprice` 계열에 추가.
7. **전체 회귀**: `npx tsc --noEmit` 0건 · 감면 vitest · 기존 건물 기준시가 계산서 E2E(gb/cb/상속) 전건 GREEN.
8. **브라우저 수동 확인**: 스크린샷 케이스(§99의3, 취득 2003, 환산취득가) 재현 후 계산서 출력 + 소득금액 감면대상·농특세 정합 확인.

## 7. 미결 결정 (Do 진입 전 최종 확인)

- [ ] 자산당 감면 1건 전제(조문 접미 불필요) — anchor로 확정 후 진행. 만약 동일 자산 복수 income-deduction 동시 입력 가능성이 코드상 존재하면 키에 조문 접미(`-99`,`-983`…) 부여.
- [ ] §4 상세명세서 산식(비-§99의3) 표기 수위 — 일반 문구 vs 적용 detail formulaSteps 재사용(권장: 값은 헬퍼로 정확, 산식은 ⑦ 상세 카드에 위임하고 신고서 행은 일반 문구).
