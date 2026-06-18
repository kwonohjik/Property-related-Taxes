# 토지 필지 모달 — 주소 검색 + 시군구 자동 인식 통합 계획

> 작성 기준: 2026-06-18 · 전 file:line 실측(grep/Read) 완료, 추정 없음.

## 1. 배경 / 문제

토지 필지 모달의 **"공시지가 조회"** 버튼이 비활성이다(이미지20 — "소재지 입력 후 조회 가능합니다").
원인: `LandPriceLookupField`의 조회 활성 조건이 `canLookup = !!jibun && !!effectiveYear`
(`components/calc/inputs/LandPriceLookupField.tsx`)인데, **토지 필지에는 지번 주소(jibun) 입력 경로가 없다**.

- 현재 `LandParcelEditor`는 `jibun={parcel.jibun}`를 `LandPriceLookupField`에 전달만 — `jibun`을 채울 UI가 없어 항상 "".
- 시군구(jurisdiction)도 수동 텍스트 입력.
- 반면 **주택 카드(`PropertyCardEditor:134`)는 `AddressSearch`로 주소 검색 → `jibun` 설정 → 조회 활성**.

→ 토지도 주택처럼 주소 검색을 붙여 ① 조회 활성, ② 주소에서 **시군구 자동 채움**.

## 2. 목표

1. 토지 필지 모달에 `AddressSearch` 추가 → `jibun` 설정 → 당해·직전 **공시지가 조회 활성**.
2. 주소 선택 시 **시군구(jurisdiction) 자동 채움** (주소 문자열 파싱).
3. 시군구는 자동 채움 후에도 **수동 편집 가능**(override).

### 비범위 (Non-goals)

- 엔진·API·결과 무변경 — `jibun`·`jurisdiction`은 기존 필드.
- `jibun`은 **조회 전용**(엔진 미전송 — `comprehensive-api.ts` 변환은 jurisdiction·area·price만 전송).
- 시군구 그룹핑을 **코드 기반으로 전환하지 않음**(현 문자열 키 유지 — §9 충돌 한계 참조).

## 3. 현황 (검증된 file:line)

- `LandParcelEditor`(`components/calc/comprehensive/LandParcelEditor.tsx`):
  시군구 raw `<input>`(jurisdiction) + `LandPriceLookupField`에 `jibun={parcel.jibun}` 전달만(입력 UI 없음).
- `LandParcelForm`(`lib/stores/comprehensive-wizard-store.ts:97-106`): **`jibun: string` 필드 이미 존재**.
- `AddressSearch`(`components/ui/address-search.tsx:64`): `{ value: AddressValue, onChange }`.
  `AddressValue`(`:22`)에 `road`·`jibun`·`building`·`lng`·`lat`·`pnu?`. 주택은 `:281` `value.jibun` 표시.
  - **검증(재검토)**: `handleSelect`(`:169`)이 결과 선택 즉시 `onChange({road,jibun,building,…})` 호출 →
    jibun 즉시 확보. 동/호 `fetchUnits`는 그 **후 async**(`:184`), `UnitSelector`는 `units.length>0`에서만
    렌더(`:317`) → **나대지(토지)는 units 없어 동/호 선택 없음**. 무해.
  - **검증(재검토)**: value↔query 동기화 useEffect(`:92-96`)는 **external이 빈 값일 때만** query를 비움 →
    jibun만 저장해도 query(표시 주소) 보존. **road/pnu 미저장 안전**(우려 해소).
- `parseAddressRegion`(`lib/regulated-area.ts:30`, **비-export**):
  "서울특별시 송파구 …" → `{ sido:"서울특별시", sigungu:"송파구" }`,
  "경기도 성남시 수정구 …" → `sigungu:"성남시 수정구"`(일반구 2단어 결합).
- `LandPriceLookupField:82` `handleLookup` → `/api/address/standard-price?…`(jibun 기반 개별공시지가). `jibun`이면 활성.
- **엔진 그룹핑**(`comprehensive-land-parcels.ts:82`): `key = p.jurisdiction.trim()` — **순수 문자열 키**로 재산세 관내 합산.

## 4. 변경 지점

### A. `parseAddressRegion` export (또는 전용 헬퍼)

- `lib/regulated-area.ts:30` `parseAddressRegion` → **export** (범용 유틸 — 조정대상지역 외 재사용).
- 시군구 추출 헬퍼: `deriveSigunguFromAddress(addr): string | null = parseAddressRegion(addr)?.sigungu ?? null`.
  (LandParcelEditor 또는 작은 공유 util에 배치.)

### B. `LandParcelEditor` — `AddressSearch` 추가 (모달 최상단)

- 시군구/필지명 행 **위에** "소재지 (주소 검색)" 블록 추가:
  ```tsx
  <AddressSearch
    value={{ road: "", jibun: parcel.jibun, building: "", detail: "", lng: "", lat: "" }}
    onChange={(v) => {
      const sigungu = deriveSigunguFromAddress(v.jibun || v.road); // jibun 우선, road fallback
      onUpdate({ jibun: v.jibun, ...(sigungu ? { jurisdiction: sigungu } : {}) });
    }}
  />
  ```
- `jibun` 설정 → 당해·직전 `LandPriceLookupField` **"공시지가 조회" 자동 활성**(기존 컴포넌트, 추가 작업 없음).
- 시군구 `<input>`은 **유지**(자동 채움 + 수동 편집). data-testid `land-${kind}-parcel-jurisdiction` 보존.
- `road`/`pnu`는 `LandParcelForm`에 없음 → **저장 안 함**(jibun만 — 조회·표시 충분).
  모달 재오픈 시 `AddressSearch` query는 `value.jibun`으로 init(`address-search.tsx:65` 확인).

### C. 시군구 자동 채움 정책

- 주소 선택 시 `jurisdiction = sigungu`(예: "송파구") — placeholder "예: 서초구" 포맷과 일치.
- 빈 sigungu(파싱 실패)면 jurisdiction 덮어쓰지 않음(`...(sigungu ? {…} : {})`).
- 주소 재선택 시 jurisdiction override(주소 우선 — 자연스러움). 이후 수동 편집 가능.

## 5. 7 동기화 지점 (UI 전용)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `LandParcelForm`(jibun·jurisdiction 기존) | 무변경 |
| ② initial | `addLandParcel` 신규 필지 jibun:"" | 무변경 |
| ③ normalize | 무변경 |
| ④ API 변환 | `comprehensive-api.ts:346-358` toParcels — **검증 완료: jurisdiction·name·area·shareRatio·price만 map, jibun 미포함**. 엔진 `LandParcelInput`(types:306)에도 jibun 필드 없음 | 무변경 |
| ⑤ UI 위젯 | **AddressSearch 추가** | **변경**(B) |
| ⑥ 사이드바 | N/A(종부세 마법사 사이드바 없음 — 직전 작업서 확인) |
| ⑦ 결과 카드 | 무변경 |
| ⑧ Validation | `landParcelSchema.jurisdiction = z.string().min(1)`(comprehensive-input.ts:339) **필수 유지** — 자동 채움이 충족 보조, **수동 입력이 안전망**(파싱 실패 시 사용자 입력). 무변경 | 무변경 |

## 6. 테스트 계획

- **단위**: `deriveSigunguFromAddress` — "서울특별시 송파구 …"→"송파구", "경기도 성남시 수정구 …"→"성남시 수정구",
  빈 문자열→null. (`parseAddressRegion` export 후.)
- **RTL**: `AddressSearch`를 **`vi.mock`** 으로 스텁(클릭 시 `onChange({jibun:"서울특별시 송파구 …", road, …})` 호출하는
  버튼 렌더) → `LandParcelEditor`에서 클릭 시 `onUpdate`가 `{jibun, jurisdiction:"송파구"}`로 호출되는지 검증.
  (AddressSearch의 onChange는 내부 `handleSelect`만 호출 → 외부 직접 트리거 불가하므로 모듈 mock이 정석. Vworld 비의존.)
- **E2E**: 주소 검색은 Vworld 외부 API 의존 → **신규 E2E에서 실검색 안 함**.
  기존 사례10 E2E(`comprehensive-land-payable-calc.spec.ts`)는 **시군구 수동 입력 유지**(주소 검색 없이도 동작)
  → 회귀 없음 확인(주소 검색은 additive, jurisdiction 수동 경로 보존).
- `npx tsc --noEmit` 0 · `npx vitest run __tests__/…/comprehensive-land*` · 전체 `npm test`.

## 7. 작업 순서 (Do)

1. `parseAddressRegion` export + `deriveSigunguFromAddress` 헬퍼 — 단위 테스트 anchor.
2. `LandParcelEditor`에 `AddressSearch` 배선(B) + 시군구 자동 채움(C).
3. RTL(주소 선택 → onUpdate) + 단위 테스트.
4. tsc + 종부세 land vitest + 기존 land E2E(수동 입력 회귀) 통과.
5. 브라우저 수동 확인(주소 검색 → 조회 활성 → 시군구 자동) 또는 E2E 통과로 충족.

## 8. 800줄 정책

`LandParcelEditor` 현재 ~100줄 + AddressSearch 블록(~15줄) → ~115줄. 위반 없음.

## 9. 리스크 / 주의

- **Vworld 외부 API 의존** — `AddressSearch` 실검색은 E2E 불안정 → RTL `onChange` 직접 트리거로 로직 검증,
  E2E는 기존 수동 입력 흐름 유지(주소 검색 additive). [[feedback_browser_verify_with_playwright]] 범위 내.
- **동명 시군구 그룹핑 충돌**(예: 서울 중구 ↔ 부산 중구) — 엔진이 `jurisdiction.trim()` 문자열 키로 그룹핑
  (`comprehensive-land-parcels.ts:82`)하므로 bare "중구" 자동 채움 시 이론상 오그룹. **현 수동 입력도 동일 한계**
  (pre-existing). 사용자 수동 편집으로 해소 가능. 시도 포함(`서울특별시 송파구`)·코드 기반 그룹핑은 별도 scope.
- **자동 채움 override** — 주소 재선택 시 수동 시군구를 덮어씀(주소 우선 의도). 파싱 실패 시 미변경.
- **jibun만 저장**(road/pnu 미저장) — 조회·표시 충분. 재오픈 시 query는 jibun으로 init, useEffect는
  external 빈 값일 때만 리셋(`address-search.tsx:65·92-96`) → 표시 보존 **확인 완료**.
- `jibun` 엔진 미전송(조회 전용) — toParcels(`comprehensive-api.ts:346-358`)·`LandParcelInput`(types:306)에
  jibun 부재 **검증 완료**(§5 ④). 추가 확인 불요.
- **기존 land E2E 회귀** — `comprehensive-land-payable-calc`·`comprehensive-land-only-zero-house`는 jurisdiction을
  testid 직접 입력(수동). AddressSearch 추가는 별도 input(testid 비충돌)이라 영향 없을 것 → Do 후 **두 E2E 재실행**으로 확정.
