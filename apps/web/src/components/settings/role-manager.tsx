import { useState } from 'react';
import type { User, UserRole } from '@siesta/shared';
import { ROLE_OPTIONS } from '@siesta/shared';
import Card from '../common/card';

interface RoleManagerProps {
  users: User[];
  onUpdateRole: (userId: string, role: UserRole, sfUserId: string | null) => void;
  isUpdating: boolean;
}

interface EditState {
  role: UserRole;
  sfUserId: string;
}

export default function RoleManager({ users, onUpdateRole, isUpdating }: RoleManagerProps) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ role: 'se', sfUserId: '' });

  const handleEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditState({
      role: user.role,
      sfUserId: user.sfUserId ?? '',
    });
  };

  const handleCancel = () => {
    setEditingUserId(null);
  };

  const handleSave = (userId: string) => {
    onUpdateRole(userId, editState.role, editState.sfUserId || null);
    setEditingUserId(null);
  };

  return (
    <Card title="User Management">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SF User ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user) => {
              const isEditing = editingUserId === user.id;

              return (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{user.email}</td>
                  <td className="px-4 py-3 text-sm">
                    {isEditing ? (
                      <select
                        value={editState.role}
                        onChange={(e) =>
                          setEditState((prev) => ({ ...prev, role: e.target.value as UserRole }))
                        }
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-900 dark:text-gray-100">
                        {ROLE_OPTIONS.find((o) => o.value === user.role)?.label ?? user.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editState.sfUserId}
                        onChange={(e) =>
                          setEditState((prev) => ({ ...prev, sfUserId: e.target.value }))
                        }
                        placeholder="e.g. 0051g00000ABC"
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded text-sm w-44 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
                        {user.sfUserId || '--'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSave(user.id)}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancel}
                          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(user)}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <p className="text-center text-gray-500 py-8 text-sm">No users found.</p>
        )}
      </div>
    </Card>
  );
}
