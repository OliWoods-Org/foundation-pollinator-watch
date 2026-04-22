/**
 * Habitat Mapper — Map and assess pollinator habitat quality.
 * @module habitat-mapper
 * @license GPL-3.0
 * @author OliWoods Foundation
 */
import { z } from 'zod';

export const HabitatSiteSchema = z.object({
  id: z.string().uuid(), name: z.string(), location: z.object({ lat: z.number(), lng: z.number() }),
  areaHectares: z.number().positive(), type: z.enum(['wildflower-meadow', 'hedgerow', 'orchard', 'garden', 'wetland', 'forest-edge', 'urban-green', 'agricultural']),
  floweringPlants: z.array(z.object({ species: z.string(), bloomPeriod: z.object({ start: z.number().int().min(1).max(12), end: z.number().int().min(1).max(12) }), nectarValue: z.enum(['high', 'medium', 'low']) })),
  pesticideUse: z.enum(['none', 'organic-only', 'targeted', 'conventional']),
  nestingSites: z.boolean(), waterSource: z.boolean(),
  lastSurvey: z.string().datetime(),
});

export const HabitatQualitySchema = z.object({
  siteId: z.string(), score: z.number().min(0).max(100),
  floralDiversity: z.number().min(0).max(100), seasonalContinuity: z.number().min(0).max(100),
  nestingAvailability: z.number().min(0).max(100), pesticideRisk: z.number().min(0).max(100),
  improvements: z.array(z.object({ action: z.string(), impact: z.enum(['high', 'medium', 'low']), cost: z.string(), timing: z.string() })),
});

export type HabitatSite = z.infer<typeof HabitatSiteSchema>;
export type HabitatQuality = z.infer<typeof HabitatQualitySchema>;

export function assessHabitatQuality(site: HabitatSite): HabitatQuality {
  // Floral diversity (30% weight)
  const floralScore = Math.min(100, site.floweringPlants.length * 10);
  // Seasonal continuity — are there flowers every month? (25%)
  const monthsCovered = new Set<number>();
  for (const plant of site.floweringPlants) {
    for (let m = plant.bloomPeriod.start; m <= plant.bloomPeriod.end; m++) monthsCovered.add(m);
    if (plant.bloomPeriod.start > plant.bloomPeriod.end) { // wraps around year
      for (let m = plant.bloomPeriod.start; m <= 12; m++) monthsCovered.add(m);
      for (let m = 1; m <= plant.bloomPeriod.end; m++) monthsCovered.add(m);
    }
  }
  const seasonalScore = Math.round((monthsCovered.size / 12) * 100);
  // Nesting (20%)
  const nestingScore = site.nestingSites ? 80 : 20;
  // Pesticide risk (25%) — inverted
  const pesticideRisk: Record<string, number> = { none: 100, 'organic-only': 80, targeted: 50, conventional: 10 };
  const pesticideScore = pesticideRisk[site.pesticideUse];
  const overall = Math.round(floralScore * 0.30 + seasonalScore * 0.25 + nestingScore * 0.20 + pesticideScore * 0.25);
  const improvements: HabitatQuality['improvements'] = [];
  if (seasonalScore < 70) improvements.push({ action: 'Plant late-season flowers (asters, goldenrod) and early-season (crocus, willow)', impact: 'high', cost: '$50-200', timing: 'Fall planting' });
  if (!site.nestingSites) improvements.push({ action: 'Add nesting habitat: leave bare soil patches, install bee hotels, keep dead wood', impact: 'high', cost: '$0-100', timing: 'Any time' });
  if (site.pesticideUse === 'conventional') improvements.push({ action: 'Transition to IPM or organic pest management', impact: 'high', cost: 'Varies', timing: 'Next growing season' });
  if (floralScore < 50) improvements.push({ action: 'Increase plant diversity with native wildflower seed mix', impact: 'medium', cost: '$30-150', timing: 'Spring or fall sowing' });
  if (!site.waterSource) improvements.push({ action: 'Add a shallow water source with landing stones', impact: 'low', cost: '$10-30', timing: 'Any time' });
  return HabitatQualitySchema.parse({
    siteId: site.id, score: overall, floralDiversity: floralScore,
    seasonalContinuity: seasonalScore, nestingAvailability: nestingScore,
    pesticideRisk: pesticideScore, improvements,
  });
}

export function recommendPlantingPlan(lat: number, currentPlants: string[]): {
  earlyBloom: string[]; midBloom: string[]; lateBloom: string[]; nativeSpecies: boolean; notes: string;
} {
  // Simplified for temperate North America — would use location for regional recommendations
  return {
    earlyBloom: ['Crocus', 'Willow', 'Redbud', 'Blueberry'].filter(p => !currentPlants.includes(p)),
    midBloom: ['Lavender', 'Echinacea', 'Black-eyed Susan', 'Milkweed', 'Clover'].filter(p => !currentPlants.includes(p)),
    lateBloom: ['Goldenrod', 'Aster', 'Sedum', 'Joe-Pye Weed'].filter(p => !currentPlants.includes(p)),
    nativeSpecies: true,
    notes: 'Prioritize native species — they provide 4x more pollinator food than non-native ornamentals. Avoid double-flowered cultivars (they lack nectar). Leave some areas unmowed for ground-nesting bees.',
  };
}
