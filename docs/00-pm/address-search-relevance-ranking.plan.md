# 소재지(주소) 검색 결과 관련도 정렬 — 수정 계획서

> 작성일: 2026-06-29 · 대상: `/api/address/search` 라우트 + 신규 순수 정렬 함수
> 정책 사전적용: `pre-do-anchor-verification`(Do 전 anchor 우선) · `single-source-engine-helper`(순수 함수 단일화) · 법령무관 UI 변경(법령 정확성 영향 없음)

---

## 1. 문제 정의

소재지 검색 시 **사용자 입력 주소에 가장 근사한 값이 맨 위에 와야** 하는데, 현재는 도로명 인덱스 결과가 무조건 먼저 노출되어 정작 사용자가 의도한 지번이 맨 아래로 밀린다.

### 재현 (사용자 제보 — 이미지 4·5)

검색어: `내동 6-20` (지번 주소 형태)

현재 결과 순서(상위부터):
| # | 표시(road) | 지번(jibun) | 비고 |
|---|---|---|---|
| 1 | 경상남도 김해시 금관대로1341번길 6-20 (내동) | 내동 646 | 도로명 건물번호만 6-20, 지번 ≠ |
| 2 | 인천광역시 중구 자유공원로27번길 6-20 (내동) | 내동 2-15 | 동일 |
| 3 | 경기도 남양주시 식송2로 6-20 (별내동) | 별내동 1129-2 | 동일 |
| … | … | … | … |
| **last** | **자유공원로23번길 4** | **인천광역시 중구 내동 6-20** | **← 사용자가 원한 정확 지번. 맨 아래** |

기대 결과: 지번이 정확히 `내동 6-20`인 마지막 항목이 **맨 위**.

---

## 2. 근본 원인 (실측 확인됨)

**파일:** `app/api/address/search/route.ts:100-114`

```ts
const [roadItems, parcelItems] = await Promise.all([
  fetchCategory("road"),     // 도로명 인덱스
  fetchCategory("parcel"),   // 지번 인덱스
]);

// PNU 기준 dedup — 도로명 결과를 우선 노출.
const seen = new Set<string>();
const merged: VworldItem[] = [];
for (const it of [...roadItems, ...parcelItems]) {   // ← 항상 road 먼저
  const key = it.id ?? `${it.address?.road ?? ""}|${it.address?.parcel ?? ""}`;
  if (seen.has(key)) continue;
  seen.add(key);
  merged.push(it);
}
```

- 병합 순서가 **`road` 전부 → `parcel` 전부**로 고정.
- 검색어와의 **일치도 점수가 전혀 없음**. 도로명 건물번호(`...6-20`)가 검색어 숫자와 우연히 겹치면 상위 점유.
- 클라이언트(`components/ui/address-search.tsx:118`)는 `data.results`를 **받은 순서 그대로** 렌더 → 서버 순서가 곧 화면 순서.

### 영향 범위 (실측 확인됨)

- `/api/address/search`를 호출하는 코드는 **`components/ui/address-search.tsx` 단 1곳**(`grep` 확인).
- `AddressSearch` 컴포넌트 사용처 **11곳**: property·acquisition·transfer(분양권·동반자산·재개발·일반건물·상가·혼합용도)·comprehensive(토지필지)·inheritance(estate-card·영농·거주)·building-std-price.
- 따라서 **라우트 한 곳 수정 = 전 세목 소재지 검색 일괄 수정.**

### 공시지가·주택공시가격 조회는 재정렬 대상 아님 (확인됨)

| 버튼 | 라우트 | 입력 | 반환 | 후보 목록? |
|---|---|---|---|---|
| 소재지 검색 | `/api/address/search` | 검색어(q) | **후보 주소 배열** | ✅ 정렬 필요 |
| 공시지가 조회 (`LandPriceLookupField`) | `/api/address/standard-price` (`propertyType:land`) | 확정 지번 1개 | 가격 1값 | ❌ |
| 주택공시가격 (`AddressSearch` 동/호) | `/api/address/standard-price` (`propertyType:housing`) | 확정 지번/PNU | 동·호 단가 목록 | ❌(동/호는 이미 `sortNaturalKo` 자연정렬) |
| 건축물대장 (`BuildingRegisterLookupField`) | `/api/address/building-register` | 확정 PNU | 구조·연면적 등 | ❌ |

→ 공시지가·주택공시가격 조회는 **이미 확정된 지번/PNU**를 받아 가격만 돌려주므로 "근사값 정렬" 개념이 없다. 단, 이들 폼은 **소재지 검색에서 고른 지번**을 입력으로 쓰므로, 본 수정으로 사용자가 올바른 지번을 먼저 선택하게 되어 후속 가격 조회 정확도도 함께 개선된다. **추가 코드 변경 불필요.**

---

## 3. 해결 방향

병합 후 **검색어 관련도 점수로 안정 정렬(stable sort)** 한다. 점수 계산은 **순수 함수로 분리**하여 단위 테스트로 검증한다.

### 3-1. 신규 순수 함수 — `lib/address/rank-address-results.ts`

```ts
export interface RankableAddress {
  road: string;
  jibun: string;
  building?: string;
}

/** 검색어 관련도 내림차순으로 안정 정렬한 새 배열 반환 (입력 불변) */
export function rankAddressResults<T extends RankableAddress>(query: string, items: T[]): T[];
```

라우트는 dedup 후 `merged`(정규화 직전) 또는 `results`(정규화 후)에 이 함수를 적용. **정규화 후 `results`에 적용**하는 편이 `road`/`jibun` 필드가 평탄해 함수 시그니처가 단순 → `results = rankAddressResults(query, results)`.

### 3-2. 점수 산정 알고리즘 (초안 — Pre-Do anchor로 가중치 동결)

토큰 추출 헬퍼:
```ts
const norm = (s: string) => s.replace(/\s+/g, "");                 // 공백 제거
// 행정동/리/가 + 끝 번지("본번" 또는 "본번-부번") 추출
const dongOf = (s: string) => s.match(/([가-힣]+(?:동|리|가|읍|면))\s*\d/)?.[1] ?? "";
const noOf   = (s: string) => s.match(/(\d+(?:-\d+)?)(?:번지)?\s*$/)?.[1] ?? "";
```

질의 파싱:
```ts
const qNorm = norm(query);
const qDong = dongOf(query);   // "내동 6-20" → "내동"
const qNo   = noOf(query);     // "내동 6-20" → "6-20"
const qHasRoad = /[가-힣\d]+(로|길|대로)\b/.test(query);  // 도로명 질의 여부
```

후보별 점수(높을수록 상위):
| 조건 | 점수 | 의도 |
|---|---|---|
| `qNo` 존재 && `jibun`의 번지 == `qNo` && `jibun`의 동 == `qDong` | **+1000** | 동+번지 정확 일치(핵심) |
| `qNo` 존재 && `jibun`의 번지 == `qNo` (동 불일치) | +400 | 번지만 정확 |
| `qDong` 존재 && `jibun`의 동 == `qDong` (번지 불일치) | +100 | 동만 일치 |
| `norm(jibun)`이 `qNorm` 연속 포함 | +50 | 지번 부분일치 |
| `qHasRoad` && `norm(road)`이 `qNorm` 연속 포함 | +60 | 도로명 질의 시 도로명 일치 우대(부분일치 한정) |
| (그 외) | 0 | |

정렬: **`(점수 내림차순, 원래 인덱스 오름차순)` 복합 키**로 정렬한다. 엔진 `Array.sort` stability에만 의존하지 않고 **index를 명시적 2차 키로 결합**(`items.map((it,i)=>({it,i,score})).sort((a,b)=> b.score-a.score || a.i-b.i)`) → 동점 구간에서 기존 road-first 순서가 결정적으로 보존되어 일반 검색 회귀 없음. 입력 배열은 불변(새 배열 반환).

**dedup이 랭킹을 해치지 않음(확인):** 동일 필지가 road·parcel 양쪽에 있으면 dedup은 road 항목을 남기지만, 그 항목의 `jibun` 필드는 parcel 항목과 동일하므로 `+1000` 점수가 그대로 유지된다. 즉 정확 지번은 어느 인덱스에서 왔든 최상단.

검증(이미지 4·5 데이터):
- `인천 중구 내동 6-20` → +1000 → **1위** ✅
- `내동 646`·`내동 2-15`(도로명 항목) → qDong "내동" 일치, qNo 불일치 → +100 → 중위
- `별내동 1129-2` → 동("별내동")≠"내동", 번지≠ → 0 → 하위

> ⚠️ **포맷 혼재(이미지로 일부 확인):** 도로명 인덱스 항목의 지번은 **단축형**(이미지 5 `내동 646`), 지번 인덱스 항목은 **풀주소**(이미지 5 `인천광역시 중구 내동 6-20`)로 관측됨. E2E mock 픽스처는 풀주소(`서울 강남구 역삼동 736`). 즉 두 포맷이 공존하므로 `dongOf`/`noOf` 정규식은 **양쪽 모두에서** 동/번지를 추출해야 한다(단축·풀주소 모두 끝이 `…동 번지` 꼴이라 §3-2 정규식으로 커버됨). Pre-Do anchor에서 두 포맷 케이스를 모두 넣어 최종 확정.

> ⚠️ **도로명 질의 한계(설계상 의도):** `자유공원로 23-4`처럼 사용자가 입력한 도로명과 Vworld 반환 도로명(`자유공원로23번길 4`)은 표기가 달라 연속 부분일치(+60)가 잘 안 걸린다. 이 경우 모든 후보 점수가 0이 되어 **기존 road-first 순서로 폴백**(회귀 없음)된다. 도로명 질의의 적극적 랭킹 개선은 본 작업 범위 밖(사용자 요청은 지번 근사도). A3는 "회귀 없음" 검증이지 도로명 점수 검증이 아님.

---

## 4. 변경 파일 (Surgical)

| # | 파일 | 변경 | 비고 |
|---|---|---|---|
| 1 | `lib/address/rank-address-results.ts` | **신규** | 순수 정렬 함수 + 토큰 헬퍼 |
| 2 | `app/api/address/search/route.ts` | `results` 반환 직전 `results = rankAddressResults(query, results)` 1줄 + import | 기존 dedup·병합 로직 유지 |
| 3 | `__tests__/address/rank-address-results.test.ts` | **신규** | anchor 케이스 + 회귀 케이스 |

> 기존 dedup/병합/정규화는 건드리지 않는다(인접 코드 개선 금지). road-first 병합 순서는 stable sort의 동점 tiebreak로 그대로 의미를 가진다.

---

## 5. 작업 절차 (PDCA)

```
1. Pre-Do anchor 작성·실행 (정책 강제)
   → __tests__/address/rank-address-results.test.ts 에 이미지 4·5 실데이터 케이스 작성
   → rank 함수 미구현 상태로 실행 → 실패 확보 (red)
   verify: "내동 6-20" 케이스에서 인천 중구 내동 6-20 항목 index 0 기대 → 현재 실패

2. (가능 시) Vworld 실응답 1건 캡처로 parcel 포맷 확인
   → dongOf/noOf 정규식이 실포맷에서 동작하는지 검증, 필요 시 정규식·가중치 정정
   verify: 캡처한 parcel 문자열에 정규식 적용 → 동/번지 정확 추출

3. rank-address-results.ts 구현 (green)
   verify: anchor 테스트 통과

4. route.ts 배선 (import + 1줄)
   verify: npx tsc --noEmit 0건

5. 회귀 — 도로명 질의가 깨지지 않는지(점수 0 → road-first 폴백 유지)
   verify: "자유공원로 23-4" 케이스에서 결과 순서가 입력(road-first)과 동일

6. E2E 무영향 — 확인 완료(추가 작업 불필요)
   → property-urban-area-lookup / building-standard-price / building-register-autofill
     3개 spec이 /api/address/search를 mock하지만 results가 모두 **단일 항목**
     → 정렬 no-op → 깨질 수 없음(실측 확인). 회귀 게이트는 npm test로 충분.
   verify: npx vitest run __tests__/address/ 통과
```

---

## 6. 테스트 계획 (anchor)

`__tests__/address/rank-address-results.test.ts`:

| ID | 질의 | 기대 | 검증 정책 |
|---|---|---|---|
| A1 | `내동 6-20` (이미지 데이터 8건) | 지번 `…내동 6-20` 항목이 index 0 | 핵심 버그 재현→해소 |
| A2 | `내동 646` | 지번 `내동 646` 항목 index 0 | 번지 다른 동명 구분 |
| A3 | `자유공원로 23-4` (도로명 질의, 전 항목 점수 0) | **입력 순서(road-first) 그대로 보존** | 도로명 질의 회귀 방지(적극 점수 아님) |
| A4 | `별내동 1129-2` | 별내동 1129-2 index 0, `내동` 항목 하위 | 부분문자열 오매칭 방지(별내동⊃내동) |
| A5 | 빈/공백/1글자 질의 | 입력 순서 그대로(불변) | 엣지 가드 |
| A6 | 동점 다수 | 원래(road-first) 순서 보존 | stable 보장 |

> anchor 가중치/정규식이 실데이터와 충돌하면 **테스트가 아니라 알고리즘을 정정**(법령 무관, 사용자 기대값이 진실 — `feedback_anchor_correction_legal_priority` 동일 원칙).

---

## 7. 완료 기준 (Definition of Done)

- [ ] `rankAddressResults` 순수 함수 + 단위 테스트 A1~A6 전부 통과
- [ ] `route.ts` 배선 1줄 + import, dedup/병합 로직 무변경
- [ ] `npx tsc --noEmit` 0건 / `npm run lint`(변경 파일) 0건
- [ ] 도로명 질의 회귀 없음(A3)
- [ ] 영향 범위 = 소재지 검색 단일 라우트(공시지가·주택공시가격·건축물대장 라우트 무변경) 명시 확인
- [ ] (선택) 브라우저/E2E에서 "내동 6-20" 검색 → 정확 지번 최상단 노출 확인

---

## 8. 미해결·확인 필요 항목 / 비목표(Non-Goals)

**확인 필요(Pre-Do에서 해소):**
1. **가중치 절대값**(1000/400/100/60/50) — 상대 순서만 의미. anchor A1~A6으로 동결, 충돌 시 조정.
2. **`을지로N가`·`○○로N길` 등 도로명에 숫자가 섞인 행정구역명** — `dongOf`(`동|리|가|읍|면` + 숫자) 추출이 오작동할 수 있음(예: "을지로3가"는 `가` 앞이 숫자라 미추출). 사용자 보고 케이스(지번 동명)에는 영향 없으나, anchor에 1건 추가해 동작 명시.
3. **초안 정규식 결함 — `qHasRoad`의 `\b`**: `/[가-힣\d]+(로|길|대로)\b/`의 `\b`는 JS에서 ASCII 단어경계라 한글 "로/길" 뒤(비-\w + 공백)에서는 매칭 실패 가능 → +60 게이트가 항상 false가 될 위험. Do에서 `\b` 제거 등으로 단순화·검증(영향: 도로명 +60은 비목표라 낮음).

**비목표(이번 작업 범위 밖, 명시적 제외):**
3. **도로명 질의 적극 랭킹** — 도로명 입력은 표기 차이로 점수 0 → road-first 폴백(§3-2). 사용자 요청은 "지번 근사도"이므로 도로명 랭킹 고도화는 제외.
4. **건물명 질의**(예: "은마아파트") — jibun 근사도 정렬 대상 아님. 현행 동작 유지.

**해소 완료(검토 중 확인):**
- ~~Vworld parcel 포맷 단축/풀주소 여부~~ → 이미지 5로 두 포맷 공존 확인, §3-2 정규식이 둘 다 커버(§3-2 ⚠️).
- ~~E2E 영향~~ → 3개 mock 모두 단일 항목, no-op(§5-6).
