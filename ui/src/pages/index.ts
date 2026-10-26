// Trang cua cac tinh nang dang mo-dun. Moi tinh nang them MOT dong vao FEATURE_PAGES.
// Trang thai rieng cua tinh nang nam o state.f.<id> (xem src/features/<id>.js).
import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { State } from '../api'

export type Send = (cmd: string, payload?: unknown) => Promise<unknown>
export type PageProps = { state: State; send: Send; go: (page: string) => void }
export type FeaturePage = {
  id: string
  label: string
  icon: LucideIcon
  Page: ComponentType<PageProps>
  browser?: boolean // trang co khung YouTube Studio ben phai
  bottom?: boolean // dat o nhom duoi thanh ben
  after?: string // dat ngay sau trang nay (id); bo trong = cuoi nhom
  demo?: unknown // du lieu mau cho ?demo, gan vao state.f.<id>
}

export const FEATURE_PAGES: FeaturePage[] = [
]
