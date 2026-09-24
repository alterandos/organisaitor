import { describe, expect, it } from 'vitest';
import { mapSportType } from './strava';

describe('mapSportType', () => {
  it.each([
    ['Run', 'run'], ['TrailRun', 'run'],
    ['Hike', 'hike'],
    ['Walk', 'walk'],
    ['Ride', 'ride'], ['VirtualRide', 'ride'], ['GravelRide', 'ride'], ['MountainBikeRide', 'ride'], ['EBikeRide', 'ride'],
    ['Swim', 'swim'],
    ['WeightTraining', 'strength'], ['Workout', 'strength'], ['Crossfit', 'strength'], ['HIIT', 'strength'],
    ['Yoga', 'yoga'],
  ])('%s -> %s', (input, expected) => {
    expect(mapSportType(input)).toBe(expected);
  });

  it('an unrecognised sport_type falls back to "other" rather than being dropped', () => {
    expect(mapSportType('SomeNewSportStravaAddsLater')).toBe('other');
  });

  it('undefined (no sport_type at all) also falls back to "other"', () => {
    expect(mapSportType(undefined)).toBe('other');
  });
});
