export type DisputeStatus = 'submitted' | 'review' | 'info' | 'resolved'
export interface Dispute {
  id: string; kind: 'swap' | 'flash' | 'market' | 'other'; refId: string; title: string; counterparty: string
  amount: number; cur: string; reason: string; desc: string; evidence: string[]
  status: DisputeStatus; outcome?: string; createdAt: number; updatedAt: number; userReplied?: boolean
}
export const REASONS: Record<Dispute['kind'], string[]> = {
  swap: ['I paid but didn’t receive the cash', 'Wrong amount received', 'Counterparty didn’t show up', 'Counterparty is asking for extra money', 'Fake notes / suspicious cash', 'Other'],
  flash: ['Job not done', 'Job done badly / not as agreed', 'Fixer didn’t show up', 'Asked for more money', 'Damage to my property', 'Other'],
  market: ['Item not as described', 'Item damaged / not working', 'Seller didn’t show up', 'Seller asked for more money', 'Other'],
  other: ['Scam or fraud', 'Harassment', 'Payment problem', 'Other'],
}
export const STATUS_STEPS: { key: DisputeStatus; label: string }[] = [
  { key: 'submitted', label: 'Submitted' }, { key: 'review', label: 'Under review' }, { key: 'info', label: 'Evidence' }, { key: 'resolved', label: 'Resolved' },
]
