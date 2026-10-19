'use client';

import { useEffect, useRef, useState } from 'react';

type LatLng = { lat: number; lng: number };
type LMap = {
  setView(c: [number, number], z: number): LMap;
  fitBounds(b: unknown, o?: object): void;
  on(ev: string, fn: (e: { latlng: LatLng }) => void): void;
  remove(): void;
};
type LLayer = {
  addTo(m: LMap): LLayer;
  setLatLng(c: [number, number]): void;
  setRadius(r: number): void;
  getBounds(): unknown;
  on(ev: string, fn: (e: { target: { getLatLng(): LatLng } }) => void): void;
  remove(): void;
};
type LeafletNS = {
  map(el: HTMLElement, o?: object): LMap;
  tileLayer(u: string, o: object): { addTo(m: LMap): void };
  marker(c: [number, number], o?: object): LLayer;
  circle(c: [number, number], o: object): LLayer;
  circleMarker(c: [number, number], o: object): LLayer;
  divIcon(o: object): unknown;
};
declare global {
  interface Window {
    L?: LeafletNS;
  }
}

const FT_TO_M = 0.3048;
let loading: Promise<LeafletNS> | null = null;

// Loads the free Leaflet map library + OpenStreetMap tiles the first time a map is shown.
function loadLeaflet(): Promise<LeafletNS> {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise<LeafletNS>((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
    s.onload = () => (window.L ? resolve(window.L) : reject(new Error('Map failed to load')));
    s.onerror = () => reject(new Error('Map failed to load'));
    document.body.appendChild(s);
  });
  return loading;
}

export function GeoMap({
  lat,
  lng,
  radiusFt,
  editable = false,
  onMove,
  user,
  height = 280,
}: {
  lat: number;
  lng: number;
  radiusFt: number;
  editable?: boolean;
  onMove?: (lat: number, lng: number) => void;
  user?: { lat: number; lng: number } | null;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ref = useRef<{ L: LeafletNS; map: LMap; pin: LLayer; circle: LLayer; me: LLayer | null } | null>(null);
  const moveRef = useRef(onMove);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  moveRef.current = onMove;

  useEffect(() => {
    let dead = false;
    loadLeaflet()
      .then((L) => {
        if (dead || !box.current || ref.current) return;
        const map = L.map(box.current, { zoomControl: true }).setView([lat, lng], 17);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        const icon = L.divIcon({
          className: '',
          html: '<div style="width:22px;height:22px;border-radius:50%;background:#0A365D;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const pin = L.marker([lat, lng], { icon, draggable: editable }).addTo(map);
        const circle = L.circle([lat, lng], {
          radius: radiusFt * FT_TO_M,
          color: '#C1571A',
          weight: 2.5,
          fillColor: '#C1571A',
          fillOpacity: 0.15,
        }).addTo(map);
        if (editable) {
          pin.on('dragend', (e) => {
            const p = e.target.getLatLng();
            moveRef.current?.(p.lat, p.lng);
          });
          map.on('click', (e) => moveRef.current?.(e.latlng.lat, e.latlng.lng));
        }
        map.fitBounds(circle.getBounds(), { padding: [24, 24] });
        ref.current = { L, map, pin, circle, me: null };
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      if (ref.current) {
        ref.current.map.remove();
        ref.current = null;
      }
    };
    // map is created once; later changes are applied by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const r = ref.current;
    if (!r) return;
    r.pin.setLatLng([lat, lng]);
    r.circle.setLatLng([lat, lng]);
    r.circle.setRadius(radiusFt * FT_TO_M);
    r.map.fitBounds(r.circle.getBounds(), { padding: [24, 24] });
  }, [lat, lng, radiusFt, ready]);

  useEffect(() => {
    const r = ref.current;
    if (!r) return;
    if (r.me) {
      r.me.remove();
      r.me = null;
    }
    if (user) {
      r.me = r.L.circleMarker([user.lat, user.lng], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#2563EB',
        fillOpacity: 1,
      }).addTo(r.map);
    }
  }, [user?.lat, user?.lng, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-line bg-paper p-4 text-center text-xs text-ink-soft" style={{ height }}>
        The map could not load. Check your internet connection.
      </div>
    );
  }
  return <div ref={box} className="w-full overflow-hidden rounded-lg border border-line" style={{ height }} />;
}
