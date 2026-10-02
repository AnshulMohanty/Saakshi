import type { TaxonomyEntry } from "../providers/analysis";

/** Tags the analysis provider may apply (max 10). Descriptions guide both the real API and the mock. */
export const TAXONOMY: TaxonomyEntry[] = [
  { name: "litter_or_waste", description: "Visible litter, garbage, trash, rubbish, plastic waste or a dump" },
  { name: "cleanup_activity", description: "People cleaning: volunteers collecting litter, sweeping, bagging waste" },
  { name: "clean_public_space", description: "A tidy public space with no visible litter" },
  { name: "saplings_or_young_trees", description: "Newly planted saplings or young trees, often staked or guarded" },
  { name: "water_body_or_shore", description: "A lake, river, pond, canal, beach or shoreline" },
  { name: "school_classroom", description: "A school building, classroom or students at school" },
  { name: "construction_or_repair", description: "Construction, renovation, painting or repair work" },
  { name: "community_gathering", description: "A group of people or volunteers gathered for an event" },
  { name: "damaged_infrastructure", description: "Broken, damaged or poorly maintained infrastructure" },
  { name: "children_present", description: "Children are visible in the photo" },
];
