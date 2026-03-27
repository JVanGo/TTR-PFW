'use client';

import { useState } from 'react';
import { ratingSystems } from '@/data/ratings';
import { convertToLuxembourg } from '@/lib/conversions';

export default function RatingConverter() {
  const [systemId, setSystemId] = useState('');
  const [inputValue, setInputValue] = useState('');

  const selectedSystem = ratingSystems.find((s) => s.id === systemId);
  const parsedRating = parseFloat(inputValue);
  const isValidInput = selectedSystem && !isNaN(parsedRating) && parsedRating >= 0;
  const result = isValidInput ? convertToLuxembourg(systemId, parsedRating) : null;

  const confidenceColour = {
    high: 'text-green-700 bg-green-50 border-green-200',
    medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    low: 'text-red-700 bg-red-50 border-red-200',
  };

  const confidenceLabel = {
    high: 'Reliable estimate',
    medium: 'Approximate estimate',
    low: 'Rough guide only',
  };

  return (
    <div className="w-full space-y-6">
      {/* Country / System picker */}
      <div>
        <label htmlFor="system" className="block text-sm font-medium text-gray-700 mb-1">
          Player&apos;s country / rating system
        </label>
        <select
          id="system"
          value={systemId}
          onChange={(e) => {
            setSystemId(e.target.value);
            setInputValue('');
          }}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">— Select a country —</option>
          {ratingSystems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.country} — {s.name}
            </option>
          ))}
        </select>
        {selectedSystem && (
          <p className="mt-1 text-sm text-gray-500">{selectedSystem.description}</p>
        )}
      </div>

      {/* Rating input */}
      {selectedSystem && (
        <div>
          <label htmlFor="rating" className="block text-sm font-medium text-gray-700 mb-1">
            Player&apos;s {selectedSystem.name} rating
          </label>
          <input
            id="rating"
            type="number"
            min={selectedSystem.min}
            max={selectedSystem.max}
            step={selectedSystem.id === 'belgium-index' ? 0.1 : 1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`e.g. ${selectedSystem.placeholder}`}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <p className="mt-1 text-sm text-gray-500">
            Typical range: {selectedSystem.min} – {selectedSystem.max}
          </p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6 space-y-3">
          <p className="text-sm font-medium text-blue-600 uppercase tracking-wide">
            Estimated Luxembourg Rating
          </p>
          <p className="text-5xl font-bold text-blue-900">{result.luxembourgRating}</p>

          <span
            className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${confidenceColour[result.confidence]}`}
          >
            {confidenceLabel[result.confidence]}
          </span>

          <p className="text-sm text-gray-600">{result.note}</p>

          <p className="text-xs text-gray-400 pt-2 border-t border-blue-200">
            All conversions are estimates only and should not be used as official ratings without
            validation by the Luxembourg Table Tennis Federation.
          </p>
        </div>
      )}

      {/* Empty state hint */}
      {!selectedSystem && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-gray-500">
            Select a country above to get started.
          </p>
        </div>
      )}
    </div>
  );
}
