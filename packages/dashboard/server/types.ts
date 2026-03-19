export interface ShowRow {
  id: string;
  venue: string;
  city: string;
  state: string;
  date: string;
  recording_source?: string;
  recording_quality_grade?: string;
  recording_id?: string;
  catalog_score?: number;
  setlist?: string;
  metadata?: string;
  weather?: string;
  created_at: string;
}

export interface EpisodeRow {
  id: string;
  show_id: string;
  episode_type?: string;
  title?: string;
  status?: string;
  current_stage?: string;
  progress?: number;
  youtube_url?: string;
  duration_seconds?: number;
  duration_frames?: number;
  total_cost?: number;
  script?: string;
  cost_breakdown?: string;
  created_at: string;
  published_at?: string;
  // joined from shows
  venue?: string;
  city?: string;
  state?: string;
  show_date?: string;
}

export interface AssetRow {
  id: number;
  type: string;
  service: string;
  file_path: string;
  cost: number;
  metadata?: string;
  created_at: string;
  episode_id?: string;
}

export interface CostLogRow {
  service: string;
  operation: string;
  cost: number;
  input_tokens?: number;
  output_tokens?: number;
  created_at: string;
  episode_id?: string;
}

export interface CostTotalRow {
  total: number;
}

export interface ServiceCostRow {
  service: string;
  count: number;
  total: number;
}
