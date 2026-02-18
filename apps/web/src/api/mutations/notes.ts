import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type { CreateNoteInput, UpdateNoteInput, Note } from '@siesta/shared';

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation<Note, Error, CreateNoteInput>({
    mutationFn: (data) => api.post('/notes', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useUpdateNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Note, Error, UpdateNoteInput>({
    mutationFn: (data) => api.put(`/notes/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete(`/notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}
