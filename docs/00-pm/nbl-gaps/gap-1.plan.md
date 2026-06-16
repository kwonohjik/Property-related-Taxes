# NBL 갭 1 — 재촌 시군구 매칭 결선 — 토지 소재지 landLocation 매핑 + SigunguSelect UI + 연접 resolver 주입

> 자동 생성(nbl-gaps-plan 워크플로 planner) — 실제 코드 정독 + KoreanLaw 본문 검증 기반. 마스터: [nbl-remaining-gaps.plan.md](../nbl-remaining-gaps.plan.md)

- **제안 PR**: PR-A 단독. NBL 재촌 판정(농지 §168의8②·임야 §168의9②)의 wired-but-disconnected 갭만 다룬다. 다른 NBL 잔여 갭(§168의11② 수입금액·§83의5 사유별 기간·§168의14② 양도일 의제)과 묶지 말 것 — 본 갭은 form-mapper 매핑·UI·route resolver 주입에 국한되고 엔진 판정 로직(residence.ts) 자체는 이미 정상이라 회귀 표면이 분리되어 있다.
- **복잡도**: M
- **선행(blocker)**: 없음

## Anchor 테스트

### Pre-Do Anchor — 도시지역 밖 농지 + 자경 전기간 + 거주 시군구=토지 시군구 → 사업용(false). 현행은 landLocation 미매핑으로 비사업용(true) 오판 **[Pre-Do]**
- **시나리오**: buildNblEngineInput(raw) → judgeNonBusinessLand(input) 풀 파이프라인. raw = { nblUseDetailedJudgment:true, nblLandType:'farmland', nblZoneType:'agriculture_forest'(도시지역 밖), acquisitionArea:'1000', acquisitionDate:'2016-01-01', transferDate:'2026-06-01', nblFarmingSelf:true, nblLandSigunguCode:'11680', nblLandSigunguName:'서울특별시 강남구', nblBusinessUsePeriods:[{startDate:'2016-01-01', endDate:'2026-06-01', usageType:'self_farming'}], nblResidenceHistories:[{sigunguCode:'11680', sigunguName:'서울특별시 강남구', startDate:'2016-01-01', endDate:'2026-06-01', hasResidentRegistration:true}] }. input.landLocation.sigunguCode === '11680' 이고 judgeNonBusinessLand(input).isNonBusinessLand === false 를 toBe(false)로 고정.
- **기대값**: 구현 후: input.landLocation = { sigunguCode: '11680' }, judgeNonBusinessLand(...).isNonBusinessLand === false (사업용). 구현 전(현행): form-mapper가 nblLandSigunguCode를 landLocation으로 옮기지 않아 input.landLocation === undefined → residence.ts:38 즉시 false → 재촌 0건 → 자경 0일 → 기간기준 미충족 → isNonBusinessLand === true. 이 anchor가 현행에서 FAIL(받은 값 true ≠ 기대 false)해야 Pre-Do 검증 성립.
- **법령근거**: 소득세법 시행령 §168의8②(KoreanLaw mst=286211 본문 검증: 농지소재지 재촌=§153③ 시군구 사실상 거주 + 조특령 §66⑬ 자경 농지 제외). 도시지역 밖 + 재촌·자경 기간기준 충족 → 사업용 §104의3①1호가목 본문.

### form-mapper 매핑 단위 — nblLandSigunguCode → landLocation.sigunguCode
- **시나리오**: buildNblEngineInput({ ...최소필수, nblLandType:'forest', nblZoneType:'agriculture_forest', nblLandSigunguCode:'11680', nblLandSigunguName:'서울특별시 강남구' }) 호출 후 input.landLocation 검사.
- **기대값**: input.landLocation 정의됨 + input.landLocation.sigunguCode === '11680'. nblLandSigunguCode 빈 문자열('')이면 input.landLocation === undefined (빈값 자동 fallback 금지, 미입력 시 undefined 유지).
- **법령근거**: 데이터 모델 — LocationInfo.sigunguCode (types.ts:108-113). form-mapper가 raw nbl* → nested 변환 단일 책임.

### 임야 재촌 — 시군구 일치 + 주민등록 있음 → 재촌 인정 / 주민등록 없음 → 미인정
- **시나리오**: judgeForest 경유 풀 파이프라인. 임야 + landLocation.sigunguCode='11680' + residenceHistories[0].sigunguCode='11680'. (a) hasResidentRegistration:true → 재촌 인정 경로. (b) hasResidentRegistration:false → residence.ts requireResidentRegistration:true로 제외.
- **기대값**: (a) residencePeriodsUsed.length > 0 (재촌 기간 산출). (b) residencePeriodsUsed.length === 0 (주민등록 없어 제외). 임야 시군구 매칭이 landLocation 주입으로 활성화됨을 고정.
- **법령근거**: 소득세법 시행령 §168의9②(KoreanLaw mst=286211 본문: 임야소재지 동일/연접 시군구 또는 직선거리 30km + 주민등록 + 사실상 거주).

### 연접 시군구 resolver 주입 — route에서 getAdjacentSigunguCodes 결과를 input.adjacentSigunguCodes로 전달
- **시나리오**: buildNblEngineInput은 adjacentSigunguCodes를 채우지 않고(매트릭스는 route/서버 책임), route handler가 buildNblEngineInput 결과에 adjacentSigunguCodes = getAdjacentSigunguCodes(landSigunguCode)를 주입하는지 확인. 매트릭스 빈 상태(MATRIX_VERSION='0000-00-00')에서는 [] 반환 → 연접 분기 비활성이나 주입 경로 자체는 존재해야 함(데이터 교체 시 즉시 활성).
- **기대값**: route 매핑 후 엔진 input.adjacentSigunguCodes === getAdjacentSigunguCodes(nblLandSigunguCode). 현재 매트릭스 빈 상태에서 [] 이나, 시군구 코드 일치(same)·30km 거리 분기는 landLocation만으로 동작하므로 본 갭의 numeric flip은 same-district 매칭으로 충족. 연접은 데이터 주입 대기.
- **법령근거**: §168의8②·§168의9② '연접한 시·군·구'. 인접 매트릭스 lib/geo/administrative-district-adjacency.ts (Phase 1-C 데이터 미주입 = 빈 배열, getAdjacentSigunguCodes 항상 []).

---

# 구현 계획 — 1-residence-sigungu (재촌 시군구 매칭 결선)

## 0. 한 줄 요약

NBL 재촌 판정 엔진(`residence.ts`)은 정상이나, 폼→엔진 변환부(`form-mapper.ts`)가 토지 소재지 시·군·구(`nblLandSigunguCode`)를 엔진이 읽는 `input.landLocation`으로 옮기지 않아 **항상 `undefined`로 도달**한다. 그 결과 `residence.ts:38 if (!landLocation) return false`에서 즉시 탈락 → 시·군·구 매칭(코드 일치·연접·30km)이 0건 → 재촌·자경 기간이 0일로 산출 → **사업용 토지를 비사업용(부당 +10%p 중과)으로 오판**한다. 또한 토지 소재지를 입력하는 UI 입력란 자체가 NBL 섹션에 없다(현 `SigunguSelect`는 거주 이력 전용). 본 갭은 ① form-mapper 매핑 결선, ② 토지 소재지 SigunguSelect UI 신설, ③ route에서 연접 resolver 주입의 세 갈래로 닫는다.

## 1. 법령 근거 (KoreanLaw `get_law_text` mst=286211 본문 검증, 시행일 20260522)

- **소득세법 시행령 §168의8② (농지)**: "법 §104의3①1호가목 본문에서 '소유자가 농지소재지에 거주하지 아니하거나 자기가 경작하지 아니하는 농지'란 §153③에 따른 **농지소재지에 사실상 거주(재촌)**하는 자가 조특령 §66⑬에 따른 직접 경작(자경)을 하는 농지를 제외한 농지를 말한다." → 재촌 = 시·군·구 단위 사실상 거주.
- **소득세법 시행령 §168의9② (임야)**: "'임야소재지에 거주하는 자가 소유한 임야'란 임야의 소재지와 **동일한 시·군·구**, 그와 **연접한 시·군·구** 또는 임야로부터 **직선거리 30킬로미터 이내**에 있는 지역에 **주민등록이 되어 있고 사실상 거주하는 자**가 소유하는 임야를 말한다." → 농지와 달리 임야는 주민등록 필수.
- 현행 엔진 `residence.ts`의 우선순위(코드 일치 > 연접 > 30km, 임야는 주민등록 게이트)는 위 법문과 정합. **법령 위반은 없고, 입력 배선(wiring)만 끊겨 있음** — 즉 "조용한 numeric 버그"는 form-mapper의 매핑 누락 1지점에서 발생.

## 2. Scope

### IN (본 PR)
1. `form-mapper.ts`: `nblLandSigunguCode`(+`nblLandSigunguName`) → `input.landLocation` 매핑. 빈 문자열이면 `landLocation` 미생성(자동 fallback 금지).
2. NBL 섹션에 **토지 소재지 SigunguSelect** 입력란 신설(공통 진입 — 지목·용도지역 카드 옆 또는 직후). store 필드는 이미 존재(`nblLandSigunguCode`/`nblLandSigunguName`)하므로 UI 위젯만 추가.
3. 단건·다건 route handler에서 `buildNblEngineInput` 결과에 `adjacentSigunguCodes = getAdjacentSigunguCodes(landSigunguCode)` 주입(연접 분기 데이터 교체 시 즉시 활성 — 현재 매트릭스 빈 상태라 `[]`이나 same-district·30km는 landLocation만으로 동작).
4. `farmland.ts:112` fallback 게이트와의 상호작용 명시(코드 변경 없음 — precedence 확인만).
5. Pre-Do anchor + 단위/통합 anchor 테스트.

### OUT (분리 후속)
- 직선거리 30km 자동 계산(현재 `LocationInfo.distanceKm`를 사용자가 직접 입력하는 legacy 경로만 존재 — 좌표→Haversine 자동화는 별도 갭). 본 PR은 **시·군·구 코드 일치/연접 매칭 결선**만.
- 연접 매트릭스 데이터 주입(`administrative-district-adjacency.json` 1,250+ 엔트리, Phase 1-C) — 데이터 인프라 별건.
- §168의11② 수입금액비율·§83의5 사유별 기간·§168의14② 양도일 의제(MEMORY 잔여 NBL 갭) — 무관.

## 3. 데이터 모델 변경

신규 store 필드 **없음**. 기존 필드 재사용:
- `AssetForm.nblLandSigunguCode: string` (calc-wizard-asset.ts:424) — 이미 존재.
- `AssetForm.nblLandSigunguName: string` (calc-wizard-asset.ts:425) — 이미 존재.
- factory 기본값 `nblLandSigunguCode: ""` / `nblLandSigunguName: ""` (calc-wizard-asset-factory.ts:175-176) — 이미 존재.
- `NBL_DEFAULTS.nblLandSigunguCode/Name` (calc-wizard-asset-nbl.ts:148-149) — 이미 존재.
- Zod `nblLandSigunguCode/Name: z.string().optional()` (transfer-tax-schema-sub.ts:86-87) — 이미 존재.

엔진 측 타입도 기존 재사용:
- `NonBusinessLandInput.landLocation?: LocationInfo` (types.ts:283).
- `NonBusinessLandInput.adjacentSigunguCodes?: string[]` (types.ts:285).
- `LocationInfo { sidoCode?; sigunguCode?; distanceKm?; hasResidentRegistration? }` (types.ts:108-113).

→ **데이터 모델 변경 0**. 결선만 필요. (이것이 "wired-but-disconnected"의 의미 — 양 끝 필드는 다 있고 중간 매핑만 빠짐.)

## 4. 14 동기화 지점 — 실제 건드릴 것 enumerate

NBL은 raw prefix-pick 특성(`buildNonBusinessLandRaw`가 `k.startsWith("nbl")` 자동 운반, non-business-land-request.ts:64-66)이라 ④⑬는 자동. 신규 store 필드가 없으므로 ①②③⑫는 이미 충족.

- **① 폼 상태**: 변경 없음. `nblLandSigunguCode`/`nblLandSigunguName` 이미 `AssetForm`에 존재(calc-wizard-asset.ts:424-425).
- **② initial**: 변경 없음. factory:175-176 이미 `""`.
- **③ normalize**: 변경 없음. NBL_DEFAULTS:148-149 이미 존재.
- **④ API 변환**: 변경 없음(자동). `buildNonBusinessLandRaw`가 prefix-pick으로 `nblLandSigunguCode`/`Name`을 raw에 자동 포함(non-business-land-request.ts:64-73). 이미 운반되고 있음.
- **⑤ UI 위젯**: **변경 O**. `NblSectionContainer.tsx`에 토지 소재지 `SigunguSelect` FieldCard 신설(지목·용도지역 grid 직후, 거주 이력 섹션 위). `value={asset.nblLandSigunguCode/Name}` + `onChange={(c,n) => onAssetChange({ nblLandSigunguCode: c, nblLandSigunguName: n })}`. `anyExempt` opacity 영역 안에 배치(무조건 면제 시 비활성).
- **⑥ 사이드바 합계**: 변경 없음. 시·군·구는 금액 합계와 무관.
- **⑦ 결과 카드**: 변경 없음(선택). `NonBusinessLandResultCard`는 `residencePeriodsUsed`·`businessUseRatio`·판정 step을 이미 표시. landLocation 매핑이 되면 재촌 기간이 정상 산출되어 기존 카드가 올바른 값을 자동 표시. (옵션: 판정 step `detail`에 토지 소재지 코드 echo는 엔진 step 라벨 영역이라 본 PR 범위 외.)
- **⑧ validation**: 변경 없음(권장 검토). 현 `transfer-tax-validate-asset.ts:439-453`는 지목·용도지역·면적만 필수. 토지 소재지 시·군·구는 **미입력 시 거리 fallback(legacy)으로 동작**하므로 차단하지 않는 것이 3중 패턴(UI display fallback ↔ validate) 정합. → validate 추가 차단 **금지**(UI 통과↔validate 차단 모순 방지). 단, 입력했으나 5자리 코드 형식이 아닌 경우는 SigunguSelect가 코드/명 동시 set하므로 형식 오류 발생 불가.
- **⑨ Zod enum 메인**: 변경 없음. `nonBusinessLandRawSchema`는 메인 schema(transfer-tax-schema.ts:136)에 optional로 이미 연결.
- **⑩ Zod 컴패니언 + addPropertyRefines**: 변경 없음. NBL은 companionAsset이 아닌 primary 자산 raw로 흐름.
- **⑪ 자산-수준 acquisitionDate fallback**: 변경 없음. `nonBusinessLandRaw.acquisitionDate`는 빌더가 `asset.acquisitionDate` 주입(non-business-land-request.ts:70).
- **⑫ Zod 입력객체 정의**: 변경 없음. `nblLandSigunguCode/Name: z.string().optional()` 이미 정의(transfer-tax-schema-sub.ts:86-87).
- **⑬ callTransferTaxAPI body spread**: 변경 없음(자동). prefix-pick이 nblLandSigunguCode/Name을 자동 spread.
- **⑭ Route handler 엔진 input 매핑**: **변경 O**. 두 곳:
  - 단건 `app/api/calc/transfer/route.ts:213` `nonBusinessLandDetails: buildNblEngineInput(data.nonBusinessLandRaw)` — buildNblEngineInput 내부에서 landLocation이 채워지면 자동 도달(③번 form-mapper 매핑이 핵심). **추가로** route에서 `adjacentSigunguCodes` 주입이 필요(아래 §5.B 참조).
  - 다건 `app/api/calc/transfer/multi/route.ts:145` 동일.

**결론**: 실제 코드 변경은 **③ form-mapper(매핑) + ⑤ UI + ⑭ route(연접 주입)** 3지점. 나머지는 기존 인프라가 이미 수용.

## 5. 엔진/변환 로직

### A. form-mapper.ts — landLocation 매핑 (핵심)

`mapAssetToNblInput` 반환 객체(현재 form-mapper.ts:112-129)에 `landLocation` 추가:

```
// form-mapper.ts 내부, 도시편입일 블록(line 98-102) 부근에 추가
const landSigunguCode = asString(asset.nblLandSigunguCode);
const landLocation: LocationInfo | undefined = landSigunguCode
  ? { sigunguCode: landSigunguCode }
  : undefined;
```

반환 객체(line 112-129)에 spread 추가:
```
...(landLocation ? { landLocation } : {}),
```

- `LocationInfo`를 types에서 import 추가(현재 form-mapper.ts:9-16 import 블록에 `LocationInfo` 없음 → 추가).
- **빈 문자열이면 landLocation 미생성** — 자동 fallback 금지 원칙. 미입력 시 `undefined` 유지 → farmland.ts:112 거리 fallback 경로 정상 동작(아래 D 참조).
- `nblLandSigunguName`은 엔진 매칭에 불필요(코드 매칭만 사용). UI 표시·store에만 보관. (residence.ts는 sigunguCode만 비교; 명칭 비교 분기 line 49-58은 dead branch.)

### B. route handler — adjacentSigunguCodes 주입

`buildNblEngineInput`은 순수 변환(매트릭스 의존 주입 금지 — 클라이언트 빌더가 서버 데이터 미보유)이므로 **route handler에서** 연접 resolver 결과를 주입한다. inheritance-farming-deduction.ts:246-248 패턴(`adjacentSigunguCodes: getAdjacentSigunguCodes`) 차용.

방안(권장): `buildNblEngineInput`이 `landLocation.sigunguCode`를 채운 뒤, route가 그 코드로 `getAdjacentSigunguCodes`를 호출해 input에 주입.

```
// route.ts:213 부근
const nblInput = buildNblEngineInput(data.nonBusinessLandRaw);
const nblWithAdjacent = nblInput?.landLocation?.sigunguCode
  ? { ...nblInput, adjacentSigunguCodes: getAdjacentSigunguCodes(nblInput.landLocation.sigunguCode) }
  : nblInput;
// ...
nonBusinessLandDetails: nblWithAdjacent,
```

- import: `import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";` (두 route 모두).
- 매트릭스 빈 상태(`MATRIX_VERSION="0000-00-00"`, getSigunguCount()===0)에서 `getAdjacentSigunguCodes`는 항상 `[]` 반환 → 연접 분기 비활성, **그러나 same-district 코드 일치·30km 거리 분기는 landLocation만으로 동작**하므로 본 갭의 numeric flip(같은 시·군·구 거주)은 A 매핑만으로 충족. 연접 활성화는 데이터 주입(별건) 시 자동.
- **대안(더 단순)**: B를 본 PR에서 생략하고 A만 적용해도 same-district·30km 케이스는 닫힌다. 단 연접 케이스 대비 주입 배선을 미리 깔아두는 것이 데이터 교체 시 TS 변경 0이 되어 권장(inheritance 트랙과 일관). **결정: B 포함**(저비용·고일관).

### C. UI — NblSectionContainer.tsx

`NblSectionContainer.tsx`의 지목·용도지역 grid(line 97-133) **직후**, 거주 이력 섹션(line 136) 위에 토지 소재지 입력 추가:

```
<div className="mt-3">
  <FieldCard label="토지 소재지 (시·군·구)" hint="재촌 판정 — 거주지와 동일/연접 시·군·구 매칭에 사용 (소득령 §168의8②·§168의9②)">
    <SigunguSelect
      code={asset.nblLandSigunguCode}
      name={asset.nblLandSigunguName}
      onChange={(c, n) => onAssetChange({ nblLandSigunguCode: c, nblLandSigunguName: n })}
    />
  </FieldCard>
</div>
```

- import: `import { SigunguSelect } from "./shared/SigunguSelect";` (ResidenceHistorySection.tsx:9와 동일 경로).
- `anyExempt` opacity 래퍼(line 96) 안쪽에 배치 — 무조건 면제 선택 시 자동 비활성(거주 이력 섹션과 동일 정책).
- 거주 이력 섹션이 농지·임야·목장에서만 노출(line 136)되므로, 토지 소재지도 **동일 게이트(농지·임야·목장)** 안에 배치하는 것이 자연스럽다(주택·별장·기타토지는 재촌 무관). → grid 직후가 아니라 거주 이력 섹션 게이트와 묶어 `{(farmland||forest||pasture) && (<토지소재지 + ResidenceHistorySection/>)}` 형태로 통합 배치. 토지 소재지를 거주 이력 위에 두어 "소재지 → 거주지 매칭" 논리 순서 유지(UI 순서 = 계산 로직 순서).
- 위젯: 기존 `SigunguSelect`(typeahead + 5자리 직접 입력) 재사용 — 신규 위젯 불필요. select-on-focus는 SelectOnFocusProvider/SigunguSelect 내부 onFocus(line 58-61)로 이미 충족.

### D. farmland.ts:112 fallback 게이트 상호작용 (코드 변경 없음 — 정합 확인)

현행 farmland.ts:103-126:
```
const residenceFromHistory = computeResidencePeriods(ownerProfile?.residenceHistories, input.landLocation, {...});
const fallbackResidence = residenceFromHistory.length === 0
  ? fallbackResidenceFromDistance(ownershipStart, transferDate, input.farmerResidenceDistance, ...)
  : [];
const residencePeriods = residenceFromHistory.length > 0 ? residenceFromHistory : fallbackResidence;
```
- landLocation 매핑 후: 거주 이력 + 토지 소재지 코드 일치 시 `residenceFromHistory.length > 0` → **fallback 거리 경로 자동 억제**(precedence: 이력 매칭 우선). 충돌 없음 — 거리 입력란(ResidenceHistorySection.tsx:113-124)은 이력이 0건일 때만 노출되므로 UI 레벨에서도 양립.
- 임야 forest.ts:88-96의 fallback은 추가로 `ownerLocation?.hasResidentRegistration === true` 게이트가 있으나 본 갭과 무관(이력 매칭이 우선 성립하면 미진입).
- **검증 필요 명시**: Pre-Do anchor에서 "거주 이력 있음 + 시군구 일치" 케이스가 fallback이 아닌 history 경로로 PASS하는지 `residencePeriodsUsed` 구간 시작일이 이력 시작일과 일치함으로 확인(거리 fallback은 ownershipStart~transferDate 전체 구간이므로 구별 가능).

## 6. Edge case · Risk

1. **빈 시·군·구 코드**: SigunguSelect 미선택 시 `nblLandSigunguCode=""` → form-mapper가 landLocation 미생성 → 거리 fallback(legacy) 경로 유지. 회귀 없음. (3중 패턴: UI 미입력 → API undefined → validate 미차단 일관.)
2. **5자리 직접 입력**: SigunguSelect는 5자리 숫자 직접 입력 시 code=name 동시 set(SigunguSelect.tsx:31-38). form-mapper는 code만 사용하므로 안전.
3. **거주 이력 sigunguCode 빈값**: ResidenceHistorySection 추가 시 sigunguCode가 ""일 수 있음 → residence.ts:42 `history.sigunguCode &&` 가드로 매칭 스킵 → 기존 동작 유지.
4. **임야 주민등록 게이트**: 시군구 일치해도 hasResidentRegistration=false면 임야는 제외(forest.ts:81 requireResidentRegistration:true). landLocation 매핑이 이 게이트를 우회하지 않음 — 법령 정합.
5. **연접 매트릭스 빈 상태**: getAdjacentSigunguCodes() === [] → 연접 케이스는 본 PR에서 미동작(데이터 대기). anchor에서 same-district만 numeric flip 검증하고 연접은 주입 경로 존재만 확인(데이터 주입 후 활성).
6. **다건 모드**: multi/route.ts:145도 동일 주입 필요 — 누락 시 다건 NBL 재촌이 단건과 불일치(침묵 strip). ⑭ 두 곳 모두 변경 필수.
7. **회귀 리스크**: 기존 `__tests__/tax-engine/non-business-land/residence.test.ts`·`farmland.test.ts`·`forest.test.ts`는 엔진에 직접 landLocation을 주입하므로 form-mapper 변경 영향 없음(green 유지). `nbl-detailed-cases.test.ts`·`nbl-raw-to-engine-input.test.ts`는 form-mapper 경유 — landLocation 추가 spread가 기존 단언을 깨지 않음(추가 키만 생김). 단 Pre-Do anchor 추가 시 현행 FAIL → 구현 후 PASS 확인.
8. **800줄 정책**: NblSectionContainer 현재 ~180줄, FieldCard 1개 추가로 영향 없음. route handler·form-mapper도 여유.

## 7. 구현 순서 (Do)

1. **Pre-Do anchor 작성·실행** (`nbl-detailed-cases.test.ts`에 추가): 도시지역 밖 농지 + 자경 전기간 + 거주 시군구=토지 시군구 → `isNonBusinessLand: false` 기대. **현행 FAIL(true 반환) 확인** → 디자인 환류.
2. **form-mapper.ts**: `LocationInfo` import + landLocation 매핑 + 반환 spread (§5.A).
3. **route.ts·multi/route.ts**: getAdjacentSigunguCodes import + adjacentSigunguCodes 주입 (§5.B). ⑭ 두 곳.
4. **NblSectionContainer.tsx**: SigunguSelect import + 토지 소재지 FieldCard, 거주 이력 게이트와 통합 (§5.C).
5. **단위 anchor** 추가(form-mapper 매핑·임야 주민등록·연접 주입 경로).
6. Pre-Do anchor PASS 확인.
7. `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/non-business-land/ __tests__/lib/calc/nbl-*` → 전체 `npm test`.
8. 브라우저/E2E: 토지 소재지 입력 → 계산 → Network 탭에서 `nonBusinessLandRaw.nblLandSigunguCode` 전송 확인, 결과 카드 재촌 기간 정상 산출 확인(미수행 시 명시).

---

## 🔍 R1 자가검토 정정 (2026-06-16, plan-design-self-review-loop · 실측 검증)

> 7-에이전트 검토(인용 grep/Read 실측) 결과. 정정은 본 절을 우선(본문 인용과 충돌 시 본 절 기준).

| 우선 | 카테고리 | 정정 |
|---|---|---|
| High | 오류 | §5.B 경로: `lib/tax-engine/deductions/inheritance-farming-deduction.ts:247`(deductions/ 누락 정정). NBL `computeResidencePeriods`는 **resolved `string[]` 수신**(residence.ts:21·types.ts:285) → route에서 `getAdjacentSigunguCodes(code)`(배열) 호출 전달. inheritance는 resolver **함수** 주입(시그니처 상이) — "패턴 차용" 표현 삭제. route 예시 코드는 올바름. |
| High | 누락 | **연접 데이터 이중 소스(실측)**: `lib/geo/administrative-district-adjacency.json`=빈 `{}`(MATRIX_VERSION 0000-00-00)이나 `lib/korean-law/sigungu-codes.ts SIGUNGU_CODES[].adjacentCodes`는 5자리 코드로 **완전 충전**(SigunguSelect 검색 소스 동일). → §5.B route 주입을 **SIGUNGU_CODES 기반 resolver**(채워진 5자리)로 가져가면 연접 즉시 동작. `getAdjacentSigunguCodes`(빈 JSON·10자리 가정 주석)와 **자리수(5/10) 불일치**를 §6 확인필요로 추가. |
| Medium | 오류 | Pre-Do anchor: 코드 **11680 = 서울특별시 서초구**(강남구는 11710). 라벨을 "서울특별시 서초구"로 정정(코드 유지, numeric 불변). |
| Medium | 개선 | `nblLandSigunguName` 미사용은 **의도적 결정**(residence.ts:49-58 명칭 비교는 return 없는 dead branch) 명시. 명칭 기반 연접 매칭은 OUT/후속. |
| Low | 모순 | §4⑤(grid 직후) ↔ §5.C(3지목 게이트 내) 상충 → **§5.C 결론(농지·임야·목장 게이트 내, 거주이력 위)으로 통일**. 주택·별장·기타토지는 재촌 무관. |
| Low | 누락 | 30km 거리분기: **same-district만 `landLocation.sigunguCode`로 동작**. 30km는 `landLocation.distanceKm`(미주입) 또는 legacy `farmerResidenceDistance` 경로만 → 본 PR numeric flip은 same-district 단독 충족. anchor·§5.B "30km도 landLocation만으로 동작" 문구 정정. |
| Low | UI누락 | 신설 토지소재지 FieldCard에 testid `nbl-land-sigungu` 부여 + trailing `LawArticleModal`(소득령 §168의8②/§168의9②) 배지(거주이력 섹션 일관성). |

---

## ✅ Do 구현 완료 (2026-06-16, worktree feat/nbl-gaps)

**변경(코드 3파일)**:
- `lib/tax-engine/non-business-land/form-mapper.ts`: `LocationInfo` import + `lookupSigungu` import. `nblLandSigunguCode` → `input.landLocation={sigunguCode}` + `input.adjacentSigunguCodes=lookupSigungu(code)?.adjacentCodes`(빈값=undefined·자동 fallback 금지). 반환 객체 조건부 spread.
- `components/calc/transfer/nbl/NblSectionContainer.tsx`: 농지·임야·목장 게이트 내, 거주이력 위에 토지 소재지 `SigunguSelect` FieldCard 신설(`data-testid="nbl-land-sigungu"` + LawArticleModal §168의8②·9² 배지).
- `__tests__/lib/calc/nbl-residence-sigungu.test.ts`(신규): Pre-Do anchor 3종(form-mapper 단위·풀 엔진 flip·대조 부산거주).

**설계 대비 deviation (환류)**: 엔진 설계 §갭1은 "route(route.ts·multi/route.ts)에서 `getAdjacentSigunguCodes` 주입"으로 설계했으나, **R1에서 그 소스(administrative-district-adjacency.json)가 빈 `{}`·10자리 가정으로 확인됨**. 실제 충전된 5자리 소스는 `sigungu-codes.ts SIGUNGU_CODES[].adjacentCodes`이고 `lookupSigungu(code)`(:191) 헬퍼가 이미 존재 → **form-mapper에서 직접 해석**하도록 변경. 결과: **route.ts 무변경**(14지점 ⑭를 form-mapper에서 충족), same-district + 연접 모두 즉시 동작(빈 JSON·자리수 미스매치 회피).

**14지점**: ①②③⑫(nblLandSigunguCode/Name 기존)·④⑬(prefix-pick 자동)·⑤(SigunguSelect)·⑭(form-mapper)·⑥⑦⑧(N/A·무변경 — 재촌기간 자동, validate 비차단).

**검증**: Pre-Do anchor 현행 FAIL(landLocation undefined·isNonBusinessLand true) → 구현 후 PASS(landLocation 11680·isNonBusinessLand false·adjacent 11710 포함). `npx tsc --noEmit` 0건. 전체 vitest **8441 passed / 0 failed**(14 skip·1 todo 사전존재). **E2E 미수행** — 수치 정확성은 production 경로(form-mapper→judgeNonBusinessLand) anchor로 실증, UI는 재사용 SigunguSelect 바인딩(ResidenceHistorySection에서 이미 E2E 노출). 딥-네비 E2E spec은 후속(NBL baseline spec 부재).
