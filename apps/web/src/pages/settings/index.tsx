import { useState } from 'react';
import type { UserRole } from '@siesta/shared';
import { useConnectionStatus, useSyncStatus, useUsers, useSettings } from '../../api/queries/settings';
import {
  useSaveSfConnection,
  useSaveGongConnection,
  useUpdateSeFieldMapping,
  useUpdateUserRole,
  useTriggerSync,
} from '../../api/mutations/settings';
import OAuthConnection, { type FieldConfig } from '../../components/settings/oauth-connection';
import RoleManager from '../../components/settings/role-manager';
import SyncStatusTable from '../../components/settings/sync-status';
import Card from '../../components/common/card';
import { useTheme } from '../../contexts/theme-context';

type TabId = 'connections' | 'field-mapping' | 'users' | 'sync' | 'preferences';

const TABS: { id: TabId; label: string }[] = [
  { id: 'connections', label: 'Connections' },
  { id: 'field-mapping', label: 'Field Mapping' },
  { id: 'users', label: 'User Management' },
  { id: 'sync', label: 'Sync Status' },
  { id: 'preferences', label: 'Preferences' },
];

const SF_FIELDS: FieldConfig[] = [
  { name: 'sessionId', label: 'Session ID', type: 'password', placeholder: 'Paste your Salesforce session cookie (sid)' },
  { name: 'instanceUrl', label: 'Instance URL', type: 'url', placeholder: 'https://yourorg.my.salesforce.com' },
];

const GONG_FIELDS: FieldConfig[] = [
  { name: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Gong API Client ID' },
  { name: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Gong API Client Secret' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('connections');
  const [fieldApiName, setFieldApiName] = useState('');
  const [fieldMappingSaved, setFieldMappingSaved] = useState(false);

  // Queries
  const { data: connections, isLoading: connectionsLoading } = useConnectionStatus();
  const { data: syncStatuses, isLoading: syncLoading } = useSyncStatus();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: settings } = useSettings();

  // Mutations
  const saveSfConnection = useSaveSfConnection();
  const saveGongConnection = useSaveGongConnection();
  const updateFieldMapping = useUpdateSeFieldMapping();
  const updateUserRole = useUpdateUserRole();
  const triggerSync = useTriggerSync();

  // Initialize field mapping from settings
  const currentFieldApiName =
    settings?.find((s) => s.key === 'se_field_api_name')?.value ?? '';

  const handleSfSubmit = (values: Record<string, string>) => {
    saveSfConnection.mutate({
      sessionId: values.sessionId,
      instanceUrl: values.instanceUrl,
    });
  };

  const handleGongSubmit = (values: Record<string, string>) => {
    saveGongConnection.mutate({
      clientId: values.clientId,
      clientSecret: values.clientSecret,
    });
  };

  const handleFieldMappingSave = () => {
    const nameToSave = fieldApiName || currentFieldApiName;
    if (!nameToSave) return;

    updateFieldMapping.mutate(
      { fieldApiName: nameToSave },
      {
        onSuccess: () => {
          setFieldMappingSaved(true);
          setTimeout(() => setFieldMappingSaved(false), 3000);
        },
      },
    );
  };

  const handleUpdateRole = (userId: string, role: UserRole, sfUserId: string | null) => {
    updateUserRole.mutate({ userId, role, sfUserId });
  };

  const handleTriggerSync = (provider: string) => {
    triggerSync.mutate(provider);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'connections' && (
          <div className="space-y-6">
            {connectionsLoading ? (
              <p className="text-gray-500 text-sm">Loading connection status...</p>
            ) : (
              <>
                <OAuthConnection
                  provider="salesforce"
                  title="Salesforce Connection"
                  fields={SF_FIELDS}
                  onSubmit={handleSfSubmit}
                  isConnected={connections?.salesforce.connected ?? false}
                  isConfigured={connections?.salesforce.configured ?? false}
                  isLoading={saveSfConnection.isPending}
                />

                {saveSfConnection.isSuccess && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                    Salesforce connection saved successfully.
                  </div>
                )}
                {saveSfConnection.isError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    Failed to save Salesforce connection. Please check your credentials.
                  </div>
                )}

                <OAuthConnection
                  provider="gong"
                  title="Gong Connection"
                  fields={GONG_FIELDS}
                  onSubmit={handleGongSubmit}
                  isConnected={connections?.gong.connected ?? false}
                  isConfigured={connections?.gong.configured ?? false}
                  isLoading={saveGongConnection.isPending}
                />

                {saveGongConnection.isSuccess && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                    Gong connection saved successfully.
                  </div>
                )}
                {saveGongConnection.isError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    Failed to save Gong connection. Please check your credentials.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'field-mapping' && (
          <Card title="SE Assignment Field Mapping">
            <p className="text-sm text-gray-600 mb-4">
              Configure the Salesforce Opportunity field API name used to identify the assigned
              Sales Engineer. This field is used during sync to associate opportunities with SE
              users.
            </p>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label
                  htmlFor="se-field-api-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Field API Name
                </label>
                <input
                  id="se-field-api-name"
                  type="text"
                  value={fieldApiName || currentFieldApiName}
                  onChange={(e) => setFieldApiName(e.target.value)}
                  placeholder="e.g. SE_Assigned__c"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>
              <button
                onClick={handleFieldMappingSave}
                disabled={updateFieldMapping.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateFieldMapping.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
            {fieldMappingSaved && (
              <p className="mt-3 text-sm text-green-600">Field mapping saved successfully.</p>
            )}
            {updateFieldMapping.isError && (
              <p className="mt-3 text-sm text-red-600">
                Failed to save field mapping. Please enter a valid field API name.
              </p>
            )}
          </Card>
        )}

        {activeTab === 'users' && (
          <>
            {usersLoading ? (
              <p className="text-gray-500 text-sm">Loading users...</p>
            ) : (
              <RoleManager
                users={users ?? []}
                onUpdateRole={handleUpdateRole}
                isUpdating={updateUserRole.isPending}
              />
            )}
            {updateUserRole.isSuccess && (
              <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                User role updated successfully.
              </div>
            )}
            {updateUserRole.isError && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                Failed to update user role.
              </div>
            )}
          </>
        )}

        {activeTab === 'sync' && (
          <>
            {syncLoading ? (
              <p className="text-gray-500 text-sm">Loading sync status...</p>
            ) : (
              <SyncStatusTable
                statuses={syncStatuses ?? []}
                onTriggerSync={handleTriggerSync}
                isSyncing={triggerSync.isPending}
              />
            )}
            {triggerSync.isSuccess && (
              <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                Sync triggered successfully.
              </div>
            )}
            {triggerSync.isError && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                Failed to trigger sync.
              </div>
            )}
          </>
        )}

        {activeTab === 'preferences' && <PreferencesTab />}
      </div>
    </div>
  );
}

const THEME_OPTIONS = [
  {
    value: 'light' as const,
    label: 'Light',
    description: 'Use a light background with dark text',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    value: 'dark' as const,
    label: 'Dark',
    description: 'Use a dark background with light text',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    value: 'system' as const,
    label: 'System',
    description: 'Follow your operating system preference',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
];

function PreferencesTab() {
  const { theme, setTheme } = useTheme();

  return (
    <Card title="Appearance">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Choose how Siesta looks to you. Select a single theme or sync with your system settings.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
              theme === option.value
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className={theme === option.value ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}>
              {option.icon}
            </span>
            <span className={`text-sm font-medium ${theme === option.value ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {option.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
