import type { UserName } from './index'

export type TripStatus = 'idea' | 'planning' | 'booked' | 'completed'
export type TripPlanKind = 'activity' | 'transport' | 'accommodation' | 'restaurant' | 'place'
export type RecommendationCategory = 'food' | 'activities' | 'sightseeing' | 'transport' | 'practical'
export interface TripPlan {
  id: string
  title: string
  kind: TripPlanKind
  date?: string
  time?: string
  endDate?: string
  location: string
  link: string
  notes: string
  estimatedCost?: number
  actualCost?: number
  isCompleted: boolean
  recommendationId?: string
}
export interface TripTask { id: string; title: string; isCompleted: boolean }
export interface TripNote { id: string; title: string; content: string }
export interface TripExpense { id: string; title: string; estimatedCost?: number; actualCost?: number }
export interface TripRecommendation {
  id: string
  title: string
  category: RecommendationCategory
  description: string
  location: string
  link: string
  estimatedCost?: number
  notes: string
}
export interface Trip {
  id: string
  title: string
  destination: string
  country: string
  startDate?: string
  endDate?: string
  travellers: UserName[]
  status: TripStatus
  budget: number
  currency: string
  notes: string
  coverPhoto?: string
  plans: TripPlan[]
  packing: TripTask[]
  bookings: TripTask[]
  sharedNotes: TripNote[]
  expenses: TripExpense[]
  recommendations: TripRecommendation[]
  createdBy: UserName
  createdAt: string
  updatedAt: string
}
export type TripDetails = Pick<Trip, 'title' | 'destination' | 'country' | 'startDate' | 'endDate' | 'travellers' | 'status' | 'budget' | 'currency' | 'notes'>
export type TripCollection = 'plans' | 'packing' | 'bookings' | 'sharedNotes' | 'expenses' | 'recommendations'
