'use client';

import { useEffect, useRef } from 'react';

export type DeviceMarker = {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  current_speed: number | null;
  speed_limit: number;
  last_seen: string | null;
  full_name: string | null;
  student_code: string | null;
  class_name: string | null;
  online: number;
  overspeed: number;
};

export type TrailPoint = { device_id: string; latitude: number; longitude: number; recorded_at: string };

export function DeviceMap({ markers, trail }: { markers: DeviceMarker[]; trail: TrailPoint[] }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import('leaflet').Map | undefined;
    let disposed = false;
    async function draw() {
      if (!element.current) return;
      const L = await import('leaflet');
      if (disposed || !element.current) return;
      const activeMap = L.map(element.current, { zoomControl: true }).setView([10.7769, 106.7009], 12);
      map = activeMap;
      // Carto is used instead of OSM's public tiles because it is more reliable
      // in this dashboard's browser environment.
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(activeMap);
      const bounds: [number, number][] = [];
      const colors = ['#2563eb', '#7c3aed', '#ea580c', '#0891b2'];
      [...new Set(trail.map((point) => point.device_id))].forEach((deviceId, index) => {
        const path = trail.filter((point) => point.device_id === deviceId).map((point) => [point.latitude, point.longitude] as [number, number]);
        if (path.length > 1) L.polyline(path, { color: colors[index % colors.length], weight: 5, opacity: 0.8 }).addTo(activeMap);
        bounds.push(...path);
      });
      markers.forEach((item) => {
        const color = item.overspeed ? '#dc2626' : item.online ? '#059669' : '#64748b';
        const icon = L.divIcon({ className: 'device-map-marker', html: `<span style="background:${color}"></span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
        L.marker([item.latitude, item.longitude], { icon }).addTo(activeMap).bindPopup(`<strong>${item.device_id}</strong><br/>Tốc độ: ${Number(item.current_speed ?? 0).toFixed(1)} km/h`);
        bounds.push([item.latitude, item.longitude]);
      });
      if (bounds.length === 1) activeMap.setView(bounds[0], 16);
      if (bounds.length > 1) activeMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    }
    void draw();
    return () => { disposed = true; map?.remove(); };
  }, [markers, trail]);

  if (markers.length === 0) return <div className="grid min-h-96 place-items-center rounded-xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">Chưa có vị trí GPS hợp lệ để hiển thị trên bản đồ.</div>;
  const primary = markers[0];
  const coordinate = `${primary.latitude.toFixed(6)}, ${primary.longitude.toFixed(6)}`;
  const mapQuery = encodeURIComponent(`${primary.latitude},${primary.longitude}`);
  const mapsUrl = `https://www.google.com/maps?q=${mapQuery}`;
  return <div className="space-y-3">
    <div ref={element} className="h-[520px] overflow-hidden rounded-xl border" aria-label="Bản đồ thời gian thực" />
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-semibold">Vị trí thời gian thực · {primary.device_id}</p><p className="mt-1 text-muted-foreground">{coordinate} · {primary.last_seen ? new Date(primary.last_seen).toLocaleString('vi-VN') : 'vừa cập nhật'} · Làm mới mỗi 5 giây</p></div>
      <a className="button-primary shrink-0 text-center" href={mapsUrl} target="_blank" rel="noreferrer">Mở toàn màn hình</a>
    </div>
  </div>;
}
