# [UI 설계] NBL 재촌 판정 — 토지 소재지 자동연동 · 거주지 주소검색 · 재촌 근거 표시

**대상**: `NblSectionContainer.tsx`(토지 소재지) · `ResidenceHistorySection.tsx`(거주지) · NBL 결과 카드
**엔진설계**: `transfer-nbl-residence-judgment.engine.design.md`

---

## 1. 토지 소재지 (작업 1) — 편집가능 + 자동 prefill

현재(`NblSectionContainer.tsx:160-172`)는 빈 `SigunguSelect`. 개선:

```
┌ 토지 소재지 (시·군·구) ──────────────────────── §168의8②·9② ↗ ┐
│  [ 종로구 (11110)            ▼ ]   ← SigunguSelect, 미입력 시   │
│                                     asset 시군구 prefill 표시    │
│  ✔ 양도 물건 소재지 자동 적용 (직접 입력 시 변경)  ← amber 안내  │
│  재촌 판정 — 거주지와 동일/연접/30km 매칭에 사용됩니다.          │
└──────────────────────────────────────────────────────────────┘
```
- prefill 소스: `(asset.acquisitionSigunguCode||"").slice(0,5)` → `lookupSigungu(5).name`. **읽기전용 아님** — 사용자 override 가능.
- 힌트에 "30km" 추가(현재 "동일/연접"만).

## 2. 거주지 주소 조회 버튼 (작업 2) — 항목별

현재(`ResidenceHistorySection.tsx:87`)는 각 이력 항목 `SigunguSelect`만. 개선 — **각 항목마다** 경량 조회 버튼(`NblUrbanZoneCheckButton` 패턴 차용, `address-search.tsx` 무거운 fetchUnits 회피):

```
┌ 거주지 1 ───────────────────────────────────────── [삭제] ┐
│  시작일 [1975-05-24]        종료일 [2023-02-14]           │
│  시군구  [ 주소 검색… 🔍 조회 ]  ← data-testid=            │
│          [ 강남구 (11680)    ▼ ] ← 선택 후 SigunguSelect  │
│                                    반영(2차 코드 직입력)   │
│  ☑ 주민등록 있음                                          │
└──────────────────────────────────────────────────────────┘
```
- 조회 결과: 시군구 5자리 = `pnu.slice(0,5)` 우선 / `resolveSigunguCode.slice(0,5)`. 名 = `lookupSigungu`. 좌표 lat/lng(string) 항목에 저장.
- SigunguSelect는 2차 보조 유지(검색 실패·미수록 대비).

## 3. 결과 카드 — 재촌 근거 (작업 3-b)

NBL 결과에 재촌 인정 시 근거 표시(엔진 result matchType echo):

```
재촌 인정 ✔  — 판정: 직선거리 30km 이내 (실측 27.3km)
             (또는 "동일 시·군·구" / "연접 시·군·구")
```

## 4. 동기화 지점 (UI 측 ①~⑧)
- ① 폼: 거주이력 항목 lat/lng(string) 추가.
- ⑤ 위젯: 토지 prefill·거주지 조회버튼·좌표 저장.
- ⑦ 결과: 재촌 근거 표시.
- ⑧ validate: 좌표 optional(차단 없음).

## 5. E2E (probe 선검증 · e2e/CLAUDE.md)
- testid `nbl-residence-address-search`, `nbl-land-sigungu`(기존).
- 시나리오: 토지 소재지 자동 prefill 표시 → 거주지 조회버튼 동작(좌표 채움) → 비연접+30km 이내 → 재촌 인정 → 사업용 판정.
