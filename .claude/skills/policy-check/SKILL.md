---
name: policy-check
description: 새 작업 시작 시 메모리 인덱스(MEMORY.md)에서 관련 정책(feedback_*) 메모리를 사전 검색하여 정책 충돌·중복 시도를 방지. 자동 안분 fallback 금지·useEffect 미러링 금지·법령 정확성 등 핵심 정책을 사전 인식.
trigger: 작업 시작, 새 작업, 정책 확인, 메모리 검색, policy check, 시작 전 검토, 작업 전 점검
---

# policy-check — 작업 시작 전 정책 사전 검색

새 사용자 요청을 받았을 때, 코드 작성 전에 관련 정책 메모리를 먼저 검색하여 충돌·중복 시도를 방지.

## 적용 시점 (proactive)

- 사용자가 새 코드 변경을 요청한 직후, 첫 Edit/Write 호출 **이전**
- 특히 다음 키워드 등장 시:
  - "fallback", "자동 안분", "자동 채우기", "비어있을 때"
  - "동기화", "미러링", "useEffect"
  - "선택", "라디오", "토글", "checkbox"
  - "공시지가", "기준시가", "면적"
  - "감면", "공제", "납세자 유리"

## 핵심 정책 메모리 (필수 검토)

| 메모리 | 트리거 키워드 | 핵심 정책 |
|---|---|---|
| `feedback_no_silent_apportion_fallback.md` | fallback, 자동 안분, 빈값, 자동 채우기 | 세무 입력 필드 빈값 시 silent fallback 금지 (PHD 토글 ON 예외) |
| `feedback_useeffect_store_mirror_forbidden.md` | useEffect, 동기화, 미러링 | useEffect로 store 업데이트 금지 → display/API/validate fallback |
| `feedback_validation_sync_8th_point.md` | fallback, validation | API/UI fallback 추가 시 validate.ts 동시 갱신 |
| `feedback_zustand_selector.md` | selector, 무한 루프, 객체 반환 | hook 내부 `return {...}` 금지, useMemo/atomic 사용 |
| `feedback_tax_calculation_principle.md` | 유리, 불리, 절감, 절세 | 납세자 유리/불리 표현 금지, 법에 근거한 정확한 계산만 |
| `feedback_legal_codes.md` | 시행령, §, 조문, 법령 | 문자열 리터럴 금지, `lib/tax-engine/legal-codes/` 상수 사용 |
| `feedback_no_silent_apportion_fallback.md` | 면적 비율, 시점 비율 | 미입력 시 검증 차단 (직접 입력이 정확성의 유일한 경로) |
| `feedback_design_law_cases.md` | 사례, 케이스, 예외 | 사례 기반 변경 시 법령 본문·단서·각호 전수 분기 |
| `feedback_decimal_input.md` | 면적, ㎡, 연수, 소수점 | CurrencyInput 금지, DecimalInput + parseDecimal |
| `feedback_date_input.md` | 날짜, 취득일, 양도일 | type="date" 금지, DateInput 사용 |
| `feedback_select_on_focus.md` | input, 입력 | 모든 input에 select-on-focus (Provider 자동) |
| `feedback_toggle_card_visibility.md` | 토글, 라디오, 분기 | ToggleCard/RadioCardGroup 사용, OFF 상태에도 tone 배경 |
| `feedback_section_card_numbering.md` | 섹션, 카드, 번호 | 3개 이상 서브섹션은 색상 카드 + 원형 번호 배지 |
| `feedback_ui_order_follows_logic.md` | UI 배치, 순서, 입력 위치 | UI 순서 = 엔진 계산 로직 순서 |
| `feedback_result_view_korean_formula.md` | 결과, 산식, 표시 | 변수 약어·floor·중간 산술 금지, 한국어 풀어쓰기 |
| `feedback_land_price_lookup_field.md` | 공시지가, 원/㎡ | LandPriceLookupField 필수 |
| `feedback_area_rounding_consistency.md` | 면적, 비율, 안분 | 파생 면적은 `parseFloat(toFixed(2))` 후 곱셈 |
| `feedback_pdf_example_test_anchoring.md` | PDF, 예제, 테스트 | 교재·집행기준 예제 숫자는 `toBe()`로 anchor |
| `feedback_historical_tax_tables.md` | 토지등급, 역사 데이터 | DB 대신 `lib/tax-engine/data/*.ts` 정적 상수 |
| `feedback_law_article_link.md` | 조문, 법령 링크 | 외부 링크 금지, LawArticleModal 팝업 |

## 작업 절차

1. **사용자 요청에서 키워드 추출**: 위 표의 트리거 키워드와 매칭.
2. **매칭된 메모리 본문 읽기**: `Read` 또는 `Grep`으로 해당 메모리 파일 본문을 확인.
3. **정책 충돌 검토**:
   - 사용자 요청이 정책에 충돌하는가? → 충돌 사실을 사용자에게 먼저 보고 + 예외 적용 가능성 검토
   - 정책이 이번 작업에 어떻게 적용되는가? → 구현 방향에 반영
4. **새 패턴 발견 시 메모리 갱신**: 작업 후 신규 패턴/충돌 해결책은 신규 메모리로 등록 (`feedback_*.md`).

## 보고 형식 (선택)

작업 시작 시 한 줄 요약 가능:
> 관련 정책 검토: `feedback_no_silent_apportion_fallback.md`(PHD 토글 ON 시 §166⑥ 안분 허용 예외)·`feedback_useeffect_store_mirror_forbidden.md` 적용. fallback 패턴으로 진행.

## 예시

**사용자**: "이미지 13의 취득시 개별공시지가가 비어있으면 PHD에서 자동으로 가져와줘."

→ 자동 매칭 메모리:
- `feedback_no_silent_apportion_fallback.md` ("자동", "비어있으면")
- `feedback_useeffect_store_mirror_forbidden.md` ("자동으로 가져와")
- `feedback_validation_sync_8th_point.md` (fallback 도입)

→ 정책 적용:
- silent fallback 정책 충돌 가능성 → PHD 토글 예외 조항 확인 → 허용
- useEffect 미러링 금지 → display fallback prop으로 구현
- validation도 fallback 인식 동시 갱신
