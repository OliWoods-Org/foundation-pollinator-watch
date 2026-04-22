/**
 * Acoustic Detector — Detect and classify pollinators using bioacoustic monitoring.
 * @module acoustic-detector
 * @license GPL-3.0
 * @author OliWoods Foundation
 */
import { z } from 'zod';

export const AudioRecordingSchema = z.object({
  id: z.string().uuid(), sensorId: z.string(), location: z.object({ lat: z.number(), lng: z.number(), name: z.string() }),
  recordedAt: z.string().datetime(), durationSeconds: z.number().positive(), sampleRateHz: z.number().int().positive(),
  weatherConditions: z.object({ temperature: z.number(), humidity: z.number(), windSpeed: z.number() }).optional(),
});

export const PollinatorDetectionSchema = z.object({
  id: z.string().uuid(), recordingId: z.string(), timestampInRecording: z.number(),
  species: z.enum(['honeybee', 'bumblebee', 'solitary-bee', 'wasp', 'hoverfly', 'butterfly', 'moth', 'beetle', 'unknown']),
  confidence: z.number().min(0).max(1),
  wingbeatFrequencyHz: z.number().positive(),
  flightDurationSeconds: z.number().positive(),
  behaviorEstimate: z.enum(['foraging', 'transit', 'hovering', 'unknown']),
});

export const BiodiversityIndexSchema = z.object({
  siteId: z.string(), period: z.object({ start: z.string(), end: z.string() }),
  shannonIndex: z.number(), simpsonIndex: z.number(), speciesRichness: z.number().int(),
  totalDetections: z.number().int(), dominantSpecies: z.string(),
  speciesBreakdown: z.array(z.object({ species: z.string(), count: z.number().int(), percentage: z.number() })),
  trend: z.enum(['increasing', 'stable', 'declining', 'insufficient-data']),
  healthAssessment: z.string(),
});

export type AudioRecording = z.infer<typeof AudioRecordingSchema>;
export type PollinatorDetection = z.infer<typeof PollinatorDetectionSchema>;
export type BiodiversityIndex = z.infer<typeof BiodiversityIndexSchema>;

// Wingbeat frequency ranges for classification
const WINGBEAT_RANGES: Record<string, { min: number; max: number }> = {
  'honeybee': { min: 200, max: 250 }, 'bumblebee': { min: 130, max: 180 },
  'solitary-bee': { min: 180, max: 280 }, 'wasp': { min: 100, max: 200 },
  'hoverfly': { min: 150, max: 300 }, 'butterfly': { min: 10, max: 20 },
  'moth': { min: 25, max: 70 }, 'beetle': { min: 50, max: 100 },
};

export function classifyByWingbeat(frequencyHz: number): { species: string; confidence: number } {
  let bestMatch = 'unknown';
  let bestScore = 0;
  for (const [species, range] of Object.entries(WINGBEAT_RANGES)) {
    if (frequencyHz >= range.min && frequencyHz <= range.max) {
      const mid = (range.min + range.max) / 2;
      const width = range.max - range.min;
      const score = 1 - Math.abs(frequencyHz - mid) / (width / 2);
      if (score > bestScore) { bestScore = score; bestMatch = species; }
    }
  }
  return { species: bestMatch, confidence: Math.round(bestScore * 1000) / 1000 };
}

export function calculateBiodiversityIndex(detections: PollinatorDetection[], siteId: string, periodStart: string, periodEnd: string): BiodiversityIndex {
  const speciesCounts = new Map<string, number>();
  for (const d of detections) speciesCounts.set(d.species, (speciesCounts.get(d.species) || 0) + 1);
  const total = detections.length;
  const species = Array.from(speciesCounts.entries());
  // Shannon Index: H = -sum(p_i * ln(p_i))
  let shannon = 0;
  for (const [, count] of species) { const p = count / total; if (p > 0) shannon -= p * Math.log(p); }
  // Simpson Index: D = 1 - sum(p_i^2)
  let simpson = 1;
  for (const [, count] of species) { const p = count / total; simpson -= p * p; }
  const dominant = species.sort(([, a], [, b]) => b - a)[0];
  const breakdown = species.map(([sp, count]) => ({ species: sp, count, percentage: Math.round((count / total) * 100) }));
  const healthAssessment = shannon > 1.5 ? 'Healthy: High biodiversity with good species distribution'
    : shannon > 1.0 ? 'Moderate: Acceptable diversity but dominated by few species'
    : shannon > 0.5 ? 'Concerning: Low diversity — investigate habitat quality'
    : 'Critical: Very low diversity — urgent habitat intervention needed';
  return BiodiversityIndexSchema.parse({
    siteId, period: { start: periodStart, end: periodEnd },
    shannonIndex: Math.round(shannon * 1000) / 1000, simpsonIndex: Math.round(simpson * 1000) / 1000,
    speciesRichness: species.length, totalDetections: total,
    dominantSpecies: dominant?.[0] || 'none', speciesBreakdown: breakdown,
    trend: 'insufficient-data', healthAssessment,
  });
}
