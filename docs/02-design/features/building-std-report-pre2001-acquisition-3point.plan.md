# 건물 기준시가 계산서 — 2001년 이전 취득 시점 3시점 서식 확장

작성일: 2026-07-19 · rev.2(자가검토 STEP 1~4 반영) · 대상: 결과탭 「건물 기준시가 계산서」 PHD 3시점 배치(양도·상속 공용) · 성격: 기능 확장(엔진 단독 acqBase echo 노출 + 클라이언트 재유도)

## 0. 문제 (사용자 확정)

결과탭 「건물 기준시가 계산서」가 **취득이 2001년 이전인 경우 취득시 계산서만 누락**된다(최초공시일·양도시 2벌만 출력). 사용자는 이미지7과 동일한 서식 —
- 취득당시(2001 이전) = **2001.1.1 valuation 표(신축가격기준액×구조×용도×위치×잔가율) × 산정기준율**
- 최초공시일·양도시 = 일반 valuation 표

— 로 **취득·최초공시·양도 3시점 전부** 출력되기를 원한다.

## 1. 현행 인프라 (실측 — file:line)

### 1-1. 엔진: acqBase 산식은 있으나 단독은 acqBaseConversion echo **미노출** ⚠️
- `calcBuildingStandardPrice(taxType:"transfer")` 취득 분기(`building-standard-price.ts:336-339`): `acquisitionYear>=2001 ? calcPointBreakdown : calcAcqBaseBreakdown`.
- `calcAcqBaseBreakdown`(`building-standard-price-helpers.ts:459-490`): 2001 지수표 `base2001` → `resolveAcqBaseRate` → `standardPrice = floor(pricePerM2 × floorArea × acqBaseRate)`. return `{...base2001, standardPrice, acqBaseRate, appliedLandPriceYear:2001}` — **`base2001`의 rate 적용 전 값(=total2001)은 소실**(standardPrice가 rate 적용값으로 덮임).
- **⚠️ 핵심(C1)**: `result.acqBaseConversion`은 **복합(composite) 경로에서만** 설정(`building-standard-price.ts:213`). **단독(비복합) 경로 return(`:405`)은 `{acquisition, transfer, warnings, legalBasis}`로 `acqBaseConversion` 미포함**. → 단독 취득<2001은 `acquisition.acqBaseRate`만 있고 `acqBaseConversion`은 없다.
- 산정기준율 데이터: `acq-base-rate.ts:23` — 그룹 I·신축 1997·취득 1997 = **0.971**(이미지7과 일치).

### 1-2. 어댑터: acqBase는 `acqBaseConversion`에만 의존 → 단독 미표시 ⚠️
- `buildNtsReportModel` 양도 경로(`nts-report-adapter.ts:257-300`): 양도당시(transfer, `:264` `if(tBody && tPoint)`) + 취득당시(acquisition, `:282`) 인스턴스 생성.
- 취득당시(`:283-298`): `aPoint.year<=2000`이면 `markCell="acq2000"`+`acqNoteLabel`. **`acqBase: result.acqBaseConversion ? {...} : undefined`(`:292`)** — `acqBaseConversion`이 없으면(=단독) **`acqBase=undefined`** → `ReportSection6Total.tsx:39` `{acq && ...}` 게이트 false → **※ 산정기준율 표 미렌더**.

### 1-3. 서식: acq2000 ※표는 acqBase만 있으면 렌더 (준비됨)
- `ReportSection6Total.tsx:39-64`: `inst.acqBase` 있으면 ※ "2001.1.1 건물 기준시가(1) / 산정기준율(2) / 취득당시 기준시가(3)=(1)×(2)" 표(testid `nts-bsp-x-1/-2/-3`). 이미지7 하단과 동일.
- `INSTANCE_TITLE.acq2000`="취득당시(2000.12.31 이전) 기준시가 계산". `ReportEvalTable` 평가표는 시점 무관 동일 렌더(산식 머리 `⑩=⑧×⑨`).
- 서식은 `model:NtsReportModel` 단일 prop — 폼 state 무결합, 결과탭 재사용 중(양도·상속·증여·겸용).

### 1-4. 폼 변환: transfer 모드 지원 + 2시점 강제
- `toEngineInput`(`building-std-price-form.ts:326`) `taxType==="transfer"`: `acquisitionYear`/`transferYear` + `acquisition`/`transfer` point 세팅(`:374-420`). 필드: **`acqStructureKey`·`acqUsageNo`·`acqLandPrice`**(취득) + **`transStructureKey`·`transUsageNo`·`transLandPrice`**(양도). `acquisitionEventDate`는 날짜 라벨 전용.
- **⚠️ 엔진은 양도 2시점 강제**: `validatePoint(input.transfer,"양도시")`(`building-standard-price.ts:396`)·`transferYear`/`acquisitionYear` 미입력 시 throw → **dummy transfer 필수**(취득만 산출 불가).
- `buildNtsReportContext`(`:616`) transfer 모드: `ctx.transfer` + `ctx.acquisition` 세팅(`:635-643`).

### 1-5. 결과탭 렌더 오버라이드 (기존 PHD 배치 로직) ⚠️
`BuildingStdPriceReportSection.tsx:63-79`:
- `titleOverride`(`:64-66`): `${시점} · ${주택/상가분}${snap.valuationYear ? " (연도)" : ""}` — **연도가 `snap.valuationYear` 의존**. transfer 스냅샷은 `valuationYear` 부재 → **연도 미표시**(UI-2).
- `markCellOverride`(`:68-72`): 양도시=`transfer`, 그 외(취득·최초공시)=**무조건 `acq2001`** — **취득<2001인데 `acq2000`을 덮어 Ⅰ.구분 오마킹**(UI-1).
- `rank`(`:74-77`): 취득=0(맨 위)·최초공시=1·양도=2 — "맨 상단" 요구 자동 충족 ✓.

## 2. 갭 (2개)

- **G1 (엔진)**: 단독 취득<2001은 `result.acqBaseConversion` 미노출 → 어댑터 `acqBase=undefined` → ※산정기준율 표 미렌더(§1-1·1-2).
- **G2 (스냅샷)**: `phdBatchToSnapshots`가 모든 시점을 valuation 모드로만 만들고 취득 `point.year<2001`은 `phd-batch-snapshots.ts:90`에서 생략 → 취득 스냅샷 자체가 없음.

## 3. 설계

### 3-1. G1 해소 — 엔진 단독 경로에 acqBaseConversion echo 노출 (권장)
`building-standard-price.ts` 단독 취득<2001 경로에서 `acqBaseConversion` 설정. `result` 타입 **무변경**(`acqBaseConversion?`는 이미 optional 존재 — 복합에서 사용 중). `calcAcqBaseBreakdown`이 **rate 적용 전 total2001**을 반환하도록 소폭 확장:
```
// calcAcqBaseBreakdown: base2001.standardPrice(= floor(pricePerM2 × floorArea), rate 적용 전)를 별도 반환
//   → 단독 경로 return에: acqBaseConversion: { total2001, acqBaseRate, convertedTotal: acquisition.standardPrice }
```
- 이미지7: total2001 = 386,000 × 327.6 = **126,453,600**, acqBaseRate = 0.971, convertedTotal = **122,786,445**.
- 어댑터(`:292`) **무변경** — `acqBaseConversion`이 채워지면 그대로 acqBase 매핑. ※표 자동 렌더.
- **대안(비권장)**: 어댑터에서 `acquisition.acqBaseRate`로 재구성 → floorArea 필요·converted/rate 역산 절사오차 위험. 엔진 노출이 정확·격리.

### 3-2. G2 해소 — 취득<2001 transfer 모드 스냅샷 생성
`phdBatchToSnapshots`의 취득 housing이 `point.year<2001`이면 생략 대신 **transfer 모드 스냅샷** 생성(실제 필드명):
```
BuildingStdPriceFormState {
  taxType: "transfer",
  builtYear, floorArea,
  acquisitionYear: 취득년(<2001), transferYear: 2001,   // dummy(§164⑧ 동일연도 회피: 취득년≠2001)
  acqStructureKey/acqUsageNo/acqLandPrice: 취득 point(구조·용도·취득당시 공시지가),
  transStructureKey/transUsageNo/transLandPrice: 취득 point 값 복사(dummy),
  (복합 시 compositeParts — Phase 2)
}
```
- → 엔진 `result.acquisition`(acqBase, standardPrice=122,786,445) + `result.transfer`(2001 dummy, 폐기 대상) + `result.acqBaseConversion`(G1 노출).

### 3-3. dummy 양도 인스턴스 제거 — 필터는 **불가피**, 키 정규식으로 엄격 한정
엔진 2시점 강제(§1-4)로 dummy transfer는 피할 수 없고 → `buildNtsReportModel`이 양도(dummy)+취득 2벌 생성. 취득만 원하므로 **`BuildingStdPriceReportSection`에서 양도 dummy 인스턴스를 제거**한다:
- **필터 기준 = `-phd-acq(-commercial)$` 키 정규식** (taxType 판정 **금지**). `snap.taxType==="transfer"` 단독 판정은 기존 `bsp-*-gb-transfer`·`-cb-acq`·`*-transfer-commercial` 등 자산 계산기 스냅샷(전부 transfer 모드)의 **양도 인스턴스를 침묵 strip**시킴(C2). 반드시 phd-acq 키에 한정.
- 구현: `phd-acq` 키 + 취득 스냅샷이 transfer 모드일 때 `model.instances`에서 `markCell!=="transfer"`(=취득 인스턴스)만 남긴다. 기존 gb/cb 스냅샷은 무변경(2인스턴스 유지).

### 3-4. markCellOverride·titleOverride 연도 분기 (UI-1·UI-2)
`BuildingStdPriceReportSection.tsx`:
- **markCellOverride**(`:68-72`): 취득 시점이 **취득년<2001**이면 `acq2000`, 아니면 `acq2001`. (양도시는 transfer 유지) — Ⅰ.구분 정마킹.
- **titleOverride 연도**(`:64-66`): 스냅샷에 `valuationYear` 없으면(=transfer 취득 스냅샷) **`acquisitionYear`**를 연도 소스로. 이미지7 "(1997년)" 표시.

### 3-5. 취득당시 공시지가·위치지수 (anchor로 확정 — F4)
`acqLandPrice`(위치지수 산정 입력)는 **취득당시 공시지가**(이미지7: 1,200,000)로 넣는다(`PhdBatchPoint.landPricePerM2`가 취득 시점 값). 위치지수 1.05가 이 값에서 산출되는지 A1 anchor로 assert(추정 금지).

### 3-6. 상가·복합 (Phase 2) — ✅ 완료 (2026-07-19)
- **상가 단일 (Case A)**: `phd-batch-snapshots.ts` `add()`에서 `category==="housing"` 조건 제거 → 상가 Case A(취득 구조·용도 지정) 취득<2001도 `buildTransferAcqSnapshot`로 스냅샷 생성. 엔진 단일 경로(Phase 1 G1)가 이미 acqBaseConversion 노출.
- **복합 (다부분)**: `phd-building-std-batch.ts` `acqBaseStdPrice` 복합 확장(단일부분=`acquisition.standardPrice` / 다부분=`compositeParts` 위임 후 **`acqBaseConversion.convertedTotal`** — 복합 `acquisitionComposite.total`은 산정기준율 적용 前이므로 부적합) + `phd-batch-snapshots.ts` `buildTransferAcqCompositeSnapshot`(각 part `acqUsageNo=usageNo` 필수) + `add()` 단일/복합 분기.
- 최초공시/양도<2001은 여전히 생략(취득 시점만 acqBase).
- anchor: 상가 Case A 스냅샷 + 복합 라운드트립 등가(배치 산출=재유도 convertedTotal) + A3 갱신(복합 취득<2001 산출).

### 3-7. 부분별 산정기준율 그룹 상이 복합 (Phase 3) — ✅ 완료 (2026-07-19)
`building-standard-price.ts` `calcTransferComposite` 취득≤2000 분기 확장:
- **단일 그룹**: 기존 `floor(base2001.total × rate)` 유지(회귀 0).
- **다그룹**(예: rc=I·brick=II): 각 부분 `base2001.breakdowns[i].standardPrice × 부분 그룹 rate`를 floor 후 합산. `acqBaseConversion.acqBaseRate=undefined` → 계산서 ※표 "부분별" 표기(`ReportSection6Total`의 `acq.rate ?? "부분별"` fallback 활용).
- **제약**: 부속시설 혼재(breakdowns 인터리브 → 부분 1:1 귀속 불가) + 다그룹은 미지원(명시적 throw). 배치 스냅샷은 부속 없어 항상 1:1 → 배치 경로는 완전 지원.
- anchor: 엔진 다그룹(rc 45,120,000×1.019 + brick 26,480,000×1.032 = 73,304,639, rate undefined) + 배치 라운드트립 등가. 회귀 271/271.
- 근거: 산정기준율은 (구조군, 신축, 취득연도)별 데이터(`acq-base-rate.ts`) — 부분 구조 상이 시 각 그룹 rate 적용은 그 체계의 자연 확장. 기존 "동일 구조 입력" 제약은 구현 편의였음.

### 3-8. gb/cb 2시점 스냅샷 중복 제거 (부수 발견) — ✅ 완료 (2026-07-19)
G1으로 일반 양도(2시점, 비-PHD) gb/cb 자산도 취득<2001이면 acq2000 ※표가 출력됨(부수효과, 이미 master). 그러나 gb/cb는 `-gb-acq`(취득분)·`-gb-transfer`(양도분) **2스냅샷**을 저장하고 각 스냅샷이 transfer 2시점 모드라 재유도 시 양도+취득 2인스턴스 → **취득·양도 계산서 각 2벌 중복**(취득 연도 무관 기존 구조 문제).
- 수정: `BuildingStdPriceReportSection.tsx` 필터를 시점 전용 키로 확장 — 취득 전용(`phd-acq`·`gb-acq`·`cb-acq`)은 취득 인스턴스만, 양도 전용(`gb-transfer`·`cb-transfer`)은 양도 인스턴스만. 취득1+양도1로 정리.
- anchor: gb 2스냅샷 → report 2벌·acq2000 ○ 1개·transfer ○ 1개·※표 1개(중복 0).

## 4. 케이스 매트릭스 (Phase 1 = 주택분)

| # | 취득년 | 구조 | 현행 | 목표 | 비고 |
|---|---|---|---|---|---|
| C1 | ≥2001 | 단독 | valuation 정상 | 무변경 | **회귀 금지** |
| C2 | **<2001** | **단독** | **취득 스냅샷 생략(누락)** | **transfer/acq2000 + ※표** | **이미지6/7 핵심 케이스**(G1+G2) |
| C3 | <2001 | 단독·최초공시 미입력 | 누락 | transfer/acq2000(취득만) | 최초공시 없는 케이스 |
| C4 | <2001 | **복합** | `acqBaseConversion` **이미 설정**(`:213`) → ※표 동작 | (G2만 필요) | **복합은 G1 불요** — 단독과 반대. 단일그룹만(`:200-202`) |

> C4 정정(F5): 복합은 `acqBaseConversion`이 이미 설정되어 ※표가 나온다. **G1(엔진 노출)은 단독 전용**. Phase 1 핵심 갭은 **단독(C2/C3)**.

## 5. Pre-Do Anchor (설계 환류 우선)

Do 진입 전 **먼저** 작성·실행:
1. **A1 (엔진 재현) — ✅ 실행 완료** (`__tests__/tax-engine/building-standard-price/pre2001-acq-report-img7.anchor.test.ts`):
   - `calcAcqBaseBreakdown(1997, {rc, usageNo:1, landPricePerM2:1_200_000}, 327.6, 1997)` → `acqBaseRate=0.971`·`pricePerM2=386_000`·`standardPrice=122_786_445`·`basePrice=400_000`·`structureIndex=100`·`usageIndex=100`·**`locationIndex=105`(=1.05, 취득공시지가 1,200,000 소스 확정 — R3 해소)**·`residualRate=0.92` → **전부 GREEN**(이미지7 완전 재현).
   - **`result.acqBaseConversion` 현재 `undefined`(실측) → G1(C1) 실증**. anchor의 `[P1 목표]` it(`acqBaseConversion.total2001===126_453_600`·`convertedTotal===122_786_445`)은 `.skip`(Do P1에서 활성화·GREEN 전환).
2. **A2 (스냅샷→모델)**: `phdBatchToSnapshots`(취득 1997) → `bsp-…-phd-acq` 스냅샷 존재 → `buildNtsReportModel` → 취득 인스턴스 `markCell==="acq2000"`·`acqBase.converted===122_786_445`, 양도 dummy 인스턴스는 필터로 제거 확인.

A1이 이미지7과 어긋나면 §3-1·3-5 매핑을 먼저 정정("현행 일치 예상" 금지).

## 6. 구현 단계 (Phase 1)

1. **P1 (엔진 G1)**: `calcAcqBaseBreakdown` total2001 반환 확장 + 단독 취득<2001 경로에 `acqBaseConversion` 설정. → verify: A1 GREEN(회귀: C1·복합 C4 anchor 불변).
2. **P2 (스냅샷 G2)**: `phd-batch-snapshots.ts` — 취득 housing `<2001`에 transfer 스냅샷 생성(§3-2). → verify: A2 스냅샷 존재.
3. **P3 (렌더 필터+분기)**: `BuildingStdPriceReportSection.tsx` — (a) `-phd-acq` 키 취득 인스턴스만 필터(§3-3), (b) markCellOverride 취득<2001→acq2000, (c) titleOverride 연도 acquisitionYear(§3-4). → verify: A2 모델·중복 없음.
4. **P4 (테스트)**: C1(회귀)·C2(신규 단독)·C4(복합 회귀) 컴포넌트/통합 anchor. E2E `mixed-use-result-toggle-building-std.spec.ts:B1` 확장(취득<2001 acq2000 ※표 렌더) — 선택.

## 7. 14지점 동기화 점검

**엔진 result 타입 무변경**(`acqBaseConversion?` 기존 optional 재사용) · **API·Zod·Route 무변경** — 신규 필드 없음. 스냅샷 store는 엔진/API 무관 별도 UI 스토어. 실질 변경:
- ⑦ 결과 카드: **본 작업** — `BuildingStdPriceReportSection`(P3)
- 그 외(①~⑥⑧~⑭): N/A

→ **변경 3파일**: `building-standard-price.ts`(+`-helpers.ts`, G1 echo — result 타입 무변경) · `phd-batch-snapshots.ts`(G2) · `BuildingStdPriceReportSection.tsx`(P3). 어댑터·서식·API·Zod 무변경.

## 8. 리스크·미해결

- **R1 (G1 회귀)**: 엔진 단독 경로 acqBaseConversion 추가가 C1(≥2001)·복합 C4에 영향 없어야 — `acquisitionYear<2001` 단독 분기에서만 설정. anchor로 회귀 0 확인.
- **R2 (필터 회귀·C2모순)**: `-phd-acq` 키 정규식 한정 필수. 기존 gb/cb transfer 스냅샷 양도 인스턴스 보존 확인(P3 회귀 테스트). taxType-only 판정 금지.
- **R3 (위치지수 소스·F4) — ✅ 해소**: A1 anchor로 `acqLandPrice`=취득당시 공시지가(1,200,000) → `locationIndex=105`(1.05) 실측 확정.
- **R4 (dummy transfer)**: `transferYear=2001`≠`acquisitionYear`(1997) → §164⑧ 동일연도 분기(`:342`) 미진입 확인. C3(최초공시 없음)도 동일.
- **R5 (§164 인용·F4) — ✅ 검증 완료**: KoreanLaw 소득세법 시행령 §164 현행(시행 2026-07-01, mst 286211) 본문 대조 —
  - **§164⑤**: "법 제99조제1항제1호**나목(건물)**에 따른 기준시가가 고시되기 전에 취득한 **건물의 취득당시의 기준시가는 다음 산식**에 의하여 계산" → acqBase 근거 정확(산식=산정기준율은 국세청 「건물 기준시가 계산방법」 고시로 위임, `building-standard-price.ts:4` 주석 일치).
  - **§164⑧**: "양도당시 기준시가와 취득당시 기준시가가 **동일한 경우** … 재정경제부령이 정하는 방법" → 취득1997≠양도2001이라 **미적용**(R4 dummy transferYear=2001 회피 근거 확증).
  - **§164③**(직전 기준시가)도 본문 일치.
- **R6 (상가 Phase 2)**: 상가분 취득<2001 범위 외.
- **R7 (모달 회귀 — blast-radius 확인 완료)**: `BuildingStdPriceModalButton.tsx:236,243`이 `result.acqBaseConversion?.convertedTotal`을 소비하나, 해당 버튼은 `result.acquisitionComposite &&` 게이트(`:229`) 내부(**복합 전용**). 단독은 `acquisitionComposite` 부재로 미진입 → G1(단독 `acqBaseConversion` 노출) **회귀 없음**. `calcAcqBaseBreakdown` 호출처도 단독 경로 1곳(`building-standard-price.ts:339`)뿐 — total2001 반환 확장은 하위호환.

## 9. Definition of Done — ✅ Do 완료 (2026-07-19)

- [x] A1(엔진: acqBaseConversion.total2001=126,453,600·converted=122,786,445·locationIndex=105) GREEN — `pre2001-acq-report-img7.anchor.test.ts` 2/2
- [x] A2(스냅샷→acq2000 인스턴스·양도 dummy 제거) GREEN — `building-std-report-phd-section.test.tsx`(취득<2001 케이스)·`phd-batch-snapshots.test.ts`
- [x] C1(≥2001 단독)·C4(복합) 회귀 0 · 기존 gb/cb transfer 스냅샷 보존 — 건물기준시가 회귀 **260/260**
- [x] C2 취득 계산서가 3시점 맨 상단 + ※산정기준율 표(nts-bsp-x-2) + acq2000 마킹 + "(1997년)" 연도
- [x] `npx tsc --noEmit` 0건 · 관련 vitest GREEN · 800줄 정책 준수(424·143·110)
- [x] §164③⑤⑧ KoreanLaw 현행 본문(mst 286211) 검증 완료
- [x] E2E — `mixed-use-result-toggle-building-std.spec.ts:B3` GREEN(실브라우저: 취득시 "(1997년)"·※산정기준율 표·acq2000 마킹·양도 dummy 제거).

**구현 요약**: G1(엔진 `building-standard-price.ts` 단독 경로 acqBaseConversion echo — result 타입 무변경) · G2(`phd-batch-snapshots.ts` `buildTransferAcqSnapshot` + 취득<2001 주택분 단독 분기) · P3(`BuildingStdPriceReportSection.tsx` `-phd-acq` 필터·acq2000 마킹·acquisitionYear 연도). 상가·복합 취득<2001 = Phase 2 이월.
