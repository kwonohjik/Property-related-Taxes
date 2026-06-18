# 재산세 합산 단위 — 일반구는 시 단위 합산 수정 계획

> 작성 기준: 2026-06-18 · 전 file:line 실측(grep/Read) 완료, 추정 없음.

## 1. 배경 / 버그

종부세 토지분(종합합산·별도합산)의 **재산세 관내 합산 단위(과세권자)** 가 잘못 그룹핑된다.

**법령 원칙**: 재산세는 과세권자(자치단체)별로 합산한다.
- **서울특별시·광역시**: 구가 **자치구**(자치단체) → **구 단위** 합산 (예: 송파구·강남구 별도).
- **도 산하 일반시**: 구는 **행정구(일반구)**, 자치단체 아님 → **시 단위** 합산 (예: 용인시 수지구·기흥구·처인구 = 용인시 하나).
- 군: 군 단위.

**현재 버그**: 엔진이 `jurisdiction` 문자열을 **그대로** 그룹핑 키로 사용
(`comprehensive-land-parcels.ts:82` `key = p.jurisdiction.trim()`). 주소 자동 채움이
일반구를 "용인시 기흥구"로 채우므로(이미지24), 용인시 수지구·기흥구가 **서로 다른 그룹**으로
잘못 분리 과세된다(시 단위로 합산돼야 함).

## 2. 권위 있는 분류 근거 (검증 완료)

`lib/geo/sigungu-code-list.ts` 의 `SIGUNGU_LIST` 가 이미 분류를 보유:
- `kind: "autonomous_district"` — 서울·광역시 자치구 (구 단위) — 예 `{sigunguName:"강남구"}`
- `kind: "general_district"` — 일반시 산하 일반구 (시 단위로 합산) — 예 `{sigunguName:"용인시 기흥구", sidoName:"경기도"}`
- `kind: "city"` / `"county"` — 시 / 군

★ 일반구 `sigunguName`이 자동 채움 포맷("용인시 기흥구")과 **동일** — 분류 정합의 근거.
단 `SIGUNGU_LIST`는 **13개 샘플(general_district 4개)뿐 + 코드 lookup만(이름 인덱스 없음)** —
전국 일반구(수원·성남·안양·안산·용인·고양·부천·청주·천안·전주·포항·창원 등)를 전수 포함하지 않음.
→ 리스트 lookup은 불가. **이름 문자열 규칙**(일반구=항상 "○○시 ○○구")이 메커니즘, 리스트는 분류 정합 참고만(아래 §4-A).

## 3. 현황 (검증된 file:line)

- **그룹핑 2지점** (종합·별도 공용 — `comprehensive-land-adapter.ts:44·71`이 동일 함수 호출):
  - `comprehensive-land-parcels.ts:82` `const key = p.jurisdiction.trim();` (당해 재산세 합산)
  - `comprehensive-land-prior-year.ts:56` `const key = p.jurisdiction.trim();` (직전연도 상당액)
- **무관**: `separate-aggregate-land.ts`는 `jurisdictionCode`(코드 기반, 별도 재산세 계산기) — 이 버그 아님.
- **자동 채움**: `deriveSigunguFromAddress`(`lib/utils/derive-sigungu.ts`) → 현재 "용인시 기흥구" 반환
  (parseAddressRegion 일반구 2단어 결합). LandParcelEditor 시군구 필드에 채움.
- **엔진 입력 타입**: `LandParcelInput.jurisdiction`(types/comprehensive.types.ts:308) 주석
  "재산세 관내 합산 그룹 — trim 동일 = 동일 그룹".

## 4. 변경 지점

### A. 공유 헬퍼 — `resolvePropertyTaxJurisdiction(raw): string`

**`lib/geo/property-tax-jurisdiction.ts` 신규** (행정구역 분류이므로 sigungu-code-list와 같은 lib/geo).
★ 위치 근거(검증): 엔진은 `lib/geo` import 선례 있음(`inheritance-farming-deduction.ts:21`),
**lib/utils import 선례는 없음** → lib/utils에 두면 엔진→lib/utils 신규 교차의존 발생. lib/geo는 leaf(무의존)라
엔진·lib/utils 양쪽이 안전하게 import. **재산세 합산 단위(과세권자)** 로 정규화:

```ts
// "용인시 기흥구" → "용인시" (일반구 → 시). "송파구"·"강남구" → 그대로(자치구). "평창군"·"경기 용인시" → 그대로.
export function resolvePropertyTaxJurisdiction(raw: string): string {
  const s = (raw ?? "").trim();
  const t = s.split(/\s+/);
  if (t.length < 2) return s;
  const last = t[t.length - 1], prev = t[t.length - 2];
  // 마지막이 "구"이고 직전이 "시"(단, 특별시/광역시/특별자치시 제외 = 일반구)면 구를 떼어 시 단위로
  if (/구$/.test(last) && /시$/.test(prev) && !/(특별시|광역시|특별자치시)$/.test(prev)) {
    return t.slice(0, -1).join(" ");
  }
  return s;
}
```

- 규칙 근거: **일반구는 항상 "○○시 ○○구"**(자동 채움 parseAddressRegion 결합) / **자치구는 단일 "○○구"**
  (시도 stripped). 특별시/광역시 가드로 "서울특별시 송파구"(수동) 오축약 방지.
- `SIGUNGU_LIST`의 general_district(시 단위)·autonomous_district(구 단위) 분류와 정합(검증).

### B. 엔진 그룹핑 정규화 (correctness — 단일 진실)

- `comprehensive-land-parcels.ts:82` → `const key = resolvePropertyTaxJurisdiction(p.jurisdiction);`
- `comprehensive-land-prior-year.ts:56` → 동일.
- 효과: "용인시 기흥구"·"용인시 수지구" → 키 "용인시" 동일 그룹. `perJurisdiction` 분해도 "용인시"로 표시.
- 수동/레거시 "용인시 기흥구" 데이터도 자동 정규화(견고성).

### C. 자동 채움 정합 (UX — 필드도 과세권자 표시)

- `deriveSigunguFromAddress`(`lib/utils/derive-sigungu.ts`) 의 `return sigungu`(:22)를
  `return resolvePropertyTaxJurisdiction(sigungu)`로 변경(lib/geo에서 import) + 헤더 주석(:5-6) 갱신.
  → suffix 검증(:21) 통과한 "용인시 기흥구"를 "용인시"로 축약. "송파구"(단일)는 불변.
- 필드가 "용인시"(합산 단위) 표시 → 라벨 "시군구 (재산세 합산)"와 일치.
- 소재지(jibun "공세동 377-1")·필지명에 위치 정보 유지되므로 구 표기 손실 무해.

## 5. 영향 / 회귀

| 테스트·표시 | 영향 |
|---|---|
| 사례10(`서초구`·`송파구` 자치구) | 단일 구 → 미축약 → **무영향** |
| 사례11(`강원 평창군`·`경기 용인시`) | 末 토큰 군/시(구 아님) → 미축약 → **무영향** |
| `derive-sigungu.test.ts:15·23`(`성남시 수정구`·`용인시 처인구` 기대) | → `성남시`·`용인시`로 **갱신 필요** |
| `comprehensive-land-parcel-address.test.tsx:65`(`송파구` 기대) | 단일 토큰 → 미축약 → **무영향**(확인) |
| land 결과뷰 `≪서초구 토지≫`(E2E) | 자치구 → 무영향 |

## 6. 테스트 계획

- **단위(헬퍼)**: `용인시 기흥구→용인시`, `성남시 분당구→성남시`, `송파구→송파구`,
  `서울특별시 송파구→서울특별시 송파구`(가드), `평창군→평창군`, `경기 용인시→경기 용인시`, 빈→빈.
- **엔진 anchor 신규**: 종합합산 `용인시 기흥구` + `용인시 수지구` 2필지 → `perJurisdiction` 1개("용인시")로
  합산되는지(공시지가합·재산세 §122 Min 단위). 별도합산도 동일(공용 함수).
- **derive-sigungu 갱신**: 일반구 기대값 → 시 단위.
- **회귀**: 사례10·11 유지, land E2E 2종 유지(자치구 anchor 불변).
- `npx tsc --noEmit` 0 · `npx vitest run __tests__/tax-engine/comprehensive-land*` · `__tests__/lib/` · 전체 `npm test`.

## 7. 작업 순서 (Do)

1. `resolvePropertyTaxJurisdiction` 헬퍼 + 단위 테스트(Pre-Do anchor: 용인시 케이스 실패 확인).
2. 엔진 2지점 그룹핑 키 정규화(B).
3. `deriveSigunguFromAddress` 적용(C) + derive-sigungu 테스트 갱신.
4. 엔진 anchor(용인시 2필지 1그룹) + 회귀(사례10/11, land E2E).
5. tsc + vitest 전체.

## 8. 리스크 / 주의

- **자치구 오축약 방지**: 특별시/광역시/특별자치시 가드 필수. "서울특별시 송파구"(수동) 미축약 확인.
- **필드 표시 변경**: 자동 채움이 "용인시"로 바뀜 — 기존 "용인시 기흥구" 입력 사용자는 재계산 시 엔진이
  정규화하므로 결과 정확(필드 재입력 불필요).
- **세종/제주 행정시**: 구 없음 → 미축약. 영향 없음.
- **별도합산 standalone 재산세(`separate-aggregate-land.ts` jurisdictionCode)** 는 범위 밖(코드 기반·별도 계산기).
  종부세 토지분만 대상.
- **수동 단일-구 입력 한계**: 사용자가 일반구를 시 없이 "기흥구"만 입력하면 일반구 판별 불가 → 미축약(별도 그룹).
  자동 채움은 "용인시"를 주므로 일반 경로는 정상. 수동 입력 시 시 단위 입력 유도(필드 라벨/hint). 드문 사용자 오입력.
- **헬퍼 위치 = lib/geo** (엔진→lib/geo 선례 有, 엔진→lib/utils 선례 無 — §4-A). lib/utils/derive-sigungu가 lib/geo import.
