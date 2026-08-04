# 건물 기준시가 계산기 — 호출 맥락별 시점 수(3/2/1) 일치 계획

작성 2026-08-04 · **A안 채택 확정(2026-08-04 사용자 승인)** · 대상 세목 양도소득세 · 상태 **구현 완료(P0~P5)**
검토 이력: STEP 1 3-way 자가검토 반영(2026-08-04, 정정 26건 — Critical 7·High 8·Medium 7·Low 4)
· STEP 3 blast-radius 재검토 반영(3건: 호출부 수 16 정정 · 스냅샷 정규식 정밀화 · 트랙 판정 헬퍼 단일 소스)
· L-4 처리 (가)안(이식) 확정 — §4.5 신설(2026-08-04)
· **P0~P5 전건 완료**(2026-08-04) + P1·P3·P4 실측 환류: 미지원 조건 중 기계식주차·공동주택 환산은 **사전 판정 불가** → 종전 런처 보조 상시 유지로 §4.2 보강(2026-08-04)

법령 표기: 이하 「소득세법 시행령」 제164조의 각 항을 §164⑤·§164⑥·§164⑦·§164⑧로 축약한다.
「소득세법」 제99조 제1항 제1호 나목은 "나목(건물 기준시가)"으로 축약한다.

---

## 1. 문제

호출부가 요구하는 **시점 개수**와 모달이 보여주는 **입력 화면**이 어긋난다.

상업용건물 「소득세법 시행령」 제164조 제6항 환산(호별 고시 전 취득)은 **취득시·최초고시(2005)·양도시
3시점**의 건물 기준시가를 모두 요구한다(validate `lib/calc/transfer-tax-validate-asset.ts:174~179`,
엔진 입력 `lib/tax-engine/types/commercial-building.types.ts:45~62`). 그런데 화면은:

| 필드 | 계산 런처 | 위치 |
|---|---|---|
| 취득시 건물 기준시가 | 있음(1시점 모달) | `CommercialBuildingBlock.tsx:217` |
| **최초고시시(2005) 건물 기준시가** | **없음 — 수동 입력만** | `CommercialBuildingBlock.tsx:219~229`(런처 미배치) |
| 양도시 건물 기준시가 | 있음(1시점 모달) | `CommercialBuildingBlock.tsx:247` |

즉 3시점 중 **1개는 계산 수단이 아예 없고**, 나머지 2개는 모달을 각각 열어 소재지·연면적·
신축연도 같은 **건물 공통 정보를 두 번 입력**해야 한다.

일반건물(`GeneralBuildingBlock.tsx:328,356`)도 취득·양도 2시점을 서로 다른 모달 2개로 받는다.

## 2. 현행 구조 (실측)

건물 기준시가 계산 UI는 **두 갈래**가 병존한다.

### 2.1 범용 폼 모달 — `BuildingStdPriceModalButton` (281줄)

`BuildingStdPriceForm`(633줄)을 Dialog에 띄운다. 시점 축이 **폼 상태에 하드코딩**돼 있다:

- 양도 모드 = `acq*`(취득) + `trans*`(양도) **2축 고정** (`lib/calc/building-std-price-form.ts:137~144`)
- 상증 모드 = `val*` 1축 (`:154~157`)
- `singleTimePoint`(`"acquisition" | "transfer"`)로 **1시점 축소** 가능
  (폼 상태 `building-std-price-form.ts:184` · 렌더 게이트 `BuildingStdPriceForm.tsx:229~231`
  · 엔진 `types/building-standard-price.types.ts:88`)
- `transferSectionLabel`로 둘째 축 라벨만 바꿔 "최초고시 시점"으로 전용하는 우회가 존재
  (`BuildingStdPriceForm.tsx:214~216` · 호출 `ReductionPhdInput.tsx:223,251`)

**이 모달만 가진 기능(P3에서 잃으면 안 되는 것)**:
- `AddressSearch` 소재지 검색 (`BuildingStdPriceForm.tsx:305~318`)
- **건축물대장 자동조회** `BuildingRegisterLookupField` — 신축연도·연면적 자동채움
  (`BuildingStdPriceForm.tsx:319~328`)
- 기계식주차·공동주택 환산·§164⑧ 동일연도·상증 조정률 전 경로

⇒ **한 번에 최대 2시점.** 3시점은 구조적으로 불가능하다.

### 2.2 배치 모달 — `PhdBuildingStdPriceModalButton` (522줄)

PHD(§164⑤) 맥락에서 출발했으나 **이미 PHD 밖에서도 쓰이는 3시점 일괄 계산기**다
(상속 주택평가 `HouseValuationSection.tsx:318` — §2.3 참조):

- 시점을 **배열로 주입**받는다: `points: PointMeta[]`
  (`{key, label, year, landPricePerM2}` — `PhdBuildingStdPriceModalButton.tsx:50~56`)
- 연도 미상 시점은 계산에서 자동 제외 (엔진 `phd-building-std-batch.ts:200`)
- 부분(층·구역)별 구조·용도를 **시점마다 별도 지정**(연도별 용도번호 체계 상이 대응 — `:97~106`)
- 적용 시 시점×카테고리 스냅샷을 재구성해 「건물 기준시가 계산서」에 연결(`phd-batch-snapshots.ts`)
- 산출 엔진 `computePhdThreePointStdPrice`(`lib/calc/phd-building-std-batch.ts:247`)

**🔴 범용화 전 실제 한계 (실측 — §4.1 작업량의 근거)**:

| # | 한계 | 근거 |
|---|---|---|
| L-1 | `PointMeta.label`이 **dead prop** — 표시는 모듈 상수 `POINT_LABEL` 하드코딩("취득시/최초공시일/양도시") | `:109~113` 소비처 `:445,492,499,510` |
| L-2 | **결과·적용 영역이 3행 하드코딩** — points-driven인 것은 입력측 공시지가(`:414`)뿐 | `:487` `(["acquisition","firstDisclosure","transfer"] as const).map` |
| L-3 | 버튼 라벨·DialogTitle·섹션 헤더에 **"3시점" 문자열 하드코딩** | `:159,308,312,319,480` |
| L-4 | **AddressSearch·건축물대장 조회 없음** | import 목록 `:13~36`에 부재(실측) |

**미지원 계산 경로(실측)** — 이 계획의 경계선이다:

| 경로 | 근거 |
|---|---|
| §164⑧ 동일연도 환산 | 배치가 `transferYear = 2001` 고정으로 **회피**(`phd-building-std-batch.ts:161~162`) |
| 기계식주차전용빌딩 | `PhdBatchInput`에 필드 없음(`:75~88`) |
| 공동주택 고시 전 취득 환산 | 동상(`apartmentConversion` 미보유) |
| 상증 조정률·특성(specialFeatures) | 동상 |
| 양도시점 ≤2000 | `unsupported` 기록(`:225~227`) |
| 카테고리 | `housing`/`commercial` **2종 고정**(`:21`) |

### 2.3 호출부 × 필요 시점 전수 매트릭스 (실측 — 재작성)

**배치 모달(`PhdBuildingStdPriceModalButton`) 호출부 — JSX 3곳**. P2 rename의 직접 영향권:

| 호출부 | 시점 | 맥락 |
|---|---|---|
| `ThreePointStandardPriceInput.tsx:703` | 3 | 겸용·PHD 주택분(기준 구현) |
| `ThreePointAssetMajorRender.tsx:116` | 3 | 겸용 Case A 섹션별 런처 |
| **`HouseValuationSection.tsx:318`** | 3 | **상속 주택평가(F2)** — PHD 무관. §2.2 "PHD 전용" 전제를 깨는 근거 |

**범용 폼 모달(`BuildingStdPriceModalButton`) 호출부 — JSX 16곳 / 10개 파일**(실측 `grep -c`):

| 호출부 | 필요 시점 | 현행 | 결함 |
|---|---|---|---|
| `CommercialBuildingBlock.tsx:217,247` | **3**(취득·최초고시2005·양도) | 1시점 모달 ×2, 최초고시 런처 없음 | **F-1·F-2** |
| `GeneralBuildingBlock.tsx:328,356` | 2(취득·양도) | 1시점 모달 ×2 | F-3 |
| `ReductionPhdInput.tsx:223,251` | 2(취득·최초고시) | 2시점(라벨 override) | — |
| `MixedUseAssetMajorStdPrice.tsx:381` | 2(취득·양도 동시) | `onApplyBoth` | — |
| `MixedUseLegacyStdPrice.tsx:200,329` | 2 | 동상 | — |
| `LandBuildingSplitSection.tsx:215` | 1~2(`both` 분기) | 조건부 `applyTimePoint` | — |
| `ThreePointStandardPriceInput.tsx:518,545,570` | 1 ×3 | 시점별 1시점 모달 | — |
| `CommercialInheritanceStdPriceSection.tsx:100` | 1(취득당시) | 1시점 | — |
| `TransferStdPriceCards.tsx:137` | 1(양도) | 1시점 | — |
| `EstateBodySupplementaryValuation.tsx:232` | 1(상증 평가) | 1시점 | — |

⇒ **1시점 요구는 이미 충족**(`singleTimePoint`). 실제 결함은 3시점 부재(F-1·F-2)와
2시점의 모달 분리(F-3)다. 이번 계획의 변경 대상은 **CB·GB 4개 런처**뿐이며, 나머지는 무변경이다.

## 3. 결함 정의

- **F-1 (기능 부재)** 최초고시(2005) 건물 기준시가에 계산 런처가 없다 → 사용자가 외부에서 산정해
  수동 입력해야 하고, validate는 미입력을 차단하므로(`transfer-tax-validate-asset.ts:176~177`)
  §164⑥ 경로가 사실상 막힌다.
- **F-2 (중복 입력)** 3시점이 필요한 화면에서 모달을 2~3번 열고 건물 공통 정보를 매번 재입력.
- **F-3 (중복 입력, 경미)** 2시점 요구를 모달 2개로 분리.

## 4. 설계 결정

### 4.1 채택안 — **A안: 배치 모달을 범용 N시점 계산기로 승격** (확정)

`PhdBuildingStdPriceModalButton` → `MultiPointBuildingStdPriceModal`로 **rename**하고(신설 아님),
시점 스펙을 호출부가 주입한다.

```ts
// PointMeta → StdPricePointSpec 로 rename (필드 동일 — 별도 신설 금지, dual-truth 회피)
export interface StdPricePointSpec {
  key: "acquisition" | "firstDisclosure" | "transfer";
  /** 화면 라벨 — 상가 §164⑥은 "최초고시(2005)", PHD §164⑤는 "최초공시일" */
  label: string;
  year: number | undefined;      // undefined = 이 시점 계산 제외
  landPricePerM2: string;        // prefill
}
```

**rename 대상 export 3종**: 컴포넌트 · `PointMeta` · `PhdThreePointApply`.
`key`는 엔진 `PointKey`와 동일 유지 — **엔진·스냅샷 생성 로직 변경 0**.

**⚠️ P2 실작업 — "라벨만 일반화"가 아니다.** §2.2의 L-1~L-4를 전부 해소해야 계획의
"시점 개수 = `points.length`"가 참이 된다:

1. `points[].label`을 표시 지점에 **실제 배선**(`:445,492,499,510` 등) — 미주입 시 `POINT_LABEL` fallback (L-1)
2. **결과·적용 영역을 `points.map` 기반으로 전환**(`:487`, 산출 개수 집계 `:268~277`) (L-2)
3. "3시점" 하드코딩 문구를 `points.length` 기반으로 생성(`:159,308,312,319,480`) (L-3)
4. L-4(소재지·건축물대장 조회) **이식** — §4.5 (2026-08-04 (가)안 확정)

**B안(범용 폼을 N시점으로 확장)을 택하지 않은 이유**: `BuildingStdPriceFormState`의 시점 축이
`acq*`/`trans*`/`val*` **필드명 수준으로 고정**돼 있고(`building-std-price-form.ts:137~157`),
그 스냅샷이 「건물 기준시가 계산서」 서식·PDF 재계산의 입력이다
(`building-std-price-form.ts:176~183` 주석). 축을 배열로 바꾸면 저장된 스냅샷이 전부 깨진다.

### 4.2 적용 경계 (강제)

배치 모달은 **§2.2 미지원 계산 경로에서는 쓰지 않는다.** 해당 조건에서는 종전 모달을 유지한다:

- 취득연도 == 양도연도(§164⑧) · 기계식주차 · 공동주택 환산 · 상증 조정률 경로
- 양도시점 ≤2000

⇒ 호출부는 **배치 가능 여부를 판정하는 단일 헬퍼**를 공유한다(dual-truth 방지):
`lib/calc/building-std-multipoint-gate.ts`(신규) 1곳. UI 게이트·anchor가 같은 함수를 쓴다.

**🔴 P1 실측 환류(2026-08-04)** — 미지원 조건은 **두 부류**이며, 게이트로 다룰 수 있는 것은 절반이다:

| 부류 | 조건 | 근거 |
|---|---|---|
| **사전 판정 가능**(자산 폼 정보) | §164⑧ 동일연도 · 양도 ≤2000 · 상증 맥락 | 게이트가 판정 |
| **사전 판정 불가**(모달 내부 state) | 기계식주차(`isMechanicalParking`) · 공동주택 고시 전 취득 환산(`apartmentConversionMode`) | `AssetForm`에 **대응 필드 없음**(실측) — 런처를 그리는 시점에 알 수 없다 |

**런처 노출 규칙(확정 — Q-3 보강)**:
1. 게이트 `canUseMultiPointStdPrice()` **true** → 배치 런처를 **primary**로 노출.
2. 게이트 **false** → 배치 런처 미노출 + 종전 1시점 런처 유지 + `MULTI_POINT_BLOCK_MESSAGE` 사유 표시.
3. **게이트 true여도 종전 1시점 런처를 보조로 상시 유지**한다 — 기계식주차·공동주택 환산 사용자는
   모달을 열기 전에 식별할 수 없으므로, 배치만 남기면 그들의 입력 경로가 사라진다(dead-end,
   memory `feedback_ui_gate_removes_sole_input_path`). 보조 런처는 시각적으로 낮은 위계로 두고
   "기계식주차·공동주택 환산 등 특수 산정" 맥락을 라벨·hint로 밝힌다.

⇒ **P3·P4에서 종전 런처를 삭제하지 않는다.** F-2(중복 입력) 해소는 "런처를 없애서"가 아니라
"배치 1회로 3필드가 채워져서" 달성된다.

선례: `ThreePointStandardPriceInput.tsx:712` `hideBuildingCalcButton={props.enableBatchCalc}`는
개별 런처를 **숨기는** 패턴이지만, 그 화면은 기계식·공동주택 환산 맥락이 없어 성립했다 —
CB·GB에는 그대로 적용할 수 없다.

### 4.3 상가 §164⑥ 특유 쟁점

1. **취득 ≤2000**: 배치는 `acqBaseStdPrice`(2001 지수표 × 산정기준율)로 자동 산정한다
   (`phd-building-std-batch.ts:150~184`). 이는 UI의 §164⑥ 단서 확인 토글
   (`cbAcqBuildingStdBy164_5` — `Sec164_5ProvisoNotice`, validate `transfer-tax-validate-asset.ts:189~194`)이
   요구하는 "§164⑤ 준용 산정"과 **같은 경로**다 → Q-1 확정안(§7) 적용.
2. **최초고시 = 2005 고정**: `firstDisclosure.year`는 `number`인데
   `commercial-cb-era.ts:27`의 `COMMERCIAL_FIRST_DISCLOSURE_DATE`는 **문자열 `"2005-01-01"`**이다
   (엔진 `transfer-tax-commercial-step.ts:169`의 동명 상수는 `Date`이며 **export되지 않는다**).
   ⇒ 같은 파일에 **숫자 상수 `COMMERCIAL_FIRST_DISCLOSURE_YEAR = 2005`를 신설**하고 문자열 상수와
   나란히 둔다(파싱 산재 금지). 2005 ≥ 2001이므로 valuation 경로 — `landPrice2001PerM2` 특례 불요.
3. **카테고리**: 상가는 `housing`/`commercial` 구분이 무의미하다. 단일 카테고리(`housing` 슬롯
   재사용)로 넣되 라벨은 `housingNoun`이 이미 비겸용에서 "건물"로 표시한다(`:160~161`).
   `unsupported` 사유 표시도 **기존 구현 재사용**(`:508~512`) — 신규 작업 아님, 문구만 확인.
4. **🔴 `landPrices` 되돌려쓰기 — 취득분은 드롭한다.** 배치는 시점별 입력 공시지가를
   `PhdThreePointApply.landPrices`로 되돌려준다(`:44~48`). CB에는 대응 3필드
   (`cbLandPricePerSqmAtAcq`/`AtFirst`/`AtTransfer`)가 있으나 **취득분은 그대로 쓰면 안 된다** —
   모달이 받는 취득 공시지가는 취득 ≤2000일 때 **2001.1.1 기준(위치지수 전용)**인데
   (`:416~436` `fixedYear={2001}`), `cbLandPricePerSqmAtAcq`는 "취득시 ㎡당기준시가합의 **토지 성분**"
   (`calc-wizard-asset.ts:797~801`)이라 트랙이 다르다. 넣으면 §164⑥ 환산이 조용히 오염된다.
   참조 구현은 전용 필드로 라우팅하지만(`ThreePointStandardPriceInput.tsx:678~685`)
   **CB에는 그 전용 필드가 없다**.
   ⇒ **확정**: `landPrices.firstDisclosure`·`landPrices.transfer`만 CB 필드에 반영하고,
   `landPrices.acquisition`은 **취득 ≤2000이면 드롭**(≥2001은 두 트랙이 같은 값이라 반영).
   트랙 판정은 **기존 헬퍼 `isAcq2001LocationIndexTrack`**(`lib/calc/phd-acq-land-price-track.ts:18`)을
   재사용한다 — 조건을 다시 쓰지 않는다(단일 소스).
   anchor로 "취득 ≤2000에서 `cbLandPricePerSqmAtAcq` 미오염"을 고정한다.
5. **🔴 스냅샷 키 — 「계산서」 인식 정규식을 확장해야 한다.**
   배치가 만드는 키는 `${prefix}-{acq|first|transfer}[-commercial]`(`phd-batch-snapshots.ts:128`).
   상가 prefix를 `bsp-${assetId}-cb`로 두면 `-cb-acq`·`-cb-transfer`는 기존 1시점 키와 **동일**해
   자연 호환되지만, **`-cb-first`를 인식하는 분기가 없다**:
   - `snapshotKeyTimepoint`(`lib/calc/building-std-snapshot-keys.ts:44~48`) — 접두 집합에 `cb`는
     **이미 있다**(acq·transfer 양쪽). 문제는 **반환 타입이 `"acquisition"|"transfer"|null`이라
     `first` 시점 자체가 없다**는 것 → `-cb-first`는 `null`을 받는다. 화면·PDF 양쪽이 이 함수를
     쓰므로(`:40~43` 주석) 반환 타입 확장 여부는 **소비처 2곳 확인 후 결정**(P3)
   - `phdTimepointLabel`(`:51~58`) — `-phd-(acq|first|transfer)` **고정**, 라벨 "최초공시일" 고정
     → `-cb-` 분기 추가 + 상가 라벨 **"최초고시(2005)"**
   - `isTransferAcq`(`components/calc/results/BuildingStdPriceReportSection.tsx:66`) — `/-phd-acq/`
     → `cb` 추가

### 4.4 다중키 적용은 **단일 배치 patch** (강제)

배치 적용 1회가 CB에서 바꾸는 필드는 최대 4개다(건물 기준시가 3시점 + `cbAcqBuildingStdBy164_5`).
`CommercialBuildingBlock`은 `onChange(patch: Partial<AssetForm>)` 단일 창구를 가지므로
**`onChange({ cbBuildingStdPriceAtAcq, cbBuildingStdPriceAtFirst, cbBuildingStdPriceAtTransfer,
cbAcqBuildingStdBy164_5 })` 한 번**으로 반영한다.

⛔ 기존 배치 적용부 `ThreePointStandardPriceInput.tsx:662~686`(`applyBatch`)는 개별 콜백을
최대 9회 연속 호출하는 형태다 — **이 형태를 CB로 복제하지 말 것**. 단일-키 updater 연속 호출은
stale spread last-write-wins를 부른다(memory `feedback_multikey_patch_stale_spread_overwrite`,
PR #804 실사례: 취득값만 옛 값으로 되돌아감). anchor에 4키 동시 반영 케이스를 넣는다.

> 별건: `applyBatch` 자체가 같은 잠복 버그를 갖는지는 상위 콜백 구현에 달렸다 — **미확정**.
> 이 계획의 범위 밖이며 별도 확인이 필요하다.

### 4.4-b P2 실측 — 취득 ≤2000 전용 행의 라벨 불일치 (해소됨)

취득 ≤2000이면 공시지가 입력이 `LandPriceLookupField` 전용 행으로 갈리는데, 그 행만 라벨을
`"취득시 (2001년 기준) 공시지가"`로 **하드코딩**하고 있었다. 호출부가 다른 이름을 주면
(상속 주택평가 = `"취득시(상속)"` — `HouseValuationSection.tsx:255`) **같은 시점이 취득연도에 따라
다른 이름으로 불렸다**(≥2001은 label, ≤2000은 하드코딩).

L-1 배선으로 해소했고, 이에 의존하던 E2E 기대값 1건을 갱신했다
(`e2e/transfer-inheritance-house-val-building-std-batch.spec.ts:100`).

### 4.3-b P3 실측 환류 — 스냅샷 인식 확장은 2곳이 아니라 **3종 수정**

계획 §4.3-5는 "정규식 3곳 확장"이라고 봤으나 실측 결과는 다음과 같다:

| 대상 | 판정 | 조치 |
|---|---|---|
| `snapshotKeyTimepoint` | **수정 불요** — `cb`는 이미 접두 집합에 있고, `-cb-first`는 valuation(`taxType:"inheritance_gift"`) 스냅샷이라 필터가 적용되지 않는다(필터는 `snap.taxType === "transfer"` 조건부 — `BuildingStdPriceReportSection.tsx:69`) | — |
| `idOfSnapshotKey` | **수정 불요** — `-(?:gb|cbinh|cb|phd|split)-(?:acq|first|transfer)`가 이미 `cb`+`first`를 환원 | — |
| `phdTimepointLabel` | `-phd-` 고정 → `-cb-` 추가 | ✅ + **`categoryLabel`·`order` 반환 신설** |
| `isTransferAcq`(계산서 acq2000 마킹) | `/-phd-acq/` → `cb` 추가 | ✅ |

**추가로 발견된 2건**(계획서 미예상):
1. **"주택분" 오표시** — 상가 배치는 카테고리 구분이 없어 `housing` 슬롯을 재사용하는데, 계산서
   헤딩이 `category === "commercial" ? "상가분" : "주택분"`으로 만들어져 상가 건물이 "주택분"이 된다.
   ⇒ `categoryLabel`을 반환에 넣고(상가 = "건물") 소비처가 그것을 쓰게 했다.
2. **정렬 rank 붕괴** — rank가 `{취득시:0, 최초공시일:1, 양도시:2}[tp.timepoint] ?? 0` 라벨 매칭이라
   "최초고시(2005)"가 **0으로 떨어져** 취득시와 같은 순위가 된다. ⇒ `order`(시점 세그먼트 기반)로 교체.

### 4.3-c P4 실측 환류 — 계산서 시점 라벨은 **배치 전용 키**에만 붙인다

P3에서 `phdTimepointLabel`에 `cb`를, P4에서 `gb`를 넣었더니 기존 테스트가 회귀를 잡았다
(`building-std-report-phd-section.test.tsx` S9-d).

**원인**: `-gb-acq`·`-gb-transfer`·`-cb-acq`·`-cb-transfer`는 **시점별 1시점 모달과 키를 공유**한다
(`snapshotKey={bsp-${assetId}-gb-transfer}` 등). 여기에 라벨 override를 붙이면 배치를 쓰지 않고
시점별 계산기로 저장한 스냅샷의 계산서 제목까지 바뀐다.

**정정**: 대상을 배치만 만드는 키로 한정한다 —
`-phd-{acq|first|transfer}`(PHD 배치 전용 접두) + **`-cb-first`**(1시점 모달에는 `first` 시점이 없다).
취득·양도는 기본 제목("취득당시/양도당시 기준시가 계산")이 이미 시점을 밝혀 정보 손실이 없다.
`isTransferAcq`(acq2000 마킹)도 `-phd-acq`로 되돌렸다 — tp가 null이면 override 자체가 발화하지 않는다.

### 4.5 소재지·건축물대장 조회 이식 ((가)안 확정 — 2026-08-04)

범용 폼 모달만 가진 두 블록을 **배치 모달로 이식**한다(종전 런처 병존안 (나)는 기각 — 같은 정보를
두 모달에서 각각 찾게 되어 F-2를 그대로 남긴다):

| 이식 대상 | 원본 | 비고 |
|---|---|---|
| `AddressSearch` 소재지 | `BuildingStdPriceForm.tsx:305~318` | `buildAddressPatch`(`building-std-price-form.ts:299`) 재사용 — 파싱 재작성 금지 |
| `BuildingRegisterLookupField` | `BuildingStdPriceForm.tsx:319~328` | `onAutoFill` patch가 신축연도·연면적을 채운다 |

**배선 제약**:
- 배치 모달의 신축연도(`builtYear`)·부분별 연면적(`PartRow.floorArea`)은 **로컬 state**
  (`PhdBuildingStdPriceModalButton.tsx:138~139`)다. `onAutoFill` patch는 `BuildingStdPriceFormState`
  형태로 오므로 **필드 매핑 어댑터**가 필요하다(연면적은 첫 행에 시드 — `housingFloorAreaPrefill`과
  동일 규칙).
- 집합건물(동/호) 분기 문구·전유+공용 안내(`BuildingStdPriceForm.tsx:329~334`)도 함께 옮긴다.
- 소재지 입력은 **공시지가 Vworld 조회의 전제**(`jibun` prop)이므로, 이식 후 `jibun`을
  로컬 state에서 우선 취하고 없으면 prop fallback으로 한다(호출부 주입은 그대로 유지).
- P3에서 CB는 `initialAddress` 성격의 prefill(자산 카드 소재지)을 배치 모달에도 넘긴다 —
  현행 CB 1시점 런처가 `stdPriceAddress`로 하던 것과 동형(`CommercialBuildingBlock.tsx:67~75`).

이식으로 배치 모달이 커지므로(현 522줄) **분리 착지 ≤700을 P2에서 함께 판단**한다.

## 5. Phase 분할

| Phase | 내용 | verify |
|---|---|---|
| **P0 ✅** | 배치 엔진이 상가 3시점(취득 2000 · 최초고시 2005 · 양도 2026)에서 값을 내는지 선실측. **기존 anchor 파일**(`__tests__/tax-engine/building-standard-price/phd-3point-batch.anchor.test.ts`)에 상시 케이스로 추가(throwaway 아님) | ✅ 통과 — 취득2000 28,096,229 / 최초고시2005 35,663,760 / 양도2026 48,872,560 · `unsupported` 0. 부수: 2026 지수표 **존재**(폼 주석 stale 확인) |
| **P1 ✅** | 게이트 헬퍼 `lib/calc/building-std-multipoint-gate.ts` 신설 — 사전 판정 가능 3조건 + `MULTI_POINT_BLOCK_MESSAGE` | ✅ `__tests__/calc/building-std-multipoint-gate.test.ts` **9케이스 통과** · tsc·ESLint 0건 |
| **P2 ✅** | 배치 모달 범용화 — L-1(label 배선)·L-2(결과·computedCount points화)·L-3(시점 수 문구)·**L-4 이식(§4.5)** + rename(`MultiPointBuildingStdPriceModal`·`StdPricePointSpec`·`MultiPointStdPriceApply`). 호출부 3곳 + 테스트·E2E 8파일 갱신 | ✅ tsc·ESLint 0건 · anchor 신설 `multipoint-modal-points-driven.anchor.test.tsx` **7건** · `__tests__/{components,calc}` **2,219건** · E2E `transfer-phd-building-stdprice-calculator` + `transfer-inheritance-house-val-building-std-batch` **14건** |
| **P3 ✅** | 상가 §164⑥ 3시점 배선 — 배치 런처(게이트 true 시, **종전 런처 병존**) · patch 조립 순수 함수 `lib/calc/commercial-batch-apply.ts`(4키 단일 배치 · 취득≤2000 공시지가 드롭 · Q-1 자동체크/해제) · 스냅샷 라벨·정렬·acq2000 override 확장 · `COMMERCIAL_FIRST_DISCLOSURE_YEAR` 신설 · testid `cb-building-std-batch-open` | ✅ tsc·ESLint 0건 · anchor **12건**(`commercial-batch-stdprice-apply.anchor.test.tsx`) + 스냅샷 키 **6건** · `__tests__/{components,calc}` **2,234건** · E2E 신설 `commercial-building-std-batch.spec.ts` **3건** |
| **P4 ✅** | 일반건물 2시점 배선 — 배치 런처(② 취득시 카드 상단, 게이트 true 시 · **종전 런처 2개 유지**) · `buildGeneralBuildingBatchPatch`(취득 시점은 **건물 취득일 우선** §166⑥) · `commercial-batch-apply.ts` → **`building-std-batch-apply.ts`** 범용화 · testid `gb-building-std-batch-open`. **800줄 동반 분리**: `GeneralBuildingBlock.tsx` 836 → **536줄**(③ 비사업용토지 → `GeneralBuildingNblSection.tsx` 146줄 · ⑦ 용도변경 → `GeneralBuildingConversionSection.tsx` 226줄) | ✅ tsc·ESLint 0건 · anchor **7건** · `__tests__/{components,calc}` **2,242건** · E2E `building-stdprice-apply-timepoint`(셀렉터 갱신 불요 — 종전 런처 유지) + 상가 3건 통과 |
| **P5 ✅** | 전체 회귀 | ✅ `npm test` **1,197파일 13,324건**(skip 13·todo 1) · E2E 영향권 **22개 spec 45건** · ESLint 경고 283건 = **변경 전 기준선과 동일**(신규 0) · pre-push 톤·폰트 게이트 통과 |

**800줄 상태(P2 후 실측)**: `MultiPointBuildingStdPriceModal.tsx` **625줄**(L-4 이식 후 +103) —
트리거 800·착지목표 700 모두 충족, 분리 불요. `ThreePointStandardPriceInput.tsx` **790줄** —
P2 변경은 import 이름 치환뿐이라 **증가 0** → 기회주의적 분리 보류(P4에서 재판단).

**P3 이전에 P0을 반드시 통과**시킨다(`pre-do-anchor-verification` — "현행 엔진 일치 예상" 가정 금지).

> P0 작성 시 주의: `building-std-price-form.ts:266~268`의 주석 "위치지수 2026 부재 → 2001~2025"는
> **stale일 수 있다**(자가검토 probe에서 2026 위치지수·용도지수 존재 관측). 양도 연도를 낮추기 전에
> `hasLocationIndexYear(2026)`을 직접 확인할 것.

## 6. 동기화 지점 영향

엔진 `BuildingStandardPriceInput`·`TransferTaxInput`은 **변경 없다**(시점 조립은 UI 레이어).
따라서 14지점 중 실제 영향은:

- ⑤ UI 입력 위젯 — 런처 교체(P3·P4)
- ⑦ 결과 카드 — **영향 있음**: 「건물 기준시가 계산서」가 `-phd-` 접두 정규식으로 시점 라벨·
  취득2000 마킹을 붙인다(§4.3-5) → 접두 집합·라벨 분기 확장 필요
- ⑧ Validation — **필드·필수 조건은 불변**이나, Q-1 자동 체크가 §164⑥ 단서 차단
  (`transfer-tax-validate-asset.ts:189~194`)의 **발화 조건**을 바꾼다. 자동 해제 경로까지 anchor 고정
- 스냅샷 — `phd-batch-snapshots.ts`가 시점×카테고리 키 생성. prefix `bsp-${assetId}-cb` 확정(§7 Q-2)

## 7. 결정 사항 (확정)

- **Q-1 확정 ✅** — 배치로 취득시 금액을 적용하면 `cbAcqBuildingStdBy164_5`를 **자동 체크**하고
  "계산기가 §164⑤ 준용으로 산정" 배지를 표시한다. 근거: 배치의 취득 ≤2000 경로가 곧 §164⑤ 준용
  산정(§4.3-1)이라 토글의 전제가 코드로 보장된다.
  **단, 사용자가 「취득시 건물 기준시가」 칸을 직접 수정하면 자동 체크를 해제**한다(stale 확인 방지).
  해제도 §4.4의 **단일 배치 patch**로 처리한다(`onChange({ cbBuildingStdPriceAtAcq, cbAcqBuildingStdBy164_5: false })`).
  `useEffect → store` 미러링으로 구현 금지.
- **Q-2 해소 ✅** — 상가 배치 스냅샷 prefix = **`bsp-${assetId}-cb`**. 근거 3건(실측):
  `replaceSnapshotsByPrefix`는 `${prefix}-` 접두만 삭제하므로(`building-std-snapshot-store.ts:35~41`)
  `-cbinh-*`(상속 배치)를 건드리지 않는다 · `idOfSnapshotKey`(`building-std-snapshot-keys.ts:23`)가
  `cb`를 이미 환원한다 · 선례 경고(`MixedUseAssetMajorStdPrice.tsx:124` — "phd prefix를 쓰면 배치
  `replaceSnapshotsByPrefix`에 삭제된다")가 접두 분리 원칙을 확립했다.
  잔여 작업은 **키 인식 정규식 3곳 확장**(§4.3-5)이며 P3 범위다.
- **Q-3 확정 ✅** — 조건부 폴백. §4.2 런처 노출 규칙 참조.

## 8. 리스크

| 리스크 | 완화 |
|---|---|
| P2 rename이 **상속 주택평가**(`HouseValuationSection.tsx:318`)·겸용 Case A(`ThreePointAssetMajorRender.tsx:116`) 회귀 | P2 verify에 두 경로 테스트·E2E 명시(§5). 산출 로직은 **무변경** — 표시·prop만 |
| ~~상가 취득 ≤2000이 배치에서 `unsupported`로 떨어짐~~ | **P0에서 해소** — 3시점 전부 산출, `unsupported` 0 |
| **배치 교체로 건축물대장 자동조회 상실**(§2.2 L-4) | **(가)안 확정** — P2에서 소재지·건축물대장 블록을 배치 모달에 이식(§4.5). 이식 전 P3 진입 금지 |
| `replaceSnapshotsByPrefix`가 접두 키를 **먼저 전부 삭제** → 배치가 일부 시점만 산출하면(`unsupported`) 기존 1시점 스냅샷까지 사라져 계산서에 구멍 | P3 anchor "unsupported 시점의 기존 스냅샷 보존" 케이스. 필요 시 삭제 범위를 산출 시점으로 한정 |
| 4키 적용에서 stale spread 덮어쓰기 | §4.4 단일 배치 강제 + anchor |
| 취득 공시지가 트랙 오염(§4.3-4) | 취득분 드롭 + anchor |
| 800줄 초과(`GeneralBuildingBlock` 780 · `ThreePointStandardPriceInput` 790) | P2·P4에서 동반 분리(착지 ≤700) |

## 9. 참고

- `docs/02-design/features/phd-building-stdprice-3point-batch-mixed-use.plan.md` (배치 모달 원설계)
- `docs/02-design/features/building-std-report-result-tab-phd-batch.plan.md` (배치 스냅샷 → 계산서)
- `docs/01-plan/features/commercial-164-6-proviso-164-5-application.plan.md` (§164⑥ 단서 게이트)
- anchor: `__tests__/tax-engine/building-standard-price/phd-3point-batch.anchor.test.ts`
