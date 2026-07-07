# 상속취득 주택 3-시점 환산 — 건물기준시가 일괄 계산기 배선 (§164⑤)

> 작성일 2026-07-07 · 대상 화면 "개별주택가격 미공시 — 3-시점 기준시가 환산 보조"(상속취득 경로)
> 유형: 기존 계산기 재사용 배선(UI-only, 엔진 변경 0)

## 0. 배경

상속으로 취득한 주택을 양도할 때, 상속개시일이 개별주택가격 최초공시일(2005-04-30) 이전이면
소령 §164⑤·§176의2④에 따라 3시점(양도시·최초고시·상속개시일)의 토지·건물 기준시가를
분리 입력해 취득당시 개별주택가격을 역산한다.

이 입력 UI는 `components/calc/transfer/inheritance/HouseValuationSection.tsx`에 이미 존재하지만,
**3개 시점의 "건물기준시가"를 산출하는 계산 기능이 없다** — 각 건물기준시가 칸은 순수 수동
`CurrencyInput`이고 placeholder "국세청 기준시가 조회"는 텍스트일 뿐 조회·계산 버튼이 없다.
(건물기준시가는 홈택스에서 "조회"되는 값이 아니라 구조·용도·연면적·위치지수로 **산정**되는 값이므로
placeholder 자체가 오도.)

한편 **동일 성격의 3시점 건물기준시가 일괄 계산기는 이미 구현되어 있다**
(`PhdBuildingStdPriceModalButton`, PR#520~#526). 다만 양도세 일반 PHD 경로
(`PreHousingDisclosureSection`·`MixedUsePreHousingDisclosureSection`)에만 배선됐고,
상속취득 평가 경로(`HouseValuationSection`)에는 배선되지 않았다.

**목표**: 이미 존재하는 `PhdBuildingStdPriceModalButton`을 `HouseValuationSection`에 배선하여
양도시·최초고시·상속개시일 3시점 건물기준시가를 일괄 산출·자동 채움한다.

## 1. 현재 상태 (실측)

| 항목 | 위치 | 상태 |
|---|---|---|
| 대상 섹션 컴포넌트 | `components/calc/transfer/inheritance/HouseValuationSection.tsx:169` | 존재 |
| 양도시 건물기준시가 필드 | `HouseValuationSection.tsx:307-317` (`inhHouseValBuildingStdPriceAtTransfer`) | 수동 입력만 |
| 최초공시 건물기준시가 필드 | `:349-359` (`inhHouseValBuildingStdPriceAtFirst`) | 수동 입력만 |
| 상속개시일 건물기준시가 필드 | `:423-435` (`inhHouseValBuildingStdPriceAtInheritance`) | 수동 입력만 |
| 재사용 대상 계산기 | `components/calc/building-std-price/PhdBuildingStdPriceModalButton.tsx:102` | 구현 완료 |
| 계산 엔진 | `lib/calc/phd-building-std-batch.ts` `computePhdThreePointStdPrice` | 구현 완료 |
| 필드→엔진 흐름 | `lib/calc/transfer-tax-api-inheritance.ts:143-147` → `inheritedHouseValuation.buildingStdPriceAt{Transfer,FirstDisclosure,Inheritance}` | **이미 연결됨** |
| 렌더 사이트 | `PreDeemedInputs.tsx:208` · `PostDeemedInputs.tsx:290` | 둘 다 `{asset,onChange,transferDate}` 전달 |

**결론**: 계산기가 채울 3개 필드는 이미 엔진 입력으로 흐른다 → 계산기 배선은 **순수 UI 작업**.
`HouseValuationSection` 내부에 배선하면 Pre/Post 두 렌더 사이트를 자동 커버.

## 2. 재사용 계산기 인터페이스 (실측)

`PhdBuildingStdPriceModalButton` (`PhdBuildingStdPriceModalButton.tsx:52-71`):

```ts
interface Props {
  points: PointMeta[];              // 시점 3종 { key, label, year, landPricePerM2:string }
  onApply: (v: PhdThreePointApply) => void;
  buttonLabel?: string;
  enableCommercial?: boolean;       // 겸용 — 기본 false(주택 단독)
  commercialAcqFirstMode?: boolean; // Case A — 기본 false
  snapshotPrefix?: string;          // 결과탭 계산서 재유도용(선택)
}
// PointMeta.key ∈ {"acquisition","firstDisclosure","transfer"}
// onApply: { acquisition?:{housing?,commercial?}, firstDisclosure?:{...}, transfer?:{...} }
```

- 모달은 내부 상태로 신축연도·부분(층/구역)별 구조·용도·연면적·시점별 공시지가를 입력받아
  `computePhdThreePointStdPrice`로 산출. `points`의 `landPricePerM2`는 모달 내 시점별 공시지가
  **초기 seed**일 뿐, 모달 안에서 사용자가 재입력 가능(`handleOpen`이 열 때마다 재시드).
- `year` 미상(날짜 없음) 시점은 계산 제외. `year <= 2000`은 2001년 지수 체계(acqBase 산정기준율) 적용.
- 단독(비겸용) 단일부분 ≤2000 취득은 지원(acqBase). 참조: `ThreePointStandardPriceInput.tsx:639-668`.

## 3. 설계

### 3.1 배선 방식 — `PhdBuildingStdPriceModalButton` 단독 삽입

`ThreePointStandardPriceInput` 경유 없이 `PhdBuildingStdPriceModalButton`을 직접 사용한다
(그 위젯은 토지+건물 3시점 전체를 대체하는 큰 컴포넌트라 이 화면 구조와 안 맞음; 이 화면은
토지 입력을 로컬 `LandPriceLookup`·`Pre1990LandValuationInput`으로 이미 처리 중).

`enableCommercial=false`, `commercialAcqFirstMode=false` (상속취득 단독주택 = 주택 단일).

**⚠ 자산 종류 게이팅 (F2)**: 이 섹션은 `house_individual` **또는 `house_apart`(공동주택)** 모두에
노출된다(`PreDeemedInputs.tsx:43` `isHouse`). 그러나 계산기가 산출하는 국세청 건물기준시가는
구조·용도·위치지수 방식(`calcBuildingStandardPrice`)으로 **일반건물·단독주택 전용**이며, 공동주택은
공동주택가격(토지·건물 일체)으로 별도 고시되어 이 방식이 부적합하다.
→ **버튼은 `asset.inheritanceAssetKind === "house_individual"`일 때만 렌더**한다.

```ts
const isHouseIndividual = asset.inheritanceAssetKind === "house_individual";
// ... 버튼 렌더를 isHouseIndividual 가드로 감쌈
```

(참고: 기존 섹션이 공동주택에도 토지/건물 분리 3시점 입력을 노출하는 것 자체의 적정성은
pre-existing 모델링 문제로 본 작업 범위 밖 — §10 리스크에 별도 flag.)

### 3.2 `points` 구성 (시점→상속평가 필드 매핑)

```ts
const yearOf = (d?: string) => {
  const y = d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined;
  return y && y > 1900 ? y : undefined;
};
const firstRef = asset.inhHouseValFirstDisclosureDate || "2005-04-30";
const points = [
  { key: "acquisition",    label: "취득시(상속)", year: yearOf(inheritanceDate),
    landPricePerM2: asset.inhHouseValLandPricePerSqmAtInheritance },
  { key: "firstDisclosure", label: "최초공시일",   year: yearOf(firstRef),
    landPricePerM2: asset.inhHouseValLandPricePerSqmAtFirst },
  { key: "transfer",        label: "양도시",       year: yearOf(transferDate),
    landPricePerM2: asset.inhHouseValLandPricePerSqmAtTransfer },
];
```

- `key:"acquisition"`은 **상속개시일 시점**(이 화면의 "취득"). onApply의 acquisition → 상속개시일 필드로 라우팅.
- pre-1990 취득 시 `inhHouseValLandPricePerSqmAtInheritance`가 비어 있을 수 있으나(토지는 등급가액
  환산), 건물 위치지수용 공시지가는 모달 내에서 직접 입력 가능 → seed 공란 허용(§7 nuance N1).

### 3.3 `applyBatch` — 산출값 → 3개 필드 (단일 patch 병합, F1)

```ts
const applyBatch = (v: PhdThreePointApply) => {
  const patch: Partial<AssetForm> = {};
  if (v.transfer?.housing != null)
    patch.inhHouseValBuildingStdPriceAtTransfer = String(v.transfer.housing);
  if (v.firstDisclosure?.housing != null)
    patch.inhHouseValBuildingStdPriceAtFirst = String(v.firstDisclosure.housing);
  if (v.acquisition?.housing != null)
    patch.inhHouseValBuildingStdPriceAtInheritance = String(v.acquisition.housing);
  if (Object.keys(patch).length) onChange(patch);
};
```

**단일 `onChange` 호출로 3필드를 한 번에 병합**한다(F1). 현재 렌더 경로
(`CompanionAssetsSection.updateAsset` — `assetsRef.current` 동기 갱신)에서는 3연속 호출도 안전하나,
같은 컴포넌트가 상태 클로저 기반 setter(`Step5.updateAsset:526` 유형) 부모에 붙을 경우 stale-clobber
위험이 있으므로 부모 의존성을 원천 제거. 기존 관례(`PostDeemedInputs.tsx:83,94` 단일 병합)와 일치.
비겸용이므로 `commercial` 분기는 다루지 않는다.

### 3.4 배치 위치 — 섹션 상단 단일 버튼

인트로 문단(`:256-264`) 직후·토지 면적(`:266`) 직전에 우측정렬 버튼 1개.
한 번 계산으로 3시점 필드를 모두 채우는 일괄 UX(기존 PHD 경로와 동일:
`ThreePointStandardPriceInput.tsx:664-668`의 `justify-end` 패턴 차용).

```tsx
{isHouseIndividual && (
  <div className="flex justify-end">
    <PhdBuildingStdPriceModalButton points={points} onApply={applyBatch} />
  </div>
)}
```

## 4. 케이스 매트릭스

| # | 케이스 | 취득(상속) year | 산출 기대 | 검증 |
|---|---|---|---|---|
| C1 | 단독·상속 2003·양도 2024·최초공시 2005 | 2003 | 3시점 전부 산출(취득 2003→2001체계 acqBase) | anchor A1 |
| C2 | 단독·상속 1983(pre-1990)·양도 2025 | 1983 | 3시점 산출. 취득 위치지수 공시지가는 모달 수동 | anchor A2 + 수동확인 |
| C3 | 상속개시일 날짜 미입력 | undefined | 취득 시점 계산 제외(양도·최초공시만) | anchor A3 |
| C4 | 산출 후 "모두 적용" | — | 3개 store 필드 **단일 patch** 갱신·미리보기 반영 | E2E, anchor A4 |
| C5 | 공동주택(`house_apart`) | — | **버튼 미노출**(구조·용도 방식 부적합, F2) | anchor A5 |

## 5. 변경 파일 (surgical)

| 파일 | 변경 | 규모 |
|---|---|---|
| `components/calc/transfer/inheritance/HouseValuationSection.tsx` | import 추가 · `points` useMemo · `applyBatch` · 버튼 렌더 1곳 | +~30줄 (현재 519 → ~550, 800 정책 OK) |

**그 외 변경 없음**: 필드·타입·API·validate·엔진 모두 기존 그대로.

## 6. 14 동기화 지점 점검

- 신규 엔진 input/result 필드 **없음** → 14 동기화 지점 신규 발생 0.
- ①폼 타입·②initial·③normalize·④API변환·⑧validate: `inhHouseValBuildingStdPriceAt*` 이미 전부 존재
  (`calc-wizard-asset.ts:431-435`, `-factory.ts:161-163`, `-migrate.ts:342-344`, `transfer-tax-api-inheritance.ts:143-147`).
- ⑤UI 위젯: 본 작업(버튼 배선)이 유일 변경.
- ⑦결과 카드: 산출값은 기존 환산 미리보기(`HouseValuationSection.tsx:441-486`)·결과뷰에 이미 반영.

## 7. 검증 계획

**Pre-Do anchor 우선**(policy `pre-do-anchor-verification`): 배선 전 아래 anchor로 계산기 산출값이
상속평가 3필드에 라우팅되는지 RTL로 확인(RED→GREEN).

- **A1**: C1 입력 → 모달 계산 → "모두 적용" → 3개 필드 String(원) 채워짐. (RTL, 모달 상호작용)
- **A2**: C2 pre-1990 → 취득 시점 모달 공시지가 수동 입력 후 산출 정상.
- **A3**: C3 상속개시일 미입력 → 취득 시점 미산출, 양도·최초공시만.
- **A4**: "모두 적용"이 3필드를 **단일 patch**로 갱신(3연속 아님, F1) — 병합 후 3필드 모두 반영 확인.
- **A5**: `house_apart`이면 버튼 미노출, `house_individual`이면 노출(F2 게이팅).
- **E2E**: 상속취득 주택 양도 플로우에서 버튼 노출·계산·적용·환산 미리보기 반영
  (기존 PHD E2E 패턴 차용, `transfer-self-owns-filing-form.spec.ts` 참고).

**Nuance N1 (확인 필요, 추정 금지)**: pre-1990 취득 시 건물 위치지수 공시지가 seed 공란 →
모달 내 수동 입력으로 산출 가능한지 실측 확인. `computePhdThreePointStdPrice`가 `landPricePerM2<=0`
시점을 제외(`PhdBuildingStdPriceModalButton.tsx:186`)하므로, 취득 위치지수 미입력이면 취득만 미산출됨
— A2에서 실증.

## 8. SCOPE OUT

- **snapshotPrefix(결과탭 「건물 기준시가 계산서」 재유도)**: 미배선. 상속평가 경로의 계산서 result-tab
  연동은 별개 인프라(estate 경로와 상이)라 본 작업 범위 밖. `snapshotPrefix` prop 생략 = 종전 동작.
- **겸용(주택+상가) 상속주택**: 이 화면(`HouseValuationSection`)은 단독주택 전용. 겸용은 별도 경로
  (`MixedUsePreHousingDisclosureSection`, 이미 배선됨).
- placeholder "국세청 기준시가 조회" 문구 정정: 오도이나 본 작업 범위 밖(별도 미세수정으로 분리 가능).

## 9. Definition of Done

- [ ] anchor A1~A5 RED→GREEN
- [ ] `PhdBuildingStdPriceModalButton` 배선 (import·points·applyBatch **단일 patch**·버튼 1곳)
- [ ] 버튼 `house_individual` 게이팅 (F2) — `house_apart` 미노출 확인
- [ ] Pre/Post 두 렌더 사이트 모두 버튼 노출 확인(컴포넌트 내부 배선이므로 자동)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 회귀 통과
- [ ] E2E: 계산→적용→미리보기 반영
- [ ] 브라우저 수동 확인(Playwright) 또는 미수행 명시
- [ ] N1(pre-1990 위치지수 seed) 실측 결론 기재

## 10. 리스크

- **낮음**: 순수 UI 배선, 엔진·필드·API 무변경. 기존 계산기·기존 필드 재사용.
- 미확인 N1(pre-1990 건물 위치지수 처리) — anchor A2로 착수 전 확정.
- **pre-existing flag (본 작업 범위 밖)**: `HouseValuationSection`이 공동주택(`house_apart`)에도
  토지/건물 분리 3시점 입력을 노출하는 것 자체의 세법 적정성은 별도 검토 대상. 본 작업은 계산기 버튼을
  `house_individual`로 게이팅(F2)해 부적합 자동산출은 차단하되, 기존 수동 입력·모델링은 그대로 둔다.
