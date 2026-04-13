# KoreanTaxCalc - Product Requirements Document

> PDCA Plan Phase | 2026-04-13 (v2.0 — 6대 세금 확장)
> Tech Stack: Next.js 15 (App Router) + Supabase (Auth + DB) + Vercel

---

## 1. Executive Summary

| Perspective | Description |
|------------|-------------|
| **Problem** | 한국 부동산 관련 6대 세금(양도소득세·상속세·증여세·취득세·재산세·종합부동산세)은 세율·공제·감면·중과세·연동 규정이 복잡하게 얽혀 있어 일반인이 정확한 세금을 스스로 계산하기 어렵고, 기존 홈택스는 UX가 불편하며 세금 간 연동 계산(재산세↔종부세)을 지원하지 않는다. |
| **Solution** | 최신 세법이 DB 기반으로 자동 반영되는 웹 계산기를 제공한다. 단계별 입력 마법사로 6대 세금의 비과세 판단·감면 자동 적용·세액 계산을 1분 이내에 완료하며, 재산세와 종합부동산세는 자동 연동하여 이중과세 공제까지 처리한다. |
| **Functional UX Effect** | 사용자가 부동산 정보를 입력하면 6가지 세금 중 원하는 항목을 선택해 결과를 즉시 확인하고, 로그인 시 계산 이력을 저장·조회하며 PDF로 출력할 수 있다. |
| **Core Value** | "세금 계산의 민주화" — 세무사 없이도 누구나 6대 세금을 정확하게 미리 파악해 의사결정 비용을 줄이고, 전문가에게는 업무 효율화 도구를 제공한다. |

---

## 2. Problem & Solution

### 2.1 Problem Statement

한국의 부동산 관련 세금 6종은 세율·공제·감면·중과세 규정이 복잡하게 얽혀 있어:
- 일반인은 세금을 정확하게 스스로 계산하기 매우 어렵다
- 특히 종합부동산세는 재산세 공제, 세부담 상한, 공정시장가액비율 등 다단계 계산이 필요하다
- 홈택스 계산기는 UX가 불편하고 로그인이 필수이며 세금 간 연동 계산을 지원하지 않는다
- 세무사 상담은 건당 20~50만원의 비용이 발생한다

### 2.2 Target Users

| Persona | 설명 | 주요 니즈 |
|---------|------|----------|
| 부동산 매도 예정자 | 40-60대, 주택/토지 매도 계획 | 1세대1주택 비과세 판단, 양도세 예측 |
| 공인중개사/세무사 | 전문 업무 도구 필요 | 빠른 계산, 고객 공유, 이력 관리 |
| 부동산 투자자 | 다주택 보유 | 중과세 판단, 종부세 시뮬레이션 |
| 상속·증여 계획자 | 자산 이전 계획 | 상속세 vs 증여세 비교, 재산 평가 |

---

## 3. Functional Requirements

### M1. 양도소득세 계산 (Priority: P0)

| ID | 요구사항 | 세부 내용 |
|----|---------|---------|
| M1-1 | 1세대 1주택 비과세 판단 | 보유기간(2년+), 거주기간(조정지역 2년+, **취득일 기준** 조정대상지역 판단), 양도가액(12억 기준) 자동 판단. **일시적 2주택 비과세 특례** 포함 (신규 취득 후 3년 내 기존 주택 양도). 2017.8.3 이전 취득분 거주요건 면제. v2.0: 상속·합가·혼인 비과세 확장 |
| M1-2 | 12억 초과분 세액 계산 | 양도차익 × (양도가액 - 12억) / 양도가액 = 과세 대상 금액 → 누진세율(6~45%) 적용 |
| M1-3 | 장기보유특별공제 | 보유기간별(연 2%, 최대 30%) + 거주기간별(연 4%, 최대 40%) 공제. 1세대1주택 최대 80%. **12억 초과 시 과세대상 양도차익(12억 초과분 비율 적용 후)에 공제율 적용** (순서 중요). **중과세 대상(다주택·비사업용토지·미등기) 시 적용 배제** |
| M1-4 | 기본공제 | 연간 250만원 (동일 연도 양도 합산 한도, 미등기양도 제외). UI에서 동일 연도 추가 양도 시 잔여 한도 안내 |
| M1-5 | 비사업용토지 중과세 | 기본세율 + 10%p 중과, **장기보유특별공제 배제** |
| M1-6 | 다주택 중과세 | 조정대상지역(**양도일** 기준) 2주택 +20%p, 3주택 이상 +30%p (현행 유예 여부 DB 관리), **장기보유특별공제 배제** |
| M1-11 | 미등기 양도 중과세 | 미등기 양도자산 **70% 단일세율**, 장기보유특별공제 배제, 기본공제 배제 |
| M1-7 | 조세특례제한법 감면 | **① 임대주택 감면**: 장기임대주택(8년+ 등록) 양도세 감면, 임대의무기간·임대료 증액제한(5%) 준수 필요. **② 신축주택 감면**: 미분양 신축 취득 시 5년간 양도세 감면 (취득시기·지역별 감면율 상이). **③ 미분양주택 감면**: 수도권 외 미분양주택 취득 시 감면 (사업자 등록 요건). **④ 8년 자경 농지 감면**: 100% 감면, 한도 1억/5년간 2억, 자경 8년+ 요건 (직접 경작 증빙 필요). 감면 중복 적용 불가, 감면 한도 초과분은 일반 과세. 상세 요건은 조세특례제한법 해당 조문 참조 |
| M1-8 | 기준시가 입력 | v1.0~v1.3: 사용자 수동 입력 + 부동산공시가격알리미 외부 링크 안내. v1.4: 국토부 API 프록시 자동 조회로 전환 |
| M1-9 | 취득가액 환산 | 실지취득가액 불명 시 매매사례가액 → 감정가액 → 환산취득가액 순서. **환산취득가액 = 양도실거래가 × (취득시 기준시가 ÷ 양도시 기준시가)**. 환산 적용 시 필요경비는 개산공제(토지·건물 3%, 지상권 7%) |
| M1-10 | 지방소득세 | 양도소득세의 10% 자동 합산 표시 |

### M2. 상속세 계산 (Priority: P1)

| ID | 요구사항 | 세부 내용 |
|----|---------|---------|
| M2-1 | 상속세 세액 계산 | 과세표준 구간별 누진세율 (1억 이하 10%, 1~5억 20%, 5~10억 30%, 10~30억 40%, 30억 초과 50%) |
| M2-2 | 상속공제 자동 적용 | 기초공제 2억, **배우자공제** `min(max(실제상속분, 5억), min(법정상속분, 30억))` (상속인 구성+실제 상속분 입력 필요, 미입력 시 법정상속분 적용), 일괄공제 5억, **금융재산공제**(순금융 2천만 이하 전액, 2천만~1억 2천만원, 1억 초과 20% 최대 2억), **동거주택상속공제**(피상속인과 10년+ 계속 동거+1세대1주택+상속인 무주택 직계비속, 주택가액 80% 최대 6억, 5년 내 처분 시 추징). **공제 종합한도**: 공제 합계는 상속세 과세가액을 초과할 수 없음(상증법 제24조) |
| M2-7 | 상속인 구성 입력 | 배우자 유무, 자녀 수, 관계(직계비속·직계존속·형제자매) 입력 → 법정상속분 비율 자동 계산 → 배우자공제 한도 산출. v1.2 scope: 기본 구성만 지원 (대습상속·상속포기·태아는 v2.0 확장, "세무사 상담 권장" 안내) |
| M2-3 | 공제 최적화 안내 | 기초공제+**인적공제**(자녀 1인당 5천만, 미성년자 `(20세-나이)×1천만`, 연로자 65세+ 1인당 5천만, 장애인 `기대여명×1천만`) vs 일괄공제 5억 중 유리한 방식 자동 선택 |
| M2-8 | **사전증여재산 합산** | 상속개시 전 **10년 내 상속인에게 증여**한 재산 + **5년 내 비상속인에게 증여**한 재산을 상속세 과세가액에 합산 (상증법 제13조). 기납부 증여세는 세액공제. UI: "사전 증여 내역 추가" 입력 |
| M2-4 | 재산 평가 기능 | 모든 재산 유형(부동산·금융·기타)에서 **사용자 수동 입력** 방식. UI 흐름: "평가 방식 선택(시가/보충적)" → "금액 직접 입력". 시가: 매매사례가·감정가·수용가·경매가 중 선택, 보충적: 기준시가 입력 (v1.4에서 자동 조회 전환) |
| M2-9 | **과세가액 차감 항목** | 비과세재산(국가귀속·금양임야 등), 공익법인출연(한도 내), **채무**(공과금+사적채무, 입증 필요), **장례비용**(실비 기준, 최소 500만원 보장, 일반 상한 1,000만원, 봉안시설 추가 500만원=최대 1,500만원) |
| M2-5 | 세대생략 할증 | 피상속인의 자녀를 건너뛴 경우 30%(미성년+20억 초과 시 40%) 할증. **안분 계산**: 산출세액 × (세대생략 상속재산 / 전체 상속재산) × 할증률 |
| M2-6 | 신고세액 공제 | 기한 내 신고 시 3% 공제. **적용 순서**: 산출세액 → 세대생략 할증 → 세액공제(기납부증여세·외국납부 등) → 남은 세액의 3%. 세액 1,000만원 초과 시 "분납·물납 가능" 안내 |

### M3. 증여세 계산 (Priority: P1)

| ID | 요구사항 | 세부 내용 |
|----|---------|---------|
| M3-1 | 증여세 세액 계산 | 상속세와 동일 누진세율 적용 |
| M3-2 | 증여재산공제 | 배우자 6억, 직계존속 5천만(미성년 2천만), 직계비속 5천만, 기타 친족 1천만 (10년간 합산) |
| M3-3 | 신고세액 공제 | 기한 내 신고 시 3% 공제 |
| M3-4 | 세대생략 할증 | 30% 할증 (미성년+20억 초과 40%) |
| M3-5 | 재산 평가 기능 | 상속세와 동일 — 시가 평가 및 보충적 평가 선택 |
| M3-6 | 10년 내 합산 계산 | 동일인으로부터 10년 내 증여 합산 과세. **공제는 10년 총 한도** (이전 증여 시 적용한 공제분 차감). 합산 산출세액 - 기납부세액 = 최종 납부세액. **연대납세의무**: 수증자 납부 불가 시 증여자 연대 납부 (미성년자 증여 시 특히 주의 안내) |
| M3-7 | **증여세 비과세 판단** | 사회통념상 인정되는 생활비·교육비(비과세), 축의금·조의금 등 통상적 금품, 이혼 재산분할. UI에 "비과세 해당 여부 확인" 체크리스트 제공 |

### M4. 취득세 계산 (Priority: P1)

| ID | 요구사항 | 세부 내용 |
|----|---------|---------|
| M4-1 | 물건 종류별 취득세 | 주택(1~3% 구간별), 토지(4%), 건물(4%), 원시취득(2.8%) 등 |
| M4-2 | 취득 원인별 세율 | 매매, 상속(2.8%, 농지 2.3%), 증여(3.5%), 원시취득, 공매 등 원인별 차등 |
| M4-3 | 주택 취득세 구간 | 6억 이하 1%, 6억~9억 **선형 보간** (`취득세율 = (취득가액 × 2/3억 - 3) / 100`, 소수점 5자리), 9억 초과 3% |
| M4-4 | 취득세 중과세 | 조정지역 2주택 8%, 3주택+ 12%, 법인 12%, 사치성 재산 별도 중과 |
| M4-5 | 부가세 자동 합산 | 농어촌특별세 + 지방교육세 포함 총 납부세액 |
| M4-6 | 생애최초 주택 감면 | 수도권 4억·비수도권 3억 이하 주택 취득세 감면 200만원 한도 |

### M5. 재산세 계산 (Priority: P1) — **신규**

| ID | 요구사항 | 세부 내용 |
|----|---------|---------|
| M5-1 | 주택 재산세 | 공시가격 × 공정시장가액비율(60%) → 누진세율 (6천만 이하 0.1%, 6천만~1.5억 0.15%, 1.5억~3억 0.25%, 3억 초과 0.4%) |
| M5-2 | 1세대 1주택 특례 | 공시가격 9억 이하 1세대1주택: 특례세율 적용 (각 구간 0.05%p 인하) |
| M5-3 | 토지 재산세 | 종합합산(0.2~0.5%), 별도합산(0.2~0.4%), 분리과세(0.07~4%) |
| M5-4 | 건축물 재산세 | 일반 0.25%, 골프장/고급오락장 4% |
| M5-5 | 세부담 상한 | 전년 대비 재산세 상승 상한: 주택(105~130%), 토지(150%). 전년도 세액은 사용자 선택적 입력 (미입력 시 상한 계산 생략 + 안내) |
| M5-6 | 부가세 합산 | 지방교육세(재산세의 20%), 지역자원시설세, 도시지역분(0.14%) |
| M5-7 | 재산세 결과 내보내기 | 종합부동산세 계산 시 재산세 공제액으로 자동 전달 |

### M6. 종합부동산세 계산 (Priority: P1) — **신규**

| ID | 요구사항 | 세부 내용 |
|----|---------|---------|
| M6-1 | 주택분 과세 | 인별 공시가격 합산 → 기본공제(9억, 1세대1주택 12억) 차감 → 공정시장가액비율(60%) 적용 |
| M6-2 | 누진세율 적용 | 3억 이하 0.5%, 3~6억 0.7%, 6~12억 1.0%, 12~25억 1.3%, 25~50억 1.5%, 50~94억 2.0%, 94억 초과 2.7% |
| M6-3 | 1세대1주택 특례 | 기본공제 12억 + 고령자 공제(60세+ 20%, 65세+ 30%, 70세+ 40%) + 장기보유 공제(5년+ 20%, 10년+ 40%, 15년+ 50%). 합산 최대 80% |
| M6-4 | 다주택 물건 입력 | 복수 주택의 공시가격 목록 입력 → 합산 과세표준 자동 계산 |
| M6-5 | **재산세 공제 (핵심 연동)** | 종부세 산출세액에서 재산세를 **비율 안분하여 공제** (단순 전액 차감 아님). 공식: `공제할 재산세 = 재산세 부과세액 × (종부세 과세표준 ÷ 재산세 과세표준)`. M5 계산 엔진과 내부 연동 |
| M6-6 | 세부담 상한 | 전년도 총세액 대비 상한 적용 (일반 150%, 다주택 300%). 전년도 세액은 사용자 선택적 입력 (앱 내 이전 이력 있으면 자동 채움 제안) |
| M6-7 | 농어촌특별세 | 종합부동산세의 20% 자동 가산 |
| M6-8 | 토지분 종합부동산세 | 종합합산(5억 초과, 1~3%), 별도합산(80억 초과, 0.5~0.7%) |

### M7. 공통 기능 (Priority: P0-P1)

| ID | 요구사항 | 세부 내용 |
|----|---------|---------|
| M7-1 | 사용자 인증 | Supabase Auth — 이메일/소셜 로그인(구글, 카카오). **비로그인 사용자도 계산 가능** (이력 저장·PDF만 로그인 필요) |
| M7-2 | 계산 이력 저장 | 로그인 사용자 계산 조건 + 결과 자동 저장 (6가지 세금 모두). 비로그인 시 zustand(sessionStorage)에 임시 보관 → 로그인 완료 후 자동 저장 + "이전 계산 결과가 저장되었습니다" 토스트 |
| M7-3 | 이력 조회/관리 | 날짜순 조회, 세금 종류별 필터, 삭제, 연동 계산 그룹 표시 |
| M7-4 | PDF 출력 | 계산 결과를 전문 리포트 형태로 PDF 생성 (세금별 항목 상세 포함) |
| M7-5 | 면책 고지 표시 | 모든 계산 결과에 "참고용" 면책 문구 + 전문가 상담 권장 표시 |
| M7-6 | 기준시가 조회 | v1.0~v1.3: 수동 입력 + 외부 링크 안내. v1.4: 공동주택/토지/단독주택은 국토부 API 프록시(Redis 캐싱), 오피스텔·상업용은 수도권+광역시 한정 파일 DB 적재 (국세청 직접 API 미제공) |
| M7-7 | 이력 보존 정책 | 사용자당 계산 이력 최대 200건 유지. 초과 시 가장 오래된 이력 자동 삭제 + 삭제 전 안내. 연동 그룹은 함께 삭제 |
| M7-8 | 세율 데이터 관리 | 세법 개정 시 관리자가 배포 없이 세율 업데이트할 수 있는 시딩 CLI 스크립트 제공 (`npm run seed:tax-rates`). v2.0에서 Admin UI 추가 |
| M7-9 | 에러 처리 | 계산 실패·DB 조회 오류·세율 데이터 없음 시 사용자에게 구체적 에러 메시지 표시. App Router `error.tsx`/`loading.tsx` 기반 에러 바운더리 |

---

## 4. Technical Architecture

### 4.1 기술 스택

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15 (App Router) | SSR/SSG, SEO, UI (React 19, Turbopack) |
| UI Library | shadcn/ui + Tailwind CSS v4 | 컴포넌트 시스템 |
| Form / Validation | react-hook-form + zod | 다단계 폼 관리 + 입력값 유효성 검증 |
| State Management | zustand | StepWizard 전역 상태 관리 (sessionStorage 연동) |
| Date | date-fns | 보유기간·거주기간 계산, 세율 시점 조회 |
| Decimal | 정수 연산 (원 단위 변환) | 부동소수점 오류 방지 — 모든 금액을 원(정수) 단위로 변환 후 계산, 세율 적용 시에만 소수 연산 후 즉시 반올림 |
| Backend | Next.js Route Handlers + Server Actions | 계산 API는 Route Handler (비로그인 접근+rate limiting), 이력 저장/삭제·PDF 생성은 Server Actions (로그인 필수, 타입 안전) |
| Auth | Supabase Auth | 이메일/소셜 로그인, JWT |
| Database | Supabase (PostgreSQL) | 사용자, 계산 이력, 세율 데이터 |
| Type-safe DB | Supabase CLI (`supabase gen types`) | DB 스키마 → TypeScript 타입 자동 생성 |
| Storage | Supabase Storage | PDF 파일 저장 |
| Deployment | Vercel | 배포, CDN |
| PDF | @react-pdf/renderer 또는 jsPDF (PoC 후 확정) | PDF 생성 |
| Cache / Rate Limit | Upstash Redis + @upstash/ratelimit | API 프록시 캐싱 + rate limiting |
| Testing | vitest + @testing-library/react | 계산 엔진 단위 테스트 + 컴포넌트 테스트 |
| E2E Testing | Playwright | 다단계 폼 플로우 자동 검증 |
| Monitoring | @sentry/nextjs | 에러 트래킹 + 계산 엔진 런타임 오류 감지 |
| Language | TypeScript 5.x (strict mode) | 세금 계산 정확도를 위한 타입 안전성 |
| Runtime | Node.js 22 LTS | 2026 시점 Active LTS |

### 4.2 데이터 모델

#### 핵심 설계 결정: DB 기반 세율 관리
세율·공제한도를 코드가 아닌 DB(`tax_rates` 테이블)로 관리하여 세법 변경 시 배포 없이 업데이트 가능.

```sql
-- 세율 테이블 (6개 세금 타입 통합 관리)
CREATE TABLE tax_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type        text NOT NULL,
    -- 'transfer' | 'inheritance' | 'gift' | 'acquisition' | 'property' | 'comprehensive_property'
  category        text NOT NULL,
    -- 'progressive_rate' | 'deduction' | 'surcharge' | 'special' | 'fair_market_ratio'
  effective_date  date NOT NULL,
  rate_table      jsonb NOT NULL,      -- 구간별 세율 (공통 brackets 인터페이스, 세금별 확장)
  deduction_rules jsonb,               -- 공제/감면 규칙
  special_rules   jsonb,               -- 중과세/특례/연동 규칙 (예: { "surcharge_suspended": true, "suspended_until": "2026-12-31" })
  is_active       boolean DEFAULT true, -- 관리 편의용 (실제 조회는 effective_date 기준 시점 조회)
  created_at      timestamptz DEFAULT now()
);

-- 기준시가/공시가격 데이터 (오피스텔·상업용 파일 적재 전용, 수도권+광역시 한정)
-- 공동주택/토지/단독주택은 국토부 API 프록시 + Upstash Redis 24h 캐싱 (DB 미적재)
CREATE TABLE standard_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_type      text NOT NULL,
    -- 'officetel' | 'commercial' (API 조회 대상인 apartment/land/building은 미적재)
  address_code    text NOT NULL,       -- 법정동코드
  detail_address  text,                -- 동/호 상세
  reference_date  date NOT NULL,       -- 기준일 (고시일)
  price           bigint NOT NULL,     -- 기준시가 (원)
  area_sqm        numeric(10,2),       -- 전용면적 (㎡)
  source          text NOT NULL DEFAULT 'data_go_kr_file',
  raw_data        jsonb,
  created_at      timestamptz DEFAULT now()
);

-- 사용자 (Supabase Auth 확장)
CREATE TABLE users (
  id              uuid PRIMARY KEY REFERENCES auth.users(id),
  display_name    text,
  created_at      timestamptz DEFAULT now()
);

-- 계산 이력
CREATE TABLE calculations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id),
  tax_type              text NOT NULL,
  input_data            jsonb NOT NULL,     -- 입력 조건
  result_data           jsonb NOT NULL,     -- 계산 결과 상세
  tax_law_version       text,               -- 적용 세율 버전
  linked_calculation_id uuid REFERENCES calculations(id),
    -- 재산세↔종합부동산세 연동 시 참조
  created_at            timestamptz DEFAULT now()
);

-- 조정대상지역 (양도세·취득세·종부세 중과세 판단용)
CREATE TABLE regulated_areas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code       text NOT NULL,       -- 법정동코드
  area_name       text NOT NULL,       -- 지역명
  designation_date date NOT NULL,      -- 지정일
  release_date    date,                -- 해제일 (null이면 현재 지정 중)
  regulation_type text NOT NULL,       -- 'speculative' | 'overheated' | 'adjusted'
  created_at      timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_tax_rates_lookup ON tax_rates (tax_type, category, effective_date DESC);
CREATE INDEX idx_regulated_areas_lookup ON regulated_areas (area_code, designation_date DESC);
CREATE INDEX idx_calculations_user ON calculations (user_id, created_at DESC);

-- RLS 정책

-- calculations: 본인 데이터만 CRUD
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own calculations"
  ON calculations FOR ALL
  USING (auth.uid() = user_id);

-- tax_rates: 전체 읽기 허용, 수정은 service_role만 가능 (세율 위변조 방지)
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tax_rates" ON tax_rates FOR SELECT USING (true);

-- regulated_areas: 전체 읽기 허용, 수정은 service_role만 가능
ALTER TABLE regulated_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read regulated_areas" ON regulated_areas FOR SELECT USING (true);

-- standard_prices: 전체 읽기 허용, 수정은 service_role만 가능
ALTER TABLE standard_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read standard_prices" ON standard_prices FOR SELECT USING (true);

-- 참고: INSERT/UPDATE/DELETE 정책이 없으면 anon/authenticated에서 수정 불가.
-- 시딩 CLI와 Admin은 service_role key를 사용하여 RLS 우회.
```

### 4.3 페이지 구조 (App Router)

```
app/
  page.tsx                              # 랜딩 (세금 종류 선택)
  calc/
    transfer-tax/page.tsx               # 양도소득세 계산기
    inheritance-tax/page.tsx            # 상속세 계산기
    gift-tax/page.tsx                   # 증여세 계산기
    acquisition-tax/page.tsx            # 취득세 계산기
    property-tax/page.tsx               # 재산세 계산기
    comprehensive-tax/page.tsx          # 종합부동산세 계산기 (재산세 자동 연동)
  result/[id]/page.tsx                  # 계산 결과 상세
  history/page.tsx                      # 계산 이력
  auth/
    login/page.tsx
    signup/page.tsx
  guide/
    page.tsx                            # 세금 가이드 목록 (SEO)
    [slug]/page.tsx
  api/
    calc/transfer/route.ts
    calc/inheritance/route.ts
    calc/gift/route.ts
    calc/acquisition/route.ts
    calc/property/route.ts
    calc/comprehensive/route.ts         # 내부에서 property 엔진 호출
    history/route.ts
    pdf/route.ts
    standard-price/route.ts             # 기준시가 조회 프록시
```

### 4.4 핵심 모듈 구조

```
lib/
  tax-engine/
    transfer-tax.ts                # 양도소득세 계산 엔진
    inheritance-tax.ts             # 상속세 계산 엔진
    gift-tax.ts                    # 증여세 계산 엔진
    acquisition-tax.ts             # 취득세 계산 엔진
    property-tax.ts                # 재산세 계산 엔진
    comprehensive-tax.ts           # 종합부동산세 계산 엔진
      → 내부에서 property-tax.ts를 import하여 재산세 자동 계산 후 공제
    tax-utils.ts                   # 공통 유틸 (누진세율 계산, 정수 연산, 반올림)
    standard-price.ts              # 기준시가 조회 (API + DB)
  db/
    tax-rates.ts                   # DB 세율 조회
    calculations.ts                # 계산 이력 CRUD
    standard-prices.ts             # 기준시가 DB 조회
  validators/
    transfer-input.ts              # Zod 스키마 (양도세)
    inheritance-input.ts           # Zod 스키마 (상속세)
    gift-input.ts                  # Zod 스키마 (증여세)
    acquisition-input.ts           # Zod 스키마 (취득세)
    property-input.ts              # Zod 스키마 (재산세)
    comprehensive-input.ts         # Zod 스키마 (종부세)
  stores/
    calc-wizard-store.ts           # zustand store (StepWizard 상태 + sessionStorage persist)
  database.types.ts                # Supabase CLI 자동 생성 타입
components/
  calc/
    StepWizard.tsx                 # 공통 단계별 입력 마법사 (react-hook-form + zustand)
    TransferTaxForm.tsx
    InheritanceTaxForm.tsx
    GiftTaxForm.tsx
    AcquisitionTaxForm.tsx
    PropertyTaxForm.tsx            # 재산세 입력
    ComprehensiveTaxForm.tsx       # 종부세 입력 (다주택 목록)
    PropertyListInput.tsx          # 종부세용 복수 물건 입력 컴포넌트
    TaxResult.tsx                  # 계산 결과 표시
    ResultBreakdown.tsx            # 세금 항목별 상세
    LinkedTaxResult.tsx            # 재산세↔종부세 연동 결과 표시
  ui/                              # shadcn/ui 컴포넌트
```

---

## 5. Non-Functional Requirements

| ID | 요구사항 | 목표 |
|----|---------|------|
| NF-1 | 응답 속도 | 세액 계산 결과 **warm 상태 1초 이내**, cold start 포함 시 3초 이내 (종부세 다주택 포함). Supabase 클라이언트를 모듈 스코프에서 1회 생성하여 연결 재사용 |
| NF-2 | 모바일 반응형 | 모든 계산기 모바일 브라우저 정상 동작 |
| NF-3 | 보안 | Supabase RLS로 본인 데이터만 접근, HTTPS 전용 |
| NF-4 | 접근성 | WCAG 2.1 AA 수준 (시맨틱 HTML, 키보드 내비게이션) |
| NF-5 | SEO | 세금 가이드 페이지 검색엔진 최적화 (SSG) |
| NF-6 | 모니터링 | Sentry 에러 트래킹 + 계산 엔진 런타임 오류 감지 |
| NF-7 | 과거 세율 지원 | 양도일/취득일 기준 해당 시점 세율 자동 적용 (effective_date 기준 시점 조회) |
| NF-8 | 테스트 커버리지 | 계산 엔진 vitest 단위 테스트 100% 커버리지 + Playwright E2E 다단계 폼 플로우 검증 |
| NF-9 | 타입 안전성 | TypeScript 5.x strict mode + Supabase CLI 자동 생성 타입으로 DB↔코드 타입 일관성 보장 |
| NF-10 | 정밀 연산 | 모든 세금 계산을 원(정수) 단위로 수행. **절사(Math.floor) 시점은 세금별 규정 준수**: 양도세·재산세 과세표준 천원 미만 절사, 종부세 과세표준 만원 미만 절사, 세액은 원 미만 절사 |
| NF-11 | 에러 복원력 | 계산 실패 시 구체적 에러 코드 + 사용자 안내 메시지. DB/네트워크 오류 시 입력 데이터 유실 없음 (zustand 상태 보존) |
| NF-12 | 이력 보존 | 사용자당 최대 200건 이력 유지. Supabase Free 500MB 내 안정 운영 |

---

## 6. Constraints & Risks

### 6.1 제약사항

| 제약 | 설명 |
|-----|------|
| 세법 정확성 | 모든 계산 로직은 세무사 검증 필수. 오류 시 법적 리스크 |
| 세법 기준연도 | 2026년 현행 세법 기준 (개정 시 DB 업데이트) |
| 면책 고지 | 모든 결과는 "참고용" 명시. 실제 신고 시 전문가 상담 권장 |
| 기준시가 API | 국세청 공식 실시간 API 미제공. v1.0~v1.3은 수동 입력, v1.4에서 국토부 API 프록시(Redis 캐싱) + 파일 적재(수도권+광역시 한정) |
| DB 용량 | Supabase Free tier 500MB — 기준시가 전국 데이터 적재 불가. API 프록시 + 범위 한정으로 대응 |
| 개인정보 | 계산 이력 내 거래 정보 Supabase 서버측 암호화 |
| Supabase Free tier | 1주일 미사용 시 프로젝트 자동 pause — Vercel Cron keepalive로 방지 |
| 국토부 API 쿼터 | 공공데이터포털 API 일일 호출 한도 (기본 1,000회/일) — Redis 24h 캐싱으로 실제 호출 최소화, 쿼터 초과 시 수동 입력 fallback |

### 6.2 주요 리스크

| Risk | 확률 | 심각도 | 대응 방안 |
|------|:---:|:---:|---------|
| 세금 계산 오류 | 중 | 심각 | 단위 테스트 100% 커버리지 + 세무사 검증 + 면책 고지 |
| 세법 개정 반영 지연 | 중 | 심각 | DB 기반 세율 관리 (배포 없이 업데이트) |
| 재산세↔종부세 연동 오류 | 중 | 높음 | 연동 계산 통합 테스트 + 국세청 예시 케이스 검증 |
| 종부세 다주택 입력 UX 복잡성 | 높음 | 중간 | 물건 추가/삭제 직관적 UI + 합산 실시간 프리뷰 + sessionStorage 중간 저장 |
| 공정시장가액비율 변경 | 중 | 중간 | DB에서 비율 관리 (정부 매년 고시) |
| PDF 생성 Vercel 제약 | 중 | 중간 | Phase 2 PoC로 번들/시간/메모리 검증 후 방식 확정 |
| 비인증 API 남용 | 중 | 중간 | Upstash rate limiting (계산 30/min, 기준시가 10/min) |
| 조정대상지역 변경 | 중 | 높음 | DB `regulated_areas` 테이블로 관리, 정부 고시 시 즉시 업데이트 |
| 세무사 검증 케이스 확보 실패 | 중 | 높음 | 국세청 홈택스 예제 + 세무사 실무사례집 + 국세청 세금계산 예시 활용. 외부 권위 소스 기반 테스트 |
| 과거 세율 조회 오류 | 낮음 | 중간 | effective_date 기준 시점 조회 + 과거 세율 보존 정책 |
| 부동소수점 연산 오류 | 중 | 높음 | 원(정수) 단위 연산 원칙 + 세율 적용 후 즉시 반올림 + 국세청 예시와 1원 단위 비교 테스트 |
| Supabase 자동 pause | 중 | 높음 | Vercel Cron Job으로 6일마다 keepalive ping (Free tier 1주 미사용 pause 방지) |
| 국토부 API 쿼터 초과 | 낮음 | 중간 | Redis 24h 캐싱으로 실호출 최소화 + 쿼터 초과 시 수동 입력 fallback + 필요 시 트래픽 확대 신청 |
| 계산 이력 DB 증가 | 낮음 | 중간 | 사용자당 200건 상한 + 초과 시 자동 정리 |

---

## 7. Release Plan (Roadmap)

| Phase | Version | Timeline | Scope |
|-------|---------|----------|-------|
| **1** | **v1.0 MVP** | 2026 Q3 (3~4주) | 양도소득세 계산기 (비과세·중과세·감면·기준시가·환산) + 인증 + 이력 저장 |
| **2** | **v1.1** | 2026 Q3 (2~3주) | 취득세 계산기 (원인별·종류별·중과세·부가세) + PDF 출력 |
| **3** | **v1.2** | 2026 Q4 (2~3주) | 상속세 계산기 + 증여세 계산기 + 재산 평가 기능 |
| **4** | **v1.3** | 2026 Q4 (3~4주) | 재산세 계산기 + 종합부동산세 계산기 + **재산세↔종부세 자동 연동** |
| **5** | **v1.4** | 2027 Q1 (2주) | 기준시가 자동 조회 (국토부 API + 파일 적재) + SEO + 가이드 콘텐츠 |
| **6** | **v2.0** | 2027 Q1~Q2 | 절세 시나리오 비교, Pro 구독, B2B 기능 |

---

## 8. Definition of Done (MVP ~ v1.4)

- [ ] 6가지 세금 계산기 모두 UI + 계산 엔진 완성
- [ ] 단위 테스트 (계산 엔진 핵심 로직 100% 커버리지)
- [ ] 재산세↔종합부동산세 연동 계산 통합 테스트 통과
- [ ] Supabase 인증 + RLS 적용 완료
- [ ] 계산 이력 저장/조회 동작 확인 (6가지 세금 + 연동 그룹)
- [ ] PDF 출력 기능 동작 확인
- [ ] 모바일 반응형 확인
- [ ] 면책 고지 문구 전 페이지 표시
- [ ] 기준시가 자동 조회 동작 확인
- [ ] Vercel 배포 성공
