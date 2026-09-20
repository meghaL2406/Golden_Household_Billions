import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Notice, PageHeader, Select, StatTile, StatRow } from "../../components";
import { api } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { titleCase } from "../../lib/format";
import { fmtNum, Options } from "./_shared";

const CENTER: [number, number] = [22.5, 71.5];
const DEFAULT_ZOOM = 7;
const POINT_ZOOM_THRESHOLD = 9;

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: "#147b65",
  PENDING_VERIFICATION: "#7a4b00",
  DRAFT: "#637083",
  REJECTED: "#a8452b",
};

export default function MapPage() {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const districtLayerRef = useRef<L.LayerGroup | null>(null);
  const pointLayerRef = useRef<L.LayerGroup | null>(null);

  const [district, setDistrict] = useState("");
  const [taluka, setTaluka] = useState("");
  const [village, setVillage] = useState("");
  const [status, setStatus] = useState("");
  const [schemeId, setSchemeId] = useState("");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const schemes = useApi<any[]>("/schemes");
  const locations = useApi<{ districts: string[]; talukas: Record<string, string[]>; villages: Record<string, string[]> }>("/map/locations");
  const districts = useApi<any[]>("/map/districts", { scheme_id: schemeId || undefined }, [schemeId]);

  const showPoints = zoom >= POINT_ZOOM_THRESHOLD || !!district;
  const [points, setPoints] = useState<any[]>([]);
  const [pointsError, setPointsError] = useState<string | null>(null);

  useEffect(() => {
    if (!showPoints) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    api<any[]>("/map/points", { params: { district, taluka, village, status } })
      .then((res) => {
        if (!cancelled) setPoints(res ?? []);
      })
      .catch((e) => {
        if (!cancelled) setPointsError(e?.message ?? "Points could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPoints, district, taluka, village, status]);

  // Initialise map once.
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current, { center: CENTER, zoom: DEFAULT_ZOOM });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    districtLayerRef.current = L.layerGroup().addTo(map);
    pointLayerRef.current = L.layerGroup().addTo(map);
    map.on("zoomend", () => setZoom(map.getZoom()));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // District circles.
  useEffect(() => {
    const layer = districtLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const rows = districts.data ?? [];
    const maxFamilies = Math.max(1, ...rows.map((d) => d.families ?? 0));
    rows.forEach((d) => {
      if (d.lat === undefined || d.lat === null) return;
      const radius = 8000 + (Math.sqrt((d.families ?? 0) / maxFamilies) * 32000);
      const circle = L.circle([d.lat, d.lng], {
        radius,
        color: "#2458e5",
        weight: 1,
        fillColor: "#2458e5",
        fillOpacity: 0.16,
      });
      circle.bindTooltip(
        `<strong>${d.district}</strong><br/>${fmtNum(d.families)} families · ${fmtNum(d.verified)} verified${
          d.eligible_families !== undefined ? `<br/>${fmtNum(d.eligible_families)} eligible for this scheme` : ""
        }`,
        { sticky: true },
      );
      circle.on("click", () => setDistrict(d.district));
      circle.addTo(layer);
    });
  }, [districts.data]);

  // Point layer.
  useEffect(() => {
    const layer = pointLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showPoints) return;
    points.forEach((p) => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: STATUS_COLORS[p.status] ?? "#2458e5",
        weight: 1,
        fillColor: STATUS_COLORS[p.status] ?? "#2458e5",
        fillOpacity: 0.75,
      });
      marker.bindTooltip(`${p.family_ref ?? "Provisional"} · ${titleCase(p.status)}<br/>${fmtNum(p.member_count)} members`, { sticky: true });
      marker.addTo(layer);
    });
  }, [points, showPoints]);

  const totalFamilies = (districts.data ?? []).reduce((sum, d) => sum + (d.families ?? 0), 0);
  const totalVerified = (districts.data ?? []).reduce((sum, d) => sum + (d.verified ?? 0), 0);

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow="MAP" title="Family map" description="District coverage and anonymised household points across the state." />

      {districts.error && <Notice tone="danger">{districts.error}</Notice>}
      {pointsError && <Notice tone="danger">{pointsError}</Notice>}

      <div style={{ position: "relative", height: 620, borderRadius: 18, overflow: "hidden", border: "1px solid var(--line)" }}>
        <div ref={mapElRef} style={{ position: "absolute", inset: 0 }} />

        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            width: 300,
            maxHeight: "calc(100% - 32px)",
            overflow: "auto",
            background: "rgba(255,255,255,.86)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(210,221,238,.9)",
            borderRadius: 22,
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div className="stack" style={{ gap: 12 }}>
            <p className="eyebrow">Filters</p>
            <Select
              label="District"
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setTaluka("");
                setVillage("");
              }}
            >
              <Options values={locations.data?.districts ?? []} allLabel="All districts" raw />
            </Select>
            <Select
              label="Taluka"
              value={taluka}
              onChange={(e) => {
                setTaluka(e.target.value);
                setVillage("");
              }}
              disabled={!district}
            >
              <Options values={(district && locations.data?.talukas?.[district]) || []} allLabel="All talukas" raw />
            </Select>
            <Select label="Village" value={village} onChange={(e) => setVillage(e.target.value)} disabled={!taluka}>
              <Options values={(taluka && locations.data?.villages?.[taluka]) || []} allLabel="All villages" raw />
            </Select>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <Options values={["DRAFT", "PENDING_VERIFICATION", "VERIFIED", "REJECTED"]} allLabel="All statuses" />
            </Select>
            <Select label="Scheme" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
              <option value="">No scheme filter</option>
              {(schemes.data ?? []).map((s: any) => (
                <option key={s.scheme_id} value={s.scheme_id}>
                  {s.scheme_name}
                </option>
              ))}
            </Select>

            <div style={{ borderRadius: 16 }}>
              <StatRow>
                <StatTile label="Families" value={fmtNum(totalFamilies)} unit="total" />
                <StatTile label="Verified" value={fmtNum(totalVerified)} unit="total" />
              </StatRow>
            </div>

            <Notice tone="info" icon={false}>
              Points are anonymised: coordinates are jittered by up to 300 metres and no names are shown, only a family reference and status.
            </Notice>
          </div>
        </div>
      </div>

      <p className="caption">
        District circles are sized by registered families. Household points appear once the map is zoomed to level {POINT_ZOOM_THRESHOLD} or beyond, or a
        district is selected in the filters.
      </p>
    </div>
  );
}
