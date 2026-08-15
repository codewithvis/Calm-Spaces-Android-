import React, { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { sendLocalNotification } from '@/lib/notificationService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

export const MOOD_EMOJIS = [
  { emoji: '😄', label: 'Happy' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '😔', label: 'Sad' },
  { emoji: '😡', label: 'Angry' },
];

export function getTodayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export const useMoodTracking = (userId: string | undefined, userType: string = 'STUDENT') => {
  const queryClient = useQueryClient();
  const [currentPromptInfo, setCurrentPromptInfo] = useState<{ timeLabel: string, scheduleKey: string } | null>(null);
  const [missedPromptsQueue, setMissedPromptsQueue] = useState<{ label: string, scheduleKey: string }[]>([]);
  const [sentNotificationsToday, setSentNotificationsToday] = useState<Set<string>>(new Set());
  const [lastNotificationDate, setLastNotificationDate] = useState<string>('');

  const { data: moodData = [], isLoading: isLoadingMoods, refetch: loadMoodData } = useQuery({
    queryKey: ['mood_entries', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('mood_entries')
        .select('*')
        .eq('user_id', userId)
        .order('entry_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Derived state from cached moodData
  const moodHistory = React.useMemo(() => {
    const history: { [key: string]: string } = {};
    moodData.forEach((entry: any) => {
      history[entry.entry_date] = entry.mood_emoji;
    });
    return history;
  }, [moodData]);

  const dailyMoodEntries = React.useMemo(() => {
    const daily: { [key: string]: any[] } = {};
    moodData.forEach((entry: any) => {
      const date = entry.entry_date;
      if (!daily[date]) daily[date] = [];
      daily[date].push({
        emoji: entry.mood_emoji,
        label: entry.mood_label,
        time: entry.entry_time,
        scheduled: entry.scheduled_label,
        scheduleKey: entry.schedule_key
      });
    });
    return daily;
  }, [moodData]);

  const todayMoodProgress = React.useMemo(() => {
    const today = getTodayKey();
    const completedCount = dailyMoodEntries[today]?.length || 0;
    return { completed: completedCount, total: 6 };
  }, [dailyMoodEntries]);

  const detailedMoodEntries = React.useMemo(() => {
    return moodData.map((entry: any) => ({
      date: entry.entry_date,
      emoji: entry.mood_emoji,
      label: entry.mood_label,
      time: entry.entry_time,
      scheduled: entry.scheduled_label,
      scheduleKey: entry.schedule_key,
      notes: entry.notes
    }));
  }, [moodData]);

  const checkForMoodPrompt = useCallback(async () => {
    if (!userId) return;
    const now = new Date();
    const today = getTodayKey();

    if (lastNotificationDate !== today) {
      setSentNotificationsToday(new Set());
      setLastNotificationDate(today);
    }

    try {
      const { data: todayMoods } = await supabase
        .from('mood_entries')
        .select('schedule_key')
        .eq('user_id', userId)
        .eq('entry_date', today);

      const completedSlots = new Set(todayMoods?.map((m: any) => m.schedule_key).filter(Boolean) || []);
      const currentHour = now.getHours();
      const missed: any[] = [];

      const timeSlots = [
        { start: 8, end: 11, scheduleKey: 'slot_1', label: 'Morning (8-11 AM)' },
        { start: 11, end: 13, scheduleKey: 'slot_2', label: 'Late Morning (11 AM-1 PM)' },
        { start: 13, end: 15, scheduleKey: 'slot_3', label: 'Afternoon (1-3 PM)' },
        { start: 15, end: 17, scheduleKey: 'slot_4', label: 'Late Afternoon (3-5 PM)' },
        { start: 17, end: 19, scheduleKey: 'slot_5', label: 'Evening (5-7 PM)' },
        { start: 19, end: 21, scheduleKey: 'slot_6', label: 'Night (7-9 PM)' }
      ];

      for (const slot of timeSlots) {
        if ((currentHour >= slot.start) && !completedSlots.has(slot.scheduleKey)) {
          missed.push({ label: slot.label, scheduleKey: slot.scheduleKey });
        }
      }

      if (missed.length > 0) {
        const next = missed[0];
        if (!sentNotificationsToday.has(next.scheduleKey)) {
          await sendLocalNotification('😊 Time for Mood Check-in', `${next.label} - How are you feeling right now?`);
          setSentNotificationsToday(prev => new Set(prev).add(next.scheduleKey));
        }
        setCurrentPromptInfo({ timeLabel: next.label, scheduleKey: next.scheduleKey });
        setMissedPromptsQueue(missed);
        return true;
      }
    } catch (err) {
      console.error('Error in checkForMoodPrompt:', err);
    }
    return false;
  }, [userId, lastNotificationDate, sentNotificationsToday]);

  const saveMood = async (mood: string, notes: string = '') => {
    if (!userId) {
      logger.error('Cannot save mood: No user ID');
      return false;
    }

    const moodDataInfo = MOOD_EMOJIS.find(m => m.emoji === mood);

    // Ensure we have a schedule key if we're responding to a prompt
    // but allow unscheduled entries too
    const finalScheduleKey = currentPromptInfo?.scheduleKey || '';
    const finalScheduledLabel = currentPromptInfo?.timeLabel || 'Unscheduled';

    try {
      const moodEntry = {
        user_id: userId,
        user_type: userType || 'STUDENT',
        mood_emoji: mood,
        mood_label: moodDataInfo?.label || 'Unknown',
        entry_date: getTodayKey(),
        entry_time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        scheduled_label: finalScheduledLabel,
        schedule_key: finalScheduleKey,
        notes: notes.trim() || null
      };

      logger.info('Saving mood entry...', { key: finalScheduleKey });

      const { data, error } = await supabase
        .from('mood_entries')
        .insert([moodEntry])
        .select()
        .maybeSingle();

      if (error) {
        logger.error('Supabase error saving mood:', error);
        Alert.alert('Save Failed', `Unable to save your mood: ${error.message}`);
        return false;
      }

      logger.info('Mood saved successfully', { id: data?.id });

      // Refresh data
      await queryClient.invalidateQueries({ queryKey: ['mood_entries', userId] });

      // Clear current prompt
      setCurrentPromptInfo(null);

      // If we had more missed prompts, maybe don't clear the queue entirely
      // but let the next checkForMoodPrompt handle it

      return true;
    } catch (err: any) {
      logger.error('Exception in saveMood:', err);
      Alert.alert('Error', 'An unexpected error occurred while saving your mood.');
      return false;
    }
  };

  return {
    moodHistory, dailyMoodEntries, detailedMoodEntries, todayMoodProgress,
    currentPromptInfo, missedPromptsQueue, loadMoodData, checkForMoodPrompt, saveMood, isLoadingMoods
  };
};
