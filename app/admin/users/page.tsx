'use client'
import { useEffect, useState } from 'react'

type UserRow = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  role: 'admin' | 'manager'
  assigned_at: string | null
  assigned_by: string | null
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setError('Failed to load users'); setLoading(false) })
  }, [])

  async function setRole(userId: string, newRole: 'admin' | 'manager') {
    setSaving(userId)
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      setUsers(us => us.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } else {
      setError('Failed to update role')
    }
    setSaving(null)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage access roles for HR Portal users. Managers can only access the Manager Review (Performance) page.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading users…</div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Last Login</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Role</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Change Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{user.email}</div>
                    {user.assigned_by && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        Set by {user.assigned_by}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {user.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Never'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role === 'admin' ? '🔐 Admin' : '👤 Manager'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRole(user.id, 'admin')}
                        disabled={user.role === 'admin' || saving === user.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                      >
                        Make Admin
                      </button>
                      <button
                        onClick={() => setRole(user.id, 'manager')}
                        disabled={user.role === 'manager' || saving === user.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                      >
                        Make Manager
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">No users found</div>
          )}
        </div>
      )}

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        <strong>Role guide:</strong> Admins have full access to all pages. Managers can only access the Manager Review (Performance) page — HR Dossier and Admin tools are hidden and blocked.
      </div>
    </div>
  )
}
