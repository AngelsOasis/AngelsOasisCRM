import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Search, 
  Send, 
  Plus, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  X, 
  Building2, 
  Compass, 
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  ShieldCheck
} from 'lucide-react';
import { LeadCategory, LeadRecord } from '../../types';
import { ApiService } from '../../services/api';
import L from 'leaflet';

interface HospitalsMapViewProps {
  existingLeads: LeadRecord[];
  onAddLeadToCRM: (lead: Omit<LeadRecord, 'id' | 'outreachHistory'>) => void;
  onOpenQuickEmail: (lead: LeadRecord) => void;
  onSelectLead: (lead: LeadRecord) => void;
}

export const HospitalsMapView: React.FC<HospitalsMapViewProps> = ({
  existingLeads,
  onAddLeadToCRM,
  onOpenQuickEmail,
  onSelectLead,
}) => {
  const [selectedCenter, setSelectedCenter] = useState<'valley-village' | 'san-jacinto'>('valley-village');
  const [radiusMiles, setRadiusMiles] = useState<number>(25);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [loadingOverpass, setLoadingOverpass] = useState<boolean>(false);
  const [mapFacilities, setMapFacilities] = useState<LeadRecord[]>(existingLeads);
  const [selectedFacility, setSelectedFacility] = useState<LeadRecord | null>(null);
  const [overpassNotice, setOverpassNotice] = useState<string>('');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const circleLayerRef = useRef<L.Circle | null>(null);

  const centers = {
    'valley-village': {
      name: 'Angels Oasis Valley Village Flagship',
      address: '12018 Sarah St, Valley Village, CA 91607',
      lat: 34.1488,
      lon: -118.3962,
    },
    'san-jacinto': {
      name: 'Angels Oasis San Jacinto Regional',
      address: 'San Jacinto, CA 92583',
      lat: 33.7839,
      lon: -116.9586,
    },
  };

  const currentCenter = centers[selectedCenter];

  // Fetch facilities from backend Overpass API proxy
  const fetchFacilities = async () => {
    setLoadingOverpass(true);
    setOverpassNotice('');
    try {
      const result = await ApiService.fetchNearbyFacilities(
        currentCenter.lat,
        currentCenter.lon,
        radiusMiles,
        selectedCategory
      );

      // Merge with any custom outreach history from existing leads
      const merged = result.facilities.map((fac) => {
        const found = existingLeads.find(
          (l) => l.hospitalName.toLowerCase() === fac.hospitalName.toLowerCase()
        );
        if (found) {
          return {
            ...fac,
            id: found.id,
            status: found.status,
            outreachHistory: found.outreachHistory,
            lastContacted: found.lastContacted,
            contactPerson: found.contactPerson,
            emailAddress: found.emailAddress,
            phoneNumber: found.phoneNumber,
          };
        }
        return fac;
      });

      setMapFacilities(merged);
      setOverpassNotice(
        result.isLiveOverpass
          ? `Live OpenStreetMap Overpass retrieved ${result.totalFound} healthcare facilities within ${radiusMiles} mi.`
          : `Retrieved ${result.totalFound} regional hospitals & subacute facilities within ${radiusMiles} mi.`
      );
    } catch {
      setMapFacilities(existingLeads);
      setOverpassNotice('Using cached regional healthcare directory.');
    } finally {
      setLoadingOverpass(false);
    }
  };

  useEffect(() => {
    fetchFacilities();
  }, [selectedCenter, radiusMiles, selectedCategory]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([currentCenter.lat, currentCenter.lon], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    map.setView([currentCenter.lat, currentCenter.lon], radiusMiles <= 10 ? 12 : radiusMiles <= 25 ? 10 : 9);

    // Update center radius circle
    if (circleLayerRef.current) {
      map.removeLayer(circleLayerRef.current);
    }
    const radiusMeters = radiusMiles * 1609.34;
    circleLayerRef.current = L.circle([currentCenter.lat, currentCenter.lon], {
      radius: radiusMeters,
      color: '#380e1a',
      weight: 2,
      fillColor: '#380e1a',
      fillOpacity: 0.05,
      dashArray: '6, 6',
    }).addTo(map);

    // Clear previous markers
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();

      // Add center Angels Oasis pin
      const centerPinIcon = L.divIcon({
        className: 'custom-center-pin',
        html: `<div style="background-color:#380e1a; color:white; border:3px solid #10b981; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(0,0,0,0.35); font-weight:bold; font-size:11px;">
          AO
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      L.marker([currentCenter.lat, currentCenter.lon], { icon: centerPinIcon, zIndexOffset: 1000 })
        .addTo(markersLayerRef.current)
        .bindPopup(`<strong>${currentCenter.name}</strong><br/>${currentCenter.address}`);

      // Plot facilities markers
      mapFacilities.forEach((fac) => {
        let pinColor = '#be123c'; // hospital red
        let label = 'H';
        if (fac.referralType === 'Skilled Nursing Facilities') {
          pinColor = '#059669'; // emerald
          label = 'SNF';
        } else if (fac.referralType === 'Rehab Centers') {
          pinColor = '#7c3aed'; // purple
          label = 'Rehab';
        } else if (fac.referralType === 'Healthcare Organizations' || fac.referralType === 'Insurance Networks') {
          pinColor = '#d97706'; // amber
          label = 'Org';
        }

        const facIcon = L.divIcon({
          className: 'custom-fac-pin',
          html: `<div style="background-color:${pinColor}; color:white; border:2px solid white; border-radius:12px; padding:3px 7px; font-family:sans-serif; font-size:10px; font-weight:bold; box-shadow:0 4px 8px rgba(0,0,0,0.25); white-space:nowrap; cursor:pointer;">
            ${label} · ${fac.hospitalName.slice(0, 18)}
          </div>`,
          iconSize: [120, 26],
          iconAnchor: [60, 13],
        });

        const marker = L.marker([fac.lat, fac.lon], { icon: facIcon }).addTo(markersLayerRef.current!);
        marker.on('click', () => {
          setSelectedFacility(fac);
        });
      });
    }
  }, [mapFacilities, selectedCenter, radiusMiles]);

  const handleAddFacilityToCRM = (fac: LeadRecord) => {
    onAddLeadToCRM({
      hospitalName: fac.hospitalName,
      address: fac.address,
      city: fac.city,
      county: fac.county,
      lat: fac.lat,
      lon: fac.lon,
      distanceValleyVillage: fac.distanceValleyVillage,
      distanceSanJacinto: fac.distanceSanJacinto,
      contactPerson: fac.contactPerson,
      contactTitle: fac.contactTitle,
      department: fac.department,
      emailAddress: fac.emailAddress,
      phoneNumber: fac.phoneNumber,
      referralType: fac.referralType,
      status: 'Researched',
      notes: `Imported via OpenStreetMap Overpass ${radiusMiles}-mile scan.`,
      lastContacted: null,
      qualificationScore: fac.qualificationScore || 88,
      source: 'Overpass OSM',
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Search Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2">
            Map-Based Hospital & Referral Finder
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Geographic radius scanner powered by OpenStreetMap Overpass API for Angels Oasis locations.
          </p>
        </div>

        {/* Center Facility Selector */}
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
          <button
            onClick={() => setSelectedCenter('valley-village')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedCenter === 'valley-village'
                ? 'bg-[#4A1525] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Valley Village Flagship
          </button>
          <button
            onClick={() => setSelectedCenter('san-jacinto')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedCenter === 'san-jacinto'
                ? 'bg-[#4A1525] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            San Jacinto (Riverside)
          </button>
        </div>
      </div>

      {/* Radius & Category Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Radius Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Search Radius:</span>
          {[5, 10, 25, 50].map((r) => (
            <button
              key={r}
              onClick={() => setRadiusMiles(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                radiusMiles === r
                  ? 'bg-[#10B981] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {r} mi
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Category:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none"
          >
            <option value="All">All Categories</option>
            <option value="Hospitals">Hospitals</option>
            <option value="Skilled Nursing Facilities">Skilled Nursing Facilities</option>
            <option value="Rehab Centers">Rehabilitation Centers</option>
            <option value="Healthcare Organizations">Healthcare Partners</option>
          </select>
        </div>

        {/* Overpass Trigger Button */}
        <button
          onClick={fetchFacilities}
          disabled={loadingOverpass}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold bg-[#4A1525] text-white hover:bg-[#380e1b] shadow-2xs disabled:opacity-50 transition-all cursor-pointer"
        >
          {loadingOverpass ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>{loadingOverpass ? 'Querying Overpass API...' : 'Re-scan Radius'}</span>
        </button>
      </div>

      {overpassNotice && (
        <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-emerald-600" />
            {overpassNotice}
          </span>
          <span className="font-mono text-slate-400 text-[11px]">Center: {currentCenter.address}</span>
        </div>
      )}

      {/* Main Map + Facility Slide-Out Container */}
      <div className="relative rounded-2xl border border-slate-200 overflow-hidden shadow-xs bg-slate-100 h-[620px]">
        {/* Leaflet map div */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Legend Overlay */}
        <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-xs p-3 rounded-xl border border-slate-200 shadow-md text-xs space-y-1.5">
          <div className="font-bold text-slate-900 mb-1 border-b border-slate-100 pb-1">
            Map Markers
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#380e1a] border border-emerald-400"></span>
            <span className="font-medium">Angels Oasis Facility</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#be123c]"></span>
            <span>Hospital</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#059669]"></span>
            <span>Skilled Nursing (SNF)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#7c3aed]"></span>
            <span>Rehab Center</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#d97706]"></span>
            <span>Healthcare Partner</span>
          </div>
        </div>

        {/* Selected Facility Drawer / Slide-Over Panel */}
        {selectedFacility && (
          <div className="absolute top-0 right-0 bottom-0 w-full sm:w-96 bg-white z-20 shadow-2xl border-l border-slate-200 p-6 overflow-y-auto flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                    {selectedFacility.referralType}
                  </span>
                  <h3 className="text-lg font-serif font-bold text-slate-900 mt-1">
                    {selectedFacility.hospitalName}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedFacility(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-600 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-900 shrink-0 mt-0.5" />
                <span>{selectedFacility.address}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">From Valley Village</span>
                  <strong>{selectedFacility.distanceValleyVillage} mi</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">From San Jacinto</span>
                  <strong>{selectedFacility.distanceSanJacinto} mi</strong>
                </div>
              </div>

              {/* Contact Information */}
              <div className="p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                  Contact Information
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Coordinator</span>
                  <span className="font-semibold text-slate-900">{selectedFacility.contactPerson}</span>
                  <span className="text-slate-500 block text-[11px]">{selectedFacility.department}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Mail className="w-3.5 h-3.5 text-emerald-600" />
                  <a href={`mailto:${selectedFacility.emailAddress}`} className="text-emerald-700 hover:underline">
                    {selectedFacility.emailAddress}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-600" />
                  <span className="font-mono">{selectedFacility.phoneNumber}</span>
                </div>
              </div>

              {/* Outreach History */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-800">
                    Outreach History ({selectedFacility.outreachHistory?.length || 0})
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Status: {selectedFacility.status}
                  </span>
                </div>

                {selectedFacility.outreachHistory && selectedFacility.outreachHistory.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedFacility.outreachHistory.map((h) => (
                      <div key={h.id} className="p-2.5 rounded-lg border border-slate-200 text-xs bg-slate-50">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-rose-900">{h.campaignName}</span>
                          <span className="font-mono text-slate-400">{h.sentAt}</span>
                        </div>
                        <div className="font-medium text-slate-800 mt-1 line-clamp-1">{h.subject}</div>
                        <div className="mt-1 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">To: {h.recipientName}</span>
                          <span className="font-bold uppercase text-emerald-700">{h.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-slate-50 text-center text-xs text-slate-500">
                    No campaigns sent to this facility yet.
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <button
                onClick={() => onOpenQuickEmail(selectedFacility)}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Launch Direct Email Outreach</span>
              </button>

              <button
                onClick={() => handleAddFacilityToCRM(selectedFacility)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Lead to CRM</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};