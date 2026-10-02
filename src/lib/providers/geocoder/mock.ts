/** Offline geocoder: names the nearest of a few dozen Indian cities (deterministic). */
import { haversine } from "../../geo";
import type { GeocoderProvider } from "./index";

export const INDIAN_CITIES: Array<[name: string, lat: number, lng: number]> = [
  ["New Delhi, Delhi, India", 28.6139, 77.209],
  ["Mumbai, Maharashtra, India", 19.076, 72.8777],
  ["Bengaluru, Karnataka, India", 12.9716, 77.5946],
  ["Chennai, Tamil Nadu, India", 13.0827, 80.2707],
  ["Kolkata, West Bengal, India", 22.5726, 88.3639],
  ["Hyderabad, Telangana, India", 17.385, 78.4867],
  ["Pune, Maharashtra, India", 18.5204, 73.8567],
  ["Ahmedabad, Gujarat, India", 23.0225, 72.5714],
  ["Jaipur, Rajasthan, India", 26.9124, 75.7873],
  ["Lucknow, Uttar Pradesh, India", 26.8467, 80.9462],
  ["Bhopal, Madhya Pradesh, India", 23.2599, 77.4126],
  ["Patna, Bihar, India", 25.5941, 85.1376],
  ["Bhubaneswar, Odisha, India", 20.2961, 85.8245],
  ["Guwahati, Assam, India", 26.1445, 91.7362],
  ["Kochi, Kerala, India", 9.9312, 76.2673],
  ["Thiruvananthapuram, Kerala, India", 8.5241, 76.9366],
  ["Chandigarh, India", 30.7333, 76.7794],
  ["Dehradun, Uttarakhand, India", 30.3165, 78.0322],
  ["Srinagar, Jammu and Kashmir, India", 34.0837, 74.7973],
  ["Panaji, Goa, India", 15.4909, 73.8278],
  ["Visakhapatnam, Andhra Pradesh, India", 17.6868, 83.2185],
  ["Nagpur, Maharashtra, India", 21.1458, 79.0882],
  ["Indore, Madhya Pradesh, India", 22.7196, 75.8577],
  ["Raipur, Chhattisgarh, India", 21.2514, 81.6296],
  ["Ranchi, Jharkhand, India", 23.3441, 85.3096],
  ["Shillong, Meghalaya, India", 25.5788, 91.8933],
  ["Coimbatore, Tamil Nadu, India", 11.0168, 76.9558],
  ["Mysuru, Karnataka, India", 12.2958, 76.6394],
  ["Varanasi, Uttar Pradesh, India", 25.3176, 82.9739],
  ["Amritsar, Punjab, India", 31.634, 74.8723],
];

export class MockGeocoder implements GeocoderProvider {
  readonly kind = "mock" as const;

  async reverse(lat: number, lng: number): Promise<string | null> {
    let best = INDIAN_CITIES[0];
    let bestD = Infinity;
    for (const c of INDIAN_CITIES) {
      const d = haversine({ lat, lng }, { lat: c[1], lng: c[2] });
      if (d < bestD) [best, bestD] = [c, d];
    }
    if (bestD <= 30_000) return best[0];
    if (bestD <= 300_000) return `Near ${best[0]}`;
    return null;
  }
}
