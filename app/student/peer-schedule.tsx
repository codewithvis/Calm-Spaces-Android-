import { useState, useEffect } from 'react';
import {  View,  Text,  StyleSheet,  ScrollView,  TouchableOpacity,  ActivityIndicator,  Alert,  Modal,  TextInput,} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/Colors';
import { useProfile } from '@/api/Profile';
import { useAuth } from '@/providers/AuthProvider';

interface TimeSlot {
  id?: string;
  peer_id?: string;
  date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  peer_name?: string;
  peer_registration_number?: number;
}

const DEFAULT_SLOTS = [
  { start: '09:00:00', end: '09:50:00' },
  { start: '10:00:00', end: '10:50:00' },
  { start: '11:00:00', end: '11:50:00' },
  { start: '12:00:00', end: '12:50:00' },
  { start: '14:00:00', end: '14:50:00' },
  { start: '15:00:00', end: '15:50:00' },
];

const generateDefaultSlots = (date: Date): TimeSlot[] => {
  const dateString = formatDateToLocalString(date);
  return DEFAULT_SLOTS.map(slot => ({
    date: dateString,
    start_time: slot.start,
    end_time: slot.end,
    is_available: true,
  }));
};

const formatDateToLocalString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PeerSchedule() {
  const router = useRouter();

  const {session } = useAuth();
  const {data: profile} = useProfile(session?.user.id);

  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [customSlotModalVisible, setCustomSlotModalVisible] = useState(false);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [allSchedules, setAllSchedules] = useState<Map<string, TimeSlot[]>>(new Map());
  const [customSlot, setCustomSlot] = useState({
    startHour: '',
    startMinute: '',
    endHour: '',
    endMinute: '',
  });


  // Function to automatically generate default slots for all dates in the month
  const autoGenerateMonthlySlots = async () => {
    if (!profile || !profile.registration_number) return;

    try {
      const regNum = parseInt(profile.registration_number.toString(), 10);
      if (isNaN(regNum)) {
          console.error('Invalid peer registration number for auto-generation');
          return;
      }

      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all existing slots for the month
      const { data: existingSlots, error: fetchError } = await supabase
        .from('student_schedule')
        .select('date, start_time, end_time')
        .eq('peer_registration_number', regNum)
        .gte('date', formatDateToLocalString(startOfMonth))
        .lte('date', formatDateToLocalString(endOfMonth));

      if (fetchError) {
        console.error('Error fetching existing slots:', fetchError);
        return;
      }

      // Create a Set of date+time combinations that already exist
      const existingSlotKeys = new Set(
        existingSlots?.map(slot => `${slot.date}_${slot.start_time}_${slot.end_time}`) || []
      );

      // Generate slots for all dates in the month that don't have slots yet
      const slotsToInsert: any[] = [];
      
      for (let day = 1; day <= endOfMonth.getDate(); day++) {
        const currentDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const dateString = formatDateToLocalString(currentDate);

        // Skip if date is in the past
        if (currentDate < today) {
          continue;
        }

        // Add default slots for this date if they don't exist
        DEFAULT_SLOTS.forEach(slot => {
          const slotKey = `${dateString}_${slot.start}_${slot.end}`;
          
          // Only add if this exact slot doesn't exist
          if (!existingSlotKeys.has(slotKey)) {
            slotsToInsert.push({
              peer_registration_number: profile.registration_number,
              peer_name: profile.name,
              peer_id: profile.id,
              date: dateString,
              start_time: slot.start,
              end_time: slot.end,
              is_available: true
            });
          }
        });
      }

      // Insert all slots at once if there are any
      if (slotsToInsert.length > 0) {
        console.log(`📅 Auto-generating ${slotsToInsert.length} peer slots for the month...`);
        
        const { error: insertError } = await supabase
          .from('student_schedule')
          .insert(slotsToInsert);

        if (insertError) {
          console.error('Error auto-generating peer slots:', insertError);
        } else {
          console.log('✅ Successfully auto-generated peer monthly slots');
          await loadAllSchedules();
        }
      }
    } catch (error) {
      console.error('Error in autoGenerateMonthlySlots:', error);
    }
  };

  useEffect(() => {
    if (profile) {
      loadAllSchedules();
      // Automatically generate default slots for all dates in the month
      autoGenerateMonthlySlots();

      // Set up real-time subscription for schedule changes
      const channel = supabase
        .channel(`peer_schedule_${profile.registration_number}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'student_schedule',
            filter: `peer_registration_number=eq.${profile.registration_number}`,
          },
          (payload) => {
            console.log('Schedule changed:', payload);
            loadAllSchedules();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentMonth, profile]);

  const loadAllSchedules = async () => {
    if (!profile) return;
    
    try {
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('student_schedule')
        .select('*')
        .eq('peer_registration_number', profile.registration_number)
        .gte('date', formatDateToLocalString(startOfMonth))
        .lte('date', formatDateToLocalString(endOfMonth))
        .order('start_time', { ascending: true });

      if (error) throw error;

      const scheduleMap = new Map<string, TimeSlot[]>();
      data?.forEach(slot => {
        const dateKey = slot.date;
        if (!scheduleMap.has(dateKey)) {
          scheduleMap.set(dateKey, []);
        }
        scheduleMap.get(dateKey)?.push(slot);
      });

      setAllSchedules(scheduleMap);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  };

  const loadSlotsForDate = async (date: Date) => {
    if (!profile) return;
    
    setLoading(true);
    try {
      const dateString = formatDateToLocalString(date);
      const { data, error } = await supabase
        .from('student_schedule')
        .select('*')
        .eq('peer_registration_number', profile.registration_number)
        .eq('date', dateString)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setSlots(data || []);
    } catch (error) {
      console.error('Error loading slots:', error);
      Alert.alert('Error', 'Failed to load time slots.');
    } finally {
      setLoading(false);
    }
  };

  const handleDatePress = async (date: Date) => {
    setSelectedDate(date);
    await loadSlotsForDate(date);
  };

  const handleAddCustomSlot = async () => {
    if (!selectedDate || !profile) return;

    const { startHour, startMinute, endHour, endMinute } = customSlot;

    if (!startHour || !startMinute || !endHour || !endMinute) {
      Alert.alert('Error', 'Please fill in all time fields.');
      return;
    }

    const startTime = `${startHour.padStart(2, '0')}:${startMinute.padStart(2, '0')}:00`;
    const endTime = `${endHour.padStart(2, '0')}:${endMinute.padStart(2, '0')}:00`;

    if (startTime >= endTime) {
      Alert.alert('Error', 'End time must be after start time.');
      return;
    }

    // Check for duplicate slots (including date)
    const dateString = formatDateToLocalString(selectedDate);
    const isDuplicate = slots.some(slot => 
      slot.date === dateString &&
      slot.start_time === startTime && 
      slot.end_time === endTime
    );
    
    if (isDuplicate) {
      Alert.alert('Duplicate Slot', 'This exact time slot already exists for this date.');
      return;
    }

    Alert.alert(
      'Add Custom Slot',
      `Add slot from ${startTime} to ${endTime}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async () => {
            setLoading(true);
            try {
              const dateString = formatDateToLocalString(selectedDate);
              const { error } = await supabase
                .from('student_schedule')
                .insert({
                  peer_id: profile.id,
                  peer_name: profile.name,
                  peer_registration_number: profile.registration_number,
                  date: dateString,
                  start_time: startTime,
                  end_time: endTime,
                  is_available: true,
                });

              if (error) throw error;

              Alert.alert('Success', 'Custom slot added successfully!');
              setCustomSlotModalVisible(false);
              setCustomSlot({ startHour: '', startMinute: '', endHour: '', endMinute: '' });
              await loadSlotsForDate(selectedDate);
              await loadAllSchedules();
            } catch (error) {
              console.error('Error adding custom slot:', error);
              Alert.alert('Error', 'Failed to add custom slot.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleAddDefaultSlots = async () => {
    if (!selectedDate || !profile) return;

    Alert.alert(
      'Add Default Slots',
      'Add default time slots (9AM-3:50PM)?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async () => {
            setLoading(true);
            try {
              const dateString = formatDateToLocalString(selectedDate);
              
              // Filter out slots that already exist (including date in the check)
              const existingSlotKeys = new Set(
                slots
                  .filter(slot => slot.date === dateString)
                  .map(slot => `${slot.start_time}_${slot.end_time}`)
              );
              
              const slotsToAdd = generateDefaultSlots(selectedDate)
                .filter(slot => !existingSlotKeys.has(`${slot.start_time}_${slot.end_time}`))
                .map(slot => ({
                  ...slot,
                  peer_registration_number: profile.registration_number,
                  peer_name: profile.name,
                  peer_id: profile.id,
                }));

              if (slotsToAdd.length === 0) {
                Alert.alert('Info', 'All default slots already exist for this date.');
                setLoading(false);
                return;
              }

              const { error } = await supabase
                .from('student_schedule')
                .insert(slotsToAdd);

              if (error) throw error;

              Alert.alert('Success', `${slotsToAdd.length} default slot(s) added successfully!`);
              await loadSlotsForDate(selectedDate);
              await loadAllSchedules();
            } catch (error) {
              console.error('Error adding default slots:', error);
              Alert.alert('Error', 'Failed to add default slots.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteSlot = async (slotId: string) => {
    Alert.alert(
      'Delete Slot',
      'Are you sure you want to delete this time slot?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from('student_schedule')
                .delete()
                .eq('id', slotId);

              if (error) {
                console.error('Error deleting slot:', error);
                Alert.alert('Error', 'Failed to delete slot.');
              } else {
                Alert.alert('Success', 'Slot deleted successfully!');
                if (selectedDate) {
                  await loadSlotsForDate(selectedDate);
                  await loadAllSchedules();
                }
              }
            } catch (error) {
              console.error('Error:', error);
              Alert.alert('Error', 'An error occurred while deleting slot.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteAllSlots = async () => {
    if (!selectedDate) return;

    Alert.alert(
      'Delete All Slots',
      `Delete all time slots for ${selectedDate.toLocaleDateString()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const dateString = formatDateToLocalString(selectedDate);
              const { error } = await supabase
                .from('student_schedule')
                .delete()
                .eq('peer_registration_number', profile?.registration_number)
                .eq('date', dateString);

              if (error) {
                console.error('Error deleting slots:', error);
                Alert.alert('Error', 'Failed to delete slots.');
              } else {
                Alert.alert('Success', 'All slots deleted successfully!');
                setSlots([]);
                await loadAllSchedules();
              }
            } catch (error) {
              console.error('Error:', error);
              Alert.alert('Error', 'An error occurred while deleting slots.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty slots for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const hasSchedule = (date: Date) => {
    const dateString = formatDateToLocalString(date);
    return allSchedules.has(dateString) && (allSchedules.get(dateString)?.length || 0) > 0;
  };

  const renderCalendar = () => {
    const days = getDaysInMonth(currentMonth);
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <View style={styles.calendar}>
        {/* Month Header */}
        <View style={styles.monthHeader}>
          <TouchableOpacity
            onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            style={styles.monthButton}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity
            onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            style={styles.monthButton}
          >
            <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Week Days */}
        <View style={styles.weekDays}>
          {weekDays.map(day => (
            <View key={day} style={styles.weekDayCell}>
              <Text style={styles.weekDayText}>{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Days */}
        <View style={styles.daysGrid}>
          {days.map((day, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayCell,
                !day && styles.emptyCell,
                day && isToday(day) && styles.todayCell,
                day && hasSchedule(day) && styles.scheduledCell
              ]}
              onPress={() => day && handleDatePress(day)}
              disabled={!day}
            >
              {day && (
                <>
                  <Text style={[
                    styles.dayText,
                    isToday(day) && styles.todayText,
                    hasSchedule(day) && styles.scheduledText
                  ]}>
                    {day.getDate()}
                  </Text>
                  {hasSchedule(day) && <View style={styles.scheduleDot} />}
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderCustomSlotModal = () => (
    <Modal
      visible={customSlotModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setCustomSlotModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.customSlotModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Custom Time Slot</Text>
            <TouchableOpacity onPress={() => setCustomSlotModalVisible(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.customSlotForm}>
            {/* Start Time */}
            <Text style={styles.formLabel}>Start Time</Text>
            <View style={styles.timeInputRow}>
              <TextInput
                style={styles.timeInput}
                value={customSlot.startHour}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, '');
                  if (num === '') {
                    setCustomSlot({ ...customSlot, startHour: '' });
                  } else if (parseInt(num) >= 0 && parseInt(num) <= 23) {
                    setCustomSlot({ ...customSlot, startHour: num });
                  }
                }}
                keyboardType="numeric"
                maxLength={2}
                placeholder="HH"
              />
              <Text style={styles.timeSeparator}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={customSlot.startMinute}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, '');
                  if (num === '') {
                    setCustomSlot({ ...customSlot, startMinute: '' });
                  } else if (parseInt(num) >= 0 && parseInt(num) <= 59) {
                    setCustomSlot({ ...customSlot, startMinute: num });
                  }
                }}
                keyboardType="numeric"
                maxLength={2}
                placeholder="MM"
              />
            </View>

            {/* End Time */}
            <Text style={styles.formLabel}>End Time</Text>
            <View style={styles.timeInputRow}>
              <TextInput
                style={styles.timeInput}
                value={customSlot.endHour}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, '');
                  if (num === '') {
                    setCustomSlot({ ...customSlot, endHour: '' });
                  } else if (parseInt(num) >= 0 && parseInt(num) <= 23) {
                    setCustomSlot({ ...customSlot, endHour: num });
                  }
                }}
                keyboardType="numeric"
                maxLength={2}
                placeholder="HH"
              />
              <Text style={styles.timeSeparator}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={customSlot.endMinute}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, '');
                  if (num === '') {
                    setCustomSlot({ ...customSlot, endMinute: '' });
                  } else if (parseInt(num) >= 0 && parseInt(num) <= 59) {
                    setCustomSlot({ ...customSlot, endMinute: num });
                  }
                }}
                keyboardType="numeric"
                maxLength={2}
                placeholder="MM"
              />
            </View>

            <Text style={styles.timePreview}>
              Slot: {customSlot.startHour.padStart(2, '0')}:{customSlot.startMinute.padStart(2, '0')} - {customSlot.endHour.padStart(2, '0')}:{customSlot.endMinute.padStart(2, '0')}
            </Text>

            <TouchableOpacity
              style={styles.addCustomSlotButton}
              onPress={handleAddCustomSlot}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Add Slot</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>My Schedule</Text>
          <Text style={styles.headerSubtitle}>{profile?.name}</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={Colors.primary} />
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>Schedule Management</Text>
            <Text style={styles.infoText}>
              Tap on any date to view and manage time slots. Default slots (9AM-9:50AM, 10AM-10:50AM, 11AM-11:50AM, 12PM-12:50PM, 2PM-2:50PM, 3PM-3:50PM) are added automatically.
            </Text>
          </View>
        </View>

        {/* Calendar */}
        {renderCalendar()}

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItems}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, { backgroundColor: Colors.primary + '20' }]} />
              <Text style={styles.legendText}>Today</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, { backgroundColor: '#E8F5E9' }]} />
              <Text style={styles.legendText}>Has Schedule</Text>
            </View>
          </View>
        </View>

        {/* Selected Date Schedule */}
        {selectedDate && (
          <View style={styles.scheduleSection}>
            <View style={styles.scheduleSectionHeader}>
              <View>
                <Text style={styles.scheduleSectionTitle}>
                  {selectedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                  })}
                </Text>
                <Text style={styles.scheduleSectionSubtitle}>
                  {slots.length} slot{slots.length !== 1 ? 's' : ''} scheduled
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.addDefaultBtn]}
                onPress={handleAddDefaultSlots}
                disabled={loading}
              >
                <Ionicons name="calendar" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Add Default</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.addCustomBtn]}
                onPress={() => setCustomSlotModalVisible(true)}
                disabled={loading}
              >
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Custom Slot</Text>
              </TouchableOpacity>

              {slots.length > 0 && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteAllBtn]}
                  onPress={handleDeleteAllSlots}
                  disabled={loading}
                >
                  <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Delete All</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Slots List */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading slots...</Text>
              </View>
            ) : slots.length === 0 ? (
              <View style={styles.emptySlots}>
                <Ionicons name="calendar-outline" size={50} color="#ccc" />
                <Text style={styles.emptySlotsText}>No time slots scheduled</Text>
                <Text style={styles.emptySlotsHint}>Add default slots or create a custom time slot</Text>
              </View>
            ) : (
              <View style={styles.slotsList}>
                {slots.map((slot, index) => (
                  <View key={slot.id || index} style={styles.slotCard}>
                    <View style={styles.slotInfo}>
                      <View style={styles.slotTimeContainer}>
                        <Ionicons name="time-outline" size={20} color={Colors.primary} />
                        <Text style={styles.slotTime}>
                          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                        </Text>
                      </View>
                      <View style={[
                        styles.slotStatus,
                        { backgroundColor: slot.is_available ? '#E8F5E9' : '#FFEBEE' }
                      ]}>
                        <Text style={[
                          styles.slotStatusText,
                          { color: slot.is_available ? '#4CAF50' : '#F44336' }
                        ]}>
                          {slot.is_available ? '✓ Available' : '✗ Booked'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteSlotBtn}
                      onPress={() => slot.id && handleDeleteSlot(slot.id)}
                      disabled={loading}
                    >
                      <Ionicons name="trash-outline" size={22} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Custom Slot Modal */}
      {renderCustomSlotModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  backButton: {
    marginRight: 15,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  content: {
    flex: 1,
    padding: 15,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  infoTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  calendar: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  monthButton: {
    padding: 5,
  },
  monthText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  weekDays: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 5,
    position: 'relative',
  },
  emptyCell: {
    opacity: 0,
  },
  todayCell: {
    backgroundColor: Colors.primary + '20',
    borderRadius: 8,
  },
  scheduledCell: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  dayText: {
    fontSize: 16,
    color: '#333',
  },
  todayText: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  scheduledText: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  scheduleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4CAF50',
    position: 'absolute',
    bottom: 5,
  },
  legend: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },
  legendItems: {
    flexDirection: 'row',
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  deleteAllBtn: {
    backgroundColor: '#F44336',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptySlots: {
    alignItems: 'center',
    padding: 40,
  },
  emptySlotsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    marginTop: 15,
  },
  emptySlotsHint: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
    textAlign: 'center',
  },
  slotCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotInfo: {
    flex: 1,
    gap: 8,
  },
  slotTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  slotStatus: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  slotStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deleteSlotBtn: {
    padding: 8,
  },
  scheduleSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginTop: 20,
  },
  scheduleSectionHeader: {
    marginBottom: 15,
  },
  scheduleSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  scheduleSectionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  addDefaultBtn: {
    backgroundColor: Colors.primary,
  },
  addCustomBtn: {
    backgroundColor: '#2196F3',
  },
  loadingText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    padding: 20,
  },
  customSlotModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  customSlotForm: {
    padding: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    marginTop: 15,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  timeInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    minWidth: 70,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  timePreview: {
    textAlign: 'center',
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  addCustomSlotButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  slotsList: {
    gap: 10,
  },
});
