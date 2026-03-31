import Link from 'next/link';
import { rankingData } from '@/data/ranking';

const KL_ORDER = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'];

const klColour: Record<string, string> = {
  A1: 'bg-purple-100 text-purple-800',
  A2: 'bg-blue-100 text-blue-800',
  A3: 'bg-blue-50 text-blue-700',
  B1: 'bg-green-100 text-green-800',
  B2: 'bg-green-50 text-green-700',
  B3: 'bg-yellow-50 text-yellow-700',
  C1: 'bg-gray-100 text-gray-600',
  C2: 'bg-gray-100 text-gray-600',
  C3: 'bg-gray-100 text-gray-600',
  D1: 'bg-orange-50 text-orange-700',
  D2: 'bg-orange-50 text-orange-700',
  D3: 'bg-orange-50 text-orange-700',
};

export default function RankingPage({
  searchParams,
}: {
  searchParams: { kl?: string };
}) {
  const activeKl = searchParams.kl ?? 'all';
  const filtered =
    activeKl === 'all'
      ? rankingData
      : rankingData.filter((p) => p.kl === activeKl);

  return (
    <main className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
            ← Rating Converter
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            FLTT Ranking — Estimated TTR
          </h1>
          <p className="mt-2 text-gray-600">
            PFW values from the Verbandsrangliste 2026-01-01, converted to an estimated German TTR
            using the inverse regression{' '}
            <span className="font-mono text-sm bg-gray-100 px-1 rounded">
              TTR = (PFW + 587.68) / 0.596
            </span>{' '}
            (R² = 0.78, calibrated from 41 Luxembourg players).
          </p>
          <p className="mt-1 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 inline-block">
            These are estimates only. Individual players may differ significantly depending on their
            level of FLTT match activity.
          </p>
        </div>

        {/* Class filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          {['all', ...KL_ORDER].map((kl) => {
            const count = kl === 'all' ? rankingData.length : rankingData.filter((p) => p.kl === kl).length;
            return (
              <Link
                key={kl}
                href={kl === 'all' ? '/ranking' : `/ranking?kl=${kl}`}
                className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                  activeKl === kl
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {kl === 'all' ? `All (${count})` : `${kl} (${count})`}
              </Link>
            );
          })}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 w-12">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 w-16">Class</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 w-24">FLTT PFW</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 w-28">Est. TTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((player, idx) => (
                <tr key={`${player.name}-${player.pfw}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 tabular-nums">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{player.name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${klColour[player.kl] ?? 'bg-gray-100 text-gray-600'}`}>
                      {player.kl}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {player.pfw.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-700">
                    {player.estimatedTtr.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          {filtered.length} players shown · Source: FLTT Verbandsrangliste 2026-01-01
        </p>
      </div>
    </main>
  );
}
