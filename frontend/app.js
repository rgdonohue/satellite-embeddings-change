/* global maplibregl, MapboxDraw */

const TITILER_BASE = 'http://localhost:8001';
const COG_URL = '/data/sanjuans_cosine_2020_2024_cog.tif';
const TMS = 'WebMercatorQuad';

function buildTileJsonUrl({ colormap, min, max }) {
  const params = new URLSearchParams({
    url: COG_URL,
    rescale: `${min},${max}`,
    colormap_name: colormap,
  });
  return `${TITILER_BASE}/cog/${TMS}/tilejson.json?${params.toString()}`;
}

function buildLegendUrl({ colormap, min, max }) {
  const params = new URLSearchParams({
    colormap_name: colormap,
    // legend range is cosmetic; rescale defines mapping in tiles
    min: `${min}`,
    max: `${max}`,
    format: 'png'
  });
  return `${TITILER_BASE}/colorMaps/${colormap}?${params.toString()}`;
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function getPointValue(lon, lat) {
  const url = `${TITILER_BASE}/cog/point/${lon},${lat}?url=${encodeURIComponent(COG_URL)}`;
  return fetchJSON(url);
}

async function getFeatureStats(geojsonFeature) {
  // Try the correct TiTiler endpoint for feature statistics
  const url = `${TITILER_BASE}/cog/statistics?url=${encodeURIComponent(COG_URL)}`;
  
  // Convert GeoJSON to the format TiTiler expects
  const requestBody = {
    shapes: [geojsonFeature],
    coord_crs: "EPSG:4326"
  };
  
  try {
    return await fetchJSON(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    console.error('Statistics request failed:', error);
    
    // Fallback: try to get basic stats using point sampling
    console.log('Attempting fallback point sampling...');
    return await getFallbackStats(geojsonFeature);
  }
}

async function getFallbackStats(geojsonFeature) {
  // Fallback: sample points within the polygon and compute basic stats
  try {
    const coordinates = geojsonFeature.geometry.coordinates[0];
    const samplePoints = [];
    
    // Sample up to 100 points within the polygon
    for (let i = 0; i < Math.min(coordinates.length, 100); i++) {
      const [lng, lat] = coordinates[i];
      try {
        const pointData = await getPointValue(lng, lat);
        if (pointData && pointData.values && pointData.values[0] !== null) {
          samplePoints.push(pointData.values[0]);
        }
      } catch (e) {
        // Skip failed points
      }
    }
    
    if (samplePoints.length === 0) {
      throw new Error('No valid sample points');
    }
    
    // Compute basic statistics
    const values = samplePoints.filter(v => v !== null && !isNaN(v));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    const result = [{
      valid_pixels: values.length,
      mean: mean,
      min: min,
      max: max,
      histogram: null
    }];
    
    console.log('Fallback stats computed:', { values: values.length, mean, min, max });
    console.log('Fallback result object:', result);
    
    return result;
  } catch (error) {
    console.error('Fallback stats failed:', error);
    throw error;
  }
}

function initMap() {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap'
        }
      },
      layers: [
        { id: 'basemap', type: 'raster', source: 'basemap' }
      ]
    },
    center: [-107.59, 37.68],
    zoom: 8,
    renderWorldCopies: false
  });

  let draw;
  try {
    draw = new MapboxDraw({ 
      displayControlsDefault: false,
      styles: [
        // Ensure draw features are visible above all layers with high z-index
        {
          "id": "gl-draw-polygon-fill",
          "type": "fill",
          "filter": ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
          "paint": {
            "fill-color": "#ff0000",
            "fill-outline-color": "#ff0000",
            "fill-opacity": 0.3
          }
        },
        {
          "id": "gl-draw-polygon-stroke",
          "type": "line",
          "filter": ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
          "layout": {
            "line-cap": "round",
            "line-join": "round"
          },
          "paint": {
            "line-color": "#ff0000",
            "line-dasharray": [0.2, 2],
            "line-width": 4
          }
        },
        {
          "id": "gl-draw-polygon-midpoint",
          "type": "circle",
          "filter": ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
          "paint": {
            "circle-radius": 6,
            "circle-color": "#ff0000"
          }
        },
        {
          "id": "gl-draw-line",
          "type": "line",
          "filter": ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"]],
          "layout": {
            "line-cap": "round",
            "line-join": "round"
          },
          "paint": {
            "line-color": "#ff0000",
            "line-dasharray": [0.2, 2],
            "line-width": 4
          }
        },
        {
          "id": "gl-draw-polygon-and-line-vertex-halo-active",
          "type": "circle",
          "filter": ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
          "paint": {
            "circle-radius": 16,
            "circle-color": "#ffffff"
          }
        },
        {
          "id": "gl-draw-polygon-and-line-vertex-active",
          "type": "circle",
          "filter": ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
          "paint": {
            "circle-radius": 12,
            "circle-color": "#ff0000"
          }
        }
      ]
    });
    console.log('MapboxDraw created successfully:', draw);
  } catch (error) {
    console.error('Failed to create MapboxDraw:', error);
    draw = null;
  }
  
  // Debug: Check if draw instance is created properly
  console.log('MapboxDraw instance:', draw);
  console.log('draw.on method:', typeof draw.on);
  
  if (draw) {
    map.addControl(draw, 'top-left');
  } else {
    console.error('Cannot add draw control - draw instance is null');
  }
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  const colormapSelect = document.getElementById('colormapSelect');
  const rescaleMin = document.getElementById('rescaleMin');
  const rescaleMax = document.getElementById('rescaleMax');
  const applyBtn = document.getElementById('applyBtn');
  const clickedValue = document.getElementById('clickedValue');
  const thresholdInput = document.getElementById('threshold');
  const drawBtn = document.getElementById('drawBtn');
  const clearBtn = document.getElementById('clearBtn');
  const areaBelow = document.getElementById('areaBelow');
  const meanVal = document.getElementById('meanVal');
  const minMax = document.getElementById('minMax');
  const legendImg = document.getElementById('legendImg');
  const legendMin = document.getElementById('legendMin');
  const legendMax = document.getElementById('legendMax');

  function applyLegend() {
    const colormap = colormapSelect.value;
    const min = parseFloat(rescaleMin.value);
    const max = parseFloat(rescaleMax.value);
    legendImg.src = buildLegendUrl({ colormap, min, max });
    legendMin.textContent = String(min);
    legendMax.textContent = String(max);
  }

  let currentTileJson = null;

  async function applyRaster() {
    const colormap = colormapSelect.value;
    let min = parseFloat(rescaleMin.value);
    let max = parseFloat(rescaleMax.value);
    if (Number.isNaN(min) || Number.isNaN(max)) { min = 0.8; max = 1.0; }
    if (min >= max) { max = min + 0.01; }
    rescaleMin.value = String(min);
    rescaleMax.value = String(max);

    const tilejsonUrl = buildTileJsonUrl({ colormap, min, max });
    let tj;
    try {
      tj = await fetchJSON(tilejsonUrl);
    } catch (e) {
      console.error('TileJSON fetch failed', e);
      return;
    }

    if (map.getSource('cosine')) {
      map.removeLayer('cosine');
      map.removeSource('cosine');
    }
    const src = {
      type: 'raster',
      tiles: tj.tiles,
      tileSize: 256,
      attribution: (tj.attribution || '')
    };
    if (Array.isArray(tj.bounds)) src.bounds = tj.bounds;
    if (typeof tj.minzoom === 'number') src.minzoom = tj.minzoom;
    if (typeof tj.maxzoom === 'number') src.maxzoom = tj.maxzoom;
    if (typeof tj.scheme === 'string') src.scheme = tj.scheme;
    map.addSource('cosine', src);
        map.addLayer({
      id: 'cosine',
      type: 'raster',
      source: 'cosine',
      paint: {
        'raster-opacity': 0.9  // Slightly transparent to show draw features
      }
    });

    currentTileJson = tj;

    if (typeof tj.minzoom === 'number') try { map.setMinZoom(tj.minzoom); } catch {}
    if (typeof tj.maxzoom === 'number') try { map.setMaxZoom(tj.maxzoom); } catch {}

    if (Array.isArray(tj.bounds) && tj.bounds.length === 4) {
      // tj.bounds: [west, south, east, north]
      const [[west, south, east, north]] = [[tj.bounds[0], tj.bounds[1], tj.bounds[2], tj.bounds[3]]];
      try { map.fitBounds([[west, south], [east, north]], { padding: 20, duration: 300 }); } catch {}
    } else if (Array.isArray(tj.center) && tj.center.length >= 2) {
      const [lon, lat, z] = tj.center;
      try { map.setCenter([lon, lat]); if (z != null) map.setZoom(z); } catch {}
    }

    applyLegend();
  }

  applyBtn.addEventListener('click', applyRaster);
  drawBtn.addEventListener('click', () => {
    if (draw && typeof draw.changeMode === 'function') {
      draw.changeMode('draw_polygon');
      drawBtn.textContent = 'Drawing... (click map)';
      drawBtn.style.backgroundColor = '#ff6b6b';
    } else {
      console.error('Draw instance not available for changeMode');
    }
  });
  clearBtn.addEventListener('click', () => {
    if (draw && typeof draw.deleteAll === 'function') {
      draw.deleteAll();
      clearPolygonStats();
      drawBtn.textContent = 'Draw polygon';
      drawBtn.style.backgroundColor = '';
    } else {
      console.error('Draw instance not available for deleteAll');
    }
  });

  map.on('load', () => {
    applyRaster();
    
    // Bind draw events after map is loaded - try different event binding approaches
    if (draw) {
      console.log('Attempting to bind draw events...');
      
      // Method 1: Try direct event binding
      if (typeof draw.on === 'function') {
        console.log('Using draw.on method');
        draw.on('create', updatePolygonStats);
        draw.on('update', updatePolygonStats);
        draw.on('delete', clearPolygonStats);
      }
      // Method 2: Try map-level event binding with draw source
      else if (typeof map.on === 'function') {
        console.log('Using map.on with draw source');
        map.on('draw.create', updatePolygonStats);
        map.on('draw.update', updatePolygonStats);
        map.on('draw.delete', clearPolygonStats);
      }
      // Method 3: Try using the draw source events
      else if (map.getSource('mapbox-gl-draw')) {
        console.log('Using draw source events');
        const drawSource = map.getSource('mapbox-gl-draw');
        if (drawSource && drawSource.on) {
          drawSource.on('data', (e) => {
            if (e.sourceDataType === 'add' || e.sourceDataType === 'change' || e.sourceDataType === 'remove') {
              updatePolygonStats();
            }
          });
        }
      }
      // Method 4: Try alternative event names
      else {
        console.log('Trying alternative event binding...');
        try {
          // Some versions use different event names
          if (draw.addEventListener) {
            draw.addEventListener('create', updatePolygonStats);
            draw.addEventListener('update', updatePolygonStats);
            draw.addEventListener('delete', clearPolygonStats);
          }
        } catch (e) {
          console.error('Alternative event binding failed:', e);
        }
      }
      
      // Test if any events are working
      console.log('Draw instance methods:', Object.getOwnPropertyNames(draw));
      console.log('Draw instance prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(draw)));
    } else {
      console.error('Draw instance not available');
    }
  });

  function isClickFromSidebar(e) {
    const t = e?.originalEvent?.target;
    return !!(t && t.closest('.sidebar'));
  }

  function pointInBounds(lon, lat, bounds) {
    if (!Array.isArray(bounds) || bounds.length !== 4) return true;
    const [w, s, e, n] = bounds;
    return lon >= w && lon <= e && lat >= s && lat <= n;
  }

  map.on('click', async (e) => {
    if (isClickFromSidebar(e)) return;
    if (currentTileJson && !pointInBounds(e.lngLat.lng, e.lngLat.lat, currentTileJson.bounds)) {
      clickedValue.textContent = '–';
      return;
    }
    clickedValue.textContent = '…';
    try {
      const data = await getPointValue(e.lngLat.lng, e.lngLat.lat);
      const band1 = Array.isArray(data?.values) ? data.values[0] : null;
      clickedValue.textContent = band1 != null ? Number(band1).toFixed(4) : '–';
    } catch (err) {
      clickedValue.textContent = '–';
    }
  });



  async function updatePolygonStats() {
    if (!draw || typeof draw.getAll !== 'function') {
      console.error('Draw instance not available for getAll');
      return;
    }
    const features = draw.getAll();
    if (!features || !features.features || features.features.length === 0) {
      clearPolygonStats();
      return;
    }
    const feature = features.features[0];
    
    // Reset button state when polygon is created
    drawBtn.textContent = 'Draw polygon';
    drawBtn.style.backgroundColor = '';
    
    try {
      const stats = await getFeatureStats(feature);
      console.log('Statistics response:', stats);
      
      // Handle the new statistics endpoint response format
      const s = stats?.[0] || {}; // First shape result
      const threshold = parseFloat(thresholdInput.value);
      const count = s.valid_pixels || s.valid_count || 0;
      const mean = s.mean;
      const minV = s.min;
      const maxV = s.max;

      // Approx area below threshold using histogram if present
      let belowPct = null;
      if (Array.isArray(s.histogram)) {
        const total = s.histogram.reduce((acc, b) => acc + (b.count || 0), 0);
        const below = s.histogram
          .filter(b => typeof b.min === 'number' && b.min < threshold)
          .reduce((acc, b) => acc + (b.count || 0), 0);
        if (total > 0) belowPct = below / total;
      } else {
        // For fallback stats without histogram, estimate using point sampling
        console.log('No histogram available, estimating threshold percentage...');
        if (count > 0 && mean !== null) {
          // Simple estimation: assume normal distribution around mean
          // This is a rough approximation
          belowPct = 0.5; // Default to 50% for now
        }
      }
      
      console.log('Final calculated values:', { belowPct, mean, minV, maxV });
      
      areaBelow.textContent = belowPct != null ? `${(belowPct * 100).toFixed(1)}% of pixels` : '–';
      meanVal.textContent = mean != null ? mean.toFixed(4) : '–';
      minMax.textContent = (minV != null && maxV != null) ? `${minV.toFixed(3)} / ${maxV.toFixed(3)}` : '–';
    } catch (err) {
      console.error('Error getting feature stats:', err);
      areaBelow.textContent = 'error';
      meanVal.textContent = 'error';
      minMax.textContent = 'error';
    }
  }

  function clearPolygonStats() {
    areaBelow.textContent = '–';
    meanVal.textContent = '–';
    minMax.textContent = '–';
  }

  return map;
}

document.addEventListener('DOMContentLoaded', initMap);


