export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: Employee;
        Insert: Omit<Employee, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Employee, 'id'>>;
      };
      performance_reviews: {
        Row: PerformanceReview;
        Insert: Omit<PerformanceReview, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PerformanceReview, 'id'>>;
      };
      onboarding_checklists: {
        Row: OnboardingChecklist;
        Insert: Omit<OnboardingChecklist, 'id' | 'created_at'>;
        Update: Partial<Omit<OnboardingChecklist, 'id'>>;
      };
      engagement_connects: {
        Row: EngagementConnect;
        Insert: Omit<EngagementConnect, 'id' | 'created_at'>;
        Update: Partial<Omit<EngagementConnect, 'id'>>;
      };
      recognition_awards: {
        Row: RecognitionAward;
        Insert: Omit<RecognitionAward, 'id' | 'created_at'>;
        Update: Partial<Omit<RecognitionAward, 'id'>>;
      };
      policies: {
        Row: Policy;
        Insert: Omit<Policy, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Policy, 'id'>>;
      };
    };
  };
}

export interface Employee {
  id: string;
  name: string;
  initials: string | null;
  role: string | null;
  dept: string | null;
  bu: string | null;
  location: string | null;
  country: string | null;
  region: string | null;
  manager: string | null;
  wfo: string | null;
  type: string | null;
  joined: string | null;
  skills: string[];
  certs: string[];
  phone: string | null;
  emergency: string | null;
  bgv: string | null;
  salary: number | null;
  visa: string | null;
  visa_expiry: string | null;
  check_in: string | null;
  appraisal: string | null;
  hike: number | null;
  sow: string | null;
  sow_expiry: string | null;
  photo_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PerformanceReview {
  id: string;
  employee_id: string;
  cycle: string;
  kra: string;
  rating: string | null;
  notes: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingChecklist {
  id: string;
  employee_id: string;
  category: string;
  item: string;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

export interface EngagementConnect {
  id: string;
  employee_id: string;
  connect_date: string;
  notes: string | null;
  action_items: string[];
  conducted_by: string | null;
  mood: string | null;
  created_at: string;
}

export interface RecognitionAward {
  id: string;
  employee_id: string;
  award_type: string | null;
  award_date: string | null;
  reason: string | null;
  awarded_by: string | null;
  created_at: string;
}

export interface Policy {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  owner: string | null;
  status: string;
  version: string | null;
  effective_date: string | null;
  doc_url: string | null;
  created_at: string;
  updated_at: string;
}
