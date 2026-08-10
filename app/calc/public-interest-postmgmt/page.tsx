"use client";

/**
 * 공익법인등 출연재산 사후관리 추징 시뮬레이터 — 상증법 §48② 증여세 사유(1·3·4·6호)
 *
 * 법령 (KoreanLaw 실측 2026-08-10):
 *   · 1호(출연재산 3년) — 법 §48②1호(본문·단서) + 상증령 §40①1호 가·나·다
 *   · 3호(운용소득 목적 외) — 법 §48②3호 + 상증령 §40①2의2호 + 상증칙 §13②③
 *   · 4호(매각대금 3년) — 법 §48②4호 + 상증령 §38④ + §40①3호 가·나
 *   · 6호(의결권 행사) — 법 §48②6호 + §16②2호가목 + 상증령 §40①3의2호
 *
 * 영농(`/calc/inheritance-postmgmt`)·가업(`/calc/family-business-postmgmt`) 시뮬레이터와 병렬.
 * 순수 엔진을 클라이언트에서 직접 호출한다(API 불필요).
 *
 * ## ⚠️ 두 시뮬레이터와 성격이 다르다
 *
 * · 납세의무자가 **공익법인등 본인**이다(상속인·수증자가 아니다)
 * · 부과 세목이 **증여세**다 — 「그 가액을 증여받은 것으로 보아 즉시 증여세를 부과」
 * · **이자상당액 규정이 없다**(영농 §18의3⑧·가업 §18의2⑤과 다름)
 *
 * ## ⚠️ 1호와 4호는 **3년 기산점이 다르다**
 *
 * 1호는 「출연받은 **날**」, 4호는 「매각한 날이 속하는 **과세기간·사업연도 종료일**」이다
 * (상증령 §38④). 그래서 4호 폼은 결산일을 따로 받는다 — 매각일만으로 도출할 수 없다.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { HomeButton } from "@/components/calc/shared/HomeButton";

import { Clause1Form } from "./Clause1Form";
import { Clause3Form } from "./Clause3Form";
import { Clause4Form } from "./Clause4Form";
import { Clause6Form } from "./Clause6Form";

type ClauseKind = "clause1" | "clause3" | "clause4" | "clause6";

const CLAUSE_OPTIONS: Array<{ value: ClauseKind; label: string; description: string }> = [
  {
    value: "clause1",
    label: "출연받은 재산 (§48②1호)",
    description: "출연받은 날부터 3년 이내에 직접 공익목적사업 등에 사용하지 않은 경우 등",
  },
  {
    value: "clause3",
    label: "운용소득 목적 외 사용 (§48②3호)",
    description:
      "출연재산을 수익용·수익사업용으로 운용해 생긴 운용소득을 직접 공익목적사업 외에 사용한 경우",
  },
  {
    value: "clause4",
    label: "매각대금 (§48②4호)",
    description:
      "출연재산을 매각하고 그 매각대금을 과세기간 종료일부터 3년 이내에 90% 이상 사용하지 않은 경우",
  },
  {
    value: "clause6",
    label: "출연주식 의결권 행사 (§48②6호)",
    description:
      "20% 한도(§16②2호가목)를 적용받은 공익법인등이 「의결권을 행사하지 아니할 것」을 위반해 의결권을 행사한 경우",
  },
];

/**
 * 결과 화면 링크가 넘긴 출연가액을 사전 채움한다.
 * 양수 정수만 수용 — 비수치는 ""로 떨어뜨려 `canCalculate`가 막게 한다.
 */
function sanitizeAmountParam(raw: string | null): string {
  if (!raw) return "";
  const num = parseAmount(raw);
  if (!Number.isFinite(num) || num <= 0) return "";
  return String(Math.floor(num));
}

// ============================================================

function PublicInterestPostMgmtInner() {
  const searchParams = useSearchParams();
  const initialDonated = sanitizeAmountParam(searchParams.get("donatedValue"));
  const [clause, setClause] = useState<ClauseKind>("clause1");

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">공익법인 출연재산 사후관리 시뮬레이터</h1>
          <HomeButton />
        </div>
        <p className="text-sm text-muted-foreground">
          상증법 §48② — 출연받은 재산(1호)·매각대금(4호)의 3년 사후관리 위반 시 추징 증여세 계산.
        </p>
      </header>

      {initialDonated && clause === "clause1" && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300">
          ⓘ 상속세 결과 화면에서 진입 — 출연재산가액{" "}
          <strong>{formatKRW(parseAmount(initialDonated))}</strong>이 사전 입력되었습니다. 필요 시 수정 가능합니다.
        </div>
      )}

      <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
          납세의무자는 공익법인등 본인입니다
        </p>
        <p className="text-caption text-blue-700 dark:text-blue-300">
          「그 사유가 발생한 날에 대통령령으로 정하는 가액을 공익법인등이 <b>증여받은 것으로 보아
          즉시 증여세를 부과</b>」합니다(§48② 본문). 영농·가업 사후관리와 달리 <b>이자상당액 가산
          규정이 없습니다</b>.
        </p>
        <p className="text-caption text-blue-700 dark:text-blue-300">
          같은 항이라도 <b>5호·7호</b>(운용소득·매각대금 1년 30%·2년 60%·의무지출)는 증여세가
          아니라 <b>§78⑨ 가산세</b>입니다 —{" "}
          <Link href="/calc/public-interest-penalty" className="underline font-medium">
            공익법인 사후관리 가산세 계산기
          </Link>
          를 이용하세요.
        </p>
      </div>

      <div className="space-y-1" data-testid="pi-clause-selector">
        <span className="text-sm font-medium">추징 사유</span>
        <RadioCardGroup
          name="pi-clause"
          layout="stack"
          value={clause}
          onChange={(v) => setClause(v as ClauseKind)}
          options={CLAUSE_OPTIONS}
        />
      </div>

      {clause === "clause1" && <Clause1Form initialDonated={initialDonated} />}
      {clause === "clause3" && <Clause3Form />}
      {clause === "clause4" && <Clause4Form />}
      {clause === "clause6" && <Clause6Form />}
    </div>
  );
}

/** `useSearchParams`는 Suspense 경계가 필요하다(Next.js App Router). */
export default function PublicInterestPostMgmtPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">불러오는 중…</div>}>
      <PublicInterestPostMgmtInner />
    </Suspense>
  );
}
