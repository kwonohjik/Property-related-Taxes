# 재산세 "도시지역 내 소재" 용도지역 자동조회 — 계획서

> 작성일 2026-06-25 · 상태: Plan · 세목: 재산세(property)
> 트리거: 재산세 Step0 "도시지역 내 소재" 토글(지방세법 §112 도시지역분 0.14%)을 사용자가 직접 켜야 하는 불편 → 주소 기반 용도지역 자동조회로 토글 ON을 **제안**.

---

## 1. 배경 · 목적

재산세 기본정보(`components/calc/property/Step0.tsx`)의 **"도시지역 내 소재"** ToggleCard는
지방세법 §112(재산세 도시지역분) 0.14%(1천분의 1.4) 추가 과세 여부를 결정한다.
현재는 사용자가 자신의 부동산이 도시지역인지 직접 판단해 수동 토글해야 한다.

목적: 이미 입력한 **주소(`AddressSearch`)**를 활용해 국토계획법상 **용도지역**을 자동조회하여,
도시지역 계열이면 토글 ON을 **제안**(자동 확정 아님)한다.

**비목적(scope out)**: 토글의 자동 확정·강제 변경. §112 도시지역분의 최종 과세 여부는
"도시지역 中 지방의회 의결 고시 지역" 요건이 남으므로 자동조회만으로 확정 불가(→ §6 법적 한계).

---

## 2. 실측 검증 근거 (2026-06-25, V-World API 직접 호출)

> 정책: 추정 금지·실측 단정(`feedback_pre_anchor_verification`). 아래는 모두 실제 호출 결과.

### 2-1. 사용자 첨부 API(이미지33 `LT_C_LHBLPN`)는 **부적합** — 확정됨

| 검증 | 결과 |
|---|---|
| `LT_C_LHBLPN` 속성 | `[blocktype, zonename, ag_geom]`뿐 — **용도지역 정보 없음** (zonename=사업지구계도, blocktype=계획구역명) |
| PNU 검색(`attrFilter=pnu`) | ❌ `INVALID_RANGE` — 속성에 pnu 없음, 좌표 검색만 가능 |
| 일반 필지 조회(역삼동 좌표) | `NOT_FOUND` — 재개발·택지 등 사업지구 블록만 담음 |

→ **이미지33의 토지이용계획도 레이어로는 도시지역 판정 불가.**

### 2-2. 정답 레이어: `LT_C_UQ111`(국토계획법 용도지역) — 검증 완료

| 좌표(경도 위도) | `uname` 반환값 | 도시지역? |
|---|---|---|
| 역삼동 127.0367 37.5006 | `제3종일반주거지역` | ✅ |
| 해운대 129.1600 35.1630 | `일반상업지역` | ✅ |
| 가평 127.4200 37.7300 | `자연녹지지역` | ✅(녹지=도시지역) |
| 평창 산간 128.5500 37.6200 | `NOT_FOUND` | — (미지정/좌표정밀도) |

- `status: OK` + `result.featureCollection.features[].properties.uname` 으로 용도지역 명칭 정식 반환.
- 다중 feature 반환 가능 — 구버전(`dyear:2000`) + 빈 `uname` 섞임 관측 → 최신 dyear & 비어있지 않은 uname 선별 필요.

### 2-3. 인증 함정 (실측)

- **`domain` 파라미터를 넣으면 `INCORRECT_KEY`** 발생 → req/data API는 domain 제거해야 인증 통과(NED·address와 인증 방식 다름).
- `Referer` 헤더(`VWORLD_DOMAIN`)는 유지.
- `VWORLD_API_KEY`는 동일 키로 data API 호출 가능(별도 활용신청 불요 — 실측 통과).

### 2-4. 재산세 폼 입력 전제 (실측 확인)

- `components/calc/property/Step0.tsx:104` — `AddressSearch` 이미 사용. `shared.ts` FormState에 `jibun`·`road`·`building`·`dong`·`ho` 존재, `isUrbanArea: boolean`(default false).
- ⚠️ **실측 정정**: property `FormState`에는 **`lat`/`lng`/`pnu` 필드가 없고**, `Step0.tsx:106`의 `AddressSearch onChange`도 좌표를 폼에 저장하지 않음(`jibun`·`road`·`building`·`dong`·`ho`만 저장). → **lng/lat 폼 경로는 사용 불가**.
- **좌표 확보 단일 경로(확정)**: `jibun` → 기존 `getcoord`(address API) → 좌표. 실측: `getcoord`가 `point{x:경도 127.0342…, y:위도 37.4996…}`를 **EPSG:4326**으로 반환(status OK). 이 좌표계는 UQ111 `geomFilter=POINT(경도 위도)`와 동일 → 변환 없이 그대로 사용 가능.
- → 폼 필드 변경 **불요**. 입력 소스는 이미 폼에 있는 `jibun` 하나.

---

## 3. 법령 근거

- **지방세법 §112①** (실측 본문 확인): 「국토의 계획 및 이용에 관한 법률」 §6 제1호 **도시지역 中 해당 지방의회 의결을 거쳐 고시한 지역**의 토지·건축물·주택에 과세표준 × **1천분의 1.4** 합산. (§112② 조례로 1천분의 2.3까지 상향 가능 — 본 계획은 기본 0.14% 토글만 다룸)
- **국토계획법 §36** 용도지역 4분류 → 도시지역 매핑 기준(§4 매핑표).
- 법령 상수: `legal-codes/property.ts`의 `PROPERTY` / `PROPERTY_CONST.URBAN_AREA_TAX_RATE` 재사용(신설 불요).

---

## 4. 도시지역 매핑표 (국토계획법 §36 — 확정적)

`uname` 접미사로 판정. enum substring 매칭 금지 정책(`feedback_enum_substring_match_forbidden`) 준수를 위해
**정식 명칭 화이트리스트 + 접미사 보조** 2단 판정 헬퍼로 구현.

| 분류 | uname 예시 | 판정 |
|---|---|---|
| **도시지역·주거** | 제1·2종전용주거지역, 제1·2·3종일반주거지역, 준주거지역 | `urban` |
| **도시지역·상업** | 중심·일반·근린·유통상업지역 | `urban` |
| **도시지역·공업** | 전용·일반·준공업지역 | `urban` |
| **도시지역·녹지** | 보전·생산·자연녹지지역 | `urban` |
| **관리지역** | 계획·생산·보전관리지역 | `non_urban` |
| **농림지역** | 농림지역 | `non_urban` |
| **자연환경보전** | 자연환경보전지역 | `non_urban` |
| 빈값 / NOT_FOUND / 미지정 | `""` · 미관측 | `unknown`(제안 보류, 수동 유지) |

> 주의: **녹지지역은 도시지역에 포함**(직관 반대). 국토계획법 §36①1호 라목.

---

## 5. 설계

### 5-1. 신규 — 도시지역 매핑 헬퍼 (순수 함수)

`lib/geo/land-use-zone.ts`
```ts
export type UrbanAreaVerdict = "urban" | "non_urban" | "unknown";
export function classifyUrbanArea(uname: string): UrbanAreaVerdict
// 화이트리스트(주거/상업/공업/녹지 정식명) + 접미사 보조. 빈값→unknown.
export function pickLatestZone(features: ZoneFeature[]): ZoneFeature | null
// dyear 내림차순 + uname 비어있지 않음 우선 1건 선별.
```
- 단위 테스트 anchor 대상(§7).

### 5-2. 신규 — API 프록시 route

`app/api/address/land-use-zone/route.ts` (기존 `regulated-area`·`standard-price` 패턴 차용)
```
GET /api/address/land-use-zone?jibun={지번주소}   (주 입력 — 폼의 form.jibun)
  ?lat={위도}&lng={경도}                          (선택 — 직접 좌표 전달 시)
응답: {
  uname: string,                    // 대표 용도지역 명칭
  verdict: "urban"|"non_urban"|"unknown",
  suggestUrbanToggle: boolean,      // verdict==="urban"
  allZones: string[],              // 다중 feature 전부(참고)
  source: "vworld_uq111"
}
```
- 처리 순서: jibun → `getcoord`(EPSG:4326 `point{x,y}`) → `LT_C_UQ111` `geomFilter=POINT(x y)` → `pickLatestZone` → `classifyUrbanArea`.
- **좌표계**: getcoord·UQ111 모두 EPSG:4326 → 변환 불요(실측 §2-4).
- `VWORLD_API_KEY` 없으면 500 `VWORLD_API_KEY_MISSING`(기존 컨벤션).
- **domain 파라미터 미부착**(§2-3 함정), `Referer: VWORLD_DOMAIN` 유지, `cache: no-store`.
- 좌표 미확보·NOT_FOUND·빈 uname → `verdict:"unknown"` 200 반환(에러 아님 — 수동 fallback UX).

### 5-3. 클라이언트 mediator

`lib/calc/land-use-zone-lookup.ts` — fetch 래퍼(에러→`unknown` graceful). 호출은 사용자 버튼 1회성이므로 **클라이언트 캐시 생략**(YAGNI).
- ⚠️ **정정**: 기존 `reverseGeocodeCache`(Dexie)는 `sigunguCode` 전용 스키마 → 재사용 불가. 새 테이블은 `db.ts` 버전 마이그레이션을 유발하므로 **도입하지 않음**. `db.ts` 무변경.

### 5-4. UI 연동 (Step0.tsx)

"도시지역 내 소재" ToggleCard 하단에 **"용도지역 자동조회"** 버튼 추가:
- 클릭 → mediator 호출(`form.jibun` 전달).
- `verdict:"urban"` → 안내칩 "용도지역(국토교통부 V-World 참고): 제3종일반주거지역 → 도시지역분 대상 가능성. 적용하려면 토글 ON" + **토글 자동 ON 제안(원클릭 적용 버튼)**.
- `verdict:"non_urban"` → "조회된 용도지역: 계획관리지역 → 도시지역분 비대상으로 보입니다(토글 OFF 유지 권장)".
- `verdict:"unknown"` / 실패 → "자동 판별 불가 — 토지이용계획확인원으로 직접 확인 후 수동 설정".
- 주소 미입력 시 버튼 disabled + `disabledReason`.

---

## 6. 법적 한계 & UX 정책 (강제)

> `feedback_no_silent_apportion_fallback` · `feedback_tax_calculation_principle` · `feedback_no_unfavorable_application_without_legal_basis` 준수.

1. **자동 확정 금지 — "제안"까지만.** §112①은 "도시지역 中 **지방의회 의결 고시 지역**"을 요구. 용도지역=도시지역이어도 지자체 미고시면 비과세 가능. 따라서 토글 자동 강제 변경 금지, 사용자 원클릭 확인으로만 ON.
2. **녹지지역 포함을 안내문에 명시**(사용자 오인 방지).
3. **중립 표현.** "절세/유리" 표현 금지. "도시지역분 대상 가능성"·"확인 권장"의 사실 서술만.
4. **unknown 시 수동 유지.** 빈 응답으로 토글을 끄거나 켜지 않음.

---

## 7. 테스트 anchor

`__tests__/geo/land-use-zone.test.ts` (순수 함수만 — API는 모킹/제외):
- `classifyUrbanArea("제3종일반주거지역") === "urban"`
- `classifyUrbanArea("일반상업지역") === "urban"`
- `classifyUrbanArea("자연녹지지역") === "urban"` ← 녹지=도시지역 회귀 방지 핵심 anchor
- `classifyUrbanArea("계획관리지역") === "non_urban"`
- `classifyUrbanArea("농림지역") === "non_urban"`
- `classifyUrbanArea("자연환경보전지역") === "non_urban"`
- `classifyUrbanArea("") === "unknown"`
- `pickLatestZone([{uname:"",dyear:"2000"},{uname:"제3종일반주거지역",dyear:"2023"}])` → dyear 2023·비어있지 않은 것 선별

E2E(`e2e/property-urban-area-lookup.spec.ts`): 주소 입력 → 자동조회 버튼 → 안내칩 노출 → 원클릭 적용 시 토글 ON. (V-World는 네트워크 모킹)

---

## 8. 8개 동기화 지점 점검

신규 **엔진 필드 추가 0 · 신규 폼 필드 추가 0**(`isUrbanArea`·`jibun` 모두 기존 필드 재사용). 순수 UI 보조 기능:

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | **무변경** — 입력 소스 `form.jibun` 기존 존재, 좌표는 route 내부 getcoord로 도출(폼 저장 안 함) |
| ②③ initial/normalize | **무변경** |
| ④ API 변환 | **무변경**(`isUrbanArea`는 기존 그대로 엔진 전달) |
| ⑤ UI 위젯 | Step0 자동조회 버튼 + 안내칩 (신규 — 유일한 폼 측 변경) |
| ⑥ 사이드바 | **무변경** |
| ⑦ 결과 카드 | **무변경**(도시지역분 표시 기존 유지) |
| ⑧ Validation | **무변경**(`isUrbanArea` boolean, 제약 없음) |

> 핵심: 엔진·Zod·결과·폼 상태·`db.ts` 전부 미변경 → **리스크 최저**. 변경은 신규 route(`land-use-zone`)·순수 헬퍼(`land-use-zone.ts`)·mediator·Step0 버튼 4개 신규 파일/블록에 국한.

---

## 9. 작업 단계 (Phase)

1. **Pre-Do anchor**: `classifyUrbanArea` 순수함수 + §7 anchor 작성·실행(실패 확보). → 매핑표 환류.
2. **헬퍼**: `lib/geo/land-use-zone.ts` 구현 → anchor green.
3. **API route**: `app/api/address/land-use-zone/route.ts` (jibun→getcoord→UQ111, domain 미부착·Referer 유지·unknown graceful).
4. **mediator**: `lib/calc/land-use-zone-lookup.ts` (fetch 래퍼, 캐시 없음).
5. **UI**: Step0 자동조회 버튼·안내칩·원클릭 적용. (폼 필드 변경 없음 — 버튼/칩만 추가)
6. **E2E**: 모킹 spec 1종.
7. **검증**: `npx tsc --noEmit` 0건 · `npm test`(geo) · 브라우저 수동(주소→조회→적용) 또는 미수행 명시.

---

## 10. 범위 제외 (Scope Out)

- §112② 조례 상향세율(0.23%) 자동조회 — 지자체 조례 데이터 부재.
- §112③ 제외 토지(미집행 도시계획시설·개발제한구역 정착물 없는 토지) 자동 판정.
- 지방의회 의결 고시 지역 DB화(도시지역분 과세대상 고시 여부 100% 확정) — 데이터 소스 없음, 향후 과제.
- 부속토지 배율(영 §154⑦ 3/5/10배)과의 연동 — 별개 이슈(`isUrbanArea` deprecated 주석 참조), 본 계획 비포함.
