import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { Alert } from 'react-native';
import { Profile } from '@/types/Profile';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { mapApiError } from '@/lib/errorHandler';

export const useStudentBooking = (profile: Profile | null | undefined) => {
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const bookingKeys = useRef(new Map<string, string>());

  const loadSlots = useCallback(async (registrationNumber: string, date: string, type: 'EXPERT' | 'PEER') => {
    setLoadingSlots(true);
    const table = type === 'EXPERT' ? 'expert_schedule' : 'student_schedule';
    const regField = type === 'EXPERT' ? 'expert_registration_number' : 'peer_registration_number';

    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq(regField, registrationNumber)
        .eq('date', date)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setAvailableSlots(data || []);
    } catch (error) {
      logger.error(`Error loading slots from ${table}`, error);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const bookSession = async (params: {
    expertId: string;
    expertName: string;
    expertReg: string;
    date: string;
    time: string;
    mode: 'online' | 'offline' | null;
    type: 'EXPERT' | 'PEER';
  }) => {
    if (!profile) return false;

    try {
      const selectedSlot = availableSlots.find((slot) => slot.start_time === params.time);
      if (!selectedSlot?.id) {
        throw new Error('INVALID_REQUEST: Selected slot is no longer available');
      }

      const bookingKey = `${params.type}:${selectedSlot.id}`;
      const idempotencyKey = bookingKeys.current.get(bookingKey) ?? generateIdempotencyKey();
      bookingKeys.current.set(bookingKey, idempotencyKey);

      const { error } = await supabase.functions.invoke('book-session', {
        body: {
          expertId: params.expertId,
          slotId: selectedSlot.id,
          expertRegistrationNumber: params.expertReg,
          expertName: params.expertName,
          date: params.date,
          time: params.time,
          mode: params.mode,
          type: params.type,
          idempotencyKey,
        },
      });

      if (error) {
        const mapped = mapApiError(error);
        Alert.alert('Unable to book', mapped.userMessage);
        return false;
      }

      bookingKeys.current.delete(bookingKey);
      return true;
    } catch (error) {
      logger.error('Error booking session', error);
      return false;
    }
  };

  return { loadingSlots, availableSlots, loadSlots, bookSession };
};
