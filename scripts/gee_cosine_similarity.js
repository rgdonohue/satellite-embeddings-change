/**
 * Google Earth Engine Script: Cosine Similarity Analysis
 * 
 * This script computes cosine similarity between satellite embeddings
 * from different years to detect changes in land cover and features.
 * 
 * Usage: Copy and paste this script into code.earthengine.google.com
 * 
 * Author: Generated for satellite-embeddings-frontend project
 * Date: 2024
 */

// Define Area of Interest (AOI) - replace 'geometry' with your region
var aoi = geometry;

// Load Google's Satellite Embeddings collection
var embeddings = ee.ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL');

/**
 * Function to get embeddings for a specific year
 * @param {number} y - Year (e.g., 2020)
 * @returns {ee.Image} Mosaicked and clipped embeddings for the year
 */
function yearImg(y) {
  return embeddings
    .filterDate(y + '-01-01', (y + 1) + '-01-01')
    .filterBounds(aoi)      // Pull all tiles touching AOI
    .mosaic()               // Stitch them together
    .clip(aoi);             // Clip to AOI boundary
}

// Define years for comparison
var y1 = 2020, y2 = 2024;
var img1 = yearImg(y1);
var img2 = yearImg(y2);

// Compute cosine similarity (dot product for unit vectors)
var dot = img1.multiply(img2).reduce(ee.Reducer.sum());
var cos = dot.rename('cosine_similarity');

// --- FIX: Create validity mask and apply it ---
// This ensures we only compare pixels that have valid data in both years
var m1 = img1.mask().reduce(ee.Reducer.min());  // 1-band mask for year 1
var m2 = img2.mask().reduce(ee.Reducer.min());  // 1-band mask for year 2
var cosMasked = cos.updateMask(m1.and(m2));     // Apply combined mask

// Visualization settings
var rgbBands = ['A01','A16','A09'];  // Selected embedding bands for pseudo-RGB
var rgbVis = {min: -0.3, max: 0.3, bands: rgbBands};

// Center map on AOI
Map.centerObject(aoi, 9);

// Add layers to map (set false to hide by default)
Map.addLayer(img1, rgbVis, 'Embeddings ' + y1 + ' (pseudoRGB)', false);
Map.addLayer(img2, rgbVis, 'Embeddings ' + y2 + ' (pseudoRGB)', false);

// Add cosine similarity layer with viridis-like color palette
Map.addLayer(cosMasked, {
  min: -1, 
  max: 1, 
  palette: ['#440154','#21918c','#fde725']  // Purple to yellow
}, 'Cosine similarity ' + y1 + ' vs ' + y2);

// Prepare output image for export
var out = cosMasked.toFloat();   // Convert to float for precision
// Alternative: export RGB embeddings
// var out = img1.select(['A01','A16','A09']).toFloat();

// Export to Google Drive
Export.image.toDrive({
  image: out,
  description: 'sanjuans_cosine_2020_2024',
  region: aoi,
  scale: 10,             // Native 10m resolution
  fileFormat: 'GeoTIFF',
  maxPixels: 1e13        // Allow large exports
});

/**
 * NOTES:
 * 
 * 1. COSINE SIMILARITY INTERPRETATION:
 *    - Values close to 1: High similarity (little change)
 *    - Values close to 0: Moderate similarity (some change)
 *    - Values close to -1: Low similarity (significant change)
 * 
 * 2. EMBEDDING BANDS:
 *    - A01, A16, A09 were selected for visualization
 *    - These represent different learned features from the satellite imagery
 * 
 * 3. MASKING:
 *    - The validity mask ensures we only compare pixels with data in both years
 *    - This prevents false similarity calculations from missing data
 * 
 * 4. EXPORT:
 *    - Scale: 10m maintains native resolution
 *    - maxPixels: 1e13 allows for large area exports
 *    - GeoTIFF format preserves spatial information
 */
