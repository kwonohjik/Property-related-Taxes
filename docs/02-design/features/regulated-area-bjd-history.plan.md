# 조정대상지역 동(洞) 단위 이력 정밀화 + 엔진 regionCode 경로 연결 — 작업 계획서

> 작성일: 2026-06-17 · 브랜치: `feat/reg-area` · worktree: `.claude/worktrees/reg-area` (dev 3002 / e2e 3102)
> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `lib/tax-engine/data/regulated-areas-data.ts` 가 이 계획서를 인용하며 실재한다.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: 상태: **데이터 입력 대기** — 사용자 확정 데이터 수령 후 Do 착수~~

---

## 1. 배경·목표

양도소득세 계산에서 조정대상지역 판정은 **두 곳**에 영향을 준다.

- **다주택 중과세**(양도일 기준): 비조정지역이면 2주택+라도 중과 없음
- **1세대1주택 비과세 거주요건**(취득일 기준): 취득 당시 조정대상지역이면 거주 2년 필수

현재 구현은 세 가지 문제가 있다.

1. **현행성 결손**: 클라이언트 스냅샷(`lib/regulated-area.ts`)이 **2023-01-05까지만** 반영. 2025-10-16 신규 지정 고시(KoreanLaw 행정규칙일련번호 `2100000265026`) 누락.
2. **정밀도 결손**: 시도/시군구 문자열 단위만. `partial:true`인데 `sigungu` 목록이 비면 **시도 전체를 조정대상으로 오판정**(`lib/regulated-area.ts:206-212`). 동/읍면 단위 제외 지정(김포·파주·안성·청주 등) 미반영.
3. **엔진 dead path**: 엔진은 `regionCode(법정동코드) + 이력` 기반 정밀 판정 경로(`isRegulatedAreaAtDate`, `multi-house-surcharge.ts:87-104`)를 갖췄으나, UI→API 변환이 `regionCode`를 채우지 않아(`lib/calc/transfer-tax-api-houses.ts`) **항상 boolean fallback만 사용**(`transfer-tax.ts:208`).

**목표**: ① 조정대상지역 이력을 **법정동코드 + 읍면 예외** 구조의 정적 단일 소스로 재구축(현행성·정밀도 확보), ② 엔진 `regionCode` 경로를 그 정적 데이터에 실제 연결, ③ 주소 자동조회로 법정동코드를 확보하되 실패 시 기존 boolean 토글 fallback 유지.

---

## 2. 확정된 설계 결정 (인터뷰 2026-06-17)

| # | 결정 사항 | 선택 | 함의 |
|---|---|---|---|
| D1 | 정밀도 범위 | **시군구 + 읍면예외만** | 기본은 시군구 법정동코드(앞 5자리), 읍면/동 제외·한정 사례만 예외 목록으로 |
| D2 | 저장 구조 | **정적 TS 단일 소스** | `lib/regulated-area.ts` 재작성을 단일 진실로. Supabase `regulated_areas` + `lib/db/regulated-areas.ts` 폐기 |
| D3 | UI 입력 | **자동추출 + 토글 fallback** | AddressSearch의 PNU/좌표 → 법정동코드 추출 → 폼 저장 → 판정. 실패·불명확 시 boolean 토글 유지 |
| D4 | 데이터 확정 | **사용자 확정 데이터 제공** | 사용자가 이력표 제공 → 내가 정적 TS로 코드화 (§5 포맷 참조) |

---

## 3. 현황 분석 (검증된 file:line)

### 3.1 데이터/판정 계층 (직접 확인)
- **클라이언트 스냅샷**: `lib/regulated-area.ts` — `SNAPSHOTS[]`(30-136, 7시점), `parseAddressRegion`(143-157, 문자열 파싱), `findSnapshotForDate`(159-170), `checkRegulatedArea`(183-229). **동 단위 없음**, `partial` 시군구목록 비면 시도 전체 지정 처리(206-212).
- **엔진 기대 형식**: `lib/tax-engine/schemas/rate-table.schema.ts:211-228` — `regulatedAreaHistorySchema = { type, regions:[{ code, name, designations:[{ designatedDate, releasedDate }] }] }`. **읍면 예외 필드 없음**.
- **엔진 판정**: `lib/tax-engine/multi-house-surcharge.ts` — `isRegulatedAreaAtDate(regionCode, date, history)`(87-104), Step2 분기(192-204: `sellingHouse?.regionCode && regulatedAreaHistory`일 때만 자동판정, 아니면 fallback + 경고), 비조정 조기반환(222-236).
- **엔진 호출부**: `lib/tax-engine/transfer-tax.ts:203-209` — `regulatedAreaHistory`는 `parsedRates`(DB)에서, `isRegulatedFallback = workingInput.isRegulatedArea`.
- **DB 로드**: `lib/tax-engine/transfer-tax-helpers.ts:133-136` — `transfer:special:regulated_areas` 키 파싱.
- **거주요건 사용처**: `lib/tax-engine/transfer-tax-helpers.ts:196-198` — `wasRegulatedAtAcquisition` 기반 거주 2년 판정.
- **미사용 DB 경로**: `lib/db/regulated-areas.ts`(Supabase, 시군구 5자리 매칭) — 호출처 없음. `supabase/migrations/20260413000002_create_regulated_areas.sql`.
- **API**: `app/api/address/regulated-area/route.ts` — `checkRegulatedArea(address, date)` 호출, boolean 2개 반환.

### 3.2 주소→법정동코드 인프라 (Explore 조사 기준 — Pre-Do 재확인 대상)
- ✅ **법정동코드 10자리 조회 함수 이미 존재**: `app/api/address/standard-price/route.ts:68-88` `getLegalDongCode(jibun)` — VWorld `level4LC`(시군구5+동5) 반환. 공시지가 조회 내부에서만 사용.
- ✅ VWorld 역지오코딩: `app/api/address/reverse-geocode/route.ts` — `level4LC` 반환(호출처 없음).
- ✅ 주소 입력: Step1에서 `components/ui/address-search.tsx`(AddressSearch)로 PNU(19자리)+좌표 획득. 동/호 드롭다운 존재.
- ❌ **폼 저장 필드 부재**: `lib/stores/calc-wizard-asset.ts:115-127`(AssetForm)에 `addressRoad/Jibun/Detail/longitude/latitude`만, **법정동코드 필드 없음**.
- ❌ **house 변환에 regionCode 없음**: `lib/calc/transfer-tax-api-houses.ts:19-101` — `region: "capital"|"non_capital"`만 전달.
- 자동판정 트리거: `app/calc/transfer-tax/steps/Step4.tsx:44-93` — 주소 문자열만 `/api/address/regulated-area`로 POST.

> ⚠️ VWorld는 조정대상지역 데이터 자체는 제공하지 않는다(주택법 고시 사항 ≠ 국토계획법 용도지역지구). VWorld는 **주소→법정동코드 변환에만** 사용한다.

---

## 4. 설계

### 4.1 정적 데이터 모델 (단일 소스)

`lib/regulated-area.ts`를 **법정동코드 기반 이력 + 읍면 예외** 구조로 재작성한다. 엔진 스키마(`regulatedAreaHistorySchema`)와 **호환 가능한 상위집합**으로 설계하여 엔진에 그대로 변환·주입한다.

```ts
interface RegulatedDesignation {
  designatedDate: string;        // "YYYY-MM-DD" 시행일
  releasedDate: string | null;   // 해제일 (null = 현재까지 지정 유지)
  noticeRef?: string;            // 근거 고시 (예: "국토교통부공고 제2025-xxxx호")
}

interface RegulatedRegion {
  code: string;                  // 시군구 법정동코드 5자리 (예: "11680" 강남구)
  name: string;                  // "서울특별시 강남구"
  designations: RegulatedDesignation[];
  /** 시군구 지정에서 제외된 하위 읍·면·동 (D1: 시군구+읍면예외). 법정동코드 접두 매칭. */
  excludedSubCodes?: Array<{ codePrefix: string; name: string; appliesFrom?: string; appliesTo?: string }>;
}

export const REGULATED_REGIONS: RegulatedRegion[] = [ /* §5 사용자 데이터로 채움 */ ];
```

### 4.2 판정 헬퍼 (single-source-engine-helper)

판정은 **순수 함수 1벌**로 통일하고 클라이언트·엔진이 공유한다(메모리 `single-source-engine-helper`, dual-truth 회피).

```ts
// 핵심: 법정동코드 10자리(또는 5자리) + 날짜 → 판정
export function isRegulatedByBjdCode(bjdCode: string, date: string): RegulatedAreaResult {
  const sigungu = bjdCode.slice(0, 5);
  const region = REGULATED_REGIONS.find(r => r.code === sigungu);
  if (!region) return { isRegulated: false, confidence: "high", basis: "미지정 시군구" };
  const active = region.designations.find(d =>
    d.designatedDate <= date && (d.releasedDate === null || date <= d.releasedDate));
  if (!active) return { isRegulated: false, confidence: "high", basis: `${date} 기준 미지정` };
  // 읍면 예외 (10자리 코드가 있을 때만 정밀 판정)
  if (bjdCode.length >= 10 && region.excludedSubCodes?.some(ex =>
        bjdCode.startsWith(ex.codePrefix)
        && (!ex.appliesFrom || ex.appliesFrom <= date)
        && (!ex.appliesTo || date <= ex.appliesTo))) {
    return { isRegulated: false, confidence: "high", basis: `${active.designatedDate} 고시 — ${region.name} 중 제외지역` };
  }
  // 시군구 코드만 있으면 읍면 제외 미적용 → confidence medium
  const hasExclusions = (region.excludedSubCodes?.length ?? 0) > 0;
  const confidence = (bjdCode.length < 10 && hasExclusions) ? "medium" : "high";
  return { isRegulated: true, confidence, basis: `${active.designatedDate} 고시 — ${region.name} 지정` };
}

// 주소 문자열 하위호환 래퍼 (자동조회 실패 시): 주소→시군구명→code 매핑 후 위 함수 호출
export function checkRegulatedArea(address: string, date: string): RegulatedAreaResult { /* ... */ }

// 엔진 주입용: 정적 데이터 → RegulatedAreaHistoryData 변환
export function toRegulatedAreaHistory(): RegulatedAreaHistoryData { /* excludedSubCodes 제외, code/name/designations만 */ }
```

### 4.3 엔진 연결 (regionCode dead path 활성화)

두 가지 변경이 필요하다.

1. **데이터 주입 경로 전환**(D2 정적 단일화): `transfer-tax-helpers.ts`의 DB(`transfer:special:regulated_areas`) 로드를 **정적 `toRegulatedAreaHistory()`** 로 교체. (DB 키는 optional로 남겨두되 미사용; 추후 제거.)
2. **읍면 예외 반영**: 엔진 `isRegulatedAreaAtDate`는 시군구 코드 가정이라 읍면 예외를 못 본다. 두 안 중 택1(Pre-Do에서 결정):
   - **(A) 권장** 엔진이 `isRegulatedByBjdCode`를 직접 import(순수 함수, `lib/tax-engine/data/`로 데이터 이전). 판정 단일화. `history` 매개변수 의존 제거.
   - (B) `isRegulatedAreaAtDate` 시그니처에 10자리 코드+예외를 받도록 확장하고 스키마에 `excludedSubCodes` 추가.

> 역사적 상수(과거 고시 불변)이므로 `lib/tax-engine/data/regulated-areas.ts` 정적 상수 배치가 프로젝트 패턴에 부합(메모리 `feedback_historical_tax_tables`). `lib/regulated-area.ts`(클라이언트)는 이를 re-export.

### 4.4 UI/변환 (D3 자동추출 + fallback)

- **AssetForm 확장**: `regionBjdCode?: string`(10자리) 필드 추가. AddressSearch 선택 시 PNU/좌표→법정동코드 추출하여 저장. (추출 실패 시 빈값.)
- **house 변환**: `lib/calc/transfer-tax-api-houses.ts`에서 `regionCode: primary.regionBjdCode` 주입(양도주택·보유주택).
- **자동판정 트리거**(Step4): 가능하면 코드 기반 판정으로 전환, 코드 없으면 현행 주소 문자열 판정(기존 boolean 토글 유지). **useEffect→store 미러링 금지**(메모리), onChange로만.
- **3중 패턴**(메모리 `mirror-pattern`): regionBjdCode display/ API 변환/ validate fallback 일치.

---

## 5. ★ 사용자 제공 데이터 포맷 (수령 대기)

D4에 따라 **사용자가 확정 이력 데이터를 제공**한다. 아래 포맷이면 바로 코드화 가능. (둘 중 편한 형식, 마크다운 표·CSV·엑셀 무관.)

### 권장: 지정·해제 이벤트 표
| 시도 | 시군구 | 시군구 법정동코드(5자리) | 지정일(시행) | 해제일 | 읍면동 제외(있으면) | 근거고시 |
|---|---|---|---|---|---|---|
| 서울특별시 | 강남구 | 11680 | 2017-08-03 | (유지) | — | … |
| 경기도 | 김포시 | 41570 | 2020-11-20 | 2022-09-26 | 통진읍·월곶면·하성면·대곶면 제외 | … |

- **시군구 법정동코드 5자리**: 모르면 비워도 됨(내가 시군구명→코드 매핑). 단 동명이 있는 시군구는 정확도를 위해 코드 권장.
- **읍면동 제외**: 이름만 주면 내가 법정동코드 접두로 변환. 시점에 따라 제외 범위가 달랐으면 시점도 함께.
- **시점 누락 방지**: 2016-11(11.3 대책)~2025-10 사이 전체 지정·해제 시점이 모두 들어가야 함.

### 대안: 시점별 스냅샷
각 고시 시행일 기준 "그 시점의 전체 조정대상 시군구 목록(+읍면 제외)". 내가 designations 구간으로 자동 변환.

> 데이터 수령 즉시: ① 시군구명→법정동코드 매핑 검증, ② 시점 연속성(해제 없는 중복지정/공백) 검증, ③ KoreanLaw 행정규칙·국토부 보도자료로 **교차 1차 검증** 후 사용자 재확인.

---

## 6. 작업 범위 — Phase별

| Phase | 내용 | 산출물 | 비고 |
|---|---|---|---|
| **P0** | Pre-Do anchor (§9) 1~2건 선작성·실패 확인 | 테스트 | 데이터 없이도 구조 anchor 가능 |
| **P1** | 정적 데이터 모델 + 판정 헬퍼 (`lib/tax-engine/data/regulated-areas.ts`) | 신규 파일 | 데이터는 placeholder→§5 수령분 |
| **P2** | `lib/regulated-area.ts` 재작성 (헬퍼 re-export + 주소 래퍼) | 수정 | 하위호환 export 보존 |
| **P3** | 엔진 연결 (§4.3 A안: import 단일화) | `multi-house-surcharge.ts`·`transfer-tax(-helpers).ts` | 읍면 예외 반영 |
| **P4** | UI/변환 (AssetForm `regionBjdCode` + house 주입 + Step4 코드판정) | 14지점 동기화 | §7 |
| **P5** | API route 개선 (코드 수용) + 자동추출 배선 | `regulated-area`·standard-price 응답 `bjdCode` | |
| **P6** | DB 경로 폐기 (`lib/db/regulated-areas.ts` deprecate, 마이그 주석) | 정리 | 데이터 손실 없음(미사용) |
| **P7** | 테스트(anchor+회귀) + E2E + 통합 검증 | `__tests__`·`e2e` | §10 |

---

## 7. 14 동기화 지점 점검 (regionBjdCode 신규 필드)

신규 필드 `regionBjdCode`(자산-수준) 추가 → CLAUDE.md Definition of Done 14지점 전수.

- **클라이언트 8**: ① AssetForm 타입 → ② initial → ③ normalize → ④ API 변환(`transfer-tax-api-houses.ts`) → ⑤ UI 위젯(AddressSearch 연동) → ⑥ 사이드바(영향 없음) → ⑦ 결과 카드(조정대상 판정근거 표시) → ⑧ validate(코드 없을 때 boolean fallback 허용 — UI통과↔validate 모순 금지).
- **API/Route 6**: ⑨⑩ Zod enum(해당 없음, 코드는 string) → ⑪ 자산-수준 fallback → ⑫ Zod 입력객체에 `regionCode` 추가 → ⑬ callTransferTaxAPI body spread → ⑭ Route handler 엔진 input 매핑.
- ⑫⑬⑭ TS 미감지 → grep 자가 점검 필수.

---

## 8. 케이스 매트릭스 (판정 분기 전수)

| # | regionBjdCode | 시군구 지정여부 | 읍면예외 | 기대 |
|---|---|---|---|---|
| C1 | 10자리, 지정 시군구, 예외 아님 | O | — | 지정(high) |
| C2 | 10자리, 지정 시군구, 제외 읍면 | O | 해당 | 미지정(high) |
| C3 | 10자리, 미지정 시군구 | X | — | 미지정(high) |
| C4 | 5자리만, 지정 시군구, 예외 있는 시군구 | O | 불명 | 지정(medium) — 읍면 판정 불가 |
| C5 | 5자리만, 지정 시군구, 예외 없는 시군구 | O | 없음 | 지정(high) |
| C6 | 코드 없음(추출 실패) | — | — | boolean 토글 fallback |
| C7 | 지정 전 날짜 | (시점) | — | 미지정(high) |
| C8 | 해제 후 날짜 | (시점) | — | 미지정(high) |
| C9 | 재지정(지정→해제→재지정) 구간 | designations 다건 | — | 해당 구간 판정 |
| C10 | 취득일 vs 양도일 다른 판정 | — | — | wasRegulatedAtAcquisition≠isRegulatedArea 각각 |

---

## 9. Pre-Do anchor (메모리 `pre-do-anchor-verification`)

데이터 수령 전이라도 **구조 anchor**를 먼저 작성해 설계를 검증한다. "현행 일치 예상" 금지.

1. **A1 판정 헬퍼**: 알려진 확정 사실로 — 강남구(11680) 2024-01-01 지정 / 2017-01-01 미지정 / (데이터 수령 후) 김포 통진읍 코드 제외 → 미지정.
2. **A2 엔진 연결**: regionCode 주입 시 `determineMultiHouseSurcharge`가 fallback 아닌 코드경로를 타는지(경고 미발생) — 현재 dead path가 살아났는지 직접 검증.
3. **A3 시점 분리**: 취득일=조정/양도일=비조정 입력 → 거주요건은 적용, 중과는 미적용 교차.

---

## 10. 테스트 계획

- **anchor**: §8 C1~C10 + §9 A1~A3. 데이터 수령 후 실제 시점값으로 toBe() 고정(메모리 `feedback_pdf_example_test_anchoring` 정신).
- **회귀**: `npx vitest run __tests__/tax-engine/transfer/` 전체. 중과/비과세 기존 anchor 영향 확인(데이터·판정 변경으로 값이 바뀔 수 있음 → 변경된 anchor는 법령 정합값으로 재산정, 메모리 `feedback_anchor_correction_legal_priority`).
- **E2E**: `e2e/`에 조정대상지역 자동조회→판정 1 spec(worktree `E2E_PORT=3102`).
- **차단 validation 추가 시**: 해당 세목 전체 E2E 회귀(메모리 `feedback_blocking_validation_full_e2e_regression`) — 단, 본 작업은 차단 validation 신규 없음(코드 없으면 fallback) 예정.

---

## 11. 리스크·미결정

- **R1 데이터 정확성**: 동/읍면 제외는 시점마다 달라 누락 위험. → 사용자 제공 + KoreanLaw/국토부 교차검증 이중화.
- **R2 회귀 영향**: 스냅샷 부정확(시도 전체 오판정) 수정 시 기존 테스트 anchor가 바뀔 수 있음. → 법령 정합 우선 재산정.
- **R3 자동추출 신뢰도**: VWorld level4LC 추출 실패율·동명 주소 모호성. → confidence + boolean fallback로 흡수.
- **M1 엔진 연결 방식**: §4.3 (A) import 단일화 vs (B) 스키마 확장 — Pre-Do A2에서 확정.
- **M2 거주요건 동 단위**: 취득시점 조정대상도 동 단위 적용할지(현재 같은 함수라 자동 적용) — 데이터가 취득시점 읍면예외까지 커버해야.

---

## 12. 커밋·완료 게이트

- worktree `feat/reg-area`에서 작업, `scripts/ship.sh feat/reg-area "<msg>"` 또는 수동 PR.
- 완료 전: `npx tsc --noEmit` 0건 · `npx vitest run __tests__/tax-engine/transfer/` 통과 · 14지점 grep 자가점검 · E2E(3102) 통과 · 브라우저 수동 확인.
- DB 폐기(P6)는 데이터 손실 없음 확인 후(미사용 검증됨).

---

## 다음 액션

1. **사용자**: §5 포맷으로 조정대상지역 지정·해제 이력 제공 (2016-11 ~ 2025-10 전체, 읍면 예외 포함).
2. **수령 즉시**: P0 anchor 작성 → 데이터 코드화(P1) → 교차검증 → Do 진행.
