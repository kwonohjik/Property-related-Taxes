# __tests__/tax-engine/ — 세금 엔진 테스트

DB 없이 Mock `TaxRatesMap` 으로 순수 엔진 검증. vitest + jsdom.

## 디렉터리 구조

```
__tests__/tax-engine/
├── _helpers/
│   ├── mock-rates.ts          # 양도세 공용 Mock 세율 + baseTransferInput 팩토리
│   └── multi-house-mock.ts    # 다주택 중과세 공용 Mock + makeHouse 팩토리
├── {tax-type}/                # 시나리오별 분할 디렉터리 (큰 테스트 파일)
│   ├── basic.test.ts          # 기본 계산
│   ├── multi-house-and-nbl.test.ts
│   ├── reductions-and-exempt.test.ts
│   ├── edge-and-overlap.test.ts
│   └── integration.test.ts
├── non-business-land/         # 엔진 서브모듈별 대응 테스트 (14 파일)
│   ├── engine.test.ts / farmland.test.ts / forest.test.ts / ...
│   └── qa-{period-criteria,land-type-flow,integration}.test.ts
├── multi-house-surcharge/     # 시나리오별 분할
│   └── {basic-exclusion,suspension-and-multi,special-exclusions,utilities-and-2house}.test.ts
└── {single-topic}.test.ts     # 작은 주제 (transfer-tax-penalty, pre-1990-land-valuation 등)
```

## 시나리오별 분할 원칙

테스트 파일이 **1,500줄 초과** 또는 `it()` **50개 초과** 시 분할:

1. **디렉터리 생성**: `{tax-type}/`
2. **시나리오별 파일**: 평균 400~600줄 목표
3. **공용 Mock/헬퍼 추출**: `_helpers/` 로 이동 (makeHouse, baseTransferInput, LONG_TERM_RENTAL_RULES_MOCK 등)
4. **공통 imports 중복 허용**: 각 파일이 필요한 타입/함수만 import (`import type` 는 erase 되므로 번들 영향 없음)
5. **원본 파일 삭제**: 분할 후 원본 제거로 중복 실행 방지

참고 패턴: `transfer-tax/` (2,756→5 파일), `multi-house-surcharge/` (2,095→4 파일).

## Mock 공유 헬퍼

### `_helpers/mock-rates.ts`

```ts
makeMockRates(overrides?): TaxRatesMap              // 기본 양도세 세율 (2024년 8구간)
makeMockRatesWithHouseEngine(): TaxRatesMap         // + 주택 수 산정 배제 + 조정지역 이력
baseTransferInput(overrides?): TransferTaxInput     // 기본 단건 입력 (1주택 5억→3억, 5년 보유)
makeHouseInfo(id, overrides?): HouseInfo            // 주택 1채 팩토리 (수도권 아파트 3억)
LONG_TERM_RENTAL_RULES_MOCK                         // 장기임대 V2 엔진 Mock 규칙
```

### `_helpers/multi-house-mock.ts`

```ts
defaultRules: HouseCountExclusionRules              // 상속 5년·임대·1억 저가 배제
mockRegulatedHistory: RegulatedAreaHistory          // 서울 종로·강남 지정·해제 이력
suspensionActive / suspensionNone                   // 유예 활성/해제 상태
makeHouse(id, overrides?): HouseInfo
makeInput(houses, overrides?): MultiHouseSurchargeInput
```

## 테스트 작성 규칙

- **경계값 테스트 필수**: 유예 만료일(2026-05-09) 전후, 12억 비과세 경계, 1년/2년 보유 경계, 윤년 취득일 등.
- **PDF 예시값 상수화** (회귀 방어 패턴): 교재·국세청 집행기준 예제의 산출세액은 **원 단위까지 `toBe()`로 고정**. 예: `expect(result.calculatedTax).toBe(91_372_154)`. 반올림 `toBeCloseTo` 사용 시 세법 계산 오류를 놓친다.
- **역사적 과세 데이터**: 토지등급가액 등 개정 없는 역사 확정 데이터는 DB 대신 `lib/tax-engine/data/*.ts` 정적 상수 사용.
- **회귀 테스트 태깅**: 버그 수정 시 describe 이름에 `P0-2 회귀` 등 식별자 포함 → `it("미등기 LTHD 배제 회귀 (P0-2)")`.
- **시나리오 파일당 하나의 주제**: 파일명과 describe 제목이 일치해야 회귀 발생 시 원인 추정 쉬움.

## 단일 테스트 실행

```bash
npx vitest run __tests__/tax-engine/transfer-tax/basic.test.ts         # 단일 파일
npx vitest run __tests__/tax-engine/transfer-tax/                       # 디렉터리
npx vitest run -t "T-01"                                                # 이름 패턴
npx vitest __tests__/tax-engine/transfer-tax/basic.test.ts              # watch 모드
```

## 엔진 수정 시 회귀 확인 순서

1. 수정한 엔진의 **직접 테스트 디렉터리** 먼저: `npx vitest run __tests__/tax-engine/{tax-type}/`
2. 통합 테스트: `npx vitest run __tests__/tax-engine/{tax-type}/integration.test.ts`
3. 연동 세금 테스트 (예: 재산세 수정 시 종부세): `npx vitest run __tests__/tax-engine/comprehensive-*.test.ts`
4. 전체 회귀: `npm test` (최종)

**회귀 허용치 0**: 이 프로젝트는 세법 계산 정확성이 핵심이므로 어떤 상황에서도 녹색이 깨지면 안 됨.
