# 비사업용 토지(NBL) 정밀판정 입력 4단 체인 복원 — 엔진/데이터 설계

> 계획서: [`docs/00-pm/nbl-detailed-input-restoration.plan.md`](../../00-pm/nbl-detailed-input-restoration.plan.md) · 브랜치 `feat/nbl-input-wiring`
> ⚠️ 본 작업은 **판정 엔진(`judgeNonBusinessLand`) 산식 무변경**. 설계 대상은 **폼 → API → 엔진 input 변환 파이프라인**(데이터 플로). "엔진 input 타입"은 기존 `NonBusinessLandInput`이며, 신규는 wire/Zod/헬퍼 계층.

## Context

NBL 정밀판정 엔진·UI·매퍼(`mapAssetToNblInput`)는 완성돼 있으나, 클라이언트 API 빌더가 8필드만 전송하고 Zod가 나머지를 strip하여 상세 입력이 엔진에 미도달(침묵 strip). 죽은 매퍼를 **서버측 단일 변환 소스**로 승격(아키텍처 B). 엔진 산식·result·UI 위젯은 불변.

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 진입 금지)

| ID | nblUseDetailedJudgment | nblLandType | 매퍼 산출 sub-object | 빌더 raw 전송 | route → 엔진 input | 검증 anchor |
|---|---|---|---|---|---|---|
| C0 | false | — | (호출 안 함) | undefined | `nonBusinessLandDetails=undefined`, `isNonBusinessLand` 플래그 직접 | 간편모드 회귀 |
| C1 | true | `farmland` | farmingSelf·farmlandDeeming·ownerProfile·businessUsePeriods·gracePeriods·unconditionalExemption·urbanIncorporation | raw 전체 | mapAssetToNblInput | **C1 (farmland+grace)** |
| C2 | true | `forest` | forestDetail·ownerProfile·businessUsePeriods·gracePeriods | raw 전체 | mapAssetToNblInput | **C2 (forest)** |
| C3 | true | `pasture` | pasture(축산)·businessUsePeriods·gracePeriods | raw 전체 | mapAssetToNblInput | C3 |
| C4 | true | `housing_site` | housingFootprint·isMetropolitanArea·businessUsePeriods | raw 전체 | mapAssetToNblInput | C4 |
| C5 | true | `villa_land` | villa·businessUsePeriods | raw 전체 | mapAssetToNblInput | C5(REDIRECT) |
| C6 | true | `other_land` | otherLand·businessUsePeriods·gracePeriods | raw 전체 | mapAssetToNblInput | **C6 (other_land)** |
| E1 | true | `""` | (빌더 가드 탈락) | **미전송** | undefined → `isNonBusinessLand`(토글 ON=true) | **⑧ validation 차단** |
| E2 | true | 임의 | + `ownerProfile.ownershipRatio` (지분<1) | raw + nblOwnershipRatio | mapAssetToNblInput(매퍼 결선) | **E2 (공동소유 안분)** |
| E3 | true | `villa_land` | villa 비사용기간 충족 | raw | 엔진 REDIRECT → housing/other 재판정 | E3(엔진 기존동작) |

데이터행/엣지행 1:1: C0~C6 = 정상 6지목+간편, E1~E3 = 엣지(미선택 차단·지분·REDIRECT).

## 법령 근거

| sub-object | 조문 | 비고 |
|---|---|---|
| farmland(재촌·자경·편입유예) | 소득세법 시행령 §168의8 + §168의7(지목) | farmlandDeeming = §168의8 각 항 사용의제 |
| forest(재촌·공익·시업중) | §168의9 | forestDetail |
| pasture(축산 기준면적) | §168의10 | LIVESTOCK_STANDARD_AREA(별표 1의3 — 출처정정은 후속) |
| housing_site(배율 3/5/10) | §168의12 | housingFootprint·isMetropolitanArea |
| villa | §168의13 | REDIRECT 경로 |
| other_land(나대지 2%·재산세유형) | §168의11 | propertyTaxType |
| unconditionalExemption(무조건 의제) | §168의14③ | 7사유 |
| gracePeriods(유예기간) | §168의14① | **본 PR=엔진 input까지 운반만**; judge 결선은 우선순위 2 |
| 기간기준 3-test | §168의6 | 엔진 기존 구현(불변) |
| ownershipRatio(공동소유) | 대법원 2015두39439 | applyCoOwnershipRatio |

## 엔진 input 타입 (불변 — 재확인)

- `NonBusinessLandInput` (`lib/tax-engine/non-business-land/types.ts:260-318`) — **변경 없음**. route가 이 타입으로 채워 `TransferTaxInput.nonBusinessLandDetails`(`lib/tax-engine/types/transfer.types.ts:207`)에 주입.
- 엔진 진입: `judgeNonBusinessLand(input, rules)` (`transfer-tax.ts:208-211`). Date 객체 필수.

### 신규 계층 타입 (wire/Zod/헬퍼)

```
// ① wire raw 타입 (store nbl* 평면 — Zod input으로 도출)
type NonBusinessLandRaw = z.input<typeof nonBusinessLandRawSchema>;
// ⚠️ z.input(=.default() 적용 전·optional) — 빌더가 채우는 입력 형상. z.infer(=z.output, default 후 required) 아님.
// store NBL_DEFAULTS(calc-wizard-asset-nbl.ts:52-105) 1:1 + acquisitionArea·acquisitionDate·transferDate

// ② 클라이언트 빌더 (lib/calc/transfer-tax-api.ts, 신규 export)
function buildNonBusinessLandRaw(
  asset: AssetForm, transferDate: string,
): NonBusinessLandRaw | undefined;
//   guard: nblUseDetailedJudgment && nblLandType && nblZoneType && acquisitionArea && acquisitionDate

// ③ 서버 변환 헬퍼 (lib/calc/non-business-land-request.ts, 신규)
//    ⚠️ param = Zod 검증 후 출력(z.infer=z.output, default 적용됨) — 빌더의 z.input과 구분
function buildNblEngineInput(
  raw: z.infer<typeof nonBusinessLandRawSchema> | undefined,
): NonBusinessLandInput | undefined;
//   = raw ? (mapAssetToNblInput(raw, {
//       acquisitionDate: toDate(raw.acquisitionDate, "nblRaw.acquisitionDate"),
//       transferDate:    toDate(raw.transferDate, "nblRaw.transferDate"),
//       parseDate:       toOptionalDate,
//       parseNumber:     (s) => { const n = parseFloat(String(s).replace(/,/g,"")); return Number.isFinite(n)?n:undefined; },
//     }) ?? undefined) : undefined
```

> **parseNumber 주의**: 서버 헬퍼(`lib/calc/non-business-land-request.ts`)는 bespoke 인라인 사용. 프로젝트 `parseAmount`(`components/calc/inputs/CurrencyInput.tsx:22`)·`parseDecimal`(`DecimalInput.tsx:88`)은 **React 컴포넌트 파일**이라 서버 import 부적절. 클라이언트 빌더(`transfer-tax-api.ts`)에서는 재사용 가능.

## 엔진 result 타입 (불변)

- `NonBusinessLandJudgment` (`types.ts:347-398`) — 변경 없음. `TransferTaxResult.nonBusinessLandJudgmentDetail`로 노출(결과카드 ⑦). 입력 도달 후 처음으로 실데이터가 채워짐 → ⑦ 회귀 anchor 1건.

## 계산 알고리즘 (5단계 데이터 플로)

```
[①폼 store] asset.nbl* (문자열·배열·bool)              ← 무변경 (NBL_DEFAULTS)
   ↓ ④ buildNonBusinessLandRaw(asset, transferDate)     ← 신규: guard 통과 시 nbl* + 면적/일자 raw
[⑬ body] { nonBusinessLandRaw: raw }                    ← 키 리네임(wire)
   ↓ JSON.stringify (Date 없음 → 직렬화 무손실)
[⑫⑩ Zod] nonBusinessLandRawSchema (flat, 날짜=string)   ← 신규: strip 차단. ⑫(스키마 정의)+⑩(propertyBaseShape:135 attach, 단건·다건 공유)는 동일 검증 레이어
   ↓
[⑭ route] buildNblEngineInput(data.nonBusinessLandRaw)   ← 신규 공용 헬퍼
   ↓ mapAssetToNblInput (flat→nested + toOptionalDate 일괄)   ← 기존 매퍼(단일소스) + ownershipRatio 결선
[엔진 input] TransferTaxInput.nonBusinessLandDetails (Date 객체)
   ↓ judgeNonBusinessLand(input, rules)                  ← 무변경
[result] nonBusinessLandJudgmentDetail
```

핵심: 변환 지식(flat→nested, 문자열→Date)이 **`mapAssetToNblInput` 1곳**에 집중. Zod는 flat 검증(strip 차단)만, route는 매퍼 위임만.

### 매퍼 결선 변경 (유일한 매퍼 수정 — `form-mapper.ts`)

```
// 현재(:115): residenceHistories.length>0 일 때만 ownerProfile 생성 → ownershipRatio 소실
// 변경: ratio = parseOwnershipRatio(asset, parseNumber)
//       ownerProfile = (residenceHistories.length>0 || ratio !== 1)
//         ? { residenceHistories, ...(ratio !== 1 ? { ownershipRatio: ratio } : {}) } : undefined
```

## Silent fallback / 자동 안분 후보 식별

- **금지 준수**: 빈값 자동채움 없음. E1(정밀판정 ON + 지목 미선택)은 매퍼 `null`/빌더 미전송으로 침묵 통과하지 않도록 **⑧ validation이 차단**([[feedback_no_silent_apportion_fallback]]).
- **⑧ ↔ UI fallback 동기화**: UI는 정밀판정 토글 ON 시 지목·용도지역·면적 위젯 노출 → validate도 동일 필드 필수. UI 통과↔validate 차단 모순 없음([[feedback_validation_sync_8th_point]]).
- **부분 입력**: 매퍼의 각 build*는 "해당 플래그 전무 시 undefined" 반환(자동 추정 아님). 엔진은 undefined sub-object를 기본값 경로로 처리(기존 동작).

## 테스트 약속

- **Anchor-0**(현재 FAIL): `buildNonBusinessLandRaw` body 캡처 — forest 상세 운반(`transfer-tax-nbl-wiring.test.ts`).
- **Anchor-1**(현재 FAIL→PASS): `buildNblEngineInput` raw→엔진input — `forestDetail.hasForestPlan===true`, `gracePeriods[0].startDate instanceof Date`(`nbl-raw-to-engine-input.test.ts`).
- **C1·C2·C6**: client빌더→buildNblEngineInput→judgeNonBusinessLand 합성 통합.
- **E2**: ownershipRatio<1 → ownerProfile.ownershipRatio 도달 + 안분 반영(매퍼 단위).
- **C0 회귀**: 간편모드 raw=undefined → 엔진 미호출.
- **불변 회귀**: `engine.test.ts:57,88`·`qa-integration.test.ts:211,240`·`qa-land-type-flow.test.ts:59` 그대로 통과.
- **이관**: `integration.test.ts:233-236` gracePeriodDays 확정화는 우선순위 2(judge 결선) — TODO 주석.

## UI 통합 위임

UI 위젯은 무변경(Agent C: 100% 수집). ⑤⑥⑦ 및 ⑧ validation UI 메시징은 [`nbl-detailed-input-restoration.ui.design.md`](./nbl-detailed-input-restoration.ui.design.md)에 위임.
