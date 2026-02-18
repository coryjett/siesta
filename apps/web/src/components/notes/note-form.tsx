import { useState } from 'react';
import RichTextEditor from '../common/rich-text-editor';
import { useCreateNote, useUpdateNote } from '../../api/mutations/notes';
import type { Note } from '@siesta/shared';

interface NoteFormProps {
  accountId?: string;
  opportunityId?: string;
  note?: Note;
  onSave?: () => void;
  onCancel?: () => void;
}

export default function NoteForm({ accountId, opportunityId, note, onSave, onCancel }: NoteFormProps) {
  const [contentJson, setContentJson] = useState<Record<string, unknown>>(
    note?.contentJson ?? {},
  );
  const [contentHtml, setContentHtml] = useState(note?.contentHtml ?? '');
  const [contentPlainText, setContentPlainText] = useState(note?.contentPlainText ?? '');

  const createNote = useCreateNote();
  const updateNote = useUpdateNote(note?.id ?? '');

  const isEditing = !!note;
  const isPending = createNote.isPending || updateNote.isPending;

  const handleEditorChange = (json: Record<string, unknown>, html: string, plainText: string) => {
    setContentJson(json);
    setContentHtml(html);
    setContentPlainText(plainText);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contentHtml.trim()) return;

    try {
      if (isEditing) {
        await updateNote.mutateAsync({
          contentJson,
          contentHtml,
          contentPlainText,
        });
      } else {
        await createNote.mutateAsync({
          accountId: accountId ?? null,
          opportunityId: opportunityId ?? null,
          contentJson,
          contentHtml,
          contentPlainText,
        });
      }
      onSave?.();
    } catch {
      // Error is handled by the mutation's error state
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <RichTextEditor
        content={note?.contentJson}
        onChange={handleEditorChange}
        editable
      />

      {(createNote.isError || updateNote.isError) && (
        <p className="text-sm text-red-600">
          {(createNote.error ?? updateNote.error)?.message ?? 'Failed to save note'}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            disabled={isPending}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isPending || !contentHtml.trim()}
        >
          {isPending ? 'Saving...' : isEditing ? 'Update Note' : 'Save Note'}
        </button>
      </div>
    </form>
  );
}
