# 주택부수토지 §168-12 배율 — 수도권 여부 미입력 불리 default 차단 (B6)

**대상 결함**: 양도세 엔진감사 B6 — 주택부수토지 비사업용 판정 시 `isMetropolitanArea`
미입력이면 엔진이 **수도권(불리)** 배율로 조용히 산정.
**작성일**: 2026-07-03. **상태**: Plan. **규모**: 소(validate 1지점 — 엔진·UI·필드 무변경).

---

## 1. 배경 — §168-12 주택부수토지 배율

주택부수토지의 사업용 허용면적 = 정착면적 × 배율. 배율(`getHousingMultiplier`):
- 도시지역 外: **10배** (수도권 여부 무관)
- 도시지역 內 수도권: 주·상·공 **3배** / 녹지·기타 5배
- 도시지역 內 수도권 밖: **5배**

허용면적이 클수록(배율↑) 비사업용 초과분이 작아 **납세자 유리**. 즉 수도권 주·상·공 3배가 최불리.

## 2. 현황 (실코드 검증 — file:line)

| 지점 | 사실 |
|---|---|
| 엔진 default | `non-business-land/housing-land.ts:62-66` — `input.isMetropolitanArea === undefined`이면 `isMetropolitan = true`(수도권) + warning push. **불리 방향 default**(주석 60행 "납세자에게 불리한 쪽 적용") |
| 배율 의존성 | `urban-area.ts:getHousingMultiplier` — isMetropolitan은 **urban 주·상·공 zoneType에서만** 결과 변경(3배 vs 5배). 녹지·기타 도시(5=5)·도시 外(10=10)는 **수도권 여부 무관 동일** |
| 판정 진입 | `engine.ts:107` — category `"housing"`에서 `judgeHousingLand` 호출. UI nblLandType **"housing_site"** → `form-mapper.ts:68` raw cast → `classifyLandCategory` → category "housing" 매핑. (별개: `engine.ts:113` villa REDIRECT — §6 참조) |
| 소스 매핑 | `form-mapper.ts:122-124` — `nblIsMetropolitanArea` "yes"→true / "no"→false / else→**undefined** |
| UI | `components/calc/transfer/nbl/HousingLandDetailSection.tsx` — "수도권 여부" 라디오(yes/no) **이미 존재**(FieldCard) |
| validate | `transfer-tax-validate-nbl.ts:validateNblDetailedJudgment` — nblLandType·nblZoneType·면적 검증하나 **nblIsMetropolitanArea는 미검증** → 미선택 시 엔진 수도권 default 도달 |

### 근본 원인 + 정책
UI에 필드는 있으나 **필수가 아님** → 미선택 시 엔진이 조용히 수도권(불리) 적용.
프로젝트 정책 `feedback_no_unfavorable_application_without_legal_basis`(명문부재=유리 default)·
"미입력은 검증 오류로 차단, 자동 fallback 금지"(CLAUDE.md) 위반. 엔진 default는
납세자 불리 방향이며 법적 근거 없이 선택됨.

## 3. 설계 — validate-only (엔진·UI·필드 무변경)

**엔진의 보수적 default는 안전망으로 유지**(순수 계산은 차단 불가). validate가 **계산 전 차단**해
불리 default 도달을 막는다(자경 #20·§77 fallback과 동형 패턴).

**over-blocking 방지 — isMetropolitan이 실제 결과를 바꾸는 경우로만 한정**:
`nblLandType === "housing_site"` **且** `nblZoneType`가 urban 주·상·공
(`isUrbanResidentialCommercialIndustrial` 엔진 헬퍼 재사용) **且** `nblIsMetropolitanArea` 미선택 → fail.
- 녹지·기타 도시·도시 外·비-주택부수토지는 수도권 여부와 무관하므로 **차단 금지**(모순 방지).

## 4. 배선 (DoD — ⑧ 1지점)

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ⑧ | validate | `lib/calc/transfer-tax-validate-nbl.ts` `validateNblDetailedJudgment` | **`if (nblExempt) return null`(34행) 이후**에 조건부 fail 추가 — 무조건 의제(§168의14③) 자산은 지목·배율 판정 자체를 건너뛰므로 수도권 검증도 skip(over-blocking·모순 방지). |
| — | 헬퍼 재사용 | `isUrbanResidentialCommercialIndustrial` from `non-business-land/urban-area.ts` | import(신규 판정함수 재정의 금지 — `single-source-engine-helper`) |

```ts
// (의사코드) nblZoneType 검증 직후
if (
  asset.nblLandType === "housing_site" &&
  isUrbanResidentialCommercialIndustrial(asset.nblZoneType as ZoneType) &&
  !asset.nblIsMetropolitanArea
) {
  return `${label}: 주택부수토지 도시지역 주·상·공은 수도권 여부에 따라 배율이 달라집니다(수도권 3배 / 수도권 밖 5배). 수도권 여부를 선택하세요.`;
}
```

**엔진(`housing-land.ts`) 무변경** — default+warning 안전망 유지. UI(`HousingLandDetailSection`) 무변경 — 필드 기존재.

## 5. 검증 (anchor)

validate(`transfer-tax-validate-nbl.ts`):
- housing_site + urban 주거(general_residential 등) + 수도권 미선택 → **fail**.
- housing_site + urban 주거 + 수도권="yes"(또는 "no") → pass.
- housing_site + **녹지**(green) + 미선택 → pass(수도권 무관, 차단 금지).
- housing_site + **도시 外**(agriculture_forest 등) + 미선택 → pass.
- **farmland**(비 주택부수토지) + 미선택 → pass.
- **villa_land** + urban 주거 + 미선택 → pass(§6 redirect edge — 조건부라 housing_site 한정).
- housing_site + urban 주거 + 미선택 + **무조건 의제(§168의14③)** → pass(의제라 배율 판정 skip — 삽입 위치 nblExempt 이후).

## 6. 리스크·경계

- **villa_land → housing REDIRECT edge** (accepted limitation): `engine.ts:113` — 별장(villa)이 비사용기간 기간기준 충족 시 주택부수토지로 재분류되어 `judgeHousingLand`(isMetropolitan 사용) 경로를 탄다. 이 재분류는 **런타임 판정(비사용기간)에 조건부**라 validate가 정밀 미러 불가 → housing_site로만 한정하고 villa_land redirect edge는 **엔진 warning 안전망**에 위임(over-blocking 회피). 실무 빈도 극소.
- **over-blocking**: zoneType이 녹지/비도시일 때 차단하면 무의미 입력 강요 → 반드시 urban 주·상·공 한정.
- **nblZoneType ↔ ZoneType 정합**: ✅ 확인 완료 — `NblSectionContainer.tsx` ZONE_TYPE_OPTIONS 값(general_residential·agriculture_forest 등)이 `ZoneType` 문자열과 일치. `as ZoneType` 캐스팅 안전.
- **정책 부합**: 불리 default 차단은 유리-default 정책과 정합. 엔진 안전망은 비-route 호출자(테스트) 방어로 유지.
