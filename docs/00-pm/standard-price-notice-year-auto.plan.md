# 공시연도 자동 선택 — 상속개시일·증여일 기준 기본값 + 실제 고시일 검증

> 작성일: 2026-05-26 · 상태: Plan 확정(3차 재검토 반영), Do 대기
> 요청: 공시일과 상속개시일(증여일)을 비교하여 해당 시점에 적용되는 공시연도를 기준시가 입력 기본값으로 자동 설정.

## 1. 배경 / 문제

상속·증여 재산평가 화면(`PropertyValuationForm`)의 부동산 자산 카드 "기준시가" 영역에서,
공시연도 select 기본값이 **상속개시일·증여일과 무관하게 오늘 날짜 기준**으로 계산된다.
원인은 **prop 단절** — `PropertyValuationForm`이 기준일(`deathDate`/`giftDate`)을 받지 않아
`StandardPriceInput`에 `referenceDate=""`로 호출 → 항상 오늘 날짜 fallback.

## 2. 방향 결정 이력 (3차 재검토)

| 검토 | 후보 | 결론 |
|---|---|---|
| 1차 | prop 연결 | 토지도 `StandardPriceInput` 사용 확인 → 4지점 경유로 단순화 |
| 2차 | 고정 cutoff vs 연도별 실측 테이블 | 고시일 연도별 변동 지적 → 정밀도 필요 인정 |
| 3차 | 실측 테이블 vs **API pblntfDe** | **전 연도 실측 비현실 실증** → API 실제 고시일 활용으로 전환 |

### 3차 재검토에서 실측 테이블을 폐기한 근거
- **데이터 확보 불가 실증**: 2015~2019 공동주택 공시일조차 일반 검색 미확보. "추정 인용 금지" 정책상 미검증 값 등재 불가 → 테이블이 사실상 fallback 덩어리가 됨.
- **단일 고시일 모델의 법리 부정확**: 공동주택 공시기준일 = 정기분 1.1 **+ 추가분 6.1**(신축). 개별공시지가 공시일은 제도 변경으로 시대별 상이 → "연도당 1개 고시일" 모델로 표현 불가.
- **더 나은 출처가 이미 존재**: NED API가 **자산별 실제 공시일자 `pblntfDe`** 반환(`route.ts:203,267,281`). 하드코딩보다 정확(주소별 실측)·유지보수 0·추정 없음.
- **원 요청 범위**: "양도세 동일 이식"의 본질은 prop 연결. 양도세도 고정 cutoff(`recommendLandPriceYear`)이므로 실측 테이블은 원 요청 초과.

## 3. 검증 완료 사실 (코드 대조)

- `StandardPriceInput` `useEffect`(`:82-88`)가 `referenceDate` 변경 시 `setYear(getDefaultPriceYear(...))` 자동 갱신. `setYear`는 `useState` setter → 무한루프 없음.
- `getDefaultPriceYear`(`useStandardPriceLookup.ts:39`) = 주택 `0429`·토지 `0531` **고정 cutoff** (양도세와 동일 수준의 근사 — 기본값으로 유지).
- `PropertyValuationForm`은 토지·건물·아파트 전부 `StandardPriceInput` 단일 처리(`:159,165-168,383`). `LandPriceLookupField` 미사용.
- `useStandardPriceLookup`은 **이미 `announcedLabel`** ("공시일 : YYYY.M.D." 한국어 라벨)을 생성·반환(`:93,115`). 단 `StandardPriceInput`(`:78`)이 destructure하지 않아 **화면 미표시**.
- 개별주택가격은 API에서 `pblntfDe` 없을 시 `stdrYear+"0429"` **추정**(`route.ts:300-301`) → 경고 시 신뢰도 구분 필요. 공동주택·토지는 실측 `pblntfDe`.
- `StockValuationForm`은 이미 `valuationDate={form.giftDate}` 사용 → 동일 prop명 통일 타당.

## 4. 작업 (Phase)

### Phase A — 상속·증여 prop 연결 (원 작업)
| 파일 | 변경 |
|---|---|
| `components/calc/PropertyValuationForm.tsx` | `PropertyValuationFormProps`·`ItemEditorProps`에 `valuationDate?: string` 추가 / 메인 시그니처·`items.map`(`:694`) 전달 / `StandardPriceInput`(`:383`)에 `referenceDate={valuationDate}` |
| `components/calc/inheritance/steps.tsx:110` | `valuationDate={form.deathDate}` |
| `components/calc/GiftTaxForm.tsx:376` | `valuationDate={form.giftDate}` |

→ 기본값: 상속개시일·증여일 기준 cutoff 추정. 미입력 시 오늘 날짜 fallback(회귀 없음).

### Phase B — 실제 고시일(pblntfDe) 노출 + 경계 경고
- `StandardPriceInput`에서 `announcedLabel` destructure → 조회 결과(`msg`) 아래 **실제 공시일 표시**.
  (취득세·재산세 등 모든 사용처에 동일 노출 — 추가 정보이므로 회귀 아님)
- **경계 경고**: `referenceDate` 존재 + 조회 완료 시, 조회된 가격의 실제 고시일이 평가기준일보다 **늦으면**(= 평가기준일 시점 미고시) 경고:
  > "평가기준일 시점에 {Y}년 공시가격은 아직 고시 전이었습니다. 직전 연도를 확인하세요."
  - 실측 데이터 없이 **한 번의 조회로 과대선택을 정확히 검증** (인접연도 조회 불요).
  - API 추정 고시일(개별주택 fallback)인 경우 경고 톤 완화 또는 "추정" 명시.
- 기준일 미입력(취득세 일부 경로 등) 시 경고 생략.

### Phase C — 테스트·검증
- prop 연결 anchor: 상속개시일·증여일 → 카드 연도 자동 표기, 미입력 fallback.
- 경고 로직 단위 테스트: 고시일 > 평가기준일 → 경고 / 이하 → 무경고 / 추정 고시일 구분.
- 회귀: 취득세·재산세 `StandardPriceInput` 기존 동작(announcedLabel 추가 표시 외 변화 없음).
- `npx tsc --noEmit` 0건 / `npx vitest run` / 브라우저 수동.

## 5. 영향 범위 / 리스크

- **`getDefaultPriceYear` 무변경** — 4세목 공유 헬퍼를 건드리지 않음(기본값은 현행 cutoff 유지). 회귀 위험 최소.
- **엔진·Zod·`EstateItem`·validation 무변경** — 공시연도는 폼 비영속 로컬 상태. UI 8지점 중 ⑤(UI 위젯)만 해당.
- `announcedLabel` 표시는 취득세·재산세에도 노출(개선). 경고는 `referenceDate` 있는 경로만.
- 수동 선택은 기준일 재변경 시 덮어씀(기존 동작). isManual 추적은 별도 개선 사안.

## 6. 폐기된 대안 (참고)
- 연도별 실제 고시일 하드코딩 테이블: 데이터 확보 불가·단일 고시일 모델 법리 부정확·유지보수 부담으로 폐기. 동일 목적을 API `pblntfDe`가 더 정확히 달성.
