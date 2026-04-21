# 비사업용 토지 판정 로직 전면 개선 — PDF 법정 흐름도 준수 + 소유자 주거 이력 입력 신설

**Release date**: 2026-04-21
**Scope**: `lib/tax-engine/non-business-land/`, `transfer-tax.ts`, API 스키마, UI 결과 카드

## 요약

비사업용 토지 판정 엔진을 **PDF 법정 흐름도 (세법 실무교재 제5절 p.1695~1707)**
와 **현행 소득세법 시행령 §168-6~14** 에 맞추어 전면 재작성하였다.
기존 엔진은 일부 경계 케이스에서 **법령상 비사업용인 토지를 사업용으로 잘못 통과**
시키는 약점이 있었으며, 이를 바로잡는다.

## 주요 변경

### 1. 기간기준 해석 교정 (60% 채택)

- **이전**: 보유기간 기준 ①80% 일괄
- **이후**: §168-6 현행법 — 가·나·다 **모두 해당 시 비사업용**, 즉 **하나라도 미충족이면 사업용 (OR)**
  - ① 직전 3년 중 2년(730일) 이상 사업용
  - ② 직전 5년 중 3년(1,095일) 이상 사업용
  - ③ 전체 보유기간 **60%** 이상 사업용 (2015.2.2. 이전 양도분의 농·임·목만 80% 레거시)
- DB 토글: `DEFAULT_NON_BUSINESS_LAND_RULES.periodCriteriaThresholds.currentThresholdRatio = 0.6`

### 2. 지목별 PDF 흐름도 1:1 구현

| 지목 | 근거 | PDF 흐름 |
|------|------|---------|
| 농지 | §168-8, PDF p.1698 | 재촌·자경 기간기준 → 사용의제 → 도시지역 밖/안 → 편입유예(1년 재촌자경 요건) |
| 임야 | §168-9, PDF p.1700 | 주민등록 필수 재촌 → 공익·사업관련 → 시업중/특수지구 → 도시지역 |
| 목장 | §168-10, PDF p.1702 | 축산업 영위 → 거주·사업관련(지역·면적 면제) → 기준면적 → 도시지역 |
| 주택 | §168-12, PDF p.1704 | 수도권 주·상·공 3배 / 수도권 녹지·수도권 밖 5배 / 비도시 10배 |
| 별장 | §168-13, PDF p.1705 | 비사용기간 기간기준 → **"다른 지목 재판정" REDIRECT** / 농어촌주택 예외 |
| 기타 | §168-11, PDF p.1706-1707 | 나대지 **2%** 간주 → 비종합합산 + 기간기준 → 거주·사업관련 + 기간기준 |

### 3. 소유자 주거 이력 입력 신설

농지·임야 재촌 판정을 위해 **`OwnerResidenceHistory[]` 입력 스키마**를 신설:
- 시·도/시·군·구/읍·면·동 명칭 + 코드 (선택)
- 거주 시작·종료일
- 주민등록 여부 (임야 재촌 필수 요건)

UI 입력 폼(`OwnerResidenceForm.tsx`)은 **후속 PR**에서 추가 예정. 당분간 API 호출 시
`ownerProfile` 미제공이면 기존 `farmerResidenceDistance` 거리 스냅샷 fallback으로 동작.

### 4. 별장 REDIRECT 경로 도입

별장 비사용기간이 기간기준을 충족하면 `action: "REDIRECT_TO_CATEGORY"` 로 반환.
결과 카드에 호박색 배너를 상단에 노출해 실제 용도(주택/기타)로 재입력하도록 안내.

### 5. 무조건 사업용 의제 §168-14 ③ 정밀화

- **③1의2호**: 8년 재촌자경 상속·증여 — 양도 당시 도시지역(주·상·공) 內 제외
- **③3호**: 공익수용 — 고시일 2006.12.31 이전 OR **취득일이 고시일부터 5년 이전**
- **③4호**: 도시지역 內 농지 중 종중(2005.12.31 이전) 또는 상속 5년 이내 양도 추가

### 6. 나대지 간주 임계값 2%

- **이전**: 건물시가표준액 < 토지 × 3%
- **이후**: §168-11 ⑥ 현행 — 건물시가표준액 < 토지 × **2%**

## 사용자 영향

⚠️ 기존에 "사업용"으로 판정되던 **일부 경계 케이스**가 "비사업용 +10%p 중과세·장기보유특별공제 배제"로
전환될 수 있습니다. 특히:
- 전체 보유 60~80% 구간 사업용
- 사용의제 해당이나 기간기준(60%) 미충족
- 도시지역 內 농지 + 편입유예 외
- 기타토지 나대지 간주 2~3% 구간
- 별장 비사용기간이 길어 실제 용도 재입력이 필요한 경우 (REDIRECT)

계산기에서 경계 케이스는 재확인을 권장합니다.

## 파일 구조 (신)

```
lib/tax-engine/non-business-land/
├── index.ts                     # barrel re-export
├── types.ts                     # Input/Output/Rules + OwnerResidenceHistory
├── engine.ts                    # judgeNonBusinessLand() 총괄 4단계
├── period-criteria.ts           # meetsPeriodCriteria() 3기준 OR
├── urban-area.ts                # 지목별 도시지역 판정 + §168-12 배율
├── residence.ts                 # computeResidencePeriods()
├── land-category.ts             # classifyLandCategory()
├── unconditional-exemption.ts   # §168-14 ③
├── farmland.ts                  # judgeFarmland
├── forest.ts                    # judgeForest
├── pasture.ts                   # judgePasture
├── housing-land.ts              # judgeHousingLand
├── villa-land.ts                # judgeVillaLand (REDIRECT 지원)
├── other-land.ts                # judgeOtherLand
└── utils/period-math.ts
```

기존 `lib/tax-engine/non-business-land.ts` 는 **얇은 wrapper**로 전환 (import 경로 불변).

## 테스트

- **신 모듈 유닛 테스트 101 케이스 전원 PASS**
  - period-math 14 / residence 9 / period-criteria 15 / urban-area 15
  - unconditional-exemption 13 / farmland 6 / forest 5 / pasture 5
  - housing-land 6 / villa-land 3 / other-land 6 / engine 4
- **전체 스위트 1,358 PASS** (62 파일, 회귀 없음)
- **기존 `non-business-land.test.ts` (83 케이스) 삭제** — v1 API·80%/3% 해석에 의존해 있어
  신 모듈 테스트로 대체

## 검증

```bash
npx vitest run __tests__/tax-engine/non-business-land   # 101 PASS
npx vitest run __tests__/tax-engine/transfer-tax.test.ts # 95 PASS (회귀)
npm run build                                            # EXIT 0
npx vitest run                                           # 1,358 PASS
```

## Critical Files

- `lib/tax-engine/non-business-land/**` 신규 14개 모듈
- `lib/tax-engine/non-business-land.ts` → wrapper
- `lib/tax-engine/legal-codes.ts` NBL.* 상수 17종 신규
- `lib/api/transfer-tax-schema.ts` `ownerProfile` 선택 필드
- `app/api/calc/transfer/route.ts` + `multi/route.ts` ownerProfile Date 변환
- `components/calc/NonBusinessLandResultCard.tsx` REDIRECT 배너

## 후속 작업 (별도 PR)

- `OwnerType` 12종 도입 (자동 사용의제 트리거 매트릭스)
- `components/calc/OwnerResidenceForm.tsx` UI 입력 폼 신설
- 마법사 Step 조건부 삽입 (`TransferTaxCalculator` / `MultiTransferTaxCalculator`)
- `calc-wizard-store` 주거 이력 상태 + sessionStorage 직렬화
