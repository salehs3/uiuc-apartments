'use client'
// src/components/MapView.tsx

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type ApartmentPin = {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  rating_overall: number
  rent_min: number | null
  rent_max: number | null
}

type Landmark = {
  name: string
  lat: number
  lng: number
}

function getRatingColor(rating: number): string {
  if (rating >= 4) return '#22c55e'   // green
  if (rating >= 3) return '#f59e0b'   // yellow
  if (rating > 0)  return '#ef4444'   // red
  return '#9ca3af'                     // gray (no ratings)
}

export default function MapView({
  apartments,
  landmark,
}: {
  apartments: ApartmentPin[]
  landmark?: Landmark | null
}) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    // Center on UIUC campus
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-88.2272, 40.1020],
      zoom: 14,
      scrollZoom: true,
      touchPitch: false,
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Trackpads fire many small wheel events per swipe; the default rate
    // turns that into a fast, jumpy zoom. Tone it down a bit.
    map.current.scrollZoom.setWheelZoomRate(1 / 600)
    map.current.scrollZoom.setZoomRate(1 / 150)

    // The container's real size isn't settled until after the flex/grid
    // layout around it finishes. If Mapbox reads the size too early, its
    // canvas gets stretched via CSS instead of resized internally — that's
    // what causes the elongated look and broken zoom math. Keep the canvas
    // in sync with the container's actual size at all times.
    const resizeObserver = new ResizeObserver(() => map.current?.resize())
    resizeObserver.observe(mapContainer.current)

    return () => {
      resizeObserver.disconnect()
      markers.current.forEach((m) => m.remove())
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Add/update markers when apartments change
  useEffect(() => {
    if (!map.current) return

    // Remove old markers
    markers.current.forEach((m) => m.remove())
    markers.current = []

    // Chosen "nearest building" landmark — always shown so students don't
    // have to pan/scroll to find it relative to the apartments.
    if (landmark) {
      const landmarkEl = document.createElement('div')
      landmarkEl.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      `

      const pin = document.createElement('div')
      pin.style.cssText = `
        width: 28px; height: 28px;
        flex-shrink: 0;
        background: #dc2626;
        border: 3px solid #FAFAF8;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      `
      pin.textContent = '📍'

      const label = document.createElement('div')
      label.style.cssText = `
        background: #dc2626;
        color: white;
        font-family: -apple-system, sans-serif;
        font-weight: 700;
        font-size: 12px;
        padding: 4px 10px;
        border-radius: 999px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        white-space: nowrap;
      `
      label.textContent = landmark.name

      landmarkEl.appendChild(pin)
      landmarkEl.appendChild(label)

      const landmarkMarker = new mapboxgl.Marker({ element: landmarkEl, anchor: 'left' })
        .setLngLat([landmark.lng, landmark.lat])
        .addTo(map.current!)
      markers.current.push(landmarkMarker)
    }

    apartments.forEach((apt) => {
      if (!apt.lat || !apt.lng) return

      const color = getRatingColor(apt.rating_overall)

      // Custom marker element
      const el = document.createElement('div')
      el.style.cssText = `
        width: 32px; height: 32px;
        background: ${color};
        border: 3px solid #FAFAF8;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: white;
      `
      el.textContent = apt.rating_overall > 0 ? apt.rating_overall.toFixed(1) : ''

      const rentLabel =
        apt.rent_min && apt.rent_max
          ? `$${apt.rent_min}–$${apt.rent_max}/mo`
          : 'Rent TBD'

      const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
        .setHTML(`
          <div style="font-family: -apple-system, sans-serif; min-width: 180px;">
            <div style="font-weight: 700; font-size: 13px; color: #13294B; margin-bottom: 2px;">
              ${apt.name}
            </div>
            <div style="font-size: 11px; color: #78716C; margin-bottom: 6px;">
              ${apt.address}
            </div>
            <div style="font-size: 12px; font-weight: 600; color: #13294B; margin-bottom: 8px;">
              ${rentLabel}
              ${apt.rating_overall > 0 ? `· ⭐ ${apt.rating_overall.toFixed(1)}` : ''}
            </div>
            <a
              href="/apartments/${apt.id}"
              style="
                display: block; text-align: center;
                background: #E84A27; color: white;
                padding: 6px 12px; border-radius: 8px;
                font-size: 12px; font-weight: 600;
                text-decoration: none;
              "
            >
              View details →
            </a>
          </div>
        `)

      const marker = new mapboxgl.Marker(el)
        .setLngLat([apt.lng, apt.lat])
        .setPopup(popup)
        .addTo(map.current!)

      markers.current.push(marker)
    })

    // Fit map to show all apartment markers plus the chosen landmark, so
    // nobody has to pan/scroll to find it.
    const validApts = apartments.filter((a) => a.lat && a.lng)
    const totalPoints = validApts.length + (landmark ? 1 : 0)

    if (totalPoints === 1) {
      const only = landmark ?? validApts[0]
      map.current.flyTo({ center: [only.lng, only.lat], zoom: 15 })
    } else if (totalPoints > 1) {
      const bounds = new mapboxgl.LngLatBounds()
      validApts.forEach((a) => bounds.extend([a.lng, a.lat]))
      if (landmark) bounds.extend([landmark.lng, landmark.lat])

      if (landmark) {
        // Pull the camera slightly toward the landmark and in a touch
        // closer, instead of just centering on the bounding box midpoint.
        const camera = map.current.cameraForBounds(bounds, { padding: 60, maxZoom: 15 })
        if (camera?.center) {
          const bias = 0.25
          const center: [number, number] = [
            (camera.center as mapboxgl.LngLat).lng + (landmark.lng - (camera.center as mapboxgl.LngLat).lng) * bias,
            (camera.center as mapboxgl.LngLat).lat + (landmark.lat - (camera.center as mapboxgl.LngLat).lat) * bias,
          ]
          map.current.easeTo({
            center,
            zoom: Math.min((camera.zoom ?? 14) + 0.5, 16),
          })
        } else {
          map.current.fitBounds(bounds, { padding: 60, maxZoom: 15 })
        }
      } else {
        map.current.fitBounds(bounds, { padding: 60, maxZoom: 15 })
      }
    }
  }, [apartments, landmark])

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-[#E2DED8]">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-[#FAFAF8] rounded-lg shadow-sm border border-[#E2DED8] px-3 py-2 flex gap-3">
        {[
          { color: '#22c55e', label: '4–5' },
          { color: '#f59e0b', label: '3–4' },
          { color: '#ef4444', label: '1–3' },
          { color: '#9ca3af', label: 'No rating' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-xs text-[#78716C]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
