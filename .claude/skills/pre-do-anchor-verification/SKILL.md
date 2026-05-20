---
name: pre-do-anchor-verification
description: Plan·Design 완료 후 Do 진입 전 핵심 anchor 1~2건을 우선 작성·실행하여 디자인 환류 기회를 확보하는 정책. "현행 엔진 일치 예상" 가정 금지. anchor 실패 메시지로 디자인 수정 시기 결정.
trigger: pre-do anchor, 사전 anchor, anchor 우선, 디자인 환류, do 진입 전, 핵심 anchor, anchor verification, pdca do 시작, anchor 사전 검증
---

# pre-do-anchor-verification — Pre-Do anchor 우선 검증

Plan/Design 완료 후 **Do 본격 진입 전** 핵심 anchor 1~2건을 우선 작성·실행하여 디자인의 잘못된 가정을 조기 발견하는 정책. "현행 엔진과 일치하리라" 같은 추정 금지.

## 적용 시점

- PDCA Plan/Design 완료 직후, Do 본격 진입 전
- 신규 사례 anchor 작성 시작 시
- "현행 엔진과 일치할 것"이라는 가정을 검증해야 할 때
- PDF/책 사례 anchor 작성 직전 — 표 값과 엔진 결과의 일치 확인 우선

## 적용 금지

- 이미 anchor가 통과한 회귀 케이스 (불필요)
- 산식이 자명한 경우 (예: A + B = C 단순 합계)
- 외부 API 호출 anchor (네트워크 의존)

## 핵심 원칙

### 1. "현행 엔진 일치 예상" 가정 금지

```
❌ 나쁜 패턴:
"Design 단계에서 PDF anchor 30건 일괄 작성 → Do에서 일괄 실행 → 12건 실패 → 디자인 재작성"
→ 매몰 비용 큼. 디자인 환류 기회 놓침.

✅ 좋은 패턴 (Pre-Do anchor):
"Design 완료 후 핵심 anchor 1~2건 먼저 작성·실행
→ 1건 실패 → 디자인 환류·정정
→ 나머지 anchor 일괄 작성 시 신뢰성 향상"
```

### 2. 핵심 anchor 선정 기준

다음 중 1~2건을 우선 선택:
- **단순 케이스** — 사례 1 / 부록 A 데이터 / 가장 단순한 분기
- **새 산식의 첫 출력** — 신규 echo 필드의 첫 매핑 검증
- **분기 진입점** — 새 enum 값·새 모드의 진입 분기

### 3. 실패 시 디자인 환류

anchor 실패 메시지를 디자인 정정의 신호로 활용:

```
anchor F-3 FAIL:
  Expected: filingCreditBase = 152,000,000
  Received: filingCreditBase = 200,000,000

→ 원인 분석:
  - 엔진 line 378: remainingTax = totalComputedTax − priorPaidCredit − foreignTaxCredit
  - Design §4.2: "기준세액 = ⑦합계 − §28 − 외국납부 − 단기재상속" (오기)
  - 실제: 단기재상속은 증여세 미적용 → 조특 특례가 차감 변수

→ 디자인 정정:
  - Design §4.2 산식에서 "단기재상속" 제거, "조특 특례" 추가
  - F-anchor 시나리오 재구성
  - Plan/Design 양쪽 갱신 후 다시 Do 진입
```

## 표준 워크플로

### Step 1: Plan/Design 완료 신호

- 케이스 인벤토리 (UI 케이스 표)
- anchor 시나리오 표 (F-1, F-2, ..., F-N)
- 부록 자기일관 데이터 (산식 검증값)

### Step 2: 핵심 anchor 1~2건 우선 작성

```ts
// __tests__/{domain}/{feature}-pre-anchor.test.ts (임시)
// 또는 본격 anchor 파일에 first 2 anchors 만

describe("Pre-Do verification — 핵심 anchor 1~2건", () => {
  it("F-3 (부록 A 자기일관 데이터)", () => {
    const result = calcXxx({ /* 부록 A 데이터 */ });
    expect(result.fieldA).toBe(expectedA);
    expect(result.fieldB).toBe(expectedB);
  });
});
```

### Step 3: 실행 → 결과 분석

#### Case A: PASS
- 핵심 가정 검증됨 → 나머지 anchor 일괄 작성 진행
- Do 본격 진입

#### Case B: FAIL
- 실패 메시지로 디자인 가정 오류 발견
- 디자인 정정 → Plan 동기화
- 핵심 anchor 재실행 → PASS 확인 후 다음 단계

### Step 4: 본격 Do 진입

- 나머지 anchor 일괄 작성 (Pre-Do에서 검증된 가정 기반)
- UI 통합·동기화

## 정책 강제 신호

다음 증상이 발견되면 본 스킬 미적용 의심:
- anchor 30건 작성 후 12건 일괄 실패 → Pre-Do anchor 누락
- "엔진과 디자인이 다른 것 같은데" 발견 시 → Pre-Do로 사전 확인 가능했음
- PDF 표 값이 엔진 결과와 1원이라도 다를 때 → 단계별 anchor로 어디서 어긋났는지 추적

## 본 PR 사례

**증여세 §28·§69 산출근거 표시** (커밋 68a2e50):
- Plan/Design 부록 A: ⑦=380M·⑮=228M·base=152M·§69=4,560,000 자기일관 가정
- F-3 anchor를 가장 먼저 작성·실행
- PASS → 부록 A 데이터 가정 검증됨 → F-1·F-2·...·F-10 일괄 작성
- 결과: 10/10 PASS, 디자인 환류 0회

**대안 시나리오 (Pre-Do 안 했다면)**:
- F-1~F-10 일괄 작성 → 만약 부록 A 산식 오기 (예: 150M vs 152M) → 10건 중 다수 FAIL
- 산식 추적 시간 + 디자인 재작성 시간 + anchor 재작성 시간

## 정합 정책

- [[policy-check]] — Pre-Do 전 MEMORY 정책 사전 확인
- [[echo-field-pattern]] — echo 필드 추가 시 첫 anchor는 echo 값 검증
- [[formula-display-builder]] — 산식 빌더 도입 시 부록 자기일관 데이터로 첫 anchor

## 워크플로 강제 (PDCA Do 진입 전 게이트)

```
Plan/Design 완료
  ↓
[GATE] Pre-Do anchor 작성·실행
  ↓
  PASS → 본격 Do
  FAIL → 디자인 환류 → 반복
```

## 위반 시 신호

- Do 단계에 anchor 작성 + 실행을 마지막에 배치 → Pre-Do 위반
- "Design은 완벽할 것"이라는 가정 → 검증 없이 진행
- 일괄 실패 후 디자인 정정 + anchor 재작성 → 중복 비용

## 관련 메모리

- [[feedback-pre-anchor-verification]] ★★★ — 본 정책의 정식 메모리
- [[feedback-engine-comment-vs-impl-drift]] — Pre-Do anchor가 드리프트 탐지 도구
- [[feedback-anchor-correction-legal-priority]] — anchor 갱신 시 법령 정합 우선
