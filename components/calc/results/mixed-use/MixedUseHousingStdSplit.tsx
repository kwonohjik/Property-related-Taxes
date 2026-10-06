"use client";

/**
 * 겸용주택 결과 — **주택분 기준시가 분할** 산식 (S3-2).
 *
 * 개별주택가격(주택건물 + 부수토지 결합 공시)을 토지분·건물분으로 나눈 과정이다. 양도가액·취득가액 안분과
 * 개산공제가 이 분할값을 쓴다. 엔진 echo(`housingPart.housingStdSplit`)를 **그대로 읽어** 풀어 쓴다 —
 * 분할을 여기서 다시 계산하지 않는다(재도출 금지). echo가 없는 결과(PHD·4부분·구 저장 이력)는 호출부가 그리지 않는다.
 *
 * 표기 규칙: 한국어 풀어쓰기 · 각 숫자 옆 변수명 라벨 · `floor` 묵시 · 중간 산술 미표시 · 건물분은 잔액 흡수(`개별주택가격 − …`).
 */
import type { MixedUseHousingStdSplitDetail } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { Frac, FLine } from "@/components/calc/results/shared/FormulaParts";
import { fmtPlain } from "@/components/calc/results/mixed-use/MixedUseResultCardParts";

type Split = { acq?: MixedUseHousingStdSplitDetail; transfer?: MixedUseHousingStdSplitDetail };

function Num({ id, v }: { id: string; v: number }) {
  return (
    <span className="font-mono tabular-nums font-medium text-foreground/90" data-testid={id}>
      {fmtPlain(v)}
    </span>
  );
}

function SplitLines({ time, d, tid }: { time: "취득시" | "양도시"; d: MixedUseHousingStdSplitDetail; tid: string }) {
  if (d.kind === "raw_ratio") {
    // 개별주택가격이 없는 상속·증여 신고가액 취득 — 취득가액을 가목:나목 원값 비율로 나눈다(basis = 원값).
    return (
      <div data-testid={tid} data-kind={d.kind} className="space-y-0.5">
        <FLine>
          {time} 개별주택가격 없음(신고가액 취득) — 취득가액을 토지 기준시가 : 주택건물 기준시가 비율로 나눕니다
        </FLine>
        <FLine>
          토지분 기준시가(토지 기준시가) <Num id={`${tid}-land`} v={d.landBasis} /> : 건물분 기준시가(주택건물 기준시가){" "}
          <Num id={`${tid}-building`} v={d.buildingBasis} />
        </FLine>
      </div>
    );
  }
  if (d.kind === "separate_date_converted") {
    // 토지·건물 취득일이 다름 — 집행기준 99-164-9: 건물 취득일 개별주택가격을 토지일 가목·건물일 나목 기준
    // 「취득당시 주택가격」으로 옮긴 뒤 그 가격을 토지일 가목 : 나목 비율로 나눈다.
    const landA = d.landStdAtLandAcq ?? 0;
    const converted = d.convertedHousingTotal ?? 0;
    return (
      <div data-testid={tid} data-kind={d.kind} className="space-y-0.5">
        <FLine>
          {time} 취득당시 주택가격 = 건물 취득일 개별주택가격 {fmtPlain(d.housingTotal)} ×{" "}
          <Frac
            top={`토지 취득일 토지 기준시가 ${fmtPlain(landA)} + 주택건물 기준시가 ${fmtPlain(d.buildingStd)}`}
            bottom={`건물 취득일 토지 기준시가 ${fmtPlain(d.landStd)} + 주택건물 기준시가 ${fmtPlain(d.buildingStd)}`}
          />{" "}
          = <Num id={`${tid}-converted`} v={converted} />
        </FLine>
        <FLine>
          {time} 토지분 기준시가 = 취득당시 주택가격 {fmtPlain(converted)} ×{" "}
          <Frac
            top={`토지 취득일 토지 기준시가 ${fmtPlain(landA)}`}
            bottom={`토지 취득일 토지 기준시가 ${fmtPlain(landA)} + 주택건물 기준시가 ${fmtPlain(d.buildingStd)}`}
          />{" "}
          = <Num id={`${tid}-land`} v={d.landBasis} />
        </FLine>
        <FLine>
          {time} 건물분 기준시가 = 취득당시 주택가격 {fmtPlain(converted)} − 토지분 {fmtPlain(d.landBasis)} ={" "}
          <Num id={`${tid}-building`} v={d.buildingBasis} />
        </FLine>
      </div>
    );
  }
  return (
    <div data-testid={tid} data-kind={d.kind} className="space-y-0.5">
      <FLine>
        {time} 토지분 기준시가 = 개별주택가격 {fmtPlain(d.housingTotal)} ×{" "}
        <Frac
          top={`토지 기준시가 ${fmtPlain(d.landStd)}`}
          bottom={`토지 기준시가 ${fmtPlain(d.landStd)} + 주택건물 기준시가 ${fmtPlain(d.buildingStd)}`}
        />{" "}
        = <Num id={`${tid}-land`} v={d.landBasis} />
      </FLine>
      <FLine>
        {time} 건물분 기준시가 = 개별주택가격 {fmtPlain(d.housingTotal)} − 토지분 {fmtPlain(d.landBasis)} ={" "}
        <Num id={`${tid}-building`} v={d.buildingBasis} />
      </FLine>
    </div>
  );
}

export function MixedUseHousingStdSplit({ split }: { split: Split }) {
  if (!split.acq && !split.transfer) return null;
  return (
    <div
      data-testid="mixed-housing-std-split"
      className="rounded-md bg-muted/30 px-3 py-2 text-caption text-muted-foreground/90 leading-snug space-y-1.5"
    >
      <span className="block font-medium text-foreground/80">주택분 기준시가 분할 (개별주택가격 → 토지분·건물분)</span>
      {split.acq && <SplitLines time="취득시" d={split.acq} tid="mixed-housing-std-split-acq" />}
      {split.transfer && <SplitLines time="양도시" d={split.transfer} tid="mixed-housing-std-split-transfer" />}
    </div>
  );
}
