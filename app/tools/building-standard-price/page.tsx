"use client";

/**
 * 건물 기준시가 계산기 — 독립 도구 페이지.
 * 토지를 제외한 건물의 기준시가를 산정(양도 환산취득가·상속증여 보충적 평가 입력용).
 * 국세청 「건물 기준시가 계산방법」 고시(법령 조문 아님). 클라이언트 엔진 직접 호출(이력 저장 없음).
 */
import { useState } from "react";
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import { BuildingStdPriceResultCard } from "@/components/calc/building-std-price/BuildingStdPriceResultCard";
import type { BuildingStandardPriceResult } from "@/lib/tax-engine/building-standard-price";

export default function BuildingStandardPricePage() {
  const [result, setResult] = useState<BuildingStandardPriceResult | null>(null);
  const [floorArea, setFloorArea] = useState(0);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-[63rem] px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold">건물 기준시가 계산기</h1>
        <p className="mt-1 text-sm text-slate-500">
          국세청 「건물 기준시가 계산방법」 고시 기준. 토지를 제외한 건물분 기준시가를 산정합니다.
        </p>
      </header>

      <BuildingStdPriceForm
        onResult={(r, fa, err) => {
          setResult(r);
          setFloorArea(fa);
          setError(err);
        }}
      />

      {error && (
        <p data-testid="bsp-error" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {result && (
        <section className="mt-6" data-testid="bsp-result">
          <BuildingStdPriceResultCard result={result} floorArea={floorArea} />
        </section>
      )}
    </main>
  );
}
