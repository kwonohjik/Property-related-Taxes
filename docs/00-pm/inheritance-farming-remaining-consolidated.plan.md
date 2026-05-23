# 영농상속공제 잔존 작업 통합 계획서 (v1)

> 작성일: 2026-05-24
> 작성 배경: `inheritance-farming-followup.plan.md` + `inheritance-farming-remaining-prs.plan.md` + `inheritance-farming-administrative-district.prd.md` + `inheritance-farming-residence-data-infra.plan.md` 4개 문서 잔존 항목 통합
> 정책 참조: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[pre-do-anchor-verification]]` · `[[feedback_explicit_prop_mapping_strip]]` · `[[mirror-pattern]]`

---

## 0. 완료 현황 (git 이력 기준, 2026-05-24)

### 0-1. 완료 PR 14건

| PR | 커밋 | 산출 |
|---|---|---|
| F-1·F-2·F-3 토대 | `670bfec` | EstateItem.farmingCategory 8종 + evaluateFarmingEligibility + calcFarmingDeduction + 30억 한도 정정 + Anchor 26건 |
| F-4·F-5·F-6 UI 통합 | `55e22d6` | FarmingCategorySection·FarmingEligibilitySection·결과 카드 5-way 분기 |
| F-7 사후관리 시뮬레이터 | `33f9881` | `/calc/inheritance-postmgmt` 별도 페이지 + §18의3④·§16⑦⑧ 추징 + 정당사유 7종 |
| PR-G 진입 링크 | `0c2ca9c` | 결과 카드 → 사후관리 페이지 querystring 동선 |
| PR-H UI RTL | `f05f7c8` | F-4·F-5·F-6 RTL anchor 12건 |
| PR-D F-9 §16② 단서 | `9412ca1` | corporate 영농상속 후 최대주주 사망 적용 배제 |
| PR-F F-11 자격자 분배 | `4c9cdaf` | §16⑤ 본문 qualifiedHeirIds |
| 부록 A heirAssessments | `f2d75f3` | 상속인별 분리 자격 평가 (FH-1~6) |
| PR-E F-10 거주지 Vworld | `dd7e2fc`·`44a1bfe`·`1e915f1` | Haversine 30km + AddressSearch + 옵션 A 사용자 명시 우선 |
| §16②1호나 Phase 0+0-Fix | `ff93e09` | 거주지 OR 자동 판정 + result echo |
| Phase 5 UI | `3098d95`·`7cf2094` | sigunguCode 자동 추출 + 산림지 단서 토글 + matchKind 5분기 + validate ⑧ |
| Phase 1·2·3 골격 | `2962c02` | PR-1c·PR-3·PR-4a 통합 골격 |
| PR-6 CI cron | `4cda789` | 분기 매트릭스 갱신 cron + PR-1b 데이터 출처 PoC |
| Dialog FE-UI-3·3b | `41e8d4c` | 폐기 확인 RTL anchor |
| 자산 토글 자동 노출 | `55ac865`·`2a513e3` | 영농·가업·§22 카테고리별 OFF default + 펼침 |

### 0-2. 미완료 잔존 분류

| 그룹 | 영역 | 비중 |
|---|---|---|
| **A. F-8 사업무관자산** | 법인 영농 + 가업상속 공통 §15⑤2호·§16⑤2호 5종 자동 차감 | 대 (1~1.5일) |
| **B. 거주지 OR Phase 1·2·3 실데이터** | 행안부 KOEDB 다운로드·SHP 파싱·turf.js 인접 매트릭스 생성·sigunguCode 매핑 | 17~28h |
| **C. 거주지 OR 후속 정밀화** | 마을어업·협동양식업 면허 제외 · 어장 연안 자동화 · agricultural_building·salt_field 좌표 옵션 | 소~중 |
| **D. F-8 cross-cutting** | non-business-land/engine.ts 어댑터 · 가업상속 §18의2 통합 시점 동기 | 의존 대기 |

---

## 1. PR 매트릭스 (잔존)

| PR | Phase | 범위 | 작업량 | 의존 | 우선순위 |
|---|---|---|---|---|---|
| **PR-RC** | F-8 본체 | §15⑤2호·§16⑤2호 사업무관자산 5종 자동 차감 (corporate_stock 자산) | 6~9h | 가업상속 §18의2 (이미 완료 `7ca34dc`) | ★★ |
| **PR-RD-1** | 거주지 OR Phase 1-A | 행안부 KOEDB 법정동코드 다운로드·파싱 + `sigungu-code-list.ts` 생성 | 1~2h | 외부 데이터 PoC | ★★ |
| **PR-RD-2** | 거주지 OR Phase 1-B | KoreanLaw 해석례 조사 5건+ + `docs/03-research/farming-residence-interpretations.md` | 4~6h | KoreanLaw MCP | ★ |
| **PR-RD-3** | 거주지 OR Phase 1-C | SHP 파싱 + turf.js 인접 매트릭스 생성 스크립트 + `administrative-district-adjacency.ts/.json` 산출 | 4~6h | PR-RD-1 | ★★ |
| **PR-RD-4** | 거주지 OR Phase 2 | 인접 매트릭스 모듈 lookup 헬퍼 + 250 시·군·구 단위 검증 | 1~2h | PR-RD-3 | ★★ |
| **PR-RD-5** | 거주지 OR Phase 3 | `extractSigunguCodeFromPnu` lib/geo 이전 + `vworld-reverse-geocode.ts` IndexedDB 캐시 | 4~6h | PR-RD-3 + Dexie | ★ |
| PR-RD-5b | 거주지 OR Phase 3-선택 | Vworld API 클라이언트 + 좌표→sigunguCode 자동 변환 | 2~3h | PR-RD-5 | 후속 |
| PR-RE-1 | 후속 정밀화 | `fishingLicenseExcluded?` 마을어업·협동양식업 면허 제외 보조 필드 | 2~3h | 독립 | ★ |
| PR-RE-2 | 후속 정밀화 | 어선 어장 연안 자동화 (Phase 3+ — 해양수산부 API) | TBD | Vworld 미지원 | TBD |
| PR-RE-3 | 후속 정밀화 | agricultural_building·salt_field 좌표 입력 옵션 b 안내 카드 | 2~3h | EstateLocationFields validate 정책 | ★ |
| PR-RE-4 | 후속 정밀화 | "거주" 정의 주민등록 필수 여부 해석례 반영 (PRD E10) | TBD | KoreanLaw 해석례 | TBD |

**합계 (필수 PR-RC·RD-1·RD-3·RD-4)**: 12~19h
**합계 (전체 PR-RC·RD·RE)**: 30~40h

---

## 2. 진행 권장 순서

```
Phase 1 (즉시 가능, 독립):
  PR-RC (F-8) — 가업상속 §18의2 통합 완료로 공통 헬��� 도입 적기
  ↓
Phase 2 (외부 데이터 의존 그룹, 순차):
  PR-RD-1 (KOEDB) → PR-RD-3 (SHP + 매트릭스) → PR-RD-4 (lookup) → PR-RD-5 (PNU + 캐시)
  PR-RD-2 (해석례 조사) — Phase 2 진입 전 별도 진행 가능
  ↓
Phase 3 (후속 정밀화, 독립):
  PR-RE-1 (어업권 면허 제외) — 가장 짧음, 독립
  PR-RE-3 (좌표 옵션 b) — 독립
  PR-RE-2 (어장 자동화) · PR-RE-4 (거주 정의) — 외부 데이터·해석 미확정, 보류
```

---

## 3. PR-RC — F-8 사업무관자산 자동 차감 (★★ 가장 큰 단일 PR)

### 3-1. 법령 정밀 인용 (KoreanLaw MCP 재검증 필요)

**상증령 §15⑤2호 + §16⑤2호 — 공통 산식**:
```
businessAssets = max(0, totalAssets − sumOfNonBusiness)
adjustedValue = floor(stockValue × businessAssets / totalAssets)
```

**사업무관자산 5종**:
- 가. 비사업용토지 (소득세법 §104조의3)
- 나. 임대부동산 (단서: 국민주택 ≤ 또는 기준시가 6억 ≤ + 5년 무상임대 임직원용 제외)
- 다. 임직원 외 대여금 (단서: 학자금·전세금 제외)
- 라. 과다보유현금 (5년 평균 200% 초과분)
- 마. 영업무관 금융상품 (라 제외)

### 3-2. 신규 데이터 모델

```typescript
// lib/tax-engine/types/corporate-non-business.types.ts 신규 (영농 + 가업 공통)
export interface CorporateNonBusinessAssets {
  nonBusinessLand?: number;
  rentedRealEstate?: number;
  externalLoans?: number;
  excessCash?: number;
  nonOperatingFinancial?: number;
}

// EstateItem 확장
export interface EstateItem {
  // ... 기존
  corporateNonBusinessAssets?: CorporateNonBusinessAssets;
  corporateTotalAssets?: number;
}
```

### 3-3. 핵심 함수 (BigInt 정밀도)

`lib/tax-engine/property-valuation-corporate.ts` 신규 (sibling, 800줄 정책):

```typescript
export function calcCorporateStockAdjustedValue(
  stockValue: number,
  totalAssets: number,
  nonBusinessAssets: CorporateNonBusinessAssets | undefined,
): { adjustedValue: number; sumOfNonBusiness: number; ratio: number };
```

산식:
```typescript
const sum = Object.values(nonBusinessAssets ?? {})
  .reduce((s, v) => s + Math.max(0, v ?? 0), 0);
if (totalAssets <= 0) return { adjustedValue: 0, sumOfNonBusiness: sum, ratio: 0 };
const businessAssets = Math.max(0, totalAssets - sum);
const adjustedBigInt =
  (BigInt(stockValue) * BigInt(businessAssets)) / BigInt(totalAssets);
return {
  adjustedValue: Number(adjustedBigInt),
  sumOfNonBusiness: sum,
  ratio: businessAssets / totalAssets,
};
```

**Number 한계 분석 (이미 검증)**:
- adjustedBigInt ≤ stockValue (ratio ≤ 1) → Number 변환 안전
- 1조 × 1조 = 1e24 BigInt 안전 범위

### 3-4. suggest 헬퍼 갱신

`suggestFarmingAssetValue`·`suggestFamilyBusinessValue` corporate_stock 자산:
```typescript
function getCorporateAdjustedAmount(item: EstateItem): number {
  if (item.farmingCategory !== "corporate_stock" &&
      item.familyBusinessCategory !== "corporate_stock") {
    return getValuatedAmount(item);
  }
  if (!item.corporateTotalAssets) return getValuatedAmount(item);
  return calcCorporateStockAdjustedValue(
    getValuatedAmount(item),
    item.corporateTotalAssets,
    item.corporateNonBusinessAssets,
  ).adjustedValue;
}
```

### 3-5. UI

`components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx` 신규:
- 조건부 렌더: `farmingCategory === "corporate_stock"` OR `familyBusinessCategory === "corporate_stock"`
- 5개 CurrencyInput (가~마) + 1개 totalAssets
- useMemo 비율 미리보기 (`single-source-engine-helper` — calcCorporateStockAdjustedValue 직접 호출)
- amber 안내: "임대부동산 단서·과다현금 5년 평균은 사용자 차감 후 입력"
- 통합 위치: PropertyValuationForm·StockValuationForm 카드, FarmingCategorySection 직후

### 3-6. Anchor (FNB-1~11 + UI 3)

| Anchor | 시나리오 |
|---|---|
| FNB-1 | nonBusinessAssets 0 → adjustedValue=stockValue |
| FNB-2 | 비사업용토지 50% → adjustedValue=stockValue×0.5 |
| FNB-3 | 5종 모두 입력 (합 30%) → 70% 적용 |
| FNB-4 | sumOfNonBusiness>totalAssets → adjustedValue=0 |
| FNB-5 | BigInt 정밀도 — 1조 × 1조 |
| FNB-6 | totalAssets=0 → ratio=0 |
| FNB-7 | nonBusinessAssets undefined → stockValue 그대로 |
| FNB-8 | suggestFarmingAssetValue corporate_stock 자동 차감 |
| FNB-9 | suggestFamilyBusinessValue corporate_stock 동일 (공통 헬퍼) |
| FNB-10 | 음수 입력값 → Math.max clamp |
| FNB-11 | 경계 — 1조 stockValue × 1조 totalAssets · nonBusinessAssets=0 → 1조 (Number 안전) |
| FNB-UI-1 | corporate_stock 미선택 → 컴포넌트 미렌더 |
| FNB-UI-2 | corporate_stock 선택 → 5필드 + totalAssets 노출 |
| FNB-UI-3 | 입력 변경 → 미리보기 useMemo 재계산 |

### 3-7. 위험 요소

- **§104조의3 비사업용토지 판정**: 기존 `lib/tax-engine/non-business-land/engine.ts` (양도세) 어댑터 신규 — 자동 분류는 후속, 본 PR은 사용자 직접 입력
- **나. 임대부동산 단서**: 자동 분류 X, 사용자 차감 입력 강제
- **라. 과다보유현금 5년 평균**: 자동 계산 X, 사용자 직접 입력
- BigInt 곱셈: 안전 (사용자 입력 한계 안에서)

### 3-8. 14지점 영향

| 지점 | 변경 |
|---|---|
| ① 폼 | EstateItem.corporateNonBusinessAssets + corporateTotalAssets |
| ② initial | 자산 카드 default (undefined) |
| ③ normalize | sessionStorage 마이그 — undefined 유지 |
| ④ API 변환 | buildInput 자산 spread에 자동 포함 |
| ⑤ UI 위젯 | CorporateNonBusinessAssetsSection 신규 |
| ⑥ 사이드바 | 변경 없음 (자산-수준) |
| ⑦ 결과 카드 | adjustedValue echo (옵션 — FNB-9 anchor) |
| ⑧ validation | totalAssets ≤ 0 시 차단 안내 |
| ⑨ Zod 메인 | `corporateNonBusinessAssetsSchema` 신규 + EstateItem schema 확장 |
| ⑩~⑭ | 자동 spread |

---

## 4. PR-RD — 거주지 OR Phase 1·2·3 외부 데이터 인프라

### 4-1. 산출물 4종

1. `lib/geo/sigungu-code-list.ts` — 250 시·군·구 행안부 10자리 코드 ↔ 명칭 매핑
2. `lib/geo/administrative-district-adjacency.ts` + `.json` — 250 시·군·구 인접 매트릭스
3. `lib/geo/pnu-sigungu.ts` — `extractSigunguCodeFromPnu` 헬퍼 (FarmingEligibilitySection 내부 함수 이전)
4. `lib/calc/vworld-reverse-geocode.ts` — 좌표 → sigunguCode (IndexedDB Dexie 캐시)
5. `docs/03-research/farming-residence-interpretations.md` — KoreanLaw 해석례 5건+
6. `.github/workflows/matrix-update.yml` — 분기 자동 갱신 cron

### 4-2. PR-RD-1 — Phase 1-A KOEDB 다운로드·파싱 (1~2h)

- 행안부 KOEDB "법정동코드 전체자료" 다운로드 (TXT TAB 구분, 10자리)
- `scripts/build-sigungu-code-list.ts` 신규 — TXT 파싱 → `lib/geo/sigungu-code-list.ts` 생성
- 250 시·군·구 단위 검증 (특별자치시·제주 행정시·자치구 포함, 광역시 일반구 제외)
- anchor: PRD §3-3 데이터 검증 항목

### 4-3. PR-RD-2 — Phase 1-B KoreanLaw 해석례 (4~6h)

**조사 항목** (PRD v4.1.1 E7·E10):
- 산림지 §16⑤1호 다목 "5년 조림" 조건 §16②1호나 적용 여부
- "거주" 정의 — 주민등록 필수 여부
- 산림지 단서 "통상적으로 직접 경영할 수 있는 지역" 범위
- 어선·어업권 후단 "가장 가까운 연안" 구체 적용 사례
- 정당사유 §16⑥7호 "재정경제부령 유사 사유" 시행규칙

산출: `docs/03-research/farming-residence-interpretations.md` 5건+

### 4-4. PR-RD-3 — Phase 1-C SHP + turf.js 매트릭스 (4~6h)

- 공공데이터포털 LSMD_ADM_SECT_RGN Shapefile 다운로드
- `scripts/build-adjacency-matrix.ts` 신규 — turf.js `booleanTouches` 250×250 매트릭스 생성
- 산출: `lib/geo/administrative-district-adjacency.json` (~200KB)
- anchor: 서울 강남구 ↔ 서초구 인접 / 부산 ↔ 강원 비인접 등 10건+

### 4-5. PR-RD-4 — Phase 2 lookup 모듈 (1~2h)

- `lib/geo/administrative-district-adjacency.ts` lookup 헬퍼
- `isAdjacentSigungu(codeA, codeB): boolean`
- anchor: 양방향 대칭성 · 자기-인접 false · 비대칭 차단

### 4-6. PR-RD-5 — Phase 3 PNU + Dexie 캐시 (4~6h)

- `extractSigunguCodeFromPnu(pnu): string` 현재 FarmingEligibilitySection 내부 → `lib/geo/pnu-sigungu.ts` 이전·export
- `lib/calc/vworld-reverse-geocode.ts` — 좌표 → sigunguCode (IndexedDB Dexie 캐시)
- Vworld API 호출은 PR-RD-5b 후속 (별도 클라이언트)

---

## 5. PR-RE — 후속 정밀화

### 5-1. PR-RE-1 — 마을어업·협동양식업 면허 제외 (2~3h)

**근거**: §16⑤마목 단서 (PRD v4.1 D4).

- `EstateItem` 확장: `fishingLicenseExcluded?: boolean`
- UI: fishing_right 선택 시 ToggleCard "마을어업·협동양식업 면허 (영농상속 제외)"
- 엔진: 토글 ON 시 fishing_right 자산을 영농상속재산가액에서 제외
- anchor: FL-1 (면허 미입력 — 포함), FL-2 (면허 ON — 제외)

### 5-2. PR-RE-3 — agricultural_building·salt_field 좌표 옵션 b (2~3h)

**근거**: PRD v4.1 D2 — 영농 무관 카테고리는 거주지 OR 조건 대상 아니나 자산 좌표 입력 안내 필요.

- `EstateLocationFields` 카테고리별 validate 정책
- agricultural_building·salt_field 선택 시 안내 카드 (좌표 입력 선택 사항 + 거주지 OR 자동 검증 비대상)
- anchor: ELF-1 (농업용 건축물 좌표 선택), ELF-2 (염전 좌표 선택)

### 5-3. PR-RE-2·RE-4 — 보류 (외부 데이터·해석 미확정)

- 어선 어장 연안 자동화: 해양수산부 API 조사 필요
- 거주 정의 주민등록 필수 여부: KoreanLaw 해석례 5건 조사 후 결정 (PR-RD-2 종속)

---

## 6. KoreanLaw MCP 재검증 항목

각 PR 진입 전 (`[[korean-law-citation-verify]]`):

| PR | 검증 대상 |
|---|---|
| PR-RC | §15⑤2호 가~마 + §15⑤2호 가. §104조의3 (소득세법) 인용 |
| PR-RD-2 | 산림지 §16⑤1호 다목 + §16②1호나 "거주" 정의 + 산림지 단서 "통상 직접 경영" 범위 |
| PR-RE-1 | §16⑤마목 단서 — 마을어업·협동양식업 면허 제외 본문 |
| PR-RE-3 | §16②1호나 본문 "농지등 3종" 한정 확인 (agricultural_building·salt_field 미포함) |

---

## 7. 위험 요소 통합

| 위험 | 영향 PR | 대응 |
|---|---|---|
| §104조의3 비사업용토지 어댑터 | PR-RC | 본 PR은 사용자 직접 입력. 자동 분류 후속 |
| BigInt 곱셈 큰 자산 | PR-RC | 1조 × 1조 안전 (FNB-5·11 anchor) |
| 행안부 KOEDB 라이선스 | PR-RD-1 | 공공누리 1유형 확인 + 라이선스 명시 |
| turf.js 번들 크기 | PR-RD-3 | 빌드 스크립트만 사용, 런타임 미포함 |
| Vworld API 키 환경변수 | PR-RD-5b | 무력 시 PNU 파싱 fallback |
| Dexie 캐시 무효화 | PR-RD-5 | 매트릭스 매트릭스 hash 변경 시 자동 무효화 |
| 가업상속 §18의2 통합 완료 동기 | PR-RC | 이미 완료 (`7ca34dc`) — 즉시 진입 가능 |

---

## 8. PDCA 다음 단계

1. **PR-RC** 즉시 진입 (가업상속 §18의2 통합 완료 — 공통 헬퍼 적기, 6~9h)
2. PR-RD-2 (KoreanLaw 해석례 조사 4~6h) — 외부 데이터와 병렬 가능
3. PR-RD-1·3·4·5 순차 (Phase 1·2·3, 합 10~16h)
4. PR-RE-1·RE-3 (후속 정밀화, 각 2~3h)
5. PR-RE-2·RE-4 보류 (외부 의존)

**총 예상 작업량**: 30~40h (PR-RE-2·RE-4 제외)

**다음 작업으로 PR-RC 진입 권장** — 가업상속과 공통 사업무관자산 헬퍼 도입은 양 세목 정밀화의 자연스러운 다음 단계.

---

## 9. 11단계 자가검토 결과 (본 통합 계획서)

| 카테고리 | 검토 결과 |
|---|---|
| **모순** | 0건 — 4개 원본 계획서 의존 그래프 추적 후 통합 |
| **누락** | 0건 — git 이력 14건 완료 + PRD v4.1.1 D2·D4 후속 PR-RE-1/3 명시 |
| **비대칭** | 0건 — PR별 anchor 매트릭스 + 14지점 영향 표 일관 |
| **개선 여지** | PR-RC §3-7 위험 요소 — non-business-land 어댑터 후속 PR로 명시 |
| **표현 모호** | 0건 — "후속"·"검토 필요" 모두 작업량·의존·우선순위 명시 |

원본 4개 계획서는 보존. 본 계획서는 잔존 작업 통합 인덱스.
