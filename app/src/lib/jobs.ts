import type { PostMeta } from './posting'

export type JobType = 'Part-time' | 'Full-time' | 'Gig' | 'Internship'
export type JobCat = 'Hospitality' | 'Delivery' | 'Tutoring' | 'Office' | 'Tech' | 'Beauty' | 'Campus'

export interface Job extends PostMeta {
  id: string; title: string; company: string; city: string; area: string; cat: JobCat; type: JobType
  pay: number; unit: 'hour' | 'month' | 'task'; hours: string; langs: string[]; permit: boolean
  verifiedBiz: boolean; individual?: boolean; posted: number; desc: string; emoji: string; mine?: boolean
}

const T: Omit<Job, 'id' | 'city' | 'area' | 'posted'>[] = [
  { title: 'Waiter / Waitress', company: 'Harbour View Restaurant', cat: 'Hospitality', type: 'Part-time', pay: 160, unit: 'hour', hours: 'Evenings, 4 shifts/week', langs: ['English', 'Basic Turkish'], permit: true, verifiedBiz: true, desc: 'Friendly team, free staff meal, tips shared weekly.', emoji: '🍽️' },
  { title: 'Delivery rider', company: 'QuickBite Delivery', cat: 'Delivery', type: 'Gig', pay: 90, unit: 'task', hours: 'Flexible, choose your slots', langs: ['English'], permit: true, verifiedBiz: true, desc: 'Scooter provided. Valid driving licence required.', emoji: '🛵' },
  { title: 'English tutor (kids)', company: 'Bright Minds Academy', cat: 'Tutoring', type: 'Part-time', pay: 300, unit: 'hour', hours: 'Weekends, 6 hrs/week', langs: ['Fluent English'], permit: true, verifiedBiz: true, desc: 'Teach conversational English to ages 8–12. Materials provided.', emoji: '📚' },
  { title: 'French-speaking call agent', company: 'MedLink Support Centre', cat: 'Office', type: 'Full-time', pay: 42000, unit: 'month', hours: 'Mon–Fri, 9:00–17:00', langs: ['French', 'English'], permit: true, verifiedBiz: true, desc: 'Handle customer calls for an international client. Training provided.', emoji: '🎧' },
  { title: 'Hotel housekeeping', company: 'Seaside Resort & Spa', cat: 'Hospitality', type: 'Full-time', pay: 38000, unit: 'month', hours: '6 days/week, accommodation available', langs: ['English'], permit: true, verifiedBiz: true, desc: 'Staff accommodation and meals included. Permit handled by HR.', emoji: '🏨' },
  { title: 'Junior web developer', company: 'Kyrenia Digital Studio', cat: 'Tech', type: 'Internship', pay: 20000, unit: 'month', hours: '20 hrs/week, hybrid', langs: ['English'], permit: true, verifiedBiz: true, desc: 'React/TypeScript. Great for CS students: real client projects.', emoji: '💻' },
  { title: 'Braider / hair stylist', company: 'Crown Braids Studio', cat: 'Beauty', type: 'Part-time', pay: 450, unit: 'task', hours: 'Weekends', langs: ['English'], permit: false, verifiedBiz: false, individual: true, desc: 'Knotless braids & locs. Bring your portfolio.', emoji: '💇🏾‍♀️' },
  { title: 'Library assistant', company: 'University Library', cat: 'Campus', type: 'Part-time', pay: 140, unit: 'hour', hours: '10 hrs/week, flexible', langs: ['English'], permit: true, verifiedBiz: true, desc: 'On-campus student job. Shelving, front desk, study-room bookings.', emoji: '🏛️' },
  { title: 'Barista', company: 'Campus Corner Café', cat: 'Hospitality', type: 'Part-time', pay: 150, unit: 'hour', hours: 'Mornings', langs: ['English'], permit: true, verifiedBiz: true, desc: 'Latte art skills a plus. We train beginners.', emoji: '☕' },
]

export function jobsFor(city: string, areas: string[]): Job[] {
  return T.map((j, i) => ({ ...j, id: `job-${city}-${i}`, city, area: areas[i % areas.length], posted: (i * 3 + city.length) % 9, status: 'live' as const }))
}

export const payText = (j: Pick<Job, 'pay' | 'unit'>) => `₺${j.pay.toLocaleString()}${j.unit === 'hour' ? '/hr' : j.unit === 'month' ? '/mo' : '/job'}`
