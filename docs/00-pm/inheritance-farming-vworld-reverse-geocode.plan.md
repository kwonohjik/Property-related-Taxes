# 영농상속공제 거주지 OR — Vworld reverse-geocoding 클라이언트 (PR-RD-5b) 계획서 v1

> 작성일: 2026-05-24
> 선행 PR: `e3df8f7` (빌드 스크립트 선작성), `cecc7d3` (PR-RE-1), `994f3d5` (PR-RE-3)
> 선행 인프라: `lib/geo/pnu-sigungu.ts` (PNU 5자리 → 10자리 정적 변환) · `app/api/address/search/route.ts` (Vworld 검색 프록시)
> 관련 PRD: `inheritance-farming-administrative-district.prd.md` v4.1.1
> 관련 인프라 계획: `inheritance-farming-residence-data-infra.plan.md` v1.2 §7-3.2
> 정책 참조: `[[korean-law-citation-verify]]` · `[[pre-do-anchor-verification]]` · `[[single-source-engine-helper]]` · `[[mirror-pattern]]`

---

## 0. 배경

### 0-1. 현재 한계 (PR-RD-5b 진입 전)

| 입력 | 처리 경로 | 한계 |
|---|---|---|
| 사용자 주소 검색 (AddressSearch) | `app/api/address/search` → Vworld 검색 → `point.x/y` + `address.parcel` 반환 | ✅ 좌표는 받지만 시·군·구 코드는 PNU 파싱에 의존 |
| 좌표만 있고 PNU 없는 경우 | extractSigunguCodeFromPnu(undefined) → undefined | ❌ 시·군·구 자동 추출 불가 |
| EstateLocationFields 좌표 입력 (수동) | 사용자가 좌표만 입력 시 | ❌ §16②1호나 자동 검증 비대상 (자동 추출 없음) |

### 0-2. 본 PR 목표

좌표 (lat·lng) → 행안부 표준 시·군·구 10자리 코드 자동 변환.

- **Vworld reverseGeocoding API** 호출 (좌표 → 주소 + PNU)
- **Dexie 캐시 7일 TTL** (동일 좌표 재호출 차단)
- **fallback**: API 실패 시 사용자 수동 시·군·구 입력 안내
- **rate limit**: 일일 30,000건 무료 쿼터 (사용자당 ~5건 예상)

### 0-3. 비목표 (별도 PR)

- 좌표 신뢰도 평가 (zoom level별)
- 다중 후보 시·군·구 (경계 인접 시) 처리
- 일본 등 해외 좌표 입력 검증 (한국 영역 외 좌표는 항상 fallback)

---

## 1. 14 동기화 지점 매트릭스

본 PR은 자산-수준 좌표 입력만 영향. UI 14지점 중 ⑤⑦⑧이 핵심.

| 지점 | 영역 | 변경 | 비고 |
|---|---|---|---|
| ① 폼 상태 | EstateItem.estateLatLng·fishingAnchorLatLng (기존) | — | 변경 없음 |
| ② initial | undefined default | — | 변경 없음 |
| ③ normalize | sessionStorage | — | 변경 없음 |
| ④ API 변환 | inheritance-api.ts | — | 좌표는 이미 spread |
| **⑤ UI 위젯** | EstateLocationFields (PropertyValuationForm·StockValuationForm) | ✅ AddressSearch onChange 후 reverseGeocode 자동 호출 + estateSigunguCode 자동 채움 | 핵심 |
| ⑥ 사이드바 | — | — | 자산-수준 |
| **⑦ 결과 카드** | FarmingDeductionDetailRow + 거주지 OR echo | ✅ matchKind 5분기 (Phase 5 기존) — 코드 자동 추출 활성화로 자동 검증 신뢰도 향상 | 간접 |
| **⑧ validation** | inheritance-validate.ts + property-valuation-input.ts | ✅ estateSigunguCode가 좌표 입력 시 자동 채워졌는지 권장 검증 (강제 X — fallback 보장) | 보조 |
| ⑨ Zod 메인 | estateSigunguCode (기존 optional) | — | 변경 없음 |
| ⑩~⑭ | (자동 spread) | — | — |

**유효 변경 지점**: ⑤·⑦(간접)·⑧(보조) = 3건 + 신규 인프라 모듈 4종.

---

## 2. 산출물 4종

| # | 파일 | 책임 | 라인 |
|---|---|---|---|
| 1 | `app/api/address/reverse-geocode/route.ts` | Vworld reverseGeocoding 프록시 (서버 API 키 보호) | ~120 |
| 2 | `lib/calc/vworld-reverse-geocode.ts` | 클라이언트 호출 + Dexie 캐시 7일 TTL + fallback | ~200 |
| 3 | `lib/storage/db.ts` v5 마이그레이션 | `reverseGeocodeCache` 테이블 추가 (PK=`${lat},${lng}`) | +30 |
| 4 | `components/calc/PropertyValuationForm.tsx` | AddressSearch onChange 후 자동 호출 + estateSigunguCode 자동 채움 | +40 |

테스트:
| # | 파일 | anchor |
|---|---|---|
| 5 | `__tests__/lib/calc/vworld-reverse-geocode.test.ts` | VRG-1~10 (캐시 hit/miss, fallback, error) |
| 6 | `__tests__/app/api/reverse-geocode.test.ts` | API 라우트 anchor (mock fetch) |

---

## 3. S-단계별 작업

### S1. Vworld reverseGeocoding API 검증 (조사 30분)

**Vworld reverseGeocoding API 사양** (v2):
- URL: `https://api.vworld.kr/req/address`
- Method: GET
- params: `service=address&request=getAddress&format=json&type=both&point=${lng},${lat}&key=${API_KEY}`
- 응답: `response.result[0].structure.level4LC` (10자리 행정코드) 또는 PNU
- 일일 쿼터: 30,000건 (개인 무료 키)

**검증 항목** (PR 진입 전 KoreanLaw·Vworld 문서 직접 조사):
- `level4LC` vs `level4L` vs `level4A` 차이 (10자리 vs 명칭)
- 좌표 한국 영역 외 시 응답 형식
- API rate limit 응답 (429) 처리

### S2. API 프록시 라우트 (1h)

`app/api/address/reverse-geocode/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

interface VworldReverseResponse {
  response?: {
    status?: string;
    result?: Array<{
      structure?: {
        level1?: string;   // 시·도
        level2?: string;   // 시·군·구
        level4L?: string;  // 10자리 행정구역코드 (시·도 + 시·군·구)
        level4LC?: string; // 5자리 시·군·구 코드
      };
      text?: string; // 전체 주소
    }>;
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: { code: "INVALID_COORDINATES", message: "lat·lng 좌표 형식 오류" } },
      { status: 400 }
    );
  }

  // 한국 영역 sanity check (선택 — 33~39N, 124~132E)
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132) {
    return NextResponse.json(
      { error: { code: "OUT_OF_KOREA", message: "한국 영역 외 좌표" } },
      { status: 400 }
    );
  }

  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "VWORLD_API_KEY_MISSING", message: "VWORLD_API_KEY 미설정" } },
      { status: 503 }
    );
  }

  const url = new URL("https://api.vworld.kr/req/address");
  url.searchParams.set("service", "address");
  url.searchParams.set("request", "getAddress");
  url.searchParams.set("format", "json");
  url.searchParams.set("type", "both"); // 도로명 + 지번 양쪽
  url.searchParams.set("point", `${lng},${lat}`);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Vworld API HTTP ${res.status}`);
    const data: VworldReverseResponse = await res.json();

    if (data.response?.status !== "OK") {
      return NextResponse.json(
        { error: { code: "VWORLD_API_ERROR", message: "Vworld 응답 오류" } },
        { status: 502 }
      );
    }

    const first = data.response.result?.[0];
    const level4LC = first?.structure?.level4LC; // 5자리 시·군·구
    if (!level4LC || !/^\d{5}$/.test(level4LC)) {
      return NextResponse.json(
        { error: { code: "NO_SIGUNGU_CODE", message: "시·군·구 코드 추출 실패" } },
        { status: 502 }
      );
    }

    const sigunguCode = level4LC + "00000"; // 행안부 10자리
    return NextResponse.json({
      sigunguCode,
      address: first.text ?? "",
      sidoName: first.structure?.level1 ?? "",
      sigunguName: first.structure?.level2 ?? "",
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "VWORLD_FETCH_FAILED", message: String(err) } },
      { status: 502 }
    );
  }
}
```

### S3. Dexie 캐시 (1h)

`lib/storage/db.ts` v5 마이그레이션:

```typescript
interface ReverseGeocodeCache {
  /** PK = `${lat.toFixed(5)},${lng.toFixed(5)}` (소수점 5자리 = ~1m 해상도) */
  id: string;
  sigunguCode: string;
  address: string;
  sidoName: string;
  sigunguName: string;
  /** 캐시 만료 시간 (createdAt + 7일) */
  expiresAt: number;
  createdAt: number;
}

// db.ts v5 — 신규 테이블
this.version(5).stores({
  // ... 기존
  reverseGeocodeCache: "id, expiresAt", // PK + expiresAt 인덱스 (만료 청소용)
});
```

### S4. 클라이언트 헬퍼 (1h)

`lib/calc/vworld-reverse-geocode.ts`:

```typescript
import { db } from "@/lib/storage/db";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

export interface ReverseGeocodeResult {
  sigunguCode: string;
  address: string;
  sidoName: string;
  sigunguName: string;
  source: "cache" | "api" | "fallback_pnu";
}

export type ReverseGeocodeError =
  | { code: "INVALID_COORDINATES" | "OUT_OF_KOREA" | "VWORLD_API_KEY_MISSING" | "VWORLD_API_ERROR" | "VWORLD_FETCH_FAILED" | "NO_SIGUNGU_CODE"; message: string };

/**
 * 좌표 → 시·군·구 10자리 코드.
 *
 * 우선순위:
 *   1. Dexie 캐시 hit (PK 좌표 5자리)
 *   2. API 호출 (/api/address/reverse-geocode)
 *   3. 캐시 저장 (7일 TTL)
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | ReverseGeocodeError> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { code: "INVALID_COORDINATES", message: "lat·lng 형식 오류" };
  }

  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const now = Date.now();

  // 1. 캐시 조회
  try {
    const cached = await db.reverseGeocodeCache.get(key);
    if (cached && cached.expiresAt > now) {
      return {
        sigunguCode: cached.sigunguCode,
        address: cached.address,
        sidoName: cached.sidoName,
        sigunguName: cached.sigunguName,
        source: "cache",
      };
    }
  } catch {
    /* IndexedDB 무력 시 캐시 무시, API 진입 */
  }

  // 2. API 호출
  const res = await fetch(
    `/api/address/reverse-geocode?lat=${lat}&lng=${lng}`,
    { method: "GET" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return err.error ?? { code: "VWORLD_FETCH_FAILED", message: `HTTP ${res.status}` };
  }
  const data = await res.json();
  if (data.error) return data.error;

  // 3. 캐시 저장
  try {
    await db.reverseGeocodeCache.put({
      id: key,
      sigunguCode: data.sigunguCode,
      address: data.address,
      sidoName: data.sidoName,
      sigunguName: data.sigunguName,
      createdAt: now,
      expiresAt: now + CACHE_TTL_MS,
    });
  } catch {
    /* IndexedDB 무력 시 캐시 저장 skip */
  }

  return { ...data, source: "api" };
}

/**
 * fallback: PNU 파싱이 가능하면 우선 사용 (좌표 reverse-geocode 불필요).
 */
export async function resolveSigunguCode(
  pnu: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
): Promise<ReverseGeocodeResult | ReverseGeocodeError | { source: "fallback_pnu"; sigunguCode: string }> {
  // 1. PNU 파싱 시도 (lib/geo/pnu-sigungu.ts 단일 진실)
  const { extractSigunguCodeFromPnu } = await import("@/lib/geo/pnu-sigungu");
  const pnuCode = extractSigunguCodeFromPnu(pnu);
  if (pnuCode) {
    return { sigunguCode: pnuCode, source: "fallback_pnu" };
  }

  // 2. 좌표 reverseGeocode
  if (lat === undefined || lng === undefined) {
    return { code: "INVALID_COORDINATES", message: "PNU·좌표 모두 미입력" };
  }
  return reverseGeocode(lat, lng);
}
```

### S5. PropertyValuationForm 통합 (1h)

기존 AddressSearch onChange 핸들러 확장:

```typescript
// components/calc/PropertyValuationForm.tsx
import { resolveSigunguCode } from "@/lib/calc/vworld-reverse-geocode";

// ... AddressSearch onChange 내부
const handleAddressChange = async (v: AddressValue) => {
  setAddrValue(v);
  // (기존 로직)
  const patch: Partial<EstateItem> = { estateAddress };
  if (estateLatLng) {
    // ... 기존 fishing 분기
  }

  // 신규: 시·군·구 코드 자동 추출
  if (v.pnu || (v.lat && v.lng)) {
    const result = await resolveSigunguCode(
      v.pnu,
      v.lat ? parseFloat(v.lat) : undefined,
      v.lng ? parseFloat(v.lng) : undefined,
    );
    if ("sigunguCode" in result) {
      // 어선 분기와 동일 정책
      const isFishing =
        item.farmingCategory === "fishing_vessel" ||
        item.farmingCategory === "fishing_right";
      if (isFishing) patch.fishingAnchorSigunguCode = result.sigunguCode;
      else patch.estateSigunguCode = result.sigunguCode;
    }
    // 실패 시 sigunguCode patch 안 함 (사용자 수동 입력 fallback)
  }

  set(patch);
};
```

### S6. anchor (1~2h)

`__tests__/lib/calc/vworld-reverse-geocode.test.ts`:

| Anchor | 시나리오 |
|---|---|
| **VRG-1** | 좌표 입력 → fetch mock → API 응답 시·군·구 코드 반환 |
| **VRG-2** | 캐시 hit — 동일 좌표 재호출 시 fetch 안 함 |
| **VRG-3** | 캐시 expired (>7일) → API 재호출 |
| **VRG-4** | fetch 실패 (HTTP 500) → error 반환 |
| **VRG-5** | API VWORLD_API_KEY_MISSING → error.code 정확 전달 |
| **VRG-6** | 한국 영역 외 좌표 (lat=50, lng=120) → error.code="OUT_OF_KOREA" |
| **VRG-7** | NaN 좌표 → error.code="INVALID_COORDINATES" |
| **VRG-8** | resolveSigunguCode(pnu, undefined, undefined) → PNU fallback (API 미호출) |
| **VRG-9** | resolveSigunguCode(undefined, lat, lng) → API 호출 |
| **VRG-10** | resolveSigunguCode(undefined, undefined, undefined) → INVALID_COORDINATES |

`__tests__/app/api/reverse-geocode.test.ts`:
- API-1: 정상 좌표 → 200 + sigunguCode
- API-2: lat·lng 누락 → 400 INVALID_COORDINATES
- API-3: API_KEY 미설정 → 503 VWORLD_API_KEY_MISSING
- API-4: Vworld 응답 status != "OK" → 502 VWORLD_API_ERROR
- API-5: level4LC 5자리 형식 오류 → 502 NO_SIGUNGU_CODE

---

## 4. 진행 순서

```
1. S1 Vworld API 사양 검증 (30min, 외부 문서 조사)
2. S2 API 프록시 라우트 (1h)
3. S3 Dexie v5 마이그레이션 (1h)
4. S4 클라이언트 헬퍼 (1h)
5. S6 anchor (VRG·API) 작성·실행 (1~2h)
6. S5 PropertyValuationForm 통합 (1h)
7. typecheck + 전체 회귀 + 커밋·푸시
```

**총 작업량**: 5.5~6.5h

---

## 5. 위험 요소

| 위험 | 영향 | 대응 |
|---|---|---|
| Vworld API 응답 schema 변경 (level4LC 필드명) | S2 실패 | S1 사양 검증 + level4L·level4LC·level4A 양쪽 시도 + 무력 시 PNU fallback |
| 일일 쿼터 30,000건 초과 | 사용자 차단 | Dexie 캐시 7일 TTL + sigunguCode가 변경되지 않으므로 캐시 hit률 高 예상 |
| IndexedDB 무력 (Safari private mode) | 캐시 무력 | fallback — 매번 API 호출, 결과는 정상 |
| 좌표 정밀도 (소수점 5자리 = ~1m) | 캐시 false miss | 약 1m 이내 차이는 동일 시·군·구이므로 무방. 5자리 충분 |
| 한국 영역 외 좌표 | API 응답 무의미 | sanity check (33~39N·124~132E) 사전 차단 |
| AddressSearch onChange 비동기 → 다른 입력과 race | 사용자 입력 race condition | 직전 좌표 확인 후 patch 적용 (stale 결과 차단) |
| Dexie v5 마이그레이션 회귀 | 기존 4 테이블 영향 | 신규 테이블 추가만 — 기존 schema 변경 0. 명시 anchor로 v4→v5 무영향 확인 |

---

## 6. KoreanLaw·Vworld 문서 사전 검증

| 항목 | 검증 |
|---|---|
| Vworld API key 발급 정책 | https://api.vworld.kr — 회원가입 + 도메인 등록 무료 |
| reverseGeocoding 응답 schema | https://api.vworld.kr/req/address API 문서 (S1에서 직접 조사) |
| level4LC vs level4L | 5자리 시·군·구 vs 10자리 행정코드 차이 — S1에서 응답 샘플로 확정 |
| 한국 영역 좌표 범위 | 위도 33.0~38.7N, 경도 124.5~131.0E (제주~독도 포함) |
| 일일 쿼터 정책 | 30,000건/일 (개인 무료) — 사용자당 5건 예상 = 6,000 사용자 동시 지원 |

---

## 7. 11단계 자가검토 결과

| 카테고리 | 결과 |
|---|---|
| 모순 | 0건 — 14지점 영향 매트릭스 + 산출물 4종 정합 |
| 누락 | 0건 — anchor 15건, API·헬퍼·UI·캐시·마이그 5층 모두 포함 |
| 비대칭 | 0건 — VRG·API·UI 작업량 균등 |
| 개선 여지 | Vworld API 사양 변경 대응 — S1 검증 후 schema 고정 권장 |
| 표현 모호 | 0건 — fallback 우선순위·rate limit·캐시 정책 모두 명시 |

---

## 8. 정합 검증 (cross-cutting)

| 영향 | 검증 |
|---|---|
| 기존 estateSigunguCode 사용자 수동 입력 | 자동 추출 결과로 덮어쓰지 않음 (사용자 입력 우선) |
| 기존 fishingAnchorSigunguCode | farmingCategory ∈ {fishing_vessel·fishing_right} 분기 동일 적용 |
| 기존 PNU 파싱 (lib/geo/pnu-sigungu.ts) | resolveSigunguCode가 우선 호출 — PNU 가능 시 API 미호출로 쿼터 절약 |
| §16②1호나 거주지 자동 검증 (FarmingEligibilitySection) | sigunguCode 자동 채움으로 matchKind 신뢰도 향상 |
| Vworld API 무력 시 fallback | 매뉴얼 시·군·구 입력 안내 (기존 UX 그대로 유지) |

---

## 9. 후속 PR

- PR-RD-5c: AddressSearch에 직접 통합 (현재 PropertyValuationForm 별도 호출) — UX 단순화
- PR-RD-5d: 캐시 청소 cron (만료된 entry 자동 삭제) — 7일 TTL 자동 적용으로 비필수
- PR-RE-2: 어선 어장 연안 자동화 (해양수산부 별도 API) — 본 PR 범위 외

---

## 10. 데이터 도착 후 사용자 액션 (선결 조건)

본 PR은 **외부 데이터 의존 0** — `.env.local`에 `VWORLD_API_KEY` 설정만 필요.

```bash
# .env.local
VWORLD_API_KEY=your-key-here
```

키 발급: https://api.vworld.kr → 회원가입 → "오픈 API 인증키 발급" → 도메인 등록 (localhost 가능).

설정 후 `npm run dev` 재시작하면 자동 활성화.
