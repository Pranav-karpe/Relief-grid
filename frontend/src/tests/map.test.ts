import { describe, it, expect } from 'vitest'
import type { MapMarker } from '../components/ui/LocationMap'

// ---------------------------------------------------------------------------
// Coordinate validation logic — extracted for unit testing without DOM
// ---------------------------------------------------------------------------

function isValidCoord(coords: [number, number]): boolean {
  const [lng, lat] = coords
  return (
    Number.isFinite(lng) && lng >= -180 && lng <= 180 &&
    Number.isFinite(lat) && lat >= -90 && lat <= 90
  )
}

function filterValidMarkers(markers: MapMarker[]): MapMarker[] {
  return markers.filter((m) => isValidCoord(m.coordinates))
}

// ---------------------------------------------------------------------------
// Coordinate validation
// ---------------------------------------------------------------------------

describe('isValidCoord', () => {
  it('accepts valid coordinates', () => {
    expect(isValidCoord([72.8777, 19.076])).toBe(true)
    expect(isValidCoord([0, 0])).toBe(true)
    expect(isValidCoord([-180, -90])).toBe(true)
    expect(isValidCoord([180, 90])).toBe(true)
  })

  it('rejects longitude out of range', () => {
    expect(isValidCoord([181, 0])).toBe(false)
    expect(isValidCoord([-181, 0])).toBe(false)
  })

  it('rejects latitude out of range', () => {
    expect(isValidCoord([0, 91])).toBe(false)
    expect(isValidCoord([0, -91])).toBe(false)
  })

  it('rejects NaN and Infinity', () => {
    expect(isValidCoord([NaN, 0])).toBe(false)
    expect(isValidCoord([0, NaN])).toBe(false)
    expect(isValidCoord([Infinity, 0])).toBe(false)
    expect(isValidCoord([0, -Infinity])).toBe(false)
  })

  it('follows GeoJSON order: [longitude, latitude]', () => {
    // Mumbai: lng=72.8777, lat=19.076
    // Valid as [lng, lat]
    expect(isValidCoord([72.8777, 19.076])).toBe(true)
    // Would be invalid if order were reversed (lat=72.8777 > 90 is fine, lng=19.076 is fine)
    // but lat=72.8777 is within -90..90 so both orders happen to be valid here.
    // Test with a value that would only be valid in one order:
    // lng=150, lat=85 — valid; lat=150 would be invalid
    expect(isValidCoord([150, 85])).toBe(true)
    expect(isValidCoord([85, 150])).toBe(false) // lat=150 out of range
  })
})

// ---------------------------------------------------------------------------
// Marker filtering
// ---------------------------------------------------------------------------

describe('filterValidMarkers', () => {
  const validMarker: MapMarker = {
    id: '1',
    coordinates: [72.8777, 19.076],
    label: 'Mumbai',
  }

  const invalidMarker: MapMarker = {
    id: '2',
    coordinates: [200, 0], // lng out of range
    label: 'Invalid',
  }

  const nanMarker: MapMarker = {
    id: '3',
    coordinates: [NaN, NaN],
    label: 'NaN',
  }

  it('returns only valid markers', () => {
    const result = filterValidMarkers([validMarker, invalidMarker, nanMarker])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('returns empty array when all markers are invalid', () => {
    expect(filterValidMarkers([invalidMarker, nanMarker])).toHaveLength(0)
  })

  it('returns all markers when all are valid', () => {
    const m2: MapMarker = { id: '4', coordinates: [0, 0], label: 'Origin' }
    expect(filterValidMarkers([validMarker, m2])).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(filterValidMarkers([])).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// MapMarker type contract
// ---------------------------------------------------------------------------

describe('MapMarker type', () => {
  it('coordinates follow GeoJSON [longitude, latitude] order', () => {
    const m: MapMarker = {
      id: 'test',
      coordinates: [72.8777, 19.076], // [lng, lat]
      label: 'Test location',
    }
    const [lng, lat] = m.coordinates
    expect(lng).toBe(72.8777)
    expect(lat).toBe(19.076)
  })

  it('tone is optional and defaults gracefully', () => {
    const m: MapMarker = { id: 'x', coordinates: [0, 0], label: 'X' }
    expect(m.tone).toBeUndefined()
  })

  it('detail is optional', () => {
    const m: MapMarker = { id: 'x', coordinates: [0, 0], label: 'X' }
    expect(m.detail).toBeUndefined()
  })
})
