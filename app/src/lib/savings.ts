export interface Pot { id: string; name: string; emoji: string; target: number; saved: number; deadline?: string; createdAt: number; milestones: number[] }
export interface RateAlert { id: string; cur: string; op: 'above' | 'below'; target: number; active: boolean; triggeredAt?: number }
