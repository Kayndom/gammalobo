import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ekjanworhtdvvikvvdpl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVramFud29yaHRkdnZpa3Z2ZHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTk2MTQsImV4cCI6MjA5ODE5NTYxNH0.QI65pt6ze7S-uE9tv2OIY4xmt8XxRRr2ltWPC0imK6M'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbz00pLsO0GqkzQ7uQFxZX34N0nwOLDHLQjEuAZqhSNpudBPNuc_PufLZjS8CTE0Ygi9xQ/exec'