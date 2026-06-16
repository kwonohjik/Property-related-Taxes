# 비사업용 토지(NBL) 정밀판정 입력 4단 체인 복원 — 구현 계획서

> 브랜치 `feat/nbl-input-wiring` · 우선순위 1 (NBL 갭 감사 High 클러스터)
> 작성 기준: 2026-06-16. 모든 file:line·동작은 실제 코드 Read + 3개 조사 에이전트 실측으로 검증(추정 없음).
> 관련 메모리: [[project_transfer_nbl_gaps]] · [[feedback_api_zod_schema_sync]] · [[feedback_pre_anchor_verification]] · [[single-source-engine-helper]]

---

## 0. 한 줄 요약

NBL 정밀판정(상세) 엔진·UI·매퍼는 모두 완성돼 있으나, **클라이언트 API 빌더가 8필드만 전송하고 Zod가 나머지를 strip**하여 임야·목장·별장·기타토지·무조건의제·유예기간·재촌이력 등 상세 입력이 엔진에 도달하지 못한다. 본 작업은 죽은 코드인 `mapAssetToNblInput`(이미 완전·테스트됨)을 **서버측 단일 변환 소스**로 승격하여 4단 체인(빌더 → Zod → route → 엔진)을 복원한다.

---

## 1. 범위

### 1.1 In-scope (우선순위 1)

NBL 갭 감사의 High 3건 중 입력 도달 클러스터:

1. **④ API 변환**: 인라인 8필드 빌더 → raw nbl 페이로드 전송 (단건 + 다건)
2. **⑫ Zod**: `nonBusinessLandRawSchema` 신설 (flat, store 1:1) → 침묵 strip 차단
3. **⑭ route**: `mapAssetToNblInput` 호출로 nested+Date 일괄 변환 (단건 + 다건)
4. **⑧ validation**: 정밀판정 토글 ON 시 필수필드(`nblLandType`·`nblZoneType`·면적) 차단 — UI 통과↔판정 누락 침묵 모순 해소
5. **매퍼 완전성(소규모)**: `nblOwnershipRatio`를 매퍼 `ownerProfile`에 결선 (공동소유 지분 = 엔진 소비, 현재 누락 → 지분 < 1 케이스 numeric 영향)

### 1.2 Out-of-scope (후속 — 본 PR 비포함, [[project_transfer_nbl_gaps]] 참조)

- **우선순위 2 — §168의14① 유예기간 judge 결선**: 5개 judge의 11개 `meetsPeriodCriteria` 호출에 6번째 인자 추가. **단, 본 작업이 선행 조건**(gracePeriods가 엔진 input에 도달해야 numeric 발현). 본 PR은 gracePeriods를 엔진 input까지 **운반**만 하고, judge 결선은 우선순위 2에서.
- §168의11② 수입금액비율(`revenueTest`) 엔진 통합 (Medium)
- 매퍼 내부 잔존 dead 필드: `nblFarmlandConversionDate`(엔진 미소비 — buildFarmlandDeeming은 boolean만), `buildOtherLand`의 `buildingFloorArea`/`hasBuilding:false` 하드코딩, `isFarmDevZone`·`isInong`·`pasture.standardArea` 미매핑, 재촌 30km(`landLocation`/`adjacentSigunguCodes`), `unavoidableReasons` 채널 (전부 Low, [[project_transfer_nbl_gaps]])
- `nblLandSigunguCode`/`nblLandSigunguName`: store-only, UI 위젯·매퍼 소비 모두 없음 (영향 0)

---

## 2. 현재 상태 (검증 완료)

### 2.1 4단 체인 단절 지점

| 단계 | 위치 | 현재 동작 | 문제 |
|---|---|---|---|
| ① UI store | `lib/stores/calc-wizard-asset-nbl.ts:52-105` (`NBL_DEFAULTS`, ~50 필드) | ✅ 전 필드 수집 | 정상 |
| ⑤ UI 위젯 | `components/calc/transfer/nbl/` 6 지목 섹션 + 공통 3 섹션 | ✅ 매퍼가 읽는 필드 **100% 수집** (Agent C) | 정상 |
| **매퍼** | `lib/tax-engine/non-business-land/form-mapper.ts:53-120` (`mapAssetToNblInput`) | ✅ flat → nested 완전 변환, **테스트만 호출**(`integration.test.ts:7,30`) | **프로덕션 미연결 (죽은 코드)** |
| **④ 빌더(단건)** | `lib/calc/transfer-tax-api.ts:48-67` | ❌ 인라인 **8필드만** 조립 | **상세 sub-object 전부 누락** |
| **④ 빌더(다건)** | `lib/calc/multi-transfer-tax-api.ts:23-42` | ❌ 동일 8필드 | 동일 |
| 직렬화 | `transfer-tax-api.ts:746` `JSON.stringify(body)` / body 키 `:492` `nonBusinessLandDetails` | Date → ISO 문자열 | — |
| **⑫ Zod** | `lib/api/transfer-tax-schema-sub.ts:83-95` (`nonBusinessLandDetailsSchema`, 11필드) | ❌ 11필드만 정의 | **2차 침묵 strip** (빌더 고쳐도 Zod가 제거) |
| **⑭ route(단건)** | `app/api/calc/transfer/route.ts:210-228` | 필드별 `new Date()` 수동 (⚠️ `toDate` 컨벤션 위반) | 8필드만 통과 |
| **⑭ route(다건)** | `app/api/calc/transfer/multi/route.ts:143-152` | 필드별 `toDate()` 수동 | 동일 |
| 엔진 | `lib/tax-engine/transfer-tax.ts:208-211` `judgeNonBusinessLand(workingInput.nonBusinessLandDetails, ...)` | **Date 객체 필수** (string이면 침묵 실패) | 8필드만 도달 |
| **⑧ validation** | `lib/calc/transfer-tax-validate-asset.ts` land 분기(`:435`,`:456-476`,`:549-552`) | ❌ NBL 정밀판정 차단 검증 **0건** | UI 통과↔판정 누락 침묵 모순 |

### 2.2 핵심 자산: `mapAssetToNblInput` (이미 완전)

`form-mapper.ts:53-120` + `form-mapper-helpers.ts`가 store의 nbl* flat 필드를 다음으로 완전 변환(검증):
`farmingSelf`·`farmerResidenceDistance`·`farmlandDeeming`·`forestDetail`·`pasture`·`villa`·`otherLand`·`unconditionalExemption`·`urbanIncorporationDate`·`isMetropolitanArea`·`ownerProfile.residenceHistories`·`businessUsePeriods`·`gracePeriods`·`housingFootprint`.

- 시그니처: `mapAssetToNblInput(asset: Record<string,unknown>, ctx: { acquisitionDate: Date; transferDate: Date; parseDate: (s)=>Date|undefined; parseNumber: (s)=>number|undefined }): NonBusinessLandInput | null`
- **순수 함수** — 엔진/store import 없음, 서버 호출 가능 (Agent A 확인)
- `null` 반환 조건: `!asset.nblUseDetailedJudgment || !asset.nblLandType`
- landArea ← `asset.acquisitionArea` (top-level 날짜는 ctx에서, asset에서 안 읽음)
- **누락 1건(In-scope)**: `ownerProfile`에 `ownershipRatio` 미포함. `parseOwnershipRatio`(`:128-135`)는 별도 export이나 `mapAssetToNblInput` 미호출. 엔진은 `applyCoOwnershipRatio`로 소비 → 결선 필요.

### 2.3 date-coerce 인프라 (검증)

`lib/api/date-coerce.ts`: `toDate(v, field): Date`(invalid throw) · `toOptionalDate(v): Date|undefined`(빈값→undefined) · `coerceDates(obj, paths)`.
→ 매퍼의 `parseDate: (s)=>Date|undefined`가 **`toOptionalDate`와 시그니처 정확 일치**. 필수 ctx 2개 날짜는 `toDate`.

---

## 3. 아키텍처 결정 — B안: 서버측 매퍼 단일소스

### 3.1 결정

> 클라이언트는 **raw flat nbl\* 필드**를 `nonBusinessLandRaw` 키로 전송(Date 객체 없음 → 직렬화 무해) → Zod는 flat shape 검증(store와 1:1) → **route가 `mapAssetToNblInput(raw, ctx)` 1회 호출**로 nested+Date 변환 일괄 수행 → 엔진 input `nonBusinessLandDetails`.

### 3.2 채택 이유

- **단일 소스**: `mapAssetToNblInput`이 flat→nested+Date 변환의 **유일한** 지점. 테스트(`integration.test.ts`)가 이미 쓰는 함수가 곧 프로덕션 경로 → dual-truth 제거([[single-source-engine-helper]]).
- **이중 파싱 제거**: 클라이언트에서 Date 파싱 후 재직렬화하는 낭비 없음 (raw는 끝까지 문자열).
- **route 박막화**: 중첩 Date ~20경로 수동 coerce 불필요. 향후 sub-object 추가 시 route·Zod-coercion 무수정 (매퍼·flat Zod·UI만).
- **drift 차단**: A안(구조화 계약 유지)은 날짜 경로 지식이 Zod 중첩 스키마 + route coercion 2곳에 중복 → 신규 필드마다 4곳(빌더·Zod·route·매퍼) 갱신. B안은 매퍼가 산 채로 단일화.

### 3.3 기각한 대안

- **A안 (구조화 계약 확장)**: 기존 `nonBusinessLandDetails` 구조에 중첩 sub-schema(forestDetail·pasture·…) 추가 + route에서 `coerceDates`로 ~20 날짜 경로 일괄 변환. 기존 14지점 패턴과 일치(저위험)하나, `mapAssetToNblInput`이 죽은 채 남고 변환 로직이 빌더/Zod/route에 3중 중복 → 프로젝트의 anti-drift·single-source 가치와 충돌. **기각.**
- **D안 (인라인 빌더 확장)**: 빌더·Zod·route에 필드를 일일이 3중 추가. 최다 코드·최고 drift. **기각.**

### 3.4 B안의 비용(수용)

- 신규 flat Zod `nonBusinessLandRawSchema` (~45필드, store 1:1 미러 — 정합 검증 용이, leaf는 기존 `businessUsePeriodSchema`·`gracePeriodSchema` 재사용).
- wire 키 `nonBusinessLandDetails` → `nonBusinessLandRaw` 리네임 (raw vs 엔진shape 명시).
  - **⚠️ Critical — wire 층만 리네임, 엔진 층 보존**: `nonBusinessLandDetails`는 wire/Zod 키이자 엔진 input 필드로 **이름 공유**(grep 10파일 33참조).
    - **리네임(wire) 5곳**: `transfer-tax-api.ts:492`(body) · `multi-transfer-tax-api.ts:157`(body) · `transfer-tax-schema.ts:13`(import)·`:135`(`propertyBaseShape` 필드) · route 핸들러 `data.nonBusinessLandDetails` 읽기(단건·다건).
    - **보존(엔진) 4곳**: `TransferTaxInput.nonBusinessLandDetails`(`transfer.types.ts`) · `transfer-tax.ts` · `transfer-tax-rate-calc.ts` · `multi-house-and-nbl.test.ts`(엔진 직접).
  - route가 `nonBusinessLandDetails: buildNblEngineInput(data.nonBusinessLandRaw)`로 매핑 → 엔진 필드명 불변. grep 시 wire↔엔진 혼동 금지.

---

## 4. 변경 대상 & 14 동기화 지점 매핑

| 지점 | 파일 | 변경 |
|---|---|---|
| ① 폼 | `calc-wizard-asset.ts`(nbl 분리: `calc-wizard-asset-nbl.ts`) | **무변경** (필드 존재) |
| ② initial | `NBL_DEFAULTS` | **무변경** |
| ③ normalize | `lib/stores/calc-wizard-migration.ts` (zustand 마이그) | **확인만(Read)** — nbl* passthrough 여부. stock-normalize는 주식 전용 |
| **④ API 변환** | `lib/calc/transfer-tax-api.ts` + `lib/calc/multi-transfer-tax-api.ts` | **변경** — 인라인 빌더 → `buildNonBusinessLandRaw(asset, transferDate)` 순수 함수로 raw 페이로드 |
| ⑤ UI 위젯 | `components/calc/transfer/nbl/*` | **무변경** (Agent C: 100% 수집) |
| ⑥ 사이드바 | `lib/stores/transfer-summary` 등 | **확인만** — NBL은 금액 아닌 판정 → 합계 무기여 예상, grep 확인 |
| ⑦ 결과 카드 | `components/calc/NonBusinessLandResultCard.tsx` | **무변경** (이미 `nonBusinessLandJudgmentDetail` 렌더 — 입력 도달 후 실데이터 표시 확인) |
| **⑧ validation** | `lib/calc/transfer-tax-validate-asset.ts` | **변경** — 정밀판정 필수필드 차단 |
| **⑨ Zod enum** | `transfer-tax-schema-sub.ts` | **변경** — landType(UI 6값)·grace type·propertyTaxType·metropolitan enum |
| **⑩ Zod attach/refine** | `transfer-tax-schema.ts:135`(`propertyBaseShape`) + `addPropertyRefines` | **변경** — `propertyBaseShape`는 단건 `propertySchema`(:434)·다건 `propertyItemSchema`(:661)가 spread 공유 → **1곳 수정=양쪽 반영**(discriminatedUnion 아님). Zod 역할=strip 차단(차단검증은 client ⑧); 서버방어는 `addPropertyRefines`에 선택 추가 |
| ⑪ 자산-수준 acq fallback | route | **확인** — NBL ctx의 acquisitionDate 출처(raw 페이로드 acquisitionDate) |
| **⑫ Zod 입력객체** | `transfer-tax-schema-sub.ts:83`(정의) + `transfer-tax-schema.ts:13`(import) | **변경** — `nonBusinessLandRawSchema` 신설, `nonBusinessLandDetailsSchema` 제거(정의·import·사용 :135 = 3곳) |
| **⑬ body spread** | `transfer-tax-api.ts:492` + `multi-transfer-tax-api.ts:157` | **변경** — `nonBusinessLandRaw` 키 |
| **⑭ route 엔진매핑** | `route.ts:210-228` + `multi/route.ts:143-152` → 공용 `lib/calc/non-business-land-request.ts`(`buildNblEngineInput`) | **변경** — `mapAssetToNblInput(raw, {toDate/toOptionalDate})`. **부수효과: route.ts:210-228 `new Date()` 컨벤션 위반 해소** |
| 매퍼 | `form-mapper.ts` | **변경(소)** — `ownershipRatio` 결선 |

---

## 5. 케이스 매트릭스 (전수 enumerate)

| # | nblUseDetailedJudgment | nblLandType | 필요 sub-object | 빌더 전송 | route 매핑 | 비고 |
|---|---|---|---|---|---|---|
| C0 | false (간편) | — | — | raw=undefined | nonBusinessLandDetails=undefined | `isNonBusinessLand` 플래그 직접 사용 (현행 유지) |
| C1 | true | `farmland` | farmingSelf·farmlandDeeming·ownerProfile(재촌)·businessUsePeriods·gracePeriods·unconditionalExemption·urbanIncorporation | raw 전체 | 매퍼 | 재촌·자경·편입유예 |
| C2 | true | `forest` | forestDetail·ownerProfile·businessUsePeriods·gracePeriods | raw 전체 | 매퍼 | 재촌(주민등록)·공익/시업중 |
| C3 | true | `pasture` | pasture(축산)·businessUsePeriods·gracePeriods | raw 전체 | 매퍼 | 축산기준면적 안분 |
| C4 | true | `housing_site` | housingFootprint·isMetropolitanArea·businessUsePeriods | raw 전체 | 매퍼 | 배율 3/5/10배 |
| C5 | true | `villa_land` | villa·businessUsePeriods | raw 전체 | 매퍼 | REDIRECT 경로 존재 |
| C6 | true | `other_land` | otherLand·businessUsePeriods·gracePeriods | raw 전체 | 매퍼 | 나대지 2%·재산세유형 |
| E1 | true | `""` (미선택) | — | **raw 미전송**(빌더 가드 탈락) | undefined → raw `isNonBusinessLand`(토글 ON=true) 적용 | **⑧ validation이 토글 ON+미선택 차단** |
| E2 | true | 임의 | ownershipRatio < 1 | raw + ownershipRatio | 매퍼(ownerProfile.ownershipRatio) | 공동소유 안분 (매퍼 결선 필요) |
| E3 | true | `villa_land` | villa 비사용기간 충족 | raw | 매퍼 → 엔진 REDIRECT → housing/other 재판정 | 엔진 기존 동작, 입력 도달만 |

검증 anchor는 C1(farmland+gracePeriods), C2(forest), C6(other_land)를 최소 커버.

---

## 6. Pre-Do Anchor (Do 진입 전 — 실패 확보 우선)

[[feedback_pre_anchor_verification]]: "현행 일치 예상" 금지. 아래를 **먼저 작성·실행하여 실패를 확보**한 뒤 Do.

### Anchor-0 (필수, 현재 FAIL): 클라이언트 빌더가 상세입력을 운반하는가

- 파일(신규): `__tests__/lib/calc/transfer-tax-nbl-wiring.test.ts`
- 패턴: `transfer-sales-case-wiring.test.ts:9-28`의 mock-fetch body 캡처 재사용
- 입력: forest 자산 + `nblUseDetailedJudgment:true`·`nblLandType:"forest"`·`nblZoneType:"agriculture_forest"`·`nblForestHasPlan:true`·`nblGracePeriods:[1건]`
- 단언: 캡처된 body가 `nonBusinessLandRaw.nblForestHasPlan === true` 및 `nblGracePeriods.length === 1`
- **현재 결과**: body에 `nonBusinessLandRaw` 키 없음(빌더는 `nonBusinessLandDetails` 8필드만) → **FAIL** ✅ (단절 입증)

### Anchor-1 (필수, 현재 FAIL): route 매핑이 상세입력을 엔진 input으로 변환하는가

- 파일(신규): `__tests__/lib/calc/nbl-raw-to-engine-input.test.ts`
- 대상: route NBL 매핑을 순수 헬퍼 `buildNblEngineInput(rawNbl): NonBusinessLandInput | undefined`로 **신규 공용 모듈 `lib/calc/non-business-land-request.ts`**에 추출(단건 `route.ts`·다건 `multi/route.ts` 공용 import) 후 테스트
- 입력: forest raw 페이로드(문자열 날짜 포함)
- 단언: 반환 `nonBusinessLandDetails.forestDetail.hasForestPlan === true`, `gracePeriods[0].startDate instanceof Date`
- **현재 결과**: 헬퍼 부재 → 작성 시점 FAIL (TDD), 구현 후 PASS

### 기존 anchor 갱신 (Do 후)

- `__tests__/tax-engine/non-business-land/integration.test.ts:233-236`: `if (result!.gracePeriodDays > 0)` 조건부 → 우선순위 2 결선 후 `expect(...).toBeGreaterThan(0)` 확정. **본 PR에서는 입력 운반까지이므로 이 anchor는 우선순위 2로 이관**(주석으로 TODO 명시).
- `engine.test.ts:57,88`·`qa-integration.test.ts:211,240`·`qa-land-type-flow.test.ts:59` (`longTermDeductionExcluded`, `areaProportioning`): 전부 **엔진 직접 호출** anchor → **불변**(본 작업은 입력 경로만 변경, 엔진 산식 무수정).

---

## 7. 구현 순서 (Do — 시퀀셜, 단일 응답 완주)

> [[single-response-do-execution]] 계약: TODO 체크박스 생명주기 + 작업별 갱신 + 중간종료 금지.

1. **Anchor-0·1 작성 → 실행 → FAIL 확보** (Pre-Do). 디자인 환류 여지 확인.
2. **매퍼 결선(소)**: `form-mapper.ts` `mapAssetToNblInput`에 `parseOwnershipRatio(asset, parseNumber)` 호출 → `ownerProfile`에 `ownershipRatio` 포함(ratio≠1일 때도 ownerProfile 생성하도록 조건 수정). 매퍼 단위 anchor 1건 추가.
3. **⑫⑨ Zod**: `transfer-tax-schema-sub.ts`에 `residenceHistorySchema`·`pasturePeriodSchema`(필요시) leaf + `nonBusinessLandRawSchema`(flat ~45필드, store 1:1) 정의. `nonBusinessLandDetailsSchema` 제거(정의 `:83`·import `transfer-tax-schema.ts:13`·사용 `:135` = 3곳). landType enum = **UI 6값**(`farmland·forest·pasture·housing_site·villa_land·other_land`) — 빌더가 truthy시만 raw 전송하므로 `""` 미포함.
4. **⑩ schema attach**: `transfer-tax-schema.ts:135` `propertyBaseShape`의 `nonBusinessLandDetails` → `nonBusinessLandRaw: nonBusinessLandRawSchema.optional()` 교체. **`propertyBaseShape`(:85)는 단건 `propertySchema`(:434)·다건 `propertyItemSchema`(:661)가 spread 공유 → 1곳 수정으로 양쪽 반영**(discriminatedUnion 아님, 단일 object spread).
5. **⑭ route 매핑 헬퍼**: `lib/calc/non-business-land-request.ts`에 `buildNblEngineInput(rawNbl)` 추출 — `mapAssetToNblInput(rawNbl, { acquisitionDate: toDate(rawNbl.acquisitionDate,...), transferDate: toDate(rawNbl.transferDate,...), parseDate: toOptionalDate, parseNumber: <콤마제거 parseFloat> }) ?? undefined`. 단건 `route.ts:210-228`·다건 `multi/route.ts:143-152`가 이 헬퍼로 교체(공용). Anchor-1 PASS 확인.
6. **④⑬ 클라이언트 빌더**: `buildNonBusinessLandRaw(asset, transferDate)` 순수 함수 — `nblUseDetailedJudgment && nblLandType && nblZoneType && acquisitionArea && acquisitionDate`일 때 nbl* + acquisitionArea + acquisitionDate + transferDate raw 객체 반환, 아니면 undefined. **가드에 `acquisitionDate` 포함** — 다건 빌더 `multi-transfer-tax-api.ts:23` 기존 `acquisitionDate ?? ""` 제거(route `toDate("")` throw 차단). `transfer-tax-api.ts:48-67`·`:492` + `multi-transfer-tax-api.ts:23-42`·`:157` 교체. Anchor-0 PASS 확인.
7. **⑧ validation**: `transfer-tax-validate-asset.ts` land 분기에 `if (asset.nblUseDetailedJudgment) { 미입력 nblLandType·nblZoneType·acquisitionArea → 차단 메시지 }` 추가. E1 케이스 차단. validation anchor 추가.
8. **③⑥⑦ 확인**: normalize(`calc-wizard-migration.ts`) nbl* passthrough Read 확인, 사이드바 무기여 grep, ⑦ **결과카드 회귀 anchor 1건**(`nonBusinessLandJudgmentDetail` present 시 렌더 — 입력 도달 후 첫 실데이터).
9. **케이스 anchor**: C1·C2·C6를 client→buildNblEngineInput→judgeNonBusinessLand로 잇는 통합 anchor 3건. (full route POST 대신 두 추출 헬퍼 합성으로 경계 커버.)
10. **게이트**: `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/non-business-land/ __tests__/lib/calc/` → `npm test` 전체 → `npm run lint`.
11. **E2E**: `e2e/`에 forest 정밀판정 1 spec (`E2E_PORT=3104`). 폼→계산→결과 도달 + Network body `nonBusinessLandRaw` 확인.

---

## 8. 리스크 & 엣지

- **키 리네임 — wire↔엔진 혼동 금지(Critical)**: `nonBusinessLandDetails`는 wire 키이자 엔진 input 필드. **wire 층 5곳만 리네임, 엔진 층 4곳 보존**(§3.4). grep(10파일 33참조)을 wire/엔진 분류 후 wire만 수정. 이력 저장은 **form 상태(nbl* 필드) 저장**이라 wire 키 무관(API body 비영속).
- **schema 구조(실측 완료)**: `propertyBaseShape`(:85) 단일 object를 propertySchema·propertyItemSchema가 spread — discriminatedUnion 아님, attach 1곳(:135).
- **toDate throw**: 필수 ctx 날짜(acquisitionDate/transferDate)가 빈 문자열로 도달하면 throw → 빌더가 `acquisitionArea` 가드와 함께 acquisitionDate 존재도 보장, ⑧ validation이 1차 차단.
- **ownerProfile 조건**: ratio<1인데 residenceHistories 비어있으면 현재 ownerProfile 미생성 → ownershipRatio 소실. Step 2에서 `residenceHistories.length>0 || ratio!==1` 조건으로 수정.
- **C0(간편모드) 회귀**: 토글 OFF 시 raw=undefined → 엔진 미호출 → `isNonBusinessLand` 플래그 직접 적용 경로 불변 확인 anchor.
- **다건 경로 동등성**: 단건·다건이 동일 `buildNonBusinessLandRaw`·`buildNblEngineInput` 공용하도록 하여 drift 차단.
- **타입·파서(설계 §신규 계층 타입 참조)**: 빌더 반환 `z.input<nonBusinessLandRawSchema>`(default 전·optional) / route 수신 `z.infer`(=z.output, default 후) **구분**. 서버 헬퍼 parseNumber는 **bespoke 인라인** — `parseAmount`(CurrencyInput.tsx)·`parseDecimal`(DecimalInput.tsx)은 React 컴포넌트 파일이라 서버 import 금지(클라 빌더는 재사용 가능).

---

## 9. 완료 기준 (DoD)

- [ ] Anchor-0·1 선작성 → FAIL 확보 → 구현 후 PASS
- [ ] 케이스 C0·C1·C2·C6·E1·E2 anchor 통과
- [ ] 14지점 중 변경 지점(④⑧⑨⑩⑫⑬⑭+매퍼) 전부 동기화, 확인 지점(③⑥⑦⑪) grep 완료
- [ ] **wire 층** `nonBusinessLandDetails` 잔존 0건(grep) + **엔진 층 4곳 보존** 확인(transfer.types·transfer-tax·rate-calc·engine테스트)
- [ ] `npx tsc --noEmit` 0건 / `npm test` 전체 통과 / `npm run lint` 0건
- [ ] E2E forest 정밀판정 spec 통과(`E2E_PORT=3104`), Network body `nonBusinessLandRaw` 확인
- [ ] 기존 엔진 anchor(longTermDeductionExcluded·areaProportioning) 불변 확인 (회귀 0)
- [ ] 우선순위 2 선행조건 충족(gracePeriods가 엔진 input까지 도달) — `integration.test.ts:233` 갱신은 우선순위 2로 TODO 이관 명시

---

## 부록 A. 검증 근거 (file:line)

- 빌더 8필드: `lib/calc/transfer-tax-api.ts:48-67` / body 키 `:492` / 직렬화 `:746` / 다건 `lib/calc/multi-transfer-tax-api.ts:23-42`
- Zod 11필드: `lib/api/transfer-tax-schema-sub.ts:83-95` / leaf `:33-37`(businessUse)·`:39-51`(grace) / enum `:53-58`(land)·`:60-64`(zone)
- route 매핑: `app/api/calc/transfer/route.ts:210-228`(new Date 수동) / `app/api/calc/transfer/multi/route.ts:143-152`(toDate)
- 엔진 호출: `lib/tax-engine/transfer-tax.ts:208-211` / 엔진 input 타입 `lib/tax-engine/non-business-land/types.ts:260-318` / 엔진 input 필드 `TransferTaxInput.nonBusinessLandDetails`(`lib/tax-engine/types/transfer.types.ts`)
- Zod attach 구조: `propertyBaseShape`(`transfer-tax-schema.ts:85`)의 `nonBusinessLandDetails:135` ← `nonBusinessLandDetailsSchema`(import `:13`). spread: `propertySchema:434`(단건) / `propertyItemSchema:661`(다건) / `multiInputSchema:670`. refine `addPropertyRefines`(양쪽 superRefine)
- normalize: `lib/stores/calc-wizard-migration.ts`(zustand 마이그레이션; `calc-wizard-stock-normalize.ts`는 주식 전용)
- 매퍼: `lib/tax-engine/non-business-land/form-mapper.ts:53-120`(mapAssetToNblInput)·`:128-135`(parseOwnershipRatio) / helpers `form-mapper-helpers.ts:81-181`
- store: `lib/stores/calc-wizard-asset-nbl.ts:52-105`
- UI 100% 수집: `components/calc/transfer/nbl/NblSectionContainer.tsx:136-152`(지목 분기) + 6 섹션 (Agent C 실측)
- validation 부재: `lib/calc/transfer-tax-validate-asset.ts:435,456-476,549-552`
- date-coerce: `lib/api/date-coerce.ts:37`(toDate)·`:55`(toOptionalDate)·`:76`(coerceDates)
- 테스트 현황: `__tests__/lib/calc/transfer-sales-case-wiring.test.ts:9-28`(캡처 패턴) / `__tests__/tax-engine/non-business-land/integration.test.ts:7,30,233-236` / `__tests__/tax-engine/transfer-tax/multi-house-and-nbl.test.ts:132-224`(엔진 직접)
