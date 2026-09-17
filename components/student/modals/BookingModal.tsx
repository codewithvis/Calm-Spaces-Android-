import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Alert } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Profile } from '@/types/Profile';

interface BookingModalProps {
  visible: boolean;
  type: 'EXPERT' | 'PEER';
  experts: Profile[];
  loadingExperts: boolean;
  onClose: () => void;
  onBook: (params: any) => Promise<boolean>;
  loadSlots: (reg: string, date: string, type: 'EXPERT' | 'PEER') => Promise<void>;
  availableSlots: any[];
  loadingSlots: boolean;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  visible,
  type,
  experts,
  loadingExperts,
  onClose,
  onBook,
  loadSlots,
  availableSlots,
  loadingSlots
}) => {
  const [selectedExpert, setSelectedExpert] = useState<Profile | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [bookingMode, setBookingMode] = useState<'online' | 'offline' | null>(null);
  const [booking, setBooking] = useState(false);

  const dates = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    const today = new Date();

    for (let offset = 0; offset < 14; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      const value = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
        .map((part) => part.toString().padStart(2, '0'))
        .join('-');
      const label = offset === 0
        ? 'Today'
        : offset === 1
          ? 'Tomorrow'
          : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      result.push({ value, label });
    }

    return result;
  }, []);

  useEffect(() => {
    if (!visible) {
      setSelectedExpert(null);
      setSelectedDate(null);
      setSelectedTime(null);
      setBookingMode(null);
      setBooking(false);
    }
  }, [visible]);

  const handleExpertSelect = (expert: Profile) => {
    setSelectedExpert(expert);
    setSelectedDate(null);
    setSelectedTime(null);
    setBookingMode(null);
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    if (selectedExpert) {
      loadSlots(selectedExpert.registration_number.toString(), date, type);
    }
  };

  const handleBook = async () => {
    if (!selectedExpert || !selectedDate || !selectedTime || (type === 'EXPERT' && !bookingMode)) return;

    setBooking(true);
    try {
      const success = await onBook({
        expertId: selectedExpert.id,
        expertName: selectedExpert.name,
        expertReg: selectedExpert.registration_number.toString(),
        date: selectedDate,
        time: selectedTime,
        mode: bookingMode,
        type
      });

      if (success) {
        onClose();
        Alert.alert('Success', 'Session booked successfully!');
      } else {
        Alert.alert('Unable to book', 'The session could not be booked. Please try again.');
      }
    } finally {
      setBooking(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Book {type === 'EXPERT' ? 'Psychologist' : 'Peer'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.closeX}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={styles.body}>
            <Text style={styles.sectionTitle}>Select {type === 'EXPERT' ? 'Expert' : 'Peer'}</Text>
            {loadingExperts ? <Text>Loading...</Text> : experts.map(e => (
              <TouchableOpacity
                key={e.id}
                onPress={() => handleExpertSelect(e)}
                style={[styles.expertCard, selectedExpert?.id === e.id && styles.selectedCard]}
              >
                <Text style={styles.expertName}>{e.name}</Text>
              </TouchableOpacity>
            ))}

            {selectedExpert && (
              <>
                <Text style={styles.sectionTitle}>Select Date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {dates.map(date => (
                    <TouchableOpacity
                      key={date.value}
                      onPress={() => handleDateSelect(date.value)}
                      style={[styles.option, selectedDate === date.value && styles.selectedOption]}
                    >
                      <Text style={[styles.optionText, selectedDate === date.value && styles.selectedOptionText]}>
                        {date.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {selectedDate && (
              <>
                <Text style={styles.sectionTitle}>Select Time</Text>
                {loadingSlots ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : availableSlots.length === 0 ? (
                  <Text style={styles.infoText}>No available times for this date.</Text>
                ) : (
                  <View style={styles.optionsWrap}>
                    {availableSlots.map(slot => {
                      const time = slot.start_time;
                      const label = slot.end_time ? `${time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}` : time.slice(0, 5);
                      return (
                        <TouchableOpacity
                          key={slot.id || `${slot.start_time}-${slot.end_time}`}
                          onPress={() => setSelectedTime(time)}
                          style={[styles.option, selectedTime === time && styles.selectedOption]}
                        >
                          <Text style={[styles.optionText, selectedTime === time && styles.selectedOptionText]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {type === 'EXPERT' && selectedTime && (
              <>
                <Text style={styles.sectionTitle}>Session Mode</Text>
                <View style={styles.optionsWrap}>
                  {(['online', 'offline'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => setBookingMode(mode)}
                      style={[styles.option, bookingMode === mode && styles.selectedOption]}
                    >
                      <Text style={[styles.optionText, bookingMode === mode && styles.selectedOptionText]}>
                        {mode === 'online' ? 'Online' : 'In person'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {selectedExpert && (
              <TouchableOpacity
                style={[styles.bookBtn, (!selectedTime || (type === 'EXPERT' && !bookingMode) || booking) && styles.disabledBtn]}
                onPress={handleBook}
                disabled={!selectedTime || (type === 'EXPERT' && !bookingMode) || booking}
              >
                {booking ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.bookBtnText}>Book Now</Text>}
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 18, fontWeight: 'bold' },
  closeX: { fontSize: 20, color: '#666' },
  body: { padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginVertical: 10 },
  expertCard: { padding: 15, backgroundColor: '#f9f9f9', borderRadius: 10, marginBottom: 10 },
  selectedCard: { borderColor: Colors.primary, borderWidth: 2 },
  expertName: { fontSize: 16 },
  option: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 8, marginBottom: 8 },
  selectedOption: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionText: { color: Colors.text, fontSize: 14 },
  selectedOptionText: { color: Colors.white, fontWeight: 'bold' },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  infoText: { color: Colors.textSecondary, marginBottom: 8 },
  bookBtn: { backgroundColor: Colors.primary, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  disabledBtn: { opacity: 0.5 },
  bookBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
