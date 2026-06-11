"use client";

/**
 * 건물 기준시가 계산기 — 독립 도구 페이지.
 * 토지를 제외한 건물의 기준시가를 산정(양도 환산취득가·상속증여 보충적 평가 입력용).
 * 국세청 「건물 기준시가 계산방법」 고시(법령 조문 아님). 클라이언트 엔진 직접 호출(이력 저장 없음).
 */
import { useState } from "react";
import { Printer } from "lucide-react";
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import { BuildingStdPriceResultCard } from "@/components/calc/building-std-price/BuildingStdPriceResultCard";
import { NtsBuildingStdPriceReport } from "@/components/calc/building-std-price/nts-report/NtsBuildingStdPriceReport";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import type { BuildingStandardPriceResult } from "@/lib/tax-engine/building-standard-price";
import type { NtsReportModel } from "@/lib/calc/nts-report-adapter";

export default function BuildingStandardPricePage() {
  const [result, setResult] = useState<BuildingStandardPriceResult | null>(null);
  const [floorArea, setFloorArea] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<NtsReportModel | null>(null);

  return (
    <main className="mx-auto max-w-[63rem] px-4 py-6">
      <div className="mb-3 flex justify-end print:hidden">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 사라집니다.&#10;계속하시겠습니까?" />
      </div>
      <header className="mb-5 print:hidden">
        <h1 className="text-xl font-bold">건물 기준시가 계산기</h1>
        <p className="mt-1 text-sm text-slate-500">
          국세청 「건물 기준시가 계산방법」 고시 기준. 토지를 제외한 건물분 기준시가를 산정합니다.
        </p>
      </header>

      <div className="print:hidden">
        <BuildingStdPriceForm
          onResult={(r, fa, err, rep) => {
            setResult(r);
            setFloorArea(fa);
            setError(err);
            setReport(rep);
          }}
        />
      </div>

      {error && (
        <p
          data-testid="bsp-error"
          className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 print:hidden"
        >
          {error}
        </p>
      )}

      {result && (
        <>
          <section className="mt-6 print:hidden" data-testid="bsp-result">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => window.print()}
                data-testid="bsp-print"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Printer className="h-3.5 w-3.5" />
                인쇄 / PDF 저장
              </button>
            </div>
            <BuildingStdPriceResultCard result={result} floorArea={floorArea} />
          </section>

          {/* 국세청 「건물 기준시가 계산서」 서식 — 화면 접힘 / 인쇄 자동 펼침 */}
          {report && <NtsBuildingStdPriceReport model={report} />}
        </>
      )}
    </main>
  );
}
