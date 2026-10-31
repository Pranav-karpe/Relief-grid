import { useEffect, useRef } from 'react'

export type MapMarker = {
  id: string
  /** GeoJSON order: [longitude, latitude] */
  coordinates: [number, number]
  label: string
  detail?: string
  tone?: 'default' | 'warning' | 'error' | 'success'
}

type Props = {
  markers: MapMarker[]
  /** Height of the map container, default 320px */
  height?: number
  /** Accessible heading for the list alternative */
  listHeading?: string
}

function isValidCoord(coords: [number, number]): boolean {
  const [lng, lat] = coords
  return (
    Number.isFinite(lng) && lng >= -180 && lng <= 180 &&
    Number.isFinite(lat) && lat >= -90 && lat <= 90
  )
}

const TONE_COLOR: Record<string, string> = {
  default: '#4f8cff',
  warning: '#fbbf24',
  error: '#fb7185',
  success: '#34d399',
}

/**
 * Reusable Leaflet/OpenStreetMap map component.
 * Uses OpenStreetMap tiles (free, attribution required).
 * Coordinates follow GeoJSON order: [longitude, latitude].
 * Provides an accessible list alternative below the map.
 */
export default function LocationMap({ markers, height = 320, listHeading = 'Locations' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)

  const validMarkers = markers.filter((m) => isValidCoord(m.coordinates))

  useEffect(() => {
    if (!containerRef.current) return
    if (validMarkers.length === 0) return

    let map: import('leaflet').Map

    // Dynamically import leaflet to avoid SSR issues and keep bundle split
    import('leaflet').then((L) => {
      if (!containerRef.current) return

      // Fix default icon paths broken by bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      // [lat, lng] for Leaflet (opposite of GeoJSON)
      const center: [number, number] = [
        validMarkers[0].coordinates[1],
        validMarkers[0].coordinates[0],
      ]

      map = L.map(containerRef.current!).setView(center, 10)
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      const bounds: [number, number][] = []

      for (const m of validMarkers) {
        const [lng, lat] = m.coordinates
        const color = TONE_COLOR[m.tone ?? 'default']

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        })

        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(`<strong>${m.label}</strong>${m.detail ? `<br><span style="font-size:12px">${m.detail}</span>` : ''}`)

        marker.on('keydown', (e: import('leaflet').LeafletKeyboardEvent) => {
          if (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ') marker.openPopup()
        })

        bounds.push([lat, lng])
      }

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [32, 32] })
      }
    }).catch(() => {
      // Leaflet failed to load — the list fallback is always rendered
    })

    return () => {
      map?.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers.map((m) => m.id).join(',')])

  if (markers.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-raised px-4 py-6 text-center">
        <p className="text-sm text-muted">No location data available.</p>
      </div>
    )
  }

  const invalidCount = markers.length - validMarkers.length

  return (
    <div className="grid gap-3">
      {/* Map container */}
      {validMarkers.length > 0 ? (
        <div
          ref={containerRef}
          style={{ height, borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--color-border)' }}
          aria-label={listHeading}
          role="img"
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface-raised px-4 py-6 text-center">
          <p className="text-sm text-muted">No valid coordinates to display.</p>
        </div>
      )}

      {invalidCount > 0 && (
        <p className="text-xs text-muted" role="note">
          {invalidCount} location{invalidCount > 1 ? 's' : ''} could not be shown due to missing or invalid coordinates.
        </p>
      )}

      {/* Accessible list alternative */}
      <details className="rounded-lg border border-line bg-surface-raised">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-muted hover:text-content select-none">
          {listHeading} — text list ({validMarkers.length})
        </summary>
        <ul className="divide-y divide-line px-4 pb-2" aria-label={listHeading}>
          {validMarkers.map((m) => (
            <li key={m.id} className="py-2 text-sm">
              <span className="font-medium text-content">{m.label}</span>
              {m.detail && <span className="ml-2 text-muted">{m.detail}</span>}
              <span className="ml-2 font-mono text-xs text-muted">
                ({m.coordinates[1].toFixed(4)}, {m.coordinates[0].toFixed(4)})
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
