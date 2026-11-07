export interface User {
  id: string;
  phone: string;
  role: "citizen" | "admin";
  created_at: string;
}

export interface Household {
  id: string;
  household_code: string;
  head_name: string;
  mobile: string;
  address: string;
  state: string;
  district: string;
  city_village: string;
  ward: string;
  locality: string;
  created_at: string;
  member_count: number;
}

export interface Member {
  id: string;
  household_id: string;
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  relationship: string;
  education: string | null;
  occupation: string | null;
  living_status: "active" | "deceased";
  registered_at: string;
}

export interface Analytics {
  total_households: number;
  total_population: number;
  male_population: number;
  female_population: number;
  other_population: number;
  average_family_size: number;
  registered_areas: number;
  gender_distribution: { name: string; value: number }[];
  male_female: { name: string; value: number }[];
  age_distribution: { name: string; value: number }[];
  area_population: { name: string; value: number }[];
  household_size_distribution: { name: string; value: number }[];
  population_growth: { month: string; registrations: number; population: number; net_change: number }[];
  matching_households: number;
}

export interface HistoryEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data: string | null;
  after_data: string | null;
  created_at: string;
}
