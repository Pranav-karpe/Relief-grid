import { AuthApiError } from './auth'

export type Notification = {
  _id: string
  recipient: string
  eventType: string
  title: string
  message: string
  relatedEntityType: string
  relatedEntityId: string
  readAt?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

type ListResponse = { data: Notification[]; page: { nextCursor: string | null } }

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({})) as { data?: T; code?: string; message?: string }
  if (!res.ok) {
    throw new AuthApiError(
      json.code ?? 'api_error',
      json.message ?? `Request failed with status ${res.status}`,
      res.status,
    )
  }
  return json.data as T
}

async function parseListResponse(res: Response): Promise<ListResponse> {
  const json = await res.json().catch(() => ({})) as ListResponse & { code?: string; message?: string }
  if (!res.ok) {
    throw new AuthApiError(
      (json as { code?: string }).code ?? 'api_error',
      (json as { message?: string }).message ?? `Request failed with status ${res.status}`,
      res.status,
    )
  }
  return json
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

/** List own notifications with optional unread filter and cursor pagination */
export async function getNotifications(
  token: string,
  params?: { cursor?: string; limit?: number; unread?: boolean },
): Promise<ListResponse> {
  const query = new URLSearchParams()
  if (params?.cursor) query.set('cursor', params.cursor)
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.unread) query.set('unread', 'true')
  const url = `/api/notifications${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseListResponse(res)
}

/** Get unread notification count */
export async function getUnreadCount(token: string): Promise<number> {
  const res = await fetch('/api/notifications/unread-count', { headers: authHeaders(token) })
  const data = await parseResponse<{ count: number }>(res)
  return data.count
}

/** Mark a single notification as read */
export async function markAsRead(token: string, notificationId: string): Promise<Notification> {
  const res = await fetch(`/api/notifications/${notificationId}/read`, {
    method: 'PATCH',
    headers: authHeaders(token),
  })
  return parseResponse<Notification>(res)
}

/** Mark all own notifications as read */
export async function markAllAsRead(token: string): Promise<{ modifiedCount: number }> {
  const res = await fetch('/api/notifications/read-all', {
    method: 'PATCH',
    headers: authHeaders(token),
  })
  return parseResponse<{ modifiedCount: number }>(res)
}
