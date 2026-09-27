/**
 * Trust Engine thresholds and points. Every number the engine uses lives here; docs/trust.md
 * explains why each exists.
 */
export const defaultTrustConfig = {
  points: {
    locationWitness: 30,
    locationWitnessUnattested: 20,
    locationExif: 25,
    locationArchive: 20,
    timeInWindow: 20,
    timeUploadOnly: 5,
    timeOutside: -20,
    unique: 20,
    burst: 10,
    revisit: 20,
    similarInProject: 10,
    authClear: 15,
    screenOrPrint: -10,
    composited: -10,
    quality: 10,
    provenance: 5,
  },
  /** pHash hamming ≤ this is a match; ≤ strongHamming is a strong match. */
  matchHamming: 8,
  strongHamming: 4,
  /** Same-project matches this close in time are one burst of shots. */
  burstMinutes: 10,
  /** EXIF GPS and the witness fix further apart than this → review. */
  conflictKm: 1,
  /** A burned-in stamp further than this from the capture location, or off by more days → hard flag. */
  stampKm: 1,
  stampDays: 1,
  qualityMin: 0.6,
  /** Any hard flag caps the score here. */
  hardFlagCap: 40,
  verifiedMin: 75,
  reviewMin: 45,
  /** Project windows are dates; allow any timezone at either end. */
  windowSlackHours: 14,
};

export type TrustConfig = typeof defaultTrustConfig;
