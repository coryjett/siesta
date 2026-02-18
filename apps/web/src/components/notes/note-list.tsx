import { useState } from 'react';
import { useNotes } from '../../api/queries/notes';
import { useDeleteNote } from '../../api/mutations/notes';
import { useAuth } from '../../contexts/auth-context';
import NoteForm from './note-form';
import { Spinner } from '../common/loading';
import EmptyState from '../common/empty-state';
import type { Note } from '@siesta/shared';

interface NoteListProps {
  accountId?: string;
  opportunityId?: string;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function NoteList({ accountId, opportunityId }: NoteListProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [page, setPage] = useState(1);

  const { user } = useAuth();
  const { data, isLoading, isError } = useNotes({ accountId, opportunityId, page });
  const deleteNote = useDeleteNote();

  const handleDelete = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    await deleteNote.mutateAsync(noteId);
  };

  const handleSave = () => {
    setShowForm(false);
    setEditingNote(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingNote(null);
  };

  const handleEdit = (note: Note) => {
    setEditingNote(note);
    setShowForm(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-red-600 py-4">Failed to load notes.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
        {!showForm && !editingNote && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            Add Note
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-4">
          <NoteForm
            accountId={accountId}
            opportunityId={opportunityId}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {editingNote && (
        <div className="bg-gray-50 rounded-lg p-4">
          <NoteForm
            accountId={accountId}
            opportunityId={opportunityId}
            note={editingNote}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {(!data || data.data.length === 0) && !showForm && !editingNote ? (
        <EmptyState
          title="No notes yet"
          description="Add a note to keep track of important details."
          action={
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
            >
              Add Note
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data?.data.map((note) => (
            <div
              key={note.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {note.authorName}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatRelativeDate(note.createdAt)}
                  </span>
                  {note.updatedAt !== note.createdAt && (
                    <span className="text-xs text-gray-400">(edited)</span>
                  )}
                </div>
                {user && user.id === note.authorId && !editingNote && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(note)}
                      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                      disabled={deleteNote.isPending}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: note.contentHtml }}
              />
            </div>
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
