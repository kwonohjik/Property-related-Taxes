# 광주·전남 행정구역 통합 — 법정동코드 대응 체크리스트

> 상태: **대기(HOLD)** — 착수 금지. 아래 "착수 트리거"가 충족될 때만 실행.
> 작성일: 2026-07-01 · 근거: 코드 전수조사 + vworld 실측 (본 세션)

## 배경

광주광역시 + 전라남도 행정구역 통합이 2026-07-01 행정적으로 시행됨.
사용자 확인: ①법정동코드가 새 코드로 개편됨, ②통합 후 옛 광주 도심의 세법상 지역구분(소득세령 §167의3 주택수 산정)은 **광역(REGION) 유지**.

## ⚠️ 착수 트리거 (이게 충족되기 전엔 코드 변경 금지)

**우리 앱이 소비하는 regionCode의 출처가 실제로 새 코드로 바뀌는 시점**이 트리거다.

```
사용자 주소검색 → /api/address/search (vworld) → PNU → regionCode
   → 엔진 classifyRegionCriteriaByCode / isRegulatedByBjdCode 판정
```

- **2026-07-01 실측(vworld getcoord)**: 여전히 옛 코드·옛 시도명 반환.
  - `광주광역시 동구 학동` → level1 `광주광역시`, 법정동코드 앞5 `29110`
  - `전라남도 여수시` → level1 `전라남도`, `46130`
  - `전라남도 순천시` → `46150`
- 따라서 vworld가 옛 코드를 주는 동안 정적 데이터만 새 코드로 바꾸면
  **엔진 입력(옛 코드) ↔ 데이터(새 코드) 불일치 → 광주·전남 판정 전부 깨짐.**
- **재확인 방법**: 위 주소들을 vworld로 재지오코딩해 `level4LC` 앞 5자리가 바뀌면 그때 착수.
  (또는 행안부 KOEDB 법정동코드 파일이 새 코드로 갱신됐는지 확인)

## 세액 영향 지점 (필수 — 실측 file:line)

### 1. §167의3 주택 수 산정 지역기준 — 가장 중요
`lib/tax-engine/multi-house-surcharge-count.ts:66`
```ts
if (sidoCode === "29") return "REGION"; // 광주
```
- 현재: 광주광역시(29) 전역 = REGION(가액 불문 산입), 전남(46) = default VALUE(공시가 3억 초과만 산입).
- 통합이 **단일 시도코드**로 묶이면 2자리 시도 분기 불가 →
  **시군구(5자리) 단위 재작성** 필요: 옛 광주 5개 구 = REGION, 옛 전남 시·군 = VALUE.
- 광역(REGION) 지위 유지 확정 → 옛 광주 도심은 REGION 유지, 코드만 remap.
- **anchor 필수**: `__tests__/tax-engine/multi-house-surcharge/utilities-and-2house.test.ts:228`
  (`classifyRegionCriteriaByCode("29110") === "REGION"`) 새 코드로 갱신.

### 2. 인구감소지역 (전남 46xxx)
`lib/tax-engine/data/population-decline-areas.ts:72-88`
- 전남 15개 군(강진 46810, 고흥 46770, 곡성 46720 …) 코드 remap 필요.
- 관련 테스트: `__tests__/tax-engine/multi-house-surcharge/depopulation-data.test.ts`.

### 3. 조정대상지역 (역사 데이터 — old+new **병행** 처리)
`lib/tax-engine/data/regulated-areas.ts`
- 광주 5개 구(29110·29140·29155·29170·29200): 2020-12-18 ~ 2022-09-25 (해제됨)
- 전남 여수(46130)·순천(46150)·광양(46230): 2020-12-18 ~ 2022-07-04, 읍·면 excludedSubCodes 有
- **주의**: 과거 거래는 옛 PNU, 신규 거래는 새 PNU로 조회됨 →
  옛 코드 엔트리를 지우면 과거 거래 판정이 깨진다. **old 유지 + new 코드 alias 추가**로 양쪽 매칭.
- 파일 정책 "과거 고시는 불변" 준수: 기존 엔트리 삭제 금지.

## 세액 무관 / 자동 재생성 (우선순위 낮음)

### 4. sigungu 코드 데이터 재생성
- `lib/geo/sigungu-code-list.ts` — 광주/전남 미포함(seed 골격). KOEDB 재파싱으로 자동 채움.
- `scripts/parse-koedb-txt.ts` / `scripts/parse-koedb-helpers.ts` 재실행.
  - `parse-koedb-helpers.ts:119` `METROPOLITAN_PREFIXES = ["11","26","27","28","29","30","31"]`
    — 광역 유지이므로 "29" **제거가 아니라** 새 코드로 remap(광역 성격 보존).

### 5. 법령 리서치 인접코드 (세액 무관)
`lib/korean-law/sigungu-codes.ts`
- 광주광역시 5개 구(비표준 내부코드 24010~24050) + 전남(46110 목포·46130·46150·46170 등).
- adjacentCodes 상호 참조 → 한쪽 변경 시 **양방향 동기화** 필요. 리서치 품질만 관련.

## 영향 없음 (변경 불필요)

- `lib/regulated-area.ts` `parseAddressRegion` — 첫 어절을 시도로 쓰는 범용 split, 지역명 하드코딩 없음.
- `lib/geo/property-tax-jurisdiction.ts` — `(특별시|광역시|특별자치시)$` 정규식, 지역명 하드코딩 없음.
- 세율표·계산 엔진 core — 코드 기반이지 지역명 하드코딩 아님.
- UI 시도 드롭다운 — 존재하지 않음(주소검색으로 regionCode 추출).

## 실행 순서 (트리거 충족 시)

1. vworld 재실측으로 **old→new 법정동코드 매핑표** 확보 (추정 금지, 실측만).
2. `multi-house-surcharge-count.ts` line 66 시군구 단위 재작성 + anchor 갱신.
3. `population-decline-areas.ts` 전남 코드 remap + 테스트 갱신.
4. `regulated-areas.ts` 광주·전남 엔트리에 new 코드 alias 추가 (old 유지).
5. `scripts/parse-koedb-txt.ts` 재실행 → sigungu-code-list.ts 재생성.
6. `sigungu-codes.ts` adjacentCodes 양방향 동기화(선택).
7. `npx tsc --noEmit` + `npx vitest run __tests__/tax-engine/` 통과 확인.
8. E2E: 조정대상지역 자동판정 스펙에 광주/전남 신·구 코드 경계 케이스 추가.

## 미확정 사항 (착수 전 확정 필요)

- 통합 지자체의 **새 시도코드**(단일인지, 광주/전남 분리 유지인지).
- 옛 광주 5개 구 / 옛 전남 시·군의 **새 법정동코드 5자리** 전체.
- 행안부 공식 법정동코드 개편 고시표(old→new) 유무.
