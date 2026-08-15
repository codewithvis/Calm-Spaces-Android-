import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {  ActivityIndicator,  Alert,  RefreshControl,  ScrollView,  StyleSheet,  Text,  TextInput,  TouchableOpacity,  View} from 'react-native';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/api/Profile';
import { useAuth } from '@/providers/AuthProvider';
import { RefreshConfig } from '@/constants/RefreshConfig';

interface SessionRequest {
  id: string; // auto generated UUID
  student_id: string; // uuid
  student_name: string;
  student_registration_number: string | null;
student_email: string | null;
student_course: string | null;
notes: string | null;
  session_date: string;
  session_time: string;
  booking_mode: 'online' | 'offline';
  status: 'pending' | 'approved' | 'rejected';
  updated_at: string;
  expert_name: string;
  expert_registration_number: string;
  expert_id: string; // uuid
}

export default function ExpertClientPage() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);

  const [sessionRequests, setSessionRequests] = useState<SessionRequest[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<SessionRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (profile) {
      loadSessionRequests();
    }
  }, [profile]);

  // Auto-refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (profile) {
        loadSessionRequests();
      }
    }, [profile])
  );

  // Setup auto-refresh interval (every 45 seconds) + Real-time subscription
  useEffect(() => {
    if (!profile) return;

    // Set up real-time subscription for instant updates
    const channel = supabase
      .channel(`expert_clients_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'book_request',
          filter: `expert_id=eq.${profile.id}`,
        },
        (payload) => {
          console.log('Session request changed');
          // Reload data immediately on any change
          loadSessionRequests();
        }
      )
      .subscribe();

    // Also keep polling as backup (every 45 seconds)
    autoRefreshIntervalRef.current = setInterval(() => {
      loadSessionRequests();
    }, RefreshConfig.CLIENT_LIST_REFRESH_INTERVAL);

    return () => {
      supabase.removeChannel(channel);
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [profile]);

  const loadSessionRequests = async () => {
    setLoading(true);
    try {
      if (!profile) {
        console.log('No expert registration or name found');
        setSessionRequests([]);
        setFilteredSessions([]);
        setLoading(false);
        return;
      }

      const { data: sessionsData, error } = await supabase.from('book_request').select('*').eq("expert_id", profile.id).order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading session requests:', error);
        if (error.message?.includes('network') || error.message?.includes('fetch') || error.message?.includes('Failed to fetch')) {
          Alert.alert('Network Error', 'Unable to load session requests. Please check your internet connection.');
        }
        setSessionRequests([]);
        setFilteredSessions([]);
      } else if (sessionsData) {
        console.log('Successfully loaded sessions');
        const transformedSessions: SessionRequest[] = sessionsData.map(session => ({
  id: session.id,
  student_id: session.student_id,
  expert_id: session.expert_id,
  student_name: session.student_name || 'Unknown Student',
  student_registration_number: String(session.student_registration_number ?? 'N/A'),
  student_email: session.student_email || '',
  student_course: session.student_course || 'N/A',
  session_date: session.session_date || '',
  session_time: session.session_time || '',
  booking_mode: session.booking_mode || 'online',
  status: session.status || 'pending',
  updated_at: session.updated_at || session.created_at || '',
  notes: session.notes || '',
  expert_name: session.expert_name || '',
  expert_registration_number: session.expert_registration_number || ''
}));
        setSessionRequests(transformedSessions);
        setFilteredSessions(transformedSessions);
      }
    } catch (error) {
      console.error('Error loading session requests:', error);
      setSessionRequests([]);
      setFilteredSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
  setSearchQuery(text);
  if (!text.trim()) {
    setFilteredSessions(sessionRequests);
    return;
  }
  const q = text.toLowerCase();
  const filtered = sessionRequests.filter(s =>
    (s.student_name ?? '').toLowerCase().includes(q) ||
    String(s.student_registration_number ?? '').toLowerCase().includes(q) ||
    (s.status ?? '').toLowerCase().includes(q)
  );
  setFilteredSessions(filtered);
};

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSessionRequests();
    setRefreshing(false);
  };

  const handleConfirm = async (session: SessionRequest) => {
    Alert.alert(
      'Approve Session',
      `Approve and book session with ${session.student_name} on ${formatDate(session.session_date)} at ${session.session_time}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              // Update the booking request status
              const { error: bookingError } = await supabase
                .from('book_request')
                .update({
                  status: 'approved',
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);

              if (bookingError) {
                console.error('Error approving session:', bookingError);
                Alert.alert('Error', 'Failed to approve session. Please try again.');
                return;
              }

              // Mark the time slot as unavailable in expert_schedule
              // Convert time format from "HH:MM AM/PM" to "HH:MM:SS"
              const convertTimeFormat = (timeStr: string): string => {
                const [time, period] = timeStr.split(' ');
                let [hours, minutes] = time.split(':');
                let hour = parseInt(hours);

                if (period === 'PM' && hour !== 12) {
                  hour += 12;
                } else if (period === 'AM' && hour === 12) {
                  hour = 0;
                }

                return `${hour.toString().padStart(2, '0')}:${minutes}:00`;
              };

              const startTime = convertTimeFormat(session.session_time);
              const expertRegNum = parseInt(session.expert_registration_number || '0', 10);
              const studentRegNum = parseInt(session.student_registration_number || '0', 10);

              // Update the expert_schedule to mark slot as booked
              const { error: scheduleError } = await supabase
                .from('expert_schedule')
                .update({
                  is_available: false,
                  booked_by: studentRegNum
                })
                .eq('expert_registration_number', expertRegNum)
                .eq('date', session.session_date)
                .eq('start_time', startTime);

              if (scheduleError) {
                console.error('Warning: Could not update schedule slot:', scheduleError);
                // Don't fail the approval if schedule update fails
                console.log('Session approved but schedule slot update failed');
              } else {
                console.log('Successfully marked time slot as unavailable');
              }

              Alert.alert('✅ Success', 'Session approved and booked successfully!');
              await loadSessionRequests();
            } catch (err) {
              console.error('Error:', err);
              Alert.alert('Error', 'An error occurred. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleReject = async (session: SessionRequest) => {
    Alert.alert(
      'Reject Session',
      `Are you sure you want to reject the session with ${session.student_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              // Get current session status before updating
              const wasApproved = session.status === 'approved';

              const { error } = await supabase
                .from('book_request')
                .update({
                  status: 'rejected',
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);

              if (error) {
                console.error('Error rejecting session:', error);
                Alert.alert('Error', 'Failed to reject session. Please try again.');
              } else {
                // If session was previously approved, free the slot
                if (wasApproved) {
                  const convertTimeFormat = (timeStr: string): string => {
                    const [time, period] = timeStr.split(' ');
                    let [hours, minutes] = time.split(':');
                    let hour = parseInt(hours);

                    if (period === 'PM' && hour !== 12) {
                      hour += 12;
                    } else if (period === 'AM' && hour === 12) {
                      hour = 0;
                    }

                    return `${hour.toString().padStart(2, '0')}:${minutes}:00`;
                  };

                  const startTime = convertTimeFormat(session.session_time);

                  await supabase
                    .from('expert_schedule')
                    .update({
                      is_available: true,
                      booked_by: null
                    })
                    .eq('expert_registration_number', session.expert_registration_number)
                    .eq('date', session.session_date)
                    .eq('start_time', startTime);
                }

                Alert.alert('Success', 'Session rejected and slot freed.');
                await loadSessionRequests();
              }
            } catch (err) {
              console.error('Error:', err);
              Alert.alert('Error', 'An error occurred. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleDelete = async (session: SessionRequest) => {
    Alert.alert(
      'Delete Session Request',
      `Are you sure you want to permanently delete this session request from ${session.student_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Check if session was approved before deleting
              const wasApproved = session.status === 'approved';

              const { error } = await supabase
                .from('book_request')
                .delete()
                .eq('id', session.id);

              if (error) {
                console.error('Error deleting session:', error);
                Alert.alert('Error', 'Failed to delete session. Please try again.');
              } else {
                // If session was approved, free the slot
                if (wasApproved) {
                  const convertTimeFormat = (timeStr: string): string => {
                    const [time, period] = timeStr.split(' ');
                    let [hours, minutes] = time.split(':');
                    let hour = parseInt(hours);

                    if (period === 'PM' && hour !== 12) {
                      hour += 12;
                    } else if (period === 'AM' && hour === 12) {
                      hour = 0;
                    }

                    return `${hour.toString().padStart(2, '0')}:${minutes}:00`;
                  };

                  const startTime = convertTimeFormat(session.session_time);

                  await supabase
                    .from('expert_schedule')
                    .update({
                      is_available: true,
                      booked_by: null
                    })
                    .eq('expert_registration_number', session.expert_registration_number)
                    .eq('date', session.session_date)
                    .eq('start_time', startTime);
                }

                Alert.alert('Success', 'Session request deleted and slot freed.');
                await loadSessionRequests();
              }
            } catch (err) {
              console.error('Error:', err);
              Alert.alert('Error', 'An error occurred. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FFA500';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#F44336';
      default: return '#999';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'approved': return '✅';
      case 'rejected': return '❌';
      default: return '📋';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not specified';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const handleChatWithStudent = (session: SessionRequest) => {
    router.push({
      pathname: '/expert/expert-chat',
      params: { studentId: session.student_id}
    });
  };

  const renderSessionCard = (session: SessionRequest, index: number) => (
    <View key={`session-${session.id}-${index}`} style={styles.sessionCard}>
      {/* Status Badge and Chat Button */}
      <View style={styles.sessionHeader}>
        <View style={[styles.sessionStatusBadge, { backgroundColor: getStatusColor(session.status) + '20' }]}>
          <Text style={styles.sessionStatusIcon}>{getStatusIcon(session.status)}</Text>
          <Text style={[styles.sessionStatusText, { color: getStatusColor(session.status) }]}>
            {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.chatIconButton}
          onPress={() => handleChatWithStudent(session)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Student Information */}
      <View style={styles.studentSection}>
        <Text style={styles.sectionLabel}>Student Details</Text>
        <View style={styles.studentInfo}>
          <View style={styles.infoRow}>
            <Ionicons name="person" size={18} color={Colors.primary} />
            <Text style={styles.studentName}>{session.student_name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="card-outline" size={18} color="#666" />
            <Text style={styles.infoText}>ID: {session.student_registration_number}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="book-outline" size={18} color="#666" />
            <Text style={styles.infoText}>{session.student_course}</Text>
          </View>
          {session.student_email && (
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={18} color="#666" />
              <Text style={styles.infoText}>{session.student_email}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Session Details */}
      <View style={styles.sessionSection}>
        <Text style={styles.sectionLabel}>Session Details</Text>
        <View style={styles.sessionDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📅</Text>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate(session.session_date)}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>⏰</Text>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{session.session_time || 'Not specified'}</Text>
            </View>
          </View>
          {session.booking_mode && (
            <View style={styles.detailRow}>
              <Text style={styles.detailIcon}>{session.booking_mode === 'online' ? '🌐' : '🏢'}</Text>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Mode</Text>
                <Text style={styles.detailValue}>
                  {session.booking_mode === 'online' ? 'Online Session' : 'Offline Session'}
                </Text>
              </View>
            </View>
          )}
          {session.notes && (
            <View style={styles.detailRow}>
              <Text style={styles.detailIcon}>📝</Text>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Notes</Text>
                <Text style={styles.detailValue}>{session.notes}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Request Info */}
      <View style={styles.requestInfo}>
        <Text style={styles.requestedAt}>
          Last Updated: {formatDate(session.updated_at)}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {session.status === 'pending' && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.confirmButton]}
              onPress={() => handleConfirm(session)}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleReject(session)}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Reject</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(session)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Session Requests</Text>
          <Text style={styles.headerSubtitle}>
            {(searchQuery ? filteredSessions.length : sessionRequests.length)} request{(searchQuery ? filteredSessions.length : sessionRequests.length) !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshButton}
        >
          <Ionicons name="refresh-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by student name, ID, or status..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')} style={styles.clearButton}>
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Session Requests List */}
        <View style={styles.clientsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{searchQuery ? 'Search Results' : 'All Session Requests'}</Text>
            <View style={styles.clientCount}>
              <Text style={styles.clientCountText}>{searchQuery ? filteredSessions.length : sessionRequests.length}</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading session requests...</Text>
            </View>
          ) : sessionRequests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={80} color="#ccc" />
              <Text style={styles.emptyTitle}>No Session Requests</Text>
              <Text style={styles.emptyText}>
                Student session requests will appear here.{'\n'}
                Pull down to refresh the list.
              </Text>
            </View>
          ) : (filteredSessions.length === 0 && !!searchQuery) ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={80} color="#ccc" />
              <Text style={styles.emptyTitle}>No Results Found</Text>
              <Text style={styles.emptyText}>
                No session requests match your search for "{searchQuery}".{'\n'}
                Try searching by student name, ID, or status.
              </Text>
            </View>
          ) : (
            filteredSessions.map((session, index) => renderSessionCard(session, index))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#e0e0e0',
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  searchContainer: {
    marginBottom: 20,
  },
  searchBar: {
    backgroundColor: '#fff',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 0,
  },
  clearButton: {
    padding: 5,
    marginLeft: 10,
  },
  clientsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  clientCount: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  clientCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 15,
    marginVertical: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 15,
    marginVertical: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#999',
    marginTop: 15,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  patientCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
  },
  patientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  patientNameSection: {
    flex: 1,
  },
  patientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 2,
  },
  patientId: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  patientInfo: {
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  patientDetail: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  chatButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  tabBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
  },
  sessionHeader: {
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  chatIconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.accentLight || '#f0f0f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sessionStatusIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  sessionStatusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sessionStudentInfo: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sessionStudentName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  sessionStudentReg: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  sessionStudentCourse: {
    fontSize: 14,
    color: '#666',
  },
  sessionDetails: {
    marginBottom: 10,
  },
  sessionDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionDetailIcon: {
    fontSize: 16,
    marginRight: 8,
    width: 24,
  },
  sessionDetailText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  sessionFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  sessionRequestedAt: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  studentSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sessionSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  studentInfo: {
    gap: 10,
  },
  studentName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
    flex: 1,
  },
  infoText: {
    fontSize: 15,
    color: '#666',
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailIcon: {
    fontSize: 20,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  requestInfo: {
    marginBottom: 16,
  },
  requestedAt: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  deleteButton: {
    backgroundColor: '#9E9E9E',
  },
  disabledButton: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});