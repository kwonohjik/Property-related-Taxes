"use client";

/**
 * LinearInterpolationGraph — 주택 6~9억 선형보간 세율 시각화
 *
 * 취득가액이 6억~9억 구간일 때 적용 세율을 그래프로 표시.
 * SVG 진행 바 + 산식 풀이 + 결과값 highlight.
 *
 * 산식: 세율 = (취득가액 × 2 / 300,000,000 - 3) / 100
 * 정밀도: 소수점 5자리 (0.01667 → 1.667%)
 */

interface Props {
  acquisitionValue: number;
  appliedRate: number;
}

// 선형보간 산식 — 엔진과 동일 로직 (표시 전용)
function calcLinearRate(value: number): number {
  // (value × 2 / 3억 - 3) / 100 → 소수점 5자리
  const rate = (value * 2 / 300_000_000 - 3) / 100;
  return Math.round(rate * 100000) / 100000;
}

function formatRate(rate: number): string {
  return (rate * 100).toFixed(5).replace(/\.?0+$/, "") + "%";
}

function formatKRW(v: number): string {
  return (v / 100_000_000).toFixed(2).replace(/\.?0+$/, "") + "억";
}

export function LinearInterpolationGraph({ acquisitionValue, appliedRate }: Props) {
  const MIN = 600_000_000;
  const MAX = 900_000_000;
  const MIN_RATE = 0.01;
  const MAX_RATE = 0.03;

  // 0~1 진행률 (클램핑)
  const progress = Math.max(0, Math.min(1, (acquisitionValue - MIN) / (MAX - MIN)));

  // SVG 레이아웃 상수
  const W = 320;
  const H = 80;
  const PAD_L = 32;
  const PAD_R = 32;
  const BAR_Y = 48;
  const BAR_H = 8;
  const TRACK_W = W - PAD_L - PAD_R;
  const dotX = PAD_L + TRACK_W * progress;
  const dotY = BAR_Y + BAR_H / 2;

  // 산식 풀이용
  const ratePercent = (appliedRate * 100).toFixed(5).replace(/\.?0+$/, "");
  const numeratorStr = (acquisitionValue / 100_000_000 * 2).toFixed(4).replace(/\.?0+$/, "");

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">
        6~9억 선형보간 구간 세율 시각화
      </p>

      {/* 그래프 */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label={`취득가액 ${formatKRW(acquisitionValue)} 기준 적용 세율 ${ratePercent}%`}
      >
        {/* 트랙 배경 */}
        <rect
          x={PAD_L}
          y={BAR_Y}
          width={TRACK_W}
          height={BAR_H}
          rx={BAR_H / 2}
          className="fill-muted"
        />

        {/* 채워진 진행 바 */}
        <rect
          x={PAD_L}
          y={BAR_Y}
          width={TRACK_W * progress}
          height={BAR_H}
          rx={BAR_H / 2}
          className="fill-violet-400"
        />

        {/* 점 (현재 위치) */}
        <circle
          cx={dotX}
          cy={dotY}
          r={7}
          className="fill-violet-600 stroke-white stroke-2"
        />

        {/* 좌측 라벨: 6억 / 1% */}
        <text x={PAD_L} y={BAR_Y - 8} className="fill-muted-foreground text-[10px]" fontSize={10} textAnchor="middle">
          6억
        </text>
        <text x={PAD_L} y={H - 4} className="fill-muted-foreground" fontSize={9} textAnchor="middle">
          1%
        </text>

        {/* 우측 라벨: 9억 / 3% */}
        <text x={W - PAD_R} y={BAR_Y - 8} className="fill-muted-foreground" fontSize={10} textAnchor="middle">
          9억
        </text>
        <text x={W - PAD_R} y={H - 4} className="fill-muted-foreground" fontSize={9} textAnchor="middle">
          3%
        </text>

        {/* 현재값 라벨 (점 위) */}
        <text
          x={dotX}
          y={BAR_Y - 10}
          fontSize={10}
          textAnchor={progress < 0.2 ? "start" : progress > 0.8 ? "end" : "middle"}
          className="fill-violet-700 font-bold"
          fontWeight="600"
        >
          {formatKRW(acquisitionValue)}
        </text>
      </svg>

      {/* 세율 결과 highlight */}
      <div className="flex items-center justify-between rounded-md bg-violet-50/70 border border-violet-200 px-3 py-2">
        <span className="text-xs text-violet-700">
          취득가액 {(acquisitionValue / 100_000_000).toLocaleString("ko-KR")}억 원 적용 세율
        </span>
        <span className="text-sm font-bold text-violet-800">
          {ratePercent}%
        </span>
      </div>

      {/* 산식 풀이 */}
      <div className="text-[11px] text-muted-foreground space-y-0.5 font-mono bg-muted/30 rounded p-2">
        <p>세율 = (취득가액 × 2 ÷ 3억 − 3) ÷ 100</p>
        <p>
          = ({numeratorStr} − 3) ÷ 100
          {" "}= {((acquisitionValue * 2 / 300_000_000 - 3)).toFixed(5).replace(/\.?0+$/, "")} ÷ 100
        </p>
        <p className="font-semibold text-foreground">
          = {ratePercent}% (소수점 5자리)
        </p>
      </div>

      {/* 경계값 안내 */}
      <p className="text-[10px] text-muted-foreground">
        6억 정확히 → 1%, 9억 정확히 → 3% (경계값 직접 매핑, 보간 미적용)
      </p>
    </div>
  );
}
