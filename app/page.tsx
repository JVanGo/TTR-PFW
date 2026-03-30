import Link from 'next/link';
import RatingConverter from '@/components/rating-converter';

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <p className="text-3xl mb-2">🏓</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Table Tennis Rating Converter
          </h1>
          <p className="mt-3 text-base text-gray-600">
            Enter a player&apos;s foreign rating to see the estimated equivalent{' '}
            <strong>FLTT Performance-Wert (PFW)</strong> and division classification.
          </p>
        </div>

        {/* Converter card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <RatingConverter />
        </div>

        {/* Ranking link */}
        <div className="mt-6 text-center">
          <Link
            href="/ranking"
            className="text-sm text-blue-600 hover:underline"
          >
            View FLTT ranking with estimated TTR →
          </Link>
        </div>

        {/* Footer note */}
        <p className="mt-3 text-center text-xs text-gray-400">
          A proof of concept for the Luxembourg Table Tennis Federation.
          Conversion figures are estimates only.
        </p>
      </div>
    </main>
  );
}
