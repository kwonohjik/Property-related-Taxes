# 영농상속공제 거주지 — 행정구역 OR 조건 PRD

> **대상**: 시행령 §16②1호나 "시·군·구 또는 연접 시·군·구" OR 조건 자동 검증
> **작성일**: 2026-05-21
> **선행**: PR-E 인프라 (Haversine 30km, `dd7e2fc`) 완료
> **상태**: PRD 단계 — 구현 계획 미수립

---

## 1. 배경

### 1-1. 법령 조문 (KoreanLaw MCP 검증 필요)

**시행령 §16②1호나** (영농상속공제 거주지 요건):

> 농지·초지·산림지·농업용 건축물·염전 자산: **자산 소재 시·군·구**(자치구·시·군) 또는 **연접한 시·군·구** 또는 **직선거리 30km 이내** 거주
> 어선·어업권 자산: **선적지·어장 연안 시·군·구** 또는 **연접한 시·군·구** 또는 **직선거리 30km 이내** 거주

→ 3가지 OR 조건. **현재 인프라는 30km만 자동**. 나머지 2개는 사용자 boolean 의존.

### 1-2. 현재 한계

PR-E 인프라(`dd7e2fc`):
- ✅ Haversine 30km 자동 판정
- ❌ "시·군·구 동일" 판정
- ❌ "연접 시·군·구" 판정

`farming-residence-check.ts`는 30km만 평가 → 사용자가 30km 외 거주이지만 동일 시·군·구거나 연접 시·군·구인 경우 자동 검증 false → 사용자가 수동 boolean ON 필요.

---

## 2. 법령 해석 사전 조사 필요 항목

### 2-1. "시·군·구" 정의

| 항목 | 해석 후보 | 출처 검증 필요 |
|---|---|---|
| 광역시 자치구 | 강남구, 종로구 등 | §16②1호나 "자치구" 명시 — 확정 |
| 일반 시·군 | 수원시, 가평군 등 | 확정 |
| 특별자치시·도 하 행정 단위 | 세종시 (행정구), 제주시 등 | **사전 조사 필요** |
| 광역시 일반구 (자치권 없음) | 부산 동래구 등 (자치구 OK) | 확정 |

**KoreanLaw MCP 검증 항목**:
- §16②1호나 "시·군·구"의 정확한 범위 — 지방자치법 §2와 일치?
- 행정구역 개편 시 적용 시점 (상속개시일 기준)

### 2-2. "연접 시·군·구" 정의

| 후보 | 의미 |
|---|---|
| **직접 인접** | 두 시·군·구 행정 경계선이 직접 맞닿음 |
| **2단계 인접** | 인접 시·군·구의 인접 시·군·구 (1단계 + 2단계) — 가능성 낮음 |
| **광역시·도 내 인접** | 시·도 경계 넘어 연접도 인정? |

**해석례 사전 조사 필요**:
- 국세청 예규·해석례
- 대법원·심판원 판례 (특히 "연접" 정의)

---

## 3. 데이터 인프라 선택지

### 3-1. 선택지 A — 정적 인접 매트릭스 (권장)

행정안전부 또는 통계청 행정구역 인접 데이터를 사전 가공:

```typescript
// lib/geo/administrative-district-adjacency.ts
export const SI_GUN_GU_ADJACENCY: Record<string, string[]> = {
  "서울특별시 강남구": ["서울특별시 서초구", "서울특별시 송파구", ...],
  "수원시 영통구": ["수원시 권선구", "수원시 장안구", "용인시 기흥구", ...],
  // ... 약 250개 시·군·구
};
```

**장점**:
- 외부 API 의존 0
- 응답 속도 즉시
- 캐시·rate limit 불필요
- 행정구역 개편 시 데이터만 갱신

**단점**:
- 데이터 갱신 책임 (연 1회 정도)
- 초기 매트릭스 작성 공수 (약 250 × 5 인접 ≈ 1,250 엔트리)

### 3-2. 선택지 B — 외부 API (Vworld 또는 행정안전부)

행정구역 인접 조회 API 호출:

**장점**:
- 자동 최신화
- 데이터 작성 공수 0

**단점**:
- API 키 추가 환경변수
- Rate limit · 캐시 정책 설계 필요
- 외부 의존 — 장애 시 fallback

### 3-3. 선택지 C — Haversine 50km fallback (임시)

"연접 시·군·구는 대체로 50km 이내"라는 휴리스틱:

**장점**:
- 신규 데이터 0
- 즉시 구현

**단점**:
- 법적 정확성 부족 — 연접이라도 50km 초과 가능 (시·군이 큰 경우)
- 50km 이내라도 연접 아닐 수 있음 (해안선 사이 등)
- **법령 정합성 위반 위험** — KoreanLaw MCP 검증으로 명시 거부 필요

**권장**: 선택지 A (정적 매트릭스) — 법령 정확성 + 외부 의존 회피.

---

## 4. 좌표 → 시·군·구 역지오코딩

### 4-1. 필요성

자산 좌표·거주지 좌표 → 시·군·구 ID 매핑 필요.

```typescript
// 입력: { lat: 37.5665, lng: 126.978 } (서울시청)
// 출력: "서울특별시 중구"
function reverseGeocode(latLng: LatLng): Promise<string | null>;
```

### 4-2. 선택지

| 옵션 | 장단점 |
|---|---|
| **Vworld 역지오코딩 API** | 기존 환경변수 재사용 / rate limit |
| **OpenStreetMap Nominatim** | 무료 / 1초/요청 제한 / 한국 정확도 별도 검증 |
| **카카오 로컬 API** | 무료 / 일일 30,000건 / 별도 키 필요 |
| **정적 행정구역 polygon 데이터** | 외부 의존 0 / 데이터 크기 (~50MB) — 클라이언트 로드 부담 |

**권장**: Vworld API (UI-E1과 동일 키 재사용).

### 4-3. 캐시 정책

- 좌표 → 시·군·구 변환 결과를 `EstateItem.estateDistrict`·`farming.decedentDistrict` 등에 저장
- Vworld API 응답에 시·군·구 정보가 이미 포함되어 있을 가능성 — UI-E1 사전 조사 시 동시 확인

---

## 5. 자동 검증 확장 설계

### 5-1. 신규 필드

```typescript
// EstateItem
estateDistrict?: string;  // "서울특별시 강남구"
fishingAnchorDistrict?: string;  // 어선 선적지 시·군·구

// FarmingInheritanceInput
decedentResidenceDistrict?: string;
heirResidenceDistrict?: string;
```

### 5-2. 자동 검증 로직 확장

`farming-residence-check.ts`:

```typescript
function checkResidenceMatch(
  residenceLatLng: LatLng,
  residenceDistrict: string | undefined,
  assetLatLng: LatLng,
  assetDistrict: string | undefined,
): "same_district" | "adjacent_district" | "within_30km" | "fail" {
  // 1. 시·군·구 동일
  if (residenceDistrict && assetDistrict && residenceDistrict === assetDistrict) {
    return "same_district";
  }
  // 2. 연접 시·군·구
  if (residenceDistrict && assetDistrict) {
    const adjacent = SI_GUN_GU_ADJACENCY[assetDistrict] ?? [];
    if (adjacent.includes(residenceDistrict)) return "adjacent_district";
  }
  // 3. 30km 이내
  if (haversineKm(residenceLatLng, assetLatLng) <= 30) return "within_30km";
  return "fail";
}
```

### 5-3. UI 안내 분기

| 자동 결과 | 카드 |
|---|---|
| same_district | emerald "✓ 동일 시·군·구 거주 (자동)" |
| adjacent_district | emerald "✓ 연접 시·군·구 거주 (자동) — N.Nkm" |
| within_30km | emerald "✓ 30km 이내 직선거리 (자동) — N.Nkm" |
| fail | rose "❌ 3가지 조건 모두 미충족 — N.Nkm" |

---

## 6. 단계별 PR 분할

| Phase | 범위 | 작업량 | 의존 |
|---|---|---|---|
| **Phase 1** | KoreanLaw MCP 검증 + 정적 인접 매트릭스 데이터 수집 | 중(4~6h) | — |
| **Phase 2** | 행정구역 인접 헬퍼 (`lib/geo/administrative-district-adjacency.ts`) + anchor | 소(2h) | Phase 1 |
| **Phase 3** | 역지오코딩 통합 (Vworld API + 캐시) | 중(3~4h) | UI-E1 (Vworld 통합) 완료 |
| **Phase 4** | farming-residence-check.ts 확장 (3가지 OR 조건) + anchor | 소(2h) | Phase 2·3 |
| **Phase 5** | UI ResidenceCheckPreviewCard 4분기 라벨 확장 | 소(1~2h) | Phase 4 + UI-E2 |

**총 12~16시간**. Phase 1이 가장 큰 변동 요인.

---

## 7. 위험 요소

### 7-1. 데이터 정확성

- **행정구역 개편 빈도**: 연 1~2건 정도 (경계 조정·통합·분할). 매트릭스 갱신 책임 명확화 필요.
- **상속개시일 기준 행정구역**: 과거 시점 행정구역 데이터 필요 — 단순화: 최신 데이터만 사용 + 사용자 boolean override 유지.

### 7-2. 좌표 정확성

- 사용자 입력 좌표 vs Vworld 자동 좌표 — 사용자 입력 시 행정구역 변환 실패 가능 → fallback "30km만 자동" 정책 유지.

### 7-3. 법적 해석 불확실성

- **"연접" 정의** — 직접 인접만? 2단계 포함? 해석례 0건이면 보수적으로 직접 인접만.
- **광역시·도 경계 넘는 연접** — 예: 서울 강서구 ↔ 김포시. 사전 조사 필요.

### 7-4. 매트릭스 크기

- 250 시·군·구 × 평균 5 인접 = 1,250 엔트리. JSON으로 약 50KB. 클라이언트 부담 없음.
- gzip 후 약 15KB.

---

## 8. Definition of Done (Phase별)

### Phase 1 (사전 조사)
- [ ] KoreanLaw MCP로 §16②1호나 + 해석례 5건 이상 인용
- [ ] "연접" 정의 합의 (직접 인접만 vs 확장)
- [ ] 행정구역 인접 데이터 출처 확정 (행정안전부 표준 또는 통계청)
- [ ] 광역시·도 경계 OR 정책 확정

### Phase 2 (인접 매트릭스)
- [ ] `lib/geo/administrative-district-adjacency.ts` — 250 시·군·구 인접 데이터
- [ ] `isAdjacentDistrict(a, b)` 헬퍼
- [ ] anchor 10건 (서울 자치구·경기 시·광역시 경계 등)

### Phase 3 (역지오코딩)
- [ ] Vworld 역지오코딩 API 클라이언트
- [ ] 좌표 → 시·군·구 캐시 (영구 또는 24h)
- [ ] EstateItem·FarmingInput에 district 필드 저장

### Phase 4 (자동 검증 확장)
- [ ] `checkResidenceMatch` — 3가지 OR 결과 enum
- [ ] anchor 8건 (same/adjacent/within_30km/fail × decedent·heir)

### Phase 5 (UI)
- [ ] ResidenceCheckPreviewCard 4분기 라벨
- [ ] 자동 결과 사용자 안내 (mirror-pattern 위반 없음)
- [ ] 브라우저 수동 확인

---

## 9. 후속 (본 PRD 범위 외)

- **양도세·재산세 거주지 요건** — 동일 행정구역 매트릭스 재사용 가능 (사업용 토지 §104조의3 등)
- **상속개시일 시점 행정구역 데이터** — 과거 행정구역 변경 이력 추적 (별도 대형 작업)
- **자동 검증 결과를 엔진 입력에 통합** — UI 안내가 아닌 evaluateFarmingEligibility에 자동 boolean 주입
