# 단순토지 소재지 선택 → 면적(㎡) 자동입력 계획

> 목적: 단순토지(land) 자산에서 소재지·공시가격 조회 시 **필지면적을 자동으로 채워** 수동 입력을 줄인다.
> 작성 기준: **추정 금지**. 코드 인용(file:line)은 실측 확정. 외부 API 필드명은 미검증분을 Phase 0로 분리.

---

## 0. 현황 (실측 확정, 2026-07-01)

| 항목 | 사실 | 근거 |
|---|---|---|
| 면적 입력 | **수동**. 소재지 선택으로 자동 채움 없음 | `StandardPriceInput` area = 사용자 입력 |
| 조회 API 반환 | land은 `price`·`zoneName`·`announcedDate`·`ldCodeNm`만. **면적 없음** | `app/api/address/standard-price/route.ts:275‑282` |
| 토지특성 API 호출 | **이미 호출 중** (`getLandCharacteristics`) — 단, `prposArea1Nm`(용도지역)만 추출하고 **면적은 버림** | `route.ts:269‑272` |
| 배선(plumbing) | **존재**. `StandardPriceInput`에 `area`/`onAreaChange` prop, 단순토지는 `acquisitionArea`↔`onAcquisitionAreaChange` 연결 | `CompanionAcqPurchaseBlock.tsx:631‑632` |
| 공동주택 전례 | 이미 `exclusiveArea: prvuseAr`(전용면적)를 응답에 실어 보냄 → land 면적도 동일 패턴 | `route.ts:297` |

**핵심**: 필요한 데이터(필지면적)를 **이미 부르는 API가 응답에 담고 있을 가능성이 높다**. 추출·배선만 추가하면 됨.

---

## Phase 0 — 면적 필드명 실측 (선행 필수, 추정 금지)

`getLandCharacteristics` 응답의 **면적 필드명을 확정**한다.

- **유력 후보**: `lndpclAr`(필지면적, ㎡) — NED 오픈API 스펙 기준. **단, 본 계획 작성 시점 미검증.**
- **CLI 직접 호출 불가**: Vworld NED 키가 등록 도메인 잠금 → 터미널 curl은 `INCORRECT_KEY`.
- **검증 방법**: `route.ts:270` `charHit` 획득 직후 임시 `console.log(JSON.stringify(charHit))` 삽입 → dev 서버(등록 도메인)에서 실제 지번(예: 화성 동탄구 청계동, 강남 역삼동) `propertyType=land` 조회 → 서버 로그로 실제 키·값 확인.
- **동시 확인**: 지목 '산'(임야)·농지 등도 동일 필드로 면적을 반환하는지, 단위(㎡)·소수 여부.
- 확정된 실제 필드명으로 이후 Phase 진행. (아래 구현은 `lndpclAr` 가정 — Phase 0 결과로 교체)

---

## 1. 구현 (3 지점)

### ① 라우트 — 면적 추출·반환 (`standard-price/route.ts`)
- `NedPriceItem`에 `lndpclAr?: string` 필드 추가(현재 `[key:string]:unknown`이라 런타임엔 이미 존재).
- land 분기(275‑282)에서 `charHit`의 면적 추출:
  ```ts
  const areaRaw = charHit?.lndpclAr;           // Phase 0 확정 필드명
  const area = typeof areaRaw === "string" && areaRaw ? parseFloat(areaRaw) : undefined;
  ```
  응답에 `area`(㎡) 추가. **try/catch 유지** — 면적 실패해도 `price`는 정상 반환(회귀 방지).

### ② 조회 훅 — area 노출 (`lib/hooks/useStandardPriceLookup.ts`)
- 현재 `lookup()`은 **price(number)만 반환**. 응답의 `area`를 호출부에 전달할 경로 추가:
  - 방법 A(권장): `onLookupSuccess` 콜백 payload에 `area` 추가(`{ year, price, area? }`).
  - 방법 B: `lookup()` 반환을 `{ price, area }` 객체로 확장(호출부 다수 → 영향 큼, 비권장).

### ③ 입력 위젯 — 면적 자동 채움 (`StandardPriceInput.tsx`)
- `handleLookup` 성공 시 `isAreaMode` + area 존재하면 `onAreaChange(String(area))` 호출 → 총액 자동 재계산(기존 `handleAreaChange` 로직 재사용).
- **덮어쓰기 정책**(UX 결정 §2): 빈 칸일 때만 채움 vs 조회 시 항상 갱신.

---

## 2. 열린 UX 결정 (착수 전 확인)

1. **트리거 시점**
   - (a) **공시가격 조회 버튼 클릭 시** 면적도 함께 채움 — 이미 클릭하는 동작에 얹음(권장, 최소 변경)
   - (b) 소재지 **선택 즉시** 면적 자동 조회 — 추가 자동 fetch 필요(조회 횟수↑)
2. **덮어쓰기**
   - (a) **면적이 비어 있을 때만** 자동 채움(사용자 수동 입력 보호, 권장)
   - (b) 조회할 때마다 항상 갱신(+ "자동 조회됨" 안내)
3. **적용 범위**
   - `StandardPriceInput`(단순토지·비주거건물 isAreaMode)만? — 단순토지 요청 대응
   - `LandPriceLookupField`(다른 탭 토지 조회, 별도 위젯)도 동일 적용? — 별도 판단

---

## 3. 검증 기준 (완료 정의)
- [ ] **Phase 0**: 면적 필드명 실측 확정 (dev 서버 로그)
- [ ] `npx tsc --noEmit` 0
- [ ] 조회 시 면적 자동 채움 + 총액 자동 재계산 브라우저 확인
- [ ] **회귀**: 면적 조회 실패(필드 부재·임야 등) 시 price 정상 반환
- [ ] E2E: standard-price mock 응답에 `area` 추가 시 기존 스펙 영향 점검

## 4. 범위 밖 / 주의
- 공동주택 전용면적(`prvuseAr`)은 이미 반환 — 이번은 **land 면적만** 신규.
- 겸용주택·다필지·재개발 등 복합 면적은 대상 아님(단순토지 단일 필지 우선).
- 면적은 **취득 당시 면적**과 다를 수 있음(분할·합병) — 자동 채움은 **현재 필지면적** 참고값. 사용자 수정 가능해야 함(§2 덮어쓰기 정책과 연동).
